/**
 * @fileoverview `NARROWING` の枝の別形の走査と向きの判定（タスク 115.321）
 *
 * ## なぜ置くか
 *
 * `scripts/check-design-code-reference-format.selftest.ts` と
 * `scripts/check-design-reference-format.selftest.ts` の
 * `checkNarrowingEnumerationMatchesRegex` の注釈は、「見本を置いてなお塞いでいないこと」を
 * 三層（機械保証／人手走査／未走査の残余）で開示する。その二層目——人手走査——が引く件数を
 * 散文で宣言していたところ、**同じ記述から出発した二者が別の数に着地した**。
 * `.kiro/steering/development-discipline.md` が名指す失敗（「走査範囲を**コマンドで**宣言し…
 * 日本語で範囲を宣言してはならない」）の再演である。
 *
 * 本スクリプトはその走査を実体として置く。注釈は数値の脇でこのコマンドを名指し、
 * 第三者は同じコマンドを走らせて同じ数に着地する。
 * タスク 115.273 の `scripts/list-foreign-design-scan-drift.ts` や
 * タスク 115.290 の `scripts/survey-task-record-quotations.ts` と同じ位置づけの一覧であり、
 * 押下前の関門には結線しない（合否を出さない。数と一覧を印字するだけである）。
 *
 * ## 使い方
 *
 *     npx tsx scripts/survey-narrowing-branch-variants.ts [--list] [--dump] [--outside]
 *
 * リポジトリルートで走らせること（走査対象を相対パスで開く）。
 * `--list` は緩む向きの別形を全件、`--dump` は通り抜けた別形を TSV（走査名・枝・別形・向き）で
 * 印字する。件数だけの出口では一件ずつの読み直しを追試できない。
 * `--outside` は走査 C（族外）を追加で走らせる（数分かかるため既定では走らせない）。
 *
 * ## 何を数えるか
 *
 * 材料は走査対象のソースから読み直す（写しを置かない）。禁止の判定に使う `NARROWING` の
 * 正規表現リテラルと、枝ごとの意味の見本 `NARROWING_BRANCH_SPECIMENS` の二つである。
 *
 * 枝 `b` を正規化した操作名を `n` とする（正規化は {@link normalizeBranch}。`\b` `\(` `\.` と
 * 先頭の `new ` を落として前後の空白を捨てる）。走査は二つある。
 *
 * - **走査 A（接辞のみ）**: 土台は `n` ただ一つ。{@link AFFIX_TOKENS} の 4 語から作った
 *   長さ 0〜2 の並び（21 通り。{@link affixes}）を前後へ総当たりで付す。枝ごとに 21×21 通りを
 *   数え、元の枝と同一の字面だけを除く。
 * - **走査 B（任意の位置）**: 土台は `n` と `'new ' + n` の二つ。{@link INSERTION_TOKENS} の
 *   4 語を**任意の位置**へ高々 `budget` 個挿入して得られる**相異なる**字面を数え、元の枝と
 *   同一の字面だけを除く（{@link generateInsertions}）。
 *
 * どちらも、候補のうち正規化後の名前が `n` のままのものを**別形**と呼び、そのうち
 * 見本の `mustMatch` を全て拾い `mustNotMatch` を一つも拾わないものを**通り抜け**と呼ぶ。
 *
 * 通り抜けた別形の**向き**は、`n` の前後へ {@link CONTEXT_ALPHABET} と
 * {@link CONTEXT_CURATED} から組んだ文脈（{@link contexts}。219 通り）を総当たりで付した
 * コーパス（219×219 語）で、元の枝と別形の当たり方を比べて決める。元が拾ってその別形が
 * 拾わない語が一つでもあれば**緩む**、その逆だけがあれば**広がる**、どちらも無ければ
 * **同値**である（緩むと広がるが同時に立つ字面は緩む側へ数える。安全側の分類である）。
 *
 * ## 族の外（走査 C）
 *
 * 正規化は削除のみだが**逐次適用**であるため、削除が新たな削除対象を合成しうる。
 * 例えば `\\b.filter\(` は `\b` の削除が `\.` を生んで `filter` へ正規化されるが、
 * この字面は上の土台へ**語**を挿入しては作れない。**挿入の族は名前を保存する字面の
 * 部分集合にすぎない。**
 *
 * 走査 C はその外側を測る。土台は枝そのものと `n` と `'new ' + n` の三つ、挿入するのは
 * **語ではなく文字**（{@link OUTSIDE_CHARACTERS}。四つの語を構成する 8 文字）で、高々
 * {@link OUTSIDE_BUDGET} 個を任意の位置へ入れる。得た字面のうち名前が `n` のままで、かつ
 * **走査 A と走査 B（高々三個）のどちらの候補にも現れない**ものだけを数える。「族外」は
 * この二つの走査が実際に列挙した集合を基準に定める（語の並びへの分解可能性という述語で
 * 定めると、語の内側へ語を入れた字面の扱いが読み手ごとに割れる）。
 *
 * ## 何を数えないか（限界）
 *
 * 走査 C も有限の切片であって網羅ではない。挿入する文字を 8 種、個数を
 * {@link OUTSIDE_BUDGET} 個に切っているため、それを超える字面は母集団に入らない。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 走査対象（リポジトリルート相対）。二つの自己検査は同型の `NARROWING` と見本を持つ */
