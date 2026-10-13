/**
 * @fileoverview 注釈保存の本番経路にサーバー側サムネイル再生成の分岐が復活しないことのテスト
 *
 * Task 115.6: サーバー側の注釈描画による生成手段の位置づけを確定する
 * Task 115.107: サーバー側のサムネイル再生成が到達不能である状態を解消する（撤去で解消）
 *
 * 注釈保存の本番経路（annotation.routes）は AnnotationService を構築する。
 * かつて AnnotationService はサムネイル生成サービスを任意依存として受け取り、注入されて
 * いれば保存のたびに合成済みサムネイルを生成・永続化していた。しかしその依存は本番の
 * 結線で一度も注入されず、唯一の実装（AnnotatedThumbnailService）は Task 115.6 で
 * 構築時に失敗する形へ封鎖されたため、分岐も失敗応答も到達不能なまま残っていた。
 * Task 115.107 で当該の任意依存・分岐・失敗応答を撤去した。
 *
 * 合成済みサムネイルの生成は画像編集画面（クライアント）が担い、保存先は
 * `PATCH` / `DELETE /api/site-surveys/images/:imageId/annotated-thumbnail` が更新する。
 *
 * 本テストは「同じ形の死んだ分岐が再び入らないこと」を機械的に検知する。
 * 結線（構築時に渡す依存）と、注釈サービスの実装本体（依存の受け口と分岐）の双方を観測する。
 *
 * Requirements:
 * - 20.4: 注釈をレンダリングしたサムネイル画像の生成契機
 * - 23.4: サムネイル再生成の完了を保証してから保存完了とみなす
 * - 23.6: サムネイル再生成失敗時のエラー提示
 * - 23.8: サムネイル再生成の冪等性
 * - 38.6: 注釈付きサムネイルが利用できない場合の代替手段を維持する
 */

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
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

vi.mock('../../../middleware/authenticate.middleware', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../../middleware/authorize.middleware', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// モック定義の後に本番の結線を読み込む
import '../../../routes/annotation.routes.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = path.resolve(HERE, '../../..');

function readSource(relativePath: string): string {
  const absolute = path.join(BACKEND_SRC, relativePath);
  // 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
  // 読めない場合は「該当なし」ではなく失敗させる
  return fs.readFileSync(absolute, 'utf-8');
}

describe('注釈保存の本番経路: サーバー側サムネイル再生成の撤去 (Task 115.107)', () => {
  it('本番経路は注釈サービスを1度だけ構築する', () => {
    expect(constructorDeps).toHaveLength(1);
  });

  it('本番経路が注釈サービスへ渡すのは永続化の依存のみである', () => {
    const deps = constructorDeps[0] ?? {};

    // 依存の追加は結線の変更であり、サーバー側生成の再導入はここに現れる
    expect(Object.keys(deps).sort()).toEqual(['prisma']);
  });

  it('注釈サービスはサムネイル生成の依存も分岐も持たない', () => {
    const source = readSource('services/annotation.service.ts');

    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toContain('annotatedThumbnailService');
    expect(source).not.toContain('IAnnotatedThumbnailService');
    expect(source).not.toContain('ThumbnailRegenerationError');
  });

  it('注釈保存の経路はサムネイル再生成の失敗応答を持たない', () => {
    const source = readSource('routes/annotation.routes.ts');

    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toContain('ThumbnailRegenerationError');
    expect(source).not.toContain('THUMBNAIL_REGENERATION_FAILED');
    expect(source).not.toContain('annotatedThumbnailUrl');
  });
});
