/**
 * @fileoverview インポート抽出結果プレビューテーブル
 *
 * Task 46.3: 抽出結果プレビューテーブルとフィールドマッピング調整UI
 *
 * Requirements:
 * - 28.4: 抽出結果をプレビューテーブルとして表示する
 * - 28.5: 各行のマッピング先フィールドを表示する
 * - 28.7: テキストをユーザーが選択・コピーできる状態で表示する
 * - 32.1: 各列ヘッダーにマッピング先フィールドのドロップダウンを表示する
 * - 32.2: マッピング先フィールドの選択肢を提供する
 * - 32.3: マッピング変更時に即座更新する
 * - 32.6: 必須フィールド未マッピング時の警告
 */

import React from 'react';
import type {
  ImportExtractionResult,
  ImportFieldMappingConfig,
  ImportTargetField,
} from '../../types/quantity-import.types';

/** マッピング先フィールドの選択肢 */
const MAPPING_OPTIONS: Array<{ value: ImportTargetField; label: string }> = [
  { value: 'majorCategory', label: '大項目' },
  { value: 'middleCategory', label: '中項目' },
  { value: 'minorCategory', label: '小項目' },
  { value: 'customCategory', label: '任意分類' },
  { value: 'workType', label: '工種' },
  { value: 'name', label: '名称' },
  { value: 'specification', label: '規格' },
  { value: 'quantity', label: '数量' },
  { value: 'unit', label: '単位' },
  { value: 'remarks', label: '備考' },
  { value: 'skip', label: '取り込まない' },
];

/** 必須フィールド */
const REQUIRED_FIELDS: ImportTargetField[] = ['workType', 'name', 'unit'];

interface ImportPreviewTableProps {
  extractionResult: ImportExtractionResult;
  fieldMapping: ImportFieldMappingConfig;
  onFieldMappingChange: (columnIndex: number, targetField: ImportTargetField) => void;
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  extractionResult,
  fieldMapping,
  onFieldMappingChange,
}) => {
  // 必須フィールド警告チェック
  const mappedFields = Object.values(fieldMapping.mappings);
  const missingRequired = REQUIRED_FIELDS.filter((field) => !mappedFields.includes(field));

  return (
    <div style={{ overflowX: 'auto', userSelect: 'text' }}>
      {missingRequired.length > 0 && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            marginBottom: '8px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#92400e',
          }}
        >
          必須フィールドがマッピングされていません:{' '}
          {missingRequired
            .map((f) => MAPPING_OPTIONS.find((o) => o.value === f)?.label || f)
            .join('、')}
        </div>
      )}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr>
            {extractionResult.headers.map((header, colIndex) => (
              <th
                key={colIndex}
                style={{
                  padding: '4px 8px',
                  borderBottom: '2px solid #d1d5db',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                <div>{header}</div>
                <select
                  value={fieldMapping.mappings[colIndex] || 'skip'}
                  onChange={(e) =>
                    onFieldMappingChange(colIndex, e.target.value as ImportTargetField)
                  }
                  aria-label={`${header}のマッピング先`}
                  style={{
                    width: '100%',
                    fontSize: '12px',
                    padding: '2px 4px',
                    marginTop: '4px',
                  }}
                >
                  {MAPPING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {extractionResult.rows.slice(0, 50).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.columns.map((cell, colIndex) => (
                <td
                  key={colIndex}
                  style={{
                    padding: '4px 8px',
                    borderBottom: '1px solid #e5e7eb',
                    whiteSpace: 'nowrap',
                    maxWidth: '200px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {extractionResult.rows.length > 50 && (
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
          表示: 50 / {extractionResult.rows.length} 行
        </p>
      )}
    </div>
  );
};
