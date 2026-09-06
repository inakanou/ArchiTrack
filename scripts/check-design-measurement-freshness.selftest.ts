/**
 * @fileoverview 設計文書の実測値の鮮度検査 自己検査
 *
 * `scripts/check-design-measurement-freshness.ts` の判定が
 *   (1) **緩める向き**——現況とずれた値・文書から消えた字面・走らないコマンドを取り逃がさないこと、
 *   (2) **狭めすぎる向き**——一致している宣言を告発しないこと、
 * の両方を、宣言そのものを組み立てて確かめる。
 *
 * 加えて次を固定する。
 *
 *   - **母集団が空なら失敗する**（AI運用7原則 第3原則）。宣言 0 件・下限割れのいずれも赤くなる
 *   - **集計と検出の本体に絞り込みの経路が無い**（タスク 115.230 の作法）。
 *     見張る範囲は台帳 {@link EXECUTABLE_FUNCTION_INVENTORY} と**双方向で一致**させる
 *   - **本体をサブプロセスとして起動**し、一致1件・不一致1件・正しく宣言された食い違い
 *     （{@link DECLARED_STALE_DOCUMENT_FIGURES} + 1 件）の仮マニフェストに対する
 *     終了コードと報告件数を固定する（タスク 115.232 の起票文が指定した作法。
 *     `check-design-path-references.selftest.ts` の挙動検査に倣う）
 *   - **許容外の綴りは実行の入口がすべて塞がっている**。実行の入口は
 *     `grep -n 'spawnSync(' scripts/check-design-measurement-freshness.ts` が 1 箇所
 *     （`runMeasurement`）を、`grep -n 'runMeasurement(' ...` が宣言 1 行と呼び出し 3 箇所
 *     （`pushEntryFindings` と `runOutsideRepository` と `measureAll`）を挙げる——すなわち
 *     判定の経路・空洞化の対照・報告の経路の三つである（**タスク 115.271 が三つ目を足した。
 *     115.232 の提出時点は呼び出し 2 箇所であった**。2026-09-04、コミット `24acf91f` で実測）。
 *     空洞化の対照は判定の経路の綴りの検査より後にしか呼ばれない。
 *     既定・`--verbose`・`--json --verbose` の三つを
 *     サブプロセスで起動し、`sh -c "touch <marker>"` の痕跡ファイルが 0 個であることを固定する
 *   - **宣言の空洞化が落ちること、および落ちない残余**（タスク 115.271）。
 *     リポジトリの外でも同じ値を出す `command` は赤くなり、文書から値を読む `command` は
 *     赤くならない。**塞げていない二形——リポジトリを読むが値は定数、錨と無関係な読み出し——は
 *     「限界」の対照が現に通ることを固定する**（塞がれたら赤くなり、本体注釈の
 *     「見ないこと（限界）」の更新が強制される。タスク 115.268 の作法）
 *   - **下限に遊びが無いこと**（タスク 115.271 が 115.262 の作法へ揃えた）。宣言の件数が
 *     {@link MINIMUM_ENTRIES} を上回っても下回っても赤くなる
 *
 * 使用方法:
 *   npx tsx scripts/check-design-measurement-freshness.selftest.ts
 *   npm run check:design-measurement-freshness:selftest
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  DECLARED_STALE_DOCUMENT_FIGURES,
  DEFAULT_MANIFEST_PATH,
  GOVERNED_DOCUMENTS,
  MINIMUM_ENTRIES,
  READ_ONLY_COMMANDS,
  documentFigureOf,
  countFigureOnLine,
  formatSummaryLine,
  judge,
  leadingWord,
  loadManifest,
  splitCommandSegments,
  type ManifestEntry,
} from './check-design-measurement-freshness.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-measurement-freshness.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface TestCase {
  readonly name: string;
  /**
   * 対照の極性（タスク 115.252）
   *
   * 陽性（検出器が告発しなければならない側）と陰性（告発してはならない側）の**両方**が残って
   * いることを `guardControlsArePresent()` が群ごとに確かめるための属性。**名前の綴りからは
   * 導かない**（115.247 の作法）。極性を持たない機構の確認では省く。
   */
  readonly polarity?: 'positive' | 'negative';
  run(): string[];
}

interface TestGroup {
  readonly title: string;
  readonly cases: readonly TestCase[];
}

function expect(condition: boolean, message: string): string[] {
  return condition ? [] : [message];
}

/**
 * 見本の文書。`基準の行` が唯一の錨で、`1815` は数字の境界を確かめるための行
 *
 * 末尾の `控えの値` は {@link readFigure} が読み出す素材である。タスク 115.271 が
 * 「リポジトリの外でも同じ値を出す `command`」を失格にしたため、**対照の素材を
 * `printf '<数字>'` のままにできない**（素材そのものが新設の検出に掛かり、
 * 検出とは無関係の指摘が全対照へ混ざる）。素材は文書から値を読み出す形へ移した。
 */
const SAMPLE_DOCUMENT: readonly string[] = [
  '# 見本',
  '- 基準の行: 出力は 7 件である',
  '- 別の行: 1815 という数がある',
  '- 控えの値: <3> <7> <8> <9>',
];

/**
 * 見本の文書から値を読み出すコマンド（タスク 115.271）
 *
 * 文書の `控えの値` の行から `<数字>` を取り出す。**作業ディレクトリに `doc.md` が無ければ
 * 空を返す**ため、`judge` が新設した「リポジトリの外でも同じ値を出す `command` は失格」に
 * 掛からない。先頭語は `grep` と `tr` で、いずれも `READ_ONLY_COMMANDS` にある。
 */
function readFigure(figure: string): string {
  return `grep -oE '<${figure}>' doc.md | tr -d '<>'`;
}

function withDocument(lines: readonly string[], body: (root: string) => string[]): string[] {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-'));
  try {
    fs.writeFileSync(path.join(directory, 'doc.md'), `${lines.join('\n')}\n`);
    return body(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function baseEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    id: 'sample',
    file: 'doc.md',
    anchor: '基準の行',
    command: readFigure('7'),
    expected: '7',
    ...overrides,
  } as ManifestEntry;
}

/**
 * 「文書側が古い」と正しく宣言された宣言を `count` 件つくる
 *
 * 一件ずつは形式・錨・実測のいずれの判定にも掛からない（`documentFigure` の `7` は
 * `基準の行` にちょうど 1 箇所在り、`divergence` も揃っている）。掛かるのは
 * {@link DECLARED_STALE_DOCUMENT_FIGURES} との件数の突き合わせだけである。
 * **`count` を定数から算出することで、定数を締めても緩めても対照が意味を保つ**
 * （タスク 115.270 が定数を 4 から 0 へ締めた際、`0 - 1` 件を作れず下回る側が構成不能に
 * なったため、超える側を定数から組み立てる形へ改めた。**実測**: 定数だけを 0 へ落として
 * 旧来の対照を走らせると、`npm run check:design-measurement-freshness:selftest` は
 * 31 件中 2 件——下回る側の対照とサブプロセスの報告件数——が落ちた。2026-09-04 に
 * リポジトリルートで実測）。
 */
function staleEntries(count: number): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(
      baseEntry({
        id: `stale-${index}`,
        command: readFigure('8'),
        expected: '8',
        documentFigure: '7',
        divergence: { kind: 'stale', reason: '文書側が古いことを宣言している' },
      })
    );
  }
  return entries;
}

/**
 * 宣言の一覧を判定へ通し、出た指摘の本文だけを取り出す。
 *
 * **素材が空のときは判定を通さず止める**（AI運用7原則 第3原則。タスク 115.252 の是正。
 * 指摘 (2)）。本ファイルの対照はほぼすべて `messagesFor(root, [baseEntry(...)])` の形で
 * 実引数に配列リテラルを直書きしている。その配列を空にすると `judge` は見るものが無くなり、
 * 戻りは空配列になる——`countMatching(list, ...) === 0` を求める陰性側の主張はそこで恒真に
 * なり、対照は何も確かめないまま緑で通る。**実測（2026-09-03、リポジトリルート）**:
 * 陰性対照の `messagesFor(root, [baseEntry()])` の実引数を `[]` へ空化して
 * `npx tsx scripts/check-design-measurement-freshness.selftest.ts` を走らせると
 * **31/31 件の確認に成功しました・EXIT=0** であった。素材の外側に在るこの入口で空を拒み、
 * 判定を呼ぶ全箇所へ一度に効かせる。
 */
function messagesFor(root: string, entries: readonly ManifestEntry[]): string[] {
  if (entries.length === 0) {
    throw new Error('判定へ渡す宣言 entries が空です（この確認が空振りしています）');
  }
  const collected: string[] = [];
  for (const finding of judge(root, entries)) collected.push(finding.message);
  return collected;
}

/**
 * 「宣言 0 件」を意図して判定へ渡す唯一の入口（タスク 115.252 の是正。指摘 (2)）
 *
 * `messagesFor` は空の素材を拒む。空そのものを対象にする対照——本体が母集団 0 件を
 * 合格にしないことを固定する `NON_VACUITY`——だけは、意図であることを名前で申告して通す。
 * **空を許す経路をこの一本に絞る**ので、素材を空にする変異が他の対照で黙って通ることはない。
 */
function messagesForEmptyDeclaration(root: string): string[] {
  return judge(root, []).map((finding) => finding.message);
}

function countMatching(list: readonly string[], needle: string): number {
  let count = 0;
  for (const item of list) {
    if (item.includes(needle)) count += 1;
  }
  return count;
}

/**
 * 壊れた宣言項目の見本（タスク 115.272）
 *
 * **JSON から作れる形だけを挙げる。** 宣言は `scripts/design-measurements.json` から読み込まれる
 * ため、実際に到達しうるのはここに挙げた形である（欄を持つ getter が例外を送出する形は
 * JSON からは作れない。それは {@link entryThatThrowsOnAccess} が別に覆う）。
 *
 * 各見本は「壊れた項目そのものが指摘になること」と「その後ろの宣言の判定が報告へ到達すること」の
 * 両方を要求される。是正前の実測（コミット `97948d3c`、2026-09-04）では、ここに挙げた 9 形の
 * **すべて**が捕捉されない例外で列挙を中断させ、後ろの宣言の指摘は一つも報告へ到達しなかった。
 *
 * **追試の手順**（提出物から再現できる形にする）: `git worktree add --detach <控え> 97948d3c`
 * で是正前の作業ツリーを作り、そこへ**現行の**自己検査を置き、
 * `ln -s <リポジトリ>/node_modules <控え>/node_modules` で依存を見えるようにしてから
 * `npx tsx <控え>/scripts/check-design-measurement-freshness.selftest.ts` を走らせる。
 * 本確認は 9 形すべてで失敗を出し（`列挙が例外で中断した` が 9 行）、自己検査の全体は
 * **41 件中 7 件**が落ちて終了コード 1 になる（2026-09-04 に実測。同一コマンドの 2 回と
 * `npm run --prefix <控え> check:design-measurement-freshness:selftest` でも同じ件数）。
 *
 * 落ちる 7 件の内訳（後任が照合できるように名前で挙げる）:
 *   1. 壊れた宣言項目があっても列挙は最後まで走り、壊れた項目自身も指摘になる
 *   2. 欄を欠く宣言項目でも、形の検査が算出した指摘が報告へ到達する
 *   3. 壊れた欄の総当たり: 列挙は一度も中断せず、いずれの形も無言では通らない
 *   4. 判定が例外で落ちた項目は指摘になり、列挙は最後まで走る（最後の網）
 *   5. 台帳と本体の関数宣言が双方向で一致する
 *   6. 集計と検出の本体に絞り込みの経路が無い
 *   7. 壊れた宣言項目でもスタックトレースを出さず他の項目の指摘を報告する
 *
 * **`node_modules` を見せ忘れると 9 件に見える。** 控えは作業ツリーだけを持ち依存を持たないため、
 * サブプロセスの確認のうち 2 件（仮マニフェストの終了コード、`--verbose` 経路の綴り）が
 * 「tsx の起動口が見つからない」で落ちる。これは是正前の欠陥ではなく手順の不備であり、
 * 上の 7 件とは別物である（2026-09-04 に両方を実測して切り分けた）。
 */
const BROKEN_ENTRY_SHAPES: readonly { readonly label: string; readonly entry: ManifestEntry }[] = [
  { label: 'file を持たないオブジェクト', entry: { id: 'broken' } as unknown as ManifestEntry },
  { label: '文字列', entry: 'broken' as unknown as ManifestEntry },
  { label: 'null', entry: null as unknown as ManifestEntry },
  { label: '数値', entry: 42 as unknown as ManifestEntry },
  { label: '配列', entry: [] as unknown as ManifestEntry },
  {
    label: 'file が数値',
    entry: {
      id: 'broken',
      file: 123,
      anchor: '基準の行',
      command: readFigure('7'),
      expected: '7',
    } as unknown as ManifestEntry,
  },
  {
    label: 'expected が数値',
    entry: {
      id: 'broken',
      file: 'doc.md',
      anchor: '基準の行',
      command: readFigure('7'),
      expected: 7,
    } as unknown as ManifestEntry,
  },
  {
    label: 'documentRendering が数値',
    entry: {
      id: 'broken',
      file: 'doc.md',
      anchor: '基準の行',
      command: readFigure('7'),
      expected: '7',
      documentRendering: 7,
    } as unknown as ManifestEntry,
  },
  {
    label: 'divergence が null',
    entry: {
      id: 'broken',
      file: 'doc.md',
      anchor: '基準の行',
      command: readFigure('7'),
      expected: '7',
      divergence: null,
    } as unknown as ManifestEntry,
  },
];

