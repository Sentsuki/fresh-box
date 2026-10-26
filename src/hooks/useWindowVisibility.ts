import { create } from "zustand";
import { useSingboxStore } from "../stores/singboxStore";
import { startAllStreams, stopAllStreams } from "./streamLifecycle";
import { useTauriEvent } from "./useTauriEvent";

interface WindowVisibilityState {
  isVisible: boolean;
  setVisible: (v: boolean) => void;
}

export const useWindowVisibilityStore = create<WindowVisibilityState>(
  (set) => ({
    isVisible: true,
    setVisible: (isVisible) => set({ isVisible }),
  }),
);

/** Read current visibility outside of React components. */
export function isWindowVisible(): boolean {
  return useWindowVisibilityStore.getState().isVisible;
}

/**
 * Register once at the App root to listen for Tauri visibility events.
 * Automatically pauses the traffic/memory/connections/logs streams (Tauri
 * event subscriptions, not sockets) when hidden and resumes them (if
 * sing-box is running) when the window is shown again.
 */
export function useWindowVisibilityListener() {
  useTauriEvent<boolean>("window-visibility-changed", (visible) => {
    useWindowVisibilityStore.getState().setVisible(visible);

    if (!visible) {
      // Pause streams and clear cached state to start fresh when shown again.
      stopAllStreams(true);
    } else if (useSingboxStore.getState().isRunning) {
      startAllStreams();
    }
  });
}
