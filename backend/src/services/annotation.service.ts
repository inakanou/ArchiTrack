/**
 * @fileoverview 注釈サービス
 *
 * 画像に対する注釈データ（寸法線、マーキング、コメント）の永続化と復元を担当します。
 *
 * Task 5.1: 注釈データの保存機能を実装する
 * - Fabric.js JSON形式での保存
 * - バージョン管理（スキーマバージョン1.0）
 * - 楽観的排他制御の実装
 *
 * Task 5.2: 注釈データの取得・復元機能を実装する
 * - 画像IDによる注釈データ取得
 * - JSONデータの検証
 *
 * Requirements:
 * - 9.1: 全ての注釈データをデータベースに保存する
 * - 9.2: 保存された注釈データを復元して表示する
 * - 9.4: 保存中インジケーターを表示する（バックエンドは保存処理を提供）
 *
 * @module services/annotation
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * 現在のスキーマバージョン
 */
export const ANNOTATION_SCHEMA_VERSION = '1.0';

/**
 * 画像が見つからないエラー
 *
 * 指定された画像が存在しない、または関連する現場調査が論理削除されている場合にスローされます。
 */
export class AnnotationImageNotFoundError extends Error {
  readonly code = 'ANNOTATION_IMAGE_NOT_FOUND';
  readonly imageId: string;

  constructor(imageId: string) {
    super(`画像が見つかりません: ${imageId}`);
    this.name = 'AnnotationImageNotFoundError';
    this.imageId = imageId;
  }
}

/**
 * 注釈データ競合エラー
 *
 * 楽観的排他制御で競合が検出された場合にスローされます。
 */
export class AnnotationConflictError extends Error {
  readonly code = 'ANNOTATION_CONFLICT';
  readonly expectedUpdatedAt: string;
  readonly actualUpdatedAt: string;

  constructor(expectedUpdatedAt: Date, actualUpdatedAt: Date) {
    super('注釈データは他のユーザーによって更新されました。最新データを確認してください。');
    this.name = 'AnnotationConflictError';
    this.expectedUpdatedAt = expectedUpdatedAt.toISOString();
    this.actualUpdatedAt = actualUpdatedAt.toISOString();
  }
}

/**
 * 無効な注釈データエラー
 *
 * 注釈データのフォーマットが無効な場合にスローされます。
 */
export class InvalidAnnotationDataError extends Error {
  readonly code = 'INVALID_ANNOTATION_DATA';

  constructor(reason: string) {
    super(`無効な注釈データです: ${reason}`);
    this.name = 'InvalidAnnotationDataError';
  }
}

/**
 * サービス依存関係
 */
export interface AnnotationServiceDependencies {
  prisma: PrismaClient;
}

/**
 * Fabric.js シリアライズオブジェクト
 *
 * Fabric.jsでシリアライズされたオブジェクトの基本構造。
 * 具体的なプロパティは描画オブジェクトの種類によって異なります。
 */
export interface FabricSerializedObject {
  type: string;
  version?: string;
  originX?: string;
  originY?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  angle?: number;
  scaleX?: number;
  scaleY?: number;
  [key: string]: unknown; // Fabric.jsオブジェクトの追加プロパティを許可
}

/**
 * 注釈データ
 *
 * Fabric.js Canvasの状態をJSON形式でシリアライズしたデータ構造。
 */
export interface AnnotationData {
  version: string;
  objects: FabricSerializedObject[];
  background?: string;
  viewportTransform?: number[];
}

/**
 * 注釈保存入力
 */
export interface SaveAnnotationInput {
  imageId: string;
  data: AnnotationData;
  expectedUpdatedAt?: Date;
}

/**
 * 注釈情報
 */
export interface AnnotationInfo {
  id: string;
  imageId: string;
  data: AnnotationData;
  version: string;
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
 * 注釈サービス
 *
 * 画像に対する注釈データの永続化、復元、削除を担当します。
 */
export class AnnotationService {
  private readonly prisma: PrismaClient;

