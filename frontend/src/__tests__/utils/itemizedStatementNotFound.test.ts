/**
 * @fileoverview 内訳書の画面の 404 の分類のテスト
 *
 * Task 29.1: 内訳書の画面が 404 を受けたときの不在の表示
 *
 * Requirements (itemized-statement-generation):
 * - 19.1, 19.2: 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す。
 *   範囲外と不在は同じ応答で、画面も区別しない
 *
 * @module __tests__/utils/itemizedStatementNotFound.test
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  getItemizedStatementNotFoundMessage,
  isNotFoundError,
} from '../../utils/itemizedStatementNotFound';

/** 閲覧範囲外と不在に共通の汎用の 404 */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    type: 'https://architrack.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

describe('itemizedStatementNotFound', () => {
  describe('文言の逐語（design.md の「2026-10-29 の追加」章の決定）', () => {
    it('対象ごとの文言は共通部品 ResourceNotFound の見出しと説明の文に揃える', () => {
      expect(ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE).toBe(
        '内訳書が見つかりません。存在しないか、削除されています。'
      );
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。存在しないか、削除されています。'
      );
    });
  });

  describe('isNotFoundError', () => {
    it('状態コードが 404 の ApiError を見つからない種別とする', () => {
      expect(isNotFoundError(genericNotFound())).toBe(true);
    });

    it('404 以外の ApiError と ApiError 以外は見つからない種別としない', () => {
      expect(isNotFoundError(new ApiError(500, 'Internal'))).toBe(false);
      expect(isNotFoundError(new ApiError(409, 'Conflict'))).toBe(false);
      expect(isNotFoundError(new ApiError(0, 'Network error'))).toBe(false);
      expect(isNotFoundError(new Error('Not found'))).toBe(false);
      expect(isNotFoundError(null)).toBe(false);
    });
  });

  describe('getItemizedStatementNotFoundMessage', () => {
    it('汎用の 404（範囲外と不在）は対象ごとの固定の文言にし、英語の本文を出さない', () => {
      expect(getItemizedStatementNotFoundMessage(genericNotFound(), 'itemizedStatement')).toBe(
        ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE
      );
      expect(getItemizedStatementNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
    });

    it('内訳書の不在の符号は本文（内訳書の ID を含む）を出さず固定の文言にする', () => {
      const error = new ApiError(404, '内訳書が見つかりません: statement-1', {
        status: 404,
        detail: '内訳書が見つかりません: statement-1',
        code: 'ITEMIZED_STATEMENT_NOT_FOUND',
      });
      expect(getItemizedStatementNotFoundMessage(error, 'itemizedStatement')).toBe(
        ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE
      );
    });

    it('作成の数量表の不在（本体の固有の 404 で本文が日本語）はその本文を返す', () => {
      const error = new ApiError(404, '数量表が見つかりません: qt-1', {
        status: 404,
        detail: '数量表が見つかりません: qt-1',
        code: 'QUANTITY_TABLE_NOT_FOUND',
      });
      expect(getItemizedStatementNotFoundMessage(error, 'project')).toBe(
        '数量表が見つかりません: qt-1'
      );
    });

    it('本文が英語の本体の 404 は対象ごとの固定の文言にする', () => {
      const error = new ApiError(404, 'Quantity Table Not Found', {
        status: 404,
        code: 'QUANTITY_TABLE_NOT_FOUND',
      });
      expect(getItemizedStatementNotFoundMessage(error, 'project')).toBe(PROJECT_NOT_FOUND_MESSAGE);
    });

    it('404 以外は null を返す（呼び出し元は従来の文言を表示する）', () => {
      expect(
        getItemizedStatementNotFoundMessage(new ApiError(500, 'Internal'), 'itemizedStatement')
      ).toBeNull();
      expect(
        getItemizedStatementNotFoundMessage(new ApiError(409, 'Conflict'), 'itemizedStatement')
      ).toBeNull();
      expect(getItemizedStatementNotFoundMessage(new Error('x'), 'project')).toBeNull();
    });
  });
});
