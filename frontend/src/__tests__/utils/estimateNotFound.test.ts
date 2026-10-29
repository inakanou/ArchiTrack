/**
 * @fileoverview 見積書の画面の 404 の分類のテスト
 *
 * estimate-creation のタスク64.1。Requirement 58.1・58.2 の分類の部品として、404 を見つからない種別に分類し、
 * 対象ごとの日本語の文言を返すこと、404 以外は分類しない（呼び出し元が従来の文言を出す）ことを確かめる。
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  ESTIMATE_NOT_FOUND_MESSAGE,
  ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  getEstimateNotFoundMessage,
  isNotFoundError,
} from '../../utils/estimateNotFound';

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

describe('estimateNotFound', () => {
  describe('isNotFoundError', () => {
    /**
     * @requirement estimate-creation/REQ-58.1
     * @requirement estimate-creation/REQ-58.2
     */
    it('状態コード 404 の ApiError を見つからない種別に分類する', () => {
      expect(isNotFoundError(genericNotFound())).toBe(true);
      expect(
        isNotFoundError(
          new ApiError(404, '見積書が見つかりません: est-1', { code: 'ESTIMATE_NOT_FOUND' })
        )
      ).toBe(true);
    });

    it('404 以外の失敗と ApiError でない値は分類しない', () => {
      expect(isNotFoundError(new ApiError(400, 'Bad Request'))).toBe(false);
      expect(isNotFoundError(new ApiError(409, 'Conflict'))).toBe(false);
      expect(isNotFoundError(new ApiError(500, 'Internal Server Error'))).toBe(false);
      expect(isNotFoundError(new Error('Not found'))).toBe(false);
      expect(isNotFoundError({ statusCode: 404 })).toBe(false);
      expect(isNotFoundError(null)).toBe(false);
    });
  });

  describe('getEstimateNotFoundMessage', () => {
    it('文言は保存の 404 の既存の文言を流儀とし、対象ごとに名前だけを変える', () => {
      expect(ESTIMATE_NOT_FOUND_MESSAGE).toBe(
        '見積書が見つかりません。すでに削除された可能性があります。'
      );
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。すでに削除された可能性があります。'
      );
      expect(ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE).toBe(
        '内訳書が見つかりません。すでに削除された可能性があります。'
      );
    });

    /**
     * @requirement estimate-creation/REQ-58.2
     */
    it('汎用の 404 は呼び出し元が渡す対象の文言を返し、応答の英語の本文を出さない', () => {
      expect(getEstimateNotFoundMessage(genericNotFound(), 'estimate')).toBe(
        ESTIMATE_NOT_FOUND_MESSAGE
      );
      expect(getEstimateNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
      expect(getEstimateNotFoundMessage(genericNotFound(), 'itemizedStatement')).toBe(
        ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE
      );
    });

    it('本体の固有の符号は符号が指す対象の文言を返し、ID を含む本文を出さない', () => {
      // 作成の要求が指す内訳書の不在は、作成の汎用の 404（プロジェクト）と区別して内訳書の文言にする
      const statementGone = new ApiError(404, '内訳書が見つかりません: is-1', {
        status: 404,
        detail: '内訳書が見つかりません: is-1',
        code: 'ITEMIZED_STATEMENT_NOT_FOUND',
      });
      expect(getEstimateNotFoundMessage(statementGone, 'project')).toBe(
        ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE
      );

      const estimateGone = new ApiError(404, '見積書が見つかりません: est-1', {
        status: 404,
        detail: '見積書が見つかりません: est-1',
        code: 'ESTIMATE_NOT_FOUND',
      });
      expect(getEstimateNotFoundMessage(estimateGone, 'project')).toBe(ESTIMATE_NOT_FOUND_MESSAGE);
    });

    it('符号の無い 404 と未知の符号の 404 は呼び出し元が渡す対象の文言を返す', () => {
      expect(getEstimateNotFoundMessage(new ApiError(404, 'Not Found'), 'estimate')).toBe(
        ESTIMATE_NOT_FOUND_MESSAGE
      );
      expect(
        getEstimateNotFoundMessage(new ApiError(404, 'x', { code: 'constructor' }), 'project')
      ).toBe(PROJECT_NOT_FOUND_MESSAGE);
    });

    it('404 以外は null を返す（呼び出し元は従来の文言を表示する）', () => {
      expect(getEstimateNotFoundMessage(new ApiError(409, 'Conflict'), 'estimate')).toBeNull();
      expect(getEstimateNotFoundMessage(new ApiError(500, 'x'), 'project')).toBeNull();
      expect(getEstimateNotFoundMessage(new Error('x'), 'estimate')).toBeNull();
    });
  });
});
