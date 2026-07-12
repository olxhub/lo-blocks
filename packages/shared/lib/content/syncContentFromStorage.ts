// packages/shared/lib/content/syncContentFromStorage.ts
//
// Content synchronization — the in-memory OLX index as a MEMOIZATION of storage.
//
// getContent() is, in the common case, a token check that returns the retained
// snapshot untouched. Nothing is scanned, diffed, or re-parsed unless a source's
// cheap generationToken() moved. When one does, the sync:
//
//   1. re-enumerates every source (listContent → {id, type, bytes}) and folds
//      them into one ordered world (first source wins on a shared ref);
//   2. rebuilds the snapshot from that world — each OLX file goes through the
//      parse cache (keyed on its bytes + namespace), so an unchanged file is a
//      cache read, not a re-parse;
//   3. bumps the content generation so anything derived from content rebuilds.
//
// There is no added/changed/unchanged/deleted diff and no previous-snapshot
// threading. Staleness is decided in two places, both content-addressed:
//   - the file's own bytes → the parse-cache key;
//   - the auxiliary files it depends on (parseDeps) and its namespace → a
//     per-file freshness check (depsCurrent) + the namespace component of the
//     cache key. An aux edit changes that dep's version in the world; a manifest
//     edit that changes a namespace changes the cache key. Either re-parses.
//
// The snapshot exposes two indexes:
//   - parsedFiles: file ref  -> block IDs parsed from it (+ its bytes/type)
//   - blockIndex:  block ID   -> language variant map (the idMap)

import { StorageProvider, fileTypes } from '@/lib/lofs';
import { readableProviders } from '@/lib/lofs/contentSources';
import { namespaceForAcross } from '@/lib/lofs/sourceSet';
import { chainResolvers } from '@/lib/lofs/chainResolvers';
import { isContentFile } from '@/lib/util/fileTypes';
import type { LofsRef, LofsCanonical, LofsOrigin, OLXLoadingError, OlxJson, IdMap, DefinitionKey, ContentVariant, VariantMap } from '@/lib/types';
import type { ContentFile } from '@/lib/types/storage';
import { withoutVersion, source } from '@/lib/types/address';
import { variantMapEntries } from '@/lib/types/i18n';
import { toAppError } from '@/lib/types/errors';
import { parseOLX, isAcceptableDuplicate } from '@/lib/content/parseOLX';
import { cachedParse } from '@/lib/content/parseCache';
import { copyAssetsToPublic } from '@/lib/content/staticAssetSync';
import { bumpContentGeneration } from '@/lib/content/generation';
import { FileType } from '@/lib/lofs/fileTypes';

// =============================================================================
// Types
// =============================================================================

/** A parsed file's entry in the parsedFiles index. */
interface ParsedFileEntry {
  id: LofsCanonical;
  type: FileType;
  content: string;
  blockIds: DefinitionKey[];
  /** Parse errors from this file (persist until the file is re-parsed or gone). */
  errors: OLXLoadingError[];
}

export interface ContentSnapshot {
  readonly parsedFiles: Record<LofsRef, ParsedFileEntry>;
  readonly blockIndex: Record<DefinitionKey, VariantMap>;
}

export const EMPTY_SNAPSHOT: ContentSnapshot = {
  parsedFiles: {},
  blockIndex: {},
};

/** Collect all errors from all parsed files in the snapshot. */
function collectSnapshotErrors(snapshot: ContentSnapshot): OLXLoadingError[] {
  const errors: OLXLoadingError[] = [];
  for (const entry of Object.values(snapshot.parsedFiles)) {
    if (entry.errors.length > 0) {
      errors.push(...entry.errors);
    }
  }
  return errors;
}

// =============================================================================
// Module State
// =============================================================================

let _snapshot: ContentSnapshot = EMPTY_SNAPSHOT;

// The world the retained snapshot was built from, and the provider list used to
// resolve it. An explicit-provider sync overlays its source's slice onto this
// and rebuilds; a union sync replaces it wholesale.
let _world: ContentFile[] = [];
let _providers: StorageProvider[] = [];

// Per-source generation tokens from the last DEFAULT (union) sync, in the
// provider list's order. The fast path compares freshly-gathered tokens against
// these: all equal → nothing changed → return the snapshot without enumerating.
// Only the default union sync reads/writes this. An explicit-provider sync
// (scripts, translate, tests) leaves it untouched — its write lands on
// disk/git, so the next union sync notices it via that source's token.
let _unionTokens: string[] | null = null;

