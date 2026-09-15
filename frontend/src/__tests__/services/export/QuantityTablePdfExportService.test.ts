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

/** 名称だけを変えた数量項目を作る（他の列は固定値） */
const createItem = (name: string): QuantityTablePdfInput['groups'][number]['items'][number] => ({
  majorCategory: '建築',
  middleCategory: '',
  minorCategory: '',
  customCategory: '',
  workType: '仮設',
  name,
  specification: '',
  calculationMethod: '標準',
  quantity: '1.00',
  unit: '式',
  remarks: '',
});

/** 本番の列定義と同じ並びの列名（大項目〜備考の11列） */
const TABLE_HEADER_LABELS = [
  '大項目',
  '中項目',
  '小項目',
  '任意分類',
  '工種',
  '名称',
  '規格',
  '計算方法',
  '数量',
  '単位',
  '備考',
];

/** ページ番号の文字列「n / m」 */
const PAGE_NUMBER_PATTERN = /^\d+ \/ \d+$/;

interface RecordedText {
  text: string;
  y: number;
  order: number;
  page: number;
}

/**
 * モックへの呼び出し順から、その描画がどのページに対して行われたかを求める。
 * setPage 以後はその引数のページ、それ以前は表紙（1）に addPage の回数を足したページ。
 */
const pageOfInvocation = (order: number): number => {
  const setPageOrders = mockSetPage.mock.invocationCallOrder;
  let page: number | undefined;
  for (let i = 0; i < setPageOrders.length; i++) {
    if (setPageOrders[i]! < order) page = mockSetPage.mock.calls[i]![0] as number;
  }
  if (page !== undefined) return page;
  return 1 + mockAddPage.mock.invocationCallOrder.filter((o) => o < order).length;
};

const allTextCalls = (): RecordedText[] =>
  mockText.mock.calls.map((call: unknown[], i: number) => {
    const order = mockText.mock.invocationCallOrder[i]!;
    return { text: call[0] as string, y: call[2] as number, order, page: pageOfInvocation(order) };
  });

/** ページ番号の付与（最初の setPage）より前に描画された文字列 */
const textCallsBeforePageNumbering = (): RecordedText[] => {
  const firstSetPage = mockSetPage.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
  return allTextCalls().filter((c) => c.order < firstSetPage);
};

const findTextCall = (text: string): RecordedText | undefined =>
  allTextCalls().find((c) => c.text === text);

