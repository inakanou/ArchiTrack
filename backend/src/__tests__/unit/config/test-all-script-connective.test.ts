/**
 * @fileoverview `test:all` の連結が「両方を回して両方の結果を出す」ことの検査（タスク 115.245）
 *
 * ## なぜ在るか
 *
 * タスク 115.216 のレビューが検出した。`backend/package.json` の `test:all` は
 * 既定側と統合側を `&&` で繋いでいたため、**既定側が落ちると統合側は一度も走らなかった**。
 * 終了コードは正しく、CI も押下前の関門も `test:all` を使っていないため実害は無かったが、
 * steering は `test:all` を「両方を合わせた数を数える手段」として名指しており
 * （`.kiro/steering/structure.md` の「テスト区分の列挙の規約」、
 *  `.kiro/steering/tech.md` の「実行方法」、`.kiro/steering/product.md` の品質保証）、
 * 既定側が落ちた時点で統合側の数が出ない形は、その用途を果たさない。
 *
 * また `test:all` という名前は「全部を回す」と読めるのに回さない。これは 115.216 が
 * 是正した欠陥——「分離されていると読める名前がついているのに分離していない」——と同型の、
 * 名前と実態の食い違いである。よって**逐次実行して両方の結果を出す形へ改める**判断を採った。
 *
 * ## 何を固定するか
 *
 * 1. 既定側の結果に依らず、**統合側も必ず走る**こと。
 * 2. どちらかが落ちれば**終了コードが非零**であること（関門としての正しさを失わない）。
 * 3. 順序が「既定 → 統合」であること。
 *
 * ## どう測るか
 *
 * 文字列の一致（「`&&` を含まない」など）では、連結を別の形で壊す改変を捕まえられない。
 * ここでは `package.json` の `test:all` の**文字列をそのまま実行する**。実際の vitest を
 * 動かすと数分かかるため、`PATH` の先頭へ `vitest` の代役を置き、
 * 「どちらが呼ばれたか」と「終了コード」だけを観測する。
 *
 * 連結の実体は `backend/scripts/run-all-tests.sh` にあり、`test:all` はそれを呼ぶだけである。
 * 本検査は `test:all` の側から実行するため、呼び出しの経路ごと固定される（実体を移しても、
 * `test:all` から両方が走らなくなればここで落ちる）。実体を `package.json` に直接書かない
 * 理由は当該シェルスクリプトの冒頭に記した（`$?` を受ける変数が
 * `npm run check:dead-script-env` に死んだ環境変数と誤判定されるため）。
 *
 * npm は `script-shell` の設定が無い限りスクリプトを `/bin/sh` で実行する。本検査も
 * `sh -c` で実行して同じ経路を再現する。設定が持ち込まれると再現が崩れるため、
 * `.npmrc` が `script-shell` を宣言していないことを併せて固定する。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `backend/` の絶対パス（起動位置に依らないよう本ファイルからの相対で解決する） */
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
/** リポジトリの根 */
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

const TEST_ALL_SCRIPT: string = JSON.parse(
  readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf-8')
).scripts['test:all'];

let stubDir: string;
/** `vitest` の代役が呼び出しを追記する記録の置き場所 */
let callLogPath: string;

beforeAll(() => {
  stubDir = mkdtempSync(path.join(os.tmpdir(), 'architrack-test-all-'));
  callLogPath = path.join(stubDir, 'calls.log');

  // `vitest` の代役。引数を記録し、`--config` の有無で終了コードを出し分ける。
  const stub = [
    '#!/bin/sh',
    'echo "$*" >> "$STUB_CALL_LOG"',
    'case "$*" in',
    '  *--config*) exit "$STUB_EXIT_INTEGRATION" ;;',
    '  *) exit "$STUB_EXIT_DEFAULT" ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(path.join(stubDir, 'vitest'), stub, { mode: 0o755 });
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

interface RunResult {
  /** `test:all` 全体の終了コード */
  status: number | null;
  /** `vitest` の代役が呼ばれた際の引数（呼ばれた順） */
  calls: string[];
}

/** `test:all` の文字列を、代役を差し込んだ `PATH` の下で実行する */
function runTestAll(defaultExit: number, integrationExit: number): RunResult {
  rmSync(callLogPath, { force: true });

  const result = spawnSync('sh', ['-c', TEST_ALL_SCRIPT], {
    cwd: BACKEND_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ''}`,
      STUB_CALL_LOG: callLogPath,
      STUB_EXIT_DEFAULT: String(defaultExit),
      STUB_EXIT_INTEGRATION: String(integrationExit),
    },
  });

  const calls = existsSync(callLogPath)
    ? readFileSync(callLogPath, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
    : [];

  return { status: result.status, calls };
}

describe('test:all の連結（既定側の結果に依らず統合側も走る）', () => {
  it('代役が実際に使われている（実 vitest を動かしていない）', () => {
    const { calls } = runTestAll(0, 0);

    // 実 vitest が走ったならこの記録は空になる。空集合に対して自明に通る検査を避ける。
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toBe('run');
  });

  it('両方が通るとき、両方が既定 → 統合の順に走り、終了コードは 0 である', () => {
    const { status, calls } = runTestAll(0, 0);

    expect(calls).toEqual(['run', 'run --config vitest.integration.config.ts']);
    expect(status).toBe(0);
  });

  it('既定側だけが落ちても統合側は走り、終了コードは非零である', () => {
    const { status, calls } = runTestAll(1, 0);

    expect(calls).toEqual(['run', 'run --config vitest.integration.config.ts']);
    expect(status).not.toBe(0);
  });

  it('統合側だけが落ちるとき、両方が走り、終了コードは非零である', () => {
    const { status, calls } = runTestAll(0, 1);

    expect(calls).toEqual(['run', 'run --config vitest.integration.config.ts']);
    expect(status).not.toBe(0);
  });

  it('両方が落ちるとき、両方が走り、終了コードは非零である', () => {
    const { status, calls } = runTestAll(1, 1);

    expect(calls).toEqual(['run', 'run --config vitest.integration.config.ts']);
    expect(status).not.toBe(0);
  });
});

describe('本検査が再現している実行経路の前提', () => {
  it('`.npmrc` が script-shell を宣言していない（npm は /bin/sh でスクリプトを実行する）', () => {
    for (const npmrc of [path.join(REPO_ROOT, '.npmrc'), path.join(BACKEND_ROOT, '.npmrc')]) {
      if (!existsSync(npmrc)) continue;
      expect(readFileSync(npmrc, 'utf-8')).not.toMatch(/script-shell/);
    }
  });
});
