/**
 * @fileoverview 認証領域のサービスのエラー・警告ログが障害を pino の err キーに載せることの単体検証（タスク36.8）
 *
 * pino の err シリアライザ（pino.stdSerializers.err）は err キーにだけ効く。
 * `{ error }` や `{ updateError }` のように別のキーへ Error を載せると、本番の JSON 出力では
 * Error の列挙可能なプロパティしか残らず、message と stack が失われる。
 *
 * 各サービスの catch へ実際に到達させ、ログの第1引数を本物のロガー（importActual で取り出した
 * pino の実体）のシリアライザに通したうえで、障害の message と stack が JSON に残ることを主張する。
 * 対象は two-factor（10 か所）・role（4）・role-permission（3）・user-role（3）・permission（3）・
 * session（1）・auth（2）。rbac の分はタスク36.2 で改め、統合検証
 * （rbac-permission-cache.integration.test.ts）で主張している。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import logger from '../../../utils/logger.js';
import { TwoFactorService } from '../../../services/two-factor.service.js';
import { RoleService } from '../../../services/role.service.js';
import { RolePermissionService } from '../../../services/role-permission.service.js';
import { UserRoleService } from '../../../services/user-role.service.js';
import { PermissionService } from '../../../services/permission.service.js';
import { SessionService } from '../../../services/session.service.js';
import { AuthService } from '../../../services/auth.service.js';
import type { InvitationService } from '../../../services/invitation.service.js';
import type { PasswordService } from '../../../services/password.service.js';
import type { TokenService } from '../../../services/token.service.js';
import { Ok } from '../../../types/result.js';

vi.mock('../../../utils/sentry.js', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

/** TwoFactorService はコンストラクタで getPrismaClient を呼ぶため、呼ばれた時点の代役を返す */
let currentPrisma: PrismaClient;
vi.mock('../../../db.js', () => ({
  default: () => currentPrisma,
}));

/** User-Agent の解析が失敗する経路へ到達させるため、UAParser の生成を失敗させられるようにする */
const uaParserFailure: { error: Error | null } = { error: null };
vi.mock('ua-parser-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ua-parser-js')>();
  class FailableUAParser extends actual.UAParser {
    constructor(ua?: string) {
      if (uaParserFailure.error) {
        throw uaParserFailure.error;
      }
      super(ua);
    }
  }
  return { ...actual, UAParser: FailableUAParser };
});

type Serializers = Record<string, (value: unknown) => unknown>;

/**
 * 本物のロガー（pino の設定を持つ実体）のシリアライザを、ログの第1引数へ当てて本番の JSON にする。
 * テストの共通設定（vitest.setup.ts）はロガーをモックに置き換えるため、実体は importActual で取り出す。
 * pino はシリアライザを Symbol('pino.serializers') に持つので、記号はロガー自身から説明文で引く
 */
async function serializeWithRealLogger(
  logged: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { default: realLogger } = await vi.importActual<typeof import('../../../utils/logger.js')>(
    '../../../utils/logger.js'
  );
  const serializersSym = Object.getOwnPropertySymbols(realLogger).find(
    (sym) => sym.description === 'pino.serializers'
  );
  expect(serializersSym).toBeDefined();
  const serializers = (realLogger as unknown as Record<symbol, Serializers>)[
    serializersSym as symbol
  ];
  expect(typeof serializers?.err).toBe('function');
  return JSON.parse(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(logged).map(([key, value]) => [
          key,
          serializers?.[key] ? serializers[key](value) : value,
        ])
      )
    )
  );
}

/**
 * すべてのモデル操作と $transaction が同じエラーで失敗する PrismaClient の代役
 */
function rejectingPrisma(error: unknown): PrismaClient {
  const delegate = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : vi.fn().mockRejectedValue(error)),
    }
  );
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        if (prop === '$transaction') {
          return vi.fn().mockRejectedValue(error);
        }
        return delegate;
      },
    }
  ) as unknown as PrismaClient;
}

function twoFactorService(prisma: PrismaClient): TwoFactorService {
  currentPrisma = prisma;
  return new TwoFactorService();
}

/** 2FA のログインの検証で使う、ロックされていないユーザー */
const twoFactorUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  twoFactorEnabled: true,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  userRoles: [],
};

/** 検証は失敗し、失敗回数の更新が一般の DB 例外で失敗する AuthService */
function authServiceFailingCounterUpdate(error: Error): AuthService {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(twoFactorUser),
      update: vi.fn().mockRejectedValue(error),
    },
  } as unknown as PrismaClient;
  const twoFactor = {
    verifyTOTP: vi.fn().mockResolvedValue(Ok(false)),
    verifyBackupCode: vi.fn().mockResolvedValue(Ok(false)),
  } as unknown as TwoFactorService;
  return new AuthService(
    prisma,
    {} as InvitationService,
    {} as PasswordService,
    {} as TokenService,
    twoFactor,
    {} as SessionService
  );
}

