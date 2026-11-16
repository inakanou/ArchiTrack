/**
 * @fileoverview 台帳の画面からの修正と削除（unit-price-ledger タスク2.6、design.md の LedgerEditService）
 *
 * 案件の無い受領見積書（取り込んだ見積カードなど）の全体の修正と論理削除を、受領見積書の監査ログの決まりで
 * 記録する。案件の受領見積書の印の更新（5.2）は、このサービスに別の操作として足す（タスク2.7）。
 *
 * - 見積の有無は台帳の対象（`LEDGER_BASE_WHERE`：論理削除されていない受領見積書で、見積依頼があれば
 *   生きているもの）で決め、無ければ `ReceivedQuotationNotFoundError`（404）とする
 * - 案件の受領見積書の全体の修正と削除は `LedgerProjectQuotationReadOnlyError`（409）で拒む（5.2・5.5）
 * - 修正（5.1）：業者名・見積日・見積の情報・案件名・原本のパスと明細行の全体。送らない見積の情報・案件名・
 *   原本のパスは変えず、null は消す。業者名・取引先は受領見積書の案件の文脈と同じ規則で決め直す（44.5〜44.8）。
 *   明細行は全量を置き換え、金額が無く数量と単価がある行だけ数量×単価を求める（45.12）
 * - 読取の確認（5.4・46.6〜46.8）：保存前が確認済みで明細行が変わるときは未確認に戻し、確認者と日時を消す。
 *   未確認から確認済みにしたときは確認者を操作した利用者、日時を今とする
 * - 楽観的排他制御（5.6）：更新の日時の一致で判定する。読んだ時の比較に加え、本体の書き込みを
 *   「ID と更新の日時が一致する行」への条件付きの更新にし、同時の保存でも 1 つだけを通す。不一致は
 *   `LedgerConflictError`（409 `LEDGER_CONFLICT`）
 * - 監査ログ（5.7・14.7・46.11）：`RECEIVED_QUOTATION_UPDATED` / `RECEIVED_QUOTATION_DELETED` を変更と同じ
 *   トランザクションで書き、metadata の source は `unit_price_ledger`。協力業者の金額（工事価格・確定金額・
 *   明細行の中身）と原本のパスは入れず、工事価格・確定金額は変わったかどうかだけを入れる
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7
 *
 * @module services/unit-price-ledger/ledger-edit.service
 */

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  RECEIVED_QUOTATION_TARGET_TYPE,
  type IAuditLogService,
  type ReceivedQuotationAuditMetadata,
} from '../../types/audit-log.types.js';
import { ReceivedQuotationNotFoundError } from '../../errors/receivedQuotationError.js';
import { ValidationError } from '../../errors/apiError.js';
import {
  LedgerConflictError,
  LedgerProjectQuotationReadOnlyError,
} from '../../errors/unitPriceLedgerError.js';
import {
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  type LineItemInput,
} from '../../schemas/received-quotation.schema.js';
import type { LedgerQuotationUpdateInput } from '../../schemas/unit-price-ledger.schema.js';
import type { ReadingStatus } from '../received-quotation.service.js';
import {
  LEDGER_BASE_WHERE,
  LedgerQueryService,
  type LedgerQuotationDetail,
} from './ledger-query.service.js';

/**
 * 台帳の修正・削除のサービスの依存
 */
export interface LedgerEditServiceDependencies {
  prisma: PrismaClient;
  /** 監査ログの記録（変更と同じトランザクションで書く） */
  auditLogService: IAuditLogService;
}

/** 監査ログの metadata（単価台帳の画面での修正・削除） */
const EDIT_AUDIT_METADATA: ReceivedQuotationAuditMetadata = { source: 'unit_price_ledger' };

/** 入力のとおりに保存する見積の情報（送られた欄だけ。読取の確認は 46.8 で決めるため含めない） */
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
  'ledgerProjectName',
  'ledgerSourcePath',
] as const satisfies ReadonlyArray<keyof LedgerQuotationUpdateInput>;

/** 金額・数量の列の小数の桁（DB の Decimal の scale）。明細行の比較の前に揃える */
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

