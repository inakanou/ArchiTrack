/**
 * @fileoverview 注釈付きサムネイル生成サービス（サーバー側描画。現在は封鎖中）
 *
 * Task 53.2: AnnotatedThumbnailServiceを実装する
 * Task 115.6: サーバー側の注釈描画による生成手段の位置づけを確定する
 *
 * 注釈保存時にサーバーサイドで注釈付きサムネイル画像を生成・更新するために導入したが、
 * **この描画器は本番データを生成してはならない**。design.md「Requirement 20 /
 * アーキテクチャ方針 / 改訂後の採用方針」のとおり、合成の実行主体は画像編集画面
 * （クライアント）へ改訂され、本描画器には要件を満たせない欠陥が確認されている。
 *
 * そのため `AnnotatedThumbnailService` は構築時点でも各メソッドでも
 * {@link ServerSideAnnotatedThumbnailDisabledError} を送出し、いかなる経路からも
 * 合成済みサムネイルを生成・永続化できない。合成と永続化の実装そのものは、注釈を1つも
 * 描画できないまま既存データを書き換えるため撤去した。将来サーバー側合成を作り直す
 * （design.md の第2案）際は {@link SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON} の
 * 各点を解消することが前提となる。
 *
 * 図形ごとのSVG生成（{@link generateSvgFromAnnotation}）は、描画器が対応していた図形の
 * 範囲を示す記録として残している。単体では本番データを書き換えないが、これを用いた
 * 合成の再導入には上記と同じ前提が掛かる。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 *
 * @module services/annotated-thumbnail
 */

import type { PrismaClient } from '../generated/prisma/client.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import type { AnnotationData, FabricSerializedObject } from './annotation.service.js';

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
// 封鎖（Task 115.6）
// ============================================================================

/**
 * サーバー側描画による注釈付きサムネイル生成が封鎖されている理由。
 *
 * 有効化しようとした者がその場で欠陥を把握できるよう、確認済みの4点を列挙する。
 * 文面は design.md「Requirement 20 / アーキテクチャ方針 / 改訂後の採用方針」に対応する。
 */
export const SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON = [
  'サーバー側の注釈描画による注釈付きサムネイル生成は封鎖されています（Task 115.6）。',
  '合成の実行主体は画像編集画面（クライアント）であり、この描画器は本番データを生成してはなりません。',
  '確認済みの欠陥:',
  '(1) 対応する図形の型が基本図形のみで、実際に保存される矢印・寸法線・多角形・折れ線・' +
    'フリーハンド・テキスト注釈はいずれも該当せず、すべて描画されずに捨てられる',
  '(2) 注釈の座標は編集画面の表示解像度で保存されるが、この描画器には原寸への換算が無く位置がずれる',
  '(3) 直角方向の回転を伴う場合、合成対象の寸法が超過して必ず失敗する',
  '(4) 注釈が0件で回転のみの変更では合成を行わず既存を削除するため、回転が反映されない',
  '有効化するには上記をすべて解消したうえで、design.md の採用方針を改訂してください。',
].join('\n');

/**
 * サーバー側描画による注釈付きサムネイル生成が封鎖されていることを示すエラー。
 *
 * 「たまたま呼ばれていない」ではなく、呼び出そうとした時点で明示的に失敗させるために用いる。
 */
export class ServerSideAnnotatedThumbnailDisabledError extends Error {
  readonly code = 'SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED';

  constructor() {
    super(SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON);
    this.name = 'ServerSideAnnotatedThumbnailDisabledError';
  }
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
 * **この関数の出力を本番データの生成に用いてはなりません（Task 115.6）。**
 * 対応する図形の型は基本図形のみで、実際に保存される矢印・寸法線・多角形・折れ線・
 * フリーハンド・テキスト注釈はいずれも該当せず、すべて描画されずに捨てられます。
 * 加えて、注釈の座標は編集画面の表示解像度で保存されるため原寸への換算も必要です。
 * 詳細は {@link SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON} を参照してください。
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
// サービスクラス（封鎖中）
// ============================================================================

/**
 * 注釈付きサムネイル生成サービス（封鎖中）
 *
 * 注釈保存時に合成済みサムネイルを生成・永続化する手段として Task 53.2 で導入したが、
 * Task 115.6 により**本番データを生成してはならない**手段として封鎖した。
 * 合成の実行主体は画像編集画面（クライアント）であり、保存先の項目は
 * `PATCH /api/site-surveys/images/:imageId/annotated-thumbnail` が更新する。
 *
 * 封鎖は二重に掛けている。構築時点で {@link ServerSideAnnotatedThumbnailDisabledError} を
 * 送出し、構築を迂回して各メソッドへ到達した場合も同じ失敗で拒否する。前者だけでは
 * prototype 経由やサブクラス化で生成が復活しうるためである。
 *
 * 合成と永続化の実装は、注釈を1つも描画できないまま既存データを書き換えるため撤去した。
 * 復活させる場合は {@link SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED_REASON} の各点を
 * 解消したうえで作り直すこと（design.md「Requirement 20 / アーキテクチャ方針」第2案）。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 */
export class AnnotatedThumbnailService {
  constructor(_deps: AnnotatedThumbnailServiceDependencies) {
    // 依存を保持する前に拒否する。依存へ一切触れずに失敗させることで、構築の試みが
    // ストレージ・データベースへ副作用を残さないことを保証する。
    throw new ServerSideAnnotatedThumbnailDisabledError();
  }

  /**
   * 注釈付きサムネイルを生成・更新する（封鎖中）
   *
   * @throws {ServerSideAnnotatedThumbnailDisabledError} 常に送出する
   */
  async generateAnnotatedThumbnail(
    _imageId: string,
    _annotationData: AnnotationData
  ): Promise<string | null> {
    throw new ServerSideAnnotatedThumbnailDisabledError();
  }

  /**
   * 注釈付きサムネイルを削除する（封鎖中）
   *
   * 保存先の項目はクライアント合成の結果で管理されるため、本サービスからは操作しない。
   *
   * @throws {ServerSideAnnotatedThumbnailDisabledError} 常に送出する
   */
  async removeAnnotatedThumbnail(_imageId: string): Promise<void> {
    throw new ServerSideAnnotatedThumbnailDisabledError();
  }
}
