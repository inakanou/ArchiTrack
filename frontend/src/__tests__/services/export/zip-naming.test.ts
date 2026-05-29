/**
 * @fileoverview zip-naming スモーク + 網羅テスト
 *
 * Task 76.2 のスモークテスト 3 件に加え、Task 76.3 で
 * 「重複名サフィックス」「サニタイズ規則」「長さ制限」「ZIP ファイル名フォーマット」
 * の 4 観点を網羅的に検証するテストを追加。
 *
 * @requirement site-survey/REQ-31.8 ZIP 内画像ファイル名規則の統一
 * @requirement site-survey/REQ-31.9 ZIP ファイル名の生成
 */

import { describe, it, expect } from 'vitest';
import {
  buildEntryName,
  buildZipFileName,
  sanitizeName,
  formatYmdHms,
  type ZipNamingInput,
  type SurveyImageMetadata,
} from '../../../services/export/zip-naming';

const makeImage = (overrides: Partial<SurveyImageMetadata> = {}): SurveyImageMetadata => ({
  id: 'img-001',
  fileName: 'photo.jpg',
  ...overrides,
});

const makeInput = (overrides: Partial<ZipNamingInput> = {}): ZipNamingInput => ({
  surveyName: '現場A',
  exportedAt: new Date('2026-01-15T10:30:45'),
  image: makeImage(),
  index: 1,
  format: 'jpeg',
  ...overrides,
});

// ============================================================================
// スモークテスト（Task 76.2）
// ============================================================================

describe('zip-naming スモークテスト', () => {
  it('buildEntryName: index 3桁ゼロパディングとサニタイズ済表示名で決定論的にエントリ名を生成する', () => {
    const existing = new Set<string>();
    const name = buildEntryName(
      makeInput({ index: 1, image: makeImage({ fileName: 'photo-001.jpg' }), format: 'jpeg' }),
      existing
    );

    expect(name).toBe('001_photo-001.jpg');
    expect(existing.has('001_photo-001.jpg')).toBe(true);
  });

  it('buildEntryName: 同一名が重複した場合は _2, _3 の連番サフィックスを付与する', () => {
    const existing = new Set<string>();
    const first = buildEntryName(
      makeInput({ index: 2, image: makeImage({ fileName: 'photo.jpg' }) }),
      existing
    );
    const second = buildEntryName(
      makeInput({ index: 2, image: makeImage({ fileName: 'photo.jpg' }) }),
      existing
    );
    const third = buildEntryName(
      makeInput({ index: 2, image: makeImage({ fileName: 'photo.jpg' }) }),
      existing
    );

    expect(first).toBe('002_photo.jpg');
    expect(second).toBe('002_photo_2.jpg');
    expect(third).toBe('002_photo_3.jpg');
  });

  it('buildZipFileName: 現場調査名サニタイズと YYYYMMDD_HHmmss 形式で ZIP ファイル名を生成する', () => {
    const exportedAt = new Date('2026-01-15T10:30:45');
    const result = buildZipFileName('現場/調査:A', exportedAt);

    expect(result).toBe('現場_調査_A_20260115_103045.zip');
  });
});

// ============================================================================
// 観点1: 重複名サフィックス（Task 76.3）
// ============================================================================

