/**
 * @fileoverview 台帳の一覧・絞り込み・詳細（unit-price-ledger タスク2.5、design.md の LedgerQueryService）
 *
 * 受領見積書そのものを台帳の見積として、一覧・絞り込み・総件数・詳細を返す。
 *
 * - 対象は論理削除されていない受領見積書のすべて（見積依頼・案件の有無を問わない。1.1・1.3）。
 *   見積依頼に紐づく受領見積書は、見積依頼が論理削除されていないものに限る
 * - 案件名は、案件があれば案件の名前、無ければ台帳の案件名（ledgerProjectName）を返す
 * - 絞り込み（4.2〜4.4）：文字（業者名・案件名・明細行の名称の部分一致。大文字と小文字を区別せず、
 *   `%`・`_`・`\` は文字として扱う）、見積日の期間（両端を含む）、案件の有無、採否、読取の確認、
 *   改修／新営、要確認（参考の印のある行を持つ）、分類キーの無い行がある（直接工事・産廃で分類キーが
 *   無い、または空の文字の行を持つ）、削除済みの案件を除く（4.9：案件が無いか、案件が論理削除されていない）
 * - 論理削除された案件の受領見積書も台帳の見積とし、一覧と詳細で `projectDeleted` を true にする（4.8）
 * - 並びは見積日の新しい順、同じ日は登録の新しい順（さらに同じなら ID の順）。1 ページ 50 件（4.5）
 * - 総件数は一覧と同じ条件で数える。合計（別途を除く。45.5）と参考の行の有無は、ページの見積の明細行を
 *   まとめて集計して求める（見積ごとに問い合わせない）
 *
 * Requirements (unit-price-ledger): 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9
 *
 * @module services/unit-price-ledger/ledger-query.service
 */

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  LEDGER_PAGE_SIZE,
  type LedgerFilter,
  type LedgerListQuery,
} from '../../schemas/unit-price-ledger.schema.js';
import type { LineItemCategory } from '../../schemas/received-quotation.schema.js';
import type {
  LineItemInfo,
  ReadingConfirmer,
  ReadingStatus,
} from '../received-quotation.service.js';

/** 採否（46.3） */
export type LedgerAdoption = 'ADOPTED' | 'REJECTED' | 'UNKNOWN';

/** 改修／新営（46.2） */
export type LedgerConstructionKind = 'RENOVATION' | 'NEW_CONSTRUCTION';

/**
 * 一覧の 1 件（4.1）
 */
