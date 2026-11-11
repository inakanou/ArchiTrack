/**
 * @fileoverview 論理削除したプロジェクトの完全削除
 *
 * 論理削除から 90 日を過ぎたプロジェクトを、関連データとストレージ上のファイルと共に完全に削除する。
 * ストレージのキーはプロジェクトの接頭辞を持たないため、DB からキーを集めて 1 件ずつ消す。
 *
 * Task 81.1: 対象の選び方と、ファイルのキー・種類ごとの件数の集め方
 * Task 81.2: ファイル→DB の順の完全削除と監査の記録
 *
 * Requirements (project-management):
 * - 9.6: 関連データを保持期間の後に共に削除する
 * - 46.1: 論理削除の日時から 90 日間は保持する
 * - 46.6: 完全削除を件数と日時で監査に記録する（名前とキーは入れない。D8）
 * - 46.7: 失敗したプロジェクトは消さずに記録し、次の回でやり直す
 * - 46.8: 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 * - 46.9: 監査ログは消さない
 *
 * @module services/project-purge
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import logger from '../utils/logger.js';
import { AuditLogService } from './audit-log.service.js';

/** 論理削除から完全削除までの保持期間（日） */
export const PROJECT_PURGE_RETENTION_DAYS = 90;

/** 1 回に完全削除するプロジェクトの最大件数（D7） */
export const PROJECT_PURGE_BATCH_SIZE = 20;

/** 完全削除のトランザクションの制限時間（1 件で多くの行を消しうるため既定の 5 秒より長くする） */
export const PROJECT_PURGE_TRANSACTION_TIMEOUT_MS = 60_000;

/** 完全削除の監査の対象の種類 */
export const PROJECT_PURGE_AUDIT_TARGET_TYPE = 'Project';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 完全削除した関連データの種類ごとの件数と、削除したファイルの件数 */
export interface ProjectPurgeCounts {
  siteSurveys: number;
  surveyImages: number;
  quantityTables: number;
  itemizedStatements: number;
  estimateRequests: number;
  receivedQuotations: number;
  estimates: number;
  contracts: number;
  schedules: number;
  executionBudgets: number;
  constructionPhotoAlbums: number;
  constructionPhotos: number;
  files: number;
}

/** 完全削除の 1 回の結果 */
export interface ProjectPurgeResult {
  purgedProjectIds: string[];
  failedProjectIds: string[];
  remainingCandidates: number;
}

/** 完全削除の対象のプロジェクト */
export interface ProjectPurgeTarget {
  id: string;
  deletedAt: Date;
}

/** 1 回分の対象と、選ばれなかった残りの件数 */
export interface ProjectPurgeSelection {
  targets: ProjectPurgeTarget[];
  remainingCandidates: number;
}

/** プロジェクトのファイルのキーと種類ごとの件数 */
export interface ProjectPurgeAssets {
  fileKeys: string[];
  counts: ProjectPurgeCounts;
}

export interface ProjectPurgeServiceDependencies {
  prisma: PrismaClient;
  storageProvider: StorageProvider;
  /** 監査の記録（省略時は prisma で作る） */
  auditLogService?: Pick<IAuditLogService, 'createLog'>;
}

/** 失敗の段階（記録に使う） */
type ProjectPurgeStage = 'collect' | 'files' | 'database';

/** 失敗の記録に出す最小限の情報（エラーの文言はキーを含みうるため出さない） */
function describeError(error: unknown): { errorName?: string; errorCode?: string } {
  if (!(error instanceof Error)) return {};
  const code = (error as { code?: unknown }).code;
  return { errorName: error.name, ...(typeof code === 'string' ? { errorCode: code } : {}) };
}

/**
 * 完全削除の締めの日時（これより前に論理削除されたものが対象）
 *
 * @param now - 現在の時刻
 */
export function getProjectPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - PROJECT_PURGE_RETENTION_DAYS * DAY_MS);
}

export class ProjectPurgeService {
  private readonly auditLogService: Pick<IAuditLogService, 'createLog'>;

  constructor(private readonly deps: ProjectPurgeServiceDependencies) {
    this.auditLogService = deps.auditLogService ?? new AuditLogService({ prisma: deps.prisma });
  }

