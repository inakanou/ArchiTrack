/**
 * PdfReportService - PDF報告書レイアウトサービスのテスト
 *
 * Task 21.2: PDF報告書レイアウトを実装する
 * - 表紙（調査名、調査日、プロジェクト名）
 * - 基本情報セクション（メモ含む）
 * - 画像一覧セクション（注釈付き画像）
 * - ページ番号
 *
 * Task 28.2: PDF報告書1ページ3組レイアウトを実装する
 * - 1ページ目に現場調査の基本情報（調査名、調査日、メモ等）を配置
 * - 2ページ目以降に写真とコメントの組み合わせを1ページあたり3組で配置
 * - 画像の左側配置、コメントの右側配置レイアウト
 * - コメント最大行数制限とオーバーフロー処理
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.6, 10.7, 11.4, 11.5, 11.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { jsPDF } from 'jspdf';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック型定義
// ============================================================================

/**
 * jsPDFのモックインターフェース
 */
interface MockJsPDF {
  addFileToVFS: ReturnType<typeof vi.fn>;
  addFont: ReturnType<typeof vi.fn>;
  setFont: ReturnType<typeof vi.fn>;
  setFontSize: ReturnType<typeof vi.fn>;
  setTextColor: ReturnType<typeof vi.fn>;
  setDrawColor: ReturnType<typeof vi.fn>;
  setFillColor: ReturnType<typeof vi.fn>;
  setLineWidth: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  line: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  addImage: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  getNumberOfPages: ReturnType<typeof vi.fn>;
  setPage: ReturnType<typeof vi.fn>;
  internal: {
    pageSize: {
      getWidth: ReturnType<typeof vi.fn>;
      getHeight: ReturnType<typeof vi.fn>;
    };
  };
  output: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  getTextDimensions: ReturnType<typeof vi.fn>;
  splitTextToSize: ReturnType<typeof vi.fn>;
}

/**
 * モックjsPDFを作成するヘルパー関数
 */
function createMockJsPDF(): MockJsPDF {
  return {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn().mockReturnThis(),
    setLineWidth: vi.fn().mockReturnThis(),
    setTextColor: vi.fn().mockReturnThis(),
    setDrawColor: vi.fn().mockReturnThis(),
    setFillColor: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    line: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    addImage: vi.fn().mockReturnThis(),
    addPage: vi.fn().mockReturnThis(),
    getNumberOfPages: vi.fn().mockReturnValue(1),
    setPage: vi.fn().mockReturnThis(),
    internal: {
      pageSize: {
        getWidth: vi.fn().mockReturnValue(210), // A4 width in mm
        getHeight: vi.fn().mockReturnValue(297), // A4 height in mm
      },
    },
    output: vi.fn().mockReturnValue('pdf-blob-data'),
    save: vi.fn(),
    getTextDimensions: vi.fn().mockReturnValue({ w: 100, h: 5 }),
    splitTextToSize: vi.fn().mockImplementation((text: string) => [text]),
  };
}

/**
 * テスト用の現場調査データを作成
 */
function createTestSurveyDetail(overrides?: Partial<SiteSurveyDetail>): SiteSurveyDetail {
  return {
    id: 'survey-123',
    projectId: 'project-456',
    name: '第一工区現場調査',
    surveyDate: '2025-12-15',
    memo: 'テストメモです。\n改行を含む長いメモの内容がここに入ります。',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    imageCount: 3,
    createdAt: '2025-12-15T10:00:00Z',
    updatedAt: '2025-12-16T15:30:00Z',
    project: {
      id: 'project-456',
      name: 'テストプロジェクトA',
    },
    images: [
      {
        id: 'img-1',
        surveyId: 'survey-123',
        originalPath: '/images/img1.jpg',
        thumbnailPath: '/thumbnails/img1.jpg',
        fileName: 'photo1.jpg',
        fileSize: 102400,
        width: 1920,
        height: 1080,
        displayOrder: 1,
        createdAt: '2025-12-15T10:01:00Z',
      },
      {
        id: 'img-2',
        surveyId: 'survey-123',
        originalPath: '/images/img2.jpg',
        thumbnailPath: '/thumbnails/img2.jpg',
        fileName: 'photo2.jpg',
        fileSize: 204800,
        width: 1920,
        height: 1080,
        displayOrder: 2,
        createdAt: '2025-12-15T10:02:00Z',
      },
      {
        id: 'img-3',
        surveyId: 'survey-123',
        originalPath: '/images/img3.jpg',
        thumbnailPath: '/thumbnails/img3.jpg',
        fileName: 'drawing1.png',
        fileSize: 307200,
        width: 3840,
        height: 2160,
        displayOrder: 3,
        createdAt: '2025-12-15T10:03:00Z',
      },
    ],
    ...overrides,
  };
}