export interface LedgerQuotationSummary {
  id: string;
  /** 受領見積書名 */
  name: string;
  vendorName: string;
  /** 見積日（提出日） */
  submittedAt: Date;
  /** 案件（案件の無い受領見積書は null） */
  projectId: string | null;
  /** 見積依頼（見積依頼の無い受領見積書は null） */
  estimateRequestId: string | null;
  /** 案件の名前、案件が無ければ台帳の案件名 */
  projectName: string | null;
  /** 案件が論理削除されている（4.8。案件の無い受領見積書は false） */
  projectDeleted: boolean;
  constructionKind: LedgerConstructionKind | null;
  /** 区分が別途の行を除いた金額の合計。金額を持つ別途以外の行が無ければ null（45.5） */
  totalAmount: number | null;
  adoption: LedgerAdoption;
  readingStatus: ReadingStatus;
  /** 参考の印のある明細行を 1 行以上持つ */
  hasReferenceLines: boolean;
  /** カードの ID（取り込んだ見積だけ） */
  ledgerCardId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 一覧のページ（4.5）
 */
export interface LedgerPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * 一覧の結果（GET /api/unit-price-ledger/quotations）
 */
export interface LedgerQuotationList {
  data: LedgerQuotationSummary[];
  pagination: LedgerPagination;
}

/**
 * 詳細（4.6。GET /api/unit-price-ledger/quotations/:id）
 */
export interface LedgerQuotationDetail {
  id: string;
  estimateRequestId: string | null;
  projectId: string | null;
  /** 案件の名前、案件が無ければ台帳の案件名 */
  projectName: string | null;
  /** 案件が論理削除されている（4.8。案件の無い受領見積書は false） */
  projectDeleted: boolean;
  name: string;
  vendorName: string;
  tradingPartnerId: string | null;
  submittedAt: Date;
  /** 原本のファイル（案件の受領見積書の登録で付けたもの） */
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  /** 見積の情報（46.1〜46.3・46.6・46.7・48.2） */
  quoteNumber: string | null;
  overallConditions: string | null;
  siteLocation: string | null;
  constructionKind: LedgerConstructionKind | null;
  useType: string | null;
  constructionPrice: number | null;
  workConditions: string | null;
  distanceKm: number | null;
  adoption: LedgerAdoption;
  confirmedAmount: number | null;
  readingStatus: ReadingStatus;
  readingConfirmedAt: Date | null;
  readingConfirmedBy: ReadingConfirmer | null;
  quoteDiscriminator: string;
  /** 台帳の情報（カードの ID・原本のパス・台帳の案件名） */
  ledgerCardId: string | null;
  ledgerSourcePath: string | null;
  ledgerProjectName: string | null;
  /** すべての明細行（表示順） */
  lineItems: LineItemInfo[];
  /** 区分が別途の行を除いた金額の合計（45.5） */
  totalAmount: number | null;
  hasReferenceLines: boolean;
  createdAt: Date;
  /** 修正・印の更新の排他（楽観的排他制御）に使う */
  updatedAt: Date;
}

/**
 * 台帳の一覧・詳細のサービスの依存
 */
export interface LedgerQueryServiceDependencies {
  prisma: PrismaClient;
}

/** 分類キーの無い行を数える区分（4.4） */
const CLASSIFIED_CATEGORIES: LineItemCategory[] = ['DIRECT', 'WASTE'];

/**
 * 台帳の見積の対象（1.1・1.3）：論理削除されていない受領見積書で、見積依頼があれば生きているもの。
 * 修正・削除（LedgerEditService）も、この条件に無い見積を不在として扱う
 */
export const LEDGER_BASE_WHERE: Prisma.ReceivedQuotationWhereInput = {
  deletedAt: null,
  OR: [{ estimateRequestId: null }, { estimateRequest: { is: { deletedAt: null } } }],
};

/** 参考の印のある明細行（4.3） */
const REFERENCE_LINE_WHERE: Prisma.ReceivedQuotationLineItemWhereInput = { isReference: true };

/** 直接工事・産廃で分類キーが無い、または空の文字の明細行（4.4） */
const MISSING_KEY_LINE_WHERE: Prisma.ReceivedQuotationLineItemWhereInput = {
  category: { in: CLASSIFIED_CATEGORIES },
  OR: [{ classificationKey: null }, { classificationKey: '' }],
};

/**
 * LIKE の印（`%`・`_`）と、PostgreSQL の LIKE の既定のエスケープの文字（`\`）を文字として扱う。
 * Prisma の `contains` は値をそのまま `%値%` の LIKE（`mode: 'insensitive'` は ILIKE）にするため、ここで逃がす
 */
export const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/** 案件が無いか、案件が論理削除されていない受領見積書（4.9） */
const LIVE_PROJECT_WHERE: Prisma.ReceivedQuotationWhereInput = {
  OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }],
};

/** 案件の名前と論理削除の日時（4.8 の削除済みの印に使う） */
const PROJECT_SELECT = { select: { name: true, deletedAt: true } } as const;

/** 見積日（YYYY-MM-DD）を DB の日付（UTC の 0 時）にする */
const toDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/**
 * 絞り込みを受領見積書の条件にする（書き出しも同じ条件を使う）
 *
 * @param filter - 台帳の絞り込み（`ledgerFilterSchema`・`ledgerListQuerySchema` の出力）
 */
