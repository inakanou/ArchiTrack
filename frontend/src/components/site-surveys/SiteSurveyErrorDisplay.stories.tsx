import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import SiteSurveyErrorDisplay from './SiteSurveyErrorDisplay';
import type { SiteSurveyErrorState } from '../../hooks/useSiteSurveyError';

/**
 * SiteSurveyErrorDisplay コンポーネントのストーリー
 *
 * 現場調査機能で発生するエラーの表示コンポーネント。
 * エラータイプに応じて適切なアイコン、色、メッセージを表示。
 */

/**
 * バリデーションエラーの例
 */
const validationError: SiteSurveyErrorState = {
  type: 'validation',
  message: '入力内容に誤りがあります',
  statusCode: 400,
  canRetry: false,
  shouldRedirect: false,
  fieldErrors: {
    name: '調査名は必須です',
    surveyDate: '調査日は過去の日付である必要があります',
  },
};

/**
 * ネットワークエラーの例
 */
const networkError: SiteSurveyErrorState = {
  type: 'network',
  message: 'ネットワーク接続に問題が発生しました。接続を確認してください。',
  statusCode: 0,
  canRetry: true,
  shouldRedirect: false,
};

/**
 * サーバーエラーの例
 */
const serverError: SiteSurveyErrorState = {
  type: 'server',
  message: 'サーバーでエラーが発生しました。しばらくしてから再度お試しください。',
  statusCode: 500,
  canRetry: true,
  shouldRedirect: false,
};

/**
 * セッション期限切れエラーの例
 */
const sessionError: SiteSurveyErrorState = {
  type: 'session',
  message: 'セッションが期限切れです。再度ログインしてください。',
  statusCode: 401,
  canRetry: false,
  shouldRedirect: true,
};

/**
 * 競合エラーの例
 */
const conflictError: SiteSurveyErrorState = {
  type: 'conflict',
  message: '他のユーザーによって更新されました。最新のデータを取得してください。',
  statusCode: 409,
  canRetry: true,
  shouldRedirect: false,
};

/**
 * 権限エラーの例
 */
const forbiddenError: SiteSurveyErrorState = {
  type: 'forbidden',
  message: 'この操作を行う権限がありません。',
  statusCode: 403,
  canRetry: false,
  shouldRedirect: false,
};

/**
 * 未対応ファイル形式エラーの例
 */
const unsupportedFileError: SiteSurveyErrorState = {
  type: 'unsupportedFileType',
  message: '対応していないファイル形式です。JPEG、PNG形式の画像をアップロードしてください。',
  statusCode: 400,
  canRetry: false,
  shouldRedirect: false,
};

const meta = {
  title: 'SiteSurveys/SiteSurveyErrorDisplay',
  component: SiteSurveyErrorDisplay,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ padding: '40px', minHeight: '200px' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onRetry: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof SiteSurveyErrorDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * エラーなし
 * errorがnullの場合は何も表示されない
 */
export const NoError: Story = {
  args: {
    error: null,
  },
};

/**
 * バリデーションエラー
 * フィールドエラーのリストを表示
 */
export const ValidationError: Story = {
  args: {
    error: validationError,
  },
};

/**
 * ネットワークエラー
 * 再試行ボタンを表示
 */
export const NetworkError: Story = {
  args: {
    error: networkError,
  },
};

/**
 * サーバーエラー
 * 再試行ボタンを表示
 */
export const ServerError: Story = {
  args: {
    error: serverError,
  },
};

/**
 * セッション期限切れ
 * ログインページへのリダイレクトボタンを表示
 */
export const SessionExpired: Story = {
  args: {
    error: sessionError,
  },
};

/**
 * 競合エラー
 * データ競合時のエラー表示
 */
export const ConflictError: Story = {
  args: {
    error: conflictError,
  },
};

/**
 * 権限エラー
 * アクセス権限がない場合
 */
export const ForbiddenError: Story = {
  args: {
    error: forbiddenError,
  },
};

/**
 * ファイル形式エラー
 * サポートされていないファイル形式
 */
export const UnsupportedFileTypeError: Story = {
  args: {
    error: unsupportedFileError,
  },
};

/**
 * 再試行中
 * 再試行ボタンがローディング状態
 */
export const Retrying: Story = {
  args: {
    error: networkError,
    isRetrying: true,
  },
};

/**
 * インラインモード
 * 固定位置ではなくフロー内に表示
 */
export const InlineMode: Story = {
  args: {
    error: validationError,
    inline: true,
  },
};

/**
 * インラインモード - ネットワークエラー
 * インラインでネットワークエラーを表示
 */
export const InlineNetworkError: Story = {
  args: {
    error: networkError,
    inline: true,
  },
};

/**
 * インラインモード - 再試行中
 * インラインで再試行中の状態
 */
export const InlineRetrying: Story = {
  args: {
    error: networkError,
    inline: true,
    isRetrying: true,
  },
};
