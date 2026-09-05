/**
 * @fileoverview steering が述べる**検証の実行方法**と実挙動の一致の検査（タスク 115.288）
 *
 * ## なぜ在るか
 *
 * `.kiro/steering/` は毎セッション読み込まれる。そこに書かれた「この検証はこう回す」という
 * 註・散文が偽になっても、既存の関門は一つも鳴らない。タスク 115.243 がそれを変異で実証し、
 * タスク 115.288 が本検査を新設した。
 *
 * 起票の変異を本検査の着手時点（コミット `511000a7`）で当て直した実測は次のとおりである
 * （2026-09-05 にリポジトリルートで実測。復元は事前複製からの `cp`、`git hash-object` の
 * 一致で確認した）。
 *
 *   変異 (a) `.kiro/steering/tech.md` の註つき 2 行を旧来の偽の形
 *            `npm --prefix backend run test        # 全テスト実行` へ戻す
 *            → `check:steering-refs` / `:steering-idents` / `:steering-test-tree` /
 *              `:steering-dir-counts` / `:design-measurement-freshness` の**五つとも EXIT=0**
 *   変異 (b) `.kiro/steering/structure.md` の「件数は次の出力で数える」の内訳を
 *            コミット `f8b97dd` の形へ戻す → **同じ五つとも EXIT=0**
 *
 * ## 何を検査するか（三つの判定。起票が挙げた (i)(ii)(iii) に対応する）
 *
 *   (i)   `missing-script`      steering が名指す npm スクリプトが当該 `package.json` に実在する
 *   (ii)  `overclaimed-scope`   「全件」を主張する註つきコマンドの選択範囲が実際には全件でない
 *         `underclaimed-scope`  「〜だけ／〜のみ」を主張する註つきコマンドが実際には全件である
 *   (iii) `divergent-executor`  同じ資材を名指す起動コマンドが文書間で違う実行器を名乗る
 *
 * ## 何を検査しないか（境界。反例を示せば偽になる命題として挙げる）
 *
 * **註の主張と実挙動の一致は、一般には機械判定できない。** 本検査が見るのは上の三つだけで
 * あり、次はいずれも素通りする。
 *
 *   - 選択範囲を**語で主張しない**記述（起票の変異 (b) がこの型である。「件数は X / Y の
 *     出力で数える」は全件の語を持たないため (ii) の網に掛からない）。本検査の着手時点で
 *     変異 (b) を当て直しても本検査は EXIT=0 である（2026-09-05 に実測）
 *   - vitest の実行へ還元できないスクリプト（`test:all` は `sh scripts/run-all-tests.sh` で
 *     あり、選択範囲を構成から導けない。`selectionForScript` が `undefined` を返して除外する）
 *   - `--prefix` も `cd <dir> &&` も伴わない散文中のコマンド。どの `package.json` を指すか
 *     決まらないため、三つの `package.json` のいずれかに在れば合格とする。**その結果、
 *     取り違えた作業ディレクトリを名乗る記述は捕らえられない**
 *   - steering 以外の文書（`docs/` 配下、`.claude/` 配下）。タスク 115.287 のレビューが
 *     `docs/development/testing.md` ほかに残ると記録した連鎖は本検査の走査範囲の外である
 *
 * ## なぜ「鮮度の宣言」ではなく独立の関門なのか（115.273 / 115.276 と作法を分けた理由）
 *
 * タスク 115.273 は十二件の設計文書を走査する値を、115.276 は steering の実測値を、いずれも
 * `scripts/design-measurements.json` の宣言へ載せる形で扱った。**その二つが扱うのは測定値の
 * 鮮度であり、代償は「無関係な変更でも測り直しのために押下が止まる」ことであった**
 * （115.273 は履歴 56 件中 51 件＝91.1%、115.276 は 500 版中 373 件＝74.6% を実測して却下・
 * 版固定へ回している）。
 *
 * **本検査が見るのは値ではなく整合である。** 記述と実体が食い違ったときだけ赤くなるため、
 * 無関係な変更で押下が止まらない。実測は本ファイル冒頭の「代償の実測」を見よ。
 *
 * ## 代償の実測（タスク 115.288、コミット `511000a7` の作業ツリーから、2026-09-05 に実測）
 *
 * 再現は `npx tsx scripts/survey-steering-command-annotation-drift.ts` である
 * （`--limit N` で版の数、`--fixed-steering` で問いを切り替える）。
 *
 *   1. **是正の必要性**: 直近 500 版のそれぞれについて**その版の** steering と実体を
 *      突き合わせると、**500 版すべて（100.0%）で指摘が出る**（`missing-script` が 500 版、
 *      `divergent-executor` が 110 版）。本タスクが是正した食い違いは走査した窓の全域で
 *      立っていた。
 *   2. **前向きの代償**: 本検査が読むのは `.kiro/steering/*.md`・`package.json` 三件・
 *      `vitest*.config.ts` だけである。直近 500 版のうち**そのいずれにも触れていない版は
 *      92 件（18.4%）**であり、その版は判定を動かしようがない
 *      （`git rev-list -500 HEAD -- <上の入力>` の出力が 408）。残る 408 版でも、本検査は
 *      **値の測り直しを要求しない**——記述と実体が食い違ったときだけ赤くなる。
 *   3. **後ろ向きの見かけの率に注意**: `--fixed-steering`（今の steering を据えて履歴の実体側
 *      を当てる）は 500 版中 487 版（97.4%）を赤にするが、**これは前向きの代償ではない**。
 *      内訳を取ると、赤の原因は今の steering が名指す関門（`check:steering-dir-counts` /
 *      `check:cf-evidence` / `check:dead-script-env` ほか）が当時まだ存在しなかったことに尽き、
 *      **着手時点の版 `511000a7` では実在しないスクリプトは 0 件である**（同日に実測）。
 *
 * 使用方法:
 *   npx tsx scripts/check-steering-command-annotations.ts [--verbose] [--json]
 *   npm run check:steering-command-annotations
 */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);

