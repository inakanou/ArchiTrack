/**
 * @fileoverview PermissionServiceの単体テスト
 *
 * Requirements:
 * - 18.1-18.7: 権限管理
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient, Permission } from '@prisma/client';
import { PermissionService } from '../../../services/permission.service.js';
import { Err, Ok } from '../../../types/result.js';

// モックデータ
const mockPermissionId = 'perm-123';

const mockPermission: Permission = {
  id: mockPermissionId,
  resource: 'adr',
  action: 'read',
  description: 'ADRの閲覧',
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

const mockWildcardPermission: Permission = {
  id: 'perm-wildcard',
  resource: '*',
  action: '*',
  description: '全ての権限',
  createdAt: new Date('2025-01-01T00:00:00Z'),
};

describe('PermissionService', () => {
  let permissionService: PermissionService;
  let prismaMock: PrismaClient;

  beforeEach(() => {
    // Prismaモックの作成
    prismaMock = {
      permission: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      rolePermission: {
        count: vi.fn(),
      },
    } as unknown as PrismaClient;

    permissionService = new PermissionService(prismaMock);
  });

  describe('listPermissions()', () => {
    it('全権限をリソース・アクション順で取得できる', async () => {
      // Arrange
      const permissions = [
        mockPermission,
        {
          ...mockPermission,
          id: 'perm-2',
          action: 'create',
          description: 'ADRの作成',
        },
        {
          ...mockPermission,
          id: 'perm-3',
          resource: 'user',
          action: 'read',
          description: 'ユーザーの閲覧',
        },
      ];

      vi.mocked(prismaMock.permission.findMany).mockResolvedValue(permissions);

      // Act
      const result = await permissionService.listPermissions();

      // Assert
      expect(result).toHaveLength(3);
      expect(prismaMock.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      });
    });

    it('権限が存在しない場合は空配列を返す', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findMany).mockResolvedValue([]);

      // Act
      const result = await permissionService.listPermissions();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('createPermission()', () => {
    it('新しい権限を作成できる', async () => {
      // Arrange
      const input = {
        resource: 'adr',
        action: 'read',
        description: 'ADRの閲覧',
      };

      vi.mocked(prismaMock.permission.findFirst).mockResolvedValue(null); // 重複なし
      vi.mocked(prismaMock.permission.create).mockResolvedValue(mockPermission);

      // Act
      const result = await permissionService.createPermission(input);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockPermissionId,
            resource: 'adr',
            action: 'read',
            description: 'ADRの閲覧',
          })
        )
      );
      expect(prismaMock.permission.create).toHaveBeenCalledWith({
        data: {
          resource: 'adr',
          action: 'read',
          description: 'ADRの閲覧',
        },
      });
    });

    it('既に存在する権限（resource + action）はPERMISSION_ALREADY_EXISTSエラーを返す', async () => {
      // Arrange
      const input = {
        resource: 'adr',
        action: 'read',
        description: 'ADRの閲覧',
      };

      vi.mocked(prismaMock.permission.findFirst).mockResolvedValue(mockPermission); // 重複あり

      // Act
      const result = await permissionService.createPermission(input);

      // Assert
      expect(result).toEqual(
        Err({ type: 'PERMISSION_ALREADY_EXISTS', resource: 'adr', action: 'read' })
      );
      expect(prismaMock.permission.create).not.toHaveBeenCalled();
    });

    it('不正な形式（コロンなし）はINVALID_PERMISSION_FORMATエラーを返す', async () => {
      // Arrange
      const input = {
        resource: '',
        action: '',
        description: '不正な権限',
      };

      // Act
      const result = await permissionService.createPermission(input);

      // Assert
      expect(result).toEqual(
        Err({
          type: 'INVALID_PERMISSION_FORMAT',
          message: expect.stringContaining('空'),
        })
      );
      expect(prismaMock.permission.create).not.toHaveBeenCalled();
    });

    it('リソースまたはアクションが空文字列の場合はINVALID_PERMISSION_FORMATエラーを返す', async () => {
      // Arrange
      const input1 = {
        resource: '',
        action: 'read',
        description: '不正な権限',
      };

      const input2 = {
        resource: 'adr',
        action: '',
        description: '不正な権限',
      };

      // Act
      const result1 = await permissionService.createPermission(input1);
      const result2 = await permissionService.createPermission(input2);

      // Assert
      expect(result1).toEqual(
        Err({ type: 'INVALID_PERMISSION_FORMAT', message: expect.any(String) })
      );
      expect(result2).toEqual(
        Err({ type: 'INVALID_PERMISSION_FORMAT', message: expect.any(String) })
      );
    });

    it('ワイルドカード権限（*:*, *:read, adr:*）を作成できる', async () => {
      // Arrange
      const input1 = { resource: '*', action: '*', description: '全ての権限' };
      const input2 = { resource: '*', action: 'read', description: '全リソースの閲覧' };
      const input3 = { resource: 'adr', action: '*', description: 'ADRの完全管理' };

      vi.mocked(prismaMock.permission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.permission.create)
        .mockResolvedValueOnce(mockWildcardPermission)
        .mockResolvedValueOnce({ ...mockWildcardPermission, id: 'perm-2', action: 'read' })
        .mockResolvedValueOnce({ ...mockWildcardPermission, id: 'perm-3', resource: 'adr' });

      // Act
      const result1 = await permissionService.createPermission(input1);
      const result2 = await permissionService.createPermission(input2);
      const result3 = await permissionService.createPermission(input3);

      // Assert
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result3.ok).toBe(true);
    });

    it('通常の権限（adr:read）を作成できる', async () => {
      // Arrange
      const input = {
        resource: 'user',
        action: 'create',
        description: 'ユーザーの作成',
      };

      const createdPermission = {
        ...mockPermission,
        resource: 'user',
        action: 'create',
        description: 'ユーザーの作成',
      };

      vi.mocked(prismaMock.permission.findFirst).mockResolvedValue(null);
      vi.mocked(prismaMock.permission.create).mockResolvedValue(createdPermission);

      // Act
      const result = await permissionService.createPermission(input);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            resource: 'user',
            action: 'create',
          })
        )
      );
    });
  });

  describe('deletePermission()', () => {
    it('権限を削除できる', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.count).mockResolvedValue(0); // 使用中でない
      vi.mocked(prismaMock.permission.delete).mockResolvedValue(mockPermission);

      // Act
      const result = await permissionService.deletePermission(mockPermissionId);

      // Assert
      expect(result).toEqual(Ok(undefined));
      expect(prismaMock.permission.delete).toHaveBeenCalledWith({
        where: { id: mockPermissionId },
      });
    });

    it('使用中の権限の削除はPERMISSION_IN_USEエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);
      vi.mocked(prismaMock.rolePermission.count).mockResolvedValue(3); // 3つのロールで使用中

      // Act
      const result = await permissionService.deletePermission(mockPermissionId);

      // Assert
      expect(result).toEqual(Err({ type: 'PERMISSION_IN_USE', roleCount: 3 }));
      expect(prismaMock.permission.delete).not.toHaveBeenCalled();
    });

    it('存在しない権限の削除はPERMISSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(null);

      // Act
      const result = await permissionService.deletePermission('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_FOUND' }));
      expect(prismaMock.permission.delete).not.toHaveBeenCalled();
    });
  });

  describe('getPermissionById()', () => {
    it('権限IDで権限を取得できる', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(mockPermission);

      // Act
      const result = await permissionService.getPermissionById(mockPermissionId);

      // Assert
      expect(result).toEqual(
        Ok(
          expect.objectContaining({
            id: mockPermissionId,
            resource: 'adr',
            action: 'read',
          })
        )
      );
    });

    it('存在しない権限IDはPERMISSION_NOT_FOUNDエラーを返す', async () => {
      // Arrange
      vi.mocked(prismaMock.permission.findUnique).mockResolvedValue(null);

      // Act
      const result = await permissionService.getPermissionById('non-existent-id');

      // Assert
      expect(result).toEqual(Err({ type: 'PERMISSION_NOT_FOUND' }));
    });
  });
});
