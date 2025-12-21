/**
 * @fileoverview 現場調査基本情報表示コンポーネント
 *
 * Task 9.1: 現場調査基本情報表示を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 * Task 28.3: 調査報告書出力UIを実装する
 *
 * Requirements:
 * - 1.2: 現場調査詳細画面を表示する際、現場調査の基本情報と関連する画像一覧を表示する
 * - 10.6: PDF報告書のクライアントサイド生成
 * - 11.1: 報告書出力対象写真の選択
 * - 11.8: 調査報告書出力UIを実装する
 * - 12.1: プロジェクトへのアクセス権を持つユーザーは現場調査を閲覧可能
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 *
 * 機能:
 * - 調査名、調査日、メモの表示
 * - 編集ボタン・削除ボタン（権限に基づいて表示/非表示）
 * - 調査報告書出力ボタン（プログレス表示付き）
 * - プロジェクトへの戻り導線
 */

import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { SiteSurveyDetail } from '../../types/site-survey.types';
import { exportAndDownloadPdf, type AnnotatedImage } from '../../services/export';
import { renderImagesWithAnnotations } from '../../services/export/AnnotationRendererService';
import type { PdfExportProgress } from '../../services/export/PdfExportService';

// ============================================================================
// 型定義
// ============================================================================

/**
 * SiteSurveyDetailInfo コンポーネントの Props
 */
