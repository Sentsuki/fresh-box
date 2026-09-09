import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProxyOverview } from "../types/app";

/**
 * 代理页的动作层。
 *
 * 贯穿这些用例的一条不变量：**切换结果不在这里写**。模式和勾选都由
 * `SubscribeClashMode` / `SubscribeGroups` 推回来，store 只负责「正在进行中」
 * 的标记。自己抢先写的话，切换失败时界面会显示成功 —— daemon 才是真相源。
 */

const setClashMode = vi.fn(async () => ({}));
const selectOutbound = vi.fn(async () => ({}));
vi.mock("../daemon/clients", () => ({
  startedService: {
    setClashMode: (...a: unknown[]) => setClashMode(...(a as [])),
    selectOutbound: (...a: unknown[]) => selectOutbound(...(a as [])),
  },
}));

const awaitNodeDelay = vi.fn(async () => 42);
const awaitGroupDelays = vi.fn(async () => ({}) as Record<string, number>);
const closeConnectionsByGroup = vi.fn(async () => {});
vi.mock("../daemon/proxyActions", () => ({
  awaitNodeDelay: (...a: unknown[]) => awaitNodeDelay(...(a as [])),
  awaitGroupDelays: (...a: unknown[]) => awaitGroupDelays(...(a as [])),
  closeConnectionsByGroup: (...a: unknown[]) =>
    closeConnectionsByGroup(...(a as [])),
}));

let autoCloseConnections = true;
vi.mock("./settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { settings: { auto_close_connections: autoCloseConnections } },
    }),
  },
}));

import { useProxyStore } from "./proxyStore";

/** 取当前 overview 里那一组的节点 —— 比 `!` 断言在失败时说得清楚。 */
function nodesOf(group = "manual") {
  const overview = useProxyStore.getState().overview;
  const found = overview?.proxy_groups.find((g) => g.name === group);
  if (!found) throw new Error(`no group ${group} in overview`);
  return found.options;
}

function overview(delay: number | null = null): ProxyOverview {
  return {
    current_mode: "rule",
    available_modes: ["rule", "global"],
    proxy_groups: [
      {
        name: "manual",
        kind: "selector",
        current: "a",
        current_delay: delay,
        options: [
          { name: "a", kind: "ss", delay, is_selected: true },
          { name: "b", kind: "ss", delay, is_selected: false },
        ],
      },
    ],
  };
}

beforeEach(() => {
  setClashMode.mockClear();
  selectOutbound.mockClear();
  awaitNodeDelay.mockClear().mockResolvedValue(42);
  awaitGroupDelays.mockClear().mockResolvedValue({});
  closeConnectionsByGroup.mockClear();
  autoCloseConnections = true;
  useProxyStore.setState({
    overview: null,
    errorMessage: null,
    isRefreshing: false,
    activeMode: null,
    activeSelectionKey: null,
    activeDelayNodes: new Set(),
    activeGroupDelay: null,
    groupTestingNodes: new Set(),
  });
});

describe("changeMode", () => {
  it("发出请求，但不自己写模式", async () => {
    useProxyStore.getState().setOverview(overview());
    const ok = vi.fn();
    await useProxyStore.getState().changeMode("global", ok);

    expect(setClashMode).toHaveBeenCalledWith({ mode: "global" });
    expect(ok).toHaveBeenCalled();
    expect(useProxyStore.getState().overview?.current_mode).toBe("rule");
    expect(useProxyStore.getState().activeMode).toBeNull();
  });

  it("切到当前模式、空模式，都直接跳过", async () => {
    useProxyStore.getState().setOverview(overview());
    await useProxyStore.getState().changeMode("rule");
    await useProxyStore.getState().changeMode("   ");
    expect(setClashMode).not.toHaveBeenCalled();
  });

  it("失败时报错并把进行中标记清掉", async () => {
    useProxyStore.getState().setOverview(overview());
    setClashMode.mockRejectedValueOnce(new Error("no instance"));
    const fail = vi.fn();

    await useProxyStore.getState().changeMode("global", undefined, fail);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining("no instance"));
    expect(useProxyStore.getState().activeMode).toBeNull();
  });
});

describe("switchProxy", () => {
  it("选好节点后按设置断开受影响的连接", async () => {
    await useProxyStore.getState().switchProxy("manual", "b");
    expect(selectOutbound).toHaveBeenCalledWith({
      groupTag: "manual",
      outboundTag: "b",
    });
    expect(closeConnectionsByGroup).toHaveBeenCalledWith("manual");
  });

  it("设置关掉时就不断开", async () => {
    autoCloseConnections = false;
    await useProxyStore.getState().switchProxy("manual", "b");
    expect(selectOutbound).toHaveBeenCalled();
    expect(closeConnectionsByGroup).not.toHaveBeenCalled();
  });

  it("同一个组+节点的重复点击被忽略", async () => {
    let release = () => {};
    selectOutbound.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({}))),
    );
    const first = useProxyStore.getState().switchProxy("manual", "b");
    await useProxyStore.getState().switchProxy("manual", "b");
    release();
    await first;

    expect(selectOutbound).toHaveBeenCalledTimes(1);
  });

  it("失败时不断开连接，并清掉进行中标记", async () => {
    selectOutbound.mockRejectedValueOnce(new Error("boom"));
    const fail = vi.fn();
    await useProxyStore.getState().switchProxy("manual", "b", undefined, fail);

    expect(closeConnectionsByGroup).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(useProxyStore.getState().activeSelectionKey).toBeNull();
  });
});

