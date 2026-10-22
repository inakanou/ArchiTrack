/**
 * @fileoverview 利用者の棚卸し・無効化・再有効化・管理者による 2FA の再設定の API 呼び出し
 *
 * タスク49.6: 棚卸し画面（UserInventoryPage）が使う。経路は backend の user-inventory.routes.ts。
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 管理者による他の利用者の 2FA の再設定（`POST /api/v1/users/:id/2fa/reset`）
 * - REQ-36.10: 棚卸しの一覧（`GET /api/v1/users/inventory`）
 * - REQ-36.11: 状態と最終ログインからの経過日数による絞り込み（`status`・`inactiveDaysAtLeast`）
 */

import { apiClient } from './client';

/** 利用者の状態（有効・無効） */
export type UserInventoryStatus = 'active' | 'inactive';

/** 棚卸しの一覧の 1 行（backend の UserInventoryItem と同じ形） */
export interface UserInventoryItem {
  id: string;
  displayName: string;
  email: string;
  /** ロール名（優先度の高い順） */
  roles: string[];
  status: UserInventoryStatus;
  twoFactorEnabled: boolean;
  /** ログインの実績が無ければ null */
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: { id: string; displayName: string } | null;
}

/** 棚卸しの一覧のページ情報 */
export interface UserInventoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** 棚卸しの一覧の応答 */
export interface UserInventoryResponse {
  data: UserInventoryItem[];
  pagination: UserInventoryPagination;
}

/** 棚卸しの一覧の条件（未指定の条件は送らない） */
export interface UserInventoryQuery {
  status?: UserInventoryStatus;
  /** 最終ログイン（実績が無ければ作成日時）からの経過日数の下限（0〜36500） */
  inactiveDaysAtLeast?: number;
  page?: number;
  limit?: number;
}

/**
 * 棚卸しの一覧を取得する
 *
 * 並び順は API のまま（ログインの実績が無い利用者が先、続いて最終ログインの古い順）。
 */
export async function getUserInventory(
  query: UserInventoryQuery = {}
): Promise<UserInventoryResponse> {
  const params = new URLSearchParams();
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.inactiveDaysAtLeast !== undefined) {
    params.set('inactiveDaysAtLeast', String(query.inactiveDaysAtLeast));
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const search = params.toString();
  return apiClient.get<UserInventoryResponse>(
    `/api/v1/users/inventory${search ? `?${search}` : ''}`
  );
}

/** 利用者を無効化する（理由は前後の空白を除いて 1〜1000 文字） */
export async function deactivateUser(userId: string, reason: string): Promise<void> {
  await apiClient.post<void>(`/api/v1/users/${encodeURIComponent(userId)}/deactivate`, {
    reason,
  });
}

/** 無効化された利用者を再有効化する（理由は前後の空白を除いて 1〜1000 文字） */
export async function reactivateUser(userId: string, reason: string): Promise<void> {
  await apiClient.post<void>(`/api/v1/users/${encodeURIComponent(userId)}/reactivate`, {
    reason,
  });
}

/** 管理者が他の利用者の 2FA を再設定する */
export async function resetUserTwoFactor(userId: string): Promise<void> {
  await apiClient.post<void>(`/api/v1/users/${encodeURIComponent(userId)}/2fa/reset`);
}
