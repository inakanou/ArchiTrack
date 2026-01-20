/**
 * @fileoverview 内訳書作成フォームコンポーネントのテスト
 *
 * Task 5.1: 内訳書作成フォームコンポーネントの実装
 * Task 5.2: 作成フォームのエラー表示とローディング
 *
 * Requirements:
 * - 1.1: 新規作成ボタンをクリックすると内訳書作成フォームが表示される
 * - 1.2: 数量表選択時に選択された数量表の項目数を表示する
 * - 1.4: 数量表未選択時のエラーメッセージ
 * - 1.5: 数量表は1つのみ選択可能
 * - 1.6: 内訳書名未入力時のエラーメッセージ
 * - 1.7: 内訳書名は最大200文字
 * - 1.8: 数量表がない場合は新規作成ボタンを無効化
 * - 1.9: 選択された数量表の項目数が0件の場合のエラー
 * - 1.10: 同名の内訳書が存在する場合のエラー
 * - 2.5: オーバーフローエラー
 * - 12.1: 集計処理中のローディングインジケーター
 * - 12.4: ローディング中は操作ボタンを無効化
 * - 12.5: ローディング完了時にインジケーターを非表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateItemizedStatementForm } from './CreateItemizedStatementForm';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

// ============================================================================
// モックデータ
// ============================================================================

const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-1',
    name: '第1回数量表',
    groupCount: 3,
    itemCount: 15,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-1',
    name: '第2回数量表',
    groupCount: 2,
    itemCount: 8,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'qt-empty',
    projectId: 'project-1',
    name: '空の数量表',
    groupCount: 0,
    itemCount: 0,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
  },
];

const emptyQuantityTables: QuantityTableInfo[] = [];

// ============================================================================
// テストスイート
// ============================================================================

describe('CreateItemizedStatementForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 基本的なレンダリング
  // ==========================================================================

  describe('基本的なレンダリング', () => {
    it('フォームが正しくレンダリングされる', () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/内訳書名/)).toBeInTheDocument();
      expect(screen.getByLabelText(/数量表/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /作成/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });

    it('数量表選択ドロップダウンに数量表一覧が表示される', () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const select = screen.getByLabelText(/数量表/);
      expect(select).toBeInTheDocument();

      // ドロップダウンのオプションを確認
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(mockQuantityTables.length + 1); // +1 for placeholder
      expect(screen.getByText('第1回数量表')).toBeInTheDocument();
      expect(screen.getByText('第2回数量表')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Requirement 1.2: 数量表選択時に項目数を表示
  // ==========================================================================

  describe('数量表選択時に項目数を表示 (Req 1.2)', () => {
    it('数量表を選択すると項目数が表示される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      expect(screen.getByText(/15項目/)).toBeInTheDocument();
    });

    it('別の数量表を選択すると項目数が更新される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const select = screen.getByLabelText(/数量表/);

      await user.selectOptions(select, 'qt-1');
      expect(screen.getByText(/15項目/)).toBeInTheDocument();

      await user.selectOptions(select, 'qt-2');
      expect(screen.getByText(/8項目/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Requirement 1.4: 数量表未選択時のエラーメッセージ
  // ==========================================================================

  describe('数量表未選択時のエラーメッセージ (Req 1.4)', () => {
    it('数量表を選択せずに作成ボタンをクリックするとエラーが表示される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // 内訳書名を入力
      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      // エラーメッセージがrole="alert"で表示される
      const errorAlert = screen.getByRole('alert');
      expect(errorAlert).toHaveTextContent('数量表を選択してください');
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Requirement 1.6: 内訳書名未入力時のエラーメッセージ
  // ==========================================================================

  describe('内訳書名未入力時のエラーメッセージ (Req 1.6)', () => {
    it('内訳書名を入力せずに作成ボタンをクリックするとエラーが表示される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      // 数量表を選択
      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      expect(screen.getByText('内訳書名を入力してください')).toBeInTheDocument();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Requirement 1.7: 内訳書名は最大200文字
  // ==========================================================================

  describe('内訳書名は最大200文字 (Req 1.7)', () => {
    it('内訳書名フィールドにmaxLength属性が設定されている', () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      expect(nameInput).toHaveAttribute('maxLength', '200');
    });
  });

  // ==========================================================================
  // Requirement 1.8: 数量表がない場合は作成ボタンを無効化
  // ==========================================================================

  describe('数量表がない場合は作成ボタンを無効化 (Req 1.8)', () => {
    it('数量表が存在しない場合、作成ボタンが無効化される', () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={emptyQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const submitButton = screen.getByRole('button', { name: /作成/ });
      expect(submitButton).toBeDisabled();
    });

    it('数量表が存在しない場合、案内メッセージが表示される', () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={emptyQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      expect(
        screen.getByText('数量表がありません。先に数量表を作成してください。')
      ).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Requirement 1.9: 項目数が0件の数量表を選択した場合のエラー
  // ==========================================================================

  describe('項目数が0件の数量表を選択した場合のエラー (Req 1.9)', () => {
    it('項目数が0件の数量表を選択して作成すると警告が表示される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-empty');

      expect(screen.getByText(/0項目/)).toBeInTheDocument();

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      expect(screen.getByText('選択された数量表に項目がありません')).toBeInTheDocument();
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // キャンセル機能
  // ==========================================================================

  describe('キャンセル機能', () => {
    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Requirement 12: ローディング表示
  // ==========================================================================

  describe('ローディング表示 (Req 12)', () => {
    it('送信中はローディングインジケーターが表示される', async () => {
      const user = userEvent.setup();

      const mockOnSuccessDelayed = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000)));

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccessDelayed}
          onCancel={mockOnCancel}
          onSubmit={async () => {
            // 遅延を模倣
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { id: 'new-id', projectId: 'project-1', name: 'test' } as never;
          }}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      // ローディング状態を確認
      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });

    it('送信中は作成ボタンが無効化される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { id: 'new-id', projectId: 'project-1', name: 'test' } as never;
          }}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      // 送信中はボタンが無効化される
      await waitFor(() => {
        expect(submitButton).toBeDisabled();
      });
    });

    it('送信中はキャンセルボタンが無効化される', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return { id: 'new-id', projectId: 'project-1', name: 'test' } as never;
          }}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      // 送信中はキャンセルボタンも無効化される
      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await waitFor(() => {
        expect(cancelButton).toBeDisabled();
      });
    });
  });

  // ==========================================================================
  // APIエラー処理
  // ==========================================================================

  describe('APIエラー処理', () => {
    it('同名の内訳書が存在するエラーが表示される (Req 1.10)', async () => {
      const user = userEvent.setup();

      const mockOnSubmitWithDuplicateError = vi.fn().mockRejectedValue({
        response: {
          status: 409,
          code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
          detail: '同名の内訳書が既に存在します',
        },
      });

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={mockOnSubmitWithDuplicateError}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, '重複する名前');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('同名の内訳書が既に存在します')).toBeInTheDocument();
      });
    });

    it('オーバーフローエラーが表示される (Req 2.5)', async () => {
      const user = userEvent.setup();

      const mockOnSubmitWithOverflowError = vi.fn().mockRejectedValue({
        response: {
          status: 422,
          code: 'QUANTITY_OVERFLOW',
          detail: '数量の合計が許容範囲を超えています',
        },
      });

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={mockOnSubmitWithOverflowError}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('数量の合計が許容範囲を超えています')).toBeInTheDocument();
      });
    });

    it('空の数量表エラーが表示される (Req 1.9 - API)', async () => {
      const user = userEvent.setup();

      const mockOnSubmitWithEmptyItemsError = vi.fn().mockRejectedValue({
        response: {
          status: 400,
          code: 'EMPTY_QUANTITY_ITEMS',
          detail: '選択された数量表に項目がありません',
        },
      });

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={mockOnSubmitWithEmptyItemsError}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('選択された数量表に項目がありません')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // 正常系
  // ==========================================================================

  describe('正常な作成フロー', () => {
    it('有効な入力で作成するとonSuccessが呼ばれる', async () => {
      const user = userEvent.setup();

      const mockStatement = {
        id: 'new-statement-id',
        projectId: 'project-1',
        name: 'テスト内訳書',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '第1回数量表',
        itemCount: 10,
        createdAt: '2025-01-04T00:00:00.000Z',
        updatedAt: '2025-01-04T00:00:00.000Z',
      };

      const mockOnSubmit = vi.fn().mockResolvedValue(mockStatement);

      render(
        <CreateItemizedStatementForm
          projectId="project-1"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={mockOnSubmit}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/);
      await user.type(nameInput, 'テスト内訳書');

      const select = screen.getByLabelText(/数量表/);
      await user.selectOptions(select, 'qt-1');

      const submitButton = screen.getByRole('button', { name: /作成/ });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: 'テスト内訳書',
          quantityTableId: 'qt-1',
        });
        expect(mockOnSuccess).toHaveBeenCalledWith(mockStatement);
      });
    });
  });
});
