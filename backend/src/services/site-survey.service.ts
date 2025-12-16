/**
 * @fileoverview 現場調査サービス
 *
 * 現場調査のCRUD操作とビジネスロジックを担当します。
 *
 * Requirements:
 * - 1.1: プロジェクトに紐付く新規現場調査レコードを作成する
 * - 1.6: プロジェクトが存在しない場合、現場調査の作成を許可しない
 * - 12.5: 現場調査の作成時に監査ログを記録する
 *
 * @module services/site-survey
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import type { CreateSiteSurveyInput } from '../schemas/site-survey.schema.js';
import { ProjectNotFoundForSurveyError } from '../errors/siteSurveyError.js';
import { SITE_SURVEY_TARGET_TYPE } from '../types/audit-log.types.js';

/**
 * SiteSurveyService依存関係
 */
export interface SiteSurveyServiceDependencies {
  prisma: PrismaClient;
  auditLogService: IAuditLogService;
}

/**
 * 現場調査情報（作成・更新用）
 */
export interface SiteSurveyInfo {
  id: string;
  projectId: string;
  name: string;
  surveyDate: Date;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 現場調査サービス
 *
 * 現場調査のCRUD操作とビジネスロジックを担当します。
 */
export class SiteSurveyService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: SiteSurveyServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * 現場調査作成
   *
   * トランザクション内で以下を実行:
   * 1. プロジェクト存在確認 (Requirements: 1.6)
   * 2. 現場調査作成 (Requirements: 1.1)
   * 3. 監査ログの記録 (Requirements: 12.5)
   *
   * @param input - 作成入力
   * @param actorId - 実行者ID
   * @returns 作成された現場調査情報
   * @throws ProjectNotFoundForSurveyError プロジェクトが存在しない、または論理削除済みの場合
   */
  async createSiteSurvey(input: CreateSiteSurveyInput, actorId: string): Promise<SiteSurveyInfo> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. プロジェクト存在確認 (Requirements: 1.6)
      await this.validateProjectExists(tx, input.projectId);

      // 2. 現場調査作成
      const siteSurvey = await tx.siteSurvey.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          surveyDate: new Date(input.surveyDate),
          memo: input.memo ?? null,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      // 3. 監査ログの記録 (Requirements: 12.5)
      await this.auditLogService.createLog({
        action: 'SITE_SURVEY_CREATED',
        actorId,
        targetType: SITE_SURVEY_TARGET_TYPE,
        targetId: siteSurvey.id,
        before: null,
        after: {
          name: siteSurvey.name,
          projectId: siteSurvey.projectId,
          surveyDate: siteSurvey.surveyDate.toISOString(),
          memo: siteSurvey.memo,
        },
      });

      return this.toSiteSurveyInfo(siteSurvey);
    });
  }

  /**
   * プロジェクト存在確認
   *
   * 指定されたプロジェクトが存在し、論理削除されていないことを確認する。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param projectId - プロジェクトID
   * @throws ProjectNotFoundForSurveyError プロジェクトが存在しない、または論理削除済みの場合
   */
  private async validateProjectExists(
    tx: PrismaTransactionClient,
    projectId: string
  ): Promise<void> {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundForSurveyError(projectId);
    }
  }

  /**
   * データベースの結果をSiteSurveyInfoに変換
   */
  private toSiteSurveyInfo(siteSurvey: {
    id: string;
    projectId: string;
    name: string;
    surveyDate: Date;
    memo: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SiteSurveyInfo {
    return {
      id: siteSurvey.id,
      projectId: siteSurvey.projectId,
      name: siteSurvey.name,
      surveyDate: siteSurvey.surveyDate,
      memo: siteSurvey.memo,
      createdAt: siteSurvey.createdAt,
      updatedAt: siteSurvey.updatedAt,
    };
  }
}
