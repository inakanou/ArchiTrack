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
import type { AutocompleteFieldName } from '../../hooks/useAutocompleteCandidateStore';
import CalculationMethodSelect from './CalculationMethodSelect';
import CalculationFields from './CalculationFields';
import QuantityItemActionMenu from './QuantityItemActionMenu';
import FieldValidationTooltip from './FieldValidationTooltip';
import { calculate } from '../../utils/calculation-engine';
import { QUANTITY_ITEM_GRID_COLUMNS } from './gridConstants';

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
  /** オートコンプリート候補取得関数（Task 18.1: 必須） */
  getSuggestions: (field: AutocompleteFieldName, inputText: string) => string[];
  /** オートコンプリートblur時候補追加関数（Task 18.1: 必須） */
  onBlurAddCandidate: (field: AutocompleteFieldName, value: string) => void;
  /**
   * メインフィールドのラベル表示フラグ（Task 23.2: REQ-18.2, 18.3, 18.4）
   * false の場合、大項目〜備考のフィールドラベルを非表示にする。
   * 計算用フィールド（面積・体積/ピッチ）のタイトル行は影響を受けない。
   * @default true（後方互換性のため）
   */
  showFieldLabels?: boolean;
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
    gridTemplateColumns: QUANTITY_ITEM_GRID_COLUMNS,
    gap: '2px',
    // Task 51.1 Spike: 既存と同じ 'start' を維持（既存セルのラベル＋入力の縦配置を壊さないため）。
    // 操作列セル内の inline 配置は actionCellInlineWrapper の flex-direction: row + align-items: center で行う
    alignItems: 'start',
    padding: '2px 4px',
  } as React.CSSProperties,
  // Task 51.1 Spike / Task 51.2: 採用案（操作列セル wrapper 拡張）
  // 操作列セル内に flex wrapper を新設し、アクションメニュー + CalculationFields を横並び配置する。
  // Task 51.2: whiteSpace: nowrap で計算用フィールド群が行内幅不足で折り返さないようにし、
  // 行高さ 37px を維持する（REQ-37.1 同一行水平配置 / REQ-37.3 行高さ不変）。
  // overflow は指定しない（visible 既定を維持）。表領域 overflow はページ全体スクロールに委ねる
  // （REQ-37.6 / design.md L1519）。
  actionCellInlineWrapper: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    // Grid の操作列セル幅(80px)を超えて右側に展開できるように flex-shrink を抑止
    flexShrink: 0,
    // 計算用フィールド群が折り返さないこと（REQ-37.1 同一行配置）を構造で保証
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  // Task 51.1 Spike / Task 51.2: 操作列セル内に inline 配置した CalculationFields は折り返さない
  inlineCalculationFields: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    // フィールド間（label + input ペアの並び）でも折り返さない
    whiteSpace: 'nowrap' as const,
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
    // 入力欄右端の警告アイコンと入力文字が重ならないよう余白を確保
    paddingRight: '22px',
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
    alignItems: 'center',
    height: '22px',
  } as React.CSSProperties,
  actionsCellWithLabel: {
    marginTop: '15px',
  } as React.CSSProperties,
};

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
  getSuggestions,
  onBlurAddCandidate,
  showFieldLabels = true,
}: EditableQuantityItemRowProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // REQ-8.3: 数量フィールドのローカル状態（入力時に即座に警告を表示するため）
  // REQ-14.2: 小数2桁で常時表示（文字列として保持）
  const [localQuantity, setLocalQuantity] = useState(item.quantity.toFixed(2));

  // 親の数量値が変更された場合、ローカル状態を同期（REQ-14.2: 小数2桁で表示）
  useEffect(() => {
    setLocalQuantity(item.quantity.toFixed(2));
  }, [item.quantity]);

  // REQ-8.3: 負の値警告状態（ローカル状態から派生計算 - 入力時に即座に警告）
  const negativeQuantityWarning = useMemo(
    () => parseFloat(localQuantity) < 0 && item.calculationMethod === 'STANDARD',
    [localQuantity, item.calculationMethod]
  );

  // バリデーションエラー
  const errors = useMemo((): Record<string, string | undefined> => {
    if (!showValidation) return {};
    const baseErrors = getValidationErrors(item);
    return {
      ...baseErrors,
      name: !item.name?.trim() ? '名称は必須です' : undefined,
    };
  }, [item, showValidation]);

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
            label={showFieldLabels ? '大項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '大項目'}
            value={item.majorCategory}
            onChange={createUpdateHandler('majorCategory')}
            error={errors.majorCategory}
            placeholder="大項目を入力"
            field="majorCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 中項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-middleCategory`}
            label={showFieldLabels ? '中項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '中項目'}
            value={item.middleCategory || ''}
            onChange={createUpdateHandler('middleCategory')}
            placeholder="中項目を入力"
            field="middleCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 小項目 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-minorCategory`}
            label={showFieldLabels ? '小項目' : undefined}
            ariaLabel={showFieldLabels ? undefined : '小項目'}
            value={item.minorCategory || ''}
            onChange={createUpdateHandler('minorCategory')}
            placeholder="小項目を入力"
            field="minorCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 任意分類 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-customCategory`}
            label={showFieldLabels ? '任意分類' : undefined}
            ariaLabel={showFieldLabels ? undefined : '任意分類'}
            value={item.customCategory || ''}
            onChange={createUpdateHandler('customCategory')}
            placeholder="任意分類を入力"
            field="customCategory"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 工種 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-workType`}
            label={showFieldLabels ? '工種' : undefined}
            ariaLabel={showFieldLabels ? undefined : '工種'}
            value={item.workType}
            onChange={createUpdateHandler('workType')}
            error={errors.workType}
            required
            placeholder="工種を入力"
            field="workType"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 名称 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-name`}
            label={showFieldLabels ? '名称' : undefined}
            ariaLabel={showFieldLabels ? undefined : '名称'}
            value={item.name}
            onChange={createUpdateHandler('name')}
            error={errors.name}
            required
            placeholder="名称を入力"
            field="name"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 規格 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-specification`}
            label={showFieldLabels ? '規格' : undefined}
            ariaLabel={showFieldLabels ? undefined : '規格'}
            value={item.specification || ''}
            onChange={createUpdateHandler('specification')}
            placeholder="規格を入力"
            field="specification"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 計算方法 - 要件順序: 規格の次 */}
        <div style={styles.fieldGroup} role="cell">
          <CalculationMethodSelect
            id={`${item.id}-calculationMethod`}
            value={item.calculationMethod}
            onChange={handleCalculationMethodChange}
            showLabel={showFieldLabels}
          />
        </div>

        {/* 数量 - 要件順序: 計算方法の次 */}
        <div style={styles.fieldGroup} role="cell">
          <div style={styles.directInputContainer}>
            {showFieldLabels && (
              <label htmlFor={`${item.id}-quantity`} style={styles.fieldLabel}>
                数量<span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
              </label>
            )}
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
                aria-describedby={
                  negativeQuantityWarning ? `${item.id}-quantity-warning` : undefined
                }
                aria-label={showFieldLabels ? undefined : '数量'}
              />
              {/* REQ-8.3: 負の値警告（黄枠＋アイコン＋ホバー吹き出し）。
                  通常フローにメッセージを挿入しないため行の高さが変わらない。 */}
              {negativeQuantityWarning && (
                <FieldValidationTooltip
                  message="負の値が入力されています。確認してください。"
                  id={`${item.id}-quantity-warning`}
                  severity="warning"
                />
              )}
            </div>
          </div>
        </div>

        {/* 単位 - 要件順序: 数量の次 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-unit`}
            label={showFieldLabels ? '単位' : undefined}
            ariaLabel={showFieldLabels ? undefined : '単位'}
            value={item.unit}
            onChange={createUpdateHandler('unit')}
            error={errors.unit}
            required
            placeholder="単位"
            field="unit"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/* 備考 - 要件順序: 単位の次 */}
        <div style={styles.fieldGroup} role="cell">
          <AutocompleteInput
            id={`${item.id}-remarks`}
            label={showFieldLabels ? '備考' : undefined}
            ariaLabel={showFieldLabels ? undefined : '備考'}
            value={item.remarks || ''}
            onChange={createUpdateHandler('remarks')}
            placeholder="備考"
            field="remarks"
            getSuggestions={getSuggestions}
            onBlurAddCandidate={onBlurAddCandidate}
          />
        </div>

        {/*
          アクション（REQ-36: アクションメニューに統合）+ 計算用フィールド inline 配置（REQ-37 / Task 51.1 Spike 採用案）
          操作列セル内に wrapper div を新設し、アクションメニューと CalculationFields を横並び配置する。
          計算用フィールド群は flex-shrink: 0 により右側へ inline 展開され、ビューポートを超える場合は
          ページ全体（REQ-25）の水平スクロールで閲覧する。
        */}
        <div
          style={{
            ...styles.actionsCell,
            ...(showFieldLabels ? styles.actionsCellWithLabel : {}),
          }}
          role="cell"
        >
          <div data-testid="action-cell-inline-wrapper" style={styles.actionCellInlineWrapper}>
            <QuantityItemActionMenu
              isOpen={isMenuOpen}
              onToggle={handleToggleMenu}
              onClose={handleCloseMenu}
              onMoveUp={() => onMoveUp?.(item.id)}
              onMoveDown={() => onMoveDown?.(item.id)}
              onCopy={() => {
                onCopy?.(item.id);
              }}
              onDelete={() => {
                onDelete?.(item.id);
              }}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
            />
            {/* 計算用フィールド（面積・体積またはピッチモード時のみ表示） */}
            {/* REQ-9, REQ-10: 調整係数・丸め設定も計算用フィールドエリアに表示 */}
            {item.calculationMethod !== 'STANDARD' && (
              <div style={styles.inlineCalculationFields}>
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
          </div>
        </div>
      </div>

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
