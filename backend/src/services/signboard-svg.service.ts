/**
 * @fileoverview 電子小黒板（工事看板）SVGジェネレータ
 *
 * Task 3.2: 電子小黒板SVGジェネレータ
 *
 * 工事看板データ（ConstructionSignboardDto）と配置（SignboardPlacement、画像ピクセル
 * 座標系）から、画像実寸のSVG文字列を生成する純関数を提供する。合成（sharp）や
 * ストレージ/ルートには一切関与せず、SVG文字列のみを返す（合成は Task 3.3）。
 *
 * 書式は社内の既存工事写真に写り込む電子小黒板（工事黒板）に準拠する:
 * - 背景: 濃い緑（ダークグリーン）、不透明、角は矩形
 * - 文字・罫線: 白（#ffffff）。白の枠線と行区切り線
 * - 上部: 標準項目行「工事件名」=workName、「工事場所」=workLocation に続けて自由項目行
 * - 下部: 大きめの記入欄に固定テキスト（footerText、改行で折り返し）
 *
 * 実装は annotated-thumbnail.service.ts の generateSvgFromAnnotation を踏襲し、
 * 画像実寸の viewBox を持つ <svg> で <rect>/<line>/<text> をラップする。
 * ユーザー由来の文字列は必ず XML エスケープしてインジェクション/破損を防止する。
 *
 * Requirements:
 * - 8.5: 電子小黒板調の書式（濃緑地・白文字・白の枠線／区切り線、上部に項目行、下部に記入欄）で描画する
 * - 9.3: 看板の表示位置（画像上）を反映する
 * - 9.4: 看板の表示サイズ（拡大・縮小）を反映する
 *
 * @module services/signboard-svg
 */

import type {
  ConstructionSignboardDto,
  SignboardPlacement,
} from '../types/construction-photo.types.js';

// ============================================================================
// 定数定義（書式）
// ============================================================================

/** 濃緑地（ダークグリーン、不透明） */
const BOARD_FILL = '#0b5d3b';
/** 白（文字・枠線・区切り線） */
const WHITE = '#ffffff';
/** 標準項目のラベル */
const LABEL_WORK_NAME = '工事件名';
const LABEL_WORK_LOCATION = '工事場所';
/** 日本語フォントフォールバック（annotated-thumbnail に準拠） */
const FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';

/** 上部項目行が占める板高さの割合（残りが下部記入欄） */
const TOP_AREA_RATIO = 0.55;
/** ラベル列が占める板幅の割合 */
const LABEL_COL_RATIO = 0.35;
/** 板内側の余白（板幅・板高さに対する割合） */
const PADDING_RATIO = 0.03;
/** 枠線・区切り線の太さ（板短辺に対する割合、最小1px） */
const STROKE_RATIO = 0.006;

// ============================================================================
// ユーティリティ
// ============================================================================

/**
 * XMLエスケープ（annotated-thumbnail.service.ts と同一仕様）
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 数値を SVG 属性用に丸める（小数は2桁まで、末尾ゼロは除去）
 */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ============================================================================
// SVG生成
// ============================================================================

/**
 * 工事看板データと配置から、画像実寸の電子小黒板SVG文字列を生成する。
 *
 * @param signboard - 工事看板DTO（workName/workLocation/freeItems/footerText）
 * @param placement - 板の配置（画像ピクセル座標系、非負矩形）
 * @param imageWidth - 対象画像の幅（px）
 * @param imageHeight - 対象画像の高さ（px）
 * @returns 画像実寸の viewBox を持つ SVG 文字列
 * @requirement 8.5, 9.3, 9.4
 */
