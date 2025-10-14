import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  // 忽略构建输出和依赖
  {
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/node_modules/**',
      'src-tauri/**', // 忽略 Rust 后端代码
      '**/*.config.js',
    ],
  },

  // 基础配置
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,

  // JavaScript/TypeScript 文件配置
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node, // 添加 Node.js 全局变量支持
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Vue 规则
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'warn',
      'vue/require-prop-types': 'warn',
      'vue/no-unused-vars': 'warn',
      'vue/html-self-closing': [
        'warn',
        {
          html: {
            void: 'always',
            normal: 'always',
            component: 'always',
          },
        },
      ],
      'vue/component-api-style': ['warn', ['script-setup']],
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts',
          },
        },
      ],

      // TypeScript 规则
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

      // 通用规则
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-unsafe-finally': 'error',
      'no-unused-vars': 'off', // 使用 TypeScript 的规则
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // Vue 文件特殊配置
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  // Tauri API 全局变量配置
  {
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      globals: {
        __TAURI__: 'readonly', // Tauri 全局对象
        __TAURI_INVOKE__: 'readonly',
      },
    },
  },
];