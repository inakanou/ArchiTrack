/**
 * @fileoverview 数量表の画面の 404 の分類のテスト
 *
 * Task 106.1: 数量表の画面が 404 を受けたときの不在の表示
 *
 * Requirements (quantity-table-generation):
 * - 51.1: 画面の読み込みの 404 を見つからない種別に分類する
 * - 51.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getQuantityTableNotFoundMessage,
  isQuantityTableNotFoundError,
  PROJECT_NOT_FOUND_MESSAGE,
  QUANTITY_TABLE_NOT_FOUND_MESSAGE,
} from '../../utils/quantityTableNotFound';

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

/** 範囲内の利用者に届く、論理削除された数量表の 404（本文は数量表の ID を含む） */
function quantityTableNotFound(): ApiError {
  return new ApiError(404, '数量表が見つかりません: qt-123', {
    status: 404,
    detail: '数量表が見つかりません: qt-123',
    code: 'QUANTITY_TABLE_NOT_FOUND',
  });
}

describe('quantityTableNotFound', () => {
  describe('文言', () => {
    it('数量表とプロジェクトの見つからない旨は共通部品の見出しと説明の文の形にそろえる', () => {
      expect(QUANTITY_TABLE_NOT_FOUND_MESSAGE).toBe(
        '数量表が見つかりません。存在しないか、削除されています。'
      );
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。存在しないか、削除されています。'
      );
    });
  });

  describe('isQuantityTableNotFoundError', () => {
    it('汎用の 404 と本体の数量表・プロジェクトの 404、符号の無い 404 を見つからない種別とする', () => {
      expect(isQuantityTableNotFoundError(genericNotFound())).toBe(true);
      expect(isQuantityTableNotFoundError(quantityTableNotFound())).toBe(true);
      expect(
        isQuantityTableNotFoundError(
          new ApiError(404, 'プロジェクトが見つかりません: p-1', { code: 'PROJECT_NOT_FOUND' })
        )
      ).toBe(true);
      expect(isQuantityTableNotFoundError(new ApiError(404, 'Not Found'))).toBe(true);
    });

    it('紐付けた写真（現調画像・現場調査）の不在の 404 は数量表の不在としない', () => {
      expect(
        isQuantityTableNotFoundError(
          new ApiError(404, '現場調査画像が見つかりません', {
            status: 404,
            code: 'SURVEY_IMAGE_NOT_FOUND',
            surveyImageId: 'image-1',
          })
        )
      ).toBe(false);
      expect(
        isQuantityTableNotFoundError(
          new ApiError(404, '現場調査が見つかりません', {
            status: 404,
            code: 'SITE_SURVEY_NOT_FOUND',
          })
        )
      ).toBe(false);
    });

    it('404 以外の ApiError と ApiError でない失敗は見つからない種別としない', () => {
      expect(isQuantityTableNotFoundError(new ApiError(400, 'Bad request'))).toBe(false);
      expect(isQuantityTableNotFoundError(new ApiError(409, 'Conflict'))).toBe(false);
      expect(isQuantityTableNotFoundError(new ApiError(410, 'Gone'))).toBe(false);
      expect(isQuantityTableNotFoundError(new ApiError(500, 'Internal'))).toBe(false);
      expect(isQuantityTableNotFoundError(new Error('Not found'))).toBe(false);
      expect(isQuantityTableNotFoundError('404')).toBe(false);
      expect(isQuantityTableNotFoundError(null)).toBe(false);
    });
  });

  describe('getQuantityTableNotFoundMessage', () => {
    it('汎用の 404 では、呼び出し元が渡す対象の文言を返し、応答の英語の文言を返さない', () => {
      expect(getQuantityTableNotFoundMessage(genericNotFound(), 'quantityTable')).toBe(
        QUANTITY_TABLE_NOT_FOUND_MESSAGE
      );
      expect(getQuantityTableNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
    });

    it('範囲内の利用者に届く数量表の不在の 404 も、範囲外と同じ固定の文言にそろえ、ID を含む本文を返さない', () => {
      const message = getQuantityTableNotFoundMessage(quantityTableNotFound(), 'quantityTable');
      expect(message).toBe(QUANTITY_TABLE_NOT_FOUND_MESSAGE);
      expect(message).not.toContain('qt-123');
    });

    it('数量表・プロジェクトの 404 でない失敗では null を返す（呼び出し元は従来の文言を表示する）', () => {
      expect(
        getQuantityTableNotFoundMessage(new ApiError(409, 'Conflict'), 'quantityTable')
      ).toBeNull();
      expect(getQuantityTableNotFoundMessage(new ApiError(500, 'Internal'), 'project')).toBeNull();
      expect(getQuantityTableNotFoundMessage(new Error('Not found'), 'quantityTable')).toBeNull();
      expect(
        getQuantityTableNotFoundMessage(
          new ApiError(404, '現場調査画像が見つかりません', { code: 'SURVEY_IMAGE_NOT_FOUND' }),
          'quantityTable'
        )
      ).toBeNull();
    });
  });
});
