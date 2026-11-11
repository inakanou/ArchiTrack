/**
 * @fileoverview 論理削除したプロジェクトの完全削除
 *
 * 論理削除から 90 日を過ぎたプロジェクトを、関連データとストレージ上のファイルと共に完全に削除する。
 * ストレージのキーはプロジェクトの接頭辞を持たないため、DB からキーを集めて 1 件ずつ消す。
 *
 * Task 81.1: 対象の選び方と、ファイルのキー・種類ごとの件数の集め方
 * Task 81.2: ファイル→DB の順の完全削除と監査の記録
 * Task 83.2: 失敗の記録と、失敗したものを後ろへ回す選び方
 * Task 83.3: 5 回続けて失敗したものを対象から外し、全システム管理者へ知らせる
 * Task 83.4: 定期処理の 1 回ごとの件数を監査に記録する
 * Task 83.5: 対象から外したものを対象に戻す
 *
 * Requirements (project-management):
 * - 9.6: 関連データを保持期間の後に共に削除する
 * - 46.1: 論理削除の日時から 90 日間は保持する
 * - 46.6: 完全削除を件数と日時で監査に記録する（名前とキーは入れない。D8）
 * - 46.7: 失敗したプロジェクトは消さずに記録し、次の回でやり直す
 * - 46.8: 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 * - 46.9: 監査ログは消さない
 * - 46.10: 失敗したものは記録し、試みていないものと試みた日時の古いものの後に回す（D10・D11）
 * - 46.11: 5 回続けて失敗したものを対象から外し、監査に記録し、全システム管理者へ知らせる（D12）
 * - 46.12: その記録と通知に名前・ファイルのキー・エラーの文言を含めない
 * - 46.13: 対象から外したものは選ばない（論理削除のままのため表示・提供もされない）
 * - 46.14: 運用の手順で対象に戻したら、回数を 0 に戻して次の回で試み、監査に記録する（D11・D13）
 * - 46.15: 定期処理の 1 回ごとに、完全に削除した・失敗した・対象から外した件数を監査に記録する（D14）
 *
 * @module services/project-purge
 */

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import logger from '../utils/logger.js';
import type { IAdminNotificationService } from './admin-notification.service.js';
import { AuditLogService } from './audit-log.service.js';

/** 論理削除から完全削除までの保持期間（日） */
export const PROJECT_PURGE_RETENTION_DAYS = 90;

/** 1 回に完全削除するプロジェクトの最大件数（D7） */
export const PROJECT_PURGE_BATCH_SIZE = 20;

/** 完全削除のトランザクションの制限時間（1 件で多くの行を消しうるため既定の 5 秒より長くする） */
export const PROJECT_PURGE_TRANSACTION_TIMEOUT_MS = 60_000;

/** 完全削除の監査の対象の種類 */
export const PROJECT_PURGE_AUDIT_TARGET_TYPE = 'Project';

/** 定期処理の 1 回の結果の監査の対象の種類（対象の ID は回の開始の日時） */
export const PROJECT_PURGE_RUN_AUDIT_TARGET_TYPE = 'ProjectPurgeRun';

/** 対象から外すまでの、続けての失敗の回数（46.11） */
export const PROJECT_PURGE_MAX_FAILURES = 5;

/** 対象から外したものを対象に戻す運用の手順のコマンド（通知に載せる） */
export const PROJECT_PURGE_REQUEUE_COMMAND = 'npm run project:purge-requeue -- --project-id <ID>';

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
  /** この回で対象から外したもの（46.11） */
  excludedProjectIds: string[];
  remainingCandidates: number;
}

/**
 * 対象に戻した結果（46.14）
 * - requeued: 対象に戻した
 * - not_excluded: 対象から外れていない（何も変えない）
 * - not_found: プロジェクトが無い、または論理削除されていない
 */
export type ProjectPurgeRequeueOutcome = 'requeued' | 'not_excluded' | 'not_found';

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
  /** 対象から外したことの全システム管理者への通知（省略時は通知しない。試験と運用の手順のため） */
  adminNotificationService?: Pick<IAdminNotificationService, 'notifyAllAdmins'>;
}

/** 失敗の段階（記録に使う） */
type ProjectPurgeStage = 'collect' | 'files' | 'database';

/** 1 件の完全削除の結果（失敗のときは段階を持つ） */
type ProjectPurgeOutcome = { ok: true } | { ok: false; stage: ProjectPurgeStage };

/** 失敗の記録の書き込みの結果 */
interface ProjectPurgeFailureRecord {
  failureCount: number;
  /** この書き込みで対象から外したか */
  excluded: boolean;
}

