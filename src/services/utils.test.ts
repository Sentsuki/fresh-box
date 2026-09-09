import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatBytes,
  formatClockTime,
  formatLastUpdated,
  formatRelativeDuration,
  formatSpeed,
} from "./utils";

describe("formatBytes", () => {
  it("二进制单位，逐级进位", () => {
    // 字节量用 1024；比特率（`format.ts` 的 `formatBitrate`）用 1000。
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    expect(formatBytes(1024 ** 3)).toBe("1.00 GB");
    expect(formatBytes(1024 ** 4)).toBe("1.00 TB");
  });

  it("小数位随数值大小收缩", () => {
    // 表格里这一列要对齐，位数太多会把列撑开。
    expect(formatBytes(1536)).toBe("1.50 KB"); // < 10 → 两位
    expect(formatBytes(1024 * 15)).toBe("15.0 KB"); // < 100 → 一位
    expect(formatBytes(1024 * 500)).toBe("500 KB"); // >= 100 → 不带小数
    expect(formatBytes(999)).toBe("999 B"); // 字节永远不带小数
  });

  it("超出 TB 也停在 TB，不会跑出单位表", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024 TB");
  });

  it("零、负数和非有限值都是 0 B", () => {
    // 这几种值真的会出现：连接刚建立时统计是 0，delta 偶尔为负，
    // 除零会得到 Infinity。任何一种都不该在界面上显示成 NaN。
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});

describe("formatSpeed", () => {
  it("就是字节量加个后缀", () => {
    expect(formatSpeed(1024)).toBe("1.00 KB/s");
    expect(formatSpeed(0)).toBe("0 B/s");
  });
});

describe("formatLastUpdated", () => {
  it("没有值时说「从未更新」而不是空白", () => {
    expect(formatLastUpdated()).toBe("Never updated");
    expect(formatLastUpdated("")).toBe("Never updated");
  });

  it("有值时给出本地化的日期时间", () => {
    // 具体格式跟随运行环境的 locale，所以只断言「确实格式化过了」——
    // 断言具体字符串会让这条测试在别的机器上变红。
    const formatted = formatLastUpdated("2026-01-02T03:04:05Z");
    expect(formatted).not.toBe("Never updated");
    expect(formatted).toMatch(/\d/);
  });
});

describe("formatClockTime", () => {
  it("没有值时是占位符", () => {
    expect(formatClockTime()).toBe("--");
    expect(formatClockTime("")).toBe("--");
  });

  it("解析不了的字符串原样返回", () => {
    // 日志行里的时间戳来自 daemon，格式不对时显示原文比显示 "Invalid Date"
    // 有用得多 —— 至少还能看出它到底送了什么。
    expect(formatClockTime("not a date")).toBe("not a date");
  });

  it("能解析的就格式化成 24 小时制", () => {
    expect(formatClockTime("2026-01-02T03:04:05Z")).toMatch(
      /\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("formatRelativeDuration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(now: string, started: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    return formatRelativeDuration(started);
  }

  it("按时长挑最合适的粒度", () => {
    expect(at("2026-01-01T01:02:03Z", "2026-01-01T00:00:00Z")).toBe("1h 2m 3s");
    expect(at("2026-01-01T00:02:03Z", "2026-01-01T00:00:00Z")).toBe("2m 3s");
    expect(at("2026-01-01T00:00:03Z", "2026-01-01T00:00:00Z")).toBe("3s");
  });

  it("未来时间钳到 0 而不是显示负数", () => {
    // 机器时钟被改过、或者 daemon 和本机差几秒，都会走到这里。
    expect(at("2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z")).toBe("0s");
  });

  it("空值和坏值都是占位符", () => {
    expect(formatRelativeDuration()).toBe("--");
    expect(formatRelativeDuration("")).toBe("--");
    expect(formatRelativeDuration("not a date")).toBe("--");
  });
});
