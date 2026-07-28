import { localeRemap } from '@kitsune/i18n'

// NOTICE: Privacy policy URLs are hardcoded here. When the docs system is mature,
// replace this with docs-owned metadata to prevent drift between app links and
// actual locales published under docs/content/*/about/privacy.md.
const supportedPrivacyPolicyLocales = new Set([
  'en',
  'ja',
  'zh-Hans',
])

export function getAnalyticsPrivacyPolicyUrl(locale?: string): string {
  const normalizedLocale = localeRemap[locale ?? 'en'] ?? locale ?? 'en'
  const docsLocale = supportedPrivacyPolicyLocales.has(normalizedLocale)
    ? normalizedLocale
    : 'en'

  // NOTICE: 待域名确定后更新
  return `https://kitsune.ai/docs/${docsLocale}/about/privacy`
}
