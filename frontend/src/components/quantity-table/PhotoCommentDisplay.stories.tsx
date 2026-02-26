import type { Meta, StoryObj } from '@storybook/react';
import PhotoCommentDisplay from './PhotoCommentDisplay';

/**
 * PhotoCommentDisplay コンポーネントのストーリー
 *
 * 数量グループに紐づけられた写真のコメントを表示する。
 * コメントが存在しない場合はコメント表示エリアを空白にする。
 */

const meta = {
  title: 'Components/QuantityTable/PhotoCommentDisplay',
  component: PhotoCommentDisplay,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    comment: null,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '200px', border: '1px solid #e5e7eb', padding: '8px' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhotoCommentDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト表示
 * コメントなし（null）
 */
export const Default: Story = {};

/**
 * コメントあり
 * 短いコメントテキスト
 */
export const WithComment: Story = {
  args: {
    comment: '外壁のひび割れを確認。補修が必要。',
  },
};

/**
 * 長文コメント
 * スクロールが発生する長いコメント
 */
export const LongComment: Story = {
  args: {
    comment:
      '外壁のひび割れを確認。補修が必要。\n幅0.3mm以上のクラックが3箇所確認された。\n特に南側2階部分のクラックは構造的な影響が懸念される。\n早急に専門家による調査を推奨する。\n補修方法についてはエポキシ樹脂注入工法を検討中。',
  },
};

/**
 * 空文字列
 * 空文字列の場合もコメントなしと同様に空白表示
 */
export const EmptyString: Story = {
  args: {
    comment: '',
  },
};

/**
 * 改行を含むコメント
 * pre-wrap による改行保持を確認
 */
export const MultilineComment: Story = {
  args: {
    comment: '1階: 良好\n2階: ひび割れあり\n3階: 未調査',
  },
};
