import { fetch } from "@tauri-apps/plugin-http";
import type { CoreClientConfig } from "../types/app";

let CORE_HTTP_URL = "http://127.0.0.1:8964";
let CORE_WS_URL = "ws://127.0.0.1:8964";
let CORE_SECRET = "UV;.#DyQP4)a:P.wFq?cU9lPz:sj";

export function updateCoreClientConfig(config: CoreClientConfig) {
  CORE_HTTP_URL = config.http_url;
  CORE_WS_URL = config.ws_url;
  CORE_SECRET = config.secret;
}

type CoreRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(
  base: string,
  path: string,
  params?: CoreRequestOptions["params"],
): string {
  const url = new URL(path.replace(/^\//, ""), `${base}/`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

export function buildCoreWebSocketUrl(
  path: string,
  params?: CoreRequestOptions["params"],
): string {
  return buildUrl(CORE_WS_URL, path, {
    token: CORE_SECRET,
    ...params,
  });
}

export async function coreRequest<T>(
  path: string,
  options: CoreRequestOptions = {},
): Promise<T> {
  const response = await fetch(buildUrl(CORE_HTTP_URL, path, options.params), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${CORE_SECRET}`,
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });

  const raw = await response.text();
  if (!response.ok) {
    let message = raw;
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message ?? raw;
    } catch {
      // keep raw text
    }
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}
