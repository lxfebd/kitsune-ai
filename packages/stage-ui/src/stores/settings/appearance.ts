import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * 界面外观可调项的预设值与 CSS 变量映射。
 *
 * 这些枚举在运行时映射为 CSS 变量值（如 `--settings-card-radius`），
 * 由 App.vue 的 watcher 注入到 documentElement，再被 UnoCSS shortcut
 * 和 settings.vue 布局消费。所有数值集中在这一处定义，避免散落。
 */
export const APPEARANCE_DEFAULTS = {
  /** 侧栏像素宽度。下限保证图标+短词不换行，上限避免在窄窗口占比过大。 */
  sidebarWidth: 192,
  /** 内容区最大宽度档位。compact 偏窄适合密集表单，wide 偏宽适合稀疏展示。 */
  contentMaxWidth: 'normal' as ContentMaxWidth,
  /** 卡片圆角档位。映射到不同的 border-radius 数值。 */
  cardRadius: 'normal' as CardRadius,
  /** 间距密度档位。缩放 padding 与 gap，影响信息密度。 */
  density: 'normal' as Density,
  /** 动效强度档位。off 关闭非必要动画，reduced 降低幅度，normal 默认。 */
  motionIntensity: 'normal' as MotionIntensity,
} as const

export type ContentMaxWidth = 'compact' | 'normal' | 'wide'
export type CardRadius = 'sharp' | 'normal' | 'round'
export type Density = 'compact' | 'normal' | 'comfortable'
export type MotionIntensity = 'off' | 'reduced' | 'normal'

/** 侧栏宽度滑块边界。低于 160px 中文 label 易换行，高于 240px 内容区过窄。 */
export const SIDEBAR_WIDTH_MIN = 160
export const SIDEBAR_WIDTH_MAX = 240
/** 步进 4px，与 UnoCSS 间距刻度对齐，避免出现非标准分数像素。 */
export const SIDEBAR_WIDTH_STEP = 4

/**
 * 内容区最大宽度档位到像素值的映射。
 * 数值与 Tailwind/UnoCSS 的 max-w-* 刻度一致，保证视觉节奏。
 */
export const CONTENT_MAX_WIDTH_PX: Record<ContentMaxWidth, string> = {
  compact: '896px', // max-w-4xl
  normal: '1024px', // max-w-5xl
  wide: '1152px', // max-w-6xl
}

/**
 * 卡片圆角档位到 CSS border-radius 值的映射。
 * sharp 偏专业克制，round 偏柔和可爱，呼应 Kitsune 的双字体气质。
 */
export const CARD_RADIUS_VALUE: Record<CardRadius, string> = {
  sharp: '0.5rem', // rounded-lg
  normal: '1rem', // rounded-2xl
  round: '1.5rem', // rounded-3xl
}

/**
 * 间距密度档位到缩放因子的映射。
 * 作为 padding 与 gap 的乘数，comfortable 留白更多，compact 信息更密。
 */
export const DENSITY_SCALE: Record<Density, string> = {
  compact: '0.8',
  normal: '1',
  comfortable: '1.2',
}

/**
 * 动效强度档位到 CSS 动画时长的映射。
 * off 将 transition 设为 0，reduced 压到 120ms 量级，normal 走默认。
 */
export const MOTION_DURATION: Record<MotionIntensity, string> = {
  off: '0s',
  reduced: '0.12s',
  normal: '0.2s',
}

export const useSettingsAppearance = defineStore('settings-appearance', () => {
  const sidebarWidth = useLocalStorageManualReset<number>(
    'settings/appearance/sidebar-width',
    APPEARANCE_DEFAULTS.sidebarWidth,
  )
  const contentMaxWidth = useLocalStorageManualReset<ContentMaxWidth>(
    'settings/appearance/content-max-width',
    APPEARANCE_DEFAULTS.contentMaxWidth,
  )
  const cardRadius = useLocalStorageManualReset<CardRadius>(
    'settings/appearance/card-radius',
    APPEARANCE_DEFAULTS.cardRadius,
  )
  const density = useLocalStorageManualReset<Density>(
    'settings/appearance/density',
    APPEARANCE_DEFAULTS.density,
  )
  const motionIntensity = useLocalStorageManualReset<MotionIntensity>(
    'settings/appearance/motion-intensity',
    APPEARANCE_DEFAULTS.motionIntensity,
  )

  function resetState() {
    sidebarWidth.reset()
    contentMaxWidth.reset()
    cardRadius.reset()
    density.reset()
    motionIntensity.reset()
  }

  return {
    sidebarWidth,
    contentMaxWidth,
    cardRadius,
    density,
    motionIntensity,
    resetState,
  }
})
