#!/usr/bin/env node
// check-commands.mjs —— 守住**手写**的那几个 IPC 调用。
//
// 阶段 5 之后 host 域的命令名、参数名、返回类型全部由 `tauri-specta` 从 Rust
// 生成（`src/gen/host.ts`，见 `src-tauri/src/ipc.rs`），前端通过
// `services/api.ts` 重导出使用 —— 那 47 个命令的漂移已经是编译错误，不需要这
// 个脚本再管。
//
// 剩下手写字符串的只有 daemon bridge 的三个：`daemon_unary`/`daemon_stream`/
// `daemon_cancel`（`src/daemon/transport.ts`）。它们的签名用了
// `ipc::Response` 和 `Channel<InvokeResponseBody>`，specta 描述不了，所以留在
// 原生 `generate_handler!` 上 —— 也就还留在这个脚本的护栏里。
//
// 检查两件事：命令名两侧一致，参数名两侧一致（Rust 的 snake_case 会被 Tauri
// 暴露成 JS 的 camelCase，比较前先归一化）。
//
// Run via `npm run build`'s `prebuild` step (see package.json).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const handlerPath = join(rootDir, "src-tauri", "src", "ipc.rs");
const srcDir = join(rootDir, "src");

function listFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listFiles(full, exts, out);
    } else if (exts.includes(extname(full)) && !entry.includes(".test.")) {
      // 测试文件里的 `invoke("…")` 打的是 mock，不是真命令 —— 拿它们跟
      // `generate_handler!` 对账只会误报。
      out.push(full);
    }
  }
  return out;
}

