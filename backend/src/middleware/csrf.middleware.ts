import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * CSRF Protection Middleware
 * Double Submit Cookie Patternを使用してCSRF攻撃を防ぐ
 *
 * 仕組み:
 * 1. クライアントがGET /csrf-tokenでトークンを取得
 * 2. サーバーはトークンをCookieとレスポンスボディの両方で返す
 * 3. クライアントは状態変更リクエスト時にX-CSRF-Tokenヘッダーでトークンを送信
 * 4. サーバーはCookieとヘッダーのトークンが一致するか検証
 *
 * 参考: OWASP CSRF Prevention Cheat Sheet
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe methodsはCSRF保護不要（OWASP推奨）
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // テスト環境ではスキップ
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  // トークンが存在しない場合
  if (!cookieToken || !headerToken) {
    req.log.warn('CSRF token missing');
    res.status(403).json({
      error: 'CSRF token missing',
    });
    return;
  }

  // トークンが一致しない場合
  if (cookieToken !== headerToken) {
    req.log.warn('CSRF token validation failed');
    res.status(403).json({
      error: 'Invalid CSRF token',
    });
    return;
  }

  // 検証成功
  next();
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