/** この回で対象から外したもの（通知に載せる） */
interface ExcludedProject {
  id: string;
  failureCount: number;
}

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
    const excluded: ExcludedProject[] = [];

    for (const target of targets) {
      const outcome = await this.purgeProject(target, now);
      if (outcome.ok) {
        purgedProjectIds.push(target.id);
        continue;
      }
      failedProjectIds.push(target.id);
      const record = await this.recordFailure(target.id, now);
      if (record?.excluded) {
        excluded.push({ id: target.id, failureCount: record.failureCount });
        await this.recordExclusion(target, record.failureCount, outcome.stage, now);
      }
    }

    const result: ProjectPurgeResult = {
      purgedProjectIds,
      failedProjectIds,
      excludedProjectIds: excluded.map((project) => project.id),
      remainingCandidates,
    };

    // 回の結果を記録してから知らせる（対象が 0 件の回も記録する。46.15、D14）
    await this.recordRun(result, now);

    // その回で外したものをまとめて 1 通で知らせる（D12）
    await this.notifyExcluded(excluded);

    return result;
  }

  /**
   * 対象から外したプロジェクトを対象に戻す（運用の手順から呼ぶ。46.14、D11・D13）
   *
   * 失敗の回数を 0 に、最後に試みた日時と対象から外した日時を空にし、戻したことを監査に記録する。
   * 最後に試みた日時が空のものは次の回に先に選ばれる。読み・書き・記録を一つのトランザクションに
   * まとめ、記録に失敗したら戻さない。書き換えは「対象から外れている」ことを条件にし、読んだ後に
   * 他の実行が戻していたら（0 件）not_excluded として記録しない。原因を直したかは確かめない。
   * ストレージには触れず、通知もしない。
   *
   * @param projectId - プロジェクトの ID
   * @param now - 現在の時刻（記録の日時）
   */
  async requeue(projectId: string, now: Date): Promise<ProjectPurgeRequeueOutcome> {
    return this.deps.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: {
          deletedAt: true,
          purgeState: { select: { failureCount: true, excludedAt: true } },
        },
      });
      if (!project || project.deletedAt === null) return 'not_found';
      const state = project.purgeState;
      if (!state || state.excludedAt === null) return 'not_excluded';

      const updated = await tx.projectPurgeState.updateMany({
        where: { projectId, excludedAt: { not: null } },
        data: { failureCount: 0, lastAttemptAt: null, excludedAt: null },
      });
      if (updated.count === 0) return 'not_excluded';

      // 回数と日時だけを記録する。名前とキーは入れない
      await this.auditLogService.createLog(
        {
          action: 'PROJECT_PURGE_REQUEUED',
          actorId: null,
          targetType: PROJECT_PURGE_AUDIT_TARGET_TYPE,
          targetId: projectId,
          metadata: {
            trigger: 'operator_script',
            previousFailureCount: state.failureCount,
            previousExcludedAt: state.excludedAt.toISOString(),
            requeuedAt: now.toISOString(),
          },
        },
        tx
      );
      return 'requeued';
    }, connectBudgetTransactionOptions());
  }

  /**
   * 定期処理の 1 回の結果を監査に記録する（46.15、D14）
   *
   * 件数だけを記録し、プロジェクトの ID・名前・キーは入れない。対象が 0 件の回も記録し、
   * 定期処理が止まっていることに監査ログから気づけるようにする。記録の失敗は記録して結果を返す。
   */
  private async recordRun(result: ProjectPurgeResult, now: Date): Promise<void> {
    const runStartedAt = now.toISOString();
    try {
      await this.auditLogService.createLog({
        action: 'PROJECT_PURGE_RUN_COMPLETED',
        actorId: null,
        targetType: PROJECT_PURGE_RUN_AUDIT_TARGET_TYPE,
        targetId: runStartedAt,
        metadata: {
          purged: result.purgedProjectIds.length,
          failed: result.failedProjectIds.length,
          excluded: result.excludedProjectIds.length,
          remainingCandidates: result.remainingCandidates,
        },
      });
    } catch (error) {
      logger.error({ runStartedAt, ...describeError(error) }, 'Failed to record project purge run');
    }
  }

  /** 1 件のプロジェクトを完全に削除する。失敗したら記録して失敗の段階を返す */
  private async purgeProject(target: ProjectPurgeTarget, now: Date): Promise<ProjectPurgeOutcome> {
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
      return { ok: true };
    } catch (error) {
      logger.error(
        { projectId: target.id, stage, ...describeError(error) },
        'Failed to purge soft-deleted project'
      );
      return { ok: false, stage };
    }
  }

  /**
   * 失敗の回数を 1 増やし、最後に試みた日時を付ける。回数が上限に届いたら対象から外した日時を付ける
   * （46.10・46.11、D11）
   *
   * 削除のトランザクションの外で書く（ロールバックで記録が消えないように）。回数を増やす書き込みと
   * 対象から外す書き込みは一つのトランザクションにまとめ、片方だけが残らないようにする。対象から外す
   * 書き込みは増やした後の回数を条件にするため、主キーの行の upsert の後で同じ行を読み書きする。
   * 書き込みの失敗は記録して次のプロジェクトへ進む（その回の失敗は数えないが、次の回にまた試みる）。
   *
   * @returns 書き込んだ後の回数と、この書き込みで対象から外したか（書き込みに失敗したら null）
   */
  private async recordFailure(
    projectId: string,
    now: Date
  ): Promise<ProjectPurgeFailureRecord | null> {
    const states = this.deps.prisma.projectPurgeState;
    try {
      const [state, exclusion] = await this.deps.prisma.$transaction([
        states.upsert({
          where: { projectId },
          create: { projectId, failureCount: 1, lastAttemptAt: now },
          update: { failureCount: { increment: 1 }, lastAttemptAt: now },
        }),
        states.updateMany({
          where: {
            projectId,
            excludedAt: null,
            failureCount: { gte: PROJECT_PURGE_MAX_FAILURES },
          },
          data: { excludedAt: now },
        }),
      ]);
      return { failureCount: state.failureCount, excluded: exclusion.count > 0 };
    } catch (error) {
      logger.error(
        { projectId, ...describeError(error) },
        'Failed to record project purge failure'
      );
      return null;
    }
  }

  /**
   * 対象から外したことを監査に記録する（46.11・46.12）
   *
   * 回数・日時・最後の失敗の段階だけを記録し、名前・ファイルのキー・エラーの文言は入れない。
   * 記録の失敗は記録して次へ進む（対象から外したことは失敗の記録の表に残っている）。
   */
  private async recordExclusion(
    target: ProjectPurgeTarget,
    failureCount: number,
    stage: ProjectPurgeStage,
    now: Date
  ): Promise<void> {
    try {
      await this.auditLogService.createLog({
        action: 'PROJECT_PURGE_EXCLUDED',
        actorId: null,
        targetType: PROJECT_PURGE_AUDIT_TARGET_TYPE,
        targetId: target.id,
        metadata: {
          failureCount,
          deletedAt: target.deletedAt.toISOString(),
          excludedAt: now.toISOString(),
          lastFailureStage: stage,
        },
      });
    } catch (error) {
      logger.error(
        { projectId: target.id, ...describeError(error) },
        'Failed to record project purge exclusion'
      );
    }
  }

  /**
   * その回で対象から外したものを全システム管理者へ 1 通で知らせる（46.11・46.12、D12）
   *
   * 本文はプロジェクト ID・失敗の回数・対象に戻す手順のコマンド名だけ（名前は外へ出さない）。
   * 通知の部品が無いとき・外したものが無いときは送らない。通知の失敗は処理を失敗にしない。
   */
  private async notifyExcluded(excluded: ExcludedProject[]): Promise<void> {
    const notifier = this.deps.adminNotificationService;
    if (!notifier || excluded.length === 0) return;
    try {
      await notifier.notifyAllAdmins({
        kind: 'PROJECT_PURGE_EXCLUDED',
        subject: `【重要】プロジェクトの完全削除の対象外化: ${excluded.length} 件`,
        lines: [
          `完全削除が ${PROJECT_PURGE_MAX_FAILURES} 回続けて失敗したため、次のプロジェクトを定期処理の対象から外しました。`,
          ...excluded.map(
            (project) => `プロジェクト ID: ${project.id}（失敗の回数: ${project.failureCount} 回）`
          ),
          '原因を取り除いた後、サーバー上で次の手順を実行すると、次回の定期処理で再び完全削除を試みます。',
          PROJECT_PURGE_REQUEUE_COMMAND,
        ],
      });
    } catch (error) {
      logger.error(
        { projectIds: excluded.map((project) => project.id), ...describeError(error) },
        'Failed to notify admins of excluded project purges'
      );
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
   * 論理削除から 90 日を過ぎたプロジェクトを最大 20 件選び、残りの件数を数える
   *
   * 対象から外したものは除く（46.13）。並びは、試みていないもの（記録が無い・最後に試みた日時が空）
   * → 最後に試みた日時の古いもの → 論理削除の古い順（46.10、D10）。
   * 導入の前に論理削除されたものも同じ条件で選ぶ（46.8）。
   *
   * @param now - 現在の時刻
   */
  async selectTargets(now: Date): Promise<ProjectPurgeSelection> {
    // 対象から外したもの（記録の excludedAt が空でないもの）を除く
    const where: Prisma.ProjectWhereInput = {
      deletedAt: { not: null, lt: getProjectPurgeCutoff(now) },
      OR: [{ purgeState: { is: null } }, { purgeState: { is: { excludedAt: null } } }],
    };
    // 記録の無いものは試みた日時が空として先に並ぶ（1 対 1 の関係の外部結合）
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = [
      { purgeState: { lastAttemptAt: { sort: 'asc', nulls: 'first' } } },
      { deletedAt: 'asc' },
      { id: 'asc' },
    ];
    const [rows, total] = await Promise.all([
      this.deps.prisma.project.findMany({
        where,
        select: { id: true, deletedAt: true },
        orderBy,
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
