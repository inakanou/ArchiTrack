/**
 * @fileoverview AnnotatedThumbnailService 単体テスト
 *
 * Task 53.2: AnnotatedThumbnailServiceを実装する
 * Task 55.1: AnnotatedThumbnailServiceの単体テストを実装する
 *
 * Requirements:
 * - 20.4: 注釈保存時にサーバーサイドで注釈付きサムネイル画像を生成・更新する
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  AnnotatedThumbnailService,
  type AnnotatedThumbnailServiceDependencies,
  generateSvgFromAnnotation,
} from '../../../services/annotated-thumbnail.service.js';
import type { AnnotationData } from '../../../services/annotation.service.js';

// Sharp モック
const mockSharpInstance = {
  metadata: vi.fn(),
  composite: vi.fn(),
  resize: vi.fn(),
  jpeg: vi.fn(),
  toBuffer: vi.fn(),
};

// 各メソッドがチェーンを返すように設定
mockSharpInstance.composite.mockReturnValue(mockSharpInstance);
mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

describe('AnnotatedThumbnailService', () => {
  let service: AnnotatedThumbnailService;
  let mockPrisma: {
    surveyImage: {
      findUnique: Mock;
      update: Mock;
    };
  };
  let mockStorageProvider: {
    get: Mock;
    upload: Mock;
    delete: Mock;
    getSignedUrl: Mock;
    type: string;
  };

  const testAnnotationData: AnnotationData = {
    version: '1.0',
    objects: [
      {
        type: 'rect',
        left: 100,
        top: 100,
        width: 200,
        height: 150,
        fill: 'transparent',
        stroke: '#ff0000',
        strokeWidth: 2,
      },
      {
        type: 'circle',
        left: 300,
        top: 200,
        radius: 50,
        fill: 'transparent',
        stroke: '#00ff00',
        strokeWidth: 3,
      },
    ],
  };

  const testImage = {
    id: 'image-123',
    surveyId: 'survey-456',
    originalPath: 'surveys/survey-456/original.jpg',
    thumbnailPath: 'surveys/survey-456/thumb.jpg',
    annotatedThumbnailPath: null,
    width: 1920,
    height: 1080,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      surveyImage: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    mockStorageProvider = {
      get: vi.fn(),
      upload: vi.fn(),
      delete: vi.fn(),
      getSignedUrl: vi.fn(),
      type: 'local',
    };

    service = new AnnotatedThumbnailService({
      prisma: mockPrisma as unknown as AnnotatedThumbnailServiceDependencies['prisma'],
      storageProvider:
        mockStorageProvider as unknown as AnnotatedThumbnailServiceDependencies['storageProvider'],
    });

    // デフォルトのモック設定
    mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);
    mockStorageProvider.get.mockResolvedValue(Buffer.from('fake-image-data'));
    mockStorageProvider.upload.mockResolvedValue({
      key: 'annotated-thumbnails/image-123.jpg',
      size: 1024,
    });
    mockPrisma.surveyImage.update.mockResolvedValue({
      ...testImage,
      annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg',
    });
    mockSharpInstance.metadata.mockResolvedValue({ width: 1920, height: 1080 });
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('composite-result'));
  });

  describe('generateAnnotatedThumbnail', () => {
    it('正常系: SVG生成、Sharp合成、R2保存、DB更新が行われること', async () => {
      const result = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      // 画像メタデータ取得
      expect(mockPrisma.surveyImage.findUnique).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        select: {
          id: true,
          surveyId: true,
          originalPath: true,
          width: true,
          height: true,
        },
      });

      // オリジナル画像取得
      expect(mockStorageProvider.get).toHaveBeenCalledWith('surveys/survey-456/original.jpg');

      // Sharp composite が呼ばれる（SVGオーバーレイ）
      expect(mockSharpInstance.composite).toHaveBeenCalled();

      // リサイズ
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, 300, { fit: 'inside' });

      // JPEG変換
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });

      // R2にアップロード
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        'annotated-thumbnails/image-123.jpg',
        expect.any(Buffer),
        { contentType: 'image/jpeg' }
      );

      // DB更新
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: { annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg' },
      });

      // 結果パスの返却
      expect(result).toBe('annotated-thumbnails/image-123.jpg');
    });

    it('異常系: 画像が見つからない場合nullを返すこと', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      const result = await service.generateAnnotatedThumbnail('nonexistent', testAnnotationData);

      expect(result).toBeNull();
      expect(mockStorageProvider.get).not.toHaveBeenCalled();
    });

    it('異常系: R2保存失敗時にnullを返すこと', async () => {
      mockStorageProvider.upload.mockRejectedValue(new Error('R2 upload failed'));

      const result = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      expect(result).toBeNull();
      // DB更新は行われない
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('異常系: オリジナル画像取得失敗時にnullを返すこと', async () => {
      mockStorageProvider.get.mockResolvedValue(null);

      const result = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      expect(result).toBeNull();
    });

    it('注釈オブジェクトが空配列の場合はサムネイルを削除すること', async () => {
      const emptyAnnotation: AnnotationData = {
        version: '1.0',
        objects: [],
      };

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg',
      });

      await service.generateAnnotatedThumbnail('image-123', emptyAnnotation);

      // 既存サムネイルの削除
      expect(mockStorageProvider.delete).toHaveBeenCalledWith('annotated-thumbnails/image-123.jpg');

      // DB更新（nullに設定）
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: { annotatedThumbnailPath: null },
      });
    });
  });

  describe('removeAnnotatedThumbnail', () => {
    it('正常系: R2削除とDB更新が行われること', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg',
      });

      await service.removeAnnotatedThumbnail('image-123');

      // R2から削除
      expect(mockStorageProvider.delete).toHaveBeenCalledWith('annotated-thumbnails/image-123.jpg');

      // DB更新
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: { annotatedThumbnailPath: null },
      });
    });

    it('注釈付きサムネイルが存在しない場合は何もしないこと', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(testImage);

      await service.removeAnnotatedThumbnail('image-123');

      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('画像が見つからない場合は何もしないこと', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      await service.removeAnnotatedThumbnail('nonexistent');

      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });
  });
});

describe('generateSvgFromAnnotation', () => {
  it('四角形オブジェクトからSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'rect',
          left: 10,
          top: 20,
          width: 100,
          height: 50,
          fill: 'transparent',
          stroke: '#ff0000',
          strokeWidth: 2,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<svg');
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('stroke="#ff0000"');
  });

  it('円オブジェクトからSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'circle',
          left: 100,
          top: 100,
          radius: 50,
          fill: 'transparent',
          stroke: '#00ff00',
          strokeWidth: 3,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<ellipse');
    expect(svg).toContain('stroke="#00ff00"');
  });

  it('テキストオブジェクトからSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'textbox',
          left: 50,
          top: 50,
          text: 'テスト注釈',
          fontSize: 24,
          fill: '#000000',
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<text');
    expect(svg).toContain('テスト注釈');
  });

  it('線オブジェクトからSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'line',
          left: 0,
          top: 0,
          x1: 10,
          y1: 20,
          x2: 200,
          y2: 150,
          stroke: '#0000ff',
          strokeWidth: 2,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<line');
    expect(svg).toContain('stroke="#0000ff"');
  });

  it('pathオブジェクト（矢印含む）からSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'path',
          left: 50,
          top: 50,
          path: [
            ['M', 0, 0],
            ['L', 100, 100],
          ],
          stroke: '#ff0000',
          strokeWidth: 2,
          fill: 'transparent',
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="#ff0000"');
  });

  it('空のオブジェクト配列の場合は空のSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('不明なオブジェクトタイプはスキップすること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'unknown-type',
          left: 10,
          top: 20,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);

    // エラーにならずSVGが生成される
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
