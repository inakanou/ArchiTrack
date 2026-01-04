/**
 * @fileoverview localStorage QuotaExceededError検出ユーティリティ
 *
 * Task 35.1: クロスブラウザQuotaExceededError検出ユーティリティを実装する
 *
 * Requirements:
 * - 15.10: クロスブラウザ対応（Chrome, Safari, Firefox, Edge）
 *
 * このユーティリティは、以下のブラウザでのQuotaExceededErrorを検出します:
 * - Chrome: code===22, name===QuotaExceededError
 * - Safari: code===22, name===QuotaExceededError
 * - Firefox: code===1014, name===NS_ERROR_DOM_QUOTA_REACHED
 * - Edge: code===22, name===QuotaExceededError
 */

// =============================================================================
// 定数
// =============================================================================

/** Chrome/Safari/EdgeのQuotaExceededErrorコード */
const QUOTA_EXCEEDED_CODE_WEBKIT = 22;

/** FirefoxのQuotaExceededErrorコード */
const QUOTA_EXCEEDED_CODE_FIREFOX = 1014;

/** SecurityErrorコード（DOMException） */
const SECURITY_ERROR_CODE = 18;

/** QuotaExceededErrorの名前 */
const QUOTA_EXCEEDED_ERROR_NAME = 'QuotaExceededError';

/** FirefoxのQuotaExceededError名前（古いバージョン） */
const NS_ERROR_DOM_QUOTA_REACHED = 'NS_ERROR_DOM_QUOTA_REACHED';

/** SecurityError名前 */
const SECURITY_ERROR_NAME = 'SecurityError';

// =============================================================================
// 型ガード
// =============================================================================

/**
 * DOMException-likeオブジェクトかどうかを判定
 */
interface DOMExceptionLike {
  name?: string;
  code?: number;
  message?: string;
}

/**
 * ErrorまたはDOMException-likeオブジェクトかどうかを判定
 */
function isErrorLike(value: unknown): value is DOMExceptionLike {
  return (
    value !== null &&
    typeof value === 'object' &&
    ('name' in value || 'code' in value || 'message' in value)
  );
}

// =============================================================================
// エクスポート関数
// =============================================================================

/**
 * QuotaExceededErrorかどうかを判定する
 *
 * クロスブラウザ対応:
 * - Chrome/Safari/Edge: code===22 または name===QuotaExceededError
 * - Firefox: code===1014 または name===NS_ERROR_DOM_QUOTA_REACHED
 *
 * @param error - 検査対象のエラー
 * @returns QuotaExceededErrorの場合true
 *
 * @example
 * try {
 *   localStorage.setItem('key', largeData);
 * } catch (e) {
 *   if (isQuotaExceededError(e)) {
 *     // ストレージ容量超過の処理
 *     handleQuotaExceeded();
 *   }
 * }
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (!isErrorLike(error)) {
    return false;
  }

  // code属性によるチェック（Chrome/Safari/Edge/Firefox）
  if (error.code === QUOTA_EXCEEDED_CODE_WEBKIT || error.code === QUOTA_EXCEEDED_CODE_FIREFOX) {
    return true;
  }

  // name属性によるチェック
  if (error.name === QUOTA_EXCEEDED_ERROR_NAME || error.name === NS_ERROR_DOM_QUOTA_REACHED) {
    return true;
  }

  return false;
}

/**
 * SecurityErrorかどうかを判定する
 *
 * プライベートブラウジングモードでlocalStorageにアクセスすると
 * SecurityErrorが発生することがあります。
 *
 * @param error - 検査対象のエラー
 * @returns SecurityErrorの場合true
 *
 * @example
 * try {
 *   localStorage.setItem('key', 'value');
 * } catch (e) {
 *   if (isSecurityError(e)) {
 *     // プライベートブラウジングモードの可能性
 *     handlePrivateMode();
 *   }
 * }
 */
export function isSecurityError(error: unknown): boolean {
  if (!isErrorLike(error)) {
    return false;
  }

  // code属性によるチェック
  if (error.code === SECURITY_ERROR_CODE) {
    return true;
  }

  // name属性によるチェック
  if (error.name === SECURITY_ERROR_NAME) {
    return true;
  }

  return false;
}

/**
 * プライベートブラウジングモードを示すエラーかどうかを判定する
 *
 * プライベートブラウジングモードでは:
 * - SecurityErrorが発生する（Firefox, 一部のChrome）
 * - QuotaExceededErrorが発生し、実際には書き込み不可（Safari Private Mode）
 *
 * @param error - 検査対象のエラー
 * @returns プライベートブラウジングモードを示すエラーの場合true
 *
 * @example
 * try {
 *   localStorage.setItem('test', 'test');
 * } catch (e) {
 *   if (isPrivateBrowsingMode(e)) {
 *     // プライベートモードでの動作
 *     showPrivateModeWarning();
 *   }
 * }
 */
export function isPrivateBrowsingMode(error: unknown): boolean {
  // SecurityErrorはプライベートモードを示す
  if (isSecurityError(error)) {
    return true;
  }

  // Safari Private Mode: QuotaExceededErrorで即座に失敗する場合
  // （通常は容量超過まで書き込めるが、プライベートモードでは最初から書き込み不可）
  if (isQuotaExceededError(error)) {
    // Safari Private Modeでは、QuotaExceededErrorが発生するが
    // これはストレージが0バイトに制限されているため
    // isQuotaExceededErrorがtrueの場合、プライベートモードの可能性がある
    return true;
  }

  return false;
}

/**
 * localStorageが利用可能かどうかをテストする
 *
 * プライベートブラウジングモードやセキュリティ制限で
 * localStorageが利用できない場合を検出します。
 *
 * @returns localStorageが利用可能な場合true
 *
 * @example
 * if (!isLocalStorageAvailable()) {
 *   // localStorageが利用不可
 *   fallbackToMemoryStorage();
 * }
 */
export function isLocalStorageAvailable(): boolean {
  const testKey = '__storage_test__';

  try {
    const storage = window.localStorage;
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch {
    // QuotaExceededError、SecurityError、または他のエラー
    return false;
  }
}
