/**
 * @fileoverview SignboardSvgService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * 電子小黒板調SVGジェネレータの単体テスト。看板データ（ConstructionSignboardDto）と
 * 配置（SignboardPlacement, 画像ピクセル座標）から、画像実寸のSVG文字列を生成する
 * 純関数を検証する。
 *
 * Requirements:
 * - 8.5: 工事看板を電子小黒板調の書式（濃い緑地・白文字・白の枠線／区切り線、
 *        上部にラベルと値の項目行、下部に記入欄）で描画する
 * - 9.3: 看板の表示位置（画像上）を反映する
 * - 9.4: 看板の表示サイズ（拡大・縮小）を反映する
 *
 * Task 3.2: 電子小黒板SVGジェネレータ
 */

import { describe, it, expect } from 'vitest';
import { generateSignboardSvg } from '../../../services/signboard-svg.service.js';
import type {
  ConstructionSignboardDto,
  SignboardPlacement,
} from '../../../types/construction-photo.types.js';

// ============================================================================
// テストフィクスチャ
// ============================================================================

const baseSignboard: ConstructionSignboardDto = {
  id: 'sb-1',
  projectId: 'prj-1',
  workName: '○○ビル改修工事',
  workLocation: '東京都千代田区1-2-3',
  freeItems: [
    { label: '施工者', value: '△△建設株式会社' },
    { label: '工種', value: '内装仕上' },
  ],
  footerText: '一階ロビー\n天井ボード張替',
  inUseCount: 0,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

const placement: SignboardPlacement = {
  left: 100,
  top: 50,
  width: 400,
  height: 300,
};

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;

// ============================================================================
// テスト
// ============================================================================

describe('generateSignboardSvg', () => {
  // (a) SVGが画像実寸の viewBox/width/height を持つ
  it('画像実寸の width / height / viewBox を持つ <svg> を返す (R9.3, R9.4)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`width="${IMAGE_WIDTH}"`);
    expect(svg).toContain(`height="${IMAGE_HEIGHT}"`);
    expect(svg).toContain(`viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}"`);
  });

  // (b) placement 座標に濃緑地の矩形が置かれる
  it('placement 座標・大きさに濃緑地の矩形を描画する (R8.5, R9.3, R9.4)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    // 板全体を表す緑地 rect が placement の座標・サイズで存在する
    const boardRect = new RegExp(
      `<rect[^>]*\\bx="${placement.left}"[^>]*\\by="${placement.top}"[^>]*\\bwidth="${placement.width}"[^>]*\\bheight="${placement.height}"[^>]*>`
    );
    const match = svg.match(boardRect);
    expect(match).not.toBeNull();
    // 濃緑地（ダークグリーン系）で塗られている
    expect(match?.[0]).toMatch(/fill="#0b5d3b"/i);
  });

  // (b') 白の枠線／区切り線が存在する
  it('白の枠線・区切り線を描画する (R8.5)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    // 白ストロークの矩形（枠線）
    expect(svg).toMatch(/stroke="#ffffff"/i);
    // 行区切りの白線（<line ... stroke=white>）
    expect(svg).toMatch(/<line[^>]*stroke="#ffffff"/i);
  });

  // (c) workName / workLocation の値が白文字で含まれる
  it('工事件名・工事場所の値を白文字で描画する (R8.5)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(svg).toContain('工事件名');
    expect(svg).toContain('工事場所');
    expect(svg).toContain('○○ビル改修工事');
    expect(svg).toContain('東京都千代田区1-2-3');

    // 値のテキスト要素が白文字で描画される
    const whiteText = new RegExp(`<text[^>]*fill="#ffffff"[^>]*>○○ビル改修工事</text>`, 'i');
    expect(svg).toMatch(whiteText);
  });

  // (d) freeItems の label / value が行として含まれる
  it('自由項目のラベルと値を行として描画する (R8.5)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(svg).toContain('施工者');
    expect(svg).toContain('△△建設株式会社');
    expect(svg).toContain('工種');
    expect(svg).toContain('内装仕上');
  });

  // (e) footerText が下部に含まれ改行で折り返される
  it('固定テキストを下部の記入欄に改行折返しで描画する (R8.5)', () => {
    const svg = generateSignboardSvg(baseSignboard, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(svg).toContain('一階ロビー');
    expect(svg).toContain('天井ボード張替');

    // 改行は複数の <tspan> 行として折り返される
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBeGreaterThanOrEqual(2);

    // 下部（板の縦中央より下）に配置される：footer領域のtextのy座標が板中央より大きい
    const footerYBoundary = placement.top + placement.height / 2;
    // 一階ロビー を含む <text> 要素（途中で別の </text> を跨がない）の y を取得
    const footerTextMatch = svg.match(
      /<text[^>]*\by="([\d.]+)"[^>]*>(?:(?!<\/text>)[\s\S])*?一階ロビー/
    );
    expect(footerTextMatch).not.toBeNull();
    if (footerTextMatch) {
      expect(Number(footerTextMatch[1])).toBeGreaterThan(footerYBoundary);
    }
  });

  // (f) ユーザー文字列がXMLエスケープされる
  it('ユーザー文字列を XML エスケープする（インジェクション/破損防止）', () => {
    const malicious: ConstructionSignboardDto = {
      ...baseSignboard,
      workName: 'A & B <tag>',
      workLocation: '"quote" & \'apos\'',
      freeItems: [{ label: '<lbl>', value: 'v & <x>' }],
      footerText: 'line1 & <b>\nline2 > ok',
    };

    const svg = generateSignboardSvg(malicious, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    // 生の危険文字がテキストとして混入していないこと
    expect(svg).toContain('A &amp; B &lt;tag&gt;');
    expect(svg).toContain('v &amp; &lt;x&gt;');
    expect(svg).toContain('line1 &amp; &lt;b&gt;');
    // 生の <tag> や <b> がそのまま出ていない
    expect(svg).not.toContain('<tag>');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toContain('<lbl>');
  });

  // (g) freeItems 空・footerText 無しでも壊れない
  it('自由項目が空・固定テキストが無しでも有効なSVGを返す', () => {
    const minimal: ConstructionSignboardDto = {
      ...baseSignboard,
      freeItems: [],
      footerText: null,
    };

    const svg = generateSignboardSvg(minimal, placement, IMAGE_WIDTH, IMAGE_HEIGHT);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // 標準項目は依然として描画される
    expect(svg).toContain('工事件名');
    expect(svg).toContain('工事場所');
    // 緑地の板は描画される
    expect(svg).toMatch(/fill="#0b5d3b"/i);
    // tspan（footer）は無くても壊れない
    expect(() => generateSignboardSvg(minimal, placement, IMAGE_WIDTH, IMAGE_HEIGHT)).not.toThrow();
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-8.5
 */
