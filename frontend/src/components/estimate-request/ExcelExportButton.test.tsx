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
 *
 * - タスク103.2: Excel の生成の前の出力の記録と、記録の失敗での中止
 *   （estimate-request の Requirement 42.8・42.9。describe「出力の記録」）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ExcelExportButton } from './ExcelExportButton';
import { ApiError, apiClient } from '../../api/client';
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

    // 出力の記録（POST /api/v1/audit-logs/exports）は既定で成功させる（Requirement 42.8）
    vi.spyOn(apiClient, 'post').mockResolvedValue({ recordId: 'record-1' });
  });

  afterEach(() => {
    vi.mocked(apiClient.post).mockRestore();
  });

  describe('基本レンダリング', () => {
    it('ボタンを表示する', () => {
      render(
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
      );

      expect(screen.getByRole('button', { name: /Excelでエクスポート/ })).toBeInTheDocument();
    });

    it('Excelアイコンを表示する', () => {
      render(
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
      );

      expect(screen.getByTestId('excel-icon')).toBeInTheDocument();
    });
  });

  describe('エクスポート機能', () => {
    it('ボタンクリックでxlsxライブラリが呼ばれる（Requirements: 5.4）', async () => {
      render(
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
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
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
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
      render(
        <ExcelExportButton
          selectedItems={emptyItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
      );

      const button = screen.getByRole('button', { name: /項目を選択してください/ });
      expect(button).toBeDisabled();
    });

    it('disabled=trueの場合はボタンが無効になる', () => {
      render(
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
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
        <ExcelExportButton
          selectedItems={mockSelectedItems}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });
  });

  // ==========================================================================
  // タスク103.2: 出力の事前記録（Requirement 42.8, 42.9。user-authentication の要件40.9〜40.11）
  // ==========================================================================

  describe('出力の記録 (Requirement 42.8, 42.9)', () => {
    /** 表示の文言の完全一致（余計な文言が付け足されていないこと） */
    const RECORD_FAILED_EXACT = /^出力を記録できなかったため中止しました$/;

    function renderButton(items: ItemWithSelectionInfo[] = mockSelectedItems) {
      return render(
        <ExcelExportButton
          selectedItems={items}
          estimateRequestName="見積依頼#1"
          projectId="project-1"
        />
      );
    }

    it('生成を始める前に出力の記録を種別・案件・対象の項目つきで1回要求する', async () => {
      const postSpy = vi.mocked(apiClient.post);
      renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));

      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
      });
      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith('/api/v1/audit-logs/exports', {
        kind: 'estimate_request_xlsx',
        projectId: 'project-1',
        targetIds: ['eri-1', 'eri-2'],
        itemCount: 2,
      });
      // 記録の要求が Excel の生成より先に行われている
      expect(postSpy.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(XLSX.write).mock.invocationCallOrder[0]!
      );
    });

    it('記録の要求が失敗すると Excel を生成もダウンロードもせずエラーメッセージを表示する', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(XLSX.write).not.toHaveBeenCalled();
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
      // 記録の失敗の後は再び出力を始められる
      expect(screen.getByRole('button', { name: /Excelでエクスポート/ })).toBeEnabled();
    });

    it('記録の応答に記録の ID が無いときも Excel を生成しない', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({});
      renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);
      expect(XLSX.write).not.toHaveBeenCalled();
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('記録の失敗の後に出力が成功するとエラーメッセージが消える', async () => {
      vi.mocked(apiClient.post)
        .mockRejectedValueOnce(new ApiError(500, 'Internal Server Error'))
        .mockResolvedValueOnce({ recordId: 'record-2' });
      renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent(RECORD_FAILED_EXACT);

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));
      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('項目が選択されていないときは記録を要求しない (Requirements: 5.3, 5.5)', () => {
      renderButton(emptyItems);

      fireEvent.click(screen.getByRole('button', { name: /項目を選択してください/ }));

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(XLSX.write).not.toHaveBeenCalled();
    });

    it('記録の要求中に重ねて押しても記録の要求と生成は1回だけ', async () => {
      let resolveRecord: (value: { recordId: string }) => void = () => {};
      vi.mocked(apiClient.post).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRecord = resolve as (value: { recordId: string }) => void;
          })
      );
      renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'エクスポート中' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'エクスポート中' }));

      await act(async () => {
        resolveRecord({ recordId: 'record-1' });
      });
      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
      });
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(XLSX.write).toHaveBeenCalledTimes(1);
    });

    it('記録の要求中にボタンが破棄されると、記録の成功の後も生成もダウンロードも始めない', async () => {
      let resolveRecord: (value: { recordId: string }) => void = () => {};
      vi.mocked(apiClient.post).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRecord = resolve as (value: { recordId: string }) => void;
          })
      );
      const { unmount } = renderButton();

      fireEvent.click(screen.getByRole('button', { name: /Excelでエクスポート/ }));
      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledTimes(1);
      });

      unmount();
      await act(async () => {
        resolveRecord({ recordId: 'record-1' });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(XLSX.write).not.toHaveBeenCalled();
      expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    });
  });
});
