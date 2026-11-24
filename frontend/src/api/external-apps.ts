/**
 * @fileoverview 外部アプリの接続の API クライアント（user-authentication タスク78.1・78.2・78.3）
 *
 * design.md「Requirements 46-51」の ExternalAppRoutes の同意の API（`/oauth/interaction/:uid/...`）と、
 * 本人の接続の一覧・取り消しの API（`/api/v1/external-app-connections`）と、管理者用の全利用者の
 * 接続の一覧・取り消しの API（`/api/v1/admin/external-app-connections`）を呼ぶ。
 * - 申し込みの内容と接続の一覧は画面用のアクセストークンで GET する
 * - 2FA・同意・拒否・取り消しは状態を変えるので、CSRF トークン付きの手段（`apiClient.sendWithCsrf`）で送る
 * - 同意の範囲は利用者の選択だけを送る。戻り先の URL は画面で組み立てず、応答の `redirectTo` を使う
 *
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.5
 * @requirement user-authentication/REQ-47.11
 * @requirement user-authentication/REQ-49.1
 * @requirement user-authentication/REQ-49.4
 * @requirement user-authentication/REQ-49.6
 * @requirement user-authentication/REQ-49.7
 * @requirement user-authentication/REQ-49.8
 */

import { apiClient } from './client';

/** 利用者が選ぶ操作の範囲 */
export type ExternalAppScope = 'read' | 'write';

/** 同意の画面に示す申し込みの内容（design.md の ConsentInteractionView） */
export interface ConsentInteractionView {
  readonly appName: string;
  readonly redirectHost: string;
  readonly account: { readonly displayName: string; readonly email: string };
  /** 申し込みが求める範囲のうち利用者が選べるもの */
  readonly requestedScopes: readonly string[];
  /** 最後に使われてから接続が切れるまでの日数 */
  readonly idleDays: number;
  /** 同意から接続が切れるまでの日数（利用で延長されない） */
  readonly absoluteDays: number;
  /** この申し込みについて 2FA を通過済みか */
  readonly secondFactorVerified: boolean;
}

/** 同意のための 2FA のコード（design.md の SecondFactorCode） */
export type ConsentSecondFactorCode =
  | { readonly type: 'totp'; readonly code: string }
  | { readonly type: 'backup'; readonly code: string };

/** 同意・拒否の応答（認可サーバーの再開の URL） */
export interface ConsentRedirect {
  readonly redirectTo: string;
}

/** 認可サーバーの申し込みの ID の形（backend の `INTERACTION_UID_PATTERN` と同じ。nanoid の 43 文字） */
const INTERACTION_UID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * 申し込みの ID の形が正しいか（API を呼ぶ前に確かめる）
 */
export function isValidInteractionUid(uid: unknown): uid is string {
  return typeof uid === 'string' && INTERACTION_UID_PATTERN.test(uid);
}

function interactionPath(uid: string, action: string): string {
  if (!isValidInteractionUid(uid)) {
    throw new Error('Invalid interaction uid');
  }
  return `/oauth/interaction/${uid}/${action}`;
}

/**
 * 応答の再開の URL を検証する。http(s) の絶対 URL だけを受け、組み立て直さずにそのまま返す
 */
function toConsentRedirect(body: unknown): ConsentRedirect {
  const redirectTo =
    body !== null && typeof body === 'object' && 'redirectTo' in body
      ? (body as { redirectTo: unknown }).redirectTo
      : undefined;
  if (typeof redirectTo !== 'string') {
    throw new Error('Invalid consent response');
  }
  let protocol: string;
  try {
    protocol = new URL(redirectTo).protocol;
  } catch {
    throw new Error('Invalid consent response');
  }
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error('Invalid consent response');
  }
  return { redirectTo };
}

/**
 * 申し込みの内容を取得する
 */
export function getConsentInteraction(uid: string): Promise<ConsentInteractionView> {
  return apiClient.get<ConsentInteractionView>(interactionPath(uid, 'details'));
}

/**
 * 同意のための 2FA を検証する（成功は 204）
 */
export async function verifyConsentSecondFactor(
  uid: string,
  code: ConsentSecondFactorCode
): Promise<void> {
  await apiClient.sendWithCsrf<unknown>('POST', interactionPath(uid, 'second-factor'), code);
}

/**
 * 選んだ範囲で同意する
 */
export async function approveConsent(
  uid: string,
  scopes: readonly ExternalAppScope[]
): Promise<ConsentRedirect> {
  const body = await apiClient.sendWithCsrf<unknown>('POST', interactionPath(uid, 'approve'), {
    scopes,
  });
  return toConsentRedirect(body);
}

