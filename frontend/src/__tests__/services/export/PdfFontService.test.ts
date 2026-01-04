/**
 * PdfFontService - jsPDF日本語フォント埋め込みテスト
 *
 * Task 21.1: 日本語フォント埋め込みを実装する
 * - Noto Sans JPフォントのサブセット化（約500KB）
 * - jsPDFへのフォント登録
 * - Base64エンコードによるバンドル
 *
 * @see design.md - ExportService日本語フォント埋め込み詳細
 * @see requirements.md - 要件10.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { jsPDF } from 'jspdf';
import {
  PdfFontService,
  FontLoadStatus,
  PDF_FONT_FAMILY,
  PDF_FONT_NAME,
} from '../../../services/export/PdfFontService';

/**
 * jsPDFのモックインターフェース
 *
 * jsPDFの必要なメソッドのみをモックする
 * テスト用にvi.fn()の戻り値型を使用
 */
interface MockJsPDF {
  addFileToVFS: ReturnType<typeof vi.fn>;
  addFont: ReturnType<typeof vi.fn>;
  setFont: ReturnType<typeof vi.fn>;
  getFontList: ReturnType<typeof vi.fn>;
}

/**
 * モックjsPDFを作成するヘルパー関数
 */
function createMockJsPDF(): MockJsPDF {
  return {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
    getFontList: vi.fn().mockReturnValue({}),
  };
}

describe('PdfFontService', () => {
  let service: PdfFontService;
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    service = new PdfFontService();
    mockJsPDF = createMockJsPDF();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Requirements 10.6: PDF報告書の日本語対応', () => {
    describe('フォント定数', () => {
      it('PDFフォントファミリー名が定義されている', () => {
        expect(PDF_FONT_FAMILY).toBeDefined();
        expect(typeof PDF_FONT_FAMILY).toBe('string');
        expect(PDF_FONT_FAMILY.length).toBeGreaterThan(0);
      });

      it('PDFフォント名が定義されている', () => {
        expect(PDF_FONT_NAME).toBeDefined();
        expect(typeof PDF_FONT_NAME).toBe('string');
        expect(PDF_FONT_NAME).toContain('NotoSansJP');
      });
    });

    describe('フォント読み込みステータス', () => {
      it('初期状態はNOT_LOADEDである', () => {
        expect(service.getStatus()).toBe(FontLoadStatus.NOT_LOADED);
      });

      it('isLoaded()が初期状態でfalseを返す', () => {
        expect(service.isLoaded()).toBe(false);
      });
    });

    describe('jsPDFへのフォント登録', () => {
      it('initialize()がjsPDFにフォントファイルをVFSに追加する', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);

        expect(mockJsPDF.addFileToVFS).toHaveBeenCalled();
        expect(mockJsPDF.addFileToVFS).toHaveBeenCalledWith(
          expect.stringContaining('NotoSansJP'),
          expect.any(String)
        );
      });

      it('initialize()がjsPDFにフォントを追加する', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);

        expect(mockJsPDF.addFont).toHaveBeenCalled();
        expect(mockJsPDF.addFont).toHaveBeenCalledWith(
          expect.stringContaining('NotoSansJP'),
          'NotoSansJP',
          'normal'
        );
      });

      it('initialize()後にステータスがLOADEDになる', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);

        expect(service.getStatus()).toBe(FontLoadStatus.LOADED);
        expect(service.isLoaded()).toBe(true);
      });

      it('initialize()後にjsPDFにフォントが設定される', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);

        expect(mockJsPDF.setFont).toHaveBeenCalledWith('NotoSansJP');
      });
    });

    describe('各jsPDFインスタンスへのフォント登録', () => {
      it('initialize()を複数回呼び出すと、毎回VFSにフォントを追加する', () => {
        // 各jsPDFインスタンスに対してフォントを登録する必要があるため
        // 同じインスタンスでも毎回addFileToVFSが呼ばれる
        service.initialize(mockJsPDF as unknown as jsPDF);
        service.initialize(mockJsPDF as unknown as jsPDF);

        // addFileToVFSは2回呼ばれる（各initialize呼び出しで）
        expect(mockJsPDF.addFileToVFS).toHaveBeenCalledTimes(2);
      });

      it('initialize()を複数回呼び出すと、毎回setFontが呼ばれる', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);
        service.initialize(mockJsPDF as unknown as jsPDF);

        // setFontは2回呼ばれる（各initialize呼び出しで）
        expect(mockJsPDF.setFont).toHaveBeenCalledTimes(2);
      });
    });

    describe('Base64エンコードされたフォントデータ', () => {
      it('フォントデータがBase64形式である', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);

        const calls = mockJsPDF.addFileToVFS.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const fontDataArg = calls[0]?.[1] as string | undefined;
        expect(fontDataArg).toBeDefined();
        expect(typeof fontDataArg).toBe('string');
        // Base64は英数字と+/=で構成される
        expect(fontDataArg).toMatch(/^[A-Za-z0-9+/=]+$/);
      });
    });

    describe('フォントファミリー取得', () => {
      it('getPdfFontFamily()が正しいフォントファミリーを返す', () => {
        const fontFamily = service.getPdfFontFamily();

        expect(fontFamily).toBe('NotoSansJP');
      });
    });

    describe('エラーハンドリング', () => {
      it('jsPDFがnullの場合はエラーをスローする', () => {
        expect(() => {
          service.initialize(null as unknown as jsPDF);
        }).toThrow('jsPDF instance is required');
      });

      it('jsPDFがundefinedの場合はエラーをスローする', () => {
        expect(() => {
          service.initialize(undefined as unknown as jsPDF);
        }).toThrow('jsPDF instance is required');
      });

      it('addFileToVFSがエラーをスローした場合、ステータスがFAILEDになる', () => {
        mockJsPDF.addFileToVFS.mockImplementation(() => {
          throw new Error('VFS error');
        });

        expect(() => {
          service.initialize(mockJsPDF as unknown as jsPDF);
        }).toThrow('VFS error');

        expect(service.getStatus()).toBe(FontLoadStatus.FAILED);
      });

      it('ステータスがFAILEDの場合でも再初期化を試みる', () => {
        // まずエラーを発生させてFAILED状態にする
        mockJsPDF.addFileToVFS.mockImplementation(() => {
          throw new Error('VFS error');
        });

        try {
          service.initialize(mockJsPDF as unknown as jsPDF);
        } catch {
          // エラーは期待される
        }

        expect(service.getStatus()).toBe(FontLoadStatus.FAILED);

        // FAILEDの状態でエラーを発生させないモックに変更
        mockJsPDF.addFileToVFS.mockReset();

        // 再度初期化を試みる（各jsPDFインスタンスに登録が必要なため）
        service.initialize(mockJsPDF as unknown as jsPDF);

        // 再初期化されるのでaddFileToVFSが呼ばれる
        expect(mockJsPDF.addFileToVFS).toHaveBeenCalled();
        expect(service.getStatus()).toBe(FontLoadStatus.LOADED);
      });
    });

    describe('reset()', () => {
      it('ステータスをNOT_LOADEDにリセットする', () => {
        service.initialize(mockJsPDF as unknown as jsPDF);
        expect(service.getStatus()).toBe(FontLoadStatus.LOADED);

        service.reset();
        expect(service.getStatus()).toBe(FontLoadStatus.NOT_LOADED);
      });
    });
  });
});

