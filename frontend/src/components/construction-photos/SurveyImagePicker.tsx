/**
 * @fileoverview 現調写真選択モーダル
 *
 * Task 6.3: 3系統アップローダ（現調選択モーダル）
 *
 * 同一プロジェクトの現場調査に登録された写真を選択候補として提示し、選択した
 * 現調画像IDを onSelect で返す。工事写真側でのコピー（addConstructionPhotosFromSurveys）
 * は呼び出し元（PhotoUploader）が担う。site-survey へは書込まない（読取のみ）。
 *
 * 参照対象は同一プロジェクトの現場調査写真に限定する（projectId でスコープ）。
 *
 * Requirements: 6.1, 6.4
 */

import { useCallback, useEffect, useState } from 'react';
import { getSiteSurvey, getSiteSurveys } from '../../api/site-surveys';
import type { SiteSurveyInfo, SurveyImageInfo } from '../../types/site-survey.types';

// ============================================================================
// 型定義
// ============================================================================

export interface SurveyImagePickerProps {
  /** 参照元プロジェクトID（同一プロジェクトの現調写真のみ提示） */
  projectId: string;
  /** モーダルの開閉 */
  open: boolean;
  /** 閉じるハンドラ */
  onClose: () => void;
  /** 選択した現調画像IDを確定するハンドラ */
  onSelect: (surveyImageIds: string[]) => void;
  /** コピー処理中フラグ（親が制御） */
  isSubmitting?: boolean;
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
    zIndex: 1100,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    width: '90%',
    maxWidth: '720px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: '160px',
  } as React.CSSProperties,
  surveyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  surveyButton: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#374151',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  backLink: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '14px',
    padding: 0,
    marginBottom: '12px',
  } as React.CSSProperties,
  imageGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '12px',
  } as React.CSSProperties,
  imageCell: {
    position: 'relative' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    overflow: 'hidden',
    cursor: 'pointer',
  } as React.CSSProperties,
  imageCellSelected: {
    border: '2px solid #2563eb',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.2)',
  } as React.CSSProperties,
  image: {
    width: '100%',
    height: '90px',
    objectFit: 'cover' as const,
    display: 'block',
  } as React.CSSProperties,
  imagePlaceholder: {
    width: '100%',
    height: '90px',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: '#9ca3af',
  } as React.CSSProperties,
  checkbox: {
    position: 'absolute' as const,
    top: '6px',
    left: '6px',
    width: '18px',
    height: '18px',
  } as React.CSSProperties,
  caption: {
    fontSize: '11px',
    color: '#6b7280',
    padding: '4px 6px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  emptyState: {
    padding: '32px 16px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e5e7eb',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  addButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
  } as React.CSSProperties,
  addButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  errorText: {
    color: '#b91c1c',
    fontSize: '13px',
    marginBottom: '12px',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 現調写真選択モーダル
 *
 * 1. モーダルを開くと同一プロジェクトの現場調査一覧を読み込む
 * 2. 現場調査を選ぶと当該調査の画像一覧（サムネ優先）を読み込む
 * 3. 追加したい画像を複数選択して「追加」で onSelect に画像IDを渡す
 */
export function SurveyImagePicker({
  projectId,
  open,
  onClose,
  onSelect,
  isSubmitting = false,
}: SurveyImagePickerProps) {
  const [surveys, setSurveys] = useState<SiteSurveyInfo[]>([]);
  const [isLoadingSurveys, setIsLoadingSurveys] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [surveyImages, setSurveyImages] = useState<SurveyImageInfo[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // モーダルを開いた時に現場調査一覧を読み込む
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoadingSurveys(true);
    setError(null);
    // 開き直しに備えて選択状態を初期化する
    setSelectedSurveyId(null);
    setSurveyImages([]);
    setSelectedImageIds(new Set());

    getSiteSurveys(projectId, { limit: 50 })
      .then((result) => {
        if (!cancelled) {
          setSurveys(result.data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '現場調査の取得に失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSurveys(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // 現場調査を選択して画像一覧を読み込む
  const handleSelectSurvey = useCallback(async (surveyId: string) => {
    setSelectedSurveyId(surveyId);
    setSelectedImageIds(new Set());
    setIsLoadingImages(true);
    setError(null);
    try {
      const detail = await getSiteSurvey(surveyId);
      setSurveyImages(detail.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : '現場調査写真の取得に失敗しました');
    } finally {
      setIsLoadingImages(false);
    }
  }, []);

  // 画像の選択トグル
  const toggleImage = useCallback((imageId: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  // 現場調査一覧へ戻る
  const handleBack = useCallback(() => {
    setSelectedSurveyId(null);
    setSurveyImages([]);
    setSelectedImageIds(new Set());
  }, []);

  // 追加確定
  const handleAdd = useCallback(() => {
    if (selectedImageIds.size === 0) return;
    onSelect(Array.from(selectedImageIds));
  }, [selectedImageIds, onSelect]);

  if (!open) {
    return null;
  }

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="survey-image-picker-title"
    >
      <div style={styles.dialog}>
        <h2 id="survey-image-picker-title" style={styles.title}>
          現場調査写真から選択
        </h2>

        {error && (
          <p role="alert" style={styles.errorText}>
            {error}
          </p>
        )}

        <div style={styles.body}>
          {selectedSurveyId === null ? (
            // 現場調査一覧
            isLoadingSurveys ? (
              <p style={styles.emptyState} role="status">
                読み込み中...
              </p>
            ) : surveys.length === 0 ? (
              <p style={styles.emptyState}>選択可能な現場調査がありません</p>
            ) : (
              <div style={styles.surveyList}>
                {surveys.map((survey) => (
                  <button
                    key={survey.id}
                    type="button"
                    style={styles.surveyButton}
                    onClick={() => handleSelectSurvey(survey.id)}
                  >
                    <span>{survey.name}</span>
                    <span>{survey.imageCount} 枚</span>
                  </button>
                ))}
              </div>
            )
          ) : (
            // 選択した現場調査の画像一覧
            <div>
              <button type="button" style={styles.backLink} onClick={handleBack}>
                ← 現場調査一覧へ戻る
              </button>
              {isLoadingImages ? (
                <p style={styles.emptyState} role="status">
                  読み込み中...
                </p>
              ) : surveyImages.length === 0 ? (
                <p style={styles.emptyState}>この現場調査に写真がありません</p>
              ) : (
                <div style={styles.imageGrid}>
                  {surveyImages.map((image) => {
                    const isSelected = selectedImageIds.has(image.id);
                    return (
                      <div
                        key={image.id}
                        style={{
                          ...styles.imageCell,
                          ...(isSelected ? styles.imageCellSelected : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          style={styles.checkbox}
                          checked={isSelected}
                          onChange={() => toggleImage(image.id)}
                          aria-label={`${image.fileName} を選択`}
                        />
                        {image.thumbnailUrl ? (
                          <img
                            src={image.thumbnailUrl}
                            alt={image.fileName}
                            style={styles.image}
                            loading="lazy"
                          />
                        ) : (
                          <div style={styles.imagePlaceholder}>プレビューなし</div>
                        )}
                        <div style={styles.caption}>{image.fileName}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            キャンセル
          </button>
          <button
            type="button"
            style={{
              ...styles.addButton,
              ...(selectedImageIds.size === 0 || isSubmitting ? styles.addButtonDisabled : {}),
            }}
            onClick={handleAdd}
            disabled={selectedImageIds.size === 0 || isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? '追加中...' : `追加（${selectedImageIds.size}）`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SurveyImagePicker;
