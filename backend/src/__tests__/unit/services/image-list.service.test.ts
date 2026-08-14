/**
 * @fileoverview 画像一覧取得サービスのテスト
 *
 * Task 6.2: 画像管理エンドポイントを実装する
 * - GET /api/site-surveys/:id/images（一覧）
 *
 * Requirements:
 * - 4.10: 画像一覧を固定の表示順序で表示する
 *
 * @module tests/unit/services/image-list.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prismaモック
const mockPrisma = {
  surveyImage: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  siteSurvey: {
    findUnique: vi.fn(),
  },
  imageAnnotation: {
    findMany: vi.fn(),
  },
};

// SignedUrlServiceモック
const mockSignedUrlService = {
  generateSignedUrl: vi.fn(),
  generateBatchSignedUrls: vi.fn(),
  validateSurveyAccess: vi.fn(),
};

// storageモック
const mockStorageProvider = {
  getSignedUrl: vi.fn(),
  get: vi.fn(),
  upload: vi.fn(),
  delete: vi.fn(),
  type: 'local',
};

vi.mock('../../../generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn(() => false),
  getStorageProvider: vi.fn(() => null),
}));

import { ImageListService } from '../../../services/image-list.service.js';
import { isStorageConfigured, getStorageProvider } from '../../../storage/index.js';

describe('ImageListService', () => {
  let service: ImageListService;

  beforeEach(() => {
    vi.clearAllMocks();
    // 既定はストレージ未設定・権限ありとし、各テストで必要に応じて上書きする
    vi.mocked(isStorageConfigured).mockReturnValue(false);
    vi.mocked(getStorageProvider).mockReturnValue(null);
    mockSignedUrlService.validateSurveyAccess.mockResolvedValue(true);
    mockStorageProvider.getSignedUrl.mockImplementation((objectKey: string) =>
      Promise.resolve(`https://r2.example.com/${objectKey}`)
    );
    service = new ImageListService({
      prisma: mockPrisma as never,
      signedUrlService: mockSignedUrlService as never,
    });
  });

  /**
   * ストレージ設定済み・プロバイダありの状態にする
   */
  const configureStorage = () => {
    vi.mocked(isStorageConfigured).mockReturnValue(true);
    vi.mocked(getStorageProvider).mockReturnValue(mockStorageProvider as never);
  };

  describe('findBySurveyId', () => {
    it('現場調査に紐付く画像一覧をdisplayOrderでソートして返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'img-2',
          surveyId,
          fileName: 'image2.jpg',
          fileSize: 2048,
          width: 1024,
          height: 768,
          displayOrder: 2,
          originalPath: 'surveys/123/original2.jpg',
          thumbnailPath: 'surveys/123/thumb2.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);

      const result = await service.findBySurveyId(surveyId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('img-1');
      expect(result[1]?.id).toBe('img-2');
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledWith({
        where: { surveyId },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: expect.any(Object),
      });
    });

    it('画像がない場合は空配列を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      const result = await service.findBySurveyId(surveyId);

      expect(result).toEqual([]);
    });
  });

  describe('findBySurveyIdWithUrls', () => {
    it('署名付きURLを含む画像一覧を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalUrl).toBe('https://r2.example.com/surveys/123/original1.jpg');
      expect(result[0]?.thumbnailUrl).toBe('https://r2.example.com/surveys/123/thumb1.jpg');
    });

    it('署名付きURL生成に失敗した画像にはnullを設定すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();
      mockStorageProvider.getSignedUrl.mockRejectedValue(new Error('URL generation failed'));

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalUrl).toBeNull();
      expect(result[0]?.thumbnailUrl).toBeNull();
    });

    /**
     * 画面表示の効率化（権限検証の現場調査単位への集約）が、アクセス可否の判定結果を
     * 変えないことを固定する。
     *
     * @requirement site-survey/REQ-38.9
     */
    it('アクセス権限がない場合は原画像URLをnullにすること (site-survey/REQ-38.9)', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();
      mockSignedUrlService.validateSurveyAccess.mockResolvedValue(false);

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.originalUrl).toBeNull();
    });

    /**
     * 権限検証の集約が「1回だけ・同じ引数で」行われることを固定する。判定の入力
     * （現場調査IDと利用者ID）が削減の前後で変わらないことが、判定結果を変えないこと
     * （site-survey/REQ-38.9）の根拠になる。
     *
     * @requirement site-survey/REQ-38.9
     */
    it('画像枚数によらずアクセス権限検証を1回だけ行い、画像ごとの署名付きURL再照会を行わないこと (site-survey/REQ-38.9)', async () => {
      // 写真が多い現場調査で画面読み込み時のクエリ数が枚数に比例しないことを保証する。
      // Requirements: 16.1（画像一覧の初期表示を2秒以内に完了する）
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = Array.from({ length: 10 }, (_, index) => ({
        id: `img-${index + 1}`,
        surveyId,
        fileName: `image${index + 1}.jpg`,
        fileSize: 1024,
        width: 800,
        height: 600,
        displayOrder: index + 1,
        originalPath: `surveys/123/original${index + 1}.jpg`,
        thumbnailPath: `surveys/123/thumb${index + 1}.jpg`,
        annotatedThumbnailPath: null,
        createdAt: new Date('2024-01-01'),
      }));

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(10);
      // 権限検証は現場調査単位で1回のみ
      expect(mockSignedUrlService.validateSurveyAccess).toHaveBeenCalledTimes(1);
      expect(mockSignedUrlService.validateSurveyAccess).toHaveBeenCalledWith(surveyId, userId);
      // 画像IDからストレージキーを引き直す経路（DB再照会を伴う）は使わない
      expect(mockSignedUrlService.generateSignedUrl).not.toHaveBeenCalled();
      expect(mockSignedUrlService.generateBatchSignedUrls).not.toHaveBeenCalled();
      // 画像一覧・注釈有無の取得はそれぞれ1クエリに収まる
      expect(mockPrisma.surveyImage.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.imageAnnotation.findMany).toHaveBeenCalledTimes(1);
    });

    it('レスポンスにhasAnnotationsフィールドが含まれること (Task 55.1, Requirement 20.4)', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'img-2',
          surveyId,
          fileName: 'image2.jpg',
          fileSize: 2048,
          width: 1024,
          height: 768,
          displayOrder: 2,
          originalPath: 'surveys/123/original2.jpg',
          thumbnailPath: 'surveys/123/thumb2.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-02'),
        },
      ];

      // img-1のみ注釈あり
      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([{ imageId: 'img-1' }]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(2);
      // img-1は注釈あり
      expect(result[0]?.hasAnnotations).toBe(true);
      // img-2は注釈なし
      expect(result[1]?.hasAnnotations).toBe(false);
    });

    it('画像が0件の場合は空配列を早期リターンすること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toEqual([]);
      // 注釈取得・権限検証・URL生成はいずれも呼ばれない
      expect(mockPrisma.imageAnnotation.findMany).not.toHaveBeenCalled();
      expect(mockSignedUrlService.validateSurveyAccess).not.toHaveBeenCalled();
      expect(mockStorageProvider.getSignedUrl).not.toHaveBeenCalled();
    });

    it('annotatedThumbnailPathがありストレージ設定済みの場合、注釈付きサムネイルURLを生成すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: 'annotated-thumbnails/img-1.jpg',
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([{ imageId: 'img-1' }]);

      // ストレージ設定済み・プロバイダあり
      configureStorage();
      mockStorageProvider.getSignedUrl.mockResolvedValue('https://r2.example.com/annotated-thumb1');

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.annotatedThumbnailUrl).toBe('https://r2.example.com/annotated-thumb1');
      expect(mockStorageProvider.getSignedUrl).toHaveBeenCalledWith(
        'annotated-thumbnails/img-1.jpg',
        { expiresIn: 900 }
      );
    });

    it('注釈付きサムネイルURL生成に失敗した場合はnullを設定すること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: 'annotated-thumbnails/img-1.jpg',
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);

      // ストレージ設定済みだがURL生成失敗
      configureStorage();
      mockStorageProvider.getSignedUrl.mockRejectedValue(new Error('signed url failed'));

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.annotatedThumbnailUrl).toBeNull();
    });

    it('getStorageProviderがnullを返す場合はannotatedThumbnailUrlがnullになること', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: 'annotated-thumbnails/img-1.jpg',
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);

      vi.mocked(isStorageConfigured).mockReturnValue(true);
      vi.mocked(getStorageProvider).mockReturnValue(null);

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.annotatedThumbnailUrl).toBeNull();
    });

    it('annotatedThumbnailUrlフィールドが含まれること (Task 55.1, Requirement 20.4)', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = 'user-123';
      const mockImages = [
        {
          id: 'img-1',
          surveyId,
          fileName: 'image1.jpg',
          fileSize: 1024,
          width: 800,
          height: 600,
          displayOrder: 1,
          originalPath: 'surveys/123/original1.jpg',
          thumbnailPath: 'surveys/123/thumb1.jpg',
          annotatedThumbnailPath: null,
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.surveyImage.findMany.mockResolvedValue(mockImages);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result).toHaveLength(1);
      // annotatedThumbnailPathがnullの場合はannotatedThumbnailUrlもnull
      expect(result[0]?.annotatedThumbnailUrl).toBeNull();
    });
  });

  // ==========================================================================
  // Task 115.13: 描画された注釈の有無を示す項目を設ける
  //
  // 現場調査詳細画面の画像一覧はこの経路の応答を用いる。既存の hasAnnotations は
  // 「注釈レコードの存在」から導出されるため、注釈0件（回転のみ）の保存でも真になる。
  // 描画された注釈の有無は派生項目 hasDrawnAnnotations で供給する。
  //
  // Requirements: 20.2
  // ==========================================================================
  describe('findBySurveyIdWithUrls - 描画された注釈の有無 (Task 115.13, Requirements: 20.2)', () => {
    const surveyId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = 'user-1';

    /** 画像レコード（Prisma戻り値）を組み立てる */
    const buildImage = (id: string, displayOrder: number) => ({
      id,
      surveyId,
      fileName: `${id}.jpg`,
      fileSize: 1024,
      width: 800,
      height: 600,
      displayOrder,
      originalPath: `surveys/123/original-${id}.jpg`,
      thumbnailPath: `surveys/123/thumb-${id}.jpg`,
      annotatedThumbnailPath: null,
      createdAt: new Date('2024-01-01'),
    });

    it('注釈0件（回転のみ）の画像は hasDrawnAnnotations が false、注釈がある画像は true になる', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([
        buildImage('img-rotation-only', 1),
        buildImage('img-annotated', 2),
        buildImage('img-plain', 3),
      ]);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([
        { imageId: 'img-rotation-only', hasDrawnAnnotations: false },
        { imageId: 'img-annotated', hasDrawnAnnotations: true },
      ]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result[0]?.hasDrawnAnnotations).toBe(false);
      expect(result[1]?.hasDrawnAnnotations).toBe(true);
      expect(result[2]?.hasDrawnAnnotations).toBe(false);
      // 既存項目の意味は変更しない（注釈レコードの存在から導出する）
      expect(result[0]?.hasAnnotations).toBe(true);
      expect(result[1]?.hasAnnotations).toBe(true);
      expect(result[2]?.hasAnnotations).toBe(false);
    });

    it('未算出（バックフィル未実施）の既存注釈は従来どおり注釈ありとして扱う', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([buildImage('img-legacy', 1)]);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([
        { imageId: 'img-legacy', hasDrawnAnnotations: null },
      ]);
      configureStorage();

      const result = await service.findBySurveyIdWithUrls(surveyId, userId);

      expect(result[0]?.hasDrawnAnnotations).toBe(true);
    });

    it('判定に重い注釈データ（data）を取得しない', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([buildImage('img-1', 1)]);
      mockPrisma.imageAnnotation.findMany.mockResolvedValue([]);
      configureStorage();

      await service.findBySurveyIdWithUrls(surveyId, userId);

      const args = mockPrisma.imageAnnotation.findMany.mock.calls[0]![0];
      expect(args.select).toEqual({ imageId: true, hasDrawnAnnotations: true });
      expect(args.select).not.toHaveProperty('data');
    });
  });

  /**
   * Task 115.20 / Requirements 4.10
   *
   * displayOrderが重複していても取得順序が実行ごとに変わらないことを検証する。
   *
   * 実データでは同一現場調査内にdisplayOrderの重複が存在する（画像11枚に対し
   * 異なる値が7個）。データベースは並び替えの鍵で決まらない行の順序を保証しない
   * ため、鍵が displayOrder だけだと同値行の並びは実行ごとに変わり得る。
   * ここではその性質を模したフェイクを用い、鍵で決着しない行を呼び出しごとに
   * 回転させて返す。
   */
  describe('表示順序が重複する場合の取得順序（Requirements: 4.10）', () => {
    const surveyId = '123e4567-e89b-12d3-a456-426614174000';

    /** displayOrderが重複する行（実データで観測された 2,2 / 6,6 / 8,8,8 を模す） */
    const rowsWithDuplicatedDisplayOrder = [
      { id: 'img-a', displayOrder: 2, createdAt: new Date('2024-01-01T00:00:00.000Z') },
      { id: 'img-b', displayOrder: 2, createdAt: new Date('2024-01-01T00:00:01.000Z') },
      { id: 'img-c', displayOrder: 6, createdAt: new Date('2024-01-01T00:00:02.000Z') },
      { id: 'img-d', displayOrder: 6, createdAt: new Date('2024-01-01T00:00:03.000Z') },
      { id: 'img-e', displayOrder: 8, createdAt: new Date('2024-01-01T00:00:04.000Z') },
      // 同一ミリ秒で登録された2件。作成日時までが同値でも並びが定まる必要がある
      { id: 'img-f', displayOrder: 8, createdAt: new Date('2024-01-01T00:00:05.000Z') },
      { id: 'img-g', displayOrder: 8, createdAt: new Date('2024-01-01T00:00:05.000Z') },
    ].map((row) => ({
      surveyId,
      fileName: `${row.id}.jpg`,
      fileSize: 1024,
      width: 800,
      height: 600,
      originalPath: `surveys/${surveyId}/${row.id}.jpg`,
      thumbnailPath: `surveys/${surveyId}/${row.id}_thumb.jpg`,
      annotatedThumbnailPath: null,
      ...row,
    }));

    type OrderKey = Record<string, 'asc' | 'desc'>;

    /**
     * 並び替えの鍵で決着しない行の順序を保証しないデータベースを模す
     *
     * 指定された鍵だけで安定に並べ、同値のまま残った行は呼び出し回数に応じて
     * 回転させる（= 実行ごとに異なる順序を返す）。
     */
    const createUnstableFindMany = () => {
      let callCount = 0;
      return (args: { orderBy?: OrderKey | OrderKey[] }) => {
        const keys = Array.isArray(args.orderBy)
          ? args.orderBy
          : args.orderBy
            ? [args.orderBy]
            : [];
        const rotation = callCount++;

        // 鍵で決着する部分だけを比較して安定並べ替え
        const sorted = [...rowsWithDuplicatedDisplayOrder].sort((left, right) => {
          for (const key of keys) {
            const [field, direction] = Object.entries(key)[0] as [string, 'asc' | 'desc'];
            const l = (left as unknown as Record<string, unknown>)[field];
            const r = (right as unknown as Record<string, unknown>)[field];
            const lv = l instanceof Date ? l.getTime() : (l as number | string);
            const rv = r instanceof Date ? r.getTime() : (r as number | string);
            if (lv < rv) return direction === 'asc' ? -1 : 1;
            if (lv > rv) return direction === 'asc' ? 1 : -1;
          }
          return 0;
        });

        // 鍵で同値のまま残ったグループを回転させる
        const result: typeof sorted = [];
        let index = 0;
        while (index < sorted.length) {
          let end = index + 1;
          const isTied = (a: (typeof sorted)[number], b: (typeof sorted)[number]) =>
            keys.every((key) => {
              const [field] = Object.entries(key)[0] as [string, 'asc' | 'desc'];
              const av = (a as unknown as Record<string, unknown>)[field];
              const bv = (b as unknown as Record<string, unknown>)[field];
              return av instanceof Date && bv instanceof Date
                ? av.getTime() === bv.getTime()
                : av === bv;
            });
          while (end < sorted.length && isTied(sorted[index]!, sorted[end]!)) {
            end++;
          }
          const group = sorted.slice(index, end);
          const offset = rotation % group.length;
          result.push(...group.slice(offset), ...group.slice(0, offset));
          index = end;
        }

        return Promise.resolve(result);
      };
    };

    it('displayOrderが重複していても繰り返し取得で並びが変わらないこと', async () => {
      mockPrisma.surveyImage.findMany.mockImplementation(createUnstableFindMany());

      const first = (await service.findBySurveyId(surveyId)).map((image) => image.id);
      const second = (await service.findBySurveyId(surveyId)).map((image) => image.id);
      const third = (await service.findBySurveyId(surveyId)).map((image) => image.id);

      expect(first).toHaveLength(rowsWithDuplicatedDisplayOrder.length);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('displayOrderの昇順を保ったまま第二・第三の鍵で並びを確定させること', async () => {
      mockPrisma.surveyImage.findMany.mockImplementation(createUnstableFindMany());

      // フェイクは呼び出しごとに同値行を回転させるため、2回目以降でも同じ並びに
      // なることを確認する
      await service.findBySurveyId(surveyId);
      const ids = (await service.findBySurveyId(surveyId)).map((image) => image.id);

      expect(ids).toEqual(['img-a', 'img-b', 'img-c', 'img-d', 'img-e', 'img-f', 'img-g']);
    });

    it('取得時の並び替えに一意な鍵を含めること', async () => {
      mockPrisma.surveyImage.findMany.mockResolvedValue([]);

      await service.findBySurveyId(surveyId);

      const args = mockPrisma.surveyImage.findMany.mock.calls[0]![0];
      expect(args.orderBy).toEqual([{ displayOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    });
  });

  describe('countBySurveyId', () => {
    it('現場調査に紐付く画像数を返すこと', async () => {
      const surveyId = '123e4567-e89b-12d3-a456-426614174000';
      mockPrisma.surveyImage.count.mockResolvedValue(5);

      const result = await service.countBySurveyId(surveyId);

      expect(result).toBe(5);
      expect(mockPrisma.surveyImage.count).toHaveBeenCalledWith({
        where: { surveyId },
      });
    });
  });
});
