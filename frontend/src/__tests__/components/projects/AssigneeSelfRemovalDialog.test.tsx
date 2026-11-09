/**
 * @fileoverview 自分が外れるときの確認ダイアログのテスト
 *
 * Requirements (project-management):
 * - 45.1: 保存の前に逐語の文言で確かめ、「保存する」「キャンセル」を選ばせる
 * - 45.2: 「キャンセル」で閉じ、保存しない
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssigneeSelfRemovalDialog from '../../../components/projects/AssigneeSelfRemovalDialog';

// 45.1 の逐語
const MESSAGE =
  'この変更を保存すると、あなたはこのプロジェクトを閲覧できなくなります。保存しますか？';

describe('AssigneeSelfRemovalDialog', () => {
  const onConfirm = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();

  const defaultProps = {
    isOpen: true,
    isSaving: false,
    onConfirm,
    onCancel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('表示（Req 45.1）', () => {
    it('isOpen=true のとき、ダイアログが出る', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpen=false のとき、ダイアログは出ない', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('45.1 の逐語の文言が出る', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    });

    it('「保存する」と「キャンセル」の二つのボタンが出る', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: '保存する' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });
  });

  describe('ボタンの操作（Req 45.1, 45.2）', () => {
    it('「保存する」を押すと onConfirm だけが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '保存する' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('「キャンセル」を押すと onCancel だけが呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('Escape キーで onCancel が呼ばれる', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('外側をクリックしても閉じない', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      await user.click(document.body);

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('保存中', () => {
    it('二つのボタンが押せなくなり、「保存中...」と出る', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} isSaving={true} />);

      expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });

    it('Escape キーで閉じない', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} isSaving={true} />);

      await user.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('フォーカスとアクセシビリティ', () => {
    it('開いたとき、キャンセルのボタンにフォーカスが当たる', async () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
      });
    });

    it('Tab でフォーカスがダイアログの中を回る', async () => {
      const user = userEvent.setup({ delay: null });
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);
      const cancel = screen.getByRole('button', { name: 'キャンセル' });
      const confirm = screen.getByRole('button', { name: '保存する' });
      await waitFor(() => expect(cancel).toHaveFocus());

      await user.tab();
      expect(confirm).toHaveFocus();
      await user.tab();
      expect(cancel).toHaveFocus();
    });

    it('aria-modal と、題と文言の関連づけを持つ', () => {
      render(<AssigneeSelfRemovalDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const titleId = dialog.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();
      expect(document.getElementById(titleId as string)).toBeInTheDocument();
      expect(screen.getByText(MESSAGE)).toHaveAttribute(
        'id',
        'assignee-self-removal-dialog-description'
      );
    });
  });
});
