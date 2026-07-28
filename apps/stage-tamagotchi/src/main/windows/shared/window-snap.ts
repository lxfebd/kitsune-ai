/**
 * 窗口贴靠管理器。
 *
 * 移植自 Mate-Engine 的 AvatarWindowHandler 吸附状态机。
 * 实现桌面宠物窗口吸附到其他应用程序窗口上沿的功能。
 *
 * 核心算法：
 * 1. 定期枚举系统窗口（节流到 8~15 FPS）
 * 2. 当用户拖拽桌宠窗口时，检测探针是否靠近某个窗口的上沿
 * 3. 满足条件后进入吸附状态，跟随目标窗口移动
 * 4. 支持 Guard Zone 防抖、Latch 锁定、SmoothDamp 平滑移动
 *
 * @see Mate-Engine/Assets/MATE ENGINE - Scripts/AvatarHandlers/AvatarWindowHandler.cs
 */

import type { BrowserWindow, Rectangle } from 'electron'

import { type EnumeratedWindow, enumerateWindows } from '../../libs/win32/window-enumerator'
import { type TaskbarInfo, getTaskbarInfo, isOverlappingTaskbar } from './taskbar'

// ========== 常量（移植自 Mate-Engine） ==========

/** 吸附探针半径（屏幕像素）。探针中心点与窗口上沿的距离小于此值时触发吸附。 */
const PROBE_RADIUS_PX = 24

/** 防重复吸附保护区半径。解吸后在此范围内不再次吸附。 */
const PROBE_GUARD_PX = 240

/** 解吸后冷却时间（毫秒）。 */
const UNSNAP_COOLDOWN_MS = 300

/** 吸附后保护帧数。在此期间不检查解吸条件。 */
const SNAP_GUARD_FRAMES = 8

/** 吸附后锁定帧数。在此期间即使探针离开也不解吸。 */
const SNAP_LATCH_FRAMES = 18

/** 平滑移动时间常量（秒）。越小越快。 */
const SNAP_SMOOTHING_TIME = 0.12

/** 平滑移动最大速度（像素/秒）。 */
const SNAP_SMOOTHING_MAX_SPEED = 6000

/** 窗口枚举间隔 - 活跃状态（毫秒）。 */
const WINDOW_ENUM_ACTIVE_MS = 66 // ~15 FPS

/** 窗口枚举间隔 - 空闲状态（毫秒）。 */
const WINDOW_ENUM_IDLE_MS = 125 // ~8 FPS

// ========== 类型定义 ==========

export type SnapState = 'idle' | 'snapped' | 'taskbar'

export interface SnapTarget {
  hwnd: number
  title: string
  rect: Rectangle
  isTaskbar: boolean
}

export interface SnapStatus {
  state: SnapState
  target: SnapTarget | null
  /** 吸附比例（水平位置 0~1），用于拖拽时更新。 */
  snapFraction: number
}

export interface WindowSnapOptions {
  /** 探针 Y 偏移（相对于窗口底部，正值向下）。默认 0。 */
  probeOffsetY?: number
  /** 是否启用平滑移动。默认 true。 */
  enableSmoothing?: boolean
}

// ========== SmoothDamp 实现 ==========

/**
 * 一维 SmoothDamp（移植自 Unity Mathf.SmoothDamp）。
 */
function smoothDamp(
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  maxSpeed: number,
  deltaTime: number,
): number {
  smoothTime = Math.max(0.0001, smoothTime)
  const omega = 2 / smoothTime
  const x = omega * deltaTime
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

  let change = current - target
  const maxChange = maxSpeed * smoothTime
  change = Math.min(Math.max(change, -maxChange), maxChange)

  const temp = (velocity.value + omega * change) * deltaTime
  velocity.value = (velocity.value - omega * temp) * exp

  let output = target + (change + temp) * exp
  // 防止过冲
  if ((target - current > 0) === (output > target)) {
    output = target
    velocity.value = (output - target) / deltaTime
  }

  return output
}

// ========== 窗口贴靠管理器 ==========

export class WindowSnapManager {
  private mainWindow: BrowserWindow
  private options: Required<WindowSnapOptions>

