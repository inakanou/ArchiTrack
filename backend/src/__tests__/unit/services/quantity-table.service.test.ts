/**
 * @fileoverview QuantityTableService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Requirements:
 * - 2.1: 数量表一覧画面で新規作成操作を行う
 * - 2.2: 数量表名を入力して作成を確定する
 * - 2.3: プロジェクトに紐づく全ての数量表を作成日時順に一覧表示する
 * - 2.4: 数量表を選択して削除操作を行う
 * - 2.5: 数量表名を編集する
 * - 1.2: 数量表セクションが表示されている状態で、数量表の総数を表示する
 * - 1.3: プロジェクトに数量表が存在する場合、直近の数量表カードを一覧表示する
 *
 * Task 2.1: 数量表のCRUD操作を実装する
 *
 * @module __tests__/unit/services/quantity-table.service.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { QuantityTableService } from '../../../services/quantity-table.service.js';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { IAuditLogService } from '../../../types/audit-log.types.js';
import {
  QuantityTableConflictError,
  QuantityTableNotFoundError,
  QuantityTableValidationError,
} from '../../../errors/quantityTableError.js';
import { SurveyDeletedError } from '../../../utils/survey-deleted-guard.js';
import { SurveyImageNotFoundError } from '../../../errors/siteSurveyError.js';

/**
 * 既定の現調画像モックが名乗る所属プロジェクトID
 *
 * 各 describe の `projectId`（= 現状DB状態が返す数量表の projectId）と同じ値である。
 * 既定では所属違反にならないようにするため、同じ値をここに置く。
 */
const DEFAULT_SURVEY_IMAGE_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000';

// Mock Prisma型の定義
type MockPrismaClient = {
  quantityTable: {
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    count: Mock;
  };
  quantityGroup: {
    create: Mock;
    update: Mock;
    deleteMany: Mock;
  };
  quantityItem: {
    create: Mock;
    update: Mock;
    deleteMany: Mock;
  };
  project: {
    findUnique: Mock;
  };
  surveyImage: {
    findMany: Mock;
  };
  $transaction: Mock;
};

