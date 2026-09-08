#!/usr/bin/env node
// check-commands.mjs — a build-time cross-check between the two sides of
// fresh-box's Tauri IPC boundary, which otherwise have no compile-time
// connection to each other at all: `src/services/api.ts` invokes ~40 Rust
// commands by string name, and `src-tauri/src/main.rs`'s
// `tauri::generate_handler![...]` list is the only place those names are
// registered. Renaming or removing a command on one side without updating
// the other used to fail silently at compile time on both sides — Rust
// doesn't know the frontend ever calls it, TypeScript doesn't know the
// backend ever defines it — and only surface at runtime, as an opaque
// "command not found" the very first time a user hits that code path.
//
// This is a lightweight regex-based scan, not a real Rust/TS parser —
// deliberately so, rather than pulling in a full codegen pipeline
// (`tauri-specta` et al.) for a single-developer app this size. It's
// accurate for this codebase's actual conventions: one
// `tauri::generate_handler!` block, `#[tauri::command]` functions that are
// never renamed via `#[tauri::command(rename = ...)]`, and every frontend
// call going through `invoke`/`invokeCommand`/`invokeRaw` with a string literal name
// (never a dynamically constructed one).
//
// 它检查两件事：
//   1. 命令**名**两侧一致
//   2. 命令**参数名**两侧一致（Tauri 把 Rust 的 snake_case 暴露成 JS 的
//      camelCase，所以比较前先归一化）
//
// 第 2 条是阶段 5 加的：把 `start_singbox(config_path)` 改成
// `start_singbox(profile_id)` 时，只改一侧不会有任何编译错误，运行时表现是那个
// 参数恒为 `undefined` —— 静默且难查。
//
// 真正的解法是从 Rust 生成 TS 类型（`tauri-specta`），但它对 Tauri v2 目前只有
// release candidate（crates.io 上的稳定版 1.0.2 是 Tauri v1 时代的），不适合放进
// 一个代理客户端的 IPC 边界。等它出稳定版再换 —— 在那之前这个脚本覆盖命令名和
// 参数名，**载荷的字段形状仍然没有护栏**。
//
// Run via `npm run build`'s `prebuild` step (see package.json) — a
// mismatch fails the build instead of shipping silently.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const mainRsPath = join(rootDir, "src-tauri", "src", "main.rs");
const srcDir = join(rootDir, "src");

function listFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listFiles(full, exts, out);
    } else if (exts.includes(extname(full))) {
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
    /\b(?:invoke|invokeCommand|invokeRaw)\b[^(\n]*\(\s*["'](\w+)["']\s*,\s*\{([\s\S]*?)\}\s*,?\s*\)/g;
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

function extractRegisteredCommands(mainRsSource) {
  const match = mainRsSource.match(/tauri::generate_handler!\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error(
      `check-commands: couldn't find a tauri::generate_handler![...] block in ${mainRsPath}`,
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
  // generic type argument list (`invokeCommand<Record<string, number>>(`)
  // without having to actually parse nested angle brackets, since nothing
  // valid in that position ever contains a literal `(`. Scoped to a single
  // line: every call site in this codebase keeps the command name literal
  // on the same line as the `invoke`/`invokeCommand` it belongs to.
  const callPattern = /\b(?:invoke|invokeCommand|invokeRaw)\b[^(\n]*\(\s*["']([a-zA-Z0-9_]+)["']/g;

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
  const mainRsSource = readFileSync(mainRsPath, "utf8");
  const registered = extractRegisteredCommands(mainRsSource);

  const tsFiles = listFiles(srcDir, [".ts", ".tsx"]);
  const invoked = extractInvokedCommands(tsFiles);

  const missing = [...invoked.entries()].filter(([name]) => !registered.has(name));
  const unused = [...registered].filter((name) => !invoked.has(name)).sort();

  if (unused.length > 0) {
    console.warn(
      `check-commands: ${unused.length} command(s) registered in main.rs but never invoked ` +
        `from src/ (may be intentional — e.g. only called from Rust itself):\n` +
        unused.map((n) => `  - ${n}`).join("\n"),
    );
  }

  if (missing.length > 0) {
    console.error(
      `check-commands: ${missing.length} command name(s) invoked from src/ aren't registered ` +
        `in main.rs's tauri::generate_handler![...] — likely a typo, or a rename that only ` +
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
