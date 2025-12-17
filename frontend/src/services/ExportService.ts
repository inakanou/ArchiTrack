/**
 * ExportService - 注釈付き画像のエクスポート機能
 *
 * Task 20.1: 注釈付き画像のエクスポートを実装する
 * - Fabric.js toDataURLによる画像生成
 * - JPEG/PNG形式選択
 * - 解像度（品質）選択
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.1, 10.2, 10.3
 */

import type { Canvas as FabricCanvas } from 'fabric';
import type { DownloadOriginalImageOptions } from '../types/site-survey.types';

/**
 * 画像エクスポートオプション
 *
 * Requirements:
 * - 10.2: JPEG、PNG形式でのエクスポートをサポート
 * - 10.3: エクスポート画像の解像度（品質）を選択可能にする
 */
export interface ExportImageOptions {
  /** エクスポート形式: 'jpeg' または 'png' */
  format: 'jpeg' | 'png';
  /** 品質: 0.1 - 1.0（デフォルト: 0.9）JPEGの場合のみ有効 */
  quality?: number;
  /** 注釈を含めるかどうか（デフォルト: true） */
  includeAnnotations?: boolean;
}

// 型の再エクスポート
export type { DownloadOriginalImageOptions };

/**
 * ExportServiceインターフェース
 *
 * @see design.md - IExportService
 */
export interface IExportService {
  /**
   * 画像をエクスポートする
   * @param canvas Fabric.js Canvas
   * @param options エクスポートオプション
   * @returns Data URL形式の画像データ
   */
  exportImage(canvas: FabricCanvas, options: ExportImageOptions): string;

  /**
   * ファイルをダウンロードする
   * @param data Data URLまたはBlobデータ
   * @param filename ダウンロードファイル名
   */
  downloadFile(data: string | Blob, filename: string): void;

  /**
   * 元画像をダウンロードする（Task 20.2）
   *
   * 署名付きURLから元画像（注釈なし）をダウンロードする。
   * クロスオリジンの場合はfetchでBlobとして取得してからダウンロード。
   *
   * @param signedUrl 署名付きURL
   * @param options ダウンロードオプション
   *
   * Requirements: 10.4
   */
  downloadOriginalImage(signedUrl: string, options?: DownloadOriginalImageOptions): Promise<void>;
}

/**
 * 品質のデフォルト値
 */
const DEFAULT_QUALITY = 0.9;

/**
 * 品質の最小値
 */
const MIN_QUALITY = 0;

/**
 * 品質の最大値
 */
const MAX_QUALITY = 1.0;

/**
 * ExportServiceクラス
 *
 * Fabric.js Canvasから画像をエクスポートし、ダウンロードを実行する。
 *
 * Requirements:
 * - 10.1: 注釈をレンダリングした画像を生成する
 * - 10.2: JPEG、PNG形式でのエクスポートをサポート
 * - 10.3: エクスポート画像の解像度（品質）を選択可能にする
 */
export class ExportService implements IExportService {
  /**
   * 画像をエクスポートする
   *
   * Fabric.js CanvasのtoDataURLメソッドを使用して、
   * 注釈を含めた画像をData URL形式でエクスポートする。
   *
   * @param canvas Fabric.js Canvas
   * @param options エクスポートオプション
   * @returns Data URL形式の画像データ
   * @throws Error canvasがnullの場合
   * @throws Error 品質が範囲外の場合
   */
  exportImage(canvas: FabricCanvas, options: ExportImageOptions): string {
    // バリデーション: canvasがnullの場合
    if (!canvas) {
      throw new Error('Canvas is required for export');
    }

    // 品質のデフォルト値を設定
    const quality = options.quality ?? DEFAULT_QUALITY;

    // バリデーション: 品質が範囲外の場合
    if (quality < MIN_QUALITY || quality > MAX_QUALITY) {
      throw new Error(`Quality must be between ${MIN_QUALITY} and ${MAX_QUALITY}`);
    }

    // Fabric.js toDataURL オプション
    // Fabric.js v6では、toDataURLの引数はオブジェクト形式
    // multiplierは必須プロパティ（TDataUrlOptions型）
    const toDataURLOptions = {
      format: options.format,
      quality: quality,
      multiplier: 1, // 元のサイズを維持
    };

    // Data URLを生成
    // includeAnnotationsがfalseの場合でも、toDataURLは背景画像と全オブジェクトをレンダリングする
    // 注釈なしの元画像ダウンロードは別途20.2で実装
    return canvas.toDataURL(toDataURLOptions);
  }

