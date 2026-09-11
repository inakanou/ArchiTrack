/**
 * @fileoverview 数量項目フィールドバリデーションサービス
 *
 * フィールド仕様に基づく入力値検証と表示書式設定を担当します。
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 * - 9.3: 調整係数の入力可能範囲（-9.99〜9.99）
 * - 10.3: 丸め設定の入力可能範囲（0.01〜99.99）
 * - 15.1: 数量フィールドの入力可能範囲（-999999.99〜9999999.99）
 * - 15.3: 寸法・ピッチ計算フィールドの入力可能範囲（0.01〜9999999.99）
 * - 9.4: 調整係数フィールドの空白時に「1.00」を自動設定
 * - 10.4: 丸め設定フィールドの0または空白時に「0.01」を自動設定
 * - 15.2: 数量フィールドの空白時に「0」を自動設定
 * - 14.2: 調整係数・丸め設定・数量フィールドを小数2桁で常に表示
 * - 14.3, 14.4: 寸法・ピッチフィールドは数値入力時のみ小数2桁表示
 *
 * Task 11: フィールドバリデーションサービスの拡張
 * Task 85.1: 数値欄の範囲もここへ畳んだ（{@link FIELD_CONSTRAINTS} の説明を読むこと）
 *
 * 本サービスは 13.1-13.3 の文字数上限**および数値欄の範囲**の**正典**である。上限値（{@link FIELD_CONSTRAINTS}）と
 * 幅計算（{@link QuantityFieldValidationService.calculateStringWidth}）、およびフィールド別の
 * 判定（`validateUnit` ほか）をここだけで定義し、保存経路（`QuantityTableService.validateDraft`）と
 * 作成経路（`QuantityItemService.create`）の双方が {@link QuantityFieldValidationService.validateItemTextFieldSpecs}
 * を通る（Task 77.1）。
 *
 * `quantity-validation.service.ts` にも同一仕様の `calculateStringWidth` があるが、同メソッドは
 * 数量グループ名のコピー時の切り詰め（REQ-22 AC4 / 38.6）のための基礎関数であり、13.1-13.3 の
 * フィールド別の上限値を持たない。そちらを正典に採ると、フィールド別の上限を第二の箇所へ
 * 書き起こすことになるため採らなかった。
 *
 * @module services/quantity-field-validation
 */

import type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from './quantity-validation.service.js';

