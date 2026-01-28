/**
 * @fileoverview CompanyInfoFormコンポーネントのユニットテスト
 *
 * Task 6.1: CompanyInfoFormコンポーネントのテスト作成
 *
 * テスト対象:
 * - 空のフォーム表示
 * - プリセットデータ表示
 * - 必須フィールドのバリデーションエラー表示
 * - 形式バリデーションエラー表示
 * - 保存ボタンクリック時の保存処理
 * - リセットボタンクリック時のリセット処理
 * - ローディング状態でのボタン無効化
 * - isDirty状態管理
 *
 * Requirements:
 * - 1.2: 入力欄（会社名、住所、代表者、電話番号、FAX番号、メールアドレス、適格請求書発行事業者登録番号）
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.4: 保存成功時のToast表示（親コンポーネントで処理）
 * - 2.5: バリデーションエラー表示
 * - 2.6: ローディング表示とボタン無効化
 * - 3.1: リセットボタン表示
 * - 3.2: リセット時の復元
 * - 3.3: 未登録時のリセット
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompanyInfoForm from '../../../components/company-info/CompanyInfoForm';
import type { CompanyInfoFormData } from '../../../types/company-info.types';

describe('CompanyInfoForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnReset = vi.fn();
  const mockOnDirtyChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示テスト
  // ============================================================================
  describe('レンダリング', () => {
    it('空のフォームが表示される（Requirement 1.4）', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 必須項目の確認 (Requirement 1.2)
      expect(screen.getByLabelText(/会社名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^住所$/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^代表者$/)).toBeInTheDocument();

      // 任意項目の確認 (Requirement 1.2)
      expect(screen.getByLabelText(/電話番号/)).toBeInTheDocument();
      expect(screen.getByLabelText(/FAX番号/)).toBeInTheDocument();
      expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
      expect(screen.getByLabelText(/適格請求書発行事業者登録番号/)).toBeInTheDocument();
    });

    it('プリセットデータが表示される（Requirement 1.3）', () => {
      const initialData: CompanyInfoFormData = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '代表 太郎',
        phone: '03-1234-5678',
        fax: '03-1234-5679',
        email: 'test@example.com',
        invoiceRegistrationNumber: 'T1234567890123',
        version: 1,
      };

      render(
        <CompanyInfoForm
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText(/会社名/)).toHaveValue('株式会社テスト');
      expect(screen.getByLabelText(/^住所$/)).toHaveValue('東京都渋谷区1-1-1');
      expect(screen.getByLabelText(/^代表者$/)).toHaveValue('代表 太郎');
      expect(screen.getByLabelText(/電話番号/)).toHaveValue('03-1234-5678');
      expect(screen.getByLabelText(/FAX番号/)).toHaveValue('03-1234-5679');
      expect(screen.getByLabelText(/メールアドレス/)).toHaveValue('test@example.com');
      expect(screen.getByLabelText(/適格請求書発行事業者登録番号/)).toHaveValue('T1234567890123');
    });

    it('保存ボタンとリセットボタンが表示される（Requirement 3.1）', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('button', { name: /保存/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /リセット/ })).toBeInTheDocument();
    });

    it('送信中は入力フィールドが無効化される（Requirement 2.6）', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={true}
        />
      );

      expect(screen.getByLabelText(/会社名/)).toBeDisabled();
      expect(screen.getByLabelText(/^住所$/)).toBeDisabled();
      expect(screen.getByLabelText(/^代表者$/)).toBeDisabled();
      expect(screen.getByLabelText(/電話番号/)).toBeDisabled();
      expect(screen.getByLabelText(/FAX番号/)).toBeDisabled();
      expect(screen.getByLabelText(/メールアドレス/)).toBeDisabled();
      expect(screen.getByLabelText(/適格請求書発行事業者登録番号/)).toBeDisabled();
    });

    it('送信中はローディングインジケーターが表示される（Requirement 2.6）', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('button', { name: /保存中/ })).toBeInTheDocument();
    });

    it('送信中はボタンが無効化される（Requirement 2.6）', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('button', { name: /保存中/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /リセット/ })).toBeDisabled();
    });
  });

  // ============================================================================
  // バリデーションテスト
  // ============================================================================
  describe('バリデーション', () => {
    it('必須項目が未入力の場合、エラーが表示される（Requirement 2.5）', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリック
      await user.click(screen.getByRole('button', { name: /保存/ }));

      // エラーメッセージの確認
      await waitFor(() => {
        expect(screen.getByText('会社名は必須です')).toBeInTheDocument();
        expect(screen.getByText('住所は必須です')).toBeInTheDocument();
        expect(screen.getByText('代表者は必須です')).toBeInTheDocument();
      });

      // 送信されないことを確認
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('会社名が200文字を超える場合、エラーが表示される', async () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const companyNameInput = screen.getByLabelText(/会社名/);
      fireEvent.change(companyNameInput, { target: { value: 'あ'.repeat(201) } });
      fireEvent.blur(companyNameInput);

      await waitFor(() => {
        expect(screen.getByText('会社名は200文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('住所が500文字を超える場合、エラーが表示される', async () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const addressInput = screen.getByLabelText(/^住所$/);
      fireEvent.change(addressInput, { target: { value: 'あ'.repeat(501) } });
      fireEvent.blur(addressInput);

      await waitFor(() => {
        expect(screen.getByText('住所は500文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('代表者名が100文字を超える場合、エラーが表示される', async () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const representativeInput = screen.getByLabelText(/^代表者$/);
      fireEvent.change(representativeInput, { target: { value: 'あ'.repeat(101) } });
      fireEvent.blur(representativeInput);

      await waitFor(() => {
        expect(screen.getByText('代表者名は100文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('電話番号の形式が不正な場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const phoneInput = screen.getByLabelText(/電話番号/);
      await user.type(phoneInput, 'invalid-phone');
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(
          screen.getByText('電話番号の形式が不正です（数字、ハイフン、括弧のみ使用可）')
        ).toBeInTheDocument();
      });
    });

    it('FAX番号の形式が不正な場合、エラーが表示される', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const faxInput = screen.getByLabelText(/FAX番号/);
      await user.type(faxInput, 'invalid-fax');
      fireEvent.blur(faxInput);

      await waitFor(() => {
        expect(
          screen.getByText('FAX番号の形式が不正です（数字、ハイフン、括弧のみ使用可）')
        ).toBeInTheDocument();
      });
    });

    it('メールアドレスの形式が不正な場合、エラーが表示される（Requirement 4.7）', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const emailInput = screen.getByLabelText(/メールアドレス/);
      await user.type(emailInput, 'invalid-email');
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(screen.getByText('有効なメールアドレスを入力してください')).toBeInTheDocument();
      });
    });

    it('適格請求書発行事業者登録番号の形式が不正な場合、エラーが表示される（Requirement 4.10）', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const invoiceInput = screen.getByLabelText(/適格請求書発行事業者登録番号/);
      await user.type(invoiceInput, 'invalid');
      fireEvent.blur(invoiceInput);

      await waitFor(() => {
        expect(
          screen.getByText('適格請求書発行事業者登録番号は「T」+ 13桁の数字で入力してください')
        ).toBeInTheDocument();
      });
    });

    it('電話番号が20文字を超える場合、エラーが表示される', async () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const phoneInput = screen.getByLabelText(/電話番号/);
      fireEvent.change(phoneInput, { target: { value: '0'.repeat(21) } });
      fireEvent.blur(phoneInput);

      await waitFor(() => {
        expect(screen.getByText('電話番号は20文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('メールアドレスが254文字を超える場合、エラーが表示される', async () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      const emailInput = screen.getByLabelText(/メールアドレス/);
      fireEvent.change(emailInput, { target: { value: 'a'.repeat(255) + '@example.com' } });
      fireEvent.blur(emailInput);

      await waitFor(() => {
        expect(
          screen.getByText('メールアドレスは254文字以内で入力してください')
        ).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // フォーム送信テスト
  // ============================================================================
  describe('フォーム送信', () => {
    it('有効なデータで送信が成功する', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 必須フィールドを入力
      await user.type(screen.getByLabelText(/会社名/), '株式会社テスト');
      await user.type(screen.getByLabelText(/^住所$/), '東京都渋谷区1-1-1');
      await user.type(screen.getByLabelText(/^代表者$/), '代表 太郎');

      // 送信
      await user.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          companyName: '株式会社テスト',
          address: '東京都渋谷区1-1-1',
          representative: '代表 太郎',
          phone: '',
          fax: '',
          email: '',
          invoiceRegistrationNumber: '',
          version: 0,
        });
      });
    });

    it('任意フィールドも含めた送信が成功する', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 必須フィールドを入力
      await user.type(screen.getByLabelText(/会社名/), '株式会社テスト');
      await user.type(screen.getByLabelText(/^住所$/), '東京都渋谷区1-1-1');
      await user.type(screen.getByLabelText(/^代表者$/), '代表 太郎');

      // 任意フィールドを入力
      await user.type(screen.getByLabelText(/電話番号/), '03-1234-5678');
      await user.type(screen.getByLabelText(/FAX番号/), '03-1234-5679');
      await user.type(screen.getByLabelText(/メールアドレス/), 'test@example.com');
      await user.type(screen.getByLabelText(/適格請求書発行事業者登録番号/), 'T1234567890123');

      // 送信
      await user.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          companyName: '株式会社テスト',
          address: '東京都渋谷区1-1-1',
          representative: '代表 太郎',
          phone: '03-1234-5678',
          fax: '03-1234-5679',
          email: 'test@example.com',
          invoiceRegistrationNumber: 'T1234567890123',
          version: 0,
        });
      });
    });

    it('更新時はversionが含まれる', async () => {
      const user = userEvent.setup();
      const initialData: CompanyInfoFormData = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '代表 太郎',
        phone: '',
        fax: '',
        email: '',
        invoiceRegistrationNumber: '',
        version: 5,
      };

      render(
        <CompanyInfoForm
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 会社名を変更
      const companyNameInput = screen.getByLabelText(/会社名/);
      await user.clear(companyNameInput);
      await user.type(companyNameInput, '株式会社更新テスト');

      // 送信
      await user.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            companyName: '株式会社更新テスト',
            version: 5,
          })
        );
      });
    });
  });

  // ============================================================================
  // リセットテスト
  // ============================================================================
  describe('リセット', () => {
    it('リセットボタンをクリックすると初期データに戻る（Requirement 3.2）', async () => {
      const user = userEvent.setup();
      const initialData: CompanyInfoFormData = {
        companyName: '株式会社テスト',
        address: '東京都渋谷区1-1-1',
        representative: '代表 太郎',
        phone: '',
        fax: '',
        email: '',
        invoiceRegistrationNumber: '',
        version: 1,
      };

      render(
        <CompanyInfoForm
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 会社名を変更
      const companyNameInput = screen.getByLabelText(/会社名/);
      await user.clear(companyNameInput);
      await user.type(companyNameInput, '変更後の会社名');

      expect(companyNameInput).toHaveValue('変更後の会社名');

      // リセットボタンをクリック
      await user.click(screen.getByRole('button', { name: /リセット/ }));

      // 初期データに戻ることを確認
      expect(companyNameInput).toHaveValue('株式会社テスト');
      expect(mockOnReset).toHaveBeenCalled();
    });

    it('未登録時のリセットで空フォームに戻る（Requirement 3.3）', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // フィールドに入力
      await user.type(screen.getByLabelText(/会社名/), '株式会社テスト');
      await user.type(screen.getByLabelText(/^住所$/), '東京都渋谷区1-1-1');

      // リセットボタンをクリック
      await user.click(screen.getByRole('button', { name: /リセット/ }));

      // 空フォームに戻ることを確認
      expect(screen.getByLabelText(/会社名/)).toHaveValue('');
      expect(screen.getByLabelText(/^住所$/)).toHaveValue('');
    });
  });

  // ============================================================================
  // isDirty状態管理テスト
  // ============================================================================
  describe('isDirty状態管理', () => {
    it('フォーム変更時にonDirtyChangeが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 初期状態ではisDirty=false
      expect(mockOnDirtyChange).toHaveBeenCalledWith(false);

      // 会社名を入力
      await user.type(screen.getByLabelText(/会社名/), 'テスト');

      // isDirty=trueに変更
      expect(mockOnDirtyChange).toHaveBeenCalledWith(true);
    });

    it('リセット時にonDirtyChange(false)が呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // フィールドに入力
      await user.type(screen.getByLabelText(/会社名/), 'テスト');

      vi.clearAllMocks();

      // リセットボタンをクリック
      await user.click(screen.getByRole('button', { name: /リセット/ }));

      // isDirty=falseに戻る
      expect(mockOnDirtyChange).toHaveBeenCalledWith(false);
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================
  describe('アクセシビリティ', () => {
    it('フォームにrole="form"が設定されている', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('必須フィールドにaria-required属性が設定されている', () => {
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText(/会社名/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^住所$/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/^代表者$/)).toHaveAttribute('aria-required', 'true');
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリックしてバリデーションエラーを発生させる
      await user.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        expect(screen.getByLabelText(/会社名/)).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージにrole="alert"が設定されている', async () => {
      const user = userEvent.setup();
      render(
        <CompanyInfoForm
          onSubmit={mockOnSubmit}
          onReset={mockOnReset}
          onDirtyChange={mockOnDirtyChange}
          isSubmitting={false}
        />
      );

      // 送信ボタンをクリックしてバリデーションエラーを発生させる
      await user.click(screen.getByRole('button', { name: /保存/ }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });
    });
  });
});
