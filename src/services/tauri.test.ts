import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  CommandInvocationError,
  getErrorKind,
  getErrorMessage,
  invokeRaw,
} from "./tauri";

const invokeMock = vi.mocked(invoke);

/**
 * IPC 边界上的错误处理。
 *
 * Tauri 的 `invoke` 失败时 reject 的是**序列化过的** `CommandError` —— 一个
 * 裸对象，不是 `Error`。调用方要么每处都自己解包，要么在这里统一包一次。
 * `kind` 之所以要留住，是因为「用户点了取消 UAC」和「真的失败了」在 UI 上
 * 应该是两种反应。
 */

beforeEach(() => {
  invokeMock.mockReset();
});

describe("invokeRaw", () => {
  it("成功时原样返回字节", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    invokeMock.mockResolvedValue(buffer);
    await expect(invokeRaw("daemon_unary", { a: 1 })).resolves.toBe(buffer);
    expect(invokeMock).toHaveBeenCalledWith("daemon_unary", { a: 1 });
  });

  it("失败包成一个真正的 Error，原始 rejection 留在 cause 上", async () => {
    invokeMock.mockRejectedValue({
      kind: "permission_denied",
      message: "user declined",
    });

    let thrown: unknown;
    try {
      await invokeRaw("install_daemon_service");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CommandInvocationError);
    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as CommandInvocationError;
    expect(error.kind).toBe("permission_denied");
    expect(error.message).toBe("user declined");
    // `cause` 是 `defineProperty` 挂上去的（不可枚举），类型里没声明。
    expect((error as Error & { cause?: unknown }).cause).toMatchObject({
      kind: "permission_denied",
    });
  });
});

describe("getErrorKind", () => {
  it("认得包过的和没包过的两种形状", () => {
    expect(
      getErrorKind(
        new CommandInvocationError("x", "process_not_running", undefined),
      ),
    ).toBe("process_not_running");
    // 生成的绑定直接抛 Rust 的错误对象，不经过 `invokeRaw`。
    expect(getErrorKind({ kind: "network_error", message: "x" })).toBe(
      "network_error",
    );
  });

  it("认不出形状时是 undefined，而不是瞎猜一个", () => {
    expect(getErrorKind(new Error("plain"))).toBeUndefined();
    expect(getErrorKind("just a string")).toBeUndefined();
    expect(getErrorKind(null)).toBeUndefined();
  });
});

describe("getErrorMessage", () => {
  it("字符串就是它自己", () => {
    expect(getErrorMessage("boom")).toBe("boom");
  });

  it("对象优先取 message", () => {
    expect(getErrorMessage({ kind: "network_error", message: "offline" })).toBe(
      "offline",
    );
  });

  it("没有 message 时退而求其次找第一个非空字符串字段", () => {
    // Rust 的错误变体字段名不统一（有的叫 `message`，有的叫 `detail`），
    // 与其显示 "Unknown error"，不如把能读的那句话拿出来。
    expect(getErrorMessage({ kind: "io_error", detail: "file locked" })).toBe(
      "file locked",
    );
  });

  it("Error 取 message", () => {
    expect(getErrorMessage(new Error("thrown"))).toBe("thrown");
  });

  it("彻底认不出时给一句兜底，不给 undefined", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
    expect(getErrorMessage({})).toBe("Unknown error");
    expect(getErrorMessage("   ")).toBe("Unknown error");
  });
});
