import { logger } from '../utils/logger';
import { isUserRestrictionCode, type UserRestriction } from '../utils/user-restriction';

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
  /**
   * ページを離れた後も送信を続けるかどうか（fetch の `keepalive`。デフォルト: false）
   *
   * タブを閉じる・別のページへ移るときの通知（例: 見積書の編集セッションの退出、
   * estimate-creation REQ-11.7）に使う。本文は小さいものに限る（ブラウザの上限は 64KiB）。
   */
  keepalive?: boolean;
}

/**
 * multipart 送信で使用できるHTTPメソッド
 */
type FormDataMethod = 'POST' | 'PUT';

/**
 * multipart 送信のオプション
 */
interface SendFormDataOptions {
  /** HTTPメソッド（既定: POST） */
  readonly method?: FormDataMethod;
  /** 送信タイムアウト（ミリ秒、既定: UPLOAD_TIMEOUT_MS） */
  readonly timeout?: number;
}

/**
 * トークンリフレッシュコールバックの型定義
 */
export type TokenRefreshCallback = () => Promise<string>;

/**
 * 内部専用のリクエスト制御
 *
 * 公開メソッド（get/post/put/patch/delete）には露出させない。
 * トークン更新後の再送で再び更新を試みて無限ループになることを防ぐために用いる。
 */
interface InternalRequestControl {
  /** トークン更新を試みず、401をそのまま扱う */
  readonly skipTokenRefresh?: boolean;
  /** Authorization ヘッダーを付けない（リフレッシュ・CSRF トークンの取得） */
  readonly omitAuthorization?: boolean;
  /** メモリの CSRF トークンを `X-CSRF-Token` ヘッダーで送る（送信の都度、最新の値を使う） */
  readonly withCsrfToken?: boolean;
  /**
   * 成功の応答の本文を Blob で受け取る（`getBlob` だけが立てる）
   *
   * 失敗の応答の本文は従来どおり JSON（またはテキスト）として解析し、`ApiError` に載せる。
   * トークン更新後の再送にも引き継がれる（control ごと渡すため）。
   */
  readonly responseAsBlob?: boolean;
}

/**
 * Cookie の認証情報を使う要求の経路（要件33.8, 33.12）
 *
 * リフレッシュトークンは HttpOnly Cookie（Path=/api/v1/auth）だけにあり、画面のスクリプトからは
 * 読めない。リフレッシュとログアウトは本文を送らず、Cookie と CSRF トークンのヘッダーで送る。
 */
const CSRF_TOKEN_PATH = '/csrf-token';
const REFRESH_PATH = '/api/v1/auth/refresh';
const LOGOUT_PATH = '/api/v1/auth/logout';

/** CSRF トークンの不一致・欠落を表す backend のエラーコード（取り直して一度だけ送り直す） */
const CSRF_TOKEN_ERROR_CODES: readonly string[] = ['CSRF_TOKEN_MISSING', 'CSRF_TOKEN_INVALID'];

/**
 * リフレッシュの応答本文
 *
 * `user` は認証の状態の復元に使う利用者（要件33.11）。
 */
