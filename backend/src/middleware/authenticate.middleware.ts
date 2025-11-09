/**
 * @fileoverview JWT認証ミドルウェア
 *
 * Requirements:
 * - 5.4: 保護されたAPIエンドポイントにアクセスする際、有効なアクセストークンを検証
 * - 5.5: アクセストークンが改ざんされている場合、リクエストを拒否
 * - 16.1: Authorizationヘッダーからトークンを抽出
 * - 16.2: EdDSA署名を検証
 * - 16.18: req.userにユーザー情報を設定
 */

import type { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service';

/**
 * JWT認証ミドルウェア
 *
 * Authorizationヘッダーからトークンを抽出し、検証します。
 * 検証成功時、req.userにユーザー情報を設定します。
 *
 * @param req - Expressリクエストオブジェクト
 * @param res - Expressレスポンスオブジェクト
 * @param next - 次のミドルウェアへの関数
 * @param tokenService - TokenServiceインスタンス（テスト用オプション）
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
  tokenService?: TokenService
): Promise<void> {
  try {
    // Authorizationヘッダーからトークンを抽出
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      return;
    }

    // "Bearer {token}" 形式のチェック
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      return;
    }

    const token = parts[1];

    // 空のトークンチェック
    if (!token || token.trim() === '') {
      res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'Authentication token is required',
      });
      return;
    }

    // TokenServiceインスタンスを取得（テスト時は注入されたものを使用）
    const service = tokenService || new TokenService();

    // トークンを検証
    const result = await service.verifyToken(token, 'access');

    // 検証結果をチェック
    if (!result.ok) {
      if (result.error.type === 'TOKEN_EXPIRED') {
        res.status(401).json({
          error: 'TOKEN_EXPIRED',
          message: 'Token has expired',
        });
        return;
      }

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
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
  }
}
