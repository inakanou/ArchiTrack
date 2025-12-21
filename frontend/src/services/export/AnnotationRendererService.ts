/**
 * AnnotationRendererService - 注釈付き画像レンダリングサービス
 *
 * PDF報告書生成時に、元画像に注釈データをレンダリングして
 * 注釈付き画像のdataURLを生成する。
 *
 * @see requirements.md - 要件10.6
 */

import { Canvas as FabricCanvas, FabricImage, util } from 'fabric';
import { getAnnotation } from '../../api/survey-annotations';
import type { SurveyImageInfo, AnnotationInfo } from '../../types/site-survey.types';
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

      // 復元したオブジェクトをキャンバスに追加
      enlivenedObjects.forEach((obj) => {
        if (obj && typeof obj === 'object' && 'set' in obj && 'type' in obj) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fabricCanvas.add(obj as any);
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

export default AnnotationRendererService;
