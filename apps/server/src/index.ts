#!/usr/bin/env npx tsx
// apps/server/src/index.ts
//
// Startup orchestrator for the Learning Opus server.
// Each step delegates to its own module; this file is the sequence.

import fs from 'fs';
import { loadServerConfig, resolveConfig } from '@/lib/config';
import { MemoryKVStore, type KVStore } from '@/lib/storage/kvs';
import { FileKVStore } from '@/lib/storage/kvs/file';
import { PostgresKVStore } from '@/lib/storage/kvs/pg';
import { ValkeyKVStore } from '@/lib/storage/kvs/valkey';
import { PrefixedKVStore } from '@/lib/storage/kvs/prefixed';
import { startServer, type ServerHandle } from './server.js';
import { startBoot } from './boot.js';
import { shutdownMcp } from './mcp.js';
import { createToolRegistry } from '@/lib/mcp/registry';
import { registerDocsTools } from '@/lib/docs/tools';
import { registerCatalogTools } from '@/lib/catalog/tool';
import { registerLofsTools } from '@/lib/storage/lofs/tools';
import {
  validateProviderConfig,
  availableProviders,
} from '@/lib/llm/provider';
import { resolveLLMConfig } from '@/lib/llm/profiles';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';

// =============================================================================
// Startup steps
// =============================================================================

/** 1. Load configuration with all class sources. */
async function loadConfig() {
  const classes = loadServerConfig(fs.readFileSync);
  console.log(`  Config: [${classes.join(', ')}]`);
}

/** 2. Validate LLM provider from PMSS resolution. */
function validateLLMProvider() {
  const config = resolveLLMConfig('interactive');
  const { provider } = config;

  // Check credentials for the selected provider
  const { ok, issues } = validateProviderConfig(provider);
  if (!ok) {
    // Try to fall back to any available provider
    const available = availableProviders();
    const fallback = available.find(p => p !== 'stub' && p !== provider);
    if (fallback) {
      console.warn(`\n  Warning: PMSS selected provider "${provider}" but credentials are incomplete:`);
      issues.forEach(issue => console.warn(`    - ${issue}`));
      console.warn(`  Falling back to "${fallback}" (has credentials).`);
      console.warn(`  To fix: configure credentials for "${provider}" or set llm-provider in config/local.pmss.\n`);
    } else if (provider !== 'stub') {
      console.error(`\n  LLM configuration issues (provider: ${provider}):`);
      issues.forEach(issue => console.error(`    - ${issue}`));
      console.error(`\n  See docs/llm-setup.md for configuration options.\n`);
      process.exit(1);
    }
  }

  if (provider === 'stub') {
    console.log(`\n  Warning: LLM running in STUB mode — responses are fake.`);
    console.log(`  To configure a real provider, set credentials in env vars`);
    console.log(`  or override in config/local.pmss. See docs/llm-setup.md.\n`);
  } else {
    console.log(`  LLM provider: ${provider}${config.model ? ` (model: ${config.model})` : ''}`);
  }
}

/** 3. Initialize storage backend (config-driven). */
async function initStorage(): Promise<KVStore> {
  const backend = process.env.KVS_BACKEND || resolveConfig({}, 'kvs-backend') || 'file';
  const prefix  = process.env.KVS_PREFIX  || resolveConfig({}, 'kvs-prefix')  || '';
  const isProd  = process.env.NODE_ENV === 'production';

  // In production, require an explicit prefix to prevent accidental
  // collisions between deploys sharing a backend. Set KVS_PREFIX env var
  // or kvs-prefix in config/local.pmss.
  if (isProd && (!prefix || prefix === 'dev-local')) {
    console.error('\n  KVS prefix not configured for production.');
    console.error('  Set KVS_PREFIX in your environment or kvs-prefix in config/local.pmss.');
    console.error('  Example:  KVS_PREFIX=psych-pilot');
    console.error('  Example:  .server { kvs-prefix: psych-pilot; }\n');
    process.exit(1);
  }

  let store: KVStore;
  switch (backend) {
    case 'file':
      store = new FileKVStore(process.env.KVS_PATH);
      break;
    case 'postgres':
      store = new PostgresKVStore(process.env.KVS_URL);
      break;
    case 'valkey':
      store = new ValkeyKVStore(process.env.KVS_URL);
      break;
    case 'memory':
      store = new MemoryKVStore();
      break;
    default:
      throw new Error(`Unknown KVS backend: "${backend}". Expected file, postgres, valkey, or memory.`);
  }

  if (prefix) {
    store = new PrefixedKVStore(store, prefix);
    console.log(`  Storage: ${backend} (prefix: ${prefix})`);
  } else {
    console.log(`  Storage: ${backend}`);
  }

  await store.ready;
  return store;
}

/** 4. Initialize tool registry. */
async function initTools() {
  const registry = createToolRegistry();
  registerDocsTools(registry);
  registerCatalogTools(registry);
  registerLofsTools(registry);
  console.log('  Tools: docs, catalog, lofs');
  return registry;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Learning Opus server starting...');

  // Bind the port FIRST: a boot page owns the window (a live task
  // checklist at / and JSON at /boot-status) until every task below is
  // done — no "connection refused" during cold start, and no partially-
  // initialized states: the app handler only exists once everything does.
  const port = Number(process.env.PORT ?? 8888);
  const boot = await startBoot(port);

  let kvs, registry, handle;
  try {
    await boot.task('Load configuration', loadConfig);
    await boot.task('Validate LLM provider', () => validateLLMProvider());
    await boot.task('Sync content (clone, scan, parse)', async () => {
      const { idMap } = await syncContentFromStorage();
      console.log(`  Content: ${Object.keys(idMap).length} definitions loaded`);
    });
    kvs = await boot.task('Initialize storage', initStorage);
    registry = await boot.task('Register MCP tools', initTools);
    // startServer calls boot.handoff() itself, synchronously adjacent to the
    // request-handler attach — the swap must be atomic (see server.ts).
    handle = await boot.task('Start server (vite, websockets, routes)',
      () => startServer(kvs, registry, boot));
  } catch {
    // The failed task is already marked ✗ on the boot page and its error
    // printed by boot.task — don't repeat it. Stay up serving the page —
    // a console error scrolls away, but / showing exactly which task
    // failed and why does not. Ctrl+C to stop.
    console.error('\nStartup halted. Boot status page left running at /  — fix the config and restart.\n');
    return;
  }

  console.log('\nReady. Press Ctrl+C to stop.\n');

  // --- Graceful shutdown ---------------------------------------------------
  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;   // a second Ctrl+C, or the admin route racing one
    shuttingDown = true;
    console.log('\nShutting down...');
    shutdownMcp();

    // 1. Stop accepting new connections
    handle.server.close();

    // 2. Close all active WebSockets. This causes each runPipeline to exit,
    //    which triggers the .finally() chain in server.ts that saves the
    //    event log and removes the connection from activeConnections.
    for (const ws of handle.activeConnections.keys()) {
      ws.close();
    }

    // 3. Wait for all pipelines to finish and event logs to flush to disk.
    //    Each pipeline's .finally() calls saveConnectionLog then deletes
    //    from activeConnections, so we poll until the map is empty.
    const TIMEOUT = 30_000;
    const start = Date.now();
    while (handle.activeConnections.size > 0) {
      if (Date.now() - start > TIMEOUT) {
        console.error(`Shutdown timeout: ${handle.activeConnections.size} connections did not close cleanly`);
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (kvs.close) await kvs.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
