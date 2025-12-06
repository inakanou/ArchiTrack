/**
 * @fileoverview 差し戻し理由入力ダイアログ コンポーネントテスト
 *
 * BackwardReasonDialogコンポーネントのユニットテスト。
 * TDDアプローチで実装。
 *
 * Requirements:
 * - 10.14: 差し戻し遷移時は差し戻し理由の入力を必須とする
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackwardReasonDialog from '../../../components/projects/BackwardReasonDialog';
import type { ProjectStatus } from '../../../types/project.types';

describe('BackwardReasonDialog', () => {
  const mockOnConfirm = vi.fn<(reason: string) => void>();
  const mockOnCancel = vi.fn<() => void>();

  const defaultProps = {
    isOpen: true,
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
    fromStatus: 'SURVEYING' as ProjectStatus,
    toStatus: 'PREPARING' as ProjectStatus,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('isOpen=trueの場合、ダイアログが表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、ダイアログが表示されない', () => {
      render(<BackwardReasonDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('タイトルに「差し戻し理由の入力」が表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      expect(screen.getByText('差し戻し理由の入力')).toBeInTheDocument();
    });

    it('遷移元と遷移先のステータスが表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      // 調査中 から 準備中 への差し戻し
      expect(screen.getByText(/調査中/)).toBeInTheDocument();
      expect(screen.getByText(/準備中/)).toBeInTheDocument();
    });

    it('理由入力テキストエリアが表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      expect(textarea).toBeInTheDocument();
    });

    it('確認ボタンが表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /確認|差し戻す/i })).toBeInTheDocument();
    });

    it('キャンセルボタンが表示される', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });
  });

  describe('フォーム入力', () => {
    it('理由テキストを入力できる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, 'テスト理由');

      expect(textarea).toHaveValue('テスト理由');
    });

    it('入力した理由で確認ボタンをクリックするとonConfirmが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, '修正が必要なため差し戻し');

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      expect(mockOnConfirm).toHaveBeenCalledWith('修正が必要なため差し戻し');
    });
  });

  describe('バリデーション', () => {
    it('理由が空の場合、確認ボタンをクリックしてもonConfirmが呼ばれない', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('理由が空の場合、エラーメッセージが表示される', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      expect(screen.getByText(/差し戻し理由は必須です/)).toBeInTheDocument();
    });

    it('空白文字のみの場合、エラーメッセージが表示される', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, '   ');

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      expect(screen.getByText(/差し戻し理由は必須です/)).toBeInTheDocument();
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('理由を入力後、エラーメッセージが消える', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      // まず確認ボタンをクリックしてエラーを表示
      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      expect(screen.getByText(/差し戻し理由は必須です/)).toBeInTheDocument();

      // 理由を入力
      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, 'テスト理由');

      // エラーメッセージが消える
      await waitFor(() => {
        expect(screen.queryByText(/差し戻し理由は必須です/)).not.toBeInTheDocument();
      });
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('キーボード操作', () => {
    it('Escapeキーを押すとonCancelが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('テキストエリアでEnterキーを押しても送信されない（複数行入力対応）', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, '理由{enter}改行');

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(textarea).toHaveValue('理由\n改行');
    });
  });

  describe('フォーカス管理', () => {
    it('ダイアログが開いたとき、テキストエリアにフォーカスが当たる', async () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      await waitFor(() => {
        const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
        expect(textarea).toHaveFocus();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria-modal="true"が設定されている', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('テキストエリアにaria-label属性が設定されている', () => {
      render(<BackwardReasonDialog {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      expect(textarea).toHaveAttribute('aria-label');
    });

    it('エラーメッセージにaria-live="polite"が設定されている', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      const errorMessage = screen.getByText(/差し戻し理由は必須です/);
      expect(errorMessage).toHaveAttribute('aria-live', 'polite');
    });

    it('aria-describedbyでエラーメッセージが関連付けられている', async () => {
      const user = userEvent.setup({ delay: null });
      render(<BackwardReasonDialog {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す/i });
      await user.click(confirmButton);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      const errorMessage = screen.getByText(/差し戻し理由は必須です/);
      const errorId = errorMessage.getAttribute('id');

      expect(textarea).toHaveAttribute('aria-describedby', errorId);
    });
  });

  describe('ダイアログリセット', () => {
    it('キャンセル後に再度開くと、入力内容がリセットされる', async () => {
      const user = userEvent.setup({ delay: null });
      const mockOnCancel = vi.fn();
      const { rerender } = render(
        <BackwardReasonDialog {...defaultProps} onCancel={mockOnCancel} />
      );

      // 理由を入力
      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      await user.type(textarea, 'テスト理由');

      // キャンセルボタンをクリック（stateがリセットされる）
      await user.click(screen.getByRole('button', { name: /キャンセル/i }));
      expect(mockOnCancel).toHaveBeenCalled();

      // ダイアログを閉じる
      rerender(<BackwardReasonDialog {...defaultProps} onCancel={mockOnCancel} isOpen={false} />);

      // ダイアログを再度開く
      rerender(<BackwardReasonDialog {...defaultProps} onCancel={mockOnCancel} isOpen={true} />);

      // 入力内容がリセットされている
      const newTextarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      expect(newTextarea).toHaveValue('');
    });
  });

  describe('異なるステータスでの表示', () => {
    it('見積中から調査中への差し戻しが正しく表示される', () => {
      render(
        <BackwardReasonDialog {...defaultProps} fromStatus="ESTIMATING" toStatus="SURVEYING" />
      );

      expect(screen.getByText(/見積中/)).toBeInTheDocument();
      expect(screen.getByText(/調査中/)).toBeInTheDocument();
    });

    it('工事中から契約中への差し戻しが正しく表示される', () => {
      render(
        <BackwardReasonDialog {...defaultProps} fromStatus="CONSTRUCTING" toStatus="CONTRACTING" />
      );

      expect(screen.getByText(/工事中/)).toBeInTheDocument();
      expect(screen.getByText(/契約中/)).toBeInTheDocument();
    });
  });

  describe('送信中の状態', () => {
    it('isSubmitting=trueの場合、確認ボタンが無効化される', () => {
      render(<BackwardReasonDialog {...defaultProps} isSubmitting={true} />);

      const confirmButton = screen.getByRole('button', { name: /確認|差し戻す|処理中/i });
      expect(confirmButton).toBeDisabled();
    });

    it('isSubmitting=trueの場合、キャンセルボタンが無効化される', () => {
      render(<BackwardReasonDialog {...defaultProps} isSubmitting={true} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      expect(cancelButton).toBeDisabled();
    });

    it('isSubmitting=trueの場合、テキストエリアが無効化される', () => {
      render(<BackwardReasonDialog {...defaultProps} isSubmitting={true} />);

      const textarea = screen.getByRole('textbox', { name: /差し戻し理由/i });
      expect(textarea).toBeDisabled();
    });
  });
});
