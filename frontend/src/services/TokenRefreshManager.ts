/**
 * トークンリフレッシュマネージャー
 *
 * Race Condition対策（単一Promise共有）とマルチタブ同期（Broadcast Channel API）を実装
 */

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
 * TokenRefreshManagerクラス
 *
 * - Race Condition対策: 複数の同時リフレッシュリクエストを単一のPromiseで共有
 * - マルチタブ同期: Broadcast Channel APIでタブ間のトークン更新を同期
 * - 自動リフレッシュ: 有効期限5分前に自動的にトークンをリフレッシュ
 */
export class TokenRefreshManager {
  private refreshPromise: Promise<string> | null = null;
  private broadcastChannel: BroadcastChannel;
  private autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenRefreshedCallbacks: TokenRefreshedCallback[] = [];

  /**
   * コンストラクタ
   * @param refreshFn トークンリフレッシュ関数
   */
  constructor(private refreshFn: RefreshTokenFunction) {
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
   * トークンをリフレッシュする
   *
   * Race Condition対策: 同時に複数回呼ばれても、単一のPromiseを共有して1回のみ実行
   *
   * @returns 新しいアクセストークン
   */
  async refreshToken(): Promise<string> {
    // 既にリフレッシュ中の場合は、同じPromiseを返す（Race Condition対策）
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // 新しいリフレッシュPromiseを作成
    this.refreshPromise = (async () => {
      try {
        const accessToken = await this.refreshFn();

        // 他のタブにトークン更新を通知（マルチタブ同期）
        this.broadcastChannel.postMessage({
          type: 'TOKEN_REFRESHED',
          accessToken,
        } as TokenRefreshedMessage);

        return accessToken;
      } finally {
        // リフレッシュ完了後、Promiseをリセット
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * 自動リフレッシュをスケジュールする
   *
   * 有効期限の5分前に自動的にトークンをリフレッシュ
   *
   * @param expiresIn トークンの有効期限（ミリ秒）
   */
  scheduleAutoRefresh(expiresIn: number): void {
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
      this.refreshToken();
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
