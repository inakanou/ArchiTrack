/**
 * @fileoverview 自社情報フォームコンポーネント
 *
 * Task 6.1: CompanyInfoFormコンポーネントの実装
 *
 * 自社情報の入力・編集に使用するフォームUIを提供します。
 * Zodバリデーションスキーマを使用したリアルタイムバリデーションを実装しています。
 *
 * Requirements:
 * - 1.2: 入力欄（会社名、住所、代表者、電話番号、FAX番号、メールアドレス、適格請求書発行事業者登録番号）
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.5: バリデーションエラー表示
 * - 2.6: ローディング表示とボタン無効化
 * - 3.1: リセットボタン表示
 * - 3.2: リセット時の復元
 * - 3.3: 未登録時のリセット
 *
 * @example
 * ```tsx
 * <CompanyInfoForm
 *   initialData={companyInfoFormData}
 *   onSubmit={handleSubmit}
 *   onReset={handleReset}
 *   onDirtyChange={setIsDirty}
 *   isSubmitting={isSubmitting}
 * />
 * ```
 */

import { useState, useCallback, useEffect, useId, FormEvent, ChangeEvent, FocusEvent } from 'react';
import type { CompanyInfoFormData, CompanyInfoFormErrors } from '../../types/company-info.types';
import { EMPTY_COMPANY_INFO_FORM_DATA } from '../../types/company-info.types';
import { validateCompanyInfoField } from '../../utils/company-info.validation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * CompanyInfoFormコンポーネントのプロパティ
 */
export interface CompanyInfoFormProps {
  /** 初期データ */
  initialData?: CompanyInfoFormData;
  /** フォーム送信時のコールバック */
  onSubmit: (data: CompanyInfoFormData) => Promise<void>;
  /** リセット時のコールバック */
  onReset: () => void;
  /** 変更状態通知コールバック */
  onDirtyChange: (isDirty: boolean) => void;
  /** 送信中フラグ */
  isSubmitting: boolean;
}

// ============================================================================
// スタイル定数
// ============================================================================

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
    disabled: '#525b6a', // WCAG 2.1 AA準拠: 5.5:1 contrast ratio on #f3f4f6
    disabledBg: '#f3f4f6',
    white: '#ffffff',
  },
  borderRadius: '0.375rem',
  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
} as const;

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 自社情報フォームコンポーネント
 *
 * 自社情報の入力・編集に使用するフォームUIを提供します。
 *
 * Requirements:
 * - 1.2: 入力欄（会社名、住所、代表者、電話番号、FAX番号、メールアドレス、適格請求書発行事業者登録番号）
 * - 1.3: 登録済み情報のプリセット表示
 * - 1.4: 未登録時の空フォーム表示
 * - 2.5: バリデーションエラー表示
 * - 2.6: ローディング表示とボタン無効化
 * - 3.1: リセットボタン表示
 * - 3.2: リセット時の復元
 * - 3.3: 未登録時のリセット
 */
