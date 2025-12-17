/**
 * @fileoverview 現場調査フォームコンポーネントのユニットテスト
 *
 * Task 9.4: 現場調査作成・編集フォームを実装する
 *
 * TDD: RED フェーズ - まずテストを作成し、失敗を確認
 *
 * Requirements:
 * - 1.1: 現場調査作成フォームで必須フィールドを入力可能
 * - 1.3: 現場調査情報を編集して保存（楽観的排他制御）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SiteSurveyForm from '../../../components/site-surveys/SiteSurveyForm';
import type { SiteSurveyFormData } from '../../../components/site-surveys/SiteSurveyForm';

describe('SiteSurveyForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('作成モード', () => {
    it('すべてのフォームフィールドを表示する', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須フィールド
      expect(screen.getByLabelText(/調査名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/調査日/)).toBeInTheDocument();

      // 任意フィールド
      expect(screen.getByLabelText(/メモ/)).toBeInTheDocument();

      // ボタン
      expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('必須フィールドに必須マーク（*）を表示する', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須マークを確認（aria-hidden="true"で装飾的に表示）
      const requiredMarks = screen.getAllByText('*');
      expect(requiredMarks.length).toBeGreaterThanOrEqual(2); // 調査名、調査日
    });

    it('調査日のデフォルト値として今日の日付が設定される', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      const today = new Date().toISOString().split('T')[0];
      const dateInput = screen.getByLabelText(/調査日/) as HTMLInputElement;
      expect(dateInput.value).toBe(today);
    });
  });

  describe('編集モード', () => {
    const initialData: Partial<SiteSurveyFormData> = {
      name: '既存の現場調査',
      surveyDate: '2025-01-15',
      memo: '既存のメモ',
    };

    it('初期データを表示する', () => {
      render(
        <SiteSurveyForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByDisplayValue('既存の現場調査')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2025-01-15')).toBeInTheDocument();
      expect(screen.getByDisplayValue('既存のメモ')).toBeInTheDocument();

      // ボタンは「保存」になる
      expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('調査名が未入力の場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査名をクリアして作成ボタンをクリック
      const nameInput = screen.getByLabelText(/調査名/);
      await user.clear(nameInput);

      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('調査名は必須です')).toBeInTheDocument();
      });

      // onSubmitが呼ばれていないことを確認
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('調査名が200文字を超える場合、エラーメッセージを表示する', async () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 201文字の入力
      const longName = 'a'.repeat(201);
      const nameInput = screen.getByLabelText(/調査名/);
      fireEvent.change(nameInput, { target: { value: longName } });
      fireEvent.blur(nameInput);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('調査名は200文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('調査日が未選択の場合、エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査日をクリア
      const dateInput = screen.getByLabelText(/調査日/);
      fireEvent.change(dateInput, { target: { value: '' } });

      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('調査日は必須です')).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('メモが2000文字を超える場合、エラーメッセージを表示する', async () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 2001文字の入力
      const longMemo = 'a'.repeat(2001);
      const memoInput = screen.getByLabelText(/メモ/);
      fireEvent.change(memoInput, { target: { value: longMemo } });
      fireEvent.blur(memoInput);

      // エラーメッセージを確認
      await waitFor(() => {
        expect(screen.getByText('メモは2000文字以内で入力してください')).toBeInTheDocument();
      });
    });

    it('即時バリデーション: 入力時にリアルタイムでエラーを表示する', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査名を入力後、空にする
      const nameInput = screen.getByLabelText(/調査名/);
      await user.type(nameInput, 'test');
      await user.clear(nameInput);

      // フォーカスを外す
      await user.tab();

      // エラーメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('調査名は必須です')).toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('すべての必須フィールドが入力された場合、onSubmitを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 必須フィールドを入力
      const nameInput = screen.getByLabelText(/調査名/);
      await user.type(nameInput, 'テスト現場調査');

      // 調査日は今日がデフォルト

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // onSubmitが呼ばれたことを確認
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'テスト現場調査',
          })
        );
      });
    });

    it('メモも含めて送信できる', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // フィールドを入力
      const nameInput = screen.getByLabelText(/調査名/);
      await user.type(nameInput, 'テスト現場調査');

      const memoInput = screen.getByLabelText(/メモ/);
      await user.type(memoInput, 'テスト用のメモです');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // onSubmitが呼ばれたことを確認
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'テスト現場調査',
            memo: 'テスト用のメモです',
          })
        );
      });
    });

    it('送信中はボタンが無効化される', () => {
      render(
        <SiteSurveyForm
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
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      expect(screen.getByRole('status', { name: /ローディング/ })).toBeInTheDocument();
    });

    it('送信中はフォームフィールドが無効化される', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      expect(screen.getByLabelText(/調査名/)).toBeDisabled();
      expect(screen.getByLabelText(/調査日/)).toBeDisabled();
      expect(screen.getByLabelText(/メモ/)).toBeDisabled();
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックするとonCancelを呼び出す', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
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
      const initialData: Partial<SiteSurveyFormData> = {
        name: '既存の現場調査',
        surveyDate: '2025-01-15',
      };

      render(
        <SiteSurveyForm
          mode="edit"
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 値を変更
      const nameInput = screen.getByDisplayValue('既存の現場調査');
      await user.clear(nameInput);
      await user.type(nameInput, '変更された調査');

      // キャンセルをクリック
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      // onCancelが呼ばれる（編集内容は呼び出し側で破棄される）
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('送信中でもキャンセルボタンをクリックできる', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={true}
        />
      );

      // キャンセルボタンは送信中でもクリック可能
      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      expect(cancelButton).not.toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-label属性が適切に設定されている', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 各フィールドにaria-labelが設定されている
      expect(screen.getByLabelText(/調査名/)).toHaveAttribute('aria-label');
      expect(screen.getByLabelText(/調査日/)).toHaveAttribute('aria-label');
      expect(screen.getByLabelText(/メモ/)).toHaveAttribute('aria-label');
    });

    it('エラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査名をクリア
      const nameInput = screen.getByLabelText(/調査名/);
      await user.clear(nameInput);

      // 作成ボタンをクリック（バリデーションエラーを発生させる）
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // aria-invalid属性を確認
      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('エラーメッセージがaria-describedbyで関連付けられる', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査名をクリア
      const nameInput = screen.getByLabelText(/調査名/);
      await user.clear(nameInput);

      // 作成ボタンをクリック（バリデーションエラーを発生させる）
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // aria-describedby属性を確認
      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-describedby');
      });
    });

    it('フォーム全体にrole="form"が設定されている', () => {
      render(
        <SiteSurveyForm
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
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // Tabキーでフォーカス移動
      await user.tab(); // 調査名にフォーカス
      expect(screen.getByLabelText(/調査名/)).toHaveFocus();

      await user.tab(); // 調査日にフォーカス
      expect(screen.getByLabelText(/調査日/)).toHaveFocus();

      await user.tab(); // メモにフォーカス
      expect(screen.getByLabelText(/メモ/)).toHaveFocus();
    });

    it('必須フィールドにaria-required属性が設定されている', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      expect(screen.getByLabelText(/調査名/)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/調査日/)).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('サーバーエラー表示', () => {
    it('submitErrorが競合エラーの場合、エラーメッセージを表示しない（ダイアログで表示される想定）', () => {
      const conflictError = {
        type: 'https://architrack.example.com/problems/site-survey-conflict',
        title: '競合エラー',
        status: 409 as const,
        detail: '他のユーザーが更新しました',
        code: 'SITE_SURVEY_CONFLICT' as const,
      };

      render(
        <SiteSurveyForm
          mode="edit"
          initialData={{ name: 'テスト', surveyDate: '2025-01-15' }}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={conflictError}
        />
      );

      // フォーム内にはエラーは表示されない（親コンポーネントのダイアログで表示）
      expect(screen.queryByText('他のユーザーが更新しました')).not.toBeInTheDocument();
    });

    it('submitErrorがnullの場合、サーバーエラーを表示しない', () => {
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
          submitError={null}
        />
      );

      // エラーメッセージがないことを確認
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('日付入力', () => {
    it('日付形式が正しくフォーマットされる', async () => {
      const user = userEvent.setup();
      render(
        <SiteSurveyForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isSubmitting={false}
        />
      );

      // 調査名を入力
      const nameInput = screen.getByLabelText(/調査名/);
      await user.type(nameInput, 'テスト');

      // 日付を変更
      const dateInput = screen.getByLabelText(/調査日/);
      fireEvent.change(dateInput, { target: { value: '2025-12-25' } });

      // 送信
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            surveyDate: '2025-12-25',
          })
        );
      });
    });
  });
});
