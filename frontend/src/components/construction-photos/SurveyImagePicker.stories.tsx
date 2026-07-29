import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import SurveyImagePicker from './SurveyImagePicker';

/**
 * @fileoverview SurveyImagePicker コンポーネントのストーリー
 *
 * 現調写真選択モーダル。同一プロジェクトの現場調査に登録された写真を選択候補として
 * 提示し、選択した現調画像IDを onSelect で返す。モーダルを開くと現場調査一覧を
 * 読み込み、調査を選ぶと当該調査の画像一覧を表示する（外部リクエストはモック）。
 *
 * 開いた状態／閉じた状態／コピー処理中の分岐を提示する。
 */

const meta = {
  title: 'ConstructionPhotos/SurveyImagePicker',
  component: SurveyImagePicker,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    projectId: 'project-1',
    open: true,
    onClose: fn(),
    onSelect: fn(),
  },
} satisfies Meta<typeof SurveyImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態
 * モーダルを開いた状態。現場調査一覧の読み込みを開始する。
 */
export const Default: Story = {
  args: {
    open: true,
  },
};

/**
 * 閉じた状態
 * open=false のときは何も描画しない。
 */
export const Closed: Story = {
  args: {
    open: false,
  },
};

/**
 * コピー処理中状態
 * 親がコピー処理中フラグを立てている状態。追加ボタン・キャンセルボタンが無効化される。
 */
export const Submitting: Story = {
  args: {
    open: true,
    isSubmitting: true,
  },
};
