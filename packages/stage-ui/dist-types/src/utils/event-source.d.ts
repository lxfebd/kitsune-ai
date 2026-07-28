import type { MetadataEventSource } from '@kitsune/server-sdk';
interface EventSourcePayload {
    source?: string;
    metadata?: {
        source?: MetadataEventSource;
    };
}
/**
 * Returns a human-readable source label for extension identities.
 *
 * Use when:
 * - UI stores need to display or compare websocket event sources
 * - Protocol metadata may come from extension, module, or kit peers
 *
 * Expects:
 * - `source` is a protocol metadata identity from server-shared/server-sdk
 *
 * Returns:
 * - A stable label, preferring extension-scoped module ids
 */
export declare function getMetadataSourceLabel(source?: MetadataEventSource): string | undefined;
export declare function getEventSourceKey(event: EventSourcePayload, fallback?: string): string;

