// packages/shared/lib/lofs/allowedDirs.ts
//
// Registry of filesystem directories the file provider may read/write.
//
// The security checks in providers/file.ts (resolveSafeReadPath /
// resolveSafeWritePath) verify canonical paths against an allow-list of
// ./content plus whatever is registered here. Registrars:
//   - contentSources.ts registers each configured checkout at load time
//   - standalone scripts register their --content dir
//   - tests register their temp content dirs
//
// Tiny separate module so file.ts (consumer) and its registrars can import
// it without a cycle.

const registered = new Set<string>();

/** Allow reads/writes under this directory (absolute path). */
export function registerAllowedContentDir(dir: string): void {
  registered.add(dir);
}

/** All registered content directories (config, scripts, tests). */
export function registeredContentDirs(): string[] {
  return [...registered];
}
