/**
 * @fileoverview 取引先作成・編集フォームコンポーネント
 *
 * Task 8.1: 取引先作成・編集フォームの実装
 *
 * 取引先の作成および編集に使用するフォームUIを提供します。
 * TradingPartnerTypeSelect、BillingClosingDaySelect、PaymentDateSelectコンポーネントを
 * 利用し、クライアントサイドバリデーションを実装しています。
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンで取引先作成フォームを表示する
 * - 2.2: 必須入力欄（名前、フリガナ、種別、住所）を提供
 * - 2.3: 任意入力欄（部課/支店/支社名等）を提供
 * - 2.9: 必須項目未入力時のバリデーションエラー表示
 * - 2.10: メールアドレス形式不正時のエラー表示
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.2: 編集時も同じ必須・任意項目の編集を可能とする
 * - 4.7: 必須項目未入力時のバリデーションエラー表示
 *
 * @example
 * ```tsx
 * <TradingPartnerForm
 *   mode="create"
 *   onSubmit={async (data) => { await createTradingPartner(data); }}
 *   onCancel={() => navigate('/trading-partners')}
 *   isSubmitting={false}
 * />
 * ```
 */

import { useState, useCallback, useId, FormEvent, ChangeEvent, FocusEvent } from 'react';
import { TradingPartnerType } from '../../types/trading-partner.types';
import TradingPartnerTypeSelect from './TradingPartnerTypeSelect';
import BillingClosingDaySelect from './BillingClosingDaySelect';
import PaymentDateSelect from './PaymentDateSelect';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 取引先フォームデータ
 *
 * Note: Task 19.2で branchNameKana / representativeNameKana フィールドを削除
 * フリガナは自動変換機能により生成されるため、手動入力欄は不要
 */
export interface TradingPartnerFormData {
  /** 取引先名（1-200文字、必須） */
  name: string;
  /** フリガナ（1-200文字、カタカナのみ、必須） */
  nameKana: string;
  /** 取引先種別（1つ以上必須） */
  types: TradingPartnerType[];
  /** 住所（1-500文字、必須） */
  address: string;
  /** 部課/支店/支社名（最大100文字、任意） */
  branchName: string | null;
  /** 代表者名（最大100文字、任意） */
  representativeName: string | null;
  /** 電話番号（任意） */
  phoneNumber: string | null;
  /** FAX番号（任意） */
  faxNumber: string | null;
  /** メールアドレス（任意） */
  email: string | null;
  /** 請求締日（1-31 or 99=末日、任意） */
  billingClosingDay: number | null;
  /** 支払月オフセット（1-3、任意） */
  paymentMonthOffset: number | null;
  /** 支払日（1-31 or 99=末日、任意） */
  paymentDay: number | null;
  /** 備考（最大2000文字、任意） */
  notes: string | null;
}

/**
 * TradingPartnerFormコンポーネントのプロパティ
 */
export interface TradingPartnerFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 初期データ（編集モード時） */
  initialData?: Partial<TradingPartnerFormData>;
  /** フォーム送信時のコールバック */
  onSubmit: (data: TradingPartnerFormData) => Promise<void>;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting: boolean;
}

// ============================================================================
// バリデーション定数
// ============================================================================

/** バリデーション定数 */
const VALIDATION = {
  NAME_MAX_LENGTH: 200,
  NAME_KANA_MAX_LENGTH: 200,
  BRANCH_NAME_MAX_LENGTH: 100,
  REPRESENTATIVE_NAME_MAX_LENGTH: 100,
  ADDRESS_MAX_LENGTH: 500,
  NOTES_MAX_LENGTH: 2000,
} as const;

/** カタカナ正規表現（スペース含む） */
const KATAKANA_REGEX = /^[ァ-ヶー\s]+$/;

/** 電話番号/FAX番号正規表現（数字、ハイフン、括弧のみ） */
const PHONE_REGEX = /^[\d\-()]+$/;

