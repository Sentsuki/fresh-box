import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";
import { getErrorMessage } from "../services/tauri";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "error";

/**
 * Wraps `@tauri-apps/plugin-updater` — the plugin owns checking, signature
 * verification, downloading, and installing (see `tauri.conf.json`'s
 * `plugins.updater` and `docs/updater-releasing.md`); this store just holds
 * the result so both the startup check (`App.tsx`) and Settings' manual
 * "Check for Updates" card can share one source of truth instead of each
 * running its own independent check.
 */
interface UpdateState {
  status: UpdateStatus;
  update: Update | null;
  /** 0–1, meaningful only while `status === "downloading"`. */
  progress: number;
  error: string | null;
  checkNow: () => Promise<Update | null>;
  installNow: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  update: null,
  progress: 0,
  error: null,

  checkNow: async () => {
    set({ status: "checking", error: null });
    try {
      const update = await check();
      set(
        update
          ? { status: "available", update }
          : { status: "up-to-date", update: null },
      );
      return update;
    } catch (error) {
      set({ status: "error", error: getErrorMessage(error) });
      return null;
    }
  },

  installNow: async () => {
    const { update } = get();
    if (!update) return;

    set({ status: "downloading", progress: 0, error: null });
    try {
      let contentLength = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            set({
              progress:
                contentLength > 0
                  ? Math.min(downloaded / contentLength, 1)
                  : 0,
            });
            break;
          case "Finished":
            set({ status: "installing", progress: 1 });
            break;
        }
      });
      // On Windows, `downloadAndInstall` never actually returns here in
      // practice: the plugin launches the installer and calls
      // `std::process::exit(0)` on the Rust side as part of `install()`
      // itself (with `restartAfterInstall` defaulting to `true`, so the
      // installer relaunches fresh-box once it finishes) — this process is
      // simply gone before this `await` could resolve. Nothing else to do
      // here; left for platforms where the plugin's behavior differs.
    } catch (error) {
      set({ status: "error", error: getErrorMessage(error) });
    }
  },
}));
