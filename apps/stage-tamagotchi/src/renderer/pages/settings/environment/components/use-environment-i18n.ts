import { useI18n } from 'vue-i18n'

/**
 * environment 设置页统一的 i18n 辅助。
 * 所有子面板共享同一 key 命名空间 `settings.pages.environment`。
 * 子面板页（mcp-agent 等）用 `tmc`（tn mcp-agent）指向 `settings.pages.environment.mcp-agent`。
 */
export function useEnvironmentI18n() {
  const { t } = useI18n()
  const tn = (key: string, params?: Record<string, unknown>) =>
    t(`settings.pages.environment.${key}`, params ?? {})
  const tmc = (key: string, params?: Record<string, unknown>) =>
    t(`settings.pages.environment.mcp-agent.${key}`, params ?? {})
  return { t, tn, tmc }
}
