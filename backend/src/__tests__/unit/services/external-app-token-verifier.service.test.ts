/**
 * @fileoverview 外部アプリ用トークンの検証（ExternalAppTokenVerifier）の単体テスト（user-authentication タスク 75.1）
 *
 * 認可サーバーのモデル・DB・接続のサービス・許可の一覧は全て差し替え、判定の順と結果だけを確かめる。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalAppTokenVerifierDeps } from '../../../services/external-app-token-verifier.service.js';
import {
  ExternalAppTokenVerificationError,
  ExternalAppTokenVerifier,
} from '../../../services/external-app-token-verifier.service.js';
import type { ActiveConnection } from '../../../oauth/oauth.types.js';
import type { RequestContext } from '../../../types/auth.types.js';
import { Err, Ok } from '../../../types/result.js';
import logger from '../../../utils/logger.js';

const RESOURCE_URL = 'https://rs.example/mcp';
const NOW = new Date('2026-11-25T00:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const SOURCE: RequestContext = { ipAddress: '203.0.113.9', userAgent: 'unit-agent' };
const BEARER = 'opaque-Token_value-123';

const CONNECTION: ActiveConnection = {
  id: 'conn-1',
  userId: 'user-1',
  clientId: 'claude',
  grantId: 'grant-1',
  scopes: ['read', 'write'],
};

function accessToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'AccessToken',
    exp: NOW_SECONDS + 3600,
    aud: RESOURCE_URL,
    accountId: 'user-1',
    clientId: 'claude',
    grantId: 'grant-1',
    scope: 'read write',
    ...overrides,
  };
}

function eligibleUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isActive: true,
    mustChangePassword: false,
    twoFactorEnabled: true,
    userRoles: [
      {
        role: {
          rolePermissions: [{ permission: { resource: 'external_app', action: 'connect' } }],
        },
      },
    ],
    ...overrides,
  };
}

function withPermissions(...permissions: { resource: string; action: string }[]) {
  return eligibleUser({
    userRoles: [{ role: { rolePermissions: permissions.map((permission) => ({ permission })) } }],
  });
}

describe('ExternalAppTokenVerifier', () => {
  const find = vi.fn();
  const findUnique = vi.fn();
  const assertActive = vi.fn();
  const confirmNotEnded = vi.fn();
  const touch = vi.fn();
  const isAllowed = vi.fn();
  let warn: ReturnType<typeof vi.spyOn>;

  function verifier(): ExternalAppTokenVerifier {
    return new ExternalAppTokenVerifier({
      provider: { AccessToken: { find } },
      prisma: { user: { findUnique } },
      connectionService: { assertActive, confirmNotEnded, touch },
      clientRegistry: { isAllowed },
      resourceUrl: RESOURCE_URL,
    } as unknown as ExternalAppTokenVerifierDeps);
  }

  function verify(token: string = BEARER) {
    return verifier().verify(token, NOW, SOURCE);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    find.mockResolvedValue(accessToken());
    findUnique.mockResolvedValue(eligibleUser());
    assertActive.mockResolvedValue(Ok(CONNECTION));
    confirmNotEnded.mockResolvedValue(true);
    touch.mockResolvedValue(undefined);
    isAllowed.mockReturnValue(true);
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('成功', () => {
    it('全ての条件を満たすと主体を返し、利用を記録する', async () => {
      const result = await verify();

      expect(result).toEqual(
        Ok({
          userId: 'user-1',
          clientId: 'claude',
          connectionId: 'conn-1',
          scopes: ['read', 'write'],
        })
      );
      expect(find).toHaveBeenCalledWith(BEARER);
      expect(isAllowed).toHaveBeenCalledWith('claude');
      expect(assertActive).toHaveBeenCalledWith('grant-1', NOW, SOURCE);
      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }));
      expect(confirmNotEnded).toHaveBeenCalledWith('conn-1');
      expect(touch).toHaveBeenCalledWith('conn-1', NOW);
    });

    it('範囲はトークンと接続の共通部分を read・write の順で返す', async () => {
      find.mockResolvedValue(accessToken({ scope: 'write read offline_access' }));
      assertActive.mockResolvedValue(Ok({ ...CONNECTION, scopes: ['read'] }));

      const result = await verify();

      expect(result).toEqual(Ok(expect.objectContaining({ scopes: ['read'] })));
    });

    it('想定利用者が配列で 1 件だけ一致するなら受け付ける', async () => {
      find.mockResolvedValue(accessToken({ aud: [RESOURCE_URL] }));

      expect((await verify()).ok).toBe(true);
    });

    it.each([
      ['*:*', { resource: '*', action: '*' }],
      ['external_app:*', { resource: 'external_app', action: '*' }],
      ['*:connect', { resource: '*', action: 'connect' }],
    ])('権限のワイルドカード %s でも接続の権限を持つと判定する', async (_label, permission) => {
      findUnique.mockResolvedValue(
        withPermissions({ resource: 'project', action: 'read' }, permission)
      );

      expect((await verify()).ok).toBe(true);
    });

    it('利用の記録に失敗しても主体を返し、例外の文を記録しない', async () => {
      const failure = Object.assign(new Error('touch failed with token opaque-Token_value-123'), {
        code: 'P1001',
      });
      touch.mockRejectedValue(failure);

      const result = await verify();

      expect(result.ok).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        { errorName: 'Error', errorCode: 'P1001', connectionId: 'conn-1' },
        'Failed to record external app connection use'
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(BEARER);
    });

    it('利用の記録の失敗が Error でなく、コードが Prisma の形でなければ名前とコードを伏せる', async () => {
      touch.mockRejectedValue({ code: 'not-prisma' });

      const result = await verify();

      expect(result.ok).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        { errorName: 'unknown', errorCode: undefined, connectionId: 'conn-1' },
        'Failed to record external app connection use'
      );
    });
  });

  describe('トークンの形', () => {
    it.each([
      ['空文字', ''],
      ['base64url 以外の文字', 'abc.def'],
      ['空白を含む', 'abc def'],
      ['513 文字', 'a'.repeat(513)],
    ])('%s のトークンは DB を引かずに INVALID_TOKEN', async (_label, token) => {
      expect(await verify(token)).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(find).not.toHaveBeenCalled();
    });

    it('文字列でない値は INVALID_TOKEN', async () => {
      const result = await verifier().verify(undefined as unknown as string, NOW, SOURCE);

      expect(result).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(find).not.toHaveBeenCalled();
    });

    it('512 文字までは認可サーバーのモデルで読む', async () => {
      const token = 'a'.repeat(512);

      await verify(token);

      expect(find).toHaveBeenCalledWith(token);
    });
  });

  describe('トークンの内容', () => {
    it.each([
      ['見つからない', undefined],
      ['種別がアクセストークンでない', accessToken({ kind: 'RefreshToken' })],
      ['期限が数値でない', accessToken({ exp: undefined })],
      ['判定の時刻で期限切れ', accessToken({ exp: NOW_SECONDS })],
      ['DPoP の制約が付いている', accessToken({ jkt: 'thumbprint' })],
      ['mTLS の制約が付いている', accessToken({ 'x5t#S256': 'thumbprint' })],
      ['想定利用者が無い', accessToken({ aud: undefined })],
      ['想定利用者が別の URL', accessToken({ aud: 'https://rs.example/other' })],
      ['想定利用者が前方一致だけ', accessToken({ aud: `${RESOURCE_URL}/extra` })],
      ['想定利用者が複数', accessToken({ aud: [RESOURCE_URL, 'https://other.example'] })],
      ['想定利用者が空の配列', accessToken({ aud: [] })],
      ['利用者が空', accessToken({ accountId: '' })],
      ['利用者が文字列でない', accessToken({ accountId: 1 })],
      ['アプリが無い', accessToken({ clientId: undefined })],
      ['Grant が無い', accessToken({ grantId: '' })],
      ['範囲が文字列でない', accessToken({ scope: ['read'] })],
    ])('%s なら INVALID_TOKEN で、接続を判定しない', async (_label, token) => {
      find.mockResolvedValue(token);

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(assertActive).not.toHaveBeenCalled();
      expect(touch).not.toHaveBeenCalled();
    });

    it('期限が判定の時刻の 1 秒後なら受け付ける', async () => {
      find.mockResolvedValue(accessToken({ exp: NOW_SECONDS + 1 }));

      expect((await verify()).ok).toBe(true);
    });

    it('許可の一覧に無いアプリは INVALID_TOKEN', async () => {
      isAllowed.mockReturnValue(false);

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(isAllowed).toHaveBeenCalledWith('claude');
      expect(assertActive).not.toHaveBeenCalled();
    });
  });

  describe('接続', () => {
    it('接続が有効でなければ INVALID_TOKEN で、利用者を読まない', async () => {
      assertActive.mockResolvedValue(Err('NOT_ACTIVE'));

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(assertActive).toHaveBeenCalledWith('grant-1', NOW, SOURCE);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['利用者', { userId: 'user-2' }],
      ['アプリ', { clientId: 'other-app' }],
    ])('接続の%sがトークンと異なれば INVALID_TOKEN', async (_label, override) => {
      assertActive.mockResolvedValue(Ok({ ...CONNECTION, ...override }));

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('共通部分に read が無ければ INVALID_TOKEN', async () => {
      find.mockResolvedValue(accessToken({ scope: 'write' }));

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('トークンに read があっても接続の範囲に無ければ INVALID_TOKEN', async () => {
      assertActive.mockResolvedValue(Ok({ ...CONNECTION, scopes: ['write'] }));

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
    });

    it('終了が進行中で、待った後に接続が残っていなければ INVALID_TOKEN で利用を記録しない', async () => {
      confirmNotEnded.mockResolvedValue(false);

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(confirmNotEnded).toHaveBeenCalledWith('conn-1');
      expect(touch).not.toHaveBeenCalled();
    });
  });

  describe('利用者', () => {
    it.each([
      ['存在しない', null],
      ['無効', eligibleUser({ isActive: false })],
      ['初回のパスワード変更が未了', eligibleUser({ mustChangePassword: true })],
      ['2FA が未登録', eligibleUser({ twoFactorEnabled: false })],
      ['ロールが無い', eligibleUser({ userRoles: [] })],
      ['接続の権限が無い', withPermissions({ resource: 'external_app', action: 'read' })],
      ['別の資源の全権限だけ', withPermissions({ resource: 'project', action: '*' })],
    ])('利用者が%sなら INVALID_TOKEN で、接続の終了を待たない', async (_label, user) => {
      findUnique.mockResolvedValue(user);

      expect(await verify()).toEqual(Err({ kind: 'INVALID_TOKEN' }));
      expect(confirmNotEnded).not.toHaveBeenCalled();
      expect(touch).not.toHaveBeenCalled();
    });
  });

  describe('基盤の失敗', () => {
    it.each([
      ['find_token', () => find],
      ['assert_active', () => assertActive],
      ['load_user', () => findUnique],
      ['confirm_connection', () => confirmNotEnded],
    ])(
      '%s の失敗は 401 にせず ExternalAppTokenVerificationError を投げ、元の文を含めない',
      async (operation, target) => {
        target().mockRejectedValue(
          Object.assign(new Error(`lock timeout for ${BEARER}`), { code: 'P2034' })
        );

        const error = await verify().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ExternalAppTokenVerificationError);
        const verification = error as ExternalAppTokenVerificationError;
        expect(verification.name).toBe('ExternalAppTokenVerificationError');
        expect(verification.code).toBe('P2034');
        expect(verification.message).toBe(
          `外部アプリ用トークンの検証を完了できませんでした（${operation}）`
        );
        expect(verification.message).not.toContain(BEARER);
        expect(verification.cause).toBeUndefined();
        expect(touch).not.toHaveBeenCalled();
      }
    );

    it.each([
      ['Prisma の形でないコード', { code: 'ECONNRESET' }],
      ['数値のコード', { code: 1001 }],
      ['null', null],
    ])('%s の失敗はコードを引き継がない', async (_label, failure) => {
      find.mockRejectedValue(failure);

      const error = await verify().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ExternalAppTokenVerificationError);
      expect((error as ExternalAppTokenVerificationError).code).toBeUndefined();
    });
  });
});
