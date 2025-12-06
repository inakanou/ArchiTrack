/**
 * @fileoverview プロジェクト管理機能の型定義
 *
 * Requirements:
 * - 10.1: プロジェクトステータスとして12種類を提供
 * - 10.11: 遷移種別として4種類を定義（initial, forward, backward, terminate）
 */

/**
 * プロジェクトステータス
 * ワークフロー順: 準備中 → 調査中 → 見積中 → 決裁待ち → 契約中 → 工事中 → 引渡中 → 請求中 → 入金待ち → 完了
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
 * プロジェクトステータス型
 */
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * ステータス遷移種別
 * - initial: 初期遷移（プロジェクト作成時、fromStatusなし）
 * - forward: 順方向遷移（ワークフロー進行）
 * - backward: 差し戻し遷移（1つ前のステータスへ戻る）
 * - terminate: 終端遷移（完了・中止・失注）
 */
export const TRANSITION_TYPES = ['initial', 'forward', 'backward', 'terminate'] as const;

/**
 * ステータス遷移種別型
 */
export type TransitionType = (typeof TRANSITION_TYPES)[number];

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
