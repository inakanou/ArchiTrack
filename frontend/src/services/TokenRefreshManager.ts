import { logger } from '../utils/logger';

/**
 * トークンリフレッシュマネージャー
 *
 * Race Condition対策（単一Promise共有）とマルチタブ同期（Broadcast Channel API）を実装
 * サーバーsleep状態からの復帰時のリトライ機構（エクスポネンシャルバックオフ）を含む
 */

/**
 * テスト環境かどうかを判定
 */
const isTestEnvironment = import.meta.env.MODE === 'test';

/**
 * トークンリフレッシュ関数の型定義
 */
export type RefreshTokenFunction = () => Promise<string>;

/**
 * トークン更新時のコールバック関数の型定義
 */
export type TokenRefreshedCallback = (accessToken: string) => void;

/**
 * Broadcast Channelメッセージの型定義
 */
interface TokenRefreshedMessage {
  type: 'TOKEN_REFRESHED';
  accessToken: string;
}

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

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1秒
  maxDelayMs: 10000, // 最大10秒
  backoffMultiplier: 2, // 1s -> 2s -> 4s
};

/**
 * TokenRefreshManagerの設定オプション
 */
interface TokenRefreshManagerOptions {
  /** リトライ設定 */
  retryConfig?: Partial<RetryConfig>;
  /** テストモードで自動リフレッシュを強制的に有効化（テスト専用） */
  forceAutoRefreshInTest?: boolean;
}

/**
 * TokenRefreshManagerクラス
 *
 * - Race Condition対策: 複数の同時リフレッシュリクエストを単一のPromiseで共有
 * - マルチタブ同期: Broadcast Channel APIでタブ間のトークン更新を同期
 * - 自動リフレッシュ: 有効期限5分前に自動的にトークンをリフレッシュ
 * - リトライ機構: サーバーsleep状態からの復帰待機（エクスポネンシャルバックオフ）
 */
export class TokenRefreshManager {
  private refreshPromise: Promise<string> | null = null;
  private broadcastChannel: BroadcastChannel;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefreshedCallbacks: TokenRefreshedCallback[] = [];
  private retryConfig: RetryConfig;
  private forceAutoRefreshInTest: boolean;

  /**
   * コンストラクタ
   * @param refreshFn トークンリフレッシュ関数
   * @param options 設定オプション（リトライ設定、テストモードフラグ）
   */
  constructor(refreshFn: RefreshTokenFunction, options?: TokenRefreshManagerOptions);
  /**
   * @deprecated リトライ設定のみを渡す場合は options.retryConfig を使用してください
   */
  constructor(refreshFn: RefreshTokenFunction, retryConfig?: Partial<RetryConfig>);
  constructor(
    private refreshFn: RefreshTokenFunction,
    optionsOrRetryConfig?: TokenRefreshManagerOptions | Partial<RetryConfig>
  ) {
    // 後方互換性: RetryConfigかOptionsかを判定
    const isOptions =
      optionsOrRetryConfig &&
      ('retryConfig' in optionsOrRetryConfig || 'forceAutoRefreshInTest' in optionsOrRetryConfig);
    const options: TokenRefreshManagerOptions = isOptions
      ? (optionsOrRetryConfig as TokenRefreshManagerOptions)
      : { retryConfig: optionsOrRetryConfig as Partial<RetryConfig> | undefined };

    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retryConfig };
    this.forceAutoRefreshInTest = options.forceAutoRefreshInTest ?? false;

    // Broadcast Channel初期化（マルチタブ同期用）
    this.broadcastChannel = new BroadcastChannel('token-refresh-channel');

