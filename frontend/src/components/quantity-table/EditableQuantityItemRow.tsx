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

import { useState, useCallback, useMemo } from 'react';
import type { QuantityItemDetail, CalculationMethod } from '../../types/quantity-table.types';
import type { CalculationParams } from '../../types/quantity-edit.types';
import AutocompleteInput from './AutocompleteInput';
import CalculationMethodSelect from './CalculationMethodSelect';
import CalculationFields from './CalculationFields';

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
  /** バリデーション表示フラグ */
  showValidation?: boolean;
  /** 未保存の大項目リスト */
  unsavedMajorCategories?: string[];
  /** 未保存の中項目リスト */
  unsavedMiddleCategories?: string[];
  /** 未保存の小項目リスト */
  unsavedMinorCategories?: string[];
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
    gridTemplateColumns: '1fr 1fr 1fr 120px 120px 100px 80px 80px 80px 80px 120px 80px',
    gap: '8px',
    alignItems: 'start',
    padding: '12px 16px',
  } as React.CSSProperties,
  calculationFieldsRow: {
    padding: '0 16px 12px 16px',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#1f2937',
    backgroundColor: '#ffffff',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
  } as React.CSSProperties,
  quantityInput: {
    textAlign: 'right' as const,
  } as React.CSSProperties,
  actionsCell: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'flex-end',
    paddingTop: '4px',
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
  showValidation = false,
  unsavedMajorCategories = [],
  unsavedMiddleCategories = [],
  unsavedMinorCategories: _unsavedMinorCategories = [],
  unsavedWorkTypes = [],
  unsavedUnits = [],
  unsavedSpecifications = [],
}: EditableQuantityItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // バリデーションエラー
  const errors = useMemo(
    () => (showValidation ? getValidationErrors(item) : {}),
    [item, showValidation]
  );

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
   * 数量フィールド更新ハンドラ
   */
  const handleQuantityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
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
      onUpdate?.(item.id, { calculationMethod: method });
    },
    [item.id, onUpdate]
  );

  /**
   * 計算パラメータ変更ハンドラ
   */
  const handleCalculationParamsChange = useCallback(
    (params: CalculationParams) => {
      onUpdate?.(item.id, { calculationParams: params });
    },
    [item.id, onUpdate]
  );

  /**
   * 調整係数変更ハンドラ
   */
  const handleAdjustmentFactorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        onUpdate?.(item.id, { adjustmentFactor: value });
      }
    },
    [item.id, onUpdate]
  );

  /**
   * 丸め設定変更ハンドラ
   */
  const handleRoundingUnitChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value)) {
        onUpdate?.(item.id, { roundingUnit: value });
      }
    },
    [item.id, onUpdate]
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

  // Note: 小項目用の追加パラメータは将来の拡張で使用予定
  // const minorCategoryParams = useMemo(
  //   () => ({
  //     majorCategory: item.majorCategory,
  //     middleCategory: item.middleCategory || '',
  //   }),
  //   [item.majorCategory, item.middleCategory]
  // );

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
            onChange={createUpdateHandler('middleCategory')}
            endpoint="/api/autocomplete/middle-categories"
            additionalParams={middleCategoryParams}
            unsavedValues={unsavedMiddleCategories}
            placeholder="中項目を入力"
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
          <label
            htmlFor={`${item.id}-name`}
            style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}
          >
            名称<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
          </label>
          <input
            id={`${item.id}-name`}
            type="text"
            value={item.name}
            onChange={(e) => onUpdate?.(item.id, { name: e.target.value })}
            style={{
              ...styles.input,
              ...(errors.name ? styles.inputError : {}),
            }}
            placeholder="名称を入力"
            aria-invalid={!!errors.name}
            aria-required
          />
          {errors.name && <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.name}</span>}
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

        {/* 計算方法 */}
        <div style={styles.fieldGroup} role="cell">
          <CalculationMethodSelect
            id={`${item.id}-calculationMethod`}
            value={item.calculationMethod}
            onChange={handleCalculationMethodChange}
          />
        </div>

        {/* 数量 */}
        <div style={styles.fieldGroup} role="cell">
          <label
            htmlFor={`${item.id}-quantity`}
            style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}
          >
            数量<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
          </label>
          <input
            id={`${item.id}-quantity`}
            type="number"
            value={item.quantity}
            onChange={handleQuantityChange}
            style={{ ...styles.input, ...styles.quantityInput }}
            step="0.01"
            aria-required
          />
        </div>

        {/* 単位 */}
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

        {/* 調整係数 */}
        <div style={styles.fieldGroup} role="cell">
          <label
            htmlFor={`${item.id}-adjustmentFactor`}
            style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}
          >
            調整係数
          </label>
          <input
            id={`${item.id}-adjustmentFactor`}
            type="number"
            value={item.adjustmentFactor}
            onChange={handleAdjustmentFactorChange}
            style={{ ...styles.input, ...styles.quantityInput }}
            step="0.01"
          />
        </div>

        {/* 丸め設定 */}
        <div style={styles.fieldGroup} role="cell">
          <label
            htmlFor={`${item.id}-roundingUnit`}
            style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}
          >
            丸め設定
          </label>
          <input
            id={`${item.id}-roundingUnit`}
            type="number"
            value={item.roundingUnit}
            onChange={handleRoundingUnitChange}
            style={{ ...styles.input, ...styles.quantityInput }}
            step="0.01"
          />
        </div>

        {/* 備考 */}
        <div style={styles.fieldGroup} role="cell">
          <label
            htmlFor={`${item.id}-remarks`}
            style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}
          >
            備考
          </label>
          <input
            id={`${item.id}-remarks`}
            type="text"
            value={item.remarks || ''}
            onChange={(e) => onUpdate?.(item.id, { remarks: e.target.value })}
            style={styles.input}
            placeholder="備考"
          />
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 計算用フィールド（面積・体積またはピッチモード時のみ表示） */}
      {item.calculationMethod !== 'STANDARD' && (
        <div style={styles.calculationFieldsRow}>
          <CalculationFields
            method={item.calculationMethod}
            params={item.calculationParams || {}}
            onChange={handleCalculationParamsChange}
          />
        </div>
      )}
    </div>
  );
}
