/**
 * @fileoverview 見積カードの取り込み（unit-price-ledger タスク2.4、design.md の LedgerImportService）
 *
 * 読み取ったカード（LedgerCardParser の結果）を 1 枚ずつ、案件も見積依頼も無い受領見積書として登録し、
 * 取り込みの結果をまとめて返す。
 *
 * - 1 枚のカードごとに 1 つのトランザクションで、受領見積書・明細行・監査ログ（`RECEIVED_QUOTATION_CREATED`、
 *   metadata の source は `ledger_import`）を書く。途中で失敗したカード（DB の桁を超える値など）は何も残さず、
 *   そのカードだけの失敗として結果に入れ、次のカードへ進む（2.3・2.16）
 * - 取引先は、前後の空白を除いた業者名と名前が完全に一致する、論理削除されていない協力業者が 1 件のときだけ
 *   紐づける。0 件・2 件以上なら業者名だけを保持する（2.10・2.11。受領見積書の案件の文脈の照合と同じ規則）
 * - 読取の確認が「済」なら確認済み・確認者は実行者・日時はカードの読取の日時（無ければ取り込みの日時）、
 *   そうでなければ未確認（2.12・2.13）
 * - 論理削除されていない受領見積書が既に持つカードの ID は飛ばし、既にある内容を変えない。同時の取り込みで
 *   カードの ID の一意の部分索引に違反したとき（P2002）も、取り込み済みとして飛ばす（2.14）
 * - 参考の印の有無では取り込みを止めない（3.6）
 * - 監査ログには、協力業者の金額（工事価格・確定金額・明細行の中身）と原本のパスを入れない
 * - 取り込みの件数（登録・飛ばし・失敗）をログに残す。カードの中身（ID・業者・行など）はログに出さない
 *
 * Requirements (unit-price-ledger): 2.1, 2.3, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 3.6
 *
 * @module services/unit-price-ledger/ledger-import.service
 */

import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import {
  RECEIVED_QUOTATION_TARGET_TYPE,
  type IAuditLogService,
  type ReceivedQuotationAuditMetadata,
} from '../../types/audit-log.types.js';
import logger from '../../utils/logger.js';
import {
  parseUpload,
  type LedgerCardParseOutcome,
  type LedgerLineItemInput,
  type LedgerQuotationInput,
  type LedgerUploadFile,
} from './ledger-card-parser.js';

/**
 * 取り込みの結果（design.md の LedgerImportResult。2.15）
 *
 * - `importedCount`：登録したカードの数
 * - `skipped`：取り込み済みのため飛ばしたカードの ID
 * - `failed`：登録できなかったファイル（zip の中は項目）の名前と理由
 * - `truncated`：登録したカードのうち、文字数の上限で切り詰めた欄（2.9）
 * - `referenceMarkedCount`：登録したカードのうち、参考の印を付けたカードの数
 */
export interface LedgerImportResult {
  importedCount: number;
  skipped: Array<{ cardId: string }>;
  failed: Array<{ fileName: string; reason: string }>;
  truncated: Array<{ cardId: string; fields: string[] }>;
  referenceMarkedCount: number;
}

/**
 * 取り込みのサービスの依存
 */
export interface LedgerImportServiceDependencies {
  prisma: PrismaClient;
  /** 監査ログの記録（カードの登録と同じトランザクションで書く） */
  auditLogService: IAuditLogService;
}

/** 登録の失敗の理由の文言（カードの中身を入れない） */
export const LEDGER_IMPORT_FAILURE_REASONS = {
  REGISTRATION_FAILED:
    '受領見積書として登録できませんでした（数量・単価・金額などの値が保存できる桁を超えている可能性があります）',
} as const;

/** 監査ログの metadata（単価台帳の取り込み） */
const IMPORT_AUDIT_METADATA: ReceivedQuotationAuditMetadata = { source: 'ledger_import' };

type ParsedOutcome = Extract<LedgerCardParseOutcome, { kind: 'parsed' }>;

/** 1 枚のカードの登録の結果 */
type CardRegistration = { kind: 'imported' } | { kind: 'skipped' };

