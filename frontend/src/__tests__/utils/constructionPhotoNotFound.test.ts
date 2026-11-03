/**
 * @fileoverview 工事写真の画面の 404 の分類のテスト
 *
 * Task 31.1: 工事写真の画面が 404 を受けたときの不在の表示
 *
 * Requirements (construction-photo):
 * - 22.1: 画面の読み込みの 404 を見つからない種別に分類する
 * - 22.2: 操作の 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getConstructionPhotoNotFoundMessage,
  isConstructionPhotoNotFoundError,
} from '../../utils/constructionPhotoNotFound';

const genericNotFound = () =>
  new ApiError(404, 'Not found', { status: 404, detail: 'Not found', code: 'NOT_FOUND' });

describe('isConstructionPhotoNotFoundError', () => {
  it('汎用の 404（範囲外と不在）を見つからない種別に分類する', () => {
    expect(isConstructionPhotoNotFoundError(genericNotFound())).toBe(true);
  });

  it('本体の 404（アルバム・写真項目・看板・プロジェクト・現場調査写真の符号、符号なし）を見つからない種別に分類する', () => {
    for (const code of [
      'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND',
      'CONSTRUCTION_PHOTO_NOT_FOUND',
      'CONSTRUCTION_SIGNBOARD_NOT_FOUND',
      'PROJECT_NOT_FOUND',
      'SURVEY_IMAGE_NOT_ALLOWED',
    ]) {
      expect(isConstructionPhotoNotFoundError(new ApiError(404, 'x', { code })), code).toBe(true);
    }
    expect(isConstructionPhotoNotFoundError(new ApiError(404, 'x'))).toBe(true);
  });

  it('取り除かれた看板を指定した保存の 404（SIGNBOARD_NOT_ALLOWED）は見つからない種別にしない', () => {
    expect(
      isConstructionPhotoNotFoundError(new ApiError(404, 'x', { code: 'SIGNBOARD_NOT_ALLOWED' }))
    ).toBe(false);
  });

  it('404 以外の失敗と ApiError 以外は見つからない種別にしない', () => {
    for (const status of [0, 400, 403, 409, 410, 500]) {
      expect(isConstructionPhotoNotFoundError(new ApiError(status, 'x', {})), String(status)).toBe(
        false
      );
    }
    expect(isConstructionPhotoNotFoundError(new Error('Not found'))).toBe(false);
    expect(isConstructionPhotoNotFoundError('404')).toBe(false);
    expect(isConstructionPhotoNotFoundError(null)).toBe(false);
  });
});

describe('getConstructionPhotoNotFoundMessage', () => {
  it('対象ごとに ResourceNotFound の見出しと説明の文の形の日本語を返す', () => {
    const cases = [
      ['album', '工事写真アルバムが見つかりません。存在しないか、削除されています。'],
      ['project', 'プロジェクトが見つかりません。存在しないか、削除されています。'],
      ['photoItem', '写真項目が見つかりません。存在しないか、削除されています。'],
      [
        'albumOrPhotoItem',
        '工事写真アルバムまたは写真項目が見つかりません。存在しないか、削除されています。',
      ],
      [
        'albumOrSurveyImage',
        '工事写真アルバムまたは現場調査写真が見つかりません。存在しないか、削除されています。',
      ],
      ['siteSurvey', '現場調査が見つかりません。存在しないか、削除されています。'],
      ['signboard', '工事看板が見つかりません。存在しないか、削除されています。'],
    ] as const;
    for (const [target, expected] of cases) {
      expect(getConstructionPhotoNotFoundMessage(genericNotFound(), target), target).toBe(expected);
    }
  });

  it('応答の本文（英語の文言・ID）を文言に含めない', () => {
    const error = new ApiError(404, 'Construction photo album not found: album-1234', {
      detail: 'Construction photo album not found: album-1234',
      code: 'CONSTRUCTION_PHOTO_ALBUM_NOT_FOUND',
    });
    const message = getConstructionPhotoNotFoundMessage(error, 'album');
    expect(message).not.toContain('album-1234');
    expect(message).not.toMatch(/not found/i);
  });

  it('見つからない種別でなければ null を返す（呼び出し元は従来の文言を表示する）', () => {
    expect(getConstructionPhotoNotFoundMessage(new ApiError(500, 'x', {}), 'album')).toBeNull();
    expect(getConstructionPhotoNotFoundMessage(new ApiError(409, 'x', {}), 'album')).toBeNull();
    expect(
      getConstructionPhotoNotFoundMessage(
        new ApiError(404, 'x', { code: 'SIGNBOARD_NOT_ALLOWED' }),
        'albumOrPhotoItem'
      )
    ).toBeNull();
    expect(getConstructionPhotoNotFoundMessage(new Error('x'), 'project')).toBeNull();
  });
});
