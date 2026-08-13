/**
 * @fileoverview 注釈保存の本番経路がサーバー側の注釈付きサムネイル生成に到達しないことのテスト
 *
 * Task 115.6: サーバー側の注釈描画による生成手段の位置づけを確定する
 *
 * 注釈保存の本番経路（annotation.routes）は AnnotationService を構築する。
 * AnnotationService はサムネイル生成サービスを任意依存として受け取り、注入されていれば
 * 保存のたびに合成済みサムネイルを生成・永続化する。したがって「本番から到達不能」は
 * 当該依存が本番の結線で注入されていないことに等しい。
 *
 * 本テストは結線そのものを観測する。呼ばれていないことの偶然ではなく、注入された時点で
 * 失敗する形にすることが目的である。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/** AnnotationService の構築時に渡された依存を記録する */
const constructorDeps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('../../../services/annotation.service', () => {
  class AnnotationService {
    constructor(deps: Record<string, unknown>) {
      constructorDeps.push(deps);
    }
  }
  class AnnotationImageNotFoundError extends Error {}
  class AnnotationConflictError extends Error {}
  class InvalidAnnotationDataError extends Error {}
  class AnnotationNotFoundError extends Error {}
  return {
    AnnotationService,
    AnnotationImageNotFoundError,
    AnnotationConflictError,
    InvalidAnnotationDataError,
    AnnotationNotFoundError,
    ANNOTATION_SCHEMA_VERSION: '1.0',
  };
});

vi.mock('../../../db', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('../../../redis', () => ({
  default: { getClient: vi.fn(() => null) },
}));

vi.mock('../../../storage/index.js', () => ({
  isStorageConfigured: vi.fn(() => true),
  getStorageProvider: vi.fn(() => ({ getSignedUrl: vi.fn() })),
}));

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// モック定義の後に本番の結線を読み込む
import '../../../routes/annotation.routes.js';

describe('注釈保存の本番経路: サーバー側サムネイル生成への到達不能性 (Task 115.6)', () => {
  it('本番経路は注釈サービスを1度だけ構築する', () => {
    expect(constructorDeps).toHaveLength(1);
  });

  it('本番経路は注釈付きサムネイル生成サービスを注釈サービスへ注入しない', () => {
    const deps = constructorDeps[0];

    expect(deps).toBeDefined();
    expect(deps?.annotatedThumbnailService).toBeUndefined();
  });

  it('本番経路が注釈サービスへ渡すのは永続化の依存のみである', () => {
    const deps = constructorDeps[0] ?? {};

    // 依存の追加は結線の変更であり、サーバー側生成の再有効化はここに現れる
    expect(Object.keys(deps).sort()).toEqual(['prisma']);
  });
});
