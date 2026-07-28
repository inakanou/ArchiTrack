/**
 * @fileoverview 工事写真アルバム一覧テーブルコンポーネント（デスクトップ用）
 *
 * Task 6.1: 工事写真一覧画面
 *
 * site-survey の SiteSurveyListTable のクローン。工事写真アルバムは
 * 調査日・画像数を持たないため、カラムは サムネイル / アルバム名(+メモ) /
 * 作成日 / 更新日 とする。
 *
 * Requirements:
 * - 3.1: プロジェクト配下のアルバムをページネーション付きで表示
 * - 3.4: 作成日・更新日でソート
 * - 3.5, 11.3: 一覧画面で代表サムネイル画像を優先表示
 */

import { useCallback, type KeyboardEvent } from 'react';
import type {
  ConstructionPhotoAlbum,
  ConstructionPhotoAlbumSortableField,
  ConstructionPhotoSortOrder,
} from '../../types/construction-photo.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 一覧表示用のアルバム項目
 *
 * アルバム DTO（`ConstructionPhotoAlbum`）に代表サムネURL（サーバ拡張予定）を
 * 任意プロパティとして加えたビュー用の型。任意プロパティのため
 * `ConstructionPhotoAlbum` はそのまま `ConstructionPhotoAlbumListItem` として渡せる。
 *
 * Requirements: 3.5, 11.3
 */
export type ConstructionPhotoAlbumListItem = ConstructionPhotoAlbum & {
  /** 代表サムネイルURL（未生成時 null / 未提供時 undefined） */
  thumbnailUrl?: string | null;
};

/**
 * ConstructionPhotoListTable コンポーネントのProps
 */
export interface ConstructionPhotoListTableProps {
  /** アルバム一覧データ */
  albums: ConstructionPhotoAlbumListItem[];
  /** 現在のソートフィールド */
  sortField: ConstructionPhotoAlbumSortableField;
  /** 現在のソート順序 */
  sortOrder: ConstructionPhotoSortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: ConstructionPhotoAlbumSortableField) => void;
  /** 行クリックハンドラ */
  onRowClick: (albumId: string) => void;
  /** 行の編集導線ハンドラ（アルバム編集画面へ遷移, R16.6） */
  onEditAlbum: (albumId: string) => void;
  /** 行の削除導線ハンドラ（削除確認ダイアログを開く, R16.6） */
  onDeleteAlbum: (albumId: string, albumName: string) => void;
}

// ============================================================================
// 定数定義
// ============================================================================

interface ColumnDefinition {
  key: string;
  label: string;
  sortable: boolean;
  sortKey?: ConstructionPhotoAlbumSortableField;
}

const COLUMNS: ColumnDefinition[] = [
  { key: 'thumbnail', label: 'サムネイル', sortable: false },
  { key: 'name', label: 'アルバム名', sortable: false },
  { key: 'createdAt', label: '作成日', sortable: true, sortKey: 'createdAt' },
  { key: 'updatedAt', label: '更新日', sortable: true, sortKey: 'updatedAt' },
  { key: 'actions', label: '操作', sortable: false },
];

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付をローカルフォーマットで表示
 *
 * @param dateString - ISO8601形式の日付文字列
 * @returns YYYY/MM/DD形式の日本語日付文字列
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ============================================================================
// サブコンポーネント
// ============================================================================

/**
 * ソートアイコンコンポーネント
 */
