/**
 * @fileoverview EstimateRequestFormコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.3: EstimateRequestFormコンポーネントを実装する
 *
 * Requirements:
 * - 3.1: 新規作成時に見積依頼の名前入力フィールドを表示する
 * - 3.2: 新規作成時に宛先（取引先）選択フィールドを表示する
 * - 3.3: 新規作成時に参照する内訳書の選択フィールドを表示する
 * - 3.4: 宛先の候補として協力業者である取引先のみを表示する
 * - 3.5: 取引先の検索機能を提供する
 * - 3.6: ユーザーが必須項目を入力して保存したとき、見積依頼を作成
 * - 3.7: 必須項目が未入力の場合、バリデーションエラーを表示
 * - 3.8: 協力業者の取引先が存在しない場合、メッセージを表示
 * - 3.9: プロジェクトに内訳書が存在しない場合、メッセージを表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EstimateRequestForm } from './EstimateRequestForm';
import type { TradingPartnerInfo } from '../../types/trading-partner.types';
import type { ItemizedStatementInfo } from '../../types/itemized-statement.types';

// APIモック
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn(),
}));

vi.mock('../../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn(),
}));

import { getTradingPartners } from '../../api/trading-partners';
import { getItemizedStatements } from '../../api/itemized-statements';

const mockedGetTradingPartners = vi.mocked(getTradingPartners);
const mockedGetItemizedStatements = vi.mocked(getItemizedStatements);

describe('EstimateRequestForm', () => {
  const mockTradingPartners: TradingPartnerInfo[] = [
    {
      id: 'tp-1',
      name: '協力業者A',
      nameKana: 'キョウリョクギョウシャA',
      branchName: null,
      branchNameKana: null,
      representativeName: null,
      representativeNameKana: null,
      types: ['SUBCONTRACTOR'],
      address: '東京都千代田区',
      phoneNumber: '03-1234-5678',
      faxNumber: null,
      email: 'a@example.com',
      billingClosingDay: null,
      paymentMonthOffset: null,
      paymentDay: null,
      notes: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'tp-2',
      name: '協力業者B',
      nameKana: 'キョウリョクギョウシャB',
      branchName: null,
      branchNameKana: null,
      representativeName: null,
      representativeNameKana: null,
      types: ['SUBCONTRACTOR'],
      address: '大阪府大阪市',
      phoneNumber: '06-1234-5678',
      faxNumber: '06-1234-5679',
      email: null,
      billingClosingDay: null,
      paymentMonthOffset: null,
      paymentDay: null,
      notes: null,
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    },
  ];

  const mockItemizedStatements: ItemizedStatementInfo[] = [
    {
      id: 'is-1',
      projectId: 'project-1',
      name: '内訳書#1',
      sourceQuantityTableId: 'qt-1',
      sourceQuantityTableName: '数量表#1',
      itemCount: 10,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'is-2',
      projectId: 'project-1',
      name: '内訳書#2',
      sourceQuantityTableId: 'qt-2',
      sourceQuantityTableName: '数量表#2',
      itemCount: 5,
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
    },
    {
      id: 'is-3',
      projectId: 'project-1',
      name: '空の内訳書',
      sourceQuantityTableId: 'qt-3',
      sourceQuantityTableName: '数量表#3',
      itemCount: 0,
      createdAt: '2025-01-03T00:00:00Z',
      updatedAt: '2025-01-03T00:00:00Z',
    },
  ];

  const defaultProps = {
    projectId: 'project-1',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトのモック設定
    mockedGetTradingPartners.mockResolvedValue({
      data: mockTradingPartners,
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });

    mockedGetItemizedStatements.mockResolvedValue({
      data: mockItemizedStatements,
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
    });
  });

  describe('基本レンダリング', () => {
    it('名前入力フィールドを表示する（Requirements: 3.1）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });
    });

    it('宛先選択フィールドを表示する（Requirements: 3.2）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/宛先/)).toBeInTheDocument();
      });
    });

    it('内訳書選択フィールドを表示する（Requirements: 3.3）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/内訳書/)).toBeInTheDocument();
      });
    });

    it('作成ボタンを表示する', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /作成/ })).toBeInTheDocument();
      });
    });

    it('キャンセルボタンを表示する', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
      });
    });
  });

  describe('取引先選択', () => {
    it('協力業者のみを候補として表示する（Requirements: 3.4）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(mockedGetTradingPartners).toHaveBeenCalledWith(
          expect.objectContaining({
            filter: { type: ['SUBCONTRACTOR'] },
          })
        );
      });
    });
  });

  describe('内訳書選択', () => {
    it('内訳書の項目数を表示する', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/10項目/)).toBeInTheDocument();
      });
    });

    it('項目0件の内訳書は選択不可として表示する', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        const emptyOption = screen.getByText(/空の内訳書/);
        expect(emptyOption.closest('option')).toBeDisabled();
      });
    });
  });

  describe('バリデーション', () => {
    it('名前が未入力の場合エラーを表示する（Requirements: 3.7）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/名前を入力してください/)).toBeInTheDocument();
      });
    });

    it('宛先が未選択の場合エラーを表示する（Requirements: 3.7）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // 名前を入力
      const nameInput = screen.getByLabelText(/名前/);
      fireEvent.change(nameInput, { target: { value: '見積依頼#1' } });

      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        // 複数のalertが出る可能性があるので、特定のテキストを含むものを確認
        const alerts = screen.getAllByRole('alert');
        const tradingPartnerError = alerts.find((el) =>
          el.textContent?.includes('宛先を選択してください')
        );
        expect(tradingPartnerError).toBeInTheDocument();
      });
    });

    it('内訳書が未選択の場合エラーを表示する（Requirements: 3.7）', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // 名前を入力
      const nameInput = screen.getByLabelText(/名前/);
      fireEvent.change(nameInput, { target: { value: '見積依頼#1' } });

      // 宛先を選択（モック）
      const selectTradingPartner = screen.getByLabelText(/宛先/);
      fireEvent.change(selectTradingPartner, { target: { value: 'tp-1' } });

      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/内訳書を選択してください/);
      });
    });
  });

  describe('エラー状態表示', () => {
    /**
     * @requirement estimate-request/REQ-3.8
     * 協力業者の取引先が存在しない場合、「協力業者が登録されていません」というメッセージを表示する
     */
    it('協力業者が存在しない場合メッセージを表示する（Requirements: 3.8）', async () => {
      mockedGetTradingPartners.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/協力業者が登録されていません/)).toBeInTheDocument();
      });
    });

    it('内訳書が存在しない場合メッセージを表示する（Requirements: 3.9）', async () => {
      mockedGetItemizedStatements.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });

      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/内訳書が登録されていません/)).toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('必須項目を入力して保存時にonSubmitが呼ばれる（Requirements: 3.6）', async () => {
      const mockOnSubmit = vi.fn().mockResolvedValue({
        id: 'er-1',
        projectId: 'project-1',
        tradingPartnerId: 'tp-1',
        tradingPartnerName: '協力業者A',
        itemizedStatementId: 'is-1',
        itemizedStatementName: '内訳書#1',
        name: '見積依頼#1',
        method: 'EMAIL',
        includeBreakdownInBody: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<EstimateRequestForm {...defaultProps} onSubmit={mockOnSubmit} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // 名前を入力
      const nameInput = screen.getByLabelText(/名前/);
      fireEvent.change(nameInput, { target: { value: '見積依頼#1' } });

      // 宛先を選択
      const selectTradingPartner = screen.getByLabelText(/宛先/);
      fireEvent.change(selectTradingPartner, { target: { value: 'tp-1' } });

      // 内訳書を選択
      const selectItemizedStatement = screen.getByLabelText(/内訳書/);
      fireEvent.change(selectItemizedStatement, { target: { value: 'is-1' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: /作成/ });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '見積依頼#1',
          tradingPartnerId: 'tp-1',
          itemizedStatementId: 'is-1',
        });
      });
    });

    it('作成成功時にonSuccessが呼ばれる', async () => {
      const createdRequest = {
        id: 'er-1',
        projectId: 'project-1',
        tradingPartnerId: 'tp-1',
        tradingPartnerName: '協力業者A',
        itemizedStatementId: 'is-1',
        itemizedStatementName: '内訳書#1',
        name: '見積依頼#1',
        method: 'EMAIL' as const,
        includeBreakdownInBody: false,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      const mockOnSubmit = vi.fn().mockResolvedValue(createdRequest);
      const mockOnSuccess = vi.fn();

      render(
        <EstimateRequestForm {...defaultProps} onSubmit={mockOnSubmit} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // フォーム入力
      fireEvent.change(screen.getByLabelText(/名前/), { target: { value: '見積依頼#1' } });
      fireEvent.change(screen.getByLabelText(/宛先/), { target: { value: 'tp-1' } });
      fireEvent.change(screen.getByLabelText(/内訳書/), { target: { value: 'is-1' } });

      // 送信
      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(createdRequest);
      });
    });
  });

  describe('キャンセル処理', () => {
    it('キャンセルボタンクリック時にonCancelが呼ばれる', async () => {
      const mockOnCancel = vi.fn();

      render(<EstimateRequestForm {...defaultProps} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中はローディング表示する', async () => {
      // 遅延するPromiseを設定
      mockedGetTradingPartners.mockReturnValue(new Promise(() => {}));
      mockedGetItemizedStatements.mockReturnValue(new Promise(() => {}));

      render(<EstimateRequestForm {...defaultProps} />);

      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });

    it('送信中はボタンを無効化する', async () => {
      const mockOnSubmit = vi.fn().mockReturnValue(new Promise(() => {}));

      render(<EstimateRequestForm {...defaultProps} onSubmit={mockOnSubmit} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // フォーム入力
      fireEvent.change(screen.getByLabelText(/名前/), { target: { value: '見積依頼#1' } });
      fireEvent.change(screen.getByLabelText(/宛先/), { target: { value: 'tp-1' } });
      fireEvent.change(screen.getByLabelText(/内訳書/), { target: { value: 'is-1' } });

      // 送信
      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /作成中/ })).toBeDisabled();
      });
    });
  });

  describe('編集モード', () => {
    it('初期値が設定されている場合、フォームにプリセットされる', async () => {
      const initialData = {
        name: '編集する見積依頼',
        tradingPartnerId: 'tp-1',
        itemizedStatementId: 'is-1',
      };

      render(<EstimateRequestForm {...defaultProps} initialData={initialData} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toHaveValue('編集する見積依頼');
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('必須項目に適切なaria属性が設定されている', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/名前/);
        expect(nameInput).toHaveAttribute('aria-required', 'true');
      });
    });

    it('エラー時にaria-invalidが設定される', async () => {
      render(<EstimateRequestForm {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toBeInTheDocument();
      });

      // 空の状態で送信
      fireEvent.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(screen.getByLabelText(/名前/)).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });
});
