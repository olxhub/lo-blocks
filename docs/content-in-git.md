# Teachers Maintaining Content in Git

Design deep-dive: decoupling course content from the code repository, and
what it takes for teachers to maintain content in git — without requiring
them to know git exists.

## The problem

Content lives in `/content/` inside the code repository. This entangles two
lifecycles that have nothing to do with each other:

* **Deploys are blocked by teacher edits.** A studio save writes to the
  working tree of the *code* repo. Any teacher edit dirties the deployment
  checkout; `git pull` for a code update now needs stash/commit/conflict
  resolution against content nobody committed deliberately.
* **Teacher edits have no history.** Saves overwrite files. There is no
  per-edit audit, no revert, no attribution — unless an operator manually
  commits the working tree, which entangles the histories further.
* **It can't scale.** One repo, one deployment, one trust domain. Every new
  course multiplies the collisions. Institutions can't own their content,
  fork each other's courses, or control who edits what.

The namespace work already separated content *identity* from content
*location* (keys survive repo moves and forks; manifests declare
namespaces). This document covers the location side: where content lives,
how it changes, and who may change it.

## Where the coupling lives today

The audit, as of this writing. Three kinds of coupling:

**1. Hardcoded `./content` paths.** Some honor `OLX_CONTENT_DIR`, some
don't — that inconsistency is itself the first bug:

| Site | Env override? |
|------|---------------|
| `syncContentFromStorage.ts` `defaultContentProviders()` | no |
| `apps/web/app/api/file/route.js` (studio read/write/delete/rename) | no |
| `apps/web/app/api/grep/route.ts`, `api/files/route.ts` | no |
| `lib/lofs/contentPaths.ts` `CONTENT_BASE` | no |
| `scripts/xml2graph.js` | no |
| translate routes (web + server) | yes |
| `apps/server/src/routes/config.ts` | yes |
| `xml2json.ts`, `clean-translations.ts`, `sync-images.ts` | yes (or flag) |
| `FileStorageProvider` allowed read/write dirs | yes (documented as a workaround to remove) |

**2. Write paths into the tree.** Who mutates content:

* Studio saves: `/api/file` POST/PUT/DELETE → `provider.write()` → disk.
* MCP/LLM editor tools: same route, same provider.
* Translation: `translate/orchestrate.ts` writes `*.<lang>.olx` siblings,
  plus logs to `content/../logs` — which is the **repo root** when content
  is `./content`. (Pre-existing misplacement; fix when the content dir
  becomes configurable.)
* `build:content`: generates `*.auto.olx` question banks inside content.

**3. Asset serving.** `copyAssetsToPublic` copies media into
`apps/web/public/content` (gitignored, so not a history problem — but the
copy step assumes filesystem sources).

## The end state

A teacher's mental model: *"my course"*, with named saves and an undo
history. Not: branches, remotes, merge conflicts, forge accounts.

* Each course (or content collection) is its own git repository, anywhere —
  GitHub, GitLab, Forgejo, Codeberg, a bare repo on the server. The
  platform speaks **plain git** (clone/fetch/commit/push); forge-specific
  APIs are needed only for conveniences like opening PRs or provisioning
  repos.
* The server maintains a **managed working clone** per repo. Reads serve
  from it; teacher edits commit to it; the server pushes/pulls on a policy
  (immediately, debounced, or manually for review-gated courses).
* Teachers don't need forge accounts. The platform commits **on their
  behalf** with attribution (`--author "Maggie Chen <...>"` from
  `CurrentUser`; the platform identity is the committer). Teachers who
  *want* direct git access just clone the repo — it's a normal repo.
* Code deploys never touch content. Content syncs never touch code.

## Architecture, in deployable layers

Each layer is independently shippable and relieves real pain on its own.

### Layer 0 — content out of the deployment tree ✅ (implemented)

No git features at all: content sources become **configured locations** —
git checkouts managed by dev-ops, served from the filesystem.

As built (June 2026):

1. **`config/content-sources.yaml`** (gitignored, see the `.example`):
   maps mount names to checkout directories, plus a `fallback` directory
   (default `./content`) for baseline/transitional content. No config file
   → exactly the historical single-directory behavior.
