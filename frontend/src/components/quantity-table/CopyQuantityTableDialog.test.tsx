/**
 * @fileoverview CopyQuantityTableDialogの単体テスト
 *
 * Task 21.1: コピーダイアログコンポーネントを実装する
 *
 * Requirements:
 * - 17.1: コピー先の数量表名入力ダイアログ表示、デフォルト値「{元の数量表名}のコピー」
 * - 17.5: エラー発生時のエラーメッセージ表示
 * - 17.6: コピー処理中のインジケーター表示、重複操作防止
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CopyQuantityTableDialog from './CopyQuantityTableDialog';
import * as quantityTablesApi from '../../api/quantity-tables';

// API モック
vi.mock('../../api/quantity-tables', () => ({
  copyQuantityTable: vi.fn(),
}));

describe('CopyQuantityTableDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    sourceTable: {
      id: 'qt-1',
      name: '第1回見積数量表',
    },
    onCopyComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 表示テスト
  // ==========================================================================
  describe('表示', () => {
    it('ダイアログが開いている場合、タイトル「数量表をコピー」が表示されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      expect(screen.getByText('数量表をコピー')).toBeInTheDocument();
    });

    it('ダイアログが閉じている場合、何も表示されないこと', () => {
      render(<CopyQuantityTableDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('数量表をコピー')).not.toBeInTheDocument();
    });

    it('コピー先の数量表名入力フィールドが表示されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      const input = screen.getByLabelText('数量表名');
      expect(input).toBeInTheDocument();
    });

    it('デフォルト値として「{元の数量表名}のコピー」が設定されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      const input = screen.getByLabelText('数量表名') as HTMLInputElement;
      expect(input.value).toBe('第1回見積数量表のコピー');
    });

    it('「キャンセル」ボタンが表示されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('「コピーを作成」ボタンが表示されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'コピーを作成' })).toBeInTheDocument();
    });

    it('dialog roleが設定されること', () => {
      render(<CopyQuantityTableDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 操作テスト
  // ==========================================================================
  describe('操作', () => {
    it('キャンセルボタンをクリックするとonCloseが呼ばれること', async () => {
      const user = userEvent.setup();
      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('数量表名を変更できること', async () => {
      const user = userEvent.setup();
      render(<CopyQuantityTableDialog {...defaultProps} />);

      const input = screen.getByLabelText('数量表名') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, 'カスタム名');

      expect(input.value).toBe('カスタム名');
    });

    it('コピーを作成ボタンをクリックするとAPIが呼ばれること', async () => {
      const user = userEvent.setup();
      const mockResult = {
        id: 'qt-copied',
        projectId: 'project-1',
        name: '第1回見積数量表のコピー',
        groupCount: 3,
        itemCount: 15,
        createdAt: '2025-01-05T00:00:00.000Z',
        updatedAt: '2025-01-05T00:00:00.000Z',
      };
      vi.mocked(quantityTablesApi.copyQuantityTable).mockResolvedValueOnce(mockResult);

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(quantityTablesApi.copyQuantityTable).toHaveBeenCalledWith('qt-1', {
          name: '第1回見積数量表のコピー',
        });
      });
    });

    it('コピー完了時にonCopyCompleteがコピー先数量表のIDで呼ばれること', async () => {
      const user = userEvent.setup();
      const mockResult = {
        id: 'qt-copied',
        projectId: 'project-1',
        name: '第1回見積数量表のコピー',
        groupCount: 3,
        itemCount: 15,
        createdAt: '2025-01-05T00:00:00.000Z',
        updatedAt: '2025-01-05T00:00:00.000Z',
      };
      vi.mocked(quantityTablesApi.copyQuantityTable).mockResolvedValueOnce(mockResult);

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(defaultProps.onCopyComplete).toHaveBeenCalledWith('qt-copied');
      });
    });
  });

  // ==========================================================================
  // コピー実行中の状態テスト
  // ==========================================================================
  describe('コピー実行中', () => {
    it('コピー実行中はボタンが無効化されること', async () => {
      const user = userEvent.setup();
      // 遅延を設けてコピー中の状態をテスト
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(quantityTablesApi.copyQuantityTable).mockReturnValueOnce(
        pendingPromise as Promise<never>
      );

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /コピー/ })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      });

      // クリーンアップ
      resolvePromise!({
        id: 'qt-copied',
        projectId: 'project-1',
        name: 'コピー',
        groupCount: 0,
        itemCount: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
    });

    it('コピー実行中は処理中インジケーター（スピナー）が表示されること', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(quantityTablesApi.copyQuantityTable).mockReturnValueOnce(
        pendingPromise as Promise<never>
      );

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
      });

      // クリーンアップ
      resolvePromise!({
        id: 'qt-copied',
        projectId: 'project-1',
        name: 'コピー',
        groupCount: 0,
        itemCount: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      });
    });
  });

  // ==========================================================================
  // エラーハンドリングテスト
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('エラー発生時はダイアログ内にエラーメッセージが表示されること', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.copyQuantityTable).mockRejectedValueOnce(
        new Error('コピーに失敗しました')
      );

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/コピーに失敗しました/)).toBeInTheDocument();
      });
    });

    it('エラー発生後もダイアログは閉じないこと', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.copyQuantityTable).mockRejectedValueOnce(
        new Error('コピーに失敗しました')
      );

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(screen.getByText('数量表をコピー')).toBeInTheDocument();
      });

      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('エラー発生後にボタンが再度有効化されること', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.copyQuantityTable).mockRejectedValueOnce(
        new Error('コピーに失敗しました')
      );

      render(<CopyQuantityTableDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'コピーを作成' })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: 'キャンセル' })).not.toBeDisabled();
      });
    });

    it('空の名前ではコピーが実行されないこと', async () => {
      const user = userEvent.setup();
      render(<CopyQuantityTableDialog {...defaultProps} />);

      const input = screen.getByLabelText('数量表名') as HTMLInputElement;
      await user.clear(input);

      await user.click(screen.getByRole('button', { name: 'コピーを作成' }));

      expect(quantityTablesApi.copyQuantityTable).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // デフォルト値のテスト
  // ==========================================================================
  describe('デフォルト値', () => {
    it('異なるソーステーブル名でデフォルト値が正しく設定されること', () => {
      render(
        <CopyQuantityTableDialog
          {...defaultProps}
          sourceTable={{ id: 'qt-2', name: '概算数量表' }}
        />
      );

      const input = screen.getByLabelText('数量表名') as HTMLInputElement;
      expect(input.value).toBe('概算数量表のコピー');
    });
  });
});
