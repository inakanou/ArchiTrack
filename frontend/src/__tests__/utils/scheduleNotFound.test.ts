/**
 * @fileoverview 工程表の画面の 404 の分類のテスト
 *
 * Task 24.1: 工程表の画面が 404 を受けたときの不在の表示
 *
 * Requirements (construction-schedule):
 * - 14.1: 画面の読み込みの 404 を見つからない種別に分類する
 * - 14.2: 操作の 404 を見つからない種別に分類し、見つからない旨の日本語のメッセージを返す
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getScheduleNotFoundMessage,
  isNotFoundError,
  isNotFoundResponse,
  PROJECT_NOT_FOUND_MESSAGE,
  SCHEDULE_NOT_FOUND_MESSAGE,
} from '../../utils/scheduleNotFound';

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

describe('scheduleNotFound', () => {
  describe('文言', () => {
    it('工程表とプロジェクトの見つからない旨は共通部品の見出しと説明の文の形にそろえる', () => {
      expect(SCHEDULE_NOT_FOUND_MESSAGE).toBe(
        '工程表が見つかりません。存在しないか、削除されています。'
      );
      expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
        'プロジェクトが見つかりません。存在しないか、削除されています。'
      );
    });
  });

  describe('isNotFoundError', () => {
    it('状態コード 404 の ApiError を見つからない種別とする', () => {
      expect(isNotFoundError(genericNotFound())).toBe(true);
      expect(
        isNotFoundError(new ApiError(404, '工程表が見つかりません', { code: 'SCHEDULE_NOT_FOUND' }))
      ).toBe(true);
    });

    it('404 以外の ApiError と ApiError でない失敗は見つからない種別としない', () => {
      expect(isNotFoundError(new ApiError(400, 'Bad request'))).toBe(false);
      expect(isNotFoundError(new ApiError(409, 'Conflict'))).toBe(false);
      expect(isNotFoundError(new ApiError(500, 'Internal'))).toBe(false);
      expect(isNotFoundError(new Error('Not found'))).toBe(false);
      expect(isNotFoundError('404')).toBe(false);
      expect(isNotFoundError(null)).toBe(false);
    });
  });

  describe('isNotFoundResponse', () => {
    it('素の fetch の応答の状態が 404 のときだけ見つからない種別とする', () => {
      expect(isNotFoundResponse({ status: 404 })).toBe(true);
      expect(isNotFoundResponse({ status: 500 })).toBe(false);
      expect(isNotFoundResponse({ status: 409 })).toBe(false);
      expect(isNotFoundResponse({ status: 200 })).toBe(false);
    });
  });

  describe('getScheduleNotFoundMessage', () => {
    it('汎用の 404 では、呼び出し元が渡す対象の文言を返し、応答の英語の文言を返さない', () => {
      expect(getScheduleNotFoundMessage(genericNotFound(), 'schedule')).toBe(
        SCHEDULE_NOT_FOUND_MESSAGE
      );
      expect(getScheduleNotFoundMessage(genericNotFound(), 'project')).toBe(
        PROJECT_NOT_FOUND_MESSAGE
      );
    });

    it('範囲内の利用者に届く工程表の不在の 404 も、範囲外と同じ固定の文言にそろえる', () => {
      const scheduleNotFound = new ApiError(404, '工程表が見つかりません', {
        status: 404,
        detail: '工程表が見つかりません',
        code: 'SCHEDULE_NOT_FOUND',
      });
      expect(getScheduleNotFoundMessage(scheduleNotFound, 'schedule')).toBe(
        SCHEDULE_NOT_FOUND_MESSAGE
      );
    });

    it('404 以外の失敗では null を返す（呼び出し元は従来の文言を表示する）', () => {
      expect(getScheduleNotFoundMessage(new ApiError(409, 'Conflict'), 'schedule')).toBeNull();
      expect(getScheduleNotFoundMessage(new ApiError(500, 'Internal'), 'project')).toBeNull();
      expect(getScheduleNotFoundMessage(new Error('Not found'), 'schedule')).toBeNull();
    });
  });
});
