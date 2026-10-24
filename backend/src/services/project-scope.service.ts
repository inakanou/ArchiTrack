/**
 * @fileoverview 案件の閲覧範囲（ProjectScopeService）
 *
 * 利用者が関係する案件のデータだけを閲覧・操作できるようにする判定の規則を一箇所に持つ
 * （user-authentication タスク52.1、要件39）。
 * - 関係者は案件の営業担当者・工事担当者・作成者のいずれか。全案件の閲覧は権限 `project:read_all` で判定し、
 *   ロール名を直書きしない
 * - 判定は要求のたびに案件の行を読み、結果をキャッシュしない（担当者の変更が次の要求から反映される）
 * - 案件の不在と論理削除は範囲外と区別せず「見えない」とする。ID 指定の要求の判定部品
 *   （middleware/project-scope.middleware.ts）は、範囲外の記録のためだけに evaluateProjectAccess で両者を分ける
 * - ファイルの取得用 URL の発行など、他の機能からは canAccessProject（または共有のインスタンス）を呼ぶ
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import getPrismaClient from '../db.js';
import { getSharedRBACService, type RBACService } from './rbac.service.js';

/** 全案件閲覧の権限 */
export const PROJECT_READ_ALL_PERMISSION = 'project:read_all';

/**
 * 案件へのアクセスの判定の結果
 * - allowed: 範囲内
 * - not_found: 案件が存在しない、または論理削除済み
 * - out_of_scope: 案件は存在するが範囲外
 */
export type ProjectAccessDecision = 'allowed' | 'not_found' | 'out_of_scope';

type PermissionChecker = Pick<RBACService, 'hasPermission'>;

export class ProjectScopeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rbac: PermissionChecker
  ) {}

  /**
   * 利用者が案件の範囲内なら true。案件の不在・論理削除も false（呼び出し側で区別しない）
   */
  async canAccessProject(userId: string, projectId: string): Promise<boolean> {
    return (await this.evaluateProjectAccess(userId, projectId)) === 'allowed';
  }

  /**
   * 案件の行を読み、範囲内・不在・範囲外を判定する。
   * 不在と論理削除は全案件閲覧の権限があっても not_found とする
   */
  async evaluateProjectAccess(userId: string, projectId: string): Promise<ProjectAccessDecision> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        salesPersonId: true,
        constructionPersonId: true,
        createdById: true,
        deletedAt: true,
      },
    });

    if (!project || project.deletedAt !== null) {
      return 'not_found';
    }

    if (
      project.salesPersonId === userId ||
      project.constructionPersonId === userId ||
      project.createdById === userId
    ) {
      return 'allowed';
    }

    return (await this.hasAllProjectsAccess(userId)) ? 'allowed' : 'out_of_scope';
  }

  /**
   * 一覧・検索・件数の絞り込み条件。全案件閲覧の権限を持つなら null（絞り込みなし）。
   * 呼び出し側は `deletedAt: null` と AND で結ぶ
   */
  async buildProjectScopeWhere(userId: string): Promise<Prisma.ProjectWhereInput | null> {
    if (await this.hasAllProjectsAccess(userId)) {
      return null;
    }
    return {
      OR: [{ salesPersonId: userId }, { constructionPersonId: userId }, { createdById: userId }],
    };
  }

  /** 全案件閲覧の権限（project:read_all）を持つか */
  async hasAllProjectsAccess(userId: string): Promise<boolean> {
    return this.rbac.hasPermission(userId, PROJECT_READ_ALL_PERMISSION);
  }
}

let shared: { prisma: PrismaClient; rbac: RBACService; service: ProjectScopeService } | null = null;

/**
 * 共有の PrismaClient と共有の RBACService（権限キャッシュを持つ）で組み立てたインスタンスを返す。
 * PrismaClient や RBACService が作り直されたときは新しいもので作り直す
 */
export function getSharedProjectScopeService(): ProjectScopeService {
  const prisma = getPrismaClient();
  const rbac = getSharedRBACService();
  if (!shared || shared.prisma !== prisma || shared.rbac !== rbac) {
    shared = { prisma, rbac, service: new ProjectScopeService(prisma, rbac) };
  }
  return shared.service;
}

/**
 * 利用者が案件の範囲内かを共有のインスタンスで判定する。
 * ファイルの取得用 URL の発行など、ID 指定の判定部品を通らない経路から呼ぶ
 */
export function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  return getSharedProjectScopeService().canAccessProject(userId, projectId);
}
