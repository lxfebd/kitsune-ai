/**
 * Server channel wire-protocol 共享常量。
 *
 * 三处曾各自硬编码 `/ws` / 6121（channel-server、server-runtime 路由、server-sdk 默认 URL），
 * 2026-09-07 统一到这里，避免改端口/路径时漏改（见 channel-server TODO）。
 */

/** Server channel WS 默认端口（6121） */
export const SERVER_CHANNEL_DEFAULT_PORT = 6121

/** Server channel WS 挂载路径（H3 路由 /ws） */
export const SERVER_CHANNEL_WS_PATH = '/ws'
