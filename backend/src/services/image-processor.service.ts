/**
 * @fileoverview 画像処理サービス
 *
 * 画像の圧縮、サムネイル生成、メタデータ取得を担当します。
 *
 * Task 4.2: 画像圧縮・サムネイル生成機能
 * - Sharpによる画像処理
 * - 300KB超過時の段階的圧縮（まず品質を10%ずつ下げ、品質だけで収まらない場合にのみ
 *   リサイズへ移り、350KB以下に収まった時点で打ち切る）
 * - サムネイル生成（200x200px）
 * - 画像メタデータ（幅・高さ・サイズ）の取得
 *
 * Requirements:
 * - 4.4: 画像アップロード完了時にサムネイルを自動生成する
 * - 4.6: ファイルサイズが上限（300KB）を超える場合、画像サイズと品質を段階的に下げ、
 *        350KB以下に収まった時点で圧縮を打ち切って登録する
 *
 * @module services/image-processor
 */

/**
 * 画像処理エラー
 */
export class ImageProcessingError extends Error {
  readonly code: string;

  constructor(message: string, code: string, cause?: Error) {
    super(message, { cause });
    this.name = 'ImageProcessingError';
    this.code = code;
  }
}

/**
 * 画像メタデータ
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

/**
 * 圧縮結果
 */
export interface CompressedImage {
  buffer: Buffer;
  metadata: ImageMetadata;
  /**
   * 元画像が上限（{@link ImageProcessorService.MAX_SIZE_BYTES} = 300KB）を超えており、
   * 段階的圧縮の経路を通ったことを表す。
   *
   * **`true` は再エンコードが行われたことを意味しない。** 300KB超〜350KB以下の入力は
   * 打ち切りサイズ（350KB）を既に満たしているため圧縮のループが一度も回らず、
   * `buffer` は入力と同一のまま `true` になる。要件4.6「350KB以下に収まった時点で
   * 圧縮を打ち切る」に従った結果である（Task 115.171。従前の呼称 `wasCompressed` は
   * この場合に実態を表していなかった）。
   *
   * **`buffer` が打ち切りサイズ以下であることも意味しない。** 品質もリサイズも
   * 下げ切って収まらなかった場合は 350KB を超えたまま `true` を返す。
   *
   * `false` のときは元画像が 300KB以下であり、`buffer` は必ず入力と同一である。
   *
   * ---
   *
   * **何のために在るか（Task 115.207 で撤去せず残すと決めた根拠）。**
   * この項目に**本番コードの読み手は一件も無い**。`processImage` の呼び出し元三箇所
   * （`image-upload.service.ts` / `batch-upload.service.ts` /
   * `construction-photo-image.service.ts`）はいずれも `original.buffer` と
   * `metadata.*` しか読まず、API 応答・DB 列・フロントエンドにも現れない
   * （プロパティアクセス・分割代入・オブジェクトの丸ごと流出の三系統に加え、
   * 列挙（`Object.keys` / `entries` / `values` / `assign`）・動的な添字・
   * シリアライズ・型経由の露出も走査した Task 115.207 時点の実測。いずれも 0 件。
   * 読み手が増えたら、この記述ごと見直すこと）。
   * **要件4.6 の引き金（300KB超）を観測できる唯一の点として、検証のためだけに在る。**
   *
   * 撤去せずに残すのは、**300KB超〜350KB以下の帯ではこの項目以外に分岐の痕跡が
   * 一切残らない**ためである。当該の帯では早期リターンの経路と段階的圧縮の経路が
   * 返す `buffer`・`metadata`・sharp の呼び出し回数がすべて一致するため、この項目を
   * 外すと {@link ImageProcessorService.MAX_SIZE_BYTES}（300KB）の境界は検証不能に
   * なる。実測（Task 115.207。件数は当時の値。関連四ファイル＝本サービスと
   * `image-upload` / `batch-upload` / `construction-photo-image` の各単体検証）:
   * 早期リターンの `<=` を `<` へ変異させると、152 件のうち落ちるのはこの項目を見る
   * 2 件の表明だけである（うち 1 件は本タスクで新設した検証。本タスク以前は 151 件中
   * 1 件だった）。その 2 件から印の表明だけを外して同じ変異を掛けると、152 件すべてが
   * 緑のまま通る。
   *
   * この根拠が失効する場合——本番でこの分岐が観測できるようになる、あるいは本番に
   * 読み手ができる——は置き所を見直すこと。前者は
   * 「300KB境界の両側はこの印を除く観測がすべて一致する」ことを表明した
   * `image-processor.service.test.ts` の検証が赤くなって知らせる。
   */
  originalExceededSizeLimit: boolean;
}

