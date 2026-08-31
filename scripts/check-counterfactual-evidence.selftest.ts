/**
 * @fileoverview 反実仮想の引用検査 検出規則の自己検査
 *
 * `scripts/check-counterfactual-evidence.ts` の検出規則が
 *   (1) **緩める向き**——実行した変異を引かない反実仮想を取り逃がさないこと、
 *   (2) **狭めすぎる向き**——引用を伴う反実仮想と、そもそも反実仮想でない散文
 *       （構造の含意・実行時の条件・`判定根拠:` の定型）を告発しないこと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * `MUST_DETECT` の先頭 7 件は、タスク 115.210 の是正**前**にリポジトリへ実在した実物である。
 * 追試の手順: 起票時点のツリー（コミット `95ea45e`）を取り出し、走査根の外（`tools/`）へ
 * 置いた本体を走らせると「合計 7 件 / 5 ファイル（走査 1748 ファイル、反実仮想 27 件）」を
 * 報告する（2026-08-31 に実測）。この 7 件が先頭 7 件と一対一に対応する。
 * 検出器が壊れていれば本検査（0 件）は自明に通ってしまうため、既知の該当を捕まえられる
 * ことを先に固定する（陽性対照）。
 *
 * `MUST_NOT_DETECT` は、是正後の実物（引用を伴う反実仮想）と、**より広い網なら誤検出
 * していた実物**の二群からなる。後者は起票時の網の広さの実測（本体の「網の広さの実測」）
 * で一件ずつ読んで反実仮想でないと判別したものである。陰性対照が空だと、検出器を
 * 「何でも告発する」側へ壊しても誰も気づかない（タスク 115.222）。
 *
 * 使用方法:
 *   npx tsx scripts/check-counterfactual-evidence.selftest.ts
 *   npm run check:cf-evidence:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI と押下前の関門では
 * 本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  blockText,
  collectSourceFiles,
  countCounterfactuals,
  EXCLUDED_DIRECTORIES,
  EXECUTION_VOCABULARY,
  extractCommentBlocks,
  hasExecutionCitation,
  isCounterfactualSentence,
  listCounterfactualSentences,
  MUTATION_VOCABULARY,
  run,
  scanSource,
  SCAN_DIRS,
  SCANNED_EXTENSIONS,
  splitSentences,
  surveyNet,
  VERDICT_VOCABULARY,
} from './check-counterfactual-evidence.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-counterfactual-evidence.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return fs
    .readFileSync(ENTRY_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入するコメント塊（コメント記号を含む生のソース断片） */
  source?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

/** 一行コメントの塊を作る */
function lineComment(...lines: string[]): string {
  return lines.map((line) => `// ${line}`).join('\n');
}

