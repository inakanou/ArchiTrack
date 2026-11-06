/**
 * @fileoverview 2FA の暗号化鍵の入れ替えの後始末（復号できない秘密の再設定）の統合検証
 *
 * Requirements (user-authentication):
 * - REQ-34.7: 2FA の再設定で全リフレッシュトークンを失効させ、アクセストークンの世代を進める
 * - REQ-34.10: 2FA の再設定を監査に記録する
 *
 * モックを使わず、実 PostgreSQL・実 Redis と本物の暗号化（AES-256-GCM）を通す。
 * - 入れ替え前の鍵で暗号化した登録済みの秘密は、未登録へ戻す（秘密・バックアップコード・リフレッシュトークンを消し、
 *   世代を 1 つ進め、実行者の無い監査を記録し、状態のキャッシュを無効化する）
 * - 入れ替え後の鍵で暗号化した秘密は変えない
 * - 入れ替え前の鍵の再登録中の秘密だけを持つ利用者は、再登録中の秘密だけを消す
 * - 2 回目の実行は何も変えない
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { getSharedAuthenticatedUserStateService } from '../../services/authenticated-user-state.service.js';
import { authUserStateCacheKey } from '../../services/authenticated-user-state-cache.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-2fa-undecryptable-reset';
const REASON = '統合検証の鍵の入れ替え';

describe('2FA の暗号化鍵の入れ替えの後始末（統合）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let service: TwoFactorService;
  const originalKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const oldKey = randomBytes(32).toString('hex');
  const newKey = randomBytes(32).toString('hex');

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await redisClient.del(...ids.map(authUserStateCacheKey));
    }
    await deleteAuditLogsWithArchivePermission(prisma, { targetId: { in: ids } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  /** 指定の鍵で秘密を暗号化する */
  async function encryptWith(key: string, secret: string): Promise<string> {
    const previous = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    process.env.TWO_FACTOR_ENCRYPTION_KEY = key;
    try {
      return await service.encryptSecret(secret);
    } finally {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = previous;
    }
  }

  /** 2FA の列・バックアップコード・リフレッシュトークンを持つ利用者を作る */
  async function createUser(
    label: string,
    twoFactor: {
      twoFactorEnabled: boolean;
      twoFactorSecret: string | null;
      twoFactorPendingSecret: string | null;
    }
  ) {
    const user = await createTestUser(prisma, {
      email: `${MARK}-${label}-${randomBytes(4).toString('hex')}@example.com`,
      displayName: `${MARK}-${label}`,
      passwordHash: 'not-used',
    });
    await prisma.user.update({ where: { id: user.id }, data: twoFactor });
    await prisma.twoFactorBackupCode.create({
      data: { userId: user.id, codeHash: `hash-${label}` },
    });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: randomBytes(32).toString('hex'),
        familyId: randomBytes(8).toString('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    // 状態のキャッシュに載せておく（再設定がキャッシュを無効化することを確かめる）
    await getSharedAuthenticatedUserStateService().getState(user.id);
    return user;
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await initRedis();
    const client = redis.getClient();
    if (!client) {
      throw new Error('Redis に接続できません（統合検証は実 Redis を要する）');
    }
    redisClient = client;
    service = new TwoFactorService({
      invalidate: (userId) => getSharedAuthenticatedUserStateService().invalidate(userId),
    });
    await cleanup();
  });

  afterEach(async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = originalKey;
    await cleanup();
  });

  afterAll(async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = originalKey;
    await cleanup();
  });

  it('入れ替え前の鍵の登録済みの秘密は未登録へ戻し、セッションを失効させ、監査とキャッシュの無効化を行う', async () => {
    const user = await createUser('old', {
      twoFactorEnabled: true,
      twoFactorSecret: await encryptWith(oldKey, 'JBSWY3DPEHPK3PXP'),
      twoFactorPendingSecret: null,
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await redisClient.get(authUserStateCacheKey(user.id))).not.toBeNull();

    process.env.TWO_FACTOR_ENCRYPTION_KEY = newKey;
    const result = await service.resetUndecryptableByOperatorScript(user.id, REASON);

    expect(result).toEqual({ ok: true, value: 'full' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.twoFactorEnabled).toBe(false);
    expect(after.twoFactorSecret).toBeNull();
    expect(after.twoFactorPendingSecret).toBeNull();
    expect(after.accessTokenGeneration).toBe(before.accessTokenGeneration + 1);
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await redisClient.get(authUserStateCacheKey(user.id))).toBeNull();

    const audits = await prisma.auditLog.findMany({ where: { targetId: user.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'TWO_FACTOR_RESET_BY_ADMIN',
      actorId: null,
      targetType: 'User',
      metadata: {
        targetEmail: user.email,
        revokedRefreshTokens: 1,
        trigger: 'operator_script',
        scope: 'full',
        reason: REASON,
      },
    });
  });

  it('入れ替え後の鍵の秘密は変えず、監査も記録しない', async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = newKey;
    const secret = await encryptWith(newKey, 'JBSWY3DPEHPK3PXP');
    const user = await createUser('new', {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorPendingSecret: null,
    });

    const result = await service.resetUndecryptableByOperatorScript(user.id, REASON);

    expect(result).toEqual({ ok: true, value: 'none' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.twoFactorEnabled).toBe(true);
    expect(after.twoFactorSecret).toBe(secret);
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: user.id } })).toBe(0);
  });

  it('入れ替え前の鍵の再登録中の秘密だけを持つ利用者は、再登録中の秘密だけを消す', async () => {
    const secret = await encryptWith(newKey, 'JBSWY3DPEHPK3PXP');
    const user = await createUser('pending', {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorPendingSecret: await encryptWith(oldKey, 'KRSXG5CTMVRXEZLU'),
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    process.env.TWO_FACTOR_ENCRYPTION_KEY = newKey;
    const result = await service.resetUndecryptableByOperatorScript(user.id, REASON);

    expect(result).toEqual({ ok: true, value: 'pending_only' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.twoFactorEnabled).toBe(true);
    expect(after.twoFactorSecret).toBe(secret);
    expect(after.twoFactorPendingSecret).toBeNull();
    expect(after.accessTokenGeneration).toBe(before.accessTokenGeneration);
    expect(await prisma.twoFactorBackupCode.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);
    const audits = await prisma.auditLog.findMany({ where: { targetId: user.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ scope: 'pending_only', revokedRefreshTokens: 0 });
  });

  it('2 回目の実行は何も変えない', async () => {
    const user = await createUser('twice', {
      twoFactorEnabled: true,
      twoFactorSecret: await encryptWith(oldKey, 'JBSWY3DPEHPK3PXP'),
      twoFactorPendingSecret: null,
    });

    process.env.TWO_FACTOR_ENCRYPTION_KEY = newKey;
    expect(await service.resetUndecryptableByOperatorScript(user.id, REASON)).toEqual({
      ok: true,
      value: 'full',
    });
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(await service.resetUndecryptableByOperatorScript(user.id, REASON)).toEqual({
      ok: true,
      value: 'none',
    });
    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterSecond.accessTokenGeneration).toBe(afterFirst.accessTokenGeneration);
    expect(await prisma.auditLog.count({ where: { targetId: user.id } })).toBe(1);
  });

  it('存在しない利用者は USER_NOT_FOUND を返す', async () => {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = newKey;
    expect(
      await service.resetUndecryptableByOperatorScript(
        '00000000-0000-0000-0000-000000000000',
        REASON
      )
    ).toEqual({ ok: false, error: { type: 'USER_NOT_FOUND' } });
  });
});
