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
 * 案件の閲覧範囲（estimate-request の Requirement 42、タスク103.1）: ファイルのプレビュー用の署名付きURLは、
 * 閲覧範囲内の案件の受領見積書に限って発行する。
 *
 * 監査ログ（estimate-request の Requirement 14.7、タスク111.1）: 作成・更新・論理削除が確定したときに、
 * その操作の監査ログを変更と同じトランザクションの中で 1 件記録する。金額とファイルの格納先は入れない。
 *
 * 受領見積書の文脈（estimate-request の design の Requirements 43-50 の章の D1〜D3、タスク113.1）:
 * 作成は文脈（見積依頼・案件）を受ける。見積依頼の文脈では見積依頼の案件と宛先の取引先を写し、案件の文脈では
 * 見積依頼を持たない受領見積書を作る。更新は文脈を変えない（43.10）。案件の配下の一覧・プレビューの範囲の判定・
 * ファイルの格納先は受領見積書の案件の列で行い、案件の無い受領見積書は不在として扱う（43.14）。
 *
 * Task 12.1: ReceivedQuotationServiceの実装
 * Task 20.2: contentType/textContent廃止、ファイル+明細行共存モデルへ移行
 * Task 21.1: 明細行管理追加（一括保存・取得・全量置換・金額検証）
 *
 * @module services/received-quotation
 */

import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { IAuditLogService } from '../types/audit-log.types.js';
import { RECEIVED_QUOTATION_TARGET_TYPE } from '../types/audit-log.types.js';
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
import { ProjectNotFoundError } from '../errors/projectError.js';
import { ValidationError } from '../errors/apiError.js';
import { RECEIVED_QUOTATION_VALIDATION_MESSAGES } from '../schemas/received-quotation.schema.js';
import logger from '../utils/logger.js';
import { getSharedProjectScopeService, type ProjectScopeService } from './project-scope.service.js';

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
  /**
   * 作成・更新・論理削除の監査ログの記録（estimate-request の Requirement 14.7、タスク111.1）。
   * 省略時に記録しない形にすると組み立ての漏れで記録が黙って止まるため、必須の依存とする
   */
  auditLogService: IAuditLogService;
  /** 署名付きURLの発行の判定（省略時は共有のインスタンス。タスク103.1） */
  projectScopeService?: Pick<ProjectScopeService, 'canAccessProject'>;
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
 * Task 61.2: netAmountを削除（受領見積書レベルに移動）
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
  remarks?: string | null;
}

/**
 * 明細行情報（出力）
 * Task 21.1: 明細行データの出力インターフェース
 * Task 61.2: netAmountを削除（受領見積書レベルに移動）
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
  remarks: string | null;
}

/**
 * 受領見積書の文脈（design の Requirements 43-50 の章の Service Interface、タスク113.1）
 *
 * - estimateRequest: 見積依頼に紐づく受領見積書。案件と業者名・取引先は見積依頼から写す（D1・D4）
 * - project: 見積依頼に紐づかずに案件に属する受領見積書（43.7）
 */
export type QuotationContext =
  | { readonly kind: 'estimateRequest'; readonly estimateRequestId: string }
  | { readonly kind: 'project'; readonly projectId: string };

/** 案件の配下の一覧の対象（D2。既定の requested は見積依頼に紐づくものだけ） */
export interface FindByProjectIdOptions {
  readonly include: 'requested' | 'all';
}

/**
 * 受領見積書作成入力（改訂版: Task 61.2 netAmount追加。タスク113.1 で文脈を引数へ移した）
 */
export interface CreateReceivedQuotationInput {
  /** 業者名（44.1）。案件の文脈では必須（43.8）、見積依頼の文脈では使わない（44.3） */
  vendorName?: string;
  name: string;
  submittedAt: Date;
  netAmount?: number | null;
  file?: FileInfo;
  lineItems?: LineItemInput[];
}

