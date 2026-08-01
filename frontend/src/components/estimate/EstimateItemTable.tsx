/**
 * @fileoverview EstimateItemTableコンポーネント - 見積項目テーブル
 *
 * Task 9.1: EstimateItemTableコンポーネントの実装
 * Task 54.2: 階層表示モード別のサブコンポーネントへ分離し、ツリー表示を接続
 *
 * 見積項目の明細テーブルの**外枠**（ヘッダー行・スクロール領域・空状態）と、
 * 階層表示モードごとの描画の振り分けを担います。行の描画はモード別の
 * サブコンポーネントが持ちます。
 *
 * - ツリー表示（既定 / 45.2）: {@link EstimateItemTreeView}
 * - ドリルダウン表示（45.6〜45.9）: {@link EstimateItemDrilldownView}
 *
 * 折りたたみ・選択などの**表示状態は本コンポーネントも保持しません**。
 * 単一の所有者は `useEstimateNavigation` であり、`collapsedKeys` /
 * `onToggleCollapsed` として受け渡されます（design.md 「状態には保存対象のみを
 * 保持する。表示状態（モード・選択・展開・カーソル）は保持しない」）。
 *
 * Requirements (estimate-creation):
 * - REQ-1.1: タイトル行に名称・規格・単位・数量・単価・金額・備考のラベルを表示する
 * - REQ-1.3: 金額フィールドを単価と数量の積として自動計算する
 * - REQ-1.4: 金額フィールドを入力不可として表示する
 * - REQ-1.5: 合計行に全見積項目の金額合計を自動計算して表示する
 * - REQ-2.1: 見積項目に親子関係を設定可能とする
 * - REQ-2.2: 親項目を持つ見積項目を作成した場合、その項目を親項目の子として階層表示する
 * - REQ-2.3: 子項目を持つ場合、親項目の金額として子項目の金額合計を自動計算して表示する
 * - REQ-2.4: 複数階層のネストをサポートする
 * - REQ-2.6: 項目の階層レベルをインデント表示で視覚的に区別する
 * - REQ-2.7: 親項目を展開または折りたたむ場合、子項目の表示/非表示を切り替える
 * - REQ-12.2: 見積項目の表示順序を変更した場合、ドラッグ&ドロップで順序を変更可能とする
 * - REQ-45.3, 45.4, 45.5: ツリー表示の一覧・展開/折りたたみ・子孫の非表示
 * - REQ-45.6, 45.7, 45.8, 45.9: ドリルダウン表示の現在階層一覧・経路表示・階層移動
 * - REQ-46.5: 階層構造パネルで項目を選択した場合、明細の表示を当該項目へ移動する
 *   （スクロール領域を所有するのが本コンポーネントのため、移動もここが担う）
 *
 * @module components/estimate/EstimateItemTable
 */

import { useEffect, useRef } from 'react';
import { EstimateItemTreeView } from './EstimateItemTreeView';
import type { EstimateLineChangeHandler, EstimateVisibleLineTypes } from './EstimateItemTreeView';
import { EstimateItemDrilldownView } from './EstimateItemDrilldownView';
import type { NodeKey } from '../../domain/estimate/estimateTree';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import type { EstimateViewMode } from '../../hooks/useEstimateNavigation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 明細の表示を特定の項目まで移動する要求（46.5）
 *
 * 「どの項目へ移動するか」だけでなく「何度目の要求か」を持つ。同じ項目を選び直した
 * 場合も利用者にとっては移動要求であり、キーだけを渡す形では2回目以降が無反応になる。
 */
export interface EstimateRowRevealRequest {
  /** 表示を移動する対象の項目キー（明細行の識別子と同一） */
  key: NodeKey;
  /** 移動要求の連番。同じキーでも値が変われば移動をやり直す */
  requestId: number;
}

/**
 * EstimateItemTableコンポーネントのProps
 */
