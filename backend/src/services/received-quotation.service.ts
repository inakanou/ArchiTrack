/**
 * @fileoverview 受領見積書サービス（改訂版: Task 21.1）
 *
 * 受領見積書のCRUD操作、ファイル管理、および明細行データ管理を担当します。
 * 改訂版ではcontentType/textContentを廃止し、ファイルと明細行の共存モデルへ移行。
 * Task 21.1で明細行データの一括保存・取得・全量置換・金額検証を追加。
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
 * - 11.12: 金額の自動計算検証
 * - 11.13: 合計金額算出
 * - 11.14: ファイルプレビュー
 * - 11.15, 11.16, 11.17: 編集・削除
 * - 11.22: ファイルまたは明細行データのいずれかが必須
 * - 11.24: ファイルも明細行もない場合のエラー
 * - 14.1: 見積依頼に紐づけて保存
 * - 14.2: 明細行データをDBに永続化
 * - 14.3: ファイルをストレージに保存
 * - 14.4: 作成日時と更新日時を記録
 * - 14.5: 論理削除
 * - 14.6: 楽観的排他制御
 *
 * Task 12.1: ReceivedQuotationServiceの実装
 * Task 20.2: contentType/textContent廃止、ファイル+明細行共存モデルへ移行
 * Task 21.1: 明細行管理追加（一括保存・取得・全量置換・金額検証）
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
  FileOrLineItemsRequiredError,
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
 * 明細行入力データ
 * Task 21.1: 明細行データの入力インターフェース
 */
export interface LineItemInput {
  name: string;
  sortOrder: number;
  customCategory?: string | null;
  workType?: string | null;
  specification?: string | null;
  unit?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  netAmount?: number | null;
  remarks?: string | null;
}

/**
 * 明細行情報（出力）
 * Task 21.1: 明細行データの出力インターフェース
 */
export interface LineItemInfo {
  id: string;
  receivedQuotationId: string;
  sortOrder: number;
  customCategory: string | null;
  workType: string | null;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  netAmount: number | null;
  remarks: string | null;
}

/**
 * 受領見積書作成入力（改訂版: Task 21.1 明細行対応追加）
 */
export interface CreateReceivedQuotationInput {
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  file?: FileInfo;
  lineItems?: LineItemInput[];
}

