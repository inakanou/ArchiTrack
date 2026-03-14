/**
 * @fileoverview 工程表作成フォームコンポーネント
 *
 * Task 8: フロントエンド工程表作成フォームの実装
 *
 * Requirements (construction-schedule):
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存
 * - REQ-1.6: 保存失敗時エラー表示と入力内容保持
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 *
 * @module components/schedule/ScheduleForm
 */

import { useState, useEffect, useCallback } from 'react';
import { getQuantityTables } from '../../api/quantity-tables';
import type { QuantityTableInfo } from '../../types/quantity-table.types';
import type { CreateScheduleInput } from '../../api/schedules';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ScheduleFormコンポーネントのプロパティ
 */
export interface ScheduleFormProps {
  /** プロジェクトID */
  projectId: string;
  /** 送信時コールバック */
  onSubmit: (data: CreateScheduleInput) => void;
  /** キャンセル時コールバック */
  onCancel: () => void;
  /** 送信中かどうか */
  isSubmitting: boolean;
  /** エラーメッセージ */
  error: string | null;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  form: {
    maxWidth: '600px',
  } as React.CSSProperties,
  section: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  fieldGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  inputError: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  validationError: {
    color: '#ef4444',
    fontSize: '12px',
    marginTop: '4px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
  } as React.CSSProperties,
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 24px',
    fontSize: '14px',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '10px 24px',
    fontSize: '14px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  disabledButton: {
    padding: '10px 24px',
    fontSize: '14px',
    backgroundColor: '#93c5fd',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工程表作成フォームコンポーネント
 *
 * 工程表名称の入力と数量表の選択を提供する。
 * 数量表なしでの作成も可能。
 *
 * Requirements:
 * - REQ-1.2: 工程表新規作成画面表示
 * - REQ-1.3: 工程表保存
 * - REQ-1.6: 保存失敗時エラー表示と入力内容保持
 * - REQ-2.1: 数量表選択肢表示
 * - REQ-2.2: 数量表なしで空の工程表作成
 * - REQ-2.3: 数量表指定時の項目自動取得
 */
export default function ScheduleForm({
  projectId,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: ScheduleFormProps) {
  // フォーム状態
  const [name, setName] = useState('');
  const [quantityTableId, setQuantityTableId] = useState<string>('');
  const [nameError, setNameError] = useState<string | null>(null);

  // 数量表データ
  const [quantityTables, setQuantityTables] = useState<QuantityTableInfo[]>([]);

  // ==========================================================================
  // データ取得
  // ==========================================================================

  /**
   * 数量表一覧を取得
   * Requirements: REQ-2.1
   */
  useEffect(() => {
    let mounted = true;
    const fetchQuantityTables = async () => {
      try {
        const result = await getQuantityTables(projectId, { limit: 100 });
        if (mounted) {
          setQuantityTables(result.data);
        }
      } catch {
        // エラーは握りつぶす（選択肢が空になるだけ）
      }
    };
    fetchQuantityTables();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  // ==========================================================================
  // イベントハンドラ
  // ==========================================================================

  /**
   * フォーム送信処理
   * Requirements: REQ-1.3, REQ-2.2, REQ-2.3
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // バリデーション
      const trimmedName = name.trim();
      if (!trimmedName) {
        setNameError('工程表名称を入力してください');
        return;
      }

      setNameError(null);

      const data: CreateScheduleInput = {
        name: trimmedName,
        quantityTableId: quantityTableId || null,
      };

      onSubmit(data);
    },
    [name, quantityTableId, onSubmit]
  );

  /**
   * 名称変更時にバリデーションエラーをクリア
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setNameError(null);
  }, []);

  // ==========================================================================
  // レンダリング
  // ==========================================================================

  return (
    <form onSubmit={handleSubmit} style={styles.form} data-testid="schedule-form">
      {/* エラーメッセージ表示 (REQ-1.6) */}
      {error && (
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      <div style={styles.section}>
        {/* 工程表名称入力 (REQ-1.2) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="schedule-name" style={styles.label}>
            工程表名称
          </label>
          <input
            type="text"
            id="schedule-name"
            value={name}
            onChange={handleNameChange}
            style={nameError ? styles.inputError : styles.input}
            placeholder="工程表の名称を入力してください"
            maxLength={200}
            disabled={isSubmitting}
          />
          {nameError && <p style={styles.validationError}>{nameError}</p>}
        </div>

        {/* 数量表選択 (REQ-2.1) */}
        <div style={styles.fieldGroup}>
          <label htmlFor="quantity-table-select" style={styles.label}>
            数量表
          </label>
          <select
            id="quantity-table-select"
            value={quantityTableId}
            onChange={(e) => setQuantityTableId(e.target.value)}
            style={styles.select}
            disabled={isSubmitting}
          >
            <option value="">数量表なし</option>
            {quantityTables.map((qt) => (
              <option key={qt.id} value={qt.id}>
                {qt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ボタン */}
      <div style={styles.buttonGroup}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={styles.cancelButton}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={isSubmitting ? styles.disabledButton : styles.submitButton}
        >
          {isSubmitting ? '作成中...' : '作成'}
        </button>
      </div>
    </form>
  );
}
