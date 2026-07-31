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
import { useParams, useNavigate } from 'react-router-dom';
import {
  getEstimateDetail,
  deleteEstimate,
  calculateOverhead,
  addOverheadItem,
  saveEstimateDraft,
} from '../api/estimates';
import type {
  EstimateDetail,
  EstimateItemHierarchy,
  SaveEstimateDraftItemNode,
  SavedEstimateItemHierarchy,
} from '../api/estimates';
import { ApiError } from '../api/client';
import { OverheadCostPanel } from '../components/estimate/OverheadCostPanel';
import type {
  CalculateOverheadParams,
  AddOverheadItemParams,
  OverheadCostResult,
} from '../components/estimate/OverheadCostPanel';
import { Breadcrumb } from '../components/common';
import { EstimateItemTable, EstimateItemToolbar } from '../components/estimate';
import { useEstimateEditor } from '../hooks/useEstimateEditor';
import type {
  EstimateEditorSavePayload,
  EstimateEditorSaveResult,
  EstimateItemHierarchyEdit,
} from '../hooks/useEstimateEditor';
import type { EditableItem } from '../domain/estimate/estimateEditReducer.types';
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
  overheadOverlay: {
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
  overheadDialog: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '720px',
    width: '95%',
    maxHeight: '90vh',
    overflow: 'auto',
  } as React.CSSProperties,
  overheadDialogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as React.CSSProperties,
  saveErrorBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    backgroundColor: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '12px',
    color: '#92400e',
    fontSize: '14px',
  } as React.CSSProperties,
  saveErrorCloseButton: {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '18px',
    lineHeight: 1,
    color: '#92400e',
    cursor: 'pointer',
    padding: '0 4px',
  } as React.CSSProperties,
  overheadCloseButton: {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '24px',
    lineHeight: 1,
    color: '#6b7280',
    cursor: 'pointer',
    padding: '0 4px',
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
function toEditFormat(
  items: (EstimateItemHierarchy | SavedEstimateItemHierarchy)[] | undefined
): EstimateItemHierarchyEdit[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    isExpanded: true,
    children: toEditFormat(item.children),
  }));
}

/**
 * 明細の10進数セルを保存ペイロードの10進数文字列へ正規化する
 *
 * 見積書APIは数量・単価・金額を**数値**で返す一方（`estimate-item.service.ts` の
 * Decimal→number 変換）、`api/estimates.ts` の型は文字列として宣言しているため、
 * 一度も編集していないセルには数値が残る。一括保存のスキーマ
 * （backend `saveEstimateLineSchema`）は10進数**文字列**しか受け付けず、
 * 数値のまま送ると 400 になるので、ワイヤへ載せる直前にここで揃える。
 *
 * 空欄は `null`（省略ではなく明示送信）とし、10進数として解釈できない入力は
 * 加工せずそのまま送ってサーバー側の検証に委ねる（黙って値を捨てない）。
 */
function toDecimalPayloadValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = value;
  if (raw === '') {
    return null;
  }
  try {
    return new Decimal(raw).toFixed();
  } catch {
    return raw;
  }
}

/**
 * 編集中のツリーを一括保存のリクエスト形式へ変換する
 *
 * ワイヤ契約（design.md `SaveEstimateItemNode` / `SaveEstimateLine`、4305-4324）は
 * **null 許容だが省略不可**のため、子を持たない項目も `children: []` を、
 * 空欄のセルも `null` を明示的に載せる。キーを落とすと 400 になる。
 *
 * 既存項目は `id` ＋ `tempId: null`、新規項目は `id: null` ＋ `tempId` で送出され、
 * サーバーが `tempId` から親子関係を解決する。
 *
 * Requirements (estimate-creation):
 * - 42.1: 追加・削除・更新・並び順の変更・階層の変更を1回の保存操作でまとめて確定する
 * - 42.6: 明細の並び順を画面に表示されている順序どおりに確定する
 *   （配列順がそのまま `displayOrder` の再採番に用いられる）
 */
function toSaveEstimateItemNodes(
  items: readonly EditableItem[]
): readonly SaveEstimateDraftItemNode[] {
  return items.map((item) => ({
    id: item.id,
    tempId: item.tempId,
    itemType: item.itemType,
    lines: item.lines.map((line) => ({
      lineType: line.lineType,
      name: line.name,
      specification: line.specification,
      unit: line.unit,
      quantity: toDecimalPayloadValue(line.quantity),
      unitPrice: toDecimalPayloadValue(line.unitPrice),
      amount: toDecimalPayloadValue(line.amount),
      remarks: line.remarks,
      sourceVendorName: line.sourceVendorName,
    })),
    children: toSaveEstimateItemNodes(item.children),
  }));
}

