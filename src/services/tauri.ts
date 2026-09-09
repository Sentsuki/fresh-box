import { invoke } from "@tauri-apps/api/core";
import type { CommandError } from "../gen/host";

/** `CommandError` 的判别式（`kind` 字段）—— 由 Rust 生成，不再手抄。 */
export type CommandErrorKind = CommandError["kind"];

interface CommandErrorPayload {
  kind?: CommandErrorKind;
  message?: string;
  [key: string]: unknown;
}

function isCommandErrorPayload(value: unknown): value is CommandErrorPayload {
  return !!value && typeof value === "object";
}

/**
 * Rust 侧失败的命令 —— `invokeRaw` 抛这个而不是原始的 rejection，调用方因此拿到
 * 一个真正的 `Error`（有栈、`instanceof Error` 成立），同时还能按 `kind` 分支而
 * 不用去解析 `message`。原始 rejection 仍可从 `.cause` 取到。
 *
 * 生成的绑定（`src/gen/host.ts`）直接抛 Rust 的错误对象，不经过这里 ——
 * `getErrorKind`/`getErrorMessage` 对两者都能用。
 */
export class CommandInvocationError extends Error {
  readonly kind?: CommandErrorKind;

  constructor(
    message: string,
    kind: CommandErrorKind | undefined,
    cause: unknown,
  ) {
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

/**
 * 调用一个 Rust 侧返回 `tauri::ipc::Response` 的命令 —— 它到手是
 * `ArrayBuffer` 而不是 JSON。
 *
 * 只有 daemon bridge 用（`src/daemon/transport.ts`）：那里的载荷是原始
 * protobuf，只有调用方自己生成的代码知道怎么读。host 域的命令一律走生成的
 * 绑定，不经过这里。
 */
export async function invokeRaw(
  command: string,
  args?: Record<string, unknown>,
): Promise<ArrayBuffer> {
  try {
    return await invoke<ArrayBuffer>(command, args);
  } catch (error) {
    throw new CommandInvocationError(
      getErrorMessage(error),
      getErrorKind(error),
      error,
    );
  }
}
