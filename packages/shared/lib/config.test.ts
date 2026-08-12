import { describe, it, expect } from 'vitest';
import { PMSSParserAdapter, resolve } from 'pmss';
import fs from 'fs';
import path from 'path';
import {
  blockConfig,
  contentConfigContext,
  initConfig,
  loadContentBuildConfig,
  resolveConfig,
  useBlockConfig,
} from './config';
import { toLofsCanonical, toLofsRef } from './types/address';
import { asContentNamespace } from './types/id-grammar';

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

  it('unsafe OLX is disabled by default in every profile', () => {
    for (const classes of [[], ['client'], ['server'], ['static']]) {
      expect(resolve(rules, 'allow-unsafe-content', { classes })).toBe('false');
    }
  });

  it('unknown key returns null', () => {
    expect(resolve(rules, 'nonexistent', { classes: ['client'] })).toBeNull();
  });
});

// -----------------------------------------------------------------------
// Contextual resolution via initConfig
// -----------------------------------------------------------------------

describe('resolveConfig', () => {
  it('client profile enables websocket', () => {
    initConfig(SYSTEM_PMSS, { classes: ['client'] });
    expect(resolveConfig({}, 'websocket')).toBe('true');
  });

  it('static profile disables websocket', () => {
    initConfig(SYSTEM_PMSS, { classes: ['static'] });
    expect(resolveConfig({}, 'websocket')).toBe('false');
  });

  it('empty classes defaults to conservative (no websocket)', () => {
    initConfig(SYSTEM_PMSS);
    expect(resolveConfig({}, 'websocket')).toBe('false');
  });

  it('returns null for unknown keys', () => {
    initConfig(SYSTEM_PMSS, { classes: ['client'] });
    expect(resolveConfig({}, 'nonexistent')).toBeNull();
  });

  it('merges base and call-site context', () => {
    initConfig(`
      * { value: default; }
      .client[organization="MIT"] { value: contextual; }
    `, { classes: ['client'], attributes: { organization: 'NCSU' } });

    expect(resolveConfig({ attributes: { organization: 'MIT' } }, 'value'))
      .toBe('contextual');
  });
});

describe('block configuration', () => {
  const namespace = asContentNamespace('shared.namespace');
  const provenance = toLofsCanonical(toLofsRef(
    'git+https:github.com/olxhub/trusted.git@main://course.olx#12345678',
  ));

  it('keeps namespace and source origin independent', () => {
    initConfig(`
      * { policy: default; }
      [namespace="shared.namespace"] { policy: namespace; }
      [origin="git+https:github.com/olxhub/trusted.git@main"] { policy: origin; }
      [namespace="shared.namespace"][origin="git+https:github.com/olxhub/trusted.git@main"] {
        policy: both;
      }
    `);

    expect(resolveConfig(contentConfigContext(namespace, provenance), 'policy')).toBe('both');
  });

  it('derives content context from existing runtime props', () => {
    initConfig(`
      * { allow-unsafe-content: false; }
      [origin="git+https:github.com/olxhub/trusted.git@main"] {
        allow-unsafe-content: true;
      }
    `);
    const props = {
      runtime: { ns: namespace },
      nodeInfo: { olxJson: { source: provenance } },
    } as any;

    expect(blockConfig(props, 'allow-unsafe-content')).toBe('true');
    expect(useBlockConfig(props, 'allow-unsafe-content')).toBe('true');
  });

  it('uses platform-derived block identity instead of base manifest claims', () => {
    initConfig(`
      * { allow-unsafe-content: false; }
      [origin="memory:author-claim"] { allow-unsafe-content: true; }
      [namespace="author.claim"] { allow-unsafe-content: true; }
    `, {
      attributes: { origin: 'memory:author-claim', namespace: 'author.claim' },
    });
    const props = {
      runtime: { ns: namespace },
      nodeInfo: { olxJson: { source: provenance } },
    } as any;

    expect(blockConfig(props, 'allow-unsafe-content')).toBe('false');
  });

  it('overrides manifest origin with a fail-closed value when provenance is unknown', () => {
    initConfig(`
      * { allow-unsafe-content: false; }
      [origin="git+https:github.com/olxhub/trusted.git@main"] {
        allow-unsafe-content: true;
      }
    `, { attributes: { origin: 'git+https:github.com/olxhub/trusted.git@main' } });
    const props = {
      runtime: { ns: namespace },
      nodeInfo: { olxJson: {} },
    } as any;

    expect(blockConfig(props, 'allow-unsafe-content')).toBe('false');
  });

  it('lets origin policy override the lower-specificity client projection', () => {
    initConfig(`
      * { allow-unsafe-content: false; }
      [origin="git+https:github.com/olxhub/trusted.git@main"] {
        allow-unsafe-content: true;
      }
      client { allow-unsafe-content: false; }
    `, { types: ['client'] });

    expect(resolveConfig(contentConfigContext(namespace, provenance), 'allow-unsafe-content'))
      .toBe('true');
  });
});

describe('content-build configuration', () => {
  it('loads a deploy-local unsafe-content override for parse-time validation', () => {
    const read = (file: string) => {
      if (file === 'config/system.pmss') return SYSTEM_PMSS;
      if (file === 'config/local.pmss') return '.static { allow-unsafe-content: true; }';
      throw new Error(`unexpected file: ${file}`);
    };

    expect(loadContentBuildConfig(read, 'static')).toEqual(['static', 'development']);
    expect(resolveConfig({}, 'allow-unsafe-content')).toBe('true');
  });
});
