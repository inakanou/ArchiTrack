/**
 * @fileoverview UserRoleServiceの単体テスト
 *
 * Requirements:
 * - 20.1-20.9: ユーザーへのロール割り当て（マルチロール対応）
 * - 22.9: センシティブな操作（システム管理者ロールの変更）実行時のアラート通知
 *   （全システム管理者への通知の手段 AdminNotificationService を通す。user-authentication タスク49.1）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient, User, Role, UserRole } from '../../../generated/prisma/client.js';
import { UserRoleService } from '../../../services/user-role.service.js';
import { Err, Ok } from '../../../types/result.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import type { IRBACService } from '../../../types/rbac.types.js';
import type { EmailService } from '../../../services/email.service.js';
import { AdminNotificationService } from '../../../services/admin-notification.service.js';
import * as Sentry from '../../../utils/sentry.js';
import logger from '../../../utils/logger.js';

// Sentryモジュールをモック
vi.mock('../../../utils/sentry.js', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  default: {
    captureMessage: vi.fn(),
    captureException: vi.fn(),
  },
}));

// モックデータ
const mockUserId = 'user-123';
const mockRoleId = 'role-123';
const mockAdminRoleId = 'role-admin';

const mockUser: User = {
  id: mockUserId,
  email: 'test@example.com',
  displayName: 'Test User',
  passwordHash: 'hash',
  isLocked: false,
  lockedUntil: null,
  loginFailures: 0,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorFailures: 0,
  twoFactorLockedUntil: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  isActive: true,
  deactivatedAt: null,
  deactivationReason: null,
  lastLoginAt: null,
  mustChangePassword: false,
  twoFactorLastUsedStep: null,
  twoFactorPendingSecret: null,
  invitedById: null,
};

const mockRole: Role = {
  id: mockRoleId,
  name: 'developer',
  description: '開発者ロール',
  priority: 50,
  isSystem: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockAdminRole: Role = {
  id: mockAdminRoleId,
  name: 'admin',
  description: 'システム管理者',
  priority: 100,
  isSystem: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockUserRole: UserRole = {
  id: 'ur-123',
  userId: mockUserId,
  roleId: mockRoleId,
  assignedAt: new Date('2025-01-01T00:00:00Z'),
};

describe('UserRoleService', () => {
  /**
   * システム管理者ロールの変更が、有効なシステム管理者の全員へのメールと Sentry で通知されたことを確かめる
   */
  function expectRoleChangeNotified(
    recipients: string[],
    actionText: '付与' | '剥奪',
    performedBy: { email: string; displayName: string }
  ): void {
    // 宛先は admin ロールを持つ有効な利用者に限る
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, userRoles: { some: { role: { name: 'admin' } } } },
      })
    );
    const subject = `【重要】システム管理者ロール変更通知: ${mockUser.displayName}`;
    const lines = [
      `操作: システム管理者ロールの${actionText}`,
      `対象: ${mockUser.displayName} (${mockUser.email})`,
      `実行者: ${performedBy.displayName} (${performedBy.email})`,
    ];
    expect(vi.mocked(emailServiceMock.sendAdminNotificationEmail).mock.calls).toEqual(
      recipients.map((to) => [to, subject, lines])
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Admin notification: ADMIN_ROLE_CHANGED',
      'warning',
      { kind: 'ADMIN_ROLE_CHANGED', subject, lines }
    );
  }

  let userRoleService: UserRoleService;
  let prismaMock: PrismaClient;
  let auditLogServiceMock: IAuditLogService;
  let emailServiceMock: EmailService;
  let adminNotificationService: AdminNotificationService;
  let rbacServiceMock: {
    invalidateUserPermissionsCache: ReturnType<typeof vi.fn>;
    invalidateUserPermissionsCacheForRole: ReturnType<typeof vi.fn>;
    getUserPermissions: ReturnType<typeof vi.fn>;
    checkPermission: ReturnType<typeof vi.fn>;
    hasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      role: {
        findUnique: vi.fn(),
        // 一括削除が admin ロールを含むかの確認（既定は含まない）
        findFirst: vi.fn().mockResolvedValue(null),
      },
      userRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
      // 最後の管理者の判定の前に取る admin ロールの行のロック（SELECT ... FOR NO KEY UPDATE）
      $queryRaw: vi.fn().mockResolvedValue([]),
      // 利用者の削除の前に取るリフレッシュトークンの取引ロック（pg_advisory_xact_lock）
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn((callback) => callback(prismaMock)),
    } as unknown as PrismaClient;

    // AuditLogServiceモックの作成
    auditLogServiceMock = {
      createLog: vi.fn().mockResolvedValue({
        id: 'audit-log-123',
        action: 'USER_ROLE_ASSIGNED',
        actorId: 'actor-123',
        targetType: 'user-role',
        targetId: mockUserId,
        before: null,
        after: null,
        metadata: null,
        createdAt: new Date(),
      }),
      getLogs: vi.fn(),
      exportLogs: vi.fn(),
    };

    // EmailServiceモックの作成（全システム管理者への通知のメールの投入）
    emailServiceMock = {
      sendAdminNotificationEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;
    adminNotificationService = new AdminNotificationService(prismaMock, emailServiceMock);

    // Sentryモックのクリア
    vi.clearAllMocks();

    // RBACServiceモックの作成
    rbacServiceMock = {
      invalidateUserPermissionsCache: vi.fn().mockResolvedValue(undefined),
      invalidateUserPermissionsCacheForRole: vi.fn().mockResolvedValue(undefined),
      getUserPermissions: vi.fn(),
      checkPermission: vi.fn(),
      hasPermission: vi.fn(),
    };

    userRoleService = new UserRoleService(
      prismaMock,
      rbacServiceMock as unknown as IRBACService,
      auditLogServiceMock,
      adminNotificationService
    );
  });

  describe('addRoleToUser()', () => {
    it('ユーザーにロールを追加できる', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null); // 重複なし
      vi.mocked(prismaMock.userRole.create).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId, 'actor-123');

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.userRole.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          roleId: mockRoleId,
        },
      });
    });

    it('既にロールが割り当てられている場合はスキップする（重複を無視）', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole); // 既に存在

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined)); // エラーにならずスキップ
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });

    it('ユーザーが存在しない場合はUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });

    it('ロールが存在しない場合はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId, 'actor-123');

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    });

    it('ロール追加時に監査ログを記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.userRole.create).mockResolvedValue(mockUserRole);

      // Act
      await userRoleService.addRoleToUser(mockUserId, mockRoleId, actorId);

      // Assert（監査ログは紐付けと同じトランザクションのクライアントで記録する）
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
          action: 'USER_ROLE_ASSIGNED',
          actorId,
          targetType: 'user-role',
          targetId: mockUserId,
          before: null,
          after: {
            userId: mockUserId,
            userEmail: mockUser.email,
            roleId: mockRoleId,
            roleName: mockRole.name,
          },
          metadata: null,
        },
        prismaMock
      );
    });

    it('システム管理者ロール追加時にメールアラートとSentryアラートを送信する', async () => {
      // Arrange
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const actorId = 'actor-123';
      const mockAdminUsers = [
        { ...mockUser, id: 'admin-1', email: 'admin1@example.com', displayName: 'Admin 1' },
        { ...mockUser, id: 'admin-2', email: 'admin2@example.com', displayName: 'Admin 2' },
      ];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.userRole.create).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue(mockAdminUsers as User[]);

      // Act
      const performedBy = { email: 'performer@example.com', displayName: 'Performer' };
      await userRoleService.addRoleToUser(mockUserId, mockAdminRoleId, actorId, performedBy);

      // Assert
      expectRoleChangeNotified(['admin1@example.com', 'admin2@example.com'], '付与', performedBy);

      // Cleanup
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('テスト環境（NODE_ENV=test）ではシステム管理者ロール追加時にアラートを送信しない', async () => {
      // Arrange
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const actorId = 'actor-123';
      const mockAdminUsers = [
        { ...mockUser, id: 'admin-1', email: 'admin1@example.com', displayName: 'Admin 1' },
      ];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.userRole.create).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue(mockAdminUsers as User[]);

      // モックのリセット
      vi.clearAllMocks();

      // Act
      const performedBy = { email: 'performer@example.com', displayName: 'Performer' };
      await userRoleService.addRoleToUser(mockUserId, mockAdminRoleId, actorId, performedBy);

      // Assert
      expect(emailServiceMock.sendAdminNotificationEmail).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();

      // Cleanup
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.userRole.create).mockRejectedValue(
        new Error('Database connection lost')
      );

      // Act
      const result = await userRoleService.addRoleToUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database connection lost',
        })
      );
    });
  });

  describe('removeRoleFromUser()', () => {
    it('ユーザーからロールを削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { id: mockUserRole.id },
      });
    });

    it('ロール削除時に監査ログ（USER_ROLE_REVOKED）を紐付けと同じトランザクションで記録する', async () => {
      // Arrange
      const actorId = 'actor-123';
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId, actorId);

      // Assert（監査ログは紐付けの削除と同じトランザクションのクライアントで記録する）
      expect(result).toEqual(Ok(undefined));
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
          action: 'USER_ROLE_REVOKED',
          actorId,
          targetType: 'user-role',
          targetId: mockUserId,
          before: {
            userId: mockUserId,
            userEmail: mockUser.email,
            roleId: mockRoleId,
            roleName: mockRole.name,
          },
          after: null,
          metadata: null,
        },
        prismaMock
      );
    });

    it('最後の管理者からadminロールを削除しようとするとLAST_ADMIN_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0); // このユーザー以外に有効な管理者がいない

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockAdminRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'LAST_ADMIN_PROTECTED' }));
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
      // 件数を数える前に admin ロールの行をロックしている（並行する削除との直列化）
      const lock = vi.mocked(prismaMock.$queryRaw);
      expect(lock).toHaveBeenCalledTimes(1);
      expect((lock.mock.calls[0]![0] as TemplateStringsArray).join('?')).toMatch(
        /FROM roles WHERE id = \? FOR NO KEY UPDATE/
      );
      expect(lock.mock.calls[0]![1]).toBe(mockAdminRoleId);
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(prismaMock.userRole.count).mock.invocationCallOrder[0]!
      );
    });

    it('紐付けが存在しない場合はASSIGNMENT_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ASSIGNMENT_NOT_FOUND' }));
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.delete).mockRejectedValue(new Error('Database write failed'));

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database write failed',
        })
      );
    });

    it('システム管理者ロール削除時にメールアラートとSentryアラートを送信する', async () => {
      // Arrange
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const performedBy = { email: 'admin@example.com', displayName: 'Admin User' };
      const otherAdmin = { email: 'admin2@example.com', displayName: 'Admin 2' };

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue([
        { email: performedBy.email, displayName: performedBy.displayName } as User,
        { email: otherAdmin.email, displayName: otherAdmin.displayName } as User,
      ]);

      // Act
      const result = await userRoleService.removeRoleFromUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expectRoleChangeNotified([performedBy.email, otherAdmin.email], '剥奪', performedBy);

      // Cleanup
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('通常のロール削除時にはアラート通知を送信しない', async () => {
      // Arrange
      const performedBy = { email: 'admin@example.com', displayName: 'Admin User' };

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole); // 通常のロール（admin以外）
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.removeRoleFromUser(
        mockUserId,
        mockRoleId,
        'actor-123',
        performedBy
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(emailServiceMock.sendAdminNotificationEmail).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('テスト環境（NODE_ENV=test）ではシステム管理者ロール削除時にアラートを送信しない', async () => {
      // Arrange
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const performedBy = { email: 'admin@example.com', displayName: 'Admin User' };
      const otherAdmin = { ...mockUser, id: 'other-admin', email: 'other@example.com' };

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他に1人管理者がいる
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue([
        { ...mockUser, email: performedBy.email, displayName: performedBy.displayName },
        { ...otherAdmin },
      ] as User[]);

      // モックのリセット
      vi.clearAllMocks();

      // Act
      const result = await userRoleService.removeRoleFromUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(emailServiceMock.sendAdminNotificationEmail).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();

      // Cleanup
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('getUserRoles()', () => {
    it('ユーザーのロール一覧を取得できる', async () => {
      // Arrange
      const userRolesWithRole = [
        {
          ...mockUserRole,
          role: mockRole,
        },
      ];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue(
        userRolesWithRole as unknown as UserRole[]
      );

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(
        Ok([
          expect.objectContaining({
            roleId: mockRoleId,
            name: 'developer',
            description: '開発者ロール',
            priority: 50,
            isSystem: false,
          }),
        ])
      );
    });

    it('ユーザーが存在しない場合はUSER_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
    });

    it('ロールが割り当てられていない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.userRole.findMany).mockResolvedValue([]);

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(Ok([]));
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.userRole.findMany).mockRejectedValue(new Error('Database query failed'));

      // Act
      const result = await userRoleService.getUserRoles(mockUserId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database query failed',
        })
      );
    });
  });

  describe('addRolesToUser()', () => {
    it('複数のロールを一括でユーザーに追加できる', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456', 'role-789'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.addRolesToUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
    });

    it('途中でユーザーが見つからない場合は即座にエラーを返す', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null); // ユーザーが存在しない

      // Act
      const result = await userRoleService.addRolesToUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
    });

    it('途中でロールが見つからない場合は即座にエラーを返す', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null); // ロールが存在しない

      // Act
      const result = await userRoleService.addRolesToUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });
  });

  describe('removeRolesFromUser()', () => {
    it('複数のロールを一括でユーザーから削除できる', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在

      // Act
      const result = await userRoleService.removeRolesFromUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
    });

    it('admin ロールを含む一括削除は、どの紐付けを削除するよりも先に admin ロールの行をロックする', async () => {
      // Arrange: 先に一般ロール、後に admin ロールを削除する（ロックがループ内だけだと一般ロールの削除が先になる）
      const roleIds = [mockRoleId, mockAdminRoleId];
      vi.mocked(prismaMock.role.findFirst).mockResolvedValue({ id: mockAdminRoleId } as Role);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique)
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2); // 他にもadminユーザーが存在

      // Act
      const result = await userRoleService.removeRolesFromUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.role.findFirst).toHaveBeenCalledWith({
        where: { id: { in: roleIds }, name: 'admin' },
        select: { id: true },
      });
      const lock = vi.mocked(prismaMock.$queryRaw);
      expect(lock).toHaveBeenCalled();
      expect(lock.mock.calls[0]![1]).toBe(mockAdminRoleId);
      const deleteCalls = vi.mocked(prismaMock.userRole.delete).mock.invocationCallOrder;
      expect(deleteCalls).toHaveLength(2);
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(deleteCalls[0]!);
    });

    it('途中でユーザーが見つからない場合は即座にエラーを返す', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null); // ユーザーが存在しない

      // Act
      const result = await userRoleService.removeRolesFromUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Err({ type: 'USER_NOT_FOUND' }));
    });

    it('途中で紐付けが見つからない場合は即座にエラーを返す', async () => {
      // Arrange
      const roleIds = [mockRoleId, 'role-456'];

      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null); // 紐付けが存在しない

      // Act
      const result = await userRoleService.removeRolesFromUser(mockUserId, roleIds);

      // Assert
      expect(result).toEqual(Err({ type: 'ASSIGNMENT_NOT_FOUND' }));
    });
  });

  describe('deleteUser() の権限キャッシュの無効化（タスク36.2）', () => {
    beforeEach(() => {
      const tx = prismaMock as unknown as Record<string, unknown>;
      tx.invitation = { deleteMany: vi.fn(), updateMany: vi.fn() };
      (tx.user as Record<string, unknown>).delete = vi.fn();
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
    });

    it('削除をコミットした後に、削除したユーザーの権限キャッシュを無効化する', async () => {
      const order: string[] = [];
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: 'deleted@example.com',
        userRoles: [],
      } as unknown as never);
      vi.mocked(prismaMock.$transaction).mockImplementation((async (
        callback: (tx: PrismaClient) => Promise<unknown>
      ) => {
        const value = await callback(prismaMock);
        order.push('commit');
        return value;
      }) as never);
      rbacServiceMock.invalidateUserPermissionsCache.mockImplementation(async () => {
        order.push('invalidate');
      });

      const result = await userRoleService.deleteUser(mockUserId);

      expect(result.ok).toBe(true);
      expect(rbacServiceMock.invalidateUserPermissionsCache).toHaveBeenCalledWith(mockUserId);
      expect(order).toEqual(['commit', 'invalidate']);
    });

    it('リフレッシュトークンの取引ロックを、その利用者で取ってから users の行を消す（タスク45.2）', async () => {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: 'deleted@example.com',
        userRoles: [],
      } as unknown as never);
      const executeRaw = (prismaMock as unknown as { $executeRaw: ReturnType<typeof vi.fn> })
        .$executeRaw;
      const userDelete = (prismaMock.user as unknown as { delete: ReturnType<typeof vi.fn> })
        .delete;

      const result = await userRoleService.deleteUser(mockUserId);

      expect(result.ok).toBe(true);
      expect(executeRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = executeRaw.mock.calls[0]!;
      expect((strings as string[]).join('?')).toContain('pg_advisory_xact_lock');
      expect(values).toContain(mockUserId);
      expect(userDelete).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(executeRaw.mock.invocationCallOrder[0]!).toBeLessThan(
        userDelete.mock.invocationCallOrder[0]!
      );
    });

    it('ユーザーが存在しないときは無効化しない', async () => {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      const result = await userRoleService.deleteUser(mockUserId);

      expect(result.ok).toBe(false);
      expect(rbacServiceMock.invalidateUserPermissionsCache).not.toHaveBeenCalled();
    });

    /**
     * 削除の直後の利用者のアクセストークンを、状態のキャッシュ（TTL 60 秒）の残りで通さない。
     * 認証ミドルウェアは状態の不在（null）を 401 にする（user-authentication タスク47.6）
     */
    it('削除をコミットした後に、削除したユーザーの状態のキャッシュを無効化する', async () => {
      const order: string[] = [];
      const invalidate = vi.fn(async () => {
        order.push('invalidate-state');
      });
      const service = new UserRoleService(
        prismaMock,
        rbacServiceMock as unknown as IRBACService,
        auditLogServiceMock,
        adminNotificationService,
        { invalidate }
      );
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: 'deleted@example.com',
        userRoles: [],
      } as unknown as never);
      vi.mocked(prismaMock.$transaction).mockImplementation((async (
        callback: (tx: PrismaClient) => Promise<unknown>
      ) => {
        const value = await callback(prismaMock);
        order.push('commit');
        return value;
      }) as never);

      const result = await service.deleteUser(mockUserId);

      expect(result.ok).toBe(true);
      expect(invalidate).toHaveBeenCalledWith(mockUserId);
      expect(order).toEqual(['commit', 'invalidate-state']);
    });

    it('削除が業務上の理由で行われないときは状態のキャッシュを無効化しない', async () => {
      const invalidate = vi.fn();
      const service = new UserRoleService(
        prismaMock,
        rbacServiceMock as unknown as IRBACService,
        auditLogServiceMock,
        adminNotificationService,
        { invalidate }
      );
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(null);

      const result = await service.deleteUser(mockUserId);

      expect(result.ok).toBe(false);
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  /**
   * 最後の管理者の判定は有効な（is_active=true）システム管理者の数で行う（user-authentication 要件36.5）。
   * 無効化された管理者を数えると、有効な管理者が 0 人になる解除・削除を通してしまう
   */
  describe('最後の管理者の判定は無効化された管理者を数えない', () => {
    const adminAssignment = { ...mockUserRole, roleId: mockAdminRoleId };

    beforeEach(() => {
      const tx = prismaMock as unknown as Record<string, unknown>;
      tx.invitation = { deleteMany: vi.fn(), updateMany: vi.fn() };
      (tx.user as Record<string, unknown>).delete = vi.fn();
    });

    it('admin ロールの解除は有効な管理者だけを数え、対象者以外に有効な管理者がいなければ LAST_ADMIN_PROTECTED を返す', async () => {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(adminAssignment);
      // 対象者以外に有効な管理者がいない（無効化された管理者の紐付けは数えない）
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);

      const result = await userRoleService.removeRoleFromUser(mockUserId, mockAdminRoleId);

      expect(result).toEqual(Err({ type: 'LAST_ADMIN_PROTECTED' }));
      expect(prismaMock.userRole.count).toHaveBeenCalledWith({
        where: { roleId: mockAdminRoleId, userId: { not: mockUserId }, user: { isActive: true } },
      });
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it('無効化された管理者からの admin ロールの解除は、残る管理者の紐付けが無くても許す', async () => {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({ ...mockUser, isActive: false });
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(adminAssignment);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue(adminAssignment);
      // 対象者以外に有効な管理者がいない（解除しても有効な管理者の数は変わらない）
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);

      const result = await userRoleService.removeRoleFromUser(mockUserId, mockAdminRoleId);

      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { id: adminAssignment.id },
      });
    });

    it('管理者の削除は有効な管理者だけを数え、対象者以外に有効な管理者がいなければ LAST_ADMIN_PROTECTED を返す', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: mockUser.email,
        isActive: true,
        userRoles: [{ roleId: mockAdminRoleId }],
      } as unknown as never);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      const userDelete = (prismaMock.user as unknown as { delete: ReturnType<typeof vi.fn> })
        .delete;

      const result = await userRoleService.deleteUser(mockUserId);

      expect(result).toEqual(Err({ type: 'LAST_ADMIN_PROTECTED' }));
      expect(prismaMock.userRole.count).toHaveBeenCalledWith({
        where: { roleId: mockAdminRoleId, userId: { not: mockUserId }, user: { isActive: true } },
      });
      // 件数を数える前に admin ロールの行をロックしている
      expect(vi.mocked(prismaMock.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(prismaMock.userRole.count).mock.invocationCallOrder[0]!
      );
      expect(userDelete).not.toHaveBeenCalled();
    });

    it('無効化された管理者の削除は、残る管理者の紐付けが無くても許す', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: mockUser.email,
        isActive: false,
        userRoles: [{ roleId: mockAdminRoleId }],
      } as unknown as never);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      const userDelete = (prismaMock.user as unknown as { delete: ReturnType<typeof vi.fn> })
        .delete;

      const result = await userRoleService.deleteUser(mockUserId);

      expect(result).toEqual(Ok({ email: mockUser.email }));
      expect(userDelete).toHaveBeenCalledWith({ where: { id: mockUserId } });
    });
  });

  describe('hasUserRole()', () => {
    it('ユーザーがロールを持っている場合trueを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(mockUserRole);

      // Act
      const result = await userRoleService.hasUserRole(mockUserId, mockRoleId);

      // Assert
      expect(result).toBe(true);
    });

    it('ユーザーがロールを持っていない場合falseを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);

      // Act
      const result = await userRoleService.hasUserRole(mockUserId, mockRoleId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('コミット後の処理の失敗（タスク37.2）', () => {
    const performedBy = { email: 'performer@example.com', displayName: 'Performer' };
    let originalNodeEnv: typeof process.env.NODE_ENV;

    beforeEach(() => {
      // アラートは NODE_ENV=test で抑制されるため、本物の経路へ到達させる
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      vi.mocked(logger.warn).mockClear();
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    /** admin ロールの割り当てがコミットまで進む状態にする */
    function arrangeAdminAssignment(): void {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.userRole.create).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue([
        { email: 'admin1@example.com', displayName: 'Admin 1' } as User,
      ]);
    }

    function warningsOf(message: string): unknown[][] {
      return vi.mocked(logger.warn).mock.calls.filter(([, logged]) => logged === message);
    }

    function alertWarnings(): unknown[][] {
      return warningsOf('Failed to send admin role change alert');
    }

    it('アラートの送信が投げても成功を返し、無効化はアラートより先に行う', async () => {
      arrangeAdminAssignment();
      const failure = new Error('alert delivery failed');
      vi.mocked(emailServiceMock.sendAdminNotificationEmail).mockRejectedValue(failure);

      const result = await userRoleService.addRoleToUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      expect(result).toEqual(Ok(undefined));
      expect(rbacServiceMock.invalidateUserPermissionsCache).toHaveBeenCalledWith(mockUserId);
      expect(emailServiceMock.sendAdminNotificationEmail).toHaveBeenCalledTimes(1);
      expect(
        rbacServiceMock.invalidateUserPermissionsCache.mock.invocationCallOrder[0]!
      ).toBeLessThan(
        vi.mocked(emailServiceMock.sendAdminNotificationEmail).mock.invocationCallOrder[0]!
      );
      // 送信の失敗は通知の手段が警告ログに留め、呼び出し元へ伝えない
      expect(warningsOf('Failed to queue admin notification email')).toEqual([
        [
          { err: failure, kind: 'ADMIN_ROLE_CHANGED', failedCount: 1, recipientCount: 1 },
          'Failed to queue admin notification email',
        ],
      ]);
      expect(alertWarnings()).toEqual([]);
    });

    it('管理者の一覧の取得（prisma.user.findMany）が投げても成功を返し、キャッシュを無効化する', async () => {
      arrangeAdminAssignment();
      const failure = new Error('Connection terminated');
      vi.mocked(prismaMock.user.findMany).mockRejectedValue(failure);

      const result = await userRoleService.addRoleToUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      expect(result).toEqual(Ok(undefined));
      expect(rbacServiceMock.invalidateUserPermissionsCache).toHaveBeenCalledWith(mockUserId);
      expect(emailServiceMock.sendAdminNotificationEmail).not.toHaveBeenCalled();
      const warnings = warningsOf('Failed to look up system administrators for notification');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]![0]).toMatchObject({ err: failure, kind: 'ADMIN_ROLE_CHANGED' });
    });

    it('Sentry への通知が投げても、解除は成功を返しキャッシュを無効化する', async () => {
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(2);
      vi.mocked(prismaMock.userRole.delete).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.user.findMany).mockResolvedValue([
        { email: 'admin1@example.com', displayName: 'Admin 1' } as User,
      ]);
      const failure = new Error('sentry transport failed');
      vi.mocked(Sentry.captureMessage).mockImplementationOnce(() => {
        throw failure;
      });

      const result = await userRoleService.removeRoleFromUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      expect(result).toEqual(Ok(undefined));
      expect(rbacServiceMock.invalidateUserPermissionsCache).toHaveBeenCalledWith(mockUserId);
      // Sentry の失敗はメールの投入を止めない
      expect(emailServiceMock.sendAdminNotificationEmail).toHaveBeenCalledTimes(1);
      expect(warningsOf('Failed to send admin notification to error monitoring')).toEqual([
        [
          { err: failure, kind: 'ADMIN_ROLE_CHANGED' },
          'Failed to send admin notification to error monitoring',
        ],
      ]);
    });

    it('通知の手段そのものが投げても成功を返し、警告ログに留める', async () => {
      arrangeAdminAssignment();
      const failure = new Error('notifier crashed');
      const notifyAllAdmins = vi.fn().mockRejectedValue(failure);
      const service = new UserRoleService(
        prismaMock,
        rbacServiceMock as unknown as IRBACService,
        auditLogServiceMock,
        { notifyAllAdmins }
      );

      const result = await service.addRoleToUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      expect(result).toEqual(Ok(undefined));
      expect(notifyAllAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'ADMIN_ROLE_CHANGED' })
      );
      expect(alertWarnings()).toEqual([
        [
          { err: failure, userId: mockUserId, roleId: mockAdminRoleId, action: 'assigned' },
          'Failed to send admin role change alert',
        ],
      ]);
    });

    it('無効化が投げても成功を返し、警告ログを残してアラートを送る', async () => {
      arrangeAdminAssignment();
      const failure = new Error('cache down');
      rbacServiceMock.invalidateUserPermissionsCache.mockRejectedValue(failure);

      const result = await userRoleService.addRoleToUser(
        mockUserId,
        mockAdminRoleId,
        'actor-123',
        performedBy
      );

      expect(result).toEqual(Ok(undefined));
      expect(emailServiceMock.sendAdminNotificationEmail).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        { err: failure, userId: mockUserId },
        'Failed to invalidate permission cache after commit'
      );
    });
  });
});
