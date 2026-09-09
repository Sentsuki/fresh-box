import { describe, expect, it } from "vitest";
import {
  accuracyLabel,
  accuracyVariant,
  formatBitrate,
  natBehaviorVariant,
  natFilteringLabel,
  natMappingLabel,
} from "./format";

/**
 * 这些函数的正确性标准不是「读起来顺眼」，而是**和 sing-box 自己的输出一致**
 * —— 同一次测试，命令行 `sing-box tools networkquality` 和这个页面应该给出
 * 一样的数字和标签。所以下面的期望值都对着上游的实现写。
 */

describe("formatBitrate", () => {
  it("十进制单位，和 networkquality.FormatBitrate 一致", () => {
    // 注意是 1000 不是 1024：比特率用十进制，字节量（`formatBytes`）用二进制。
    expect(formatBitrate(1_500_000_000)).toBe("1.5 Gbps");
    expect(formatBitrate(2_500_000)).toBe("2.5 Mbps");
    expect(formatBitrate(1_500)).toBe("1.5 Kbps");
    expect(formatBitrate(999)).toBe("999 bps");
  });

  it("边界正好落在下一档", () => {
    expect(formatBitrate(1_000)).toBe("1.0 Kbps");
    expect(formatBitrate(1_000_000)).toBe("1.0 Mbps");
    expect(formatBitrate(1_000_000_000)).toBe("1.0 Gbps");
  });

  it("零和小数不出意外", () => {
    expect(formatBitrate(0)).toBe("0 bps");
    expect(formatBitrate(0.4)).toBe("0 bps");
    expect(formatBitrate(999.6)).toBe("1000 bps");
  });
});

describe("accuracy", () => {
  it("三档各有标签", () => {
    expect(accuracyLabel(2)).toBe("High");
    expect(accuracyLabel(1)).toBe("Medium");
    expect(accuracyLabel(0)).toBe("Low");
  });

  it("认不出的值退到最保守的一档", () => {
    // 上游加了新档位时，宁可显示 Low 也不要显示 undefined。
    expect(accuracyLabel(99)).toBe("Low");
    expect(accuracyVariant(99)).toBe("error");
  });

  it("标签和配色一一对应", () => {
    expect(accuracyVariant(2)).toBe("success");
    expect(accuracyVariant(1)).toBe("warning");
    expect(accuracyVariant(0)).toBe("error");
  });
});

describe("NAT 类型", () => {
  it("mapping 的枚举值从 2 开始 —— 1 是上游预留的空位", () => {
    expect(natMappingLabel(2)).toBe("Endpoint Independent");
    expect(natMappingLabel(3)).toBe("Address Dependent");
    expect(natMappingLabel(4)).toBe("Address and Port Dependent");
    expect(natMappingLabel(1)).toBe("Unknown");
    expect(natMappingLabel(0)).toBe("Unknown");
  });

  it("filtering 没有那个空位，所以数值整体差一", () => {
    // 两个枚举长得像但错开一位，抄错了会让 NAT 类型显示成完全不同的一种。
    expect(natFilteringLabel(1)).toBe("Endpoint Independent");
    expect(natFilteringLabel(2)).toBe("Address Dependent");
    expect(natFilteringLabel(3)).toBe("Address and Port Dependent");
    expect(natFilteringLabel(0)).toBe("Unknown");
    expect(natFilteringLabel(4)).toBe("Unknown");
  });

  it("越受限的行为配色越靠红", () => {
    expect(natBehaviorVariant("Endpoint Independent")).toBe("success");
    expect(natBehaviorVariant("Address Dependent")).toBe("warning");
    expect(natBehaviorVariant("Address and Port Dependent")).toBe("error");
    expect(natBehaviorVariant("Unknown")).toBe("warning");
  });
});
