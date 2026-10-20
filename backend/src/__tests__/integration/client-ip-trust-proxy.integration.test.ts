/**
 * @fileoverview 送信元 IP の識別の統合検証（user-authentication タスク44.5）
 *
 * 本物のアプリ（app.ts の `trust proxy`・回数制限・authenticate・requirePermission・監査ログの記録）と、
 * テスト用の実データベース・実 Redis を通す。中継の段数は `TRUST_PROXY_HOPS=1`
 * （画面の配信元の nginx を一段だけ信頼する構成）で組み立てる。
 *
 * 確かめること:
 * - 要件35.1: 回数制限の識別は信頼する中継が付けた値（`X-Forwarded-For` の末尾の一段）だけで決まり、
 *   利用者が先頭に足した値で変わらない（回数制限が試験の実行環境でも働く `/health` の制限で観測する。
 *   認証系の制限の 429 での観測はタスク48.3）
 * - 要件35.2: 監査ログに記録する送信元 IP は、回数制限と同じ方法で識別した値になる
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// アプリの読み込み（app.ts が validateEnv を呼ぶ）より前に段数を与える
const { originalTrustProxyHops } = vi.hoisted(() => {
  const originalTrustProxyHops = process.env.TRUST_PROXY_HOPS;
  process.env.TRUST_PROXY_HOPS = '1';
  return { originalTrustProxyHops };
});

import request from 'supertest';
import type Redis from 'ioredis';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import app from '../../app.js';
import getPrismaClient from '../../db.js';
import redis, { initRedis } from '../../redis.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua445-client-ip';

/** 信頼する中継（段数 1）が付けた送信元。文書用のアドレス帯（RFC 5737）を使う */
const TRUSTED_CLIENT_IP = '203.0.113.71';
const OTHER_TRUSTED_CLIENT_IP = '203.0.113.72';
/** 利用者が X-Forwarded-For の先頭に足す偽の送信元 */
const SPOOFED_IPS = ['198.51.100.11', '198.51.100.12', '198.51.100.13'];

const HEALTH_KEY_PREFIX = 'rl:health:';

describe('送信元 IP の識別（統合・TRUST_PROXY_HOPS=1）', () => {
  let prisma: PrismaClient;
  let redisClient: Redis;
  let userId: string;
  let token: string;

  function healthKeys(): string[] {
    return [TRUSTED_CLIENT_IP, OTHER_TRUSTED_CLIENT_IP, ...SPOOFED_IPS].map(
      (ip) => `${HEALTH_KEY_PREFIX}${ip}`
    );
  }

  async function cleanup(): Promise<void> {
    if (redisClient) {
      await redisClient.del(...healthKeys());
    }
    const users = await prisma.user.findMany({
      where: { email: { contains: MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    for (const id of userIds) {
      await getSharedRBACService().invalidateUserPermissionsCache(id);
    }
    await deleteAuditLogsWithArchivePermission(prisma, { actorId: { in: userIds } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: MARK } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    // 前提: 段数 1 で組み立てられている（未設定の 0 や全面的な信頼 true では検証にならない）
    expect(validateEnv().TRUST_PROXY_HOPS).toBe(1);
    expect(app.get('trust proxy')).toBe(1);

    await initRedis();
    const client = redis.getClient();
    // 前提: 実 Redis に接続できていること（できなければ回数制限の記録を観測できないため赤にする）
    expect(client, 'REDIS_URL の Redis クライアントが初期化されていない').not.toBeNull();
    expect(client!.status, '実 Redis に接続できていない').toBe('ready');
    redisClient = client!;

    await cleanup();

    // 権限を一つも持たないロールの利用者（どの権限の確認でも 403 になり、監査ログに記録される）
    const role = await prisma.role.create({
      data: { name: MARK, description: MARK, priority: 0, isSystem: false },
    });
    const email = `${MARK}@example.com`;
    const user = await createTestUser(prisma, {
      email,
      displayName: MARK,
      passwordHash: 'not-used',
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    userId = user.id;
    token = await tokenService.generateAccessToken({ userId, email, roles: [MARK] });
  });

  afterAll(async () => {
    await cleanup();
    await redis.disconnect();
    // 同じワーカーで続く検証へ段数を持ち越さない（試験コンテナが与えた元の値へ戻す）
    if (originalTrustProxyHops === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = originalTrustProxyHops;
    }
  });

  it('回数制限の識別は X-Forwarded-For の先頭を偽っても変わらず、信頼する中継が付けた値で数える（35.1）', async () => {
    const remainings: number[] = [];
    for (const spoofed of SPOOFED_IPS) {
      const response = await request(app)
        .get('/health')
        .set('X-Forwarded-For', `${spoofed}, ${TRUSTED_CLIENT_IP}`)
        .set('X-Real-IP', spoofed);
      remainings.push(Number(response.headers['ratelimit-remaining']));
    }

    // 同じ一つの識別で数えられ、残りが一つずつ減る
    const limit = remainings[0]! + 1;
    expect(remainings).toEqual([limit - 1, limit - 2, limit - 3]);
    expect(Number(await redisClient.get(`${HEALTH_KEY_PREFIX}${TRUSTED_CLIENT_IP}`))).toBe(3);
    // 偽の値を識別にした記録は一つも無い
    for (const spoofed of SPOOFED_IPS) {
      expect(await redisClient.exists(`${HEALTH_KEY_PREFIX}${spoofed}`)).toBe(0);
    }

    // 対照: 信頼する中継が付けた値が違えば別の識別として数える（識別が定数に潰れていない）
    const other = await request(app)
      .get('/health')
      .set('X-Forwarded-For', `${SPOOFED_IPS[0]}, ${OTHER_TRUSTED_CLIENT_IP}`);
    expect(Number(other.headers['ratelimit-remaining'])).toBe(limit - 1);
  });

  /**
   * @requirement user-authentication/REQ-35.2: 監査ログの送信元 IP は回数制限と同じ方法で識別した値（信頼する中継が付けた値）になり、X-Forwarded-For の先頭の偽装で変わらない
   */
  it('監査ログの送信元 IP は X-Forwarded-For の先頭を偽っても変わらず、回数制限と同じ識別になる（35.2）', async () => {
    for (const spoofed of SPOOFED_IPS) {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', `${spoofed}, ${TRUSTED_CLIENT_IP}`)
        .set('X-Real-IP', spoofed);
      expect(response.status).toBe(403);
    }

    const logs = await prisma.auditLog.findMany({
      where: { actorId: userId, action: 'PERMISSION_CHECK_FAILED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs).toHaveLength(SPOOFED_IPS.length);
    for (const log of logs) {
      expect((log.metadata as { ip?: string }).ip).toBe(TRUSTED_CLIENT_IP);
    }
    expect(JSON.stringify(logs.map((log) => log.metadata))).not.toMatch(/198\.51\.100\./);
  });
});
