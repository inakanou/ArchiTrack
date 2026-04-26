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
 *
 * @requirement site-survey/REQ-25.1
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-25.3
 * @requirement site-survey/REQ-25.4
 * @requirement site-survey/REQ-25.5
 * @requirement site-survey/REQ-25.6
 * @requirement site-survey/REQ-25.7
 * @requirement site-survey/REQ-25.8
 * @requirement site-survey/REQ-25.10
 * @requirement site-survey/REQ-25.11
 * @requirement site-survey/REQ-25.12
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.2
 * @requirement site-survey/REQ-26.5
 */

import { IText, type Canvas as FabricCanvas } from 'fabric';

import { ANNOTATION_DEFAULTS, type TextOutlineAttribute } from '../annotation-style-tokens';

export type { TextOutlineAttribute };

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
  /**
   * 白アウトライン属性（Task 66.1 / Req 25.1, 25.3, 25.12）
   *
   * 省略時は `ANNOTATION_DEFAULTS.textOutline` が既定値として適用される。
   */
  textOutline?: TextOutlineAttribute;
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
  /**
   * 白アウトライン属性（Task 66.2 / Req 25.7, 25.8, 25.10）
   *
   * 未定義の旧データは白アウトラインなしの従来表現で復元される（Req 25.10 後方互換）。
   */
  textOutline?: TextOutlineAttribute;
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
 * 白アウトライン widthRatio の許容範囲（design.md `TextOutlineAttribute` 0.10〜0.20）
 *
 * Task 66.2: `setTextOutline` では本範囲外の値をクランプする。
 */
const TEXT_OUTLINE_WIDTH_RATIO_MIN = 0.1;
const TEXT_OUTLINE_WIDTH_RATIO_MAX = 0.2;

/**
 * 白アウトラインストロークの色（固定値、Req 25.4）
 */
const TEXT_OUTLINE_STROKE_COLOR = '#ffffff';

/**
 * デフォルトのテキストオプション
 *
 * Task 64.3: 本体色（fill）/フォントサイズは `ANNOTATION_DEFAULTS`（Req 26.5 一元管理
 * トークン）を参照。テキストの `fill` は本体色（筆跡色）を意味するため、
 * `ANNOTATION_DEFAULTS.stroke`（赤系トークン）を採用する（Req 26.2）。
 * `DEFAULT_BALLOON_OPTIONS` は吹き出し枠の別概念スタイルのため変更しない。
 */
