/**
 * @fileoverview 単価台帳の要求の検証スキーマの単体試験（unit-price-ledger タスク1.4）
 *
 * 一覧の絞り込み・修正（案件の無い受領見積書）・印の更新（案件の受領見積書）・似た単価の問い合わせの
 * 要求の検証を確かめる。上限の値は受領見積書の明細行と台帳の情報の検証の定義から取る。
 */
import { describe, it, expect } from 'vitest';
import {
  LEDGER_PAGE_SIZE,
  LEDGER_FIELD_LIMITS,
  SIMILAR_PRICE_QUERY_LIMITS,
  UNIT_PRICE_LEDGER_VALIDATION_MESSAGES,
  ledgerListQuerySchema,
  ledgerFilterSchema,
  ledgerQuotationIdParamSchema,
  ledgerQuotationUpdateSchema,
  ledgerMarksUpdateSchema,
  similarPriceQuerySchema,
} from '../../../schemas/unit-price-ledger.schema.js';
import {
  LINE_ITEM_FIELD_LIMITS,
  LINE_ITEM_VALIDATION_MESSAGES,
  RECEIVED_QUOTATION_FIELD_LIMITS,
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
} from '../../../schemas/received-quotation.schema.js';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_UUID = '223e4567-e89b-12d3-a456-426614174000';
const UPDATED_AT = '2026-11-16T00:00:00.000Z';

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('unit-price-ledger.schema', () => {
  describe('一覧の絞り込み（ledgerListQuerySchema）', () => {
    it('クエリの文字を絞り込みの値に直す', () => {
      const result = ledgerListQuerySchema.safeParse({
        keyword: ' 塗装 ',
        submittedFrom: '2025-01-01',
        submittedTo: '2025-12-31',
        hasProject: 'false',
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        constructionKind: 'RENOVATION',
        needsReview: 'true',
        missingClassificationKey: 'true',
        page: '2',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        keyword: '塗装',
        submittedFrom: '2025-01-01',
        submittedTo: '2025-12-31',
        hasProject: false,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        constructionKind: 'RENOVATION',
        needsReview: true,
        missingClassificationKey: true,
        page: 2,
      });
    });

    it('何も指定しないときは 1 ページ目で、空の文字は指定なしとする', () => {
      const result = ledgerListQuerySchema.safeParse({ keyword: '', adoption: '' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ page: 1 });
    });

    it('1 ページは 50 件とする（4.5）', () => {
      expect(LEDGER_PAGE_SIZE).toBe(50);
    });

    it('不正な改修／新営の区分を拒む', () => {
      const result = ledgerListQuerySchema.safeParse({ constructionKind: 'OTHER' });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      );
    });

    it('不正な採否と読取の確認を拒む', () => {
      expect(ledgerListQuerySchema.safeParse({ adoption: 'MAYBE' }).success).toBe(false);
      expect(ledgerListQuerySchema.safeParse({ readingStatus: 'DONE' }).success).toBe(false);
    });

    it('印の指定は true か false だけを受ける', () => {
      const result = ledgerListQuerySchema.safeParse({ needsReview: 'yes' });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.FLAG_INVALID);
    });

    it('見積日の形式が日付でないもの・期間が逆のものを拒む', () => {
      expect(ledgerListQuerySchema.safeParse({ submittedFrom: '2025/01/01' }).success).toBe(false);

      const reversed = ledgerListQuerySchema.safeParse({
        submittedFrom: '2025-12-31',
        submittedTo: '2025-01-01',
      });
      expect(reversed.success).toBe(false);
      expect(firstMessage(reversed)).toBe(
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SUBMITTED_RANGE_INVALID
      );
    });

    it('ページが 1 より小さいもの・整数でないものを拒む', () => {
      expect(ledgerListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
      expect(ledgerListQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    });

    it('文字の上限を超える絞り込みを拒む', () => {
      const result = ledgerListQuerySchema.safeParse({
        keyword: 'あ'.repeat(LEDGER_FIELD_LIMITS.keyword + 1),
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.KEYWORD_TOO_LONG);
    });

    it('書き出しの本文（JSON）の真偽の値も受け、ページを持たない（ledgerFilterSchema）', () => {
      const result = ledgerFilterSchema.safeParse({ hasProject: true, needsReview: false });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ hasProject: true, needsReview: false });
    });

    /**
     * @requirement unit-price-ledger/REQ-4.9
     */
    it('削除済みの案件を除く指定を、一覧のクエリの文字と書き出しの本文の真偽の値の両方で受ける', () => {
      expect(ledgerListQuerySchema.parse({ excludeDeletedProjects: 'true' })).toEqual({
        excludeDeletedProjects: true,
        page: 1,
      });
      expect(ledgerFilterSchema.parse({ excludeDeletedProjects: true })).toEqual({
        excludeDeletedProjects: true,
      });
      const invalid = ledgerListQuerySchema.safeParse({ excludeDeletedProjects: 'yes' });
      expect(invalid.success).toBe(false);
      expect(firstMessage(invalid)).toBe(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.FLAG_INVALID);
    });
  });

  describe('見積の ID（ledgerQuotationIdParamSchema）', () => {
    it('UUID を受け、UUID でないものを拒む', () => {
      expect(ledgerQuotationIdParamSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
      expect(ledgerQuotationIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    });
  });

  describe('案件の無い受領見積書の修正（ledgerQuotationUpdateSchema）', () => {
    const validLine = {
      name: '外壁塗装',
      sortOrder: 0,
      specification: 'シリコン',
      unit: 'm2',
      quantity: 100,
      unitPrice: 2500,
      amount: 250000,
      category: 'DIRECT',
      classificationKey: 'A-01',
    };
    const validUpdate = {
      vendorName: '山田塗装',
      submittedAt: '2025-04-01T00:00:00.000Z',
      ledgerProjectName: '〇〇ビル改修',
      ledgerSourcePath: '2025/〇〇ビル/見積.pdf',
      constructionKind: 'RENOVATION',
      lineItems: [validLine],
      expectedUpdatedAt: UPDATED_AT,
    };

    it('正しい修正の要求を通す', () => {
      const result = ledgerQuotationUpdateSchema.safeParse(validUpdate);

      expect(result.success).toBe(true);
      expect(result.data?.vendorName).toBe('山田塗装');
      expect(result.data?.ledgerProjectName).toBe('〇〇ビル改修');
      expect(result.data?.lineItems[0]?.classificationKey).toBe('A-01');
    });

    it('業者名が空なら拒む', () => {
      const result = ledgerQuotationUpdateSchema.safeParse({ ...validUpdate, vendorName: '  ' });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED
      );
    });

    it('業者名・見積日・排他の日時が無ければ拒む', () => {
      const { vendorName: _v, ...withoutVendor } = validUpdate;
      const { submittedAt: _s, ...withoutSubmittedAt } = validUpdate;
      const { expectedUpdatedAt: _e, ...withoutExpected } = validUpdate;

      expect(ledgerQuotationUpdateSchema.safeParse(withoutVendor).success).toBe(false);
      expect(ledgerQuotationUpdateSchema.safeParse(withoutSubmittedAt).success).toBe(false);
      expect(ledgerQuotationUpdateSchema.safeParse(withoutExpected).success).toBe(false);
    });

    it('明細行の名称が空なら拒む', () => {
      const result = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        lineItems: [{ ...validLine, name: '' }],
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(LINE_ITEM_VALIDATION_MESSAGES.NAME_REQUIRED);
    });

    it('明細行の不正な区分を拒む', () => {
      const result = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        lineItems: [{ ...validLine, category: 'UNKNOWN' }],
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(LINE_ITEM_VALIDATION_MESSAGES.CATEGORY_INVALID);
    });

    it('見積の情報の不正な改修／新営の区分を拒む', () => {
      const result = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        constructionKind: 'OTHER',
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      );
    });

    it('明細行が 1 行も無ければ拒む', () => {
      const result = ledgerQuotationUpdateSchema.safeParse({ ...validUpdate, lineItems: [] });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEMS_REQUIRED);
    });

    it('案件名・原本のパスの上限を超えれば拒む', () => {
      const longProject = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        ledgerProjectName: 'あ'.repeat(LEDGER_FIELD_LIMITS.ledgerProjectName + 1),
      });
      expect(longProject.success).toBe(false);
      expect(firstMessage(longProject)).toBe(
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LEDGER_PROJECT_NAME_TOO_LONG
      );

      const longPath = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        ledgerSourcePath: 'a'.repeat(LEDGER_FIELD_LIMITS.ledgerSourcePath + 1),
      });
      expect(longPath.success).toBe(false);
      expect(firstMessage(longPath)).toBe(
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LEDGER_SOURCE_PATH_TOO_LONG
      );
    });

    it('業者名の上限は受領見積書の台帳の情報の定義に従う', () => {
      const atLimit = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        vendorName: 'あ'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName),
      });
      const overLimit = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        vendorName: 'あ'.repeat(RECEIVED_QUOTATION_FIELD_LIMITS.vendorName + 1),
      });

      expect(atLimit.success).toBe(true);
      expect(overLimit.success).toBe(false);
      expect(firstMessage(overLimit)).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_TOO_LONG
      );
    });

    /**
     * @requirement unit-price-ledger/REQ-5.3: When 利用者が台帳の画面で明細行に分類キーを入力して保存したとき, the 単価台帳 shall estimate-request Requirement 47 の分類キーの決まり（50 文字まで、体系の登録の有無は検査しない）で保存する
     *
     * 修正の要求の明細行の分類キーは、受領見積書の明細行の定義（`lineItemSchema`）の上限で検証し、
     * 体系に無い値も受ける。
     */
    it('明細行の分類キーは 50 文字まで受け、体系に無い値も受ける（5.3）', () => {
      const atLimit = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        lineItems: [{ ...validLine, classificationKey: 'Z'.repeat(50) }],
      });
      const overLimit = ledgerQuotationUpdateSchema.safeParse({
        ...validUpdate,
        lineItems: [{ ...validLine, classificationKey: 'Z'.repeat(51) }],
      });

      expect(LINE_ITEM_FIELD_LIMITS.classificationKey).toBe(50);
      expect(atLimit.success).toBe(true);
      expect(overLimit.success).toBe(false);
      expect(firstMessage(overLimit)).toBe(
        LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG
      );
    });
  });

  describe('案件の受領見積書の印の更新（ledgerMarksUpdateSchema）', () => {
    const validMarks = {
      readingStatus: 'CONFIRMED',
      lineItems: [
        { id: VALID_UUID, isReference: true, referenceReason: '数量×単価と金額が違う' },
        { id: OTHER_UUID, classificationKey: 'B-02' },
      ],
      expectedUpdatedAt: UPDATED_AT,
    };

    it('正しい印の更新を通す', () => {
      const result = ledgerMarksUpdateSchema.safeParse(validMarks);

      expect(result.success).toBe(true);
      expect(result.data?.readingStatus).toBe('CONFIRMED');
      expect(result.data?.lineItems).toEqual([
        { id: VALID_UUID, isReference: true, referenceReason: '数量×単価と金額が違う' },
        { id: OTHER_UUID, classificationKey: 'B-02' },
      ]);
    });

    it('空の分類キー・参考の理由は消す（null）として受ける', () => {
      const result = ledgerMarksUpdateSchema.safeParse({
        lineItems: [
          { id: VALID_UUID, classificationKey: '', isReference: false, referenceReason: '' },
        ],
        expectedUpdatedAt: UPDATED_AT,
      });

      expect(result.success).toBe(true);
      expect(result.data?.lineItems[0]).toEqual({
        id: VALID_UUID,
        classificationKey: null,
        isReference: false,
        referenceReason: null,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-5.3: When 利用者が台帳の画面で明細行に分類キーを入力して保存したとき, the 単価台帳 shall estimate-request Requirement 47 の分類キーの決まり（50 文字まで、体系の登録の有無は検査しない）で保存する
     *
     * 案件の受領見積書の印の更新でも、分類キーは受領見積書の明細行の定義と同じ 50 文字の上限で
     * 検証し、体系の登録の有無は問わない。
     */
    it('分類キーは 50 文字まで受け、51 文字は拒む（5.3）', () => {
      const atLimit = ledgerMarksUpdateSchema.safeParse({
        lineItems: [{ id: VALID_UUID, classificationKey: '未登録キー'.padEnd(50, 'x') }],
        expectedUpdatedAt: UPDATED_AT,
      });
      const overLimit = ledgerMarksUpdateSchema.safeParse({
        lineItems: [{ id: VALID_UUID, classificationKey: 'x'.repeat(51) }],
        expectedUpdatedAt: UPDATED_AT,
      });

      expect(atLimit.success).toBe(true);
      expect(overLimit.success).toBe(false);
      expect(firstMessage(overLimit)).toBe(
        LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG
      );
    });

    it('参考の理由の上限を超えれば拒む', () => {
      const result = ledgerMarksUpdateSchema.safeParse({
        lineItems: [
          {
            id: VALID_UUID,
            isReference: true,
            referenceReason: 'あ'.repeat(LINE_ITEM_FIELD_LIMITS.referenceReason + 1),
          },
        ],
        expectedUpdatedAt: UPDATED_AT,
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_TOO_LONG);
    });

    it('参考の印を外した行に参考の理由があれば拒む', () => {
      const result = ledgerMarksUpdateSchema.safeParse({
        lineItems: [{ id: VALID_UUID, isReference: false, referenceReason: '理由' }],
        expectedUpdatedAt: UPDATED_AT,
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(
        LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE
      );
    });

    it('不正な読取の確認・UUID でない行・同じ行の重複を拒む', () => {
      expect(
        ledgerMarksUpdateSchema.safeParse({ ...validMarks, readingStatus: 'DONE' }).success
      ).toBe(false);
      expect(
        ledgerMarksUpdateSchema.safeParse({
          lineItems: [{ id: 'abc' }],
          expectedUpdatedAt: UPDATED_AT,
        }).success
      ).toBe(false);

      const duplicated = ledgerMarksUpdateSchema.safeParse({
        lineItems: [
          { id: VALID_UUID, classificationKey: 'A' },
          { id: VALID_UUID, classificationKey: 'B' },
        ],
        expectedUpdatedAt: UPDATED_AT,
      });
      expect(duplicated.success).toBe(false);
      expect(firstMessage(duplicated)).toBe(
        UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEM_DUPLICATED
      );
    });

    it('印の更新で受けない欄（名称・金額）は落とす', () => {
      const result = ledgerMarksUpdateSchema.safeParse({
        lineItems: [{ id: VALID_UUID, name: '変えた名称', amount: 1, classificationKey: 'A' }],
        expectedUpdatedAt: UPDATED_AT,
      });

      expect(result.success).toBe(true);
      expect(result.data?.lineItems[0]).toEqual({ id: VALID_UUID, classificationKey: 'A' });
    });

    it('排他の日時が無ければ拒む', () => {
      const { expectedUpdatedAt: _e, ...withoutExpected } = validMarks;

      expect(ledgerMarksUpdateSchema.safeParse(withoutExpected).success).toBe(false);
    });
  });

  describe('似た単価の問い合わせ（similarPriceQuerySchema）', () => {
    /**
     * @requirement unit-price-ledger/REQ-7.1: When 似た単価の参照の権限を持つ利用者が、名称（必須）・規格・単位・分類キー・工種・改修／新営・場所を指定して似た単価を問い合わせたとき, the 単価台帳 shall 台帳の見積の明細行のうち、区分が直接工事または産廃のものから候補を返す
     *
     * 本試験は条文のうち「問い合わせの要求の形」（名称は必須、ほかの 6 つは任意）を観測する。
     * 候補の選び方は似た単価の検索（タスク2.6）の試験が観測する。
     */
    it('名称と任意の 6 つの欄を受ける（7.1）', () => {
      const result = similarPriceQuerySchema.safeParse({
        name: ' 外壁塗装 ',
        specification: 'シリコン',
        unit: 'm2',
        classificationKey: 'A-01',
        workType: '塗装工事',
        constructionKind: 'NEW_CONSTRUCTION',
        siteLocation: '東京都',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        name: '外壁塗装',
        specification: 'シリコン',
        unit: 'm2',
        classificationKey: 'A-01',
        workType: '塗装工事',
        constructionKind: 'NEW_CONSTRUCTION',
        siteLocation: '東京都',
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-7.1: When 似た単価の参照の権限を持つ利用者が、名称（必須）・規格・単位・分類キー・工種・改修／新営・場所を指定して似た単価を問い合わせたとき, the 単価台帳 shall 台帳の見積の明細行のうち、区分が直接工事または産廃のものから候補を返す
     *
     * 名称は必須であり、空・空白だけ・欄の無い問い合わせは拒む。
     */
    it('名称が空・空白だけ・無いものを拒む（7.1）', () => {
      for (const body of [{ name: '' }, { name: '   ' }, {}]) {
        const result = similarPriceQuerySchema.safeParse(body);
        expect(result.success).toBe(false);
        expect(firstMessage(result)).toBe(
          UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_NAME_REQUIRED
        );
      }
    });

    it('任意の欄の空の文字は指定なしとする', () => {
      const result = similarPriceQuerySchema.safeParse({
        name: 'a',
        specification: '',
        unit: ' ',
        classificationKey: '',
        workType: '',
        siteLocation: '',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'a' });
    });

    it('不正な改修／新営の区分を拒む', () => {
      const result = similarPriceQuerySchema.safeParse({ name: 'a', constructionKind: 'OTHER' });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(
        RECEIVED_QUOTATION_VALIDATION_MESSAGES.CONSTRUCTION_KIND_INVALID
      );
    });

    it('各欄の上限ちょうどを受け、上限を超えれば拒む', () => {
      const cases: Array<[keyof typeof SIMILAR_PRICE_QUERY_LIMITS, string]> = [
        ['name', UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_NAME_TOO_LONG],
        ['specification', UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_SPECIFICATION_TOO_LONG],
        ['unit', UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_UNIT_TOO_LONG],
        ['classificationKey', LINE_ITEM_VALIDATION_MESSAGES.CLASSIFICATION_KEY_TOO_LONG],
        ['workType', UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.SIMILAR_WORK_TYPE_TOO_LONG],
        ['siteLocation', RECEIVED_QUOTATION_VALIDATION_MESSAGES.SITE_LOCATION_TOO_LONG],
      ];

      for (const [field, message] of cases) {
        const max = SIMILAR_PRICE_QUERY_LIMITS[field];
        const base = field === 'name' ? {} : { name: 'a' };
        const atLimit = similarPriceQuerySchema.safeParse({ ...base, [field]: 'x'.repeat(max) });
        const overLimit = similarPriceQuerySchema.safeParse({
          ...base,
          [field]: 'x'.repeat(max + 1),
        });

        expect(atLimit.success, field).toBe(true);
        expect(overLimit.success, field).toBe(false);
        expect(firstMessage(overLimit), field).toBe(message);
      }
    });

    it('上限の値は設計の値で、受領見積書の明細行と台帳の情報の定義と一致する', () => {
      expect(SIMILAR_PRICE_QUERY_LIMITS).toEqual({
        name: 200,
        specification: 200,
        unit: 50,
        classificationKey: 50,
        workType: 500,
        siteLocation: 100,
      });
      expect(SIMILAR_PRICE_QUERY_LIMITS.classificationKey).toBe(
        LINE_ITEM_FIELD_LIMITS.classificationKey
      );
      expect(SIMILAR_PRICE_QUERY_LIMITS.unit).toBe(LINE_ITEM_FIELD_LIMITS.conversionUnit);
      expect(SIMILAR_PRICE_QUERY_LIMITS.siteLocation).toBe(
        RECEIVED_QUOTATION_FIELD_LIMITS.siteLocation
      );
    });
  });
});
