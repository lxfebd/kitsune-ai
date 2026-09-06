interface ExternalDependencyLogger {
    log: (message: string) => unknown;
    withError: (error: unknown) => {
        warn: (message: string) => unknown;
    };
}
export declare function initializeExternalDependency<T>(dependencyName: string, logger: ExternalDependencyLogger, initialize: (attempt: number) => Promise<T>): Promise<T>;

