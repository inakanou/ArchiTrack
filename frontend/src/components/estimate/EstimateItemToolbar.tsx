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
 *
 * @module components/estimate/EstimateItemToolbar
 */

import type { EstimateItemHierarchyEdit } from '../../hooks/useEstimateEditor';

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
  /** 項目削除 */
  onDeleteItem: (itemId: string) => void;
  /** 項目複製 */
  onDuplicateItem: (itemId: string) => void;
  /** 上の階層へ移動（親の兄弟レベルに移動） */
  onMoveUp: (itemId: string) => void;
  /** 下の階層へ移動（直前の兄弟項目の子に移動） */
  onMoveDown: (itemId: string) => void;
}

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
  onDeleteItem,
  onDuplicateItem,
  onMoveUp,
  onMoveDown,
}: EstimateItemToolbarProps) {
  const isSelected = selectedItemId !== null;
  const canMoveUp = isSelected && selectedItem !== null && selectedItem.parentId !== null;
  const canMoveDown = isSelected && hasPreviousSibling;

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
    </div>
  );
}
