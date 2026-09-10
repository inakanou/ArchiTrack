/**
 * @fileoverview 数値範囲バリデーションユーティリティ
 *
 * **本モジュールが数量表の数値欄の範囲の正典である。** 範囲の定数を他所へ書き写さず、
 * `FIELD_RANGE_CONFIG` を参照すること。範囲を変えるときも本ファイルだけを触ること。
 *
 * 本モジュールを取り込むと箇所数の上下限を通じて `calculation-engine` も読み込まれる。
 * 同モジュールを `vi.mock` する検証は `importOriginal` による部分モックにすること
 * （全置換にすると `COUNT_MIN` / `COUNT_MAX` が欠けて読み込みに失敗する）。
 *
 * Requirements:
 * - 9.3: 調整係数は-9.99〜9.99の範囲で入力可能とする
 * - 10.3: 丸め設定は0.01〜99.99の範囲で入力可能とする
 * - 15.1: 数量は-999999.99〜9999999.99の範囲で入力可能とする
 * - 15.3: 寸法・ピッチ計算フィールドは0.01〜9999999.99の範囲で入力可能とする
 * - 15.4: 箇所数は1〜9999999の範囲で入力可能とする（Requirement 47）
 * - 15.5: 箇所数に小数を含む値が入力された場合は入力を拒否する（Requirement 47）
 * - 47.8: 箇所数フィールドを必須項目とし、入力可能範囲を1〜9999999の整数とする
 * - 47.10: 箇所数フィールドに小数を含む値が入力された場合は入力を拒否する
 * - 47.11: 箇所数フィールドに範囲外の値が入力された場合はエラーメッセージを表示する
 *
 * Task 12.4: 数値フィールドの入力制御と範囲チェックを実装する
 * Task 66.1: 数値範囲バリデーションに整数制約を追加する
 * Task 80.1: 範囲の正典を確定させ、定数の二系統を解消する
 *
 * @module utils/numeric-range-validation
 */

import { COUNT_MIN, COUNT_MAX } from './calculation-engine';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 数値範囲チェック対象のフィールドタイプ
 */
export type NumericRangeFieldType =
  | 'adjustmentFactor'
  | 'roundingUnit'
  | 'quantity'
  | 'dimension'
  | 'count';

/**
 * 範囲設定
 */
export interface RangeConfig {
  /** 最小値 */
  min: number;
  /** 最大値 */
  max: number;
  /** フィールド名（日本語） */
  label: string;
  /**
   * 整数のみを許容するか（REQ-47 AC8/AC10）
   *
   * 未指定または false の場合は小数を許容する（既存フィールドの挙動を維持）。
   */
  integer?: boolean;
}

/**
 * 数値範囲検証結果
 */
