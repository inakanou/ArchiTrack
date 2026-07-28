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
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { PhotoItemPanel } from './PhotoItemPanel';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';

// useMediaQuery をモック化（isMobile 判定をテストから制御, Task 12.6, Requirement 19）
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../hooks/useMediaQuery';

/** インラインスタイルの寸法値（px）を数値化する */
const pxValue = (raw: string): number => {
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** 要素の有効な最小タップ領域（min-width/width, min-height/height の大きい方）を返す */
const tapWidth = (el: HTMLElement): number =>
  Math.max(pxValue(el.style.minWidth), pxValue(el.style.width));
const tapHeight = (el: HTMLElement): number =>
  Math.max(pxValue(el.style.minHeight), pxValue(el.style.height));

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
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it('サムネイル(thumbnailUrl)を優先表示する (R11.3)', () => {
    const photos = [makePhoto({ id: 'p1', thumbnailUrl: 'https://example.com/thumb.jpg' })];
    render(<PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} />);
    const img = screen.getByRole('img', { name: /photo-1\.jpg/ });
    expect(img).toHaveAttribute('src', 'https://example.com/thumb.jpg');
  });

  it('印刷対象チェックを切り替えると includeInReport の変更が通知される (R7.5)', () => {
    const onChange = vi.fn();
    render(<PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />);
    const checkbox = screen.getByLabelText('印刷対象に含める');
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith('p1', { includeInReport: true });
  });

  it('コメント入力後にフォーカスを外すと comment の変更が通知される (R7.1)', () => {
    const onChange = vi.fn();
    render(<PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />);
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

  it('看板が指定されている写真項目は識別可能に表示する (R9.6)', () => {
    const photos = [makePhoto({ id: 'p1', signboardId: 'sb-1' })];
    render(<PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} />);
    expect(screen.getByTestId('signboard-indicator')).toBeInTheDocument();
  });

  it('「看板を配置」ボタンで onAssignSignboard が対象写真とともに呼ばれる (R9.1)', () => {
    const onAssign = vi.fn();
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onAssignSignboard={onAssign}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /看板を配置/ }));
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  // ==========================================================================
  // Task 12.2: エクスポート対象の選択チェック (R15.6, R15.7)
  // ==========================================================================

  it('onToggleSelect未指定時はエクスポート対象の選択チェックを表示しない', () => {
    render(<PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} />);
    expect(screen.queryByLabelText('エクスポート対象に含める')).not.toBeInTheDocument();
  });

  it('エクスポート対象チェックをクリックすると onToggleSelect が対象写真IDで呼ばれる (R15.6)', () => {
    const onToggleSelect = vi.fn();
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        selectedPhotoIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    );
    fireEvent.click(screen.getByLabelText('エクスポート対象に含める'));
    expect(onToggleSelect).toHaveBeenCalledWith('p1');
  });

  it('selectedPhotoIds に含まれる写真項目はチェック済みで表示される (R15.6)', () => {
    render(
      <PhotoItemPanel
        photos={[
          makePhoto({ id: 'p1', fileName: 'a.jpg' }),
          makePhoto({ id: 'p2', fileName: 'b.jpg' }),
        ]}
        onPhotoMetadataChange={vi.fn()}
        selectedPhotoIds={new Set(['p2'])}
        onToggleSelect={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByLabelText('エクスポート対象に含める');
    const items = screen.getAllByTestId('construction-photo-item');
    const p1Index = items.findIndex((el) => el.getAttribute('data-photo-id') === 'p1');
    const p2Index = items.findIndex((el) => el.getAttribute('data-photo-id') === 'p2');
    expect(checkboxes[p1Index]).not.toBeChecked();
    expect(checkboxes[p2Index]).toBeChecked();
  });

  // ==========================================================================
  // Task 12.4: readOnly結線の実効化（権限に基づくUI表示制御, R17.1, R17.3）
  // ==========================================================================

  it('readOnly時は上下移動ボタン・ドラッグハンドルが表示されない (R17.1, R17.3)', () => {
    const photos = [
      makePhoto({ id: 'p1', displayOrder: 1 }),
      makePhoto({ id: 'p2', displayOrder: 2 }),
    ];
    render(
      <PhotoItemPanel
        photos={photos}
        onPhotoMetadataChange={vi.fn()}
        onOrderChange={vi.fn()}
        readOnly
      />
    );
    expect(screen.queryByRole('button', { name: '上へ移動' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下へ移動' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('construction-photo-drag-handle')).not.toBeInTheDocument();
  });

  it('readOnly時はコメントが読み取り専用になり印刷対象チェックが無効化される (R17.1, R17.3)', () => {
    render(
      <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} readOnly />
    );
    expect(screen.getByLabelText('コメント')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('印刷対象に含める')).toBeDisabled();
  });

  it('readOnly時は保存ボタン・「看板を配置」導線が表示されない (R17.1, R17.3)', () => {
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onSave={vi.fn()}
        onAssignSignboard={vi.fn()}
        readOnly
      />
    );
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /看板を配置/ })).not.toBeInTheDocument();
  });

  it('onDeleteが未指定（削除権限なし）のときは readOnly でなくても写真項目削除ボタンが表示されない (R17.2)', () => {
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /写真項目を削除/ })).not.toBeInTheDocument();
    // readOnly ではないため保存ボタンなど編集系は表示される
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
  });

  it('onDeleteが指定され readOnly でないときは写真項目削除ボタンが表示される（回帰）', () => {
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /写真項目を削除/ })).toBeInTheDocument();
  });

  it('readOnly でもエクスポート対象の選択チェックは操作できる（選択は編集操作ではない）', () => {
    const onToggleSelect = vi.fn();
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        selectedPhotoIds={new Set()}
        onToggleSelect={onToggleSelect}
        readOnly
      />
    );
    const checkbox = screen.getByLabelText('エクスポート対象に含める');
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith('p1');
  });

  // ==========================================================================
  // Task 12.6: モバイル表示最適化（Requirement 19）
  // site-survey PhotoManagementPanel（Task 100.1）と同一パターン
  // ==========================================================================
  describe('モバイル表示最適化 (Task 12.6)', () => {
    describe('モバイル幅（isMobile=true）', () => {
      beforeEach(() => {
        vi.mocked(useMediaQuery).mockReturnValue(true);
      });

      it('R19.2: 写真＋メタデータ行を縦積み(column)化し、写真列を可変幅(100%)にすること', () => {
        const photos = [makePhoto({ id: 'p1' })];
        render(<PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} />);

        const item = screen.getByTestId('construction-photo-item');
        expect(item.style.flexDirection).toBe('column');

        const imageButton = screen.getByTestId('construction-photo-image-button');
        const imageSection = imageButton.parentElement as HTMLElement;
        expect(imageSection.style.width).toBe('100%');
      });

      it('R19.5: コメント入力欄のフォントサイズを16px以上にすること', () => {
        render(
          <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} />
        );
        const textarea = screen.getByLabelText('コメント') as HTMLElement;
        expect(pxValue(textarea.style.fontSize)).toBeGreaterThanOrEqual(16);
      });

      it('R19.3: 印刷対象チェックボックスのタップ領域を44px以上にすること', () => {
        render(
          <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} />
        );
        const checkbox = screen.getByLabelText('印刷対象に含める') as HTMLElement;
        expect(tapWidth(checkbox)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(checkbox)).toBeGreaterThanOrEqual(44);
      });

      it('R19.3: エクスポート対象チェックボックスのタップ領域を44px以上にすること', () => {
        render(
          <PhotoItemPanel
            photos={[makePhoto({ id: 'p1' })]}
            onPhotoMetadataChange={vi.fn()}
            selectedPhotoIds={new Set()}
            onToggleSelect={vi.fn()}
          />
        );
        const checkbox = screen.getByLabelText('エクスポート対象に含める') as HTMLElement;
        expect(tapWidth(checkbox)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(checkbox)).toBeGreaterThanOrEqual(44);
      });

      it('R19.3: 並び替えボタン（上へ/下へ移動）のタップ領域を44px以上にすること', () => {
        const photos = [
          makePhoto({ id: 'p1', displayOrder: 1 }),
          makePhoto({ id: 'p2', displayOrder: 2 }),
        ];
        render(
          <PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} onOrderChange={vi.fn()} />
        );
        const upButton = screen.getAllByRole('button', { name: '上へ移動' })[0] as HTMLElement;
        const downButton = screen.getAllByRole('button', { name: '下へ移動' })[0] as HTMLElement;
        expect(tapWidth(upButton)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(upButton)).toBeGreaterThanOrEqual(44);
        expect(tapWidth(downButton)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(downButton)).toBeGreaterThanOrEqual(44);
      });

      it('R19.3: 削除ボタンのタップ領域を44px以上にすること', () => {
        render(
          <PhotoItemPanel
            photos={[makePhoto({ id: 'p1' })]}
            onPhotoMetadataChange={vi.fn()}
            onDelete={vi.fn()}
          />
        );
        const deleteButton = screen.getByRole('button', { name: /写真項目を削除/ }) as HTMLElement;
        expect(tapWidth(deleteButton)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(deleteButton)).toBeGreaterThanOrEqual(44);
      });

      it('R19.3: ドラッグハンドルのタップ領域を44px以上にすること', () => {
        const photos = [
          makePhoto({ id: 'p1', displayOrder: 1 }),
          makePhoto({ id: 'p2', displayOrder: 2 }),
        ];
        render(
          <PhotoItemPanel photos={photos} onPhotoMetadataChange={vi.fn()} onOrderChange={vi.fn()} />
        );
        const dragHandle = screen.getAllByTestId(
          'construction-photo-drag-handle'
        )[0] as HTMLElement;
        expect(tapWidth(dragHandle)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(dragHandle)).toBeGreaterThanOrEqual(44);
      });

      it('モバイル幅でも印刷対象操作は既存挙動（メタデータ変更通知）を維持すること（回帰）', () => {
        const onChange = vi.fn();
        render(
          <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />
        );
        fireEvent.click(screen.getByLabelText('印刷対象に含める'));
        expect(onChange).toHaveBeenCalledWith('p1', { includeInReport: true });
      });

      it('モバイル幅でも並び替え操作は既存挙動（順序変更通知）を維持すること（回帰）', () => {
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
        const items = screen.getAllByTestId('construction-photo-item');
        fireEvent.click(within(items[0]!).getByRole('button', { name: '下へ移動' }));
        expect(onOrderChange).toHaveBeenCalledWith([
          { id: 'p2', order: 1 },
          { id: 'p1', order: 2 },
        ]);
      });
    });

    describe('デスクトップ幅（isMobile=false）- 既存レイアウト維持', () => {
      beforeEach(() => {
        vi.mocked(useMediaQuery).mockReturnValue(false);
      });

      it('横並び（flexDirection未指定=row）で写真列は固定320pxを維持すること（回帰）', () => {
        render(
          <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} />
        );
        const item = screen.getByTestId('construction-photo-item');
        expect(item.style.flexDirection).not.toBe('column');

        const imageButton = screen.getByTestId('construction-photo-image-button');
        const imageSection = imageButton.parentElement as HTMLElement;
        expect(imageSection.style.width).toBe('320px');
      });

      it('コメント入力欄のフォントサイズを現行(14px)のまま維持すること（回帰）', () => {
        render(
          <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={vi.fn()} />
        );
        const textarea = screen.getByLabelText('コメント') as HTMLElement;
        expect(textarea.style.fontSize).toBe('14px');
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