/**
 * 受領見積書更新入力（改訂版: Task 61.2 netAmount追加）
 */
export interface UpdateReceivedQuotationInput {
  name?: string;
  submittedAt?: Date;
  netAmount?: number | null;
  file?: FileInfo;
  removeFile?: boolean;
  lineItems?: LineItemInput[];
}

/**
 * 受領見積書情報（改訂版: Task 61.2 netAmount追加）
 */
export interface ReceivedQuotationInfo {
  id: string;
  estimateRequestId: string | null;
  name: string;
  submittedAt: Date;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  netAmount: number | null;
  lineItems: LineItemInfo[];
  totalAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 案件の配下の一覧の 1 件（D2）。`tradingPartnerName` は業者名の値を入れて残す
 * （estimate-creation の転記の画面が読む）
 */
export type ProjectQuotationSummary = ReceivedQuotationInfo & {
  vendorName: string;
  tradingPartnerName: string;
};

/**
 * Prismaトランザクションクライアント型
 *
 * 監査ログを同じトランザクションで書くため（`IAuditLogService.createLog` の第 2 引数。タスク111.1）、
 * `$transaction` のコールバックが受ける Prisma の型そのものとする
 */
type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * 受領見積書サービス（改訂版: Task 21.1 明細行管理追加）
 *
 * 受領見積書のCRUD操作、ファイル管理、および明細行データ管理を担当します。
 * contentType/textContentを廃止し、ファイルと明細行データの共存を許可します。
 */
export class ReceivedQuotationService {
  private readonly prisma: PrismaClient;
  private readonly storageProvider: StorageProvider;
  private readonly auditLogService: IAuditLogService;
  private readonly projectScopeService: Pick<ProjectScopeService, 'canAccessProject'> | undefined;

