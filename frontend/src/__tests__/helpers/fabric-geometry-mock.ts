/**
 * @fileoverview 寸法線ツール単体テスト用の最小 Fabric 幾何モック
 *
 * Task 115.104 (Req 6.5): `DimensionLine._updateGeometry` は端点操作を本番へ結線する
 * にあたり、Group の外接矩形と子のローカル座標を再計算するようになった。従来の
 * `vi.mock('fabric')` は `Path` を「パス文字列を持つだけの入れ物」として模していたため、
 * 再計算に必要な `pathOffset` / `getRelativeCenterPoint` / `calcACoords` を持たず、
 * 本番コードを走らせること自体ができなかった。
 *
 * 本モジュールは、その再計算が依存する範囲だけを**実際に計算して**提供する。
 * 値を決め打ちで返す張りぼてにすると、モック側の都合で常に緑になるテストへ退化するため、
 * パス文字列から外接矩形を求め、原点変換も行列で行う。
 *
 * 対象は `DimensionTool` の単体テストのみであり、本番コードからは参照しない。
 */

/** 2 次元の点（Fabric `Point` の代替） */
export interface MockPointLike {
  x: number;
  y: number;
}

/** アフィン変換行列（Fabric `TMat2D` の代替） */
export type MockMatrix = [number, number, number, number, number, number];

/**
 * Fabric `Point` の代替。本番コードが用いる演算だけを備える。
 */
export class MockPoint implements MockPointLike {
  constructor(
    public x: number,
    public y: number
  ) {}

  add(other: MockPointLike): MockPoint {
    return new MockPoint(this.x + other.x, this.y + other.y);
  }

  subtract(other: MockPointLike): MockPoint {
    return new MockPoint(this.x - other.x, this.y - other.y);
  }

  transform(matrix: MockMatrix, ignoreOffset = false): MockPoint {
    const [a, b, c, d, e, f] = matrix;
    return new MockPoint(
      a * this.x + c * this.y + (ignoreOffset ? 0 : e),
      b * this.x + d * this.y + (ignoreOffset ? 0 : f)
    );
  }
}

/** 外接矩形 */
export interface MockBBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Fabric `util` の代替（本番コードが用いる 2 関数のみ）
 */
export const mockFabricUtil = {
  makeBoundingBoxFromPoints(points: MockPointLike[]): MockBBox {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  },

  invertTransform(matrix: MockMatrix): MockMatrix {
    const [a, b, c, d, e, f] = matrix;
    const det = a * d - b * c;
    const ia = d / det;
    const ib = -b / det;
    const ic = -c / det;
    const id = a / det;
    return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
  },
};

/**
 * `"M x y L x y ..."` 形式のパス文字列から外接矩形を求める。
 *
 * 本ツールが生成するパスは直線のみ（M / L）であり、コマンド文字の後に必ず x, y が
 * 並ぶため、数値列を順に組にすれば頂点が得られる。
 */
export function boundsFromPathData(pathData: string): MockBBox {
  const numbers = (pathData.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
  if (numbers.length < 2) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    xs.push(numbers[i] as number);
    ys.push(numbers[i + 1] as number);
  }
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** 幾何計算の対象となるモックオブジェクトが備える最小の形 */
export interface MockGeometryHost {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  strokeWidth?: number;
  originX?: string;
  originY?: string;
  pathOffset?: MockPoint;
}

/**
 * 原点指定（`originX` / `originY`）を踏まえた中心座標を求める。
 */
export function relativeCenterOf(target: MockGeometryHost): MockPoint {
  const left = target.left ?? 0;
  const top = target.top ?? 0;
  const width = target.width ?? 0;
  const height = target.height ?? 0;
  const x = target.originX === 'center' ? left : left + width / 2;
  const y = target.originY === 'center' ? top : top + height / 2;
  return new MockPoint(x, y);
}

/**
 * 線幅を含めた四隅座標（親座標系）を求める。
 */
export function acoordsOf(target: MockGeometryHost): {
  tl: MockPoint;
  tr: MockPoint;
  br: MockPoint;
  bl: MockPoint;
} {
  const center = relativeCenterOf(target);
  const strokeWidth = target.strokeWidth ?? 0;
  const halfW = ((target.width ?? 0) + strokeWidth) / 2;
  const halfH = ((target.height ?? 0) + strokeWidth) / 2;
  return {
    tl: new MockPoint(center.x - halfW, center.y - halfH),
    tr: new MockPoint(center.x + halfW, center.y - halfH),
    br: new MockPoint(center.x + halfW, center.y + halfH),
    bl: new MockPoint(center.x - halfW, center.y + halfH),
  };
}

/**
 * パス文字列から `width` / `height` / `pathOffset` を再計算し、
 * `adjustPosition` 指定時は中心が `pathOffset` に一致するよう `left` / `top` を置く。
 *
 * Fabric `Path#setBoundingBox` と同じ約束である。
 */
export function applyPathBounds(
  target: MockGeometryHost,
  pathData: string,
  adjustPosition?: boolean
): void {
  const bbox = boundsFromPathData(pathData);
  target.width = bbox.width;
  target.height = bbox.height;
  target.pathOffset = new MockPoint(bbox.left + bbox.width / 2, bbox.top + bbox.height / 2);
  if (adjustPosition) {
    target.left = target.pathOffset.x - bbox.width / 2;
    target.top = target.pathOffset.y - bbox.height / 2;
  }
}

/**
 * Fabric `Group` 生成時のレイアウトを再現する。
 *
 * 子の外接矩形をグループの位置・大きさとし、子をグループ中心基準のローカル座標へ移す。
 */
export function layoutGroupChildren(group: MockGeometryHost, children: MockGeometryHost[]): void {
  const points: MockPoint[] = [];
  for (const child of children) {
    const { tl, tr, br, bl } = acoordsOf(child);
    points.push(tl, tr, br, bl);
  }
  if (points.length === 0) {
    return;
  }
  const bbox = mockFabricUtil.makeBoundingBoxFromPoints(points);
  group.left = bbox.left;
  group.top = bbox.top;
  group.width = bbox.width;
  group.height = bbox.height;
  const centerX = bbox.left + bbox.width / 2;
  const centerY = bbox.top + bbox.height / 2;
  for (const child of children) {
    child.left = (child.left ?? 0) - centerX;
    child.top = (child.top ?? 0) - centerY;
  }
}
