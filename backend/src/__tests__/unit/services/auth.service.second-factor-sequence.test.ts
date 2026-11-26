/**
 * @fileoverview ログインの 2FA の検証の処理の順序の固定（タスク74.1）
 *
 * 検証を SecondFactorVerifier へ切り出す前の順序をそのまま書き、切り出しの前後で同じ結果になることを確かめる。
 * DB の読み書き・コードの照合・資格の消費・トークンの発行・監査を一本の列に記録して比べる。
 *
 * @requirement user-authentication/REQ-47.2
 * @requirement user-authentication/REQ-47.3
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AuthService } from '../../../services/auth.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { PasswordService } from '../../../services/password.service.js';
import type { SessionService } from '../../../services/session.service.js';
import type { TokenService } from '../../../services/token.service.js';
import type { TwoFactorChallengeService } from '../../../services/two-factor-challenge.service.js';
import type { TwoFactorService } from '../../../services/two-factor.service.js';
import type { AuthenticatedUserStateService } from '../../../services/authenticated-user-state.service.js';
import { Err, Ok } from '../../../types/result.js';

const anomaly = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: anomaly.observe,
}));
vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

const NOW = new Date('2026-11-24T00:00:00.000Z');
const LOCKED_UNTIL = new Date(NOW.getTime() + 5 * 60 * 1000);
const USER_ID = 'user-1';
const EMAIL = 'user@example.com';
const CTX = { ipAddress: '203.0.113.1', userAgent: 'vitest' };

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  isActive: boolean;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  twoFactorFailures: number;
  twoFactorLockedUntil: Date | null;
  accessTokenGeneration: number;
  userRoles: { role: { name: string } }[];
}

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    email: EMAIL,
    displayName: '利用者',
    createdAt: NOW,
    isActive: true,
    twoFactorEnabled: true,
    mustChangePassword: false,
    twoFactorFailures: 0,
    twoFactorLockedUntil: null,
    accessTokenGeneration: 3,
    userRoles: [{ role: { name: 'user' } }],
    ...overrides,
  };
}

function failureAudit(reason: string, method = 'totp') {
  return {
    op: 'audit',
    action: 'TWO_FACTOR_FAILED',
    actorId: null,
    targetType: 'User',
    targetId: USER_ID,
    metadata: {
      result: 'failure',
      reason,
      method,
      email: EMAIL,
      ipAddress: CTX.ipAddress,
      userAgent: CTX.userAgent,
    },
  };
}

function successAudits(method = 'totp') {
  const metadata = {
    result: 'success',
    method,
    email: EMAIL,
    ipAddress: CTX.ipAddress,
    userAgent: CTX.userAgent,
  };
  return [
    {
      op: 'audit',
      action: 'TWO_FACTOR_VERIFIED',
      actorId: USER_ID,
      targetType: 'User',
      targetId: USER_ID,
      metadata,
    },
    {
      op: 'audit',
      action: 'LOGIN_SUCCESS',
      actorId: USER_ID,
      targetType: 'User',
      targetId: USER_ID,
      metadata,
    },
  ];
}

const LOCK_AUDIT = {
  op: 'audit',
  action: 'LOGIN_LOCKED',
  actorId: null,
  targetType: 'User',
  targetId: USER_ID,
  metadata: {
    trigger: 'two_factor_failures',
    email: EMAIL,
    lockedUntil: LOCKED_UNTIL.toISOString(),
    ipAddress: CTX.ipAddress,
    userAgent: CTX.userAgent,
  },
};

const RESET_ON_SUCCESS = {
  op: 'user.update',
  data: { twoFactorFailures: 0, twoFactorLockedUntil: null, lastLoginAt: NOW },
};
const INCREMENT = { op: 'user.update', data: { twoFactorFailures: { increment: 1 } } };
const ISSUE = [{ op: 'token.access' }, { op: 'session.create', deviceInfo: CTX.userAgent }];

describe('ログインの 2FA の検証の処理の順序', () => {
  let ops: unknown[];
  let row: UserRow;
  let incrementError: Error | null;
  let service: AuthService;
  let verifyTOTP: ReturnType<typeof vi.fn>;
  let verifyBackupCode: ReturnType<typeof vi.fn>;
  let consume: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    ops = [];
    row = userRow();
    incrementError = null;
    anomaly.observe.mockReset();
    anomaly.observe.mockImplementation((event: { signal: string }) => {
      ops.push({ op: 'anomaly', signal: event.signal });
    });

    const prisma = {
      user: {
        findUnique: vi.fn(async () => {
          ops.push({ op: 'user.findUnique' });
          return row;
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          ops.push({ op: 'user.update', data });
          if ('twoFactorFailures' in data && typeof data.twoFactorFailures === 'object') {
            if (incrementError) {
              throw incrementError;
            }
            row = { ...row, twoFactorFailures: row.twoFactorFailures + 1 };
            return { twoFactorFailures: row.twoFactorFailures };
          }
          return row;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          ops.push({
            op: 'audit',
            action: data.action,
            actorId: data.actorId,
            targetType: data.targetType,
            targetId: data.targetId,
            metadata: data.metadata,
          });
          return {};
        }),
      },
    } as unknown as PrismaClient;

    verifyTOTP = vi.fn(async () => {
      ops.push({ op: 'verifyTOTP' });
      return Ok(true);
    });
    verifyBackupCode = vi.fn(async () => {
      ops.push({ op: 'verifyBackupCode' });
      return Ok(true);
    });
    consume = vi.fn(async () => {
      ops.push({ op: 'challenge.consume' });
      return Ok({ userId: USER_ID });
    });

    service = new AuthService(
      prisma,
      {} as InvitationService,
      {} as PasswordService,
      {
        generateAccessToken: vi.fn(async () => {
          ops.push({ op: 'token.access' });
          return 'access-token';
        }),
      } as unknown as TokenService,
      { verifyTOTP, verifyBackupCode } as unknown as TwoFactorService,
      {
        createSession: vi.fn(async (_userId: string, deviceInfo?: string) => {
          ops.push({ op: 'session.create', deviceInfo });
          return { refreshToken: 'refresh-token' };
        }),
      } as unknown as SessionService,
      {
        peek: vi.fn(async () => Ok({ userId: USER_ID })),
        consume,
      } as unknown as TwoFactorChallengeService,
      {} as AuthenticatedUserStateService
    );
  });

  afterEachRestoreTimers();

  it('TOTP の成功: 照合 → 資格の消費 → リセットと最終ログイン → 発行 → 監査', async () => {
    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result.ok).toBe(true);
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      { op: 'challenge.consume' },
      RESET_ON_SUCCESS,
      ...ISSUE,
      ...successAudits(),
    ]);
  });

  it('バックアップコードの成功も同じ順序で、method が backup になる', async () => {
    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'backup', backupCode: 'QWER5678' },
      CTX
    );

    expect(result.ok).toBe(true);
    expect(verifyBackupCode).toHaveBeenCalledWith(USER_ID, 'QWER5678');
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyBackupCode' },
      { op: 'challenge.consume' },
      RESET_ON_SUCCESS,
      ...ISSUE,
      ...successAudits('backup'),
    ]);
  });

  it('コードの誤り: 加算 → 失敗の監査で、資格を消費しない', async () => {
    verifyTOTP.mockImplementation(async () => {
      ops.push({ op: 'verifyTOTP' });
      return Ok(false);
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '000000' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'INVALID_2FA_CODE' }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      INCREMENT,
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('invalid_code'),
    ]);
  });

  it('バックアップコードの誤りは INVALID_BACKUP_CODE を返す', async () => {
    verifyBackupCode.mockImplementation(async () => {
      ops.push({ op: 'verifyBackupCode' });
      return Ok(false);
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'backup', backupCode: 'WRONG000' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'INVALID_BACKUP_CODE' }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyBackupCode' },
      INCREMENT,
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('invalid_code', 'backup'),
    ]);
  });

  it('同じ時間ステップの再利用は reason=replay で失敗に数える', async () => {
    verifyTOTP.mockImplementation(async () => {
      ops.push({ op: 'verifyTOTP' });
      return Err({ type: 'CODE_ALREADY_USED' });
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'INVALID_2FA_CODE' }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      INCREMENT,
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('replay'),
    ]);
  });

  it('5 回目の失敗: 加算 → ロック → 失敗の監査 → ロックの監査', async () => {
    row = userRow({ twoFactorFailures: 4 });
    verifyTOTP.mockImplementation(async () => {
      ops.push({ op: 'verifyTOTP' });
      return Ok(false);
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '000000' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'ACCOUNT_LOCKED', unlockAt: LOCKED_UNTIL }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      INCREMENT,
      { op: 'user.update', data: { twoFactorLockedUntil: LOCKED_UNTIL } },
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('invalid_code'),
      LOCK_AUDIT,
    ]);
  });

  it('加算に失敗しても見込みの回数でロックの応答を返し、ロックは書かない', async () => {
    row = userRow({ twoFactorFailures: 4 });
    incrementError = new Error('update failed');
    verifyTOTP.mockImplementation(async () => {
      ops.push({ op: 'verifyTOTP' });
      return Ok(false);
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '000000' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'ACCOUNT_LOCKED', unlockAt: LOCKED_UNTIL }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      INCREMENT,
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('invalid_code'),
      LOCK_AUDIT,
    ]);
  });

  it('ロック中はコードを照合せず、失敗も数えない', async () => {
    row = userRow({ twoFactorFailures: 5, twoFactorLockedUntil: LOCKED_UNTIL });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'ACCOUNT_LOCKED', unlockAt: LOCKED_UNTIL }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('account_locked'),
    ]);
  });

  it('ロックの期限切れ: 解除してから照合する', async () => {
    row = userRow({ twoFactorFailures: 5, twoFactorLockedUntil: NOW });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result.ok).toBe(true);
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'user.update', data: { twoFactorFailures: 0, twoFactorLockedUntil: null } },
      { op: 'verifyTOTP' },
      { op: 'challenge.consume' },
      RESET_ON_SUCCESS,
      ...ISSUE,
      ...successAudits(),
    ]);
  });

  it('無効化された利用者はコードを照合せず CHALLENGE_INVALID を返す', async () => {
    row = userRow({ isActive: false });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'CHALLENGE_INVALID' }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('account_disabled'),
    ]);
  });

  it('資格の消費に失敗したら失敗の回数を消さず、発行もしない', async () => {
    row = userRow({ twoFactorFailures: 2 });
    consume.mockImplementation(async () => {
      ops.push({ op: 'challenge.consume' });
      return Err({ type: 'CHALLENGE_INVALID' });
    });

    const result = await service.completeTwoFactorLogin(
      'challenge',
      { kind: 'totp', code: '123456' },
      CTX
    );

    expect(result).toEqual(Err({ type: 'CHALLENGE_INVALID' }));
    expect(ops).toEqual([
      { op: 'user.findUnique' },
      { op: 'verifyTOTP' },
      { op: 'challenge.consume' },
      { op: 'anomaly', signal: 'login_failed' },
      failureAudit('challenge_consumed'),
    ]);
  });
});

function afterEachRestoreTimers(): void {
  // Date だけを固定しているので、各テストの後に戻す
  afterEach(() => {
    vi.useRealTimers();
  });
}
