/**
 * @fileoverview インポートダイアログコンポーネント
 *
 * Task 46.1-46.5: インポートダイアログUI
 *
 * Requirements:
 * - 27.1-27.8: ファイルアップロード・処理起動
 * - 28.4, 28.5, 28.7: 抽出結果プレビュー表示
 * - 31.1-31.9: 一括取り込み
 * - 32.1-32.6: フィールドマッピング調整
 * - 33.1-33.5: リトライ・再アップロード
 * - 34.1-34.5: インラインプレビュー
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';
import type {
  ImportTargetField,
  ImportFieldMappingConfig,
  ImportQuantityItem,
} from '../../types/quantity-import.types';
import { useImportDataExtractor } from './useImportDataExtractor';
import { autoDetectFieldMapping, convertToQuantityItems } from './field-mapping';
import { ImportPreviewTable } from './ImportPreviewTable';
import { FileInlinePreview } from '../estimate-requests/FileInlinePreview';

// ============================================================================
// 許可するファイル拡張子
// ============================================================================
const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.pdf'];
const ACCEPTED_FILE_INPUT = '.xlsx,.xls,.pdf';

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * 拡張子ごとのプレビュー用 MIME 型。
 * 受け付けの判定は拡張子で行うため、プレビューの種別も拡張子から決める
 * （ブラウザや OS によっては .xls の MIME 型が空や別の値で報告される）。
 */
const PREVIEW_MIME_TYPE_BY_EXTENSION: ReadonlyArray<readonly [string, string]> = [
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.pdf', 'application/pdf'],
];

/**
 * インラインプレビューへ渡すファイルを返す（REQ-34.2 / 34.3）。
 * MIME 型が拡張子と食い違う場合だけ、同じ内容で MIME 型を揃えたファイルを作る。
 */
function toPreviewFile(file: File): File {
  const name = file.name.toLowerCase();
  const entry = PREVIEW_MIME_TYPE_BY_EXTENSION.find(([ext]) => name.endsWith(ext));
  if (!entry || file.type === entry[1]) return file;
  return new File([file], file.name, { type: entry[1], lastModified: file.lastModified });
}

// ============================================================================
// Props
// ============================================================================

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (groupId: string, items: ImportQuantityItem[]) => Promise<void>;
  groups: QuantityGroupDetail[];
}