function SortIcon({ order }: { order: ConstructionPhotoSortOrder }) {
  if (order === 'asc') {
    return (
      <svg
        data-testid="sort-icon-asc"
        width="16"
        height="16"
        className="ml-1 inline-block"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    );
  }
  return (
    <svg
      data-testid="sort-icon-desc"
      width="16"
      height="16"
      className="ml-1 inline-block"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/**
 * サムネイル画像コンポーネント
 *
 * 代表サムネイル（thumbnailUrl）があれば優先表示し、なければプレースホルダーを表示する。
 *
 * Requirements: 3.5, 11.3
 */
function ThumbnailImage({ album }: { album: ConstructionPhotoAlbumListItem }) {
  if (album.thumbnailUrl) {
    return (
      <img
        src={album.thumbnailUrl}
        alt={`${album.name}のサムネイル`}
        className="w-16 h-16 object-cover rounded-lg"
        loading="lazy"
      />
    );
  }

  return (
    <div
      data-testid="thumbnail-placeholder"
      className="thumbnail-placeholder w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center"
    >
      <svg
        width="24"
        height="24"
        className="text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

/**
 * テーブルヘッダーセル
 */
function TableHeaderCell({
  column,
  currentSortField,
  currentSortOrder,
  onSort,
}: {
  column: ColumnDefinition;
  currentSortField: ConstructionPhotoAlbumSortableField;
  currentSortOrder: ConstructionPhotoSortOrder;
  onSort: (field: ConstructionPhotoAlbumSortableField) => void;
}) {
  const isCurrentSort = column.sortKey === currentSortField;
  const ariaSort = isCurrentSort
    ? currentSortOrder === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined;

  const handleClick = () => {
    if (column.sortable && column.sortKey) {
      onSort(column.sortKey);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (column.sortable && column.sortKey && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSort(column.sortKey);
    }
  };

  return (
    <th
      scope="col"
      className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50/80"
      aria-sort={ariaSort}
    >
      {column.sortable && column.sortKey ? (
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="inline-flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-1 -mx-1 py-0.5 transition-colors"
          aria-label={`${column.label}でソート`}
        >
          {column.label}
          {isCurrentSort && <SortIcon order={currentSortOrder} />}
        </button>
      ) : (
        column.label
      )}
    </th>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真アルバム一覧テーブルコンポーネント
 *
 * テーブル形式でアルバム一覧を表示し、ソートと行クリック機能を提供します。
 */
export default function ConstructionPhotoListTable({
  albums,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
  onEditAlbum,
  onDeleteAlbum,
}: ConstructionPhotoListTableProps) {
  const handleRowClick = useCallback(
    (albumId: string) => {
      onRowClick(albumId);
    },
    [onRowClick]
  );

  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent, albumId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(albumId);
      }
    },
    [onRowClick]
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full" aria-label="工事写真一覧">
        <thead>
          <tr className="border-b border-gray-200">
            {COLUMNS.map((column) => (
              <TableHeaderCell
                key={column.key}
                column={column}
                currentSortField={sortField}
                currentSortOrder={sortOrder}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {albums.map((album, index) => (
            <tr
              key={album.id}
              data-testid={`album-row-${album.id}`}
              onClick={() => handleRowClick(album.id)}
              onKeyDown={(e) => handleRowKeyDown(e, album.id)}
              tabIndex={0}
              className={`
                cursor-pointer transition-colors
                ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500
              `}
              role="row"
            >
              {/* サムネイル */}
              <td className="px-6 py-4 whitespace-nowrap">
                <ThumbnailImage album={album} />
              </td>
              {/* アルバム名 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">{album.name}</span>
                  {album.memo && (
                    <span className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                      {album.memo}
                    </span>
                  )}
                </div>
              </td>
              {/* 作成日 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <svg
                    width="16"
                    height="16"
                    className="text-gray-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  {formatDate(album.createdAt)}
                </div>
              </td>
              {/* 更新日 */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <svg
                    width="16"
                    height="16"
                    className="text-gray-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {formatDate(album.updatedAt)}
                </div>
              </td>
              {/* 行アクション（編集・削除, R16.6） */}
              <td
                className="px-6 py-4 whitespace-nowrap text-right"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEditAlbum(album.id)}
                    aria-label={`${album.name}を編集`}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAlbum(album.id, album.name)}
                    aria-label={`${album.name}を削除`}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