/** 一意の制約の違反（P2002）か */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * DB へつながらない・初期化できないなど、カードの中身に依らない誤り。
 * カードの失敗にすると全件が桁の誤りのように見えるため、取り込みの要求ごと失敗させる
 */
const isInfrastructureError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientInitializationError ||
  error instanceof Prisma.PrismaClientRustPanicError ||
  (error instanceof Prisma.PrismaClientKnownRequestError && error.code.startsWith('P1'));

/** ログに出す誤りの種類（誤りの文言はカードの値を含みうるため出さない） */
const describeErrorForLog = (error: unknown): { errorName: string; errorCode: string | null } => ({
  errorName: error instanceof Error ? error.name : typeof error,
  errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null,
});

/** 明細行の入力を DB の列にする（換算は 4 列に分ける） */
const toLineItemRow = (receivedQuotationId: string, item: LedgerLineItemInput) => ({
  receivedQuotationId,
  sortOrder: item.sortOrder,
  name: item.name,
  specification: item.specification,
  unit: item.unit,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  amount: item.amount,
  remarks: item.remarks,
  category: item.category,
  condition: item.condition,
  conversionQuantity: item.conversion?.quantity ?? null,
  conversionUnit: item.conversion?.unit ?? null,
  conversionUnitPrice: item.conversion?.unitPrice ?? null,
  conversionBasis: item.conversion?.basis ?? null,
  isReference: item.isReference,
  referenceReason: item.referenceReason,
});

/**
 * 見積カードの取り込みのサービス
 */