/** Tauri 把 Rust 的 snake_case 参数名暴露成 JS 的 camelCase。 */
function toCamelCase(name) {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** Tauri 自己注入的参数 —— 不由前端提供，不参与比较。 */
const INJECTED_PARAM_TYPES =
  /^(?:tauri::)?(?:State|AppHandle|Window|WebviewWindow|Webview)\b/;

/** 从 `#[tauri::command]` 的签名里取出前端需要提供的参数名（camelCase）。 */
function extractCommandParams(dir) {
  const params = new Map();
  for (const file of listFiles(dir, [".rs"])) {
    const text = readFileSync(file, "utf8");
    const pattern =
      /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->|\{)/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, name, rawArgs] = match;
      // 按顶层逗号切分 —— 泛型里的逗号（`State<'_, Store>`）不能算。
      const args = [];
      let depth = 0;
      let current = "";
      for (const ch of rawArgs) {
        if ("<([".includes(ch)) depth += 1;
        else if (">)]".includes(ch)) depth -= 1;
        if (ch === "," && depth === 0) {
          args.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
      args.push(current);

      const provided = new Set();
      for (const arg of args) {
        const trimmed = arg.trim();
        const colon = trimmed.indexOf(":");
        if (!trimmed || colon === -1) continue;
        const paramName = trimmed.slice(0, colon).trim();
        const paramType = trimmed.slice(colon + 1).trim();
        if (paramName.startsWith("_")) continue;
        if (INJECTED_PARAM_TYPES.test(paramType)) continue;
        provided.add(toCamelCase(paramName));
      }
      params.set(name, provided);
    }
  }
  return params;
}

/** 从 `invoke*("name", { a, b })` 里取出前端实际传了哪些键。 */
function extractInvokedParams(files) {
  const invoked = new Map();
  const pattern =
    /\b(?:invoke|invokeRaw)\b[^(\n]*\(\s*["'](\w+)["']\s*,\s*\{([\s\S]*?)\}\s*,?\s*\)/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [, name, body] = match;
      const keys = new Set();
      // 先去掉行注释：对象字面量里常有解释性注释，留着会把紧跟其后的那个键
      // 连同注释文本一起吞进 `split(":")[0]`，于是那个键被漏掉。
      const withoutComments = body.replace(/\/\/[^\n]*/g, "");
      for (const piece of withoutComments.split(",")) {
        const key = piece.split(":")[0].trim();
        if (/^\w+$/.test(key)) keys.add(key);
      }
      invoked.set(name, keys);
    }
  }
  return invoked;
}

function extractRegisteredCommands(handlerSource) {
  const match = handlerSource.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error(
      `check-commands: couldn't find a tauri::generate_handler![...] block in ${handlerPath}`,
    );
  }
  return new Set(
    match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      // Each entry is a path like `commands::config::list_profiles` (or a
      // bare local function name) — the command name Tauri exposes is
      // always just the function itself, the last segment.
      .map((entry) => entry.split("::").pop()),
  );
}

function extractInvokedCommands(files) {
  const invokedAt = new Map(); // command name -> ["relative/path:line", ...]
  // Anything up to the opening `(` that isn't itself a `(` — covers a
  // generic type argument list (`invokeRaw<Record<string, number>>(`)
  // without having to actually parse nested angle brackets, since nothing
  // valid in that position ever contains a literal `(`. Scoped to a single
  // line: every call site in this codebase keeps the command name literal
  // on the same line as the `invoke`/`invokeRaw` it belongs to.
  const callPattern = /\b(?:invoke|invokeRaw)\b[^(\n]*\(\s*["']([a-zA-Z0-9_]+)["']/g;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = file.slice(rootDir.length).replace(/\\/g, "/");
    callPattern.lastIndex = 0;
    let match;
    while ((match = callPattern.exec(text)) !== null) {
      const name = match[1];
      const line = text.slice(0, match.index).split("\n").length;
      if (!invokedAt.has(name)) invokedAt.set(name, []);
      invokedAt.get(name).push(`${rel}:${line}`);
    }
  }
  return invokedAt;
}

function main() {
  const handlerSource = readFileSync(handlerPath, "utf8");
  const registered = extractRegisteredCommands(handlerSource);

  const tsFiles = listFiles(srcDir, [".ts", ".tsx"]);
  const invoked = extractInvokedCommands(tsFiles);

  const missing = [...invoked.entries()].filter(([name]) => !registered.has(name));
  const unused = [...registered].filter((name) => !invoked.has(name)).sort();

  if (unused.length > 0) {
    console.warn(
      `check-commands: ${unused.length} command(s) registered in ipc.rs but never invoked ` +
        `from src/ (may be intentional — e.g. only called from Rust itself):\n` +
        unused.map((n) => `  - ${n}`).join("\n"),
    );
  }

  if (missing.length > 0) {
    console.error(
      `check-commands: ${missing.length} command name(s) invoked from src/ aren't registered ` +
        `in ipc.rs's tauri::generate_handler![...] — likely a typo, or a rename that only ` +
        `landed on one side:\n` +
        missing
          .map(([name, locations]) => `  - "${name}" (${locations.join(", ")})`)
          .join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const declared = extractCommandParams(join(rootDir, "src-tauri", "src"));
  const passed = extractInvokedParams(tsFiles);
  const paramProblems = [];
  for (const [command, keys] of passed) {
    const expected = declared.get(command);
    if (!expected) continue; // 命令名那一关已经查过
    for (const key of keys) {
      if (!expected.has(key)) {
        paramProblems.push(
          `  - "${command}" is passed "${key}", which it does not declare ` +
            `(declares: ${[...expected].join(", ") || "nothing"})`,
        );
      }
    }
    for (const key of expected) {
      if (!keys.has(key)) {
        paramProblems.push(
          `  - "${command}" declares "${key}", which the frontend never passes`,
        );
      }
    }
  }

  if (paramProblems.length > 0) {
    console.error(
      `check-commands: ${paramProblems.length} command argument mismatch(es) — a rename that ` +
        `only landed on one side surfaces at runtime as a silently undefined argument:\n` +
        paramProblems.join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-commands: OK — ${invoked.size} invoked command name(s) all match a registered ` +
      `command (${registered.size} registered), and their argument names line up.`,
  );
}

main();
