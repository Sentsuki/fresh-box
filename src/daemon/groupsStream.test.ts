import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "@bufbuild/protobuf";
import {
  GroupItemSchema,
  GroupSchema,
  GroupsSchema,
  type Groups,
} from "../gen/daemon/started_service_pb";

/**
 * 代理组与 Clash 模式的两条常驻订阅（审计项 M-10：以前是「开流取一帧就关」，
 * 别的客户端切了节点、urltest 组自动改选，代理页全都收不到）。
 *
 * 两条流各自建一个控制器，这里按建立顺序把它们的回调抓出来分别驱动。
 */

const hooks = vi.hoisted(() => ({
  controllers: [] as {
    onMessage: (m: unknown) => void;
    onStatus: (s: string) => void;
  }[],
  getClashModeStatus: (() => Promise.resolve({ modeList: [] as string[] })) as (
    request: unknown,
  ) => Promise<{ modeList: string[] }>,
}));

vi.mock("./subscription", () => ({
  createStreamController: (options: {
    onMessage: (m: unknown) => void;
    onStatus: (s: string) => void;
  }) => {
    hooks.controllers.push(options);
    return { start: () => {}, stop: () => {} };
  },
}));
// `proxyStore` 会经由 `proxyActions` → `useConnectionsStream` 拉进整个
// Fluent UI（那条链要多花七八秒转换）。这个测试用不到里面任何东西，直接断掉。
vi.mock("./proxyActions", () => ({
  awaitNodeDelay: vi.fn(),
  awaitGroupDelays: vi.fn(),
  closeConnectionsByGroup: vi.fn(),
}));
vi.mock("./clients", () => ({
  startedService: {
    subscribeGroups: () => undefined,
    subscribeClashMode: () => undefined,
    getClashModeStatus: (request: unknown) => hooks.getClashModeStatus(request),
  },
}));

import { useProxyStore } from "../stores/proxyStore";
import { currentGroups, onGroupsChanged } from "./groupsStream";

// 建立顺序：groups 在前，clash mode 在后（见模块底部）。
const groupsStream = () => hooks.controllers[0];
const modeStream = () => hooks.controllers[1];

function groups(selected = "a", selectable = true): Groups {
  return create(GroupsSchema, {
    group: [
      create(GroupSchema, {
        tag: "manual",
        type: "selector",
        selectable,
        selected,
        items: [
          create(GroupItemSchema, { tag: "a", urlTestDelay: 10 }),
          create(GroupItemSchema, { tag: "b", urlTestDelay: 0 }),
        ],
      }),
    ],
  });
}

beforeEach(() => {
  hooks.getClashModeStatus = () =>
    Promise.resolve({ modeList: ["rule", "global"] });
  groupsStream().onStatus("disconnected");
  useProxyStore.getState().clearOverview();
});

describe("groups 流", () => {
  it("每一帧都整理成视图模型推给代理页", () => {
    groupsStream().onMessage(groups("b"));

    const overview = useProxyStore.getState().overview;
    expect(overview?.proxy_groups).toHaveLength(1);
    expect(overview?.proxy_groups[0].current).toBe("b");
    // `urlTestDelay <= 0` 是「还没测过」，不是 0 毫秒。
    expect(overview?.proxy_groups[0].options[1].delay).toBeNull();
  });

  it("原始快照留一份给测速比对用", () => {
    groupsStream().onMessage(groups());
    expect(currentGroups()).toHaveLength(1);
    expect(currentGroups()[0].items[0].tag).toBe("a");
  });

  it("订阅者收到每一帧", () => {
    const seen: number[] = [];
    const unsubscribe = onGroupsChanged((g) => seen.push(g.length));

    groupsStream().onMessage(groups());
    groupsStream().onMessage(groups("b"));
    unsubscribe();
    groupsStream().onMessage(groups());

    expect(seen).toEqual([1, 1]);
  });

  it("断连时清空 —— 不留一份已经不对的快照", () => {
    groupsStream().onMessage(groups());
    expect(currentGroups()).toHaveLength(1);

    groupsStream().onStatus("disconnected");

    expect(currentGroups()).toHaveLength(0);
    expect(useProxyStore.getState().overview).toBeNull();
  });

  it("connecting / error 不清空 —— 那是暂时的", () => {
    groupsStream().onMessage(groups());
    groupsStream().onStatus("connecting");
    groupsStream().onStatus("error");
    expect(currentGroups()).toHaveLength(1);
  });
});

describe("clash mode 流", () => {
  it("模式推来就更新，可选模式只取一次", async () => {
    const status = vi.fn(async () => ({ modeList: ["rule", "global"] }));
    hooks.getClashModeStatus = status;

    modeStream().onMessage({ mode: "global" });
    await vi.waitFor(() =>
      expect(useProxyStore.getState().overview?.available_modes).toEqual([
        "rule",
        "global",
      ]),
    );
    expect(useProxyStore.getState().overview?.current_mode).toBe("global");

    // 第二帧不该再问一次 —— 可选模式由配置决定，实例跑着的时候不会变。
    modeStream().onMessage({ mode: "rule" });
    await vi.waitFor(() =>
      expect(useProxyStore.getState().overview?.current_mode).toBe("rule"),
    );
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("取可选模式失败不影响当前模式的显示", async () => {
    hooks.getClashModeStatus = () => Promise.reject(new Error("not started"));

    modeStream().onMessage({ mode: "global" });

    await vi.waitFor(() =>
      expect(useProxyStore.getState().overview?.current_mode).toBe("global"),
    );
    expect(useProxyStore.getState().overview?.available_modes).toEqual([]);
  });
});
