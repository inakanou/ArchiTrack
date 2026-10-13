/**
 * @fileoverview 計算パラメータ検証ユーティリティのテスト
 *
 * Task 68.7: 保存前の計算パラメータ検証を編集画面の保存処理へ配線する（TDDテストファースト）
 *
 * 本ユーティリティは保存前の計算パラメータ検証の単一情報源であり、
 * 数量表編集画面（QuantityTableEditPage.handleSave）から参照される
 * （useQuantityTableSave は Task 97.13 で撤去した）。文言はバックエンド（quantity-validation.service.ts /
 * quantity-table.schema.ts）と一致させ、バックエンドより厳しくしない。
 *
 * Requirements:
 * - 47.9 / 8.15: 「箇所数」が未入力のまま保存を試行する場合、箇所数の入力を求める
 * - 47.10 / 47.11: 「箇所数」の整数・範囲の検証
 * - 8.10: 「ピッチ」モードの必須項目（範囲長・端長1・端長2・ピッチ長）の検証
 * - 8.7: 「面積・体積」モードで幅(W)・奥行き(D)・高さ(H)のいずれも入力されていない場合の検証
 * - 11.2: 整合性チェックでエラーが検出される場合は保存を中断する
 */

import { describe, it, expect } from 'vitest';
import {
  validateCalculationParams,
  CALCULATION_PARAMS_INTEGRITY_CHECKS,
  type CalculationParamsIssue,
} from './calculation-params-validation';
import { CALCULATION_METHOD_ORDER } from './calculation-method';
import type { CalculationMethod, CalculationParams } from '../types/quantity-edit.types';

const check = (
  calculationMethod: CalculationMethod,
  calculationParams: CalculationParams
): CalculationParamsIssue[] => validateCalculationParams({ calculationMethod, calculationParams });

