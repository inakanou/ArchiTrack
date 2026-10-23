/**
 * パスワードリセットのトークンの保存の形（user-authentication 要件37.1）
 *
 * PasswordService（保存とリセット）と検証の経路（auth.routes の verify-reset）が同じ定義を使う。
 * リセットのメールのリンクの組み立てもここに置く（要件37.3）。
 */

import { createHash } from 'crypto';

/**
 * 保存するパスワードリセットのトークンの値（原文の SHA-256 の 16 進）
 *
 * 原文は保存しない。原文はリセットのメールの本文にだけ現れ、検証は提示された原文のハッシュで一意索引を引く（要件37.1）。
 * DB の移行（20261023010000_security_remediation_ipa_20261009_password_reset_token_hash）も同じ値を SQL で計算する。
 */
export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * リセットのメールのリンクを組み立てる
 *
 * トークンは URL のフラグメントに置く。フラグメントはサーバーへ送られず、アクセスログに残らない（要件37.3）。
 * リセット画面はフラグメントから読み、本文で検証する。
 *
 * @param token - リセットのトークンの原文
 * @param frontendUrl - 画面のオリジン
 */
export function buildPasswordResetUrl(token: string, frontendUrl: string): string {
  return `${frontendUrl}/password-reset#token=${token}`;
}
