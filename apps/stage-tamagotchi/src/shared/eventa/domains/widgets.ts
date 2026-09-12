// Domain: widgets — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export interface WidgetWindowSize {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type WidgetGridSize = 's' | 'm' | 'l' | { cols?: number, rows?: number }

export interface WidgetsAddPayload {
  id?: string
  componentName: string
  componentProps?: Record<string, any>
  // size presets or explicit spans; renderer decides mapping
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  // auto-dismiss in ms; if omitted, persistent until closed by user
  ttlMs?: number
}

export interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, any>
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  ttlMs?: number
}

export interface WidgetSnapshot {
  id: string
  componentName: string
  componentProps: Record<string, any>
  size: WidgetGridSize
  windowSize?: WidgetWindowSize
  ttlMs: number
}

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:open')
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:hide')
export const widgetsAdd = defineInvokeEventa<string | undefined, WidgetsAddPayload>('eventa:invoke:electron:windows:widgets:add')
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>('eventa:invoke:electron:windows:widgets:update')
export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | void, { id: string }>('eventa:invoke:electron:windows:widgets:fetch')
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>('eventa:invoke:electron:windows:widgets:prepare')
export const widgetsIframePublish = defineInvokeEventa<void, { id: string, event: Record<string, unknown> }>('eventa:invoke:electron:windows:widgets:iframe-publish')

export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')

// Persona system events