type Level = 'error' | 'warn';

/**
 * [名前, ログの水準, ログのメッセージ, 呼び出し（障害を受け取り catch へ到達させる）, 期待する message]
 * 期待する message が null のときは、呼び出しに与えた障害そのものの message を期待する
 */
type LogCase = [string, Level, string, (failure: Error) => Promise<unknown>, RegExp | null];

const dbFailure = (name: string) => new Error(`Database failure in ${name}`);

const cases: LogCase[] = [
  // two-factor（DB の失敗で到達する 7 か所）
  [
    'TwoFactorService.setupTwoFactor',
    'error',
    '2FA設定開始中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).setupTwoFactor('user-1'),
    null,
  ],
  [
    'TwoFactorService.verifyTOTP',
    'error',
    'TOTP検証中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).verifyTOTP('user-1', '000000'),
    null,
  ],
  [
    'TwoFactorService.verifyBackupCode',
    'error',
    'バックアップコード検証中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).verifyBackupCode('user-1', 'ZZZZ9999'),
    null,
  ],
  [
    'TwoFactorService.enableTwoFactor',
    'error',
    '2FA有効化中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).enableTwoFactor('user-1', '000000'),
    null,
  ],
  [
    'TwoFactorService.disableTwoFactor',
    'error',
    '2FA無効化中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).disableTwoFactor('user-1', 'password'),
    null,
  ],
  [
    'TwoFactorService.getBackupCodesStatus',
    'error',
    'バックアップコードステータス取得中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).getBackupCodesStatus('user-1'),
    null,
  ],
  [
    'TwoFactorService.regenerateBackupCodes',
    'error',
    'バックアップコード再生成中にエラーが発生しました',
    (e) => twoFactorService(rejectingPrisma(e)).regenerateBackupCodes('user-1'),
    null,
  ],
  // two-factor（暗号・QR コードの失敗で到達する 3 か所。障害はライブラリ自身が投げる）
  [
    'TwoFactorService.encryptSecret（鍵の長さが不正）',
    'error',
    'TOTP秘密鍵の暗号化に失敗しました',
    async () => {
      process.env.TWO_FACTOR_ENCRYPTION_KEY = 'abcd';
      return twoFactorService(rejectingPrisma(new Error('unused'))).encryptSecret('SECRET');
    },
    /key length/i,
  ],
  [
    'TwoFactorService.decryptSecret（形式が不正）',
    'error',
    'TOTP秘密鍵の復号化に失敗しました',
    async () =>
      twoFactorService(rejectingPrisma(new Error('unused'))).decryptSecret('not-encrypted'),
    /不正な暗号化データ形式です/,
  ],
  [
    'TwoFactorService.generateQRCode（データが QR コードの容量を超える）',
    'error',
    'QRコード生成に失敗しました',
    async () =>
      twoFactorService(rejectingPrisma(new Error('unused'))).generateQRCode(
        `${'a'.repeat(5000)}@example.com`,
        'JBSWY3DPEHPK3PXP'
      ),
    /too big/i,
  ],
  // role
  [
    'RoleService.createRole',
    'error',
    'Failed to create role',
    (e) =>
      new RoleService(rejectingPrisma(e)).createRole({
        name: 'role-x',
        description: 'desc',
        priority: 1,
      }),
    null,
  ],
  [
    'RoleService.updateRole',
    'error',
    'Failed to update role',
    (e) => new RoleService(rejectingPrisma(e)).updateRole('role-1', { description: 'desc' }),
    null,
  ],
  [
    'RoleService.deleteRole',
    'error',
    'Failed to delete role',
    (e) => new RoleService(rejectingPrisma(e)).deleteRole('role-1'),
    null,
  ],
  [
    'RoleService.getRoleById',
    'error',
    'Failed to get role',
    (e) => new RoleService(rejectingPrisma(e)).getRoleById('role-1'),
    null,
  ],
  // role-permission
  [
    'RolePermissionService.getRolePermissions',
    'error',
    'Failed to get role permissions',
    (e) => new RolePermissionService(rejectingPrisma(e)).getRolePermissions('role-1'),
    null,
  ],
  [
    'RolePermissionService.addPermissionToRole',
    'error',
    'Failed to add permission to role',
    (e) => new RolePermissionService(rejectingPrisma(e)).addPermissionToRole('role-1', 'perm-1'),
    null,
  ],
  [
    'RolePermissionService.removePermissionFromRole',
    'error',
    'Failed to remove permission from role',
    (e) =>
      new RolePermissionService(rejectingPrisma(e)).removePermissionFromRole('role-1', 'perm-1'),
    null,
  ],
  // user-role
  [
    'UserRoleService.getUserRoles',
    'error',
    'Failed to get user roles',
    (e) => new UserRoleService(rejectingPrisma(e)).getUserRoles('user-1'),
    null,
  ],
  [
    'UserRoleService.addRoleToUser',
    'error',
    'Failed to add role to user',
    (e) => new UserRoleService(rejectingPrisma(e)).addRoleToUser('user-1', 'role-1'),
    null,
  ],
  [
    'UserRoleService.removeRoleFromUser',
    'error',
    'Failed to remove role from user',
    (e) => new UserRoleService(rejectingPrisma(e)).removeRoleFromUser('user-1', 'role-1'),
    null,
  ],
  // permission
  [
    'PermissionService.createPermission',
    'error',
    'Failed to create permission',
    (e) =>
      new PermissionService(rejectingPrisma(e)).createPermission({
        resource: 'project',
        action: 'read',
        description: 'desc',
      }),
    null,
  ],
  [
    'PermissionService.getPermissionById',
    'error',
    'Failed to get permission',
    (e) => new PermissionService(rejectingPrisma(e)).getPermissionById('perm-1'),
    null,
  ],
  [
    'PermissionService.deletePermission',
    'error',
    'Failed to delete permission',
    (e) => new PermissionService(rejectingPrisma(e)).deletePermission('perm-1'),
    null,
  ],
  // session（User-Agent の解析の失敗は警告を残して元の文字列で続行する）
  [
    'SessionService.createSession（User-Agent の解析の失敗）',
    'warn',
    'Failed to parse User-Agent',
    async (e) => {
      uaParserFailure.error = e;
      const prisma = {
        refreshToken: { create: vi.fn().mockResolvedValue({}) },
      } as unknown as PrismaClient;
      return new SessionService(prisma).createSession(
        'user-1',
        'refresh-token',
        `Mozilla/5.0 ${'x'.repeat(120)}`
      );
    },
    null,
  ],
  // auth（2FA のログインの検証の失敗回数の更新の失敗）
  [
    'AuthService.verify2FA（失敗回数の更新の失敗）',
    'error',
    '2FA失敗カウンター更新に失敗',
    (e) => authServiceFailingCounterUpdate(e).verify2FA('user-1', '000000'),
    null,
  ],
  [
    'AuthService.verify2FABackupCode（失敗回数の更新の失敗）',
    'error',
    '2FA失敗カウンター更新に失敗',
    (e) => authServiceFailingCounterUpdate(e).verify2FABackupCode('user-1', 'ZZZZ9999'),
    null,
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  uaParserFailure.error = null;
  process.env.TWO_FACTOR_ENCRYPTION_KEY =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
});

