import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEntry } from "../types/app";
import { createDefaultAppSettings } from "../types/app";

/**
 * 启动序列。它刻意**不**去查 sing-box 在不在跑 —— 那件事以及由它派生的一切
 * （流、Overview 数据）由 `useDaemonConnectionListener` 从 daemon 自己的状态
 * 事件得知，在这里再查一次只会和它抢。
 */

// `vi.hoisted` 的工厂跑在所有 import 之前，所以这里不能调
// `createDefaultAppSettings()` —— 留空，`beforeEach` 里再填。
const state = vi.hoisted(() => ({
  profiles: [] as ProfileEntry[],
  stored: null as ReturnType<typeof createDefaultAppSettings> | null,
  saved: [] as unknown[],
}));

vi.mock("../services/api", () => ({
  listProfiles: async () => state.profiles,
  loadAppSettings: async () => state.stored ?? createDefaultAppSettings(),
  saveAppSettings: async (s: unknown) => {
    state.saved.push(s);
    return null;
  },
}));

import { initializeApp } from "./useInit";
import { useAppStore } from "../stores/appStore";
import { useConfigStore } from "../stores/configStore";
import { useSettingsStore } from "../stores/settingsStore";

/** `state.stored` 在 `beforeEach` 里一定填过 —— 收窄一下，免得满地 `!`。 */
function stored() {
  if (!state.stored) throw new Error("stored settings not seeded");
  return state.stored;
}

function profile(id: string): ProfileEntry {
  return {
    id,
    name: id,
    url: null,
    lastUpdated: null,
    autoUpdate: false,
    updateIntervalMinutes: null,
  };
}

beforeEach(() => {
  state.profiles = [];
  state.stored = createDefaultAppSettings();
  state.saved = [];
  useAppStore.setState({ currentPage: "overview", initialized: false });
  useConfigStore.setState({ profiles: [], pendingOperation: false });
  useSettingsStore.setState({
    settings: createDefaultAppSettings(),
    hydrated: false,
    connectionExpandedGroups: {},
  });
});

describe("initializeApp", () => {
  it("读设置、读档案、标记就绪", async () => {
    state.profiles = [profile("a")];
    await initializeApp();

    expect(useSettingsStore.getState().hydrated).toBe(true);
    expect(useConfigStore.getState().profiles).toHaveLength(1);
    expect(useAppStore.getState().initialized).toBe(true);
  });

  it("上次选中的档案还在就保持不变", async () => {
    stored().profiles.selected_profile_id = "b";
    state.profiles = [profile("a"), profile("b")];

    await initializeApp();

    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBe("b");
  });

  it("上次选中的档案没了就退到第一个", async () => {
    // 用户在别处删掉了它，或者这是一次全新安装。
    stored().profiles.selected_profile_id = "gone";
    state.profiles = [profile("a")];

    await initializeApp();

    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBe("a");
  });

  it("一个档案都没有时选中项是 null", async () => {
    await initializeApp();
    expect(
      useSettingsStore.getState().settings.profiles.selected_profile_id,
    ).toBeNull();
  });

  it("初始页从设置里回填", async () => {
    stored().app.current_page = "logs";
    await initializeApp();
    expect(useAppStore.getState().currentPage).toBe("logs");
  });
});
