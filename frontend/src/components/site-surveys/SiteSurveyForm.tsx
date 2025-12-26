/**
 * @fileoverview 現場調査作成・編集フォームコンポーネント
 *
 * Task 9.4: 現場調査作成・編集フォームを実装する
 *
 * 現場調査の作成および編集に使用するフォームUIを提供します。
 * クライアントサイドバリデーションを実装しています。
 *
 * Requirements:
 * - 1.1: 現場調査作成フォームで必須フィールド（調査名、調査日）を入力可能
 * - 1.3: 現場調査情報を編集して保存（楽観的排他制御は親コンポーネントで処理）
 *
 * 機能:
 * - 調査名（必須、最大200文字）入力
 * - 調査日選択
 * - メモ（最大2000文字）入力
 * - バリデーションエラー表示
 */

import { useState, useCallback, useId, FormEvent, ChangeEvent, FocusEvent } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 現場調査フォームデータ
 */
export interface SiteSurveyFormData {
  /** 調査名（1-200文字、必須） */
  name: string;
  /** 調査日（YYYY-MM-DD形式、必須） */
  surveyDate: string;
  /** メモ（最大2000文字、任意） */
  memo?: string | null;
}

/**
 * SiteSurveyFormコンポーネントのプロパティ
 */
export interface SiteSurveyFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 初期データ（編集モード時） */
  initialData?: Partial<SiteSurveyFormData>;
  /** フォーム送信時のコールバック */
  onSubmit: (data: SiteSurveyFormData) => Promise<void>;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting: boolean;
  /**
   * サーバーからのエラーレスポンス
   *
   * 競合エラー等は親コンポーネントのダイアログで表示されるため、
   * このフォーム内では使用しませんが、将来の拡張用にプロパティを用意しています。
   */
  submitError?: unknown | null;
}

// ============================================================================
// 定数
// ============================================================================

/** バリデーション定数 */
const VALIDATION = {
  NAME_MAX_LENGTH: 200,
  MEMO_MAX_LENGTH: 2000,
} as const;

