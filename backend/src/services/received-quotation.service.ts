/**
 * @fileoverview 受領見積書サービス（改訂版: Task 20.2）
 *
 * 受領見積書のCRUD操作とファイル管理を担当します。
 * 改訂版ではcontentType/textContentを廃止し、ファイルと明細行の共存モデルへ移行。
 *
 * Requirements:
 * - 11.1: 受領見積書登録ボタン
 * - 11.2: 受領見積書登録フォーム
 * - 11.3: 受領見積書名（必須）
 * - 11.4: 提出日（必須）
 * - 11.6, 11.8: ファイルアップロード
 * - 11.9: 構造化データ入力エリア
 * - 11.10: バリデーションエラー
 * - 11.11: 複数の受領見積書を許可
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 * - 11.22: ファイルまたは明細行データのいずれかが必須
 *
 * Task 12.1: ReceivedQuotationServiceの実装
 * Task 20.2: contentType/textContent廃止、ファイル+明細行共存モデルへ移行
 *
 * @module services/received-quotation
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider, SignedUrlOptions } from '../storage/storage-provider.interface.js';
import {
  ReceivedQuotationNotFoundError,
  ReceivedQuotationConflictError,
  InvalidContentTypeError,
  InvalidFileTypeError,
  FileSizeLimitExceededError,
} from '../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../errors/estimateRequestError.js';
import logger from '../utils/logger.js';

/**
 * ファイルサイズ上限（10MB）
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 許可されるMIMEタイプ
 */
const ALLOWED_MIME_TYPES = [
  // PDF
  'application/pdf',
  // Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // 画像
  'image/jpeg',
  'image/png',
  'image/jpg',
];

/**
 * 受領見積書サービス依存関係
 */
export interface ReceivedQuotationServiceDependencies {
  prisma: PrismaClient;
  storageProvider: StorageProvider;
}

/**
 * ファイル情報
 */
export interface FileInfo {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

/**
 * 受領見積書作成入力（改訂版）
 */
export interface CreateReceivedQuotationInput {
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  file?: FileInfo;
}

/**
 * 受領見積書更新入力（改訂版）
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  file?: FileInfo;
  removeFile?: boolean;
}

/**
 * 受領見積書情報（改訂版）
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
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
 * 受領見積書サービス（改訂版）
 *
 * 受領見積書のCRUD操作とファイル管理を担当します。
 * contentType/textContentを廃止し、ファイルと明細行データの共存を許可します。
 */
export class ReceivedQuotationService {
  private readonly prisma: PrismaClient;
  private readonly storageProvider: StorageProvider;

  constructor(deps: ReceivedQuotationServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
  }

