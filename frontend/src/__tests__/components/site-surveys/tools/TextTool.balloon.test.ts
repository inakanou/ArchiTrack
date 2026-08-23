/**
 * @fileoverview テキスト注釈 吹き出し描画の構造テスト（Task 115.102）
 *
 * Requirements:
 * - 8.6: ユーザーが吹き出し形式を選択したとき、テキストを吹き出し形式で表示する
 *
 * 従来 `TextAnnotation` は吹き出し形式を内部状態として保持し、シリアライズにも
 * 載せていたが、描画に用いる箇所がどこにも無かった（`_render` の上書きが無く、
 * 形式を選んでも見た目は何も変わらなかった）。本テストは描画側の構造を固定する。
 *
 * 検証対象:
 * - 形式が 'none' のときは吹き出しを描かない（従来の見た目を保つ）
 * - 形式を選ぶと文字の外形＋余白の範囲へ塗りと枠線を描く
 * - 吹き出しは文字本体の描画より前に描かれる（文字が吹き出しに隠れない）
 * - 吹き出しがある間はオブジェクトキャッシュを使わない（外形の外が切り落とされるため）
 *
 * @requirement site-survey/REQ-8.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { renderCalls } = vi.hoisted(() => ({ renderCalls: [] as string[] }));

vi.mock('fabric', () => {
  class MockIText {
    text: string;
    left: number;
    top: number;
    width = 80;
    height = 20;
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    backgroundColor?: string;
    objectCaching = true;
    isEditing = false;

    constructor(text: string, options?: Record<string, unknown>) {
      this.text = text;
      this.left = (options?.left as number) || 0;
      this.top = (options?.top as number) || 0;
      if (options) {
        Object.assign(this, options);
      }
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as unknown as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
      }
      return this;
    }

    setCoords(): void {}

    getText(): string {
      return this.text;
    }

    on(): void {}

    _render(_ctx: unknown): void {
      renderCalls.push('text');
    }

    toObject(): Record<string, unknown> {
      return { type: 'textAnnotation' };
    }
  }

  class MockCanvas {
    selection = true;
  }

  return {
    IText: MockIText,
    Canvas: MockCanvas,
    classRegistry: { setClass: vi.fn() },
  };
});

import { createTextAnnotation } from '../../../../components/site-surveys/tools/TextTool';

/** `_renderBalloon` が呼ぶ 2D コンテキストの操作を記録する最小の代替 */
interface RecordedContext {
  ops: string[];
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fillStyleAtFill: string | null;
  strokeStyleAtStroke: string | null;
  points: Array<{ x: number; y: number }>;
}

function createRecordingContext(): RecordedContext & Record<string, unknown> {
  const ctx = {
    ops: [] as string[],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillStyleAtFill: null as string | null,
    strokeStyleAtStroke: null as string | null,
    points: [] as Array<{ x: number; y: number }>,
    save() {
      this.ops.push('save');
    },
    restore() {
      this.ops.push('restore');
    },
    beginPath() {
      this.ops.push('beginPath');
    },
    closePath() {
      this.ops.push('closePath');
    },
    rect(x: number, y: number, w: number, h: number) {
      this.ops.push('rect');
      this.points.push({ x, y }, { x: x + w, y: y + h });
    },
    moveTo(x: number, y: number) {
      this.ops.push('moveTo');
      this.points.push({ x, y });
    },
    lineTo(x: number, y: number) {
      this.ops.push('lineTo');
      this.points.push({ x, y });
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      this.ops.push('quadraticCurveTo');
      this.points.push({ x: cx, y: cy }, { x, y });
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      this.ops.push('ellipse');
      this.points.push({ x: x - rx, y: y - ry }, { x: x + rx, y: y + ry });
    },
    arc(x: number, y: number, r: number) {
      this.ops.push('arc');
      this.points.push({ x: x - r, y: y - r }, { x: x + r, y: y + r });
    },
    fill() {
      this.ops.push('fill');
      this.fillStyleAtFill = this.fillStyle;
      renderCalls.push('balloon-fill');
    },
    stroke() {
      this.ops.push('stroke');
      this.strokeStyleAtStroke = this.strokeStyle;
    },
  };
  return ctx as unknown as RecordedContext & Record<string, unknown>;
}

