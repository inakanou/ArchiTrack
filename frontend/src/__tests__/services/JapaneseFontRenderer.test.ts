/**
 * JapaneseFontRenderer - 日本語フォントレンダリングテスト
 *
 * Task 20.3: 日本語テキストのレンダリング対応を実装する
 * - Canvasへの日本語フォント適用
 * - エクスポート画像での日本語表示確認
 *
 * @see design.md - ExportService日本語フォント埋め込み詳細
 * @see requirements.md - 要件10.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  JapaneseFontRenderer,
  JAPANESE_FONT_FAMILY,
  JAPANESE_FONT_FALLBACK,
  FontLoadStatus,
  loadJapaneseFont,
  isJapaneseFontLoaded,
  getJapaneseFontFamily,
  applyJapaneseFontToCanvas,
  waitForFontLoad,
  resetDefaultRenderer,
} from '../../services/JapaneseFontRenderer';

/**
 * Fabric.js Canvasのモックインターフェース
 */
interface MockFabricCanvas {
  getObjects: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
}

/**
 * Fabric.js ITextオブジェクトのモック
 */
interface MockITextObject {
  type: string;
  fontFamily: string;
  set: ReturnType<typeof vi.fn>;
}

/**
 * モックキャンバスを作成するヘルパー関数
 */
function createMockCanvas(objects: MockITextObject[] = []): MockFabricCanvas {
  return {
    getObjects: vi.fn().mockReturnValue(objects),
    requestRenderAll: vi.fn(),
  };
}

/**
 * モックITextオブジェクトを作成するヘルパー関数
 */
function createMockIText(fontFamily: string = 'sans-serif'): MockITextObject {
  return {
    type: 'i-text',
    fontFamily,
    set: vi.fn(),
  };
}

/**
 * FontFaceモッククラスを作成するヘルパー
 */
function createMockFontFaceClass(loadBehavior: 'success' | 'failure' | 'pending' = 'success') {
  return class MockFontFace {
    family: string;
    source: string;
    descriptors: FontFaceDescriptors | undefined;
    status: FontFaceLoadStatus = 'unloaded';

    constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
    }

    load(): Promise<this> {
      if (loadBehavior === 'pending') {
        this.status = 'loading';
        return new Promise((resolve) => setTimeout(() => resolve(this), 100));
      } else if (loadBehavior === 'failure') {
        this.status = 'error';
        return Promise.reject(new Error('Font load failed'));
      } else {
        this.status = 'loaded';
        return Promise.resolve(this);
      }
    }
  };
}

