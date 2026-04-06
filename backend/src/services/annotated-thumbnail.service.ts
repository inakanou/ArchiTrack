/**
 * @fileoverview 注釈付きサムネイル生成サービス
 *
 * Task 53.2: AnnotatedThumbnailServiceを実装する
 *
 * 注釈保存時にサーバーサイドで注釈付きサムネイル画像を生成・更新します。
 * Fabric.js JSON注釈データからSVGを生成し、Sharpのcomposite機能で
 * オリジナル画像に重ねてサムネイルを生成します。
 *
 * Requirements:
 * - 20.4: 注釈保存時にサーバーサイドで注釈付きサムネイル画像を生成・更新する
 *
 * @module services/annotated-thumbnail
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { AnnotationData, FabricSerializedObject } from './annotation.service.js';
import sharp from 'sharp';
import logger from '../utils/logger.js';

// ============================================================================
// 定数定義
// ============================================================================

/**
 * サムネイルサイズ（要件: 400x300px、注釈の視認性確保）
 */
const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;

/**
 * JPEG品質
 */
const JPEG_QUALITY = 80;

/**
 * R2保存先プレフィックス
 */
const ANNOTATED_THUMBNAIL_PREFIX = 'annotated-thumbnails';

// ============================================================================
// 型定義
// ============================================================================

/**
 * サービス依存関係
 */
export interface AnnotatedThumbnailServiceDependencies {
  prisma: PrismaClient;
  storageProvider: StorageProvider;
}

// ============================================================================
// SVG生成関数
// ============================================================================

/**
 * Fabric.jsオブジェクトから四角形SVGを生成
 */
