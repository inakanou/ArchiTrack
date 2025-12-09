/**
 * @fileoverview プロジェクト作成・編集フォームコンポーネント
 *
 * プロジェクトの作成および編集に使用するフォームUIを提供します。
 * CustomerNameInputとUserSelectコンポーネントを利用し、
 * クライアントサイドバリデーションを実装しています。
 *
 * Requirements:
 * - 1.1: 「新規作成」ボタンでプロジェクト作成フォームを表示する
 * - 1.2: プロジェクト名（必須）、顧客名（必須）、営業担当者（必須）、工事担当者（任意）、現場住所（任意）、概要（任意）の入力フィールドを表示
 * - 1.3: 顧客名フィールドでオートコンプリート候補を表示する（将来実装）
 * - 1.4: オートコンプリート候補から取引先を選択する（将来実装）
 * - 1.5: 営業担当者フィールドのデフォルト値としてログインユーザーを設定
 * - 1.6: 工事担当者フィールドのデフォルト値としてログインユーザーを設定
 * - 1.9: 必須項目を入力せずに「作成」ボタンをクリックした場合、入力エラーメッセージを該当フィールドに表示
 * - 1.10: プロジェクト名が未入力の場合、「プロジェクト名は必須です」エラーを表示
 * - 1.11: プロジェクト名が255文字を超える場合、「プロジェクト名は255文字以内で入力してください」エラーを表示
 * - 1.12: 顧客名が未入力の場合、「顧客名は必須です」エラーを表示
 * - 1.13: 営業担当者が未選択の場合、「営業担当者は必須です」エラーを表示
 * - 8.1: プロジェクト詳細画面で「編集」ボタンをクリックすると編集フォームを表示
 * - 8.4: バリデーションエラーが発生するとエラーメッセージを該当フィールドに表示
 * - 8.5: 「キャンセル」ボタンをクリックすると編集内容を破棄し、詳細表示に戻る
 * - 13.10: フロントエンドでバリデーションエラーが発生した場合、エラーメッセージを即座に表示
 * - 20.1: すべての操作をキーボードのみで実行可能
 * - 20.2: フォーム要素にaria-label属性を適切に設定
 * - 20.4: フォーカス状態を視覚的に明確に表示
 */

import { useState, useCallback, useId, FormEvent, ChangeEvent, FocusEvent } from 'react';
import CustomerNameInput from './CustomerNameInput';
import UserSelect from './UserSelect';

/**
 * プロジェクトフォームデータ
 */
export interface ProjectFormData {
  /** プロジェクト名（1-255文字、必須） */
  name: string;
  /** 顧客名（1-255文字、必須） */
  customerName: string;
  /** 営業担当者ID（UUID、必須） */
  salesPersonId: string;
  /** 工事担当者ID（UUID、任意） */
  constructionPersonId?: string;
  /** 現場住所（最大500文字、任意） */
  siteAddress?: string;
  /** 概要（最大5000文字、任意） */
  description?: string;
}

/**
 * ProjectFormコンポーネントのプロパティ
 */
export interface ProjectFormProps {
  /** フォームモード */
  mode: 'create' | 'edit';
  /** 初期データ（編集モード時） */
  initialData?: Partial<ProjectFormData>;
  /** フォーム送信時のコールバック */
  onSubmit: (data: ProjectFormData) => Promise<void>;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中フラグ */
  isSubmitting: boolean;
}

/** バリデーション定数 */
const VALIDATION = {
  NAME_MAX_LENGTH: 255,
  CUSTOMER_NAME_MAX_LENGTH: 255,
  SITE_ADDRESS_MAX_LENGTH: 500,
  DESCRIPTION_MAX_LENGTH: 5000,
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
  customerName?: string;
  salesPersonId?: string;
  constructionPersonId?: string;
  siteAddress?: string;
  description?: string;
}

/**
 * プロジェクトフォームコンポーネント
 *
 * @example
 * ```tsx
 * <ProjectForm
 *   mode="create"
 *   onSubmit={async (data) => { await createProject(data); }}
 *   onCancel={() => navigate('/projects')}
 *   isSubmitting={false}
 * />
 * ```
 */
