import { createContext } from '@moeru/eventa/adapters/event-target'

/**
 * Creates a control-plane Eventa context backed by a local `EventTarget`.
 *
 * Use when:
 * - A browser-like runtime wants an in-process host channel transport
 *
 * Expects:
 * - `eventTarget` dispatches and listens for the Eventa adapter event format
 *
 * Returns:
 * - An Eventa context that can be assigned to the active host channel
 */
export function createEventTargetHostChannel(eventTarget: EventTarget) {
  // (audit) Adapter wiring is delegated to createContext; in-process transport
  // round-trips are not exercised by any test yet — add one when a real
  // browser-like host lands.
  return createContext(eventTarget)
}

/**
 * Creates an extension Eventa transport backed by a local `EventTarget`.
 *
 * Use when:
 * - A web-like host bridges extension traffic through an in-process event target
 *
 * Expects:
 * - `eventTarget` dispatches and listens for the Eventa adapter event format
 *
 * Returns:
 * - An Eventa context ready to pass into `createExtensionChannelScope`
 */
export function createEventTargetExtensionTransport(eventTarget: EventTarget) {
  return createContext(eventTarget)
}

/**
 * Creates a data-plane Eventa context backed by a local `EventTarget`.
 *
 * Use when:
 * - A browser-like runtime wants an in-process shared data channel transport
 *
 * Expects:
 * - `eventTarget` dispatches and listens for the Eventa adapter event format
 *
 * Returns:
 * - An Eventa context that can be assigned to the active data channel
 */
export function createEventTargetDataChannel(eventTarget: EventTarget) {
  // (audit) Same delegation as createEventTargetHostChannel — unverified
  // in-process data-plane round-trip, no test coverage yet.
  return createContext(eventTarget)
}
