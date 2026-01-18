/**
 * @fileoverview 編集可能な数量項目行コンポーネント
 *
 * Task 7.2: 各フィールドにオートコンプリートを適用する
 *
 * Requirements:
 * - 7.1: 大項目フィールドで入力するとオートコンプリート候補を表示
 * - 7.2: 中項目フィールドで大項目に紐づく候補を表示
 * - 7.3: 小項目フィールドで大項目・中項目に紐づく候補を表示
 * - 7.4: 候補選択時の自動入力
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { QuantityItemDetail, CalculationMethod } from '../../types/quantity-table.types';
import type { CalculationParams } from '../../types/quantity-edit.types';
import AutocompleteInput from './AutocompleteInput';
import CalculationMethodSelect from './CalculationMethodSelect';
import CalculationFields from './CalculationFields';
import { calculate } from '../../utils/calculation-engine';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EditableQuantityItemRowコンポーネントのProps
 */
export interface EditableQuantityItemRowProps {
  /** 項目データ */
  item: QuantityItemDetail;
  /** 項目更新コールバック */
  onUpdate?: (itemId: string, updates: Partial<QuantityItemDetail>) => void;
  /** 項目削除コールバック */
  onDelete?: (itemId: string) => void;
  /** 項目コピーコールバック */
  onCopy?: (itemId: string) => void;
  /** 項目を上に移動するコールバック（REQ-6.3） */
  onMoveUp?: (itemId: string) => void;
  /** 項目を下に移動するコールバック（REQ-6.3） */
  onMoveDown?: (itemId: string) => void;
  /** 上に移動可能かどうか */
  canMoveUp?: boolean;
  /** 下に移動可能かどうか */
  canMoveDown?: boolean;
  /** バリデーション表示フラグ */
  showValidation?: boolean;
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
    // 要件順: 大項目・中項目・小項目・任意分類・工種・名称・規格・計算方法・数量・単位・備考・アクション
    // ※調整係数・丸め設定は面積・体積/ピッチ選択時のみ計算用フィールドエリアに表示
    // フィールド幅: 大項目5.5全角(76px)・中項目5.5全角(76px)・小項目5.5全角(76px)・任意分類5.5全角(76px)・工種6.5全角(88px)・
    // 名称15.5全角(202px)・規格15.5全角(202px)・計算方法(90px)・数量10半角(80px)・単位3全角(46px)・備考5.5全角(76px)・アクション(80px)
    gridTemplateColumns: '76px 76px 76px 76px 88px 202px 202px 90px 80px 46px 76px 80px',
    gap: '2px',
    alignItems: 'start',
    padding: '2px 4px',
  } as React.CSSProperties,
  calculationFieldsRow: {
    padding: '0 4px 4px 4px',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  fieldGroup: {
    // グリッドセルとしてのラッパー（内部レイアウトは各コンポーネントが担当）
  } as React.CSSProperties,
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
  quantityInput: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  numberInput: {
    // スピナー（上下ボタン）を非表示にする
    MozAppearance: 'textfield' as const,
    WebkitAppearance: 'textfield',
  } as React.CSSProperties,
  actionsCell: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'flex-start',
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

/**
 * 削除アイコン
 */
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

/**
 * 三点メニューアイコン
 */
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

/**
 * コピーアイコン
 */
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
function getValidationErrors(item: QuantityItemDetail): Record<string, string | undefined> {
  // 大項目は任意のためバリデーション不要
  return {
    workType: item.workType ? undefined : '工種は必須です',
    name: item.name ? undefined : '名称は必須です',
    unit: item.unit ? undefined : '単位は必須です',
  };
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 編集可能な数量項目行
 *
 * 各フィールドをオートコンプリート対応の入力フィールドとして表示し、
 * 編集・削除・コピー機能を提供する。
 *
 * @param props - コンポーネントProps
 */
export default function EditableQuantityItemRow({
  item,
  onUpdate,
  onDelete,
  onCopy,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  showValidation = true,
  unsavedMajorCategories = [],
  unsavedMiddleCategories = [],
  unsavedMinorCategories = [],
  unsavedCustomCategories = [],
  unsavedWorkTypes = [],
  unsavedUnits = [],
  unsavedSpecifications = [],
}: EditableQuantityItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // 名称フィールドのローカル状態（REQ-5.3: blur時にバリデーション）
  const [localName, setLocalName] = useState(item.name);
  // REQ-8.3: 数量フィールドのローカル状態（入力時に即座に警告を表示するため）
  // REQ-14.2: 小数2桁で常時表示（文字列として保持）
  const [localQuantity, setLocalQuantity] = useState(item.quantity.toFixed(2));

  // 親の値が変更された場合、ローカル状態を同期
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 親からの同期のため必要
    setLocalName(item.name);
  }, [item.name]);

  // 親の数量値が変更された場合、ローカル状態を同期（REQ-14.2: 小数2桁で表示）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 親からの同期のため必要
    setLocalQuantity(item.quantity.toFixed(2));
  }, [item.quantity]);

  // REQ-8.3: 負の値警告状態（ローカル状態から派生計算 - 入力時に即座に警告）
  const negativeQuantityWarning = useMemo(
    () => parseFloat(localQuantity) < 0 && item.calculationMethod === 'STANDARD',
    [localQuantity, item.calculationMethod]
  );

  // バリデーションエラー（名称はローカル状態でチェック）
  const errors = useMemo((): Record<string, string | undefined> => {
    if (!showValidation) return {};
    const baseErrors = getValidationErrors(item);
    // 名称はローカル値でチェック（blur時にリアルタイムでエラー表示）
    return {
      ...baseErrors,
      name: !localName?.trim() ? '名称は必須です' : undefined,
    };
  }, [item, showValidation, localName]);

  /**
   * 名称フィールド変更ハンドラ（ローカル状態のみ更新）
   * REQ-5.3: blur時にバリデーションを実行
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  }, []);

  /**
   * 名称フィールドblurハンドラ（バリデーション後にAPI呼び出し）
   * REQ-5.3: 必須フィールド未入力時にエラーメッセージを表示
   */
  const handleNameBlur = useCallback(() => {
    const trimmedValue = localName?.trim() || '';
    // 有効な値の場合のみAPIを呼び出し
    if (trimmedValue && trimmedValue !== item.name) {
      onUpdate?.(item.id, { name: trimmedValue });
    }
    // 空の場合はローカル状態を維持し、エラーを表示（APIは呼ばない）
  }, [localName, item.id, item.name, onUpdate]);

  /**
   * フィールド更新ハンドラを生成
   */
  const createUpdateHandler = useCallback(
    (field: keyof QuantityItemDetail) => (value: string) => {
      onUpdate?.(item.id, { [field]: value });
    },
    [item.id, onUpdate]
  );

  /**
   * 数量フィールド更新ハンドラ（入力中）
   * REQ-8.3: 負の値が入力された場合は警告を表示（ローカル状態で即座に警告）
   */
  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // 入力中はそのままの値を保持（フォーマットしない）
    setLocalQuantity(e.target.value);
  }, []);

  /**
   * 数量フィールドblurハンドラ
   * REQ-14.2: blur時に小数2桁でフォーマット
   * REQ-15.2: 空入力時は0を設定
   */
  const handleQuantityBlur = useCallback(() => {
    let value = parseFloat(localQuantity);
    // REQ-15.2: 空または無効な値の場合は0を設定
    if (isNaN(value) || localQuantity.trim() === '') {
      value = 0;
    }
    // REQ-14.2: 小数2桁でフォーマット
    const formattedValue = value.toFixed(2);
    setLocalQuantity(formattedValue);
    // APIを呼び出し
    onUpdate?.(item.id, { quantity: value });
  }, [localQuantity, item.id, onUpdate]);

  /**
   * 計算方法変更ハンドラ
   * REQ-8.1: 計算方法を変更時、既存のパラメータで再計算を実行
   */
  const handleCalculationMethodChange = useCallback(
    (method: CalculationMethod) => {
      const updates: Partial<QuantityItemDetail> = { calculationMethod: method };

      // 面積・体積またはピッチモードに変更し、既存パラメータがある場合は再計算
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
   * REQ-8.6: 面積・体積モードで計算用列に値が入力されると数量を自動計算
   * REQ-8.9: ピッチモードで必須項目が入力されると本数を自動計算
   */
  const handleCalculationParamsChange = useCallback(
    (params: CalculationParams) => {
      // 計算パラメータを更新
      const updates: Partial<QuantityItemDetail> = { calculationParams: params };

      // 面積・体積またはピッチモードの場合、計算を実行して数量を自動更新
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
          // 計算エラーの場合は数量を更新しない（例：ピッチ長が0の場合）
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.adjustmentFactor, item.roundingUnit, onUpdate]
  );

  /**
   * 調整係数更新ハンドラ（CalculationFieldsから呼ばれる）
   * REQ-9.2: 調整係数が変更されると計算結果に乗算した値を数量として設定
   */
  const handleAdjustmentFactorUpdate = useCallback(
    (value: number) => {
      const updates: Partial<QuantityItemDetail> = { adjustmentFactor: value };

      // 面積・体積またはピッチモードの場合、再計算を実行
      if (item.calculationMethod !== 'STANDARD' && item.calculationParams) {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params: item.calculationParams,
            adjustmentFactor: value,
            roundingUnit: item.roundingUnit,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.calculationParams, item.roundingUnit, onUpdate]
  );

  /**
   * 丸め設定更新ハンドラ（CalculationFieldsから呼ばれる）
   * REQ-10.2: 丸め設定が変更されると調整係数適用後の値を切り上げた値を最終数量として設定
   */
  const handleRoundingUnitUpdate = useCallback(
    (value: number) => {
      const updates: Partial<QuantityItemDetail> = { roundingUnit: value };

      // 面積・体積またはピッチモードの場合、正の値でのみ再計算を実行
      if (value > 0 && item.calculationMethod !== 'STANDARD' && item.calculationParams) {
        try {
          const result = calculate({
            method: item.calculationMethod,
            params: item.calculationParams,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: value,
          });
          updates.quantity = result.finalValue;
        } catch {
          // 計算エラーの場合は数量を更新しない
        }
      }

      onUpdate?.(item.id, updates);
    },
    [item.id, item.calculationMethod, item.calculationParams, item.adjustmentFactor, onUpdate]
  );

  /**
   * 削除ハンドラ
   */
  const handleDelete = useCallback(() => {
    onDelete?.(item.id);
  }, [item.id, onDelete]);

  /**
   * コピーハンドラ
   */
  const handleCopy = useCallback(() => {
    onCopy?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onCopy]);

  /**
   * 上に移動ハンドラ（REQ-6.3）
   */
  const handleMoveUp = useCallback(() => {
    onMoveUp?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onMoveUp]);

  /**
   * 下に移動ハンドラ（REQ-6.3）
   */
  const handleMoveDown = useCallback(() => {
    onMoveDown?.(item.id);
    setIsMenuOpen(false);
  }, [item.id, onMoveDown]);

  /**
   * メニュー開閉を切り替え
   */
  const handleToggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  /**
   * メニューを閉じる
   */
  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // 中項目用の追加パラメータ（大項目でフィルタ）
  const middleCategoryParams = useMemo(
    () => ({ majorCategory: item.majorCategory }),
    [item.majorCategory]
  );

  // 小項目用の追加パラメータ（大項目・中項目でフィルタ）
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
            onChange={createUpdateHandler('majorCategory')}
            endpoint="/api/autocomplete/major-categories"
            unsavedValues={unsavedMajorCategories}
            error={errors.majorCategory}
            placeholder="大項目を入力"
          />
        </div>

        {/* 中項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-middleCategory`}
            label="中項目"
            value={item.middleCategory || ''}
            onChange={createUpdateHandler('middleCategory')}
            endpoint="/api/autocomplete/middle-categories"
            additionalParams={middleCategoryParams}
            unsavedValues={unsavedMiddleCategories}
            placeholder="中項目を入力"
          />
        </div>

        {/* 小項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-minorCategory`}
            label="小項目"
            value={item.minorCategory || ''}
            onChange={createUpdateHandler('minorCategory')}
            endpoint="/api/autocomplete/minor-categories"
            additionalParams={minorCategoryParams}
            unsavedValues={unsavedMinorCategories}
            placeholder="小項目を入力"
          />
        </div>

        {/* 任意分類 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-customCategory`}
            label="任意分類"
            value={item.customCategory || ''}
            onChange={createUpdateHandler('customCategory')}
            endpoint="/api/autocomplete/custom-categories"
            unsavedValues={unsavedCustomCategories}
            placeholder="任意分類を入力"
          />
        </div>

        {/* 工種 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-workType`}
            label="工種"
            value={item.workType}
            onChange={createUpdateHandler('workType')}
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
            {errors.name && (
              <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.name}</span>
            )}
          </div>
        </div>

        {/* 規格 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-specification`}
            label="規格"
            value={item.specification || ''}
            onChange={createUpdateHandler('specification')}
            endpoint="/api/autocomplete/specifications"
            unsavedValues={unsavedSpecifications}
            placeholder="規格を入力"
          />
        </div>

        {/* 計算方法 - 要件順序: 規格の次 */}
        <div style={styles.fieldGroup} role="cell">
          <CalculationMethodSelect
            id={`${item.id}-calculationMethod`}
            value={item.calculationMethod}
            onChange={handleCalculationMethodChange}
          />
        </div>

        {/* 数量 - 要件順序: 計算方法の次 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            <label htmlFor={`${item.id}-quantity`} style={styles.fieldLabel}>
              数量<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <input
                id={`${item.id}-quantity`}
                type="text"
                inputMode="decimal"
                value={localQuantity}
                onChange={handleQuantityChange}
                onBlur={handleQuantityBlur}
                className="hide-spinner"
                style={{
                  ...styles.input,
                  ...styles.quantityInput,
                  ...styles.numberInput,
                  ...(negativeQuantityWarning ? styles.inputWarning : {}),
                }}
                aria-required
                aria-invalid={negativeQuantityWarning}
              />
            </div>
            {/* REQ-8.3: 負の値警告メッセージ */}
            {negativeQuantityWarning && (
              <span style={styles.warningMessage} role="alert">
                負の値が入力されています。確認してください。
              </span>
            )}
          </div>
        </div>

        {/* 単位 - 要件順序: 数量の次 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-unit`}
            label="単位"
            value={item.unit}
            onChange={createUpdateHandler('unit')}
            endpoint="/api/autocomplete/units"
            unsavedValues={unsavedUnits}
            error={errors.unit}
            required
            placeholder="単位"
          />
        </div>

        {/* 備考 - 要件順序: 単位の次 */}
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
                onChange={(e) => onUpdate?.(item.id, { remarks: e.target.value })}
                style={styles.input}
                placeholder="備考"
              />
            </div>
          </div>
        </div>

        {/* アクション */}
        <div style={styles.actionsCell} role="cell">
          {/* 削除ボタン */}
          <button
            type="button"
            style={{ ...styles.actionButton, ...styles.deleteButton }}
            onClick={handleDelete}
            aria-label="削除"
            title="削除"
          >
            <TrashIcon />
          </button>

          {/* アクションメニュー */}
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

      {/* 計算用フィールド（面積・体積またはピッチモード時のみ表示） */}
      {/* REQ-9, REQ-10: 調整係数・丸め設定も計算用フィールドエリアに表示 */}
      {item.calculationMethod !== 'STANDARD' && (
        <div style={styles.calculationFieldsRow}>
          <CalculationFields
            method={item.calculationMethod}
            params={item.calculationParams || {}}
            onChange={handleCalculationParamsChange}
            adjustmentFactor={item.adjustmentFactor}
            onAdjustmentFactorChange={handleAdjustmentFactorUpdate}
            roundingUnit={item.roundingUnit}
            onRoundingUnitChange={handleRoundingUnitUpdate}
          />
        </div>
      )}

      {/* 数値入力フィールドのスピナーを非表示にするスタイル */}
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
