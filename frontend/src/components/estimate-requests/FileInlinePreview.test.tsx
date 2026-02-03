/**
 * @fileoverview FileInlinePreview コンポーネントのテスト
 *
 * Task 24.2: FileInlinePreviewコンポーネントの実装
 * Task 28.2: FileInlinePreviewコンポーネントの単体テスト
 *
 * Requirements:
 * - 13.1: ファイルアップロード時にインラインプレビューを表示する
 * - 13.2: PDFファイルのインラインビューア表示（最初のページのみ）
 * - 13.3: 画像ファイルのインライン画像表示
 * - 13.4: Excelファイルをテーブル形式でインライン表示（先頭100行のみ）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ============================================================================
// モック設定
// ============================================================================

// react-pdfのモック
vi.mock('react-pdf', () => ({
  Document: ({
    children,
    onLoadSuccess,
    loading,
    error,
    file,
  }: {
    children: React.ReactNode;
    onLoadSuccess?: (data: { numPages: number }) => void;
    loading?: React.ReactNode;
    error?: React.ReactNode;
    file: string | null;
  }) => {
    // ファイルが存在する場合はonLoadSuccessを呼ぶ
    if (file && onLoadSuccess) {
      // 非同期でコールバックを呼ぶ
      setTimeout(() => onLoadSuccess({ numPages: 3 }), 0);
    }
    if (!file) {
      return <div data-testid="pdf-error">{error}</div>;
    }
    return (
      <div data-testid="pdf-document" data-file={file}>
        {loading && <div data-testid="pdf-loading">{loading}</div>}
        {children}
      </div>
    );
  },
  Page: ({ pageNumber, width }: { pageNumber: number; width?: number }) => (
    <div data-testid="pdf-page" data-page-number={pageNumber} data-width={width}>
      PDF Page {pageNumber}
    </div>
  ),
  pdfjs: {
    GlobalWorkerOptions: {
      workerSrc: '',
    },
  },
}));

// xlsxのモック
vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: {
      Sheet1: {},
    },
  })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ['名称', '規格', '単位', '数量', '単価'],
      ['コンクリート', 'C21', 'm3', '10', '15000'],
      ['鉄筋', 'SD295A', 'kg', '500', '120'],
    ]),
  },
}));

import { FileInlinePreview } from './FileInlinePreview';

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * テスト用のFileオブジェクトを生成する
 */