/**
 * 保存失敗の理由を画面表示用の文言へ変換する
 *
 * Requirements (estimate-creation):
 * - 42.5: 競合が発生したことを表示する（409）。編集中の内容は呼び出し元が保持する
 *
 * 409 以外（400 / 403 / 404 / 422 / 500）はサーバーの応答内容を提示するのみで、
 * 保存前のクライアント検証は行わない（それを求める 42.4 は本タスクの範囲外）。
 */
function toSaveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 409) {
      return '他のユーザーによって更新されました。編集中の内容は保持しています。再読み込みして最新の内容を確認してください。';
    }
    if (error.statusCode === 400 || error.statusCode === 422) {
      return `保存できません: ${error.message}`;
    }
    if (error.statusCode === 403) {
      return '見積書を保存する権限がありません。';
    }
    if (error.statusCode === 404) {
      return '見積書が見つかりません。すでに削除された可能性があります。';
    }
  }
  return '保存に失敗しました。再度お試しください。';
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isNetDialogOpen, setIsNetDialogOpen] = useState(false);
  const [isProfitDialogOpen, setIsProfitDialogOpen] = useState(false);
  const [isOverheadDialogOpen, setIsOverheadDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // 表示行フィルター（デフォルト: すべてON）
  const [visibleLineTypes, setVisibleLineTypes] = useState<
    Set<'ESTIMATE' | 'EXECUTION' | 'VENDOR'>
  >(new Set(['ESTIMATE', 'EXECUTION', 'VENDOR']));

  // 保存失敗の理由（42.5: 競合を提示しつつ編集内容は保持する）
  //
  // 読み込み失敗の `error` と分けている。`error` は画面全体をエラー表示へ差し替えるため、
  // 保存失敗に使うと編集中の明細ごと画面から消えてしまう。
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * 明細の一括保存（27.3, 42.1, 42.2, 42.5, 42.6, 54.8）
   *
   * 編集中のツリー全体・楽観ロックの基準時刻・帳票用入力項目を
   * `PUT /api/estimates/:id/save` へ**1回だけ**送る。応答は保存後の最新ツリーを
   * 含むため、明細の追加取得（`GET`）は行わない（42.2）。
   *
   * 基準時刻はサーバー由来のスナップショット `estimate.updatedAt` を用い、
   * 保存成功時に応答の `updatedAt` で更新する。これにより連続保存が
   * 誤って競合（409）にならない（42.5）。
   */
  const handleEditorSave = useCallback(
    async (payload: EstimateEditorSavePayload): Promise<EstimateEditorSaveResult> => {
      if (!id || !estimate) {
        throw new Error('見積書が読み込まれていません');
      }

      const response = await saveEstimateDraft(id, {
        expectedUpdatedAt: estimate.updatedAt,
        reportFields: {
          submissionDate: payload.reportFields.submissionDate,
          validityPeriod: payload.reportFields.validityPeriod,
          separateWorks: [...payload.reportFields.separateWorks],
        },
        items: toSaveEstimateItemNodes(payload.items),
      });

      // 次回保存の基準時刻を応答で更新する（42.5）。
      // 明細の正はエディタの state のため、スナップショットの明細は据え置く。
      setEstimate((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              name: response.name,
              sourceItemizedStatementId: response.sourceItemizedStatementId,
              sourceItemizedStatementName: response.sourceItemizedStatementName,
              updatedAt: response.updatedAt,
            }
      );

      return {
        items: toEditFormat(response.items),
        reportFields: response.reportFields,
      };
    },
    [id, estimate]
  );

  /** 保存成功時（42.7 の未保存解消はフックが行う） */
  const handleSaveSuccess = useCallback(() => {
    setSaveError(null);
  }, []);

  /** 保存失敗時（42.5: 編集内容は破棄せず理由のみ提示する） */
  const handleSaveError = useCallback((error: Error) => {
    setSaveError(toSaveErrorMessage(error));
  }, []);

  // 編集用フック（27.1: 常時編集 / 27.4: 未保存が無い間は保存ボタンを無効表示）
  //
  // 編集状態は `estimateEditReducer` へ委譲済み（53.4）。
  // 保存は `onSave` を通じて一括保存APIへ1回だけ委譲する（53.5）。
  const editor = useEstimateEditor({
    estimateId: id ?? '',
    initialItems: estimate ? toEditFormat(estimate.items) : [],
    onSave: handleEditorSave,
    onSaveSuccess: handleSaveSuccess,
    onSaveError: handleSaveError,
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

  // 同一階層内での並び替え可否を計算（REQ-12.2: ↑/↓ボタン）
  const reorderSiblingInfo = useMemo(() => {
    if (!selectedItemId || !selectedItem) {
      return { canReorderUp: false, canReorderDown: false };
    }
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
    return {
      canReorderUp: currentIndex > 0,
      canReorderDown: currentIndex >= 0 && currentIndex < siblings.length - 1,
    };
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

  /**
   * 上の階層へ移動（23.9, 12.6, 12.7, 43.1, 43.3）
   *
   * 移動APIの即時呼び出しと明細の全件再取得を撤去し、編集状態の遷移へ置き換えた（53.6）。
   * 再取得は `editor.setItems` 経由で未保存の編集を上書きしてしまう（43.3）。
   * ルートレベルで実行された場合は遷移関数が `lastError` を設定して状態を変えない。
   */
  const handleMoveUp = useCallback(
    (itemId: string) => {
      editor.outdentItem(itemId);
    },
    [editor]
  );

  /**
   * 下の階層へ移動（23.10, 12.6, 12.7, 43.1, 43.3）
   *
   * `handleMoveUp` と同じく編集状態の遷移のみで完結する（53.6）。
   * 直前の兄弟が無い場合は遷移関数が `lastError` を設定して状態を変えない。
   */
  const handleMoveDown = useCallback(
    (itemId: string) => {
      editor.indentItem(itemId);
    },
    [editor]
  );

  /**
   * 同一階層内で表示順序を入れ替える（ツールバーの ↑/↓ ボタン、12.7, 43.1, 43.3）
   *
   * 並び替えAPIの即時呼び出しと明細の全件再取得を撤去し、編集状態の遷移へ置き換えた（53.6）。
   * 並び順は保存時に画面の配列順どおり送られ、サーバーが `displayOrder` を再採番する（42.6）。
   */
  const handleReorder = useCallback(
    (itemId: string, direction: 'up' | 'down') => {
      editor.moveItem(itemId, direction);
    },
    [editor]
  );

  /**
   * 保存処理（27.3, 42.1）
   *
   * 一括保存を1回だけ呼び出す。保存後の全件再取得は行わない
   * （design.md `#### Modified Files`: 「保存は1回のみ、保存後の `fetchData()` を撤去」）。
   * 再取得すると書き込み1件・読み込み1件の2往復になるうえ、
   * 応答が返した最新ツリーを別の取得で上書きすることになる。最新状態は保存応答から反映する。
   */
  const handleSave = useCallback(async () => {
    await editor.save();
  }, [editor]);

  /**
   * 諸経費の自動計算（REQ-7.3, REQ-8.3, REQ-9.3）
   *
   * パネルから受け取ったパラメータをAPI形式へ変換して計算APIを呼ぶ。
   */
  const handleCalculateOverhead = useCallback(
    async (params: CalculateOverheadParams): Promise<OverheadCostResult> => {
      if (!estimate) throw new Error('見積書が読み込まれていません');
      const result = await calculateOverhead(estimate.id, {
        costType: params.costType,
        directCost: params.directCost,
        constructionPeriod: params.constructionPeriod
          ? parseInt(params.constructionPeriod, 10)
          : undefined,
        pureConstructionCost: params.pureConstructionCost,
        constructionCost: params.constructionCost,
        isRenovation: params.isRenovation,
      });
      return { rate: result.rate, amount: result.amount, formula: result.formula };
    },
    [estimate]
  );

  /**
   * 諸経費行の追加（REQ-7.1, REQ-8.1, REQ-9.1, 43.4）
   *
   * 計算金額（または手入力値）を単価として諸経費行を追加する。
   * 追加後の**明細の全件再取得を撤去**した（53.6）。再取得は `editor.setItems` 経由で
   * それまでの未保存の編集内容を破棄してしまうため（43.4）。
   *
   * **段階1の暫定状態**: 行の作成そのものはサーバー書き込み（`POST /overhead-items`）のまま。
   * クライアント側の編集状態への反映（reducer の `addOverheadItem` アクション）は段階3の
   * 55.6 が担当し、エンドポイントの撤去は 55.7 が行う
   * （design.md `#### Modified Files` の撤去段階表: 本経路は**段階3**）。
   * それまでの間、追加した行は画面の再読み込み後に表示される。
   */
  const handleAddOverheadItem = useCallback(
    async (params: AddOverheadItemParams): Promise<void> => {
      if (!estimate) return;
      const unitPrice = parseFloat(params.unitPrice);
      await addOverheadItem(estimate.id, {
        costType: params.costType,
        unitPrice: Number.isNaN(unitPrice) ? undefined : unitPrice,
      });
      setIsOverheadDialogOpen(false);
    },
    [estimate]
  );

  /**
   * 表示行フィルター切替
   */
  const handleToggleLineType = useCallback((lineType: 'ESTIMATE' | 'EXECUTION' | 'VENDOR') => {
    setVisibleLineTypes((prev) => {
      const next = new Set(prev);
      if (next.has(lineType)) {
        next.delete(lineType);
      } else {
        next.add(lineType);
      }
      return next;
    });
  }, []);

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
   * 転記・案分・利益率適用の完了時の処理（43.4）
   *
   * 完了後の**明細の全件再取得を撤去**した（53.6）。再取得は `editor.setItems` 経由で
   * それまでの未保存の編集内容を破棄してしまうため、43.4「転記・案分・利益率適用を
   * 行った場合、それまでの未保存の編集内容を保持する」を満たせない。
   *
   * **段階1の暫定状態**: 各ダイアログは現在もサーバーへ書き込む。結果を編集状態へ
   * 反映する経路（reducer の `applyQuotationTransfer` / `applyNetAllocation` /
   * `applyProfitRate`）は段階3の 55.5・55.3・55.4 が追加し、エンドポイントの撤去は
   * 55.7 が行う（design.md `#### Modified Files` の撤去段階表: 本経路は**段階3**）。
   * それまでの間、転記結果は画面の再読み込み後に表示され、未保存の編集内容は失われない。
   * 未保存状態でのダイアログ起動抑止は 53.9 が担当する。
   */
  const handleTransferComplete = useCallback(() => {
    // 段階3（55.3〜55.5）で編集状態への反映に置き換える。ここでは再取得を行わない。
  }, []);

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
      {/* パンくずナビゲーション (REQ-15.8-15.11) */}
      <div style={styles.breadcrumbWrapper}>
        <Breadcrumb
          items={[
            { label: 'ダッシュボード', path: '/' },
            { label: 'プロジェクト一覧', path: '/projects' },
            { label: 'プロジェクト', path: `/projects/${estimate.projectId}` },
            { label: '見積書一覧', path: `/projects/${estimate.projectId}/estimates` },
            { label: '見積書' },
          ]}
        />
      </div>

      {/* ヘッダー */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>{estimate.name}</h1>
          <p style={styles.subtitle}>{formatDate(estimate.createdAt)}</p>
        </div>
        <div style={styles.headerRight}>
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.dangerButton }}
          >
            削除
          </button>
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

        {/* サマリーパネル (REQ-39: REQ-21を完全に置き換え) */}
        <div style={styles.card} data-testid="summary-panel">
          <h2 style={styles.sectionTitle}>サマリー</h2>
          {(() => {
            const estimateTotal = calculateTotalByLineType(editor.items, 'ESTIMATE');
            const executionTotal = calculateTotalByLineType(editor.items, 'EXECUTION');
            const vendorTotal = calculateTotalByLineType(editor.items, 'VENDOR');

            // REQ-39.4: 値引額 = 実行金額合計 - 業者金額合計
            const discountAmount = executionTotal.sub(vendorTotal);

            // REQ-39.5: 値引率 = 値引額 ÷ 業者金額合計（百分率）
            const discountRateCalc = vendorTotal.isZero()
              ? '-'
              : discountAmount.div(vendorTotal).mul(100).toDecimalPlaces(2).toString() + '%';

            // REQ-39.7: 利益額 = 見積金額合計 - 実行金額合計
            const profitAmount = estimateTotal.sub(executionTotal);

            // REQ-39.8: 利益率 = 利益額 ÷ 見積金額合計（百分率）
            const profitRateCalc = estimateTotal.isZero()
              ? '-'
              : profitAmount.div(estimateTotal).mul(100).toDecimalPlaces(2).toString() + '%';

            return (
              <div style={styles.summaryGrid}>
                {/* REQ-39.2: 業者金額合計 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>業者金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(vendorTotal.toString())}</span>
                </div>
                {/* REQ-39.3: 実行金額合計 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>実行金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(executionTotal.toString())}</span>
                </div>
                {/* REQ-39.4: 値引額 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>値引額</span>
                  <span style={styles.summaryValue}>{formatAmount(discountAmount.toString())}</span>
                </div>
                {/* REQ-39.5: 値引率 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>値引率</span>
                  <span style={styles.summaryValue}>{discountRateCalc}</span>
                </div>
                {/* REQ-39.6: 見積金額合計 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>見積金額合計</span>
                  <span style={styles.summaryValue}>{formatAmount(estimateTotal.toString())}</span>
                </div>
                {/* REQ-39.7: 利益額 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>利益額</span>
                  <span style={styles.summaryValue}>{formatAmount(profitAmount.toString())}</span>
                </div>
                {/* REQ-39.8: 利益率 */}
                <div style={styles.summaryItem}>
                  <span style={styles.summaryLabel}>利益率</span>
                  <span style={styles.summaryValue}>{profitRateCalc}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* アクションボタン */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
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
            onClick={() => setIsOverheadDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            諸経費を計算して追加
          </button>
          <button
            type="button"
            onClick={() => setIsExportDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            出力
          </button>
        </div>

        {/* 見積項目テーブル (REQ-14.9, REQ-23) */}
        <div style={styles.card}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>見積項目</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* 表示行フィルター */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '13px',
                  color: '#374151',
                }}
              >
                <span style={{ fontWeight: 500 }}>表示行:</span>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={visibleLineTypes.has('ESTIMATE')}
                    onChange={() => handleToggleLineType('ESTIMATE')}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ color: '#1d4ed8', fontWeight: 500 }}>見積</span>
                </label>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={visibleLineTypes.has('EXECUTION')}
                    onChange={() => handleToggleLineType('EXECUTION')}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ color: '#166534', fontWeight: 500 }}>実行</span>
                </label>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={visibleLineTypes.has('VENDOR')}
                    onChange={() => handleToggleLineType('VENDOR')}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ color: '#b45309', fontWeight: 500 }}>業者</span>
                </label>
              </div>
              {/* 保存ボタン */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!editor.isDirty || editor.isSaving}
                style={{
                  ...styles.actionButton,
                  ...styles.successButton,
                  ...(!editor.isDirty || editor.isSaving
                    ? { backgroundColor: '#86efac', cursor: 'not-allowed' }
                    : {}),
                }}
              >
                {editor.isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          {/* 保存失敗の提示（REQ-42.5: 競合を表示し編集中の内容は保持する） */}
          {saveError && (
            <div role="alert" data-testid="estimate-save-error" style={styles.saveErrorBanner}>
              <span>{saveError}</span>
              <button
                type="button"
                aria-label="保存エラーを閉じる"
                onClick={() => setSaveError(null)}
                style={styles.saveErrorCloseButton}
              >
                ×
              </button>
            </div>
          )}
          <EstimateItemToolbar
            selectedItemId={selectedItemId}
            selectedItem={selectedItem}
            hasPreviousSibling={hasPreviousSibling}
            onAddItem={() => editor.addItem()}
            onAddChildItem={(parentId) => editor.addItem(parentId)}
            onAddDiscountItem={() => editor.addDiscountItem()}
            onDeleteItem={(itemId) => editor.deleteItem(itemId)}
            onDuplicateItem={(itemId) => editor.duplicateItem(itemId)}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onReorderUp={(itemId) => handleReorder(itemId, 'up')}
            onReorderDown={(itemId) => handleReorder(itemId, 'down')}
            canReorderUp={reorderSiblingInfo.canReorderUp}
            canReorderDown={reorderSiblingInfo.canReorderDown}
          />
          <EstimateItemTable
            items={editor.items}
            draggable={true}
            onLineChange={editor.updateLine}
            onToggleExpand={editor.toggleExpanded}
            onDrop={editor.reorderItems}
            selectedItemId={selectedItemId}
            onItemSelect={setSelectedItemId}
            visibleLineTypes={visibleLineTypes}
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
        projectId={estimate.projectId}
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

      {/* 諸経費計算ダイアログ (REQ-7, REQ-8, REQ-9) */}
      {isOverheadDialogOpen && (
        <div
          style={styles.overheadOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="諸経費計算"
          data-testid="overhead-cost-dialog"
        >
          <div style={styles.overheadDialog}>
            <div style={styles.overheadDialogHeader}>
              <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>諸経費を計算して追加</h2>
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setIsOverheadDialogOpen(false)}
                style={styles.overheadCloseButton}
              >
                ×
              </button>
            </div>
            <OverheadCostPanel
              estimateId={estimate.id}
              onCalculate={handleCalculateOverhead}
              onItemAdded={handleAddOverheadItem}
            />
          </div>
        </div>
      )}
    </main>
  );
}
