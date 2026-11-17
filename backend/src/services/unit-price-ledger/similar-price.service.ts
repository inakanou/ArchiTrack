/**
 * @fileoverview 似た単価の検索と並べ方（unit-price-ledger タスク2.8、design.md の SimilarPriceService）
 *
 * 見積の明細の内容から、台帳の見積の明細行のうち似た過去の単価の候補を選び、並べ、按分の内訳を添える。
 *
 * - 対象は論理削除されていない受領見積書（見積依頼があれば生きているもの）の、区分が直接工事か産廃の
 *   明細行（1.1・1.3・7.1）
 * - 第 1 群：問い合わせに分類キーがあり、明細行の分類キーと一致する（7.2）
 * - 第 2 群：第 1 群でなく、名称が問い合わせの名称を含む（大文字と小文字を区別せず、`%`・`_`・`\` は
 *   文字として扱う）か、近さが 0.3 以上（7.3・7.4）。近さ＝ GREATEST(similarity(名称と規格,
 *   問い合わせの名称と規格), word_similarity(問い合わせの名称と規格, 名称と規格))。名称と規格は空白でつなぐ
 * - 単位の指定があれば、単位（換算のある行は換算の単位）が一致するものだけ（7.5）
 * - 並べ方（7.6）：群 → 工種・改修／新営・場所の一致の数（多い順）→ 近さ（高い順）→ 見積日（新しい順）
 *   → 明細行の ID。最大 20 件。採否と読取の確認は並べ方に使わない（7.8）。時期で補正しない（7.10）
 * - 按分の内訳（8.x）は候補の見積の区分ごとの金額の合計から求める。合計は候補の見積をまとめて 1 回で集計する。
 *   単価を決められない行は、内訳の 4 つの金額が null で、按分の状態が `UNIT_PRICE_UNDETERMINED`（8.8）。
 *   整数に丸める前の 4 つの値も `allocation.unrounded` に添える（単価を決められない行は null。8.9）
 * - 検索は `$queryRaw` に値を結び付けて行う（文字を組み立てない）
 *
 * 閲覧範囲による表示制御（9.1〜9.4。タスク2.9）は `search` が担う。`findMatches` は表示制御の前の
 * 候補（案件の識別の元を `source` にまとめたもの）を返し、`search` が問い合わせた利用者の閲覧範囲で
 * API の候補へ写す
 * - 範囲内の案件の候補：案件名・案件の ID・受領見積書の ID を返す（9.1）
 * - 範囲外の案件の候補：案件名を「他案件」とし、案件の ID・受領見積書の ID・原本のパスを null にする。
 *   見積依頼は候補に含めない。参考の理由の文は自由な文で案件を特定できる情報を含みうるため null にし、
 *   参考の印は返す（9.2。タスク6.2）。業者名・見積日・明細行の内容・按分の内訳は返す（9.4）
 * - 案件の無い受領見積書の候補：台帳の案件名・受領見積書の ID・原本のパスを返す（9.3）
 * - 閲覧範囲は `ProjectScopeService.buildProjectScopeWhere` の条件で、候補の案件の ID をまとめて 1 回で引く。
 *   論理削除された案件は、全案件閲覧の権限があっても範囲外とする（`evaluateProjectAccess` と同じ）
 *
 * Requirements (unit-price-ledger): 1.1, 1.2, 1.3, 1.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11,
 *   8.8, 8.9, 9.1, 9.2, 9.3, 9.4
 *
 * @module services/unit-price-ledger/similar-price.service
 */

import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type {
  ReceivedQuotationAdoption,
  ReceivedQuotationLineCategory,
  ReceivedQuotationReadingStatus,
} from '../../generated/prisma/enums.js';
import type { SimilarPriceQuery } from '../../schemas/unit-price-ledger.schema.js';
import {
  getSharedProjectScopeService,
  type ProjectScopeService,
} from '../project-scope.service.js';
import {
  computeAllocation,
  type AllocationBreakdown,
  type CategoryTotals,
} from './ledger-allocation.js';
import { escapeLikePattern } from './ledger-query.service.js';