/**
 * フィールド仕様定数
 *
 * ## 数値欄の範囲はここが唯一の出所である（Task 85.1）
 *
 * 改める前、バックエンドは同じ欄の範囲を**三箇所**に持っていた。
 *
 * - 本定数の `ROUNDING_UNIT` が `-99.99〜99.99`
 * - {@link QuantityFieldValidationService.validateItemFieldSpecs} が直書きの `0.01〜999.99`
 * - `routes/quantity-tables.routes.ts` の `saveDraftItemSchema` と
 *   `schemas/quantity-table.schema.ts` の作成／更新用スキーマが `z.number().positive()`
 *
 * 三者は下限も上限も互いに食い違っており、`positive()` は REQ-9.3 が有効域と定める
 * 調整係数の `0` と負値を 400 で拒んでいた。いまは本定数だけが値を持ち、
 * 各 `validateXxx` がそこから判定と文言の双方を組み立て、ルート層と各スキーマは
 * 範囲を課さないか本定数から引く。
 *
 * ## 値はフロントの正典と一致させてある
 *
 * 範囲の裁定は `frontend/src/utils/numeric-range-validation.ts` の `FIELD_RANGE_CONFIG`
 * にあり（タスク 80.1。REQ-10.3 を `0.01〜99.99` へ改訂した根拠と採らなかった案は
 * `requirements.md` の Requirement 10 の直後にもある）、本定数はその値を写したものである。
 * **フロントとバックエンドは言語もパッケージも異なり取り込み合えない。** 値を変えるときは
 * 双方を同時に動かすこと。
 *
 * ## 丸め設定の `0` をここで受けない理由
 *
 * REQ-10.4 は `0` と空白に既定値 `0.01` を与えるが、**その差し替えは欄の層の責務である**
 * （`frontend/src/components/quantity-table/CalculationFields.tsx` の `AdjustmentField`）。
 * 保存経路は繕われた後の最終状態を検める層であり、ここまで残った `0` は利用者が打った
 * 「未設定の印」ではなく、どの欄の層にも触れられずに紛れ込んだ値である。タスク 80.2 が
 * フロントの `handleSave` について同じ判断を下しており、本サービスはそれに揃えた。
 *
 * *採らなかった案*: ルート層の zod に `.min()` / `.max()` を課して二重に検める。**位置を名指せる
 * かどうかが理由ではない**——zod も `issues[].path` を持ち、`middleware/validate.middleware.ts` が
 * それを `details[]` へ載せるため `groups.0.items.0.adjustmentFactor` の形で名指せる（実測で確認した）。
 * 退けた理由は三つある。(1) **同じ不変条件に対して応答の形とコードが二つになる**——zod 違反は
 * `ValidationError`（`code: VALIDATION_ERROR`・`details[]` の配列）、サービス層の違反は
 * `QuantityTableValidationError`（`code: QUANTITY_TABLE_VALIDATION_ERROR`・
 * `validationErrors` の連想配列）であり、どちらが返るかは「どの層が先に走ったか」で決まる。
 * (2) **二重に課すと、正典を一箇所で動かしても片方が追随しない**——本タスクが解消した
 * `quantity-validation.service.ts` の重複がまさにこれで、`validateDraft` の重複抑止に覆われて
 * 表面化しないまま正典と食い違っていた。(3) `quantity` が以前から「ルート層は `z.number()`、
 * 範囲はサービス層」の層立てであり、同じスキーマの中で層立てを割らない。
 *
 * *採らなかった案*: 範囲だけを持つ新しいモジュールを起こして三者から取り込む。本サービスは
 * 既に 13.1-13.3 の上限の正典として同じ役目を負っており、数値欄だけを別の箇所へ置くと
 * 「フィールド仕様の正典」が二つに割れる。作成経路（`QuantityItemService.create`）と
 * 保存経路が同じ出所を見る形は {@link QuantityFieldValidationService.validateItemTextFieldSpecs}
 * が既に作っており、それをなぞった。
 *
 * *採らなかった案*: 丸め設定の上限を `999.99`（直書き側の値）に寄せて条文を広げる。
 * REQ-10.3 は改訂の前後いずれも上限を `99.99` と書いており、`design.md` の数値フィールド
 * 仕様表も同じ値である。「実装が要件に合っていないから要件を書き換える」を既定の解にしない。
 */
export const FIELD_CONSTRAINTS = {
  // テキストフィールド（全角/半角）
  MAJOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MIDDLE_CATEGORY: { zenkaku: 25, hankaku: 50 },
  MINOR_CATEGORY: { zenkaku: 25, hankaku: 50 },
  CUSTOM_CATEGORY: { zenkaku: 25, hankaku: 50 },
  WORK_TYPE: { zenkaku: 8, hankaku: 16 },
  NAME: { zenkaku: 25, hankaku: 50 },
  SPECIFICATION: { zenkaku: 25, hankaku: 50 },
  UNIT: { zenkaku: 3, hankaku: 6 },
  CALCULATION_METHOD: { zenkaku: 25, hankaku: 50 },
  REMARKS: { zenkaku: 25, hankaku: 50 },

  // 数値フィールド
  ADJUSTMENT_FACTOR: { min: -9.99, max: 9.99, default: 1.0 },
  ROUNDING_UNIT: { min: 0.01, max: 99.99, default: 0.01 },
  QUANTITY: { min: -999999.99, max: 9999999.99, default: 0 },

  // 寸法・ピッチフィールド
  DIMENSION: { min: 0.01, max: 9999999.99 },
} as const;

/**
 * テキストフィールド検証結果
 */
export interface TextValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * 数量項目のテキストフィールド（文字数上限の検証対象）
 *
 * Requirements 13.1-13.3 が上限を課すフィールドの集合。計算方法は列挙値であり
 * 自由入力ではないため含めない。
 *
 * Task 77.1: 作成経路と保存経路で同一の集合・同一の上限を検証するための共通の入力型。
 */
export interface QuantityItemTextFields {
  majorCategory: string | null;
  middleCategory: string | null;
  minorCategory: string | null;
  customCategory: string | null;
  workType: string;
  name: string;
  specification: string | null;
  unit: string;
  remarks: string | null;
}

/**
 * 数量項目フィールドバリデーションサービス
 *
 * フィールド仕様に基づく入力値検証と表示書式設定を提供します。
 */
