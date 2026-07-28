export declare const useSettingsAudioDevice: import("pinia").StoreDefinition<"settings-audio-devices", Pick<{
    audioInputs: import("vue").ComputedRef<MediaDeviceInfo[]>;
    deviceConstraints: import("vue").ComputedRef<MediaStreamConstraints>;
    selectedAudioInput: import("@vueuse/shared").ManualResetRefReturn<string>;
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stream: import("vue").Ref<MediaStream | undefined, MediaStream | undefined>;
    initialize: () => void;
    askPermission: () => Promise<void>;
    startStream: () => Promise<MediaStream | undefined>;
    stopStream: () => void;
    resetState: () => void;
}, "stream" | "enabled" | "selectedAudioInput">, Pick<{
    audioInputs: import("vue").ComputedRef<MediaDeviceInfo[]>;
    deviceConstraints: import("vue").ComputedRef<MediaStreamConstraints>;
    selectedAudioInput: import("@vueuse/shared").ManualResetRefReturn<string>;
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stream: import("vue").Ref<MediaStream | undefined, MediaStream | undefined>;
    initialize: () => void;
    askPermission: () => Promise<void>;
    startStream: () => Promise<MediaStream | undefined>;
    stopStream: () => void;
    resetState: () => void;
}, "audioInputs" | "deviceConstraints">, Pick<{
    audioInputs: import("vue").ComputedRef<MediaDeviceInfo[]>;
    deviceConstraints: import("vue").ComputedRef<MediaStreamConstraints>;
    selectedAudioInput: import("@vueuse/shared").ManualResetRefReturn<string>;
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    stream: import("vue").Ref<MediaStream | undefined, MediaStream | undefined>;
    initialize: () => void;
    askPermission: () => Promise<void>;
    startStream: () => Promise<MediaStream | undefined>;
    stopStream: () => void;
    resetState: () => void;
}, "initialize" | "resetState" | "askPermission" | "startStream" | "stopStream">>;