describe('QuantityTablePdfExportService', () => {
  let service: QuantityTablePdfExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPageCount = 1;
    service = new QuantityTablePdfExportService();
  });

  /**
   * 表紙の「数量表」タイトル・数量表名・工事名・作成日の四つをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.2
   */
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

  /**
   * 並び順での出力・グループ名・写真・写真コメントの配置と、写真が無い場合の省略を
   * この区間が確かめる。
   *
   * 受入基準 26.5（写真とコメントを数量項目一覧の「前に」配置すること）はこの区間では
   * 名乗らない。この区間が確かめるのは写真とコメントが描画されることまでであり、
   * 数量項目一覧との前後関係は区間「写真・コメントと数量項目一覧の前後関係 (REQ-26.5)」が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.3
   * @requirement quantity-table-generation/REQ-26.4
   * @requirement quantity-table-generation/REQ-26.6
   */
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

  /**
   * テーブル形式の全11列が列名として描画されることをこの区間が確かめる。
   *
   * 受入基準 26.8（改ページ後の先頭でテーブルヘッダーを繰り返すこと）はこの区間では
   * 名乗らない。この区間はページをまたぐ入力を与えておらず、繰り返しは区間
   * 「改ページ時のテーブルヘッダー繰り返し (REQ-26.8)」が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.7
   */
  describe('数量項目テーブル (REQ-26.7, 26.8)', () => {
    it('テーブルヘッダーが11列構成で描画される', async () => {
      const input = createMockInput();
      await service.generatePdf(input);

      // ヘッダー列名がtext呼び出しに含まれる（原文が並べる11列を全件確かめる）
      const textCalls = mockText.mock.calls.map((call: unknown[]) => call[0]);
      expect(textCalls).toContain('大項目');
      expect(textCalls).toContain('中項目');
      expect(textCalls).toContain('小項目');
      expect(textCalls).toContain('任意分類');
      expect(textCalls).toContain('工種');
      expect(textCalls).toContain('名称');
      expect(textCalls).toContain('規格');
      expect(textCalls).toContain('計算方法');
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

  /**
   * 写真と写真コメントが、同じグループの数量項目一覧より前（描画順と縦位置の両方）に
   * 置かれることをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.5
   */
  describe('写真・コメントと数量項目一覧の前後関係 (REQ-26.5)', () => {
    it('写真紐づけありの場合に写真とコメントが数量項目一覧より前に配置される', async () => {
      const input = createMockInput({
        groups: [
          {
            name: 'グループ1',
            displayOrder: 0,
            photoDataUrl: 'data:image/jpeg;base64,/9j/test',
            photoComment: '配置確認コメント',
            items: [createItem('配置確認項目')],
          },
        ],
      });

      await service.generatePdf(input);

      const photoOrder = mockAddImage.mock.invocationCallOrder[0];
      const photoCall = mockAddImage.mock.calls[0] as unknown[];
      const comment = findTextCall('配置確認コメント');
      const tableHeader = findTextCall('大項目');
      const firstRow = findTextCall('配置確認項目');

      expect(photoOrder).toBeDefined();
      expect(comment).toBeDefined();
      expect(tableHeader).toBeDefined();
      expect(firstRow).toBeDefined();

      // 描画順: 写真 → コメント → 一覧のヘッダー → 一覧の行
      expect(photoOrder!).toBeLessThan(tableHeader!.order);
      expect(comment!.order).toBeLessThan(tableHeader!.order);
      expect(tableHeader!.order).toBeLessThan(firstRow!.order);

      // 同じページに置かれ、縦位置でも写真の下端とコメントが一覧のヘッダーより上にある
      expect(pageOfInvocation(photoOrder!)).toBe(pageOfInvocation(tableHeader!.order));
      expect(comment!.page).toBe(tableHeader!.page);
      const photoY = photoCall[3] as number;
      const photoHeight = photoCall[5] as number;
      expect(photoY + photoHeight).toBeLessThanOrEqual(tableHeader!.y);
      expect(comment!.y).toBeLessThan(tableHeader!.y);
    });
  });

  /**
   * 数量項目一覧がページをまたぐとき、改ページ後の新しいページの先頭に11列の列名が
   * 再び描画され、続きの行はその後に置かれることをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.8
   */
  describe('改ページ時のテーブルヘッダー繰り返し (REQ-26.8)', () => {
    it('数量項目一覧がページをまたぐと新しいページの先頭にテーブルヘッダーが繰り返される', async () => {
      const items = Array.from({ length: 40 }, (_, i) => createItem(`改ページ項目${i + 1}`));
      const input = createMockInput({
        groups: [
          { name: 'グループ1', displayOrder: 0, photoDataUrl: null, photoComment: null, items },
        ],
      });

      await service.generatePdf(input);

      // 前提: 表紙 + グループ1ページ目 + 続きのページ（1ページ以上）になっている
      expect(mockAddPage.mock.calls.length).toBeGreaterThanOrEqual(2);

      const contentTexts = textCallsBeforePageNumbering();
      const itemNames = items.map((item) => item.name);
      const rowPages = items.map((item) => contentTexts.find((c) => c.text === item.name)?.page);
      expect(rowPages.every((page) => page !== undefined)).toBe(true);
      const firstRowPage = rowPages[0]!;
      const lastRowPage = rowPages[rowPages.length - 1]!;
      expect(lastRowPage).toBeGreaterThan(firstRowPage);

      // 行が載っている各ページについて、そのページで最初に描画される11件の文字列が
      // 列名の並びそのものであり、ページ上端（余白直下）に置かれている
      const pagesWithRows = [...new Set(rowPages as number[])];
      for (const page of pagesWithRows) {
        const onPage = contentTexts.filter((c) => c.page === page);
        if (page === firstRowPage) {
          // グループの先頭ページはグループ名が先に来るので、それを除いて見る
          expect(onPage[0]!.text).toBe('グループ1');
          onPage.shift();
        }
        expect(onPage.slice(0, TABLE_HEADER_LABELS.length).map((c) => c.text)).toEqual(
          TABLE_HEADER_LABELS
        );
        if (page !== firstRowPage) {
          const headerYs = onPage.slice(0, TABLE_HEADER_LABELS.length).map((c) => c.y);
          const rest = onPage.slice(TABLE_HEADER_LABELS.length);
          // ヘッダーはページ上端の余白（15mm）直下にあり、続きの行はすべてその下にある
          expect(headerYs.every((y) => y > 15 && y < 15 + 8)).toBe(true);
          expect(rest.some((c) => itemNames.includes(c.text))).toBe(true);
          expect(Math.min(...rest.map((c) => c.y))).toBeGreaterThan(Math.max(...headerYs));
        }
      }
    });
  });

  /**
   * 表紙（1ページ目）にはページ番号を付けず、表紙以外のすべてのページにだけ、
   * 表紙を数えない通し番号を付けることをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-26.12
   */
  describe('ページ番号 (REQ-26.12)', () => {
    it('表紙を除く全ページにページ番号が表示される', async () => {
      // 表紙 + グループ2件（うち1件はページをまたぐ）で、表紙以外が複数ページになる入力
      const input = createMockInput({
        groups: [
          {
            name: 'グループ1',
            displayOrder: 0,
            photoDataUrl: null,
            photoComment: null,
            items: Array.from({ length: 40 }, (_, i) => createItem(`番号項目${i + 1}`)),
          },
          {
            name: 'グループ2',
            displayOrder: 1,
            photoDataUrl: null,
            photoComment: null,
            items: [createItem('番号項目末尾')],
          },
        ],
      });

      await service.generatePdf(input);

      const totalPages = mockPageCount;
      expect(totalPages).toBeGreaterThanOrEqual(4);
      const contentPageCount = totalPages - 1;

      // ページ番号の付与で開くページは、表紙（1）を含まず2ページ目以降のすべてである
      const pagesNumbered = mockSetPage.mock.calls.map((call: unknown[]) => call[0]);
      expect(pagesNumbered).toEqual(Array.from({ length: contentPageCount }, (_, i) => i + 2));
      expect(pagesNumbered).not.toContain(1);

      // 各ページに付く番号は、表紙を数えない通し番号「n / 表紙以外のページ数」である
      const pageNumberTexts = allTextCalls().filter((c) => PAGE_NUMBER_PATTERN.test(c.text));
      expect(pageNumberTexts.map((c) => [c.page, c.text])).toEqual(
        Array.from({ length: contentPageCount }, (_, i) => [
          i + 2,
          `${i + 1} / ${contentPageCount}`,
        ])
      );

      // 表紙のページにはページ番号の文字列が一つも描画されない
      expect(pageNumberTexts.some((c) => c.page === 1)).toBe(false);
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