export const SURVEYED_SELFTESTS: readonly string[] = [
  'scripts/check-design-code-reference-format.selftest.ts',
  'scripts/check-design-reference-format.selftest.ts',
];

/** 走査 A が前後へ付す語（正規化が落とす字面） */
export const AFFIX_TOKENS: readonly string[] = ['\\b', '\\(', '\\.', 'new '];

/** 走査 B が任意の位置へ挿入する語（`trim` が落とす半角空白を含む） */
export const INSERTION_TOKENS: readonly string[] = ['\\b', '\\(', '\\.', ' '];

/** 族の外を作るために挿入する文字（走査 A・B の四つの語を構成する文字） */
export const OUTSIDE_CHARACTERS: readonly string[] = ['\\', 'b', '(', '.', ' ', 'n', 'e', 'w'];

/** 走査 C が挿入する文字の個数の上限 */
export const OUTSIDE_BUDGET = 3;

/** 向きの判定に使う文脈の素（長さ 1 の素を二つまで並べる） */
export const CONTEXT_ALPHABET: readonly string[] = ['a', ' ', '.', '(', ')', ';'];

/** 向きの判定に使う文脈の素（見本が挙げる偽陽性の形を含む。長さは 1 に限らない） */
export const CONTEXT_CURATED: readonly string[] = [
  'new ',
  'new',
  'x.',
  '.x',
  '((',
  '))',
  'ing',
  'Out',
  'pre',
  '_',
  '1',
  '=',
  ' = ',
  'A',
  '',
];

/** 枝を操作名へ正規化する（自己検査の `narrowingOperationsFromRegex` と同じ規則） */
export function normalizeBranch(alternative: string): string {
  return alternative
    .replace(/\\b/g, '')
    .replace(/\\\(/g, '')
    .replace(/\\\./g, '')
    .replace(/^new /, '')
    .trim();
}

interface Specimen {
  readonly operation: string;
  readonly mustMatch: readonly string[];
  readonly mustNotMatch: readonly string[];
}

interface Material {
  readonly branches: readonly string[];
  readonly specimens: readonly Specimen[];
}

/** 引用符で囲まれた文字列リテラルを順に取り出す（`eval` を使わない） */
function stringLiterals(block: string): string[] {
  const found: string[] = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let matched = pattern.exec(block);
  while (matched !== null) {
    const raw = matched[1] ?? matched[2] ?? '';
    found.push(raw.replace(/\\(.)/g, '$1'));
    matched = pattern.exec(block);
  }
  return found;
}

/** 走査対象のソースから `NARROWING` の枝と見本を読み直す（写しを置かない） */
export function readMaterial(source: string): Material {
  const regexLiteral = /const NARROWING =\s*\n?\s*\/(.*)\/;/.exec(source);
  if (regexLiteral === null) throw new Error('NARROWING の正規表現リテラルを取り出せない');
  const branches = (regexLiteral[1] ?? '').split('|');

  const anchor = source.indexOf('const NARROWING_BRANCH_SPECIMENS');
  if (anchor < 0) throw new Error('NARROWING_BRANCH_SPECIMENS を取り出せない');
  const start = source.indexOf('}> = [', anchor);
  const end = source.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error('NARROWING_BRANCH_SPECIMENS の範囲を取り出せない');
  const block = source.slice(start, end);

  const specimens: Specimen[] = [];
  const entry =
    /operation: '([^']+)',\s*mustMatch: \[([\s\S]*?)\],\s*mustNotMatch: \[([\s\S]*?)\],\s*\}/g;
  let matched = entry.exec(block);
  while (matched !== null) {
    specimens.push({
      operation: matched[1] ?? '',
      mustMatch: stringLiterals(matched[2] ?? ''),
      mustNotMatch: stringLiterals(matched[3] ?? ''),
    });
    matched = entry.exec(block);
  }
  return { branches, specimens };
}