  /**
   * 論理削除から 90 日を過ぎたプロジェクトを最大 20 件、ファイル→DB の順で完全に削除する
   *
   * プロジェクトごとに、ファイルを 1 件ずつ消し、すべて消せたときだけ DB を消す（D6）。
   * 失敗したプロジェクトは消さずに記録して次へ進み、次の回でやり直す（46.7）。
   *
   * @param now - 現在の時刻
   */
  async purgeExpired(now: Date): Promise<ProjectPurgeResult> {
    const { targets, remainingCandidates } = await this.selectTargets(now);
    const purgedProjectIds: string[] = [];
    const failedProjectIds: string[] = [];

    for (const target of targets) {
      const ok = await this.purgeProject(target, now);
      (ok ? purgedProjectIds : failedProjectIds).push(target.id);
    }

    return { purgedProjectIds, failedProjectIds, remainingCandidates };
  }

  /** 1 件のプロジェクトを完全に削除する。失敗したら記録して false を返す */
  private async purgeProject(target: ProjectPurgeTarget, now: Date): Promise<boolean> {
    let stage: ProjectPurgeStage = 'collect';
    try {
      const { fileKeys, counts } = await this.collectProjectAssets(target.id);

      // ファイルを先に 1 件ずつ消す。一つでも失敗したら DB を残す（46.7）
      stage = 'files';
      for (const key of fileKeys) {
        await this.deps.storageProvider.delete(key);
      }

      stage = 'database';
      await this.deps.prisma.$transaction(
        async (tx) => {
          await this.deleteRestrictedRows(tx, target.id);
          // 残りの関連データは Cascade に任せる
          await tx.project.delete({ where: { id: target.id } });
          // 件数と日時だけを記録する。名前とキーは入れない（D8）
          await this.auditLogService.createLog(
            {
              action: 'PROJECT_PURGED',
              actorId: null,
              targetType: PROJECT_PURGE_AUDIT_TARGET_TYPE,
              targetId: target.id,
              metadata: {
                deletedAt: target.deletedAt.toISOString(),
                purgedAt: now.toISOString(),
                counts: { ...counts },
              },
            },
            tx
          );
        },
        { ...connectBudgetTransactionOptions(), timeout: PROJECT_PURGE_TRANSACTION_TIMEOUT_MS }
      );
      return true;
    } catch (error) {
      logger.error(
        { projectId: target.id, stage, ...describeError(error) },
        'Failed to purge soft-deleted project'
      );
      return false;
    }
  }

  /**
   * Restrict の外部キーを持つ行を葉から先に消す（D6）
   *
   * Restrict は即時に検査されるため、連鎖の順に任せると参照の残る行で失敗する。
   * 他のプロジェクトの見積依頼が内訳書を参照しているときは project.delete が失敗し、記録の対象になる。
   */
  private async deleteRestrictedRows(tx: Prisma.TransactionClient, projectId: string) {
    const byBudget = { executionBudget: { projectId } };
    const byRequest = { estimateRequest: { projectId } };

    // 出来高の項目・発注の項目（実行予算の項目を Restrict で参照する）
    await tx.progressRecordItem.deleteMany({ where: { progressRecord: byBudget } });
    await tx.orderItem.deleteMany({ where: { order: byBudget } });
    // 出来高・発注・月次の締め・改定の履歴（実行予算の子）
    await tx.progressRecord.deleteMany({ where: byBudget });
    await tx.order.deleteMany({ where: byBudget });
    await tx.monthlyCloseHistory.deleteMany({ where: byBudget });
    await tx.amendmentApplyHistory.deleteMany({ where: byBudget });
    // 実行予算の項目 → 実行予算（実行予算は契約書を Restrict で参照する）
    await tx.executionBudgetItem.deleteMany({ where: byBudget });
    await tx.executionBudget.deleteMany({ where: { projectId } });
    // 受領見積書（プロジェクトを Restrict で参照する。見積依頼を通したものも含む）
    await tx.receivedQuotation.deleteMany({ where: { OR: [{ projectId }, byRequest] } });
    // 見積依頼の項目・状態の履歴 → 見積依頼（内訳書・内訳書の項目を Restrict で参照する）
    await tx.estimateRequestItem.deleteMany({ where: byRequest });
    await tx.estimateRequestStatusHistory.deleteMany({ where: byRequest });
    await tx.estimateRequest.deleteMany({ where: { projectId } });
  }

