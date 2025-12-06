/**
 * @fileoverview レスポンシブユーティリティ
 *
 * Task 11.1: 画面幅対応の実装
 *
 * Requirements:
 * - 15.5: 320px〜1920pxの画面幅に対応
 * - 15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - 15.2: プロジェクト詳細画面をデスクトップ、タブレット、モバイルに対応
 *
 * このファイルは、レスポンシブデザインに必要なブレークポイント定数、
 * メディアクエリ、およびユーティリティ関数を一元管理します。
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * ブレークポイント名
 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'largeDesktop';

/**
 * ブレークポイント別の値マップ
 */
export type ResponsiveValues<T> = {
  mobile: T;
  tablet?: T;
  desktop?: T;
  largeDesktop?: T;
};

// ============================================================================
// 定数定義
// ============================================================================

/**
 * ブレークポイント定義
 *
 * - mobile: 768px未満
 * - tablet: 768px〜1023px
 * - desktop: 1024px〜1279px
 * - largeDesktop: 1280px以上
 */
export const BREAKPOINTS = {
  /** モバイル: 768px未満 */
  mobile: 768,
  /** タブレット: 1024px未満 */
  tablet: 1024,
  /** デスクトップ: 1280px未満 */
  desktop: 1280,
} as const;

/**
 * サポートする最小画面幅（px）
 * Requirement 15.5: 320px〜1920pxの画面幅に対応
 */
export const MIN_VIEWPORT_WIDTH = 320;

/**
 * サポートする最大画面幅（px）
 * Requirement 15.5: 320px〜1920pxの画面幅に対応
 */
export const MAX_VIEWPORT_WIDTH = 1920;

/**
 * メディアクエリ定義
 *
 * useMediaQueryフックと共に使用します。
 *
 * @example
 * ```tsx
 * const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
 * ```
 */
export const MEDIA_QUERIES = {
  /** モバイル: 767px以下 */
  isMobile: '(max-width: 767px)',

  /** タブレット: 768px〜1023px */
  isTablet: '(min-width: 768px) and (max-width: 1023px)',

  /** デスクトップ: 1024px以上 */
  isDesktop: '(min-width: 1024px)',

  /** 小型モバイル: 479px以下 */
  isSmallMobile: '(max-width: 479px)',

  /** 大型デスクトップ: 1280px以上 */
  isLargeDesktop: '(min-width: 1280px)',

  /** アニメーション低減設定 */
  prefersReducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 画面幅からブレークポイント名を取得
 *
 * @param width - 画面幅（px）
 * @returns ブレークポイント名
 *
 * @example
 * ```ts
 * getBreakpointForWidth(320);   // 'mobile'
 * getBreakpointForWidth(768);   // 'tablet'
 * getBreakpointForWidth(1024);  // 'desktop'
 * getBreakpointForWidth(1280);  // 'largeDesktop'
 * ```
 */
export function getBreakpointForWidth(width: number): Breakpoint {
  if (width < BREAKPOINTS.mobile) {
    return 'mobile';
  }
  if (width < BREAKPOINTS.tablet) {
    return 'tablet';
  }
  if (width < BREAKPOINTS.desktop) {
    return 'desktop';
  }
  return 'largeDesktop';
}

/**
 * 画面幅がサポート範囲内かどうかを判定
 *
 * @param width - 画面幅（px）
 * @returns サポート範囲内（320px〜1920px）の場合true
 *
 * @example
 * ```ts
 * isWithinSupportedRange(320);   // true
 * isWithinSupportedRange(1920);  // true
 * isWithinSupportedRange(319);   // false
 * isWithinSupportedRange(1921);  // false
 * ```
 */
export function isWithinSupportedRange(width: number): boolean {
  return width >= MIN_VIEWPORT_WIDTH && width <= MAX_VIEWPORT_WIDTH;
}

/**
 * ブレークポイントに応じた値を取得
 *
 * 指定したブレークポイントの値が未定義の場合、
 * より小さいブレークポイントの値にフォールバックします。
 *
 * @param breakpoint - 現在のブレークポイント
 * @param values - ブレークポイント別の値マップ
 * @returns 現在のブレークポイントに対応する値
 *
 * @example
 * ```ts
 * const padding = getResponsiveValue('tablet', {
 *   mobile: '8px',
 *   tablet: '16px',
 *   desktop: '24px',
 * });
 * // padding === '16px'
 *
 * // フォールバック例
 * const margin = getResponsiveValue('desktop', {
 *   mobile: '8px',
 * });
 * // margin === '8px' (desktopが未定義なのでmobileにフォールバック)
 * ```
 */
export function getResponsiveValue<T>(breakpoint: Breakpoint, values: ResponsiveValues<T>): T {
  // ブレークポイントの優先順位（大きい方から小さい方へ）
  const fallbackOrder: Breakpoint[] = ['largeDesktop', 'desktop', 'tablet', 'mobile'];

  // 現在のブレークポイントからフォールバック開始位置を取得
  const startIndex = fallbackOrder.indexOf(breakpoint);

  // 現在のブレークポイントから順にフォールバックを探索
  for (let i = startIndex; i < fallbackOrder.length; i++) {
    const bp = fallbackOrder[i];
    if (bp === undefined) continue;

    if (bp === 'mobile') {
      // mobileは必ず存在する（RequiredなのでResponsiveValuesで必須）
      return values.mobile;
    }

    // bpがkeyof ResponsiveValuesであることを保証
    const value = values[bp as keyof ResponsiveValues<T>];
    if (value !== undefined) {
      return value as T;
    }
  }

  // どのブレークポイントにも一致しない場合はmobileを返す
  return values.mobile;
}
