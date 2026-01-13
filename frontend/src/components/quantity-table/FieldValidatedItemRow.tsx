/**
 * @fileoverview フィールド仕様統合数量項目行コンポーネント
 *
 * Task 14.1: 数量項目行コンポーネントにフィールド仕様を統合する
 *
 * Requirements:
 * - 13.1, 13.2, 13.3: 各テキストフィールドに文字数制限を適用する
 * - 14.1, 14.2, 14.3, 14.4, 14.5: 各数値フィールドに範囲チェックと表示書式を適用する
 * - 15.1, 15.2, 15.3: フィールドバリデーターを使用した入力制御を統合する
 *
 * @module components/quantity-table/FieldValidatedItemRow
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { QuantityItemDetail, CalculationMethod } from '../../types/quantity-table.types';
import type { CalculationParams } from '../../types/quantity-edit.types';
import AutocompleteInput from './AutocompleteInput';
import CalculationMethodSelect from './CalculationMethodSelect';
import CalculationFields from './CalculationFields';
import { calculate } from '../../utils/calculation-engine';
import {
  validateQuantityItemFields,
  hasValidationErrors,
  validateTextLength,
  validateNumericRange,
  type FieldValidationErrors,
  type TextFieldName,
} from '../../utils/field-validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * バリデーション変更情報
 */
export interface ValidationChangeInfo {
  /** エラーがあるかどうか */
  hasErrors: boolean;
  /** フィールドごとのエラー */
  errors: FieldValidationErrors;
}

/**
 * FieldValidatedItemRowコンポーネントのProps
 */
export interface FieldValidatedItemRowProps {
  /** 項目データ */
  item: QuantityItemDetail;
  /** 項目更新コールバック */
  onUpdate?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDelete?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopy?: (itemId: string) => void;
  /** 項目を上に移動するコールバック */
  onMoveUp?: (itemId: string) => void;
  /** 項目を下に移動するコールバック */
  onMoveDown?: (itemId: string) => void;
  /** 上に移動可能かどうか */
  canMoveUp?: boolean;
  /** 下に移動可能かどうか */
  canMoveDown?: boolean;
  /** バリデーション表示フラグ */
  showValidation?: boolean;
  /** バリデーション変更コールバック */
  onValidationChange?: (itemId: string, info: ValidationChangeInfo) => void;
  /** 未保存の大項目リスト */
  unsavedMajorCategories?: string[];
  /** 未保存の中項目リスト */
  unsavedMiddleCategories?: string[];
  /** 未保存の小項目リスト */
  unsavedMinorCategories?: string[];
  /** 未保存の任意分類リスト */
  unsavedCustomCategories?: string[];
  /** 未保存の工種リスト */
  unsavedWorkTypes?: string[];
  /** 未保存の単位リスト */
  unsavedUnits?: string[];
  /** 未保存の規格リスト */
  unsavedSpecifications?: string[];
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  wrapper: {
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 120px 100px 80px 100px 80px 80px 80px 100px 80px',
    gap: '2px',
    alignItems: 'start',
    padding: '2px 4px',
  } as React.CSSProperties,
  calculationFieldsRow: {
    padding: '0 4px 4px 4px',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  fieldGroup: {} as React.CSSProperties,
  directInputContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    height: '22px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '22px',
    padding: '2px 4px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    fontSize: '12px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
  } as React.CSSProperties,
  inputWarning: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  } as React.CSSProperties,
  warningMessage: {
    color: '#b45309',
    fontSize: '11px',
    marginTop: '2px',
  } as React.CSSProperties,
  errorMessage: {
    color: '#dc2626',
    fontSize: '11px',
    marginTop: '2px',
  } as React.CSSProperties,
  quantityInput: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  numberInput: {
    MozAppearance: 'textfield' as const,
    WebkitAppearance: 'textfield',
  } as React.CSSProperties,
  actionsCell: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    paddingTop: '15px',
  } as React.CSSProperties,
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'background-color 0.2s, color 0.2s',
  } as React.CSSProperties,
  deleteButton: {
    color: '#dc2626',
  } as React.CSSProperties,
  menuWrapper: {
    position: 'relative' as const,
  } as React.CSSProperties,
  menu: {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 10,
    minWidth: '120px',
    padding: '4px 0',
  } as React.CSSProperties,
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#374151',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left' as const,
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ============================================================================
// バリデーションロジック
// ============================================================================

