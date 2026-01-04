/**
 * AutoSaveManager - 自動保存・状態復元管理
 *
 * 注釈編集の自動保存とローカル状態の復元を管理する。
 * 30秒間隔のdebounce自動保存を提供し、localStorageへの保存・復元を行う。
 *
 * @see design.md - AutoSaveManager State Management
 * @see requirements.md - 要件13.4, 13.5
 */

/**
 * Fabric.jsシリアライズオブジェクトの基本型
 */
export interface FabricSerializedObject {
  type: string;
  version?: string;
  originX?: string;
  originY?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  [key: string]: unknown;
}

/**
 * 注釈データの型定義（Fabric.js JSON形式）
 *
 * @see design.md - AnnotationDataV1
 */
export interface AnnotationData {
  /** スキーマバージョン */
  version: string;
  /** Fabric.jsオブジェクトの配列 */
  objects: FabricSerializedObject[];
  /** 背景色（オプション） */
  background?: string;
  /** ビューポート変換（オプション） */
  viewportTransform?: number[];
}

/**
 * localStorageに保存するデータ構造
 *
 * @see design.md - LocalStorageData
 */
export interface LocalStorageData {
  /** 画像ID */
  imageId: string;
  /** 現場調査ID */
  surveyId: string;
  /** 注釈データ（Fabric.js JSON形式） */
  annotationData: AnnotationData;
  /** ローカル保存時刻（ISO文字列） */
  savedAt: string;
  /** 最後にサーバーから取得した時点のupdatedAt（ISO文字列、null可） */
  serverUpdatedAt: string | null;
}

/**
 * AutoSaveManager状態
 *
 * @see design.md - AutoSaveState
 */
