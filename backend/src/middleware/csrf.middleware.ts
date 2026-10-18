import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * CSRF Protection Middleware
 * Double Submit Cookie Patternを使用してCSRF攻撃を防ぐ
 *
 * 仕組み:
 * 1. クライアントがGET /csrf-tokenでトークンを取得
 * 2. サーバーはトークンをCookieとレスポンスボディの両方で返す
 * 3. クライアントは状態変更リクエスト時にX-CSRF-Tokenヘッダーでトークンを送信
 * 4. サーバーはCookieとヘッダーのトークンが一致するか定数時間で検証
 * 5. あわせて Origin（無ければ Referer）のオリジンが FRONTEND_URL と一致するかを検証
 *
 * 対象は Cookie で認証情報を受け付ける状態変更の要求（リフレッシュ・ログアウト）。
 * Bearer で認証する API はブラウザが自動で付けないため対象外とする。
 *
 * 参考: OWASP CSRF Prevention Cheat Sheet
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methodsはCSRF保護不要（OWASP推奨）
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  // トークンが存在しない場合
  if (
    typeof cookieToken !== 'string' ||
    !cookieToken ||
    typeof headerToken !== 'string' ||
    !headerToken
  ) {
    (req.log ?? logger).warn('CSRF token missing');
    res.status(403).json({
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING',
    });
    return;
  }

  // トークンが一致しない場合
  if (!constantTimeEquals(cookieToken, headerToken)) {
    (req.log ?? logger).warn('CSRF token validation failed');
    res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_TOKEN_INVALID',
    });
    return;
  }

  // 送信元のオリジンが画面のオリジンと一致しない場合
  if (!isAllowedOrigin(req)) {
    (req.log ?? logger).warn('CSRF origin validation failed');
    res.status(403).json({
      error: 'Invalid request origin',
      code: 'CSRF_ORIGIN_MISMATCH',
    });
    return;
  }

  // 検証成功
  next();
}

/**
 * 二つの文字列を定数時間で比較する（長さが異なるときは不一致）
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * 文字列の URL からオリジンを得る（解釈できないときは null）
 */
function originOf(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    // 不透明なオリジン（"null"）は照合に使わない
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Origin（無ければ Referer）のオリジンが FRONTEND_URL のオリジンと一致するかを返す
 */
function isAllowedOrigin(req: Request): boolean {
  const allowedOrigin = originOf(getEnv().FRONTEND_URL);
  if (!allowedOrigin) {
    return false;
  }

  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader !== '') {
    return originOf(originHeader) === allowedOrigin;
  }

  const refererHeader = req.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader !== '') {
    return originOf(refererHeader) === allowedOrigin;
  }

  return false;
}

/**
 * CSRFトークン生成関数
 * 暗号学的に安全な32バイトのランダムトークンを生成
 *
 * @returns hex文字列（64文字）
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