/** リポジトリルート（本ファイルは scripts/ 直下に置かれる） */
export const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');

/** 走査対象の steering ディレクトリ */
export const STEERING_DIRECTORY = '.kiro/steering';

/** `npm --prefix <name>` が取りうる作業対象と、その `package.json` の位置 */
export const PACKAGE_SCOPES = {
  root: '.',
  backend: 'backend',
  frontend: 'frontend',
} as const;

export type ScopeName = keyof typeof PACKAGE_SCOPES;

/** steering が名指す npm スクリプトの参照 */
export interface ScriptReference {
  /** `--prefix` か直前の `cd <dir> &&` から決まる作業対象。決まらなければ null */
  scope: ScopeName | null;
  /** スクリプト名 */
  name: string;
  /** 行内の位置（註と参照を結びつけるために使う） */
  column: number;
  /** 掛かった綴りそのもの */
  raw: string;
}

/** 註が主張する選択範囲 */
export type ScopeClaim = 'exhaustive' | 'restricted';

export interface ClaimMention {
  claim: ScopeClaim;
  word: string;
  column: number;
}

/**
 * 「全件」を主張する語。**「全テスト」を含めるのは起票の変異 (a) がこの語だからである**
 * （旧来の偽の註は `# 全テスト実行` であった）。
 */
export const EXHAUSTIVE_CLAIM_WORDS = ['全件', '全テスト', 'すべてのテスト'] as const;

/** 「一部だけ」を主張する語 */
export const RESTRICTED_CLAIM_WORDS = [
  'だけを回す',
  'だけを実行',
  'のみを回す',
  'のみを実行',
] as const;

