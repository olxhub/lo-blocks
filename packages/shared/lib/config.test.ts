import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PMSSParserAdapter, resolve } from 'pmss';

// -----------------------------------------------------------------------
// Direct PMSS resolution tests (no env var dependency)
// -----------------------------------------------------------------------
// These validate the resolve function against different profile contexts,
// independent of what NEXT_PUBLIC_APP_PROFILE is set to.

describe('PMSS config resolution', () => {
  // Import the module to access the actual config string and contract.
  // We can't easily test getConfig/getConfigBool directly because the
  // module reads NEXT_PUBLIC_APP_PROFILE at load time. Instead we test
  // resolve() against the same contexts the module would use.

  // Config must match what's in config.ts — if they diverge, this test
  // should be updated to import from config.ts (once we have a build
  // step or raw import for the config string).
  const CONFIG = `
    * { websocket: false; }
    .web { websocket: true; }
  `;
  const rules = PMSSParserAdapter.parse(CONFIG);

  it('web profile: websocket enabled', () => {
    expect(resolve(rules, 'websocket', { classes: ['web'] })).toBe('true');
  });

  it('static profile: websocket disabled (falls through to * default)', () => {
    expect(resolve(rules, 'websocket', { classes: ['static'] })).toBe('false');
  });

  it('no profile: websocket disabled (conservative default)', () => {
    expect(resolve(rules, 'websocket', {})).toBe('false');
    expect(resolve(rules, 'websocket', { classes: [] })).toBe('false');
  });

  it('unknown key returns null', () => {
    expect(resolve(rules, 'nonexistent', { classes: ['web'] })).toBeNull();
  });
});

// -----------------------------------------------------------------------
// getConfig / getConfigBool module contract
// -----------------------------------------------------------------------
// These test the exported functions with controlled NEXT_PUBLIC_APP_PROFILE.

describe('getConfig / getConfigBool', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_APP_PROFILE;

  afterEach(() => {
    // Restore original env
    if (ORIGINAL_ENV !== undefined) {
      process.env.NEXT_PUBLIC_APP_PROFILE = ORIGINAL_ENV;
    } else {
      delete process.env.NEXT_PUBLIC_APP_PROFILE;
    }
    vi.resetModules();
  });

  async function loadConfig(profile: string | undefined) {
    if (profile !== undefined) {
      process.env.NEXT_PUBLIC_APP_PROFILE = profile;
    } else {
      delete process.env.NEXT_PUBLIC_APP_PROFILE;
    }
    // Fresh import so module reads the new env var
    return await import('./config');
  }

  it('web profile enables websocket', async () => {
    const { getConfigBool } = await loadConfig('web');
    expect(getConfigBool('websocket')).toBe(true);
  });

  it('static profile disables websocket', async () => {
    const { getConfigBool } = await loadConfig('static');
    expect(getConfigBool('websocket')).toBe(false);
  });

  it('unset profile defaults to conservative (no websocket)', async () => {
    const { getConfigBool } = await loadConfig(undefined);
    expect(getConfigBool('websocket')).toBe(false);
  });

  it('empty string profile defaults to conservative', async () => {
    const { getConfigBool } = await loadConfig('');
    expect(getConfigBool('websocket')).toBe(false);
  });

  it('getConfig returns string values', async () => {
    const { getConfig } = await loadConfig('web');
    expect(getConfig('websocket')).toBe('true');
  });

  it('getConfig returns null for unknown keys', async () => {
    const { getConfig } = await loadConfig('web');
    expect(getConfig('nonexistent')).toBeNull();
  });

  it('explicit context overrides profile', async () => {
    const { getConfigBool } = await loadConfig('web');
    // Web profile enables websocket, but explicit static context disables it
    expect(getConfigBool('websocket', { classes: ['static'] })).toBe(false);
  });
});