function CompanyInfoForm({
  initialData,
  onSubmit,
  onReset,
  onDirtyChange,
  isSubmitting,
}: CompanyInfoFormProps) {
  // ============================================================================
  // 状態管理
  // ============================================================================

  const defaultData = initialData ?? EMPTY_COMPANY_INFO_FORM_DATA;

  // フォームフィールド
  const [companyName, setCompanyName] = useState(defaultData.companyName);
  const [address, setAddress] = useState(defaultData.address);
  const [representative, setRepresentative] = useState(defaultData.representative);
  const [phone, setPhone] = useState(defaultData.phone);
  const [fax, setFax] = useState(defaultData.fax);
  const [email, setEmail] = useState(defaultData.email);
  const [invoiceRegistrationNumber, setInvoiceRegistrationNumber] = useState(
    defaultData.invoiceRegistrationNumber
  );
  const [version] = useState(defaultData.version);

  // エラー状態
  const [errors, setErrors] = useState<CompanyInfoFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // フォーカス状態
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 一意のID生成
  const uniqueId = useId();
  const formId = `company-info-form-${uniqueId}`;

  // ============================================================================
  // isDirty計算
  // ============================================================================

  useEffect(() => {
    const currentData = {
      companyName,
      address,
      representative,
      phone,
      fax,
      email,
      invoiceRegistrationNumber,
    };

    const original = {
      companyName: defaultData.companyName,
      address: defaultData.address,
      representative: defaultData.representative,
      phone: defaultData.phone,
      fax: defaultData.fax,
      email: defaultData.email,
      invoiceRegistrationNumber: defaultData.invoiceRegistrationNumber,
    };

    const isDirty = JSON.stringify(currentData) !== JSON.stringify(original);
    onDirtyChange(isDirty);
  }, [
    companyName,
    address,
    representative,
    phone,
    fax,
    email,
    invoiceRegistrationNumber,
    defaultData,
    onDirtyChange,
  ]);

  // ============================================================================
  // バリデーション関数
  // ============================================================================

  /**
   * 全フィールドのバリデーションを実行
   */
  const validateAll = useCallback((): boolean => {
    const newErrors: CompanyInfoFormErrors = {};

    // 必須フィールドバリデーション
    const companyNameError = validateCompanyInfoField('companyName', companyName);
    if (companyNameError) newErrors.companyName = companyNameError;

    const addressError = validateCompanyInfoField('address', address);
    if (addressError) newErrors.address = addressError;

    const representativeError = validateCompanyInfoField('representative', representative);
    if (representativeError) newErrors.representative = representativeError;

    // 任意フィールドバリデーション（空文字でなければ検証）
    const phoneError = validateCompanyInfoField('phone', phone);
    if (phoneError) newErrors.phone = phoneError;

    const faxError = validateCompanyInfoField('fax', fax);
    if (faxError) newErrors.fax = faxError;

    const emailError = validateCompanyInfoField('email', email);
    if (emailError) newErrors.email = emailError;

    const invoiceError = validateCompanyInfoField(
      'invoiceRegistrationNumber',
      invoiceRegistrationNumber
    );
    if (invoiceError) newErrors.invoiceRegistrationNumber = invoiceError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [companyName, address, representative, phone, fax, email, invoiceRegistrationNumber]);

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  /**
   * テキストフィールドのblurイベントハンドラ
   */
  const handleTextFieldBlur = useCallback(
    (fieldName: keyof CompanyInfoFormErrors, value: string) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      setFocusedField(null);

      const error = validateCompanyInfoField(
        fieldName as Parameters<typeof validateCompanyInfoField>[0],
        value
      );
      setErrors((prev) => ({
        ...prev,
        [fieldName]: error,
      }));
    },
    []
  );

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 全フィールドをタッチ済みにする
    setTouched({
      companyName: true,
      address: true,
      representative: true,
      phone: true,
      fax: true,
      email: true,
      invoiceRegistrationNumber: true,
    });

    // バリデーション
    if (!validateAll()) {
      return;
    }

    // 送信データを構築
    const formData: CompanyInfoFormData = {
      companyName,
      address,
      representative,
      phone,
      fax,
      email,
      invoiceRegistrationNumber,
      version,
    };

    await onSubmit(formData);
  };

  /**
   * リセットハンドラ
   */
  const handleReset = useCallback(() => {
    setCompanyName(defaultData.companyName);
    setAddress(defaultData.address);
    setRepresentative(defaultData.representative);
    setPhone(defaultData.phone);
    setFax(defaultData.fax);
    setEmail(defaultData.email);
    setInvoiceRegistrationNumber(defaultData.invoiceRegistrationNumber);
    setErrors({});
    setTouched({});
    onReset();
  }, [defaultData, onReset]);

  // ============================================================================
  // スタイルヘルパー
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

  /**
   * テキスト入力フィールドの共通スタイル
   */
  const getInputStyle = (fieldName: string, hasError: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: hasError
      ? `2px solid ${STYLES.colors.error}`
      : `1px solid ${getBorderColor(fieldName, hasError)}`,
    borderRadius: STYLES.borderRadius,
    fontSize: '1rem',
    lineHeight: '1.5',
    color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
    backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
    outline: 'none',
    cursor: isSubmitting ? 'not-allowed' : 'text',
    transition: STYLES.transition,
    boxShadow: getBoxShadow(fieldName, hasError),
  });

  // ============================================================================
  // ID生成
  // ============================================================================

  const companyNameId = `company-name-${uniqueId}`;
  const companyNameErrorId = `company-name-error-${uniqueId}`;
  const addressId = `address-${uniqueId}`;
  const addressErrorId = `address-error-${uniqueId}`;
  const representativeId = `representative-${uniqueId}`;
  const representativeErrorId = `representative-error-${uniqueId}`;
  const phoneId = `phone-${uniqueId}`;
  const phoneErrorId = `phone-error-${uniqueId}`;
  const faxId = `fax-${uniqueId}`;
  const faxErrorId = `fax-error-${uniqueId}`;
  const emailId = `email-${uniqueId}`;
  const emailErrorId = `email-error-${uniqueId}`;
  const invoiceId = `invoice-registration-number-${uniqueId}`;
  const invoiceErrorId = `invoice-registration-number-error-${uniqueId}`;

  // ============================================================================
  // レンダリング
  // ============================================================================

  return (
    <form id={formId} onSubmit={handleSubmit} role="form" style={{ maxWidth: '600px' }}>
      {/* ========== 必須フィールド ========== */}

      {/* 会社名 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={companyNameId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.companyName ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          会社名
          <span style={{ color: STYLES.colors.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={companyNameId}
          type="text"
          value={companyName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setCompanyName(e.target.value);
            if (touched.companyName) {
              const error = validateCompanyInfoField('companyName', e.target.value);
              setErrors((prev) => ({ ...prev, companyName: error }));
            }
          }}
          onFocus={() => setFocusedField('companyName')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('companyName', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="会社名"
          aria-required="true"
          aria-invalid={!!errors.companyName}
          aria-describedby={errors.companyName ? companyNameErrorId : undefined}
          style={getInputStyle('companyName', !!errors.companyName)}
        />
        {errors.companyName && (
          <p
            id={companyNameErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.companyName}
          </p>
        )}
      </div>

      {/* 住所 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={addressId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.address ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          住所
          <span style={{ color: STYLES.colors.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={addressId}
          type="text"
          value={address}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setAddress(e.target.value);
            if (touched.address) {
              const error = validateCompanyInfoField('address', e.target.value);
              setErrors((prev) => ({ ...prev, address: error }));
            }
          }}
          onFocus={() => setFocusedField('address')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('address', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="住所"
          aria-required="true"
          aria-invalid={!!errors.address}
          aria-describedby={errors.address ? addressErrorId : undefined}
          style={getInputStyle('address', !!errors.address)}
        />
        {errors.address && (
          <p
            id={addressErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.address}
          </p>
        )}
      </div>

      {/* 代表者 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={representativeId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.representative ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          代表者
          <span style={{ color: STYLES.colors.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={representativeId}
          type="text"
          value={representative}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setRepresentative(e.target.value);
            if (touched.representative) {
              const error = validateCompanyInfoField('representative', e.target.value);
              setErrors((prev) => ({ ...prev, representative: error }));
            }
          }}
          onFocus={() => setFocusedField('representative')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('representative', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="代表者"
          aria-required="true"
          aria-invalid={!!errors.representative}
          aria-describedby={errors.representative ? representativeErrorId : undefined}
          style={getInputStyle('representative', !!errors.representative)}
        />
        {errors.representative && (
          <p
            id={representativeErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.representative}
          </p>
        )}
      </div>

      {/* ========== 任意フィールド ========== */}

      {/* 電話番号 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={phoneId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.phone ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          電話番号
        </label>
        <input
          id={phoneId}
          type="tel"
          value={phone}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPhone(e.target.value);
            if (touched.phone) {
              const error = validateCompanyInfoField('phone', e.target.value);
              setErrors((prev) => ({ ...prev, phone: error }));
            }
          }}
          onFocus={() => setFocusedField('phone')}
          onBlur={(e: FocusEvent<HTMLInputElement>) => handleTextFieldBlur('phone', e.target.value)}
          disabled={isSubmitting}
          aria-label="電話番号"
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? phoneErrorId : undefined}
          style={getInputStyle('phone', !!errors.phone)}
        />
        {errors.phone && (
          <p
            id={phoneErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.phone}
          </p>
        )}
      </div>

      {/* FAX番号 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={faxId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.fax ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          FAX番号
        </label>
        <input
          id={faxId}
          type="tel"
          value={fax}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setFax(e.target.value);
            if (touched.fax) {
              const error = validateCompanyInfoField('fax', e.target.value);
              setErrors((prev) => ({ ...prev, fax: error }));
            }
          }}
          onFocus={() => setFocusedField('fax')}
          onBlur={(e: FocusEvent<HTMLInputElement>) => handleTextFieldBlur('fax', e.target.value)}
          disabled={isSubmitting}
          aria-label="FAX番号"
          aria-invalid={!!errors.fax}
          aria-describedby={errors.fax ? faxErrorId : undefined}
          style={getInputStyle('fax', !!errors.fax)}
        />
        {errors.fax && (
          <p
            id={faxErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.fax}
          </p>
        )}
      </div>

      {/* メールアドレス */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={emailId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.email ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          メールアドレス
        </label>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setEmail(e.target.value);
            if (touched.email) {
              const error = validateCompanyInfoField('email', e.target.value);
              setErrors((prev) => ({ ...prev, email: error }));
            }
          }}
          onFocus={() => setFocusedField('email')}
          onBlur={(e: FocusEvent<HTMLInputElement>) => handleTextFieldBlur('email', e.target.value)}
          disabled={isSubmitting}
          aria-label="メールアドレス"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? emailErrorId : undefined}
          style={getInputStyle('email', !!errors.email)}
        />
        {errors.email && (
          <p
            id={emailErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.email}
          </p>
        )}
      </div>

      {/* 適格請求書発行事業者登録番号 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor={invoiceId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.invoiceRegistrationNumber ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          適格請求書発行事業者登録番号
        </label>
        <input
          id={invoiceId}
          type="text"
          value={invoiceRegistrationNumber}
          placeholder="T1234567890123"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setInvoiceRegistrationNumber(e.target.value);
            if (touched.invoiceRegistrationNumber) {
              const error = validateCompanyInfoField('invoiceRegistrationNumber', e.target.value);
              setErrors((prev) => ({ ...prev, invoiceRegistrationNumber: error }));
            }
          }}
          onFocus={() => setFocusedField('invoiceRegistrationNumber')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('invoiceRegistrationNumber', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="適格請求書発行事業者登録番号"
          aria-invalid={!!errors.invoiceRegistrationNumber}
          aria-describedby={errors.invoiceRegistrationNumber ? invoiceErrorId : undefined}
          style={getInputStyle('invoiceRegistrationNumber', !!errors.invoiceRegistrationNumber)}
        />
        {errors.invoiceRegistrationNumber && (
          <p
            id={invoiceErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.invoiceRegistrationNumber}
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
          onClick={handleReset}
          disabled={isSubmitting}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: STYLES.colors.white,
            color: STYLES.colors.text,
            border: `1px solid ${STYLES.colors.border}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            fontWeight: 500,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            ...(isSubmitting ? { backgroundColor: '#e5e7eb', color: '#525b6a' } : {}),
          }}
        >
          リセット
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
          {isSubmitting ? '保存中...' : '保存'}
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

export default CompanyInfoForm;