  // 窗口缓存
  private cachedWindows: EnumeratedWindow[] = []
  private lastEnumTime = 0

  // 吸附状态
  private state: SnapState = 'idle'
  private snappedTarget: EnumeratedWindow | null = null
  private snapFraction = 0.5
  private snapGuardFrames = 0
  private snapLatchFrames = 0
  private lastTargetRect: Rectangle | null = null

  // 解吸冷却
  private unsnapCooldownUntil = 0
  private recentUnsnapPos: { x: number, y: number } | null = null

  // 平滑移动
  private velocityX = { value: 0 }
  private velocityY = { value: 0 }
  private isSmoothing = false

  // 任务栏
  private taskbarInfo: TaskbarInfo | null = null

  // 自动吸附检测
  private lastAutoSnapTime = 0
  private autoSnapThrottleMs = 80

  // 运行状态
  private running = false
  private enumTimer: ReturnType<typeof setInterval> | null = null
  private moveTimer: ReturnType<typeof setInterval> | null = null

  // 事件回调
  private onStatusChange: ((status: SnapStatus) => void) | null = null

  constructor(mainWindow: BrowserWindow, options?: WindowSnapOptions) {
    this.mainWindow = mainWindow
    this.options = {
      probeOffsetY: options?.probeOffsetY ?? 0,
      enableSmoothing: options?.enableSmoothing ?? true,
    }
  }

  /**
   * 启动窗口贴靠管理器。
   * 开始定期枚举窗口并监听主窗口移动事件。
   */
  start(onStatusChange?: (status: SnapStatus) => void) {
    if (this.running) return
    this.running = true
    this.onStatusChange = onStatusChange ?? null

    // 刷新任务栏信息
    this.taskbarInfo = getTaskbarInfo(this.mainWindow)

    // 窗口枚举定时器
    this.enumTimer = setInterval(() => {
      this.refreshWindowCache()
    }, WINDOW_ENUM_IDLE_MS)

    // 跟随移动定时器（吸附状态下以 60fps 更新）
    this.moveTimer = setInterval(() => {
      if (this.state === 'snapped' && this.snappedTarget) {
        this.followTarget()
      }
    }, 16)

    // 监听主窗口移动，更新探针位置
    this.mainWindow.on('move', this.handleMainWindowMove)
    this.mainWindow.on('resize', this.handleMainWindowResize)
  }

  /**
   * 停止管理器并清理资源。
   */
  stop() {
    if (!this.running) return
    this.running = false

    if (this.enumTimer) {
      clearInterval(this.enumTimer)
      this.enumTimer = null
    }
    if (this.moveTimer) {
      clearInterval(this.moveTimer)
      this.moveTimer = null
    }

    this.mainWindow.removeListener('move', this.handleMainWindowMove)
    this.mainWindow.removeListener('resize', this.handleMainWindowResize)

    this.clearSnap()
    this.onStatusChange = null
  }

  /**
   * 获取当前吸附状态。
   */
  getStatus(): SnapStatus {
    return {
      state: this.state,
      target: this.snappedTarget
        ? {
            hwnd: this.snappedTarget.hwnd,
            title: this.snappedTarget.title,
            rect: this.snappedTarget.rect,
            isTaskbar: false,
          }
        : null,
      snapFraction: this.snapFraction,
    }
  }

  /**
   * 更新吸附比例（水平位置）。渲染进程拖拽时调用。
   */
  setSnapFraction(fraction: number) {
    this.snapFraction = Math.max(0, Math.min(1, fraction))
  }

  /**
   * 手动尝试解吸。用户拖拽离开时调用。
   */
  tryUnsnap() {
    if (this.state !== 'snapped' || !this.snappedTarget) return

    const mainBounds = this.mainWindow.getBounds()
    this.recentUnsnapPos = { x: mainBounds.x, y: mainBounds.y }
    this.clearSnap()
  }

