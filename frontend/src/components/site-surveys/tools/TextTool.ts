/**
 * @fileoverview テキストツール
 *
 * Task 16.1: テキスト入力機能を実装する
 * Task 16.2: テキスト編集機能を実装する
 * Task 16.3: 吹き出し形式を実装する
 *
 * クリック位置へのテキストフィールド表示、
 * 日本語を含むマルチバイト文字対応、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 * - 8.2: 既存のテキストをダブルクリックするとテキストを編集モードにする
 * - 8.3: テキスト入力中にフォントサイズを変更するとテキストのフォントサイズをリアルタイムで反映する
 * - 8.5: テキストのフォントサイズ・色・背景色をカスタマイズ可能にする
 * - 8.6: テキストに吹き出し形式（四角・角丸・楕円・雲など）を適用可能にする
 * - 8.7: 日本語を含むマルチバイト文字の入力・表示をサポートする
 */

import { IText, type Canvas as FabricCanvas } from 'fabric';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 2D座標を表すポイント
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 吹き出しスタイルの種類
 * Task 16.3: 吹き出し形式
 */
export type BalloonStyleType = 'none' | 'rectangle' | 'rounded' | 'ellipse' | 'cloud';

/**
 * 吹き出しオプション
 */
export interface BalloonOptions {
  /** 吹き出しスタイル */
  style?: BalloonStyleType;
  /** 吹き出し背景色 */
  backgroundColor?: string;
  /** 吹き出し枠線色 */
  strokeColor?: string;
  /** 吹き出し枠線の太さ */
  strokeWidth?: number;
  /** 吹き出しのパディング */
  padding?: number;
}

/**
 * テキストアノテーションのオプション
 */
export interface TextAnnotationOptions {
  /** 初期テキスト */
  initialText: string;
  /** フォントサイズ（ピクセル） */
  fontSize: number;
  /** フォントファミリー */
  fontFamily: string;
  /** 文字色（HEXカラーコード） */
  fill: string;
  /** 背景色（HEXカラーコード） */
  backgroundColor: string;
  /** 吹き出しスタイル（Task 16.3） */
  balloonStyle?: BalloonStyleType;
}

/**
 * テキストアノテーションのスタイルオプション
 */
export interface TextStyleOptions {
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  backgroundColor?: string;
}

/**
 * テキストアノテーションのシリアライズ形式
 */
export interface TextAnnotationJSON {
  type: 'textAnnotation';
  text: string;
  position: Point;
  fontSize: number;
  fontFamily: string;
  fill: string;
  backgroundColor: string;
  /** 吹き出しスタイル（Task 16.3） */
  balloonStyle: BalloonStyleType;
  /** 吹き出し背景色 */
  balloonBackgroundColor: string;
  /** 吹き出し枠線色 */
  balloonStrokeColor: string;
  /** 吹き出し枠線の太さ */
  balloonStrokeWidth: number;
  /** 吹き出しのパディング */
  balloonPadding: number;
}

// ============================================================================
// 定数定義
// ============================================================================

/**
 * 吹き出しスタイル定数
 * Task 16.3: 吹き出し形式
 */
export const BALLOON_STYLES = {
  NONE: 'none' as const,
  RECTANGLE: 'rectangle' as const,
  ROUNDED: 'rounded' as const,
  ELLIPSE: 'ellipse' as const,
  CLOUD: 'cloud' as const,
};

/**
 * デフォルトの吹き出しオプション
 * Task 16.3: 吹き出し形式
 */
export const DEFAULT_BALLOON_OPTIONS: Required<BalloonOptions> = {
  style: 'none',
  backgroundColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 1,
  padding: 8,
};

/**
 * デフォルトのテキストオプション
 */
export const DEFAULT_TEXT_OPTIONS: TextAnnotationOptions = {
  initialText: '',
  fontSize: 16,
  fontFamily: 'sans-serif',
  fill: '#000000',
  backgroundColor: 'transparent',
};

// ============================================================================
// TextAnnotationクラス
// ============================================================================

/**
 * テキストアノテーションクラス
 *
 * Fabric.js ITextを拡張したテキストアノテーションオブジェクト。
 * クリック位置にテキストフィールドを表示し、マルチバイト文字をサポートする。
 */
export class TextAnnotation extends IText {
  /** 位置 */
  private _position: Point;

  /** キャンバス参照（編集モード用） */
  private _canvas: FabricCanvas | null = null;

  /** 吹き出しスタイル（Task 16.3） */
  private _balloonStyle: BalloonStyleType = 'none';

  /** 吹き出し背景色 */
  private _balloonBackgroundColor: string = DEFAULT_BALLOON_OPTIONS.backgroundColor;

  /** 吹き出し枠線色 */
  private _balloonStrokeColor: string = DEFAULT_BALLOON_OPTIONS.strokeColor;

  /** 吹き出し枠線の太さ */
  private _balloonStrokeWidth: number = DEFAULT_BALLOON_OPTIONS.strokeWidth;