export function generateSignboardSvg(
  signboard: ConstructionSignboardDto,
  placement: SignboardPlacement,
  imageWidth: number,
  imageHeight: number
): string {
  const { left, top, width, height } = placement;

  const strokeWidth = Math.max(1, Math.min(width, height) * STROKE_RATIO);
  const padX = width * PADDING_RATIO;
  const padY = height * PADDING_RATIO;

  // 上部項目行（標準2行 + 自由項目行）
  const rows: Array<{ label: string; value: string }> = [
    { label: LABEL_WORK_NAME, value: signboard.workName },
    { label: LABEL_WORK_LOCATION, value: signboard.workLocation },
    ...signboard.freeItems.map((item) => ({ label: item.label, value: item.value })),
  ];

  const topAreaHeight = height * TOP_AREA_RATIO;
  const rowHeight = topAreaHeight / rows.length;
  const labelColWidth = width * LABEL_COL_RATIO;
  const rowFontSize = Math.max(8, rowHeight * 0.45);

  const elements: string[] = [];

  // 1. 板本体（濃緑地・不透明）＋白枠線
  elements.push(
    `<rect x="${fmt(left)}" y="${fmt(top)}" width="${fmt(width)}" height="${fmt(height)}" ` +
      `fill="${BOARD_FILL}" stroke="${WHITE}" stroke-width="${fmt(strokeWidth)}"/>`
  );

  // 2. 上部項目行: ラベル列/値列の縦区切り線
  elements.push(
    `<line x1="${fmt(left + labelColWidth)}" y1="${fmt(top)}" ` +
      `x2="${fmt(left + labelColWidth)}" y2="${fmt(top + topAreaHeight)}" ` +
      `stroke="${WHITE}" stroke-width="${fmt(strokeWidth)}"/>`
  );

  // 3. 各項目行（行区切り線 + ラベル + 値）
  rows.forEach((row, i) => {
    const rowTop = top + i * rowHeight;
    const textBaseline = rowTop + rowHeight / 2 + rowFontSize / 3;

    // 行区切り線（先頭行以外の上端に白線）
    if (i > 0) {
      elements.push(
        `<line x1="${fmt(left)}" y1="${fmt(rowTop)}" x2="${fmt(left + width)}" y2="${fmt(rowTop)}" ` +
          `stroke="${WHITE}" stroke-width="${fmt(strokeWidth)}"/>`
      );
    }

    // ラベル（やや太字）
    elements.push(
      `<text x="${fmt(left + padX)}" y="${fmt(textBaseline)}" ` +
        `font-size="${fmt(rowFontSize)}" fill="${WHITE}" font-family='${FONT_FAMILY}' ` +
        `font-weight="bold">${escapeXml(row.label)}</text>`
    );

    // 値
    elements.push(
      `<text x="${fmt(left + labelColWidth + padX)}" y="${fmt(textBaseline)}" ` +
        `font-size="${fmt(rowFontSize)}" fill="${WHITE}" font-family='${FONT_FAMILY}'>` +
        `${escapeXml(row.value)}</text>`
    );
  });

  // 4. 上部/下部の境界線
  const footerTop = top + topAreaHeight;
  elements.push(
    `<line x1="${fmt(left)}" y1="${fmt(footerTop)}" x2="${fmt(left + width)}" y2="${fmt(footerTop)}" ` +
      `stroke="${WHITE}" stroke-width="${fmt(strokeWidth)}"/>`
  );

  // 5. 下部記入欄: 固定テキスト（改行で折り返し）
  const footerText = signboard.footerText ?? '';
  const footerLines = footerText.length > 0 ? footerText.split('\n') : [];
  if (footerLines.length > 0) {
    const footerFontSize = Math.max(8, rowFontSize * 0.9);
    const lineHeight = footerFontSize * 1.4;
    const footerTextX = left + padX;
    const footerTextY = footerTop + padY + footerFontSize;

    const tspans = footerLines
      .map(
        (line, idx) =>
          `<tspan x="${fmt(footerTextX)}" dy="${idx === 0 ? '0' : fmt(lineHeight)}">` +
          `${escapeXml(line)}</tspan>`
      )
      .join('');

    elements.push(
      `<text x="${fmt(footerTextX)}" y="${fmt(footerTextY)}" ` +
        `font-size="${fmt(footerFontSize)}" fill="${WHITE}" font-family='${FONT_FAMILY}'>` +
        `${tspans}</text>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" ` +
    `viewBox="0 0 ${imageWidth} ${imageHeight}">${elements.join('')}</svg>`
  );
}
