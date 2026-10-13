/**
 * @fileoverview 注釈関連型定義のタイプガードテスト
 *
 * Task 7.3: 注釈管理APIクライアントの型定義テスト
 * Task 115.85: 本番から呼ばれない誤り応答の判定を撤去し、`getAnnotation` が
 *              実際に呼ぶ `isNoAnnotationResponse` の検証だけを残した
 *
 * Requirements:
 * - 9.2: 注釈が存在しない場合の応答判定（`getAnnotation` が null を返す条件）
 */

import { describe, it, expect } from 'vitest';
import { isNoAnnotationResponse } from '../../types/site-survey.types';

describe('annotation type guards', () => {
  // ===========================================================================
  // isNoAnnotationResponse テスト
  // ===========================================================================

  describe('isNoAnnotationResponse', () => {
    it('data: nullの場合、trueを返す', () => {
      const validResponse = { data: null };

      expect(isNoAnnotationResponse(validResponse)).toBe(true);
    });

    it('dataがnullでない場合、falseを返す', () => {
      const invalidResponse = {
        data: {
          version: '1.0',
          objects: [],
        },
      };

      expect(isNoAnnotationResponse(invalidResponse)).toBe(false);
    });

    it('dataプロパティがない場合、falseを返す', () => {
      const invalidResponse = { id: '123' };

      expect(isNoAnnotationResponse(invalidResponse)).toBe(false);
    });

    it('nullの場合、falseを返す', () => {
      expect(isNoAnnotationResponse(null)).toBe(false);
    });

    it('undefinedの場合、falseを返す', () => {
      expect(isNoAnnotationResponse(undefined)).toBe(false);
    });

    it('文字列の場合、falseを返す', () => {
      expect(isNoAnnotationResponse('response')).toBe(false);
    });
  });
});
