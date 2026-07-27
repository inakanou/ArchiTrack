/**
 * @fileoverview ConstructionSignboardService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 8.1: 当該プロジェクトに紐付く工事看板レコードを作成する
 * - 8.2: 標準項目「工事件名」「工事場所」を保持する
 * - 8.3: 任意数の自由項目行（ラベルと値）を保持する
 * - 8.4: 下部記入欄の固定テキスト（複数行可）を保持する
 * - 8.6: 工事看板を編集して保存する（更新）
 * - 8.7: 工事看板を削除する（論理削除）
 * - 8.8: 使用中の看板削除時に使用件数（inUseCount）を返す
 * - 8.9: 当該プロジェクト配下でのみ選択・参照可能とする
 * - 8.10: 当該プロジェクトに登録済みの工事看板を一覧表示する
 * - 13.2: 取得・更新・削除は対象が要求プロジェクト配下であることを検証する
 *
 * Task 3.1: 看板マスタCRUD・一覧サービス
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConstructionSignboardService,
  ProjectNotFoundForSignboardError,
  ConstructionSignboardNotFoundError,
  ConstructionSignboardConflictError,
  type ConstructionSignboardServiceDependencies,
} from '../../../services/construction-signboard.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';

function createMockPrisma() {
  return {
    project: {
      findUnique: vi.fn(),
    },
    constructionSignboard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    constructionPhoto: {
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        project: { findUnique: vi.fn() },
        constructionSignboard: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        constructionPhoto: { count: vi.fn() },
      })
    ),
  } as unknown as PrismaClient;
}

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  deletedAt: null,
};

const mockSignboard = {
  id: 'signboard-123',
  projectId: 'project-123',
  workName: '○○邸新築工事',
  workLocation: '東京都港区',
  freeItems: [
    { label: '天候', value: '晴れ' },
    { label: '施工者', value: '△△建設' },
  ],
  footerText: '状況・摘要欄',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T10:00:00.000Z'),
  deletedAt: null,
};

describe('ConstructionSignboardService', () => {
  let service: ConstructionSignboardService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    const deps: ConstructionSignboardServiceDependencies = { prisma: mockPrisma };
    service = new ConstructionSignboardService(deps);
  });

  describe('create', () => {
    const validInput = {
      projectId: 'project-123',
      workName: '○○邸新築工事',
      workLocation: '東京都港区',
      freeItems: [
        { label: '天候', value: '晴れ' },
        { label: '施工者', value: '△△建設' },
      ],
      footerText: '状況・摘要欄',
    };

    it('正常に工事看板を作成する（Requirements: 8.1, 8.2, 8.3, 8.4）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(mockProject) },
          constructionSignboard: { create: vi.fn().mockResolvedValue(mockSignboard) },
        };
        return fn(tx);
      });

      const result = await service.create(validInput);

      expect(result.id).toBe('signboard-123');
      expect(result.projectId).toBe('project-123');
      expect(result.workName).toBe('○○邸新築工事');
      expect(result.workLocation).toBe('東京都港区');
      expect(result.freeItems).toEqual([
        { label: '天候', value: '晴れ' },
        { label: '施工者', value: '△△建設' },
      ]);
      expect(result.footerText).toBe('状況・摘要欄');
      // DTOは createdAt/updatedAt を ISO 文字列で返す
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).toBe('2024-01-02T10:00:00.000Z');
    });

    it('プロジェクトが存在しない場合はエラーを返す（Requirements: 8.9）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(null) },
          constructionSignboard: { create: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.create(validInput)).rejects.toThrow(ProjectNotFoundForSignboardError);
    });

    it('プロジェクトが論理削除されている場合はエラーを返す（Requirements: 8.9）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: {
            findUnique: vi.fn().mockResolvedValue({ ...mockProject, deletedAt: new Date() }),
          },
          constructionSignboard: { create: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.create(validInput)).rejects.toThrow(ProjectNotFoundForSignboardError);
    });

    it('freeItems省略時は空配列で作成する（Requirements: 8.3）', async () => {
      const createMock = vi
        .fn()
        .mockResolvedValue({ ...mockSignboard, freeItems: [], footerText: null });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          project: { findUnique: vi.fn().mockResolvedValue(mockProject) },
          constructionSignboard: { create: createMock },
        };
        return fn(tx);
      });

      const result = await service.create({
        projectId: 'project-123',
        workName: '工事',
        workLocation: '場所',
        freeItems: [],
      });

      expect(result.freeItems).toEqual([]);
      expect(result.footerText).toBeNull();
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-123',
            workName: '工事',
            workLocation: '場所',
            freeItems: [],
            footerText: null,
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('正常に工事看板を更新する（Requirements: 8.6）', async () => {
      const updated = {
        ...mockSignboard,
        workName: '更新後工事',
        footerText: '更新後テキスト',
        updatedAt: new Date('2024-01-03T10:00:00.000Z'),
      };
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: vi.fn().mockResolvedValue(updated),
          },
        };
        return fn(tx);
      });

      const result = await service.update('signboard-123', {
        workName: '更新後工事',
        footerText: '更新後テキスト',
        updatedAt: '2024-01-02T10:00:00.000Z',
      });

      expect(result.workName).toBe('更新後工事');
      expect(result.footerText).toBe('更新後テキスト');
      expect(result.updatedAt).toBe('2024-01-03T10:00:00.000Z');
    });

    it('freeItemsのみ更新できる（Requirements: 8.3, 8.6）', async () => {
      const updateMock = vi
        .fn()
        .mockResolvedValue({ ...mockSignboard, freeItems: [{ label: '気温', value: '20℃' }] });
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: updateMock,
          },
        };
        return fn(tx);
      });

      await service.update('signboard-123', {
        freeItems: [{ label: '気温', value: '20℃' }],
        updatedAt: '2024-01-02T10:00:00.000Z',
      });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'signboard-123' },
        data: { freeItems: [{ label: '気温', value: '20℃' }] },
      });
    });

    it('楽観的排他制御: updatedAtが一致しない場合はコンフリクトエラーを返す（Requirements: 8.6）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('signboard-123', {
          workName: '新名称',
          updatedAt: '2024-01-01T00:00:00.000Z', // 古い値
        })
      ).rejects.toThrow(ConstructionSignboardConflictError);
    });

    it('存在しない看板を更新しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('nope', { workName: 'x', updatedAt: '2024-01-02T10:00:00.000Z' })
      ).rejects.toThrow(ConstructionSignboardNotFoundError);
    });

    it('論理削除された看板を更新しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue({ ...mockSignboard, deletedAt: new Date() }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update('signboard-123', { workName: 'x', updatedAt: '2024-01-02T10:00:00.000Z' })
      ).rejects.toThrow(ConstructionSignboardNotFoundError);
    });

    it('要求プロジェクト配下でない看板は更新できない（Requirements: 13.2）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await expect(
        service.update(
          'signboard-123',
          { workName: 'x', updatedAt: '2024-01-02T10:00:00.000Z' },
          'project-999'
        )
      ).rejects.toThrow(ConstructionSignboardNotFoundError);
    });
  });

  describe('delete', () => {
    it('未使用の看板を論理削除し inUseCount=0 を返す（Requirements: 8.7, 8.8）', async () => {
      const updateMock = vi.fn().mockResolvedValue({ ...mockSignboard, deletedAt: new Date() });
      const countMock = vi.fn().mockResolvedValue(0);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: updateMock,
          },
          constructionPhoto: { count: countMock },
        };
        return fn(tx);
      });

      const result = await service.delete('signboard-123');

      expect(result.inUseCount).toBe(0);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'signboard-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('使用中の看板削除で使用件数（inUseCount>0）を返す（Requirements: 8.8）', async () => {
      const countMock = vi.fn().mockResolvedValue(3);
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: vi.fn().mockResolvedValue({ ...mockSignboard, deletedAt: new Date() }),
          },
          constructionPhoto: { count: countMock },
        };
        return fn(tx);
      });

      const result = await service.delete('signboard-123');

      expect(result.inUseCount).toBe(3);
      // 使用件数は当該看板を参照する写真項目を数える
      expect(countMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ signboardId: 'signboard-123' }),
        })
      );
    });

    it('存在しない看板を削除しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
          constructionPhoto: { count: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.delete('nope')).rejects.toThrow(ConstructionSignboardNotFoundError);
    });

    it('既に論理削除された看板を削除しようとするとエラーを返す', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue({ ...mockSignboard, deletedAt: new Date() }),
            update: vi.fn(),
          },
          constructionPhoto: { count: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.delete('signboard-123')).rejects.toThrow(
        ConstructionSignboardNotFoundError
      );
    });

    it('要求プロジェクト配下でない看板は削除できない（Requirements: 13.2）', async () => {
      mockPrisma.$transaction = vi.fn().mockImplementation(async (fn) => {
        const tx = {
          constructionSignboard: {
            findUnique: vi.fn().mockResolvedValue(mockSignboard),
            update: vi.fn(),
          },
          constructionPhoto: { count: vi.fn() },
        };
        return fn(tx);
      });

      await expect(service.delete('signboard-123', 'project-999')).rejects.toThrow(
        ConstructionSignboardNotFoundError
      );
    });
  });

  describe('findByProject', () => {
    const mockSignboards = [
      { ...mockSignboard, id: 'signboard-001', workName: '看板A' },
      { ...mockSignboard, id: 'signboard-002', workName: '看板B' },
    ];

    it('当該プロジェクトの看板一覧を取得する（Requirements: 8.10）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue(mockSignboards);
      mockPrisma.constructionPhoto.groupBy = vi.fn().mockResolvedValue([]);

      const result = await service.findByProject('project-123');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('signboard-001');
      expect(result[1]!.id).toBe('signboard-002');
    });

    it('論理削除済みを除外し、プロジェクトIDで絞り込む（Requirements: 8.9, 13.2）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhoto.groupBy = vi.fn().mockResolvedValue([]);

      await service.findByProject('project-abc');

      expect(mockPrisma.constructionSignboard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'project-abc', deletedAt: null }),
        })
      );
    });

    it('他プロジェクトの看板は一覧に含まれない（Requirements: 8.9, 13.2）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhoto.groupBy = vi.fn().mockResolvedValue([]);

      const result = await service.findByProject('project-other');

      expect(result).toHaveLength(0);
    });

    it('freeItemsをDTOへそのまま反映する（Requirements: 8.3）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue([mockSignboard]);
      mockPrisma.constructionPhoto.groupBy = vi.fn().mockResolvedValue([]);

      const result = await service.findByProject('project-123');

      expect(result[0]!.freeItems).toEqual([
        { label: '天候', value: '晴れ' },
        { label: '施工者', value: '△△建設' },
      ]);
    });

    it('各看板の inUseCount を返す（未使用=0, 参照写真あり=件数）（Requirements: 8.8）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue(mockSignboards);
      // signboard-001 は写真3件参照、signboard-002 は未使用
      mockPrisma.constructionPhoto.groupBy = vi
        .fn()
        .mockResolvedValue([{ signboardId: 'signboard-001', _count: { _all: 3 } }]);

      const result = await service.findByProject('project-123');

      expect(result[0]!.inUseCount).toBe(3);
      expect(result[1]!.inUseCount).toBe(0);
    });

    it('inUseCount 集計は groupBy 1クエリで行う（N+1回避）（Requirements: 8.8）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue(mockSignboards);
      const groupByMock = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhoto.groupBy = groupByMock;

      await service.findByProject('project-123');

      expect(groupByMock).toHaveBeenCalledTimes(1);
      expect(groupByMock).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['signboardId'],
          where: expect.objectContaining({
            signboardId: { in: ['signboard-001', 'signboard-002'] },
          }),
        })
      );
    });

    it('看板が0件のときは inUseCount 集計クエリを発行しない（Requirements: 8.8）', async () => {
      mockPrisma.constructionSignboard.findMany = vi.fn().mockResolvedValue([]);
      const groupByMock = vi.fn().mockResolvedValue([]);
      mockPrisma.constructionPhoto.groupBy = groupByMock;

      const result = await service.findByProject('project-empty');

      expect(result).toHaveLength(0);
      expect(groupByMock).not.toHaveBeenCalled();
    });
  });
});
