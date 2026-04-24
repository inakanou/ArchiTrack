/**
 * タッチジェスチャー閾値定数のテスト（Req 27.6, 30.1-30.8）
 *
 * これらの定数は touchGestureManager およびガイド表示から参照される
 * ため、値と相互関係のサニティを保証する。
 */
import { describe, it, expect } from 'vitest';
import {
  DOUBLE_TAP_MS,
  LONG_PRESS_MS,
  COOLDOWN_MS,
  DRAG_THRESHOLD_PX,
  GUIDE_IDLE_MS,
} from '../../../../components/site-surveys/gestures/gesture-thresholds';

describe('gesture-thresholds', () => {
  it('DOUBLE_TAP_MS は 300ms である（Req 27.6）', () => {
    expect(DOUBLE_TAP_MS).toBe(300);
  });

  it('LONG_PRESS_MS は 500ms である（Req 27.6）', () => {
    expect(LONG_PRESS_MS).toBe(500);
  });

  it('COOLDOWN_MS は 150ms である', () => {
    expect(COOLDOWN_MS).toBe(150);
  });

  it('DRAG_THRESHOLD_PX は 8px である', () => {
    expect(DRAG_THRESHOLD_PX).toBe(8);
  });

  it('GUIDE_IDLE_MS は 3000ms である', () => {
    expect(GUIDE_IDLE_MS).toBe(3000);
  });

  it('LONG_PRESS_MS > DOUBLE_TAP_MS （長押しはダブルタップ判定窓の経過後に発火）', () => {
    expect(LONG_PRESS_MS).toBeGreaterThan(DOUBLE_TAP_MS);
  });

  it('COOLDOWN_MS < DOUBLE_TAP_MS （クールダウンはダブルタップ窓より短い）', () => {
    expect(COOLDOWN_MS).toBeLessThan(DOUBLE_TAP_MS);
  });
});
