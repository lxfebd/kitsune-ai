export type NotebookEntryKind = 'note' | 'diary' | 'focus';
export interface NotebookEntry {
    id: string;
    kind: NotebookEntryKind;
    text: string;
    createdAt: number;
    tags?: string[];
    metadata?: Record<string, unknown>;
}
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskStatus = 'queued' | 'scheduled' | 'done' | 'dropped';
export interface ScheduledTask {
    id: string;
    title: string;
    details?: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueAt?: number;
    createdAt: number;
    updatedAt: number;
    lastNotifiedAt?: number;
    nextNotifyAt?: number;
    metadata?: Record<string, unknown>;
}
export declare const useCharacterNotebookStore: import("pinia").StoreDefinition<"character-notebook", Pick<{
    entries: import("vue").Ref<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], NotebookEntry[] | {
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    tasks: import("vue").Ref<{
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], ScheduledTask[] | {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionDiary: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionFocus: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    addNote: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addDiaryEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addFocusEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    scheduleTask: (payload: {
        title: string;
        details?: string;
        priority?: TaskPriority;
        dueAt?: number;
        metadata?: Record<string, unknown>;
    }) => ScheduledTask;
    markTaskDone: (taskId: string) => void;
    requeueTask: (taskId: string, options?: {
        dueAt?: number;
        reason?: string;
    }) => void;
    markTaskNotified: (taskId: string, nextNotifyAt?: number) => void;
    getDueTasks: (now: number, windowMs: number) => {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, "entries" | "tasks">, Pick<{
    entries: import("vue").Ref<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], NotebookEntry[] | {
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    tasks: import("vue").Ref<{
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], ScheduledTask[] | {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionDiary: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionFocus: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    addNote: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addDiaryEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addFocusEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    scheduleTask: (payload: {
        title: string;
        details?: string;
        priority?: TaskPriority;
        dueAt?: number;
        metadata?: Record<string, unknown>;
    }) => ScheduledTask;
    markTaskDone: (taskId: string) => void;
    requeueTask: (taskId: string, options?: {
        dueAt?: number;
        reason?: string;
    }) => void;
    markTaskNotified: (taskId: string, nextNotifyAt?: number) => void;
    getDueTasks: (now: number, windowMs: number) => {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, "partitionDiary" | "partitionFocus">, Pick<{
    entries: import("vue").Ref<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], NotebookEntry[] | {
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    tasks: import("vue").Ref<{
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], ScheduledTask[] | {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionDiary: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    partitionFocus: import("vue").ComputedRef<{
        id: string;
        kind: NotebookEntryKind;
        text: string;
        createdAt: number;
        tags?: string[] | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    addNote: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addDiaryEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    addFocusEntry: (text: string, options?: {
        tags?: string[];
        metadata?: Record<string, unknown>;
    }) => NotebookEntry;
    scheduleTask: (payload: {
        title: string;
        details?: string;
        priority?: TaskPriority;
        dueAt?: number;
        metadata?: Record<string, unknown>;
    }) => ScheduledTask;
    markTaskDone: (taskId: string) => void;
    requeueTask: (taskId: string, options?: {
        dueAt?: number;
        reason?: string;
    }) => void;
    markTaskNotified: (taskId: string, nextNotifyAt?: number) => void;
    getDueTasks: (now: number, windowMs: number) => {
        id: string;
        title: string;
        details?: string | undefined;
        priority: TaskPriority;
        status: TaskStatus;
        dueAt?: number | undefined;
        createdAt: number;
        updatedAt: number;
        lastNotifiedAt?: number | undefined;
        nextNotifyAt?: number | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, "addNote" | "addDiaryEntry" | "addFocusEntry" | "scheduleTask" | "markTaskDone" | "requeueTask" | "markTaskNotified" | "getDueTasks">>;
