/**
 * @fileoverview 数量表スキーマのテスト
 *
 * 未カバー行のテスト（402-429, 453）:
 * - updateQuantityItemSchema の refine 関数（空白トリムチェック）
 *
 * @module __tests__/unit/schemas/quantity-table.schema.test
 */

import { describe, it, expect } from 'vitest';
import {
  CALCULATION_METHODS,
  PARAMS_SCHEMA_BY_METHOD,
  countParamsSchema,
  createQuantityItemSchema,
  updateQuantityItemSchema,
  copyQuantityTableSchema,
  QUANTITY_TABLE_VALIDATION_MESSAGES,
} from '../../../schemas/quantity-table.schema.js';

describe('quantity-table.schema', () => {
  describe('updateQuantityItemSchema', () => {
    describe('majorCategory フィールド（任意フィールド）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '土工',
        });
        expect(result.success).toBe(true);
      });

      // Req: 大項目は必須ではない（フィールド仕様テーブル参照）
      // デフォルト値は「空白」
      it('空文字列を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '   ',
        });
        expect(result.success).toBe(true);
      });

      it('タブ文字のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\t\t',
        });
        expect(result.success).toBe(true);
      });

      it('改行のみでも受け入れる（必須ではない）', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '\n\n',
        });
        expect(result.success).toBe(true);
      });

      it('nullを受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('workType フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: '舗装工',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.WORK_TYPE_REQUIRED
          );
        }
      });

      it('タブと空白の混合の場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          workType: ' \t \t ',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('name フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          name: 'コンクリート打設',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          name: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.ITEM_NAME_REQUIRED
          );
        }
      });
    });

    describe('unit フィールド（空白トリムバリデーション）', () => {
      it('有効な値を受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: 'm3',
        });
        expect(result.success).toBe(true);
      });

      it('空白のみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: '   ',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.UNIT_REQUIRED
          );
        }
      });

      it('全角スペースのみの場合エラーになる', () => {
        const result = updateQuantityItemSchema.safeParse({
          unit: '　　　',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('複合バリデーション', () => {
      it('複数フィールドを同時に更新できる', () => {
        const result = updateQuantityItemSchema.safeParse({
          majorCategory: '土工',
          workType: '掘削',
          name: '床掘り',
          unit: 'm3',
          quantity: 100,
        });
        expect(result.success).toBe(true);
      });

      it('空のオブジェクトでも成功する（全フィールドオプショナル）', () => {
        const result = updateQuantityItemSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('null許可フィールドはnullを受け入れる', () => {
        const result = updateQuantityItemSchema.safeParse({
          middleCategory: null,
          minorCategory: null,
          customCategory: null,
          specification: null,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  /**
   * Task 67.1: 計算パラメータの検証を計算方法の判別子ベースへ変更する
   *
   * Requirements:
   * - 48.3: ピッチ→箇所数へ切り替えて保存した箇所数を欠落させない
   * - 48.4: ピッチ→面積・体積へ切り替えて保存した寸法を欠落させない
   * - 48.5: 計算パラメータの検証は計算方法に対応する規則で行い、形状から推測しない
   * - 48.6: 指定された計算方法で使用しないフィールドは破棄したうえで保存する
   * - 47.15: 箇所数の数量項目は保存・再読み込みで値が完全復元される
   */
  describe('計算方法を判別子とした計算パラメータ検証（REQ-48）', () => {
    const VALID_GROUP_ID = '123e4567-e89b-12d3-a456-426614174000';

    const baseCreateItem = {
      quantityGroupId: VALID_GROUP_ID,
      workType: '土工',
      name: '掘削',
      unit: 'm3',
      quantity: 10,
    };

    /** ピッチ→他方式へ切り替えた直後に残留する混在パラメータ */
    const mixedParams = {
      rangeLength: 100,
      endLength1: 10,
      endLength2: 10,
      pitchLength: 5,
      count: 5,
      width: 3,
      length: 2,
      weight: 1.5,
    };

    describe('作成スキーマ（createQuantityItemSchema）', () => {
      it('COUNT: 混在パラメータから箇所数系のみを保持しピッチ系を破棄する（REQ-48 AC3/AC5/AC6, REQ-47 AC15）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'COUNT',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({ count: 5, length: 2, weight: 1.5 });
        }
      });

      it('AREA_VOLUME: 混在パラメータから寸法系のみを保持しピッチ系を破棄する（REQ-48 AC4/AC6・既存不具合の回帰）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({ width: 3, weight: 1.5 });
        }
      });

      it('PITCH: 混在パラメータからピッチ系のみを保持し箇所数・幅を破棄する（REQ-48 AC6）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'PITCH',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({
            rangeLength: 100,
            endLength1: 10,
            endLength2: 10,
            pitchLength: 5,
            length: 2,
            weight: 1.5,
          });
        }
      });

      it('STANDARD: 他方式のキーを全て破棄する（REQ-48 AC6）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'STANDARD',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams ?? {}).toEqual({});
        }
      });

      it('STANDARD: 計算パラメータ未指定を受け入れる', () => {
        const result = createQuantityItemSchema.safeParse({ ...baseCreateItem });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams ?? null).toBeNull();
        }
      });

      it('AREA_VOLUME: 寸法のみのパラメータをそのまま保持する（既存正常系）', () => {
        const areaVolumeParams = { width: 10, depth: 5, height: 2, weight: 1.5 };
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'AREA_VOLUME',
          calculationParams: areaVolumeParams,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual(areaVolumeParams);
        }
      });

      it('PITCH: ピッチのみのパラメータをそのまま保持する（既存正常系）', () => {
        const pitchParams = {
          rangeLength: 100,
          endLength1: 10,
          endLength2: 10,
          pitchLength: 5,
          length: 2.5,
          weight: 1.5,
        };
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'PITCH',
          calculationParams: pitchParams,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual(pitchParams);
        }
      });

      it('PITCH: 必須パラメータが欠けている場合はエラーになる（形状推測をしない）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'PITCH',
          calculationParams: { rangeLength: 100 },
        });

        expect(result.success).toBe(false);
      });

      it('COUNT: 箇所数が未指定の場合はエラーになる（REQ-47 AC9）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'COUNT',
          calculationParams: { length: 2 },
        });

        expect(result.success).toBe(false);
      });

      it('COUNT: 計算パラメータ自体が未指定の場合はエラーになる（REQ-47 AC9）', () => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'COUNT',
        });

        expect(result.success).toBe(false);
      });

      it.each([
        ['小数', 2.5],
        ['下限未満', 0],
        ['上限超過', 10000000],
      ])('COUNT: 箇所数が%s（%s）の場合はエラーになる（REQ-47 AC10/AC11）', (_label, count) => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'COUNT',
          calculationParams: { count },
        });

        expect(result.success).toBe(false);
      });

      it.each([
        ['下限', 1],
        ['上限', 9999999],
      ])('COUNT: 箇所数が%s（%s）の場合は受け入れる（REQ-47 AC8）', (_label, count) => {
        const result = createQuantityItemSchema.safeParse({
          ...baseCreateItem,
          calculationMethod: 'COUNT',
          calculationParams: { count },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({ count });
        }
      });
    });

    describe('更新スキーマ（updateQuantityItemSchema）', () => {
      it('COUNT: 混在パラメータから箇所数系のみを保持しピッチ系を破棄する（REQ-48 AC3）', () => {
        const result = updateQuantityItemSchema.safeParse({
          calculationMethod: 'COUNT',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({ count: 5, length: 2, weight: 1.5 });
        }
      });

      it('AREA_VOLUME: 混在パラメータから幅を保持しピッチ系を破棄する（REQ-48 AC4）', () => {
        const result = updateQuantityItemSchema.safeParse({
          calculationMethod: 'AREA_VOLUME',
          calculationParams: { ...mixedParams },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.calculationParams).toEqual({ width: 3, weight: 1.5 });
        }
      });

      it('計算方法・計算パラメータを含まない部分更新では calculationParams を追加しない', () => {
        const result = updateQuantityItemSchema.safeParse({ name: '掘削（変更後）' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect('calculationParams' in result.data).toBe(false);
        }
      });

      it('計算方法を伴わない計算パラメータのみの更新は拒否する（形状推測をしない・REQ-48 AC5）', () => {
        const result = updateQuantityItemSchema.safeParse({
          calculationParams: { count: 5 },
        });

        expect(result.success).toBe(false);
      });
    });

    describe('PARAMS_SCHEMA_BY_METHOD', () => {
      it('全ての計算方法に対応するスキーマを持つ（追加漏れ防止・REQ-48 AC5）', () => {
        for (const method of CALCULATION_METHODS) {
          expect(PARAMS_SCHEMA_BY_METHOD[method]).toBeDefined();
        }
        expect(Object.keys(PARAMS_SCHEMA_BY_METHOD).sort()).toEqual(
          [...CALCULATION_METHODS].sort()
        );
      });
    });

    describe('countParamsSchema（箇所数計算フィールド仕様・REQ-47）', () => {
      it('箇所数・長さ・重量を保持する', () => {
        const countParams = { count: 12, length: 2.5, weight: 1.5 };
        const result = countParamsSchema.safeParse(countParams);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(countParams);
        }
      });

      it('箇所数のみでも成功する（長さ・重量は任意）', () => {
        const result = countParamsSchema.safeParse({ count: 3 });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ count: 3 });
        }
      });

      it('箇所数が未入力の場合はエラーメッセージを返す（REQ-47 AC9）', () => {
        const result = countParamsSchema.safeParse({});

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_REQUIRED
          );
        }
      });

      it('箇所数が小数の場合はエラーメッセージを返す（REQ-47 AC10）', () => {
        const result = countParamsSchema.safeParse({ count: 2.5 });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_NOT_INTEGER
          );
        }
      });

      it('箇所数が範囲外の場合はエラーメッセージを返す（REQ-47 AC11）', () => {
        const result = countParamsSchema.safeParse({ count: 10000000 });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(
            QUANTITY_TABLE_VALIDATION_MESSAGES.COUNT_OUT_OF_RANGE
          );
        }
      });
    });
  });

  /**
   * Task 20.2: コピー用Zodスキーマのテスト
   *
   * Requirements:
   * - 17.2: コピーダイアログで数量表名を入力して作成を確定する
   */
  describe('copyQuantityTableSchema', () => {
    it('有効な数量表名を受け入れる', () => {
      const result = copyQuantityTableSchema.safeParse({ name: 'テスト数量表のコピー' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('テスト数量表のコピー');
      }
    });

    it('1文字の数量表名を受け入れる（最小値）', () => {
      const result = copyQuantityTableSchema.safeParse({ name: 'a' });
      expect(result.success).toBe(true);
    });

    it('200文字の数量表名を受け入れる（最大値）', () => {
      const name = 'あ'.repeat(200);
      const result = copyQuantityTableSchema.safeParse({ name });
      expect(result.success).toBe(true);
    });

    it('空文字列を拒否する', () => {
      const result = copyQuantityTableSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('201文字の数量表名を拒否する（最大値超過）', () => {
      const name = 'あ'.repeat(201);
      const result = copyQuantityTableSchema.safeParse({ name });
      expect(result.success).toBe(false);
    });

    it('nameフィールドが未定義の場合拒否する', () => {
      const result = copyQuantityTableSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('nameフィールドがnullの場合拒否する', () => {
      const result = copyQuantityTableSchema.safeParse({ name: null });
      expect(result.success).toBe(false);
    });

    it('空白のみの数量表名を拒否する', () => {
      const result = copyQuantityTableSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });
  });
});
