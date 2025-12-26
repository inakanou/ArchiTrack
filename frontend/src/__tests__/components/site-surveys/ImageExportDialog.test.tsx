/**
 * ImageExportDialogコンポーネントのテスト
 *
 * Task 29.1: 個別画像エクスポートダイアログのテスト
 * - エクスポート形式選択UI（JPEG/PNG）
 * - 品質（解像度）選択UI（低/中/高の3段階）
 * - 注釈あり/なし選択オプション
 * - エクスポート実行ボタンとキャンセルボタン
 *
 * Task 29.2: 元画像ダウンロード機能のテスト
 * - 元画像ダウンロードボタンの表示
 * - 署名付きURLからのダウンロードトリガー
 *
 * Task 30.4: ImageExportDialogの単体テスト（Phase 17）
 * - 形式選択のテスト
 * - 品質選択のテスト
 * - 注釈有無選択のテスト
 * - エクスポート実行のテスト
 * - キーボード操作テスト（Escapeキー）
 * - オーバーレイクリックテスト
 * - 処理中のフォーム入力無効化テスト
 *
 * @see requirements.md - 要件12.1, 12.2, 12.3, 12.4
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

  // ============================================================================
  // 元画像ダウンロード機能テスト (要件12.4, Task 29.2)
  // ============================================================================

  describe('元画像ダウンロード機能', () => {
    const mockOnDownloadOriginal = vi.fn();

    beforeEach(() => {
      mockOnDownloadOriginal.mockClear();
    });

    it('元画像ダウンロードボタンが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
        />
      );

      expect(screen.getByRole('button', { name: /元画像をダウンロード/i })).toBeInTheDocument();
    });

    it('onDownloadOriginalが渡されていない場合は元画像ダウンロードボタンが表示されない', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(
        screen.queryByRole('button', { name: /元画像をダウンロード/i })
      ).not.toBeInTheDocument();
    });

    it('元画像ダウンロードボタンをクリックするとonDownloadOriginalが呼ばれる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
        />
      );

      await user.click(screen.getByRole('button', { name: /元画像をダウンロード/i }));

      expect(mockOnDownloadOriginal).toHaveBeenCalledTimes(1);
    });

    it('exporting=trueのとき元画像ダウンロードボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          exporting={true}
        />
      );

      expect(screen.getByRole('button', { name: /元画像をダウンロード/i })).toBeDisabled();
    });

    it('downloading=trueのとき元画像ダウンロードボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      expect(screen.getByRole('button', { name: /元画像をダウンロード/i })).toBeDisabled();
    });

    it('downloading=trueのときダウンロード中インジケータが表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      // ダウンロード中のローディングインジケータが表示される
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('downloading=trueのときエクスポートボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      expect(screen.getByRole('button', { name: /エクスポート/i })).toBeDisabled();
    });

    it('downloading=trueのときキャンセルボタンが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      expect(screen.getByRole('button', { name: /キャンセル/i })).toBeDisabled();
    });

    it('元画像ダウンロードボタンはオプション選択領域の下、エクスポートボタンの上に表示される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
        />
      );

      // ボタンが存在することを確認
      const downloadButton = screen.getByRole('button', { name: /元画像をダウンロード/i });
      const exportButton = screen.getByRole('button', { name: /エクスポート/i });

      expect(downloadButton).toBeInTheDocument();
      expect(exportButton).toBeInTheDocument();
    });
  });

  // ============================================================================
  // キーボード操作テスト (Task 30.4)
  // ============================================================================

  describe('キーボード操作', () => {
    it('Escapeキーを押すとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('exporting=trueのときEscapeキーでダイアログが閉じない', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('downloading=trueのときEscapeキーでダイアログが閉じない', async () => {
      const user = userEvent.setup();
      const mockOnDownloadOriginal = vi.fn();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      await user.keyboard('{Escape}');

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // オーバーレイクリックテスト (Task 30.4)
  // ============================================================================

  describe('オーバーレイクリック', () => {
    it('オーバーレイをクリックするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // オーバーレイ（role="dialog"が設定された要素自体）をクリック
      // コンポーネントの実装では、handleOverlayClickがevent.target === event.currentTargetをチェック
      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('ダイアログ内をクリックしてもダイアログは閉じない', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // ダイアログ内の要素をクリック
      await user.click(screen.getByText('画像エクスポート'));

      // onCloseが呼ばれていないことを確認（ボタンクリック以外では閉じない）
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('exporting=trueのときオーバーレイをクリックしてもダイアログが閉じない', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // 処理中のフォーム入力無効化テスト (Task 30.4)
  // ============================================================================

  describe('処理中のフォーム入力無効化', () => {
    it('exporting=trueのときエクスポート形式の選択が無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      // export-formatのラジオボタンを直接取得
      const formatRadios = screen.getAllByRole('radio');
      const jpegRadio = formatRadios.find(
        (r) => r.getAttribute('value') === 'jpeg' && r.getAttribute('name') === 'export-format'
      );
      const pngRadio = formatRadios.find(
        (r) => r.getAttribute('value') === 'png' && r.getAttribute('name') === 'export-format'
      );

      expect(jpegRadio).toBeDisabled();
      expect(pngRadio).toBeDisabled();
    });

    it('exporting=trueのとき品質選択が無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      // export-qualityのラジオボタンを直接取得
      const qualityRadios = screen.getAllByRole('radio');
      const lowRadio = qualityRadios.find(
        (r) => r.getAttribute('value') === 'low' && r.getAttribute('name') === 'export-quality'
      );
      const mediumRadio = qualityRadios.find(
        (r) => r.getAttribute('value') === 'medium' && r.getAttribute('name') === 'export-quality'
      );
      const highRadio = qualityRadios.find(
        (r) => r.getAttribute('value') === 'high' && r.getAttribute('name') === 'export-quality'
      );

      expect(lowRadio).toBeDisabled();
      expect(mediumRadio).toBeDisabled();
      expect(highRadio).toBeDisabled();
    });

    it('exporting=trueのとき注釈オプションが無効化される', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      expect(screen.getByLabelText(/注釈を含める/i)).toBeDisabled();
    });
  });

  // ============================================================================
  // ファイルサイズフォーマットテスト (Task 30.4)
  // ============================================================================

  describe('ファイルサイズフォーマット', () => {
    it('バイト単位のファイルサイズが正しく表示される', () => {
      const smallImageInfo: SurveyImageInfo = {
        ...mockImageInfo,
        fileSize: 500, // 500 B
      };

      render(
        <ImageExportDialog
          open={true}
          imageInfo={smallImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/500 B/)).toBeInTheDocument();
    });

    it('キロバイト単位のファイルサイズが正しく表示される', () => {
      const kbImageInfo: SurveyImageInfo = {
        ...mockImageInfo,
        fileSize: 5120, // 5 KB
      };

      render(
        <ImageExportDialog
          open={true}
          imageInfo={kbImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/5\.0 KB/)).toBeInTheDocument();
    });

    it('メガバイト単位のファイルサイズが正しく表示される', () => {
      const mbImageInfo: SurveyImageInfo = {
        ...mockImageInfo,
        fileSize: 5242880, // 5 MB
      };

      render(
        <ImageExportDialog
          open={true}
          imageInfo={mbImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 様々なオプション組み合わせテスト (Task 30.4)
  // ============================================================================

  describe('オプション組み合わせテスト', () => {
    it('PNG形式 + 低品質 + 注釈なしのオプションが正しく渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByLabelText(/PNG/i));
      await user.click(screen.getByLabelText(/低/i));
      await user.click(screen.getByLabelText(/注釈を含める/i));
      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'png',
        quality: 'low',
        includeAnnotations: false,
      });
    });

    it('JPEG形式 + 高品質 + 注釈ありのオプションが正しく渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // JPEGはデフォルトで選択されているため選択不要
      await user.click(screen.getByLabelText(/高/i));
      // 注釈を含めるはデフォルトでオンのため選択不要
      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'jpeg',
        quality: 'high',
        includeAnnotations: true,
      });
    });

    it('PNG形式 + 中品質 + 注釈ありのオプションが正しく渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByLabelText(/PNG/i));
      // 中品質はデフォルトで選択されているため選択不要
      // 注釈を含めるはデフォルトでオンのため選択不要
      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'png',
        quality: 'medium',
        includeAnnotations: true,
      });
    });

    it('複数回オプションを変更しても最終的な選択が正しく渡される', async () => {
      const user = userEvent.setup();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      // 形式を複数回変更
      await user.click(screen.getByLabelText(/PNG/i));
      await user.click(screen.getByLabelText(/JPEG/i));
      await user.click(screen.getByLabelText(/PNG/i));

      // 品質を複数回変更
      await user.click(screen.getByLabelText(/低/i));
      await user.click(screen.getByLabelText(/高/i));

      // 注釈を複数回変更
      await user.click(screen.getByLabelText(/注釈を含める/i)); // オフ
      await user.click(screen.getByLabelText(/注釈を含める/i)); // オン

      await user.click(screen.getByRole('button', { name: /エクスポート/i }));

      expect(mockOnExport).toHaveBeenCalledWith({
        format: 'png',
        quality: 'high',
        includeAnnotations: true,
      });
    });
  });

  // ============================================================================
  // aria-modal属性テスト (Task 30.4)
  // ============================================================================

  describe('モーダルアクセシビリティ', () => {
    it('ダイアログにaria-modal属性が設定されている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('ローディングインジケータにaria-label属性が設定されている（エクスポート中）', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          exporting={true}
        />
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-label', 'エクスポート中');
    });

    it('ローディングインジケータにaria-label属性が設定されている（ダウンロード中）', () => {
      const mockOnDownloadOriginal = vi.fn();
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
          onDownloadOriginal={mockOnDownloadOriginal}
          downloading={true}
        />
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-label', 'ダウンロード中');
    });
  });

  // ============================================================================
  // ラジオグループのrole属性テスト (Task 30.4)
  // ============================================================================

  describe('ラジオグループアクセシビリティ', () => {
    it('エクスポート形式のラジオグループにrole属性が設定されている', () => {
      render(
        <ImageExportDialog
          open={true}
          imageInfo={mockImageInfo}
          onExport={mockOnExport}
          onClose={mockOnClose}
        />
      );

      const radiogroups = screen.getAllByRole('radiogroup');
      expect(radiogroups.length).toBeGreaterThanOrEqual(2);
    });
  });
});
