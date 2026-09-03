/**
 * @fileoverview プロジェクト管理機能の型定義
 *
 * Requirements:
 * - 10.1: プロジェクトステータスとして12種類を提供
 * - 10.11: 遷移種別として「順方向遷移」「差し戻し遷移」「終端遷移（完了・中止・失注）」の
 *   3種類を定義する。TRANSITION_TYPES が4値なのは、この3種類に加えて
 *   ステータス間の遷移ではない initial を持つためである（下記の定義の注釈を参照）。
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
 *
 * project-management 要件10 の 11 が「遷移種別」として定義するのは
 * 「順方向遷移」「差し戻し遷移」「終端遷移（完了・中止・失注）」の3種類であり、
 * initial はそこに含まれない。initial はステータス間の遷移ではなく、プロジェクト作成時に
 * `fromStatus = null` で記録される初期履歴の印である。この値を本番で書き込むのは
 * `backend/src/services/project.service.ts` の `createProject` の一箇所だけであり、
 * 遷移表 `STATUS_TRANSITIONS`（`backend/src/services/project-status.service.ts`）は
 * 要素の型を `Exclude<TransitionType, 'initial'>` としているため、遷移の判定を担う
 * `getTransitionType` が initial を返す経路は存在しない。
 * よって本定数は「要件が定義する3種類 + 履歴の印 initial」の4値である。
 *
 * ただしこの整理は本注釈の時点でファイル全体へは行き渡っていない。下方の
 * `TRANSITION_TYPE_LABELS` は initial に「初期遷移」という遷移を名乗るラベルを与えたままで、
 * この文言は `backend/src/routes/projects.routes.ts` の 499 行目・1080 行目を通って
 * `transitionTypeLabel` として画面へ届く。ラベルの差し替えは表示の変更であり
 * （`backend/src/__tests__/unit/types/project.types.test.ts` の
 * `getTransitionTypeLabel` が '初期遷移' を固定している）、本注釈が属するタスクの
 * 境界の外にあるため手を付けていない。したがって「initial は遷移ではない」という
 * 上記の整理と当該ラベルの文言は、現時点では食い違ったまま残っている。
 *
 * - initial: 初期履歴の印（プロジェクト作成時、fromStatusなし。遷移ではない）
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
