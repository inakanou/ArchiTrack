/**
 * @fileoverview EstimateEditPresenceNoticeコンポーネントのStorybook
 */

import type { Meta, StoryObj } from '@storybook/react';
import { EstimateEditPresenceNotice } from './EstimateEditPresenceNotice';

const LAST_SEEN_AT = '2026-10-10T03:00:00.000Z';

const meta = {
  title: 'Estimate/EstimateEditPresenceNotice',
  component: EstimateEditPresenceNotice,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '見積書を他の利用者も開いている間、その表示名を挙げて編集中であることを警告する（REQ-11.7）。編集中の他の利用者がいなければ何も描画しない。',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EstimateEditPresenceNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 他の利用者が1名編集中
 */
export const SingleEditor: Story = {
  args: {
    otherEditors: [{ userId: 'user-b', displayName: '山田 太郎', lastSeenAt: LAST_SEEN_AT }],
  },
};

/**
 * 他の利用者が複数名編集中
 * 表示名を読点で区切って列挙する
 */
export const MultipleEditors: Story = {
  args: {
    otherEditors: [
      { userId: 'user-b', displayName: '山田 太郎', lastSeenAt: LAST_SEEN_AT },
      { userId: 'user-c', displayName: '佐藤 花子', lastSeenAt: LAST_SEEN_AT },
    ],
  },
};

/**
 * 375px 幅での長い一語の表示名
 * 任意の位置で折り返し、横にはみ出さない
 */
export const LongDisplayNameOnMobile: Story = {
  args: {
    otherEditors: [
      {
        userId: 'user-d',
        displayName: 'ExtremelyLongDisplayNameWithoutAnyBreakOpportunity',
        lastSeenAt: LAST_SEEN_AT,
      },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: '375px', maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

/**
 * 編集中の他の利用者がいない
 * 何も描画しない
 */
export const NoOtherEditors: Story = {
  args: {
    otherEditors: [],
  },
};
