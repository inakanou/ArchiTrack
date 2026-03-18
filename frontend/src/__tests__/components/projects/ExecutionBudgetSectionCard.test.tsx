/**
 * @fileoverview ExecutionBudgetSectionCard 単体テスト
 *
 * Task 65.1: 空状態メッセージ修正のテスト
 * Task 65.2: ExecutionBudgetSectionCardの単体テスト
 *
 * Requirements:
 * - 40.2: セクションタイトル「実行予算」を表示する
 * - 40.3: 実行予算が存在する場合、サマリーカードを表示する
 * - 40.4: カードに契約書名、契約金額、実行金額合計、利益見込額、発注進捗率、作成日時を表示する
 * - 40.5: カードクリックで実行予算管理画面に遷移する
 * - 40.6: 実行予算が存在しない場合「実行予算はまだありません」メッセージと新規作成ボタンを表示する
 * - 40.7: 新規作成ボタンクリックで実行予算作成画面に遷移する
 * - 40.8: ローディング中はスケルトンローダーを表示する
 * - 40.9: 「すべて見る」リンクを表示しない（1:1関係のため）
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ExecutionBudgetSectionCard,
  type ExecutionBudgetSectionInfo,
} from '../../../components/projects/ExecutionBudgetSectionCard';

// ============================================================================
// テスト用データ
// ============================================================================

const projectId = 'project-123';

const mockBudgetInfo: ExecutionBudgetSectionInfo = {
  id: 'budget-1',
  contractName: '工事見積書A',
  contractAmount: 5000000,
  createdAt: '2026-01-15T00:00:00.000Z',
  executionAmountTotal: '3500000',
  profitForecast: '1500000',
  orderProgressRate: '50',
};

// ============================================================================
// ヘルパー
// ============================================================================

function renderComponent(props: {
  budgetInfo: ExecutionBudgetSectionInfo | null;
  isLoading?: boolean;
}) {
  return render(
    <MemoryRouter>
      <ExecutionBudgetSectionCard
        projectId={projectId}
        budgetInfo={props.budgetInfo}
        isLoading={props.isLoading ?? false}
      />
    </MemoryRouter>
  );
}

// ============================================================================
// テスト
// ============================================================================

describe('ExecutionBudgetSectionCard', () => {
  // ==========================================================================
  // REQ-40.2: セクションタイトル表示
  // ==========================================================================

  it('セクションタイトル「実行予算」を表示する (40.2)', () => {
    renderComponent({ budgetInfo: null });

    expect(screen.getByRole('heading', { name: '実行予算' })).toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-40.6: 空状態メッセージ（Task 65.1 修正対象）
  // ==========================================================================

  it('実行予算が存在しない場合「実行予算はまだありません」を表示する (40.6)', () => {
    renderComponent({ budgetInfo: null });

    expect(screen.getByText('実行予算はまだありません')).toBeInTheDocument();
  });

  it('空状態で「実行予算はまだ作成されていません」は表示されない (40.6)', () => {
    renderComponent({ budgetInfo: null });

    expect(screen.queryByText('実行予算はまだ作成されていません')).not.toBeInTheDocument();
  });

  it('空状態で新規作成ボタンを表示する (40.6)', () => {
    renderComponent({ budgetInfo: null });

    const createLink = screen.getByText('新規作成');
    expect(createLink).toBeInTheDocument();
    expect(createLink.closest('a')).toHaveAttribute(
      'href',
      `/projects/${projectId}/execution-budget`
    );
  });

  // ==========================================================================
  // REQ-40.3, 40.4: サマリーカード表示
  // ==========================================================================

  it('実行予算が存在する場合、サマリー情報を表示する (40.3, 40.4)', () => {
    renderComponent({ budgetInfo: mockBudgetInfo });

    // 契約書名
    expect(screen.getByText('工事見積書A')).toBeInTheDocument();
    // 契約金額
    expect(screen.getByText('5,000,000円')).toBeInTheDocument();
    // 利益見込額
    expect(screen.getByText('1,500,000円')).toBeInTheDocument();
    // 実行金額合計
    expect(screen.getByText('3,500,000円')).toBeInTheDocument();
    // 発注進捗率
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-40.5: カードクリック遷移
  // ==========================================================================

  it('「詳細を見る」リンクで実行予算管理画面に遷移する (40.5)', () => {
    renderComponent({ budgetInfo: mockBudgetInfo });

    const detailLink = screen.getByText('詳細を見る');
    expect(detailLink.closest('a')).toHaveAttribute(
      'href',
      `/projects/${projectId}/execution-budget`
    );
  });

  // ==========================================================================
  // REQ-40.8: スケルトンローダー
  // ==========================================================================

  it('ローディング中はスケルトンローダーを表示する (40.8)', () => {
    renderComponent({ budgetInfo: null, isLoading: true });

    expect(screen.getByTestId('execution-budget-section-skeleton')).toBeInTheDocument();
  });

  it('ローディング中は空状態メッセージを表示しない (40.8)', () => {
    renderComponent({ budgetInfo: null, isLoading: true });

    expect(screen.queryByText('実行予算はまだありません')).not.toBeInTheDocument();
  });

  // ==========================================================================
  // REQ-40.9: 「すべて見る」リンクなし
  // ==========================================================================

  it('「すべて見る」リンクを表示しない (40.9)', () => {
    renderComponent({ budgetInfo: mockBudgetInfo });

    expect(screen.queryByText('すべて見る')).not.toBeInTheDocument();
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  it('セクションにregionロールとaria-labelledbyが設定されている', () => {
    renderComponent({ budgetInfo: null });

    const section = screen.getByTestId('execution-budget-section');
    expect(section).toHaveAttribute('role', 'region');
    expect(section).toHaveAttribute('aria-labelledby', 'execution-budget-section-title');
  });
});
