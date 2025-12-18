/**
 * @fileoverview 現場調査基本情報表示コンポーネント
 *
 * Task 9.1: 現場調査基本情報表示を実装する
 * Task 22.3: アクセス権限によるUI制御を実装する
 *
 * Requirements:
 * - 1.2: 現場調査詳細画面を表示する際、現場調査の基本情報と関連する画像一覧を表示する
 * - 10.6: PDF報告書のクライアントサイド生成
 * - 12.1: プロジェクトへのアクセス権を持つユーザーは現場調査を閲覧可能
 * - 12.2: プロジェクトへの編集権限を持つユーザーは現場調査の作成・編集・削除を許可
 *
 * 機能:
 * - 調査名、調査日、メモの表示
 * - 編集ボタン・削除ボタン（権限に基づいて表示/非表示）
 * - PDF報告書出力ボタン
 * - プロジェクトへの戻り導線
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import type { SiteSurveyDetail } from '../../types/site-survey.types';

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

  /**
   * PDF報告書を生成してダウンロード
   * @requirement site-survey/REQ-10.6
   */
  const handleExportPdf = useCallback(async () => {
    setIsGeneratingPdf(true);

    try {
      // A4サイズのPDFを作成
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // 日本語フォント対応のため、基本的なASCII文字で出力
      // 実際の日本語対応には別途フォント埋め込みが必要
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPosition = 20;

      // タイトル
      doc.setFontSize(18);
      doc.text('Site Survey Report', pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // 現場調査名
      doc.setFontSize(14);
      doc.text(`Survey: ${survey.name}`, 20, yPosition);
      yPosition += 10;

      // プロジェクト名
      doc.setFontSize(12);
      doc.text(`Project: ${survey.project.name}`, 20, yPosition);
      yPosition += 8;

      // 調査日
      doc.text(`Date: ${formatSurveyDate(survey.surveyDate)}`, 20, yPosition);
      yPosition += 8;

      // 画像件数
      doc.text(`Images: ${survey.imageCount}`, 20, yPosition);
      yPosition += 8;

      // 作成日時
      doc.text(`Created: ${formatDateTime(survey.createdAt)}`, 20, yPosition);
      yPosition += 8;

      // 更新日時
      doc.text(`Updated: ${formatDateTime(survey.updatedAt)}`, 20, yPosition);
      yPosition += 12;

      // メモ
      if (survey.memo) {
        doc.setFontSize(12);
        doc.text('Memo:', 20, yPosition);
        yPosition += 6;
        doc.setFontSize(10);
        // メモを複数行に分割
        const memoLines = doc.splitTextToSize(survey.memo, pageWidth - 40);
        doc.text(memoLines, 20, yPosition);
      }

      // PDFをダウンロード
      const fileName = `site-survey-${survey.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('PDF generation failed:', error);
    } finally {
      setIsGeneratingPdf(false);
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
          {/* PDF出力ボタン (Requirement 10.6) */}
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isGeneratingPdf}
            style={{
              ...styles.button,
              ...(isGeneratingPdf ? styles.pdfButtonDisabled : styles.pdfButton),
            }}
          >
            {isGeneratingPdf ? '生成中...' : 'PDF出力'}
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
