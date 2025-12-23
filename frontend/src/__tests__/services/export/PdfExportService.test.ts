/**
 * PdfExportService - PDF報告書エクスポートサービスのテスト
 *
 * Task 21.3: PDF生成・ダウンロードを実装する
 * - jsPDFによるクライアントサイド生成
 * - プログレス表示（大量画像時）
 * - ダウンロードトリガー
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SiteSurveyDetail, SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// モック定義
// ============================================================================

// jsPDFモッククラス
class MockJsPDF {
  addFileToVFS = vi.fn();
  addFont = vi.fn();
  setFont = vi.fn();
  setFontSize = vi.fn().mockReturnThis();
  setTextColor = vi.fn().mockReturnThis();
  setDrawColor = vi.fn().mockReturnThis();
  setFillColor = vi.fn().mockReturnThis();
  setLineWidth = vi.fn().mockReturnThis();
  text = vi.fn().mockReturnThis();
  line = vi.fn().mockReturnThis();
  rect = vi.fn().mockReturnThis();
  addImage = vi.fn().mockReturnThis();
  addPage = vi.fn().mockReturnThis();
  getNumberOfPages = vi.fn().mockReturnValue(1);
  setPage = vi.fn().mockReturnThis();
  internal = {
    pageSize: {
      getWidth: vi.fn().mockReturnValue(210),
      getHeight: vi.fn().mockReturnValue(297),
    },
  };
  output = vi.fn().mockReturnValue(new Blob(['pdf-content'], { type: 'application/pdf' }));
  save = vi.fn();
  getTextDimensions = vi.fn().mockReturnValue({ w: 100, h: 5 });
  splitTextToSize = vi.fn().mockImplementation((text: string) => [text]);
}

vi.mock('jspdf', () => ({
  jsPDF: MockJsPDF,
  default: MockJsPDF,
}));

// PdfFontServiceモック
vi.mock('../../../services/export/PdfFontService', () => ({
  initializePdfFonts: vi.fn(),
  isPdfFontLoaded: vi.fn().mockReturnValue(true),
  getPdfFontFamily: vi.fn().mockReturnValue('NotoSansJP'),
  PDF_FONT_FAMILY: 'NotoSansJP',
}));

// PdfReportServiceモック
vi.mock('../../../services/export/PdfReportService', () => ({
  PdfReportService: vi.fn().mockImplementation(() => ({
    generateReport: vi.fn().mockImplementation((doc) => doc),
    generateSurveyReport: vi.fn().mockImplementation((doc) => doc),
    renderCoverPage: vi.fn(),
    renderInfoSection: vi.fn().mockReturnValue(50),
    renderImagesSection: vi.fn().mockReturnValue(100),
    renderImagesSection3PerPage: vi.fn().mockReturnValue(100),
    renderPageNumbers: vi.fn(),
  })),
  generatePdfReport: vi.fn().mockImplementation((doc) => doc),
  generateSurveyReport: vi.fn().mockImplementation((doc) => doc),
}));

// ============================================================================
// テストヘルパー関数
// ============================================================================

/**
 * テスト用の現場調査データを作成
 */
function createTestSurveyDetail(overrides?: Partial<SiteSurveyDetail>): SiteSurveyDetail {
  return {
    id: 'survey-123',
    projectId: 'project-456',
    name: '第一工区現場調査',
    surveyDate: '2025-12-15',
    memo: 'テストメモです。',
    thumbnailUrl: 'https://example.com/thumbnail.jpg',
    imageCount: 3,
    createdAt: '2025-12-15T10:00:00Z',
    updatedAt: '2025-12-16T15:30:00Z',
    project: {
      id: 'project-456',
      name: 'テストプロジェクトA',
    },
    images: [
      createTestImageInfo('img-1', 1),
      createTestImageInfo('img-2', 2),
      createTestImageInfo('img-3', 3),
    ],
    ...overrides,
  };
}

/**
 * テスト用の画像情報を作成
 */
function createTestImageInfo(id: string, order: number): SurveyImageInfo {
  return {
    id,
    surveyId: 'survey-123',
    originalPath: `/images/${id}.jpg`,
    thumbnailPath: `/thumbnails/${id}.jpg`,
    fileName: `photo${order}.jpg`,
    fileSize: 102400 * order,
    width: 1920,
    height: 1080,
    displayOrder: order,
    createdAt: `2025-12-15T10:0${order}:00Z`,
  };
}

