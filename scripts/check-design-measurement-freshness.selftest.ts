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
 *   - **許容外の綴りは実行の入口が二つとも塞がっている**。実行の入口は
 *     `grep -n 'spawnSync(' scripts/check-design-measurement-freshness.ts` が 1 箇所
 *     （`runMeasurement`）を、`grep -n 'runMeasurement(' ...` が宣言 1 行と呼び出し 2 箇所
 *     （`measurementFailures` と `measureAll`）を挙げる——すなわち判定の経路と報告の経路の
 *     二つである（2026-09-01 に実測）。既定・`--verbose`・`--json --verbose` の三つを
 *     サブプロセスで起動し、`sh -c "touch <marker>"` の痕跡ファイルが 0 個であることを固定する
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
  judge,
  leadingWord,
  loadManifest,
  splitCommandSegments,
  type ManifestEntry,
} from './check-design-measurement-freshness.js';

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

/** 見本の文書。`基準の行` が唯一の錨で、`1815` は数字の境界を確かめるための行 */
const SAMPLE_DOCUMENT: readonly string[] = [
  '# 見本',
  '- 基準の行: 出力は 7 件である',
  '- 別の行: 1815 という数がある',
];

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
    command: "printf '7'",
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
        command: "printf '8'",
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
        const list = messagesFor(root, [baseEntry({ command: "printf '8'" })]);
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
            command: "printf '9'",
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
          baseEntry({ command: "printf '8'", expected: '8', documentFigure: '7' }),
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
            command: "printf '8'",
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
      return withDocument(['# 見本', '- 基準の行: 3 の節が 3 つある（出力が `3`）'], (root) => {
        const bare = messagesFor(root, [baseEntry({ command: "printf '3'", expected: '3' })]);
        const rendered = messagesFor(root, [
          baseEntry({ command: "printf '3'", expected: '3', documentRendering: '出力が `3`' }),
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
  { name: 'loadManifest', watched: 'body', reason: '母集団の供給元' },
  { name: 'shapeFailures', watched: 'body', reason: '宣言の形の検出' },
  { name: 'anchorFailures', watched: 'body', reason: '錨と字面の検出' },
  { name: 'measurementFailures', watched: 'body', reason: '突き合わせの検出' },
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
    name: 'makeFinding',
    watched: 'unwatched',
    reason: '失敗の整形のみ。落とせば対照が名指しを失って落ちる',
  },
  { name: 'makeGlobalFinding', watched: 'unwatched', reason: '同上' },
  { name: 'runMeasurement', watched: 'body', reason: 'コマンドの実行と失敗の判定' },
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
      'for (const entry of entries) {',
      'pushEntryFindings(root, entry, findings);',
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
      'for (const message of shapeFailures(entry)) {',
      'findings.push(makeFinding(entry, message));',
      '}',
      "const vocabulary = vocabularyFailures(String(entry.command ?? ''));",
      'for (const message of vocabulary) {',
      'for (const message of anchorFailures(root, entry)) {',
      'if (vocabulary.length > 0) return;',
      'for (const message of measurementFailures(root, entry)) {',
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
      'if (entry.documentFigure !== undefined && !isNonEmptyString(entry.documentFigure)) {',
      "failures.push('documentFigure が空です');",
      '}',
      'if (figure !== entry.expected && entry.divergence === undefined) {',
      'failures.push(',
      '`documentFigure \\`${figure}\\` が expected \\`${entry.expected}\\` と異なるのに divergence の宣言がありません`',
      ');',
      'if (figure === entry.expected && entry.divergence !== undefined) {',
      "'divergence を宣言していますが documentFigure と expected が一致しています（宣言が対象より長生きしています。divergence を外してください）'",
      'if (entry.divergence !== undefined && !isNonEmptyString(entry.divergence.reason)) {',
      "failures.push('divergence の reason が空です');",
      'const rendering = documentRenderingOf(entry);',
      'if (!rendering.includes(figure)) {',
      '`documentRendering \\`${rendering}\\` が documentFigure \\`${figure}\\` を含みません（記法と値が切り離されています）`',
      'if (entry.documentRendering !== undefined && entry.documentRendering === figure) {',
      "'documentRendering が documentFigure と同じです（既定と同じ宣言は外してください）'",
      "if (entry.divergence !== undefined && entry.divergence.kind !== 'stale') {",
      'failures.push(`divergence の kind \\`${String(entry.divergence.kind)}\\` は宣言されていません`);',
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
      'const absolute = path.resolve(root, entry.file);',
      'let content: string;',
      'try {',
      "content = fs.readFileSync(absolute, 'utf8');",
      '} catch {',
      'failures.push(`file ${entry.file} を読めません`);',
      'return failures;',
      '}',
      'const matched = anchoredLines(content, entry.anchor);',
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
    declaration: 'function measurementFailures(root: string, entry: ManifestEntry): string[]',
    watched: 'whole-body',
    allowed: [
      'const failures: string[] = [];',
      'const outcome = runMeasurement(root, entry.command);',
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
    allowed: ['return entry.documentFigure ?? entry.expected;'],
    forbidAllNarrowing: true,
  },
  {
    label: 'documentRenderingOf',
    declaration: 'export function documentRenderingOf(entry: ManifestEntry): string',
    watched: 'whole-body',
    allowed: ['return entry.documentRendering ?? documentFigureOf(entry);'],
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
      'if (entry.file === file) count += 1;',
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
      "if (entry.divergence !== undefined && entry.divergence.kind === 'stale') count += 1;",
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
 * 報告される 4 件の内訳は、不一致 1 件・下限割れ 1 件・所管の文書の未被覆 1 件・
 * 宣言された食い違いの超過 1 件である。**前提が崩れた仮マニフェストを合格にしないこと**が
 * ここで固定される（宣言が下限 29 件を下回るため、不一致が無くても赤い）。
 * 食い違いの件数は {@link DECLARED_STALE_DOCUMENT_FIGURES} から組み立てるため、
 * 定数を締めても緩めても内訳は変わらない（タスク 115.270 が定数を 4 から 0 へ締めた際、
 * 「不足 1 件」が構成不能になったため「超過 1 件」へ改めた）。
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
            command: "printf '7'",
            expected: '7',
          },
          {
            id: 'disagrees',
            file: path.join(directory, 'doc.md'),
            anchor: '基準の行',
            command: "printf '8'",
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
        cwd: ROOT,
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
    failures.push(
      ...expect(
        reported.length === 4,
        `報告件数が 4 件でない: ${reported.length}\n${result.stderr}`
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

const BEHAVIOUR: TestCase[] = [
  { name: '仮マニフェストに対する終了コードと報告件数が固定される', run: checkSubprocessBehaviour },
  {
    name: '--verbose / --json --verbose でも許容外の綴りは実行されない',
    run: checkVerboseDoesNotExecuteRejectedCommand,
  },
  { name: '読めない宣言は合格にしない', run: checkUnreadableManifestFails },
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
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 */
const MINIMUM_POSITIVE_CONTROLS = 13;
const MINIMUM_NEGATIVE_CONTROLS = 3;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-03 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-design-measurement-freshness.selftest.ts | tail -1` の出す値をそのまま
 * 置く。**確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 本体 `check-design-measurement-freshness.ts` の指摘は文字列で組み立てられ、種別の直和型を
 * 持たない。導けないため件数で貼る。
 */
const MINIMUM_TOTAL_CASES = 31;

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
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
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
}

main();