/** Decimal・数・null を数にする（記録用） */
const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** 明細行の保存の形（DB の列） */
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
  category: LineItemInput['category'];
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

/**
 * 明細行の入力を保存の形にする。金額が無く数量と単価が両方あるときだけ、数量×単価を求める
 * （受領見積書の保存と同じ `Math.round`。45.12）。換算は 4 列に分ける
 */
const toLineItemRow = (item: LineItemInput): LineItemRow => {
  const quantity = item.quantity ?? null;
  const unitPrice = item.unitPrice ?? null;
  const amount =
    item.amount ??
    (quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice) : null);
  return {
    sortOrder: item.sortOrder,
    customCategory: item.customCategory ?? null,
    workType: item.workType ?? null,
    name: item.name,
    specification: item.specification ?? null,
    unit: item.unit ?? null,
    quantity,
    unitPrice,
    amount,
    remarks: item.remarks ?? null,
    category: item.category,
    condition: item.condition ?? null,
    conversionQuantity: item.conversion?.quantity ?? null,
    conversionUnit: item.conversion?.unit ?? null,
    conversionUnitPrice: item.conversion?.unitPrice ?? null,
    conversionBasis: item.conversion?.basis ?? null,
    classificationKey: item.classificationKey ?? null,
    quantityRowKey: item.quantityRowKey ?? null,
    isReference: item.isReference,
    referenceReason: item.referenceReason ?? null,
  };
};

