/**
 * @fileoverview 計算用フィールドコンポーネント
 *
 * Task 6.2: 計算用フィールドコンポーネントを実装する
 *
 * Requirements:
 * - 8.5: 「面積・体積」モードで計算用列として「幅（W）」「奥行き（D）」「高さ（H）」「重量」入力フィールドを表示する
 * - 8.6: 「面積・体積」モードで計算用列に1つ以上の値が入力される場合、入力された項目のみを掛け算して計算結果を数量として自動設定する
 * - 8.8: 「ピッチ」モードで計算用列として「範囲長」「端長1」「端長2」「ピッチ長」「長さ」「重量」入力フィールドを表示する
 * - 8.9: 「ピッチ」モードで必須項目（範囲長・端長1・端長2・ピッチ長）に値が入力される場合、ピッチ計算式に基づいて本数を算出する
 * - 8.11: 計算用列の値変更時に数量を自動再計算する
 */

import { useCallback, useId, useState } from 'react';
import type { CalculationMethod, CalculationParams } from '../../types/quantity-edit.types';
import type { AreaVolumeParams, PitchParams } from '../../utils/calculation-engine';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CalculationFieldsコンポーネントのProps
 */
export interface CalculationFieldsProps {
  /** 計算方法 */
  method: CalculationMethod;
  /** 計算パラメータ */
  params: CalculationParams;
  /** パラメータ変更時のコールバック */
  onChange: (params: CalculationParams) => void;
  /** 無効化状態 */
  disabled?: boolean;
}

/**
 * フィールド定義
 */
interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  step?: number;
}

// ============================================================================
// 定数
// ============================================================================

/**
 * 面積・体積モードのフィールド定義
 */
const AREA_VOLUME_FIELDS: FieldDefinition[] = [
  { key: 'width', label: '幅（W）', step: 0.01 },
  { key: 'depth', label: '奥行き（D）', step: 0.01 },
  { key: 'height', label: '高さ（H）', step: 0.01 },
  { key: 'weight', label: '重量', step: 0.01 },
];

/**
 * ピッチモードのフィールド定義
 */
const PITCH_FIELDS: FieldDefinition[] = [
  { key: 'rangeLength', label: '範囲長', required: true, step: 0.01 },
  { key: 'endLength1', label: '端長1', required: true, step: 0.01 },
  { key: 'endLength2', label: '端長2', required: true, step: 0.01 },
  { key: 'pitchLength', label: 'ピッチ長', required: true, step: 0.01 },
  { key: 'length', label: '長さ', step: 0.01 },
  { key: 'weight', label: '重量', step: 0.01 },
];

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as React.CSSProperties,
  fieldsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
    gap: '4px',
  } as React.CSSProperties,
  fieldWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    whiteSpace: 'nowrap' as const,
    height: '14px',
    lineHeight: '14px',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    fontSize: '11px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    height: '22px',
    padding: '0 4px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '0px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
    MozAppearance: 'textfield' as const,
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  standardMessage: {
    padding: '4px 8px',
    backgroundColor: '#f3f4f6',
    borderRadius: '0px',
    fontSize: '12px',
    color: '#4b5563',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 数値入力フィールド
 * REQ-14.3: 数値入力時は小数2桁で表示
 * REQ-14.4: 空白時は空白のまま表示
 */
interface NumberInputFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled: boolean;
  required?: boolean;
  step?: number;
}

function NumberInputField({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
}: NumberInputFieldProps) {
  // REQ-14.3/14.4: ローカル状態で表示値を管理
  const [localValue, setLocalValue] = useState<string>(value !== undefined ? value.toFixed(2) : '');
  // 前回のprops値を追跡（公式ドキュメント推奨パターン）
  const [prevValue, setPrevValue] = useState(value);

  // 親の値が変更された場合、レンダリング中にローカル状態を同期
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(value !== undefined ? value.toFixed(2) : '');
  }

  // 入力中はそのままの値を保持
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  // blur時に小数2桁でフォーマットして親に通知
  const handleBlur = useCallback(() => {
    const trimmedValue = localValue.trim();
    if (trimmedValue === '') {
      // REQ-14.4: 空白時は空白のまま
      onChange(undefined);
    } else {
      const numValue = parseFloat(trimmedValue);
      if (!isNaN(numValue)) {
        // REQ-14.3: 数値入力時は小数2桁で表示
        setLocalValue(numValue.toFixed(2));
        onChange(numValue);
      } else {
        // 無効な値の場合はクリア
        setLocalValue('');
        onChange(undefined);
      }
    }
  }, [localValue, onChange]);

  return (
    <div style={styles.fieldWrapper}>
      <label htmlFor={id} style={styles.label}>
        {label}
        {required && <span style={styles.requiredMark}>*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="hide-spinner"
        style={{
          ...styles.input,
          textAlign: 'right',
          ...(disabled ? styles.inputDisabled : {}),
        }}
        aria-required={required}
      />
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

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 計算用フィールドコンポーネント
 *
 * 計算方法に応じた入力フィールドを表示する。
 * - 標準モード: メッセージのみ表示
 * - 面積・体積モード: 幅、奥行き、高さ、重量の4フィールド
 * - ピッチモード: 範囲長、端長1、端長2、ピッチ長、長さ、重量の6フィールド
 */
export default function CalculationFields({
  method,
  params,
  onChange,
  disabled = false,
}: CalculationFieldsProps) {
  const idPrefix = useId();

  /**
   * フィールド値変更ハンドラ
   */
  const handleFieldChange = useCallback(
    (fieldKey: string, value: number | undefined) => {
      const newParams = { ...params, [fieldKey]: value };
      onChange(newParams);
    },
    [params, onChange]
  );

  // 標準モードの場合
  if (method === 'STANDARD') {
    return (
      <div style={styles.container}>
        <div style={styles.standardMessage}>直接数量を入力してください</div>
      </div>
    );
  }

  // 計算方法に応じたフィールド定義を取得
  const fields = method === 'AREA_VOLUME' ? AREA_VOLUME_FIELDS : PITCH_FIELDS;

  // パラメータを取得（型アサーション）
  const currentParams = (params ?? {}) as AreaVolumeParams | PitchParams;

  return (
    <div style={styles.container}>
      <div style={styles.fieldsGrid}>
        {fields.map((field) => (
          <NumberInputField
            key={field.key}
            id={`${idPrefix}-${field.key}`}
            label={field.label}
            value={(currentParams as Record<string, number | undefined>)[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
            disabled={disabled}
            required={field.required}
            step={field.step}
          />
        ))}
      </div>
    </div>
  );
}
