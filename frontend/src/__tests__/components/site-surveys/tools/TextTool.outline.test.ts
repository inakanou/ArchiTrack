/**
 * @fileoverview テキスト注釈 白アウトライン構造テスト（Task 66.1）
 *
 * Requirements:
 * - 25.1: テキストの外側に白色アウトラインを付与して表示する
 * - 25.3: 白アウトラインは既存の背景色（Requirement 8）とは独立して設定可能にする
 * - 25.12: 日本語を含むマルチバイト文字に対しても白アウトラインを正しくレンダリングする
 *
 * Design: design.md "TextAnnotation (outline)" セクション
 * - paintFirst: 'stroke'
 * - stroke: '#ffffff'
 * - strokeWidth = fontSize * widthRatio（既定 widthRatio = 0.12）
 * - strokeUniform: true
 * - splitByGrapheme: true 既存維持
 * - backgroundColor: 独立制御
 *
 * テスト対象:
 * - TextAnnotation コンストラクタ時の IText 初期化オプション
 * - getTextOutline() の既定戻り値
 * - マルチバイト文字での同等構造
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoistedでモック関数を定義（ホイスティング対応）
const { mockSetCoords, mockSet, mockOnCallbacks, mockFireEvent } = vi.hoisted(() => {
  return {
    mockSetCoords: vi.fn(),
    mockSet: vi.fn(),
    mockOnCallbacks: new Map<string, (...args: unknown[]) => void>(),
    mockFireEvent: vi.fn(),
  };
});

// Fabric.jsのモック（既存 TextTool.test.ts と同一方針）
vi.mock('fabric', () => {
  class MockIText {
    text: string;
    left: number;
    top: number;
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    backgroundColor?: string;
    // 白アウトライン関連のプロパティ（オプションから Object.assign で取得）
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
      mockFireEvent(event, ...args);
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
import {
  TextAnnotation,
  createTextAnnotation,
} from '../../../../components/site-surveys/tools/TextTool';
import { ANNOTATION_DEFAULTS } from '../../../../components/site-surveys/annotation-style-tokens';

describe('TextAnnotation 白アウトライン（Task 66.1）', () => {
  beforeEach(() => {
    mockSetCoords.mockClear();
    mockSet.mockClear();
    mockOnCallbacks.clear();
    mockFireEvent.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('paintFirst/stroke の初期化（Req 25.1）', () => {
    it('paintFirst が "stroke" に設定される', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      expect((text as unknown as { paintFirst?: string }).paintFirst).toBe('stroke');
    });

    it('stroke が "#ffffff" に設定される', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      expect((text as unknown as { stroke?: string }).stroke).toBe('#ffffff');
    });

    it('strokeUniform が true に設定される', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      expect((text as unknown as { strokeUniform?: boolean }).strokeUniform).toBe(true);
    });
  });

  describe('strokeWidth の算出（Req 25.1）', () => {
    it('strokeWidth は fontSize * widthRatio（既定 0.12）で算出される', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      const expected = ANNOTATION_DEFAULTS.fontSize * ANNOTATION_DEFAULTS.textOutline.widthRatio;
      // 既定: 16 * 0.12 = 1.92
      expect(expected).toBeCloseTo(1.92, 5);
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(expected, 5);
    });

    it('fontSize を指定した場合、strokeWidth は指定 fontSize * 0.12 になる', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'T', fontSize: 24 });
      expect((text as unknown as { strokeWidth?: number }).strokeWidth).toBeCloseTo(24 * 0.12, 5);
    });
  });

  describe('既存挙動の保持', () => {
    it('splitByGrapheme が true のまま維持される（Req 25.12 既存）', () => {
      const text = new TextAnnotation({ x: 10, y: 20 }, { initialText: 'Hello' });
      expect((text as unknown as { splitByGrapheme?: boolean }).splitByGrapheme).toBe(true);
    });

    it('backgroundColor は白アウトラインと独立して適用される（Req 25.3）', () => {
      const text = new TextAnnotation(
        { x: 10, y: 20 },
        { initialText: 'Hello', backgroundColor: '#ffff00' }
      );
      // backgroundColor が設定される（白アウトラインによって上書きされない）
      expect((text as unknown as { backgroundColor?: string }).backgroundColor).toBe('#ffff00');
      // 同時に白アウトラインも有効
      expect((text as unknown as { paintFirst?: string }).paintFirst).toBe('stroke');
      expect((text as unknown as { stroke?: string }).stroke).toBe('#ffffff');
    });
  });

  describe('getTextOutline() 既定値', () => {
    it('既定で { enabled: true, widthRatio: 0.12 } を返す', () => {
      const text = new TextAnnotation({ x: 0, y: 0 }, { initialText: 'A' });
      expect(text.getTextOutline()).toEqual({
        enabled: true,
        widthRatio: 0.12,
      });
    });
  });

  describe('マルチバイト文字対応（Req 25.12）', () => {
    it('日本語テキスト「現場調査」でも同じ白アウトライン設定で生成される', () => {
      const text = createTextAnnotation({ x: 30, y: 40 }, { initialText: '現場調査' });
      const asAny = text as unknown as {
        paintFirst?: string;
        stroke?: string;
        strokeUniform?: boolean;
        strokeWidth?: number;
        splitByGrapheme?: boolean;
      };
      expect(text.getText()).toBe('現場調査');
      expect(asAny.paintFirst).toBe('stroke');
      expect(asAny.stroke).toBe('#ffffff');
      expect(asAny.strokeUniform).toBe(true);
      expect(asAny.splitByGrapheme).toBe(true);
      expect(asAny.strokeWidth).toBeCloseTo(
        ANNOTATION_DEFAULTS.fontSize * ANNOTATION_DEFAULTS.textOutline.widthRatio,
        5
      );
    });
  });
});
