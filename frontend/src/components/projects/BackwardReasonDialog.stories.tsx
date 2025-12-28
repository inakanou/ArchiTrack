import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import BackwardReasonDialog from './BackwardReasonDialog';

/**
 * BackwardReasonDialog コンポーネントのストーリー
 *
 * ステータス差し戻し時に理由入力を求めるモーダルダイアログ。
 * FocusManagerを使用したフォーカストラップとアクセシビリティを実装。
 */
const meta = {
  title: 'Components/Projects/BackwardReasonDialog',
  component: BackwardReasonDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onConfirm: fn(),
    onCancel: fn(),
    fromStatus: 'SURVEYING',
    toStatus: 'PREPARING',
    isSubmitting: false,
  },
} satisfies Meta<typeof BackwardReasonDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * デフォルト状態（ダイアログ非表示）
 * ダイアログが閉じている状態
 */
export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

/**
 * ダイアログ表示状態
 * 差し戻し理由入力フォームを表示
 */
export const Open: Story = {
  args: {
    isOpen: true,
  },
};

/**
 * 調査中から準備中への差し戻し
 * 典型的な差し戻しパターン
 */
export const SurveyingToPreparing: Story = {
  args: {
    isOpen: true,
    fromStatus: 'SURVEYING',
    toStatus: 'PREPARING',
  },
};

/**
 * 見積中から調査中への差し戻し
 * 見積段階での差し戻しパターン
 */
export const EstimatingToSurveying: Story = {
  args: {
    isOpen: true,
    fromStatus: 'ESTIMATING',
    toStatus: 'SURVEYING',
  },
};

/**
 * 承認中から見積中への差し戻し
 * 承認段階での差し戻しパターン
 */
export const ApprovingToEstimating: Story = {
  args: {
    isOpen: true,
    fromStatus: 'APPROVING',
    toStatus: 'ESTIMATING',
  },
};

/**
 * 送信中状態
 * 差し戻し処理中でボタンが無効化された状態
 */
export const Submitting: Story = {
  args: {
    isOpen: true,
    isSubmitting: true,
  },
};
