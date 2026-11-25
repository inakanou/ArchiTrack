/**
 * @fileoverview 既存の注釈をキャンバス上のポインタ操作で選択・移動・拡大縮小・編集できることのテスト
 *
 * 既存の `AnnotationEditor.test.tsx` の「オブジェクト選択・操作機能」は Fabric.js を
 * `vi.mock('fabric')` で差し替えており、選択・移動・拡大縮小は「イベントの受け口が
 * 登録されていること」しか確かめていなかった。選択・移動・ハンドルでの拡大縮小・
 * ダブルクリックでの文字の編集は Fabric.js の Canvas が担い、本番のコードが担うのは
 * 「注釈の図形が Canvas の操作を受け付ける形で作られ・復元されること」である。
 * 本ファイルはそこを**実物の Fabric.js の Canvas** にポインタの事象を流して確かめる。
 *
 * 前提の置き方:
 * - jsdom は 2D の描画文脈を持たないため、`getContext('2d')` だけを描画しない代役へ
 *   差し替える。当たり判定・ハンドルの位置・変形は Fabric.js の幾何の計算で決まり、
 *   描画文脈には依らない。文字の幅は字数とフォントの大きさから決める。
 * - Canvas は本番（AnnotationEditor）と同じ設定で作る
 *   （`selection: false`・`enablePointerEvents: true`）。
 * - 注釈は本番の作成の関数で作り、保存した形（`toObject`）から本番の復元と同じ
 *   `util.enlivenObjects` で戻した「既存の注釈」を使う。選択ツールのときに本番が
 *   与える `selectable: true`・`evented: true` を同じく与える。
 *
 * Boundary: tools/RectangleTool・CircleTool・ArrowTool・DimensionTool・TextTool の作る注釈
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Canvas, util, type FabricObject } from 'fabric';
import '../../../components/site-surveys/tools/registerCustomShapes';
import { createRectangle } from '../../../components/site-surveys/tools/RectangleTool';
import { createCircle } from '../../../components/site-surveys/tools/CircleTool';
import { createArrow } from '../../../components/site-surveys/tools/ArrowTool';
import {
  createDimensionLine,
  DimensionLine,
  DIMENSION_ENDPOINT_CONTROL_KEYS,
} from '../../../components/site-surveys/tools/DimensionTool';
import {
  createTextAnnotation,
  TextAnnotation,
} from '../../../components/site-surveys/tools/TextTool';

// ============================================================================
// 描画しない 2D 文脈（当たり判定と変形の計算だけを Fabric.js 本体へ委ねる）
// ============================================================================

function createNonRenderingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = { canvas, font: '10px sans-serif' };
  const fontPx = () => {
    const matched = String(state.font).match(/(\d+(?:\.\d+)?)px/);
    return matched ? Number(matched[1]) : 10;
  };
  return new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      switch (property) {
        case 'measureText':
          return (text: string) => ({
            width: text.length * fontPx() * 0.6,
            actualBoundingBoxAscent: fontPx() * 0.8,
            actualBoundingBoxDescent: fontPx() * 0.2,
            fontBoundingBoxAscent: fontPx() * 0.8,
            fontBoundingBoxDescent: fontPx() * 0.2,
          });
        case 'getImageData':
          return (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
            width: w,
            height: h,
          });
        case 'getTransform':
          return () => new DOMMatrix();
        case 'getLineDash':
          return () => [];
        case 'createLinearGradient':
        case 'createRadialGradient':
        case 'createPattern':
          return () => ({ addColorStop() {} });
        default:
          return () => undefined;
      }
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

// ============================================================================
// ポインタの事象（画面上の位置で与え、Fabric.js が読む位置へ換算する）
// ============================================================================

interface Harness {
  canvas: Canvas;
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  pointerUp(x: number, y: number): void;
  /** 押して離す */
  click(x: number, y: number): void;
  /** 二度押して離し、ブラウザと同じく detail=2 の dblclick を送る */
  doubleClick(x: number, y: number): void;
  /** 押したまま動かして離す */
  drag(from: { x: number; y: number }, to: { x: number; y: number }): void;
}

