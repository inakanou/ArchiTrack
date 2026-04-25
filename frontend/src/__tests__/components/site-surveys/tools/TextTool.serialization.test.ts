/**
 * @fileoverview テキスト注釈 白アウトライン シリアライズ/復元テスト（Task 66.2）
 *
 * Requirements:
 * - 25.2: テキストの白アウトラインの有効/無効をユーザーが任意に切替可能にする
 * - 25.4: テキスト色変更時も白アウトライン部分の色は白のまま維持する
 * - 25.5: フォントサイズ変更時に白アウトライン幅を fontSize の 10〜20% で自動調整する
 * - 25.6: 移動・リサイズ時に白アウトラインを本体と同期して更新する（setTextOutline の一貫適用）
 * - 25.7: 保存時に textOutline 属性（enabled/widthRatio）を注釈データに含めて永続化する
 * - 25.8: 保存済みテキスト注釈を再表示する際に textOutline を復元する
 * - 25.10: textOutline 未定義の旧データは白アウトラインなしの従来表現で表示する（後方互換）
 * - 25.11: 白アウトラインの有効化/無効化切替操作を Undo/Redo 履歴に記録する
 *
 * Design: design.md "TextAnnotation (outline)" セクション（~4472-4528）
 * - `TextAnnotationJSON` に `textOutline?: { enabled, widthRatio }` を追加（optional: 旧データ後方互換）
 * - enabled=false: stroke=''、strokeWidth=0
 * - enabled=true: stroke='#ffffff', strokeWidth=fontSize*widthRatio, paintFirst='stroke', strokeUniform=true
 * - widthRatio は [0.10, 0.20] にクランプ
 * - setTextOutline は canvas.fire('object:modified') を発火（Undo/Redo 連携）
 * - fontSize 変更時 strokeWidth を自動再計算（object:modified にフック）
 *
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-25.4
 * @requirement site-survey/REQ-25.5
 * @requirement site-survey/REQ-25.6
 * @requirement site-survey/REQ-25.7
 * @requirement site-survey/REQ-25.8
 * @requirement site-survey/REQ-25.10
 * @requirement site-survey/REQ-25.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet, mockOnCallbacks, mockCanvasFire } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
    mockOnCallbacks: new Map<string, (...args: unknown[]) => void>(),
    mockCanvasFire: vi.fn(),
  };
});

// Fabric.js のモック（TextTool.outline.test.ts と同一方針）
vi.mock('fabric', () => {
  class MockIText {
    text: string;
    left: number;
    top: number;
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    backgroundColor?: string;
    paintFirst?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeUniform?: boolean;
    splitByGrapheme?: boolean;
    selectable?: boolean;
    evented?: boolean;
    editable?: boolean;
    editingBorderColor?: string;
    cursorColor?: string;
    originX?: string;
    originY?: string;
    isEditing: boolean = false;

    constructor(text: string, options?: Record<string, unknown>) {
      this.text = text;
      this.left = (options?.left as number) || 0;
      this.top = (options?.top as number) || 0;
      if (options) {
        Object.assign(this, options);
      }
    }

    set(options: Record<string, unknown> | string, value?: unknown): this {
      if (typeof options === 'string') {
        (this as Record<string, unknown>)[options] = value;
      } else {
        Object.assign(this, options);
      }
      mockSet(options, value);
      return this;
    }

    setCoords(): void {
      mockSetCoords();
    }

    getText(): string {
      return this.text;
    }

    setText(text: string): void {
      this.text = text;
    }

    enterEditing(): this {
      this.isEditing = true;
      return this;
    }

    exitEditing(): this {
      this.isEditing = false;
      return this;
    }

    initHiddenTextarea(): void {
      // モック: 隠しtextareaの初期化
    }

    on(event: string, callback: (...args: unknown[]) => void): void {
      mockOnCallbacks.set(event, callback);
    }

    fire(event: string, ...args: unknown[]): void {
      const callback = mockOnCallbacks.get(event);
      if (callback) {
        callback(...args);
      }
    }

    toObject(): Record<string, unknown> {
      return {
        type: 'textAnnotation',
        text: this.text,
        left: this.left,
        top: this.top,
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        fill: this.fill,
        backgroundColor: this.backgroundColor,
      };
    }
  }

  class MockCanvas {
    selection: boolean = true;
  }

  return {
    IText: MockIText,
    Canvas: MockCanvas,
  };
});

// モック設定後にインポート
import { TextAnnotation } from '../../../../components/site-surveys/tools/TextTool';

/**
 * Fabric Canvas のモック（最小実装: fire のみ）
 * ArrowTool.serialization.test.ts と同一方針
 */
