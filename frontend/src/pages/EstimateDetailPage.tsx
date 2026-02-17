/**
 * @fileoverview 見積書詳細画面
 *
 * Task 11.3: EstimateDetailPageの実装
 *
 * Requirements (estimate-creation):
 * - REQ-11.2: 見積書を選択した場合、見積書の詳細を表示する
 * - REQ-11.3: 見積書を編集した場合、変更内容を保存する
 * - REQ-11.7: 同一見積書を複数ユーザーが編集した場合、楽観的排他制御により競合を検出する
 * - REQ-14.8: 見積書画面を提供する
 * - REQ-14.9: 見積書の詳細情報（見積項目一覧、合計金額等）を表示する
 * - REQ-14.10: 編集・削除・出力ボタンを提供する
 * - REQ-15.4-15.8: パンくずナビゲーション
 * - REQ-23.1-23.10: 見積項目操作ツールバー
 * - REQ-24.1-24.5: 見積項目の階層移動
 *
 * @module pages/EstimateDetailPage
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEstimateDetail, deleteEstimate, moveEstimateItem } from '../api/estimates';
import type { EstimateDetail, EstimateItemHierarchy } from '../api/estimates';
import { Breadcrumb } from '../components/common';
import { EstimateItemTable, EstimateItemToolbar } from '../components/estimate';
import { useEstimateEditor } from '../hooks/useEstimateEditor';
import type { EstimateItemHierarchyEdit } from '../hooks/useEstimateEditor';
import { EstimateExportDialog } from '../components/estimate/EstimateExportDialog';
import { TransferQuotationDialog } from '../components/estimate/TransferQuotationDialog';
import { NetAllocationDialog } from '../components/estimate/NetAllocationDialog';
import { ProfitRateDialog } from '../components/estimate/ProfitRateDialog';
import Decimal from 'decimal.js';

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    maxWidth: '1400px',
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
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
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
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
  } as React.CSSProperties,
  headerRight: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  } as React.CSSProperties,
  primaryButton: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  } as React.CSSProperties,
  secondaryButton: {
    backgroundColor: '#ffffff',
    color: '#374151',
    border: '1px solid #d1d5db',
  } as React.CSSProperties,
  dangerButton: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
  } as React.CSSProperties,
  successButton: {
    backgroundColor: '#10b981',
    color: '#ffffff',
  } as React.CSSProperties,
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  mainSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
  } as React.CSSProperties,
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  summaryItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '12px 8px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  } as React.CSSProperties,
  summaryLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b7280',
  } as React.CSSProperties,
  summaryValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1f2937',
  } as React.CSSProperties,
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '24px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
    marginBottom: '16px',
  } as React.CSSProperties,
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  } as React.CSSProperties,
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  } as React.CSSProperties,
  infoLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b7280',
  } as React.CSSProperties,
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
  } as React.CSSProperties,
  totalAmount: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1f2937',
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
  dialog: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    width: '100%',
  } as React.CSSProperties,
  dialogTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    marginBottom: '16px',
  } as React.CSSProperties,
  dialogMessage: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  } as React.CSSProperties,
  dialogButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
};

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付を日本語形式でフォーマット
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 金額をフォーマット
 */
function formatAmount(amount: string | null | undefined): string {
  if (!amount) return '-';
  const num = parseFloat(amount);
  if (isNaN(num)) return '-';
  return num.toLocaleString('ja-JP') + '円';
}

/**
 * 行タイプ別の合計金額を計算
 */
function calculateTotalByLineType(
  items: EstimateItemHierarchyEdit[],
  lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR'
): Decimal {
  let total = new Decimal(0);
  for (const item of items) {
    const line = item.lines.find((l) => l.lineType === lineType);
    if (line?.amount) {
      try {
        total = total.add(new Decimal(line.amount));
      } catch {
        // skip
      }
    }
    if (item.children.length > 0) {
      // 子項目は親の金額に含まれるため、ルートのみ集計
    }
  }
  return total;
}

/**
 * API形式の見積項目を編集用形式に変換
 */
function toEditFormat(items: EstimateItemHierarchy[] | undefined): EstimateItemHierarchyEdit[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    isExpanded: true,
    children: toEditFormat(item.children),
  }));
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 削除確認ダイアログ
 */
