/**
 * @fileoverview システムの設定のサービスの単体テスト（タスク116.1）
 *
 * design の章「Requirements 43-50」の D8。外部の AI での読み取りの設定の読み（行が無いときは有効）、
 * 楽観的排他による変更、変更と同じトランザクションでの監査（OPERATIONAL_SETTING_CHANGED の before・after）を主張する。
 *
 * @requirement estimate-request/REQ-49.5 管理者が外部 AI の読み取りを止め・戻し、その変更が監査に残る
 *
 * @module __tests__/unit/services/system-setting.service.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  SystemSettingService,
  EXTERNAL_AI_READING_SETTING_KEY,
  SYSTEM_SETTING_TARGET_TYPE,
} from '../../../services/system-setting.service.js';
import { SystemSettingConflictError } from '../../../errors/systemSettingError.js';

interface SettingRow {
  key: string;
  value: unknown;
  version: number;
  updatedById: string | null;
  updatedAt: Date;
}

function createMocks() {
  const tx = {
    systemSetting: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    systemSetting: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const auditLogService = {
    createLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const service = new SystemSettingService({
    prisma: prisma as unknown as PrismaClient,
    auditLogService: auditLogService as unknown as IAuditLogService,
  });
  return { tx, prisma, auditLogService, service };
}

function row(enabled: unknown, version: number): SettingRow {
  return {
    key: EXTERNAL_AI_READING_SETTING_KEY,
    value: { enabled },
    version,
    updatedById: 'someone',
    updatedAt: new Date('2026-11-08T00:00:00Z'),
  };
}

describe('SystemSettingService（外部の AI での読み取りの設定）', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  describe('getExternalAiReading', () => {
    it('設定の行がまだ無いときは有効・版 0 として読む', async () => {
      mocks.prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
        enabled: true,
        version: 0,
      });
      expect(mocks.prisma.systemSetting.findUnique).toHaveBeenCalledWith({
        where: { key: 'externalAiReading' },
      });
    });

    it('止めた行は無効として版とともに読む', async () => {
      mocks.prisma.systemSetting.findUnique.mockResolvedValue(row(false, 3));

      await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
        enabled: false,
        version: 3,
      });
    });

    it('有効の行は有効として読む', async () => {
      mocks.prisma.systemSetting.findUnique.mockResolvedValue(row(true, 4));

      await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
        enabled: true,
        version: 4,
      });
    });

    it.each([
      ['enabled が文字列の "false"', { enabled: 'false' }],
      ['enabled が文字列の "true"', { enabled: 'true' }],
      ['enabled が null', { enabled: null }],
      ['enabled が無い', {}],
      ['値が配列', [true]],
      ['値が null', null],
      ['値が数', 1],
    ])(
      '行はあるが値が壊れている（%s）ときは止めた側に倒して無効として読む',
      async (_label, value) => {
        mocks.prisma.systemSetting.findUnique.mockResolvedValue({
          ...row(true, 7),
          value,
        });

        await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
          enabled: false,
          version: 7,
        });
      }
    );

    it('キャッシュを持たず、読むたびに行を読み直す', async () => {
      mocks.prisma.systemSetting.findUnique
        .mockResolvedValueOnce(row(true, 1))
        .mockResolvedValueOnce(row(false, 2));

      await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
        enabled: true,
        version: 1,
      });
      await expect(mocks.service.getExternalAiReading()).resolves.toEqual({
        enabled: false,
        version: 2,
      });
      expect(mocks.prisma.systemSetting.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('setExternalAiReading', () => {
    it('行が無く版 0 を送ると、行を作って止め、同じトランザクションで before・after を監査に記録する', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(null);
      mocks.tx.systemSetting.create.mockResolvedValue(row(false, 1));

      const result = await mocks.service.setExternalAiReading(false, 0, 'admin-1');

      expect(result).toEqual({ enabled: false, version: 1 });
      expect(mocks.tx.systemSetting.create).toHaveBeenCalledWith({
        data: {
          key: 'externalAiReading',
          value: { enabled: false },
          version: 1,
          updatedById: 'admin-1',
        },
      });
      expect(mocks.auditLogService.createLog).toHaveBeenCalledTimes(1);
      expect(mocks.auditLogService.createLog).toHaveBeenCalledWith(
        {
          action: 'OPERATIONAL_SETTING_CHANGED',
          actorId: 'admin-1',
          targetType: 'SystemSetting',
          targetId: 'externalAiReading',
          before: { enabled: true },
          after: { enabled: false },
          metadata: { setting: 'externalAiReading' },
        },
        mocks.tx
      );
      expect(SYSTEM_SETTING_TARGET_TYPE).toBe('SystemSetting');
    });

    it('止めた設定を版を合わせて再開すると、版を上げて有効に戻し、before・after を記録する', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(row(false, 1));
      mocks.tx.systemSetting.updateMany.mockResolvedValue({ count: 1 });
      mocks.tx.systemSetting.findUniqueOrThrow.mockResolvedValue(row(true, 2));

      const result = await mocks.service.setExternalAiReading(true, 1, 'admin-2');

      expect(result).toEqual({ enabled: true, version: 2 });
      expect(mocks.tx.systemSetting.updateMany).toHaveBeenCalledWith({
        where: { key: 'externalAiReading', version: 1 },
        data: {
          value: { enabled: true },
          version: { increment: 1 },
          updatedById: 'admin-2',
        },
      });
      expect(mocks.auditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OPERATIONAL_SETTING_CHANGED',
          actorId: 'admin-2',
          targetType: 'SystemSetting',
          targetId: 'externalAiReading',
          before: { enabled: false },
          after: { enabled: true },
        }),
        mocks.tx
      );
    });

    it('送った版が今の版と違うと競合の誤り（409）を投げ、書き込みも記録もしない', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(row(false, 5));

      const error = await mocks.service.setExternalAiReading(true, 4, 'admin-1').catch((e) => e);

      expect(error).toBeInstanceOf(SystemSettingConflictError);
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('SYSTEM_SETTING_CONFLICT');
      expect(error.details).toEqual({ expectedVersion: 4, actualVersion: 5 });
      expect(mocks.tx.systemSetting.updateMany).not.toHaveBeenCalled();
      expect(mocks.tx.systemSetting.create).not.toHaveBeenCalled();
      expect(mocks.auditLogService.createLog).not.toHaveBeenCalled();
    });

    it('行が無いのに 0 以外の版を送ると競合の誤りにする', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(null);

      await expect(mocks.service.setExternalAiReading(false, 2, 'admin-1')).rejects.toBeInstanceOf(
        SystemSettingConflictError
      );
      expect(mocks.tx.systemSetting.create).not.toHaveBeenCalled();
      expect(mocks.auditLogService.createLog).not.toHaveBeenCalled();
    });

    it('読んだ後に他の変更が先に版を進めた（条件つきの更新が 0 件）ときは競合の誤りにし、記録しない', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(row(true, 1));
      mocks.tx.systemSetting.updateMany.mockResolvedValue({ count: 0 });

      await expect(mocks.service.setExternalAiReading(false, 1, 'admin-1')).rejects.toBeInstanceOf(
        SystemSettingConflictError
      );
      expect(mocks.auditLogService.createLog).not.toHaveBeenCalled();
    });

    it('行の作成が同時の作成と一意制約でぶつかったときは競合の誤りにする', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(null);
      mocks.tx.systemSetting.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        })
      );

      await expect(mocks.service.setExternalAiReading(false, 0, 'admin-1')).rejects.toBeInstanceOf(
        SystemSettingConflictError
      );
      expect(mocks.auditLogService.createLog).not.toHaveBeenCalled();
    });

    it('監査の記録が失敗すると誤りをそのまま投げる（同じトランザクションのため変更も残らない）', async () => {
      mocks.tx.systemSetting.findUnique.mockResolvedValue(row(true, 1));
      mocks.tx.systemSetting.updateMany.mockResolvedValue({ count: 1 });
      mocks.tx.systemSetting.findUniqueOrThrow.mockResolvedValue(row(false, 2));
      mocks.auditLogService.createLog.mockRejectedValue(new Error('audit down'));

      await expect(mocks.service.setExternalAiReading(false, 1, 'admin-1')).rejects.toThrow(
        'audit down'
      );
      expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