  /**
   * 手动触发吸附检测。用户拖拽时调用。
   */
  trySnap(probeScreenX: number, probeScreenY: number) {
    if (this.state === 'snapped') return

    // 冷却期检查
    if (Date.now() < this.unsnapCooldownUntil) return

    // Guard Zone 检查
    if (this.recentUnsnapPos) {
      const dx = probeScreenX - this.recentUnsnapPos.x
      const dy = probeScreenY - this.recentUnsnapPos.y
      if (Math.sqrt(dx * dx + dy * dy) < PROBE_GUARD_PX) return
    }

    // 刷新窗口缓存（活跃模式）
    this.refreshWindowCache()

    // 找到最近的匹配窗口
    const target = this.findSnapTarget(probeScreenX, probeScreenY)
    if (!target) return

    // 执行吸附
    this.performSnap(target, probeScreenX)
  }

  // ========== 私有方法 ==========

  private handleMainWindowMove = () => {
    this.taskbarInfo = getTaskbarInfo(this.mainWindow)

    if (this.state === 'snapped') {
      // 检测用户是否在拖拽已吸附的窗口
      // 如果实际位置偏离跟随目标位置超过阈值，说明用户在拖拽，自动解吸
      if (this.snappedTarget && this.lastTargetRect) {
        const mainBounds = this.mainWindow.getBounds()
        const expectedX = this.lastTargetRect.x + this.snapFraction * this.lastTargetRect.width - mainBounds.width / 2
        const expectedY = this.lastTargetRect.y - mainBounds.height + this.options.probeOffsetY
        const dx = Math.abs(mainBounds.x - expectedX)
        const dy = Math.abs(mainBounds.y - expectedY)
        if (dx > 10 || dy > 10) {
          this.tryUnsnap()
          return
        }
      }
      // 否则由 followTarget 处理
      return
    }

    // 自动吸附检测：拖拽过程中检测探针是否靠近某个窗口上沿
    // 探针位置 = 桌宠窗口底部中心（角色"脚"的位置）
    const now = Date.now()
    if (now - this.lastAutoSnapTime < this.autoSnapThrottleMs) return
    this.lastAutoSnapTime = now

    const mainBounds = this.mainWindow.getBounds()
    const probeX = mainBounds.x + mainBounds.width / 2
    const probeY = mainBounds.y + mainBounds.height

    this.trySnap(probeX, probeY)
  }

  private handleMainWindowResize = () => {
    this.taskbarInfo = getTaskbarInfo(this.mainWindow)
  }

  /**
   * 刷新系统窗口缓存。
   */
  private refreshWindowCache() {
    const now = Date.now()
    const interval = this.state === 'snapped' ? WINDOW_ENUM_ACTIVE_MS : WINDOW_ENUM_IDLE_MS
    if (now - this.lastEnumTime < interval) return

    this.lastEnumTime = now
    this.cachedWindows = enumerateWindows()
  }

  /**
   * 在缓存窗口中查找吸附目标。
   * 探针必须在窗口水平范围内，且距离窗口上沿小于 PROBE_RADIUS_PX。
   */
  private findSnapTarget(probeX: number, probeY: number): EnumeratedWindow | null {
    let bestTarget: EnumeratedWindow | null = null
    let bestDistance = Infinity

    // 先检查任务栏
    if (this.taskbarInfo && this.taskbarInfo.position === 'bottom') {
      const mainBounds = this.mainWindow.getBounds()
      if (isOverlappingTaskbar(mainBounds, this.taskbarInfo)) {
        // 不直接吸附到任务栏，而是标记为任务栏模式
        return null
      }
    }

    for (const win of this.cachedWindows) {
      if (win.isMinimized) continue

      const { x, width, y } = win.rect

      // 水平命中：探针 X 在窗口范围内
      if (probeX < x || probeX > x + width) continue

      // 垂直命中：探针 Y 在窗口上沿附近
      const distance = Math.abs(probeY - y)
      if (distance > PROBE_RADIUS_PX) continue

      // 取最近的窗口
      if (distance < bestDistance) {
        bestDistance = distance
        bestTarget = win
      }
    }

    return bestTarget
  }

