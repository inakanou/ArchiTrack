import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  apiClient,
  getApiErrorCode,
  ESTIMATE_SAVE_TIMEOUT_CODE,
  UPLOAD_TIMEOUT_MS,
} from '../../api/client';

// loggerをモック（テスト出力をクリーンに保つため）
vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

describe('ApiError', () => {
  it('正しいプロパティを持つこと', () => {
    const error = new ApiError(404, 'Not found', { detail: 'User not found' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Not found');
    expect(error.response).toEqual({ detail: 'User not found' });
  });

  it('responseなしで作成できること', () => {
    const error = new ApiError(500, 'Internal error');

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Internal error');
    expect(error.response).toBeUndefined();
  });
});

describe('ApiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('GET リクエスト', () => {
    it('正常なGETリクエストを送信できること', async () => {
      const mockData = { id: 1, name: 'Test User' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      });

      const result = await apiClient.get('/api/users/1');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('カスタムヘッダーを送信できること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await apiClient.get('/api/users', {
        headers: { Authorization: 'Bearer token123' },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer token123',
          }),
        })
      );
    });
  });

  describe('POST リクエスト', () => {
    it('正常なPOSTリクエストを送信できること', async () => {
      const requestData = { email: 'test@example.com', name: 'Test User' };
      const responseData = { id: 1, ...requestData };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseData,
      });

      const result = await apiClient.post('/api/users', requestData);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        })
      );
      expect(result).toEqual(responseData);
    });

    it('bodyなしでPOSTできること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await apiClient.post('/api/action');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });
  });

  describe('PUT リクエスト', () => {
    it('正常なPUTリクエストを送信できること', async () => {
      const updateData = { name: 'Updated Name' };
      const responseData = { id: 1, ...updateData };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseData,
      });

      const result = await apiClient.put('/api/users/1', updateData);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData),
        })
      );
      expect(result).toEqual(responseData);
    });
  });

  describe('PATCH リクエスト', () => {
    it('正常なPATCHリクエストを送信できること', async () => {
      const patchData = { status: 'active' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1, ...patchData }),
      });

      await apiClient.patch('/api/users/1', patchData);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(patchData),
        })
      );
    });
  });

  describe('DELETE リクエスト', () => {
    it('正常なDELETEリクエストを送信できること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
        json: async () => ({}),
      });

      await apiClient.delete('/api/users/1');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/users/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('エラーハンドリング', () => {
    it('HTTPエラーレスポンスをApiErrorとしてスローすること', async () => {
      const errorResponse = { error: 'Not found', code: 'NOT_FOUND' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => errorResponse,
      });

      await expect(apiClient.get('/api/users/999')).rejects.toThrow(ApiError);

      try {
        await apiClient.get('/api/users/999');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(404);
          expect(error.message).toBe('Not found');
          expect(error.response).toEqual(errorResponse);
        }
      }
    });

    it('テキストレスポンスを処理できること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Server error occurred',
      });

      try {
        await apiClient.get('/api/error');
      } catch (error) {
        if (error instanceof ApiError) {
          expect(error.response).toBe('Server error occurred');
        }
      }
    });

    it('ネットワークエラーをApiErrorとしてスローすること', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(apiClient.get('/api/users')).rejects.toThrow(ApiError);

      try {
        await apiClient.get('/api/users');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(0);
          expect(error.message).toBe('Network error');
        }
      }
    });
  });

  /**
   * Task 57.8 / Requirements (estimate-creation) 42.3
   *
   * 一括保存が制限時間を超えた（`code: ESTIMATE_SAVE_TIMEOUT`）場合、再試行しても
   * 同じ重い要求を繰り返すだけで結果は変わらない。サーバーが終局の失敗として
   * 宣言したコードは自動再試行の対象から外す。
   * ただし一時的な障害からの回復のため、他の 5xx の再試行は残す。
   */
  describe('サーバーが終局と宣言したエラーコードの再試行抑止', () => {
    const jsonErrorResponse = (body: unknown) => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
    });

    const saveTimeoutBody = {
      type: 'https://architrack.example.com/problems/internal-server-error',
      title: 'ESTIMATE_SAVE_TIMEOUT',
      status: 500,
      detail: '保存処理が制限時間内に完了しなかったため、変更は保存されていません。',
      code: 'ESTIMATE_SAVE_TIMEOUT',
      details: { timeoutMs: 15000, maxItems: 2000 },
    };

    it('ESTIMATE_SAVE_TIMEOUT の 500 は再試行せず1回で失敗すること', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonErrorResponse(saveTimeoutBody));
      globalThis.fetch = fetchMock;

      await expect(apiClient.put('/api/estimates/est-001/save', { items: [] })).rejects.toThrow(
        ApiError
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('コードの無い 500 は従来どおり再試行されること（5xx の再試行を一律に止めていない）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonErrorResponse({ status: 500, detail: 'Internal Server Error' }));
      globalThis.fetch = fetchMock;

      await expect(apiClient.put('/api/estimates/est-001/save', { items: [] })).rejects.toThrow(
        ApiError
      );

      // 初回 + 3回のリトライ
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('別のコードの 500 は再試行されること（抑止対象を限定している）', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonErrorResponse({ status: 500, code: 'INTERNAL_ERROR' }));
      globalThis.fetch = fetchMock;

      await expect(apiClient.put('/api/estimates/est-001/save', { items: [] })).rejects.toThrow(
        ApiError
      );

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('再試行を抑止しても応答の内容はそのまま呼び出し元へ渡ること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonErrorResponse(saveTimeoutBody));

      try {
        await apiClient.put('/api/estimates/est-001/save', { items: [] });
        expect.unreachable('ApiError が送出されるはず');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(500);
          expect(error.message).toBe(saveTimeoutBody.detail);
          expect(getApiErrorCode(error)).toBe(ESTIMATE_SAVE_TIMEOUT_CODE);
        }
      }
    });

    it('getApiErrorCode は code が無い応答や ApiError 以外では null を返すこと', () => {
      expect(getApiErrorCode(new ApiError(500, 'x', { detail: 'x' }))).toBeNull();
      expect(getApiErrorCode(new ApiError(500, 'x'))).toBeNull();
      expect(getApiErrorCode(new ApiError(500, 'x', 'plain text body'))).toBeNull();
      expect(getApiErrorCode(new Error('x'))).toBeNull();
      expect(getApiErrorCode(null)).toBeNull();
    });
  });

  describe('タイムアウト', () => {
    it('タイムアウト機能が設定されていること', () => {
      // タイムアウト設定が可能であることを確認
      const originalTimeout = apiClient['defaultTimeout'];

      apiClient.setTimeout(5000);
      expect(apiClient['defaultTimeout']).toBe(5000);

      // 元に戻す
      apiClient.setTimeout(originalTimeout);
    });

    it('カスタムタイムアウトオプションを受け入れること', async () => {
      // タイムアウトオプションが正しく渡されることを確認
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiClient.get('/api/test', { timeout: 10000 });

      // fetchが呼ばれたことを確認（タイムアウトが設定されている）
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  describe('設定', () => {
    it('ベースURLを変更できること', () => {
      apiClient.setBaseUrl('https://api.example.com');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      apiClient.get('/api/test');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/test',
        expect.any(Object)
      );

      // 元に戻す
      apiClient.setBaseUrl('http://localhost:3000');
    });

    it('デフォルトタイムアウトを変更できること', () => {
      const originalTimeout = apiClient['defaultTimeout'];

      apiClient.setTimeout(10000);
      expect(apiClient['defaultTimeout']).toBe(10000);

      apiClient.setTimeout(5000);
      expect(apiClient['defaultTimeout']).toBe(5000);

      // 元に戻す
      apiClient.setTimeout(originalTimeout);
    });
  });

  describe('Content-Type処理', () => {
    it('JSONレスポンスを正しくパースすること', async () => {
      const jsonData = { id: 1, name: 'Test' };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => jsonData,
      });

      const result = await apiClient.get('/api/data');

      expect(result).toEqual(jsonData);
    });

    it('テキストレスポンスを正しく処理すること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Plain text response',
      });

      const result = await apiClient.get('/api/text');

      expect(result).toBe('Plain text response');
    });

    it('Content-Typeがない場合でもテキストとして処理すること', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => 'Response without content type',
      });

      const result = await apiClient.get('/api/unknown');

      expect(result).toBe('Response without content type');
    });
  });

  /**
   * Task 105.1 / Requirements (site-survey) 37.11, 37.13
   *
   * multipart 送信を共通クライアントへ統一するための第一歩。
   * ボディが FormData の場合は JSON 化せず、`Content-Type` はブラウザの自動設定
   * （boundary 付与）に委ねる。JSON 経路のヘッダ組み立てと本文生成は不変であること。
   */
  describe('multipart（FormData）ボディの送信', () => {
    /** fetch 呼び出しに渡された RequestInit を捕捉する */
    let capturedInit: RequestInit | undefined;

    /** 成功応答を返す fetch モックを差し替え、RequestInit を捕捉する */
    const mockFetchCapturingInit = (): void => {
      capturedInit = undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedInit = init;
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });
      });
    };

    /** 捕捉した RequestInit のヘッダを取り出す */
    const capturedHeaders = (): Record<string, string> =>
      (capturedInit?.headers ?? {}) as Record<string, string>;

    beforeEach(() => {
      apiClient.setAccessToken(null);
      apiClient.setTokenRefreshCallback(null);
      apiClient.setSessionExpiredCallback(null);
    });

    it('FormData ボディでは Content-Type ヘッダを設定しないこと', async () => {
      mockFetchCapturingInit();
      const formData = new FormData();
      formData.append('images', new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' }));

      await apiClient.post('/api/site-surveys/1/images', formData);

      expect(Object.keys(capturedHeaders())).not.toContain('Content-Type');
    });

    it('FormData ボディを JSON 文字列化せずそのまま渡すこと', async () => {
      mockFetchCapturingInit();
      const formData = new FormData();
      formData.append('images', new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' }));

      await apiClient.post('/api/site-surveys/1/images', formData);

      expect(capturedInit?.body).toBe(formData);
    });

    it('FormData ボディでも Authorization ヘッダと明示指定のヘッダを維持すること', async () => {
      mockFetchCapturingInit();
      apiClient.setAccessToken('upload-token');
      const formData = new FormData();
      formData.append('images', new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' }));

      await apiClient.post('/api/site-surveys/1/images', formData, {
        headers: { 'X-Request-Id': 'req-001' },
      });

      expect(capturedHeaders()['Authorization']).toBe('Bearer upload-token');
      expect(capturedHeaders()['X-Request-Id']).toBe('req-001');

      apiClient.setAccessToken(null);
    });

    it('JSON ボディでは Content-Type: application/json と JSON 文字列化を維持すること（回帰検出）', async () => {
      mockFetchCapturingInit();
      const body = { title: '現場調査' };

      await apiClient.post('/api/site-surveys', body);

      expect(capturedHeaders()['Content-Type']).toBe('application/json');
      expect(capturedInit?.body).toBe(JSON.stringify(body));
    });

    it('ボディなしのリクエストでは Content-Type: application/json を維持すること（回帰検出）', async () => {
      mockFetchCapturingInit();

      await apiClient.get('/api/site-surveys');

      expect(capturedHeaders()['Content-Type']).toBe('application/json');
      expect(capturedInit?.body).toBeUndefined();
    });
  });

  /**
   * Task 105.3 / Requirements (site-survey) 37.13, 37.14, 37.15, 37.19, 37.20
   *
   * multipart 送信は非冪等である。サーバー処理に到達する前の失敗（通信障害・上流の
   * 応答不能）だけを再試行し、サーバー処理中の失敗（500）と送信の時間切れは
   * 再試行しない。送信猶予は1件あたり120秒とする。
   */
  describe('multipart 送信の再試行方針と送信タイムアウト', () => {
    /** signal の中断が発生した回数 */
    let abortCount = 0;

    /** アップロード用の FormData を作る */
    const uploadFormData = (): FormData => {
      const formData = new FormData();
      formData.append('images', new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' }));
      return formData;
    };

    /** JSON のエラー応答 */
    const errorResponse = (status: number, statusText: string) => ({
      ok: false,
      status,
      statusText,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status, detail: statusText }),
    });

    /** JSON の成功応答 */
    const successResponse = () => ({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ successful: 1 }),
    });

    /** 中断されるまで解決しない fetch モック（送信猶予の検証用） */
    const mockNeverSettlingFetch = () => {
      const fetchMock = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              abortCount += 1;
              const abortError = new Error('The operation was aborted.');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          })
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
      return fetchMock;
    };

    /** 即座に AbortError で失敗する fetch モック（時間切れの再試行抑止の検証用） */
    const mockAbortingFetch = () => {
      const abortError = new Error('The operation was aborted.');
      abortError.name = 'AbortError';
      const fetchMock = vi.fn().mockRejectedValue(abortError);
      globalThis.fetch = fetchMock;
      return fetchMock;
    };

    beforeEach(() => {
      abortCount = 0;
      apiClient.setAccessToken(null);
      apiClient.setTokenRefreshCallback(null);
      apiClient.setSessionExpiredCallback(null);
    });

    it('上流の応答不能（503）では再試行し、最終的に成功すること', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))
        .mockResolvedValueOnce(errorResponse(503, 'Service Unavailable'))
        .mockResolvedValueOnce(successResponse());
      globalThis.fetch = fetchMock;

      await expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
      ).resolves.toEqual({ successful: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('上流の応答不能（502・504）も再試行の対象であること', async () => {
      for (const status of [502, 504]) {
        const fetchMock = vi.fn().mockResolvedValue(errorResponse(status, 'Upstream failure'));
        globalThis.fetch = fetchMock;

        await expect(
          apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
        ).rejects.toThrow(ApiError);

        // 初回 + 3回のリトライ
        expect(fetchMock).toHaveBeenCalledTimes(4);
      }
    });

    it('通信障害（ネットワークエラー）では再試行されること', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      globalThis.fetch = fetchMock;

      await expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
      ).rejects.toThrow(ApiError);

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    /**
     * @requirement site-survey/REQ-37.14: 処理中の失敗は重複登録を避けるため自動再試行しない
     * @requirement construction-photo/REQ-20.14: 同上（工事写真も同一の共有クライアント経路）
     */
    it('サーバー処理中の失敗（500）では重複登録を避けるため再試行しないこと', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'Internal Server Error'));
      globalThis.fetch = fetchMock;

      await expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
      ).rejects.toThrow(ApiError);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    /**
     * 時間切れで送信が1回で終わることは、再送を開始できる状態になるまでの待ち時間が
     * 自動再試行の繰り返しで延伸しないこと（37.20 / 20.20）も同時に固定する。
     *
     * @requirement site-survey/REQ-37.19: 時間切れは自動再試行せず未送信として保持へ委ねる
     * @requirement site-survey/REQ-37.20: 再送を開始できるまでの待ち時間を再試行で延伸させない
     * @requirement construction-photo/REQ-20.19: 同上（工事写真も同一の共有クライアント経路）
     * @requirement construction-photo/REQ-20.20: 同上（工事写真も同一の共有クライアント経路）
     */
    it('送信の時間切れでは再試行せず1回で失敗すること', async () => {
      const fetchMock = mockAbortingFetch();

      await expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
      ).rejects.toThrow('Request timeout');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    /**
     * @requirement site-survey/REQ-37.15: 画像1件あたり少なくとも120秒の送信猶予を与える
     * @requirement construction-photo/REQ-20.15: 同上（工事写真も同一の共有クライアント経路）
     */
    it('画像1件あたりの送信猶予が120秒であること', async () => {
      const fetchMock = mockNeverSettlingFetch();

      const rejection = expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData())
      ).rejects.toThrow('Request timeout');

      await vi.advanceTimersByTimeAsync(119_999);
      expect(abortCount).toBe(0);

      await vi.advanceTimersByTimeAsync(1);
      await rejection;

      expect(abortCount).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('UPLOAD_TIMEOUT_MS が 120000 ミリ秒であること', () => {
      expect(UPLOAD_TIMEOUT_MS).toBe(120_000);
    });

    it('sendFormData は既定で POST を使い FormData をそのまま送ること', async () => {
      let capturedInit: RequestInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedInit = init;
        return Promise.resolve(successResponse());
      });
      const formData = uploadFormData();

      await apiClient.sendFormData('/api/site-surveys/1/images', formData);

      expect(capturedInit?.method).toBe('POST');
      expect(capturedInit?.body).toBe(formData);
      expect(Object.keys((capturedInit?.headers ?? {}) as Record<string, string>)).not.toContain(
        'Content-Type'
      );
    });

    it('sendFormData は method と timeout の上書きを受け付けること', async () => {
      let capturedInit: RequestInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedInit = init;
        return Promise.resolve(successResponse());
      });

      await apiClient.sendFormData('/api/site-surveys/1/images/1', uploadFormData(), {
        method: 'PUT',
      });
      expect(capturedInit?.method).toBe('PUT');

      mockNeverSettlingFetch();
      const rejection = expect(
        apiClient.sendFormData('/api/site-surveys/1/images', uploadFormData(), { timeout: 5_000 })
      ).rejects.toThrow('Request timeout');

      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
      expect(abortCount).toBe(1);
    });

    it('JSON 経路の 500 は従来どおり再試行されること（回帰検出）', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errorResponse(500, 'Internal Server Error'));
      globalThis.fetch = fetchMock;

      await expect(apiClient.post('/api/site-surveys', { title: '現場調査' })).rejects.toThrow(
        ApiError
      );

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('JSON 経路の時間切れは従来どおり再試行されること（回帰検出）', async () => {
      const fetchMock = mockAbortingFetch();

      await expect(apiClient.post('/api/site-surveys', { title: '現場調査' })).rejects.toThrow(
        'Request timeout'
      );

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('型安全性', () => {
    it('ジェネリック型でレスポンス型を指定できること', async () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const userData: User = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => userData,
      });

      const result = await apiClient.get<User>('/api/users/1');

      // TypeScriptコンパイル時の型チェック
      expect(result.id).toBe(1);
      expect(result.name).toBe('Test User');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('認証機能', () => {
    describe('アクセストークンの自動設定', () => {
      it('setAccessTokenでアクセストークンを設定できること', () => {
        apiClient.setAccessToken('test-access-token');

        expect(apiClient.getAccessToken()).toBe('test-access-token');
      });

      it('アクセストークンが設定されている場合、自動的にAuthorizationヘッダーを追加すること', async () => {
        apiClient.setAccessToken('my-access-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

        await apiClient.get('/api/protected');

        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer my-access-token',
            }),
          })
        );

        // クリーンアップ
        apiClient.setAccessToken(null);
      });

      it('アクセストークンがない場合、Authorizationヘッダーを追加しないこと', async () => {
        apiClient.setAccessToken(null);

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

        await apiClient.get('/api/public');

        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.not.objectContaining({
              Authorization: expect.anything(),
            }),
          })
        );
      });
    });

    describe('401エラーハンドリングとトークンリフレッシュ', () => {
      it('401エラー時にトークンリフレッシュコールバックを呼び出すこと', async () => {
        const mockRefreshCallback = vi.fn().mockResolvedValue('new-access-token');
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        // 1回目のリクエストで401エラー
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // 1回目: 401エラー
            return Promise.resolve({
              ok: false,
              status: 401,
              statusText: 'Unauthorized',
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ error: 'TOKEN_EXPIRED' }),
            });
          } else {
            // 2回目: 成功（リフレッシュ後）
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ success: true }),
            });
          }
        });

        const result = await apiClient.get('/api/protected');

        // リフレッシュコールバックが呼ばれた
        expect(mockRefreshCallback).toHaveBeenCalledTimes(1);

        // fetchが2回呼ばれた（1回目: 401、2回目: リトライ）
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);

        // 2回目のリクエストは成功
        expect(result).toEqual({ success: true });

        // アクセストークンが更新された
        expect(apiClient.getAccessToken()).toBe('new-access-token');

        // クリーンアップ
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken(null);
      });

      it('トークンリフレッシュが失敗した場合、401エラーをスローすること', async () => {
        const mockRefreshCallback = vi.fn().mockRejectedValue(new Error('Refresh failed'));
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'TOKEN_EXPIRED' }),
        });

        await expect(apiClient.get('/api/protected')).rejects.toThrow(ApiError);

        try {
          await apiClient.get('/api/protected');
        } catch (error) {
          if (error instanceof ApiError) {
            expect(error.statusCode).toBe(401);
          }
        }

        // クリーンアップ
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken(null);
      });

      it('トークンリフレッシュコールバックが設定されていない場合、401エラーをそのままスローすること', async () => {
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken('test-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized' }),
        });

        await expect(apiClient.get('/api/protected')).rejects.toThrow(ApiError);

        try {
          await apiClient.get('/api/protected');
        } catch (error) {
          if (error instanceof ApiError) {
            expect(error.statusCode).toBe(401);
          }
        }

        // クリーンアップ
        apiClient.setAccessToken(null);
      });
    });

    /**
     * 要件30.13: sessionExpiredCallback のテスト
     * API Clientがトークンリフレッシュ失敗を検知した場合、AuthContextに通知するためのコールバックを呼び出す
     */
    describe('sessionExpiredCallback（セッション切れコールバック）', () => {
      afterEach(() => {
        // クリーンアップ
        apiClient.setSessionExpiredCallback(null);
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken(null);
      });

      it('setSessionExpiredCallbackでコールバックを設定できること', () => {
        const mockCallback = vi.fn();
        apiClient.setSessionExpiredCallback(mockCallback);

        // 内部プロパティへのアクセスで設定確認
        expect(apiClient['sessionExpiredCallback']).toBe(mockCallback);
      });

      it('setSessionExpiredCallbackにnullを渡してコールバックを解除できること', () => {
        const mockCallback = vi.fn();
        apiClient.setSessionExpiredCallback(mockCallback);
        apiClient.setSessionExpiredCallback(null);

        expect(apiClient['sessionExpiredCallback']).toBeNull();
      });

      it('トークンリフレッシュ失敗時にsessionExpiredCallbackが呼ばれること', async () => {
        const mockSessionExpiredCallback = vi.fn();
        const mockRefreshCallback = vi.fn().mockRejectedValue(new Error('Refresh failed'));

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'TOKEN_EXPIRED' }),
        });

        await expect(apiClient.get('/api/protected')).rejects.toThrow(ApiError);

        // sessionExpiredCallbackが呼ばれたことを検証
        expect(mockSessionExpiredCallback).toHaveBeenCalledTimes(1);
      });

      it('tokenRefreshCallbackがnullの場合にsessionExpiredCallbackが呼ばれること', async () => {
        const mockSessionExpiredCallback = vi.fn();

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken('test-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Unauthorized' }),
        });

        await expect(apiClient.get('/api/protected')).rejects.toThrow(ApiError);

        // sessionExpiredCallbackが呼ばれたことを検証
        expect(mockSessionExpiredCallback).toHaveBeenCalledTimes(1);
      });

      it('sessionExpiredCallbackがnullの場合に既存動作が維持されること（エラーが正常にスローされる）', async () => {
        const mockRefreshCallback = vi.fn().mockRejectedValue(new Error('Refresh failed'));

        apiClient.setSessionExpiredCallback(null);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'TOKEN_EXPIRED' }),
        });

        // エラーが正常にスローされること
        await expect(apiClient.get('/api/protected')).rejects.toThrow(ApiError);
      });

      it('トークンリフレッシュ成功時にはsessionExpiredCallbackが呼ばれないこと', async () => {
        const mockSessionExpiredCallback = vi.fn();
        const mockRefreshCallback = vi.fn().mockResolvedValue('new-access-token');

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 401,
              statusText: 'Unauthorized',
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ error: 'TOKEN_EXPIRED' }),
            });
          } else {
            return Promise.resolve({
              ok: true,
              status: 200,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ success: true }),
            });
          }
        });

        await apiClient.get('/api/protected');

        // sessionExpiredCallbackは呼ばれないこと
        expect(mockSessionExpiredCallback).not.toHaveBeenCalled();
      });
    });

    /**
     * 進行中のトークン更新の共有（並行リクエストの401）
     *
     * アップロードは常に並列で実行されるため、複数のリクエストが同時に401となる。
     * トークン更新は1回だけ実行し、更新中に発生した401は完了を待って同一リクエストを
     * 再送する。セッション切れの通知は、共有した更新が失敗した場合にのみ発火させる。
     *
     * @requirement site-survey/REQ-37.11: 再ログインを要求せず認証を更新しアップロードを継続する
     * @requirement site-survey/REQ-37.12: 認証の更新に失敗した場合のみセッション切れを通知する
     * @requirement construction-photo/REQ-20.11: 同上（工事写真も同一の共有クライアント経路）
     * @requirement construction-photo/REQ-20.12: 同上（工事写真も同一の共有クライアント経路）
     */
    describe('並行リクエストの401（進行中のトークン更新の共有）', () => {
      /**
       * 期限切れトークンのリクエストにのみ401を返す fetch モックを設定する
       *
       * トークン更新後の再送は新しいトークンを載せるため成功する。
       */
      const mockFetchRejectingStaleToken = (staleToken: string): void => {
        globalThis.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
          const requestHeaders = (init.headers ?? {}) as Record<string, string>;
          if (requestHeaders['Authorization'] === `Bearer ${staleToken}`) {
            return Promise.resolve({
              ok: false,
              status: 401,
              statusText: 'Unauthorized',
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ error: 'TOKEN_EXPIRED' }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ success: true }),
          });
        });
      };

      /** 5件を同時に送信する */
      const sendFiveConcurrentRequests = (): Promise<unknown>[] =>
        [1, 2, 3, 4, 5].map((index) => apiClient.get(`/api/site-surveys/${index}/images`));

      afterEach(() => {
        apiClient.setSessionExpiredCallback(null);
        apiClient.setTokenRefreshCallback(null);
        apiClient.setAccessToken(null);
      });

      it('5件が同時に401となってもトークン更新が1回だけ実行され、全件が再送されて成功すること', async () => {
        const mockSessionExpiredCallback = vi.fn();
        const mockRefreshCallback = vi.fn().mockResolvedValue('new-access-token');

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');
        mockFetchRejectingStaleToken('old-access-token');

        const results = await Promise.all(sendFiveConcurrentRequests());

        // トークン更新は共有され1回だけ実行される
        expect(mockRefreshCallback).toHaveBeenCalledTimes(1);

        // 5件とも再送されて成功する（初回5回 + 再送5回）
        expect(results).toEqual([
          { success: true },
          { success: true },
          { success: true },
          { success: true },
          { success: true },
        ]);
        expect(globalThis.fetch).toHaveBeenCalledTimes(10);

        // セッション切れ通知は一度も発火しない
        expect(mockSessionExpiredCallback).not.toHaveBeenCalled();
        expect(apiClient.getAccessToken()).toBe('new-access-token');
      });

      it('共有したトークン更新が失敗した場合、5件とも401で失敗しセッション切れ通知が1回だけ発火すること', async () => {
        const mockSessionExpiredCallback = vi.fn();
        const mockRefreshCallback = vi.fn().mockRejectedValue(new Error('Refresh failed'));

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');
        mockFetchRejectingStaleToken('old-access-token');

        const results = await Promise.allSettled(sendFiveConcurrentRequests());

        // トークン更新は共有され1回だけ実行される
        expect(mockRefreshCallback).toHaveBeenCalledTimes(1);

        // 5件とも401で失敗する（再送は行われない）
        for (const result of results) {
          expect(result.status).toBe('rejected');
          if (result.status === 'rejected') {
            expect(result.reason).toBeInstanceOf(ApiError);
            expect((result.reason as ApiError).statusCode).toBe(401);
          }
        }
        expect(globalThis.fetch).toHaveBeenCalledTimes(5);

        // セッション切れ通知は共有した更新の失敗に対して1回だけ発火する
        expect(mockSessionExpiredCallback).toHaveBeenCalledTimes(1);
      });

      it('更新API自体が401を返しても待ち合わせでデッドロックせず全件が失敗すること', async () => {
        // デッドロックが起きた場合にテストがハングせず時間切れで失敗するよう実タイマーを使う
        vi.useRealTimers();

        const mockSessionExpiredCallback = vi.fn();
        // AuthContext と同じく、更新コールバックが apiClient 経由で更新APIを呼ぶ構成を再現する
        const mockRefreshCallback = vi.fn().mockImplementation(async () => {
          const refreshed = await apiClient.post<{ accessToken: string }>('/api/v1/auth/refresh', {
            refreshToken: 'stored-refresh-token',
          });
          return refreshed.accessToken;
        });

        apiClient.setSessionExpiredCallback(mockSessionExpiredCallback);
        apiClient.setTokenRefreshCallback(mockRefreshCallback);
        apiClient.setAccessToken('old-access-token');

        // 更新APIを含む全てのリクエストが401を返す
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'TOKEN_EXPIRED' }),
        });

        const results = await Promise.allSettled(sendFiveConcurrentRequests());

        // 更新は1回だけ試みられ、更新APIの401が再帰的な更新を引き起こさない
        expect(mockRefreshCallback).toHaveBeenCalledTimes(1);
        for (const result of results) {
          expect(result.status).toBe('rejected');
          if (result.status === 'rejected') {
            expect(result.reason).toBeInstanceOf(ApiError);
            expect((result.reason as ApiError).statusCode).toBe(401);
          }
        }
      });
    });
  });
});