// ============================================================================
// コンポーネント
// ============================================================================

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  groups,
}) => {
  const extractor = useImportDataExtractor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // フィールドマッピング
  const [fieldMapping, setFieldMapping] = useState<ImportFieldMappingConfig | null>(null);

  // UIの状態
  const [fileError, setFileError] = useState<string | null>(null);
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // インラインプレビューの対象ファイル（REQ-34.1）
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  // ドラッグ&ドロップ
  const [isDragging, setIsDragging] = useState(false);

  // 抽出完了時にフィールドマッピングを自動検出
  useEffect(() => {
    if (extractor.result) {
      const mapping = autoDetectFieldMapping(
        extractor.result.headers,
        extractor.result.rows.slice(0, 5)
      );
      setFieldMapping(mapping);
      setImportMessage(null);
      setShowGroupSelector(false);
    }
  }, [extractor.result]);

  // ファイル処理
  const handleFile = useCallback(
    (file: File) => {
      setFileError(null);
      setImportMessage(null);
      setShowGroupSelector(false);

      if (!isAcceptedFile(file)) {
        setFileError(
          '対応していないファイル形式です。Excel（.xlsx、.xls）またはPDF（.pdf）ファイルを選択してください。'
        );
        return;
      }

      setPreviewFile(toPreviewFile(file));
      extractor.reset();
      extractor.startExtraction(file);
    },
    [extractor]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      // input値をリセットして同じファイルの再選択を可能にする
      e.target.value = '';
    },
    [handleFile]
  );

  // ドラッグ&ドロップハンドラ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  // フィールドマッピング変更
  const handleFieldMappingChange = useCallback(
    (columnIndex: number, targetField: ImportTargetField) => {
      setFieldMapping((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          mappings: {
            ...prev.mappings,
            [columnIndex]: targetField,
          },
        };
      });
    },
    []
  );

  // 一括取り込み
  const handleBulkImportClick = useCallback(() => {
    setShowGroupSelector(true);
  }, []);

  const handleGroupSelect = useCallback(
    async (groupId: string) => {
      if (!extractor.result || !fieldMapping) return;

      setIsImporting(true);
      try {
        const items = convertToQuantityItems(extractor.result.rows, fieldMapping);
        await onImport(groupId, items);
        setShowGroupSelector(false);
        setImportMessage(
          `${items.length}件の数量項目を取り込みました。取り込み結果を確認・修正してください。`
        );
      } catch {
        setImportMessage('取り込みに失敗しました。');
      } finally {
        setIsImporting(false);
      }
    },
    [extractor.result, fieldMapping, onImport]
  );

  if (!isOpen) return null;

  const isProcessing = extractor.status === 'processing';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quantity-import-dialog-title"
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '1400px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2
            id="quantity-import-dialog-title"
            style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}
          >
            数量表インポート
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {/* ファイルアップロードエリア */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? '#2563eb' : '#d1d5db'}`,
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
            marginBottom: '16px',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
        >
          <p style={{ margin: '0 0 12px', color: '#374151' }}>
            ファイルをドラッグ&ドロップ、またはファイルを選択してください
          </p>
          <input
            type="file"
            accept={ACCEPTED_FILE_INPUT}
            onChange={handleFileInput}
            disabled={isProcessing}
            ref={fileInputRef}
            aria-label="ファイルを選択"
            style={{ fontSize: '14px' }}
          />
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280' }}>
            対応形式: Excel（.xlsx、.xls）、PDF（.pdf）
          </p>
        </div>

        {/* ファイル形式エラー */}
        {fileError && (
          <div
            role="alert"
            style={{
              padding: '8px 12px',
              marginBottom: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#991b1b',
              fontSize: '13px',
            }}
          >
            {fileError}
          </div>
        )}

        {/* インラインプレビュー（左）と抽出結果（右）を同じ行に並べる（REQ-34.5） */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'flex-start',
          }}
        >
          {previewFile && (
            <section aria-label="ファイルプレビュー" style={{ flex: '1 1 360px', minWidth: 0 }}>
              <FileInlinePreview file={previewFile} showPageNavigationForSinglePage />
            </section>
          )}

          <section
            aria-label="抽出結果"
            style={{ flex: '1 1 360px', minWidth: 0, overflowX: 'auto' }}
          >
            {/* 処理中インジケーター */}
            {isProcessing && (
              <div style={{ marginBottom: '16px' }}>
                <div
                  role="progressbar"
                  aria-valuenow={extractor.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${extractor.progress}%`,
                      height: '100%',
                      backgroundColor: '#2563eb',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {extractor.progressMessage}
                </p>
              </div>
            )}

            {/* エラー表示とリトライ */}
            {extractor.status === 'error' && extractor.error && (
              <div
                role="alert"
                style={{
                  padding: '12px',
                  marginBottom: '16px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#991b1b', fontSize: '13px' }}>{extractor.error}</span>
                <button
                  type="button"
                  onClick={extractor.retry}
                  aria-label="リトライ"
                  style={{
                    padding: '4px 12px',
                    fontSize: '13px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  リトライ
                </button>
              </div>
            )}

            {/* 抽出結果プレビュー */}
            {extractor.status === 'completed' && extractor.result && fieldMapping && (
              <div>
                {/* 抽出結果のテキストデータ（REQ-29.7 / 29.8） */}
                {extractor.result.extractedText !== undefined && (
                  <section aria-labelledby="quantity-import-extracted-text-title">
                    <h3
                      id="quantity-import-extracted-text-title"
                      style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 8px' }}
                    >
                      抽出テキスト
                    </h3>
                    <pre
                      data-testid="import-extracted-text"
                      style={{
                        margin: '0 0 16px',
                        padding: '12px 16px',
                        maxHeight: '200px',
                        overflow: 'auto',
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#374151',
                        lineHeight: '1.6',
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                        cursor: 'text',
                      }}
                    >
                      {extractor.result.extractedText}
                    </pre>
                  </section>
                )}

                <ImportPreviewTable
                  extractionResult={extractor.result}
                  fieldMapping={fieldMapping}
                  onFieldMappingChange={handleFieldMappingChange}
                />

                {/* 取り込みメッセージ */}
                {importMessage && (
                  <div
                    style={{
                      padding: '8px 12px',
                      marginTop: '12px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #22c55e',
                      borderRadius: '4px',
                      color: '#166534',
                      fontSize: '13px',
                    }}
                  >
                    {importMessage}
                  </div>
                )}

                {/* 一括取り込みボタン */}
                {!showGroupSelector && !importMessage && (
                  <div style={{ marginTop: '16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={handleBulkImportClick}
                      aria-label="一括取り込み"
                      disabled={isImporting}
                      style={{
                        padding: '8px 20px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      一括取り込み
                    </button>
                  </div>
                )}

                {/* グループ選択UI */}
                {showGroupSelector && (
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                      取り込み先グループを選択
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => handleGroupSelect(group.id)}
                          disabled={isImporting}
                          style={{
                            padding: '10px 16px',
                            fontSize: '14px',
                            backgroundColor: '#fff',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: isImporting ? 'wait' : 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          {group.name || `グループ ${group.displayOrder}`}
                          <span style={{ color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                            ({group.itemCount}項目)
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGroupSelector(false)}
                      style={{
                        marginTop: '12px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        backgroundColor: 'transparent',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: '#6b7280',
                      }}
                    >
                      キャンセル
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
