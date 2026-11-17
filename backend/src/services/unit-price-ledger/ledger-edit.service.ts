/**
 * @fileoverview 台帳の画面からの修正と削除（unit-price-ledger タスク2.6、design.md の LedgerEditService）
 *
 * 案件の無い受領見積書（取り込んだ見積カードなど）の全体の修正と論理削除と、台帳の見積の印の更新（5.2。
 * タスク2.7）を、受領見積書の監査ログの決まりで記録する。
 *
 * - 見積の有無は台帳の対象（`LEDGER_BASE_WHERE`：論理削除されていない受領見積書で、見積依頼があれば
 *   生きているもの）で決め、無ければ `ReceivedQuotationNotFoundError`（404）とする
 * - 案件の受領見積書の全体の修正と削除は `LedgerProjectQuotationReadOnlyError`（409）で拒む（5.2・5.5）
 * - 印の更新（5.2・5.3）：読取の確認・明細行の参考の印と理由・分類キーだけを変える。案件の受領見積書と
 *   案件の無い受領見積書のどちらも受ける（API の契約に案件の有無の制限が無い）。印の更新は 46.8 の
 *   「明細行の変更」に当たらず、読取の確認を戻さない。印を送らずに理由だけが来たときは保存済みの印と照合し、
 *   印が無なら `ValidationError`（46.5）。見積に無い明細行の指定も `ValidationError`。明細行だけを変えても
 *   受領見積書の更新の日時を進める（排他の判定を受領見積書の更新の日時で行うため）
 * - 修正（5.1）：業者名・見積日・見積の情報・案件名・原本のパスと明細行の全体。送らない見積の情報・案件名・
 *   原本のパスは変えず、null は消す。業者名・取引先は受領見積書の案件の文脈と同じ規則で決め直す（44.5〜44.8）。
 *   明細行は全量を置き換え、金額が無く数量と単価がある行だけ数量×単価を求める（45.12）
 * - 明細行の金額の補い・保存の形・比較の鍵、読取の確認の遷移、監査ログの台帳の項目、業者名と取引先の決め直しは、
 *   受領見積書の保存と同じ部品（`received-quotation-rules.ts`。タスク6.6）を使う
 * - 名前の作り直し（5.8）：保存後の業者名か見積日（UTC の日付）が今と違うときは、受領見積書の名前を取り込みと
 *   同じ形（`buildLedgerQuotationName`。業者名と見積日を「_」でつなぎ、名前の上限までで切り詰める）で作り直す。
 *   名前の前後は監査ログの name に入る
 * - 読取の確認（5.4・46.6〜46.8）：保存前が確認済みで明細行が変わるときは未確認に戻し、確認者と日時を消す。
 *   未確認から確認済みにしたときは確認者を操作した利用者、日時を今とする
 * - 楽観的排他制御（5.6）：更新の日時の一致で判定する。読んだ時の比較に加え、本体の書き込みを
 *   「ID と更新の日時が一致する行」への条件付きの更新にし、同時の保存でも 1 つだけを通す。不一致は
 *   `LedgerConflictError`（409 `LEDGER_CONFLICT`）
 * - 監査ログ（5.7・14.7・46.11）：`RECEIVED_QUOTATION_UPDATED` / `RECEIVED_QUOTATION_DELETED` を変更と同じ
 *   トランザクションで書き、metadata の source は `unit_price_ledger`。協力業者の金額（工事価格・確定金額・
 *   明細行の中身）と原本のパスは入れず、工事価格・確定金額は変わったかどうかだけを入れる
 *
 * Requirements (unit-price-ledger): 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
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
  type LedgerReadOnlyOperation,
} from '../../errors/unitPriceLedgerError.js';
import { LINE_ITEM_VALIDATION_MESSAGES } from '../../schemas/received-quotation.schema.js';
import {
  UNIT_PRICE_LEDGER_VALIDATION_MESSAGES,
  type LedgerMarksUpdateInput,
  type LedgerQuotationUpdateInput,
} from '../../schemas/unit-price-ledger.schema.js';
import {
  decideReadingConfirmation,
  decideVendorUpdate,
  fillLineItemAmounts,
  haveLineItemsChanged,
  ledgerAuditFields,
  resolveVendor,
  toLineItemRow,
  toScaled,
  type LedgerAuditSource,
  type ReadingConfirmationOptions,
  type VendorAssignment,
} from '../received-quotation-rules.js';
import { buildLedgerQuotationName } from './ledger-card-parser.js';
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

/** 見積日（DB の日付）を YYYY-MM-DD にする（取り込みのカードの見積日と同じ UTC の日付） */
const toDateText = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * 業者名か見積日が変わるときだけ、受領見積書の名前を取り込みと同じ形で作り直す（5.8）
 *
 * @returns 書き換える名前。変えないときは空のオブジェクト
 */
const regenerateName = (
  current: { vendorName: string; submittedAt: Date },
  vendorName: string,
  submittedAt: Date
): { name?: string } => {
  const submittedDate = toDateText(submittedAt);
  if (vendorName === current.vendorName && submittedDate === toDateText(current.submittedAt)) {
    return {};
  }
  return { name: buildLedgerQuotationName(vendorName, submittedDate) };
};

