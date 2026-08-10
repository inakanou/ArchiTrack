import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import PendingUploadPanel from './PendingUploadPanel';
import type { PendingUpload, UploadFailureKind } from '../../types/upload.types';

/**
 * PendingUploadPanel コンポーネントのストーリー
 *
 * アップロードに失敗して画面に保持されている未送信画像を提示し、
 * 再送と破棄の操作手段を提供する純表示コンポーネント。
 *
 * Requirements:
 * - 37.2: 未送信画像の件数と、各画像のサムネイル・ファイル名・失敗理由を表示する
 * - 37.3: 再送可能な画像をまとめて再送する操作手段を提供する
 * - 37.7: 保持中の画像を破棄する操作手段を提供する
 * - 37.10: 処理中は追加の再送操作を受け付けない
 * - 37.16: 再送不可の画像に再送しても解消しない旨とその理由を提示する
 * - 37.18: 保持中の画像が全て再送不可なら再送手段を実行不可の状態で提示する
 */

/**
 * サムネイル用のプレビュー画像
 *
 * 実行環境では `URL.createObjectURL` の ObjectURL が渡るが、ストーリーでは
 * 外部リクエストを起こさない data URI を用いて描画結果を決定的にする。
 */
const previewUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">' +
      '<rect width="48" height="48" fill="#9ca3af"/>' +
      '<rect x="8" y="28" width="32" height="12" fill="#6b7280"/>' +
      '<circle cx="34" cy="14" r="6" fill="#f3f4f6"/>' +
      '</svg>'
  );

/** 未送信画像を1件組み立てる */
const buildPending = (
  id: string,
  fileName: string,
  error: string,
  kind: UploadFailureKind
): PendingUpload => ({
  id,
  file: new File(['dummy-image-content'], fileName, { type: 'image/jpeg' }),
  error,
  kind,
  previewUrl,
});

/** 再送で解消しうる失敗（通信障害） */
const networkFailure: PendingUpload = buildPending(
  'pending-1',
  '現場全景.jpg',
  'ネットワークに接続できませんでした',
  'retriable'
);

/** 再送で解消しうる失敗（通信障害・サーバーエラー） */
const retriableItems: readonly PendingUpload[] = [
  networkFailure,
  buildPending('pending-2', '基礎配筋.jpg', 'サーバーエラーが発生しました', 'retriable'),
];

/** 再送しても解消しない失敗（受入条件違反） */
const permanentItems: readonly PendingUpload[] = [
  buildPending('pending-3', '図面スキャン.heic', '対応していない画像形式です', 'permanent'),
  buildPending('pending-4', '高解像度写真.jpg', 'ファイルサイズが上限を超えています', 'permanent'),
];

const meta = {
  title: 'SiteSurveys/PendingUploadPanel',
  component: PendingUploadPanel,
  decorators: [
    (Story) => (
      <div style={{ padding: '24px', maxWidth: '480px' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    onRetry: fn(),
    onDiscardAll: fn(),
  },
} satisfies Meta<typeof PendingUploadPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 再送可能な未送信画像
 *
 * 再送・破棄のいずれも実行できる既定の状態（37.2, 37.3, 37.7）
 */
export const Retriable: Story = {
  args: {
    pending: retriableItems,
    canRetry: true,
    isBusy: false,
  },
};

/**
 * 未送信画像が1件だけ
 *
 * 件数表示が単数でも同じ体裁で読めることを示す（37.2）
 */
export const SingleItem: Story = {
  args: {
    pending: [networkFailure],
    canRetry: true,
    isBusy: false,
  },
};

/**
 * 再送可能と再送不可の混在
 *
 * 再送不可の画像には理由と再送対象外である旨を併記する（37.16, 37.17）
 */
export const MixedRetriableAndPermanent: Story = {
  args: {
    pending: [...retriableItems, ...permanentItems],
    canRetry: true,
    isBusy: false,
  },
};

/**
 * 全件が再送不可
 *
 * 再送手段を実行不可の状態で提示し、その理由を説明する（37.18）
 */
export const AllPermanent: Story = {
  args: {
    pending: permanentItems,
    canRetry: false,
    isBusy: false,
  },
};

/**
 * 処理中
 *
 * 再送中・アップロード中は再送と破棄のいずれも受け付けない（37.10）
 */
export const Busy: Story = {
  args: {
    pending: retriableItems,
    canRetry: true,
    isBusy: true,
  },
};

/**
 * 長いファイル名
 *
 * 狭い幅でもファイル名と失敗理由が折り返して収まることを示す
 */
export const LongFileName: Story = {
  args: {
    pending: [
      buildPending(
        'pending-long',
        '2026年08月10日_現場調査_南側外壁_タイル剥離状況_詳細撮影_連番0001.jpg',
        'アップロードがタイムアウトしました。電波状況の良い場所で再送してください',
        'retriable'
      ),
    ],
    canRetry: true,
    isBusy: false,
  },
};

/**
 * 未送信画像なし
 *
 * 保持中の画像が無ければ何も描画しない（37.6）
 */
export const Empty: Story = {
  args: {
    pending: [],
    canRetry: false,
    isBusy: false,
  },
};
