// Domain: plugins — eventa IPC 契约按域拆分
// 插件域契约统一由 plugin/* 子模块提供（plugin/host.ts、plugin/capabilities.ts 等），
// 此处只透传，避免与子模块重复定义导致类型漂移（PluginManifestSummary 含 autoReload 等）。
export * from '../plugin/assets'
export * from '../plugin/capabilities'
export * from '../plugin/events'
export * from '../plugin/host'
export * from '../plugin/tools'
