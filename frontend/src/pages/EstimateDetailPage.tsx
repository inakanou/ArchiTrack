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
 * Task 53.7 追加: 未保存状態の表示と離脱ガード
 * - 27.4: 未保存の変更がない場合、保存ボタンを無効状態で表示する
 * - 27.5: 未保存の変更がある間はその旨を画面上に表示する
 * - 27.6: 未保存の変更がある状態で画面を離れようとした場合、確認を求める
 * - 27.7: 自動保存を行わない（書き込みは保存ボタンの操作だけを起点とする）
 *
 * Task 53.9 追加: 転記系ダイアログの暫定ガード（段階3の 55.7 で撤去する暫定措置）
 * - 43.4: 転記・案分・利益率適用・諸経費追加でそれまでの未保存の編集内容を保持する
 * - 49.5: これらの操作の実行後の保存で競合エラーを発生させない
 * - 42.9: 保存処理において既存の見積項目とその実行予算項目からの参照関係を維持する
 *
 * @module pages/EstimateDetailPage
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import {
  getEstimateDetail,
  getEstimateItems,
  deleteEstimate,
  calculateOverhead,
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
// 帳票用入力項目のパネル（56.8）。`../components/estimate` の barrel 経由にしないのは、
// `EstimateDetailPage.test.tsx` が barrel を丸ごとモックしており、
// 結線漏れが検知されない死角に入るため（53.14 / 54.2 / 54.10 の再発防止）。
import { EstimateReportFieldsPanel } from '../components/estimate/EstimateReportFieldsPanel';
import { Breadcrumb } from '../components/common';
import UnsavedChangesDialog from '../components/common/UnsavedChangesDialog';
import {
  EstimateHierarchyPanel,
  EstimateItemTable,
  EstimateItemToolbar,
} from '../components/estimate';
import type { EstimateRowRevealRequest } from '../components/estimate';
import { useEstimateEditor } from '../hooks/useEstimateEditor';
import { useEstimateNavigation } from '../hooks/useEstimateNavigation';
import { useEstimateKeyboard } from '../hooks/useEstimateKeyboard';
import { useEstimateUndo } from '../hooks/useEstimateUndo';
import type { UseEstimateUndoReturn } from '../hooks/useEstimateUndo';
import type { EstimateViewMode } from '../hooks/useEstimateNavigation';
import type { NodeKey } from '../domain/estimate/estimateTree';
import { useEstimateViewModePreference } from '../hooks/useEstimateViewModePreference';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import type {
  EstimateEditorSavePayload,
  EstimateEditorSaveResult,
  EstimateItemHierarchyEdit,
} from '../hooks/useEstimateEditor';
import type {
  EditableItem,
  EditError,
  NetAllocationPayload,
  ProfitRatePayload,
  QuotationTransferPayload,
} from '../domain/estimate/estimateEditReducer.types';
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
  /** 階層構造パネルの表示/非表示の切替行（46.7） */
  hierarchyPanelToggleRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: '8px',
  } as React.CSSProperties,
  hierarchyPanelToggleButton: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
  } as React.CSSProperties,
  /** 階層構造パネルと明細テーブルの横並び（46.1） */
  itemsLayout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  } as React.CSSProperties,
  /** 明細テーブル側。パネルの幅に押し出されないよう縮小を許す */
  itemsTableArea: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  /** 未保存の変更がある間の表示（27.5） */
  unsavedIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '9999px',
    padding: '4px 12px',
    color: '#92400e',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
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
    // 注記行は金額の集計対象から除外する（55.2）
    if (item.itemType === 'NOTE') {
      continue;
    }
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

/**
 * 明細ツリーから項目を探す（表示ツリー）
 *
 * 選択中の項目の解決とツールバーの制御に用いる。
 */