/**
 * 壊れた欄の総当たり（タスク 115.272）
 *
 * {@link BROKEN_ENTRY_SHAPES} は代表的な形を名指しで挙げるが、**挙げた形についてしか言えない**。
 * ここでは宣言が持つ欄と、`JSON.parse` が欄に置きうる値の組を総当たりし、
 * 「例外で列挙が止まらない」と「無言では通らない」の二つを全ての組へ課す。
 * 母集団は {@link CHECKED_FIELDS} の 8 欄と項目そのものの計 9 通り × {@link BROKEN_FIELD_VALUES}
 * の 11 値 = 99 通りである。**この 99 も機械が保つ**——欄は {@link declaredEntryFields} が
 * 本体の型宣言から導き、組の数は {@link EXHAUSTIVE_TRIAL_COUNT} と厳密に突き合わせる。
 *
 * **`undefined` は入れない。** 欄が無いことは `documentFigure` / `documentRendering` /
 * `divergence` については正しい形であり、壊れた欄ではないからである
 * （必須の欄が無い形は「項目そのもの」の側の `{}` が覆う）。
 */
const BROKEN_FIELD_VALUES: readonly unknown[] = [
  null,
  0,
  1.5,
  -1.5,
  true,
  false,
  '',
  [],
  [1],
  {},
  { a: 1 },
];

/**
 * 総当たりの対象から外す欄と、その理由（タスク 115.272 の是正。指摘 6）
 *
 * `note` は {@link ManifestEntry} の型宣言以外のどこからも読まれない——本体
 * `scripts/check-design-measurement-freshness.ts` に `note` は 1 箇所（宣言の行）しか
 * 現れない（2026-09-04 に `grep -n note` で実測）。読まれない欄は壊しても例外にも
 * 誤判定にもならないため、総当たりの母集団から外す。
 * **`note` を読む処理が入ったら、この一覧から外すこと。**
 */
const UNCHECKED_FIELDS: readonly string[] = ['note'];

/**
 * {@link ManifestEntry} の宣言が挙げる欄を本体のソースから取り出す（タスク 115.272 の是正。指摘 5）
 *
 * **欄の一覧を自己検査へ手で写すと、写した側を痩せさせても誰も咎めない。**
 * 手で書いた 8 欄を `['id']` の 1 欄へ痩せさせる変異を当てると、
 * `npm run check:design-measurement-freshness:selftest` は 41/41 で緑のままだった
 * （組の数を突き合わせる `attempted === BROKEN_FIELD_VALUES.length * (CHECKED_FIELDS.length + 1)`
 * が同じ定数から再計算する自己言及であったため。2026-09-04 に実測）。宣言から導けば、
 * 欄を落とすには本体の型宣言そのものを削るしかない。
 */
function declaredEntryFields(): readonly string[] {
  const source = readEntrySource();
  const at = source.indexOf('export interface ManifestEntry {');
  if (at < 0) return [];
  const end = source.indexOf('\n}', at);
  if (end < 0) return [];
  const fields: string[] = [];
  for (const line of source.slice(at, end).split('\n')) {
    const matched = /^\s*readonly\s+([A-Za-z][A-Za-z0-9]*)\??:/.exec(line);
    const name = matched?.[1];
    if (name !== undefined) fields.push(name);
  }
  return fields;
}

/**
 * 総当たりの対象にする欄（{@link ManifestEntry} の宣言から導き、{@link UNCHECKED_FIELDS} を除く）
 */
const CHECKED_FIELDS: readonly string[] = declaredEntryFields().filter(
  (field) => !UNCHECKED_FIELDS.includes(field)
);

/**
 * 総当たりが毎回走らせる組の数（タスク 115.272 の是正。指摘 5）
 *
 * 本体注釈が「99 通りを毎回走らせる」と名乗る、その 99 をここへ逐語で貼る。
 * **下限ではなく厳密な一致にする**——遊びを持つ下限は、その幅ぶんの無言の削除を吸収するため
 * （タスク 115.271 が `MINIMUM_ENTRIES` で踏んだのと同型）。母集団を意図して変えるときは、
 * 本体注釈とこの定数の双方を同時に改めること。
 *
 * **件数だけでは足りない。** 幅を保ったまま値を同じものへ差し替える痩せ方が残るため、
 * {@link BROKEN_FIELD_VALUES} の重複も併せて咎める。**実測**: 11 値を `null` 11 個へ
 * 差し替えると `npm run check:design-measurement-freshness:selftest` は 41 件中 1 件が
 * 落ち、`壊れた値の見本に重複がある` を報告する（2026-09-04 に実測）。
 */
const EXHAUSTIVE_TRIAL_COUNT = 99;

/**
 * 欄の読み出しそのものが例外を送出する宣言（タスク 115.272）
 *
 * JSON からは作れないが、`judge` を直に呼ぶ経路では作れる。**最後の網**——一件の判定が
 * 例外で落ちても列挙が最後まで走ること——を確かめるための素材である。
 * 例外を仕込む欄は `anchor` に限る。`id` / `file` / `divergence` は母集団の集計
 * （`duplicatedIds` / `countEntriesForFile` / `countStaleDivergences`）が
 * 一件ごとの判定の**外側**で読むため、網の外に落ちるからである（限界として本体注釈に記す）。
 */
function entryThatThrowsOnAccess(): ManifestEntry {
  const entry = { id: 'throws', file: 'doc.md', command: 'true', expected: '7' };
  Object.defineProperty(entry, 'anchor', {
    enumerable: true,
    get(): string {
      throw new Error('欄の読み出しが例外を送出する見本');
    },
  });
  return entry as unknown as ManifestEntry;
}

// ============================================================================
// 検出規則（緩める向きと狭めすぎる向きの両方）
// ============================================================================

