/**
 * @fileoverview zip-naming スモークテスト
 *
 * Task 76.2 の観測可能な完了状態
 * 「ユニットテストで命名規則が決定論的に生成され、
 *  重複入力に対し連番サフィックスが付くことを確認する」
 * を満たすための最小スモークテスト。
 *
 * 網羅的なテストは Task 76.3 で追加する。
 *
 * @requirement site-survey/REQ-31.8
 * @requirement site-survey/REQ-31.9
 */

import { describe, it, expect } from 'vitest';
import {
  buildEntryName,
  buildZipFileName,
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