export interface NumericRangeValidationResult {
  /** 検証結果 */
  isValid: boolean;
  /** エラーメッセージ */
  error?: string;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * フィールド別の範囲設定（数量表の数値欄の範囲の正典）
 *
 * ## 丸め設定の範囲を `0.01〜99.99` と定めた根拠（Task 80.1）
 *
 * **下限を `0.01` とし、条文の側を改めた。** REQ-10.3 は改訂前 `-99.99〜99.99` と
 * 書いており、2026-09-10 に `0.01〜99.99` へ改めた（requirements.md の Requirement 10
 * の直後に改訂の記録がある）。実装を改訂前の条文へ合わせなかったのは、
 * 条文どうしが内部で食い違っているためである。
 *
 * - REQ-10.2 は丸め設定を「切り上げ**単位**」と定める。負の単位で切り上げるとは
 *   何かを、条文はどこにも定めていない
 * - REQ-10.4 は `0` に「未設定（＝既定値 0.01 を入れる）」という別の意味を与えている。
 *   したがって `0` は有効な入力値ではない
 * - `applyRounding()`（`utils/calculation-engine.ts`）は `unit <= 0` で例外を投げる。
 *   下限を負へ広げると、**範囲判定を通った値が計算の時点で落ちる**。
 *   下限 `0.01` は「範囲判定を通れば必ず計算できる」ことの担保である
 * - 小数2桁表示（REQ-10.7）の下で `0` より大きい最小値はちょうど `0.01` であり、
 *   これは REQ-10.1 / REQ-10.4 が定める既定値と一致する
 *
 * *採らなかった案*: 実装を `-99.99` へ広げて条文に合わせる。負の切り上げ単位の意味を
 * 定める条文が無く、`[-99.99, 0]` は REQ-10.4 と `applyRounding()` の双方が拒む領域で
 * あるため、「範囲内なのに保存も計算もできない値」を作るだけになる。採らなかった。
 *
 * ## 値 `0` は範囲判定の層に属さない（Task 80.1）
 *
 * **本関数が丸め設定の `0` を範囲外と返すのは意図である。** `0` は REQ-10.4 が
 * 「未設定」の意味を与えた番兵であって入力値ではなく、**REQ-10.4 が REQ-10.3 に優先する**。
 * 呼び出し側が既定値 `0.01` への差し替えを先に行い、本関数へは差し替えた後の値を渡す責を負う。
 * 差し替え後の値は範囲の下限そのものなので、差し替えを先に行えば範囲判定は必ず通る。
 *
 * 描画される実装は既にこの順序で動いている——`components/quantity-table/CalculationFields.tsx`
 * の `AdjustmentField` は焦点喪失の時点で `0` を既定値へ差し替える。結線（Task 80.2）は
 * 範囲判定をその差し替えの**後**に置くこと。前に置くと REQ-10.4 が破れる。
 *
 * *採らなかった案*: 範囲判定を先に適用して `0` をエラーにする。REQ-10.4 が到達しない条文になり、
 * `e2e/specs/quantity-tables/field-specification.spec.ts` の
 * `10.4: 丸め設定が0の時は0.01が自動設定される`（現に緑）とも食い違う。採らなかった。
 *
 * **上限は `99.99` とした。** REQ-10.3 は改訂の前後いずれも上限を `99.99` と書いており、
 * `design.md` の数値フィールド仕様表も同じ値である。条文に裏づけがある。
 *
 * *採らなかった案*: `999.99`（旧 `utils/field-validation.ts` の `NUMERIC_FIELD_RANGES`）。
 * 同ファイルは根拠として「14.4: 丸め設定の範囲（0.01〜999.99）」を挙げていたが、
 * `requirements.md` の Requirement 14 は受入基準7件すべてが表示書式の規定であり、
 * 範囲を定める 14.4 は**存在しない**。条文の裏づけを欠く値であるうえ、これを採ると
 * REQ-10.3 を「実装に合わせて広げる」向きの改訂になる。採らなかった。
 *
 * **同名の `validateNumericRange` は本モジュールへ一本化した。** `field-validation.ts`
 * が持っていた同名の関数と `NUMERIC_FIELD_RANGES` は撤去し、同ファイルの
 * `validateQuantityItemFields` は本モジュールへ委譲する。二系統を残す案は、
 * 上限が `99.99` と `999.99` へ**現に静かに割れていた**ことをもって採らなかった。
 * 逆向き（`field-validation.ts` へ寄せる）を採らなかったのは、本モジュールだけが
 * 本番経路（`CalculationFields`）から呼ばれており、寸法・箇所数も扱い、
 * 箇所数で `COUNT_MIN` / `COUNT_MAX` を参照する単一情報源の作法を既に持つためである。
 *
 * **未解決として引き継ぐもの**（本タスクの境界外）:
 * - **Task 80.2 へ: 丸め設定の `0` は既定値へ差し替えてから範囲判定へ渡すこと。**
 *   順序を逆にすると REQ-10.4 が破れ、現に緑の
 *   `e2e/specs/quantity-tables/field-specification.spec.ts` の
 *   `10.4: 丸め設定が0の時は0.01が自動設定される` が落ちる。上の
 *   「値 `0` は範囲判定の層に属さない」を読むこと。空白も同じ層で扱う
 * - バックエンドは同じ欄に二つの範囲を持つ。`FIELD_CONSTRAINTS.ROUNDING_UNIT` が
 *   `-99.99〜99.99`、`validateItemFieldSpecs` が直書きの `0.01〜999.99` である。
 *   フロントは正典で狭くなるため保存が通らなくなる向きの害は無いが、二系統は残る
 * - `e2e/specs/quantity-tables/field-specification.spec.ts` の REQ-10.3 の検証は
 *   丸め設定へ `-99.99` を入れて保持されることを主張している。正典と矛盾するため、
 *   結線（Task 80.2）と受入検証（Task 80.3）で是正が要る
 */
export const FIELD_RANGE_CONFIG: Record<NumericRangeFieldType, RangeConfig> = {
  adjustmentFactor: {
    min: -9.99,
    max: 9.99,
    label: '調整係数',
  },
  roundingUnit: {
    min: 0.01,
    max: 99.99,
    label: '丸め設定',
  },
  quantity: {
    min: -999999.99,
    max: 9999999.99,
    label: '数量',
  },
  dimension: {
    min: 0.01,
    max: 9999999.99,
    label: '寸法/ピッチ',
  },
  count: {
    // 範囲の二重定義を避けるため calculation-engine の定数を参照する（REQ-47 AC8）
    min: COUNT_MIN,
    max: COUNT_MAX,
    label: '箇所数',
    integer: true,
  },
};

// ============================================================================
// バリデーション関数
// ============================================================================

/**
 * 数値範囲の検証を行う
 *
 * `integer` 制約を持つフィールド（箇所数）では範囲チェックに加えて整数チェックを行う。
 * `integer` が未指定のフィールドでは従来どおり整数チェックを行わない（小数を許容する）。
 *
 * @param value - 検証対象の数値
 * @param fieldType - フィールドタイプ
 * @returns 検証結果
 */
export function validateNumericRange(
  value: number,
  fieldType: NumericRangeFieldType
): NumericRangeValidationResult {
  const config = FIELD_RANGE_CONFIG[fieldType];

  if (value < config.min || value > config.max) {
    return {
      isValid: false,
      error: `${config.label}は${config.min}〜${config.max}の範囲で入力してください`,
    };
  }

  // 整数制約（REQ-47 AC10 / REQ-15 AC5）: 範囲エラーと区別できる文言を返す
  if (config.integer === true && !Number.isInteger(value)) {
    return {
      isValid: false,
      error: `${config.label}は整数で入力してください`,
    };
  }

  return { isValid: true };
}

/**
 * フィールドタイプに対応する範囲設定を取得する
 *
 * @param fieldType - フィールドタイプ
 * @returns 範囲設定
 */
export function getFieldRangeConfig(fieldType: NumericRangeFieldType): RangeConfig {
  return FIELD_RANGE_CONFIG[fieldType];
}
