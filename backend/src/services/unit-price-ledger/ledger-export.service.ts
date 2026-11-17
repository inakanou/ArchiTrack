/**
 * @fileoverview 台帳の Excel の書き出し（unit-price-ledger タスク2.10、design.md の LedgerExportService）
 *
 * 絞り込みの結果を「見積」「明細行」「要確認」の 3 つのシートの Excel にする。
 *
 * - 対象は一覧と同じ条件（`buildLedgerWhere`）と並び（`LEDGER_ORDER_BY`）の、ページに分けないすべての見積
 *   （論理削除された受領見積書と、論理削除された見積依頼の受領見積書は含めない。1.3・6.1）
 * - 見積のシートは一覧と同じ列（4.1）。明細行のシートは 6.2 の列。要確認のシートは参考の印のある明細行を
 *   明細行のシートと同じ列で出す。明細行は見積の並びのまま、見積の中は表示順
 * - 作る前に `ExportAuditService.record`（種別 `unit_price_ledger_xlsx`、案件なし、件数は見積の数）を呼ぶ。
 *   記録に失敗したらファイルを作らず、500 `EXPORT_RECORD_FAILED` で拒む（6.3・6.4。schedules の経路の
 *   recordExportBeforeGeneration と同じ順）
 * - 結果が 0 件の要求は、記録もファイルも作らずに 400 で拒む（6.5）
 * - 読む前に一覧と同じ条件で見積を数え、上限（{@link LEDGER_EXPORT_MAX_QUOTATIONS}。design.md の
 *   LedgerExportService に記した実測で決めた件数）を超えたら、見積を読まず、記録もファイルも作らずに
 *   400 `LEDGER_EXPORT_TOO_MANY` で拒む（6.6。全件をメモリに読んで作るため）
 * - 文字の欄は SheetJS の文字のセルとして書くため、「=」などで始まる値も式にならない
 *
 * Requirements (unit-price-ledger): 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 *
 * @module services/unit-price-ledger/ledger-export.service
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { LedgerFilter } from '../../schemas/unit-price-ledger.schema.js';
import type { LineItemCategory } from '../../schemas/received-quotation.schema.js';
import type { ExportAuditService } from '../export-audit.service.js';
import type { RequestContext } from '../../types/auth.types.js';
import type { ReadingStatus } from '../received-quotation.service.js';
import { BadRequestError, InternalServerError } from '../../errors/apiError.js';
import { buildLedgerWhere, LEDGER_ORDER_BY, type LedgerAdoption } from './ledger-query.service.js';

/** 記録の失敗の文言（requirements.md 6.4 の逐語） */
export const LEDGER_EXPORT_RECORD_FAILED_MESSAGE =
  '書き出しを記録できなかったため、出力を中止しました';

/** 0 件の書き出しを拒む文言（requirements.md 4.7 の 0 件の表示と同じ） */
export const LEDGER_EXPORT_EMPTY_MESSAGE = '条件に合う見積はありません';

/**
 * 1 回の書き出しの見積の数の上限（6.6）。値は design.md の LedgerExportService に記した実測
 * （research.md の書き出しの件数とメモリの実測）で決めた
 */
export const LEDGER_EXPORT_MAX_QUOTATIONS = 3000;

/**
 * 上限を超える書き出しを拒む文言（6.6。絞り込みを狭めるように伝える）
 *
 * @param maxQuotations - 1 回の書き出しの見積の数の上限
 */
export const buildLedgerExportTooManyMessage = (maxQuotations: number): string =>
  `書き出す見積が多すぎます。一度に書き出せるのは ${maxQuotations.toLocaleString('ja-JP')} 件までです。絞り込みを狭めてから、もう一度書き出してください`;

/** 既定の上限での、上限を超える書き出しを拒む文言 */
export const LEDGER_EXPORT_TOO_MANY_MESSAGE = buildLedgerExportTooManyMessage(
  LEDGER_EXPORT_MAX_QUOTATIONS
);

/** シートの名前（6.1） */
export const LEDGER_EXPORT_SHEET_NAMES = {
  quotations: '見積',
  lineItems: '明細行',
  needsReview: '要確認',
} as const;

/** 見積のシートの列（4.1 の一覧と同じ） */
const QUOTATION_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '見積の合計（別途を除く）',
  '採否',
  '読取の確認',
  '参考の行',
] as const;

/** 明細行・要確認のシートの列（6.2。換算は数量・単位・単価・根拠の 4 列に分ける） */
const LINE_HEADER = [
  '業者名',
  '見積日',
  '案件名',
  '区分',
  '名称',
  '規格',
  '数量',
  '単位',
  '単価',
  '金額',
  '条件',
  '換算の数量',
  '換算の単位',
  '換算の単価',
  '換算の根拠',
  '参考の印',
  '参考の理由',
  '分類キー',
] as const;

