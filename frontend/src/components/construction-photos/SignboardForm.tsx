/**
 * @fileoverview 工事看板フォームコンポーネント
 *
 * Task 6.5: 看板マスタ管理画面
 *
 * 標準項目（工事件名・工事場所）＋自由項目行（ラベル+値の動的追加/削除）＋
 * 下部固定テキスト（記入欄、複数行）の入力フォーム。作成・編集の双方で再利用する
 * プレゼンテーショナルコンポーネント。送信/キャンセルは親から受け取る。
 *
 * バリデーション定数はバックエンド（backend/src/schemas/construction-signboard.schema.ts）
 * と整合させる（workName/workLocation 各200・自由項目ラベル50/値200・最大20行・記入欄2000）。
 *
 * Requirements:
 * - 8.2: 標準項目（工事件名・工事場所）
 * - 8.3: 自由項目行（ラベル+値）の動的追加/削除
 * - 8.4: 下部固定テキスト（記入欄、複数行）
 *
 * @module components/construction-photos/SignboardForm
 */

import { useState, useCallback, type FormEvent } from 'react';
import type {
  ConstructionSignboard,
  CreateConstructionSignboardInput,
  SignboardFreeItem,
} from '../../types/construction-photo.types';

// ============================================================================
// バリデーション定数（バックエンドスキーマと整合）
// ============================================================================

const WORK_NAME_MAX_LENGTH = 200;
const WORK_LOCATION_MAX_LENGTH = 200;
const FREE_ITEM_LABEL_MAX_LENGTH = 50;
const FREE_ITEM_VALUE_MAX_LENGTH = 200;
const FREE_ITEMS_MAX = 20;
const FOOTER_TEXT_MAX_LENGTH = 2000;

// ============================================================================
// 型定義
// ============================================================================

interface FreeItemRow {
  label: string;
  value: string;
}

interface FreeItemError {
  label?: string;
  value?: string;
}

interface SignboardFormProps {
  /** 編集時の初期値。未指定は新規作成 */
  initialValue?: ConstructionSignboard | null;
  /** 送信ハンドラ（バリデーション通過後に呼ばれる） */
  onSubmit: (input: CreateConstructionSignboardInput) => void | Promise<void>;
  /** キャンセルハンドラ */
  onCancel: () => void;
  /** 送信ボタンのラベル（例: 登録 / 更新） */
  submitLabel: string;
  /** 送信処理中フラグ（二重送信防止・ボタン無効化） */
  isSubmitting?: boolean;
}

// ============================================================================
// スタイル定義（ConstructionPhotoCreatePage の規約に倣う）
// ============================================================================