  /** 吹き出しのパディング */
  private _balloonPadding: number = DEFAULT_BALLOON_OPTIONS.padding;

  /** フォントサイズ */
  declare fontSize: number;

  /** フォントファミリー */
  declare fontFamily: string;

  /** 文字色 */
  declare fill: string;

  /** 背景色 */
  declare backgroundColor: string;

  /** コントロール表示フラグ */
  declare hasControls: boolean;

  /** ボーダー表示フラグ */
  declare hasBorders: boolean;

  /** X軸移動ロック */
  declare lockMovementX: boolean;

  /** Y軸移動ロック */
  declare lockMovementY: boolean;

  /** 編集可能フラグ */
  declare editable: boolean;

  /** 編集中フラグ */
  declare isEditing: boolean;

  /**
   * TextAnnotationコンストラクタ
   *
   * @param position 配置位置
   * @param options オプション
   */
  constructor(position: Point, options: Partial<TextAnnotationOptions> = {}) {
    // 設定をマージ
    const mergedOptions = { ...DEFAULT_TEXT_OPTIONS, ...options };

    // ITextを初期化
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iTextOptions: any = {
      left: position.x,
      top: position.y,
      fontSize: mergedOptions.fontSize,
      fontFamily: mergedOptions.fontFamily,
      fill: mergedOptions.fill,
      backgroundColor:
        mergedOptions.backgroundColor === 'transparent' ? '' : mergedOptions.backgroundColor,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      originX: 'left',
      originY: 'top',
      // マルチバイト文字対応: グラフィームで分割
      splitByGrapheme: true,
      // 編集モードのスタイル
      editingBorderColor: '#3b82f6',
      cursorColor: '#3b82f6',
    };
    super(mergedOptions.initialText, iTextOptions);

    // プロパティを設定
    this._position = { ...position };
    this.fontSize = mergedOptions.fontSize;
    this.fontFamily = mergedOptions.fontFamily;
    this.fill = mergedOptions.fill;
    this.backgroundColor =
      mergedOptions.backgroundColor === 'transparent' ? '' : mergedOptions.backgroundColor;
    this.hasControls = true;
    this.hasBorders = true;
    this.lockMovementX = false;
    this.lockMovementY = false;
    this.editable = true;
    this.isEditing = false;

    // 吹き出しスタイルの初期化（Task 16.3）
    if (mergedOptions.balloonStyle) {
      this._balloonStyle = mergedOptions.balloonStyle;
    }
  }

  // ==========================================================================
  // ゲッター
  // ==========================================================================

  /** オブジェクトタイプを取得 */
  override get type(): string {
    return 'textAnnotation';
  }

  /** 位置を取得 */
  get position(): Point {
    return { ...this._position };
  }

  /** 編集可能かどうかを取得 */
  get isEditable(): boolean {
    return this.editable;
  }

  // ==========================================================================
  // テキスト操作
  // ==========================================================================

  /**
   * テキストを設定
   */
  setText(text: string): void {
    this.set('text', text);
  }

