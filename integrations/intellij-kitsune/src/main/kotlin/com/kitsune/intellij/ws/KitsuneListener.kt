package com.kitsune.intellij.ws

/** KitsuneClient 事件回调接口，由调用方实现以接收握手就绪与反向任务 */
interface KitsuneListener {
    /** 协议握手完成（收到 announced 或 modules:sync），可开始推送 context:update */
    fun onReady()

    /** 收到 task:execute 事件，执行后需调用 KitsuneClient.sendTaskResult 回传结果 */
    fun onTaskExecute(payload: TaskExecutePayload)

    /** 连接已关闭（主动或异常），重连循环由 KitsuneClient 内部处理 */
    fun onClosed(reason: String)
}
