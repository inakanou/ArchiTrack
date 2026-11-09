/**
 * @fileoverview 論理削除したプロジェクトの完全削除
 *
 * 論理削除から 90 日を過ぎたプロジェクトを、関連データとストレージ上のファイルと共に完全に削除する。
 * ストレージのキーはプロジェクトの接頭辞を持たないため、DB からキーを集めて 1 件ずつ消す。
 *
 * Task 81.1: 対象の選び方と、ファイルのキー・種類ごとの件数の集め方
 *
 * Requirements (project-management):
 * - 46.1: 論理削除の日時から 90 日間は保持する
 * - 46.8: 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 *
 * @module services/project-purge
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';

/** 論理削除から完全削除までの保持期間（日） */
export const PROJECT_PURGE_RETENTION_DAYS = 90;

/** 1 回に完全削除するプロジェクトの最大件数（D7） */
export const PROJECT_PURGE_BATCH_SIZE = 20;

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
  constructor(private readonly deps: ProjectPurgeServiceDependencies) {}

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
