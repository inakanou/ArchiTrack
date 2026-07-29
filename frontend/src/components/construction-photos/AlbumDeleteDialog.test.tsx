/**
 * @fileoverview AlbumDeleteDialog のテスト
 *
 * Task 11.5: アルバム削除確認ダイアログ
 *
 * Requirements:
 * - 16.4: アルバム削除を実行しようとする際に削除の確認を求める
 * - (関連 1.4: アルバム削除時に関連する写真項目・看板配置も論理削除される旨を明示)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlbumDeleteDialog from './AlbumDeleteDialog';

describe('AlbumDeleteDialog', () => {
  const mockOnConfirm = vi.fn<() => void>();
  const mockOnClose = vi.fn<() => void>();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    albumName: 'テストアルバム',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示 (Requirement 16.4)', () => {
    it('isOpen=trueの場合、確認ダイアログが表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、ダイアログが表示されない', () => {
      render(<AlbumDeleteDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('アルバム名が表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByText(/テストアルバム/)).toBeInTheDocument();
    });

    it('削除確認ボタンが表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /削除/i })).toBeInTheDocument();
    });

    it('キャンセルボタンが表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });
  });

  describe('関連データ削除の警告 (関連: Requirement 1.4)', () => {
    it('写真項目も削除される旨の警告が表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByText(/写真項目/)).toBeInTheDocument();
    });

    it('看板配置も削除される旨の警告が表示される', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByText(/看板配置/)).toBeInTheDocument();
    });

    it('警告メッセージにrole="alert"が設定されている', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('確認・キャンセル操作（マウス）', () => {
    it('削除ボタンをクリックするとonConfirmが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除/i }));

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it('キャンセルボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /キャンセル/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('削除ボタンをクリックしてもonCloseは呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除/i }));

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('キーボード操作', () => {
    it('Escapeキーを押すとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('フォーカスされたキャンセルボタンをEnterキーで操作するとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/i })).toHaveFocus();
      });

      await user.keyboard('{Enter}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('Tabキーで削除ボタンへ移動しEnterキーで操作するとonConfirmが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/i })).toHaveFocus();
      });

      await user.tab();
      expect(screen.getByRole('button', { name: /削除/i })).toHaveFocus();

      await user.keyboard('{Enter}');

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    });

    it('フォーカストラップ: 最後の要素からTabで最初の要素に戻る', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AlbumDeleteDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      const deleteButton = screen.getByRole('button', { name: /削除/i });

      await waitFor(() => {
        expect(cancelButton).toHaveFocus();
      });

      await user.tab();
      expect(deleteButton).toHaveFocus();

      await user.tab();
      expect(cancelButton).toHaveFocus();
    });
  });

  describe('フォーカス管理', () => {
    it('ダイアログが開いたとき、キャンセルボタンに初期フォーカスが当たる', async () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/i })).toHaveFocus();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('role="dialog"が設定されている', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria-modal="true"が設定されている', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('aria-labelledbyでタイトルが関連付けられている', () => {
      render(<AlbumDeleteDialog {...defaultProps} />);

      const labelledBy = screen.getByRole('dialog').getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy as string)).toHaveTextContent(/削除/);
    });
  });

  describe('異なるアルバム名での表示', () => {
    it('特殊文字を含むアルバム名が正しく表示される', () => {
      const specialName = 'テスト<script>alert("XSS")</script>名前';
      render(<AlbumDeleteDialog {...defaultProps} albumName={specialName} />);

      expect(
        screen.getByText(
          (content, element) =>
            element?.tagName === 'SPAN' && content.includes('テスト') && content.includes('script')
        )
      ).toBeInTheDocument();
    });
  });
});
