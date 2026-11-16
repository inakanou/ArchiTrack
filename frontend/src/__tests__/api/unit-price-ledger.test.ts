/**
 * @fileoverview 単価台帳の API クライアントの単体テスト（unit-price-ledger タスク4.1）
 *
 * 経路は backend の `/api/unit-price-ledger`（タスク3.1）。呼ぶ経路・方法・本文と、応答の日時の欄を
 * Date にすることを確かめる。
 *
 * @requirement unit-price-ledger/REQ-10.1 台帳の画面・取り込み・修正・削除・書き出しの呼び出し
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../../api/client';
import {
  UNIT_PRICE_LEDGER_MANAGE_PERMISSION,
  buildLedgerExportFileName,
  unitPriceLedgerApi,
} from '../../api/unit-price-ledger';
import type {
  LedgerMarksUpdateInput,
  LedgerQuotationUpdateInput,
  SimilarPriceCandidate,
} from '../../api/unit-price-ledger';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      sendFormData: vi.fn(),
      postBlob: vi.fn(),
    },
  };
});

const QUOTATION_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ITEM_ID = '22222222-2222-4222-8222-222222222222';

/** 一覧の 1 件の応答（日時は文字列） */
function summaryJson(): Record<string, unknown> {
  return {
    id: QUOTATION_ID,
    name: '山田設備_2026-11-01',
    vendorName: '山田設備',
    submittedAt: '2026-11-01T00:00:00.000Z',
    projectId: null,
    estimateRequestId: null,
    projectName: '旧庁舎改修',
    constructionKind: 'RENOVATION',
    totalAmount: 120000,
    adoption: 'UNKNOWN',
    readingStatus: 'UNCONFIRMED',
    hasReferenceLines: true,
    ledgerCardId: 'card-1',
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  };
}

/** 詳細の応答（日時は文字列） */
function detailJson(): Record<string, unknown> {
  return {
    ...summaryJson(),
    tradingPartnerId: null,
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    quoteNumber: null,
    overallConditions: null,
    siteLocation: null,
    useType: null,
    constructionPrice: null,
    workConditions: null,
    distanceKm: null,
    confirmedAmount: null,
    readingConfirmedAt: '2026-11-04T05:06:07.000Z',
    readingConfirmedBy: { id: 'user-1', displayName: '管理者' },
    quoteDiscriminator: '',
    ledgerSourcePath: '旧庁舎/見積.pdf',
    ledgerProjectName: '旧庁舎改修',
    lineItems: [],
  };
}