/**
 * 台帳の読取の確認（確認済みの送り直しでは列を書かない。共通にする前のとおりで、確認者と日時は保つ）
 */
const READING_CONFIRMATION_OPTIONS: ReadingConfirmationOptions = { reconfirm: 'omit' };

/** 受領見積書の行のうち、監査ログと判定に使う欄 */
interface QuotationAuditSource extends LedgerAuditSource {
  estimateRequestId: string | null;
  name: string;
  submittedAt: Date;
  fileName: string | null;
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
  ...ledgerAuditFields(quotation),
  ledgerCardId: quotation.ledgerCardId,
  ledgerProjectName: quotation.ledgerProjectName,
});

/** 明細行の印（参考の印と理由・分類キー） */
interface LineItemMarks {
  isReference: boolean;
  referenceReason: string | null;
  classificationKey: string | null;
}

/**
 * 監査ログに入れる、1 行の印の変更。変わった印だけを入れる。参考の理由は金額を含みうる自由な文のため、
 * 値を入れず変わったかどうかだけを入れる（14.7・46.11 の金額を記録しない方針）
 */
interface LineItemMarkChange {
  lineItemId: string;
  sortOrder: number;
  isReference?: { before: boolean; after: boolean };
  referenceReasonChanged?: true;
  classificationKey?: { before: string | null; after: string | null };
}

/**
 * 1 行の印の入力を保存済みの印に重ね、保存後の印を決める（送らない欄は変えない）
 *
 * - 参考の印を外し、理由を送らないときは、保存済みの理由を消す（46.5 の決まりを保つ）
 * - 理由を送り、保存後の印が無のときは拒む（46.5。印を送らない要求は保存済みの印と照合する）
 *
 * @throws ValidationError 参考の印が無の行に参考の理由を入れようとしたとき
 */
const mergeLineItemMarks = (
  stored: LineItemMarks,
  mark: LedgerMarksUpdateInput['lineItems'][number]
): LineItemMarks => {
  const isReference = mark.isReference ?? stored.isReference;
  const sentReason = mark.referenceReason;
  if (!isReference && typeof sentReason === 'string' && sentReason.trim() !== '') {
    throw new ValidationError(LINE_ITEM_VALIDATION_MESSAGES.REFERENCE_REASON_WITHOUT_REFERENCE, {
      lineItemId: mark.id,
    });
  }
  const referenceReason = !isReference
    ? null
    : sentReason !== undefined
      ? sentReason
      : stored.referenceReason;
  const classificationKey =
    mark.classificationKey !== undefined ? mark.classificationKey : stored.classificationKey;
  return { isReference, referenceReason, classificationKey };
};

