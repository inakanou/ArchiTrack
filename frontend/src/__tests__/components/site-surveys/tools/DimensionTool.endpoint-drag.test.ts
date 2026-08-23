/**
 * @fileoverview 寸法線の端点ドラッグ（端点ハンドル）テスト
 *
 * Task 115.104 (Req 6.5): 寸法線の端点をつまんで動かす手段を本番へ結線する。
 *
 * Requirements:
 * - 6.5: ユーザーが寸法線の端点をドラッグすると寸法線の位置を調整する
 *
 * 本ファイルは **実物の Fabric.js** を用いる。既存の `DimensionTool.test.tsx` /
 * `DimensionTool.outline.test.ts` は `vi.mock('fabric')` で Fabric を差し替えており、
 * 「端点を更新する手段があること」は確かめられても「更新した結果が Fabric の
 * オブジェクトとして正しい形になること」は一度も通っていなかった。実際、Task 82.1 で
 * `Path` 継承から `Group` 継承へ移った際に `_updateGeometry` の Group 対応が漏れており、
 * 端点を動かしても外接矩形・当たり判定・ハンドル位置が生成時のまま固まっていた。
 * 結線に先立ってその契約をここで固定する。
 *
 * 主張はいずれも**画面上の位置**（`pathPointToScenePoint`）を基準に置く。`_startPoint` /
 * `_endPoint` はパス空間の値であり、Group 自身に後方互換のため写している `strokeWidth` の
 * 分だけ描画位置と定数のずれを持つ。利用者が触るのは描画された端点なので、
 * 「落とした場所へ端点が来たか」「触っていない側が動いていないか」を画面座標で見る。
 *
 * @requirement site-survey/REQ-6.5
 */

import { describe, it, expect } from 'vitest';
import { Point as FabricPoint, type Transform } from 'fabric';
import {
  DimensionLine,
  DIMENSION_ENDPOINT_CONTROL_KEYS,
} from '../../../../components/site-surveys/tools/DimensionTool';

/** 端点ハンドルの `actionHandler` をシーン座標で駆動する（ドラッグ相当） */
function dragEndpoint(dimension: DimensionLine, key: string, x: number, y: number): boolean {
  const control = dimension.controls[key];
  expect(control, `端点ハンドル ${key} が寸法線に登録されていない`).toBeDefined();
  const transform = { target: dimension } as unknown as Transform;
  return control!.actionHandler(
    new MouseEvent('mousemove') as unknown as PointerEvent,
    transform,
    x,
    y
  );
}

/** 端点ハンドルが描かれる位置（ビューポート座標） */
function handlePosition(dimension: DimensionLine, key: string): FabricPoint {
  const control = dimension.controls[key];
  expect(control, `端点ハンドル ${key} が寸法線に登録されていない`).toBeDefined();
  return control!.positionHandler(
    new FabricPoint(dimension.width, dimension.height),
    dimension.calcTransformMatrix(),
    dimension,
    control!
  );
}

