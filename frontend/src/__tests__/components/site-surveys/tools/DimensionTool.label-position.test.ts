/**
 * @fileoverview 寸法値ラベルの描画位置テスト（Task 115.152）
 *
 * Requirements:
 * - 6.3: When ユーザーが寸法値を入力する, the Site Survey Service shall
 *        寸法線上に数値とオプションの単位を表示する
 *
 * Task 115.104 は端点移動に伴う幾何の更新（`_updateGeometry`）について、
 * **パス空間の絶対座標をそのままグループの局所座標へ書き込む**欠陥を是正した。
 * しかし同じ形が `setDimensionWithLabel` と `updateLabelPosition` の 2 箇所に残っており、
 * 前者は要件6.3 の「寸法値の設定」として本番の編集画面から実際に呼ばれる経路にある
 * （`frontend/src/components/site-surveys/AnnotationEditor.tsx` の
 * `handleDimensionValueConfirm` が `target.setDimensionWithLabel(canvas, value, unit)`
 * を呼ぶ）。是正前は端点 (100,100)-(300,100) の寸法線で寸法値を確定すると、ラベルの
 * 局所座標が (0,0) から (200,100) へ跳び、線から大きく外れた位置に描かれていた。
 *
 * 本ファイルは **実物の Fabric.js** を用いる。既存の `DimensionTool.test.tsx` /
 * `DimensionTool.label-outline.test.ts` は `vi.mock('fabric')` で Group を素の入れ物へ
 * 差し替えており、「子が局所座標で並ぶ」という Group の性質そのものが再現されないため、
 * 座標空間の取り違えを構造的に検出できない（Task 115.104 の端点ドラッグ検証と同じ理由）。
 *
 * 主張は**画面上の位置**（シーン座標）で置く。利用者が見るのは描画されたラベルであり、
 * `_labelText.left` のような内部の局所座標そのものではないからである。ラベルは
 * 寸法線 Group の子として `getObjects()` から観測でき、`getCenterPoint()` が
 * グループ変形を掛けたシーン座標を返す。
 *
 * 本ファイルが押さえるのは「呼んだ結果ラベルがどこに描かれるか」であり、
 * 「本番の画面がその呼び出しへ到達するか」は
 * `AnnotationEditor.dimension-value-wiring.test.tsx`（Task 115.82）が押さえている。
 * 両者で要件6.3 の経路が端から端まで閉じる。
 *
 * Boundary: 寸法線のラベル位置の座標空間
 *
 * @requirement site-survey/REQ-6.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Point as FabricPoint, type Canvas, type FabricText, type Transform } from 'fabric';
import {
  DimensionLine,
  DIMENSION_ENDPOINT_CONTROL_KEYS,
} from '../../../../components/site-surveys/tools/DimensionTool';

// ============================================================================
// 文字寸法の計測環境
//
// jsdom は 2D コンテキストを持たないため、実物の Fabric に文字を測らせると
// `getContext('2d')` が null を返して `FabricText` の初期化が落ちる。ラベルの
// 「大きさ」は本ファイルの主張（中心がどこに載るか）に関わらないので、
// 決定的な幅を返す最小の計測器を与えて計測だけを成立させる。
// ============================================================================

const originalGetContext = HTMLCanvasElement.prototype.getContext;

/** 文字幅を「文字数 × フォントサイズ × 0.6」で決定的に返す最小の 2D コンテキスト */
function createMeasuringContext(): CanvasRenderingContext2D {
  const context = {
    font: '12px Arial',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save: () => {},
    restore: () => {},
    scale: () => {},
    setTransform: () => {},
    clearRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (text: string) => {
      const fontSize = Number.parseFloat(context.font) || 12;
      return { width: text.length * fontSize * 0.6 } as TextMetrics;
    },
  };
  return context as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function getContextStub(
    this: HTMLCanvasElement,
    contextId: string
  ) {
    return contextId === '2d' ? createMeasuringContext() : null;
  } as HTMLCanvasElement['getContext'];
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/** `setDimensionWithLabel` は描画フラッシュのためだけに Canvas を触るので最小の代替で足りる */
function stubCanvas(): Canvas {
  return { renderAll: () => {} } as unknown as Canvas;
}

/** 寸法線 Group の子から寸法値ラベル（FabricText）を取り出す */
function labelOf(dimension: DimensionLine): FabricText {
  const label = dimension.getObjects().find((child) => child.type === 'text');
  expect(label, '寸法線 Group にラベル（FabricText）の子が居ない').toBeDefined();
  return label as FabricText;
}

/** ラベルが実際に描かれるシーン座標（グループ変形適用済み） */
function labelScenePoint(dimension: DimensionLine): FabricPoint {
  return labelOf(dimension).getCenterPoint();
}

/**
 * ラベルが載るべき位置＝**描かれた線の中心**をシーン座標で求める。
 *
 * 期待値を `pathPointToScenePoint`（＝是正が用いる `_pathSpaceOrigin` と同じ変換）から
 * 組み立てると、主張が実装と同じ式の言い換えになり恒真へ退化する。そこで線を描いている
 * 子（本体 Path）自身の中心を独立の基準に取る。本ツールが生成するパスの頂点集合
 * （両端点とそれぞれのエンドキャップ端点）は端点の中点について点対称なので、
 * 本体 Path の外接矩形の中心は端点の中点と厳密に一致する。
 */
function expectedLabelScenePoint(dimension: DimensionLine): FabricPoint {
  const paths = dimension.getObjects().filter((child) => child.type === 'path');
  expect(paths, '寸法線 Group は縁取りと本体の 2 つの Path を子に持つ').toHaveLength(2);
  const bodyLine = paths[1]!;
  return bodyLine.getCenterPoint();
}

/** 端点の中点を `pathPointToScenePoint` 経由で求める（パス空間側からの独立確認用） */
function midpointViaPathSpace(dimension: DimensionLine): FabricPoint {
  const { start, end } = dimension.getEndpoints();
  return dimension.pathPointToScenePoint({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  });
}

/**
 * 本番の寸法値確定と同じ手順で寸法値を書き込む。
 *
 * `AnnotationEditor.handleDimensionValueConfirm`（Task 115.82 / Req 6.3）の
 * 呼び出し順をそのまま写している。
 */
function confirmDimensionValue(dimension: DimensionLine, value: string, unit: string): void {
  const trimmedValue = value.trim();
  const hasValue = trimmedValue !== '';
  dimension.setDimensionWithLabel(stubCanvas(), hasValue ? trimmedValue : '', hasValue ? unit : '');
  dimension.setCoords();
}

/** 端点ハンドルの `actionHandler` をシーン座標で駆動する（要件6.5 のドラッグ相当） */
function dragEndpoint(dimension: DimensionLine, key: string, x: number, y: number): void {
  const control = dimension.controls[key];
  expect(control, `端点ハンドル ${key} が寸法線に登録されていない`).toBeDefined();
  control!.actionHandler(
    new MouseEvent('mousemove') as unknown as PointerEvent,
    { target: dimension } as unknown as Transform,
    x,
    y
  );
}

/** シーン座標の一致を主張する */
function expectSamePoint(actual: FabricPoint, expected: FabricPoint, label: string): void {
  expect(actual.x, `${label}の x がずれている`).toBeCloseTo(expected.x, 6);
  expect(actual.y, `${label}の y がずれている`).toBeCloseTo(expected.y, 6);
}

describe('DimensionLine 寸法値ラベルの描画位置 (Task 115.152, Req 6.3)', () => {
  it('寸法値を確定するとラベルは寸法線の中点に描かれる', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    confirmDimensionValue(dimension, '1500', 'mm');

    expect(labelOf(dimension).text, 'ラベルへ数値と単位が書かれていない').toBe('1500 mm');
    expectSamePoint(labelScenePoint(dimension), expectedLabelScenePoint(dimension), 'ラベル位置');
    // 二つの基準（描かれた線の中心 / 端点の中点をパス空間から写した点）が
    // 同じ点を指すことも押さえ、片方の基準が壊れたときに気付けるようにする
    expectSamePoint(
      expectedLabelScenePoint(dimension),
      midpointViaPathSpace(dimension),
      '線の中心と端点の中点'
    );
  });

  it('寸法値の確定はラベルを寸法線から引き離さない', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    const before = labelScenePoint(dimension);

    // 生成時点でラベルは既に中点に載っている（コンストラクタは Group 構築前に
    // パス空間の値を渡し、Fabric の Group がそれを局所座標へ正規化するため）。
    // この前提が崩れると以下の「動かないこと」の主張が無意味になる。
    expectSamePoint(before, expectedLabelScenePoint(dimension), '生成直後のラベル位置');

    confirmDimensionValue(dimension, '1500', 'mm');

    // 端点が動いていない以上、ラベルが載る位置も動かないはずである。
    // 是正前は局所座標へ絶対座標が書き込まれ (0,0) → (200,100) へ跳んでいた。
    expectSamePoint(labelScenePoint(dimension), before, '寸法値確定後のラベル位置');
  });

  it('寸法値を確定しても端点の描画位置は動かない', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    const startBefore = dimension.pathPointToScenePoint(dimension.startPoint);
    const endBefore = dimension.pathPointToScenePoint(dimension.endPoint);

    confirmDimensionValue(dimension, '1500', 'mm');

    expectSamePoint(dimension.pathPointToScenePoint(dimension.startPoint), startBefore, '始点');
    expectSamePoint(dimension.pathPointToScenePoint(dimension.endPoint), endBefore, '終点');
  });

  it('斜めの寸法線でも確定後のラベルは中点に載る', () => {
    const dimension = new DimensionLine({ x: 40, y: 260 }, { x: 220, y: 80 });

    confirmDimensionValue(dimension, '2.5', 'm');

    expectSamePoint(
      labelScenePoint(dimension),
      expectedLabelScenePoint(dimension),
      '斜めの寸法線のラベル位置'
    );
  });

  it('寸法値を続けて確定し直してもラベルは中点に留まる', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    confirmDimensionValue(dimension, '1500', 'mm');
    confirmDimensionValue(dimension, '2000', 'cm');

    expect(labelOf(dimension).text, '確定し直した値がラベルへ反映されていない').toBe('2000 cm');
    expectSamePoint(
      labelScenePoint(dimension),
      expectedLabelScenePoint(dimension),
      '再確定後のラベル位置'
    );
  });

  it('端点をつまんで動かした後に寸法値を確定してもラベルは新しい中点に載る', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    dragEndpoint(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end, 300, 260);
    confirmDimensionValue(dimension, '1500', 'mm');

    expectSamePoint(
      labelScenePoint(dimension),
      expectedLabelScenePoint(dimension),
      '端点移動後に確定したラベル位置'
    );
  });

  it('ラベル位置の更新だけを呼んでもラベルは中点に留まる', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    confirmDimensionValue(dimension, '1500', 'mm');
    const before = labelScenePoint(dimension);

    dimension.updateLabelPosition();

    expectSamePoint(labelScenePoint(dimension), before, 'ラベル位置更新後のラベル位置');
    expectSamePoint(
      labelScenePoint(dimension),
      expectedLabelScenePoint(dimension),
      'ラベル位置更新後のラベル位置'
    );
  });

  it('ラベル位置の更新を繰り返してもラベルは動かない（冪等である）', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    confirmDimensionValue(dimension, '1500', 'mm');

    dimension.updateLabelPosition();
    const afterFirst = labelScenePoint(dimension);
    dimension.updateLabelPosition();
    dimension.updateLabelPosition();

    expectSamePoint(labelScenePoint(dimension), afterFirst, '再更新後のラベル位置');
  });
});
