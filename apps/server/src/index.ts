#!/usr/bin/env npx tsx
// apps/server/src/index.ts
//
// Startup orchestrator for the Learning Opus server.
// Each step delegates to its own module; this file is the sequence.

import { FileKVStore, type KVStore } from './kvs.js';
import { startServer, type ServerHandle } from './server.js';
import { saveConnectionLog } from './eventLog.js';
import { shutdownMcp } from './mcp.js';
import { createToolRegistry } from '@/lib/mcp/registry';
import { registerDocsTools } from '@/lib/docs/tools';

// =============================================================================
// Startup steps
// =============================================================================

/** 1. Load configuration. */
async function loadConfig() {
  // TODO: Read config/system.pmss at runtime, call initConfig().
  // Currently config is baked in at build time via config.generated.ts.
  console.log('  Config: loaded (build-time)');
}

/** 2. Initialize storage backend. */
async function initStorage(): Promise<KVStore> {
  const kvs = new FileKVStore();
  console.log('  Storage: FileKVStore');
  return kvs;
}

/** 3. Initialize tool registry. */
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
