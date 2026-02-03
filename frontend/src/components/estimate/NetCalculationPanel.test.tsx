/**
 * @fileoverview NetCalculationPanelコンポーネントのテスト（TDDテストファースト）
 *
 * Task 10.1: NetCalculationPanelコンポーネントの実装
 *
 * NET金額計算と案分のUIコンポーネントをテストします。
 *
 * Requirements (estimate-creation):
 * - REQ-5.1: 業者と対象の業者金額行を指定した場合、その業者金額行を案分対象として選択状態にする
 * - REQ-5.2: 案分から除外する諸経費行を指定した場合、指定された諸経費行を案分対象から除外する
 * - REQ-5.3: NET金額を入力した場合、除外された諸経費行以外の業者金額行を実行金額行に転記する
 * - REQ-5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - REQ-5.5: 案分計算が実行された場合、案分後の金額を自動計算して実行金額行に表示する
 * - REQ-5.6: 案分対象となった業者を識別可能な状態で管理する
 * - REQ-5.7: 計算処理中であることを表示する
 *
 * @module components/estimate/NetCalculationPanel.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetCalculationPanel } from './NetCalculationPanel';
import type { VendorLineInfo } from '../../utils/estimate-calculation';

// ============================================================================
// テストデータ
// ============================================================================

/**
 * テスト用の拡張業者金額行データ（名称付き）
 */
interface VendorLineInfoExtended extends VendorLineInfo {
  name: string;
  vendorName: string;
}

const createMockVendorLinesExtended = (): VendorLineInfoExtended[] => [
  {
    id: 'vendor-line-1',
    amount: '500000',
    name: '直接仮設工事',
    vendorName: '株式会社A建設',
  },
  {
    id: 'vendor-line-2',
    amount: '300000',
    name: '土工事',
    vendorName: '株式会社A建設',
  },
  {
    id: 'vendor-line-3',
    amount: '100000',
    name: '共通仮設費',
    vendorName: '株式会社A建設',
  },
  {
    id: 'vendor-line-4',
    amount: '80000',
    name: '現場管理費',
    vendorName: '株式会社A建設',
  },
  {
    id: 'vendor-line-5',
    amount: '200000',
    name: '電気工事',
    vendorName: '株式会社B電設',
  },
];

// ============================================================================
// テスト
// ============================================================================

