/**
 * @fileoverview 数量表編集画面
 *
 * Task 5.1: 数量表編集画面のレイアウトを実装する
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getQuantityTableDetail,
  createQuantityGroup,
  deleteQuantityGroup,
  updateQuantityGroup,
  createQuantityItem,
  deleteQuantityItem,
  copyQuantityItem,
  updateQuantityTable,
  bulkSaveQuantityTable,
} from '../api/quantity-tables';
import { getSiteSurveys, getSiteSurvey } from '../api/site-surveys';
import type {
  QuantityTableDetail,
  QuantityGroupDetail,
  QuantityItemDetail,
} from '../types/quantity-table.types';
import type { SurveyImageInfo } from '../types/site-survey.types';
import { Breadcrumb } from '../components/common';
import QuantityGroupCard from '../components/quantity-table/QuantityGroupCard';
import { AnnotatedImageThumbnail } from '../components/site-surveys/AnnotatedImageThumbnail';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '32px 16px',
  } as React.CSSProperties,
  breadcrumbWrapper: {
    marginBottom: '16px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    gap: '16px',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    flex: 1,
  } as React.CSSProperties,
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
  } as React.CSSProperties,
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  titleInput: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
    padding: '4px 8px',
    border: '1px solid transparent',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    width: '100%',
    maxWidth: '500px',
    transition: 'border-color 0.2s, background-color 0.2s',
  } as React.CSSProperties,
  titleInputFocused: {
    border: '1px solid #2563eb',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexShrink: 0,
  } as React.CSSProperties,
  addGroupButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  saveButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  groupList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '64px 24px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  } as React.CSSProperties,
  emptyIcon: {
    width: '64px',
    height: '64px',
    margin: '0 auto 16px',
    color: '#9ca3af',
  } as React.CSSProperties,
  emptyText: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 16px',
  } as React.CSSProperties,
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #2563eb',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  } as React.CSSProperties,
  errorContainer: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    marginBottom: '16px',
  } as React.CSSProperties,
  retryButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 操作エラー表示スタイル（インライン）
  operationErrorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  } as React.CSSProperties,
  operationErrorText: {
    color: '#991b1b',
    fontSize: '14px',
    margin: 0,
    flex: 1,
  } as React.CSSProperties,
  operationErrorDismiss: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#991b1b',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    marginLeft: '12px',
  } as React.CSSProperties,
  // 確認ダイアログスタイル
  dialogOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '12px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  deleteButton: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    cursor: 'pointer',
  } as React.CSSProperties,
  // 写真選択ダイアログスタイル（REQ-4.3）
  photoDialogContent: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  photoDialogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
    overflowY: 'auto' as const,
    flex: 1,
    padding: '4px',
  } as React.CSSProperties,
  photoItem: {
    aspectRatio: '1',
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s, transform 0.2s',
  } as React.CSSProperties,
  photoItemSelected: {
    border: '2px solid #2563eb',
    transform: 'scale(1.02)',
  } as React.CSSProperties,
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
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
  emptyPhotos: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * プラスアイコン
 */
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * 空状態アイコン（テーブル）
 */
function EmptyTableIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 9v12M15 9v12" />
    </svg>
  );
}

/**
 * 空状態表示
 */