/** 近さの下限（design.md の SimilarPriceService、research.md の「似た単価の近さの測り方」） */
export const SIMILAR_PRICE_THRESHOLD = 0.3;

/** 返す候補の最大の件数（7.6） */
export const SIMILAR_PRICE_LIMIT = 20;

/** 閲覧範囲の外の案件の候補の案件名（9.2） */
export const OTHER_PROJECT_NAME = '他案件';

/** 候補の明細行の区分（7.1） */
export type SimilarPriceCategory = Extract<ReceivedQuotationLineCategory, 'DIRECT' | 'WASTE'>;

/**
 * 候補の見積の、案件を特定する元の情報。タスク2.9 の表示制御が、閲覧範囲に応じて
 * 案件名（範囲外は「他案件」）・案件の ID・受領見積書の ID・原本のパスを決めるのに使う
 */
export interface SimilarPriceSource {
  receivedQuotationId: string;
  /** 案件（案件の無い受領見積書は null） */
  projectId: string | null;
  /** 案件の名前（案件の無い受領見積書は null） */
  projectName: string | null;
  /** 台帳の案件名（案件の無い受領見積書の案件名） */
  ledgerProjectName: string | null;
  /** 原本のパス（案件の無い受領見積書の、Drive の 01_案件 からの相対） */
  ledgerSourcePath: string | null;
}

/**
 * 表示制御の前の候補（design.md の SimilarPriceCandidate から、案件の識別の 4 つの欄を `source` に替えたもの）
 */
export interface SimilarPriceMatch {
  lineItemId: string;
  vendorName: string;
  /** 見積日（YYYY-MM-DD。7.10） */
  submittedAt: string;
  name: string;
  specification: string | null;
  /** 単位（換算のある行は換算の単位） */
  unit: string | null;
  /** 数量（換算のある行は換算の数量） */
  quantity: string | null;
  category: SimilarPriceCategory;
  classificationKeyMatched: boolean;
  adoption: ReceivedQuotationAdoption;
  readingStatus: ReceivedQuotationReadingStatus;
  isReference: boolean;
  /** 参考の理由の文（表示制御の前。範囲外の案件の候補は `toCandidate` が null にする） */
  referenceReason: string | null;
  /** 按分の内訳（単価を決められない行は 4 つの金額と丸める前の値が null。8.8・8.9） */
  allocation: AllocationBreakdown;
  source: SimilarPriceSource;
}

/** 候補の、案件を特定できる情報の欄（閲覧範囲で出し分ける。9.1〜9.3） */
export interface SimilarPriceProjectFields {
  /** 案件名（範囲外は「他案件」、案件の無い受領見積書は台帳の案件名） */
  projectName: string | null;
  /** 案件の ID（範囲外と案件の無い受領見積書は null） */
  projectId: string | null;
  /** 受領見積書の ID（範囲外は null） */
  receivedQuotationId: string | null;
  /** 原本のパス（案件の無い受領見積書だけ） */
  ledgerSourcePath: string | null;
}

/**
 * 似た単価の候補（design.md の SimilarPriceCandidate。表示制御の後）
 *
 * 単位と数量は DB で空を許すため `string | null`
 */
export type SimilarPriceCandidate = Omit<SimilarPriceMatch, 'source'> & SimilarPriceProjectFields;

/**
 * 候補の案件が、問い合わせた利用者の閲覧範囲の外か（案件の無い受領見積書は範囲外にしない）
 *
 * @param source - 候補の案件の識別の元
 * @param visibleProjectIds - 問い合わせた利用者が閲覧できる、候補の案件の ID
 */
const isOutOfScope = (
  source: SimilarPriceSource,
  visibleProjectIds: ReadonlySet<string>
): boolean => source.projectId !== null && !visibleProjectIds.has(source.projectId);