  constructor(deps: ReceivedQuotationServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
    this.auditLogService = deps.auditLogService;
    this.projectScopeService = deps.projectScopeService;
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
   *
   * 見積依頼に紐づくものは従来の格納先、見積依頼に紐づかないものは案件の格納先とする（D3。タスク113.1）
   */
  private generateFilePath(
    owner: { estimateRequestId: string | null; projectId: string },
    quotationId: string,
    fileName: string
  ): string {
    return owner.estimateRequestId !== null
      ? `quotations/${owner.estimateRequestId}/${quotationId}/${fileName}`
      : `quotations/projects/${owner.projectId}/${quotationId}/${fileName}`;
  }

  /**
   * ファイルをアップロードする
   */
  private async uploadFile(
    owner: { estimateRequestId: string | null; projectId: string },
    quotationId: string,
    file: FileInfo
  ): Promise<string> {
    const filePath = this.generateFilePath(owner, quotationId, file.originalName);
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
   * 作成の文脈から、受領見積書の見積依頼・案件・業者名・取引先を決める（D1・D4。タスク113.1）
   *
   * - 見積依頼の文脈: 見積依頼の案件と宛先の取引先の名前・ID を写し、入力の業者名を使わない（44.3）
   * - 案件の文脈: 見積依頼を持たず、案件（論理削除されていないもの）に属する。業者名は入力の値（前後の空白を除く）
   */
  private async resolveContext(
    tx: PrismaTransactionClient,
    context: QuotationContext,
    input: CreateReceivedQuotationInput
  ): Promise<{
    estimateRequestId: string | null;
    projectId: string;
    vendorName: string;
    tradingPartnerId: string | null;
  }> {
    if (context.kind === 'estimateRequest') {
      const estimateRequest = await tx.estimateRequest.findUnique({
        where: { id: context.estimateRequestId },
        select: {
          id: true,
          deletedAt: true,
          projectId: true,
          tradingPartnerId: true,
          tradingPartner: { select: { name: true } },
        },
      });

      if (!estimateRequest || estimateRequest.deletedAt !== null) {
        throw new EstimateRequestNotFoundError(context.estimateRequestId);
      }
      return {
        estimateRequestId: estimateRequest.id,
        projectId: estimateRequest.projectId,
        vendorName: estimateRequest.tradingPartner.name,
        tradingPartnerId: estimateRequest.tradingPartnerId,
      };
    }

    const vendorName = input.vendorName?.trim() ?? '';
    if (vendorName.length === 0) {
      throw new ValidationError(RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED);
    }
    const project = await tx.project.findUnique({
      where: { id: context.projectId },
      select: { id: true, deletedAt: true },
    });
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError(context.projectId);
    }
    return {
      estimateRequestId: null,
      projectId: project.id,
      vendorName,
      tradingPartnerId: null,
    };
  }

  /**
   * 受領見積書を作成する（改訂版: Task 21.1 明細行対応追加）
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.8, 11.9, 11.10, 11.22, 11.24, 14.1, 14.2
   *
   * 確定したら RECEIVED_QUOTATION_CREATED の監査ログを同じトランザクションの中で 1 件記録する
   * （estimate-request の Requirement 14.7、タスク111.1）
   *
   * @param context - 受領見積書の文脈（見積依頼・案件。タスク113.1）
   * @param input - 作成入力
   * @param actorId - 操作した利用者のID（監査ログの実行者）
   * @returns 作成された受領見積書情報（明細行・合計金額を含む）
   * @throws EstimateRequestNotFoundError 見積依頼の文脈で見積依頼が存在しない場合
   * @throws ProjectNotFoundError 案件の文脈で案件が存在しないか論理削除済みの場合
   * @throws ValidationError 案件の文脈で業者名が空の場合（43.8）
   * @throws InvalidFileTypeError ファイル形式エラー
   * @throws FileSizeLimitExceededError ファイルサイズ超過
   * @throws Error ファイルも明細行もない場合
   */
  async create(
    context: QuotationContext,
    input: CreateReceivedQuotationInput,
    actorId: string
  ): Promise<ReceivedQuotationInfo> {
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
      // 4. 文脈の解決（タスク113.1）: 見積依頼・案件・業者名・取引先を決める
      const owner = await this.resolveContext(tx, context, input);

      // 5. レコードを作成（Task 61.2: netAmountを受領見積書レベルに永続化）
      const quotation = await tx.receivedQuotation.create({
        data: {
          estimateRequestId: owner.estimateRequestId,
          projectId: owner.projectId,
          vendorName: owner.vendorName,
          tradingPartnerId: owner.tradingPartnerId,
          name: input.name.trim(),
          submittedAt: input.submittedAt,
          filePath: null,
          fileName: input.file ? input.file.originalName : null,
          fileMimeType: input.file ? input.file.mimeType : null,
          fileSize: input.file ? input.file.size : null,
          netAmount: input.netAmount ?? null,
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // 6. 明細行データの一括保存 (Requirements: 14.2)
      // Task 61.2: netAmountは受領見積書レベルに移動したため、明細行には含めない
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
            remarks: item.remarks ?? null,
          })),
        });
      }