describe('QuantityTableService', () => {
  let service: QuantityTableService;
  let mockPrisma: MockPrismaClient;
  let mockAuditLogService: { createLog: Mock };

  beforeEach(() => {
    // Mock Prismaクライアント
    mockPrisma = {
      quantityTable: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      quantityGroup: {
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      quantityItem: {
        create: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      surveyImage: {
        // 既定は「要求した画像がすべて実在し、当該数量表と同じプロジェクトに属し、
        // 親の現場調査も生きている」。存在・所属・論理削除のいずれの検査にも掛からない
        // 状態を既定に置き、各検査を確かめる検証だけが個別に上書きする。
        // （Task 81.1 当時の既定は「該当する画像が無い」であった。存在の検査を加えた
        //   Task 86.2 以降、その既定では画像を指す全ての保存が 404 で止まってしまう。）
        findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.map((id) => ({
              id,
              surveyId: `survey-of-${id}`,
              survey: { projectId: DEFAULT_SURVEY_IMAGE_PROJECT_ID, deletedAt: null },
            }))
          )
        ),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Mock AuditLogService
    mockAuditLogService = {
      createLog: vi.fn().mockResolvedValue(undefined),
    };

    service = new QuantityTableService({
      prisma: mockPrisma as unknown as PrismaClient,
      auditLogService: mockAuditLogService as unknown as IAuditLogService,
    });
  });

  describe('create', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const input = {
      projectId,
      name: 'テスト数量表',
    };

    it('正常に数量表を作成できる（Requirements: 2.1, 2.2）', async () => {
      // Arrange
      const createdQuantityTable = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId,
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        _count: { groups: 0 },
      };

      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
      });

      mockPrisma.quantityTable.create.mockResolvedValue(createdQuantityTable);

      // Act
      const result = await service.create(input, actorId);

      // Assert
      expect(result.id).toBe(createdQuantityTable.id);
      expect(result.name).toBe('テスト数量表');
      expect(result.projectId).toBe(projectId);
      expect(result.groupCount).toBe(0);
      expect(result.itemCount).toBe(0);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_CREATED',
          actorId,
          targetType: 'QuantityTable',
          targetId: createdQuantityTable.id,
        })
      );
    });

    it('プロジェクトが存在しない場合はエラーをスローする（Requirements: 1.6準拠）', async () => {
      // Arrange
      mockPrisma.project.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('プロジェクトが見つかりません');
    });

    it('プロジェクトが論理削除されている場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.create(input, actorId)).rejects.toThrow('プロジェクトが見つかりません');
    });
  });

  describe('findById', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';

    it('IDで数量表を取得できる', async () => {
      // Arrange
      const quantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
        groups: [],
        _count: { groups: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(quantityTable);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(quantityTableId);
      expect(result!.project.name).toBe('テストプロジェクト');
    });

    it('存在しないIDの場合はnullを返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).toBeNull();
    });

    it('論理削除された数量表は取得できない', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null); // deletedAt: null フィルターで除外される

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).toBeNull();
    });

    // 画面オープン時の注釈N+1リクエスト抑止のため、
    // surveyImage.hasAnnotations を注釈リレーションの有無から導出して返すことを検証する。
    const buildGroupWithImage = (
      annotation: { id: string; hasDrawnAnnotations?: boolean | null } | null
    ) => ({
      id: '123e4567-e89b-12d3-a456-426614174010',
      quantityTableId,
      name: null,
      surveyImageId: 'img-1',
      displayOrder: 0,
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      surveyImage: {
        id: 'img-1',
        survey: { projectId: DEFAULT_SURVEY_IMAGE_PROJECT_ID },
        thumbnailPath: 'surveys/s/thumb.jpg',
        originalPath: 'surveys/s/orig.jpg',
        annotatedThumbnailPath: null,
        width: 4032,
        height: 3024,
        fileName: 'orig.jpg',
        comment: null,
        annotation,
      },
      items: [],
      _count: { items: 0 },
    });

    const buildTableWithGroup = (
      annotation: { id: string; hasDrawnAnnotations?: boolean | null } | null
    ) => ({
      id: quantityTableId,
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テスト数量表',
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      deletedAt: null,
      project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
      groups: [buildGroupWithImage(annotation)],
      _count: { groups: 1 },
    });

    it('注釈リレーションが存在する場合は surveyImage.hasAnnotations が true になる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithGroup({ id: 'ann-1' }));

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasAnnotations).toBe(true);
    });

    it('注釈リレーションが存在しない場合は surveyImage.hasAnnotations が false になる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithGroup(null));

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasAnnotations).toBe(false);
    });

    // ========================================================================
    // Task 115.13: 描画された注釈の有無を示す項目を設ける
    //
    // 既存の hasAnnotations は「注釈レコードの存在」から導出されるため、注釈0件
    // （回転のみ）の保存でも真になる。描画された注釈の有無は派生項目
    // hasDrawnAnnotations として、重い data を取得せずに供給する。
    //
    // Requirements: 20.2
    // ========================================================================
    it('注釈0件（回転のみ）で保存された画像は surveyImage.hasDrawnAnnotations が false になる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithGroup({ id: 'ann-1', hasDrawnAnnotations: false })
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasDrawnAnnotations).toBe(false);
      // 既存項目の意味は変更しない
      expect(result!.groups[0]!.surveyImage!.hasAnnotations).toBe(true);
    });

    it('描画された注釈がある画像は surveyImage.hasDrawnAnnotations が true になる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithGroup({ id: 'ann-1', hasDrawnAnnotations: true })
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasDrawnAnnotations).toBe(true);
    });

    it('注釈リレーションが存在しない場合は surveyImage.hasDrawnAnnotations が false になる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithGroup(null));

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasDrawnAnnotations).toBe(false);
    });

    it('未算出（バックフィル未実施）の既存注釈は従来どおり注釈ありとして扱う', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithGroup({ id: 'ann-1', hasDrawnAnnotations: null })
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage!.hasDrawnAnnotations).toBe(true);
    });

    it('判定に重い注釈データ（data）を取得しない', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithGroup(null));

      // Act
      await service.findById(quantityTableId);

      // Assert
      const args = mockPrisma.quantityTable.findUnique.mock.calls[0]![0];
      const annotationSelect = args.include.groups.include.surveyImage.select.annotation.select;
      expect(annotationSelect).toEqual({ id: true, hasDrawnAnnotations: true });
      expect(annotationSelect).not.toHaveProperty('data');
    });
  });

  // ==========================================================================
  // Task 72.2: 写真情報に画像の実寸を含める
  //
  // 数量グループ表題部の写真は、共有表示部品が表示領域に入るまで取得を遅らせる。
  // 遅延させる間も版面を崩さずに領域を確保するには画像の実寸が要るため、数量表詳細の
  // 写真サマリで実寸を供給する。実寸は既存の問い合わせの取得項目を広げて得るものとし、
  // 写真1枚あたりの追加の問い合わせを発生させない。
  //
  // Requirements (quantity-table-generation): 49.8
  // ==========================================================================
  describe('findById - 写真サマリの実寸', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';

    const buildTableWithSizedImage = () => ({
      id: quantityTableId,
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テスト数量表',
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      deletedAt: null,
      project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
      groups: [
        {
          id: '123e4567-e89b-12d3-a456-426614174010',
          quantityTableId,
          name: null,
          surveyImageId: 'img-1',
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          surveyImage: {
            id: 'img-1',
            survey: { projectId: DEFAULT_SURVEY_IMAGE_PROJECT_ID },
            thumbnailPath: 'surveys/s/thumb.jpg',
            originalPath: 'surveys/s/orig.jpg',
            annotatedThumbnailPath: null,
            fileName: 'orig.jpg',
            comment: null,
            width: 4032,
            height: 3024,
            annotation: null,
          },
          items: [],
          _count: { items: 0 },
        },
      ],
      _count: { groups: 1 },
    });

    it('写真サマリに画像の実寸（幅・高さ）が含まれる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithSizedImage());

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      const surveyImage = result!.groups[0]!.surveyImage!;
      expect(surveyImage.width).toBe(4032);
      expect(surveyImage.height).toBe(3024);
    });

    it('実寸は既存の問い合わせの取得項目から得る（写真ごとの追加の問い合わせを発生させない）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(buildTableWithSizedImage());

      // Act
      await service.findById(quantityTableId);

      // Assert: 実寸は数量表詳細の同一の問い合わせで取得する
      const args = mockPrisma.quantityTable.findUnique.mock.calls[0]![0];
      const imageSelect = args.include.groups.include.surveyImage.select;
      expect(imageSelect.width).toBe(true);
      expect(imageSelect.height).toBe(true);

      // Assert: 問い合わせの回数が増えていないこと
      expect(mockPrisma.quantityTable.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.quantityTable.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Task 86.3: 数量表の取得経路が現調画像の所属を検めない状態を解消する
  //
  // Task 86.1 が保存経路を塞いだため、他プロジェクトの現調画像を新たに紐付けることは
  // できない。しかし 86.1 より前に永続化された紐付けは残っており、取得経路はそれを
  // そのまま返していた。取得経路は当該の紐付けだけを落とし、数量表そのものは返す。
  //
  // 本 describe は受入基準を名乗らない。守るのはテナント境界であり、本スペックの
  // 受入基準として条文化されていないためである（tasks.md の Task 86 節末尾に明記）。
  // ==========================================================================
  describe('findById - 現調画像の所属の検査', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const ownerProjectId = '123e4567-e89b-12d3-a456-426614174000';
    const foreignProjectId = '123e4567-e89b-12d3-a456-4266141740ff';

    const buildTableWithImageOwnedBy = (imageProjectId: string) => ({
      id: quantityTableId,
      projectId: ownerProjectId,
      name: 'テスト数量表',
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      deletedAt: null,
      project: { id: ownerProjectId, name: 'テストプロジェクト' },
      groups: [
        {
          id: '123e4567-e89b-12d3-a456-426614174010',
          quantityTableId,
          name: 'グループ',
          surveyImageId: 'img-1',
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          surveyImage: {
            id: 'img-1',
            survey: { projectId: imageProjectId },
            thumbnailPath: 'surveys/s/thumb.jpg',
            originalPath: 'surveys/s/orig.jpg',
            annotatedThumbnailPath: null,
            fileName: 'orig.jpg',
            comment: null,
            width: 4032,
            height: 3024,
            annotation: null,
          },
          items: [],
          _count: { items: 0 },
        },
      ],
      _count: { groups: 1 },
    });

    it('他プロジェクトの現調画像を指す紐付けは写真サマリを落として返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithImageOwnedBy(foreignProjectId)
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImage).toBeNull();
    });

    it('他プロジェクトの現調画像を指す紐付けは surveyImageId も落として返す（保存の出口を塞がないため）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithImageOwnedBy(foreignProjectId)
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImageId).toBeNull();
    });

    it('落とすのは当該の紐付けだけで、数量表とグループそのものは返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithImageOwnedBy(foreignProjectId)
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(quantityTableId);
      expect(result!.groups).toHaveLength(1);
      expect(result!.groups[0]!.name).toBe('グループ');
    });

    it('同一プロジェクトの現調画像は従来どおり写真サマリを返す（対照）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithImageOwnedBy(ownerProjectId)
      );

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result!.groups[0]!.surveyImageId).toBe('img-1');
      expect(result!.groups[0]!.surveyImage!.id).toBe('img-1');
      expect(result!.groups[0]!.surveyImage!.thumbnailUrl).toBe('/api/storage/surveys/s/thumb.jpg');
    });

    // Task 86.5: 落としたことを画面が利用者へ告げられるよう、落とした紐付けを持つ
    // グループを応答で名指す。名指すのは当該数量表のグループIDだけで、他プロジェクトの
    // 画像IDは返さない（86.3 が落とした識別子を別の項目から再び露出させない）。
    it('落とした紐付けのグループを droppedSurveyImageLinkGroupIds で名指し、画像IDは返さない（Task 86.5）', async () => {
      // Arrange / Act: 所属違反の紐付け
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        buildTableWithImageOwnedBy(foreignProjectId)
      );
      const dropped = await service.findById(quantityTableId);

      // Assert: 当該グループを名指す
      expect(dropped!.droppedSurveyImageLinkGroupIds).toEqual([
        '123e4567-e89b-12d3-a456-426614174010',
      ]);
      // 他プロジェクトの画像IDは応答のどこにも現れない
      expect(JSON.stringify(dropped)).not.toContain('img-1');

      // Arrange / Act: 同一プロジェクトの紐付け（対照。上の名指しが恒真でないこと）
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        buildTableWithImageOwnedBy(ownerProjectId)
      );
      const kept = await service.findById(quantityTableId);

      // Assert: 落としていないので名指さない。画像IDは従来どおり返る（観測器の非空証明）
      expect(kept!.droppedSurveyImageLinkGroupIds).toEqual([]);
      expect(JSON.stringify(kept)).toContain('img-1');
    });

    it('所属の判定は既存の問い合わせの取得項目から得る（写真ごとの追加の問い合わせを発生させない）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(
        buildTableWithImageOwnedBy(foreignProjectId)
      );

      // Act
      await service.findById(quantityTableId);

      // Assert: 所属は数量表詳細の同一の問い合わせで取得する
      const args = mockPrisma.quantityTable.findUnique.mock.calls[0]![0];
      const imageSelect = args.include.groups.include.surveyImage.select;
      expect(imageSelect.survey).toEqual({ select: { projectId: true } });

      // Assert: 問い合わせの回数が増えていないこと
      expect(mockPrisma.quantityTable.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.surveyImage.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityTable.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findByProjectId', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('プロジェクトIDで数量表一覧を取得できる（Requirements: 2.3）', async () => {
      // Arrange
      const quantityTables = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト数量表1',
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 2 },
          groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          projectId,
          name: 'テスト数量表2',
          createdAt: new Date('2026-01-05T00:00:00.000Z'),
          updatedAt: new Date('2026-01-05T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 1 },
          groups: [{ _count: { items: 1 } }],
        },
      ];

      mockPrisma.quantityTable.findMany.mockResolvedValue(quantityTables);
      mockPrisma.quantityTable.count.mockResolvedValue(2);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it('ページネーションが正しく動作する', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          _count: { groups: 0 },
          groups: [],
        },
      ]);
      mockPrisma.quantityTable.count.mockResolvedValue(25);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 2, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.page).toBe(2);
    });

    it('検索フィルターが正しく動作する', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: '検索キーワード',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          _count: { groups: 0 },
          groups: [],
        },
      ]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      await service.findByProjectId(
        projectId,
        { search: '検索キーワード' },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.quantityTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.objectContaining({
              contains: '検索キーワード',
            }),
          }),
        })
      );
    });
  });

  describe('findLatestByProjectId', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('プロジェクト詳細画面向けサマリーを取得できる（Requirements: 1.2, 1.3）', async () => {
      // Arrange
      const quantityTables = [
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          projectId,
          name: 'テスト数量表1',
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          deletedAt: null,
          _count: { groups: 2 },
          groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
        },
      ];

      mockPrisma.quantityTable.findMany.mockResolvedValue(quantityTables);
      mockPrisma.quantityTable.count.mockResolvedValue(5);

      // Act
      const result = await service.findLatestByProjectId(projectId, 2);

      // Assert
      expect(result.totalCount).toBe(5);
      expect(result.latestTables).toHaveLength(1);
    });
  });

  describe('update', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('数量表名を更新できる（Requirements: 2.5）', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const updatedQuantityTable = {
        ...existingQuantityTable,
        name: '新名称',
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { groups: 0 },
        groups: [],
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue(updatedQuantityTable);

      // Act
      const result = await service.update(
        quantityTableId,
        { name: '新名称' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.name).toBe('新名称');
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_UPDATED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
        })
      );
    });

    it('楽観的排他制御でタイムスタンプが一致しない場合はエラーをスローする', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T02:00:00.000Z'), // 異なるタイムスタンプ
        deletedAt: null,
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました');
    });

    it('存在しない数量表の更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });
  });

  describe('delete', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('数量表を論理削除できる（Requirements: 2.4）', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        groups: [],
        _count: { groups: 0 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue({
        ...existingQuantityTable,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(quantityTableId, actorId);

      // Assert
      expect(mockPrisma.quantityTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: quantityTableId },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        })
      );
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_DELETED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
        })
      );
    });

    it('存在しない数量表の削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.delete(quantityTableId, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('既に論理削除された数量表の削除はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        deletedAt: new Date(),
      });

      // Act & Assert
      await expect(service.delete(quantityTableId, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('グループと項目を持つ数量表を削除できる', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        groups: [
          { id: 'group-1', _count: { items: 3 } },
          { id: 'group-2', _count: { items: 5 } },
        ],
        _count: { groups: 2 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue({
        ...existingQuantityTable,
        deletedAt: new Date(),
      });

      // Act
      await service.delete(quantityTableId, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_DELETED',
          before: expect.objectContaining({
            groupCount: 2,
            itemCount: 8, // 3 + 5
          }),
        })
      );
    });
  });

  describe('findByProjectId - additional cases', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    it('結果が0件の場合、totalPagesは0を返す', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      const result = await service.findByProjectId(
        projectId,
        {},
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('空の検索キーワードは無視される', async () => {
      // Arrange
      mockPrisma.quantityTable.findMany.mockResolvedValue([]);
      mockPrisma.quantityTable.count.mockResolvedValue(0);

      // Act
      await service.findByProjectId(
        projectId,
        { search: '   ' },
        { page: 1, limit: 10 },
        { sort: 'createdAt', order: 'desc' }
      );

      // Assert
      expect(mockPrisma.quantityTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            name: expect.anything(),
          }),
        })
      );
    });
  });

  describe('update - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('論理削除された数量表の更新はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: new Date(), // 論理削除済み
      });

      // Act & Assert
      await expect(
        service.update(quantityTableId, { name: '新名称' }, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });

    it('グループと項目を持つ数量表を更新できる', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: '旧名称',
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const updatedQuantityTable = {
        ...existingQuantityTable,
        name: '新名称',
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
        _count: { groups: 2 },
        groups: [{ _count: { items: 3 } }, { _count: { items: 5 } }],
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityTable.update.mockResolvedValue(updatedQuantityTable);

      // Act
      const result = await service.update(
        quantityTableId,
        { name: '新名称' },
        actorId,
        expectedUpdatedAt
      );

      // Assert
      expect(result.groupCount).toBe(2);
      expect(result.itemCount).toBe(8); // 3 + 5
    });
  });

  describe('findById - additional cases', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';

    it('グループと項目を持つ数量表を取得できる', async () => {
      // Arrange
      const quantityTable = {
        id: quantityTableId,
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        project: { id: '123e4567-e89b-12d3-a456-426614174000', name: 'テストプロジェクト' },
        groups: [
          {
            id: 'group-1',
            quantityTableId: quantityTableId,
            name: 'グループ1',
            surveyImageId: null,
            surveyImage: null,
            displayOrder: 0,
            createdAt: new Date('2026-01-06T00:00:00.000Z'),
            updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            items: [
              {
                id: 'item-1',
                quantityGroupId: 'group-1',
                majorCategory: '大分類1',
                middleCategory: '中分類1',
                minorCategory: '小分類1',
                customCategory: null,
                workType: '工種1',
                name: '項目1',
                specification: '規格1',
                unit: 'm',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.01,
                quantity: 10.5,
                remarks: null,
                displayOrder: 0,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-2',
                quantityGroupId: 'group-1',
                majorCategory: '大分類2',
                middleCategory: null,
                minorCategory: null,
                customCategory: 'カスタム',
                workType: '工種2',
                name: '項目2',
                specification: null,
                unit: '㎡',
                calculationMethod: 'FORMULA',
                calculationParams: { width: 5, height: 3 },
                adjustmentFactor: 1.1,
                roundingUnit: 0.1,
                quantity: 15.0,
                remarks: '備考',
                displayOrder: 1,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-3',
                quantityGroupId: 'group-1',
                majorCategory: '大分類3',
                middleCategory: '中分類3',
                minorCategory: '小分類3',
                customCategory: null,
                workType: '工種3',
                name: '項目3',
                specification: '規格3',
                unit: '個',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 5,
                remarks: null,
                displayOrder: 2,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
            ],
            _count: { items: 3 },
          },
          {
            id: 'group-2',
            quantityTableId: quantityTableId,
            name: 'グループ2',
            surveyImageId: 'img-1',
            surveyImage: {
              id: 'img-1',
              survey: { projectId: DEFAULT_SURVEY_IMAGE_PROJECT_ID },
              thumbnailPath: 'thumbnails/img-1.jpg',
              originalPath: 'originals/img-1.jpg',
              fileName: 'survey.jpg',
            },
            displayOrder: 1,
            createdAt: new Date('2026-01-06T00:00:00.000Z'),
            updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            items: [
              {
                id: 'item-4',
                quantityGroupId: 'group-2',
                majorCategory: '大分類4',
                middleCategory: '中分類4',
                minorCategory: null,
                customCategory: null,
                workType: '工種4',
                name: '項目4',
                specification: '規格4',
                unit: 'm³',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.001,
                quantity: 100.123,
                remarks: null,
                displayOrder: 0,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-5',
                quantityGroupId: 'group-2',
                majorCategory: '大分類5',
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '工種5',
                name: '項目5',
                specification: null,
                unit: '式',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 1,
                remarks: null,
                displayOrder: 1,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-6',
                quantityGroupId: 'group-2',
                majorCategory: '大分類6',
                middleCategory: '中分類6',
                minorCategory: '小分類6',
                customCategory: null,
                workType: '工種6',
                name: '項目6',
                specification: '規格6',
                unit: 'kg',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.1,
                quantity: 50.5,
                remarks: null,
                displayOrder: 2,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-7',
                quantityGroupId: 'group-2',
                majorCategory: '大分類7',
                middleCategory: null,
                minorCategory: null,
                customCategory: null,
                workType: '工種7',
                name: '項目7',
                specification: null,
                unit: 't',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 0.01,
                quantity: 2.5,
                remarks: null,
                displayOrder: 3,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
              {
                id: 'item-8',
                quantityGroupId: 'group-2',
                majorCategory: '大分類8',
                middleCategory: '中分類8',
                minorCategory: null,
                customCategory: null,
                workType: '工種8',
                name: '項目8',
                specification: '規格8',
                unit: 'L',
                calculationMethod: 'DIRECT_INPUT',
                calculationParams: null,
                adjustmentFactor: 1.0,
                roundingUnit: 1,
                quantity: 200,
                remarks: '最終項目',
                displayOrder: 4,
                createdAt: new Date('2026-01-06T00:00:00.000Z'),
                updatedAt: new Date('2026-01-06T00:00:00.000Z'),
              },
            ],
            _count: { items: 5 },
          },
        ],
        _count: { groups: 2 },
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(quantityTable);

      // Act
      const result = await service.findById(quantityTableId);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.groupCount).toBe(2);
      expect(result!.itemCount).toBe(8);
      expect(result!.groups).toHaveLength(2);
      expect(result!.groups[0]!.name).toBe('グループ1');
      expect(result!.groups[1]!.surveyImageId).toBe('img-1');
    });
  });

  describe('create - additional cases', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';

    it('グループを持つ数量表作成時にitemCountが計算される', async () => {
      // Arrange
      const createdQuantityTable = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        projectId,
        name: 'テスト数量表',
        createdAt: new Date('2026-01-06T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        deletedAt: null,
        _count: { groups: 2 },
        groups: [{ _count: { items: 3 } }, { _count: { items: 2 } }],
      };

      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        deletedAt: null,
      });

      mockPrisma.quantityTable.create.mockResolvedValue(createdQuantityTable);

      // Act
      const result = await service.create({ projectId, name: 'テスト数量表' }, actorId);

      // Assert
      expect(result.groupCount).toBe(2);
      expect(result.itemCount).toBe(5); // 3 + 2
    });
  });

  describe('bulkSave', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');

    it('複数のグループと項目を一括保存できる', async () => {
      // Arrange
      const existingQuantityTable = {
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      };

      const updatedQuantityTable = {
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      };

      mockPrisma.quantityTable.findUnique.mockResolvedValue(existingQuantityTable);
      mockPrisma.quantityItem.update.mockResolvedValue({});
      mockPrisma.quantityTable.update.mockResolvedValue(updatedQuantityTable);

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [
              { id: 'item-1', name: '更新項目1', displayOrder: 0 },
              { id: 'item-2', name: '更新項目2', displayOrder: 1 },
            ],
          },
          {
            id: 'group-2',
            items: [{ id: 'item-3', name: '更新項目3', displayOrder: 0 }],
          },
        ],
      };

      // Act
      const result = await service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(result.updatedItemCount).toBe(3);
      expect(result.updatedAt).toEqual(updatedQuantityTable.updatedAt);
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledTimes(3);
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_BULK_SAVED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
          after: expect.objectContaining({
            updatedItemCount: 3,
            groupCount: 2,
          }),
        })
      );
    });

    it('数量表が存在しない場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [{ id: 'item-1', name: '更新項目1' }],
          },
        ],
      };

      // Act & Assert
      await expect(
        service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });

    it('論理削除された数量表はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: new Date(), // 論理削除済み
      });

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [{ id: 'item-1', name: '更新項目1' }],
          },
        ],
      };

      // Act & Assert
      await expect(
        service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt)
      ).rejects.toThrow('数量表が見つかりません');
    });

    it('楽観的排他制御でタイムスタンプが一致しない場合はエラーをスローする', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T02:00:00.000Z'), // 異なるタイムスタンプ
        deletedAt: null,
      });

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [{ id: 'item-1', name: '更新項目1' }],
          },
        ],
      };

      // Act & Assert
      await expect(
        service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt)
      ).rejects.toThrow('他のユーザーによって更新されました');
    });

    it('全てのフィールドを更新できる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      });
      mockPrisma.quantityItem.update.mockResolvedValue({});
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      });

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [
              {
                id: 'item-1',
                majorCategory: '大項目',
                middleCategory: '中項目',
                minorCategory: '小項目',
                customCategory: '任意分類',
                workType: '工種',
                name: '名称',
                specification: '規格',
                unit: 'm',
                calculationMethod: 'STANDARD' as const,
                calculationParams: { width: 10, height: 5 },
                adjustmentFactor: 1.1,
                roundingUnit: 0.01,
                quantity: 100,
                remarks: '備考',
                displayOrder: 0,
              },
            ],
          },
        ],
      };

      // Act
      await service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            majorCategory: '大項目',
            middleCategory: '中項目',
            minorCategory: '小項目',
            customCategory: '任意分類',
            workType: '工種',
            name: '名称',
            specification: '規格',
            unit: 'm',
            calculationMethod: 'STANDARD',
            calculationParams: { width: 10, height: 5 },
            remarks: '備考',
            displayOrder: 0,
          }),
        })
      );
    });

    it('null値を正しく処理する', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      });
      mockPrisma.quantityItem.update.mockResolvedValue({});
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      });

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [
              {
                id: 'item-1',
                majorCategory: null,
                middleCategory: null,
                specification: null,
                remarks: null,
              },
            ],
          },
        ],
      };

      // Act
      await service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            majorCategory: null,
            middleCategory: null,
            specification: null,
            remarks: null,
          }),
        })
      );
    });

    it('空のグループ配列でも正常に動作する', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      });

      const input = {
        groups: [],
      };

      // Act
      const result = await service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(result.updatedItemCount).toBe(0);
      expect(mockPrisma.quantityItem.update).not.toHaveBeenCalled();
    });

    it('文字列フィールドがトリムされる', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        id: quantityTableId,
        updatedAt: expectedUpdatedAt,
        deletedAt: null,
      });
      mockPrisma.quantityItem.update.mockResolvedValue({});
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: new Date('2026-01-06T01:00:00.000Z'),
      });

      const input = {
        groups: [
          {
            id: 'group-1',
            items: [
              {
                id: 'item-1',
                majorCategory: '  大項目  ',
                workType: '  工種  ',
                name: '  名称  ',
                unit: '  m  ',
              },
            ],
          },
        ],
      };

      // Act
      await service.bulkSave(quantityTableId, input, actorId, expectedUpdatedAt);

      // Assert
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            majorCategory: '大項目',
            workType: '工種',
            name: '名称',
            unit: 'm',
          }),
        })
      );
    });
  });

  /**
   * Task 20.1: 数量表ディープコピーのサービスメソッドテスト
   *
   * Requirements:
   * - 17.2: コピーダイアログで数量表名を入力して作成を確定する
   * - 17.4: コピーされた数量表は元の数量表とは独立したデータとして管理する
   * - 17.5: コピー中にエラーが発生した場合、不完全なコピーデータが残らないようにする
   * - 17.7: 元の数量表に写真が紐づけられている場合、コピー先でも同じ写真の紐づけを維持する
   */
  describe('copy', () => {
    const sourceTableId = '123e4567-e89b-12d3-a456-426614174010';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const copyName = 'テスト数量表のコピー';

    // 元の数量表データ（グループ・項目を含む）
    const sourceTable = {
      id: sourceTableId,
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'テスト数量表',
      createdAt: new Date('2026-01-06T00:00:00.000Z'),
      updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      deletedAt: null,
      groups: [
        {
          id: 'group-1',
          quantityTableId: sourceTableId,
          name: 'グループ1',
          surveyImageId: 'image-1',
          displayOrder: 0,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          items: [
            {
              id: 'item-1',
              quantityGroupId: 'group-1',
              majorCategory: '大項目A',
              middleCategory: '中項目A',
              minorCategory: '小項目A',
              customCategory: '任意A',
              workType: '工種A',
              name: '名称A',
              specification: '規格A',
              unit: 'm',
              calculationMethod: 'STANDARD',
              calculationParams: null,
              adjustmentFactor: { toNumber: () => 1.0 },
              roundingUnit: { toNumber: () => 0.01 },
              quantity: { toNumber: () => 10.5 },
              remarks: '備考A',
              displayOrder: 0,
              createdAt: new Date('2026-01-06T00:00:00.000Z'),
              updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            },
            {
              id: 'item-2',
              quantityGroupId: 'group-1',
              majorCategory: null,
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '工種B',
              name: '名称B',
              specification: null,
              unit: 'kg',
              calculationMethod: 'AREA_VOLUME',
              calculationParams: { width: 2.0, depth: 3.0 },
              adjustmentFactor: { toNumber: () => 1.5 },
              roundingUnit: { toNumber: () => 0.25 },
              quantity: { toNumber: () => 9.0 },
              remarks: null,
              displayOrder: 1,
              createdAt: new Date('2026-01-06T00:00:00.000Z'),
              updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'group-2',
          quantityTableId: sourceTableId,
          name: 'グループ2',
          surveyImageId: null,
          displayOrder: 1,
          createdAt: new Date('2026-01-06T00:00:00.000Z'),
          updatedAt: new Date('2026-01-06T00:00:00.000Z'),
          items: [
            {
              id: 'item-3',
              quantityGroupId: 'group-2',
              majorCategory: '大項目C',
              middleCategory: null,
              minorCategory: null,
              customCategory: null,
              workType: '工種C',
              name: '名称C',
              specification: '規格C',
              unit: '本',
              calculationMethod: 'PITCH',
              calculationParams: {
                rangeLength: 10,
                endLength1: 0.5,
                endLength2: 0.5,
                pitchLength: 1.0,
              },
              adjustmentFactor: { toNumber: () => 1.0 },
              roundingUnit: { toNumber: () => 0.01 },
              quantity: { toNumber: () => 10.0 },
              remarks: '備考C',
              displayOrder: 0,
              createdAt: new Date('2026-01-06T00:00:00.000Z'),
              updatedAt: new Date('2026-01-06T00:00:00.000Z'),
            },
          ],
        },
      ],
    };

    it('正常に数量表をディープコピーできる（Requirements: 17.2, 17.4）', async () => {
      // Arrange
      const copiedTableId = 'copied-table-id';
      const copiedGroup1Id = 'copied-group-1-id';
      const copiedGroup2Id = 'copied-group-2-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);

      // 数量表作成のモック
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
        updatedAt: new Date('2026-01-07T00:00:00.000Z'),
        _count: { groups: 2 },
      });

      // グループ作成のモック
      mockPrisma.quantityGroup.create
        .mockResolvedValueOnce({
          id: copiedGroup1Id,
          quantityTableId: copiedTableId,
          name: 'グループ1',
          surveyImageId: 'image-1',
          displayOrder: 0,
        })
        .mockResolvedValueOnce({
          id: copiedGroup2Id,
          quantityTableId: copiedTableId,
          name: 'グループ2',
          surveyImageId: null,
          displayOrder: 1,
        });

      // 項目作成のモック
      mockPrisma.quantityItem.create.mockResolvedValue({});

      // Act
      const result = await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(copiedTableId);
      expect(result.name).toBe(copyName);
      expect(result.projectId).toBe(sourceTable.projectId);

      // 元の数量表の取得が呼ばれたことを確認
      expect(mockPrisma.quantityTable.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: sourceTableId,
            deletedAt: null,
          }),
        })
      );

      // 新しい数量表が作成されたことを確認
      expect(mockPrisma.quantityTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: sourceTable.projectId,
            name: copyName,
          }),
        })
      );

      // 2つのグループが作成されたことを確認
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledTimes(2);

      // 3つの項目が作成されたことを確認
      expect(mockPrisma.quantityItem.create).toHaveBeenCalledTimes(3);
    });

    it('全グループの表示順序と写真紐づけ（surveyImageId）を維持してコピーする（Requirements: 17.7）', async () => {
      // Arrange
      const copiedTableId = 'copied-table-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
        updatedAt: new Date('2026-01-07T00:00:00.000Z'),
        _count: { groups: 2 },
      });

      mockPrisma.quantityGroup.create
        .mockResolvedValueOnce({
          id: 'copied-group-1',
          quantityTableId: copiedTableId,
          name: 'グループ1',
          surveyImageId: 'image-1',
          displayOrder: 0,
        })
        .mockResolvedValueOnce({
          id: 'copied-group-2',
          quantityTableId: copiedTableId,
          name: 'グループ2',
          surveyImageId: null,
          displayOrder: 1,
        });

      mockPrisma.quantityItem.create.mockResolvedValue({});

      // Act
      await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert - グループ1: surveyImageIdが維持される
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantityTableId: copiedTableId,
            name: 'グループ1',
            surveyImageId: 'image-1',
            displayOrder: 0,
          }),
        })
      );

      // Assert - グループ2: surveyImageIdがnullのまま維持される
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantityTableId: copiedTableId,
            name: 'グループ2',
            surveyImageId: null,
            displayOrder: 1,
          }),
        })
      );
    });

    it('各グループ内の全項目について全フィールド値と表示順序を維持してコピーする（Requirements: 17.2, 17.4）', async () => {
      // Arrange
      const copiedTableId = 'copied-table-id';
      const copiedGroup1Id = 'copied-group-1';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
        updatedAt: new Date('2026-01-07T00:00:00.000Z'),
        _count: { groups: 2 },
      });

      mockPrisma.quantityGroup.create
        .mockResolvedValueOnce({
          id: copiedGroup1Id,
          quantityTableId: copiedTableId,
          displayOrder: 0,
        })
        .mockResolvedValueOnce({
          id: 'copied-group-2',
          quantityTableId: copiedTableId,
          displayOrder: 1,
        });

      mockPrisma.quantityItem.create.mockResolvedValue({});

      // Act
      await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert - 項目作成の呼び出し引数を直接取得して検証
      const itemCreateCalls = mockPrisma.quantityItem.create.mock.calls;

      // 項目1: 全フィールド値が維持される（グループ1の最初の項目）
      const item1Data = itemCreateCalls[0]![0].data;
      expect(item1Data.quantityGroupId).toBe(copiedGroup1Id);
      expect(item1Data.majorCategory).toBe('大項目A');
      expect(item1Data.middleCategory).toBe('中項目A');
      expect(item1Data.minorCategory).toBe('小項目A');
      expect(item1Data.customCategory).toBe('任意A');
      expect(item1Data.workType).toBe('工種A');
      expect(item1Data.name).toBe('名称A');
      expect(item1Data.specification).toBe('規格A');
      expect(item1Data.unit).toBe('m');
      expect(item1Data.calculationMethod).toBe('STANDARD');
      expect(item1Data.remarks).toBe('備考A');
      expect(item1Data.displayOrder).toBe(0);

      // 項目2: AREA_VOLUMEの計算パラメータも維持される（グループ1の2番目の項目）
      const item2Data = itemCreateCalls[1]![0].data;
      expect(item2Data.quantityGroupId).toBe(copiedGroup1Id);
      expect(item2Data.workType).toBe('工種B');
      expect(item2Data.name).toBe('名称B');
      expect(item2Data.calculationMethod).toBe('AREA_VOLUME');
      expect(item2Data.calculationParams).toEqual({ width: 2.0, depth: 3.0 });
      expect(item2Data.displayOrder).toBe(1);
    });

    it('コピー元が存在しない場合はエラーを返却する（Requirements: 17.5）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.copy(sourceTableId, { name: copyName }, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('論理削除されたコピー元はエラーを返却する（Requirements: 17.5）', async () => {
      // Arrange
      // Prismaの where: { deletedAt: null } 条件により、論理削除済みレコードは
      // findUnique が null を返す動作をモックで再現
      mockPrisma.quantityTable.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.copy(sourceTableId, { name: copyName }, actorId)).rejects.toThrow(
        '数量表が見つかりません'
      );
    });

    it('エラー発生時はトランザクションROLLBACKにより不完全なコピーデータが残らない（Requirements: 17.5）', async () => {
      // Arrange
      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: 'copied-table-id',
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { groups: 0 },
      });

      // グループ作成中にエラーを発生させる
      mockPrisma.quantityGroup.create.mockRejectedValue(new Error('DB error'));

      // $transactionがcallbackのエラーをそのまま伝播することを確認
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          return callback(mockPrisma);
        }
      );

      // Act & Assert
      await expect(service.copy(sourceTableId, { name: copyName }, actorId)).rejects.toThrow(
        'DB error'
      );
    });

    it('コピー操作を監査ログに記録する', async () => {
      // Arrange
      const copiedTableId = 'copied-table-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
        updatedAt: new Date('2026-01-07T00:00:00.000Z'),
        _count: { groups: 2 },
      });
      mockPrisma.quantityGroup.create
        .mockResolvedValueOnce({ id: 'cg-1' })
        .mockResolvedValueOnce({ id: 'cg-2' });
      mockPrisma.quantityItem.create.mockResolvedValue({});

      // Act
      await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_COPIED',
          actorId,
          targetType: 'QuantityTable',
          targetId: copiedTableId,
          before: expect.objectContaining({
            sourceTableId,
            sourceName: 'テスト数量表',
          }),
          after: expect.objectContaining({
            name: copyName,
            projectId: sourceTable.projectId,
          }),
        })
      );
    });

    it('グループや項目が空の数量表もコピーできる', async () => {
      // Arrange
      const emptyTable = {
        id: sourceTableId,
        projectId: sourceTable.projectId,
        name: '空の数量表',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        groups: [],
      };

      const copiedTableId = 'copied-table-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(emptyTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: emptyTable.projectId,
        name: copyName,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { groups: 0 },
      });

      // Act
      const result = await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert
      expect(result.id).toBe(copiedTableId);
      expect(result.name).toBe(copyName);
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
    });

    it('コピーされた数量表が元の数量表と独立していること（Requirements: 17.4）', async () => {
      // Arrange
      const copiedTableId = 'copied-table-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue(sourceTable);
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: copyName,
        createdAt: new Date('2026-01-07T00:00:00.000Z'),
        updatedAt: new Date('2026-01-07T00:00:00.000Z'),
        _count: { groups: 2 },
      });

      mockPrisma.quantityGroup.create
        .mockResolvedValueOnce({
          id: 'copied-group-1',
          quantityTableId: copiedTableId,
          displayOrder: 0,
        })
        .mockResolvedValueOnce({
          id: 'copied-group-2',
          quantityTableId: copiedTableId,
          displayOrder: 1,
        });

      mockPrisma.quantityItem.create.mockResolvedValue({});

      // Act
      const result = await service.copy(sourceTableId, { name: copyName }, actorId);

      // Assert - コピーされた数量表のIDが元とは異なること（独立性の証明）
      expect(result.id).toBe(copiedTableId);
      expect(result.id).not.toBe(sourceTableId);

      // Assert - 新しい数量表が独自のIDで作成されていること
      expect(mockPrisma.quantityTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: sourceTable.projectId,
            name: copyName,
          }),
        })
      );

      // Assert - グループIDが元のグループIDと異なる新しいIDで作成されること
      const groupCreateCalls = mockPrisma.quantityGroup.create.mock.calls;
      expect(groupCreateCalls[0]![0].data.quantityTableId).toBe(copiedTableId);
      expect(groupCreateCalls[0]![0].data.quantityTableId).not.toBe(sourceTableId);

      // Assert - 項目が新しいグループIDに紐づけて作成されること
      const itemCreateCalls = mockPrisma.quantityItem.create.mock.calls;
      // グループ1の項目は新しいグループID 'copied-group-1' に紐づく
      expect(itemCreateCalls[0]![0].data.quantityGroupId).toBe('copied-group-1');
      expect(itemCreateCalls[0]![0].data.quantityGroupId).not.toBe('group-1');
      // グループ2の項目は新しいグループID 'copied-group-2' に紐づく
      expect(itemCreateCalls[2]![0].data.quantityGroupId).toBe('copied-group-2');
      expect(itemCreateCalls[2]![0].data.quantityGroupId).not.toBe('group-2');
    });

    it('コピー先の数量表名はユーザー指定の名前で作成される（Requirements: 17.2）', async () => {
      // Arrange
      const customName = 'カスタムコピー名';
      const copiedTableId = 'copied-table-id';

      mockPrisma.quantityTable.findUnique.mockResolvedValue({
        ...sourceTable,
        groups: [],
      });
      mockPrisma.quantityTable.create.mockResolvedValue({
        id: copiedTableId,
        projectId: sourceTable.projectId,
        name: customName,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { groups: 0 },
      });

      // Act
      const result = await service.copy(sourceTableId, { name: customName }, actorId);

      // Assert
      expect(result.name).toBe(customName);
      expect(mockPrisma.quantityTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: customName,
          }),
        })
      );
    });
  });

  /**
   * Task 59.1: 数量表のフル状態同期保存サービス（saveDraft）
   *
   * Requirements:
   * - 42.5: 保存操作時にクライアントの全変更（グループ/項目の追加・削除・コピー・並び替え・
   *         名称・写真紐づけ・各フィールド値）を一括でサーバーへ永続化する
   * - 42.8: 保存正常完了時に最新の数量表データを返却して画面・編集状態を同期する
   * - 42.9: 整合性エラー時はエラーを返し、未保存状態を保持して再保存可能とする（保存中断）
   * - 11.1: 全グループ・全項目を一括でデータベースに保存する
   * - 11.2: 整合性チェックでエラー検出時は保存を中断する
   * - 11.3: 計算方法と入力値の不整合検出時は保存を中断する
   * - 11.4: 不整合がある場合は問題箇所を明示する
   */
  describe('saveDraft', () => {
    const quantityTableId = '123e4567-e89b-12d3-a456-426614174002';
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    const actorId = '123e4567-e89b-12d3-a456-426614174001';
    const expectedUpdatedAt = new Date('2026-01-06T00:00:00.000Z');
    const expectedUpdatedAtIso = expectedUpdatedAt.toISOString();
    const newUpdatedAt = new Date('2026-01-06T01:00:00.000Z');

    /**
     * 有効な項目入力を生成するヘルパー（STANDARD・全フィールド適正値）
     */
    const validItem = (overrides: Record<string, unknown> = {}) => ({
      id: null,
      majorCategory: null,
      middleCategory: null,
      minorCategory: null,
      customCategory: null,
      workType: '工種',
      name: '名称',
      specification: null,
      unit: 'm',
      calculationMethod: 'STANDARD' as const,
      calculationParams: null,
      adjustmentFactor: 1.0,
      roundingUnit: 0.01,
      quantity: 10,
      remarks: null,
      displayOrder: 0,
      ...overrides,
    });

    /**
     * 「現状DB状態」用の findUnique 戻り値（ロック判定＋差分元）
     */
    const currentState = (overrides: Record<string, unknown> = {}) => ({
      id: quantityTableId,
      projectId,
      updatedAt: expectedUpdatedAt,
      deletedAt: null,
      groups: [],
      ...overrides,
    });

    /**
     * 再読込（toQuantityTableDetailWithItems 用）の完全 include 戻り値
     */
    const reloadedDetail = (overrides: Record<string, unknown> = {}) => ({
      id: quantityTableId,
      projectId,
      name: '数量表',
      createdAt: expectedUpdatedAt,
      updatedAt: newUpdatedAt,
      project: { id: projectId, name: 'テストプロジェクト' },
      groups: [],
      _count: { groups: 0 },
      ...overrides,
    });

    /**
     * findUnique を「1回目=現状DB状態」「2回目=再読込」の順で返すよう設定する
     */
    const setupFindUnique = (current: unknown, reloaded: unknown): void => {
      mockPrisma.quantityTable.findUnique
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(reloaded);
    };

    it('数量表名・グループ名・写真紐づけ・新規グループ/項目をフル状態で保存できる（REQ-42.5, 11.1）', async () => {
      // Arrange: DBは空の数量表。payloadで1グループ+1項目を新規作成
      setupFindUnique(
        currentState(),
        reloadedDetail({
          name: '更新後数量表',
          _count: { groups: 1 },
          groups: [
            {
              id: 'group-db-1',
              quantityTableId,
              name: 'グループA',
              surveyImageId: 'image-1',
              displayOrder: 0,
              createdAt: expectedUpdatedAt,
              updatedAt: newUpdatedAt,
              surveyImage: null,
              items: [
                {
                  id: 'item-db-1',
                  quantityGroupId: 'group-db-1',
                  majorCategory: null,
                  middleCategory: null,
                  minorCategory: null,
                  customCategory: null,
                  workType: '工種',
                  name: '名称',
                  specification: null,
                  unit: 'm',
                  calculationMethod: 'STANDARD',
                  calculationParams: null,
                  adjustmentFactor: { toNumber: () => 1.0 },
                  roundingUnit: { toNumber: () => 0.01 },
                  quantity: { toNumber: () => 10 },
                  remarks: null,
                  displayOrder: 0,
                  createdAt: expectedUpdatedAt,
                  updatedAt: newUpdatedAt,
                },
              ],
              _count: { items: 1 },
            },
          ],
        })
      );
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });
      mockPrisma.quantityItem.create.mockResolvedValue({ id: 'item-db-1' });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '更新後数量表',
        groups: [
          {
            id: null,
            tempId: 'tmp-g1',
            name: 'グループA',
            surveyImageId: 'image-1',
            displayOrder: 0,
            items: [validItem({ id: null, tempId: 'tmp-i1' })],
          },
        ],
      };

      // Act
      const result = await service.saveDraft(quantityTableId, input, actorId);

      // Assert: 新規グループ・新規項目が作成される
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantityTableId,
            name: 'グループA',
            surveyImageId: 'image-1',
            displayOrder: 0,
          }),
        })
      );
      expect(mockPrisma.quantityItem.create).toHaveBeenCalledTimes(1);
      // 数量表名が更新される
      expect(mockPrisma.quantityTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: quantityTableId },
          data: expect.objectContaining({ name: '更新後数量表' }),
        })
      );
      // 最新の数量表詳細（項目を含む）を返却
      expect(result.name).toBe('更新後数量表');
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.items).toHaveLength(1);
      expect(result.updatedAt).toEqual(newUpdatedAt);
      // 監査ログ記録
      expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUANTITY_TABLE_BULK_SAVED',
          actorId,
          targetType: 'QuantityTable',
          targetId: quantityTableId,
        })
      );
    });

    it('既存グループ/項目を更新（id一致）し、グループ名・写真紐づけ・displayOrderを反映する（REQ-42.5）', async () => {
      // Arrange: DBに group-1(item-1) が存在
      setupFindUnique(
        currentState({
          groups: [{ id: 'group-1', items: [{ id: 'item-1' }] }],
        }),
        reloadedDetail()
      );
      mockPrisma.quantityGroup.update.mockResolvedValue({ id: 'group-1' });
      mockPrisma.quantityItem.update.mockResolvedValue({ id: 'item-1' });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: 'リネーム後',
            surveyImageId: 'image-9',
            displayOrder: 0,
            items: [validItem({ id: 'item-1', name: '更新名称', displayOrder: 0 })],
          },
        ],
      };

      // Act
      await service.saveDraft(quantityTableId, input, actorId);

      // Assert: 既存グループ更新（名称・写真・順序）
      expect(mockPrisma.quantityGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-1' },
          data: expect.objectContaining({
            name: 'リネーム後',
            surveyImageId: 'image-9',
            displayOrder: 0,
          }),
        })
      );
      // 既存項目更新
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({ name: '更新名称', displayOrder: 0 }),
        })
      );
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
    });

    it('payloadに存在しないDBグループ/項目を削除する（REQ-42.5 削除同期）', async () => {
      // Arrange: DBに group-1(item-1,item-2) と group-2 が存在。payloadは group-1(item-1) のみ
      setupFindUnique(
        currentState({
          groups: [
            { id: 'group-1', items: [{ id: 'item-1' }, { id: 'item-2' }] },
            { id: 'group-2', items: [] },
          ],
        }),
        reloadedDetail()
      );
      mockPrisma.quantityGroup.update.mockResolvedValue({ id: 'group-1' });
      mockPrisma.quantityItem.update.mockResolvedValue({ id: 'item-1' });
      mockPrisma.quantityGroup.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.quantityItem.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: 'item-1', displayOrder: 0 })],
          },
        ],
      };

      // Act
      await service.saveDraft(quantityTableId, input, actorId);

      // Assert: group-2 が削除対象
      expect(mockPrisma.quantityGroup.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.arrayContaining(['group-2']) } },
        })
      );
      // item-2 が削除対象
      expect(mockPrisma.quantityItem.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.arrayContaining(['item-2']) } },
        })
      );
    });

    it('displayOrderはpayloadの配列順を正として並び替えを反映する（REQ-42.5 並び替え）', async () => {
      // Arrange: DBに group-1, group-2。payloadで順序を入れ替え
      setupFindUnique(
        currentState({
          groups: [
            { id: 'group-1', items: [] },
            { id: 'group-2', items: [] },
          ],
        }),
        reloadedDetail()
      );
      mockPrisma.quantityGroup.update.mockResolvedValue({});
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: 'group-2', name: 'G2', surveyImageId: null, displayOrder: 0, items: [] },
          { id: 'group-1', name: 'G1', surveyImageId: null, displayOrder: 1, items: [] },
        ],
      };

      // Act
      await service.saveDraft(quantityTableId, input, actorId);

      // Assert: group-2 は displayOrder=0、group-1 は displayOrder=1
      expect(mockPrisma.quantityGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-2' },
          data: expect.objectContaining({ displayOrder: 0 }),
        })
      );
      expect(mockPrisma.quantityGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-1' },
          data: expect.objectContaining({ displayOrder: 1 }),
        })
      );
    });

    it('expectedUpdatedAt不一致時はQuantityTableConflictErrorをスローする（409 / REQ-42.9）', async () => {
      // Arrange: DBのupdatedAtがexpectedと異なる
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        currentState({ updatedAt: new Date('2026-01-06T02:00:00.000Z') })
      );

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [],
      };

      // Act & Assert
      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        QuantityTableConflictError
      );
      // 書き込みは行われない
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
    });

    it('数量表が存在しない/論理削除済みの場合はQuantityTableNotFoundErrorをスローする', async () => {
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(null);

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [],
      };

      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        QuantityTableNotFoundError
      );
    });

    it('整合性エラー（面積・体積モードで計算用列が未入力）時は保存を中断する（REQ-11.2, 11.3, 42.9）', async () => {
      // Arrange: ロック判定は通過するが、項目がバリデーション違反
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(currentState());

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: null,
            name: 'グループ',
            surveyImageId: null,
            displayOrder: 0,
            items: [
              validItem({
                id: null,
                calculationMethod: 'AREA_VOLUME',
                calculationParams: {}, // 計算用列が空 → REQ-8.7 エラー
                quantity: 0,
              }),
            ],
          },
        ],
      };

      // Act & Assert: バリデーションエラーで保存中断（書き込みなし）
      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        QuantityTableValidationError
      );
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
    });

    it('文字数超過（名称が上限超過）時は保存を中断する（REQ-11.2, 11.4）', async () => {
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(currentState());

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: null,
            name: 'グループ',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: null, name: 'あ'.repeat(201) })], // 名称200文字超過
          },
        ],
      };

      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        QuantityTableValidationError
      );
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
    });

    it('単一トランザクション内で実行され、書き込み失敗時はロールバックされる（部分反映なし）', async () => {
      // Arrange: $transaction が失敗を伝播することを確認
      setupFindUnique(currentState({ groups: [{ id: 'group-1', items: [] }] }), reloadedDetail());
      mockPrisma.quantityGroup.update.mockRejectedValue(new Error('DB write failed'));

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: 'group-1', name: 'G1', surveyImageId: null, displayOrder: 0, items: [] }],
      };

      // Act & Assert: エラーが伝播し、$transaction（=ロールバック）経由で実行される
      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        'DB write failed'
      );
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    /**
     * Task 59.3 で追加するカバレッジ補強テスト群。
     *
     * 59.1 の既存テストは「検証エラーで update/create が呼ばれない」ことまでは確認するが、
     * 以下の 59.3 要件（保存中断の厳密さ・問題箇所の明示）は未検証のため補強する。
     */

    it('検証エラー時はトランザクション自体を開始しない（DB読み書きを一切行わない / REQ-42.9, 11.2）', async () => {
      // Arrange: ロック判定に到達する前（=トランザクション開始前）に検証で中断されることを確認する。
      // validateDraft は $transaction の外（トランザクション開始前）で実行される設計（design.md L939-941）。
      // findUnique も含め DB アクセスは一切発生してはならない。
      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: null,
            name: 'グループ',
            surveyImageId: null,
            displayOrder: 0,
            // 計算用列が空の AREA_VOLUME → 計算整合性エラー（REQ-11.3）
            items: [
              validItem({ id: null, calculationMethod: 'AREA_VOLUME', calculationParams: {} }),
            ],
          },
        ],
      };

      // Act & Assert
      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toThrow(
        QuantityTableValidationError
      );
      // トランザクションを開始していない（=部分反映の余地が一切ない）
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      // DB 読み取り（ロック判定の findUnique）も行われない
      expect(mockPrisma.quantityTable.findUnique).not.toHaveBeenCalled();
      // 監査ログも記録されない
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('検証エラーは問題箇所をフィールドパス付きで明示する（REQ-11.4）', async () => {
      // Arrange: groups[0].items[0] の name が文字数上限超過
      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: null,
            name: 'グループ',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: null, name: 'あ'.repeat(201) })],
          },
        ],
      };

      // Act & Assert: スローされた例外の validationErrors に問題箇所のパスが含まれる
      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      const validationError = caught as QuantityTableValidationError;
      // REQ-11.4: 問題箇所（どのグループのどの項目のどのフィールドか）を明示する
      expect(validationError.validationErrors).toBeDefined();
      expect(validationError.validationErrors).toHaveProperty('groups[0].items[0].name');
      expect(validationError.validationErrors!['groups[0].items[0].name']).toEqual(
        expect.any(String)
      );
    });

    it('複数項目・複数フィールドの違反を集約して全て明示する（REQ-11.4 問題箇所の網羅明示）', async () => {
      // Arrange: 異なるグループ・異なる項目で別種の違反を同時に発生させる
      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: null,
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            // items[0]: 名称が上限超過（文字数違反）
            items: [validItem({ id: null, name: 'あ'.repeat(201), displayOrder: 0 })],
          },
          {
            id: null,
            name: 'グループ2',
            surveyImageId: null,
            displayOrder: 1,
            // items[0]: AREA_VOLUME だが計算用列が空（計算整合違反）
            items: [
              validItem({
                id: null,
                calculationMethod: 'AREA_VOLUME',
                calculationParams: {},
                displayOrder: 0,
              }),
            ],
          },
        ],
      };

      // Act & Assert
      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      const validationError = caught as QuantityTableValidationError;
      const keys = Object.keys(validationError.validationErrors ?? {});
      // 1件目で打ち切らず、両グループの違反を集約して明示する
      expect(keys).toEqual(expect.arrayContaining([expect.stringContaining('groups[0].items[0]')]));
      expect(keys).toEqual(expect.arrayContaining([expect.stringContaining('groups[1].items[0]')]));
      // いずれの場合も書き込みは行われない
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * 保存対象の所属検証。
     *
     * payload の既存ID（グループ・項目）が当該数量表に属することを検証する。
     * 属さないIDを受け入れると、他の数量表の項目が所属ごと付け替えられる。
     */
    it('当該数量表に属さない項目IDを含む場合は保存を中断し書き込みを行わない（REQ-42.9, 11.2）', async () => {
      // Arrange: DB には group-1(item-1) のみ存在する
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        currentState({ groups: [{ id: 'group-1', items: [{ id: 'item-1' }] }] })
      );

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            items: [
              validItem({ id: 'item-1', displayOrder: 0 }),
              // 他の数量表に属する項目ID
              validItem({ id: 'item-of-other-table', displayOrder: 1 }),
            ],
          },
        ],
      };

      // Act & Assert
      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      // REQ-11.4: 問題箇所を明示する
      expect((caught as QuantityTableValidationError).validationErrors).toHaveProperty([
        'groups[0].items[1].id',
      ]);
      // 書き込みは一切行われない（部分反映なし）
      expect(mockPrisma.quantityItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('当該数量表に属さないグループIDを含む場合は保存を中断し書き込みを行わない（REQ-42.9, 11.2）', async () => {
      // Arrange: DB には group-1 のみ存在する
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        currentState({ groups: [{ id: 'group-1', items: [] }] })
      );

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            // 他の数量表に属するグループID
            id: 'group-of-other-table',
            name: '乗っ取りグループ',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: null, displayOrder: 0 })],
          },
        ],
      };

      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      expect((caught as QuantityTableValidationError).validationErrors).toHaveProperty([
        'groups[0].id',
      ]);
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
    });

    /**
     * 保存要求内の識別子重複検証。
     *
     * 同一IDが payload に複数回現れると、同じ行が複数回更新されるうえ、
     * 削除判定の集合にも含まれるため削除対象から外れ、意図しない状態が生じる。
     */
    it('同一の項目IDが複数回現れる場合は保存を中断し書き込みを行わない（REQ-42.9, 11.2）', async () => {
      // Arrange: DB には group-1(item-1, item-2), group-2 が存在する
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        currentState({
          groups: [
            { id: 'group-1', items: [{ id: 'item-1' }, { id: 'item-2' }] },
            { id: 'group-2', items: [] },
          ],
        })
      );

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: 'item-1', displayOrder: 0 })],
          },
          {
            id: 'group-2',
            name: 'グループ2',
            surveyImageId: null,
            displayOrder: 1,
            // 同一項目IDの再出現（二重更新かつ削除対象からの脱落を招く）
            items: [validItem({ id: 'item-1', displayOrder: 0 })],
          },
        ],
      };

      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      // REQ-11.4: 問題箇所（2件目の出現位置）を明示する
      expect((caught as QuantityTableValidationError).validationErrors).toHaveProperty([
        'groups[1].items[0].id',
      ]);
      // 書き込みは一切行われない（部分反映なし）
      expect(mockPrisma.quantityItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityItem.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('同一のグループIDが複数回現れる場合は保存を中断し書き込みを行わない（REQ-42.9, 11.2）', async () => {
      mockPrisma.quantityTable.findUnique.mockResolvedValueOnce(
        currentState({
          groups: [
            { id: 'group-1', items: [] },
            { id: 'group-2', items: [] },
          ],
        })
      );

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: '重複1回目',
            surveyImageId: null,
            displayOrder: 0,
            items: [],
          },
          {
            // 同一グループIDの再出現（group-2 が削除対象になる副作用も伴う）
            id: 'group-1',
            name: '重複2回目',
            surveyImageId: null,
            displayOrder: 1,
            items: [],
          },
        ],
      };

      let caught: unknown;
      try {
        await service.saveDraft(quantityTableId, input, actorId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(QuantityTableValidationError);
      expect((caught as QuantityTableValidationError).validationErrors).toHaveProperty([
        'groups[1].id',
      ]);
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.quantityTable.update).not.toHaveBeenCalled();
      expect(mockAuditLogService.createLog).not.toHaveBeenCalled();
    });

    it('新規（id=null）が複数含まれても重複とはみなさず保存する（過剰な拒否の防止）', async () => {
      // Arrange: 新規は識別子を持たないため、複数現れても重複ではない
      setupFindUnique(currentState({ groups: [{ id: 'group-1', items: [] }] }), reloadedDetail());
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-new' });
      mockPrisma.quantityItem.create.mockResolvedValue({ id: 'item-db-new' });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: 'group-1',
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            items: [
              validItem({ id: null, displayOrder: 0 }),
              validItem({ id: null, displayOrder: 1 }),
            ],
          },
          {
            id: null,
            name: '新規グループA',
            surveyImageId: null,
            displayOrder: 1,
            items: [validItem({ id: null, displayOrder: 0 })],
          },
          {
            id: null,
            name: '新規グループB',
            surveyImageId: null,
            displayOrder: 2,
            items: [],
          },
        ],
      };

      await expect(service.saveDraft(quantityTableId, input, actorId)).resolves.toBeDefined();
      expect(mockPrisma.quantityItem.create).toHaveBeenCalledTimes(3);
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalledTimes(2);
    });

    /**
     * グループIDと項目IDは別の表の識別子であり、別々の集合で判定する（Task 115.44）。
     *
     * 両者を同じ集合で判定すると、グループIDと項目IDが同じ値になった要求を「重複」と
     * 誤って拒否する。実データはいずれも UUID のため衝突は事実上起きないが、
     * 集合を分けているという判断が検証で守られていない状態だった（同じ集合にしても
     * 全ての検証が成功していた）。ここで名前空間の分離そのものを検証する。
     */
    it('グループIDと項目IDが同じ値でも重複とはみなさず保存する（識別子の集合を分けて判定する）', async () => {
      // Arrange: グループと項目が同じ識別子を持つ状態（別の表の識別子であり衝突ではない）
      const sharedId = 'same-id-in-different-tables';
      setupFindUnique(
        currentState({ groups: [{ id: sharedId, items: [{ id: sharedId }] }] }),
        reloadedDetail()
      );
      mockPrisma.quantityGroup.update.mockResolvedValue({ id: sharedId });
      mockPrisma.quantityItem.update.mockResolvedValue({ id: sharedId });
      mockPrisma.quantityTable.update.mockResolvedValue({
        id: quantityTableId,
        updatedAt: newUpdatedAt,
      });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          {
            id: sharedId,
            name: 'グループ1',
            surveyImageId: null,
            displayOrder: 0,
            items: [validItem({ id: sharedId, name: '更新名称', displayOrder: 0 })],
          },
        ],
      };

      // Act & Assert: 拒否されず、グループ・項目とも更新される
      await expect(service.saveDraft(quantityTableId, input, actorId)).resolves.toBeDefined();
      expect(mockPrisma.quantityGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: sharedId } })
      );
      expect(mockPrisma.quantityItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: sharedId } })
      );
    });

    it('親の現場調査が論理削除済みの現調画像を含む保存は書き込み前に中断する（Task 81.1）', async () => {
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174010';
      const surveyId = '123e4567-e89b-12d3-a456-426614174011';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        {
          id: surveyImageId,
          surveyId,
          survey: { projectId, deletedAt: new Date('2026-09-01T00:00:00.000Z') },
        },
      ]);
      // 検査が無ければ書き込みが通ることを露わにするため、後続の経路も用意しておく
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId, displayOrder: 0, items: [] }],
      };

      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toBeInstanceOf(
        SurveyDeletedError
      );
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
    });

    it('現調画像の問い合わせはグループ数によらず1回で、重複を排除した集合を引く（Task 81.1）', async () => {
      const firstImageId = '123e4567-e89b-12d3-a456-426614174010';
      const secondImageId = '123e4567-e89b-12d3-a456-426614174012';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: firstImageId, surveyId: 'survey-1', survey: { projectId, deletedAt: null } },
        { id: secondImageId, surveyId: 'survey-2', survey: { projectId, deletedAt: null } },
      ]);
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      // 5グループ・参照する画像は2種（うち1種は3グループが重複して指す）・1グループは未紐付け
      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: null, name: 'g1', surveyImageId: firstImageId, displayOrder: 0, items: [] },
          { id: null, name: 'g2', surveyImageId: firstImageId, displayOrder: 1, items: [] },
          { id: null, name: 'g3', surveyImageId: secondImageId, displayOrder: 2, items: [] },
          { id: null, name: 'g4', surveyImageId: firstImageId, displayOrder: 3, items: [] },
          { id: null, name: 'g5', surveyImageId: null, displayOrder: 4, items: [] },
        ],
      };

      await service.saveDraft(quantityTableId, input, actorId);

      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [firstImageId, secondImageId] } },
          select: expect.objectContaining({
            surveyId: true,
            survey: { select: { projectId: true, deletedAt: true } },
          }),
        })
      );
    });

    it('現調画像を一つも指さない保存では画像の問い合わせを行わない（Task 81.1）', async () => {
      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId: null, displayOrder: 0, items: [] }],
      };

      await service.saveDraft(quantityTableId, input, actorId);

      expect(mockPrisma.surveyImage.findMany).not.toHaveBeenCalled();
    });

    /*
     * 存在の検査（Task 86.2）
     *
     * Task 81.1 の時点では、行が返らなかった画像IDには何も主張せず保存を通していた
     * （旧検証「指した現調画像が見つからない場合は論理削除の判定を適用しない」）。
     * その挙動は外部キー制約違反として書き込み時に表面化し 500 になっていたため、
     * Task 86.2 で向きを反転させ、書き込み前に中断させる。
     *
     * 反転した主張が恒真でないことは、直後の対（行が返る場合）が示す。
     * 同じ入力・同じ枠で findMany の戻り値だけを変え、一方は中断し他方は保存が通る。
     */
    it('指した現調画像が見つからない場合は書き込み前に中断する（Task 86.2）', async () => {
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174013';

      setupFindUnique(currentState(), reloadedDetail());
      // 要求した ID に対して行が1件も返らない = 実在しない
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);
      // 検査が無ければ書き込みが通ることを露わにするため、後続の経路も用意しておく
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId, displayOrder: 0, items: [] }],
      };

      const thrown = await service
        .saveDraft(quantityTableId, input, actorId)
        .then(() => null)
        .catch((error: unknown) => error);

      // 応答の形は QuantityGroupService.validateSurveyImage と同一にする
      // （404・同じ code・同じ文言）
      expect(thrown).toBeInstanceOf(SurveyImageNotFoundError);
      // Task 86.5: 文言は日本語で画像IDを含まない。画像IDは surveyImageId で持つ
      expect((thrown as SurveyImageNotFoundError).message).toBe('現場調査画像が見つかりません');
      expect((thrown as SurveyImageNotFoundError).surveyImageId).toBe(surveyImageId);
      expect((thrown as SurveyImageNotFoundError).statusCode).toBe(404);
      expect((thrown as SurveyImageNotFoundError).code).toBe('SURVEY_IMAGE_NOT_FOUND');
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
    });

    it('同じ入力でも行が返れば保存は通る（存在の検査が恒真でないことの対・Task 86.2）', async () => {
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174013';

      setupFindUnique(currentState(), reloadedDetail());
      // 直前の検証と異なるのは findMany の戻り値だけである
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: surveyImageId, surveyId: 'survey-1', survey: { projectId, deletedAt: null } },
      ]);
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId, displayOrder: 0, items: [] }],
      };

      await expect(service.saveDraft(quantityTableId, input, actorId)).resolves.toBeDefined();
      expect(mockPrisma.quantityGroup.create).toHaveBeenCalled();
    });

    it('一部の現調画像だけが見つからない場合も保存全体を中断する（Task 86.2）', async () => {
      const existingImageId = '123e4567-e89b-12d3-a456-426614174018';
      const missingImageId = '123e4567-e89b-12d3-a456-426614174019';

      setupFindUnique(currentState(), reloadedDetail());
      // 要求は2件、返るのは1件だけ
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: existingImageId, surveyId: 'survey-1', survey: { projectId, deletedAt: null } },
      ]);
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: null, name: 'g1', surveyImageId: existingImageId, displayOrder: 0, items: [] },
          { id: null, name: 'g2', surveyImageId: missingImageId, displayOrder: 1, items: [] },
        ],
      };

      const thrown = await service
        .saveDraft(quantityTableId, input, actorId)
        .then(() => null)
        .catch((error: unknown) => error);

      // 名指すのは見つからなかった側の画像である
      expect(thrown).toBeInstanceOf(SurveyImageNotFoundError);
      expect((thrown as SurveyImageNotFoundError).surveyImageId).toBe(missingImageId);
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      // 存在の判定は「要求した ID の集合」と「返った行の集合」の差で行うため、
      // 存在を確かめるための問い合わせは増えていない
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledTimes(1);
    });

    it('存在しない画像が複数あるときは payload で先に現れたものを名指す（Task 86.2）', async () => {
      const firstMissingImageId = '123e4567-e89b-12d3-a456-426614174020';
      const secondMissingImageId = '123e4567-e89b-12d3-a456-426614174021';

      setupFindUnique(currentState(), reloadedDetail());
      // 2件とも行が返らない
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: null, name: 'g1', surveyImageId: firstMissingImageId, displayOrder: 0, items: [] },
          { id: null, name: 'g2', surveyImageId: secondMissingImageId, displayOrder: 1, items: [] },
        ],
      };

      const thrown = await service
        .saveDraft(quantityTableId, input, actorId)
        .then(() => null)
        .catch((error: unknown) => error);

      // 判定は要求した ID の並び（payload の出現順）で行う。findMany の戻り値の並びは
      // 指定していないため、行の並びで回すと名指す画像が定まらない
      expect((thrown as SurveyImageNotFoundError).surveyImageId).toBe(firstMissingImageId);
    });

    it('他プロジェクトの現調画像を含む保存は書き込み前に中断する（Task 86.1）', async () => {
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174014';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        {
          id: surveyImageId,
          surveyId: 'survey-other-project',
          // 親の現場調査は生きているが、当該数量表とは別のプロジェクトに属する
          survey: { projectId: 'other-project-id', deletedAt: null },
        },
      ]);
      // 検査が無ければ書き込みが通ることを露わにするため、後続の経路も用意しておく
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId, displayOrder: 0, items: [] }],
      };

      const thrown = await service
        .saveDraft(quantityTableId, input, actorId)
        .then(() => null)
        .catch((error: unknown) => error);

      // 応答の形は QuantityGroupService.validateSurveyImage と同一にする（400・同じ文言）
      expect(thrown).toBeInstanceOf(QuantityTableValidationError);
      expect((thrown as QuantityTableValidationError).message).toBe(
        '異なるプロジェクトの現場調査画像は紐付けできません'
      );
      expect((thrown as QuantityTableValidationError).statusCode).toBe(400);
      expect((thrown as QuantityTableValidationError).code).toBe('QUANTITY_TABLE_VALIDATION_ERROR');
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
      expect(mockPrisma.quantityGroup.update).not.toHaveBeenCalled();
    });

    it('所属違反の 400 は原因のグループを payload の位置で名指し、違反しないグループは名指さない（Task 86.4）', async () => {
      const ownImageId = '123e4567-e89b-12d3-a456-426614174022';
      const firstForeignImageId = '123e4567-e89b-12d3-a456-426614174023';
      const secondForeignImageId = '123e4567-e89b-12d3-a456-426614174024';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: ownImageId, surveyId: 'survey-own', survey: { projectId, deletedAt: null } },
        {
          id: firstForeignImageId,
          surveyId: 'survey-other-1',
          survey: { projectId: 'other-project-id', deletedAt: null },
        },
        {
          id: secondForeignImageId,
          surveyId: 'survey-other-2',
          survey: { projectId: 'another-project-id', deletedAt: null },
        },
      ]);

      // 違反するグループ（1・3・4）と違反しないグループ（0 = 同一プロジェクトの画像、
      // 2 = 画像なし）を混ぜる。3 は 1 と同じ画像を指すため、画像の重複排除の後でも
      // グループ単位で名指せることを確かめる。4 は別の他プロジェクトの画像を指すため、
      // 最初に出会った違反で名指しを打ち切らないことを確かめる。
      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: null, name: 'g0', surveyImageId: ownImageId, displayOrder: 0, items: [] },
          { id: null, name: 'g1', surveyImageId: firstForeignImageId, displayOrder: 1, items: [] },
          { id: null, name: 'g2', surveyImageId: null, displayOrder: 2, items: [] },
          { id: null, name: 'g3', surveyImageId: firstForeignImageId, displayOrder: 3, items: [] },
          { id: null, name: 'g4', surveyImageId: secondForeignImageId, displayOrder: 4, items: [] },
        ],
      };

      const thrown = await service
        .saveDraft(quantityTableId, input, actorId)
        .then(() => null)
        .catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(QuantityTableValidationError);
      // 全体の文言は紐付け経路（validateSurveyImage）と同一のまま据え置く
      expect((thrown as QuantityTableValidationError).message).toBe(
        '異なるプロジェクトの現場調査画像は紐付けできません'
      );
      // 問題箇所の名指しは validateDraftOwnership / validateDraftDuplicateIds と同じ
      // `groups[i].<欄>` の形にする。キーの集合まで一致させ、過不足の双方を捕まえる
      expect((thrown as QuantityTableValidationError).validationErrors).toEqual({
        'groups[1].surveyImageId': '異なるプロジェクトの現場調査画像は紐付けできません',
        'groups[3].surveyImageId': '異なるプロジェクトの現場調査画像は紐付けできません',
        'groups[4].surveyImageId': '異なるプロジェクトの現場調査画像は紐付けできません',
      });
      // 名指しのために問い合わせを増やしていない
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.quantityGroup.create).not.toHaveBeenCalled();
    });

    it('所属違反と親の論理削除の双方に該当する現調画像は所属違反として拒む（Task 86.1）', async () => {
      const surveyImageId = '123e4567-e89b-12d3-a456-426614174015';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        {
          id: surveyImageId,
          surveyId: 'survey-other-project-deleted',
          survey: {
            projectId: 'other-project-id',
            deletedAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        },
      ]);

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [{ id: null, name: 'グループ1', surveyImageId, displayOrder: 0, items: [] }],
      };

      // 検査の相対順序も validateSurveyImage に揃える（所属を先に見るため 410 ではなく 400）
      await expect(service.saveDraft(quantityTableId, input, actorId)).rejects.toBeInstanceOf(
        QuantityTableValidationError
      );
    });

    it('所属の検査を加えても現調画像の問い合わせは1回のままである（Task 86.1）', async () => {
      const firstImageId = '123e4567-e89b-12d3-a456-426614174016';
      const secondImageId = '123e4567-e89b-12d3-a456-426614174017';

      setupFindUnique(currentState(), reloadedDetail());
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        { id: firstImageId, surveyId: 'survey-1', survey: { projectId, deletedAt: null } },
        { id: secondImageId, surveyId: 'survey-2', survey: { projectId, deletedAt: null } },
      ]);
      mockPrisma.quantityGroup.create.mockResolvedValue({ id: 'group-db-1' });

      const input = {
        expectedUpdatedAt: expectedUpdatedAtIso,
        name: '数量表',
        groups: [
          { id: null, name: 'g1', surveyImageId: firstImageId, displayOrder: 0, items: [] },
          { id: null, name: 'g2', surveyImageId: secondImageId, displayOrder: 1, items: [] },
          { id: null, name: 'g3', surveyImageId: firstImageId, displayOrder: 2, items: [] },
        ],
      };

      await service.saveDraft(quantityTableId, input, actorId);

      // 突き合わせ先の projectId は数量表の読み出し（findUnique）で既に得ているため、
      // 所属の判定のために増える問い合わせは無い
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledTimes(1);
      // 数量表の読み出しも従来どおり2回（現状取得・再読込）のままである
      expect(mockPrisma.quantityTable.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
