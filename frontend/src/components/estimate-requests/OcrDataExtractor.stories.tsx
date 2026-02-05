/**
 * @fileoverview OcrDataExtractorコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { OcrDataExtractor } from './OcrDataExtractor';

const meta = {
  title: 'EstimateRequests/OcrDataExtractor',
  component: OcrDataExtractor,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'OCR/データパース処理と結果表示コンポーネント',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onImportLineItems: fn(),
  },
} satisfies Meta<typeof OcrDataExtractor>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * ファイル未選択（非表示）
 */
export const NoFile: Story = {
  args: {
    file: null,
  },
};

// Note: 実際のファイル処理を伴うStoriesは、
// 実際のFileオブジェクトが必要なため、
// インタラクティブなテスト環境で確認することを推奨します。
