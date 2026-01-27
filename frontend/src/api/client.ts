import { logger } from '../utils/logger';

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
 * トークンリフレッシュコールバックの型定義
 */
export type TokenRefreshCallback = () => Promise<string>;

/**
 * APIクライアント
 * バックエンドAPIとの通信を抽象化
 */
class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000; // 30秒
  private accessToken: string | null = null;
  private tokenRefreshCallback: TokenRefreshCallback | null = null;

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

      // アクセストークンが設定されている場合、Authorizationヘッダーを追加
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };

      if (this.accessToken) {
        requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        credentials: 'include', // 要件26.5: HTTPOnly Cookieを送受信するため
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

      // 401エラーの場合、トークンリフレッシュを試みる
      // TokenRefreshManagerが内部でエクスポネンシャルバックオフ付きリトライを行う
      if (response.status === 401 && this.tokenRefreshCallback) {
        // 要件16.21: 開発環境ではトークン有効期限切れをコンソールにログ出力
        logger.debug('Access token expired or invalid, attempting refresh...');
        try {
          // トークンをリフレッシュ（TokenRefreshManagerがリトライを処理）
          const newAccessToken = await this.tokenRefreshCallback();

          // 新しいアクセストークンを設定
          this.setAccessToken(newAccessToken);

          // 元のリクエストをリトライ（リフレッシュコールバックをnullにして無限ループを防ぐ）
          const originalCallback = this.tokenRefreshCallback;
          this.tokenRefreshCallback = null;

          try {
            return await this.request<T>(path, options);
          } finally {
            this.tokenRefreshCallback = originalCallback;
          }
        } catch (refreshError) {
          // リフレッシュ失敗時のエラーログ
          logger.debug('Token refresh failed after all retry attempts', {
            error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
          });
          // RFC 7807 Problem Details形式のdetailフィールド、または従来のerrorフィールドを優先的に使用
          const errorMessage =
            (data && typeof data === 'object'
              ? 'detail' in data && typeof data.detail === 'string'
                ? data.detail
                : 'error' in data && typeof data.error === 'string'
                  ? data.error
                  : null
              : null) || response.statusText;
          throw new ApiError(response.status, errorMessage, data);
        }
      }

      // エラーレスポンスの処理
      if (!response.ok) {
        // RFC 7807 Problem Details形式のdetailフィールド、または従来のerrorフィールドを優先的に使用
        const errorMessage =
          (data && typeof data === 'object'
            ? 'detail' in data && typeof data.detail === 'string'
              ? data.detail
              : 'error' in data && typeof data.error === 'string'
                ? data.error
                : null
            : null) || response.statusText;
        throw new ApiError(response.status, errorMessage, data);
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
  async delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
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

  /**
   * アクセストークンを設定
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * アクセストークンを取得
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * トークンリフレッシュコールバックを設定
   */
  setTokenRefreshCallback(callback: TokenRefreshCallback | null): void {
    this.tokenRefreshCallback = callback;
  }
}

// シングルトンインスタンスをエクスポート
export const apiClient = new ApiClient();

// 型定義のエクスポート
export type { RequestOptions };
