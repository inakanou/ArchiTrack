/**
 * @fileoverview TradingPartnerDeleteDialog コンポーネントのテスト
 *
 * Task 10.2: 削除確認ダイアログの実装
 *
 * Requirements:
 * - 5.1: ユーザーが削除ボタンをクリックしたとき、削除確認ダイアログを表示する
 * - 5.2: ユーザーが削除を確認したとき、取引先レコードを論理削除する
 * - 5.3: ユーザーが削除確認ダイアログでキャンセルをクリックしたとき、ダイアログを閉じ、削除処理を中止する
 * - 5.4: 削除に成功したとき、成功メッセージを表示し、取引先一覧ページに遷移する
 * - 5.5: 取引先がプロジェクトに紐付いている場合、削除を拒否しエラーメッセージを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradingPartnerDeleteDialog from '../../../components/trading-partners/TradingPartnerDeleteDialog';

// ============================================================================
// テストデータ
// ============================================================================

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  partnerName: 'テスト株式会社',
  isDeleting: false,
  error: null as string | null,
};

// ============================================================================
// テスト
// ============================================================================

describe('TradingPartnerDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 5.1: 削除確認ダイアログの表示
  // ==========================================================================

  describe('削除確認ダイアログの表示（Requirements 5.1）', () => {
    it('isOpenがtrueの場合、ダイアログを表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpenがfalseの場合、ダイアログを表示しない', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('取引先名を含む確認メッセージを表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByText('テスト株式会社')).toBeInTheDocument();
      expect(screen.getByText(/を削除しますか？/)).toBeInTheDocument();
    });

    it('ダイアログにタイトルを表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('heading', { name: /取引先の削除/ })).toBeInTheDocument();
    });

    it('削除は取り消せない旨の警告を表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByText(/この操作は取り消せません/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 5.2: 削除確認ボタン
  // ==========================================================================

  describe('削除確認ボタン（Requirements 5.2）', () => {
    it('削除ボタンを表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('削除ボタンクリック時にonConfirmコールバックを呼び出す', async () => {
      const user = userEvent.setup();
      const handleConfirm = vi.fn();

      render(<TradingPartnerDeleteDialog {...defaultProps} onConfirm={handleConfirm} />);

      const deleteButton = screen.getByRole('button', { name: '削除' });
      await user.click(deleteButton);

      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it('isDeletingがtrueの場合、削除ボタンが無効化され「削除中...」と表示される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} isDeleting={true} />);

      const deleteButton = screen.getByRole('button', { name: '削除中...' });
      expect(deleteButton).toBeDisabled();
    });
  });

  // ==========================================================================
  // 5.3: キャンセルボタン
  // ==========================================================================

  describe('キャンセルボタン（Requirements 5.3）', () => {
    it('キャンセルボタンを表示する', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
    });

    it('キャンセルボタンクリック時にonCloseコールバックを呼び出す', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(<TradingPartnerDeleteDialog {...defaultProps} onClose={handleClose} />);

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('isDeletingがtrueの場合、キャンセルボタンが無効化される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} isDeleting={true} />);

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      expect(cancelButton).toBeDisabled();
    });

    it('Escapeキーでダイアログを閉じられる', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(<TradingPartnerDeleteDialog {...defaultProps} onClose={handleClose} />);

      await user.keyboard('{Escape}');

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('isDeletingがtrueの場合、Escapeキーでダイアログを閉じられない', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <TradingPartnerDeleteDialog {...defaultProps} onClose={handleClose} isDeleting={true} />
      );

      await user.keyboard('{Escape}');

      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 5.5: プロジェクト紐付けエラーの表示
  // ==========================================================================

  describe('プロジェクト紐付けエラーの表示（Requirements 5.5）', () => {
    it('errorがnullの場合、エラーメッセージを表示しない', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} error={null} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('errorがある場合、エラーメッセージを表示する', () => {
      render(
        <TradingPartnerDeleteDialog
          {...defaultProps}
          error="この取引先は現在プロジェクトに使用されているため削除できません"
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(
        screen.getByText('この取引先は現在プロジェクトに使用されているため削除できません')
      ).toBeInTheDocument();
    });

    it('プロジェクト紐付けエラーの場合、警告スタイルで表示する', () => {
      render(
        <TradingPartnerDeleteDialog
          {...defaultProps}
          error="この取引先は現在プロジェクトに使用されているため削除できません"
        />
      );

      const alertElement = screen.getByRole('alert');
      expect(alertElement).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('ダイアログにaria-modal="true"が設定される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('ダイアログコンテンツにaria-labelledbyが設定される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      // FocusManagerの内部でdialog roleが設定され、その子要素にaria-labelledbyが設定される
      const dialog = screen.getByRole('dialog');
      const contentContainer = dialog.querySelector('[aria-labelledby]');
      expect(contentContainer).toBeInTheDocument();

      const titleId = contentContainer?.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();
      const title = document.getElementById(titleId!);
      expect(title).toBeInTheDocument();
    });

    it('ダイアログコンテンツにaria-describedbyが設定される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      // FocusManagerの内部でdialog roleが設定され、その子要素にaria-describedbyが設定される
      const dialog = screen.getByRole('dialog');
      const contentContainer = dialog.querySelector('[aria-describedby]');
      expect(contentContainer).toBeInTheDocument();

      const descId = contentContainer?.getAttribute('aria-describedby');
      expect(descId).toBeTruthy();
      const desc = document.getElementById(descId!);
      expect(desc).toBeInTheDocument();
    });

    it('キャンセルボタンに初期フォーカスが設定される', async () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      });
    });
  });

  // ==========================================================================
  // フォーカストラップ
  // ==========================================================================

  describe('フォーカストラップ', () => {
    it('Tabキーでダイアログ内のボタン間を循環する', async () => {
      const user = userEvent.setup();

      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      // 初期フォーカスはキャンセルボタン
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      });

      // Tabで削除ボタンへ
      await user.tab();
      expect(screen.getByRole('button', { name: '削除' })).toHaveFocus();

      // Tabでキャンセルボタンへ戻る（循環）
      await user.tab();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
    });

    it('Shift+Tabで逆方向に循環する', async () => {
      const user = userEvent.setup();

      render(<TradingPartnerDeleteDialog {...defaultProps} />);

      // 初期フォーカスはキャンセルボタン
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      });

      // Shift+Tabで削除ボタンへ（逆循環）
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: '削除' })).toHaveFocus();
    });
  });

  // ==========================================================================
  // 削除処理中の状態
  // ==========================================================================

  describe('削除処理中の状態', () => {
    it('isDeletingがtrueの場合、両方のボタンが無効化される', () => {
      render(<TradingPartnerDeleteDialog {...defaultProps} isDeleting={true} />);

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '削除中...' })).toBeDisabled();
    });
  });
});
