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

  it('オーバーレイ余白のクリックでonCloseが呼ばれる (R14.5)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    // オーバーレイ自身（target===currentTarget）をクリックすると閉じる
    fireEvent.click(screen.getByTestId('construction-photo-viewer-overlay'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('画像読み込み完了で原寸が確定しステージ寸法がフィット後サイズへ更新される (R14.1)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const img = screen.getByRole('img');
    const wrapper = img.parentElement as HTMLElement;
    const widthBefore = wrapper.style.width;

    // onLoad を発火して原寸を確定させる（jsdom では naturalWidth=0 のためフォールバック寸法が使われる）
    fireEvent.load(img);

    // 原寸確定後はフィット倍率が反映され、ステージ幅がフォールバックのコンテナ幅から変化する
    expect(wrapper.style.width).not.toBe(widthBefore);
  });

  it('全体表示ボタン操作で等倍へ戻りパン位置が初期化される (R14.2)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const zoomIn = screen.getByRole('button', { name: 'ズームイン' });
    for (let i = 0; i < 5; i += 1) fireEvent.click(zoomIn);

    // 拡大後にドラッグしてパンを発生させる
    const stage = screen.getByTestId('construction-photo-viewer-stage');
    fireEvent.mouseDown(stage, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(stage, { clientX: 160, clientY: 150 });
    fireEvent.mouseUp(stage, { clientX: 160, clientY: 150 });

    expect(screen.getByTestId('zoom-badge')).not.toHaveTextContent('100%');

    fireEvent.click(screen.getByRole('button', { name: '全体表示' }));

    const img = screen.getByRole('img');
    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('100%');
    expect(img.style.transform).toContain('translate(0px, 0px)');
  });

  it('左マウスボタン以外のmousedownはパンを開始しない (R14.4)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const zoomIn = screen.getByRole('button', { name: 'ズームイン' });
    for (let i = 0; i < 5; i += 1) fireEvent.click(zoomIn);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    const img = screen.getByRole('img');
    const before = img.style.transform;

    // 右ボタン(button=2)ではドラッグ開始しないため、後続のmousemoveでもパンしない
    fireEvent.mouseDown(stage, { button: 2, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(stage, { clientX: 200, clientY: 200 });

    expect(img.style.transform).toBe(before);
  });

  it('マウスホイールで中心基準にズームする', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    fireEvent.wheel(stage, { deltaY: -100 });

    // -deltaY*0.001 = +0.1 → 1.0 から 1.1 へ拡大
    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('110%');
  });

  it('マウスホイールを下方向に回すと縮小する', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    fireEvent.wheel(stage, { deltaY: 100 });

    // deltaY=100 → -0.1 → 0.9 倍
    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('90%');
  });

  it('2本指ピンチ操作でズーム倍率が変化する (R14.2)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    const stage = screen.getByTestId('construction-photo-viewer-stage');

    // 2本指: 開始時の指間距離100 → 移動後200（scaleFactor=2）
    fireEvent.touchStart(stage, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 100, clientY: 0 },
      ],
    });
    fireEvent.touchMove(stage, {
      touches: [
        { clientX: 0, clientY: 0 },
        { clientX: 200, clientY: 0 },
      ],
    });

    // zoom = 1 * 2 = 2 → 200%
    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('200%');

    // 全指を離すとピンチ状態がリセットされる（例外なく完了する）
    fireEvent.touchEnd(stage, { touches: [] });
    expect(screen.getByTestId('zoom-badge')).toHaveTextContent('200%');
  });

  it('拡大時の1本指ドラッグで表示位置がパンする (R14.4)', () => {
    render(<ConstructionPhotoImageViewer imageUrl="blob:mock-original-1" onClose={onClose} />);

    // パンはズーム>1.01でのみ有効
    const zoomIn = screen.getByRole('button', { name: 'ズームイン' });
    for (let i = 0; i < 5; i += 1) fireEvent.click(zoomIn);

    const stage = screen.getByTestId('construction-photo-viewer-stage');
    const img = screen.getByRole('img');

    const extractTranslate = (transform: string): { x: number; y: number } => {
      const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return { x: parseFloat(match?.[1] ?? '0'), y: parseFloat(match?.[2] ?? '0') };
    };
    const before = extractTranslate(img.style.transform);

    fireEvent.touchStart(stage, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(stage, { touches: [{ clientX: 150, clientY: 140 }] });
    fireEvent.touchEnd(stage, { touches: [] });

    const after = extractTranslate(img.style.transform);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });
});