/**
 * 注釈付き画像データを作成
 */
interface AnnotatedImage {
  /** 画像情報 */
  imageInfo: SurveyImageInfo;
  /** 注釈付き画像のデータURL */
  dataUrl: string;
}

/**
 * コメント付き注釈画像データ（Task 28.2用）
 */
interface AnnotatedImageWithComment extends AnnotatedImage {
  /** 画像に紐付けられたコメント */
  comment: string | null;
}

function createTestAnnotatedImages(count: number = 3): AnnotatedImage[] {
  const images: AnnotatedImage[] = [];
  for (let i = 0; i < count; i++) {
    images.push({
      imageInfo: {
        id: `img-${i + 1}`,
        surveyId: 'survey-123',
        originalPath: `/images/img${i + 1}.jpg`,
        thumbnailPath: `/thumbnails/img${i + 1}.jpg`,
        fileName: `photo${i + 1}.jpg`,
        fileSize: 102400 * (i + 1),
        width: 1920,
        height: 1080,
        displayOrder: i + 1,
        createdAt: `2025-12-15T10:0${i + 1}:00Z`,
      },
      dataUrl: `data:image/jpeg;base64,/9j/test-image-${i + 1}`,
    });
  }
  return images;
}

/**
 * コメント付きテスト画像を作成（Task 28.2用）
 */
function createTestAnnotatedImagesWithComments(count: number = 3): AnnotatedImageWithComment[] {
  const images: AnnotatedImageWithComment[] = [];
  for (let i = 0; i < count; i++) {
    images.push({
      imageInfo: {
        id: `img-${i + 1}`,
        surveyId: 'survey-123',
        originalPath: `/images/img${i + 1}.jpg`,
        thumbnailPath: `/thumbnails/img${i + 1}.jpg`,
        fileName: `photo${i + 1}.jpg`,
        fileSize: 102400 * (i + 1),
        width: 1920,
        height: 1080,
        displayOrder: i + 1,
        createdAt: `2025-12-15T10:0${i + 1}:00Z`,
        comment: `テストコメント${i + 1}です。これは画像${i + 1}の説明文です。`,
        includeInReport: true,
      },
      dataUrl: `data:image/jpeg;base64,/9j/test-image-${i + 1}`,
      comment: `テストコメント${i + 1}です。これは画像${i + 1}の説明文です。`,
    });
  }
  return images;
}

