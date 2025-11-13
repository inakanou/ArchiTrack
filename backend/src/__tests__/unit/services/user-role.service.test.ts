/**
 * @fileoverview UserRoleServiceの単体テスト
 *
 * Requirements:
 * - 20.1-20.9: ユーザーへのロール割り当て（マルチロール対応）
 * - 22.9: センシティブな操作（システム管理者ロールの変更）実行時のアラート通知
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, User, Role, UserRole } from '@prisma/client';
import { UserRoleService } from '../../../services/user-role.service';
import { Err, Ok } from '../../../types/result';
import type { IAuditLogService } from '../../../types/audit-log.types';
import type { IRBACService } from '../../../types/rbac.types';
import type { EmailService } from '../../../services/email.service';
import * as Sentry from '../../../utils/sentry.js';

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
  let userRoleService: UserRoleService;
  let prismaMock: PrismaClient;
  let auditLogServiceMock: IAuditLogService;
  let emailServiceMock: EmailService;
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
      },
      userRole: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        deleteMany: vi.fn(),
      },
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

    // EmailServiceモックの作成
    emailServiceMock = {
      sendAdminRoleChangedAlert: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailService;

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
      emailServiceMock
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

      // Assert
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith({
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
      });
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
      expect(emailServiceMock.sendAdminRoleChangedAlert).toHaveBeenCalledWith(
        ['admin1@example.com', 'admin2@example.com'],
        { email: mockUser.email, displayName: mockUser.displayName },
        'assigned',
        'System Administrator',
        performedBy
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Critical: System Administrator role assigned',
        'warning',
        expect.objectContaining({
          userId: mockUserId,
          userEmail: mockUser.email,
          roleId: mockAdminRoleId,
          roleName: 'admin',
          performedBy: performedBy.email,
        })
      );

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
      expect(emailServiceMock.sendAdminRoleChangedAlert).not.toHaveBeenCalled();
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

    it('最後の管理者からadminロールを削除しようとするとLAST_ADMIN_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole);
      vi.mocked(prismaMock.userRole.findFirst).mockResolvedValue({
        ...mockUserRole,
        roleId: mockAdminRoleId,
      });
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(1); // このユーザーが最後の管理者

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockAdminRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'LAST_ADMIN_PROTECTED' }));
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
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

      const sendAdminRoleChangedAlertMock = vi
        .fn()
        .mockResolvedValue({ id: 'email-job-123', status: 'queued' });
      emailServiceMock.sendAdminRoleChangedAlert = sendAdminRoleChangedAlertMock;

      // Act
      const result = await userRoleService.removeRoleFromUser(
        mockUserId,
        mockAdminRoleId,
        performedBy
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(sendAdminRoleChangedAlertMock).toHaveBeenCalledWith(
        [performedBy.email, otherAdmin.email],
        { email: mockUser.email, displayName: mockUser.displayName },
        'revoked',
        'System Administrator',
        performedBy
      );
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Critical: System Administrator role removed',
        'warning',
        expect.objectContaining({
          userId: mockUserId,
          userEmail: mockUser.email,
          roleId: mockAdminRoleId,
          roleName: 'admin',
          performedBy: performedBy.email,
        })
      );

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

      const sendAdminRoleChangedAlertMock = vi.fn();
      emailServiceMock.sendAdminRoleChangedAlert = sendAdminRoleChangedAlertMock;

      // Act
      const result = await userRoleService.removeRoleFromUser(mockUserId, mockRoleId, performedBy);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(sendAdminRoleChangedAlertMock).not.toHaveBeenCalled();
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
        performedBy
      );

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(emailServiceMock.sendAdminRoleChangedAlert).not.toHaveBeenCalled();
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
});
