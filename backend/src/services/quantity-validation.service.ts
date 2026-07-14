/**
 * @fileoverview 数量項目バリデーションサービス
 *
 * 数量項目の入力値検証とビジネスルールチェックを担当します。
 *
 * Requirements:
 * - 8.3: 計算方法が「標準」で数量フィールドに負の値が入力される場合、警告メッセージを表示し確認を求める
 * - 8.4: 計算方法が「標準」で数量フィールドに数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 8.7: 「面積・体積」モードで計算用列に値が1つも入力されていない状態で保存を試行する場合、エラーメッセージを表示する
 * - 8.10: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）のいずれかが未入力で保存を試行する場合、エラーメッセージを表示する
 * - 8.15: 「箇所数」モードで必須項目（箇所数）が未入力で保存を試行する場合、エラーメッセージを表示し箇所数の入力を求める
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 47.8: 「箇所数」フィールドを必須項目とし、入力可能範囲を1〜9999999の整数とする
 * - 47.9: 「箇所数」が未入力のまま保存を試行する場合、エラーメッセージを表示し箇所数の入力を求める
 * - 47.10: 「箇所数」に小数を含む値が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 47.11: 「箇所数」に入力可能範囲（1〜9999999）外の値が入力される場合、エラーメッセージを表示する
 *
 * Task 2.5: 計算検証とバリデーションを実装する
 * Task 66.2: 計算方法「箇所数」の検証と未知の計算方法の fail-fast を追加する
 *
 * @module services/quantity-validation
 */

// 計算方法の唯一の定義元は quantity-table.schema.ts の CALCULATION_METHODS。
// 型のみを import（`import type`）しているためスキーマモジュールの実行時 import は発生せず、
// 循環参照も生じない（schema 側は zod のみに依存する）。
import type { CalculationMethodType as SchemaCalculationMethodType } from '../schemas/quantity-table.schema.js';

// 箇所数の入力可能範囲（REQ-47 AC8, AC11）の唯一の定義元は calculation-engine.ts。
// 範囲の二重定義を避けるため、ここでは再定義せず import して参照する。
// calculation-engine.ts は decimal.js のみに依存するため循環参照は生じない。
import { COUNT_MAX, COUNT_MIN } from './calculation-engine.js';

/**
 * 計算方法の型
 *
 * `quantity-table.schema.ts` の `CALCULATION_METHODS` から派生させ、
 * 計算方法の二重管理（値の追加漏れ）を防ぐ。
 */
export type CalculationMethodType = SchemaCalculationMethodType;

/**
 * 面積・体積計算パラメータ
 */
export interface AreaVolumeValidationParams {
  width?: number;
  depth?: number;
  height?: number;
  weight?: number;
}

/**
 * ピッチ計算パラメータ
 */
export interface PitchValidationParams {
  rangeLength?: number;
  endLength1?: number;
  endLength2?: number;
  pitchLength?: number;
  length?: number;
  weight?: number;
}

/**
 * 箇所数計算パラメータ（REQ-47）
 *
 * ピッチ計算が範囲長・端長1・端長2・ピッチ長から自動算出する箇所数を、
 * 手入力の `count` に置き換えたもの。箇所数確定後の長さ・重量の乗算は
 * ピッチと同一仕様。
 */
export interface CountValidationParams {
  count?: number;
  length?: number;
  weight?: number;
}

/**
 * 計算パラメータの型
 */
export type CalculationParamsType =
  | AreaVolumeValidationParams
  | PitchValidationParams
  | CountValidationParams
  | Record<string, number | undefined>;

/**
 * 数量項目バリデーション入力
 */
export interface QuantityItemValidationInput {
  calculationMethod: CalculationMethodType;
  calculationParams: CalculationParamsType;
  quantity?: number;
  adjustmentFactor: number;
  roundingUnit: number;
}

/**
 * バリデーションエラー
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * バリデーション警告
 */