/** スタイル定数 */
const STYLES = {
  colors: {
    primary: '#1d4ed8',
    primaryHover: '#1e40af',
    error: '#dc2626',
    errorLight: 'rgba(220, 38, 38, 0.1)',
    focus: '#2563eb',
    focusLight: 'rgba(37, 99, 235, 0.1)',
    border: '#d1d5db',
    label: '#374151',
    text: '#111827',
    disabled: '#9ca3af',
    disabledBg: '#f3f4f6',
    white: '#ffffff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

/** フィールドエラー型 */
interface FieldErrors {
  name?: string;
  surveyDate?: string;
  memo?: string;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayDate(): string {
  const dateString = new Date().toISOString().split('T')[0];
  // ISO 8601形式は常にYYYY-MM-DDTHH:mm:ss.sssZ形式のため、
  // split('T')は必ず2要素を返し、[0]は常に存在する
  return dateString ?? '';
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査フォームコンポーネント
 *
 * @example
 * ```tsx
 * <SiteSurveyForm
 *   mode="create"
 *   onSubmit={async (data) => { await createSiteSurvey(projectId, data); }}
 *   onCancel={() => navigate(-1)}
 *   isSubmitting={false}
 * />
 * ```
 */
function SiteSurveyForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
  // submitError は現在未使用（競合エラーは親でダイアログ表示）
  submitError: _submitError,
}: SiteSurveyFormProps) {
  // _submitError は将来の拡張用に受け取るが、現在は使用しない
  void _submitError;
  // フォームの値
  const [name, setName] = useState(initialData?.name ?? '');
  const [surveyDate, setSurveyDate] = useState(initialData?.surveyDate ?? getTodayDate());
  const [memo, setMemo] = useState(initialData?.memo ?? '');

  // エラー状態
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // フォーカス状態
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 一意のID生成
  const uniqueId = useId();
  const formId = `site-survey-form-${uniqueId}`;
  const nameId = `name-${uniqueId}`;
  const nameErrorId = `name-error-${uniqueId}`;
  const surveyDateId = `survey-date-${uniqueId}`;
  const surveyDateErrorId = `survey-date-error-${uniqueId}`;
  const memoId = `memo-${uniqueId}`;
  const memoErrorId = `memo-error-${uniqueId}`;

  // ============================================================================
  // バリデーション関数
  // ============================================================================

  /**
   * 調査名のバリデーション
   */
  const validateName = useCallback((value: string): string => {
    if (!value.trim()) {
      return '調査名は必須です';
    }
    if (value.length > VALIDATION.NAME_MAX_LENGTH) {
      return `調査名は${VALIDATION.NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 調査日のバリデーション
   */
  const validateSurveyDate = useCallback((value: string): string => {
    if (!value) {
      return '調査日は必須です';
    }
    return '';
  }, []);

  /**
   * メモのバリデーション
   */
  const validateMemo = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.MEMO_MAX_LENGTH) {
      return `メモは${VALIDATION.MEMO_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 全フィールドのバリデーションを実行
   */
  const validateAll = useCallback((): boolean => {
    const nameError = validateName(name);
    const surveyDateError = validateSurveyDate(surveyDate);
    const memoError = validateMemo(memo);

    const newErrors: FieldErrors = {};
    if (nameError) newErrors.name = nameError;
    if (surveyDateError) newErrors.surveyDate = surveyDateError;
    if (memoError) newErrors.memo = memoError;

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  }, [name, surveyDate, memo, validateName, validateSurveyDate, validateMemo]);

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  /**
   * フィールドのblurイベントハンドラ
   */
  const handleFieldBlur = useCallback(
    (fieldName: string, value: string) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      setFocusedField(null);

      let error = '';
      switch (fieldName) {
        case 'name':
          error = validateName(value);
          break;
        case 'surveyDate':
          error = validateSurveyDate(value);
          break;
        case 'memo':
          error = validateMemo(value);
          break;
        default:
          break;
      }

      setErrors((prev) => ({
        ...prev,
        [fieldName]: error || undefined,
      }));
    },
    [validateName, validateSurveyDate, validateMemo]
  );

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 全フィールドをタッチ済みにする
    setTouched({
      name: true,
      surveyDate: true,
      memo: true,
    });

    // バリデーション
    if (!validateAll()) {
      return;
    }

    // 送信データを構築
    const formData: SiteSurveyFormData = {
      name: name.trim(),
      surveyDate,
      memo: memo.trim() || null,
    };

    await onSubmit(formData);
  };

  // ============================================================================
  // スタイル計算
  // ============================================================================

  /**
   * 入力フィールドの境界線の色を計算
   */
  const getBorderColor = (fieldName: string, hasError: boolean): string => {
    if (hasError) return STYLES.colors.error;
    if (focusedField === fieldName) return STYLES.colors.focus;
    return STYLES.colors.border;
  };

  /**
   * 入力フィールドのボックスシャドウを計算
   */
  const getBoxShadow = (fieldName: string, hasError: boolean): string => {
    if (focusedField !== fieldName) return 'none';
    if (hasError) return `0 0 0 3px ${STYLES.colors.errorLight}`;
    return `0 0 0 3px ${STYLES.colors.focusLight}`;
  };

  const submitButtonText = mode === 'create' ? '作成' : '保存';
  const submitButtonLoadingText = mode === 'create' ? '作成中...' : '保存中...';

  // ============================================================================
  // レンダリング
  // ============================================================================

  return (
    <form id={formId} onSubmit={handleSubmit} role="form" style={{ maxWidth: '600px' }}>
      {/* 調査名 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={nameId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.name ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          調査名
          <span
            style={{
              color: STYLES.colors.error,
              marginLeft: '0.25rem',
            }}
            aria-hidden="true"
          >
            *
          </span>
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setName(e.target.value);
            // タッチ済みの場合は即時バリデーション
            if (touched.name) {
              const error = validateName(e.target.value);
              setErrors((prev) => ({ ...prev, name: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('name')}
          onBlur={(e: FocusEvent<HTMLInputElement>) => handleFieldBlur('name', e.target.value)}
          disabled={isSubmitting}
          aria-label="調査名"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? nameErrorId : undefined}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: errors.name
              ? `2px solid ${STYLES.colors.error}`
              : `1px solid ${getBorderColor('name', !!errors.name)}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'text',
            transition: STYLES.transition,
            boxShadow: getBoxShadow('name', !!errors.name),
          }}
        />
        {errors.name && (
          <p
            id={nameErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.name}
          </p>
        )}
      </div>

      {/* 調査日 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={surveyDateId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.surveyDate ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          調査日
          <span
            style={{
              color: STYLES.colors.error,
              marginLeft: '0.25rem',
            }}
            aria-hidden="true"
          >
            *
          </span>
        </label>
        <input
          id={surveyDateId}
          type="date"
          value={surveyDate}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSurveyDate(e.target.value);
            if (touched.surveyDate) {
              const error = validateSurveyDate(e.target.value);
              setErrors((prev) => ({ ...prev, surveyDate: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('surveyDate')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleFieldBlur('surveyDate', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="調査日"
          aria-required="true"
          aria-invalid={!!errors.surveyDate}
          aria-describedby={errors.surveyDate ? surveyDateErrorId : undefined}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: errors.surveyDate
              ? `2px solid ${STYLES.colors.error}`
              : `1px solid ${getBorderColor('surveyDate', !!errors.surveyDate)}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'default',
            transition: STYLES.transition,
            boxShadow: getBoxShadow('surveyDate', !!errors.surveyDate),
          }}
        />
        {errors.surveyDate && (
          <p
            id={surveyDateErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.surveyDate}
          </p>
        )}
      </div>

      {/* メモ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor={memoId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.memo ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          メモ
        </label>
        <textarea
          id={memoId}
          value={memo}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setMemo(e.target.value);
            if (touched.memo) {
              const error = validateMemo(e.target.value);
              setErrors((prev) => ({ ...prev, memo: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('memo')}
          onBlur={(e: FocusEvent<HTMLTextAreaElement>) => handleFieldBlur('memo', e.target.value)}
          disabled={isSubmitting}
          rows={4}
          aria-label="メモ"
          aria-invalid={!!errors.memo}
          aria-describedby={errors.memo ? memoErrorId : undefined}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: errors.memo
              ? `2px solid ${STYLES.colors.error}`
              : `1px solid ${getBorderColor('memo', !!errors.memo)}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'text',
            transition: STYLES.transition,
            boxShadow: getBoxShadow('memo', !!errors.memo),
            resize: 'vertical',
            minHeight: '100px',
          }}
        />
        {errors.memo && (
          <p
            id={memoErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.memo}
          </p>
        )}
      </div>

      {/* ボタン */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: STYLES.colors.white,
            color: STYLES.colors.text,
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isSubmitting ? STYLES.colors.disabled : STYLES.colors.primary,
            color: STYLES.colors.white,
            border: 'none',
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            fontWeight: 600,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          {isSubmitting && (
            <span
              role="status"
              aria-label="ローディング中"
              style={{
                display: 'inline-block',
                width: '1rem',
                height: '1rem',
                border: '2px solid white',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }}
            />
          )}
          {isSubmitting ? submitButtonLoadingText : submitButtonText}
        </button>
      </div>

      {/* アニメーション定義 */}
      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </form>
  );
}

export default SiteSurveyForm;
