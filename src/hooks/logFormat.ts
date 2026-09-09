/**
 * 日志行的显示层加工。
 *
 * 独立成文件是为了能单测：`useLogsStream.ts` 会拉进 Fluent UI 的 toast 和
 * daemon 客户端，`import` 它就有副作用；这里两个函数都是纯的。
 */

export function extractCategory(payload: string): string {
  if (!payload.trim()) return "general";
  const bracketMatch = payload.match(/^\[(.+?)\]/);
  if (bracketMatch) return bracketMatch[1];
  const colonIndex = payload.indexOf(":");
  if (colonIndex > 0) return payload.slice(0, colonIndex).trim();
  return payload.split(/\s+/)[0];
}

/**
 * 去掉终端颜色转义（`ESC [ … <终止字节>`）。
 *
 * 这不是编码问题，daemon 真的会送这些字节：`SubscribeLog` 抓的日志走
 * `log.PlatformWriter` 路径，而那个 formatter 的 `DisableColors` 从来没被接上
 * （上游 `log/observable.go` 里那行是注释掉的死代码），所以每行日志都是给终端
 * 上色过的。
 *
 * 以前这一步在 Rust 的 `strip_ansi_codes` 里做 —— 但那是在**改载荷**，正是
 * 「不可以在 Rust 侧发明数据」要挡住的那类事。它本来就是显示层的关心：这个页面
 * 是纯文本查看器所以要剥掉，将来若想真的渲染颜色，原始字节还在。
 */
/** ESC (0x1B)。用转义常量而不是把控制字符直接写进源码 —— 裸控制字符在编辑器
 * 里不可见，被各种工具处理时也容易悄悄丢掉。 */
const ESC = "\u001b";

export function stripAnsiCodes(input: string): string {
  if (!input.includes(ESC)) return input;
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === ESC && input[i + 1] === "[") {
      i += 2;
      // 消费到 CSI 序列的终止字节（0x40–0x7E，不只是 SGR 的 'm'）。
      while (i < input.length) {
        const code = input.charCodeAt(i);
        if (code >= 0x40 && code <= 0x7e) break;
        i += 1;
      }
      continue;
    }
    out += input[i];
  }
  return out;
}
