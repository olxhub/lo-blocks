// packages/shared/lib/catalog/tool.ts
//
// get_repositories — the one-call author catalog. The new `/` renders from it,
// and an LLM uses the same tool. Mirrors the docs tools (get_blocks): a lean
// default, opt-in `include`, registered on the shared ToolRegistry.
//
// See docs/mcp-authoring.md (the protocol — one call, selectivity, anti-spam)
// and docs/courseware-model.md (roles / launchables = declarations).

import type { z } from 'zod';
import YAML from 'yaml';
import { sources, readProvider } from '@/lib/storage/lofs/contentSources';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { buildActivityCards, type ActivityCard } from '@/lib/content/buildActivityCards';
import { extractLocalizedVariant } from '@/lib/i18n/getBestVariant';
import { toOlxRelativePath, type StorageProvider } from '@/lib/types/storage';
import { toAppError, type AppError } from '@/lib/types/errors';
import type { ToolRegistry } from '@/lib/mcp/registry';
import {
  GetRepositoriesInput,
  GetRepositoriesOutput,
  LaunchableSchema,
  RepositorySchema,
} from '@/lib/catalog/schema';

// ===========================================================================
// Handler
// ===========================================================================

/** Pick the best title for a card, preferring English. TODO: pass the user's
 *  locale through the MCP request so we can respect Accept-Language. */
function pickTitle(card: ActivityCard): string {
  return extractLocalizedVariant(card.title, 'en') || card.id;
}

// Repo-level metadata follows GIT CONVENTIONS first — README.md (description),
// LICENSE, CONTRIBUTORS — and a small metadata YAML only for what conventions
// don't cover (discipline, tags, title override). NOT manifest.yaml — that's a
// *deployment* (routes → block IDs). Per-launchable metadata still comes from
// the <!-- --> header descriptor (lib/content/metadata.ts). Scanning only
// touches OLX + deps, so README.md isn't parsed as content.
// See docs/courseware-model.md. (YAML name PROVISIONAL.)
const REPO_METADATA_FILE = 'lo.yaml';

interface SourceDescriptor {
  title?: string;
  description?: string;
  discipline?: string;
  readme?: string;   // full README.md — for include: readme
  error?: AppError;  // source-level failure (auth, network, etc.)
}

/** Read one repo-root file via the provider; null if absent (a real I/O
 *  boundary — a repo need not have every convention file). */
async function readRepoFile(provider: StorageProvider, name: string): Promise<string | null> {
  try {
    return (await provider.read(toOlxRelativePath(name))).content;
  } catch {
    return null;
  }
}

/** First prose paragraph of a README — skip leading headings/blank lines. */
function firstParagraph(md: string): string {
  const out: string[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      if (out.length) break;   // blank/heading after prose ends the paragraph
      continue;                // …before prose: skip it
    }
    out.push(line);
  }
  return out.join(' ');
}

/** Compose the repo descriptor: git conventions first (README), layered with
 *  the metadata YAML for beyond-git fields.
 *
 *  The first provider call triggers ensureFresh() on git sources. If that
 *  fails (403, network), the error is captured as a source-level AppError
 *  on the descriptor rather than swallowed — so the catalog can surface it.
 *  File-not-found (a healthy repo without README.md) is normal and not an error. */
async function readSourceDescriptor(provider: StorageProvider): Promise<SourceDescriptor> {
  // Probe the source with a cheap call. listFiles triggers ensureFresh() on
  // git sources — if the remote is unreachable (403, network), it throws here.
  // This is separate from readRepoFile, which swallows ALL errors (including
  // source-level ones) because a missing file is normal.
  try {
    await provider.listFiles({ limit: 1 });
  } catch (err) {
    return { error: toAppError(err, { title: 'Source unavailable' }) };
  }

  const readme = await readRepoFile(provider, 'README.md');
  const metaRaw = await readRepoFile(provider, REPO_METADATA_FILE);

  // lo.yaml is optional per-repo metadata: a malformed one degrades this repo
  // to its README-derived fields (error surfaced on its card) rather than
  // rejecting the whole get_repositories call for every repo.
  let parsed: unknown = null;
  let metaError: AppError | undefined;
  try {
    parsed = metaRaw ? YAML.parse(metaRaw) : null;
  } catch (err) {
    metaError = toAppError(err, { title: `Malformed ${REPO_METADATA_FILE}` });
  }
  const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

  return {
    title: typeof meta.title === 'string' ? meta.title : undefined,
    description:
      typeof meta.description === 'string' ? meta.description
      : readme ? firstParagraph(readme)
      : undefined,
    discipline: typeof meta.discipline === 'string' ? meta.discipline : undefined,
    readme: readme ?? undefined,
    error: metaError,
  };
}

