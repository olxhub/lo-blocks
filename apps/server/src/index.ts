#!/usr/bin/env npx tsx
// apps/server/src/index.ts
//
// Startup orchestrator for the Learning Opus server.
// Each step delegates to its own module; this file is the sequence.

import fs from 'fs';
import { loadServerConfig } from '@/lib/config';
import { FileKVStore, type KVStore } from './kvs.js';
import { startServer, type ServerHandle } from './server.js';
import { saveConnectionLog } from './eventLog.js';
import { shutdownMcp } from './mcp.js';
import { createToolRegistry } from '@/lib/mcp/registry';
import { registerDocsTools } from '@/lib/docs/tools';
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

/** 3. Initialize storage backend. */
async function initStorage(): Promise<KVStore> {
  const kvs = new FileKVStore();
  console.log('  Storage: FileKVStore');
  return kvs;
}

/** 4. Initialize tool registry. */
async function initTools() {
  const registry = createToolRegistry();
  registerDocsTools(registry);
  // TODO: registerLofsTools(registry, storage);
  console.log('  Tools: docs');
  return registry;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('Learning Opus server starting...');

  await loadConfig();
  validateLLMProvider();
  const { idMap } = await syncContentFromStorage();
  console.log(`  Content: ${Object.keys(idMap).length} definitions loaded`);
  const kvs = await initStorage();
  const registry = await initTools();
  const handle = await startServer(kvs, registry);

  console.log('\nReady. Press Ctrl+C to stop.\n');

  // --- Graceful shutdown ---------------------------------------------------
  async function shutdown() {
    console.log('\nShutting down...');
    shutdownMcp();
    for (const conn of handle.activeConnections.values()) {
      saveConnectionLog(conn);
      console.log(`Saved ${conn.log.events.length} events to ${conn.path}`);
    }
    if (kvs.close) await kvs.close();
    handle.server.close();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
