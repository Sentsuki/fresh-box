import {
  startConnectionsStream,
  stopConnectionsStream,
} from "./useConnectionsStream";
import { startLogsStream, stopLogsStream } from "./useLogsStream";
import { startStatusStream, stopStatusStream } from "../daemon/statusStream";

/**
 * 一起起停所有数据流 —— 每个「sing-box 在跑且窗口可见（或反之）」的判断点都要
 * 全部而不是其中几条，所以集中在这里。
 *
 * 只有三条而不是四条：流量与内存来自同一条 `SubscribeStatus`
 * （见 `daemon/statusStream.ts`），阶段 2 之前它们是各开一条的。
 */
export function startAllStreams() {
  startConnectionsStream();
  startStatusStream();
  void startLogsStream();
}

export function stopAllStreams(clear: boolean) {
  stopConnectionsStream(clear);
  stopStatusStream(clear);
  void stopLogsStream(clear);
}
