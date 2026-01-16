/**
 * @fileoverview テキストフィールド入力コンポーネント
 *
 * 入力中にリアルタイムで文字数をチェックし、最大文字数を超える入力を防止する機能を提供。
 * 全角文字は幅2、半角文字は幅1としてカウントし、入力制限に達した際の視覚的フィードバックを表示。
 *
 * Requirements:
 * - 13.1: 大項目・中項目・小項目・任意分類・名称・規格・計算方法・備考（全角25文字/半角50文字）
 * - 13.2: 工種（全角8文字/半角16文字）
 * - 13.3: 単位（全角3文字/半角6文字）
 *
 * Task 12.1: テキストフィールド入力制御コンポーネントを実装する
 *
 * @module components/quantity-table/TextFieldInput
 */

import { useId, useMemo } from 'react';
import { getRemainingWidth, type TextFieldName } from '../../utils/field-validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * TextFieldInputコンポーネントのProps
 */
export interface TextFieldInputProps {
  /** 現在の入力値 */
  value: string;
  /** 値変更時のコールバック */
  onChange: (value: string) => void;
  /** フィールド名（制約を決定） */
  fieldName: TextFieldName;
  /** ラベル */
  label: string;
  /** 入力フィールドのID */
  id?: string;
  /** プレースホルダー */
  placeholder?: string;
  /** エラーメッセージ */
  error?: string;
  /** 必須フィールドかどうか */
  required?: boolean;
  /** 無効化フラグ */
  disabled?: boolean;
  /** 残り文字数を表示するかどうか */
  showCharacterCount?: boolean;
  /** 追加のクラス名 */
  className?: string;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
  } as React.CSSProperties,
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '14px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#374151',
    whiteSpace: 'nowrap' as const,
    lineHeight: '14px',
  } as React.CSSProperties,
  requiredMark: {
    color: '#dc2626',
    marginLeft: '2px',
  } as React.CSSProperties,
  characterCount: {
    fontSize: '10px',
    fontWeight: 400,
    lineHeight: '14px',
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    height: '22px',
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
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputFocused: {
    borderColor: '#2563eb',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.1)',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#dc2626',
    boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.1)',
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f9fafb',
    color: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorMessage: {
    marginTop: '2px',
    fontSize: '11px',
    color: '#dc2626',
    lineHeight: '1.2',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 残り幅に応じた色を取得
 *
 * @param remaining - 残り幅
 * @returns 色コード
 */
function getCounterColor(remaining: number): string {
  if (remaining < 0) {
    return '#dc2626'; // red - 超過
  }
  if (remaining === 0) {
    return '#dc2626'; // red - ちょうど最大
  }
  if (remaining <= 10) {
    return '#92400e'; // amber-800 - 警告 (WCAG AA contrast ratio: 5.7:1)
  }
  return '#4b5563'; // gray-600 - 通常 (WCAG AA contrast ratio: 7.0:1)
}

/**
 * 残り幅の表示テキストを取得
 *
 * @param remaining - 残り幅
 * @returns 表示テキスト
 */
function getCounterText(remaining: number): string {
  if (remaining < 0) {
    return `${remaining}超過`;
  }
  return `残り${remaining}`;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * テキストフィールド入力コンポーネント
 *
 * 入力中にリアルタイムで文字数をチェックし、
 * 最大文字数に近づくと視覚的フィードバックを表示する。
 *
 * @param props - コンポーネントProps
 */
export default function TextFieldInput({
  value,
  onChange,
  fieldName,
  label,
  id: propId,
  placeholder = '',
  error,
  required = false,
  disabled = false,
  showCharacterCount = false,
  className,
}: TextFieldInputProps) {
  const generatedId = useId();
  const inputId = propId || generatedId;
  const errorId = `${inputId}-error`;
  const counterId = `${inputId}-counter`;

  // 残り幅を計算
  const remaining = useMemo(() => getRemainingWidth(value, fieldName), [value, fieldName]);

  // カウンターの色とテキストを計算
  const counterColor = useMemo(() => getCounterColor(remaining), [remaining]);
  const counterText = useMemo(() => getCounterText(remaining), [remaining]);

  // 入力変更ハンドラ
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  // 入力スタイルを計算
  const inputStyles = {
    ...styles.input,
    ...(error ? styles.inputError : {}),
    ...(disabled ? styles.inputDisabled : {}),
  };

  // カウンタースタイル
  const counterStyles = {
    ...styles.characterCount,
    color: counterColor,
  };

  return (
    <div style={styles.container} className={className}>
      {/* ラベル行 */}
      <div style={styles.labelRow}>
        <label htmlFor={inputId} style={styles.label}>
          {label}
          {required && <span style={styles.requiredMark}>*</span>}
        </label>
        {showCharacterCount && (
          <span id={counterId} style={counterStyles} aria-live="polite">
            {counterText}
          </span>
        )}
      </div>

      {/* 入力フィールド */}
      <div style={styles.inputWrapper}>
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyles}
          onChange={handleChange}
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={
            [error ? errorId : null, showCharacterCount ? counterId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div id={errorId} style={styles.errorMessage} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
