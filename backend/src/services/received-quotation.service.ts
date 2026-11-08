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
 * 保存の規則（同章の D5・D9・D10、タスク113.3）: 送られた明細行の金額は保持し、金額が無く数量と単価がある行だけ
 * 数量×単価を求める（45.12）。合計は区分が別途の行を除く（45.5）。台帳の項目と明細行の新しい欄を保存し、
 * 読取の確認を D9 のとおり遷移させる（46.6〜46.8）。監査ログには台帳の項目の前後を入れ、工事価格・確定金額は
 * 変更の有無だけを入れる（46.11）。
 *
 * 原本の指紋と二重登録（同章の D6、タスク113.4）: ファイルの内容から sha256 を求めて保持する（48.1）。保存の
 * トランザクションの中で案件の勧告ロックを取ってから同じ案件の同じ指紋の受領見積書を読み、見積の区別も同じなら
 * `DuplicateOriginalError` で何も保存せず（ファイルも送らない）、違えばその件数を `sharedOriginalCount` で返す
 * （48.3〜48.7）。
 *
 * Task 12.1: ReceivedQuotationServiceの実装
 * Task 20.2: contentType/textContent廃止、ファイル+明細行共存モデルへ移行
 * Task 21.1: 明細行管理追加（一括保存・取得・全量置換・金額検証）
 *
 * @module services/received-quotation
 */

import { createHash } from 'crypto';
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
  DuplicateOriginalError,
} from '../errors/receivedQuotationError.js';
import { EstimateRequestNotFoundError } from '../errors/estimateRequestError.js';
import { ProjectNotFoundError } from '../errors/projectError.js';
import { ValidationError } from '../errors/apiError.js';
import {
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  type LineItemCategory,
  type LineItemConversion,
} from '../schemas/received-quotation.schema.js';
import logger from '../utils/logger.js';
import { getSharedProjectScopeService, type ProjectScopeService } from './project-scope.service.js';

/**
 * ファイルサイズ上限（10MB）
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 同じ案件の二重登録の判定を直列化する取引ロックの名前空間（pg_advisory_xact_lock の第1キー。第2キーは
 * 案件の ID の hashtext。design の Requirements 43-50 の章の D6、タスク113.4）
 */
export const ORIGINAL_FILE_LOCK_NAMESPACE = 113_004;

/**
 * プレビュー用の署名付きURLの有効期限（秒）。現場調査の画像・工事写真と同じ 15 分にそろえる
 * （design の Requirements 43-50 の章の D12、タスク113.5）。画面はプレビューを開くたびに URL を取り直す
 */
export const RECEIVED_QUOTATION_SIGNED_URL_EXPIRES_IN = 900;

/**
 * ファイルの内容から原本の指紋（sha256 の 16 進の小文字 64 文字）を求める（48.1）。保存のときと、既存の
 * ファイルの埋め戻し（backend/scripts/backfill-received-quotation-file-hash.ts、48.8）が同じ関数を使う
 *
 * @param buffer - ファイルの内容
 */
export function computeOriginalFingerprint(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

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
  /** 区分（45.1）。入力が無いときは直接工事（45.3。タスク113.3） */
  category?: LineItemCategory;
  /** 条件（45.7） */
  condition?: string | null;
  /** 換算（45.8）。4 列（数量・単位・単価・根拠）に分けて保存する */
  conversion?: LineItemConversion | null;
  /** 分類キー（47.1） */
  classificationKey?: string | null;
  /** 数量表の行のキー（47.4） */
  quantityRowKey?: string | null;
  /** 参考の印と理由（46.4） */
  isReference?: boolean;
  referenceReason?: string | null;
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
  category: LineItemCategory;
  condition: string | null;
  conversion: LineItemConversion | null;
  classificationKey: string | null;
  quantityRowKey: string | null;
  isReference: boolean;
  referenceReason: string | null;
}

/** 読取の確認の状態（46.6） */
export type ReadingStatus = 'UNCONFIRMED' | 'CONFIRMED';

/**
 * 受領見積書の台帳の項目の入力（design の同章の Service Interface の `LedgerFieldsInput` のうち業者名・取引先を除く。
 * タスク113.3）。欄が無い（undefined）は作成では既定、更新では変えない。null は消す
 */