/**
 * 処理済み画像
 */
export interface ProcessedImage {
  original: CompressedImage;
  thumbnail: Buffer;
  metadata: ImageMetadata;
}

/**
 * Sharpインスタンスの型定義（テスト用モック対応）
 */
export interface SharpInstance {
  metadata(): Promise<{
    width?: number;
    height?: number;
    format?: string;
    size?: number;
  }>;
  resize(
    width: number,
    height: number,
    options?: { fit?: string; position?: string }
  ): SharpInstance;
  jpeg(options?: { quality?: number }): SharpInstance;
  png(options?: { compressionLevel?: number }): SharpInstance;
  webp(options?: { quality?: number }): SharpInstance;
  toBuffer(): Promise<Buffer>;
}

/**
 * Sharp静的関数の型定義（テスト用モック対応）
 */
export interface SharpStatic {
  (input: Buffer): SharpInstance;
}

/**
 * サムネイルの出力形式
 *
 * - `preserve`: 元画像の形式を保つ（既定。アップロード時の素のサムネイル）
 * - `jpeg`: JPEGへ固定する（保存キーの拡張子やContent-TypeをJPEGで申告する保存先向け）
 */
export type ThumbnailOutputFormat = 'preserve' | 'jpeg';

/**
 * サムネイル生成のオプション
 */
export interface GenerateThumbnailOptions {
  /** 出力形式（既定: `preserve`） */
  outputFormat?: ThumbnailOutputFormat;
}

/**
 * 画像処理サービス
 *
 * Sharpを使用した画像処理を提供します。
 */
export class ImageProcessorService {
  /**
   * 段階的圧縮を開始する閾値（300KB）
   *
   * 要件4.6 の「上限（300KB）」にあたる。**出力サイズの上限ではない。**
   * 出力の打ち切りは {@link ImageProcessorService.TARGET_MAX_SIZE_BYTES}（350KB）が
   * 担うため、この値を超える出力は正常に生じうる（Task 115.171）。
   */
  static readonly MAX_SIZE_BYTES = 300 * 1024;

  /**
   * 圧縮の打ち切りサイズ（350KB）
   *
   * 段階的に品質とサイズを下げ、この値以下に収まった時点で圧縮を打ち切る。
   * 下限は定めない。よく圧縮できる画像は品質90の一度の再エンコードでこの値を
   * 大きく下回るが、下限へ戻すには品質を上げ直すか拡大するしかなく、
   * 元画像より劣化した状態で容量だけ増やすことになるためである（Requirement 4.6）。
   */
  static readonly TARGET_MAX_SIZE_BYTES = 350 * 1024;

  /**
   * サムネイル幅（200px）
   */
  static readonly THUMBNAIL_WIDTH = 200;

  /**
   * サムネイル高さ（200px）
   */
  static readonly THUMBNAIL_HEIGHT = 200;

  /**
   * 品質減少ステップ（10%）
   */
  static readonly QUALITY_STEP = 10;

  /**
   * 最小品質（30%）
   */
  private static readonly MIN_QUALITY = 30;

  /**
   * リサイズステップ（50%）
   */
  private static readonly RESIZE_STEP = 0.5;

