import {
  startConnectionsStream,
  stopConnectionsStream,
} from "./useConnectionsStream";
import { startLogsStream, stopLogsStream } from "./useLogsStream";
import { startStatusStream, stopStatusStream } from "../daemon/statusStream";
import { startGroupsStream, stopGroupsStream } from "../daemon/groupsStream";

/**
 * 一起起停所有数据流 —— 每个「sing-box 在跑且窗口可见（或反之）」的判断点都要
 * 全部而不是其中几条，所以集中在这里。
 *
 * 代理组也在其中：它以前是「每次操作现开一条流取一帧」，现在是常驻订阅，所以
 * 归这里统一起停（审计项 M-10）。流量与内存共用一条 `SubscribeStatus`。
 */
export function startAllStreams() {
  startConnectionsStream();
  startStatusStream();
  startGroupsStream();
  void startLogsStream();
}

export function stopAllStreams(clear: boolean) {
  stopConnectionsStream(clear);
  stopStatusStream(clear);
  stopGroupsStream();
  void stopLogsStream(clear);
}
