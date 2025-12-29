/**
 * @fileoverview TradingPartnerFormコンポーネントのユニットテスト
 *
 * Task 8.1: 取引先作成・編集フォームの実装
 *
 * テスト対象:
 * - 必須項目（名前、フリガナ、種別、住所）の入力欄
 * - 任意項目（部課/支店/支社名、代表者名等）の入力欄
 * - フリガナ入力時のカタカナ以外警告表示
 * - クライアントサイドバリデーションとエラー表示
 * - 編集時の既存データプリセット
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンクリックで取引先作成フォームを表示
 * - 2.2: 必須入力欄（名前、フリガナ、種別、住所）を提供
 * - 2.3: 任意入力欄（部課/支店/支社名等）を提供
 * - 2.9: 必須項目未入力時のバリデーションエラー表示
 * - 2.10: メールアドレス形式不正時のエラー表示
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.2: 編集時も同じ必須・任意項目の編集を可能とする
 * - 4.7: 必須項目未入力時のバリデーションエラー表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerForm, {
  TradingPartnerFormData,
} from '../../../components/trading-partners/TradingPartnerForm';

// モック設定
vi.mock('../../../components/trading-partners/TradingPartnerTypeSelect', () => ({
  default: ({
    value,
    onChange,
    error,
    label,
    required,
    disabled,
  }: {
    value: string[];
    onChange: (types: string[]) => void;
    error?: string;
    label: string;
    required?: boolean;
    disabled?: boolean;
  }) => (
    <div data-testid="trading-partner-type-select">
      <label>
        {label}
        {required && <span>*</span>}
      </label>
      <div role="group">
        <label>
          <input
            type="checkbox"
            checked={value.includes('CUSTOMER')}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...value, 'CUSTOMER']);
              } else {
                onChange(value.filter((t) => t !== 'CUSTOMER'));
              }
            }}
            disabled={disabled}
          />
          顧客
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.includes('SUBCONTRACTOR')}
            onChange={(e) => {
              if (e.target.checked) {
                onChange([...value, 'SUBCONTRACTOR']);
              } else {
                onChange(value.filter((t) => t !== 'SUBCONTRACTOR'));
              }
            }}
            disabled={disabled}
          />
          協力業者
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

vi.mock('../../../components/trading-partners/BillingClosingDaySelect', () => ({
  default: ({
    value,
    onChange,
    label,
    disabled,
  }: {
    value: number | null;
    onChange: (value: number | null) => void;
    label: string;
    disabled?: boolean;
  }) => (
    <div data-testid="billing-closing-day-select">
      <label htmlFor="billing-closing-day">{label}</label>
      <select
        id="billing-closing-day"
        value={value === null ? '' : value}
        onChange={(e) => {
          onChange(e.target.value === '' ? null : parseInt(e.target.value, 10));
        }}
        disabled={disabled}
        aria-label={label}
      >
        <option value="">選択してください</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}日
          </option>
        ))}
        <option value="99">末日</option>
      </select>
    </div>
  ),
  LAST_DAY_VALUE: 99,
}));

vi.mock('../../../components/trading-partners/PaymentDateSelect', () => ({
  default: ({
    monthOffset,
    day,
    onChange,
    label,
    disabled,
  }: {
    monthOffset: number | null;
    day: number | null;
    onChange: (value: { monthOffset: number | null; day: number | null }) => void;
    label: string;
    disabled?: boolean;
  }) => (
    <div data-testid="payment-date-select">
      <label>{label}</label>
      <select
        value={monthOffset === null ? '' : monthOffset}
        onChange={(e) => {
          onChange({
            monthOffset: e.target.value === '' ? null : parseInt(e.target.value, 10),
            day,
          });
        }}
        disabled={disabled}
        aria-label={`${label} - 月`}
      >
        <option value="">選択してください</option>
        <option value="1">翌月</option>
        <option value="2">翌々月</option>
        <option value="3">3ヶ月後</option>
      </select>
      <select
        value={day === null ? '' : day}
        onChange={(e) => {
          onChange({
            monthOffset,
            day: e.target.value === '' ? null : parseInt(e.target.value, 10),
          });
        }}
        disabled={disabled}
        aria-label={`${label} - 日`}
      >
        <option value="">選択してください</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}日
          </option>
        ))}
        <option value="99">末日</option>
      </select>
    </div>
  ),
}));

describe('TradingPartnerForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================
  describe('レンダリング', () => {
    it('作成モードで必須フィールドが表示される', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須項目の確認 (Requirement 2.2)
      expect(screen.getByLabelText(/取引先名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^フリガナ$/)).toBeInTheDocument();
      expect(screen.getByTestId('trading-partner-type-select')).toBeInTheDocument();
      expect(screen.getByLabelText(/^住所$/)).toBeInTheDocument();
    });

    it('作成モードで任意フィールドが表示される', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 任意項目の確認 (Requirement 2.3)
      // Note: branchNameKana / representativeNameKana はTask 19.2で削除
      expect(screen.getByLabelText(/部課\/支店\/支社名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/代表者名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/電話番号/)).toBeInTheDocument();
      expect(screen.getByLabelText(/FAX番号/)).toBeInTheDocument();
      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
      expect(screen.getByTestId('billing-closing-day-select')).toBeInTheDocument();
      expect(screen.getByTestId('payment-date-select')).toBeInTheDocument();
      expect(screen.getByLabelText(/備考/)).toBeInTheDocument();
    });

    it('作成モードでボタンが正しく表示される', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('button', { name: /作成/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });

    it('編集モードでボタンが正しく表示される', () => {
      render(
        <TradingPartnerForm
          mode="edit"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });

    it('編集モードで初期データがプリセットされる', () => {
      // Note: branchNameKana / representativeNameKana はTask 19.2で削除
      const initialData: TradingPartnerFormData = {
        name: '株式会社テスト',
        nameKana: 'カブシキガイシャテスト',
        types: ['CUSTOMER'],
        address: '東京都渋谷区1-1-1',
        branchName: '本社',
        representativeName: '山田太郎',
        phoneNumber: '03-1234-5678',
        faxNumber: '03-1234-5679',
        email: 'test@example.com',
        billingClosingDay: 15,
        paymentMonthOffset: 1,
        paymentDay: 25,
        notes: '重要な取引先です',
      };

      render(
        <TradingPartnerForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須項目のプリセット確認 (Requirement 4.1)
      expect(screen.getByLabelText(/取引先名/)).toHaveValue('株式会社テスト');
      expect(screen.getByLabelText(/^フリガナ$/)).toHaveValue('カブシキガイシャテスト');
      expect(screen.getByLabelText(/^住所$/)).toHaveValue('東京都渋谷区1-1-1');

      // 任意項目のプリセット確認 (branchNameKana / representativeNameKana は削除済み)
      expect(screen.getByLabelText(/部課\/支店\/支社名/)).toHaveValue('本社');
      expect(screen.getByLabelText(/代表者名/)).toHaveValue('山田太郎');
      expect(screen.getByLabelText(/電話番号/)).toHaveValue('03-1234-5678');
      expect(screen.getByLabelText(/FAX番号/)).toHaveValue('03-1234-5679');
      expect(screen.getByLabelText(/メールアドレス/)).toHaveValue('test@example.com');
      expect(screen.getByLabelText(/備考/)).toHaveValue('重要な取引先です');
    });

    it('送信中は入力フィールドが無効化される', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      expect(screen.getByLabelText(/取引先名/)).toBeDisabled();
      expect(screen.getByLabelText(/^フリガナ$/)).toBeDisabled();
      expect(screen.getByLabelText(/^住所$/)).toBeDisabled();
    });

    it('送信中は適切なボタンテキストが表示される', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('button', { name: /作成中/ })).toBeInTheDocument();
    });
  });

  // ============================================================================
  // バリデーションテスト
  // ============================================================================
  describe('バリデーション', () => {
    it('必須項目が未入力の場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリック
      await user.click(screen.getByRole('button', { name: /作成/ }));

      // エラーメッセージの確認 (Requirement 2.9)
      await waitFor(() => {
        expect(screen.getByText('取引先名は必須です')).toBeInTheDocument();
        expect(screen.getByText('フリガナは必須です')).toBeInTheDocument();
        expect(screen.getByText('種別を1つ以上選択してください')).toBeInTheDocument();
        expect(screen.getByText('住所は必須です')).toBeInTheDocument();
      });

      // 送信されないことを確認
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('取引先名が200文字を超える場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const nameInput = screen.getByLabelText(/取引先名/);
      await user.type(nameInput, 'あ'.repeat(201));

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(screen.getByText('取引先名は200文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('フリガナがカタカナ以外を含む場合、警告が表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const kanaInput = screen.getByLabelText(/^フリガナ$/);
      await user.type(kanaInput, 'テストtest');

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(kanaInput);

      await waitFor(() => {
        expect(screen.getByText('フリガナはカタカナのみで入力してください')).toBeInTheDocument();
      });
    });

    it('メールアドレスの形式が不正な場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const emailInput = screen.getByLabelText(/メールアドレス/);
      await user.type(emailInput, 'invalid-email');

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
      });
    });

    it('電話番号の形式が不正な場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const phoneInput = screen.getByLabelText(/電話番号/);
      await user.type(phoneInput, 'abcd-efgh');

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(
          screen.getByText('電話番号は数字、ハイフン、括弧のみ使用できます')
        ).toBeInTheDocument();
      });
    });

    it('FAX番号の形式が不正な場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const faxInput = screen.getByLabelText(/FAX番号/);
      await user.type(faxInput, 'abcd-efgh');

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(faxInput);

      await waitFor(() => {
        expect(
          screen.getByText('FAX番号は数字、ハイフン、括弧のみ使用できます')
        ).toBeInTheDocument();
      });
    });

    it('部課/支店/支社名が100文字を超える場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const branchNameInput = screen.getByLabelText(/部課\/支店\/支社名/);
      await user.type(branchNameInput, 'あ'.repeat(101));

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(branchNameInput);

      await waitFor(() => {
        expect(
          screen.getByText('部課/支店/支社名は100文字以内で入力してください')
        ).toBeInTheDocument();
      });
    });

    it('代表者名が100文字を超える場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const representativeNameInput = screen.getByLabelText(/代表者名/);
      await user.type(representativeNameInput, 'あ'.repeat(101));

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(representativeNameInput);

      await waitFor(() => {
        expect(screen.getByText('代表者名は100文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('備考が2000文字を超える場合、エラーが表示される', async () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const notesInput = screen.getByLabelText(/備考/);
      // 2001文字を直接設定（userEvent.typeは大量の文字入力に時間がかかるため）
      fireEvent.change(notesInput, { target: { value: 'あ'.repeat(2001) } });

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(notesInput);

      await waitFor(() => {
        expect(screen.getByText('備考は2000文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('フリガナが200文字を超える場合、エラーが表示される', async () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const nameKanaInput = screen.getByLabelText(/^フリガナ$/);
      // 201文字を直接設定（userEvent.typeは大量の文字入力に時間がかかるため）
      fireEvent.change(nameKanaInput, { target: { value: 'ア'.repeat(201) } });

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(nameKanaInput);

      await waitFor(() => {
        expect(screen.getByText('フリガナは200文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('住所が500文字を超える場合、エラーが表示される', async () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const addressInput = screen.getByLabelText(/^住所$/);
      // 501文字を直接設定（userEvent.typeは大量の文字入力に時間がかかるため）
      fireEvent.change(addressInput, { target: { value: 'あ'.repeat(501) } });

      // フォーカスを外してバリデーションを発火
      fireEvent.blur(addressInput);

      await waitFor(() => {
        expect(screen.getByText('住所は500文字以内で入力してください')).toBeInTheDocument();
      });
    });

    // Note: Task 19.2で branchNameKana / representativeNameKana 入力欄を削除したため、
    // 以下のバリデーションテストは削除:
    // - 部課/支店/支社フリガナがカタカナ以外を含む場合のエラー表示
    // - 代表者フリガナがカタカナ以外を含む場合のエラー表示

    it('branchNameKana入力欄が存在しない', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // branchNameKana入力欄がフォームから削除されていることを確認
      expect(screen.queryByLabelText(/部課\/支店\/支社フリガナ/)).not.toBeInTheDocument();
    });

    it('representativeNameKana入力欄が存在しない', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // representativeNameKana入力欄がフォームから削除されていることを確認
      expect(screen.queryByLabelText(/代表者フリガナ/)).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // フォーム送信テスト
  // ============================================================================
  describe('フォーム送信', () => {
    it('有効なデータで送信が成功する', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須フィールドを入力
      await user.type(screen.getByLabelText(/取引先名/), '株式会社テスト');
      await user.type(screen.getByLabelText(/^フリガナ$/), 'カブシキガイシャテスト');
      await user.type(screen.getByLabelText(/^住所$/), '東京都渋谷区1-1-1');

      // 種別を選択
      await user.click(screen.getByRole('checkbox', { name: /顧客/ }));

      // 送信
      await user.click(screen.getByRole('button', { name: /作成/ }));

      // Note: Task 19.2で branchNameKana / representativeNameKana を削除
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
          types: ['CUSTOMER'],
          address: '東京都渋谷区1-1-1',
          branchName: null,
          representativeName: null,
          phoneNumber: null,
          faxNumber: null,
          email: null,
          billingClosingDay: null,
          paymentMonthOffset: null,
          paymentDay: null,
          notes: null,
        });
      });
    });

    it('任意フィールドも含めた送信が成功する', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須フィールドを入力
      await user.type(screen.getByLabelText(/取引先名/), '株式会社テスト');
      await user.type(screen.getByLabelText(/^フリガナ$/), 'カブシキガイシャテスト');
      await user.type(screen.getByLabelText(/^住所$/), '東京都渋谷区1-1-1');
      await user.click(screen.getByRole('checkbox', { name: /顧客/ }));

      // 任意フィールドを入力 (branchNameKana / representativeNameKana は削除済み)
      await user.type(screen.getByLabelText(/部課\/支店\/支社名/), '本社');
      await user.type(screen.getByLabelText(/代表者名/), '山田太郎');
      await user.type(screen.getByLabelText(/電話番号/), '03-1234-5678');
      await user.type(screen.getByLabelText(/FAX番号/), '03-1234-5679');
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/備考/), 'テスト備考');

      // 送信
      await user.click(screen.getByRole('button', { name: /作成/ }));

      // Note: Task 19.2で branchNameKana / representativeNameKana を削除
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '株式会社テスト',
          nameKana: 'カブシキガイシャテスト',
          types: ['CUSTOMER'],
          address: '東京都渋谷区1-1-1',
          branchName: '本社',
          representativeName: '山田太郎',
          phoneNumber: '03-1234-5678',
          faxNumber: '03-1234-5679',
          email: 'test@example.com',
          billingClosingDay: null,
          paymentMonthOffset: null,
          paymentDay: null,
          notes: 'テスト備考',
        });
      });
    });
  });

  // ============================================================================
  // キャンセルテスト
  // ============================================================================
  describe('キャンセル', () => {
    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      await user.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================
  describe('アクセシビリティ', () => {
    it('フォームにrole="form"が設定されている', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('必須フィールドにaria-required属性が設定されている', () => {
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText(/取引先名/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^フリガナ$/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^住所$/)).toHaveAttribute('aria-required', 'true');
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリックしてバリデーションエラーを発生させる
      await user.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        expect(screen.getByLabelText(/取引先名/)).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージにrole="alert"が設定されている', async () => {
      const user = userEvent.setup();
      render(
        <TradingPartnerForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリックしてバリデーションエラーを発生させる
      await user.click(screen.getByRole('button', { name: /作成/ }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });
    });
  });
});
