/**
 * @fileoverview EstimateBreadcrumbPath - ドリルダウン表示の現在階層経路
 *
 * Task 54.3: ドリルダウン表示と現在階層の経路表示
 *
 * 明細のドリルダウン表示で、現在の階層の位置を**ルートからの経路**として表示し、
 * 経路上の各階層へ戻る操作を提供します（45.7）。
 *
 * **画面遷移のパンくず（見積書一覧 → 見積書詳細）とは別物**です。あちらは
 * 画面間の位置を示す共通ナビゲーションで、こちらは明細テーブル内部の
 * 「いまどの階層を一覧しているか」を示します。両者を取り違えないよう、
 * 本コンポーネントは `aria-label="明細の階層経路"` を用います。
 *
 * 経路の段（セグメント）は上位から順に並び、**末尾が現在の階層**です。
 * 現在の階層は戻り先ではないためボタンにせず `aria-current` を付与します。
 *
 * 状態は保持しません。経路の導出は呼び出し側（{@link EstimateItemDrilldownView}）が
 * `estimateTree.pathToDisplayRow` で行い、本コンポーネントは描画と通知のみを担います。
 *
 * Requirements (estimate-creation):
 * - 45.7: 現在の階層の位置をルートからの経路として表示し、経路上の各階層へ戻る操作を提供する
 *
 * @module components/estimate/EstimateBreadcrumbPath
 */

import { Fragment } from 'react';
import type { NodeKey } from '../../domain/estimate/estimateTree';

// ============================================================================
// 定数
// ============================================================================

/** ルート階層（現在階層 `null`）を表す経路の先頭ラベル */
export const ESTIMATE_ROOT_LEVEL_LABEL = '全体';

// ============================================================================
// 型定義
// ============================================================================

/** 経路の1段 */
export interface EstimateBreadcrumbSegment {
  /** その階層を表すノードキー。`null` はルート階層 */
  readonly key: NodeKey | null;
  /** 画面に表示する名称 */
  readonly label: string;
}

/** EstimateBreadcrumbPath コンポーネントのProps */
export interface EstimateBreadcrumbPathProps {
  /** ルートから現在階層までの経路（末尾が現在階層） */
  segments: readonly EstimateBreadcrumbSegment[];
  /** 経路上の階層へ戻る要求（45.7） */
  onNavigate?: (key: NodeKey | null) => void;
}

// ============================================================================
// スタイル定義
// ============================================================================

const styles = {
  nav: {
    // 固定表示や余白は配置側（明細テーブルの階層バー）が持つ
    minWidth: 0,
  } as React.CSSProperties,
  list: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: '4px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    fontSize: '13px',
  } as React.CSSProperties,
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  separator: {
    color: '#9ca3af',
  } as React.CSSProperties,
  link: {
    border: 'none',
    backgroundColor: 'transparent',
    padding: '2px 4px',
    color: '#2563eb',
    cursor: 'pointer',
    borderRadius: '4px',
    fontSize: '13px',
  } as React.CSSProperties,
  current: {
    padding: '2px 4px',
    color: '#374151',
    fontWeight: 600,
  } as React.CSSProperties,
};

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * ドリルダウン表示の現在階層経路（45.7）
 *
 * @example
 * ```tsx
 * <EstimateBreadcrumbPath
 *   segments={[{ key: null, label: '全体' }, { key: 'root-1', label: '建築工事' }]}
 *   onNavigate={navigation.setCurrentLevelKey}
 * />
 * ```
 */
export function EstimateBreadcrumbPath({ segments, onNavigate }: EstimateBreadcrumbPathProps) {
  if (segments.length === 0) {
    return null;
  }

  const lastIndex = segments.length - 1;

  return (
    <nav style={styles.nav} aria-label="明細の階層経路">
      <ol style={styles.list}>
        {segments.map((segment, index) => {
          const isCurrent = index === lastIndex;
          return (
            <Fragment key={segment.key ?? '__root__'}>
              {/* 区切りは装飾。経路の段としては数えないため支援技術から隠す */}
              {index > 0 && (
                <li style={styles.separator} aria-hidden="true">
                  ／
                </li>
              )}
              <li style={styles.item}>
                {isCurrent ? (
                  // 現在の階層は戻り先ではないため操作にしない
                  <span style={styles.current} aria-current="true">
                    {segment.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    style={styles.link}
                    onClick={() => onNavigate?.(segment.key)}
                  >
                    {segment.label}
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export default EstimateBreadcrumbPath;