/** 語を高々 `maxLength` 個並べた接辞（空を含む） */
export function affixes(tokens: readonly string[], maxLength: number): string[] {
  let current: string[] = [''];
  let all: string[] = [''];
  for (let length = 1; length <= maxLength; length += 1) {
    const next: string[] = [];
    for (const prefix of current) for (const token of tokens) next.push(prefix + token);
    all = all.concat(next);
    current = next;
  }
  return all;
}

/** 土台へ語を高々 `budget` 個、任意の位置へ挿入して得られる相異なる字面 */
export function generateInsertions(
  bases: readonly string[],
  tokens: readonly string[],
  budget: number
): Set<string> {
  const all = new Set<string>(bases);
  let frontier = new Set<string>(bases);
  for (let step = 0; step < budget; step += 1) {
    const next = new Set<string>();
    for (const current of frontier) {
      for (let position = 0; position <= current.length; position += 1) {
        for (const token of tokens) {
          const candidate = current.slice(0, position) + token + current.slice(position);
          if (all.has(candidate)) continue;
          all.add(candidate);
          next.add(candidate);
        }
      }
    }
    frontier = next;
  }
  return all;
}

/** 向きの判定に使う文脈（219 通り） */
export function contexts(): string[] {
  const found = new Set<string>(['']);
  for (const one of CONTEXT_ALPHABET) {
    found.add(one);
    for (const other of CONTEXT_ALPHABET) found.add(one + other);
  }
  for (const curated of CONTEXT_CURATED) {
    found.add(curated);
    for (const one of CONTEXT_ALPHABET) {
      found.add(curated + one);
      found.add(one + curated);
    }
  }
  return [...found];
}

const CONTEXTS = contexts();

export type Direction = 'loosening' | 'widening' | 'equivalent';

/** 元の枝と別形の当たり方をコーパスで比べ、向きを決める */
export function classify(branch: string, variant: string, name: string): Direction {
  const original = new RegExp(branch);
  const altered = new RegExp(variant);
  let missed = false;
  let extra = false;
  for (const left of CONTEXTS) {
    for (const right of CONTEXTS) {
      const word = left + name + right;
      const hitOriginal = original.test(word);
      const hitAltered = altered.test(word);
      if (hitOriginal && !hitAltered) missed = true;
      else if (hitAltered && !hitOriginal) extra = true;
      if (missed) return 'loosening';
    }
  }
  return extra ? 'widening' : 'equivalent';
}

interface PassThrough {
  readonly branch: string;
  readonly variant: string;
  readonly name: string;
  readonly direction: Direction;
}

interface ScanResult {
  readonly label: string;
  readonly candidates: number;
  readonly variants: number;
  readonly passThrough: readonly PassThrough[];
  readonly loosening: number;
  readonly widening: number;
  readonly equivalent: number;
}

/** 枝ごとの候補集合を受け取り、別形・通り抜け・向きを数える */
function evaluate(
  label: string,
  material: Material,
  candidateSets: ReadonlyArray<ReadonlySet<string>>
): ScanResult {
  let candidates = 0;
  let variants = 0;
  const passThrough: PassThrough[] = [];
  for (let index = 0; index < material.branches.length; index += 1) {
    const branch = material.branches[index] ?? '';
    const name = normalizeBranch(branch);
    const specimen = material.specimens.find((one) => one.operation === name);
    const set = candidateSets[index] ?? new Set<string>();
    for (const candidate of set) {
      if (candidate === branch) continue;
      candidates += 1;
      if (normalizeBranch(candidate) !== name) continue;
      variants += 1;
      let altered: RegExp;
      try {
        altered = new RegExp(candidate);
      } catch {
        continue;
      }
      if (specimen === undefined) continue;
      if (!specimen.mustMatch.every((code) => altered.test(code))) continue;
      if (specimen.mustNotMatch.some((code) => altered.test(code))) continue;
      passThrough.push({
        branch,
        variant: candidate,
        name,
        direction: classify(branch, candidate, name),
      });
    }
  }
  return {
    label,
    candidates,
    variants,
    passThrough,
    loosening: passThrough.filter((one) => one.direction === 'loosening').length,
    widening: passThrough.filter((one) => one.direction === 'widening').length,
    equivalent: passThrough.filter((one) => one.direction === 'equivalent').length,
  };
}

