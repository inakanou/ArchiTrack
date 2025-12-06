/**
 * @fileoverview レスポンシブ状態管理フック
 *
 * Task 11.1: 画面幅対応の実装
 *
 * Requirements:
 * - 15.5: 320px〜1920pxの画面幅に対応
 * - 15.1: プロジェクト一覧画面をデスクトップ、タブレット、モバイルに対応
 * - 15.2: プロジェクト詳細画面をデスクトップ、タブレット、モバイルに対応
 *
 * このフックは、画面幅に応じたレスポンシブ状態を一元管理します。
 */

import useMediaQuery from './useMediaQuery';
import { MEDIA_QUERIES, type Breakpoint } from '../utils/responsive';

// ============================================================================
// 型定義
// ============================================================================

/**
 * useResponsiveフックの戻り値
 */
export interface ResponsiveState {
  /** モバイル判定（767px以下） */
  isMobile: boolean;
  /** 小型モバイル判定（479px以下） */
  isSmallMobile: boolean;
  /** タブレット判定（768px〜1023px） */
  isTablet: boolean;
  /** デスクトップ判定（1024px以上） */
  isDesktop: boolean;
  /** 大型デスクトップ判定（1280px以上） */
  isLargeDesktop: boolean;
  /** 現在のブレークポイント */
  currentBreakpoint: Breakpoint;
  /** アニメーション低減設定の有効状態 */
  prefersReducedMotion: boolean;
}

// ============================================================================
// フック実装
// ============================================================================

/**
 * レスポンシブ状態管理フック
 *
 * 画面幅に応じたブレークポイント判定を提供します。
 * ブレークポイントは以下の通りです:
 *
 * - mobile: 768px未満
 * - tablet: 768px〜1023px
 * - desktop: 1024px〜1279px
 * - largeDesktop: 1280px以上
 *
 * @returns レスポンシブ状態オブジェクト
 *
 * @example
 * ```tsx
 * function ResponsiveComponent() {
 *   const { isMobile, isTablet, isDesktop } = useResponsive();
 *
 *   if (isMobile) {
 *     return <MobileView />;
 *   }
 *   if (isTablet) {
 *     return <TabletView />;
 *   }
 *   return <DesktopView />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * function AccessibleComponent() {
 *   const { prefersReducedMotion } = useResponsive();
 *
 *   return (
 *     <div className={prefersReducedMotion ? 'no-animation' : 'animated'}>
 *       Content
 *     </div>
 *   );
 * }
 * ```
 */
function useResponsive(): ResponsiveState {
  // 各ブレークポイントのメディアクエリを監視
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);
  const isSmallMobile = useMediaQuery(MEDIA_QUERIES.isSmallMobile);
  const isTablet = useMediaQuery(MEDIA_QUERIES.isTablet);
  const isDesktop = useMediaQuery(MEDIA_QUERIES.isDesktop);
  const isLargeDesktop = useMediaQuery(MEDIA_QUERIES.isLargeDesktop);
  const prefersReducedMotion = useMediaQuery(MEDIA_QUERIES.prefersReducedMotion);

  // 現在のブレークポイントを判定
  const currentBreakpoint: Breakpoint = (() => {
    if (isLargeDesktop) return 'largeDesktop';
    if (isDesktop) return 'desktop';
    if (isTablet) return 'tablet';
    return 'mobile';
  })();

  return {
    isMobile,
    isSmallMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    currentBreakpoint,
    prefersReducedMotion,
  };
}

export default useResponsive;
