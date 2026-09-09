import { describe, expect, it, vi } from "vitest";

/**
 * 四个 stub 的接线。
 *
 * 值得钉住的只有一件事：**它们共用同一个 transport**。`ApplicationService`
 * 走的是 worker 自己的管道、其余走 relay，但那个路由发生在 Rust 侧
 * （`commands::bridge::channel_for`，按 service 名分）——前端这边如果给
 * ApplicationService 单独造一个 transport，就等于把那个决定复制了一份到
 * 一个不该有它的地方。
 */

const transports = vi.hoisted(() => [] as unknown[]);
vi.mock("./transport", () => ({
  createTauriTransport: () => {
    const transport = { unary: vi.fn(), stream: vi.fn() };
    transports.push(transport);
    return transport;
  },
}));

import {
  applicationService,
  desktopService,
  managedService,
  startedService,
} from "./clients";

describe("clients", () => {
  it("只建一个 transport", () => {
    expect(transports).toHaveLength(1);
  });

  it("四个域各有一个 stub", () => {
    expect(typeof startedService.subscribeGroups).toBe("function");
    expect(typeof desktopService.getDaemonInfo).toBe("function");
    expect(typeof managedService.stopService).toBe("function");
    expect(typeof applicationService.checkConfig).toBe("function");
  });

  it("新接的那几条能力都在 stub 上", () => {
    // 加了 proto 却忘了跑 `pnpm gen:proto` 的话，这里会直接是 undefined。
    expect(typeof desktopService.exportCrashReport).toBe("function");
    expect(typeof desktopService.exportOOMReport).toBe("function");
    expect(typeof desktopService.exportPowerReport).toBe("function");
    expect(typeof applicationService.formatConfig).toBe("function");
    expect(typeof applicationService.encodeProfile).toBe("function");
    expect(typeof applicationService.decodeProfile).toBe("function");
    expect(typeof applicationService.startStandaloneNetworkQualityTest).toBe(
      "function",
    );
    expect(typeof applicationService.startStandaloneSTUNTest).toBe("function");
  });
});
