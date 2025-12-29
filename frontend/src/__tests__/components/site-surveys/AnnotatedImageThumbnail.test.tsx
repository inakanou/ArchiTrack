/**
 * @fileoverview AnnotatedImageThumbnail コンポーネントのテスト
 *
 * 注釈付き画像サムネイルコンポーネントのテストを提供します。
 *
 * Requirements:
 * - 画像一覧で注釈付き画像のサムネイルを表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnotatedImageThumbnail } from '../../../components/site-surveys/AnnotatedImageThumbnail';
import type { SurveyImageInfo } from '../../../types/site-survey.types';
import * as surveyAnnotationsApi from '../../../api/survey-annotations';

// APIモック
vi.mock('../../../api/survey-annotations', () => ({
  getAnnotation: vi.fn(),
}));

// Fabric.jsモック
const createMockCanvas = () => ({
  dispose: vi.fn(),
  renderAll: vi.fn(),
  toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mockdataurl'),
  add: vi.fn(),
  backgroundImage: null,
});

vi.mock('fabric', () => {
  const MockCanvas = vi.fn(function (this: ReturnType<typeof createMockCanvas>) {
    Object.assign(this, createMockCanvas());
  }) as unknown as new () => ReturnType<typeof createMockCanvas>;

  const MockFabricImage = vi.fn(function (this: { set: ReturnType<typeof vi.fn> }) {
    this.set = vi.fn();
  }) as unknown as new () => { set: ReturnType<typeof vi.fn> };

  return {
    Canvas: MockCanvas,
    FabricImage: MockFabricImage,
    util: {
      enlivenObjects: vi.fn().mockResolvedValue([
        {
          set: vi.fn(),
          type: 'rect',
        },
      ]),
    },
  };
});

// カスタムシェイプ登録モック
vi.mock('../../../components/site-surveys/tools/registerCustomShapes', () => ({}));

// テスト用モック画像
const mockImage: SurveyImageInfo = {
  id: 'image-123',
  surveyId: 'survey-456',
  originalPath: '/path/to/original.jpg',
  thumbnailPath: '/path/to/thumbnail.jpg',
  originalUrl: 'https://example.com/original.jpg',
  thumbnailUrl: 'https://example.com/thumbnail.jpg',
  mediumUrl: 'https://example.com/medium.jpg',
  fileName: 'test-image.jpg',
  fileSize: 1024000,
  width: 1920,
  height: 1080,
  displayOrder: 1,
  createdAt: '2025-01-01T00:00:00Z',
};

describe('AnnotatedImageThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // HTMLImageElement.onloadをモック
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set(src) {
        if (src) {
          setTimeout(() => {
            this.onload?.();
          }, 0);
        }
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('レンダリング', () => {
    it('画像がレンダリングされる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" loading="lazy" />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'テスト画像');
    });

    it('loading属性がデフォルトでlazyになる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('loading属性をeagerに設定できる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" loading="eager" />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'eager');
    });

    it('カスタムスタイルが適用される', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={mockImage}
          alt="テスト画像"
          style={{ width: '100px', height: '100px' }}
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ width: '100px', height: '100px' });
    });
  });

  describe('クリックハンドラ', () => {
    it('onClickハンドラが呼び出される', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" onClick={handleClick} />);

      const img = screen.getByRole('img');
      await user.click(img);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('注釈がない場合', () => {
    it('注釈がない場合は元画像URLを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
    });

    it('注釈データが空の場合は元画像URLを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
    });
  });

  describe('注釈がある場合', () => {
    it('注釈付き画像がレンダリングされる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // APIが呼び出されたことを確認
      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(mockImage.id);
      });
    });
  });

  describe('フォールバック画像URL', () => {
    it('mediumUrlがない場合はoriginalUrlを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const imageWithoutMedium: SurveyImageInfo = {
        ...mockImage,
        mediumUrl: null,
      };

      render(<AnnotatedImageThumbnail image={imageWithoutMedium} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', imageWithoutMedium.originalUrl);
      });
    });

    it('originalUrlがない場合はoriginalPathを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const imageWithoutUrls: SurveyImageInfo = {
        ...mockImage,
        mediumUrl: null,
        originalUrl: null,
      };

      render(<AnnotatedImageThumbnail image={imageWithoutUrls} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', imageWithoutUrls.originalPath);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('注釈取得エラー時は元画像を表示する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockRejectedValue(new Error('API Error'));

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
    });

    it('画像URLがない場合はエラー表示する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const imageWithoutUrl: SurveyImageInfo = {
        ...mockImage,
        mediumUrl: null,
        originalUrl: null,
        originalPath: '',
      };

      render(<AnnotatedImageThumbnail image={imageWithoutUrl} alt="テスト画像" />);

      await waitFor(() => {
        expect(screen.getByText('画像を読み込めません')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はopacityが下がる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      const img = screen.getByRole('img');
      // 初期状態でopacityスタイルが適用されていることを確認
      expect(img).toHaveStyle({ transition: 'opacity 0.2s ease-in-out' });
    });
  });

  describe('コンポーネントのアンマウント', () => {
    it('アンマウント時にレンダリングが中止される', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 100))
      );

      const { unmount } = render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // すぐにアンマウント
      unmount();

      // エラーが発生しないことを確認
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
    });
  });

  describe('アクセシビリティ', () => {
    it('エラー時にrole="img"とaria-labelが設定される', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const imageWithoutUrl: SurveyImageInfo = {
        ...mockImage,
        mediumUrl: null,
        originalUrl: null,
        originalPath: '',
      };

      render(<AnnotatedImageThumbnail image={imageWithoutUrl} alt="エラー画像" />);

      await waitFor(() => {
        const errorDiv = screen.getByRole('img');
        expect(errorDiv).toHaveAttribute('aria-label', 'エラー画像');
      });
    });
  });

  describe('画像ロードエラー', () => {
    it('画像ロードエラー時は元画像URLを表示する', async () => {
      // onerrorをトリガーするモック
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set(src) {
          if (src) {
            setTimeout(() => {
              this.onerror?.(new Error('Load failed'));
            }, 0);
          }
        },
        configurable: true,
      });

      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      // console.errorをモック
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // エラー発生後、元画像URLが使用されることを確認
      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });

      consoleSpy.mockRestore();
    });
  });

  describe('注釈オブジェクトの処理', () => {
    it('不正な注釈オブジェクトはスキップされる', async () => {
      // 不正なオブジェクトを返すモック
      const { util } = await import('fabric');
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([
        null, // nullオブジェクト
        undefined, // undefinedオブジェクト
        'string', // 文字列
        { type: 'rect', set: vi.fn() }, // 正常なオブジェクト
      ] as unknown as Awaited<ReturnType<typeof util.enlivenObjects>>);

      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // エラーなく処理されることを確認
      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalled();
      });
    });

    it('objectsプロパティがないデータは元画像を表示', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {} as unknown as { objects: [] }, // objectsがない
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
    });
  });

  describe('注釈レンダリング中のアンマウント', () => {
    it('画像ロード中にアンマウントしてもエラーが発生しない', async () => {
      // 長時間遅延するモック
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      // 画像ロードが遅延するモック
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set(src) {
          if (src) {
            setTimeout(() => {
              this.onload?.();
            }, 200);
          }
        },
        configurable: true,
      });

      const { unmount } = render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // 画像ロード前にアンマウント
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      unmount();

      // エラーが発生しないことを確認
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
    });

    it('enlivenObjects実行中にアンマウントしてもエラーが発生しない', async () => {
      // enlivenObjectsが遅延するモック
      const { util } = await import('fabric');
      vi.mocked(util.enlivenObjects).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve([
                  {
                    set: vi.fn(),
                    type: 'rect',
                  },
                ] as unknown as Awaited<ReturnType<typeof util.enlivenObjects>>),
              200
            )
          )
      );

      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      const { unmount } = render(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // enlivenObjects実行前にアンマウント
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      unmount();

      // エラーが発生しないことを確認
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
    });
  });
});
