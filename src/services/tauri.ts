import { invoke } from "@tauri-apps/api/core";
import type { CommandErrorPayload } from "../types/app";

function isCommandErrorPayload(value: unknown): value is CommandErrorPayload {
  return !!value && typeof value === "object";
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;

  if (isCommandErrorPayload(error)) {
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
    const firstString = Object.values(error).find(
      (value) => typeof value === "string" && (value as string).trim(),
    );
    if (typeof firstString === "string") return firstString;
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  if (
    error instanceof Error &&
    "cause" in error &&
    error.cause !== undefined &&
    error.cause !== error
  ) {
    return getErrorMessage(error.cause);
  }

  return "Unknown error";
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const wrappedError = new Error(getErrorMessage(error));
    Object.defineProperty(wrappedError, "cause", {
      value: error,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    throw wrappedError;
  }
}
