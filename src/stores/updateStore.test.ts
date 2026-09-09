import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";

/**
 * 自更新的状态机。插件负责检查、验签、下载、安装；这个 store 只持有结果，
 * 好让启动时的自动检查和设置页的手动检查共用同一份状态，而不是各查各的。
 */

const check = vi.fn(async () => null as Update | null);
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));

import { useUpdateStore } from "./updateStore";

function fakeUpdate(over: Partial<Update> = {}): Update {
  return {
    version: "1.2.3",
    currentVersion: "1.2.2",
    downloadAndInstall: vi.fn(async () => {}),
    ...over,
  } as unknown as Update;
}

beforeEach(() => {
  check.mockReset().mockResolvedValue(null);
  useUpdateStore.setState({
    status: "idle",
    update: null,
    progress: 0,
    error: null,
  });
});

describe("checkNow", () => {
  it("有新版本时进 available 并留住它", async () => {
    const update = fakeUpdate();
    check.mockResolvedValueOnce(update);

    const returned = await useUpdateStore.getState().checkNow();

    expect(returned).toBe(update);
    expect(useUpdateStore.getState().status).toBe("available");
    expect(useUpdateStore.getState().update).toBe(update);
  });

  it("没有新版本时进 up-to-date 并清掉旧的", async () => {
    useUpdateStore.setState({ update: fakeUpdate(), status: "available" });
    const returned = await useUpdateStore.getState().checkNow();

    expect(returned).toBeNull();
    expect(useUpdateStore.getState().status).toBe("up-to-date");
    expect(useUpdateStore.getState().update).toBeNull();
  });

  it("失败进 error 并留下原因，不抛给调用方", async () => {
    // 启动时的自动检查是后台行为，网络不通不该冒一个未捕获异常出来。
    check.mockRejectedValueOnce(new Error("network unreachable"));

    const returned = await useUpdateStore.getState().checkNow();

    expect(returned).toBeNull();
    expect(useUpdateStore.getState().status).toBe("error");
    expect(useUpdateStore.getState().error).toContain("network unreachable");
  });

  it("每次检查先清掉上一次的错误", async () => {
    useUpdateStore.setState({ status: "error", error: "old failure" });
    await useUpdateStore.getState().checkNow();
    expect(useUpdateStore.getState().error).toBeNull();
  });
});

describe("installNow", () => {
  it("没有待装的更新时什么都不做", async () => {
    await useUpdateStore.getState().installNow();
    expect(useUpdateStore.getState().status).toBe("idle");
  });

  it("下载进度换算成 0–1", async () => {
    const downloadAndInstall = vi.fn(
      async (onEvent: (e: Record<string, unknown>) => void) => {
        onEvent({ event: "Started", data: { contentLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 25 } });
        onEvent({ event: "Progress", data: { chunkLength: 25 } });
        onEvent({ event: "Finished" });
      },
    );
    useUpdateStore.setState({
      update: fakeUpdate({ downloadAndInstall } as Partial<Update>),
      status: "available",
    });

    await useUpdateStore.getState().installNow();

    expect(downloadAndInstall).toHaveBeenCalled();
    expect(useUpdateStore.getState().progress).toBeGreaterThan(0);
  });

  it("安装失败进 error 而不是把界面卡在 installing", async () => {
    useUpdateStore.setState({
      update: fakeUpdate({
        downloadAndInstall: vi.fn(async () => {
          throw new Error("signature mismatch");
        }),
      } as Partial<Update>),
      status: "available",
    });

    await useUpdateStore.getState().installNow();

    expect(useUpdateStore.getState().status).toBe("error");
    expect(useUpdateStore.getState().error).toContain("signature mismatch");
  });
});
