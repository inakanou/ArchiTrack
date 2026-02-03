/**
 * @fileoverview OverheadCostPanelコンポーネントのテスト（TDDテストファースト）
 *
 * Task 10.3: OverheadCostPanelコンポーネントの実装
 *
 * 諸経費（共通仮設費/現場管理費/一般管理費）計算のUIコンポーネントをテストします。
 *
 * Requirements (estimate-creation):
 * - REQ-7.1: 共通仮設費行の追加を選択した場合、プリセット値を設定する
 * - REQ-7.2: 共通仮設費の単価を手入力で設定可能とする
 * - REQ-7.3: 自動計算機能が有効な場合、国土交通省基準の計算式に準じて単価を自動計算する
 * - REQ-7.4: 自動計算機能が有効な場合、計算に必要なパラメータの入力画面を提供する
 * - REQ-7.5: 自動計算結果を手入力で上書き可能とする
 * - REQ-7.6: 計算中であることを表示する
 * - REQ-8.1〜8.6: 現場管理費（同様）
 * - REQ-9.1〜9.6: 一般管理費（同様）
 *
 * @module components/estimate/OverheadCostPanel.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverheadCostPanel, type OverheadCostResult } from './OverheadCostPanel';

// ============================================================================
// テスト
// ============================================================================

describe('OverheadCostPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 10.3: OverheadCostPanelコンポーネントの実装
  // ====================================================================

  describe('Task 10.3: OverheadCostPanelコンポーネント', () => {
    describe('基本レンダリング', () => {
      it('パネルタイトルが表示される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByText('諸経費計算')).toBeInTheDocument();
      });

      it('諸経費種別選択UIが表示される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByLabelText('諸経費種別')).toBeInTheDocument();
      });

      it('計算ボタンが表示される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByRole('button', { name: '計算' })).toBeInTheDocument();
      });

      it('項目追加ボタンが表示される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByRole('button', { name: '項目追加' })).toBeInTheDocument();
      });
    });

    describe('REQ-7.1, REQ-8.1, REQ-9.1: 諸経費種別選択', () => {
      it('共通仮設費が選択可能', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'COMMON_TEMPORARY');

        expect(costTypeSelect).toHaveValue('COMMON_TEMPORARY');
      });

      it('現場管理費が選択可能', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'SITE_MANAGEMENT');

        expect(costTypeSelect).toHaveValue('SITE_MANAGEMENT');
      });

      it('一般管理費が選択可能', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'GENERAL_ADMIN');

        expect(costTypeSelect).toHaveValue('GENERAL_ADMIN');
      });

      it('デフォルトは共通仮設費', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        expect(costTypeSelect).toHaveValue('COMMON_TEMPORARY');
      });
    });

    describe('REQ-7.4, REQ-8.4, REQ-9.4: 計算パラメータ入力', () => {
      it('直接工事費入力フィールドが表示される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByLabelText('直接工事費')).toBeInTheDocument();
      });

      it('共通仮設費選択時に工期入力フィールドが表示される', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'COMMON_TEMPORARY');

        expect(screen.getByLabelText('工期')).toBeInTheDocument();
      });

      it('共通仮設費選択時に改修工事フラグが表示される', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'COMMON_TEMPORARY');

        expect(screen.getByLabelText('改修工事')).toBeInTheDocument();
      });

      it('現場管理費選択時に純工事費入力フィールドが表示される', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'SITE_MANAGEMENT');

        expect(screen.getByLabelText('純工事費')).toBeInTheDocument();
      });

      it('一般管理費選択時に工事原価入力フィールドが表示される', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'GENERAL_ADMIN');

        expect(screen.getByLabelText('工事原価')).toBeInTheDocument();
      });

      it('パラメータは千円単位で入力', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByText('（千円単位）')).toBeInTheDocument();
      });
    });

    describe('REQ-7.3, REQ-8.3, REQ-9.3: 自動計算実行', () => {
      it('計算ボタンクリックでAPI呼び出し', async () => {
        const onCalculate = vi.fn();
        render(
          <OverheadCostPanel
            estimateId="estimate-1"
            onItemAdded={vi.fn()}
            onCalculate={onCalculate}
          />
        );

        // パラメータ入力
        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, '100000'); // 100,000千円 = 1億円

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '12');

        // 計算ボタンクリック
        const calculateButton = screen.getByRole('button', { name: '計算' });
        await userEvent.click(calculateButton);

        await waitFor(() => {
          expect(onCalculate).toHaveBeenCalledWith({
            costType: 'COMMON_TEMPORARY',
            directCost: '100000',
            constructionPeriod: '12',
            isRenovation: false,
          });
        });
      });

      it('計算結果が表示される', async () => {
        const onCalculate = vi.fn().mockResolvedValue({
          rate: '2.50',
          amount: '2500000',
          formula: 'Kr = Exp(3.346 - 0.282 * loge(100000) + 0.625 * loge(12))',
        });
        render(
          <OverheadCostPanel
            estimateId="estimate-1"
            onItemAdded={vi.fn()}
            onCalculate={onCalculate}
          />
        );

        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, '100000');

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '12');

        const calculateButton = screen.getByRole('button', { name: '計算' });
        await userEvent.click(calculateButton);

        await waitFor(() => {
          expect(screen.getByTestId('calculated-rate')).toHaveTextContent('2.50');
          expect(screen.getByTestId('calculated-amount')).toHaveTextContent('2,500,000');
        });
      });

      it('計算式が表示される', async () => {
        const onCalculate = vi.fn().mockResolvedValue({
          rate: '2.50',
          amount: '2500000',
          formula: 'Kr = Exp(3.346 - 0.282 * loge(100000) + 0.625 * loge(12))',
        });
        render(
          <OverheadCostPanel
            estimateId="estimate-1"
            onItemAdded={vi.fn()}
            onCalculate={onCalculate}
          />
        );

        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, '100000');

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '12');

        const calculateButton = screen.getByRole('button', { name: '計算' });
        await userEvent.click(calculateButton);

        await waitFor(() => {
          expect(screen.getByTestId('calculation-formula')).toHaveTextContent('Kr = Exp');
        });
      });
    });

    describe('REQ-7.2, REQ-8.2, REQ-9.2, REQ-7.5, REQ-8.5, REQ-9.5: 手入力と上書き', () => {
      it('計算結果を手入力で上書き可能', async () => {
        const onCalculate = vi.fn().mockResolvedValue({
          rate: '2.50',
          amount: '2500000',
          formula: 'Kr = Exp(...)',
        });
        render(
          <OverheadCostPanel
            estimateId="estimate-1"
            onItemAdded={vi.fn()}
            onCalculate={onCalculate}
          />
        );

        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, '100000');

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '12');

        const calculateButton = screen.getByRole('button', { name: '計算' });
        await userEvent.click(calculateButton);

        await waitFor(() => {
          expect(screen.getByTestId('calculated-amount')).toBeInTheDocument();
        });

        // 手入力で上書き
        const amountInput = screen.getByLabelText('計算金額');
        await userEvent.clear(amountInput);
        await userEvent.type(amountInput, '3000000');

        expect(amountInput).toHaveValue('3000000');
      });

      it('手入力モードでは計算なしで金額を入力可能', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        // 金額を直接入力
        const amountInput = screen.getByLabelText('計算金額');
        await userEvent.type(amountInput, '5000000');

        expect(amountInput).toHaveValue('5000000');
      });
    });

    describe('REQ-7.6, REQ-8.6, REQ-9.6: 計算処理中インジケーター', () => {
      it('計算中はローディングインジケーターが表示される', async () => {
        const onCalculate = vi.fn(
          (): Promise<OverheadCostResult> =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ rate: '10.00', amount: '100000', formula: 'test' }), 1000)
            )
        );
        render(
          <OverheadCostPanel
            estimateId="estimate-1"
            onItemAdded={vi.fn()}
            onCalculate={onCalculate}
          />
        );

        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, '100000');

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '12');

        const calculateButton = screen.getByRole('button', { name: '計算' });
        await userEvent.click(calculateButton);

        expect(screen.getByText('計算中...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '計算中...' })).toBeDisabled();
      });
    });

    describe('項目追加', () => {
      it('項目追加ボタンクリックでonItemAddedが呼ばれる', async () => {
        const onItemAdded = vi.fn();
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={onItemAdded} />);

        // 金額を入力
        const amountInput = screen.getByLabelText('計算金額');
        await userEvent.type(amountInput, '5000000');

        // 項目追加ボタンクリック
        const addButton = screen.getByRole('button', { name: '項目追加' });
        await userEvent.click(addButton);

        await waitFor(() => {
          expect(onItemAdded).toHaveBeenCalledWith({
            costType: 'COMMON_TEMPORARY',
            name: '共通仮設費',
            specification: '',
            unit: '式',
            quantity: '1',
            unitPrice: '5000000',
          });
        });
      });

      it('金額未入力の場合、項目追加ボタンが無効になる', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const addButton = screen.getByRole('button', { name: '項目追加' });
        expect(addButton).toBeDisabled();
      });

      it('現場管理費の場合、プリセット名称が「現場管理費」', async () => {
        const onItemAdded = vi.fn();
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={onItemAdded} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'SITE_MANAGEMENT');

        const amountInput = screen.getByLabelText('計算金額');
        await userEvent.type(amountInput, '3000000');

        const addButton = screen.getByRole('button', { name: '項目追加' });
        await userEvent.click(addButton);

        await waitFor(() => {
          expect(onItemAdded).toHaveBeenCalledWith(
            expect.objectContaining({
              costType: 'SITE_MANAGEMENT',
              name: '現場管理費',
            })
          );
        });
      });

      it('一般管理費の場合、プリセット名称が「一般管理費」', async () => {
        const onItemAdded = vi.fn();
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={onItemAdded} />);

        const costTypeSelect = screen.getByLabelText('諸経費種別');
        await userEvent.selectOptions(costTypeSelect, 'GENERAL_ADMIN');

        const amountInput = screen.getByLabelText('計算金額');
        await userEvent.type(amountInput, '2000000');

        const addButton = screen.getByRole('button', { name: '項目追加' });
        await userEvent.click(addButton);

        await waitFor(() => {
          expect(onItemAdded).toHaveBeenCalledWith(
            expect.objectContaining({
              costType: 'GENERAL_ADMIN',
              name: '一般管理費',
            })
          );
        });
      });
    });

    describe('バリデーション', () => {
      it('直接工事費に数値以外を入力するとエラー', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const directCostInput = screen.getByLabelText('直接工事費');
        await userEvent.type(directCostInput, 'abc');

        await waitFor(() => {
          expect(screen.getByText('数値を入力してください')).toBeInTheDocument();
        });
      });

      it('工期に負の値を入力するとエラー', async () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        const periodInput = screen.getByLabelText('工期');
        await userEvent.type(periodInput, '-5');

        await waitFor(() => {
          expect(screen.getByText('正の数値を入力してください')).toBeInTheDocument();
        });
      });
    });

    describe('アクセシビリティ', () => {
      it('パネルにaria-labelが設定される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByRole('region', { name: '諸経費計算' })).toBeInTheDocument();
      });

      it('フォーム要素に適切なラベルが設定される', () => {
        render(<OverheadCostPanel estimateId="estimate-1" onItemAdded={vi.fn()} />);

        expect(screen.getByLabelText('諸経費種別')).toBeInTheDocument();
        expect(screen.getByLabelText('直接工事費')).toBeInTheDocument();
        expect(screen.getByLabelText('計算金額')).toBeInTheDocument();
      });
    });
  });
});