export const DEFAULT_TEXT_OPTIONS: TextAnnotationOptions = {
  initialText: '',
  fontSize: ANNOTATION_DEFAULTS.fontSize,
  fontFamily: 'sans-serif',
  fill: ANNOTATION_DEFAULTS.stroke,
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

  /**
   * 白アウトライン属性（Task 66.1 / Req 25.1, 25.3, 25.12）
   *
   * 既定値は `ANNOTATION_DEFAULTS.textOutline` に従う。
   * 本タスクでは内部状態の保持と `getTextOutline()` による参照のみを提供する。
   * 有効時、コンストラクタで IText に `paintFirst: 'stroke'`・`stroke: '#ffffff'`・
   * `strokeWidth = fontSize * widthRatio`・`strokeUniform: true` を適用する。
   */
  private _textOutline: TextOutlineAttribute = {
    enabled: ANNOTATION_DEFAULTS.textOutline.enabled,
    widthRatio: ANNOTATION_DEFAULTS.textOutline.widthRatio,
  };

  /**
   * `_applyOutlineToIText` / `set` オーバーライド再入ガード（Task 66.2）
   *
   * `_applyOutlineToIText` 内の `super.set` は本フラグを立てて実行され、
   * `set` オーバーライドの fontSize 監視ロジックをバイパスして無限ループを防ぐ。
   */
  private _isApplyingOutline: boolean = false;

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

    // 白アウトライン設定を解決（Task 66.1 / Req 25.1, 25.3, 25.12）
    // 指定があれば明示値、なければ ANNOTATION_DEFAULTS.textOutline を既定として使用。
    const resolvedTextOutline: TextOutlineAttribute = {
      enabled: options.textOutline?.enabled ?? ANNOTATION_DEFAULTS.textOutline.enabled,
      widthRatio: options.textOutline?.widthRatio ?? ANNOTATION_DEFAULTS.textOutline.widthRatio,
    };

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
      // マルチバイト文字対応: グラフィームで分割（Req 25.12 既存挙動維持）
      splitByGrapheme: true,
      // 編集モードのスタイル
      editingBorderColor: '#3b82f6',
      cursorColor: '#3b82f6',
    };

    // 白アウトライン有効時のみ IText 側にストローク属性を追加（Req 25.1）。
    // backgroundColor は上で既に設定済みで、ここでは上書きしないため独立制御が保たれる（Req 25.3）。
    if (resolvedTextOutline.enabled) {
      iTextOptions.paintFirst = 'stroke';
      iTextOptions.stroke = '#ffffff';
      iTextOptions.strokeWidth = mergedOptions.fontSize * resolvedTextOutline.widthRatio;
      iTextOptions.strokeUniform = true;
    }

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

    // 白アウトライン内部状態を保持
    this._textOutline = resolvedTextOutline;

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
  // 白アウトライン（Task 66.1 / Req 25.1, 25.3, 25.12）
  // ==========================================================================

  /**
   * 白アウトライン属性を取得する
   *
   * @returns 現在の `TextOutlineAttribute`（常に新しいオブジェクトを返し内部状態を破壊させない）
   */
  getTextOutline(): TextOutlineAttribute {
    return { ...this._textOutline };
  }

  /**
   * 白アウトライン属性を更新する
   *
   * Task 66.2 (Req 25.2, 25.4, 25.6, 25.11):
   * - 内部状態 `_textOutline` を部分更新（enabled / widthRatio）
   * - `widthRatio` は [0.10, 0.20] にクランプ（design.md `TextOutlineAttribute`）
   * - IText 側の `stroke` / `strokeWidth` / `paintFirst` / `strokeUniform` を
   *   enabled 状態に応じて適用する（enabled=false のとき `stroke=''`, `strokeWidth=0`）
   * - canvas にアタッチ済みの場合、`object:modified` を発火して Undo/Redo 履歴に記録する
   *   （Req 25.11）。canvas 未アタッチ時は安全に no-op（例外を投げない）。
   *
   * @param next 部分更新値（指定されたフィールドのみ反映）
   */
  setTextOutline(next: Partial<TextOutlineAttribute>): void {
    const mergedEnabled = next.enabled ?? this._textOutline.enabled;
    const mergedWidthRatio = next.widthRatio ?? this._textOutline.widthRatio;

    // widthRatio を [0.10, 0.20] にクランプ（design.md 4497）
    const clampedWidthRatio = Math.min(
      TEXT_OUTLINE_WIDTH_RATIO_MAX,
      Math.max(TEXT_OUTLINE_WIDTH_RATIO_MIN, mergedWidthRatio)
    );

    this._textOutline = {
      enabled: mergedEnabled,
      widthRatio: clampedWidthRatio,
    };

    // IText 側の描画属性を再適用
    this._applyOutlineToIText();

    // Req 25.11: Undo/Redo 履歴記録のため canvas:object:modified を発火する
    // Fabric.js v6 以降は FabricObject.canvas プロパティがアタッチ後に設定される。
    // canvas 未アタッチ（新規生成直後など）は安全に skip。
    const attachedCanvas = (
      this as unknown as { canvas?: { fire?: (event: string, options?: unknown) => void } }
    ).canvas;
    attachedCanvas?.fire?.('object:modified', { target: this });
  }

  /**
   * 現在の `_textOutline` 状態と `fontSize` を元に IText 側の描画属性を再適用する
   *
   * - enabled=true: `paintFirst='stroke'`, `stroke='#ffffff'`,
   *   `strokeWidth = fontSize * widthRatio`, `strokeUniform=true`
   * - enabled=false: `stroke=''`, `strokeWidth=0`（無効化）
   *
   * Task 66.2 (Req 25.2, 25.5, 25.6): `setTextOutline` と
   * `set('fontSize', ...)` 双方から呼び出される集約処理。
   */
  private _applyOutlineToIText(): void {
    // 再入ガードを立ててから super.set を直接呼び出す
    // （this.set 経由にすると override が fontSize 監視ロジックに入る可能性がある）
    this._isApplyingOutline = true;
    try {
      if (this._textOutline.enabled) {
        super.set({
          paintFirst: 'stroke',
          stroke: TEXT_OUTLINE_STROKE_COLOR,
          strokeWidth: this.fontSize * this._textOutline.widthRatio,
          strokeUniform: true,
        });
      } else {
        super.set({
          stroke: '',
          strokeWidth: 0,
        });
      }
    } finally {
      this._isApplyingOutline = false;
    }
  }

  // ==========================================================================
  // set() オーバーライド（Task 66.2 / Req 25.5）
  // ==========================================================================

  /**
   * プロパティ設定のオーバーライド
   *
   * Fabric.js の `set(key, value)` および `set(options)` の両形式をサポートする。
   * `fontSize` が更新された場合、白アウトラインが有効なら
   * `strokeWidth = fontSize * widthRatio` を自動再計算する（Req 25.5）。
   *
   * 本メソッドは `_applyOutlineToIText` から再入する可能性があるため、
   * 再入中は fontSize 監視ロジックをスキップして無限ループを防ぐ。
   *
   * @param key プロパティ名 または プロパティ/値のオブジェクト
   * @param value プロパティ値（key が string の場合のみ使用）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override set(key: any, value?: any): this {
    // 親クラスに委譲して実際の値更新を行う
    super.set(key, value);

    // 再入ガード: `_applyOutlineToIText` からの set では再計算しない
    if (this._isApplyingOutline) {
      return this;
    }

    // _textOutline が未初期化（super コンストラクタ中の呼び出し）の場合は skip
    if (!this._textOutline) {
      return this;
    }

    // fontSize が更新されたかを判定（(key, value) / (options) 両形式に対応）
    let fontSizeChanged = false;
    if (typeof key === 'string') {
      if (key === 'fontSize') {
        fontSizeChanged = true;
      }
    } else if (key !== null && typeof key === 'object') {
      if (Object.prototype.hasOwnProperty.call(key, 'fontSize')) {
        fontSizeChanged = true;
      }
    }

    if (fontSizeChanged && this._textOutline.enabled) {
      // strokeWidth の再計算のみ行う（stroke 等は変更しない）
      this._isApplyingOutline = true;
      try {
        super.set('strokeWidth', this.fontSize * this._textOutline.widthRatio);
      } finally {
        this._isApplyingOutline = false;
      }
    }

    return this;
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
   *
   * ドラッグ移動後の位置を正しく保存するため、Fabric.jsのleft/topプロパティを使用する
   */
  // @ts-expect-error - Fabric.js v6のtoObjectシグネチャとの互換性のため型を簡略化
  override toObject(): TextAnnotationJSON {
    // ドラッグ移動で変更されるleft/topを使用（_positionは初期値のまま更新されない）
    const currentPosition: Point = {
      x: this.left ?? this._position.x,
      y: this.top ?? this._position.y,
    };

    return {
      type: 'textAnnotation' as const,
      text: this.getText(),
      position: currentPosition,
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
      // 白アウトライン属性（Task 66.2 / Req 25.7）
      // 新規保存時は必ず現状の _textOutline を含める（enabled=false の場合も含める）。
      textOutline: { ...this._textOutline },
    };
  }

  /**
   * JSONオブジェクトからTextAnnotationを復元する
   *
   * Fabric.js v6のenlivenObjectsで使用される静的メソッド。
   * classRegistryに登録されたクラスはこのメソッドを通じて復元される。
   *
   * Task 66.2 (Req 25.8, 25.10):
   * - `object.textOutline` 定義時は `setTextOutline` で復元（Req 25.8）
   * - `object.textOutline` 未定義の旧データは「白アウトラインなし」の従来表現で復元する
   *   （Req 25.10 後方互換）。`_textOutline.enabled=false` にして `stroke=''`・`strokeWidth=0`。
   * - 必須フィールド（text / position / fontSize / fontFamily / fill）欠落や
   *   null/undefined 受領時は安全な既定値で復元し `console.warn` を送出する（防御的フォールバック）。
   *
   * @param object シリアライズされたJSONオブジェクト（null/undefined/不正値を許容）
   * @returns 復元されたTextAnnotationインスタンス
   */
  static override fromObject(object: TextAnnotationJSON): Promise<TextAnnotation> {
    // 防御的バリデーション: 必須フィールド確認
    const safeDefaults = {
      text: '',
      position: { x: 0, y: 0 } as Point,
      fontSize: 16,
      fontFamily: 'sans-serif',
      fill: '#000000',
      backgroundColor: 'transparent',
    };

    const isValidInput = object != null && typeof object === 'object';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = object as any;
    const hasValidRequiredFields =
      isValidInput &&
      typeof raw.text === 'string' &&
      raw.position != null &&
      typeof raw.position === 'object' &&
      typeof raw.position.x === 'number' &&
      typeof raw.position.y === 'number' &&
      typeof raw.fontSize === 'number' &&
      typeof raw.fontFamily === 'string' &&
      typeof raw.fill === 'string';

    let text: string;
    let position: Point;
    let fontSize: number;
    let fontFamily: string;
    let fill: string;
    let backgroundColor: string;

    if (!hasValidRequiredFields) {
      console.warn('[TextTool] fromObject: missing required fields, using safe defaults', {
        received: object,
      });
      text = safeDefaults.text;
      position = safeDefaults.position;
      fontSize = safeDefaults.fontSize;
      fontFamily = safeDefaults.fontFamily;
      fill = safeDefaults.fill;
      backgroundColor = safeDefaults.backgroundColor;
    } else {
      text = raw.text;
      position = raw.position;
      fontSize = raw.fontSize;
      fontFamily = raw.fontFamily;
      fill = raw.fill;
      backgroundColor =
        typeof raw.backgroundColor === 'string'
          ? raw.backgroundColor
          : safeDefaults.backgroundColor;
    }

    const textAnnotation = new TextAnnotation(position, {
      initialText: text,
      fontSize,
      fontFamily,
      fill,
      backgroundColor,
      balloonStyle: isValidInput ? raw.balloonStyle : undefined,
    });

    // 吹き出し設定を復元
    if (isValidInput) {
      if (typeof raw.balloonBackgroundColor === 'string') {
        textAnnotation.setBalloonBackgroundColor(raw.balloonBackgroundColor);
      }
      if (typeof raw.balloonStrokeColor === 'string') {
        textAnnotation.setBalloonStrokeColor(raw.balloonStrokeColor);
      }
      if (typeof raw.balloonStrokeWidth === 'number') {
        textAnnotation.setBalloonStrokeWidth(raw.balloonStrokeWidth);
      }
      if (typeof raw.balloonPadding === 'number') {
        textAnnotation.setBalloonPadding(raw.balloonPadding);
      }
    }

    // 白アウトライン属性の復元（Task 66.2 / Req 25.8, 25.10）
    if (isValidInput && hasValidRequiredFields && raw.textOutline !== undefined) {
      // Req 25.8: 保存された textOutline を復元
      textAnnotation.setTextOutline(raw.textOutline);
    } else {
      // Req 25.10: textOutline 未定義の旧データは白アウトラインなしの従来表現で復元
      // コンストラクタ既定では enabled=true なので明示的に無効化する。
      textAnnotation.setTextOutline({ enabled: false });
    }

    return Promise.resolve(textAnnotation);
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
