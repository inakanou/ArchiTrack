/**
 * @fileoverview Zod の CSP 向けの設定のテスト
 *
 * user-authentication タスク56.2。画面の CSP（design.md の FrontendNginxConfig）は script-src に
 * `'unsafe-eval'` を含めない。Zod v4 は既定で、オブジェクトのスキーマを作るときに `new Function("")`
 * で eval の可否を試すため、CSP の下では画面を開くたびに `securitypolicyviolation` が起きる。
 * 画面の入口が最初に読み込む本設定が、試行そのものを止めることを確かめる。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

describe('zod-csp-config', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('読み込むと Zod の JIT（eval の試行）を止める', async () => {
    await import('./zod-csp-config');

    expect(z.config().jitless).toBe(true);
  });

  it('読み込んだ後にオブジェクトのスキーマを作っても Function のコンストラクタを呼ばない', async () => {
    await import('./zod-csp-config');
    const functionSpy = vi.spyOn(globalThis, 'Function');

    const schema = z.object({ name: z.string() });
    expect(schema.parse({ name: '検証' })).toEqual({ name: '検証' });

    expect(functionSpy).not.toHaveBeenCalled();
  });

  it('画面の入口（main.tsx）が他のモジュールより先に本設定を読み込む', () => {
    // npm はスクリプトを frontend パッケージルートで実行するため cwd 基準で解決する
    const source = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const imports = source.match(/^import .+$/gm) ?? [];

    expect(imports[0]).toBe("import './utils/zod-csp-config';");
  });
});