describe('calculation-params-validation', () => {
  describe('計算方法「標準」', () => {
    it('計算パラメータが未設定でも問題が記録されないこと', () => {
      expect(check('STANDARD', null)).toEqual([]);
    });
  });

  describe('計算方法「箇所数」（REQ-47）', () => {
    // 計算方法を「箇所数」へ切り替えた直後は計算パラメータ自体が未設定になる。
    // 汎用の「計算パラメータが設定されていません」ではユーザーに箇所数の入力を求められず
    // REQ-47 AC9 を満たさないため、箇所数の未入力として扱う。
    it('計算パラメータが未設定の場合に箇所数の必須エラーが記録されること（REQ-47 AC9）', () => {
      expect(check('COUNT', null)).toEqual([
        {
          pathSuffix: 'calculationParams.count',
          message: '箇所数は必須です',
          severity: 'warning',
        },
      ]);
    });

    it('箇所数が未入力の場合に必須の問題が記録されること（REQ-47 AC9 / REQ-8 AC15）', () => {
      expect(check('COUNT', { length: 2 })).toEqual([
        {
          pathSuffix: 'calculationParams.count',
          message: '箇所数は必須です',
          severity: 'warning',
        },
      ]);
    });

    it('箇所数が小数の場合に整数の問題が記録されること（REQ-47 AC10）', () => {
      expect(check('COUNT', { count: 5.5 })).toEqual([
        {
          pathSuffix: 'calculationParams.count',
          message: '箇所数は整数で入力してください',
          severity: 'error',
        },
      ]);
    });

    it.each([
      ['下限未満', 0],
      ['上限超過', 10000000],
    ])('箇所数が範囲外（%s）の場合に範囲の問題が記録されること（REQ-47 AC11）', (_label, count) => {
      expect(check('COUNT', { count })).toEqual([
        {
          pathSuffix: 'calculationParams.count',
          message: '箇所数は1〜9999999の範囲で入力してください',
          severity: 'error',
        },
      ]);
    });

    it('箇所数が有効な整数の場合は問題が記録されないこと', () => {
      expect(check('COUNT', { count: 5, length: 2, weight: 1.5 })).toEqual([]);
    });
  });

  /**
   * 範囲長・端長1・端長2・ピッチ長の四つについて、未入力時に入力を求める問題が
   * 記録されることをこの区間が確かめる。
   *
   * @requirement quantity-table-generation/REQ-8.10
   */
  describe('計算方法「ピッチ」（REQ-8 AC10）', () => {
    it('計算パラメータが未設定の場合に警告が記録されること', () => {
      expect(check('PITCH', null)).toEqual([
        {
          pathSuffix: 'calculationParams',
          message: 'ピッチ計算方法が選択されていますが、計算パラメータが設定されていません',
          severity: 'warning',
        },
      ]);
    });

    it('必須項目がすべて未入力の場合、4件の必須の問題が記録されること', () => {
      expect(check('PITCH', { length: 2 })).toEqual([
        {
          pathSuffix: 'calculationParams.rangeLength',
          message: '範囲長は必須です',
          severity: 'warning',
        },
        {
          pathSuffix: 'calculationParams.endLength1',
          message: '端長1は必須です',
          severity: 'warning',
        },
        {
          pathSuffix: 'calculationParams.endLength2',
          message: '端長2は必須です',
          severity: 'warning',
        },
        {
          pathSuffix: 'calculationParams.pitchLength',
          message: 'ピッチ長は必須です',
          severity: 'warning',
        },
      ]);
    });

    it('一部の必須項目のみ未入力の場合、その項目だけが記録されること', () => {
      expect(check('PITCH', { rangeLength: 100, endLength1: 5, endLength2: 5 })).toEqual([
        {
          pathSuffix: 'calculationParams.pitchLength',
          message: 'ピッチ長は必須です',
          severity: 'warning',
        },
      ]);
    });

    it('必須項目がすべて入力されていれば問題が記録されないこと', () => {
      expect(
        check('PITCH', {
          rangeLength: 100,
          endLength1: 5,
          endLength2: 5,
          pitchLength: 10,
          length: 2,
          weight: 3,
        })
      ).toEqual([]);
    });
  });

  /**
   * 幅(W)・奥行き(D)・高さ(H)のいずれも入力されていないときのエラーと、幅・奥行き・高さのいずれか一つで
   * 解消されることの双方をこの区間が確かめる。
   *
   * タスク 100.10（2026-09-23、利用者の裁定）: 条文（REQ-8 AC7）は
   * 「幅(W)・奥行き(D)・高さ(H)のうち最低1項目の入力を求める」であり重量を数えない。
   * 改める前の実体は `weight` も「いずれか1つ」に数えており、**重量だけの状態が通っていた**。
   * 実体を条文へ合わせたため、重量だけでは解消されないことをこの区間が固定する。
   *
   * @requirement quantity-table-generation/REQ-8.7
   */
  describe('計算方法「面積・体積」（REQ-8 AC7）', () => {
    it('計算パラメータが未設定の場合に警告が記録されること', () => {
      expect(check('AREA_VOLUME', null)).toEqual([
        {
          pathSuffix: 'calculationParams',
          message: '面積・体積計算方法が選択されていますが、計算パラメータが設定されていません',
          severity: 'warning',
        },
      ]);
    });

    it('幅(W)・奥行き(D)・高さ(H)のいずれも入力されていない場合に問題が記録されること', () => {
      expect(check('AREA_VOLUME', {})).toEqual([
        {
          pathSuffix: 'calculationParams',
          message: '面積・体積モードでは幅(W)・奥行き(D)・高さ(H)のうち最低1項目を入力してください',
          severity: 'warning',
        },
      ]);
    });

    it.each([
      ['幅', { width: 2 }],
      ['奥行き', { depth: 2 }],
      ['高さ', { height: 2 }],
    ])(
      '計算用列（%s）に1つでも値が入力されていれば問題が記録されないこと',
      (_label, params: CalculationParams) => {
        expect(check('AREA_VOLUME', params)).toEqual([]);
      }
    );

    it('重量だけが入力されていても問題が記録されること（条文は幅・奥行き・高さのみを数える）', () => {
      expect(check('AREA_VOLUME', { weight: 2 })).toEqual([
        {
          pathSuffix: 'calculationParams',
          message: '面積・体積モードでは幅(W)・奥行き(D)・高さ(H)のうち最低1項目を入力してください',
          severity: 'warning',
        },
      ]);
    });

    it('重量に加えて高さが入力されていれば問題が記録されないこと（重量の同席は妨げにならない）', () => {
      expect(check('AREA_VOLUME', { weight: 2, height: 3 })).toEqual([]);
    });
  });

  describe('未知の計算方法の fail-fast', () => {
    it('型に存在しない計算方法はエラーとして記録されること（無言の素通りを防ぐ）', () => {
      const issues = validateCalculationParams({
        // 型に存在しない値がデータとして届いた場合の防御を検証する
        calculationMethod: 'UNKNOWN' as CalculationMethod,
        calculationParams: null,
      });

      expect(issues).toEqual([
        {
          pathSuffix: 'calculationMethod',
          message: '未知の計算方法が設定されています',
          severity: 'error',
        },
      ]);
    });
  });

  describe('対応表の網羅性', () => {
    it('すべての計算方法がチェック対象になっていること', () => {
      expect(Object.keys(CALCULATION_PARAMS_INTEGRITY_CHECKS).sort()).toEqual(
        [...CALCULATION_METHOD_ORDER].sort()
      );
    });
  });
});
