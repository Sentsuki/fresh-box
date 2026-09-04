import { invoke } from "@tauri-apps/api/core";
import type { CommandErrorKind, CommandErrorPayload } from "../types/app";

function isCommandErrorPayload(value: unknown): value is CommandErrorPayload {
  return !!value && typeof value === "object";
}

/**
 * A command that failed on the Rust side — thrown by `invokeCommand` in
 * place of the raw rejection so callers get a real `Error` (a stack trace,
 * `instanceof Error`, ...) while still being able to branch on `kind`
 * without re-parsing `message`. The original rejection is still reachable
 * via `.cause` for anything that wants it.
 */
export class CommandInvocationError extends Error {
  readonly kind?: CommandErrorKind;

  constructor(message: string, kind: CommandErrorKind | undefined, cause: unknown) {
    super(message);
    this.name = "CommandInvocationError";
    this.kind = kind;
    Object.defineProperty(this, "cause", {
      value: cause,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
}

/**
 * The `CommandError` discriminant a failed command's rejection carries, if
 * any — lets a caller react to e.g. a declined UAC prompt
 * (`kind === "permission_denied"`) as the benign "user changed their mind"
 * it is, rather than as a real failure worth alarming over. See
 * `errors::CommandError`'s `PermissionDenied` variant.
 */
export function getErrorKind(error: unknown): CommandErrorKind | undefined {
  if (error instanceof CommandInvocationError) return error.kind;
  if (isCommandErrorPayload(error) && typeof error.kind === "string") {
    return error.kind as CommandErrorKind;
  }
  return undefined;
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
    throw new CommandInvocationError(getErrorMessage(error), getErrorKind(error), error);
  }
}