describe('重複名サフィックス', () => {
  it('3 つ以上の重複に対し _2, _3, _4 と連番が増える', () => {
    const existing = new Set<string>();
    const results = [1, 2, 3, 4, 5].map(() =>
      buildEntryName(makeInput({ index: 1, image: makeImage({ fileName: 'photo.jpg' }) }), existing)
    );

    expect(results).toEqual([
      '001_photo.jpg',
      '001_photo_2.jpg',
      '001_photo_3.jpg',
      '001_photo_4.jpg',
      '001_photo_5.jpg',
    ]);
  });

  it('10 件超の重複でも連番が崩れずに付与される', () => {
    const existing = new Set<string>();
    const results: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      results.push(
        buildEntryName(
          makeInput({ index: 7, image: makeImage({ fileName: 'shot.png' }), format: 'png' }),
          existing
        )
      );
    }

    expect(results[0]).toBe('007_shot.png');
    expect(results[1]).toBe('007_shot_2.png');
    expect(results[9]).toBe('007_shot_10.png');
    expect(results[11]).toBe('007_shot_12.png');
    // 全件が一意であることを確認
    expect(new Set(results).size).toBe(results.length);
  });

  it('異なる画像 ID でも fileName と index が同じならサフィックスが付く', () => {
    const existing = new Set<string>();
    const first = buildEntryName(
      makeInput({ index: 3, image: makeImage({ id: 'img-A', fileName: 'cover.jpg' }) }),
      existing
    );
    const second = buildEntryName(
      makeInput({ index: 3, image: makeImage({ id: 'img-B', fileName: 'cover.jpg' }) }),
      existing
    );
    const third = buildEntryName(
      makeInput({ index: 3, image: makeImage({ id: 'img-C', fileName: 'cover.jpg' }) }),
      existing
    );

    expect(first).toBe('003_cover.jpg');
    expect(second).toBe('003_cover_2.jpg');
    expect(third).toBe('003_cover_3.jpg');
  });

  it('existingNames Set に確定したエントリ名が副作用で追加される', () => {
    const existing = new Set<string>();
    const name1 = buildEntryName(
      makeInput({ index: 1, image: makeImage({ fileName: 'a.jpg' }) }),
      existing
    );
    const name2 = buildEntryName(
      makeInput({ index: 2, image: makeImage({ fileName: 'b.jpg' }) }),
      existing
    );

    expect(existing.has(name1)).toBe(true);
    expect(existing.has(name2)).toBe(true);
    expect(existing.size).toBe(2);
  });

  it('重複時に付与されたサフィックス付き名前も existingNames に登録される', () => {
    const existing = new Set<string>();
    buildEntryName(makeInput({ index: 4, image: makeImage({ fileName: 'dup.jpg' }) }), existing);
    buildEntryName(makeInput({ index: 4, image: makeImage({ fileName: 'dup.jpg' }) }), existing);

    expect(existing.has('004_dup.jpg')).toBe(true);
    expect(existing.has('004_dup_2.jpg')).toBe(true);
    expect(existing.size).toBe(2);
  });

  it('index が異なれば prefix が異なるため重複扱いにならない', () => {
    const existing = new Set<string>();
    const first = buildEntryName(
      makeInput({ index: 1, image: makeImage({ fileName: 'photo.jpg' }) }),
      existing
    );
    const second = buildEntryName(
      makeInput({ index: 2, image: makeImage({ fileName: 'photo.jpg' }) }),
      existing
    );

    expect(first).toBe('001_photo.jpg');
    expect(second).toBe('002_photo.jpg');
  });
});

// ============================================================================
// 観点2: サニタイズ規則（Task 76.3）
// ============================================================================

