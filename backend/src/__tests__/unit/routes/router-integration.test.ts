/**
 * @fileoverview ルーター統合テスト（静的検証）
 *
 * Task 14.1: アプリケーションへのルーター統合
 *
 * Requirements:
 * - REQ-19.2: 実行予算のCRUD操作にRESTful APIを提供する
 * - REQ-19.3: 発注データのCRUD操作にRESTful APIを提供する
 * - REQ-19.4: 出来高データのCRUD操作にRESTful APIを提供する
 * - REQ-19.5: 原価（支出実績）データのCRUD操作にRESTful APIを提供する
 * - REQ-19.6: 月次締めデータのCRUD操作にRESTful APIを提供する
 *
 * app.tsのソースコードを静的に検証し、全ルーターが正しく登録されていることを確認する。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '../../../app.ts'), 'utf-8');

describe('ルーター統合テスト - app.ts 静的検証 (Task 14.1)', () => {
  describe('実行予算関連ルーターのインポート確認', () => {
    it('実行予算ルーターがインポートされている', () => {
      expect(appSource).toContain(
        "import executionBudgetRoutes from './routes/execution-budget.routes.js'"
      );
    });

    it('発注ルーターがインポートされている', () => {
      expect(appSource).toContain("import orderRoutes from './routes/order.routes.js'");
    });

    it('出来高ルーターがインポートされている', () => {
      expect(appSource).toContain("import progressRoutes from './routes/progress.routes.js'");
    });

    it('原価・月次締めルーターがインポートされている', () => {
      expect(appSource).toContain(
        "import costMonthlyCloseRoutes from './routes/cost-monthly-close.routes.js'"
      );
    });

    it('エクスポートルーターがインポートされている', () => {
      expect(appSource).toContain("import exportRoutes from './routes/export.routes.js'");
    });
  });

  describe('実行予算関連ルーターのマウント確認', () => {
    it('実行予算ルーターが正しいパスにマウントされている', () => {
      expect(appSource).toContain(
        "app.use('/api/projects/:projectId/execution-budget', executionBudgetRoutes)"
      );
    });

    it('発注ルーターが正しいパスにマウントされている', () => {
      expect(appSource).toContain(
        "app.use('/api/projects/:projectId/execution-budget/orders', orderRoutes)"
      );
    });

    it('出来高ルーターが正しいパスにマウントされている', () => {
      expect(appSource).toContain(
        "app.use('/api/projects/:projectId/execution-budget/progress', progressRoutes)"
      );
    });

    it('原価・月次締めルーターが正しいパスにマウントされている', () => {
      expect(appSource).toContain(
        "app.use('/api/projects/:projectId/execution-budget', costMonthlyCloseRoutes)"
      );
    });

    it('エクスポートルーターが正しいパスにマウントされている', () => {
      expect(appSource).toContain(
        "app.use('/api/projects/:projectId/execution-budget', exportRoutes)"
      );
    });
  });

  describe('ルーターのマウント順序の確認', () => {
    it('エクスポートルートがprogressルートより先にマウントされている', () => {
      const exportIndex = appSource.indexOf(
        "app.use('/api/projects/:projectId/execution-budget', exportRoutes)"
      );
      const progressIndex = appSource.indexOf(
        "app.use('/api/projects/:projectId/execution-budget/progress', progressRoutes)"
      );

      expect(exportIndex).toBeGreaterThan(-1);
      expect(progressIndex).toBeGreaterThan(-1);
      // エクスポートルートがprogressルートより先にマウントされている
      expect(exportIndex).toBeLessThan(progressIndex);
    });

    it('エクスポートルートのマウント順序に関するコメントが存在する', () => {
      expect(appSource).toContain('エクスポートルートはprogressルートより先にマウントする');
    });
  });
});
