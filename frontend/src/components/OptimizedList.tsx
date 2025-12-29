import { memo, useMemo, useCallback, useState } from 'react';

/**
 * リストアイテムのインターフェース
 */
export interface ListItem {
  id: string | number;
  title: string;
  description?: string;
}

/**
 * 個別アイテムのProps
 */
interface ListItemProps {
  item: ListItem;
  onItemClick: (id: string | number) => void;
  isSelected: boolean;
}

/**
 * 最適化されたリストアイテムコンポーネント
 * React.memoでメモ化され、propsが変更されない限り再レンダリングされない
 */
const OptimizedListItem = memo<ListItemProps>(({ item, onItemClick, isSelected }) => {
  // デバッグ用: レンダリング回数を確認
  if (import.meta.env.DEV) {
    console.debug(`Rendering ListItem: ${item.id}`);
  }

  // useCallbackでメモ化されたクリックハンドラー
  const handleClick = useCallback(() => {
    onItemClick(item.id);
  }, [item.id, onItemClick]);

  /**
   * キーボードイベントハンドラ
   * EnterまたはSpaceキーでクリック動作を実行
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onItemClick(item.id);
      }
    },
    [item.id, onItemClick]
  );

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      style={{
        padding: '1rem',
        margin: '0.5rem 0',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#e3f2fd' : 'white',
        transition: 'background-color 0.2s',
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0' }}>{item.title}</h3>
      {item.description && <p style={{ margin: 0, color: '#525252' }}>{item.description}</p>}
    </div>
  );
});

OptimizedListItem.displayName = 'OptimizedListItem';

/**
 * リストコンポーネントのProps
 */
interface OptimizedListProps {
  items: ListItem[];
  filterText?: string;
  onItemSelect?: (id: string | number) => void;
}

/**
 * 最適化されたリストコンポーネント
 * - useMemoでフィルタリング結果をメモ化
 * - useCallbackでイベントハンドラーをメモ化
 * - React.memoで子コンポーネントをメモ化
 *
 * @example
 * const items = [
 *   { id: 1, title: 'Item 1', description: 'Description 1' },
 *   { id: 2, title: 'Item 2', description: 'Description 2' },
 * ];
 *
 * <OptimizedList
 *   items={items}
 *   filterText="Item 1"
 *   onItemSelect={(id) => console.log('Selected:', id)}
 * />
 */
export const OptimizedList = memo<OptimizedListProps>(
  ({ items, filterText = '', onItemSelect }) => {
    const [selectedId, setSelectedId] = useState<string | number | null>(null);

    // useMemoでフィルタリング結果をメモ化
    // items または filterText が変更されたときのみ再計算
    const filteredItems = useMemo(() => {
      if (!filterText) return items;

      const lowerFilter = filterText.toLowerCase();
      return items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowerFilter) ||
          item.description?.toLowerCase().includes(lowerFilter)
      );
    }, [items, filterText]);

    // ソート済みアイテムもメモ化
    const sortedItems = useMemo(() => {
      return [...filteredItems].sort((a, b) => a.title.localeCompare(b.title));
    }, [filteredItems]);

    // useCallbackでイベントハンドラーをメモ化
    // これにより、子コンポーネントが不要な再レンダリングを避けられる
    const handleItemClick = useCallback(
      (id: string | number) => {
        setSelectedId(id);
        onItemSelect?.(id);
      },
      [onItemSelect]
    );

    // 統計情報もメモ化
    const stats = useMemo(
      () => ({
        total: items.length,
        filtered: filteredItems.length,
        selected: selectedId ? 1 : 0,
      }),
      [items.length, filteredItems.length, selectedId]
    );

    return (
      <div style={{ padding: '1rem' }}>
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.5rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            表示中: {stats.filtered} / {stats.total} 件
            {stats.selected > 0 && ` | 選択中: ${stats.selected} 件`}
          </p>
        </div>

        {sortedItems.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
            アイテムが見つかりません
          </div>
        ) : (
          sortedItems.map((item) => (
            <OptimizedListItem
              key={item.id}
              item={item}
              onItemClick={handleItemClick}
              isSelected={selectedId === item.id}
            />
          ))
        )}
      </div>
    );
  }
);

OptimizedList.displayName = 'OptimizedList';

/**
 * 仮想スクロールのコンセプト実装
 * 大量のアイテムを効率的に表示するための基本的なアプローチ
 *
 * 注意: 本番環境では react-window や react-virtualized などの
 * ライブラリの使用を推奨
 */
interface VirtualListProps {
  items: ListItem[];
  itemHeight: number;
  containerHeight: number;
  onItemSelect?: (id: string | number) => void;
}

export const VirtualList = memo<VirtualListProps>(
  ({ items, itemHeight, containerHeight, onItemSelect }) => {
    const [scrollTop, setScrollTop] = useState(0);

    // 表示可能なアイテム数を計算
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    // 現在のスクロール位置から表示すべきアイテムを計算
    const { startIndex, endIndex, offsetY } = useMemo(() => {
      const start = Math.floor(scrollTop / itemHeight);
      const end = Math.min(start + visibleCount + 1, items.length);
      const offset = start * itemHeight;

      return {
        startIndex: start,
        endIndex: end,
        offsetY: offset,
      };
    }, [scrollTop, itemHeight, visibleCount, items.length]);

    // 表示するアイテムのみ抽出
    const visibleItems = useMemo(() => {
      return items.slice(startIndex, endIndex);
    }, [items, startIndex, endIndex]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const handleItemClick = useCallback(
      (id: string | number) => {
        onItemSelect?.(id);
      },
      [onItemSelect]
    );

    const totalHeight = items.length * itemHeight;

    return (
      <div
        onScroll={handleScroll}
        tabIndex={0}
        role="list"
        aria-label="アイテムリスト"
        style={{
          height: containerHeight,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* 全体の高さを確保するための要素 */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* 表示するアイテムのみレンダリング */}
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleItems.map((item) => (
              <div key={item.id} role="listitem">
                <OptimizedListItem item={item} onItemClick={handleItemClick} isSelected={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

VirtualList.displayName = 'VirtualList';