/**
 * 必須フィールドのバリデーションエラーを生成
 */
function getRequiredFieldErrors(item: QuantityItemDetail): Record<string, string | undefined> {
  return {
    majorCategory: item.majorCategory ? undefined : '大項目は必須です',
    workType: item.workType ? undefined : '工種は必須です',
    name: item.name ? undefined : '名称は必須です',
    unit: item.unit ? undefined : '単位は必須です',
  };
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * フィールド仕様統合数量項目行
 *
 * EditableQuantityItemRowにフィールド仕様（文字数制限、範囲チェック、表示書式）を統合。
 *
 * @param props - コンポーネントProps
 */
export default function FieldValidatedItemRow({
  item,
  onUpdate,
  onDelete,
  onCopy,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  showValidation = true,
  onValidationChange,
  unsavedMajorCategories = [],
  unsavedMiddleCategories = [],
  unsavedMinorCategories = [],
  unsavedCustomCategories = [],
  unsavedWorkTypes = [],
  unsavedUnits = [],
  unsavedSpecifications = [],
}: FieldValidatedItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [localName, setLocalName] = useState(item.name);
  const [localQuantity, setLocalQuantity] = useState(item.quantity);
  const [localAdjustmentFactor, setLocalAdjustmentFactor] = useState(item.adjustmentFactor);
  const [localRoundingUnit, setLocalRoundingUnit] = useState(item.roundingUnit);

  // ローカル検証エラー状態（リアルタイム入力中の一時的なエラー）
  const [localFieldErrors, setLocalFieldErrors] = useState<FieldValidationErrors>({});

  // 親の値が変更された場合、ローカル状態を同期（key変更またはprops変更時）
  // NOTE: レンダリング中のsetStateは、props変更時の同期パターンとして許容される
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (localName !== item.name && document.activeElement?.id !== `${item.id}-name`) {
    setLocalName(item.name);
  }
  if (localQuantity !== item.quantity && document.activeElement?.id !== `${item.id}-quantity`) {
    setLocalQuantity(item.quantity);
  }
  if (
    localAdjustmentFactor !== item.adjustmentFactor &&
    document.activeElement?.id !== `${item.id}-adjustmentFactor`
  ) {
    setLocalAdjustmentFactor(item.adjustmentFactor);
  }
  if (
    localRoundingUnit !== item.roundingUnit &&
    document.activeElement?.id !== `${item.id}-roundingUnit`
  ) {
    setLocalRoundingUnit(item.roundingUnit);
  }

  // フィールド仕様の検証（useMemoを使用してレンダリング時に計算）
  const fieldSpecErrors = useMemo(() => {
    const validationErrors = validateQuantityItemFields({
      majorCategory: item.majorCategory,
      middleCategory: item.middleCategory,
      minorCategory: item.minorCategory,
      customCategory: item.customCategory,
      workType: item.workType,
      name: localName,
      specification: item.specification,
      unit: item.unit,
      remarks: item.remarks,
      adjustmentFactor: localAdjustmentFactor,
      roundingUnit: localRoundingUnit,
      quantity: localQuantity,
    });
    // ローカルエラーとマージ
    return { ...validationErrors, ...localFieldErrors };
  }, [
    item.majorCategory,
    item.middleCategory,
    item.minorCategory,
    item.customCategory,
    item.workType,
    item.specification,
    item.unit,
    item.remarks,
    localName,
    localAdjustmentFactor,
    localRoundingUnit,
    localQuantity,
    localFieldErrors,
  ]);

  // バリデーション変更を親に通知（副作用としてコールバックのみ実行）
  useEffect(() => {
    onValidationChange?.(item.id, {
      hasErrors:
        hasValidationErrors(fieldSpecErrors) ||
        !item.majorCategory ||
        !item.workType ||
        !localName ||
        !item.unit,
      errors: fieldSpecErrors,
    });
  }, [
    fieldSpecErrors,
    item.id,
    item.majorCategory,
    item.workType,
    item.unit,
    localName,
    onValidationChange,
  ]);

  // 負の値警告状態
  const negativeQuantityWarning = useMemo(
    () => localQuantity < 0 && item.calculationMethod === 'STANDARD',
    [localQuantity, item.calculationMethod]
  );

  // 調整係数警告状態
  const adjustmentFactorWarning = useMemo(
    () => localAdjustmentFactor <= 0,
    [localAdjustmentFactor]
  );

  // 丸め設定警告状態
  const roundingUnitWarning = useMemo(() => localRoundingUnit <= 0, [localRoundingUnit]);

  // 必須フィールドエラー
  const requiredErrors = useMemo((): Record<string, string | undefined> => {
    if (!showValidation) return {};
    const baseErrors = getRequiredFieldErrors(item);
    return {
      ...baseErrors,
      name: !localName?.trim() ? '名称は必須です' : undefined,
    };
  }, [item, showValidation, localName]);

  // 統合エラー（必須 + フィールド仕様）
  const errors = useMemo(() => {
    const combined: Record<string, string | undefined> = { ...requiredErrors };
    for (const [key, value] of Object.entries(fieldSpecErrors)) {
      if (value) {
        combined[key] = value;
      }
    }
    return combined;
  }, [requiredErrors, fieldSpecErrors]);

  /**
   * 名称フィールド変更ハンドラ
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalName(value);

    // リアルタイム文字数検証
    const result = validateTextLength(value, 'name');
    if (!result.isValid) {
      setLocalFieldErrors((prev) => ({ ...prev, name: result.error }));
    } else {
      setLocalFieldErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { name, ...rest } = prev;
        return rest;
      });
    }
  }, []);

  /**
   * 名称フィールドblurハンドラ
   */
  const handleNameBlur = useCallback(() => {
    const trimmedValue = localName?.trim() || '';
    if (trimmedValue && trimmedValue !== item.name) {
      onUpdate?.(item.id, { name: trimmedValue });
    }
  }, [localName, item.id, item.name, onUpdate]);

  /**
   * テキストフィールド更新ハンドラを生成（文字数検証付き）
   */
  const createTextUpdateHandler = useCallback(
    (field: TextFieldName) => (value: string) => {
      // 文字数検証
      const result = validateTextLength(value, field);
      if (!result.isValid) {
        setLocalFieldErrors((prev) => ({ ...prev, [field]: result.error }));
      } else {
        setLocalFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
      onUpdate?.(item.id, { [field]: value });
    },
    [item.id, onUpdate]
  );

  /**
   * 数量フィールド更新ハンドラ（範囲検証付き）
   */
  const handleQuantityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        setLocalQuantity(value);

        // 範囲検証
        const result = validateNumericRange(value, 'quantity');
        if (!result.isValid) {
          setLocalFieldErrors((prev) => ({ ...prev, quantity: result.error }));
        } else {
          setLocalFieldErrors((prev) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { quantity, ...rest } = prev;
            return rest;
          });
        }

        onUpdate?.(item.id, { quantity: value });
      }
    },
    [item.id, onUpdate]
  );

  /**
   * 計算方法変更ハンドラ
   */
  const handleCalculationMethodChange = useCallback(
    (method: CalculationMethod) => {
      const updates: Partial<QuantityItemDetail> = { calculationMethod: method };

      if (method !== 'STANDARD' && item.calculationParams) {
        try {
          const result = calculate({
            method,
            params: item.calculationParams,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationParams, item.adjustmentFactor, item.roundingUnit, onUpdate]
  );

  /**
   * 計算パラメータ変更ハンドラ
   */
  const handleCalculationParamsChange = useCallback(
    (params: CalculationParams) => {
      const updates: Partial<QuantityItemDetail> = { calculationParams: params };

      if (item.calculationMethod !== 'STANDARD') {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラー
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.adjustmentFactor, item.roundingUnit, onUpdate]
  );

  /**
   * 調整係数変更ハンドラ（範囲検証付き）
   */
  const handleAdjustmentFactorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        setLocalAdjustmentFactor(value);

        // 範囲検証
        const result = validateNumericRange(value, 'adjustmentFactor');
        if (!result.isValid) {
          setLocalFieldErrors((prev) => ({ ...prev, adjustmentFactor: result.error }));
        } else {
          setLocalFieldErrors((prev) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { adjustmentFactor, ...rest } = prev;
            return rest;
          });
        }

        const updates: Partial<QuantityItemDetail> = { adjustmentFactor: value };

        if (item.calculationMethod !== 'STANDARD' && item.calculationParams) {
          try {
            const calcResult = calculate({
              method: item.calculationMethod,
              params: item.calculationParams,
              adjustmentFactor: value,
              roundingUnit: item.roundingUnit,
            });
            updates.quantity = calcResult.finalValue;
          } catch {
            // 計算エラー
          }
        }

        onUpdate?.(item.id, updates);
      }
    },
    [item.id, item.calculationMethod, item.calculationParams, item.roundingUnit, onUpdate]
  );

  /**
   * 丸め設定変更ハンドラ（範囲検証付き）
   */
  const handleRoundingUnitChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        setLocalRoundingUnit(value);

        // 範囲検証
        const result = validateNumericRange(value, 'roundingUnit');
        if (!result.isValid) {
          setLocalFieldErrors((prev) => ({ ...prev, roundingUnit: result.error }));
        } else {
          setLocalFieldErrors((prev) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { roundingUnit, ...rest } = prev;
            return rest;
          });
        }

        const updates: Partial<QuantityItemDetail> = { roundingUnit: value };

        if (value > 0 && item.calculationMethod !== 'STANDARD' && item.calculationParams) {
          try {
            const calcResult = calculate({
              method: item.calculationMethod,
              params: item.calculationParams,
              adjustmentFactor: item.adjustmentFactor,
              roundingUnit: value,
            });
            updates.quantity = calcResult.finalValue;
          } catch {
            // 計算エラー
          }
        }

        onUpdate?.(item.id, updates);
      }
    },
    [item.id, item.calculationMethod, item.calculationParams, item.adjustmentFactor, onUpdate]
  );

  const handleDelete = useCallback(() => {
    onDelete?.(item.id);
  }, [item.id, onDelete]);

  const handleCopy = useCallback(() => {
    onCopy?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onCopy]);

  const handleMoveUp = useCallback(() => {
    onMoveUp?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onMoveUp]);

  const handleMoveDown = useCallback(() => {
    onMoveDown?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onMoveDown]);

  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // 中項目用の追加パラメータ
  const middleCategoryParams = useMemo(
    () => ({ majorCategory: item.majorCategory }),
    [item.majorCategory]
  );

  // 小項目用の追加パラメータ
  const minorCategoryParams = useMemo(
    () => ({
      majorCategory: item.majorCategory,
      middleCategory: item.middleCategory || '',
    }),
    [item.majorCategory, item.middleCategory]
  );

  return (
    <div
      style={styles.wrapper}
      data-testid="quantity-item-row"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          handleCloseMenu();
        }
      }}
    >
      <div style={styles.row} role="row">
        {/* 大項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-majorCategory`}
            label="大項目"
            value={item.majorCategory}
            onChange={createTextUpdateHandler('majorCategory')}
            endpoint="/api/autocomplete/major-categories"
            unsavedValues={unsavedMajorCategories}
            error={errors.majorCategory}
            required
            placeholder="大項目を入力"
          />
        </div>

        {/* 中項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-middleCategory`}
            label="中項目"
            value={item.middleCategory || ''}
            onChange={createTextUpdateHandler('middleCategory')}
            endpoint="/api/autocomplete/middle-categories"
            additionalParams={middleCategoryParams}
            unsavedValues={unsavedMiddleCategories}
            error={errors.middleCategory}
            placeholder="中項目を入力"
          />
        </div>

        {/* 小項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-minorCategory`}
            label="小項目"
            value={item.minorCategory || ''}
            onChange={createTextUpdateHandler('minorCategory')}
            endpoint="/api/autocomplete/minor-categories"
            additionalParams={minorCategoryParams}
            unsavedValues={unsavedMinorCategories}
            error={errors.minorCategory}
            placeholder="小項目を入力"
          />
        </div>

        {/* 任意分類 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-customCategory`}
            label="任意分類"
            value={item.customCategory || ''}
            onChange={createTextUpdateHandler('customCategory')}
            endpoint="/api/autocomplete/custom-categories"
            unsavedValues={unsavedCustomCategories}
            error={errors.customCategory}
            placeholder="任意分類を入力"
          />
        </div>

        {/* 工種 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-workType`}
            label="工種"
            value={item.workType}
            onChange={createTextUpdateHandler('workType')}
            endpoint="/api/autocomplete/work-types"
            unsavedValues={unsavedWorkTypes}
            error={errors.workType}
            required
            placeholder="工種を入力"
          />
        </div>

        {/* 名称 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-name`} style={styles.fieldLabel}>
              名称<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-name`}
                type="text"
                value={localName}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                style={{
                  ...styles.input,
                  ...(errors.name ? styles.inputError : {}),
                }}
                placeholder="名称を入力"
                aria-invalid={!!errors.name}
                aria-required
              />
            </div>
            {errors.name && <span style={styles.errorMessage}>{errors.name}</span>}
          </div>
        </div>

        {/* 規格 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-specification`}
            label="規格"
            value={item.specification || ''}
            onChange={createTextUpdateHandler('specification')}
            endpoint="/api/autocomplete/specifications"
            unsavedValues={unsavedSpecifications}
            error={errors.specification}
            placeholder="規格を入力"
          />
        </div>

        {/* 単位 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-unit`}
            label="単位"
            value={item.unit}
            onChange={createTextUpdateHandler('unit')}
            endpoint="/api/autocomplete/units"
            unsavedValues={unsavedUnits}
            error={errors.unit}
            required
            placeholder="単位"
          />
        </div>

        {/* 計算方法 */}
        <div style={styles.fieldGroup} role="cell">
          <CalculationMethodSelect
            id={`${item.id}-calculationMethod`}
            value={item.calculationMethod}
            onChange={handleCalculationMethodChange}
          />
        </div>

        {/* 調整係数 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-adjustmentFactor`} style={styles.fieldLabel}>
              調整係数
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-adjustmentFactor`}
                type="number"
                value={localAdjustmentFactor}
                onChange={handleAdjustmentFactorChange}
                className="hide-spinner"
                style={{
                  ...styles.input,
                  ...styles.quantityInput,
                  ...styles.numberInput,
                  ...(adjustmentFactorWarning || errors.adjustmentFactor
                    ? styles.inputWarning
                    : {}),
                }}
                step="0.01"
                aria-invalid={adjustmentFactorWarning || !!errors.adjustmentFactor}
              />
            </div>
            {errors.adjustmentFactor && (
              <span style={styles.errorMessage} role="alert">
                {errors.adjustmentFactor}
              </span>
            )}
            {!errors.adjustmentFactor && adjustmentFactorWarning && (
              <span style={styles.warningMessage} role="alert">
                0以下の値は使用できません。正の値を入力してください。
              </span>
            )}
          </div>
        </div>

        {/* 丸め設定 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-roundingUnit`} style={styles.fieldLabel}>
              丸め設定
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-roundingUnit`}
                type="number"
                value={localRoundingUnit}
                onChange={handleRoundingUnitChange}
                className="hide-spinner"
                style={{
                  ...styles.input,
                  ...styles.quantityInput,
                  ...styles.numberInput,
                  ...(roundingUnitWarning || errors.roundingUnit ? styles.inputWarning : {}),
                }}
                step="0.01"
                aria-invalid={roundingUnitWarning || !!errors.roundingUnit}
              />
            </div>
            {errors.roundingUnit && (
              <span style={styles.errorMessage} role="alert">
                {errors.roundingUnit}
              </span>
            )}
            {!errors.roundingUnit && roundingUnitWarning && (
              <span style={styles.warningMessage} role="alert">
                0以下の値は使用できません。正の値を入力してください。
              </span>
            )}
          </div>
        </div>

        {/* 数量 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-quantity`} style={styles.fieldLabel}>
              数量<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-quantity`}
                type="number"
                value={localQuantity}
                onChange={handleQuantityChange}
                className="hide-spinner"
                style={{
                  ...styles.input,
                  ...styles.quantityInput,
                  ...styles.numberInput,
                  ...(negativeQuantityWarning || errors.quantity ? styles.inputWarning : {}),
                }}
                step="0.01"
                aria-required
                aria-invalid={negativeQuantityWarning || !!errors.quantity}
              />
            </div>
            {errors.quantity && (
              <span style={styles.errorMessage} role="alert">
                {errors.quantity}
              </span>
            )}
            {!errors.quantity && negativeQuantityWarning && (
              <span style={styles.warningMessage} role="alert">
                負の値が入力されています。確認してください。
              </span>
            )}
          </div>
        </div>

        {/* 備考 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-remarks`} style={styles.fieldLabel}>
              備考
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-remarks`}
                type="text"
                value={item.remarks || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const result = validateTextLength(value, 'remarks');
                  if (!result.isValid) {
                    setLocalFieldErrors((prev) => ({ ...prev, remarks: result.error }));
                  } else {
                    setLocalFieldErrors((prev) => {
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      const { remarks, ...rest } = prev;
                      return rest;
                    });
                  }
                  onUpdate?.(item.id, { remarks: value });
                }}
                style={{
                  ...styles.input,
                  ...(errors.remarks ? styles.inputError : {}),
                }}
                placeholder="備考"
              />
            </div>
            {errors.remarks && <span style={styles.errorMessage}>{errors.remarks}</span>}
          </div>
        </div>

        {/* アクション */}
        <div style={styles.actionsCell} role="cell">
          <button
            type="button"
            style={{ ...styles.actionButton, ...styles.deleteButton }}
            onClick={handleDelete}
            aria-label="削除"
            title="削除"
          >
            <TrashIcon />
          </button>

          <div style={styles.menuWrapper}>
            <button
              type="button"
              style={styles.actionButton}
              onClick={handleToggleMenu}
              aria-label="アクション"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              <MoreIcon />
            </button>

            {isMenuOpen && (
              <div style={styles.menu} role="menu">
                <button type="button" style={styles.menuItem} onClick={handleCopy} role="menuitem">
                  <CopyIcon />
                  コピー
                </button>
                {canMoveUp && (
                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={handleMoveUp}
                    role="menuitem"
                  >
                    <span style={{ fontSize: '14px' }}>↑</span>
                    上に移動
                  </button>
                )}
                {canMoveDown && (
                  <button
                    type="button"
                    style={styles.menuItem}
                    onClick={handleMoveDown}
                    role="menuitem"
                  >
                    <span style={{ fontSize: '14px' }}>↓</span>
                    下に移動
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 計算用フィールド */}
      {item.calculationMethod !== 'STANDARD' && (
        <div style={styles.calculationFieldsRow}>
          <CalculationFields
            method={item.calculationMethod}
            params={item.calculationParams || {}}
            onChange={handleCalculationParamsChange}
          />
        </div>
      )}

      {/* スピナー非表示スタイル */}
      <style>
        {`
          .hide-spinner::-webkit-outer-spin-button,
          .hide-spinner::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}
      </style>
    </div>
  );
}