export interface SessionRefreshResponse<TUser = unknown> {
  accessToken: string;
  user?: TUser;
  expiresIn?: number;
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
 * 画像1件あたりの送信猶予（ミリ秒）
 *
 * モバイル回線からの multipart 送信は JSON の既定（30秒）では足りず、
 * 送り切れる通信でも時間切れで打ち切られてしまう。通常のデータ操作より長い
 * 120秒を multipart 送信の既定とする。
 *
 * Requirements (site-survey): 37.15
 */
export const UPLOAD_TIMEOUT_MS = 120000;

/**
 * multipart 送信で自動再試行を許すHTTPステータスコード
 *
 * サーバーの処理に到達する前の失敗だけを対象とする。`0` は通信障害、
 * `502` / `503` / `504` は上流の応答不能であり、いずれも登録が始まっていない。
 * `500` はサーバー処理中の失敗であり、永続化が完了した後に失敗した場合は
 * 再送が同一画像の重複登録を生むため対象に含めない。
 *
 * Requirements (site-survey): 37.13, 37.14
 */
const UPLOAD_RETRYABLE_STATUS_CODES: readonly number[] = [0, 502, 503, 504];

/**
 * 見積明細の一括保存がトランザクションの制限時間を超えたことを表すエラーコード
 *
 * バックエンドの `EstimateSaveTimeoutError`（500 / RFC7807）が返す `code`。
 * 画面側の文言分岐（`EstimateDetailPage`）と、下の再試行抑止の双方が
 * この1箇所を参照する（文字列を各所に散らさないため）。
 *
 * Requirements (estimate-creation): 42.3
 */
export const ESTIMATE_SAVE_TIMEOUT_CODE = 'ESTIMATE_SAVE_TIMEOUT';

/**
 * 自動再試行の対象から外すエラーコード
 *
 * サーバーが「この要求は終局的に失敗した」と宣言したもの。再送しても結果は変わらず、
 * 制限時間ぶんの待ち時間とサーバー負荷だけが積み上がる。
 * ステータスコードでは判定しない（同じ 500 でも一時的な障害は再試行する価値がある）。
 *
 * Requirements (estimate-creation): 42.3（制限時間超過の保存を繰り返さない）
 *
 * `EXPORT_RECORD_FAILED` は出力の記録を書けなかったことの宣言（user-authentication の
 * 出力の記録の失敗）。送り直しても文言の表示が遅れるだけで、送り直した要求がたまたま
 * 記録に成功すれば出力 1 回に記録が重なる。記録の要求とサーバーで生成する出力の要求は
 * 呼び出し側でも再試行を止めているが、止め忘れた呼び出しがあってもこのコードでは送り直さない。
 */
const NON_RETRYABLE_ERROR_CODES: readonly string[] = [
  ESTIMATE_SAVE_TIMEOUT_CODE,
  'EXPORT_RECORD_FAILED',
];

/**
 * エラーレスポンスのボディからサーバーのエラーコードを取り出す
 *
 * RFC 7807 Problem Details と従来形式のいずれも、コードは `code` に入る。
 */
function extractErrorCode(body: unknown): string | null {
  if (body !== null && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      return code;
    }
  }
  return null;
}

/**
 * `ApiError` からサーバーのエラーコードを取り出す
 *
 * HTTP ステータスだけでは区別できない失敗（同じ 500 でも原因が異なる）を
 * 呼び出し元が識別するための公開ヘルパー。
 *
 * @param error 任意の値（`ApiError` 以外や `code` の無い応答では null）
 */
export function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  return extractErrorCode(error.response);
}

/**
 * サーバーが終局的な失敗として宣言したエラーかどうかを判定
 */
function isNonRetryableErrorBody(body: unknown): boolean {
  const code = extractErrorCode(body);
  return code !== null && NON_RETRYABLE_ERROR_CODES.includes(code);
}

/**
 * エラーレスポンスの本文から表示用のメッセージを解決する
 *
 * RFC 7807 Problem Details の `detail`、従来形式の `error`、
 * HTTP の `statusText` の順で採用する。
 */
function resolveErrorMessage(data: unknown, statusText: string): string {
  const messageFromBody =
    data && typeof data === 'object'
      ? 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : 'error' in data && typeof data.error === 'string'
          ? data.error
          : null
      : null;

  return messageFromBody || statusText;
}

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
 * `ApiError` が自動再試行の対象かどうかを判定
 *
 * ステータスコードが再試行可能でも、サーバーが終局的な失敗を示すコードを返した場合は
 * 再試行しない。リクエスト単位で `disableRetry` を立てる方法とは異なり、
 * 同じエンドポイントの一時的な障害（502/503 等）からの回復は残る。
 *
 * multipart 送信（`isFormDataBody`）は非冪等であるため、判定を
 * `UPLOAD_RETRYABLE_STATUS_CODES` に限定する。再試行条件はリクエストオプションから
 * 注入せず、ボディが `FormData` である事実のみから導出する。
 *
 * Requirements (site-survey): 37.13, 37.14
 *
 * @param error 判定対象のエラー
 * @param isFormDataBody ボディが FormData（multipart 送信）かどうか
 */
