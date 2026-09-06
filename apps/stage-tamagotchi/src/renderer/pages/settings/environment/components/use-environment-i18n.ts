import { useI18n } from 'vue-i18n'

/**
 * environment 设置页统一的 i18n 辅助。
 * 所有子面板共享同一 key 命名空间 `settings.pages.environment`。
 */
export function useEnvironmentI18n() {
  const { t } = useI18n()
  const tn = (key: string, params?: Record<string, unknown>) =>
    t(`settings.pages.environment.${key}`, params ?? {})
  return { t, tn }
}
