/**
 * @fileoverview 画像フィット倍率算出ユーティリティ（純関数・React 非依存）
 *
 * 画像を表示コンテナに収める最大倍率（フィット倍率）を算出します。
 * 現行の `Math.min(maxW/imgW, maxH/imgH, 1)`（AnnotationEditor / ImageViewer）を
 * 一般化し、末尾の `1`（原寸頭打ち）を `allowUpscale` / `maxUpscale` で制御可能にします。
 *
 * - `allowUpscale=false`（既定）: 上限 1（原寸頭打ち。デスクトップ現行維持）
 * - `allowUpscale=true`: フィット倍率まで拡大（上限 `maxUpscale`。小画像を過小表示にしない）
 *
 * Requirements:
 * - 36.1: 画像を利用可能な表示領域の幅または高さに収まる最大倍率（フィット）で初期表示する
 * - 36.2: 原寸が表示領域より小さい場合、フィット倍率まで拡大し、原寸で頭打ちにする
 *
 * Task 99.1: imageFitScale 純関数の実装と単体テスト
 *
 * @module utils/imageFitScale
 */

/**
 * `allowUpscale=true` 時の既定拡大上限倍率。
 *
 * モバイルで小画像を過度にぼかさない範囲でフィット拡大を許容する妥当な上限。
 */
export const DEFAULT_MAX_UPSCALE = 3;

/**
 * フィット倍率算出のパラメータ。
 */
export interface FitScaleParams {
  /** 画像の原寸幅（px） */
  imageWidth: number;
  /** 画像の原寸高さ（px） */
  imageHeight: number;
  /** 表示コンテナの幅（px） */
  containerWidth: number;
  /** 表示コンテナの高さ（px） */
  containerHeight: number;
  /** コンテナ内の余白（px）。利用可能領域から差し引く。既定 0 */
  padding?: number;
  /** 原寸を超える拡大を許容するか。既定 false（原寸頭打ち） */
  allowUpscale?: boolean;
  /** `allowUpscale=true` 時の拡大上限倍率。既定 {@link DEFAULT_MAX_UPSCALE} */
  maxUpscale?: number;
}

/**
 * 値が有限かつ正であるかを判定する。
 */
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * 画像をコンテナに収める最大倍率（フィット倍率）を算出する純関数。
 *
 * 幅律速・高さ律速のうち小さい方（＝コンテナに収まる方）を採用し、
 * 上限（`allowUpscale=false` なら 1、`true` なら `maxUpscale`）で頭打ちにする。
 *
 * ゼロ・負・非有限といった不正入力に対しては、表示を壊さない安全値 1（原寸）を返す。
 *
 * @param params {@link FitScaleParams}
 * @returns フィット倍率（> 0）
 */
export function computeFitScale(params: FitScaleParams): number {
  const {
    imageWidth,
    imageHeight,
    containerWidth,
    containerHeight,
    padding = 0,
    allowUpscale = false,
    maxUpscale = DEFAULT_MAX_UPSCALE,
  } = params;

  // 拡大上限を決定する。allowUpscale=false は原寸頭打ち（上限 1）。
  // allowUpscale=true かつ maxUpscale が不正（非有限・0 以下）なら既定上限へフォールバック。
  const upperBound = allowUpscale
    ? isPositiveFinite(maxUpscale)
      ? maxUpscale
      : DEFAULT_MAX_UPSCALE
    : 1;

  // 画像寸法が不正ならゼロ除算・不定倍率を避けて安全値（原寸）を返す。
  if (!isPositiveFinite(imageWidth) || !isPositiveFinite(imageHeight)) {
    return 1;
  }

  // padding は有限かつ正のときのみ適用する（不正値は 0 扱い）。
  const effectivePadding = isPositiveFinite(padding) ? padding : 0;
  const safeContainerWidth = Number.isFinite(containerWidth) ? containerWidth : 0;
  const safeContainerHeight = Number.isFinite(containerHeight) ? containerHeight : 0;

  const availableWidth = safeContainerWidth - effectivePadding;
  const availableHeight = safeContainerHeight - effectivePadding;

  // 利用可能領域が非正なら表示を壊さない安全値（原寸）を返す。
  if (availableWidth <= 0 || availableHeight <= 0) {
    return 1;
  }

  const widthScale = availableWidth / imageWidth;
  const heightScale = availableHeight / imageHeight;

  // 律速（小さい方）を採用し、拡大上限で頭打ちにする。
  return Math.min(widthScale, heightScale, upperBound);
}
