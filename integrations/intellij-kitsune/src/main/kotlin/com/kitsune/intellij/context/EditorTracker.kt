package com.kitsune.intellij.context

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.CaretListener
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.editor.event.SelectionListener
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Alarm
import com.intellij.util.Alarm.ThreadToUse

/**
 * 编辑器事件监听：编辑器切换 / 光标移动 / 选区变化。
 * 光标与选区通过 Alarm 去抖 500ms，避免高频推送。
 * 对齐 vscode-kitsune 的 onDidChangeActiveTextEditor。
 *
 * @param onContext 事件触发时回调，参数为事件类型（switch/cursor/selection/save）
 */
class EditorTracker(
    private val project: Project,
    private val onContext: (String) -> Unit,
) : Disposable {

    private val debounceAlarm = Alarm(ThreadToUse.SWING_THREAD, this)
    private val connection = project.messageBus.connect(this)
    private val editorEventMulticaster = EditorFactory.getInstance().eventMulticaster

    fun start() {
        // 编辑器切换：FileEditorManagerListener.selectionChanged
        connection.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, object : FileEditorManagerListener {
            override fun selectionChanged(event: FileEditorManagerEvent) {
                trigger("switch")
            }
        })

        // 光标移动：EditorEventMulticaster.addCaretListener（2024.3+ 取代 CaretListener.CARET_TOPIC）
        editorEventMulticaster.addCaretListener(object : CaretListener {
            override fun caretPositionChanged(event: CaretEvent) {
                if (event.editor.project !== project) return
                trigger("cursor")
            }
        }, this)

        // 选区变化：EditorEventMulticaster.addSelectionListener（2024.3+ 取代 SelectionListener.SELECTION_TOPIC）
        editorEventMulticaster.addSelectionListener(object : SelectionListener {
            override fun selectionChanged(event: SelectionEvent) {
                if (event.editor.project !== project) return
                trigger("selection")
            }
        }, this)
    }

    /** 文件保存由外部 BulkFileListener 触发，调用此方法以统一去抖入口 */
    fun onFileSaved(file: VirtualFile) {
        val active = FileEditorManager.getInstance(project).selectedEditor?.file
        if (active === file) trigger("save")
    }

    private fun trigger(event: String) {
        debounceAlarm.cancelAllRequests()
        debounceAlarm.addRequest({ onContext(event) }, DEBOUNCE_MS)
    }

    override fun dispose() {
        // connection 通过 connect(this) 自动级联释放
        debounceAlarm.dispose()
    }

    companion object {
        private const val DEBOUNCE_MS = 500
    }
}
