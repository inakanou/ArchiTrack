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
}

/**
 * IAutoSaveManagerインターフェース
 *
 * @see design.md - IAutoSaveManager
 */
export interface IAutoSaveManager {
  /** 注釈データをlocalStorageに保存する */
  saveToLocal(imageId: string, surveyId: string, data: AnnotationData, force?: boolean): void;
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
  /** マネージャーを破棄する（タイマークリア等） */
  destroy(): void;
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
 * AutoSaveManagerクラス
 *
 * - 30秒間隔のdebounce自動保存
 * - localStorageへの注釈データ保存
 * - 画像ID・調査ID・保存時刻の管理
 *
 * @see design.md - AutoSaveManager
 */
export class AutoSaveManager implements IAutoSaveManager {
  /** debounce間隔（ミリ秒） */
  private debounceInterval: number;

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

  /**
   * コンストラクタ
   * @param options オプション設定
   */
  constructor(options: AutoSaveManagerOptions = {}) {
    this.debounceInterval = options.debounceInterval ?? DEFAULT_DEBOUNCE_INTERVAL;
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
  }

  /**
   * 保存を実行する（内部メソッド）
   */
  private performSave(imageId: string, surveyId: string, data: AnnotationData): void {
    const storageData: LocalStorageData = {
      imageId,
      surveyId,
      annotationData: data,
      savedAt: new Date().toISOString(),
      serverUpdatedAt: null,
    };

    const key = this.getStorageKey(imageId);
    localStorage.setItem(key, JSON.stringify(storageData));

    this.lastAutoSavedAt = storageData.savedAt;
    this.updateStatus('saved');
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
