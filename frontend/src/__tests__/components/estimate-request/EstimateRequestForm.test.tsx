/**
 * @fileoverview EstimateRequestFormコンポーネントのユニットテスト
 *
 * Task 68.1: EstimateRequestFormの宛先フィールドをTradingPartnerSelectに置換
 *
 * Requirements:
 * - 30.1: 宛先フィールドにTradingPartnerSelectコンポーネントを使用
 * - 30.2: 検索可能なオートコンプリートUIを提供
 * - 30.3: 協力業者のみを候補として表示
 * - 30.4: 宛先フィールドのラベルを「宛先（取引先）」に設定
 * - 30.5: 宛先フィールドを必須フィールドとして設定
 * - 30.6: 「-- 選択なし --」オプションを非表示にする
 * - 30.7: 協力業者が0件の場合のメッセージ表示を維持
 * - 30.8: 既存のバリデーションが正常に動作すること
 * - 30.9: ProjectFormのTradingPartnerSelect使用に影響しないこと（後方互換性）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateRequestForm } from '../../../components/estimate-request/EstimateRequestForm';
import * as tradingPartnersApi from '../../../api/trading-partners';
import * as itemizedStatementsApi from '../../../api/itemized-statements';
import type { TradingPartnerInfo } from '../../../types/trading-partner.types';

// APIモック
vi.mock('../../../api/trading-partners', () => ({
  getTradingPartners: vi.fn(),
}));

vi.mock('../../../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn(),
}));

// scrollIntoViewモック（jsdomでは未実装）
Element.prototype.scrollIntoView = vi.fn();

// テスト用協力業者データ
const mockSubcontractors: TradingPartnerInfo[] = [
  {
    id: 'sub-1',
    name: '田中建設株式会社',
    nameKana: 'タナカケンセツカブシキガイシャ',
    branchName: null,
    branchNameKana: null,
    representativeName: null,
    representativeNameKana: null,
    types: ['SUBCONTRACTOR'],
    address: '東京都新宿区1-1-1',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sub-2',
    name: '高橋工務店',
    nameKana: 'タカハシコウムテン',
    branchName: '大阪支店',
    branchNameKana: 'オオサカシテン',
    representativeName: '高橋次郎',
    representativeNameKana: 'タカハシジロウ',
    types: ['SUBCONTRACTOR'],
    address: '大阪府大阪市3-3-3',
    phoneNumber: null,
    faxNumber: null,
    email: null,
    billingClosingDay: null,
    paymentMonthOffset: null,
    paymentDay: null,
    notes: null,
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
];

// テスト用内訳書データ
const mockItemizedStatements = [
  {
    id: 'is-1',
    name: '内訳書1',
    projectId: 'project-1',
    sourceQuantityTableId: 'qt-1',
    sourceQuantityTableName: '数量表1',
    itemCount: 5,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

/**
 * TradingPartnerSelectのcombobox入力を取得するヘルパー
 * aria-label="宛先（取引先）"で特定する
 */
function getTradingPartnerCombobox(): HTMLElement {
  return screen.getByLabelText('宛先（取引先）');
}

describe('EstimateRequestForm - TradingPartnerSelect統合', () => {
  const defaultProps = {
    projectId: 'project-1',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトのAPIモック設定
    vi.mocked(tradingPartnersApi.getTradingPartners).mockResolvedValue({
      data: mockSubcontractors,
      pagination: { page: 1, limit: 100, total: mockSubcontractors.length, totalPages: 1 },
    });

    vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue({
      data: mockItemizedStatements,
      pagination: { page: 1, limit: 100, total: mockItemizedStatements.length, totalPages: 1 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TradingPartnerSelectの表示 (30.1, 30.4)', () => {
    it('宛先フィールドにTradingPartnerSelectコンポーネントが表示される', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      // TradingPartnerSelectのcomboboxがaria-label="宛先（取引先）"で表示される
      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toBeInTheDocument();
      });

      // comboboxロールを持つことを確認
      expect(getTradingPartnerCombobox()).toHaveAttribute('role', 'combobox');
    });

    it('宛先フィールドのラベルが「宛先（取引先）」に設定される', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('宛先（取引先）')).toBeInTheDocument();
      });
    });
  });

  describe('協力業者フィルタリング (30.3)', () => {
    it('TradingPartnerSelectがSUBCONTRACTORフィルタで取引先APIを呼び出す', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toBeInTheDocument();
      });

      // TradingPartnerSelect内部でgetTradingPartnersがSUBCONTRACTORフィルタで呼ばれる
      await waitFor(() => {
        expect(tradingPartnersApi.getTradingPartners).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: { type: ['SUBCONTRACTOR'] },
          })
        );
      });
    });
  });

  describe('必須フィールド設定 (30.5)', () => {
    it('宛先フィールドのaria-requiredがtrueに設定される', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toHaveAttribute('aria-required', 'true');
      });
    });
  });

  describe('選択なしオプション (30.6)', () => {
    it('ドロップダウンを開いても「-- 選択なし --」オプションが表示されない', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toBeInTheDocument();
      });

      // ドロップダウンを開く
      fireEvent.focus(getTradingPartnerCombobox());

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      expect(screen.queryByText('-- 選択なし --')).not.toBeInTheDocument();
    });
  });

  describe('協力業者が0件の場合 (30.7)', () => {
    it('協力業者がない場合に「協力業者が登録されていません」メッセージが表示される', async () => {
      vi.mocked(tradingPartnersApi.getTradingPartners).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/協力業者が登録されていません/)).toBeInTheDocument();
      });
    });

    it('協力業者がない場合に送信ボタンが無効化される', async () => {
      vi.mocked(tradingPartnersApi.getTradingPartners).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: '作成' });
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('バリデーション (30.8)', () => {
    it('宛先が未選択で送信すると「宛先を選択してください」エラーが表示される', async () => {
      const user = userEvent.setup();
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toBeInTheDocument();
      });

      // 内訳書を選択
      const statementSelect = screen.getByLabelText('内訳書');
      await user.selectOptions(statementSelect, 'is-1');

      // 送信ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('宛先を選択してください')).toBeInTheDocument();
      });
    });
  });

  describe('取引先選択とフォーム送信', () => {
    it('TradingPartnerSelectで取引先を選択してフォームを送信できる', async () => {
      const user = userEvent.setup();
      const mockOnSubmit = vi.fn().mockResolvedValue({
        id: 'er-1',
        name: '見積依頼',
        projectId: 'project-1',
        tradingPartnerId: 'sub-1',
        tradingPartnerName: '田中建設株式会社',
        itemizedStatementId: 'is-1',
        itemizedStatementName: '内訳書1',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<EstimateRequestForm {...defaultProps} onSubmit={mockOnSubmit} />);

      await waitFor(() => {
        expect(getTradingPartnerCombobox()).toBeInTheDocument();
      });

      // TradingPartnerSelectで取引先を選択
      fireEvent.focus(getTradingPartnerCombobox());

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // 田中建設株式会社を選択
      const listbox = screen.getByRole('listbox');
      await user.click(within(listbox).getByText('田中建設株式会社'));

      // 内訳書を選択
      const statementSelect = screen.getByLabelText('内訳書');
      await user.selectOptions(statementSelect, 'is-1');

      // 送信ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            tradingPartnerId: 'sub-1',
          })
        );
      });
    });
  });
});