/**
 * 受領見積書更新入力（改訂版: Task 21.1 明細行対応追加）
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  file?: FileInfo;
  removeFile?: boolean;
  lineItems?: LineItemInput[];
}

/**
 * 受領見積書情報（改訂版: Task 21.1 明細行・合計金額追加）
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string;
  name: string;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  lineItems: LineItemInfo[];
  totalAmount: number | null;
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
 * 受領見積書サービス（改訂版: Task 21.1 明細行管理追加）
 *
 * 受領見積書のCRUD操作、ファイル管理、および明細行データ管理を担当します。
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
   *
   * Task 21.1: ファイル削除時のリカバリスコープとしてログ記録を実装
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      await this.storageProvider.delete(filePath);
    } catch (error) {
      logger.error({ error, filePath }, 'Failed to delete file from storage');
      // ファイル削除の失敗は許容（定期的な手動クリーンアップで対応）
    }
  }

  /**
   * 明細行データのサーバーサイド金額検証・補正を行う
   *
   * Requirements: 11.12 - 金額は単価と数量の積として自動計算
   * Task 21.1: 明細行データのサーバーサイド金額検証を実装
   *
   * @param lineItems - 明細行入力データ
   * @returns 金額が検証・補正された明細行データ
   */
  private validateAndCorrectAmounts(lineItems: LineItemInput[]): LineItemInput[] {
    return lineItems.map((item) => {
      const quantity = item.quantity ?? null;
      const unitPrice = item.unitPrice ?? null;

      // 数量と単価が両方存在する場合、金額をサーバーサイドで再計算
      let correctedAmount: number | null = item.amount ?? null;
      if (quantity !== null && unitPrice !== null) {
        correctedAmount = quantity * unitPrice;
      }

      return {
        ...item,
        amount: correctedAmount,
      };
    });
  }

  /**
   * 明細行の合計金額を算出する
   *
   * Requirements: 11.13 - 全明細行の金額合計を自動計算
   * Task 21.1: 合計金額算出
   *
   * @param lineItems - 明細行情報配列
   * @returns 合計金額（明細行が0件の場合はnull）
   */
  private calculateTotalAmount(lineItems: LineItemInfo[]): number | null {
    if (lineItems.length === 0) {
      return null;
    }

    let total = 0;
    let hasAmount = false;
    for (const item of lineItems) {
      if (item.amount !== null) {
        total += item.amount;
        hasAmount = true;
      }
    }

    return hasAmount ? total : null;
  }

  /**
   * ファイルまたは明細行データのいずれか一方が必須のバリデーション
   *
   * Requirements: 11.22, 11.24
   * Task 21.1: ファイルまたは明細行データのいずれか一方が必須のバリデーションを実装
   */
  private validateFileOrLineItemsRequired(
    hasFile: boolean,
    lineItems: LineItemInput[] | undefined
  ): void {
    const hasLineItems = lineItems !== undefined && lineItems.length > 0;
    if (!hasFile && !hasLineItems) {
      throw new FileOrLineItemsRequiredError();
    }
  }

  /**
   * 受領見積書を作成する（改訂版: Task 21.1 明細行対応追加）
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.8, 11.9, 11.10, 11.22, 11.24, 14.1, 14.2
   *
   * @param input - 作成入力
   * @returns 作成された受領見積書情報（明細行・合計金額を含む）
   * @throws EstimateRequestNotFoundError 見積依頼が存在しない場合
   * @throws InvalidFileTypeError ファイル形式エラー
   * @throws FileSizeLimitExceededError ファイルサイズ超過
   * @throws Error ファイルも明細行もない場合
   */
  async create(input: CreateReceivedQuotationInput): Promise<ReceivedQuotationInfo> {
    // 1. ファイルのバリデーション
    if (input.file) {
      this.validateFileType(input.file);
      this.validateFileSize(input.file);
    }

    // 2. ファイルまたは明細行の必須チェック (Requirements: 11.22, 11.24)
    this.validateFileOrLineItemsRequired(!!input.file, input.lineItems);

    // 3. 明細行の金額検証・補正 (Requirements: 11.12)
    const correctedLineItems = input.lineItems
      ? this.validateAndCorrectAmounts(input.lineItems)
      : undefined;

    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 4. 見積依頼の存在確認
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id: input.estimateRequestId },
        select: { id: true, deletedAt: true },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(input.estimateRequestId);
      }

      // 5. レコードを作成
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
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // 6. 明細行データの一括保存 (Requirements: 14.2)
      if (correctedLineItems && correctedLineItems.length > 0) {
        await tx.receivedQuotationLineItem.createMany({
          data: correctedLineItems.map((item) => ({
            receivedQuotationId: quotation.id,
            sortOrder: item.sortOrder,
            customCategory: item.customCategory ?? null,
            workType: item.workType ?? null,
            name: item.name,
            specification: item.specification ?? null,
            unit: item.unit ?? null,
            quantity: item.quantity ?? null,
            unitPrice: item.unitPrice ?? null,
            amount: item.amount ?? null,
            netAmount: item.netAmount ?? null,
            remarks: item.remarks ?? null,
          })),
        });
      }

      // 7. ファイルをアップロードしてパスを更新
      let filePath: string | null = null;
      if (input.file) {
        filePath = await this.uploadFile(input.estimateRequestId, quotation.id, input.file);

        await tx.receivedQuotation.update({
          where: { id: quotation.id },
          data: { filePath },
        });
      }

      // 8. 明細行を含む完全なレコードを返却
      const lineItemInfos: LineItemInfo[] = (quotation.lineItems || []).map((li) =>
        this.toLineItemInfo(li)
      );

      // createMany後の明細行を取得するために再取得は不要（correctedLineItemsから構築）
      const resultLineItems: LineItemInfo[] =
        correctedLineItems && correctedLineItems.length > 0
          ? correctedLineItems.map((item, index) => ({
              id: `temp-${index}`, // IDはDB生成値だがcreateManyでは取得不可
              receivedQuotationId: quotation.id,
              sortOrder: item.sortOrder,
              customCategory: item.customCategory ?? null,
              workType: item.workType ?? null,
              name: item.name,
              specification: item.specification ?? null,
              unit: item.unit ?? null,
              quantity: item.quantity ?? null,
              unitPrice: item.unitPrice ?? null,
              amount: item.amount ?? null,
              netAmount: item.netAmount ?? null,
              remarks: item.remarks ?? null,
            }))
          : lineItemInfos;

      return this.toReceivedQuotationInfoWithLineItems(
        { ...quotation, filePath: filePath ?? quotation.filePath },
        resultLineItems
      );
    });
  }

  /**
   * 受領見積書詳細を取得する（明細行データ・合計金額を含む）
   *
   * Requirements: 11.11, 11.13
   * Task 21.1: 受領見積書取得時に明細行データと合計金額算出を含めて返却
   *
   * @param id - 受領見積書ID
   * @returns 受領見積書詳細情報（存在しない場合はnull）
   */
  async findById(id: string): Promise<ReceivedQuotationInfo | null> {
    const quotation = await this.prisma.receivedQuotation.findUnique({
      where: { id },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quotation || quotation.deletedAt !== null) {
      return null;
    }

    const lineItemInfos = (quotation.lineItems || []).map((li) => this.toLineItemInfo(li));

    return this.toReceivedQuotationInfoWithLineItems(quotation, lineItemInfos);
  }

  /**
   * 見積依頼に紐付く受領見積書一覧を取得する（明細行データ・合計金額を含む）
   *
   * Requirements: 11.11
   * Task 21.1: 受領見積書一覧に明細行データと合計金額を含めて返却
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
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return quotations.map((q) => {
      const lineItemInfos = (q.lineItems || []).map((li) => this.toLineItemInfo(li));
      return this.toReceivedQuotationInfoWithLineItems(q, lineItemInfos);
    });
  }

  /**
   * プロジェクトに紐付く受領見積書一覧を取得する（明細行データ・合計金額を含む）
   *
   * EstimateRequest経由でプロジェクトに紐付く受領見積書を取得する。
   * 見積書作成時の転記機能で使用。
   *
   * Requirements: REQ-17.1, REQ-17.2 (estimate-creation)
   * Task 21.1: プロジェクト単位受領見積書取得APIの実装
   *
   * @param projectId - プロジェクトID
   * @returns 受領見積書一覧
   */
  async findByProjectId(projectId: string): Promise<ReceivedQuotationInfo[]> {
    const quotations = await this.prisma.receivedQuotation.findMany({
      where: {
        deletedAt: null,
        estimateRequest: {
          projectId: projectId,
          deletedAt: null,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return quotations.map((q) => {
      const lineItemInfos = (q.lineItems || []).map((li) => this.toLineItemInfo(li));
      return this.toReceivedQuotationInfoWithLineItems(q, lineItemInfos);
    });
  }

  /**
   * 受領見積書を更新する（楽観的排他制御付き、明細行全量置換対応）
   *
   * Requirements: 11.15, 11.16, 14.2
   * Task 21.1: 受領見積書更新時に明細行の全量置換（DELETE + INSERT）をinteractive transaction内で実装
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

    // 明細行の金額検証・補正
    const correctedLineItems = input.lineItems
      ? this.validateAndCorrectAmounts(input.lineItems)
      : undefined;

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

      // 5. 明細行の全量置換（DELETE + INSERT）(Task 21.1)
      if (correctedLineItems !== undefined) {
        // 既存明細行を全削除
        await tx.receivedQuotationLineItem.deleteMany({
          where: { receivedQuotationId: id },
        });

        // 新しい明細行を一括作成
        if (correctedLineItems.length > 0) {
          await tx.receivedQuotationLineItem.createMany({
            data: correctedLineItems.map((item) => ({
              receivedQuotationId: id,
              sortOrder: item.sortOrder,
              customCategory: item.customCategory ?? null,
              workType: item.workType ?? null,
              name: item.name,
              specification: item.specification ?? null,
              unit: item.unit ?? null,
              quantity: item.quantity ?? null,
              unitPrice: item.unitPrice ?? null,
              amount: item.amount ?? null,
              netAmount: item.netAmount ?? null,
              remarks: item.remarks ?? null,
            })),
          });
        }
      }

      // 6. 受領見積書本体を更新（明細行を含めて取得）
      const updatedQuotation = await tx.receivedQuotation.update({
        where: { id },
        data: updateData,
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // 7. 旧ファイルの削除（新しいファイルがアップロードされた場合またはファイル削除要求）
      if (oldFilePath && (newFilePath || input.removeFile)) {
        await this.deleteFile(oldFilePath);
      }

      const lineItemInfos = (updatedQuotation.lineItems || []).map((li) => this.toLineItemInfo(li));
      return this.toReceivedQuotationInfoWithLineItems(updatedQuotation, lineItemInfos);
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
   * DBの明細行レコードをLineItemInfoに変換
   */
  private toLineItemInfo(lineItem: {
    id: string;
    receivedQuotationId: string;
    sortOrder: number;
    customCategory: string | null;
    workType: string | null;
    name: string;
    specification: string | null;
    unit: string | null;
    quantity: unknown;
    unitPrice: unknown;
    amount: unknown;
    netAmount?: unknown;
    remarks: string | null;
  }): LineItemInfo {
    return {
      id: lineItem.id,
      receivedQuotationId: lineItem.receivedQuotationId,
      sortOrder: lineItem.sortOrder,
      customCategory: lineItem.customCategory,
      workType: lineItem.workType,
      name: lineItem.name,
      specification: lineItem.specification,
      unit: lineItem.unit,
      quantity: lineItem.quantity !== null ? Number(lineItem.quantity) : null,
      unitPrice: lineItem.unitPrice !== null ? Number(lineItem.unitPrice) : null,
      amount: lineItem.amount !== null ? Number(lineItem.amount) : null,
      netAmount: lineItem.netAmount != null ? Number(lineItem.netAmount) : null,
      remarks: lineItem.remarks,
    };
  }

  /**
   * データベースの結果をReceivedQuotationInfoに変換（明細行・合計金額を含む）
   * Task 21.1: 明細行データと合計金額を含むレスポンスへ改訂
   */
  private toReceivedQuotationInfoWithLineItems(
    quotation: {
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
    },
    lineItems: LineItemInfo[]
  ): ReceivedQuotationInfo {
    return {
      id: quotation.id,
      estimateRequestId: quotation.estimateRequestId,
      name: quotation.name,
      submittedAt: quotation.submittedAt,
      fileName: quotation.fileName,
      fileMimeType: quotation.fileMimeType,
      fileSize: quotation.fileSize,
      lineItems,
      totalAmount: this.calculateTotalAmount(lineItems),
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }
}