export class LedgerImportService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;

  constructor(deps: LedgerImportServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
  }

  /**
   * アップロードされたファイルのカードを 1 枚ずつ登録し、取り込みの結果を返す
   *
   * @param files - アップロードされたファイル（zip または見積カードの JSON）
   * @param actorId - 取り込みを実行したシステム管理者（監査ログの実行者・読取の確認者）
   * @throws LedgerImportTooLargeError 取り込みの上限を超えたとき（何も登録しない）
   */
  async importCards(
    files: ReadonlyArray<LedgerUploadFile>,
    actorId: string
  ): Promise<LedgerImportResult> {
    const outcomes = parseUpload(files);
    const importedAt = new Date();
    const result: LedgerImportResult = {
      importedCount: 0,
      skipped: [],
      failed: [],
      truncated: [],
      referenceMarkedCount: 0,
    };

    for (const outcome of outcomes) {
      if (outcome.kind === 'failed') {
        result.failed.push({ fileName: outcome.fileName, reason: outcome.reason });
        continue;
      }
      const registration = await this.registerCardSafely(outcome, actorId, importedAt);
      if (registration === 'failed') {
        result.failed.push({
          fileName: outcome.fileName,
          reason: LEDGER_IMPORT_FAILURE_REASONS.REGISTRATION_FAILED,
        });
        continue;
      }
      if (registration.kind === 'skipped') {
        result.skipped.push({ cardId: outcome.cardId });
        continue;
      }
      result.importedCount += 1;
      if (outcome.truncatedFields.length > 0) {
        result.truncated.push({ cardId: outcome.cardId, fields: [...outcome.truncatedFields] });
      }
      if (outcome.referenceReasons.length > 0) {
        result.referenceMarkedCount += 1;
      }
    }

    logger.info(
      {
        importedCount: result.importedCount,
        skippedCount: result.skipped.length,
        failedCount: result.failed.length,
        truncatedCount: result.truncated.length,
        referenceMarkedCount: result.referenceMarkedCount,
      },
      '単価台帳の見積カードの取り込みを終えました'
    );
    return result;
  }

  /**
   * 1 枚のカードを登録する。一意の索引の違反は取り込み済みとし、ほかの誤りはそのカードだけの失敗とする
   */
  private async registerCardSafely(
    outcome: ParsedOutcome,
    actorId: string,
    importedAt: Date
  ): Promise<CardRegistration | 'failed'> {
    try {
      return await this.registerCard(outcome.input, actorId, importedAt);
    } catch (error) {
      if (isInfrastructureError(error)) throw error;
      if (isUniqueViolation(error) && (await this.hasLiveCard(outcome.cardId))) {
        return { kind: 'skipped' };
      }
      logger.warn(describeErrorForLog(error), '単価台帳の見積カードを 1 枚登録できませんでした');
      return 'failed';
    }
  }

  /** 論理削除されていない受領見積書がカードの ID を持つか */
  private async hasLiveCard(
    ledgerCardId: string,
    client: Pick<Prisma.TransactionClient, 'receivedQuotation'> = this.prisma
  ): Promise<boolean> {
    const existing = await client.receivedQuotation.findFirst({
      where: { ledgerCardId, deletedAt: null },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * 1 つのトランザクションで、受領見積書・明細行・監査ログを書く（2.16）
   */
  private async registerCard(
    input: LedgerQuotationInput,
    actorId: string,
    importedAt: Date
  ): Promise<CardRegistration> {
    return await this.prisma.$transaction(async (tx) => {
      if (await this.hasLiveCard(input.ledgerCardId, tx)) {
        return { kind: 'skipped' };
      }

      const tradingPartnerId = await this.matchTradingPartner(tx, input.vendorName);
      const reading = input.readingConfirmed.confirmed
        ? {
            readingStatus: 'CONFIRMED' as const,
            readingConfirmedById: actorId,
            readingConfirmedAt: input.readingConfirmed.readAt ?? importedAt,
          }
        : {
            readingStatus: 'UNCONFIRMED' as const,
            readingConfirmedById: null,
            readingConfirmedAt: null,
          };
      const fields = input.ledgerFields;

      const quotation = await tx.receivedQuotation.create({
        data: {
          estimateRequestId: null,
          projectId: null,
          vendorName: input.vendorName,
          tradingPartnerId,
          name: input.name,
          submittedAt: input.submittedAt,
          quoteNumber: fields.quoteNumber,
          overallConditions: fields.overallConditions,
          siteLocation: fields.siteLocation,
          constructionKind: fields.constructionKind,
          useType: fields.useType,
          constructionPrice: fields.constructionPrice,
          workConditions: fields.workConditions,
          distanceKm: fields.distanceKm,
          adoption: fields.adoption,
          confirmedAmount: fields.confirmedAmount,
          ...reading,
          ledgerCardId: input.ledgerCardId,
          ledgerSourcePath: input.ledgerSourcePath,
          ledgerProjectName: input.ledgerProjectName,
        },
      });

      if (input.lineItems.length > 0) {
        await tx.receivedQuotationLineItem.createMany({
          data: input.lineItems.map((item) => toLineItemRow(quotation.id, item)),
        });
      }

      // 協力業者の金額（工事価格・確定金額・明細行の中身）と原本のパスは社外秘のため入れない
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
            lineItemCount: input.lineItems.length,
            vendorName: quotation.vendorName,
            quoteNumber: quotation.quoteNumber,
            overallConditions: quotation.overallConditions,
            siteLocation: quotation.siteLocation,
            constructionKind: quotation.constructionKind,
            useType: quotation.useType,
            workConditions: quotation.workConditions,
            distanceKm: quotation.distanceKm === null ? null : quotation.distanceKm.toNumber(),
            adoption: quotation.adoption,
            readingStatus: quotation.readingStatus,
            quoteDiscriminator: quotation.quoteDiscriminator,
            ledgerCardId: quotation.ledgerCardId,
            ledgerProjectName: quotation.ledgerProjectName,
          },
          metadata: IMPORT_AUDIT_METADATA,
        },
        tx
      );

      return { kind: 'imported' };
    });
  }

  /**
   * 業者名と名前が完全に一致する、論理削除されていない協力業者の取引先が 1 件だけなら、その ID を返す
   * （2.10・2.11。受領見積書の案件の文脈の照合と同じ規則）
   */
  private async matchTradingPartner(
    tx: Prisma.TransactionClient,
    vendorName: string
  ): Promise<string | null> {
    const name = vendorName.trim();
    if (name.length === 0) {
      return null;
    }
    const matches = await tx.tradingPartner.findMany({
      where: { name, deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
      select: { id: true },
      take: 2,
    });
    return matches.length === 1 ? matches[0]!.id : null;
  }
}
