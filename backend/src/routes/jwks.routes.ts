// backend/src/routes/jwks.routes.ts
import { Router } from 'express';
import * as jose from 'jose';
import crypto from 'crypto';

const router = Router();

/**
 * 公開鍵配布の応答のキャッシュ有効期間（秒）
 *
 * 要件31.5（有効期間300秒）・要件31.6（鍵の入れ替えの猶予期間より十分に短い値）に対応する。
 *
 * 値の根拠:
 * - 鍵の入れ替えの猶予期間（`JWT_PUBLIC_KEY_OLD` が設定されている期間。設計上は T日目〜T+30日目）より
 *   十分に短いこと。検証者のキャッシュが旧い鍵集合を保持し続けても、猶予期間内に必ず取り直される
 * - アクセストークンの既定有効期限15分（`ACCESS_TOKEN_EXPIRY` の既定 '15m'）より短い値を選んでいる。
 *   新しい鍵で署名されたトークンの有効期間中に、検証者が新しい鍵を取得できる
 *
 * 検証側はこの定数を参照できるが、期待値は具体値（300）で書くこと。
 */
export const JWKS_CACHE_MAX_AGE_SECONDS = 300;

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

    // 要件31.4: 公開鍵配布の応答に Cache-Control を設定する。
    // 公開鍵は秘匿情報を含まないため、共有キャッシュ（CDN等）での保持も許す public とする
    res.set('Cache-Control', `public, max-age=${JWKS_CACHE_MAX_AGE_SECONDS}`);

    // JWKS形式でレスポンス
    res.json({ keys });
  } catch (error) {
    console.error('JWKS endpoint error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
