/**
 * @fileoverview ExecutionBudgetSectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 8.1: 実行予算の作成・表示・削除UI実装
 *
 * Requirements:
 * - REQ-1.1: プロジェクト詳細画面で実行予算セクションを表示する
 * - REQ-1.2: 実行予算の新規作成操作を行う
 * - REQ-1.5: プロジェクトに対して実行予算を1つだけ作成可能とする
 * - REQ-1.6: 既存の実行予算が存在する場合は作成ボタンを非活性にし、メッセージを表示する
 * - REQ-1.7: 実行予算に紐づく契約書名、契約金額、作成日時を表示する
 * - REQ-2.1: 削除確認ダイアログを表示する
 * - REQ-2.2: 実行予算を論理削除する
 * - REQ-2.3: 発注済みの発注が存在する場合のエラー表示
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ExecutionBudgetSectionCard,
  type ExecutionBudgetSectionCardProps,
} from './ExecutionBudgetSectionCard';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockBudgetInfo: ExecutionBudgetSectionCardProps['budgetInfo'] = {
  id: 'eb-1',
  contractName: '見積書A',
  contractAmount: 10000000,
  createdAt: '2026-03-01T00:00:00Z',
  executionAmountTotal: '9000000',
  profitForecast: '1000000',
  orderProgressRate: '50.0',
};

describe('ExecutionBudgetSectionCard', () => {
  const projectId = 'project-123';

  describe('実行予算が存在しない場合', () => {
    it('セクションタイトル「実行予算」を表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard projectId={projectId} budgetInfo={null} isLoading={false} />
      );

      expect(screen.getByText('実行予算')).toBeInTheDocument();
    });

    it('「実行予算はまだ作成されていません」メッセージを表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard projectId={projectId} budgetInfo={null} isLoading={false} />
      );

      expect(screen.getByText('実行予算はまだ作成されていません')).toBeInTheDocument();
    });

    it('作成ボタンを表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard projectId={projectId} budgetInfo={null} isLoading={false} />
      );

      expect(screen.getByText('新規作成')).toBeInTheDocument();
    });
  });

  describe('実行予算が存在する場合', () => {
    it('契約書名を表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      expect(screen.getByText('見積書A')).toBeInTheDocument();
    });

    it('契約金額を3桁カンマ区切りで表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      expect(screen.getByText(/10,000,000/)).toBeInTheDocument();
    });

    it('作成日時を表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      // 日本語フォーマットされた日付が表示される
      expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    it('利益見込額を表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      expect(screen.getByText(/1,000,000/)).toBeInTheDocument();
    });

    it('発注進捗率を表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      expect(screen.getByText(/50.0%/)).toBeInTheDocument();
    });

    it('実行予算ページへの「詳細を見る」リンクを表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard
          projectId={projectId}
          budgetInfo={mockBudgetInfo}
          isLoading={false}
        />
      );

      const link = screen.getByText('詳細を見る');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', `/projects/${projectId}/execution-budget`);
    });
  });

  describe('ローディング状態', () => {
    it('スケルトンローダーを表示する', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard projectId={projectId} budgetInfo={null} isLoading={true} />
      );

      expect(screen.getByTestId('execution-budget-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中はコンテンツを非表示にする', () => {
      renderWithRouter(
        <ExecutionBudgetSectionCard projectId={projectId} budgetInfo={null} isLoading={true} />
      );

      expect(screen.queryByText('実行予算はまだ作成されていません')).not.toBeInTheDocument();
    });
  });
});
