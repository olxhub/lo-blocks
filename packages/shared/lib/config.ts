// packages/shared/lib/config.ts
//
// Application configuration via PMSS (Preference Management Style Sheets).
//
// Call initConfig(pmssSource, context) before resolving configuration.
// Each app initializes from the appropriate source:
//   - Server: reads config/system.pmss directly
//   - Client: fetches from /api/config at startup
//   - Static: injected at build time via Vite define
//
// Settings resolve via CSS-like specificity rules:
// .client selectors override * defaults, etc.
//
// Public resolution APIs:
//   resolveConfig(context, key)  — scripts, builds, servers, analytics
//   blockConfig(props, key)      — generic dynamic OLX runtime
//   useBlockConfig(props, key)   — React runtime (reactive adapter)

import { PMSSParserAdapter, resolve } from 'pmss';
import type { SelectorMatchContext } from 'pmss';
import { detectCredentialClasses } from '@/lib/llm/provider';
import { source } from '@/lib/types/address';
import type { ContentNamespace, LofsRef, RuntimeProps } from '@/lib/types';

type Rules = ReturnType<typeof PMSSParserAdapter.parse>;
export type ConfigContext = SelectorMatchContext;

let rules: Rules | null = null;
let baseContext: ConfigContext = {};

/**
 * Initialize the config system with a PMSS source string and class context.
 *
 * Must be called before resolving configuration. Can be called again to
 * reinitialize (e.g. in tests).
 *
 * @param pmssSource - Raw PMSS text (e.g. contents of system.pmss)
 * @param context - Facts shared by every resolution in this runtime/process
 */
export function initConfig(pmssSource: string, context: ConfigContext = {}) {
  rules = PMSSParserAdapter.parse(pmssSource);
  baseContext = context;
}

/**
 * Combine runtime/process facts with facts known at the call site.
 *
 * Classes and types accumulate. Call-site attributes override base attributes;
 * this lets request/content facts refine a process-wide context without callers
 * having to reconstruct it.
 */
function mergeContexts(base: ConfigContext, local: ConfigContext): ConfigContext {
  if (
    local.id === undefined &&
    !local.types?.length &&
    !local.classes?.length &&
    (!local.attributes || !Object.keys(local.attributes).length)
  ) {
    return base;
  }

  return {
    types: local.types?.length ? [...(base.types ?? []), ...local.types] : base.types,
    classes: local.classes?.length ? [...(base.classes ?? []), ...local.classes] : base.classes,
    attributes: local.attributes
      ? (base.attributes ? { ...base.attributes, ...local.attributes } : local.attributes)
      : base.attributes,
    id: local.id ?? base.id,
  };
}

/**
 * Fundamental configuration lookup for non-block callers. An empty context is
 * valid and means the caller has no facts beyond those supplied to initConfig.
 */
export function resolveConfig(context: ConfigContext, key: string): string | null {
  if (!rules) throw new Error('Config not initialized. Call initConfig() first.');
  return resolve(rules, key, mergeContexts(baseContext, context));
}

/**
 * PMSS facts already present wherever parsed OLX runs. Namespace is logical
 * content identity; origin is physical/source provenance. Keep them distinct.
 */
export function contentConfigContext(
  namespace: ContentNamespace,
  provenance?: LofsRef,
): ConfigContext {
  // Always overwrite any manifest-supplied origin. The empty value is the
  // fail-closed provenance for runtime-constructed content with no source.
  return {
    attributes: {
      namespace: String(namespace),
      origin: provenance ? String(source(provenance)) : '',
    },
  };
}

/** Resolve configuration for a block in the generic dynamic OLX runtime. */
export function blockConfig(props: RuntimeProps, key: string): string | null {
  return resolveConfig(
    contentConfigContext(props.runtime.ns, props.nodeInfo.olxJson?.source),
    key,
  );
}

/**
 * React adapter for block configuration. Configuration is immutable after app
 * startup today, so this delegates directly; it becomes a subscribing hook if
 * user/collaboration context moves into reactive state.
 */
export function useBlockConfig(props: RuntimeProps, key: string): string | null {
  return blockConfig(props, key);
}

// --- Server-side config loading ----------------------------------------------

/**
 * Load PMSS config files and initialize the config system for server use.
 *
 * Reads system.pmss (required) + server.pmss (required) + local.pmss
 * (optional), detects credential classes, and calls initConfig.
 *
 * @param readFileSync - fs.readFileSync (passed in because this module is
 *   shared with the client bundle, which can't import node:fs)
 * @returns The assembled class list (for logging)
 */
export function loadServerConfig(
  readFileSync: (path: string, encoding: 'utf-8') => string,
): string[] {
  const common = readFileSync('config/system.pmss', 'utf-8');
  const server = readFileSync('config/server.pmss', 'utf-8');

  let local = '';
  try {
    local = readFileSync('config/local.pmss', 'utf-8');
  } catch {
    // No local.pmss — that's fine
  }

  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const credClasses: string[] = detectCredentialClasses();
  const pmssClasses = process.env.PMSS_CLASSES
    ? process.env.PMSS_CLASSES.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  const classes = ['server', env, ...credClasses, ...pmssClasses];
  const pmssSource = [common, server, local].filter(Boolean).join('\n');

  initConfig(pmssSource, { types: ['server'], classes });
  return classes;
}

/**
 * Initialize configuration for a content-build process.
 *
 * Content parsing needs deployment policy (notably allow-unsafe-content)
 * before validating OLX. Build tools deliberately read system.pmss plus the
 * deploy-local override, but not server.pmss: server-only provider/storage
 * settings are irrelevant and may contain private deployment details.
 */
export function loadContentBuildConfig(
  readFileSync: (path: string, encoding: 'utf-8') => string,
  profile: 'build' | 'static' = 'build',
): string[] {
  const common = readFileSync('config/system.pmss', 'utf-8');
  let local = '';
  try {
    local = readFileSync('config/local.pmss', 'utf-8');
  } catch {
    // No local.pmss — conservative system defaults apply.
  }

  const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const classes = [profile, env];
  initConfig([common, local].filter(Boolean).join('\n'), { types: [profile], classes });
  return classes;
}
