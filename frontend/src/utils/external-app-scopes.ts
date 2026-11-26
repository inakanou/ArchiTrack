/**
 * @fileoverview 外部アプリの接続の操作の範囲の表示（user-authentication タスク78.2・78.3）
 *
 * 連携中のアプリの画面（ConnectedAppsPage）と接続の管理画面（AdminExternalAppConnectionsPage）で同じ
 * 言い回しを使う。未知の値は表示しない。
 *
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.6
 */

import type { ExternalAppScope } from '../api/external-apps';

const SCOPE_LABELS: Record<ExternalAppScope, string> = {
  read: '読み取り',
  write: '書き込み',
};

/**
 * 操作の範囲を読める日本語にする（「読み取り、書き込み」の形。未知の値は出さない）
 */
export function formatExternalAppScopes(scopes: readonly string[]): string {
  return scopes
    .filter((scope): scope is ExternalAppScope =>
      Object.prototype.hasOwnProperty.call(SCOPE_LABELS, scope)
    )
    .map((scope) => SCOPE_LABELS[scope])
    .join('、');
}
