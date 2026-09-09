// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createDefaultAppSettings, type ThemeMode } from "../types/app";

/**
 * 主题。三方要保持一致：Fluent 的 theme 对象、`<html>` 上的 `light` 类
 * （Tailwind 用它）、以及窗口自己的标题栏/Mica 配色（那是 Windows 画的，
 * webview 管不到）。少同步一处的表现就是「深色界面配浅色标题栏」。
 */

const setTheme = vi.hoisted(() => vi.fn(async (_t: unknown) => {}));
const updateMicaTheme = vi.hoisted(() =>
  vi.fn(async (_l: boolean | null) => null),
);
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));
vi.mock("../services/api", () => ({
  updateMicaTheme: (light: boolean | null) => updateMicaTheme(light),
}));

import { DARK_THEME, LIGHT_THEME, useTheme } from "./useTheme";
import { useSettingsStore } from "../stores/settingsStore";

let systemPrefersLight = false;

function stubMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("light") ? systemPrefersLight : !systemPrefersLight,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function setMode(theme_mode: ThemeMode) {
  const settings = createDefaultAppSettings();
  settings.settings.theme_mode = theme_mode;
  useSettingsStore.setState({ settings, hydrated: true });
}

beforeEach(() => {
  setTheme.mockClear();
  updateMicaTheme.mockClear();
  systemPrefersLight = false;
  stubMatchMedia();
  document.documentElement.classList.remove("light");
  setMode("system");
});

describe("useTheme", () => {
  it("显式选浅色时三方都跟着走", async () => {
    setMode("light");
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    expect(result.current).toBe(LIGHT_THEME);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(setTheme).toHaveBeenCalledWith("light");
    expect(updateMicaTheme).toHaveBeenCalledWith(true);
  });

  it("显式选深色同理", async () => {
    setMode("dark");
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    expect(result.current).toBe(DARK_THEME);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(updateMicaTheme).toHaveBeenCalledWith(false);
  });

  it("跟随系统时把选择权交回给系统，而不是替它算一个值", async () => {
    // `null` 的含义是「你自己决定」——传 true/false 会让标题栏在系统主题
    // 变化时不跟着变。
    systemPrefersLight = true;
    stubMatchMedia();
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    expect(result.current).toBe(LIGHT_THEME);
    expect(setTheme).toHaveBeenCalledWith(null);
    expect(updateMicaTheme).toHaveBeenCalledWith(null);
  });

  it("跟随系统且系统是深色", async () => {
    systemPrefersLight = false;
    stubMatchMedia();
    const { result } = renderHook(() => useTheme());
    await act(async () => {});

    expect(result.current).toBe(DARK_THEME);
  });
});
