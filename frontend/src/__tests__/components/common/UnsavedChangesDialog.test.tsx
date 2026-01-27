/**
 * @fileoverview UnsavedChangesDialogコンポーネントのユニットテスト
 *
 * Task 6.5: 未保存確認ダイアログの実装
 *
 * テスト対象:
 * - ダイアログの表示/非表示
 * - 「ページを離れる」ボタンの動作
 * - 「このページにとどまる」ボタンの動作
 * - アクセシビリティ対応
 *
 * Requirements:
 * - 3.4: フォームに未保存の変更がある状態でページを離れようとしたとき、
 *        「変更が保存されていません。ページを離れますか？」という確認ダイアログを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnsavedChangesDialog from '../../../components/common/UnsavedChangesDialog';

describe('UnsavedChangesDialog', () => {
  const mockOnLeave = vi.fn();
  const mockOnStay = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 表示/非表示テスト
  // ============================================================================
  describe('表示/非表示', () => {
    it('isOpen=trueの場合、ダイアログが表示される', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('変更が保存されていません')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、ダイアログが表示されない', () => {
      render(<UnsavedChangesDialog isOpen={false} onLeave={mockOnLeave} onStay={mockOnStay} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('確認メッセージが正しく表示される（Requirement 3.4）', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      expect(
        screen.getByText('変更が保存されていません。ページを離れますか？')
      ).toBeInTheDocument();
    });
  });

  // ============================================================================
  // ボタン動作テスト
  // ============================================================================
  describe('ボタン動作', () => {
    it('「ページを離れる」ボタンをクリックするとonLeaveが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      const leaveButton = screen.getByRole('button', { name: /ページを離れる/ });
      await user.click(leaveButton);

      expect(mockOnLeave).toHaveBeenCalledTimes(1);
    });

    it('「このページにとどまる」ボタンをクリックするとonStayが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      const stayButton = screen.getByRole('button', { name: /このページにとどまる/ });
      await user.click(stayButton);

      expect(mockOnStay).toHaveBeenCalledTimes(1);
    });

    it('両方のボタンが表示される', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      expect(screen.getByRole('button', { name: /ページを離れる/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /このページにとどまる/ })).toBeInTheDocument();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================
  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定されている（FocusManager経由）', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      // FocusManagerがrole="dialog"を提供する
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('ダイアログにaria-labelledbyが設定されている', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('タイトル要素が存在しaria-labelledbyで参照されている', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      const dialog = screen.getByRole('dialog');
      const titleId = dialog.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();

      // タイトル要素が存在することを確認
      const titleElement = document.getElementById(titleId!);
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveTextContent('変更が保存されていません');
    });

    it('aria-modal="true"が設定されている（FocusManager経由）', () => {
      render(<UnsavedChangesDialog isOpen={true} onLeave={mockOnLeave} onStay={mockOnStay} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });
});