export interface SiteSurveyDetailInfoProps {
  /** 現場調査詳細データ */
  survey: SiteSurveyDetail;
  /** 編集ボタンクリック時のハンドラ */
  onEdit: () => void;
  /** 削除ボタンクリック時のハンドラ */
  onDelete: () => void;
  /** 削除処理中フラグ */
  isDeleting?: boolean;
  /** 編集権限があるか（デフォルト: true） */
  canEdit?: boolean;
  /** 削除権限があるか（デフォルト: true） */
  canDelete?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
    marginBottom: '24px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  } as React.CSSProperties,
  titleSection: {
    flex: '1',
    minWidth: '200px',
  } as React.CSSProperties,
  title: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
    margin: 0,
  } as React.CSSProperties,
  projectName: {
    fontSize: '14px',
    color: '#6b7280',
    marginTop: '4px',
  } as React.CSSProperties,
  actionsContainer: {
    display: 'flex',
    gap: '12px',
    flexShrink: 0,
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  editButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#ffffff',
    color: '#dc2626',
    border: '1px solid #dc2626',
  } as React.CSSProperties,
  deleteButtonDisabled: {
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    border: '1px solid #d1d5db',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  pdfButton: {
    backgroundColor: '#059669',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  pdfButtonDisabled: {
    backgroundColor: '#d1d5db',
    color: '#6b7280',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  progressContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    backgroundColor: '#f0f9ff',
    borderRadius: '8px',
    border: '1px solid #bae6fd',
    marginTop: '8px',
  } as React.CSSProperties,
  progressBar: {
    width: '200px',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,
  progressFill: {
    height: '100%',
    backgroundColor: '#0284c7',
    transition: 'width 0.3s ease',
    borderRadius: '4px',
  } as React.CSSProperties,
  progressText: {
    fontSize: '12px',
    color: '#0369a1',
  } as React.CSSProperties,
  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#b91c1c',
    fontSize: '14px',
    marginTop: '8px',
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  field: {
    marginBottom: '8px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  fieldValue: {
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  memo: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.6',
    backgroundColor: '#f9fafb',
    padding: '12px',
    borderRadius: '6px',
    marginTop: '4px',
  } as React.CSSProperties,
  navigationLinks: {
    display: 'flex',
    gap: '16px',
    marginTop: '24px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 調査日をYYYY/MM/DD形式にフォーマット
 */
function formatSurveyDate(dateString: string): string {
  const [year, month, day] = dateString.split('-');
  return `${year}/${month}/${day}`;
}

/**
 * ISO8601日時を日本語形式にフォーマット
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 現場調査基本情報表示コンポーネント
 *
 * 現場調査の基本情報（調査名、調査日、メモ）を表示し、
 * 編集・削除ボタンとナビゲーションリンクを提供します。
 *
 * @example
 * ```tsx
 * <SiteSurveyDetailInfo
 *   survey={surveyDetail}
 *   onEdit={() => navigate(`/site-surveys/${id}/edit`)}
 *   onDelete={() => setShowDeleteDialog(true)}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
export default function SiteSurveyDetailInfo({
  survey,
  onEdit,
  onDelete,
  isDeleting = false,
  canEdit = true,
  canDelete = true,
}: SiteSurveyDetailInfoProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<PdfExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // エラーメッセージを5秒後に自動的に消す
  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => {
        setExportError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [exportError]);

  /**
   * PDF報告書を生成してダウンロード
   *
   * 各画像の注釈データを取得し、元画像に注釈をレンダリングしてからPDFに埋め込む。
   *
   * @requirement site-survey/REQ-10.6
   * @requirement site-survey/REQ-11.1 報告書出力対象写真の選択
   * @requirement site-survey/REQ-11.8 調査報告書出力UI
   */
  const handleExportPdf = useCallback(async () => {
    // 報告書出力対象の写真をフィルタリング (Requirement 11.1)
    const exportTargetImages = survey.images.filter((img) => img.includeInReport);

    // 報告書出力対象が0件の場合はエラーを表示
    if (exportTargetImages.length === 0) {
      setExportError('報告書出力対象の写真がありません。写真管理で出力対象を選択してください。');
      return;
    }

    setIsGeneratingPdf(true);
    setExportError(null);
    setPdfProgress({
      phase: 'initializing',
      current: 0,
      total: exportTargetImages.length + 2,
      percent: 0,
      message: '初期化中...',
    });

    try {
      // 画像に注釈をレンダリングしてdataURLを取得
      const renderedImages = await renderImagesWithAnnotations(exportTargetImages, {
        format: 'jpeg',
        quality: 0.9,
      });

      // AnnotatedImage形式に変換
      const annotatedImages: AnnotatedImage[] = renderedImages.map((img) => ({
        imageInfo: img.imageInfo,
        dataUrl: img.dataUrl,
      }));

      // PdfExportServiceを使用してPDFを生成・ダウンロード
      const fileName = `site-survey-${survey.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      await exportAndDownloadPdf(survey, annotatedImages, {
        filename: fileName,
        onProgress: (progress) => {
          setPdfProgress(progress);
        },
      });
    } catch (error) {
      console.error('PDF generation failed:', error);
      setExportError('PDF生成に失敗しました。再度お試しください。');
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress(null);
    }
  }, [survey]);

  return (
    <div style={styles.container}>
      {/* ヘッダー: タイトルとアクションボタン */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <h2 style={styles.title}>{survey.name}</h2>
          <div style={styles.projectName}>
            <span style={styles.fieldLabel}>プロジェクト</span>
            <span style={{ marginLeft: '8px', color: '#374151' }}>{survey.project.name}</span>
          </div>
        </div>

        <div style={styles.actionsContainer}>
          {/* 調査報告書出力ボタン (Requirement 10.6, 11.1, 11.8) */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isGeneratingPdf}
            style={{
              ...styles.button,
              ...(isGeneratingPdf ? styles.pdfButtonDisabled : styles.pdfButton),
            }}
          >
            {isGeneratingPdf ? '生成中...' : '調査報告書出力'}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              style={{ ...styles.button, ...styles.editButton }}
            >
              編集
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              style={{
                ...styles.button,
                ...(isDeleting ? styles.deleteButtonDisabled : styles.deleteButton),
              }}
            >
              {isDeleting ? '削除中...' : '削除'}
            </button>
          )}
        </div>
      </div>

      {/* PDF生成プログレス表示 (Requirement 11.8) */}
      {pdfProgress && (
        <div data-testid="pdf-export-progress" style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${pdfProgress.percent}%`,
              }}
            />
          </div>
          <span data-testid="pdf-export-percentage" style={styles.progressText}>
            {pdfProgress.percent}% - {pdfProgress.message || 'PDF生成中...'}
          </span>
        </div>
      )}

      {/* エラーメッセージ表示 (Requirement 11.1) */}
      {exportError && (
        <div role="alert" style={styles.errorMessage}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {exportError}
        </div>
      )}

      {/* 基本情報グリッド */}
      <div style={styles.grid}>
        <div style={styles.field}>
          <div style={styles.fieldLabel}>調査日</div>
          <div style={styles.fieldValue}>{formatSurveyDate(survey.surveyDate)}</div>
        </div>

        <div style={styles.field}>
          <div style={styles.fieldLabel}>画像件数</div>
          <div style={styles.fieldValue}>{survey.imageCount}件</div>
        </div>

        <div style={styles.field}>
          <div style={styles.fieldLabel}>作成日時</div>
          <div style={styles.fieldValue}>{formatDateTime(survey.createdAt)}</div>
        </div>

        <div style={styles.field}>
          <div style={styles.fieldLabel}>更新日時</div>
          <div style={styles.fieldValue}>{formatDateTime(survey.updatedAt)}</div>
        </div>
      </div>

      {/* メモ（存在する場合のみ表示） */}
      {survey.memo && (
        <div style={styles.field}>
          <div style={styles.fieldLabel}>メモ</div>
          <div style={styles.memo}>{survey.memo}</div>
        </div>
      )}

      {/* ナビゲーションリンク */}
      <div style={styles.navigationLinks}>
        <Link to={`/projects/${survey.projectId}`} style={styles.link}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          プロジェクトに戻る
        </Link>
        <Link to={`/projects/${survey.projectId}/site-surveys`} style={styles.link}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          現場調査一覧に戻る
        </Link>
      </div>
    </div>
  );
}
