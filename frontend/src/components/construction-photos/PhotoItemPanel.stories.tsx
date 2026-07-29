import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import PhotoItemPanel from './PhotoItemPanel';

/**
 * @fileoverview PhotoItemPanel コンポーネントのストーリー
 *
 * 工事写真の写真項目管理パネル。写真ごとのサムネイル表示、コメント編集、
 * 印刷対象フラグ、並び替え（ドラッグ／上下移動）、看板配置導線、削除、
 * エクスポート対象の選択チェックを扱う。変更はローカル未保存状態として
 * 親へ通知され、確定は呼び出し元が担う。
 *
 * データあり／空状態／読み取り専用／ローディングの主要分岐を提示する。
 */

const samplePhotos: ConstructionPhotoWithUrls[] = [
  {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: '基礎配筋_全景.jpg',
    fileSize: 2_048_000,
    width: 1920,
    height: 1080,
    displayOrder: 1,
    comment: '配筋状況を撮影しました。',
    includeInReport: true,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/photo1.jpg',
    printImageUrl: 'https://example.com/photo1-print.jpg',
    createdAt: '2026-07-01T09:00:00.000Z',
  },
  {
    id: 'photo-2',
    albumId: 'album-1',
    fileName: '型枠検査.jpg',
    fileSize: 1_536_000,
    width: 1600,
    height: 1200,
    displayOrder: 2,
    comment: null,
    includeInReport: false,
    signboardId: 'signboard-1',
    signboardPlacement: { left: 40, top: 40, width: 320, height: 180 },
    thumbnailUrl: 'https://example.com/photo2.jpg',
    printImageUrl: 'https://example.com/photo2-print.jpg',
    createdAt: '2026-07-01T09:05:00.000Z',
  },
  {
    id: 'photo-3',
    albumId: 'album-1',
    fileName: 'コンクリート打設.jpg',
    fileSize: 3_072_000,
    width: 2048,
    height: 1536,
    displayOrder: 3,
    comment: '打設完了後の状況。',
    includeInReport: true,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: null,
    printImageUrl: 'https://example.com/photo3-print.jpg',
    createdAt: '2026-07-01T09:10:00.000Z',
  },
];

const meta = {
  title: 'ConstructionPhotos/PhotoItemPanel',
  component: PhotoItemPanel,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    photos: samplePhotos,
    onPhotoMetadataChange: fn(),
    onPhotoClick: fn(),
    onOrderChange: fn(),
    onSave: fn(),
    onDelete: fn(async () => {}),
    onAssignSignboard: fn(),
    onToggleSelect: fn(),
  },
} satisfies Meta<typeof PhotoItemPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * 写真項目が複数あり、並び替え・削除・看板配置・保存が有効な編集可能状態。
 */
export const Default: Story = {
  args: {
    showOrderNumbers: true,
    isDirty: true,
    selectedPhotoIds: new Set(['photo-1']),
  },
};

/**
 * 空状態
 * 写真項目が1件もない場合の表示。
 */
export const Empty: Story = {
  args: {
    photos: [],
  },
};

/**
 * 読み取り専用状態
 * 編集系コントロール（コメント編集・並び替え・削除・保存）を無効化した閲覧モード。
 * エクスポート対象の選択チェックは閲覧操作のため引き続き操作可能。
 */
export const ReadOnly: Story = {
  args: {
    readOnly: true,
    showOrderNumbers: true,
    selectedPhotoIds: new Set(['photo-2']),
  },
};

/**
 * ローディング状態
 * 写真項目未取得時のスケルトン表示。
 */
export const Loading: Story = {
  args: {
    photos: [],
    isLoading: true,
  },
};
