import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// 前端单测。跑的是纯函数和传输层，不渲染组件 —— 所以是 node 环境，不需要
// jsdom：值得测的东西（分帧、累加、归一化、相位表）都不碰 DOM，而真正需要
// 浏览器的那部分（WebView2、Tauri IPC）本来就只能靠 `cargo test` 里的
// e2e 与手测覆盖。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
