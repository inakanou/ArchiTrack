/**
 * @fileoverview JWT認証ミドルウェア
 *
 * Requirements:
 * - 5.4: 保護されたAPIエンドポイントにアクセスする際、有効なアクセストークンを検証
 * - 5.5: アクセストークンが改ざんされている場合、リクエストを拒否
 * - 16.1: Authorizationヘッダーからトークンを抽出
 * - 16.2: EdDSA署名を検証
 * - 16.18: 401レスポンスにWWW-Authenticateヘッダーを含める, req.userにユーザー情報を設定
 */

import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.js';
import tokenServiceInstance from '../services/token.service.js';

/**
 * WWW-Authenticateヘッダー値を生成
 * 要件16.18: Bearer realm="ArchiTrack", error="..." 形式
 */
function getWwwAuthenticateHeader(
  error: 'missing_token' | 'invalid_token' | 'expired_token'
): string {
  return `Bearer realm="ArchiTrack", error="${error}"`;
}

/**
 * JWT認証ミドルウェアファクトリー
 *
 * TokenServiceを注入可能な認証ミドルウェアを生成します。
 * テスト時にモックのTokenServiceを使用する場合に便利です。
 *
 * @param tokenService - TokenServiceインスタンス（オプション、デフォルトはシングルトン）
 * @returns Express ミドルウェア関数
 */
export function createAuthMiddleware(tokenService?: TokenService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Authorizationヘッダーからトークンを抽出
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('missing_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      // "Bearer {token}" 形式のチェック
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      const token = parts[1];

      // 空のトークンチェック
      if (!token || token.trim() === '') {
        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('missing_token'));
        res.status(401).json({
          error: 'MISSING_TOKEN',
          message: 'Authentication token is required',
        });
        return;
      }

      // TokenServiceインスタンスを取得（テスト時は注入されたものを使用、デフォルトはシングルトン）
      const service = tokenService || tokenServiceInstance;

      // トークンを検証
      const result = await service.verifyToken(token, 'access');

      // 検証結果をチェック
      if (!result.ok) {
        if (result.error.type === 'TOKEN_EXPIRED') {
          res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('expired_token'));
          res.status(401).json({
            error: 'TOKEN_EXPIRED',
            message: 'Token has expired',
          });
          return;
        }

        res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
        res.status(401).json({
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
        });
        return;
      }

      // req.userにユーザー情報を設定
      req.user = {
        userId: result.value.userId,
        email: result.value.email,
        roles: result.value.roles,
      };

      // 次のミドルウェアへ
      next();
    } catch {
      // 予期しないエラーをハンドリング
      res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader('invalid_token'));
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      });
    }
  };
}

/**
 * デフォルトの認証ミドルウェア
 *
 * シングルトンのTokenServiceを使用する標準的な認証ミドルウェアです。
 */
export const authenticate = createAuthMiddleware();
