export interface BackgroundEntry {
    id: string;
    type: 'builtin' | 'scene' | 'journal' | 'selfie';
    characterId: string | null;
    title: string;
    blob: Blob;
    url?: string;
    prompt?: string;
    remixId?: string;
    createdAt: number;
}
export declare const useBackgroundStore: import("pinia").StoreDefinition<"background-entries", Pick<{
    entries: import("vue").Ref<Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>, Map<string, BackgroundEntry> | (Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>)>;
    loading: import("vue").Ref<boolean, boolean>;
    availableBackgrounds: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterBackgrounds: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    journalEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterJournalEntries: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    activeBackgroundUrl: import("vue").ComputedRef<string | null>;
    journalRecentEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    addBackground: (type: "scene" | "journal" | "selfie", blob: Blob, title: string, prompt?: string, characterId?: string | null, remixId?: string) => Promise<string>;
    removeBackground: (id: string) => Promise<void>;
    getBackgroundUrl: (id: string) => string | null;
    initializeStore: () => Promise<void>;
}, "entries" | "loading">, Pick<{
    entries: import("vue").Ref<Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>, Map<string, BackgroundEntry> | (Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>)>;
    loading: import("vue").Ref<boolean, boolean>;
    availableBackgrounds: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterBackgrounds: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    journalEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterJournalEntries: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    activeBackgroundUrl: import("vue").ComputedRef<string | null>;
    journalRecentEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    addBackground: (type: "scene" | "journal" | "selfie", blob: Blob, title: string, prompt?: string, characterId?: string | null, remixId?: string) => Promise<string>;
    removeBackground: (id: string) => Promise<void>;
    getBackgroundUrl: (id: string) => string | null;
    initializeStore: () => Promise<void>;
}, "availableBackgrounds" | "getCharacterBackgrounds" | "journalEntries" | "getCharacterJournalEntries" | "activeBackgroundUrl" | "journalRecentEntries">, Pick<{
    entries: import("vue").Ref<Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>, Map<string, BackgroundEntry> | (Map<string, {
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        url?: string | undefined;
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }> & Omit<Map<string, BackgroundEntry>, keyof Map<any, any>>)>;
    loading: import("vue").Ref<boolean, boolean>;
    availableBackgrounds: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterBackgrounds: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    journalEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    getCharacterJournalEntries: import("vue").ComputedRef<(characterId?: string) => {
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    activeBackgroundUrl: import("vue").ComputedRef<string | null>;
    journalRecentEntries: import("vue").ComputedRef<{
        url: string | null;
        id: string;
        type: "builtin" | "scene" | "journal" | "selfie";
        characterId: string | null;
        title: string;
        blob: {
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        prompt?: string | undefined;
        remixId?: string | undefined;
        createdAt: number;
    }[]>;
    addBackground: (type: "scene" | "journal" | "selfie", blob: Blob, title: string, prompt?: string, characterId?: string | null, remixId?: string) => Promise<string>;
    removeBackground: (id: string) => Promise<void>;
    getBackgroundUrl: (id: string) => string | null;
    initializeStore: () => Promise<void>;
}, "addBackground" | "removeBackground" | "getBackgroundUrl" | "initializeStore">>;
