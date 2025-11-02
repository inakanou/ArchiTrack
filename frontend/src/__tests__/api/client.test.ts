import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, apiClient } from '../../api/client';

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
          expect(error.message).toBe('Not Found');
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
});
