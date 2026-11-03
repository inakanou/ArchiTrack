/**
 * @fileoverview 見積依頼の画面の 404 の分類のテスト
 *
 * Task 105.1: 見積依頼の画面が 404 を受けたときの不在の表示
 *
 * Requirements (estimate-request):
 * - 10.5, 10.6: 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す。
 *   範囲外と不在は同じ応答で、画面も区別しない
 *
 * @module __tests__/utils/estimateRequestNotFound.test
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  ESTIMATE_REQUEST_NOT_FOUND_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_OR_ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE,
  RECEIVED_QUOTATION_NOT_FOUND_MESSAGE,
  getEstimateRequestNotFoundMessage,
  isNotFoundError,
} from '../../utils/estimateRequestNotFound';

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

describe('estimateRequestNotFound', () => {
  describe('文言の逐語（design.md の「2026-10-29 の追加」章の決定）', () => {
    it('対象ごとの文言は共通部品 ResourceNotFound の見出しと説明の文に揃える', () => {
      expect(ESTIMATE_REQUEST_NOT_FOUND_MESSAGE).toBe(
        '見積依頼が見つかりません。存在しないか、削除されています。'
      );
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。存在しないか、削除されています。'
      );
      expect(PROJECT_OR_ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトまたは内訳書が見つかりません。存在しないか、削除されています。'
      );
      expect(RECEIVED_QUOTATION_NOT_FOUND_MESSAGE).toBe(
        '受領見積書が見つかりません。存在しないか、削除されています。'
      );
    });
  });

  describe('isNotFoundError', () => {
    it('状態コードが 404 の ApiError を見つからない種別とする', () => {
      expect(isNotFoundError(genericNotFound())).toBe(true);
    });

    it('404 以外の ApiError と ApiError 以外は見つからない種別としない', () => {
      expect(isNotFoundError(new ApiError(500, 'Internal'))).toBe(false);
      expect(isNotFoundError(new ApiError(403, 'Forbidden'))).toBe(false);
      expect(isNotFoundError(new ApiError(0, 'Network'))).toBe(false);
      expect(isNotFoundError(new Error('Not found'))).toBe(false);
      expect(isNotFoundError(undefined)).toBe(false);
    });
  });

  describe('getEstimateRequestNotFoundMessage', () => {
    it('汎用の 404（英語の Not found）は、対象ごとの日本語の文言にする', () => {
      expect(getEstimateRequestNotFoundMessage(genericNotFound(), 'estimateRequest')).toBe(
        ESTIMATE_REQUEST_NOT_FOUND_MESSAGE
      );
      expect(getEstimateRequestNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
      expect(
        getEstimateRequestNotFoundMessage(genericNotFound(), 'projectOrItemizedStatement')
      ).toBe(PROJECT_OR_ITEMIZED_STATEMENT_NOT_FOUND_MESSAGE);
      expect(getEstimateRequestNotFoundMessage(genericNotFound(), 'receivedQuotation')).toBe(
        RECEIVED_QUOTATION_NOT_FOUND_MESSAGE
      );
    });

    it('見積依頼・受領見積書・内訳書の不在の符号は、本文（ID を含む）を出さず対象ごとの文言にそろえる', () => {
      const cases = [
        ['ESTIMATE_REQUEST_NOT_FOUND', '見積依頼が見つかりません: er-1'],
        ['ESTIMATE_REQUEST_STATUS_NOT_FOUND', '見積依頼が見つかりません: er-1'],
        ['RECEIVED_QUOTATION_NOT_FOUND', '受領見積書が見つかりません: rq-1'],
        ['ITEMIZED_STATEMENT_NOT_FOUND', '内訳書が見つかりません: is-1'],
      ] as const;
      for (const [code, detail] of cases) {
        const error = new ApiError(404, detail, { status: 404, code, detail });
        expect(getEstimateRequestNotFoundMessage(error, 'estimateRequest'), code).toBe(
          ESTIMATE_REQUEST_NOT_FOUND_MESSAGE
        );
      }
    });

    it('本体の固有の 404 で本文が日本語のもの（取引先の不在）は、その本文を表示する', () => {
      const detail = '取引先が見つかりません: tp-1';
      const error = new ApiError(404, detail, { status: 404, code: 'NOT_FOUND', detail });
      expect(getEstimateRequestNotFoundMessage(error, 'projectOrItemizedStatement')).toBe(detail);
    });

    it('404 以外の失敗は null（呼び出し元は従来の文言を表示する）', () => {
      expect(
        getEstimateRequestNotFoundMessage(new ApiError(500, 'Internal'), 'estimateRequest')
      ).toBeNull();
      expect(
        getEstimateRequestNotFoundMessage(new ApiError(409, '競合'), 'receivedQuotation')
      ).toBeNull();
      expect(getEstimateRequestNotFoundMessage(new Error('x'), 'project')).toBeNull();
    });
  });
});