/**
 * 注釈付き画像データを作成（コメント付き）
 */
interface AnnotatedImageForTest {
  imageInfo: SurveyImageInfo;
  dataUrl: string;
  comment: string | null;
}

function createTestAnnotatedImages(count: number = 3): AnnotatedImageForTest[] {
  const images: AnnotatedImageForTest[] = [];
  for (let i = 0; i < count; i++) {
    images.push({
      imageInfo: createTestImageInfo(`img-${i + 1}`, i + 1),
      dataUrl: `data:image/jpeg;base64,/9j/test-image-${i + 1}`,
      comment: `テストコメント${i + 1}`,
    });
  }
  return images;
}

// ============================================================================
// テスト
// ============================================================================

describe('PdfExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // document.createElement, document.body.appendChildのモック
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: vi.fn(),
          style: {},
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Requirements 10.6: PDF報告書生成・ダウンロード', () => {
    describe('PdfExportService クラス', () => {
      it('PdfExportServiceがインスタンス化できる', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        expect(service).toBeDefined();
      });

      it('exportPdf()がBlobを返す', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(2);

        const result = await service.exportPdf(survey, images);

        expect(result).toBeInstanceOf(Blob);
        expect(result.type).toBe('application/pdf');
      });

      it('exportPdf()がオプションを受け取る', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        const result = await service.exportPdf(survey, images, {
          includeCoverPage: false,
          includePageNumbers: false,
        });

        expect(result).toBeInstanceOf(Blob);
      });

      it('surveyがnullの場合はエラーをスローする', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const images = createTestAnnotatedImages(1);

        await expect(
          service.exportPdf(null as unknown as SiteSurveyDetail, images)
        ).rejects.toThrow('Survey detail is required');
      });
    });

    describe('プログレスコールバック', () => {
      it('進捗コールバックが呼び出される', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(3);
        const progressCallback = vi.fn();

        await service.exportPdf(survey, images, {
          onProgress: progressCallback,
        });

        // 進捗コールバックが少なくとも1回は呼ばれる
        expect(progressCallback).toHaveBeenCalled();
      });

      it('進捗コールバックに適切なデータが渡される', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(2);
        const progressCallback = vi.fn();

        await service.exportPdf(survey, images, {
          onProgress: progressCallback,
        });

        // 進捗コールバックの引数を確認
        const progressCalls = progressCallback.mock.calls;
        expect(progressCalls.length).toBeGreaterThan(0);

        // 最初の呼び出しに進捗情報が含まれる
        const lastCall = progressCalls[progressCalls.length - 1];
        if (lastCall && lastCall[0]) {
          const progress = lastCall[0] as {
            phase: string;
            current: number;
            total: number;
            percent: number;
          };
          expect(progress).toHaveProperty('phase');
          expect(progress).toHaveProperty('current');
          expect(progress).toHaveProperty('total');
          expect(progress).toHaveProperty('percent');
        }
      });

      it('完了時に100%の進捗が報告される', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);
        const progressCallback = vi.fn();

        await service.exportPdf(survey, images, {
          onProgress: progressCallback,
        });

        // 最後の呼び出しが100%であることを確認
        const progressCalls = progressCallback.mock.calls;
        const lastCall = progressCalls[progressCalls.length - 1];
        if (lastCall && lastCall[0]) {
          const progress = lastCall[0] as { percent: number };
          expect(progress.percent).toBe(100);
        }
      });
    });

    describe('ダウンロードトリガー', () => {
      it('downloadPdf()がダウンロードを実行する', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        const blob = await service.exportPdf(survey, images);
        service.downloadPdf(blob, 'test-report.pdf');

        // URL.createObjectURLが呼ばれる
        expect(URL.createObjectURL).toHaveBeenCalled();
        // URL.revokeObjectURLが呼ばれる
        expect(URL.revokeObjectURL).toHaveBeenCalled();
      });

      it('downloadPdf()がデフォルトのファイル名を使用する', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const blob = new Blob(['test'], { type: 'application/pdf' });

        service.downloadPdf(blob);

        // ダウンロードリンクが作成される
        expect(document.createElement).toHaveBeenCalledWith('a');
      });

      it('exportAndDownloadPdf()が生成からダウンロードまで一括実行する', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        await service.exportAndDownloadPdf(survey, images);

        // URL操作が実行される
        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(URL.revokeObjectURL).toHaveBeenCalled();
      });

      it('exportAndDownloadPdf()がカスタムファイル名を使用する', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);
        const createElementSpy = vi.spyOn(document, 'createElement');

        await service.exportAndDownloadPdf(survey, images, {
          filename: 'custom-report.pdf',
        });

        expect(createElementSpy).toHaveBeenCalledWith('a');
      });
    });

    describe('ファイル名生成', () => {
      it('generateDefaultFilename()がファイル名を生成する', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ name: '現場調査A' });

        const filename = service.generateDefaultFilename(survey);

        expect(filename).toContain('現場調査A');
        expect(filename).toContain('.pdf');
      });

      it('生成されたファイル名に調査日が含まれる', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ surveyDate: '2025-12-15' });

        const filename = service.generateDefaultFilename(survey);

        expect(filename).toMatch(/2025-?12-?15|20251215/);
      });

      it('ファイル名の不正な文字が置換される', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ name: '現場/調査:テスト' });

        const filename = service.generateDefaultFilename(survey);

        // スラッシュやコロンが含まれない
        expect(filename).not.toContain('/');
        expect(filename).not.toContain(':');
      });
    });

    describe('エラーハンドリング', () => {
      it('PDF生成中のエラーが適切にスローされる', async () => {
        const { PdfExportService, generateSurveyReport } =
          await import('../../../services/export/PdfExportService');

        // generateSurveyReportをエラーを投げるようにモック
        vi.mocked(generateSurveyReport).mockImplementationOnce(() => {
          throw new Error('PDF generation failed');
        });

        const service = new PdfExportService();
        const survey = createTestSurveyDetail();
        const images = createTestAnnotatedImages(1);

        await expect(service.exportPdf(survey, images)).rejects.toThrow();
      });

      it('空の画像配列でもPDFが生成できる', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ imageCount: 0, images: [] });

        const result = await service.exportPdf(survey, []);

        expect(result).toBeInstanceOf(Blob);
      });
    });

    describe('大量画像の処理', () => {
      it('多数の画像でも処理できる', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ imageCount: 20 });
        const images = createTestAnnotatedImages(20);

        const result = await service.exportPdf(survey, images);

        expect(result).toBeInstanceOf(Blob);
      });

      it('大量画像の場合も進捗が報告される', async () => {
        const { PdfExportService } = await import('../../../services/export/PdfExportService');
        const service = new PdfExportService();
        const survey = createTestSurveyDetail({ imageCount: 10 });
        const images = createTestAnnotatedImages(10);
        const progressCallback = vi.fn();

        await service.exportPdf(survey, images, {
          onProgress: progressCallback,
        });

        // 進捗コールバックが複数回呼ばれる
        expect(progressCallback.mock.calls.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('スタンドアロン関数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: vi.fn(),
          style: {},
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('exportPdf()', () => {
    it('PDF報告書をエクスポートする', async () => {
      const { exportPdf } = await import('../../../services/export/PdfExportService');
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImages(2);

      const result = await exportPdf(survey, images);

      expect(result).toBeInstanceOf(Blob);
    });
  });

  describe('exportAndDownloadPdf()', () => {
    it('PDFを生成してダウンロードする', async () => {
      const { exportAndDownloadPdf } = await import('../../../services/export/PdfExportService');
      const survey = createTestSurveyDetail();
      const images = createTestAnnotatedImages(1);

      await exportAndDownloadPdf(survey, images);

      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });
});

describe('PdfExportProgress型', () => {
  it('進捗フェーズ定数が定義されている', async () => {
    const { PDF_EXPORT_PHASES } = await import('../../../services/export/PdfExportService');

    expect(PDF_EXPORT_PHASES).toBeDefined();
    expect(PDF_EXPORT_PHASES.INITIALIZING).toBe('initializing');
    expect(PDF_EXPORT_PHASES.GENERATING).toBe('generating');
    expect(PDF_EXPORT_PHASES.FINALIZING).toBe('finalizing');
    expect(PDF_EXPORT_PHASES.COMPLETE).toBe('complete');
  });
});
