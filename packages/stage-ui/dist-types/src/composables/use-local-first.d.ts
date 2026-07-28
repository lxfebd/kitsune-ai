export interface UseLocalFirstRequestOptions<T> {
    local: () => Promise<T> | T;
    remote: () => Promise<T>;
    allowRemote?: () => boolean | Promise<boolean>;
    lazy?: boolean;
}
export declare function useLocalFirstRequest<T>(options: UseLocalFirstRequestOptions<T>): {
    state: import("vue").Ref<T | undefined, T | undefined>;
    isLoading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<unknown, unknown>;
    execute: () => Promise<void>;
};
