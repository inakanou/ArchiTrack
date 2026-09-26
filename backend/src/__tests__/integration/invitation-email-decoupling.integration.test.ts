/**
 * @fileoverview 招待・登録とメール送信の切り離しの統合検証（タスク35.4）
 *
 * 実データベースに対して、招待メールのキュー投入（Bull の `add`）を失敗させても
 * 招待の作成と、その招待を使った登録が成功し、DB の状態が成立することを確かめる。
 * キューだけを差し替え、EmailService・InvitationService・AuthService は本物を使う。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（トークン発行の鍵を読むため、サービスのインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { EmailService } from '../../services/email.service.js';
import { InvitationService } from '../../services/invitation.service.js';
import { PasswordService } from '../../services/password.service.js';
import { AuthService } from '../../services/auth.service.js';
import { seedRoles } from '../../utils/seed-helpers.js';
import logger from '../../utils/logger.js';

const EMAIL_MARK = 'test-invitation-email-decoupling';
const inviteeEmail = `${EMAIL_MARK}-invitee@example.com`;
const adminEmail = `${EMAIL_MARK}-admin@example.com`;

describe('招待・登録とメール送信の切り離し（統合）', () => {
  let prisma: PrismaClient;
  let queueAdd: ReturnType<typeof vi.fn>;
  let queueError: Error;
  let invitationService: InvitationService;
  let authService: AuthService;
  let adminId: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { contains: EMAIL_MARK } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.invitation.deleteMany({ where: { email: { contains: EMAIL_MARK } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await seedRoles(prisma);
  });

  beforeEach(async () => {
    await cleanup();

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        displayName: 'Invitation Email Decoupling Admin',
        passwordHash: 'not-used-in-this-test',
      },
    });
    adminId = admin.id;

    // メール送信の外部サービスが利用できない状態: キューへの投入が失敗する
    queueError = new Error('Redis connection refused');
    queueAdd = vi.fn().mockRejectedValue(queueError);
    const unavailableQueue = { add: queueAdd, process: vi.fn() } as unknown as Queue;
    const unusedTransporter = { sendMail: vi.fn() } as unknown as Transporter;
    const emailService = new EmailService(unusedTransporter, unavailableQueue);

    invitationService = new InvitationService(prisma, emailService);
    authService = new AuthService(
      prisma,
      invitationService,
      new PasswordService(prisma, emailService)
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /**
   * @requirement user-authentication/REQ-24.8
   */
  it('キュー投入が失敗しても招待の作成は Ok を返し、未使用の招待が DB に保存される', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const result = await invitationService.createInvitation(adminId, inviteeEmail);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 招待メールの投入は試みられ、失敗している
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      'invitation-email',
      { to: inviteeEmail, invitationToken: result.value.token },
      expect.objectContaining({ attempts: 6 })
    );

    const stored = await prisma.invitation.findUnique({ where: { id: result.value.id } });
    expect(stored).not.toBeNull();
    expect(stored?.email).toBe(inviteeEmail);
    expect(stored?.inviterId).toBe(adminId);
    expect(stored?.status).toBe('pending');
    expect(stored?.token).toBe(result.value.token);

    await vi.waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(
        { err: queueError, invitationId: result.value.id },
        'Failed to queue invitation email; invitation was created'
      )
    );

    // 本物のロガーのシリアライザを通したとき、障害の message と stack が JSON に残る
    const [logged] = warnSpy.mock.calls.find(
      ([, message]) => message === 'Failed to queue invitation email; invitation was created'
    ) as [Record<string, unknown>, string];
    // テストの共通設定（vitest.setup.ts）はロガーをモックに置き換えるため、本物のロガー
    // （pino の設定を持つ実体）を取り出し、その err シリアライザを警告の引数に当てる。
    // pino はシリアライザを Symbol('pino.serializers') に持つので、記号はロガー自身から説明文で引く
    const { default: realLogger } =
      await vi.importActual<typeof import('../../utils/logger.js')>('../../utils/logger.js');
    const serializersSym = Object.getOwnPropertySymbols(realLogger).find(
      (sym) => sym.description === 'pino.serializers'
    );
    expect(serializersSym).toBeDefined();
    const serializers = (
      realLogger as unknown as Record<symbol, Record<string, (v: unknown) => unknown>>
    )[serializersSym as symbol];
    expect(typeof serializers?.err).toBe('function');
    const serialized = JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(logged).map(([key, value]) => [
            key,
            serializers?.[key] ? serializers[key](value) : value,
          ])
        )
      )
    );
    expect(serialized.err.message).toBe('Redis connection refused');
    expect(serialized.err.stack).toContain('Redis connection refused');
    warnSpy.mockRestore();
  });

  /**
   * @requirement user-authentication/REQ-24.8
   */
  it('キュー投入が失敗した招待を使った登録も Ok を返し、ユーザー作成と招待の使用済み化が DB に成立する', async () => {
    const created = await invitationService.createInvitation(adminId, inviteeEmail);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(queueAdd).toHaveBeenCalledTimes(1);

    const registered = await authService.register(created.value.token, {
      password: 'Decoupl1ng!Pass#2026',
      displayName: 'Decoupled Invitee',
    });

    expect(registered).toMatchObject({ ok: true, value: { user: { email: inviteeEmail } } });
    if (!registered.ok) return;

    const user = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      include: { userRoles: { include: { role: true } } },
    });
    expect(user?.id).toBe(registered.value.user.id);
    expect(user?.userRoles.map((ur) => ur.role.name)).toContain('user');

    const invitation = await prisma.invitation.findUnique({ where: { id: created.value.id } });
    expect(invitation?.status).toBe('used');
    expect(invitation?.userId).toBe(user?.id);
    expect(invitation?.usedAt).not.toBeNull();

    // 登録はメール送信を伴わない（投入は招待作成時の 1 回だけ）
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });
});
