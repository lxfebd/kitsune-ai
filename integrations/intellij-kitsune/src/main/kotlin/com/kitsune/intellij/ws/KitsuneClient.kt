package com.kitsune.intellij.ws

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.logger
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private val LOG = logger<KitsuneClient>()

/** 任务执行 payload，对齐 vscode-kitsune types.ts 的 TaskExecutePayload */
sealed class TaskExecutePayload(val taskId: String) {
    data class OpenFile(val taskId: String, val path: String, val line: Int?, val column: Int?) : TaskExecutePayload(taskId)
    data class InsertCode(val taskId: String, val code: String, val position: String?) : TaskExecutePayload(taskId)
    data class RunCommand(val taskId: String, val command: String, val args: List<String>?) : TaskExecutePayload(taskId)
}

data class TaskResultPayload(val taskId: String, val success: Boolean, val error: String? = null)

enum class ClientStatus { IDLE, CONNECTING, READY, RECONNECTING, CLOSED }

/**
 * 与 Kitsune Server Channel 的 WebSocket 客户端，复刻 @kitsune/server-sdk 的 Client 行为：
 * 模块握手、应用层心跳、无限重连、context:update / task:execute / task:result 事件收发。
 *
 * 协议帧结构：`{ type: string, data: object, metadata?: {...} }`，普通 JSON 互通。
 *
 * @param url Server Channel 地址
 * @param token 可选鉴权 token
 */
