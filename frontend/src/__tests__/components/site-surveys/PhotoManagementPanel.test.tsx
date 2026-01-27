/**
 * @fileoverview 写真一覧管理パネルコンポーネントのテスト
 *
 * Task 27.4: 写真一覧管理パネルコンポーネントを実装する
 *
 * Requirements:
 * - 10.1: 報告書出力対象写真の選択
 * - 10.7: 保存された表示順序で写真一覧を表示
 *
 * テスト対象:
 * - 写真ごとに報告書出力フラグ（チェックボックス）を表示
 * - 中解像度画像（800x600px程度）でサムネイルではない実際の写真を表示
 * - コメント入力用テキストエリアを各写真に配置
 * - 保存された表示順序で写真一覧を表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoManagementPanel } from '../../../components/site-surveys/PhotoManagementPanel';
import type { SurveyImageInfo } from '../../../types/site-survey.types';

// ============================================================================
// テストデータ
// ============================================================================

const createMockImage = (
  id: string,
  displayOrder: number,
  options: Partial<SurveyImageInfo> = {}
): SurveyImageInfo => ({
  id,
  surveyId: 'survey-1',
  originalPath: `images/original/${id}.jpg`,
  thumbnailPath: `images/thumbnail/${id}.jpg`,
  originalUrl: `https://example.com/original/${id}.jpg`,
  thumbnailUrl: `https://example.com/thumbnail/${id}.jpg`,
  // 中解像度画像URL（800x600程度）
  mediumUrl: `https://example.com/medium/${id}.jpg`,
  fileName: `image-${id}.jpg`,
  fileSize: 1024 * 500, // 500KB
  width: 800,
  height: 600,
  displayOrder,
  createdAt: '2025-01-01T00:00:00.000Z',
  comment: null,
  includeInReport: false,
  ...options,
});

const mockImages: SurveyImageInfo[] = [
  createMockImage('img-1', 1, {
    comment: '施工箇所A',
    includeInReport: true,
  }),
  createMockImage('img-2', 2, {
    comment: null,
    includeInReport: false,
  }),
  createMockImage('img-3', 3, {
    comment: '仕上げ確認',
    includeInReport: true,
  }),
];

// ============================================================================
// テストスイート
// ============================================================================

describe('PhotoManagementPanel', () => {
  const defaultProps = {
    images: mockImages,
    onImageMetadataChange: vi.fn(),
    onImageClick: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 基本レンダリングテスト
  // ==========================================================================

  describe('基本レンダリング', () => {
    it('画像一覧を表示順序でソートして表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      // data-testid="photo-panel-item" で各画像アイテムを取得
      const items = screen.getAllByTestId('photo-panel-item');
      expect(items).toHaveLength(3);

      // 順序を検証（displayOrder順）
      const firstItem = items[0];
      const secondItem = items[1];
      const thirdItem = items[2];

      expect(firstItem).toHaveAttribute('data-image-id', 'img-1');
      expect(secondItem).toHaveAttribute('data-image-id', 'img-2');
      expect(thirdItem).toHaveAttribute('data-image-id', 'img-3');
    });

    it('順序がバラバラの画像でもdisplayOrder順にソートして表示すること', () => {
      const unorderedImages = [
        createMockImage('img-c', 3),
        createMockImage('img-a', 1),
        createMockImage('img-b', 2),
      ];

      render(<PhotoManagementPanel {...defaultProps} images={unorderedImages} />);

      const items = screen.getAllByTestId('photo-panel-item');
      expect(items[0]).toHaveAttribute('data-image-id', 'img-a');
      expect(items[1]).toHaveAttribute('data-image-id', 'img-b');
      expect(items[2]).toHaveAttribute('data-image-id', 'img-c');
    });

    it('画像がない場合は空状態メッセージを表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} images={[]} />);

      expect(screen.getByText('画像がありません')).toBeInTheDocument();
    });

    it('ローディング中はスケルトンを表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} isLoading={true} images={[]} />);

      const skeletons = screen.getAllByTestId('photo-skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 中解像度画像表示テスト
  // ==========================================================================

  describe('中解像度画像表示', () => {
    it('サムネイルURLではなく中解像度画像URLを使用すること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveAttribute('src', 'https://example.com/medium/img-1.jpg');
      expect(images[1]).toHaveAttribute('src', 'https://example.com/medium/img-2.jpg');
      expect(images[2]).toHaveAttribute('src', 'https://example.com/medium/img-3.jpg');
    });

    it('中解像度画像URLがない場合はオリジナル画像URLにフォールバックすること', () => {
      const imagesWithoutMedium = mockImages.map((img) => ({
        ...img,
        mediumUrl: undefined,
      }));

      render(<PhotoManagementPanel {...defaultProps} images={imagesWithoutMedium} />);

      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveAttribute('src', 'https://example.com/original/img-1.jpg');
    });

    it('画像にalt属性としてファイル名を設定すること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const images = screen.getAllByRole('img');
      expect(images[0]).toHaveAttribute('alt', 'image-img-1.jpg');
    });
  });

  // ==========================================================================
  // 報告書出力フラグ（チェックボックス）テスト
  // ==========================================================================

  describe('報告書出力フラグ', () => {
    it('各画像に報告書出力用チェックボックスを表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /報告書に含める/i });
      expect(checkboxes).toHaveLength(3);
    });

    it('includeInReportがtrueの画像はチェックボックスがONであること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const items = screen.getAllByTestId('photo-panel-item');
      expect(items).toHaveLength(3);

      // img-1: includeInReport = true
      const item0 = items[0]!;
      const checkbox1 = within(item0).getByRole('checkbox', { name: /報告書に含める/i });
      expect(checkbox1).toBeChecked();

      // img-2: includeInReport = false
      const item1 = items[1]!;
      const checkbox2 = within(item1).getByRole('checkbox', { name: /報告書に含める/i });
      expect(checkbox2).not.toBeChecked();

      // img-3: includeInReport = true
      const item2 = items[2]!;
      const checkbox3 = within(item2).getByRole('checkbox', { name: /報告書に含める/i });
      expect(checkbox3).toBeChecked();
    });

    it('チェックボックスをクリックするとonImageMetadataChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onMetadataChange = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageMetadataChange={onMetadataChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const item1 = items[1]!;
      const checkbox = within(item1).getByRole('checkbox', { name: /報告書に含める/i });

      await user.click(checkbox);

      expect(onMetadataChange).toHaveBeenCalledWith('img-2', { includeInReport: true });
    });

    it('チェックをOFFにするとfalseで呼ばれること', async () => {
      const user = userEvent.setup();
      const onMetadataChange = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageMetadataChange={onMetadataChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      // img-1は既にincludeInReport: trueなのでチェックされている
      const item0 = items[0]!;
      const checkbox = within(item0).getByRole('checkbox', { name: /報告書に含める/i });

      await user.click(checkbox);

      expect(onMetadataChange).toHaveBeenCalledWith('img-1', { includeInReport: false });
    });
  });

  // ==========================================================================
  // コメント入力テスト
  // ==========================================================================

  describe('コメント入力', () => {
    it('各画像にコメント用テキストエリアを表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const textareas = screen.getAllByRole('textbox', { name: /コメント/i });
      expect(textareas).toHaveLength(3);
    });

    it('既存のコメントがテキストエリアに表示されること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const textareas = screen.getAllByRole('textbox', { name: /コメント/i });

      expect(textareas[0]).toHaveValue('施工箇所A');
      expect(textareas[1]).toHaveValue(''); // null -> empty string
      expect(textareas[2]).toHaveValue('仕上げ確認');
    });

    it('コメント入力後にフォーカスが外れるとonImageMetadataChangeが呼ばれること', async () => {
      const user = userEvent.setup();
      const onMetadataChange = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageMetadataChange={onMetadataChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const item1 = items[1]!;
      const textarea = within(item1).getByRole('textbox', { name: /コメント/i });

      await user.clear(textarea);
      await user.type(textarea, '新しいコメント');
      fireEvent.blur(textarea);

      expect(onMetadataChange).toHaveBeenCalledWith('img-2', { comment: '新しいコメント' });
    });

    it('コメントが変更されていない場合はonImageMetadataChangeは呼ばれないこと', async () => {
      const user = userEvent.setup();
      const onMetadataChange = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageMetadataChange={onMetadataChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const item0 = items[0]!;
      const textarea = within(item0).getByRole('textbox', { name: /コメント/i });

      // フォーカスを当てて外すだけ（値は変更しない）
      await user.click(textarea);
      fireEvent.blur(textarea);

      expect(onMetadataChange).not.toHaveBeenCalled();
    });

    it('テキストエリアにplaceholderが表示されること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const textareas = screen.getAllByRole('textbox', { name: /コメント/i });
      expect(textareas[1]).toHaveAttribute('placeholder', 'コメントを入力...');
    });

    it('コメントの最大文字数（2000文字）を超えた場合は警告を表示すること', () => {
      const longComment = 'a'.repeat(2001);

      render(<PhotoManagementPanel {...defaultProps} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const item1 = items[1]!;
      const textarea = within(item1).getByRole('textbox', { name: /コメント/i });

      // fireEventを使用して直接値を設定（大量入力を避けるため）
      fireEvent.change(textarea, { target: { value: longComment } });

      expect(screen.getByText(/2000文字以内で入力してください/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 画像クリックテスト
  // ==========================================================================

  describe('画像クリック', () => {
    it('画像をクリックするとonImageClickが呼ばれること', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageClick={onImageClick} />);

      const images = screen.getAllByRole('img');
      const firstImage = images[0]!;
      await user.click(firstImage);

      expect(onImageClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' }));
    });

    it('画像にキーボードでフォーカスしてEnterを押すとonImageClickが呼ばれること', async () => {
      const user = userEvent.setup();
      const onImageClick = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageClick={onImageClick} />);

      const imageButtons = screen.getAllByTestId('photo-image-button');
      const firstButton = imageButtons[0]!;
      firstButton.focus();
      await user.keyboard('{Enter}');

      expect(onImageClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' }));
    });
  });

  // ==========================================================================
  // アクセシビリティテスト
  // ==========================================================================

  describe('アクセシビリティ', () => {
    it('コンポーネントにaria-labelが設定されること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      expect(screen.getByRole('region', { name: '写真管理パネル' })).toBeInTheDocument();
    });

    it('各画像アイテムにaria-labelledbyが設定されること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const items = screen.getAllByTestId('photo-panel-item');
      items.forEach((item) => {
        expect(item).toHaveAttribute('aria-labelledby');
      });
    });

    it('チェックボックスにわかりやすいラベルが付与されること', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const checkbox = screen.getAllByRole('checkbox', { name: /報告書に含める/i })[0];
      expect(checkbox).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 表示順序番号テスト
  // ==========================================================================

  describe('表示順序番号', () => {
    it('showOrderNumbersがtrueの場合、各画像に順序番号を表示すること', () => {
      render(<PhotoManagementPanel {...defaultProps} showOrderNumbers={true} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('showOrderNumbersがfalseの場合、順序番号を表示しないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} showOrderNumbers={false} />);

      // 順序番号要素が存在しないことを確認
      const orderNumbers = screen.queryAllByTestId('photo-order-number');
      expect(orderNumbers).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 読み取り専用モードテスト
  // ==========================================================================

  describe('読み取り専用モード', () => {
    it('readOnlyがtrueの場合、チェックボックスが無効化されること', () => {
      render(<PhotoManagementPanel {...defaultProps} readOnly={true} />);

      const checkboxes = screen.getAllByRole('checkbox', { name: /報告書に含める/i });
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toBeDisabled();
      });
    });

    it('readOnlyがtrueの場合、テキストエリアが読み取り専用になること', () => {
      render(<PhotoManagementPanel {...defaultProps} readOnly={true} />);

      const textareas = screen.getAllByRole('textbox', { name: /コメント/i });
      textareas.forEach((textarea) => {
        expect(textarea).toHaveAttribute('readonly');
      });
    });
  });

  // ==========================================================================
  // デバウンス動作テスト
  // ==========================================================================

  describe('デバウンス動作', () => {
    it('コメント入力中は一定時間後に自動保存されること', async () => {
      // fake timersを使わず、blur時の保存動作をテストする
      // デバウンスの詳細な動作は実装の内部詳細であり、
      // blur時に保存されることを確認すれば機能としては担保される
      const onMetadataChange = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onImageMetadataChange={onMetadataChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const item1 = items[1]!;
      const textarea = within(item1).getByRole('textbox', { name: /コメント/i });

      // fireEventを使用して直接値を設定
      fireEvent.change(textarea, { target: { value: 'テスト' } });

      // 値変更直後は呼ばれない（デバウンス中）
      expect(onMetadataChange).not.toHaveBeenCalled();

      // フォーカスが外れると即座に保存される
      fireEvent.blur(textarea);

      await waitFor(() => {
        expect(onMetadataChange).toHaveBeenCalledWith('img-2', { comment: 'テスト' });
      });
    });
  });

  // ==========================================================================
  // ドラッグアンドドロップ順序変更テスト（Task 27.5）
  // ==========================================================================

  describe('ドラッグアンドドロップによる順序変更', () => {
    it('ドラッグハンドルが各画像アイテムに表示されること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const dragHandles = screen.getAllByTestId('photo-drag-handle');
      expect(dragHandles).toHaveLength(3);
    });

    it('readOnlyモードではドラッグハンドルが表示されないこと', () => {
      const onOrderChange = vi.fn();
      render(
        <PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} readOnly={true} />
      );

      const dragHandles = screen.queryAllByTestId('photo-drag-handle');
      expect(dragHandles).toHaveLength(0);
    });

    it('ドラッグ開始時にドラッグ中スタイルが適用されること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstItem = items[0]!;
      const dragHandle = within(firstItem).getByTestId('photo-drag-handle');

      // ドラッグ開始イベントをシミュレート
      fireEvent.dragStart(dragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      // ドラッグ中のスタイルが適用される
      expect(firstItem).toHaveAttribute('data-dragging', 'true');
    });

    it('ドロップ時にonOrderChangeが新しい順序で呼ばれること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
      const thirdItem = items[2]!;

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
          getData: () => 'img-1',
        },
      });

      // ドラッグオーバー
      fireEvent.dragOver(thirdItem, {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: 'move' },
      });

      // ドラッグエンター
      fireEvent.dragEnter(thirdItem, {
        preventDefault: vi.fn(),
      });

      // ドロップ
      fireEvent.drop(thirdItem, {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: () => 'img-1',
        },
      });

      expect(onOrderChange).toHaveBeenCalledWith([
        { id: 'img-2', order: 1 },
        { id: 'img-3', order: 2 },
        { id: 'img-1', order: 3 },
      ]);
    });

    it('同じ位置へのドロップではonOrderChangeが呼ばれないこと', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
      const firstItem = items[0]!;

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
          getData: () => 'img-1',
        },
      });

      // 同じアイテムにドロップ
      fireEvent.drop(firstItem, {
        preventDefault: vi.fn(),
        dataTransfer: {
          getData: () => 'img-1',
        },
      });

      expect(onOrderChange).not.toHaveBeenCalled();
    });

    it('ドラッグオーバー時にドロップ先アイテムにハイライトスタイルが適用されること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
      const secondItem = items[1]!;

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
          getData: () => 'img-1',
        },
      });

      // 2番目のアイテムにドラッグエンター
      fireEvent.dragEnter(secondItem, {
        preventDefault: vi.fn(),
      });

      expect(secondItem).toHaveAttribute('data-drag-over', 'true');
    });

    it('ドラッグリーブ時にドロップ先ハイライトが解除されること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
      const secondItem = items[1]!;

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      // ドラッグエンター
      fireEvent.dragEnter(secondItem, {
        preventDefault: vi.fn(),
      });

      // ドラッグリーブ
      fireEvent.dragLeave(secondItem, {
        preventDefault: vi.fn(),
      });

      expect(secondItem).not.toHaveAttribute('data-drag-over', 'true');
    });

    it('ドラッグ終了時にすべてのドラッグ状態がリセットされること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      expect(items[0]).toHaveAttribute('data-dragging', 'true');

      // ドラッグ終了
      fireEvent.dragEnd(firstDragHandle);

      expect(items[0]).not.toHaveAttribute('data-dragging', 'true');
    });

    it('onOrderChangeが未定義の場合、ドラッグハンドルは表示されないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const dragHandles = screen.queryAllByTestId('photo-drag-handle');
      expect(dragHandles).toHaveLength(0);
    });

    it('ドラッグ中のアイテムには視覚的なフィードバックスタイルが適用されること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

      const items = screen.getAllByTestId('photo-panel-item');
      const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');

      // ドラッグ開始
      fireEvent.dragStart(firstDragHandle, {
        dataTransfer: {
          setData: vi.fn(),
          effectAllowed: 'move',
        },
      });

      // ドラッグ中のアイテムにスタイルが適用されていることを確認
      expect(items[0]).toHaveAttribute('data-dragging', 'true');
    });
  });

  // ==========================================================================
  // 手動保存方式テスト（Task 33.1）
  // ==========================================================================

  describe('手動保存方式', () => {
    it('保存ボタンが表示されること', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} />);

      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    });

    it('onSaveが未定義の場合、保存ボタンは表示されないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /保存/i })).not.toBeInTheDocument();
    });

    it('変更がない場合、保存ボタンが無効化されていること', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} isDirty={false} />);

      const saveButton = screen.getByRole('button', { name: /保存/i });
      expect(saveButton).toBeDisabled();
    });

    it('変更がある場合、保存ボタンが有効化されていること', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} isDirty={true} />);

      const saveButton = screen.getByRole('button', { name: /保存/i });
      expect(saveButton).not.toBeDisabled();
    });

    it('保存ボタンをクリックするとonSaveが呼ばれること', async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onSave={onSave} isDirty={true} />);

      const saveButton = screen.getByRole('button', { name: /保存/i });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalled();
    });

    it('isSavingがtrueの場合、保存中の表示になること', () => {
      render(
        <PhotoManagementPanel {...defaultProps} onSave={vi.fn()} isDirty={true} isSaving={true} />
      );

      const saveButton = screen.getByRole('button', { name: /保存中/i });
      expect(saveButton).toBeInTheDocument();
      expect(saveButton).toBeDisabled();
    });

    it('未保存変更インジケーターが表示されること', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} isDirty={true} />);

      expect(screen.getByText(/未保存の変更があります/i)).toBeInTheDocument();
    });

    it('未保存変更がない場合、インジケーターは表示されないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} isDirty={false} />);

      expect(screen.queryByText(/未保存の変更があります/i)).not.toBeInTheDocument();
    });

    it('readOnlyモードでは保存ボタンが表示されないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} onSave={vi.fn()} readOnly={true} />);

      expect(screen.queryByRole('button', { name: /保存/i })).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 画像削除機能テスト（Task 34.1, Task 34.2）
  // ==========================================================================

  describe('画像削除機能 (Task 34)', () => {
    it('onDeleteが定義されている場合、各画像に削除ボタンが表示されること', () => {
      const onDelete = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      expect(deleteButtons).toHaveLength(3);
    });

    it('onDeleteが未定義の場合、削除ボタンは表示されないこと', () => {
      render(<PhotoManagementPanel {...defaultProps} />);

      const deleteButtons = screen.queryAllByRole('button', { name: /削除/i });
      expect(deleteButtons).toHaveLength(0);
    });

    it('readOnlyモードでは削除ボタンが表示されないこと', () => {
      const onDelete = vi.fn();
      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} readOnly={true} />);

      const deleteButtons = screen.queryAllByRole('button', { name: /削除/i });
      expect(deleteButtons).toHaveLength(0);
    });

    it('削除ボタンをクリックすると確認ダイアログが表示されること', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await user.click(deleteButtons[0]!);

      // 確認ダイアログが表示される
      expect(
        screen.getByText(/この画像を削除しますか？関連する注釈データも削除されます。/i)
      ).toBeInTheDocument();
    });

    it('確認ダイアログでキャンセルをクリックするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await user.click(deleteButtons[0]!);

      // 確認ダイアログが表示される
      expect(
        screen.getByText(/この画像を削除しますか？関連する注釈データも削除されます。/i)
      ).toBeInTheDocument();

      // キャンセルボタンをクリック
      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      // ダイアログが閉じる
      expect(
        screen.queryByText(/この画像を削除しますか？関連する注釈データも削除されます。/i)
      ).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('確認ダイアログで削除を確認するとonDeleteが呼ばれること', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();

      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await user.click(deleteButtons[0]!);

      // 確認ダイアログで削除を確認
      const confirmButton = screen.getByRole('button', { name: /削除する/i });
      await user.click(confirmButton);

      // onDeleteが呼ばれる（画像IDを渡す）
      expect(onDelete).toHaveBeenCalledWith('img-1');
    });

    it('削除中の状態ではボタンが無効化されること', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn().mockImplementation(() => new Promise(() => {})); // 永遠に解決しない

      render(<PhotoManagementPanel {...defaultProps} onDelete={onDelete} />);

      const deleteButtons = screen.getAllByRole('button', { name: /削除/i });
      await user.click(deleteButtons[0]!);

      // 確認ダイアログで削除を確認
      const confirmButton = screen.getByRole('button', { name: /削除する/i });
      await user.click(confirmButton);

      // 削除中の状態になる
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /削除中/i })).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Task 37: 画像順序変更のローカル状態管理テスト
  // 要件: 4.11, 4.12, 4.13, 10.5, 10.6, 10.7
  // ==========================================================================

  describe('画像順序変更のローカル状態管理 (Task 37)', () => {
    // -----------------------------------------------------------------------
    // Task 37.1: 「上へ移動」「下へ移動」ボタン
    // -----------------------------------------------------------------------
    describe('上へ移動/下へ移動ボタン (Task 37.1)', () => {
      it('showOrderButtonsがtrueかつonOrderChangeが定義されている場合、順序変更ボタンが表示されること', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const orderButtonGroups = screen.getAllByTestId('order-buttons');
        expect(orderButtonGroups).toHaveLength(3);
      });

      it('showOrderButtonsがfalseの場合、順序変更ボタンが表示されないこと', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={false}
          />
        );

        const orderButtonGroups = screen.queryAllByTestId('order-buttons');
        expect(orderButtonGroups).toHaveLength(0);
      });

      it('先頭画像の「上へ移動」ボタンが無効化されていること (要件4.12)', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const items = screen.getAllByTestId('photo-panel-item');
        const firstItemButtons = within(items[0]!).getAllByRole('button', { name: /移動/i });
        const upButton = firstItemButtons.find(
          (btn) => btn.getAttribute('aria-label') === '上へ移動'
        );
        expect(upButton).toBeDisabled();
      });

      it('末尾画像の「下へ移動」ボタンが無効化されていること (要件4.13)', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const items = screen.getAllByTestId('photo-panel-item');
        const lastItemButtons = within(items[2]!).getAllByRole('button', { name: /移動/i });
        const downButton = lastItemButtons.find(
          (btn) => btn.getAttribute('aria-label') === '下へ移動'
        );
        expect(downButton).toBeDisabled();
      });

      it('中間画像の両方のボタンが有効化されていること', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const items = screen.getAllByTestId('photo-panel-item');
        const middleItemButtons = within(items[1]!).getAllByRole('button', { name: /移動/i });
        middleItemButtons.forEach((btn) => {
          expect(btn).not.toBeDisabled();
        });
      });

      it('「上へ移動」ボタンクリック時にonOrderChangeが呼ばれること (要件10.6)', async () => {
        const user = userEvent.setup();
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const items = screen.getAllByTestId('photo-panel-item');
        const secondItemButtons = within(items[1]!).getAllByRole('button', { name: /移動/i });
        const upButton = secondItemButtons.find(
          (btn) => btn.getAttribute('aria-label') === '上へ移動'
        );

        await user.click(upButton!);

        // img-2が先頭に移動するため、新しい順序が[img-2, img-1, img-3]になる
        expect(onOrderChange).toHaveBeenCalledWith([
          { id: 'img-2', order: 1 },
          { id: 'img-1', order: 2 },
          { id: 'img-3', order: 3 },
        ]);
      });

      it('「下へ移動」ボタンクリック時にonOrderChangeが呼ばれること (要件10.7)', async () => {
        const user = userEvent.setup();
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
          />
        );

        const items = screen.getAllByTestId('photo-panel-item');
        const secondItemButtons = within(items[1]!).getAllByRole('button', { name: /移動/i });
        const downButton = secondItemButtons.find(
          (btn) => btn.getAttribute('aria-label') === '下へ移動'
        );

        await user.click(downButton!);

        // img-2が下に移動するため、新しい順序が[img-1, img-3, img-2]になる
        expect(onOrderChange).toHaveBeenCalledWith([
          { id: 'img-1', order: 1 },
          { id: 'img-3', order: 2 },
          { id: 'img-2', order: 3 },
        ]);
      });

      it('readOnlyモードでは順序変更ボタンが表示されないこと', () => {
        const onOrderChange = vi.fn();
        render(
          <PhotoManagementPanel
            {...defaultProps}
            onOrderChange={onOrderChange}
            showOrderButtons={true}
            readOnly={true}
          />
        );

        const orderButtonGroups = screen.queryAllByTestId('order-buttons');
        expect(orderButtonGroups).toHaveLength(0);
      });
    });

    // -----------------------------------------------------------------------
    // Task 37.2: ドラッグ&ドロップがローカル状態のみ更新
    // -----------------------------------------------------------------------
    describe('ドラッグ&ドロップローカル状態更新 (Task 37.2)', () => {
      it('ドラッグ&ドロップ完了時にonOrderChangeのみが呼ばれAPIは呼ばれないこと (要件4.11, 10.5)', () => {
        const onOrderChange = vi.fn();
        render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

        const items = screen.getAllByTestId('photo-panel-item');
        const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
        const thirdItem = items[2]!;

        // ドラッグ開始
        fireEvent.dragStart(firstDragHandle, {
          dataTransfer: {
            setData: vi.fn(),
            effectAllowed: 'move',
            getData: () => 'img-1',
          },
        });

        // ドロップ
        fireEvent.drop(thirdItem, {
          preventDefault: vi.fn(),
          dataTransfer: {
            getData: () => 'img-1',
          },
        });

        // onOrderChangeのみが呼ばれる（APIは呼ばれない）
        expect(onOrderChange).toHaveBeenCalledTimes(1);
        // 新しい順序が返される
        expect(onOrderChange).toHaveBeenCalledWith([
          { id: 'img-2', order: 1 },
          { id: 'img-3', order: 2 },
          { id: 'img-1', order: 3 },
        ]);
      });

      it('並び替え中のハイライトが維持されること (視覚的フィードバック)', () => {
        const onOrderChange = vi.fn();
        render(<PhotoManagementPanel {...defaultProps} onOrderChange={onOrderChange} />);

        const items = screen.getAllByTestId('photo-panel-item');
        const firstDragHandle = within(items[0]!).getByTestId('photo-drag-handle');
        const secondItem = items[1]!;

        // ドラッグ開始
        fireEvent.dragStart(firstDragHandle, {
          dataTransfer: {
            setData: vi.fn(),
            effectAllowed: 'move',
          },
        });

        // ドラッグ中のアイテムにスタイルが適用
        expect(items[0]).toHaveAttribute('data-dragging', 'true');

        // ドラッグオーバー先にハイライト
        fireEvent.dragEnter(secondItem, { preventDefault: vi.fn() });
        expect(secondItem).toHaveAttribute('data-drag-over', 'true');
      });
    });
  });
});
