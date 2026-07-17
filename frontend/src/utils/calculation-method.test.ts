/**
 * @fileoverview 計算方法レジストリ（単一情報源）のテスト
 *
 * Task 64.4: 計算方法の単一情報源（レジストリ）を新設する
 *
 * Requirements:
 * - 47.1: 計算方法の選択肢に「箇所数」を含める
 * - 47.17: 計算方法「箇所数」の数量項目をPDF出力する（ラベルの単一情報源）
 * - 48.1: 計算方法を変更する場合、変更前の計算方法に固有の計算用パラメータを破棄し、
 *         変更後の計算方法で使用するパラメータのみを保持する
 * - 48.2: 変更前と変更後で共通する計算用フィールド（「長さ」「重量」等）の入力値は引き継ぐ
 */

import { describe, it, expect } from 'vitest';
import {
  CALCULATION_METHOD_ORDER,
  CALCULATION_METHOD_LABELS,
  CALCULATION_METHOD_OPTIONS,
  PARAM_KEYS_BY_METHOD,
  resetParamsForMethod,
} from './calculation-method';
import type {
  AreaVolumeParams,
  CalculationMethod,
  CountParams,
  PitchParams,
} from '../types/quantity-edit.types';

/** 型レベルで全計算方法を列挙し、レジストリの網羅性検証の基準とする */
const ALL_METHODS: readonly CalculationMethod[] = ['STANDARD', 'AREA_VOLUME', 'PITCH', 'COUNT'];

describe('CALCULATION_METHOD_ORDER', () => {
  it('表示順が「標準 → 面積・体積 → ピッチ → 箇所数」である（REQ-47.1）', () => {
    expect(CALCULATION_METHOD_ORDER).toEqual(['STANDARD', 'AREA_VOLUME', 'PITCH', 'COUNT']);
  });

  it('全ての計算方法を重複なく網羅する', () => {
    expect([...CALCULATION_METHOD_ORDER].sort()).toEqual([...ALL_METHODS].sort());
    expect(new Set(CALCULATION_METHOD_ORDER).size).toBe(CALCULATION_METHOD_ORDER.length);
  });
});

describe('CALCULATION_METHOD_LABELS', () => {
  it('全4方式の表示ラベルを網羅する（REQ-47.1, REQ-47.17）', () => {
    expect(CALCULATION_METHOD_LABELS).toEqual({
      STANDARD: '標準',
      AREA_VOLUME: '面積・体積',
      PITCH: 'ピッチ',
      COUNT: '箇所数',
    });
  });

  it('計算方法ごとにラベルが定義されている（未定義・空文字が無い）', () => {
    for (const method of ALL_METHODS) {
      expect(CALCULATION_METHOD_LABELS[method]).toBeTruthy();
    }
  });

  it('「箇所数」が「ピッチ」と異なるラベルに解決される（PDF誤表示の回帰防止・REQ-47.17）', () => {
    expect(CALCULATION_METHOD_LABELS.COUNT).toBe('箇所数');
    expect(CALCULATION_METHOD_LABELS.COUNT).not.toBe(CALCULATION_METHOD_LABELS.PITCH);
  });
});

describe('CALCULATION_METHOD_OPTIONS', () => {
  it('表示順どおりに value/label のペアが生成される（REQ-47.1）', () => {
    expect(CALCULATION_METHOD_OPTIONS).toEqual([
      { value: 'STANDARD', label: '標準' },
      { value: 'AREA_VOLUME', label: '面積・体積' },
      { value: 'PITCH', label: 'ピッチ' },
      { value: 'COUNT', label: '箇所数' },
    ]);
  });

  it('CALCULATION_METHOD_ORDER と CALCULATION_METHOD_LABELS から導出される', () => {
    expect(CALCULATION_METHOD_OPTIONS.map((option) => option.value)).toEqual([
      ...CALCULATION_METHOD_ORDER,
    ]);
    for (const option of CALCULATION_METHOD_OPTIONS) {
      expect(option.label).toBe(CALCULATION_METHOD_LABELS[option.value]);
    }
  });
});