export interface AutoSaveState {
  /** 未保存の変更があるかどうか */
  hasUnsavedChanges: boolean;
  /** 最後の自動保存時刻（ISO文字列、null可） */
  lastAutoSavedAt: string | null;
  /** 自動保存のステータス */
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

/**
 * 状態変更コールバック型
 */
export type OnStatusChangeCallback = (state: AutoSaveState) => void;

/**
 * AutoSaveManagerコンストラクタオプション
 */
export interface AutoSaveManagerOptions {
  /** debounce間隔（ミリ秒、デフォルト: 30000ms = 30秒） */
  debounceInterval?: number;
  /** 最大キャッシュサイズ（バイト、デフォルト: 4MB） */
  maxCacheSizeBytes?: number;
  /** 最大キャッシュ画像数（デフォルト: 10） */
  maxCachedImages?: number;
  /** 自動保存を無効にする（プライベートブラウジングモード用） */
  disableAutoSave?: boolean;
}

/**
 * QuotaExceededコールバックに渡される情報
 */
export interface QuotaExceededInfo {
  /** 保存しようとした画像ID */
  imageId: string;
  /** 保存しようとした現場調査ID */
  surveyId: string;
  /** 発生したエラー */
  error: Error;
}

/**
 * QuotaExceededコールバック型
 */
export type OnQuotaExceededCallback = (info: QuotaExceededInfo) => void;

/**
 * キャッシュエントリ情報
 *
 * @see design.md - CacheEntry
 */
export interface CacheEntry {
  /** 画像ID */
  imageId: string;
  /** 現場調査ID */
  surveyId: string;
  /** JSON文字列データ */
  data: string;
  /** 保存時刻（タイムスタンプ） */
  savedAt: number;
  /** データサイズ（バイト） */
  size: number;
}

/**
 * ストレージ統計情報
 */
export interface StorageStats {
  /** 総使用サイズ（バイト） */
  totalSize: number;
  /** エントリ数 */
  entryCount: number;
  /** 最大サイズ（バイト） */
  maxSize: number;
  /** 使用率（パーセント） */
  usagePercent: number;
}

/**
 * 保存結果
 */
export interface SaveResult {
  /** 保存成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * IAutoSaveManagerインターフェース
 *
 * @see design.md - IAutoSaveManager
 */
export interface IAutoSaveManager {
  /** 注釈データをlocalStorageに保存する */
  saveToLocal(imageId: string, surveyId: string, data: AnnotationData, force?: boolean): void;
  /** 注釈データをlocalStorageに保存し、結果を返す */
  saveToLocalWithResult(
    imageId: string,
    surveyId: string,
    data: AnnotationData,
    force?: boolean
  ): SaveResult;
  /** localStorageから注釈データを取得する */
  loadFromLocal(imageId: string): LocalStorageData | null;
  /** 指定した画像のローカルデータを削除する */
  clearLocal(imageId: string): void;
  /** 未保存データがあるかどうかを確認する */
  hasUnsavedData(imageId: string): boolean;
  /** 最後の保存時刻を取得する */
  getLastSavedAt(imageId: string): string | null;
  /** サーバーのupdatedAtを設定する */
  setServerUpdatedAt(imageId: string, serverUpdatedAt: string): void;
  /** 状態変更コールバックを設定する */
  setOnStatusChange(callback: OnStatusChangeCallback | null): void;
  /** QuotaExceededコールバックを設定する */
  setOnQuotaExceeded(callback: OnQuotaExceededCallback | null): void;
  /** マネージャーを破棄する（タイマークリア等） */
  destroy(): void;
  /** 全キャッシュエントリを取得する（LRU順、古い順） */
  getAllCacheEntries(): CacheEntry[];
  /** 最大キャッシュサイズを取得する */
  getMaxCacheSizeBytes(): number;
  /** 総キャッシュサイズを取得する */
  getTotalCacheSize(): number;
  /** ストレージ統計を取得する */
  getStorageStats(): StorageStats;
  /** 最も古いエントリを削除する */
  clearOldestEntries(count: number): void;
  /** 自動保存が利用可能かどうかを確認する */
  isAutoSaveAvailable(): boolean;
  /** 自動保存が無効化されているかどうかを確認する */
  isAutoSaveDisabled(): boolean;
}

/**
 * localStorageキープレフィックス
 */
const STORAGE_KEY_PREFIX = 'architrack_annotation_';

/**
 * デフォルトのdebounce間隔（30秒）
 */
const DEFAULT_DEBOUNCE_INTERVAL = 30000;

/**
 * デフォルトの最大キャッシュサイズ（4MB）
 *
 * @see design.md - MAX_CACHE_SIZE_BYTES
 */
const DEFAULT_MAX_CACHE_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * デフォルトの最大キャッシュ画像数
 *
 * @see design.md - MAX_CACHED_IMAGES
 */
const DEFAULT_MAX_CACHED_IMAGES = 10;

/**
 * 単一エントリの警告サイズ（1MB）
 */
const SINGLE_ENTRY_WARNING_SIZE = 1 * 1024 * 1024;

/**
 * AutoSaveManagerクラス
 *
 * - 30秒間隔のdebounce自動保存
 * - localStorageへの注釈データ保存
 * - 画像ID・調査ID・保存時刻の管理
 * - LRU方式での古いキャッシュ削除
 * - 最大4MBの容量制限
 * - QuotaExceededError時のエラーハンドリング
 *
 * @see design.md - AutoSaveManager
 * @see requirements.md - 要件13.4, 13.5
 */
export class AutoSaveManager implements IAutoSaveManager {
  /** debounce間隔（ミリ秒） */
  private debounceInterval: number;

  /** 最大キャッシュサイズ（バイト） */
  private maxCacheSizeBytes: number;

  /** 最大キャッシュ画像数 */
  private maxCachedImages: number;

  /** 画像IDごとの保存タイマー */
  private saveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** 画像IDごとの保留中データ */
  private pendingData: Map<string, { surveyId: string; annotationData: AnnotationData }> =
    new Map();

  /** 現在のステータス */
  private status: AutoSaveState['autoSaveStatus'] = 'idle';

  /** 最後の自動保存時刻 */
  private lastAutoSavedAt: string | null = null;

  /** 状態変更コールバック */
  private onStatusChange: OnStatusChangeCallback | null = null;

  /** QuotaExceededコールバック */
  private onQuotaExceeded: OnQuotaExceededCallback | null = null;

  /** 自動保存が無効化されているか */
  private autoSaveDisabled: boolean = false;

  /** localStorageが利用可能かどうかのキャッシュ */
  private storageAvailable: boolean | null = null;

  /**
   * コンストラクタ
   * @param options オプション設定
   */
  constructor(options: AutoSaveManagerOptions = {}) {
    this.debounceInterval = options.debounceInterval ?? DEFAULT_DEBOUNCE_INTERVAL;
    this.maxCacheSizeBytes = options.maxCacheSizeBytes ?? DEFAULT_MAX_CACHE_SIZE_BYTES;
    this.maxCachedImages = options.maxCachedImages ?? DEFAULT_MAX_CACHED_IMAGES;
    this.autoSaveDisabled = options.disableAutoSave ?? false;
  }

