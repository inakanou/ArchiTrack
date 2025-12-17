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

export default ExportService;
