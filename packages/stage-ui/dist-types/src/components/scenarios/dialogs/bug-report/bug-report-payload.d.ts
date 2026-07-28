export interface BugReportPageContext {
    url: string;
    title: string;
    userAgent: string;
    viewport: string;
    language: string;
    timeZone: string;
    timestamp: string;
}
export interface BuildBugReportPayloadOptions {
    description: string;
    includeTriageContext?: boolean;
    context?: BugReportPageContext | null;
    screenshotAttached?: boolean;
}
interface WindowLike {
    location?: {
        href?: string;
    };
    document?: {
        title?: string;
    };
    navigator?: {
        userAgent?: string;
        language?: string;
    };
    innerWidth?: number;
    innerHeight?: number;
    Intl?: {
        DateTimeFormat?: () => {
            resolvedOptions?: () => {
                timeZone?: string;
            };
        };
    };
    Date?: {
        now?: () => number;
    };
}
export declare function createBugReportPageContext(win?: WindowLike | undefined): BugReportPageContext | null;
export declare function buildBugReportPayload(options: BuildBugReportPayloadOptions): string;