  /**
   * debounce間隔を取得する
   * @returns debounce間隔（ミリ秒）
   */
  getDebounceInterval(): number {
    return this.debounceInterval;
  }

  /**
   * 現在のステータスを取得する
   * @returns 自動保存ステータス
   */
  getStatus(): AutoSaveState['autoSaveStatus'] {
    return this.status;
  }

  /**
   * 最大キャッシュサイズを取得する
   * @returns 最大キャッシュサイズ（バイト）
   */
  getMaxCacheSizeBytes(): number {
    return this.maxCacheSizeBytes;
  }

  /**
   * 注釈データをlocalStorageに保存する
   *
   * - force=true: 即座に保存
   * - force=false: debounce付きで保存（デフォルト）
   *
   * @param imageId 画像ID
   * @param surveyId 現場調査ID
   * @param data 注釈データ
   * @param force 即座に保存するかどうか（デフォルト: false）
   */
  saveToLocal(
    imageId: string,
    surveyId: string,
    data: AnnotationData,
    force: boolean = false
  ): void {
    // 自動保存が無効化されている場合は何もしない
    if (this.autoSaveDisabled) {
      return;
    }

    // 既存のタイマーをクリア
    this.cancelPendingSave(imageId);

    if (force) {
      // 即座に保存
      this.performSave(imageId, surveyId, data);
    } else {
      // debounce付きで保存
      this.pendingData.set(imageId, { surveyId, annotationData: data });
      this.updateStatus('saving');

      const timer = setTimeout(() => {
        const pending = this.pendingData.get(imageId);
        if (pending) {
          this.performSave(imageId, pending.surveyId, pending.annotationData);
          this.pendingData.delete(imageId);
        }
        this.saveTimers.delete(imageId);
      }, this.debounceInterval);

      this.saveTimers.set(imageId, timer);
    }
  }

  /**
   * 注釈データをlocalStorageに保存し、結果を返す
   *
   * @param imageId 画像ID
   * @param surveyId 現場調査ID
   * @param data 注釈データ
   * @param force 即座に保存するかどうか（デフォルト: false）
   * @returns 保存結果
   */
  saveToLocalWithResult(
    imageId: string,
    surveyId: string,
    data: AnnotationData,
    force: boolean = false
  ): SaveResult {
    // 自動保存が無効化されている場合はエラーを返す
    if (this.autoSaveDisabled) {
      return { success: false, error: 'Auto-save is disabled' };
    }

    // 既存のタイマーをクリア
    this.cancelPendingSave(imageId);

    if (force) {
      // 即座に保存し、結果を返す
      return this.performSaveWithResult(imageId, surveyId, data);
    } else {
      // debounce付きで保存（非同期なので常に成功を返す）
      this.pendingData.set(imageId, { surveyId, annotationData: data });
      this.updateStatus('saving');

      const timer = setTimeout(() => {
        const pending = this.pendingData.get(imageId);
        if (pending) {
          this.performSave(imageId, pending.surveyId, pending.annotationData);
          this.pendingData.delete(imageId);
        }
        this.saveTimers.delete(imageId);
      }, this.debounceInterval);

      this.saveTimers.set(imageId, timer);
      return { success: true };
    }
  }

  /**
   * localStorageから注釈データを取得する
   *
   * @param imageId 画像ID
   * @returns 保存されたデータ、または null
   */
  loadFromLocal(imageId: string): LocalStorageData | null {
    const key = this.getStorageKey(imageId);
    const stored = localStorage.getItem(key);

    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as LocalStorageData;
    } catch {
      // 不正なJSONデータの場合はnullを返す
      return null;
    }
  }

  /**
   * 指定した画像のローカルデータを削除する
   *
   * 保留中の保存もキャンセルする。
   *
   * @param imageId 画像ID
   */
  clearLocal(imageId: string): void {
    // 保留中の保存をキャンセル
    this.cancelPendingSave(imageId);
    this.pendingData.delete(imageId);

    // localStorageから削除
    const key = this.getStorageKey(imageId);
    localStorage.removeItem(key);
  }

  /**
   * 未保存データがあるかどうかを確認する
   *
   * @param imageId 画像ID
   * @returns 未保存データがある場合true
   */
  hasUnsavedData(imageId: string): boolean {
    const data = this.loadFromLocal(imageId);
    return data !== null;
  }

