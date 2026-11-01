import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { PasswordChangeSection } from './PasswordChangeSection';

/**
 * PasswordChangeSection コンポーネントのストーリー
 *
 * プロフィール画面のパスワード変更の欄。現在のパスワード・新しいパスワード・確認の入力と、
 * 新しいパスワードの強度の表示、変更の確認のダイアログを持つ。
 * 変更の送信（API の呼び出し）は送信の操作の後にだけ起きるため、初期表示は API に依存しない。
 */
const meta = {
  title: 'Components/PasswordChangeSection',
  component: PasswordChangeSection,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onPasswordChanged: fn(),
  },
} satisfies Meta<typeof PasswordChangeSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 初期表示
 * 入力欄が空で、強度の表示が出ていない状態
 */
export const Default: Story = {};