async function getRepositories(
  args: z.infer<typeof GetRepositoriesInput>,
): Promise<z.infer<typeof GetRepositoriesOutput>> {
  const includeSet = new Set(args.include ?? []);
  const includeDrafts = args.drafts === 'include';

  const repos = await sources();

  // First pass: derive launchables from the global compile. TODO: compile
  // per-source, lazily — this is the move that retires the `_snapshot`
  // singleton (syncContentFromStorage.ts) rather than depending on it.
  const { idMap } = await syncContentFromStorage();
  const { cards, warnings } = buildActivityCards(idMap);
  // TODO: Group warnings by editSource (origin) and surface them on each
  // repo's error field so they render as DisplayError on the repo card.
  // Currently dropped — a launchable="typo" block is silently skipped.
  if (warnings.length) {
    console.warn('buildActivityCards warnings:', warnings);
  }

  // Group cards by the origin they came from (their provenance source). The
  // launchable wire objects are built per-repo below, where that repo's
  // provider is in hand to derive each one's forge link.
  const cardsByOrigin = new Map<string, ActivityCard[]>();
  for (const card of Object.values(cards)) {
    const list = cardsByOrigin.get(card.editSource) ?? [];
    list.push(card);
    cardsByOrigin.set(card.editSource, list);
  }
  // TODO: cards whose origin isn't a configured source (e.g. /docs/ blocks) are
  // dropped here. Decide how to surface them (see the SearchPanel HACK/TODO).

  const repositories = await Promise.all(repos.map(async (repo) => {
    const origin = String(repo.origin);
    // One provider per repo: the editing handle for this origin. Used both for
    // the repo descriptor (README/lo.yaml) and for forge links — which it
    // derives from the origin, returning null when the source has no web view.
    const provider = await readProvider(origin);
    const descriptor = await readSourceDescriptor(provider);

    const toLaunchable = (card: ActivityCard): z.infer<typeof LaunchableSchema> => {
      const launchable: z.infer<typeof LaunchableSchema> = {
        id: card.id,
        role: card.role,      // derived from the declaration (buildActivityCards)
        status: card.status,  // draft vs usable
        title: pickTitle(card),
        type: card.tag,
        index: card.index,
        path: card.editPath,
        forgeLink: provider.forgeLink?.(toOlxRelativePath(card.editPath)) ?? null,
      };
      if (includeSet.has('launchables.description')) {
        // extractLocalizedVariant can legitimately return '' (an empty-string
        // variant) — only fall back to an arbitrary variant when it returns
        // undefined (no variants at all), so we never bypass its
        // prefer-human-authored ordering for a merely-empty match.
        const variant = extractLocalizedVariant(card.description, 'en');
        launchable.description = variant !== undefined ? variant : (Object.values(card.description)[0] ?? '');
      }
      return launchable;
    };

    const all = (cardsByOrigin.get(origin) ?? []).map(toLaunchable);
    // Internal blocks (building blocks composed into others) are not public
    // learning objects — kept out of the launchable lists/counts, surfaced in
    // their own `internal` list. The draft vs usable split applies to the
    // public (non-internal) ones.
    const internal = all.filter(l => l.role === 'internal');
    const publicLaunchables = all.filter(l => l.role !== 'internal');
    const usable = publicLaunchables.filter(l => l.status === 'usable');
    const drafts = publicLaunchables.filter(l => l.status === 'draft');

    const entry: z.infer<typeof RepositorySchema> = {
      origin,
      label: descriptor.title || repo.label,   // manifest title wins over the config label
      writable: repo.writable,
      description: descriptor.description ?? null,
      discipline: descriptor.discipline ?? null,
      launchableCount: usable.length,
      draftCount: drafts.length,
      internalCount: internal.length,
      launchables: includeDrafts ? publicLaunchables : usable,
      internal,
      forgeLink: provider.forgeLink?.() ?? null,
      error: descriptor.error ?? null,
    };
    // README is a git convention — real now.
    if (includeSet.has('readme')) entry.readme = descriptor.readme ?? null;
    // Other git-convention fields still TODO:
    if (includeSet.has('license')) entry.license = null;           // TODO: read LICENSE file
    if (includeSet.has('contributors')) entry.contributors = null; // TODO: CONTRIBUTORS / git log
    if (includeSet.has('commits')) entry.commits = null;           // TODO: from git log
    if (includeSet.has('forge')) entry.forge = null;               // TODO: from the forge (GitHub) API, server-side
    return entry;
  }));

  return { repositories, total: repositories.length };
}

// ===========================================================================
// Registration
// ===========================================================================

/** Register the author-catalog tools with a ToolRegistry. */
export function registerCatalogTools(registry: ToolRegistry): void {
  registry.register('get_repositories', {
    description:
      'List content repositories and the launchable activities in each — the ' +
      'author catalog, in one call. Returns repo cards + launchables by default. ' +
      'Use `include` to add heavy per-repo detail for specific repos; avoid ' +
      'requesting heavy fields across everything. (filter + pagination are ' +
      'coming — see docs/mcp-authoring.md.)',
    input: GetRepositoriesInput,
    output: GetRepositoriesOutput,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, getRepositories);
}
