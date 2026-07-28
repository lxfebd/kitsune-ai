package com.kitsune.intellij.context

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/** 采集当前编辑器上下文，字段对齐 vscode-kitsune CodingContext 的子集（spec 要求 4 项） */
data class CodingContext(
    val filePath: String,
    val cursor: CursorPosition,
    val selection: String?,
    val gitBranch: String?,
)

data class CursorPosition(val line: Int, val column: Int)

class ContextCollector {

    fun collect(project: Project, editor: Editor?): CodingContext? {
        if (editor == null) return null
        val virtualFile = editor.virtualFile ?: return null
        val caret = editor.caretModel.currentCaret
        val logicalPos = caret.logicalPosition

        val filePath = virtualFile.path
        val cursor = CursorPosition(line = logicalPos.line, column = logicalPos.column)
        val selection = if (editor.selectionModel.hasSelection()) editor.selectionModel.selectedText else null
        val gitBranch = resolveGitBranch(project, virtualFile)

        return CodingContext(filePath, cursor, selection, gitBranch)
    }

    /** 拼装推送文本，格式对齐 vscode-kitsune extension.ts 的 replaceContext 文本 */
    fun buildText(ctx: CodingContext, event: String): String {
        val header = when (event) {
            "save" -> "User saved the file: ${ctx.filePath}."
            "switch" -> "User switched to file: ${ctx.filePath}."
            else -> "User opened file: ${ctx.filePath}, cursor at line ${ctx.cursor.line + 1}, character ${ctx.cursor.column + 1}."
        }
        val branch = ctx.gitBranch?.let { "\nGit branch: $it" } ?: ""
        val selection = ctx.selection?.takeIf { it.isNotEmpty() }?.let { "\nSelection:\n$it" } ?: ""
        return "$header$branch$selection"
    }

    /**
     * 通过反射软引用 git4idea，避免在未安装 Git4Idea 的产品中加载失败。
     * 对应 vscode-kitsune 通过 vscode.extensions.getExtension('vscode.git') 的可选引用。
     */
    private fun resolveGitBranch(project: Project, file: VirtualFile): String? {
        return try {
            val repoMgrClass = Class.forName("git4idea.repo.GitRepositoryManager")
            val getInstance = repoMgrClass.getMethod("getInstance", Project::class.java)
            val repoMgr = getInstance.invoke(null, project)
            val getRepository = repoMgrClass.getMethod("getRepositoryForFile", VirtualFile::class.java)
            val repo = getRepository.invoke(repoMgr, file) ?: return null
            val getCurrentBranch = repo.javaClass.getMethod("getCurrentBranchName")
            getCurrentBranch.invoke(repo) as? String
        } catch (_: ClassNotFoundException) {
            null
        } catch (_: NoSuchMethodException) {
            null
        }
    }
}
