/**
 * @fileoverview 並び順変更ボタンUIコンポーネント
 *
 * Task 36.1: SortOrderButtonsコンポーネントを実装する
 *
 * Requirements:
 * - 23.3, 23.4, 23.5, 23.6, 23.8: 数量グループの並び順制御
 * - 24.3, 24.4, 24.5, 24.6, 24.8: 数量項目の並び順制御
 *
 * 上へ移動ボタンと下へ移動ボタンを縦に配置する共通UIコンポーネント。
 * currentIndexとtotalCountに基づくボタン有効/無効制御を実装。
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * SortOrderButtonsコンポーネントのProps
 */
export interface SortOrderButtonsProps {
  /** 現在のインデックス（0始まり） */
  currentIndex: number;
  /** アイテム総数 */
  totalCount: number;
  /** 上に移動するコールバック */
  onMoveUp: () => void;
  /** 下に移動するコールバック */
  onMoveDown: () => void;
  /** 全体的な操作不可制御 */
  disabled?: boolean;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
  } as React.CSSProperties,
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#374151',
    padding: 0,
    transition: 'background-color 0.15s',
    fontSize: '12px',
    lineHeight: 1,
  } as React.CSSProperties,
  buttonDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 並び順変更ボタン
 *
 * 上へ移動（▲）と下へ移動（▼）を縦に配置する共通コンポーネント。
 * 最上位で上ボタン無効、最下位で下ボタン無効、アイテム1つで両方無効。
 */
export default function SortOrderButtons({
  currentIndex,
  totalCount,
  onMoveUp,
  onMoveDown,
  disabled = false,
}: SortOrderButtonsProps) {
  const isUpDisabled = disabled || currentIndex <= 0 || totalCount <= 1;
  const isDownDisabled = disabled || currentIndex >= totalCount - 1 || totalCount <= 1;

  return (
    <div style={styles.container} data-testid="sort-order-buttons">
      <button
        type="button"
        style={{
          ...styles.button,
          ...(isUpDisabled ? styles.buttonDisabled : {}),
        }}
        onClick={isUpDisabled ? undefined : onMoveUp}
        disabled={isUpDisabled}
        aria-label="上へ移動"
      >
        &#9650;
      </button>
      <button
        type="button"
        style={{
          ...styles.button,
          ...(isDownDisabled ? styles.buttonDisabled : {}),
        }}
        onClick={isDownDisabled ? undefined : onMoveDown}
        disabled={isDownDisabled}
        aria-label="下へ移動"
      >
        &#9660;
      </button>
    </div>
  );
}