function createHarness(): Harness {
  const element = document.createElement('canvas');
  document.body.appendChild(element);
  // 本番（AnnotationEditor）と同じ設定
  const canvas = new Canvas(element, {
    selection: false,
    renderOnAddRemove: true,
    width: 800,
    height: 600,
    enablePointerEvents: true,
  });

  // jsdom の要素は大きさを持たないため、clientX=0 が Canvas 上のどこへ写るかを先に測る
  const origin = canvas.getViewportPoint(
    new PointerEvent('pointermove', { clientX: 0, clientY: 0 })
  );
  const eventInit = (x: number, y: number) => ({
    clientX: x - origin.x,
    clientY: y - origin.y,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
  });
  const upper = canvas.upperCanvasEl;

  const harness: Harness = {
    canvas,
    pointerDown(x, y) {
      upper.dispatchEvent(new PointerEvent('pointerdown', eventInit(x, y)));
    },
    pointerMove(x, y) {
      upper.dispatchEvent(new PointerEvent('pointermove', eventInit(x, y)));
      document.dispatchEvent(new PointerEvent('pointermove', eventInit(x, y)));
    },
    pointerUp(x, y) {
      document.dispatchEvent(new PointerEvent('pointerup', eventInit(x, y)));
      upper.dispatchEvent(new PointerEvent('pointerup', eventInit(x, y)));
    },
    click(x, y) {
      harness.pointerMove(x, y);
      harness.pointerDown(x, y);
      harness.pointerUp(x, y);
    },
    doubleClick(x, y) {
      harness.click(x, y);
      harness.click(x, y);
      upper.dispatchEvent(new MouseEvent('dblclick', { ...eventInit(x, y), detail: 2 }));
    },
    drag(from, to) {
      harness.pointerMove(from.x, from.y);
      harness.pointerDown(from.x, from.y);
      const steps = 4;
      for (let i = 1; i <= steps; i += 1) {
        harness.pointerMove(
          from.x + ((to.x - from.x) * i) / steps,
          from.y + ((to.y - from.y) * i) / steps
        );
      }
      harness.pointerUp(to.x, to.y);
    },
  };
  return harness;
}

/** 保存した形から本番の復元と同じ経路で戻し、選択ツールのときの操作可否を与えて置く */
async function placeRestored<T extends FabricObject>(
  harness: Harness,
  created: T | null
): Promise<T> {
  expect(created, '本番の作成の関数が注釈を返さなかった').not.toBeNull();
  const [restored] = (await util.enlivenObjects([created!.toObject()])) as unknown as T[];
  expect(restored, '保存した形から注釈を復元できなかった').toBeDefined();
  restored!.set({ selectable: true, evented: true });
  harness.canvas.add(restored!);
  restored!.setCoords();
  return restored!;
}

function centerOf(object: FabricObject): { x: number; y: number } {
  const rect = object.getBoundingRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

let harness: Harness;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    return createNonRenderingContext(this);
  } as unknown as HTMLCanvasElement['getContext']);
  harness = createHarness();
});

