/**
 * @fileoverview 受領見積書の API クライアントの台帳の項目・案件の配下の登録・二重登録の判別の単体テスト
 *
 * タスク117.1（estimate-request の design.md の章「Requirements 43-50」の D2・D3・D6）。
 * 送る本文（FormData の欄）、受ける型、409 の二つの種類（同じ原本の二重登録と楽観的排他）の判別を確かめる。
 *
 * @requirement estimate-request/REQ-43.7 案件の配下の登録の要求（見積依頼に紐づかない受領見積書）
 * @requirement estimate-request/REQ-48.3 同じ原本の二重登録の 409 を既存の受領見積書とともに判別する
 * @requirement estimate-request/REQ-48.4 同じ原本の他の受領見積書の件数を保存の結果として受ける
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../../api/client';
import {
  createReceivedQuotation,
  createProjectReceivedQuotation,
  updateReceivedQuotation,
  getReceivedQuotation,
  getReceivedQuotationsByProject,
  DuplicateOriginalError,
  isDuplicateOriginalError,
  isReceivedQuotationConflictError,
} from '../../api/received-quotations';
import type {
  LineItemInput,
  ReceivedQuotationInfo,
  ReceivedQuotationSaveResult,
} from '../../api/received-quotations';

const mockFetch = vi.fn();
global.fetch = mockFetch;

/** 応答の JSON の 1 件（日時は文字列） */
function quotationJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q-1',
    estimateRequestId: null,
    name: '受領見積書A',
    submittedAt: '2026-11-01T00:00:00.000Z',
    fileName: 'a.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 100,
    netAmount: 90000,
    vendorName: '山田設備',
    tradingPartnerId: 'tp-1',
    quoteNumber: 'Q-001',
    overallConditions: '足場は別途',
    siteLocation: '3階',
    constructionKind: 'RENOVATION',
    useType: '事務所',
    constructionPrice: 1000000,
    workConditions: '夜間',
    distanceKm: 12.5,
    adoption: 'ADOPTED',
    confirmedAmount: 950000,
    readingStatus: 'CONFIRMED',
    readingConfirmedById: 'user-1',
    readingConfirmedAt: '2026-11-02T03:04:05.000Z',
    quoteDiscriminator: '本体',
    lineItems: [
      {
        id: 'li-1',
        receivedQuotationId: 'q-1',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: '配管',
        specification: null,
        unit: 'm',
        quantity: 10,
        unitPrice: 1000,
        amount: 10000,
        remarks: null,
        category: 'DIRECT',
        condition: '既設撤去を含む',
        conversion: { quantity: 2, unit: '箇所', unitPrice: 5000, basis: '1箇所5m' },
        classificationKey: 'P-01',
        quantityRowKey: 'row-1',
        isReference: true,
        referenceReason: '参考の見積',
      },
    ],
    totalAmount: 10000,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 409 ? 'Conflict' : 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
  };
}

/** 送った FormData を取り出す */
function sentFormData(): FormData {
  const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
  expect(init?.body).toBeInstanceOf(FormData);
  return init!.body as FormData;
}

const DUPLICATE_BODY = {
  type: 'https://architrack.example.com/problems/duplicate-original',
  title: 'Duplicate Original',
  status: 409,
  detail: '（重複の詳細の文）',
  code: 'DUPLICATE_ORIGINAL',
  existing: {
    name: '先の受領見積書',
    vendorName: '佐藤電気',
    submittedAt: '2026-10-30T00:00:00.000Z',
  },
};

const CONFLICT_BODY = {
  type: 'https://architrack.example.com/problems/received-quotation-conflict',
  title: 'Conflict',
  status: 409,
  detail: '他のユーザーが更新しました',
  code: 'RECEIVED_QUOTATION_CONFLICT',
};

