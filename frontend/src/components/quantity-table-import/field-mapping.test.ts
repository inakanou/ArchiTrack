/**
 * フィールドマッピング機能の単体テスト
 *
 * Task 45.1 + 45.2 + 48.4: フィールドマッピング自動推定と数量項目変換
 *
 * Requirements:
 * - 32.4: 抽出結果の列名やデータ内容に基づいてマッピング先フィールドを自動推定する
 * - 32.5: 自動推定されたマッピングをユーザーが変更可能な状態で表示する
 * - 31.4: 一括取り込み時に各列データを対応フィールドに自動入力する
 * - 31.5: 一括取り込み時に計算方法を「標準」に設定する
 */
import { describe, it, expect } from 'vitest';
import { autoDetectFieldMapping, convertToQuantityItems } from './field-mapping';
import type {
  ImportExtractedRow,
  ImportFieldMappingConfig,
} from '../../types/quantity-import.types';

describe('autoDetectFieldMapping', () => {
  it('ヘッダー名「大項目」をmajorCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['大項目', '工種', '名称'], []);
    expect(result.mappings[0]).toBe('majorCategory');
  });

  it('ヘッダー名「大分類」をmajorCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['大分類'], []);
    expect(result.mappings[0]).toBe('majorCategory');
  });

  it('ヘッダー名「中項目」をmiddleCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['中項目'], []);
    expect(result.mappings[0]).toBe('middleCategory');
  });

  it('ヘッダー名「小項目」をminorCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['小項目'], []);
    expect(result.mappings[0]).toBe('minorCategory');
  });

  it('ヘッダー名「任意分類」をcustomCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['任意分類'], []);
    expect(result.mappings[0]).toBe('customCategory');
  });

  it('ヘッダー名「分類」をcustomCategoryにマッピングする', () => {
    const result = autoDetectFieldMapping(['分類'], []);
    expect(result.mappings[0]).toBe('customCategory');
  });

  it('ヘッダー名「工種」をworkTypeにマッピングする', () => {
    const result = autoDetectFieldMapping(['工種'], []);
    expect(result.mappings[0]).toBe('workType');
  });

  it('ヘッダー名「名称」をnameにマッピングする', () => {
    const result = autoDetectFieldMapping(['名称'], []);
    expect(result.mappings[0]).toBe('name');
  });

  it('ヘッダー名「品名」をnameにマッピングする', () => {
    const result = autoDetectFieldMapping(['品名'], []);
    expect(result.mappings[0]).toBe('name');
  });

  it('ヘッダー名「品目」をnameにマッピングする', () => {
    const result = autoDetectFieldMapping(['品目'], []);
    expect(result.mappings[0]).toBe('name');
  });

  it('ヘッダー名「規格」をspecificationにマッピングする', () => {
    const result = autoDetectFieldMapping(['規格'], []);
    expect(result.mappings[0]).toBe('specification');
  });

  it('ヘッダー名「仕様」をspecificationにマッピングする', () => {
    const result = autoDetectFieldMapping(['仕様'], []);
    expect(result.mappings[0]).toBe('specification');
  });

  it('ヘッダー名「数量」をquantityにマッピングする', () => {
    const result = autoDetectFieldMapping(['数量'], []);
    expect(result.mappings[0]).toBe('quantity');
  });

  it('ヘッダー名「単位」をunitにマッピングする', () => {
    const result = autoDetectFieldMapping(['単位'], []);
    expect(result.mappings[0]).toBe('unit');
  });

  it('ヘッダー名「備考」をremarksにマッピングする', () => {
    const result = autoDetectFieldMapping(['備考'], []);
    expect(result.mappings[0]).toBe('remarks');
  });

  it('ヘッダー名「摘要」をremarksにマッピングする', () => {
    const result = autoDetectFieldMapping(['摘要'], []);
    expect(result.mappings[0]).toBe('remarks');
  });

  it('ヘッダー名「コメント」をremarksにマッピングする', () => {
    const result = autoDetectFieldMapping(['コメント'], []);
    expect(result.mappings[0]).toBe('remarks');
  });

  it('該当なしヘッダーをskipにマッピングする', () => {
    const result = autoDetectFieldMapping(['金額', '単価'], []);
    expect(result.mappings[0]).toBe('skip');
    expect(result.mappings[1]).toBe('skip');
  });

  it('複数のヘッダーを正しくマッピングする', () => {
    const headers = ['大項目', '工種', '名称', '規格', '数量', '単位', '備考'];
    const result = autoDetectFieldMapping(headers, []);
    expect(result.mappings[0]).toBe('majorCategory');
    expect(result.mappings[1]).toBe('workType');
    expect(result.mappings[2]).toBe('name');
    expect(result.mappings[3]).toBe('specification');
    expect(result.mappings[4]).toBe('quantity');
    expect(result.mappings[5]).toBe('unit');
    expect(result.mappings[6]).toBe('remarks');
  });
});

