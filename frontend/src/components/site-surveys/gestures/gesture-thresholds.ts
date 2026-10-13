/**
 * タッチジェスチャー判定の閾値定数（Req 27.6、30.1-30.8、33.2-33.4、34.7）
 *
 * touchGestureManager およびガイド表示から参照される共通定数。
 * 値の変更は UX と Req 27.6 の受入条件に直接影響するため慎重に扱うこと。
 *
 * @requirement site-survey/REQ-27.6
 */
import { TOUCH_CONSTANTS } from '../image-viewer.constants';

export const DOUBLE_TAP_MS = 300;
export const LONG_PRESS_MS = 500;
export const COOLDOWN_MS = 150;
export const DRAG_THRESHOLD_PX = 8;
export const GUIDE_IDLE_MS = 3000;

/**
 * 2本指ピンチをズームとして扱い始める距離変化の閾値（ピクセル, Req 33.2/33.3）。
 * 微小な指のブレでズームが暴れないようにするヒステリシス。
 * 画像ビューア共通の `image-viewer.constants` にある `TOUCH_CONSTANTS.PINCH_THRESHOLD` を
 * 単一の出所として集約し、閲覧/編集の両モード（いずれも touchGestureManager 経由）で
 * 感度を一貫させる（Req 33.10）。
 */
export const PINCH_DISTANCE_THRESHOLD_PX = TOUCH_CONSTANTS.PINCH_THRESHOLD;