function createMockFile(
  name: string,
  type: string,
  _size: number = 1024
): File {
  const blob = new Blob(['dummy content'], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
}

/**
 * URL.createObjectURLとURL.revokeObjectURLのモック
 */
function setupUrlMocks() {
  const mockUrls: string[] = [];
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  URL.createObjectURL = vi.fn((_blob: Blob) => {
    const url = `blob:mock-url-${mockUrls.length}`;
    mockUrls.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn();

  return {
    mockUrls,
    restore: () => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    },
  };
}

// ============================================================================
// テスト
// ============================================================================

describe('FileInlinePreview', () => {
  let urlMocks: ReturnType<typeof setupUrlMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    urlMocks = setupUrlMocks();
  });

  afterEach(() => {
    urlMocks.restore();
  });

  // --------------------------------------------------------------------------
  // ファイルタイプ判定テスト
  // --------------------------------------------------------------------------

  describe('ファイルタイプ判定', () => {
    it('PDFファイルが指定された場合、PDFプレビューを表示する (13.2)', async () => {
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      // PDFドキュメントコンポーネントが表示される
      await waitFor(() => {
        expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
      });
    });

    it('JPEG画像ファイルが指定された場合、画像プレビューを表示する (13.3)', () => {
      const imageFile = createMockFile('test.jpg', 'image/jpeg');

      render(<FileInlinePreview file={imageFile} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'test.jpg');
    });

    it('PNG画像ファイルが指定された場合、画像プレビューを表示する (13.3)', () => {
      const imageFile = createMockFile('test.png', 'image/png');

      render(<FileInlinePreview file={imageFile} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'test.png');
    });

    it('Excelファイル（.xlsx）が指定された場合、テーブルプレビューを表示する (13.4)', async () => {
      const excelFile = createMockFile(
        'test.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<FileInlinePreview file={excelFile} />);

      // Excelデータがテーブル形式で表示される
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });

    it('Excelファイル（.xls）が指定された場合、テーブルプレビューを表示する (13.4)', async () => {
      const excelFile = createMockFile('test.xls', 'application/vnd.ms-excel');

      render(<FileInlinePreview file={excelFile} />);

      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // ファイル未選択時のテスト
  // --------------------------------------------------------------------------

  describe('ファイル未選択時', () => {
    it('ファイルがnullの場合、代替表示を表示する', () => {
      render(<FileInlinePreview file={null} />);

      expect(screen.getByText('ファイルが選択されていません')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // PDFプレビューテスト
  // --------------------------------------------------------------------------

  describe('PDFプレビュー', () => {
    it('PDFファイルの最初のページのみを表示する (13.2)', async () => {
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        const page = screen.getByTestId('pdf-page');
        expect(page).toBeInTheDocument();
        expect(page).toHaveAttribute('data-page-number', '1');
      });
    });

    it('PDFロード中にスケルトンUIを表示する', () => {
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      // ローディング表示がある（PDFプレビューは外部とDocument内部にスケルトンを持つ）
      const skeletons = screen.getAllByTestId('preview-skeleton');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // 画像プレビューテスト
  // --------------------------------------------------------------------------

  describe('画像プレビュー', () => {
    it('画像ファイルをインライン表示する (13.3)', () => {
      const imageFile = createMockFile('photo.jpg', 'image/jpeg');

      render(<FileInlinePreview file={imageFile} />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      // URL.createObjectURLが呼ばれていることを確認
      expect(URL.createObjectURL).toHaveBeenCalledWith(imageFile);
    });

    it('画像にalt属性としてファイル名が設定される (13.3)', () => {
      const imageFile = createMockFile('photo.png', 'image/png');

      render(<FileInlinePreview file={imageFile} />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', 'photo.png');
    });
  });

  // --------------------------------------------------------------------------
  // Excelプレビューテスト
  // --------------------------------------------------------------------------

  describe('Excelプレビュー', () => {
    it('Excelファイルのデータをテーブル形式で表示する (13.4)', async () => {
      const excelFile = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<FileInlinePreview file={excelFile} />);

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });
    });

    it('Excelデータは先頭100行のみ表示する (13.4)', async () => {
      // 200行のデータを返すようにモックを設定
      const XLSX = await import('xlsx');
      const manyRows = Array.from({ length: 200 }, (_, i) => [
        `行${i + 1}`,
        `値${i + 1}`,
      ]);
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce(manyRows);

      const excelFile = createMockFile(
        'large.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<FileInlinePreview file={excelFile} />);

      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        // 先頭100行のデータ行のみ表示（100行制限）
        expect(rows.length).toBeLessThanOrEqual(101); // ヘッダー行 + 100データ行
      });
    });

    it('Excelパースエラー時にエラーメッセージを表示する (13.4)', async () => {
      const XLSX = await import('xlsx');
      vi.mocked(XLSX.read).mockImplementationOnce(() => {
        throw new Error('パースエラー');
      });

      const excelFile = createMockFile(
        'broken.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<FileInlinePreview file={excelFile} />);

      await waitFor(() => {
        expect(screen.getByText(/プレビューを表示できません/)).toBeInTheDocument();
      });
    });
  });

  // --------------------------------------------------------------------------
  // 既存プレビューURL（編集モード）テスト
  // --------------------------------------------------------------------------

  describe('既存プレビューURL', () => {
    it('existingPreviewUrlが指定された場合、PDFプレビューに使用する', async () => {
      render(
        <FileInlinePreview
          file={null}
          existingPreviewUrl="https://example.com/test.pdf"
          fileMimeType="application/pdf"
        />
      );

      await waitFor(() => {
        const doc = screen.getByTestId('pdf-document');
        expect(doc).toBeInTheDocument();
        expect(doc).toHaveAttribute('data-file', 'https://example.com/test.pdf');
      });
    });

    it('existingPreviewUrlが指定された場合、画像プレビューに使用する', () => {
      render(
        <FileInlinePreview
          file={null}
          existingPreviewUrl="https://example.com/photo.jpg"
          fileMimeType="image/jpeg"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });
  });

  // --------------------------------------------------------------------------
  // スケルトンUI・ローディングテスト
  // --------------------------------------------------------------------------

  describe('ローディング表示', () => {
    it('Excelファイル読み込み中にスケルトンUIを表示する', () => {
      // FileReaderのモックを設定して非同期読み込みをシミュレート
      const excelFile = createMockFile(
        'test.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      render(<FileInlinePreview file={excelFile} />);

      // 初期状態でスケルトンまたはローディングが表示される
      // Excelパースは非同期のため、最初はスケルトンが表示される
      expect(screen.getByTestId('preview-skeleton')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 不明なファイルタイプのテスト
  // --------------------------------------------------------------------------

  describe('プレビュー不可ファイル', () => {
    it('サポートされないファイルタイプの場合、代替メッセージを表示する', () => {
      const unknownFile = createMockFile('test.zip', 'application/zip');

      render(<FileInlinePreview file={unknownFile} />);

      expect(screen.getByText(/プレビューに対応していない/)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // クリーンアップテスト
  // --------------------------------------------------------------------------

  describe('リソース管理', () => {
    it('アンマウント時にBlobURLを解放する', () => {
      const imageFile = createMockFile('test.jpg', 'image/jpeg');

      const { unmount } = render(<FileInlinePreview file={imageFile} />);

      // URL.createObjectURLが呼ばれたことを確認
      expect(URL.createObjectURL).toHaveBeenCalled();

      // アンマウント
      unmount();

      // URL.revokeObjectURLが呼ばれたことを確認
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});
