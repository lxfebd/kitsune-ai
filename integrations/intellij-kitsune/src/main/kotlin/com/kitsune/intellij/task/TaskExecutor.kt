package com.kitsune.intellij.task

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.kitsune.intellij.util.NotificationHelper
import com.kitsune.intellij.ws.TaskExecutePayload
import com.kitsune.intellij.ws.TaskResultPayload

private val LOG = logger<TaskExecutor>()

/**
 * 执行 Server Channel 下发的任务，对齐 vscode-kitsune extension.ts 的 executeTask。
 * 所有任务在 EDT 或 write context 中执行，完成后回传 task:result。
 */
class TaskExecutor(
    private val project: Project,
    private val onResult: (TaskResultPayload) -> Unit,
) {

    fun execute(payload: TaskExecutePayload) {
        ApplicationManager.getApplication().invokeLater {
            val result = try {
                when (payload) {
                    is TaskExecutePayload.OpenFile -> doOpenFile(payload)
                    is TaskExecutePayload.InsertCode -> doInsertCode(payload)
                    is TaskExecutePayload.RunCommand -> doRunCommand(payload)
                }
                TaskResultPayload(taskId = payload.taskId, success = true)
            } catch (t: Throwable) {
                LOG.warn("Task ${payload.taskId} failed: ${t.message}")
                NotificationHelper.notify(project, "Kitsune task failed: ${t.message}", NotificationType.WARNING)
                TaskResultPayload(taskId = payload.taskId, success = false, error = t.message ?: t::class.java.simpleName)
            }
            onResult(result)
        }
    }

    private fun doOpenFile(payload: TaskExecutePayload.OpenFile) {
        val virtualFile = LocalFileSystem.getInstance().findFileByPath(payload.path)
            ?: throw IllegalStateException("File not found: ${payload.path}")
        val descriptor = if (payload.line != null) {
            OpenFileDescriptor(project, virtualFile, payload.line, payload.column ?: 0)
        } else {
            OpenFileDescriptor(project, virtualFile)
        }
        FileEditorManager.getInstance(project).openTextEditor(descriptor, true)
            ?: throw IllegalStateException("Failed to open editor for ${payload.path}")
    }

    private fun doInsertCode(payload: TaskExecutePayload.InsertCode) {
        val editor = FileEditorManager.getInstance(project).selectedTextEditor
            ?: throw IllegalStateException("No active text editor")
        val document = editor.document
        val offset = when (payload.position) {
            "end" -> document.textLength
            else -> editor.caretModel.offset
        }
        // 文档写入必须在 write context 中执行，对应 vscode 的 editor.edit(builder => ...)
        WriteCommandAction.runWriteCommandAction(project, "Kitsune AI Insert", null, {
            document.insertString(offset, payload.code)
        })
    }

    private fun doRunCommand(payload: TaskExecutePayload.RunCommand) {
        // 对应 vscode 的 window.activeTerminal.sendText(fullCommand)
        // 这里使用 GeneralCommandLine + OSProcessHandler 直接执行；
        // 若需复用 IDE 终端窗口，可改用 TerminalView（需终端插件依赖）。
        val commandLine = GeneralCommandLine().apply {
            exePath = payload.command
            payload.args?.let { addParameters(it) }
            workDirectory = project.basePath
        }
        val handler = OSProcessHandler(commandLine)
        handler.addProcessListener(object : ProcessAdapter() {
            override fun processTerminated(event: ProcessEvent) {
                val type = if (event.exitCode == 0) NotificationType.INFORMATION else NotificationType.WARNING
                NotificationHelper.notify(project, "Command exited ${event.exitCode}: ${payload.command}", type)
            }
        })
        handler.startNotify()
    }
}
