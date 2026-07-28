export declare enum DisplayModelFormat {
    Live2dZip = "live2d-zip",
    Live2dDirectory = "live2d-directory",
    VRM = "vrm",
    SpineZip = "spine-zip",
    PMXZip = "pmx-zip",
    PMXDirectory = "pmx-directory",
    PMD = "pmd"
}
export type DisplayModel = DisplayModelFile | DisplayModelURL;
export interface DisplayModelFile {
    id: string;
    format: DisplayModelFormat;
    type: 'file';
    file: File;
    name: string;
    previewImage?: string;
    importedAt: number;
}
export interface DisplayModelURL {
    id: string;
    format: DisplayModelFormat;
    type: 'url';
    url: string;
    name: string;
    previewImage?: string;
    importedAt: number;
}
export declare const useDisplayModelsStore: import("pinia").StoreDefinition<"display-models", Pick<{
    displayModels: import("vue").Ref<({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[], DisplayModel[] | ({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[]>;
    displayModelsFromIndexedDBLoading: import("vue").Ref<boolean, boolean>;
    initialize: () => Promise<void>;
    loadDisplayModelsFromIndexedDB: () => Promise<void>;
    getDisplayModel: (id: string) => Promise<DisplayModel | undefined>;
    addDisplayModel: (format: DisplayModelFormat, file: File) => Promise<DisplayModelFile>;
    renameDisplayModel: (id: string, name: string) => Promise<void>;
    removeDisplayModel: (id: string) => Promise<void>;
    resetDisplayModels: () => Promise<void>;
}, "displayModels" | "displayModelsFromIndexedDBLoading">, Pick<{
    displayModels: import("vue").Ref<({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[], DisplayModel[] | ({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[]>;
    displayModelsFromIndexedDBLoading: import("vue").Ref<boolean, boolean>;
    initialize: () => Promise<void>;
    loadDisplayModelsFromIndexedDB: () => Promise<void>;
    getDisplayModel: (id: string) => Promise<DisplayModel | undefined>;
    addDisplayModel: (format: DisplayModelFormat, file: File) => Promise<DisplayModelFile>;
    renameDisplayModel: (id: string, name: string) => Promise<void>;
    removeDisplayModel: (id: string) => Promise<void>;
    resetDisplayModels: () => Promise<void>;
}, never>, Pick<{
    displayModels: import("vue").Ref<({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[], DisplayModel[] | ({
        id: string;
        format: DisplayModelFormat;
        type: "file";
        file: {
            readonly lastModified: number;
            readonly name: string;
            readonly webkitRelativePath: string;
            readonly size: number;
            readonly type: string;
            arrayBuffer: () => Promise<ArrayBuffer>;
            bytes: () => Promise<Uint8Array<ArrayBuffer>>;
            slice: (start?: number, end?: number, contentType?: string) => Blob;
            stream: () => ReadableStream<Uint8Array<ArrayBuffer>>;
            text: () => Promise<string>;
        };
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    } | {
        id: string;
        format: DisplayModelFormat;
        type: "url";
        url: string;
        name: string;
        previewImage?: string | undefined;
        importedAt: number;
    })[]>;
    displayModelsFromIndexedDBLoading: import("vue").Ref<boolean, boolean>;
    initialize: () => Promise<void>;
    loadDisplayModelsFromIndexedDB: () => Promise<void>;
    getDisplayModel: (id: string) => Promise<DisplayModel | undefined>;
    addDisplayModel: (format: DisplayModelFormat, file: File) => Promise<DisplayModelFile>;
    renameDisplayModel: (id: string, name: string) => Promise<void>;
    removeDisplayModel: (id: string) => Promise<void>;
    resetDisplayModels: () => Promise<void>;
}, "initialize" | "loadDisplayModelsFromIndexedDB" | "getDisplayModel" | "addDisplayModel" | "renameDisplayModel" | "removeDisplayModel" | "resetDisplayModels">>;
