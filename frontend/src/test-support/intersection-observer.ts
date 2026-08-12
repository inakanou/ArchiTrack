/**
 * @fileoverview テスト環境向け IntersectionObserver スタブ
 *
 * Task 110.1: テスト環境に表示領域観測のスタブを用意する
 *
 * jsdom は IntersectionObserver を実装していないため、表示領域への到達を観測する
 * コンポーネント・フックのテストが実行時エラーになる。本モジュールは観測対象の
 * 登録・解除を記録し、交差状態をテストから任意のタイミングで発火できるスタブを提供する。
 *
 * `vitest.setup.ts` から `installIntersectionObserverStub()` を呼び出して全テストへ
 * 適用し、テスト間の状態は `resetIntersectionObserverStub()` で初期化する。
 *
 * Requirements: 38.8
 *
 * @module test-support/intersection-observer
 */

// ============================================================================
// 内部状態
// ============================================================================

interface StubRegistration {
  callback: IntersectionObserverCallback;
  observer: IntersectionObserver;
  targets: Set<Element>;
}

/** 生成済みかつ未 disconnect のオブザーバ登録 */
const registrations = new Set<StubRegistration>();

/** disconnect が呼ばれた回数（アンマウント時の解除検証に用いる） */
let disconnectCallCount = 0;

// ============================================================================
// スタブ本体
// ============================================================================

/**
 * IntersectionObserver のスタブ実装
 *
 * 交差判定は行わず、`triggerIntersection` から明示的に発火された場合にのみ
 * コールバックを呼び出す。
 */
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin: string;
  readonly thresholds: ReadonlyArray<number>;

  private readonly registration: StubRegistration;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? '0px';
    this.scrollMargin = options?.scrollMargin ?? '0px';
    const threshold = options?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];

    this.registration = { callback, observer: this, targets: new Set<Element>() };
    registrations.add(this.registration);
  }

  observe(target: Element): void {
    this.registration.targets.add(target);
  }

  unobserve(target: Element): void {
    this.registration.targets.delete(target);
  }

  disconnect(): void {
    disconnectCallCount += 1;
    this.registration.targets.clear();
    registrations.delete(this.registration);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// ============================================================================
// テストからの制御
// ============================================================================

/**
 * 交差状態を表すエントリを組み立てる
 *
 * jsdom ではレイアウトが計算されないため矩形はすべて 0 になる。交差判定そのものは
 * スタブが行わないため、`isIntersecting` 以外の値はテストの関心事ではない。
 */
function buildEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    boundingClientRect: rect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: rect,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
}

/**
 * 指定した要素を観測しているオブザーバへ交差状態を発火する
 *
 * 観測されていない要素を指定した場合は何も起こらない。
 *
 * @param target - 交差状態を発火する対象要素
 * @param isIntersecting - 表示領域に入ったか（既定: true）
 */
export function triggerIntersection(target: Element, isIntersecting = true): void {
  for (const registration of [...registrations]) {
    if (!registration.targets.has(target)) {
      continue;
    }
    registration.callback([buildEntry(target, isIntersecting)], registration.observer);
  }
}

/**
 * 観測中のすべての要素へ交差状態を発火する
 *
 * 観測対象の要素参照をテスト側で保持していない場合に用いる。
 *
 * @param isIntersecting - 表示領域に入ったか（既定: true）
 */
export function triggerAllIntersections(isIntersecting = true): void {
  for (const registration of [...registrations]) {
    for (const target of [...registration.targets]) {
      registration.callback([buildEntry(target, isIntersecting)], registration.observer);
    }
  }
}

/**
 * 指定した要素が観測中かどうかを返す
 *
 * @param target - 判定する要素
 */
export function isObserving(target: Element): boolean {
  for (const registration of registrations) {
    if (registration.targets.has(target)) {
      return true;
    }
  }
  return false;
}

/**
 * 観測中のオブザーバ数を返す
 *
 * 観測が行われていないこと（観測を無効化する縮退条件）の検証に用いる。
 */
export function activeObserverCount(): number {
  return registrations.size;
}

/**
 * disconnect が呼ばれた回数を返す
 *
 * アンマウント時に観測が解除されることの検証に用いる。
 */
export function disconnectCount(): number {
  return disconnectCallCount;
}

// ============================================================================
// インストールとリセット
// ============================================================================

/**
 * グローバルの IntersectionObserver をスタブへ差し替える
 *
 * 実装が既に存在する環境でも上書きする。テストの実行環境を決定論的に保つため、
 * ブラウザ実装の有無で挙動が変わらないようにする。
 */
export function installIntersectionObserverStub(): void {
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

/**
 * テスト間で持ち越される状態を初期化する
 *
 * 登録済みオブザーバと disconnect の呼び出し回数をクリアする。
 */
export function resetIntersectionObserverStub(): void {
  registrations.clear();
  disconnectCallCount = 0;
}
