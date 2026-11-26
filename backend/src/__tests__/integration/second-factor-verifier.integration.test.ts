/**
 * @fileoverview SecondFactorVerifier の統合検証（タスク74.1）
 *
 * 実 PostgreSQL で、TOTP の時間ステップとバックアップコードがログインと同意をまたいで一度しか通らないこと、
 * 失敗の回数とロックを両者で共有すること、同意の成功がログインの状態を変えないことを確かめる。
 *
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.3
 * @requirement user-authentication/REQ-32.7
 */

import { randomBytes } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { SecondFactorVerifier } from '../../services/second-factor-verifier.service.js';
import { TwoFactorService } from '../../services/two-factor.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua741-second-factor';
const BACKUP_CODE = 'QWER5678';
const WRONG_TOTP = (code: string) => (code === '000000' ? '000001' : '000000');

describe('SecondFactorVerifier（統合）', () => {
  let prisma: PrismaClient;
  let verifier: SecondFactorVerifier;
  let userId: string;
  let secret: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }],
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.twoFactorBackupCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    verifier = new SecondFactorVerifier(prisma, new TwoFactorService());
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    secret = authenticator.generateSecret();
    const user = await createTestUser(
      prisma,
      {
        email: `${MARK}-${randomBytes(4).toString('hex')}@example.com`,
        displayName: '共通の検証',
        passwordHash: await hash('Unused!Passphrase-2026'),
      },
      { twoFactor: { secret } }
    );
    userId = user.id;
    await prisma.twoFactorBackupCode.create({
      data: { userId, codeHash: await hash(BACKUP_CODE) },
    });
  });

  it('同意で使った TOTP はログインで通らない', async () => {
    const code = authenticator.generate(secret);

    expect((await verifier.verify(userId, { type: 'totp', code }, 'oauth_consent')).ok).toBe(true);
    const second = await verifier.verify(userId, { type: 'totp', code }, 'login');

    expect(second).toEqual({ ok: false, error: { type: 'INVALID_CODE' } });
    const failure = await prisma.auditLog.findFirst({
      where: { targetId: userId, action: 'TWO_FACTOR_FAILED' },
    });
    expect(failure?.metadata).toMatchObject({ reason: 'replay' });
  });

  it('ログインで使った TOTP は同意で通らない', async () => {
    const code = authenticator.generate(secret);

    expect((await verifier.verify(userId, { type: 'totp', code }, 'login')).ok).toBe(true);
    const second = await verifier.verify(userId, { type: 'totp', code }, 'oauth_consent');

    expect(second).toEqual({ ok: false, error: { type: 'INVALID_CODE' } });
  });

  it('同じ TOTP の同時の同意は一方だけが通る', async () => {
    const code = authenticator.generate(secret);

    const results = await Promise.all([
      verifier.verify(userId, { type: 'totp', code }, 'oauth_consent'),
      verifier.verify(userId, { type: 'totp', code }, 'oauth_consent'),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('バックアップコードは目的をまたいで一度しか通らない', async () => {
    const code = { type: 'backup', code: BACKUP_CODE } as const;

    expect((await verifier.verify(userId, code, 'oauth_consent')).ok).toBe(true);
    const second = await verifier.verify(userId, code, 'login');

    expect(second).toEqual({ ok: false, error: { type: 'INVALID_CODE' } });
    const rows = await prisma.twoFactorBackupCode.findMany({ where: { userId } });
    expect(rows.every((row) => row.usedAt !== null)).toBe(true);
  });

  it('同意とログインの失敗を同じ回数で数え、5 回でロックして両方を止める', async () => {
    const wrong = WRONG_TOTP(authenticator.generate(secret));
    for (let i = 0; i < 4; i += 1) {
      const failed = await verifier.verify(userId, { type: 'totp', code: wrong }, 'oauth_consent');
      expect(failed).toEqual({ ok: false, error: { type: 'INVALID_CODE' } });
    }

    const locked = await verifier.verify(userId, { type: 'totp', code: wrong }, 'login');

    expect(locked.ok).toBe(false);
    expect(!locked.ok && locked.error.type).toBe('ACCOUNT_LOCKED');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.twoFactorFailures).toBe(5);
    expect(row.twoFactorLockedUntil).not.toBeNull();

    const valid = authenticator.generate(secret);
    const blocked = await verifier.verify(userId, { type: 'totp', code: valid }, 'oauth_consent');
    expect(!blocked.ok && blocked.error.type).toBe('ACCOUNT_LOCKED');
  });

  it('4 回失敗の後の同意の成功で連続が切れ、次の 1 回の失敗ではロックしない', async () => {
    const valid = authenticator.generate(secret);
    const wrong = WRONG_TOTP(valid);
    for (let i = 0; i < 4; i += 1) {
      await verifier.verify(userId, { type: 'totp', code: wrong }, 'oauth_consent');
    }

    expect((await verifier.verify(userId, { type: 'totp', code: valid }, 'oauth_consent')).ok).toBe(
      true
    );
    const next = await verifier.verify(userId, { type: 'totp', code: wrong }, 'oauth_consent');

    expect(next).toEqual({ ok: false, error: { type: 'INVALID_CODE' } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.twoFactorFailures).toBe(1);
    expect(row.twoFactorLockedUntil).toBeNull();
  });

  it('照合の間に並行してロックされた行は、成功のリセットで解除されない', async () => {
    const real = new TwoFactorService();
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    // 読み込みの後、リセットの前に、並行の失敗がロックを書いた状態を作る
    const racing = new SecondFactorVerifier(prisma, {
      verifyTOTP: async (id: string, code: string) => {
        const verified = await real.verifyTOTP(id, code);
        await prisma.user.update({
          where: { id },
          data: { twoFactorFailures: 5, twoFactorLockedUntil: lockedUntil },
        });
        return verified;
      },
    } as unknown as TwoFactorService);

    const result = await racing.verify(
      userId,
      { type: 'totp', code: authenticator.generate(secret) },
      'oauth_consent'
    );

    expect(result.ok).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.twoFactorFailures).toBe(5);
    expect(row.twoFactorLockedUntil).toEqual(lockedUntil);
  });

  it('同意の成功は失敗の回数を 0 へ戻し、最終ログインとセッションを変えない', async () => {
    await prisma.user.update({ where: { id: userId }, data: { twoFactorFailures: 2 } });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const result = await verifier.verify(
      userId,
      { type: 'totp', code: authenticator.generate(secret) },
      'oauth_consent',
      { ipAddress: '203.0.113.9', userAgent: 'vitest' }
    );

    expect(result.ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.lastLoginAt).toEqual(before.lastLoginAt);
    expect(after.twoFactorFailures).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { targetId: userId, action: 'TWO_FACTOR_VERIFIED' },
    });
    expect(audit?.metadata).toMatchObject({
      purpose: 'oauth_consent',
      method: 'totp',
      ipAddress: '203.0.113.9',
    });
  });
});
