/**
 * @fileoverview 取引先管理機能 型定義ファイル
 *
 * フロントエンド用の取引先管理に関する型定義を提供します。
 *
 * Requirements:
 * - 6.1: 顧客と協力業者の2種類の取引先種別をシステムで提供
 * - 6.3: 取引先種別の複数選択を許可し、1つの取引先が顧客と協力業者の両方であることを可能とする
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 取引先種別
 * - CUSTOMER: 顧客
 * - SUBCONTRACTOR: 協力業者
 *
 * Requirements: 6.1
 */
export const TRADING_PARTNER_TYPES = ['CUSTOMER', 'SUBCONTRACTOR'] as const;

/**
 * 取引先種別の日本語ラベルマッピング
 */
export const TRADING_PARTNER_TYPE_LABELS: Record<TradingPartnerType, string> = {
  CUSTOMER: '顧客',
  SUBCONTRACTOR: '協力業者',
};

// ============================================================================
// 型定義
// ============================================================================

/**
 * 取引先種別型
 * Requirements: 6.1
 */
export type TradingPartnerType = (typeof TRADING_PARTNER_TYPES)[number];

/**
 * 取引先情報（一覧表示用）
 */
export interface TradingPartnerInfo {
  /** 取引先ID */
  id: string;
  /** 取引先名 */
  name: string;
  /** フリガナ */
  nameKana: string;
  /** 部課/支店/支社名 */
  branchName: string | null;
  /** 部課/支店/支社フリガナ */
  branchNameKana: string | null;
  /** 代表者名 */
  representativeName: string | null;
  /** 代表者フリガナ */
  representativeNameKana: string | null;
  /** 取引先種別（複数選択可） */
  types: TradingPartnerType[];
  /** 住所 */
  address: string;
  /** 電話番号 */
  phoneNumber: string | null;
  /** FAX番号 */
  faxNumber: string | null;
  /** メールアドレス */
  email: string | null;
  /** 請求締日（1-31 or 99=末日） */
  billingClosingDay: number | null;
  /** 支払月オフセット（1=翌月, 2=翌々月, 3=3ヶ月後） */
  paymentMonthOffset: number | null;
  /** 支払日（1-31 or 99=末日） */
  paymentDay: number | null;
  /** 備考 */
  notes: string | null;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * 取引先詳細情報（詳細表示用）
 * TradingPartnerInfoを拡張（将来的にプロジェクト一覧などを追加予定）
 *
 * 現在はTradingPartnerInfoと同一ですが、将来的にプロジェクト連携情報を追加予定
 */
export type TradingPartnerDetail = TradingPartnerInfo;

/**
 * 取引先検索結果（オートコンプリート用）
 */
export interface TradingPartnerSearchResult {
  /** 取引先ID */
  id: string;
  /** 取引先名 */
  name: string;
  /** フリガナ */
  nameKana: string;
  /** 取引先種別 */
  types: TradingPartnerType[];
}

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  /** 現在のページ番号（1始まり） */
  page: number;
  /** 1ページあたりの件数 */
  limit: number;
  /** 総件数 */
  total: number;
  /** 総ページ数 */
  totalPages: number;
}

/**
 * ページネーション付き取引先一覧レスポンス
 */
export interface PaginatedTradingPartners {
  /** 取引先一覧 */
  data: TradingPartnerInfo[];
  /** ページネーション情報 */
  pagination: PaginationInfo;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * 取引先作成入力
 */
export interface CreateTradingPartnerInput {
  /** 取引先名（1-200文字、必須） */
  name: string;
  /** フリガナ（1-200文字、カタカナのみ、必須） */
  nameKana: string;
  /** 取引先種別（1つ以上必須） */
  types: TradingPartnerType[];
  /** 住所（1-500文字、必須） */
  address: string;
  /** 部課/支店/支社名（最大100文字、任意） */
  branchName?: string | null;
  /** 部課/支店/支社フリガナ（最大100文字、カタカナのみ、任意） */
  branchNameKana?: string | null;
  /** 代表者名（最大100文字、任意） */
  representativeName?: string | null;
  /** 代表者フリガナ（最大100文字、カタカナのみ、任意） */
  representativeNameKana?: string | null;
  /** 電話番号（任意） */
  phoneNumber?: string | null;
  /** FAX番号（任意） */
  faxNumber?: string | null;
  /** メールアドレス（任意） */
  email?: string | null;
  /** 請求締日（1-31 or 99=末日、任意） */
  billingClosingDay?: number | null;
  /** 支払月オフセット（1-3、任意） */
  paymentMonthOffset?: number | null;
  /** 支払日（1-31 or 99=末日、任意） */
  paymentDay?: number | null;
  /** 備考（最大2000文字、任意） */
  notes?: string | null;
}

/**
 * 取引先更新入力
 */
export interface UpdateTradingPartnerInput extends Partial<CreateTradingPartnerInput> {
  /** 楽観的排他制御用の期待される更新日時（ISO8601形式） */
  expectedUpdatedAt: string;
}

/**
 * 取引先フィルタ
 */
export interface TradingPartnerFilter {
  /** 検索キーワード（取引先名・フリガナの部分一致） */
  search?: string;
  /** 種別フィルタ（複数指定可） */
  type?: TradingPartnerType[];
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がTradingPartnerTypeかどうかを判定するタイプガード
 *
 * @param value - 判定する値
 * @returns valueがTradingPartnerTypeならtrue
 */
export function isTradingPartnerType(value: unknown): value is TradingPartnerType {
  return (
    typeof value === 'string' &&
    (TRADING_PARTNER_TYPES as readonly string[]).includes(value as string)
  );
}

// ============================================================================
// ラベル取得関数
// ============================================================================

/**
 * 取引先種別の日本語ラベルを取得
 *
 * @param type - 取引先種別
 * @returns 日本語ラベル（無効な種別の場合はundefined）
 */
export function getTradingPartnerTypeLabel(type: TradingPartnerType): string | undefined {
  return TRADING_PARTNER_TYPE_LABELS[type];
}
