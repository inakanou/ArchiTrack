/**
 * @fileoverview RoleServiceの単体テスト
 *
 * Requirements:
 * - 17.1-17.9: 動的ロール管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, Role } from '../../../generated/prisma/client.js';
import { RoleService } from '../../../services/role.service.js';
import { PrivilegeCeilingPolicy } from '../../../services/privilege-ceiling.js';
import { Err, Ok } from '../../../types/result.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';

// モックデータ
const mockRoleId = 'role-123';
const mockAdminRoleId = 'role-admin';

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

describe('RoleService', () => {
  let roleService: RoleService;
  let prismaMock: PrismaClient;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      role: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      userRole: {
        count: vi.fn(),
      },
      // 変更前の値の行ロックつきの読み出し（版なしの更新）
      $queryRaw: vi.fn().mockResolvedValue([mockRole]),
      // 書き込みと監査ログのトランザクション。コールバックへ同じモックをクライアントとして渡す
      $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback(prismaMock)),
    } as unknown as PrismaClient;

    roleService = new RoleService(prismaMock);
  });

  describe('createRole()', () => {
    it('新しいロールを作成できる', async () => {
      // Arrange
      const input = {
        name: 'developer',
        description: '開発者ロール',
        priority: 50,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null); // 名前重複なし
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockRoleId,
            name: 'developer',
            description: '開発者ロール',
            priority: 50,
            isSystem: false,
          })
        )
      );
      expect(prismaMock.role.findUnique).toHaveBeenCalledWith({
        where: { name: 'developer' },
        select: { id: true },
      });
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: {
          name: 'developer',
          description: '開発者ロール',
          priority: 50,
          isSystem: false,
        },
      });
    });

    it('ロール名が既に存在する場合はROLE_NAME_CONFLICTエラーを返す', async () => {
      // Arrange
      const input = {
        name: 'developer',
        description: '開発者ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole); // 名前重複

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NAME_CONFLICT', name: 'developer' }));
      expect(prismaMock.role.create).not.toHaveBeenCalled();
    });

    it('優先順位を指定しない場合はデフォルト値0が設定される', async () => {
      // Arrange
      const input = {
        name: 'viewer',
        description: '閲覧者ロール',
      };

      const roleWithDefaultPriority = {
        ...mockRole,
        name: 'viewer',
        description: '閲覧者ロール',
        priority: 0,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(roleWithDefaultPriority);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 0 })));
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ priority: 0 }),
      });
    });

    it('優先順位をカスタム値で設定できる', async () => {
      // Arrange
      const input = {
        name: 'manager',
        description: 'マネージャーロール',
        priority: 75,
      };

      const roleWithCustomPriority = {
        ...mockRole,
        name: 'manager',
        priority: 75,
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(roleWithCustomPriority);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 75 })));
    });

    it('新しいロールはisSystem=falseで作成される', async () => {
      // Arrange
      const input = {
        name: 'tester',
        description: 'テスターロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ isSystem: false })));
      expect(prismaMock.role.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isSystem: false }),
      });
    });

    it('新しいロールはデフォルトで空の権限セットを持つ', async () => {
      // Arrange
      const input = {
        name: 'contributor',
        description: '貢献者ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result.ok).toBe(true);
      // 権限は別途割り当てるため、作成時は空
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const input = {
        name: 'error-role',
        description: 'エラーテスト用ロール',
      };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockRejectedValue(new Error('Database connection failed'));

      // Act
      const result = await roleService.createRole(input);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database connection failed',
        })
      );
    });
  });

  describe('updateRole()', () => {
    it('ロール名を更新できる', async () => {
      // Arrange
      const input = { name: 'senior-developer' };
      const updatedRole = { ...mockRole, name: 'senior-developer' };

      vi.mocked(prismaMock.role.findUnique)
        .mockResolvedValueOnce(mockRole) // 存在チェック
        .mockResolvedValueOnce(null); // 名前重複チェック
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ name: 'senior-developer' })));
      expect(prismaMock.role.update).toHaveBeenCalledWith({
        where: { id: mockRoleId },
        data: { name: 'senior-developer' },
      });
    });

    it('ロール説明を更新できる', async () => {
      // Arrange
      const input = { description: '上級開発者ロール' };
      const updatedRole = { ...mockRole, description: '上級開発者ロール' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ description: '上級開発者ロール' })));
    });

    it('ロール優先順位を更新できる', async () => {
      // Arrange
      const input = { priority: 60 };
      const updatedRole = { ...mockRole, priority: 60 };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Ok(expect.objectContaining({ priority: 60 })));
    });

    it('存在しないロールの更新はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      const input = { name: 'new-name' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.updateRole('non-existent-id', input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
    });

    it('名前を変更しようとして重複する場合はROLE_NAME_CONFLICTエラーを返す', async () => {
      // Arrange
      const input = { name: 'admin' };
      const duplicateRole = { ...mockAdminRole };

      vi.mocked(prismaMock.role.findUnique)
        .mockResolvedValueOnce(mockRole) // 存在チェック
        .mockResolvedValueOnce(duplicateRole); // 名前重複チェック

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NAME_CONFLICT', name: 'admin' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
    });

    it('同じ名前で更新する場合は重複チェックをスキップする', async () => {
      // Arrange
      const input = { name: 'developer', description: '新しい説明' };
      const updatedRole = { ...mockRole, description: '新しい説明' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole); // 存在チェックのみ
      vi.mocked(prismaMock.role.update).mockResolvedValue(updatedRole);

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result.ok).toBe(true);
      // findUniqueは1回だけ呼ばれる（重複チェックはスキップされる）
      expect(prismaMock.role.findUnique).toHaveBeenCalledTimes(1);
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      const input = { description: '更新されたロール説明' };

      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockRejectedValue(new Error('Database write failed'));

      // Act
      const result = await roleService.updateRole(mockRoleId, input);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database write failed',
        })
      );
    });
  });

  describe('deleteRole()', () => {
    it('ロールを削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0); // 使用中でない
      vi.mocked(prismaMock.role.delete).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.role.delete).toHaveBeenCalledWith({
        where: { id: mockRoleId },
      });
      // 使用中の件数を数える前に、同じトランザクションでロールの行を FOR UPDATE でロックしている（タスク37.1）
      const lock = vi.mocked(prismaMock.$queryRaw);
      expect(lock).toHaveBeenCalledTimes(1);
      expect((lock.mock.calls[0]![0] as unknown as TemplateStringsArray).join('?')).toMatch(
        /FROM roles WHERE id = \? FOR UPDATE/
      );
      expect(lock.mock.calls[0]![1]).toBe(mockRoleId);
      expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(prismaMock.userRole.count).mock.invocationCallOrder[0]!
      );
    });

    it('ロックの時点でロールが削除されていればROLE_NOT_FOUNDを返す', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.$queryRaw).mockResolvedValue([]);

      const result = await roleService.deleteRole(mockRoleId);

      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.userRole.count).not.toHaveBeenCalled();
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('システムロールの削除はSYSTEM_ROLE_PROTECTEDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockAdminRole); // isSystem=true

      // Act
      const result = await roleService.deleteRole(mockAdminRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_PROTECTED' }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('使用中のロールの削除はROLE_IN_USEエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(5); // 5人のユーザーに割り当て済み

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_IN_USE', userCount: 5 }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('存在しないロールの削除はROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.deleteRole('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockRejectedValue(new Error('Database delete failed'));

      // Act
      const result = await roleService.deleteRole(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database delete failed',
        })
      );
    });
  });

  describe('listRoles()', () => {
    it('全ロールを統計情報付きで取得できる', async () => {
      // Arrange
      const rolesWithCount = [
        {
          ...mockRole,
          _count: {
            userRoles: 3,
            rolePermissions: 5,
          },
        },
        {
          ...mockAdminRole,
          _count: {
            userRoles: 1,
            rolePermissions: 1,
          },
        },
      ];

      vi.mocked(prismaMock.role.findMany).mockResolvedValue(rolesWithCount as unknown as Role[]);

      // Act
      const roles = await roleService.listRoles();

      // Assert
      expect(roles).toHaveLength(2);
      expect(roles[0]).toEqual(
        expect.objectContaining({
          id: mockRole.id,
          name: mockRole.name,
          userCount: 3,
          permissionCount: 5,
        })
      );
      expect(roles[1]).toEqual(
        expect.objectContaining({
          id: mockAdminRole.id,
          name: mockAdminRole.name,
          userCount: 1,
          permissionCount: 1,
        })
      );
    });

    it('ロールが存在しない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findMany).mockResolvedValue([]);

      // Act
      const roles = await roleService.listRoles();

      // Assert
      expect(roles).toEqual([]);
    });
  });

  describe('getRoleById()', () => {
    it('ロールIDでロールを取得できる', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);

      // Act
      const result = await roleService.getRoleById(mockRoleId);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockRoleId,
            name: 'developer',
          })
        )
      );
    });

    it('存在しないロールIDはROLE_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);

      // Act
      const result = await roleService.getRoleById('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'ROLE_NOT_FOUND' }));
    });

    it('データベースエラー時にDATABASE_ERRORを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.role.findUnique).mockRejectedValue(new Error('Database query failed'));

      // Act
      const result = await roleService.getRoleById(mockRoleId);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'DATABASE_ERROR',
          message: 'Database query failed',
        })
      );
    });
  });
  describe('監査ログ（要件22.1）', () => {
    let auditLogServiceMock: IAuditLogService;
    let auditedService: RoleService;
    const actorId = 'actor-123';
    const snapshot = {
      id: mockRoleId,
      name: 'developer',
      description: '開発者ロール',
      priority: 50,
    };

    beforeEach(() => {
      auditLogServiceMock = {
        createLog: vi.fn().mockResolvedValue({}),
        getLogs: vi.fn(),
        exportLogs: vi.fn(),
      };
      auditedService = new RoleService(prismaMock, auditLogServiceMock);
    });

    it('ロールの作成は ROLE_CREATED を作成と同じトランザクションのクライアントで記録する', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(null);
      vi.mocked(prismaMock.role.create).mockResolvedValue(mockRole);

      const result = await auditedService.createRole(
        { name: 'developer', description: '開発者ロール', priority: 50 },
        actorId
      );

      expect(result.ok).toBe(true);
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
          action: 'ROLE_CREATED',
          actorId,
          targetType: 'role',
          targetId: mockRoleId,
          before: null,
          after: snapshot,
          metadata: null,
        },
        prismaMock
      );
    });

    it('ロールの更新（版なし）は ROLE_UPDATED を変更前後の値とともに記録する', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue({ ...mockRole, priority: 60 });

      const result = await auditedService.updateRole(mockRoleId, { priority: 60 }, actorId);

      expect(result.ok).toBe(true);
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
          action: 'ROLE_UPDATED',
          actorId,
          targetType: 'role',
          targetId: mockRoleId,
          before: snapshot,
          after: { ...snapshot, priority: 60 },
          metadata: null,
        },
        prismaMock
      );
    });

    it('ロールの削除は ROLE_DELETED を削除前の値とともに記録する', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockResolvedValue(mockRole);

      const result = await auditedService.deleteRole(mockRoleId, actorId);

      expect(result).toEqual(Ok(undefined));
      expect(auditLogServiceMock.createLog).toHaveBeenCalledWith(
        {
          action: 'ROLE_DELETED',
          actorId,
          targetType: 'role',
          targetId: mockRoleId,
          before: snapshot,
          after: null,
          metadata: null,
        },
        prismaMock
      );
    });

    it('監査ログの記録に失敗すると DATABASE_ERROR を返す', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockResolvedValue(mockRole);
      vi.mocked(auditLogServiceMock.createLog).mockRejectedValue(new Error('audit write failed'));

      const result = await auditedService.deleteRole(mockRoleId, actorId);

      expect(result).toEqual(Err({ type: 'DATABASE_ERROR', message: 'audit write failed' }));
    });

    it('実行者が無ければ監査ログを記録しない', async () => {
      vi.mocked(prismaMock.role.findUnique).mockResolvedValue(mockRole);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockResolvedValue(mockRole);

      const result = await auditedService.deleteRole(mockRoleId);

      expect(result).toEqual(Ok(undefined));
      expect(auditLogServiceMock.createLog).not.toHaveBeenCalled();
    });
  });

  describe('システムロールの名前の変更の拒否（user-authentication タスク51.1）', () => {
    const actorId = 'actor-123';
    let auditLogServiceMock: IAuditLogService;
    let service: RoleService;

    /** 対象のロール（id で引く）と、名前の重複の確認（name で引く。重複なし） */
    function targetRole(role: Role): void {
      vi.mocked(prismaMock.role.findUnique).mockImplementation(((args: {
        where: { id?: string; name?: string };
      }) =>
        Promise.resolve(
          args.where.id === role.id ? role : null
        )) as unknown as typeof prismaMock.role.findUnique);
    }

    beforeEach(() => {
      auditLogServiceMock = {
        createLog: vi.fn().mockResolvedValue({}),
        getLogs: vi.fn(),
        exportLogs: vi.fn(),
      };
      service = new RoleService(
        prismaMock,
        auditLogServiceMock,
        new PrivilegeCeilingPolicy(prismaMock)
      );
    });

    it('システムロールの名前の変更を拒否し、権限チェックの失敗として監査に記録する', async () => {
      targetRole(mockAdminRole);

      const result = await service.updateRole(mockAdminRoleId, { name: 'superuser' }, actorId);

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(auditLogServiceMock.createLog).toHaveBeenCalledTimes(1);
      const [input, tx] = vi.mocked(auditLogServiceMock.createLog).mock.calls[0]!;
      expect(input).toEqual({
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'role',
        targetId: mockAdminRoleId,
        before: null,
        after: null,
        metadata: {
          reason: 'SYSTEM_ROLE_RENAME_FORBIDDEN',
          currentName: 'admin',
          requestedName: 'superuser',
        },
      });
      expect(tx).toBeUndefined();
    });

    it('楽観的ロックの版を伴う更新でもシステムロールの名前の変更を拒否する', async () => {
      targetRole(mockAdminRole);

      const result = await service.updateRole(
        mockAdminRoleId,
        { name: 'superuser', expectedUpdatedAt: mockAdminRole.updatedAt },
        actorId
      );

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_RENAME_FORBIDDEN' }));
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('システムロールでも名前を変えない更新（同じ名前と説明の変更）は受け付ける', async () => {
      targetRole(mockAdminRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue({
        ...mockAdminRole,
        description: '変更後',
      });

      const result = await service.updateRole(
        mockAdminRoleId,
        { name: 'admin', description: '変更後' },
        actorId
      );

      expect(result.ok).toBe(true);
      expect(auditLogServiceMock.createLog).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PERMISSION_CHECK_FAILED' })
      );
    });

    it('システムロールでないロールの名前の変更は受け付ける', async () => {
      targetRole(mockRole);
      vi.mocked(prismaMock.role.update).mockResolvedValue({ ...mockRole, name: 'engineer' });

      const result = await service.updateRole(mockRoleId, { name: 'engineer' }, actorId);

      expect(result.ok).toBe(true);
      expect(prismaMock.role.update).toHaveBeenCalled();
    });
  });

  describe('優先度の上限と上限より上のロールの変更・削除の拒否（user-authentication タスク58.1）', () => {
    const actorId = 'actor-58';
    let auditLogServiceMock: IAuditLogService;
    let service: RoleService;

    const role80: Role = { ...mockRole, id: 'role-80', name: 'director', priority: 80 };
    const role40: Role = { ...mockRole, id: 'role-40', name: 'member', priority: 40 };
    const role50: Role = { ...mockRole, id: 'role-50', name: 'peer', priority: 50 };

    /** 対象のロール（id で引く）、名前の重複の確認（なし）、実行者の保有ロールを与える */
    function arrange(target: Role, actorRoles: Array<{ name: string; priority: number }>): void {
      vi.mocked(prismaMock.role.findUnique).mockImplementation(((args: {
        where: { id?: string; name?: string };
      }) =>
        Promise.resolve(
          args.where.id === target.id ? target : null
        )) as unknown as typeof prismaMock.role.findUnique);
      vi.mocked(prismaMock.$queryRaw).mockResolvedValue([target] as never);
      (prismaMock.userRole as unknown as { findMany: ReturnType<typeof vi.fn> }).findMany = vi
        .fn()
        .mockResolvedValue(actorRoles.map((role) => ({ role })));
    }

    function ceilingRecord(): unknown {
      const call = vi
        .mocked(auditLogServiceMock.createLog)
        .mock.calls.find(([input]) => input.action === 'PERMISSION_CHECK_FAILED');
      return call;
    }

    beforeEach(() => {
      auditLogServiceMock = {
        createLog: vi.fn().mockResolvedValue({}),
        getLogs: vi.fn(),
        exportLogs: vi.fn(),
      };
      (prismaMock.role as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany = vi.fn();
      (
        prismaMock.role as unknown as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
      ).findUniqueOrThrow = vi.fn();
      service = new RoleService(
        prismaMock,
        auditLogServiceMock,
        new PrivilegeCeilingPolicy(prismaMock)
      );
    });

    it('上限を超える優先度への変更を拒否し、権限チェックの失敗としてトランザクションの外で記録する', async () => {
      arrange(role40, [{ name: 'manager', priority: 50 }]);

      const result = await service.updateRole(role40.id, { priority: 51 }, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
      const call = ceilingRecord() as [unknown, unknown];
      expect(call[0]).toEqual({
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'role',
        targetId: role40.id,
        before: null,
        after: null,
        metadata: {
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          currentPriority: '40',
          requestedPriority: '51',
        },
      });
      expect(call[1]).toBeUndefined();
    });

    it('上限ちょうどの優先度への変更は受け付ける', async () => {
      arrange(role40, [{ name: 'manager', priority: 50 }]);
      vi.mocked(prismaMock.role.update).mockResolvedValue({ ...role40, priority: 50 });

      const result = await service.updateRole(role40.id, { priority: 50 }, actorId);

      expect(result.ok).toBe(true);
      expect(prismaMock.role.update).toHaveBeenCalled();
      expect(ceilingRecord()).toBeUndefined();
    });

    it('現在の優先度が上限より高いロールの優先度を下げる変更を拒否する', async () => {
      arrange(role80, [{ name: 'manager', priority: 50 }]);

      const result = await service.updateRole(role80.id, { priority: 40 }, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
      expect((ceilingRecord() as [{ metadata: unknown }])[0].metadata).toEqual({
        reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
        currentPriority: '80',
        requestedPriority: '40',
      });
    });

    it('楽観的ロックの版を伴う更新でも、上限より上のロールの優先度の変更を拒否する', async () => {
      arrange(role80, [{ name: 'manager', priority: 50 }]);

      const result = await service.updateRole(
        role80.id,
        { priority: 40, expectedUpdatedAt: role80.updatedAt },
        actorId
      );

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(
        (prismaMock.role as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany
      ).not.toHaveBeenCalled();
      expect(ceilingRecord()).toBeDefined();
    });

    it('上限より上のロールでも、説明だけの変更と同じ優先度の再送は判定しない', async () => {
      arrange(role80, [{ name: 'manager', priority: 50 }]);
      vi.mocked(prismaMock.role.update).mockResolvedValue({ ...role80, description: '変更後' });

      const result = await service.updateRole(
        role80.id,
        { name: role80.name, description: '変更後', priority: 80 },
        actorId
      );

      expect(result.ok).toBe(true);
      expect(ceilingRecord()).toBeUndefined();
    });

    it('システムロールの優先度の変更は、システム管理者の実行者でも拒否する', async () => {
      arrange(mockAdminRole, [{ name: 'admin', priority: 100 }]);

      const result = await service.updateRole(mockAdminRoleId, { priority: 90 }, actorId);

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN' }));
      expect(prismaMock.role.update).not.toHaveBeenCalled();
      expect((ceilingRecord() as [{ metadata: unknown }])[0].metadata).toEqual({
        reason: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN',
        currentPriority: '100',
        requestedPriority: '90',
      });
    });

    it('システムロールの優先度の変更は上限の判定より先に拒否する（判定の順）', async () => {
      arrange(mockAdminRole, [{ name: 'manager', priority: 50 }]);

      const result = await service.updateRole(mockAdminRoleId, { priority: 40 }, actorId);

      expect(result).toEqual(Err({ type: 'SYSTEM_ROLE_PRIORITY_CHANGE_FORBIDDEN' }));
    });

    it('システムロールへ同じ優先度を再送する変更は受け付ける', async () => {
      arrange(mockAdminRole, [{ name: 'admin', priority: 100 }]);
      vi.mocked(prismaMock.role.update).mockResolvedValue({
        ...mockAdminRole,
        description: '変更後',
      });

      const result = await service.updateRole(
        mockAdminRoleId,
        { description: '変更後', priority: 100 },
        actorId
      );

      expect(result.ok).toBe(true);
      expect(ceilingRecord()).toBeUndefined();
    });

    it('上限を超える優先度のロールの作成を拒否し、要求された名前を対象として記録する', async () => {
      arrange(role50, [{ name: 'manager', priority: 50 }]);

      const result = await service.createRole(
        { name: 'senior', description: '上位', priority: 51 },
        actorId
      );

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.role.create).not.toHaveBeenCalled();
      const call = ceilingRecord() as [unknown, unknown];
      expect(call[0]).toEqual({
        action: 'PERMISSION_CHECK_FAILED',
        actorId,
        targetType: 'role',
        targetId: 'senior',
        before: null,
        after: null,
        metadata: {
          reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
          requestedName: 'senior',
          requestedPriority: '51',
        },
      });
      expect(call[1]).toBeUndefined();
    });

    it('上限ちょうどの優先度のロールと、優先度を省いた（0 の）ロールは作成できる', async () => {
      arrange(role50, [{ name: 'manager', priority: 50 }]);
      vi.mocked(prismaMock.role.create).mockResolvedValue(role50);

      const equal = await service.createRole(
        { name: 'peer', description: '同格', priority: 50 },
        actorId
      );
      const omitted = await service.createRole({ name: 'junior', description: '下位' }, actorId);

      expect(equal.ok).toBe(true);
      expect(omitted.ok).toBe(true);
      expect(prismaMock.role.create).toHaveBeenCalledTimes(2);
      expect(ceilingRecord()).toBeUndefined();
    });

    it('削除の上限の判定は、ロールの行を FOR UPDATE でロックした後に行う（判定と削除の間に優先度が変わらない）', async () => {
      arrange(role80, [{ name: 'manager', priority: 50 }]);
      const policy = new PrivilegeCeilingPolicy(prismaMock);
      const judge = vi.spyOn(policy, 'assertCanModifyRole');
      const lockedService = new RoleService(prismaMock, auditLogServiceMock, policy);

      const result = await lockedService.deleteRole(role80.id, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      const lockCall = vi
        .mocked(prismaMock.$queryRaw)
        .mock.calls.findIndex(([sql]) =>
          String((sql as unknown as string[]).join('')).includes('FOR UPDATE')
        );
      expect(lockCall).toBeGreaterThanOrEqual(0);
      const lockOrder = vi.mocked(prismaMock.$queryRaw).mock.invocationCallOrder[lockCall]!;
      expect(judge).toHaveBeenCalledTimes(1);
      expect(lockOrder).toBeLessThan(judge.mock.invocationCallOrder[0]!);
    });

    it('上限より上のロールの削除を、システムロールの保護と使用中の判定より先に拒否する', async () => {
      arrange(role80, [{ name: 'manager', priority: 50 }]);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(3);

      const result = await service.deleteRole(role80.id, actorId);

      expect(result).toEqual(Err({ type: 'ROLE_PRIORITY_EXCEEDS_ACTOR' }));
      expect(prismaMock.role.delete).not.toHaveBeenCalled();
      expect(prismaMock.userRole.count).not.toHaveBeenCalled();
      const call = ceilingRecord() as [{ metadata: unknown; targetId: string }, unknown];
      expect(call[0].targetId).toBe(role80.id);
      expect(call[0].metadata).toEqual({
        reason: 'ROLE_PRIORITY_EXCEEDS_ACTOR',
        roleName: 'director',
      });
      expect(call[1]).toBeUndefined();
    });

    it('上限以下のロールの削除は従来どおり行う', async () => {
      arrange(role50, [{ name: 'manager', priority: 50 }]);
      vi.mocked(prismaMock.$queryRaw).mockResolvedValue([{ id: role50.id }] as never);
      vi.mocked(prismaMock.userRole.count).mockResolvedValue(0);
      vi.mocked(prismaMock.role.delete).mockResolvedValue(role50);

      const result = await service.deleteRole(role50.id, actorId);

      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.role.delete).toHaveBeenCalled();
      expect(ceilingRecord()).toBeUndefined();
    });
  });
});
