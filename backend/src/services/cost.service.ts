/**
 * @fileoverview 原価管理サービス
 *
 * 各実行予算項目の支出実績（今月の支出）を管理します。
 * 累計支出、残予算の自動計算、支出超過警告、出来高対支出比率の算出を行います。
 *
 * Requirements (execution-budget-management):
 * - 13.1: 各実行予算項目に対して「先月までの支出」「今月の支出」「累計支出」列を表示する
 * - 13.2: 今月の支出を入力→累計支出（先月までの支出 + 今月の支出）を自動計算して更新する
 * - 13.5: 各項目の実行金額と累計支出の差額（残予算）を自動計算して表示する
 * - 13.6: 累計支出が実行金額を超過した場合、警告フラグを設定する
 * - 13.7: 全項目の累計支出合計と残予算合計を合計行に表示する
 * - 13.8: 出来高金額と累計支出の比率（出来高対支出比率）を算出する
 *
 * Task 5.1: 原価管理サービス実装
 *
 * @module services/cost
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ExecutionBudgetNotFoundError,
  ExecutionBudgetConflictError,
} from '../errors/executionBudgetError.js';

/**
 * CostService依存関係
 */
export interface CostServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 原価更新入力
 */
export interface UpdateCostInput {
  currentMonthExpense: string;
  version: number;
}

/**
 * 原価更新結果
 *
 * 累計支出、残予算、超過フラグ、出来高対支出比率を含む
 */
export interface CostUpdateResult {
  /** 項目ID */
  id: string;
  /** 今月の支出（更新後） */
  currentMonthExpense: string;
  /** 先月までの支出 */
  previousMonthExpense: string;
  /** 累計支出（先月までの支出 + 今月の支出） */
  totalExpense: string;
  /** 残予算（実行金額 - 累計支出）、実行金額がnullの場合はnull */
  remainingBudget: string | null;
  /** 累計支出が実行金額を超過している場合true */
  isOverBudget: boolean;
  /** 出来高対支出比率（出来高金額 / 累計支出 * 100）、算出不可の場合はnull */
  progressToExpenseRatio: string | null;
  /** 楽観的排他制御バージョン（インクリメント後） */
  version: number;
}

/**
 * 原価管理サービス
 *
 * 各実行予算項目の支出実績（今月の支出）を管理し、
 * 累計支出・残予算の自動計算、支出超過警告、出来高対支出比率の算出を行います。
 */
export class CostService {
  private readonly prisma: PrismaClient;

  constructor(deps: CostServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 実行予算項目の今月の支出を更新する
   *
   * 以下を自動計算して返却する:
   * - 累計支出 = 先月までの支出 + 今月の支出
   * - 残予算 = 実行金額 - 累計支出
   * - 超過フラグ = 累計支出 > 実行金額
   * - 出来高対支出比率 = 出来高金額 / 累計支出 * 100
   *
   * Requirements: 13.1, 13.2, 13.5, 13.6, 13.8
   *
   * @param itemId - 実行予算項目ID
   * @param data - 更新データ（今月の支出、バージョン）
   * @returns 原価更新結果（計算済みフィールド含む）
   * @throws ExecutionBudgetNotFoundError 項目が存在しない、または論理削除済みの場合
   * @throws ExecutionBudgetConflictError バージョン不一致の場合
   */
  async updateCost(itemId: string, data: UpdateCostInput): Promise<CostUpdateResult> {
    // 1. 項目の存在チェックと実行予算の取得
    const existing = await this.prisma.executionBudgetItem.findUnique({
      where: { id: itemId },
      include: {
        executionBudget: {
          select: { id: true, version: true, deletedAt: true },
        },
      },
    });

    if (!existing || existing.executionBudget.deletedAt !== null) {
      throw new ExecutionBudgetNotFoundError();
    }

    // 2. 楽観的排他制御: バージョンチェック
    if (existing.executionBudget.version !== data.version) {
      throw new ExecutionBudgetConflictError(undefined, {
        expectedVersion: data.version,
        actualVersion: existing.executionBudget.version,
      });
    }

    // 3. 項目のcurrentMonthExpenseを更新
    await this.prisma.executionBudgetItem.update({
      where: { id: itemId },
      data: { currentMonthExpense: data.currentMonthExpense },
    });

    // 4. ExecutionBudgetのバージョンをインクリメント
    const updatedBudget = await this.prisma.executionBudget.update({
      where: { id: existing.executionBudget.id },
      data: { version: { increment: 1 } },
    });

    // 5. 累計支出の計算
    const previousMonthExpense = new Decimal(existing.previousMonthExpense?.toString() ?? '0');
    const currentMonthExpense = new Decimal(data.currentMonthExpense);
    const totalExpense = previousMonthExpense.add(currentMonthExpense);

    // 6. 残予算と超過フラグの計算
    const executionAmountStr = existing.executionAmount?.toString() ?? null;
    let remainingBudget: string | null = null;
    let isOverBudget = false;

    if (executionAmountStr !== null) {
      const executionAmount = new Decimal(executionAmountStr);
      remainingBudget = executionAmount.sub(totalExpense).toFixed(0);
      isOverBudget = totalExpense.greaterThan(executionAmount);
    }

    // 7. 出来高対支出比率の算出
    const progressToExpenseRatio = await this.calculateProgressToExpenseRatio(
      itemId,
      existing.executionBudget.id,
      totalExpense
    );

    return {
      id: itemId,
      currentMonthExpense: currentMonthExpense.toFixed(0),
      previousMonthExpense: previousMonthExpense.toFixed(0),
      totalExpense: totalExpense.toFixed(0),
      remainingBudget,
      isOverBudget,
      progressToExpenseRatio,
      version: updatedBudget.version,
    };
  }

  /**
   * 出来高対支出比率を算出する
   *
   * 最新施工日の出来高レコードから該当項目の出来高金額を取得し、
   * 累計支出との比率を計算する。
   *
   * Requirement: 13.8
   *
   * @param itemId - 実行予算項目ID
   * @param executionBudgetId - 実行予算ID
   * @param totalExpense - 累計支出
   * @returns 出来高対支出比率（%）の文字列、算出不可の場合はnull
   * @private
   */
  private async calculateProgressToExpenseRatio(
    itemId: string,
    executionBudgetId: string,
    totalExpense: Decimal
  ): Promise<string | null> {
    // 累計支出が0の場合は比率を算出できない
    if (totalExpense.isZero()) {
      return null;
    }

    // 最新施工日の出来高レコードから該当項目の出来高金額を取得
    const latestProgressItem = await this.prisma.progressRecordItem.findFirst({
      where: {
        executionBudgetItemId: itemId,
        progressRecord: {
          executionBudgetId,
        },
      },
      orderBy: {
        progressRecord: {
          constructionDate: 'desc',
        },
      },
      select: {
        amount: true,
      },
    });

    if (!latestProgressItem) {
      return null;
    }

    const progressAmount = new Decimal(latestProgressItem.amount.toString());

    // 出来高対支出比率 = 出来高金額 / 累計支出 * 100
    const ratio = progressAmount.div(totalExpense).mul(100);
    return ratio.toFixed(1);
  }
}
