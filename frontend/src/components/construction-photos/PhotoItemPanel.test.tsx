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
import { ApiError } from '../../api/client';

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

      it('R19.3: 看板の操作ボタン（「看板を配置」「看板を変更」）のタップ領域を44px以上にすること', () => {
        // 表示の文言は看板の指定の有無で切り替わる。どちらの状態でも下限を満たすこと（タスク 21.2）
        const photos = [
          makePhoto({ id: 'p1', fileName: 'unassigned.jpg', displayOrder: 1, signboardId: null }),
          makePhoto({ id: 'p2', fileName: 'assigned.jpg', displayOrder: 2, signboardId: 'sb-1' }),
        ];
        render(
          <PhotoItemPanel
            photos={photos}
            onPhotoMetadataChange={vi.fn()}
            onAssignSignboard={vi.fn()}
          />
        );
        const assignButton = screen.getByRole('button', {
          name: '看板を配置: unassigned.jpg',
        }) as HTMLElement;
        const changeButton = screen.getByRole('button', {
          name: '看板を配置: assigned.jpg',
        }) as HTMLElement;
        // 前提: 二つのボタンが、文言の二つの状態をそれぞれ表示している
        expect(assignButton).toHaveTextContent('看板を配置');
        expect(changeButton).toHaveTextContent('看板を変更');
        expect(tapWidth(assignButton)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(assignButton)).toBeGreaterThanOrEqual(44);
        expect(tapWidth(changeButton)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(changeButton)).toBeGreaterThanOrEqual(44);
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

      it('R19.1: 区切りの無い長いファイル名を見出しと削除確認ダイアログの本文で折り返すこと', () => {
        // カメラ由来のファイル名はアンダースコアが折り返し位置にならず一語として扱われる（タスク 20.3）
        const fileName = 'IMG_20261001_143052_foundation_rebar_1759300000000.jpg';
        render(
          <PhotoItemPanel
            photos={[makePhoto({ id: 'p1', fileName })]}
            onPhotoMetadataChange={vi.fn()}
            onDelete={vi.fn()}
          />
        );
        const heading = screen.getByRole('heading', { level: 3, name: fileName });
        expect(heading.style.overflowWrap).toBe('anywhere');

        fireEvent.click(screen.getByRole('button', { name: /写真項目を削除/ }));
        const message = within(screen.getByRole('dialog')).getByText(new RegExp(fileName));
        expect(message.tagName).toBe('P');
        expect(message.style.overflowWrap).toBe('anywhere');
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

  // ==========================================================================
  // ローディング表示（スケルトン）
  // ==========================================================================

  it('isLoading かつ写真0件のときスケルトンを表示する', () => {
    render(<PhotoItemPanel photos={[]} onPhotoMetadataChange={vi.fn()} isLoading />);
    expect(screen.getAllByTestId('construction-photo-skeleton')).toHaveLength(3);
  });

  // ==========================================================================
  // 写真項目削除フロー（R7.7）
  // ==========================================================================

  it('削除ボタンで確認ダイアログを開き「削除する」で onDelete が対象IDで呼ばれる (R7.7)', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1', fileName: 'target.jpg' })]}
        onPhotoMetadataChange={vi.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /写真項目を削除/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/target\.jpg/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    });

    expect(onDelete).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('削除確認ダイアログのキャンセルで onDelete を呼ばずに閉じる (R7.7)', () => {
    const onDelete = vi.fn();
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /写真項目を削除/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('削除の実行中でなければ、確認ダイアログはオーバーレイのクリックで onDelete を呼ばずに閉じる (R7.7)', () => {
    const onDelete = vi.fn();
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1' })]}
        onPhotoMetadataChange={vi.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /写真項目を削除/ }));
    fireEvent.click(screen.getByTestId('cp-delete-dialog-overlay'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ==========================================================================
  // 削除の実行中の確認ダイアログ（タスク 22.3）
  // 利用者の判断（2026-10-04）: 実行中はオーバーレイのクリック・Esc・キャンセルを受け付けない
  // ==========================================================================

  describe('削除の実行中の確認ダイアログ（タスク 22.3）', () => {
    /** 外から完了を決められる onDelete を作る */
    const deferredDelete = () => {
      let resolve: () => void = () => undefined;
      let reject: (error: unknown) => void = () => undefined;
      const onDelete = vi.fn<(photoId: string) => Promise<void>>(
        () =>
          new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
          })
      );
      return { onDelete, resolve: () => resolve(), reject: (e: unknown) => reject(e) };
    };

    const twoPhotos = [
      makePhoto({ id: 'p1', fileName: 'first.jpg', displayOrder: 1 }),
      makePhoto({ id: 'p2', fileName: 'second.jpg', displayOrder: 2 }),
    ];

    /** 実行中のダイアログを閉じようとする操作（オーバーレイ・Esc・キャンセル）をすべて行う */
    const tryToCloseDialog = () => {
      const dialog = screen.getByRole('dialog');
      fireEvent.click(screen.getByTestId('cp-delete-dialog-overlay'));
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    };

    it('成功する削除の実行中は、オーバーレイのクリック・Esc・キャンセルで閉じず、完了後に閉じる', async () => {
      const { onDelete, resolve } = deferredDelete();
      render(
        <PhotoItemPanel photos={twoPhotos} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: first.jpg' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });
      expect(onDelete).toHaveBeenCalledWith('p1');

      tryToCloseDialog();

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/first\.jpg/)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: '削除中...' })).toBeDisabled();

      await act(async () => {
        resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('失敗する削除の実行中も閉じず、完了後に閉じてその写真項目の中に失敗を表示する（23.9 のまま）', async () => {
      const { onDelete, reject } = deferredDelete();
      render(
        <PhotoItemPanel photos={twoPhotos} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: first.jpg' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      tryToCloseDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        reject(new Error('delete failed'));
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const item = screen.getByRole('article', { name: 'first.jpg' });
      expect(within(item).getByRole('alert')).toHaveTextContent('写真項目の削除に失敗しました');
      expect(within(item).getByRole('button', { name: '写真項目を削除: first.jpg' })).toHaveFocus();
    });

    it('実行中に別の写真項目の削除ボタンを押しても（キーボードで到達できる）確認の対象は変わらず、先行する削除の完了後に別の写真項目の確認を開ける', async () => {
      const { onDelete, resolve } = deferredDelete();
      render(
        <PhotoItemPanel photos={twoPhotos} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: first.jpg' }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '削除する' }));
      });

      fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: second.jpg' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/first\.jpg/)).toBeInTheDocument();
      expect(within(dialog).queryByText(/second\.jpg/)).not.toBeInTheDocument();

      await act(async () => {
        resolve();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onDelete).toHaveBeenCalledTimes(1);

      // 完了後は別の写真項目の確認を開け、それは開いたまま残る
      fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: second.jpg' }));
      const next = screen.getByRole('dialog');
      expect(within(next).getByText(/second\.jpg/)).toBeInTheDocument();
      expect(within(next).getByRole('button', { name: '削除する' })).not.toBeDisabled();
    });
  });

  // 21.3 の版は「失敗時に確認ダイアログを閉じ、やり直せる」だけを主張していた（失敗の表示は呼び出し
  // 元の通知の枠が担った）。23.9 では本部品が失敗をその写真項目の中に出すため、表示の場所と、
  // やり直しの開始で表示が消えることを併せて主張する
  it('onDelete が失敗したときは確認ダイアログを閉じ、その写真項目の中に失敗を表示し、同じ写真項目の削除をやり直せる（タスク 21.3、23.9）', async () => {
    const onDelete = vi
      .fn<(photoId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockResolvedValue(undefined);
    render(
      <PhotoItemPanel
        photos={[makePhoto({ id: 'p1', fileName: 'target.jpg' })]}
        onPhotoMetadataChange={vi.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '写真項目を削除: target.jpg' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '削除する' }));
    });

    // 前提: 失敗する onDelete が対象のIDで呼ばれている
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 写真項目と削除の操作手段は残り、失敗はその写真項目の中に出る
    const item = screen.getByRole('article', { name: 'target.jpg' });
    expect(within(item).getByRole('alert')).toHaveTextContent('写真項目の削除に失敗しました');

    // やり直し: 同じ操作手段から確認ダイアログを開き直せ、実行ボタンは実行中の表示に固着していない
    fireEvent.click(within(item).getByRole('button', { name: '写真項目を削除: target.jpg' }));
    const retryButton = within(screen.getByRole('dialog')).getByRole('button', {
      name: '削除する',
    });
    expect(retryButton).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(onDelete).toHaveBeenLastCalledWith('p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // やり直しを始めた時点で古い失敗は消える（本テストでは親が写真項目を除かないため、残った
    // 写真項目に古い失敗が出ていないことで観測する）
    expect(within(item).queryByRole('alert')).not.toBeInTheDocument();
  });

  // ==========================================================================
  // 写真項目の削除の失敗の表示（タスク 23.9）
  // 利用者の判断（2026-10-03）: 失敗は取り除こうとした写真項目の中（その写真項目の操作の近く）に
  // role=alert で出す。やり直しの成功・開始、その写真項目の別の操作、画面の離脱で消える。複数の
  // 写真項目で失敗したときは、それぞれの写真項目に出る。文言の規則は 21.3 のまま（サーバーの理由、
  // 無ければ既定の文言。セッション切れも区別しない）
  // ==========================================================================
  describe('写真項目の削除の失敗の表示（タスク 23.9）', () => {
    const DELETE_FAILED = '写真項目の削除に失敗しました';

    const twoPhotos = (): ConstructionPhotoWithUrls[] => [
      makePhoto({ id: 'p1', fileName: 'first.jpg', displayOrder: 1 }),
      makePhoto({ id: 'p2', fileName: 'second.jpg', displayOrder: 2 }),
    ];

    const itemOf = (fileName: string): HTMLElement =>
      screen.getByRole('article', { name: fileName });

    /** 指定の写真項目の削除を確認ダイアログで実行し、確定まで待つ */
    const deleteOf = async (fileName: string): Promise<void> => {
      fireEvent.click(
        within(itemOf(fileName)).getByRole('button', { name: `写真項目を削除: ${fileName}` })
      );
      await act(async () => {
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' })
        );
      });
    };

    /** 全操作のハンドラを渡して描画する。失敗させる onDelete を返す */
    const renderWithFailingDelete = (
      reason: unknown = new Error('boom'),
      isMobile = false
    ): ReturnType<typeof vi.fn> => {
      vi.mocked(useMediaQuery).mockReturnValue(isMobile);
      const onDelete = vi.fn<(photoId: string) => Promise<void>>().mockRejectedValue(reason);
      render(
        <PhotoItemPanel
          photos={twoPhotos()}
          onPhotoMetadataChange={vi.fn()}
          onOrderChange={vi.fn()}
          onDelete={onDelete}
          onAssignSignboard={vi.fn()}
          selectedPhotoIds={new Set()}
          onToggleSelect={vi.fn()}
        />
      );
      return onDelete;
    };

    describe('文言の規則（21.3 のまま）', () => {
      it('サーバーが理由を返した失敗（ApiError の message）はその理由を表示する', async () => {
        renderWithFailingDelete(new ApiError(500, 'サーバー内部エラーが発生しました'));
        await deleteOf('first.jpg');
        expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(
          'サーバー内部エラーが発生しました'
        );
      });

      it('サーバーが理由を返さない失敗（空の message）は既定の文言を表示する', async () => {
        renderWithFailingDelete(new ApiError(500, ''));
        await deleteOf('first.jpg');
        expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
      });

      it('ApiError でない失敗は、その message によらず既定の文言を表示する', async () => {
        renderWithFailingDelete(new TypeError('Failed to fetch'));
        await deleteOf('first.jpg');
        const alert = within(itemOf('first.jpg')).getByRole('alert');
        expect(alert).toHaveTextContent(DELETE_FAILED);
        expect(alert).not.toHaveTextContent('Failed to fetch');
      });

      it('セッション切れ（401）も他の失敗と区別せず、その理由を表示する', async () => {
        renderWithFailingDelete(new ApiError(401, '認証の有効期限が切れました'));
        await deleteOf('first.jpg');
        expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(
          '認証の有効期限が切れました'
        );
      });
    });

    it('失敗の表示は操作の行の直後にあり、削除ボタンの説明として結び付けられる（どの写真項目の失敗かが位置で分かる）', async () => {
      renderWithFailingDelete();
      await deleteOf('first.jpg');

      const item = itemOf('first.jpg');
      const alert = within(item).getByRole('alert');
      const deleteButton = within(item).getByRole('button', { name: '写真項目を削除: first.jpg' });
      // 操作の行（削除ボタンの親）の直後の兄弟である
      expect(deleteButton.parentElement?.nextElementSibling).toBe(alert);
      expect(deleteButton).toHaveAttribute('aria-describedby', alert.id);
      expect(deleteButton).toHaveAccessibleDescription(DELETE_FAILED);
      // 他の写真項目には出ず、その削除ボタンは説明を持たない
      const other = itemOf('second.jpg');
      expect(within(other).queryByRole('alert')).not.toBeInTheDocument();
      expect(
        within(other).getByRole('button', { name: '写真項目を削除: second.jpg' })
      ).not.toHaveAttribute('aria-describedby');
    });

    it('失敗して確認ダイアログが閉じると、フォーカスはその写真項目の削除ボタンへ画面を送らずに戻る（その場でやり直せる）', async () => {
      // jsdom は scrollIntoView を実装していないため、呼び出しを観測できる形で差し込む
      const scrollIntoView = vi.fn();
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollIntoView,
      });
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
      try {
        renderWithFailingDelete();
        await deleteOf('first.jpg');

        const item = itemOf('first.jpg');
        const deleteButton = within(item).getByRole('button', {
          name: '写真項目を削除: first.jpg',
        });
        // 前提: 確認ダイアログは閉じ、失敗が表示されている
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(within(item).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
        expect(document.activeElement).toBe(deleteButton);
        // 削除ボタンへのフォーカスは画面を送らない指定で行う。画面内へ入れる処理は失敗の表示に
        // 対する最小の移動（block: nearest）の 1 回だけで、フォーカスがそれを打ち消さない
        const buttonFocusCalls = focusSpy.mock.contexts
          .map((context, index) => ({ context, args: focusSpy.mock.calls[index] }))
          .filter(({ context }) => context === deleteButton);
        expect(buttonFocusCalls).toHaveLength(1);
        expect(buttonFocusCalls[0]!.args).toEqual([{ preventScroll: true }]);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.contexts[0]).toBe(within(item).getByRole('alert'));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      } finally {
        focusSpy.mockRestore();
        if (original) {
          Object.defineProperty(Element.prototype, 'scrollIntoView', original);
        } else {
          delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
        }
      }
    });

    it('失敗の表示を画面内へ入れる処理は、表示が現れるたびにその表示へ 1 回だけ呼ぶ（他の写真項目の表示や消去では呼ばない）', async () => {
      const scrollIntoView = vi.fn();
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollIntoView,
      });
      try {
        renderWithFailingDelete();
        await deleteOf('first.jpg');
        await deleteOf('second.jpg');

        const firstAlert = within(itemOf('first.jpg')).getByRole('alert');
        const secondAlert = within(itemOf('second.jpg')).getByRole('alert');
        expect(scrollIntoView.mock.contexts).toEqual([firstAlert, secondAlert]);
        expect(scrollIntoView.mock.calls).toEqual([[{ block: 'nearest' }], [{ block: 'nearest' }]]);

        // 失敗の表示を消す操作では呼ばない
        fireEvent.click(within(itemOf('first.jpg')).getByLabelText('印刷対象に含める'));
        expect(within(itemOf('first.jpg')).queryByRole('alert')).not.toBeInTheDocument();
        expect(scrollIntoView).toHaveBeenCalledTimes(2);
      } finally {
        if (original) {
          Object.defineProperty(Element.prototype, 'scrollIntoView', original);
        } else {
          delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
        }
      }
    });

    it('成功したときはフォーカスを削除ボタンへ戻さない（写真項目ごと無くなるため）', async () => {
      const onDelete = vi.fn<(photoId: string) => Promise<void>>().mockResolvedValue(undefined);
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
      try {
        render(
          <PhotoItemPanel
            photos={twoPhotos()}
            onPhotoMetadataChange={vi.fn()}
            onDelete={onDelete}
          />
        );
        await deleteOf('first.jpg');

        expect(onDelete).toHaveBeenCalledWith('p1');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        const deleteButtons = screen.getAllByRole('button', { name: /写真項目を削除: / });
        expect(deleteButtons).toHaveLength(2);
        expect(
          focusSpy.mock.contexts.filter((context) => deleteButtons.includes(context as HTMLElement))
        ).toHaveLength(0);
      } finally {
        focusSpy.mockRestore();
      }
    });

    it('複数の写真項目で失敗すると、それぞれの写真項目に、それぞれの失敗が同時に表示される', async () => {
      const onDelete = vi
        .fn<(photoId: string) => Promise<void>>()
        .mockImplementation(async (photoId) => {
          throw new ApiError(500, `理由-${photoId}`);
        });
      render(
        <PhotoItemPanel photos={twoPhotos()} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      await deleteOf('first.jpg');
      await deleteOf('second.jpg');

      expect(screen.getAllByRole('alert')).toHaveLength(2);
      expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent('理由-p1');
      expect(within(itemOf('second.jpg')).getByRole('alert')).toHaveTextContent('理由-p2');
    });

    describe('消える契機: その写真項目の別の操作', () => {
      // 操作ごとに、失敗した写真項目（first）への操作で消え、他の写真項目（second）への同じ操作では
      // 消えないことを主張する
      const operations: ReadonlyArray<{
        name: string;
        operate: (item: HTMLElement) => void;
      }> = [
        {
          name: 'コメントの編集',
          operate: (item) =>
            fireEvent.change(within(item).getByLabelText('コメント'), {
              target: { value: '編集' },
            }),
        },
        {
          name: '印刷対象の切り替え',
          operate: (item) => fireEvent.click(within(item).getByLabelText('印刷対象に含める')),
        },
        {
          name: 'エクスポート対象の切り替え',
          operate: (item) =>
            fireEvent.click(within(item).getByLabelText('エクスポート対象に含める')),
        },
        {
          name: '「看板を配置」',
          operate: (item) =>
            fireEvent.click(within(item).getByRole('button', { name: /看板を配置/ })),
        },
        {
          name: 'ドラッグの開始',
          operate: (item) =>
            fireEvent.dragStart(within(item).getByTestId('construction-photo-drag-handle'), {
              dataTransfer: { setData: vi.fn(), effectAllowed: '' },
            }),
        },
      ];

      it.each(operations)('$name で、その写真項目の失敗の表示が消える', async ({ operate }) => {
        renderWithFailingDelete();
        await deleteOf('first.jpg');
        expect(within(itemOf('first.jpg')).getByRole('alert')).toBeInTheDocument();

        operate(itemOf('first.jpg'));

        expect(within(itemOf('first.jpg')).queryByRole('alert')).not.toBeInTheDocument();
      });

      it.each(operations)(
        '他の写真項目への $name では、失敗した写真項目の表示は消えない',
        async ({ operate }) => {
          renderWithFailingDelete();
          await deleteOf('first.jpg');

          operate(itemOf('second.jpg'));

          expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
        }
      );

      it('「下へ移動」（その写真項目を動かす）で失敗の表示が消える', async () => {
        renderWithFailingDelete();
        await deleteOf('first.jpg');
        expect(within(itemOf('first.jpg')).getByRole('alert')).toBeInTheDocument();

        fireEvent.click(within(itemOf('first.jpg')).getByRole('button', { name: '下へ移動' }));

        expect(within(itemOf('first.jpg')).queryByRole('alert')).not.toBeInTheDocument();
      });

      it('「上へ移動」（その写真項目を動かす）で失敗の表示が消える', async () => {
        renderWithFailingDelete();
        await deleteOf('second.jpg');
        expect(within(itemOf('second.jpg')).getByRole('alert')).toBeInTheDocument();

        fireEvent.click(within(itemOf('second.jpg')).getByRole('button', { name: '上へ移動' }));

        expect(within(itemOf('second.jpg')).queryByRole('alert')).not.toBeInTheDocument();
      });

      it('他の写真項目を動かした結果として位置が入れ替わっても、失敗した写真項目の表示は消えない', async () => {
        renderWithFailingDelete();
        await deleteOf('first.jpg');

        // second を上へ動かすと first も一つ下がるが、first への操作ではない
        fireEvent.click(within(itemOf('second.jpg')).getByRole('button', { name: '上へ移動' }));

        expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
      });
    });

    it('削除の確認ダイアログを開いて取り消しても、失敗の表示は消えない（何も変わっていないため）', async () => {
      const onDelete = renderWithFailingDelete();
      await deleteOf('first.jpg');

      fireEvent.click(
        within(itemOf('first.jpg')).getByRole('button', { name: '写真項目を削除: first.jpg' })
      );
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' })
      );

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent(DELETE_FAILED);
    });

    it('やり直しが再び失敗すると、新しい失敗の文言に置き換わる', async () => {
      const onDelete = vi
        .fn<(photoId: string) => Promise<void>>()
        .mockRejectedValueOnce(new ApiError(500, '一回目の理由'))
        .mockRejectedValueOnce(new ApiError(500, '二回目の理由'));
      render(
        <PhotoItemPanel photos={twoPhotos()} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      await deleteOf('first.jpg');
      expect(within(itemOf('first.jpg')).getByRole('alert')).toHaveTextContent('一回目の理由');

      await deleteOf('first.jpg');

      const alerts = within(itemOf('first.jpg')).getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toHaveTextContent('二回目の理由');
      expect(alerts[0]).not.toHaveTextContent('一回目の理由');
    });

    it('画面を離れる（パネルが外れる）と失敗の表示は残らない（描画し直すと出ていない）', async () => {
      const onDelete = vi
        .fn<(photoId: string) => Promise<void>>()
        .mockRejectedValue(new Error('x'));
      const { unmount } = render(
        <PhotoItemPanel photos={twoPhotos()} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );
      await deleteOf('first.jpg');
      expect(within(itemOf('first.jpg')).getByRole('alert')).toBeInTheDocument();

      unmount();
      render(
        <PhotoItemPanel photos={twoPhotos()} onPhotoMetadataChange={vi.fn()} onDelete={onDelete} />
      );

      expect(screen.getAllByTestId('construction-photo-item')).toHaveLength(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('R19.1・R19.3: モバイル幅で、失敗の表示は区切りの無い長い文言を折り返し、写真項目の操作のタップ領域は 44px 以上のまま', async () => {
      const longReason = `DeleteFailureReasonWithoutAnyBreakOpportunity${'x'.repeat(160)}`;
      renderWithFailingDelete(new ApiError(500, longReason), true);
      await deleteOf('first.jpg');

      const item = itemOf('first.jpg');
      const alert = within(item).getByRole('alert');
      expect(alert).toHaveTextContent(longReason);
      expect(alert.style.overflowWrap).toBe('anywhere');
      expect(alert.style.minWidth).toBe('0px');

      const controls = [
        within(item).getByTestId('construction-photo-drag-handle'),
        within(item).getByRole('button', { name: '上へ移動' }),
        within(item).getByRole('button', { name: '下へ移動' }),
        within(item).getByLabelText('エクスポート対象に含める'),
        within(item).getByLabelText('印刷対象に含める'),
        within(item).getByRole('button', { name: /看板を配置/ }),
        within(item).getByRole('button', { name: '写真項目を削除: first.jpg' }),
      ];
      expect(controls).toHaveLength(7);
      for (const control of controls) {
        expect(tapWidth(control)).toBeGreaterThanOrEqual(44);
        expect(tapHeight(control)).toBeGreaterThanOrEqual(44);
      }
    });
  });

  // ==========================================================================
  // 「上へ移動」（R7.4）
  // ==========================================================================

  it('「上へ移動」で正規化された新しい順序が通知される (R7.4)', () => {
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
    const upButtons = screen.getAllByRole('button', { name: '上へ移動' });
    // 先頭(p1)の上ボタンは無効、2番目(p2)の上ボタンで上へ移動
    expect(upButtons[0]).toBeDisabled();
    fireEvent.click(upButtons[1]!);
    expect(onOrderChange).toHaveBeenCalledWith([
      { id: 'p2', order: 1 },
      { id: 'p1', order: 2 },
    ]);
  });

  // ==========================================================================
  // ドラッグ&ドロップ並び替え（R7.3）
  // ==========================================================================

  it('ドラッグ&ドロップで正規化された新しい順序が通知される (R7.3)', () => {
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
    const handles = screen.getAllByTestId('construction-photo-drag-handle');
    const items = screen.getAllByTestId('construction-photo-item');

    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (key: string, value: string) => {
        store[key] = value;
      },
      getData: (key: string) => store[key] ?? '',
      effectAllowed: '',
      dropEffect: '',
    };

    // p1 のハンドルからドラッグ開始
    fireEvent.dragStart(handles[0]!, { dataTransfer });
    // ドラッグ中スタイルが反映される
    expect(items[0]!.style.border).toContain('dashed');

    // p2 の上をドラッグオーバー→エンター
    fireEvent.dragOver(items[1]!, { dataTransfer });
    fireEvent.dragEnter(items[1]!, { dataTransfer });
    // ドラッグオーバー先(p2)にスタイルが反映される
    expect(items[1]!.style.border).toContain('solid');

    // 外に出るとドラッグオーバー解除
    fireEvent.dragLeave(items[1]!, { relatedTarget: document.body });
    // 子要素へのリーブ（currentTarget内）は維持
    fireEvent.dragLeave(items[1]!, { relatedTarget: handles[1]! });

    // p2 の上にドロップ
    fireEvent.drop(items[1]!, { dataTransfer });
    expect(onOrderChange).toHaveBeenCalledWith([
      { id: 'p2', order: 1 },
      { id: 'p1', order: 2 },
    ]);

    // ドラッグ終了でドラッグ状態がリセットされる
    fireEvent.dragEnd(handles[0]!);
    expect(items[0]!.style.border).not.toContain('dashed');
  });

  it('同一項目へのドロップは順序変更を通知しない (R7.3)', () => {
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
    const handles = screen.getAllByTestId('construction-photo-drag-handle');
    const items = screen.getAllByTestId('construction-photo-item');

    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (key: string, value: string) => {
        store[key] = value;
      },
      getData: (key: string) => store[key] ?? '',
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(handles[0]!, { dataTransfer });
    fireEvent.drop(items[0]!, { dataTransfer });
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // 保存の失敗の表示（タスク 22.2）
  // ==========================================================================

  // 利用者の判断（2026-10-04）: 23.9 と同じ考え方で、保存の失敗を保存ボタンの近くにも表示する
  // （上部の通知の枠は詳細画面に残る）。文言と消える契機は詳細画面が決め、本部品は渡された文言を
  // 保存ボタンの直後に role=alert で描く
  describe('保存の失敗の表示（タスク 22.2）', () => {
    const SAVE_FAILED = '保存の失敗の理由';

    function renderWithSaveFailure(saveFailure: string | null, extra: { readOnly?: boolean } = {}) {
      return render(
        <PhotoItemPanel
          photos={[makePhoto({ id: 'p1' })]}
          onPhotoMetadataChange={vi.fn()}
          onSave={vi.fn()}
          isDirty
          saveFailure={saveFailure}
          {...extra}
        />
      );
    }

    /** jsdom は scrollIntoView を実装していないため、呼び出しを観測できる形で差し込む */
    function stubScrollIntoView() {
      const scrollIntoView = vi.fn();
      const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollIntoView,
      });
      const restore = () => {
        if (original) {
          Object.defineProperty(Element.prototype, 'scrollIntoView', original);
        } else {
          delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
        }
      };
      return { scrollIntoView, restore };
    }

    it('保存の失敗を保存ボタンの直後に role=alert で表示し、保存ボタンの aria-describedby がその表示を指す', () => {
      renderWithSaveFailure(SAVE_FAILED);

      const saveButton = screen.getByRole('button', { name: '保存' });
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(SAVE_FAILED);
      // 写真項目の中ではなく、保存ボタンの近く（文書の順で保存ボタンの直後、写真項目より前）にある
      expect(alert.closest('[data-testid="construction-photo-item"]')).toBeNull();
      expect(saveButton.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      const firstItem = screen.getByTestId('construction-photo-item');
      expect(alert.compareDocumentPosition(firstItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expect(alert.id).not.toBe('');
      expect(saveButton).toHaveAttribute('aria-describedby', alert.id);
    });

    it('区切りの無い長い文言でも折り返す（overflowWrap: anywhere と minWidth: 0）', () => {
      renderWithSaveFailure('X'.repeat(300));
      const alert = screen.getByRole('alert');
      expect(alert.style.overflowWrap).toBe('anywhere');
      expect(alert.style.minWidth).toBe('0px');
    });

    it('保存の失敗が無いときは表示せず、保存ボタンは aria-describedby を持たない', () => {
      renderWithSaveFailure(null);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('aria-describedby');
    });

    it('文言が消えると表示も aria-describedby も消える', () => {
      const { rerender } = renderWithSaveFailure(SAVE_FAILED);
      expect(screen.getByRole('alert')).toBeInTheDocument();

      rerender(
        <PhotoItemPanel
          photos={[makePhoto({ id: 'p1' })]}
          onPhotoMetadataChange={vi.fn()}
          onSave={vi.fn()}
          isDirty
          saveFailure={null}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('aria-describedby');
    });

    it('表示が現れるたびに、その表示へ scrollIntoView({ block: "nearest" }) を 1 回だけ呼ぶ', () => {
      const { scrollIntoView, restore } = stubScrollIntoView();
      try {
        const { rerender } = renderWithSaveFailure(null);
        expect(scrollIntoView).not.toHaveBeenCalled();

        const renderWith = (saveFailure: string | null) =>
          rerender(
            <PhotoItemPanel
              photos={[makePhoto({ id: 'p1' })]}
              onPhotoMetadataChange={vi.fn()}
              onSave={vi.fn()}
              isDirty
              saveFailure={saveFailure}
            />
          );

        renderWith(SAVE_FAILED);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('alert'));
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

        // やり直しの開始で一度消え、同じ文言で再び失敗したときも呼ぶ
        renderWith(null);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        renderWith(SAVE_FAILED);
        expect(scrollIntoView).toHaveBeenCalledTimes(2);
      } finally {
        restore();
      }
    });

    it('フォーカスを失っているときは、保存ボタンへ画面を送らずに戻す', () => {
      const { restore } = stubScrollIntoView();
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
      try {
        const { rerender } = renderWithSaveFailure(null);
        (document.activeElement as HTMLElement | null)?.blur();
        expect(document.activeElement).toBe(document.body);

        rerender(
          <PhotoItemPanel
            photos={[makePhoto({ id: 'p1' })]}
            onPhotoMetadataChange={vi.fn()}
            onSave={vi.fn()}
            isDirty
            saveFailure={SAVE_FAILED}
          />
        );

        const saveButton = screen.getByRole('button', { name: '保存' });
        expect(document.activeElement).toBe(saveButton);
        const calls = focusSpy.mock.contexts
          .map((context, index) => ({ context, args: focusSpy.mock.calls[index] }))
          .filter(({ context }) => context === saveButton);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.args).toEqual([{ preventScroll: true }]);
      } finally {
        focusSpy.mockRestore();
        restore();
      }
    });

    it('保存の実行中に別の入力欄へ移ったフォーカスは奪わず、画面も動かさない（編集中の欄を画面の外へ出さない）', () => {
      const { scrollIntoView, restore } = stubScrollIntoView();
      try {
        const { rerender } = renderWithSaveFailure(null);
        const textarea = screen.getByLabelText('コメント');
        textarea.focus();
        expect(document.activeElement).toBe(textarea);

        rerender(
          <PhotoItemPanel
            photos={[makePhoto({ id: 'p1' })]}
            onPhotoMetadataChange={vi.fn()}
            onSave={vi.fn()}
            isDirty
            saveFailure={SAVE_FAILED}
          />
        );

        expect(screen.getByRole('alert')).toHaveTextContent(SAVE_FAILED);
        expect(document.activeElement).toBe(textarea);
        expect(scrollIntoView).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });
  });

  // ==========================================================================
  // コメントバリデーション（R7.2）とデバウンス再設定
  // ==========================================================================

  it('2000文字を超えるコメントはエラー表示し変更を通知しない (R7.2)', () => {
    const onChange = vi.fn();
    render(<PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />);
    const textarea = screen.getByLabelText('コメント');
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(2001) } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.blur(textarea);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('連続入力ではデバウンスタイマーが再設定され最終値のみ通知される (R7.1)', () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(
        <PhotoItemPanel photos={[makePhoto({ id: 'p1' })]} onPhotoMetadataChange={onChange} />
      );
      const textarea = screen.getByLabelText('コメント');
      fireEvent.change(textarea, { target: { value: 'あ' } });
      fireEvent.change(textarea, { target: { value: 'あい' } });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('p1', { comment: 'あい' });
    } finally {
      vi.useRealTimers();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-7.3
 * @requirement construction-photo/REQ-11.3
 * @requirement construction-photo/REQ-19.3
 * @requirement construction-photo/REQ-19.5
 */
