/**
 * ConstructionPhotoLedgerService - 工事写真台帳PDFレンダラのテスト
 *
 * Task 8.1: 台帳版組・表紙・写真ページレンダラ
 * - 表紙（外枠＋「工事写真」＋工事名＋工事施工者）
 * - 写真ページ（1ページ3枠・左写真/右No.＋点線コメント欄）
 * - No.通し番号（ページ跨ぎ連番）
 * - 余白枠（最終ページの空きスロット）
 * - 日本語フォント初期化
 *
 * @see design.md - ConstructionPhotoLedgerService
 * @see requirements.md - 要件10.2, 10.4, 10.5, 10.6, 10.7, 10.10, 10.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// PdfFontService をモックしてフォント初期化呼び出しを検証する
vi.mock('../../../services/export/PdfFontService', () => ({
  initializePdfFonts: vi.fn(),
  PDF_FONT_FAMILY: 'NotoSansJP',
}));

import { initializePdfFonts } from '../../../services/export/PdfFontService';

// ============================================================================
// モック型定義
// ============================================================================

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
  getTextWidth: ReturnType<typeof vi.fn>;
  splitTextToSize: ReturnType<typeof vi.fn>;
}

function createMockJsPDF(): MockJsPDF {
  return {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn().mockReturnThis(),
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
        getWidth: vi.fn().mockReturnValue(210), // A4縦 幅(mm)
        getHeight: vi.fn().mockReturnValue(297), // A4縦 高さ(mm)
      },
    },
    getTextWidth: vi.fn().mockReturnValue(30),
    splitTextToSize: vi.fn().mockImplementation((text: string) => [text]),
  };
}

/** text() 呼び出しの第1引数（描画文字列）を全て収集する */
function collectDrawnText(mock: MockJsPDF): string[] {
  return mock.text.mock.calls.map((c) => String(c[0]));
}

/** 指定のテスト用写真項目配列を作成 */
function createTestItems(count: number): Array<{
  dataUrl: string;
  comment: string | null;
  width: number;
  height: number;
}> {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      dataUrl: `data:image/jpeg;base64,/9j/test-${i + 1}`,
      comment: `コメント${i + 1}：これは写真項目${i + 1}の説明文です。`,
      width: 1920,
      height: 1080,
    });
  }
  return items;
}