/** 区分の表示名（45.1） */
const CATEGORY_LABELS: Readonly<Record<LineItemCategory, string>> = {
  DIRECT: '直接工事',
  OVERHEAD: '諸経費',
  TRAVEL: '交通費',
  WASTE: '産廃',
  DISCOUNT: '値引き',
  LEGAL_WELFARE: '法定福利費',
  EXCLUDED: '別途',
};

/** 採否の表示名（46.3） */
const ADOPTION_LABELS: Readonly<Record<LedgerAdoption, string>> = {
  ADOPTED: '採用',
  REJECTED: '不採用',
  UNKNOWN: '不明',
};

/** 読取の確認の表示名（46.6） */
const READING_STATUS_LABELS: Readonly<Record<ReadingStatus, string>> = {
  UNCONFIRMED: '未確認',
  CONFIRMED: '確認済み',
};

const FLAG_LABEL = { yes: 'あり', no: 'なし' } as const;

/** セルの値（null は空のセル） */
export type LedgerExportCell = string | number | null;

/** 1 枚のシート */
export interface LedgerExportSheet {
  name: string;
  rows: LedgerExportCell[][];
}

/** 書き出しの結果 */
export interface LedgerExportResult {
  buffer: Buffer;
  /** 「単価台帳_YYYYMMDD.xlsx」（日本時間の日付） */
  fileName: string;
  /** 書き出した見積の数 */
  quotationCount: number;
}

/**
 * 書き出しのサービスの依存
 */
export interface LedgerExportServiceDependencies {
  prisma: PrismaClient;
  exportAuditService: Pick<ExportAuditService, 'record'>;
  /** シートを xlsx のファイルにする（既定は {@link writeLedgerWorkbook}） */
  writeWorkbook?: (sheets: LedgerExportSheet[]) => Buffer;
  /** ファイル名の日付に使う今の時刻 */
  now?: () => Date;
  /** 1 回の書き出しの見積の数の上限（既定は {@link LEDGER_EXPORT_MAX_QUOTATIONS}。試験で小さくする） */
  maxQuotations?: number;
}

/**
 * シートを SheetJS で xlsx のファイルにする
 *
 * @param sheets - シートの並び
 */
