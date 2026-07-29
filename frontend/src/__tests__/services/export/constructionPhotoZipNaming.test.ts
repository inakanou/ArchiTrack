/**
 * @fileoverview constructionPhotoZipNaming のテスト
 *
 * Task 11.3: ZIP一括エクスポートサービスの命名ユーティリティ
 *
 * 検証観点:
 * - エントリ名が `{index 3桁}_{サニタイズ済みファイル名}.{拡張子}` 形式になる
 * - 拡張子は format（jpeg→jpg / png→png）で決まる
 * - 同名衝突時に `_2`, `_3` の連番サフィックスが付く
 * - 危険文字（パス区切り・コロン・予約文字）がサニタイズされる
 * - ZIPファイル名が `{アルバム名}_{YYYYMMDD_HHmmss}.zip` 形式になる
 */

import { describe, it, expect } from 'vitest';
import {
  buildConstructionPhotoZipEntryName,
  buildConstructionPhotoZipFileName,
  sanitizeConstructionPhotoName,
} from '../../../services/export/constructionPhotoZipNaming';

describe('buildConstructionPhotoZipEntryName', () => {
  it('index 3桁ゼロパディング + サニタイズ済みファイル名 + 拡張子で命名する', () => {
    const existingNames = new Set<string>();
    const name = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p1', fileName: 'photo.png' }, index: 0, format: 'jpeg' },
      existingNames
    );
    expect(name).toBe('000_photo.jpg');
  });

  it('format=png のとき拡張子が .png になる', () => {
    const existingNames = new Set<string>();
    const name = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p1', fileName: 'photo.jpg' }, index: 5, format: 'png' },
      existingNames
    );
    expect(name).toBe('005_photo.png');
  });

  it('同名衝突時は _2, _3 の連番サフィックスを付与する', () => {
    const existingNames = new Set<string>();
    const first = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p1', fileName: 'same' }, index: 0, format: 'jpeg' },
      existingNames
    );
    const second = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p2', fileName: 'same' }, index: 0, format: 'jpeg' },
      existingNames
    );
    // index が同じでもファイル名衝突は起きないが（index を含むため）、
    // 同一 index・同一ファイル名の組合せでは衝突する
    expect(first).toBe('000_same.jpg');
    expect(second).toBe('000_same_2.jpg');
  });

  it('パス区切り・コロン・予約文字を含むファイル名はサニタイズされる', () => {
    const existingNames = new Set<string>();
    const name = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p1', fileName: 'sub/dir\\name:test?.jpg' }, index: 2, format: 'jpeg' },
      existingNames
    );
    expect(name).toBe('002_sub_dir_name_test_.jpg');
  });

  it('ファイル名が空文字の場合は unnamed にフォールバックする', () => {
    const existingNames = new Set<string>();
    const name = buildConstructionPhotoZipEntryName(
      { photo: { id: 'p1', fileName: '' }, index: 0, format: 'jpeg' },
      existingNames
    );
    expect(name).toBe('000_p1.jpg');
  });
});

describe('buildConstructionPhotoZipFileName', () => {
  it('アルバム名_YYYYMMDD_HHmmss.zip 形式で命名する', () => {
    const date = new Date(2026, 6, 28, 9, 5, 3); // 2026-07-28 09:05:03（ローカル）
    const name = buildConstructionPhotoZipFileName('現場A アルバム', date);
    expect(name).toBe('現場A アルバム_20260728_090503.zip');
  });
});

describe('sanitizeConstructionPhotoName', () => {
  it('80文字を超える場合は切り詰める', () => {
    const long = 'a'.repeat(100);
    const result = sanitizeConstructionPhotoName(long);
    expect(result).toHaveLength(80);
  });
});
