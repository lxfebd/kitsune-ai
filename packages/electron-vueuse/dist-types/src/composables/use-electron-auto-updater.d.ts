import type { AutoUpdaterState } from '@kitsune/electron-eventa/electron-updater';
export declare function useElectronAutoUpdater(): {
    state: import("vue").Ref<{
        status: import("@kitsune/electron-eventa/electron-updater").AutoUpdaterStatus;
        info?: {
            readonly version: string;
            readonly files: {
                url: string;
                size?: number | undefined;
                blockMapSize?: number | undefined;
                readonly sha512: string;
                readonly isAdminRightsRequired?: boolean | undefined;
            }[];
            releaseName?: string | null | undefined;
            releaseNotes?: string | {
                readonly version: string;
                readonly note: string | null;
            }[] | null | undefined;
            releaseDate: string;
            readonly stagingPercentage?: number | undefined;
            readonly minimumSystemVersion?: string | undefined;
        } | undefined;
        progress?: {
            percent: number;
            bytesPerSecond: number;
            transferred: number;
            total: number;
        } | undefined;
        error?: {
            message: string;
        } | undefined;
        diagnostics?: {
            platform: string;
            arch: string;
            channel: string;
            feedUrl?: string | undefined;
            logFilePath: string;
            executablePath: string;
            installDirectory: string;
            requiresAdminForInstallPath: boolean;
            isOverrideActive: boolean;
        } | undefined;
    }, AutoUpdaterState | {
        status: import("@kitsune/electron-eventa/electron-updater").AutoUpdaterStatus;
        info?: {
            readonly version: string;
            readonly files: {
                url: string;
                size?: number | undefined;
                blockMapSize?: number | undefined;
                readonly sha512: string;
                readonly isAdminRightsRequired?: boolean | undefined;
            }[];
            releaseName?: string | null | undefined;
            releaseNotes?: string | {
                readonly version: string;
                readonly note: string | null;
            }[] | null | undefined;
            releaseDate: string;
            readonly stagingPercentage?: number | undefined;
            readonly minimumSystemVersion?: string | undefined;
        } | undefined;
        progress?: {
            percent: number;
            bytesPerSecond: number;
            transferred: number;
            total: number;
        } | undefined;
        error?: {
            message: string;
        } | undefined;
        diagnostics?: {
            platform: string;
            arch: string;
            channel: string;
            feedUrl?: string | undefined;
            logFilePath: string;
            executablePath: string;
            installDirectory: string;
            requiresAdminForInstallPath: boolean;
            isOverrideActive: boolean;
        } | undefined;
    }>;
    isBusy: import("vue").ComputedRef<boolean>;
    canDownload: import("vue").ComputedRef<boolean>;
    canRestartToUpdate: import("vue").ComputedRef<boolean>;
    checkForUpdates: (req?: undefined, options?: {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | undefined) => Promise<AutoUpdaterState>;
    downloadUpdate: (req?: undefined, options?: {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | undefined) => Promise<AutoUpdaterState>;
    quitAndInstall: (req?: undefined, options?: {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | {
        signal?: AbortSignal;
    } | undefined) => Promise<void>;
};
