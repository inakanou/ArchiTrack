/**
 * @fileoverview ProfitRatePanelコンポーネントのテスト（TDDテストファースト）
 *
 * Task 10.2: ProfitRatePanelコンポーネントの実装
 *
 * 利益率適用のUIコンポーネントをテストします。
 *
 * Requirements (estimate-creation):
 * - REQ-6.1: 利益率を指定した場合、全実行金額行に対して利益率を適用した単価を計算する
 * - REQ-6.2: 「すべて上書き」オプションを選択した場合、実行金額行の名称・規格・単位・数量・単価を見積金額行に上書きする
 * - REQ-6.3: 「空の場合のみ上書き」オプションを選択した場合、見積金額行が空の項目のみ実行金額行から上書きする
 * - REQ-6.4: 「単価のみ上書き」オプションを選択した場合、実行金額行の単価のみを見積金額行に上書きする
 * - REQ-6.5: 見積金額行への反映が実行された場合、金額を自動計算して表示する
 * - REQ-6.6: 利益率を百分率で入力可能とする
 *
 * @module components/estimate/ProfitRatePanel.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfitRatePanel } from './ProfitRatePanel';
import type { ExecutionLineInfo } from '../../utils/estimate-calculation';

// ============================================================================
// テストデータ
// ============================================================================

/**
 * テスト用の実行金額行データ（拡張版）
 */
interface ExecutionLineInfoExtended extends ExecutionLineInfo {
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: string | null;
  amount: string | null;
}

const createMockExecutionLines = (): ExecutionLineInfoExtended[] => [
  {
    lineId: 'exec-line-1',
    unitPrice: '100000',
    name: '直接仮設工事',
    specification: '一式',
    unit: '式',
    quantity: '1',
    amount: '100000',
  },
  {
    lineId: 'exec-line-2',
    unitPrice: '200000',
    name: '土工事',
    specification: null,
    unit: '式',
    quantity: '1',
    amount: '200000',
  },
  {
    lineId: 'exec-line-3',
    unitPrice: '150000',
    name: '鉄筋工事',
    specification: 'SD345',
    unit: 'kg',
    quantity: '500',
    amount: '75000000',
  },
];

// ============================================================================
// テスト
// ============================================================================

