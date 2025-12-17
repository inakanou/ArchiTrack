/**
 * @fileoverview テキストツールのテスト
 *
 * Task 16.1: テキスト入力機能を実装する（TDD）
 *
 * Requirements:
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 * - 8.7: 日本語を含むマルチバイト文字の入力・表示をサポートする
 *
 * テスト対象:
 * - クリック位置へのテキストフィールド表示
 * - 日本語を含むマルチバイト文字対応
 * - カスタムFabric.jsオブジェクト実装
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

// Fabric.jsのモック
vi.mock('fabric', () => {
  // ITextモック（インタラクティブテキスト）
  class MockIText {
    text: string;
    left: number;
    top: number;
    fontSize?: number;
    fontFamily?: string;
    fill?: string;
    backgroundColor?: string;
    selectable?: boolean;
    evented?: boolean;
    editable?: boolean;
    editingBorderColor?: string;
    cursorColor?: string;
    originX?: string;
    originY?: string;
    width?: number;
    height?: number;

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

    enterEditing(): void {
      // 編集モードに入る
    }

    exitEditing(): void {
      // 編集モードを終了
    }

    isEditing: boolean = false;

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

  // Textboxモック（複数行テキスト）
  class MockTextbox extends MockIText {
    textAlign?: string;
    splitByGrapheme?: boolean;

    constructor(text: string, options?: Record<string, unknown>) {
      super(text, options);
      this.splitByGrapheme = (options?.splitByGrapheme as boolean) ?? true;
    }
  }

  // Groupモック
  class MockGroup {
    _objects: unknown[];
    hasControls: boolean;
    hasBorders: boolean;
    lockMovementX: boolean;
    lockMovementY: boolean;
    subTargetCheck: boolean;

    constructor(objects?: unknown[], options?: Record<string, unknown>) {
      this._objects = objects || [];
      this.hasControls = true;
      this.hasBorders = true;
      this.lockMovementX = false;
      this.lockMovementY = false;
      this.subTargetCheck = false;
      if (options) {
        Object.assign(this, options);
      }
    }

    setCoords(): void {
      mockSetCoords();
    }

    toObject(): Record<string, unknown> {
      return {};
    }

    add(object: unknown): void {
      this._objects.push(object);
    }

    remove(object: unknown): void {
      const index = this._objects.indexOf(object);
      if (index > -1) {
        this._objects.splice(index, 1);
      }
    }
  }

  return {
    IText: MockIText,
    Textbox: MockTextbox,
    Group: MockGroup,
  };
});

import {
  TextAnnotation,
  createTextAnnotation,
  type TextAnnotationOptions,
  type Point,
  DEFAULT_TEXT_OPTIONS,
} from '../../../components/site-surveys/tools/TextTool';
import type { Canvas as FabricCanvas } from 'fabric';

// ============================================================================
// テストスイート
// ============================================================================

describe('TextTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCallbacks.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockOnCallbacks.clear();
  });

  // ==========================================================================
  // Task 16.1: テキスト入力機能テスト
  // ==========================================================================
  describe('テキスト入力機能', () => {
    describe('クリック位置へのテキストフィールド表示', () => {
      it('クリック位置にテキストオブジェクトが作成される', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).toBeDefined();
        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.position).toEqual(position);
      });

      it('作成時は空のテキストで開始する', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.text).toBe('');
      });

      it('初期テキストを指定して作成できる', () => {
        const position: Point = { x: 100, y: 200 };
        const initialText = 'テスト文字列';

        const textAnnotation = createTextAnnotation(position, { initialText });

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.text).toBe(initialText);
      });

      it('テキストオブジェクトは指定された座標に配置される', () => {
        const position: Point = { x: 150, y: 250 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.position.x).toBe(150);
        expect(textAnnotation!.position.y).toBe(250);
      });

      it('テキストオブジェクトは編集可能である', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.isEditable).toBe(true);
      });
    });

    describe('日本語を含むマルチバイト文字対応', () => {
      it('日本語テキストを設定できる', () => {
        const position: Point = { x: 100, y: 200 };
        const japaneseText = 'これは日本語テキストです';

        const textAnnotation = createTextAnnotation(position, { initialText: japaneseText });

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.text).toBe(japaneseText);
      });

      it('ひらがなが正しく処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const hiragana = 'あいうえお かきくけこ';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(hiragana);

        expect(textAnnotation!.text).toBe(hiragana);
      });

      it('カタカナが正しく処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const katakana = 'アイウエオ カキクケコ';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(katakana);

        expect(textAnnotation!.text).toBe(katakana);
      });

      it('漢字が正しく処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const kanji = '現場調査 寸法確認';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(kanji);

        expect(textAnnotation!.text).toBe(kanji);
      });

      it('日本語と英数字の混合テキストが処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const mixedText = '幅: 1500mm 高さ: 2000mm';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(mixedText);

        expect(textAnnotation!.text).toBe(mixedText);
      });

      it('絵文字を含むテキストが処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const emojiText = '重要 ⚠️ 注意点';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(emojiText);

        expect(textAnnotation!.text).toBe(emojiText);
      });

      it('改行を含む複数行テキストが処理される', () => {
        const position: Point = { x: 100, y: 200 };
        const multilineText = '1行目\n2行目\n3行目';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(multilineText);

        expect(textAnnotation!.text).toBe(multilineText);
      });

      it('空白文字（全角・半角スペース）が保持される', () => {
        const position: Point = { x: 100, y: 200 };
        const spacedText = '　全角スペース　 半角スペース ';

        const textAnnotation = createTextAnnotation(position);
        textAnnotation!.setText(spacedText);

        expect(textAnnotation!.text).toBe(spacedText);
      });
    });

    describe('カスタムFabric.jsオブジェクト実装', () => {
      it('TextAnnotationクラスはtypeプロパティを持つ', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.type).toBe('textAnnotation');
      });

      it('toObject()はテキスト情報を含むJSONを返す', () => {
        const position: Point = { x: 100, y: 200 };
        const text = 'テストテキスト';

        const textAnnotation = createTextAnnotation(position, { initialText: text });

        const json = textAnnotation!.toObject();

        expect(json.type).toBe('textAnnotation');
        expect(json.text).toBe(text);
        expect(json.position).toEqual(position);
      });

      it('テキストオブジェクトはFabric.js標準のコントロールを持つ', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.hasControls).toBe(true);
        expect(textAnnotation!.hasBorders).toBe(true);
      });

      it('テキストオブジェクトはドラッグで移動可能', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.lockMovementX).toBe(false);
        expect(textAnnotation!.lockMovementY).toBe(false);
      });
    });

    describe('デフォルトスタイルオプション', () => {
      it('デフォルトのフォントサイズは16pxである', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fontSize).toBe(DEFAULT_TEXT_OPTIONS.fontSize);
      });

      it('デフォルトのフォントファミリーはsans-serifである', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fontFamily).toBe(DEFAULT_TEXT_OPTIONS.fontFamily);
      });

      it('デフォルトの文字色は黒（#000000）である', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fill).toBe(DEFAULT_TEXT_OPTIONS.fill);
      });

      it('デフォルトの背景色は透明である', () => {
        const position: Point = { x: 100, y: 200 };

        const textAnnotation = createTextAnnotation(position);

        expect(textAnnotation).not.toBeNull();
        // Fabric.jsでは透明は空文字列として扱われる
        expect(textAnnotation!.backgroundColor).toBe('');
      });
    });

    describe('スタイルカスタマイズ', () => {
      it('フォントサイズをカスタマイズできる', () => {
        const position: Point = { x: 100, y: 200 };
        const options: Partial<TextAnnotationOptions> = { fontSize: 24 };

        const textAnnotation = createTextAnnotation(position, options);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fontSize).toBe(24);
      });

      it('フォントファミリーをカスタマイズできる', () => {
        const position: Point = { x: 100, y: 200 };
        const options: Partial<TextAnnotationOptions> = { fontFamily: 'serif' };

        const textAnnotation = createTextAnnotation(position, options);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fontFamily).toBe('serif');
      });

      it('文字色をカスタマイズできる', () => {
        const position: Point = { x: 100, y: 200 };
        const options: Partial<TextAnnotationOptions> = { fill: '#ff0000' };

        const textAnnotation = createTextAnnotation(position, options);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.fill).toBe('#ff0000');
      });

      it('背景色をカスタマイズできる', () => {
        const position: Point = { x: 100, y: 200 };
        const options: Partial<TextAnnotationOptions> = { backgroundColor: '#ffff00' };

        const textAnnotation = createTextAnnotation(position, options);

        expect(textAnnotation).not.toBeNull();
        expect(textAnnotation!.backgroundColor).toBe('#ffff00');
      });
    });
  });

  // ==========================================================================
  // TextAnnotationクラスの詳細テスト
  // ==========================================================================
  describe('TextAnnotationクラス', () => {
    describe('インスタンス作成', () => {
      it('TextAnnotationクラスのインスタンスが作成できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        expect(textAnnotation).toBeInstanceOf(TextAnnotation);
      });

      it('位置プロパティが設定される', () => {
        const position: Point = { x: 150, y: 250 };
        const textAnnotation = new TextAnnotation(position);

        expect(textAnnotation.position).toEqual(position);
      });

      it('オプションを指定してインスタンスが作成できる', () => {
        const options: Partial<TextAnnotationOptions> = {
          initialText: '初期テキスト',
          fontSize: 20,
          fontFamily: 'serif',
          fill: '#0000ff',
          backgroundColor: '#ffffff',
        };
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 }, options);

        expect(textAnnotation.text).toBe('初期テキスト');
        expect(textAnnotation.fontSize).toBe(20);
        expect(textAnnotation.fontFamily).toBe('serif');
        expect(textAnnotation.fill).toBe('#0000ff');
        expect(textAnnotation.backgroundColor).toBe('#ffffff');
      });
    });

    describe('テキストの更新', () => {
      it('テキストを更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setText('新しいテキスト');

        expect(textAnnotation.text).toBe('新しいテキスト');
      });

      it('空のテキストに更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 }, { initialText: 'テスト' });

        textAnnotation.setText('');

        expect(textAnnotation.text).toBe('');
      });

      it('テキストの取得ができる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { initialText: '取得テスト' }
        );

        const text = textAnnotation.getText();

        expect(text).toBe('取得テスト');
      });
    });

    describe('位置の更新', () => {
      it('位置を更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setPosition({ x: 300, y: 400 });

        expect(textAnnotation.position).toEqual({ x: 300, y: 400 });
      });

      it('位置更新後にsetCoords()が呼ばれる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setPosition({ x: 300, y: 400 });

        expect(mockSetCoords).toHaveBeenCalled();
      });
    });

    describe('スタイルの更新', () => {
      it('フォントサイズを更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFontSize(24);

        expect(textAnnotation.fontSize).toBe(24);
      });

      it('フォントファミリーを更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFontFamily('monospace');

        expect(textAnnotation.fontFamily).toBe('monospace');
      });

      it('文字色を更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFill('#00ff00');

        expect(textAnnotation.fill).toBe('#00ff00');
      });

      it('背景色を更新できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setBackgroundColor('#eeeeee');

        expect(textAnnotation.backgroundColor).toBe('#eeeeee');
      });

      it('スタイルを一括で変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setStyle({
          fontSize: 28,
          fontFamily: 'cursive',
          fill: '#ff00ff',
          backgroundColor: '#cccccc',
        });

        expect(textAnnotation.fontSize).toBe(28);
        expect(textAnnotation.fontFamily).toBe('cursive');
        expect(textAnnotation.fill).toBe('#ff00ff');
        expect(textAnnotation.backgroundColor).toBe('#cccccc');
      });

      it('現在のスタイルを取得できる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { fontSize: 18, fontFamily: 'serif', fill: '#123456', backgroundColor: '#abcdef' }
        );

        const style = textAnnotation.getStyle();

        expect(style.fontSize).toBe(18);
        expect(style.fontFamily).toBe('serif');
        expect(style.fill).toBe('#123456');
        expect(style.backgroundColor).toBe('#abcdef');
      });
    });

    describe('toObject()のシリアライズ', () => {
      it('スタイル情報がシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { fontSize: 20, fontFamily: 'serif', fill: '#ff0000', backgroundColor: '#ffffff' }
        );

        const json = textAnnotation.toObject();

        expect(json.fontSize).toBe(20);
        expect(json.fontFamily).toBe('serif');
        expect(json.fill).toBe('#ff0000');
        expect(json.backgroundColor).toBe('#ffffff');
      });

      it('位置情報がシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation({ x: 150, y: 250 });

        const json = textAnnotation.toObject();

        expect(json.position).toEqual({ x: 150, y: 250 });
      });

      it('テキスト内容がシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { initialText: 'シリアライズテスト' }
        );

        const json = textAnnotation.toObject();

        expect(json.text).toBe('シリアライズテスト');
      });
    });

    describe('編集モード', () => {
      it('編集モードに入れる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.enterEditing();

        expect(textAnnotation.isEditing).toBe(true);
      });

      it('編集モードを終了できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.enterEditing();

        textAnnotation.exitEditing();

        expect(textAnnotation.isEditing).toBe(false);
      });

      it('初期状態では編集モードではない', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        expect(textAnnotation.isEditing).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Task 16.2: テキスト編集機能テスト
  // ==========================================================================
  describe('テキスト編集機能', () => {
    describe('ダブルクリックによる編集モード（Requirements 8.2）', () => {
      it('ダブルクリックイベントを登録できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        const callback = vi.fn();

        textAnnotation.on('mousedblclick', callback);

        expect(mockOnCallbacks.has('mousedblclick')).toBe(true);
      });

      it('ダブルクリックで編集モードに入る', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 }, { initialText: 'テスト' });
        const mockCanvas = { selection: true };
        textAnnotation.setupDoubleClickEditing(mockCanvas as unknown as FabricCanvas);

        // ダブルクリックイベントをシミュレート
        textAnnotation.fire('mousedblclick');

        expect(textAnnotation.isEditing).toBe(true);
      });

      it('編集モード中はキャンバスの選択が無効化される', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 }, { initialText: 'テスト' });
        const mockCanvas = { selection: true };
        textAnnotation.setupDoubleClickEditing(mockCanvas as unknown as FabricCanvas);

        textAnnotation.fire('mousedblclick');

        expect(mockCanvas.selection).toBe(false);
      });

      it('編集終了時にキャンバスの選択が再有効化される', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 }, { initialText: 'テスト' });
        const mockCanvas = { selection: true };
        textAnnotation.setupDoubleClickEditing(mockCanvas as unknown as FabricCanvas);
        textAnnotation.fire('mousedblclick');

        textAnnotation.exitEditing();

        expect(mockCanvas.selection).toBe(true);
      });

      it('テキストが空の場合も編集モードに入れる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        const mockCanvas = { selection: true };
        textAnnotation.setupDoubleClickEditing(mockCanvas as unknown as FabricCanvas);

        textAnnotation.fire('mousedblclick');

        expect(textAnnotation.isEditing).toBe(true);
      });
    });

    describe('フォントサイズ変更（Requirements 8.3, 8.5）', () => {
      it('フォントサイズを変更するとすぐに反映される', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFontSize(24);

        expect(textAnnotation.fontSize).toBe(24);
        expect(mockSet).toHaveBeenCalledWith('fontSize', 24);
      });

      it('フォントサイズの最小値は8pxである', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFontSize(8);

        expect(textAnnotation.fontSize).toBe(8);
      });

      it('フォントサイズの最大値は72pxである', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFontSize(72);

        expect(textAnnotation.fontSize).toBe(72);
      });

      it('複数のプリセットサイズが設定可能', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        const presetSizes = [12, 14, 16, 18, 24, 32, 48, 64];

        presetSizes.forEach((size) => {
          textAnnotation.setFontSize(size);
          expect(textAnnotation.fontSize).toBe(size);
        });
      });
    });

    describe('文字色変更（Requirements 8.5）', () => {
      it('文字色を変更するとすぐに反映される', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFill('#ff0000');

        expect(textAnnotation.fill).toBe('#ff0000');
        expect(mockSet).toHaveBeenCalledWith('fill', '#ff0000');
      });

      it('HEXカラーコードで文字色を設定できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setFill('#00ff00');

        expect(textAnnotation.fill).toBe('#00ff00');
      });

      it('複数のプリセット色が設定可能', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        const presetColors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];

        presetColors.forEach((color) => {
          textAnnotation.setFill(color);
          expect(textAnnotation.fill).toBe(color);
        });
      });
    });

    describe('背景色変更（Requirements 8.5）', () => {
      it('背景色を変更するとすぐに反映される', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setBackgroundColor('#ffff00');

        expect(textAnnotation.backgroundColor).toBe('#ffff00');
        expect(mockSet).toHaveBeenCalledWith('backgroundColor', '#ffff00');
      });

      it('透明な背景色を設定できる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { backgroundColor: '#ffffff' }
        );

        textAnnotation.setBackgroundColor('transparent');

        expect(textAnnotation.backgroundColor).toBe('');
      });

      it('背景色を透明からカラーに変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setBackgroundColor('#cccccc');

        expect(textAnnotation.backgroundColor).toBe('#cccccc');
      });

      it('複数のプリセット背景色が設定可能', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        const presetColors = ['#ffffff', '#ffff00', '#ff00ff', '#00ffff'];

        presetColors.forEach((color) => {
          textAnnotation.setBackgroundColor(color);
          expect(textAnnotation.backgroundColor).toBe(color);
        });
      });
    });

    describe('スタイル一括変更', () => {
      it('フォントサイズ、文字色、背景色を一度に変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });

        textAnnotation.setStyle({
          fontSize: 24,
          fill: '#ff0000',
          backgroundColor: '#ffff00',
        });

        expect(textAnnotation.fontSize).toBe(24);
        expect(textAnnotation.fill).toBe('#ff0000');
        expect(textAnnotation.backgroundColor).toBe('#ffff00');
      });

      it('一部のスタイルのみ変更できる', () => {
        const textAnnotation = new TextAnnotation(
          { x: 100, y: 200 },
          { fontSize: 16, fill: '#000000', backgroundColor: 'transparent' }
        );

        textAnnotation.setStyle({ fontSize: 20 });

        expect(textAnnotation.fontSize).toBe(20);
        expect(textAnnotation.fill).toBe('#000000'); // 変更なし
        expect(textAnnotation.backgroundColor).toBe(''); // 変更なし
      });
    });

    describe('編集中のスタイル変更', () => {
      it('編集モード中でもフォントサイズを変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.enterEditing();

        textAnnotation.setFontSize(32);

        expect(textAnnotation.fontSize).toBe(32);
        expect(textAnnotation.isEditing).toBe(true);
      });

      it('編集モード中でも文字色を変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.enterEditing();

        textAnnotation.setFill('#0000ff');

        expect(textAnnotation.fill).toBe('#0000ff');
        expect(textAnnotation.isEditing).toBe(true);
      });

      it('編集モード中でも背景色を変更できる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.enterEditing();

        textAnnotation.setBackgroundColor('#eeeeee');

        expect(textAnnotation.backgroundColor).toBe('#eeeeee');
        expect(textAnnotation.isEditing).toBe(true);
      });
    });

    describe('toObject()のシリアライズ（編集機能対応）', () => {
      it('変更後のフォントサイズがシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.setFontSize(28);

        const json = textAnnotation.toObject();

        expect(json.fontSize).toBe(28);
      });

      it('変更後の文字色がシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.setFill('#ff6600');

        const json = textAnnotation.toObject();

        expect(json.fill).toBe('#ff6600');
      });

      it('変更後の背景色がシリアライズに含まれる', () => {
        const textAnnotation = new TextAnnotation({ x: 100, y: 200 });
        textAnnotation.setBackgroundColor('#99ccff');

        const json = textAnnotation.toObject();

        expect(json.backgroundColor).toBe('#99ccff');
      });
    });
  });
});