/**
 * 表示制御の前の候補を、閲覧範囲に応じて API の候補に写す（9.1〜9.4）
 *
 * 範囲外の案件の候補は、案件の情報を隠し（`toProjectFields`）、参考の理由の文を null にする。
 * 参考の印は返す（9.2・9.4）
 *
 * @param match - 表示制御の前の候補
 * @param visibleProjectIds - 問い合わせた利用者が閲覧できる、候補の案件の ID
 */
export const toCandidate = (
  { source, ...rest }: SimilarPriceMatch,
  visibleProjectIds: ReadonlySet<string>
): SimilarPriceCandidate => ({
  ...rest,
  referenceReason: isOutOfScope(source, visibleProjectIds) ? null : rest.referenceReason,
  ...toProjectFields(source, visibleProjectIds),
});

/**
 * 似た単価のサービスの依存
 */
export interface SimilarPriceServiceDependencies {
  prisma: PrismaClient;
  /** 閲覧範囲（省略時は共有のインスタンス） */
  projectScopeService?: Pick<ProjectScopeService, 'buildProjectScopeWhere'>;
}

/** 検索の SQL の 1 行 */
interface SimilarPriceRow {
  lineItemId: string;
  receivedQuotationId: string;
  name: string;
  specification: string | null;
  unit: string | null;
  quantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  conversionQuantity: Prisma.Decimal | null;
  conversionUnit: string | null;
  conversionUnitPrice: Prisma.Decimal | null;
  category: SimilarPriceCategory;
  isReference: boolean;
  referenceReason: string | null;
  keyMatched: boolean;
  vendorName: string;
  submittedAt: Date;
  adoption: ReceivedQuotationAdoption;
  readingStatus: ReceivedQuotationReadingStatus;
  projectId: string | null;
  projectName: string | null;
  ledgerProjectName: string | null;
  ledgerSourcePath: string | null;
}

/** 名称と規格を空白でつなぐ（規格が無ければ名称だけ。SQL の concat_ws と同じつなぎ方） */
const joinNameAndSpecification = (name: string, specification: string | undefined): string =>
  specification ? `${name} ${specification}` : name;

/** 一致の数の 1 項（条件が無ければ 0） */
const matchTerm = (condition: Prisma.Sql | null): Prisma.Sql =>
  condition ? Prisma.sql`(CASE WHEN ${condition} THEN 1 ELSE 0 END)` : Prisma.sql`0`;

/** DB の日付（UTC の 0 時）を YYYY-MM-DD にする */
const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * 表示制御の前の候補の案件の情報を、閲覧範囲に応じて API の欄に写す（9.1〜9.3）
 *
 * @param source - 候補の案件の識別の元
 * @param visibleProjectIds - 問い合わせた利用者が閲覧できる、候補の案件の ID
 */
export const toProjectFields = (
  source: SimilarPriceSource,
  visibleProjectIds: ReadonlySet<string>
): SimilarPriceProjectFields => {
  if (source.projectId === null) {
    return {
      projectName: source.ledgerProjectName,
      projectId: null,
      receivedQuotationId: source.receivedQuotationId,
      ledgerSourcePath: source.ledgerSourcePath,
    };
  }
  if (visibleProjectIds.has(source.projectId)) {
    return {
      projectName: source.projectName,
      projectId: source.projectId,
      receivedQuotationId: source.receivedQuotationId,
      ledgerSourcePath: null,
    };
  }
  return {
    projectName: OTHER_PROJECT_NAME,
    projectId: null,
    receivedQuotationId: null,
    ledgerSourcePath: null,
  };
};

/**
 * 似た単価の検索のサービス
 */
export class SimilarPriceService {
  private readonly prisma: PrismaClient;
  private readonly projectScopeService:
    Pick<ProjectScopeService, 'buildProjectScopeWhere'> | undefined;

