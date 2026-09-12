import { createContext } from '@moeru/eventa/adapters/websocket/native'

/**
 * Creates a control-plane Eventa context backed by a native `WebSocket`.
 *
 * Use when:
 * - A remote plugin talks to the host over a WebSocket transport
 *
 * Expects:
 * - `webSocket` is already connected and managed by the caller
 *
 * Returns:
 * - An Eventa context that can be assigned to the active host channel
 */
export function createWebSocketHostChannel(webSocket: WebSocket) {
  // (audit) Eventa native WebSocket adapter handles framing; caller owns
  // connect/reconnect/close. No test exercises a live socket round-trip.
  return createContext(webSocket)
}

/**
 * Creates an extension Eventa transport backed by a native `WebSocket`.
 *
 * Use when:
 * - A peer transport carries extension protocol and invoke traffic over websocket
 *
 * Expects:
 * - `webSocket` is already connected and managed by the caller
 *
 * Returns:
 * - An Eventa context ready to pass into `createExtensionChannelScope`
 */
export function createWebSocketExtensionTransport(webSocket: WebSocket) {
  return createContext(webSocket)
}

/**
 * Creates a data-plane Eventa context backed by a native `WebSocket`.
 *
 * Use when:
 * - A remote plugin needs a WebSocket-backed shared data channel
 *
 * Expects:
 * - `webSocket` is already connected and managed by the caller
 *
 * Returns:
 * - An Eventa context that can be assigned to the active data channel
 */
export function createWebSocketDataChannel(webSocket: WebSocket) {
  // (audit) Same delegation as createWebSocketHostChannel — socket lifecycle
  // and message framing are the adapter's job; remote-plugin round-trip
  // remains untested.
  return createContext(webSocket)
}
