import type { WebSocketEvents } from '@kitsune/server-sdk';
import type { FlowEntry, PreviewItem } from '../context-flow-types';
declare function truncateText(value: string, limit?: number): string;
declare function formatDestinations(destinations: unknown): string;
declare function getPayloadData(entry: FlowEntry): any;
declare function getEventSource(entry: FlowEntry): string | undefined;
declare function summarizeContextUpdate(update: {
    text?: string;
    content?: unknown;
    destinations?: unknown;
}): string;
declare function buildPreviewItems(entry: FlowEntry): PreviewItem[];
declare function buildSparkCommandPreview(command: WebSocketEvents['spark:command']): PreviewItem[];
declare function formatTimestamp(value: number): string;
declare function formatPayload(payload: unknown): string;
export declare function useContextFlowFormatters(): {
    buildPreviewItems: typeof buildPreviewItems;
    buildSparkCommandPreview: typeof buildSparkCommandPreview;
    formatDestinations: typeof formatDestinations;
    formatPayload: typeof formatPayload;
    formatTimestamp: typeof formatTimestamp;
    getEventSource: typeof getEventSource;
    getPayloadData: typeof getPayloadData;
    summarizeContextUpdate: typeof summarizeContextUpdate;
    truncateText: typeof truncateText;
};

