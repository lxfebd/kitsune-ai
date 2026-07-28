import type { IOSubsystem } from '@kitsune/stage-shared';
export interface SubsystemConfig {
    subsystem: IOSubsystem;
    label: string;
    color: string;
    bgColor: string;
    icon: string;
}
export declare const SUBSYSTEM_CONFIGS: SubsystemConfig[];
export declare const SUBSYSTEM_CONFIG_MAP: Map<IOSubsystem, SubsystemConfig>;
/** Height of one span row in pixels */
export declare const ROW_HEIGHT = 28;
/** Height of subsystem group header */
export declare const SUBSYSTEM_HEADER_HEIGHT = 24;
/** Height of a collapsible turn header */
export declare const TURN_HEADER_HEIGHT = 36;
/** Vertical padding inside each row for the span bar */
export declare const ROW_PADDING = 4;
/** Width of the left label column */
export declare const LABEL_COL_WIDTH = 140;
/** Height of the time axis ruler */
export declare const TIME_AXIS_HEIGHT = 28;
/** Height of the minimap */
export declare const MINIMAP_HEIGHT = 32;
/** Gap detection threshold: gaps longer than this (ms) are highlighted */
export declare const GAP_WARN_THRESHOLD_MS = 100;