      // 6.5 監査ログの記録（Requirement 14.7、タスク111.1）。データベースの変更の後、巻き戻らない
      // ストレージへの送信（手順 7）の前に置き、記録の失敗ではファイルを送らずに巻き戻す。
      // 協力業者の金額（netAmount・明細行の中身）とファイルの格納先は社外秘のため入れない
      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_CREATED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: quotation.id,
          before: null,
          after: {
            estimateRequestId: quotation.estimateRequestId,
            name: quotation.name,
            submittedAt: quotation.submittedAt.toISOString(),
            fileName: quotation.fileName,
            lineItemCount: correctedLineItems?.length ?? 0,
          },
        },
        tx
      );

      // 7. ファイルをアップロードしてパスを更新
      let filePath: string | null = null;
      if (input.file) {
        filePath = await this.uploadFile(owner, quotation.id, input.file);

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
      // Task 61.2: netAmountは明細行から除外（受領見積書レベルに移動）
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
   * 受領見積書の案件の列で絞る（D1。タスク113.1）。既定の requested は見積依頼に紐づくもの（論理削除されて
   * いない見積依頼のもの）だけを返し、見積書作成時の転記機能の応答を変えない（D2）。all は見積依頼に
   * 紐づかないものも返す（43.1）。どちらも見積依頼が論理削除された受領見積書は返さない。
   * 応答に業者名を足し、`tradingPartnerName` には業者名の値を入れる（D2）
   *
   * Requirements: REQ-17.1, REQ-17.2 (estimate-creation)
   * Task 21.1: プロジェクト単位受領見積書取得APIの実装
   *
   * @param projectId - プロジェクトID
   * @param options - 一覧の対象（requested・all）
   * @returns 受領見積書一覧
   */
  async findByProjectId(
    projectId: string,
    options: FindByProjectIdOptions
  ): Promise<ProjectQuotationSummary[]> {
    const liveRequest = { estimateRequest: { is: { deletedAt: null } } };
    const where: Prisma.ReceivedQuotationWhereInput =
      options.include === 'all'
        ? { projectId, deletedAt: null, OR: [{ estimateRequestId: null }, liveRequest] }
        : { projectId, deletedAt: null, estimateRequestId: { not: null }, ...liveRequest };

    const quotations = await this.prisma.receivedQuotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        lineItems: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return quotations.map((q) => {
      const lineItemInfos = (q.lineItems || []).map((li) => this.toLineItemInfo(li));
      const info = this.toReceivedQuotationInfoWithLineItems(q, lineItemInfos);
      return {
        ...info,
        vendorName: q.vendorName,
        tradingPartnerName: q.vendorName,
      };
    });
  }

  /**
   * 受領見積書を更新する（楽観的排他制御付き、明細行全量置換対応）
   *
   * Requirements: 11.15, 11.16, 14.2
   * Task 21.1: 受領見積書更新時に明細行の全量置換（DELETE + INSERT）をinteractive transaction内で実装
   *
   * 確定したら RECEIVED_QUOTATION_UPDATED の監査ログを同じトランザクションの中で 1 件記録する
   * （estimate-request の Requirement 14.7、タスク111.1）
   *
   * @param id - 受領見積書ID
   * @param input - 更新入力
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @param actorId - 操作した利用者のID（監査ログの実行者）
   * @returns 更新された受領見積書情報
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws ReceivedQuotationConflictError 楽観的排他制御エラー
   */
  async update(
    id: string,
    input: UpdateReceivedQuotationInput,
    expectedUpdatedAt: Date,
    actorId: string
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

      // 案件の無い受領見積書は不在として扱う（43.14。タスク113.1）
      if (!quotation || quotation.deletedAt !== null || quotation.projectId === null) {
        throw new ReceivedQuotationNotFoundError(id);
      }
      const owner = {
        estimateRequestId: quotation.estimateRequestId,
        projectId: quotation.projectId,
      };

      // 2. 楽観的排他制御
      if (quotation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ReceivedQuotationConflictError({
          expectedUpdatedAt: expectedUpdatedAt.toISOString(),
          actualUpdatedAt: quotation.updatedAt.toISOString(),
        });
      }

      // 3. 更新データの準備（Task 61.2: netAmount追加）。文脈（見積依頼・案件）は変えない（43.10）
      const updateData: {
        name?: string;
        submittedAt?: Date;
        netAmount?: number | null;
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
      if (input.netAmount !== undefined) {
        updateData.netAmount = input.netAmount;
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
        // 新しいファイルのアップロード（格納先は文脈で決まる。D3）
        newFilePath = await this.uploadFile(owner, id, input.file);
        updateData.filePath = newFilePath;
        updateData.fileName = input.file.originalName;
        updateData.fileMimeType = input.file.mimeType;
        updateData.fileSize = input.file.size;
      }

      // 5. 明細行の全量置換（DELETE + INSERT）(Task 21.1)
      // Task 61.2: netAmountは受領見積書レベルに移動したため、明細行には含めない
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

      // 6.5 監査ログの記録（Requirement 14.7、タスク111.1）。本体の更新の後、差し替え前のファイルを
      // ストレージから取り除く（手順 7）前に置き、記録の失敗で差し替え前のファイルを失わない。
      // 協力業者の金額（netAmount・明細行の中身）とファイルの格納先は社外秘のため入れない
      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_UPDATED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: id,
          before: {
            name: quotation.name,
            submittedAt: quotation.submittedAt.toISOString(),
            fileName: quotation.fileName,
          },
          after: {
            name: updatedQuotation.name,
            submittedAt: updatedQuotation.submittedAt.toISOString(),
            fileName: updatedQuotation.fileName,
          },
        },
        tx
      );

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
   * 確定したら RECEIVED_QUOTATION_DELETED の監査ログを同じトランザクションの中で 1 件記録する
   * （estimate-request の Requirement 14.7、タスク111.1）
   *
   * @param id - 受領見積書ID
   * @param expectedUpdatedAt - 期待される更新日時（楽観的排他制御用）
   * @param actorId - 操作した利用者のID（監査ログの実行者）
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws ReceivedQuotationConflictError 楽観的排他制御エラー
   */
  async delete(id: string, expectedUpdatedAt: Date, actorId: string): Promise<void> {
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

      // 4.5 監査ログの記録（Requirement 14.7、タスク111.1）。論理削除の後、コールバックの最後。
      // ファイルの取り除きはもとから確定の後（トランザクションの外）である
      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_DELETED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: id,
          before: {
            estimateRequestId: quotation.estimateRequestId,
            name: quotation.name,
            submittedAt: quotation.submittedAt.toISOString(),
            fileName: quotation.fileName,
          },
          after: null,
        },
        tx
      );
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
   * 受領見積書の案件（案件の列。タスク113.1）が閲覧者の閲覧範囲に含まれる場合に限って発行する（タスク103.1）。
   * 案件の無い受領見積書は不在として扱う（43.14）。
   * 範囲外は受領見積書の不在と同じ扱いにし、署名付きURLを発行しない（経路の判定部品が先に 404 にするが、
   * 発行の箇所でも判定する）
   *
   * @param id - 受領見積書ID
   * @param viewerId - 閲覧者のユーザーID
   * @returns 署名付きURL
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合、または閲覧範囲外の場合
   * @throws InvalidContentTypeError ファイルが存在しない場合
   */
  async getFilePreviewUrl(id: string, viewerId: string): Promise<string> {
    const quotation = await this.prisma.receivedQuotation.findUnique({
      where: { id },
    });

    if (!quotation || quotation.deletedAt !== null || quotation.projectId === null) {
      throw new ReceivedQuotationNotFoundError(id);
    }

    if (
      !(await (this.projectScopeService ?? getSharedProjectScopeService()).canAccessProject(
        viewerId,
        quotation.projectId
      ))
    ) {
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
   * Task 61.2: netAmountを削除（受領見積書レベルに移動）
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
      remarks: lineItem.remarks,
    };
  }

  /**
   * データベースの結果をReceivedQuotationInfoに変換（明細行・合計金額を含む）
   * Task 61.2: netAmountを受領見積書レベルに追加
   */
  private toReceivedQuotationInfoWithLineItems(
    quotation: {
      id: string;
      estimateRequestId: string | null;
      name: string;
      submittedAt: Date;
      filePath: string | null;
      fileName: string | null;
      fileMimeType: string | null;
      fileSize: number | null;
      netAmount?: unknown;
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
      netAmount: quotation.netAmount != null ? Number(quotation.netAmount) : null,
      lineItems,
      totalAmount: this.calculateTotalAmount(lineItems),
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }
}
