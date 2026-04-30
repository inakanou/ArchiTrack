/**
 * @fileoverview 出来高サービス
 *
 * 施工日ごとの出来高入力・履歴管理を担当します。
 *
 * Requirements (execution-budget-management):
 * - 11.1, 11.2, 11.9, 11.10, 11.11: 出来高入力機能
 * - 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7: 出来高の履歴管理
 * - 16.1, 16.2, 16.3: 月別出来高集計
 *
 * Task 4.1: 出来高入力・履歴管理サービス実装
 * Task 4.2: 月別出来高集計サービス実装
 *
 * @module services/progress
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ProgressRecordNotFoundError,
  ExecutionBudgetNotFoundForProgressError,
  ProgressAmountNegativeError,
} from '../errors/progressError.js';

/**
 * ProgressService依存関係
 */
export interface ProgressServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 出来高保存入力
 */
export interface SaveProgressInput {
  constructionDate: string;
  items: Array<{
    itemId: string;
    amount: string;
  }>;
}

/**
 * 出来高項目レスポンス
 */
export interface ProgressItemResult {
  id: string;
  progressRecordId: string;
  executionBudgetItemId: string;
  amount: string;
  progressRate: string;
}

/**
 * 出来高レコードレスポンス（項目一覧含む）
 */
export interface ProgressRecordResult {
  id: string;
  executionBudgetId: string;
  constructionDate: Date;
  createdAt: Date;
  updatedAt: Date;
  items: ProgressItemResult[];
  totalAmount: string;
  totalRate: string;
}

/**
 * 出来高履歴サマリー
 */
export interface ProgressRecordSummary {
  id: string;
  executionBudgetId: string;
  constructionDate: Date;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
  /** 出来高金額の項目合計（履歴一覧に表示する用途） */
  totalAmount: string;
}

/**
 * 月別出来高項目別明細
 *
 * Requirements: 16.3 - 特定月の項目別出来高明細を返す
 */
export interface MonthlyProgressDetailItem {
  executionBudgetItemId: string;
  itemName: string | null;
  executionAmount: string | null;
  progressAmount: string;
  progressRate: string;
}

/**
 * 月別出来高集計サマリー
 *
 * Requirements: 16.1, 16.2
 */
export interface MonthlyProgressSummary {
  yearMonth: string;
  monthlyAmount: string;
  cumulativeAmount: string;
  cumulativeRate: string;
}

/**
 * SQLクエリ結果の行型（月別出来高集計）
 */
interface MonthlyAggregationRow {
  year_month: string;
  monthly_amount: string;
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 出来高サービス
 *
 * 出来高のCRUD操作を担当します。
 */
export class ProgressService {
  private readonly prisma: PrismaClient;

  constructor(deps: ProgressServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 出来高を保存する（新規作成または上書き保存）
   *
   * トランザクション内で以下を実行:
   * 1. 実行予算の存在チェック
   * 2. 出来高金額のバリデーション（0円未満チェック）
   * 3. 同一施工日の既存レコード有無チェック
   * 4. 既存レコードがあれば項目を削除して再作成（upsert）
   * 5. 新規レコードなら作成
   * 6. 出来高率を自動計算してレスポンスを返却
   *
   * Requirements: 11.1, 11.2, 11.9, 11.10, 11.11, 12.1, 12.2
   *
   * @param executionBudgetId - 実行予算ID
   * @param input - 出来高保存入力
   * @returns 出来高レコード（項目一覧・合計値含む）
   * @throws ExecutionBudgetNotFoundForProgressError 実行予算が存在しない場合
   * @throws ProgressAmountNegativeError 出来高金額が0円未満の場合
   */
  async save(executionBudgetId: string, input: SaveProgressInput): Promise<ProgressRecordResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { id: executionBudgetId, deletedAt: null },
      });

      if (!budget) {
        throw new ExecutionBudgetNotFoundForProgressError();
      }

      // 2. 出来高金額のバリデーション（0円未満チェック）
      for (const item of input.items) {
        const amount = new Decimal(item.amount);
        if (amount.isNegative()) {
          throw new ProgressAmountNegativeError();
        }
      }