describe('サニタイズ規則', () => {
  it.each([
    ['スラッシュ', 'foo/bar', 'foo_bar'],
    ['バックスラッシュ', 'foo\\bar', 'foo_bar'],
    ['コロン', 'foo:bar', 'foo_bar'],
    ['クエスチョン', 'foo?bar', 'foo_bar'],
    ['アスタリスク', 'foo*bar', 'foo_bar'],
    ['ダブルクオート', 'foo"bar', 'foo_bar'],
    ['小なり', 'foo<bar', 'foo_bar'],
    ['大なり', 'foo>bar', 'foo_bar'],
    ['パイプ', 'foo|bar', 'foo_bar'],
  ])('sanitizeName: %s を _ に置換する (%s -> %s)', (_label, input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
  });

  it('sanitizeName: NUL 文字 (\\x00) を _ に置換する', () => {
    expect(sanitizeName('foo\x00bar')).toBe('foo_bar');
  });

  it('sanitizeName: 制御文字 (\\x01〜\\x1F) を _ に置換する', () => {
    expect(sanitizeName('foo\x01\x1Fbar')).toBe('foo__bar');
    expect(sanitizeName('a\x0Bb\x0Cc\x1Bd')).toBe('a_b_c_d');
  });

  it('sanitizeName: 複数のサニタイズ対象文字が同時に出現しても全て置換される', () => {
    expect(sanitizeName('a/b\\c:d?e*f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('sanitizeName: 先頭の空白を除去する', () => {
    expect(sanitizeName('   hello')).toBe('hello');
  });

  it('sanitizeName: 末尾の空白を除去する', () => {
    expect(sanitizeName('hello   ')).toBe('hello');
  });

  it('sanitizeName: 先頭のピリオドを除去する', () => {
    expect(sanitizeName('...hidden')).toBe('hidden');
  });

  it('sanitizeName: 末尾のピリオドを除去する', () => {
    expect(sanitizeName('trailing...')).toBe('trailing');
  });

  it('sanitizeName: 先頭と末尾の空白・ピリオドの混在を除去する', () => {
    expect(sanitizeName(' . .name. . ')).toBe('name');
  });

  it('sanitizeName: 空文字は unnamed にフォールバックする', () => {
    expect(sanitizeName('')).toBe('unnamed');
  });

  it('sanitizeName: 空白とピリオドのみの文字列は unnamed にフォールバックする', () => {
    expect(sanitizeName('   ')).toBe('unnamed');
    expect(sanitizeName('...')).toBe('unnamed');
    expect(sanitizeName(' . . . ')).toBe('unnamed');
  });

  it('sanitizeName: 日本語など多バイト文字はそのまま保持する', () => {
    expect(sanitizeName('現場A棟北側')).toBe('現場A棟北側');
  });

  it('buildEntryName: 画像ファイル名に含まれるパス区切りもサニタイズされる', () => {
    const existing = new Set<string>();
    const name = buildEntryName(
      makeInput({
        index: 1,
        image: makeImage({ fileName: 'sub/dir/photo.jpg' }),
        format: 'jpeg',
      }),
      existing
    );

    // stripExtension により ".jpg" は除去され、残りの "sub/dir/photo" がサニタイズされる
    expect(name).toBe('001_sub_dir_photo.jpg');
  });
});

// ============================================================================
// 観点3: 長さ制限（Task 76.3）
// ============================================================================

describe('長さ制限', () => {
  it('sanitizeName: 80 文字超の名前はデフォルトで 80 文字に切り詰められる', () => {
    const input = 'a'.repeat(100);
    const result = sanitizeName(input);

    expect(result.length).toBe(80);
    expect(result).toBe('a'.repeat(80));
  });

  it('sanitizeName: 80 文字ちょうどの名前はそのまま返る', () => {
    const input = 'b'.repeat(80);
    const result = sanitizeName(input);

    expect(result.length).toBe(80);
    expect(result).toBe(input);
  });

  it('sanitizeName: 80 文字未満の名前はそのまま返る', () => {
    const input = 'c'.repeat(50);
    const result = sanitizeName(input);

    expect(result.length).toBe(50);
    expect(result).toBe(input);
  });

  it('sanitizeName: 明示した maxLength で切り詰められる', () => {
    const input = 'x'.repeat(20);
    expect(sanitizeName(input, 10)).toBe('x'.repeat(10));
  });

  it('buildEntryName: 表示名は 76 文字 (= 80 - prefix 4 文字) で切り詰められた上で拡張子が保持される', () => {
    const existing = new Set<string>();
    const longBase = 'a'.repeat(100);
    const name = buildEntryName(
      makeInput({
        index: 1,
        image: makeImage({ fileName: `${longBase}.jpg` }),
        format: 'jpeg',
      }),
      existing
    );

    // 形式: NNN_{76文字}.jpg
    expect(name.startsWith('001_')).toBe(true);
    expect(name.endsWith('.jpg')).toBe(true);
    // prefix `001_` (4) + 表示名 76 + `.jpg` (4) = 84
    expect(name.length).toBe(84);

    const middle = name.slice(4, name.length - 4);
    expect(middle).toBe('a'.repeat(76));
  });

  it('buildEntryName: 切り詰めが発生しても png 拡張子が保持される', () => {
    const existing = new Set<string>();
    const longBase = 'z'.repeat(200);
    const name = buildEntryName(
      makeInput({
        index: 9,
        image: makeImage({ fileName: `${longBase}.png` }),
        format: 'png',
      }),
      existing
    );

    expect(name.startsWith('009_')).toBe(true);
    expect(name.endsWith('.png')).toBe(true);
  });

  it('buildEntryName: 76 文字未満の表示名は切り詰められない', () => {
    const existing = new Set<string>();
    const shortBase = 'short-name';
    const name = buildEntryName(
      makeInput({
        index: 1,
        image: makeImage({ fileName: `${shortBase}.jpg` }),
        format: 'jpeg',
      }),
      existing
    );

    expect(name).toBe('001_short-name.jpg');
  });

  it('buildEntryName: fileName が空でも id をフォールバックに使い名前を生成する', () => {
    const existing = new Set<string>();
    const name = buildEntryName(
      makeInput({
        index: 1,
        image: makeImage({ id: 'fallback-id', fileName: '' }),
        format: 'jpeg',
      }),
      existing
    );

    expect(name).toBe('001_fallback-id.jpg');
  });
});

// ============================================================================
// 観点4: ZIP ファイル名フォーマット（Task 76.3）
// ============================================================================

describe('ZIP ファイル名フォーマット', () => {
  it('formatYmdHms: 1 月はゼロパディングされて 01 になる', () => {
    const date = new Date(2026, 0, 5, 9, 8, 7); // 2026-01-05 09:08:07 ローカル
    expect(formatYmdHms(date)).toBe('20260105_090807');
  });

  it('formatYmdHms: 9 月は 09 になる', () => {
    const date = new Date(2026, 8, 9, 1, 2, 3); // 2026-09-09 01:02:03
    expect(formatYmdHms(date)).toBe('20260909_010203');
  });

  it('formatYmdHms: 12 月および 31 日もそのまま 2 桁で出力される', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59); // 2026-12-31 23:59:59
    expect(formatYmdHms(date)).toBe('20261231_235959');
  });

  it('formatYmdHms: 0 分 0 秒も 00 でゼロパディングされる', () => {
    const date = new Date(2026, 5, 15, 0, 0, 0); // 2026-06-15 00:00:00
    expect(formatYmdHms(date)).toBe('20260615_000000');
  });

  it('formatYmdHms: 4 桁年がそのまま反映される', () => {
    const date = new Date(2026, 0, 1, 12, 0, 0);
    expect(formatYmdHms(date).startsWith('2026')).toBe(true);
  });

  it('buildZipFileName: 現場調査名にサニタイズ規則が適用される', () => {
    const exportedAt = new Date(2026, 0, 15, 10, 30, 45);
    const result = buildZipFileName('A/B:C?D', exportedAt);

    expect(result).toBe('A_B_C_D_20260115_103045.zip');
  });

  it('buildZipFileName: 現場調査名が空でも unnamed_<timestamp>.zip 形式で生成される', () => {
    const exportedAt = new Date(2026, 0, 15, 10, 30, 45);
    const result = buildZipFileName('', exportedAt);

    expect(result).toBe('unnamed_20260115_103045.zip');
  });

  it('buildZipFileName: 拡張子は必ず .zip になる', () => {
    const exportedAt = new Date(2026, 0, 15, 10, 30, 45);
    const a = buildZipFileName('現場A', exportedAt);
    const b = buildZipFileName('site-X', exportedAt);

    expect(a.endsWith('.zip')).toBe(true);
    expect(b.endsWith('.zip')).toBe(true);
  });

  it('buildZipFileName: 80 文字超の現場調査名は 80 文字に切り詰められた上でフォーマットされる', () => {
    const exportedAt = new Date(2026, 0, 15, 10, 30, 45);
    const longName = 'L'.repeat(100);
    const result = buildZipFileName(longName, exportedAt);

    expect(result).toBe(`${'L'.repeat(80)}_20260115_103045.zip`);
  });

  it('buildZipFileName: 全体形式が {サニタイズ名}_YYYYMMDD_HHmmss.zip の正規表現にマッチする', () => {
    const exportedAt = new Date(2026, 0, 15, 10, 30, 45);
    const result = buildZipFileName('現場A', exportedAt);

    expect(result).toMatch(/^.+_\d{8}_\d{6}\.zip$/);
  });
});
