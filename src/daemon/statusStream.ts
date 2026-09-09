import { createStreamController } from "./subscription";
import { startedService } from "./clients";
import { useMemoryStore } from "../hooks/useMemoryStream";
import { useTrafficStore } from "../hooks/useTrafficStream";

/**
 * 流量与内存共用的这**一条** `SubscribeStatus`。
 *
 * 以前是两条：`services/streams.rs` 里 traffic 和 memory 各开一条
 * `subscribe_status`，一个只读 `uplink/downlink`，另一个只读 `memory` ——
 * 而这三个字段本来就在同一条 `Status` 消息里，等于让 daemon 每秒多算一遍
 * runtime 统计、多发一份消息（审计项 M-06）。
 *
 * 前端自己订阅之后这个问题不是被修好，是不再存在：一条流，两个 store。
 *
 * 顺带，`Status` 还带着 `uplinkTotal`/`downlinkTotal` —— 那才是会话累计流量的
 * 正确来源（审计项 M-07 里被 Rust 用「活跃连接求和」顶替掉的那个）。阶段 3 起
 * 连接页就是读的它。
 */

/**
 * `SubscribeStatusRequest.interval` 会被 daemon 直接喂给 Go 的
 * `time.Duration(request.Interval)` —— 那是**纳秒**，不是毫秒
 * （`started_service.go`）。以前这个换算在 Rust 的 `to_interval_nanos` 里做，
 * 现在请求由前端编码，换算也就归前端。写死成纳秒常量而不是在调用处乘，免得
 * 下次有人照着 `1000` 抄成一微秒一帧。
 */
const STATUS_INTERVAL_NANOS = 1_000n * 1_000_000n;

const controller = createStreamController({
  subscribe: (signal) =>
    startedService.subscribeStatus(
      { interval: STATUS_INTERVAL_NANOS },
      { signal },
    ),
  onMessage: (status) => {
    const traffic = useTrafficStore.getState();
    traffic.setTraffic(Number(status.downlink), Number(status.uplink));
    // 会话累计 —— 连接页显示的「总量」用这个，不是对活跃连接求和。
    traffic.setTotals(Number(status.downlinkTotal), Number(status.uplinkTotal));

    // 上报 0 视为「这一拍还没有真实采样」而不是真的零占用：sing-box 的内存
    // 读数在流刚（重）连时可能有一两拍是 0，直接显示会变成「已用 0 B」而不是
    // 「暂无数据」。真实占用不可能恰好为零，所以当哨兵用是安全的。
    const inuse = Number(status.memory);
    if (inuse > 0) {
      useMemoryStore.getState().setInuse(inuse);
    }
  },
  onStatus: (status) => {
    useTrafficStore.getState().setStreamStatus(status);
    useMemoryStore.getState().setStreamStatus(status);
  },
});

export function startStatusStream() {
  controller.start();
}

export function stopStatusStream(clear = false) {
  controller.stop(
    clear
      ? () => {
          useTrafficStore.getState().clear();
          useMemoryStore.getState().clear();
        }
      : undefined,
  );
}