/**
 * 実測日（規約 (a)。`YYYY-MM-DD`）。
 *
 * **同じ行に実測日を持つ記述は (ii) の照合から外す。** steering の更新履歴
 * （`_2026-09-02（Steering Sync: …）_` の形）は「当時この註は偽だった」という**過去について
 * の記録**であり、現況の主張ではない。外さないと、偽を是正した記録そのものが告発される
 * ——実際、外す前に本検査を当てると `.kiro/steering/structure.md:11` と
 * `.kiro/steering/tech.md:11` の更新履歴が 3 件挙がった（コミット `511000a7`、2026-09-05 に
 * リポジトリルートで実測）。区分は `check:steering-dir-counts` の
 * `MEASUREMENT_DATE_PATTERN` と同じ規約 (a) に揃えてある。
 *
 * **限界**: 偽の註へ実測日を書き足せば本検査から外れる。逃げ道であることを明記する
 * （タスク 115.167 のレビューが定めた「逐語複製にも抜け道があり、それは明記すべき限界である」）。
 */
export const MEASUREMENT_DATE_PATTERN = /20[0-9]{2}-[0-9]{2}-[0-9]{2}/;

/**
 * npm スクリプトの参照。`--prefix` は任意、直前に `cd <dir> &&` が来る形も拾う。
 *
 * **末尾が `:` か `.` の綴りは採らない。** `grep -oE 'npm run check:[a-z0-9-]+'` のような
 * 正規表現の断片が掛かるためであり、実在する npm スクリプト名は `:` や `.` で終わらない。
 */
const SCRIPT_REFERENCE_PATTERN =
  /npm(?:\s+--prefix\s+(backend|frontend))?\s+run\s+([A-Za-z0-9:_.-]+)/g;

/** 同じ行の手前にある `cd <dir> &&`。作業対象を決める第二の手掛かり */
const CD_SCOPE_PATTERN = /cd\s+(backend|frontend)\s*&&/g;

export function parseScriptReferences(line: string): ScriptReference[] {
  const cdScopes: { column: number; scope: ScopeName }[] = [];
  for (const match of line.matchAll(CD_SCOPE_PATTERN)) {
    cdScopes.push({ column: match.index ?? 0, scope: match[1] as ScopeName });
  }

  const references: ScriptReference[] = [];
  for (const match of line.matchAll(SCRIPT_REFERENCE_PATTERN)) {
    const column = match.index ?? 0;
    const name = match[2] ?? '';
    if (name.endsWith(':') || name.endsWith('.')) continue;
    let scope: ScopeName | null = (match[1] as ScopeName | undefined) ?? null;
    if (scope === null) {
      const preceding = cdScopes.filter((entry) => entry.column < column).pop();
      if (preceding) scope = preceding.scope;
    }
    references.push({ scope, name, column, raw: match[0] });
  }
  return references;
}

export function parseScopeClaims(line: string): ClaimMention[] {
  const mentions: ClaimMention[] = [];
  for (const word of EXHAUSTIVE_CLAIM_WORDS) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(word, from);
      if (at < 0) break;
      mentions.push({ claim: 'exhaustive', word, column: at });
      from = at + word.length;
    }
  }
  for (const word of RESTRICTED_CLAIM_WORDS) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(word, from);
      if (at < 0) break;
      mentions.push({ claim: 'restricted', word, column: at });
      from = at + word.length;
    }
  }
  return mentions.sort((a, b) => a.column - b.column);
}

/**
 * 主張の語を**行内で最も近い**参照へ結びつける。
 *
 * 一行に複数の参照が並ぶ記述が実在するため（`product.md` の「件数は backend の既定の実行が
 * `npm --prefix backend run test`、…、frontend の全件が `npm --prefix frontend run test` の
 * 出力で数える」）、行単位で結びつけると無関係な参照が告発される。距離で結ぶとこの行は
 * 正しく frontend 側へ掛かる。
 */
export function associateClaim(
  references: readonly ScriptReference[],
  mention: ClaimMention
): ScriptReference | undefined {
  let best: ScriptReference | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const reference of references) {
    const distance = Math.abs(reference.column - mention.column);
    if (distance < bestDistance) {
      best = reference;
      bestDistance = distance;
    }
  }
  return best;
}

