import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  // Ignore patterns
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  },

  // Base JavaScript configuration
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Playwright E2E tests
  {
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        test: 'readonly',
        expect: 'readonly',
      },
    },
  },

  // TypeScript configuration
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        test: 'readonly',
        expect: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // 検証コード（E2E スペックと検査スクリプト）における識別子の覆いの禁止
  //
  // Task 115.205: 検証 `(d)` 内の `const selectTool` が同じ describe スコープの
  // ヘルパー関数 `selectTool` を覆っており、その検証の中でヘルパーを呼ぶと
  // `ReferenceError: Cannot access 'selectTool' before initialization`（TDZ）になる状態が
  // 実在した。書き方を直すだけでは同じ書き方が持ち込まれた瞬間に再発するため、
  // 規則で捕まえる。
  //
  // 対象は本パッケージの lint 範囲（package.json の `lint` スクリプト）と同一にしてある。
  // frontend / backend はそれぞれの eslint.config.js が所管するため、ここでは触れない。
  //
  // frontend を据え置く判断の根拠（下記の手順で測り直した実測値。2026-08-31 時点）:
  //   frontend の lint 範囲全体（`src/**/*.{js,jsx,ts,tsx} vitest.*.ts`）で 112 件。内訳は
  //     - 単体検証 96 件 = `src/__tests__/` 配下 84 件 ＋ `src/` 配下で実装と同居する `*.test.*` 12 件
  //       （ReceivedQuotationForm 5／SignboardPlacementEditor 4／estimateCalculations 1／
  //        EstimateCoverRenderer 1／EstimatePdfExportService 1）。
  //       うち 86 件は `vi.hoisted()` で作った模擬束縛を検証内の局所名が覆う形。
  //     - 本番コード 16 件 = LoginForm.tsx 1／RegisterForm.tsx 5／useEstimateKeyboard.ts 1／
  //       usePermission.ts 2／EstimateDetailPage.tsx 1／EstimateRequestDetailPage.tsx 3／
  //       UserManagement.tsx 3。こちらは `vi.hoisted()` 由来ではなく `error` / `errors` /
  //       `newErrors` / `err` / `target` / `permissions` / `roleName` の再宣言である。
  //   したがって frontend へ規則を広げる起票は、検証側 96 件だけでなく本番側 16 件の是正を
  //   母集団に含めて範囲を決めること。
  //
  //   測り直しの手順: `frontend/eslint.config.js` に `@typescript-eslint/no-shadow: 'error'` を
  //   仮に足し、作業ディレクトリを frontend にして本番の lint スクリプトを走らせる
  //   （例: `npm --prefix frontend run lint -- --format json`）。数え終えたら仮設定は必ず戻す。
  //
  // 注意: flat config の `files` は実行時の作業ディレクトリを基準に解決される。
  // 本パッケージの lint は常にリポジトリのルートから起動されるため下記の相対パターンで一致する。
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.ts', 'playwright.config.ts'],
    rules: {
      // TypeScript の型と値の同名は覆いではないため、base ルールではなく TS 版を使う
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  },
];
