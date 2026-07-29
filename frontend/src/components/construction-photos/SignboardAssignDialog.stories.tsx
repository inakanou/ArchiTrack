/**
 * @fileoverview SignboardAssignDialog（看板配置ダイアログ）のStorybook
 *
 * 写真項目に対して工事看板を選択し、写真上に配置するモーダルダイアログの状態を提示する。
 * 看板選択肢あり（Default）／看板未登録（NoSignboards）／既存配置あり（WithExistingPlacement）を用意する。
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { SignboardAssignDialog } from './SignboardAssignDialog';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
} from '../../types/construction-photo.types';

// ============================================================================
// モックデータ
// ============================================================================

/** 配置対象の写真項目（看板・配置ともに未設定の基本形） */
const basePhoto: ConstructionPhotoWithUrls = {
  id: 'photo-1',
  albumId: 'album-1',
  fileName: 'exterior-wall-001.jpg',
  fileSize: 1024 * 1024,
  width: 1600,
  height: 1200,
  displayOrder: 1,
  comment: null,
  includeInReport: true,
  signboardId: null,
  signboardPlacement: null,
  thumbnailUrl: 'https://example.com/photo.jpg',
  printImageUrl: 'https://example.com/photo.jpg',
  createdAt: '2026-07-01T00:00:00.000Z',
};

/** プロジェクトの工事看板一覧（選択肢） */
const signboards: ConstructionSignboard[] = [
  {
    id: 'signboard-1',
    projectId: 'project-1',
    workName: '外壁改修工事',
    workLocation: '東京都千代田区1-1-1',
    freeItems: [{ label: '施工者', value: '株式会社アーキテック' }],
    footerText: '安全第一',
    inUseCount: 3,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  },
  {
    id: 'signboard-2',
    projectId: 'project-1',
    workName: '屋上防水工事',
    workLocation: '東京都千代田区1-1-1 屋上',
    freeItems: [],
    footerText: null,
    inUseCount: 0,
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

const meta = {
  title: 'ConstructionPhotos/SignboardAssignDialog',
  component: SignboardAssignDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    photo: basePhoto,
    signboards,
    onSave: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof SignboardAssignDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 看板選択肢あり（未指定を初期選択）
 */
export const Default: Story = {};

/**
 * 看板未登録（選択肢は「未指定」のみ）
 */
export const NoSignboards: Story = {
  args: {
    signboards: [],
  },
};

/**
 * 既存の看板配置あり（当該看板を初期選択・配置を復元）
 */
export const WithExistingPlacement: Story = {
  args: {
    photo: {
      ...basePhoto,
      signboardId: 'signboard-1',
      signboardPlacement: { left: 100, top: 80, width: 400, height: 300 },
    },
  },
};
