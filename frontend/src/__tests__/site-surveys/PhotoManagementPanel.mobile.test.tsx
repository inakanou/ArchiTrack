/**
 * @fileoverview PhotoManagementPanel モバイル表示最適化テスト
 *
 * Task 100.1: PhotoManagementPanel のモバイル縦積み・入力/タッチ最適化
 *
 * Requirements:
 * - 35.1: モバイル幅で写真・コメント・フラグ・並替/削除を水平あふれしない配置（縦積み）
 * - 35.2: 水平はみ出し不発生（metadataSection の minWidth:0 で吸収）
 * - 35.3: 写真の表示幅を画面幅に収まる可変幅（固定320px解除）
 * - 35.4: 入力系コントロールのフォントサイズ16px以上（フォーカス時自動ズーム抑止）
 * - 35.5: 操作系コントロール（チェックボックス・並替・削除）のタップ領域44px以上
 * - 35.6: モバイル幅でも Req10 の機能挙動（未保存管理・一括保存・並替・削除）を維持
 * - 35.7: デスクトップ幅の既存レイアウト・挙動を維持
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PhotoManagementPanel } from '../../components/site-surveys/PhotoManagementPanel';
import type { SurveyImageInfo } from '../../types/site-survey.types';

// 注釈取得APIをモック化（画面オープン時のN+1抑止の配線検証用）
vi.mock('../../api/survey-annotations', () => ({
  getAnnotation: vi.fn(),
}));

// useMediaQuery をモック化（isMobile 判定をテストから制御）
vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../hooks/useMediaQuery';

// ============================================================================
// テストデータ / ヘルパ
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
  mediumUrl: `https://example.com/medium/${id}.jpg`,
  fileName: `image-${id}.jpg`,
  fileSize: 1024 * 500,
  width: 800,
  height: 600,
  displayOrder,
  createdAt: '2025-01-01T00:00:00.000Z',
  comment: null,
  includeInReport: false,
  ...options,
});

const mockImages: SurveyImageInfo[] = [
  createMockImage('img-1', 1, { comment: '施工箇所A', includeInReport: true }),
  createMockImage('img-2', 2),
  createMockImage('img-3', 3, { comment: '仕上げ確認', includeInReport: true }),
];

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

const baseProps = {
  images: mockImages,
  onImageMetadataChange: vi.fn(),
  onImageClick: vi.fn(),
  onOrderChange: vi.fn(),
  onDelete: vi.fn(async () => {}),
};

// ============================================================================
// テスト本体
// ============================================================================

describe('PhotoManagementPanel モバイル表示最適化 (Task 100.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  describe('モバイル幅（isMobile=true）', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
    });

    it('Req35.1/35.3: 写真＋コメント行を縦積み(column)化し、写真列を可変幅(100%)にすること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const items = screen.getAllByTestId('photo-panel-item');
      // 縦積み（flexDirection: column）
      expect(items[0]!.style.flexDirection).toBe('column');

      // 写真列（imageSection）は固定320pxを解除して可変幅（100%）
      const imageButton = within(items[0]!).getByTestId('photo-image-button');
      const imageSection = imageButton.parentElement as HTMLElement;
      expect(imageSection.style.width).toBe('100%');
    });

    it('Req35.2: コメント側（metadataSection）に minWidth:0 を付与して水平はみ出しを解消すること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const heading = screen.getAllByRole('heading', { level: 3 })[0]!;
      const metadataSection = heading.parentElement as HTMLElement;
      // 明示的に min-width:0 を付与していること（既定の '' ではなく）
      expect(metadataSection.style.minWidth).toBe('0px');
    });

    it('Req35.4: コメント入力欄のフォントサイズを16px以上にすること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const textareas = screen.getAllByRole('textbox');
      textareas.forEach((ta) => {
        expect(pxValue((ta as HTMLElement).style.fontSize)).toBeGreaterThanOrEqual(16);
      });
    });

    it('Req35.5: 報告書出力フラグのチェックボックスのタップ領域を44px以上にすること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const checkbox = screen.getAllByRole('checkbox')[0] as HTMLElement;
      expect(tapWidth(checkbox)).toBeGreaterThanOrEqual(44);
      expect(tapHeight(checkbox)).toBeGreaterThanOrEqual(44);
    });

    it('Req35.5: 並び替えボタン（上へ/下へ移動）のタップ領域を44px以上にすること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const upButton = screen.getAllByLabelText('上へ移動')[0] as HTMLElement;
      const downButton = screen.getAllByLabelText('下へ移動')[0] as HTMLElement;
      expect(tapWidth(upButton)).toBeGreaterThanOrEqual(44);
      expect(tapHeight(upButton)).toBeGreaterThanOrEqual(44);
      expect(tapWidth(downButton)).toBeGreaterThanOrEqual(44);
      expect(tapHeight(downButton)).toBeGreaterThanOrEqual(44);
    });

    it('Req35.5: 削除ボタンのタップ領域を44px以上にすること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const deleteButton = screen.getAllByLabelText(/画像を削除/)[0] as HTMLElement;
      expect(tapWidth(deleteButton)).toBeGreaterThanOrEqual(44);
      expect(tapHeight(deleteButton)).toBeGreaterThanOrEqual(44);
    });

    it('Req35.6: モバイル幅でも報告書出力フラグ操作が Req10 挙動（メタデータ変更通知）を維持すること', () => {
      const onImageMetadataChange = vi.fn();
      render(
        <PhotoManagementPanel {...baseProps} onImageMetadataChange={onImageMetadataChange} />
      );

      const checkbox = screen.getAllByRole('checkbox')[1] as HTMLElement; // img-2 (未選択)
      checkbox.click();

      expect(onImageMetadataChange).toHaveBeenCalledWith('img-2', { includeInReport: true });
    });

    it('Req35.6: モバイル幅でも並び替え操作が Req10 挙動（順序変更通知）を維持すること', () => {
      const onOrderChange = vi.fn();
      render(<PhotoManagementPanel {...baseProps} onOrderChange={onOrderChange} />);

      // 2番目(img-2)を上へ移動 → img-2, img-1, img-3
      const items = screen.getAllByTestId('photo-panel-item');
      const upButton = within(items[1]!).getByLabelText('上へ移動');
      upButton.click();

      expect(onOrderChange).toHaveBeenCalledWith([
        { id: 'img-2', order: 1 },
        { id: 'img-1', order: 2 },
        { id: 'img-3', order: 3 },
      ]);
    });
  });

  describe('デスクトップ幅（isMobile=false）- Req35.7 既存レイアウト維持', () => {
    beforeEach(() => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
    });

    it('Req35.7: 横並び（flexDirection未指定=row）で写真列は固定320pxを維持すること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const items = screen.getAllByTestId('photo-panel-item');
      // デスクトップは縦積みしない（column を付与しない）
      expect(items[0]!.style.flexDirection).not.toBe('column');

      const imageButton = within(items[0]!).getByTestId('photo-image-button');
      const imageSection = imageButton.parentElement as HTMLElement;
      expect(imageSection.style.width).toBe('320px');
    });

    it('Req35.7: コメント入力欄のフォントサイズを現行(14px)のまま維持すること', () => {
      render(<PhotoManagementPanel {...baseProps} />);

      const textarea = screen.getAllByRole('textbox')[0] as HTMLElement;
      expect(textarea.style.fontSize).toBe('14px');
    });
  });
});
