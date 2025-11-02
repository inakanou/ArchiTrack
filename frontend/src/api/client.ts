/**
 * APIエラークラス
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API リクエストオプション
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * APIクライアント
 * バックエンドAPIとの通信を抽象化
 */
class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000; // 30秒

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  /**
   * HTTPリクエストを送信
   */
  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers = {}, body, timeout = this.defaultTimeout } = options;

    // タイムアウト用のAbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${this.baseUrl}${path}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // レスポンスボディを取得
      const contentType = response.headers.get('content-type');
      let data: unknown;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // エラーレスポンスの処理
      if (!response.ok) {
        throw new ApiError(response.status, response.statusText, data);
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortErrorの場合はタイムアウト
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(0, 'Request timeout');
      }

      // ApiErrorはそのままスロー
      if (error instanceof ApiError) {
        throw error;
      }

      // ネットワークエラー等
      throw new ApiError(0, 'Network error', error);
    }
  }

  /**
   * GETリクエスト
   */
  async get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * POSTリクエスト
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method'>
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  /**
   * PUTリクエスト
   */
  async put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  /**
   * PATCHリクエスト
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method'>
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETEリクエスト
   */
  async delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * ベースURLを設定
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * デフォルトタイムアウトを設定
   */
  setTimeout(timeout: number): void {
    this.defaultTimeout = timeout;
  }
}

// シングルトンインスタンスをエクスポート
export const apiClient = new ApiClient();

// 型定義のエクスポート
export type { RequestOptions };
