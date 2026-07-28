export type DataSettingsStatusTone = 'neutral' | 'success' | 'error';
export interface DataSettingsStatusPayload {
    message: string;
    tone: DataSettingsStatusTone;
}
export interface DataSettingsStatusEmits {
    status: [payload: DataSettingsStatusPayload];
}
export type DataSettingsStatusEmit = (event: 'status', payload: DataSettingsStatusPayload) => void;
export declare function createDataSettingsStatusHelpers(emit: DataSettingsStatusEmit): {
    emitStatus: (message: string, tone?: DataSettingsStatusTone) => void;
    handleActionError: (error: unknown) => void;
};
export declare function createDataSettingsStatusState(): {
    statusMessage: import("vue").ShallowRef<string, string>;
    statusTone: import("vue").ShallowRef<DataSettingsStatusTone, DataSettingsStatusTone>;
    handleStatus: (payload: DataSettingsStatusPayload) => void;
};
