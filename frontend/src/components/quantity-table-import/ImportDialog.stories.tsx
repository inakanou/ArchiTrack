import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { ImportDialog } from './ImportDialog';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

/**
 * ImportDialog コンポーネントのストーリー
 *
 * 数量表インポートダイアログ。ファイルアップロード（ドラッグ&ドロップ対応）、
 * 抽出結果プレビュー、フィールドマッピング調整、一括取り込みの機能を提供。
 */

const sampleGroups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'qt-1',
    name: '土工',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 5,
    items: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'group-2',
    quantityTableId: 'qt-1',
    name: '舗装工',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 2,
    itemCount: 3,
    items: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'group-3',
    quantityTableId: 'qt-1',
    name: null,
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 3,
    itemCount: 0,
    items: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const meta = {
  title: 'Components/QuantityTableImport/ImportDialog',
  component: ImportDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onImport: fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 1000))),
    groups: sampleGroups,
  },
} satisfies Meta<typeof ImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 初期状態（オープン）
 * ファイルアップロードエリアが表示されている状態
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 非表示状態
 * isOpen=falseで何も描画されない
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * グループなし
 * 取り込み先グループが存在しない場合
 */
export const NoGroups: Story = {
  args: {
    isOpen: true,
    groups: [],
  },
};
