/**
 * @fileoverview 見積カードの読み取りと受領見積書への対応づけ（LedgerCardParser）の単体試験
 * （unit-price-ledger タスク2.2・2.3）
 *
 * zip と JSON の読み取り、上限（大きさ・項目の数）の超過、`.json` でない項目と不正な名前の項目の読み飛ばし、
 * 必須の項目の検査、受領見積書と明細行の欄への対応づけ（細目・6 つの項目・切り詰め・受領見積書の名前）を確かめる。
 * 参考の理由（数量×単価・合計・切り詰め・読めない値を理由にすること、すべての行の印、200 文字の切り詰めと
 * 全文の残し方）を確かめる（タスク2.3）。
 */
import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  LEDGER_IMPORT_LIMITS,
  parseUpload,
  type LedgerCardParseOutcome,
  type LedgerUploadFile,
} from '../../../../services/unit-price-ledger/ledger-card-parser.js';
import { LedgerImportTooLargeError } from '../../../../errors/unitPriceLedgerError.js';
import {
  LINE_ITEM_FIELD_LIMITS,
  RECEIVED_QUOTATION_FIELD_LIMITS,
} from '../../../../schemas/received-quotation.schema.js';
import { LEDGER_FIELD_LIMITS } from '../../../../schemas/unit-price-ledger.schema.js';

type Card = Record<string, unknown>;
type ParsedOutcome = Extract<LedgerCardParseOutcome, { kind: 'parsed' }>;
type FailedOutcome = Extract<LedgerCardParseOutcome, { kind: 'failed' }>;

/** daicho の見積カードの形（daicho.py の先頭の説明）に沿った正しいカード */
const validCard = (overrides: Card = {}): Card => ({
  id: '20261001_山田内装_A小学校改修',
  業者: '山田内装',
  工種: ['内装', '軽天・ボード'],
  種別: '見積',
  見積日: '2026-10-01',
  見積番号: 'Q-123',
  案件: {
    名称: 'A小学校改修',
    発注者: 'A市',
    場所: 'A市',
    片道km: 12.5,
    区分: '改修',
    用途: '学校',
    工事価格: 12000000,
    工事価格の根拠: '自社の御見積書 2026-10-10（提出）',
    延床m2: 1500,
    作業条件: ['夜間', '居ながら'],
  },
  原本: { パス: 'A小学校改修/02_見積/01_山田内装/見積書.pdf', 形式: 'PDF文字' },
  合計: { 税抜: 105000, 値引き: -5000, 諸経費: 10000 },
  行: [
    {
      名称: '軽量鉄骨天井下地',
      規格: '@300',
      数量: 100,
      単位: '㎡',
      単価: 1000,
      金額: 100000,
      細目: '天井下地|軽量鉄骨',
      条件: '1階',
      備考: '印字 1,000',
    },
    { 名称: '諸経費', 数量: 1, 単位: '式', 金額: 10000, 区分: '諸経費' },
    { 名称: '出精値引', 数量: 1, 単位: '式', 金額: -5000, 区分: '値引き' },
    {
      名称: '天井ボード張り',
      数量: 1,
      単位: '式',
      金額: 0,
      区分: '別途',
      換算: { 数量: 50, 単位: '㎡', 単価: 800, 根拠: '天井伏図 50㎡' },
    },
  ],
  採否: '採用',
  確定金額: 100000,
  条件: '足場は別途',
  参考: { 指定: ['概算のみ'], 理由: ['概算のみ'] },
  読取: {
    方法: 'PDF文字',
    日時: '2026-10-02T10:00:00+09:00',
    確認: '済',
    メモ: '手書きの追記あり',
  },
  ...overrides,
});

const jsonFile = (originalName: string, content: unknown): LedgerUploadFile => ({
  originalName,
  buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8'),
  mimeType: 'application/json',
});

const zipFile = (originalName: string, data: Uint8Array): LedgerUploadFile => ({
  originalName,
  buffer: Buffer.from(data),
  mimeType: 'application/zip',
});

const parseOne = (card: unknown, name = 'card.json'): LedgerCardParseOutcome => {
  const outcomes = parseUpload([jsonFile(name, card)]);
  expect(outcomes).toHaveLength(1);
  return outcomes[0] as LedgerCardParseOutcome;
};

const expectParsed = (outcome: LedgerCardParseOutcome): ParsedOutcome => {
  if (outcome.kind !== 'parsed') {
    throw new Error(`parsed を期待したが failed だった：${outcome.reason}`);
  }
  return outcome;
};

const expectFailed = (outcome: LedgerCardParseOutcome): FailedOutcome => {
  if (outcome.kind !== 'failed') {
    throw new Error('failed を期待したが parsed だった');
  }
  return outcome;
};

const catchError = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('例外を期待したが投げられなかった');
};

const expectTooLarge = (fn: () => unknown, limit: string): void => {
  const error = catchError(fn);
  expect(error).toBeInstanceOf(LedgerImportTooLargeError);
  expect((error as LedgerImportTooLargeError).limit).toBe(limit);
  expect((error as LedgerImportTooLargeError).statusCode).toBe(413);
};

/** zip の中央ディレクトリの 1 項目目の「展開後の大きさ」を書き換える（申告の大きさを偽る zip） */
const forgeCentralUncompressedSize = (zip: Uint8Array, size: number): Uint8Array => {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let i = out.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      const centralOffset = view.getUint32(i + 16, true);
      view.setUint32(centralOffset + 24, size, true);
      return out;
    }
  }
  throw new Error('zip の終わりの記録が見つからない');
};

/** zip の項目の名前の UTF-8 の印（一般の印のビット 11）を消す（UTF-8 の印の無い zip） */
const clearUtf8Flags = (zip: Uint8Array): Uint8Array => {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) {
      view.setUint16(i + 6, view.getUint16(i + 6, true) & ~0x0800, true);
    } else if (sig === 0x02014b50) {
      view.setUint16(i + 8, view.getUint16(i + 8, true) & ~0x0800, true);
    }
  }
  return out;
};