describe('DimensionLine 端点ハンドル (Task 115.104, Req 6.5)', () => {
  it('始点・終点それぞれの端点ハンドルが登録されている', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    expect(
      dimension.controls[DIMENSION_ENDPOINT_CONTROL_KEYS.start],
      '始点の端点ハンドルが無い'
    ).toBeDefined();
    expect(
      dimension.controls[DIMENSION_ENDPOINT_CONTROL_KEYS.end],
      '終点の端点ハンドルが無い'
    ).toBeDefined();
  });

  it('端点ハンドルは端点が描かれる位置に置かれる', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    // ビューポート変換は等倍（canvas 未接続時は単位行列）なので、シーン座標がそのまま出る
    const startHandle = handlePosition(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.start);
    const endHandle = handlePosition(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end);
    const startScene = dimension.pathPointToScenePoint(dimension.startPoint);
    const endScene = dimension.pathPointToScenePoint(dimension.endPoint);

    expect(startHandle.x, '始点ハンドルの x が始点の描画位置と一致しない').toBeCloseTo(
      startScene.x,
      6
    );
    expect(startHandle.y, '始点ハンドルの y が始点の描画位置と一致しない').toBeCloseTo(
      startScene.y,
      6
    );
    expect(endHandle.x, '終点ハンドルの x が終点の描画位置と一致しない').toBeCloseTo(endScene.x, 6);
    expect(endHandle.y, '終点ハンドルの y が終点の描画位置と一致しない').toBeCloseTo(endScene.y, 6);

    // 2 つのハンドルは端点間距離（200px）だけ離れている＝両端に別々に置かれている
    expect(endHandle.x - startHandle.x, '2 つの端点ハンドルが同じ場所に重なっている').toBeCloseTo(
      200,
      6
    );
  });

  it('終点ハンドルをドラッグすると終点だけが落とした場所へ移り、始点は動かない', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    const startBefore = dimension.pathPointToScenePoint(dimension.startPoint);

    const modified = dragEndpoint(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end, 300, 400);
    expect(modified, '端点ドラッグが「変更あり」を返していない').toBe(true);

    const endAfter = dimension.pathPointToScenePoint(dimension.endPoint);
    const startAfter = dimension.pathPointToScenePoint(dimension.startPoint);

    expect(endAfter.x, '終点の描画位置 x が落とした場所に無い').toBeCloseTo(300, 6);
    expect(endAfter.y, '終点の描画位置 y が落とした場所に無い').toBeCloseTo(400, 6);
    expect(startAfter.x, '始点の描画位置 x が動いた').toBeCloseTo(startBefore.x, 6);
    expect(startAfter.y, '始点の描画位置 y が動いた').toBeCloseTo(startBefore.y, 6);

    // ハンドルも移動後の端点へ追随する（掴み直せる）
    const endHandle = handlePosition(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end);
    expect(endHandle.x, '終点ハンドルが移動後の終点へ追随していない').toBeCloseTo(300, 6);
    expect(endHandle.y, '終点ハンドルが移動後の終点へ追随していない').toBeCloseTo(400, 6);
  });

  it('始点ハンドルをドラッグすると始点だけが落とした場所へ移り、終点は動かない', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    const endBefore = dimension.pathPointToScenePoint(dimension.endPoint);

    dragEndpoint(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.start, 40, 260);

    const startAfter = dimension.pathPointToScenePoint(dimension.startPoint);
    const endAfter = dimension.pathPointToScenePoint(dimension.endPoint);
    expect(startAfter.x, '始点の描画位置 x が落とした場所に無い').toBeCloseTo(40, 6);
    expect(startAfter.y, '始点の描画位置 y が落とした場所に無い').toBeCloseTo(260, 6);
    expect(endAfter.x, '終点の描画位置 x が動いた').toBeCloseTo(endBefore.x, 6);
    expect(endAfter.y, '終点の描画位置 y が動いた').toBeCloseTo(endBefore.y, 6);
  });

  it('端点を動かすとグループの外接矩形が新しい形へ追随する', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });

    // 変更前は水平線なので、幅は 200 以上・高さはキャップ + 線幅程度に収まっている
    const widthBefore = dimension.width;
    const heightBefore = dimension.height;
    expect(widthBefore, '生成直後の幅が端点間距離を下回っている').toBeGreaterThanOrEqual(200);
    expect(heightBefore, '生成直後の高さが想定より大きい').toBeLessThan(60);

    dragEndpoint(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end, 300, 400);

    // 縦に 300 伸ばしたので高さがそれを含む大きさへ広がる
    expect(dimension.height, '高さが変更前のまま固まっている').toBeGreaterThan(heightBefore);

    // 外接矩形が移動後の 2 端点を包み、かつ余白がエンドキャップ・縁取り分に収まっている
    // （＝生成時の形のまま固まっていない）。線幅の写し込み分のずれを許容幅に含める。
    const startScene = dimension.pathPointToScenePoint(dimension.startPoint);
    const endScene = dimension.pathPointToScenePoint(dimension.endPoint);
    const minX = Math.min(startScene.x, endScene.x);
    const maxX = Math.max(startScene.x, endScene.x);
    const minY = Math.min(startScene.y, endScene.y);
    const maxY = Math.max(startScene.y, endScene.y);
    const slack = 40;

    expect(dimension.left, '外接矩形の左端が端点より右にある').toBeLessThanOrEqual(minX);
    expect(dimension.top, '外接矩形の上端が端点より下にある').toBeLessThanOrEqual(minY);
    expect(
      dimension.left + dimension.width,
      '外接矩形の右端が端点に届いていない'
    ).toBeGreaterThanOrEqual(maxX);
    expect(
      dimension.top + dimension.height,
      '外接矩形の下端が端点に届いていない'
    ).toBeGreaterThanOrEqual(maxY);
    expect(dimension.width, '外接矩形の幅が端点の広がりから乖離している').toBeLessThan(
      maxX - minX + slack
    );
    expect(dimension.height, '外接矩形の高さが端点の広がりから乖離している').toBeLessThan(
      maxY - minY + slack
    );
  });

  it('端点ドラッグ後の寸法線を保存すると、動かした端点が保存内容に含まれる', () => {
    const dimension = new DimensionLine({ x: 100, y: 100 }, { x: 300, y: 100 });
    const startPathBefore = { ...dimension.startPoint };
    const endPathBefore = { ...dimension.endPoint };
    const endSceneBefore = dimension.pathPointToScenePoint(dimension.endPoint);

    dragEndpoint(dimension, DIMENSION_ENDPOINT_CONTROL_KEYS.end, 250, 320);

    // 画面上での移動量と同じだけ、保存されるパス空間の終点も動く
    const expectedEndX = endPathBefore.x + (250 - endSceneBefore.x);
    const expectedEndY = endPathBefore.y + (320 - endSceneBefore.y);

    const serialized = dimension.toObject();
    expect(serialized.endPoint.x, '保存内容の終点 x が動かした量を反映していない').toBeCloseTo(
      expectedEndX,
      6
    );
    expect(serialized.endPoint.y, '保存内容の終点 y が動かした量を反映していない').toBeCloseTo(
      expectedEndY,
      6
    );
    expect(serialized.startPoint.x, '保存内容の始点 x が動いた').toBeCloseTo(startPathBefore.x, 6);
    expect(serialized.startPoint.y, '保存内容の始点 y が動いた').toBeCloseTo(startPathBefore.y, 6);
  });
});
