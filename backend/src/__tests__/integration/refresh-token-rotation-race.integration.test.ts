/**
 * @fileoverview ローテーションと失効の競合で後継が失効を逃れないことの統合検証（タスク45.2）
 *
 * 取引は READ COMMITTED である。ローテーションが前の行を置き換え、後継を作ってコミットする前に、
 * 系列や利用者単位の削除の文が始まると、その文は後継を見ずに前の行だけを消しうる。
 * 利用者単位の取引ロック（utils/refresh-token-lock.ts）がこれを直列化していることを、実 PostgreSQL で確かめる。
 *
 * 待ち合わせは本番の分岐を使わず、SessionService へ注入する TokenService の generateRefreshToken
 * （ローテーションの取引の中で、置き換えの記録の後・後継の作成の前に呼ばれる）で行う。
 * 他方の操作がロックの待ちに入ったことは pg_stat_activity で確かめてから、ローテーションを進める。
 */

import { randomBytes } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { SessionService } from '../../services/session.service.js';
import { UserRoleService } from '../../services/user-role.service.js';
import { PasswordService } from '../../services/password.service.js';
import type { EmailService } from '../../services/email.service.js';
import type { TokenService } from '../../services/token.service.js';
import { createStoredRefreshToken } from './refresh-token-fixture.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-ua452-rotation-race';
const WAIT_TIMEOUT_MS = 10000;

/** 取引ロックの取得の文（utils/refresh-token-lock.ts） */
const ADVISORY_LOCK_STATEMENT = 'pg_advisory_xact_lock';
/** ロックが無いとき、系列・利用者単位の失効が待つ文 */
const DELETE_REFRESH_TOKENS_STATEMENT = 'DELETE FROM "public"."refresh_tokens"';
/** パスワードの変更の古い履歴の削除の文 */
const DELETE_PASSWORD_HISTORIES_STATEMENT = 'DELETE FROM "public"."password_histories"';
const CURRENT_PASSWORD = 'Current!Passphrase-2026';
const NEW_PASSWORD = 'Rotated!Passphrase-2026x';
/** ロックが無いとき、利用者の削除が待つ文 */
const DELETE_USERS_STATEMENT = 'DELETE FROM "public"."users"';

/** 一度だけ開く門 */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