export function writeLedgerWorkbook(sheets: LedgerExportSheet[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Decimal・数・null を数にする（null は空のセル） */
const toCellNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** 見積日（DB の日付）を YYYY-MM-DD にする */
const toDateText = (value: Date): string => value.toISOString().slice(0, 10);

/** 日本時間の日付を YYYYMMDD にする */
const toJstDateStamp = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(value)
    .replace(/-/g, '');

/**
 * 台帳の Excel の書き出しのサービス
 */
export class LedgerExportService {
  private readonly prisma: PrismaClient;
  private readonly exportAuditService: Pick<ExportAuditService, 'record'>;
  private readonly writeWorkbook: (sheets: LedgerExportSheet[]) => Buffer;
  private readonly now: () => Date;
  private readonly maxQuotations: number;

  constructor(deps: LedgerExportServiceDependencies) {
    this.prisma = deps.prisma;
    this.exportAuditService = deps.exportAuditService;
    this.writeWorkbook = deps.writeWorkbook ?? writeLedgerWorkbook;
    this.now = deps.now ?? (() => new Date());
    this.maxQuotations = deps.maxQuotations ?? LEDGER_EXPORT_MAX_QUOTATIONS;
  }

  /**
   * 絞り込みの結果を 3 つのシートの Excel にする（6.1〜6.5）
   *
   * @param filter - 台帳の絞り込み（`ledgerFilterSchema` の出力）
   * @param actorId - 書き出す利用者
   * @param ctx - 要求の送信元（出力の記録に書く）
   * @throws BadRequestError（400 `LEDGER_EXPORT_EMPTY`）結果が 0 件のとき
   * @throws BadRequestError（400 `LEDGER_EXPORT_TOO_MANY`）結果の見積の数が上限を超えるとき
   * @throws InternalServerError（500 `EXPORT_RECORD_FAILED`）出力の記録に失敗したとき
   */
  async export(
    filter: LedgerFilter,
    actorId: string,
    ctx: RequestContext
  ): Promise<LedgerExportResult> {
    const where = buildLedgerWhere(filter);

    // 全件をメモリに読む前に数え、0 件と上限の超過を拒む（6.5・6.6。記録もファイルも作らない）
    const count = await this.prisma.receivedQuotation.count({ where });
    if (count === 0) {
      throw new BadRequestError(LEDGER_EXPORT_EMPTY_MESSAGE, 'LEDGER_EXPORT_EMPTY');
    }
    if (count > this.maxQuotations) {
      throw this.tooManyError(count);
    }

    const quotations = await this.prisma.receivedQuotation.findMany({
      where,
      orderBy: LEDGER_ORDER_BY,
      // 数えた後に増えた分まで読まないよう、上限を 1 件超える分までに限って読む
      take: this.maxQuotations + 1,
      select: {
        id: true,
        vendorName: true,
        submittedAt: true,
        ledgerProjectName: true,
        adoption: true,
        readingStatus: true,
        project: { select: { name: true } },
        lineItems: {
          orderBy: { sortOrder: 'asc' },
          select: {
            category: true,
            name: true,
            specification: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            amount: true,
            condition: true,
            conversionQuantity: true,
            conversionUnit: true,
            conversionUnitPrice: true,
            conversionBasis: true,
            isReference: true,
            referenceReason: true,
            classificationKey: true,
          },
        },
      },
    });

    // 数えた後に消された見積で 0 件になったときも拒む
    if (quotations.length > this.maxQuotations) {
      throw this.tooManyError(quotations.length);
    }
    if (quotations.length === 0) {
      throw new BadRequestError(LEDGER_EXPORT_EMPTY_MESSAGE, 'LEDGER_EXPORT_EMPTY');
    }

    // 作る前に記録する。記録に失敗したらファイルを作らない（6.3・6.4）
    const recorded = await this.exportAuditService.record(
      actorId,
      {
        kind: 'unit_price_ledger_xlsx',
        projectId: null,
        targetIds: quotations.map((quotation) => quotation.id),
        itemCount: quotations.length,
      },
      ctx
    );
    if (!recorded.ok) {
      throw new InternalServerError(LEDGER_EXPORT_RECORD_FAILED_MESSAGE, 'EXPORT_RECORD_FAILED');
    }

    const quotationRows: LedgerExportCell[][] = [[...QUOTATION_HEADER]];
    const lineRows: LedgerExportCell[][] = [[...LINE_HEADER]];
    const reviewRows: LedgerExportCell[][] = [[...LINE_HEADER]];

    for (const quotation of quotations) {
      const submittedAt = toDateText(quotation.submittedAt);
      const projectName = quotation.project ? quotation.project.name : quotation.ledgerProjectName;

      // 合計は別途を除き、金額のある行だけを足す。足す行が無ければ空（45.5）
      const amounts = quotation.lineItems
        .filter((line) => line.category !== 'EXCLUDED' && line.amount !== null)
        .map((line) => new Decimal(String(line.amount)));
      const total =
        amounts.length > 0
          ? amounts.reduce((sum, amount) => sum.plus(amount), new Decimal(0)).toNumber()
          : null;
      const hasReferenceLines = quotation.lineItems.some((line) => line.isReference);

      quotationRows.push([
        quotation.vendorName,
        submittedAt,
        projectName,
        total,
        ADOPTION_LABELS[quotation.adoption],
        READING_STATUS_LABELS[quotation.readingStatus],
        hasReferenceLines ? FLAG_LABEL.yes : FLAG_LABEL.no,
      ]);

      for (const line of quotation.lineItems) {
        const row: LedgerExportCell[] = [
          quotation.vendorName,
          submittedAt,
          projectName,
          CATEGORY_LABELS[line.category],
          line.name,
          line.specification,
          toCellNumber(line.quantity),
          line.unit,
          toCellNumber(line.unitPrice),
          toCellNumber(line.amount),
          line.condition,
          toCellNumber(line.conversionQuantity),
          line.conversionUnit,
          toCellNumber(line.conversionUnitPrice),
          line.conversionBasis,
          line.isReference ? FLAG_LABEL.yes : FLAG_LABEL.no,
          line.referenceReason,
          line.classificationKey,
        ];
        lineRows.push(row);
        if (line.isReference) {
          reviewRows.push(row);
        }
      }
    }

    const buffer = this.writeWorkbook([
      { name: LEDGER_EXPORT_SHEET_NAMES.quotations, rows: quotationRows },
      { name: LEDGER_EXPORT_SHEET_NAMES.lineItems, rows: lineRows },
      { name: LEDGER_EXPORT_SHEET_NAMES.needsReview, rows: reviewRows },
    ]);

    return {
      buffer,
      fileName: `単価台帳_${toJstDateStamp(this.now())}.xlsx`,
      quotationCount: quotations.length,
    };
  }

  /** 上限の超過の誤り（6.6）。count は数えた、または読んだ見積の数 */
  private tooManyError(count: number): BadRequestError {
    return new BadRequestError(
      buildLedgerExportTooManyMessage(this.maxQuotations),
      'LEDGER_EXPORT_TOO_MANY',
      { count, maxQuotations: this.maxQuotations }
    );
  }
}
