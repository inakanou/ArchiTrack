/**
 * @fileoverview 工事写真アルバム一覧カードコンポーネント（モバイル用）
 *
 * Task 6.1: 工事写真一覧画面
 *
 * site-survey の SiteSurveyListCard のクローン。
 *
 * Requirements:
 * - 3.1: プロジェクト配下のアルバムをページネーション付きで表示
 * - 3.2: モバイルはカード形式で表示
 * - 3.5, 11.3: 一覧画面で代表サムネイル画像を優先表示
 */

import { useCallback } from 'react';
import type { ConstructionPhotoAlbumListItem } from './ConstructionPhotoListTable';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConstructionPhotoListCard コンポーネントのProps
 */
export interface ConstructionPhotoListCardProps {
  /** アルバム一覧データ */
  albums: ConstructionPhotoAlbumListItem[];
  /** カードクリックハンドラ */
  onCardClick: (albumId: string) => void;
  /**
   * カードの編集導線ハンドラ（アルバム編集画面へ遷移, R16.6）。
   * 未指定時は編集ボタンを表示しない（権限連動, R17.1）。
   */
  onEditAlbum?: (albumId: string) => void;
  /**
   * カードの削除導線ハンドラ（削除確認ダイアログを開く, R16.6）。
   * 未指定時は削除ボタンを表示しない（権限連動, R17.2）。
   */
  onDeleteAlbum?: (albumId: string, albumName: string) => void;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 日付をローカルフォーマットで表示
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
 * サムネイル画像コンポーネント
 *
 * Requirements: 3.5, 11.3
 */
function ThumbnailImage({ album }: { album: ConstructionPhotoAlbumListItem }) {
  if (album.thumbnailUrl) {
    return (
      <img
        src={album.thumbnailUrl}
        alt={`${album.name}のサムネイル`}
        className="w-20 h-20 object-cover rounded-lg"
        loading="lazy"
      />
    );
  }

  return (
    <div
      data-testid="thumbnail-placeholder"
      className="thumbnail-placeholder w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center"
    >
      <svg
        width="32"
        height="32"
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
 * 個別カードコンポーネント
 */
function AlbumCard({
  album,
  onClick,
  onEdit,
  onDelete,
}: {
  album: ConstructionPhotoAlbumListItem;
  onClick: (albumId: string) => void;
  onEdit?: (albumId: string) => void;
  onDelete?: (albumId: string, albumName: string) => void;
}) {
  const handleClick = useCallback(() => {
    onClick(album.id);
  }, [album.id, onClick]);

  // アクセシビリティ: カード全体をクリック可能にしつつ、編集/削除ボタンを
  // インタラクティブ要素の内側にネストさせない（axe nested-interactive 回避）。
  // 詳細表示は「stretched button」でカード全面を覆い、編集/削除ボタンはその兄弟要素
  // として z-index を上げて独立操作可能にする。
  return (
    <div
      data-testid={`album-card-${album.id}`}
      className="relative bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-blue-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 transition-all"
    >
      {/* 主導線: 詳細表示（カード全面を覆う stretched button） */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={`${album.name}の詳細を表示`}
        data-testid={`album-card-open-${album.id}`}
        className="absolute inset-0 z-0 rounded-xl cursor-pointer focus:outline-none"
      />

      {/* 表示コンテンツ（非インタラクティブ・クリックは背面の stretched button へ透過） */}
      <div className="pointer-events-none relative z-10 flex gap-4">
        {/* サムネイル */}
        <div className="flex-shrink-0">
          <ThumbnailImage album={album} />
        </div>

        {/* 情報 */}
        <div className="flex-1 min-w-0">
          {/* アルバム名 */}
          <h3 className="text-base font-medium text-gray-900 truncate">{album.name}</h3>

          {/* メモ */}
          {album.memo && <p className="text-sm text-gray-500 mt-0.5 truncate">{album.memo}</p>}

          {/* 作成日・更新日 */}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <svg
                width="14"
                height="14"
                className="text-gray-400"
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
              <span>{formatDate(album.createdAt)}</span>
            </div>
          </div>
        </div>

        {/* 矢印アイコン */}
        <div className="flex-shrink-0 self-center">
          <svg
            width="20"
            height="20"
            className="text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* カードアクション（編集・削除, R16.6, 権限連動 R17.1, R17.2）
          stretched button の兄弟要素として z-index を上げ独立操作可能にする */}
      {(onEdit || onDelete) && (
        <div className="relative z-10 flex justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(album.id)}
              aria-label={`${album.name}を編集`}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              編集
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(album.id, album.name)}
              aria-label={`${album.name}を削除`}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              削除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真アルバム一覧カードコンポーネント（モバイル用）
 */
export default function ConstructionPhotoListCard({
  albums,
  onCardClick,
  onEditAlbum,
  onDeleteAlbum,
}: ConstructionPhotoListCardProps) {
  return (
    <div data-testid="album-card-list" className="space-y-3">
      {albums.map((album) => (
        <AlbumCard
          key={album.id}
          album={album}
          onClick={onCardClick}
          onEdit={onEditAlbum}
          onDelete={onDeleteAlbum}
        />
      ))}
    </div>
  );
}