/**
 * 接続を拒否する
 */
export async function denyConsent(uid: string): Promise<ConsentRedirect> {
  const body = await apiClient.sendWithCsrf<unknown>('POST', interactionPath(uid, 'deny'));
  return toConsentRedirect(body);
}

// ============================================================================
// 本人の接続の一覧と取り消し（タスク78.2。要件49.1〜49.4）
// ============================================================================

/** 本人の接続の API の経路（design.md の ExternalAppRoutes） */
const OWN_CONNECTIONS_PATH = '/api/v1/external-app-connections';

/**
 * 本人の接続の一行（backend の ExternalAppConnectionView と同じ形）
 *
 * Grant の ID とトークンは API が返さない。`id` は取り消しの要求にだけ使い、画面に表示しない
 */
export interface ExternalAppConnection {
  readonly id: string;
  /** アプリの名称（許可の一覧から外れたアプリは client ID） */
  readonly appName: string;
  readonly scopes: readonly ExternalAppScope[];
  /** 同意の日時（ISO 8601） */
  readonly consentedAt: string;
  /** 最後に使われた日時（未使用なら null） */
  readonly lastUsedAt: string | null;
  /** 実際に使えなくなる日時（同意から 90 日と、最後の利用（未使用なら同意）から 30 日の早い方） */
  readonly expiresAt: string;
}

/**
 * 本人の接続の一覧を取得する（同意の新しい順。ページの切り替えは無い）
 */
export async function listOwnExternalAppConnections(): Promise<readonly ExternalAppConnection[]> {
  const body = await apiClient.get<{ data: readonly ExternalAppConnection[] }>(
    OWN_CONNECTIONS_PATH
  );
  return body.data;
}

/**
 * 本人の接続を取り消す（成功は 204。終了済み・存在しない接続は 404）
 *
 * 状態を変えるので CSRF トークン付きの手段（`apiClient.sendWithCsrf`）で送る
 */
export async function revokeOwnExternalAppConnection(connectionId: string): Promise<void> {
  await apiClient.sendWithCsrf<unknown>(
    'DELETE',
    `${OWN_CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}`
  );
}

// ============================================================================
// 全利用者の接続の一覧と取り消し（タスク78.3。要件49.6〜49.8）
// ============================================================================

/** 管理者用の接続の API の経路（design.md の ExternalAppRoutes。ロール admin でなければ 403） */
const ADMIN_CONNECTIONS_PATH = '/api/v1/admin/external-app-connections';

/** 全利用者の一覧の 1 行（本人用の形に、アプリの client ID と利用者を足したもの） */
export interface AdminExternalAppConnection extends ExternalAppConnection {
  /** アプリの client ID（絞り込みに使う完全一致の値） */
  readonly clientId: string;
  readonly user: {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
  };
}

/** 全利用者の一覧のページ情報 */
export interface AdminExternalAppConnectionPagination {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface AdminExternalAppConnectionPage {
  readonly data: readonly AdminExternalAppConnection[];
  readonly pagination: AdminExternalAppConnectionPagination;
}

/** 全利用者の一覧の条件。未指定の絞り込みは送らない（値の検証は画面が送る前に行う） */
export interface AdminExternalAppConnectionQuery {
  readonly page: number;
  readonly limit: number;
  /** 利用者の ID（UUID。完全一致） */
  readonly userId?: string;
  /** アプリの client ID（完全一致） */
  readonly clientId?: string;
}

/**
 * 全利用者の接続の一覧を取得する（同意の新しい順）
 */
export function listAdminExternalAppConnections(
  query: AdminExternalAppConnectionQuery
): Promise<AdminExternalAppConnectionPage> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  if (query.userId !== undefined) {
    params.set('userId', query.userId);
  }
  if (query.clientId !== undefined) {
    params.set('clientId', query.clientId);
  }
  return apiClient.get<AdminExternalAppConnectionPage>(
    `${ADMIN_CONNECTIONS_PATH}?${params.toString()}`
  );
}

/**
 * 管理者として接続を取り消す（成功は 204。終了済み・存在しない接続は 404）
 *
 * 状態を変えるので CSRF トークン付きの手段（`apiClient.sendWithCsrf`）で送る
 */
export async function revokeExternalAppConnectionByAdmin(connectionId: string): Promise<void> {
  await apiClient.sendWithCsrf<unknown>(
    'DELETE',
    `${ADMIN_CONNECTIONS_PATH}/${encodeURIComponent(connectionId)}`
  );
}