  /**
   * ファイルをダウンロードする
   *
   * Data URLまたはBlobからダウンロードリンクを作成し、
   * ブラウザのダウンロード機能を起動する。
   *
   * @param data Data URLまたはBlobデータ
   * @param filename ダウンロードファイル名
   */
  downloadFile(data: string | Blob, filename: string): void {
    // アンカー要素を作成
    const link = document.createElement('a');

    if (data instanceof Blob) {
      // Blobの場合はObject URLを作成
      const objectUrl = URL.createObjectURL(data);
      link.href = objectUrl;
      link.download = filename;

      // ダウンロードをトリガー
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Object URLを解放
      URL.revokeObjectURL(objectUrl);
    } else {
      // Data URLの場合はそのまま使用
      link.href = data;
      link.download = filename;

      // ダウンロードをトリガー
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  /**
   * 元画像をダウンロードする（Task 20.2）
   *
   * 署名付きURLから元画像（注釈なし）をダウンロードする。
   * クロスオリジンのURLの場合はfetchでBlobとして取得してからダウンロード。
   *
   * Requirements: 10.4
   *
   * @param signedUrl 署名付きURL
   * @param options ダウンロードオプション
   * @throws Error URLが空または無効な場合
   * @throws Error ダウンロードに失敗した場合
   */
  async downloadOriginalImage(
    signedUrl: string,
    options: DownloadOriginalImageOptions = {}
  ): Promise<void> {
    // バリデーション: URLが空の場合
    if (!signedUrl) {
      throw new Error('URL is required for download');
    }

    // URLの解析とバリデーション
    let url: URL;
    try {
      url = new URL(signedUrl);
    } catch {
      throw new Error('Invalid URL provided');
    }

    // ファイル名の決定
    const filename = options.filename || this.extractFilenameFromUrl(url);

    // クロスオリジンURLの場合はfetchでBlobとして取得
    // 署名付きURLは通常クロスオリジンなので、fetchで取得する
    const response = await fetch(signedUrl, {
      mode: 'cors',
      credentials: 'omit', // 署名付きURLは認証不要
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();

    // Blobからダウンロード
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Object URLを解放
    URL.revokeObjectURL(objectUrl);
  }

  /**
   * URLからファイル名を抽出するヘルパーメソッド
   *
   * @param url URLオブジェクト
   * @returns ファイル名（拡張子含む）またはデフォルト値
   */
  private extractFilenameFromUrl(url: URL): string {
    const pathname = url.pathname;
    const segments = pathname.split('/').filter((s) => s.length > 0);

    if (segments.length === 0) {
      return 'image';
    }

    const lastSegment = segments[segments.length - 1];

    // ファイル名らしいもの（拡張子を含む）を返す
    if (lastSegment && /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
      return lastSegment;
    }

    return 'image';
  }
}

/**
 * デフォルトのExportServiceインスタンス
 */
const defaultExportService = new ExportService();

/**
 * 画像をエクスポートする（スタンドアロン関数）
 *
 * @param canvas Fabric.js Canvas
 * @param options エクスポートオプション
 * @returns Data URL形式の画像データ
 */
export function exportImage(canvas: FabricCanvas, options: ExportImageOptions): string {
  return defaultExportService.exportImage(canvas, options);
}

/**
 * ファイルをダウンロードする（スタンドアロン関数）
 *
 * @param data Data URLまたはBlobデータ
 * @param filename ダウンロードファイル名
 */
export function downloadFile(data: string | Blob, filename: string): void {
  defaultExportService.downloadFile(data, filename);
}

/**
 * 元画像をダウンロードする（スタンドアロン関数）
 *
 * 署名付きURLから元画像（注釈なし）をダウンロードする。
 *
 * Requirements: 10.4
 *
 * @param signedUrl 署名付きURL
 * @param options ダウンロードオプション
 */
export function downloadOriginalImage(
  signedUrl: string,
  options?: DownloadOriginalImageOptions
): Promise<void> {
  return defaultExportService.downloadOriginalImage(signedUrl, options);
}

export default ExportService;