  /**
   * 論理削除から 90 日を過ぎたプロジェクトを古い順に最大 20 件選び、残りの件数を数える
   *
   * 導入の前に論理削除されたものも同じ条件で選ぶ（46.8）。
   *
   * @param now - 現在の時刻
   */
  async selectTargets(now: Date): Promise<ProjectPurgeSelection> {
    const where = { deletedAt: { not: null, lt: getProjectPurgeCutoff(now) } };
    const [rows, total] = await Promise.all([
      this.deps.prisma.project.findMany({
        where,
        select: { id: true, deletedAt: true },
        orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
        take: PROJECT_PURGE_BATCH_SIZE,
      }),
      this.deps.prisma.project.count({ where }),
    ]);

    // 条件で null は除いているが、型のために絞る
    const targets = rows.flatMap((row) =>
      row.deletedAt ? [{ id: row.id, deletedAt: row.deletedAt }] : []
    );
    return { targets, remainingCandidates: Math.max(total - targets.length, 0) };
  }

  /**
   * プロジェクトのファイルのキーを重複なく集め、関連データの種類ごとの件数を数える
   *
   * 関連データの側で個別に論理削除されたものも消すため、deletedAt では絞らない。
   * 受領見積書は案件に直接紐づくものと、見積依頼を通して紐づくものの両方を集める。
   *
   * @param projectId - プロジェクトの ID
   */
  async collectProjectAssets(projectId: string): Promise<ProjectPurgeAssets> {
    const { prisma } = this.deps;
    const byProject = { where: { projectId } };
    const [
      siteSurveys,
      surveyImages,
      quantityTables,
      itemizedStatements,
      estimateRequests,
      receivedQuotations,
      estimates,
      contracts,
      schedules,
      executionBudgets,
      constructionPhotoAlbums,
      constructionPhotos,
    ] = await Promise.all([
      prisma.siteSurvey.count(byProject),
      prisma.surveyImage.findMany({
        where: { survey: { projectId } },
        select: { originalPath: true, thumbnailPath: true, annotatedThumbnailPath: true },
      }),
      prisma.quantityTable.count(byProject),
      prisma.itemizedStatement.count(byProject),
      prisma.estimateRequest.count(byProject),
      prisma.receivedQuotation.findMany({
        where: { OR: [{ projectId }, { estimateRequest: { projectId } }] },
        select: { filePath: true },
      }),
      prisma.estimate.count(byProject),
      prisma.contract.count(byProject),
      prisma.constructionSchedule.count(byProject),
      prisma.executionBudget.count(byProject),
      prisma.constructionPhotoAlbum.count(byProject),
      prisma.constructionPhoto.findMany({
        where: { album: { projectId } },
        select: { originalPath: true, thumbnailPath: true },
      }),
    ]);

    // 現調からの写しなどで同じキーを指すことがあるため重複を除く。空のキーは除く
    const keys = new Set<string>();
    const add = (key: string | null | undefined): void => {
      if (key) keys.add(key);
    };
    for (const image of surveyImages) {
      add(image.originalPath);
      add(image.thumbnailPath);
      add(image.annotatedThumbnailPath);
    }
    for (const photo of constructionPhotos) {
      add(photo.originalPath);
      add(photo.thumbnailPath);
    }
    for (const quotation of receivedQuotations) {
      add(quotation.filePath);
    }

    const fileKeys = [...keys];
    return {
      fileKeys,
      counts: {
        siteSurveys,
        surveyImages: surveyImages.length,
        quantityTables,
        itemizedStatements,
        estimateRequests,
        receivedQuotations: receivedQuotations.length,
        estimates,
        contracts,
        schedules,
        executionBudgets,
        constructionPhotoAlbums,
        constructionPhotos: constructionPhotos.length,
        files: fileKeys.length,
      },
    };
  }
}