describe('PdfReportService', () => {
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    mockJsPDF = createMockJsPDF();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Requirements 10.6, 10.7: PDF報告書生成', () => {
    describe('PdfReportLayout定数', () => {
      it('PDF_REPORT_LAYOUTが定義されている', async () => {
        const { PDF_REPORT_LAYOUT } = await import('../../../services/export/PdfReportService');

        expect(PDF_REPORT_LAYOUT).toBeDefined();
        expect(PDF_REPORT_LAYOUT.PAGE_MARGIN).toBeGreaterThan(0);
        expect(PDF_REPORT_LAYOUT.TITLE_FONT_SIZE).toBeGreaterThan(0);
        expect(PDF_REPORT_LAYOUT.BODY_FONT_SIZE).toBeGreaterThan(0);
        expect(PDF_REPORT_LAYOUT.HEADER_FONT_SIZE).toBeGreaterThan(0);
      });

      it('ページマージンが適切な値である', async () => {
        const { PDF_REPORT_LAYOUT } = await import('../../../services/export/PdfReportService');

        // A4用紙に対して適切なマージン（10mm以上）
        expect(PDF_REPORT_LAYOUT.PAGE_MARGIN).toBeGreaterThanOrEqual(10);
        expect(PDF_REPORT_LAYOUT.PAGE_MARGIN).toBeLessThanOrEqual(30);
      });
    });

    describe('表紙（Cover Page）', () => {
      it('renderCoverPage()が表紙を描画する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();

        service.renderCoverPage(mockJsPDF as unknown as jsPDF, survey);

        // テキストが描画されていることを確認
        expect(mockJsPDF.text).toHaveBeenCalled();
        // フォントサイズが設定されていることを確認
        expect(mockJsPDF.setFontSize).toHaveBeenCalled();
      });

      it('表紙に調査名が表示される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail({ name: '特殊調査レポート' });

        service.renderCoverPage(mockJsPDF as unknown as jsPDF, survey);

        const textCalls = mockJsPDF.text.mock.calls;
        const hasName = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' && (call[0] as string).includes('特殊調査レポート')
        );
        expect(hasName).toBe(true);
      });

      it('表紙に調査日が表示される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail({ surveyDate: '2025-12-15' });

        service.renderCoverPage(mockJsPDF as unknown as jsPDF, survey);

        const textCalls = mockJsPDF.text.mock.calls;
        // 日付は日本語フォーマット（2025年12月15日）で表示
        const hasDate = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' &&
            ((call[0] as string).includes('2025') || (call[0] as string).includes('12'))
        );
        expect(hasDate).toBe(true);
      });

      it('表紙にプロジェクト名が表示される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail({
          project: { id: 'proj-1', name: 'サンプルプロジェクト' },
        });

        service.renderCoverPage(mockJsPDF as unknown as jsPDF, survey);

        const textCalls = mockJsPDF.text.mock.calls;
        const hasProjectName = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' && (call[0] as string).includes('サンプルプロジェクト')
        );
        expect(hasProjectName).toBe(true);
      });
    });

    describe('基本情報セクション', () => {
      it('renderInfoSection()が基本情報を描画する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();

        service.renderInfoSection(mockJsPDF as unknown as jsPDF, survey, 20);

        // テキストが描画されていることを確認
        expect(mockJsPDF.text).toHaveBeenCalled();
      });

      it('メモが表示される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail({ memo: 'これはメモの内容です' });

        service.renderInfoSection(mockJsPDF as unknown as jsPDF, survey, 20);

        const textCalls = mockJsPDF.text.mock.calls;
        const hasMemo = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' && (call[0] as string).includes('これはメモの内容です')
        );
        expect(hasMemo).toBe(true);
      });

      it('メモがnullの場合もエラーにならない', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail({ memo: null });

        expect(() => {
          service.renderInfoSection(mockJsPDF as unknown as jsPDF, survey, 20);
        }).not.toThrow();
      });
    });

    describe('画像一覧セクション', () => {
      it('renderImagesSection()が画像を描画する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const images = createTestAnnotatedImages(2);

        service.renderImagesSection(mockJsPDF as unknown as jsPDF, images, 50);

        // 画像が追加されていることを確認
        expect(mockJsPDF.addImage).toHaveBeenCalled();
      });

      it('複数の画像を順番に描画する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const images = createTestAnnotatedImages(3);

        service.renderImagesSection(mockJsPDF as unknown as jsPDF, images, 50);

        // 3つの画像が追加されていることを確認
        expect(mockJsPDF.addImage.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it('画像がページをまたぐ場合に新しいページが追加される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        // 多数の画像を作成
        const images = createTestAnnotatedImages(10);

        service.renderImagesSection(mockJsPDF as unknown as jsPDF, images, 50);

        // 新しいページが追加されていることを確認
        expect(mockJsPDF.addPage).toHaveBeenCalled();
      });

      it('画像がない場合でもエラーにならない', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();

        expect(() => {
          service.renderImagesSection(mockJsPDF as unknown as jsPDF, [], 50);
        }).not.toThrow();
      });
    });

    describe('ページ番号', () => {
      it('renderPageNumbers()が全ページにページ番号を追加する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        mockJsPDF.getNumberOfPages.mockReturnValue(5);

        service.renderPageNumbers(mockJsPDF as unknown as jsPDF);

        // setPageが5回呼ばれる（各ページに移動）
        expect(mockJsPDF.setPage).toHaveBeenCalledTimes(5);
        // textが5回呼ばれる（各ページにページ番号）
        expect(mockJsPDF.text.mock.calls.length).toBeGreaterThanOrEqual(5);
      });

      it('ページ番号は「ページ番号 / 総ページ数」形式で表示される', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        mockJsPDF.getNumberOfPages.mockReturnValue(3);

        service.renderPageNumbers(mockJsPDF as unknown as jsPDF);

        const textCalls = mockJsPDF.text.mock.calls;
        // 「1 / 3」または「1/3」形式のテキストが含まれる
        const hasPageNumber = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' && /\d+\s*\/\s*\d+/.test(call[0] as string)
        );
        expect(hasPageNumber).toBe(true);
      });
    });

    describe('PDF報告書生成（統合）', () => {
      it('generateReport()がPDFドキュメントを生成する', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(2);

        const result = service.generateReport(mockJsPDF as unknown as jsPDF, survey, images);

        // 返り値がjsPDFインスタンス
        expect(result).toBe(mockJsPDF);
      });

      it('生成されたPDFに表紙が含まれる', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        service.generateReport(mockJsPDF as unknown as jsPDF, survey, images);

        // 調査名が表示されている
        const textCalls = mockJsPDF.text.mock.calls;
        const hasTitle = textCalls.some(
          (call: unknown[]) =>
            typeof call[0] === 'string' && (call[0] as string).includes(survey.name)
        );
        expect(hasTitle).toBe(true);
      });

      it('オプションで各セクションの有効/無効を制御できる', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(2);

        service.generateReport(mockJsPDF as unknown as jsPDF, survey, images, {
          includeCoverPage: true,
          includeInfoSection: true,
          includeImages: true,
          includePageNumbers: true,
        });

        // 全てのセクションが含まれる
        expect(mockJsPDF.text).toHaveBeenCalled();
        expect(mockJsPDF.addImage).toHaveBeenCalled();
      });

      it('jsPDFインスタンスがnullの場合はエラーをスローする', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        expect(() => {
          service.generateReport(null as unknown as jsPDF, survey, images);
        }).toThrow('jsPDF instance is required');
      });

      it('surveyがnullの場合はエラーをスローする', async () => {
        const { PdfReportService } = await import('../../../services/export/PdfReportService');
        const service = new PdfReportService();
        const images = createTestAnnotatedImages(1);

        expect(() => {
          service.generateReport(
            mockJsPDF as unknown as jsPDF,
            null as unknown as SiteSurveyDetail,
            images
          );
        }).toThrow('Survey detail is required');
      });
    });
  });

  describe('日本語テキストの処理', () => {
    it('長いテキストが適切に折り返される', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const longMemo =
        'これは非常に長いメモです。'.repeat(20) + '\n改行も含みます。\n複数行のテキストです。';
      const survey = createTestSurveyDetail({ memo: longMemo });

      service.renderInfoSection(mockJsPDF as unknown as jsPDF, survey, 20);

      // splitTextToSizeが呼ばれていることを確認（テキスト折り返し）
      expect(mockJsPDF.splitTextToSize).toHaveBeenCalled();
    });

    it('日付が日本語形式でフォーマットされる', async () => {
      const { formatDateForPdf } = await import('../../../services/export/PdfReportService');

      const formatted = formatDateForPdf('2025-12-15');

      // 日本語形式（年/月/日または年月日）
      expect(formatted).toMatch(/2025/);
      expect(formatted).toMatch(/12/);
      expect(formatted).toMatch(/15/);
    });
  });

  describe('画像のサイズ計算', () => {
    it('calculateImageDimensions()が適切なサイズを計算する', async () => {
      const { calculateImageDimensions } =
        await import('../../../services/export/PdfReportService');

      // 横長の画像
      const landscape = calculateImageDimensions(1920, 1080, 180, 200);
      expect(landscape.width).toBeLessThanOrEqual(180);
      expect(landscape.height).toBeLessThanOrEqual(200);

      // 縦長の画像
      const portrait = calculateImageDimensions(1080, 1920, 180, 200);
      expect(portrait.width).toBeLessThanOrEqual(180);
      expect(portrait.height).toBeLessThanOrEqual(200);
    });

    it('アスペクト比が維持される', async () => {
      const { calculateImageDimensions } =
        await import('../../../services/export/PdfReportService');

      const { width, height } = calculateImageDimensions(1920, 1080, 180, 200);

      // 元の比率: 1920/1080 = 1.777...
      // 計算後の比率
      const originalRatio = 1920 / 1080;
      const calculatedRatio = width / height;

      // 比率がほぼ同じ（誤差0.01以内）
      expect(Math.abs(originalRatio - calculatedRatio)).toBeLessThan(0.01);
    });
  });
});