export interface LedgerFieldsInput {
  quoteNumber?: string | null;
  overallConditions?: string | null;
  siteLocation?: string | null;
  constructionKind?: 'RENOVATION' | 'NEW_CONSTRUCTION' | null;
  useType?: string | null;
  constructionPrice?: number | null;
  workConditions?: string | null;
  distanceKm?: number | null;
  adoption?: 'ADOPTED' | 'REJECTED' | 'UNKNOWN';
  confirmedAmount?: number | null;
  /** 読取の確認（46.6）。遷移は D9 でサービスが決める */
  readingStatus?: ReadingStatus;
  /** 見積の区別（48.2） */
  quoteDiscriminator?: string;
}

/** 入力のとおりに保存する台帳の項目（読取の確認は D9 で決めるため含めない） */
const LEDGER_COLUMN_KEYS = [
  'quoteNumber',
  'overallConditions',
  'siteLocation',
  'constructionKind',
  'useType',
  'constructionPrice',
  'workConditions',
  'distanceKm',
  'adoption',
  'confirmedAmount',
  'quoteDiscriminator',
] as const satisfies ReadonlyArray<keyof LedgerFieldsInput>;
type LedgerColumnKey = (typeof LEDGER_COLUMN_KEYS)[number];
type LedgerColumns = { [K in LedgerColumnKey]?: LedgerFieldsInput[K] };

/** 明細行の保存の形（DB の列）。保存と、読取の確認の変化の判定（D9）の比較に使う */
interface LineItemRow {
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
  category: LineItemCategory;
  condition: string | null;
  conversionQuantity: number | null;
  conversionUnit: string | null;
  conversionUnitPrice: number | null;
  conversionBasis: string | null;
  classificationKey: string | null;
  quantityRowKey: string | null;
  isReference: boolean;
  referenceReason: string | null;
}

/** 金額・数量の列の小数の桁（DB の Decimal の scale）。比較の前に揃える */
const LINE_DECIMAL_SCALES = {
  quantity: 4,
  unitPrice: 2,
  amount: 2,
  conversionQuantity: 4,
  conversionUnitPrice: 2,
} as const;

/** Decimal・数・null を小数の桁で揃えた数にする（比較用） */
const toScaled = (value: unknown, scale: number): number | null =>
  value === null || value === undefined ? null : Number(Number(value).toFixed(scale));

/** Decimal・数・null を数にする（出力・記録用） */
const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

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
export interface CreateReceivedQuotationInput extends LedgerFieldsInput {
  /** 業者名（44.1）。案件の文脈では必須（43.8）、見積依頼の文脈では使わない（44.3） */
  vendorName?: string;
  /**
   * 選んだ取引先の ID（44.5）。案件の文脈だけで使い、論理削除されていない協力業者でなければ拒む。
   * 省略・null のときは業者名で照合する（44.6・44.7。タスク113.2）
   */
  tradingPartnerId?: string | null;
  name: string;
  submittedAt: Date;
  netAmount?: number | null;
  file?: FileInfo;
  lineItems?: LineItemInput[];
}

/**
 * 受領見積書更新入力（改訂版: Task 61.2 netAmount追加）
 */
export interface UpdateReceivedQuotationInput extends LedgerFieldsInput {
  /** 業者名（44.1）。案件の文脈だけで使い、見積依頼の文脈では無視する（44.3。タスク113.2） */
  vendorName?: string;
  /** 選んだ取引先の ID（44.5）。扱いは作成と同じ（タスク113.2） */
  tradingPartnerId?: string | null;
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
  /** 業者名と取引先（44.1〜44.7） */
  vendorName: string;
  tradingPartnerId: string | null;
  /** 台帳の項目（46.1〜46.3・46.6・46.7・48.2。タスク113.3） */
  quoteNumber: string | null;
  overallConditions: string | null;
  siteLocation: string | null;
  constructionKind: 'RENOVATION' | 'NEW_CONSTRUCTION' | null;
  useType: string | null;
  constructionPrice: number | null;
  workConditions: string | null;
  distanceKm: number | null;
  adoption: 'ADOPTED' | 'REJECTED' | 'UNKNOWN';
  confirmedAmount: number | null;
  readingStatus: ReadingStatus;
  readingConfirmedById: string | null;
  readingConfirmedAt: Date | null;
  quoteDiscriminator: string;
  lineItems: LineItemInfo[];
  /** 区分が別途の行を除いた金額の合計（45.5） */
  totalAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 案件の配下の一覧の 1 件（D2）。`tradingPartnerName` は業者名の値を入れて残す
 * （estimate-creation の転記の画面が読む）
 */
export type ProjectQuotationSummary = ReceivedQuotationInfo & {
  tradingPartnerName: string;
};

/**
 * 登録・更新の結果（design の同章の Service Interface の `SaveResult`、タスク113.4）
 */
export interface SaveResult {
  readonly quotation: ReceivedQuotationInfo;
  /** 同じ案件で原本の指紋が同じで見積の区別が違う、他の受領見積書の数（48.4）。ファイルが無ければ 0 */
  readonly sharedOriginalCount: number;
}

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
   * ファイルの内容から原本の指紋（sha256 の 16 進の小文字 64 文字）を求める（48.1）。
   * 送り手が申告した値は使わない
   */
  private computeFileSha256(file: FileInfo): string {
    return computeOriginalFingerprint(file.buffer);
  }

