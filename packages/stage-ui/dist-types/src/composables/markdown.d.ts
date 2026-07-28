export declare function useMarkdown(): {
    process: (markdown: string) => Promise<string>;
    processSync: (markdown: string) => string;
};