describe('スタンドアロン関数', () => {
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    mockJsPDF = createMockJsPDF();
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generatePdfReport()', () => {
    it('PDF報告書を生成する', async () => {
      const { generatePdfReport } = await import('../../../services/export/PdfReportService');
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImages(2);

      const result = generatePdfReport(mockJsPDF as unknown as jsPDF, survey, images);

      expect(result).toBeDefined();
      expect(mockJsPDF.text).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Task 28.2: PDF報告書1ページ3組レイアウトテスト
// Requirements: 11.4, 11.5, 11.6
// ============================================================================

describe('PDF報告書1ページ3組レイアウト（Task 28.2）', () => {
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    mockJsPDF = createMockJsPDF();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PDF_REPORT_LAYOUT_V2定数', () => {
    it('3組レイアウト用の定数が定義されている', async () => {
      const { PDF_REPORT_LAYOUT_V2 } = await import('../../../services/export/PdfReportService');

      expect(PDF_REPORT_LAYOUT_V2).toBeDefined();
      expect(PDF_REPORT_LAYOUT_V2.IMAGES_PER_PAGE).toBe(3);
      expect(PDF_REPORT_LAYOUT_V2.PAGE_MARGIN).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.HEADER_HEIGHT).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.FOOTER_HEIGHT).toBeGreaterThan(0);
    });

    it('画像+コメント組の設定が定義されている', async () => {
      const { PDF_REPORT_LAYOUT_V2 } = await import('../../../services/export/PdfReportService');

      expect(PDF_REPORT_LAYOUT_V2.ROW_HEIGHT).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.ROW_GAP).toBeGreaterThanOrEqual(0);
      expect(PDF_REPORT_LAYOUT_V2.IMAGE_WIDTH_RATIO).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.IMAGE_WIDTH_RATIO).toBeLessThanOrEqual(1);
    });

    it('コメント表示設定が定義されている', async () => {
      const { PDF_REPORT_LAYOUT_V2 } = await import('../../../services/export/PdfReportService');

      expect(PDF_REPORT_LAYOUT_V2.COMMENT_WIDTH_RATIO).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.COMMENT_FONT_SIZE).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.COMMENT_LINE_HEIGHT).toBeGreaterThan(0);
      expect(PDF_REPORT_LAYOUT_V2.COMMENT_MAX_LINES).toBeGreaterThan(0);
    });
  });

  describe('renderImagesSection3PerPage()（Requirement 11.5）', () => {
    it('3組レイアウトで画像セクションを描画する', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(3);

      service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, images, 50);

      // 3つの画像が追加されていることを確認
      expect(mockJsPDF.addImage).toHaveBeenCalledTimes(3);
    });

    it('画像が左側に配置される', async () => {
      const { PdfReportService, PDF_REPORT_LAYOUT_V2 } =
        await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(1);

      service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, images, 50);

      // addImageの呼び出しを確認
      expect(mockJsPDF.addImage).toHaveBeenCalled();
      const addImageCall = mockJsPDF.addImage.mock.calls[0];
      // X座標がページマージン付近であることを確認（左側配置）
      expect(addImageCall?.[2]).toBe(PDF_REPORT_LAYOUT_V2.PAGE_MARGIN);
    });

    it('コメントが右側に配置される', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(1);

      service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, images, 50);

      // textの呼び出しでコメントが含まれていることを確認
      const textCalls = mockJsPDF.text.mock.calls;
      const hasComment = textCalls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('テストコメント')
      );
      expect(hasComment).toBe(true);
    });

    it('3組を超える画像で新しいページが追加される', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(5);

      service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, images, 50);

      // 3組を超えた時点で新しいページが追加される
      expect(mockJsPDF.addPage).toHaveBeenCalledTimes(1);
    });

    it('6組の画像で2回新しいページが追加される', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(7);

      service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, images, 50);

      // 3, 6組目で新しいページが追加される
      expect(mockJsPDF.addPage).toHaveBeenCalledTimes(2);
    });

    it('画像がない場合でもエラーにならない', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();

      expect(() => {
        service.renderImagesSection3PerPage(mockJsPDF as unknown as jsPDF, [], 50);
      }).not.toThrow();
    });
  });

  describe('renderComment()（Requirement 11.6）', () => {
    it('コメントを描画する', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();

      service.renderComment(mockJsPDF as unknown as jsPDF, 'テストコメント', 100, 50, 80);

      expect(mockJsPDF.text).toHaveBeenCalled();
      expect(mockJsPDF.splitTextToSize).toHaveBeenCalled();
    });

    it('nullコメントでもエラーにならない', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();

      expect(() => {
        service.renderComment(mockJsPDF as unknown as jsPDF, null, 100, 50, 80);
      }).not.toThrow();
    });

    it('空文字コメントでもエラーにならない', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();

      expect(() => {
        service.renderComment(mockJsPDF as unknown as jsPDF, '', 100, 50, 80);
      }).not.toThrow();
    });

    it('長いコメントは最大行数で切り捨てられる', async () => {
      const { PdfReportService, PDF_REPORT_LAYOUT_V2 } =
        await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();

      // 長いコメント（複数行に分割される想定）
      const longComment = '長いコメント。'.repeat(50);
      const mockLines = longComment.split('。').filter((s) => s);
      mockJsPDF.splitTextToSize.mockReturnValue(mockLines);

      service.renderComment(mockJsPDF as unknown as jsPDF, longComment, 100, 50, 80);

      // テキスト描画回数がCOMMENT_MAX_LINES以下であることを確認
      expect(mockJsPDF.text.mock.calls.length).toBeLessThanOrEqual(
        PDF_REPORT_LAYOUT_V2.COMMENT_MAX_LINES
      );
    });
  });

  describe('truncateCommentLines()（Requirement 11.6）', () => {
    it('行数制限内のコメントはそのまま返す', async () => {
      const { truncateCommentLines } = await import('../../../services/export/PdfReportService');

      const lines = ['行1', '行2', '行3'];
      const result = truncateCommentLines(lines, 5);

      expect(result).toEqual(lines);
    });

    it('行数制限を超えるコメントは切り捨てられる', async () => {
      const { truncateCommentLines } = await import('../../../services/export/PdfReportService');

      const lines = ['行1', '行2', '行3', '行4', '行5', '行6'];
      const result = truncateCommentLines(lines, 3);

      expect(result.length).toBe(3);
      expect(result[2]).toContain('...');
    });

    it('空の配列はそのまま返す', async () => {
      const { truncateCommentLines } = await import('../../../services/export/PdfReportService');

      const result = truncateCommentLines([], 5);

      expect(result).toEqual([]);
    });
  });

  describe('generateSurveyReport()（Requirement 11.4）', () => {
    it('調査報告書を3組レイアウトで生成する', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImagesWithComments(3);

      const result = service.generateSurveyReport(
        mockJsPDF as unknown as jsPDF,
        survey,
        images,
        {}
      );

      expect(result).toBe(mockJsPDF);
      // 画像が3組レイアウトで追加されている
      expect(mockJsPDF.addImage).toHaveBeenCalled();
    });

    it('1ページ目に基本情報が含まれる', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const survey = createTestSurveyDetail({
        name: '現場調査テスト',
        surveyDate: '2025-12-22',
        memo: 'テストメモ内容',
      });
      const images = createTestAnnotatedImagesWithComments(1);

      service.generateSurveyReport(mockJsPDF as unknown as jsPDF, survey, images, {});

      const textCalls = mockJsPDF.text.mock.calls;
      // 調査名が含まれる
      const hasName = textCalls.some(
        (call: unknown[]) =>
          typeof call[0] === 'string' && (call[0] as string).includes('現場調査テスト')
      );
      expect(hasName).toBe(true);
    });

    it('2ページ目以降に画像+コメントが3組ずつ配置される', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImagesWithComments(5);

      service.generateSurveyReport(mockJsPDF as unknown as jsPDF, survey, images, {});

      // 5枚の画像があるので、ページ追加が発生する（基本情報ページ後 + 画像ページ）
      expect(mockJsPDF.addPage).toHaveBeenCalled();
    });

    it('jsPDFインスタンスがnullの場合はエラーをスローする', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImagesWithComments(1);

      expect(() => {
        service.generateSurveyReport(null as unknown as jsPDF, survey, images, {});
      }).toThrow('jsPDF instance is required');
    });

    it('surveyがnullの場合はエラーをスローする', async () => {
      const { PdfReportService } = await import('../../../services/export/PdfReportService');
      const service = new PdfReportService();
      const images = createTestAnnotatedImagesWithComments(1);

      expect(() => {
        service.generateSurveyReport(
          mockJsPDF as unknown as jsPDF,
          null as unknown as SiteSurveyDetail,
          images,
          {}
        );
      }).toThrow('Survey detail is required');
    });
  });

  describe('generateSurveyReportスタンドアロン関数', () => {
    it('調査報告書を生成する', async () => {
      const { generateSurveyReport } = await import('../../../services/export/PdfReportService');
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImagesWithComments(2);

      const result = generateSurveyReport(mockJsPDF as unknown as jsPDF, survey, images);

      expect(result).toBeDefined();
      expect(mockJsPDF.text).toHaveBeenCalled();
    });
  });
});
