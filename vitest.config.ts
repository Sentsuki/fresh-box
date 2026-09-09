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
    // 转换结果跨运行缓存 —— 上面那几个 inline 的包每次重新转换要十几秒。
    fsModuleCache: true,
    server: {
      deps: {
        // Fluent UI 的 ESM 产物里 `tabster` 的导出在 node 下解析不出来
        // （"does not provide an export named 'createTabster'"）。让 vite
        // 自己处理这几个包就好了 —— 否则任何一条 import 链只要碰到
        // `useToast` 就整个测试文件加载失败。
        inline: [/@fluentui/, /tabster/, /keyborg/],
      },
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      // 分母是「有逻辑、可以测」的那部分：生成产物（`src/gen/`）不是我们写
      // 的，纯 JSX 的展示组件（`src/components/ui/`、各页面的布局）渲染一遍
      // 只能证明它没崩，不值得为覆盖率数字去堆。有行为的组件单独测（见
      // `src/components/global/`）。
      include: [
        "src/daemon/**/*.ts",
        "src/hooks/*.ts",
        "src/types/app.ts",
        "src/services/*.ts",
        "src/stores/*.ts",
      ],
      exclude: ["src/**/*.test.ts", "src/gen/**"],
      // 防退化，不是目标 —— 卡在当前水平线下面一点，掉下去 CI 就红。想往上
      // 走就顺手把线提上来。
      thresholds: {
        statements: 82,
        branches: 79,
        functions: 78,
        lines: 82,
      },
    },
  },
});
