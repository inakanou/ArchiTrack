/**
 * @fileoverview 工事写真アルバム一覧レスポンシブビューコンポーネント
 *
 * Task 6.1: 工事写真一覧画面
 *
 * site-survey の SiteSurveyResponsiveView のクローン。画面幅に応じて
 * テーブル表示（デスクトップ/タブレット）とカード表示（モバイル）を切り替える。
 *
 * Requirements:
 * - 3.2: デスクトップは表形式、モバイルはカード形式
 * - 3.5, 11.3: 代表サムネイル優先表示
 */

import useMediaQuery from '../../hooks/useMediaQuery';
import { MEDIA_QUERIES } from '../../utils/responsive';
import ConstructionPhotoListTable from './ConstructionPhotoListTable';
import ConstructionPhotoListCard from './ConstructionPhotoListCard';
import type { ConstructionPhotoAlbumListItem } from './ConstructionPhotoListTable';
import type {
  ConstructionPhotoAlbumSortableField,
  ConstructionPhotoSortOrder,
} from '../../types/construction-photo.types';

// ============================================================================
// 型定義
// ============================================================================

/**
 * ConstructionPhotoResponsiveView コンポーネントのProps
 */
export interface ConstructionPhotoResponsiveViewProps {
  /** アルバム一覧データ */
  albums: ConstructionPhotoAlbumListItem[];
  /** 現在のソートフィールド */
  sortField: ConstructionPhotoAlbumSortableField;
  /** 現在のソート順序 */
  sortOrder: ConstructionPhotoSortOrder;
  /** ソート変更ハンドラ */
  onSort: (field: ConstructionPhotoAlbumSortableField) => void;
  /** 行/カードクリックハンドラ */
  onRowClick: (albumId: string) => void;
  /**
   * 行/カードの編集導線ハンドラ（アルバム編集画面へ遷移, R16.6）。
   * 未指定時は編集ボタンを表示しない（権限連動, R17.1）。
   */
  onEditAlbum?: (albumId: string) => void;
  /**
   * 行/カードの削除導線ハンドラ（削除確認ダイアログを開く, R16.6）。
   * 未指定時は削除ボタンを表示しない（権限連動, R17.2）。
   */
  onDeleteAlbum?: (albumId: string, albumName: string) => void;
}

// ============================================================================
// メインコンポーネント
// ============================================================================

/**
 * 工事写真アルバム一覧レスポンシブビューコンポーネント
 *
 * 画面幅に応じてテーブル（デスクトップ/タブレット）とカード（モバイル）を切り替えます。
 */
export default function ConstructionPhotoResponsiveView({
  albums,
  sortField,
  sortOrder,
  onSort,
  onRowClick,
  onEditAlbum,
  onDeleteAlbum,
}: ConstructionPhotoResponsiveViewProps) {
  const isMobile = useMediaQuery(MEDIA_QUERIES.isMobile);

  // 空の場合のメッセージ表示
  if (albums.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          width="48"
          height="48"
          className="mx-auto text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-gray-500">工事写真アルバムがありません</p>
      </div>
    );
  }

  // モバイル: カード表示
  if (isMobile) {
    return (
      <ConstructionPhotoListCard
        albums={albums}
        onCardClick={onRowClick}
        onEditAlbum={onEditAlbum}
        onDeleteAlbum={onDeleteAlbum}
      />
    );
  }

  // デスクトップ/タブレット: テーブル表示
  return (
    <ConstructionPhotoListTable
      albums={albums}
      sortField={sortField}
      sortOrder={sortOrder}
      onSort={onSort}
      onRowClick={onRowClick}
      onEditAlbum={onEditAlbum}
      onDeleteAlbum={onDeleteAlbum}
    />
  );
}
