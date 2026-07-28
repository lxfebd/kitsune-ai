/**
 * 窗口贴靠 IPC 服务。
 *
 * 将 WindowSnapManager 和任务栏感知功能通过 Eventa IPC 暴露给渲染进程。
 */

import type { BrowserWindow } from 'electron'
import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  type TaskbarInfoSnapshot,
  type WindowSnapStatus,
  taskbarGetInfo,
  windowSnapGetStatus,
  windowSnapSetFraction,
  windowSnapStatusChanged,
  windowSnapTrySnap,
  windowSnapUnsnap,
} from '../../../../shared/eventa'
import { getTaskbarInfo, isOverlappingTaskbar } from '../../../windows/shared/taskbar'
import { WindowSnapManager } from '../../../windows/shared/window-snap'

export interface WindowSnapServiceOptions {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
}

/**
 * 创建窗口贴靠服务。
 *
 * 注册所有 window-snap 和 taskbar 相关的 IPC handler，
 * 并启动 WindowSnapManager 后台窗口枚举。
 */
export function createWindowSnapService(options: WindowSnapServiceOptions) {
  const { context, window } = options

  const manager = new WindowSnapManager(window, {
    enableSmoothing: true,
  })

  // 启动管理器，状态变更时通过 IPC 推送给渲染进程
  manager.start((status: WindowSnapStatus) => {
    context.emit(windowSnapStatusChanged, status)
  })

  // 获取当前贴靠状态
  defineInvokeHandler(context, windowSnapGetStatus, () => {
    return manager.getStatus()
  })

  // 尝试吸附
  defineInvokeHandler(context, windowSnapTrySnap, (payload) => {
    manager.trySnap(payload.screenX, payload.screenY)
  })

  // 解吸
  defineInvokeHandler(context, windowSnapUnsnap, () => {
    manager.tryUnsnap()
  })

  // 更新吸附比例
  defineInvokeHandler(context, windowSnapSetFraction, (payload) => {
    manager.setSnapFraction(payload.fraction)
  })

  // 任务栏信息
  defineInvokeHandler(context, taskbarGetInfo, () => {
    const info = getTaskbarInfo(window)
    if (!info) return null

    const mainBounds = window.getBounds()
    const snapshot: TaskbarInfoSnapshot = {
      position: info.position,
      rect: info.rect,
      thickness: info.thickness,
      isOverlapping: isOverlappingTaskbar(mainBounds, info),
    }
    return snapshot
  })

  // 窗口关闭时清理
  window.on('closed', () => {
    manager.stop()
  })

  return { manager }
}
