import { describe, it, expect } from 'vitest';
import { PMSSParserAdapter, resolve } from 'pmss';
import fs from 'fs';
import path from 'path';
import { initConfig, getConfig, getConfigBool } from './config';

// Load the actual system.pmss used by the app
const SYSTEM_PMSS = fs.readFileSync(
  path.resolve(__dirname, '../../../config/system.pmss'), 'utf-8'
);

// -----------------------------------------------------------------------
// Direct PMSS resolution tests (no initConfig dependency)
// -----------------------------------------------------------------------
// Validate the resolve function against different profile contexts.

describe('PMSS config resolution', () => {
  const rules = PMSSParserAdapter.parse(SYSTEM_PMSS);

  it('client profile: websocket enabled', () => {
    expect(resolve(rules, 'websocket', { classes: ['client'] })).toBe('true');
  });

  it('static profile: websocket disabled (falls through to * default)', () => {
    expect(resolve(rules, 'websocket', { classes: ['static'] })).toBe('false');
  });

  it('no profile: websocket disabled (conservative default)', () => {
    expect(resolve(rules, 'websocket', {})).toBe('false');
    expect(resolve(rules, 'websocket', { classes: [] })).toBe('false');
  });

  it('unknown key returns null', () => {
    expect(resolve(rules, 'nonexistent', { classes: ['client'] })).toBeNull();
  });
});

// -----------------------------------------------------------------------
// getConfig / getConfigBool via initConfig
// -----------------------------------------------------------------------

describe('getConfig / getConfigBool', () => {
  it('client profile enables websocket', () => {
    initConfig(SYSTEM_PMSS, ['client']);
    expect(getConfigBool('websocket')).toBe(true);
  });

  it('static profile disables websocket', () => {
    initConfig(SYSTEM_PMSS, ['static']);
    expect(getConfigBool('websocket')).toBe(false);
  });

  it('empty classes defaults to conservative (no websocket)', () => {
    initConfig(SYSTEM_PMSS, []);
    expect(getConfigBool('websocket')).toBe(false);
  });

  it('getConfig returns string values', () => {
    initConfig(SYSTEM_PMSS, ['client']);
    expect(getConfig('websocket')).toBe('true');
  });

  it('getConfig returns null for unknown keys', () => {
    initConfig(SYSTEM_PMSS, ['client']);
    expect(getConfig('nonexistent')).toBeNull();
  });

  it('explicit context overrides default classes', () => {
    initConfig(SYSTEM_PMSS, ['client']);
    // Client profile enables websocket, but explicit static context disables it
    expect(getConfigBool('websocket', { classes: ['static'] })).toBe(false);
  });
});
