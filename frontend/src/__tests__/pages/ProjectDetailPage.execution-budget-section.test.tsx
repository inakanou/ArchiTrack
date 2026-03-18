/**
 * @fileoverview ProjectDetailPage 実行予算セクションカード統合テスト（静的検証）
 *
 * Task 14.1: アプリケーションへのルーター統合
 *
 * Requirements:
 * - REQ-1.1: プロジェクト詳細画面で実行予算セクションを表示する
 * - REQ-5.3: 発注一覧の行選択による発注詳細画面への遷移
 *
 * ProjectDetailPageのソースコードを静的に検証し、
 * 実行予算セクションカードが統合されていることを確認する。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDetailSource = readFileSync(
  join(__dirname, '../../pages/ProjectDetailPage.tsx'),
  'utf-8'
);

describe('ProjectDetailPage 実行予算セクションカード統合（静的検証） (Task 14.1)', () => {
  describe('ExecutionBudgetSectionCardのインポート確認', () => {
    it('ExecutionBudgetSectionCardがインポートされている', () => {
      expect(projectDetailSource).toContain('ExecutionBudgetSectionCard');
    });

    it('ExecutionBudgetSectionCardが正しいパスからインポートされている', () => {
      expect(projectDetailSource).toContain(
        "from '../components/projects/ExecutionBudgetSectionCard'"
      );
    });
  });

  describe('実行予算APIの呼び出し確認', () => {
    it('実行予算APIモジュールがインポートされている', () => {
      expect(projectDetailSource).toContain("from '../api/execution-budget'");
    });

    it('getExecutionBudget関数が使用されている', () => {
      expect(projectDetailSource).toContain('getExecutionBudget');
    });
  });

  describe('ExecutionBudgetSectionCardのJSXレンダリング確認', () => {
    it('ExecutionBudgetSectionCardがJSXでレンダリングされている', () => {
      expect(projectDetailSource).toContain('<ExecutionBudgetSectionCard');
    });

    it('projectIdプロパティが渡されている', () => {
      // projectId={project.id} のパターン
      expect(projectDetailSource).toMatch(/ExecutionBudgetSectionCard[\s\S]*?projectId/);
    });
  });

  describe('セクションの配置順序確認', () => {
    it('実行予算セクションが契約書セクションの後に配置されている', () => {
      const contractSectionIndex = projectDetailSource.indexOf('<ContractSectionCard');
      const executionBudgetIndex = projectDetailSource.indexOf('<ExecutionBudgetSectionCard');

      expect(contractSectionIndex).toBeGreaterThan(-1);
      expect(executionBudgetIndex).toBeGreaterThan(-1);
      // 実行予算セクションは契約書セクションの後に配置される
      expect(executionBudgetIndex).toBeGreaterThan(contractSectionIndex);
    });
  });
});