function ProjectForm({ mode, initialData, onSubmit, onCancel, isSubmitting }: ProjectFormProps) {
  // フォームの値
  const [name, setName] = useState(initialData?.name ?? '');
  const [customerName, setCustomerName] = useState(initialData?.customerName ?? '');
  const [salesPersonId, setSalesPersonId] = useState(initialData?.salesPersonId ?? '');
  const [constructionPersonId, setConstructionPersonId] = useState(
    initialData?.constructionPersonId ?? ''
  );
  const [siteAddress, setSiteAddress] = useState(initialData?.siteAddress ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');

  // エラー状態
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // フォーカス状態
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 一意のID生成
  const uniqueId = useId();
  const formId = `project-form-${uniqueId}`;
  const nameId = `name-${uniqueId}`;
  const nameErrorId = `name-error-${uniqueId}`;
  const siteAddressId = `site-address-${uniqueId}`;
  const siteAddressErrorId = `site-address-error-${uniqueId}`;
  const descriptionId = `description-${uniqueId}`;
  const descriptionErrorId = `description-error-${uniqueId}`;

  // Note: initialDataの変更時にフォームをリセットする場合は、
  // 親コンポーネントで<ProjectForm key={projectId} ... />のようにkeyを指定してください。
  // これにより、コンポーネントが再マウントされ、初期値が正しく設定されます。

  /**
   * プロジェクト名のバリデーション
   */
  const validateName = useCallback((value: string): string => {
    if (!value.trim()) {
      return 'プロジェクト名は必須です';
    }
    if (value.length > VALIDATION.NAME_MAX_LENGTH) {
      return `プロジェクト名は${VALIDATION.NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 顧客名のバリデーション
   */
  const validateCustomerName = useCallback((value: string): string => {
    if (!value.trim()) {
      return '顧客名は必須です';
    }
    if (value.length > VALIDATION.CUSTOMER_NAME_MAX_LENGTH) {
      return `顧客名は${VALIDATION.CUSTOMER_NAME_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 営業担当者のバリデーション
   */
  const validateSalesPersonId = useCallback((value: string): string => {
    if (!value) {
      return '営業担当者は必須です';
    }
    return '';
  }, []);

  /**
   * 現場住所のバリデーション
   */
  const validateSiteAddress = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.SITE_ADDRESS_MAX_LENGTH) {
      return `現場住所は${VALIDATION.SITE_ADDRESS_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 概要のバリデーション
   */
  const validateDescription = useCallback((value: string): string => {
    if (value && value.length > VALIDATION.DESCRIPTION_MAX_LENGTH) {
      return `概要は${VALIDATION.DESCRIPTION_MAX_LENGTH}文字以内で入力してください`;
    }
    return '';
  }, []);

  /**
   * 全フィールドのバリデーションを実行
   */
  const validateAll = useCallback((): boolean => {
    const nameError = validateName(name);
    const customerNameError = validateCustomerName(customerName);
    const salesPersonIdError = validateSalesPersonId(salesPersonId);
    const siteAddressError = validateSiteAddress(siteAddress);
    const descriptionError = validateDescription(description);

    const newErrors: FieldErrors = {};
    if (nameError) newErrors.name = nameError;
    if (customerNameError) newErrors.customerName = customerNameError;
    if (salesPersonIdError) newErrors.salesPersonId = salesPersonIdError;
    if (siteAddressError) newErrors.siteAddress = siteAddressError;
    if (descriptionError) newErrors.description = descriptionError;

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  }, [
    name,
    customerName,
    salesPersonId,
    siteAddress,
    description,
    validateName,
    validateCustomerName,
    validateSalesPersonId,
    validateSiteAddress,
    validateDescription,
  ]);

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
        case 'siteAddress':
          error = validateSiteAddress(value);
          break;
        case 'description':
          error = validateDescription(value);
          break;
        default:
          break;
      }

      setErrors((prev) => ({
        ...prev,
        [fieldName]: error || undefined,
      }));
    },
    [validateName, validateSiteAddress, validateDescription]
  );

  /**
   * 顧客名のblurイベントハンドラ
   */
  const handleCustomerNameBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, customerName: true }));
    const error = validateCustomerName(customerName);
    setErrors((prev) => ({
      ...prev,
      customerName: error || undefined,
    }));
  }, [customerName, validateCustomerName]);

  /**
   * 営業担当者のblurイベントハンドラ
   */
  const handleSalesPersonBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, salesPersonId: true }));
    const error = validateSalesPersonId(salesPersonId);
    setErrors((prev) => ({
      ...prev,
      salesPersonId: error || undefined,
    }));
  }, [salesPersonId, validateSalesPersonId]);

  /**
   * フォーム送信ハンドラ
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 全フィールドをタッチ済みにする
    setTouched({
      name: true,
      customerName: true,
      salesPersonId: true,
      constructionPersonId: true,
      siteAddress: true,
      description: true,
    });

    // バリデーション
    if (!validateAll()) {
      return;
    }

    // 送信データを構築
    const formData: ProjectFormData = {
      name: name.trim(),
      customerName: customerName.trim(),
      salesPersonId,
      constructionPersonId: constructionPersonId || undefined,
      siteAddress: siteAddress.trim() || undefined,
      description: description.trim() || undefined,
    };

    await onSubmit(formData);
  };

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

  return (
    <form id={formId} onSubmit={handleSubmit} role="form" style={{ maxWidth: '600px' }}>
      {/* プロジェクト名 */}
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
          プロジェクト名
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
          aria-label="プロジェクト名"
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

      {/* 顧客名 */}
      <CustomerNameInput
        value={customerName}
        onChange={setCustomerName}
        onBlur={handleCustomerNameBlur}
        required
        disabled={isSubmitting}
        error={errors.customerName}
      />

      {/* 営業担当者 */}
      <UserSelect
        value={salesPersonId}
        onChange={setSalesPersonId}
        onBlur={handleSalesPersonBlur}
        label="営業担当者"
        required
        disabled={isSubmitting}
        error={errors.salesPersonId}
        defaultToCurrentUser={mode === 'create'}
      />

      {/* 工事担当者 */}
      <UserSelect
        value={constructionPersonId}
        onChange={setConstructionPersonId}
        label="工事担当者"
        disabled={isSubmitting}
        defaultToCurrentUser={mode === 'create'}
      />

      {/* 現場住所 */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor={siteAddressId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.siteAddress ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          現場住所
        </label>
        <input
          id={siteAddressId}
          type="text"
          value={siteAddress}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setSiteAddress(e.target.value);
            if (touched.siteAddress) {
              const error = validateSiteAddress(e.target.value);
              setErrors((prev) => ({ ...prev, siteAddress: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('siteAddress')}
          onBlur={(e: FocusEvent<HTMLInputElement>) =>
            handleFieldBlur('siteAddress', e.target.value)
          }
          disabled={isSubmitting}
          aria-label="現場住所"
          aria-invalid={!!errors.siteAddress}
          aria-describedby={errors.siteAddress ? siteAddressErrorId : undefined}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: errors.siteAddress
              ? `2px solid ${STYLES.colors.error}`
              : `1px solid ${getBorderColor('siteAddress', !!errors.siteAddress)}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'text',
            transition: STYLES.transition,
            boxShadow: getBoxShadow('siteAddress', !!errors.siteAddress),
          }}
        />
        {errors.siteAddress && (
          <p
            id={siteAddressErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.siteAddress}
          </p>
        )}
      </div>

      {/* 概要 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor={descriptionId}
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: 500,
            color: errors.description ? STYLES.colors.error : STYLES.colors.label,
          }}
        >
          概要
        </label>
        <textarea
          id={descriptionId}
          value={description}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            setDescription(e.target.value);
            if (touched.description) {
              const error = validateDescription(e.target.value);
              setErrors((prev) => ({ ...prev, description: error || undefined }));
            }
          }}
          onFocus={() => setFocusedField('description')}
          onBlur={(e: FocusEvent<HTMLTextAreaElement>) =>
            handleFieldBlur('description', e.target.value)
          }
          disabled={isSubmitting}
          rows={4}
          aria-label="概要"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? descriptionErrorId : undefined}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: errors.description
              ? `2px solid ${STYLES.colors.error}`
              : `1px solid ${getBorderColor('description', !!errors.description)}`,
            borderRadius: STYLES.borderRadius,
            fontSize: '1rem',
            lineHeight: '1.5',
            color: isSubmitting ? STYLES.colors.disabled : STYLES.colors.text,
            backgroundColor: isSubmitting ? STYLES.colors.disabledBg : STYLES.colors.white,
            outline: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'text',
            transition: STYLES.transition,
            boxShadow: getBoxShadow('description', !!errors.description),
            resize: 'vertical',
            minHeight: '100px',
          }}
        />
        {errors.description && (
          <p
            id={descriptionErrorId}
            role="alert"
            aria-live="polite"
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: STYLES.colors.error,
            }}
          >
            {errors.description}
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
            opacity: isSubmitting ? 0.5 : 1,
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

export default ProjectForm;