const DETECTION: TestCase[] = [
  {
    name: '一致している宣言は告発されない（陰性対照。この対照が空振りなら以下は無意味）',
    polarity: 'negative',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry()]);
        return expect(
          countMatching(list, 'sample') === 0 && countMatching(list, '現況と食い違います') === 0,
          `一致している宣言を告発している: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'コマンドの出力が expected とずれると、file・anchor・expected・actual を名指しで赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ command: readFigure('8') })]);
        const hit = list.join('\n');
        return [
          ...expect(countMatching(list, '現況と食い違います') === 1, `検出されない: ${hit}`),
          ...expect(hit.includes('doc.md'), `file を名指ししていない: ${hit}`),
          ...expect(hit.includes('基準の行'), `anchor を名指ししていない: ${hit}`),
          ...expect(hit.includes('expected=`7`'), `expected を引いていない: ${hit}`),
          ...expect(hit.includes('actual=`8`'), `actual を引いていない: ${hit}`),
        ];
      });
    },
  },
  {
    name: 'anchor が文書に無ければ赤くなる（文書側が書き換わった形）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ anchor: '存在しない錨' })]);
        return expect(
          countMatching(list, 'anchor が') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'anchor が二行に当たれば赤くなる（一意でない錨を許さない）',
    polarity: 'positive',
    run() {
      return withDocument([...SAMPLE_DOCUMENT, '- 基準の行: 写し'], (root) => {
        const list = messagesFor(root, [baseEntry()]);
        return expect(
          countMatching(list, '2 行に当たります') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'file が実在しなければ赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ file: 'missing.md' })]);
        return expect(
          countMatching(list, 'を読めません') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'コマンドが失敗したら読み飛ばさず赤くなる（第3原則）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ command: 'test 1 -eq 2' })]);
        return expect(
          countMatching(list, '終了コード 1 で失敗しました') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: '許容外の綴りのコマンドは赤くなり、判定の経路では実行されない',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const marker = path.join(root, 'marker');
        const list = messagesFor(root, [baseEntry({ command: `sh -c 'touch ${marker}'` })]);
        return [
          ...expect(
            countMatching(list, 'READ_ONLY_COMMANDS にありません') === 1,
            `検出されない: ${JSON.stringify(list)}`
          ),
          ...expect(!fs.existsSync(marker), '許容外のコマンドが実行された'),
          ...expect(
            countMatching(list, '現況と食い違います') === 0,
            `実行していないのに突き合わせの失敗を出している: ${JSON.stringify(list)}`
          ),
        ];
      });
    },
  },
  {
    name: 'documentFigure が anchor の行に無ければ赤くなる（宣言だけが新鮮な形）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [
          baseEntry({
            command: readFigure('9'),
            expected: '9',
            documentFigure: '9',
          }),
        ]);
        return expect(
          countMatching(list, 'を載せていません') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'documentFigure が expected と異なるのに divergence が無ければ赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ documentFigure: '7', expected: '7' })]);
        const declared = messagesFor(root, [
          baseEntry({ command: readFigure('8'), expected: '8', documentFigure: '7' }),
        ]);
        return [
          ...expect(
            countMatching(list, 'divergence の宣言がありません') === 0,
            `一致しているのに divergence を求めている: ${JSON.stringify(list)}`
          ),
          ...expect(
            countMatching(declared, 'divergence の宣言がありません') === 1,
            `検出されない: ${JSON.stringify(declared)}`
          ),
        ];
      });
    },
  },
  {
    name: 'divergence が解消しても宣言が残っていれば赤くなる（宣言が対象より長生きしない）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [
          baseEntry({
            documentFigure: '7',
            divergence: { kind: 'stale', reason: '解消済みのはずの宣言' },
          }),
        ]);
        return expect(
          countMatching(list, '宣言が対象より長生きしています') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'divergence の reason が空なら赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [
          baseEntry({
            command: readFigure('8'),
            expected: '8',
            documentFigure: '7',
            divergence: { kind: 'stale', reason: '   ' },
          }),
        ]);
        return expect(
          countMatching(list, 'reason が空です') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'id の重複は赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry(), baseEntry()]);
        return expect(
          countMatching(list, 'が重複しています') === 1,
          `検出されない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: '数字の字面は前後を数字で挟まれた形に当たらない',
    run() {
      return [
        ...expect(
          countFigureOnLine('- 別の行: 1815 という数がある', '81') === 0,
          '1815 の内側の 81 に当たってしまう'
        ),
        ...expect(
          countFigureOnLine('- 別の行: 1815 という数がある', '1815') === 1,
          '1815 そのものに当たらない'
        ),
        ...expect(
          countFigureOnLine('出力が `64 0` である', '64 0') === 1,
          '数字以外を含む字面の逐語一致が働かない'
        ),
      ];
    },
  },
  {
    name: 'documentRendering が行に二箇所あれば赤くなる（素の数字が別の数値にも当たる形）',
    polarity: 'positive',
    run() {
      const document = ['# 見本', '- 基準の行: 3 の節が 3 つある（出力が `3`）', '- 控えの値: <3>'];
      return withDocument(document, (root) => {
        const bare = messagesFor(root, [baseEntry({ command: readFigure('3'), expected: '3' })]);
        const rendered = messagesFor(root, [
          baseEntry({ command: readFigure('3'), expected: '3', documentRendering: '出力が `3`' }),
        ]);
        return [
          ...expect(
            countMatching(bare, 'どれを指すか定まりません') === 1,
            `多義の字面が素通りしている: ${JSON.stringify(bare)}`
          ),
          ...expect(
            countMatching(rendered, 'どれを指すか定まりません') === 0,
            `記法ごと宣言しても多義と判定される: ${JSON.stringify(rendered)}`
          ),
          ...expect(
            countMatching(rendered, 'を載せていません') === 0,
            `記法ごとの宣言が行に当たらない: ${JSON.stringify(rendered)}`
          ),
        ];
      });
    },
  },
  {
    name: 'documentRendering が documentFigure を含まなければ赤くなる（記法と値の切り離し）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ documentRendering: '出力は 7 件' })]);
        const detached = messagesFor(root, [baseEntry({ documentRendering: '基準の行' })]);
        return [
          ...expect(
            countMatching(list, '記法と値が切り離されています') === 0,
            `値を含む記法を咎めている: ${JSON.stringify(list)}`
          ),
          ...expect(
            countMatching(detached, '記法と値が切り離されています') === 1,
            `値を含まない記法が素通りしている: ${JSON.stringify(detached)}`
          ),
        ];
      });
    },
  },
  {
    name: 'documentRendering が documentFigure と同じなら赤くなる（既定と同じ宣言を残さない）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ documentRendering: '7' })]);
        return expect(
          countMatching(list, '既定と同じ宣言は外してください') === 1,
          `既定と同じ宣言が素通りしている: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: 'documentFigure の既定は expected である',
    run() {
      const entry = baseEntry();
      const overridden = baseEntry({ documentFigure: '9' });
      return [
        ...expect(documentFigureOf(entry) === '7', '既定が expected になっていない'),
        ...expect(documentFigureOf(overridden) === '9', '明示した documentFigure が採られない'),
      ];
    },
  },
  {
    name: 'リポジトリの外でも同じ値を出す command は赤くなる（宣言の空洞化。タスク 115.271）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry({ command: "printf '7'" })]);
        return expect(
          countMatching(list, 'リポジトリの外でも同じ値') === 1,
          `中身を抜いた宣言が素通りしている: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: '文書から値を読み出す command は告発されない（空洞化の検出が何にでも反応しない）',
    polarity: 'negative',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry()]);
        return expect(
          countMatching(list, 'リポジトリの外でも同じ値') === 0,
          `現況を読む宣言を空洞化として告発している: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    /**
     * 塞げなかった経路が**現に通る**ことを固定する（タスク 115.268 の作法）
     *
     * 本体注釈の「見ないこと（限界）」が挙げる二形を、実際に判定へ通して指摘 0 件を求める。
     * 将来この経路が塞がれたら本確認が赤くなり、限界の記述の更新が強制される。
     *
     * **空振りしない形にする。** 「指摘が 0 件」は、綴りで落ちた・コマンドが失敗した・
     * 値が食い違ったといった別の理由でも成り立つ——そのときは空洞化の判定へ到達すら
     * していない。到達したことを示すため、**当該の宣言が空洞化以外のどの検出にも
     * 掛かっていないこと**を併せて求める。
     */
    name: '限界: リポジトリに触れるが値は定数、という command は現に通る（タスク 115.271 が塞げなかった経路）',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const constantThroughFile = messagesFor(root, [
          baseEntry({ command: "test -f doc.md && printf '7'" }),
        ]);
        const unrelatedFile = messagesFor(root, [
          baseEntry({
            command: "grep -c '存在しない綴り' doc.md || test $? -eq 1",
            expected: '0',
            documentFigure: '7',
            divergence: { kind: 'stale', reason: '限界の固定。値は文書と無関係である' },
          }),
        ]);
        const reachedTheHollowCheck = (list: readonly string[]): string[] => [
          ...expect(
            countMatching(list, 'READ_ONLY_COMMANDS にありません') === 0,
            `綴りで落ちており空洞化の判定へ到達していない: ${JSON.stringify(list)}`
          ),
          ...expect(
            countMatching(list, '失敗しました') === 0,
            `コマンドが失敗しており空洞化の判定へ到達していない: ${JSON.stringify(list)}`
          ),
          ...expect(
            countMatching(list, '現況と食い違います') === 0,
            `値が食い違っており限界の見本として成立していない: ${JSON.stringify(list)}`
          ),
        ];
        return [
          ...reachedTheHollowCheck(constantThroughFile),
          ...reachedTheHollowCheck(unrelatedFile),
          ...expect(
            countMatching(constantThroughFile, 'リポジトリの外でも同じ値') === 0,
            '限界の記述が実態と食い違う（定数を文書の読み出しでくるむ経路が塞がれた）。' +
              `本体注釈の「見ないこと（限界）」を更新すること: ${JSON.stringify(constantThroughFile)}`
          ),
          ...expect(
            countMatching(unrelatedFile, 'リポジトリの外でも同じ値') === 0,
            '限界の記述が実態と食い違う（錨と無関係な読み出しの経路が塞がれた）。' +
              `本体注釈の「見ないこと（限界）」を更新すること: ${JSON.stringify(unrelatedFile)}`
          ),
        ];
      });
    },
  },
  {
    /**
     * 壊れた宣言項目で列挙が中断しないこと（タスク 115.272）
     *
     * 是正前は {@link BROKEN_ENTRY_SHAPES} の 9 形の**すべて**が捕捉されない例外を送出し、
     * 後ろに並んだ正しい形の宣言は**一度も判定されなかった**（`97948d3c` の作業ツリーで
     * `judge` へ 9 形を一つずつ渡して実測。送出 9 形 / 後ろの宣言の指摘の到達 0 形。
     * 2026-09-04）。ここでは二つを同時に求める。
     *
     *   - 壊れた項目の**後ろ**の宣言の指摘が報告へ到達すること（`actual=\`8\`` は
     *     後ろの宣言だけが出しうる字面である）
     *   - 壊れた項目そのものが指摘になること（握り潰して緑にする向きへ倒さない）。
     *     後ろの宣言だけを渡したときの指摘の件数と比べて増えていることで示す
     */
    name: '壊れた宣言項目があっても列挙は最後まで走り、壊れた項目自身も指摘になる（タスク 115.272）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const failures: string[] = [];
        if (BROKEN_ENTRY_SHAPES.length === 0) {
          failures.push('素材 BROKEN_ENTRY_SHAPES が空です（この確認が空振りしています）');
        }
        const tail = baseEntry({ id: 'tail', command: readFigure('8') });
        const baseline = messagesFor(root, [tail]);
        for (const shape of BROKEN_ENTRY_SHAPES) {
          let list: string[];
          try {
            list = messagesFor(root, [shape.entry, tail]);
          } catch (error) {
            failures.push(`${shape.label}: 列挙が例外で中断した: ${String(error)}`);
            continue;
          }
          failures.push(
            ...expect(
              countMatching(list, 'actual=`8`') === 1,
              `${shape.label}: 壊れた項目の後ろの宣言の指摘が報告へ到達しない: ${JSON.stringify(list)}`
            )
          );
          failures.push(
            ...expect(
              list.length > baseline.length,
              `${shape.label}: 壊れた項目が握り潰されている（指摘が増えていない）: ${JSON.stringify(list)}`
            )
          );
        }
        return failures;
      });
    },
  },
  {
    /**
     * 形の検査が算出した指摘が報告へ到達すること（タスク 115.272）
     *
     * 是正前、`{"id":"broken"}` に対して `shapeFailures` は四つの指摘を**算出していた**が、
     * 同じ関数の末尾で `documentRenderingOf` が返す `undefined` に対して `.includes` を
     * 呼んで例外になり、算出済みの四件は呼び出し側へ渡らないまま捨てられていた。
     */
    name: '欄を欠く宣言項目でも、形の検査が算出した指摘が報告へ到達する（タスク 115.272）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const tail = baseEntry({ id: 'tail', command: readFigure('8') });
        let list: string[];
        try {
          list = messagesFor(root, [{ id: 'broken' } as unknown as ManifestEntry, tail]);
        } catch (error) {
          return [`形の検査が例外で中断した: ${String(error)}`];
        }
        const hit = list.join('\n');
        return [
          ...expect(hit.includes('file が空です'), `file の指摘が届かない: ${hit}`),
          ...expect(hit.includes('anchor が空です'), `anchor の指摘が届かない: ${hit}`),
          ...expect(hit.includes('command が空です'), `command の指摘が届かない: ${hit}`),
          ...expect(hit.includes('expected が空です'), `expected の指摘が届かない: ${hit}`),
        ];
      });
    },
  },
  {
    /**
     * 壊れた欄の総当たり（タスク 115.272）
     *
     * 名指しの見本ではなく、欄と値の組の全体に対して二つの性質を課す。**無言で通らないこと**は
     * 「正しい宣言 1 件を渡したときの指摘の件数」を基準に取り、それを上回ることで示す
     * （母集団の前提に由来する指摘は両方に等しく含まれるため差し引かれる）。
     */
    name: '壊れた欄の総当たり: 列挙は一度も中断せず、いずれの形も無言では通らない（タスク 115.272）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const failures: string[] = [];
        if (BROKEN_FIELD_VALUES.length === 0 || CHECKED_FIELDS.length === 0) {
          failures.push(
            '素材 BROKEN_FIELD_VALUES / CHECKED_FIELDS が空です（この確認が空振りしています）'
          );
        }
        const valid = baseEntry();
        const baseline = messagesFor(root, [valid]).length;
        let attempted = 0;
        const trial = (label: string, entry: ManifestEntry): void => {
          attempted += 1;
          let messages: string[];
          try {
            messages = messagesFor(root, [entry]);
          } catch (error) {
            failures.push(`${label}: 列挙が例外で中断した: ${String(error)}`);
            return;
          }
          // JSON から作れる形は、最後の網ではなく個別の判定が名指しで咎めること
          // （網へ落ちると、どの欄がどう壊れているかを指摘が失う）。
          if (countMatching(messages, '判定が例外で中断しました') > 0) {
            failures.push(`${label}: 最後の網へ落ちている: ${JSON.stringify(messages)}`);
          }
          const count = messages.length;
          if (count <= baseline) {
            failures.push(
              `${label}: 壊れた欄が無言で通っている（指摘が ${count} 件で、正しい宣言の ${baseline} 件から増えていない）`
            );
          }
        };
        for (const value of BROKEN_FIELD_VALUES) {
          trial(`項目そのもの=${JSON.stringify(value)}`, value as ManifestEntry);
        }
        for (const field of CHECKED_FIELDS) {
          for (const value of BROKEN_FIELD_VALUES) {
            trial(`${field}=${JSON.stringify(value)}`, {
              ...valid,
              [field]: value,
            } as unknown as ManifestEntry);
          }
        }
        failures.push(
          ...expect(
            attempted === BROKEN_FIELD_VALUES.length * (CHECKED_FIELDS.length + 1),
            `総当たりの件数が母集団と合わない: ${attempted}`
          ),
          ...expect(
            new Set(BROKEN_FIELD_VALUES.map((value) => JSON.stringify(value))).size ===
              BROKEN_FIELD_VALUES.length,
            // 件数だけを貼ると、値を同じものへ差し替えて幅だけ保つ痩せ方が通る
            // （`null` を 11 個並べても組の数は 99 のままである）。
            `壊れた値の見本に重複がある: ${JSON.stringify(BROKEN_FIELD_VALUES)}`
          ),
          ...expect(
            attempted === EXHAUSTIVE_TRIAL_COUNT,
            `総当たりの組の数が本体注釈の名乗る ${EXHAUSTIVE_TRIAL_COUNT} 通りと合わない: ` +
              `${attempted} 通り（欄 ${CHECKED_FIELDS.length} + 項目そのもの 1 の ` +
              `${CHECKED_FIELDS.length + 1} 通り × 値 ${BROKEN_FIELD_VALUES.length} 通り）。` +
              '母集団を意図して変えたなら、本体注釈と EXHAUSTIVE_TRIAL_COUNT の双方を改めること'
          )
        );
        return failures;
      });
    },
  },
  {
    /**
     * 一件の判定が例外で落ちても列挙が最後まで走ること（最後の網。タスク 115.272）
     *
     * {@link BROKEN_ENTRY_SHAPES} は JSON から作れる形を一つずつ塞ぐが、それは**列挙した形に
     * ついてしか言えない**。ここでは欄の読み出し自体が例外を送出する項目を渡し、
     * 個別の形を知らなくても列挙が続くことを求める。**握り潰さないこと**——例外そのものが
     * 指摘になること——も同時に求める。
     */
    name: '判定が例外で落ちた項目は指摘になり、列挙は最後まで走る（最後の網。タスク 115.272）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const tail = baseEntry({ id: 'tail', command: readFigure('8') });
        let list: string[];
        try {
          list = messagesFor(root, [entryThatThrowsOnAccess(), tail]);
        } catch (error) {
          return [`例外が判定の外へ抜けた（最後の網が無い）: ${String(error)}`];
        }
        return [
          ...expect(
            countMatching(list, '判定が例外で中断しました') === 1,
            `例外が指摘になっていない: ${JSON.stringify(list)}`
          ),
          ...expect(
            countMatching(list, 'actual=`8`') === 1,
            `例外の後ろの宣言の指摘が報告へ到達しない: ${JSON.stringify(list)}`
          ),
        ];
      });
    },
  },
];

// ============================================================================
// 母集団が空なら失敗する（AI運用7原則 第3原則）
// ============================================================================

