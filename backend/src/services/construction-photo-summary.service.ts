/**
 * @fileoverview 工事写真サマリサービス
 *
 * プロジェクト詳細サマリ（`GET /api/projects/:id/detail-summary`）の工事写真
 * セクションへ寄与する読み取り専用サービス。既存の現場調査サマリ
 * （site-survey.service.ts の `findLatestByProjectId`）の実装パターンを踏襲する。
 *
 * 責務は自セクション（工事写真アルバム）のデータ取得のみ。署名付き代表サムネURLの
 * 生成はルート層で行う（site-survey と同一分担）。他ドメインへは書込まない。
 *
 * Requirements:
 * - 2.3: プロジェクト詳細画面の工事写真パネルに登録件数などのサマリ情報を表示する
 *
 * @module services/construction-photo-summary
 */

import type { PrismaClient } from '../generated/prisma/client.js';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConstructionPhotoSummaryService 依存関係
 */
export interface ConstructionPhotoSummaryServiceDependencies {
  prisma: PrismaClient;
}

/**
 * プロジェクト詳細サマリで返す1アルバムのサマリ情報
 *
 * 現場調査サマリ（`SiteSurveyInfo`）に倣い、代表サムネのストレージパスを
 * `thumbnailUrl` に保持する。ルート層で署名付きURLへ変換される。
 */
export interface ConstructionPhotoAlbumSummaryInfo {
  id: string;
  projectId: string;
  name: string;
  memo: string | null;
  /** 代表写真（displayOrder 昇順の先頭）のサムネイルパス。ルートで署名付きURL化される */
  thumbnailUrl: string | null;
  /** 代表写真のID（写真がなければ null） */
  representativeImageId: string | null;
  /** アルバム配下の写真項目数 */
  photoCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * プロジェクト別工事写真サマリー
 *
 * プロジェクト詳細画面の工事写真セクションで表示する直近のアルバム一覧と総数を含む。
 * 既存セクション（`ProjectSurveySummary` 等）と同型。
 *
 * Requirements: 2.3
 */
export interface ProjectConstructionPhotoSummary {
  /** アルバムの総数（論理削除除外） */
  totalCount: number;
  /** 直近N件のアルバム */
  latestAlbums: ConstructionPhotoAlbumSummaryInfo[];
}

/**
 * サマリで返す既定のアルバム件数
 */
const DEFAULT_LIMIT = 2;

/**
 * 工事写真サマリサービス
 */
export class ConstructionPhotoSummaryService {
  private readonly prisma: PrismaClient;

  constructor(deps: ConstructionPhotoSummaryServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * プロジェクトIDによる工事写真サマリ取得
   *
   * 論理削除済みアルバムを除外し、指定プロジェクト配下のアルバムのみを対象に、
   * 直近N件（作成日降順）のアルバムと総数を返す。各アルバムには代表写真
   * （displayOrder 昇順の先頭）のサムネイルパスと写真数を含める。
   *
   * Requirements:
   * - 2.3: プロジェクト詳細サマリに登録件数などのサマリ情報を提供する
   *
   * @param projectId - プロジェクトID
   * @param limit - 取得件数（デフォルト: 2）
   * @returns プロジェクト別工事写真サマリー
   */
  async findLatestByProjectId(
    projectId: string,
    limit: number = DEFAULT_LIMIT
  ): Promise<ProjectConstructionPhotoSummary> {
    const where = {
      projectId,
      deletedAt: null,
    };

    const [albums, totalCount] = await Promise.all([
      this.prisma.constructionPhotoAlbum.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          photos: {
            orderBy: { displayOrder: 'asc' },
            take: 1, // 代表サムネ用に先頭1件のみ
            select: {
              id: true,
              thumbnailPath: true,
            },
          },
          _count: {
            select: { photos: true },
          },
        },
      }),
      this.prisma.constructionPhotoAlbum.count({ where }),
    ]);

    const latestAlbums: ConstructionPhotoAlbumSummaryInfo[] = albums.map((album) => {
      const representative = album.photos[0];
      return {
        id: album.id,
        projectId: album.projectId,
        name: album.name,
        memo: album.memo,
        thumbnailUrl: representative ? representative.thumbnailPath : null,
        representativeImageId: representative ? representative.id : null,
        photoCount: album._count.photos,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt,
      };
    });

    return {
      totalCount,
      latestAlbums,
    };
  }
}
