/**
 * @fileoverview 数量表保存フック
 *
 * Task 8.2: 手動保存と整合性チェックを実装する
 *
 * Requirements:
 * - 11.1: 数量表の各フィールドの変更内容を保存する
 * - 11.4: 楽観的排他制御エラー（競合）が発生した場合、再読み込みを促すダイアログを表示する
 * - 11.5: 自動保存が有効な状態で、一定間隔で数量表を自動保存する
 *
 * Features:
 * - 自動保存（デバウンス付き）
 * - 手動保存
 * - バリデーション
 * - 整合性チェック
 * - 楽観的排他制御
 * - ドラフト保存
 * - 競合解決
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { QuantityTableEdit, ValidationError, SaveStatus } from '../types/quantity-edit.types';

/**
 * 競合解決の方法
 */
export type ConflictResolution = 'reload' | 'forceOverwrite';

/**
 * useQuantityTableSaveフックのオプション
 */
export interface UseQuantityTableSaveOptions {
  /**
   * 数量表データ
   */
  quantityTable: QuantityTableEdit | null;

  /**
   * フック有効化
   */
  enabled?: boolean;

  /**
   * 自動保存有効化
   * @default true
   */
  autoSaveEnabled?: boolean;

  /**
   * 自動保存デバウンス時間（ミリ秒）
   * @default 1500
   */
  autoSaveDebounceMs?: number;

  /**
   * ドラフトキー
   */
  draftKey?: string;

  /**
   * 保存処理
   */
  onSave?: () => Promise<void>;

  /**
   * 強制保存処理（競合時の上書き）
   */
  onForceSave?: () => Promise<void>;

  /**
   * リロード処理
   */
  onReload?: () => Promise<void>;

  /**
   * バリデーションエラーコールバック
   */
  onValidationError?: (errors: ValidationError[]) => void;
}

/**
 * 整合性問題
 */
export interface IntegrityIssue {
  /**
   * 問題のパス
   */
  path: string;

  /**
   * 問題メッセージ
   */
  message: string;

  /**
   * 警告レベル
   */
  severity: 'warning' | 'error';
}

/**
 * useQuantityTableSaveフックの戻り値
 */
export interface UseQuantityTableSaveResult {
  /**
   * 保存ステータス
   */
  saveStatus: SaveStatus;

  /**
   * 保存中かどうか
   */
  isSaving: boolean;

  /**
   * 未保存の変更があるか
   */
  hasUnsavedChanges: boolean;

  /**
   * 最終保存日時
   */
  lastSavedAt: string | null;

  /**
   * バリデーションエラー一覧
   */
  validationErrors: ValidationError[];

  /**
   * 保存エラーメッセージ
   */
  saveError: string | null;

  /**
   * 競合があるか
   */
  hasConflict: boolean;

  /**
   * サーバー側の更新日時（競合時）
   */
  serverUpdatedAt: string | null;

  /**
   * 変更をマーク
   */
  markAsChanged: () => void;

  /**
   * バリデーション実行
   */
  validate: () => ValidationError[];

  /**
   * 整合性チェック
   */
  checkIntegrity: () => IntegrityIssue[];

  /**
   * 保存実行
   */
  save: () => Promise<void>;

  /**
   * 競合エラーを設定
   */
  setConflictError: (hasConflict: boolean, serverUpdatedAt?: string) => void;

  /**
   * 競合解決
   */
  resolveConflict: (resolution: ConflictResolution) => Promise<void>;

  /**
   * ドラフトを読み込む
   */
  loadDraft: () => QuantityTableEdit | null;

  /**
   * ドラフトをクリア
   */
  clearDraft: () => void;
}

/**
 * 数量表保存フック
 *
 * @example
 * ```tsx
 * const {
 *   saveStatus,
 *   isSaving,
 *   hasUnsavedChanges,
 *   validationErrors,
 *   save,
 *   markAsChanged,
 * } = useQuantityTableSave({
 *   quantityTable,
 *   enabled: true,
 *   autoSaveEnabled: true,
 *   onSave: async () => {
 *     await saveQuantityTable(quantityTable);
 *   },
 * });
 * ```
 */
