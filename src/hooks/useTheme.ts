import { useEffect, useState } from "react";
import {
  webDarkTheme,
  webLightTheme,
  type Theme,
} from "@fluentui/react-components";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";

const BASE_OVERRIDES = {
  borderRadiusMedium: "6px",
  borderRadiusLarge: "8px",
  fontFamilyBase: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
};

export const DARK_THEME: Theme = { ...webDarkTheme, ...BASE_OVERRIDES };
export const LIGHT_THEME: Theme = { ...webLightTheme, ...BASE_OVERRIDES };

export function useTheme(): Theme {
  const themeMode = useSettingsStore((s) => s.settings.Settings.theme_mode);

  const [systemIsLight, setSystemIsLight] = useState(
    () => window.matchMedia("(prefers-color-scheme: light)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => setSystemIsLight(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isLight =
    themeMode === "light" || (themeMode === "system" && systemIsLight);

  useEffect(() => {
    document.documentElement.classList.toggle("light", isLight);
    getCurrentWindow()
      .setTheme(isLight ? "light" : "dark")
      .catch(console.error);
    invoke("update_mica_theme", { isLight }).catch(console.error);
  }, [isLight]);

  return isLight ? LIGHT_THEME : DARK_THEME;
}
