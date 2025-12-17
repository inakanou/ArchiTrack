/**
 * @fileoverview 寸法値入力コンポーネント
 *
 * Task 14.2: 寸法値入力機能を実装する
 *
 * 寸法線描画後のテキストフィールド表示、数値と単位の入力、
 * 寸法線上への値表示を行うコンポーネントです。
 *
 * Requirements:
 * - 6.2: 寸法線が描画されると寸法値入力用のテキストフィールドを表示する
 * - 6.3: ユーザーが寸法値を入力すると寸法線上に数値とオプションの単位を表示する
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 位置を表すポイント
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * DimensionValueInputのProps
 */
export interface DimensionValueInputProps {
  /** 表示位置 */
  position: Position;
  /** 初期寸法値 */
  initialValue: string;
  /** 初期単位 */
  initialUnit: string;
  /** 確定時のコールバック */
  onConfirm: (value: string, unit: string) => void;
  /** キャンセル時のコールバック */
  onCancel: () => void;
}

/**
 * 利用可能な単位の定義
 */
const UNIT_OPTIONS = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'm', label: 'm' },
];

// ============================================================================
// スタイル定義
// ============================================================================

const STYLES = {
  container: {
    position: 'absolute' as const,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    padding: '12px',
    zIndex: 100,
    minWidth: '180px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
  },
  input: {
    width: '80px',
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
  },
  select: {
    padding: '6px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '8px',
  },
  button: {
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  },
  confirmButton: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
  },
  srOnly: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap' as const,
    border: 0,
  },
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 寸法値入力コンポーネント
 *
 * 寸法線描画後に表示され、寸法値と単位を入力するためのポップアップUIです。
 *
 * @param props - コンポーネントのプロパティ
 * @returns 寸法値入力コンポーネント
 */
function DimensionValueInput({
  position,
  initialValue,
  initialUnit,
  onConfirm,
  onCancel,
}: DimensionValueInputProps): React.JSX.Element {
  // 状態管理
  const [value, setValue] = useState<string>(initialValue);
  const [unit, setUnit] = useState<string>(initialUnit);

  // 入力フィールドへの参照
  const inputRef = useRef<HTMLInputElement>(null);

  // 初期フォーカス設定
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  /**
   * 確定処理
   */
  const handleConfirm = useCallback(() => {
    onConfirm(value, unit);
  }, [value, unit, onConfirm]);

  /**
   * キャンセル処理
   */
  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  /**
   * キーボードイベントハンドラ
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          handleConfirm();
          break;
        case 'Escape':
          event.preventDefault();
          handleCancel();
          break;
        default:
          break;
      }
    },
    [handleConfirm, handleCancel]
  );

  /**
   * 値変更ハンドラ
   */
  const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  /**
   * 単位変更ハンドラ
   */
  const handleUnitChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setUnit(event.target.value);
  }, []);

  // 数値に変換（空文字の場合はundefined）
  const numericValue = value === '' ? undefined : parseFloat(value);

  return (
    <div
      role="dialog"
      aria-label="寸法値入力"
      style={{
        ...STYLES.container,
        left: position.x,
        top: position.y,
      }}
      onKeyDown={handleKeyDown}
    >
      <div style={STYLES.form}>
        {/* 寸法値入力 */}
        <div>
          <label id="dimension-value-label" htmlFor="dimension-value-input" style={STYLES.label}>
            寸法値
          </label>
          <div style={STYLES.inputGroup}>
            <input
              ref={inputRef}
              id="dimension-value-input"
              type="number"
              role="spinbutton"
              aria-labelledby="dimension-value-label"
              value={numericValue ?? ''}
              onChange={handleValueChange}
              style={STYLES.input}
              min="0"
              step="0.01"
              placeholder="0"
            />
            <label id="dimension-unit-label" htmlFor="dimension-unit-select" style={STYLES.srOnly}>
              単位
            </label>
            <select
              id="dimension-unit-select"
              aria-labelledby="dimension-unit-label"
              value={unit}
              onChange={handleUnitChange}
              style={STYLES.select}
            >
              {UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ボタン */}
        <div style={STYLES.buttonGroup}>
          <button
            type="button"
            onClick={handleCancel}
            style={{ ...STYLES.button, ...STYLES.cancelButton }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{ ...STYLES.button, ...STYLES.confirmButton }}
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
}

export default DimensionValueInput;