afterEach(() => {
  harness.canvas.dispose();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const figureCases = [
  {
    name: '四角形',
    create: () => createRectangle({ x: 100, y: 100 }, { x: 220, y: 200 }),
  },
  {
    name: '円',
    create: () => createCircle({ x: 100, y: 100 }, { x: 220, y: 200 }),
  },
  {
    name: '矢印',
    create: () => createArrow({ x: 100, y: 100 }, { x: 260, y: 180 }),
  },
] as const;

describe('既存の注釈のキャンバス上の操作（実物の Fabric.js）', () => {
  /**
   * 選択中の図形を掴んで動かすと、動かした分だけ図形の位置が移る。
   * @requirement site-survey/REQ-7.8
   */
  describe('選択中の図形のドラッグによる移動', () => {
    it.each(figureCases)(
      '選択中の「$name」を掴んで動かすと、動かした分だけ位置が移る',
      async ({ create }) => {
        const figure = await placeRestored(harness, create());
        const start = centerOf(figure);

        harness.click(start.x, start.y);
        expect(harness.canvas.getActiveObject()).toBe(figure);

        const before = { left: figure.left, top: figure.top };
        harness.drag(start, { x: start.x + 60, y: start.y + 40 });

        expect(figure.left).toBeCloseTo(before.left + 60, 5);
        expect(figure.top).toBeCloseTo(before.top + 40, 5);
        expect(harness.canvas.getActiveObject()).toBe(figure);
      }
    );
  });

  /**
   * 選択中の図形の角のハンドルを動かすと大きさが変わり、反対側の角は動かない。
   * @requirement site-survey/REQ-7.9
   */
  describe('選択中の図形のハンドルのドラッグによる大きさの変更', () => {
    it.each(figureCases)(
      '選択中の「$name」の右下のハンドルを外へ動かすと大きくなり、左上の角は動かない',
      async ({ create }) => {
        const figure = await placeRestored(harness, create());
        const start = centerOf(figure);
        harness.click(start.x, start.y);
        expect(harness.canvas.getActiveObject()).toBe(figure);

        const before = figure.getBoundingRect();
        figure.setCoords();
        const handle = figure.oCoords.br;
        expect(handle, '右下のハンドルが無い').toBeDefined();

        harness.drag({ x: handle!.x, y: handle!.y }, { x: handle!.x + 50, y: handle!.y + 30 });

        const after = figure.getBoundingRect();
        expect(after.width).toBeGreaterThan(before.width + 20);
        expect(after.height).toBeGreaterThan(before.height + 10);
        expect(after.left).toBeCloseTo(before.left, 1);
        expect(after.top).toBeCloseTo(before.top, 1);
      }
    );

    it('ハンドルではなく図形の中を掴んだときは大きさを変えない（移動と取り違えない）', async () => {
      const figure = await placeRestored(harness, figureCases[0].create());
      const start = centerOf(figure);
      harness.click(start.x, start.y);
      const before = figure.getBoundingRect();

      harness.drag(start, { x: start.x + 50, y: start.y + 30 });

      const after = figure.getBoundingRect();
      expect(after.width).toBeCloseTo(before.width, 5);
      expect(after.height).toBeCloseTo(before.height, 5);
    });
  });

  /**
   * 既存の寸法線を押すと選択状態になり、端点のハンドルで編集できる。
   * @requirement site-survey/REQ-6.4
   */
  describe('既存の寸法線のクリックによる選択', () => {
    it('既存の寸法線を押すと選択状態になり、端点のハンドルが編集できる状態で出る', async () => {
      const dimension = await placeRestored<DimensionLine>(
        harness,
        createDimensionLine({ x: 100, y: 150 }, { x: 400, y: 150 })
      );
      expect(dimension).toBeInstanceOf(DimensionLine);
      expect(harness.canvas.getActiveObject()).toBeUndefined();

      const point = centerOf(dimension);
      harness.click(point.x, point.y);

      expect(harness.canvas.getActiveObject()).toBe(dimension);
      expect(dimension.isControlVisible(DIMENSION_ENDPOINT_CONTROL_KEYS.start)).toBe(true);
      expect(dimension.isControlVisible(DIMENSION_ENDPOINT_CONTROL_KEYS.end)).toBe(true);

      // 選択したまま終点のハンドルを動かすと、寸法線の形が変わる（編集できる）
      dimension.setCoords();
      const endHandle = dimension.oCoords[DIMENSION_ENDPOINT_CONTROL_KEYS.end];
      expect(endHandle, '終点のハンドルが無い').toBeDefined();
      const before = dimension.getBoundingRect();
      harness.drag(
        { x: endHandle!.x, y: endHandle!.y },
        { x: endHandle!.x, y: endHandle!.y + 120 }
      );

      expect(dimension.getBoundingRect().height).toBeGreaterThan(before.height + 60);
    });

    it('寸法線の外を押しても寸法線は選択されない', async () => {
      await placeRestored(harness, createDimensionLine({ x: 100, y: 150 }, { x: 400, y: 150 }));

      harness.click(600, 500);

      expect(harness.canvas.getActiveObject()).toBeUndefined();
    });
  });

  /**
   * 既存のテキストをダブルクリックすると編集モードになる。
   * @requirement site-survey/REQ-8.3
   */
  describe('既存のテキストのダブルクリックによる編集', () => {
    it('保存から戻した既存のテキストをダブルクリックすると編集モードになる', async () => {
      const text = await placeRestored<TextAnnotation>(
        harness,
        createTextAnnotation({ x: 150, y: 150 }, { initialText: '既存のコメント' })
      );
      expect(text).toBeInstanceOf(TextAnnotation);
      expect(text.isEditing).toBe(false);

      const point = centerOf(text);
      harness.doubleClick(point.x, point.y);

      expect(text.isEditing).toBe(true);
      expect(harness.canvas.getActiveObject()).toBe(text);
      text.exitEditing();
    });

    it('画面で置いたテキスト（本番と同じくダブルクリックの編集を設定したもの）もダブルクリックで編集モードになる', () => {
      const text = createTextAnnotation({ x: 150, y: 150 }, { initialText: 'テキスト' });
      text.set({ selectable: true, evented: true });
      harness.canvas.add(text);
      text.setupDoubleClickEditing(harness.canvas);
      text.setCoords();

      const point = centerOf(text);
      harness.doubleClick(point.x, point.y);

      expect(text.isEditing).toBe(true);
      text.exitEditing();
    });
  });

  /**
   * 既存のテキストを掴んで動かすと、動かした分だけ配置の位置が移る。
   * @requirement site-survey/REQ-8.4
   */
  describe('テキストのドラッグによる移動', () => {
    it('既存のテキストを掴んで動かすと、動かした分だけ配置の位置が移り、編集モードにはならない', async () => {
      const text = await placeRestored<TextAnnotation>(
        harness,
        createTextAnnotation({ x: 300, y: 300 }, { initialText: '移動するコメント' })
      );
      const start = centerOf(text);
      const before = { left: text.left, top: text.top };

      harness.drag(start, { x: start.x + 80, y: start.y - 50 });

      expect(text.left).toBeCloseTo(before.left + 80, 5);
      expect(text.top).toBeCloseTo(before.top - 50, 5);
      expect(text.isEditing).toBe(false);
    });
  });
});
