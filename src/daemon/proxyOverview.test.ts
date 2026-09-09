import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { GroupSchema, GroupItemSchema } from "../gen/daemon/started_service_pb";
import { toOverview } from "./proxyOverview";

function item(tag: string, delay = 0, type = "shadowsocks") {
  return create(GroupItemSchema, { tag, type, urlTestDelay: delay });
}

function group(
  tag: string,
  options: {
    selectable?: boolean;
    selected?: string;
    type?: string;
    items?: ReturnType<typeof item>[];
  } = {},
) {
  return create(GroupSchema, {
    tag,
    type: options.type ?? "selector",
    selectable: options.selectable ?? true,
    selected: options.selected ?? "",
    items: options.items ?? [],
  });
}

describe("toOverview", () => {
  it("只留 daemon 标了 selectable 的组", () => {
    // 以前是拿 `type` 字符串去猜（`selector`/`urltest`）。`selectable` 就是
    // daemon 对「这组能不能手动选」的直接回答，猜不如问。
    const overview = toOverview(
      [
        group("manual", { selectable: true }),
        group("auto-only", { selectable: false, type: "urltest" }),
      ],
      "rule",
      ["rule", "global"],
    );
    expect(overview.proxy_groups.map((g) => g.name)).toEqual(["manual"]);
  });

  it("没测过的延迟是 null，不是 0", () => {
    // 0 在页面上会被画成「0 ms，快得离谱」；`urlTestDelay <= 0` 的真实含义是
    // 「还没测过」。这是审计里那类「硬造数据」的典型。
    const overview = toOverview(
      [
        group("g", {
          selected: "b",
          items: [item("a", 0), item("b", 120), item("c", -1)],
        }),
      ],
      "rule",
      [],
    );
    const nodes = overview.proxy_groups[0].options;
    expect(nodes.map((n) => n.delay)).toEqual([null, 120, null]);
  });

  it("组的当前延迟取自被选中的那个节点", () => {
    const overview = toOverview(
      [group("g", { selected: "b", items: [item("a", 50), item("b", 120)] })],
      "rule",
      [],
    );
    expect(overview.proxy_groups[0].current).toBe("b");
    expect(overview.proxy_groups[0].current_delay).toBe(120);
  });

  it("选中项不在列表里时当前延迟是 null", () => {
    // 组刚切过、这一帧还没同步上，或者选中的出站被配置删掉了。
    const overview = toOverview(
      [group("g", { selected: "gone", items: [item("a", 50)] })],
      "rule",
      [],
    );
    expect(overview.proxy_groups[0].current_delay).toBeNull();
  });

  it("每个节点自己知道是不是被选中的", () => {
    const overview = toOverview(
      [group("g", { selected: "b", items: [item("a"), item("b")] })],
      "rule",
      [],
    );
    expect(
      overview.proxy_groups[0].options.map((n) => [n.name, n.is_selected]),
    ).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("模式和可选模式原样带过去", () => {
    const overview = toOverview([], "global", ["rule", "global", "direct"]);
    expect(overview.current_mode).toBe("global");
    expect(overview.available_modes).toEqual(["rule", "global", "direct"]);
  });

  it("空的组列表是空列表，不是异常", () => {
    // 实例刚 started、第一帧还没到，或者配置里压根没有可选组。
    expect(toOverview([], "", []).proxy_groups).toEqual([]);
  });

  it("组的类型原样透传，不做映射", () => {
    // Clash 那套 `Selector`/`URLTest` 首字母大写的名字是翻译层的产物。
    const overview = toOverview([group("g", { type: "urltest" })], "rule", []);
    expect(overview.proxy_groups[0].kind).toBe("urltest");
  });
});
