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

const { mockCanvasInstance, mockFromURL, rectInstances, addedObjects } = vi.hoisted(() => {
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
  const mockFromURL = vi.fn(() => Promise.resolve(mockFabricImageInstance));

  return { mockCanvasInstance, mockFromURL, rectInstances, addedObjects };
});

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

import SignboardPlacementEditor from './SignboardPlacementEditor';

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
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

beforeEach(() => {
  rectInstances.length = 0;
  addedObjects.length = 0;
  mockCanvasInstance.__clearHandlers();
  vi.clearAllMocks();
  mockCanvasInstance.backgroundImage = null;
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
});