describe('convertToQuantityItems', () => {
  const sampleMapping: ImportFieldMappingConfig = {
    mappings: {
      0: 'workType',
      1: 'name',
      2: 'specification',
      3: 'quantity',
      4: 'unit',
      5: 'remarks',
    },
  };

  it('抽出結果をマッピング設定に基づいて数量項目に変換する', () => {
    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', 'バックホウ0.45m3', '150', 'm3', ''], sourceRowIndex: 0 },
    ];

    const result = convertToQuantityItems(rows, sampleMapping);

    expect(result).toHaveLength(1);
    expect(result[0]?.workType).toBe('土工');
    expect(result[0]?.name).toBe('掘削工');
    expect(result[0]?.specification).toBe('バックホウ0.45m3');
    expect(result[0]?.quantity).toBe(150);
    expect(result[0]?.unit).toBe('m3');
    expect(result[0]?.remarks).toBe('');
  });

  it('計算方法は一律「STANDARD」に設定する', () => {
    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', '', '100', 'm3', ''], sourceRowIndex: 0 },
    ];

    const result = convertToQuantityItems(rows, sampleMapping);
    expect(result[0]?.calculationMethod).toBe('STANDARD');
  });

  it('調整係数は1.00、丸め設定は0.01をデフォルト適用する', () => {
    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', '', '100', 'm3', ''], sourceRowIndex: 0 },
    ];

    const result = convertToQuantityItems(rows, sampleMapping);
    expect(result[0]?.adjustmentFactor).toBe(1.0);
    expect(result[0]?.roundingUnit).toBe(0.01);
  });

  it('数量フィールドは数値変換を行い、変換不可の場合は0を設定する', () => {
    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', '', 'abc', 'm3', ''], sourceRowIndex: 0 },
    ];

    const result = convertToQuantityItems(rows, sampleMapping);
    expect(result[0]?.quantity).toBe(0);
  });

  it('skipに設定されたフィールドの値は無視する', () => {
    const mapping: ImportFieldMappingConfig = {
      mappings: {
        0: 'workType',
        1: 'name',
        2: 'skip',
        3: 'quantity',
        4: 'unit',
      },
    };

    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', '無視される値', '100', 'm3'], sourceRowIndex: 0 },
    ];

    const result = convertToQuantityItems(rows, mapping);
    expect(result[0]?.workType).toBe('土工');
    expect(result[0]?.name).toBe('掘削工');
    expect(result[0]?.quantity).toBe(100);
    expect(result[0]?.unit).toBe('m3');
  });

  it('未マッピングのフィールドは空文字を設定する', () => {
    const mapping: ImportFieldMappingConfig = {
      mappings: {
        0: 'workType',
        1: 'name',
      },
    };

    const rows: ImportExtractedRow[] = [{ columns: ['土工', '掘削工'], sourceRowIndex: 0 }];

    const result = convertToQuantityItems(rows, mapping);
    expect(result[0]?.majorCategory).toBe('');
    expect(result[0]?.middleCategory).toBe('');
    expect(result[0]?.specification).toBe('');
    expect(result[0]?.unit).toBe('');
    expect(result[0]?.remarks).toBe('');
  });

  it('複数行を一括変換する', () => {
    const rows: ImportExtractedRow[] = [
      { columns: ['土工', '掘削工', '', '150', 'm3', ''], sourceRowIndex: 0 },
      { columns: ['仮設', '仮設工', '', '1', '式', ''], sourceRowIndex: 1 },
    ];

    const result = convertToQuantityItems(rows, sampleMapping);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('掘削工');
    expect(result[1]?.name).toBe('仮設工');
  });
});