  /**
   * 同じ案件の二重登録を判定する（D6。48.3・48.4・48.7）
   *
   * 呼び出し元のトランザクションの中で案件の勧告ロックを取り、同じ案件の論理削除されていない（論理削除された
   * 見積依頼の配下のものも除く）自分以外の受領見積書で、同じ指紋のものを読む。見積の区別も同じものがあれば
   * `DuplicateOriginalError` を投げる。他の案件は読まない
   *
   * @returns 同じ指紋で見積の区別が違う他の受領見積書の数
   */
  private async checkDuplicateOriginal(
    tx: PrismaTransactionClient,
    params: {
      projectId: string;
      fileSha256: string;
      quoteDiscriminator: string;
      excludeId: string | null;
    }
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORIGINAL_FILE_LOCK_NAMESPACE}::int, hashtext(${params.projectId}))`;

    const others = await tx.receivedQuotation.findMany({
      where: {
        projectId: params.projectId,
        fileSha256: params.fileSha256,
        deletedAt: null,
        OR: [{ estimateRequestId: null }, { estimateRequest: { is: { deletedAt: null } } }],
        ...(params.excludeId !== null ? { id: { not: params.excludeId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { name: true, vendorName: true, submittedAt: true, quoteDiscriminator: true },
    });

    const same = others.find((other) => other.quoteDiscriminator === params.quoteDiscriminator);
    if (same) {
      throw new DuplicateOriginalError({
        name: same.name,
        vendorName: same.vendorName,
        submittedAt: same.submittedAt.toISOString(),
      });
    }
    return others.filter((other) => other.quoteDiscriminator !== params.quoteDiscriminator).length;
  }

  /**
   * 明細行データのサーバーサイド金額検証・補正を行う
   *
   * Requirements: 11.12 - 金額は単価と数量の積として自動計算
   *
   * 送られた金額は保持する（画面以外の経路で登録された金額を書き換えない。45.12）。金額が無く（null・省略）、
   * 数量と単価が両方あるときだけ、数量×単価を小数第 1 位で四捨五入して求める（D5。画面の自動計算と同じ
   * `Math.round`。タスク113.3）
   *
   * Task 21.1: 明細行データのサーバーサイド金額検証を実装
   *
   * @param lineItems - 明細行入力データ
   * @returns 金額を補った明細行データ
   */
  private validateAndCorrectAmounts(lineItems: LineItemInput[]): LineItemInput[] {
    return lineItems.map((item) => {
      if (item.amount !== undefined && item.amount !== null) {
        return item;
      }
      const quantity = item.quantity ?? null;
      const unitPrice = item.unitPrice ?? null;
      return {
        ...item,
        amount: quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice) : null,
      };
    });
  }

  /**
   * 明細行の入力を保存の形（DB の列）にする。区分の入力が無い行は直接工事（45.3）、換算は 4 列に分ける（タスク113.3）
   */
  private toLineItemRow(item: LineItemInput): LineItemRow {
    return {
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
      category: item.category ?? 'DIRECT',
      condition: item.condition ?? null,
      conversionQuantity: item.conversion?.quantity ?? null,
      conversionUnit: item.conversion?.unit ?? null,
      conversionUnitPrice: item.conversion?.unitPrice ?? null,
      conversionBasis: item.conversion?.basis ?? null,
      classificationKey: item.classificationKey ?? null,
      quantityRowKey: item.quantityRowKey ?? null,
      isReference: item.isReference ?? false,
      referenceReason: item.referenceReason ?? null,
    };
  }

  /**
   * 明細行の比較の鍵（全列。金額・数量は DB の小数の桁で揃える）。読取の確認の変化の判定に使う（D9）
   */
  private lineItemSignature(row: Record<keyof LineItemRow, unknown>): string {
    return JSON.stringify([
      row.sortOrder,
      row.customCategory ?? null,
      row.workType ?? null,
      row.name,
      row.specification ?? null,
      row.unit ?? null,
      toScaled(row.quantity, LINE_DECIMAL_SCALES.quantity),
      toScaled(row.unitPrice, LINE_DECIMAL_SCALES.unitPrice),
      toScaled(row.amount, LINE_DECIMAL_SCALES.amount),
      row.remarks ?? null,
      row.category ?? 'DIRECT',
      row.condition ?? null,
      toScaled(row.conversionQuantity, LINE_DECIMAL_SCALES.conversionQuantity),
      row.conversionUnit ?? null,
      toScaled(row.conversionUnitPrice, LINE_DECIMAL_SCALES.conversionUnitPrice),
      row.conversionBasis ?? null,
      row.classificationKey ?? null,
      row.quantityRowKey ?? null,
      row.isReference ?? false,
      row.referenceReason ?? null,
    ]);
  }

  /**
   * 入力のとおりに保存する台帳の項目を取り出す（送られた欄だけ。null は消す）
   */
  private pickLedgerColumns(input: LedgerFieldsInput): LedgerColumns {
    return Object.fromEntries(
      LEDGER_COLUMN_KEYS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])
    ) as LedgerColumns;
  }

  /**
   * 読取の確認の遷移を決める（D9。46.6〜46.8。タスク113.3）
   *
   * 1. 保存前が確認済みで、明細行・NET 金額・ファイルのどれかが変わる → 未確認に戻し、確認者と日時を消す
   *    （同じ保存で確認済みを送っていても戻す）
   * 2. 確認済みを送り、保存前が未確認（作成を含む） → 確認済み、確認者は操作した利用者、日時は今
   * 3. それ以外は入力のとおり（未確認を送れば確認者と日時を消す。確認済みを送り直しても確認者と日時は保つ。
   *    送らなければ変えない）
   *
   * @returns 書き込む列（変えないときは空）
   */
  private decideReadingConfirmation(
    previousStatus: ReadingStatus | null,
    requested: ReadingStatus | undefined,
    contentChanged: boolean,
    actorId: string
  ): {
    readingStatus?: ReadingStatus;
    readingConfirmedById?: string | null;
    readingConfirmedAt?: Date | null;
  } {
    const unconfirmed = {
      readingStatus: 'UNCONFIRMED' as const,
      readingConfirmedById: null,
      readingConfirmedAt: null,
    };
    if (previousStatus === 'CONFIRMED' && contentChanged) {
      return unconfirmed;
    }
    if (requested === 'CONFIRMED') {
      return previousStatus === 'CONFIRMED'
        ? { readingStatus: 'CONFIRMED' }
        : {
            readingStatus: 'CONFIRMED',
            readingConfirmedById: actorId,
            readingConfirmedAt: new Date(),
          };
    }
    if (requested === 'UNCONFIRMED') {
      return unconfirmed;
    }
    return {};
  }

  /**
   * 更新で明細行・NET 金額・ファイルのどれかが変わるかを判定する（D9 の 1。タスク113.3）
   *
   * 明細行は保存前（表示順）と保存後（表示順で並べた入力）を並び順と全列で比べる
   */
  private async hasReadContentChanged(
    tx: PrismaTransactionClient,
    current: { id: string; netAmount: unknown; filePath: string | null },
    input: UpdateReceivedQuotationInput,
    correctedLineItems: LineItemInput[] | undefined
  ): Promise<boolean> {
    if (input.file !== undefined || (input.removeFile === true && current.filePath !== null)) {
      return true;
    }
    if (
      input.netAmount !== undefined &&
      toScaled(input.netAmount, 2) !== toScaled(current.netAmount, 2)
    ) {
      return true;
    }
    if (correctedLineItems === undefined) {
      return false;
    }
    const beforeLines = await tx.receivedQuotationLineItem.findMany({
      where: { receivedQuotationId: current.id },
      orderBy: { sortOrder: 'asc' },
    });
    const afterLines = correctedLineItems
      .map((item) => this.toLineItemRow(item))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (beforeLines.length !== afterLines.length) {
      return true;
    }
    return beforeLines.some(
      (line, index) => this.lineItemSignature(line) !== this.lineItemSignature(afterLines[index]!)
    );
  }

  /**
   * 監査ログに前後を入れる台帳の項目（D10。46.11）。工事価格・確定金額は入れない
   */
  private ledgerAuditFields(quotation: {
    vendorName: string;
    quoteNumber: string | null;
    overallConditions: string | null;
    siteLocation: string | null;
    constructionKind: string | null;
    useType: string | null;
    workConditions: string | null;
    distanceKm: unknown;
    adoption: string;
    readingStatus: string;
    quoteDiscriminator: string;
  }): Record<string, string | number | null> {
    return {
      vendorName: quotation.vendorName,
      quoteNumber: quotation.quoteNumber,
      overallConditions: quotation.overallConditions,
      siteLocation: quotation.siteLocation,
      constructionKind: quotation.constructionKind,
      useType: quotation.useType,
      workConditions: quotation.workConditions,
      distanceKm: toNumberOrNull(quotation.distanceKm),
      adoption: quotation.adoption,
      readingStatus: quotation.readingStatus,
      quoteDiscriminator: quotation.quoteDiscriminator,
    };
  }

  /**
   * 明細行の合計金額を算出する
   *
   * Requirements: 11.13 - 全明細行の金額合計を自動計算。区分が別途の行は除く（45.5。タスク113.3）
   * Task 21.1: 合計金額算出
   *
   * @param lineItems - 明細行情報配列
   * @returns 合計金額（明細行が0件、または金額を持つ別途以外の行が無い場合はnull）
   */
  private calculateTotalAmount(lineItems: LineItemInfo[]): number | null {
    if (lineItems.length === 0) {
      return null;
    }

    let total = 0;
    let hasAmount = false;
    for (const item of lineItems) {
      if (item.category === 'EXCLUDED') {
        continue;
      }
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

    const project = await tx.project.findUnique({
      where: { id: context.projectId },
      select: { id: true, deletedAt: true },
    });
    if (!project || project.deletedAt !== null) {
      throw new ProjectNotFoundError(context.projectId);
    }
    const vendor = await this.resolveVendor(tx, input.vendorName, input.tradingPartnerId);
    return {
      estimateRequestId: null,
      projectId: project.id,
      ...vendor,
    };
  }

  /**
   * 案件の文脈の業者名と取引先の紐づけを決める（D4。タスク113.2）
   *
   * - 取引先の ID があれば、その取引先が論理削除されていない協力業者のときに紐づけ、業者名に取引先の名前を
   *   入れる（44.5）。無い・論理削除済み・協力業者でないときは ValidationError で拒み、名前の照合へ切り替えない
   *   （利用者が選んだ取引先と違う取引先へ黙って紐づけない）
   * - 取引先の ID が無ければ、前後の空白を除いた業者名と `name` が完全に一致する論理削除されていない協力業者が
   *   ちょうど 1 件のときに紐づけ、0 件・複数なら業者名だけを保持する（44.6・44.7）
   *
   * 取引先の変更・削除の側から業者名を書き換える処理は持たない（44.8）
   */
  private async resolveVendor(
    tx: PrismaTransactionClient,
    vendorNameInput: string | undefined,
    tradingPartnerId: string | null | undefined
  ): Promise<{ vendorName: string; tradingPartnerId: string | null }> {
    if (tradingPartnerId !== undefined && tradingPartnerId !== null) {
      const partner = await tx.tradingPartner.findUnique({
        where: { id: tradingPartnerId },
        select: { id: true, name: true, deletedAt: true, types: { select: { type: true } } },
      });
      const isLiveSubcontractor =
        partner !== null &&
        partner.deletedAt === null &&
        partner.types.some((t) => t.type === 'SUBCONTRACTOR');
      if (!isLiveSubcontractor) {
        throw new ValidationError(
          RECEIVED_QUOTATION_VALIDATION_MESSAGES.TRADING_PARTNER_NOT_SUBCONTRACTOR
        );
      }
      return { vendorName: partner.name, tradingPartnerId: partner.id };
    }

    const vendorName = vendorNameInput?.trim() ?? '';
    if (vendorName.length === 0) {
      throw new ValidationError(RECEIVED_QUOTATION_VALIDATION_MESSAGES.VENDOR_NAME_REQUIRED);
    }
    const matches = await tx.tradingPartner.findMany({
      where: { name: vendorName, deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
      select: { id: true },
      take: 2,
    });
    return {
      vendorName,
      tradingPartnerId: matches.length === 1 ? matches[0]!.id : null,
    };
  }

  /**
   * 更新で業者名と取引先の紐づけを決め直すか判定し、決め直す値を返す（D4。タスク113.2）
   *
   * 見積依頼に紐づく受領見積書は宛先の写しを保ち、入力を無視する（44.3）。案件の文脈では、業者名も取引先の
   * ID も送られないとき、または今と同じ取引先・同じ業者名を送り直したときは変えない（送り直しで取引先の今の
   * 名前へ書き換えない。44.8）。それ以外は作成と同じ規則で決める
   *
   * @returns 書き換える値。変えないときは null
   */
  private async resolveVendorForUpdate(
    tx: PrismaTransactionClient,
    current: {
      estimateRequestId: string | null;
      vendorName: string;
      tradingPartnerId: string | null;
    },
    input: UpdateReceivedQuotationInput
  ): Promise<{ vendorName: string; tradingPartnerId: string | null } | null> {
    if (current.estimateRequestId !== null) {
      return null;
    }
    if (input.vendorName === undefined && input.tradingPartnerId === undefined) {
      return null;
    }
    const sameName =
      input.vendorName === undefined || input.vendorName.trim() === current.vendorName;
    const samePartner =
      input.tradingPartnerId === undefined ||
      (input.tradingPartnerId !== null && input.tradingPartnerId === current.tradingPartnerId);
    if (sameName && samePartner) {
      return null;
    }
    const partnerChoice =
      input.tradingPartnerId !== undefined && input.tradingPartnerId !== current.tradingPartnerId
        ? input.tradingPartnerId
        : null;
    return this.resolveVendor(tx, input.vendorName ?? current.vendorName, partnerChoice);
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
   * @returns 作成された受領見積書情報（明細行・合計金額を含む）と、同じ原本で区別の違う他の受領見積書の数
   * @throws DuplicateOriginalError 同じ案件に原本の指紋と見積の区別が同じ受領見積書がある場合（48.3）
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
  ): Promise<SaveResult> {
    // 1. ファイルのバリデーション
    if (input.file) {
      this.validateFileType(input.file);
      this.validateFileSize(input.file);
    }

    // 2. ファイルまたは明細行の必須チェック (Requirements: 11.22, 11.24)
    this.validateFileOrLineItemsRequired(!!input.file, input.lineItems);

    // 3. 明細行の金額検証・補正 (Requirements: 11.12)。送られた金額は保持する（45.12）
    const correctedLineItems = input.lineItems
      ? this.validateAndCorrectAmounts(input.lineItems)
      : undefined;
    const lineRows = (correctedLineItems ?? []).map((item) => this.toLineItemRow(item));

    // 原本の指紋（48.1）。ファイルの内容から求め、送り手の申告値は使わない
    const fileSha256 = input.file ? this.computeFileSha256(input.file) : null;
    const quoteDiscriminator = input.quoteDiscriminator ?? '';

    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 4. 文脈の解決（タスク113.1）: 見積依頼・案件・業者名・取引先を決める
      const owner = await this.resolveContext(tx, context, input);

      // 4.5 同じ案件の二重登録の判定（D6。タスク113.4）。レコードの作成とファイルの送信より前に置き、
      // 拒むときは DB にもストレージにも何も残さない（48.3）。ファイルの無いものは判定しない（48.6）
      const sharedOriginalCount =
        fileSha256 !== null
          ? await this.checkDuplicateOriginal(tx, {
              projectId: owner.projectId,
              fileSha256,
              quoteDiscriminator,
              excludeId: null,
            })
          : 0;

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
          fileSha256,
          netAmount: input.netAmount ?? null,
          // 台帳の項目（タスク113.3）。見積の区別は送られなければ空（48.2）
          ...this.pickLedgerColumns(input),
          quoteDiscriminator,
          // 読取の確認（D9）。作成は保存前を未確認とみる
          ...this.decideReadingConfirmation(null, input.readingStatus, false, actorId),
        },
        include: {
          lineItems: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      // 6. 明細行データの一括保存 (Requirements: 14.2)
      // Task 61.2: netAmountは受領見積書レベルに移動したため、明細行には含めない
      if (lineRows.length > 0) {
        await tx.receivedQuotationLineItem.createMany({
          data: lineRows.map((row) => ({ receivedQuotationId: quotation.id, ...row })),
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
            ...this.ledgerAuditFields(quotation),
          },
        },
        tx
      );

      // 7. ファイルをアップロードしてパスを更新
      // 格納先の書き込みで更新日時が進むため、応答にはその後の値を返す（続けての編集が楽観的排他で
      // 競合しないように。タスク114.1）
      let filePath: string | null = null;
      let updatedAt = quotation.updatedAt;
      if (input.file) {
        filePath = await this.uploadFile(owner, quotation.id, input.file);

        const withFilePath = await tx.receivedQuotation.update({
          where: { id: quotation.id },
          data: { filePath },
        });
        updatedAt = withFilePath.updatedAt;
      }

      // 8. 明細行を含む完全なレコードを返却
      const lineItemInfos: LineItemInfo[] = (quotation.lineItems || []).map((li) =>
        this.toLineItemInfo(li)
      );

      // createMany後の明細行を取得するために再取得は不要（correctedLineItemsから構築）
      // Task 61.2: netAmountは明細行から除外（受領見積書レベルに移動）
      const resultLineItems: LineItemInfo[] =
        lineRows.length > 0
          ? lineRows.map((row, index) =>
              this.toLineItemInfo({
                id: `temp-${index}`, // IDはDB生成値だがcreateManyでは取得不可
                receivedQuotationId: quotation.id,
                ...row,
              })
            )
          : lineItemInfos;

      return {
        quotation: this.toReceivedQuotationInfoWithLineItems(
          { ...quotation, filePath: filePath ?? quotation.filePath, updatedAt },
          resultLineItems
        ),
        sharedOriginalCount,
      };
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
   * @returns 更新された受領見積書情報と、同じ原本で区別の違う他の受領見積書の数
   * @throws ReceivedQuotationNotFoundError 受領見積書が存在しない場合
   * @throws ReceivedQuotationConflictError 楽観的排他制御エラー
   * @throws DuplicateOriginalError ファイルの差し替え・見積の区別の変更で同じ案件に同じ組ができる場合（48.5）
   */
  async update(
    id: string,
    input: UpdateReceivedQuotationInput,
    expectedUpdatedAt: Date,
    actorId: string
  ): Promise<SaveResult> {
    // ファイルのバリデーション
    if (input.file) {
      this.validateFileType(input.file);
      this.validateFileSize(input.file);
    }

    // 明細行の金額検証・補正
    const correctedLineItems = input.lineItems
      ? this.validateAndCorrectAmounts(input.lineItems)
      : undefined;

    // 差し替えるファイルの原本の指紋（48.1・48.5）。ファイルを外す要求が優先する
    const newFileSha256 =
      input.file && !input.removeFile ? this.computeFileSha256(input.file) : null;

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
      // 台帳の項目は送られた欄だけを書き換える（タスク113.3）
      const updateData: Prisma.ReceivedQuotationUncheckedUpdateInput = {
        ...this.pickLedgerColumns(input),
      };

      if (input.name !== undefined) {
        updateData.name = input.name.trim();
      }
      if (input.submittedAt !== undefined) {
        updateData.submittedAt = input.submittedAt;
      }
      if (input.netAmount !== undefined) {
        updateData.netAmount = input.netAmount;
      }

      // 業者名と取引先の紐づけ（D4。タスク113.2）。ファイルを送る前に決め、拒むときは何も変えない
      const vendor = await this.resolveVendorForUpdate(tx, quotation, input);
      if (vendor !== null) {
        updateData.vendorName = vendor.vendorName;
        updateData.tradingPartnerId = vendor.tradingPartnerId;
      }

      // 読取の確認（D9）。保存前が確認済みのときだけ、明細行・NET 金額・ファイルの変化を判定する
      const contentChanged =
        quotation.readingStatus === 'CONFIRMED' &&
        (await this.hasReadContentChanged(tx, quotation, input, correctedLineItems));
      Object.assign(
        updateData,
        this.decideReadingConfirmation(
          quotation.readingStatus,
          input.readingStatus,
          contentChanged,
          actorId
        )
      );

      // 3.5 同じ案件の二重登録の判定（D6。タスク113.4）。ファイルを送る前に置き、拒むときは何も変えない。
      // 保存後の指紋と見積の区別で、ファイルを持つ受領見積書の更新のたびに判定する（48.3・48.5）。ファイルの
      // 無いもの・ファイルを外す更新は判定しない（48.6）
      const savedFileSha256 = input.removeFile ? null : (newFileSha256 ?? quotation.fileSha256);
      const savedDiscriminator = input.quoteDiscriminator ?? quotation.quoteDiscriminator;
      const sharedOriginalCount =
        savedFileSha256 !== null
          ? await this.checkDuplicateOriginal(tx, {
              projectId: quotation.projectId,
              fileSha256: savedFileSha256,
              quoteDiscriminator: savedDiscriminator,
              excludeId: id,
            })
          : 0;

      // 4. ファイル更新処理
      const oldFilePath = quotation.filePath;
      let newFilePath: string | null = null;

      if (input.removeFile) {
        // ファイル削除要求
        updateData.filePath = null;
        updateData.fileName = null;
        updateData.fileMimeType = null;
        updateData.fileSize = null;
        updateData.fileSha256 = null;
      } else if (input.file) {
        // 新しいファイルのアップロード（格納先は文脈で決まる。D3）
        newFilePath = await this.uploadFile(owner, id, input.file);
        updateData.filePath = newFilePath;
        updateData.fileName = input.file.originalName;
        updateData.fileMimeType = input.file.mimeType;
        updateData.fileSize = input.file.size;
        updateData.fileSha256 = newFileSha256;
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
              ...this.toLineItemRow(item),
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
            ...this.ledgerAuditFields(quotation),
          },
          after: {
            name: updatedQuotation.name,
            submittedAt: updatedQuotation.submittedAt.toISOString(),
            fileName: updatedQuotation.fileName,
            ...this.ledgerAuditFields(updatedQuotation),
            // 工事価格・確定金額は値を入れず変更の有無だけ（46.11）
            constructionPriceChanged:
              toScaled(quotation.constructionPrice, 0) !==
              toScaled(updatedQuotation.constructionPrice, 0),
            confirmedAmountChanged:
              toScaled(quotation.confirmedAmount, 0) !==
              toScaled(updatedQuotation.confirmedAmount, 0),
          },
        },
        tx
      );

      // 7. 旧ファイルの削除（新しいファイルがアップロードされた場合またはファイル削除要求）
      if (oldFilePath && (newFilePath || input.removeFile)) {
        await this.deleteFile(oldFilePath);
      }

      const lineItemInfos = (updatedQuotation.lineItems || []).map((li) => this.toLineItemInfo(li));
      return {
        quotation: this.toReceivedQuotationInfoWithLineItems(updatedQuotation, lineItemInfos),
        sharedOriginalCount,
      };
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
            ...this.ledgerAuditFields(quotation),
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
      expiresIn: RECEIVED_QUOTATION_SIGNED_URL_EXPIRES_IN,
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
    category: LineItemCategory;
    condition: string | null;
    conversionQuantity: unknown;
    conversionUnit: string | null;
    conversionUnitPrice: unknown;
    conversionBasis: string | null;
    classificationKey: string | null;
    quantityRowKey: string | null;
    isReference: boolean;
    referenceReason: string | null;
  }): LineItemInfo {
    const conversionQuantity = toNumberOrNull(lineItem.conversionQuantity);
    const conversionUnitPrice = toNumberOrNull(lineItem.conversionUnitPrice);
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
      category: lineItem.category,
      condition: lineItem.condition,
      // 換算の 4 列は全部あるか全部無い（45.9）。全部あるときだけ換算の形にまとめる
      conversion:
        conversionQuantity !== null &&
        lineItem.conversionUnit !== null &&
        conversionUnitPrice !== null &&
        lineItem.conversionBasis !== null
          ? {
              quantity: conversionQuantity,
              unit: lineItem.conversionUnit,
              unitPrice: conversionUnitPrice,
              basis: lineItem.conversionBasis,
            }
          : null,
      classificationKey: lineItem.classificationKey,
      quantityRowKey: lineItem.quantityRowKey,
      isReference: lineItem.isReference,
      referenceReason: lineItem.referenceReason,
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
      vendorName: string;
      tradingPartnerId: string | null;
      quoteNumber: string | null;
      overallConditions: string | null;
      siteLocation: string | null;
      constructionKind: 'RENOVATION' | 'NEW_CONSTRUCTION' | null;
      useType: string | null;
      constructionPrice: unknown;
      workConditions: string | null;
      distanceKm: unknown;
      adoption: 'ADOPTED' | 'REJECTED' | 'UNKNOWN';
      confirmedAmount: unknown;
      readingStatus: ReadingStatus;
      readingConfirmedById: string | null;
      readingConfirmedAt: Date | null;
      quoteDiscriminator: string;
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
      vendorName: quotation.vendorName,
      tradingPartnerId: quotation.tradingPartnerId,
      quoteNumber: quotation.quoteNumber,
      overallConditions: quotation.overallConditions,
      siteLocation: quotation.siteLocation,
      constructionKind: quotation.constructionKind,
      useType: quotation.useType,
      constructionPrice: toNumberOrNull(quotation.constructionPrice),
      workConditions: quotation.workConditions,
      distanceKm: toNumberOrNull(quotation.distanceKm),
      adoption: quotation.adoption,
      confirmedAmount: toNumberOrNull(quotation.confirmedAmount),
      readingStatus: quotation.readingStatus,
      readingConfirmedById: quotation.readingConfirmedById,
      readingConfirmedAt: quotation.readingConfirmedAt,
      quoteDiscriminator: quotation.quoteDiscriminator,
      lineItems,
      totalAmount: this.calculateTotalAmount(lineItems),
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }
}