// =============================================================================
// Query Functions (read from _snapshot)
// =============================================================================

/**
 * The current in-memory content id map (the block index), read WITHOUT
 * triggering a sync. The generation-memoised routing indexes
 * (partitions/aggregations/fieldLevels) build from this: a sync updates the
 * snapshot and bumps the content generation, and the memo rebuilds on next use.
 */
export function currentContentIdMap(): Record<DefinitionKey, VariantMap> {
  return { ..._snapshot.blockIndex };
}

/**
 * Find the source OLX file for a block in a given locale.
 *
 * Returns the block's `source` field (the OLX file it was parsed from),
 * stripped of its version tag.
 */
export function getSourceFile(blockId: DefinitionKey, locale: ContentVariant): LofsRef | null {
  const variantMap = _snapshot.blockIndex[blockId];
  if (!variantMap?.[locale]?.source) return null;

  return withoutVersion(variantMap[locale].source);
}

export function getBlockVariant(blockId: DefinitionKey, locale: ContentVariant): OlxJson | null {
  const variantMap = _snapshot.blockIndex[blockId];
  return variantMap?.[locale] || null;
}

/** Return the first human-authored (non-generated) variant for a block. */
export function getOriginalVariant(blockId: DefinitionKey): OlxJson | null {
  const variantMap = _snapshot.blockIndex[blockId];
  if (!variantMap) return null;
  for (const olxJson of Object.values(variantMap)) {
    if (!olxJson.generated) return olxJson;
  }
  return null;
}

/**
 * Return the full variant map for every block parsed from the given file(s).
 *
 * Accepts multiple URIs to cover both source and translated files - they
 * have different auto-generated child IDs, and the client needs both sets
 * so that whichever variant extractLocalizedVariant picks, its children
 * are available.
 */
export function getBlocksForFiles(...fileUris: LofsRef[]): Record<DefinitionKey, VariantMap> {
  const result: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
  for (const fileUri of fileUris) {
    const entry = _snapshot.parsedFiles[fileUri];
    if (!entry) continue;
    for (const blockId of entry.blockIds) {
      if (_snapshot.blockIndex[blockId]) {
        result[blockId] = _snapshot.blockIndex[blockId];
      }
    }
  }
  return result;
}

// =============================================================================
// Internal Helpers
// =============================================================================

function* entriesIdMap(idMap: IdMap): Generator<[DefinitionKey, IdMap[DefinitionKey]]> {
  for (const [id, variants] of Object.entries(idMap)) {
    yield [id as DefinitionKey, variants];
  }
}

function* entriesVariantMap(variantMap: IdMap[DefinitionKey]): Generator<[ContentVariant, OlxJson]> {
  yield* variantMapEntries(variantMap);
}

/** A source's address origin, or null for a provider that doesn't carry one
 *  (a resolver chain, an MCP face — never a real sync source). */
function originOf(provider: StorageProvider): LofsOrigin | null {
  return (provider as { origin?: LofsOrigin }).origin ?? null;
}

function isOlx(type: FileType): boolean {
  return type === fileTypes.olx || type === fileTypes.xml;
}

// =============================================================================
// Enumeration → world
// =============================================================================

/**
 * Enumerate every source and concatenate their files in priority order (the
 * provider list's order). Deduplication (first source wins on a shared ref) is
 * deferred to buildSnapshot. A source that can't enumerate (down remote,
 * unsupported) drops out — logged, so its content doesn't vanish silently.
 */
async function assembleWorld(providers: StorageProvider[]): Promise<ContentFile[]> {
  const files: ContentFile[] = [];
  for (const provider of providers) {
    try {
      files.push(...await provider.listContent());
    } catch (err) {
      console.error(`[content] source enumeration failed, dropping its content: ${(err as Error).message}`);
    }
  }
  return files;
}

// =============================================================================
// Dependency freshness
// =============================================================================

/**
 * Is a cached parse still valid against the current world? A parse pulls in
 * auxiliary files (a .chatpeg grammar, a src="…" include) and records each as a
 * versioned parseDep. The cached parse is stale if any content-file dependency's
 * version no longer matches the world's — it changed — or the dependency is gone
 * — it was deleted. Non-content deps (media assets, resolved to a placeholder
 * version) are never enumerated and never triggered a re-parse under the old
 * scan, so they're ignored here too.
 */
