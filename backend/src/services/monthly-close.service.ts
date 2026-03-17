/**
 * @fileoverview 月次締めサービス
 *
 * 月次締め処理の実行と履歴管理を担当します。
 * 全項目のcurrentMonthExpenseをpreviousMonthExpenseに累積し、
 * currentMonthExpenseを0にリセットします。
 *
 * Requirements (execution-budget-management):
 * - 13.3: 月次締め操作で今月の支出を先月までの支出に累積する
 * - 13.4: 月次締め完了後、今月の支出をリセットする
 * - 14.1: 月次締めボタンを提供する
 * - 14.2: 締め対象月と処理内容の確認ダイアログを表示する
 * - 14.3: 締め処理を実行し、締め日時と対象月を履歴として記録する
 * - 14.4: 月次締め履歴を一覧表示する
 * - 14.5: 同一月に対して重複締めを阻止する
 *
 * Task 5.2: 月次締めサービス実装
 *
 * @module services/monthly-close
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  ExecutionBudgetNotFoundError,
  MonthlyCloseAlreadyExistsError,
} from '../errors/executionBudgetError.js';

/**
 * MonthlyCloseService依存関係
 */
export interface MonthlyCloseServiceDependencies {
  prisma: PrismaClient;
}

/**
 * 月次締め履歴レスポンス
 */
export interface MonthlyCloseHistoryResult {
  id: string;
  executionBudgetId: string;
  targetMonth: string;
  closedById: string;
  closedAt: Date;
  closedBy?: { id: string; displayName: string };
}

/**
 * Prismaトランザクションクライアント型
 */
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * 月次締めサービス
 *
 * 月次締め処理の実行と履歴管理を行います。
 * トランザクション内で全項目の支出累積とリセット、履歴作成を一括で実行します。
 */
export class MonthlyCloseService {
  private readonly prisma: PrismaClient;

  constructor(deps: MonthlyCloseServiceDependencies) {
    this.prisma = deps.prisma;
  }

  /**
   * 月次締め処理を実行する
   *
   * トランザクション内で以下を実行:
   * 1. 実行予算の存在チェック
   * 2. 同一月の重複締めチェック
   * 3. 全項目のcurrentMonthExpenseをpreviousMonthExpenseに累積
   * 4. 全項目のcurrentMonthExpenseを0にリセット
   * 5. MonthlyCloseHistoryを作成
   *
   * Requirements: 13.3, 13.4, 14.3, 14.5
   *
   * @param executionBudgetId - 実行予算ID
   * @param targetMonth - 締め対象月（YYYY-MM形式）
   * @param closedById - 実行者ID
   * @returns 作成された月次締め履歴
   * @throws ExecutionBudgetNotFoundError 実行予算が存在しない、または論理削除済みの場合
   * @throws MonthlyCloseAlreadyExistsError 同一月に対して既に締め済みの場合
   */
  async close(
    executionBudgetId: string,
    targetMonth: string,
    closedById: string
  ): Promise<MonthlyCloseHistoryResult> {
    return await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. 実行予算の存在チェック
      const budget = await tx.executionBudget.findFirst({
        where: { id: executionBudgetId },
      });

      if (!budget || budget.deletedAt !== null) {
        throw new ExecutionBudgetNotFoundError();
      }

      // 2. 同一月の重複締めチェック
      const existingClose = await tx.monthlyCloseHistory.findFirst({
        where: {
          executionBudgetId,
          targetMonth,
        },
      });

      if (existingClose) {
        throw new MonthlyCloseAlreadyExistsError(targetMonth);
      }

      // 3. 全項目を取得
      const items = await tx.executionBudgetItem.findMany({
        where: { executionBudgetId },
      });

      // 4. 各項目のcurrentMonthExpenseをpreviousMonthExpenseに累積し、リセット
      for (const item of items) {
        const previousMonthExpense = new Decimal(item.previousMonthExpense?.toString() ?? '0');
        const currentMonthExpense = new Decimal(item.currentMonthExpense?.toString() ?? '0');
        const newPreviousMonthExpense = previousMonthExpense.add(currentMonthExpense);

        await tx.executionBudgetItem.update({
          where: { id: item.id },
          data: {
            previousMonthExpense: newPreviousMonthExpense.toFixed(0),
            currentMonthExpense: '0',
          },
        });
      }

      // 5. MonthlyCloseHistoryを作成
      const history = await tx.monthlyCloseHistory.create({
        data: {
          executionBudgetId,
          targetMonth,
          closedById,
        },
      });

      return {
        id: history.id,
        executionBudgetId: history.executionBudgetId,
        targetMonth: history.targetMonth,
        closedById: history.closedById,
        closedAt: history.closedAt,
      };
    });
  }

  /**
   * 月次締め履歴の一覧を取得する
   *
   * 締め日時の降順でソートして返却する。
   *
   * Requirement: 14.4
   *
   * @param executionBudgetId - 実行予算ID
   * @returns 月次締め履歴の一覧
   * @throws ExecutionBudgetNotFoundError 実行予算が存在しない場合
   */
  async getHistory(executionBudgetId: string): Promise<MonthlyCloseHistoryResult[]> {
    // 実行予算の存在チェック
    const budget = await this.prisma.executionBudget.findFirst({
      where: { id: executionBudgetId },
    });

    if (!budget || budget.deletedAt !== null) {
      throw new ExecutionBudgetNotFoundError();
    }

    const histories = await this.prisma.monthlyCloseHistory.findMany({
      where: { executionBudgetId },
      orderBy: { closedAt: 'desc' },
      include: {
        closedBy: {
          select: { id: true, displayName: true },
        },
      },
    });

    return histories.map((h) => ({
      id: h.id,
      executionBudgetId: h.executionBudgetId,
      targetMonth: h.targetMonth,
      closedById: h.closedById,
      closedAt: h.closedAt,
      closedBy: h.closedBy ? { id: h.closedBy.id, displayName: h.closedBy.displayName } : undefined,
    }));
  }
}
