/**
 * @fileoverview 看板配置ジオメトリ換算（純関数）のテスト
 *
 * Task 6.4: 看板配置エディタ
 *
 * 表示座標系（プレビュー上のfabric Rect座標）と画像ピクセル座標系
 * （SignboardPlacement）の相互換算を検証する。
 *
 * Requirements:
 * - 9.1: 表示位置と大きさを画像ピクセル座標で確定する
 * - 9.3, 9.4: ドラッグ移動・拡大縮小後の座標換算
 *
 * Boundary: signboard-placement-geometry (util)
 */

import { describe, it, expect } from 'vitest';
import {
  computeDisplaySize,
  displayRectToPlacement,
  placementToDisplayRect,
} from './signboard-placement-geometry';

describe('computeDisplaySize', () => {
  it('横長画像を最大幅に収め、scale=表示幅/画像幅を返す', () => {
    const result = computeDisplaySize(2000, 1000, 600);
    expect(result.width).toBe(600);
    expect(result.height).toBe(300);
    expect(result.scale).toBeCloseTo(0.3, 10);
  });

  it('画像が最大幅より小さい場合は等倍（scale=1）で表示する', () => {
    const result = computeDisplaySize(400, 300, 600);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.scale).toBe(1);
  });

  it('不正な寸法（0以下）はフォールバックしてscale=1を返す', () => {
    const result = computeDisplaySize(0, 0, 600);
    expect(result.scale).toBe(1);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe('displayRectToPlacement', () => {
  it('表示座標を scale で割って画像ピクセル座標へ換算する', () => {
    // scale=0.3 の表示 → 画像px = 表示 / 0.3
    const placement = displayRectToPlacement(
      { left: 30, top: 60, width: 90, height: 45 },
      0.3,
      2000,
      1000
    );
    expect(placement).toEqual({ left: 100, top: 200, width: 300, height: 150 });
  });

  it('fabricのscaleX/scaleY拡縮を含む表示幅・高さを換算する', () => {
    // width 100 * scaleX 2 = 表示幅200 → 画像px 200/0.5=400
    const placement = displayRectToPlacement(
      { left: 10, top: 20, width: 100, height: 50, scaleX: 2, scaleY: 3 },
      0.5,
      1000,
      1000
    );
    expect(placement).toEqual({ left: 20, top: 40, width: 400, height: 300 });
  });

  it('画像範囲外へはみ出す座標を画像内へクランプする（非負・実寸内）', () => {
    const placement = displayRectToPlacement(
      { left: -30, top: -30, width: 3000, height: 3000 },
      1,
      1000,
      800
    );
    expect(placement.left).toBe(0);
    expect(placement.top).toBe(0);
    expect(placement.left + placement.width).toBeLessThanOrEqual(1000);
    expect(placement.top + placement.height).toBeLessThanOrEqual(800);
    expect(placement.width).toBeGreaterThan(0);
    expect(placement.height).toBeGreaterThan(0);
  });
});

describe('placementToDisplayRect', () => {
  it('画像ピクセル座標に scale を掛けて表示座標へ復元する', () => {
    const rect = placementToDisplayRect({ left: 100, top: 200, width: 300, height: 150 }, 0.3);
    expect(rect.left).toBeCloseTo(30, 10);
    expect(rect.top).toBeCloseTo(60, 10);
    expect(rect.width).toBeCloseTo(90, 10);
    expect(rect.height).toBeCloseTo(45, 10);
  });

  it('換算は往復で一致する（placement→display→placement）', () => {
    const original = { left: 120, top: 240, width: 360, height: 180 };
    const display = placementToDisplayRect(original, 0.3);
    const roundTrip = displayRectToPlacement(display, 0.3, 2000, 1000);
    expect(roundTrip).toEqual(original);
  });
});
