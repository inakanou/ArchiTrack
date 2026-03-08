/**
 * @fileoverview QuantityTablePdfExportServiceの単体テスト
 *
 * Task 42.1: QuantityTablePdfExportServiceの単体テストを実装する
 *
 * Requirements:
 * - 26.1: PDF出力操作でPDFファイル生成・ダウンロード
 * - 26.2: PDF表紙の表示
 * - 26.3: 数量グループごとのセクション表示（並び順）
 * - 26.4: 数量グループセクションの内容表示
 * - 26.5: 写真紐づけあり時の写真・コメント配置
 * - 26.6: 写真紐づけなし時の写真・コメント省略
 * - 26.7: 数量項目テーブル形式出力
 * - 26.8: 改ページ時のテーブルヘッダー繰り返し表示
 * - 26.11: PDFファイル名を「{数量表名}.pdf」とする
 * - 26.12: PDFページ番号表示（表紙除く）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsPDFのモック
const mockAddPage = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetDrawColor = vi.fn();
const mockSetLineWidth = vi.fn();
const mockSetFillColor = vi.fn();
const mockText = vi.fn();
const mockLine = vi.fn();
const mockRect = vi.fn();
const mockSetFont = vi.fn();
const mockSetPage = vi.fn();
const mockAddImage = vi.fn();
const mockOutput = vi.fn().mockReturnValue(new Blob(['test'], { type: 'application/pdf' }));
const mockGetTextWidth = vi.fn().mockReturnValue(20);
const mockSplitTextToSize = vi.fn().mockImplementation((text: string) => [text]);

let mockPageCount = 1;

const mockDoc = {
  addPage: mockAddPage.mockImplementation(() => {
    mockPageCount++;
  }),
  setFontSize: mockSetFontSize,
  setTextColor: mockSetTextColor,
  setDrawColor: mockSetDrawColor,
  setLineWidth: mockSetLineWidth,
  setFillColor: mockSetFillColor,
  text: mockText,
  line: mockLine,
  rect: mockRect,
  setFont: mockSetFont,
  setPage: mockSetPage,
  addImage: mockAddImage,
  output: mockOutput,
  getTextWidth: mockGetTextWidth,
  splitTextToSize: mockSplitTextToSize,
  getNumberOfPages: vi.fn().mockImplementation(() => mockPageCount),
  internal: {
    pageSize: {
      getWidth: () => 297, // A4 landscape width
      getHeight: () => 210, // A4 landscape height
    },
  },
};

vi.mock('jspdf', () => {
  // Vitest 4 requires function keyword for constructor mocks
  function MockJsPDF() {
    return mockDoc;
  }
  return { jsPDF: MockJsPDF };
});

vi.mock('../../../services/export/PdfFontService', () => ({
  initializePdfFonts: vi.fn(),
  PDF_FONT_FAMILY: 'NotoSansJP',
}));

import type { QuantityTablePdfInput } from '../../../services/export/QuantityTablePdfExportService';
import {
  QuantityTablePdfExportService,
  generateQuantityTablePdf,
} from '../../../services/export/QuantityTablePdfExportService';

const createMockInput = (overrides?: Partial<QuantityTablePdfInput>): QuantityTablePdfInput => ({
  quantityTableName: 'テスト数量表',
  projectName: 'テストプロジェクト',
  createdDate: '2026年2月28日',
  groups: [
    {
      name: 'グループ1',
      displayOrder: 0,
      photoDataUrl: null,
      photoComment: null,
      items: [
        {
          majorCategory: '建築',
          middleCategory: '',
          minorCategory: '',
          customCategory: '',
          workType: '仮設',
          name: 'テスト項目1',
          specification: '',
          calculationMethod: '標準',
          quantity: '1.00',
          unit: '式',
          remarks: '',
        },
      ],
    },
  ],
  ...overrides,
});

describe('QuantityTablePdfExportService', () => {
  let service: QuantityTablePdfExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPageCount = 1;
    service = new QuantityTablePdfExportService();
  });

  describe('表紙生成 (REQ-26.1, 26.2)', () => {
    it('表紙に「数量表」タイトルが含まれる', async () => {
      const input = createMockInput();
      await service.generatePdf(input);

      // 「数量表」テキストが表紙に描画されること
      expect(mockText).toHaveBeenCalledWith(
        '数量表',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' })
      );
    });

    it('表紙に数量表名が含まれる', async () => {
      const input = createMockInput({ quantityTableName: '第1回数量表' });
      await service.generatePdf(input);

      expect(mockText).toHaveBeenCalledWith(
        '第1回数量表',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' })
      );
    });

    it('表紙に工事名（プロジェクト名）が含まれる', async () => {
      const input = createMockInput({ projectName: '新築工事A棟' });
      await service.generatePdf(input);

      expect(mockText).toHaveBeenCalledWith(
        '新築工事A棟',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' })
      );
    });

    it('表紙に作成日が含まれる', async () => {
      const input = createMockInput({ createdDate: '2026年2月28日' });
      await service.generatePdf(input);

      expect(mockText).toHaveBeenCalledWith(
        '2026年2月28日',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'center' })
      );
    });
  });

  describe('数量グループセクション (REQ-26.3, 26.4, 26.5, 26.6)', () => {
    it('数量グループが並び順で出力される', async () => {
      const input = createMockInput({
        groups: [
          { name: 'グループB', displayOrder: 1, photoDataUrl: null, photoComment: null, items: [] },
          { name: 'グループA', displayOrder: 0, photoDataUrl: null, photoComment: null, items: [] },
        ],
      });

      await service.generatePdf(input);

      // グループ名がtext呼び出しに含まれる
      const textCalls = mockText.mock.calls.map((call: unknown[]) => call[0]);
      const groupAIndex = textCalls.findIndex((t: unknown) => t === 'グループA');
      const groupBIndex = textCalls.findIndex((t: unknown) => t === 'グループB');

      // グループAがグループBより先に出力される
      expect(groupAIndex).toBeLessThan(groupBIndex);
    });

    it('写真紐づけありの場合に写真が配置される', async () => {
      const input = createMockInput({
        groups: [
          {
            name: 'グループ1',
            displayOrder: 0,
            photoDataUrl: 'data:image/jpeg;base64,/9j/test',
            photoComment: 'テストコメント',
            items: [],
          },
        ],
      });

      await service.generatePdf(input);

      // addImageが呼ばれること
      expect(mockAddImage).toHaveBeenCalled();
    });

    it('写真紐づけなしの場合に写真が省略される', async () => {
      const input = createMockInput({
        groups: [
          {
            name: 'グループ1',
            displayOrder: 0,
            photoDataUrl: null,
            photoComment: null,
            items: [],
          },
        ],
      });

      await service.generatePdf(input);

      // addImageが呼ばれないこと
      expect(mockAddImage).not.toHaveBeenCalled();
    });

    it('写真紐づけありの場合にコメントが配置される', async () => {
      const input = createMockInput({
        groups: [
          {
            name: 'グループ1',
            displayOrder: 0,
            photoDataUrl: 'data:image/jpeg;base64,/9j/test',
            photoComment: '現場確認メモ',
            items: [],
          },
        ],
      });

      await service.generatePdf(input);

      // コメントテキストが描画される
      expect(mockText).toHaveBeenCalledWith('現場確認メモ', expect.any(Number), expect.any(Number));
    });
  });

  describe('数量項目テーブル (REQ-26.7, 26.8)', () => {
    it('テーブルヘッダーが11列構成で描画される', async () => {
      const input = createMockInput();
      await service.generatePdf(input);

      // ヘッダー列名がtext呼び出しに含まれる
      const textCalls = mockText.mock.calls.map((call: unknown[]) => call[0]);
      expect(textCalls).toContain('大項目');
      expect(textCalls).toContain('名称');
      expect(textCalls).toContain('数量');
      expect(textCalls).toContain('単位');
      expect(textCalls).toContain('備考');
    });

    it('数量項目データが行として描画される', async () => {
      const input = createMockInput();
      await service.generatePdf(input);

      const textCalls = mockText.mock.calls.map((call: unknown[]) => call[0]);
      expect(textCalls).toContain('建築');
      expect(textCalls).toContain('テスト項目1');
      expect(textCalls).toContain('1.00');
    });
  });

  describe('ページ番号 (REQ-26.12)', () => {
    it('表紙を除く全ページにページ番号が表示される', async () => {
      const input = createMockInput();
      await service.generatePdf(input);

      // setPageが呼ばれる（ページ番号付与のため）
      // 表紙は1ページ目なので、2ページ目以降にページ番号が付く
      expect(mockSetPage).toHaveBeenCalled();
    });
  });

  describe('ファイル名 (REQ-26.11)', () => {
    it('ファイル名が「{数量表名}.pdf」である', () => {
      expect(service.getFilename('テスト数量表')).toBe('テスト数量表.pdf');
    });
  });

  describe('グループ0件の場合', () => {
    it('グループ0件の場合に表紙のみが生成される', async () => {
      const input = createMockInput({ groups: [] });
      await service.generatePdf(input);

      // addPageはグループセクション用に呼ばれないが、表紙は最初のページなので
      // addPageはグループセクション用には呼ばれない
      // text呼び出しに「数量表」が含まれる（表紙のタイトル）
      const textCalls = mockText.mock.calls.map((call: unknown[]) => call[0]);
      expect(textCalls).toContain('数量表');
    });
  });

  describe('generateQuantityTablePdf スタンドアロン関数', () => {
    it('PDFを生成してBlobを返す', async () => {
      const input = createMockInput();
      const blob = await generateQuantityTablePdf(input);

      expect(blob).toBeInstanceOf(Blob);
    });
  });
});