/** 明細行の比較の鍵（全列。金額・数量は DB の小数の桁で揃える。46.8 の「明細行の変更」の判定） */
const lineItemSignature = (row: Record<keyof LineItemRow, unknown>): string =>
  JSON.stringify([
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

/** 受領見積書の行のうち、監査ログと判定に使う欄 */
interface QuotationAuditSource {
  estimateRequestId: string | null;
  name: string;
  submittedAt: Date;
  fileName: string | null;
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
  ledgerCardId: string | null;
  ledgerProjectName: string | null;
}

/**
 * 監査ログに前後を入れる欄（受領見積書の監査と同じ欄に、台帳のカードの ID と案件名を足す）。
 * 工事価格・確定金額・明細行の中身・原本のパスは入れない（14.7・46.11）
 */
const auditFields = (
  quotation: QuotationAuditSource,
  lineItemCount: number
): Record<string, string | number | null> => ({
  estimateRequestId: quotation.estimateRequestId,
  name: quotation.name,
  submittedAt: quotation.submittedAt.toISOString(),
  fileName: quotation.fileName,
  lineItemCount,
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
  ledgerCardId: quotation.ledgerCardId,
  ledgerProjectName: quotation.ledgerProjectName,
});

/**
 * 読取の確認の遷移を決める（受領見積書の保存と同じ規則。46.6〜46.8）
 *
 * 1. 保存前が確認済みで明細行が変わる → 未確認に戻し、確認者と日時を消す（確認済みを送っていても戻す）
 * 2. 確認済みを送り、保存前が未確認 → 確認済み、確認者は操作した利用者、日時は今（5.4）
 * 3. それ以外は入力のとおり（未確認を送れば確認者と日時を消す。確認済みを送り直しても確認者と日時は保つ。
 *    送らなければ変えない）
 */
const decideReadingConfirmation = (
  previousStatus: ReadingStatus,
  requested: ReadingStatus | undefined,
  lineItemsChanged: boolean,
  actorId: string
): Pick<
  Prisma.ReceivedQuotationUncheckedUpdateManyInput,
  'readingStatus' | 'readingConfirmedById' | 'readingConfirmedAt'
> => {
  const unconfirmed = {
    readingStatus: 'UNCONFIRMED' as const,
    readingConfirmedById: null,
    readingConfirmedAt: null,
  };
  if (previousStatus === 'CONFIRMED' && lineItemsChanged) {
    return unconfirmed;
  }
  if (requested === 'CONFIRMED') {
    return previousStatus === 'CONFIRMED'
      ? {}
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
};

/**
 * 台帳の画面からの修正・削除のサービス
 */
export class LedgerEditService {
  private readonly prisma: PrismaClient;
  private readonly auditLogService: IAuditLogService;
  private readonly queryService: LedgerQueryService;

  constructor(deps: LedgerEditServiceDependencies) {
    this.prisma = deps.prisma;
    this.auditLogService = deps.auditLogService;
    this.queryService = new LedgerQueryService({ prisma: deps.prisma });
  }

  /**
   * 案件の無い受領見積書の全体を修正する（5.1・5.3・5.4・5.6・5.7）
   *
   * @param id - 受領見積書の ID
   * @param input - 修正の本文（`ledgerQuotationUpdateSchema` の出力。expectedUpdatedAt を含む）
   * @param actorId - 操作した利用者（監査ログの実行者・読取の確認者）
   * @returns 保存後の台帳の詳細
   * @throws ReceivedQuotationNotFoundError 台帳の見積として無い（存在しない・論理削除済み・見積依頼が論理削除済み）
   * @throws LedgerProjectQuotationReadOnlyError 案件の受領見積書のとき
   * @throws LedgerConflictError 開いた後にほかの利用者が更新していたとき
   * @throws ValidationError 選んだ取引先が論理削除されていない協力業者でないとき
   */
  async updateQuotation(
    id: string,
    input: LedgerQuotationUpdateInput,
    actorId: string
  ): Promise<LedgerQuotationDetail> {
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    const lineRows = input.lineItems.map(toLineItemRow).sort((a, b) => a.sortOrder - b.sortOrder);

    return await this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, id, 'update', expectedUpdatedAt);

      const beforeLines = await tx.receivedQuotationLineItem.findMany({
        where: { receivedQuotationId: id },
        orderBy: { sortOrder: 'asc' },
      });
      const lineItemsChanged =
        beforeLines.length !== lineRows.length ||
        beforeLines.some(
          (line, index) => lineItemSignature(line) !== lineItemSignature(lineRows[index]!)
        );

      const vendor = await this.resolveVendor(tx, current, input);
      const data: Prisma.ReceivedQuotationUncheckedUpdateManyInput = {
        ...this.pickLedgerColumns(input),
        submittedAt: new Date(input.submittedAt),
        ...(vendor ?? {}),
        ...decideReadingConfirmation(
          current.readingStatus,
          input.readingStatus,
          lineItemsChanged,
          actorId
        ),
      };

      // 読んだ版と同じ版の行だけを書き換える。同時の保存で先に確定した版があれば 0 件になる（5.6）
      await this.claimVersion(tx, id, expectedUpdatedAt, data);

      await tx.receivedQuotationLineItem.deleteMany({ where: { receivedQuotationId: id } });
      await tx.receivedQuotationLineItem.createMany({
        data: lineRows.map((row) => ({ receivedQuotationId: id, ...row })),
      });

      const updated = await tx.receivedQuotation.findUniqueOrThrow({ where: { id } });
      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_UPDATED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: id,
          before: auditFields(current, beforeLines.length),
          after: {
            ...auditFields(updated, lineRows.length),
            // 工事価格・確定金額は値を入れず変更の有無だけ（46.11）
            constructionPriceChanged:
              toScaled(current.constructionPrice, 0) !== toScaled(updated.constructionPrice, 0),
            confirmedAmountChanged:
              toScaled(current.confirmedAmount, 0) !== toScaled(updated.confirmedAmount, 0),
          },
          metadata: EDIT_AUDIT_METADATA,
        },
        tx
      );

      const detail = await this.queryService.findById(id, tx);
      if (!detail) {
        throw new ReceivedQuotationNotFoundError(id);
      }
      return detail;
    });
  }

  /**
   * 案件の無い受領見積書を論理削除する（5.5・5.6・5.7）。原本のファイルを持たないため、ストレージは触らない
   *
   * @param id - 受領見積書の ID
   * @param expectedUpdatedAt - 画面が開いた時の更新の日時（`?updatedAt=`）
   * @param actorId - 操作した利用者（監査ログの実行者）
   * @throws ReceivedQuotationNotFoundError 台帳の見積として無いとき
   * @throws LedgerProjectQuotationReadOnlyError 案件の受領見積書のとき
   * @throws LedgerConflictError 開いた後にほかの利用者が更新していたとき
   */
  async deleteQuotation(id: string, expectedUpdatedAt: Date, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, id, 'delete', expectedUpdatedAt);
      const lineItemCount = await tx.receivedQuotationLineItem.count({
        where: { receivedQuotationId: id },
      });

      await this.claimVersion(tx, id, expectedUpdatedAt, { deletedAt: new Date() });

      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_DELETED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: id,
          before: auditFields(current, lineItemCount),
          after: null,
          metadata: EDIT_AUDIT_METADATA,
        },
        tx
      );
    });
  }

  /**
   * 台帳の見積を読み、案件の無い受領見積書で、開いた時の版と同じであることを確かめる
   */
  private async findEditable(
    tx: Prisma.TransactionClient,
    id: string,
    operation: 'update' | 'delete',
    expectedUpdatedAt: Date
  ) {
    const quotation = await tx.receivedQuotation.findFirst({
      where: { AND: [{ id }, LEDGER_BASE_WHERE] },
    });
    if (!quotation) {
      throw new ReceivedQuotationNotFoundError(id);
    }
    if (quotation.projectId !== null) {
      throw new LedgerProjectQuotationReadOnlyError(id, operation);
    }
    if (quotation.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new LedgerConflictError({
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        actualUpdatedAt: quotation.updatedAt.toISOString(),
      });
    }
    return quotation;
  }

  /**
   * ID と更新の日時が一致する、論理削除されていない案件の無い行だけを書き換える。0 件なら排他の不一致（5.6）。
   * 条件付きの更新は行の鍵を取るため、同時の保存の後の方は先の確定を待ってから条件を見直し、0 件になる
   */
  private async claimVersion(
    tx: Prisma.TransactionClient,
    id: string,
    expectedUpdatedAt: Date,
    data: Prisma.ReceivedQuotationUncheckedUpdateManyInput
  ): Promise<void> {
    const { count } = await tx.receivedQuotation.updateMany({
      where: { id, updatedAt: expectedUpdatedAt, deletedAt: null, projectId: null },
      data,
    });
    if (count !== 1) {
      throw new LedgerConflictError({ expectedUpdatedAt: expectedUpdatedAt.toISOString() });
    }
  }

  /** 送られた見積の情報・案件名・原本のパスだけを取り出す（null は消す） */
  private pickLedgerColumns(
    input: LedgerQuotationUpdateInput
  ): Prisma.ReceivedQuotationUncheckedUpdateManyInput {
    return Object.fromEntries(
      LEDGER_COLUMN_KEYS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])
    ) as Prisma.ReceivedQuotationUncheckedUpdateManyInput;
  }

  /**
   * 業者名と取引先の紐づけを決め直す（受領見積書の案件の文脈の更新と同じ規則。44.5〜44.8）
   *
   * - 今と同じ業者名で、取引先を送らないか今と同じ取引先を送ったときは変えない（送り直しで取引先の今の
   *   名前へ書き換えない）
   * - 今と違う取引先を選んだときは、論理削除されていない協力業者に限り紐づけ、業者名に取引先の名前を入れる。
   *   そうでなければ ValidationError で拒む
   * - それ以外は、前後の空白を除いた業者名と名前が完全に一致する論理削除されていない協力業者が 1 件のときに
   *   紐づけ、0 件・複数なら業者名だけを保持する
   *
   * @returns 書き換える値。変えないときは null
   */
  private async resolveVendor(
    tx: Prisma.TransactionClient,
    current: { vendorName: string; tradingPartnerId: string | null },
    input: LedgerQuotationUpdateInput
  ): Promise<{ vendorName: string; tradingPartnerId: string | null } | null> {
    const vendorName = input.vendorName.trim();
    const sameName = vendorName === current.vendorName;
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
    if (partnerChoice !== null) {
      const partner = await tx.tradingPartner.findUnique({
        where: { id: partnerChoice },
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

    const matches = await tx.tradingPartner.findMany({
      where: { name: vendorName, deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
      select: { id: true },
      take: 2,
    });
    return { vendorName, tradingPartnerId: matches.length === 1 ? matches[0]!.id : null };
  }
}