describe('NetCalculationPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 10.1: NetCalculationPanelコンポーネントの実装
  // ====================================================================

  describe('Task 10.1: NetCalculationPanelコンポーネント', () => {
    describe('基本レンダリング', () => {
      it('パネルタイトルが表示される', () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        expect(screen.getByText('NET金額計算・案分')).toBeInTheDocument();
      });

      it('業者選択UIが表示される', () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        expect(screen.getByLabelText('対象業者')).toBeInTheDocument();
      });

      it('NET金額入力フィールドが業者選択後に表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        // 業者選択前は表示されない
        expect(screen.queryByLabelText('NET金額')).not.toBeInTheDocument();

        // 業者選択後に表示される
        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByLabelText('NET金額')).toBeInTheDocument();
        });
      });

      it('案分実行ボタンが業者選択後に表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        // 業者選択前は表示されない
        expect(screen.queryByRole('button', { name: '案分実行' })).not.toBeInTheDocument();

        // 業者選択後に表示される
        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByRole('button', { name: '案分実行' })).toBeInTheDocument();
        });
      });
    });

    describe('REQ-5.1: 業者選択と案分対象行の選択', () => {
      it('業者リストが選択可能である', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.click(vendorSelect);

        // 選択肢が表示される
        expect(screen.getByRole('option', { name: '株式会社A建設' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '株式会社B電設' })).toBeInTheDocument();
      });

      it('業者を選択するとその業者の行が案分対象として表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        // 選択した業者の行が表示される
        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
          expect(screen.getByText('土工事')).toBeInTheDocument();
          expect(screen.getByText('共通仮設費')).toBeInTheDocument();
          expect(screen.getByText('現場管理費')).toBeInTheDocument();
        });

        // 他の業者の行は表示されない
        expect(screen.queryByText('電気工事')).not.toBeInTheDocument();
      });

      it('案分対象行にチェックボックスが表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          const checkboxes = screen.getAllByRole('checkbox');
          // 4行分のチェックボックス
          expect(checkboxes.length).toBe(4);
        });
      });
    });

    describe('REQ-5.2: 諸経費行の除外', () => {
      it('諸経費行として共通仮設費・現場管理費等を指定できる', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('共通仮設費')).toBeInTheDocument();
        });

        // 共通仮設費行のチェックを外す（除外）
        const commonTemporaryRow = screen.getByText('共通仮設費').closest('tr');
        const checkbox = within(commonTemporaryRow!).getByRole('checkbox');
        await userEvent.click(checkbox);

        // チェックが外れる
        expect(checkbox).not.toBeChecked();
      });

      it('除外された行はプレビュー計算に含まれない', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('共通仮設費')).toBeInTheDocument();
        });

        // 共通仮設費と現場管理費を除外
        const commonTemporaryRow = screen.getByText('共通仮設費').closest('tr');
        const siteManagementRow = screen.getByText('現場管理費').closest('tr');
        await userEvent.click(within(commonTemporaryRow!).getByRole('checkbox'));
        await userEvent.click(within(siteManagementRow!).getByRole('checkbox'));

        // NET金額を入力
        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '700000');

        // プレビュー結果を確認（除外行は案分対象外）
        await waitFor(() => {
          // 案分対象合計が800000（500000 + 300000）であることを確認
          expect(screen.getByTestId('allocation-total')).toHaveTextContent('800,000');
        });
      });
    });

    describe('REQ-5.3, REQ-5.4: NET金額入力と案分計算', () => {
      it('NET金額を入力するとプレビュー計算が実行される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        // NET金額を入力
        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '800000');

        // プレビュー結果が表示される
        await waitFor(() => {
          expect(screen.getByTestId('preview-results')).toBeInTheDocument();
        });
      });

      it('案分率が表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        // 全てチェックされた状態で
        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        // 共通仮設費と現場管理費を除外
        const commonTemporaryRow = screen.getByText('共通仮設費').closest('tr');
        const siteManagementRow = screen.getByText('現場管理費').closest('tr');
        await userEvent.click(within(commonTemporaryRow!).getByRole('checkbox'));
        await userEvent.click(within(siteManagementRow!).getByRole('checkbox'));

        // NET金額を入力
        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '800000');

        // 案分率が表示される（500000:300000 = 5:3 = 62.5%:37.5%）
        await waitFor(() => {
          // 直接仮設工事と土工事が案分対象
          // 対象合計: 500000 + 300000 = 800000
          // 直接仮設工事: 500000/800000 = 62.50%
          const ratioLine1 = screen.getByTestId('ratio-vendor-line-1');
          expect(ratioLine1).toHaveTextContent('62.5%');
        });

        // 土工事: 300000/800000 = 37.50%
        const ratioLine2 = screen.getByTestId('ratio-vendor-line-2');
        expect(ratioLine2).toHaveTextContent('37.5%');
      });

      it('案分後金額が表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        // 共通仮設費と現場管理費を除外
        const commonTemporaryRow = screen.getByText('共通仮設費').closest('tr');
        const siteManagementRow = screen.getByText('現場管理費').closest('tr');
        await userEvent.click(within(commonTemporaryRow!).getByRole('checkbox'));
        await userEvent.click(within(siteManagementRow!).getByRole('checkbox'));

        // NET金額を入力
        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '800000');

        // 案分後金額が表示される
        await waitFor(() => {
          // 直接仮設工事: 800000 * 62.50% = 500000
          expect(screen.getByTestId('allocated-amount-vendor-line-1')).toHaveTextContent('500,000');
          // 土工事: 800000 * 37.50% = 300000
          expect(screen.getByTestId('allocated-amount-vendor-line-2')).toHaveTextContent('300,000');
        });
      });
    });

    describe('REQ-5.5: 案分実行とAPI連携', () => {
      it('案分実行ボタンクリックでonCalculationCompleteが呼ばれる', async () => {
        const vendorLines = createMockVendorLinesExtended();
        const onCalculationComplete = vi.fn();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={onCalculationComplete}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        // NET金額を入力
        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '800000');

        // 案分実行ボタンをクリック
        const executeButton = screen.getByRole('button', { name: '案分実行' });
        await userEvent.click(executeButton);

        await waitFor(() => {
          expect(onCalculationComplete).toHaveBeenCalled();
        });
      });

      it('NET金額が未入力の場合、案分実行ボタンが無効になる', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        // NET金額未入力
        const executeButton = screen.getByRole('button', { name: '案分実行' });
        expect(executeButton).toBeDisabled();
      });

      it('業者が未選択の場合、案分実行ボタンが表示されない', () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        // 業者未選択時は案分実行ボタンが表示されない
        expect(screen.queryByRole('button', { name: '案分実行' })).not.toBeInTheDocument();
      });
    });

    describe('REQ-5.6: 業者の識別表示', () => {
      it('選択した業者名が表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        // 選択中の業者が表示される
        await waitFor(() => {
          expect(screen.getByText(/対象: 株式会社A建設/)).toBeInTheDocument();
        });
      });
    });

    describe('REQ-5.7: 計算処理中インジケーター', () => {
      it('計算実行中はローディングインジケーターが表示される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        const onCalculationComplete = vi.fn(
          (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1000))
        );
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={onCalculationComplete}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '800000');

        // 案分実行ボタンをクリック
        const executeButton = screen.getByRole('button', { name: '案分実行' });
        await userEvent.click(executeButton);

        // ローディング状態になる
        expect(screen.getByText('計算中...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '計算中...' })).toBeDisabled();
      });
    });

    describe('バリデーション', () => {
      it('NET金額に数値以外を入力するとエラー表示', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, 'abc');

        await waitFor(() => {
          expect(screen.getByText('数値を入力してください')).toBeInTheDocument();
        });
      });

      it('NET金額に負の値を入力するとエラー表示', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByText('直接仮設工事')).toBeInTheDocument();
        });

        const netAmountInput = screen.getByLabelText('NET金額');
        await userEvent.type(netAmountInput, '-100');

        await waitFor(() => {
          expect(screen.getByText('正の数値を入力してください')).toBeInTheDocument();
        });
      });
    });

    describe('アクセシビリティ', () => {
      it('パネルにaria-labelが設定される', () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        expect(screen.getByRole('region', { name: 'NET金額計算・案分' })).toBeInTheDocument();
      });

      it('フォーム要素に適切なラベルが設定される', async () => {
        const vendorLines = createMockVendorLinesExtended();
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={vendorLines}
            onCalculationComplete={vi.fn()}
          />
        );

        expect(screen.getByLabelText('対象業者')).toBeInTheDocument();

        // 業者選択後にNET金額フィールドが表示される
        const vendorSelect = screen.getByLabelText('対象業者');
        await userEvent.selectOptions(vendorSelect, '株式会社A建設');

        await waitFor(() => {
          expect(screen.getByLabelText('NET金額')).toBeInTheDocument();
        });
      });
    });

    describe('空の状態', () => {
      it('業者金額行がない場合、メッセージが表示される', () => {
        render(
          <NetCalculationPanel
            estimateId="estimate-1"
            vendorLines={[]}
            onCalculationComplete={vi.fn()}
          />
        );

        expect(screen.getByText('業者金額行がありません')).toBeInTheDocument();
      });
    });
  });
});