function depsCurrent(
  result: { idMap: IdMap },
  worldIds: Map<string, LofsCanonical>,
): boolean {
  for (const variants of Object.values(result.idMap)) {
    for (const olxJson of Object.values(variants) as OlxJson[]) {
      for (const dep of olxJson.parseDeps ?? []) {
        const depRef = String(withoutVersion(dep));
        const current = worldIds.get(depRef);
        if (current === undefined) {
          // Absent from the world: a content-file dep was deleted → stale.
          // A media/placeholder dep is never enumerated → ignore.
          if (isContentFile(depRef)) return false;
          continue;
        }
        if (String(current) !== String(dep)) return false; // version moved
      }
    }
  }
  return true;
}

// =============================================================================
// Core: build a snapshot from a world of files
// =============================================================================

/**
 * Parse every OLX file in `world` (through the parse cache) and index its
 * blocks, resolving namespaces and src="" references across `providers`
 * (first-source-wins). Files are processed in priority order; the first file to
 * claim a ref wins, so a higher-priority source shadows a lower one.
 */
async function buildSnapshot(
  world: ContentFile[],
  providers: StorageProvider[],
): Promise<ContentSnapshot> {
  // The current version of every ref in the world, for dependency validation.
  // First occurrence wins, matching the priority dedup below.
  const worldIds = new Map<string, LofsCanonical>();
  for (const file of world) {
    const ref = String(withoutVersion(file.id));
    if (!worldIds.has(ref)) worldIds.set(ref, file.id);
  }
  const isFresh = (cached: Awaited<ReturnType<typeof parseOLX>>) => depsCurrent(cached, worldIds);

  // src="" / cast="" references during parse resolve first-source-wins across
  // the union (a file in one source may reference an asset in another).
  const resolver = chainResolvers(providers);

  const parsedFiles: Record<LofsRef, ParsedFileEntry> = {} as Record<LofsRef, ParsedFileEntry>;
  const blockIndex: Record<DefinitionKey, VariantMap> = {} as Record<DefinitionKey, VariantMap>;
  const seen = new Set<string>();

  for (const file of world) {
    const ref = withoutVersion(file.id);
    const refStr = String(ref);
    if (seen.has(refStr)) continue; // priority dedup: first source wins
    seen.add(refStr);

    // Non-OLX files (auxiliary files like .chatpeg) are tracked so their
    // versions are visible to dependency validation, but not parsed for blocks.
    if (!isOlx(file.type)) {
      parsedFiles[ref] = { id: file.id, type: file.type, content: file.content, blockIds: [], errors: [] };
      continue;
    }

    try {
      // The owning source resolves the namespace (manifest override, then a
      // provider-specific fallback like the top-level directory). A file with
      // no resolvable namespace throws here and becomes a file_error.
      const { ns, manifest } = await namespaceForAcross(providers, file.id);
      // Parse output is a pure function of (bytes, ns, ref, parser build); the
      // cache keys on exactly those. A cache hit whose recorded parseDeps moved
      // is rejected by isFresh and re-parsed. Manifest provenance is stamped
      // below, OUTSIDE the cache, since parseOLX does not read it.
      const parseResult = await cachedParse(
        { ns, provenanceRef: String(file.id), content: file.content },
        () => parseOLX(file.content, [ref], resolver, ns),
        isFresh,
      );
      const fileErrors: OLXLoadingError[] = parseResult.errors ?? [];

      // Namespace provenance: record which manifest declared this content's
      // namespace. Stamped here, not in parseOLX — only the provider knows it.
      if (manifest) {
        for (const variants of Object.values(parseResult.idMap)) {
          for (const olxJson of Object.values(variants) as OlxJson[]) {
            olxJson.manifest = manifest;
          }
        }
      }

      // Index into the (empty-at-start) blockIndex directly, in file order, so
      // duplicate/collision detection sees earlier files as "existing".
      indexParsedBlocks(parseResult.idMap, blockIndex, file.id, fileErrors);

      parsedFiles[ref] = {
        id: file.id,
        type: file.type,
        content: file.content,
        blockIds: parseResult.ids,
        errors: fileErrors,
      };
    } catch (fatalError: any) {
      console.error(`\n❌ DETAILED ERROR for ${refStr}:`);
      console.error('Message:', fatalError.message);
      console.error('Stack trace:', fatalError.stack);

      parsedFiles[ref] = {
        id: file.id,
        type: file.type,
        content: file.content,
        blockIds: [],
        errors: [{
          type: 'file_error',
          title: `${refStr} could not be loaded`,
          message: `Failed to parse file: ${fatalError.message}`,
          location: { provenance: [file.id] },
          technical: toAppError(fatalError),
          stack: fatalError.stack,
        }],
      };
    }
  }

  return { parsedFiles, blockIndex };
}

