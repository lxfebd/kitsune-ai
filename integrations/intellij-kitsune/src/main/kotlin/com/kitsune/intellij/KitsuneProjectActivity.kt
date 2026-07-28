package com.kitsune.intellij

import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.kitsune.intellij.context.ContextCollector
import com.kitsune.intellij.context.EditorTracker
import com.kitsune.intellij.task.TaskExecutor
import com.kitsune.intellij.util.NotificationHelper
import com.kitsune.intellij.ws.KitsuneListener
import com.kitsune.intellij.ws.TaskExecutePayload

private val LOG = logger<KitsuneProjectActivity>()

/**
 * 项目启动 Activity：项目打开时注册上下文监听 + 任务执行器。
 *
 * 对齐 vscode-kitsune extension.ts 的 activate()：连接 Client、注册事件监听、
 * 订阅 task:execute、上下文推送。
 *
 * 资源释放：通过 Disposer.register(project, this) 挂到项目上，项目关闭时自动级联释放。
 */
class KitsuneProjectActivity : ProjectActivity, Disposable, KitsuneListener {

    private var project: Project? = null
    private var collector: ContextCollector? = null
    private var tracker: EditorTracker? = null
    private var executor: TaskExecutor? = null

    override suspend fun execute(project: Project) {
        this.project = project
        this.collector = ContextCollector()
        val plugin = KitsunePlugin.getInstance()
        plugin.client.setListener(this)

        this.executor = TaskExecutor(project) { result -> plugin.client.sendTaskResult(result) }

        this.tracker = EditorTracker(project) { event -> pushContext(event) }
        Disposer.register(this, tracker!!)
        tracker!!.start()

        // 文件保存监听：BulkFileListener.before + VFileContentChangeEvent（spec 指定 beforeContentsChange）
        project.messageBus.connect(this).subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun before(events: List<VFileEvent>) {
                for (event in events) {
                    if (event is VFileContentChangeEvent) {
                        tracker?.onFileSaved(event.file)
                    }
                }
            }
        })

        Disposer.register(project, this)
        NotificationHelper.notify(project, "Kitsune AI connected", NotificationType.INFORMATION)
    }

    override fun onReady() {
        pushContext("switch")
    }

    override fun onTaskExecute(payload: TaskExecutePayload) {
        executor?.execute(payload)
    }

    override fun onClosed(reason: String) {
        LOG.warn("Kitsune client closed: $reason")
    }

    private fun pushContext(event: String) {
        val p = project ?: return
        val c = collector ?: return
        val editor = FileEditorManager.getInstance(p).selectedTextEditor
        val ctx = c.collect(p, editor) ?: return
        val text = c.buildText(ctx, event)
        KitsunePlugin.getInstance().client.replaceContext(text)
    }

    override fun dispose() {
        // tracker / messageBus 通过 connect(this) 自动级联释放
        project = null
        collector = null
        tracker = null
        executor = null
    }
}
