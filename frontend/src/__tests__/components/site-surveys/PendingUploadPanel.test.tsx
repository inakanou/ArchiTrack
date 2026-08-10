/**
 * @fileoverview PendingUploadPanel コンポーネントテスト
 *
 * Task 106.2: 未送信画像の一覧表示と再送・破棄の操作面を実装する
 *
 * TDDに従い、実装前にテストを作成
 *
 * Requirements:
 * - 37.2: 未送信画像の件数と、各画像のサムネイル・ファイル名・失敗理由を表示する
 * - 37.3: 再送可能な画像をまとめて再送する操作手段を提供する
 * - 37.7: 保持中の画像を破棄する操作手段を提供する
 * - 37.10: 処理中は追加の再送操作を受け付けない
 * - 37.16: 再送不可の画像に再送しても解消しない旨とその理由を提示する
 * - 37.17: 再送不可の画像を再送の対象に含めない
 * - 37.18: 保持中の画像が全て再送不可なら再送手段を実行不可の状態で提示する
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingUploadPanel, {
  type PendingUploadPanelProps,
} from '../../../components/site-surveys/PendingUploadPanel';
import type { PendingUpload, UploadFailureKind } from '../../../types/upload.types';

// ============================================================================
// モックとヘルパー
// ============================================================================

/**
 * 保持中の未送信画像を1件組み立てる
 */
function createPendingUpload(
  name: string,
  error: string,
  kind: UploadFailureKind = 'retriable'
): PendingUpload {
  const file = new File(['dummy-image-body'], name, { type: 'image/jpeg' });
  return {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    file,
    error,
    kind,
    previewUrl: `blob:mock-preview/${name}`,
  };
}

/**
 * 既定の props に上書きを適用してレンダリングする
 */
function renderPanel(overrides: Partial<PendingUploadPanelProps> = {}) {
  const onRetry = vi.fn();
  const onDiscardAll = vi.fn();
  const props: PendingUploadPanelProps = {
    pending: [createPendingUpload('site-a.jpg', 'ネットワークエラーが発生しました')],
    canRetry: true,
    isBusy: false,
    onRetry,
    onDiscardAll,
    ...overrides,
  };
  const result = render(<PendingUploadPanel {...props} />);
  return { ...result, onRetry, onDiscardAll, props };
}

// ============================================================================
// コンポーネントテスト
// ============================================================================

