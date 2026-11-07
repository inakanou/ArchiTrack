/**
 * Tesseract.js の資材の取得先の単体テスト（是正計画 D14）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  TESSERACT_CORE_VERSION,
  TESSERACT_JS_VERSION,
  TESSERACT_WORKER_OPTIONS,
} from './tesseract-assets';

// npm はスクリプトを frontend パッケージルートで実行するため cwd 基準で解決する
const installedVersion = (name: string): string =>
  (
    JSON.parse(
      readFileSync(resolve(process.cwd(), 'node_modules', name, 'package.json'), 'utf8')
    ) as { version: string }
  ).version;

describe('tesseract-assets', () => {
  it('版が導入済みの tesseract.js・tesseract.js-core と一致する（配信物のパスとずれない）', () => {
    expect(TESSERACT_JS_VERSION).toBe(installedVersion('tesseract.js'));
    expect(TESSERACT_CORE_VERSION).toBe(installedVersion('tesseract.js-core'));
  });

  it('取得先はすべて画面と同じオリジンの相対パスで、外部の CDN を指さない', () => {
    for (const value of Object.values(TESSERACT_WORKER_OPTIONS)) {
      expect(value.startsWith('/tesseract/')).toBe(true);
      expect(value).not.toMatch(/^https?:|jsdelivr|projectnaptha/);
    }
  });
});
