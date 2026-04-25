/**
 * AnnotationRendererService - 注釈付き画像レンダリングサービス
 *
 * PDF報告書生成時に、元画像に注釈データをレンダリングして
 * 注釈付き画像のdataURLを生成する。
 *
 * Task 28.4: 報告書用画像レンダリング機能を追加
 * - 日本語を含むテキスト注釈の正しいレンダリング
 * - JapaneseFontRendererとの統合
 *
 * @see requirements.md - 要件10.6, 11.7
 *
 * @requirement site-survey/REQ-24.8
 * @requirement site-survey/REQ-25.9
 */

import { Canvas as FabricCanvas, FabricImage, util } from 'fabric';
import { getAnnotation, getBatchAnnotations } from '../../api/survey-annotations';
import type { SurveyImageInfo, AnnotationInfo } from '../../types/site-survey.types';
import { loadJapaneseFont, applyJapaneseFontToCanvas } from '../JapaneseFontRenderer';
// カスタムシェイプをFabric.jsクラスレジストリに登録（enlivenObjectsで復元するために必要）
import '../../components/site-surveys/tools/registerCustomShapes';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 注釈付き画像のレンダリング結果
 */
export interface RenderedImage {
  /** 画像情報 */
  imageInfo: SurveyImageInfo;
  /** 注釈付き画像のdataURL */
  dataUrl: string;
}

/**
 * レンダリングオプション
 */