    // 他のタブからのトークン更新通知を受信
    this.broadcastChannel.onmessage = (event: MessageEvent<TokenRefreshedMessage>) => {
      if (event.data.type === 'TOKEN_REFRESHED') {
        // コールバックを実行してトークンを更新
        this.tokenRefreshedCallbacks.forEach((callback) => {
          callback(event.data.accessToken);
        });
      }
    };
  }

  /**
   * 遅延関数
   * テスト環境では遅延をスキップして高速化
   * @param ms 遅延ミリ秒
   */
  private delay(ms: number): Promise<void> {
    // テスト環境では遅延をスキップ
    if (isTestEnvironment) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * リトライ可能なエラーかどうかを判定
   * サーバーsleep状態からの復帰待機やネットワークエラーはリトライ対象
   * 認証エラー（無効なトークン等）はリトライ不可
   *
   * @param error エラーオブジェクト
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークエラー（サーバー到達不可、タイムアウト等）はリトライ可能
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // 明確な認証エラーはリトライ不可
      if (
        message.includes('invalid') ||
        message.includes('expired') ||
        message.includes('unauthorized')
      ) {
        return false;
      }

      // ネットワークエラー、タイムアウトはリトライ可能
      if (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('fetch') ||
        message.includes('connection')
      ) {
        return true;
      }

      // REFRESH_ERRORコードはサーバー側の一時的なエラーの可能性があるのでリトライ
      if (message.includes('refresh_error') || message.includes('refresh error')) {
        return true;
      }
    }

    // statusCodeが0（ネットワークエラー）または5xx（サーバーエラー）はリトライ可能
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode === 0 || (statusCode >= 500 && statusCode < 600)) {
        return true;
      }
    }

    return false;
  }

  /**
   * トークンをリフレッシュする
   *
   * Race Condition対策: 同時に複数回呼ばれても、単一のPromiseを共有して1回のみ実行
   * サーバーsleep状態からの復帰待機: エクスポネンシャルバックオフでリトライ
   *
   * @returns 新しいアクセストークン
   */
  async refreshToken(): Promise<string> {
    // 既にリフレッシュ中の場合は、同じPromiseを返す（Race Condition対策）
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // 新しいリフレッシュPromiseを作成（リトライ機構付き）
    // try/finallyでPromiseをリセット（.finally()による別Promiseの未処理rejectionを防ぐ）
    this.refreshPromise = (async () => {
      try {
        let lastError: unknown = null;
        let currentDelay = this.retryConfig.initialDelayMs;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
          try {
            // リトライ時はログを出力
            if (attempt > 0) {
              logger.debug(
                `Token refresh retry attempt ${attempt}/${this.retryConfig.maxRetries} after ${currentDelay}ms delay`
              );
            }

            const accessToken = await this.refreshFn();

            // 成功した場合、他のタブにトークン更新を通知（マルチタブ同期）
            this.broadcastChannel.postMessage({
              type: 'TOKEN_REFRESHED',
              accessToken,
            } as TokenRefreshedMessage);

            // リトライで成功した場合はログを出力
            if (attempt > 0) {
              logger.debug(`Token refresh succeeded after ${attempt} retry attempts`);
            }

            return accessToken;
          } catch (error) {
            lastError = error;

            // 最後の試行の場合、またはリトライ不可能なエラーの場合はエラーをスロー
            if (attempt >= this.retryConfig.maxRetries || !this.isRetryableError(error)) {
              logger.debug(
                `Token refresh failed${attempt > 0 ? ` after ${attempt} retries` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              throw error;
            }

            // リトライ可能なエラーの場合、待機してから再試行
            logger.debug(
              `Token refresh failed (attempt ${attempt + 1}), will retry after ${currentDelay}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
            );

            await this.delay(currentDelay);

            // エクスポネンシャルバックオフで次の遅延を計算
            currentDelay = Math.min(
              currentDelay * this.retryConfig.backoffMultiplier,
              this.retryConfig.maxDelayMs
            );
          }
        }

        // ここには到達しないはずだが、念のため
        throw lastError;
      } finally {
        // リフレッシュ完了後（成功・失敗問わず）、Promiseをリセット
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * 自動リフレッシュをスケジュールする
   *
   * 有効期限の5分前に自動的にトークンをリフレッシュ
   * テスト環境ではスケジュールをスキップ（タイマーによる未処理Promise rejectionを防ぐ）
   * ただし forceAutoRefreshInTest オプションが設定されている場合は実行
   *
   * @param expiresIn トークンの有効期限（ミリ秒）
   */
  scheduleAutoRefresh(expiresIn: number): void {
    // テスト環境では自動リフレッシュをスキップ
    // テストでの未処理Promise rejection問題を防ぐため
    // ただし forceAutoRefreshInTest が設定されている場合は実行（scheduleAutoRefreshの単体テスト用）
    if (isTestEnvironment && !this.forceAutoRefreshInTest) {
      return;
    }

    // 既存のタイマーをキャンセル
    this.cancelAutoRefresh();

    // 5分前にリフレッシュ（5分 = 300,000ミリ秒）
    const refreshThreshold = 5 * 60 * 1000;

    // 有効期限が5分未満の場合はスケジュールしない
    if (expiresIn <= refreshThreshold) {
      return;
    }

    const delay = expiresIn - refreshThreshold;

    this.autoRefreshTimer = setTimeout(() => {
      this.refreshToken().catch((error) => {
        // 自動リフレッシュの失敗はログに記録するのみ（未処理rejectionを防ぐ）
        logger.debug('Auto token refresh failed:', error);
      });
    }, delay);
  }

  /**
   * 自動リフレッシュをキャンセルする
   */
  private cancelAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearTimeout(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  /**
   * トークン更新時のコールバックを登録する
   *
   * 他のタブでトークンが更新された際に呼び出される
   *
   * @param callback コールバック関数
   */
  onTokenRefreshed(callback: TokenRefreshedCallback): void {
    this.tokenRefreshedCallbacks.push(callback);
  }

  /**
   * クリーンアップ処理
   *
   * - 自動リフレッシュタイマーをキャンセル
   * - Broadcast Channelをクローズ
   */
  cleanup(): void {
    this.cancelAutoRefresh();
    this.broadcastChannel.close();
    this.tokenRefreshedCallbacks = [];
  }
}