/** メールアドレス正規表現 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
// エラー型
// ============================================================================

/** フィールドエラー型 */
interface FieldErrors {
  name?: string;
  nameKana?: string;
  types?: string;
  address?: string;
  branchName?: string;
  representativeName?: string;
  phoneNumber?: string;
  faxNumber?: string;
  email?: string;
  notes?: string;
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 取引先作成・編集フォームコンポーネント
 *
 * 取引先の作成および編集に使用するフォームUIを提供します。
 *
 * Requirements:
 * - 2.1: 「新規作成」ボタンで取引先作成フォームを表示する
 * - 2.2: 必須入力欄（名前、フリガナ、種別、住所）を提供
 * - 2.3: 任意入力欄（部課/支店/支社名等）を提供
 * - 2.9: 必須項目未入力時のバリデーションエラー表示
 * - 2.10: メールアドレス形式不正時のエラー表示
 * - 4.1: 編集ボタンクリックで現在の取引先情報がプリセットされた編集フォームを表示
 * - 4.2: 編集時も同じ必須・任意項目の編集を可能とする
 * - 4.7: 必須項目未入力時のバリデーションエラー表示
 */
function TradingPartnerForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: TradingPartnerFormProps) {
  // ============================================================================
  // 状態管理
  // ============================================================================

  // 必須フィールド
  const [name, setName] = useState(initialData?.name ?? '');
  const [nameKana, setNameKana] = useState(initialData?.nameKana ?? '');
  const [types, setTypes] = useState<TradingPartnerType[]>(initialData?.types ?? []);
  const [address, setAddress] = useState(initialData?.address ?? '');

  // 任意フィールド
  const [branchName, setBranchName] = useState(initialData?.branchName ?? '');
  const [representativeName, setRepresentativeName] = useState(
    initialData?.representativeName ?? ''
  );
  const [phoneNumber, setPhoneNumber] = useState(initialData?.phoneNumber ?? '');
  const [faxNumber, setFaxNumber] = useState(initialData?.faxNumber ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [billingClosingDay, setBillingClosingDay] = useState<number | null>(
    initialData?.billingClosingDay ?? null
  );
  const [paymentMonthOffset, setPaymentMonthOffset] = useState<number | null>(
    initialData?.paymentMonthOffset ?? null
  );
  const [paymentDay, setPaymentDay] = useState<number | null>(initialData?.paymentDay ?? null);
  const [notes, setNotes] = useState(initialData?.notes ?? '');

  // エラー状態
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // フォーカス状態
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 一意のID生成
  const uniqueId = useId();
  const formId = `trading-partner-form-${uniqueId}`;

  // ============================================================================
  // バリデーション関数
  // ============================================================================

  /**
   * 取引先名のバリデーション
   */
  const validateName = useCallback((value: string): string => {
    if (!value.trim()) {
      return '取引先名は必須です';
    }
    if (value.length > VALIDATION.NAME_MAX_LENGTH) {
      return `取引先名は${VALIDATION.NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * フリガナのバリデーション
   */
  const validateNameKana = useCallback((value: string): string => {
    if (!value.trim()) {
      return 'フリガナは必須です';
    }
    if (value.length > VALIDATION.NAME_KANA_MAX_LENGTH) {
      return `フリガナは${VALIDATION.NAME_KANA_MAX_LENGTH}文字以内で入力してください`;
    }
    if (!KATAKANA_REGEX.test(value)) {
      return 'フリガナはカタカナのみで入力してください';
    }
    return '';
  }, []);

  /**
   * 種別のバリデーション
   */
  const validateTypes = useCallback((value: TradingPartnerType[]): string => {
    if (value.length === 0) {
      return '種別を1つ以上選択してください';
    }
    return '';
  }, []);

  /**
   * 住所のバリデーション
   */
  const validateAddress = useCallback((value: string): string => {
    if (!value.trim()) {
      return '住所は必須です';
    }
    if (value.length > VALIDATION.ADDRESS_MAX_LENGTH) {
      return `住所は${VALIDATION.ADDRESS_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 部課/支店/支社名のバリデーション
   */
  const validateBranchName = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.BRANCH_NAME_MAX_LENGTH) {
      return `部課/支店/支社名は${VALIDATION.BRANCH_NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 代表者名のバリデーション
   */
  const validateRepresentativeName = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.REPRESENTATIVE_NAME_MAX_LENGTH) {
      return `代表者名は${VALIDATION.REPRESENTATIVE_NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 電話番号のバリデーション
   */
  const validatePhoneNumber = useCallback((value: string): string => {
    if (value && !PHONE_REGEX.test(value)) {
      return '電話番号は数字、ハイフン、括弧のみ使用できます';
    }
    return '';
  }, []);

  /**
   * FAX番号のバリデーション
   */
  const validateFaxNumber = useCallback((value: string): string => {
    if (value && !PHONE_REGEX.test(value)) {
      return 'FAX番号は数字、ハイフン、括弧のみ使用できます';
    }
    return '';
  }, []);

  /**
   * メールアドレスのバリデーション
   */
  const validateEmail = useCallback((value: string): string => {
    if (value && !EMAIL_REGEX.test(value)) {
      return '有効なメールアドレスを入力してください';
    }
    return '';
  }, []);

  /**
   * 備考のバリデーション
   */
  const validateNotes = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.NOTES_MAX_LENGTH) {
      return `備考は${VALIDATION.NOTES_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 全フィールドのバリデーションを実行
   */
  const validateAll = useCallback((): boolean => {
    const nameError = validateName(name);
    const nameKanaError = validateNameKana(nameKana);
    const typesError = validateTypes(types);
    const addressError = validateAddress(address);
    const branchNameError = validateBranchName(branchName);
    const representativeNameError = validateRepresentativeName(representativeName);
    const phoneNumberError = validatePhoneNumber(phoneNumber);
    const faxNumberError = validateFaxNumber(faxNumber);
    const emailError = validateEmail(email);
    const notesError = validateNotes(notes);

    const newErrors: FieldErrors = {};
    if (nameError) newErrors.name = nameError;
    if (nameKanaError) newErrors.nameKana = nameKanaError;
    if (typesError) newErrors.types = typesError;
    if (addressError) newErrors.address = addressError;
    if (branchNameError) newErrors.branchName = branchNameError;
    if (representativeNameError) newErrors.representativeName = representativeNameError;
    if (phoneNumberError) newErrors.phoneNumber = phoneNumberError;
    if (faxNumberError) newErrors.faxNumber = faxNumberError;
    if (emailError) newErrors.email = emailError;
    if (notesError) newErrors.notes = notesError;

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  }, [
    name,
    nameKana,
    types,
    address,
    branchName,
    representativeName,
    phoneNumber,
    faxNumber,
    email,
    notes,
    validateName,
    validateNameKana,
    validateTypes,
    validateAddress,
    validateBranchName,
    validateRepresentativeName,
    validatePhoneNumber,
    validateFaxNumber,
    validateEmail,
    validateNotes,
  ]);

  // ============================================================================
  // イベントハンドラ
  // ============================================================================

  /**
   * テキストフィールドのblurイベントハンドラ
   */
  const handleTextFieldBlur = useCallback(
    (fieldName: string, value: string, validator: (v: string) => string) => {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
      setFocusedField(null);

      const error = validator(value);
      setErrors((prev) => ({
        ...prev,
        [fieldName]: error || undefined,
      }));
    },
    []
  );

  /**
   * 種別変更ハンドラ
   */
  const handleTypesChange = useCallback(
    (newTypes: TradingPartnerType[]) => {
      setTypes(newTypes);
      if (touched.types) {
        const error = validateTypes(newTypes);
        setErrors((prev) => ({
          ...prev,
          types: error || undefined,
        }));
      }
    },
    [touched.types, validateTypes]
  );

  /**
   * 支払日変更ハンドラ
   */
  const handlePaymentDateChange = useCallback(
    ({ monthOffset, day }: { monthOffset: number | null; day: number | null }) => {
      setPaymentMonthOffset(monthOffset);
      setPaymentDay(day);
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
      name: true,
      nameKana: true,
      types: true,
      address: true,
      branchName: true,
      representativeName: true,
      phoneNumber: true,
      faxNumber: true,
      email: true,
      notes: true,
    });

    // バリデーション
    if (!validateAll()) {
      return;
    }

    // 送信データを構築
    const formData: TradingPartnerFormData = {
      name: name.trim(),
      nameKana: nameKana.trim(),
      types,
      address: address.trim(),
      branchName: branchName.trim() || null,
      representativeName: representativeName.trim() || null,
      phoneNumber: phoneNumber.trim() || null,
      faxNumber: faxNumber.trim() || null,
      email: email.trim() || null,
      billingClosingDay,
      paymentMonthOffset,
      paymentDay,
      notes: notes.trim() || null,
    };

    await onSubmit(formData);
  };

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

  const nameId = `name-${uniqueId}`;
  const nameErrorId = `name-error-${uniqueId}`;
  const nameKanaId = `name-kana-${uniqueId}`;
  const nameKanaErrorId = `name-kana-error-${uniqueId}`;
  const addressId = `address-${uniqueId}`;
  const addressErrorId = `address-error-${uniqueId}`;
  const branchNameId = `branch-name-${uniqueId}`;
  const branchNameErrorId = `branch-name-error-${uniqueId}`;
  const representativeNameId = `representative-name-${uniqueId}`;
  const representativeNameErrorId = `representative-name-error-${uniqueId}`;
  const phoneNumberId = `phone-number-${uniqueId}`;
  const phoneNumberErrorId = `phone-number-error-${uniqueId}`;
  const faxNumberId = `fax-number-${uniqueId}`;
  const faxNumberErrorId = `fax-number-error-${uniqueId}`;
  const emailId = `email-${uniqueId}`;
  const emailErrorId = `email-error-${uniqueId}`;
  const notesId = `notes-${uniqueId}`;
  const notesErrorId = `notes-error-${uniqueId}`;

  const submitButtonText = mode === 'create' ? '作成' : '保存';
  const submitButtonLoadingText = mode === 'create' ? '作成中...' : '保存中...';

  // ============================================================================
  // レンダリング
  // ============================================================================

  return (
    <form id={formId} onSubmit={handleSubmit} role="form" style={{ maxWidth: '600px' }}>
      {/* ========== 必須フィールド ========== */}

      {/* 取引先名 */}
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
          取引先名
          <span style={{ color: STYLES.colors.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setName(e.target.value);
            if (touched.name) {
              const error = validateName(e.target.value);
              setErrors((prev) => ({ ...prev, name: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('name')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('name', e.target.value, validateName)
          }
          disabled={isSubmitting}
          aria-label="取引先名"
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? nameErrorId : undefined}
          style={getInputStyle('name', !!errors.name)}
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

      {/* フリガナ */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={nameKanaId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.nameKana ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          フリガナ
          <span style={{ color: STYLES.colors.error, marginLeft: '0.25rem' }} aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={nameKanaId}
          type="text"
          value={nameKana}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setNameKana(e.target.value);
            if (touched.nameKana) {
              const error = validateNameKana(e.target.value);
              setErrors((prev) => ({ ...prev, nameKana: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('nameKana')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('nameKana', e.target.value, validateNameKana)
          }
          disabled={isSubmitting}
          aria-label="フリガナ"
          aria-required="true"
          aria-invalid={!!errors.nameKana}
          aria-describedby={errors.nameKana ? nameKanaErrorId : undefined}
          style={getInputStyle('nameKana', !!errors.nameKana)}
        />
        {errors.nameKana && (
          <p
            id={nameKanaErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.nameKana}
          </p>
        )}
      </div>

      {/* 種別 */}
      <TradingPartnerTypeSelect
        value={types}
        onChange={handleTypesChange}
        label="取引先種別"
        required
        disabled={isSubmitting}
        error={errors.types}
      />

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
              const error = validateAddress(e.target.value);
              setErrors((prev) => ({ ...prev, address: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('address')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('address', e.target.value, validateAddress)
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

      {/* ========== 任意フィールド ========== */}

      {/* 部課/支店/支社名 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={branchNameId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.branchName ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          部課/支店/支社名
        </label>
        <input
          id={branchNameId}
          type="text"
          value={branchName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setBranchName(e.target.value);
            if (touched.branchName) {
              const error = validateBranchName(e.target.value);
              setErrors((prev) => ({ ...prev, branchName: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('branchName')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('branchName', e.target.value, validateBranchName)
          }
          disabled={isSubmitting}
          aria-label="部課/支店/支社名"
          aria-invalid={!!errors.branchName}
          aria-describedby={errors.branchName ? branchNameErrorId : undefined}
          style={getInputStyle('branchName', !!errors.branchName)}
        />
        {errors.branchName && (
          <p
            id={branchNameErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.branchName}
          </p>
        )}
      </div>

      {/* 代表者名 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={representativeNameId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.representativeName ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          代表者名
        </label>
        <input
          id={representativeNameId}
          type="text"
          value={representativeName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setRepresentativeName(e.target.value);
            if (touched.representativeName) {
              const error = validateRepresentativeName(e.target.value);
              setErrors((prev) => ({ ...prev, representativeName: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('representativeName')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('representativeName', e.target.value, validateRepresentativeName)
          }
          disabled={isSubmitting}
          aria-label="代表者名"
          aria-invalid={!!errors.representativeName}
          aria-describedby={errors.representativeName ? representativeNameErrorId : undefined}
          style={getInputStyle('representativeName', !!errors.representativeName)}
        />
        {errors.representativeName && (
          <p
            id={representativeNameErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.representativeName}
          </p>
        )}
      </div>

      {/* 電話番号 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={phoneNumberId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.phoneNumber ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          電話番号
        </label>
        <input
          id={phoneNumberId}
          type="tel"
          value={phoneNumber}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPhoneNumber(e.target.value);
            if (touched.phoneNumber) {
              const error = validatePhoneNumber(e.target.value);
              setErrors((prev) => ({ ...prev, phoneNumber: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('phoneNumber')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('phoneNumber', e.target.value, validatePhoneNumber)
          }
          disabled={isSubmitting}
          aria-label="電話番号"
          aria-invalid={!!errors.phoneNumber}
          aria-describedby={errors.phoneNumber ? phoneNumberErrorId : undefined}
          style={getInputStyle('phoneNumber', !!errors.phoneNumber)}
        />
        {errors.phoneNumber && (
          <p
            id={phoneNumberErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.phoneNumber}
          </p>
        )}
      </div>

      {/* FAX番号 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={faxNumberId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.faxNumber ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          FAX番号
        </label>
        <input
          id={faxNumberId}
          type="tel"
          value={faxNumber}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setFaxNumber(e.target.value);
            if (touched.faxNumber) {
              const error = validateFaxNumber(e.target.value);
              setErrors((prev) => ({ ...prev, faxNumber: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('faxNumber')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('faxNumber', e.target.value, validateFaxNumber)
          }
          disabled={isSubmitting}
          aria-label="FAX番号"
          aria-invalid={!!errors.faxNumber}
          aria-describedby={errors.faxNumber ? faxNumberErrorId : undefined}
          style={getInputStyle('faxNumber', !!errors.faxNumber)}
        />
        {errors.faxNumber && (
          <p
            id={faxNumberErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.faxNumber}
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
              const error = validateEmail(e.target.value);
              setErrors((prev) => ({ ...prev, email: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('email')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleTextFieldBlur('email', e.target.value, validateEmail)
          }
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

      {/* 請求締日 */}
      <BillingClosingDaySelect
        value={billingClosingDay}
        onChange={setBillingClosingDay}
        label="請求締日"
        disabled={isSubmitting}
      />

      {/* 支払日 */}
      <PaymentDateSelect
        monthOffset={paymentMonthOffset}
        day={paymentDay}
        onChange={handlePaymentDateChange}
        label="支払日"
        disabled={isSubmitting}
      />

      {/* 備考 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor={notesId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.notes ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          備考
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setNotes(e.target.value);
            if (touched.notes) {
              const error = validateNotes(e.target.value);
              setErrors((prev) => ({ ...prev, notes: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('notes')}
          onBlur={(e: FocusEvent<HTMLTextAreaElement>) =>
            handleTextFieldBlur('notes', e.target.value, validateNotes)
          }
          disabled={isSubmitting}
          rows={4}
          aria-label="備考"
          aria-invalid={!!errors.notes}
          aria-describedby={errors.notes ? notesErrorId : undefined}
          style={{
            ...getInputStyle('notes', !!errors.notes),
            resize: 'vertical',
            minHeight: '100px',
          }}
        />
        {errors.notes && (
          <p
            id={notesErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.notes}
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

export default TradingPartnerForm;
