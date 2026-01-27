/**
 * @fileoverview CreateItemizedStatementFormコンポーネントのテスト
 *
 * Task 17.3: CreateItemizedStatementFormのデフォルト名対応
 *
 * Requirements:
 * - 15.4: 内訳書名フィールドのデフォルト値として「内訳書」を設定する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateItemizedStatementForm } from '../../../components/itemized-statement/CreateItemizedStatementForm';
import type { QuantityTableInfo } from '../../../types/quantity-table.types';

// ============================================================================
// モックデータ
// ============================================================================

const mockQuantityTables: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    projectId: 'project-123',
    name: '数量表1',
    groupCount: 2,
    itemCount: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'qt-2',
    projectId: 'project-123',
    name: '数量表2',
    groupCount: 1,
    itemCount: 5,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

// ============================================================================
// テストスイート
// ============================================================================

describe('CreateItemizedStatementForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('デフォルト名プロパティ（REQ-15.4、Task 17.3）', () => {
    it('defaultNameが指定されていない場合、内訳書名フィールドは空', async () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/) as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });

    it('defaultNameが指定された場合、内訳書名フィールドにデフォルト値が設定される', async () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          defaultName="内訳書"
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/) as HTMLInputElement;
      expect(nameInput.value).toBe('内訳書');
    });

    it('defaultNameにカスタム値を指定できる', async () => {
      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          defaultName="第1回内訳書"
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/) as HTMLInputElement;
      expect(nameInput.value).toBe('第1回内訳書');
    });

    it('デフォルト名を上書きして送信できる', async () => {
      mockOnSubmit.mockResolvedValue({
        id: 'is-new-123',
        projectId: 'project-123',
        name: '変更後の名前',
        sourceQuantityTableId: 'qt-1',
        sourceQuantityTableName: '数量表1',
        itemCount: 5,
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-01-15T00:00:00.000Z',
      });

      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          onSubmit={mockOnSubmit}
          defaultName="内訳書"
        />
      );

      const nameInput = screen.getByLabelText(/内訳書名/) as HTMLInputElement;

      // デフォルト値をクリアして新しい名前を入力
      await user.clear(nameInput);
      await user.type(nameInput, '変更後の名前');

      expect(nameInput.value).toBe('変更後の名前');

      // 数量表を選択
      const selectElement = screen.getByLabelText(/数量表/) as HTMLSelectElement;
      await user.selectOptions(selectElement, 'qt-1');

      // 作成ボタンをクリック
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: '変更後の名前',
          quantityTableId: 'qt-1',
        });
      });
    });
  });

  describe('既存の機能との整合性', () => {
    it('フォームバリデーションは従来通り機能する', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          defaultName=""
        />
      );

      // 名前が空のまま送信を試みる
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // バリデーションエラーが表示される
      await waitFor(() => {
        expect(screen.getByText('内訳書名を入力してください')).toBeInTheDocument();
      });
    });

    it('数量表選択バリデーションは従来通り機能する', async () => {
      const user = userEvent.setup();

      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTables}
          onSuccess={mockOnSuccess}
          onCancel={mockOnCancel}
          defaultName="内訳書"
        />
      );

      // 数量表を選択せずに送信を試みる
      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      // バリデーションエラーが表示される（role="alert"を持つ要素で確認）
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const quantityTableError = alerts.find((alert) =>
          alert.textContent?.includes('数量表を選択してください')
        );
        expect(quantityTableError).toBeInTheDocument();
      });
    });
  });
});