export function buildLedgerWhere(filter: LedgerFilter): Prisma.ReceivedQuotationWhereInput {
  const conditions: Prisma.ReceivedQuotationWhereInput[] = [LEDGER_BASE_WHERE];

  if (filter.keyword !== undefined) {
    const contains = { contains: escapeLikePattern(filter.keyword), mode: 'insensitive' as const };
    conditions.push({
      OR: [
        { vendorName: contains },
        { project: { is: { name: contains } } },
        { projectId: null, ledgerProjectName: contains },
        { lineItems: { some: { name: contains } } },
      ],
    });
  }
  if (filter.submittedFrom !== undefined || filter.submittedTo !== undefined) {
    conditions.push({
      submittedAt: {
        ...(filter.submittedFrom !== undefined ? { gte: toDateOnly(filter.submittedFrom) } : {}),
        ...(filter.submittedTo !== undefined ? { lte: toDateOnly(filter.submittedTo) } : {}),
      },
    });
  }
  if (filter.hasProject !== undefined) {
    conditions.push({ projectId: filter.hasProject ? { not: null } : null });
  }
  if (filter.adoption !== undefined) {
    conditions.push({ adoption: filter.adoption });
  }
  if (filter.readingStatus !== undefined) {
    conditions.push({ readingStatus: filter.readingStatus });
  }
  if (filter.constructionKind !== undefined) {
    conditions.push({ constructionKind: filter.constructionKind });
  }
  if (filter.needsReview !== undefined) {
    conditions.push({
      lineItems: filter.needsReview
        ? { some: REFERENCE_LINE_WHERE }
        : { none: REFERENCE_LINE_WHERE },
    });
  }
  if (filter.missingClassificationKey !== undefined) {
    conditions.push({
      lineItems: filter.missingClassificationKey
        ? { some: MISSING_KEY_LINE_WHERE }
        : { none: MISSING_KEY_LINE_WHERE },
    });
  }
  if (filter.excludeDeletedProjects === true) {
    conditions.push(LIVE_PROJECT_WHERE);
  }

  return { AND: conditions };
}

