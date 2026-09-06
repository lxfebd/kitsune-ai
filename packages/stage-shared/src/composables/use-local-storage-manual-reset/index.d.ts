import type { ManualResetRefReturn, UseStorageOptions } from '@vueuse/core';
import type { MaybeRefOrGetter, WatchOptions } from 'vue';
export declare function useLocalStorageManualReset<T>(key: MaybeRefOrGetter<string>, initialValue: MaybeRefOrGetter<T>, options?: UseStorageOptions<T> & WatchOptions): ManualResetRefReturn<T>;
