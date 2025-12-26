/**
 * RestoreAnnotationDialog - 未保存データ復元確認ダイアログ
 *
 * ページリロード時にlocalStorageに未保存の注釈データがある場合に表示される。
 * ユーザーはローカルデータの復元、破棄、または後で決定を選択できる。
 *
 * @see tasks.md - Task 18.3
 * @see requirements.md - Requirement 13.5
 * @see design.md - AutoSaveManager State Management
 */

import React, { useId } from 'react';

/**
 * RestoreAnnotationDialogのProps
 */
export interface RestoreAnnotationDialogProps {
  /** ダイアログを表示するか */
  isOpen: boolean;
  /** ローカル保存時刻（フォーマット済み） */
  localSavedAt: string | null;
  /** サーバー更新時刻（フォーマット済み） */
  serverUpdatedAt: string | null;
  /** ローカルデータがサーバーデータより新しいか */
  isLocalNewer: boolean;
  /** サーバー側で競合が発生しているか */
  hasServerConflict: boolean;
  /** ローカル注釈オブジェクト数 */
  localObjectCount: number;
  /** サーバー注釈オブジェクト数 */
  serverObjectCount: number;
  /** 復元時のコールバック */
  onRestore: () => void;
  /** 破棄時のコールバック */
  onDiscard: () => void;
  /** ダイアログを閉じる（後で決定）時のコールバック */
  onDismiss: () => void;
}

/**
 * 未保存データ復元確認ダイアログコンポーネント
 *
 * Features:
 * - ローカルデータとサーバーデータの比較表示
 * - 競合警告の表示
 * - 復元/破棄/後でのアクション選択
 * - アクセシビリティ対応（ARIA属性、フォーカス管理）
 */
export const RestoreAnnotationDialog: React.FC<RestoreAnnotationDialogProps> = ({
  isOpen,
  localSavedAt,
  serverUpdatedAt,
  isLocalNewer,
  hasServerConflict,
  localObjectCount,
  serverObjectCount,
  onRestore,
  onDiscard,
  onDismiss,
}) => {
  const titleId = useId();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Dialog Content */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Title */}
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 mb-4">
          未保存のデータがあります
        </h2>

        {/* Conflict Warning */}
        {hasServerConflict && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">注意: </span>
              サーバー側のデータが更新されています。復元すると上書きされます。
            </p>
          </div>
        )}

        {/* Data Comparison */}
        <div className="space-y-4 mb-6">
          {/* Local Data Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              ローカルデータ
              {isLocalNewer && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  ローカルの方が新しい
                </span>
              )}
            </h3>
            <div className="text-sm text-blue-700 space-y-1">
              <p>保存時刻: {localSavedAt || '不明'}</p>
              <p>注釈数: {localObjectCount}個</p>
            </div>
          </div>

          {/* Server Data Info */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              サーバーデータ
              {!isLocalNewer && serverUpdatedAt && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded">
                  サーバーの方が新しい
                </span>
              )}
            </h3>
            <div className="text-sm text-gray-700 space-y-1">
              <p>更新時刻: {serverUpdatedAt || '新規（データなし）'}</p>
              <p>注釈数: {serverObjectCount}個</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onRestore}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            復元する
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            破棄する
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            後で決める
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreAnnotationDialog;