describe('認証領域のサービスのログは障害を err キーに載せ、本番の JSON に message と stack を残す（タスク36.8）', () => {
  it('対照: err 以外のキーに載せた Error は本物のシリアライザを通すと message と stack を失う', async () => {
    const failure = new Error('lost in production');
    const serialized = await serializeWithRealLogger({ error: failure, updateError: failure });
    expect(serialized.error).toEqual({});
    expect(serialized.updateError).toEqual({});
  });

  it.each(cases)('%s', async (name, level, message, invoke, expectedMessage) => {
    const failure = dbFailure(name);
    await invoke(failure).catch(() => undefined);

    const calls = vi.mocked(logger[level]).mock.calls.filter(([, msg]) => msg === message);
    expect(calls).toHaveLength(1);
    const [fields] = calls[0] as unknown as [Record<string, unknown>, string];

    // 障害は err キーにだけ載り、pino のシリアライザが効かないキーには載らない
    expect(fields.err).toBeInstanceOf(Error);
    expect(fields).not.toHaveProperty('error');
    expect(fields).not.toHaveProperty('updateError');
    if (expectedMessage === null) {
      expect(fields.err).toBe(failure);
    }

    // 本物のロガーのシリアライザを当てた本番の JSON でも、障害の中身（message と stack）が残る
    const serialized = await serializeWithRealLogger(fields);
    const serializedErr = serialized.err as { message?: string; stack?: string; type?: string };
    if (expectedMessage === null) {
      expect(serializedErr.message).toBe(failure.message);
      expect(serializedErr.stack).toContain(failure.message);
    } else {
      expect(serializedErr.message).toMatch(expectedMessage);
      expect(serializedErr.stack).toEqual(expect.any(String));
    }
    expect(serializedErr.type).toEqual(expect.any(String));
  });
});
