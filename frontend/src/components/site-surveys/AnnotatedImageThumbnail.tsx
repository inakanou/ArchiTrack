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
import type { AnnotationInfo } from '../../types/site-survey.types';
import { logger } from '../../utils/logger';
// カスタムシェイプをFabric.jsクラスレジストリに登録
import './tools/registerCustomShapes';

// ============================================================================
// 型定義
// ============================================================================

/**
 * 注釈付き画像サムネイル表示に必要な最小限の画像情報
 * SurveyImageInfoとSurveyImageSummaryの両方に対応
 */
export interface AnnotatedImageInput {
  /** 画像ID（注釈データ取得に使用） */
  id: string;
  /** オリジナル画像URL（署名付きURL） */
  originalUrl?: string | null;
  /** 中解像度画像URL（署名付きURL、優先使用） */
  mediumUrl?: string | null;
  /** サムネイル画像URL（署名付きURL、preferThumbnail指定時に最優先で使用） */
  thumbnailUrl?: string | null;
  /** オリジナル画像パス（フォールバック用） */
  originalPath?: string;
  /** ファイル名 */
  fileName?: string;
}

export interface AnnotatedImageThumbnailProps {
  /** 画像情報 */
  image: AnnotatedImageInput;
  /** 画像のalt属性 */
  alt: string;
  /** スタイル */
  style?: React.CSSProperties;
  /** クリックハンドラ */
  onClick?: () => void;
  /** ローディングモード */
  loading?: 'lazy' | 'eager';
  /**
   * 注釈データの有無が呼び出し側で既知の場合に指定する。
   * - `false`: 注釈が存在しないことが確定しているため、注釈取得API（getAnnotation）の
   *   呼び出しを省略し、元画像をそのまま表示する（一覧表示でのN+1リクエスト抑止）。
   * - `true` / `undefined`: 従来通り注釈データを取得してレンダリングする。
   */
  hasAnnotations?: boolean;
  /**
   * サムネイルURLを最優先で使用するか。
   * 一覧グリッドのような縮小表示で、フル解像度の原画像を読み込む代わりに
   * サムネイル画像を表示し、通信量と再描画コストを削減する。
   * 既定は `false`（従来通り mediumUrl > originalUrl の順でフォールバック）。
   */
  preferThumbnail?: boolean;
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
  hasAnnotations,
  preferThumbnail = false,
}: AnnotatedImageThumbnailProps) {
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);

  // 表示に使用する画像URL。
  // preferThumbnail=true のときはサムネイルを最優先（縮小表示で通信量を削減）。
  // それ以外は従来通り 中解像度画像 > オリジナル画像 の順でフォールバック。
  const originalImageUrl = preferThumbnail
    ? (image.thumbnailUrl ?? image.mediumUrl ?? image.originalUrl ?? image.originalPath)
    : (image.mediumUrl ?? image.originalUrl ?? image.originalPath);

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

      // 注釈が存在しないことが呼び出し側で確定している場合は、
      // 注釈取得API（getAnnotation）を呼ばずに元画像を表示する（一覧表示でのN+1リクエスト抑止）。
      if (hasAnnotations === false) {
        setRenderedUrl(originalImageUrl);
        setIsLoading(false);
        return;
      }

      // 1. 注釈データを取得
      let annotationData: AnnotationInfo | null = null;
      try {
        annotationData = await getAnnotation(image.id);
      } catch (annotationErr) {
        // 注釈取得に失敗した場合は元画像を表示
        logger.warn('注釈データの取得に失敗しました', {
          imageId: image.id,
          error: annotationErr instanceof Error ? annotationErr.message : String(annotationErr),
        });
      }

      // マウント解除されていたら処理を中止
      if (!mountedRef.current) return;

      // 2. 注釈がない、またはオブジェクトが空の場合は元画像をそのまま使用
      if (
        !annotationData ||
        !annotationData.data ||
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
      logger.error('注釈付き画像のレンダリングに失敗しました', {
        imageId: image.id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (mountedRef.current) {
        // エラー時は元画像を表示
        setRenderedUrl(originalImageUrl);
        setIsLoading(false);
      }
    }
  }, [image.id, originalImageUrl, loadImageElement, hasAnnotations]);

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
