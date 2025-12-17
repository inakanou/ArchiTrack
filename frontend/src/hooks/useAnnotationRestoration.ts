/**
 * useAnnotationRestoration - 注釈データの状態復元フック
 *
 * ページリロード時のlocalStorageチェックと未保存データ復元確認ダイアログを提供する。
 * サーバーデータとの比較・選択機能を含む。
 *
 * @see tasks.md - Task 18.3
 * @see requirements.md - Requirement 13.5
 * @see design.md - AutoSaveManager State Management
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  AnnotationData,
  LocalStorageData,
  IAutoSaveManager,
} from '../services/AutoSaveManager';
import { AutoSaveManager } from '../services/AutoSaveManager';

/**
 * useAnnotationRestoration フックのオプション
 */
export interface UseAnnotationRestorationOptions {
  /** 画像ID */
  imageId: string;
  /** サーバーから取得した注釈データ（nullの場合は新規画像） */
  serverAnnotationData: AnnotationData | null;
  /** サーバーのupdatedAt（ISO文字列、nullの場合は新規画像） */
  serverUpdatedAt: string | null;
  /** AutoSaveManagerインスタンス（オプション、テスト用） */
  autoSaveManager?: IAutoSaveManager;
  /** 復元時のコールバック */
  onRestore?: (data: AnnotationData) => void;
  /** 破棄時のコールバック */
  onDiscard?: () => void;
}

/**
 * useAnnotationRestoration フックの戻り値
 */
export interface UseAnnotationRestorationResult {
  /** ローカルに未保存データが存在するか */
  hasLocalData: boolean;
  /** 復元確認ダイアログを表示するか */
  showRestoreDialog: boolean;
  /** ローカルストレージのデータ */
  localData: LocalStorageData | null;
  /** ローカルデータがサーバーデータより新しいか */
  isLocalNewer: boolean;
  /** サーバー側で競合が発生しているか（ローカル保存後にサーバーが更新された） */
  hasServerConflict: boolean;
  /** ローカル保存時刻（フォーマット済み） */
  localSavedAtFormatted: string | null;
  /** サーバー更新時刻（フォーマット済み） */
  serverUpdatedAtFormatted: string | null;
  /** ローカル注釈オブジェクト数 */
  localObjectCount: number;
  /** サーバー注釈オブジェクト数 */
  serverObjectCount: number;
  /** ローカルデータを復元する */
  confirmRestore: () => void;
  /** ローカルデータを破棄しサーバーデータを使用する */
  discardLocal: () => void;
  /** ダイアログを非表示にする（データは保持） */
  dismissDialog: () => void;
  /** ローカルデータを再チェックする */
  recheckLocalData: () => void;
}

/**
 * 日時を日本語フォーマットで表示する
 * @param isoString ISO形式の日時文字列
 * @returns フォーマットされた日時文字列、または null
 */
function formatDateTime(isoString: string | null): string | null {
  if (!isoString) return null;

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;

    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return null;
  }
}

/**
 * 2つの日時を比較する
 * @param date1 日時1（ISO文字列）
 * @param date2 日時2（ISO文字列）
 * @returns date1がdate2より新しければ1、古ければ-1、同じなら0、無効なら0
 */
function compareDates(date1: string | null, date2: string | null): number {
  if (!date1 || !date2) return 0;

  try {
    const d1 = new Date(date1).getTime();
    const d2 = new Date(date2).getTime();

    if (isNaN(d1) || isNaN(d2)) return 0;

    if (d1 > d2) return 1;
    if (d1 < d2) return -1;
    return 0;
  } catch {
    return 0;
  }
}

/**
 * 注釈データの状態復元フック
 *
 * - ページリロード時にlocalStorageをチェック
 * - 未保存データがあれば復元確認ダイアログを表示
 * - サーバーデータとの比較・選択機能を提供
 *
 * @param options フックオプション
 * @returns 復元状態と操作関数
 */
