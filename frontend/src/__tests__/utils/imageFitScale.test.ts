/**
 * @fileoverview 画像フィット倍率算出ユーティリティのテスト
 *
 * Task 99.1: imageFitScale 純関数の実装と単体テスト
 *
 * Requirements:
 * - 36.1: 画像を利用可能な表示領域の幅または高さに収まる最大倍率（フィット）で初期表示する
 * - 36.2: 原寸が表示領域より小さい場合、フィット倍率まで拡大し、原寸で頭打ちにする
 */

import { describe, it, expect } from 'vitest';
import { computeFitScale, DEFAULT_MAX_UPSCALE } from '../../utils/imageFitScale';

describe('imageFitScale', () => {
  describe('律速の切替（幅律速 / 高さ律速）', () => {
    it('画像が横長でコンテナに対し幅が律速となる場合、幅基準の倍率を返す', () => {
      // 画像 2000x1000（横長）、コンテナ 1000x1000
      // widthScale = 1000/2000 = 0.5, heightScale = 1000/1000 = 1.0 → 幅律速 0.5
      const scale = computeFitScale({
        imageWidth: 2000,
        imageHeight: 1000,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBeCloseTo(0.5, 10);
    });

    it('画像が縦長でコンテナに対し高さが律速となる場合、高さ基準の倍率を返す', () => {
      // 画像 1000x2000（縦長）、コンテナ 1000x1000
      // widthScale = 1000/1000 = 1.0, heightScale = 1000/2000 = 0.5 → 高さ律速 0.5
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: 2000,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBeCloseTo(0.5, 10);
    });
  });

  describe('padding 考慮', () => {
    it('padding 分だけ利用可能領域が縮小され倍率が下がる', () => {
      // 画像 1000x1000、コンテナ 1000x1000、padding 48
      // available = 952x952 → 952/1000 = 0.952
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: 1000,
        containerWidth: 1000,
        containerHeight: 1000,
        padding: 48,
      });
      expect(scale).toBeCloseTo(0.952, 10);
    });

    it('padding 未指定時は既定 0 として扱い、コンテナ全域を使う', () => {
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: 1000,
        containerWidth: 800,
        containerHeight: 800,
      });
      expect(scale).toBeCloseTo(0.8, 10);
    });
  });

  describe('allowUpscale=false（既定・原寸頭打ち。デスクトップ現行維持）', () => {
    it('画像がコンテナより大きい場合は縮小倍率（<1）を返す', () => {
      const scale = computeFitScale({
        imageWidth: 2000,
        imageHeight: 2000,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBeCloseTo(0.5, 10);
    });

    it('画像がコンテナより小さくても 1（原寸）で頭打ちにする', () => {
      // フィット倍率は 2.0 相当だが allowUpscale=false のため 1 に頭打ち
      const scale = computeFitScale({
        imageWidth: 500,
        imageHeight: 500,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBe(1);
    });

    it('明示的に allowUpscale=false を指定しても原寸頭打ち', () => {
      const scale = computeFitScale({
        imageWidth: 100,
        imageHeight: 100,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: false,
      });
      expect(scale).toBe(1);
    });
  });

  describe('allowUpscale=true（フィット倍率まで拡大）', () => {
    it('小画像をフィット倍率（>1）まで拡大する', () => {
      // 画像 500x500、コンテナ 1000x1000 → フィット倍率 2.0（maxUpscale=3 未満なので採用）
      const scale = computeFitScale({
        imageWidth: 500,
        imageHeight: 500,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
      });
      expect(scale).toBeCloseTo(2.0, 10);
    });

    it('大きい画像は allowUpscale=true でも縮小倍率のまま', () => {
      const scale = computeFitScale({
        imageWidth: 2000,
        imageHeight: 2000,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
      });
      expect(scale).toBeCloseTo(0.5, 10);
    });
  });

  describe('maxUpscale 上限', () => {
    it('フィット倍率が maxUpscale を超える場合は maxUpscale で頭打ちにする', () => {
      // 画像 100x100、コンテナ 1000x1000 → フィット倍率 10.0 だが maxUpscale=3 で頭打ち
      const scale = computeFitScale({
        imageWidth: 100,
        imageHeight: 100,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
        maxUpscale: 3,
      });
      expect(scale).toBe(3);
    });

    it('maxUpscale 未指定時は既定上限 DEFAULT_MAX_UPSCALE で頭打ちにする', () => {
      const scale = computeFitScale({
        imageWidth: 100,
        imageHeight: 100,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
      });
      expect(scale).toBe(DEFAULT_MAX_UPSCALE);
    });

    it('フィット倍率が maxUpscale 未満なら maxUpscale ではなくフィット倍率を採用する', () => {
      // フィット倍率 2.0 < maxUpscale 5 → 2.0 を採用
      const scale = computeFitScale({
        imageWidth: 500,
        imageHeight: 500,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
        maxUpscale: 5,
      });
      expect(scale).toBeCloseTo(2.0, 10);
    });

    it('allowUpscale=false のときは maxUpscale を指定しても 1 を上限とする', () => {
      const scale = computeFitScale({
        imageWidth: 100,
        imageHeight: 100,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: false,
        maxUpscale: 5,
      });
      expect(scale).toBe(1);
    });
  });

  describe('ゼロ・負・非有限入力に対する防御', () => {
    it('画像幅が 0 のとき安全に 1 を返す（ゼロ除算を起こさない）', () => {
      const scale = computeFitScale({
        imageWidth: 0,
        imageHeight: 1000,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBe(1);
    });

    it('画像高さが負のとき安全に 1 を返す', () => {
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: -100,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBe(1);
    });

    it('コンテナ寸法が 0 のとき安全に 1 を返す', () => {
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: 1000,
        containerWidth: 0,
        containerHeight: 0,
      });
      expect(scale).toBe(1);
    });

    it('padding がコンテナ寸法以上で利用可能領域が非正のとき安全に 1 を返す', () => {
      const scale = computeFitScale({
        imageWidth: 1000,
        imageHeight: 1000,
        containerWidth: 40,
        containerHeight: 40,
        padding: 48,
      });
      expect(scale).toBe(1);
    });

    it('画像寸法が NaN のとき安全に 1 を返す', () => {
      const scale = computeFitScale({
        imageWidth: Number.NaN,
        imageHeight: 1000,
        containerWidth: 1000,
        containerHeight: 1000,
      });
      expect(scale).toBe(1);
    });

    it('maxUpscale が不正（0 以下）でも allowUpscale=true 時は既定上限にフォールバックする', () => {
      const scale = computeFitScale({
        imageWidth: 100,
        imageHeight: 100,
        containerWidth: 1000,
        containerHeight: 1000,
        allowUpscale: true,
        maxUpscale: 0,
      });
      expect(scale).toBe(DEFAULT_MAX_UPSCALE);
    });
  });
});
