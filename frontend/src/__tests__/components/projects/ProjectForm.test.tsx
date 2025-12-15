/**
 * @fileoverview ProjectFormコンポーネントのユニットテスト
 *
 * TDD: RED フェーズ - まずテストを作成し、失敗を確認
 *
 * Requirements:
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.2: プロジェクト名（必須）、取引先（任意）、営業担当者（必須）、工事担当者（任意）、現場住所（任意）、概要（任意）の入力フィールドを表示
 * - 1.5: 営業担当者フィールドのデフォルト値としてログインユーザーの表示名を設定
 * - 1.6: 工事担当者フィールドのデフォルト値としてログインユーザーの表示名を設定
 * - 1.9: 必須項目を入力せずに「作成」ボタンをクリックした場合、入力エラーメッセージを該当フィールドに表示
 * - 1.10: プロジェクト名が未入力の場合、「プロジェクト名は必須です」エラーを表示
 * - 1.11: プロジェクト名が255文字を超える場合、「プロジェクト名は255文字以内で入力してください」エラーを表示
 * - 1.13: 営業担当者が未選択の場合、「営業担当者は必須です」エラーを表示
 * - 8.1: プロジェクト詳細画面で「編集」ボタンをクリックすると編集フォームを表示
 * - 8.4: バリデーションエラーが発生するとエラーメッセージを該当フィールドに表示
 * - 8.5: 「キャンセル」ボタンをクリックすると編集内容を破棄し、詳細表示に戻る
 * - 13.10: フロントエンドでバリデーションエラーが発生した場合、エラーメッセージを即座に表示
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.4: フォーカス状態を視覚的に明確に表示
 * - 22.1: 顧客種別を持つ取引先をセレクトボックスで選択可能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectForm from '../../../components/projects/ProjectForm';
import type { ProjectFormData } from '../../../components/projects/ProjectForm';

// AuthContext のモック
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'current-user-id',
      email: 'test@example.com',
      displayName: '現在のユーザー',
    },
    isAuthenticated: true,
    isInitialized: true,
  }),
}));

// APIクライアントのモック
vi.mock('../../../api/projects', () => ({
  getAssignableUsers: vi.fn().mockResolvedValue([
    { id: 'user-1', displayName: 'ユーザー1' },
    { id: 'user-2', displayName: 'ユーザー2' },
    { id: 'current-user-id', displayName: '現在のユーザー' },
  ]),
}));

// apiClientのモック（トークンを返すように設定）
vi.mock('../../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
}));

describe('ProjectForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('作成モード', () => {
    it('すべてのフォームフィールドを表示する', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須フィールド（ローディング完了を待つ）
      expect(screen.getByLabelText(/プロジェクト名/)).toBeInTheDocument();

      // ユーザー選択コンポーネントのローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });
      expect(screen.getByLabelText(/営業担当者/)).toBeInTheDocument();

      // 任意フィールド
      expect(screen.getByRole('combobox', { name: '顧客名' })).toBeInTheDocument();
      expect(screen.getByLabelText(/工事担当者/)).toBeInTheDocument();
      expect(screen.getByLabelText(/現場住所/)).toBeInTheDocument();
      expect(screen.getByLabelText(/概要/)).toBeInTheDocument();

      // ボタン
      expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('必須フィールドに必須マーク（*）を表示する', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須マークを確認（aria-hidden="true"で装飾的に表示）
      const requiredMarks = screen.getAllByText('*');
      expect(requiredMarks.length).toBeGreaterThanOrEqual(2); // プロジェクト名、営業担当者
    });
  });

  describe('編集モード', () => {
    const initialData: Partial<ProjectFormData> = {
      name: '既存プロジェクト',
      tradingPartnerId: 'partner-1',
      salesPersonId: 'user-1',
      constructionPersonId: 'user-2',
      siteAddress: '東京都千代田区',
      description: '既存の概要',
    };

    it('初期データを表示する', async () => {
      render(
        <ProjectForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('既存プロジェクト')).toBeInTheDocument();
        expect(screen.getByDisplayValue('東京都千代田区')).toBeInTheDocument();
        expect(screen.getByDisplayValue('既存の概要')).toBeInTheDocument();
      });

      // ボタンは「保存」になる
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('プロジェクト名が未入力の場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('プロジェクト名は必須です')).toBeInTheDocument();
      });

      // onSubmitが呼ばれていないことを確認
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('プロジェクト名が255文字を超える場合、エラーメッセージを表示する', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 256文字の入力（長い文字列はfireEventで直接設定）
      const longName = 'a'.repeat(256);
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      fireEvent.change(nameInput, { target: { value: longName } });
      fireEvent.blur(nameInput);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(
          screen.getByText('プロジェクト名は255文字以内で入力してください')
        ).toBeInTheDocument();
      });
    });

    it('営業担当者が未選択の場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // プロジェクト名を入力
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.type(nameInput, 'テストプロジェクト');

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 営業担当者をクリア（fireEventで空の値に設定）
      const salesPersonSelect = screen.getByLabelText(/営業担当者/);
      fireEvent.change(salesPersonSelect, { target: { value: '' } });

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('営業担当者は必須です')).toBeInTheDocument();
      });
    });

    it('現場住所が500文字を超える場合、エラーメッセージを表示する', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 501文字の入力（長い文字列はfireEventで直接設定）
      const longAddress = 'a'.repeat(501);
      const addressInput = screen.getByLabelText(/現場住所/);
      fireEvent.change(addressInput, { target: { value: longAddress } });
      fireEvent.blur(addressInput);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('現場住所は500文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('概要が5000文字を超える場合、エラーメッセージを表示する', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 5001文字の入力（長い文字列はfireEventで直接設定）
      const longDescription = 'a'.repeat(5001);
      const descriptionInput = screen.getByLabelText(/概要/);
      fireEvent.change(descriptionInput, { target: { value: longDescription } });
      fireEvent.blur(descriptionInput);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('概要は5000文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('即時バリデーション: 入力時にリアルタイムでエラーを表示する', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // プロジェクト名を入力後、空にする
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.type(nameInput, 'test');
      await user.clear(nameInput);

      // フォーカスを外す
      await user.tab();

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('プロジェクト名は必須です')).toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('すべての必須フィールドが入力された場合、onSubmitを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 必須フィールドを入力
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.type(nameInput, 'テストプロジェクト');

      // 営業担当者はデフォルトでログインユーザーが選択されている想定

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // onSubmitが呼ばれたことを確認
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'テストプロジェクト',
          })
        );
      });
    });

    it('送信中はボタンが無効化される', () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      const submitButton = screen.getByRole('button', { name: /作成中/ });
      expect(submitButton).toBeDisabled();
    });

    it('送信中はローディングインジケータを表示する', () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('status', { name: /ローディング/ })).toBeInTheDocument();
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックするとonCancelを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('編集モードでキャンセルしても入力内容を破棄する', async () => {
      const user = userEvent.setup();
      const initialData: Partial<ProjectFormData> = {
        name: '既存プロジェクト',
        tradingPartnerId: 'partner-1',
        salesPersonId: 'user-1',
      };

      render(
        <ProjectForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 値を変更
      const nameInput = screen.getByDisplayValue('既存プロジェクト');
      await user.clear(nameInput);
      await user.type(nameInput, '変更されたプロジェクト');

      // キャンセルをクリック
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      // onCancelが呼ばれる（編集内容は呼び出し側で破棄される）
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-label属性が適切に設定されている', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 各フィールドにaria-labelが設定されている
      expect(screen.getByLabelText(/プロジェクト名/)).toHaveAttribute('aria-label');
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 作成ボタンをクリック（バリデーションエラーを発生させる）
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // aria-invalid属性を確認
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージがaria-describedbyで関連付けられる', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 作成ボタンをクリック（バリデーションエラーを発生させる）
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // aria-describedby属性を確認
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/プロジェクト名/);
        expect(nameInput).toHaveAttribute('aria-describedby');
      });
    });

    it('フォーム全体にrole="form"が設定されている', () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('キーボードのみでフォームを操作できる', async () => {
      const user = userEvent.setup();
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // Tabキーでフォーカス移動
      await user.tab(); // プロジェクト名にフォーカス
      expect(screen.getByLabelText(/プロジェクト名/)).toHaveFocus();

      await user.tab(); // 顧客名フィールドにフォーカス（comboboxの正確なラベル）
      expect(screen.getByRole('combobox', { name: '顧客名' })).toHaveFocus();

      await user.tab(); // 営業担当者にフォーカス
      expect(screen.getByLabelText(/営業担当者/)).toHaveFocus();
    });
  });

  describe('サーバーエラー表示', () => {
    /**
     * Task 22.5: ProjectFormコンポーネントにプロジェクト名重複エラー表示を追加
     * Requirements: 1.15, 8.7
     *
     * submitError propsでサーバーエラーを受け取り、
     * 409エラー時にプロジェクト名フィールドにエラーメッセージを表示する
     */
    it('submitErrorがプロジェクト名重複エラーの場合、プロジェクト名フィールドにエラーを表示する', async () => {
      const duplicateError = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409 as const,
        detail: 'このプロジェクト名は既に使用されています: 重複プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE' as const,
        projectName: '重複プロジェクト',
      };

      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={duplicateError}
        />
      );

      // プロジェクト名重複エラーメッセージを確認
      expect(screen.getByText('このプロジェクト名は既に使用されています')).toBeInTheDocument();

      // プロジェクト名フィールドがエラー状態になっている
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('submitErrorがnullの場合、サーバーエラーを表示しない', () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={null}
        />
      );

      // エラーメッセージが表示されていない
      expect(
        screen.queryByText('このプロジェクト名は既に使用されています')
      ).not.toBeInTheDocument();
    });

    it('submitErrorがundefinedの場合、サーバーエラーを表示しない', () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // エラーメッセージが表示されていない
      expect(
        screen.queryByText('このプロジェクト名は既に使用されています')
      ).not.toBeInTheDocument();
    });

    it('submitErrorがプロジェクト名重複以外の409エラーの場合、プロジェクト名エラーを表示しない', () => {
      // 楽観的排他制御エラー（競合エラー）の例
      const conflictError = {
        type: 'https://architrack.example.com/problems/optimistic-lock-error',
        title: '競合エラー',
        status: 409 as const,
        detail: '他のユーザーが更新しました',
        code: 'OPTIMISTIC_LOCK_ERROR',
      };

      render(
        <ProjectForm
          mode="edit"
          initialData={{ name: 'テスト', salesPersonId: 'user-1' }}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={conflictError}
        />
      );

      // プロジェクト名重複エラーは表示されない
      expect(
        screen.queryByText('このプロジェクト名は既に使用されています')
      ).not.toBeInTheDocument();
    });

    it('プロジェクト名を変更するとsubmitErrorがクリアされる', async () => {
      const user = userEvent.setup();
      const duplicateError = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409 as const,
        detail: 'このプロジェクト名は既に使用されています: 重複プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE' as const,
        projectName: '重複プロジェクト',
      };

      const { rerender } = render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={duplicateError}
        />
      );

      // エラーが表示されている
      expect(screen.getByText('このプロジェクト名は既に使用されています')).toBeInTheDocument();

      // プロジェクト名を変更
      const nameInput = screen.getByLabelText(/プロジェクト名/);
      await user.type(nameInput, '新しい名前');

      // 再レンダリング（親コンポーネントがsubmitErrorをクリアする想定）
      rerender(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={null}
        />
      );

      // エラーが消えている
      expect(
        screen.queryByText('このプロジェクト名は既に使用されています')
      ).not.toBeInTheDocument();
    });

    it('編集モードでsubmitErrorがプロジェクト名重複エラーの場合、エラーを表示する', async () => {
      const duplicateError = {
        type: 'https://architrack.example.com/problems/project-name-duplicate',
        title: 'プロジェクト名重複エラー',
        status: 409 as const,
        detail: 'このプロジェクト名は既に使用されています: 重複プロジェクト',
        code: 'PROJECT_NAME_DUPLICATE' as const,
        projectName: '重複プロジェクト',
      };

      render(
        <ProjectForm
          mode="edit"
          initialData={{
            name: '重複プロジェクト',
            salesPersonId: 'user-1',
          }}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={duplicateError}
        />
      );

      // プロジェクト名重複エラーメッセージを確認
      expect(screen.getByText('このプロジェクト名は既に使用されています')).toBeInTheDocument();
    });
  });

  describe('デフォルト値', () => {
    it('作成モードでは営業担当者にログインユーザーがデフォルト設定される', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 営業担当者の値がログインユーザーIDになっている
      const salesSelect = screen.getByLabelText(/営業担当者/) as HTMLSelectElement;
      await waitFor(() => {
        expect(salesSelect.value).toBe('current-user-id');
      });
    });

    it('作成モードでは工事担当者にログインユーザーがデフォルト設定される', async () => {
      render(
        <ProjectForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // ローディング完了を待つ
      await waitFor(() => {
        expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
      });

      // 工事担当者の値がログインユーザーIDになっている
      const constructionSelect = screen.getByLabelText(/工事担当者/) as HTMLSelectElement;
      await waitFor(() => {
        expect(constructionSelect.value).toBe('current-user-id');
      });
    });
  });
});
