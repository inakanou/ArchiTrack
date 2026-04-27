/**
 * @fileoverview OcrDataExtractorコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { OcrDataExtractor } from './OcrDataExtractor';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';

// Task 79.3 で OcrDataExtractor が useAuth() を直接購読するため、
// Storybook 環境向けに最小限の AuthContext 値を供給する。
const mockAuthContext = {
  sessionExpiredDuringOperation: false,
  sessionExpired: false,
} as unknown as AuthContextValue;

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
  decorators: [
    (Story) => (
      <AuthContext.Provider value={mockAuthContext}>
        <Story />
      </AuthContext.Provider>
    ),
  ],
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
