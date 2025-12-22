/**
 * ImageExportDialogコンポーネントのテスト
 *
 * Task 29.1: 個別画像エクスポートダイアログのテスト
 * - エクスポート形式選択UI（JPEG/PNG）
 * - 品質（解像度）選択UI（低/中/高の3段階）
 * - 注釈あり/なし選択オプション
 * - エクスポート実行ボタンとキャンセルボタン
 *
 * @see requirements.md - 要件12.1, 12.2, 12.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageExportDialog from '../../../components/site-surveys/ImageExportDialog';
import type { SurveyImageInfo } from '../../../types/site-survey.types';

// モックデータ
const mockImageInfo: SurveyImageInfo = {
  id: 'image-1',
  surveyId: 'survey-1',
  fileName: 'test-image.jpg',
  originalPath: 'images/test-image.jpg',
  thumbnailPath: 'thumbnails/test-image-thumb.jpg',
  originalUrl: 'https://example.com/test-image.jpg',
  thumbnailUrl: 'https://example.com/test-image-thumb.jpg',
  fileSize: 1024000,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  comment: null,
  includeInReport: false,
  createdAt: new Date().toISOString(),
};

describe('ImageExportDialog', () => {
  const mockOnExport = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // 基本レンダリングテスト
  // ============================================================================

  describe('基本レンダリング', () => {
    it('ダイアログが開いているときにコンポーネントがレンダリングされる', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('ダイアログが閉じているときにコンポーネントがレンダリングされない', () => {
      render(
        <ImageExportDialog
          open={false}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('ダイアログタイトルが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('画像エクスポート')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // エクスポート形式選択テスト (要件12.2)
  // ============================================================================

  describe('エクスポート形式選択', () => {
    it('JPEG形式オプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/JPEG/i)).toBeInTheDocument();
    });

    it('PNG形式オプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/PNG/i)).toBeInTheDocument();
    });

    it('デフォルトでJPEGが選択されている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const jpegRadio = screen.getByLabelText(/JPEG/i) as HTMLInputElement;
      expect(jpegRadio.checked).toBe(true);
    });

    it('PNG形式を選択できる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const pngRadio = screen.getByLabelText(/PNG/i);
      await user.click(pngRadio);

      expect((pngRadio as HTMLInputElement).checked).toBe(true);
    });
  });

  // ============================================================================
  // 品質（解像度）選択テスト (要件12.3)
  // ============================================================================

  describe('品質選択', () => {
    it('低品質オプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/低/i)).toBeInTheDocument();
    });

    it('中品質オプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/中/i)).toBeInTheDocument();
    });

    it('高品質オプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/高/i)).toBeInTheDocument();
    });

    it('デフォルトで中品質が選択されている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const mediumRadio = screen.getByLabelText(/中/i) as HTMLInputElement;
      expect(mediumRadio.checked).toBe(true);
    });

    it('高品質を選択できる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const highRadio = screen.getByLabelText(/高/i);
      await user.click(highRadio);

      expect((highRadio as HTMLInputElement).checked).toBe(true);
    });

    it('低品質を選択できる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const lowRadio = screen.getByLabelText(/低/i);
      await user.click(lowRadio);

      expect((lowRadio as HTMLInputElement).checked).toBe(true);
    });
  });

  // ============================================================================
  // 注釈あり/なし選択テスト (要件12.1)
  // ============================================================================

  describe('注釈オプション', () => {
    it('注釈を含めるオプションが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByLabelText(/注釈を含める/i)).toBeInTheDocument();
    });

    it('デフォルトで注釈を含める設定になっている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const checkbox = screen.getByLabelText(/注釈を含める/i) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('注釈オプションをオフにできる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const checkbox = screen.getByLabelText(/注釈を含める/i);
      await user.click(checkbox);

      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });
  });

  // ============================================================================
  // ボタン操作テスト
  // ============================================================================

  describe('ボタン操作', () => {
    it('エクスポートボタンが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('button', { name: /エクスポート/i })).toBeInTheDocument();
    });

    it('キャンセルボタンが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
    });

    it('キャンセルボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByRole('button', { name: /キャンセル/i }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('エクスポートボタンをクリックするとonExportが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledTimes(1);
    });

    it('エクスポートボタンクリック時にデフォルトのオプションが渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'jpeg',
        quality: 'medium',
        includeAnnotations: true,
      });
    });

    it('選択したオプションがonExportに渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // PNG形式を選択
      await user.click(screen.getByLabelText(/PNG/i));

      // 高品質を選択
      await user.click(screen.getByLabelText(/高/i));

      // 注釈をオフに
      await user.click(screen.getByLabelText(/注釈を含める/i));

      // エクスポート
      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'png',
        quality: 'high',
        includeAnnotations: false,
      });
    });
  });

  // ============================================================================
  // エクスポート処理中の状態テスト
  // ============================================================================

  describe('エクスポート処理中の状態', () => {
    it('exporting=trueのときエクスポートボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      expect(screen.getByRole('button', { name: /エクスポート/i })).toBeDisabled();
    });

    it('exporting=trueのときキャンセルボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeDisabled();
    });

    it('exporting=trueのときローディングインジケータが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 画像情報表示テスト
  // ============================================================================

  describe('画像情報表示', () => {
    it('画像ファイル名が表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(mockImageInfo.fileName)).toBeInTheDocument();
    });

    it('画像サイズが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // 1920x1080 形式で表示
      expect(screen.getByText(/1920.*1080/)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // アクセシビリティテスト
  // ============================================================================

  describe('アクセシビリティ', () => {
    it('ダイアログにaria-labelledbyが設定されている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('各フォームコントロールにラベルが関連付けられている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // 各ラジオボタンがラベルで取得できることを確認
      expect(screen.getByLabelText(/JPEG/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/PNG/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/低/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/中/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/高/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/注釈を含める/i)).toBeInTheDocument();
    });
  });
});
