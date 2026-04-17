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
          annotatedThumbnailPath: true,
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

      // R2にアップロード（タイムスタンプ付き新キー）
      expect(mockStorageProvider.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^annotated-thumbnails\/image-123\.\d+\.jpg$/),
        expect.any(Buffer),
        { contentType: 'image/jpeg' }
      );

      const uploadedKey = mockStorageProvider.upload.mock.calls[0]![0] as string;

      // DB更新
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: { annotatedThumbnailPath: uploadedKey },
      });

      // 結果パスの返却
      expect(result).toBe(uploadedKey);
    });

    it('異常系: 画像が見つからない場合nullを返すこと', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue(null);

      const result = await service.generateAnnotatedThumbnail('nonexistent', testAnnotationData);

      expect(result).toBeNull();
      expect(mockStorageProvider.get).not.toHaveBeenCalled();
    });

    it('異常系: R2保存失敗時は例外を throw し、DB 更新を行わないこと', async () => {
      mockStorageProvider.upload.mockRejectedValue(new Error('R2 upload failed'));

      await expect(
        service.generateAnnotatedThumbnail('image-123', testAnnotationData)
      ).rejects.toThrow('R2 upload failed');

      // DB更新は行われない
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });

    it('冪等性: 連続呼び出しで毎回異なるタイムスタンプ付きパスが返ること', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: null,
      });

      const first = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);
      // Date.now() の粒度差を確保
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      expect(first).toMatch(/^annotated-thumbnails\/image-123\.\d+\.jpg$/);
      expect(second).toMatch(/^annotated-thumbnails\/image-123\.\d+\.jpg$/);
      expect(first).not.toBe(second);
    });

    it('冪等性: 既存 annotatedThumbnailPath が存在する場合、DB 更新後に旧キーを best-effort で削除すること', async () => {
      const oldPath = 'annotated-thumbnails/image-123.1700000000000.jpg';
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: oldPath,
      });
      mockStorageProvider.delete.mockResolvedValue(undefined);

      const result = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      // DB 更新が先に行われている
      expect(mockPrisma.surveyImage.update).toHaveBeenCalled();
      // 旧キーの削除が呼ばれる
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(oldPath);
      // 新 path が返る
      expect(result).toMatch(/^annotated-thumbnails\/image-123\.\d+\.jpg$/);
      expect(result).not.toBe(oldPath);
    });

    it('冪等性: 旧キー削除が失敗しても本メソッドは正常完了し新 path を返すこと', async () => {
      const oldPath = 'annotated-thumbnails/image-123.1700000000000.jpg';
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: oldPath,
      });
      mockStorageProvider.delete.mockRejectedValue(new Error('R2 delete failed'));

      const result = await service.generateAnnotatedThumbnail('image-123', testAnnotationData);

      expect(result).toMatch(/^annotated-thumbnails\/image-123\.\d+\.jpg$/);
      expect(mockPrisma.surveyImage.update).toHaveBeenCalled();
      // delete は試みられる
      expect(mockStorageProvider.delete).toHaveBeenCalledWith(oldPath);
      // best-effort のため非同期 reject がテスト終了前に解決されるのを待つ
      await new Promise((resolve) => setImmediate(resolve));
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

    it('注釈オブジェクトが空配列で既存サムネイルがない場合はストレージ削除をスキップすること', async () => {
      const emptyAnnotation: AnnotationData = {
        version: '1.0',
        objects: [],
      };

      // 1回目: generateAnnotatedThumbnailでimage取得 → annotatedThumbnailPath: null
      // 2回目: removeAnnotatedThumbnailForImage内でfindUnique
      mockPrisma.surveyImage.findUnique
        .mockResolvedValueOnce(testImage) // image lookup
        .mockResolvedValueOnce({ annotatedThumbnailPath: null }); // removal lookup

      await service.generateAnnotatedThumbnail('image-123', emptyAnnotation);

      // ストレージ削除は呼ばれない
      expect(mockStorageProvider.delete).not.toHaveBeenCalled();
      // DB更新はnullに設定
      expect(mockPrisma.surveyImage.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: { annotatedThumbnailPath: null },
      });
    });

    it('注釈オブジェクトが空配列でストレージ削除に失敗した場合もDB更新は行われること', async () => {
      const emptyAnnotation: AnnotationData = {
        version: '1.0',
        objects: [],
      };

      mockPrisma.surveyImage.findUnique.mockResolvedValueOnce(testImage).mockResolvedValueOnce({
        annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg',
      });

      mockStorageProvider.delete.mockRejectedValue(new Error('Storage delete failed'));

      await service.generateAnnotatedThumbnail('image-123', emptyAnnotation);

      // ストレージ削除は試みられる
      expect(mockStorageProvider.delete).toHaveBeenCalledWith('annotated-thumbnails/image-123.jpg');
      // エラーが発生してもDB更新は行われる
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

    it('R2削除失敗時はDB更新が行われずエラーログが出力されること', async () => {
      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        ...testImage,
        annotatedThumbnailPath: 'annotated-thumbnails/image-123.jpg',
      });
      mockStorageProvider.delete.mockRejectedValue(new Error('R2 delete failed'));

      await service.removeAnnotatedThumbnail('image-123');

      expect(mockStorageProvider.delete).toHaveBeenCalledWith('annotated-thumbnails/image-123.jpg');
      // エラー時はDB更新されない（catchブロック内でDB更新なし）
      expect(mockPrisma.surveyImage.update).not.toHaveBeenCalled();
    });
  });

  /**
   * Task 59.3: サムネイル・PDF出力での回転反映の単体テスト
   * Requirements: 22.4, 22.5
   */
  describe('画像回転反映 (Requirement 22)', () => {
    it('imageRotationが90度の場合にSharp.rotateが呼ばれること', async () => {
      const sharp = (await import('sharp')).default;

      const mockRotate = vi.fn().mockReturnValue(mockSharpInstance);
      mockSharpInstance.composite.mockReturnValue(mockSharpInstance);
      mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
      mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('thumbnail'));
      (mockSharpInstance as Record<string, unknown>).rotate = mockRotate;

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: 'image-1',
        surveyId: 'survey-1',
        originalPath: 'surveys/survey-1/original.jpg',
        width: 800,
        height: 600,
        annotatedThumbnailPath: null,
      });

      mockStorageProvider.get.mockResolvedValue(Buffer.from('image-data'));
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrisma.surveyImage.update.mockResolvedValue({});

      const annotationData: AnnotationData = {
        version: '1.0',
        objects: [{ type: 'rect', left: 10, top: 20, width: 100, height: 50 }],
        imageRotation: 90,
      };

      await service.generateAnnotatedThumbnail('image-1', annotationData);

      expect(sharp).toHaveBeenCalled();
      expect(mockRotate).toHaveBeenCalledWith(90);
    });

    it('imageRotationが0度の場合にSharp.rotateが呼ばれないこと', async () => {
      const sharp = (await import('sharp')).default;

      const mockRotate = vi.fn().mockReturnValue(mockSharpInstance);
      mockSharpInstance.composite.mockReturnValue(mockSharpInstance);
      mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
      mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('thumbnail'));
      (mockSharpInstance as Record<string, unknown>).rotate = mockRotate;

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: 'image-1',
        surveyId: 'survey-1',
        originalPath: 'surveys/survey-1/original.jpg',
        width: 800,
        height: 600,
        annotatedThumbnailPath: null,
      });

      mockStorageProvider.get.mockResolvedValue(Buffer.from('image-data'));
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrisma.surveyImage.update.mockResolvedValue({});

      const annotationData: AnnotationData = {
        version: '1.0',
        objects: [{ type: 'rect', left: 10, top: 20, width: 100, height: 50 }],
        imageRotation: 0,
      };

      await service.generateAnnotatedThumbnail('image-1', annotationData);

      expect(sharp).toHaveBeenCalled();
      expect(mockRotate).not.toHaveBeenCalled();
    });

    it('imageRotationが未定義の場合にSharp.rotateが呼ばれないこと', async () => {
      const sharp = (await import('sharp')).default;

      const mockRotate = vi.fn().mockReturnValue(mockSharpInstance);
      mockSharpInstance.composite.mockReturnValue(mockSharpInstance);
      mockSharpInstance.resize.mockReturnValue(mockSharpInstance);
      mockSharpInstance.jpeg.mockReturnValue(mockSharpInstance);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('thumbnail'));
      (mockSharpInstance as Record<string, unknown>).rotate = mockRotate;

      mockPrisma.surveyImage.findUnique.mockResolvedValue({
        id: 'image-1',
        surveyId: 'survey-1',
        originalPath: 'surveys/survey-1/original.jpg',
        width: 800,
        height: 600,
        annotatedThumbnailPath: null,
      });

      mockStorageProvider.get.mockResolvedValue(Buffer.from('image-data'));
      mockStorageProvider.upload.mockResolvedValue(undefined);
      mockPrisma.surveyImage.update.mockResolvedValue({});

      const annotationData: AnnotationData = {
        version: '1.0',
        objects: [{ type: 'rect', left: 10, top: 20, width: 100, height: 50 }],
      };

      await service.generateAnnotatedThumbnail('image-1', annotationData);

      expect(sharp).toHaveBeenCalled();
      expect(mockRotate).not.toHaveBeenCalled();
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

  it('四角形: 回転ありの場合transformを含むこと', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'rect',
          left: 10,
          top: 20,
          width: 100,
          height: 50,
          angle: 45,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('transform="rotate(45');
  });

  it('四角形: 最小プロパティ（デフォルト値使用）でもSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'rect',
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<rect');
  });

  it('円: 最小プロパティ（デフォルト値使用）でもSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'circle',
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<ellipse');
  });

  it('テキスト: 回転ありの場合transformを含むこと', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'text',
          left: 50,
          top: 50,
          text: 'Hello',
          fontSize: 16,
          angle: 30,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('transform="rotate(30');
  });

  it('テキスト: 最小プロパティ（デフォルト値使用）でもSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'i-text',
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<text');
  });

  it('テキスト: XMLエスケープが適用されること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'textbox',
          text: '<script>&"test\'</script>',
          left: 0,
          top: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
  });

  it('線: 最小プロパティ（デフォルト値使用）でもSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'line',
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<line');
  });

  it('パス: pathDataが配列でない場合は空文字を返すこと', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'path',
          left: 0,
          top: 0,
          path: 'invalid' as unknown as unknown[],
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    // pathが無効なので<path>要素は含まれない
    expect(svg).not.toContain('<path');
  });

  it('パス: セグメントが配列でない場合は空文字として扱うこと', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'path',
          left: 0,
          top: 0,
          path: ['not-an-array-segment', ['M', 0, 0]],
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<path');
    expect(svg).toContain('M 0 0');
  });

  it('パス: 最小プロパティ（デフォルト値使用）でもSVGを生成すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'path',
          path: [
            ['M', 0, 0],
            ['L', 50, 50],
          ],
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('<path');
  });

  it('パス: fill値が非transparentの場合そのまま使用すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'path',
          left: 0,
          top: 0,
          path: [['M', 0, 0]],
          fill: '#ff0000',
          stroke: '#00ff00',
          strokeWidth: 3,
          scaleX: 2,
          scaleY: 2,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('scale(2, 2)');
  });

  it('四角形: fill値が非transparentの場合そのまま使用すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'rect',
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          fill: '#0000ff',
          stroke: '#ff0000',
          strokeWidth: 2,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('fill="#0000ff"');
  });

  it('円: fill値が非transparentの場合そのまま使用すること', () => {
    const data: AnnotationData = {
      version: '1.0',
      objects: [
        {
          type: 'circle',
          left: 100,
          top: 100,
          radius: 50,
          fill: 'rgba(255,0,0,0.5)',
          stroke: '#00ff00',
          strokeWidth: 2,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    };

    const svg = generateSvgFromAnnotation(data, 800, 600);
    expect(svg).toContain('fill="rgba(255,0,0,0.5)"');
  });

  it('不明なオブジェク��タイプはスキップすること', () => {
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

    // エラーにならずSVGが生���される
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