export interface EstimateItemTableProps {
  /** 見積項目の階層データ */
  items: EstimateItemHierarchyEdit[];
  /**
   * 階層表示モード（45.1, 45.2）
   *
   * 所有者は `useEstimateNavigation`。未指定は既定のツリー表示。
   */
  viewMode?: EstimateViewMode;
  /**
   * ドリルダウン表示の現在階層（45.6）
   *
   * 所有者は `useEstimateNavigation`。`null` / 未指定はルート階層。
   * ツリー表示では用いない。
   */
  currentLevelKey?: NodeKey | null;
  /** ドリルダウン表示の現在階層の変更要求（45.7, 45.8, 45.9） */
  onCurrentLevelChange?: (key: NodeKey | null) => void;
  /**
   * 折りたたみ中の項目キー（45.5）
   *
   * 所有者は `useEstimateNavigation`。未指定は「折りたたみなし」。
   */
  collapsedKeys?: ReadonlySet<NodeKey>;
  /** 展開/折りたたみの切り替え要求（45.4） */
  onToggleCollapsed?: (key: NodeKey) => void;
  /** 選択中の項目ID */
  selectedItemId?: string | null;
  /**
   * 明細の表示を当該項目まで移動する要求（46.5）
   *
   * 階層構造パネル（`EstimateHierarchyPanel`）で項目が選ばれたときに画面から渡る。
   * 選択状態（`selectedItemId`）と分ける理由は、選択は「どれが選ばれているか」という
   * 継続する状態であるのに対し、移動は「いま動かせ」という一度きりの要求だから。
   * `null` / 未指定は移動要求なし。
   */
  revealRequest?: EstimateRowRevealRequest | null;
  /** ドラッグ可能かどうか */
  draggable?: boolean;
  /** 項目選択コールバック */
  onItemSelect?: (itemId: string) => void;
  /** 行フィールド変更コールバック */
  onLineChange?: EstimateLineChangeHandler;
  /** ドラッグ開始コールバック */
  onDragStart?: (itemId: string) => void;
  /** ドロップコールバック */
  onDrop?: (sourceId: string, targetId: string) => void;
  /** 表示する行タイプのフィルター */
  visibleLineTypes?: EstimateVisibleLineTypes;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  table: {
    width: '100%',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '60px 120px 1fr 120px 80px 100px 100px 120px 1fr',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    fontSize: '13px',
    color: '#374151',
  } as React.CSSProperties,
  headerCell: {
    textAlign: 'center' as const,
  },
  headerCellType: {
    textAlign: 'center' as const,
    fontSize: '12px',
    color: '#6b7280',
  },
  body: {
    maxHeight: '600px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    color: '#6b7280',
    fontSize: '14px',
  } as React.CSSProperties,
  emptyIcon: {
    width: '48px',
    height: '48px',
    marginBottom: '16px',
    color: '#d1d5db',
  },
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 空状態アイコン
 */
function EmptyIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={styles.emptyIcon}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 見積項目テーブル
 *
 * ヘッダー行と本体の外枠を描画し、明細行の描画は階層表示モードごとの
 * サブコンポーネントへ委譲します。
 *
 * @example
 * ```tsx
 * const editor = useEstimateEditor({ ... });
 * const navigation = useEstimateNavigation({ items: editor.editState.items });
 *
 * <EstimateItemTable
 *   items={editor.items}
 *   collapsedKeys={navigation.collapsedKeys}
 *   onToggleCollapsed={navigation.toggleCollapsed}
 *   onLineChange={editor.updateLine}
 * />
 * ```
 */
export function EstimateItemTable({
  items,
  viewMode = 'tree',
  currentLevelKey = null,
  onCurrentLevelChange,
  collapsedKeys,
  onToggleCollapsed,
  selectedItemId,
  revealRequest = null,
  draggable = false,
  onItemSelect,
  onLineChange,
  visibleLineTypes,
}: EstimateItemTableProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // 明細の表示を対象項目まで移動する（46.5）
  //
  // 折りたたまれた祖先の展開や現在階層の移動（`useEstimateNavigation.revealAndSelect`）は
  // 「対象が一覧に**含まれる**」までしか保証しない。行数の多い見積書では対象がスクロール領域の
  // 外にあるままなので、要求のたびにスクロール位置そのものを動かす。
  //
  // 対象行は展開・階層移動と同じコミットで描画済みのため、この副作用の時点で存在する。
  const revealKey = revealRequest === null ? null : revealRequest.key;
  const revealRequestId = revealRequest === null ? null : revealRequest.requestId;
  useEffect(() => {
    if (revealKey === null) {
      return;
    }
    const body = bodyRef.current;
    if (body === null) {
      return;
    }
    // 属性セレクタのエスケープを持ち込まないため、走査して照合する
    const targetTestId = `estimate-item-${revealKey}`;
    for (const row of body.querySelectorAll<HTMLElement>('[data-testid]')) {
      if (row.dataset.testid === targetTestId) {
        row.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  }, [revealKey, revealRequestId]);

  return (
    <div style={styles.table} aria-label="見積項目テーブル">
      {/* ヘッダー行 */}
      <div aria-hidden="true">
        <div style={styles.headerRow}>
          <div style={styles.headerCellType}>種別</div>
          <div style={styles.headerCell}>見積業者</div>
          <div style={styles.headerCell}>名称</div>
          <div style={styles.headerCell}>規格</div>
          <div style={styles.headerCell}>単位</div>
          <div style={styles.headerCell}>数量</div>
          <div style={styles.headerCell}>単価</div>
          <div style={styles.headerCell}>金額</div>
          <div style={styles.headerCell}>備考</div>
        </div>
      </div>

      {/* ボディ（明細のスクロール領域。46.5 の「移動」はこの中で起こる） */}
      <div style={styles.body} ref={bodyRef}>
        {items.length === 0 ? (
          <div style={styles.emptyState}>
            <EmptyIcon />
            <span>見積項目がありません</span>
          </div>
        ) : viewMode === 'drilldown' ? (
          <EstimateItemDrilldownView
            items={items}
            currentLevelKey={currentLevelKey}
            onCurrentLevelChange={onCurrentLevelChange}
            selectedItemId={selectedItemId}
            draggable={draggable}
            onItemSelect={onItemSelect}
            onLineChange={onLineChange}
            visibleLineTypes={visibleLineTypes}
          />
        ) : (
          <EstimateItemTreeView
            items={items}
            collapsedKeys={collapsedKeys}
            onToggleCollapsed={onToggleCollapsed}
            selectedItemId={selectedItemId}
            draggable={draggable}
            onItemSelect={onItemSelect}
            onLineChange={onLineChange}
            visibleLineTypes={visibleLineTypes}
          />
        )}
      </div>
    </div>
  );
}

export default EstimateItemTable;
