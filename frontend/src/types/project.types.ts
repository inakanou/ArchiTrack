/**
 * @fileoverview プロジェクト管理機能 型定義ファイル
 *
 * フロントエンド用のプロジェクト管理に関する型定義を提供します。
 *
 * Requirements:
 * - 10.1: プロジェクトステータスとして12種類を提供
 * - 10.11: 遷移種別として4種類を定義（initial, forward, backward, terminate）
 */

// ============================================================================
// 定数定義
// ============================================================================

/**
 * プロジェクトステータス
 * ワークフロー順: 準備中 -> 調査中 -> 見積中 -> 決裁待ち -> 契約中 -> 工事中 -> 引渡中 -> 請求中 -> 入金待ち -> 完了
 * 終端ステータス: 完了、中止、失注
 */
export const PROJECT_STATUSES = [
  'PREPARING', // 準備中
  'SURVEYING', // 調査中
  'ESTIMATING', // 見積中
  'APPROVING', // 決裁待ち
  'CONTRACTING', // 契約中
  'CONSTRUCTING', // 工事中
  'DELIVERING', // 引渡中
  'BILLING', // 請求中
  'AWAITING', // 入金待ち
  'COMPLETED', // 完了
  'CANCELLED', // 中止
  'LOST', // 失注
] as const;

/**
 * ステータス遷移種別
 * - initial: 初期遷移（プロジェクト作成時、fromStatusなし）
 * - forward: 順方向遷移（ワークフロー進行）
 * - backward: 差し戻し遷移（1つ前のステータスへ戻る）
 * - terminate: 終端遷移（完了・中止・失注）
 */
export const TRANSITION_TYPES = ['initial', 'forward', 'backward', 'terminate'] as const;

/**
 * プロジェクトステータスの日本語ラベルマッピング
 */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PREPARING: '準備中',
  SURVEYING: '調査中',
  ESTIMATING: '見積中',
  APPROVING: '決裁待ち',
  CONTRACTING: '契約中',
  CONSTRUCTING: '工事中',
  DELIVERING: '引渡中',
  BILLING: '請求中',
  AWAITING: '入金待ち',
  COMPLETED: '完了',
  CANCELLED: '中止',
  LOST: '失注',
};

/**
 * 遷移種別の日本語ラベルマッピング
 */
export const TRANSITION_TYPE_LABELS: Record<TransitionType, string> = {
  initial: '初期遷移',
  forward: '順方向遷移',
  backward: '差し戻し遷移',
  terminate: '終端遷移',
};

// ============================================================================
// 型定義
// ============================================================================

/**
 * プロジェクトステータス型
 */
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * ステータス遷移種別型
 */
export type TransitionType = (typeof TRANSITION_TYPES)[number];

/**
 * ユーザー情報サマリー（一覧・詳細表示用）
 */
export interface UserSummary {
  /** ユーザーID */
  id: string;
  /** 表示名 */
  displayName: string;
}

/**
 * プロジェクト情報（一覧表示用）
 */
export interface ProjectInfo {
  /** プロジェクトID */
  id: string;
  /** プロジェクト名 */
  name: string;
  /** 顧客名 */
  customerName: string;
  /** 営業担当者 */
  salesPerson: UserSummary;
  /** 工事担当者（任意） */
  constructionPerson?: UserSummary;
  /** ステータス */
  status: ProjectStatus;
  /** ステータスラベル（日本語） */
  statusLabel: string;
  /** 作成日時（ISO8601形式） */
  createdAt: string;
  /** 更新日時（ISO8601形式） */
  updatedAt: string;
}

/**
 * プロジェクト詳細情報（詳細表示用）
 * ProjectInfoを拡張し、追加フィールドを持つ
 */
