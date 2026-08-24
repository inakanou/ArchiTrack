/**
 * @fileoverview AnnotatedImageThumbnail コンポーネントのテスト
 *
 * 注釈付き画像サムネイルコンポーネントのテストを提供します。
 *
 * Requirements:
 * - 画像一覧で注釈付き画像のサムネイルを表示
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import {
  triggerAllIntersections,
  activeObserverCount,
} from '../../../test-support/intersection-observer';
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

/**
 * 描画したうえで表示領域への到達を発火する
 *
 * 実寸を持つ画像は既定（loading='lazy'）で表示領域観測の対象となり、交差するまで
 * 取得を開始しない。表示元URLの選択や注釈取得の挙動を検証するテストでは、
 * 描画直後に交差を発火して「表示領域に入った状態」を作る。
 * 取得抑止そのものを検証するテストでは素の `render` を用いる。
 */
function renderRevealed(ui: ReactElement) {
  const result = render(ui);
  act(() => {
    triggerAllIntersections(true);
  });
  return result;
}

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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" loading="lazy" />);

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', 'テスト画像');
    });

    it('loading属性がデフォルトでlazyになる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('loading属性をeagerに設定できる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" loading="eager" />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'eager');
    });

    it('カスタムスタイルが適用される', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(
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

      renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" onClick={handleClick} />
      );

      const img = screen.getByRole('img');
      await user.click(img);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('注釈がない場合', () => {
    it('注釈がない場合は元画像URLを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
    });
  });

  describe('hasAnnotations プロップによる注釈取得の制御（一覧表示N+1抑止）', () => {
    it('hasAnnotations=false のときは getAnnotation を呼ばず元画像を表示する', async () => {
      renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" hasAnnotations={false} />
      );

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', mockImage.mediumUrl);
      });
      expect(surveyAnnotationsApi.getAnnotation).not.toHaveBeenCalled();
    });

    it('hasAnnotations=true のときは従来通り getAnnotation を呼ぶ', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" hasAnnotations={true} />
      );

      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(mockImage.id);
      });
    });

    it('hasAnnotations 未指定のときは従来通り getAnnotation を呼ぶ（後方互換）', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(mockImage.id);
      });
    });
  });

  describe('表示領域到達までの取得抑止（画面読み込み時のリクエスト削減）', () => {
    /** 実寸を持つ画像。観測が成立する条件を満たす */
    const sizedImage: SurveyImageInfo = { ...mockImage, width: 1920, height: 1080 };

    it('交差前は表示元URLを設定せず注釈取得APIも呼ばない', () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={sizedImage}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
        />
      );

      expect(screen.getByRole('img')).not.toHaveAttribute('src');
      expect(surveyAnnotationsApi.getAnnotation).not.toHaveBeenCalled();
    });

    it('交差前も実寸で表示領域を確保する', () => {
      render(
        <AnnotatedImageThumbnail
          image={sizedImage}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
        />
      );

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '1920');
      expect(img).toHaveAttribute('height', '1080');
    });

    it('表示領域へ入ると表示元URLが設定される', async () => {
      render(
        <AnnotatedImageThumbnail
          image={sizedImage}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
        />
      );

      act(() => {
        triggerAllIntersections(true);
      });

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', sizedImage.thumbnailUrl);
      });
    });

    it('即時取得の指定では観測せず最初から表示元URLを設定する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(<AnnotatedImageThumbnail image={sizedImage} alt="テスト画像" loading="eager" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', sizedImage.mediumUrl);
      });
      expect(activeObserverCount()).toBe(0);
    });

    /**
     * 実寸が正の値でないときは寸法属性を与えない（`reservationSize`）。
     *
     * 零をそのまま属性に書くと「大きさが零である」という指定になり、呼び出し側が `style`
     * で与えた CSS 寸法と食い違う記述が要素へ残る。実寸が未知であることは属性を付けない
     * ことで表す。既存の「交差前も実寸で表示領域を確保する」は正の値の側だけを固定して
     * いるため、こちらで零・未指定の側を固定する。
     *
     * @requirement site-survey/REQ-38.8
     */
    it('実寸が0のときは width / height 属性を持たない (site-survey/REQ-38.8)', () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={{ ...mockImage, width: 0, height: 0 }}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
          style={{ width: '80px', height: '80px' }}
        />
      );

      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('width');
      expect(img).not.toHaveAttribute('height');
    });

    it('実寸が指定されていないときも width / height 属性を持たない', () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={{ id: 'image-999', thumbnailUrl: 'https://example.com/no-size.jpg' }}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
          style={{ width: '80px', height: '80px' }}
        />
      );

      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('width');
      expect(img).not.toHaveAttribute('height');
    });

    /**
     * 実寸は表示領域の確保手段のひとつにすぎない。一覧系の呼び出し側は代表画像の実寸を
     * 応答から受け取らず、表示領域を CSS の固定寸法で確保している。実寸の有無で観測を
     * 打ち切ると、それらの経路では表示領域外の画像も一斉に取得され 38.6 / 38.8 が成立
     * しない（タスク 115.106）。
     *
     * @requirement site-survey/REQ-38.6
     * @requirement site-survey/REQ-38.8
     */
    it('実寸が0でも表示領域へ入るまで表示元URLを設定せず注釈取得APIも呼ばない (site-survey/REQ-38.6, site-survey/REQ-38.8)', () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={{ ...mockImage, width: 0, height: 0 }}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
          style={{ width: '80px', height: '80px' }}
        />
      );

      expect(screen.getByRole('img')).not.toHaveAttribute('src');
      expect(surveyAnnotationsApi.getAnnotation).not.toHaveBeenCalled();
      expect(activeObserverCount()).toBe(1);
    });

    /**
     * @requirement site-survey/REQ-38.8
     */
    it('実寸が0でも表示領域へ入れば表示元URLが設定される (site-survey/REQ-38.8)', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={{ ...mockImage, width: 0, height: 0 }}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
          style={{ width: '80px', height: '80px' }}
        />
      );

      act(() => {
        triggerAllIntersections(true);
      });

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', mockImage.thumbnailUrl);
      });
    });

    /**
     * @requirement site-survey/REQ-38.8
     */
    it('実寸が指定されていない場合も表示領域へ入るまで取得しない (site-survey/REQ-38.8)', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      render(
        <AnnotatedImageThumbnail
          image={{ id: 'image-999', thumbnailUrl: 'https://example.com/no-size.jpg' }}
          alt="テスト画像"
          loading="lazy"
          preferThumbnail
          style={{ width: '80px', height: '80px' }}
        />
      );

      expect(screen.getByRole('img')).not.toHaveAttribute('src');
      expect(activeObserverCount()).toBe(1);

      act(() => {
        triggerAllIntersections(true);
      });

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/no-size.jpg');
      });
    });
  });

  describe('サーバーサイド生成の注釈付きサムネイル優先（画面読み込み時のリクエスト削減）', () => {
    const annotatedImage: SurveyImageInfo = {
      ...mockImage,
      annotatedThumbnailUrl: 'https://example.com/annotated-thumbnail.jpg',
      hasAnnotations: true,
    };

    /**
     * 合成済みサムネイルが供給されている場合、注釈を反映した表示のための追加リクエスト
     * （注釈取得API）が発生しないこと。数量表編集画面の表題部はこの経路を数量グループ
     * ごとに用いるため、グループごとの追加リクエストが発生しないことの根拠になる
     * （呼び出し側が preferThumbnail を渡すことは QuantityGroupCard.test.tsx が固定する）。
     *
     * @requirement quantity-table-generation/REQ-49.2
     */
    it('preferThumbnail=true かつ annotatedThumbnailUrl がある場合はそれを表示し getAnnotation を呼ばない (quantity-table-generation/REQ-49.2)', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(
        <AnnotatedImageThumbnail
          image={annotatedImage}
          alt="テスト画像"
          hasAnnotations
          preferThumbnail
        />
      );

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', annotatedImage.annotatedThumbnailUrl);
      });
      expect(surveyAnnotationsApi.getAnnotation).not.toHaveBeenCalled();
    });

    /**
     * 合成済みサムネイルが利用できない場合の代替手段（クライアント合成）。
     *
     * 注釈取得が発生するだけでは「代替手段が働いた」までしか示せないため、合成結果が
     * 実際に表示元へ反映されること（素のサムネイルのままにならないこと）まで確認する。
     * これは現場調査の一覧・詳細（site-survey/REQ-38.6）と数量表編集画面の表題部
     * （quantity-table-generation/REQ-49.6）が共有する同一の退避経路である。
     *
     * @requirement site-survey/REQ-38.6
     * @requirement quantity-table-generation/REQ-49.6
     */
    it('preferThumbnail=true でも annotatedThumbnailUrl がない場合はクライアント合成にフォールバックし合成結果を表示する (site-survey/REQ-38.6, quantity-table-generation/REQ-49.6)', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: annotatedImage.id,
        data: {
          objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150 }],
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderRevealed(
        <AnnotatedImageThumbnail
          image={{ ...annotatedImage, annotatedThumbnailUrl: null }}
          alt="テスト画像"
          hasAnnotations
          preferThumbnail
        />
      );

      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(annotatedImage.id);
      });

      // 合成結果（キャンバスの出力）が表示元になること。素のサムネイルのままなら
      // 注釈が失われており、代替手段が表示結果を維持できていない
      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute(
          'src',
          'data:image/jpeg;base64,mockdataurl'
        );
      });
    });

    it('preferThumbnail 未指定（拡大表示）のときは annotatedThumbnailUrl を使わずクライアント合成する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(
        <AnnotatedImageThumbnail image={annotatedImage} alt="テスト画像" hasAnnotations />
      );

      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(annotatedImage.id);
      });
      expect(screen.getByRole('img')).not.toHaveAttribute(
        'src',
        annotatedImage.annotatedThumbnailUrl
      );
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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      // APIが呼び出されたことを確認
      await waitFor(() => {
        expect(surveyAnnotationsApi.getAnnotation).toHaveBeenCalledWith(mockImage.id);
      });
    });
  });

  describe('表示倍率の適用先（Task 115.110 / site-survey/REQ-32.2）', () => {
    /**
     * 集合体（Group）として復元された注釈のモック
     *
     * 本番（七形状の構築処理）と同じく、子は `[outline*, body*]` の順で、
     * 集合体自身へ本体線幅を複写している。`getObjects()` は Fabric Group の契約。
     */
    function createMockGroupShape(bodyStrokeWidth: number, outlineWidthPx: number) {
      const childOutline = { type: 'path', strokeWidth: bodyStrokeWidth + outlineWidthPx * 2 };
      const childBody = { type: 'path', strokeWidth: bodyStrokeWidth };
      const children = [childOutline, childBody];
      const shape: Record<string, unknown> & {
        childOutline: { strokeWidth: number };
        childBody: { strokeWidth: number };
      } = {
        type: 'arrow',
        left: 100,
        top: 50,
        scaleX: 1,
        scaleY: 1,
        strokeWidth: bodyStrokeWidth,
        getObjects: () => children,
        childOutline,
        childBody,
        set(this: Record<string, unknown>, options: Record<string, unknown>) {
          Object.assign(this, options);
          return this;
        },
      };
      return shape;
    }

    beforeEach(() => {
      // 保存時 1000x500 に対し描画時 400x400 → scaleX = 0.4, scaleY = 0.8（非等倍）
      vi.spyOn(HTMLImageElement.prototype, 'width', 'get').mockReturnValue(400);
      vi.spyOn(HTMLImageElement.prototype, 'height', 'get').mockReturnValue(400);
    });

    it('集合体注釈の複写線幅は実描画の本体線幅と同じ座標系に保たれる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'arrow', left: 100, top: 50 }],
          canvasWidth: 1000,
          canvasHeight: 500,
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保存済みJSONの素の形をそのまま渡す
      } as any);

      const shape = createMockGroupShape(4, 3);
      const { util } = await import('fabric');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([shape as any]);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        expect(shape.scaleX).toBeCloseTo(0.4, 10);
      });
      expect(shape.scaleY).toBeCloseTo(0.8, 10);
      // 実描画（子）の線幅は入力値のまま。ここで分母を固定する
      expect(shape.childBody.strokeWidth).toBe(4);
      expect(shape.childOutline.strokeWidth).toBe(10);
      // 複写値は実描画の本体線幅と一致する（平均倍率 0.6 を重ねて掛けない）
      expect(shape.strokeWidth).toBe(shape.childBody.strokeWidth);
      expect(shape.strokeWidth).toBe(4);
    });

    it('自身の線で描かれるテキスト注釈の線幅には従来どおり平均倍率が掛かる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue({
        id: 'annotation-1',
        imageId: mockImage.id,
        data: {
          objects: [{ type: 'textAnnotation', left: 100, top: 50 }],
          canvasWidth: 1000,
          canvasHeight: 500,
        },
        version: '1.0',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 保存済みJSONの素の形をそのまま渡す
      } as any);

      const initialStrokeWidth = 24 * 0.12;
      const textObj: Record<string, unknown> = {
        type: 'textAnnotation',
        left: 100,
        top: 50,
        scaleX: 1,
        scaleY: 1,
        strokeWidth: initialStrokeWidth,
        strokeUniform: true,
        set(this: Record<string, unknown>, options: Record<string, unknown>) {
          Object.assign(this, options);
          return this;
        },
      };
      const { util } = await import('fabric');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fabric の複雑な型を満たさないモック
      vi.mocked(util.enlivenObjects).mockResolvedValueOnce([textObj as any]);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

      await waitFor(() => {
        expect(textObj.scaleX).toBeCloseTo(0.4, 10);
      });
      expect(textObj.strokeWidth).toBeCloseTo(initialStrokeWidth * 0.6, 10);
    });
  });

  describe('フォールバック画像URL', () => {
    it('mediumUrlがない場合はoriginalUrlを使用する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      const imageWithoutMedium: SurveyImageInfo = {
        ...mockImage,
        mediumUrl: null,
      };

      renderRevealed(<AnnotatedImageThumbnail image={imageWithoutMedium} alt="テスト画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={imageWithoutUrls} alt="テスト画像" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', imageWithoutUrls.originalPath);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('注釈取得エラー時は元画像を表示する', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockRejectedValue(new Error('API Error'));

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={imageWithoutUrl} alt="テスト画像" />);

      await waitFor(() => {
        expect(screen.getByText('画像を読み込めません')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はopacityが下がる', async () => {
      vi.mocked(surveyAnnotationsApi.getAnnotation).mockResolvedValue(null);

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      const { unmount } = renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />
      );

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

      renderRevealed(<AnnotatedImageThumbnail image={imageWithoutUrl} alt="エラー画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      renderRevealed(<AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />);

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

      const { unmount } = renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />
      );

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

      const { unmount } = renderRevealed(
        <AnnotatedImageThumbnail image={mockImage} alt="テスト画像" />
      );

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
