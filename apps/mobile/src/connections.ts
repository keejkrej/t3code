import type { ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import {
  attachEnvironmentDescriptor,
  createKnownEnvironment,
  type KnownEnvironment,
} from "@t3tools/client-runtime";

export interface MobileConnectionRecord {
  readonly environment: KnownEnvironment;
  readonly addedAt: string;
  readonly lastValidatedAt: string | null;
}

export const CONNECTION_STORAGE_KEY = "t3code.mobile.connections.v1";

export function normalizeBaseUrl(value: string, protocol: "http" | "ws"): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Connection URL cannot be empty.");
  }

  const prefixed =
    /^https?:\/\//i.test(trimmed) || /^wss?:\/\//i.test(trimmed)
      ? trimmed
      : `${protocol}://${trimmed}`;

  const url = new URL(prefixed);
  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:" &&
    url.protocol !== "ws:" &&
    url.protocol !== "wss:"
  ) {
    throw new Error("Connection URL must start with http(s):// or ws(s)://.");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function fetchEnvironmentDescriptor(
  httpBaseUrl: string,
): Promise<ExecutionEnvironmentDescriptor> {
  const endpoint = new URL("/.well-known/t3/environment", `${httpBaseUrl}/`).toString();
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Environment probe failed (${response.status}).`);
  }
  return (await response.json()) as ExecutionEnvironmentDescriptor;
}

export async function createConnectionRecord(input: {
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}): Promise<MobileConnectionRecord> {
  const descriptor = await fetchEnvironmentDescriptor(input.httpBaseUrl);
  const environment = attachEnvironmentDescriptor(
    createKnownEnvironment({
      id: descriptor.environmentId,
      label: input.label.trim() || descriptor.label,
      source: "manual",
      target: {
        httpBaseUrl: input.httpBaseUrl,
        wsBaseUrl: input.wsBaseUrl,
      },
    }),
    descriptor,
  );

  const now = new Date().toISOString();
  return {
    environment,
    addedAt: now,
    lastValidatedAt: now,
  };
}
