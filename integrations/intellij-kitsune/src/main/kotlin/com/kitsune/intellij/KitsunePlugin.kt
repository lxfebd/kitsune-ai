package com.kitsune.intellij

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.kitsune.intellij.ws.KitsuneClient

/**
 * 应用级服务：持有 KitsuneClient 单例，跨项目共享 WebSocket 连接。
 * 对齐 vscode-kitsune 中 Client 为全局单例的模式。
 *
 * 通过 plugin.xml 的 `<applicationService>` 声明，应用启动时由平台实例化。
 */
class KitsunePlugin : Disposable {
    val client: KitsuneClient = KitsuneClient()

    init {
        client.connect()
    }

    override fun dispose() {
        client.dispose()
    }

    companion object {
        fun getInstance(): KitsunePlugin =
            ApplicationManager.getApplication().getService(KitsunePlugin::class.java)
    }
}
