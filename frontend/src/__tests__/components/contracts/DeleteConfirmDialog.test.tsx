/**
 * @fileoverview 契約書削除確認ダイアログのテスト
 *
 * Task 13.1: DeleteConfirmDialogコンポーネントの作成
 *
 * Requirements (contract-management):
 * - REQ-8.10: 削除ボタン押下時に削除確認ダイアログを表示する
 * - REQ-8.11: 削除確認時に契約書を論理削除する
 * - REQ-12.1: 子契約が存在する場合に削除を拒否する
 * - REQ-12.2: 契約済ステータスの場合に削除を拒否する
 * - REQ-11.9: 削除が 404 を受けたときに見つからない旨を表示する（Task 21.1）
 *
 * @module __tests__/components/contracts/DeleteConfirmDialog.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteConfirmDialog } from '../../../components/contracts/DeleteConfirmDialog';
import * as contractsApi from '../../../api/contracts';
import { ApiError } from '../../../api/client';
import { CONTRACT_NOT_FOUND_MESSAGE } from '../../../utils/contractErrorHandler';

// モック
vi.mock('../../../api/contracts');

// ============================================================================
// テスト
// ============================================================================

describe('DeleteConfirmDialog', () => {
  const defaultProps = {
    contractId: 'contract-1',
    isOpen: true,
    onClose: vi.fn(),
    onDeleteSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // REQ-8.10: 削除確認ダイアログの表示
  // --------------------------------------------------------------------------
  describe('REQ-8.10: 削除確認ダイアログ表示', () => {
    it('isOpenがtrueの場合にダイアログを表示する', () => {
      render(<DeleteConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('この契約書を削除しますか?')).toBeInTheDocument();
    });

    it('isOpenがfalseの場合にダイアログを表示しない', () => {
      render(<DeleteConfirmDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('確認ボタンとキャンセルボタンを表示する', () => {
      render(<DeleteConfirmDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /削除する/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // キャンセル操作
  // --------------------------------------------------------------------------
  describe('キャンセル操作', () => {
    it('キャンセルボタン押下でonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // REQ-8.11: 削除実行
  // --------------------------------------------------------------------------
  describe('REQ-8.11: 削除実行', () => {
    it('確認ボタン押下で削除APIを呼び出す', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockResolvedValue();

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(contractsApi.deleteContract).toHaveBeenCalledWith('contract-1');
      });
    });

    it('削除成功時にonDeleteSuccessが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockResolvedValue();

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(defaultProps.onDeleteSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('削除成功時にonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockResolvedValue();

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 二重送信防止 (isDeletingフラグ)
  // --------------------------------------------------------------------------
  describe('二重送信防止', () => {
    it('削除処理中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      // 削除を保留状態にする
      vi.mocked(contractsApi.deleteContract).mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除中/ })).toBeDisabled();
      });
    });

    it('削除処理中にキャンセルボタンも無効化される', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockImplementation(() => new Promise(() => {}));

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /キャンセル/ })).toBeDisabled();
      });
    });
  });

  // --------------------------------------------------------------------------
  // REQ-12.1, REQ-12.2: 削除制約エラーの表示
  // --------------------------------------------------------------------------
  describe('REQ-12.1, REQ-12.2: 削除制約エラー', () => {
    it('子契約存在エラー（422）のメッセージを表示する', async () => {
      const user = userEvent.setup();
      const errorMessage = 'この契約書は変更契約の基となっているため削除できません';
      vi.mocked(contractsApi.deleteContract).mockRejectedValue(
        new ApiError(422, errorMessage, { message: errorMessage })
      );

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('契約済ステータスエラー（422）のメッセージを表示する', async () => {
      const user = userEvent.setup();
      const errorMessage =
        '契約済の契約書は削除できません。ステータスを契約前に戻してから削除してください';
      vi.mocked(contractsApi.deleteContract).mockRejectedValue(
        new ApiError(422, errorMessage, { message: errorMessage })
      );

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('エラー表示後もキャンセルボタンで閉じられる', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockRejectedValue(
        new ApiError(422, 'エラー', { message: 'エラー' })
      );

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByText('エラー')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('一般エラー時にデフォルトメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(contractsApi.deleteContract).mockRejectedValue(new Error('Network error'));

      render(<DeleteConfirmDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /削除する/ }));

      await waitFor(() => {
        expect(screen.getByText('削除に失敗しました')).toBeInTheDocument();
      });
    });
  });
});

// --------------------------------------------------------------------------
// REQ-11.9: 削除の操作が 404 を受けたとき（Task 21.1）
// --------------------------------------------------------------------------
describe('DeleteConfirmDialog の 404（REQ-11.9）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('削除が 404 を受けると契約書が見つからない旨を表示し、削除の失敗の汎用の文言を出さない', async () => {
    const user = userEvent.setup();
    const onDeleteError = vi.fn();
    const onDeleteSuccess = vi.fn();
    vi.mocked(contractsApi.deleteContract).mockRejectedValue(
      new ApiError(404, 'Not found', { status: 404, code: 'NOT_FOUND' })
    );

    render(
      <DeleteConfirmDialog
        contractId="contract-1"
        isOpen
        onClose={vi.fn()}
        onDeleteSuccess={onDeleteSuccess}
        onDeleteError={onDeleteError}
      />
    );

    await user.click(screen.getByRole('button', { name: /削除する/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(CONTRACT_NOT_FOUND_MESSAGE);
    });
    expect(screen.queryByText('削除に失敗しました')).not.toBeInTheDocument();
    expect(onDeleteError).toHaveBeenCalledWith(CONTRACT_NOT_FOUND_MESSAGE);
    expect(onDeleteSuccess).not.toHaveBeenCalled();
  });
});