  constructor(deps: SimilarPriceServiceDependencies) {
    this.prisma = deps.prisma;
    this.projectScopeService = deps.projectScopeService;
  }

  /**
   * 似た単価の候補を、問い合わせた利用者の閲覧範囲で表示制御して返す（7.1〜7.11、9.1〜9.4）
   *
   * @param query - 似た単価の問い合わせ（`similarPriceQuerySchema` の出力）
   * @param userId - 問い合わせた利用者
   * @returns API の候補。無ければ空の一覧（7.11）
   */
  async search(query: SimilarPriceQuery, userId: string): Promise<SimilarPriceCandidate[]> {
    const matches = await this.findMatches(query);
    if (matches.length === 0) return [];

    const visibleProjectIds = await this.loadVisibleProjectIds(
      matches.flatMap((match) => (match.source.projectId === null ? [] : [match.source.projectId])),
      userId
    );

    return matches.map((match) => toCandidate(match, visibleProjectIds));
  }

  /**
   * 似た単価の候補を、並べた順に最大 20 件返す（表示制御の前。7.1〜7.11）
   *
   * @param query - 似た単価の問い合わせ（`similarPriceQuerySchema` の出力）
   * @returns 候補。無ければ空の一覧（7.11）
   */
  async findMatches(query: SimilarPriceQuery): Promise<SimilarPriceMatch[]> {
    const rows = await this.searchRows(query);
    if (rows.length === 0) return [];

    const totalsByQuotation = await this.loadCategoryTotals(
      Array.from(new Set(rows.map((row) => row.receivedQuotationId)))
    );

    return rows.map((row) => {
      const hasConversion = row.conversionUnit !== null;
      return {
        lineItemId: row.lineItemId,
        vendorName: row.vendorName,
        submittedAt: toDateString(row.submittedAt),
        name: row.name,
        specification: row.specification,
        unit: hasConversion ? row.conversionUnit : row.unit,
        quantity: (hasConversion ? row.conversionQuantity : row.quantity)?.toString() ?? null,
        category: row.category,
        classificationKeyMatched: row.keyMatched,
        adoption: row.adoption,
        readingStatus: row.readingStatus,
        isReference: row.isReference,
        referenceReason: row.referenceReason,
        allocation: computeAllocation(
          {
            conversionUnitPrice: row.conversionUnitPrice,
            unitPrice: row.unitPrice,
            amount: row.amount,
            quantity: row.quantity,
          },
          totalsByQuotation.get(row.receivedQuotationId) ?? {}
        ),
        source: {
          receivedQuotationId: row.receivedQuotationId,
          projectId: row.projectId,
          projectName: row.projectName,
          ledgerProjectName: row.ledgerProjectName,
          ledgerSourcePath: row.ledgerSourcePath,
        },
      };
    });
  }

