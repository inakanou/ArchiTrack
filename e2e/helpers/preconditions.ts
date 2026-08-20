/**
 * @fileoverview 前提が崩れた地点で必ず失敗させるための共通の主張
 *
 * ## 背景（Task 115.127 段0）
 *
 * E2E 全体に、前提が用意できなかった場合に検証を丸ごと消す書き方が広がっていた。
 *
 * 形は二つある。条件式を渡す形（`test.skip(!testProjectId, '理由')`）と、
 * 条件分岐の内側で引数なしの `test.skip` を呼ぶ形である。
 * どちらも効果は同じで、前提の生成が壊れると以降の検証が緑でも赤でもなく消える。
 * AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に直接抵触する。
 *
 * 本補助は「前提が用意できていなければその場で失敗する」だけの型ガードである。
 * `asserts value is NonNullable<T>` を返すため、呼び出し以降は `!` を付けずに扱える。
 * 型を絞るためだけの `if` を置く必要も無くなる（それ自体が検出対象の構造であるため）。
 *
 * @module e2e/helpers/preconditions
 */

/**
 * 前提として用意されているはずの値を主張する。偽であればその場で失敗する。
 *
 * 空文字・0・false も「用意されていない」として扱う。ID・名称・件数のいずれも
 * 空や 0 のまま後段へ進めば、失敗は前提の崩れた地点ではなく後段の操作に現れるためである。
 *
 * @param value 前提として用意されているはずの値
 * @param label 失敗メッセージに用いる前提の名前（例: `'事前準備で作成した数量表ID'`）
 * @throws 値が偽である場合
 */
export function assertPrepared<T>(value: T, label: string): asserts value is NonNullable<T> {
  if (!value) {
    throw new Error(
      `前提が用意されていない: ${label}（前提を用意する処理が失敗している。` +
        `前提が崩れたまま後段へ進めないため、ここで失敗させる）`
    );
  }
}

/**
 * 直前に取得した値が存在することを主張する。null / undefined であればその場で失敗する。
 *
 * ## `assertPrepared` との住み分け（Task 115.127 段3）
 *
 * `assertPrepared` は「前提が用意されているか」を見るため、空文字・0・false も
 * 用意されていないものとして扱う。本補助は「取得できたか」を見るため、
 * **null / undefined だけ**を失敗とする。`boundingBox()` の幅・高さ・座標のように
 * 0 が正当な観測値になり得る対象を扱うためである
 * （0 を偽として弾くと「幅が 0 である」という欠陥を前提の崩れとして報告してしまう）。
 *
 * ## なぜ `if` ではなく本補助か
 *
 * 次の形は、直前の主張があるため沈黙はしないが、`if` は型を絞るためだけに存在する。
 *
 * ```ts
 * const box = await locator.boundingBox();
 * expect(box).not.toBeNull();
 * if (box) {
 *   expect(box.width).toBeGreaterThan(0);
 * }
 * ```
 *
 * この形は「条件分岐で検証本体を包む」構造そのものであり、直前の主張を取り除いた
 * 途端に沈黙する関門へ変わる。主張と絞り込みを一つの呼び出しへ畳めば、
 * 取り違えようが無くなる。`asserts value is NonNullable<T>` を返すため、
 * 呼び出し以降は `!` も `if` も要らない。
 *
 * @param value 直前に取得した値
 * @param label 失敗メッセージに用いる対象の名前（例: `'プレビュー画像の境界ボックス'`）
 * @throws 値が null または undefined である場合
 */
export function assertPresent<T>(value: T, label: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(
      `取得できているはずの値が無い: ${label}（値が null / undefined のままである。` +
        `後段の検証は成立しないため、ここで失敗させる）`
    );
  }
}