const styles = {
  form: {} as React.CSSProperties,
  fieldGroup: {
    marginBottom: '1rem',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 500,
    color: '#374151',
  } as React.CSSProperties,
  required: {
    color: '#dc2626',
    marginLeft: '0.25rem',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    lineHeight: '1.5',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  inputError: {
    border: '2px solid #dc2626',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    lineHeight: '1.5',
    minHeight: '100px',
    resize: 'vertical',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  fieldError: {
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    color: '#dc2626',
  } as React.CSSProperties,
  freeItemRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-start',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  freeItemInputs: {
    flex: 1,
    display: 'flex',
    gap: '0.5rem',
  } as React.CSSProperties,
  freeItemCol: {
    flex: 1,
  } as React.CSSProperties,
  removeButton: {
    padding: '0.5rem 0.75rem',
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  addButton: {
    padding: '0.5rem 0.75rem',
    backgroundColor: '#ffffff',
    color: '#2563eb',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '1.5rem',
  } as React.CSSProperties,
  cancelButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#ffffff',
    color: '#111827',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  submitButtonDisabled: {
    backgroundColor: '#6b7280',
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// バリデーション
// ============================================================================

function validateWorkName(value: string): string {
  if (!value.trim()) {
    return '工事件名は必須です';
  }
  if (value.length > WORK_NAME_MAX_LENGTH) {
    return `工事件名は${WORK_NAME_MAX_LENGTH}文字以内で入力してください`;
  }
  return '';
}

function validateWorkLocation(value: string): string {
  if (!value.trim()) {
    return '工事場所は必須です';
  }
  if (value.length > WORK_LOCATION_MAX_LENGTH) {
    return `工事場所は${WORK_LOCATION_MAX_LENGTH}文字以内で入力してください`;
  }
  return '';
}

function validateFooterText(value: string): string {
  if (value.length > FOOTER_TEXT_MAX_LENGTH) {
    return `記入欄テキストは${FOOTER_TEXT_MAX_LENGTH}文字以内で入力してください`;
  }
  return '';
}

/** 空行（ラベル・値ともに空）はフィルタ対象。片方でも入力があれば有効行とみなす */
function isFilledRow(row: FreeItemRow): boolean {
  return row.label.trim() !== '' || row.value.trim() !== '';
}

function validateFreeItemRow(row: FreeItemRow): FreeItemError {
  const error: FreeItemError = {};
  if (row.label.trim() === '') {
    error.label = '自由項目のラベルは必須です';
  } else if (row.label.length > FREE_ITEM_LABEL_MAX_LENGTH) {
    error.label = `自由項目のラベルは${FREE_ITEM_LABEL_MAX_LENGTH}文字以内で入力してください`;
  }
  if (row.value.length > FREE_ITEM_VALUE_MAX_LENGTH) {
    error.value = `自由項目の値は${FREE_ITEM_VALUE_MAX_LENGTH}文字以内で入力してください`;
  }
  return error;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 工事看板フォーム
 *
 * 標準項目＋自由項目行＋固定テキストを入力し、バリデーション通過後に onSubmit を呼ぶ。
 */
export function SignboardForm({
  initialValue,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting = false,
}: SignboardFormProps) {
  const [workName, setWorkName] = useState(initialValue?.workName ?? '');
  const [workLocation, setWorkLocation] = useState(initialValue?.workLocation ?? '');
  const [freeItems, setFreeItems] = useState<FreeItemRow[]>(
    initialValue?.freeItems?.map((item) => ({ label: item.label, value: item.value })) ?? []
  );
  const [footerText, setFooterText] = useState(initialValue?.footerText ?? '');

  const [workNameError, setWorkNameError] = useState('');
  const [workLocationError, setWorkLocationError] = useState('');
  const [footerTextError, setFooterTextError] = useState('');
  const [freeItemErrors, setFreeItemErrors] = useState<FreeItemError[]>([]);

  const handleAddFreeItem = useCallback(() => {
    setFreeItems((prev) => (prev.length >= FREE_ITEMS_MAX ? prev : [...prev, { label: '', value: '' }]));
  }, []);

  const handleRemoveFreeItem = useCallback((index: number) => {
    setFreeItems((prev) => prev.filter((_, i) => i !== index));
    setFreeItemErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleFreeItemChange = useCallback(
    (index: number, field: keyof FreeItemRow, value: string) => {
      setFreeItems((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
      );
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const nameErr = validateWorkName(workName);
      const locationErr = validateWorkLocation(workLocation);
      const footerErr = validateFooterText(footerText);

      // 有効行のみを対象にラベル必須・長さ検証（空行は送信時に除外）
      const rowErrors: FreeItemError[] = freeItems.map((row) =>
        isFilledRow(row) ? validateFreeItemRow(row) : {}
      );
      const hasFreeItemError = rowErrors.some((err) => err.label || err.value);

      setWorkNameError(nameErr);
      setWorkLocationError(locationErr);
      setFooterTextError(footerErr);
      setFreeItemErrors(rowErrors);

      if (nameErr || locationErr || footerErr || hasFreeItemError) {
        return;
      }

      const cleanedFreeItems: SignboardFreeItem[] = freeItems
        .filter(isFilledRow)
        .map((row) => ({ label: row.label.trim(), value: row.value }));

      await onSubmit({
        workName: workName.trim(),
        workLocation: workLocation.trim(),
        freeItems: cleanedFreeItems,
        footerText: footerText.trim() || null,
      });
    },
    [workName, workLocation, footerText, freeItems, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} role="form" style={styles.form}>
      {/* 工事件名（標準項目・必須） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="signboard-work-name" style={styles.label}>
          工事件名
          <span style={styles.required} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="signboard-work-name"
          type="text"
          value={workName}
          onChange={(e) => {
            setWorkName(e.target.value);
            if (workNameError) setWorkNameError(validateWorkName(e.target.value));
          }}
          disabled={isSubmitting}
          aria-label="工事件名"
          aria-required="true"
          aria-invalid={!!workNameError}
          style={workNameError ? { ...styles.input, ...styles.inputError } : styles.input}
        />
        {workNameError && (
          <p role="alert" style={styles.fieldError}>
            {workNameError}
          </p>
        )}
      </div>

      {/* 工事場所（標準項目・必須） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="signboard-work-location" style={styles.label}>
          工事場所
          <span style={styles.required} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="signboard-work-location"
          type="text"
          value={workLocation}
          onChange={(e) => {
            setWorkLocation(e.target.value);
            if (workLocationError) setWorkLocationError(validateWorkLocation(e.target.value));
          }}
          disabled={isSubmitting}
          aria-label="工事場所"
          aria-required="true"
          aria-invalid={!!workLocationError}
          style={workLocationError ? { ...styles.input, ...styles.inputError } : styles.input}
        />
        {workLocationError && (
          <p role="alert" style={styles.fieldError}>
            {workLocationError}
          </p>
        )}
      </div>

      {/* 自由項目行（ラベル+値の動的追加/削除） */}
      <div style={styles.fieldGroup}>
        <span style={styles.label}>自由項目</span>
        {freeItems.map((row, index) => {
          const rowError = freeItemErrors[index] ?? {};
          return (
            <div key={index} style={styles.freeItemRow}>
              <div style={styles.freeItemInputs}>
                <div style={styles.freeItemCol}>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => handleFreeItemChange(index, 'label', e.target.value)}
                    disabled={isSubmitting}
                    placeholder="ラベル"
                    aria-label={`自由項目ラベル${index + 1}`}
                    aria-invalid={!!rowError.label}
                    style={rowError.label ? { ...styles.input, ...styles.inputError } : styles.input}
                  />
                  {rowError.label && (
                    <p role="alert" style={styles.fieldError}>
                      {rowError.label}
                    </p>
                  )}
                </div>
                <div style={styles.freeItemCol}>
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => handleFreeItemChange(index, 'value', e.target.value)}
                    disabled={isSubmitting}
                    placeholder="値"
                    aria-label={`自由項目値${index + 1}`}
                    aria-invalid={!!rowError.value}
                    style={rowError.value ? { ...styles.input, ...styles.inputError } : styles.input}
                  />
                  {rowError.value && (
                    <p role="alert" style={styles.fieldError}>
                      {rowError.value}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFreeItem(index)}
                disabled={isSubmitting}
                style={styles.removeButton}
                aria-label={`自由項目${index + 1}を削除`}
              >
                削除
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={handleAddFreeItem}
          disabled={isSubmitting || freeItems.length >= FREE_ITEMS_MAX}
          style={styles.addButton}
        >
          自由項目を追加
        </button>
      </div>

      {/* 記入欄テキスト（下部固定テキスト・複数行） */}
      <div style={styles.fieldGroup}>
        <label htmlFor="signboard-footer-text" style={styles.label}>
          記入欄テキスト
        </label>
        <textarea
          id="signboard-footer-text"
          value={footerText}
          onChange={(e) => {
            setFooterText(e.target.value);
            if (footerTextError) setFooterTextError(validateFooterText(e.target.value));
          }}
          disabled={isSubmitting}
          rows={4}
          aria-label="記入欄テキスト"
          aria-invalid={!!footerTextError}
          style={footerTextError ? { ...styles.textarea, ...styles.inputError } : styles.textarea}
        />
        {footerTextError && (
          <p role="alert" style={styles.fieldError}>
            {footerTextError}
          </p>
        )}
      </div>

      {/* アクション */}
      <div style={styles.actions}>
        <button type="button" onClick={onCancel} disabled={isSubmitting} style={styles.cancelButton}>
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={
            isSubmitting ? { ...styles.submitButton, ...styles.submitButtonDisabled } : styles.submitButton
          }
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
