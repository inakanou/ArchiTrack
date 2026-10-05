/**
 * @fileoverview 看板配置エディタ（SignboardPlacementEditor）のテスト
 *
 * Task 6.4: 看板配置エディタ
 *
 * fabric の描画自体は JSDOM で困難なため fabric をモックし、
 * コンポーネントの props/コールバック契約を検証する。座標換算の正しさは
 * 純関数 signboard-placement-geometry のテストで担保する。
 *
 * 検証:
 * - (b) ドラッグ/拡縮後 onChange/onSave で正しい SignboardPlacement を返す
 * - (c) 看板未指定時は placement null を許容し Rect を表示しない
 * - (d) 初期 placement があれば表示座標へ復元して Rect を配置する
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 * Boundary: SignboardPlacementEditor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type {
  ConstructionPhotoWithUrls,
  ConstructionSignboard,
  SignboardPlacement,
} from '../../types/construction-photo.types';

// ============================================================================
// fabric モック
// ============================================================================

const { mockCanvasInstance, mockFromURL, rectInstances, addedObjects, mockFabricImageInstance } =
  vi.hoisted(() => {
    const registeredHandlers = new Map<string, (...args: unknown[]) => void>();
    const addedObjects: unknown[] = [];
    const rectInstances: unknown[] = [];

    const mockCanvasInstance = {
      setDimensions: vi.fn(),
      backgroundImage: null as unknown,
      renderAll: vi.fn(),
      requestRenderAll: vi.fn(),
      dispose: vi.fn(),
      add: vi.fn((obj: unknown) => {
        addedObjects.push(obj);
      }),
      remove: vi.fn((obj: unknown) => {
        const idx = addedObjects.indexOf(obj);
        if (idx >= 0) addedObjects.splice(idx, 1);
      }),
      clear: vi.fn(),
      getObjects: vi.fn(() => addedObjects),
      setActiveObject: vi.fn(),
      on: vi.fn((eventName: string, handler: (...args: unknown[]) => void) => {
        registeredHandlers.set(eventName, handler);
      }),
      off: vi.fn((eventName: string) => {
        registeredHandlers.delete(eventName);
      }),
      __getHandler: (eventName: string): ((...args: unknown[]) => void) | undefined =>
        registeredHandlers.get(eventName),
      __clearHandlers: () => registeredHandlers.clear(),
    };

    const mockFabricImageInstance = {
      set: vi.fn(),
      scaleToWidth: vi.fn(),
      width: 2000,
      height: 1000,
    };
    const mockFromURL = vi.fn((_url: string) => Promise.resolve(mockFabricImageInstance));

    return {
      mockCanvasInstance,
      mockFromURL,
      rectInstances,
      addedObjects,
      mockFabricImageInstance,
    };
  });

// 背景の原本の取得（タスク 26.1）。既定は写真ごとに別の Blob を返して成功する
const { mockGetOriginalImage } = vi.hoisted(() => ({
  mockGetOriginalImage: vi.fn((_imageId: string) => Promise.resolve(new Blob(['original']))),
}));
vi.mock('../../api/construction-photo-images', () => ({
  getConstructionPhotoOriginalImage: mockGetOriginalImage,
}));

vi.mock('fabric', () => {
  function MockCanvas() {
    return mockCanvasInstance;
  }

  class MockRect {
    left = 0;
    top = 0;
    width = 0;
    height = 0;
    scaleX = 1;
    scaleY = 1;
    constructor(options?: Record<string, unknown>) {
      if (options) Object.assign(this, options);
      rectInstances.push(this);
    }
    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') (this as Record<string, unknown>)[options] = value;
      else Object.assign(this, options);
      return this;
    }
    setCoords(): void {}
  }

  return {
    Canvas: MockCanvas,
    Rect: MockRect,
    FabricImage: { fromURL: mockFromURL },
  };
});

vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

// 置かれた場所の幅（タスク 25.1）。既定は未計測（0）で、従来どおり最大表示幅で描く
vi.mock('../../hooks/useElementSize', () => ({
  default: vi.fn(() => ({ width: 0, height: 0 })),
}));

import SignboardPlacementEditor from './SignboardPlacementEditor';
import useMediaQuery from '../../hooks/useMediaQuery';
import useElementSize from '../../hooks/useElementSize';

// ============================================================================
// フィクスチャ
// ============================================================================

const photo: ConstructionPhotoWithUrls = {
  id: 'photo-1',
  albumId: 'album-1',
  fileName: 'p.jpg',
  fileSize: 1000,
  width: 2000,
  height: 1000,
  displayOrder: 1,
  comment: null,
  includeInReport: false,
  signboardId: null,
  signboardPlacement: null,
  thumbnailUrl: 'https://example.com/thumb.jpg',
  printImageUrl: 'https://example.com/print.jpg',
  createdAt: '2026-07-27T00:00:00.000Z',
};

const signboard: ConstructionSignboard = {
  id: 'sb-1',
  projectId: 'proj-1',
  workName: '工事件名',
  workLocation: '工事場所',
  freeItems: [],
  footerText: null,
  inUseCount: 0,
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

beforeEach(() => {
  rectInstances.length = 0;
  addedObjects.length = 0;
  mockCanvasInstance.__clearHandlers();
  vi.clearAllMocks();
  // 既定はデスクトップ幅。テストの順序に依存しないよう毎回戻す
  vi.mocked(useMediaQuery).mockReturnValue(false);
  vi.mocked(useElementSize).mockReturnValue({ width: 0, height: 0 });
  mockCanvasInstance.backgroundImage = null;
  mockGetOriginalImage.mockImplementation(() => Promise.resolve(new Blob(['original'])));
  // jsdom は object URL を持たないため、作るたびに別の値を返す差し替えを置く（タスク 26.1）
  let objectUrlSeq = 0;
  URL.createObjectURL = vi.fn(() => `blob:original-${++objectUrlSeq}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe('SignboardPlacementEditor', () => {
  it('(c) 看板未指定なら Rect を配置せず、保存で placement null を返す', async () => {
    const onSave = vi.fn();
    render(<SignboardPlacementEditor photo={photo} signboard={null} onSave={onSave} />);

    await waitFor(() => expect(mockFromURL).toHaveBeenCalled());
    expect(rectInstances.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('(b) 看板ありでドラッグ/拡縮後 onChange と保存が画像px座標の placement を返す', async () => {
    // maxDisplayWidth=600, 画像2000幅 → scale=0.3
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        onChange={onChange}
        onSave={onSave}
      />
    );

    await waitFor(() => expect(rectInstances.length).toBe(1));
    const rect = rectInstances[0] as {
      left: number;
      top: number;
      width: number;
      height: number;
      scaleX: number;
      scaleY: number;
    };

    // ユーザーがドラッグ/拡縮した結果の表示座標を模擬
    rect.left = 30;
    rect.top = 60;
    rect.width = 90;
    rect.height = 45;
    rect.scaleX = 1;
    rect.scaleY = 1;

    const handler = mockCanvasInstance.__getHandler('object:modified');
    expect(handler).toBeTypeOf('function');
    handler!({ target: rect });

    const expected: SignboardPlacement = { left: 100, top: 200, width: 300, height: 150 };
    expect(onChange).toHaveBeenLastCalledWith(expected);

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenLastCalledWith(expected);
  });

  it('(d) 初期 placement があれば表示座標へ復元した Rect を配置する', async () => {
    const initialPlacement: SignboardPlacement = {
      left: 200,
      top: 100,
      width: 600,
      height: 300,
    };
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        initialPlacement={initialPlacement}
      />
    );

    await waitFor(() => expect(rectInstances.length).toBe(1));
    const rect = rectInstances[0] as { left: number; top: number; width: number; height: number };
    // scale=0.3 で復元 → 表示座標
    expect(rect.left).toBeCloseTo(60, 5);
    expect(rect.top).toBeCloseTo(30, 5);
    expect(rect.width).toBeCloseTo(180, 5);
    expect(rect.height).toBeCloseTo(90, 5);
  });

  it('R19.1: 区切りの無い長い工事件名でも操作列を折り返せ、バッジの件名を折り返すこと', async () => {
    // 英数字の一語の件名は折り返し位置を持たない（タスク 20.4。実寸の主張は E2E が担う）
    const workName = 'SignboardWorkName1759300000000WithoutAnyBreakOpportunityForMobileToolbar';
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={{ ...signboard, workName }}
        maxDisplayWidth={600}
      />
    );

    await waitFor(() => expect(rectInstances.length).toBe(1));
    const badge = screen.getByTestId('signboard-indicator');
    expect(badge).toHaveTextContent(workName);
    expect(badge.style.overflowWrap).toBe('anywhere');
    const toolbar = badge.parentElement as HTMLElement;
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '保存' }));
    expect(toolbar.style.flexWrap).toBe('wrap');
  });

  // タスク 24.4: 利用者の判断（2026-10-04）で、看板を選んだときに既定の配置を与える。既定の配置は、
  // 初期配置の無いときに表示している既定の矩形を画像の座標へ換算したもの（表示されている位置が
  // そのまま保存される）。ドラッグせずに保存すると、従来は配置が null のまま保存され、印字画像と
  // PDF に看板が重ならなかった
  describe('看板の配置の既定値（タスク 24.4）', () => {
    type MockRectShape = {
      left: number;
      top: number;
      width: number;
      height: number;
      scaleX: number;
      scaleY: number;
    };

    it('REQ-9.1: 初期配置の無い写真項目で看板を選び、ドラッグせずに保存すると、表示している既定の矩形を画像の座標へ換算した配置を返す', async () => {
      // 画像 2000×1000、最大表示幅 600 → scale=0.3、表示 600×300。
      // 既定の矩形は表示の 40%×25% を中央に置く → 表示 left=180, top=112.5, 240×75
      // → 画像の座標 left=600, top=375, 800×250
      const onSave = vi.fn();
      render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );

      await waitFor(() => expect(rectInstances.length).toBe(1));
      const rect = rectInstances[0] as MockRectShape;
      // 表示している矩形（検証の側で綴った既定の位置）
      expect(rect.left).toBeCloseTo(180, 5);
      expect(rect.top).toBeCloseTo(112.5, 5);
      expect(rect.width).toBeCloseTo(240, 5);
      expect(rect.height).toBeCloseTo(75, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      const expected: SignboardPlacement = { left: 600, top: 375, width: 800, height: 250 };
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(expected);
    });

    it('REQ-9.1: 端数の出る寸法でも、保存される配置は表示している矩形を換算の規約（scale で割って整数へ丸める）で写したものと一致する', async () => {
      // 4032×3024 の写真、最大表示幅 600 → scale=600/4032（割り切れない）
      const oddPhoto: ConstructionPhotoWithUrls = { ...photo, width: 4032, height: 3024 };
      const onSave = vi.fn();
      render(
        <SignboardPlacementEditor
          photo={oddPhoto}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );

      await waitFor(() => expect(rectInstances.length).toBe(1));
      const rect = rectInstances[0] as MockRectShape;
      const scale = 600 / 4032;

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenCalledWith({
        left: Math.round(rect.left / scale),
        top: Math.round(rect.top / scale),
        width: Math.round((rect.width * rect.scaleX) / scale),
        height: Math.round((rect.height * rect.scaleY) / scale),
      });
      // 自明な 0 や null でないこと（検証の側で計算した値: 180/s=1209.6→1210 等）
      expect(onSave).toHaveBeenCalledWith({ left: 1210, top: 1134, width: 1613, height: 756 });
    });

    it('REQ-9.1: 未指定から看板を選び直したときも、ドラッグせずに保存すると既定の配置を返す', async () => {
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={null}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(mockFromURL).toHaveBeenCalled());

      rerender(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBe(1));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 600, top: 375, width: 800, height: 250 });
    });

    it('REQ-9.3: ドラッグの後に親が同じ props で再描画しても、保存はドラッグ後の配置を返す（既定へ戻さない）', async () => {
      const onSave = vi.fn();
      const element = (
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );
      const { rerender } = render(element);
      await waitFor(() => expect(rectInstances.length).toBe(1));
      const rect = rectInstances[0] as MockRectShape;

      // ドラッグの確定（scale=0.3 → 画像の座標 100/200/300/150）
      rect.left = 30;
      rect.top = 60;
      rect.width = 90;
      rect.height = 45;
      rect.scaleX = 1;
      rect.scaleY = 1;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      // 親の再描画（看板の一覧の再取得など）。props の値は同じで、オブジェクトも同じ参照
      rerender(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 100, top: 200, width: 300, height: 150 });
    });

    it('既に配置のある写真項目の再編集では、ドラッグせずに保存すると既存の配置を保つ', async () => {
      const initialPlacement: SignboardPlacement = { left: 200, top: 100, width: 600, height: 300 };
      const onSave = vi.fn();
      render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          initialPlacement={initialPlacement}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBe(1));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenCalledWith(initialPlacement);
    });

    it('看板を未指定へ戻して保存すると、従来どおり配置は null を返す', async () => {
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBe(1));

      rerender(
        <SignboardPlacementEditor
          photo={photo}
          signboard={null}
          maxDisplayWidth={600}
          onSave={onSave}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith(null);
    });
  });

  // タスク 25.1: 利用者の判断（2026-10-04）で、画像の枠を置かれた場所の幅（モバイル幅のダイアログの
  // 本体の内側）へ縮める。表示の縮尺が変わるだけで、保存される配置は画像の座標のままである。
  // 枠線（左右 1px）の分を差し引いた幅を上限にする。使える幅は検証の側で綴る
  describe('画像の枠の幅の追従（タスク 25.1）', () => {
    type MockRectShape = {
      left: number;
      top: number;
      width: number;
      height: number;
      scaleX: number;
      scaleY: number;
    };
    const lastOf = <T,>(items: readonly T[]): T => items[items.length - 1] as T;
    const lastDimensions = (): { width: number; height: number } =>
      lastOf(mockCanvasInstance.setDimensions.mock.calls)[0] as { width: number; height: number };

    it('REQ-19.1: 置かれた場所の幅（295）が最大表示幅より狭いと、画像の枠を枠線の内側（293）へ縮める', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));

      expect(lastDimensions().width).toBe(293);
      expect(lastDimensions().height).toBeCloseTo(146.5, 5);
    });

    it('デスクトップ幅（置かれた場所の幅 672）では、画像の枠は従来どおり最大表示幅 600 のまま', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 672, height: 400 });
      render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));

      expect(lastDimensions()).toEqual({ width: 600, height: 300 });
    });

    it('寸法の解決に失敗した写真でも、画像の枠は置かれた場所の幅を超えない', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 240, height: 400 });
      render(
        <SignboardPlacementEditor
          photo={{ ...photo, width: 0, height: 0 }}
          signboard={signboard}
          onSave={vi.fn()}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));

      expect(lastDimensions()).toEqual({ width: 238, height: 238 });
    });

    it('REQ-9.1: 縮めた縮尺でも、看板を選んで動かさずに保存した配置は画像の座標で既定の比率（0.3W・0.375H・0.4W・0.25H）になる', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      const onSave = vi.fn();
      render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />);
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      // 表示している既定の矩形は縮めた枠（293×146.5）の中央 40%×25%
      expect(rect.left).toBeCloseTo(293 * 0.3, 5);
      expect(rect.width).toBeCloseTo(293 * 0.4, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      const saved = lastOf(onSave.mock.calls)[0] as SignboardPlacement;
      expect(Math.abs(saved.left - 600)).toBeLessThanOrEqual(1);
      expect(Math.abs(saved.top - 375)).toBeLessThanOrEqual(1);
      expect(Math.abs(saved.width - 800)).toBeLessThanOrEqual(1);
      expect(Math.abs(saved.height - 250)).toBeLessThanOrEqual(1);
    });

    it('REQ-9.3: 縮めた縮尺でドラッグした配置は、新しい縮尺で画像の座標へ換算して返す', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      const onSave = vi.fn();
      render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />);
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      const scale = 293 / 2000;

      // 画像の座標 100/200/300/150 に当たる表示の座標
      rect.left = 100 * scale;
      rect.top = 200 * scale;
      rect.width = 300 * scale;
      rect.height = 150 * scale;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 100, top: 200, width: 300, height: 150 });
    });

    it('既存の配置の再編集では、縮めた縮尺で既存の配置を描き、動かさずに保存すると既存の配置を保つ', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      const initialPlacement: SignboardPlacement = { left: 200, top: 100, width: 600, height: 300 };
      const onSave = vi.fn();
      render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          initialPlacement={initialPlacement}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      const scale = 293 / 2000;
      expect(rect.left).toBeCloseTo(200 * scale, 5);
      expect(rect.width).toBeCloseTo(600 * scale, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith(initialPlacement);
    });

    it('REQ-9.3: ドラッグの後に置かれた場所の幅が変わっても（端末の回転など）、ドラッグ後の配置を新しい縮尺で描き、保存はドラッグ後の配置を返す', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      const narrow = 293 / 2000;
      rect.left = 100 * narrow;
      rect.top = 200 * narrow;
      rect.width = 300 * narrow;
      rect.height = 150 * narrow;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      // 横向きへの回転で使える幅が 602（枠線の内側 600）へ広がる
      const before = rectInstances.length;
      vi.mocked(useElementSize).mockReturnValue({ width: 602, height: 300 });
      rerender(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />);
      await waitFor(() => expect(lastDimensions().width).toBe(600));

      // 描き直した枠はドラッグ後の配置を新しい縮尺（0.3）で描く（既定の位置へ戻さない）
      expect(rectInstances.length).toBeGreaterThan(before);
      const redrawn = lastOf(rectInstances) as MockRectShape;
      expect(redrawn.left).toBeCloseTo(30, 5);
      expect(redrawn.top).toBeCloseTo(60, 5);
      expect(redrawn.width).toBeCloseTo(90, 5);
      expect(redrawn.height).toBeCloseTo(45, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 100, top: 200, width: 300, height: 150 });
    });

    // ドラッグの後でも、写真・初期配置が変わったときは確定値と枠を戻す（幅の変化とは区別する）
    it('ドラッグの後に別の写真項目へ切り替わると、枠と保存の値は新しい写真の既定の配置へ戻る', async () => {
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      // scale=0.3 で画像の座標 100/200/300/150 へドラッグ
      rect.left = 30;
      rect.top = 60;
      rect.width = 90;
      rect.height = 45;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      const before = rectInstances.length;
      const otherPhoto: ConstructionPhotoWithUrls = { ...photo, id: 'photo-2' };
      rerender(
        <SignboardPlacementEditor photo={otherPhoto} signboard={signboard} onSave={onSave} />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(before));

      // 描き直した枠は既定の矩形（表示 600×300 の中央 40%×25%）
      const redrawn = lastOf(rectInstances) as MockRectShape;
      expect(redrawn.left).toBeCloseTo(180, 5);
      expect(redrawn.top).toBeCloseTo(112.5, 5);
      expect(redrawn.width).toBeCloseTo(240, 5);
      expect(redrawn.height).toBeCloseTo(75, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 600, top: 375, width: 800, height: 250 });
    });

    it('ドラッグの後に初期配置が差し替わると、枠と保存の値は新しい初期配置になる', async () => {
      const first: SignboardPlacement = { left: 200, top: 100, width: 600, height: 300 };
      const second: SignboardPlacement = { left: 1000, top: 500, width: 400, height: 200 };
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          initialPlacement={first}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      rect.left = 30;
      rect.top = 60;
      rect.width = 90;
      rect.height = 45;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      const before = rectInstances.length;
      rerender(
        <SignboardPlacementEditor
          photo={photo}
          signboard={signboard}
          initialPlacement={second}
          onSave={onSave}
        />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(before));

      // 描き直した枠は新しい初期配置を scale=0.3 で写したもの
      const redrawn = lastOf(rectInstances) as MockRectShape;
      expect(redrawn.left).toBeCloseTo(300, 5);
      expect(redrawn.top).toBeCloseTo(150, 5);
      expect(redrawn.width).toBeCloseTo(120, 5);
      expect(redrawn.height).toBeCloseTo(60, 5);

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith(second);
    });

    it('幅が変わった後に看板を未指定にして選び直すと、従来どおり既定の配置へ戻る', async () => {
      vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 400 });
      const onSave = vi.fn();
      const { rerender } = render(
        <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />
      );
      await waitFor(() => expect(rectInstances.length).toBeGreaterThan(0));
      const rect = lastOf(rectInstances) as MockRectShape;
      const narrow = 293 / 2000;
      rect.left = 100 * narrow;
      rect.top = 200 * narrow;
      rect.width = 300 * narrow;
      rect.height = 150 * narrow;
      mockCanvasInstance.__getHandler('object:modified')!({ target: rect });

      vi.mocked(useElementSize).mockReturnValue({ width: 602, height: 300 });
      rerender(<SignboardPlacementEditor photo={photo} signboard={null} onSave={onSave} />);
      rerender(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={onSave} />);
      await waitFor(() => expect(lastDimensions().width).toBe(600));

      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(onSave).toHaveBeenLastCalledWith({ left: 600, top: 375, width: 800, height: 250 });
    });
  });

  // タスク 24.3: 利用者の判断（2026-10-04）で看板の配置のダイアログの操作ボタンを受入基準 19.3 の
  // 対象に含め、モバイル幅でのみ「保存」にタップ領域の下限を合成する。デスクトップ幅の寸法は
  // 変えない。44 は検証の側が自前で綴る（実装の定数を取り込まない）。実寸の主張は E2E が担う
  describe('「保存」のタップ領域（タスク 24.3）', () => {
    const px = (raw: string): number => {
      const parsed = parseFloat(raw);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    it('R19.3: モバイル幅では「保存」のタップ領域が 44×44 以上になる（看板の未指定・指定のどちらでも）', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      for (const target of [null, signboard]) {
        const { unmount } = render(
          <SignboardPlacementEditor photo={photo} signboard={target} onSave={vi.fn()} />
        );
        await waitFor(() => expect(mockFromURL).toHaveBeenCalled());
        const save = screen.getByRole('button', { name: '保存' });
        expect(Math.max(px(save.style.minWidth), px(save.style.width))).toBeGreaterThanOrEqual(44);
        expect(Math.max(px(save.style.minHeight), px(save.style.height))).toBeGreaterThanOrEqual(
          44
        );
        unmount();
      }
    });

    it('デスクトップ幅では「保存」にタップ領域の下限を合成しない（寸法を変えない）', async () => {
      vi.mocked(useMediaQuery).mockReturnValue(false);
      render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);
      await waitFor(() => expect(mockFromURL).toHaveBeenCalled());

      const save = screen.getByRole('button', { name: '保存' });
      expect(save.style.minWidth).toBe('');
      expect(save.style.minHeight).toBe('');
    });
  });
});

// タスク 26.1: 利用者の判断（2026-10-05）で、背景を非合成の原本の object URL にした。従来は
// サムネイル（200×200 の中央の切り抜き）を幅に合わせて敷いたため、見えている背景と写真の全体が
// 一致せず、置いた位置と印字画像の上の位置が食い違った。実寸での見え方の主張は E2E が担う
describe('背景の原本（タスク 26.1）', () => {
  /** 背景の画像の set に渡した縮尺（scaleX と scaleY を持つ最初の呼び出し） */
  const backgroundScaleOf = (
    setMock: ReturnType<typeof vi.fn>
  ): { scaleX: number; scaleY: number } | undefined =>
    (setMock.mock.calls as unknown as [Record<string, unknown>][])
      .map((call) => call[0])
      .find(
        (o): o is { scaleX: number; scaleY: number } =>
          typeof o.scaleX === 'number' && typeof o.scaleY === 'number'
      );

  it('REQ-9.3: 背景は写真項目の原本を取得した object URL で、サムネイルと印字画像の URL は使わない', async () => {
    render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);

    await waitFor(() => expect(mockFromURL).toHaveBeenCalled());
    expect(mockGetOriginalImage).toHaveBeenCalledWith('photo-1');
    const urls = mockFromURL.mock.calls.map((call) => call[0]);
    expect(urls).toEqual(['blob:original-1']);
    expect(urls).not.toContain(photo.thumbnailUrl);
    expect(urls).not.toContain(photo.printImageUrl);
  });

  it('REQ-9.3: 背景は画像の枠の全体へ写真の全体を合わせて敷く（幅だけで合わせない）', async () => {
    // 画像 2000×1000、最大表示幅 600 → 画像の枠は 600×300
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        onSave={vi.fn()}
      />
    );

    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance));
    const options = backgroundScaleOf(mockFabricImageInstance.set);
    expect(options).toBeDefined();
    expect(mockFabricImageInstance.width * options!.scaleX).toBeCloseTo(600);
    expect(mockFabricImageInstance.height * options!.scaleY).toBeCloseTo(300);
    expect(mockFabricImageInstance.scaleToWidth).not.toHaveBeenCalled();
  });

  it('REQ-9.3: 読み込んだ画像の縦横比が枠と違っても、枠の全体を写真の全体で埋める', async () => {
    // 正方形の画像（例: サムネイルの寸法）を 2000×1000 の写真の枠へ敷く場合でも、枠の高さで切らない
    const square = { ...mockFabricImageInstance, set: vi.fn(), width: 200, height: 200 };
    mockFromURL.mockImplementationOnce(() => Promise.resolve(square));
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        onSave={vi.fn()}
      />
    );

    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(square));
    const options = backgroundScaleOf(square.set);
    expect(options).toBeDefined();
    expect(200 * options!.scaleX).toBeCloseTo(600);
    expect(200 * options!.scaleY).toBeCloseTo(300);
  });

  it('写真を切り替えると前の object URL を手放し、新しい写真の原本で敷き直す', async () => {
    const other: ConstructionPhotoWithUrls = { ...photo, id: 'photo-2' };
    const { rerender } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    await waitFor(() => expect(mockFromURL).toHaveBeenCalledWith('blob:original-1'));

    rerender(<SignboardPlacementEditor photo={other} signboard={signboard} onSave={vi.fn()} />);
    await waitFor(() => expect(mockFromURL).toHaveBeenCalledWith('blob:original-2'));
    expect(mockGetOriginalImage).toHaveBeenLastCalledWith('photo-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:original-2');
  });

  it('破棄すると object URL を手放す', async () => {
    const { unmount } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    await waitFor(() => expect(mockFromURL).toHaveBeenCalledWith('blob:original-1'));

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original-1');
  });

  it('破棄の後に取得が終わっても object URL を作らない', async () => {
    let resolve: (blob: Blob) => void = () => {};
    mockGetOriginalImage.mockImplementationOnce(() => new Promise<Blob>((r) => (resolve = r)));
    const { unmount } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    await waitFor(() => expect(mockGetOriginalImage).toHaveBeenCalled());
    unmount();

    resolve(new Blob(['late']));
    await Promise.resolve();
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mockFromURL).not.toHaveBeenCalled();
  });

  it('原本の取得に失敗しても配置の操作は続けられ、背景を読めない旨を示す', async () => {
    mockGetOriginalImage.mockImplementationOnce(() => Promise.reject(new Error('503')));
    const onSave = vi.fn();
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        onSave={onSave}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('写真を読み込めませんでした');
    expect(mockFromURL).not.toHaveBeenCalled();
    expect(rectInstances.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith({ left: 600, top: 375, width: 800, height: 250 });
  });

  // Fabric v7 は基準点の既定を中央へ変えた。換算は left/top を左上として読むため、背景と緑ボードの
  // 基準点を左上に固定しないと、表示と保存される配置が食い違う
  it('REQ-9.3: 背景の画像は基準点を左上にして枠の左上（0, 0）に置く', async () => {
    render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);

    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance));
    expect(mockFabricImageInstance.set).toHaveBeenCalledWith(
      expect.objectContaining({ originX: 'left', originY: 'top', left: 0, top: 0 })
    );
  });

  it('REQ-9.3: 緑ボードは基準点を左上にして、left/top に表示の矩形の左上を置く', async () => {
    // 画像 2000×1000、最大表示幅 600 → 枠 600×300、既定の矩形は左上 (180, 112.5)
    render(
      <SignboardPlacementEditor
        photo={photo}
        signboard={signboard}
        maxDisplayWidth={600}
        onSave={vi.fn()}
      />
    );

    await waitFor(() => expect(rectInstances.length).toBe(1));
    const rect = rectInstances[0] as Record<string, unknown>;
    expect(rect).toMatchObject({ originX: 'left', originY: 'top', left: 180, top: 112.5 });
  });

  // レビューの指摘（Minor 1）: 原本の到着でキャンバスを作り直すと、到着がドラッグの途中と重なった
  // ときにそのドラッグが取り消される。背景は今のキャンバスへ敷くだけにする
  it('原本の到着ではキャンバスと緑ボードを作り直さない', async () => {
    let resolve: (blob: Blob) => void = () => {};
    mockGetOriginalImage.mockImplementationOnce(() => new Promise<Blob>((r) => (resolve = r)));
    render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);
    await waitFor(() => expect(rectInstances.length).toBe(1));
    const disposeCount = mockCanvasInstance.dispose.mock.calls.length;

    resolve(new Blob(['original']));
    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance));
    expect(mockCanvasInstance.dispose.mock.calls.length).toBe(disposeCount);
    expect(rectInstances.length).toBe(1);
  });

  it('幅の変化でキャンバスを作り直すと、読み込み済みの背景を新しい大きさで敷き直し、取り直さない', async () => {
    const { rerender } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance));
    mockFabricImageInstance.set.mockClear();

    // 置かれた場所の幅 295 → 画像の枠 293×146.5
    vi.mocked(useElementSize).mockReturnValue({ width: 295, height: 0 });
    rerender(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);

    await waitFor(() => expect(mockFabricImageInstance.set).toHaveBeenCalled());
    expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance);
    const options = backgroundScaleOf(mockFabricImageInstance.set);
    expect(mockFabricImageInstance.width * options!.scaleX).toBeCloseTo(293);
    expect(mockFabricImageInstance.height * options!.scaleY).toBeCloseTo(146.5);
    expect(mockGetOriginalImage).toHaveBeenCalledTimes(1);
    expect(mockFromURL).toHaveBeenCalledTimes(1);
  });

  it('キャンバスの破棄の前に背景を外す（Fabric の破棄で背景の画像を破棄させない）', async () => {
    const seen: unknown[] = [];
    mockCanvasInstance.dispose.mockImplementation(() => {
      seen.push(mockCanvasInstance.backgroundImage);
    });
    const { unmount } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    await waitFor(() => expect(mockCanvasInstance.backgroundImage).toBe(mockFabricImageInstance));

    unmount();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeUndefined();
    mockCanvasInstance.dispose.mockReset();
  });

  // レビューの指摘（Minor 2）: 失敗の印を成功で下ろさないと、A（失敗）→B→A（成功）で背景が出ているのに
  // 失敗の表示が残る
  it('失敗した写真へ戻って取得に成功すると、背景を読めない旨を下ろす', async () => {
    const other: ConstructionPhotoWithUrls = { ...photo, id: 'photo-2' };
    mockGetOriginalImage.mockImplementationOnce(() => Promise.reject(new Error('503')));
    const { rerender } = render(
      <SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<SignboardPlacementEditor photo={other} signboard={signboard} onSave={vi.fn()} />);
    await waitFor(() => expect(mockGetOriginalImage).toHaveBeenLastCalledWith('photo-2'));
    rerender(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);

    await waitFor(() => expect(mockGetOriginalImage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('取得に成功しているときは背景を読めない旨を示さない', async () => {
    render(<SignboardPlacementEditor photo={photo} signboard={signboard} onSave={vi.fn()} />);
    await waitFor(() => expect(mockFromURL).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-9.1
 * @requirement construction-photo/REQ-9.2
 * @requirement construction-photo/REQ-9.3
 * @requirement construction-photo/REQ-9.4
 */