function renderRect(obj: FabricSerializedObject): string {
  const left = (obj.left ?? 0) as number;
  const top = (obj.top ?? 0) as number;
  const width = ((obj.width ?? 0) as number) * ((obj.scaleX ?? 1) as number);
  const height = ((obj.height ?? 0) as number) * ((obj.scaleY ?? 1) as number);
  const fill = (obj.fill as string) || 'transparent';
  const stroke = (obj.stroke as string) || '#000000';
  const strokeWidth = (obj.strokeWidth ?? 1) as number;
  const angle = (obj.angle ?? 0) as number;

  const transform =
    angle !== 0 ? ` transform="rotate(${angle} ${left + width / 2} ${top + height / 2})"` : '';

  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${fill === 'transparent' ? 'none' : fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${transform}/>`;
}

/**
 * Fabric.jsオブジェクトから円/楕円SVGを生成
 */
function renderCircle(obj: FabricSerializedObject): string {
  const left = (obj.left ?? 0) as number;
  const top = (obj.top ?? 0) as number;
  const radius = (obj.radius ?? 0) as number;
  const scaleX = (obj.scaleX ?? 1) as number;
  const scaleY = (obj.scaleY ?? 1) as number;
  const fill = (obj.fill as string) || 'transparent';
  const stroke = (obj.stroke as string) || '#000000';
  const strokeWidth = (obj.strokeWidth ?? 1) as number;

  const rx = radius * scaleX;
  const ry = radius * scaleY;
  const cx = left + rx;
  const cy = top + ry;

  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill === 'transparent' ? 'none' : fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

/**
 * Fabric.jsオブジェクトからテキストSVGを生成
 */
function renderText(obj: FabricSerializedObject): string {
  const left = (obj.left ?? 0) as number;
  const top = (obj.top ?? 0) as number;
  const text = (obj.text as string) || '';
  const fontSize = (obj.fontSize ?? 16) as number;
  const fill = (obj.fill as string) || '#000000';
  const angle = (obj.angle ?? 0) as number;
  const scaleX = (obj.scaleX ?? 1) as number;
  const scaleY = (obj.scaleY ?? 1) as number;

  const transform = angle !== 0 ? ` transform="rotate(${angle} ${left} ${top})"` : '';

  // 日本語フォントフォールバック
  const fontFamily = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';

  return `<text x="${left}" y="${top + fontSize * scaleY}" font-size="${fontSize * scaleX}" fill="${fill}" font-family='${fontFamily}'${transform}>${escapeXml(text)}</text>`;
}

/**
 * Fabric.jsオブジェクトから線SVGを生成
 */
function renderLine(obj: FabricSerializedObject): string {
  const left = (obj.left ?? 0) as number;
  const top = (obj.top ?? 0) as number;
  const x1 = (obj.x1 ?? 0) as number;
  const y1 = (obj.y1 ?? 0) as number;
  const x2 = (obj.x2 ?? 0) as number;
  const y2 = (obj.y2 ?? 0) as number;
  const stroke = (obj.stroke as string) || '#000000';
  const strokeWidth = (obj.strokeWidth ?? 1) as number;

  return `<line x1="${left + x1}" y1="${top + y1}" x2="${left + x2}" y2="${top + y2}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

/**
 * Fabric.jsオブジェクトからパスSVGを生成
 */
function renderPath(obj: FabricSerializedObject): string {
  const left = (obj.left ?? 0) as number;
  const top = (obj.top ?? 0) as number;
  const pathData = obj.path as unknown[];
  const fill = (obj.fill as string) || 'transparent';
  const stroke = (obj.stroke as string) || '#000000';
  const strokeWidth = (obj.strokeWidth ?? 1) as number;
  const scaleX = (obj.scaleX ?? 1) as number;
  const scaleY = (obj.scaleY ?? 1) as number;

  if (!Array.isArray(pathData)) {
    return '';
  }

  // パスデータをSVGパス文字列に変換
  const d = pathData
    .map((segment) => {
      if (!Array.isArray(segment)) return '';
      return (segment as (string | number)[]).join(' ');
    })
    .join(' ');

  const transform = `translate(${left}, ${top}) scale(${scaleX}, ${scaleY})`;

  return `<path d="${d}" fill="${fill === 'transparent' ? 'none' : fill}" stroke="${stroke}" stroke-width="${strokeWidth}" transform="${transform}"/>`;
}

/**
 * XMLエスケープ
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fabric.js JSON注釈データからSVGを生成する
 *
 * サーバーサイドで注釈をレンダリングするためにFabric.js JSONからSVGに変換します。
 * 完全な互換性は求めず、サムネイル表示レベルの近似表示を実現します。
 *
 * @param annotationData - Fabric.js JSON形式の注釈データ
 * @param imageWidth - オリジナル画像の幅
 * @param imageHeight - オリジナル画像の高さ
 * @returns SVG文字列
 */
export function generateSvgFromAnnotation(
  annotationData: AnnotationData,
  imageWidth: number,
  imageHeight: number
): string {
  const elements: string[] = [];

  for (const obj of annotationData.objects) {
    let element: string = '';

    switch (obj.type) {
      case 'rect':
        element = renderRect(obj);
        break;
      case 'circle':
        element = renderCircle(obj);
        break;
      case 'textbox':
      case 'text':
      case 'i-text':
        element = renderText(obj);
        break;
      case 'line':
        element = renderLine(obj);
        break;
      case 'path':
        element = renderPath(obj);
        break;
      default:
        // 不明なタイプはスキップ
        break;
    }

    if (element) {
      elements.push(element);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${elements.join('')}</svg>`;
}

// ============================================================================
// サービスクラス
// ============================================================================

/**
 * 注釈付きサムネイル生成サービス
 *
 * 注釈保存時に注釈付きサムネイル画像を生成・更新します。
 *
 * Requirements:
 * - 20.4: 注釈保存時にサーバーサイドで注釈付きサムネイル画像を生成・更新する
 */
export class AnnotatedThumbnailService {
  private readonly prisma: PrismaClient;
  private readonly storageProvider: StorageProvider;

  constructor(deps: AnnotatedThumbnailServiceDependencies) {
    this.prisma = deps.prisma;
    this.storageProvider = deps.storageProvider;
  }

  /**
   * 注釈付きサムネイルを生成・更新する
   *
   * 注釈保存（AnnotationService.save）成功後に呼び出されます。
   * オリジナル画像に注釈データをレンダリングし、サムネイルサイズにリサイズして
   * R2に保存します。
   *
   * @param imageId - 画像ID
   * @param annotationData - 注釈データ（Fabric.js JSON形式）
   * @returns 生成されたサムネイルのR2パス、失敗時はnull
   * @requirement 20.4
   */
  async generateAnnotatedThumbnail(
    imageId: string,
    annotationData: AnnotationData
  ): Promise<string | null> {
    try {
      // 1. 画像メタデータ取得
      const image = await this.prisma.surveyImage.findUnique({
        where: { id: imageId },
        select: {
          id: true,
          surveyId: true,
          originalPath: true,
          width: true,
          height: true,
        },
      });

      if (!image) {
        logger.warn({ imageId }, 'Annotated thumbnail: image not found');
        return null;
      }

      // 注釈オブジェクトが空の場合はサムネイルを削除
      if (!annotationData.objects || annotationData.objects.length === 0) {
        await this.removeAnnotatedThumbnailForImage(imageId, image);
        return null;
      }

      // 2. オリジナル画像取得
      const originalBuffer = await this.storageProvider.get(image.originalPath);
      if (!originalBuffer) {
        logger.warn(
          { imageId, path: image.originalPath },
          'Annotated thumbnail: original image not found in storage'
        );
        return null;
      }

      // 3. SVGオーバーレイ生成
      const svgString = generateSvgFromAnnotation(annotationData, image.width, image.height);
      const svgBuffer = Buffer.from(svgString);

      // 4. Sharpでオリジナル画像にSVGをcomposite（回転対応 - Req 22.4, 22.5）
      const rotation = annotationData.imageRotation ?? 0;
      let pipeline = sharp(originalBuffer);
      if (rotation !== 0) {
        pipeline = pipeline.rotate(rotation);
      }
      const compositeResult = await pipeline
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'inside' })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();

      // 5. R2に保存
      const thumbnailPath = `${ANNOTATED_THUMBNAIL_PREFIX}/${imageId}.jpg`;
      await this.storageProvider.upload(thumbnailPath, compositeResult, {
        contentType: 'image/jpeg',
      });

      // 6. DB更新
      await this.prisma.surveyImage.update({
        where: { id: imageId },
        data: { annotatedThumbnailPath: thumbnailPath },
      });

      logger.info({ imageId, thumbnailPath }, 'Annotated thumbnail generated successfully');
      return thumbnailPath;
    } catch (error) {
      logger.error(
        { imageId, error: error instanceof Error ? error.message : String(error) },
        'Failed to generate annotated thumbnail'
      );
      return null;
    }
  }

  /**
   * 注釈付きサムネイルを削除する
   *
   * 注釈が全て削除された場合にannotatedThumbnailPathをnullに更新し、
   * R2からサムネイルファイルを削除します。
   *
   * @param imageId - 画像ID
   */
  async removeAnnotatedThumbnail(imageId: string): Promise<void> {
    const image = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        annotatedThumbnailPath: true,
      },
    });

    if (!image || !image.annotatedThumbnailPath) {
      return;
    }

    try {
      await this.storageProvider.delete(image.annotatedThumbnailPath);
      await this.prisma.surveyImage.update({
        where: { id: imageId },
        data: { annotatedThumbnailPath: null },
      });
      logger.info({ imageId }, 'Annotated thumbnail removed successfully');
    } catch (error) {
      logger.error(
        { imageId, error: error instanceof Error ? error.message : String(error) },
        'Failed to remove annotated thumbnail'
      );
    }
  }

  /**
   * 空の注釈で呼ばれた場合の内部用削除メソッド
   */
  private async removeAnnotatedThumbnailForImage(
    imageId: string,
    _image: { id: string } & Record<string, unknown>
  ): Promise<void> {
    // 既存サムネイルパスを取得
    const fullImage = await this.prisma.surveyImage.findUnique({
      where: { id: imageId },
      select: { annotatedThumbnailPath: true },
    });

    if (fullImage?.annotatedThumbnailPath) {
      try {
        await this.storageProvider.delete(fullImage.annotatedThumbnailPath);
      } catch (error) {
        logger.warn(
          { imageId, error: error instanceof Error ? error.message : String(error) },
          'Failed to delete existing annotated thumbnail from storage'
        );
      }
    }

    await this.prisma.surveyImage.update({
      where: { id: imageId },
      data: { annotatedThumbnailPath: null },
    });
  }
}
