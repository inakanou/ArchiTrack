import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * CI環境かどうかを判定
 * GitHub ActionsではCI=trueが自動設定される
 */
const isCI = !!process.env.CI;

// 共通設定
const commonTestConfig = {
  globals: true,
  environment: 'jsdom' as const,
  setupFiles: ['./vitest.setup.ts'],
  reporter: isCI ? (['default', 'github-actions'] as const) : (['verbose'] as const),
  fileParallelism: false,
  pool: 'forks' as const,
  poolOptions: {
    forks: {
      maxForks: 1,
      minForks: 1,
      isolate: true,
    },
  },
  coverage: {
    provider: 'istanbul' as const,
    reporter: ['text', 'json', 'html'] as const,
    exclude: [
      'node_modules/',
      'dist/',
      'src/**/*.d.ts',
      'src/vite-env.d.ts',
      'src/**/*.css',
      'src/**/index.ts',
    ],
    thresholds: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};

export default defineConfig({
  plugins: [react()],
  test: {
    ...commonTestConfig,
    // デフォルトのincludeパターン（--projectフラグなしの場合）
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // ============================================================================
    // Projects（WSL環境向けメモリ最適化）
    // ============================================================================
    // ベストプラクティス: テストを10個のプロジェクトに分割して順次実行
    // - 各プロジェクト実行後にメモリが解放される
    // - 軽量→重い順で実行してメモリ効率を最大化
    // ============================================================================
    projects: [
      // ===== 1. Lightweight Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'lightweight',
          include: [
            'src/__tests__/{utils,types}/**/*.{test,spec}.{ts,tsx}',
            'src/__tests__/formatters.test.ts',
            'src/utils/sentry.test.ts',
          ],
        },
      },

      // ===== 2. API & Services Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'api',
          include: [
            'src/__tests__/api/**/*.{test,spec}.{ts,tsx}',
            'src/__tests__/services/**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },

      // ===== 3. Contexts Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'contexts',
          include: ['src/__tests__/contexts/**/*.{test,spec}.{ts,tsx}'],
        },
      },

      // ===== 4. Hooks - Auth Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'hooks-auth',
          include: [
            'src/__tests__/hooks/useAuth.test.tsx',
            'src/__tests__/hooks/useSiteSurveyPermission.test.ts',
          ],
        },
      },

      // ===== 5. Hooks - UI Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'hooks-ui',
          include: [
            'src/__tests__/hooks/useKeyboardNavigation.test.tsx',
            'src/__tests__/hooks/useMediaQuery.test.ts',
            'src/__tests__/hooks/useResponsive.test.ts',
            'src/__tests__/hooks/useToast.test.tsx',
            'src/__tests__/hooks/useNetworkError.test.tsx',
            'src/__tests__/hooks/useNetworkStatus.test.ts',
          ],
        },
      },

      // ===== 6. Hooks - Site Survey Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'hooks-site-survey',
          include: [
            'src/__tests__/hooks/useAnnotationRestoration.test.ts',
            'src/__tests__/hooks/useSiteSurveyError.test.ts',
          ],
        },
      },

      // ===== 7. Hooks - Canvas Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'hooks-canvas',
          include: [
            'src/__tests__/hooks/useCanvasOptimization.test.ts',
            'src/__tests__/hooks/useFabricUndoIntegration.test.ts',
            'src/__tests__/hooks/useUndoKeyboardShortcuts.test.ts',
            'src/__tests__/hooks/useUndoState.test.ts',
          ],
        },
      },

      // ===== 8. Hooks - Form Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'hooks-form',
          include: [
            'src/__tests__/hooks/useUnsavedChanges.test.ts',
            'src/hooks/useAutoSave.test.ts',
            'src/hooks/useAutocomplete.test.ts',
            'src/hooks/useQuantityTableSave.test.ts',
          ],
        },
      },

      // ===== 9. Core Components Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'components-core',
          include: [
            'src/__tests__/components/*.{test,spec}.{ts,tsx}',
            'src/__tests__/components/common/**/*.{test,spec}.{ts,tsx}',
            'src/components/common/**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },

      // ===== 10. Projects Feature Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'projects',
          include: [
            'src/__tests__/components/projects/**/*.{test,spec}.{ts,tsx}',
            'src/components/projects/**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },

      // ===== 11. Quantity Table Feature Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'quantity-table',
          include: [
            'src/components/quantity-table/**/*.{test,spec}.{ts,tsx}',
            'src/pages/QuantityTable*.{test,spec}.{ts,tsx}',
          ],
        },
      },

      // ===== 12. Site Surveys Feature Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'site-surveys',
          include: ['src/__tests__/components/site-survey*/**/*.{test,spec}.{ts,tsx}'],
        },
      },

      // ===== 13. Trading Partners Feature Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'trading-partners',
          include: ['src/__tests__/components/trading-partners/**/*.{test,spec}.{ts,tsx}'],
        },
      },

      // ===== 14. Pages Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'pages',
          include: [
            'src/__tests__/pages/**/*.{test,spec}.{ts,tsx}',
            'src/pages/**/*.{test,spec}.{ts,tsx}',
          ],
        },
      },

      // ===== 15. Integration & Performance Tests =====
      {
        test: {
          ...commonTestConfig,
          name: 'integration',
          include: [
            'src/__tests__/{integration,performance,routes,accessibility}/**/*.{test,spec}.{ts,tsx}',
            'src/__tests__/App.test.tsx',
          ],
        },
      },
    ],
  },
});
