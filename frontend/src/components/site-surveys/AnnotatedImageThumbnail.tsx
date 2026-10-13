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
import { useInViewport } from '../../hooks/useInViewport';
import type { AnnotationInfo } from '../../types/site-survey.types';
import { logger } from '../../utils/logger';
// カスタムシェイプをFabric.jsクラスレジストリに登録
import './tools/registerCustomShapes';
// 集合体へ複写された線幅は実描画から導出し直す（詳細は annotation-restore-scale.ts）。
import { resolveRestoredStrokeWidth } from './annotation-restore-scale';

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
  /**
   * 注釈付きサムネイルURL（署名付きURL、サーバーサイド生成）
   *
   * 注釈保存時にサーバー側で生成される合成済みサムネイル。preferThumbnail 指定時は
   * これを最優先で使用し、注釈取得APIとクライアントサイド合成を完全に省略する。
   */
  annotatedThumbnailUrl?: string | null;
  /** オリジナル画像パス（フォールバック用） */
  originalPath?: string;
  /** ファイル名 */
  fileName?: string;
  /**
   * 画像の実寸（ピクセル）
   *
   * 未読込の状態でも表示領域を確保するために用いる。省略した場合や値が正でない場合は
   * `width` / `height` 属性を付けないため、表示領域の確保は呼び出し側が `style` で与える
   * 寸法に委ねられる。実寸の有無は表示領域の観測の要否には関与しない。
   */
  width?: number;
  height?: number;
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
   *
   * `true` のとき、サーバーサイド生成の注釈付きサムネイル（`annotatedThumbnailUrl`）が
   * あればそれをそのまま表示し、注釈取得APIの呼び出しとFabric.jsによる
   * クライアントサイド合成を行わない。写真が多い画面での画像1枚あたりの
   * 追加リクエストと再描画コストを排除するための経路。
   *
   * 既定は `false`（従来通り mediumUrl > originalUrl の順でフォールバック）。
   */
  preferThumbnail?: boolean;
}

// ============================================================================
// 内部ヘルパ
// ============================================================================

/**
 * 表示領域の確保に用いる寸法属性の値を返す
 *
 * 正の値のときだけ `width` / `height` 属性を与える。零や負の値をそのまま属性にすると
 * 「大きさが零である」という指定になり、呼び出し側が `style` で与えた寸法と食い違う
 * 記述が要素へ残る。実寸が未知であることは属性を付けないことで表す。
 *
 * @param value - 呼び出し側から渡された実寸（ピクセル）
 */
function reservationSize(value: number | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
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

  // サーバーサイドで合成済みの注釈付きサムネイル。縮小表示（preferThumbnail）のときのみ採用する。
  // 拡大表示ではサムネイル解像度では不足するため、従来通りクライアントサイドで合成する。
  const serverRenderedUrl = preferThumbnail ? (image.annotatedThumbnailUrl ?? null) : null;

  // 表示領域の観測を行う条件は、即時取得（loading='eager'）でないことのみとする。
  // 即時取得は拡大表示・単一画像表示の意図であり、観測すると表示が遅れるだけになる。
  //
  // 実寸の有無は観測の要否に用いない。実寸は表示領域を確保する手段のひとつにすぎず、
  // 呼び出し側が CSS で固定寸法を与えていれば未読込でも要素は潰れない。実寸が無いことを
  // 理由に観測を打ち切ると、代表画像の実寸を応答から受け取らない一覧系の呼び出し側では
  // 表示領域外の画像まで一斉に取得され、Requirement 38.6 / 38.8 が成立しなくなる。
  // 実寸も CSS 寸法も無く要素が潰れる場合は、全件が同時に交差判定されて即時取得と同じ
  // 結果になるため、観測を続けても不利益はない（タスク 115.106）。
  const { ref: imageRef, isInViewport } = useInViewport<HTMLImageElement>({
    enabled: loading === 'lazy',
  });

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
    // サーバーサイド生成の注釈付きサムネイルがある場合は、それをそのまま表示する。
    // 注釈取得API（getAnnotation）の呼び出しもFabric.jsによる合成も行わないため、
    // 写真枚数に比例したリクエストとレンダリング負荷が発生しない。
    if (serverRenderedUrl) {
      setRenderedUrl(serverRenderedUrl);
      setError(null);
      setIsLoading(false);
      return;
    }

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

            // ストローク幅の解決（Task 115.110, Req 32.2）
            // 復元処理（AnnotationEditor）と同じ方式へ揃える。集合体（Group）の注釈は
            // 実描画を子が保持し、表示倍率は上の scaleX / scaleY 経由で子へ伝搬する。
            // 集合体自身の strokeWidth は子から複写された後方互換用の値であり、ここへ
            // 重ねて倍率を掛けると複写元（実描画）と座標系が食い違う。
            const avgScale = (scaleX + scaleY) / 2;
            if (fabricObj.strokeWidth) {
              fabricObj.set({
                strokeWidth: resolveRestoredStrokeWidth(fabricObj, fabricObj.strokeWidth, avgScale),
              });
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
  }, [image.id, originalImageUrl, serverRenderedUrl, loadImageElement, hasAnnotations]);

  // コンポーネントのマウント/アンマウント管理
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 画像のレンダリング
  // 表示領域へ到達するまでは開始しない。注釈取得APIの呼び出しと Fabric.js による合成は
  // いずれもこの経路にあるため、表示領域外の画像に対して通信も描画も発生しない。
  useEffect(() => {
    if (!isInViewport) {
      return;
    }
    // 非同期関数を定義して即時実行することで、ESLintの警告を回避
    const executeRender = async () => {
      await renderAnnotatedImage();
    };
    void executeRender();
  }, [isInViewport, renderAnnotatedImage]);

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
  // 表示領域へ到達するまでは src を与えず、実寸のみで領域を確保する。
  return (
    <img
      ref={imageRef}
      src={isInViewport ? (renderedUrl ?? serverRenderedUrl ?? originalImageUrl) : undefined}
      width={reservationSize(image.width)}
      height={reservationSize(image.height)}
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
