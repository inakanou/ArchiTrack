/**
 * @fileoverview 実行予算関連のフロントエンドルーティング設定テスト
 *
 * Task 14.1: フロントエンドのルーティング設定確認
 *
 * Requirements:
 * - REQ-1.1: プロジェクト詳細画面で実行予算セクションを表示する
 * - REQ-5.3: 発注一覧の行選択による発注詳細画面への遷移
 * - REQ-19.2: 実行予算のCRUD操作にRESTful APIを提供する
 * - REQ-19.3: 発注データのCRUD操作にRESTful APIを提供する
 * - REQ-19.4: 出来高データのCRUD操作にRESTful APIを提供する
 *
 * routes.tsxのソースコードを静的に検証し、ルーティング設定が正しいことを確認する。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routesSource = readFileSync(join(__dirname, '../../routes.tsx'), 'utf-8');

describe('実行予算関連ルーティング設定テスト (Task 14.1)', () => {
  describe('ページコンポーネントのインポート確認', () => {
    it('ExecutionBudgetPageがインポートされている', () => {
      expect(routesSource).toContain(
        "import ExecutionBudgetPage from './pages/ExecutionBudgetPage'"
      );
    });

    it('OrderDetailPageがインポートされている', () => {
      expect(routesSource).toContain("import OrderDetailPage from './pages/OrderDetailPage'");
    });

    it('ProgressInputPageがインポートされている', () => {
      expect(routesSource).toContain("import ProgressInputPage from './pages/ProgressInputPage'");
    });
  });

  describe('ルーティングパスの定義確認', () => {
    it('実行予算メインページのルートが定義されている', () => {
      expect(routesSource).toContain("path: '/projects/:projectId/execution-budget'");
    });

    it('発注詳細ページのルートが定義されている', () => {
      expect(routesSource).toContain(
        "path: '/projects/:projectId/execution-budget/orders/:orderId'"
      );
    });

    it('出来高入力ページのルートが定義されている', () => {
      expect(routesSource).toContain("path: '/projects/:projectId/execution-budget/progress'");
    });
  });

  describe('ページコンポーネントの紐付け確認', () => {
    it('実行予算ページにExecutionBudgetPageコンポーネントが紐付けられている', () => {
      expect(routesSource).toContain('<ExecutionBudgetPage />');
    });

    it('発注詳細ページにOrderDetailPageコンポーネントが紐付けられている', () => {
      expect(routesSource).toContain('<OrderDetailPage />');
    });

    it('出来高入力ページにProgressInputPageコンポーネントが紐付けられている', () => {
      expect(routesSource).toContain('<ProgressInputPage />');
    });
  });

  describe('保護されたルート設定の確認', () => {
    it('実行予算ルートが保護されたルート内に定義されている', () => {
      // ProtectedRouteとProtectedLayoutの子ルートとして定義されていることを確認
      // routes.tsxの構造上、children配列内に定義されているか検証
      const protectedLayoutIndex = routesSource.indexOf('<ProtectedLayout />');
      const executionBudgetIndex = routesSource.indexOf(
        "path: '/projects/:projectId/execution-budget'"
      );

      expect(protectedLayoutIndex).toBeGreaterThan(-1);
      expect(executionBudgetIndex).toBeGreaterThan(-1);
      // ExecutionBudgetPageのルートはProtectedLayout以降に定義されている
      expect(executionBudgetIndex).toBeGreaterThan(protectedLayoutIndex);
    });
  });

  describe('Requirements トレーサビリティの確認', () => {
    it('実行予算ルートにREQ-1.1のコメントが含まれている', () => {
      // routes.tsxに実行予算関連のRequirementsコメントが含まれている
      expect(routesSource).toContain('REQ-1.1');
    });

    it('発注関連のRequirementsコメントが含まれている', () => {
      expect(routesSource).toContain('REQ-6.1');
    });

    it('出来高関連のRequirementsコメントが含まれている', () => {
      expect(routesSource).toContain('REQ-11.1');
    });
  });
});