function findItemById(
  items: readonly EstimateItemHierarchyEdit[],
  id: string
): EstimateItemHierarchyEdit | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (item.children.length > 0) {
      const found = findItemById(item.children, id);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

/**
 * 無効化された階層操作の理由を画面表示用の文言へ変換する（Task 54.10）
 *
 * Requirements (estimate-creation):
 * - 44.6: ルートレベルで「上の階層へ移動」が実行された場合、操作を実行せず
 *   それ以上上げられないことを示す
 * - 44.7: 自身または子孫の子になる移動は実行せずエラーを表示する
 *
 * 遷移関数は `lastError` を返すだけで表示は行わない（純粋層のため）。
 * tasks.md Implementation Notes の「44.6 を表示する担当タスクが存在しない」
 * という申し送りに従い、本画面が唯一の表示先になる。
 */
function toEditErrorMessage(error: EditError): string {
  switch (error.kind) {
    case 'CANNOT_OUTDENT_ROOT':
      return 'すでに最上位の階層のため、これ以上上げられません。';
    case 'NO_PRECEDING_SIBLING':
      return '同じ階層に直前の項目が無いため、階層を下げられません。';
    case 'CYCLIC_MOVE':
      return '自身の下の階層へは移動できません。';
    case 'INVALID_PARENT_TYPE':
      return '値引き行・注記行は子項目を持てないため、その下へは移動できません。';
  }
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

  /**
   * 明細の表示を特定の項目まで移動する要求（46.5）
   *
   * 選択状態とは別に持つ。選択は継続する状態、移動は一度きりの
   * 要求であり、同じ項目を選び直したときにも移動をやり直す必要があるため。
   */
  const [rowRevealRequest, setRowRevealRequest] = useState<EstimateRowRevealRequest | null>(null);

  /**
   * 階層構造パネルの表示/非表示（46.7）
   *
   * 45.11 の階層表示モードと違い、46.7 は「次回の画面表示時にも引き継ぐ」と
   * 述べていないため端末へ永続化しない。既定は表示（46.1 が画面に俯瞰パネルを
   * 提供すると定めているため）。
   */
  const [isHierarchyPanelVisible, setIsHierarchyPanelVisible] = useState(true);

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

  /**
   * 取り消し・やり直しの参照（48.1, 48.7）
   *
   * 取り消しフック（`useEstimateUndo`）は編集フック（`useEstimateEditor`）の状態を
   * 読み書きし、編集フックは変更の直前に取り消しフックへ通知する。相互参照になるため、
   * 呼び出しの順序に依存しない参照を1つだけ挟む（利用はどちらも描画後の操作時のみ）。
   */
  const undoRef = useRef<UseEstimateUndoReturn | null>(null);

  /**
   * 明細・帳票用入力項目を変更する直前（48.1, 48.8）
   *
   * 変更前の編集状態を取り消し履歴へ積む。通知元は遷移を起こす唯一の場所
   * （`useEstimateEditor`）なので、操作の種類が増えても取りこぼさない。
   */
  const handleBeforeEdit = useCallback((label: string) => {
    undoRef.current?.recordSnapshot(label);
  }, []);

  /** 保存成功時（42.7 の未保存解消はフックが行う） */
  const handleSaveSuccess = useCallback(() => {
    setSaveError(null);
    // 保存が確定した時点で取り消し履歴を破棄する（48.7）。
    // 破棄しないと、保存済みの内容を保存前の状態へ戻せてしまい、
    // 画面とサーバーの内容が無言で食い違う。
    undoRef.current?.clearOnSave();
  }, []);

  /**
   * 編集の基準ツリーが差し替わった直後（48.7）
   *
   * 読み込みと保存応答の反映は、いずれも `editor.setItems` で基準ごとツリーを入れ替える。
   * 取り消し履歴は入れ替え前のツリーを前提としたスナップショットのため、ここで必ず破棄する。
   * 残すと、たとえば「編集 → 保存 → やり直し」で保存前のツリーへ戻り、
   * 画面とサーバーの内容が無言で食い違う。
   */
  const handleBaselineReplaced = useCallback(() => {
    undoRef.current?.clearHistory();
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
    onBeforeChange: handleBeforeEdit,
    onBaselineReplaced: handleBaselineReplaced,
  });

  /**
   * 取り消し・やり直し（48.1〜48.7）
   *
   * 取り消しの単位は編集状態のスナップショット。復元は reducer の state を
   * 丸ごと差し替えるだけなので、サーバーへの問い合わせを伴わず（48.5）、
   * 祖先の集計金額も遷移時に計算済みの値がそのまま戻る（48.6）。
   */
  const undo = useEstimateUndo({
    getState: () => editor.editState,
    restoreState: editor.restoreState,
  });

  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);

  // 階層表示モードの端末単位の引き継ぎ（45.11 / 54.4）
  //
  // 初期モードはマウント時に一度だけ読み出し、表示状態フックへ注入する。
  // 保存値が無い・壊れている場合は既定のツリー表示へ縮退する（45.2）。
  const viewModePreference = useEstimateViewModePreference();

  // 表示状態（階層表示モード・折りたたみ・選択範囲・カーソル）の単一の所有者（54.1）
  //
  // 編集状態とは独立した state のため、折りたたみ操作は未保存の編集内容へ影響しない
  // （45.10）。読み取り元は reducer の明細ツリーで、本フックはこれを書き換えない。
  const navigation = useEstimateNavigation({
    items: editor.editState.items,
    initialViewMode: viewModePreference.initialViewMode,
  });

  /**
   * 階層表示モードの切替（45.1, 45.10, 45.11）
   *
   * 表示状態のみを更新し、編集状態（保存対象）には触れないため未保存の編集内容は
   * 切替をまたいで保持される（45.10）。あわせて選択を端末へ保存し、次回の画面表示へ
   * 引き継ぐ（45.11）。
   *
   * 現在階層はルートへ戻す。design.md `#### 階層表示モードの状態遷移（45.1〜45.11）`
   * の状態遷移図でドリルダウン表示の入口が `[*] --> ルート階層` と定義されており、
   * モード切替でドリルダウン表示へ入るときはルート階層から始まる。
   */
  const { setViewMode: setNavigationViewMode, setCurrentLevelKey: setNavigationLevelKey } =
    navigation;
  const { persist: persistViewMode } = viewModePreference;
  const handleViewModeChange = useCallback(
    (mode: EstimateViewMode): void => {
      setNavigationViewMode(mode);
      setNavigationLevelKey(null);
      persistViewMode(mode);
    },
    [setNavigationViewMode, setNavigationLevelKey, persistViewMode]
  );

  /**
   * 選択の所有者（44.1, 44.2, 23.7 / Task 54.10）
   *
   * 54.9 までは画面が `selectedItemId` を、表示状態フックが `selectedKeys` を
   * それぞれ持っており、行クリックは前者だけ・キー操作は両方を書いていた。
   * 二重所有のままでは 23.7（クリックした行のハイライト）と 44.8（選択行数の表示）が
   * 別々の真実を見ることになるため、**所有者を `useEstimateNavigation` へ一本化**する。
   *
   * 画面はここから派生値を読むだけで選択の state を持たない。
   * 「主たる選択項目」は選択範囲の先頭行とする（44.4 が親へ昇格させる行と同じ基準）。
   *
   * 副次的な効果として、折りたたみや階層移動で一覧から消えた行が選択に残らない
   * （`selectedKeys` は表示対象から導出されるため）。操作できない行がツールバーの
   * 対象であり続ける状態がなくなる。
   */
  const selectedKeys = navigation.selectedKeys;
  const selectedItemId: string | null = selectedKeys[0] ?? null;

  const { selectSingle: selectSingleRow, clearSelection: clearRowSelection } = navigation;

  /**
   * 注記行の追加（55.1, 55.3）
   *
   * 基準行があればその直後・同一階層へ、無ければルート末尾へ挿入する。
   * ツールバーのボタンとキー操作（23.11）の双方から同じ関数を通す。
   */
  const { items: editorItems, addNoteItem } = editor;
  const handleAddNoteItem = useCallback(
    (afterId: string | null): void => {
      const anchor = afterId === null ? null : findItemById(editorItems, afterId);
      addNoteItem(anchor === null ? undefined : { parentId: anchor.parentId, afterId: anchor.id });
    },
    [editorItems, addNoteItem]
  );

  /**
   * キー操作の配線（47.1〜47.8, 23.11）
   *
   * キーの条件分岐は `estimateKeymap`（単一定義）が持ち、画面はコマンドの
   * 実行先を渡すだけ。行操作はいずれもローカル操作で、サーバーへの保存を
   * 伴わない（47.8）。
   *
   * 追加系と並び替えはツールバーのボタンと**同じ関数**へ配線する。別経路にすると
   * 「ボタンとキーで結果が違う」状態が起こりうるため（23.11）。
   */
  const {
    insertRowAfter,
    deleteRows,
    duplicateRows,
    indentRange,
    outdentRange,
    addItem,
    addDiscountItem,
    moveItem,
  } = editor;
  const keyboardCommands = useMemo(
    () => ({
      insertRowAfter,
      deleteRows,
      duplicateRows,
      indentRange,
      outdentRange,
      addRootItem: () => addItem(),
      addChildItem: (parentKey: NodeKey) => addItem(parentKey),
      addDiscountRow: () => addDiscountItem(),
      addNoteRow: handleAddNoteItem,
      reorderRow: (key: NodeKey, direction: 'up' | 'down') => moveItem(key, direction),
    }),
    [
      insertRowAfter,
      deleteRows,
      duplicateRows,
      indentRange,
      outdentRange,
      addItem,
      addDiscountItem,
      moveItem,
      handleAddNoteItem,
    ]
  );

  const keyboard = useEstimateKeyboard({
    items: editor.editState.items,
    viewMode: navigation.viewMode,
    currentLevelKey: navigation.currentLevelKey,
    visibleKeys: navigation.visibleKeys,
    selectedKeys: navigation.selectedKeys,
    cursorKey: navigation.cursor?.key ?? null,
    commands: keyboardCommands,
    onSelectSingle: selectSingleRow,
    onExtendSelectionTo: navigation.extendSelectionTo,
    onClearSelection: clearRowSelection,
    onViewModeChange: handleViewModeChange,
    onCurrentLevelChange: navigation.setCurrentLevelKey,
    onUndo: undo.undo,
    onRedo: undo.redo,
  });

  /**
   * 階層構造パネルで項目が選ばれたとき（46.5）
   *
   * 「明細の表示を当該項目へ移動する」は2段階で成立する。
   *
   * 1. 対象を一覧に**含める**: `revealAndSelect` が担う。ツリー表示なら折りたたまれた
   *    祖先を展開し、ドリルダウン表示なら当該項目が属する階層へ現在階層を移す。
   *    ただしツリー表示ではパネルに現れている項目の祖先は定義上すべて展開済み
   *    （パネルと明細は同一の `collapsedKeys` を共有する）ため、この段階だけでは
   *    画面上は何も動かない。
   * 2. 対象まで表示を**動かす**: `rowRevealRequest` を明細テーブルへ渡し、スクロール
   *    領域を当該行まで移動させる。行数の多い見積書では対象が一覧に含まれていても
   *    画面外にあるため、この段階がないと 46.5 の「移動」が観測できない。
   *
   * 明細行のハイライトは `revealAndSelect` が書く選択状態から導かれる（54.10 で
   * 所有者を一本化したため、画面側で選択を書き足す必要はない）。行の識別子は
   * 編集状態と同じノードキーで、`EstimateItemHierarchyEdit.id` と一致する
   * （`useEstimateEditor.toViewTree`）。
   */
  const { revealAndSelect: revealAndSelectItem } = navigation;
  const handleHierarchySelect = useCallback(
    (key: NodeKey): void => {
      revealAndSelectItem(key);
      setRowRevealRequest((previous) => ({
        key,
        requestId: previous === null ? 1 : previous.requestId + 1,
      }));
    },
    [revealAndSelectItem]
  );

  // ==========================================================================
  // 未保存の変更がある状態での離脱ガード（27.6）
  //
  // 「画面を離れようとした場合」は2経路ある。どちらか一方だけでは編集内容が
  // 無言で失われるため両方を塞ぐ。
  // - アプリ内の画面遷移: `useBlocker(isDirty)` で遷移を保留し、共有の
  //   `UnsavedChangesDialog` で確認する（離れる→`proceed()` / とどまる→`reset()`）。
  //   本画面はデータルーター（`createBrowserRouter`、`App.tsx`）配下の
  //   `routes.tsx` に登録されているため `useBlocker` が機能する。
  // - ブラウザによる離脱（タブを閉じる・再読み込み）: 共有フック
  //   `useUnsavedChanges` の `beforeunload` ハンドラでブラウザ標準の確認を出す。
  //
  // 未保存判定の正は `estimateEditReducer` 側の `editor.isDirty`（53.4）であり、
  // `useUnsavedChanges` は自前の dirty state を持つため、`setDirty` で追従させる。
  // `enabled` オプションだけを渡してもフック内部の dirty は false のままで
  // `beforeunload` が登録されないことに注意（`useUnsavedChanges.ts:216-239`）。
  // ==========================================================================
  const { setDirty: setUnsavedGuardDirty } = useUnsavedChanges();

  useEffect(() => {
    setUnsavedGuardDirty(editor.isDirty);
  }, [editor.isDirty, setUnsavedGuardDirty]);

  // 削除完了後の遷移先（27.6 の離脱ガードの対象外とするため state で保持する）
  //
  // 未保存の変更がある状態で見積書を削除すると、削除後の `navigate()` まで離脱ガードに
  // 捕捉され、「このページにとどまる」を選ぶと**削除済みレコードの詳細画面**に
  // 取り残される（53.7 の申し送り）。27.6 のガードは「編集内容を失う遷移」を対象と
  // するもので、編集対象そのものが消えた後の退避には当てはまらない。遷移先を state に
  // 置いてガードを解除した描画で遷移させ、確認を挟まずに一覧へ戻す。
  const [postDeleteRedirectPath, setPostDeleteRedirectPath] = useState<string | null>(null);

  const blocker = useBlocker(editor.isDirty && postDeleteRedirectPath === null);

  useEffect(() => {
    if (postDeleteRedirectPath !== null) {
      navigate(postDeleteRedirectPath);
    }
  }, [postDeleteRedirectPath, navigate]);

  // ==========================================================================
  // 転記・案分・利益率適用・諸経費追加・値引き行追加はすべてクライアント反映（55.3〜55.6）
  //
  // 53.9 が入れていた暫定ガード（未保存時のダイアログ起動抑止）と、その対をなす
  // 操作直後の再同期（`resyncAfterServerSideMutation`）は 55.6 で**同時に**撤去した。
  // どちらもサーバー書き込みが残っている間だけ必要な措置で、最後の書き込み経路
  // （諸経費行追加の `POST /:id/overhead-items`）が編集状態への反映へ移った時点で、
  // 抑止する対象も取り込むべきサーバー側の行も存在しない。
  // 片方だけを残すと 53.4 で指摘された欠陥（未保存の編集を `setItems` が破棄する／
  // サーバーが作った行が保存ペイロードから欠落する）が再発するため、対で外している。
  // ==========================================================================

  // 選択範囲の先頭行の項目データを取得（REQ-23, 44.4）
  const selectedItem = useMemo(
    () => (selectedItemId === null ? null : findItemById(editor.items, selectedItemId)),
    [editor.items, selectedItemId]
  );

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
   * データ取得（53.15）
   *
   * 見積書のスナップショット（`name` / `updatedAt` など）と明細を**別の経路**から取る。
   * `GET /api/estimates/:id` が返す `items` は型宣言に反して**平坦な配列**であり、
   * `parentId` は持つが `children` キーを持たない（`estimate.service.ts` の
   * `toEstimateDetailInfo`）。これを `toEditFormat` に渡すと全項目が `children: []`
   * となり、編集状態では全項目がルート扱いになる。一括保存は全件同期のため、
   * そのまま保存すると DB 上の `parentId` が NULL 化されて既存の階層が失われる
   * （保存は 200 で成功するため無言のデータ破壊になる）。
   * 明細は階層形を返す `GET /api/estimates/:id/items` から取る（2.2, 2.6, 45.3, 34.5, 42.1）。
   *
   * 2本のリクエストは**この順序**で直列に発行する。楽観ロックの基準時刻
   * （`estimate.updatedAt`、52.5）は明細を読むより**前**に取得しなければならない。
   * 逆順（または並行）にすると、2本の間に他者の更新が入った場合に
   * 「明細より新しい基準時刻」を持つことになり、陳腐化した明細での保存が
   * 競合検出をすり抜けて通ってしまう。この順序なら基準時刻が古い側に倒れるため、
   * 保存は 409 として検出される（42.5）。
   */
  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getEstimateDetail(id);
      const items = await getEstimateItems(id);
      setEstimate(data);
      // 帳票用入力項目も編集の基準ごと入れ替える（54.6）。
      // ここで渡さないと保存済みの提出日・有効期限・別途工事が編集状態に入らず、
      // 次の保存が空の値でサーバーを上書きする。
      editor.setItems(toEditFormat(items), data.reportFields);
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
   * 上の階層へ移動（23.9, 12.6, 12.7, 43.1, 43.3, 44.3, 44.5, 44.6）
   *
   * 移動APIの即時呼び出しと明細の全件再取得を撤去し、編集状態の遷移へ置き換えた（53.6）。
   * 再取得は `editor.setItems` 経由で未保存の編集を上書きしてしまう（43.3）。
   *
   * 54.10 で対象を**選択範囲全体**にした（44.3）。範囲版の遷移関数は表示順を
   * 前提にしており、`useEstimateNavigation.selectedKeys` は表示順で導出されるため
   * 並べ替えずにそのまま渡す。ルートレベルの行が含まれる場合は遷移関数が
   * `lastError` に `CANNOT_OUTDENT_ROOT` を設定して状態を変えない（44.6）。
   */
  const handleMoveUp = useCallback(
    (itemIds: readonly string[]) => {
      editor.outdentRange(itemIds);
    },
    [editor]
  );

  /**
   * 下の階層へ移動（23.10, 12.6, 12.7, 43.1, 43.3, 44.3, 44.4）
   *
   * `handleMoveUp` と同じく編集状態の遷移のみで完結する（53.6）。
   * 単一選択なら直前の兄弟の子へ、複数選択なら先頭行を親として残りをその子へ
   * 配置する（44.4）。規則の切り替えは遷移関数側が件数で行うため、画面は
   * 選択範囲を表示順のまま渡すだけでよい。
   */
  const handleMoveDown = useCallback(
    (itemIds: readonly string[]) => {
      editor.indentRange(itemIds);
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
   * 諸経費行の追加（7.1, 7.7, 8.1, 8.7, 9.1, 9.7, 43.4, 49.1, 49.3）
   *
   * 計算金額（または手入力値）を単価として、プリセット値の諸経費行を
   * **編集状態へ反映する**（55.6）。サーバー書き込み（`POST /:id/overhead-items`）と
   * その直後の再同期を撤去したため、追加はその場で完結し、それまでの未保存の
   * 編集内容も失われない（43.4）。追加は未保存の変更として扱われ、続く保存操作で
   * 他の変更とまとめて確定する（7.7, 8.7, 9.7, 42.1）。
   *
   * プリセット値（名称・規格・単位・数量）の決定はドメイン層の遷移が持つ。
   * 画面はどの費目かと単価だけを渡す。単価は10進数文字列のまま渡し、数値へ
   * 変換しない（`parseFloat` を通すと桁の大きい金額で精度を落とす）。
   *
   * 自動計算そのものは書き込みを伴わない既存の計算経路
   * （{@link handleCalculateOverhead} → `POST /:id/calculate-overhead`）が担う。
   */
  const handleAddOverheadItem = useCallback(
    (params: AddOverheadItemParams): void => {
      editor.addOverheadItem({ costType: params.costType, unitPrice: params.unitPrice });
      setIsOverheadDialogOpen(false);
    },
    [editor]
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
      // 離脱ガードを解除した描画で遷移させる（削除済み画面への取り残しを防ぐ）
      setPostDeleteRedirectPath(`/projects/${estimate.projectId}/estimates`);
    } catch {
      setError('見積書の削除に失敗しました');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }, [id, estimate]);

  /**
   * 受領見積書転記の適用（55.5）
   *
   * サーバーへは書き込まず、転記結果を未保存の変更として編集状態へ反映する。
   * 明細の再取得を伴わないため、それまでの未保存の編集内容はそのまま残る。
   *
   * Requirements (estimate-creation):
   * - 4.1, 4.2, 4.3, 4.4: 選択した明細行を業者金額行として編集中の明細へ反映する
   * - 4.6, 49.1, 49.2, 49.3: 未保存の変更として反映し、再取得も書き込みも行わない
   * - 30.3, 30.4: 未保存の新規項目を含む既存項目の子項目として転記する
   * - 49.8: 取り消し可能とする（`useEstimateEditor` が `onBeforeChange` を通知する）
   */
  const handleQuotationTransferApply = useCallback(
    (payload: QuotationTransferPayload) => {
      editor.applyQuotationTransfer(payload);
    },
    [editor]
  );

  /**
   * NET金額案分の適用（55.3）
   *
   * サーバーへは書き込まず、案分結果を未保存の変更として編集状態へ反映する。
   * 明細の再取得を伴わないため、それまでの未保存の編集内容はそのまま残る。
   *
   * Requirements (estimate-creation):
   * - 5.3, 5.8: 案分結果を実行金額行へ反映し、プレビューと一致させる
   * - 49.1, 49.2, 49.3: 未保存の変更として反映し、再取得も書き込みも行わない
   * - 49.8: 取り消し可能とする（`useEstimateEditor` が `onBeforeChange` を通知する）
   */
  const handleNetAllocationApply = useCallback(
    (payload: NetAllocationPayload) => {
      editor.applyNetAllocation(payload);
    },
    [editor]
  );

  /**
   * 利益率適用（55.4）
   *
   * サーバーへは書き込まず、適用結果を未保存の変更として編集状態へ反映する。
   * 明細の再取得を伴わないため、それまでの未保存の編集内容はそのまま残る。
   *
   * Requirements (estimate-creation):
   * - 6.2, 6.3, 6.4, 6.7: 上書きオプションの3分岐を編集中の値に対して判定する
   * - 6.8: プレビューに表示した新しい単価と実際に反映される単価を一致させる
   * - 49.1, 49.2, 49.3: 未保存の変更として反映し、再取得も書き込みも行わない
   * - 49.8: 取り消し可能とする（`useEstimateEditor` が `onBeforeChange` を通知する）
   */
  const handleProfitRateApply = useCallback(
    (payload: ProfitRatePayload) => {
      editor.applyProfitRate(payload);
    },
    [editor]
  );

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
        {/* 53.9 で入れた「未保存の変更がある間はダイアログを起動させない」暫定措置は
            どのボタンにも残っていない。転記・案分・利益率・諸経費追加の書き込み経路が
            すべてクライアント側の編集状態への反映へ移り（55.3〜55.6）、対応する
            エンドポイントも 55.7 で撤去されたため、抑止する対象が存在しない（49.3）。
            以下の各コメントはボタンごとの根拠を残したもの。 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
          {/* 受領見積書転記は 55.5 でクライアント反映へ移ったためガードの対象外。
              未保存の新規項目を転記先に選べることが要件（30.4, 49.6, 49.7）であり、
              未保存を理由に起動を抑止すると要件そのものが実行できない。 */}
          <button
            type="button"
            onClick={() => setIsTransferDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            受領見積書を業者金額に転記
          </button>
          {/* NET金額案分は 55.3 でクライアント計算へ移ったためガードの対象外。
              未保存の業者金額を含む編集中の値で案分するのが要件（5.8, 18.10, 49.6）で
              あり、未保存を理由に起動を抑止すると要件そのものが実行できない。 */}
          <button
            type="button"
            onClick={() => setIsNetDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            業者金額を実行金額に転記
          </button>
          {/* 利益率適用は 55.4 でクライアント計算へ移ったためガードの対象外。
              未保存の実行金額を含む編集中の値で適用するのが要件（6.8, 19.8, 49.6）で
              あり、未保存を理由に起動を抑止すると要件そのものが実行できない。 */}
          <button
            type="button"
            onClick={() => setIsProfitDialogOpen(true)}
            style={{ ...styles.actionButton, ...styles.secondaryButton }}
          >
            実行金額を見積金額に転記
          </button>
          {/* 諸経費追加は 55.6 でクライアント反映へ移ったためガードの対象外。
              追加は未保存の変更として扱うのが要件（7.7, 8.7, 9.7）で、未保存を
              理由に起動を抑止すると2件目以降を追加する経路が存在しなくなる。 */}
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
              {/* 未保存の変更がある間の表示（27.5） */}
              {editor.isDirty && (
                <span
                  role="status"
                  data-testid="estimate-unsaved-indicator"
                  style={styles.unsavedIndicator}
                >
                  未保存の変更があります
                </span>
              )}
              {/* 保存ボタン（27.4: 未保存の変更がない間は無効表示） */}
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
          {/*
            階層構造パネルの表示/非表示（46.7）

            非表示のときに再表示する入口が要るため、切替はパネルの外側に置く。
          */}
          <div style={styles.hierarchyPanelToggleRow}>
            <button
              type="button"
              data-testid="toggle-hierarchy-panel"
              aria-pressed={isHierarchyPanelVisible}
              onClick={() => setIsHierarchyPanelVisible((visible) => !visible)}
              style={styles.hierarchyPanelToggleButton}
            >
              {isHierarchyPanelVisible ? '階層パネルを隠す' : '階層パネルを表示'}
            </button>
          </div>
          {/*
            無効化された階層操作の理由の提示（44.6, 44.7）

            遷移関数は状態を変えずに理由だけを返すため、画面が示さないと
            「押しても何も起きない」操作になる。保存失敗（`saveError`）とは
            別に持つ: あちらはサーバー応答、こちらは編集操作の即時の結果で、
            解除の契機（次の成功操作 / `dismissError`）も異なる。
          */}
          {editor.lastError !== null && (
            <div role="alert" data-testid="estimate-edit-error" style={styles.saveErrorBanner}>
              <span>{toEditErrorMessage(editor.lastError)}</span>
              <button
                type="button"
                aria-label="操作エラーを閉じる"
                onClick={editor.dismissError}
                style={styles.saveErrorCloseButton}
              >
                ×
              </button>
            </div>
          )}
          {/*
            帳票用入力項目（54.1〜54.3, 54.6, 54.8）

            編集は `editor.updateReportFields` を通るため、明細の編集とまったく同じ
            `isDirty` に載る。未保存インジケーター（27.5 / 53.7）と保存ボタンの活性が
            帳票用入力項目の編集にもそのまま効く。
          */}
          <EstimateReportFieldsPanel
            value={editor.reportFields}
            onChange={editor.updateReportFields}
          />
          <EstimateItemToolbar
            selectedKeys={selectedKeys}
            selectedItem={selectedItem}
            hasPreviousSibling={hasPreviousSibling}
            onAddItem={() => editor.addItem()}
            onAddChildItem={(parentId) => editor.addItem(parentId)}
            onAddDiscountItem={() => editor.addDiscountItem()}
            // 選択中の行の直後・同一階層へ、未選択ならルート末尾へ挿入する（55.3）
            onAddNoteItem={() => handleAddNoteItem(selectedItemId)}
            onDeleteItems={(itemIds) => editor.deleteRows(itemIds)}
            onDuplicateItems={(itemIds) => editor.duplicateRows(itemIds)}
            onMoveUpItems={handleMoveUp}
            onMoveDownItems={handleMoveDown}
            onReorderUp={(itemId) => handleReorder(itemId, 'up')}
            onReorderDown={(itemId) => handleReorder(itemId, 'down')}
            canReorderUp={reorderSiblingInfo.canReorderUp}
            canReorderDown={reorderSiblingInfo.canReorderDown}
            viewMode={navigation.viewMode}
            onViewModeChange={handleViewModeChange}
            canUndo={undo.canUndo}
            canRedo={undo.canRedo}
            onUndo={undo.undo}
            onRedo={undo.redo}
          />
          {/*
            階層構造の俯瞰パネル（46.1〜46.6）と明細を横に並べる。

            パネルの折りたたみ状態は明細テーブルと同じ `navigation.collapsedKeys`
            を共有するため、両者の展開状態が食い違わない。
          */}
          {/*
            キー操作の受け口（47.1〜47.8）。階層構造パネルと明細テーブルの双方を
            含む領域に置くことで、パネル上のキー操作も同じ割当で解決できる。
          */}
          <div style={styles.itemsLayout} {...keyboard.keyboardProps}>
            {isHierarchyPanelVisible && (
              <EstimateHierarchyPanel
                items={editor.editState.items}
                collapsedKeys={navigation.collapsedKeys}
                selectedKey={selectedItemId}
                onToggleCollapsed={navigation.toggleCollapsed}
                onExpandAll={navigation.expandAll}
                onCollapseAll={navigation.collapseAll}
                onSelect={handleHierarchySelect}
              />
            )}
            <div style={styles.itemsTableArea}>
              <EstimateItemTable
                items={editor.items}
                draggable={true}
                onLineChange={editor.updateLine}
                collapsedKeys={navigation.collapsedKeys}
                onToggleCollapsed={navigation.toggleCollapsed}
                viewMode={navigation.viewMode}
                currentLevelKey={navigation.currentLevelKey}
                onCurrentLevelChange={navigation.setCurrentLevelKey}
                onDrop={editor.reorderItems}
                selectedKeys={selectedKeys}
                revealRequest={rowRevealRequest}
                onItemSelect={selectSingleRow}
                visibleLineTypes={visibleLineTypes}
              />
            </div>
          </div>
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

      {/* 受領見積書転記ダイアログ (REQ-4)。転記は編集状態への反映のみ（55.5 / 49.3） */}
      <TransferQuotationDialog
        isOpen={isTransferDialogOpen}
        projectId={estimate.projectId}
        items={editor.items}
        onClose={() => setIsTransferDialogOpen(false)}
        onApply={handleQuotationTransferApply}
      />

      {/* NET金額案分ダイアログ (REQ-18)。適用は編集状態への反映のみ（55.3 / 49.3） */}
      <NetAllocationDialog
        isOpen={isNetDialogOpen}
        projectId={estimate.projectId}
        items={editor.items}
        onClose={() => setIsNetDialogOpen(false)}
        onApply={handleNetAllocationApply}
      />

      {/* 利益率適用ダイアログ (REQ-19)。適用は編集状態への反映のみ（55.4 / 49.3） */}
      <ProfitRateDialog
        isOpen={isProfitDialogOpen}
        items={editor.items}
        onClose={() => setIsProfitDialogOpen(false)}
        onApply={handleProfitRateApply}
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

      {/* 未保存の変更がある状態でのアプリ内遷移の確認（27.6） */}
      <UnsavedChangesDialog
        isOpen={blocker.state === 'blocked'}
        onLeave={() => blocker.proceed?.()}
        onStay={() => blocker.reset?.()}
      />
    </main>
  );
}