describe('PARAM_KEYS_BY_METHOD', () => {
  it('計算方法ごとの有効なパラメータキーを定義する', () => {
    expect(PARAM_KEYS_BY_METHOD).toEqual({
      STANDARD: [],
      AREA_VOLUME: ['width', 'depth', 'height', 'weight'],
      PITCH: ['rangeLength', 'endLength1', 'endLength2', 'pitchLength', 'length', 'weight'],
      COUNT: ['count', 'length', 'weight'],
    });
  });

  it('全ての計算方法にエントリが存在する', () => {
    for (const method of ALL_METHODS) {
      expect(PARAM_KEYS_BY_METHOD[method]).toBeDefined();
    }
  });
});

describe('resetParamsForMethod', () => {
  const pitchParams: PitchParams = {
    rangeLength: 10,
    endLength1: 1,
    endLength2: 1,
    pitchLength: 2,
    length: 3,
    weight: 4,
  };

  const areaVolumeParams: AreaVolumeParams = {
    width: 2,
    depth: 3,
    height: 4,
    weight: 5,
  };

  const countParams: CountParams = {
    count: 7,
    length: 3,
    weight: 4,
  };

  describe('ピッチ → 箇所数（REQ-48.1, REQ-48.2）', () => {
    it('ピッチ固有のキーを破棄し、共通キー（長さ・重量）を引き継ぐ', () => {
      const result = resetParamsForMethod(pitchParams, 'COUNT');

      expect(result).toEqual({ length: 3, weight: 4 });
    });

    it('破棄されるキーがオブジェクトに残らない', () => {
      const result = resetParamsForMethod(pitchParams, 'COUNT') as CountParams;

      expect(Object.keys(result)).toEqual(['length', 'weight']);
      expect(result).not.toHaveProperty('rangeLength');
      expect(result).not.toHaveProperty('endLength1');
      expect(result).not.toHaveProperty('endLength2');
      expect(result).not.toHaveProperty('pitchLength');
    });
  });

  describe('面積・体積 → ピッチ（REQ-48.1, REQ-48.2）', () => {
    it('幅・奥行き・高さを破棄し、重量を引き継ぐ', () => {
      const result = resetParamsForMethod(areaVolumeParams, 'PITCH');

      expect(result).toEqual({ weight: 5 });
      expect(result).not.toHaveProperty('width');
      expect(result).not.toHaveProperty('depth');
      expect(result).not.toHaveProperty('height');
    });
  });

  describe('箇所数 → 面積・体積（REQ-48.1, REQ-48.2）', () => {
    it('箇所数・長さを破棄し、重量を引き継ぐ', () => {
      const result = resetParamsForMethod(countParams, 'AREA_VOLUME');

      expect(result).toEqual({ weight: 4 });
      expect(result).not.toHaveProperty('count');
      expect(result).not.toHaveProperty('length');
    });
  });

  describe('任意の方式 → 標準', () => {
    it.each<[string, PitchParams | AreaVolumeParams | CountParams]>([
      ['ピッチ', pitchParams],
      ['面積・体積', areaVolumeParams],
      ['箇所数', countParams],
    ])('%s から標準へ切り替えると null になる', (_label, params) => {
      expect(resetParamsForMethod(params, 'STANDARD')).toBeNull();
    });
  });

  describe('パラメータが未設定の場合', () => {
    it.each<CalculationMethod>(['STANDARD', 'AREA_VOLUME', 'PITCH', 'COUNT'])(
      'params が null なら %s への切替でも null を返す',
      (method) => {
        expect(resetParamsForMethod(null, method)).toBeNull();
      }
    );
  });

  it('同一方式への切替では有効なキーがすべて保持される', () => {
    expect(resetParamsForMethod(countParams, 'COUNT')).toEqual({
      count: 7,
      length: 3,
      weight: 4,
    });
    expect(resetParamsForMethod(pitchParams, 'PITCH')).toEqual(pitchParams);
  });

  it('入力オブジェクトを破壊せず、新しいオブジェクトを返す', () => {
    const original: PitchParams = { ...pitchParams };
    const result = resetParamsForMethod(original, 'COUNT');

    expect(result).not.toBe(original);
    expect(original).toEqual(pitchParams);
  });

  it('未定義値のキーは引き継がれない（未入力の共通フィールド）', () => {
    const partial: PitchParams = { rangeLength: 10, length: 3 };

    expect(resetParamsForMethod(partial, 'COUNT')).toEqual({ length: 3 });
  });
});
