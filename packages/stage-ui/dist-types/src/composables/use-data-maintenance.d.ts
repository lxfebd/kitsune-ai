export declare function useDataMaintenance(): {
    deleteAllModels: () => Promise<void>;
    resetProvidersSettings: () => Promise<void>;
    resetModulesSettings: () => void;
    deleteAllChatSessions: () => void;
    exportChatSessions: () => Promise<Blob>;
    importChatSessions: (payload: Record<string, unknown>) => Promise<void>;
    deleteAllData: () => Promise<void>;
    resetDesktopApplicationState: () => Promise<void>;
};
