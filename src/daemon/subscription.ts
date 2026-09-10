import { useSingboxStore } from "../stores/singboxStore";

/**
 * 每条数据流共用的「跟着 sing-box 运行状态起停」控制器。
 *
 * 这段逻辑原来在 Rust 的 `services::streams::run_with_reconnect` 里。搬到前端
 * 之后语义完全一样，只是判断依据从 Rust 的 `ConnectionPhase` watch 换成了
 * `useSingboxStore.isRunning`（它本身也是同一个相位推过来的），而订阅由前端
 * 直接向 daemon 建立，中间不再经过任何形状转换。
 *
 * 状态机保持和以前一致，页面上的 `streamStatus` 语义不用改：
 *   connecting   sing-box 没在跑，等它起来
 *   connected    订阅已建立
 *   error        订阅自己断了，但 sing-box 还在跑（管道抖动之类）
 *   disconnected 被要求停止
 *
 * 注意「sing-box 停了导致流结束」不算 error —— 那是正常停止，回到 connecting。
 */
export type StreamStatus =
  "disconnected" | "connecting" | "connected" | "error";

/** 流自身出错后重订阅前的等待，避免出错即重连的紧循环。 */
const RETRY_DELAY_MS = 1500;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** 等 `isRunning` 翻转（或被取消）。 */
function waitForRunningChange(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const initial = useSingboxStore.getState().isRunning;
    let unsubscribe: (() => void) | null = null;
    const done = () => {
      unsubscribe?.();
      unsubscribe = null;
      resolve();
    };
    unsubscribe = useSingboxStore.subscribe((state) => {
      if (state.isRunning !== initial) done();
    });
    signal.addEventListener("abort", done, { once: true });
  });
}

export interface StreamController {
  /** 幂等：已经在跑就什么都不做。 */
  start: () => void;
  /** 幂等。`onStopped` 通常用来清空 store。 */
  stop: (onStopped?: () => void) => void;
}

export function createStreamController<T>(options: {
  subscribe: (signal: AbortSignal) => AsyncIterable<T>;
  onMessage: (message: T) => void;
  onStatus: (status: StreamStatus) => void;
}): StreamController {
  let controller: AbortController | null = null;
  /**
   * 第几轮 `run`。`abort()` 只是让那一轮的 await 尽快返回，并不同步终止它 ——
   * 它的收尾代码会在稍后的微任务里跑，而那时 `start()` 可能已经开了新的一轮。
   * 这个计数器让过期的那一轮闭嘴，否则它最后那句 `disconnected` 会盖在新一轮
   * 的 `connected` 上面。
   */
  let generation = 0;

  async function run(signal: AbortSignal, runId: number) {
    const emit = (status: StreamStatus) => {
      if (runId !== generation) return;
      options.onStatus(status);
    };

    while (!signal.aborted) {
      if (!useSingboxStore.getState().isRunning) {
        emit("connecting");
        await waitForRunningChange(signal);
        continue;
      }

      emit("connected");
      try {
        for await (const message of options.subscribe(signal)) {
          // `break` 而不是 `return`：两条退出路径必须落到同一个收尾上。
          // 以前这里是 `return`，直接跳过了函数末尾那句 `disconnected` ——
          // 而另一条路径（下面的 `break`）会发。于是「流被取消」有没有通知
          // 订阅者，取决于取消发生在哪一刻；`groupsStream` 恰好就是靠
          // `disconnected` 清空代理页数据的。
          if (signal.aborted) break;
          options.onMessage(message);
        }
      } catch {
        // 下面统一按「流断了」处理：是 sing-box 停了还是管道抖了，用
        // `isRunning` 区分，比看错误本身可靠。
      }

      if (signal.aborted) break;
      // sing-box 停了 → 流跟着结束是正常的，回去等它再起来，不报错。
      if (!useSingboxStore.getState().isRunning) continue;

      emit("error");
      await sleep(RETRY_DELAY_MS, signal);
    }
    emit("disconnected");
  }

  return {
    start() {
      if (controller) return;
      controller = new AbortController();
      generation += 1;
      void run(controller.signal, generation);
    },
    stop(onStopped) {
      controller?.abort();
      controller = null;
      // 这里**不**动 `generation`：上一轮还欠一句 `disconnected`，那正是
      // 「停了」这件事的通知。只有下一次 `start()` 才让它作废。
      onStopped?.();
    },
  };
}
