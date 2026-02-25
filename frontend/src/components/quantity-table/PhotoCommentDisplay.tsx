/**
 * @fileoverview 写真コメント表示コンポーネント
 *
 * Task 30.1: 写真コメント表示コンポーネントを実装する
 *
 * 数量グループに紐づけられた写真のコメントを、写真の右側に表示する。
 * コメントが存在しない場合はコメント表示エリアを空白にする。
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5
 */

// ============================================================================
// 型定義
// ============================================================================

export interface PhotoCommentDisplayProps {
  /** 写真コメント（nullの場合はコメントなし） */
  comment: string | null;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  container: {
    fontSize: '12px',
    color: '#4b5563',
    wordWrap: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '120px',
    overflowY: 'auto' as const,
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
};

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 写真コメント表示コンポーネント
 *
 * 写真サムネイルの右側にコメントテキストを表示する。
 * コメントがnullまたは空文字の場合、コメント表示エリアは空白。
 */
export default function PhotoCommentDisplay({ comment }: PhotoCommentDisplayProps) {
  const hasComment = comment !== null && comment !== '';

  return (
    <div
      data-testid="photo-comment-display"
      style={styles.container}
      {...(hasComment ? { tabIndex: 0, role: 'region', 'aria-label': '写真コメント' } : {})}
    >
      {hasComment ? comment : null}
    </div>
  );
}
