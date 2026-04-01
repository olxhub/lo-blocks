// packages/shared/lib/i18n/blockI18n.ts
//
// UI string translations for blocks — "Next", "Previous", "Step 3 of 5", etc.
//
// This is separate from the content translanguaging system in useTranslation.ts.
// That system handles educational content (OLX → translated OLX via LLM).
// This handles the block chrome: button labels, status text, accessibility
// strings — the stuff that's the same regardless of what course you're teaching.
//
// TODO: Naming is ambiguous. useTranslation (react-i18next), useTranslation
// (our content translanguaging), and useBlockTranslation (this file) are easy
// to confuse. Likely rename to useContentTranslation / useUiTranslation or
// similar once the naming shakes out. Not this PR.
//
// Each block gets an i18next namespace derived from its name (e.g. "blocks/Sequential").
// Translation JSON files live alongside the block (e.g. Sequential/i18n/en.json)
// and are collected into blockI18nAutogen.ts by the build system.
//
// Uses react-i18next's per-hook `lng` option to set language without mutating
// global i18next state. This matters because different blocks can render with
// different locale overrides (e.g. a zh-Hans problem inside an en-US course).
//
// Key naming conventions: see docs/README.md § "Translation Strings"
//
'use client';

import i18n from 'i18next';

import { initReactI18next, useTranslation } from 'react-i18next';
import type { BaselineProps, RuntimeProps } from '@/lib/types';
import { registerGeneratedBlockI18n } from './blockI18nAutogen';

const DEFAULT_LANGUAGE = 'en';

/**
 * Initialize i18next lazily on first use. Idempotent — safe to call repeatedly.
 *
 * This is scaffolding. registerGeneratedBlockI18n() bulk-loads all bundled
 * translations at init time. Two directions this should evolve:
 *
 * 1. Dynamic blocks (from git repos, LLM-generated, etc.) should register
 *    their own translations on demand — same pattern as ensureBlock for
 *    content. addResourceBundle is already idempotent, so the transition
 *    is straightforward.
 *
 * 2. Dynamic UI translanguaging: a student requests Swahili, and the UI
 *    chrome translanguages just like content does. This would be a
 *    fetch() + addResourceBundle() at runtime, likely triggered from the
 *    same locale-change path that drives content translation.
 *
 * escapeValue: false because React already escapes. initImmediate: false
 * because we bundle all translations (no async loading yet).
 */
export function initBlockI18n() {
  if (i18n.isInitialized) return;

  i18n.use(initReactI18next).init({
    fallbackLng: DEFAULT_LANGUAGE,
    fallbackNS: 'common',
    interpolation: { escapeValue: false },
    initImmediate: false,
  });

  registerGeneratedBlockI18n();
}

// Derive namespace from block name: Sequential → "blocks/Sequential"
function blockNamespace(props: RuntimeProps): string {
  return `blocks/${props.loBlock.name}`;
}

/**
 * Translation hook for block UI strings.
 *
 *   const { t } = useBlockTranslation(props);
 *   t('next')              // "Next" or "التالي" depending on locale
 *   t('progress', { current: 3, total: 5 })  // "3 of 5"
 *
 * Namespace is auto-derived from the block name (e.g. "blocks/Sequential")
 * unless overridden.
 *
 * Falls back to the "common" namespace for shared strings ("Next",
 * "Previous", "{current} of {total}"). Block-specific keys override common.
 */
export function useBlockTranslation(
  props: BaselineProps,
  options: { namespace?: string; fallback?: string; keyPrefix?: string } = {}
) {
  const { namespace, fallback = 'common', keyPrefix } = options;
  initBlockI18n();

  const localeCode = props.runtime.locale.code || DEFAULT_LANGUAGE;

  const autoNamespace = ('loBlock' in props && 'nodeInfo' in props)
    ? blockNamespace(props as RuntimeProps)
    : undefined;

  const namespaces = [namespace ?? autoNamespace, fallback].filter(Boolean) as string[];

  // lng option gives us per-block locale without mutating global i18next state.
  // Two blocks with different lang= overrides each get their own language.
  const { t, ready } = useTranslation(namespaces, { keyPrefix, lng: localeCode });

  return { t, ready };
}
