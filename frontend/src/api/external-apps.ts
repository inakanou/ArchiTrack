/**
 * @fileoverview 外部アプリの接続の同意の API クライアント（user-authentication タスク78.1）
 *
 * design.md「Requirements 46-51」の ExternalAppRoutes の同意の API（`/oauth/interaction/:uid/...`）を呼ぶ。
 * - 申し込みの内容は画面用のアクセストークンで GET する
 * - 2FA・同意・拒否は状態を変えるので、CSRF トークン付きの手段（`apiClient.sendWithCsrf`）で送る
 * - 同意の範囲は利用者の選択だけを送る。戻り先の URL は画面で組み立てず、応答の `redirectTo` を使う
 *
 * @requirement user-authentication/REQ-47.4
 * @requirement user-authentication/REQ-47.5
 * @requirement user-authentication/REQ-47.11
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