// =============================================================================
// Entry Points
// =============================================================================

/**
 * Sync content into the module snapshot.
 *
 * With no argument, spans the deployment's default content union — every
 * configured source (content-sources.yaml) plus block documentation examples
 * (per-block docs.* namespaces), as an ordered provider list
 * (contentSources.readableProviders). Docs is in the union so the whole system
 * content index is one sync — what lets courses embed documentation via
 * `<Use ref="docs.ActionButton/..."/>`.
 *
 * A caller may pass a single provider (scripts, translate, tests) to sync just
 * that source. It ALWAYS re-enumerates that source (no token fast-path — the
 * caller just wrote and wants the result now) and overlays it onto the retained
 * world, so its content joins the union snapshot the query functions read.
 */
export async function syncContentFromStorage(
  provider?: StorageProvider
) {
  if (provider) return syncExplicit(provider);
  return syncContentUnion(await readableProviders());
}

/**
 * Tokened sync over a provider UNION (the default content union, or a
 * caller-supplied set for tests). Gathers each source's cheap generationToken;
 * if every token matches the previous union sync, returns the retained snapshot
 * WITHOUT enumerating. Otherwise it re-enumerates the whole union, rebuilds the
 * snapshot, and remembers the new tokens.
 *
 * The public no-arg entry point is `syncContentUnion(await readableProviders())`.
 */
export async function syncContentUnion(providers: StorageProvider[]) {
  const tokens = await Promise.all(providers.map(p => p.generationToken()));

  // Fast path: same source set, every token unchanged → nothing to do.
  if (_unionTokens && sameTokens(_unionTokens, tokens)) {
    return currentResult();
  }

  _world = await assembleWorld(providers);
  _providers = providers;
  _snapshot = await buildSnapshot(_world, _providers);
  _unionTokens = tokens;

  bumpContentGeneration();
  // Static assets: re-copy on content change (interim, until assets serve
  // from the store). A union rebuild only happens when a token moved.
  await copyAssetsToPublic(providers);
  return currentResult();
}

/**
 * Explicit single-source sync: always re-enumerate `provider`, replace its slice
 * of the retained world (so deletions within it drop out), rebuild, and publish.
 * Resolves across the retained union providers plus this one, so a file here can
 * still reference a sibling source's asset.
 */
async function syncExplicit(provider: StorageProvider) {
  const files = await provider.listContent();
  const origin = originOf(provider);

  // Replace this source's slice of the world (by origin), keep everyone else's,
  // and put the fresh slice first so it wins any ref collision.
  const rest = origin
    ? _world.filter(f => String(source(f.id)) !== String(origin))
    : _world;
  _world = [...files, ...rest];
  _providers = mergeProviders(provider, _providers);
  _snapshot = await buildSnapshot(_world, _providers);

  bumpContentGeneration();
  await copyAssetsToPublic([provider]);
  return currentResult();
}

/** Dedupe a provider list by origin (first wins), with `head` in front. */
function mergeProviders(head: StorageProvider, tail: StorageProvider[]): StorageProvider[] {
  const seen = new Set<string>();
  const out: StorageProvider[] = [];
  for (const p of [head, ...tail]) {
    const o = originOf(p);
    const key = o ? String(o) : null;
    if (key !== null && seen.has(key)) continue;
    if (key !== null) seen.add(key);
    out.push(p);
  }
  return out;
}

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function currentResult() {
  return {
    parsed: { ..._snapshot.parsedFiles },
    idMap: { ..._snapshot.blockIndex },
    errors: collectSnapshotErrors(_snapshot),
  };
}

// =============================================================================
// Indexing
// =============================================================================

