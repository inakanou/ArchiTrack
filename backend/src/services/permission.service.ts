/**
 * @fileoverview 権限管理サービス
 *
 * Requirements:
 * - 18.1-18.7: 権限管理
 *
 * Design Patterns:
 * - Validation: resource:action形式の検証
 * - Business Rule Enforcement: 重複チェック、使用中チェック
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IPermissionService,
  CreatePermissionInput,
  PermissionInfo,
  PermissionError,
} from '../types/permission.types.js';
import { Ok, Err, type Result } from '../types/result.js';
import logger from '../utils/logger.js';

/**
 * 権限管理サービスの実装
 */
export class PermissionService implements IPermissionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 全権限一覧を取得
   *
   * リソース・アクション順でソート
   *
   * @returns 権限一覧（リソース・アクション順）
   */
  async listPermissions(): Promise<PermissionInfo[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    return permissions.map((permission) => ({
      id: permission.id,
      resource: permission.resource,
      action: permission.action,
      description: permission.description,
      createdAt: permission.createdAt,
    }));
  }

  /**
   * 新しい権限を作成
   *
   * ビジネスルール:
   * - resource:action形式の検証
   * - resource + action の組み合わせは一意である必要がある
   * - ワイルドカード（*）を許可
   *
   * @param input - 権限作成入力
   * @returns 作成された権限情報またはエラー
   */
  async createPermission(
    input: CreatePermissionInput
  ): Promise<Result<PermissionInfo, PermissionError>> {
    try {
      // 形式検証
      const validationError = this.validatePermissionFormat(input.resource, input.action);
      if (validationError) {
        return Err({ type: 'INVALID_PERMISSION_FORMAT', message: validationError });
      }

      // 重複チェック（resource + action）
      const existingPermission = await this.prisma.permission.findFirst({
        where: {
          resource: input.resource,
          action: input.action,
        },
      });

      if (existingPermission) {
        logger.warn(
          { resource: input.resource, action: input.action },
          'Permission already exists'
        );
        return Err({
          type: 'PERMISSION_ALREADY_EXISTS',
          resource: input.resource,
          action: input.action,
        });
      }

      // 権限作成
      const permission = await this.prisma.permission.create({
        data: {
          resource: input.resource,
          action: input.action,
          description: input.description,
        },
      });

      logger.info(
        { permissionId: permission.id, resource: permission.resource, action: permission.action },
        'Permission created successfully'
      );

      return Ok({
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        createdAt: permission.createdAt,
      });
    } catch (error) {
      logger.error({ error, input }, 'Failed to create permission');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 権限IDで権限を取得
   *
   * @param permissionId - 権限ID
   * @returns 権限情報またはエラー
   */
  async getPermissionById(permissionId: string): Promise<Result<PermissionInfo, PermissionError>> {
    try {
      const permission = await this.prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!permission) {
        logger.debug({ permissionId }, 'Permission not found');
        return Err({ type: 'PERMISSION_NOT_FOUND' });
      }

      return Ok({
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        createdAt: permission.createdAt,
      });
    } catch (error) {
      logger.error({ error, permissionId }, 'Failed to get permission');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 権限を削除
   *
   * ビジネスルール:
   * - 権限が存在する必要がある
   * - 少なくとも1つのロールに割り当てられている場合は削除不可
   *
   * @param permissionId - 権限ID
   * @returns 成功またはエラー
   */
  async deletePermission(permissionId: string): Promise<Result<void, PermissionError>> {
    try {
      // 権限の存在チェック
      const existingPermission = await this.prisma.permission.findUnique({
        where: { id: permissionId },
      });

      if (!existingPermission) {
        logger.warn({ permissionId }, 'Permission not found');
        return Err({ type: 'PERMISSION_NOT_FOUND' });
      }

      // 使用中チェック（ロールに割り当てられているか）
      const roleCount = await this.prisma.rolePermission.count({
        where: { permissionId },
      });

      if (roleCount > 0) {
        logger.warn(
          {
            permissionId,
            resource: existingPermission.resource,
            action: existingPermission.action,
            roleCount,
          },
          'Cannot delete permission in use'
        );
        return Err({ type: 'PERMISSION_IN_USE', roleCount });
      }

      // 権限削除
      await this.prisma.permission.delete({
        where: { id: permissionId },
      });

      logger.info(
        {
          permissionId,
          resource: existingPermission.resource,
          action: existingPermission.action,
        },
        'Permission deleted successfully'
      );

      return Ok(undefined);
    } catch (error) {
      logger.error({ error, permissionId }, 'Failed to delete permission');
      return Err({
        type: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * 権限形式の検証
   *
   * 検証ルール:
   * - resource と action は空文字列でない
   * - ワイルドカード（*）を許可
   *
   * @param resource - リソースタイプ
   * @param action - アクション
   * @returns エラーメッセージ（検証成功時はnull）
   */
  private validatePermissionFormat(resource: string, action: string): string | null {
    if (!resource || resource.trim() === '') {
      return 'リソースタイプは空にできません';
    }

    if (!action || action.trim() === '') {
      return 'アクションは空にできません';
    }

    // ワイルドカード（*）は許可
    // 通常の文字列も許可
    return null;
  }
}
