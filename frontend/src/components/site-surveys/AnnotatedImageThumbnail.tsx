/**
 * @fileoverview 注釈付き画像サムネイル表示コンポーネント
 *
 * 画像一覧で注釈を含めた画像サムネイルを表示するためのコンポーネントです。
 * 注釈データを取得し、Fabric.jsを使用して画像と注釈を重ねてレンダリングします。
 *
 * Requirements:
 * - 画像一覧で注釈付き画像のサムネイルを表示
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { Canvas as FabricCanvas, FabricImage, util } from 'fabric';
import { getAnnotation } from '../../api/survey-annotations';
import type { SurveyImageInfo, AnnotationInfo } from '../../types/site-survey.types';
// カスタムシェイプをFabric.jsクラスレジストリに登録
import './tools/registerCustomShapes';

// ============================================================================
// 型定義
// ============================================================================

export interface AnnotatedImageThumbnailProps {
  /** 画像情報 */
  image: SurveyImageInfo;
  /** 画像のalt属性 */
  alt: string;
  /** スタイル */
  style?: React.CSSProperties;
  /** クリックハンドラ */
  onClick?: () => void;
  /** ローディングモード */
  loading?: 'lazy' | 'eager';
}

// ============================================================================
// コンポーネント
// ============================================================================

/**
 * 注釈付き画像サムネイルコンポーネント
 *
 * 画像と注釈を重ねてレンダリングし、サムネイルとして表示します。
 * 注釈がない場合は元の画像をそのまま表示します。
 */
export function AnnotatedImageThumbnail({
  image,
  alt,
  style,
  onClick,
  loading = 'lazy',
}: AnnotatedImageThumbnailProps) {
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);

  // 元画像のURL（中解像度画像 > オリジナル画像の順でフォールバック）
  const originalImageUrl = image.mediumUrl ?? image.originalUrl ?? image.originalPath;

  /**
   * 画像をロードする
   */
  const loadImageElement = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }, []);

  /**
   * 注釈付き画像をレンダリングする
   */
  const renderAnnotatedImage = useCallback(async () => {
    if (!originalImageUrl) {
      setError('画像URLがありません');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 1. 注釈データを取得
      let annotationData: AnnotationInfo | null = null;
      try {
        annotationData = await getAnnotation(image.id);
      } catch {
        // 注釈取得に失敗した場合は元画像を表示
        console.debug(`No annotation found for image ${image.id}`);
      }

      // マウント解除されていたら処理を中止
      if (!mountedRef.current) return;

      // 2. 注釈がない、またはオブジェクトが空の場合は元画像をそのまま使用
      if (
        !annotationData ||
        !annotationData.data.objects ||
        annotationData.data.objects.length === 0
      ) {
        setRenderedUrl(originalImageUrl);
        setIsLoading(false);
        return;
      }

      // 3. 元画像をロード
      const htmlImage = await loadImageElement(originalImageUrl);

      // マウント解除されていたら処理を中止
      if (!mountedRef.current) return;

      // 4. オフスクリーンCanvasを作成
      const canvas = document.createElement('canvas');
      canvas.width = htmlImage.width;
      canvas.height = htmlImage.height;
      canvasRef.current = canvas;

      const fabricCanvas = new FabricCanvas(canvas, {
        width: htmlImage.width,
        height: htmlImage.height,
        renderOnAddRemove: false,
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

      // マウント解除されていたら処理を中止
      if (!mountedRef.current) {
        fabricCanvas.dispose();
        return;
      }

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
        format: 'jpeg',
        quality: 0.8,
        multiplier: 1,
      });

      // 9. クリーンアップ
      fabricCanvas.dispose();

      // マウント解除されていたら処理を中止
      if (!mountedRef.current) return;

      setRenderedUrl(dataUrl);
      setIsLoading(false);
    } catch (err) {
      console.error(`Failed to render annotated image ${image.id}:`, err);
      if (mountedRef.current) {
        // エラー時は元画像を表示
        setRenderedUrl(originalImageUrl);
        setIsLoading(false);
      }
    }
  }, [image.id, originalImageUrl, loadImageElement]);

  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 画像のレンダリング
  useEffect(() => {
    // 非同期関数を定義して即時実行することで、ESLintの警告を回避
    const executeRender = async () => {
      await renderAnnotatedImage();
    };
    void executeRender();
  }, [renderAnnotatedImage]);

  // エラー時のフォールバック表示
  if (error) {
    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
          fontSize: '12px',
        }}
        role="img"
        aria-label={alt}
      >
        画像を読み込めません
      </div>
    );
  }

  // ローディング中は元画像を表示（注釈のレンダリング完了後に差し替え）
  return (
    <img
      src={renderedUrl ?? originalImageUrl}
      alt={alt}
      style={{
        ...style,
        opacity: isLoading ? 0.7 : 1,
        transition: 'opacity 0.2s ease-in-out',
      }}
      loading={loading}
      onClick={onClick}
    />
  );
}

export default AnnotatedImageThumbnail;
