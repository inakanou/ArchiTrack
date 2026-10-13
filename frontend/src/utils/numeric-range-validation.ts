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
 * - 8.4: 数量フィールドに数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する
 * - 9.5: 調整係数フィールドに数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する
 * - 10.5: 丸め設定フィールドに数値以外の文字が入力された場合は入力を拒否しエラーメッセージを表示する
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
 * Task 80.2: 既定値差し替えの層（REQ-9.4 / 10.4 / 15.2）も本モジュールへ置き、
 *   描画される部品が「差し替えてから範囲判定」の順序を単一の出所から得られるようにする
 * Task 85.1: バックエンドを本正典へ揃えたため、保存経路が受け付けない領域を
 *   別文言で告げていた暫定の層（`SAVE_POSITIVE_ONLY_FIELD_TYPES` /
 *   `validateSavePersistability`）は役目を終えた。同層はもう無く、調整係数の `0` と
 *   負値は REQ-9.3 の有効域の内側としてそのまま保存できる
 * Task 80.3: 数値以外の入力の拒否（REQ-8.4 / 9.5 / 10.5）を同じ層へ足す。
 *   **空白（既定値の自動設定）と数値以外（拒否）は別の帰結であり、`resolveFieldInput` が
 *   両者を判別して返す。** 拒否は焦点喪失の時点で行い、打鍵の途中では値に一切触れない
 *   ——日本語入力の変換中に値へ手を入れると変換が壊れるためである（IME の項を読むこと）
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
 * **引き継いだものはすべて解消した**:
 * - Task 80.2 が「既定値差し替え → 範囲判定」の順序で結線した（{@link FIELD_DEFAULT_SUBSTITUTION}）
 * - Task 80.3 が受入検証の主張を正典へ揃えた
 * - Task 85.1 がバックエンドを本正典へ揃えた。バックエンド側の出所は
 *   `backend/src/services/quantity-field-validation.service.ts` の `FIELD_CONSTRAINTS` 一つであり、
 *   丸め設定 `0.01〜99.99` / 調整係数 `-9.99〜9.99` が本ファイルの値と一致する。
 *   **両者は言語もパッケージも異なるため取り込み合えない。** 値を変えるときは
 *   双方を同時に動かすこと——同ファイルの `FIELD_CONSTRAINTS` の説明が対の位置を指している
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

// ============================================================================
// 既定値差し替えの層（範囲判定より先に適用する）
// ============================================================================

/**
 * 既定値差し替えの規則
 *
 * `substitutesZero` は「値 `0` にも既定値を差し替えるか」であり、**丸め設定だけが真である**。
 */
export interface DefaultSubstitutionConfig {
  /** 差し替える既定値 */
  defaultValue: number;
  /** 値 `0` も既定値へ差し替えるか */
  substitutesZero: boolean;
}

/**
 * 既定値差し替えの正典（Task 80.2）
 *
 * ## この層は範囲判定より先である
 *
 * 80.1 が確定させた順序に従い、**既定値へ差し替えてから範囲判定へ渡す**。
 * 丸め設定の `0` は REQ-10.4 が「未設定」の意味を与えた番兵であって入力値ではなく、
 * 差し替え後の `0.01` は範囲の下限そのものなので、この順序なら範囲判定は必ず通る。
 * 逆順に置くと REQ-10.4 が到達しない条文になる（`FIELD_RANGE_CONFIG` の説明を読むこと）。
 *
 * ## `0` を差し替えるのは丸め設定だけである（Task 80.2）
 *
 * REQ-9.4 の逐語は「When 調整係数フィールドに**空白**が入力される, the 数量表管理システム
 * shall 自動的にデフォルト値「1.00」を設定する」であり、`0` を挙げていない。加えて
 * REQ-9.3 の有効域 `-9.99〜9.99` は `0` を**内側に含む**。したがって調整係数の `0` は
 * そのまま `0.00` として確定させるのが条文どおりである。
 *
 * 改める前の `CalculationFields.tsx` の `AdjustmentField` は `numValue === 0 &&
 * defaultValue !== 0` という条件で `0` を既定値へ差し替えており、丸め設定（REQ-10.4）の
 * ための差し替えが同じ部品を使う調整係数へ相乗りしていた（実装側の註も
 * 「0の場合もデフォルト値を設定（丸め設定用）」と述べており、意図されたものではない）。
 * 規則を欄ごとに宣言する形へ改め、相乗りを断った。
 *
 * *採らなかった案*: 「AC 4 が先」という 80.1 の順序を調整係数へも横展開し、`0` を
 * `1.00` へ差し替え続ける。REQ-9.4 は空白しか挙げておらず、`0` は REQ-9.3 の有効域の
 * 内側であるため、条文の裏づけが無い。実装の都合（同一部品）を条文の読みへ持ち込む
 * ことになるため採らなかった。
 *
 * 数量（REQ-15.2）は空白のとき `0` を設定して「0.00」と表示する。`0` は数量の有効域
 * `-999999.99〜9999999.99` の内側であるため `substitutesZero` は偽で足りる。
 */
