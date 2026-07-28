package com.kitsune.intellij.util

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project

/** 通知辅助，统一使用 plugin.xml 声明的 "Kitsune AI" 通知组 */
object NotificationHelper {

    fun notify(project: Project?, content: String, type: NotificationType = NotificationType.INFORMATION) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("Kitsune AI")
            .createNotification(content, type)
            .notify(project)
    }
}