  /**
   * 最後の保存時刻を取得する
   *
   * @param imageId 画像ID
   * @returns 保存時刻（ISO文字列）、または null
   */
  getLastSavedAt(imageId: string): string | null {
    const data = this.loadFromLocal(imageId);
    return data?.savedAt ?? null;
  }

  /**
   * サーバーのupdatedAtを設定する
   *
   * localStorageに保存されたデータのserverUpdatedAtを更新する。
   *
   * @param imageId 画像ID
   * @param serverUpdatedAt サーバーのupdatedAt（ISO文字列）
   */
  setServerUpdatedAt(imageId: string, serverUpdatedAt: string): void {
    const data = this.loadFromLocal(imageId);
    if (!data) {
      return;
    }

    data.serverUpdatedAt = serverUpdatedAt;
    const key = this.getStorageKey(imageId);
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * 状態変更コールバックを設定する
   *
   * @param callback コールバック関数（nullで解除）
   */
  setOnStatusChange(callback: OnStatusChangeCallback | null): void {
    this.onStatusChange = callback;
  }

  /**
   * QuotaExceededコールバックを設定する
   *
   * QuotaExceededErrorが発生した際に呼び出されるコールバックを設定します。
   *
   * @param callback コールバック関数（nullで解除）
   */
  setOnQuotaExceeded(callback: OnQuotaExceededCallback | null): void {
    this.onQuotaExceeded = callback;
  }

  /**
   * マネージャーを破棄する
   *
   * 全ての保留中の保存をキャンセルし、コールバックをクリアする。
   */
  destroy(): void {
    // 全てのタイマーをクリア
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer);
    }
    this.saveTimers.clear();
    this.pendingData.clear();
    this.onStatusChange = null;
    this.onQuotaExceeded = null;
  }

