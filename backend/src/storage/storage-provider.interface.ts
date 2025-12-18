/**
 * ストレージプロバイダーインターフェース
 *
 * ローカルファイルシステム、S3、R2など、異なるストレージバックエンドを
 * 抽象化するためのインターフェースを定義します。
 *
 * @module storage/storage-provider.interface
 */

/**
 * ファイルアップロードオプション
 */
export interface UploadOptions {
  /** コンテンツタイプ (MIME type) */
  contentType?: string;
  /** キャッシュコントロールヘッダー */
  cacheControl?: string;
  /** カスタムメタデータ */
  metadata?: Record<string, string>;
}

/**
 * アップロード結果
 */
export interface UploadResult {
  /** 保存先のキー（パス） */
  key: string;
  /** ファイルサイズ（バイト） */
  size: number;
  /** ファイルのETag（存在する場合） */
  etag?: string;
}

/**
 * 署名付きURLオプション
 */
export interface SignedUrlOptions {
  /** URL有効期間（秒） */
  expiresIn?: number;
  /** レスポンスのContent-Disposition */
  responseContentDisposition?: string;
}

/**
 * ストレージプロバイダーインターフェース
 *
 * すべてのストレージバックエンドが実装すべきメソッドを定義します。
 */
export interface StorageProvider {
  /**
   * プロバイダータイプを取得
   */
  readonly type: 'local' | 'r2' | 's3';

  /**
   * ファイルをアップロード
   *
   * @param key - 保存先のキー（パス）
   * @param data - アップロードするデータ
   * @param options - アップロードオプション
   * @returns アップロード結果
   */
  upload(key: string, data: Buffer, options?: UploadOptions): Promise<UploadResult>;

  /**
   * ファイルを取得
   *
   * @param key - 取得するファイルのキー（パス）
   * @returns ファイルデータ、存在しない場合はnull
   */
  get(key: string): Promise<Buffer | null>;

  /**
   * ファイルを削除
   *
   * @param key - 削除するファイルのキー（パス）
   */
  delete(key: string): Promise<void>;

  /**
   * ファイルの存在確認
   *
   * @param key - 確認するファイルのキー（パス）
   * @returns 存在する場合true
   */
  exists(key: string): Promise<boolean>;

  /**
   * 署名付きURLを取得（読み取り用）
   *
   * @param key - ファイルのキー（パス）
   * @param options - 署名付きURLオプション
   * @returns 署名付きURL
   */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;

  /**
   * 公開URLを取得（公開ファイルの場合）
   *
   * @param key - ファイルのキー（パス）
   * @returns 公開URL、公開設定がない場合はnull
   */
  getPublicUrl(key: string): string | null;

  /**
   * 接続テスト
   *
   * @returns 接続成功の場合true
   */
  testConnection(): Promise<boolean>;

  /**
   * リソースのクリーンアップ
   */
  disconnect(): Promise<void>;
}