/** 起動コマンド（実行器 + リポジトリ相対の資材）の参照 */
export interface ExecutorReference {
  executor: string;
  target: string;
  column: number;
}

const EXECUTOR_PATTERN =
  /\b(npx\s+[a-z0-9@._-]+|node|tsx|ts-node|sh|bash)\s+((?:e2e|scripts|backend|frontend)\/[A-Za-z0-9._/-]+\.(?:ts|js|mjs|cjs|sh))/g;

export function parseExecutorReferences(line: string): ExecutorReference[] {
  const references: ExecutorReference[] = [];
  for (const match of line.matchAll(EXECUTOR_PATTERN)) {
    references.push({
      executor: (match[1] ?? '').replace(/\s+/g, ' ').trim(),
      target: match[2] ?? '',
      column: match.index ?? 0,
    });
  }
  return references;
}

// ---------------------------------------------------------------------------
// vitest の構成から選択範囲を導く（起票の材料 (ii)）
// ---------------------------------------------------------------------------

/** `**` / `*` / `?` / `{a,b}` だけを解する最小の glob。vitest 構成が使う形はこれで足りる */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i] ?? '';
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` は「0 個以上のディレクトリ」を表す
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    if (ch === '{') {
      const close = glob.indexOf('}', i);
      if (close > i) {
        const options = glob
          .slice(i + 1, close)
          .split(',')
          .map((option) => option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        out += `(?:${options.join('|')})`;
        i = close;
        continue;
      }
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * 同じディレクトリの要素を「リンクでないものが先、同じ種別では名前の昇順」に並べる
 * （タスク 115.296。`scripts/check-dead-script-env.ts` の同名の関数と同じ規則。両者は
 * 走査器ごとに閉じており、依存は持たせていない）。
 *
 * 訪問済み集合と対にして使う。集合だけでは、同じ実体へ二つの経路が在るとき代表が
 * `readdirSync` の返す順（環境依存）で入れ替わる。
 */
function orderRealEntriesFirst(directory: string, entries: readonly string[]): string[] {
  const isLink = new Map<string, boolean>();
  for (const entry of entries) {
    try {
      isLink.set(entry, lstatSync(path.join(directory, entry)).isSymbolicLink());
    } catch {
      isLink.set(entry, false);
    }
  }
  return [...entries].sort((left, right) => {
    const leftLink = isLink.get(left) === true ? 1 : 0;
    const rightLink = isLink.get(right) === true ? 1 : 0;
    if (leftLink !== rightLink) return leftLink - rightLink;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * パッケージ配下の全ファイルをリポジトリ相対ではなくパッケージ相対で列挙する。
 *
 * **実体（`realpath`）の訪問済み集合を持つ**（タスク 115.296。同タスクが
 * `scripts/check-dead-script-env.ts` の `collectCorpusFiles` で是正したのと同型の走査器である）。
 * 本関数は `statSync` でリンクを追うため、集合が無いと (a) 同じ実体を二度並べ、
 * (b) 循環するリンクに当たると無限降下する。
 *
 * **現況では挙動は変わらない**（2026-09-05、コミット `7267c757` の作業ツリーで実測）。
 * 走査根は `<package>/src` であり、`find backend/src frontend/src -type l | wc -l` は 0 を返す。
 * すなわち走査範囲の中にリンクは一本も無く、是正の前後で本検査の出力は逐語で一致する。
 * **入れたのは現況の是正ではなく構造上の保証である**——走査根 `.` の直下には
 * `src -> backend/src` と `prisma -> backend/prisma` が実在し、リンクが増えないという保証は無い。
 *
 * **限界**: 訪問済み集合は 1 回の呼び出しの中だけで持つ（スコープごとの呼び出しは独立）。
 * `realpath` が解決できない要素は列挙から落ちる（取りこぼす向き）。
 */
export function listFiles(
  directory: string,
  base = directory,
  visited: Set<string> = new Set()
): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of orderRealEntriesFirst(directory, readdirSync(directory))) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const absolute = path.join(directory, entry);
    let stats: ReturnType<typeof statSync>;
    let real: string;
    try {
      stats = statSync(absolute);
      real = realpathSync(absolute);
    } catch {
      continue;
    }
    if (visited.has(real)) continue;
    visited.add(real);
    if (stats.isDirectory()) {
      found.push(...listFiles(absolute, base, visited));
    } else {
      found.push(path.relative(base, absolute).split(path.sep).join('/'));
    }
  }
  return found;
}

export interface VitestSelectionInput {
  include: readonly string[];
  exclude: readonly string[];
  /** vitest の位置引数（パスの部分一致で絞る） */
  filters: readonly string[];
}

/** 構成と位置引数から、選ばれるファイルの集合を求める */
export function selectFiles(files: readonly string[], input: VitestSelectionInput): string[] {
  const includes = input.include.map(globToRegExp);
  const excludes = input.exclude.map(globToRegExp);
  return files
    .filter((file) => includes.some((pattern) => pattern.test(file)))
    .filter((file) => !excludes.some((pattern) => pattern.test(file)))
    .filter((file) => input.filters.length === 0 || input.filters.some((f) => file.includes(f)))
    .sort();
}

/** `rm -rf coverage && … && vitest run --coverage src/x` から vitest の区間を取り出す */
export function extractVitestInvocation(
  command: string
): { configFile?: string; filters: string[] } | undefined {
  const segment = command
    .split('&&')
    .map((part) => part.trim())
    .find((part) => /(^|\s|\/)vitest(\s|$)/.test(part));
  if (!segment) return undefined;
  const tokens = segment.split(/\s+/);
  const vitestAt = tokens.findIndex((token) => token === 'vitest' || token.endsWith('/vitest'));
  if (vitestAt < 0) return undefined;
  let configFile: string | undefined;
  const filters: string[] = [];
  for (let i = vitestAt + 1; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (token === 'run' || token === 'watch') continue;
    if (token === '--config') {
      configFile = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--config=')) {
      configFile = token.slice('--config='.length);
      continue;
    }
    if (token.startsWith('-')) continue;
    filters.push(token);
  }
  return { configFile, filters };
}

/** パッケージが持つ vitest 構成ファイル（`vitest*.config.ts`）を列挙する */
export function listVitestConfigFiles(packageDirectory: string): string[] {
  if (!existsSync(packageDirectory)) return [];
  return readdirSync(packageDirectory)
    .filter((entry) => /^vitest(\..+)?\.config\.(ts|js|mts|mjs)$/.test(entry))
    .sort();
}

export async function loadVitestConfig(
  absoluteConfigPath: string
): Promise<{ include: string[]; exclude: string[] } | undefined> {
  try {
    const loaded = (await import(pathToFileURL(absoluteConfigPath).href)) as {
      default?: unknown;
    };
    const raw = loaded.default;
    const resolved =
      typeof raw === 'function'
        ? (raw as (env: unknown) => unknown)({ mode: 'test', command: 'serve' })
        : raw;
    const test = (resolved as { test?: { include?: string[]; exclude?: string[] } } | undefined)
      ?.test;
    if (!test?.include) return undefined;
    return { include: test.include, exclude: test.exclude ?? [] };
  } catch {
    return undefined;
  }
}

export interface ScopeResolution {
  /** そのスクリプトが選ぶファイル */
  selected: string[];
  /** そのパッケージの検証ファイル全体（全構成の和集合） */
  exhaustive: string[];
}

export type SelectionResolver = (
  scope: ScopeName,
  scriptCommand: string
) => Promise<ScopeResolution | undefined>;

/** 実ファイルを読んで選択範囲を導く既定の解決器 */
export function createFileSystemResolver(root: string): SelectionResolver {
  const cache = new Map<
    string,
    { files: string[]; configs: Map<string, { include: string[]; exclude: string[] }> }
  >();

  async function loadScope(scope: ScopeName) {
    const cached = cache.get(scope);
    if (cached) return cached;
    const packageDirectory = path.join(root, PACKAGE_SCOPES[scope]);
    const files = listFiles(path.join(packageDirectory, 'src'), packageDirectory);
    const configs = new Map<string, { include: string[]; exclude: string[] }>();
    for (const configFile of listVitestConfigFiles(packageDirectory)) {
      const loaded = await loadVitestConfig(path.join(packageDirectory, configFile));
      if (loaded) configs.set(configFile, loaded);
    }
    const entry = { files, configs };
    cache.set(scope, entry);
    return entry;
  }

  return async (scope, scriptCommand) => {
    const invocation = extractVitestInvocation(scriptCommand);
    if (!invocation) return undefined;
    const { files, configs } = await loadScope(scope);
    if (configs.size === 0 || files.length === 0) return undefined;
    const configFile = invocation.configFile ?? 'vitest.config.ts';
    const config = configs.get(configFile);
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
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------

export type FindingKind =
  'missing-script' | 'overclaimed-scope' | 'underclaimed-scope' | 'divergent-executor';

export interface Finding {
  kind: FindingKind;
  file: string;
  line: number;
  subject: string;
  detail: string;
  snippet: string;
}

export interface RunResult {
  findings: Finding[];
  scannedFiles: string[];
  scannedLines: number;
  /** 実在を確かめた npm スクリプト参照の数 */
  checkedReferences: number;
  /** 選択範囲まで突き合わせた註の数 */
  checkedScopeClaims: number;
  /** 実測日を持つため (ii) の照合から外した行の数（規約 (a)） */
  exemptedDatedClaims: number;
  /** 実行器の一致を見た資材の数 */
  checkedExecutorTargets: number;
  detectorPositive: boolean;
}

/** 判定器が恒偽へ退化していないことを確かめる陽性の対照（起票の変異 (a) の綴り） */
export const DETECTOR_POSITIVE_CONTROL = 'npm --prefix backend run test        # 全テスト実行';

export interface RunOptions {
  root?: string;
  /** 走査する steering 文書（既定は `.kiro/steering/*.md` の全件） */
  targets?: readonly string[];
  /** 選択範囲の解決器。自己検査は合成の解決器を差す */
  resolveSelection?: SelectionResolver;
  /**
   * 文書の本文を返す差し込み口。既定は作業ツリーから読む。
   * `scripts/survey-steering-command-annotation-drift.ts` が履歴の blob を差して、
   * **同じ判定の実装のまま**過去の版を測る（判定を写して二重に持たないため）。
   */
  readDocument?: (relative: string) => string | undefined;
  /** npm スクリプトの一覧を差し込む口。既定は作業ツリーの `package.json` を読む */
  scripts?: Record<ScopeName, Record<string, string>>;
}

