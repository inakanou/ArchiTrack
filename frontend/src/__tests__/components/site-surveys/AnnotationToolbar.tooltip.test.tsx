/**
 * @fileoverview AnnotationToolbar - 長押しによるツールヒント表示
 *
 * Task 115.104 (Req 29.6): ツールヒントはこれまでブラウザ既定の `title` 属性に頼っており、
 * マウスホバーでしか現れなかった。指で操作する現場端末では `title` は表示されないため、
 * 要件29.6 の「長押しで表示する」が成立していなかった。
 *
 * 判定時間はテスト側に数値を複製せず、本番の一元管理された閾値
 * （`gestures/gesture-thresholds.LONG_PRESS_MS`）を直接参照する。閾値が変わったときに
 * 検証だけが古い前提で緑になることを避けるためである。
 *
 * Boundary: 道具の説明表示
 *
 * Requirements:
 * - 29.6: Where 初見で用途が分かりにくいツール項目がある, the Site Survey Service shall
 *         ツールバー項目のツールヒント（名称・短い説明）をマウスホバーまたは長押しで表示する
 *
 * @requirement site-survey/REQ-29.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';
import { TOOL_DEFINITIONS } from '../../../components/site-surveys/annotation-toolbar.constants';
import { LONG_PRESS_MS } from '../../../components/site-surveys/gestures/gesture-thresholds';

const defaultProps = {
  activeTool: 'select' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

/** 指を押し当ててから経過時間を進める */
function pressAndHold(element: HTMLElement, holdMs: number): void {
  fireEvent.pointerDown(element, { pointerId: 1, pointerType: 'touch' });
  act(() => {
    vi.advanceTimersByTime(holdMs);
  });
}

describe('AnnotationToolbar - 長押しのツールヒント (Task 115.104, Req 29.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('閾値に達するまでツールヒントは現れない', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const dimensionButton = screen.getByRole('button', { name: '寸法線' });

    pressAndHold(dimensionButton, LONG_PRESS_MS - 1);

    expect(screen.queryByRole('tooltip'), '閾値未満でツールヒントが出た').toBeNull();
  });

  it('閾値まで長押しするとツールヒントに名称と短い説明が出る', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const dimensionButton = screen.getByRole('button', { name: '寸法線' });

    pressAndHold(dimensionButton, LONG_PRESS_MS);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent, 'ツールヒントに名称が無い').toContain(
      TOOL_DEFINITIONS.dimension.label
    );
    expect(tooltip.textContent, 'ツールヒントに短い説明が無い').toContain(
      TOOL_DEFINITIONS.dimension.description
    );
  });

  it('長押しした項目のヒントが出る（別の項目の説明ではない）', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const freehandButton = screen.getByRole('button', { name: 'フリーハンド' });

    pressAndHold(freehandButton, LONG_PRESS_MS);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent, '長押しした項目の説明が出ていない').toContain(
      TOOL_DEFINITIONS.freehand.description
    );
    expect(tooltip.textContent, '別の項目の説明が混ざっている').not.toContain(
      TOOL_DEFINITIONS.dimension.description
    );
  });

  it('指を離すとツールヒントは消える', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const dimensionButton = screen.getByRole('button', { name: '寸法線' });

    pressAndHold(dimensionButton, LONG_PRESS_MS);
    expect(screen.queryByRole('tooltip'), '長押しでツールヒントが出ていない').not.toBeNull();

    fireEvent.pointerUp(dimensionButton, { pointerId: 1, pointerType: 'touch' });

    expect(screen.queryByRole('tooltip'), '指を離してもツールヒントが残っている').toBeNull();
  });

  it('閾値に達する前に指を離すとツールヒントは出ない', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const dimensionButton = screen.getByRole('button', { name: '寸法線' });

    fireEvent.pointerDown(dimensionButton, { pointerId: 1, pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 100);
    });
    fireEvent.pointerUp(dimensionButton, { pointerId: 1, pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });

    expect(screen.queryByRole('tooltip'), '短い押下でツールヒントが出た').toBeNull();
  });
});
