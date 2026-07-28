import type { EventEnvelope } from './events';
export type GatewayEvent = EventEnvelope;
export interface GatewayChannel {
    name: string;
    in?: ReadableStream<GatewayEvent>;
    out?: (event: GatewayEvent) => void;
    canHandle?: (event: GatewayEvent) => boolean;
}
export interface GatewayRoute {
    match: (event: GatewayEvent) => boolean;
    to: string[];
    mode?: 'fan-out' | 'first' | 'all';
}
export interface DispatchOptions {
    origin?: string;
}
export interface ChannelGateway {
    register: (channel: GatewayChannel) => void;
    unregister: (name: string) => void;
    dispatch: (event: GatewayEvent, options?: DispatchOptions) => void;
    route: (rule: GatewayRoute) => void;
    clearRoutes: () => void;
}
export declare function createChannelGateway(): ChannelGateway;