/** 指定の項目の圧縮の形式を、ローカルと中央ディレクトリの両方で書き換える */
const forgeCompressionMethod = (zip: Uint8Array, entryName: string, method: number): Uint8Array => {
  const out = new Uint8Array(zip);
  const view = new DataView(out.buffer);
  const target = strToU8(entryName);
  const nameAt = (offset: number, length: number): boolean =>
    length === target.length && target.every((b, k) => out[offset + k] === b);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50 && nameAt(i + 30, view.getUint16(i + 26, true))) {
      view.setUint16(i + 8, method, true);
    } else if (sig === 0x02014b50 && nameAt(i + 46, view.getUint16(i + 28, true))) {
      view.setUint16(i + 10, method, true);
    }
  }
  return out;
};

describe('parseUpload', () => {
  describe('正しいカードの対応づけ', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.1
     * @requirement unit-price-ledger/REQ-2.4
     * @requirement unit-price-ledger/REQ-2.5
     */
    it('カードの ID・原本のパス・案件名と、見積の情報を受領見積書の欄へ入れる', () => {
      const parsed = expectParsed(parseOne(validCard(), '20261001_山田内装.json'));

      expect(parsed.fileName).toBe('20261001_山田内装.json');
      expect(parsed.cardId).toBe('20261001_山田内装_A小学校改修');
      expect(parsed.truncatedFields).toEqual([]);
      expect(parsed.unreadableFields).toEqual([]);

      const { input } = parsed;
      expect(input.ledgerCardId).toBe('20261001_山田内装_A小学校改修');
      expect(input.ledgerSourcePath).toBe('A小学校改修/02_見積/01_山田内装/見積書.pdf');
      expect(input.ledgerProjectName).toBe('A小学校改修');
      expect(input.vendorName).toBe('山田内装');
      expect(input.submittedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(input.ledgerFields).toEqual({
        quoteNumber: 'Q-123',
        overallConditions: expect.stringMatching(/^足場は別途\n/),
        siteLocation: 'A市',
        constructionKind: 'RENOVATION',
        useType: '学校',
        constructionPrice: 12000000,
        workConditions: '夜間、居ながら',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        confirmedAmount: 100000,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('受領見積書の名前を「<業者>_<見積日>」とする', () => {
      const parsed = expectParsed(parseOne(validCard()));

      expect(parsed.input.name).toBe('山田内装_2026-10-01');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.6
     */
    it('明細行の名称・規格・数量・単位・単価・金額・条件・備考・区分・換算を明細行の欄へ入れ、本体を直接工事とする', () => {
      const parsed = expectParsed(parseOne(validCard()));
      const [body, overhead, discount, excluded] = parsed.input.lineItems;

      expect(parsed.input.lineItems).toHaveLength(4);
      expect(body).toEqual({
        sortOrder: 0,
        name: '軽量鉄骨天井下地',
        specification: '@300',
        unit: '㎡',
        quantity: 100,
        unitPrice: 1000,
        amount: 100000,
        remarks: '印字 1,000\n細目：天井下地|軽量鉄骨',
        category: 'DIRECT',
        condition: '1階',
        conversion: null,
        // カードの参考.理由（概算のみ）があるため、すべての行に参考の印と理由が付く（3.1）
        isReference: true,
        referenceReason: '概算のみ',
      });
      expect(overhead).toMatchObject({
        sortOrder: 1,
        category: 'OVERHEAD',
        unitPrice: null,
        specification: null,
        remarks: null,
      });
      expect(discount).toMatchObject({ sortOrder: 2, category: 'DISCOUNT', amount: -5000 });
      expect(excluded).toMatchObject({
        sortOrder: 3,
        category: 'EXCLUDED',
        conversion: { quantity: 50, unit: '㎡', unitPrice: 800, basis: '天井伏図 50㎡' },
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.6
     */
    it('区分の無い行は直接工事、交通費・産廃・法定福利費はそれぞれの区分とする', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({
            行: [
              { 名称: 'a', 数量: 1, 単位: '式', 金額: 1 },
              { 名称: 'b', 数量: 1, 単位: '式', 金額: 1, 区分: '本体' },
              { 名称: 'c', 数量: 1, 単位: '式', 金額: 1, 区分: '交通費' },
              { 名称: 'd', 数量: 1, 単位: '式', 金額: 1, 区分: '産廃' },
              { 名称: 'e', 数量: 1, 単位: '式', 金額: 1, 区分: '法定福利費' },
            ],
          })
        )
      );

      expect(parsed.input.lineItems.map((line) => line.category)).toEqual([
        'DIRECT',
        'DIRECT',
        'TRAVEL',
        'WASTE',
        'LEGAL_WELFARE',
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.5
     */
    it('新営は NEW_CONSTRUCTION、不採用は REJECTED、採否の無いカードは UNKNOWN とする', () => {
      const newBuild = expectParsed(
        parseOne(validCard({ 案件: { 名称: 'B', 区分: '新営' }, 採否: '不採用' }))
      );
      const noAdoption = expectParsed(parseOne(validCard({ 採否: undefined })));

      expect(newBuild.input.ledgerFields.constructionKind).toBe('NEW_CONSTRUCTION');
      expect(newBuild.input.ledgerFields.adoption).toBe('REJECTED');
      expect(noAdoption.input.ledgerFields.adoption).toBe('UNKNOWN');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.4
     * @requirement unit-price-ledger/REQ-2.5
     */
    it('任意の項目の無いカードは、その欄を空にして通す', () => {
      const parsed = expectParsed(
        parseOne({
          id: 'min-card',
          業者: '最小業者',
          見積日: '2026-01-31',
          行: [{ 名称: '工事', 数量: 1, 単位: '式', 金額: 500 }],
        })
      );

      expect(parsed.input.ledgerSourcePath).toBeNull();
      expect(parsed.input.ledgerProjectName).toBeNull();
      expect(parsed.input.ledgerFields).toEqual({
        quoteNumber: null,
        overallConditions: null,
        siteLocation: null,
        constructionKind: null,
        useType: null,
        constructionPrice: null,
        workConditions: null,
        distanceKm: null,
        adoption: 'UNKNOWN',
        confirmedAmount: null,
      });
      expect(parsed.input.readingConfirmed).toEqual({ confirmed: false, readAt: null });
      expect(parsed.referenceReasons).toEqual([]);
      expect(parsed.unreadableFields).toEqual([]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.4
     */
    it('読取の確認と日時、カードの参考の理由、合計を、後の取り込みと参考の理由のために返す', () => {
      const parsed = expectParsed(parseOne(validCard()));
      const unconfirmed = expectParsed(
        parseOne(validCard({ 読取: { 方法: '画像読取', 確認: '未' } }))
      );

      expect(parsed.input.readingConfirmed.confirmed).toBe(true);
      expect(parsed.input.readingConfirmed.readAt?.toISOString()).toBe('2026-10-02T01:00:00.000Z');
      expect(unconfirmed.input.readingConfirmed).toEqual({ confirmed: false, readAt: null });
      const micro = expectParsed(
        parseOne(
          validCard({
            読取: { 方法: '画像読取', 確認: '済', 日時: '2026-10-02T10:00:00.123456+09:00' },
          })
        )
      );
      expect(micro.input.readingConfirmed.readAt?.toISOString()).toBe('2026-10-02T01:00:00.123Z');
      expect(micro.unreadableFields).toEqual([]);
      expect(parsed.referenceReasons).toEqual(['概算のみ']);
      expect(parsed.declaredTotals).toEqual({
        taxExcluded: 105000,
        DISCOUNT: -5000,
        OVERHEAD: 10000,
        TRAVEL: null,
        WASTE: null,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.6
     */
    it('数量・金額が数の文字のときは数として読む', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({ 行: [{ 名称: 'a', 数量: '2.5', 単位: 'm', 単価: '100', 金額: '250' }] })
        )
      );

      expect(parsed.input.lineItems[0]).toMatchObject({
        quantity: 2.5,
        unitPrice: 100,
        amount: 250,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('UTF-8 の BOM の付いた JSON を読める', () => {
      const outcome = parseUpload([
        {
          originalName: 'bom.json',
          buffer: Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from(JSON.stringify(validCard()), 'utf8'),
          ]),
          mimeType: 'application/json',
        },
      ])[0] as LedgerCardParseOutcome;

      expect(expectParsed(outcome).cardId).toBe('20261001_山田内装_A小学校改修');
    });
  });

  describe('細目と 6 つの項目', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.7
     */
    it('細目を備考の末尾に「細目：」の見出しを付けて足し、備考の無い行は細目だけにする', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({
            行: [
              { 名称: 'a', 数量: 1, 単位: '式', 金額: 1, 備考: 'メモ', 細目: 'X|Y' },
              { 名称: 'b', 数量: 1, 単位: '式', 金額: 1, 細目: 'Z|W' },
              { 名称: 'c', 数量: 1, 単位: '式', 金額: 1, 備考: 'メモだけ' },
            ],
          })
        )
      );

      expect(parsed.input.lineItems.map((line) => line.remarks)).toEqual([
        'メモ\n細目：X|Y',
        '細目：Z|W',
        'メモだけ',
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.8
     */
    it('発注者・延床・工事価格の根拠・工種の一覧・読取の方法とメモ・種別を、見出しを付けて見積全体の条件の末尾に足す', () => {
      const parsed = expectParsed(parseOne(validCard({ 種別: '単価見積' })));

      expect(parsed.input.ledgerFields.overallConditions).toBe(
        [
          '足場は別途',
          '発注者：A市',
          '延床（㎡）：1500',
          '工事価格の根拠：自社の御見積書 2026-10-10（提出）',
          '工種：内装、軽天・ボード',
          '読取の方法：PDF文字',
          '読取のメモ：手書きの追記あり',
          '種別：単価見積',
        ].join('\n')
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-2.8
     */
    it('カードの条件が無いときは、足す項目だけで見積全体の条件を作り、無い項目は足さない', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({
            条件: undefined,
            種別: undefined,
            案件: { 名称: 'A小学校改修', 発注者: 'A市' },
            読取: { 確認: '未' },
            工種: undefined,
          })
        )
      );

      expect(parsed.input.ledgerFields.overallConditions).toBe('発注者：A市');
    });
  });

  describe('切り詰め', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.9
     */
    it('上限を超える値を上限までで切り詰め、切り詰めた欄を返す', () => {
      const longVendor = '業'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName + 5);
      const parsed = expectParsed(
        parseOne(
          validCard({
            業者: longVendor,
            見積番号: 'N'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber + 1),
            id: 'i'.repeat(LEDGER_FIELD_LIMITS.ledgerCardId + 1),
            原本: { パス: 'p'.repeat(LEDGER_FIELD_LIMITS.ledgerSourcePath + 1) },
            案件: {
              名称: '案'.repeat(LEDGER_FIELD_LIMITS.ledgerProjectName + 1),
              場所: '場'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.siteLocation + 1),
              用途: '用'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.useType + 1),
              作業条件: ['作'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.workConditions + 1)],
            },
            条件: '条'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.overallConditions + 1),
            行: [
              {
                名称: 'a',
                数量: 1,
                単位: '式',
                金額: 1,
                条件: 'c'.repeat(LINE_ITEM_FIELD_LIMITS.condition + 1),
                換算: {
                  数量: 1,
                  単位: 'u'.repeat(LINE_ITEM_FIELD_LIMITS.conversionUnit + 1),
                  単価: 1,
                  根拠: 'b'.repeat(LINE_ITEM_FIELD_LIMITS.conversionBasis + 1),
                },
              },
            ],
          })
        )
      );
      const { input } = parsed;

      expect(input.vendorName).toBe('業'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName));
      expect(input.ledgerFields.quoteNumber).toHaveLength(
        RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber
      );
      expect(input.ledgerCardId).toHaveLength(LEDGER_FIELD_LIMITS.ledgerCardId);
      expect(parsed.cardId).toBe(input.ledgerCardId);
      expect(input.ledgerSourcePath).toHaveLength(LEDGER_FIELD_LIMITS.ledgerSourcePath);
      expect(input.ledgerProjectName).toHaveLength(LEDGER_FIELD_LIMITS.ledgerProjectName);
      expect(input.ledgerFields.siteLocation).toHaveLength(
        RECEIVED_QUOTATION_FIELD_LIMITS.siteLocation
      );
      expect(input.ledgerFields.useType).toHaveLength(RECEIVED_QUOTATION_FIELD_LIMITS.useType);
      expect(input.ledgerFields.workConditions).toHaveLength(
        RECEIVED_QUOTATION_FIELD_LIMITS.workConditions
      );
      expect(input.ledgerFields.overallConditions).toHaveLength(
        RECEIVED_QUOTATION_FIELD_LIMITS.overallConditions
      );
      expect(input.lineItems[0]?.condition).toHaveLength(LINE_ITEM_FIELD_LIMITS.condition);
      expect(input.lineItems[0]?.conversion?.unit).toHaveLength(
        LINE_ITEM_FIELD_LIMITS.conversionUnit
      );
      expect(input.lineItems[0]?.conversion?.basis).toHaveLength(
        LINE_ITEM_FIELD_LIMITS.conversionBasis
      );
      // 受領見積書の名前は切り詰めた業者名と見積日から作り、名前の上限（200）までで切り詰める
      expect(input.name).toHaveLength(200);
      expect(parsed.truncatedFields).toEqual([
        'カードの ID',
        '業者名',
        '受領見積書名',
        '見積番号',
        '原本のパス',
        '案件名',
        '場所',
        '用途',
        '作業条件',
        '見積全体の条件',
        '明細行 1 行目の条件',
        '明細行 1 行目の換算の単位',
        '明細行 1 行目の換算の根拠',
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.9
     */
    it('上限ちょうどの値は切り詰めない', () => {
      const parsed = expectParsed(
        parseOne(validCard({ 業者: '業'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName - 11) }))
      );

      expect(parsed.input.name).toHaveLength(200);
      expect(parsed.truncatedFields).toEqual([]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.9
     */
    it('サロゲートペアの文字を途中で割らずに切り詰める', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({ 見積番号: 'a' + '𠮷'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber) })
        )
      );

      const quoteNumber = parsed.input.ledgerFields.quoteNumber ?? '';
      expect(quoteNumber.length).toBeLessThanOrEqual(RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber);
      expect(quoteNumber).toBe(
        'a' + '𠮷'.repeat((RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber - 2) / 2)
      );
      expect(parsed.truncatedFields).toEqual(['見積番号']);
    });
  });

  describe('読めない JSON と必須の項目の欠け', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.2
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('JSON として読めないファイルは、ファイル名と理由を付けて失敗とし、残りのカードを続ける', () => {
      const outcomes = parseUpload([
        jsonFile('broken.json', '{"id": "x", '),
        jsonFile('ok.json', validCard()),
        jsonFile('array.json', '[1, 2]'),
      ]);

      expect(outcomes.map((o) => o.kind)).toEqual(['failed', 'parsed', 'failed']);
      expect(outcomes[0]).toEqual({
        kind: 'failed',
        fileName: 'broken.json',
        reason: 'JSON として読み込めません',
      });
      expect(outcomes[2]).toEqual({
        kind: 'failed',
        fileName: 'array.json',
        reason: '見積カードの形（JSON のオブジェクト）ではありません',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('UTF-8 として読めないファイルは失敗とする', () => {
      const outcome = parseUpload([
        {
          originalName: 'sjis.json',
          buffer: Buffer.from([0x7b, 0x82, 0xa0, 0x7d]),
          mimeType: 'application/json',
        },
      ])[0] as LedgerCardParseOutcome;

      expect(expectFailed(outcome).reason).toBe('JSON として読み込めません');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.2
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('id・業者・見積日・行の欠けを理由に並べて失敗とする', () => {
      const failed = expectFailed(
        parseOne(
          validCard({ id: undefined, 業者: '  ', 見積日: undefined, 行: undefined }),
          'x.json'
        )
      );

      expect(failed).toEqual({
        kind: 'failed',
        fileName: 'x.json',
        reason: '必須の項目が欠けているか読めません：id、業者、見積日、行',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.2
     */
    it('行が空のカードは失敗とする', () => {
      const failed = expectFailed(parseOne(validCard({ 行: [] })));

      expect(failed.reason).toBe('必須の項目が欠けているか読めません：行');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.2
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('各行の名称・数量・単位・金額の欠けと、数でない数量・金額を、行の番号を付けて失敗とする', () => {
      const failed = expectFailed(
        parseOne(
          validCard({
            行: [
              { 名称: 'ok', 数量: 1, 単位: '式', 金額: 1 },
              { 数量: 1, 単位: '式', 金額: 1 },
              { 名称: 'b', 数量: 'たくさん', 単位: '', 金額: null },
              '行ではない',
            ],
          })
        )
      );

      expect(failed.reason).toBe(
        '必須の項目が欠けているか読めません：行 2 の名称、行 3 の数量、行 3 の単位、行 3 の金額、行 4'
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-2.2
     */
    it('見積日が YYYY-MM-DD の実在する日付でないカードは失敗とする', () => {
      expect(expectFailed(parseOne(validCard({ 見積日: '2026/10/01' }))).reason).toBe(
        '必須の項目が欠けているか読めません：見積日'
      );
      expect(expectFailed(parseOne(validCard({ 見積日: '2026-02-30' }))).reason).toBe(
        '必須の項目が欠けているか読めません：見積日'
      );
    });
  });

  describe('読めない任意の値', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.2
     */
    it('任意の項目の不正な値は空にし、カードを失敗にせず、読めなかった欄を返す', () => {
      const parsed = expectParsed(
        parseOne(
          validCard({
            見積番号: { x: 1 },
            採否: 'たぶん',
            確定金額: -1,
            案件: {
              名称: 'A',
              区分: '改築',
              工事価格: 'たかい',
              片道km: 1.25,
              作業条件: [{ x: 1 }, '夜間'],
            },
            読取: { 確認: '済', 日時: 'きのう' },
            行: [
              {
                名称: 'a',
                数量: 1,
                単位: '式',
                金額: 1,
                単価: 'x',
                区分: '雑費',
                換算: { 数量: 0, 単位: '㎡', 単価: 1, 根拠: 'r' },
              },
            ],
          })
        )
      );

      expect(parsed.input.ledgerFields).toMatchObject({
        quoteNumber: null,
        adoption: 'UNKNOWN',
        confirmedAmount: null,
        constructionKind: null,
        constructionPrice: null,
        distanceKm: null,
        workConditions: null,
      });
      expect(parsed.input.readingConfirmed).toEqual({ confirmed: true, readAt: null });
      expect(parsed.input.lineItems[0]).toMatchObject({
        unitPrice: null,
        category: 'DIRECT',
        conversion: null,
      });
      expect(parsed.unreadableFields).toEqual([
        '見積番号',
        '改修／新営',
        '工事価格',
        '作業条件',
        '片道の距離',
        '採否',
        '確定金額',
        '読取の日時',
        '明細行 1 行目の単価',
        '明細行 1 行目の区分',
        '明細行 1 行目の換算',
      ]);
    });
  });

  describe('参考の理由', () => {
    const REASON = {
      AMOUNT: '金額が数量×単価と合わない',
      TOTAL: '合計が明細行と合わない',
      TRUNCATED: '文字数の上限で切り詰めた',
      UNREADABLE: '読めない値を空にした',
    } as const;

    /** 参考の理由の無い最小のカード */
    const plainCard = (overrides: Card = {}): Card => ({
      id: 'plain-card',
      業者: '最小業者',
      見積日: '2026-01-31',
      行: [
        { 名称: '工事', 数量: 2, 単位: '㎡', 単価: 250, 金額: 500 },
        { 名称: '諸経費', 数量: 1, 単位: '式', 金額: 50, 区分: '諸経費' },
      ],
      ...overrides,
    });

    const lineMarks = (parsed: ParsedOutcome): Array<[boolean, string | null]> =>
      parsed.input.lineItems.map((line) => [line.isReference, line.referenceReason]);

    /**
     * @requirement unit-price-ledger/REQ-3.1
     */
    it('理由の無いカードは、どの行にも参考の印と理由を付けない', () => {
      const parsed = expectParsed(
        parseOne(plainCard({ 合計: { 税抜: 550, 諸経費: 50 }, 参考: { 理由: [] } }))
      );

      expect(parsed.referenceReasons).toEqual([]);
      expect(lineMarks(parsed)).toEqual([
        [false, null],
        [false, null],
      ]);
      expect(parsed.input.ledgerFields.overallConditions).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-3.1
     */
    it('カードの参考.理由があれば、すべての行に参考の印を付け、理由を「、」でつなぐ', () => {
      const parsed = expectParsed(
        parseOne(plainCard({ 参考: { 指定: ['概算のみ'], 理由: ['概算のみ', '手書きの追記'] } }))
      );

      expect(parsed.referenceReasons).toEqual(['概算のみ', '手書きの追記']);
      expect(lineMarks(parsed)).toEqual([
        [true, '概算のみ、手書きの追記'],
        [true, '概算のみ、手書きの追記'],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.2
     */
    it('数量×単価が金額と 1 円を超えて違う行があれば「金額が数量×単価と合わない」を加える', () => {
      const parsed = expectParsed(
        parseOne(
          plainCard({
            行: [
              { 名称: '工事', 数量: 3, 単位: '㎡', 単価: 100, 金額: 301.5 },
              { 名称: '雑工事', 数量: 1, 単位: '式', 金額: 999 },
            ],
          })
        )
      );

      expect(parsed.referenceReasons).toEqual([REASON.AMOUNT]);
      expect(lineMarks(parsed)).toEqual([
        [true, REASON.AMOUNT],
        [true, REASON.AMOUNT],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.2
     */
    it('違いが 1 円以内の行・単価の無い行は理由にせず、小数の積は誤差なく比べる', () => {
      const parsed = expectParsed(
        parseOne(
          plainCard({
            行: [
              { 名称: '工事', 数量: 3, 単位: '㎡', 単価: 100, 金額: 301 },
              { 名称: '工事2', 数量: 3, 単位: '㎡', 単価: 100, 金額: 299 },
              // 0.1 × 3 は浮動小数では 0.30000000000000004 になる。金額 1.3 との違いはちょうど 1 円
              { 名称: '工事3', 数量: 0.1, 単位: 'm', 単価: 3, 金額: 1.3 },
              { 名称: '単価の無い行', 数量: 10, 単位: '式', 金額: 5 },
            ],
          })
        )
      );

      expect(parsed.referenceReasons).toEqual([]);
      expect(lineMarks(parsed).every(([mark]) => !mark)).toBe(true);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.3
     */
    it('別途を除く行の金額の合計がカードの税抜の合計と違えば「合計が明細行と合わない」を加える', () => {
      const matched = expectParsed(
        parseOne(
          plainCard({
            行: [
              { 名称: '工事', 数量: 2, 単位: '㎡', 単価: 250, 金額: 500 },
              { 名称: '別途工事', 数量: 1, 単位: '式', 金額: 9999, 区分: '別途' },
            ],
            合計: { 税抜: 500 },
          })
        )
      );
      const mismatched = expectParsed(parseOne(plainCard({ 合計: { 税抜: 549 } })));
      // 合計はどちらも円の単位に四捨五入してから比べる（550.4 と 550 は同じ、550.5 と 550 は違う）
      const roundedSame = expectParsed(
        parseOne(
          plainCard({
            行: [{ 名称: '工事', 数量: 1, 単位: '式', 単価: 550.4, 金額: 550.4 }],
            合計: { 税抜: 550 },
          })
        )
      );
      const roundedDiff = expectParsed(
        parseOne(
          plainCard({
            行: [{ 名称: '工事', 数量: 1, 単位: '式', 単価: 550.5, 金額: 550.5 }],
            合計: { 税抜: 550 },
          })
        )
      );

      expect(matched.referenceReasons).toEqual([]);
      expect(roundedSame.referenceReasons).toEqual([]);
      expect(roundedDiff.referenceReasons).toEqual([REASON.TOTAL]);
      expect(mismatched.referenceReasons).toEqual([REASON.TOTAL]);
      expect(lineMarks(mismatched)).toEqual([
        [true, REASON.TOTAL],
        [true, REASON.TOTAL],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.3
     */
    it('区分ごとの行の合計がカードの値引き・諸経費・交通費・産廃の合計と違えば理由を加え、カードに無い合計は比べない', () => {
      const lines = [
        { 名称: '工事', 数量: 1, 単位: '式', 金額: 1000 },
        { 名称: '値引', 数量: 1, 単位: '式', 金額: -100, 区分: '値引き' },
        { 名称: '諸経費', 数量: 1, 単位: '式', 金額: 80, 区分: '諸経費' },
        { 名称: '交通費', 数量: 1, 単位: '式', 金額: 30, 区分: '交通費' },
        { 名称: '産廃', 数量: 1, 単位: '式', 金額: 20, 区分: '産廃' },
      ];
      const allMatched = expectParsed(
        parseOne(
          plainCard({
            行: lines,
            合計: { 税抜: 1030, 値引き: -100, 諸経費: 80, 交通費: 30, 産廃: 20 },
          })
        )
      );
      const noTotals = expectParsed(parseOne(plainCard({ 行: lines })));

      expect(allMatched.referenceReasons).toEqual([]);
      expect(noTotals.referenceReasons).toEqual([]);
      for (const totals of [
        { 値引き: -90 },
        { 諸経費: 81 },
        { 交通費: 0 },
        { 産廃: 21 },
        // 区分の行が無い合計は、行の合計 0 と比べる
      ]) {
        const parsed = expectParsed(parseOne(plainCard({ 行: lines, 合計: totals })));
        expect(parsed.referenceReasons).toEqual([REASON.TOTAL]);
      }
      const missingCategory = expectParsed(
        parseOne(plainCard({ 行: [lines[0]], 合計: { 産廃: 20 } }))
      );
      expect(missingCategory.referenceReasons).toEqual([REASON.TOTAL]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.3
     */
    it('合計が複数で合わなくても「合計が明細行と合わない」は 1 つだけ加える', () => {
      const parsed = expectParsed(parseOne(plainCard({ 合計: { 税抜: 1, 諸経費: 2 } })));

      expect(parsed.referenceReasons).toEqual([REASON.TOTAL]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.4
     */
    it('値を文字数の上限で切り詰めたら「文字数の上限で切り詰めた」を加える', () => {
      const parsed = expectParsed(
        parseOne(
          plainCard({ 見積番号: 'N'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber + 1) })
        )
      );

      expect(parsed.truncatedFields).toEqual(['見積番号']);
      expect(parsed.referenceReasons).toEqual([REASON.TRUNCATED]);
      expect(lineMarks(parsed)).toEqual([
        [true, REASON.TRUNCATED],
        [true, REASON.TRUNCATED],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.4
     */
    it('任意の欄の読めない値を空にしたら「読めない値を空にした」を加える', () => {
      const parsed = expectParsed(parseOne(plainCard({ 採否: 'たぶん', 見積番号: { x: 1 } })));

      expect(parsed.unreadableFields).toEqual(['見積番号', '採否']);
      expect(parsed.referenceReasons).toEqual([REASON.UNREADABLE]);
      expect(lineMarks(parsed)).toEqual([
        [true, REASON.UNREADABLE],
        [true, REASON.UNREADABLE],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.1
     * @requirement unit-price-ledger/REQ-3.2
     * @requirement unit-price-ledger/REQ-3.3
     * @requirement unit-price-ledger/REQ-3.4
     */
    it('カードの理由の後に、金額・合計・切り詰め・読めない値の理由をこの順に加え、同じ理由は重ねない', () => {
      const parsed = expectParsed(
        parseOne(
          plainCard({
            見積番号: 'N'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.quoteNumber + 1),
            採否: 'たぶん',
            合計: { 税抜: 1 },
            行: [{ 名称: '工事', 数量: 2, 単位: '㎡', 単価: 250, 金額: 400 }],
            参考: { 理由: ['概算のみ', REASON.TOTAL] },
          })
        )
      );

      const expected = [
        '概算のみ',
        REASON.TOTAL,
        REASON.AMOUNT,
        REASON.TRUNCATED,
        REASON.UNREADABLE,
      ];
      expect(parsed.referenceReasons).toEqual(expected);
      expect(lineMarks(parsed)).toEqual([[true, expected.join('、')]]);
      // 200 文字以内なので、見積全体の条件には足さない
      expect(parsed.input.ledgerFields.overallConditions).toBeNull();
    });

    /**
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('つないだ理由がちょうど 200 文字なら切り詰めず、見積全体の条件にも足さない', () => {
      const max = LINE_ITEM_FIELD_LIMITS.referenceReason;
      expect(max).toBe(200);
      const reasons = ['あ'.repeat(99), 'い'.repeat(max - 100)];
      const parsed = expectParsed(
        parseOne(plainCard({ 条件: '足場は別途', 参考: { 理由: reasons } }))
      );

      expect(parsed.input.lineItems[0]?.referenceReason).toBe(reasons.join('、'));
      expect(parsed.input.lineItems[0]?.referenceReason).toHaveLength(max);
      expect(parsed.input.ledgerFields.overallConditions).toBe('足場は別途');
    });

    /**
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('つないだ理由が 200 文字を超えたら 200 文字までで切り詰め、全文を見積全体の条件の末尾に「参考の理由：」で足す', () => {
      const max = LINE_ITEM_FIELD_LIMITS.referenceReason;
      const reasons = ['あ'.repeat(150), 'い'.repeat(60)];
      const parsed = expectParsed(
        parseOne(
          plainCard({
            条件: '足場は別途',
            案件: { 発注者: 'A市' },
            合計: { 税抜: 1 },
            参考: { 理由: reasons },
          })
        )
      );
      const full = [...reasons, REASON.TOTAL].join('、');

      expect(full.length).toBeGreaterThan(max);
      for (const line of parsed.input.lineItems) {
        expect(line.isReference).toBe(true);
        expect(line.referenceReason).toBe(full.slice(0, max));
      }
      expect(parsed.input.ledgerFields.overallConditions).toBe(
        `足場は別途\n発注者：A市\n参考の理由：${full}`
      );
      // 理由の全文は見積全体の条件に残るため、参考の理由の切り詰めは切り詰めた欄に数えない
      expect(parsed.truncatedFields).toEqual([]);
      expect(parsed.referenceReasons).toEqual([...reasons, REASON.TOTAL]);
    });

    /**
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('見積全体の条件が無いカードでも、理由の全文を「参考の理由：」だけで見積全体の条件に入れる', () => {
      const reasons = ['あ'.repeat(201)];
      const parsed = expectParsed(parseOne(plainCard({ 参考: { 理由: reasons } })));

      expect(parsed.input.ledgerFields.overallConditions).toBe(`参考の理由：${reasons[0]}`);
      expect(parsed.input.lineItems[0]?.referenceReason).toHaveLength(
        LINE_ITEM_FIELD_LIMITS.referenceReason
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('サロゲートペアの文字を途中で割らずに理由を切り詰める', () => {
      const reasons = ['a' + '𠮷'.repeat(150)];
      const parsed = expectParsed(parseOne(plainCard({ 参考: { 理由: reasons } })));

      expect(parsed.input.lineItems[0]?.referenceReason).toBe(
        'a' + '𠮷'.repeat((LINE_ITEM_FIELD_LIMITS.referenceReason - 2) / 2)
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-3.4
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('理由の全文を足して見積全体の条件が上限を超えたら、上限で切り詰め、切り詰めの理由も加える', () => {
      const overallMax = RECEIVED_QUOTATION_FIELD_LIMITS.overallConditions;
      const reasonMax = LINE_ITEM_FIELD_LIMITS.referenceReason;
      const reasons = ['あ'.repeat(reasonMax + 1)];
      const conditions = '条'.repeat(overallMax - 100);
      const parsed = expectParsed(
        parseOne(plainCard({ 条件: conditions, 参考: { 理由: reasons } }))
      );
      const full = [...reasons, REASON.TRUNCATED].join('、');

      expect(parsed.referenceReasons).toEqual([...reasons, REASON.TRUNCATED]);
      expect(parsed.truncatedFields).toEqual(['見積全体の条件']);
      expect(parsed.input.ledgerFields.overallConditions).toBe(
        `${conditions}\n参考の理由：${full}`.slice(0, overallMax)
      );
      expect(parsed.input.lineItems[0]?.referenceReason).toBe(full.slice(0, reasonMax));
    });

    /**
     * @requirement unit-price-ledger/REQ-3.4
     * @requirement unit-price-ledger/REQ-3.5
     */
    it('見積全体の条件がもとから上限を超えるときも、切り詰めた欄は 1 度だけ数える', () => {
      const overallMax = RECEIVED_QUOTATION_FIELD_LIMITS.overallConditions;
      const reasons = ['あ'.repeat(LINE_ITEM_FIELD_LIMITS.referenceReason + 1)];
      const parsed = expectParsed(
        parseOne(plainCard({ 条件: '条'.repeat(overallMax + 1), 参考: { 理由: reasons } }))
      );

      expect(parsed.truncatedFields).toEqual(['見積全体の条件']);
      expect(parsed.referenceReasons).toEqual([...reasons, REASON.TRUNCATED]);
      expect(parsed.input.ledgerFields.overallConditions).toBe('条'.repeat(overallMax));
    });
  });

  describe('zip の読み取り', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('zip の中の .json の項目を 1 枚ずつカードとして読み、入力の順に結果を返す', () => {
      const zipped = zipSync({
        'cards/a.json': strToU8(JSON.stringify(validCard({ id: 'card-a' }))),
        'cards/b.json': strToU8('not json'),
        'cards/c.JSON': strToU8(JSON.stringify(validCard({ id: 'card-c' }))),
      });

      const outcomes = parseUpload([
        jsonFile('first.json', validCard({ id: 'first' })),
        zipFile('cards.zip', zipped),
      ]);

      expect(outcomes.map((o) => [o.kind, o.fileName])).toEqual([
        ['parsed', 'first.json'],
        ['parsed', 'cards/a.json'],
        ['failed', 'cards/b.json'],
        ['parsed', 'cards/c.JSON'],
      ]);
      expect(outcomes.filter((o) => o.kind === 'parsed').map((o) => o.cardId)).toEqual([
        'first',
        'card-a',
        'card-c',
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('対応していない圧縮の形式の項目は、zip の中の順のまま失敗として返す', () => {
      const zipped = forgeCompressionMethod(
        zipSync({
          'cards/a.json': strToU8(JSON.stringify(validCard({ id: 'card-a' }))),
          'cards/b.json': strToU8(JSON.stringify(validCard({ id: 'card-b' }))),
          'cards/c.json': strToU8(JSON.stringify(validCard({ id: 'card-c' }))),
        }),
        'cards/b.json',
        12
      );

      const outcomes = parseUpload([zipFile('cards.zip', zipped)]);

      expect(outcomes.map((o) => [o.kind, o.fileName])).toEqual([
        ['parsed', 'cards/a.json'],
        ['failed', 'cards/b.json'],
        ['parsed', 'cards/c.json'],
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('.json でない項目・ディレクトリ・不正な名前の項目は読まない', () => {
      const card = strToU8(JSON.stringify(validCard()));
      const zipped = zipSync({
        'cards/ok.json': card,
        'cards/readme.txt': strToU8('memo'),
        'cards/sub/': new Uint8Array(0),
        '../evil.json': card,
        'cards/../../evil2.json': card,
        '/abs.json': card,
        'C:/drive.json': card,
        'cards\\back.json': card,
        'cards/ctrl\u0001.json': card,
        '__MACOSX/cards/._ok.json': strToU8('junk'),
      });

      const outcomes = parseUpload([zipFile('cards.zip', zipped)]);

      expect(outcomes.map((o) => o.fileName)).toEqual(['cards/ok.json']);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('UTF-8 の印の無い項目の名前を UTF-8 として読み直す', () => {
      const zipped = clearUtf8Flags(
        zipSync({ 'cards/山田内装.json': strToU8(JSON.stringify(validCard())) })
      );

      const outcomes = parseUpload([zipFile('cards.zip', zipped)]);

      expect(outcomes.map((o) => o.fileName)).toEqual(['cards/山田内装.json']);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.3
     */
    it('zip として読めないファイルと、カードの無い zip は、そのファイルの失敗とする', () => {
      const outcomes = parseUpload([
        zipFile('broken.zip', strToU8('PK not a zip')),
        zipFile('empty.zip', zipSync({ 'readme.txt': strToU8('x') })),
        jsonFile('ok.json', validCard()),
      ]);

      expect(outcomes).toEqual([
        { kind: 'failed', fileName: 'broken.zip', reason: 'zip として読み込めません' },
        {
          kind: 'failed',
          fileName: 'empty.zip',
          reason: 'zip の中に見積カード（.json）がありません',
        },
        expect.objectContaining({ kind: 'parsed', fileName: 'ok.json' }),
      ]);
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('zip でも JSON でもないファイルは失敗とする', () => {
      const outcome = parseUpload([
        { originalName: 'card.pdf', buffer: Buffer.from('%PDF'), mimeType: 'application/pdf' },
      ])[0] as LedgerCardParseOutcome;

      expect(outcome).toEqual({
        kind: 'failed',
        fileName: 'card.pdf',
        reason: '見積カードの zip または JSON のファイルではありません',
      });
    });
  });

  describe('上限の超過', () => {
    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('上限の値は design のとおり（zip 50MB・項目 2000・項目 1MB・合計 200MB・JSON 2000 個・1MB）', () => {
      expect(LEDGER_IMPORT_LIMITS).toEqual({
        zipSize: 50 * 1024 * 1024,
        zipEntryCount: 2000,
        zipEntrySize: 1024 * 1024,
        zipTotalUncompressedSize: 200 * 1024 * 1024,
        fileCount: 2000,
        jsonFileSize: 1024 * 1024,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('zip の大きさが 50MB を超えたら要求を拒む', () => {
      const big = zipFile('big.zip', new Uint8Array(LEDGER_IMPORT_LIMITS.zipSize + 1));

      expectTooLarge(() => parseUpload([big]), 'ZIP_SIZE');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('zip の項目の数が 2000 を超えたら要求を拒む', () => {
      const entries: Record<string, Uint8Array> = {};
      for (let i = 0; i <= LEDGER_IMPORT_LIMITS.zipEntryCount; i++) {
        entries[`cards/${i}.txt`] = new Uint8Array(0);
      }

      expectTooLarge(() => parseUpload([zipFile('many.zip', zipSync(entries))]), 'ENTRY_COUNT');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('項目の展開後の大きさが 1MB を超えたら、展開の前に要求を拒む', () => {
      const huge = strToU8(`{"pad":"${' '.repeat(LEDGER_IMPORT_LIMITS.zipEntrySize)}"}`);

      expectTooLarge(
        () => parseUpload([zipFile('bomb.zip', zipSync({ 'cards/huge.json': huge }))]),
        'ENTRY_SIZE'
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('展開後の大きさの申告を偽った無圧縮の項目も、圧縮後の大きさで要求を拒む', () => {
      const actual = new Uint8Array(LEDGER_IMPORT_LIMITS.zipEntrySize + 10).fill(0x20);
      const forged = forgeCentralUncompressedSize(
        zipSync({ 'cards/liar.json': [actual, { level: 0 }] }),
        10
      );

      expectTooLarge(() => parseUpload([zipFile('liar.zip', forged)]), 'ENTRY_SIZE');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('展開後の合計の大きさが上限を超えたら要求を拒む（複数の zip の合計）', () => {
      const card = strToU8(
        JSON.stringify({
          id: 'c',
          業者: 'v',
          見積日: '2026-01-01',
          行: [{ 名称: 'a', 数量: 1, 単位: '式', 金額: 1 }],
        })
      );
      const limits = {
        ...LEDGER_IMPORT_LIMITS,
        zipTotalUncompressedSize: Math.floor(card.length * 1.5),
      };

      expect(() =>
        parseUpload([zipFile('one.zip', zipSync({ 'a.json': card }))], limits)
      ).not.toThrow();
      expectTooLarge(
        () =>
          parseUpload(
            [
              zipFile('one.zip', zipSync({ 'a.json': card })),
              zipFile('two.zip', zipSync({ 'b.json': card })),
            ],
            limits
          ),
        'TOTAL_UNCOMPRESSED_SIZE'
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('ファイルの数が 2000 を超えたら要求を拒む', () => {
      const files = Array.from({ length: LEDGER_IMPORT_LIMITS.fileCount + 1 }, (_, i) =>
        jsonFile(`${i}.json`, '{}')
      );

      expectTooLarge(() => parseUpload(files), 'FILE_COUNT');
    });

    /**
     * @requirement unit-price-ledger/REQ-2.1
     */
    it('JSON のファイルが 1MB を超えたら要求を拒む', () => {
      const big = jsonFile('big.json', ' '.repeat(LEDGER_IMPORT_LIMITS.jsonFileSize + 1));

      expectTooLarge(() => parseUpload([big]), 'FILE_SIZE');
    });
  });
});
