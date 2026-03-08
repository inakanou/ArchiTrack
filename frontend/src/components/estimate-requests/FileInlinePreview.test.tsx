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
import userEvent from '@testing-library/user-event';

// ============================================================================
// モック設定
// ============================================================================

// pdf-worker-configのモック（workerの初期化を無効化）
vi.mock('./pdf-worker-config', () => ({}));

// モック用のnumPagesを制御する変数
let mockNumPages = 3;

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
      setTimeout(() => onLoadSuccess({ numPages: mockNumPages }), 0);
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
  Page: ({
    pageNumber,
    width,
    scale,
    onLoadSuccess,
  }: {
    pageNumber: number;
    width?: number;
    scale?: number;
    onLoadSuccess?: (data: { width: number; height: number }) => void;
  }) => {
    // Call onLoadSuccess to simulate page load with width info
    if (onLoadSuccess) {
      setTimeout(() => onLoadSuccess({ width: 595, height: 842 }), 0);
    }
    return (
      <div
        data-testid="pdf-page"
        data-page-number={pageNumber}
        data-width={width}
        data-scale={scale}
      >
        PDF Page {pageNumber}
      </div>
    );
  },
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
function createMockFile(name: string, type: string, _size: number = 1024): File {
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
    mockNumPages = 3; // デフォルト3ページ
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
      const manyRows = Array.from({ length: 200 }, (_, i) => [`行${i + 1}`, `値${i + 1}`]);
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

  // --------------------------------------------------------------------------
  // Task 41.2: PDFページナビゲーションテスト
  // Requirement: 17.6
  // --------------------------------------------------------------------------

  describe('PDFページナビゲーション（17.6）', () => {
    it('PDFロード成功時に総ページ数が正しく取得される', async () => {
      mockNumPages = 5;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      // ページナビゲーションUIに総ページ数が表示される
      await waitFor(() => {
        expect(screen.getByText(/5/)).toBeInTheDocument();
      });
    });

    it('「次へ」ボタンクリックでページが増加する', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      // ナビゲーションUIが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /次へ/i })).toBeInTheDocument();
      });

      // 初期状態ではページ1
      expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '1');

      // 「次へ」ボタンをクリック
      await user.click(screen.getByRole('button', { name: /次へ/i }));

      // ページ2に移動
      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '2');
      });
    });

    it('「前へ」ボタンクリックでページが減少する', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /次へ/i })).toBeInTheDocument();
      });

      // まず次のページに進む
      await user.click(screen.getByRole('button', { name: /次へ/i }));

      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '2');
      });

      // 「前へ」ボタンをクリック
      await user.click(screen.getByRole('button', { name: /前へ/i }));

      // ページ1に戻る
      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '1');
      });
    });

    it('1ページ目で「前へ」ボタンが非活性である', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /前へ/i })).toBeInTheDocument();
      });

      // 1ページ目では「前へ」ボタンが非活性
      expect(screen.getByRole('button', { name: /前へ/i })).toBeDisabled();
    });

    it('最終ページで「次へ」ボタンが非活性である', async () => {
      mockNumPages = 2;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /次へ/i })).toBeInTheDocument();
      });

      // 最終ページ（2ページ目）に進む
      await user.click(screen.getByRole('button', { name: /次へ/i }));

      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '2');
      });

      // 最終ページでは「次へ」ボタンが非活性
      expect(screen.getByRole('button', { name: /次へ/i })).toBeDisabled();
    });

    it('1ページPDFでナビゲーションUIが非表示である', async () => {
      mockNumPages = 1;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
      });

      // 1ページの場合はナビゲーションボタンが表示されない
      expect(screen.queryByRole('button', { name: /前へ/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /次へ/i })).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Task 73.1: PDFプレビュー拡大縮小機能テスト
  // Requirements: 31.1-31.12
  // --------------------------------------------------------------------------

  describe('PDFプレビュー拡大縮小機能（31.1-31.12）', () => {
    it('拡大ボタンクリックでscaleが増加する (31.5)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      // ズームコントロールが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /拡大/i })).toBeInTheDocument();
      });

      // 初期倍率を取得
      const initialZoomText = screen.getByTestId('zoom-level-text').textContent;

      // 拡大ボタンクリック
      await user.click(screen.getByRole('button', { name: /拡大/i }));

      // 倍率が増加していることを確認
      await waitFor(() => {
        const newZoomText = screen.getByTestId('zoom-level-text').textContent;
        expect(newZoomText).not.toBe(initialZoomText);
        // パーセンテージが増加している
        const initialPercent = parseInt(initialZoomText || '0');
        const newPercent = parseInt(newZoomText || '0');
        expect(newPercent).toBeGreaterThan(initialPercent);
      });
    });

    it('縮小ボタンクリックでscaleが減少する (31.6)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /拡大/i })).toBeInTheDocument();
      });

      // まず拡大してから縮小する
      await user.click(screen.getByRole('button', { name: /拡大/i }));

      await waitFor(() => {
        const zoomText = screen.getByTestId('zoom-level-text').textContent;
        expect(parseInt(zoomText || '0')).toBeGreaterThan(100);
      });

      const afterZoomIn = screen.getByTestId('zoom-level-text').textContent;

      // 縮小ボタンクリック
      await user.click(screen.getByRole('button', { name: /縮小/i }));

      await waitFor(() => {
        const newZoomText = screen.getByTestId('zoom-level-text').textContent;
        const zoomInPercent = parseInt(afterZoomIn || '0');
        const newPercent = parseInt(newZoomText || '0');
        expect(newPercent).toBeLessThan(zoomInPercent);
      });
    });

    it('scale >= ZOOM_MAX(3.0)で拡大ボタンが非活性である (31.9)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /拡大/i })).toBeInTheDocument();
      });

      // ZOOM_MAX(300%)まで拡大ボタンを連打する
      const zoomInButton = screen.getByRole('button', { name: /拡大/i });
      for (let i = 0; i < 20; i++) {
        if ((zoomInButton as HTMLButtonElement).disabled) break;
        await user.click(zoomInButton);
      }

      // 拡大ボタンが非活性
      expect(screen.getByRole('button', { name: /拡大/i })).toBeDisabled();
      // 倍率が300%
      expect(screen.getByTestId('zoom-level-text')).toHaveTextContent('300%');
    });

    it('scale <= ZOOM_MIN(0.5)で縮小ボタンが非活性である (31.10)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /縮小/i })).toBeInTheDocument();
      });

      // ZOOM_MIN(50%)まで縮小ボタンを連打する
      const zoomOutButton = screen.getByRole('button', { name: /縮小/i });
      for (let i = 0; i < 20; i++) {
        if ((zoomOutButton as HTMLButtonElement).disabled) break;
        await user.click(zoomOutButton);
      }

      // 縮小ボタンが非活性
      expect(screen.getByRole('button', { name: /縮小/i })).toBeDisabled();
      // 倍率が50%
      expect(screen.getByTestId('zoom-level-text')).toHaveTextContent('50%');
    });

    it('倍率テキストがパーセンテージ形式で正しく表示される (31.7)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        const zoomText = screen.getByTestId('zoom-level-text');
        expect(zoomText).toBeInTheDocument();
        // パーセンテージ形式（数字%）であること
        expect(zoomText.textContent).toMatch(/^\d+%$/);
      });
    });

    it('ページ切り替え後もscaleが維持される (31.12)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');
      const user = userEvent.setup();

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /拡大/i })).toBeInTheDocument();
      });

      // 拡大
      await user.click(screen.getByRole('button', { name: /拡大/i }));

      let zoomAfterIncrease: string | null = null;
      await waitFor(() => {
        zoomAfterIncrease = screen.getByTestId('zoom-level-text').textContent;
        expect(parseInt(zoomAfterIncrease || '0')).toBeGreaterThan(100);
      });

      // ページ切り替え
      await user.click(screen.getByRole('button', { name: /次へ/i }));

      await waitFor(() => {
        expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page-number', '2');
      });

      // scaleが維持されている
      expect(screen.getByTestId('zoom-level-text').textContent).toBe(zoomAfterIncrease);
    });

    it('ズームコントロールがPDFプレビュー時に表示される (31.1, 31.2, 31.3, 31.4)', async () => {
      mockNumPages = 3;
      const pdfFile = createMockFile('test.pdf', 'application/pdf');

      render(<FileInlinePreview file={pdfFile} />);

      await waitFor(() => {
        // 拡大・縮小ボタンと倍率テキストが表示される
        expect(screen.getByRole('button', { name: /拡大/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /縮小/i })).toBeInTheDocument();
        expect(screen.getByTestId('zoom-level-text')).toBeInTheDocument();
      });
    });
  });
});
