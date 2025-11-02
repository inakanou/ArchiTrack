import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

/**
 * HTTPS強制リダイレクトミドルウェア
 * 本番環境でHTTPSへのリダイレクトを強制
 *
 * Railwayやその他のプロキシ環境では、x-forwarded-protoヘッダーで
 * 元のプロトコルを判定
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  // 本番環境のみ適用
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // プロキシ経由の場合、x-forwarded-proto ヘッダーをチェック
  const forwardedProto = req.header('x-forwarded-proto');

  // HTTPSでない場合はリダイレクト
  if (forwardedProto && forwardedProto !== 'https') {
    const httpsUrl = `https://${req.header('host')}${req.url}`;

    logger.info(
      {
        from: req.url,
        to: httpsUrl,
        protocol: forwardedProto,
      },
      'Redirecting to HTTPS'
    );

    // 301 Permanent Redirect
    return res.redirect(301, httpsUrl);
  }

  // req.secure をチェック（プロキシなしの場合）
  if (!req.secure && !forwardedProto) {
    const httpsUrl = `https://${req.header('host')}${req.url}`;

    logger.info(
      {
        from: req.url,
        to: httpsUrl,
      },
      'Redirecting to HTTPS (direct connection)'
    );

    return res.redirect(301, httpsUrl);
  }

  next();
}

/**
 * Strict-Transport-Security (HSTS) ヘッダー設定ミドルウェア
 * ブラウザに対してHTTPSの使用を強制
 */
export function hsts(_req: Request, res: Response, next: NextFunction): void {
  // 本番環境のみ適用
  if (process.env.NODE_ENV === 'production') {
    // HSTS ヘッダーを設定
    // max-age=31536000: 1年間HSTSを有効化
    // includeSubDomains: サブドメインにも適用
    // preload: HSTSプリロードリストに登録可能
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}