describe('unitPriceLedgerApi（unit-price-ledger タスク4.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('台帳の管理の権限の名前は backend と同じ unit_price_ledger:manage である', () => {
    expect(UNIT_PRICE_LEDGER_MANAGE_PERMISSION).toBe('unit_price_ledger:manage');
  });

  describe('一覧（GET /quotations）', () => {
    it('絞り込みとページを検索の値にして呼び、日時の欄を Date にする', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [summaryJson()],
        pagination: { page: 2, limit: 50, total: 51, totalPages: 2 },
      });

      const result = await unitPriceLedgerApi.listQuotations({
        keyword: '配管',
        submittedFrom: '2026-01-01',
        submittedTo: '2026-12-31',
        hasProject: false,
        adoption: 'UNKNOWN',
        readingStatus: 'UNCONFIRMED',
        constructionKind: 'RENOVATION',
        needsReview: true,
        missingClassificationKey: false,
        page: 2,
      });

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      const path = vi.mocked(apiClient.get).mock.calls[0]![0];
      const [pathname, search] = path.split('?');
      expect(pathname).toBe('/api/unit-price-ledger/quotations');
      const params = new URLSearchParams(search);
      expect(Object.fromEntries(params)).toEqual({
        keyword: '配管',
        submittedFrom: '2026-01-01',
        submittedTo: '2026-12-31',
        hasProject: 'false',
        adoption: 'UNKNOWN',
        readingStatus: 'UNCONFIRMED',
        constructionKind: 'RENOVATION',
        needsReview: 'true',
        missingClassificationKey: 'false',
        page: '2',
      });

      expect(result.pagination).toEqual({ page: 2, limit: 50, total: 51, totalPages: 2 });
      const [first] = result.data;
      expect(first!.submittedAt).toBeInstanceOf(Date);
      expect(first!.submittedAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(first!.createdAt).toBeInstanceOf(Date);
      expect(first!.updatedAt.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    });

    it('絞り込みが無いときは検索の値を付けずに呼ぶ', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });

      await unitPriceLedgerApi.listQuotations({});

      expect(apiClient.get).toHaveBeenCalledWith('/api/unit-price-ledger/quotations');
    });
  });

  describe('詳細（GET /quotations/:id）', () => {
    it('見積の ID の経路を呼び、日時の欄を Date にする', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(detailJson());

      const detail = await unitPriceLedgerApi.getQuotation(QUOTATION_ID);

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/unit-price-ledger/quotations/${QUOTATION_ID}`
      );
      expect(detail.submittedAt).toBeInstanceOf(Date);
      expect(detail.updatedAt).toBeInstanceOf(Date);
      expect(detail.readingConfirmedAt).toBeInstanceOf(Date);
      expect(detail.readingConfirmedAt?.toISOString()).toBe('2026-11-04T05:06:07.000Z');
      expect(detail.ledgerSourcePath).toBe('旧庁舎/見積.pdf');
    });

    it('読取の確認の日時が null のときは null のまま返す', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ ...detailJson(), readingConfirmedAt: null });

      const detail = await unitPriceLedgerApi.getQuotation(QUOTATION_ID);

      expect(detail.readingConfirmedAt).toBeNull();
    });
  });

  describe('修正（PUT /quotations/:id）', () => {
    it('本文を JSON で送り、保存後の詳細を返す', async () => {
      vi.mocked(apiClient.put).mockResolvedValue(detailJson());
      const input: LedgerQuotationUpdateInput = {
        vendorName: '山田設備',
        submittedAt: '2026-11-01T00:00:00.000Z',
        ledgerProjectName: '旧庁舎改修',
        ledgerSourcePath: null,
        lineItems: [{ name: '配管', sortOrder: 0, category: 'DIRECT' }],
        expectedUpdatedAt: '2026-11-03T00:00:00.000Z',
      };

      const detail = await unitPriceLedgerApi.updateQuotation(QUOTATION_ID, input);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/unit-price-ledger/quotations/${QUOTATION_ID}`,
        input
      );
      expect(detail.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('印の更新（PATCH /quotations/:id/marks）', () => {
    it('印の本文を JSON で送り、保存後の詳細を返す', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue(detailJson());
      const input: LedgerMarksUpdateInput = {
        readingStatus: 'CONFIRMED',
        lineItems: [
          {
            id: LINE_ITEM_ID,
            isReference: true,
            referenceReason: '要確認',
            classificationKey: 'K',
          },
        ],
        expectedUpdatedAt: '2026-11-03T00:00:00.000Z',
      };

      const detail = await unitPriceLedgerApi.updateMarks(QUOTATION_ID, input);

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/api/unit-price-ledger/quotations/${QUOTATION_ID}/marks`,
        input
      );
      expect(detail.submittedAt).toBeInstanceOf(Date);
    });
  });

  describe('削除（DELETE /quotations/:id?updatedAt=）', () => {
    it('更新の日時を検索の値の updatedAt にして呼ぶ', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(undefined);
      const updatedAt = new Date('2026-11-03T00:00:00.000Z');

      await unitPriceLedgerApi.deleteQuotation(QUOTATION_ID, updatedAt);

      expect(apiClient.delete).toHaveBeenCalledTimes(1);
      const path = vi.mocked(apiClient.delete).mock.calls[0]![0];
      const [pathname, search] = path.split('?');
      expect(pathname).toBe(`/api/unit-price-ledger/quotations/${QUOTATION_ID}`);
      expect(new URLSearchParams(search).get('updatedAt')).toBe('2026-11-03T00:00:00.000Z');
    });
  });

  describe('取り込み（POST /imports）', () => {
    it('選んだファイルを multipart の files の欄で送り、取り込みの結果を返す', async () => {
      const result = {
        importedCount: 1,
        skipped: [{ cardId: 'card-2' }],
        failed: [],
        truncated: [],
        referenceMarkedCount: 0,
      };
      vi.mocked(apiClient.sendFormData).mockResolvedValue(result);
      const zip = new File(['zip'], 'cards.zip', { type: 'application/zip' });
      const json = new File(['{}'], 'card.json', { type: 'application/json' });

      const actual = await unitPriceLedgerApi.importCards([zip, json]);

      expect(apiClient.sendFormData).toHaveBeenCalledTimes(1);
      const [path, formData] = vi.mocked(apiClient.sendFormData).mock.calls[0]!;
      expect(path).toBe('/api/unit-price-ledger/imports');
      expect(formData).toBeInstanceOf(FormData);
      const files = formData.getAll('files');
      expect(files).toHaveLength(2);
      expect((files[0] as File).name).toBe('cards.zip');
      expect((files[1] as File).name).toBe('card.json');
      expect(actual).toEqual(result);
    });
  });

  describe('書き出し（POST /exports）', () => {
    it('絞り込みを本文にして送り、ファイルを Blob で受け、自動で送り直さない', async () => {
      const blob = new Blob(['PK'], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      vi.mocked(apiClient.postBlob).mockResolvedValue(blob);

      const actual = await unitPriceLedgerApi.exportLedger({ keyword: '配管', needsReview: true });

      expect(apiClient.postBlob).toHaveBeenCalledWith(
        '/api/unit-price-ledger/exports',
        { keyword: '配管', needsReview: true },
        { disableRetry: true }
      );
      expect(actual).toBe(blob);
    });

    it('絞り込まないときも本文に {} を送る', async () => {
      vi.mocked(apiClient.postBlob).mockResolvedValue(new Blob(['PK']));

      await unitPriceLedgerApi.exportLedger();

      expect(apiClient.postBlob).toHaveBeenCalledWith(
        '/api/unit-price-ledger/exports',
        {},
        { disableRetry: true }
      );
    });

    it('ファイル名は日本時間の日付で 単価台帳_YYYYMMDD.xlsx とする', () => {
      // UTC の 2026-11-16 15:30 は日本時間の 2026-11-17 00:30
      expect(buildLedgerExportFileName(new Date('2026-11-16T15:30:00.000Z'))).toBe(
        '単価台帳_20261117.xlsx'
      );
      expect(buildLedgerExportFileName(new Date('2026-01-05T01:00:00.000Z'))).toBe(
        '単価台帳_20260105.xlsx'
      );
    });
  });

  describe('似た単価（POST /similar-prices）', () => {
    it('問い合わせを本文にして送り、候補の配列を返す', async () => {
      const candidate: SimilarPriceCandidate = {
        lineItemId: LINE_ITEM_ID,
        vendorName: '山田設備',
        submittedAt: '2026-11-01',
        projectName: '他案件',
        projectId: null,
        receivedQuotationId: null,
        ledgerSourcePath: null,
        name: '配管',
        specification: null,
        unit: 'm',
        quantity: '10',
        category: 'DIRECT',
        classificationKeyMatched: true,
        adoption: 'ADOPTED',
        readingStatus: 'CONFIRMED',
        isReference: false,
        referenceReason: null,
        allocation: {
          unitPrice: '1000',
          overheadAllocation: '100',
          discountAllocation: '0',
          appliedUnitPrice: '1100',
          allocatable: true,
          applicable: true,
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue({ candidates: [candidate] });

      const candidates = await unitPriceLedgerApi.searchSimilarPrices({
        name: '配管',
        unit: 'm',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/unit-price-ledger/similar-prices', {
        name: '配管',
        unit: 'm',
      });
      expect(candidates).toEqual([candidate]);
    });
  });
});
