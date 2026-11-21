/**
 * @fileoverview 受領見積書の保存の規則の共通部品（unit-price-ledger タスク6.6）
 *
 * 受領見積書の保存（`ReceivedQuotationService`）と、単価台帳の取り込み・修正（`LedgerImportService`・
 * `LedgerEditService`）が同じ規則で書くための部品。もとは `ReceivedQuotationService` の外へ出されていない
 * 処理で、台帳の側に同じ処理を書き写していた。タスク6.6 でここへ集め、両方から使う。
 *
 * - 明細行：金額の補い（45.12）・保存の形（区分の既定は直接工事。45.3）・比較の鍵（46.8 の「明細行の変更」）
 * - 読取の確認の遷移（46.6〜46.8）と、読取の確認の経路（46.12・46.13・46.15・46.18）
 * - 監査ログに前後を入れる台帳の項目（46.11・46.21。工事価格・確定金額は入れない）
 * - 業者名と取引先の紐づけ（44.5〜44.8。台帳の取り込みの照合 2.10・2.11 も同じ規則）
 *
 * 呼び出し元ごとの違いは引数で表し、どちらの書き込みも共通にする前と同じにする（読取の確認の
 * `reconfirm`、業者名が空のときの扱い）。
 *
 * Requirements (estimate-request):
 * - 11.12: 金額が無く数量と単価がある明細行は、数量×単価で金額を求める
 * - 44.5〜44.8: 業者名と取引先の紐づけ（選んだ取引先・名前の照合・送り直しで書き換えない）
 * - 45.3・45.12: 区分の既定は直接工事。送られた金額は保持する
 * - 46.6〜46.8: 読取の確認の遷移（確認者と日時、明細行の変更で未確認に戻す）
 * - 46.11: 監査ログの台帳の項目（工事価格・確定金額は入れない）
 * - 46.12・46.13・46.15・46.18: 読取の確認の経路（確認済みにするときに書き、未確認へ戻すときに消す）
 * - 46.21: 監査ログの台帳の項目に経路を入れる
 *
 * Requirements (unit-price-ledger):
 * - 2.10・2.11: 取り込みの取引先の照合（名前が完全に一致する協力業者が 1 件のときだけ紐づける）
 * - 5.1: 案件の無い受領見積書の修正の明細行の保存と業者名の決め直し
 * - 5.4: 修正と印の更新の読取の確認の遷移
 *
 * @module services/received-quotation-rules
 */

import type { Prisma } from '../generated/prisma/client.js';
import { ValidationError } from '../errors/apiError.js';
import {
  RECEIVED_QUOTATION_VALIDATION_MESSAGES,
  type LineItemCategory,
  type LineItemConversion,
  type ReceivedQuotationReadingRoute,
} from '../schemas/received-quotation.schema.js';

// ============================================================================
// 数の揃え方
// ============================================================================

/** 金額・数量の列の小数の桁（DB の Decimal の scale）。比較の前に揃える */
export const LINE_DECIMAL_SCALES = {
  quantity: 4,
  unitPrice: 2,
  amount: 2,
  conversionQuantity: 4,
  conversionUnitPrice: 2,
} as const;

/** Decimal・数・null を小数の桁で揃えた数にする（比較用） */
export const toScaled = (value: unknown, scale: number): number | null =>
  value === null || value === undefined ? null : Number(Number(value).toFixed(scale));

/** Decimal・数・null を数にする（出力・記録用） */
export const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

// ============================================================================
// 明細行
// ============================================================================

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

