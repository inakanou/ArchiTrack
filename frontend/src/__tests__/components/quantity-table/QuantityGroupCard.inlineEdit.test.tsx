/**
 * @fileoverview 数量グループ名前インライン編集のテスト
 *
 * Task 35.2: 数量グループ名前変更の単体テストを実装する
 *
 * Requirements:
 * - 22.1: グループ名クリック時に編集モードに遷移
 * - 22.2: 編集確定時にAPIが正しい引数で呼ばれる
 * - 22.3: 空白名前でのエラーメッセージ表示
 * - 22.4: 文字数制限バリデーション（全角25/半角50）
 * - 22.5: 最大文字数超過入力防止
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityGroupCard from '../../../components/quantity-table/QuantityGroupCard';
import type { QuantityGroupDetail } from '../../../types/quantity-table.types';

// AnnotatedImageThumbnailをモックして、Fabric.jsの依存関係を回避する
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
  default: ({
    image,
    alt,
    style,
  }: {
    image: { id: string; originalUrl?: string | null };
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <img
      src={image.originalUrl || ''}
      alt={alt}
      style={style}
      data-testid="annotated-image-thumbnail"
    />
  ),
}));

const createMockGroup = (overrides?: Partial<QuantityGroupDetail>): QuantityGroupDetail => ({
  id: 'group-1',
  quantityTableId: 'qt-123',
  name: 'テストグループ',
  surveyImageId: null,
  surveyImage: null,
  displayOrder: 0,
  itemCount: 0,
  items: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('QuantityGroupCard インライン編集', () => {
  let mockOnRenameGroup: (groupId: string, newName: string) => void;

  beforeEach(() => {
    mockOnRenameGroup = vi.fn();
  });

  it('グループ名クリック時に編集モードに遷移する（REQ-22.1）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    // グループ名テキストをクリック
    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // input要素が表示される
    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('テストグループ');
  });

  it('編集確定時にonRenameGroupが正しい引数で呼ばれる（REQ-22.2）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    // グループ名クリック -> 編集モード
    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // 入力値を変更
    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '変更後のグループ名');

    // Enter押下で確定
    await user.keyboard('{Enter}');

    expect(mockOnRenameGroup).toHaveBeenCalledWith('group-1', '変更後のグループ名');
  });

  it('blurイベントで編集が確定される（REQ-22.2）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '新しい名前');

    // blurで確定
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockOnRenameGroup).toHaveBeenCalledWith('group-1', '新しい名前');
    });
  });

  it('空白名前でエラーメッセージが表示される（REQ-22.3）', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);

    // Enter押下で確定を試行
    await user.keyboard('{Enter}');

    // エラーメッセージが表示される
    await waitFor(() => {
      expect(screen.getByText('グループ名を入力してください')).toBeInTheDocument();
    });

    // APIは呼ばれない
    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('Escapeキーで編集がキャンセルされる', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    const input = screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.clear(input);
    await user.type(input, '変更中の値');

    // Escで元に戻す
    await user.keyboard('{Escape}');

    // 元の名前が表示される
    expect(screen.getByText('テストグループ')).toBeInTheDocument();

    // APIは呼ばれない
    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('名前が変更されていない場合はAPIを呼ばない', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={true}
        onRenameGroup={mockOnRenameGroup}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // 変更なしでEnter
    screen.getByRole('textbox', { name: /グループ名を編集/i });
    await user.keyboard('{Enter}');

    expect(mockOnRenameGroup).not.toHaveBeenCalled();
  });

  it('isEditable=falseの場合はクリックしても編集モードにならない', async () => {
    const user = userEvent.setup();
    render(
      <QuantityGroupCard
        group={createMockGroup()}
        groupDisplayName="テストグループ"
        isEditable={false}
      />
    );

    const groupName = screen.getByText('テストグループ');
    await user.click(groupName);

    // input要素が表示されない
    expect(screen.queryByRole('textbox', { name: /グループ名を編集/i })).not.toBeInTheDocument();
  });
});
