/**
 * @fileoverview 工事写真・工事看板の「対象が利用できるか」の共通の判定
 *
 * 工事写真のアルバム・写真項目と工事看板の操作は、対象のリソースとその所属プロジェクトが
 * 実在し、どちらも取り除かれていない（論理削除されていない）ときだけ行う。受入基準 13.2・13.3 の
 * 「アクセス可能なプロジェクト」を、実在し取り除かれていないプロジェクトと読む
 * （Task 23.1 の利用者の判断）。アクセスできる利用者はルートの RBAC 権限（requirePermission）
 * だけで決め、ここではプロジェクトの担当者（作成者・営業担当・工事担当）を読まない。
 *
 * プロジェクトの論理削除は、配下のアルバム・看板へ波及しない（`ProjectService.deleteProject` は
 * プロジェクトの行だけに `deletedAt` を立てる）。そのため各操作は、対象の行と一緒に所属
 * プロジェクトの論理削除の状態を同じ問い合わせで読み、本ファイルの判定に掛ける。
 *
 * アルバム・写真項目・看板のサービスが共有する判定であり、どのサービスにも依存しない。
 *
 * @module services/construction-photo-availability
 */

/**
 * 所属プロジェクトの論理削除の状態だけを読む選択（関連の `select` に渡す）。
 */
export const PROJECT_LIVENESS_SELECT = { select: { deletedAt: true } } as const;

/**
 * {@link PROJECT_LIVENESS_SELECT} で読んだプロジェクトの形。
 */
export interface ProjectLivenessRecord {
  deletedAt: Date | null;
}

/**
 * 対象の行の論理削除の状態と、所属プロジェクトの論理削除の状態を、同じ問い合わせで得るための選択。
 *
 * `deletedAt` と `project` の関連を持つ行（アルバム・看板）の `select` に展開して使う。
 */
export const AVAILABILITY_IN_PROJECT_SELECT = {
  deletedAt: true,
  project: PROJECT_LIVENESS_SELECT,
} as const;

/**
 * {@link AVAILABILITY_IN_PROJECT_SELECT} で読んだ行の形。
 */
export interface AvailabilityInProjectRecord {
  deletedAt: Date | null;
  project: ProjectLivenessRecord;
}

/**
 * プロジェクトが実在し、取り除かれていない（論理削除されていない）かを判定する。
 *
 * @param project - {@link PROJECT_LIVENESS_SELECT} で読んだプロジェクト（実在しなければ null）
 * @returns 実在し論理削除されていなければ true
 */
export function isProjectLive(project: ProjectLivenessRecord | null | undefined): boolean {
  return project !== null && project !== undefined && project.deletedAt === null;
}

/**
 * 行とその所属プロジェクトが、どちらも論理削除されていないかを判定する。
 *
 * @param record - {@link AVAILABILITY_IN_PROJECT_SELECT} で読んだ行
 * @returns 行とプロジェクトがどちらも生きていれば true
 */
export function isAvailableInLiveProject(record: AvailabilityInProjectRecord): boolean {
  return record.deletedAt === null && isProjectLive(record.project);
}