describe('スタンドアロン関数', () => {
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    mockJsPDF = createMockJsPDF();
    // シングルトンをリセット
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initializePdfFonts()', () => {
    it('jsPDFにフォントを初期化する', async () => {
      const { initializePdfFonts } = await import('../../../services/export/PdfFontService');

      initializePdfFonts(mockJsPDF as unknown as jsPDF);

      expect(mockJsPDF.addFileToVFS).toHaveBeenCalled();
      expect(mockJsPDF.addFont).toHaveBeenCalled();
    });
  });

  describe('isPdfFontLoaded()', () => {
    it('初期化前はfalseを返す', async () => {
      const { isPdfFontLoaded, resetPdfFontService } =
        await import('../../../services/export/PdfFontService');

      resetPdfFontService();

      expect(isPdfFontLoaded()).toBe(false);
    });

    it('初期化後はtrueを返す', async () => {
      const { initializePdfFonts, isPdfFontLoaded, resetPdfFontService } =
        await import('../../../services/export/PdfFontService');

      resetPdfFontService();
      initializePdfFonts(mockJsPDF as unknown as jsPDF);

      expect(isPdfFontLoaded()).toBe(true);
    });
  });

  describe('getPdfFontFamily()', () => {
    it('PDFフォントファミリー名を返す', async () => {
      const { getPdfFontFamily } = await import('../../../services/export/PdfFontService');

      const fontFamily = getPdfFontFamily();

      expect(fontFamily).toBe('NotoSansJP');
    });
  });
});
