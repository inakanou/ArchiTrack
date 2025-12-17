/**
 * @fileoverview 競合ダイアログコンポーネントのテスト
 *
 * Task 11.1: 楽観的排他制御の競合ダイアログを実装する
 *
 * Requirements:
 * - 1.5: 同時編集による競合が検出される場合、競合エラーを表示して再読み込みを促す
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConflictDialog from '../../../components/common/ConflictDialog';

describe('ConflictDialog', () => {
  const defaultProps = {
    isOpen: true,
    onReload: vi.fn(),
    onClose: vi.fn(),
    resourceName: '現場調査',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 基本レンダリングテスト
  // ===========================================================================

  describe('基本レンダリング', () => {
    it('isOpenがtrueの場合、ダイアログを表示する', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('isOpenがfalseの場合、ダイアログを非表示にする', () => {
      render(<ConflictDialog {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('競合エラーのタイトルを表示する', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByText('編集の競合')).toBeInTheDocument();
    });

    it('リソース名を含む競合メッセージを表示する', () => {
      render(<ConflictDialog {...defaultProps} resourceName="現場調査" />);

      expect(
        screen.getByText(/この現場調査は他のユーザーによって更新されました/)
      ).toBeInTheDocument();
    });

    it('再読み込みを促すメッセージを表示する', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(
        screen.getByText(/最新のデータを読み込んでから再度編集してください/)
      ).toBeInTheDocument();
    });

    it('再読み込みボタンを表示する', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
    });

    it('閉じるボタンを表示する', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // リソース名の表示テスト
  // ===========================================================================

  describe('リソース名の表示', () => {
    it.each([
      ['現場調査', 'この現場調査は他のユーザーによって更新されました'],
      ['プロジェクト', 'このプロジェクトは他のユーザーによって更新されました'],
      ['注釈', 'この注釈は他のユーザーによって更新されました'],
      ['取引先', 'この取引先は他のユーザーによって更新されました'],
    ])('リソース名が「%s」の場合、適切なメッセージを表示する', (resourceName, expectedMessage) => {
      render(<ConflictDialog {...defaultProps} resourceName={resourceName} />);

      expect(screen.getByText(new RegExp(expectedMessage))).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ボタンクリックテスト
  // ===========================================================================

  describe('ボタンクリック', () => {
    it('再読み込みボタンをクリックすると、onReloadコールバックが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '再読み込み' }));

      expect(defaultProps.onReload).toHaveBeenCalledTimes(1);
    });

    it('閉じるボタンをクリックすると、onCloseコールバックが呼ばれる', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: '閉じる' }));

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // ローディング状態テスト
  // ===========================================================================

  describe('ローディング状態', () => {
    it('isReloadingがtrueの場合、再読み込みボタンを無効化する', () => {
      render(<ConflictDialog {...defaultProps} isReloading={true} />);

      expect(screen.getByRole('button', { name: /再読み込み中/ })).toBeDisabled();
    });

    it('isReloadingがtrueの場合、閉じるボタンを無効化する', () => {
      render(<ConflictDialog {...defaultProps} isReloading={true} />);

      expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
    });

    it('isReloadingがtrueの場合、「再読み込み中...」テキストを表示する', () => {
      render(<ConflictDialog {...defaultProps} isReloading={true} />);

      expect(screen.getByRole('button', { name: /再読み込み中/ })).toBeInTheDocument();
    });

    it('isReloadingがtrueの場合、スピナーを表示する', () => {
      render(<ConflictDialog {...defaultProps} isReloading={true} />);

      expect(screen.getByRole('status', { name: 'ローディング中' })).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // キーボード操作テスト
  // ===========================================================================

  describe('キーボード操作', () => {
    it('Escapeキーでダイアログを閉じる（isReloadingがfalseの場合）', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('isReloadingがtrueの場合、Escapeキーでダイアログを閉じない', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} isReloading={true} />);

      await user.keyboard('{Escape}');

      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('Tabキーでフォーカスが循環する', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} />);

      const reloadButton = screen.getByRole('button', { name: '再読み込み' });
      const closeButton = screen.getByRole('button', { name: '閉じる' });

      // 初期フォーカスは再読み込みボタン
      expect(reloadButton).toHaveFocus();

      // 閉じるボタンにフォーカス
      await user.tab();
      expect(closeButton).toHaveFocus();

      // 再び再読み込みボタンにフォーカス（循環）
      await user.tab();
      expect(reloadButton).toHaveFocus();
    });

    it('Enterキーで再読み込みボタンを実行できる', async () => {
      const user = userEvent.setup();
      render(<ConflictDialog {...defaultProps} />);

      const reloadButton = screen.getByRole('button', { name: '再読み込み' });
      reloadButton.focus();

      await user.keyboard('{Enter}');

      expect(defaultProps.onReload).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // アクセシビリティテスト
  // ===========================================================================

  describe('アクセシビリティ', () => {
    it('ダイアログにaria-modal属性がある', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('タイトル要素にid属性がある', () => {
      render(<ConflictDialog {...defaultProps} />);

      const title = screen.getByText('編集の競合');
      expect(title).toHaveAttribute('id');
      expect(title.id).toMatch(/^conflict-dialog-title-/);
    });

    it('説明文要素にid属性がある', () => {
      render(<ConflictDialog {...defaultProps} />);

      const description = screen.getByText(/この現場調査は他のユーザーによって更新されました/);
      expect(description).toHaveAttribute('id');
      expect(description.id).toMatch(/^conflict-dialog-description-/);
    });

    it('警告アイコンにrole="img"とaria-hidden属性がある', () => {
      render(<ConflictDialog {...defaultProps} />);

      const warningIcon = screen.getByTestId('conflict-warning-icon');
      expect(warningIcon).toHaveAttribute('role', 'img');
      expect(warningIcon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  // ===========================================================================
  // スタイリングテスト
  // ===========================================================================

  describe('スタイリング', () => {
    it('警告アイコンが表示される', () => {
      render(<ConflictDialog {...defaultProps} />);

      expect(screen.getByTestId('conflict-warning-icon')).toBeInTheDocument();
    });

    it('再読み込みボタンがプライマリスタイルである', () => {
      render(<ConflictDialog {...defaultProps} />);

      const reloadButton = screen.getByRole('button', { name: '再読み込み' });
      // プライマリボタンは通常青系の背景色を持つ
      expect(reloadButton).toHaveStyle({ backgroundColor: '#1d4ed8' });
    });
  });

  // ===========================================================================
  // 初期フォーカステスト
  // ===========================================================================

  describe('初期フォーカス', () => {
    it('ダイアログが開いたとき、再読み込みボタンにフォーカスが設定される', () => {
      render(<ConflictDialog {...defaultProps} />);

      // FocusManagerにより初期フォーカスが設定される
      // 実際の挙動はFocusManagerの実装に依存
      const reloadButton = screen.getByRole('button', { name: '再読み込み' });
      expect(document.activeElement).toBe(reloadButton);
    });
  });
});
