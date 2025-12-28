import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import StatusTransitionUI from './StatusTransitionUI';
import type { AllowedTransition, StatusHistoryResponse } from '../../types/project.types';

/**
 * StatusTransitionUI コンポーネントのストーリー
 *
 * ステータス遷移UI。現在のステータス表示、遷移可能なステータス一覧、
 * ステータス変更履歴を表示。遷移種別（順方向、差し戻し、終端）を視覚的に区別。
 */

// 遷移可能なステータスのサンプル
const forwardTransitions: AllowedTransition[] = [
  { status: 'SURVEYING', type: 'forward', requiresReason: false },
];

const multipleTransitions: AllowedTransition[] = [
  { status: 'ESTIMATING', type: 'forward', requiresReason: false },
  { status: 'PREPARING', type: 'backward', requiresReason: true },
];

const terminateTransitions: AllowedTransition[] = [
  { status: 'SURVEYING', type: 'forward', requiresReason: false },
  { status: 'CANCELLED', type: 'terminate', requiresReason: true },
  { status: 'LOST', type: 'terminate', requiresReason: true },
];

// ステータス履歴のサンプル
const sampleHistory: StatusHistoryResponse[] = [
  {
    id: 'history-3',
    fromStatus: 'PREPARING',
    toStatus: 'SURVEYING',
    fromStatusLabel: '準備中',
    toStatusLabel: '調査中',
    transitionType: 'forward',
    transitionTypeLabel: '順方向遷移',
    reason: null,
    changedBy: { id: 'user-1', displayName: '山田 太郎' },
    changedAt: '2024-01-20T14:30:00Z',
  },
  {
    id: 'history-2',
    fromStatus: null,
    toStatus: 'PREPARING',
    fromStatusLabel: null,
    toStatusLabel: '準備中',
    transitionType: 'initial',
    transitionTypeLabel: '初期設定',
    reason: null,
    changedBy: { id: 'user-1', displayName: '山田 太郎' },
    changedAt: '2024-01-15T10:00:00Z',
  },
];

const historyWithBackward: StatusHistoryResponse[] = [
  {
    id: 'history-4',
    fromStatus: 'ESTIMATING',
    toStatus: 'SURVEYING',
    fromStatusLabel: '見積中',
    toStatusLabel: '調査中',
    transitionType: 'backward',
    transitionTypeLabel: '差し戻し',
    reason: '見積内容に誤りがあったため、再調査が必要です。',
    changedBy: { id: 'user-2', displayName: '鈴木 一郎' },
    changedAt: '2024-01-22T16:45:00Z',
  },
  ...sampleHistory,
];

const meta = {
  title: 'Components/Projects/StatusTransitionUI',
  component: StatusTransitionUI,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    projectId: 'project-1',
    onTransition: fn(),
    isLoading: false,
  },
} satisfies Meta<typeof StatusTransitionUI>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 準備中ステータス
 * 初期ステータスからの遷移可能状態
 */
export const PreparingStatus: Story = {
  args: {
    currentStatus: 'PREPARING',
    allowedTransitions: forwardTransitions,
    statusHistory: [],
  },
};

/**
 * 調査中ステータス
 * 順方向と差し戻しの両方が可能
 */
export const SurveyingStatus: Story = {
  args: {
    currentStatus: 'SURVEYING',
    allowedTransitions: multipleTransitions,
    statusHistory: sampleHistory,
  },
};

/**
 * 終端遷移オプション付き
 * キャンセル・失注への遷移が可能
 */
export const WithTerminateOptions: Story = {
  args: {
    currentStatus: 'PREPARING',
    allowedTransitions: terminateTransitions,
    statusHistory: [],
  },
};

/**
 * 差し戻し履歴あり
 * 差し戻し理由が表示された履歴
 */
export const WithBackwardHistory: Story = {
  args: {
    currentStatus: 'SURVEYING',
    allowedTransitions: multipleTransitions,
    statusHistory: historyWithBackward,
  },
};

/**
 * ローディング中
 * ステータス更新処理中
 */