/** 保存前後の印を比べ、変わった印だけを監査の形にする。変わらなければ null */
const diffLineItemMarks = (
  lineItemId: string,
  sortOrder: number,
  before: LineItemMarks,
  after: LineItemMarks
): LineItemMarkChange | null => {
  const change: LineItemMarkChange = { lineItemId, sortOrder };
  if (before.isReference !== after.isReference) {
    change.isReference = { before: before.isReference, after: after.isReference };
  }
  if (before.referenceReason !== after.referenceReason) {
    change.referenceReasonChanged = true;
  }
  if (before.classificationKey !== after.classificationKey) {
    change.classificationKey = { before: before.classificationKey, after: after.classificationKey };
  }
  return Object.keys(change).length > 2 ? change : null;
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
    // 金額が無く数量と単価がある行だけ数量×単価を求め（45.12）、保存の形にして表示順に並べる
    const lineRows = fillLineItemAmounts(input.lineItems)
      .map(toLineItemRow)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return await this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, id, 'update', expectedUpdatedAt);

      const beforeLines = await tx.receivedQuotationLineItem.findMany({
        where: { receivedQuotationId: id },
        orderBy: { sortOrder: 'asc' },
      });
      const lineItemsChanged = haveLineItemsChanged(beforeLines, lineRows);

      const vendor = await this.resolveVendor(tx, current, input);
      const submittedAt = new Date(input.submittedAt);
      const data: Prisma.ReceivedQuotationUncheckedUpdateManyInput = {
        ...this.pickLedgerColumns(input),
        submittedAt,
        ...(vendor ?? {}),
        ...regenerateName(current, vendor?.vendorName ?? current.vendorName, submittedAt),
        ...decideReadingConfirmation(
          current.readingStatus,
          input.readingStatus,
          lineItemsChanged,
          actorId,
          READING_CONFIRMATION_OPTIONS
        ),
      };

      // 読んだ版と同じ版の行だけを書き換える。同時の保存で先に確定した版があれば 0 件になる（5.6）
      await this.claimVersion(tx, id, current.projectId, expectedUpdatedAt, data);

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

      await this.claimVersion(tx, id, current.projectId, expectedUpdatedAt, {
        deletedAt: new Date(),
      });

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
   * 台帳の見積の印（読取の確認・明細行の参考の印と理由・分類キー）だけを更新する（5.2・5.3・5.4・5.6・5.7）
   *
   * 案件の受領見積書と案件の無い受領見積書のどちらも受ける。ほかの欄は変えず、読取の確認を未確認に戻さない。
   * 送らない明細行と、行の送らない欄は変えない。
   *
   * @param id - 受領見積書の ID
   * @param input - 印の更新の本文（`ledgerMarksUpdateSchema` の出力。expectedUpdatedAt を含む）
   * @param actorId - 操作した利用者（監査ログの実行者・読取の確認者）
   * @returns 保存後の台帳の詳細
   * @throws ReceivedQuotationNotFoundError 台帳の見積として無いとき
   * @throws LedgerConflictError 開いた後にほかの利用者が更新していたとき
   * @throws ValidationError 見積に無い明細行を指定したとき、参考の印が無の行に参考の理由を入れたとき
   */
  async updateMarks(
    id: string,
    input: LedgerMarksUpdateInput,
    actorId: string
  ): Promise<LedgerQuotationDetail> {
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);

    return await this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, id, 'marks', expectedUpdatedAt);

      const storedLines = await tx.receivedQuotationLineItem.findMany({
        where: { receivedQuotationId: id },
        select: {
          id: true,
          sortOrder: true,
          isReference: true,
          referenceReason: true,
          classificationKey: true,
        },
        orderBy: { sortOrder: 'asc' },
      });
      const storedById = new Map(storedLines.map((line) => [line.id, line]));

      // 書き込みの前に、すべての行を検証する
      const lineUpdates = input.lineItems.map((mark) => {
        const stored = storedById.get(mark.id);
        if (!stored) {
          throw new ValidationError(
            UNIT_PRICE_LEDGER_VALIDATION_MESSAGES.LINE_ITEM_NOT_IN_QUOTATION,
            { lineItemId: mark.id }
          );
        }
        const after = mergeLineItemMarks(stored, mark);
        return { after, change: diffLineItemMarks(stored.id, stored.sortOrder, stored, after) };
      });

      // 明細行だけを変えるときも、受領見積書の更新の日時を進めて版を取る（5.6）
      await this.claimVersion(tx, id, current.projectId, expectedUpdatedAt, {
        ...decideReadingConfirmation(
          current.readingStatus,
          input.readingStatus,
          false,
          actorId,
          READING_CONFIRMATION_OPTIONS
        ),
        updatedAt: new Date(),
      });

      const changes: LineItemMarkChange[] = [];
      for (const { after, change } of lineUpdates) {
        if (change === null) {
          continue;
        }
        changes.push(change);
        await tx.receivedQuotationLineItem.update({
          where: { id: change.lineItemId },
          data: after,
        });
      }

      const updated = await tx.receivedQuotation.findUniqueOrThrow({ where: { id } });
      await this.auditLogService.createLog(
        {
          action: 'RECEIVED_QUOTATION_UPDATED',
          actorId,
          targetType: RECEIVED_QUOTATION_TARGET_TYPE,
          targetId: id,
          before: auditFields(current, storedLines.length),
          after: {
            ...auditFields(updated, storedLines.length),
            // 印の更新は工事価格・確定金額を変えない。修正の記録と同じ形にそろえる（46.11）
            constructionPriceChanged: false,
            confirmedAmountChanged: false,
            lineItemMarkChanges: changes.map((change) => ({ ...change })),
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
   * 台帳の見積を読み、開いた時の版と同じであることを確かめる。修正と削除は案件の無い受領見積書だけを受け、
   * 印の更新は案件の受領見積書も受ける
   */
  private async findEditable(
    tx: Prisma.TransactionClient,
    id: string,
    operation: LedgerReadOnlyOperation | 'marks',
    expectedUpdatedAt: Date
  ) {
    const quotation = await tx.receivedQuotation.findFirst({
      where: { AND: [{ id }, LEDGER_BASE_WHERE] },
    });
    if (!quotation) {
      throw new ReceivedQuotationNotFoundError(id);
    }
    if (operation !== 'marks' && quotation.projectId !== null) {
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
   * ID と更新の日時が一致し、読んだ時と同じ案件の、論理削除されていない行だけを書き換える。0 件なら排他の
   * 不一致（5.6）。条件付きの更新は行の鍵を取るため、同時の保存の後の方は先の確定を待ってから条件を見直し、
   * 0 件になる
   */
  private async claimVersion(
    tx: Prisma.TransactionClient,
    id: string,
    projectId: string | null,
    expectedUpdatedAt: Date,
    data: Prisma.ReceivedQuotationUncheckedUpdateManyInput
  ): Promise<void> {
    const { count } = await tx.receivedQuotation.updateMany({
      where: { id, updatedAt: expectedUpdatedAt, deletedAt: null, projectId },
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
    current: VendorAssignment,
    input: LedgerQuotationUpdateInput
  ): Promise<VendorAssignment | null> {
    const choice = decideVendorUpdate(current, input);
    return choice === null ? null : resolveVendor(tx, choice.vendorName, choice.tradingPartnerId);
  }
}
