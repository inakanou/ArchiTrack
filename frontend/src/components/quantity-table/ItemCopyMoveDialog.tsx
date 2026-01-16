/**
 * @fileoverview 項目コピー・移動ダイアログコンポーネント
 *
 * Task 5.4: 数量項目のコピー・移動UIを実装する
 *
 * Requirements:
 * - 6.1: 選択した数量項目をコピーする
 * - 6.2: 選択した数量項目を別のグループへ移動する
 * - 6.3: 同一数量表内のグループ間のみ移動可能とする
 * - 6.4: 複数項目の一括コピー/移動をサポートする
 */

import { useState, useCallback, useEffect } from 'react';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ダイアログモード
 */
export type ItemCopyMoveMode = 'copy' | 'move';

/**
 * ItemCopyMoveDialogコンポーネントのProps
 */
export interface ItemCopyMoveDialogProps {
  /** ダイアログ表示状態 */
  isOpen: boolean;
  /** モード（コピー/移動） */
  mode: ItemCopyMoveMode;
  /** 選択された項目ID */
  selectedItemIds: string[];
  /** 移動先候補のグループ一覧 */
  groups: QuantityGroupDetail[];
  /** 現在のグループID */
  currentGroupId: string;
  /** 確定コールバック */
  onConfirm: (targetGroupId: string, itemIds: string[]) => void;
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
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #e5e7eb',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#6b7280',
  } as React.CSSProperties,
  content: {
    padding: '24px',
    overflowY: 'auto' as const,
    flex: 1,
  } as React.CSSProperties,
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
  } as React.CSSProperties,
  groupList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,
  groupOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, background-color 0.2s',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  groupOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  } as React.CSSProperties,
  groupOptionDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  radio: {
    width: '18px',
    height: '18px',
    cursor: 'inherit',
    accentColor: '#2563eb',
  } as React.CSSProperties,
  groupInfo: {
    flex: 1,
  } as React.CSSProperties,
  groupName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  groupMeta: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  } as React.CSSProperties,
  currentBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: '9999px',
    fontWeight: 500,
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  } as React.CSSProperties,
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  confirmButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'background-color 0.2s, opacity 0.2s',
  } as React.CSSProperties,
  confirmButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * 閉じるアイコン
 */
function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 項目コピー・移動ダイアログ
 *
 * 選択された項目を別のグループへコピーまたは移動するためのモーダルダイアログ。
 */
export default function ItemCopyMoveDialog({
  isOpen,
  mode,
  selectedItemIds,
  groups,
  currentGroupId,
  onConfirm,
  onClose,
}: ItemCopyMoveDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // ダイアログが開くたびに選択をリセット
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ダイアログ開閉時のリセットは意図的
      setSelectedGroupId(null);
    }
  }, [isOpen]);

  /**
   * グループ選択ハンドラ
   */
  const handleSelectGroup = useCallback(
    (groupId: string) => {
      // 移動モードで現在のグループは選択不可
      if (mode === 'move' && groupId === currentGroupId) {
        return;
      }
      setSelectedGroupId(groupId);
    },
    [mode, currentGroupId]
  );

  /**
   * 確定ハンドラ
   */
  const handleConfirm = useCallback(() => {
    if (selectedGroupId) {
      onConfirm(selectedGroupId, selectedItemIds);
    }
  }, [selectedGroupId, selectedItemIds, onConfirm]);

  /**
   * グループの表示名を取得
   */
  const getGroupDisplayName = (group: QuantityGroupDetail, index: number): string => {
    return group.name || `グループ ${index + 1}`;
  };

  if (!isOpen) {
    return null;
  }

  const itemCount = selectedItemIds.length;
  const modeLabel = mode === 'copy' ? 'コピー' : '移動';
  const title = `${itemCount}件の項目を${modeLabel}`;
  const isConfirmDisabled = !selectedGroupId;

  return (
    <div
      style={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="copy-move-dialog-title"
      onClick={onClose}
    >
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div style={styles.header}>
          <h2 id="copy-move-dialog-title" style={styles.title}>
            {title}
          </h2>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        {/* コンテンツ */}
        <div style={styles.content}>
          <p style={styles.description}>
            {mode === 'copy'
              ? `${modeLabel}先のグループを選択してください`
              : `${modeLabel}先のグループを選択してください（現在のグループへは${modeLabel}できません）`}
          </p>

          <div style={styles.groupList} role="radiogroup" aria-label="グループ選択">
            {groups.map((group, index) => {
              const isCurrentGroup = group.id === currentGroupId;
              const isDisabled = mode === 'move' && isCurrentGroup;
              const isSelected = group.id === selectedGroupId;
              const displayName = getGroupDisplayName(group, index);

              return (
                <label
                  key={group.id}
                  style={{
                    ...styles.groupOption,
                    ...(isSelected ? styles.groupOptionSelected : {}),
                    ...(isDisabled ? styles.groupOptionDisabled : {}),
                  }}
                  onClick={() => !isDisabled && handleSelectGroup(group.id)}
                >
                  <input
                    type="radio"
                    name="targetGroup"
                    value={group.id}
                    checked={isSelected}
                    onChange={() => handleSelectGroup(group.id)}
                    disabled={isDisabled}
                    style={styles.radio}
                    aria-label={displayName}
                  />
                  <div style={styles.groupInfo}>
                    <div style={styles.groupName}>{displayName}</div>
                    <div style={styles.groupMeta}>{group.itemCount}項目</div>
                  </div>
                  {isCurrentGroup && <span style={styles.currentBadge}>現在のグループ</span>}
                </label>
              );
            })}
          </div>
        </div>

        {/* フッター */}
        <div style={styles.footer}>
          <button type="button" style={styles.cancelButton} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            style={{
              ...styles.confirmButton,
              ...(isConfirmDisabled ? styles.confirmButtonDisabled : {}),
            }}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {modeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