function listSteeringDocuments(root: string): string[] {
  const directory = path.join(root, STEERING_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => `${STEERING_DIRECTORY}/${entry}`);
}

function readScripts(root: string, scope: ScopeName): Record<string, string> {
  const manifest = path.join(root, PACKAGE_SCOPES[scope], 'package.json');
  if (!existsSync(manifest)) return {};
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

export async function run(options: RunOptions = {}): Promise<RunResult> {
  const root = options.root ?? REPOSITORY_ROOT;
  const targets = options.targets ?? listSteeringDocuments(root);
  const resolveSelection = options.resolveSelection ?? createFileSystemResolver(root);

  const scripts: Record<ScopeName, Record<string, string>> = options.scripts ?? {
    root: readScripts(root, 'root'),
    backend: readScripts(root, 'backend'),
    frontend: readScripts(root, 'frontend'),
  };
  const readDocument =
    options.readDocument ??
    ((relative: string) => {
      const absolute = path.join(root, relative);
      return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
    });

  const findings: Finding[] = [];
  const scannedFiles: string[] = [];
  let scannedLines = 0;
  let checkedReferences = 0;
  let checkedScopeClaims = 0;
  let exemptedDatedClaims = 0;

  const executorGroups = new Map<string, { executor: string; file: string; line: number }[]>();

  for (const relative of targets) {
    const content = readDocument(relative);
    if (content === undefined) continue;
    scannedFiles.push(relative);
    const lines = content.split('\n');

    for (const [index, raw] of lines.entries()) {
      scannedLines += 1;
      const lineNumber = index + 1;
      const snippet = raw.trim().slice(0, 160);
      const references = parseScriptReferences(raw);

      // (i) 名指した npm スクリプトの実在
      for (const reference of references) {
        checkedReferences += 1;
        const candidates: ScopeName[] =
          reference.scope === null ? ['root', 'backend', 'frontend'] : [reference.scope];
        const found = candidates.some((scope) => reference.name in scripts[scope]);
        if (found) continue;
        findings.push({
          kind: 'missing-script',
          file: relative,
          line: lineNumber,
          subject: reference.raw,
          detail:
            reference.scope === null
              ? 'この名前の npm スクリプトはルート・backend・frontend のいずれにも実在しません'
              : `${PACKAGE_SCOPES[reference.scope]}/package.json に この名前の npm スクリプトが実在しません`,
          snippet,
        });
      }

      // (ii) 「全件」「〜だけ」の主張と、構成から導いた選択範囲の突き合わせ
      const dated = MEASUREMENT_DATE_PATTERN.test(raw);
      if (dated && parseScopeClaims(raw).length > 0) exemptedDatedClaims += 1;
      for (const mention of dated ? [] : parseScopeClaims(raw)) {
        const reference = associateClaim(references, mention);
        if (!reference || reference.scope === null) continue;
        const command = scripts[reference.scope][reference.name];
        if (!command) continue;
        const resolution = await resolveSelection(reference.scope, command);
        if (!resolution) continue;
        checkedScopeClaims += 1;
        const isExhaustive =
          resolution.selected.length === resolution.exhaustive.length &&
          resolution.selected.every((file, at) => file === resolution.exhaustive[at]);
        if (mention.claim === 'exhaustive' && !isExhaustive) {
          findings.push({
            kind: 'overclaimed-scope',
            file: relative,
            line: lineNumber,
            subject: `${reference.raw}（「${mention.word}」）`,
            detail:
              `vitest の構成から導くと ${resolution.selected.length} 件を選びますが、` +
              `同じパッケージの検証ファイルは ${resolution.exhaustive.length} 件です`,
            snippet,
          });
        }
        if (mention.claim === 'restricted' && isExhaustive) {
          findings.push({
            kind: 'underclaimed-scope',
            file: relative,
            line: lineNumber,
            subject: `${reference.raw}（「${mention.word}」）`,
            detail:
              `一部だけを回すと述べていますが、vitest の構成から導くと ` +
              `${resolution.selected.length} 件で全件です`,
            snippet,
          });
        }
      }

      // (iii) 同じ資材を名指す起動コマンドの実行器の一致
      for (const executorReference of parseExecutorReferences(raw)) {
        const group = executorGroups.get(executorReference.target) ?? [];
        group.push({ executor: executorReference.executor, file: relative, line: lineNumber });
        executorGroups.set(executorReference.target, group);
      }
    }
  }

  let checkedExecutorTargets = 0;
  for (const [target, occurrences] of [...executorGroups].sort()) {
    if (occurrences.length < 2) continue;
    checkedExecutorTargets += 1;
    const distinct = [...new Set(occurrences.map((entry) => entry.executor))];
    if (distinct.length < 2) continue;
    const first = occurrences[0];
    findings.push({
      kind: 'divergent-executor',
      file: first?.file ?? '',
      line: first?.line ?? 0,
      subject: target,
      detail:
        `同じ資材の起動コマンドが ${distinct.length} 通りの実行器を名乗ります` +
        `（${distinct.join(' / ')}。出現 ${occurrences
          .map((entry) => `${entry.file}:${entry.line}`)
          .join(', ')}）`,
      snippet: '',
    });
  }

  const detectorPositive = (() => {
    const references = parseScriptReferences(DETECTOR_POSITIVE_CONTROL);
    const mentions = parseScopeClaims(DETECTOR_POSITIVE_CONTROL);
    return references.length === 1 && mentions.length === 1 && mentions[0]?.claim === 'exhaustive';
  })();

  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind)
  );

  return {
    findings,
    scannedFiles,
    scannedLines,
    checkedReferences,
    checkedScopeClaims,
    exemptedDatedClaims,
    checkedExecutorTargets,
    detectorPositive,
  };
}

