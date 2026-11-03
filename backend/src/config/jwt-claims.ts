/**
 * トークンの発行者・想定利用者（JWT の iss・aud）の既定値
 *
 * 起動時の環境変数の検証（`config/env.ts`）と、発行・検証（`services/token.service.ts`）が
 * 同じ値を使うよう、ここにまとめる（design.md の TokenService の IssuedClaims）。
 */

/** トークンの発行者（JWT の iss）の既定値（`JWT_ISSUER` が未設定のとき） */
export const DEFAULT_JWT_ISSUER = 'architrack';

/** トークンの想定利用者（JWT の aud）の既定値（`JWT_AUDIENCE` が未設定のとき） */
export const DEFAULT_JWT_AUDIENCE = 'architrack-api';
