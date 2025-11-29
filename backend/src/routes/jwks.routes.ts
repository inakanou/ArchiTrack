// backend/src/routes/jwks.routes.ts
import { Router } from 'express';
import * as jose from 'jose';
import crypto from 'crypto';

const router = Router();

/**
 * JWKにRFC 7517準拠の必須フィールドを追加
 * @param jwk - 元のJWK
 * @param keyIdentifier - キー識別子（オプション）
 * @returns RFC 7517準拠のJWK
 */
function ensureRfc7517Compliance(jwk: jose.JWK, keyIdentifier?: string): jose.JWK {
  const compliantJwk: jose.JWK = { ...jwk };

  // RFC 7517 Section 4.4: alg (Algorithm) - EdDSAを使用
  if (!compliantJwk.alg) {
    compliantJwk.alg = 'EdDSA';
  }

  // RFC 7517 Section 4.2: use (Public Key Use) - 署名用
  if (!compliantJwk.use) {
    compliantJwk.use = 'sig';
  }

  // RFC 7517 Section 4.5: kid (Key ID) - 鍵識別子
  if (!compliantJwk.kid) {
    // kidが設定されていない場合、公開鍵からハッシュを生成
    if (keyIdentifier) {
      compliantJwk.kid = keyIdentifier;
    } else if (compliantJwk.x) {
      // EdDSAの公開鍵座標からkidを生成
      const hash = crypto.createHash('sha256').update(compliantJwk.x).digest('base64url');
      compliantJwk.kid = hash.substring(0, 16);
    }
  }

  return compliantJwk;
}

/**
 * JWKS (JSON Web Key Set) エンドポイント
 * 公開鍵をJWKS形式で配布（RFC 7517準拠）
 */
router.get('/jwks.json', async (_req, res) => {
  try {
    const keys: jose.JWK[] = [];

    // 現在の公開鍵（環境変数から取得）
    const currentPublicKeyBase64 = process.env.JWT_PUBLIC_KEY;
    if (currentPublicKeyBase64) {
      const rawJWK = JSON.parse(Buffer.from(currentPublicKeyBase64, 'base64').toString('utf-8'));
      const currentJWK = ensureRfc7517Compliance(rawJWK, 'current');
      keys.push(currentJWK);
    }

    // 旧公開鍵（猶予期間中のみ、環境変数JWT_PUBLIC_KEY_OLDから取得）
    const oldPublicKeyBase64 = process.env.JWT_PUBLIC_KEY_OLD;
    if (oldPublicKeyBase64) {
      const rawJWK = JSON.parse(Buffer.from(oldPublicKeyBase64, 'base64').toString('utf-8'));
      const oldJWK = ensureRfc7517Compliance(rawJWK, 'old');
      keys.push(oldJWK);
    }

    // JWKS形式でレスポンス
    res.json({ keys });
  } catch (error) {
    console.error('JWKS endpoint error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