2. **`MountRouterProvider`** unions the sources: each source mounts at a
   path prefix equal to the directory name its content previously lived at
   (`psychology/...` → the psych checkout's root). Child providers use
   mountPoint `content/<mount>`, a form the address grammar already
   anticipated — so paths, asset URLs, provenance refs, namespaces (each
   repo's own `manifest.yaml`), and student state keys are **all unchanged**
   by moving a source into its own repo.
3. All `'./content'` literals route through `contentSources.ts`
   (`contentProvider()`); configured checkout directories register with the
   file provider's security allow-list (`allowedDirs.ts`).
4. Still to decide/do in this layer: move the translation `logs` directory
   somewhere deliberate; the fate of generated files (`*.auto.olx`,
   machine translations — committing them to the content repo is fine to
   start).

This alone kills the stated pain: teacher edits dirty content checkouts
that *only* hold content, and code deploys stop caring.

**This is also the moment to finish the `syncContentFromStorage`
cleanup.** It's halfway functional (pure `applyFileChanges` over an
immutable snapshot) but still keeps one module-level `_snapshot` keyed by
nothing. Finishing the job — snapshots keyed per provider/source, owned by
the caller rather than the module — is what lets Layer 2 sync many repos
with isolated failure domains, and Layer 4 build per-audience indexes.

### Git read path ✅ (implemented, ahead of the layering)

The in-memory `GitStorageProvider` (isomorphic-git + memfs) reads content
directly from a git remote — no working clone on disk, no git binary,
forge-agnostic (plain smart-HTTP). Config: the `repo:` form in
content-sources.yaml. This lands the *read* half of remote git ahead of
the layer order below, because in-memory git turned out simpler than a
managed on-disk clone:

* Change detection = one `listServerRefs` per cooldown; on a head move,
  shallow re-clone + tree diff → exact added/changed/deleted.
* Versions are real: blob SHAs as `LofsCanonical#version`; provenance is
  `<repo-url>://<path>#<sha>`.
* Namespace = repo manifest, else the repo name (`defaultNamespace(url)`) —
  NO directory-name fallback (that's a filesystem-provider concept; a git
  repo's identity is its URL). Manifests override for multi-collection repos.
* Read-only: writes throw. Committing back is the write path below.

Validated live against `github.com/olxhub/edu.memphis.psych`: 2039 blocks,
SHA-versioned provenance, manifest-derived namespace.

### Layer 1 — server-managed git on one repo (write path)

Teacher edits become commits. Still one content repo; no forge complexity.

* **Write path**: `/api/file` POST → write to the managed clone → `git add
  + commit` with teacher attribution. Commit message conventions carry the
  edit context (file, studio vs MCP tool, session). Every save being a
  commit is the simplest correct policy; squash/debounce is an optimization
  to add only if history noise becomes a real complaint (revert UX prefers
  fine-grained).
* **Versioning maps onto existing types.** `LofsCanonical`'s `#version`
  becomes the commit hash (the address design anticipated exactly this:
  `repo.git://hw1.olx#3f41866`). `ReadResult.metadata` carries the blob/
  commit; the studio's existing optimistic-concurrency check
  (`previousMetadata` + `VersionConflictError` → HTTP 409) maps onto
  "expected parent commit" — same UX, stronger guarantee.
* **GitStorageProvider shape**: a thin layer over `FileStorageProvider` on
  the working clone — reads, scans, `namespaceFor` all inherit; it adds
  commit-on-write, pull/push, and version stamping. Use system git via
  subprocess (battle-tested, LFS-capable) behind a small interface;
  serialize mutations per-repo with a simple lock (one server process
  writes a given clone).
* **Sync triggers**: on-demand pull before scan (cheap if up to date),
  plus optional webhook/poll for external pushes. The manifest-invalidation
  and scan machinery from the namespace work applies unchanged — a pull is
  just files changing under the provider.
* **History UX for teachers**: "Saved versions" = `git log -- <file>`
  filtered to attribution; "restore" = checkout of an old blob committed as
  a new save. No git vocabulary in the UI.

### Layer 2 — many repos

* A **repo registry** (server config, e.g. `repos.yaml`): URL, branch,
  credentials reference, optional namespace override. Each entry becomes a
  provider in the content stack; `manifest.yaml` inside each repo declares
  its namespace (already implemented).
* **Per-repo sync with isolated failures**: one repo's parse errors or
  fetch failures must not block the others — this is where the per-source
  snapshot refactor pays off. Namespaces already prevent cross-repo key
  collisions; duplicate detection stays per-namespace.
* **Credentials**: per-repo deploy keys or tokens, held server-side.
  Read-only repos (subscribed upstream courses) and writable repos
  (institution-owned) differ only in whether pushes are configured.

### Layer 3 — forge workflows and shared courses

* **Lowest common denominator first**: clone/fetch/push over SSH/HTTPS
  works identically on every forge and on plain bare repos. Resist
  per-forge API integrations until a concrete feature needs them.
* **Fork model for shared content**: an institution's writable fork plus a
  read-only upstream. Namespace identity already survives forks (that was
  the point), so student state is preserved across
  `gsu/course.git` → `memphis/course.git`.
* **Contributions upstream**: platform-mediated PRs (forge API needed
  here), opened by the platform account with teacher attribution in the
  commits. This is where translation-contribution workflows from the i18n
  roadmap eventually live too.
* **Repo provisioning** for teachers with no accounts anywhere: the
  platform can host bare repos itself (a directory of bare repos *is* a
  forge-less git host) and graduate courses to a forge later — it's a
  `git push --mirror`.

### Layer 4 — visibility and catalog

Which repos are shown to whom. Mostly product design:

* Registry entries gain audience metadata (institution, class, public).
* The content index either becomes per-audience or stays a superset with
  query-time filtering at `/api/olxjson` — per-source snapshots (Layer 0's
  cleanup) make either implementable.
* A catalog UI for subscribing to courses sits on top; out of scope here.

## Cross-cutting concerns

* **Assets/media**: images and PDFs in content repos argue for git LFS on
  media extensions; `copyAssetsToPublic` already iterates providers, and a
  managed clone is just a filesystem source. Decide an upper size bound and
  document it for authors.
* **Concurrency**: one writer process per clone (lock); multiple app
  servers sharing a content volume should designate a writer or shard
  repos. Don't build distributed git coordination — shard instead.
* **Secrets hygiene**: content repos will be cloned widely; the LLM/config
  material (API keys, PMSS local overrides) must never live under a content
  root. Today's layout is already clean here; keep it that way.
* **Backups**: every clone of a course repo is a backup. This is most of
  the argument for git over a database as the system of record.
* **MCP editing (track b)** rides the same write path: tools validate
  with `parseOLX` before write (the studio Edit tool already does), then
  commit with tool-call provenance in the message. Nothing forks.

## Open design questions

1. **Commit granularity**: per-save vs debounced-per-session. Start
   per-save; revisit with data.
2. **Draft vs published**: branch (`draft` → merge to `main`), or rely on
   the existing source-stacking (memory overlay over git) with an explicit
   publish? The provenance notes in `types/core.ts` ("save: memory → git;
   publish: git → pg") sketch the second.
3. **Teacher-facing conflict UX**: 409-style "someone else edited this
   file" is shippable; merge tooling for simultaneous editing is not a
   v1 problem (and CRDT fields are the long-term answer for live
   collaboration, per the fields roadmap).
4. **Identity mapping**: `CurrentUser.safe_user_id` → git author email
   convention (e.g. `mchen@users.<deployment-domain>`); needs a decision
   before Layer 1 commits anything.
5. **Who owns repo creation** for account-less teachers: platform-hosted
   bare repos by default? (Suggested: yes.)

## Suggested sequencing

| Step | Unblocks | Size |
|------|----------|------|
| 0a. `contentRoot()` config; kill `'./content'` literals | separate checkout; deploy pain gone | small |
| 0b. Finish functional `syncContentFromStorage` (per-source snapshots) | multi-repo, per-audience | small-medium |
| 1. Commit-on-write with attribution (one repo) | history, revert, audit | medium |
| 2. Repo registry + per-repo sync | institutions own content | medium |
| 3. Push/pull remotes, deploy keys, conflict 409s | true off-server repos | medium |
| 4. Forge PRs, forks, provisioning | sharing, contributions | larger, incremental |
| 5. Visibility/catalog | multi-tenancy | product + engineering |

Step 0 is the immediate relief and requires no new concepts — it is
configuration hygiene plus a refactor that's already half-done.
