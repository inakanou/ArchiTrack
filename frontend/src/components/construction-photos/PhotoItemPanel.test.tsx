/**
 * @fileoverview 工事写真 写真項目パネルのテスト
 *
 * Task 6.3: 詳細画面：写真項目管理＋3系統アップロード
 *
 * PhotoItemPanel は site-survey の PhotoManagementPanel クローン。
 * コメント（500msデバウンス＋blur flush）、印刷対象チェック、並び替え（未保存）、
 * 手動保存ヘッダ、サムネ優先表示（thumbnailUrl）を検証する。
 *
 * Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 11.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PhotoItemPanel } from './PhotoItemPanel';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';

function makePhoto(overrides: Partial<ConstructionPhotoWithUrls> = {}): ConstructionPhotoWithUrls {
  return {
    id: 'photo-1',
    albumId: 'album-1',
    fileName: 'photo-1.jpg',
    fileSize: 1000,
    width: 800,
    height: 600,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: 'https://example.com/thumb-1.jpg',
    printImageUrl: 'https://example.com/print-1',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PhotoItemPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('サムネイル(thumbnailUrl)を優先表示する (R11.3)', () => {
    const photos = [makePhoto({ id: 'p1', thumbnailUrl: 'https://example.com/thumb.jpg' })];
    render(
      <PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} />
    );
    const img = screen.getByRole('img', { name: /photo-1\.jpg/ });
    expect(img).toHaveAttribute('src', 'https://example.com/thumb.jpg');
  });

  it('印刷対象チェックを切り替えると includeInReport の変更が通知される (R7.5)', () => {
    const onChange = vi.fn();
    render(
      <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />
    );
    const checkbox = screen.getByLabelText('印刷対象に含める');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith('p1', { includeInReport: true });
  });

  it('コメント入力後にフォーカスを外すと comment の変更が通知される (R7.1)', () => {
    const onChange = vi.fn();
    render(
      <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />
    );
    const textarea = screen.getByLabelText('コメント');
    fireEvent.change(textarea, { target: { value: '基礎配筋' } });
    fireEvent.blur(textarea);
    expect(onChange).toHaveBeenCalledWith('p1', { comment: '基礎配筋' });
  });

  it('コメントは500msデバウンスで通知される (R7.1)', () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(
        <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />
      );
      const textarea = screen.getByLabelText('コメント');
      fireEvent.change(textarea, { target: { value: 'あ' } });
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onChange).toHaveBeenCalledWith('p1', { comment: 'あ' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('「下へ移動」で正規化された新しい順序が通知される (R7.4)', () => {
    const onOrderChange = vi.fn();
    const photos = [
      makePhoto({ id: 'p1', displayOrder: 1 }),
      makePhoto({ id: 'p2', displayOrder: 2 }),
    ];
    render(
      <PhotoItemPanel
        photos={photos}
        onPhotoMetadataChange={vi.fn()}
        onOrderChange={onOrderChange}
      />
    );
    const moveDownButtons = screen.getAllByRole('button', { name: '下へ移動' });
    fireEvent.click(moveDownButtons[0]!);
    expect(onOrderChange).toHaveBeenCalledWith([
      { id: 'p2', order: 1 },
      { id: 'p1', order: 2 },
    ]);
  });

  it('保存ボタンは未保存(isDirty)時のみ有効で、クリックで onSave が呼ばれる (R7.6)', () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onSave={onSave}
        isDirty={false}
      />
    );
    const saveButton = screen.getByRole('button', { name: '保存' });
    expect(saveButton).toBeDisabled();

    rerender(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onSave={onSave}
        isDirty={true}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('保存済みの表示順序で写真項目を並べる (R7.8)', () => {
    const photos = [
      makePhoto({ id: 'p2', fileName: 'b.jpg', displayOrder: 2 }),
      makePhoto({ id: 'p1', fileName: 'a.jpg', displayOrder: 1 }),
    ];
    render(<PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} showOrderNumbers />);
    const items = screen.getAllByTestId('construction-photo-item');
    expect(items[0]).toHaveAttribute('data-photo-id', 'p1');
    expect(items[1]).toHaveAttribute('data-photo-id', 'p2');
  });

  it('看板が指定されている写真項目は識別可能に表示する (R9.6 プレースホルダ)', () => {
    const photos = [makePhoto({ id: 'p1', signboardId: 'sb-1' })];
    render(<PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} />);
    expect(screen.getByTestId('signboard-indicator')).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
