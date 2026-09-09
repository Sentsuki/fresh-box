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
    coverage: {
      // 生成产物和组件不算进分母：前者不是我们写的，后者这套测试本来就不
      // 渲染（要测得起 jsdom + testing-library，另一笔投入）。剩下的就是
      // 「有逻辑、可以测」的那部分，数字才有参考意义。
      include: [
        "src/daemon/**/*.ts",
        "src/hooks/*.ts",
        "src/types/app.ts",
        "src/services/*.ts",
      ],
      exclude: ["src/**/*.test.ts", "src/gen/**"],
    },
  },
});
