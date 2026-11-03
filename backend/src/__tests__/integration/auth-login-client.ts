/**
 * @fileoverview 統合テストで、2FA の検証を含めてログインしトークンを得る補助（タスク47.2）
 *
 * ログイン・2FA 待ちの資格の取得・TOTP の計算・2FA の検証を一つにする。ログインの応答が 2FA の検証を
 * 求めるとき（2FA 登録済みの利用者）は、資格（`challengeToken`）と、DB の暗号化された秘密鍵から本番と同じ
 * `TwoFactorService` で復号して計算したコードで `POST /api/v1/auth/verify-2fa` を通す。求めないとき
 * （未登録の利用者）はログインの応答をそのまま使う。
 *
 * 同じ利用者の 30 秒以内の再ログインは同じコードになり、TOTP の再利用の拒否（要件32.7）に当たる。
 * そこで検証の前に、最後に使った時間ステップ（`twoFactorLastUsedStep`）を戻す（null にする）。
 *
 * ログインそのもの（応答の形・拒否）を検証するテストは、この補助を使わず API を直接呼ぶ。
 *
 * 補助は DB を直接書くので、書いた後に利用者の状態のキャッシュを本番の無効化の部品で消す（タスク47.5）。
 */

import type { Express } from 'express';
import request from 'supertest';
import { authenticator } from 'otplib';
import getPrismaClient from '../../db.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { invalidateUserStateCache } from './test-user-factory.js';

export interface LoginCredentials {
  email: string;
  password: string;
}

function describeFailure(step: string, response: request.Response): Error {
  return new Error(
    `${step}に失敗した（${response.status}）: ${JSON.stringify(response.body).slice(0, 500)}`
  );
}

/**
 * 2FA の検証を含めてログインし、トークンを発行した応答を返す
 *
 * 返す応答は、2FA 未登録ならログインの応答、登録済みなら 2FA の検証の応答である。どちらも本文に
 * `accessToken` を持ち、リフレッシュトークンを Set-Cookie で渡す。
 *
 * @param app - テスト対象のアプリ
 * @param credentials - メールアドレスとパスワード
 */
export async function loginForTokens(
  app: Express,
  credentials: LoginCredentials
): Promise<request.Response> {
  const login = await request(app).post('/api/v1/auth/login').send(credentials);
  if (login.status !== 200) {
    throw describeFailure('ログイン', login);
  }
  if (login.body.requires2FA !== true) {
    return login;
  }

  const prisma = getPrismaClient();
  const user = await prisma.user.update({
    where: { email: credentials.email },
    data: { twoFactorLastUsedStep: null },
    select: { id: true, twoFactorSecret: true },
  });
  await invalidateUserStateCache(user.id);
  if (!user.twoFactorSecret) {
    throw new Error(`2FA の秘密鍵が無い利用者に 2FA の検証が求められた: ${credentials.email}`);
  }
  const secret = await new TwoFactorService().decryptSecret(user.twoFactorSecret);

  const verify = await request(app)
    .post('/api/v1/auth/verify-2fa')
    .send({ challengeToken: login.body.challengeToken, code: authenticator.generate(secret) });
  if (verify.status !== 200) {
    throw describeFailure('2FA の検証', verify);
  }
  return verify;
}

/**
 * 2FA の検証を含めてログインし、アクセストークンを返す
 *
 * @param app - テスト対象のアプリ
 * @param credentials - メールアドレスとパスワード
 */
export async function loginForAccessToken(
  app: Express,
  credentials: LoginCredentials
): Promise<string> {
  const response = await loginForTokens(app, credentials);
  const accessToken = response.body.accessToken as unknown;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw describeFailure('ログインのアクセストークンの取得', response);
  }
  return accessToken;
}