export interface ValidationWarning {
  field: string;
  message: string;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * 数量項目バリデーションサービス
 *
 * 数量項目の入力値検証とビジネスルールチェックを提供します。
 */
export class QuantityValidationService {
  /**
   * 数量項目の検証
   *
   * 計算方法に応じた入力値検証、調整係数・丸め設定のチェックを実行します。
   *
   * @param input - 検証対象の数量項目入力
   * @returns バリデーション結果
   */
  validateQuantityItem(input: QuantityItemValidationInput): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. 丸め設定の検証（エラーとなるため先に検証）
    const roundingResult = this.validateRoundingUnit(input.roundingUnit);
    errors.push(...roundingResult.errors);
    warnings.push(...roundingResult.warnings);

    // 2. 調整係数の検証
    const adjustmentResult = this.validateAdjustmentFactor(input.adjustmentFactor);
    errors.push(...adjustmentResult.errors);
    warnings.push(...adjustmentResult.warnings);

    // 3. 計算方法に応じた検証
    switch (input.calculationMethod) {
      case 'STANDARD':
        this.validateStandardMode(input, errors, warnings);
        break;

      case 'AREA_VOLUME':
        this.validateAreaVolumeMode(input, errors, warnings);
        break;

      case 'PITCH':
        this.validatePitchMode(input, errors, warnings);
        break;

      case 'COUNT':
        this.validateCountMode(input, errors);
        break;

      // 未知の計算方法を無検証で素通りさせない（fail-fast）。
      // CALCULATION_METHODS への値追加時に case を書き忘れても、
      // 保存が無検証で成功してしまう事故を防ぐ。
      default: {
        const unknownMethod: string = input.calculationMethod;
        errors.push({
          field: 'calculationMethod',
          message: `未知の計算方法です: ${unknownMethod}`,
        });
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 標準モードの検証
   *
   * @param input - 検証対象の入力
   * @param errors - エラーリスト
   * @param warnings - 警告リスト
   */
  private validateStandardMode(
    input: QuantityItemValidationInput,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // 数量の存在確認
    if (input.quantity === undefined || input.quantity === null) {
      errors.push({
        field: 'quantity',
        message: '数量は必須です',
      });
      return;
    }

    // 数値検証
    const numericResult = this.validateNumericInput(input.quantity, 'quantity');
    if (!numericResult.isValid) {
      errors.push(...numericResult.errors);
      return;
    }

    // 負の値チェック（警告）
    if (input.quantity < 0) {
      warnings.push({
        field: 'quantity',
        message: '数量に負の値が入力されています。確認してください。',
      });
    }
  }

  /**
   * 面積・体積モードの検証
   *
   * @param input - 検証対象の入力
   * @param errors - エラーリスト
   * @param warnings - 警告リスト
   */
  private validateAreaVolumeMode(
    input: QuantityItemValidationInput,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const params = input.calculationParams as AreaVolumeValidationParams;

    // 少なくとも1つの値が入力されているか確認
    const hasValue =
      params.width !== undefined ||
      params.depth !== undefined ||
      params.height !== undefined ||
      params.weight !== undefined;

    if (!hasValue) {
      errors.push({
        field: 'calculationParams',
        message: '面積・体積モードでは少なくとも1つの計算用列に値を入力してください',
      });
      return;
    }

    // 各パラメータの負の値チェック
    if (params.width !== undefined && params.width < 0) {
      warnings.push({
        field: 'calculationParams.width',
        message: '幅に負の値が入力されています。確認してください。',
      });
    }
    if (params.depth !== undefined && params.depth < 0) {
      warnings.push({
        field: 'calculationParams.depth',
        message: '奥行きに負の値が入力されています。確認してください。',
      });
    }
    if (params.height !== undefined && params.height < 0) {
      warnings.push({
        field: 'calculationParams.height',
        message: '高さに負の値が入力されています。確認してください。',
      });
    }
    if (params.weight !== undefined && params.weight < 0) {
      warnings.push({
        field: 'calculationParams.weight',
        message: '重量に負の値が入力されています。確認してください。',
      });
    }
  }

  /**
   * ピッチモードの検証
   *
   * @param input - 検証対象の入力
   * @param errors - エラーリスト
   * @param warnings - 警告リスト
   */
  private validatePitchMode(
    input: QuantityItemValidationInput,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const params = input.calculationParams as PitchValidationParams;

    // 必須項目の存在確認
    if (params.rangeLength === undefined) {
      errors.push({
        field: 'calculationParams.rangeLength',
        message: '範囲長は必須です',
      });
    }
    if (params.endLength1 === undefined) {
      errors.push({
        field: 'calculationParams.endLength1',
        message: '端長1は必須です',
      });
    }
    if (params.endLength2 === undefined) {
      errors.push({
        field: 'calculationParams.endLength2',
        message: '端長2は必須です',
      });
    }
    if (params.pitchLength === undefined) {
      errors.push({
        field: 'calculationParams.pitchLength',
        message: 'ピッチ長は必須です',
      });
    } else if (params.pitchLength <= 0) {
      errors.push({
        field: 'calculationParams.pitchLength',
        message: 'ピッチ長は0より大きい値を入力してください',
      });
    }

    // 負の値チェック（警告）
    if (params.rangeLength !== undefined && params.rangeLength < 0) {
      warnings.push({
        field: 'calculationParams.rangeLength',
        message: '範囲長に負の値が入力されています。確認してください。',
      });
    }
    if (params.endLength1 !== undefined && params.endLength1 < 0) {
      warnings.push({
        field: 'calculationParams.endLength1',
        message: '端長1に負の値が入力されています。確認してください。',
      });
    }
    if (params.endLength2 !== undefined && params.endLength2 < 0) {
      warnings.push({
        field: 'calculationParams.endLength2',
        message: '端長2に負の値が入力されています。確認してください。',
      });
    }
  }

  /**
   * 箇所数モードの検証（REQ-47）
   *
   * 箇所数は必須・整数・1〜9999999 の範囲。長さ・重量は任意。
   * いずれも入力を拒否する（エラー）仕様であり、警告は発生しない
   * （負の値は範囲チェックでエラーになるため）。
   *
   * Requirements:
   * - 8.15 / 47.9: 箇所数が未入力の場合はエラー
   * - 47.10: 箇所数が小数の場合はエラー
   * - 47.11: 箇所数が範囲（1〜9999999）外の場合はエラー
   *
   * @param input - 検証対象の入力
   * @param errors - エラーリスト
   */
  private validateCountMode(input: QuantityItemValidationInput, errors: ValidationError[]): void {
    const params = input.calculationParams as CountValidationParams;

    // 必須項目の存在確認（REQ-8 AC15 / REQ-47 AC9）
    if (params.count === undefined || params.count === null) {
      errors.push({
        field: 'calculationParams.count',
        message: '箇所数は必須です',
      });
      return;
    }

    // 数値検証（NaN・Infinity・数値以外を拒否）
    const numericResult = this.validateNumericInput(params.count, 'calculationParams.count');
    if (!numericResult.isValid) {
      errors.push(...numericResult.errors);
      return;
    }

    // 整数検証（REQ-47 AC10）
    if (!Number.isInteger(params.count)) {
      errors.push({
        field: 'calculationParams.count',
        message: '箇所数は整数で入力してください',
      });
      return;
    }

    // 範囲検証（REQ-47 AC11）
    if (params.count < COUNT_MIN || params.count > COUNT_MAX) {
      errors.push({
        field: 'calculationParams.count',
        message: `箇所数は${COUNT_MIN}〜${COUNT_MAX}の範囲で入力してください`,
      });
    }
  }

  /**
   * 調整係数の検証
   *
   * @param adjustmentFactor - 調整係数
   * @returns バリデーション結果
   */
  private validateAdjustmentFactor(adjustmentFactor: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 数値検証
    const numericResult = this.validateNumericInput(adjustmentFactor, 'adjustmentFactor');
    if (!numericResult.isValid) {
      return numericResult;
    }

    // 0以下の値チェック（警告）
    if (adjustmentFactor <= 0) {
      warnings.push({
        field: 'adjustmentFactor',
        message: '調整係数に0以下の値が入力されています。確認してください。',
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
   * @param roundingUnit - 丸め単位
   * @returns バリデーション結果
   */
  private validateRoundingUnit(roundingUnit: number): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 数値検証
    const numericResult = this.validateNumericInput(roundingUnit, 'roundingUnit');
    if (!numericResult.isValid) {
      return numericResult;
    }

    // 0以下の値チェック（エラー）
    if (roundingUnit <= 0) {
      errors.push({
        field: 'roundingUnit',
        message: '丸め設定は0より大きい値を入力してください',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 計算パラメータの検証
   *
   * @param method - 計算方法
   * @param params - 計算パラメータ
   * @returns バリデーション結果
   */
  validateCalculationParams(
    method: CalculationMethodType,
    params: CalculationParamsType
  ): ValidationResult {
    const input: QuantityItemValidationInput = {
      calculationMethod: method,
      calculationParams: params,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
    };

    // STANDARD モードの場合は quantity を設定
    if (method === 'STANDARD') {
      input.quantity = 0;
    }

    return this.validateQuantityItem(input);
  }

  /**
   * 数値入力の検証
   *
   * @param value - 検証対象の値
   * @param fieldName - フィールド名
   * @returns バリデーション結果
   */
  validateNumericInput(value: number, fieldName: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName}には有効な数値を入力してください`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 複数項目の一括検証
   *
   * @param items - 検証対象の項目リスト
   * @returns バリデーション結果のリスト
   */
  validateBatch(items: QuantityItemValidationInput[]): ValidationResult[] {
    return items.map((item) => this.validateQuantityItem(item));
  }

  // ============================================================================
  // Task 52.1: グループ名切り詰めユーティリティ
  //
  // Requirements:
  // - 38.5: 複製先グループ名を「{元名}のコピー」とする
  // - 38.6: 上限（全角25文字/半角50文字、REQ-22 AC4）を超える場合は元名を切り詰めて
  //         サフィックスを末尾に必ず付与する
  // ============================================================================

  /**
   * 数量グループ名の最大文字幅（半角換算）
   *
   * REQ-22 AC4 で規定された「全角25文字/半角50文字」を半角換算した値。
   * 全角=2, 半角=1 でカウントするため、最大幅は半角50に統一される。
   */
  private static readonly GROUP_NAME_MAX_WIDTH = 50;

  /**
   * 文字幅を計算する
   *
   * 全角文字は2、半角文字は1としてカウントします。
   * QuantityFieldValidationService.calculateStringWidth と同一仕様で、
   * 名前文字数制限のサーバーサイド検証ロジックを共通化する基礎関数。
   *
   * 判定基準:
   * - U+0000〜U+007F（ASCII）: 半角（width=1）
   * - U+FF61〜U+FF9F（半角カタカナ）: 半角（width=1）
   * - その他: 全角（width=2）
   *
   * @param value - 検証対象の文字列
   * @returns 文字幅（半角換算）
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
   * 名前 + サフィックスが maxWidth を超える場合に元名側を切り詰め、
   * サフィックスを末尾に必ず付与した文字列を返す（Task 52.1）。
   *
   * Requirements:
   * - 38.5: 複製先グループ名を「{元名}のコピー」とする
   * - 38.6: 上限（全角25/半角50, REQ-22 AC4）超過時は元名を切り詰めてサフィックスを末尾に付与
   *
   * 切り詰めアルゴリズム:
   * 1. originalName + suffix の幅が maxWidth 以下ならそのまま連結して返す
   * 2. 超過時は (maxWidth - suffix の幅) 以内に収まるよう元名先頭から1文字ずつ消費して
   *    切り詰め、末尾に suffix を必ず付与する
   * 3. suffix だけで maxWidth を超える場合は suffix をそのまま返す
   *    （Requirements 38.6 はサフィックスを「必ず末尾に付与」と定めているため suffix 落としは行わない）
   * 4. maxWidth が 0 以下の場合は空文字を返す（防御的）
   *
   * 全角・半角混在時のカウントは calculateStringWidth と同一（全角=2, 半角=1）。
   *
   * @param originalName - 元のグループ名
   * @param suffix - 末尾に付与するサフィックス（例: "のコピー"）
   * @param maxWidth - 結果文字列の最大文字幅（半角換算）
   * @returns 切り詰め後の文字列
   */
  truncateNameWithSuffix(originalName: string, suffix: string, maxWidth: number): string {
    // 防御的エッジケース: maxWidth が 0 以下なら空文字
    if (maxWidth <= 0) {
      return '';
    }

    const suffixWidth = this.calculateStringWidth(suffix);

    // suffix だけで maxWidth を超える場合は suffix をそのまま返す
    // （Requirements 38.6 はサフィックスの末尾付与を必須としているため、suffix を切り詰めない）
    if (suffixWidth >= maxWidth) {
      return suffix;
    }

    // 全体幅が maxWidth 以下なら素通し
    const originalWidth = this.calculateStringWidth(originalName);
    if (originalWidth + suffixWidth <= maxWidth) {
      return originalName + suffix;
    }

    // 元名側を切り詰める: (maxWidth - suffixWidth) 以内に収まるよう
    // 先頭から1文字（コードポイント単位）ずつ貪欲に消費する
    const allowedNameWidth = maxWidth - suffixWidth;
    let truncatedName = '';
    let accumulated = 0;
    for (const char of originalName) {
      const charWidth = this.calculateStringWidth(char);
      if (accumulated + charWidth > allowedNameWidth) {
        break;
      }
      truncatedName += char;
      accumulated += charWidth;
    }

    return truncatedName + suffix;
  }

  /**
   * 数量グループのコピー時の名前生成（design.md 準拠 API）
   *
   * Requirements:
   * - 38.5, 38.6
   *
   * design.md セクション「数量グループのコピー機能（REQ-38）」で指定された
   * `truncateForCopy(originalName, suffix)` を提供する。最大文字幅は
   * REQ-22 AC4 の「全角25/半角50」固定値（半角換算 50）を使用する。
   *
   * @param originalName - 元のグループ名
   * @param suffix - 末尾に付与するサフィックス（通常は「のコピー」）
   * @returns 文字数制限内に収めた複製先グループ名
   */
  truncateForCopy(originalName: string, suffix: string): string {
    return this.truncateNameWithSuffix(
      originalName,
      suffix,
      QuantityValidationService.GROUP_NAME_MAX_WIDTH
    );
  }

  /**
   * 現場調査からの一括グループ生成時の連番命名ヘルパー（design.md 準拠 API, Task 56.1）。
   *
   * Requirements:
   * - 40.5: 各生成グループのグループ名を「{現場調査名} {連番}」（連番は1始まりの通し番号）とする
   * - 40.6: 最大文字数（全角25/半角50, REQ-22 AC4）超過時は現場調査名部分を切り詰めて連番を付与する
   *
   * REQ-38 のコピー命名（{@link truncateForCopy}）と同一の文字数規則（全角=2/半角=1,
   * 上限 {@link GROUP_NAME_MAX_WIDTH}=半角50）を共有する。連番をサフィックス
   * ` ${sequence}`（半角スペース + 連番）として {@link truncateNameWithSuffix} に委譲する
   * ことで、超過時は現場調査名部分のみ切り詰めて連番を末尾に必ず付与する（独自の文字幅
   * カウントは再実装しない）。
   *
   * @param surveyName - 現場調査名
   * @param sequence - 連番（1始まり）
   * @returns 「{切り詰めた現場調査名} {連番}」
   */
  buildGroupNameFromSurvey(surveyName: string, sequence: number): string {
    return this.truncateNameWithSuffix(
      surveyName,
      ` ${sequence}`,
      QuantityValidationService.GROUP_NAME_MAX_WIDTH
    );
  }
}
