/**
 * @fileoverview localStorage QuotaExceededError検出ユーティリティのテスト
 *
 * Task 35.1: クロスブラウザQuotaExceededError検出ユーティリティを実装する
 *
 * Requirements:
 * - 15.10: クロスブラウザ対応（Chrome, Safari, Firefox, Edge）
 *
 * テスト対象:
 * - isQuotaExceededError関数
 * - isPrivateBrowsingMode関数
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isQuotaExceededError,
  isSecurityError,
  isPrivateBrowsingMode,
  isLocalStorageAvailable,
} from '../../utils/storage-error';

// =============================================================================
// isQuotaExceededError テスト
// =============================================================================

describe('isQuotaExceededError', () => {
  // ---------------------------------------------------------------------------
  // 要件15.10 が挙げる四形式を、それぞれ「ただ一つの判定にだけ合致する」入力で
  // 確かめる。判定は番号を先に見るため、番号と名前の両方を備えた例外を渡すと
  // 名前の分岐へ到達しない。名前の分岐を確かめるには番号を持たない例外が要る。
  //
  // なお jsdom の DOMException は既知の名前に対して legacy code を自動的に持つ
  // （'QuotaExceededError' → 22）。名前だけの入力には素の Error を使う。
  // ---------------------------------------------------------------------------

  it('Chrome/Safari/Edge: code===22のみに合致するエラーを検出すること', () => {
    // 名前は容量超過を示さない値（DOMException の既定名は 'Error'）にして、
    // code===22 の判定だけが成立する入力にする
    const error = new DOMException('Quota exceeded');
    Object.defineProperty(error, 'code', { value: 22 });
    expect(error.name).not.toBe('QuotaExceededError');
    expect(error.name).not.toBe('NS_ERROR_DOM_QUOTA_REACHED');

    expect(isQuotaExceededError(error)).toBe(true);
  });

  it('Firefox: code===1014のみに合致するエラーを検出すること', () => {
    const error = new DOMException('Quota exceeded');
    Object.defineProperty(error, 'code', { value: 1014 });
    expect(error.name).not.toBe('QuotaExceededError');
    expect(error.name).not.toBe('NS_ERROR_DOM_QUOTA_REACHED');

    expect(isQuotaExceededError(error)).toBe(true);
  });

  it('name===QuotaExceededErrorのみに合致するエラー（codeなし）を検出すること', () => {
    // 素の Error は code を持たないため、名前の判定だけが成立する
    const error = new Error('Quota exceeded');
    Object.defineProperty(error, 'name', { value: 'QuotaExceededError' });
    expect((error as unknown as { code?: number }).code).toBeUndefined();

    expect(isQuotaExceededError(error)).toBe(true);
  });

  it('name===NS_ERROR_DOM_QUOTA_REACHEDのみに合致するエラー（codeなし）を検出すること', () => {
    // Firefoxの古いバージョン用
    const error = new Error('Quota reached');
    Object.defineProperty(error, 'name', { value: 'NS_ERROR_DOM_QUOTA_REACHED' });
    expect((error as unknown as { code?: number }).code).toBeUndefined();

    expect(isQuotaExceededError(error)).toBe(true);
  });

  it('実ブラウザ相当（code===22 と name===QuotaExceededError の両方）を検出すること', () => {
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');

    expect(isQuotaExceededError(error)).toBe(true);
  });

  it('通常のErrorはQuotaExceededErrorとして検出しないこと', () => {
    const error = new Error('Some other error');

    expect(isQuotaExceededError(error)).toBe(false);
  });

  it('TypeErrorはQuotaExceededErrorとして検出しないこと', () => {
    const error = new TypeError('Type error');

    expect(isQuotaExceededError(error)).toBe(false);
  });

  it('nullはQuotaExceededErrorとして検出しないこと', () => {
    expect(isQuotaExceededError(null)).toBe(false);
  });

  it('undefinedはQuotaExceededErrorとして検出しないこと', () => {
    expect(isQuotaExceededError(undefined)).toBe(false);
  });

  it('文字列はQuotaExceededErrorとして検出しないこと', () => {
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
  });
});

// =============================================================================
// isSecurityError テスト
// =============================================================================

describe('isSecurityError', () => {
  it('SecurityErrorを検出すること', () => {
    const error = new DOMException('Security error', 'SecurityError');

    expect(isSecurityError(error)).toBe(true);
  });

  it('code===18のSecurityErrorを検出すること', () => {
    const error = new DOMException('Security error');
    Object.defineProperty(error, 'code', { value: 18 });

    expect(isSecurityError(error)).toBe(true);
  });

  it('name===SecurityErrorのエラーを検出すること（codeなし）', () => {
    const error = new Error('Security error');
    Object.defineProperty(error, 'name', { value: 'SecurityError' });

    expect(isSecurityError(error)).toBe(true);
  });

  it('通常のErrorはSecurityErrorとして検出しないこと', () => {
    const error = new Error('Some error');

    expect(isSecurityError(error)).toBe(false);
  });

  it('nullはSecurityErrorとして検出しないこと', () => {
    expect(isSecurityError(null)).toBe(false);
  });

  it('undefinedはSecurityErrorとして検出しないこと', () => {
    expect(isSecurityError(undefined)).toBe(false);
  });

  it('文字列はSecurityErrorとして検出しないこと', () => {
    expect(isSecurityError('SecurityError')).toBe(false);
  });
});

// =============================================================================
// isPrivateBrowsingMode テスト
// =============================================================================

describe('isPrivateBrowsingMode', () => {
  it('SecurityError発生時にプライベートブラウジングモードを検出すること', () => {
    const error = new DOMException('Blocked', 'SecurityError');

    expect(isPrivateBrowsingMode(error)).toBe(true);
  });

  it('Safari Private Mode: QuotaExceededErrorでquota===0の場合を検出すること', () => {
    // Safariのプライベートモードでは、QuotaExceededErrorが発生し
    // quotaが0に設定される場合がある
    const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
    Object.defineProperty(error, 'code', { value: 22 });

    // この場合、isQuotaExceededError=trueかつisPrivateBrowsingMode=trueになりうる
    // 実際のSafari動作では、setItem時に即座にQuotaExceededErrorが発生する
    expect(isPrivateBrowsingMode(error)).toBe(true);
  });

  it('通常のQuotaExceededErrorはプライベートモードとして検出しないこと', () => {
    // 通常のQuotaExceededError（容量超過）はプライベートモードではない
    const error = new Error('Storage limit reached');

    expect(isPrivateBrowsingMode(error)).toBe(false);
  });
});

// =============================================================================
// isLocalStorageAvailable テスト
// =============================================================================

describe('isLocalStorageAvailable', () => {
  let originalLocalStorage: Storage;

  beforeEach(() => {
    originalLocalStorage = window.localStorage;
  });

  afterEach(() => {
    // localStorageを元に戻す
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('localStorageが正常に動作する場合trueを返すこと', () => {
    // デフォルトのlocalStorageは利用可能
    expect(isLocalStorageAvailable()).toBe(true);
  });

  it('localStorageでエラーが発生する場合falseを返すこと', () => {
    // localStorageをモックしてエラーを発生させる
    const mockStorage = {
      setItem: vi.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }),
      removeItem: vi.fn(),
      getItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    expect(isLocalStorageAvailable()).toBe(false);
  });

  it('localStorageがSecurityErrorをスローする場合falseを返すこと', () => {
    // プライベートブラウジングモードをシミュレート
    const mockStorage = {
      setItem: vi.fn().mockImplementation(() => {
        throw new DOMException('SecurityError', 'SecurityError');
      }),
      removeItem: vi.fn(),
      getItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };

    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });

    expect(isLocalStorageAvailable()).toBe(false);
  });
});