export class QuantityFieldValidationService {
  /**
   * 文字幅を計算する
   *
   * 全角文字は2、半角文字は1としてカウントします。
   * 判定基準:
   * - U+0000〜U+007F（ASCII）: 半角
   * - U+FF61〜U+FF9F（半角カタカナ）: 半角
   * - その他: 全角
   *
   * @param value - 検証対象の文字列
   * @returns 文字幅
   */
  calculateStringWidth(value: string): number {
    let width = 0;
    for (const char of value) {
      const codePoint = char.codePointAt(0) ?? 0;
      if (
        // ASCII文字（半角英数字・記号）
        (codePoint >= 0x0000 && codePoint <= 0x007f) ||
        // 半角カタカナ
        (codePoint >= 0xff61 && codePoint <= 0xff9f)
      ) {
        width += 1;
      } else {
        // 全角文字
        width += 2;
      }
    }
    return width;
  }

  /**
   * テキストフィールドの文字数検証
   *
   * @param value - 検証対象の文字列
   * @param maxZenkaku - 全角最大文字数
   * @param maxHankaku - 半角最大文字数
   * @returns 検証結果（trueで有効）
   */
  validateTextLength(value: string, _maxZenkaku: number, maxHankaku: number): boolean {
    const width = this.calculateStringWidth(value);
    // 全角文字は2、半角文字は1として計算されるため、
    // 最大幅は半角の最大文字数（= 全角最大 * 2）
    return width <= maxHankaku;
  }