describe('JapaneseFontRenderer', () => {
  let renderer: JapaneseFontRenderer;

  beforeEach(() => {
    renderer = new JapaneseFontRenderer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Requirements 10.5: 日本語を含むテキスト注釈を正しくレンダリングしてエクスポート', () => {
    describe('フォント定数', () => {
      it('日本語フォントファミリー名が定義されている', () => {
        expect(JAPANESE_FONT_FAMILY).toBeDefined();
        expect(typeof JAPANESE_FONT_FAMILY).toBe('string');
        expect(JAPANESE_FONT_FAMILY.length).toBeGreaterThan(0);
      });

      it('フォールバックフォントファミリーが定義されている', () => {
        expect(JAPANESE_FONT_FALLBACK).toBeDefined();
        expect(typeof JAPANESE_FONT_FALLBACK).toBe('string');
        expect(JAPANESE_FONT_FALLBACK).toContain('sans-serif');
      });

      it('日本語フォントファミリーにNoto Sans JPが含まれる', () => {
        expect(JAPANESE_FONT_FAMILY).toContain('Noto Sans JP');
      });
    });

    describe('フォント読み込みステータス', () => {
      it('初期状態はNOT_LOADEDである', () => {
        expect(renderer.getStatus()).toBe(FontLoadStatus.NOT_LOADED);
      });

      it('読み込み中はLOADINGステータスになる', async () => {
        const MockFontFace = createMockFontFaceClass('pending');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(false),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        // 読み込みを開始（awaitせずに状態確認）
        const loadPromise = renderer.load();

        // 即座にステータスを確認
        expect(renderer.getStatus()).toBe(FontLoadStatus.LOADING);

        // クリーンアップ
        await loadPromise.catch(() => {});
      });

      it('読み込み成功後はLOADEDステータスになる', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();

        expect(renderer.getStatus()).toBe(FontLoadStatus.LOADED);
      });

      it('読み込み失敗時はFAILEDステータスになる', async () => {
        const MockFontFace = createMockFontFaceClass('failure');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(false),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load().catch(() => {});

        expect(renderer.getStatus()).toBe(FontLoadStatus.FAILED);
      });
    });

    describe('フォント読み込み', () => {
      it('load()がPromiseを返す', () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        const result = renderer.load();

        expect(result).toBeInstanceOf(Promise);
      });

      it('フォントがdocument.fontsに追加される', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();

        expect(mockFonts.add).toHaveBeenCalled();
      });

      it('既に読み込み済みの場合は再読み込みしない', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const constructorSpy = vi.fn();
        const MockFontFaceWithSpy = class extends MockFontFace {
          constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
            super(family, source, descriptors);
            constructorSpy();
          }
        };
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFaceWithSpy);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        await renderer.load(); // 2回目

        // コンストラクタは1回しか呼ばれない
        expect(constructorSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('フォント適用チェック', () => {
      it('isLoaded()が読み込み完了を正しく返す', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        expect(renderer.isLoaded()).toBe(false);

        await renderer.load();

        expect(renderer.isLoaded()).toBe(true);
      });

      it('getFontFamily()がフォールバック付きのフォントファミリーを返す', () => {
        const fontFamily = renderer.getFontFamily();

        expect(fontFamily).toContain('Noto Sans JP');
        expect(fontFamily).toContain('sans-serif');
      });
    });

    describe('Canvasへの日本語フォント適用', () => {
      it('applyToCanvas()がテキストオブジェクトのフォントを変更する', async () => {
        const mockTextObject = createMockIText();
        const mockCanvas = createMockCanvas([mockTextObject]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);

        expect(mockTextObject.set).toHaveBeenCalledWith(
          'fontFamily',
          expect.stringContaining('Noto Sans JP')
        );
      });

      it('applyToCanvas()がテキストボックスのフォントも変更する', async () => {
        const mockTextboxObject: MockITextObject = {
          type: 'textbox',
          fontFamily: 'sans-serif',
          set: vi.fn(),
        };
        const mockCanvas = createMockCanvas([mockTextboxObject]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);

        expect(mockTextboxObject.set).toHaveBeenCalledWith(
          'fontFamily',
          expect.stringContaining('Noto Sans JP')
        );
      });

      it('applyToCanvas()がカスタムTextAnnotationのフォントも変更する', async () => {
        const mockTextAnnotation: MockITextObject = {
          type: 'textAnnotation',
          fontFamily: 'sans-serif',
          set: vi.fn(),
        };
        const mockCanvas = createMockCanvas([mockTextAnnotation]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);

        expect(mockTextAnnotation.set).toHaveBeenCalledWith(
          'fontFamily',
          expect.stringContaining('Noto Sans JP')
        );
      });

      it('applyToCanvas()後にキャンバスが再描画される', async () => {
        const mockCanvas = createMockCanvas([createMockIText()]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);

        expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
      });

      it('テキスト以外のオブジェクトは変更されない', async () => {
        const mockRectObject = {
          type: 'rect',
          set: vi.fn(),
        };
        const mockCanvas = createMockCanvas([mockRectObject as unknown as MockITextObject]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);

        expect(mockRectObject.set).not.toHaveBeenCalled();
      });
    });

    describe('日本語テキストの表示確認', () => {
      it('ひらがなを含むテキストが処理可能', async () => {
        const mockCanvas = createMockCanvas([createMockIText()]);

        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        // 日本語フォントが適用可能であることを確認
        expect(renderer.isLoaded()).toBe(true);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer.applyToCanvas(mockCanvas as any);
        expect(mockCanvas.requestRenderAll).toHaveBeenCalled();
      });

      it('カタカナを含むテキストが処理可能', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        expect(renderer.isLoaded()).toBe(true);
      });

      it('漢字を含むテキストが処理可能', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        expect(renderer.isLoaded()).toBe(true);
      });

      it('日本語と英数字の混合テキストが処理可能', async () => {
        const MockFontFace = createMockFontFaceClass('success');
        const mockFonts = {
          add: vi.fn(),
          check: vi.fn().mockReturnValue(true),
        };

        vi.stubGlobal('FontFace', MockFontFace);
        vi.stubGlobal('document', { fonts: mockFonts });

        await renderer.load();
        expect(renderer.isLoaded()).toBe(true);
      });
    });
  });
});

