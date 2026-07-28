export interface Module {
    id: string;
    name: string;
    description: string;
    icon?: string;
    iconColor?: string;
    iconImage?: string;
    to: string;
    configured: boolean;
    category: string;
}
export declare function useModulesList(): {
    modulesList: import("vue").ComputedRef<Module[]>;
    categorizedModules: import("vue").ComputedRef<Record<string, Module[]>>;
    categoryNames: import("vue").ComputedRef<Record<string, string>>;
};