/** 文字の外形（幅 80 / 高さ 20）と既定余白 8 から求まる吹き出しの外形 */
const EXPECTED_BALLOON = {
  left: -(80 + 8 * 2) / 2,
  top: -(20 + 8 * 2) / 2,
  right: (80 + 8 * 2) / 2,
  bottom: (20 + 8 * 2) / 2,
};

describe('TextAnnotation - 吹き出しの描画 (Task 115.102, Req 8.6)', () => {
  beforeEach(() => {
    renderCalls.length = 0;
  });

  it('形式が「なし」のときは吹き出しを描かず、文字だけを描く', () => {
    const annotation = createTextAnnotation({ x: 100, y: 100 }, { balloonStyle: 'none' });
    const ctx = createRecordingContext();

    annotation._render(ctx as unknown as CanvasRenderingContext2D);

    expect(ctx.ops).toEqual([]);
    expect(renderCalls).toEqual(['text']);
  });

  it('形式を選ぶと、文字より前に吹き出しの塗りと枠線を描く', () => {
    const annotation = createTextAnnotation({ x: 100, y: 100 }, { balloonStyle: 'rounded' });
    const ctx = createRecordingContext();

    annotation._render(ctx as unknown as CanvasRenderingContext2D);

    // 吹き出し → 文字 の順で描かれる（文字が吹き出しに覆われない）
    expect(renderCalls).toEqual(['balloon-fill', 'text']);

    // 既定の吹き出し色（DEFAULT_BALLOON_OPTIONS）で塗り、枠線を引く
    expect(ctx.fillStyleAtFill).toBe('#ffffff');
    expect(ctx.strokeStyleAtStroke).toBe('#000000');
    expect(ctx.lineWidth).toBe(1);

    // 描画状態を保存・復元して文字の描画へ影響を残さない
    expect(ctx.ops[0]).toBe('save');
    expect(ctx.ops[ctx.ops.length - 1]).toBe('restore');
  });

  it('角丸の吹き出しは文字の外形へ余白を足した範囲に収まる', () => {
    const annotation = createTextAnnotation({ x: 0, y: 0 }, { balloonStyle: 'rounded' });
    const ctx = createRecordingContext();

    annotation._render(ctx as unknown as CanvasRenderingContext2D);

    const xs = ctx.points.map((p) => p.x);
    const ys = ctx.points.map((p) => p.y);

    expect(Math.min(...xs)).toBe(EXPECTED_BALLOON.left);
    expect(Math.max(...xs)).toBe(EXPECTED_BALLOON.right);
    expect(Math.min(...ys)).toBe(EXPECTED_BALLOON.top);
    expect(Math.max(...ys)).toBe(EXPECTED_BALLOON.bottom);
  });

  it('四角・楕円・雲のいずれの形式でも輪郭を組み立てて塗る', () => {
    const shapes: Array<{ style: 'rectangle' | 'ellipse' | 'cloud'; op: string }> = [
      { style: 'rectangle', op: 'rect' },
      { style: 'ellipse', op: 'ellipse' },
      { style: 'cloud', op: 'arc' },
    ];

    for (const shape of shapes) {
      const annotation = createTextAnnotation({ x: 0, y: 0 }, { balloonStyle: shape.style });
      const ctx = createRecordingContext();

      annotation._render(ctx as unknown as CanvasRenderingContext2D);

      expect(ctx.ops, `${shape.style} の輪郭が組み立てられていない`).toContain(shape.op);
      expect(ctx.fillStyleAtFill, `${shape.style} が塗られていない`).toBe('#ffffff');
    }
  });

  it('吹き出しがある間はオブジェクトキャッシュを使わない', () => {
    const withoutBalloon = createTextAnnotation({ x: 0, y: 0 }, { balloonStyle: 'none' });
    expect(withoutBalloon.objectCaching).toBe(true);

    const withBalloon = createTextAnnotation({ x: 0, y: 0 }, { balloonStyle: 'ellipse' });
    expect(withBalloon.objectCaching).toBe(false);

    // 形式の切替でも追随する
    withBalloon.setBalloonStyle('none');
    expect(withBalloon.objectCaching).toBe(true);

    withoutBalloon.setBalloonStyle('cloud');
    expect(withoutBalloon.objectCaching).toBe(false);
  });
});
