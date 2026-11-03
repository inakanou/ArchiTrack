/**
 * @fileoverview 現場調査の画面の 404 の分類のテスト
 *
 * Task 120.1: 現場調査の画面が 404 を受けたときの不在の表示
 *
 * Requirements (site-survey):
 * - 40.1: 画面の読み込みの 404 を見つからない種別に分類する
 * - 40.2: 操作の 404 を見つからない種別に分類し、対象ごとの日本語の文言を返す
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../../api/client';
import {
  getSiteSurveyNotFoundMessage,
  isSiteSurveyNotFoundError,
  PROJECT_NOT_FOUND_MESSAGE,
  SITE_SURVEY_NOT_FOUND_MESSAGE,
  SITE_SURVEY_OR_IMAGE_NOT_FOUND_MESSAGE,
  SURVEY_IMAGE_NOT_FOUND_MESSAGE,
} from '../../utils/siteSurveyNotFound';

const genericNotFound = () =>
  new ApiError(404, 'Not found', { status: 404, detail: 'Not found', code: 'NOT_FOUND' });

describe('isSiteSurveyNotFoundError', () => {
  it('汎用の 404（範囲外と不在）を見つからない種別に分類する', () => {
    expect(isSiteSurveyNotFoundError(genericNotFound())).toBe(true);
  });

  it('本体の 404（現場調査・プロジェクト・画像の符号、符号なし）を見つからない種別に分類する', () => {
    for (const code of [
      'SITE_SURVEY_NOT_FOUND',
      'PROJECT_NOT_FOUND',
      'ANNOTATION_IMAGE_NOT_FOUND',
    ]) {
      expect(isSiteSurveyNotFoundError(new ApiError(404, 'x', { code })), code).toBe(true);
    }
    expect(isSiteSurveyNotFoundError(new ApiError(404, 'x'))).toBe(true);
  });

  it('注釈が未保存である 404（ANNOTATION_NOT_FOUND）は見つからない種別にしない', () => {
    expect(
      isSiteSurveyNotFoundError(new ApiError(404, 'x', { code: 'ANNOTATION_NOT_FOUND' }))
    ).toBe(false);
  });

  it('404 以外の失敗と ApiError 以外は見つからない種別にしない', () => {
    for (const status of [400, 403, 409, 500]) {
      expect(isSiteSurveyNotFoundError(new ApiError(status, 'x', {})), String(status)).toBe(false);
    }
    expect(isSiteSurveyNotFoundError(new Error('Not found'))).toBe(false);
    expect(isSiteSurveyNotFoundError('404')).toBe(false);
    expect(isSiteSurveyNotFoundError(null)).toBe(false);
  });
});

describe('getSiteSurveyNotFoundMessage', () => {
  it('対象ごとに ResourceNotFound の見出しと説明の文の形の日本語を返す', () => {
    expect(getSiteSurveyNotFoundMessage(genericNotFound(), 'siteSurvey')).toBe(
      '現場調査が見つかりません。存在しないか、削除されています。'
    );
    expect(getSiteSurveyNotFoundMessage(genericNotFound(), 'project')).toBe(
      'プロジェクトが見つかりません。存在しないか、削除されています。'
    );
    expect(getSiteSurveyNotFoundMessage(genericNotFound(), 'image')).toBe(
      '画像が見つかりません。存在しないか、削除されています。'
    );
    expect(getSiteSurveyNotFoundMessage(genericNotFound(), 'siteSurveyOrImage')).toBe(
      '現場調査または画像が見つかりません。存在しないか、削除されています。'
    );
    expect(SITE_SURVEY_NOT_FOUND_MESSAGE).toBe(
      getSiteSurveyNotFoundMessage(genericNotFound(), 'siteSurvey')
    );
    expect(PROJECT_NOT_FOUND_MESSAGE).toBe(
      getSiteSurveyNotFoundMessage(genericNotFound(), 'project')
    );
    expect(SURVEY_IMAGE_NOT_FOUND_MESSAGE).toBe(
      getSiteSurveyNotFoundMessage(genericNotFound(), 'image')
    );
    expect(SITE_SURVEY_OR_IMAGE_NOT_FOUND_MESSAGE).toBe(
      getSiteSurveyNotFoundMessage(genericNotFound(), 'siteSurveyOrImage')
    );
  });

  it('応答の本文（英語の文言・ID）を文言に含めない', () => {
    const error = new ApiError(404, 'Site survey not found: 1234', {
      detail: 'Site survey not found: 1234',
      code: 'SITE_SURVEY_NOT_FOUND',
    });
    const message = getSiteSurveyNotFoundMessage(error, 'siteSurvey');
    expect(message).not.toContain('1234');
    expect(message).not.toMatch(/not found/i);
  });

  it('見つからない種別でなければ null を返す（呼び出し元は従来の文言を表示する）', () => {
    expect(getSiteSurveyNotFoundMessage(new ApiError(500, 'x', {}), 'siteSurvey')).toBeNull();
    expect(
      getSiteSurveyNotFoundMessage(
        new ApiError(404, 'x', { code: 'ANNOTATION_NOT_FOUND' }),
        'image'
      )
    ).toBeNull();
    expect(getSiteSurveyNotFoundMessage(new Error('x'), 'project')).toBeNull();
  });
});