/** 一覧の並び（4.1・design：見積日の新しい順、同じ日は登録の新しい順） */
export const LEDGER_ORDER_BY: Prisma.ReceivedQuotationOrderByWithRelationInput[] = [
  { submittedAt: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** Decimal・数・null を数にする */
const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** 案件の名前、無ければ台帳の案件名 */
const resolveProjectName = (
  project: { name: string } | null,
  ledgerProjectName: string | null
): string | null => (project ? project.name : ledgerProjectName);

/** 案件が論理削除されているか（4.8。案件の無い受領見積書は false） */
const isProjectDeleted = (project: { deletedAt?: Date | null } | null): boolean =>
  (project?.deletedAt ?? null) !== null;

/** 明細行の行を出力の形にする（換算は 4 つ揃うときだけ返す。45.8・45.9） */
const toLineItemInfo = (line: {
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
}): LineItemInfo => {
  const conversionQuantity = toNumberOrNull(line.conversionQuantity);
  const conversionUnitPrice = toNumberOrNull(line.conversionUnitPrice);
  return {
    id: line.id,
    receivedQuotationId: line.receivedQuotationId,
    sortOrder: line.sortOrder,
    customCategory: line.customCategory,
    workType: line.workType,
    name: line.name,
    specification: line.specification,
    unit: line.unit,
    quantity: toNumberOrNull(line.quantity),
    unitPrice: toNumberOrNull(line.unitPrice),
    amount: toNumberOrNull(line.amount),
    remarks: line.remarks,
    category: line.category,
    condition: line.condition,
    conversion:
      conversionQuantity !== null &&
      line.conversionUnit !== null &&
      conversionUnitPrice !== null &&
      line.conversionBasis !== null
        ? {
            quantity: conversionQuantity,
            unit: line.conversionUnit,
            unitPrice: conversionUnitPrice,
            basis: line.conversionBasis,
          }
        : null,
    classificationKey: line.classificationKey,
    quantityRowKey: line.quantityRowKey,
    isReference: line.isReference,
    referenceReason: line.referenceReason,
  };
};

/** 別途を除く金額の合計（45.5）。金額を持つ別途以外の行が無ければ null */
const sumTotalAmount = (lines: ReadonlyArray<LineItemInfo>): number | null => {
  const amounts = lines
    .filter((line) => line.category !== 'EXCLUDED' && line.amount !== null)
    .map((line) => line.amount as number);
  return amounts.length > 0 ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
};

/**
 * 台帳の一覧・絞り込み・詳細のサービス
 */
export class LedgerQueryService {
  private readonly prisma: PrismaClient;

  constructor(deps: LedgerQueryServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 台帳の一覧を返す（4.1〜4.5）
   *
   * @param query - 一覧の問い合わせ（`ledgerListQuerySchema` の出力）
   */
  async list(query: LedgerListQuery): Promise<LedgerQuotationList> {
    const { page, ...filter } = query;
    const where = buildLedgerWhere(filter);

    const [rows, total] = await Promise.all([
      this.prisma.receivedQuotation.findMany({
        where,
        orderBy: LEDGER_ORDER_BY,
        skip: (page - 1) * LEDGER_PAGE_SIZE,
        take: LEDGER_PAGE_SIZE,
        select: {
          id: true,
          name: true,
          vendorName: true,
          submittedAt: true,
          projectId: true,
          estimateRequestId: true,
          ledgerProjectName: true,
          constructionKind: true,
          adoption: true,
          readingStatus: true,
          ledgerCardId: true,
          createdAt: true,
          updatedAt: true,
          project: PROJECT_SELECT,
          _count: { select: { lineItems: { where: REFERENCE_LINE_WHERE } } },
        },
      }),
      this.prisma.receivedQuotation.count({ where }),
    ]);

    // 合計はページの見積の明細行を 1 回で集計する（別途を除く。金額の無い行は数えない）
    const totals =
      rows.length === 0
        ? []
        : await this.prisma.receivedQuotationLineItem.groupBy({
            by: ['receivedQuotationId'],
            where: {
              receivedQuotationId: { in: rows.map((row) => row.id) },
              category: { not: 'EXCLUDED' },
              amount: { not: null },
            },
            _sum: { amount: true },
          });
    const totalById = new Map(
      totals.map((entry) => [entry.receivedQuotationId, toNumberOrNull(entry._sum.amount)])
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        vendorName: row.vendorName,
        submittedAt: row.submittedAt,
        projectId: row.projectId,
        estimateRequestId: row.estimateRequestId,
        projectName: resolveProjectName(row.project, row.ledgerProjectName),
        projectDeleted: isProjectDeleted(row.project),
        constructionKind: row.constructionKind,
        totalAmount: totalById.get(row.id) ?? null,
        adoption: row.adoption,
        readingStatus: row.readingStatus,
        hasReferenceLines: row._count.lineItems > 0,
        ledgerCardId: row.ledgerCardId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      pagination: {
        page,
        limit: LEDGER_PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / LEDGER_PAGE_SIZE),
      },
    };
  }

  /**
   * 台帳の見積の詳細を返す（4.6）。論理削除された見積・論理削除された見積依頼の見積・存在しない ID は null
   *
   * @param id - 受領見積書の ID
   * @param client - 読むクライアント（修正の後に同じトランザクションで詳細を返すとき。既定は Prisma の接続）
   */
  async findById(
    id: string,
    client: Pick<Prisma.TransactionClient, 'receivedQuotation'> = this.prisma
  ): Promise<LedgerQuotationDetail | null> {
    const quotation = await client.receivedQuotation.findFirst({
      where: { AND: [{ id }, LEDGER_BASE_WHERE] },
      include: {
        lineItems: { orderBy: { sortOrder: 'asc' } },
        project: PROJECT_SELECT,
        readingConfirmedBy: { select: { id: true, displayName: true } },
      },
    });
    if (!quotation) {
      return null;
    }

    const lineItems = quotation.lineItems.map(toLineItemInfo);
    return {
      id: quotation.id,
      estimateRequestId: quotation.estimateRequestId,
      projectId: quotation.projectId,
      projectName: resolveProjectName(quotation.project, quotation.ledgerProjectName),
      projectDeleted: isProjectDeleted(quotation.project),
      name: quotation.name,
      vendorName: quotation.vendorName,
      tradingPartnerId: quotation.tradingPartnerId,
      submittedAt: quotation.submittedAt,
      fileName: quotation.fileName,
      fileMimeType: quotation.fileMimeType,
      fileSize: quotation.fileSize,
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
      readingConfirmedAt: quotation.readingConfirmedAt,
      readingConfirmedBy: quotation.readingConfirmedBy
        ? {
            id: quotation.readingConfirmedBy.id,
            displayName: quotation.readingConfirmedBy.displayName,
          }
        : null,
      quoteDiscriminator: quotation.quoteDiscriminator,
      ledgerCardId: quotation.ledgerCardId,
      ledgerSourcePath: quotation.ledgerSourcePath,
      ledgerProjectName: quotation.ledgerProjectName,
      lineItems,
      totalAmount: sumTotalAmount(lineItems),
      hasReferenceLines: lineItems.some((line) => line.isReference),
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }
}
