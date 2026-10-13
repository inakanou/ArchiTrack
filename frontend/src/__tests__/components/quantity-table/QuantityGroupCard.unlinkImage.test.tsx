/**
 * @fileoverview 数量グループカードの写真の紐付け解除ボタン
 *
 * Task 90.2: 論理削除された現調画像の紐付けを画面から解除できるようにする
 *
 * 改める前の画面には紐付けを解除する操作が無く、写真は「変更」と「選択」しかできなかった。
 * 親の現場調査が論理削除された写真は選択候補にも現れないため、410 で保存が止まる数量表は
 * 画面からは復旧できなかった（tasks.md の Task 90 の経緯）。
 *
 * Requirements:
 * @requirement quantity-table-generation/REQ-42.3 数量グループへの写真の紐づけまたは写真の変更を行う場合、紐づけ変更をクライアントサイドの編集状態にのみ反映し、永続化を目的とするサーバーAPIリクエストを発行しない
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

// AnnotatedImageThumbnail をモックして Fabric.js の依存を回避する（同ディレクトリの既存作法）
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({ alt }: { alt: string }) => (
    <img alt={alt} data-testid="annotated-image-thumbnail" />
  ),
  default: ({ alt }: { alt: string }) => <img alt={alt} data-testid="annotated-image-thumbnail" />,
}));

const linkedGroup = (overrides?: Partial<QuantityGroupDetail>): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: 'image-1',
  surveyImage: {
    id: 'image-1',
    thumbnailUrl: '/thumb/image-1.jpg',
    originalUrl: '/orig/image-1.jpg',
    fileName: 'image-1.jpg',
    hasAnnotations: false,
    hasDrawnAnnotations: false,
    annotatedThumbnailUrl: null,
    comment: null,
    width: 800,
    height: 600,
  },
  displayOrder: 0,
  itemCount: 0,
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('QuantityGroupCard 写真の紐付け解除（Task 90.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('写真が紐付いているとき、解除ボタンを表示しグループIDを添えて呼び出す', async () => {
    const user = userEvent.setup();
    const onUnlinkImage = vi.fn();
    render(
      <QuantityGroupCard
        group={linkedGroup()}
        groupDisplayName="テストグループ"
        onUnlinkImage={onUnlinkImage}
      />
    );

    const button = screen.getByRole('button', { name: '写真の紐付けを解除' });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(onUnlinkImage).toHaveBeenCalledTimes(1);
    expect(onUnlinkImage).toHaveBeenCalledWith('group-1');
  });

  it('写真が紐付いていないグループには解除ボタンを出さない（解除する対象が無い）', () => {
    render(
      <QuantityGroupCard
        group={linkedGroup({ surveyImageId: null, surveyImage: null })}
        groupDisplayName="テストグループ"
        onUnlinkImage={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '写真の紐付けを解除' })).not.toBeInTheDocument();
    // 観測器が働いていることの非空証明（紐付けが無いときの操作は現れている）
    expect(screen.getByRole('button', { name: '写真を選択' })).toBeInTheDocument();
  });

  it('解除のコールバックを渡さない利用者（閲覧のみ）には解除ボタンを出さない', () => {
    render(<QuantityGroupCard group={linkedGroup()} groupDisplayName="テストグループ" />);

    expect(screen.queryByRole('button', { name: '写真の紐付けを解除' })).not.toBeInTheDocument();
    // 非空証明: 同じ描画で写真の変更ボタンは在る
    expect(screen.getByRole('button', { name: '写真を変更' })).toBeInTheDocument();
  });
});
