/**
 * @fileoverview テキストツール
 *
 * Task 16.1: テキスト入力機能を実装する
 *
 * クリック位置へのテキストフィールド表示、
 * 日本語を含むマルチバイト文字対応、
 * カスタムFabric.jsオブジェクト実装を行うモジュールです。
 *
 * Requirements:
 * - 8.1: テキストツールを選択して画像上をクリックするとテキスト入力用のフィールドを表示する
 * - 8.7: 日本語を含むマルチバイト文字の入力・表示をサポートする
 */

import { IText } from 'fabric';

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
}

// ============================================================================
// 定数定義
// ============================================================================

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
  // 編集モード
  // ==========================================================================

  /**
   * 編集モードに入る
   */
  override enterEditing(): this {
    this.isEditing = true;
    super.enterEditing();
    return this;
  }

  /**
   * 編集モードを終了
   */
  override exitEditing(): this {
    this.isEditing = false;
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