  /**
   * 执行吸附。
   */
  private performSnap(target: EnumeratedWindow, probeX: number) {
    this.state = 'snapped'
    this.snappedTarget = target
    this.lastTargetRect = { ...target.rect }
    this.snapGuardFrames = SNAP_GUARD_FRAMES
    this.snapLatchFrames = SNAP_LATCH_FRAMES

    // 计算水平吸附比例
    this.snapFraction = (probeX - target.rect.x) / target.rect.width
    this.snapFraction = Math.max(0, Math.min(1, this.snapFraction))

    // 重置平滑状态
    this.velocityX.value = 0
    this.velocityY.value = 0
    this.isSmoothing = true

    // 立即移动到目标位置
    this.pinToTarget(target.rect, false)

    this.emitStatus()
  }

  /**
   * 跟随目标窗口移动。每帧调用。
   */
  private followTarget() {
    if (!this.snappedTarget) return

    // 获取目标窗口最新位置（从缓存中更新）
    this.refreshWindowCache()
    const updated = this.cachedWindows.find(w => w.hwnd === this.snappedTarget!.hwnd)

    if (!updated) {
      // 目标窗口消失了
      this.clearSnap()
      return
    }

    if (updated.isMinimized) {
      this.clearSnap()
      return
    }

    // 更新目标矩形
    this.snappedTarget.rect = updated.rect
    this.lastTargetRect = { ...updated.rect }

    // 递减保护帧
    if (this.snapGuardFrames > 0) this.snapGuardFrames--
    if (this.snapLatchFrames > 0) this.snapLatchFrames--

    // 检查解吸条件（保护帧结束后）
    if (this.snapGuardFrames <= 0) {
      // 检查是否拖拽离开（通过渲染进程调用 tryUnsnap）
      // 这里不自动解吸，由渲染进程控制
    }

    // 移动到目标位置
    this.pinToTarget(updated.rect, this.options.enableSmoothing)
  }

  /**
   * 移动主窗口到目标窗口上沿位置。
   * 如果任务栏在底部，确保窗口不被任务栏遮挡。
   */
  private pinToTarget(targetRect: Rectangle, smooth: boolean) {
    const mainBounds = this.mainWindow.getBounds()

    // 目标位置计算
    const desiredX = targetRect.x + this.snapFraction * targetRect.width - mainBounds.width / 2
    let desiredY = targetRect.y - mainBounds.height + this.options.probeOffsetY

    // 任务栏感知：如果桌宠窗口底部会钻到任务栏下面，向上推
    if (this.taskbarInfo && this.taskbarInfo.position === 'bottom') {
      const taskbarTop = this.taskbarInfo.rect.y
      const petBottom = desiredY + mainBounds.height
      if (petBottom > taskbarTop) {
        desiredY = taskbarTop - mainBounds.height
      }
    }

    if (!smooth || !this.isSmoothing) {
      this.mainWindow.setPosition(Math.round(desiredX), Math.round(desiredY))
      this.isSmoothing = false
      return
    }

    // SmoothDamp 移动
    const deltaTime = 1 / 60 // 假设 60fps
    const newX = smoothDamp(
      mainBounds.x, desiredX, this.velocityX,
      SNAP_SMOOTHING_TIME, SNAP_SMOOTHING_MAX_SPEED, deltaTime,
    )
    const newY = smoothDamp(
      mainBounds.y, desiredY, this.velocityY,
      SNAP_SMOOTHING_TIME, SNAP_SMOOTHING_MAX_SPEED, deltaTime,
    )

    // 误差 <= 1px 时直接 snap
    if (Math.abs(newX - desiredX) <= 1 && Math.abs(newY - desiredY) <= 1) {
      this.mainWindow.setPosition(Math.round(desiredX), Math.round(desiredY))
      this.isSmoothing = false
      return
    }

    this.mainWindow.setPosition(Math.round(newX), Math.round(newY))
  }

  /**
   * 清除吸附状态。
   */
  private clearSnap() {
    const wasSnapped = this.state === 'snapped'
    this.state = 'idle'
    this.snappedTarget = null
    this.lastTargetRect = null
    this.isSmoothing = false
    this.velocityX.value = 0
    this.velocityY.value = 0

    if (wasSnapped) {
      this.unsnapCooldownUntil = Date.now() + UNSNAP_COOLDOWN_MS
    }

    this.emitStatus()
  }

  private emitStatus() {
    this.onStatusChange?.(this.getStatus())
  }
}