function isRetryableApiError(error: ApiError, isFormDataBody: boolean): boolean {
  if (isNonRetryableErrorBody(error.response)) {
    return false;
  }

  return isFormDataBody
    ? UPLOAD_RETRYABLE_STATUS_CODES.includes(error.statusCode)
    : isRetryableStatusCode(error.statusCode);
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
  /**
   * アクセストークン
   *
   * インスタンスの変数だけに持ち、localStorage・sessionStorage・IndexedDB に書かない（要件33.10）
   */
  private accessToken: string | null = null;
  /**
   * CSRF トークン（`GET /csrf-token` の応答本文の値。メモリだけに持つ。要件33.12）
   */
  private csrfToken: string | null = null;
  private tokenRefreshCallback: TokenRefreshCallback | null = null;
  /**
   * 進行中のトークン更新
   *
   * 並行リクエストが同時に401となっても更新は1回だけ実行し、
   * 更新中に発生した401はこのPromiseの完了を待って同一リクエストを再送する。
   *
   * Requirements (site-survey): 37.11, 37.12
   */
  private refreshInFlight: Promise<string> | null = null;
  /** セッション切れ時のコールバック（要件30.13: AuthContextへの通知用） */
  private sessionExpiredCallback: (() => void) | null = null;
  /**
   * 利用者の状態による 403（`TWO_FACTOR_SETUP_REQUIRED`・`PASSWORD_CHANGE_REQUIRED`）を受けたときの
   * コールバック（AuthContext が利用者の状態を更新し、ProtectedRoute の制限に委ねる。
   * user-authentication 要件34.2・37.7、タスク47.6）
   */
  private userStateRestrictionCallback: ((code: UserRestriction) => void) | null = null;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  /**
   * トークン更新を開始し、進行中の更新として共有する
   *
   * 更新中は `tokenRefreshCallback` を外し、更新API自体が401を返した場合の
   * 再帰的な更新（デッドロック）を防ぐ。更新の完了時（成功・失敗を問わず）に
   * コールバックと共有状態を元へ戻す。
   *
   * Requirements (site-survey): 37.11
   *
   * @param callback 進行中の更新として実行するトークン更新コールバック
   */
  private beginTokenRefresh(callback: TokenRefreshCallback): Promise<string> {
    // 更新中は再帰的な更新を行わせない（更新APIが401を返した場合のデッドロック防止）
    this.tokenRefreshCallback = null;

    const shared = (async (): Promise<string> => {
      // `refreshInFlight` への代入を先に完了させるため、コールバックの起動を
      // 1マイクロタスク遅らせる。これにより更新API自身のリクエストは
      // 「更新の開始より後に始まった」と判定でき、自分の完了を待って固まらない。
      await Promise.resolve();

      try {
        return await callback();
      } finally {
        this.refreshInFlight = null;
        this.tokenRefreshCallback = callback;
      }
    })();

    this.refreshInFlight = shared;

    return shared;
  }

  /**
   * HTTPリクエストを送信
   * 5xxエラーやネットワークエラーに対してエクスポネンシャルバックオフ付きリトライを実行
   *
   * @param path リクエストパス
   * @param options リクエストオプション
   * @param control 内部専用のリクエスト制御（トークン更新後の再送で用いる）
   */
  private async request<T>(
    path: string,
    options: RequestOptions = {},
    control: InternalRequestControl = {}
  ): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      disableRetry = false,
      keepalive = false,
    } = options;

    // multipart 送信かどうか。boundary の付与をブラウザへ委ねるため、
    // FormData の場合は Content-Type を設定せず、本文も JSON 化しない。
    // 判定は `body instanceof FormData` の単一条件に限定し、JSON 経路へ影響させない。
    // Requirements (site-survey): 37.11, 37.13
    const isFormDataBody = body instanceof FormData;

    // このリクエストが開始した時点で進行中だったトークン更新。
    // 更新の開始より後に始まったリクエスト（更新API自身の呼び出し）は、
    // 自分の完了を待つことになりデッドロックするため待ち合わせの対象から除外する。
    // Requirements (site-survey): 37.11
    const refreshAtRequestStart = this.refreshInFlight;

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
        // multipart（FormData）では Content-Type を設定せず、ブラウザの自動設定に委ねる
        const requestHeaders: Record<string, string> = {
          ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        };

        if (this.accessToken && !control.omitAuthorization) {
          requestHeaders['Authorization'] = `Bearer ${this.accessToken}`;
        }

        if (control.withCsrfToken && this.csrfToken) {
          requestHeaders['X-CSRF-Token'] = this.csrfToken;
        }

        // FormData はそのまま渡す（再試行時も同一インスタンスを再送する）
        const requestBody: BodyInit | undefined = isFormDataBody
          ? body
          : body
            ? JSON.stringify(body)
            : undefined;

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal,
          credentials: 'include', // 要件26.5: HTTPOnly Cookieを送受信するため
          ...(keepalive ? { keepalive: true } : {}),
        });

        clearTimeout(timeoutId);

        // レスポンスボディを取得
        // ファイルの応答（getBlob）は成功の本文だけを Blob で受け取る。text() で文字列にすると
        // URL.createObjectURL に渡せない。失敗の本文は JSON として解析し、エラーコードを残す
        // （execution-budget-management Requirement 10.1, 10.2, 16.4, 16.5, 20.8）
        const contentType = response.headers.get('content-type');
        let data: unknown;

        if (control.responseAsBlob && response.ok) {
          data = await response.blob();
        } else if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        // 401エラーの場合、トークンリフレッシュを試みる（リトライ対象外）
        // TokenRefreshManagerが内部でエクスポネンシャルバックオフ付きリトライを行う
        // トークン更新後の再送（skipTokenRefresh）では更新を行わず無限ループを防ぐ
        if (response.status === 401 && !control.skipTokenRefresh) {
          const sharedRefresh = this.refreshInFlight;

          // 他のリクエストが開始したトークン更新が進行中の場合は、その完了を待って
          // 同一リクエストを再送する。更新を重複実行せず、セッション切れの誤通知も避ける。
          // Requirements (site-survey): 37.11, 37.12
          if (sharedRefresh !== null && sharedRefresh !== refreshAtRequestStart) {
            logger.debug('Token refresh already in progress, waiting for it to complete...', {
              path,
            });

            try {
              await sharedRefresh;
            } catch {
              // セッション切れの通知は更新を開始したリクエストが行う（二重通知を避ける）
              throw new ApiError(
                response.status,
                resolveErrorMessage(data, response.statusText),
                data
              );
            }

            return await this.request<T>(
              path,
              { ...options, disableRetry: true },
              { ...control, skipTokenRefresh: true }
            );
          }

          const refreshCallback = this.tokenRefreshCallback;

          if (refreshCallback) {
            // 要件16.21: 開発環境ではトークン有効期限切れをコンソールにログ出力
            logger.debug('Access token expired or invalid, attempting refresh...');

            try {
              // トークンをリフレッシュ（TokenRefreshManagerがリトライを処理）
              // 進行中の更新として共有し、並行リクエストが相乗りできるようにする
              const newAccessToken = await this.beginTokenRefresh(refreshCallback);

              // 新しいアクセストークンを設定
              this.setAccessToken(newAccessToken);

              // 元のリクエストを再送（再送では更新を行わず無限ループを防ぐ）
              return await this.request<T>(
                path,
                { ...options, disableRetry: true },
                { ...control, skipTokenRefresh: true }
              );
            } catch (refreshError) {
              // リフレッシュ失敗時のエラーログ
              logger.debug('Token refresh failed after all retry attempts', {
                error: refreshError instanceof Error ? refreshError.message : 'Unknown error',
              });

              // 要件30.13: セッション切れコールバックを呼び出し
              if (this.sessionExpiredCallback) {
                this.sessionExpiredCallback();
              }

              throw new ApiError(
                response.status,
                resolveErrorMessage(data, response.statusText),
                data
              );
            }
          }
        }

        // 要件30.13: tokenRefreshCallbackがnullの場合の401エラーでもsessionExpiredCallbackを呼び出し
        if (response.status === 401 && !this.tokenRefreshCallback && this.sessionExpiredCallback) {
          this.sessionExpiredCallback();
        }

        // 利用者の状態による 403 は AuthContext へ知らせる（画面の遷移の制限に委ねる。要件34.2・37.7）
        if (response.status === 403 && this.userStateRestrictionCallback) {
          const restrictionCode = extractErrorCode(data);
          if (isUserRestrictionCode(restrictionCode)) {
            this.userStateRestrictionCallback(restrictionCode);
          }
        }

        // エラーレスポンスの処理
        if (!response.ok) {
          // RFC 7807 Problem Details形式のdetailフィールド、または従来のerrorフィールドを優先的に使用
          const apiError = new ApiError(
            response.status,
            resolveErrorMessage(data, response.statusText),
            data
          );

          // 5xxエラーはリトライ対象（最後の試行でない場合）
          // ただしサーバーが終局的な失敗として宣言したコードは再送しない（42.3）
          // multipart 送信ではサーバー処理に到達する前の失敗に限定する（37.13, 37.14）
          if (isRetryableApiError(apiError, isFormDataBody) && attempt < maxRetries) {
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
        // ただし multipart 送信の時間切れは再試行しない。再試行するとユーザーが
        // 手動再送を開始できるまでの待ち時間が送信猶予の回数ぶん延伸するため、
        // 1回で失敗させる。ネットワークエラーと時間切れはどちらも statusCode 0 に
        // なるため、ステータスコードではなくこの発生分岐で区別する。
        // Requirements (site-survey): 37.19, 37.20
        if (error instanceof Error && error.name === 'AbortError') {
          const apiError = new ApiError(0, 'Request timeout');
          if (!isFormDataBody && attempt < maxRetries) {
            lastError = apiError;
            logger.debug('Request timeout, will retry', { path, attempt: attempt + 1, maxRetries });
            continue; // リトライ
          }
          throw apiError;
        }

        // ApiErrorはリトライ対象かどうかを判定
        if (error instanceof ApiError) {
          if (isRetryableApiError(error, isFormDataBody) && attempt < maxRetries) {
            lastError = error;
            continue; // リトライ
          }
          throw error;
        }

        // ネットワークエラー等（リトライ対象）
        // multipart 送信でもサーバー処理に到達する前の失敗であり再試行してよい（37.13）
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
   * ファイルを返す GET リクエスト（成功の本文を Blob で返す）
   *
   * サーバーで生成するファイルの出力（Excel・PDF）を受け取るための口。認証の付与・401 のトークン更新と
   * 再送・タイムアウト・再試行・エラー応答（JSON）の解析と `ApiError` の組み立ては `get` と同じ経路を通る。
   * 失敗の応答の `code`（例 `EXPORT_RECORD_FAILED`）は `getApiErrorCode` で取り出せる。
   * 発注・月別出来高の出力（execution-budget-management の要件 10.1・10.2・16.4・16.5・20.8）が使う。
   */
  async getBlob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Blob> {
    return this.request<Blob>(path, { ...options, method: 'GET' }, { responseAsBlob: true });
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
   * multipart（FormData）リクエストを送信
   *
   * 401リフレッシュ・セッション切れ通知・再試行・タイムアウトは `request()` の
   * 既存機構を共有する。再試行はサーバー処理に到達する前の失敗に限定され、
   * 送信の時間切れでは再試行しない（`request()` 内で FormData ボディから導出）。
   *
   * Requirements (site-survey): 37.11, 37.12, 37.13, 37.14, 37.15, 37.19, 37.20
   *
   * @param path リクエストパス
   * @param formData 送信する FormData
   * @param options メソッドと送信タイムアウトの上書き
   */
  async sendFormData<T>(
    path: string,
    formData: FormData,
    options: SendFormDataOptions = {}
  ): Promise<T> {
    const { method = 'POST', timeout = UPLOAD_TIMEOUT_MS } = options;

    return this.request<T>(path, { method, body: formData, timeout });
  }

  /**
   * CSRF トークンを取得してメモリに持つ
   *
   * backend は同じ値を Cookie `csrf-token` にも置き、状態を変える Cookie の要求で
   * ヘッダーと Cookie の一致と送信元のオリジンを照合する（要件33.12）。
   *
   * @returns 取得した CSRF トークン
   */
  async fetchCsrfToken(): Promise<string> {
    const data = await this.request<{ csrfToken?: unknown }>(
      CSRF_TOKEN_PATH,
      { method: 'GET' },
      { skipTokenRefresh: true, omitAuthorization: true }
    );
    if (!data || typeof data.csrfToken !== 'string' || data.csrfToken === '') {
      throw new ApiError(0, 'Invalid CSRF token response', data);
    }
    this.csrfToken = data.csrfToken;
    return data.csrfToken;
  }

  /**
   * CSRF トークンを取得してから Cookie の認証情報を使う要求を送る
   *
   * 他のタブが CSRF トークンを取り直すと Cookie の値が変わり、手元の値が一致しなくなる。
   * その不一致（`CSRF_TOKEN_INVALID`・`CSRF_TOKEN_MISSING`）では一度だけ取り直して送り直す。
   */
  private async sendWithCsrfToken<T>(path: string, control: InternalRequestControl): Promise<T> {
    const send = async (): Promise<T> => {
      await this.fetchCsrfToken();
      // 再試行しない: backend がローテーション・失効を確定した後に応答を失うと、ブラウザの Cookie は
      // 置き換え前のまま残る。再送はその古い Cookie を再提示し、再利用の検知で系列ごと失効させる（要件33.6）
      return this.request<T>(
        path,
        { method: 'POST', disableRetry: true },
        { ...control, withCsrfToken: true }
      );
    };

    try {
      return await send();
    } catch (error) {
      const code = getApiErrorCode(error);
      if (
        error instanceof ApiError &&
        error.statusCode === 403 &&
        code !== null &&
        CSRF_TOKEN_ERROR_CODES.includes(code)
      ) {
        return send();
      }
      throw error;
    }
  }

  /**
   * Cookie のリフレッシュトークンでセッションを更新する（要件33.8, 33.11, 33.12）
   *
   * 本文を送らず、HttpOnly Cookie（`credentials: 'include'`）と `X-CSRF-Token` で送る。
   * 期限切れのアクセストークンを Authorization に載せない。応答のアクセストークンを保持する。
   *
   * @returns 応答本文（アクセストークンと利用者）
   */
  async refreshSession<TUser = unknown>(): Promise<SessionRefreshResponse<TUser>> {
    const response = await this.sendWithCsrfToken<SessionRefreshResponse<TUser>>(REFRESH_PATH, {
      skipTokenRefresh: true,
      omitAuthorization: true,
    });
    this.setAccessToken(response.accessToken);
    return response;
  }

  /**
   * Cookie のリフレッシュトークンのセッションをログアウトする（要件33.4, 33.12）
   *
   * 本文を送らず、Bearer のアクセストークン・Cookie・`X-CSRF-Token` で送る。
   * アクセストークンが期限切れのときは通常の要求と同じくリフレッシュしてから送り直す。
   */
  async logoutSession(): Promise<void> {
    await this.sendWithCsrfToken<unknown>(LOGOUT_PATH, {});
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
   * メモリの認証情報（アクセストークンと CSRF トークン）を消す
   */
  clearCredentials(): void {
    this.accessToken = null;
    this.csrfToken = null;
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

  /**
   * セッション切れコールバックを設定
   * 要件30.13: トークンリフレッシュ失敗時にAuthContextへ通知するためのコールバック
   */
  setSessionExpiredCallback(callback: (() => void) | null): void {
    this.sessionExpiredCallback = callback;
  }

  /**
   * 利用者の状態による 403 のコールバックを設定（user-authentication タスク47.6）
   */
  setUserStateRestrictionCallback(callback: ((code: UserRestriction) => void) | null): void {
    this.userStateRestrictionCallback = callback;
  }

  /**
   * セッション切れコールバックを発火する
   * apiClient を経由しない FormData 送信経路（multipart upload）から、
   * 401 検出時に共通の SessionExpiredModal トリガーを呼び出すための公開メソッド。
   * Req 38.x（セッション切れ時のモーダル表示）が multipart upload 経路でも動くようにする。
   */
  triggerSessionExpired(): void {
    if (this.sessionExpiredCallback) {
      this.sessionExpiredCallback();
    }
  }
}

// シングルトンインスタンスをエクスポート
export const apiClient = new ApiClient();

// E2Eテスト用: apiClientインスタンスをwindowに公開
// Playwrightテストからpage.evaluate経由でapiClientの実メソッドを呼び出し可能にする
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__apiClient = apiClient;
}

// 型定義のエクスポート
export type { RequestOptions, SendFormDataOptions, FormDataMethod };
