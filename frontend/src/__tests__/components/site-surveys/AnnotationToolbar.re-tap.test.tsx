/**
 * @fileoverview AnnotationToolbar 選択中ツール再タップ検知テスト
 *
 * Task 70.2: `onActiveToolReTap` コールバックの追加（TDD: RED フェーズ）
 *
 * Requirements:
 * - 28.8: 選択中ツールを再タップした際に詳細属性パネル（StylePanel）の
 *   表示/非表示をトグルする（親側が受けとって StylePanel の開閉を切替える）
 *
 * テスト対象:
 * - 新規 prop `onActiveToolReTap?: () => void` が存在し、
 *   activeTool と同じツールボタンをクリックした時のみ発火する
 * - 非アクティブなツールボタンをクリックした場合は発火しない
 * - prop 未指定時も既存動作（onToolChange）が壊れないこと
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

const defaultProps = {
  activeTool: 'arrow' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

describe('AnnotationToolbar - onActiveToolReTap (Task 70.2, Req 28.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('activeTool と同じツールを再タップすると onActiveToolReTap が 1 回発火する', async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    const onActiveToolReTap = vi.fn();

    render(
      <AnnotationToolbar
        {...defaultProps}
        activeTool="arrow"
        onToolChange={onToolChange}
        onActiveToolReTap={onActiveToolReTap}
      />
    );

    const arrowButton = screen.getByRole('button', { name: /矢印/i });
    await user.click(arrowButton);

    expect(onActiveToolReTap).toHaveBeenCalledTimes(1);
  });

  it('非アクティブなツールをクリックした場合 onActiveToolReTap は発火しない', async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();
    const onActiveToolReTap = vi.fn();

    render(
      <AnnotationToolbar
        {...defaultProps}
        activeTool="arrow"
        onToolChange={onToolChange}
        onActiveToolReTap={onActiveToolReTap}
      />
    );

    const textButton = screen.getByRole('button', { name: /テキスト/i });
    await user.click(textButton);

    expect(onActiveToolReTap).not.toHaveBeenCalled();
    // 既存の onToolChange 動作は維持される
    expect(onToolChange).toHaveBeenCalledWith('text');
  });

  it('onActiveToolReTap 未指定でも、既存の onToolChange 再タップ動作は維持される (後方互換)', async () => {
    const user = userEvent.setup();
    const onToolChange = vi.fn();

    render(<AnnotationToolbar {...defaultProps} activeTool="select" onToolChange={onToolChange} />);

    const selectButton = screen.getByRole('button', { name: /選択/i });
    await user.click(selectButton);

    // 既存仕様: 再タップでも onToolChange は従来どおり発火する
    expect(onToolChange).toHaveBeenCalledWith('select');
  });

  it('disabled=true の場合 onActiveToolReTap は発火しない', async () => {
    const user = userEvent.setup();
    const onActiveToolReTap = vi.fn();

    render(
      <AnnotationToolbar
        {...defaultProps}
        activeTool="arrow"
        disabled={true}
        onActiveToolReTap={onActiveToolReTap}
      />
    );

    const arrowButton = screen.getByRole('button', { name: /矢印/i });
    await user.click(arrowButton);

    expect(onActiveToolReTap).not.toHaveBeenCalled();
  });
});
