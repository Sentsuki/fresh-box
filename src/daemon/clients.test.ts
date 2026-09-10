import { describe, expect, it, vi } from "vitest";

/**
 * 两个 stub 的接线。
 *
 * 值得钉住的有两件事：
 *
 * 1. **它们共用同一个 transport**。`ApplicationService` 走的是 worker 自己的
 *    管道、`StartedService` 走 relay，但那个路由发生在 Rust 侧
 *    （`commands::bridge::channel_for`，按 service 名分）—— 前端这边如果给
 *    ApplicationService 单独造一个 transport，就等于把那个决定复制了一份到
 *    一个不该有它的地方。
 *
 * 2. **只有这两个 service 有 stub**。`DesktopService`/`ManagedService` 一条
 *    方法都不经 bridge 暴露（`src-tauri/build.rs` 的 `EXPOSED`），所以这里
 *    不该建 stub —— 建了就等于让前端看起来能调，写下去拿到的是运行期
 *    `PermissionDenied` 而不是编译错误。这条断言变红意味着有人把那两个加了
 *    回来，而 Rust 侧多半并没有跟着开放。
 */

const transports = vi.hoisted(() => [] as unknown[]);
vi.mock("./transport", () => ({
  createTauriTransport: () => {
    const transport = { unary: vi.fn(), stream: vi.fn() };
    transports.push(transport);
    return transport;
  },
}));

import * as clients from "./clients";

describe("clients", () => {
  it("只建一个 transport", () => {
    expect(transports).toHaveLength(1);
  });

  it("只导出 bridge 真正放行的那两个 service", () => {
    expect(Object.keys(clients).sort()).toEqual([
      "applicationService",
      "startedService",
    ]);
  });

  it("前端用到的方法都在 stub 上", () => {
    // 加了 proto 却忘了跑 `pnpm gen:proto` 的话，这里会直接是 undefined。
    for (const method of [
      "subscribeGroups",
      "subscribeClashMode",
      "getClashModeStatus",
      "setClashMode",
      "selectOutbound",
      "uRLTest",
      "subscribeStatus",
      "subscribeConnections",
      "closeConnection",
      "closeAllConnections",
      "subscribeLog",
      "startNetworkQualityTest",
      "startSTUNTest",
    ] as const) {
      expect(typeof clients.startedService[method]).toBe("function");
    }

    expect(
      typeof clients.applicationService.startStandaloneNetworkQualityTest,
    ).toBe("function");
    expect(typeof clients.applicationService.startStandaloneSTUNTest).toBe(
      "function",
    );
  });
});