  constructor(deps: AnnotationServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 注釈データを保存する
   *
   * 新規作成または既存データの更新を行います。
   * 既存データがある場合は楽観的排他制御を実行します。
   *
   * Requirements:
   * - 9.1: 全ての注釈データをデータベースに保存する
   * - 9.4: 保存処理の提供（フロントエンドでインジケーター表示）
   *
   * @param input - 保存入力
   * @returns 保存された注釈情報
   * @throws {AnnotationImageNotFoundError} 画像が存在しない場合
   * @throws {AnnotationConflictError} 楽観的排他制御で競合が検出された場合
   * @throws {InvalidAnnotationDataError} 注釈データのフォーマットが無効な場合
   */
  async save(input: SaveAnnotationInput): Promise<AnnotationInfo> {
    // 注釈データのバリデーション
    this.validateAnnotationData(input.data);

    // バージョン番号の自動設定
    const dataWithVersion: AnnotationData = {
      ...input.data,
      version: input.data.version || ANNOTATION_SCHEMA_VERSION,
    };

    return await this.prisma.$transaction(async (tx) => {
      // 1. 画像の存在確認
      await this.validateImageExists(tx, input.imageId);

      // 2. 既存の注釈データを確認
      const existingAnnotation = await tx.imageAnnotation.findUnique({
        where: { imageId: input.imageId },
      });

      if (existingAnnotation) {
        // 更新処理
        return await this.updateAnnotation(
          tx,
          input.imageId,
          dataWithVersion,
          existingAnnotation,
          input.expectedUpdatedAt
        );
      } else {
        // 新規作成処理
        return await this.createAnnotation(tx, input.imageId, dataWithVersion);
      }
    });
  }

  /**
   * 画像存在確認
   *
   * 指定された画像が存在し、関連する現場調査が論理削除されていないことを確認します。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param imageId - 画像ID
   * @throws {AnnotationImageNotFoundError} 画像が存在しない、または現場調査が削除されている場合
   */
  private async validateImageExists(tx: PrismaTransactionClient, imageId: string): Promise<void> {
    const image = await tx.surveyImage.findUnique({
      where: { id: imageId },
      include: {
        survey: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!image || image.survey.deletedAt !== null) {
      throw new AnnotationImageNotFoundError(imageId);
    }
  }

  /**
   * 新規注釈作成
   *
   * @param tx - Prismaトランザクションクライアント
   * @param imageId - 画像ID
   * @param data - 注釈データ
   * @returns 作成された注釈情報
   */
  private async createAnnotation(
    tx: PrismaTransactionClient,
    imageId: string,
    data: AnnotationData
  ): Promise<AnnotationInfo> {
    const created = await tx.imageAnnotation.create({
      data: {
        imageId,
        data: data as unknown as Prisma.InputJsonValue,
        version: data.version,
      },
    });

    return this.toAnnotationInfo(created);
  }

  /**
   * 注釈更新
   *
   * 楽観的排他制御を実行し、競合がなければ更新します。
   *
   * @param tx - Prismaトランザクションクライアント
   * @param imageId - 画像ID
   * @param data - 注釈データ
   * @param existing - 既存の注釈データ
   * @param expectedUpdatedAt - 期待される更新日時
   * @returns 更新された注釈情報
   * @throws {AnnotationConflictError} 楽観的排他制御で競合が検出された場合
   */
  private async updateAnnotation(
    tx: PrismaTransactionClient,
    imageId: string,
    data: AnnotationData,
    existing: { id: string; updatedAt: Date },
    expectedUpdatedAt?: Date
  ): Promise<AnnotationInfo> {
    // 楽観的排他制御
    if (expectedUpdatedAt && existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new AnnotationConflictError(expectedUpdatedAt, existing.updatedAt);
    }

    const updated = await tx.imageAnnotation.update({
      where: { imageId },
      data: {
        data: data as unknown as Prisma.InputJsonValue,
        version: data.version,
      },
    });

    return this.toAnnotationInfo(updated);
  }

  /**
   * 注釈データのバリデーション
   *
   * Fabric.js JSON形式の基本構造を検証します。
   *
   * @param data - 検証する注釈データ
   * @throws {InvalidAnnotationDataError} データが無効な場合
   */
  validateAnnotationData(data: AnnotationData): void {
    if (!data || typeof data !== 'object') {
      throw new InvalidAnnotationDataError('データがnullまたは非オブジェクトです');
    }

    if (!('objects' in data)) {
      throw new InvalidAnnotationDataError('objectsプロパティが必要です');
    }

    if (!Array.isArray(data.objects)) {
      throw new InvalidAnnotationDataError('objectsは配列である必要があります');
    }
  }

  /**
   * 画像IDで注釈データを取得する
   *
   * @param imageId - 画像ID
   * @returns 注釈情報、存在しない場合はnull
   */
  async findByImageId(imageId: string): Promise<AnnotationInfo | null> {
    const annotation = await this.prisma.imageAnnotation.findUnique({
      where: { imageId },
    });

    if (!annotation) {
      return null;
    }

    return this.toAnnotationInfo(annotation);
  }

  /**
   * 画像IDで注釈データを取得し、検証する（Task 5.2）
   *
   * 画像の存在確認とJSONデータの検証を行います。
   * フロントエンドでの注釈データ復元に使用されます。
   *
   * Requirements:
   * - 9.2: 保存された注釈データを復元して表示する
   *
   * @param imageId - 画像ID
   * @returns 検証済みの注釈情報、注釈データが存在しない場合はnull
   * @throws {AnnotationImageNotFoundError} 画像が存在しない、または論理削除されている場合
   * @throws {InvalidAnnotationDataError} 保存されているJSONデータが無効な場合
   */
  async getAnnotationWithValidation(imageId: string): Promise<AnnotationInfo | null> {
    // 1. 画像の存在確認（論理削除チェックを含む）
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      include: {
        survey: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!image || image.survey.deletedAt !== null) {
      throw new AnnotationImageNotFoundError(imageId);
    }

    // 2. 注釈データの取得
    const annotation = await this.prisma.imageAnnotation.findUnique({
      where: { imageId },
    });

    if (!annotation) {
      return null;
    }

    // 3. JSONデータの検証
    const data = annotation.data as unknown as AnnotationData;
    this.validateAnnotationData(data);

    return this.toAnnotationInfo(annotation);
  }

  /**
   * 注釈データを削除する
   *
   * 指定された画像の注釈データを削除します。
   * 注釈データが存在しない場合は何もしません。
   *
   * @param imageId - 画像ID
   */
  async delete(imageId: string): Promise<void> {
    const existing = await this.prisma.imageAnnotation.findUnique({
      where: { imageId },
    });

    if (!existing) {
      return;
    }

    await this.prisma.imageAnnotation.delete({
      where: { imageId },
    });
  }

  /**
   * データベースの結果をAnnotationInfoに変換
   */
  private toAnnotationInfo(annotation: {
    id: string;
    imageId: string;
    data: unknown;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  }): AnnotationInfo {
    return {
      id: annotation.id,
      imageId: annotation.imageId,
      data: annotation.data as AnnotationData,
      version: annotation.version,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
    };
  }
}