/** 明細行の保存の形（DB の列）。保存と、読取の確認の変化の判定（46.8）の比較に使う */
export interface LineItemRow {
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

/**
 * 明細行の金額を補う（金額は単価と数量の積として自動計算。estimate-request の 11.12）
 *
 * 送られた金額は保持する（画面以外の経路で登録された金額を書き換えない。45.12）。金額が無く（null・省略）、
 * 数量と単価が両方あるときだけ、数量×単価を小数第 1 位で四捨五入して求める（画面の自動計算と同じ
 * `Math.round`）
 *
 * @param lineItems - 明細行入力データ
 * @returns 金額を補った明細行データ（入力の形を保つ）
 */
export function fillLineItemAmounts<T extends LineItemInput>(lineItems: ReadonlyArray<T>): T[] {
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
 * 明細行の入力を保存の形（DB の列）にする。区分の入力が無い行は直接工事（45.3）、参考の印の入力が無い行は
 * 無とし、換算は 4 列に分ける
 */
export function toLineItemRow(item: LineItemInput): LineItemRow {
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
 * 明細行の比較の鍵（全列。金額・数量は DB の小数の桁で揃える）。読取の確認の変化の判定に使う（46.8）
 *
 * 保存済みの行（DB の値。Decimal を含む）と保存の形の行のどちらも受ける
 */
export function lineItemSignature(row: Record<keyof LineItemRow, unknown>): string {
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
 * 保存前（表示順）と保存後（表示順で並べた保存の形）の明細行が、並び順と全列で違うか（46.8）
 *
 * @param before - 保存前の行（表示順）
 * @param after - 保存後の行（表示順）
 */
export function haveLineItemsChanged(
  before: ReadonlyArray<Record<keyof LineItemRow, unknown>>,
  after: ReadonlyArray<LineItemRow>
): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((line, index) => lineItemSignature(line) !== lineItemSignature(after[index]!));
}

// ============================================================================
// 読取の確認
// ============================================================================

/** 読取の確認の状態（46.6） */
export type ReadingStatus = 'UNCONFIRMED' | 'CONFIRMED';

/** 読取の確認の経路（46.12。画面・台帳の取り込み・ArchiBench） */
export type ReadingConfirmationRoute = ReceivedQuotationReadingRoute;

/** 読取の確認で書き込む列（変えない列は持たない） */
export interface ReadingConfirmationWrite {
  readingStatus?: ReadingStatus;
  readingConfirmedById?: string | null;
  readingConfirmedAt?: Date | null;
  readingConfirmationRoute?: ReadingConfirmationRoute | null;
}

/** 読取の確認の決め方の呼び出し元ごとの違い */
export interface ReadingConfirmationOptions {
  /**
   * 保存前が確認済みで確認済みを送り直したときに、状態の列（確認済み）を書くか。書いても値は変わらず、
   * どちらでも確認者と日時は保つ。受領見積書の保存は書き（`'writeStatus'`）、台帳の修正と印の更新は書かない
   * （`'omit'`）。共通にする前のそれぞれの書き込みのとおり
   */
  reconfirm: 'writeStatus' | 'omit';
  /** 新しく確認済みにするときの経路と日時。省くと経路は画面、日時は今（46.13・46.15） */
  newConfirmation?: { readonly route: ReadingConfirmationRoute; readonly confirmedAt: Date };
}

/**
 * 読取の確認の遷移と経路を決める（46.6〜46.8・46.12・46.13・46.15・46.18）
 *
 * 1. 保存前が確認済みで、読み取った内容（明細行など）が変わる → 未確認に戻し、確認者と日時と経路を消す
 *    （同じ保存で確認済みを送っていても戻す）
 * 2. 確認済みを送り、保存前が未確認（作成を含む。`null`） → 確認済み、確認者は操作した利用者。経路と日時は
 *    `options.newConfirmation` のとおりで、省かれたら経路は画面、日時は今
 * 3. それ以外は入力のとおり（未確認を送れば確認者と日時と経路を消す。確認済みを送り直しても確認者と日時と
 *    経路は保つ〔経路の記録の無い確認済みの null もそのまま〕。送らなければ変えない）
 *
 * 経路をここで決めるのは、未確認へ戻す分岐のどれかで消し忘れて「未確認は経路を持たない」に反しないようにする
 * ためである（呼び出し元は戻り値を保存の列へ広げるだけでよい）
 *
 * @param previousStatus - 保存前の状態。作成は `null`
 * @param requested - 送られた状態（送らなければ undefined）
 * @param contentChanged - 読み取った内容が変わるか
 * @param actorId - 操作した利用者
 * @param options - 確認済みを送り直したときの書き方
 * @returns 書き込む列（変えないときは空）
 */
export function decideReadingConfirmation(
  previousStatus: ReadingStatus | null,
  requested: ReadingStatus | undefined,
  contentChanged: boolean,
  actorId: string,
  options: ReadingConfirmationOptions
): ReadingConfirmationWrite {
  const unconfirmed = {
    readingStatus: 'UNCONFIRMED' as const,
    readingConfirmedById: null,
    readingConfirmedAt: null,
    readingConfirmationRoute: null,
  };
  if (previousStatus === 'CONFIRMED' && contentChanged) {
    return unconfirmed;
  }
  if (requested === 'CONFIRMED') {
    if (previousStatus === 'CONFIRMED') {
      return options.reconfirm === 'writeStatus' ? { readingStatus: 'CONFIRMED' } : {};
    }
    return {
      readingStatus: 'CONFIRMED',
      readingConfirmedById: actorId,
      readingConfirmedAt: options.newConfirmation?.confirmedAt ?? new Date(),
      readingConfirmationRoute: options.newConfirmation?.route ?? 'SCREEN',
    };
  }
  if (requested === 'UNCONFIRMED') {
    return unconfirmed;
  }
  return {};
}

// ============================================================================
// 監査ログ
// ============================================================================

/** 監査ログに前後を入れる台帳の項目の元（受領見積書の行） */
export interface LedgerAuditSource {
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
  /** 読取の確認の経路（46.21）。未確認と、経路の記録の無い確認済みは null */
  readingConfirmationRoute: string | null;
  quoteDiscriminator: string;
}

/**
 * 監査ログに前後を入れる台帳の項目（46.11・46.21）。工事価格・確定金額は入れない
 */
export function ledgerAuditFields(
  quotation: LedgerAuditSource
): Record<string, string | number | null> {
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
    readingConfirmationRoute: quotation.readingConfirmationRoute,
    quoteDiscriminator: quotation.quoteDiscriminator,
  };
}

// ============================================================================
// 業者名と取引先
// ============================================================================

/** 業者名と取引先の紐づけ */
export interface VendorAssignment {
  vendorName: string;
  tradingPartnerId: string | null;
}

/**
 * 名前が完全に一致する、論理削除されていない協力業者の取引先がちょうど 1 件なら、その ID を返す
 * （0 件・複数なら null。44.6・44.7、台帳の取り込みの 2.10・2.11）。名前は呼び出し元が整える
 */
export async function findSoleSubcontractorIdByName(
  tx: Prisma.TransactionClient,
  name: string
): Promise<string | null> {
  const matches = await tx.tradingPartner.findMany({
    where: { name, deletedAt: null, types: { some: { type: 'SUBCONTRACTOR' } } },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0]!.id : null;
}

/**
 * 業者名と取引先の紐づけを決める（44.5〜44.7）
 *
 * - 取引先の ID があれば、その取引先が論理削除されていない協力業者のときに紐づけ、業者名に取引先の名前を
 *   入れる（44.5）。無い・論理削除済み・協力業者でないときは ValidationError で拒み、名前の照合へ切り替えない
 *   （利用者が選んだ取引先と違う取引先へ黙って紐づけない）
 * - 取引先の ID が無ければ、前後の空白を除いた業者名と名前が完全に一致する論理削除されていない協力業者が
 *   ちょうど 1 件のときに紐づけ、0 件・複数なら業者名だけを保持する（44.6・44.7）。業者名が空のときの扱いは
 *   呼び出し元が決める
 *
 * 取引先の変更・削除の側から業者名を書き換える処理は持たない（44.8）
 *
 * @throws ValidationError 選んだ取引先が論理削除されていない協力業者でないとき
 */
export async function resolveVendor(
  tx: Prisma.TransactionClient,
  vendorName: string,
  tradingPartnerId: string | null
): Promise<VendorAssignment> {
  if (tradingPartnerId !== null) {
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

  const name = vendorName.trim();
  return { vendorName: name, tradingPartnerId: await findSoleSubcontractorIdByName(tx, name) };
}

/**
 * 更新で業者名と取引先の紐づけを決め直すかを決める（44.8）
 *
 * 業者名も取引先の ID も送られないとき、または今と同じ取引先・同じ業者名（前後の空白を除く）を送り直した
 * ときは決め直さない（送り直しで取引先の今の名前へ書き換えない）。それ以外は、決め直しに使う業者名
 * （送られなければ今の業者名）と、今と違う取引先を選んだときだけその ID を返す
 *
 * @returns {@link resolveVendor} へ渡す業者名と取引先の ID。決め直さないときは null
 */
export function decideVendorUpdate(
  current: VendorAssignment,
  input: { vendorName?: string; tradingPartnerId?: string | null }
): { vendorName: string; tradingPartnerId: string | null } | null {
  const sameName = input.vendorName === undefined || input.vendorName.trim() === current.vendorName;
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
  return { vendorName: input.vendorName ?? current.vendorName, tradingPartnerId: partnerChoice };
}