describe('ConstructionPhotoLedgerService', () => {
  let mockJsPDF: MockJsPDF;

  beforeEach(() => {
    mockJsPDF = createMockJsPDF();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // (e) 版組定数
  // ==========================================================================
  describe('版組定数 (要件10.3,10.4)', () => {
    it('CONSTRUCTION_PHOTO_LEDGER_LAYOUT が参考書式の値で定義されている', async () => {
      const { CONSTRUCTION_PHOTO_LEDGER_LAYOUT } =
        await import('../../../services/export/ConstructionPhotoLedgerService');

      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT).toBeDefined();
      // A4縦 mm
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.PAGE_WIDTH).toBe(210);
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.PAGE_HEIGHT).toBe(297);
      // 1ページ3枠
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.IMAGES_PER_PAGE).toBe(3);
      // 写真枠/右カラム比率
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.IMAGE_WIDTH_RATIO).toBe(0.45);
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.COMMENT_WIDTH_RATIO).toBe(0.45);
      // 点線本数・間隔・行高
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.DOTTED_LINE_COUNT).toBe(8);
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.DOTTED_LINE_SPACING).toBe(6.5);
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.ROW_HEIGHT).toBe(75);
      // 日本語フォント
      expect(CONSTRUCTION_PHOTO_LEDGER_LAYOUT.FONT_FAMILY).toBe('NotoSansJP');
    });
  });

  // ==========================================================================
  // (a) 表紙ページ
  // ==========================================================================
  describe('表紙ページ (要件10.2)', () => {
    it('外枠・「工事写真」・工事名・工事施工者を描画する', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.buildLedgerDocument(mockJsPDF as never, {
        workName: 'テスト工事案件A',
        contractorName: '株式会社テスト建設',
        items: [],
      });

      // 外枠（rect）が描画される
      expect(mockJsPDF.rect).toHaveBeenCalled();

      const texts = collectDrawnText(mockJsPDF);
      const joined = texts.join('\n');
      // 表題「工事写真」（スペース有無を許容）
      expect(joined.replace(/\s/g, '')).toContain('工事写真');
      // 工事名の値
      expect(joined).toContain('テスト工事案件A');
      // 工事施工者の値
      expect(joined).toContain('株式会社テスト建設');
      // ラベル
      expect(joined).toContain('工事名');
      expect(joined).toContain('工事施工者');
    });

    it('写真項目が0件でも表紙のみ描画し写真ページを追加しない', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: [],
      });

      // 写真ページ（addPage）は追加されない
      expect(mockJsPDF.addPage).not.toHaveBeenCalled();
      expect(mockJsPDF.addImage).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // (b) 写真ページ・No.通し番号
  // ==========================================================================
  describe('写真ページとNo.通し番号 (要件10.3,10.4,10.5,10.6)', () => {
    it('N件の写真項目で ceil(N/3) の写真ページを追加する', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      // 4件 -> 写真ページ2枚
      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: createTestItems(4),
      });

      // 表紙(page1)は既存なので addPage は写真ページ分（2回）
      expect(mockJsPDF.addPage).toHaveBeenCalledTimes(2);
      // 写真は各項目に1枚ずつ
      expect(mockJsPDF.addImage).toHaveBeenCalledTimes(4);
    });

    it('No.をページをまたいで連番で付番する', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: createTestItems(4),
      });

      const joined = collectDrawnText(mockJsPDF).join('\n');
      // 1ページ目3枠 + 2ページ目1枠、連番 No.1..No.4
      expect(joined).toContain('No.1');
      expect(joined).toContain('No.2');
      expect(joined).toContain('No.3');
      // 2ページ目に跨いだ連番
      expect(joined).toContain('No.4');
    });

    it('各写真項目のコメントを描画する', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: createTestItems(2),
      });

      const joined = collectDrawnText(mockJsPDF).join('\n');
      expect(joined).toContain('コメント1');
      expect(joined).toContain('コメント2');
      // 点線コメント欄（line）が描画される
      expect(mockJsPDF.line).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // (b-2) 写真アスペクト比保持
  // ==========================================================================
  describe('写真アスペクト比保持 (要件10.7)', () => {
    // レイアウト定数から導かれる写真枠の寸法（contentWidth=210-15*2=180, ratio=0.45）
    const IMAGE_FRAME_WIDTH = (210 - 15 * 2) * 0.45; // = 81mm
    const IMAGE_MAX_HEIGHT = 70; // CONSTRUCTION_PHOTO_LEDGER_LAYOUT.IMAGE_MAX_HEIGHT

    /** addImage 呼び出しから (dataUrl, 'JPEG', x, y, width, height) の width/height を取得する */
    function drawnImageSize(mock: MockJsPDF, dataUrl: string): { width: number; height: number } {
      const call = mock.addImage.mock.calls.find((c) => c[0] === dataUrl);
      if (!call) throw new Error(`addImage not called with dataUrl: ${dataUrl}`);
      return { width: call[4] as number, height: call[5] as number };
    }

    it('横長画像は縦横比を保ったまま写真枠幅に収める（引き伸ばさない）', async () => {
      const { ConstructionPhotoLedgerService } = await import(
        '../../../services/export/ConstructionPhotoLedgerService'
      );
      const service = new ConstructionPhotoLedgerService();

      // 16:9 の横長。枠幅81mmに対し高さ=81/(16/9)=45.56mm（<70）でクランプされない
      const dataUrl = 'data:image/jpeg;base64,/9j/landscape';
      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: [{ dataUrl, comment: null, width: 1600, height: 900 }],
      });

      const { width, height } = drawnImageSize(mockJsPDF, dataUrl);
      // アスペクト比が原本(1600:900)と一致する（引き伸ばし・固定枠への歪みがない）
      expect(width / height).toBeCloseTo(1600 / 900, 3);
      // 写真枠内に収まる（幅は枠幅、超過なし）
      expect(width).toBeCloseTo(IMAGE_FRAME_WIDTH, 3);
      expect(height).toBeLessThanOrEqual(IMAGE_MAX_HEIGHT + 1e-6);
    });

    it('縦長画像は高さ上限でクランプしつつ縦横比を保つ（枠内に収める）', async () => {
      const { ConstructionPhotoLedgerService } = await import(
        '../../../services/export/ConstructionPhotoLedgerService'
      );
      const service = new ConstructionPhotoLedgerService();

      // 9:16 の縦長。枠幅81mmだと高さ=81/(9/16)=144mm>70 のため高さ70でクランプされる
      const dataUrl = 'data:image/jpeg;base64,/9j/portrait';
      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: [{ dataUrl, comment: null, width: 900, height: 1600 }],
      });

      const { width, height } = drawnImageSize(mockJsPDF, dataUrl);
      // 高さは枠の高さ上限でクランプされる
      expect(height).toBeCloseTo(IMAGE_MAX_HEIGHT, 3);
      // クランプ後も原本(900:1600)のアスペクト比を保持する
      expect(width / height).toBeCloseTo(900 / 1600, 3);
      // 幅は枠幅を超えない
      expect(width).toBeLessThanOrEqual(IMAGE_FRAME_WIDTH + 1e-6);
    });
  });

  // ==========================================================================
  // (c) 余白枠
  // ==========================================================================
  describe('余白枠 (要件10.10)', () => {
    it('最終ページで3枠に満たない枠は空欄（写真なし）になる', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      // 4件 -> 2ページ目は1枠のみ埋まり、2枠が空欄
      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: createTestItems(4),
      });

      const joined = collectDrawnText(mockJsPDF).join('\n');
      // 空欄枠には No.5/No.6 は付番されない（4件のみ）
      expect(joined).not.toContain('No.5');
      expect(joined).not.toContain('No.6');
      // 写真は4枚のみ
      expect(mockJsPDF.addImage).toHaveBeenCalledTimes(4);
    });

    it('renderEmptySlot で余白枠の枠線を描画する', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.renderEmptySlot(mockJsPDF as never, 30);
      // 空スロットの枠（rect）が描画される
      expect(mockJsPDF.rect).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // (d) 日本語フォント初期化
  // ==========================================================================
  describe('日本語フォント (要件10.11)', () => {
    it('buildLedgerDocument で日本語フォント初期化が呼ばれる', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      service.buildLedgerDocument(mockJsPDF as never, {
        workName: '工事名',
        contractorName: '会社名',
        items: createTestItems(1),
      });

      expect(initializePdfFonts).toHaveBeenCalledWith(mockJsPDF);
    });
  });

  // ==========================================================================
  // バリデーション
  // ==========================================================================
  describe('バリデーション', () => {
    it('jsPDFインスタンスが無い場合はエラーを投げる', async () => {
      const { ConstructionPhotoLedgerService } =
        await import('../../../services/export/ConstructionPhotoLedgerService');
      const service = new ConstructionPhotoLedgerService();

      expect(() =>
        service.buildLedgerDocument(null as never, {
          workName: '工事名',
          contractorName: '会社名',
          items: [],
        })
      ).toThrow();
    });
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-10.2
 * @requirement construction-photo/REQ-10.3
 * @requirement construction-photo/REQ-10.4
 * @requirement construction-photo/REQ-10.5
 * @requirement construction-photo/REQ-10.6
 * @requirement construction-photo/REQ-10.7
 * @requirement construction-photo/REQ-10.10
 * @requirement construction-photo/REQ-10.11
 */
