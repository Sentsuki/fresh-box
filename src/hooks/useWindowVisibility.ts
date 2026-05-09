import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  startConnectionsStream,
  stopConnectionsStream,
} from "./useConnectionsStream";
import { useSingboxStore } from "../stores/singboxStore";
import { useLogsStream } from "./useLogsStream";
import { startTrafficStream, stopTrafficStream } from "./useTrafficStream";
import { startMemoryStream, stopMemoryStream } from "./useMemoryStream";

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
 * Automatically pauses the connections WebSocket when hidden and resumes
 * it (if sing-box is running) when the window is shown again.
 */
export function useWindowVisibilityListener() {
  const setVisible = useWindowVisibilityStore((s) => s.setVisible);
  const { stopStream: stopLogs, startStream: startLogs } = useLogsStream();

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void listen<boolean>("window-visibility-changed", (event) => {
      const visible = event.payload;
      setVisible(visible);

      if (!visible) {
        // Pause stream and clear cached state to start fresh when shown again.
        stopConnectionsStream(true);
        stopLogs(true);
        stopTrafficStream(true);
        stopMemoryStream(true);
      } else {
        if (useSingboxStore.getState().isRunning) {
          startConnectionsStream();
          startLogs();
          startTrafficStream();
          startMemoryStream();
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [setVisible, stopLogs, startLogs]);
}
