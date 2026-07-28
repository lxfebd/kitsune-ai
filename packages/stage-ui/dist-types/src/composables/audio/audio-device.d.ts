export declare function useAudioDevice(requestPermission?: boolean): {
    audioInputs: import("vue").ComputedRef<MediaDeviceInfo[]>;
    selectedAudioInput: import("vue").Ref<string, string>;
    stream: import("vue").Ref<MediaStream | undefined, MediaStream | undefined>;
    deviceConstraints: import("vue").ComputedRef<MediaStreamConstraints>;
    permissionGranted: import("vue").ShallowRef<boolean>;
    askPermission: () => Promise<void>;
    startStream: () => Promise<MediaStream | undefined>;
    stopStream: () => void;
};
