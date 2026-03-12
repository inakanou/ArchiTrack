import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ImportPreviewTable } from './ImportPreviewTable';
import type {
  ImportExtractionResult,
  ImportFieldMappingConfig,
} from '../../types/quantity-import.types';

/**
 * ImportPreviewTable コンポーネントのストーリー
 *
 * インポート抽出結果のプレビューテーブル。
 * 各列ヘッダーにマッピング先フィールドのドロップダウンを表示し、
 * 必須フィールド未マッピング時の警告を行う。
 */

const sampleHeaders = ['工種', '名称', '規格', '数量', '単位', '備考'];

const sampleRows = [
  { columns: ['土工', '掘削工', 'バックホウ 0.45m³', '150.0', 'm³', ''], sourceRowIndex: 0 },
  { columns: ['土工', '盛土工', '路体盛土', '200.5', 'm³', '転圧含む'], sourceRowIndex: 1 },
  { columns: ['舗装工', '路盤工', '下層路盤 t=20cm', '320.0', 'm²', ''], sourceRowIndex: 2 },
  { columns: ['舗装工', '表層工', '密粒度 As t=5cm', '310.0', 'm²', ''], sourceRowIndex: 3 },
  { columns: ['排水工', '側溝工', 'U型側溝 300型', '85.0', 'm', '蓋付き'], sourceRowIndex: 4 },
];

const sampleExtractionResult: ImportExtractionResult = {
  headers: sampleHeaders,
  rows: sampleRows,
  extractionType: 'excel-parse',
};

const fullMapping: ImportFieldMappingConfig = {
  mappings: {
    0: 'workType',
    1: 'name',
    2: 'specification',
    3: 'quantity',
    4: 'unit',
    5: 'remarks',
  },
};

const meta = {
  title: 'Components/QuantityTableImport/ImportPreviewTable',
  component: ImportPreviewTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onFieldMappingChange: fn(),
  },
} satisfies Meta<typeof ImportPreviewTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * 全フィールドが正しくマッピングされた状態
 */
export const Default: Story = {
  args: {
    extractionResult: sampleExtractionResult,
    fieldMapping: fullMapping,
  },
};

/**
 * 必須フィールド未マッピング
 * 工種・名称・単位が未マッピングで警告表示
 */
export const MissingRequiredFields: Story = {
  args: {
    extractionResult: sampleExtractionResult,
    fieldMapping: {
      mappings: {
        0: 'skip',
        1: 'skip',
        2: 'specification',
        3: 'quantity',
        4: 'skip',
        5: 'remarks',
      },
    },
  },
};

/**
 * 部分マッピング
 * 一部フィールドのみマッピング
 */
export const PartialMapping: Story = {
  args: {
    extractionResult: sampleExtractionResult,
    fieldMapping: {
      mappings: {
        0: 'workType',
        1: 'name',
        2: 'skip',
        3: 'quantity',
        4: 'unit',
        5: 'skip',
      },
    },
  },
};

/**
 * 多数行データ
 * 50行を超えるデータで行数制限メッセージが表示される
 */
export const ManyRows: Story = {
  args: {
    extractionResult: {
      headers: sampleHeaders,
      rows: Array.from({ length: 60 }, (_, i) => ({
        columns: ['土工', `項目${i + 1}`, '規格A', `${(i + 1) * 10}`, 'm³', ''],
        sourceRowIndex: i,
      })),
      extractionType: 'excel-parse',
    },
    fieldMapping: fullMapping,
  },
};

/**
 * PDF OCR抽出結果
 * PDF OCRで抽出されたデータのプレビュー
 */
export const PdfOcrResult: Story = {
  args: {
    extractionResult: {
      ...sampleExtractionResult,
      extractionType: 'pdf-ocr',
    },
    fieldMapping: fullMapping,
  },
};
