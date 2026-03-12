/**
 * @fileoverview フィールドマッピング機能
 *
 * Task 45.1: フィールドマッピング自動推定機能
 * Task 45.2: 抽出結果を数量項目に変換する関数
 *
 * Requirements:
 * - 32.4: 抽出結果の列名やデータ内容に基づいてマッピング先フィールドを自動推定する
 * - 32.5: 自動推定されたマッピングをユーザーが変更可能な状態で表示する
 * - 31.4: 一括取り込み時に各列データを対応フィールドに自動入力する
 * - 31.5: 一括取り込み時に計算方法を「標準」に設定する
 */

import type {
  ImportTargetField,
  ImportFieldMappingConfig,
  ImportExtractedRow,
  ImportQuantityItem,
} from '../../types/quantity-import.types';

/**
 * マッピング推定ルール
 *
 * ヘッダー名に含まれるキーワードからマッピング先を推定する。
 * 推定ルール（上から優先的に評価）:
 * - 「大項目」「大分類」 → majorCategory
 * - 「中項目」「中分類」 → middleCategory
 * - 「小項目」「小分類」 → minorCategory
 * - 「任意分類」「分類」 → customCategory
 * - 「工種」 → workType
 * - 「名称」「品名」「品目」 → name
 * - 「規格」「仕様」 → specification
 * - 「数量」 → quantity
 * - 「単位」 → unit
 * - 「備考」「摘要」「コメント」 → remarks
 * - 該当なし → skip
 */
const MAPPING_RULES: Array<{ keywords: string[]; target: ImportTargetField }> = [
  { keywords: ['大項目', '大分類'], target: 'majorCategory' },
  { keywords: ['中項目', '中分類'], target: 'middleCategory' },
  { keywords: ['小項目', '小分類'], target: 'minorCategory' },
  { keywords: ['任意分類'], target: 'customCategory' },
  { keywords: ['分類'], target: 'customCategory' },
  { keywords: ['工種'], target: 'workType' },
  { keywords: ['名称', '品名', '品目'], target: 'name' },
  { keywords: ['規格', '仕様'], target: 'specification' },
  { keywords: ['数量'], target: 'quantity' },
  { keywords: ['単位'], target: 'unit' },
  { keywords: ['備考', '摘要', 'コメント'], target: 'remarks' },
];

/**
 * フィールドマッピング自動推定
 *
 * ヘッダー名やデータ内容に基づいてマッピング先を推定する。
 *
 * @param headers ヘッダー名リスト
 * @param _sampleRows サンプル行データ（将来の推定精度向上用）
 * @returns マッピング設定
 */
export function autoDetectFieldMapping(
  headers: string[],
  _sampleRows: ImportExtractedRow[]
): ImportFieldMappingConfig {
  const mappings: Record<number, ImportTargetField> = {};

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i] || '';
    let matched = false;

    for (const rule of MAPPING_RULES) {
      if (rule.keywords.some((keyword) => header.includes(keyword))) {
        mappings[i] = rule.target;
        matched = true;
        break;
      }
    }

    if (!matched) {
      mappings[i] = 'skip';
    }
  }

  return { mappings };
}

/**
 * 抽出結果をマッピング設定に基づいて数量項目に変換する
 *
 * @param rows 抽出された行データ
 * @param mapping フィールドマッピング設定
 * @returns 数量項目データの配列
 */
export function convertToQuantityItems(
  rows: ImportExtractedRow[],
  mapping: ImportFieldMappingConfig
): ImportQuantityItem[] {
  return rows.map((row) => {
    const item: ImportQuantityItem = {
      majorCategory: '',
      middleCategory: '',
      minorCategory: '',
      customCategory: '',
      workType: '',
      name: '',
      specification: '',
      quantity: 0,
      unit: '',
      remarks: '',
      calculationMethod: 'STANDARD',
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
    };

    for (const [colIndexStr, targetField] of Object.entries(mapping.mappings)) {
      const colIndex = Number(colIndexStr);
      const value = row.columns[colIndex] ?? '';

      if (targetField === 'skip') continue;

      if (targetField === 'quantity') {
        const numValue = parseFloat(value.replace(/,/g, ''));
        item.quantity = isNaN(numValue) ? 0 : numValue;
      } else {
        item[targetField] = value;
      }
    }

    return item;
  });
}
