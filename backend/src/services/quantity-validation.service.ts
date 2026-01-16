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
 * - 9.3: 調整係数列に0以下の値が入力される場合、警告メッセージを表示し確認を求める
 * - 9.4: 調整係数列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 * - 10.3: 丸め設定列に0以下の値が入力される場合、エラーメッセージを表示し、正の値の入力を求める
 * - 10.4: 丸め設定列に数値以外の文字が入力される場合、入力を拒否しエラーメッセージを表示する
 *
 * Task 2.5: 計算検証とバリデーションを実装する
 *
 * @module services/quantity-validation
 */

/**
 * 計算方法の型
 */
export type CalculationMethodType = 'STANDARD' | 'AREA_VOLUME' | 'PITCH';

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
 * 計算パラメータの型
 */
export type CalculationParamsType =
  | AreaVolumeValidationParams
  | PitchValidationParams
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
}
