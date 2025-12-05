import { ReactElement } from 'react';

/**
 * 権限管理コンポーネント
 *
 * システムの権限を管理するページ。
 *
 * ## 機能
 * - 権限一覧の表示
 * - 権限の作成、編集、削除
 *
 * ## 要件
 * - REQ-18: 権限管理
 * - REQ-28.39: 権限管理リンククリック → 権限管理画面遷移
 */
export function PermissionManagement(): ReactElement {
  return (
    <div data-testid="permission-management" className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">権限管理</h1>
      <p className="text-gray-600">システムの権限を管理します。</p>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500">権限管理機能は今後実装予定です。</p>
      </div>
    </div>
  );
}
