package com.kitsune.intellij.ws

/** Kitsune Server Channel 协议常量，对齐 vscode-kitsune 的事件类型与端点 */
object Protocol {
    const val DEFAULT_URL = "ws://localhost:6121/ws"

    /** 模块名，对齐 vscode-kitsune 的 `proj-kitsune:plugin-vscode` */
    const val MODULE_NAME = "proj-kitsune:plugin-intellij"

    /** metadata.source.kind，对齐 server-sdk 的 createPayload */
    const val SOURCE_KIND = "plugin"

    // 握手事件
    const val EVT_AUTHENTICATE = "module:authenticate"
    const val EVT_AUTHENTICATED = "module:authenticated"
    const val EVT_ANNOUNCE = "extension:module:announce"
    const val EVT_ANNOUNCED = "extension:module:announced"
    const val EVT_MODULES_SYNC = "registry:modules:sync"

    // 心跳
    const val EVT_HEARTBEAT = "transport:connection:heartbeat"

    // 上下文推送
    const val EVT_CONTEXT_UPDATE = "context:update"

    // 任务
    const val EVT_TASK_EXECUTE = "task:execute"
    const val EVT_TASK_RESULT = "task:result"

    const val HEARTBEAT_INTERVAL_MS = 15_000L
    const val HANDSHAKE_TIMEOUT_MS = 15_000L
    const val MAX_BACKOFF_MS = 30_000L
}
