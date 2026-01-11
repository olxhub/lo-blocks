// src/lib/blocks/dynamicLoader.ts
//
// Dynamic block loading utilities.
// Compiles and loads blocks at runtime, registering them for use in content.
//
import { BLOCK_REGISTRY } from '@/components/blockRegistry';
import * as runtime from './runtime';
import type { LoBlock } from '@/lib/types';

interface LoadedBlock {
  block: LoBlock;
  url: string;
  version: number;
  loadedAt: Date;
}

interface CompileResult {
  ok: boolean;
  url?: string;
  version?: number;
  name?: string;
  size?: number;
  error?: string;
  details?: any[];
}

// Track loaded dynamic blocks
const loadedBlocks = new Map<string, LoadedBlock>();

// Track if runtime is initialized
let runtimeInitialized = false;

/**
 * Initialize the global runtime for dynamic blocks.
 * Must be called before loading any dynamic blocks.
 */
export function initBlockRuntime(): void {
  if (runtimeInitialized) return;

  // Expose runtime on globalThis for dynamic blocks to access
  (globalThis as any).__LO_BLOCKS_RUNTIME__ = runtime;
  runtimeInitialized = true;
  console.log('[DynamicLoader] Runtime initialized');
}

/**
 * Compile block source files into a loadable bundle.
 *
 * @param name - Block name (e.g., 'HelloBlock')
 * @param sources - Map of filename → source content
 * @returns Compilation result with URL to load
 */
export async function compileBlock(
  name: string,
  sources: Record<string, string>
): Promise<CompileResult> {
  const response = await fetch('/api/blocks/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, sources }),
  });

  return response.json();
}

/**
 * Load a compiled block from URL and register it.
 *
 * @param url - URL to the compiled block bundle
 * @returns The loaded LoBlock
 */
export async function loadDynamicBlock(url: string): Promise<LoBlock> {
  // Dynamic import - webpackIgnore tells webpack to leave this alone
  const module = await import(/* webpackIgnore: true */ url);
  const block = module.default;

  if (!block?._isBlock) {
    throw new Error(`Module at ${url} is not a valid LoBlock (missing _isBlock flag)`);
  }

  // Register in global registry
  const name = block.OLXName || block.name;
  BLOCK_REGISTRY[name] = block;

  // Track for debugging
  loadedBlocks.set(name, {
    block,
    url,
    version: Date.now(),
    loadedAt: new Date(),
  });

  console.log(`[DynamicLoader] Registered block: ${name}`);
  return block;
}

/**
 * Compile and load a block in one step.
 *
 * @param name - Block name
 * @param sources - Source files
 * @returns The loaded LoBlock
 */
export async function compileAndLoadBlock(
  name: string,
  sources: Record<string, string>
): Promise<LoBlock> {
  // Compile
  const result = await compileBlock(name, sources);
  if (!result.ok) {
    throw new Error(`Compilation failed: ${result.error}`);
  }

  // Load
  return loadDynamicBlock(result.url!);
}

/**
 * Hot-reload a block with new source.
 * The next render will pick up the new version automatically.
 *
 * @param name - Block name to reload
 * @param sources - New source files
 * @returns The new LoBlock
 */
export async function reloadBlock(
  name: string,
  sources: Record<string, string>
): Promise<LoBlock> {
  console.log(`[DynamicLoader] Reloading block: ${name}`);
  return compileAndLoadBlock(name, sources);
}

/**
 * Get information about loaded dynamic blocks.
 */
export function getLoadedBlocks(): Map<string, LoadedBlock> {
  return new Map(loadedBlocks);
}

/**
 * Check if a block is dynamically loaded.
 */
export function isDynamicBlock(name: string): boolean {
  return loadedBlocks.has(name);
}
