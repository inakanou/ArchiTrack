import { createRequire } from 'node:module';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';

// eslint-plugin-react の settings.react.version に 'detect' を指定すると、
// プラグイン内部の detectReactVersion() が ESLint 9 で非推奨・ESLint 10 で削除された
// context.getFilename() を無条件に呼び出すため、ESLint 10 環境
// （ルートの eslint@10 を使う pre-commit / lint-staged 経路）では
// ルール読み込み時に TypeError となり静的検査そのものが起動しない。
// eslint-plugin-react は ESLint 10 未対応（最新 7.37.5 の peerDependencies は eslint ^9.7 まで、
// jsx-eslint/eslint-plugin-react#3977 で対応待ち）のため、
// 実際にインストールされている react のバージョンをここで解決して明示指定し、
// プラグイン側の壊れたバージョン検出経路を通さないようにする。
// ルールを無効化する回避ではなく、バージョン検出手段を ESLint API 非依存に置き換えるもの。
const require = createRequire(import.meta.url);
const reactVersion = require('react/package.json').version;

export default [
  // Ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**',
      '**/storybook-static/**',
    ],
  },

  // Base JavaScript/JSX configuration
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      react: {
        version: reactVersion,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // TODO: eslint-plugin-react-hooks v7.1 で追加された新ルール群。
      // 既存コードに多数の違反があるため段階的に有効化する。
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/unsupported-syntax': 'off',
    },
  },

  // TypeScript/TSX configuration (excluding config files)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['vitest.config.ts', 'vitest.workspace.ts', 'vite.config.ts', '.storybook/**/*.ts'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['vitest.config.ts', 'vitest.workspace.ts', 'vite.config.ts', '.storybook/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      react: {
        version: reactVersion,
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // TODO: eslint-plugin-react-hooks v7.1 で追加された新ルール群。
      // 既存コードに多数の違反があるため段階的に有効化する。
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/unsupported-syntax': 'off',
    },
  },

  // Config files (vitest.config.ts, vitest.workspace.ts, vite.config.ts) without project reference
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['vitest.config.ts', 'vitest.workspace.ts', 'vite.config.ts'],
  })),
  {
    files: ['vitest.config.ts', 'vitest.workspace.ts', 'vite.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