describe('PendingUploadPanel', () => {
  describe('表示（Requirement 37.2）', () => {
    it('未送信画像の件数を表示する', () => {
      renderPanel({
        pending: [
          createPendingUpload('site-a.jpg', 'ネットワークエラーが発生しました'),
          createPendingUpload('site-b.jpg', 'サーバーエラーが発生しました'),
          createPendingUpload('site-c.jpg', 'サーバーエラーが発生しました'),
        ],
      });

      expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('3');
    });

    it('各項目にサムネイル・ファイル名・失敗理由を表示する', () => {
      renderPanel({
        pending: [
          createPendingUpload('site-a.jpg', 'ネットワークエラーが発生しました'),
          createPendingUpload('site-b.jpg', 'サーバーエラーが発生しました'),
        ],
      });

      const items = screen.getAllByTestId('pending-upload-item');
      expect(items).toHaveLength(2);

      const thumbnails = screen.getAllByTestId('pending-upload-thumbnail');
      expect(thumbnails).toHaveLength(2);
      expect(thumbnails[0]).toHaveAttribute('src', 'blob:mock-preview/site-a.jpg');
      expect(thumbnails[1]).toHaveAttribute('src', 'blob:mock-preview/site-b.jpg');

      const fileNames = screen.getAllByTestId('pending-upload-filename');
      expect(fileNames[0]).toHaveTextContent('site-a.jpg');
      expect(fileNames[1]).toHaveTextContent('site-b.jpg');

      const reasons = screen.getAllByTestId('pending-upload-reason');
      expect(reasons[0]).toHaveTextContent('ネットワークエラーが発生しました');
      expect(reasons[1]).toHaveTextContent('サーバーエラーが発生しました');
    });

    it('保持中の画像が無い場合は何も描画しない', () => {
      const { container } = renderPanel({ pending: [] });

      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
    });
  });

  /**
   * @requirement site-survey/REQ-37.17: 再送不可の画像は再送対象外である旨を提示し破棄のみ提供する
   */
  describe('再送不可の区別（Requirement 37.16, 37.17）', () => {
    it('再送不可の項目に再送しても解消しない旨とその理由を併記する', () => {
      renderPanel({
        pending: [
          createPendingUpload('too-large.jpg', 'ファイルサイズが上限を超えています', 'permanent'),
        ],
        canRetry: false,
      });

      const note = screen.getByTestId('pending-upload-permanent-note');
      expect(note).toHaveTextContent('再送しても解消しません');
      expect(note).toHaveTextContent('ファイルサイズが上限を超えています');
    });

    it('再送不可の項目に再送対象から除外されている旨を表示する', () => {
      renderPanel({
        pending: [createPendingUpload('bad-format.gif', '対応していない画像形式です', 'permanent')],
        canRetry: false,
      });

      expect(screen.getByTestId('pending-upload-permanent-note')).toHaveTextContent(
        '再送の対象から除外'
      );
    });

    it('再送可能な項目には再送不可の注記を表示しない', () => {
      renderPanel({
        pending: [createPendingUpload('site-a.jpg', 'ネットワークエラーが発生しました')],
      });

      expect(screen.queryByTestId('pending-upload-permanent-note')).not.toBeInTheDocument();
    });
  });

  describe('再送・破棄の操作（Requirement 37.3, 37.7）', () => {
    it('再送ボタンの押下で onRetry を呼び出す', async () => {
      const user = userEvent.setup();
      const { onRetry } = renderPanel();

      await user.click(screen.getByTestId('pending-upload-retry-button'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('破棄ボタンの押下で onDiscardAll を呼び出す', async () => {
      const user = userEvent.setup();
      const { onDiscardAll } = renderPanel();

      await user.click(screen.getByTestId('pending-upload-discard-button'));

      expect(onDiscardAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('再送可否の提示（Requirement 37.18）', () => {
    it('canRetry が false のとき再送ボタンを実行不可の状態で提示する', () => {
      renderPanel({
        pending: [
          createPendingUpload('too-large.jpg', 'ファイルサイズが上限を超えています', 'permanent'),
        ],
        canRetry: false,
      });

      const retryButton = screen.getByTestId('pending-upload-retry-button');
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).toBeDisabled();
    });

    it('canRetry が false でも破棄ボタンは操作できる', async () => {
      const user = userEvent.setup();
      const { onDiscardAll } = renderPanel({
        pending: [
          createPendingUpload('too-large.jpg', 'ファイルサイズが上限を超えています', 'permanent'),
        ],
        canRetry: false,
      });

      const discardButton = screen.getByTestId('pending-upload-discard-button');
      expect(discardButton).toBeEnabled();

      await user.click(discardButton);
      expect(onDiscardAll).toHaveBeenCalledTimes(1);
    });

    it('canRetry が false のとき再送不可の理由を再送ボタン付近に示す', () => {
      renderPanel({
        pending: [
          createPendingUpload('too-large.jpg', 'ファイルサイズが上限を超えています', 'permanent'),
        ],
        canRetry: false,
      });

      expect(screen.getByTestId('pending-upload-retry-unavailable')).toBeInTheDocument();
    });

    it('canRetry が true のとき再送ボタンを操作できる', () => {
      renderPanel({ canRetry: true });

      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();
    });
  });

  /**
   * @requirement site-survey/REQ-37.10: 処理の実行中は追加の再送操作を受け付けない
   */
  describe('処理中の操作抑止（Requirement 37.10）', () => {
    it('isBusy が true のとき再送ボタンを操作できない', async () => {
      const user = userEvent.setup();
      const { onRetry } = renderPanel({ isBusy: true });

      const retryButton = screen.getByTestId('pending-upload-retry-button');
      expect(retryButton).toBeDisabled();

      await user.click(retryButton);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('isBusy が true のとき破棄ボタンを操作できない', async () => {
      const user = userEvent.setup();
      const { onDiscardAll } = renderPanel({ isBusy: true });

      const discardButton = screen.getByTestId('pending-upload-discard-button');
      expect(discardButton).toBeDisabled();

      await user.click(discardButton);
      expect(onDiscardAll).not.toHaveBeenCalled();
    });
  });

  describe('アクセシビリティ', () => {
    it('コンテナの読み上げ役割を status とし、エラー表示の alert と競合させない', () => {
      renderPanel();

      const panel = screen.getByTestId('pending-upload-panel');
      expect(panel).toHaveAttribute('role', 'status');
      expect(panel).not.toHaveAttribute('role', 'alert');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('操作要素のタップ領域を44x44論理ピクセル以上とする', () => {
      renderPanel();

      const buttons = [
        screen.getByTestId('pending-upload-retry-button'),
        screen.getByTestId('pending-upload-discard-button'),
      ];

      buttons.forEach((button) => {
        expect(parseFloat(button.style.minWidth)).toBeGreaterThanOrEqual(44);
        expect(parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
      });
    });

    it('サムネイルに画像を識別できる代替テキストを付与する', () => {
      renderPanel({
        pending: [createPendingUpload('site-a.jpg', 'ネットワークエラーが発生しました')],
      });

      expect(screen.getByAltText(/site-a\.jpg/)).toBeInTheDocument();
    });
  });
});
