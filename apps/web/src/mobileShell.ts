import type {
  ClientSettings,
  ContextMenuItem,
  EditorId,
  EnvironmentId,
  LocalApi,
  PersistedSavedEnvironmentRecord,
} from "@t3tools/contracts";

type MobileBridgeRequestMap = {
  "persistence.getClientSettings": {
    readonly input: undefined;
    readonly output: ClientSettings | null;
  };
  "persistence.setClientSettings": {
    readonly input: { readonly settings: ClientSettings };
    readonly output: null;
  };
  "persistence.getSavedEnvironmentRegistry": {
    readonly input: undefined;
    readonly output: readonly PersistedSavedEnvironmentRecord[];
  };
  "persistence.setSavedEnvironmentRegistry": {
    readonly input: { readonly records: readonly PersistedSavedEnvironmentRecord[] };
    readonly output: null;
  };
  "persistence.getSavedEnvironmentSecret": {
    readonly input: { readonly environmentId: EnvironmentId };
    readonly output: string | null;
  };
  "persistence.setSavedEnvironmentSecret": {
    readonly input: { readonly environmentId: EnvironmentId; readonly secret: string };
    readonly output: boolean;
  };
  "persistence.removeSavedEnvironmentSecret": {
    readonly input: { readonly environmentId: EnvironmentId };
    readonly output: null;
  };
  "shell.openExternal": {
    readonly input: { readonly url: string };
    readonly output: boolean;
  };
};

export type MobileBridgeMethod = keyof MobileBridgeRequestMap;

export interface T3MobileBridge {
  request<TMethod extends MobileBridgeMethod>(
    method: TMethod,
    input: MobileBridgeRequestMap[TMethod]["input"],
  ): Promise<MobileBridgeRequestMap[TMethod]["output"]>;
}

export function isMobileShell(): boolean {
  return typeof window !== "undefined" && window.t3MobileBridge !== undefined;
}

function getMobileBridge(): T3MobileBridge | null {
  return typeof window === "undefined" ? null : (window.t3MobileBridge ?? null);
}

function unavailableLocalApiMethod(name: string): never {
  throw new Error(`${name} is unavailable in the mobile shell.`);
}

export function createMobileLocalApi(): LocalApi | null {
  const bridge = getMobileBridge();
  if (!bridge) {
    return null;
  }

  return {
    dialogs: {
      pickFolder: async () => null,
      confirm: async (message) => window.confirm(message),
    },
    shell: {
      openInEditor: async (_cwd: string, _editor: EditorId) => {
        unavailableLocalApiMethod("Opening files in an editor");
      },
      openExternal: async (url: string) => {
        const opened = await bridge.request("shell.openExternal", { url });
        if (!opened) {
          throw new Error("Unable to open link.");
        }
      },
    },
    contextMenu: {
      show: async <T extends string>(
        _items: readonly ContextMenuItem<T>[],
        _position?: { x: number; y: number },
      ): Promise<T | null> => null,
    },
    persistence: {
      getClientSettings: () => bridge.request("persistence.getClientSettings", undefined),
      setClientSettings: async (settings) => {
        await bridge.request("persistence.setClientSettings", { settings });
      },
      getSavedEnvironmentRegistry: () =>
        bridge.request("persistence.getSavedEnvironmentRegistry", undefined),
      setSavedEnvironmentRegistry: async (records) => {
        await bridge.request("persistence.setSavedEnvironmentRegistry", { records });
      },
      getSavedEnvironmentSecret: (environmentId) =>
        bridge.request("persistence.getSavedEnvironmentSecret", { environmentId }),
      setSavedEnvironmentSecret: (environmentId, secret) =>
        bridge.request("persistence.setSavedEnvironmentSecret", { environmentId, secret }),
      removeSavedEnvironmentSecret: async (environmentId) => {
        await bridge.request("persistence.removeSavedEnvironmentSecret", { environmentId });
      },
    },
    server: {
      getConfig: async () => unavailableLocalApiMethod("Local server config"),
      refreshProviders: async () => unavailableLocalApiMethod("Refreshing local providers"),
      upsertKeybinding: async () => unavailableLocalApiMethod("Local keybindings"),
      getSettings: async () => unavailableLocalApiMethod("Local server settings"),
      updateSettings: async () => unavailableLocalApiMethod("Local server settings"),
    },
  };
}
