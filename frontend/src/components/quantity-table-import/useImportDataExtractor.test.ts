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

    // 第3引数の中断のシグナルは、リセットとアンマウントで OCR を止めるためのもの（Task 98.4）
    expect(extractPdfData).toHaveBeenCalledWith(file, expect.any(Function), {
      signal: expect.any(AbortSignal),
    });
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

  /**
   * 追い越された処理の結果が新しいファイルの状態を上書きしない。
   *
   * 処理中でもドロップ領域からは別のファイルを渡せるため、先に始めた処理の解決（または
   * 30秒の時間切れ）が後から届くことがある。最後に始めた処理（と、リセットより後に始めた処理）
   * だけが状態を更新してよい。
   *
   * @requirement quantity-table-generation/REQ-33.5: 別ファイル選択時に前回の抽出結果をクリアし、新しいファイルの処理を開始する
   */
  describe('追い越された処理の結果を捨てる (REQ-33.5)', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    const resultA: ImportExtractionResult = {
      headers: ['名称'],
      rows: [{ columns: ['先のファイルの行'], sourceRowIndex: 0 }],
      extractionType: 'excel-parse',
    };
    const resultB: ImportExtractionResult = {
      headers: ['名称'],
      rows: [{ columns: ['後のファイルの行'], sourceRowIndex: 0 }],
      extractionType: 'excel-parse',
    };

    it('後から始めた処理が先に終わっても、先の処理の遅れて届いた結果で上書きしない', async () => {
      const { parseExcelFile } = await import('./excel-parser');
      const runA = deferred<ImportExtractionResult>();
      const runB = deferred<ImportExtractionResult>();
      vi.mocked(parseExcelFile)
        .mockImplementationOnce(() => runA.promise)
        .mockImplementationOnce(() => runB.promise);

      const { result } = renderHook(() => useImportDataExtractor());

      await act(async () => {
        result.current.startExtraction(createMockFile('a.xlsx'));
      });
      await act(async () => {
        result.current.startExtraction(createMockFile('b.xlsx'));
      });
      await vi.waitFor(() => expect(parseExcelFile).toHaveBeenCalledTimes(2));

      await act(async () => {
        runB.resolve(resultB);
      });
      expect(result.current.status).toBe('completed');
      expect(result.current.result).toEqual(resultB);

      await act(async () => {
        runA.resolve(resultA);
      });
      expect(result.current.status).toBe('completed');
      expect(result.current.result).toEqual(resultB);
    });

    it('先の処理の失敗（時間切れ）が後から届いても、エラーを出さず後のファイルの状態を保つ', async () => {
      const { parseExcelFile } = await import('./excel-parser');
      const { extractPdfData } = await import('./pdf-ocr-extractor');
      const runA = deferred<ImportExtractionResult>();
      let progressA: ((p: number, message?: string) => void) | undefined;
      vi.mocked(extractPdfData).mockImplementationOnce((_file, onProgress) => {
        progressA = onProgress;
        return runA.promise;
      });
      vi.mocked(parseExcelFile).mockResolvedValueOnce(resultB);

      const { result } = renderHook(() => useImportDataExtractor());

      await act(async () => {
        result.current.startExtraction(createMockFile('a.pdf'));
      });
      await vi.waitFor(() => expect(extractPdfData).toHaveBeenCalledTimes(1));

      await act(async () => {
        result.current.startExtraction(createMockFile('b.xlsx'));
      });
      expect(result.current.status).toBe('completed');
      expect(result.current.result).toEqual(resultB);

      // 追い越された処理の進捗は、新しいファイルの進捗を書き換えない
      await act(async () => {
        progressA?.(40, '先のファイルの進捗');
      });
      expect(result.current.progress).toBe(100);
      expect(result.current.progressMessage).toBe('データパース完了');

      await act(async () => {
        runA.reject(new Error('OCR処理が時間切れになりました'));
      });
      expect(result.current.status).toBe('completed');
      expect(result.current.error).toBeNull();
      expect(result.current.result).toEqual(resultB);
    });

    it('リセットより前に始めた処理の結果・進捗は、リセット後の状態を変えない', async () => {
      const { parseExcelFile } = await import('./excel-parser');
      const runA = deferred<ImportExtractionResult>();
      vi.mocked(parseExcelFile).mockImplementationOnce(() => runA.promise);

      const { result } = renderHook(() => useImportDataExtractor());

      await act(async () => {
        result.current.startExtraction(createMockFile('a.xlsx'));
      });
      await vi.waitFor(() => expect(parseExcelFile).toHaveBeenCalledTimes(1));

      act(() => {
        result.current.reset();
      });

      await act(async () => {
        runA.resolve(resultA);
      });
      expect(result.current.status).toBe('idle');
      expect(result.current.result).toBeNull();
      expect(result.current.progress).toBe(0);
      expect(result.current.progressMessage).toBe('');
    });

    it('リセットより前に始めた処理の失敗は、リセット後にエラーを出さない', async () => {
      const { parseExcelFile } = await import('./excel-parser');
      const runA = deferred<ImportExtractionResult>();
      vi.mocked(parseExcelFile).mockImplementationOnce(() => runA.promise);

      const { result } = renderHook(() => useImportDataExtractor());

      await act(async () => {
        result.current.startExtraction(createMockFile('a.xlsx'));
      });
      await vi.waitFor(() => expect(parseExcelFile).toHaveBeenCalledTimes(1));

      act(() => {
        result.current.reset();
      });

      await act(async () => {
        runA.reject(new Error('ファイル読み取りエラー'));
      });
      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBeNull();
    });

    it('追い越しの後のリトライは最後に選んだファイルを再処理し、先の処理の結果を受け付けない', async () => {
      const { parseExcelFile } = await import('./excel-parser');
      const runA = deferred<ImportExtractionResult>();
      vi.mocked(parseExcelFile)
        .mockImplementationOnce(() => runA.promise)
        .mockRejectedValueOnce(new Error('一時エラー'))
        .mockResolvedValueOnce(resultB);

      const { result } = renderHook(() => useImportDataExtractor());
      const fileA = createMockFile('a.xlsx');
      const fileB = createMockFile('b.xlsx');

      await act(async () => {
        result.current.startExtraction(fileA);
      });
      await act(async () => {
        result.current.startExtraction(fileB);
      });
      expect(result.current.status).toBe('error');

      await act(async () => {
        result.current.retry();
      });
      expect(parseExcelFile).toHaveBeenCalledTimes(3);
      expect(vi.mocked(parseExcelFile).mock.calls[2]?.[0]).toBe(fileB);
      expect(result.current.status).toBe('completed');
      expect(result.current.result).toEqual(resultB);

      await act(async () => {
        runA.resolve(resultA);
      });
      expect(result.current.result).toEqual(resultB);
    });
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
