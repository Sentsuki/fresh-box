import {
  startConnectionsStream,
  stopConnectionsStream,
} from "./useConnectionsStream";
import { startLogsStream, stopLogsStream } from "./useLogsStream";
import { startTrafficStream, stopTrafficStream } from "./useTrafficStream";
import { startMemoryStream, stopMemoryStream } from "./useMemoryStream";

/**
 * Start/stop all four `stream-*` features together — every place that
 * reacts to "sing-box is running and the window is visible" (or not) wants
 * all four, not a subset, so this replaces what used to be the same
 * four-call list duplicated in `useWindowVisibilityListener` and
 * `useDaemonConnectionListener`.
 */
export function startAllStreams() {
  startConnectionsStream();
  startTrafficStream();
  startMemoryStream();
  void startLogsStream();
}

export function stopAllStreams(clear: boolean) {
  stopConnectionsStream(clear);
  stopTrafficStream(clear);
  stopMemoryStream(clear);
  void stopLogsStream(clear);
}
