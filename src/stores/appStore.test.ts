import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 导航状态。这个 store 存在的理由就是那条不变量：**改当前页只有一个入口**，
 * 它同时更新内存（导航要立刻响应）和设置（重启后记得住）。以前调用方得自己
 * 记着更新两处，没有任何东西保证它们同步。
 */

const setCurrentPage = vi.fn(async () => {});
vi.mock("./settingsStore", () => ({
  useSettingsStore: { getState: () => ({ setCurrentPage }) },
}));

import { useAppStore } from "./appStore";
import { useConfigStore } from "./configStore";

beforeEach(() => {
  setCurrentPage.mockClear();
  useAppStore.setState({ currentPage: "overview", initialized: false });
  useConfigStore.setState({ profiles: [], pendingOperation: false });
});

describe("appStore", () => {
  it("切页同时改内存和设置", () => {
    useAppStore.getState().setCurrentPage("logs");

    expect(useAppStore.getState().currentPage).toBe("logs");
    expect(setCurrentPage).toHaveBeenCalledWith("logs");
  });

  it("启动时回填初始页不回写设置", () => {
    // 否则等于把刚读出来的值原样写回去，白落一次盘。
    useAppStore.getState().setInitialPage("proxy");

    expect(useAppStore.getState().currentPage).toBe("proxy");
    expect(setCurrentPage).not.toHaveBeenCalled();
  });

  it("初始化标记只翻一次", () => {
    expect(useAppStore.getState().initialized).toBe(false);
    useAppStore.getState().markInitialized();
    expect(useAppStore.getState().initialized).toBe(true);
  });
});

describe("configStore", () => {
  it("档案列表和「操作进行中」各自独立", () => {
    useConfigStore.getState().setProfiles([
      {
        id: "a",
        name: "a",
        url: null,
        lastUpdated: null,
        autoUpdate: false,
        updateIntervalMinutes: null,
      },
    ]);
    useConfigStore.getState().setPending(true);

    expect(useConfigStore.getState().profiles).toHaveLength(1);
    expect(useConfigStore.getState().pendingOperation).toBe(true);
  });
});