export interface ProjectDetail extends ProjectInfo {
  /** 現場住所（任意） */
  siteAddress?: string;
  /** 概要（任意） */
  description?: string;
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
 * ページネーション付きプロジェクト一覧レスポンス
 */
export interface PaginatedProjects {
  /** プロジェクト一覧 */
  data: ProjectInfo[];
  /** ページネーション情報 */
  pagination: PaginationInfo;
}

/**
 * ステータス変更履歴レスポンス
 */
export interface StatusHistoryResponse {
  /** 履歴ID */
  id: string;
  /** 変更前ステータス（初期遷移時はnull） */
  fromStatus: ProjectStatus | null;
  /** 変更前ステータスラベル（初期遷移時はnull） */
  fromStatusLabel: string | null;
  /** 変更後ステータス */
  toStatus: ProjectStatus;
  /** 変更後ステータスラベル */
  toStatusLabel: string;
  /** 遷移種別 */
  transitionType: TransitionType;
  /** 遷移種別ラベル */
  transitionTypeLabel: string;
  /** 差し戻し理由（差し戻し遷移時のみ） */
  reason: string | null;
  /** 変更者 */
  changedBy: UserSummary;
  /** 変更日時（ISO8601形式） */
  changedAt: string;
}

/**
 * 許可された遷移先
 */
export interface AllowedTransition {
  /** 遷移先ステータス */
  status: ProjectStatus;
  /** 遷移種別 */
  type: TransitionType;
  /** 理由入力が必要かどうか（差し戻し遷移時はtrue） */
  requiresReason: boolean;
}

/**
 * 担当者候補（ドロップダウン選択用）
 */
export interface AssignableUser {
  /** ユーザーID */
  id: string;
  /** 表示名 */
  displayName: string;
}

// ============================================================================
// 入力型定義
// ============================================================================

/**
 * プロジェクト作成入力
 */
export interface CreateProjectInput {
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
 * プロジェクト更新入力
 */
export interface UpdateProjectInput {
  /** プロジェクト名（1-255文字） */
  name?: string;
  /** 顧客名（1-255文字） */
  customerName?: string;
  /** 営業担当者ID（UUID） */
  salesPersonId?: string;
  /** 工事担当者ID（UUID） */
  constructionPersonId?: string;
  /** 現場住所（最大500文字） */
  siteAddress?: string;
  /** 概要（最大5000文字） */
  description?: string;
}

/**
 * プロジェクトフィルタ
 */
export interface ProjectFilter {
  /** 検索キーワード（プロジェクト名・顧客名の部分一致） */
  search?: string;
  /** ステータスフィルタ（複数指定可） */
  status?: ProjectStatus[];
  /** 作成日開始（ISO8601形式） */
  createdFrom?: string;
  /** 作成日終了（ISO8601形式） */
  createdTo?: string;
}

/**
 * ステータス変更入力
 */
export interface StatusChangeInput {
  /** 新しいステータス */
  status: ProjectStatus;
  /** 差し戻し理由（差し戻し遷移時は必須） */
  reason?: string;
}

// ============================================================================
// タイプガード関数
// ============================================================================

/**
 * 値がProjectStatusかどうかを判定するタイプガード
 *
 * @param value - 判定する値
 * @returns valueがProjectStatusならtrue
 */
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value as string)
  );
}

/**
 * 値がTransitionTypeかどうかを判定するタイプガード
 *
 * @param value - 判定する値
 * @returns valueがTransitionTypeならtrue
 */
export function isTransitionType(value: unknown): value is TransitionType {
  return (
    typeof value === 'string' && (TRANSITION_TYPES as readonly string[]).includes(value as string)
  );
}

// ============================================================================
// ラベル取得関数
// ============================================================================

/**
 * プロジェクトステータスの日本語ラベルを取得
 *
 * @param status - プロジェクトステータス
 * @returns 日本語ラベル（無効なステータスの場合はundefined）
 */
export function getProjectStatusLabel(status: ProjectStatus): string | undefined {
  return PROJECT_STATUS_LABELS[status];
}

/**
 * 遷移種別の日本語ラベルを取得
 *
 * @param type - 遷移種別
 * @returns 日本語ラベル（無効な種別の場合はundefined）
 */
export function getTransitionTypeLabel(type: TransitionType): string | undefined {
  return TRANSITION_TYPE_LABELS[type];
}