      // 3. 実行予算項目を取得（出来高率計算用）
      const budgetItems = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId },
      });

      // 4. 同一施工日の既存レコードチェック
      const constructionDate = new Date(input.constructionDate);
      const existingRecord = await tx.progressRecord.findFirst({
        where: {
          executionBudgetId,
          constructionDate,
        },
      });

      let recordId: string;
      let recordData: { constructionDate: Date; createdAt: Date; updatedAt: Date };

      if (existingRecord) {
        // 既存レコードの項目を削除して再作成（upsert）
        recordId = existingRecord.id;
        recordData = {
          constructionDate: existingRecord.constructionDate,
          createdAt: existingRecord.createdAt,
          updatedAt: existingRecord.updatedAt,
        };
        await tx.progressRecordItem.deleteMany({
          where: { progressRecordId: existingRecord.id },
        });
      } else {
        // 新規レコード作成
        const newRecord = await tx.progressRecord.create({
          data: {
            executionBudgetId,
            constructionDate,
          },
        });
        recordId = newRecord.id;
        recordData = {
          constructionDate: newRecord.constructionDate,
          createdAt: newRecord.createdAt,
          updatedAt: newRecord.updatedAt,
        };
      }

      // 5. 出来高項目を一括作成
      await tx.progressRecordItem.createMany({
        data: input.items.map((item) => ({
          progressRecordId: recordId,
          executionBudgetItemId: item.itemId,
          amount: new Decimal(item.amount),
        })),
      });

      // 6. 作成した項目を取得してレスポンスを構築
      const createdItems = await tx.progressRecordItem.findMany({
        where: { progressRecordId: recordId },
        include: { executionBudgetItem: true },
      });

      // 出来高率の計算と合計値の算出
      const budgetItemMap = new Map(budgetItems.map((bi) => [bi.id, bi]));

      let totalAmount = new Decimal(0);
      let totalExecutionAmount = new Decimal(0);

      const items: ProgressItemResult[] = createdItems.map((ci) => {
        const amount = new Decimal(ci.amount.toString());
        totalAmount = totalAmount.plus(amount);

        const budgetItem = budgetItemMap.get(ci.executionBudgetItemId);
        const executionAmount = budgetItem?.executionAmount
          ? new Decimal(budgetItem.executionAmount.toString())
          : new Decimal(0);

        totalExecutionAmount = totalExecutionAmount.plus(executionAmount);

        const progressRate = executionAmount.isZero()
          ? '0.0'
          : amount.dividedBy(executionAmount).times(100).toFixed(1);

        return {
          id: ci.id,
          progressRecordId: ci.progressRecordId,
          executionBudgetItemId: ci.executionBudgetItemId,
          amount: amount.toString(),
          progressRate,
        };
      });

      // 全体の出来高合計率
      const totalRate = totalExecutionAmount.isZero()
        ? '0.0'
        : totalAmount.dividedBy(totalExecutionAmount).times(100).toFixed(1);

      return {
        id: recordId,
        executionBudgetId,
        constructionDate: recordData.constructionDate,
        createdAt: recordData.createdAt,
        updatedAt: recordData.updatedAt,
        items,
        totalAmount: totalAmount.toString(),
        totalRate,
      };
    });
  }

  /**
   * 出来高履歴一覧を施工日の降順で取得する
   *
   * Requirements: 12.3
   *
   * @param executionBudgetId - 実行予算ID
   * @returns 出来高履歴サマリー一覧
   */
  async findByExecutionBudgetId(executionBudgetId: string): Promise<ProgressRecordSummary[]> {
    const records = await this.prisma.progressRecord.findMany({
      where: { executionBudgetId },
      orderBy: { constructionDate: 'desc' },
      include: {
        _count: {
          select: { items: true },
        },
        items: {
          select: { amount: true },
        },
      },
    });

    return records.map((r) => {
      const items = (r as unknown as { items: Array<{ amount: { toString(): string } }> }).items;
      const totalAmount = items
        .reduce((sum, it) => sum.plus(new Decimal(it.amount.toString())), new Decimal(0))
        .toString();
      return {
        id: r.id,
        executionBudgetId: r.executionBudgetId,
        constructionDate: r.constructionDate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        itemCount: (r as unknown as { _count: { items: number } })._count.items,
        totalAmount,
      };
    });
  }

  /**
   * 指定した施工日の出来高レコードを取得する
   *
   * Requirements: 12.4
   *
   * @param executionBudgetId - 実行予算ID
   * @param constructionDate - 施工日
   * @returns 出来高レコード（項目一覧・出来高率含む）
   * @throws ProgressRecordNotFoundError レコードが存在しない場合
   */
  async getByDate(
    executionBudgetId: string,
    constructionDate: Date
  ): Promise<ProgressRecordResult> {
    const record = await this.prisma.progressRecord.findFirst({
      where: {
        executionBudgetId,
        constructionDate,
      },
      include: {
        items: {
          include: {
            executionBudgetItem: true,
          },
        },
      },
    });

    if (!record) {
      throw new ProgressRecordNotFoundError();
    }

    // 実行予算項目を取得（出来高率計算用）
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const budgetItems = await (this.prisma.executionBudgetItem.findMany as Function)({
      where: { executionBudgetId },
    });

    const budgetItemMap = new Map(
      (budgetItems as Array<{ id: string; executionAmount: { toString(): string } | null }>).map(
        (bi) => [bi.id, bi]
      )
    );

    let totalAmount = new Decimal(0);
    let totalExecutionAmount = new Decimal(0);

    const items: ProgressItemResult[] = record.items.map((ci) => {
      const amount = new Decimal(ci.amount.toString());
      totalAmount = totalAmount.plus(amount);

      const budgetItem = budgetItemMap.get(ci.executionBudgetItemId);
      const executionAmount = budgetItem?.executionAmount
        ? new Decimal(budgetItem.executionAmount.toString())
        : new Decimal(0);

      totalExecutionAmount = totalExecutionAmount.plus(executionAmount);

      const progressRate = executionAmount.isZero()
        ? '0.0'
        : amount.dividedBy(executionAmount).times(100).toFixed(1);

      return {
        id: ci.id,
        progressRecordId: ci.progressRecordId,
        executionBudgetItemId: ci.executionBudgetItemId,
        amount: amount.toString(),
        progressRate,
      };
    });

    const totalRate = totalExecutionAmount.isZero()
      ? '0.0'
      : totalAmount.dividedBy(totalExecutionAmount).times(100).toFixed(1);

    return {
      id: record.id,
      executionBudgetId: record.executionBudgetId,
      constructionDate: record.constructionDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      items,
      totalAmount: totalAmount.toString(),
      totalRate,
    };
  }

  /**
   * 出来高レコードを削除する
   *
   * Requirements: 12.5, 12.6
   *
   * @param progressRecordId - 出来高レコードID
   * @throws ProgressRecordNotFoundError レコードが存在しない場合
   */
  async delete(progressRecordId: string): Promise<void> {
    const record = await this.prisma.progressRecord.findUnique({
      where: { id: progressRecordId },
    });

    if (!record) {
      throw new ProgressRecordNotFoundError();
    }

    await this.prisma.progressRecord.delete({
      where: { id: progressRecordId },
    });
  }

  /**
   * 最新施工日における各項目の出来高金額を取得する
   *
   * 実行予算一覧の出来高金額列に反映するためのデータを返却する。
   *
   * Requirements: 12.7
   *
   * @param executionBudgetId - 実行予算ID
   * @returns Map<executionBudgetItemId, amount> または null（レコードなしの場合）
   */
  async getLatestProgressByBudgetId(
    executionBudgetId: string
  ): Promise<Map<string, string> | null> {
    const latestRecord = await this.prisma.progressRecord.findFirst({
      where: { executionBudgetId },
      orderBy: { constructionDate: 'desc' },
      include: {
        items: true,
      },
    });

    if (!latestRecord) {
      return null;
    }

    const resultMap = new Map<string, string>();
    for (const item of latestRecord.items) {
      resultMap.set(item.executionBudgetItemId, item.amount.toString());
    }

    return resultMap;
  }

  /**
   * 月別出来高集計を取得する
   *
   * SQLレベルのGROUP BY集計で月別データを効率的に取得し、
   * 各月の当月出来高金額・累計出来高金額・累計出来高率を算出する。
   *
   * Requirements: 16.1, 16.2
   *
   * @param executionBudgetId - 実行予算ID
   * @returns 月別出来高集計サマリー一覧（月の昇順）
   * @throws ExecutionBudgetNotFoundForProgressError 実行予算が存在しない場合
   */
  async getMonthlyAggregation(executionBudgetId: string): Promise<MonthlyProgressSummary[]> {
    // 1. 実行予算の存在チェック
    const budget = await this.prisma.executionBudget.findFirst({
      where: { id: executionBudgetId, deletedAt: null },
    });

    if (!budget) {
      throw new ExecutionBudgetNotFoundForProgressError();
    }

    // 2. 実行予算項目の実行金額合計を取得（累計出来高率の分母）
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const budgetItems = await (this.prisma.executionBudgetItem.findMany as Function)({
      where: { executionBudgetId },
    });

    let totalExecutionAmount = new Decimal(0);
    for (const item of budgetItems as Array<{
      executionAmount: { toString(): string } | null;
    }>) {
      if (item.executionAmount) {
        totalExecutionAmount = totalExecutionAmount.plus(
          new Decimal(item.executionAmount.toString())
        );
      }
    }

    // 3. SQLレベルのGROUP BY集計で月別出来高データを取得
    const rows = (await this.prisma.$queryRaw`
      SELECT
        to_char(pr."constructionDate", 'YYYY-MM') AS year_month,
        CAST(SUM(pri.amount) AS TEXT) AS monthly_amount
      FROM progress_records pr
      INNER JOIN progress_record_items pri ON pri."progressRecordId" = pr.id
      WHERE pr."executionBudgetId" = ${executionBudgetId}
      GROUP BY to_char(pr."constructionDate", 'YYYY-MM')
      ORDER BY year_month ASC
    `) as MonthlyAggregationRow[];

    // 4. 累計出来高金額・累計出来高率を算出
    let cumulativeAmount = new Decimal(0);

    return rows.map((row) => {
      const monthlyAmount = new Decimal(row.monthly_amount);
      cumulativeAmount = cumulativeAmount.plus(monthlyAmount);

      const cumulativeRate = totalExecutionAmount.isZero()
        ? '0.0'
        : cumulativeAmount.dividedBy(totalExecutionAmount).times(100).toFixed(1);

      return {
        yearMonth: row.year_month,
        monthlyAmount: monthlyAmount.toString(),
        cumulativeAmount: cumulativeAmount.toString(),
        cumulativeRate,
      };
    });
  }

  /**
   * 特定月の項目別出来高明細を取得する
   *
   * 指定月に含まれる全出来高レコードの項目別明細を返却する。
   *
   * Requirements: 16.3
   *
   * @param executionBudgetId - 実行予算ID
   * @param yearMonth - 対象月（YYYY-MM形式）
   * @returns 出来高レコード一覧（項目別出来高率含む）
   * @throws ExecutionBudgetNotFoundForProgressError 実行予算が存在しない場合
   */
  async getMonthlyDetail(
    executionBudgetId: string,
    yearMonth: string
  ): Promise<MonthlyProgressDetailItem[]> {
    // 1. 実行予算の存在チェック
    const budget = await this.prisma.executionBudget.findFirst({
      where: { id: executionBudgetId, deletedAt: null },
    });

    if (!budget) {
      throw new ExecutionBudgetNotFoundForProgressError();
    }

    // 2. 実行予算項目を取得（項目名・実行金額を引くため）
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const budgetItems = await (this.prisma.executionBudgetItem.findMany as Function)({
      where: { executionBudgetId },
    });

    // 3. 対象月の日付範囲を計算
    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
    const nextMonth = month === 12 ? 1 : month! + 1;
    const nextYear = month === 12 ? year! + 1 : year;
    const endDate = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);

    // 4. 対象月の出来高レコードを取得
    const records = await this.prisma.progressRecord.findMany({
      where: {
        executionBudgetId,
        constructionDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: { constructionDate: 'asc' },
      include: {
        items: {
          select: {
            executionBudgetItemId: true,
            amount: true,
          },
        },
      },
    });

    // 5. 月内の出来高項目を `executionBudgetItemId` ごとに合計（REQ-16.3 項目別明細）
    const itemTotals = new Map<string, Decimal>();
    for (const record of records) {
      for (const ci of record.items) {
        const cur = itemTotals.get(ci.executionBudgetItemId) ?? new Decimal(0);
        itemTotals.set(ci.executionBudgetItemId, cur.plus(new Decimal(ci.amount.toString())));
      }
    }

    // 6. 項目別レスポンスを構築（実行予算項目の displayOrder 順を維持するため
    //    budgetItems の並びに沿って出力する）
    return (
      budgetItems as Array<{
        id: string;
        name: string | null;
        executionAmount: { toString(): string } | null;
      }>
    )
      .filter((bi) => itemTotals.has(bi.id))
      .map((bi) => {
        const total = itemTotals.get(bi.id) ?? new Decimal(0);
        const executionAmount = bi.executionAmount
          ? new Decimal(bi.executionAmount.toString())
          : new Decimal(0);
        const progressRate = executionAmount.isZero()
          ? '0.0'
          : total.dividedBy(executionAmount).times(100).toFixed(1);
        return {
          executionBudgetItemId: bi.id,
          itemName: bi.name ?? null,
          executionAmount: bi.executionAmount?.toString() ?? null,
          progressAmount: total.toString(),
          progressRate,
        };
      });
  }
}