  /**
   * 大項目フィールドの検証
   */
  validateMajorCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MAJOR_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MAJOR_CATEGORY.hankaku,
      '大項目'
    );
  }

  /**
   * 中項目フィールドの検証
   */
  validateMiddleCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MIDDLE_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MIDDLE_CATEGORY.hankaku,
      '中項目'
    );
  }

  /**
   * 小項目フィールドの検証
   */
  validateMinorCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.MINOR_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.MINOR_CATEGORY.hankaku,
      '小項目'
    );
  }

  /**
   * 任意分類フィールドの検証
   */
  validateCustomCategory(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.CUSTOM_CATEGORY.zenkaku,
      FIELD_CONSTRAINTS.CUSTOM_CATEGORY.hankaku,
      '任意分類'
    );
  }

  /**
   * 工種フィールドの検証
   */
  validateWorkType(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.WORK_TYPE.zenkaku,
      FIELD_CONSTRAINTS.WORK_TYPE.hankaku,
      '工種'
    );
  }

  /**
   * 名称フィールドの検証
   */
  validateName(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.NAME.zenkaku,
      FIELD_CONSTRAINTS.NAME.hankaku,
      '名称'
    );
  }

  /**
   * 規格フィールドの検証
   */
  validateSpecification(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.SPECIFICATION.zenkaku,
      FIELD_CONSTRAINTS.SPECIFICATION.hankaku,
      '規格'
    );
  }

  /**
   * 単位フィールドの検証
   */
  validateUnit(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.UNIT.zenkaku,
      FIELD_CONSTRAINTS.UNIT.hankaku,
      '単位'
    );
  }

  /**
   * 計算方法テキストフィールドの検証
   */
  validateCalculationMethodText(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.CALCULATION_METHOD.zenkaku,
      FIELD_CONSTRAINTS.CALCULATION_METHOD.hankaku,
      '計算方法'
    );
  }

  /**
   * 備考フィールドの検証
   */
  validateRemarks(value: string): TextValidationResult {
    return this.validateTextField(
      value,
      FIELD_CONSTRAINTS.REMARKS.zenkaku,
      FIELD_CONSTRAINTS.REMARKS.hankaku,
      '備考'
    );
  }

  /**
   * テキストフィールドの汎用検証
   */
  private validateTextField(
    value: string,
    maxZenkaku: number,
    maxHankaku: number,
    fieldName: string
  ): TextValidationResult {
    if (this.validateTextLength(value, maxZenkaku, maxHankaku)) {
      return { isValid: true };
    }
    return {
      isValid: false,
      error: `${fieldName}は全角${maxZenkaku}文字/半角${maxHankaku}文字以内で入力してください`,
    };
  }

  /**
   * 数値フィールドの範囲検証
   *
   * @param value - 検証対象の数値
   * @param min - 最小値
   * @param max - 最大値
   * @returns 検証結果
   */
  validateNumericRange(value: number, min: number, max: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'value',
        message: `${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 調整係数の検証
   *
   * @param value - 調整係数値（-9.99〜9.99）
   * @returns 検証結果
   */
  validateAdjustmentFactor(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'adjustmentFactor',
        message: `調整係数は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 丸め設定の検証
   *
   * @param value - 丸め設定値（0.01〜99.99）
   * @returns 検証結果
   */
  validateRoundingUnit(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.ROUNDING_UNIT;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'roundingUnit',
        message: `丸め設定は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 数量の検証
   *
   * @param value - 数量値（-999999.99〜9999999.99）
   * @returns 検証結果
   */
  validateQuantity(value: number): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.QUANTITY;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (value < min || value > max) {
      errors.push({
        field: 'quantity',
        message: `数量は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 寸法・ピッチ計算フィールドの検証
   *
   * @param value - 寸法値（0.01〜9999999.99または空白）
   * @returns 検証結果
   */
  validateDimensionField(value: number | null): ValidationResult {
    const { min, max } = FIELD_CONSTRAINTS.DIMENSION;
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // nullは空白を許可
    if (value === null) {
      return {
        isValid: true,
        errors,
        warnings,
      };
    }

    if (value < min || value > max) {
      errors.push({
        field: 'dimension',
        message: `寸法は${min}から${max}の範囲で入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 調整係数のデフォルト値適用
   *
   * 空白の場合は1.00を返す
   *
   * @param value - 調整係数値（nullまたはundefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyAdjustmentFactorDefault(value: number | null | undefined): number {
    if (value === null || value === undefined) {
      return FIELD_CONSTRAINTS.ADJUSTMENT_FACTOR.default;
    }
    return value;
  }

  /**
   * 丸め設定のデフォルト値適用
   *
   * 0または空白の場合は0.01を返す
   *
   * @param value - 丸め設定値（0, null, undefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyRoundingUnitDefault(value: number | null | undefined): number {
    if (value === null || value === undefined || value === 0) {
      return FIELD_CONSTRAINTS.ROUNDING_UNIT.default;
    }
    return value;
  }

  /**
   * 数量のデフォルト値適用
   *
   * 空白の場合は0を返す
   *
   * @param value - 数量値（nullまたはundefinedの場合はデフォルト）
   * @returns デフォルト値または入力値
   */
  applyQuantityDefault(value: number | null | undefined): number {
    if (value === null || value === undefined) {
      return FIELD_CONSTRAINTS.QUANTITY.default;
    }
    return value;
  }

  /**
   * 数値を小数2桁表示用に書式設定
   *
   * @param value - 数値
   * @returns 書式設定された文字列（例: 1 → "1.00"）
   */
  formatDecimal2(value: number): string {
    return value.toFixed(2);
  }

  /**
   * 空白または数値を条件付き書式設定
   *
   * @param value - 数値またはnull/undefined
   * @returns 空白時は空文字、数値時は小数2桁
   */
  formatConditionalDecimal2(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    return this.formatDecimal2(value);
  }

  // ============================================================================
  // Task 14.2: 保存時バリデーション
  // ============================================================================

  /**
   * フィールド仕様エラー型
   */

  /**
   * 数量項目の全フィールドをフィールド仕様に基づいて検証する
   *
   * Task 14.2: 保存時バリデーションにフィールド仕様チェックを追加する
   *
   * Requirements:
   * - 11.2: 保存前にすべてのフィールドの文字数・範囲をサーバーサイドで再検証する
   * - 11.3: バリデーションエラー時にエラー箇所を特定する
   * - 11.4: フィールド仕様違反の詳細なエラーメッセージを返却する
   *
   * @param item - 検証対象の数量項目
   * @returns バリデーション結果
   */
  validateItemFieldSpecs(
    item: QuantityItemTextFields & {
      adjustmentFactor: number;
      roundingUnit: number;
      quantity: number;
    }
  ): FieldSpecValidationResult {
    // テキストフィールドの文字数検証は作成経路と共用する（下記メソッドが唯一の定義）
    const errors: FieldSpecError[] = [...this.validateItemTextFieldSpecs(item).errors];

    // 数値フィールドの範囲検証。範囲も文言も各 `validateXxx`（すなわち
    // {@link FIELD_CONSTRAINTS}）だけが持つ。ここで境界値も文言も書き写さない（Task 85.1）
    for (const [field, result, value] of [
      [
        'adjustmentFactor',
        this.validateAdjustmentFactor(item.adjustmentFactor),
        item.adjustmentFactor,
      ],
      ['roundingUnit', this.validateRoundingUnit(item.roundingUnit), item.roundingUnit],
      ['quantity', this.validateQuantity(item.quantity), item.quantity],
    ] as const) {
      for (const err of result.errors) {
        errors.push({ field, message: err.message, value });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 数量項目のテキストフィールドの文字幅（全角/半角換算）のみを検証する
   *
   * Task 77.1: 数量項目の入力上限の検証位置の不一致を解消する
   *
   * 上限の定義は本サービスの {@link FIELD_CONSTRAINTS} と各 `validateXxx` のみが持つ。
   * 保存経路（`QuantityTableService.validateDraft` → {@link validateItemFieldSpecs}）と
   * 作成経路（`QuantityItemService.create`）の双方が本メソッドを通ることで、
   * 同じ値が一方では通り他方では拒否される非対称（作成できるが保存できない数量項目）を作らない。
   *
   * 数値フィールドの範囲検証（9.3/10.3/15.1）は含めない。作成経路に課す上限は
   * Requirements 13.1-13.3（文字数）のみであり、範囲検証は別の受入基準の所管である。
   *
   * Requirements (quantity-table-generation):
   * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・備考（全角25文字/半角50文字）
   * - 13.2: 工種（全角8文字/半角16文字）
   * - 13.3: 単位（全角3文字/半角6文字）
   *
   * @param item - 検証対象の数量項目のテキストフィールド
   * @returns バリデーション結果
   */
  validateItemTextFieldSpecs(item: QuantityItemTextFields): FieldSpecValidationResult {
    const errors: FieldSpecError[] = [];

    const textFieldsToValidate = [
      {
        field: 'majorCategory',
        value: item.majorCategory,
        validator: () =>
          item.majorCategory ? this.validateMajorCategory(item.majorCategory) : { isValid: true },
      },
      {
        field: 'middleCategory',
        value: item.middleCategory,
        validator: () =>
          item.middleCategory
            ? this.validateMiddleCategory(item.middleCategory)
            : { isValid: true },
      },
      {
        field: 'minorCategory',
        value: item.minorCategory,
        validator: () =>
          item.minorCategory ? this.validateMinorCategory(item.minorCategory) : { isValid: true },
      },
      {
        field: 'customCategory',
        value: item.customCategory,
        validator: () =>
          item.customCategory
            ? this.validateCustomCategory(item.customCategory)
            : { isValid: true },
      },
      {
        field: 'workType',
        value: item.workType,
        validator: () => this.validateWorkType(item.workType),
      },
      { field: 'name', value: item.name, validator: () => this.validateName(item.name) },
      {
        field: 'specification',
        value: item.specification,
        validator: () =>
          item.specification ? this.validateSpecification(item.specification) : { isValid: true },
      },
      { field: 'unit', value: item.unit, validator: () => this.validateUnit(item.unit) },
      {
        field: 'remarks',
        value: item.remarks,
        validator: () => (item.remarks ? this.validateRemarks(item.remarks) : { isValid: true }),
      },
    ] as const;

    for (const { field, value, validator } of textFieldsToValidate) {
      const result = validator();
      if (!result.isValid && result.error) {
        errors.push({
          field,
          message: result.error,
          value: value ?? undefined,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * フィールド仕様違反のエラーレスポンスを生成する
   *
   * Task 14.2: フィールド仕様違反の詳細なエラーメッセージを返却する
   *
   * @param errors - フィールドエラー配列
   * @returns RFC 7807準拠のエラーレスポンス
   */
  createValidationErrorResponse(errors: FieldSpecError[]): FieldValidationErrorResponse {
    const errorMessages = errors.map((e) => e.message).join('; ');

    return {
      type: 'https://architrack.example.com/problems/field-validation-error',
      title: 'Field Validation Error',
      status: 400,
      detail: `フィールド仕様違反: ${errorMessages}`,
      code: 'FIELD_VALIDATION_ERROR',
      fieldErrors: errors,
    };
  }
}

/**
 * フィールド仕様エラー型
 */
export interface FieldSpecError {
  /** フィールド名 */
  field: string;
  /** エラーメッセージ */
  message: string;
  /** 問題のある値 */
  value?: string | number;
}

/**
 * フィールド仕様バリデーション結果型
 */
export interface FieldSpecValidationResult {
  /** バリデーション成否 */
  isValid: boolean;
  /** エラー配列 */
  errors: FieldSpecError[];
}

/**
 * フィールドバリデーションエラーレスポンス型
 */
export interface FieldValidationErrorResponse {
  /** RFC 7807 Problem Details - 問題タイプURI */
  type: string;
  /** RFC 7807 Problem Details - タイトル */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** エラー詳細メッセージ */
  detail: string;
  /** エラーコード */
  code: string;
  /** フィールドごとのエラー */
  fieldErrors: FieldSpecError[];
}