  /**
   * ファイル形式を検証する
   *
   * Requirements: 11.8
   */
  private validateFileType(file: FileInfo): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimeType)) {
      throw new InvalidFileTypeError(file.mimeType, ALLOWED_MIME_TYPES);
    }
  }

  /**
   * ファイルサイズを検証する
   *
   * Requirements: 11.9
   */
  private validateFileSize(file: FileInfo): void {
    if (file.size > MAX_FILE_SIZE) {
      throw new FileSizeLimitExceededError(file.size, MAX_FILE_SIZE);
    }
  }

  /**
   * ファイルパスを生成する
   */
  private generateFilePath(
    estimateRequestId: string,
    quotationId: string,
    fileName: string
  ): string {
    return `quotations/${estimateRequestId}/${quotationId}/${fileName}`;
  }

  /**
   * ファイルをアップロードする
   */
  private async uploadFile(
    estimateRequestId: string,
    quotationId: string,
    file: FileInfo
  ): Promise<string> {
    const filePath = this.generateFilePath(estimateRequestId, quotationId, file.originalName);
    await this.storageProvider.upload(filePath, file.buffer, {
      contentType: file.mimeType,
    });
    return filePath;
  }

  /**
   * ファイルを削除する（エラーはログに記録して続行）
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      await this.storageProvider.delete(filePath);
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to delete file from storage');
      // ファイル削除の失敗は許容（バックグラウンドジョブで再試行）
    }
  }

  /**
   * 受領見積書を作成する（改訂版）
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.8, 11.9, 11.10, 11.22
   *
   * @param input - 作成入力
   * @returns 作成された受領見積書情報
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   * @throws InvalidFileTypeError ファイル形式エラー
   * @throws FileSizeLimitExceededError ファイルサイズ超過
   */
  async create(input: CreateReceivedQuotationInput): Promise<ReceivedQuotationInfo> {
    // 1. ファイルのバリデーション
    if (input.file) {
      this.validateFileType(input.file);
      this.validateFileSize(input.file);
    }

    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 2. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id: input.estimateRequestId },
        select: { id: true, deletedAt: true },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(input.estimateRequestId);
      }

      // 3. レコードを作成
      const quotation = await tx.receivedQuotation.create({
        data: {
          estimateRequestId: input.estimateRequestId,
          name: input.name.trim(),
          submittedAt: input.submittedAt,
          filePath: null,
          fileName: input.file ? input.file.originalName : null,
          fileMimeType: input.file ? input.file.mimeType : null,
          fileSize: input.file ? input.file.size : null,
        },
      });

      // 4. ファイルをアップロードしてパスを更新
      let filePath: string | null = null;
      if (input.file) {
        filePath = await this.uploadFile(input.estimateRequestId, quotation.id, input.file);

        await tx.receivedQuotation.update({
          where: { id: quotation.id },
          data: { filePath },
        });
      }

      return this.toReceivedQuotationInfo({
        ...quotation,
        filePath,
      });
    });
  }

  /**
   * 受領見積書詳細を取得する
   *
   * @param id - 受領見積書ID
   * @returns 受領見積書詳細情報（存在しない場合はnull）
   */
  async findById(id: string): Promise<ReceivedQuotationInfo | null> {
    const quotation = await this.prisma.receivedQuotation.findUnique({
      where: { id },
    });

    if (!quotation || quotation.deletedAt !== null) {
      return null;
    }

    return this.toReceivedQuotationInfo(quotation);
  }

  /**
   * 見積依頼に紐付く受領見積書一覧を取得する
   *
   * Requirements: 11.11
   *
   * @param estimateRequestId - 見積依頼ID
   * @returns 受領見積書一覧
   */
  async findByEstimateRequestId(estimateRequestId: string): Promise<ReceivedQuotationInfo[]> {
    const quotations = await this.prisma.receivedQuotation.findMany({
      where: {
        estimateRequestId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return quotations.map((q) => this.toReceivedQuotationInfo(q));
  }

  /**
   * 受領見積書を更新する（楽観的排他制御付き、改訂版）
   *
   * Requirements: 11.15, 11.16
   *
   * @param id - 受領見積書ID
   * @param input - 更新入力
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @returns 更新された受領見積書情報
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws ReceivedQuotationConflictError 楽観的排他制御エラー
   */
  async update(
    id: string,
    input: UpdateReceivedQuotationInput,
    expectedUpdatedAt: Date
  ): Promise<ReceivedQuotationInfo> {
    // ファイルのバリデーション
    if (input.file) {
      this.validateFileType(input.file);
      this.validateFileSize(input.file);
    }

    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 受領見積書の存在確認
      const quotation = await tx.receivedQuotation.findUnique({
        where: { id },
      });

      if (!quotation || quotation.deletedAt !== null) {
        throw new ReceivedQuotationNotFoundError(id);
      }

      // 2. 楽観的排他制御
      if (quotation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ReceivedQuotationConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: quotation.updatedAt.toISOString(),
        });
      }

      // 3. 更新データの準備
      const updateData: {
        name?: string;
        submittedAt?: Date;
        filePath?: string | null;
        fileName?: string | null;
        fileMimeType?: string | null;
        fileSize?: number | null;
      } = {};

      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }
      if (input.submittedAt !== undefined) {
        updateData.submittedAt = input.submittedAt;
      }

      // 4. ファイル更新処理
      const oldFilePath = quotation.filePath;
      let newFilePath: string | null = null;

      if (input.removeFile) {
        // ファイル削除要求
        updateData.filePath = null;
        updateData.fileName = null;
        updateData.fileMimeType = null;
        updateData.fileSize = null;
      } else if (input.file) {
        // 新しいファイルのアップロード
        newFilePath = await this.uploadFile(quotation.estimateRequestId, id, input.file);
        updateData.filePath = newFilePath;
        updateData.fileName = input.file.originalName;
        updateData.fileMimeType = input.file.mimeType;
        updateData.fileSize = input.file.size;
      }

      // 5. 更新
      const updatedQuotation = await tx.receivedQuotation.update({
        where: { id },
        data: updateData,
      });

      // 6. 旧ファイルの削除（新しいファイルがアップロードされた場合またはファイル削除要求）
      if (oldFilePath && (newFilePath || input.removeFile)) {
        await this.deleteFile(oldFilePath);
      }

      return this.toReceivedQuotationInfo(updatedQuotation);
    });
  }

  /**
   * 受領見積書を論理削除する（楽観的排他制御付き、ファイル物理削除）
   *
   * Requirements: 11.16, 11.17
   *
   * @param id - 受領見積書ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws ReceivedQuotationConflictError 楽観的排他制御エラー
   */
  async delete(id: string, expectedUpdatedAt: Date): Promise<void> {
    let filePath: string | null = null;

    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 受領見積書の存在確認
      const quotation = await tx.receivedQuotation.findUnique({
        where: { id },
      });

      if (!quotation || quotation.deletedAt !== null) {
        throw new ReceivedQuotationNotFoundError(id);
      }

      // 2. 楽観的排他制御
      if (quotation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ReceivedQuotationConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: quotation.updatedAt.toISOString(),
        });
      }

      // 3. ファイルパスを保存
      filePath = quotation.filePath;

      // 4. 論理削除
      await tx.receivedQuotation.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });

    // 5. ファイルの物理削除（トランザクション外）
    if (filePath) {
      await this.deleteFile(filePath);
    }
  }

  /**
   * ファイルプレビュー用の署名付きURLを取得する（改訂版）
   *
   * Requirements: 11.14
   *
   * @param id - 受領見積書ID
   * @returns 署名付きURL
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws InvalidContentTypeError ファイルが存在しない場合
   */
  async getFilePreviewUrl(id: string): Promise<string> {
    const quotation = await this.prisma.receivedQuotation.findUnique({
      where: { id },
    });

    if (!quotation || quotation.deletedAt !== null) {
      throw new ReceivedQuotationNotFoundError(id);
    }

    if (!quotation.filePath) {
      throw new InvalidContentTypeError(
        'FILE',
        'この受領見積書にはプレビュー可能なファイルがありません'
      );
    }

    const options: SignedUrlOptions = {
      expiresIn: 3600, // 1時間
      responseContentDisposition: `inline; filename="${quotation.fileName}"`,
    };

    return await this.storageProvider.getSignedUrl(quotation.filePath, options);
  }

  /**
   * データベースの結果をReceivedQuotationInfoに変換（改訂版）
   */
  private toReceivedQuotationInfo(quotation: {
    id: string;
    estimateRequestId: string;
    name: string;
    submittedAt: Date;
    filePath: string | null;
    fileName: string | null;
    fileMimeType: string | null;
    fileSize: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): ReceivedQuotationInfo {
    return {
      id: quotation.id,
      estimateRequestId: quotation.estimateRequestId,
      name: quotation.name,
      submittedAt: quotation.submittedAt,
      fileName: quotation.fileName,
      fileMimeType: quotation.fileMimeType,
      fileSize: quotation.fileSize,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }
}
