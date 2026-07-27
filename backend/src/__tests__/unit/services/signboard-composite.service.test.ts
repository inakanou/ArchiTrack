/**
 * @fileoverview SignboardCompositeService ユニットテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 3.3: 看板合成＋印字画像エンドポイント（オンデマンド）
 *
 * SignboardCompositeService は、原本画像バッファへ電子小黒板SVG（Task 3.2 の
 * generateSignboardSvg）を sharp.composite で重畳し、印字用の JPEG バッファを
 * 生成する（保存しない）。SVG の viewBox は画像実寸のため top:0/left:0 で重畳する。
 *
 * Requirements:
 * - 9.6: 看板ありは指定位置・大きさで写真へ重畳する
 * - 10.8: PDF出力時に看板の登録内容を電子小黒板調で指定位置・大きさで重畳する
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SignboardCompositeService,
  type CompositeSharpStatic,
} from '../../../services/signboard-composite.service.js';
import type {
  ConstructionSignboardDto,
  SignboardPlacement,
} from '../../../types/construction-photo.types.js';

const PROJECT_ID = '223e4567-e89b-12d3-a456-426614174000';

function signboard(overrides: Partial<ConstructionSignboardDto> = {}): ConstructionSignboardDto {
  return {
    id: 'sb-1',
    projectId: PROJECT_ID,
    workName: '外壁改修工事',
    workLocation: '東京都千代田区',
    freeItems: [{ label: '施工者', value: '株式会社アークン' }],
    footerText: '施工状況',
    inUseCount: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PLACEMENT: SignboardPlacement = { left: 10, top: 20, width: 300, height: 200 };

/**
 * sharp のモック。composite に渡された入力（SVG バッファ）を記録し、
 * toBuffer で合成後バッファを返す。
 */
function createMockSharp() {
  const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [];
  const compositeSpy = vi.fn();
  const jpegSpy = vi.fn();
  const instance = {
    metadata: vi.fn().mockResolvedValue({ width: 1024, height: 768 }),
    composite(inputs: Array<{ input: Buffer; top: number; left: number }>) {
      compositeSpy(inputs);
      compositeInputs.push(...inputs);
      return instance;
    },
    jpeg(opts?: { quality?: number }) {
      jpegSpy(opts);
      return instance;
    },
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('composited-jpeg')),
  };
  const factory = vi.fn().mockReturnValue(instance) as unknown as CompositeSharpStatic;
  return { factory, instance, compositeInputs, compositeSpy, jpegSpy };
}

describe('SignboardCompositeService.composite', () => {
  let mock: ReturnType<typeof createMockSharp>;
  let service: SignboardCompositeService;

  beforeEach(() => {
    mock = createMockSharp();
    service = new SignboardCompositeService({ sharp: mock.factory });
  });

  it('原本の実寸で看板SVGを重畳し JPEG バッファを返す（Requirements: 9.6, 10.8）', async () => {
    const original = Buffer.from('original-image-bytes');

    const result = await service.composite(original, signboard(), PLACEMENT);

    // 原本バッファで sharp を初期化
    expect(mock.factory).toHaveBeenCalledWith(original);
    // 画像実寸取得
    expect(mock.instance.metadata).toHaveBeenCalledTimes(1);
    // composite が1回、top:0/left:0（SVG viewBox が画像実寸のため）
    expect(mock.compositeSpy).toHaveBeenCalledTimes(1);
    expect(mock.compositeInputs).toHaveLength(1);
    expect(mock.compositeInputs[0]!.top).toBe(0);
    expect(mock.compositeInputs[0]!.left).toBe(0);
    // JPEG 化して返す
    expect(mock.jpegSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(Buffer.from('composited-jpeg'));
  });

  it('重畳する SVG に看板内容と配置・画像実寸が反映される（Requirements: 10.8）', async () => {
    const original = Buffer.from('original-image-bytes');

    await service.composite(original, signboard(), PLACEMENT);

    const svg = mock.compositeInputs[0]!.input.toString('utf-8');
    // 画像実寸の viewBox
    expect(svg).toContain('viewBox="0 0 1024 768"');
    // 看板内容（工事件名・場所・自由項目）
    expect(svg).toContain('外壁改修工事');
    expect(svg).toContain('東京都千代田区');
    expect(svg).toContain('株式会社アークン');
    // 配置（left=10）が矩形 x に反映される
    expect(svg).toContain('x="10"');
    expect(svg).toContain('width="300"');
  });

  it('画像メタデータに寸法が無い場合は例外を投げる', async () => {
    (mock.instance.metadata as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await expect(service.composite(Buffer.from('x'), signboard(), PLACEMENT)).rejects.toThrow();
  });
});