  /**
   * 最小リサイズ比率（25%）
   */
  private static readonly MIN_RESIZE_RATIO = 0.25;

  private readonly sharp: SharpStatic;

  constructor(sharp: SharpStatic) {
    this.sharp = sharp;
  }

  /**
   * 画像メタデータを取得
   *
   * @param buffer - 画像バッファ
   * @returns 画像メタデータ
   * @throws {ImageProcessingError} メタデータ取得に失敗した場合
   */
  async getMetadata(buffer: Buffer): Promise<ImageMetadata> {
    try {
      const instance = this.sharp(buffer);
      const metadata = await instance.metadata();

      if (!metadata.width || !metadata.height) {
        throw new ImageProcessingError(
          '画像のメタデータが不正です。幅または高さが取得できませんでした。',
          'INVALID_METADATA'
        );
      }

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: metadata.size || buffer.length,
      };
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        '画像メタデータの取得に失敗しました。',
        'METADATA_EXTRACTION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * サムネイルを生成
   *
   * Requirements: 4.4
   *
   * 出力形式は既定で元画像の形式を保つ。保存先が拡張子やContent-Typeで形式を
   * 申告する場合は `options.outputFormat` で形式を固定し、申告と実体を一致させる
   * （Task 115.18）。
   *
   * @param buffer - 元画像バッファ
   * @param width - サムネイル幅（デフォルト: 200px）
   * @param height - サムネイル高さ（デフォルト: 200px）
   * @param options - 生成オプション（出力形式）
   * @returns サムネイルバッファ
   * @throws {ImageProcessingError} サムネイル生成に失敗した場合
   */
  async generateThumbnail(
    buffer: Buffer,
    width: number = ImageProcessorService.THUMBNAIL_WIDTH,
    height: number = ImageProcessorService.THUMBNAIL_HEIGHT,
    options: GenerateThumbnailOptions = {}
  ): Promise<Buffer> {
    try {
      const metadata = await this.getMetadata(buffer);
      const instance = this.sharp(buffer);

      // サムネイルサイズにリサイズ（カバーモードで中央を切り抜き）
      instance.resize(width, height, {
        fit: 'cover',
        position: 'centre',
      });

      // フォーマットに応じた出力設定
      // 出力形式が指定された場合は元画像の形式ではなく指定形式で書き出す
      const outputFormat = options.outputFormat === 'jpeg' ? 'jpeg' : metadata.format;
      this.applyFormatSettings(instance, outputFormat, 80);

      return await instance.toBuffer();
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        'サムネイルの生成に失敗しました。',
        'THUMBNAIL_GENERATION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 画像を圧縮
   *
   * Requirements: 4.6
   * 300KB超過時は品質を10%ずつ下げ、品質だけで収まらない場合にのみリサイズへ移り、
   * 350KB以下に収まった時点で打ち切る
   *
   * @param buffer - 元画像バッファ
   * @returns 圧縮結果
   * @throws {ImageProcessingError} 圧縮に失敗した場合
   */
  async compressImage(buffer: Buffer): Promise<CompressedImage> {
    try {
      const originalMetadata = await this.getMetadata(buffer);

      // 300KB以下の場合は圧縮不要
      if (originalMetadata.size <= ImageProcessorService.MAX_SIZE_BYTES) {
        return {
          buffer,
          metadata: originalMetadata,
          originalExceededSizeLimit: false,
        };
      }

      // 段階的圧縮を実行
      return await this.performCompression(buffer, originalMetadata);
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError(
        '画像の圧縮に失敗しました。',
        'COMPRESSION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 画像を処理（圧縮 + サムネイル生成）
   *
   * @param buffer - 元画像バッファ
   * @returns 処理済み画像
   * @throws {ImageProcessingError} 処理に失敗した場合
   */
  async processImage(buffer: Buffer): Promise<ProcessedImage> {
    // 圧縮処理
    const compressedResult = await this.compressImage(buffer);

    // サムネイル生成（圧縮済み画像から生成）
    const thumbnail = await this.generateThumbnail(compressedResult.buffer);

    // 最終的なメタデータを取得
    const finalMetadata = await this.getMetadata(compressedResult.buffer);

    return {
      original: compressedResult,
      thumbnail,
      metadata: finalMetadata,
    };
  }

  /**
   * 段階的圧縮を実行
   *
   * @param buffer - 元画像バッファ
   * @param originalMetadata - 元画像メタデータ
   * @returns 圧縮結果
   */
  private async performCompression(
    buffer: Buffer,
    originalMetadata: ImageMetadata
  ): Promise<CompressedImage> {
    let currentBuffer = buffer;
    let currentQuality = 90; // 初期品質
    let currentMetadata = originalMetadata;

    // 品質を段階的に下げて圧縮
    while (
      currentMetadata.size > ImageProcessorService.TARGET_MAX_SIZE_BYTES &&
      currentQuality >= ImageProcessorService.MIN_QUALITY
    ) {
      const instance = this.sharp(buffer);

      // このループはリサイズを行わない。以前あった `if (resizeRatio < 1.0)` は、
      // `resizeRatio` を下げるのが後段のリサイズのループだけで、そこへ入るのは
      // このループを抜けたあとであるため恒偽であった（Task 115.171 で撤去）。
      // `resizeRatio` の宣言は後段のループの直前へ移してある。これにより宣言位置を
      // 保ったままこの分岐を書き戻すと TDZ で型検査が落ちる。宣言ごと元位置へ戻せば
      // 型検査は通るが、その場合も恒偽のままで挙動は変わらない。

      // 品質設定を適用
      this.applyFormatSettings(instance, originalMetadata.format, currentQuality);

      currentBuffer = await instance.toBuffer();
      currentMetadata = await this.getMetadata(currentBuffer);

      // 打ち切りサイズ以下に収まった場合はループ継続条件が偽になり、ここで圧縮は終わる。
      // 収まらなかった場合のみ品質を下げて次の段階へ進む。
      currentQuality -= ImageProcessorService.QUALITY_STEP;
    }

    // 品質だけでは不十分な場合、リサイズを適用
    let resizeRatio = 1.0;
    while (
      currentMetadata.size > ImageProcessorService.TARGET_MAX_SIZE_BYTES &&
      resizeRatio > ImageProcessorService.MIN_RESIZE_RATIO
    ) {
      resizeRatio *= ImageProcessorService.RESIZE_STEP;
      const instance = this.sharp(buffer);

      const newWidth = Math.round(originalMetadata.width * resizeRatio);
      const newHeight = Math.round(originalMetadata.height * resizeRatio);
      instance.resize(newWidth, newHeight);

      // 最低品質で圧縮
      this.applyFormatSettings(
        instance,
        originalMetadata.format,
        ImageProcessorService.MIN_QUALITY
      );

      currentBuffer = await instance.toBuffer();
      currentMetadata = await this.getMetadata(currentBuffer);
    }

    return {
      buffer: currentBuffer,
      metadata: currentMetadata,
      originalExceededSizeLimit: true,
    };
  }

  /**
   * フォーマットに応じた出力設定を適用
   *
   * @param instance - Sharpインスタンス
   * @param format - 画像フォーマット
   * @param quality - 品質（0-100）
   */
  private applyFormatSettings(instance: SharpInstance, format: string, quality: number): void {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        instance.jpeg({ quality });
        break;
      case 'png':
        // PNGは品質ではなく圧縮レベル（0-9）を使用
        // 品質が高いほど圧縮レベルは低く
        const compressionLevel = Math.round(9 - (quality / 100) * 6);
        instance.png({ compressionLevel });
        break;
      case 'webp':
        instance.webp({ quality });
        break;
      default:
        // 不明なフォーマットの場合はJPEGとして処理
        instance.jpeg({ quality });
    }
  }
}