describe('ProfitRatePanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 10.2: ProfitRatePanelコンポーネントの実装
  // ====================================================================

  describe('Task 10.2: ProfitRatePanelコンポーネント', () => {
    describe('基本レンダリング', () => {
      it('パネルタイトルが表示される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByText('利益率適用')).toBeInTheDocument();
      });

      it('利益率入力フィールドが表示される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByLabelText('利益率')).toBeInTheDocument();
      });

      it('上書きオプション選択UIが表示される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByLabelText('上書きオプション')).toBeInTheDocument();
      });

      it('適用ボタンが表示される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByRole('button', { name: '適用' })).toBeInTheDocument();
      });
    });

    describe('REQ-6.6: 利益率入力（百分率）', () => {
      it('利益率を百分率で入力できる', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        expect(profitRateInput).toHaveValue('10');
      });

      it('利益率入力後に%表示される', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        // %のラベルが表示される
        expect(screen.getByText('%')).toBeInTheDocument();
      });

      it('利益率の範囲は0.00〜500.00%', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');

        // 501%を入力するとエラー
        await userEvent.type(profitRateInput, '501');

        await waitFor(() => {
          expect(screen.getByText('0.00〜500.00の範囲で入力してください')).toBeInTheDocument();
        });
      });

      it('負の利益率はエラーとなる', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '-5');

        await waitFor(() => {
          expect(screen.getByText('0.00〜500.00の範囲で入力してください')).toBeInTheDocument();
        });
      });
    });

    describe('REQ-6.1: プレビュー計算', () => {
      it('利益率入力後にプレビューが表示される', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        await waitFor(() => {
          expect(screen.getByTestId('preview-results')).toBeInTheDocument();
        });
      });

      it('利益率10%で単価110000円が計算される（元100000円）', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        await waitFor(() => {
          // 100000 * 1.10 = 110000
          expect(screen.getByTestId('new-unit-price-exec-line-1')).toHaveTextContent('110,000');
        });
      });

      it('元の単価と新しい単価が両方表示される', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        await waitFor(() => {
          // 元の単価
          expect(screen.getByTestId('original-unit-price-exec-line-1')).toHaveTextContent(
            '100,000'
          );
          // 新しい単価
          expect(screen.getByTestId('new-unit-price-exec-line-1')).toHaveTextContent('110,000');
        });
      });
    });

    describe('REQ-6.2, REQ-6.3, REQ-6.4: 上書きオプション', () => {
      it('「すべて上書き」オプションが選択可能', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const optionSelect = screen.getByLabelText('上書きオプション');
        await userEvent.selectOptions(optionSelect, 'all');

        expect(optionSelect).toHaveValue('all');
      });

      it('「空の場合のみ上書き」オプションが選択可能', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const optionSelect = screen.getByLabelText('上書きオプション');
        await userEvent.selectOptions(optionSelect, 'empty_only');

        expect(optionSelect).toHaveValue('empty_only');
      });

      it('「単価のみ上書き」オプションが選択可能', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const optionSelect = screen.getByLabelText('上書きオプション');
        await userEvent.selectOptions(optionSelect, 'unit_price_only');

        expect(optionSelect).toHaveValue('unit_price_only');
      });

      it('デフォルトは「すべて上書き」', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const optionSelect = screen.getByLabelText('上書きオプション');
        expect(optionSelect).toHaveValue('all');
      });
    });

    describe('REQ-6.5: 適用実行', () => {
      it('適用ボタンクリックでonApplyCompleteが呼ばれる', async () => {
        const executionLines = createMockExecutionLines();
        const onApplyComplete = vi.fn();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={onApplyComplete}
          />
        );

        // 利益率入力
        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        // 適用ボタンクリック
        const applyButton = screen.getByRole('button', { name: '適用' });
        await userEvent.click(applyButton);

        await waitFor(() => {
          expect(onApplyComplete).toHaveBeenCalledWith({
            profitRate: '10',
            overwriteOption: 'all',
          });
        });
      });

      it('利益率未入力の場合、適用ボタンが無効になる', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const applyButton = screen.getByRole('button', { name: '適用' });
        expect(applyButton).toBeDisabled();
      });

      it('利益率エラーの場合、適用ボタンが無効になる', async () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '600'); // 範囲外

        const applyButton = screen.getByRole('button', { name: '適用' });
        expect(applyButton).toBeDisabled();
      });
    });

    describe('処理中状態', () => {
      it('適用処理中はローディングインジケーターが表示される', async () => {
        const executionLines = createMockExecutionLines();
        const onApplyComplete = vi.fn(
          (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1000))
        );
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={onApplyComplete}
          />
        );

        const profitRateInput = screen.getByLabelText('利益率');
        await userEvent.type(profitRateInput, '10');

        const applyButton = screen.getByRole('button', { name: '適用' });
        await userEvent.click(applyButton);

        // ローディング状態になる
        expect(screen.getByText('適用中...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '適用中...' })).toBeDisabled();
      });
    });

    describe('アクセシビリティ', () => {
      it('パネルにaria-labelが設定される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByRole('region', { name: '利益率適用' })).toBeInTheDocument();
      });

      it('フォーム要素に適切なラベルが設定される', () => {
        const executionLines = createMockExecutionLines();
        render(
          <ProfitRatePanel
            estimateId="estimate-1"
            executionLines={executionLines}
            onApplyComplete={vi.fn()}
          />
        );

        expect(screen.getByLabelText('利益率')).toBeInTheDocument();
        expect(screen.getByLabelText('上書きオプション')).toBeInTheDocument();
      });
    });

    describe('空の状態', () => {
      it('実行金額行がない場合、メッセージが表示される', () => {
        render(
          <ProfitRatePanel estimateId="estimate-1" executionLines={[]} onApplyComplete={vi.fn()} />
        );

        expect(screen.getByText('実行金額行がありません')).toBeInTheDocument();
      });
    });
  });
});
