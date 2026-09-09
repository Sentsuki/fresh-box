import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 两套测速 RPC 的取舍：有实例走 `StartedService`（经过代理，可指定出站），
 * 没实例走 `ApplicationService.StartStandalone*`（worker 直测，没有出站参数）。
 *
 * 这是审计项 L-20 的修复 —— 以前只有前一套，「想测一下网络质量」必须先把
 * 服务装好、实例起起来。选错分支的表现是「明明没跑却报连不上」，或者反过来
 * 「明明在跑却测的是直连」，两种都不会有编译错误。
 */

function progressStream<T>(messages: T[]) {
  return (async function* () {
    for (const message of messages) yield message;
  })();
}

const startNetworkQualityTest = vi.fn();
const startSTUNTest = vi.fn();
const startStandaloneNetworkQualityTest = vi.fn();
const startStandaloneSTUNTest = vi.fn();

vi.mock("./clients", () => ({
  startedService: {
    startNetworkQualityTest: (...a: unknown[]) =>
      startNetworkQualityTest(...(a as [])),
    startSTUNTest: (...a: unknown[]) => startSTUNTest(...(a as [])),
  },
  applicationService: {
    startStandaloneNetworkQualityTest: (...a: unknown[]) =>
      startStandaloneNetworkQualityTest(...(a as [])),
    startStandaloneSTUNTest: (...a: unknown[]) =>
      startStandaloneSTUNTest(...(a as [])),
  },
}));

import { useSingboxStore } from "../stores/singboxStore";
import { runNetworkQualityTest, runStunTest } from "./toolStreams";

const NETWORK_QUALITY_MESSAGE = {
  phase: 3,
  downloadCapacity: 1000n,
  uploadCapacity: 500n,
  downloadRPM: 60,
  uploadRPM: 30,
  idleLatencyMs: 12,
  elapsedMs: 2000n,
  isFinal: true,
  error: "",
  downloadCapacityAccuracy: 2,
  uploadCapacityAccuracy: 1,
  downloadRPMAccuracy: 2,
  uploadRPMAccuracy: 1,
};

const STUN_MESSAGE = {
  phase: 2,
  externalAddr: "203.0.113.1:1234",
  latencyMs: 25,
  natMapping: 2,
  natFiltering: 1,
  isFinal: true,
  error: "",
  natTypeSupported: true,
};

const OPTIONS = {
  configURL: "https://example.invalid/config",
  outboundTag: "proxy",
  serial: true,
  http3: false,
  maxRuntimeSeconds: 20,
};

beforeEach(() => {
  startNetworkQualityTest.mockReset();
  startSTUNTest.mockReset();
  startStandaloneNetworkQualityTest.mockReset();
  startStandaloneSTUNTest.mockReset();
  useSingboxStore.getState().setRunning(false);
});

describe("runNetworkQualityTest", () => {
  it("实例在跑时走 StartedService，带上出站", async () => {
    useSingboxStore.getState().setRunning(true);
    startNetworkQualityTest.mockReturnValue(
      progressStream([NETWORK_QUALITY_MESSAGE]),
    );

    const seen: unknown[] = [];
    await runNetworkQualityTest(
      OPTIONS,
      (p) => seen.push(p),
      new AbortController().signal,
    );

    expect(startStandaloneNetworkQualityTest).not.toHaveBeenCalled();
    expect(startNetworkQualityTest.mock.calls[0][0]).toMatchObject({
      configURL: OPTIONS.configURL,
      outboundTag: "proxy",
      serial: true,
      maxRuntimeSeconds: 20,
    });
    expect(seen).toHaveLength(1);
  });

  it("没实例时走 standalone，请求里没有出站字段", async () => {
    startStandaloneNetworkQualityTest.mockReturnValue(
      progressStream([NETWORK_QUALITY_MESSAGE]),
    );

    await runNetworkQualityTest(
      OPTIONS,
      () => {},
      new AbortController().signal,
    );

    expect(startNetworkQualityTest).not.toHaveBeenCalled();
    const request = startStandaloneNetworkQualityTest.mock.calls[0][0];
    // 字段名也不一样：daemon 那边是 `configURL`，standalone 是 `configUrl`。
    expect(request).toEqual({
      configUrl: OPTIONS.configURL,
      serial: true,
      http3: false,
      maxRuntimeSeconds: 20,
    });
    expect(request).not.toHaveProperty("outboundTag");
  });

  it("两条流的进度消息适配成同一个视图模型", async () => {
    startStandaloneNetworkQualityTest.mockReturnValue(
      progressStream([NETWORK_QUALITY_MESSAGE]),
    );

    const seen: { downloadCapacity: number; elapsedMs: number }[] = [];
    await runNetworkQualityTest(
      OPTIONS,
      (p) => seen.push(p),
      new AbortController().signal,
    );

    // bigint → number 是给页面用的适配，字段一一对应，没有凭空造的值。
    expect(seen[0].downloadCapacity).toBe(1000);
    expect(seen[0].elapsedMs).toBe(2000);
  });

  it("收到 isFinal 就返回，不继续读流", async () => {
    const after = vi.fn();
    startStandaloneNetworkQualityTest.mockReturnValue(
      (async function* () {
        yield NETWORK_QUALITY_MESSAGE;
        after();
        yield NETWORK_QUALITY_MESSAGE;
      })(),
    );

    const seen: unknown[] = [];
    await runNetworkQualityTest(
      OPTIONS,
      (p) => seen.push(p),
      new AbortController().signal,
    );

    expect(seen).toHaveLength(1);
    expect(after).not.toHaveBeenCalled();
  });
});

describe("runStunTest", () => {
  it("实例在跑时带出站", async () => {
    useSingboxStore.getState().setRunning(true);
    startSTUNTest.mockReturnValue(progressStream([STUN_MESSAGE]));

    await runStunTest(
      { server: "stun.example:3478", outboundTag: "proxy" },
      () => {},
      new AbortController().signal,
    );

    expect(startSTUNTest.mock.calls[0][0]).toEqual({
      server: "stun.example:3478",
      outboundTag: "proxy",
    });
    expect(startStandaloneSTUNTest).not.toHaveBeenCalled();
  });

  it("没实例时只带服务器地址", async () => {
    startStandaloneSTUNTest.mockReturnValue(progressStream([STUN_MESSAGE]));

    const seen: { externalAddr: string }[] = [];
    await runStunTest(
      { server: "stun.example:3478", outboundTag: "proxy" },
      (p) => seen.push(p),
      new AbortController().signal,
    );

    expect(startSTUNTest).not.toHaveBeenCalled();
    expect(startStandaloneSTUNTest.mock.calls[0][0]).toEqual({
      server: "stun.example:3478",
    });
    expect(seen[0].externalAddr).toBe("203.0.113.1:1234");
  });
});
