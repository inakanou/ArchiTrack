/**
 * @fileoverview FileInlinePreviewコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { FileInlinePreview } from './FileInlinePreview';

const meta = {
  title: 'EstimateRequests/FileInlinePreview',
  component: FileInlinePreview,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'ファイルのインラインプレビューコンポーネント（PDF/画像/Excel対応）',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FileInlinePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ファイル未選択
 */
export const NoFile: Story = {
  args: {
    file: null,
    existingPreviewUrl: undefined,
    fileMimeType: undefined,
  },
};

/**
 * 既存ファイルURL（PDF）
 */
export const ExistingPdfUrl: Story = {
  args: {
    file: null,
    existingPreviewUrl: 'https://example.com/sample.pdf',
    fileMimeType: 'application/pdf',
  },
};

/**
 * 既存ファイルURL（画像）
 */
export const ExistingImageUrl: Story = {
  args: {
    file: null,
    existingPreviewUrl: 'https://via.placeholder.com/400x300',
    fileMimeType: 'image/png',
  },
};

/**
 * 対応外のファイル形式
 */
export const UnsupportedType: Story = {
  args: {
    file: null,
    existingPreviewUrl: 'https://example.com/sample.txt',
    fileMimeType: 'text/plain',
  },
};
