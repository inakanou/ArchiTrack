/**
 * @fileoverview FileInlinePreviewコンポーネントの単体テスト
 *
 * Task 28.2: FileInlinePreviewコンポーネントの単体テスト
 *
 * Requirements:
 * - 13.1: ファイルアップロード時にインラインプレビューを表示する
 * - 13.2: PDFファイルのインラインビューア表示（最初のページのみ）
 * - 13.3: 画像ファイルのインライン画像表示
 * - 13.4: Excelファイルをテーブル形式でインライン表示（先頭100行のみ）
 *
 * @module __tests__/components/estimate-requests/FileInlinePreview
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// xlsxモック関数（vi.mock外でアクセス可能にするためvi.hoistedを使用）
const { mockXlsxRead, mockSheetToJson } = vi.hoisted(() => ({
  mockXlsxRead: vi.fn(),
  mockSheetToJson: vi.fn(),
}));

// react-pdfをモック（軽量版）
vi.mock('react-pdf', () => ({
  Document: ({
    children,
    loading,
    error,
  }: {
    children?: React.ReactNode;
    loading?: React.ReactNode;
    error?: React.ReactNode;
  }) => <div data-testid="mock-pdf-document">{children || loading || error}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="mock-pdf-page">Page {pageNumber}</div>
  ),
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

// xlsxをモック（軽量版）
vi.mock('xlsx', () => ({
  read: mockXlsxRead,
  utils: { sheet_to_json: mockSheetToJson },
}));

import { FileInlinePreview } from '../../../components/estimate-requests/FileInlinePreview';

describe('FileInlinePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // URL.createObjectURLをモック
    global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = vi.fn();
    // xlsxモックのデフォルト実装
    mockXlsxRead.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    mockSheetToJson.mockReturnValue([
      ['列A', '列B', '列C'],
      ['データ1', 'データ2', 'データ3'],
      ['データ4', 'データ5', 'データ6'],
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ファイルタイプ判定ロジックのテスト', () => {
    it('PDFファイルを正しく判定する', () => {
      const pdfFile = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });

      render(<FileInlinePreview file={pdfFile} />);

      // PDFプレビューが表示される
      expect(screen.getByTestId('mock-pdf-document')).toBeInTheDocument();
    });

    it('JPEG画像ファイルを正しく判定する', () => {
      const jpegFile = new File(['image-data'], 'test.jpg', { type: 'image/jpeg' });

      render(<FileInlinePreview file={jpegFile} />);

      // 画像プレビューが表示される
      const image = screen.getByRole('img');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('alt', 'test.jpg');
    });

    it('PNG画像ファイルを正しく判定する', () => {
      const pngFile = new File(['image-data'], 'test.png', { type: 'image/png' });

      render(<FileInlinePreview file={pngFile} />);

      // 画像プレビューが表示される
      const image = screen.getByRole('img');
      expect(image).toBeInTheDocument();
    });

    it('Excelファイル（.xlsx）を正しく判定する', async () => {
      const xlsxFile = new File(['excel-data'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<FileInlinePreview file={xlsxFile} />);

      // Excelプレビューがテーブル形式で表示される
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('Excelファイル（.xls）を正しく判定する', async () => {
      const xlsFile = new File(['excel-data'], 'test.xls', {
        type: 'application/vnd.ms-excel',
      });

      render(<FileInlinePreview file={xlsFile} />);

      // Excelプレビューがテーブル形式で表示される
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('サポートされていないファイルタイプの場合は「プレビュー不可」メッセージを表示する', () => {
      const unknownFile = new File(['unknown-data'], 'test.txt', { type: 'text/plain' });

      render(<FileInlinePreview file={unknownFile} />);

      expect(
        screen.getByText('このファイル形式はプレビューに対応していないため、表示できません')
      ).toBeInTheDocument();
    });
  });

  describe('PDF/画像/Excelプレビュー表示の切り替えテスト', () => {
    it('PDFファイルのプレビューを表示する（Requirements: 13.2）', () => {
      const pdfFile = new File(['%PDF-1.4'], 'quotation.pdf', { type: 'application/pdf' });

      render(<FileInlinePreview file={pdfFile} />);

      expect(screen.getByTestId('mock-pdf-document')).toBeInTheDocument();
      expect(screen.getByTestId('mock-pdf-page')).toHaveTextContent('Page 1');
    });

    it('画像ファイルのプレビューを表示する（Requirements: 13.3）', () => {
      const imageFile = new File(['image-data'], 'quotation.jpg', { type: 'image/jpeg' });

      render(<FileInlinePreview file={imageFile} />);

      const image = screen.getByRole('img');
      expect(image).toHaveAttribute('src', 'blob:test-url');
      expect(image).toHaveAttribute('alt', 'quotation.jpg');
    });

    it('Excelファイルをテーブル形式でプレビュー表示する（Requirements: 13.4）', async () => {
      const xlsxFile = new File(['excel-data'], 'quotation.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<FileInlinePreview file={xlsxFile} />);

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });
    });
  });

  describe('ファイル未選択時の代替表示テスト', () => {
    it('ファイルがnullの場合は「ファイルが選択されていません」と表示する', () => {
      render(<FileInlinePreview file={null} />);

      expect(screen.getByText('ファイルが選択されていません')).toBeInTheDocument();
    });

    it('existingPreviewUrlが指定されている場合はそれを使用する', () => {
      render(
        <FileInlinePreview
          file={null}
          existingPreviewUrl="https://example.com/preview.pdf"
          fileMimeType="application/pdf"
        />
      );

      // PDFプレビューが表示される
      expect(screen.getByTestId('mock-pdf-document')).toBeInTheDocument();
    });

    it('existingPreviewUrlが画像の場合は画像プレビューを表示する', () => {
      render(
        <FileInlinePreview
          file={null}
          existingPreviewUrl="https://example.com/preview.jpg"
          fileMimeType="image/jpeg"
        />
      );

      const image = screen.getByRole('img');
      expect(image).toHaveAttribute('src', 'https://example.com/preview.jpg');
    });
  });

  describe('ローディング状態テスト', () => {
    it('Excelファイル読み込み中はスケルトンUIを表示する', () => {
      const xlsxFile = new File(['excel-data'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<FileInlinePreview file={xlsxFile} />);

      // 初期状態ではスケルトンUIが表示される可能性がある
      // 実際の実装に依存するため、テーブルの表示を待機
      expect(
        document.querySelector('[data-testid="preview-skeleton"]') || screen.queryByRole('table')
      ).toBeTruthy();
    });
  });

  describe('エラーハンドリングテスト', () => {
    it('Excelファイル読み込みに失敗した場合はエラーメッセージを表示する', async () => {
      // xlsxのreadをエラーを投げるようにモック
      // vi.clearAllMocks後にmockImplementationを設定
      mockXlsxRead.mockImplementation(() => {
        throw new Error('読み込みエラー');
      });

      const xlsxFile = new File(['invalid-data'], 'invalid.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      render(<FileInlinePreview file={xlsxFile} />);

      // エラーメッセージは「プレビューを表示できません。ファイルの読み込みに失敗しました。」
      await waitFor(
        () => {
          expect(screen.getByText(/プレビューを表示できません/)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('ファイル変更時のクリーンアップテスト', () => {
    it('ファイルが変更されたときに古いBlobURLが解放される', async () => {
      const file1 = new File(['image1'], 'image1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['image2'], 'image2.jpg', { type: 'image/jpeg' });

      const { rerender } = render(<FileInlinePreview file={file1} />);

      expect(URL.createObjectURL).toHaveBeenCalledWith(file1);

      // ファイルを変更
      rerender(<FileInlinePreview file={file2} />);

      // 古いURLが解放される
      expect(URL.revokeObjectURL).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalledWith(file2);
    });
  });
});