  /**
   * テキストを取得
   */
  getText(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).text || '';
  }

  // ==========================================================================
  // 位置操作
  // ==========================================================================

  /**
   * 位置を設定
   */
  setPosition(position: Point): void {
    this._position = { ...position };
    this.set({
      left: position.x,
      top: position.y,
    });
    this.setCoords();
  }

  // ==========================================================================
  // スタイル操作
  // ==========================================================================

  /**
   * フォントサイズを設定
   */
  setFontSize(size: number): void {
    this.fontSize = size;
    this.set('fontSize', size);
  }

  /**
   * フォントファミリーを設定
   */
  setFontFamily(family: string): void {
    this.fontFamily = family;
    this.set('fontFamily', family);
  }

  /**
   * 文字色を設定
   */
  setFill(color: string): void {
    this.fill = color;
    this.set('fill', color);
  }

  /**
   * 背景色を設定
   */
  setBackgroundColor(color: string): void {
    this.backgroundColor = color === 'transparent' ? '' : color;
    this.set('backgroundColor', this.backgroundColor);
  }

  /**
   * スタイルを一括で設定
   */
  setStyle(options: TextStyleOptions): void {
    if (options.fontSize !== undefined) {
      this.setFontSize(options.fontSize);
    }
    if (options.fontFamily !== undefined) {
      this.setFontFamily(options.fontFamily);
    }
    if (options.fill !== undefined) {
      this.setFill(options.fill);
    }
    if (options.backgroundColor !== undefined) {
      this.setBackgroundColor(options.backgroundColor);
    }
  }

  /**
   * 現在のスタイルを取得
   */
  getStyle(): TextStyleOptions {
    return {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fill: this.fill,
      backgroundColor: this.backgroundColor || 'transparent',
    };
  }

  // ==========================================================================
  // 吹き出し操作（Task 16.3）
  // ==========================================================================

  /**
   * 吹き出しスタイルを取得
   */
  getBalloonStyle(): BalloonStyleType {
    return this._balloonStyle;
  }

  /**
   * 吹き出しスタイルを設定
   */
  setBalloonStyle(style: BalloonStyleType): void {
    this._balloonStyle = style;
  }

  /**
   * 吹き出し背景色を取得
   */
  getBalloonBackgroundColor(): string {
    return this._balloonBackgroundColor;
  }

  /**
   * 吹き出し背景色を設定
   */
  setBalloonBackgroundColor(color: string): void {
    this._balloonBackgroundColor = color;
  }

  /**
   * 吹き出し枠線色を取得
   */
  getBalloonStrokeColor(): string {
    return this._balloonStrokeColor;
  }

  /**
   * 吹き出し枠線色を設定
   */
  setBalloonStrokeColor(color: string): void {
    this._balloonStrokeColor = color;
  }

  /**
   * 吹き出し枠線の太さを取得
   */
  getBalloonStrokeWidth(): number {
    return this._balloonStrokeWidth;
  }

  /**
   * 吹き出し枠線の太さを設定
   */
  setBalloonStrokeWidth(width: number): void {
    this._balloonStrokeWidth = width;
  }

  /**
   * 吹き出しのパディングを取得
   */
  getBalloonPadding(): number {
    return this._balloonPadding;
  }

  /**
   * 吹き出しのパディングを設定
   */
  setBalloonPadding(padding: number): void {
    this._balloonPadding = padding;
  }

  /**
   * 吹き出しオプションを一括で取得
   */
  getBalloonOptions(): Required<BalloonOptions> {
    return {
      style: this._balloonStyle,
      backgroundColor: this._balloonBackgroundColor,
      strokeColor: this._balloonStrokeColor,
      strokeWidth: this._balloonStrokeWidth,
      padding: this._balloonPadding,
    };
  }

  /**
   * 吹き出しオプションを一括で設定
   */
  setBalloonOptions(options: BalloonOptions): void {
    if (options.style !== undefined) {
      this._balloonStyle = options.style;
    }
    if (options.backgroundColor !== undefined) {
      this._balloonBackgroundColor = options.backgroundColor;
    }
    if (options.strokeColor !== undefined) {
      this._balloonStrokeColor = options.strokeColor;
    }
    if (options.strokeWidth !== undefined) {
      this._balloonStrokeWidth = options.strokeWidth;
    }
    if (options.padding !== undefined) {
      this._balloonPadding = options.padding;
    }
  }

  // ==========================================================================
  // 編集モード
  // ==========================================================================

  /**
   * ダブルクリック編集モードを設定
   *
   * Task 16.2: ダブルクリックによる編集モード
   *
   * @param canvas Fabric.jsキャンバス
   */
  setupDoubleClickEditing(canvas: FabricCanvas): void {
    this._canvas = canvas;

    // ダブルクリックイベントを登録
    this.on('mousedblclick', () => {
      this.enterEditing();
      // 編集モード中はキャンバスの選択を無効化
      if (this._canvas) {
        this._canvas.selection = false;
      }
    });
  }

  /**
   * 編集モードに入る
   */
  override enterEditing(): this {
    // キャンバスの選択を無効化
    if (this._canvas) {
      this._canvas.selection = false;
    }
    // 親クラスのenterEditingを呼び出す（isEditingの設定と隠しtextareaの初期化を行う）
    super.enterEditing();
    // 隠しtextareaが作成されていない場合は明示的に初期化
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(this as any).hiddenTextarea && typeof this.initHiddenTextarea === 'function') {
      this.initHiddenTextarea();
    }
    return this;
  }

  /**
   * 編集モードを終了
   */
  override exitEditing(): this {
    this.isEditing = false;
    // キャンバスの選択を再有効化
    if (this._canvas) {
      this._canvas.selection = true;
    }
    super.exitEditing();
    return this;
  }

  // ==========================================================================
  // シリアライズ
  // ==========================================================================

  /**
   * オブジェクトをJSON形式にシリアライズ
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): TextAnnotationJSON {
    return {
      type: 'textAnnotation' as const,
      text: this.getText(),
      position: this.position,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fill: this.fill,
      backgroundColor: this.backgroundColor || 'transparent',
      // 吹き出し情報（Task 16.3）
      balloonStyle: this._balloonStyle,
      balloonBackgroundColor: this._balloonBackgroundColor,
      balloonStrokeColor: this._balloonStrokeColor,
      balloonStrokeWidth: this._balloonStrokeWidth,
      balloonPadding: this._balloonPadding,
    };
  }
}

// ============================================================================
// ファクトリ関数
// ============================================================================

/**
 * テキストアノテーションを作成するファクトリ関数
 *
 * @param position 配置位置
 * @param options オプション
 * @returns テキストアノテーションオブジェクト
 */
export function createTextAnnotation(
  position: Point,
  options?: Partial<TextAnnotationOptions>
): TextAnnotation {
  return new TextAnnotation(position, options);
}
