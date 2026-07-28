/**
 * 任务栏感知模块。
 *
 * 通过 Electron 的 `screen` API 推算任务栏位置和尺寸。
 * 移植自 Mate-Engine 的 MonitorHelper.GetTaskbarRectForWindow 逻辑，
 * 使用 display.bounds vs display.workArea 差值替代 Win32 SHAppBarMessage。
 *
 * @see Mate-Engine/Assets/MATE ENGINE - Scripts/Settings/MonitorHelper.cs
 */

import type { BrowserWindow, Rectangle } from 'electron'

import { screen } from 'electron'

export type TaskbarPosition = 'bottom' | 'top' | 'left' | 'right'

export interface TaskbarInfo {
  position: TaskbarPosition
  /** 任务栏矩形（屏幕坐标）。 */
  rect: Rectangle
  /** 任务栏厚度（像素）。bottom/top 时为高度，left/right 时为宽度。 */
  thickness: number
}

/**
 * 获取指定窗口所在显示器的任务栏信息。
 *
 * 算法：比较显示器全屏矩形 (bounds) 和工作区矩形 (workArea) 的四条边差异。
 * 哪条边有差值，任务栏就在哪个方向。
 *
 * @param window Electron BrowserWindow，用于确定所在显示器
 * @returns 任务栏位置和矩形；如果无法检测（如全屏或无任务栏）则返回 null
 */
export function getTaskbarInfo(window: BrowserWindow): TaskbarInfo | null {
  const bounds = window.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const mon = display.bounds
  const work = display.workArea

  // 无差异 = 无可见任务栏
  if (mon.x === work.x && mon.y === work.y
    && mon.width === work.width && mon.height === work.height) {
    return null
  }

  // 任务栏在顶部：workArea 的 y > 显示器的 y
  if (work.y > mon.y) {
    const thickness = work.y - mon.y
    return {
      position: 'top',
      rect: { x: mon.x, y: mon.y, width: mon.width, height: thickness },
      thickness,
    }
  }

  // 任务栏在左侧：workArea 的 x > 显示器的 x
  if (work.x > mon.x) {
    const thickness = work.x - mon.x
    return {
      position: 'left',
      rect: { x: mon.x, y: mon.y, width: thickness, height: mon.height },
      thickness,
    }
  }

  // 任务栏在右侧：workArea 右边 < 显示器右边
  if (work.x + work.width < mon.x + mon.width) {
    const thickness = (mon.x + mon.width) - (work.x + work.width)
    return {
      position: 'right',
      rect: { x: work.x + work.width, y: mon.y, width: thickness, height: mon.height },
      thickness,
    }
  }

  // 任务栏在底部：workArea 底边 < 显示器底边（最常见情况）
  if (work.y + work.height < mon.y + mon.height) {
    const thickness = (mon.y + mon.height) - (work.y + work.height)
    return {
      position: 'bottom',
      rect: { x: mon.x, y: work.y + work.height, width: mon.width, height: thickness },
      thickness,
    }
  }

  return null
}

/**
 * 检查窗口底部是否与任务栏顶部重叠（用于判断桌宠是否"坐在"任务栏上）。
 *
 * 移植自 Mate-Engine 的 AvatarTaskbarController 粉红区检测逻辑。
 *
 * @param windowRect 桌宠窗口的屏幕矩形
 * @param taskbarInfo 任务栏信息
 * @param overlapThreshold 重叠阈值（像素），默认 10px
 * @returns 是否重叠
 */
export function isOverlappingTaskbar(
  windowRect: Rectangle,
  taskbarInfo: TaskbarInfo,
  overlapThreshold: number = 10,
): boolean {
  if (taskbarInfo.position !== 'bottom') return false

  const windowBottom = windowRect.y + windowRect.height
  const taskbarTop = taskbarInfo.rect.y

  // 窗口底部与任务栏顶部的距离
  const distance = windowBottom - taskbarTop

  // 窗口底部进入任务栏区域 10px 以内视为重叠
  return distance >= -overlapThreshold && distance <= taskbarInfo.thickness
}

/**
 * 获取窗口应该吸附到任务栏时的目标 Y 坐标。
 * 使窗口底部刚好贴在任务栏顶部。
 */
export function getSnapToTaskbarY(windowRect: Rectangle, taskbarInfo: TaskbarInfo): number {
  if (taskbarInfo.position !== 'bottom') return windowRect.y
  return taskbarInfo.rect.y - windowRect.height
}
