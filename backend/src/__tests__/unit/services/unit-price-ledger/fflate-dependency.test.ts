/**
 * @fileoverview 見積カードの zip を読む部品（fflate）がバックエンドの直接の依存であることの単体試験
 * （unit-price-ledger タスク1.4）
 *
 * fflate は他の部品の間接の依存としても入っているため、直接の依存に書かれていないと、間接の依存の
 * 変化で知らずに外れうる。design.md の Technology Stack は fflate 0.8.3 を直接の依存とする。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';

const packageJsonPath = fileURLToPath(new URL('../../../../../package.json', import.meta.url));

describe('fflate の依存', () => {
  it('バックエンドの直接の依存（dependencies）に 0.8 系で書かれている', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.fflate).toMatch(/^\^0\.8\./);
  });

  it('unzipSync で zip の中の JSON を読める', () => {
    const zipped = zipSync({ 'cards/a.json': strToU8('{"id":"card-1"}') });
    const entries = unzipSync(zipped);

    expect(Object.keys(entries)).toEqual(['cards/a.json']);
    const entry = entries['cards/a.json'];
    expect(entry).toBeDefined();
    expect(JSON.parse(strFromU8(entry as Uint8Array))).toEqual({ id: 'card-1' });
  });
});