export function useAnnotationRestoration(
  options: UseAnnotationRestorationOptions
): UseAnnotationRestorationResult {
  const { imageId, serverAnnotationData, serverUpdatedAt, onRestore, onDiscard } = options;

  // AutoSaveManagerインスタンス（オプションで渡された場合はそれを使用、なければ新規作成）
  const [manager] = useState<IAutoSaveManager>(
    () => options.autoSaveManager || new AutoSaveManager()
  );

  // ローカルデータの状態
  const [localData, setLocalData] = useState<LocalStorageData | null>(null);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  /**
   * ローカルデータをチェックして状態を更新する
   */
  const checkLocalData = useCallback(() => {
    const hasData = manager.hasUnsavedData(imageId);
    setHasLocalData(hasData);

    if (hasData) {
      const data = manager.loadFromLocal(imageId);
      setLocalData(data);

      // ダイアログを表示するかどうかを判定
      if (data) {
        // サーバーのupdatedAtとローカルのserverUpdatedAtが同じ場合は、
        // サーバーが既にこのバージョンを持っているためダイアログを表示しない
        const localServerUpdatedAt = data.serverUpdatedAt;
        if (localServerUpdatedAt && serverUpdatedAt && localServerUpdatedAt === serverUpdatedAt) {
          // ローカル保存時のサーバーバージョンと現在のサーバーバージョンが同じ
          // → サーバーは既に最新のため、復元の必要なし
          setShowRestoreDialog(false);
        } else {
          setShowRestoreDialog(true);
        }
      }
    } else {
      setLocalData(null);
      setShowRestoreDialog(false);
    }
  }, [imageId, manager, serverUpdatedAt]);

  // 初回マウント時とimageId変更時にローカルデータをチェック
  useEffect(() => {
    // React Compilerの警告を避けるため、queueMicrotaskで非同期実行
    queueMicrotask(() => {
      checkLocalData();
    });
  }, [checkLocalData]);

  /**
   * ローカルデータがサーバーデータより新しいかどうか
   */
  const isLocalNewer = useMemo(() => {
    if (!localData?.savedAt) return false;
    if (!serverUpdatedAt) return true; // サーバーにデータがない場合はローカルが新しい

    return compareDates(localData.savedAt, serverUpdatedAt) > 0;
  }, [localData?.savedAt, serverUpdatedAt]);

  /**
   * サーバー側で競合が発生しているか
   * （ローカル保存後にサーバーが更新された）
   */
  const hasServerConflict = useMemo(() => {
    if (!localData?.serverUpdatedAt) return false;
    if (!serverUpdatedAt) return false;

    // ローカル保存時のサーバーバージョンと現在のサーバーバージョンを比較
    return compareDates(serverUpdatedAt, localData.serverUpdatedAt) > 0;
  }, [localData, serverUpdatedAt]);

  /**
   * ローカル保存時刻（フォーマット済み）
   */
  const localSavedAtFormatted = useMemo(() => {
    return formatDateTime(localData?.savedAt ?? null);
  }, [localData?.savedAt]);

  /**
   * サーバー更新時刻（フォーマット済み）
   */
  const serverUpdatedAtFormatted = useMemo(() => {
    return formatDateTime(serverUpdatedAt);
  }, [serverUpdatedAt]);

  /**
   * ローカル注釈オブジェクト数
   */
  const localObjectCount = useMemo(() => {
    return localData?.annotationData?.objects?.length ?? 0;
  }, [localData?.annotationData?.objects]);

  /**
   * サーバー注釈オブジェクト数
   */
  const serverObjectCount = useMemo(() => {
    return serverAnnotationData?.objects?.length ?? 0;
  }, [serverAnnotationData?.objects]);

  /**
   * ローカルデータを復元する
   */
  const confirmRestore = useCallback(() => {
    if (localData?.annotationData && onRestore) {
      onRestore(localData.annotationData);
    }
    setShowRestoreDialog(false);
  }, [localData, onRestore]);

  /**
   * ローカルデータを破棄しサーバーデータを使用する
   */
  const discardLocal = useCallback(() => {
    manager.clearLocal(imageId);
    setLocalData(null);
    setHasLocalData(false);
    setShowRestoreDialog(false);
    if (onDiscard) {
      onDiscard();
    }
  }, [imageId, manager, onDiscard]);

  /**
   * ダイアログを非表示にする（データは保持）
   */
  const dismissDialog = useCallback(() => {
    setShowRestoreDialog(false);
  }, []);

  /**
   * ローカルデータを再チェックする
   */
  const recheckLocalData = useCallback(() => {
    checkLocalData();
  }, [checkLocalData]);

  return {
    hasLocalData,
    showRestoreDialog,
    localData,
    isLocalNewer,
    hasServerConflict,
    localSavedAtFormatted,
    serverUpdatedAtFormatted,
    localObjectCount,
    serverObjectCount,
    confirmRestore,
    discardLocal,
    dismissDialog,
    recheckLocalData,
  };
}
