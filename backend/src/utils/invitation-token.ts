/**
 * 招待トークンの保存の形と招待 URL（user-authentication 要件37.1・37.2）
 *
 * InvitationService（保存・検証・作成と再送信の応答）と EmailService（招待メールの本文）が同じ定義を使う。
 */

import { createHash } from 'crypto';

/**
 * 保存する招待トークンの値（原文の SHA-256 の 16 進）
 *
 * 原文は保存しない。検証は提示された原文のハッシュで一意索引を引く（要件37.1）。
 * DB の移行（20261023000000_security_remediation_ipa_20261009_invitation_token_hash）も同じ値を SQL で計算する。
 */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 招待 URL を組み立てる（招待メールの本文と、作成・再送信の直後の応答で同じ形を使う）
 *
 * @param token - 招待トークンの原文
 * @param frontendUrl - 画面のオリジン（省略時は FRONTEND_URL）
 */
export function buildInvitationUrl(
  token: string,
  frontendUrl: string = process.env.FRONTEND_URL || 'http://localhost:5173'
): string {
  return `${frontendUrl}/register?token=${token}`;
}
