import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { updateMicaTheme } from "../services/api";
import { useSettingsStore } from "../stores/settingsStore";

export type ResolvedTheme = "light" | "dark";

/** 把设置里的主题同步到 `<html>` 的 `light` 类（Tailwind 用它）和窗口自己
 * 的标题栏/Mica 配色，返回实际生效的那一个。 */
export function useTheme(): ResolvedTheme {
  const themeMode = useSettingsStore((s) => s.settings.settings.theme_mode);

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

    const win = getCurrentWindow();
    if (themeMode === "system") {
      win.setTheme(null).catch(console.error);
      updateMicaTheme(null).catch(console.error);
    } else {
      win.setTheme(themeMode).catch(console.error);
      updateMicaTheme(isLight).catch(console.error);
    }
  }, [isLight, themeMode]);

  return isLight ? "light" : "dark";
}
