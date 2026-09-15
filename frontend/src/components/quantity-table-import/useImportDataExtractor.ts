/**
 * @fileoverview インポートデータ抽出カスタムフック
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
 *
 * 処理中にドロップ領域から別ファイルが渡されても、追い越された処理（およびリセット前に
 * 始めた処理）の結果・エラー・進捗は状態へ反映しない（最後に始めた処理だけが状態を更新する）。
 */

import { useState, useCallback, useRef } from 'react';
import type { ImportExtractionResult } from '../../types/quantity-import.types';

/**
 * 処理状態
 */
export type ExtractorStatus = 'idle' | 'processing' | 'completed' | 'error';

/**
 * useImportDataExtractorの戻り値
 */
export interface UseImportDataExtractorResult {
  status: ExtractorStatus;
  progress: number;
  progressMessage: string;
  result: ImportExtractionResult | null;
  error: string | null;
  startExtraction: (file: File) => void;
  retry: () => void;
  reset: () => void;
}

/**
 * インポートデータ抽出カスタムフック
 *
 * ファイル種別（Excel/PDF）に応じて適切な抽出処理を自動選択する。
 */
export function useImportDataExtractor(): UseImportDataExtractorResult {
  const [status, setStatus] = useState<ExtractorStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ImportExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const generationRef = useRef(0);

  const processFile = useCallback(async (file: File) => {
    // 追い越された処理（後から別の処理が始まった、またはリセットされた）は状態を更新しない（REQ-33.5）
    const generation = ++generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    setStatus('processing');
    setProgress(0);
    setProgressMessage('処理を開始しています...');
    setError(null);
    setResult(null);

    const onProgress = (p: number, message?: string) => {
      if (!isCurrent()) return;
      setProgress(p);
      if (message) setProgressMessage(message);
    };

    try {
      const fileName = file.name.toLowerCase();
      let extractionResult: ImportExtractionResult;

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Excelファイル: データパース
        onProgress(10, 'Excelファイルを読み取り中...');
        const { parseExcelFile } = await import('./excel-parser');
        extractionResult = await parseExcelFile(file);
        onProgress(100, 'データパース完了');
      } else if (fileName.endsWith('.pdf')) {
        // PDFファイル: OCR処理
        const { extractPdfData } = await import('./pdf-ocr-extractor');
        extractionResult = await extractPdfData(file, onProgress);
      } else {
        throw new Error(
          '対応していないファイル形式です。Excel（.xlsx、.xls）またはPDF（.pdf）ファイルを選択してください。'
        );
      }

      if (!isCurrent()) return;
      setResult(extractionResult);
      setStatus('completed');
    } catch (err) {
      if (!isCurrent()) return;
      const message = err instanceof Error ? err.message : 'ファイルの処理中にエラーが発生しました';
      setError(message);
      setStatus('error');
    }
  }, []);

  const startExtraction = useCallback(
    (file: File) => {
      lastFileRef.current = file;
      processFile(file);
    },
    [processFile]
  );

  const retry = useCallback(() => {
    if (lastFileRef.current) {
      processFile(lastFileRef.current);
    }
  }, [processFile]);

  const reset = useCallback(() => {
    // 進行中の処理を追い越し済みにし、リセット後の状態を書き換えさせない（REQ-33.5）
    generationRef.current += 1;
    setStatus('idle');
    setProgress(0);
    setProgressMessage('');
    setResult(null);
    setError(null);
    lastFileRef.current = null;
  }, []);

  return {
    status,
    progress,
    progressMessage,
    result,
    error,
    startExtraction,
    retry,
    reset,
  };
}
