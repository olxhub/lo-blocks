'use client';

import i18n from 'i18next';
import type { i18n as I18nInstance, TFunction } from 'i18next';
import { useEffect } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { BaselineProps, RuntimeProps, UserLocale } from '@/lib/types';
import { registerGeneratedBlockI18n } from './blockI18nAutogen';

const DEFAULT_LANGUAGE = 'en'; // fallback locale when locale input is missing/unrecognized => "en"

let isInitialized = false;     // ensure i18n setup runs once across all hook calls => false then true

interface BlockI18nOptions {
  namespace?: string;     // default namespace to load => "blocks/Sequential"
  fallback?: string;      // shared fallback namespace loaded after primary => "common"
  keyPrefix?: string;     // root path for keys => "navigation" in t('button') -> navigation.button
}

export interface BlockI18nResult {
  t: TFunction;       // translator bound to requested namespaces => t('next_label')
  i18n: I18nInstance; // i18next instance handle => i18n.changeLanguage('pl')
  ready: boolean;     // resource hydration done => true when translation hook is ready
}

function normalizeLocaleCode(localeCode: UserLocale | string): string { // "en-US" => "en", "es-MX" => "es"
  const normalized = localeCode.split(/[-:]/)[0];
  return normalized.trim().toLowerCase() || DEFAULT_LANGUAGE;
}

function hasBlockContext(props: BaselineProps): props is RuntimeProps { // detect full runtime context needed for block-derived namespace
  return 'loBlock' in props && 'nodeInfo' in props;
}

function resolveNamespaceFromProps(props: RuntimeProps): string { // map a runtime block to i18n namespace => blocks/Sequential
  return `blocks/${props.loBlock.name ?? props.nodeInfo.olxJson.tag}`;
}

export function initBlockI18n() { // initialize i18next once and register generated bundles
  if (isInitialized || i18n.isInitialized) return;

  i18n.use(initReactI18next).init({
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });

  registerGeneratedBlockI18n();

  isInitialized = true;
}

export function useBlockTranslation(
  props: BaselineProps,
  options: BlockI18nOptions = {}
): BlockI18nResult { // compose namespace selection + locale switch into a single block-friendly translation hook => useBlockTranslation(props, { namespace: 'blocks/Sequential', keyPrefix: 'navigation' })
  const { namespace, fallback = 'common', keyPrefix } = options;
  initBlockI18n();

  const localeCode = getUiLocale(props.runtime.locale.code);
  const namespaceFromProps = hasBlockContext(props) ? resolveNamespaceFromProps(props) : undefined;
  const namespaces = [
    namespace ?? namespaceFromProps,
    fallback,
  ].filter(Boolean);

  const translation = useTranslation(namespaces as string[], { keyPrefix }) as {
    t: TFunction;
    i18n: I18nInstance;
    ready: boolean;
  };

  useEffect(() => {
    translation.i18n.changeLanguage(localeCode);
  }, [translation.i18n, localeCode]);

  return {
    ...translation,
    t: translation.t,
    i18n: translation.i18n,
    ready: translation.ready,
  };
}

export function getUiLocale(localeCode: UserLocale | string = DEFAULT_LANGUAGE): string { // normalize locale once for all callers => "en-US" -> "en"
  return normalizeLocaleCode(localeCode);
}
