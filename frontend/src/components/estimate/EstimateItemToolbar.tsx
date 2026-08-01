/**
 * @fileoverview EstimateItemToolbar - 見積項目操作ツールバー
 *
 * Task 26.1: EstimateItemToolbarコンポーネントの実装
 *
 * Requirements (estimate-creation):
 * - REQ-23.1: 見積項目テーブルの上部に項目操作ツールバーを表示する
 * - REQ-23.2: 「項目追加」ボタンを提供し、クリック時にルートレベルに新規3行1セットを追加する
 * - REQ-23.3: 選択項目に対する操作ボタン（子項目追加・削除・複製）を有効化する
 * - REQ-23.4: 「子項目追加」ボタンを提供し、選択中の項目の子として新規3行1セットを追加する
 * - REQ-23.5: 「削除」ボタンを提供し、選択中の項目を削除する
 * - REQ-23.6: 「複製」ボタンを提供し、選択中の項目を複製する
 * - REQ-23.8: 未選択時は選択必須ボタンをdisabled状態で表示する
 * - REQ-23.9: 「上の階層へ移動」ボタンを提供する
 * - REQ-23.10: 「下の階層へ移動」ボタンを提供する
 * - REQ-12.2: 「↑移動」「↓移動」ボタンで同一階層内の表示順序を入れ替える
 * - REQ-41.1: 見積項目操作ツールバーに「値引き行追加」ボタンを提供する（常に有効）
 * - REQ-41.7: 値引き行は自動計算を持たず、押下で直接ルート末尾に追加する（専用ダイアログなし）
 * - 55.1, 55.3: 注記行を任意の階層の任意の位置に追加可能とする
 * - 45.1: 明細の階層表示モードとして「ツリー表示」と「ドリルダウン表示」を提供する（Task 54.4）
 * - 45.2: 階層表示モードのデフォルトを「ツリー表示」とする（Task 54.4）
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする（Task 54.7 / 入口を置く）
 *
 * design.md `#### File Structure Plan`:
 * `EstimateItemToolbar.tsx  # 改修: 範囲選択・モード切替・取り消しを追加`
 * に従い、階層表示モードの切替操作を明細テーブル上部のツールバーに置く。
 * 表示モード自体の所有者は `useEstimateNavigation` で、本コンポーネントは
 * 現在のモードを受け取って切替を通知するだけで state を持たない。
 * （範囲選択の統合は 54.10、取り消しの統合は 54.8、キー割当は 54.6 の担当）
 *
 * @module components/estimate/EstimateItemToolbar
 */

import { EstimateKeymapHelp } from './EstimateKeymapHelp';
import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';
import type { EstimateViewMode } from '../../hooks/useEstimateNavigation';

// ============================================================================
// 型定義
// ============================================================================

/**
 * EstimateItemToolbar コンポーネントの Props
 */
export interface EstimateItemToolbarProps {
  /** 選択中の項目ID */
  selectedItemId: string | null;
  /** 選択中の項目データ（ボタン制御用） */
  selectedItem: EstimateItemHierarchyEdit | null;
  /** 直前の兄弟項目が存在するか（下の階層へボタン制御用） */
  hasPreviousSibling: boolean;
  /** 項目追加（ルートレベル） */
  onAddItem: () => void;
  /** 子項目追加（選択中項目の子として） */
  onAddChildItem: (parentId: string) => void;
  /** 値引き行追加（ルートレベル末尾、常に有効）（REQ-41.1, REQ-41.7） */
  onAddDiscountItem: () => void;
  /**
   * 注記行追加（常に有効）（55.1, 55.3）
   *
   * 選択中の項目がある場合はその直後・同一階層へ、未選択ならルート末尾へ追加する。
   * 挿入位置の解決は呼び出し側が行う。
   */
  onAddNoteItem: () => void;
  /** 項目削除 */
  onDeleteItem: (itemId: string) => void;
  /** 項目複製 */
  onDuplicateItem: (itemId: string) => void;
  /** 上の階層へ移動（親の兄弟レベルに移動） */
  onMoveUp: (itemId: string) => void;
  /** 下の階層へ移動（直前の兄弟項目の子に移動） */
  onMoveDown: (itemId: string) => void;
  /** 同一階層内で表示順序を1つ上へ入れ替える（REQ-12.2） */
  onReorderUp: (itemId: string) => void;
  /** 同一階層内で表示順序を1つ下へ入れ替える（REQ-12.2） */
  onReorderDown: (itemId: string) => void;
  /** 直前に兄弟項目が存在するか（↑移動ボタン制御用） */
  canReorderUp: boolean;
  /** 直後に兄弟項目が存在するか（↓移動ボタン制御用） */
  canReorderDown: boolean;
  /**
   * 現在の階層表示モード（45.1, 45.2）
   *
   * 所有者は `useEstimateNavigation`。本コンポーネントは表示に用いるだけ。
   */
  viewMode: EstimateViewMode;
  /** 階層表示モードの切替要求（45.1） */
  onViewModeChange: (mode: EstimateViewMode) => void;
}