class KitsuneClient(
    private val url: String = Protocol.DEFAULT_URL,
    private val token: String? = null,
) {
    private val gson: Gson = GsonBuilder().disableHtmlEscaping().create()

    // OkHttp 关闭协议层 ping，由应用层 heartbeat 事件承担
    private val http by lazy {
        OkHttpClient.Builder()
            .pingInterval(0, TimeUnit.MILLISECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private val executor = Executors.newScheduledThreadPool(2) { r ->
        Thread(r, "kitsune-client").apply { isDaemon = true }
    }
    private val socketRef = AtomicReference<WebSocket?>(null)
    private val statusRef = AtomicReference(ClientStatus.IDLE)
    private var heartbeatTask: ScheduledFuture<*>? = null
    private var reconnectTask: ScheduledFuture<*>? = null
    private var listener: KitsuneListener? = null
    private var reconnectAttempts = 0

    // 协议握手身份：对应 server-sdk 的 identity.id
    private val identityId: String = "${System.currentTimeMillis().toString(36)}-${UUID.randomUUID().toString().take(8)}"

    val status: ClientStatus get() = statusRef.get()

    fun setListener(l: KitsuneListener) {
        listener = l
    }

    /** 启动连接（含握手 + 心跳 + 重连循环）。幂等。 */
    fun connect() {
        if (status == ClientStatus.READY || status == ClientStatus.CONNECTING) return
        scheduleConnect(0)
    }

    /** 主动断开，停止重连。 */
    fun disconnect() {
        statusRef.set(ClientStatus.CLOSED)
        reconnectTask?.cancel(false)
        stopHeartbeat()
        socketRef.getAndSet(null)?.close(1000, "client disconnect")
    }

    /** 释放全部资源（插件卸载时调用）。 */
    fun dispose() {
        disconnect()
        executor.shutdownNow()
    }

    /** 发送 context:update（ReplaceSelf 策略），对齐 vscode-kitsune Client.replaceContext */
    fun replaceContext(text: String) {
        val id = UUID.randomUUID().toString()
        val data = JsonObject().apply {
            addProperty("strategy", "replace_self")
            addProperty("text", text)
            addProperty("id", id)
            addProperty("contextId", id)
        }
        send(Protocol.EVT_CONTEXT_UPDATE, data)
    }

    /** 发送 task:result，对齐 vscode-kitsune Client.sendTaskResult */
    fun sendTaskResult(result: TaskResultPayload) {
        val data = JsonObject().apply {
            addProperty("taskId", result.taskId)
            addProperty("success", result.success)
            result.error?.let { addProperty("error", it) }
        }
        send(Protocol.EVT_TASK_RESULT, data)
    }

    private fun send(type: String, data: JsonObject): Boolean {
        val socket = socketRef.get() ?: return false
        val frame = buildFrame(type, data)
        return socket.send(gson.toJson(frame))
    }

    /** 注入 metadata.source，对齐 server-sdk createPayload */
    private fun buildFrame(type: String, data: JsonObject): JsonObject {
        val source = JsonObject().apply {
            addProperty("kind", Protocol.SOURCE_KIND)
            addProperty("id", identityId)
            val extension = JsonObject().apply { addProperty("id", Protocol.MODULE_NAME) }
            add("extension", extension)
            val plugin = JsonObject().apply { addProperty("id", Protocol.MODULE_NAME) }
            add("plugin", plugin)
        }
        val metadata = JsonObject().apply {
            add("source", source)
            addProperty("event", UUID.randomUUID().toString())
        }
        return JsonObject().apply {
            addProperty("type", type)
            add("data", data)
            add("metadata", metadata)
        }
    }

    private fun scheduleConnect(delayMs: Long) {
        if (status == ClientStatus.CLOSED) return
        reconnectTask?.cancel(false)
        reconnectTask = executor.schedule({ doConnect() }, delayMs, TimeUnit.MILLISECONDS)
    }

    private fun doConnect() {
        if (status == ClientStatus.CLOSED) return
        statusRef.set(ClientStatus.CONNECTING)
        val request = Request.Builder().url(url).build()
        val readyLatch = CountDownLatch(1)
        val socket = http.newWebSocket(request, SocketListener(readyLatch))
        socketRef.set(socket)

        // 握手等待：announce 后等服务端回 announced 或 modules:sync
        try {
            if (!readyLatch.await(Protocol.HANDSHAKE_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                LOG.warn("Kitsune handshake timeout, reconnecting")
                socket.close(1001, "handshake timeout")
                scheduleReconnect()
                return
            }
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            return
        }

        reconnectAttempts = 0
        statusRef.set(ClientStatus.READY)
        LOG.info("Kitsune connected to Server Channel")
        startHeartbeat()
        listener?.onReady()
    }

    private fun scheduleReconnect() {
        if (status == ClientStatus.CLOSED) return
        statusRef.set(ClientStatus.RECONNECTING)
        // 指数退避：1s, 2s, 4s, 8s, 16s, 30s, 30s...
        val backoff = (1_000L shl reconnectAttempts.coerceAtMost(5)).coerceAtMost(Protocol.MAX_BACKOFF_MS)
        reconnectAttempts++
        LOG.warn("Kitsune reconnecting in ${backoff}ms (attempt $reconnectAttempts)")
        scheduleConnect(backoff)
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatTask = executor.scheduleAtFixedRate({
            val data = JsonObject().apply {
                addProperty("kind", "ping")
                addProperty("message", "ping")
                addProperty("at", System.currentTimeMillis())
            }
            send(Protocol.EVT_HEARTBEAT, data)
        }, Protocol.HEARTBEAT_INTERVAL_MS, Protocol.HEARTBEAT_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    private fun stopHeartbeat() {
        heartbeatTask?.cancel(false)
        heartbeatTask = null
    }

    /** 解析 task:execute payload，对齐 vscode-kitsune types.ts 的三种任务类型 */
    private fun parseTaskExecute(data: JsonObject): TaskExecutePayload? {
        val taskId = data.get("taskId")?.asString ?: return null
        val type = data.get("type")?.asString ?: return null
        return when (type) {
            "open_file" -> TaskExecutePayload.OpenFile(
                taskId = taskId,
                path = data.get("path")?.asString ?: return null,
                line = data.get("line")?.takeIf { !it.isJsonNull }?.asInt,
                column = data.get("column")?.takeIf { !it.isJsonNull }?.asInt,
            )
            "insert_code" -> TaskExecutePayload.InsertCode(
                taskId = taskId,
                code = data.get("code")?.asString ?: return null,
                position = data.get("position")?.takeIf { !it.isJsonNull }?.asString,
            )
            "run_command" -> TaskExecutePayload.RunCommand(
                taskId = taskId,
                command = data.get("command")?.asString ?: return null,
                args = data.get("args")?.takeIf { it.isJsonArray }?.asJsonArray?.map { it.asString },
            )
            else -> null
        }
    }

    private inner class SocketListener(private val readyLatch: CountDownLatch) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            LOG.info("WebSocket transport open, starting protocol handshake")
            // 1. 鉴权（可选）
            token?.let {
                val data = JsonObject().apply { addProperty("token", it) }
                send(Protocol.EVT_AUTHENTICATE, data)
            }
            // 2. 模块注册
            val identity = JsonObject().apply {
                addProperty("id", identityId)
                val extension = JsonObject().apply { addProperty("id", Protocol.MODULE_NAME) }
                add("extension", extension)
            }
            val possibleEvents = listOf(
                Protocol.EVT_CONTEXT_UPDATE,
                Protocol.EVT_TASK_EXECUTE,
                Protocol.EVT_TASK_RESULT,
                Protocol.EVT_HEARTBEAT,
            )
            val data = JsonObject().apply {
                addProperty("name", Protocol.MODULE_NAME)
                add("identity", identity)
                add("possibleEvents", gson.toJsonTree(possibleEvents))
            }
            send(Protocol.EVT_ANNOUNCE, data)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val msg = JsonParser.parseString(text).asJsonObject
            val type = msg.get("type")?.asString ?: return
            handleIncoming(type, msg)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            LOG.warn("WebSocket failure: ${t.message}")
            socketRef.set(null)
            stopHeartbeat()
            readyLatch.countDown()
            listener?.onClosed(t.message ?: "failure")
            scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            LOG.info("WebSocket closed: $code $reason")
            socketRef.set(null)
            stopHeartbeat()
            readyLatch.countDown()
            listener?.onClosed(reason)
            scheduleReconnect()
        }

        private fun handleIncoming(type: String, msg: JsonObject) {
            val data = msg.getAsJsonObject("data") ?: JsonObject()
            when (type) {
                Protocol.EVT_ANNOUNCED, Protocol.EVT_MODULES_SYNC -> readyLatch.countDown()
                Protocol.EVT_HEARTBEAT -> {
                    if (data.get("kind")?.asString == "ping") {
                        val pong = JsonObject().apply {
                            addProperty("kind", "pong")
                            addProperty("message", "pong")
                            addProperty("at", System.currentTimeMillis())
                        }
                        send(Protocol.EVT_HEARTBEAT, pong)
                    }
                }
                Protocol.EVT_TASK_EXECUTE -> {
                    parseTaskExecute(data)?.let { listener?.onTaskExecute(it) }
                }
                "error" -> LOG.warn("Server error: ${msg.get("data")}")
            }
        }
    }
}
