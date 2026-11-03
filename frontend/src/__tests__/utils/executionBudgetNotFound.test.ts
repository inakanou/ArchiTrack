/**
 * @fileoverview 実行予算の画面の 404 の分類と、実行予算の未作成と案件の不在の見分けのテスト
 *
 * Task 19.1: 実行予算・変更契約の反映・発注詳細・出来高入力の画面が 404 を受けたときの不在の表示
 *
 * Requirements (execution-budget-management):
 * - 21.1: 実行予算の取得の 404 のあとに案件を確かめ、案件の不在（範囲外を含む）と実行予算の未作成を見分ける
 * - 21.2: 操作の 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す。応答の本文は出さない
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../../api/client';
import * as projectsApi from '../../api/projects';
import {
  AMENDMENT_NOT_FOUND_MESSAGE,
  CONTRACT_NOT_FOUND_MESSAGE,
  EXECUTION_BUDGET_NOT_FOUND_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  PROGRESS_RECORD_NOT_FOUND_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  getExecutionBudgetNotFoundMessage,
  isExecutionBudgetNotFoundError,
  resolveMissingExecutionBudget,
} from '../../utils/executionBudgetNotFound';

vi.mock('../../api/projects');

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    type: 'https://architrack.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

/** 範囲内の利用者に届く本体の 404 */
function bodyNotFound(code: string | undefined, detail: string): ApiError {
  return new ApiError(404, detail, code ? { status: 404, detail, code } : { status: 404, detail });
}

describe('executionBudgetNotFound', () => {
  describe('文言', () => {
    it('共通部品 ResourceNotFound の見出しと説明の文の形で、対象ごとに固定する', () => {
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。存在しないか、削除されています。'
      );
      expect(EXECUTION_BUDGET_NOT_FOUND_MESSAGE).toBe(
        '実行予算が見つかりません。存在しないか、削除されています。'
      );
      expect(CONTRACT_NOT_FOUND_MESSAGE).toBe(
        '契約書が見つかりません。存在しないか、削除されています。'
      );
      expect(AMENDMENT_NOT_FOUND_MESSAGE).toBe(
        '変更契約が見つかりません。存在しないか、削除されています。'
      );
      expect(ORDER_NOT_FOUND_MESSAGE).toBe(
        '発注が見つかりません。存在しないか、削除されています。'
      );
      expect(PROGRESS_RECORD_NOT_FOUND_MESSAGE).toBe(
        '出来高記録が見つかりません。存在しないか、削除されています。'
      );
    });
  });

  describe('isExecutionBudgetNotFoundError', () => {
    it('ApiError の 404 は本文の符号によらず見つからない種別', () => {
      expect(isExecutionBudgetNotFoundError(genericNotFound())).toBe(true);
      expect(isExecutionBudgetNotFoundError(bodyNotFound('ORDER_NOT_FOUND', '発注'))).toBe(true);
      expect(isExecutionBudgetNotFoundError(new ApiError(404, '本文なし'))).toBe(true);
    });

    it('404 以外の ApiError と ApiError 以外は見つからない種別ではない', () => {
      expect(isExecutionBudgetNotFoundError(new ApiError(409, '競合'))).toBe(false);
      expect(isExecutionBudgetNotFoundError(new ApiError(422, '業務規則'))).toBe(false);
      expect(isExecutionBudgetNotFoundError(new ApiError(500, 'Internal server error'))).toBe(
        false
      );
      expect(isExecutionBudgetNotFoundError(new Error('Not found'))).toBe(false);
      expect(isExecutionBudgetNotFoundError(null)).toBe(false);
    });
  });

  describe('getExecutionBudgetNotFoundMessage', () => {
    it('汎用の 404 は経路が指す対象の文言（応答の英語の文言を出さない）', () => {
      expect(getExecutionBudgetNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
      expect(getExecutionBudgetNotFoundMessage(genericNotFound(), 'order')).toBe(
        ORDER_NOT_FOUND_MESSAGE
      );
      expect(getExecutionBudgetNotFoundMessage(genericNotFound(), 'project')).not.toContain(
        'Not found'
      );
    });

    it.each([
      ['EXECUTION_BUDGET_NOT_FOUND', EXECUTION_BUDGET_NOT_FOUND_MESSAGE],
      ['EXECUTION_BUDGET_NOT_FOUND_FOR_ORDER', EXECUTION_BUDGET_NOT_FOUND_MESSAGE],
      ['EXECUTION_BUDGET_NOT_FOUND_FOR_PROGRESS', EXECUTION_BUDGET_NOT_FOUND_MESSAGE],
      ['CONTRACT_NOT_FOUND_FOR_BUDGET', CONTRACT_NOT_FOUND_MESSAGE],
      ['AMENDMENT_CONTRACT_NOT_FOUND', AMENDMENT_NOT_FOUND_MESSAGE],
      ['ORDER_NOT_FOUND', ORDER_NOT_FOUND_MESSAGE],
      ['PROGRESS_RECORD_NOT_FOUND', PROGRESS_RECORD_NOT_FOUND_MESSAGE],
    ])('本体の 404 の符号 %s はその対象の文言（経路の対象によらない）', (code, expected) => {
      const error = bodyNotFound(code, `本文の文言 ${code}`);
      expect(getExecutionBudgetNotFoundMessage(error, 'project')).toBe(expected);
      expect(getExecutionBudgetNotFoundMessage(error, 'order')).toBe(expected);
    });

    it('符号の無い本体の 404（経路が手で組み立てた実行予算の不在）は実行予算の文言', () => {
      const error = bodyNotFound(undefined, '実行予算が見つかりません');
      expect(getExecutionBudgetNotFoundMessage(error, 'project')).toBe(
        EXECUTION_BUDGET_NOT_FOUND_MESSAGE
      );
      expect(getExecutionBudgetNotFoundMessage(error, 'order')).toBe(
        EXECUTION_BUDGET_NOT_FOUND_MESSAGE
      );
    });

    it('404 でなければ null（呼び出し元は従来の文言を表示する）', () => {
      expect(getExecutionBudgetNotFoundMessage(new ApiError(409, '競合'), 'project')).toBeNull();
      expect(getExecutionBudgetNotFoundMessage(new ApiError(500, 'boom'), 'order')).toBeNull();
      expect(getExecutionBudgetNotFoundMessage(new Error('boom'), 'project')).toBeNull();
    });
  });

  describe('resolveMissingExecutionBudget', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('案件が取得できれば実行予算の未作成', async () => {
      vi.mocked(projectsApi.getProject).mockResolvedValue({
        id: 'project-1',
      } as unknown as Awaited<ReturnType<typeof projectsApi.getProject>>);
      await expect(resolveMissingExecutionBudget('project-1')).resolves.toBe('budgetNotCreated');
      expect(projectsApi.getProject).toHaveBeenCalledWith('project-1');
    });

    it('案件の取得が 404（範囲外と不在）なら案件の不在', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(
        new ApiError(404, 'プロジェクトが見つかりません', {
          status: 404,
          detail: 'Not found',
          code: 'NOT_FOUND',
        })
      );
      await expect(resolveMissingExecutionBudget('project-1')).resolves.toBe('projectNotFound');
    });

    it('案件の取得が 404 以外で失敗すれば読み込みの失敗（作成の釦を出さない）', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'boom'));
      await expect(resolveMissingExecutionBudget('project-1')).resolves.toBe('projectLoadFailed');
      vi.mocked(projectsApi.getProject).mockRejectedValue(new Error('Network error'));
      await expect(resolveMissingExecutionBudget('project-1')).resolves.toBe('projectLoadFailed');
    });
  });
});
