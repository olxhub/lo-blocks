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
import { sources, readProvider } from '@/lib/lofs/contentSources';
import { syncContentFromStorage } from '@/lib/content/syncContentFromStorage';
import { buildActivityCards, type ActivityCard } from '@/lib/content/buildActivityCards';
import { toOlxRelativePath } from '@/lib/types/storage';
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

/** First localized title, else the id. TODO: locale-aware pick (getBestVariant),
 *  the way the activities route already does for /preview. */
function pickTitle(card: ActivityCard): string {
  return Object.values(card.title)[0] || card.id;
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
}

/** Read one repo-root file via the provider; null if absent (a real I/O
 *  boundary — a repo need not have every convention file). */
async function readRepoFile(origin: string, name: string): Promise<string | null> {
  try {
    const provider = await readProvider(origin);
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
 *  the metadata YAML for beyond-git fields. */
async function readSourceDescriptor(origin: string): Promise<SourceDescriptor> {
  const readme = await readRepoFile(origin, 'README.md');
  const metaRaw = await readRepoFile(origin, REPO_METADATA_FILE);
  const parsed = metaRaw ? YAML.parse(metaRaw) : null;
  const meta = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

  return {
    title: typeof meta.title === 'string' ? meta.title : undefined,
    description:
      typeof meta.description === 'string' ? meta.description
      : readme ? firstParagraph(readme)
      : undefined,
    discipline: typeof meta.discipline === 'string' ? meta.discipline : undefined,
    readme: readme ?? undefined,
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
  const cards = buildActivityCards(idMap);

  // Group launchables by the origin they came from (their provenance source).
  const byOrigin = new Map<string, z.infer<typeof LaunchableSchema>[]>();
  for (const card of Object.values(cards)) {
    const launchable: z.infer<typeof LaunchableSchema> = {
      id: card.id,
      role: card.role,      // derived from the declaration (buildActivityCards)
      status: card.status,  // draft vs usable
      title: pickTitle(card),
      type: card.tag,
      path: card.editPath,
    };
    if (includeSet.has('launchables.description')) {
      launchable.description = Object.values(card.description)[0] || '';
    }
    const list = byOrigin.get(card.editSource) ?? [];
    list.push(launchable);
    byOrigin.set(card.editSource, list);
  }
  // TODO: cards whose origin isn't a configured source (e.g. /docs/ blocks) are
  // dropped here. Decide how to surface them (see the SearchPanel HACK/TODO).

  const repositories = await Promise.all(repos.map(async (repo) => {
    const all = byOrigin.get(String(repo.origin)) ?? [];
    // Internal blocks (building blocks composed into others) are not public
    // learning objects — they're kept out of the launchable lists/counts. The
    // draft vs usable split applies to the public (non-internal) ones.
    const internal = all.filter(l => l.role === 'internal');
    const publicLaunchables = all.filter(l => l.role !== 'internal');
    const usable = publicLaunchables.filter(l => l.status === 'usable');
    const drafts = publicLaunchables.filter(l => l.status === 'draft');
    const descriptor = await readSourceDescriptor(String(repo.origin));

    const entry: z.infer<typeof RepositorySchema> = {
      origin: String(repo.origin),
      label: descriptor.title || repo.label,   // manifest title wins over the config label
      writable: repo.writable,
      description: descriptor.description ?? null,
      discipline: descriptor.discipline ?? null,
      launchableCount: usable.length,
      draftCount: drafts.length,
      internalCount: internal.length,
      launchables: includeDrafts ? publicLaunchables : usable,
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
