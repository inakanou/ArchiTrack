/**
 * @fileoverview 工事写真 閲覧専用画像ビューアのテスト
 *
 * Task 11.2: 閲覧専用画像ビューア＋ビューアページ＋ルート
 *
 * ConstructionPhotoImageViewer は site-survey の画像ビューア基盤
 * （useCanvasViewport / ZoomControls / gestures(canvasViewportController) / imageFitScale）
 * と90度単位の回転状態を合成した閲覧専用ビューア（注釈編集は持たない）。
 * jsdom では Fabric/canvas の実描画が困難なため、ズーム・回転・パンの状態遷移と
 * 閉じる操作のロジックを中心に検証する。
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConstructionPhotoImageViewer from './ConstructionPhotoImageViewer';

describe('ConstructionPhotoImageViewer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('原本画像URLが渡されるとフルスクリーンで画像を表示する (R14.1)', () => {
    render(
      <ConstructionPhotoImageViewer
        imageUrl="blob:mock-original-1"
        imageName="photo-1.jpg"
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'photo-1.jpg' });
    expect(img).toHaveAttribute('src', 'blob:mock-original-1');
  });

  it('読み込み中は画像を表示せずローディング表示を出す', () => {
    render(<ConstructionPhotoImageViewer imageUrl={null} isLoading onClose={onClose} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示する', () => {
    render(
      <ConstructionPhotoImageViewer
        imageUrl={null}
        error="原本画像の取得に失敗しました"
        onClose={onClose}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('原本画像の取得に失敗しました');
  });

  it('ズームインボタン操作で表示倍率が拡大する (R14.2)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');

    fireEvent.click(screen.getByRole('button', { name: 'ズームイン' }));

    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('110%');
  });

  it('ズームアウトボタン操作で表示倍率が縮小する (R14.2)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'ズームアウト' }));

    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('90%');
  });

  it('回転ボタン操作で90度単位に回転する (R14.3)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    expect(screen.getByTestId('rotation-display')).toHaveTextContent('0°');

    fireEvent.click(screen.getByRole('button', { name: '右に回転' }));
    expect(screen.getByTestId('rotation-display')).toHaveTextContent('90°');

    fireEvent.click(screen.getByRole('button', { name: '右に回転' }));
    expect(screen.getByTestId('rotation-display')).toHaveTextContent('180°');

    fireEvent.click(screen.getByRole('button', { name: '左に回転' }));
    expect(screen.getByTestId('rotation-display')).toHaveTextContent('90°');
  });

  it('回転が270度から右回転すると0度に正規化される (R14.3)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const rotateRight = screen.getByRole('button', { name: '右に回転' });
    fireEvent.click(rotateRight); // 90
    fireEvent.click(rotateRight); // 180
    fireEvent.click(rotateRight); // 270
    expect(screen.getByTestId('rotation-display')).toHaveTextContent('270°');
    fireEvent.click(rotateRight); // 360 -> 0
    expect(screen.getByTestId('rotation-display')).toHaveTextContent('0°');
  });

  it('拡大時にドラッグすると表示位置がパンする (R14.4)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    // 等倍のままではパン不可（MIN_PAN_ZOOM=1.01超で有効）: 十分な倍率まで拡大する
    const zoomIn = screen.getByRole('button', { name: 'ズームイン' });
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    const img = screen.getByRole('img');
    const transformBefore = img.style.transform;

    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(stage, { clientX: 150, clientY: 140 });
    fireEvent.mouseUp(stage, { clientX: 150, clientY: 140 });

    const transformAfter = img.style.transform;
    expect(transformAfter).not.toBe(transformBefore);

    const extractTranslate = (transform: string): { x: number; y: number } => {
      const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return { x: parseFloat(match?.[1] ?? '0'), y: parseFloat(match?.[2] ?? '0') };
    };
    const before = extractTranslate(transformBefore);
    const after = extractTranslate(transformAfter);

    // カーソルは右へ50px・下へ40px移動しているので、パンも同方向に変化する
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });

  it('等倍のままドラッグしても表示位置は変化しない (R14.4 While条件)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    const img = screen.getByRole('img');
    const transformBefore = img.style.transform;

    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(stage, { clientX: 150, clientY: 140 });
    fireEvent.mouseUp(stage, { clientX: 150, clientY: 140 });

    expect(img.style.transform).toBe(transformBefore);
  });

  it('閉じるボタン操作でonCloseが呼ばれる (R14.5)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escapeキー操作でonCloseが呼ばれる (R14.5)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