  /**
   * 全キャッシュエントリを取得する（LRU順、古い順）
   *
   * @returns キャッシュエントリの配列（savedAtでソート、古い順）
   */
  getAllCacheEntries(): CacheEntry[] {
    const entries: CacheEntry[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const data = JSON.parse(value) as LocalStorageData;
            entries.push({
              imageId: data.imageId,
              surveyId: data.surveyId,
              data: value,
              savedAt: new Date(data.savedAt).getTime(),
              size: new Blob([value]).size,
            });
          } catch {
            // 不正なJSONは無視
          }
        }
      }
    }

    // savedAtでソート（古い順）
    entries.sort((a, b) => a.savedAt - b.savedAt);
    return entries;
  }

  /**
   * 総キャッシュサイズを取得する
   *
   * @returns 総サイズ（バイト）
   */
  getTotalCacheSize(): number {
    const entries = this.getAllCacheEntries();
    return entries.reduce((sum, entry) => sum + entry.size, 0);
  }

  /**
   * ストレージ統計を取得する
   *
   * @returns ストレージ統計情報
   */
  getStorageStats(): StorageStats {
    const entries = this.getAllCacheEntries();
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

    return {
      totalSize,
      entryCount: entries.length,
      maxSize: this.maxCacheSizeBytes,
      usagePercent: (totalSize / this.maxCacheSizeBytes) * 100,
    };
  }

  /**
   * 最も古いエントリを削除する
   *
   * @param count 削除するエントリ数
   */
  clearOldestEntries(count: number): void {
    const entries = this.getAllCacheEntries(); // 既にsavedAtでソート済み（古い順）

    const toDelete = entries.slice(0, count);
    for (const entry of toDelete) {
      const key = this.getStorageKey(entry.imageId);
      localStorage.removeItem(key);
    }
  }

  /**
   * 自動保存が利用可能かどうかを確認する
   *
   * localStorageが利用できない場合（プライベートモード、セキュリティ制限等）
   * はfalseを返す。
   *
   * @returns 自動保存が利用可能な場合true
   */
  isAutoSaveAvailable(): boolean {
    // キャッシュがある場合はそれを返す
    if (this.storageAvailable !== null) {
      return this.storageAvailable;
    }

    // localStorageのテスト
    const testKey = '__autosave_test__';
    try {
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      this.storageAvailable = true;
      return true;
    } catch {
      // SecurityError、QuotaExceededError等
      this.storageAvailable = false;
      return false;
    }
  }

  /**
   * 自動保存が無効化されているかどうかを確認する
   *
   * @returns 自動保存が無効化されている場合true
   */
  isAutoSaveDisabled(): boolean {
    return this.autoSaveDisabled;
  }

  /**
   * 保存を実行する（内部メソッド）
   */
  private performSave(imageId: string, surveyId: string, data: AnnotationData): void {
    const result = this.performSaveWithResult(imageId, surveyId, data);
    if (!result.success) {
      this.updateStatus('error');
    }
  }

  /**
   * 保存を実行し、結果を返す（内部メソッド）
   *
   * @see design.md - saveWithQuotaManagement
   */
  private performSaveWithResult(
    imageId: string,
    surveyId: string,
    data: AnnotationData
  ): SaveResult {
    const storageData: LocalStorageData = {
      imageId,
      surveyId,
      annotationData: data,
      savedAt: new Date().toISOString(),
      serverUpdatedAt: null,
    };

    const jsonString = JSON.stringify(storageData);
    const size = new Blob([jsonString]).size;

    // 単一エントリが1MBを超える場合は警告
    if (size > SINGLE_ENTRY_WARNING_SIZE) {
      console.warn(
        `Annotation data for image ${imageId} exceeds 1MB (${(size / 1024 / 1024).toFixed(2)}MB), consider reducing annotations`
      );
    }

    // 容量確保（LRU方式で古いキャッシュを削除）
    this.ensureStorageSpace(size);

    // 保存試行
    const key = this.getStorageKey(imageId);
    try {
      localStorage.setItem(key, jsonString);
      this.lastAutoSavedAt = storageData.savedAt;
      this.updateStatus('saved');
      return { success: true };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        // 緊急クリーンアップ後にリトライ
        this.clearOldestEntries(3);
        try {
          localStorage.setItem(key, jsonString);
          this.lastAutoSavedAt = storageData.savedAt;
          this.updateStatus('saved');
          return { success: true };
        } catch (retryError) {
          // 保存失敗 - コールバックを呼び出す
          if (this.onQuotaExceeded) {
            this.onQuotaExceeded({
              imageId,
              surveyId,
              error: retryError instanceof Error ? retryError : new Error('QuotaExceededError'),
            });
          }
          this.updateStatus('error');
          return { success: false, error: 'Storage quota exceeded, cannot free enough space' };
        }
      }
      // その他のエラー
      this.updateStatus('error');
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * 必要な容量を確保する（内部メソッド）
   *
   * LRU方式で古いエントリを削除して容量を確保する。
   * また、最大キャッシュ画像数も考慮する。
   *
   * @param requiredSize 必要なサイズ（バイト）
   */
  private ensureStorageSpace(requiredSize: number): void {
    const entries = this.getAllCacheEntries(); // 既にsavedAtでソート済み（古い順）
    let totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    const entriesToDelete: CacheEntry[] = [];

    // 容量が不足している場合、古いエントリを削除予定に追加
    let currentEntryCount = entries.length;
    for (const entry of entries) {
      const needsCapacitySpace = totalSize + requiredSize > this.maxCacheSizeBytes;
      const needsCountSpace = currentEntryCount >= this.maxCachedImages;

      if (!needsCapacitySpace && !needsCountSpace) {
        break;
      }

      entriesToDelete.push(entry);
      totalSize -= entry.size;
      currentEntryCount--;
    }

    // 削除実行
    for (const entry of entriesToDelete) {
      const key = this.getStorageKey(entry.imageId);
      localStorage.removeItem(key);
    }
  }

  /**
   * 保留中の保存をキャンセルする（内部メソッド）
   */
  private cancelPendingSave(imageId: string): void {
    const timer = this.saveTimers.get(imageId);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(imageId);
    }
  }

  /**
   * ストレージキーを取得する（内部メソッド）
   */
  private getStorageKey(imageId: string): string {
    return `${STORAGE_KEY_PREFIX}${imageId}`;
  }

  /**
   * ステータスを更新し、コールバックを呼び出す（内部メソッド）
   */
  private updateStatus(newStatus: AutoSaveState['autoSaveStatus']): void {
    this.status = newStatus;
    this.notifyStatusChange();
  }

  /**
   * ステータス変更を通知する（内部メソッド）
   */
  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange({
        hasUnsavedChanges: this.pendingData.size > 0,
        lastAutoSavedAt: this.lastAutoSavedAt,
        autoSaveStatus: this.status,
      });
    }
  }
}