describe('ローテーションと失効の競合（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let userId: string;

  /**
   * 後継の原文を作る直前で止まる TokenService。rotate の取引は、ここで止まっている間
   * 前の行の置き換えを記録済みで（行ロックを保持し）、後継はまだ無い。
   */
  function pausingTokenService(): {
    tokenService: TokenService;
    reached: Promise<void>;
    release: () => void;
    successors: string[];
  } {
    const reachedGate = gate();
    const releaseGate = gate();
    const successors: string[] = [];
    const tokenService = {
      generateRefreshToken: async () => {
        reachedGate.open();
        await releaseGate.wait;
        const token = `successor-${randomBytes(16).toString('hex')}`;
        successors.push(token);
        return token;
      },
    } as unknown as TokenService;
    return { tokenService, reached: reachedGate.wait, release: releaseGate.open, successors };
  }

  /**
   * 他の接続が、指定した文の実行中に DB のロックの待ちに入るまで待つ
   *
   * DB 全体のロックの待ちを数えると、並行する他の検証のファイルの待ちで条件が満たされうる。
   * 自分の接続を除き、文の字面（取引ロックの取得、またはロックが無いときに待つ削除の文）で絞る。
   *
   * @param queryPatterns - pg_stat_activity.query に含まれる文字列（いずれか一つ）
   */
  async function waitUntilAnotherSessionWaitsForLock(queryPatterns: string[]): Promise<void> {
    const likes = queryPatterns.map((pattern) => `%${pattern}%`);
    const deadline = performance.now() + WAIT_TIMEOUT_MS;
    while (performance.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query LIKE ANY (${likes}::text[])`;
      if (Number(rows[0]!.count) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('失効の操作がロックの待ちに入らなかった');
  }

  async function cleanup(): Promise<void> {
    await prisma.user.deleteMany({ where: { email: { contains: MARK } } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    const user = await createTestUser(prisma, {
      email: `${MARK}-${randomBytes(4).toString('hex')}@example.com`,
      displayName: 'Rotation Race User',
      passwordHash: 'not-used',
    });
    userId = user.id;
  });

  /**
   * ローテーションを後継の作成の直前で止め、その間に失効を始め、ロックの待ちに入ったらローテーションを進める
   */
  async function raceRotationWith(
    revoke: (presentedToken: string) => Promise<unknown>,
    waitingStatement: string
  ): Promise<{ familyId: string; successors: string[]; revoked: unknown }> {
    const { rawToken, row } = await createStoredRefreshToken(prisma, {
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const pausing = pausingTokenService();
    const rotating = new SessionService(prisma, pausing.tokenService).rotate(rawToken);

    await pausing.reached;
    const revoking = revoke(rawToken);
    await waitUntilAnotherSessionWaitsForLock([ADVISORY_LOCK_STATEMENT, waitingStatement]);
    pausing.release();

    const [rotated, revoked] = await Promise.all([rotating, revoking]);
    expect(rotated).toMatchObject({ ok: true });
    return { familyId: row.familyId, successors: pausing.successors, revoked };
  }

  it('ログアウト（系列の失効）と並行したローテーションの後継は残らない', async () => {
    const { familyId, successors } = await raceRotationWith(
      (token) => new SessionService(prisma).revokeByToken(token, userId),
      DELETE_REFRESH_TOKENS_STATEMENT
    );

    expect(successors).toHaveLength(1);
    await expect(prisma.refreshToken.count({ where: { familyId } })).resolves.toBe(0);
    await expect(new SessionService(prisma).rotate(successors[0]!)).resolves.toEqual({
      ok: false,
      error: { type: 'NOT_FOUND' },
    });
  });

  it('利用者単位の失効（全デバイスのログアウト・パスワードの変更）と並行したローテーションの後継は残らない', async () => {
    const { successors } = await raceRotationWith(
      () => new SessionService(prisma).revokeAllForUser(userId),
      DELETE_REFRESH_TOKENS_STATEMENT
    );

    expect(successors).toHaveLength(1);
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(0);
  });

  it('呼び出し元の取引の中の利用者単位の失効（パスワードの変更・リセットの経路）でも後継は残らない', async () => {
    const { successors } = await raceRotationWith(
      () => prisma.$transaction((tx) => new SessionService(prisma).revokeAllForUser(userId, tx)),
      DELETE_REFRESH_TOKENS_STATEMENT
    );

    expect(successors).toHaveLength(1);
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(0);
  });

  it('利用者の削除と並行したローテーションはデッドロックせず、後継は残らない', async () => {
    const { successors, revoked } = await raceRotationWith(
      () => new UserRoleService(prisma).deleteUser(userId, 'actor-not-recorded'),
      DELETE_USERS_STATEMENT
    );

    expect(successors).toHaveLength(1);
    expect(revoked).toMatchObject({ ok: true });
    await expect(prisma.user.count({ where: { id: userId } })).resolves.toBe(0);
    await expect(prisma.refreshToken.count({ where: { userId } })).resolves.toBe(0);
  });

  /**
   * パスワードの変更は users の行を更新し、利用者の削除は users の行を消す。どちらも利用者単位の取引ロックを
   * 取るため、ロックと users の行の順序が経路ごとに逆だとデッドロックになる。パスワードの変更の取引を、
   * 古い履歴の削除（users の行の更新の後）で止め、その間に利用者の削除を始めて重ねる。
   */
  it('パスワードの変更と利用者の削除を重ねてもデッドロックしない', async () => {
    const argon2Options = { memoryCost: 65536, timeCost: 3, parallelism: 4 };
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(CURRENT_PASSWORD, argon2Options) },
    });
    // 履歴を上限（3 件）まで入れておく。変更で 4 件になり、最も古い 1 件を消す文が走る
    const histories = [];
    for (let i = 0; i < 3; i++) {
      histories.push(
        await prisma.passwordHistory.create({
          data: {
            userId,
            passwordHash: await hash(`Old!Passphrase-${i}-2026`, argon2Options),
            createdAt: new Date(Date.now() - (10 - i) * 60 * 1000),
          },
        })
      );
    }
    const oldest = histories[0]!;

    // 最も古い履歴の行を別の取引で握り、パスワードの変更をその削除で止める
    const holding = gate();
    const releaseHold = gate();
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM password_histories WHERE id = ${oldest.id} FOR UPDATE`;
        holding.open();
        await releaseHold.wait;
      },
      { maxWait: WAIT_TIMEOUT_MS, timeout: 3 * WAIT_TIMEOUT_MS }
    );
    await holding.wait;

    const changing = new PasswordService(prisma, {} as EmailService).changePassword(
      userId,
      CURRENT_PASSWORD,
      NEW_PASSWORD
    );
    await waitUntilAnotherSessionWaitsForLock([DELETE_PASSWORD_HISTORIES_STATEMENT]);

    const deleting = new UserRoleService(prisma).deleteUser(userId, 'actor-not-recorded');
    await waitUntilAnotherSessionWaitsForLock([ADVISORY_LOCK_STATEMENT, DELETE_USERS_STATEMENT]);

    releaseHold.open();
    await blocker;
    const [changed, deleted] = await Promise.all([changing, deleting]);

    expect(changed).toEqual({ ok: true, value: undefined });
    expect(deleted).toMatchObject({ ok: true });
    await expect(prisma.user.count({ where: { id: userId } })).resolves.toBe(0);
  });
});
