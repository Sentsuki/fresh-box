import { beforeEach, describe, expect, it, vi } from "vitest";

const loadExitExpect = vi.fn(
  async (_profileId: string): Promise<Record<string, string>> => ({}),
);
const setExitExpect = vi.fn(
  async (
    _profileId: string,
    _group: string,
    _node: string | null,
  ): Promise<Record<string, string>> => ({}),
);
vi.mock("../services/api", () => ({
  loadExitExpect: (profileId: string) => loadExitExpect(profileId),
  setExitExpect: (profileId: string, group: string, node: string | null) =>
    setExitExpect(profileId, group, node),
}));

import { useExitExpectStore } from "./exitExpectStore";

/**
 * 期望出口的本地副本。要守的是：图钉立刻响应（乐观更新），失败时回到原样，
 * 以及切档案之后旧档案迟到的结果不能盖掉新档案的表。
 */

beforeEach(() => {
  loadExitExpect.mockReset().mockResolvedValue({});
  setExitExpect.mockReset().mockResolvedValue({});
  useExitExpectStore.setState({ profileId: null, expect: {} });
});

describe("load", () => {
  it("按档案读表", async () => {
    loadExitExpect.mockResolvedValueOnce({ test: "TW" });
    await useExitExpectStore.getState().load("p");
    expect(loadExitExpect).toHaveBeenCalledWith("p");
    expect(useExitExpectStore.getState().expect).toEqual({ test: "TW" });
  });

  it("没有选中档案时清空，不发请求", async () => {
    useExitExpectStore.setState({ profileId: "p", expect: { test: "TW" } });
    await useExitExpectStore.getState().load(null);
    expect(loadExitExpect).not.toHaveBeenCalled();
    expect(useExitExpectStore.getState().expect).toEqual({});
  });

  it("切档案后，旧档案迟到的结果被丢掉", async () => {
    let resolveA: (v: Record<string, string>) => void = () => {};
    loadExitExpect.mockImplementationOnce(
      () => new Promise((resolve) => (resolveA = resolve)),
    );
    loadExitExpect.mockResolvedValueOnce({ test: "JP" });

    const slow = useExitExpectStore.getState().load("a");
    await useExitExpectStore.getState().load("b");
    resolveA({ test: "TW" });
    await slow;

    expect(useExitExpectStore.getState().profileId).toBe("b");
    expect(useExitExpectStore.getState().expect).toEqual({ test: "JP" });
  });
});

describe("toggle", () => {
  beforeEach(() => {
    useExitExpectStore.setState({ profileId: "p", expect: {} });
  });

  it("钉住一个节点：先乐观写入，再以后端返回为准", async () => {
    let resolveSave: (v: Record<string, string>) => void = () => {};
    setExitExpect.mockImplementationOnce(
      () => new Promise((resolve) => (resolveSave = resolve)),
    );

    const pending = useExitExpectStore.getState().toggle("test", "TW");
    expect(useExitExpectStore.getState().expect).toEqual({ test: "TW" });
    expect(setExitExpect).toHaveBeenCalledWith("p", "test", "TW");

    resolveSave({ test: "TW", other: "HK" });
    await pending;
    expect(useExitExpectStore.getState().expect).toEqual({
      test: "TW",
      other: "HK",
    });
  });

  it("再点一次已钉住的节点就是取消", async () => {
    useExitExpectStore.setState({ profileId: "p", expect: { test: "TW" } });
    await useExitExpectStore.getState().toggle("test", "TW");
    expect(setExitExpect).toHaveBeenCalledWith("p", "test", null);
    expect(useExitExpectStore.getState().expect).toEqual({});
  });

  it("钉同组的另一个节点是替换", async () => {
    useExitExpectStore.setState({ profileId: "p", expect: { test: "TW" } });
    setExitExpect.mockResolvedValueOnce({ test: "HK" });
    await useExitExpectStore.getState().toggle("test", "HK");
    expect(setExitExpect).toHaveBeenCalledWith("p", "test", "HK");
    expect(useExitExpectStore.getState().expect).toEqual({ test: "HK" });
  });

  it("保存失败：回到原样并报错", async () => {
    useExitExpectStore.setState({ profileId: "p", expect: { test: "TW" } });
    setExitExpect.mockRejectedValueOnce("disk full");
    const onError = vi.fn();

    await useExitExpectStore.getState().toggle("test", "HK", onError);

    expect(useExitExpectStore.getState().expect).toEqual({ test: "TW" });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("disk full"));
  });

  it("没有选中档案时什么都不做", async () => {
    useExitExpectStore.setState({ profileId: null, expect: {} });
    await useExitExpectStore.getState().toggle("test", "TW");
    expect(setExitExpect).not.toHaveBeenCalled();
    expect(useExitExpectStore.getState().expect).toEqual({});
  });
});

describe("clear", () => {
  it("取消一个组的期望", async () => {
    useExitExpectStore.setState({
      profileId: "p",
      expect: { test: "gone", other: "HK" },
    });
    setExitExpect.mockResolvedValueOnce({ other: "HK" });
    await useExitExpectStore.getState().clear("test");
    expect(setExitExpect).toHaveBeenCalledWith("p", "test", null);
    expect(useExitExpectStore.getState().expect).toEqual({ other: "HK" });
  });
});