export interface RenderOptions {
  /** 出力形式（デフォルト: 'jpeg'） */
  format?: 'jpeg' | 'png';
  /** 品質（0-1、デフォルト: 0.9） */
  quality?: number;
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 画像URLからImageオブジェクトをロードする
 *
 * @param url 画像URL
 * @returns Imageオブジェクト
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image: ${err}`));
    img.src = url;
  });
}

// ============================================================================
// AnnotationRendererServiceクラス
// ============================================================================

/**
 * 注釈レンダリングサービス
 *
 * 元画像に注釈データをレンダリングして注釈付き画像を生成する。
 * PDF報告書生成時に使用される。
 */
export class AnnotationRendererService {
  /**
   * 単一の画像に注釈をレンダリングする
   *
   * @param imageInfo 画像情報
   * @param options レンダリングオプション
   * @returns 注釈付き画像のレンダリング結果（注釈がない場合は元画像）
   */
  async renderImage(
    imageInfo: SurveyImageInfo,
    options: RenderOptions = {}
  ): Promise<RenderedImage | null> {
    const { format = 'jpeg', quality = 0.9 } = options;
    const imageUrl = imageInfo.originalUrl;

    if (!imageUrl) {
      console.warn(`Image ${imageInfo.id} has no originalUrl`);
      return null;
    }

    try {
      // 1. 注釈データを取得
      let annotationData: AnnotationInfo | null = null;
      try {
        annotationData = await getAnnotation(imageInfo.id);
      } catch {
        // 注釈取得に失敗した場合は元画像を返す
        console.warn(`Failed to get annotation for image ${imageInfo.id}, using original image`);
      }

      // 2. 元画像をロード
      const htmlImage = await loadImage(imageUrl);

      // 3. 注釈がない場合は元画像をそのまま返す
      if (
        !annotationData ||
        !annotationData.data.objects ||
        annotationData.data.objects.length === 0
      ) {
        // 元画像をdataURLに変換
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = htmlImage.width;
        tempCanvas.height = htmlImage.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(htmlImage, 0, 0);
        const dataUrl = tempCanvas.toDataURL(`image/${format}`, quality);
        return {
          imageInfo,
          dataUrl,
        };
      }

      // 4. Fabric.js Canvasを作成
      const canvasElement = document.createElement('canvas');
      canvasElement.width = htmlImage.width;
      canvasElement.height = htmlImage.height;

      const fabricCanvas = new FabricCanvas(canvasElement, {
        width: htmlImage.width,
        height: htmlImage.height,
        renderOnAddRemove: false, // パフォーマンス最適化
      });

      // 5. 背景画像を設定
      const fabricImage = new FabricImage(htmlImage, {
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
      });
      fabricCanvas.backgroundImage = fabricImage;

      // 6. 注釈オブジェクトを復元
      const enlivenedObjects = await util.enlivenObjects(annotationData.data.objects);

      // スケール係数を計算（保存時のキャンバスサイズと現在のレンダリングサイズの比率）
      const savedCanvasWidth = annotationData.data.canvasWidth;
      const savedCanvasHeight = annotationData.data.canvasHeight;
      const scaleX =
        savedCanvasWidth && savedCanvasWidth > 0 ? htmlImage.width / savedCanvasWidth : 1;
      const scaleY =
        savedCanvasHeight && savedCanvasHeight > 0 ? htmlImage.height / savedCanvasHeight : 1;

      // 復元したオブジェクトをキャンバスに追加（スケール変換を適用）
      enlivenedObjects.forEach((obj) => {
        if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fabricObj = obj as any;

          // スケール変換が必要な場合のみ適用
          if (scaleX !== 1 || scaleY !== 1) {
            // 位置をスケール
            const left = fabricObj.left ?? 0;
            const top = fabricObj.top ?? 0;
            fabricObj.set({
              left: left * scaleX,
              top: top * scaleY,
              scaleX: (fabricObj.scaleX ?? 1) * scaleX,
              scaleY: (fabricObj.scaleY ?? 1) * scaleY,
            });

            // ストローク幅もスケール（平均スケールを使用）
            const avgScale = (scaleX + scaleY) / 2;
            if (fabricObj.strokeWidth) {
              fabricObj.set({ strokeWidth: fabricObj.strokeWidth * avgScale });
            }
          }

          fabricCanvas.add(fabricObj);
        }
      });

      // 7. キャンバスをレンダリング
      fabricCanvas.renderAll();

      // 8. dataURLを生成
      const dataUrl = fabricCanvas.toDataURL({
        format: format,
        quality: quality,
        multiplier: 1,
      });

      // 9. クリーンアップ
      fabricCanvas.dispose();

      return {
        imageInfo,
        dataUrl,
      };
    } catch (error) {
      console.error(`Failed to render image ${imageInfo.id}:`, error);
      return null;
    }
  }

  /**
   * 複数の画像に注釈をレンダリングする
   *
   * @param images 画像情報の配列
   * @param options レンダリングオプション
   * @returns 注釈付き画像のレンダリング結果の配列
   */
  async renderImages(
    images: SurveyImageInfo[],
    options: RenderOptions = {}
  ): Promise<RenderedImage[]> {
    const results: RenderedImage[] = [];

    // 順次処理（並列だとメモリ消費が大きくなる可能性があるため）
    for (const imageInfo of images) {
      const result = await this.renderImage(imageInfo, options);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 報告書用に単一の画像に注釈をレンダリングする
   *
   * Task 28.4: 日本語を含むテキスト注釈を正しくレンダリングする
   *
   * - 日本語フォントを事前にロード
   * - テキスト注釈に日本語フォントを適用
   * - 注釈付き画像をdataURL形式で取得
   *
   * @param imageInfo 画像情報
   * @param options レンダリングオプション
   * @returns 注釈付き画像のレンダリング結果（注釈がない場合は元画像）
   *
   * Requirements: 11.7
   */
  async renderImageForReport(
    imageInfo: SurveyImageInfo,
    options: RenderOptions = {}
  ): Promise<RenderedImage | null> {
    const { format = 'jpeg', quality = 0.9 } = options;
    const imageUrl = imageInfo.originalUrl;

    if (!imageUrl) {
      console.warn(`Image ${imageInfo.id} has no originalUrl`);
      return null;
    }

    try {
      // 1. 日本語フォントをロード（報告書用）
      try {
        await loadJapaneseFont();
      } catch (fontError) {
        console.warn('Failed to load Japanese font for report, continuing without:', fontError);
      }

      // 2. 注釈データを取得
      let annotationData: AnnotationInfo | null = null;
      try {
        annotationData = await getAnnotation(imageInfo.id);
      } catch {
        // 注釈取得に失敗した場合は元画像を返す
        console.warn(`Failed to get annotation for image ${imageInfo.id}, using original image`);
      }

      // 3. 元画像をロード
      const htmlImage = await loadImage(imageUrl);

      // 4. 注釈がない場合は元画像をそのまま返す
      if (
        !annotationData ||
        !annotationData.data.objects ||
        annotationData.data.objects.length === 0
      ) {
        // 元画像をdataURLに変換
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = htmlImage.width;
        tempCanvas.height = htmlImage.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(htmlImage, 0, 0);
        const dataUrl = tempCanvas.toDataURL(`image/${format}`, quality);
        return {
          imageInfo,
          dataUrl,
        };
      }

      // 5. Fabric.js Canvasを作成
      const canvasElement = document.createElement('canvas');
      canvasElement.width = htmlImage.width;
      canvasElement.height = htmlImage.height;

      const fabricCanvas = new FabricCanvas(canvasElement, {
        width: htmlImage.width,
        height: htmlImage.height,
        renderOnAddRemove: false, // パフォーマンス最適化
      });

      // 6. 背景画像を設定
      const fabricImage = new FabricImage(htmlImage, {
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
      });
      fabricCanvas.backgroundImage = fabricImage;

      // 7. 注釈オブジェクトを復元
      const enlivenedObjects = await util.enlivenObjects(annotationData.data.objects);

      // スケール係数を計算（保存時のキャンバスサイズと現在のレンダリングサイズの比率）
      const savedCanvasWidth = annotationData.data.canvasWidth;
      const savedCanvasHeight = annotationData.data.canvasHeight;
      const scaleX =
        savedCanvasWidth && savedCanvasWidth > 0 ? htmlImage.width / savedCanvasWidth : 1;
      const scaleY =
        savedCanvasHeight && savedCanvasHeight > 0 ? htmlImage.height / savedCanvasHeight : 1;

      // 復元したオブジェクトをキャンバスに追加（スケール変換を適用）
      enlivenedObjects.forEach((obj) => {
        if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fabricObj = obj as any;

          // スケール変換が必要な場合のみ適用
          if (scaleX !== 1 || scaleY !== 1) {
            // 位置をスケール
            const left = fabricObj.left ?? 0;
            const top = fabricObj.top ?? 0;
            fabricObj.set({
              left: left * scaleX,
              top: top * scaleY,
              scaleX: (fabricObj.scaleX ?? 1) * scaleX,
              scaleY: (fabricObj.scaleY ?? 1) * scaleY,
            });

            // ストローク幅もスケール（平均スケールを使用）
            const avgScale = (scaleX + scaleY) / 2;
            if (fabricObj.strokeWidth) {
              fabricObj.set({ strokeWidth: fabricObj.strokeWidth * avgScale });
            }
          }

          fabricCanvas.add(fabricObj);
        }
      });

      // 8. 日本語フォントをテキストオブジェクトに適用（報告書用）
      applyJapaneseFontToCanvas(fabricCanvas);

      // 9. キャンバスをレンダリング
      fabricCanvas.renderAll();

      // 10. dataURLを生成
      const dataUrl = fabricCanvas.toDataURL({
        format: format,
        quality: quality,
        multiplier: 1,
      });

      // 11. クリーンアップ
      fabricCanvas.dispose();

      return {
        imageInfo,
        dataUrl,
      };
    } catch (error) {
      console.error(`Failed to render image for report ${imageInfo.id}:`, error);
      return null;
    }
  }

  /**
   * 報告書用に複数の画像に注釈をレンダリングする（バッチ注釈取得対応）
   *
   * Task 28.4: PDF報告書生成時に使用
   * Task 42.2: バッチ注釈取得対応
   *
   * - 日本語フォントを事前にロード（1回のみ）
   * - 全画像の注釈データを一括取得（要件18.2対応）
   * - バッチ取得失敗時は個別取得にフォールバック（要件18.7対応）
   * - 各画像のテキスト注釈に日本語フォントを適用
   *
   * @param images 画像情報の配列
   * @param options レンダリングオプション
   * @returns 注釈付き画像のレンダリング結果の配列
   *
   * Requirements: 11.7, 18.2, 18.5, 18.7
   */
  async renderImagesForReport(
    images: SurveyImageInfo[],
    options: RenderOptions = {}
  ): Promise<RenderedImage[]> {
    const results: RenderedImage[] = [];

    // 日本語フォントを事前にロード（1回のみ）
    try {
      await loadJapaneseFont();
    } catch (fontError) {
      console.warn('Failed to load Japanese font for report, continuing without:', fontError);
    }

    // 全画像の注釈データを一括取得（要件18.2対応）
    const imageIds = images.map((img) => img.id);
    const surveyId = images[0]?.surveyId;
    let annotationsMap: Record<string, AnnotationInfo | null> | undefined;

    if (surveyId && imageIds.length > 0) {
      try {
        annotationsMap = await getBatchAnnotations(surveyId, imageIds);
      } catch (error) {
        // バッチ取得失敗時は個別取得にフォールバック（18.7対応）
        console.warn('Batch annotation fetch failed, falling back to individual fetch:', error);
        annotationsMap = undefined;
      }
    }

    // 順次処理（並列だとメモリ消費が大きくなる可能性があるため）
    for (const imageInfo of images) {
      let result: RenderedImage | null;
      if (annotationsMap !== undefined) {
        // バッチ取得成功: Mapから注釈データを取得してレンダリング
        const annotationData = annotationsMap[imageInfo.id];
        result = await this.renderImageForReportWithAnnotation(imageInfo, annotationData, options);
      } else {
        // フォールバック: 個別取得でレンダリング
        result = await this.renderImageForReport(imageInfo, options);
      }
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 事前取得済みの注釈データを使用して報告書用画像をレンダリングする
   *
   * バッチ注釈取得で取得済みのデータを使用して、個別のAPIリクエストなしで
   * 画像をレンダリングする。
   *
   * @param imageInfo 画像情報
   * @param annotationData 事前取得済みの注釈データ（null: 注釈なし）
   * @param options レンダリングオプション
   * @returns レンダリング結果
   *
   * Requirements: 18.2, 18.5
   */
  private async renderImageForReportWithAnnotation(
    imageInfo: SurveyImageInfo,
    annotationData: AnnotationInfo | null | undefined,
    options: RenderOptions = {}
  ): Promise<RenderedImage | null> {
    const { format = 'jpeg', quality = 0.9 } = options;
    const imageUrl = imageInfo.originalUrl;

    if (!imageUrl) {
      console.warn(`Image ${imageInfo.id} has no originalUrl`);
      return null;
    }

    try {
      // 元画像をロード
      const htmlImage = await loadImage(imageUrl);

      // 注釈がない場合は元画像をそのまま返す
      if (
        !annotationData ||
        !annotationData.data.objects ||
        annotationData.data.objects.length === 0
      ) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = htmlImage.width;
        tempCanvas.height = htmlImage.height;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        ctx.drawImage(htmlImage, 0, 0);
        const dataUrl = tempCanvas.toDataURL(`image/${format}`, quality);
        return { imageInfo, dataUrl };
      }

      // Fabric.js Canvasを作成
      const canvasElement = document.createElement('canvas');
      canvasElement.width = htmlImage.width;
      canvasElement.height = htmlImage.height;

      const fabricCanvas = new FabricCanvas(canvasElement, {
        width: htmlImage.width,
        height: htmlImage.height,
        renderOnAddRemove: false,
      });

      // 背景画像を設定
      const fabricImage = new FabricImage(htmlImage, {
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
      });
      fabricCanvas.backgroundImage = fabricImage;

      // 注釈オブジェクトを復元
      const enlivenedObjects = await util.enlivenObjects(annotationData.data.objects);

      // スケール係数を計算
      const savedCanvasWidth = annotationData.data.canvasWidth;
      const savedCanvasHeight = annotationData.data.canvasHeight;
      const scaleX =
        savedCanvasWidth && savedCanvasWidth > 0 ? htmlImage.width / savedCanvasWidth : 1;
      const scaleY =
        savedCanvasHeight && savedCanvasHeight > 0 ? htmlImage.height / savedCanvasHeight : 1;

      enlivenedObjects.forEach((obj) => {
        if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fabricObj = obj as any;

          if (scaleX !== 1 || scaleY !== 1) {
            const left = fabricObj.left ?? 0;
            const top = fabricObj.top ?? 0;
            fabricObj.set({
              left: left * scaleX,
              top: top * scaleY,
              scaleX: (fabricObj.scaleX ?? 1) * scaleX,
              scaleY: (fabricObj.scaleY ?? 1) * scaleY,
            });

            const avgScale = (scaleX + scaleY) / 2;
            if (fabricObj.strokeWidth) {
              fabricObj.set({ strokeWidth: fabricObj.strokeWidth * avgScale });
            }
          }

          fabricCanvas.add(fabricObj);
        }
      });

      // 日本語フォントをテキストオブジェクトに適用
      applyJapaneseFontToCanvas(fabricCanvas);

      // キャンバスをレンダリング
      fabricCanvas.renderAll();

      // dataURLを生成
      const dataUrl = fabricCanvas.toDataURL({
        format: format,
        quality: quality,
        multiplier: 1,
      });

      // クリーンアップ
      fabricCanvas.dispose();

      return { imageInfo, dataUrl };
    } catch (error) {
      console.error(`Failed to render image for report ${imageInfo.id}:`, error);
      return null;
    }
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

let defaultService: AnnotationRendererService | null = null;

/**
 * デフォルトのサービスインスタンスを取得
 */
function getDefaultService(): AnnotationRendererService {
  if (!defaultService) {
    defaultService = new AnnotationRendererService();
  }
  return defaultService;
}

/**
 * シングルトンインスタンスをリセットする（テスト用）
 */
export function resetAnnotationRendererService(): void {
  defaultService = null;
}

// ============================================================================
// スタンドアロン関数
// ============================================================================

/**
 * 複数の画像に注釈をレンダリングする（スタンドアロン関数）
 *
 * @param images 画像情報の配列
 * @param options レンダリングオプション
 * @returns 注釈付き画像のレンダリング結果の配列
 */
export function renderImagesWithAnnotations(
  images: SurveyImageInfo[],
  options?: RenderOptions
): Promise<RenderedImage[]> {
  return getDefaultService().renderImages(images, options);
}

/**
 * 報告書用に複数の画像に注釈をレンダリングする（スタンドアロン関数）
 *
 * Task 28.4: PDF報告書生成時に使用
 * - 日本語フォントを事前にロード
 * - 各画像のテキスト注釈に日本語フォントを適用
 *
 * @param images 画像情報の配列
 * @param options レンダリングオプション
 * @returns 注釈付き画像のレンダリング結果の配列
 *
 * Requirements: 11.7
 */
export function renderImagesForReport(
  images: SurveyImageInfo[],
  options?: RenderOptions
): Promise<RenderedImage[]> {
  return getDefaultService().renderImagesForReport(images, options);
}

export default AnnotationRendererService;