function EmptyState({ onAddGroup }: { onAddGroup: () => void }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <EmptyTableIcon />
      </div>
      <p style={styles.emptyText}>グループがありません</p>
      <button type="button" style={styles.addGroupButton} onClick={onAddGroup}>
        <PlusIcon />
        グループを追加
      </button>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 数量表編集画面
 *
 * Requirements:
 * - 3.1: 数量表編集画面を表示する
 * - 3.2: 数量グループ一覧と各グループ内の数量項目を階層的に表示する
 * - 3.3: 該当写真の注釈付きサムネイルを関連写真表示エリアに表示する
 */
export default function QuantityTableEditPage() {
  const { id } = useParams<{ id: string }>();

  // データ状態
  const [quantityTable, setQuantityTable] = useState<QuantityTableDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null); // 読み込みエラー（全画面表示）
  const [operationError, setOperationError] = useState<string | null>(null); // 操作エラー（インライン表示）
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  // 削除確認ダイアログ用state（REQ-4.5）
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // 数量表名編集用state（REQ-2.5）
  const [editingName, setEditingName] = useState<string>('');
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  // 写真選択ダイアログ用state（REQ-4.3）
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
  const [selectedGroupIdForPhoto, setSelectedGroupIdForPhoto] = useState<string | null>(null);
  const [availablePhotos, setAvailablePhotos] = useState<SurveyImageInfo[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  // 注釈ビューアモーダル用state（REQ-4.4）
  const [annotationViewerGroupId, setAnnotationViewerGroupId] = useState<string | null>(null);

  /**
   * 数量表詳細を取得
   */
  const fetchQuantityTableDetail = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setLoadError(null);
    setOperationError(null); // 操作エラーもクリア

    try {
      const result = await getQuantityTableDetail(id);
      setQuantityTable(result);
    } catch {
      setLoadError('読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchQuantityTableDetail();
  }, [fetchQuantityTableDetail]);

  // 数量表名を編集用stateに初期化（REQ-2.5）
  useEffect(() => {
    if (quantityTable) {
      setEditingName(quantityTable.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 名前の変更のみに依存
  }, [quantityTable?.name]);

  /**
   * 数量表名変更ハンドラ（REQ-2.5）
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingName(e.target.value);
  }, []);

  /**
   * 数量表名保存ハンドラ（REQ-2.5）
   * フォーカスを外したときに自動保存
   */
  const handleNameBlur = useCallback(async () => {
    setIsNameFocused(false);

    if (!quantityTable || !id) return;

    // 変更がない場合は何もしない
    if (editingName === quantityTable.name) return;

    // 空の場合は元に戻す
    if (!editingName.trim()) {
      setEditingName(quantityTable.name);
      return;
    }

    setIsSavingName(true);
    try {
      const updatedTable = await updateQuantityTable(
        id,
        { name: editingName.trim() },
        quantityTable.updatedAt
      );

      // ローカル状態を更新
      setQuantityTable((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          name: updatedTable.name,
          updatedAt: updatedTable.updatedAt,
        };
      });

      setSaveMessage('保存しました');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setOperationError('数量表名の保存に失敗しました');
      setEditingName(quantityTable.name); // エラー時は元に戻す
    } finally {
      setIsSavingName(false);
    }
  }, [id, quantityTable, editingName]);

  /**
   * 数量表名フォーカスハンドラ（REQ-2.5）
   */
  const handleNameFocus = useCallback(() => {
    setIsNameFocused(true);
  }, []);

  /**
   * 数量表名キーダウンハンドラ（REQ-2.5）
   * Enterで確定、Escでキャンセル
   */
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur(); // blurでhandleNameBlurが呼ばれる
      } else if (e.key === 'Escape') {
        if (quantityTable) {
          setEditingName(quantityTable.name);
        }
        e.currentTarget.blur();
      }
    },
    [quantityTable]
  );

  /**
   * グループ追加ハンドラ
   *
   * Requirements: 4.1
   */
  const handleAddGroup = useCallback(async () => {
    if (!id || !quantityTable || isAddingGroup) return;

    setIsAddingGroup(true);
    setOperationError(null);

    try {
      // 現在のグループ数に基づいて表示順序を設定
      const currentGroups = quantityTable.groups ?? [];
      const maxDisplayOrder = currentGroups.reduce((max, g) => Math.max(max, g.displayOrder), -1);

      const newGroup = await createQuantityGroup(id, {
        name: null, // グループ名は任意
        displayOrder: maxDisplayOrder + 1,
      });

      // ローカル状態を更新（再取得せずに即時反映）
      setQuantityTable((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groupCount: prev.groupCount + 1,
          groups: [...(prev.groups ?? []), { ...newGroup, items: [] }],
        };
      });
    } catch {
      setOperationError('グループの追加に失敗しました');
    } finally {
      setIsAddingGroup(false);
    }
  }, [id, quantityTable, isAddingGroup]);

  /**
   * グループ名取得（名前がない場合はデフォルト表示）
   */
  const getGroupDisplayName = (group: QuantityGroupDetail, index: number): string => {
    return group.name || `グループ ${index + 1}`;
  };

  /**
   * グループ削除確認ダイアログを開く
   *
   * Requirements: 4.5
   */
  const handleDeleteGroup = useCallback((groupId: string) => {
    setGroupToDelete(groupId);
  }, []);

  /**
   * 削除をキャンセル
   */
  const handleCancelDelete = useCallback(() => {
    setGroupToDelete(null);
  }, []);

  /**
   * グループ削除を実行
   *
   * Requirements: 4.5
   */
  const handleConfirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete || isDeletingGroup) return;

    setIsDeletingGroup(true);
    setOperationError(null);

    try {
      await deleteQuantityGroup(groupToDelete);

      // ローカル状態を更新（再取得せずに即時反映）
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).filter((g) => g.id !== groupToDelete);
        return {
          ...prev,
          groupCount: updatedGroups.length,
          groups: updatedGroups,
        };
      });

      setGroupToDelete(null);
    } catch {
      setOperationError('グループの削除に失敗しました');
    } finally {
      setIsDeletingGroup(false);
    }
  }, [groupToDelete, isDeletingGroup]);

  /**
   * 写真選択ダイアログを開く
   *
   * Requirements: 4.3
   */
  const handleSelectImage = useCallback(
    async (groupId: string) => {
      if (!quantityTable) return;

      setSelectedGroupIdForPhoto(groupId);
      setIsPhotoDialogOpen(true);
      setIsLoadingPhotos(true);
      setAvailablePhotos([]);

      try {
        // プロジェクト内の現場調査を取得
        const surveysResult = await getSiteSurveys(quantityTable.projectId, { limit: 100 });
        const allPhotos: SurveyImageInfo[] = [];

        // 各現場調査の詳細を取得して画像を集める
        for (const survey of surveysResult.data) {
          try {
            const surveyDetail = await getSiteSurvey(survey.id);
            if (surveyDetail.images && surveyDetail.images.length > 0) {
              allPhotos.push(...surveyDetail.images);
            }
          } catch {
            // 個別の現場調査取得エラーは無視
          }
        }

        setAvailablePhotos(allPhotos);
      } catch {
        setOperationError('写真の読み込みに失敗しました');
      } finally {
        setIsLoadingPhotos(false);
      }
    },
    [quantityTable]
  );

  /**
   * 写真選択ダイアログを閉じる
   *
   * Requirements: 4.3
   */
  const handleClosePhotoDialog = useCallback(() => {
    setIsPhotoDialogOpen(false);
    setSelectedGroupIdForPhoto(null);
    setAvailablePhotos([]);
  }, []);

  /**
   * 写真を選択して適用
   *
   * Requirements: 4.3
   */
  const handlePhotoSelect = useCallback(
    async (imageId: string) => {
      if (!selectedGroupIdForPhoto || isSavingPhoto) return;

      setIsSavingPhoto(true);
      setOperationError(null);

      try {
        // 対象グループを取得
        const targetGroup = (quantityTable?.groups ?? []).find(
          (g) => g.id === selectedGroupIdForPhoto
        );
        if (!targetGroup) {
          throw new Error('グループが見つかりません');
        }

        // グループに画像を紐付けるAPIを呼び出す
        const updatedGroup = await updateQuantityGroup(
          selectedGroupIdForPhoto,
          { surveyImageId: imageId },
          targetGroup.updatedAt
        );

        // 選択した写真情報を取得
        const selectedPhoto = availablePhotos.find((p) => p.id === imageId);

        // ローカル状態を更新（APIから返されたupdatedAtを使用）
        setQuantityTable((prev) => {
          if (!prev) return prev;
          const updatedGroups = (prev.groups ?? []).map((g) => {
            if (g.id === selectedGroupIdForPhoto) {
              return {
                ...g,
                surveyImageId: imageId,
                surveyImage: selectedPhoto
                  ? {
                      id: selectedPhoto.id,
                      thumbnailUrl: selectedPhoto.thumbnailUrl || selectedPhoto.originalUrl || '',
                      originalUrl: selectedPhoto.originalUrl || '',
                      fileName: selectedPhoto.fileName,
                      hasAnnotations: selectedPhoto.hasAnnotations,
                    }
                  : null,
                updatedAt: updatedGroup.updatedAt,
              };
            }
            return g;
          });
          return {
            ...prev,
            groups: updatedGroups,
          };
        });

        handleClosePhotoDialog();
      } catch {
        setOperationError('写真の紐付けに失敗しました');
      } finally {
        setIsSavingPhoto(false);
      }
    },
    [selectedGroupIdForPhoto, isSavingPhoto, quantityTable, availablePhotos, handleClosePhotoDialog]
  );

  /**
   * 注釈ビューアを開く
   *
   * Requirements: 4.4
   */
  const handleOpenAnnotationViewer = useCallback((groupId: string) => {
    setAnnotationViewerGroupId(groupId);
  }, []);

  /**
   * 注釈ビューアを閉じる
   *
   * Requirements: 4.4
   */
  const handleCloseAnnotationViewer = useCallback(() => {
    setAnnotationViewerGroupId(null);
  }, []);

  /**
   * 項目追加ハンドラ
   *
   * Requirements: 5.1
   */
  const handleAddItem = useCallback(
    async (groupId: string) => {
      setOperationError(null);

      try {
        // 対象グループの現在の項目数を取得
        const targetGroup = (quantityTable?.groups ?? []).find((g) => g.id === groupId);
        const currentItems = targetGroup?.items ?? [];
        const maxDisplayOrder = currentItems.reduce(
          (max, item) => Math.max(max, item.displayOrder),
          -1
        );

        // デフォルト値で新規項目を作成（REQ-5.1: 大項目・工種・名称・単位は空白）
        const newItem = await createQuantityItem(groupId, {
          majorCategory: '',
          workType: '',
          name: '',
          unit: '',
          quantity: 0,
          displayOrder: maxDisplayOrder + 1,
        });

        // ローカル状態を更新（再取得せずに即時反映）
        setQuantityTable((prev) => {
          if (!prev) return prev;
          const updatedGroups = (prev.groups ?? []).map((g) => {
            if (g.id === groupId) {
              return {
                ...g,
                items: [...(g.items ?? []), newItem],
              };
            }
            return g;
          });
          return {
            ...prev,
            itemCount: prev.itemCount + 1,
            groups: updatedGroups,
          };
        });
      } catch {
        setOperationError('項目の追加に失敗しました');
      }
    },
    [quantityTable]
  );

  /**
   * 項目更新ハンドラ（ローカル状態のみ更新、APIは呼ばない）
   *
   * Requirements: 5.2
   *
   * 自動保存は行わず、ローカル状態のみ更新する。
   * 保存ボタンを押したときにまとめて保存される。
   */
  const handleUpdateItem = useCallback((itemId: string, updates: Partial<QuantityItemDetail>) => {
    setOperationError(null);

    // ローカル状態のみを更新（APIは呼ばない）
    setQuantityTable((prev) => {
      if (!prev) return prev;
      const updatedGroups = (prev.groups ?? []).map((g) => ({
        ...g,
        items: (g.items ?? []).map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
      }));
      return {
        ...prev,
        groups: updatedGroups,
      };
    });
  }, []);

  /**
   * 項目削除ハンドラ
   *
   * Requirements: 5.3
   */
  const handleDeleteItem = useCallback(async (itemId: string) => {
    setOperationError(null);

    try {
      await deleteQuantityItem(itemId);

      // ローカル状態を更新
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).map((g) => ({
          ...g,
          items: (g.items ?? []).filter((item) => item.id !== itemId),
        }));
        return {
          ...prev,
          itemCount: prev.itemCount - 1,
          groups: updatedGroups,
        };
      });
    } catch {
      setOperationError('項目の削除に失敗しました');
    }
  }, []);

  /**
   * 項目コピーハンドラ
   *
   * Requirements: 5.4
   */
  const handleCopyItem = useCallback(async (itemId: string) => {
    setOperationError(null);

    try {
      const copiedItem = await copyQuantityItem(itemId);

      // コピー元の項目が属するグループを探す
      setQuantityTable((prev) => {
        if (!prev) return prev;
        const updatedGroups = (prev.groups ?? []).map((g) => {
          const hasItem = (g.items ?? []).some((item) => item.id === itemId);
          if (hasItem) {
            return {
              ...g,
              items: [...(g.items ?? []), copiedItem],
            };
          }
          return g;
        });
        return {
          ...prev,
          itemCount: prev.itemCount + 1,
          groups: updatedGroups,
        };
      });
    } catch {
      setOperationError('項目のコピーに失敗しました');
    }
  }, []);

  /**
   * 項目移動ハンドラ
   *
   * Requirements: REQ-6.3 同一数量グループ内で項目の位置を移動できる
   */
  const handleMoveItem = useCallback((itemId: string, direction: 'up' | 'down') => {
    setQuantityTable((prev) => {
      if (!prev) return prev;

      const updatedGroups = (prev.groups ?? []).map((group) => {
        const items = group.items ?? [];
        const itemIndex = items.findIndex((item) => item.id === itemId);

        // この項目がこのグループにない場合は変更なし
        if (itemIndex === -1) return group;

        // 移動先インデックスを計算
        const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;

        // 範囲外の場合は変更なし
        if (targetIndex < 0 || targetIndex >= items.length) return group;

        // 項目を入れ替え
        const newItems = [...items];
        const itemToMove = newItems[itemIndex];
        const targetItem = newItems[targetIndex];
        if (!itemToMove || !targetItem) return group;
        newItems[itemIndex] = targetItem;
        newItems[targetIndex] = itemToMove;

        // displayOrderを更新
        const updatedItems = newItems.map((item, idx) => ({
          ...item,
          displayOrder: idx,
        }));

        return {
          ...group,
          items: updatedItems,
        };
      });

      return {
        ...prev,
        groups: updatedGroups,
      };
    });
  }, []);

  /**
   * 保存ハンドラ
   *
   * Requirements: 11.1, 11.2
   *
   * ローカル状態の変更をまとめてAPIに保存する。
   * バルク保存APIを使用して1回のリクエストで全ての変更を保存する。
   */
  const handleSave = useCallback(async () => {
    if (!quantityTable || !id) return;

    // REQ-11.2: 整合性チェック
    const validationErrors: string[] = [];
    const groups = quantityTable.groups ?? [];

    for (const group of groups) {
      for (const item of group.items ?? []) {
        // 項目名が空の場合はエラー
        if (!item.name || item.name.trim() === '') {
          validationErrors.push(`グループ「${group.name}」に項目名が空の項目があります`);
        }
        // 丸め設定が0以下の場合はエラー
        if (item.roundingUnit <= 0) {
          validationErrors.push(
            `グループ「${group.name}」の項目「${item.name || '(名称未設定)'}」の丸め設定が無効です`
          );
        }
      }
    }

    // エラーがある場合は保存を中断
    if (validationErrors.length > 0) {
      setOperationError('保存できません: ' + validationErrors[0]);
      return;
    }

    // バルク保存APIを使用して1回のリクエストで全項目を保存
    setSaveMessage('保存中...');
    setOperationError(null);

    try {
      // バルク保存用のデータを構築
      const bulkSaveData = {
        expectedUpdatedAt: quantityTable.updatedAt,
        groups: groups.map((group) => ({
          id: group.id,
          items: (group.items ?? []).map((item) => ({
            id: item.id,
            majorCategory: item.majorCategory,
            middleCategory: item.middleCategory,
            minorCategory: item.minorCategory,
            customCategory: item.customCategory,
            workType: item.workType,
            name: item.name,
            specification: item.specification,
            unit: item.unit,
            calculationMethod: item.calculationMethod,
            calculationParams: item.calculationParams,
            adjustmentFactor: item.adjustmentFactor,
            roundingUnit: item.roundingUnit,
            quantity: item.quantity,
            remarks: item.remarks,
            displayOrder: item.displayOrder,
          })),
        })),
      };

      // 1回のAPIリクエストで全項目を保存
      await bulkSaveQuantityTable(id, bulkSaveData);

      // 保存後にデータを再取得して最新のupdatedAtを反映
      await fetchQuantityTableDetail();

      setSaveMessage('保存しました');
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (error) {
      // 競合エラーの場合は特別なメッセージを表示
      if (error instanceof Error && error.message.includes('競合')) {
        setOperationError(
          '他のユーザーによって更新されました。ページを再読み込みして最新データを確認してください。'
        );
      } else {
        setOperationError('保存に失敗しました。再度お試しください。');
      }
      setSaveMessage(null);
    }
  }, [id, quantityTable, fetchQuantityTableDetail]);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} />
          <p>読み込み中...</p>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </main>
    );
  }

  // 読み込みエラー表示（全画面）
  if (loadError) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{loadError}</p>
          <button type="button" onClick={fetchQuantityTableDetail} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  // データがない場合
  if (!quantityTable) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>数量表が見つかりません</p>
        </div>
      </main>
    );
  }

  const groups = quantityTable.groups ?? [];

  return (
    <main role="main" style={styles.container} data-testid="quantity-table-edit-area">
      {/* パンくずナビゲーション */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト', path: '/projects' },
            { label: quantityTable.project.name, path: `/projects/${quantityTable.projectId}` },
            { label: '数量表一覧', path: `/projects/${quantityTable.projectId}/quantity-tables` },
            { label: quantityTable.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${quantityTable.projectId}/quantity-tables`}
            style={styles.backLink}
            aria-label="数量表一覧に戻る"
          >
            ← 数量表一覧に戻る
          </Link>
          <h1 style={{ margin: 0 }}>
            <input
              type="text"
              value={editingName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              onFocus={handleNameFocus}
              onKeyDown={handleNameKeyDown}
              style={{
                ...styles.titleInput,
                ...(isNameFocused ? styles.titleInputFocused : {}),
              }}
              aria-label="数量表名"
              disabled={isSavingName}
            />
          </h1>
          <p style={styles.subtitle}>
            {quantityTable.groupCount}グループ / {quantityTable.itemCount}項目
          </p>
        </div>
        <div style={styles.headerActions}>
          {saveMessage && (
            <span style={{ color: '#16a34a', fontSize: '14px', fontWeight: 500 }}>
              {saveMessage}
            </span>
          )}
          <button type="button" style={styles.saveButton} onClick={handleSave} aria-label="保存">
            保存
          </button>
          <button
            type="button"
            style={{
              ...styles.addGroupButton,
              opacity: isAddingGroup ? 0.7 : 1,
              cursor: isAddingGroup ? 'wait' : 'pointer',
            }}
            onClick={handleAddGroup}
            disabled={isAddingGroup}
            aria-busy={isAddingGroup}
          >
            <PlusIcon />
            {isAddingGroup ? '追加中...' : 'グループを追加'}
          </button>
        </div>
      </div>

      {/* 操作エラー表示（インライン） */}
      {operationError && (
        <div role="alert" style={styles.operationErrorContainer}>
          <p style={styles.operationErrorText}>{operationError}</p>
          <button
            type="button"
            style={styles.operationErrorDismiss}
            onClick={() => setOperationError(null)}
            aria-label="エラーを閉じる"
          >
            ✕
          </button>
        </div>
      )}

      {/* グループ一覧 */}
      {groups.length === 0 ? (
        <EmptyState onAddGroup={handleAddGroup} />
      ) : (
        <div style={styles.groupList} data-testid="quantity-group-section">
          {groups.map((group, index) => (
            <div key={group.id} data-testid="quantity-group">
              <QuantityGroupCard
                group={group}
                groupDisplayName={getGroupDisplayName(group, index)}
                isEditable
                onAddItem={handleAddItem}
                onDeleteGroup={handleDeleteGroup}
                onSelectImage={handleSelectImage}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onCopyItem={handleCopyItem}
                onMoveItem={handleMoveItem}
                onOpenAnnotationViewer={handleOpenAnnotationViewer}
              />
            </div>
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ (REQ-4.5) */}
      {groupToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleCancelDelete}
        >
          <div style={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-dialog-title" style={styles.dialogTitle}>
              グループを削除しますか？
            </h2>
            <p style={styles.dialogMessage}>
              このグループとその中のすべての項目が削除されます。この操作は元に戻せません。
            </p>
            <div style={styles.dialogActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={handleCancelDelete}
                disabled={isDeletingGroup}
              >
                キャンセル
              </button>
              <button
                type="button"
                style={{
                  ...styles.deleteButton,
                  opacity: isDeletingGroup ? 0.7 : 1,
                  cursor: isDeletingGroup ? 'wait' : 'pointer',
                }}
                onClick={handleConfirmDeleteGroup}
                disabled={isDeletingGroup}
              >
                {isDeletingGroup ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 写真選択ダイアログ (REQ-4.3) */}
      {isPhotoDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-dialog-title"
          style={styles.dialogOverlay}
          onClick={handleClosePhotoDialog}
        >
          <div style={styles.photoDialogContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.photoDialogHeader}>
              <h2 id="photo-dialog-title" style={styles.dialogTitle}>
                写真を選択
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                onClick={handleClosePhotoDialog}
                aria-label="ダイアログを閉じる"
              >
                ×
              </button>
            </div>
            {isLoadingPhotos ? (
              <div style={styles.emptyPhotos}>
                <p>写真を読み込み中...</p>
              </div>
            ) : availablePhotos.length === 0 ? (
              <div style={styles.emptyPhotos}>
                <p>利用可能な写真がありません</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>
                  現場調査で写真をアップロードしてください
                </p>
              </div>
            ) : (
              <div style={styles.photoGrid} data-testid="photo-list">
                {availablePhotos.map((photo) => {
                  const hasPhotoAnnotations =
                    photo.hasAnnotations || (photo.annotations?.length ?? 0) > 0;
                  return (
                    <div
                      key={photo.id}
                      style={{ ...styles.photoItem, position: 'relative' as const }}
                      onClick={() => handlePhotoSelect(photo.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${photo.fileName}を選択`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePhotoSelect(photo.id);
                        }
                      }}
                    >
                      <img
                        src={photo.thumbnailUrl || photo.originalUrl || ''}
                        alt={photo.fileName}
                        style={styles.photoImage}
                        data-testid={`photo-item-${photo.id}`}
                      />
                      {/* 注釈バッジ (REQ-3.3) */}
                      {hasPhotoAnnotations && (
                        <span
                          data-testid={`photo-annotation-badge-${photo.id}`}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            borderRadius: '9999px',
                            padding: '2px 6px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            minWidth: '16px',
                            textAlign: 'center',
                          }}
                        >
                          注
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 注釈ビューアモーダル (REQ-4.4) */}
      {annotationViewerGroupId &&
        (() => {
          const viewerGroup = groups.find((g) => g.id === annotationViewerGroupId);
          if (!viewerGroup?.surveyImage) return null;
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="annotation-viewer-title"
              style={styles.dialogOverlay}
              onClick={handleCloseAnnotationViewer}
              data-testid="annotation-viewer-modal"
            >
              <div
                style={{
                  ...styles.photoDialogContent,
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={styles.photoDialogHeader}>
                  <h2 id="annotation-viewer-title" style={styles.dialogTitle}>
                    {getGroupDisplayName(viewerGroup, groups.indexOf(viewerGroup))} - 紐付け画像
                  </h2>
                  <button
                    type="button"
                    style={styles.closeButton}
                    onClick={handleCloseAnnotationViewer}
                    aria-label="ダイアログを閉じる"
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    overflow: 'auto',
                    padding: '16px',
                  }}
                >
                  <AnnotatedImageThumbnail
                    image={{
                      id: viewerGroup.surveyImage.id,
                      originalUrl: viewerGroup.surveyImage.originalUrl,
                    }}
                    alt={viewerGroup.surveyImage.fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                    }}
                    loading="eager"
                  />
                </div>
                <div style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <button
                    type="button"
                    style={styles.actionButton}
                    onClick={() => {
                      handleCloseAnnotationViewer();
                      handleSelectImage(annotationViewerGroupId);
                    }}
                  >
                    別の写真を選択
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </main>
  );
}