/**
 * Merge parsed blocks into the block index, merging language variants.
 *
 * Same block ID across files is allowed if they have different languages.
 * Duplicate error only if: same ID + same language in different files,
 * UNLESS the block is stateless (requiresUniqueId: false) and content-identical.
 *
 * Mutates blockIndex (caller provides a working copy).
 */
function indexParsedBlocks(
  newBlocks: IdMap,
  blockIndex: Record<DefinitionKey, VariantMap>,
  sourceFile: LofsCanonical,
  errors: OLXLoadingError[]
): void {
  for (const [blockId, newVariantMap] of entriesIdMap(newBlocks)) {
    const existingBlock = blockIndex[blockId];

    if (!existingBlock) {
      blockIndex[blockId] = newVariantMap;
      continue;
    }

    for (const [lang, newOlxJson] of entriesVariantMap(newVariantMap)) {
      if (existingBlock[lang]) {
        if (isAcceptableDuplicate(existingBlock[lang], newOlxJson)) {
          continue;  // Identical stateless block across files
        }
        // Two blocks claim the same identity. If they come from different
        // sources, it's a collision between independently-authored courses
        // (the "two psych courses both define memphis/operant" case) — a
        // different problem, with different advice, than an in-source dup.
        const existingOrigin = source(existingBlock[lang].source);
        const newOrigin = source(newOlxJson.source);
        errors.push(existingOrigin === newOrigin
          ? createDuplicateIdError(blockId, existingBlock[lang], newOlxJson, sourceFile)
          : createSourceCollisionError(blockId, existingBlock[lang], existingOrigin, newOrigin));
        continue;  // Keep the first one
      }

      // New language for this ID - merge it in
      existingBlock[lang] = newOlxJson;
    }
  }
}

/**
 * Two different sources both define the same identity. Unlike an in-source
 * duplicate, the fix isn't "rename your IDs" — it's that two independently
 * authored courses can't both mount the same namespace at once. The compiler
 * keeps the first and reports the clash so the author can subscribe to one or
 * give them distinct namespaces.
 */
function createSourceCollisionError(
  blockId: DefinitionKey,
  existingBlock: OlxJson,
  existingOrigin: LofsOrigin,
  newOrigin: LofsOrigin,
): OLXLoadingError {
  return {
    type: 'source_collision',
    title: `"${blockId}" defined by two sources`,
    location: { provenance: [existingBlock.source] },
    message: `"${blockId}" is defined by two different sources:

   ${existingOrigin}  (kept)
   ${newOrigin}  (ignored)

These look like independently authored courses claiming the same identity. \
They can't both mount here. Subscribe to one, or give them distinct namespaces.`,
    technical: { blockId, existingOrigin, newOrigin },
  };
}

function createDuplicateIdError(
  blockId: DefinitionKey,
  existingBlock: OlxJson,
  duplicateBlock: OlxJson,
  sourceFile: LofsCanonical
): OLXLoadingError {
  // TODO: We'd love to print line/column, but OlxJson only carries
  // _sourceOffset (byte offset) which needs the original XML to convert.
  // See the OPEN QUESTION on _sourceOffset in lib/types/core.ts.
  const existingFile = existingBlock.source ?? 'unknown';
  const existingOffset = existingBlock._sourceOffset ?? '?';
  const duplicateOffset = duplicateBlock._sourceOffset ?? '?';
  return {
    type: 'duplicate_id',
    title: `Duplicate ID "${blockId}" in ${sourceFile}`,
    location: { provenance: [sourceFile] },
    message: `Duplicate ID "${blockId}" found in ${sourceFile} (conflicts with entry from another file)

🔍 EXISTING ENTRY (from different file):
   File: ${existingFile}
   Byte offset: ${existingOffset}
   Tag: <${existingBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(existingBlock.attributes || {}, null, 2)}
   Content: ${existingBlock.kids ?? 'N/A'}

🔍 DUPLICATE ENTRY (in current file ${sourceFile}):
   Byte offset: ${duplicateOffset}
   Tag: <${duplicateBlock.tag || 'unknown'}>
   Attributes: ${JSON.stringify(duplicateBlock.attributes || {}, null, 2)}
   Content: ${duplicateBlock.kids ?? 'N/A'}

💡 TIP: IDs must be unique across ALL files in the project. Use different id attributes or prefixes for each file.`,
    technical: {
      duplicateId: blockId,
      existingEntry: existingBlock,
      duplicateEntry: duplicateBlock
    }
  };
}