  /**
   * 候補の明細行を選んで並べる（1 回の SQL）
   */
  private searchRows(query: SimilarPriceQuery): Promise<SimilarPriceRow[]> {
    const queryText = joinNameAndSpecification(query.name, query.specification);
    const namePattern = `%${escapeLikePattern(query.name)}%`;

    const keyMatched =
      query.classificationKey !== undefined
        ? Prisma.sql`(li.classification_key IS NOT NULL AND li.classification_key = ${query.classificationKey})`
        : Prisma.sql`FALSE`;

    const matchCount = Prisma.sql`${matchTerm(
      query.workType !== undefined ? Prisma.sql`li."workType" = ${query.workType}` : null
    )} + ${matchTerm(
      query.constructionKind !== undefined
        ? Prisma.sql`rq.construction_kind::text = ${query.constructionKind}`
        : null
    )} + ${matchTerm(
      query.siteLocation !== undefined
        ? Prisma.sql`rq.site_location ILIKE ${`%${escapeLikePattern(query.siteLocation)}%`}`
        : null
    )}`;

    const unitCondition =
      query.unit !== undefined
        ? Prisma.sql`AND COALESCE(li.conversion_unit, li.unit) = ${query.unit}`
        : Prisma.empty;

    return this.prisma.$queryRaw<SimilarPriceRow[]>`
      SELECT * FROM (
        SELECT
          li.id AS "lineItemId",
          li."receivedQuotationId" AS "receivedQuotationId",
          li.name,
          li.specification,
          li.unit,
          li.quantity,
          li."unitPrice" AS "unitPrice",
          li.amount,
          li.conversion_quantity AS "conversionQuantity",
          li.conversion_unit AS "conversionUnit",
          li.conversion_unit_price AS "conversionUnitPrice",
          li.category::text AS category,
          li.is_reference AS "isReference",
          li.reference_reason AS "referenceReason",
          ${keyMatched} AS "keyMatched",
          GREATEST(
            similarity(concat_ws(' ', li.name, NULLIF(li.specification, '')), ${queryText}),
            word_similarity(${queryText}, concat_ws(' ', li.name, NULLIF(li.specification, '')))
          ) AS similarity,
          (${matchCount}) AS "matchCount",
          rq.vendor_name AS "vendorName",
          rq."submittedAt" AS "submittedAt",
          rq.adoption::text AS adoption,
          rq.reading_status::text AS "readingStatus",
          rq.project_id AS "projectId",
          p.name AS "projectName",
          rq.ledger_project_name AS "ledgerProjectName",
          rq.ledger_source_path AS "ledgerSourcePath"
        FROM received_quotation_line_items li
        JOIN received_quotations rq ON rq.id = li."receivedQuotationId"
        LEFT JOIN estimate_requests er ON er.id = rq."estimateRequestId"
        LEFT JOIN projects p ON p.id = rq.project_id
        WHERE rq."deletedAt" IS NULL
          AND (rq."estimateRequestId" IS NULL OR er."deletedAt" IS NULL)
          AND li.category IN ('DIRECT', 'WASTE')
          ${unitCondition}
      ) c
      WHERE c."keyMatched"
         OR c.name ILIKE ${namePattern}
         OR c.similarity >= ${SIMILAR_PRICE_THRESHOLD}::real
      ORDER BY c."keyMatched" DESC, c."matchCount" DESC, c.similarity DESC,
               c."submittedAt" DESC, c."lineItemId" ASC
      LIMIT ${SIMILAR_PRICE_LIMIT}
    `;
  }

  /**
   * 候補の案件のうち、利用者が閲覧できる（論理削除されていない）案件の ID をまとめて 1 回で引く
   */
  private async loadVisibleProjectIds(projectIds: string[], userId: string): Promise<Set<string>> {
    const ids = Array.from(new Set(projectIds));
    if (ids.length === 0) return new Set();

    const scopeWhere = await (
      this.projectScopeService ?? getSharedProjectScopeService()
    ).buildProjectScopeWhere(userId);
    const visible = await this.prisma.project.findMany({
      where: { id: { in: ids }, deletedAt: null, ...(scopeWhere ?? {}) },
      select: { id: true },
    });
    return new Set(visible.map((project) => project.id));
  }

  /**
   * 候補の見積ごとの、明細行の区分ごとの金額の合計（按分の基準と率の元。8.2・8.3）
   */
  private async loadCategoryTotals(
    receivedQuotationIds: string[]
  ): Promise<Map<string, CategoryTotals>> {
    const sums = await this.prisma.receivedQuotationLineItem.groupBy({
      by: ['receivedQuotationId', 'category'],
      where: { receivedQuotationId: { in: receivedQuotationIds }, amount: { not: null } },
      _sum: { amount: true },
    });
    const totals = new Map<string, CategoryTotals>();
    for (const entry of sums) {
      const current = totals.get(entry.receivedQuotationId) ?? {};
      current[entry.category] = entry._sum.amount;
      totals.set(entry.receivedQuotationId, current);
    }
    return totals;
  }
}