function makeMockCanvas(): { fire: ReturnType<typeof vi.fn> } {
  return { fire: mockCanvasFire };
}

describe('TextAnnotation シリアライズ/復元 (Task 66.2)', () => {
  beforeEach(() => {
    mockSetCoords.mockClear();
    mockSet.mockClear();
    mockOnCallbacks.clear();
    mockCanvasFire.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // toObject() に textOutline を含める（Req 25.7）
  // ==========================================================================

  describe('toObject() が textOutline 属性を含める（Req 25.7）', () => {
    it('デフォルトで textOutline: { enabled: true, widthRatio: 0.12 } を含む', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });

      const json = text.toObject() as unknown as {
        textOutline?: { enabled: boolean; widthRatio: number };
      };

      expect(json.textOutline).toBeDefined();
      expect(json.textOutline).toEqual({ enabled: true, widthRatio: 0.12 });
    });

    it('setTextOutline({ enabled: false }) 後、toObject.textOutline.enabled === false', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      text.setTextOutline({ enabled: false });
      const json = text.toObject() as unknown as {
        textOutline?: { enabled: boolean; widthRatio: number };
      };

      expect(json.textOutline).toBeDefined();
      expect(json.textOutline!.enabled).toBe(false);
    });

    it('setTextOutline({ widthRatio: 0.15 }) 後、toObject.textOutline.widthRatio === 0.15', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      text.setTextOutline({ widthRatio: 0.15 });
      const json = text.toObject() as unknown as {
        textOutline?: { enabled: boolean; widthRatio: number };
      };

      expect(json.textOutline!.widthRatio).toBe(0.15);
    });

    it('既存のテキスト/位置/フォント/色系フィールドも引き続き含まれる', () => {
      const text = new TextAnnotation(
        { x: 10, y: 20 },
        { initialText: 'Hello', fontSize: 24, fontFamily: 'Arial', fill: '#ff00ff' }
      );

      const json = text.toObject();

      expect(json.type).toBe('textAnnotation');
      expect(json.text).toBe('Hello');
      expect(json.position).toEqual({ x: 10, y: 20 });
      expect(json.fontSize).toBe(24);
      expect(json.fontFamily).toBe('Arial');
      expect(json.fill).toBe('#ff00ff');
    });
  });

  // ==========================================================================
  // setTextOutline の挙動（Req 25.2, 25.4, 25.6）
  // ==========================================================================

  describe('setTextOutline が IText 側の stroke/strokeWidth を更新する（Req 25.2）', () => {
    it('setTextOutline({ enabled: false }) で stroke === "" になる（無効化）', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      text.setTextOutline({ enabled: false });

      expect((text as unknown as { stroke?: string }).stroke).toBe('');
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBe(0);
    });

    it('setTextOutline({ enabled: true }) で stroke === "#ffffff" に復帰する', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 16 });

      // 一度無効化してから再有効化
      text.setTextOutline({ enabled: false });
      text.setTextOutline({ enabled: true });

      expect((text as unknown as { stroke?: string }).stroke).toBe('#ffffff');
      expect((text as unknown as { paintFirst?: string }).paintFirst).toBe('stroke');
      expect((text as unknown as { strokeUniform?: boolean }).strokeUniform).toBe(true);
      // strokeWidth = fontSize * widthRatio（既定 0.12） = 16 * 0.12
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(16 * 0.12, 5);
    });

    it('widthRatio は [0.10, 0.20] にクランプされる（上限側）', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      // 0.20 を超える値を指定
      text.setTextOutline({ widthRatio: 0.5 });

      expect(text.getTextOutline().widthRatio).toBe(0.2);
    });

    it('widthRatio は [0.10, 0.20] にクランプされる（下限側）', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      text.setTextOutline({ widthRatio: 0.05 });

      expect(text.getTextOutline().widthRatio).toBe(0.1);
    });
  });

  // ==========================================================================
  // fromObject() で textOutline を復元する（Req 25.8）
  // ==========================================================================

  describe('fromObject() が textOutline 属性を復元する（Req 25.8）', () => {
    it('textOutline 付きの有効な JSON から復元し、textOutline が一致する', async () => {
      const json = {
        type: 'textAnnotation' as const,
        text: 'Hello',
        position: { x: 10, y: 20 },
        fontSize: 20,
        fontFamily: 'sans-serif',
        fill: '#000000',
        backgroundColor: 'transparent',
        balloonStyle: 'none' as const,
        balloonBackgroundColor: '#ffffff',
        balloonStrokeColor: '#000000',
        balloonStrokeWidth: 1,
        balloonPadding: 8,
        textOutline: { enabled: true, widthRatio: 0.15 },
      };

      const text = await TextAnnotation.fromObject(json);

      expect(text.getTextOutline()).toEqual({ enabled: true, widthRatio: 0.15 });
    });

    it('toObject → fromObject のラウンドトリップで textOutline が保持される', async () => {
      const original = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      original.setTextOutline({ enabled: true, widthRatio: 0.18 });

      const json = original.toObject();
      const restored = await TextAnnotation.fromObject(json);

      expect(restored.getTextOutline()).toEqual({ enabled: true, widthRatio: 0.18 });
    });

    it('textOutline.enabled=false の JSON から復元すると stroke === "" になる', async () => {
      const json = {
        type: 'textAnnotation' as const,
        text: 'Hello',
        position: { x: 10, y: 20 },
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: '#000000',
        backgroundColor: 'transparent',
        balloonStyle: 'none' as const,
        balloonBackgroundColor: '#ffffff',
        balloonStrokeColor: '#000000',
        balloonStrokeWidth: 1,
        balloonPadding: 8,
        textOutline: { enabled: false, widthRatio: 0.12 },
      };

      const text = await TextAnnotation.fromObject(json);

      expect(text.getTextOutline().enabled).toBe(false);
      expect((text as unknown as { stroke?: string }).stroke).toBe('');
    });
  });

  // ==========================================================================
  // textOutline 未定義の旧データは白アウトラインなしで復元（Req 25.10 後方互換）
  // ==========================================================================

  describe('textOutline 未定義の旧データは白アウトラインなしで復元する（Req 25.10 後方互換）', () => {
    it('textOutline フィールド欠落 JSON でも例外にならず TextAnnotation を返す', async () => {
      const legacyJson = {
        type: 'textAnnotation' as const,
        text: 'Legacy',
        position: { x: 10, y: 20 },
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: '#000000',
        backgroundColor: 'transparent',
        balloonStyle: 'none' as const,
        balloonBackgroundColor: '#ffffff',
        balloonStrokeColor: '#000000',
        balloonStrokeWidth: 1,
        balloonPadding: 8,
      };

      await expect(TextAnnotation.fromObject(legacyJson)).resolves.toBeInstanceOf(TextAnnotation);
    });

    it('textOutline 未定義の JSON から復元した TextAnnotation は getTextOutline().enabled === false', async () => {
      const legacyJson = {
        type: 'textAnnotation' as const,
        text: 'Legacy',
        position: { x: 10, y: 20 },
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: '#000000',
        backgroundColor: 'transparent',
        balloonStyle: 'none' as const,
        balloonBackgroundColor: '#ffffff',
        balloonStrokeColor: '#000000',
        balloonStrokeWidth: 1,
        balloonPadding: 8,
      };

      const text = await TextAnnotation.fromObject(legacyJson);

      const outline = text.getTextOutline();
      expect(outline).toBeDefined();
      expect(outline.enabled).toBe(false);
    });

    it('textOutline 未定義の JSON から復元した TextAnnotation は stroke === "" / strokeWidth === 0', async () => {
      const legacyJson = {
        type: 'textAnnotation' as const,
        text: 'Legacy',
        position: { x: 10, y: 20 },
        fontSize: 16,
        fontFamily: 'sans-serif',
        fill: '#000000',
        backgroundColor: 'transparent',
        balloonStyle: 'none' as const,
        balloonBackgroundColor: '#ffffff',
        balloonStrokeColor: '#000000',
        balloonStrokeWidth: 1,
        balloonPadding: 8,
      };

      const text = await TextAnnotation.fromObject(legacyJson);

      expect((text as unknown as { stroke?: string }).stroke).toBe('');
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBe(0);
    });
  });

  // ==========================================================================
  // 防御的フォールバック（不正値・必須欠落）
  // ==========================================================================

  describe('防御的フォールバック: 不正値/必須欠落時は安全な既定で復元する', () => {
    it('null を渡しても例外を投げず TextAnnotation を返し、console.warn する', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const text = await TextAnnotation.fromObject(
        null as unknown as Parameters<typeof TextAnnotation.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(text).toBeInstanceOf(TextAnnotation);
    });

    it('undefined を渡しても例外を投げず TextAnnotation を返す', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const text = await TextAnnotation.fromObject(
        undefined as unknown as Parameters<typeof TextAnnotation.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(text).toBeInstanceOf(TextAnnotation);
    });

    it('空オブジェクト {} を渡しても安全な既定（text: "" / position: (0,0) / fontSize: 16）で復元', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const text = await TextAnnotation.fromObject(
        {} as unknown as Parameters<typeof TextAnnotation.fromObject>[0]
      );

      expect(warnSpy).toHaveBeenCalled();
      expect(text).toBeInstanceOf(TextAnnotation);
      expect(text.getText()).toBe('');
      expect(text.fontSize).toBe(16);
    });
  });

  // ==========================================================================
  // fontSize 変更時の strokeWidth 自動再計算（Req 25.5）
  // ==========================================================================

  describe('フォントサイズ変更時に strokeWidth を自動再計算する（Req 25.5）', () => {
    it('text.set("fontSize", 32) で strokeWidth は 32 * 0.12 = 3.84 に更新される', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 16 });

      // 初期値確認
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(16 * 0.12, 5);

      // フォントサイズ変更
      text.set('fontSize', 32);

      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(32 * 0.12, 5);
      expect(text.fontSize).toBe(32);
    });

    it('setFontSize(24) で strokeWidth は 24 * 0.12 = 2.88 に更新される', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 16 });

      text.setFontSize(24);

      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(24 * 0.12, 5);
    });

    it('enabled=false の時は fontSize 変更で strokeWidth が 0 のまま維持される', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 16 });
      text.setTextOutline({ enabled: false });

      text.set('fontSize', 32);

      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBe(0);
      expect(text.fontSize).toBe(32);
    });

    it('options 形式の set({ fontSize: 20 }) でも strokeWidth が自動再計算される', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 16 });

      text.set({ fontSize: 20 });

      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(20 * 0.12, 5);
      expect(text.fontSize).toBe(20);
    });
  });

  // ==========================================================================
  // setTextOutline と Undo/Redo 連携（Req 25.11）
  // ==========================================================================

  describe('setTextOutline は Undo/Redo 履歴記録のため canvas.fire("object:modified") を発火する（Req 25.11）', () => {
    it('canvas が付与されている場合、setTextOutline で canvas.fire が "object:modified" とともに呼ばれる', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });
      const mockCanvas = makeMockCanvas();
      (text as unknown as { canvas: unknown }).canvas = mockCanvas;

      text.setTextOutline({ enabled: false });

      expect(mockCanvasFire).toHaveBeenCalled();
      const [eventName, payload] = mockCanvasFire.mock.calls[0] as [string, { target: unknown }];
      expect(eventName).toBe('object:modified');
      expect(payload).toBeDefined();
      expect(payload.target).toBe(text);
    });

    it('canvas が null（未 add）なら setTextOutline は例外を投げない', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      expect(() => text.setTextOutline({ enabled: false })).not.toThrow();
      expect(mockCanvasFire).not.toHaveBeenCalled();
    });

    it('setTextOutline の前後で textOutline 属性の変更が反映されている（2 回切替で 2 回 fire）', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });
      const mockCanvas = makeMockCanvas();
      (text as unknown as { canvas: unknown }).canvas = mockCanvas;

      expect(text.getTextOutline().enabled).toBe(true);
      text.setTextOutline({ enabled: false });
      expect(text.getTextOutline().enabled).toBe(false);
      text.setTextOutline({ enabled: true });
      expect(text.getTextOutline().enabled).toBe(true);

      expect(mockCanvasFire).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // テキスト色変更時も白アウトラインは白のまま維持（Req 25.4）
  // ==========================================================================

  describe('テキスト色変更時も白アウトラインは白のまま維持する（Req 25.4）', () => {
    it('setFill("#00ff00") 後も stroke === "#ffffff" のまま', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T' });

      text.setFill('#00ff00');

      expect(text.fill).toBe('#00ff00');
      expect((text as unknown as { stroke?: string }).stroke).toBe('#ffffff');
    });
  });
});
