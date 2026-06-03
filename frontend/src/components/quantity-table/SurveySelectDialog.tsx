/**
 * @fileoverview 現場調査選択ダイアログコンポーネント
 *
 * Task 57.2: 現場調査選択ダイアログを実装する
 *
 * 「現場調査から一括追加」操作時に表示されるモーダルダイアログ。
 * 当該プロジェクトの現場調査一覧（名前・写真件数）を選択肢として表示し、
 * 1件選択して実行すると選択された現場調査IDをコールバックで通知する。
 *
 * 写真件数は呼び出し側が `getSiteSurveys` の `imageCount` を `photoCount` に
 * マッピングして渡す（本ダイアログは API 呼び出しを行わず props で受け取り表示するのみ）。
 *
 * Requirements:
 * - 40.1: 現場調査一覧から1件を選択するダイアログを表示する
 * - 40.2: 現場調査の名前と写真件数を表示する
 * - 40.11: 実行中はインジケーター表示・重複実行防止（ボタン disabled）
 */

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 現場調査サマリ（選択肢として表示する1件分の情報）
 */
export interface SiteSurveySummary {
  /** 現場調査ID */
  id: string;
  /** 現場調査名 */
  name: string;
  /** 写真件数 */
  photoCount: number;
}

/**
 * SurveySelectDialogのプロパティ
 */
export interface SurveySelectDialogProps {
  /** ダイアログ開閉状態 */
  isOpen: boolean;
  /** 選択肢となる現場調査一覧（当該プロジェクト） */
  siteSurveys: SiteSurveySummary[];
  /** 生成中フラグ（true でボタンdisabled・インジケーター表示） */
  isCreating: boolean;
  /** 実行確定コールバック（選択された現場調査ID） */
  onConfirm: (siteSurveyId: string) => void;
  /** 閉じるコールバック */
  onClose: () => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '80vh',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  closeButton: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
    padding: '4px',
    lineHeight: 1,
  } as React.CSSProperties,
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto' as const,
    flex: 1,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  } as React.CSSProperties,
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #f3f4f6',
  } as React.CSSProperties,
  listItemSelected: {
    backgroundColor: '#eff6ff',
  } as React.CSSProperties,
  surveyName: {
    flex: 1,
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  photoCount: {
    fontSize: '13px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  empty: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
    fontSize: '14px',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '24px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  confirmButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
  } as React.CSSProperties,
  disabledButton: {
    opacity: 0.6,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  spinner: {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTop: '2px solid #ffffff',
    borderRadius: '50%',
    animation: 'survey-select-dialog-spin 0.8s linear infinite',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現場調査選択ダイアログ
 *
 * 当該プロジェクトの現場調査一覧から1件を選択し、実行を確定する。
 */
export default function SurveySelectDialog({
  isOpen,
  siteSurveys,
  isCreating,
  onConfirm,
  onClose,
}: SurveySelectDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ダイアログを開くたびに選択状態をリセットする
  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
    }
  }, [isOpen]);

  // Escキーでダイアログを閉じる（生成中は閉じない）
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isCreating) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isCreating, onClose]);

  const handleOverlayClick = useCallback(() => {
    // 生成中はオーバーレイクリックでも閉じない（重複実行防止のため操作をロック）
    if (!isCreating) {
      onClose();
    }
  }, [isCreating, onClose]);

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedId && !isCreating) {
      onConfirm(selectedId);
    }
  }, [selectedId, isCreating, onConfirm]);

  if (!isOpen) {
    return null;
  }

  const isConfirmDisabled = isCreating || selectedId === null;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="survey-select-dialog-title"
      onClick={handleOverlayClick}
      data-testid="survey-select-dialog"
    >
      <div style={styles.content} onClick={handleContentClick}>
        <div style={styles.header}>
          <h2 id="survey-select-dialog-title" style={styles.title}>
            現場調査から一括追加
          </h2>
          <button
            type="button"
            style={styles.closeButton}
            onClick={onClose}
            disabled={isCreating}
            aria-label="ダイアログを閉じる"
            data-testid="survey-select-dialog-close"
          >
            ×
          </button>
        </div>

        {siteSurveys.length === 0 ? (
          <div style={styles.empty} data-testid="survey-select-dialog-empty">
            選択可能な現場調査がありません
          </div>
        ) : (
          <ul
            style={styles.list}
            role="radiogroup"
            aria-label="現場調査一覧"
            data-testid="survey-select-dialog-list"
          >
            {siteSurveys.map((survey) => {
              const isSelected = survey.id === selectedId;
              return (
                <li
                  key={survey.id}
                  style={{
                    ...styles.listItem,
                    ...(isSelected ? styles.listItemSelected : {}),
                  }}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  data-testid={`survey-select-option-${survey.id}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => !isCreating && setSelectedId(survey.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isCreating) {
                      e.preventDefault();
                      setSelectedId(survey.id);
                    }
                  }}
                >
                  <span style={styles.surveyName}>{survey.name}</span>
                  <span style={styles.photoCount}>写真 {survey.photoCount} 件</span>
                </li>
              );
            })}
          </ul>
        )}

        <div style={styles.actions}>
          <button type="button" style={styles.cancelButton} onClick={onClose} disabled={isCreating}>
            キャンセル
          </button>
          <button
            type="button"
            style={{
              ...styles.confirmButton,
              ...(isConfirmDisabled ? styles.disabledButton : {}),
            }}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            data-testid="survey-select-dialog-confirm"
          >
            {isCreating && <span role="status" style={styles.spinner} aria-label="生成中" />}
            {isCreating ? '生成中...' : '実行'}
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes survey-select-dialog-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
