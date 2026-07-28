import type { InvokeEventa } from '@moeru/eventa';
import type { ShallowRef } from 'vue';
import { createContext } from '@moeru/eventa/adapters/electron/renderer';
type EventaContext = ReturnType<typeof createContext>['context'];
type IpcRendererLike = Parameters<typeof createContext>[0];
export declare function getElectronEventaContext(ipcRenderer?: IpcRendererLike): EventaContext;
export declare function useElectronEventaContext(ipcRenderer?: IpcRendererLike): ShallowRef<EventaContext>;
export declare function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: EventaContext): import("@moeru/eventa").InvokeFunction<Res, Req, import("@moeru/eventa").EventContext<any, {
    raw: {
        ipcRendererEvent: Electron.IpcRendererEvent;
        event: Event | unknown;
    };
}>>;
export declare function resetElectronEventaContextForTesting(): void;