// ============================================================================
// 捕捉しなければならない書き方（緩める向きの誤り）
// 先頭 7 件は 115.210 の是正前に実在した実物
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: '実物1: 検出規則の枝を外すと事例が落ちる（guards 自己検査 115.163-12 の注釈）',
    source: lineComment(
      '`collectLanguageFixingAssertions` の `!negated` を外すとこのケースが落ちる',
      '（＝実在の主張を「飾り」と誤って告発し、実のある主張の削除を迫る）。'
    ),
    expected: true,
  },
  {
    name: '実物2: ガードを外すと事例が落ちる（guards 自己検査 115.163-17 の注釈）',
    source: lineComment(
      'すなわち `absenceSubjectRoots`',
      '側のガードは単独で効いており、外すとこのケースが落ちる。'
    ),
    expected: true,
  },
  {
    name: '実物3: 綴りを外しても自己検査が緑のままだった（guards の T12 等値 matcher）',
    source: [
      '/**',
      ' * **三つの綴りを自己検査が個別に固定している（Task 115.181）。** それまで固定されていたのは',
      ' * `toBe`（`115.163-7`）だけで、`toEqual` / `toStrictEqual` は外しても自己検査が緑のままであった。',
      ' */',
    ].join('\n'),
    expected: true,
  },
  {
    name: '実物4: 綴りを外しても緑のままだったので事例を加えた（guards の型の等値 matcher）',
    source: [
      '/**',
      ' * **三つの綴りを自己検査が個別に固定している（Task 115.181）。** `toStrictEqual` は',
      ' * 外しても自己検査が緑のままであったため `115.181-13` を加えた。',
      ' */',
    ].join('\n'),
    expected: true,
  },
  {
    name: '実物5: 二つの変異のいずれでも自己検査が全件通過していた（被覆の自己検査）',
    source: lineComment(
      'どちらも読み取り規則が明示的に扱っているのに、',
      '115.197 の走査時点ではこれらを通る見本が一つも無く、',
      '',
      '  - 範囲の後端を記録しない変異（`listMatch[3]` の記録を落とす）',
      '  - 枝つき要件番号を認めない変異（`[A-E]?` を落とす）',
      '',
      'のいずれも自己検査 43 件が全件通過していた（＝主張が空虚だった）。'
    ),
    expected: true,
  },
  {
    name: '実物6: 三種へ戻せばここで落ちる（steering 実在検査の自己検査）',
    source: lineComment(
      '拡張子の網が実際に広いこと。`.ts` / `.tsx` / `.css` の三種へ戻せばここで落ちる'
    ),
    expected: true,
  },
  {
    name: '実物7: リテラル直書きへ変異させても緑のままだった（見積画面の単体検証）',
    source: [
      '/**',
      ' * 54.3 の時点では切替UIが無く、`viewMode` はフックの既定値を渡すだけだったため',
      ' * `viewMode="tree"` のリテラル直書きへ変異させてもテストが緑のままだった。',
      ' */',
    ].join('\n'),
    expected: true,
  },
  // ------------------------------------------------------------------------
  // 語彙の各語を単独で固定する合成の見本（実データが実現していない語も含めて、
  // 宣言だけあって固定の無い判断を残さない。タスク 115.181 の教訓）
  // ------------------------------------------------------------------------
  {
    name: '合成: 変異の語「外せ」（115.170 の実物の言い回し）',
    source: lineComment('`overflowX` を外せば赤になる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「消す」（`foo` を消すと落ちる）',
    source: lineComment('`foo` を消すと落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「消せ」（`foo` を消せば落ちる）',
    source: lineComment('`foo` を消せば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「落とせ」（`foo` を落とせば落ちる）',
    source: lineComment('`foo` を落とせば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「戻す」（`foo` を戻すと落ちる）',
    source: lineComment('`foo` を戻すと落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「書き戻」（`foo` の書き戻しで落ちる）',
    source: lineComment('`foo` の書き戻しで落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「空にする」（`foo` を空にすると落ちる）',
    source: lineComment('`foo` を空にすると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「空にすれ」（`foo` を空にすれば落ちる）',
    source: lineComment('`foo` を空にすれば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「変異を当て」（`foo` へ変異を当てると落ちる）',
    source: lineComment('`foo` へ変異を当てると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「狭める」（`foo` を狭めると落ちる）',
    source: lineComment('`foo` を狭めると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「広げる」（`foo` を広げると落ちる）',
    source: lineComment('`foo` を広げると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「反転させ」（`foo` を反転させると落ちる）',
    source: lineComment('`foo` を反転させると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「変異を掛け」（`foo` へ変異を掛けると落ちる）',
    source: lineComment('`foo` へ変異を掛けると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「生きていれ」（115.171 の実物の言い回し）',
    source: lineComment(
      '撤去した恒偽の分岐 `resizeRatio` が生きていれば等倍リサイズが入り、落ちる。'
    ),
    expected: true,
  },
  {
    name: '合成: 変異の語「残していれ」（`foo` を残していれば落ちる）',
    source: lineComment('`foo` を残していれば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「逐語復元」（115.171 の実物の言い回し）',
    source: lineComment('`resizeRatio` の分岐を逐語復元すると落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「狭めれ」（`foo` を狭めれば落ちる）',
    source: lineComment('`foo` を狭めれば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「広げれ」（`foo` を広げれば落ちる）',
    source: lineComment('`foo` を広げれば落ちる。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「赤くなる」',
    source: lineComment('`foo` を外すと赤くなる。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「赤に倒れる」',
    source: lineComment('`foo` を外すと赤に倒れる。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「緑になる」',
    source: lineComment('`foo` を外しても緑になる。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「検出される」',
    source: lineComment('`foo` を外すと検出される。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「検出されない」',
    source: lineComment('`foo` を外しても検出されない。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「見逃す」',
    source: lineComment('`foo` を外すと見逃す。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「緑で通る」',
    source: lineComment('`foo` を外しても緑で通る。'),
    expected: true,
  },
  {
    name: '合成: 判定の語「素通り」（115.170 の型の言い回し）',
    source: lineComment('`overflowX` を外しても検出は素通りする。'),
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（狭めすぎる向きの誤り＝働いている記述の誤爆）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  // --- 引用を伴う反実仮想（実物） ---
  {
    name: '実物: 変異と落ちた件数を引く（guards 自己検査 115.180 の注釈）',
    source: lineComment(
      '`push` と対で登録する（Task 115.180 のレビュー）。`COLLECTION_APPENDS` から',
      '`unshift` を外す変異で**この事例だけ**が落ちることを実測しており、',
      '「push / unshift を対象へ加えた」という記述の両半分が固定されている。',
      'e2e 配下に現在 `unshift` の実例は 0 件だが、**検出 0 件は該当が無いことを',
      '意味しない**（Task 115.164）ため、同じ積み足しの形として覆う側へ倒す。'
    ),
    expected: false,
  },
  {
    name: '実物: 日付つきで変異と件数を引く（guards の代用符号の番人）',
    source: lineComment(
      '変異: `regexAlwaysYields` の「対になっていない代用符号を含む needle を数えない」番人だけを',
      '外すと、この 1 件だけが落ちる（2026-08-27 に実測。182 件中 181 件は緑のまま）。'
    ),
    expected: false,
  },
  {
    name: '実物: 入口を落としたときの出力の変化を引く（被覆の自己検査 115.197）',
    source: lineComment(
      '115.197 のレビューが実測した: `backend/prisma/seed.ts` を入口から落とすと自己検査は',
      '52/52 緑のまま、本番ゲートは「本番モジュール 590」が「589」へ動く。'
    ),
    expected: false,
  },
  {
    name: '是正後の実物: 変異と落ちた件数と日付を引く（本タスクが書いた形）',
    source: lineComment(
      '`collectLanguageFixingAssertions` の `!negated` を外す変異を当てると、自己検査',
      '182 件のうち本ケース 1 件だけが落ちる（2026-08-31 に実測。タスク 115.210）。'
    ),
    expected: false,
  },
  // --- 反実仮想でない散文（より広い網なら誤検出していた実物） ---
  {
    name: '実物: 構造の含意（主張を包むと何も実行されずに緑になる。コードを読めば決まる）',
    source: lineComment(
      '「実装による」ではなく要件が定めているため、有無そのものを無条件に主張する',
      '（包んだままだと、保存が失われても検証が一件も実行されずに緑になる）。'
    ),
    expected: false,
  },
  {
    name: '実物: `判定根拠:` の定型（E2E の被覆の根拠。変異の実行を述べていない）',
    source: lineComment(
      '判定根拠: 管理メニューの admin-menu-invitations を実際にクリックし、',
      '遷移後URLが /admin/invitations であることを主張しており、遷移が壊れれば赤になる。'
    ),
    expected: false,
  },
  {
    name: '実物: 実行時の条件（`th` が取れなければ主張は素通りする）',
    source: lineComment('`th` が一つも取れなければ主張は素通りする。'),
    expected: false,
  },
  {
    name: '実物: 経路の説明（`Decimal` へ戻す際の落とし穴。判定の語と無関係）',
    source: lineComment(
      '新規作成直後の空の見積書や全額ゼロの無償見積書は**必ずこの経路を通る**ので、',
      '空文字を `Decimal` へ戻す際に落とし穴を踏んではならない。'
    ),
    expected: false,
  },
  {
    name: '実物: 逆引用符の名指しが無い散文（合計が 0 円でも緑になる）',
    source: lineComment('合計が 0 円でも、桁が壊れていても緑になる。'),
    expected: false,
  },
  // --- 名指しを持たない実物（`BACKTICKED_NAME` の要求を単独で固定する） ---
  // いずれも変異の語と判定の語を持つが、コード上の名前を名指ししていないため
  // 反実仮想として扱わない。名指しの要求を外すと、この三件が告発へ回る。
  {
    name: '実物: 画面操作の記述（ツールを離れて戻すと目印が落ちる。変異ではない）',
    source: lineComment(
      'ツールを一度離れて戻すと編集中の目印が落ちるため、その経路で状態を揃える。'
    ),
    expected: false,
  },
  {
    name: '実物: 検証の手順（ページの焦点を外す。前の結果が残ったまま緑になることを防ぐ）',
    source: lineComment('ページの焦点を外す（前の見出しの結果が残ったまま緑になることを防ぐ）'),
    expected: false,
  },
  {
    name: '実物: 検証の設計意図（挿入順で消す実装でも落ちるようにする）',
    source: lineComment(
      '積む順序は新しいものを先にして、savedAt の並べ替えを省いた実装（挿入順で消す）',
      'でも落ちるようにする。'
    ),
    expected: false,
  },
  // --- 実行の語を一語ずつ固定する合成の見本 ---
  {
    name: '合成: 実行の語「実測」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（1 件。実測）。'),
    expected: false,
  },
  {
    name: '合成: 実行の語「測っ」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（1 件。2026-08-31 に測った）。'),
    expected: false,
  },
  {
    name: '合成: 実行の語「測り直」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（1 件。提出時に測り直した）。'),
    expected: false,
  },
  {
    name: '合成: 実行の語「走らせ」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（自己検査を走らせて 1 件）。'),
    expected: false,
  },
  {
    name: '合成: 実行の語「実行し」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（変異を実行して 1 件）。'),
    expected: false,
  },
  {
    name: '合成: 実行の語「再現」だけで引用が成立する',
    source: lineComment('`foo` を外すと落ちる（下の手順で再現。1 件）。'),
    expected: false,
  },
  {
    name: '合成: 数字を伴わない「実測」は引用として認めない（陽性側の境界）',
    source: lineComment('`foo` を外すと落ちる（実測）。'),
    expected: true,
  },
];

// ============================================================================
// 走査対象と前提条件（機構を見る）
// ============================================================================

/**
 * 一時ルートに最小のリポジトリを作り、複製した本体の位置を返す。
 *
 * 本体は**走査根の外**（`tools/`）へ置く。走査根の中に置くと、本体自身の注釈にある
 * 反実仮想が母集団へ混ざり、「反実仮想 0 件」の確認が成立しなくなる。
 */
function seedTemporaryRepository(tempRoot: string): string {
  const toolsDir = path.join(tempRoot, 'tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  const entry = path.join(toolsDir, ENTRY_NAME);
  fs.copyFileSync(ENTRY_PATH, entry);
  for (const scanDir of SCAN_DIRS) {
    fs.mkdirSync(path.join(tempRoot, scanDir), { recursive: true });
  }
  return entry;
}

/** 走査対象が 0 件のとき合格にしないこと（第3原則） */
function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-evidence-empty-'));
  try {
    // 本体を `tools/` へ置くことで、走査根 `scripts` を含むすべての根が存在しない
    // リポジトリを再現する（本体は自身の位置から ROOT を導く）。
    const toolsDir = path.join(tempRoot, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(toolsDir, ENTRY_NAME));

    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(toolsDir, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(
        `走査対象が 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!(executed.stderr ?? '').includes('一件も見つかりませんでした')) {
      failures.push('走査対象 0 件を「合格」と告げている疑いがある');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/** 走査根のどれかが空のとき合格にしないこと（タスク 115.227 が起票した型。同タスクは未着手） */
function checkEmptyScanDirFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  for (const droppedDir of SCAN_DIRS) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-evidence-root-'));
    try {
      const entry = seedTemporaryRepository(tempRoot);
      // 落とす根以外にはファイルを置き、当該の根だけを空にする
      for (const scanDir of SCAN_DIRS) {
        if (scanDir === droppedDir) continue;
        fs.writeFileSync(
          path.join(tempRoot, scanDir, 'seed.ts'),
          ['// `foo` を外すと落ちる（1 件。実測）。', 'export {};', ''].join('\n')
        );
      }
      const executed = spawnSync(process.execPath, [TSX_CLI, entry], {
        encoding: 'utf-8',
        cwd: ROOT,
      });
      if (executed.status !== 1) {
        failures.push(
          `走査根 ${droppedDir} が空でも終了コードが 1 にならなかった（status=${executed.status}）`
        );
      }
      if (!(executed.stderr ?? '').includes(droppedDir)) {
        failures.push(`空の走査根 ${droppedDir} が報告されていない`);
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
  return failures;
}

/** 反実仮想が 0 件のとき合格にしないこと（走査の空振り） */
function checkVacuousScanFails(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-evidence-vacuous-'));
  try {
    const entry = seedTemporaryRepository(tempRoot);
    for (const scanDir of SCAN_DIRS) {
      fs.writeFileSync(
        path.join(tempRoot, scanDir, 'seed.ts'),
        ['// 反実仮想を含まない普通の注釈。', 'export {};', ''].join('\n')
      );
    }
    const executed = spawnSync(process.execPath, [TSX_CLI, entry], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.status !== 1) {
      failures.push(
        `反実仮想が 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!(executed.stderr ?? '').includes('反実仮想の記述が一件もありません')) {
      failures.push('反実仮想 0 件を「合格」と告げている疑いがある');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 走査から報告までの一連が実際に働くこと。
 * `isCounterfactualSentence` 単体が正しくても、列挙・読み込み・集計のどこかが壊れていれば
 * 本検査は「0 件」で自明に合格してしまう。仮のリポジトリを作り、引用を欠いた記述で
 * 非零終了し、引用を足せば合格することを終了コードまで含めて固定する。
 */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(`tsx の起動口が見つからない: ${TSX_CLI}（確認できないため合格にしない）`);
    return failures;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-evidence-e2e-'));
  try {
    const entry = seedTemporaryRepository(tempRoot);
    for (const scanDir of SCAN_DIRS) {
      fs.writeFileSync(
        path.join(tempRoot, scanDir, 'cited.ts'),
        ['// `cited` を外すと落ちる（1 件。実測）。', 'export {};', ''].join('\n')
      );
    }
    const target = path.join(tempRoot, 'backend/src', 'uncited.ts');
    fs.writeFileSync(target, ['// `uncited` を外すと落ちる。', 'export {};', ''].join('\n'));

    const result = run({ root: tempRoot });
    const detected = result.findings.map((finding) => `${finding.file}:${finding.line}`);
    if (detected.join(' / ') !== 'backend/src/uncited.ts:1') {
      failures.push(
        `検出が期待と違う。期待「backend/src/uncited.ts:1」／実際「${detected.join(' / ') || '（無し）'}」`
      );
    }
    if (result.claims !== SCAN_DIRS.length + 1) {
      failures.push(
        `反実仮想の件数が期待と違う（期待 ${SCAN_DIRS.length + 1} / 実際 ${result.claims}）`
      );
    }

    // 生成物に置いた該当を数えないこと（走査の除外が効いていること）。
    // `generated`（版管理外の Prisma 出力）も同じ扱いで、在る環境と無い環境で
    // 走査ファイル数が変わらないことを機構として固定する。
    for (const artifactName of ['dist', 'generated']) {
      const artifactDir = path.join(tempRoot, 'frontend/src', artifactName);
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(artifactDir, 'artifact.ts'),
        ['// `artifact` を外すと落ちる。', 'export {};', ''].join('\n')
      );
      const afterSeed = run({ root: tempRoot });
      if (afterSeed.findings.length !== 1) {
        failures.push(
          `生成物 ${artifactName} に置いた該当まで数えている（走査の除外が効いていない）`
        );
      }
      if (afterSeed.scannedFiles !== SCAN_DIRS.length + 1) {
        failures.push(
          `生成物 ${artifactName} を走査ファイル数へ数えている` +
            `（期待 ${SCAN_DIRS.length + 1} / 実際 ${afterSeed.scannedFiles}）`
        );
      }
    }

    // 終了コードと要約行（報告の詐称・件数の間引きを塞ぐ）
    const failed = spawnSync(process.execPath, [TSX_CLI, entry], { encoding: 'utf-8', cwd: ROOT });
    if (failed.status !== 1) {
      failures.push(`該当がある材料で終了コードが 1 にならなかった（status=${failed.status}）`);
    }
    if (!(failed.stderr ?? '').includes('合計 1 件 / 1 ファイル')) {
      const actual = /合計 .*件\）/.exec(failed.stderr ?? '')?.[0] ?? '（要約行が無い）';
      failures.push(`報告される件数が期待と違う。実際「${actual}」`);
    }

    // 引用を足せば合格すること（常時失敗の裏返しを塞ぐ）
    fs.writeFileSync(
      target,
      ['// `uncited` を外すと落ちる（1 件。実測）。', 'export {};', ''].join('\n')
    );
    const passed = spawnSync(process.execPath, [TSX_CLI, entry], { encoding: 'utf-8', cwd: ROOT });
    if (passed.status !== 0) {
      failures.push(
        `引用を足した材料で終了コードが 0 にならなかった（status=${passed.status}）。` +
          `標準エラー: ${(passed.stderr ?? '').trim()}`
      );
    }
    if (!(passed.stdout ?? '').includes('引用を照合した反実仮想')) {
      failures.push(
        `合格の報告が母集団の大きさを示していない。実際「${(passed.stdout ?? '').trim()}」`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * リポジトリ本体の走査根が**実在し、いずれも空でない**こと。
 * 走査根が `main()` の中に隠れていると、根を落としても自己検査は緑のままになる
 * （タスク 115.227 が起票した型。同タスクは未着手であり、これは既得の知見ではなく指摘である）。
 * 本検査は `SCAN_DIRS` を通して同じ集合を数え直す。
 */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  if (SCAN_DIRS.length === 0) failures.push('走査根が一つも宣言されていない');
  for (const scanDir of SCAN_DIRS) {
    const absolute = path.join(ROOT, scanDir);
    if (!fs.existsSync(absolute)) {
      failures.push(`走査根が実在しない: ${scanDir}`);
      continue;
    }
    const files = collectSourceFiles(ROOT, scanDir);
    if (files.length === 0) failures.push(`走査根に対象ファイルが一件も無い: ${scanDir}`);
    for (const file of files) {
      if (!file.startsWith(`${scanDir}/`)) {
        failures.push(`走査根 ${scanDir} の外のファイルを返している: ${file}`);
        break;
      }
    }
  }
  // 生成物ディレクトリが外れていること（誤検出へ倒れる向きを塞ぐ）。
  // `generated` は版管理外の生成物（Prisma クライアント）であり、**手元には在るが
  // 取得直後の統合には無い**。外さないと報告する走査ファイル数が環境で変わり、
  // 記録した件数を後任が追試したときに合わないため、走査から外す。
  for (const directory of ['node_modules', 'dist', 'coverage', 'storybook-static', 'generated']) {
    if (!EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ビルド生成物 ${directory} が走査から外れていない`);
    }
  }
  // 逆に、本体のソース木を丸ごと外していないこと
  for (const directory of ['scripts', 'backend', 'frontend', 'e2e']) {
    if (EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ソース木 ${directory} が走査から外れている`);
    }
  }
  if (!SCANNED_EXTENSIONS.includes('.ts') || !SCANNED_EXTENSIONS.includes('.tsx')) {
    failures.push(`走査する拡張子が狭すぎる: ${SCANNED_EXTENSIONS.join(' ')}`);
  }
  return failures;
}

/**
 * 報告される母集団の大きさが、自己検査側の独立の数え直しと一致すること。
 *
 * 「0 件でないこと」だけでは、規則の一部が黙って効かなくなる変異——たとえば
 * コメント塊の切り出しを一行コメントだけに狭める変異——を見逃す（タスク 115.197 の教訓）。
 * ここでは本体の `run` を通さず、`extractCommentBlocks` から数え直して突き合わせる。
 */
function checkClaimCountIsHonest(): string[] {
  const failures: string[] = [];
  let expected = 0;
  for (const scanDir of SCAN_DIRS) {
    for (const relativePath of collectSourceFiles(ROOT, scanDir)) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
      const recounted = extractCommentBlocks(source).reduce(
        (sum, block) =>
          sum +
          splitSentences(blockText(block)).filter((sentence) => isCounterfactualSentence(sentence))
            .length,
        0
      );
      if (countCounterfactuals(source) !== recounted) {
        failures.push(
          `${relativePath}: countCounterfactuals が独立の数え直しと違う` +
            `（${countCounterfactuals(source)} / ${recounted}）`
        );
      }
      expected += recounted;
    }
  }
  const result = run();
  if (result.claims !== expected) {
    failures.push(
      `報告された反実仮想の件数が独立の数え直しと違う（報告 ${result.claims} / 実測 ${expected}）`
    );
  }
  if (expected === 0) {
    failures.push('リポジトリ本体から反実仮想が一件も取れていない（走査の空振り）');
  }
  return failures;
}

/**
 * ブロックコメントと一行コメントの**両方**が塊として取り出せること。
 *
 * 片方だけを見る変異は、実データの母集団を大きく減らすのに、一行コメントだけの
 * 見本しか無ければ気づかれない。実データが両方を実現していることを併せて数える。
 */
function checkBothCommentFormsAreRead(): string[] {
  const failures: string[] = [];
  const blockFormSource = ['/**', ' * `foo` を外すと落ちる。', ' */'].join('\n');
  const lineFormSource = '// `foo` を外すと落ちる。';
  if (scanSource('sample.ts', blockFormSource).length !== 1) {
    failures.push('ブロックコメントの反実仮想を取り出せていない');
  }
  if (scanSource('sample.ts', lineFormSource).length !== 1) {
    failures.push('一行コメントの反実仮想を取り出せていない');
  }
  // 実データが両方の形で反実仮想を実現していること（見本だけの世界にならないように）
  let blockForm = 0;
  let lineForm = 0;
  for (const scanDir of SCAN_DIRS) {
    for (const relativePath of collectSourceFiles(ROOT, scanDir)) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
      const lines = source.split(/\r?\n/);
      for (const block of extractCommentBlocks(source)) {
        if (
          splitSentences(blockText(block)).filter((sentence) => isCounterfactualSentence(sentence))
            .length === 0
        )
          continue;
        const head = (lines[block.line - 1] ?? '').trim();
        if (head.startsWith('//')) lineForm += 1;
        else blockForm += 1;
      }
    }
  }
  if (blockForm === 0) failures.push('実データのブロックコメントから反実仮想が一件も取れていない');
  if (lineForm === 0) failures.push('実データの一行コメントから反実仮想が一件も取れていない');
  return failures;
}

/**
 * 宣言した語彙のどの一語も**実効を持つ**こと（タスク 115.181 の教訓）。
 *
 * 語を一つだけ抜いて見本を判定し直し、判定が変わる見本が一つも無い語を「固定されていない」
 * として告発する。固定の無い語は、次の変更で黙って失われる。
 */
function checkEveryVocabularyEntryIsFixed(): string[] {
  const failures: string[] = [];
  const positives = MUST_DETECT.map((testCase) => testCase.source ?? '');
  const negatives = MUST_NOT_DETECT.map((testCase) => testCase.source ?? '');

  const sentencesOf = (source: string): string[] =>
    extractCommentBlocks(source).flatMap((block) => splitSentences(blockText(block)));

  for (const word of MUTATION_VOCABULARY) {
    const reduced = MUTATION_VOCABULARY.filter((entry) => entry !== word);
    const fixed = positives.some((source) =>
      sentencesOf(source).some(
        (sentence) =>
          isCounterfactualSentence(sentence) &&
          !isCounterfactualSentence(sentence, { mutation: reduced })
      )
    );
    if (!fixed) failures.push(`変異の語「${word}」を抜いても見本の判定が一つも変わらない`);
  }

  for (const word of VERDICT_VOCABULARY) {
    const reduced = VERDICT_VOCABULARY.filter((entry) => entry !== word);
    const fixed = positives.some((source) =>
      sentencesOf(source).some(
        (sentence) =>
          isCounterfactualSentence(sentence) &&
          !isCounterfactualSentence(sentence, { verdict: reduced })
      )
    );
    if (!fixed) failures.push(`判定の語「${word}」を抜いても見本の判定が一つも変わらない`);
  }

  for (const word of EXECUTION_VOCABULARY) {
    const reduced = EXECUTION_VOCABULARY.filter((entry) => entry !== word);
    const fixed = negatives.some((source) =>
      extractCommentBlocks(source).some((block) => {
        const text = blockText(block);
        if (
          splitSentences(text).filter((sentence) => isCounterfactualSentence(sentence)).length === 0
        )
          return false;
        return hasExecutionCitation(text) && !hasExecutionCitation(text, { execution: reduced });
      })
    );
    if (!fixed) failures.push(`実行の語「${word}」を抜いても見本の判定が一つも変わらない`);
  }
  return failures;
}

/**
 * 文字列リテラルの中を注釈として読まないこと。
 *
 * 本自己検査の見本は注釈の字面を文字列として置く。実装当初はこれを読んでしまい、
 * 見本 3 件（引用を欠いた合成の見本）がリポジトリ本体の走査で告発された。
 * 見本を書き換えるのではなく、字句の側で解いたことをここで固定する。
 */
function checkStringLiteralsAreNotRead(): string[] {
  const failures: string[] = [];
  const cases: Array<{ line: string; commented: boolean; label: string }> = [
    { line: "  const sample = '// `foo` を外すと落ちる。';", commented: false, label: '単引用符' },
    {
      line: '  const sample = "// `foo` を外すと落ちる。";',
      commented: false,
      label: '二重引用符',
    },
    {
      line: '  const sample = `// \\`foo\\` を外すと落ちる。`;',
      commented: false,
      label: '逆引用符',
    },
    { line: '  // `foo` を外すと落ちる。', commented: true, label: '行頭の注釈' },
    {
      line: '  const value = 1; // `foo` を外すと落ちる。',
      commented: true,
      label: 'コード後の注釈',
    },
  ];
  for (const testCase of cases) {
    const detected = extractCommentBlocks(testCase.line).length > 0;
    if (detected !== testCase.commented) {
      failures.push(
        `${testCase.label}: 注釈として${testCase.commented ? '読めていない' : '読んでしまう'}`
      );
    }
  }
  // 見本の字面が本体の走査へ漏れていないこと（本自己検査ファイル自身で確かめる）
  const own = scanSource(
    'scripts/check-counterfactual-evidence.selftest.ts',
    fs.readFileSync(path.join(SCRIPTS_DIR, 'check-counterfactual-evidence.selftest.ts'), 'utf-8')
  );
  if (own.length > 0) {
    failures.push(
      `自己検査ファイル自身が告発されている（見本が注釈として読まれている）: ` +
        own.map((finding) => `L${finding.line}`).join(' / ')
    );
  }
  return failures;
}

/** 引用の判定が「実行の語」と「数字」の両方を要求していること */
function checkCitationRequiresBothPartsOfEvidence(): string[] {
  const failures: string[] = [];
  if (!hasExecutionCitation('1 件が落ちることを実測した')) {
    failures.push('実行の語と数字が揃った文面を引用として認めていない');
  }
  if (hasExecutionCitation('実測した')) {
    failures.push('数字を伴わない「実測した」を引用として認めている（出力の名指しが無い）');
  }
  if (hasExecutionCitation('182 件のうち 1 件')) {
    failures.push('実行の語を伴わない数字だけを引用として認めている');
  }
  return failures;
}

/**
 * 検出結果を名指しで逃がす経路が無いこと（許容リストの名前ではなく機構を見る）。
 *
 * 「このファイルだけは見逃す」といった逃がしは、本体のソースに**ファイル名の
 * 文字列リテラル**として現れる。走査・判定・集計の各関数の本体にその形が無いことを固定する。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();
  const FILE_NAME_LITERAL = /['"`][A-Za-z0-9_@-][A-Za-z0-9_@.-]*\.[A-Za-z][A-Za-z0-9]{0,9}['"`]/;

  const bodies: Array<{ label: string; declaration: string }> = [
    { label: 'isCounterfactualSentence', declaration: 'export function isCounterfactualSentence(' },
    { label: 'hasExecutionCitation', declaration: 'export function hasExecutionCitation(' },
    { label: 'scanSource', declaration: 'export function scanSource(' },
    { label: 'extractCommentBlocks', declaration: 'export function extractCommentBlocks(' },
    { label: 'run', declaration: 'export function run(' },
    { label: 'surveyNet', declaration: 'export function surveyNet(' },
    { label: 'collectNetSentences', declaration: 'export function collectNetSentences(' },
    {
      label: 'listCounterfactualSentences',
      declaration: 'export function listCounterfactualSentences(',
    },
  ];

  for (const body of bodies) {
    const start = source.indexOf(body.declaration);
    if (start < 0) {
      failures.push(`${body.label} の宣言が見つからない（改名されている疑い）`);
      continue;
    }
    const rest = source.slice(start + body.declaration.length);
    const nextDeclaration = rest.search(/\nexport (?:function|const|interface) |\nfunction /);
    const text = nextDeclaration < 0 ? rest : rest.slice(0, nextDeclaration);
    if (FILE_NAME_LITERAL.test(text)) {
      failures.push(
        `${body.label} の本体にファイル名の文字列リテラルがある（名指しの逃がしの疑い）: ` +
          `${FILE_NAME_LITERAL.exec(text)?.[0]}`
      );
    }
  }
  return failures;
}

/**
 * 網の広さの三段階を数える出口（`surveyNet`）が、本検査の走査と同じ台を数えていること。
 *
 * 記録に書いた三段階の件数は、この出口が無ければ後任が追試できない
 * （タスク 115.189 の教訓「追試の手段を成果物に残せない実測は記録に書かない」）。
 * 出口が本検査から離れて独自に数え始めると、記録だけが静かにずれるため、
 * 最も狭い段が本検査の母集団と一致することと、段が包含の順に並ぶことを固定する。
 */
function checkNetSurveyMatchesTheCheck(): string[] {
  const failures: string[] = [];
  const survey = surveyNet();
  const result = run();
  if (survey.scannedFiles !== result.scannedFiles) {
    failures.push(
      `走査ファイル数が本検査と食い違う（本検査 ${result.scannedFiles} / 三段階 ${survey.scannedFiles}）`
    );
  }
  if (survey.allThree.sentences !== result.claims) {
    failures.push(
      `最も狭い段が本検査の母集団と一致しない（本検査 ${result.claims} / 三段階 ${survey.allThree.sentences}）`
    );
  }
  if (survey.allThree.sentences > survey.mutationAndVerdict.sentences) {
    failures.push('三条件の段が二条件の段を超えている（包含が壊れている）');
  }
  if (survey.mutationAndVerdict.sentences > survey.verdictOnly.sentences) {
    failures.push('二条件の段が判定の語だけの段を超えている（包含が壊れている）');
  }
  for (const [label, tier] of [
    ['判定の語だけ', survey.verdictOnly],
    ['変異＋判定', survey.mutationAndVerdict],
    ['名指し＋変異＋判定', survey.allThree],
  ] as const) {
    if (tier.sentences === 0) failures.push(`段「${label}」が空である（数え方が壊れている疑い）`);
    if (tier.cited > tier.sentences) {
      failures.push(`段「${label}」の引用ありが総数を超えている`);
    }
  }

  // 「一件ずつ読んだ」を後任が再現するための列挙が、本検査の母集団と同じ台であること。
  // 件数だけを出す出口では読み直しを追試できず、網羅の主張が静かにずれる
  // （タスク 115.210 の差し戻し 1 回目で現に 1 件ずれていた）。
  const listed = listCounterfactualSentences();
  if (listed.length !== result.claims) {
    failures.push(
      `列挙の件数が本検査の母集団と一致しない（本検査 ${result.claims} / 列挙 ${listed.length}）`
    );
  }
  for (const row of listed) {
    if (!isCounterfactualSentence(row.sentence)) {
      failures.push(`列挙に三条件を満たさない文が混ざっている: ${row.file}:${row.line}`);
      break;
    }
    if (!row.named || !row.mutated) {
      failures.push(`列挙の印が三条件と食い違っている: ${row.file}:${row.line}`);
      break;
    }
  }
  return failures;
}

/** 対照群が空でないこと（0 件の自明な合格を塞ぐ。タスク 115.222） */
function checkControlsArePresent(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('陽性対照 MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('陰性対照 MUST_NOT_DETECT が空である');
  const positives = MUST_DETECT.filter((testCase) => testCase.expected).length;
  const negatives = MUST_NOT_DETECT.filter((testCase) => !testCase.expected).length;
  if (positives === 0) failures.push('検出を期待する見本が一件も無い');
  if (negatives === 0) failures.push('非検出を期待する見本が一件も無い');
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '走査根のどれかが空のとき合格にしない（走査根が遊ぶ状態を塞ぐ）',
    expected: false,
    custom: checkEmptyScanDirFails,
  },
  {
    name: '反実仮想が 0 件のとき合格にしない（走査の空振り）',
    expected: false,
    custom: checkVacuousScanFails,
  },
  {
    name: '走査から報告までが実際に働く（仮のリポジトリで引用の欠落を捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'リポジトリ本体の走査根がすべて実在し、いずれも空でない',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: '報告される母集団の大きさが独立の数え直しと一致する',
    expected: false,
    custom: checkClaimCountIsHonest,
  },
  {
    name: 'ブロックコメントと一行コメントの両方を塊として読む（実データも両方を実現）',
    expected: false,
    custom: checkBothCommentFormsAreRead,
  },
  {
    name: '宣言した語彙のどの一語も見本で固定されている',
    expected: false,
    custom: checkEveryVocabularyEntryIsFixed,
  },
  {
    name: '文字列リテラルの中を注釈として読まない（見本が本検査に掛からない）',
    expected: false,
    custom: checkStringLiteralsAreNotRead,
  },
  {
    name: '引用の判定が実行の語と数字の両方を要求する',
    expected: false,
    custom: checkCitationRequiresBothPartsOfEvidence,
  },
  {
    name: '検出結果を名指しで逃がす経路が無い（許容リストの名前ではなく機構を見る）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: '網の広さの三段階と全文の列挙が本検査と同じ台を数える（記録の追試手段）',
    expected: false,
    custom: checkNetSurveyMatchesTheCheck,
  },
  {
    name: '陽性・陰性の対照群がいずれも空でない',
    expected: false,
    custom: checkControlsArePresent,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const findings = scanSource('sample/example.ts', testCase.source ?? '');
  const detected = findings.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${findings.map((f) => f.sentence).join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    {
      title: '捕捉しなければならない書き方（115.210 の是正前の実物と語彙の見本）',
      cases: MUST_DETECT,
    },
    {
      title: '捕捉してはならない書き方（引用つきの反実仮想と、反実仮想でない散文）',
      cases: MUST_NOT_DETECT,
    },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 反実仮想の引用検査 検出規則 自己検査 (scripts/check-counterfactual-evidence.selftest.ts)'
  );
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = runCase(testCase);
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