describe("testDelay", () => {
  it("把结果写回对应节点", async () => {
    useProxyStore.getState().setOverview(overview());
    const result = vi.fn();
    await useProxyStore.getState().testDelay("b", result);

    const nodes = nodesOf();
    expect(nodes.find((n) => n.name === "b")?.delay).toBe(42);
    expect(nodes.find((n) => n.name === "a")?.delay).toBeNull();
    expect(result).toHaveBeenCalledWith("b: 42 ms", true);
  });

  it("负延迟当成超时汇报", async () => {
    useProxyStore.getState().setOverview(overview());
    awaitNodeDelay.mockResolvedValueOnce(-1);
    const result = vi.fn();
    await useProxyStore.getState().testDelay("b", result);
    expect(result).toHaveBeenCalledWith("b: timeout", false);
  });

  it("测速失败时把这个节点标成 -1，而不是留着上一次的值", async () => {
    // 留着旧值等于显示一个已经不成立的延迟 —— 用户会以为节点还是好的。
    useProxyStore.getState().setOverview(overview(50));
    awaitNodeDelay.mockRejectedValueOnce(new Error("timeout"));
    const fail = vi.fn();

    await useProxyStore.getState().testDelay("b", undefined, fail);

    const nodes = nodesOf();
    expect(nodes.find((n) => n.name === "b")?.delay).toBe(-1);
    expect(fail).toHaveBeenCalled();
    expect(useProxyStore.getState().activeDelayNodes.size).toBe(0);
  });

  it("同一个节点重复点击被忽略", async () => {
    let release = () => {};
    awaitNodeDelay.mockImplementationOnce(
      () => new Promise<number>((resolve) => (release = () => resolve(1))),
    );
    const first = useProxyStore.getState().testDelay("b");
    await useProxyStore.getState().testDelay("b");
    release();
    await first;

    expect(awaitNodeDelay).toHaveBeenCalledTimes(1);
  });
});

describe("testGroupDelay", () => {
  it("整组结果写回，没测出来的填 -1", async () => {
    // 缺席的节点必须落到 -1 —— 留着旧延迟等于显示一个已经不成立的数字。
    useProxyStore.getState().setOverview(overview(50));
    awaitGroupDelays.mockResolvedValueOnce({ a: 11 });
    const ok = vi.fn();

    await useProxyStore.getState().testGroupDelay("manual", ok);

    const nodes = nodesOf();
    expect(nodes.find((n) => n.name === "a")?.delay).toBe(11);
    expect(nodes.find((n) => n.name === "b")?.delay).toBe(-1);
    expect(ok).toHaveBeenCalledWith("manual: tested 1 nodes");
  });

  it("测试期间标出正在测的节点，结束后清掉", async () => {
    useProxyStore.getState().setOverview(overview());
    let release: (r: Record<string, number>) => void = () => {};
    awaitGroupDelays.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );

    const pending = useProxyStore.getState().testGroupDelay("manual");
    await Promise.resolve();
    expect(useProxyStore.getState().groupTestingNodes.size).toBe(2);

    release({ a: 1, b: 2 });
    await pending;
    expect(useProxyStore.getState().groupTestingNodes.size).toBe(0);
    expect(useProxyStore.getState().activeGroupDelay).toBeNull();
  });

  it("组里没有节点时直接说明，不去测", async () => {
    useProxyStore.getState().setOverview({
      current_mode: "rule",
      available_modes: [],
      proxy_groups: [],
    });
    const ok = vi.fn();

    await useProxyStore.getState().testGroupDelay("manual", ok);

    expect(awaitGroupDelays).not.toHaveBeenCalled();
    expect(ok).toHaveBeenCalledWith("manual: no nodes found");
  });

  it("同一组重复点击被忽略", async () => {
    useProxyStore.getState().setOverview(overview());
    let release: (r: Record<string, number>) => void = () => {};
    awaitGroupDelays.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)),
    );

    const first = useProxyStore.getState().testGroupDelay("manual");
    await useProxyStore.getState().testGroupDelay("manual");
    release({});
    await first;

    expect(awaitGroupDelays).toHaveBeenCalledTimes(1);
  });

  it("失败时报错并复位", async () => {
    useProxyStore.getState().setOverview(overview());
    awaitGroupDelays.mockRejectedValueOnce(new Error("no instance"));
    const fail = vi.fn();

    await useProxyStore.getState().testGroupDelay("manual", undefined, fail);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining("no instance"));
    expect(useProxyStore.getState().activeGroupDelay).toBeNull();
  });
});

describe("clearOverview", () => {
  it("断连时把一切归零，包括进行中的标记", async () => {
    useProxyStore.getState().setOverview(overview(10));
    useProxyStore.setState({ activeMode: "global" });

    useProxyStore.getState().clearOverview();

    const state = useProxyStore.getState();
    expect(state.overview).toBeNull();
    expect(state.activeMode).toBeNull();
    expect(state.activeDelayNodes.size).toBe(0);
  });
});
