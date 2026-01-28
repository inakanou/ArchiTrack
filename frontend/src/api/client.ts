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
  /** リトライを無効化するかどうか（デフォルト: false） */
  disableRetry?: boolean;
}

/**
 * トークンリフレッシュコールバックの型定義
 */
export type TokenRefreshCallback = () => Promise<string>;

/**
 * リトライ設定
 * サーバーsleep状態からの復帰待機に対応
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * デフォルトリトライ設定
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1秒
  maxDelayMs: 10000, // 最大10秒
  backoffMultiplier: 2, // 1s -> 2s -> 4s
};

/**
 * テスト環境かどうかを判定
 */
const isTestEnvironment = import.meta.env.MODE === 'test';

/**
 * リトライ可能なHTTPステータスコードかどうかを判定
 * サーバーsleep状態からの復帰時の一時的なエラーはリトライ対象
 *
 * @param statusCode HTTPステータスコード
 */
function isRetryableStatusCode(statusCode: number): boolean {
  // 0: ネットワークエラー、タイムアウト
  if (statusCode === 0) {
    return true;
  }

  // 5xx: サーバーエラー（INTERNAL_ERROR等）はリトライ対象
  if (statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // 4xx: クライアントエラーはリトライ不可（401は別途トークンリフレッシュで処理）
  return false;
}

/**
 * 遅延関数
 * テスト環境では遅延を0msに設定して高速実行
 *
 * @param ms 遅延ミリ秒
 */
function delay(ms: number): Promise<void> {
  if (isTestEnvironment) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * APIクライアント
 * バックエンドAPIとの通信を抽象化
 * サーバーsleep状態からの復帰時のエラーに対するリトライ機構を含む
 */
class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000; // 30秒
  private accessToken: string | null = null;
  private tokenRefreshCallback: TokenRefreshCallback | null = null;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  /**
   * HTTPリクエストを送信
   * 5xxエラーやネットワークエラーに対してエクスポネンシャルバックオフ付きリトライを実行
   */
  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      disableRetry = false,
    } = options;

    let lastError: ApiError | null = null;
    let currentDelay = this.retryConfig.initialDelayMs;
    const maxRetries = disableRetry ? 0 : this.retryConfig.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // リトライ時はログを出力して待機
      if (attempt > 0) {
        logger.debug(`API request retry attempt ${attempt}/${maxRetries}`, {
          path,
          method,
          delay: currentDelay,
        });
        await delay(currentDelay);
        currentDelay = Math.min(
          currentDelay * this.retryConfig.backoffMultiplier,
          this.retryConfig.maxDelayMs
        );
      }

      // タイムアウト用のAbortController（リトライごとに新しく作成）
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

        // 401エラーの場合、トークンリフレッシュを試みる（リトライ対象外）
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
              return await this.request<T>(path, { ...options, disableRetry: true });
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

          const apiError = new ApiError(response.status, errorMessage, data);

          // 5xxエラーはリトライ対象（最後の試行でない場合）
          if (isRetryableStatusCode(response.status) && attempt < maxRetries) {
            lastError = apiError;
            logger.debug(`Server error (${response.status}), will retry`, {
              path,
              attempt: attempt + 1,
              maxRetries,
            });
            continue; // リトライ
          }

          throw apiError;
        }

        // 成功した場合、リトライで成功したらログを出力
        if (attempt > 0) {
          logger.debug(`API request succeeded after ${attempt} retry attempts`, { path });
        }

        return data as T;
      } catch (error) {
        clearTimeout(timeoutId);

        // AbortErrorの場合はタイムアウト（リトライ対象）
        if (error instanceof Error && error.name === 'AbortError') {
          const apiError = new ApiError(0, 'Request timeout');
          if (attempt < maxRetries) {
            lastError = apiError;
            logger.debug('Request timeout, will retry', { path, attempt: attempt + 1, maxRetries });
            continue; // リトライ
          }
          throw apiError;
        }

        // ApiErrorはリトライ対象かどうかを判定
        if (error instanceof ApiError) {
          if (isRetryableStatusCode(error.statusCode) && attempt < maxRetries) {
            lastError = error;
            continue; // リトライ
          }
          throw error;
        }

        // ネットワークエラー等（リトライ対象）
        const apiError = new ApiError(0, 'Network error', error);
        if (attempt < maxRetries) {
          lastError = apiError;
          logger.debug('Network error, will retry', { path, attempt: attempt + 1, maxRetries });
          continue; // リトライ
        }
        throw apiError;
      }
    }

    // ここに到達することはないはずだが、念のため
    throw lastError || new ApiError(0, 'Unknown error');
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
