/**
 * @fileoverview 利用者の状態のキャッシュと、E2E の初期化の補助の無効化の E2E テスト
 *
 * user-authentication タスク47.5。backend は利用者の状態（2FA の登録・初回のパスワード変更の要否・有効）を
 * Redis の鍵 `auth:user-state:<userId>` に TTL 60 秒でキャッシュし、`GET /api/v1/auth/me` はそれを経由して
 * 状態を返す。E2E の補助は DB を直接書くため、backend と同じ論理 DB の同じ鍵に、backend の無効化と同じ
 * 「消して世代を進める」処理を行う。
 *
 * 専用の利用者の状態を一度読ませてキャッシュに載せた後に初期化の補助で戻し、直後の `/me` の応答の状態が
 * 戻した値であることを確かめる。キャッシュの鍵が backend の定数の名前で実在することも観測し、E2E の補助と
 * backend の鍵の一致を確かめる。
 *
 * 47.6 で認証ミドルウェアが状態で要求を拒否するようになったため、初回の変更を要する状態は `/me` の
 * 403（`PASSWORD_CHANGE_REQUIRED`）として観測する（拒否の判定も同じキャッシュを経由する）。
 *
 * 受入基準の被覆の印は掲げない（キャッシュと初期化の補助の検証。拒否の受入基準の印は
 * user-state-restriction.spec.ts で掲げる）。
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from '../../config';
import { getPrismaClient } from '../../fixtures/database';
import { resetDedicatedUser } from '../../fixtures/auth.fixtures';
import { loginViaApi } from '../../helpers/auth-api';
import { readUserStateCacheEntry } from '../../helpers/user-state-cache';

/** 開いた要求のコンテキスト（テストの終わりに閉じる） */
const openedRequestContexts: APIRequestContext[] = [];

async function newRequestContext(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext();
  openedRequestContexts.push(context);
  return context;
}

/** `GET /api/v1/auth/me` の応答の状態コードと、本文の状態の項目・エラーコード */
async function readMeState(
  api: APIRequestContext,
  accessToken: string
): Promise<{
  status: number;
  twoFactorEnabled: unknown;
  mustChangePassword: unknown;
  code: unknown;
}> {
  const response = await api.get(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status(),
    twoFactorEnabled: body.twoFactorEnabled,
    mustChangePassword: body.mustChangePassword,
    code: body.code,
  };
}

test.describe('利用者の状態のキャッシュと初期化の補助', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    while (openedRequestContexts.length > 0) {
      await openedRequestContexts.pop()?.dispose();
    }
  });

  test('状態をキャッシュに載せた後に初期化の補助で戻すと、直後の /me が戻した状態を返す', async () => {
    const user = await resetDedicatedUser('STATE_CHANGE_USER');
    const api = await newRequestContext();
    const { accessToken } = await loginViaApi(api, user);

    // 既定から外れた状態（初回の変更を要する）を DB へ直接書き、/me で一度読ませてキャッシュに載せる
    // （状態の照合が初回の変更を要する状態を読み、/me を 403 で拒否する）
    await getPrismaClient().user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    expect(await readMeState(api, accessToken)).toEqual({
      status: 403,
      twoFactorEnabled: undefined,
      mustChangePassword: undefined,
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
    // backend は E2E の補助が使う鍵（backend の定数）に状態を載せている
    expect(await readUserStateCacheEntry(user.id)).toEqual({
      isActive: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      // アクセストークンの世代（要件34.7、タスク47.11）。専用の利用者は 2FA の再設定の検証で進みうる
      accessTokenGeneration: expect.any(Number),
    });

    const reset = await resetDedicatedUser('STATE_CHANGE_USER');
    expect(reset.id).toBe(user.id);

    // 初期化の補助の無効化で、キャッシュの TTL（60 秒）を待たずに戻した状態が返る
    expect(await readMeState(api, accessToken)).toEqual({
      status: 200,
      twoFactorEnabled: true,
      mustChangePassword: false,
      code: undefined,
    });
    // 戻した状態がキャッシュに載り直している（古い値ではない）
    expect(await readUserStateCacheEntry(user.id)).toEqual({
      isActive: true,
      twoFactorEnabled: true,
      mustChangePassword: false,
      accessTokenGeneration: expect.any(Number),
    });
  });
});