export function useQuantityTableSave(
  options: UseQuantityTableSaveOptions
): UseQuantityTableSaveResult {
  const {
    quantityTable,
    enabled = true,
    autoSaveEnabled = true,
    autoSaveDebounceMs = 1500,
    draftKey,
    onSave,
    onForceSave,
    onReload,
    onValidationError,
  } = options;

  // 状態
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);

  // Refs
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quantityTableRef = useRef(quantityTable);

  // データの参照を更新
  useEffect(() => {
    quantityTableRef.current = quantityTable;
  }, [quantityTable]);

  /**
   * 必須フィールドバリデーション
   */
  const validate = useCallback((): ValidationError[] => {
    const errors: ValidationError[] = [];

    if (!quantityTableRef.current) return errors;

    const { groups } = quantityTableRef.current;

    groups.forEach((group, groupIndex) => {
      group.items.forEach((item, itemIndex) => {
        const basePath = `groups[${groupIndex}].items[${itemIndex}]`;

        // 必須フィールドチェック
        if (!item.majorCategory?.trim()) {
          errors.push({
            path: `${basePath}.majorCategory`,
            message: '大項目は必須です',
          });
        }

        if (!item.workType?.trim()) {
          errors.push({
            path: `${basePath}.workType`,
            message: '工種は必須です',
          });
        }

        if (!item.name?.trim()) {
          errors.push({
            path: `${basePath}.name`,
            message: '名称は必須です',
          });
        }

        if (!item.unit?.trim()) {
          errors.push({
            path: `${basePath}.unit`,
            message: '単位は必須です',
          });
        }
      });
    });

    setValidationErrors(errors);
    return errors;
  }, []);

  /**
   * 整合性チェック
   */
  const checkIntegrity = useCallback((): IntegrityIssue[] => {
    const issues: IntegrityIssue[] = [];

    if (!quantityTableRef.current) return issues;

    const { groups } = quantityTableRef.current;

    groups.forEach((group, groupIndex) => {
      group.items.forEach((item, itemIndex) => {
        const basePath = `groups[${groupIndex}].items[${itemIndex}]`;

        // 計算方法と計算パラメータの整合性
        if (item.calculationMethod === 'AREA_VOLUME') {
          if (!item.calculationParams) {
            issues.push({
              path: `${basePath}.calculationParams`,
              message: '面積・体積計算方法が選択されていますが、計算パラメータが設定されていません',
              severity: 'warning',
            });
          }
        }

        if (item.calculationMethod === 'PITCH') {
          if (!item.calculationParams) {
            issues.push({
              path: `${basePath}.calculationParams`,
              message: 'ピッチ計算方法が選択されていますが、計算パラメータが設定されていません',
              severity: 'warning',
            });
          }
        }

        // 数量が0の場合の警告
        if (item.quantity === 0) {
          issues.push({
            path: `${basePath}.quantity`,
            message: '数量が0です',
            severity: 'warning',
          });
        }

        // 調整係数の妥当性
        if (item.adjustmentFactor <= 0) {
          issues.push({
            path: `${basePath}.adjustmentFactor`,
            message: '調整係数が0以下です',
            severity: 'error',
          });
        }
      });
    });

    return issues;
  }, []);

  /**
   * ドラフトを保存
   */
  const saveDraft = useCallback(() => {
    if (!draftKey || !quantityTableRef.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(quantityTableRef.current));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [draftKey]);

  /**
   * ドラフトをクリア
   */
  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [draftKey]);

  /**
   * ドラフトを読み込む
   */
  const loadDraft = useCallback((): QuantityTableEdit | null => {
    if (!draftKey) return null;
    try {
      const draft = localStorage.getItem(draftKey);
      if (!draft) return null;
      return JSON.parse(draft) as QuantityTableEdit;
    } catch {
      return null;
    }
  }, [draftKey]);

  /**
   * 保存実行
   */
  const performSave = useCallback(async () => {
    if (!enabled) return;

    // バリデーション
    const errors = validate();
    if (errors.length > 0) {
      setSaveStatus('error');
      onValidationError?.(errors);
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      if (onSave) {
        await onSave();
      }

      setSaveStatus('saved');
      setLastSavedAt(new Date().toISOString());
      setHasUnsavedChanges(false);
      clearDraft();
    } catch (error) {
      setSaveStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSaveError(errorMessage);

      // 競合エラーの検出（409 Conflict）
      // 実際のAPI呼び出しで競合が検出された場合はここで処理
    }
  }, [enabled, validate, onSave, onValidationError, clearDraft]);

  /**
   * 変更をマーク
   */
  const markAsChanged = useCallback(() => {
    setHasUnsavedChanges(true);
    saveDraft();

    // 自動保存が有効な場合、デバウンスタイマーをセット
    if (autoSaveEnabled && enabled) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        // 自動保存実行
        performSave();
      }, autoSaveDebounceMs);
    }
  }, [autoSaveEnabled, enabled, autoSaveDebounceMs, saveDraft, performSave]);

  /**
   * 手動保存
   */
  const save = useCallback(async () => {
    // 既存のタイムアウトをクリア
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    await performSave();
  }, [performSave]);

  /**
   * 競合エラーを設定
   */
  const setConflictError = useCallback((conflict: boolean, serverTime?: string) => {
    setHasConflict(conflict);
    setServerUpdatedAt(serverTime ?? null);
  }, []);

  /**
   * 競合解決
   */
  const resolveConflict = useCallback(
    async (resolution: ConflictResolution) => {
      if (resolution === 'reload') {
        if (onReload) {
          await onReload();
        }
        setHasConflict(false);
        setServerUpdatedAt(null);
        clearDraft();
      } else if (resolution === 'forceOverwrite') {
        if (onForceSave) {
          await onForceSave();
        }
        setHasConflict(false);
        setServerUpdatedAt(null);
      }
    },
    [onReload, onForceSave, clearDraft]
  );

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveStatus,
    isSaving: saveStatus === 'saving',
    hasUnsavedChanges,
    lastSavedAt,
    validationErrors,
    saveError,
    hasConflict,
    serverUpdatedAt,
    markAsChanged,
    validate,
    checkIntegrity,
    save,
    setConflictError,
    resolveConflict,
    loadDraft,
    clearDraft,
  };
}

export default useQuantityTableSave;