const NON_VACUITY: TestCase[] = [
  {
    name: '宣言が 0 件なら赤くなる（空を合格にしない）',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesForEmptyDeclaration(root);
        return expect(
          countMatching(list, '宣言が 0 件です') === 1,
          `空の宣言が合格している: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: '宣言が下限を下回れば赤くなる（大量削除を無言で通さない）',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry()]);
        return expect(
          countMatching(list, `下限 ${MINIMUM_ENTRIES} 件を下回ります`) === 1,
          `下限が働いていない: ${JSON.stringify(list)}`
        );
      });
    },
  },
  {
    name: '宣言が下限を上回れば赤くなり、下限ちょうどなら告発しない（下限に遊びを持たせない。タスク 115.262 の作法）',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const build = (count: number): ManifestEntry[] => {
          const entries: ManifestEntry[] = [];
          for (let index = 0; index < count; index += 1) {
            entries.push(baseEntry({ id: `entry-${index}` }));
          }
          return entries;
        };
        const over = messagesFor(root, build(MINIMUM_ENTRIES + 1));
        const exact = messagesFor(root, build(MINIMUM_ENTRIES));
        return [
          ...expect(
            countMatching(over, `${MINIMUM_ENTRIES} 件を上回ります`) === 1,
            `下限の遊びが素通りしている（一件を無言で削れる）: ${JSON.stringify(over)}`
          ),
          ...expect(
            countMatching(exact, '件を上回ります') === 0,
            `ちょうどなのに超過として告発している: ${JSON.stringify(exact)}`
          ),
          ...expect(
            countMatching(exact, '件を下回ります') === 0,
            `ちょうどなのに不足として告発している: ${JSON.stringify(exact)}`
          ),
        ];
      });
    },
  },
  {
    name: '所管の文書を指す宣言が一件も無ければ赤くなる',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const list = messagesFor(root, [baseEntry()]);
        return [
          ...expect(GOVERNED_DOCUMENTS.length > 0, '所管の文書の宣言が空'),
          ...expect(
            countMatching(list, 'を指す宣言が一件もありません') === GOVERNED_DOCUMENTS.length,
            `所管の文書の被覆が見られていない: ${JSON.stringify(list)}`
          ),
        ];
      });
    },
  },
  {
    name: '宣言された食い違いの件数が宣言と完全に一致しなければ赤くなる',
    polarity: 'positive',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const over = messagesFor(root, [
          baseEntry(),
          ...staleEntries(DECLARED_STALE_DOCUMENT_FIGURES + 1),
        ]);
        return expect(
          countMatching(over, `宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を超えています`) === 1,
          `宣言を超えた食い違いが見られていない: ${JSON.stringify(over)}`
        );
      });
    },
  },
  {
    name: '宣言された食い違いの件数が宣言とちょうど一致していれば告発しない',
    polarity: 'negative',
    run() {
      return withDocument(SAMPLE_DOCUMENT, (root) => {
        const exact = messagesFor(root, [
          baseEntry(),
          ...staleEntries(DECLARED_STALE_DOCUMENT_FIGURES),
        ]);
        return [
          ...expect(
            countMatching(exact, `宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を超えています`) === 0,
            `一致しているのに超過として告発している: ${JSON.stringify(exact)}`
          ),
          ...expect(
            countMatching(exact, `宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を下回ります`) === 0,
            `一致しているのに不足として告発している: ${JSON.stringify(exact)}`
          ),
        ];
      });
    },
  },
];

// ============================================================================
// コマンドの綴りの分割
// ============================================================================

const COMMAND_VOCABULARY: TestCase[] = [
  {
    name: '単引用の内側の区切りは区切りにならない',
    run() {
      const segments = splitCommandSegments("grep -c '^| ; & (x)' doc.md");
      return expect(segments.length === 1, `区切りが増えている: ${JSON.stringify(segments)}`);
    },
  },
  {
    name: '二重引用の内側の $( は置換として扱い、閉じたら外側の区切りへ戻る',
    run() {
      const segments = splitCommandSegments(
        "grep -oE \"$(printf 'x')\" doc.md | awk '{print}' <(git ls-files) - | wc -l"
      );
      const words: string[] = [];
      for (const segment of segments) {
        const word = leadingWord(segment);
        if (word !== '') words.push(word);
      }
      return expect(
        JSON.stringify(words) === JSON.stringify(['printf', 'grep', 'git', 'awk', 'wc']),
        `先頭語の並びが想定と違う: ${JSON.stringify(words)}`
      );
    },
  },
  {
    name: '許容する綴りの一覧が空でない',
    run() {
      return expect(READ_ONLY_COMMANDS.length > 0, 'READ_ONLY_COMMANDS が空');
    },
  },
];

// ============================================================================
// 集計と検出に絞り込みの経路を作らせない（タスク 115.230 の作法）
// ============================================================================

interface InventoryEntry {
  readonly name: string;
  /** 見張るか。`'unwatched'` は理由の宣言を要する */
  readonly watched: 'body' | 'unwatched';
  readonly reason: string;
}

/**
 * 本体の関数の台帳
 *
 * **{@link DECLARATION} が本体から拾える関数宣言の一覧と双方向で一致していなければならない。**
 * 片方向だけだと、新設した関数が黙って見張りの外へ落ちる（タスク 115.230 の `scanLine` の型）。
 *
 * `'unwatched'` の関数は、検出の合否を左右しないもの（小道具・報告の整形）か、
 * 専用の対照を別に持つものに限る。**理由を書かない `'unwatched'` は認めない。**
 */
const EXECUTABLE_FUNCTION_INVENTORY: readonly InventoryEntry[] = [
  {
    name: 'splitCommandSegments',
    watched: 'unwatched',
    reason: '専用の対照が先頭語の並びを固定する',
  },
  { name: 'leadingWord', watched: 'unwatched', reason: '同上（先頭語の並びの対照が通る）' },
  { name: 'vocabularyFailures', watched: 'body', reason: '綴りの検出' },
  {
    name: 'isNonEmptyString',
    watched: 'unwatched',
    reason: '述語一つ。誤れば形の検出が全滅して対照が落ちる',
  },
  { name: 'isEntryObject', watched: 'body', reason: '壊れた宣言項目の門番（タスク 115.272）' },
  {
    name: 'fieldText',
    watched: 'unwatched',
    reason:
      '欄の読み出し一つ。空として読んだ欄は shapeFailures が漏れなく咎めるため、誤れば壊れた項目の対照が落ちる（タスク 115.272）',
  },
  {
    name: 'divergenceOf',
    watched: 'body',
    reason: '壊れた divergence の読み替え（タスク 115.272）',
  },
  { name: 'loadManifest', watched: 'body', reason: '母集団の供給元' },
  { name: 'shapeFailures', watched: 'body', reason: '宣言の形の検出' },
  { name: 'anchorFailures', watched: 'body', reason: '錨と字面の検出' },
  { name: 'measurementFailures', watched: 'body', reason: '突き合わせの検出' },
  {
    name: 'hollowCommandFailures',
    watched: 'body',
    reason: '宣言の空洞化の検出（タスク 115.271）',
  },
  { name: 'pushEntryFindings', watched: 'body', reason: '一件ぶんの集計' },
  { name: 'pushPopulationFindings', watched: 'body', reason: '母集団の前提の集計' },
  { name: 'pushDivergenceRatchetFindings', watched: 'body', reason: '宣言との突き合わせの集計' },
  { name: 'judge', watched: 'body', reason: '集計の中核' },
  { name: 'documentFigureOf', watched: 'body', reason: '既定値の決定' },
  { name: 'anchoredLines', watched: 'body', reason: '錨の走査' },
  { name: 'countFigureOnLine', watched: 'body', reason: '字面の判定と多義の検出' },
  { name: 'documentRenderingOf', watched: 'body', reason: '記法の既定の決定' },
  { name: 'duplicatedIds', watched: 'body', reason: '重複の検出' },
  { name: 'countEntriesForFile', watched: 'body', reason: '所管の文書の被覆の数え方' },
  { name: 'countStaleDivergences', watched: 'body', reason: '宣言された食い違いの数え方' },
  {
    name: 'formatSummaryLine',
    watched: 'unwatched',
    reason:
      '要約行の整形のみで判定に関わらない（タスク 115.301 が切り出した）。絞り込みの経路を持たないため本規則群では見張らず、専用の対照二件で塞ぐ——合成の三値から逐語を組み立てることを確かめる対照と、execute が本関数を呼んでいることを確かめる結線の対照である',
  },
  {
    name: 'makeFinding',
    watched: 'unwatched',
    reason: '失敗の整形のみ。落とせば対照が名指しを失って落ちる',
  },
  { name: 'makeGlobalFinding', watched: 'unwatched', reason: '同上' },
  {
    name: 'makeBrokenEntryFinding',
    watched: 'unwatched',
    reason: '失敗の整形のみ。落とせば壊れた項目の対照が指摘を失って落ちる（タスク 115.272）',
  },
  {
    name: 'makeThrownFinding',
    watched: 'unwatched',
    reason: '同上（最後の網が積む失敗の整形。タスク 115.272）',
  },
  { name: 'runMeasurement', watched: 'body', reason: 'コマンドの実行と失敗の判定' },
  {
    name: 'runOutsideRepository',
    watched: 'body',
    reason: '空洞化の検出が使う対照（リポジトリの外での実行）',
  },
  {
    name: 'measureAll',
    watched: 'unwatched',
    reason:
      '判定（findings）には関わらないが bash -c を呼ぶ第二の実行経路である。以前の版は綴りの検査を参照せず、--verbose で許容外のコマンドを実行していた。現在は vocabularyFailures で塞いであり、専用の対照「--verbose でも許容外の綴りは実行されない」が痕跡ファイルの個数で固定する',
  },
  {
    name: 'manifestPathFrom',
    watched: 'unwatched',
    reason: '引数の解釈のみ。誤れば実データの対照が落ちる',
  },
  {
    name: 'execute',
    watched: 'body',
    reason: '報告と終了コード（findings / errors に触れる文だけを見る）',
  },
  { name: 'main', watched: 'unwatched', reason: 'execute の返り値を process.exit へ渡すだけ' },
];

/** 本体から関数宣言を拾う綴り */
const DECLARATION = /^(?:export )?function ([A-Za-z0-9_]+)\(/gm;

const NARROWING =
  /\.filter\(|\.slice\(|\.splice\(|\.find\(|\.some\(|\.every\(|\.includes\(|new Set|new Map|\bcontinue\b|\bdelete\b/;

interface BodyRule {
  readonly label: string;
  readonly declaration: string;
  /** `'whole-body'` は空でない全行を突き合わせる。正規表現はその語に触れる文だけを見る */
  readonly watched: 'whole-body' | RegExp;
  readonly allowed: readonly string[];
  readonly forbidAllNarrowing: boolean;
}

function readEntrySource(): string {
  return fs.readFileSync(ENTRY_PATH, 'utf8');
}

/**
 * 宣言から本体を取り出す
 *
 * **注釈を取り除かない。** 素朴な注釈除去は文字列リテラルの中の `//` を注釈の始まりと
 * 見なして以降を消すため、断片の照合が盲になる（タスク 115.231 のレビューが実測した形）。
 * ここでは全行を許可形と突き合わせるので、注釈の行があればそれ自体が想定外の行として落ちる。
 * 本体の各関数は注釈を持たない形で書いてある。
 */
function extractBody(source: string, declaration: string): string | null {
  const at = source.indexOf(declaration);
  if (at < 0) return null;
  const open = source.indexOf('{', at + declaration.length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

const BODY_RULES: readonly BodyRule[] = [
  {
    label: 'judge',
    declaration:
      'export function judge(root: string, entries: readonly ManifestEntry[]): Finding[]',
    watched: 'whole-body',
    allowed: [
      'const findings: Finding[] = [];',
      'pushPopulationFindings(entries, findings);',
      'let position = 0;',
      'for (const entry of entries) {',
      'position += 1;',
      'try {',
      'pushEntryFindings(root, entry, findings);',
      '} catch (error) {',
      'findings.push(makeThrownFinding(position, error));',
      '}',
      'pushDivergenceRatchetFindings(entries, findings);',
      'return findings;',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'pushPopulationFindings',
    declaration:
      'function pushPopulationFindings(entries: readonly ManifestEntry[], findings: Finding[]): void',
    watched: 'whole-body',
    allowed: [
      'if (entries.length === 0) {',
      "findings.push(makeGlobalFinding('宣言が 0 件です（この状態を合格にしてはなりません）'));",
      '}',
      'if (entries.length < MINIMUM_ENTRIES) {',
      'findings.push(',
      'makeGlobalFinding(',
      '`宣言が ${entries.length} 件で下限 ${MINIMUM_ENTRIES} 件を下回ります（MINIMUM_ENTRIES を見よ）`',
      ')',
      ');',
      'if (entries.length > MINIMUM_ENTRIES) {',
      '`宣言が ${entries.length} 件で、宣言した下限 ${MINIMUM_ENTRIES} 件を上回ります（遊び ${entries.length - MINIMUM_ENTRIES} 件）。下限は宣言の件数ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの無言の削除を吸収します。MINIMUM_ENTRIES を ${entries.length} 件へ上げてください。`',
      'for (const duplicated of duplicatedIds(entries)) {',
      'findings.push(makeGlobalFinding(`id \\`${duplicated}\\` が重複しています`));',
      'for (const document of GOVERNED_DOCUMENTS) {',
      'if (countEntriesForFile(entries, document) === 0) {',
      'findings.push(makeGlobalFinding(`${document} を指す宣言が一件もありません`));',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'pushDivergenceRatchetFindings',
    declaration: 'function pushDivergenceRatchetFindings(',
    watched: 'whole-body',
    allowed: [
      'const stale = countStaleDivergences(entries);',
      'if (stale > DECLARED_STALE_DOCUMENT_FIGURES) {',
      'findings.push(',
      'makeGlobalFinding(',
      '`文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を超えています`',
      ')',
      ');',
      '}',
      'if (stale < DECLARED_STALE_DOCUMENT_FIGURES) {',
      '`文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を下回ります（解消したなら DECLARED_STALE_DOCUMENT_FIGURES を締めてください）`',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'pushEntryFindings',
    declaration:
      'function pushEntryFindings(root: string, entry: ManifestEntry, findings: Finding[]): void',
    watched: 'whole-body',
    allowed: [
      'if (!isEntryObject(entry)) {',
      'findings.push(makeBrokenEntryFinding(entry));',
      'return;',
      'for (const message of shapeFailures(entry)) {',
      'findings.push(makeFinding(entry, message));',
      '}',
      "const vocabulary = vocabularyFailures(String(entry.command ?? ''));",
      'for (const message of vocabulary) {',
      'for (const message of anchorFailures(root, entry)) {',
      'if (vocabulary.length > 0) return;',
      "const outcome = runMeasurement(root, String(entry.command ?? ''));",
      'for (const message of measurementFailures(entry, outcome)) {',
      'for (const message of hollowCommandFailures(entry, outcome)) {',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'shapeFailures',
    declaration: 'function shapeFailures(entry: ManifestEntry): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      "if (!isNonEmptyString(entry.id)) failures.push('id が空です');",
      "if (!isNonEmptyString(entry.file)) failures.push('file が空です');",
      "if (!isNonEmptyString(entry.anchor)) failures.push('anchor が空です');",
      "if (!isNonEmptyString(entry.command)) failures.push('command が空です');",
      "if (!isNonEmptyString(entry.expected)) failures.push('expected が空です');",
      'const figure = documentFigureOf(entry);',
      'const divergence = divergenceOf(entry);',
      'if (entry.documentFigure !== undefined && !isNonEmptyString(entry.documentFigure)) {',
      "failures.push('documentFigure が空です');",
      '}',
      'if (entry.documentRendering !== undefined && !isNonEmptyString(entry.documentRendering)) {',
      "failures.push('documentRendering が空です');",
      'if (entry.divergence !== undefined && divergence === undefined) {',
      "failures.push('divergence が欄を持つオブジェクトではありません');",
      'if (figure !== entry.expected && divergence === undefined) {',
      'failures.push(',
      '`documentFigure \\`${figure}\\` が expected \\`${String(entry.expected)}\\` と異なるのに divergence の宣言がありません`',
      ');',
      'if (figure === entry.expected && divergence !== undefined) {',
      "'divergence を宣言していますが documentFigure と expected が一致しています（宣言が対象より長生きしています。divergence を外してください）'",
      'if (divergence !== undefined && !isNonEmptyString(divergence.reason)) {',
      "failures.push('divergence の reason が空です');",
      'const rendering = documentRenderingOf(entry);',
      'if (!rendering.includes(figure)) {',
      '`documentRendering \\`${rendering}\\` が documentFigure \\`${figure}\\` を含みません（記法と値が切り離されています）`',
      'if (entry.documentRendering !== undefined && entry.documentRendering === figure) {',
      "'documentRendering が documentFigure と同じです（既定と同じ宣言は外してください）'",
      "if (divergence !== undefined && divergence.kind !== 'stale') {",
      'failures.push(`divergence の kind \\`${String(divergence.kind)}\\` は宣言されていません`);',
      'return failures;',
    ],
    forbidAllNarrowing: false, // rendering.includes は文字列の包含であって検出の間引きではない
  },
  {
    label: 'anchorFailures',
    declaration: 'function anchorFailures(root: string, entry: ManifestEntry): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      'const absolute = path.resolve(root, fieldText(entry.file));',
      'let content: string;',
      'try {',
      "content = fs.readFileSync(absolute, 'utf8');",
      '} catch {',
      'failures.push(`file ${String(entry.file)} を読めません`);',
      'return failures;',
      '}',
      'const matched = anchoredLines(content, fieldText(entry.anchor));',
      'if (matched.length === 0) {',
      'failures.push(`anchor が ${entry.file} に見つかりません: ${entry.anchor}`);',
      'if (matched.length > 1) {',
      'failures.push(',
      '`anchor が ${entry.file} の ${matched.length} 行に当たります（一意に定まる断片にしてください）: ${entry.anchor}`',
      ');',
      'const figure = documentRenderingOf(entry);',
      "const occurrences = countFigureOnLine(matched[0] ?? '', figure);",
      'if (occurrences === 0) {',
      '`anchor の行が documentFigure \\`${figure}\\` を載せていません（文書側が書き換わった疑いがあります）: ${entry.anchor}`',
      'if (occurrences > 1) {',
      '`anchor の行に documentFigure \\`${figure}\\` が ${occurrences} 箇所あり、どれを指すか定まりません（記法ごと宣言してください。例: \\`3\\` ではなく \\`\\\\\\`3\\\\\\`\\`）: ${entry.anchor}`',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'measurementFailures',
    declaration:
      'function measurementFailures(entry: ManifestEntry, outcome: MeasurementOutcome): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      "if (outcome.failure !== '') {",
      'failures.push(outcome.failure);',
      'return failures;',
      '}',
      'if (outcome.output !== entry.expected) {',
      'failures.push(',
      '`${entry.file} の「${entry.anchor}」が引く値が現況と食い違います: expected=\\`${entry.expected}\\` actual=\\`${outcome.output}\\``',
      ');',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'hollowCommandFailures',
    declaration:
      'function hollowCommandFailures(entry: ManifestEntry, inside: MeasurementOutcome): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      "if (inside.failure !== '') return failures;",
      "const outside = runOutsideRepository(String(entry.command ?? ''));",
      "if (outside.failure === '' && outside.output === inside.output) {",
      'failures.push(',
      "`command がリポジトリの外でも同じ値 \\`${outside.output}\\` を出します（この宣言は現況を測っていません。空洞化の経路。冒頭の「見ないこと（限界）」を見よ）: ${String(entry.command ?? '')}`",
      ');',
      '}',
      'return failures;',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'runOutsideRepository',
    declaration: 'export function runOutsideRepository(command: string): MeasurementOutcome',
    watched: 'whole-body',
    allowed: [
      "const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-outside-'));",
      'try {',
      'return runMeasurement(directory, command);',
      '} finally {',
      'fs.rmSync(directory, { recursive: true, force: true });',
      '}',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'vocabularyFailures',
    declaration: 'function vocabularyFailures(command: string): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      'for (const segment of splitCommandSegments(command)) {',
      'const word = leadingWord(segment);',
      "if (word === '') continue;",
      'if (READ_ONLY_COMMANDS.includes(word)) continue;',
      'failures.push(',
      '`コマンドの区切り「${segment.trim()}」の先頭語 \\`${word}\\` が READ_ONLY_COMMANDS にありません`',
      ');',
      '}',
      'return failures;',
    ],
    forbidAllNarrowing: false,
  },
  {
    label: 'isEntryObject',
    declaration: 'function isEntryObject(value: unknown): boolean',
    watched: 'whole-body',
    allowed: ["return typeof value === 'object' && value !== null && !Array.isArray(value);"],
    forbidAllNarrowing: false,
  },
  {
    label: 'divergenceOf',
    declaration: 'function divergenceOf(entry: ManifestEntry): Divergence | undefined',
    watched: 'whole-body',
    allowed: [
      'if (!isEntryObject(entry)) return undefined;',
      'const value: unknown = entry.divergence;',
      'return isEntryObject(value) ? (value as Divergence) : undefined;',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'loadManifest',
    declaration: 'export function loadManifest(manifestPath: string): LoadedManifest',
    watched: 'whole-body',
    allowed: [
      'const entries: ManifestEntry[] = [];',
      'const errors: string[] = [];',
      'let raw: string;',
      'try {',
      "raw = fs.readFileSync(manifestPath, 'utf8');",
      '} catch {',
      'errors.push(`宣言 ${manifestPath} を読めません`);',
      'return { entries, errors };',
      '}',
      'let parsed: unknown;',
      'parsed = JSON.parse(raw);',
      '} catch (error) {',
      'errors.push(`宣言 ${manifestPath} が JSON として読めません: ${String(error)}`);',
      'const container = parsed as { entries?: unknown };',
      'if (!Array.isArray(container.entries)) {',
      'errors.push(`宣言 ${manifestPath} が entries の配列を持ちません`);',
      'for (const candidate of container.entries) {',
      'entries.push(candidate as ManifestEntry);',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'anchoredLines',
    declaration: 'export function anchoredLines(content: string, anchor: string): string[]',
    watched: 'whole-body',
    allowed: [
      'const matched: string[] = [];',
      "for (const line of content.split('\\n')) {",
      'if (line.includes(anchor)) matched.push(line);',
      '}',
      'return matched;',
    ],
    forbidAllNarrowing: false,
  },
  {
    label: 'countFigureOnLine',
    declaration: 'export function countFigureOnLine(line: string, figure: string): number',
    watched: 'whole-body',
    allowed: [
      'const pattern = /^\\d+$/.test(figure)',
      "? new RegExp(`(?<![0-9])${figure}(?![0-9])`, 'g')",
      ": new RegExp(figure.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'g');",
      'let count = 0;',
      'let match: RegExpExecArray | null;',
      'while ((match = pattern.exec(line)) !== null) {',
      'count += 1;',
      'if (match.index === pattern.lastIndex) pattern.lastIndex += 1;',
      '}',
      'return count;',
    ],
    forbidAllNarrowing: false,
  },
  {
    label: 'documentFigureOf',
    declaration: 'export function documentFigureOf(entry: ManifestEntry): string',
    watched: 'whole-body',
    allowed: ['return fieldText(entry.documentFigure ?? entry.expected);'],
    forbidAllNarrowing: true,
  },
  {
    label: 'documentRenderingOf',
    declaration: 'export function documentRenderingOf(entry: ManifestEntry): string',
    watched: 'whole-body',
    allowed: ['return fieldText(entry.documentRendering ?? documentFigureOf(entry));'],
    forbidAllNarrowing: true,
  },
  {
    label: 'countEntriesForFile',
    declaration:
      'export function countEntriesForFile(entries: readonly ManifestEntry[], file: string): number',
    watched: 'whole-body',
    allowed: [
      'let count = 0;',
      'for (const entry of entries) {',
      'if (isEntryObject(entry) && entry.file === file) count += 1;',
      '}',
      'return count;',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'countStaleDivergences',
    declaration: 'export function countStaleDivergences(entries: readonly ManifestEntry[]): number',
    watched: 'whole-body',
    allowed: [
      'let count = 0;',
      'for (const entry of entries) {',
      "if (divergenceOf(entry)?.kind === 'stale') count += 1;",
      '}',
      'return count;',
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'duplicatedIds',
    declaration: 'export function duplicatedIds(entries: readonly ManifestEntry[]): string[]',
    watched: 'whole-body',
    allowed: [
      'const seen = new Set<string>();',
      'const duplicated: string[] = [];',
      'for (const entry of entries) {',
      'if (!isEntryObject(entry)) continue;',
      "const id = String(entry.id ?? '');",
      'if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);',
      'seen.add(id);',
      '}',
      'return duplicated;',
    ],
    forbidAllNarrowing: false,
  },
  {
    label: 'runMeasurement',
    declaration:
      'export function runMeasurement(root: string, command: string): MeasurementOutcome',
    watched: 'whole-body',
    allowed: [
      "const result = spawnSync('bash', ['-c', command], {",
      'cwd: root,',
      "encoding: 'utf8',",
      'timeout: COMMAND_TIMEOUT_MS,',
      'maxBuffer: 16 * 1024 * 1024,',
      '});',
      'if (result.error !== undefined) {',
      "return { output: '', failure: `コマンドを起動できません: ${String(result.error)}` };",
      '}',
      'if (result.status === null) {',
      "return { output: '', failure: `コマンドが時間切れまたは信号で終了しました: ${command}` };",
      'if (result.status !== 0) {',
      'return {',
      "output: '',",
      'failure: `コマンドが終了コード ${result.status} で失敗しました: ${command}${',
      "result.stderr.trim().length > 0 ? ` / ${result.stderr.trim()}` : ''",
      '}`,',
      '};',
      "return { output: result.stdout.trim(), failure: '' };",
    ],
    forbidAllNarrowing: true,
  },
  {
    label: 'execute',
    declaration: 'export function execute(argv: readonly string[], root = process.cwd()): number',
    watched: /findings|errors/,
    allowed: [
      'const { entries, errors } = loadManifest(manifestPath);',
      'const findings = judge(root, entries);',
      'errors,',
      'findings,',
      'return errors.length + findings.length > 0 ? 1 : 0;',
      'if (errors.length + findings.length > 0) {',
      'for (const error of errors) console.error(`   - ${error}`);',
      'for (const finding of findings) console.error(`   - [${finding.id}] ${finding.message}`);',
    ],
    forbidAllNarrowing: false,
  },
];

function checkInventoryMatchesSource(): string[] {
  const failures: string[] = [];
  const source = readEntrySource();
  const declared: string[] = [];
  DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECLARATION.exec(source)) !== null) {
    declared.push(match[1] ?? '');
  }
  if (declared.length === 0) {
    return ['本体から関数宣言を一つも拾えない（抽出の綴りが壊れている）'];
  }
  const inInventory = new Set<string>();
  for (const entry of EXECUTABLE_FUNCTION_INVENTORY) inInventory.add(entry.name);
  const inSource = new Set(declared);
  for (const name of declared) {
    if (!inInventory.has(name)) failures.push(`本体の関数 ${name} が台帳にない`);
  }
  for (const entry of EXECUTABLE_FUNCTION_INVENTORY) {
    if (!inSource.has(entry.name)) failures.push(`台帳の関数 ${entry.name} が本体にない`);
    if (entry.reason.trim().length === 0) failures.push(`台帳の ${entry.name} に理由が無い`);
  }
  const watchedNames = new Set<string>();
  for (const rule of BODY_RULES) watchedNames.add(rule.label);
  for (const entry of EXECUTABLE_FUNCTION_INVENTORY) {
    if (entry.watched === 'body' && !watchedNames.has(entry.name)) {
      failures.push(`台帳が見張ると宣言した ${entry.name} に見張りの規則が無い`);
    }
    if (entry.watched === 'unwatched' && watchedNames.has(entry.name)) {
      failures.push(`台帳が見張らないと宣言した ${entry.name} に見張りの規則がある`);
    }
  }
  return failures;
}

/**
 * 検出結果を返す前に**絞り込む経路が無い**こと
 *
 * 語名の一致で見ると名前を変えた絞り込みで擦り抜けるため、`findings` と母集団に対して
 * 何をしているかを見る。見張る本体が 0 件なら失敗にする（空の母集団を合格にしない。第3原則）。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readEntrySource();
  if (BODY_RULES.length === 0) {
    return ['絞り込みの検査が本体を一つも見張っていない'];
  }
  for (const rule of BODY_RULES) {
    const body = extractBody(source, rule.declaration);
    if (body === null) {
      failures.push(`${rule.label} の宣言を本体から取り出せない: ${rule.declaration}`);
      continue;
    }
    if (rule.forbidAllNarrowing && NARROWING.test(body)) {
      failures.push(`${rule.label} の本体に絞り込みに使える操作がある`);
    }
    const statements: string[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      if (rule.watched === 'whole-body') statements.push(trimmed);
      else if (rule.watched.test(trimmed)) statements.push(trimmed);
    }
    if (statements.length === 0) {
      failures.push(`${rule.label} で見張る文が 0 件（見張りが空振りしている）`);
    }
    for (const statement of statements) {
      if (!rule.allowed.includes(statement)) {
        failures.push(`${rule.label} が検出結果／母集団へ想定外の操作をしている: ${statement}`);
      }
    }
  }
  return failures;
}

const NARROWING_GUARD: TestCase[] = [
  { name: '台帳と本体の関数宣言が双方向で一致する', run: checkInventoryMatchesSource },
  { name: '集計と検出の本体に絞り込みの経路が無い', run: checkNoFindingsNarrowing },
];

// ============================================================================
// 挙動（本体をサブプロセスとして起動する）
// ============================================================================

/**
 * 一致1件・不一致1件・正しく宣言された食い違い（宣言 + 1 件）の仮マニフェストを与え、
 * 終了コードと報告件数を固定する
 *
 * 報告の内訳は、不一致 1 件・下限割れ 1 件・**所管の文書の未被覆（{@link GOVERNED_DOCUMENTS}
 * の件数ぶん）**・宣言された食い違いの超過 1 件である。**前提が崩れた仮マニフェストを
 * 合格にしないこと**がここで固定される（宣言が下限 29 件を下回るため、不一致が無くても赤い）。
 * 食い違いの件数は {@link DECLARED_STALE_DOCUMENT_FIGURES} から組み立てるため、
 * 定数を締めても緩めても内訳は変わらない（タスク 115.270 が定数を 4 から 0 へ締めた際、
 * 「不足 1 件」が構成不能になったため「超過 1 件」へ改めた）。
 *
 * **未被覆の件数は手で写さず {@link GOVERNED_DOCUMENTS} から導く**（タスク 115.276）。
 * 是正前は `4` を貼っていたため、所管の文書を一件足しただけでこの確認が落ちた。
 * 導く形にすると、所管を増やす変更が本確認の書き換えを要求しなくなる一方、
 * 未被覆の指摘が一件でも出なくなれば件数が合わずに落ちる。
 */
function checkSubprocessBehaviour(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-run-'));
  try {
    fs.writeFileSync(path.join(directory, 'doc.md'), `${SAMPLE_DOCUMENT.join('\n')}\n`);
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        entries: [
          {
            id: 'agrees',
            file: path.join(directory, 'doc.md'),
            anchor: '基準の行',
            command: readFigure('7'),
            expected: '7',
          },
          {
            id: 'disagrees',
            file: path.join(directory, 'doc.md'),
            anchor: '基準の行',
            command: readFigure('8'),
            expected: '7',
          },
          ...staleEntries(DECLARED_STALE_DOCUMENT_FIGURES + 1).map((entry) => ({
            ...entry,
            file: path.join(directory, 'doc.md'),
          })),
        ],
      })
    );
    const result = spawnSync(
      process.execPath,
      [TSX_CLI, ENTRY_PATH, `--manifest=${manifestPath}`],
      {
        // 見本の文書を起点にする。`command` が `doc.md` を相対で読むためである
        // （タスク 115.271。`printf '<数字>'` の素材は空洞化の検出に掛かるので使えない）。
        cwd: directory,
        encoding: 'utf-8',
        env: { ...process.env },
      }
    );
    if (result.status === null) {
      return ['本体の起動に失敗した'];
    }
    const reported: string[] = [];
    for (const line of String(result.stderr).split('\n')) {
      if (line.startsWith('   - ')) reported.push(line);
    }
    failures.push(...expect(result.status === 1, `終了コードが 1 でない: ${result.status}`));
    // 不一致 1 件・下限割れ 1 件・宣言された食い違いの超過 1 件 + 所管の文書の未被覆（文書の数だけ）
    const expectedReports = 3 + GOVERNED_DOCUMENTS.length;
    failures.push(
      ...expect(
        reported.length === expectedReports,
        `報告件数が ${expectedReports} 件でない: ${reported.length}\n${result.stderr}`
      )
    );
    failures.push(
      ...expect(
        String(result.stderr).includes('[disagrees]'),
        `不一致の宣言を名指ししていない:\n${result.stderr}`
      )
    );
    failures.push(
      ...expect(
        !String(result.stderr).includes('[agrees]'),
        `一致している宣言を告発している:\n${result.stderr}`
      )
    );
    failures.push(
      ...expect(
        String(result.stdout).includes(`宣言 ${2 + DECLARED_STALE_DOCUMENT_FIGURES + 1} 件`),
        `要約行が宣言の件数を出していない:\n${result.stdout}`
      )
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return failures;
}

/** 読めない宣言を合格にしないこと */
function checkUnreadableManifestFails(): string[] {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-bad-'));
  try {
    const broken = path.join(directory, 'broken.json');
    fs.writeFileSync(broken, '{ これは JSON ではない');
    const loaded = loadManifest(broken);
    const missing = loadManifest(path.join(directory, 'absent.json'));
    const shapeless = path.join(directory, 'shapeless.json');
    fs.writeFileSync(shapeless, '{}');
    const noEntries = loadManifest(shapeless);
    return [
      ...expect(loaded.errors.length === 1, '壊れた JSON が合格している'),
      ...expect(missing.errors.length === 1, '読めない宣言が合格している'),
      ...expect(noEntries.errors.length === 1, 'entries を持たない宣言が合格している'),
    ];
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * `--verbose` / `--json --verbose` でも許容外の綴りは実行されない
 *
 * `judge` の側だけを見る対照（上の「判定の経路では実行されない」）は、報告の側の
 * `measureAll` を通らないため第二の実行経路を素通りさせる。以前の版はここが開いており、
 * `command` に `sh -c "touch <marker>"` を置いた仮マニフェストへ `--verbose` を与えると
 * 痕跡ファイルが 1 個できた（2026-09-01 に実測）。**本体をサブプロセスとして起動し**、
 * 三つの経路すべてで痕跡が 0 個であることを固定する。
 */
function checkVerboseDoesNotExecuteRejectedCommand(): string[] {
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const failures: string[] = [];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-verbose-'));
  try {
    fs.writeFileSync(path.join(directory, 'doc.md'), `${SAMPLE_DOCUMENT.join('\n')}\n`);
    const marker = path.join(directory, 'marker_from_verbose');
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        entries: [
          {
            id: 'rejected-spelling',
            file: path.join(directory, 'doc.md'),
            anchor: '基準の行',
            command: `sh -c "touch ${marker}"`,
            expected: '7',
          },
        ],
      })
    );
    const argumentVariants = [[], ['--verbose'], ['--json', '--verbose']];
    // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (argumentVariants.length === 0) {
      failures.push('素材 argumentVariants が空です（この確認が空振りしています）');
    }
    for (const extra of argumentVariants) {
      const label = extra.length === 0 ? '(既定)' : extra.join(' ');
      const result = spawnSync(
        process.execPath,
        [TSX_CLI, ENTRY_PATH, `--manifest=${manifestPath}`, ...extra],
        { cwd: ROOT, encoding: 'utf-8', env: { ...process.env } }
      );
      if (result.status === null) {
        failures.push(`${label} で本体の起動に失敗した`);
        continue;
      }
      failures.push(
        ...expect(result.status === 1, `${label} の終了コードが 1 でない: ${result.status}`)
      );
      failures.push(
        ...expect(!fs.existsSync(marker), `${label} で許容外のコマンドが実行された（痕跡がある）`)
      );
      const output = `${String(result.stdout)}${String(result.stderr)}`;
      failures.push(
        ...expect(
          output.includes('READ_ONLY_COMMANDS にありません'),
          `${label} が綴りの失敗を報告していない:\n${output}`
        )
      );
      if (extra.includes('--verbose')) {
        failures.push(
          ...expect(
            output.includes('綴りが許容外のため実行しません'),
            `${label} が「実行しません」と報告していない:\n${output}`
          )
        );
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 壊れた宣言項目でもスタックトレースを出さず、他の項目の指摘を報告すること（タスク 115.272）
 *
 * `judge` を直に呼ぶ対照は関数の戻り値しか見ないため、**押下前の関門で人が読むもの**——
 * 標準出力・標準エラー・終了コード——は固定できない。是正前（コミット `97948d3c`、
 * 2026-09-04 に実測）は、**本関数が書き出すのと同じ仮マニフェスト**——`{"id":"broken-object"}` ・
 * `null` ・ `"broken-string"` と正しい `tail` の 4 件——を `--manifest` で与えると、
 * `judge` が一件ごとの判定より先に母集団の集計を呼ぶため
 * `TypeError: Cannot read properties of null (reading 'id')`（`at duplicatedIds`）の
 * スタックトレースを 9 行出して終了コード 1 で落ち、**対応方法の案内も他の宣言の指摘も
 * 一切印字されなかった**。ここでは終了コード 1（安全側）を保ったまま、
 * スタックトレースが出ないことと、後ろの宣言の指摘が印字されることを求める。
 */
function checkBrokenEntryDoesNotAbortReport(): string[] {
  if (!fs.existsSync(TSX_CLI)) {
    return ['tsx の起動口が見つからない（確認できないため合格にしない）'];
  }
  const failures: string[] = [];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-measurement-broken-'));
  try {
    fs.writeFileSync(path.join(directory, 'doc.md'), `${SAMPLE_DOCUMENT.join('\n')}\n`);
    const manifestPath = path.join(directory, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        entries: [
          { id: 'broken-object' },
          null,
          'broken-string',
          {
            id: 'tail',
            file: 'doc.md',
            anchor: '基準の行',
            command: readFigure('8'),
            expected: '7',
          },
        ],
      })
    );
    const result = spawnSync(
      process.execPath,
      [TSX_CLI, ENTRY_PATH, `--manifest=${manifestPath}`],
      // 見本の文書を起点にする（`file` と `command` が `doc.md` を相対で読むため）。
      { cwd: directory, encoding: 'utf-8', env: { ...process.env } }
    );
    if (result.status === null) {
      return ['本体の起動に失敗した'];
    }
    const output = `${String(result.stdout)}${String(result.stderr)}`;
    failures.push(
      ...expect(
        result.status === 1,
        `終了コードが 1 でない（安全側が崩れている）: ${result.status}`
      )
    );
    failures.push(
      ...expect(
        !/\n\s+at /.test(output),
        `捕捉されない例外のスタックトレースが出ている:\n${output}`
      )
    );
    // JSON から作れる形は、最後の網（例外の受け止め）ではなく個別の判定が名指しで咎めること。
    // 網へ落ちると指摘は「判定が例外で中断しました」の一行になり、どの欄が壊れているかを失う。
    failures.push(
      ...expect(
        !output.includes('判定が例外で中断しました'),
        `JSON から作れる壊れた項目が最後の網へ落ちている（個別の指摘になっていない）:\n${output}`
      )
    );
    failures.push(
      ...expect(
        output.includes('file が空です'),
        `壊れた項目に対する形の指摘が報告へ到達していない:\n${output}`
      )
    );
    failures.push(
      ...expect(
        output.includes('actual=`8`'),
        `壊れた項目の後ろの宣言の指摘が報告へ到達していない:\n${output}`
      )
    );
    failures.push(
      ...expect(output.includes('対応方法:'), `対応方法の案内が印字されていない:\n${output}`)
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return failures;
}

const BEHAVIOUR: TestCase[] = [
  { name: '仮マニフェストに対する終了コードと報告件数が固定される', run: checkSubprocessBehaviour },
  {
    name: '壊れた宣言項目でもスタックトレースを出さず他の項目の指摘を報告する（タスク 115.272）',
    run: checkBrokenEntryDoesNotAbortReport,
  },
  {
    name: '--verbose / --json --verbose でも許容外の綴りは実行されない',
    run: checkVerboseDoesNotExecuteRejectedCommand,
  },
  { name: '読めない宣言は合格にしない', run: checkUnreadableManifestFails },
];

// ============================================================================
// 走査記録の宣言を版で固定する（タスク 115.273）
// ============================================================================

/**
 * 十二件の設計文書を走査する宣言のうち、**版で固定した**もの（完全一致）
 *
 * `#### 他スペックの設計文書の走査（タスク 115.234）` が印字する二十値
 * （十本の網 × 是正前 `6b84be3` / 是正後 `0f3c6d33`）にあたる。
 *
 * **なぜ版で固定するか（タスク 115.273 の判断。実測で決めた）。** 同じ二十値を
 * 作業ツリーを読む形（`grep ... $T`）で宣言すると、他スペックの設計文書を触った押下が
 * 本スペックの数値の測り直しで止まる。**その頻度を履歴で測った**——
 * 現場調査以外の `design.md`（`.kiro/specs` 配下の十二件）を触ったコミットは 56 件あり、
 * そのうち十本の網のいずれかの値が動いたのは **51 件（91.1%）**である
 * （コミット `01653132` の作業ツリーで 2026-09-04 に実測。手順は本スペックの
 * `design.md` の同節に置いた）。版で固定した宣言はこの 56 件のいずれでも動かない。
 *
 * **増やす向きも減らす向きも定数の書き換えを伴う**（{@link MINIMUM_ENTRIES} と同じ完全一致。
 * タスク 115.262 / 115.271 の作法）。
 */
const PINNED_FOREIGN_SCAN_DECLARATIONS = 20;

/**
 * 十二件の設計文書を**作業ツリーから**走査する宣言の数（完全一致）
 *
 * 現況は `unticketed-proposal-net-b` の一件だけである。この一件は他スペックの現況について
 * 述べる主張であり、版で固定すると主張そのものが成り立たない——ゆえに残す。
 * **代償は実測してある**——上の 56 件のうち、この一件の値が動いたのは **10 件（17.9%）**で
 * ある（同日・同じ版で実測）。十本の網を作業ツリー読みで足すと 51 件（91.1%）へ広がり、
 * うち 41 件はこの一件では止まらなかった押下である。
 *
 * **この定数はタスク 115.273 の判断の掛け金である。** 作業ツリーを読む走査を新たに足すと
 * ここが動き、代償を引き受ける決定が差分に現れる。**黙って足せない。**
 */
const LIVE_FOREIGN_SCAN_DECLARATIONS = 1;

/** 十二件の設計文書を走査する宣言の見分け（母集団の綴りと現場調査の除外の両方を持つ） */
function isForeignDesignScan(command: string): boolean {
  return command.includes('.kiro/specs/*/design.md') && command.includes('site-survey');
}

/** 版で固定してあること（`<版> -- ` の形で読む先の版を名指している） */
function isPinnedToRevision(command: string): boolean {
  return / [0-9a-f]{7,40} -- /.test(command);
}

/** 十二件の設計文書を走査する宣言のうち、版で固定した／していないものを数える */
function countForeignDesignScans(entries: readonly ManifestEntry[], pinned: boolean): number {
  let count = 0;
  for (const entry of entries) {
    const command = String(entry.command ?? '');
    if (!isForeignDesignScan(command)) continue;
    if (isPinnedToRevision(command) === pinned) count += 1;
  }
  return count;
}

const FOREIGN_SCAN_PINNING: TestCase[] = [
  {
    name: '走査記録の二十値が宣言され、いずれも版で固定されている',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const pinned = countForeignDesignScans(entries, true);
      return expect(
        pinned === PINNED_FOREIGN_SCAN_DECLARATIONS,
        `版で固定した走査の宣言が ${pinned} 件で、宣言した ${PINNED_FOREIGN_SCAN_DECLARATIONS} 件と一致しません` +
          '（PINNED_FOREIGN_SCAN_DECLARATIONS を見よ）'
      );
    },
  },
  {
    name: '作業ツリーを読む走査の宣言が宣言した件数ちょうどである',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const live = countForeignDesignScans(entries, false);
      return expect(
        live === LIVE_FOREIGN_SCAN_DECLARATIONS,
        `作業ツリーを読む走査の宣言が ${live} 件で、宣言した ${LIVE_FOREIGN_SCAN_DECLARATIONS} 件と一致しません` +
          '（LIVE_FOREIGN_SCAN_DECLARATIONS を見よ。代償の実測を読んでから動かすこと）'
      );
    },
  },
  {
    name: '版の名指しを外した宣言は「固定されている」と数えない',
    polarity: 'positive',
    run() {
      const pinnedCommand =
        "git grep -nE 'x' 0f3c6d33 -- '.kiro/specs/*/design.md' " +
        "':(exclude).kiro/specs/site-survey/design.md' | wc -l";
      const strippedCommand = pinnedCommand.replace(' 0f3c6d33 -- ', ' -- ');
      const sample = (command: string): ManifestEntry[] => [
        { id: 'sample', file: 'doc.md', anchor: 'a', command, expected: '1' },
      ];
      return [
        ...expect(
          countForeignDesignScans(sample(pinnedCommand), true) === 1,
          '版を名指した宣言が固定として数えられていない'
        ),
        ...expect(
          countForeignDesignScans(sample(strippedCommand), true) === 0,
          '版の名指しを外しても固定として数えられてしまう'
        ),
        ...expect(
          countForeignDesignScans(sample(strippedCommand), false) === 1,
          '版の名指しを外した宣言が作業ツリー読みとして数えられていない'
        ),
      ];
    },
  },
  {
    name: '現場調査の除外を持たない宣言は十二件の走査と数えない',
    polarity: 'positive',
    run() {
      const entries: ManifestEntry[] = [
        {
          id: 'all-thirteen',
          file: 'doc.md',
          anchor: 'a',
          command: 'ls .kiro/specs/*/design.md | wc -l',
          expected: '13',
        },
      ];
      return expect(
        countForeignDesignScans(entries, true) + countForeignDesignScans(entries, false) === 0,
        '十三件すべてを数える宣言が十二件の走査として数えられてしまう'
      );
    },
  },
];

// ============================================================================
// steering の実測記録を版で固定する（タスク 115.276）
// ============================================================================

/**
 * steering 文書の実測記録を宣言した件数のうち、**版で固定した**もの（完全一致）
 *
 * `.kiro/steering/development-discipline.md` の「記録が引く件数は提出時に測り直す」節が
 * 引く四値（`123 件` が 2 箇所、`62 文`、`18 ファイル`）にあたる。
 *
 * **なぜ本検査が steering を見るのか（タスク 115.276 の判断。実測で決めた）。**
 * 起票（115.276）の実測は「115.235 が是正した免除件数を旧値へ戻す変異を当てても五つの関門が
 * すべて EXIT=0 のまま」であった。**六つ目の関門（`check:steering-dir-counts`。115.275 が新設）
 * を加えて同じ変異を当て直しても、六つとも EXIT=0 のままである**——`123 件` → `119 件`、
 * `62 文 / 18 ファイル` → `35 文 / 9 ファイル` の三箇所を戻して測った
 * （コミット `079604bb`、2026-09-05 にリポジトリルートで実測）。115.275 の関門は
 * `structure.md` の**行単位の**規則であり、同書の散文（数値と実測日が別の行に分かれる形）を
 * 対象にしていないためである。
 *
 * **なぜ版で固定するのか（115.273 の作法へ揃えた）。** これらは「115.235 の提出時点の
 * 再実測」という**過去の版についての記録**であり、現況を名乗る主張ではない。作業ツリーを
 * 読む形で宣言すると、記録が指す版ではなく今日の値と突き合わせることになり、記録そのものが
 * 偽になる。実際 `check:cf-evidence` の母集団は記録の 62 文 / 18 ファイルに対し
 * 現況が **162 文 / 28 ファイル**である（同じコミット・同日に
 * `npm run check:cf-evidence:survey` の要約行で実測）。**作業ツリー読みなら着手時点で赤い。**
 *
 * 版は記録が書き込まれたコミット `114e3179` である。記録の本文が名指す `46f1138` は
 * **測った対象の版**であって記録が入った版ではない——`git log -S '提出時点の再実測は 123 件'
 * --oneline --reverse -- .kiro/steering/development-discipline.md` が挙げるのは `114e3179`
 * 一件である（同日に実測）。
 *
 * **この定数はタスク 115.276 の判断の掛け金である。** 増やす向きも減らす向きも定数の
 * 書き換えを伴う（115.262 / 115.271 / 115.273 の作法）。
 *
 * **保証しないこと（残余）**: 版で固定した命令が確かめるのは「記録が書かれた版でも同じ値で
 * あった」ことだけである。**その値が当時の実体と一致していたかは見ない**——`123 件` を
 * 当時の作業ツリーで測り直すには版を展開する必要があり、宣言の命令（読み取り専用の綴りに
 * 限る）では書けない。すなわち本宣言が塞ぐのは**記録の無言の書き換え**であって、
 * 記録が最初から誤っていた場合ではない。
 */
const PINNED_STEERING_RECORD_DECLARATIONS = 4;

/**
 * steering 文書を**作業ツリーから**測る宣言の数（完全一致）
 *
 * **0 件である。** steering に残る実測値のうち現況を名乗るものは規約 (b)（数値を落として
 * 数える手段を書く）へ移してあり、宣言に載せる現況の数値が無い。タスク 115.276 は
 * `product.md` の `141ストーリーファイル`（実測 157）をここへ載せる案を測ったうえで採らなかった
 * ——同じ値を作業ツリー読みで宣言すると、直近 500 コミットのうち **373 件（74.6%）**で
 * 押下が止まる（`git rev-list -n 500 HEAD` の各版で
 * `git ls-tree -r --name-only <版> | grep -c '\.stories\.tsx\?$'` を数えた。値の分布は
 * 141:64 / 142:60 / 157:127 / 158:62 / 159:95 / 162:9 / 163:61 / 164:22。
 * コミット `079604bb`、2026-09-05 に実測）。115.273 が受け入れた作業ツリー読み 1 件の代償が
 * 17.9% であったのと比べても四倍を超える。同値は `check:steering-dir-counts` の
 * 走査対象へ `product.md` を加えることで規約 (b) 側から守る。
 */
const LIVE_STEERING_RECORD_DECLARATIONS = 0;

/** steering 文書を指す宣言の見分け */
function isSteeringDeclaration(entry: ManifestEntry): boolean {
  return String(entry.file ?? '').startsWith('.kiro/steering/');
}

/** steering を指す宣言のうち、版で固定した／していないものを数える */
function countSteeringDeclarations(entries: readonly ManifestEntry[], pinned: boolean): number {
  let count = 0;
  for (const entry of entries) {
    if (!isSteeringDeclaration(entry)) continue;
    if (isPinnedToRevision(String(entry.command ?? '')) === pinned) count += 1;
  }
  return count;
}

const STEERING_RECORD_PINNING: TestCase[] = [
  {
    name: 'steering の実測記録が宣言され、いずれも版で固定されている',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const pinned = countSteeringDeclarations(entries, true);
      return expect(
        pinned === PINNED_STEERING_RECORD_DECLARATIONS,
        `版で固定した steering の宣言が ${pinned} 件で、宣言した ${PINNED_STEERING_RECORD_DECLARATIONS} 件と一致しません` +
          '（PINNED_STEERING_RECORD_DECLARATIONS を見よ）'
      );
    },
  },
  {
    name: 'steering を作業ツリーから測る宣言が宣言した件数ちょうどである',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const live = countSteeringDeclarations(entries, false);
      return expect(
        live === LIVE_STEERING_RECORD_DECLARATIONS,
        `steering を作業ツリーから測る宣言が ${live} 件で、宣言した ${LIVE_STEERING_RECORD_DECLARATIONS} 件と一致しません` +
          '（LIVE_STEERING_RECORD_DECLARATIONS を見よ。代償の実測を読んでから動かすこと）'
      );
    },
  },
  {
    name: 'steering 文書が本検査の所管に入っている',
    polarity: 'negative',
    run() {
      return expect(
        GOVERNED_DOCUMENTS.includes('.kiro/steering/development-discipline.md'),
        '`.kiro/steering/development-discipline.md` が GOVERNED_DOCUMENTS に在りません' +
          '（所管から外すと、同書を指す宣言を一件残らず削っても緑で通ります）'
      );
    },
  },
  {
    name: '設計文書を指す宣言は steering の宣言として数えない',
    polarity: 'positive',
    run() {
      const entries: ManifestEntry[] = [
        {
          id: 'design-side',
          file: '.kiro/specs/site-survey/design.md',
          anchor: 'a',
          command: "git grep -c x 114e3179 -- '.kiro/steering/development-discipline.md'",
          expected: '1',
        },
      ];
      return expect(
        countSteeringDeclarations(entries, true) + countSteeringDeclarations(entries, false) === 0,
        '設計文書を指す宣言が steering の宣言として数えられてしまう'
      );
    },
  },
  {
    name: '版の名指しを外した steering の宣言は「固定されている」と数えない',
    polarity: 'positive',
    run() {
      const pinnedCommand =
        "git grep -h -oE '再実測は [0-9]+ 件である' 114e3179 " +
        "-- .kiro/steering/development-discipline.md | grep -oE '[0-9]+'";
      const strippedCommand = pinnedCommand.replace(' 114e3179 -- ', ' -- ');
      const sample = (command: string): ManifestEntry[] => [
        {
          id: 'sample',
          file: '.kiro/steering/development-discipline.md',
          anchor: 'a',
          command,
          expected: '123',
        },
      ];
      return [
        ...expect(
          countSteeringDeclarations(sample(pinnedCommand), true) === 1,
          '版を名指した宣言が固定として数えられていない'
        ),
        ...expect(
          countSteeringDeclarations(sample(strippedCommand), true) === 0,
          '版の名指しを外しても固定として数えられてしまう'
        ),
        ...expect(
          countSteeringDeclarations(sample(strippedCommand), false) === 1,
          '版の名指しを外した宣言が作業ツリー読みとして数えられていない'
        ),
      ];
    },
  },
];

// ============================================================================
// 裁定記録を所管へ加えたこと（タスク 115.301）
// ============================================================================

/** 所管へ加えた裁定記録（タスク 115.301） */
const ADJUDICATION_RECORDS: readonly string[] = [
  'scripts/coverage-mark-adjudication.md',
  'scripts/exclusion-alternative-verification-adjudication.md',
];

/**
 * 裁定記録を指す宣言のうち、**版で固定した**ものの数（完全一致）
 *
 * **1 件である。** `scripts/coverage-mark-adjudication.md` の §4 の冒頭が引く
 * 「115.300 が改める前の指し先 150 件」だけが過去の版についての記録であり、版 `a639d314`
 * を名指す（115.273 の作法）。作業ツリーを読む形にすると、§4 は 115.300 が全件を書き換えた
 * 後であるため出力は `0` になり、記録が書いた瞬間に偽になる。
 *
 * **保証しないこと（残余）**: 版で固定した命令が確かめるのは「記録が指す版でも同じ値で
 * あった」ことだけである。当時の分類（55 件の内訳）が正しかったかは見ない。
 */
const PINNED_ADJUDICATION_RECORD_DECLARATIONS = 1;

/**
 * 裁定記録を指す宣言のうち、**作業ツリーから**測るものの数（完全一致）
 *
 * **5 件である。** いずれも記録が自分自身の表・自分自身の読み手を数える現況の主張であり、
 * 版で固定すると測り直しの契機が消える。内訳は `coverage-mark-adjudication.md` の
 * 読み手のファイル数と「決着済み」の箇条書きの数、
 * `exclusion-alternative-verification-adjudication.md` の §4 / §5 / §6 の三つの件数である。
 *
 * **代償を測ってから受け入れた。** このうち押下の頻度に効くのは読み手のファイル数だけで
 * あり、他の四件は当の記録を触らない限り動かない。読み手の側も、母集団を
 * `--include` で五つの拡張子へ絞ったうえで E2E の生成物を除いてあるため、実測で 10 件
 * である（コミット `5f1b8568` を起点に、本タスクの是正を当てた作業ツリーで 2026-09-06 に
 * リポジトリルートで実測）。115.276 が却下した `product.md` の案（直近 500 コミットのうち
 * 373 件で押下が止まる形）とは桁が違う。
 */
const LIVE_ADJUDICATION_RECORD_DECLARATIONS = 5;

/** 裁定記録を指す宣言の見分け */
function isAdjudicationDeclaration(entry: ManifestEntry): boolean {
  return ADJUDICATION_RECORDS.includes(String(entry.file ?? ''));
}

/**
 * 版の名指しの見分け（裁定記録の宣言用）
 *
 * `git grep <版> -- <パス>` の形と `git show <版>:<パス>` の形の両方を拾う。
 * {@link isPinnedToRevision} は前者しか見ないため、ここでは別に持つ。
 */
function isPinnedAdjudicationCommand(command: string): boolean {
  return / [0-9a-f]{7,40}(?: -- |:)/.test(command);
}

/** 裁定記録を指す宣言のうち、版で固定した／していないものを数える */
function countAdjudicationDeclarations(entries: readonly ManifestEntry[], pinned: boolean): number {
  let count = 0;
  for (const entry of entries) {
    if (!isAdjudicationDeclaration(entry)) continue;
    if (isPinnedAdjudicationCommand(String(entry.command ?? '')) === pinned) count += 1;
  }
  return count;
}

const ADJUDICATION_RECORD_GOVERNANCE: TestCase[] = [
  {
    name: '二つの裁定記録が本検査の所管に入っている',
    polarity: 'negative',
    run() {
      const missing = ADJUDICATION_RECORDS.filter((one) => !GOVERNED_DOCUMENTS.includes(one));
      return expect(
        missing.length === 0,
        `裁定記録が GOVERNED_DOCUMENTS に在りません: ${missing.join(' / ')}` +
          '（所管から外すと、当該記録を指す宣言を一件残らず削っても緑で通ります）'
      );
    },
  },
  {
    name: '裁定記録を版で固定して測る宣言が宣言した件数ちょうどである',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const pinned = countAdjudicationDeclarations(entries, true);
      return expect(
        pinned === PINNED_ADJUDICATION_RECORD_DECLARATIONS,
        `版で固定した裁定記録の宣言が ${pinned} 件で、宣言した ${PINNED_ADJUDICATION_RECORD_DECLARATIONS} 件と一致しません` +
          '（PINNED_ADJUDICATION_RECORD_DECLARATIONS を見よ）'
      );
    },
  },
  {
    name: '裁定記録を作業ツリーから測る宣言が宣言した件数ちょうどである',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const live = countAdjudicationDeclarations(entries, false);
      return expect(
        live === LIVE_ADJUDICATION_RECORD_DECLARATIONS,
        `裁定記録を作業ツリーから測る宣言が ${live} 件で、宣言した ${LIVE_ADJUDICATION_RECORD_DECLARATIONS} 件と一致しません` +
          '（LIVE_ADJUDICATION_RECORD_DECLARATIONS を見よ。代償の実測を読んでから動かすこと）'
      );
    },
  },
  {
    name: '版の名指しの有無で裁定記録の宣言を二つに分けられる',
    polarity: 'positive',
    run() {
      const sample = (file: string, command: string): ManifestEntry[] => [
        { id: 'sample', file, anchor: 'a', command, expected: '1' },
      ];
      const pinnedShow = 'git show a639d314:scripts/coverage-mark-adjudication.md | wc -l';
      const pinnedGrep = "git grep -c x a639d314 -- 'scripts/coverage-mark-adjudication.md'";
      const live = "grep -c '^- ' scripts/coverage-mark-adjudication.md";
      const record = 'scripts/coverage-mark-adjudication.md';
      const foreign = '.kiro/specs/site-survey/design.md';
      return [
        ...expect(
          countAdjudicationDeclarations(sample(record, pinnedShow), true) === 1,
          '`git show <版>:<パス>` の形が固定として数えられていない'
        ),
        ...expect(
          countAdjudicationDeclarations(sample(record, pinnedGrep), true) === 1,
          '`git grep <版> -- <パス>` の形が固定として数えられていない'
        ),
        ...expect(
          countAdjudicationDeclarations(sample(record, live), false) === 1,
          '作業ツリーを読む形が作業ツリー読みとして数えられていない'
        ),
        ...expect(
          countAdjudicationDeclarations(sample(foreign, live), true) +
            countAdjudicationDeclarations(sample(foreign, live), false) ===
            0,
          '裁定記録以外を指す宣言が裁定記録の宣言として数えられてしまう'
        ),
      ];
    },
  },
  {
    name: '要約行の印字が合成の三値から組み立てられる（定数へ畳む変異を落とす）',
    polarity: 'positive',
    run() {
      const rendered = formatSummaryLine(7, 3, 2);
      const expected = '   宣言 7 件 / 対象文書 3 件 / 文書側が古いと宣言した箇所 2 件';
      return [
        ...expect(
          rendered === expected,
          `要約行が合成の三値から組み立てられていない: \`${rendered}\``
        ),
        ...expect(
          formatSummaryLine(0, 0, 0) ===
            '   宣言 0 件 / 対象文書 0 件 / 文書側が古いと宣言した箇所 0 件',
          '要約行が零の三値で崩れる'
        ),
      ];
    },
  },
  {
    name: '要約行の整形関数が本体の印字経路へ結線されている',
    polarity: 'negative',
    run() {
      const source = readEntrySource();
      return [
        ...expect(
          source.includes(
            'console.log(formatSummaryLine(entries.length, GOVERNED_DOCUMENTS.length, stale));'
          ),
          '本体が formatSummaryLine を呼んでいません（整形関数だけが正しくても印字は塞げません）'
        ),
        ...expect(
          source.split('formatSummaryLine').length - 1 >= 2,
          'formatSummaryLine の宣言か呼び出しのどちらかが消えています'
        ),
      ];
    },
  },
];

// ============================================================================
// 実データの対照
// ============================================================================

const REAL_DATA: TestCase[] = [
  {
    name: '実マニフェストに対して判定が通る（宣言が現況と文書の字面の双方に一致している）',
    polarity: 'negative',
    run() {
      const { entries, errors } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const findings = judge(ROOT, entries);
      const rendered: string[] = [];
      for (const finding of findings) rendered.push(`[${finding.id}] ${finding.message}`);
      return [
        ...expect(errors.length === 0, `実マニフェストを読めない: ${JSON.stringify(errors)}`),
        ...expect(
          entries.length >= MINIMUM_ENTRIES,
          `実マニフェストが下限を下回る: ${entries.length}`
        ),
        ...expect(findings.length === 0, `実データで食い違う: ${JSON.stringify(rendered)}`),
      ];
    },
  },
  {
    name: '実マニフェストの全ての宣言が所管の文書を指している',
    polarity: 'negative',
    run() {
      const { entries } = loadManifest(path.join(ROOT, DEFAULT_MANIFEST_PATH));
      const failures: string[] = [];
      for (const entry of entries) {
        if (!GOVERNED_DOCUMENTS.includes(entry.file)) {
          failures.push(`${entry.id} が所管外の文書を指している: ${entry.file}`);
        }
      }
      return failures;
    },
  },
];

/**
 * 陽性対照・陰性対照の件数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ。タスク 115.271 が
 * 陽性 13→16・陰性 3→5 へ、タスク 115.272 が陽性 16→20 へ貼り直した）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く。
 * **タスク 115.273 が陽性 20→22・陰性 5→7 へ貼り直した**（走査記録の宣言を版で固定する
 * 対照 4 件を足したぶん。2026-09-04 に実測）。**タスク 115.276 が陽性 22→24・陰性 7→10 へ
 * 貼り直した**（steering の実測記録の宣言を版で固定する対照 5 件を足したぶん。
 * コミット `079604bb` の作業ツリーで 2026-09-05 に実測）。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_POSITIVE_CONTROLS = 26;
const MINIMUM_NEGATIVE_CONTROLS = 14;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ。タスク 115.271 の着手時点は
 * 宣言 31 件に対し現況 32 件で遊びが 1 件あった。同タスクが 115.262 の作法へ揃えて貼り直し、
 * タスク 115.272 が壊れた宣言項目の対照 5 件を足して 36→41 へ貼り直し、
 * タスク 115.273 が走査記録の宣言を版で固定する対照 4 件を足して 41→45 へ貼り直し、
 * タスク 115.276 が steering の実測記録の宣言を版で固定する対照 5 件を足して 45→50 へ
 * 貼り直した）。
 * 抽出は `npx tsx scripts/check-design-measurement-freshness.selftest.ts | tail -1` の出す値を
 * そのまま置く。**確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 本体 `check-design-measurement-freshness.ts` の指摘は文字列で組み立てられ、種別の直和型を
 * 持たない。導けないため件数で貼る。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_TOTAL_CASES = 56;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `main()` の中の `groups` を空にすると
 * `✅ 0/0 件の確認に成功しました` を出して EXIT=0 になった。**母集団が空の検査は何も主張して
 * いない。**
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形（115.252 の候補3）は配列
 * ごと空にすると関門も一緒に消える。`main()` の中、確認の実行より前に、配列の外側から貼る。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」と
 * 「要求した極性が 1 件以上残ること」までしか課せない（115.222 が陰性対照について書き残した
 * 限界と同じ形）。
 *
 * **もう一つの限界**: `main()` からこの関門の呼び出し自体を落とせば、関門は走らなくなる。
 * 呼び出しの直列性を構造で要求する形——115.242 が `check-design-path-references.selftest.ts`
 * に置いた「深さ 0・文の先頭・呼び出し直後の `;`」の三点——は、本タスクでは各ファイルへ
 * 展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 */
function guardControlsArePresent(groups: readonly TestGroup[]): void {
  const problems: string[] = [];

  if (groups.length === 0) {
    problems.push('対照群が一つも登録されていません（この自己検査は何も確かめていません）');
  }
  for (const group of groups) {
    if (group.cases.length === 0) {
      problems.push(`対照群「${group.title}」が空です（この群は何も確かめていません）`);
    }
  }

  // **極性の要求は宣言せず、無条件の規則と数で持つ（タスク 115.252。Critical #2 の一般形）。**
  // 群ごとに「必要な極性」を配列の属性で設定する形は、関門を配列リテラルで設定する形であり、
  // その配列を `[]` へ空化すれば要求ごと消える（115.252 の候補3 の自己隠蔽の変種）。
  //
  // **無条件の規則の定義域は群ではなく自己検査の全体に取る。** 実測（2026-09-03、リポジトリ
  // ルート）: 定義域を群に取って「極性を持つ要素がある群は陽性と陰性を各 1 件以上持つ」と
  // すると、`captured`/`not-captured` に分けた群は構成上どちらか一方の極性しか持たないため
  // 満たしようがなく、この形を当てた 9 ファイルのうち 7 ファイルが赤くなった。群の極性が
  // 均質であることは設計であって欠陥ではない。定義域を全体に上げれば規則は無条件のまま立つ。
  //
  // **片側が痩せる向きの変異は数で押さえる。** 数は空にできないため、配列リテラルを空化する
  // 変異作用素に対して構造的に免疫である（下限は現況ちょうど。余裕ゼロ）。
  const polarities = groups.flatMap((group) => group.cases.map((one) => one.polarity));
  if (polarities.some((one) => one !== undefined)) {
    if (!polarities.includes('positive')) {
      problems.push('陽性対照が 1 件もありません（検出器が何も検出しなくても緑になります）');
    }
    if (!polarities.includes('negative')) {
      problems.push('陰性対照が 1 件もありません（検出器が何にでも反応しても緑になります）');
    }
  }
  const positives = polarities.filter((one) => one === 'positive').length;
  const negatives = polarities.filter((one) => one === 'negative').length;
  if (positives < MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件しかありません（宣言の下限は ${MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '陽性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (positives > MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件で、宣言した下限 ${MINIMUM_POSITIVE_CONTROLS} 件を上回ります（遊び ${positives - MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_POSITIVE_CONTROLS を ${positives} 件へ上げてください。`
    );
  }
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (negatives > MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件で、宣言した下限 ${MINIMUM_NEGATIVE_CONTROLS} 件を上回ります（遊び ${negatives - MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_NEGATIVE_CONTROLS を ${negatives} 件へ上げてください。`
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (total > MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件で、宣言した下限 ${MINIMUM_TOTAL_CASES} 件を上回ります（遊び ${total - MINIMUM_TOTAL_CASES} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_TOTAL_CASES を ${total} 件へ上げてください。`
    );
  }

  // 対照の現況を一行で印字する（タスク 115.252）。関門の判定に使うのと同じ変数から出す。
  // `npx tsx scripts/list-control-polarity-floors.ts` はこの行を読み、下限を貼り直すときの
  // 元の値にする。一覧の側で数え直さないのは、判定と一覧が別々の真実を持たないためである。
  // 本自己検査群が閉じている範囲と閉じていない範囲（三層の記録）は
  // `scripts/check-counterfactual-evidence.selftest.ts` の
  // 「本自己検査群が閉じている範囲と、閉じていない範囲」の節に正典を置く（タスク 115.252）。
  console.log(
    `📋 対照の現況: 陽性対照 ${positives}/${MINIMUM_POSITIVE_CONTROLS} ・ ` +
      `陰性対照 ${negatives}/${MINIMUM_NEGATIVE_CONTROLS} ・ ` +
      `総数 ${total}/${MINIMUM_TOTAL_CASES}（現況/宣言の下限）`
  );

  if (problems.length > 0) {
    console.log(
      '\n❌ 自己検査の対照群そのものが欠けています（この状態で出る「合格」は意味を持ちません）'
    );
    for (const problem of problems) console.log(`   - ${problem}`);
    process.exit(1);
  }
}

function main(): void {
  const groups: TestGroup[] = [
    {
      title: '検出規則（緩める向きと狭めすぎる向き）',
      cases: DETECTION,
    },
    { title: '母集団が空なら失敗する', cases: NON_VACUITY },
    { title: 'コマンドの綴りの分割', cases: COMMAND_VOCABULARY },
    { title: '絞り込みの経路を作らせない', cases: NARROWING_GUARD },
    { title: '挙動（サブプロセス）', cases: BEHAVIOUR },
    { title: '走査記録の宣言を版で固定する', cases: FOREIGN_SCAN_PINNING },
    { title: 'steering の実測記録の宣言を版で固定する', cases: STEERING_RECORD_PINNING },
    {
      title: '裁定記録を所管へ加えた（宣言の線引きと要約行の印字）',
      cases: ADJUDICATION_RECORD_GOVERNANCE,
    },
    { title: '実データの対照', cases: REAL_DATA },
  ];

  console.log(
    '🔍 設計文書の実測値の鮮度検査 自己検査 (scripts/check-design-measurement-freshness.selftest.ts)'
  );
  // 対照群の配列の外側に置く関門。実行より前に、群そのものが在ることを確かめる。
  guardControlsArePresent(groups);
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = testCase.run();
      if (failures.length === 0) {
        console.log(`  ✅ ${testCase.name}`);
      } else {
        failed += 1;
        console.log(`  ❌ ${testCase.name}`);
        for (const failure of failures) console.log(`     - ${failure}`);
      }
    }
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
