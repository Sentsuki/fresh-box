import { describe, expect, it } from "vitest";
import { extractCategory, stripAnsiCodes } from "./logFormat";

/** 和被测代码一样用转义常量 —— 裸控制字符写进源码就再也看不见了。 */
const ESC = "\u001b";

describe("stripAnsiCodes", () => {
  it("剥掉 SGR 颜色序列，留下文字", () => {
    // daemon 真的会送这些字节 —— `log.PlatformWriter` 那条路径上
    // `DisableColors` 从来没被接上。
    const line = `${ESC}[31mERROR${ESC}[0m something broke`;
    expect(stripAnsiCodes(line)).toBe("ERROR something broke");
  });

  it("不只认 'm'，整个 CSI 终止字节区间都认", () => {
    // 0x40–0x7E。只认 SGR 的话，光标移动这类序列会把它后面的字符一起吃掉。
    expect(stripAnsiCodes(`${ESC}[2Khello`)).toBe("hello");
    expect(stripAnsiCodes(`${ESC}[1;2Hhi`)).toBe("hi");
  });

  it("没有转义字符时原样返回", () => {
    const plain = "inbound/mixed[mixed-in]: tcp connection from 127.0.0.1";
    expect(stripAnsiCodes(plain)).toBe(plain);
    expect(stripAnsiCodes("")).toBe("");
  });

  it("残缺的序列不会把剩下的日志吞掉", () => {
    // 流被截断时最后一行可能只剩半个序列。吞到行尾是可以接受的（那半个序列
    // 本来也没内容），但不能抛。
    expect(() => stripAnsiCodes(`${ESC}[3`)).not.toThrow();
    expect(stripAnsiCodes(`${ESC}[3`)).toBe("");
    // 孤零零一个 ESC 后面不跟 '[' 的，按普通字符留下。
    expect(stripAnsiCodes(`a${ESC}b`)).toBe(`a${ESC}b`);
  });

  it("多段颜色连在一起也剥干净", () => {
    const line = `${ESC}[90m2026-01-01${ESC}[0m ${ESC}[36minfo${ESC}[0m ready`;
    expect(stripAnsiCodes(line)).toBe("2026-01-01 info ready");
  });
});

describe("extractCategory", () => {
  it("方括号形式取括号里的内容", () => {
    expect(extractCategory("[inbound] started")).toBe("inbound");
  });

  it("方括号取最短的一段，不会贪到后面去", () => {
    expect(extractCategory("[dns] [cache] hit")).toBe("dns");
  });

  it("没有方括号就取第一个冒号之前", () => {
    expect(extractCategory("router: loaded 12 rules")).toBe("router");
  });

  it("冒号在开头不算 —— 那不是分类名", () => {
    // `colonIndex > 0`：拿空串当分类会在筛选下拉里出现一个没有名字的项。
    expect(extractCategory(":weird")).toBe(":weird");
  });

  it("既没括号也没冒号就取第一个词", () => {
    expect(extractCategory("started successfully")).toBe("started");
  });

  it("空白行归到 general", () => {
    expect(extractCategory("")).toBe("general");
    expect(extractCategory("   ")).toBe("general");
  });
});
