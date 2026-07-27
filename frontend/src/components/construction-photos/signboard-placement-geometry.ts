/**
 * @fileoverview 看板配置ジオメトリ換算（純関数）
 *
 * Task 6.4: 看板配置エディタ
 *
 * プレビュー（fabric）上の表示座標系と、保存対象である画像ピクセル座標系
 * （{@link SignboardPlacement}）を相互換算する。fabricの直接描画に依存しない
 * 純関数として切り出し、単体テスト可能にする。
 *
 * 換算規約は既存の注釈エディタ（site-survey）に倣い、
 *   scale = 表示サイズ / 画像実寸
 * を用いる（アスペクト比は保持し、幅・高さのスケールは同一）。
 *
 * Requirements:
 * - 9.1: 表示位置・大きさを画像ピクセル座標で確定する
 * - 9.3, 9.4: ドラッグ移動・拡大縮小後の座標換算
 *
 * @module components/construction-photos/signboard-placement-geometry
 */

import type { SignboardPlacement } from '../../types/construction-photo.types';

/** 表示座標系の矩形（fabric Rect 相当。scaleX/scaleY は拡縮ハンドル操作を表す） */
export interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** fabricの拡縮スケール（省略時1） */
  scaleX?: number;
  scaleY?: number;
}

/** 表示サイズと換算スケール */
export interface DisplaySize {
  width: number;
  height: number;
  /** 表示 = 画像px × scale */
  scale: number;
}

/**
 * 画像実寸を最大表示幅に収めた表示サイズと換算スケールを算出する。
 *
 * - 画像が最大幅より小さい場合は拡大せず等倍（scale=1）とする。
 * - 不正な寸法（0以下）は最大幅へフォールバックし scale=1 を返す。
 */
export function computeDisplaySize(
  imageWidth: number,
  imageHeight: number,
  maxDisplayWidth: number
): DisplaySize {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return { width: maxDisplayWidth, height: maxDisplayWidth, scale: 1 };
  }
  const scale = Math.min(1, maxDisplayWidth / imageWidth);
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    scale,
  };
}

/**
 * 表示座標系の矩形を画像ピクセル座標系の {@link SignboardPlacement} へ換算する。
 *
 * - fabric の scaleX/scaleY を反映した実効表示サイズを用いる。
 * - 画像内に収まる非負矩形（left/top >= 0、幅高さ > 0、実寸内）へクランプする。
 * - 画像ピクセルは整数へ丸める。
 */
export function displayRectToPlacement(
  rect: DisplayRect,
  scale: number,
  imageWidth: number,
  imageHeight: number
): SignboardPlacement {
  const safeScale = scale > 0 ? scale : 1;
  const effectiveWidth = rect.width * (rect.scaleX ?? 1);
  const effectiveHeight = rect.height * (rect.scaleY ?? 1);

  const rawLeft = rect.left / safeScale;
  const rawTop = rect.top / safeScale;
  const rawWidth = effectiveWidth / safeScale;
  const rawHeight = effectiveHeight / safeScale;

  return clampPlacement(
    { left: rawLeft, top: rawTop, width: rawWidth, height: rawHeight },
    imageWidth,
    imageHeight
  );
}

/**
 * 画像ピクセル座標系の配置を表示座標系の矩形へ復元する（初期配置の描画用）。
 * scaleX/scaleY は 1（幅高さに直接反映済み）とする。
 */
export function placementToDisplayRect(
  placement: SignboardPlacement,
  scale: number
): DisplayRect {
  const safeScale = scale > 0 ? scale : 1;
  return {
    left: placement.left * safeScale,
    top: placement.top * safeScale,
    width: placement.width * safeScale,
    height: placement.height * safeScale,
    scaleX: 1,
    scaleY: 1,
  };
}

/**
 * 画像内に収まる非負整数矩形へクランプする。
 * left/top を [0, image] に収め、幅高さは残余領域を超えないよう抑え、最小1pxを保証する。
 */
function clampPlacement(
  raw: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): SignboardPlacement {
  const maxW = imageWidth > 0 ? imageWidth : 1;
  const maxH = imageHeight > 0 ? imageHeight : 1;

  const left = clamp(Math.round(raw.left), 0, maxW - 1);
  const top = clamp(Math.round(raw.top), 0, maxH - 1);
  const width = clamp(Math.round(raw.width), 1, maxW - left);
  const height = clamp(Math.round(raw.height), 1, maxH - top);

  return { left, top, width, height };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