describe('received-quotations API client: 台帳の項目と案件の配下の登録（タスク117.1）', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ledgerLine: LineItemInput = {
    name: '配管',
    sortOrder: 0,
    unit: 'm',
    quantity: 10,
    unitPrice: 1000,
    amount: 10000,
    category: 'OVERHEAD',
    condition: '既設撤去を含む',
    conversion: { quantity: 2, unit: '箇所', unitPrice: 5000, basis: '1箇所5m' },
    classificationKey: 'P-01',
    quantityRowKey: null,
    isReference: true,
    referenceReason: '参考の見積',
  };

  describe('createReceivedQuotation（見積依頼の配下）', () => {
    it('台帳の項目を FormData の文字の欄として送り、明細行の新しい欄を JSON に含める', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson(), sharedOriginalCount: 0 })
      );

      await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
        quoteNumber: 'Q-001',
        overallConditions: '足場は別途',
        siteLocation: '3階',
        constructionKind: 'NEW_CONSTRUCTION',
        useType: '事務所',
        constructionPrice: 1000000,
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'REJECTED',
        confirmedAmount: 0,
        readingStatus: 'CONFIRMED',
        quoteDiscriminator: '別紙',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/estimate-requests\/er-1\/quotations$/),
        expect.objectContaining({ method: 'POST' })
      );
      const fd = sentFormData();
      expect(fd.get('quoteNumber')).toBe('Q-001');
      expect(fd.get('overallConditions')).toBe('足場は別途');
      expect(fd.get('siteLocation')).toBe('3階');
      expect(fd.get('constructionKind')).toBe('NEW_CONSTRUCTION');
      expect(fd.get('useType')).toBe('事務所');
      expect(fd.get('constructionPrice')).toBe('1000000');
      expect(fd.get('workConditions')).toBe('夜間');
      expect(fd.get('distanceKm')).toBe('12.5');
      expect(fd.get('adoption')).toBe('REJECTED');
      expect(fd.get('confirmedAmount')).toBe('0');
      expect(fd.get('readingStatus')).toBe('CONFIRMED');
      expect(fd.get('quoteDiscriminator')).toBe('別紙');

      const lineItems: unknown = JSON.parse(String(fd.get('lineItems')));
      expect(lineItems).toEqual([
        expect.objectContaining({
          name: '配管',
          category: 'OVERHEAD',
          condition: '既設撤去を含む',
          conversion: { quantity: 2, unit: '箇所', unitPrice: 5000, basis: '1箇所5m' },
          classificationKey: 'P-01',
          quantityRowKey: null,
          isReference: true,
          referenceReason: '参考の見積',
        }),
      ]);
    });

    it('送らない台帳の項目は欄を作らず、採否と読取の確認に空の文字を送らない', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson(), sharedOriginalCount: 0 })
      );

      await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
      });

      const fd = sentFormData();
      for (const key of [
        'vendorName',
        'tradingPartnerId',
        'quoteNumber',
        'overallConditions',
        'siteLocation',
        'constructionKind',
        'useType',
        'constructionPrice',
        'workConditions',
        'distanceKm',
        'adoption',
        'confirmedAmount',
        'readingStatus',
        'quoteDiscriminator',
      ]) {
        expect(fd.has(key), key).toBe(false);
      }
    });

    it('null の台帳の項目は空の文字で送る（サーバーが消す値として読む）', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson(), sharedOriginalCount: 0 })
      );

      await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
        quoteNumber: null,
        constructionKind: null,
        constructionPrice: null,
        distanceKm: null,
        confirmedAmount: null,
      });

      const fd = sentFormData();
      expect(fd.get('quoteNumber')).toBe('');
      expect(fd.get('constructionKind')).toBe('');
      expect(fd.get('constructionPrice')).toBe('');
      expect(fd.get('distanceKm')).toBe('');
      expect(fd.get('confirmedAmount')).toBe('');
    });

    it('成功の本文の sharedOriginalCount と台帳の項目・明細行の新しい欄を型つきで返す', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson(), sharedOriginalCount: 2 })
      );

      const result: ReceivedQuotationSaveResult = await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
      });

      expect(result.sharedOriginalCount).toBe(2);
      expect(result.vendorName).toBe('山田設備');
      expect(result.tradingPartnerId).toBe('tp-1');
      expect(result.readingStatus).toBe('CONFIRMED');
      expect(result.readingConfirmedById).toBe('user-1');
      expect(result.readingConfirmedAt).toBeInstanceOf(Date);
      expect(result.readingConfirmedAt?.toISOString()).toBe('2026-11-02T03:04:05.000Z');
      expect(result.quoteDiscriminator).toBe('本体');
      expect(result.constructionKind).toBe('RENOVATION');
      expect(result.distanceKm).toBe(12.5);
      const line = result.lineItems[0];
      expect(line?.category).toBe('DIRECT');
      expect(line?.conversion).toEqual({
        quantity: 2,
        unit: '箇所',
        unitPrice: 5000,
        basis: '1箇所5m',
      });
      expect(line?.isReference).toBe(true);
      expect(line?.referenceReason).toBe('参考の見積');
      expect(line?.classificationKey).toBe('P-01');
      expect(line?.quantityRowKey).toBe('row-1');
    });

    it('409 DUPLICATE_ORIGINAL を既存の受領見積書つきの DuplicateOriginalError として返す', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(409, DUPLICATE_BODY));

      const error = await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        file: new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DuplicateOriginalError);
      expect(error).toBeInstanceOf(ApiError);
      expect(isDuplicateOriginalError(error)).toBe(true);
      expect(isReceivedQuotationConflictError(error)).toBe(false);
      const dup = error as DuplicateOriginalError;
      expect(dup.statusCode).toBe(409);
      expect(dup.code).toBe('DUPLICATE_ORIGINAL');
      expect(dup.message).toBe('（重複の詳細の文）');
      expect(dup.existing?.name).toBe('先の受領見積書');
      expect(dup.existing?.vendorName).toBe('佐藤電気');
      expect(dup.existing?.submittedAt).toBeInstanceOf(Date);
      expect(dup.existing?.submittedAt.toISOString()).toBe('2026-10-30T00:00:00.000Z');
    });

    it('409 DUPLICATE_ORIGINAL の existing が壊れていても二重登録として判別し、existing は null とする', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(409, { ...DUPLICATE_BODY, existing: { name: 1 } })
      );

      const error = await createReceivedQuotation('er-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
      }).catch((e: unknown) => e);

      expect(isDuplicateOriginalError(error)).toBe(true);
      expect((error as DuplicateOriginalError).existing).toBeNull();
    });
  });

  describe('createProjectReceivedQuotation（案件の配下）', () => {
    it('案件の配下へ multipart で POST し、業者名と取引先の ID を送る', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson(), sharedOriginalCount: 1 })
      );

      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      const result = await createProjectReceivedQuotation('p-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        file,
        vendorName: '山田設備',
        tradingPartnerId: 'tp-1',
        netAmount: 90000,
        quoteDiscriminator: '',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/projects\/p-1\/quotations$/),
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
      const fd = sentFormData();
      expect(fd.get('name')).toBe('受領見積書A');
      expect(fd.get('submittedAt')).toBe('2026-11-01T00:00:00.000Z');
      expect(fd.get('file')).toBeInstanceOf(File);
      expect(fd.get('vendorName')).toBe('山田設備');
      expect(fd.get('tradingPartnerId')).toBe('tp-1');
      expect(fd.get('netAmount')).toBe('90000');
      expect(fd.get('quoteDiscriminator')).toBe('');
      expect(fd.has('lineItems')).toBe(false);

      expect(result.sharedOriginalCount).toBe(1);
      expect(result.estimateRequestId).toBeNull();
      expect(result.submittedAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('取引先を選ばない登録は tradingPartnerId を空の文字で送る（null は名前の照合）', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(201, { ...quotationJson({ tradingPartnerId: null }), sharedOriginalCount: 0 })
      );

      await createProjectReceivedQuotation('p-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        lineItems: [ledgerLine],
        vendorName: '山田設備',
        tradingPartnerId: null,
      });

      expect(sentFormData().get('tradingPartnerId')).toBe('');
    });

    it('案件の配下の登録でも 409 DUPLICATE_ORIGINAL を判別する', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(409, DUPLICATE_BODY));

      const error = await createProjectReceivedQuotation('p-1', {
        name: '受領見積書A',
        submittedAt: new Date('2026-11-01T00:00:00.000Z'),
        file: new File(['x'], 'a.pdf', { type: 'application/pdf' }),
        vendorName: '山田設備',
      }).catch((e: unknown) => e);

      expect(isDuplicateOriginalError(error)).toBe(true);
    });
  });

  describe('updateReceivedQuotation', () => {
    it('台帳の項目と取引先の ID・業者名を送り、成功の本文の sharedOriginalCount を返す', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { ...quotationJson(), sharedOriginalCount: 3 })
      );

      const result = await updateReceivedQuotation(
        'q-1',
        {
          vendorName: '山田設備',
          tradingPartnerId: 'tp-1',
          adoption: 'UNKNOWN',
          readingStatus: 'UNCONFIRMED',
          siteLocation: null,
          constructionPrice: 2000,
          quoteDiscriminator: '追加',
        },
        '2026-11-01T00:00:00.000Z'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/quotations\/q-1$/),
        expect.objectContaining({ method: 'PUT' })
      );
      const fd = sentFormData();
      expect(fd.get('expectedUpdatedAt')).toBe('2026-11-01T00:00:00.000Z');
      expect(fd.get('vendorName')).toBe('山田設備');
      expect(fd.get('tradingPartnerId')).toBe('tp-1');
      expect(fd.get('adoption')).toBe('UNKNOWN');
      expect(fd.get('readingStatus')).toBe('UNCONFIRMED');
      expect(fd.get('siteLocation')).toBe('');
      expect(fd.get('constructionPrice')).toBe('2000');
      expect(fd.get('quoteDiscriminator')).toBe('追加');
      expect(fd.has('quoteNumber')).toBe(false);
      expect(result.sharedOriginalCount).toBe(3);
    });

    it('409 DUPLICATE_ORIGINAL と楽観的排他の 409 を分けて返す', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(409, DUPLICATE_BODY));
      const duplicate = await updateReceivedQuotation(
        'q-1',
        { quoteDiscriminator: '本体' },
        '2026-11-01T00:00:00.000Z'
      ).catch((e: unknown) => e);

      mockFetch.mockResolvedValueOnce(jsonResponse(409, CONFLICT_BODY));
      const conflict = await updateReceivedQuotation(
        'q-1',
        { quoteDiscriminator: '本体' },
        '2026-11-01T00:00:00.000Z'
      ).catch((e: unknown) => e);

      expect(isDuplicateOriginalError(duplicate)).toBe(true);
      expect(isReceivedQuotationConflictError(duplicate)).toBe(false);

      expect(conflict).toBeInstanceOf(ApiError);
      expect(conflict).not.toBeInstanceOf(DuplicateOriginalError);
      expect(isDuplicateOriginalError(conflict)).toBe(false);
      expect(isReceivedQuotationConflictError(conflict)).toBe(true);
      expect((conflict as ApiError).statusCode).toBe(409);
    });

    it('409 以外の誤りは二重登録とも楽観的排他とも判別しない', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(400, { detail: '業者名を入力してください', code: 'VALIDATION_ERROR' })
      );
      const error = await updateReceivedQuotation(
        'q-1',
        { vendorName: 'x' },
        '2026-11-01T00:00:00.000Z'
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(isDuplicateOriginalError(error)).toBe(false);
      expect(isReceivedQuotationConflictError(error)).toBe(false);
    });
  });

  describe('取得の型', () => {
    it('詳細の読取の確認の日時が null のときは null のまま返す', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          200,
          quotationJson({
            readingStatus: 'UNCONFIRMED',
            readingConfirmedById: null,
            readingConfirmedAt: null,
          })
        )
      );

      const result: ReceivedQuotationInfo = await getReceivedQuotation('q-1');

      expect(result.readingStatus).toBe('UNCONFIRMED');
      expect(result.readingConfirmedAt).toBeNull();
    });

    it('案件の配下の一覧は include を指定しなければ従来の経路のまま呼ぶ', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, [
          quotationJson({ estimateRequestId: 'er-1', tradingPartnerName: '山田設備' }),
        ])
      );

      const result = await getReceivedQuotationsByProject('p-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/projects\/p-1\/quotations$/),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result[0]?.tradingPartnerName).toBe('山田設備');
    });

    it('include: all を指定すると全件の一覧を求め、業者名と台帳の項目を型つきで返す', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, [
          quotationJson({ tradingPartnerName: '山田設備' }),
          quotationJson({
            id: 'q-2',
            estimateRequestId: 'er-1',
            readingConfirmedAt: null,
            tradingPartnerName: '佐藤電気',
            vendorName: '佐藤電気',
          }),
        ])
      );

      const result: ReceivedQuotationInfo[] = await getReceivedQuotationsByProject('p-1', {
        include: 'all',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/projects\/p-1\/quotations\?include=all$/),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toHaveLength(2);
      expect(result[0]?.estimateRequestId).toBeNull();
      expect(result[0]?.vendorName).toBe('山田設備');
      expect(result[0]?.tradingPartnerName).toBe('山田設備');
      expect(result[0]?.readingConfirmedAt).toBeInstanceOf(Date);
      expect(result[1]?.readingConfirmedAt).toBeNull();
      expect(result[1]?.submittedAt).toBeInstanceOf(Date);
    });
  });
});
