/**
 * ExportService - 注釈付き画像のエクスポート機能テスト
 *
 * Task 20.1: 注釈付き画像のエクスポートを実装する
 * - Fabric.js toDataURLによる画像生成
 * - JPEG/PNG形式選択
 * - 解像度（品質）選択
 *
 * @see design.md - ExportService
 * @see requirements.md - 要件10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExportService,
  ExportImageOptions,
  exportImage,
  downloadFile,
} from '../../services/ExportService';

/**
 * Fabric.js Canvasのモックインターフェース
 * 実際のCanvasオブジェクトの必要なメソッドのみをモック
 */
interface MockFabricCanvas {
  toDataURL: ReturnType<typeof vi.fn>;
  getWidth: ReturnType<typeof vi.fn>;
  getHeight: ReturnType<typeof vi.fn>;
}

/**
 * モックキャンバスを作成するヘルパー関数
 */
function createMockCanvas(): MockFabricCanvas {
  return {
    toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mockBase64Data'),
    getWidth: vi.fn().mockReturnValue(800),
    getHeight: vi.fn().mockReturnValue(600),
  };
}

describe('ExportService', () => {
  let exportService: ExportService;
  let mockCanvas: MockFabricCanvas;

  beforeEach(() => {
    exportService = new ExportService();
    mockCanvas = createMockCanvas();
  });

  describe('exportImage', () => {
    describe('Requirements 10.1: 注釈をレンダリングした画像を生成', () => {
      it('should export image with annotations using toDataURL', () => {
        const options: ExportImageOptions = {
          format: 'jpeg',
          quality: 0.9,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalled();
        expect(result).toMatch(/^data:image\/(jpeg|png)/);
      });

      it('should include all canvas objects when includeAnnotations is true', () => {
        const options: ExportImageOptions = {
          format: 'png',
          quality: 1.0,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exportService.exportImage(mockCanvas as any, options);

        // toDataURLはキャンバス全体（背景画像＋注釈オブジェクト）をレンダリングする
        expect(mockCanvas.toDataURL).toHaveBeenCalled();
      });
    });

    describe('Requirements 10.2: JPEG、PNG形式でのエクスポート', () => {
      it('should export as JPEG format when format is "jpeg"', () => {
        mockCanvas.toDataURL.mockReturnValue('data:image/jpeg;base64,jpegData');
        const options: ExportImageOptions = {
          format: 'jpeg',
          quality: 0.9,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
          expect.objectContaining({
            format: 'jpeg',
          })
        );
        expect(result).toContain('data:image/jpeg');
      });

      it('should export as PNG format when format is "png"', () => {
        mockCanvas.toDataURL.mockReturnValue('data:image/png;base64,pngData');
        const options: ExportImageOptions = {
          format: 'png',
          quality: 1.0,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
          expect.objectContaining({
            format: 'png',
          })
        );
        expect(result).toContain('data:image/png');
      });
    });

    describe('Requirements 10.3: 解像度（品質）選択', () => {
      it('should apply quality setting for JPEG export', () => {
        const options: ExportImageOptions = {
          format: 'jpeg',
          quality: 0.8,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
          expect.objectContaining({
            quality: 0.8,
          })
        );
      });

      it('should support quality range from 0.1 to 1.0', () => {
        const qualities = [0.1, 0.3, 0.5, 0.7, 0.9, 1.0];

        for (const quality of qualities) {
          mockCanvas.toDataURL.mockClear();

          const options: ExportImageOptions = {
            format: 'jpeg',
            quality,
            includeAnnotations: true,
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exportService.exportImage(mockCanvas as any, options);

          expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
            expect.objectContaining({
              quality,
            })
          );
        }
      });

      it('should use default quality of 0.9 when not specified', () => {
        const options: ExportImageOptions = {
          format: 'jpeg',
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
          expect.objectContaining({
            quality: 0.9,
          })
        );
      });

      it('should use multiplier of 1 to maintain original size', () => {
        const options: ExportImageOptions = {
          format: 'jpeg',
          quality: 0.9,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exportService.exportImage(mockCanvas as any, options);

        expect(mockCanvas.toDataURL).toHaveBeenCalledWith(
          expect.objectContaining({
            multiplier: 1,
          })
        );
      });
    });

    describe('error handling', () => {
      it('should throw error when canvas is null', () => {
        const options: ExportImageOptions = {
          format: 'jpeg',
          quality: 0.9,
          includeAnnotations: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(() => exportService.exportImage(null as any, options)).toThrow();
      });

      it('should throw error when quality is out of range', () => {
        const invalidOptions: ExportImageOptions = {
          format: 'jpeg',
          quality: 1.5, // Invalid: > 1.0
          includeAnnotations: true,
        };

        expect(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exportService.exportImage(mockCanvas as any, invalidOptions)
        ).toThrow();

        const negativeOptions: ExportImageOptions = {
          format: 'jpeg',
          quality: -0.1, // Invalid: < 0
          includeAnnotations: true,
        };

        expect(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exportService.exportImage(mockCanvas as any, negativeOptions)
        ).toThrow();
      });
    });
  });

  describe('downloadFile', () => {
    let mockCreateElement: ReturnType<typeof vi.fn>;
    let mockAppendChild: ReturnType<typeof vi.fn>;
    let mockRemoveChild: ReturnType<typeof vi.fn>;
    let mockAnchor: {
      href: string;
      download: string;
      click: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
      mockAppendChild = vi.fn();
      mockRemoveChild = vi.fn();

      // Mock document methods
      vi.stubGlobal('document', {
        createElement: mockCreateElement,
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should create a download link with correct data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,testData';
      const filename = 'test-image.jpg';

      exportService.downloadFile(dataUrl, filename);

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.href).toBe(dataUrl);
      expect(mockAnchor.download).toBe(filename);
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should append link to body and remove after click', () => {
      const dataUrl = 'data:image/png;base64,testData';
      const filename = 'test-image.png';

      exportService.downloadFile(dataUrl, filename);

      expect(mockAppendChild).toHaveBeenCalledWith(mockAnchor);
      expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor);
    });

    it('should support Blob data for download', () => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockObjectUrl = 'blob:http://localhost/test-blob';
      const mockCreateObjectURL = vi.fn().mockReturnValue(mockObjectUrl);
      const mockRevokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      const filename = 'blob-image.jpg';

      exportService.downloadFile(blob, filename);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockAnchor.href).toBe(mockObjectUrl);
      expect(mockAnchor.download).toBe(filename);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
    });
  });
});

describe('exportImage function (standalone)', () => {
  let mockCanvas: MockFabricCanvas;

  beforeEach(() => {
    mockCanvas = createMockCanvas();
  });

  it('should export image using standalone function', () => {
    const options: ExportImageOptions = {
      format: 'jpeg',
      quality: 0.9,
      includeAnnotations: true,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = exportImage(mockCanvas as any, options);

    expect(result).toMatch(/^data:image\//);
  });
});

describe('downloadFile function (standalone)', () => {
  let mockAnchor: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };

    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should download file using standalone function', () => {
    const dataUrl = 'data:image/jpeg;base64,testData';
    const filename = 'test.jpg';

    downloadFile(dataUrl, filename);

    expect(mockAnchor.href).toBe(dataUrl);
    expect(mockAnchor.download).toBe(filename);
    expect(mockAnchor.click).toHaveBeenCalled();
  });
});
