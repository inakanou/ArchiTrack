/**
 * @fileoverview 自社情報機能 型定義ファイル
 *
 * フロントエンド用の自社情報管理に関する型定義を提供します。
 *
 * Task 5.1: APIクライアントの実装
 *
 * Requirements:
 * - 9.7: APIレスポンスに以下のフィールドを含める: id, companyName, address, representative, phone, fax, email, invoiceRegistrationNumber, version, createdAt, updatedAt
 * - 2.7: 楽観的排他制御（versionフィールド）を実装
 * - 4.1-4.10: データバリデーション用の型定義
 */

// ============================================================================
// API レスポンス型定義
// ============================================================================

/**
 * 自社情報
 * APIレスポンスの型定義
 *
 * Requirements: 9.7
 */
export interface CompanyInfo {
  /** 自社情報ID（UUID） */
  id: string;
  /** 会社名（必須、最大200文字） */
  companyName: string;
  /** 住所（必須、最大500文字） */
  address: string;
  /** 代表者（必須、最大100文字） */
  representative: string;
  /** 電話番号（任意、最大20文字） */
  phone: string | null;
  /** FAX番号（任意、最大20文字） */
  fax: string | null;
  /** メールアドレス（任意、最大254文字） */
  email: string | null;
  /** 適格請求書発行事業者登録番号（任意、T+13桁数字） */
  invoiceRegistrationNumber: string | null;
  /** 楽観的排他制御用バージョン */
  version: number;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 自社情報取得レスポンス
 * 未登録時は空オブジェクトを返却
 *
 * Requirements: 9.3
 */
export type CompanyInfoResponse = CompanyInfo | Record<string, never>;

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 自社情報更新入力
 *
 * Requirements: 4.1-4.10
 */
export interface UpdateCompanyInfoInput {
  /** 会社名（必須、最大200文字） */
  companyName: string;
  /** 住所（必須、最大500文字） */
  address: string;
  /** 代表者（必須、最大100文字） */
  representative: string;
  /** 電話番号（任意、最大20文字、数字・ハイフン・括弧のみ） */
  phone?: string | null;
  /** FAX番号（任意、最大20文字、数字・ハイフン・括弧のみ） */
  fax?: string | null;
  /** メールアドレス（任意、最大254文字） */
  email?: string | null;
  /** 適格請求書発行事業者登録番号（任意、T+13桁数字） */
  invoiceRegistrationNumber?: string | null;
  /** 楽観的排他制御用バージョン（更新時必須） */
  version?: number;
}

// ============================================================================
// フォーム状態型定義
// ============================================================================

/**
 * 自社情報フォームデータ
 * フォームの入力値管理用
 */
export interface CompanyInfoFormData {
  /** 会社名 */
  companyName: string;
  /** 住所 */
  address: string;
  /** 代表者 */
  representative: string;
  /** 電話番号 */
  phone: string;
  /** FAX番号 */
  fax: string;
  /** メールアドレス */
  email: string;
  /** 適格請求書発行事業者登録番号 */
  invoiceRegistrationNumber: string;
  /** 楽観的排他制御用バージョン */
  version: number;
}

/**
 * 自社情報フォームエラー
 * フィールドごとのエラーメッセージ
 */
export interface CompanyInfoFormErrors {
  companyName?: string;
  address?: string;
  representative?: string;
  phone?: string;
  fax?: string;
  email?: string;
  invoiceRegistrationNumber?: string;
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がCompanyInfoかどうかを判定するタイプガード
 *
 * @param value - 判定する値
 * @returns valueがCompanyInfoならtrue
 */
export function isCompanyInfo(value: unknown): value is CompanyInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.companyName === 'string' &&
    typeof obj.address === 'string' &&
    typeof obj.representative === 'string' &&
    typeof obj.version === 'number' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string'
  );
}

/**
 * 自社情報レスポンスが空かどうかを判定
 *
 * @param response - 自社情報レスポンス
 * @returns 空オブジェクトならtrue（未登録）
 */
export function isEmptyCompanyInfoResponse(
  response: CompanyInfoResponse
): response is Record<string, never> {
  return !isCompanyInfo(response);
}

// ============================================================================
// 初期値
// ============================================================================

/**
 * 自社情報フォームの初期値
 */
export const EMPTY_COMPANY_INFO_FORM_DATA: CompanyInfoFormData = {
  companyName: '',
  address: '',
  representative: '',
  phone: '',
  fax: '',
  email: '',
  invoiceRegistrationNumber: '',
  version: 0,
};

/**
 * CompanyInfoからFormDataへ変換
 *
 * @param companyInfo - 自社情報
 * @returns フォームデータ
 */
export function companyInfoToFormData(companyInfo: CompanyInfo): CompanyInfoFormData {
  return {
    companyName: companyInfo.companyName,
    address: companyInfo.address,
    representative: companyInfo.representative,
    phone: companyInfo.phone ?? '',
    fax: companyInfo.fax ?? '',
    email: companyInfo.email ?? '',
    invoiceRegistrationNumber: companyInfo.invoiceRegistrationNumber ?? '',
    version: companyInfo.version,
  };
}

/**
 * FormDataからUpdateCompanyInfoInputへ変換
 *
 * @param formData - フォームデータ
 * @returns 更新入力
 */
export function formDataToUpdateInput(formData: CompanyInfoFormData): UpdateCompanyInfoInput {
  return {
    companyName: formData.companyName,
    address: formData.address,
    representative: formData.representative,
    phone: formData.phone || null,
    fax: formData.fax || null,
    email: formData.email || null,
    invoiceRegistrationNumber: formData.invoiceRegistrationNumber || null,
    version: formData.version > 0 ? formData.version : undefined,
  };
}
