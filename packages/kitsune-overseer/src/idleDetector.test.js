/**
 * IdleDetector 测试
 *
 * 测试空闲检测、阈值触发、事件发布
 */

const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest')
const { IdleDetector } = require('./idleDetector')

describe('IdleDetector', () => {
  let detector
  let mockBus
  let mockLogger

  beforeEach(() => {
    vi.useFakeTimers()

    mockBus = {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    }

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
    }
  })

  afterEach(() => {
    if (detector) {
      detector.stop()
    }
    vi.useRealTimers()
  })

  describe('Constructor', () => {
    it('should initialize with default thresholds', () => {
      detector = new IdleDetector({ bus: mockBus, logger: mockLogger })

      expect(detector.thresholds).toEqual([300000, 600000])
      expect(detector.running).toBe(false)
    })

    it('should sort thresholds in ascending order', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [600000, 300000, 120000],
      })

      expect(detector.thresholds).toEqual([120000, 300000, 600000])
    })
  })

  describe('Start/Stop', () => {
    it('should start detection', () => {
      detector = new IdleDetector({ bus: mockBus, logger: mockLogger })

      detector.start()

      expect(detector.running).toBe(true)
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('已启动')
      )
    })

    it('should not start twice', () => {
      detector = new IdleDetector({ bus: mockBus, logger: mockLogger })

      detector.start()
      detector.start()

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('已在运行中')
      )
    })

    it('should stop detection', () => {
      detector = new IdleDetector({ bus: mockBus, logger: mockLogger })

      detector.start()
      detector.stop()

      expect(detector.running).toBe(false)
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('已停止')
      )
    })

    it('should not stop if not running', () => {
      detector = new IdleDetector({ bus: mockBus, logger: mockLogger })

      detector.stop()

      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('已停止')
      )
    })
  })

  describe('Idle Detection', () => {
    it('should trigger idle event after threshold', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [1000], // 1 second threshold
      })

      detector.start()

      // Fast forward 1.5 seconds
      vi.advanceTimersByTime(1500)

      expect(mockBus.publish).toHaveBeenCalledWith(
        'user.idle_timeout',
        expect.objectContaining({
          threshold: 1000,
          idleDurationMs: expect.any(Number),
        })
      )
    })

    it('should not trigger before threshold', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [5000], // 5 second threshold
      })

      detector.start()

      // Fast forward 2 seconds
      vi.advanceTimersByTime(2000)

      expect(mockBus.publish).not.toHaveBeenCalled()
    })

    it('should trigger multiple thresholds', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [1000, 2000], // 1s and 2s thresholds
      })

      detector.start()

      // Fast forward 2.5 seconds
      vi.advanceTimersByTime(2500)

      expect(mockBus.publish).toHaveBeenCalledTimes(2)
    })
  })

  describe('Reset Timer', () => {
    it('should reset idle timer', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [1000],
      })

      detector.start()

      // Fast forward 0.8 seconds
      vi.advanceTimersByTime(800)

      // Reset timer
      detector.resetTimer()

      // Fast forward another 0.8 seconds (total 1.6s from start, but only 0.8s from reset)
      vi.advanceTimersByTime(800)

      // Should not have triggered yet
      expect(mockBus.publish).not.toHaveBeenCalled()
    })
  })

  describe('Get Status', () => {
    it('should return current status', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [1000, 2000],
      })

      detector.start()

      const status = detector.getStatus()

      expect(status.running).toBe(true)
      expect(status.idleDurationMs).toBeGreaterThanOrEqual(0)
      expect(status.thresholds).toEqual([1000, 2000])
      expect(status.triggeredLevels).toEqual([])
    })

    it('should track triggered levels', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [1000],
      })

      detector.start()

      // Fast forward past threshold
      vi.advanceTimersByTime(1500)

      const status = detector.getStatus()

      expect(status.triggeredLevels).toContain(0)
    })
  })

  describe('Get Idle Duration', () => {
    it('should return idle duration', () => {
      detector = new IdleDetector({
        bus: mockBus,
        logger: mockLogger,
        thresholds: [10000],
      })

      detector.start()

      // Fast forward 3 seconds
      vi.advanceTimersByTime(3000)

      const duration = detector.getIdleDuration()

      expect(duration).toBeGreaterThanOrEqual(3000)
    })
  })
})
