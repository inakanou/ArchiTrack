import { logger } from '../utils/logger';

/**
 * トークンリフレッシュマネージャー
 *
 * Race Condition対策（単一Promise共有）とマルチタブ同期（Web Locks による直列化と
 * Broadcast Channel API による結果の配布）を実装
 * サーバーsleep状態からの復帰時のリトライ機構（エクスポネンシャルバックオフ。502・503 に限る）を含む
 *
 * user-authentication 要件33.6・33.8・33.10 に対応する
 */

/**
 * タブ間でリフレッシュを直列化するロックの名前
 *
 * リフレッシュトークンは HttpOnly Cookie にあり、同じブラウザの全てのタブが共有する。
 * ローテーションの下では、二つのタブが同じ Cookie で同時にリフレッシュすると、後着が
 * 置き換え済みのトークンの再提示（再利用）と判定されうる。backend は置き換えの直後 10 秒の猶予
 * （要件33.13）で同時の提示を受け付けるが、猶予に頼らずリフレッシュはこのロックの中で一つずつ行う
 * （猶予を過ぎた後着は系列ごと失効させる。要件33.6）。
 */
export const REFRESH_LOCK_NAME = 'architrack-auth-refresh';

/**
 * リフレッシュの結果を配る Broadcast Channel の名前
 */
export const TOKEN_REFRESH_CHANNEL_NAME = 'token-refresh-channel';

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
  /**
   * 他のタブから受け取ったアクセストークンの数と最新の値
   *
   * ロックの待ちの間に他のタブがリフレッシュを終えて配ったトークンがあれば、それを使い
   * 自分ではリフレッシュを送らない（同時のリフレッシュを一回の要求にまとめる）。
   */
  private receivedBroadcastCount = 0;
  private latestBroadcastToken: string | null = null;
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
    this.broadcastChannel = new BroadcastChannel(TOKEN_REFRESH_CHANNEL_NAME);

    // 他のタブからのトークン更新通知を受信
    this.broadcastChannel.onmessage = (event: MessageEvent<TokenRefreshedMessage>) => {
      if (event.data.type === 'TOKEN_REFRESHED') {
        this.receivedBroadcastCount += 1;
        this.latestBroadcastToken = event.data.accessToken;
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
   *
   * 処理に到達しなかったことが応答から分かるサーバーエラー（502・503。サーバーsleep状態からの
   * 復帰待ち、中継先の不在、backend の接続の時間切れによる 503）だけを再送する。応答を受け取って
   * いればブラウザの Cookie は応答どおりに保たれ、再送は最新の Cookie を提示する。
   *
   * 次は再送しない（user-authentication 要件33.6）。backend がローテーションを確定した後に応答を
   * 失う・失敗すると Cookie は置き換え前のまま残り、再送は置き換え済みのトークンの再提示（再利用）
   * になる。置き換えの直後 10 秒の猶予（要件33.13）を過ぎていれば系列ごと失効させるため、再送しない。
   * - 応答を失った失敗（通信の失敗・時間切れ。statusCode 0 や statusCode を持たないエラー）
   * - 処理の途中や後で失敗しうる 500・504（中継の待ち切れの後も backend は処理を続けうる）
   * - 認証エラー（4xx）
   *
   * @param error エラーオブジェクト
   */
  private isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const statusCode = (error as { statusCode: unknown }).statusCode;
      return statusCode === 502 || statusCode === 503;
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

    // 呼び出しの時点までに受け取った配布の数（これより後の配布だけを「直前に配られた」とみなす）
    const broadcastCountAtStart = this.receivedBroadcastCount;

    // 新しいリフレッシュPromiseを作成（タブ間の直列化とリトライ機構付き）
    // try/finallyでPromiseをリセット（.finally()による別Promiseの未処理rejectionを防ぐ）
    this.refreshPromise = (async () => {
      try {
        return await this.runExclusively(() => this.refreshUnderLock(broadcastCountAtStart));
      } finally {
        // リフレッシュ完了後（成功・失敗問わず）、Promiseをリセット
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * タブ間のロック（Web Locks）の中で処理を行う
   *
   * Web Locks が使えない環境（テストの実行環境など）では、そのまま処理を行う。
   */
  private async runExclusively(task: () => Promise<string>): Promise<string> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks || typeof locks.request !== 'function') {
      return task();
    }
    return locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, async () => {
      // ロックを解放したタブが直前に配ったメッセージは、ロックの取得と前後して届く。
      // 届いている途中のメッセージを先に受け取るため、一度タスクを譲ってから判定する
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return task();
    });
  }

  /**
   * ロックの中のリフレッシュ
   *
   * 呼び出しの後に他のタブが新しいアクセストークンを配っていれば、それを返して要求を送らない。
   * 無ければリフレッシュを送り（リトライ機構付き）、結果を他のタブへ配る。
   *
   * @param broadcastCountAtStart 呼び出しの時点までに受け取った配布の数
   */
  private async refreshUnderLock(broadcastCountAtStart: number): Promise<string> {
    if (this.receivedBroadcastCount > broadcastCountAtStart && this.latestBroadcastToken) {
      logger.debug('Token already refreshed by another tab, reusing the broadcast token');
      return this.latestBroadcastToken;
    }

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
        // 配る先は同じオリジンのタブだけで、永続しない（要件33.10）
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