export const Loading: Story = {
  args: {
    currentStatus: 'SURVEYING',
    allowedTransitions: multipleTransitions,
    statusHistory: sampleHistory,
    isLoading: true,
  },
};

/**
 * 遷移不可
 * 遷移可能なステータスがない状態
 */
export const NoTransitionsAllowed: Story = {
  args: {
    currentStatus: 'COMPLETED',
    allowedTransitions: [],
    statusHistory: [
      {
        id: 'history-final',
        fromStatus: 'AWAITING',
        toStatus: 'COMPLETED',
        fromStatusLabel: '入金待ち',
        toStatusLabel: '完了',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '山田 太郎' },
        changedAt: '2024-02-01T12:00:00Z',
      },
    ],
  },
};

/**
 * 履歴なし
 * 新規プロジェクトで履歴がない状態
 */
export const NoHistory: Story = {
  args: {
    currentStatus: 'PREPARING',
    allowedTransitions: forwardTransitions,
    statusHistory: [],
  },
};

/**
 * キャンセル済み
 * キャンセルされたプロジェクト
 */
export const CancelledStatus: Story = {
  args: {
    currentStatus: 'CANCELLED',
    allowedTransitions: [],
    statusHistory: [
      {
        id: 'history-cancel',
        fromStatus: 'SURVEYING',
        toStatus: 'CANCELLED',
        fromStatusLabel: '調査中',
        toStatusLabel: 'キャンセル',
        transitionType: 'terminate',
        transitionTypeLabel: '終端遷移',
        reason: '顧客都合によりプロジェクトを中止します。',
        changedBy: { id: 'user-3', displayName: '佐藤 花子' },
        changedAt: '2024-01-25T09:30:00Z',
      },
    ],
  },
};

/**
 * 多数の履歴
 * 長いステータス変更履歴
 */
export const ManyHistoryItems: Story = {
  args: {
    currentStatus: 'CONSTRUCTING',
    allowedTransitions: [
      { status: 'DELIVERING', type: 'forward', requiresReason: false },
      { status: 'CONTRACTING', type: 'backward', requiresReason: true },
    ],
    statusHistory: [
      {
        id: 'h-6',
        fromStatus: 'CONTRACTING',
        toStatus: 'CONSTRUCTING',
        fromStatusLabel: '契約中',
        toStatusLabel: '施工中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '山田 太郎' },
        changedAt: '2024-01-30T10:00:00Z',
      },
      {
        id: 'h-5',
        fromStatus: 'APPROVING',
        toStatus: 'CONTRACTING',
        fromStatusLabel: '承認中',
        toStatusLabel: '契約中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-2', displayName: '鈴木 一郎' },
        changedAt: '2024-01-28T15:30:00Z',
      },
      {
        id: 'h-4',
        fromStatus: 'ESTIMATING',
        toStatus: 'APPROVING',
        fromStatusLabel: '見積中',
        toStatusLabel: '承認中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '山田 太郎' },
        changedAt: '2024-01-25T11:00:00Z',
      },
      {
        id: 'h-3',
        fromStatus: 'SURVEYING',
        toStatus: 'ESTIMATING',
        fromStatusLabel: '調査中',
        toStatusLabel: '見積中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-1', displayName: '山田 太郎' },
        changedAt: '2024-01-22T09:00:00Z',
      },
      {
        id: 'h-2',
        fromStatus: 'PREPARING',
        toStatus: 'SURVEYING',
        fromStatusLabel: '準備中',
        toStatusLabel: '調査中',
        transitionType: 'forward',
        transitionTypeLabel: '順方向遷移',
        reason: null,
        changedBy: { id: 'user-3', displayName: '佐藤 花子' },
        changedAt: '2024-01-18T14:00:00Z',
      },
      {
        id: 'h-1',
        fromStatus: null,
        toStatus: 'PREPARING',
        fromStatusLabel: null,
        toStatusLabel: '準備中',
        transitionType: 'initial',
        transitionTypeLabel: '初期設定',
        reason: null,
        changedBy: { id: 'user-1', displayName: '山田 太郎' },
        changedAt: '2024-01-15T10:00:00Z',
      },
    ],
  },
};
