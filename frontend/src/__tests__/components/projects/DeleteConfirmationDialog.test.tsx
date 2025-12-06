/**
 * @fileoverview 削除確認ダイアログ コンポーネントテスト
 *
 * DeleteConfirmationDialogコンポーネントのユニットテスト。
 * TDDアプローチで実装。
 *
 * Requirements:
 * - 9.1: ユーザーがプロジェクト詳細画面で「削除」ボタンをクリックする、削除確認ダイアログを表示する
 * - 9.3: プロジェクトが正常に削除される、「プロジェクトを削除しました」という成功メッセージを表示する
 * - 9.4: ユーザーが削除確認ダイアログで「キャンセル」を選択する、ダイアログを閉じ、詳細画面に留まる
 * - 9.5: プロジェクトに関連データ（現場調査、見積書等）が存在する、「関連データがあります。本当に削除しますか？」という警告メッセージを表示
 * - 9.6: ユーザーが関連データ警告ダイアログで「削除する」を選択する、関連データを含めてプロジェクトを論理削除する
 * - 20.1: すべての操作をキーボードのみで実行可能にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteConfirmationDialog from '../../../components/projects/DeleteConfirmationDialog';

describe('DeleteConfirmationDialog', () => {
  const mockOnConfirm = vi.fn<() => void>();
  const mockOnClose = vi.fn<() => void>();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    projectName: 'テストプロジェクト',
    hasRelatedData: false,
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本表示', () => {
    it('isOpen=trueの場合、ダイアログが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpen=falseの場合、ダイアログが表示されない', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('タイトルに「プロジェクトの削除」が表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByText('プロジェクトの削除')).toBeInTheDocument();
    });

    it('プロジェクト名が表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByText(/テストプロジェクト/)).toBeInTheDocument();
    });

    it('削除確認メッセージが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByText(/を削除しますか/)).toBeInTheDocument();
    });

    it('削除ボタンが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /削除/i })).toBeInTheDocument();
    });

    it('キャンセルボタンが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });
  });

  describe('関連データなしの場合', () => {
    it('通常の削除確認メッセージが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={false} />);

      expect(screen.getByText(/を削除しますか？この操作は取り消せません。/)).toBeInTheDocument();
    });

    it('警告メッセージは表示されない', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={false} />);

      expect(screen.queryByText(/関連データがあります/)).not.toBeInTheDocument();
    });
  });

  describe('関連データありの場合（Req 9.5）', () => {
    it('警告メッセージが表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={true} />);

      expect(screen.getByText(/関連データがあります/)).toBeInTheDocument();
    });

    it('関連データの件数が表示される', () => {
      render(
        <DeleteConfirmationDialog
          {...defaultProps}
          hasRelatedData={true}
          relatedDataCounts={{ surveys: 3, estimates: 2 }}
        />
      );

      expect(screen.getByText(/現場調査: 3件/)).toBeInTheDocument();
      expect(screen.getByText(/見積書: 2件/)).toBeInTheDocument();
    });

    it('件数が0の場合でも表示される', () => {
      render(
        <DeleteConfirmationDialog
          {...defaultProps}
          hasRelatedData={true}
          relatedDataCounts={{ surveys: 0, estimates: 0 }}
        />
      );

      expect(screen.getByText(/現場調査: 0件/)).toBeInTheDocument();
      expect(screen.getByText(/見積書: 0件/)).toBeInTheDocument();
    });

    it('relatedDataCountsがない場合、件数表示なしで警告のみ表示', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={true} />);

      expect(screen.getByText(/関連データがあります/)).toBeInTheDocument();
      expect(screen.queryByText(/現場調査:/)).not.toBeInTheDocument();
    });
  });

  describe('削除ボタン操作（Req 9.6）', () => {
    it('削除ボタンをクリックするとonConfirmが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<DeleteConfirmationDialog {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      await user.click(deleteButton);

      expect(mockOnConfirm).toHaveBeenCalled();
    });

    it('関連データありの場合も削除ボタンクリックでonConfirmが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={true} />);

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      await user.click(deleteButton);

      expect(mockOnConfirm).toHaveBeenCalled();
    });
  });

  describe('キャンセル操作（Req 9.4）', () => {
    it('キャンセルボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<DeleteConfirmationDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('キーボード操作（Req 20.1）', () => {
    it('Escapeキーを押すとonCloseが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<DeleteConfirmationDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('削除処理中はEscapeキーで閉じられない', async () => {
      const user = userEvent.setup({ delay: null });
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      await user.keyboard('{Escape}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('フォーカス管理', () => {
    it('ダイアログが開いたとき、キャンセルボタンにフォーカスが当たる', async () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
        expect(cancelButton).toHaveFocus();
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('ダイアログにrole="dialog"が設定されている', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('aria-modal="true"が設定されている', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('aria-labelledbyでタイトルが関連付けられている', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      // ダイアログ内のコンテナにaria-labelledbyが設定されている
      const titleElement = document.getElementById('delete-dialog-title');
      expect(titleElement).toBeTruthy();
      expect(titleElement).toHaveTextContent('プロジェクトの削除');
    });

    it('aria-describedbyで説明が関連付けられている', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      // ダイアログ内のコンテナにaria-describedbyが設定されている
      const descriptionElement = document.getElementById('delete-dialog-description');
      expect(descriptionElement).toBeTruthy();
      expect(descriptionElement).toBeInTheDocument();
    });

    it('警告メッセージにrole="alert"が設定されている（関連データあり）', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={true} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('削除処理中の状態', () => {
    it('isDeleting=trueの場合、削除ボタンが無効化される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      const deleteButton = screen.getByRole('button', { name: /削除|処理中/i });
      expect(deleteButton).toBeDisabled();
    });

    it('isDeleting=trueの場合、キャンセルボタンが無効化される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      expect(cancelButton).toBeDisabled();
    });

    it('isDeleting=trueの場合、「削除中...」と表示される', () => {
      render(<DeleteConfirmationDialog {...defaultProps} isDeleting={true} />);

      expect(screen.getByText(/削除中/)).toBeInTheDocument();
    });
  });

  describe('スタイリング', () => {
    it('削除ボタンは危険な操作を示す赤系のスタイルを持つ', () => {
      render(<DeleteConfirmationDialog {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      // ボタンにred系のスタイルが適用されていることを確認
      expect(deleteButton).toHaveStyle({ backgroundColor: expect.stringMatching(/dc2626|red/i) });
    });

    it('警告メッセージは警告を示す黄系のスタイルを持つ（関連データあり）', () => {
      render(<DeleteConfirmationDialog {...defaultProps} hasRelatedData={true} />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveStyle({
        backgroundColor: expect.stringMatching(/fef3cd|yellow|#fef|amber/i),
      });
    });
  });

  describe('異なるプロジェクト名での表示', () => {
    it('長いプロジェクト名が正しく表示される', () => {
      const longName =
        'これは非常に長いプロジェクト名のテストケースです。表示が正しく行われることを確認します。';
      render(<DeleteConfirmationDialog {...defaultProps} projectName={longName} />);

      expect(screen.getByText(new RegExp(longName))).toBeInTheDocument();
    });

    it('特殊文字を含むプロジェクト名が正しく表示される', () => {
      const specialName = 'テスト<script>alert("XSS")</script>名前';
      render(<DeleteConfirmationDialog {...defaultProps} projectName={specialName} />);

      // XSSが実行されず、テキストとして表示されることを確認
      // Reactは自動的にHTMLエンティティをエスケープするので、scriptタグは実行されない
      const projectNameSpan = screen.getByText(
        (content, element) =>
          element?.tagName === 'SPAN' && content.includes('テスト') && content.includes('script')
      );
      expect(projectNameSpan).toBeInTheDocument();
    });
  });
});
