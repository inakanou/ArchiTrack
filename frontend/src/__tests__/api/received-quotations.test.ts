/**
 * @fileoverview 受領見積書用APIクライアントのユニットテスト
 *
 * Task 17.1: 受領見積書APIクライアントの実装
 * Task 22.1: 受領見積書APIクライアントの明細行対応追加
 *
 * Requirements:
 * - 11.1: 受領見積書登録
 * - 11.2: 受領見積書フォーム
 * - 11.9: 構造化データ入力（明細行管理）
 * - 11.14: ファイルプレビュー
 * - 11.15: 受領見積書編集
 * - 11.16: 受領見積書削除
 * - 11.22: 受領見積書バリデーション（ファイルまたは明細行必須）
 * - 14.2: 明細行データの永続化
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getReceivedQuotations,
  getReceivedQuotation,
  createReceivedQuotation,
  updateReceivedQuotation,
  deleteReceivedQuotation,
  getPreviewUrl,
} from '../../api/received-quotations';
import type {
  ReceivedQuotationInfo,
  LineItemInfo,
  LineItemInput,
} from '../../api/received-quotations';

// fetch のモック
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('received-quotations API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // テスト用の明細行データ
  // Task 61.3: netAmountを明細行レベルから削除（受領見積書レベルに移動）
  const mockLineItems: LineItemInfo[] = [
    {
      id: 'li-1',
      receivedQuotationId: 'quotation-1',
      sortOrder: 0,
      customCategory: null,
      workType: null,
      name: '鉄筋工事',
      specification: 'D13',
      unit: 'kg',
      quantity: 100,
      unitPrice: 150,
      amount: 15000,
      remarks: null,
    },
    {
      id: 'li-2',
      receivedQuotationId: 'quotation-1',
      sortOrder: 1,
      customCategory: null,
      workType: null,
      name: 'コンクリート工事',
      specification: '21-8-20',
      unit: 'm3',
      quantity: 50,
      unitPrice: 12000,
      amount: 600000,
      remarks: '現場打ち',
    },
  ];

  // テスト用のモックデータ（改訂版：contentType廃止、lineItems追加、netAmount受領見積書レベル）
  // Task 61.3: netAmountを受領見積書レベルに追加（Requirements: 28.7, 28.10）
  const mockQuotationWithLineItems: ReceivedQuotationInfo = {
    id: 'quotation-1',
    estimateRequestId: 'er-1',
    name: '受領見積書#1',
    submittedAt: new Date('2025-01-15T00:00:00.000Z'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    lineItems: mockLineItems,
    totalAmount: 615000,
    netAmount: 500000,
    createdAt: new Date('2025-01-20T00:00:00.000Z'),
    updatedAt: new Date('2025-01-20T00:00:00.000Z'),
  };

  const mockQuotationWithFile: ReceivedQuotationInfo = {
    id: 'quotation-2',
    estimateRequestId: 'er-1',
    name: '受領見積書#2',
    submittedAt: new Date('2025-01-16T00:00:00.000Z'),
    fileName: 'estimate.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 1024000,
    lineItems: [],
    totalAmount: null,
    netAmount: null,
    createdAt: new Date('2025-01-21T00:00:00.000Z'),
    updatedAt: new Date('2025-01-21T00:00:00.000Z'),
  };

  const mockQuotationWithFileAndLineItems: ReceivedQuotationInfo = {
    id: 'quotation-3',
    estimateRequestId: 'er-1',
    name: '受領見積書#3',
    submittedAt: new Date('2025-01-17T00:00:00.000Z'),
    fileName: 'estimate.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 2048000,
    lineItems: mockLineItems,
    totalAmount: 615000,
    netAmount: 550000,
    createdAt: new Date('2025-01-22T00:00:00.000Z'),
    updatedAt: new Date('2025-01-22T00:00:00.000Z'),
  };

  // ==========================================================================
  // getReceivedQuotations - 受領見積書一覧取得
  // ==========================================================================
  describe('getReceivedQuotations', () => {
    it('見積依頼IDを指定して受領見積書一覧を取得できること', async () => {
      const mockResponse = [
        {
          ...mockQuotationWithLineItems,
          submittedAt: '2025-01-15T00:00:00.000Z',
          createdAt: '2025-01-20T00:00:00.000Z',
          updatedAt: '2025-01-20T00:00:00.000Z',
        },
        {
          ...mockQuotationWithFile,
          submittedAt: '2025-01-16T00:00:00.000Z',
          createdAt: '2025-01-21T00:00:00.000Z',
          updatedAt: '2025-01-21T00:00:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotations('er-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/estimate-requests\/er-1\/quotations$/),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(result).toHaveLength(2);
      expect(result[0]?.submittedAt).toBeInstanceOf(Date);
      expect(result[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('レスポンスに明細行データと合計金額が含まれること（Requirements: 14.2）', async () => {
      const mockResponse = [
        {
          ...mockQuotationWithLineItems,
          submittedAt: '2025-01-15T00:00:00.000Z',
          createdAt: '2025-01-20T00:00:00.000Z',
          updatedAt: '2025-01-20T00:00:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotations('er-1');

      expect(result[0]?.lineItems).toHaveLength(2);
      expect(result[0]?.lineItems[0]?.name).toBe('鉄筋工事');
      expect(result[0]?.lineItems[0]?.amount).toBe(15000);
      expect(result[0]?.totalAmount).toBe(615000);
    });

    it('明細行がない場合、totalAmountがnullであること', async () => {
      const mockResponse = [
        {
          ...mockQuotationWithFile,
          submittedAt: '2025-01-16T00:00:00.000Z',
          createdAt: '2025-01-21T00:00:00.000Z',
          updatedAt: '2025-01-21T00:00:00.000Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotations('er-1');

      expect(result[0]?.lineItems).toHaveLength(0);
      expect(result[0]?.totalAmount).toBeNull();
    });

    it('認証エラーの場合、401エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '認証が必要です' }),
      });

      await expect(getReceivedQuotations('er-1')).rejects.toThrow(ApiError);
    });

    it('権限不足の場合、403エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: 'アクセス権限がありません' }),
      });

      await expect(getReceivedQuotations('er-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getReceivedQuotation - 受領見積書詳細取得
  // ==========================================================================
  describe('getReceivedQuotation', () => {
    it('受領見積書IDを指定して詳細を取得できること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-20T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotation('quotation-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/quotations\/quotation-1$/),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(result.id).toBe('quotation-1');
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('レスポンスに明細行データと合計金額が含まれること（Requirements: 14.2）', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-20T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotation('quotation-1');

      expect(result.lineItems).toHaveLength(2);
      expect(result.lineItems[0]?.id).toBe('li-1');
      expect(result.lineItems[0]?.name).toBe('鉄筋工事');
      expect(result.lineItems[0]?.specification).toBe('D13');
      expect(result.lineItems[0]?.unit).toBe('kg');
      expect(result.lineItems[0]?.quantity).toBe(100);
      expect(result.lineItems[0]?.unitPrice).toBe(150);
      expect(result.lineItems[0]?.amount).toBe(15000);
      expect(result.lineItems[0]?.sortOrder).toBe(0);
      expect(result.totalAmount).toBe(615000);
    });

    it('ファイルと明細行を両方持つ受領見積書の詳細を取得できること（Requirements: 11.9）', async () => {
      const mockResponse = {
        ...mockQuotationWithFileAndLineItems,
        submittedAt: '2025-01-17T00:00:00.000Z',
        createdAt: '2025-01-22T00:00:00.000Z',
        updatedAt: '2025-01-22T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotation('quotation-3');

      expect(result.fileName).toBe('estimate.pdf');
      expect(result.fileMimeType).toBe('application/pdf');
      expect(result.lineItems).toHaveLength(2);
      expect(result.totalAmount).toBe(615000);
    });

    it('存在しない受領見積書IDを指定した場合、404エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '受領見積書が見つかりません' }),
      });

      await expect(getReceivedQuotation('non-existent')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // createReceivedQuotation - 受領見積書作成
  // ==========================================================================
  describe('createReceivedQuotation', () => {
    it('明細行データを含む受領見積書を作成できること（Requirements: 11.9, 14.2）', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-20T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const lineItemInputs: LineItemInput[] = [
        {
          name: '鉄筋工事',
          specification: 'D13',
          unit: 'kg',
          quantity: 100,
          unitPrice: 150,
          amount: 15000,
          sortOrder: 0,
        },
        {
          name: 'コンクリート工事',
          specification: '21-8-20',
          unit: 'm3',
          quantity: 50,
          unitPrice: 12000,
          amount: 600000,
          remarks: '現場打ち',
          sortOrder: 1,
        },
      ];

      const input = {
        name: '受領見積書#1',
        submittedAt: new Date('2025-01-15T00:00:00.000Z'),
        lineItems: lineItemInputs,
      };

      const result = await createReceivedQuotation('er-1', input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/estimate-requests\/er-1\/quotations$/),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      // FormDataが送信されていることを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData).toBeInstanceOf(FormData);

      // lineItemsがJSON文字列としてFormDataに含まれていることを確認（Requirements: 11.22）
      const lineItemsJson = sentFormData.get('lineItems');
      expect(lineItemsJson).toBeTruthy();
      expect(typeof lineItemsJson).toBe('string');
      const parsedLineItems = JSON.parse(lineItemsJson as string);
      expect(parsedLineItems).toHaveLength(2);
      expect(parsedLineItems[0].name).toBe('鉄筋工事');

      expect(result.id).toBe('quotation-1');
      expect(result.lineItems).toHaveLength(2);
      expect(result.totalAmount).toBe(615000);
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('ファイルのみで受領見積書を作成できること', async () => {
      const mockResponse = {
        ...mockQuotationWithFile,
        submittedAt: '2025-01-16T00:00:00.000Z',
        createdAt: '2025-01-21T00:00:00.000Z',
        updatedAt: '2025-01-21T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const mockFile = new File(['test content'], 'estimate.pdf', {
        type: 'application/pdf',
      });

      const input = {
        name: '受領見積書#2',
        submittedAt: new Date('2025-01-16T00:00:00.000Z'),
        file: mockFile,
      };

      const result = await createReceivedQuotation('er-1', input);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/estimate-requests\/er-1\/quotations$/),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );

      // FormDataにファイルが含まれていることを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('file')).toBeInstanceOf(File);

      expect(result.fileName).toBe('estimate.pdf');
      expect(result.lineItems).toHaveLength(0);
      expect(result.totalAmount).toBeNull();
    });

    it('ファイルと明細行の両方を含む受領見積書を作成できること（Requirements: 11.9）', async () => {
      const mockResponse = {
        ...mockQuotationWithFileAndLineItems,
        submittedAt: '2025-01-17T00:00:00.000Z',
        createdAt: '2025-01-22T00:00:00.000Z',
        updatedAt: '2025-01-22T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const mockFile = new File(['test content'], 'estimate.pdf', {
        type: 'application/pdf',
      });

      const lineItemInputs: LineItemInput[] = [
        {
          name: '鉄筋工事',
          specification: 'D13',
          unit: 'kg',
          quantity: 100,
          unitPrice: 150,
          amount: 15000,
          sortOrder: 0,
        },
      ];

      const input = {
        name: '受領見積書#3',
        submittedAt: new Date('2025-01-17T00:00:00.000Z'),
        file: mockFile,
        lineItems: lineItemInputs,
      };

      const result = await createReceivedQuotation('er-1', input);

      // FormDataにファイルと明細行の両方が含まれていることを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('file')).toBeInstanceOf(File);
      expect(sentFormData.get('lineItems')).toBeTruthy();

      expect(result.fileName).toBe('estimate.pdf');
      expect(result.lineItems).toHaveLength(2);
      expect(result.totalAmount).toBe(615000);
    });

    it('明細行データのないlineItemsパラメータが省略されること', async () => {
      const mockResponse = {
        ...mockQuotationWithFile,
        submittedAt: '2025-01-16T00:00:00.000Z',
        createdAt: '2025-01-21T00:00:00.000Z',
        updatedAt: '2025-01-21T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const mockFile = new File(['test content'], 'estimate.pdf', {
        type: 'application/pdf',
      });

      const input = {
        name: '受領見積書',
        submittedAt: new Date('2025-01-16T00:00:00.000Z'),
        file: mockFile,
        // lineItemsは指定しない
      };

      await createReceivedQuotation('er-1', input);

      // FormDataにlineItemsが含まれていないことを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('lineItems')).toBeNull();
    });

    it('見積依頼が見つからない場合、404エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '見積依頼が見つかりません' }),
      });

      const input = {
        name: '受領見積書',
        submittedAt: new Date(),
        lineItems: [{ name: 'テスト', sortOrder: 0 }],
      };

      await expect(createReceivedQuotation('non-existent', input)).rejects.toThrow(ApiError);
    });

    it('ファイルサイズ超過の場合、413エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: 'ファイルサイズが上限を超えています' }),
      });

      const mockFile = new File(['large content'], 'large.pdf', {
        type: 'application/pdf',
      });

      const input = {
        name: '大きなファイル',
        submittedAt: new Date(),
        file: mockFile,
      };

      await expect(createReceivedQuotation('er-1', input)).rejects.toThrow(ApiError);
    });

    it('許可されていないファイル形式の場合、415エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 415,
        statusText: 'Unsupported Media Type',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '許可されていないファイル形式です' }),
      });

      const mockFile = new File(['invalid'], 'invalid.exe', {
        type: 'application/x-msdownload',
      });

      const input = {
        name: '不正なファイル',
        submittedAt: new Date(),
        file: mockFile,
      };

      await expect(createReceivedQuotation('er-1', input)).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // updateReceivedQuotation - 受領見積書更新
  // ==========================================================================
  describe('updateReceivedQuotation', () => {
    it('受領見積書を更新できること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        name: '更新された見積書',
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-25T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const input = {
        name: '更新された見積書',
      };

      const result = await updateReceivedQuotation(
        'quotation-1',
        input,
        '2025-01-20T00:00:00.000Z'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/quotations\/quotation-1$/),
        expect.objectContaining({
          method: 'PUT',
          credentials: 'include',
        })
      );

      expect(result.name).toBe('更新された見積書');
    });

    it('明細行全量置換パラメータで更新できること（Requirements: 11.22）', async () => {
      const updatedLineItems: LineItemInfo[] = [
        {
          id: 'li-new-1',
          receivedQuotationId: 'quotation-1',
          sortOrder: 0,
          customCategory: null,
          workType: null,
          name: '新しい鉄筋工事',
          specification: 'D16',
          unit: 'kg',
          quantity: 200,
          unitPrice: 180,
          amount: 36000,
          remarks: null,
        },
      ];

      const mockResponse = {
        ...mockQuotationWithLineItems,
        lineItems: updatedLineItems,
        totalAmount: 36000,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-25T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const lineItemInputs: LineItemInput[] = [
        {
          name: '新しい鉄筋工事',
          specification: 'D16',
          unit: 'kg',
          quantity: 200,
          unitPrice: 180,
          amount: 36000,
          sortOrder: 0,
        },
      ];

      const input = {
        lineItems: lineItemInputs,
      };

      const result = await updateReceivedQuotation(
        'quotation-1',
        input,
        '2025-01-20T00:00:00.000Z'
      );

      // FormDataにlineItemsがJSON文字列として含まれていることを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      const lineItemsJson = sentFormData.get('lineItems');
      expect(lineItemsJson).toBeTruthy();
      expect(typeof lineItemsJson).toBe('string');
      const parsedLineItems = JSON.parse(lineItemsJson as string);
      expect(parsedLineItems).toHaveLength(1);
      expect(parsedLineItems[0].name).toBe('新しい鉄筋工事');

      expect(result.lineItems).toHaveLength(1);
      expect(result.totalAmount).toBe(36000);
    });

    it('ファイル削除フラグを指定して更新できること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-25T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const input = {
        removeFile: true,
      };

      await updateReceivedQuotation('quotation-1', input, '2025-01-20T00:00:00.000Z');

      // FormDataにremoveFileが含まれていることを確認
      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('removeFile')).toBe('true');
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            detail: '他のユーザーにより更新されました',
          }),
      });

      const input = { name: '更新' };

      await expect(
        updateReceivedQuotation('quotation-1', input, '2025-01-01T00:00:00.000Z')
      ).rejects.toThrow(ApiError);
    });

    it('存在しない受領見積書を更新しようとした場合、404エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '受領見積書が見つかりません' }),
      });

      const input = { name: '更新' };

      await expect(
        updateReceivedQuotation('non-existent', input, '2025-01-01T00:00:00.000Z')
      ).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // deleteReceivedQuotation - 受領見積書削除
  // ==========================================================================
  describe('deleteReceivedQuotation', () => {
    it('受領見積書を削除できること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: () => Promise.resolve(''),
      });

      await deleteReceivedQuotation('quotation-1', '2025-01-20T00:00:00.000Z');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/quotations\/quotation-1$/),
        expect.objectContaining({
          method: 'DELETE',
          credentials: 'include',
        })
      );
    });

    it('存在しない受領見積書を削除しようとした場合、404エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '受領見積書が見つかりません' }),
      });

      await expect(
        deleteReceivedQuotation('non-existent', '2025-01-01T00:00:00.000Z')
      ).rejects.toThrow(ApiError);
    });

    it('楽観的排他制御エラーの場合、409エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            detail: '他のユーザーにより更新されました',
          }),
      });

      await expect(
        deleteReceivedQuotation('quotation-1', '2025-01-01T00:00:00.000Z')
      ).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // getPreviewUrl - ファイルプレビューURL取得
  // ==========================================================================
  describe('getPreviewUrl', () => {
    it('署名付きプレビューURLを取得できること', async () => {
      const mockUrl = 'https://storage.example.com/signed-url?token=abc123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ url: mockUrl }),
      });

      const result = await getPreviewUrl('quotation-2');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/quotations\/quotation-2\/preview$/),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(result).toBe(mockUrl);
    });

    it('存在しない受領見積書のプレビューURLを取得しようとした場合、404エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: '受領見積書が見つかりません' }),
      });

      await expect(getPreviewUrl('non-existent')).rejects.toThrow(ApiError);
    });

    it('ファイルがない受領見積書のプレビューURLを取得しようとした場合、422エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            detail: 'ファイルがない受領見積書にはプレビューURLを生成できません',
          }),
      });

      await expect(getPreviewUrl('quotation-1')).rejects.toThrow(ApiError);
    });
  });

  // ==========================================================================
  // Task 61.3: netAmountフィールドの移動テスト（Requirements: 28.7, 28.10）
  // ==========================================================================
  describe('netAmountフィールド移動（Task 61.3）', () => {
    it('ReceivedQuotationInfoにnetAmountが含まれること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-20T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotation('quotation-1');

      expect(result.netAmount).toBe(500000);
    });

    it('netAmountがnullの場合もReceivedQuotationInfoに含まれること', async () => {
      const mockResponse = {
        ...mockQuotationWithFile,
        submittedAt: '2025-01-16T00:00:00.000Z',
        createdAt: '2025-01-21T00:00:00.000Z',
        updatedAt: '2025-01-21T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getReceivedQuotation('quotation-2');

      expect(result.netAmount).toBeNull();
    });

    it('LineItemInfoにnetAmountが含まれないこと', () => {
      const lineItem: LineItemInfo = {
        id: 'li-test',
        receivedQuotationId: 'q-1',
        sortOrder: 0,
        customCategory: null,
        workType: null,
        name: 'テスト',
        specification: null,
        unit: null,
        quantity: null,
        unitPrice: null,
        amount: null,
        remarks: null,
      };
      // netAmountがLineItemInfoのキーに含まれていないことを確認
      expect('netAmount' in lineItem).toBe(false);
    });

    it('LineItemInputにnetAmountが含まれないこと', () => {
      const lineItemInput: LineItemInput = {
        name: 'テスト',
        sortOrder: 0,
      };
      // netAmountがLineItemInputのキーに含まれていないことを確認
      expect('netAmount' in lineItemInput).toBe(false);
    });

    it('createReceivedQuotationでnetAmountがFormDataに含まれること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-20T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const input = {
        name: '受領見積書#1',
        submittedAt: new Date('2025-01-15T00:00:00.000Z'),
        lineItems: [{ name: '鉄筋工事', sortOrder: 0 }],
        netAmount: 500000,
      };

      await createReceivedQuotation('er-1', input);

      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('netAmount')).toBe('500000');
    });

    it('createReceivedQuotationでnetAmountがnullの場合はFormDataに含まれないこと', async () => {
      const mockResponse = {
        ...mockQuotationWithFile,
        submittedAt: '2025-01-16T00:00:00.000Z',
        createdAt: '2025-01-21T00:00:00.000Z',
        updatedAt: '2025-01-21T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const input = {
        name: '受領見積書#2',
        submittedAt: new Date('2025-01-16T00:00:00.000Z'),
        file: mockFile,
      };

      await createReceivedQuotation('er-1', input);

      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('netAmount')).toBeNull();
    });

    it('updateReceivedQuotationでnetAmountがFormDataに含まれること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        netAmount: 450000,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-25T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const input = {
        netAmount: 450000,
      };

      await updateReceivedQuotation('quotation-1', input, '2025-01-20T00:00:00.000Z');

      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      expect(sentFormData.get('netAmount')).toBe('450000');
    });

    it('updateReceivedQuotationでnetAmountをnullに設定できること', async () => {
      const mockResponse = {
        ...mockQuotationWithLineItems,
        netAmount: null,
        submittedAt: '2025-01-15T00:00:00.000Z',
        createdAt: '2025-01-20T00:00:00.000Z',
        updatedAt: '2025-01-25T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
      });

      const input = {
        netAmount: null,
      };

      await updateReceivedQuotation('quotation-1', input, '2025-01-20T00:00:00.000Z');

      const callArgs = mockFetch.mock.calls[0];
      const sentFormData = callArgs?.[1]?.body as FormData;
      // nullの場合、明示的にnullを送信する
      expect(sentFormData.get('netAmount')).toBe('null');
    });
  });

  // ==========================================================================
  // エラーハンドリング
  // ==========================================================================
  describe('エラーハンドリング', () => {
    it('ネットワークエラーの場合、statusCode 0のApiErrorがスローされること', async () => {
      // apiClientは最大3回リトライするので、4回分のモックが必要
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      try {
        await getReceivedQuotation('quotation-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(0);
      }
    });

    it('サーバーエラー（5xx）の場合、適切なApiErrorがスローされること', async () => {
      // apiClientは5xxエラーで最大3回リトライするので、4回分のモックが必要
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: 'Internal Server Error' }),
      };
      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse);

      try {
        await getReceivedQuotation('quotation-1');
        expect.fail('エラーがスローされるべきです');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(500);
      }
    });
  });
});