interface DeleteDialogProps {
  isOpen: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteDialog({ isOpen, isDeleting, onCancel, onConfirm }: DeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div style={styles.dialogContent}>
        <h2 id="delete-dialog-title" style={styles.dialogTitle}>
          見積書の削除
        </h2>
        <p style={styles.dialogMessage}>
          この見積書を削除してよろしいですか？この操作は取り消せません。
        </p>
        <div style={styles.dialogButtons}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{ ...styles.actionButton, ...styles.dangerButton }}
          >
            {isDeleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積書詳細画面
 *
 * Requirements:
 * - REQ-11.2: 見積書の詳細を表示
 * - REQ-11.3: 編集と保存
 * - REQ-14.8: 見積書画面を提供
 * - REQ-14.9: 見積項目一覧、合計金額を表示
 * - REQ-14.10: 編集・削除・出力ボタンを提供
 * - REQ-15.4-15.8: パンくずナビゲーション
 */
export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // データ状態
  const [estimate, setEstimate] = useState<EstimateDetail | null>(null);

  // UI状態
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isNetDialogOpen, setIsNetDialogOpen] = useState(false);
  const [isProfitDialogOpen, setIsProfitDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // 編集用フック
  const editor = useEstimateEditor({
    estimateId: id ?? '',
    initialItems: estimate ? toEditFormat(estimate.items) : [],
  });

  // 選択中の項目データを取得（REQ-23）
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    const findItem = (
      items: EstimateItemHierarchyEdit[],
      id: string
    ): EstimateItemHierarchyEdit | null => {
      for (const item of items) {
        if (item.id === id) return item;
        if (item.children.length > 0) {
          const found = findItem(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    return findItem(editor.items, selectedItemId);
  }, [editor.items, selectedItemId]);

  // 直前の兄弟項目が存在するかを計算（REQ-23.10）
  const hasPreviousSibling = useMemo(() => {
    if (!selectedItemId || !selectedItem) return false;
    const getSiblings = (
      items: EstimateItemHierarchyEdit[],
      targetParentId: string | null
    ): EstimateItemHierarchyEdit[] => {
      if (targetParentId === null) return items;
      for (const item of items) {
        if (item.id === targetParentId) return item.children;
        if (item.children.length > 0) {
          const found = getSiblings(item.children, targetParentId);
          if (found.length > 0) return found;
        }
      }
      return [];
    };
    const siblings = getSiblings(editor.items, selectedItem.parentId);
    const currentIndex = siblings.findIndex((s) => s.id === selectedItemId);
    return currentIndex > 0;
  }, [editor.items, selectedItemId, selectedItem]);

  /**
   * データ取得
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getEstimateDetail(id);
      setEstimate(data);
      editor.setItems(toEditFormat(data.items));
    } catch {
      setError('見積書の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 上の階層へ移動（REQ-23.9, REQ-24）
  const handleMoveUp = useCallback(
    async (itemId: string) => {
      if (!estimate) return;
      const findItem = (
        items: EstimateItemHierarchyEdit[],
        targetId: string
      ): EstimateItemHierarchyEdit | null => {
        for (const item of items) {
          if (item.id === targetId) return item;
          if (item.children.length > 0) {
            const found = findItem(item.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      const item = findItem(editor.items, itemId);
      if (!item || !item.parentId) return;
      const parent = findItem(editor.items, item.parentId);
      if (!parent) return;

      try {
        await moveEstimateItem(estimate.id, itemId, parent.parentId);
        await fetchData();
      } catch {
        setError('項目の移動に失敗しました');
      }
    },
    [editor.items, estimate, fetchData]
  );

  // 下の階層へ移動（REQ-23.10, REQ-24）
  const handleMoveDown = useCallback(
    async (itemId: string) => {
      if (!estimate) return;
      const findItem = (
        items: EstimateItemHierarchyEdit[],
        targetId: string
      ): EstimateItemHierarchyEdit | null => {
        for (const item of items) {
          if (item.id === targetId) return item;
          if (item.children.length > 0) {
            const found = findItem(item.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      const item = findItem(editor.items, itemId);
      if (!item) return;

      const getSiblings = (
        items: EstimateItemHierarchyEdit[],
        targetParentId: string | null
      ): EstimateItemHierarchyEdit[] => {
        if (targetParentId === null) return items;
        for (const it of items) {
          if (it.id === targetParentId) return it.children;
          if (it.children.length > 0) {
            const found = getSiblings(it.children, targetParentId);
            if (found.length > 0) return found;
          }
        }
        return [];
      };
      const siblings = getSiblings(editor.items, item.parentId);
      const currentIndex = siblings.findIndex((s) => s.id === itemId);
      if (currentIndex <= 0) return;
      const previousSibling = siblings[currentIndex - 1];
      if (!previousSibling) return;

      try {
        await moveEstimateItem(estimate.id, itemId, previousSibling.id);
        await fetchData();
      } catch {
        setError('項目の移動に失敗しました');
      }
    },
    [editor.items, estimate, fetchData]
  );

  /**
   * 編集モード切替
   */
  const handleEditClick = useCallback(() => {
    setIsEditMode(true);
  }, []);

  /**
   * 編集キャンセル
   */
  const handleCancelEdit = useCallback(() => {
    editor.discard();
    setIsEditMode(false);
  }, [editor]);

  /**
   * 保存処理
   */
  const handleSave = useCallback(async () => {
    await editor.save();
    setIsEditMode(false);
    // データを再取得
    await fetchData();
  }, [editor, fetchData]);

  /**
   * 削除処理
   */
  const handleDelete = useCallback(async () => {
    if (!id || !estimate) return;

    setIsDeleting(true);

    try {
      await deleteEstimate(id, estimate.updatedAt);
      navigate(`/projects/${estimate.projectId}/estimates`);
    } catch {
      setError('見積書の削除に失敗しました');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [id, estimate, navigate]);

  /**
   * 転記完了時の処理
   */
  const handleTransferComplete = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // ローディング表示
  if (isLoading) {
    return (
      <main role="main" style={styles.container}>
        <div style={styles.loadingContainer}>
          <div role="status" style={styles.loadingSpinner} aria-label="読み込み中" />
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

  // エラー表示
  if (error || !estimate) {
    return (
      <main role="main" style={styles.container}>
        <div role="alert" style={styles.errorContainer}>
          <p style={styles.errorText}>{error || '見積書が見つかりません'}</p>
          <button type="button" onClick={fetchData} style={styles.retryButton}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return (
    <main role="main" style={styles.container} data-testid="estimate-detail-page">
      {/* パンくずナビゲーション (REQ-15.4-15.8) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト詳細', path: `/projects/${estimate.projectId}` },
            { label: '見積書一覧', path: `/projects/${estimate.projectId}/estimates` },
            { label: estimate.name },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link
            to={`/projects/${estimate.projectId}/estimates`}
            style={styles.backLink}
            aria-label="見積書一覧に戻る"
          >
            ← 見積書一覧に戻る
          </Link>
          <h1 style={styles.title}>{estimate.name}</h1>
          <p style={styles.subtitle}>{formatDate(estimate.createdAt)}</p>
        </div>
        <div style={styles.headerRight}>
          {isEditMode ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                style={{ ...styles.actionButton, ...styles.secondaryButton }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!editor.isDirty || editor.isSaving}
                style={{ ...styles.actionButton, ...styles.successButton }}
              >
                {editor.isSaving ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsTransferDialogOpen(true)}
                style={{ ...styles.actionButton, ...styles.secondaryButton }}
              >
                受領見積書を業者金額に転記
              </button>
              <button
                type="button"
                onClick={() => setIsNetDialogOpen(true)}
                style={{ ...styles.actionButton, ...styles.secondaryButton }}
              >
                業者金額を実行金額に転記
              </button>
              <button
                type="button"
                onClick={() => setIsProfitDialogOpen(true)}
                style={{ ...styles.actionButton, ...styles.secondaryButton }}
              >
                実行金額を見積金額に転記
              </button>
              <button
                type="button"
                onClick={() => setIsExportDialogOpen(true)}
                style={{ ...styles.actionButton, ...styles.secondaryButton }}
              >
                出力
              </button>
              <button
                type="button"
                onClick={handleEditClick}
                style={{ ...styles.actionButton, ...styles.primaryButton }}
              >
                編集
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteDialogOpen(true)}
                style={{ ...styles.actionButton, ...styles.dangerButton }}
              >
                削除
              </button>
            </>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div style={styles.content}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>見積書名</span>
              <span style={styles.infoValue}>{estimate.name}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>参照内訳書</span>
              <span style={styles.infoValue}>{estimate.sourceItemizedStatementName || '-'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>作成日時</span>
              <span style={styles.infoValue}>{formatDate(estimate.createdAt)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>更新日時</span>
              <span style={styles.infoValue}>{formatDate(estimate.updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* サマリーパネル (REQ-21) */}
        <div style={styles.card} data-testid="summary-panel">
          <h2 style={styles.sectionTitle}>サマリー</h2>
          {(() => {
            const estimateTotal = calculateTotalByLineType(editor.items, 'ESTIMATE');
            const executionTotal = calculateTotalByLineType(editor.items, 'EXECUTION');
            const vendorTotal = calculateTotalByLineType(editor.items, 'VENDOR');
            const profitRateCalc = executionTotal.isZero()
              ? '-'
              : estimateTotal.div(executionTotal).mul(100).toDecimalPlaces(2).toString() + '%';
            const discountRateCalc = vendorTotal.isZero()
              ? '-'
              : executionTotal.div(vendorTotal).mul(100).toDecimalPlaces(2).toString() + '%';
            return (
              <div style={styles.summaryGrid}>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>見積金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(estimateTotal.toString())}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>実行金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(executionTotal.toString())}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>業者金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(vendorTotal.toString())}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>利益率</span>
                  <span style={styles.summaryValue}>{profitRateCalc}</span>
                </div>
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>値引率</span>
                  <span style={styles.summaryValue}>{discountRateCalc}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 見積項目テーブル (REQ-14.9, REQ-23) */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>見積項目</h2>
          <EstimateItemToolbar
            selectedItemId={selectedItemId}
            selectedItem={selectedItem}
            hasPreviousSibling={hasPreviousSibling}
            onAddItem={() => editor.addItem()}
            onAddChildItem={(parentId) => editor.addItem(parentId)}
            onDeleteItem={(itemId) => editor.deleteItem(itemId)}
            onDuplicateItem={(itemId) => editor.duplicateItem(itemId)}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
          <EstimateItemTable
            items={editor.items}
            draggable={isEditMode}
            onLineChange={isEditMode ? editor.updateLine : undefined}
            onToggleExpand={editor.toggleExpanded}
            onDrop={isEditMode ? editor.reorderItems : undefined}
            selectedItemId={selectedItemId}
            onItemSelect={setSelectedItemId}
          />
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <DeleteDialog
        isOpen={isDeleteDialogOpen}
        isDeleting={isDeleting}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
      />

      {/* 出力ダイアログ (REQ-10.1, REQ-10.2) */}
      <EstimateExportDialog
        isOpen={isExportDialogOpen}
        estimateId={estimate.id}
        estimateName={estimate.name}
        onClose={() => setIsExportDialogOpen(false)}
      />

      {/* 転記ダイアログ (REQ-4.1-4.5) */}
      <TransferQuotationDialog
        isOpen={isTransferDialogOpen}
        estimateId={estimate.id}
        projectId={estimate.projectId}
        estimateItems={editor.items}
        onClose={() => setIsTransferDialogOpen(false)}
        onTransferComplete={handleTransferComplete}
      />

      {/* NET金額案分ダイアログ (REQ-18) */}
      <NetAllocationDialog
        isOpen={isNetDialogOpen}
        estimateId={estimate.id}
        items={editor.items}
        onClose={() => setIsNetDialogOpen(false)}
        onComplete={handleTransferComplete}
      />

      {/* 利益率適用ダイアログ (REQ-19) */}
      <ProfitRateDialog
        isOpen={isProfitDialogOpen}
        estimateId={estimate.id}
        items={editor.items}
        onClose={() => setIsProfitDialogOpen(false)}
        onComplete={handleTransferComplete}
      />
    </main>
  );
}