/** 走査が空振りしていないかの判定。0 件の合格を合格にしない（AI運用7原則 第3原則） */
export function decideExit(result: RunResult): { ok: boolean; reason?: string } {
  if (result.scannedFiles.length === 0) {
    return { ok: false, reason: '走査対象の steering 文書が一件も見つかりませんでした' };
  }
  if (result.scannedLines === 0) {
    return { ok: false, reason: 'steering 文書は在るのに、照合した行が0行です' };
  }
  if (result.checkedReferences === 0) {
    return { ok: false, reason: 'steering から npm スクリプトの参照を一つも拾えませんでした' };
  }
  if (result.checkedScopeClaims === 0) {
    return {
      ok: false,
      reason: '選択範囲を突き合わせた註が 0 件です（構成の読み取りが壊れています）',
    };
  }
  if (result.checkedExecutorTargets === 0) {
    return {
      ok: false,
      reason: '複数箇所から名指される資材が 0 件です（実行器の照合が空回りしています）',
    };
  }
  if (!result.detectorPositive) {
    return { ok: false, reason: '判定器が陽性の対照を検出しませんでした' };
  }
  if (result.findings.length > 0) {
    return { ok: false, reason: `${result.findings.length} 件の食い違いがあります` };
  }
  return { ok: true };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = await run();
  if (json) console.log(JSON.stringify(result, null, 2));

  const decision = decideExit(result);
  if (decision.ok) {
    if (!json) {
      console.log(
        '✅ steering が述べる検証の実行方法は実挙動と一致します' +
          `（走査 ${result.scannedFiles.length} 文書 / ${result.scannedLines} 行、` +
          `スクリプト参照 ${result.checkedReferences} 件、` +
          `選択範囲の照合 ${result.checkedScopeClaims} 件、` +
          `実測日を持つため外した記録 ${result.exemptedDatedClaims} 件、` +
          `実行器を照合した資材 ${result.checkedExecutorTargets} 件）`
      );
    }
    return;
  }

  if (!json) {
    if (result.findings.length === 0) {
      console.error(`❌ ${decision.reason}`);
      console.error(`   走査対象: ${STEERING_DIRECTORY}/*.md`);
      console.error('   リポジトリルートで実行しているか確認してください');
      process.exit(1);
    }

    console.error('❌ steering が述べる検証の実行方法が実挙動と食い違います');
    console.error('');
    console.error('   steering は毎セッション読み込まれます。「この検証はこう回す」という');
    console.error(
      '   註が偽になると、後任がそのまま信じて誤った範囲を回します（タスク 115.243）。'
    );
    console.error('');
    for (const finding of result.findings) {
      console.error(`   ${finding.file}:${finding.line} [${finding.kind}] ${finding.subject}`);
      console.error(`        ${finding.detail}`);
      if (verbose && finding.snippet) console.error(`        ${finding.snippet}`);
    }
    console.error('');
    console.error(
      `   合計 ${result.findings.length} 件（走査 ${result.scannedLines} 行、` +
        `スクリプト参照 ${result.checkedReferences} 件、` +
        `選択範囲の照合 ${result.checkedScopeClaims} 件）`
    );
  }
  process.exit(1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === MODULE_PATH) {
  void main();
}
