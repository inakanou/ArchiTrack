/**
 * @fileoverview 静的 import グラフの走査（テスト用ユーティリティ）
 *
 * バンドラは**静的 import** を辿って初期チャンクへモジュールを畳み込む。
 * したがって「初期表示で読み込まれない」という性質は、`frontend/src` の
 * ソースを実際に読んで静的 import の辺だけを辿れば機械的に確かめられる。
 *
 * 本ファイルはその走査だけを提供する（アサーションは呼び出し側のテストが持つ）。
 * `__tests__` 配下に置くことで、
 * - vitest の `include`（`src/**\/*.{test,spec}.{ts,tsx}`）に拾われずテストとして実行されない
 * - {@link isTestFile} が真を返し、「本番モジュールが◯◯を静的 import していないか」
 *   という走査の対象からも外れる
 *
 * @module services/export/__tests__/staticImportGraph
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** `frontend/src` の絶対パス */
export const SRC_ROOT = path.resolve(__dirname, '../../..');

/**
 * `import ... from '...'` / `export ... from '...'` / `import '...'`
 *
 * `import type ... from '...'` はビルド時に消えるため辺として数えない。
 * 動的 `import('...')` は行頭の `import` にマッチしないため辺にならない。
 */
const STATIC_IMPORT_PATTERNS = [
  /^[ \t]*(?:import|export)[ \t]+(?!type[ \t])[^;]*?[ \t]from[ \t]*['"]([^'"]+)['"]/gm,
  /^[ \t]*import[ \t]*['"]([^'"]+)['"]/gm,
];

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/**
 * パスエイリアス `@` の指す先（`vite.config.ts` の `resolve.alias` で `@` → `/src`）
 *
 * 相対指定子だけを解決すると `@/services/export/...` 形式の import が辺として
 * 数えられず、「到達しない」の検査が無条件に真になりうるため**エイリアスも解決する**。
 * npm パッケージ（`jspdf` など）は `frontend/src` の外なので辺にならない。
 */
const PATH_ALIAS_PREFIX = '@/';

/** 相対指定子とパスエイリアスをファイルへ解決する（`.ts` / `.tsx` / ディレクトリの `index`） */
export function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const isAlias = specifier.startsWith(PATH_ALIAS_PREFIX);
  if (!specifier.startsWith('.') && !isAlias) {
    return null;
  }
  const base = isAlias
    ? path.join(SRC_ROOT, specifier.slice(PATH_ALIAS_PREFIX.length))
    : path.resolve(path.dirname(fromFile), specifier);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base.endsWith('.ts') || base.endsWith('.tsx') ? base : `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/** そのファイルが静的 import しているファイル（`frontend/src` 内に解決できたものだけ） */
export function staticImportsOf(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  const resolved: string[] = [];
  for (const pattern of STATIC_IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      const target = resolveSpecifier(file, match[1]!);
      if (target !== null) {
        resolved.push(target);
      }
      match = pattern.exec(source);
    }
  }
  return resolved;
}

/** 静的 import だけを辿って到達できるファイルの集合（entry を含む） */
export function staticReachableFrom(entry: string): ReadonlySet<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of staticImportsOf(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** ディレクトリ配下の `.ts` / `.tsx` を再帰的に列挙する */
export function allSourceFiles(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...allSourceFiles(full));
      continue;
    }
    if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      found.push(full);
    }
  }
  return found;
}

/** テスト・ストーリー・テスト補助のファイルか（本番バンドルに載らないもの） */
export const isTestFile = (file: string): boolean =>
  file.includes('.test.') || file.includes('.stories.') || file.includes('__tests__');
