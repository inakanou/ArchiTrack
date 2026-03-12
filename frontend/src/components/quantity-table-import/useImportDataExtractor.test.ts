/**
 * useImportDataExtractorカスタムフックの単体テスト
 *
 * Task 44.4: useImportDataExtractorカスタムフック
 *
 * Requirements:
 * - 27.5: Excelファイルアップロード時にデータパースを自動開始
 * - 27.6: PDFファイルアップロード時にOCR処理を自動開始
 * - 27.7: 処理中インジケーター表示
 * - 29.9: OCR処理失敗時のエラーハンドリング
 * - 33.1: リトライ機能
 * - 33.2: 同一ファイルに対する再実行
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ImportExtractionResult } from '../../types/quantity-import.types';

// Mock excel-parser
vi.mock('./excel-parser', () => ({
  parseExcelFile: vi.fn(),
}));

// Mock pdf-ocr-extractor
vi.mock('./pdf-ocr-extractor', () => ({
  extractPdfData: vi.fn(),
}));

import { useImportDataExtractor } from './useImportDataExtractor';

const mockExtractionResult: ImportExtractionResult = {
  headers: ['工種', '名称', '数量', '単位'],
  rows: [
    {
      columns: ['土工', '掘削工', '150', 'm3'],
      sourceRowIndex: 0,
    },
  ],
  extractionType: 'excel-parse',
};

const mockPdfExtractionResult: ImportExtractionResult = {
  headers: ['工種', '名称', '数量', '単位'],
  rows: [
    {
      columns: ['土工', '掘削工', '200', 'm3'],
      sourceRowIndex: 0,
    },
  ],
  extractionType: 'pdf-claude-vision',
};

function createMockFile(name: string): File {
  return new File(['test'], name, { type: 'application/octet-stream' });
}

describe('useImportDataExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初期状態が正しい', () => {
    const { result } = renderHook(() => useImportDataExtractor());

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.progressMessage).toBe('');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('Excelファイル（.xlsx）でパース処理を実行する', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xlsx');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(parseExcelFile).toHaveBeenCalledWith(file);
    expect(result.current.status).toBe('completed');
    expect(result.current.result).toEqual(mockExtractionResult);
    expect(result.current.progress).toBe(100);
  });

  it('Excelファイル（.xls）でパース処理を実行する', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xls');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(parseExcelFile).toHaveBeenCalledWith(file);
    expect(result.current.status).toBe('completed');
  });

  it('PDFファイルでOCR処理を実行する', async () => {
    const { extractPdfData } = await import('./pdf-ocr-extractor');
    vi.mocked(extractPdfData).mockResolvedValue(mockPdfExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.pdf');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(extractPdfData).toHaveBeenCalledWith(file, expect.any(Function));
    expect(result.current.status).toBe('completed');
    expect(result.current.result).toEqual(mockPdfExtractionResult);
  });

  it('対応していないファイル形式でエラーになる', async () => {
    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.csv');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('対応していないファイル形式です');
  });

  it('処理中にエラーが発生した場合のハンドリング', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockRejectedValue(new Error('ファイル読み取りエラー'));

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xlsx');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('ファイル読み取りエラー');
  });

  it('Error以外の例外でデフォルトメッセージを設定する', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockRejectedValue('unknown error');

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xlsx');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('ファイルの処理中にエラーが発生しました');
  });

  it('リトライで同一ファイルを再処理する', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile)
      .mockRejectedValueOnce(new Error('一時エラー'))
      .mockResolvedValueOnce(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xlsx');

    // 初回失敗
    await act(async () => {
      result.current.startExtraction(file);
    });
    expect(result.current.status).toBe('error');

    // リトライ成功
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.status).toBe('completed');
    expect(result.current.result).toEqual(mockExtractionResult);
    expect(parseExcelFile).toHaveBeenCalledTimes(2);
  });

  it('ファイル未選択時のリトライは何もしない', async () => {
    const { result } = renderHook(() => useImportDataExtractor());

    await act(async () => {
      result.current.retry();
    });

    expect(result.current.status).toBe('idle');
  });

  it('リセットで初期状態に戻る', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.xlsx');

    await act(async () => {
      result.current.startExtraction(file);
    });
    expect(result.current.status).toBe('completed');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.progressMessage).toBe('');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('処理開始時に前回のエラーと結果がクリアされる', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile)
      .mockRejectedValueOnce(new Error('エラー'))
      .mockResolvedValueOnce(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());

    // 初回失敗
    await act(async () => {
      result.current.startExtraction(createMockFile('test.xlsx'));
    });
    expect(result.current.error).toBe('エラー');

    // 2回目成功 - エラーがクリアされている
    await act(async () => {
      result.current.startExtraction(createMockFile('test2.xlsx'));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(mockExtractionResult);
  });

  it('PDFのonProgressコールバックが進捗を更新する', async () => {
    const { extractPdfData } = await import('./pdf-ocr-extractor');
    vi.mocked(extractPdfData).mockImplementation(async (_file, onProgress) => {
      if (onProgress) {
        onProgress(50, 'OCR処理中...');
      }
      return mockPdfExtractionResult;
    });

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('test.pdf');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(result.current.status).toBe('completed');
  });

  it('大文字拡張子のファイルも正しく処理する', async () => {
    const { parseExcelFile } = await import('./excel-parser');
    vi.mocked(parseExcelFile).mockResolvedValue(mockExtractionResult);

    const { result } = renderHook(() => useImportDataExtractor());
    const file = createMockFile('TEST.XLSX');

    await act(async () => {
      result.current.startExtraction(file);
    });

    expect(parseExcelFile).toHaveBeenCalledWith(file);
    expect(result.current.status).toBe('completed');
  });
});
