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
// call going through `invoke`/`invokeCommand` with a string literal name
// (never a dynamically constructed one).
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
  const callPattern = /\b(?:invoke|invokeCommand)\b[^(\n]*\(\s*["']([a-zA-Z0-9_]+)["']/g;

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

  console.log(
    `check-commands: OK — ${invoked.size} invoked command name(s) all match a registered ` +
      `command (${registered.size} registered).`,
  );
}

main();
