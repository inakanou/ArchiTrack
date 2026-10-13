/**
 * @fileoverview `check:steering-command-annotations` の代償を履歴で測る（タスク 115.288）
 *
 * ## なぜ在るか
 *
 * タスク 115.273 / 115.276 は「関門を足すと、無関係な変更でも押下が止まる」代償を**率で
 * 測ってから**採否を決めた（前者は履歴 56 件中 51 件＝91.1%、後者は 500 版中 373 件＝74.6%）。
 * 115.288 も同じ作法に従う。**「代償が小さい」を測らずに書かないため**の道具である。
 *
 * ## 何を測るか
 *
 * `git rev-list` が返す直近 N 版のそれぞれについて、**その版の作業ツリーの内容**へ
 * `scripts/check-steering-command-annotations.ts` の `run` を当て、指摘が 1 件でもあれば
 * 「その版で押下が止まった」と数える。判定は本体を差し込み口ごと呼ぶため、**判定の実装を
 * 写し取って二重に持つことはしない**（タスク 115.200 / 115.286 の教訓）。
 *
 * 履歴から読むもの:
 *   - `.kiro/steering/*.md`      その版の steering 文書（`git ls-tree` + `git show`）
 *   - `package.json` 三件         その版の npm スクリプト一覧
 *   - `vitest*.config.ts`        その版の選択範囲の構成（blob ごとに一度だけ読み込む）
 *   - `<pkg>/src` のファイル一覧   `git ls-tree -r --name-only`
 *
 * ## 構成の読み込みについて（なぜ一時ディレクトリをパッケージの中へ置くか）
 *
 * vitest の構成は `vitest/config` を取り込む。その依存は `backend/node_modules` と
 * `frontend/node_modules` にしか無く、ルートには無い（2026-09-05 に実測）。したがって
 * 履歴の構成を書き出す先は**当該パッケージの配下**でなければ解決が届かない。書き出しは
 * `finally` で必ず消す。
 *
 * 使用方法:
 *   npx tsx scripts/survey-steering-command-annotation-drift.ts [--limit N]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  PACKAGE_SCOPES,
  REPOSITORY_ROOT,
  STEERING_DIRECTORY,
  extractVitestInvocation,
  loadVitestConfig,
  run,
  selectFiles,
  type ScopeName,
  type SelectionResolver,
} from './check-steering-command-annotations.js';

const SURVEY_DIRECTORY = '.steering-command-survey-tmp';

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function gitOrUndefined(args: string[]): string | undefined {
  try {
    return git(args);
  } catch {
    return undefined;
  }
}

interface TreeEntry {
  blob: string;
  file: string;
}

function listTree(rev: string, prefix: string): TreeEntry[] {
  const raw = gitOrUndefined(['ls-tree', '-r', rev, '--', prefix]);
  if (!raw) return [];
  const entries: TreeEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [meta, file] = line.split('\t');
    const parts = (meta ?? '').split(/\s+/);
    const blob = parts[2] ?? '';
    if (blob && file) entries.push({ blob, file });
  }
  return entries;
}

const blobCache = new Map<string, string>();
function readBlob(blob: string): string {
  const cached = blobCache.get(blob);
  if (cached !== undefined) return cached;
  const content = gitOrUndefined(['cat-file', '-p', blob]) ?? '';
  blobCache.set(blob, content);
  return content;
}

/** 構成の blob ごとに一度だけ読み込む。`include` / `exclude` は const 参照を含むため実行が要る */
const configCache = new Map<string, { include: string[]; exclude: string[] } | undefined>();
let workspaceSerial = 0;

