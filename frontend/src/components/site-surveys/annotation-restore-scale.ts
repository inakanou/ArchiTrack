/**
 * @fileoverview 保存済み注釈の復元時に、表示倍率の適用先を座標系ごとに揃えるための導出
 *
 * Task 115.73 (Req 32.2) — 注釈編集画面の復元処理
 * Task 115.110 (Req 32.2) — 書き出し・合成経路。同形の欠陥は資材の分かれている数だけ
 * 存在していた。
 *
 * 本モジュールへ適用先を揃えた箇所は、`frontend/src` を全域走査した結果 6 箇所である
 * （特定ファイル内の出現数ではない）。内訳は次のとおり。
 * - 復元処理 1: `AnnotationEditor.tsx` の共有ヘルパー `addRestoredAnnotationObjects`
 *   （サーバー保存済みの復元と下書きの復元の両方がこれを通る）
 * - 書き出し・合成 5: `services/export/AnnotationRendererService.ts` の `renderImage` /
 *   `renderImageForReport` / `renderImagesForReport`、`AnnotatedImageThumbnail.tsx` の
 *   クライアント合成、`pages/QuantityTableEditPage.tsx` の `renderAnnotatedImageToDataUrl`
 *   （数量表PDF出力。要件 32.8 が PDF を同列に挙げる対象）
 *
 * 走査コマンドと出力は design.md「Requirements 24-30」§File Structure Plan の
 * `AnnotationRendererService` 項に記録した。要旨は次の 2 本で、
 * - 適用先: `grep -rn "resolveRestoredStrokeWidth" frontend/src --include=*.ts --include=*.tsx | grep -v __tests__`
 * - 残存確認: `grep -rnE "strokeWidth[^;]*\*[^;]*(scaleX|scaleY|avgScale|averageScale|displayScale|zoom|Zoom|multiplier|Multiplier)" frontend/src --include=*.ts --include=*.tsx | grep -v __tests__`
 * 後者の出力が空であることを確認している。これは走査した範囲での結論であって
 * 「他に無いことの証明」ではないため、新たな書き出し経路を足す際は本モジュールを
 * 経由させ、後者の出力が空のままであることを確認すること。
 *
 * 保存済み注釈を実体化して載せる処理は、保存時と現在のキャンバス寸法が異なる場合に
 * 表示倍率を適用する。適用先は次の 2 系統に分かれ、混同すると同一オブジェクト内で
 * 座標系が食い違う。
 *
 * 1. 集合体（Group）として復元される注釈（矢印・寸法線・円・四角形・多角形・折れ線・
 *    フリーハンド）
 *    - 実際に描かれる線は集合体の子（`outline*` と `body*`）が保持する。
 *    - 集合体自身の `scaleX` / `scaleY` に表示倍率を掛けると、Fabric は子へ拡大率を伝搬する
 *      （design.md「Requirements 24-30: 画像注釈の視認性向上・モバイル操作性強化」§File Structure
 *      Plan の `AnnotationRendererService` 注記:
 *      「Fabric Group が子 Path に親の `scaleX/scaleY` を伝搬するため描画結果は正しい」）。
 *      したがって子の線幅は**保存時の値のまま**が正しく、倍率を掛けてはならない。
 *    - 一方、集合体自身が持つ `strokeWidth` は後方互換のために子から複写された値
 *      （各ツールの「本体線幅は Group 自体にもミラー設定」）であり、描画には使われない。
 *      ここへ倍率を掛けると、複写元（子の本体線）と複写先（集合体）が異なる座標系の値になる。
 *      複写された線幅は `toObject` で永続化され、既存 consumer の `shape.strokeWidth` 参照や
 *      白縁取り片側幅の算出（`resolveShapeOutlineWidth` / `resolveArrowOutlineWidth`）の
 *      基準にもなるため、実描画と食い違う値を残すと Req 32.2 が定める比率の基準が崩れる。
 *
 * 2. 自身の線で描かれる注釈（テキスト注釈の白アウトライン）
 *    - `strokeUniform: true` のため拡大率が線幅へ伝搬しない。表示倍率は `strokeWidth` へ
 *      直接掛ける必要があり、従来どおりの扱いを維持する。
 *
 * 本モジュールは 1 の系統について「複写された線幅を実描画から導出し直す」責務のみを持つ。
 * Fabric へは依存せず、集合体が公開する `getObjects()` の構造だけを見る。
 *
 * なお「集合体化した矢印では集合体本体に線幅が存在しないため対象外」という前提は事実に
 * 反する（Task 115.110 で訂正）。七形状（Arrow / Dimension / Circle / Rectangle /
 * Polygon / Polyline / Freehand）の構築処理はいずれも本体線幅を集合体自身へ複写している。
 * 複写を持たないのは、複写以前に保存されたレガシー構造だけである。
 */

/**
 * 集合体の子のうち本体線を保持する位置
 *
 * 7 形状（Arrow / Dimension / Circle / Rectangle / Polygon / Polyline / Freehand）はいずれも
 * `super([outline*, body*, ...])` の順で子を構築し、白縁取りを下、本体線を上に重ねる。
 * 寸法線はさらにラベル（3 番目の子）を持つが、本体線の位置は同じである。
 */
const BODY_CHILD_INDEX = 1;

/**
 * 集合体として復元された注釈の最小構造
 */
interface GroupLikeObject {
  getObjects?: () => readonly unknown[];
}

/**
 * 有限かつ正の線幅のみを採用する
 */
function toPositiveStrokeWidth(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * 集合体の中で実際に描かれている本体線の線幅を取得する（Task 115.73, Req 32.2）
 *
 * @param obj 復元された注釈オブジェクト
 * @returns 本体線の線幅。集合体でない場合や本体線が線幅を持たない場合は `undefined`
 */
export function deriveRenderedBodyStrokeWidth(obj: unknown): number | undefined {
  if (obj === null || typeof obj !== 'object') {
    return undefined;
  }

  const getObjects = (obj as GroupLikeObject).getObjects;
  if (typeof getObjects !== 'function') {
    return undefined;
  }

  const children = getObjects.call(obj);
  if (!Array.isArray(children) || children.length <= BODY_CHILD_INDEX) {
    return undefined;
  }

  const bodyChild = children[BODY_CHILD_INDEX];
  if (bodyChild === null || typeof bodyChild !== 'object') {
    return undefined;
  }

  return toPositiveStrokeWidth((bodyChild as { strokeWidth?: unknown }).strokeWidth);
}

/**
 * 復元後に保持すべき線幅を解決する（Task 115.73, Req 32.2）
 *
 * - 集合体（実描画を子が持つ）: 実描画の本体線幅を返す。表示倍率は集合体の `scaleX` / `scaleY`
 *   経由で子へ伝搬済みであり、複写された線幅へ重ねて掛けてはならない。
 * - それ以外（自身の線で描かれる注釈）: 従来どおり複写元の線幅へ平均倍率を掛けた値を返す。
 *
 * @param obj 復元された注釈オブジェクト
 * @param savedStrokeWidth 復元直後（倍率適用前）の線幅
 * @param averageScale 表示倍率の平均（`(scaleX + scaleY) / 2`）
 * @returns 復元後に設定すべき線幅
 */
export function resolveRestoredStrokeWidth(
  obj: unknown,
  savedStrokeWidth: number,
  averageScale: number
): number {
  return deriveRenderedBodyStrokeWidth(obj) ?? savedStrokeWidth * averageScale;
}
