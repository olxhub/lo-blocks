// packages/shared/lib/lofs/allowedDirs.ts
//
// Registry of filesystem directories the file provider may read/write.
//
// The security checks in providers/file.ts (resolveSafeReadPath /
// resolveSafeWritePath) verify canonical paths against an allow-list.
// Historically that list was hardcoded (./content + OLX_CONTENT_DIR).
// With content sources configured per deployment (content-sources.yaml,
// see contentSources.ts), the configured checkout directories register
// here at load time.
//
// Tiny separate module so both file.ts (consumer) and contentSources.ts
// (registrar) can import it without a cycle.

const registered = new Set<string>();

/** Allow reads/writes under this directory (absolute path). */
export function registerAllowedContentDir(dir: string): void {
  registered.add(dir);
}

/** Directories registered by content-source configuration. */
export function registeredContentDirs(): string[] {
  return [...registered];
}