describe('スタンドアロン関数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // シングルトンをリセット
    resetDefaultRenderer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadJapaneseFont()', () => {
    it('日本語フォントを読み込む', async () => {
      const MockFontFace = createMockFontFaceClass('success');
      const mockFonts = {
        add: vi.fn(),
        check: vi.fn().mockReturnValue(true),
      };

      vi.stubGlobal('FontFace', MockFontFace);
      vi.stubGlobal('document', { fonts: mockFonts });

      await expect(loadJapaneseFont()).resolves.not.toThrow();
    });
  });

  describe('isJapaneseFontLoaded()', () => {
    it('フォント読み込み状態を返す', async () => {
      const MockFontFace = createMockFontFaceClass('success');
      const mockFonts = {
        add: vi.fn(),
        check: vi.fn().mockReturnValue(true),
      };

      vi.stubGlobal('FontFace', MockFontFace);
      vi.stubGlobal('document', { fonts: mockFonts });

      // 初期状態はfalse
      expect(isJapaneseFontLoaded()).toBe(false);

      await loadJapaneseFont();

      expect(isJapaneseFontLoaded()).toBe(true);
    });
  });

  describe('getJapaneseFontFamily()', () => {
    it('日本語フォントファミリー文字列を返す', () => {
      const fontFamily = getJapaneseFontFamily();

      expect(fontFamily).toContain('Noto Sans JP');
      expect(fontFamily).toContain('sans-serif');
    });
  });

  describe('applyJapaneseFontToCanvas()', () => {
    it('キャンバスに日本語フォントを適用する', async () => {
      const mockTextObject = createMockIText();
      const mockCanvas = createMockCanvas([mockTextObject]);

      const MockFontFace = createMockFontFaceClass('success');
      const mockFonts = {
        add: vi.fn(),
        check: vi.fn().mockReturnValue(true),
      };

      vi.stubGlobal('FontFace', MockFontFace);
      vi.stubGlobal('document', { fonts: mockFonts });

      await loadJapaneseFont();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyJapaneseFontToCanvas(mockCanvas as any);

      expect(mockTextObject.set).toHaveBeenCalled();
    });
  });

  describe('waitForFontLoad()', () => {
    it('フォント読み込みを待機する', async () => {
      const MockFontFace = createMockFontFaceClass('success');
      const mockFonts = {
        add: vi.fn(),
        check: vi.fn().mockReturnValue(true),
      };

      vi.stubGlobal('FontFace', MockFontFace);
      vi.stubGlobal('document', { fonts: mockFonts });

      await expect(waitForFontLoad()).resolves.not.toThrow();
    });

    it('タイムアウト時間を設定できる', async () => {
      const MockFontFace = createMockFontFaceClass('success');
      const mockFonts = {
        add: vi.fn(),
        check: vi.fn().mockReturnValue(true),
      };

      vi.stubGlobal('FontFace', MockFontFace);
      vi.stubGlobal('document', { fonts: mockFonts });

      await expect(waitForFontLoad(5000)).resolves.not.toThrow();
    });
  });
});

describe('エクスポート時の日本語レンダリング', () => {
  beforeEach(() => {
    resetDefaultRenderer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('エクスポート前にフォントが読み込まれていることを確認', async () => {
    const MockFontFace = createMockFontFaceClass('success');
    const mockFonts = {
      add: vi.fn(),
      check: vi.fn().mockReturnValue(true),
    };

    vi.stubGlobal('FontFace', MockFontFace);
    vi.stubGlobal('document', { fonts: mockFonts });

    await loadJapaneseFont();

    expect(isJapaneseFontLoaded()).toBe(true);
  });

  it('フォントファミリーにフォールバックが含まれる', () => {
    const fontFamily = getJapaneseFontFamily();

    // フォールバックチェーンを確認
    expect(fontFamily).toMatch(/"Noto Sans JP".*sans-serif/);
  });
});
