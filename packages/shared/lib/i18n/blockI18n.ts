'use client';

import i18n from 'i18next';
import { useEffect } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import { registerGeneratedBlockI18n } from './blockI18nAutogen';

const DEFAULT_LANGUAGE = 'en';

let isInitialized = false;

function normalizeLocaleCode(localeCode?: string): string {
  if (!localeCode) return DEFAULT_LANGUAGE;
  const normalized = localeCode.split(/[-:]/)[0];
  return normalized.trim().toLowerCase() || DEFAULT_LANGUAGE;
}

function resolveNamespaceFromProps(props: any): string {
  const tag = props?.nodeInfo?.olxJson?.tag || props?.tag || props?.runtime?.blockName || props?.runtime?.name;
  return `blocks/${props?.loBlock?.name ?? tag ?? 'common'}`;
}

export function initBlockI18n() {
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
  props: any,
  options: { namespace?: string; fallback?: string; keyPrefix?: string } = {}
) {
  const { namespace, fallback = 'common', keyPrefix } = options;
  initBlockI18n();

  const localeCode = getUiLocale(props?.runtime?.locale?.code);
  const namespaces = [
    namespace ?? resolveNamespaceFromProps(props),
    fallback,
  ].filter(Boolean);

  const translation = useTranslation(namespaces as string[], { keyPrefix }) as any;

  const translationFn = translation.t ?? translation[0];
  const translationI18n = translation.i18n ?? translation[1];

  useEffect(() => {
    translationI18n?.changeLanguage?.(localeCode);
  }, [translationI18n, localeCode]);

  return {
    ...translation,
    t: translationFn,
    i18n: translationI18n,
    ready: translation.ready ?? translation[2],
  };
}

export function getUiLocale(localeCode?: string): string {
  return normalizeLocaleCode(localeCode);
}
