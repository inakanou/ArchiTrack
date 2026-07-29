/**
 * @fileoverview 看板合成サービス（オンデマンド・保存しない）
 *
 * Task 3.3: 看板合成＋印字画像エンドポイント
 *
 * 原本画像バッファへ電子小黒板SVG（Task 3.2 の generateSignboardSvg）を
 * sharp.composite で重畳し、印字用の JPEG バッファを生成する。PDF出力時（低頻度）に
 * オンデマンドで実行し、合成結果はストレージへ保存しない（サーバ権威・常に最新内容で焼き込み）。
 *
 * 合成パターンは annotated-thumbnail.service.ts の sharp composite 実績を踏襲する。
 * SVG の viewBox は画像実寸（imageWidth×imageHeight）で生成されるため、
 * composite は top:0/left:0 で重畳する（配置座標は SVG 内の矩形座標として表現済み）。
 *
 * Requirements:
 * - 9.6: 看板ありは指定位置・大きさで写真へ重畳する
 * - 10.8: PDF出力時に看板の登録内容を電子小黒板調で指定位置・大きさで重畳する
 *
 * @module services/signboard-composite
 */

import { generateSignboardSvg } from './signboard-svg.service.js';
import type {
  ConstructionSignboardDto,
  SignboardPlacement,
} from '../types/construction-photo.types.js';

/**
 * sharp インスタンスの最小型（テスト用モック対応）。
 * composite に必要な metadata / composite / jpeg / toBuffer のみを要求する。
 */
export interface CompositeSharpInstance {
  metadata(): Promise<{ width?: number; height?: number }>;
  composite(inputs: Array<{ input: Buffer; top: number; left: number }>): CompositeSharpInstance;
  jpeg(options?: { quality?: number }): CompositeSharpInstance;
  toBuffer(): Promise<Buffer>;
}

/**
 * sharp 静的関数の最小型（テスト用モック対応）
 */
export interface CompositeSharpStatic {
  (input: Buffer): CompositeSharpInstance;
}

/**
 * 合成出力の JPEG 品質（印字用途のため高め）
 */
const JPEG_QUALITY = 90;

/**
 * サービス依存関係
 */
export interface SignboardCompositeServiceDependencies {
  /** sharp 静的関数（本番は sharp、テストはモック） */
  sharp: CompositeSharpStatic;
}

/**
 * 看板合成サービス
 */
export class SignboardCompositeService {
  private readonly sharp: CompositeSharpStatic;

  constructor(deps: SignboardCompositeServiceDependencies) {
    this.sharp = deps.sharp;
  }

  /**
   * 原本画像へ電子小黒板SVGを重畳し、印字用 JPEG バッファを返す（保存しない）。
   *
   * 手順:
   * 1. 原本の実寸（width/height）を sharp.metadata で取得
   * 2. 実寸を viewBox とする電子小黒板SVGを生成（配置は SVG 内の矩形座標）
   * 3. SVG を top:0/left:0 で composite（viewBox が画像実寸のため原点合成でよい）
   * 4. JPEG 化してバッファを返す
   *
   * Requirements: 9.6, 10.8
   *
   * @param originalBuffer - 原本画像バッファ
   * @param signboard - 工事看板DTO
   * @param placement - 看板配置（画像ピクセル座標系）
   * @returns 看板を重畳した印字用 JPEG バッファ
   * @throws {Error} 原本画像の寸法を取得できない場合
   */
  async composite(
    originalBuffer: Buffer,
    signboard: ConstructionSignboardDto,
    placement: SignboardPlacement
  ): Promise<Buffer> {
    const image = this.sharp(originalBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('原本画像の寸法を取得できませんでした');
    }

    const svg = generateSignboardSvg(signboard, placement, metadata.width, metadata.height);
    const svgBuffer = Buffer.from(svg);

    return image
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  }
}
