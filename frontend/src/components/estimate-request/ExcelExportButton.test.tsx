/**
 * @fileoverview ExcelExportButtonコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.7: ExcelExportButtonコンポーネントを実装する
 *
 * Requirements:
 * - 5.4: 「Excelでエクスポート」ボタンをクリックすると選択項目をExcel形式でダウンロード
 * - 5.5: 項目が選択されていない場合ボタンを無効化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExcelExportButton } from './ExcelExportButton';
import type { ItemWithSelectionInfo } from '../../types/estimate-request.types';

// xlsxのモック
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn().mockReturnValue(new ArrayBuffer(0)),
}));

import * as XLSX from 'xlsx';

describe('ExcelExportButton', () => {
  const mockSelectedItems: ItemWithSelectionInfo[] = [
    {
      id: 'item-1',
      estimateRequestItemId: 'eri-1',
      customCategory: 'カテゴリA',
      workType: '仮設工事',
      name: '足場設置',
      specification: 'H=10m',
      unit: 'm2',
      quantity: 100,
      displayOrder: 1,
      selected: true,
      otherRequests: [],
    },
    {
      id: 'item-2',
      estimateRequestItemId: 'eri-2',
      customCategory: 'カテゴリB',
      workType: '解体工事',
      name: '内装解体',
      specification: null,
      unit: '式',
      quantity: 1,
      displayOrder: 2,
      selected: true,
      otherRequests: [],
    },
  ];

  const emptyItems: ItemWithSelectionInfo[] = [];

  beforeEach(() => {
    vi.clearAllMocks();

    // URLのモック
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  describe('基本レンダリング', () => {
    it('ボタンを表示する', () => {
      render(
        <ExcelExportButton selectedItems={mockSelectedItems} estimateRequestName="見積依頼#1" />
      );

      expect(screen.getByRole('button', { name: /Excelでエクスポート/ })).toBeInTheDocument();
    });

    it('Excelアイコンを表示する', () => {
      render(
        <ExcelExportButton selectedItems={mockSelectedItems} estimateRequestName="見積依頼#1" />
      );

      expect(screen.getByTestId('excel-icon')).toBeInTheDocument();
    });
  });

  describe('エクスポート機能', () => {
    it('ボタンクリックでxlsxライブラリが呼ばれる（Requirements: 5.4）', async () => {
      render(
        <ExcelExportButton selectedItems={mockSelectedItems} estimateRequestName="見積依頼#1" />
      );

      const button = screen.getByRole('button', { name: /Excelでエクスポート/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(XLSX.utils.json_to_sheet).toHaveBeenCalled();
        expect(XLSX.utils.book_new).toHaveBeenCalled();
        expect(XLSX.write).toHaveBeenCalled();
      });
    });

    it('Blobオブジェクトが生成される', async () => {
      render(
        <ExcelExportButton selectedItems={mockSelectedItems} estimateRequestName="見積依頼#1" />
      );

      const button = screen.getByRole('button', { name: /Excelでエクスポート/ });
      fireEvent.click(button);

      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('無効状態', () => {
    it('項目が選択されていない場合ボタンを無効化する（Requirements: 5.5）', () => {
      render(<ExcelExportButton selectedItems={emptyItems} estimateRequestName="見積依頼#1" />);

      const button = screen.getByRole('button', { name: /項目を選択してください/ });
      expect(button).toBeDisabled();
    });

    it('disabled=trueの場合はボタンが無効になる', () => {
      render(
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          disabled
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('アクセシビリティ', () => {
    it('ボタンに適切なaria-labelを持つ', () => {
      render(
        <ExcelExportButton selectedItems={mockSelectedItems} estimateRequestName="見積依頼#1" />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });
  });
});
