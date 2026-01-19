/**
 * @fileoverview 内訳書削除確認ダイアログのテスト
 *
 * Task 10: 内訳書削除機能の実装
 *
 * Requirements:
 * - 7.2: 削除ボタンクリック時に確認ダイアログを表示する
 * - 12.3: 削除処理中のローディングインジケーターを表示する
 * - 12.4: ローディング中は操作ボタンを無効化する
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDeleteDialog from './ItemizedStatementDeleteDialog';

describe('ItemizedStatementDeleteDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    statementName: 'テスト内訳書',
  };

  describe('基本表示', () => {
    it('ダイアログが開いている時にコンテンツを表示する', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('内訳書の削除')).toBeInTheDocument();
    });

    it('ダイアログが閉じている時は何も表示しない', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('内訳書名が表示される', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} />);

      expect(screen.getByText('テスト内訳書')).toBeInTheDocument();
    });

    it('キャンセルボタンと削除ボタンがある', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^削除$/ })).toBeInTheDocument();
    });
  });

  describe('インタラクション', () => {
    it('キャンセルボタンクリック時にonCloseが呼ばれる', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(<ItemizedStatementDeleteDialog {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('削除ボタンクリック時にonConfirmが呼ばれる', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(<ItemizedStatementDeleteDialog {...defaultProps} onConfirm={onConfirm} />);

      const deleteButton = screen.getByRole('button', { name: /^削除$/ });
      await user.click(deleteButton);

      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe('Req 12.3, 12.4: ローディング状態', () => {
    it('isDeleting=true時に「削除中...」と表示する', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} isDeleting={true} />);

      expect(screen.getByText(/削除中/)).toBeInTheDocument();
    });

    it('isDeleting=true時にキャンセルボタンが無効化される', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} isDeleting={true} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ });
      expect(cancelButton).toBeDisabled();
    });

    it('isDeleting=true時に削除ボタンが無効化される', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} isDeleting={true} />);

      const deleteButton = screen.getByRole('button', { name: /削除中/ });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('dialog roleを持つ', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria-labelledbyでタイトルを参照している', () => {
      render(<ItemizedStatementDeleteDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });
});
