/**
 * @fileoverview 受領見積書用APIクライアントのユニットテスト
 *
 * Task 17.1: 受領見積書APIクライアントの実装
 *
 * Requirements:
 * - 11.1: 受領見積書登録
 * - 11.2: 受領見積書フォーム
 * - 11.9: 受領見積書更新
 * - 11.14: ファイルプレビュー
 * - 11.15: 受領見積書編集
 * - 11.16: 受領見積書削除
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
import type { ReceivedQuotationInfo } from '../../api/received-quotations';

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

  // テスト用のモックデータ
  const mockQuotation: ReceivedQuotationInfo = {
    id: 'quotation-1',
    estimateRequestId: 'er-1',
    name: '受領見積書#1',
    submittedAt: new Date('2025-01-15T00:00:00.000Z'),
    contentType: 'TEXT',
    textContent: 'テスト見積内容',
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    createdAt: new Date('2025-01-20T00:00:00.000Z'),
    updatedAt: new Date('2025-01-20T00:00:00.000Z'),
  };

  const mockQuotationWithFile: ReceivedQuotationInfo = {
    id: 'quotation-2',
    estimateRequestId: 'er-1',
    name: '受領見積書#2',
    submittedAt: new Date('2025-01-16T00:00:00.000Z'),
    contentType: 'FILE',
    textContent: null,
    fileName: 'estimate.pdf',
    fileMimeType: 'application/pdf',
    fileSize: 1024000,
    createdAt: new Date('2025-01-21T00:00:00.000Z'),
    updatedAt: new Date('2025-01-21T00:00:00.000Z'),
  };

  // ==========================================================================
  // getReceivedQuotations - 受領見積書一覧取得
  // ==========================================================================
  describe('getReceivedQuotations', () => {
    it('見積依頼IDを指定して受領見積書一覧を取得できること', async () => {
      const mockResponse = [
        {
          ...mockQuotation,
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
        ...mockQuotation,
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
    it('テキストコンテンツの受領見積書を作成できること', async () => {
      const mockResponse = {
        ...mockQuotation,
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
        contentType: 'TEXT' as const,
        textContent: 'テスト見積内容',
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
      expect(callArgs?.[1]?.body).toBeInstanceOf(FormData);

      expect(result.id).toBe('quotation-1');
      expect(result.submittedAt).toBeInstanceOf(Date);
    });

    it('ファイルコンテンツの受領見積書を作成できること', async () => {
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
        contentType: 'FILE' as const,
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

      expect(result.contentType).toBe('FILE');
      expect(result.fileName).toBe('estimate.pdf');
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
        contentType: 'TEXT' as const,
        textContent: 'テスト',
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
        contentType: 'FILE' as const,
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
        contentType: 'FILE' as const,
        file: mockFile,
      };

      await expect(createReceivedQuotation('er-1', input)).rejects.toThrow(ApiError);
    });

    it('コンテンツタイプの整合性エラーの場合、422エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ detail: 'テキストとファイルの両方は指定できません' }),
      });

      const input = {
        name: '不整合なコンテンツ',
        submittedAt: new Date(),
        contentType: 'TEXT' as const,
        textContent: 'テスト',
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
        ...mockQuotation,
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

    it('テキストコンテンツの受領見積書の場合、422エラーがスローされること', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            detail: 'テキストコンテンツの受領見積書にはファイルがありません',
          }),
      });

      await expect(getPreviewUrl('quotation-1')).rejects.toThrow(ApiError);
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
