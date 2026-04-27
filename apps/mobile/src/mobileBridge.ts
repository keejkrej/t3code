import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";

const CLIENT_SETTINGS_KEY = "t3.clientSettings";
const SAVED_ENVIRONMENT_REGISTRY_KEY = "t3.savedEnvironmentRegistry";
const SAVED_ENVIRONMENT_SECRET_PREFIX = "t3.savedEnvironmentSecret.";

type BridgeRequest = {
  readonly id: string;
  readonly method: string;
  readonly input?: unknown;
};

type BridgeResponse =
  | {
      readonly id: string;
      readonly ok: true;
      readonly result: unknown;
    }
  | {
      readonly id: string;
      readonly ok: false;
      readonly error: string;
    };

type WebViewRef = {
  readonly injectJavaScript: (script: string) => void;
};

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyForInjection(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function encodeSecureStoreKeySegment(value: string): string {
  return (
    Array.from(value, (character) => character.codePointAt(0)?.toString(36) ?? "")
      .filter(Boolean)
      .join("_") || "empty"
  );
}

function secretKey(environmentId: string): string {
  return `${SAVED_ENVIRONMENT_SECRET_PREFIX}${encodeSecureStoreKeySegment(environmentId)}`;
}

function objectInput(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

async function handleBridgeRequest(request: BridgeRequest): Promise<unknown> {
  switch (request.method) {
    case "persistence.getClientSettings":
      return safeParseJson(await AsyncStorage.getItem(CLIENT_SETTINGS_KEY), null);

    case "persistence.setClientSettings": {
      const input = objectInput(request.input);
      await AsyncStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(input.settings ?? null));
      return null;
    }

    case "persistence.getSavedEnvironmentRegistry":
      return safeParseJson(await AsyncStorage.getItem(SAVED_ENVIRONMENT_REGISTRY_KEY), []);

    case "persistence.setSavedEnvironmentRegistry": {
      const input = objectInput(request.input);
      const records = Array.isArray(input.records) ? input.records : [];
      await AsyncStorage.setItem(SAVED_ENVIRONMENT_REGISTRY_KEY, JSON.stringify(records));
      const liveEnvironmentIds = new Set(
        records
          .map((record) =>
            record && typeof record === "object"
              ? (record as { readonly environmentId?: unknown }).environmentId
              : null,
          )
          .filter((environmentId): environmentId is string => typeof environmentId === "string"),
      );
      await removeSecretsForDeletedEnvironments(liveEnvironmentIds);
      return null;
    }

    case "persistence.getSavedEnvironmentSecret": {
      const input = objectInput(request.input);
      return typeof input.environmentId === "string"
        ? await SecureStore.getItemAsync(secretKey(input.environmentId))
        : null;
    }

    case "persistence.setSavedEnvironmentSecret": {
      const input = objectInput(request.input);
      if (typeof input.environmentId !== "string" || typeof input.secret !== "string") {
        return false;
      }
      await SecureStore.setItemAsync(secretKey(input.environmentId), input.secret);
      await rememberSecretEnvironmentId(input.environmentId);
      return true;
    }

    case "persistence.removeSavedEnvironmentSecret": {
      const input = objectInput(request.input);
      if (typeof input.environmentId === "string") {
        await SecureStore.deleteItemAsync(secretKey(input.environmentId));
        await forgetSecretEnvironmentId(input.environmentId);
      }
      return null;
    }

    case "shell.openExternal": {
      const input = objectInput(request.input);
      if (typeof input.url !== "string") {
        return false;
      }
      return Linking.openURL(input.url)
        .then(() => true)
        .catch(() => false);
    }

    default:
      throw new Error(`Unsupported mobile bridge method: ${request.method}`);
  }
}

const SECRET_ENVIRONMENT_IDS_KEY = "t3.savedEnvironmentSecretEnvironmentIds";

async function readSecretEnvironmentIds(): Promise<Set<string>> {
  return new Set(
    safeParseJson<unknown[]>(await AsyncStorage.getItem(SECRET_ENVIRONMENT_IDS_KEY), []).filter(
      (value): value is string => typeof value === "string",
    ),
  );
}

async function writeSecretEnvironmentIds(environmentIds: Set<string>): Promise<void> {
  await AsyncStorage.setItem(
    SECRET_ENVIRONMENT_IDS_KEY,
    // oxlint-disable-next-line unicorn/no-array-sort
    JSON.stringify([...environmentIds].sort()),
  );
}

async function rememberSecretEnvironmentId(environmentId: string): Promise<void> {
  const environmentIds = await readSecretEnvironmentIds();
  environmentIds.add(environmentId);
  await writeSecretEnvironmentIds(environmentIds);
}

async function forgetSecretEnvironmentId(environmentId: string): Promise<void> {
  const environmentIds = await readSecretEnvironmentIds();
  environmentIds.delete(environmentId);
  await writeSecretEnvironmentIds(environmentIds);
}

async function removeSecretsForDeletedEnvironments(liveEnvironmentIds: Set<string>): Promise<void> {
  const secretEnvironmentIds = await readSecretEnvironmentIds();
  await Promise.all(
    [...secretEnvironmentIds]
      .filter((environmentId) => !liveEnvironmentIds.has(environmentId))
      .map(async (environmentId) => {
        await SecureStore.deleteItemAsync(secretKey(environmentId));
        secretEnvironmentIds.delete(environmentId);
      }),
  );
  await writeSecretEnvironmentIds(secretEnvironmentIds);
}

export function createInjectedMobileBridgeScript(): string {
  return `
    (function () {
      if (window.t3MobileBridge) return;
      var pending = new Map();
      var nextId = 1;
      window.t3MobileBridge = {
        request: function (method, input) {
          var id = String(nextId++);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            id: id,
            method: method,
            input: input
          }));
          return new Promise(function (resolve, reject) {
            pending.set(id, { resolve: resolve, reject: reject });
          });
        }
      };
      window.__t3MobileBridgeReceive = function (message) {
        var pendingRequest = pending.get(message.id);
        if (!pendingRequest) return;
        pending.delete(message.id);
        if (message.ok) {
          pendingRequest.resolve(message.result);
        } else {
          pendingRequest.reject(new Error(message.error || "Mobile bridge request failed."));
        }
      };
    })();
    true;
  `;
}

export async function handleMobileBridgeMessage(
  webView: WebViewRef | null,
  rawMessage: string,
): Promise<void> {
  if (!webView) {
    return;
  }

  let request: BridgeRequest;
  try {
    request = JSON.parse(rawMessage) as BridgeRequest;
  } catch {
    return;
  }

  const response: BridgeResponse = await handleBridgeRequest(request)
    .then((result) => ({
      id: request.id,
      ok: true as const,
      result,
    }))
    .catch((error: unknown) => ({
      id: request.id,
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));

  webView.injectJavaScript(
    `window.__t3MobileBridgeReceive(${stringifyForInjection(response)}); true;`,
  );
}