export const FIELD_DEFAULT_SUBSTITUTION = {
  // REQ-9.4: 空白のときだけ既定値「1.00」。`0` は REQ-9.3 の有効域の内側であり差し替えない
  adjustmentFactor: { defaultValue: 1.0, substitutesZero: false },
  // REQ-10.4: `0` または空白で既定値「0.01」。本項は REQ-10.3 の範囲判定に優先する
  roundingUnit: { defaultValue: 0.01, substitutesZero: true },
  // REQ-15.2: 空白のとき既定値「0」を設定し「0.00」と表示する
  quantity: { defaultValue: 0, substitutesZero: false },
} as const satisfies Partial<Record<NumericRangeFieldType, DefaultSubstitutionConfig>>;

/**
 * 既定値差し替えの規則を持つフィールドタイプ
 */
export type DefaultSubstitutedFieldType = keyof typeof FIELD_DEFAULT_SUBSTITUTION;

/**
 * 入力文字列の解決結果（Task 80.3）
 *
 * `isNumeric` が偽のときは **数値としてまるごと読めない文字が入力された** ことを表す
 * （REQ-8.4 / REQ-9.5 / REQ-10.5）。呼び出し側は入力を拒否し `error` を提示すること。
 * `value` はその場合も既定値を持つが、**確定させてはならない**。
 *
 * 空白は「数値以外」ではない。REQ-9.4 / REQ-10.4 / REQ-15.2 が既定値の自動設定という
 * 別の帰結を定めているため、`isNumeric` は真で既定値を返す。**この二つを混ぜると、
 * 空白の自動設定（現に緑の検証がある）か数値以外の拒否のどちらかが必ず壊れる。**
 */
export interface FieldInputResolution {
  /** 数値としてまるごと読めたか（偽なら入力を拒否する） */
  isNumeric: boolean;
  /** 既定値差し替えを適用した数値（`isNumeric` が真のときのみ確定させてよい） */
  value: number;
  /** 数値以外のときに提示する文言（REQ-8.4 / REQ-9.5 / REQ-10.5） */
  error?: string;
}

/**
 * 入力文字列へ既定値差し替えの層（REQ-9.4 / REQ-10.4 / REQ-15.2）と
 * 数値以外の拒否（REQ-8.4 / REQ-9.5 / REQ-10.5）を適用する
 *
 * **範囲判定へ渡す値は必ず本関数を通したものにすること。** 呼び出し側で
 * 「空白なら既定値」「0なら既定値」を書き直すと、規則が二系統に割れる。
 *
 * **戻り値が構造体なのは意図である**（Task 80.3）。数値を直接返していたころは
 * 数値以外の入力が黙って既定値へ倒れており、呼び出し側からは空白との区別がつかなかった。
 * 判別を型で強制することで、拒否の層を素通りする呼び出し側が生まれない。
 *
 * @param rawValue - 欄に入力されている生の文字列（前後の空白は無視する）
 * @param fieldType - フィールドタイプ
 * @returns 解決結果（{@link FieldInputResolution}）
 */
export function resolveFieldInput(
  rawValue: string,
  fieldType: DefaultSubstitutedFieldType
): FieldInputResolution {
  const config: DefaultSubstitutionConfig = FIELD_DEFAULT_SUBSTITUTION[fieldType];
  const trimmed = rawValue.trim();

  // REQ-9.4 / REQ-10.4 / REQ-15.2: 空白は既定値差し替えの層が受け持つ。
  // **空白は「数値以外の文字」ではない。** 条文が別の帰結（既定値の自動設定）を定めている
  if (trimmed === '') {
    return { isNumeric: true, value: config.defaultValue };
  }

  // REQ-8.4 / REQ-9.5 / REQ-10.5: 数値としてまるごと読めない入力は拒否する。
  // `Number.parseFloat` を使わないのは「12abc」を `12` と読んでしまうためである——
  // 条文は「数値以外の文字が入力される」ことを拒否の条件としており、先頭が数字であることを
  // 免罪符にしない。`Number()` は全体が数値表記のときだけ有限値を返す
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      isNumeric: false,
      value: config.defaultValue,
      error: `${FIELD_RANGE_CONFIG[fieldType].label}は数値で入力してください`,
    };
  }

  // REQ-10.4: 丸め設定の `0` は「未設定」の番兵であり既定値へ差し替える
  if (parsed === 0 && config.substitutesZero) {
    return { isNumeric: true, value: config.defaultValue };
  }
  return { isNumeric: true, value: parsed };
}
