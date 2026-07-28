export interface PreviewModalState {
    type: 'text' | 'image';
    title: string;
    content: string;
}
export declare const useJournalPreviewStore: import("pinia").StoreDefinition<"journal-preview", Pick<{
    previewModal: import("vue").Ref<{
        type: "text" | "image";
        title: string;
        content: string;
    } | null, PreviewModalState | {
        type: "text" | "image";
        title: string;
        content: string;
    } | null>;
    openTextPreview: (entry: {
        title: string;
        content: string;
    }) => void;
    openImagePreview: (entry: {
        title: string;
        url: string | null;
    }) => void;
    closePreview: () => void;
    downloadImage: (url: string, title?: string) => void;
}, "previewModal">, Pick<{
    previewModal: import("vue").Ref<{
        type: "text" | "image";
        title: string;
        content: string;
    } | null, PreviewModalState | {
        type: "text" | "image";
        title: string;
        content: string;
    } | null>;
    openTextPreview: (entry: {
        title: string;
        content: string;
    }) => void;
    openImagePreview: (entry: {
        title: string;
        url: string | null;
    }) => void;
    closePreview: () => void;
    downloadImage: (url: string, title?: string) => void;
}, never>, Pick<{
    previewModal: import("vue").Ref<{
        type: "text" | "image";
        title: string;
        content: string;
    } | null, PreviewModalState | {
        type: "text" | "image";
        title: string;
        content: string;
    } | null>;
    openTextPreview: (entry: {
        title: string;
        content: string;
    }) => void;
    openImagePreview: (entry: {
        title: string;
        url: string | null;
    }) => void;
    closePreview: () => void;
    downloadImage: (url: string, title?: string) => void;
}, "openTextPreview" | "openImagePreview" | "closePreview" | "downloadImage">>;
