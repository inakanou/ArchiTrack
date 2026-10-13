/**
 * @fileoverview サーバー側注釈描画による注釈付きサムネイル生成の封鎖テスト
 *
 * Task 53.2 / 55.1 で AnnotatedThumbnailService の生成挙動を検証していたが、
 * Task 115.6 でサーバー側描画による生成の位置づけが「本番データを生成してはならない」
 * に確定したため、生成の成否を検証するテストを、生成が起動できないことを固定する
 * テストへ置き換えた。SVG 生成関数そのもののテスト（後半）は、描画器が対応している
 * 図形の範囲を記録として残すためそのまま維持する。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AnnotatedThumbnailService,
  ServerSideAnnotatedThumbnailDisabledError,
  type AnnotatedThumbnailServiceDependencies,
  generateSvgFromAnnotation,
} from '../../../services/annotated-thumbnail.service.js';
import type { AnnotationData } from '../../../services/annotation.service.js';

describe('AnnotatedThumbnailService: サーバー側描画による生成の封鎖 (Task 115.6)', () => {
  function buildDeps() {
    return {
      prisma: {
        surveyImage: { findUnique: vi.fn(), update: vi.fn() },
      },
      storageProvider: {
        get: vi.fn(),
        upload: vi.fn(),
        delete: vi.fn(),
        getSignedUrl: vi.fn(),
        type: 'local',
      },
    };
  }

  function construct(deps: ReturnType<typeof buildDeps>): AnnotatedThumbnailService {
    return new AnnotatedThumbnailService({
      prisma: deps.prisma as unknown as AnnotatedThumbnailServiceDependencies['prisma'],
      storageProvider:
        deps.storageProvider as unknown as AnnotatedThumbnailServiceDependencies['storageProvider'],
    });
  }

  it('生成サービスを構築しようとすると失敗し、生成を実行できる実体が得られない', () => {
    expect(() => construct(buildDeps())).toThrow(ServerSideAnnotatedThumbnailDisabledError);
  });

  it('構築の失敗はストレージにもデータベースにも触れない（本番データを生成しない）', () => {
    const deps = buildDeps();

    expect(() => construct(deps)).toThrow();

    expect(deps.storageProvider.upload).not.toHaveBeenCalled();
    expect(deps.storageProvider.delete).not.toHaveBeenCalled();
    expect(deps.prisma.surveyImage.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.surveyImage.update).not.toHaveBeenCalled();
  });

  it('失敗は判別可能な code を持ち、有効化してはならない理由を伝える', () => {
    let caught: unknown;
    try {
      construct(buildDeps());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServerSideAnnotatedThumbnailDisabledError);
    const error = caught as ServerSideAnnotatedThumbnailDisabledError;
    expect(error.code).toBe('SERVER_SIDE_ANNOTATED_THUMBNAIL_DISABLED');
    // 有効化しようとした者が欠陥に気づけること（描画されない注釈・座標の換算・回転）
    expect(error.message).toContain('矢印');
    expect(error.message).toContain('座標');
    expect(error.message).toContain('回転');
    expect(error.message).toContain('design.md');
  });

  // 構築を迂回して生成メソッドへ到達した場合の二重の封鎖。
  // 「構築できないから安全」だけに依存すると、prototype 経由やサブクラス化で
  // 合成済みサムネイルの生成・永続化が復活しうる。
  it('構築を迂回して生成メソッドへ到達しても合成済みサムネイルを生成しない', async () => {
    const detached = AnnotatedThumbnailService.prototype.generateAnnotatedThumbnail;

    await expect(
      detached.call({} as AnnotatedThumbnailService, 'image-123', { version: '1.0', objects: [] })
    ).rejects.toBeInstanceOf(ServerSideAnnotatedThumbnailDisabledError);
  });

  it('構築を迂回して削除メソッドへ到達しても保存先の項目を書き換えない', async () => {
    const detached = AnnotatedThumbnailService.prototype.removeAnnotatedThumbnail;

    await expect(
      detached.call({} as AnnotatedThumbnailService, 'image-123')
    ).rejects.toBeInstanceOf(ServerSideAnnotatedThumbnailDisabledError);
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
