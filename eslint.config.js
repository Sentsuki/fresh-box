import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/node_modules/**',
      'src-tauri/**',
      '**/*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // React 推荐规则（含 JSX runtime 模式，无需手动 import React）
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __TAURI__: 'readonly',
        __TAURI_INVOKE__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: {
        // 自动检测 React 版本，无需手动指定
        version: 'detect',
      },
    },
    rules: {
      // ── TypeScript ───────────────────────────────────────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── 通用 JS ──────────────────────────────────────────────
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-unsafe-finally': 'error',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',

      // ── React Hooks ──────────────────────────────────────────
      // 强制 Hooks 使用规则（必须在函数组件 / 自定义 Hook 顶层调用）
      'react-hooks/rules-of-hooks': 'error',
      // 依赖数组缺失或多余均警告
      'react-hooks/exhaustive-deps': 'warn',

      // ── React ────────────────────────────────────────────────
      // 使用新 JSX transform（React 17+），无需 import React
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // prop-types 对 TS 项目无意义，关闭
      'react/prop-types': 'off',
      // 禁止危险的 dangerouslySetInnerHTML（可按需改为 warn）
      'react/no-danger': 'warn',
      // 禁止在渲染中直接修改 state
      'react/no-direct-mutation-state': 'error',
      // 防止 key 缺失
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      // 禁止 findDOMNode（已废弃）
      'react/no-find-dom-node': 'error',
      // 禁止字符串 ref（已废弃）
      'react/no-string-refs': 'error',
      // 防止渲染后访问 this.state（componentDidMount 等）
      'react/no-access-state-in-setstate': 'error',
      // 数组渲染使用稳定 key，禁止用 index（可按需改为 warn）
      'react/no-array-index-key': 'warn',
      // 自闭合标签风格统一
      'react/self-closing-comp': 'warn',

      // ── React Refresh（Vite HMR）────────────────────────────
      // 组件文件只导出组件，保证热更新正常工作
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  prettier,
];