/**
 * タッチジェスチャー判定の閾値定数（Req 27.6、30.1-30.8）
 *
 * touchGestureManager およびガイド表示から参照される共通定数。
 * 値の変更は UX と Req 27.6 の受入条件に直接影響するため慎重に扱うこと。
 */
export const DOUBLE_TAP_MS = 300;
export const LONG_PRESS_MS = 500;
export const COOLDOWN_MS = 150;
export const DRAG_THRESHOLD_PX = 8;
export const GUIDE_IDLE_MS = 3000;