async function loadHistoricalConfig(
  scope: ScopeName,
  blob: string
): Promise<{ include: string[]; exclude: string[] } | undefined> {
  const key = `${scope}:${blob}`;
  if (configCache.has(key)) return configCache.get(key);
  const packageDirectory = path.join(REPOSITORY_ROOT, PACKAGE_SCOPES[scope]);
  const workspace = path.join(packageDirectory, SURVEY_DIRECTORY, String(workspaceSerial));
  workspaceSerial += 1;
  let loaded: { include: string[]; exclude: string[] } | undefined;
  try {
    mkdirSync(workspace, { recursive: true });
    const file = path.join(workspace, `vitest.${workspaceSerial}.config.ts`);
    writeFileSync(file, readBlob(blob), 'utf8');
    loaded = await loadVitestConfig(file);
  } catch {
    loaded = undefined;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  configCache.set(key, loaded);
  return loaded;
}

function parseScripts(json: string): Record<string, string> {
  try {
    return (JSON.parse(json) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * 現在の steering 文書。`--fixed-steering` のときに使う。
 *
 * **二つの問いを分けるためである。**「その版の steering は当時の実体と食い違っていたか」
 * （既定。関門が働いていることの確認であって代償ではない）と、「**今の** steering を据えた
 * まま、無関係な変更が押下を止めるか」（`--fixed-steering`。115.273 / 115.276 が測った
 * 代償と同じ問い）は別の量である。
 */
function currentSteering(): Map<string, string> {
  const bodies = new Map<string, string>();
  const directory = path.join(REPOSITORY_ROOT, STEERING_DIRECTORY);
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.md')) continue;
    bodies.set(`${STEERING_DIRECTORY}/${entry}`, readFileSync(path.join(directory, entry), 'utf8'));
  }
  return bodies;
}

async function surveyRevision(
  rev: string,
  fixedSteering?: Map<string, string>
): Promise<{ findings: number; kinds: string[] }> {
  const steering = listTree(rev, STEERING_DIRECTORY).filter((entry) => entry.file.endsWith('.md'));
  const bodies = fixedSteering ?? new Map<string, string>();
  if (!fixedSteering) {
    for (const entry of steering) bodies.set(entry.file, readBlob(entry.blob));
  }

  const scripts = {
    root: {} as Record<string, string>,
    backend: {} as Record<string, string>,
    frontend: {} as Record<string, string>,
  };
  const configsByScope = new Map<
    ScopeName,
    Map<string, { include: string[]; exclude: string[] }>
  >();
  const filesByScope = new Map<ScopeName, string[]>();

  for (const scope of Object.keys(PACKAGE_SCOPES) as ScopeName[]) {
    const directory = PACKAGE_SCOPES[scope];
    const manifest = directory === '.' ? 'package.json' : `${directory}/package.json`;
    const manifestEntry = listTree(rev, manifest)[0];
    if (manifestEntry) scripts[scope] = parseScripts(readBlob(manifestEntry.blob));

    const configs = new Map<string, { include: string[]; exclude: string[] }>();
    const configPrefix = directory === '.' ? '' : `${directory}/`;
    for (const entry of listTree(rev, `${configPrefix}vitest`)) {
      const base = entry.file.slice(configPrefix.length);
      if (!/^vitest(\..+)?\.config\.(ts|js|mts|mjs)$/.test(base)) continue;
      const loaded = await loadHistoricalConfig(scope, entry.blob);
      if (loaded) configs.set(base, loaded);
    }
    configsByScope.set(scope, configs);

    const srcPrefix = directory === '.' ? 'src/' : `${directory}/src/`;
    filesByScope.set(
      scope,
      listTree(rev, srcPrefix).map((entry) => entry.file.slice(configPrefix.length))
    );
  }

  const resolveSelection: SelectionResolver = async (scope, command) => {
    const invocation = extractVitestInvocation(command);
    if (!invocation) return undefined;
    const configs = configsByScope.get(scope);
    const files = filesByScope.get(scope) ?? [];
    if (!configs || configs.size === 0 || files.length === 0) return undefined;
    const config = configs.get(invocation.configFile ?? 'vitest.config.ts');
    if (!config) return undefined;
    const selected = selectFiles(files, {
      include: config.include,
      exclude: config.exclude,
      filters: invocation.filters,
    });
    const union = new Set<string>();
    for (const other of configs.values()) {
      for (const file of selectFiles(files, {
        include: other.include,
        exclude: other.exclude,
        filters: [],
      })) {
        union.add(file);
      }
    }
    return { selected, exhaustive: [...union].sort() };
  };

  const result = await run({
    targets: [...bodies.keys()].sort(),
    readDocument: (relative) => bodies.get(relative),
    scripts,
    resolveSelection,
  });
  return {
    findings: result.findings.length,
    kinds: [...new Set(result.findings.map((f) => f.kind))],
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitAt = args.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(args[limitAt + 1] ?? '500') : 500;
  const fixedSteering = args.includes('--fixed-steering') ? currentSteering() : undefined;

  const revisions = git(['rev-list', `-${limit}`, 'HEAD'])
    .split('\n')
    .filter((line) => line.trim().length > 0);

  console.log(
    fixedSteering
      ? '問い: 今の steering を据えたまま、履歴の実体側（package.json / vitest 構成 / src の一覧）を当てると押下が止まるか'
      : '..問い: その版の steering は当時の実体と食い違っていたか'
  );

  let stopped = 0;
  const kindTally = new Map<string, number>();
  for (const rev of revisions) {
    const outcome = await surveyRevision(rev, fixedSteering);
    if (outcome.findings > 0) {
      stopped += 1;
      for (const kind of outcome.kinds) kindTally.set(kind, (kindTally.get(kind) ?? 0) + 1);
    }
  }

  const percentage = revisions.length === 0 ? 0 : (stopped / revisions.length) * 100;
  console.log(
    `走査した版 ${revisions.length} 件のうち、本検査が押下を止める版は ${stopped} 件` +
      `（${percentage.toFixed(1)}%）`
  );
  for (const [kind, count] of [...kindTally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind}: ${count} 版`);
  }
}

void main().finally(() => {
  for (const directory of Object.values(PACKAGE_SCOPES)) {
    rmSync(path.join(REPOSITORY_ROOT, directory, SURVEY_DIRECTORY), {
      recursive: true,
      force: true,
    });
  }
});