/** 走査 A の候補集合（土台は操作名ただ一つ。接辞を前後へ総当たりで付す） */
function affixSets(material: Material): Array<Set<string>> {
  const affix = affixes(AFFIX_TOKENS, 2);
  return material.branches.map((branch) => {
    const name = normalizeBranch(branch);
    const set = new Set<string>();
    for (const prefix of affix) for (const suffix of affix) set.add(prefix + name + suffix);
    return set;
  });
}

/** 走査 B の候補集合（土台は操作名と `new ` を冠した操作名の二つ） */
function insertionSets(material: Material, budget: number): Array<Set<string>> {
  return material.branches.map((branch) => {
    const name = normalizeBranch(branch);
    return generateInsertions([name, `new ${name}`], INSERTION_TOKENS, budget);
  });
}

/** 走査 C の候補集合（名前を保存し、かつ走査 A・B のどちらの候補にも現れない字面だけ） */
function outsideSets(
  material: Material,
  scanned: ReadonlyArray<ReadonlySet<string>>
): Array<Set<string>> {
  return material.branches.map((branch, index) => {
    const name = normalizeBranch(branch);
    const bases = [branch, name, `new ${name}`];
    const generated = generateInsertions(bases, OUTSIDE_CHARACTERS, OUTSIDE_BUDGET);
    const known = scanned[index] ?? new Set<string>();
    const outside = new Set<string>();
    for (const candidate of generated) {
      if (candidate === branch) continue;
      if (normalizeBranch(candidate) !== name) continue;
      if (known.has(candidate)) continue;
      outside.add(candidate);
    }
    return outside;
  });
}

function report(result: ScanResult, listAll: boolean): void {
  console.log(
    `${result.label}: 候補 ${result.candidates} / 別形 ${result.variants} / ` +
      `通り抜け ${result.passThrough.length}（緩む ${result.loosening}・` +
      `広がる ${result.widening}・同値 ${result.equivalent}）`
  );
  const loosening = result.passThrough.filter((one) => one.direction === 'loosening');
  const byBranch = new Map<string, number>();
  for (const one of loosening) byBranch.set(one.branch, (byBranch.get(one.branch) ?? 0) + 1);
  for (const [branch, count] of byBranch) console.log(`   緩む枝 ${branch}: ${count} 本`);
  if (!listAll) return;
  for (const one of loosening) console.log(`   [緩] ${one.branch} -> ${one.variant}`);
}

function main(): void {
  const listAll = process.argv.includes('--list');
  const dump = process.argv.includes('--dump');
  const withOutside = process.argv.includes('--outside');
  console.log(
    `向きの判定コーパス: 文脈 ${CONTEXTS.length} 通り / 操作名あたり ${
      CONTEXTS.length * CONTEXTS.length
    } 語`
  );
  for (const relative of SURVEYED_SELFTESTS) {
    const material = readMaterial(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    console.log('');
    console.log(
      `走査対象: ${relative}（枝 ${material.branches.length} 本 / 見本 ${material.specimens.length} 件）`
    );
    const setsA = affixSets(material);
    const setsB = insertionSets(material, 2);
    const setsB3 = insertionSets(material, 3);
    const merge = (
      left: ReadonlyArray<ReadonlySet<string>>,
      right: ReadonlyArray<ReadonlySet<string>>
    ): Array<Set<string>> =>
      left.map((set, index) => {
        const merged = new Set<string>(set);
        for (const one of right[index] ?? new Set<string>()) merged.add(one);
        return merged;
      });
    const results = [
      evaluate('走査 A（接辞のみ）', material, setsA),
      evaluate('走査 B（任意の位置・高々二個）', material, setsB),
      evaluate('合併（A ∪ B）', material, merge(setsA, setsB)),
      evaluate('走査 B（任意の位置・高々三個）', material, setsB3),
    ];
    if (withOutside) {
      results.push(
        evaluate('走査 C（族外・文字単位）', material, outsideSets(material, merge(setsA, setsB3)))
      );
    }
    for (const result of results) report(result, listAll);
    if (!dump) continue;
    for (const result of results) {
      for (const one of result.passThrough) {
        console.log(`DUMP\t${result.label}\t${one.branch}\t${one.variant}\t${one.direction}`);
      }
    }
  }
}

main();