/** 階層表示モードの選択肢（45.1） */
const VIEW_MODE_OPTIONS: readonly { readonly mode: EstimateViewMode; readonly label: string }[] = [
  { mode: 'tree', label: 'ツリー表示' },
  { mode: 'drilldown', label: 'ドリルダウン表示' },
];

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    transition: 'background-color 0.15s, opacity 0.15s',
  } as React.CSSProperties,
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
  addButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
    color: '#1d4ed8',
  } as React.CSSProperties,
  dangerButton: {
    color: '#dc2626',
    borderColor: '#fca5a5',
  } as React.CSSProperties,
  separator: {
    width: '1px',
    height: '24px',
    backgroundColor: '#d1d5db',
    margin: '0 4px',
  } as React.CSSProperties,
  viewModeGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,
  viewModeOption: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: '#ffffff',
    color: '#374151',
  } as React.CSSProperties,
  viewModeOptionSelected: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 見積項目操作ツールバー
 *
 * 見積項目テーブルの上部に配置し、項目の追加・削除・複製・階層移動操作を提供する。
 * 項目選択状態に応じてボタンの有効/無効を制御する。
 */
export function EstimateItemToolbar({
  selectedItemId,
  selectedItem,
  hasPreviousSibling,
  onAddItem,
  onAddChildItem,
  onAddDiscountItem,
  onAddNoteItem,
  onDeleteItem,
  onDuplicateItem,
  onMoveUp,
  onMoveDown,
  onReorderUp,
  onReorderDown,
  canReorderUp,
  canReorderDown,
  viewMode,
  onViewModeChange,
}: EstimateItemToolbarProps) {
  const isSelected = selectedItemId !== null;
  const canMoveUp = isSelected && selectedItem !== null && selectedItem.parentId !== null;
  const canMoveDown = isSelected && hasPreviousSibling;
  const reorderUpEnabled = isSelected && canReorderUp;
  const reorderDownEnabled = isSelected && canReorderDown;

  return (
    <div data-testid="estimate-item-toolbar" style={styles.toolbar}>
      {/* 項目追加 - 常に有効 (REQ-23.2) */}
      <button type="button" onClick={onAddItem} style={{ ...styles.button, ...styles.addButton }}>
        + 項目追加
      </button>

      {/* 子項目追加 - 項目選択中のみ有効 (REQ-23.4) */}
      <button
        type="button"
        onClick={() => selectedItemId && onAddChildItem(selectedItemId)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...styles.addButton,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        +↳ 子項目追加
      </button>

      {/* 値引き行追加 - 常に有効 (REQ-41.1, REQ-41.7) */}
      <button
        type="button"
        data-testid="add-discount-button"
        onClick={onAddDiscountItem}
        style={{ ...styles.button, ...styles.addButton }}
      >
        値引き行追加
      </button>

      {/* 注記行追加 - 常に有効。選択中の行の直後・同一階層へ追加する (55.1, 55.3) */}
      <button
        type="button"
        data-testid="add-note-button"
        onClick={onAddNoteItem}
        style={{ ...styles.button, ...styles.addButton }}
      >
        注記行追加
      </button>

      {/* 複製 - 項目選択中のみ有効 (REQ-23.6) */}
      <button
        type="button"
        onClick={() => selectedItemId && onDuplicateItem(selectedItemId)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        複製
      </button>

      {/* 削除 - 項目選択中のみ有効 (REQ-23.5) */}
      <button
        type="button"
        onClick={() => selectedItemId && onDeleteItem(selectedItemId)}
        disabled={!isSelected}
        style={{
          ...styles.button,
          ...styles.dangerButton,
          ...(!isSelected ? styles.buttonDisabled : {}),
        }}
      >
        削除
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/* 上の階層へ - 項目選択中かつparentId !== null (REQ-23.9) */}
      <button
        type="button"
        onClick={() => selectedItemId && onMoveUp(selectedItemId)}
        disabled={!canMoveUp}
        style={{
          ...styles.button,
          ...(!canMoveUp ? styles.buttonDisabled : {}),
        }}
      >
        上の階層へ
      </button>

      {/* 下の階層へ - 項目選択中かつ直前の兄弟項目が存在する (REQ-23.10) */}
      <button
        type="button"
        onClick={() => selectedItemId && onMoveDown(selectedItemId)}
        disabled={!canMoveDown}
        style={{
          ...styles.button,
          ...(!canMoveDown ? styles.buttonDisabled : {}),
        }}
      >
        下の階層へ
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/* ↑移動 - 同一階層内で表示順序を1つ上へ (REQ-12.2) */}
      <button
        type="button"
        data-testid="reorder-up-button"
        aria-label="上へ移動"
        title="同じ階層内で1つ上へ移動"
        onClick={() => selectedItemId && onReorderUp(selectedItemId)}
        disabled={!reorderUpEnabled}
        style={{
          ...styles.button,
          ...(!reorderUpEnabled ? styles.buttonDisabled : {}),
        }}
      >
        ↑ 上へ
      </button>

      {/* ↓移動 - 同一階層内で表示順序を1つ下へ (REQ-12.2) */}
      <button
        type="button"
        data-testid="reorder-down-button"
        aria-label="下へ移動"
        title="同じ階層内で1つ下へ移動"
        onClick={() => selectedItemId && onReorderDown(selectedItemId)}
        disabled={!reorderDownEnabled}
        style={{
          ...styles.button,
          ...(!reorderDownEnabled ? styles.buttonDisabled : {}),
        }}
      >
        ↓ 下へ
      </button>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/*
        階層表示モードの切替 (45.1, 45.2)

        項目の選択状態に依存しない表示操作なので常に有効。切替は表示状態だけを
        変更し、未保存の編集内容には触れない（45.10）。
      */}
      <div role="radiogroup" aria-label="階層表示モード" style={styles.viewModeGroup}>
        {VIEW_MODE_OPTIONS.map((option) => {
          const isCurrent = viewMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={isCurrent}
              data-testid={`view-mode-${option.mode}`}
              onClick={() => onViewModeChange(option.mode)}
              style={{
                ...styles.viewModeOption,
                ...(isCurrent ? styles.viewModeOptionSelected : {}),
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* セパレータ */}
      <div style={styles.separator} />

      {/*
        キー割当一覧の入口 (47.3)

        キーボードで行える操作の一覧なので、同じ操作を行うボタンの並びの傍らに置く。
        一覧の内容はキー割当の単一定義から生成されるため、ここは配置するだけで
        受け渡す状態を持たない。明細領域（`Esc` を横取りするキー操作の受け口）の
        外側にあたるので、一覧を開いている間の `Esc` は一覧を閉じる操作になる。
      */}
      <EstimateKeymapHelp />
    </div>
  );
}
