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
  collectNetSentences,
  collectSourceFiles,
  countCounterfactuals,
  EXCLUDED_DIRECTORIES,
  EXECUTION_VOCABULARY,
  extractCommentBlocks,
  hasBacktickedName,
  hasExecutionCitation,
  hasMutationWord,
  hasVerdictWord,
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

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

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
  // タスク 115.319 が `戻し` を語彙へ足した結果、上の見本は `戻し` でも拾えるようになった。
  // `書き戻` が**単独で効く**のは、`戻す` / `戻せ` / `戻し` のいずれにも当たらない形——
  // 未然形の `書き戻さ` と意志形の `書き戻そ`——だけである。下はその一形を固定する。
  // 語幹そのものを字面に採った語は末尾が漢字であるため以降の送り仮名を問わず全形を覆う
  // （`MUTATION_PARADIGMS` の `stem-literal`）。この重複は 115.319 が実測して露出させた
  // ——語彙と活用の宣言の双方から `書き戻` を抜くと、落ちる確認は本見本 1 件だけであり、
  // 上の見本（`foo` の書き戻しで落ちる）は `戻し` が拾って緑のまま通る
  // （2026-09-07 にリポジトリルートで実測。変異は退避した控えからの書き戻しで復元した）。
  {
    name: '合成: 変異の語「書き戻」の単独の実効（未然形。`戻し` の採用で重複しなくなった形）',
    source: lineComment('退避した控えから `SCAN_DIRS` を書き戻さずに走らせると、確認が赤くなる。'),
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
  // --- 値の置換型の変異の語（タスク 115.248 が実測した取りこぼしの形） ---
  // 起票時の MUTATION_VOCABULARY は撤去の動詞（外す・消す・落とす・戻す・空にする）と
  // 「変異」を含む定型に偏っており、**値を別の値へ差し替える型**の動詞を一語も持たなかった。
  // そのため `frontend/src/components/site-surveys/tap-target.constants.ts` の
  // 「44 から 20 へ変えて」「取り込みへ置き換えて」の二文が索引されていなかった。
  // 下の二件は当該の言い回しを引用抜きで写した見本である（実物は引用を伴うため陰性側になる）。
  {
    name: '合成: 変異の語「変え」（値の置換型。115.248 の取りこぼし）',
    source: lineComment('`TAP_TARGET_MIN_PX` を 44 から 20 へ変えると当該の主張が落ちる。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「置き換え」（自前の定数を取り込みへ差し替える型。115.248 の取りこぼし）',
    source: lineComment(
      '`const TAP_TARGET_MIN_PX = 44;` を本モジュールからの取り込みへ置き換えると',
      '当該の主張は緑のままになる。'
    ),
    expected: true,
  },
  // --- 実際に使われる言い回しの変異の語（タスク 115.265 が実測した取りこぼしの形） ---
  // タスク 115.229 が新設した注釈の反実仮想——`checkNetSurveyMatchesTheCheck` と
  // `checkSampleSubjectMatchesTheRun` の docstring——は、変異を実行して出力まで書いて
  // いながら本検査の母集団に入っていなかった。当時の実装者は句点の分割が理由だと報告した
  // が、115.229 のレビューが実測すると当該の三文は `named=true, mutated=false` であり、
  // 外していたのは**「替える」「足す」「足して」が MUTATION_VOCABULARY に無かったこと**で
  // あった（句点の分割で外れるのは 1 文だけである）。変異を実行して記録した文が、変異の
  // 検査の母集団に入らない——網の目そのものの欠落であり、115.127 段4 と同型である。
  // 下の三件は当該の注釈の言い回しを引用抜きで写した見本である（実物は引用を伴うため
  // 陰性側になる）。実測: `MUTATION_VOCABULARY` から `替え` を抜くと 75 件中 2 件——本節の
  // 合成の見本と、下の「変異元が実在しなければ前提の崩壊で落ちる」——が落ちる。`足す` を
  // 抜くと 2 件（本節の合成の見本と「加算を伴わない確認を足すと前提の結線が赤くなる」）、
  // `足し` を抜くと 1 件（連用形の合成の見本）が落ちる（2026-09-04 に実測。変異は退避した
  // 控えからの書き戻しで復元し、復元後は 75/75 で緑に戻ることを確かめた）。
  {
    name: '合成: 変異の語「替え」（115.229 の注釈が使い、115.248 が採らなかった言い回し）',
    source: lineComment(
      '`surveyNet` の `for (const scanDir of scanDirs)` を `scanDirs.slice(0, 1)` へ',
      '替えると当該の確認だけが落ちる。'
    ),
    expected: true,
  },
  {
    name: '合成: 変異の語「足す」（115.229 の注釈が使い、115.248 が採らなかった言い回し）',
    source: lineComment(
      '`isCounterfactualSentence` へ第四の条件（`FIGURE` の同居）を足すと、',
      '母集団と列挙が乖離して当該の確認が落ちる。'
    ),
    expected: true,
  },
  {
    name: '合成: 変異の語「足し」（連用形。「足す」を採るだけでは索引されない活用）',
    source: lineComment(
      '`findingsFromNetSentences` の書き直しへ `&& row.sentence.length > 200` を足して',
      '仮の台の上で結果が分かれるようにすると、本確認は落ちる。'
    ),
    expected: true,
  },
  // --- 連用形の落ち（タスク 115.319 が機械で洗い出した三形） ---
  // 115.265 は `足す` と `足し` の一組だけを実例として踏んだが、現況の語彙を活用の型から
  // 機械で洗うと、連用形の落ちは**三語**に及んでいた。いずれも実データで実効を持つ
  // （名指しと判定の語を持ちながら、当時の語彙では変異の語を持たない文を拾う）。
  // 実測は本体の「活用形の網羅を機械で確かめる範囲」に置いた。下の三件は当該の言い回しを
  // 引用抜きで写した見本である（実物は引用を伴うため陰性側になる）。
  {
    name: '合成: 変異の語「落とし」（`落とす` の連用形。115.319 が実データで 8 文の実効を実測）',
    source: lineComment(
      '走査根の宣言 `SCAN_DIRS` から一つを落としても、自己検査は緑のままである。'
    ),
    expected: true,
  },
  {
    name: '合成: 変異の語「戻し」（`戻す` の連用形。115.319 が実データで 2 文の実効を実測）',
    source: lineComment('`stripComments` を素朴な実装へ戻して走らせると、当該の見本が素通りする。'),
    expected: true,
  },
  {
    name: '合成: 変異の語「空にし」（`空にする` の連用形。115.319 が実データで 4 文の実効を実測）',
    source: lineComment('`ALL_COUNT_KINDS` の実引数を空にして走らせても、実行時は素通りする。'),
    expected: true,
  },
  // --- 未宣言の動詞（タスク 115.320 が語彙へ採った二語） ---
  // 115.319 の活用形の網羅が覆うのは「宣言済みの語の活用の落ち」であって、語彙に一語も無い
  // 動詞は活用の型を持たないため網に掛からない。115.265 が境界外として送った二語がそれで
  // あり、本タスクが採った。採ると露出した引用欠は変異を実行して引用を書き足してある
  // （消してもいないし、語彙を狭めて逃がしてもいない）。採取と実測は本体の
  // 「未宣言の動詞を採る範囲」の節に置いた。下の見本は当該の言い回しを引用抜きで写した
  // 合成である（実物は引用を伴うため陰性側に立つ）。
  {
    name: '合成: 変異の語「書き換え」（115.265 が境界外として送った未宣言の動詞）',
    source: lineComment(
      '`getObservationPattern` が語彙を迂回して別の正規表現を返す書き換えは、',
      '上の主張をすべて満たしたまま素通りする。'
    ),
    expected: true,
  },
  // 下の一件は 115.265 が**陰性側**（現在の語彙の限界の開示）に据えていた実物であり、
  // 本タスクが `無効化` を採ったことで陽性側へ移った。判定が変わったのではない——当時から
  // 引用を欠いた反実仮想であり、語彙が拾えなかっただけである。字面はそのまま据える。
  {
    name: '実物: 検査を丸ごと無効化しても対照が緑で通る（除外の自己検査 115.186 の遮蔽）',
    source: lineComment(
      '狙った検査を丸ごと無効化しても `checkCriterionCorrespondence` の対照は緑のまま通る、',
      'という遮蔽の説明である。'
    ),
    expected: true,
  },
  // 下の二件は 115.248 が**陰性側**（過検出）に据えていた実物であり、115.265 が
  // 陽性側へ移した。いずれも「この改変を当てるとこうなる」を述べた反実仮想であって、
  // 動詞が別の意味で使われた過検出ではない。現に語彙を広げた時点で本検査が実物の側を
  // 告発し（`npm run check:cf-evidence` が 4 件・4 ファイルで赤）、実物には変異を実行して
  // 引用を書き足した。見本は当時の字面のまま据える（引用を持たないので陽性側に立つ）。
  {
    name: '実物: 変異元が実在しなければ前提の崩壊で落ちる（除外の自己検査 115.188）',
    source: lineComment(
      'タスク 115.188 で当該の除外を取り下げたため `entryById` の変異元を差し替えた',
      '（実物に無い識別子は前提の崩壊として検査が落ちる）。'
    ),
    expected: true,
  },
  {
    name: '実物: 加算を伴わない確認を足すと前提の結線が赤くなる（経路参照の自己検査 115.242）',
    source: lineComment(
      '加算を伴わない確認を足すと `checkPreconditionsAreWired` の',
      '「report( の件数＝前提の入口の件数」が合わなくなり赤くなる。'
    ),
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
  // --- 語彙に採らなかった動詞（115.248 が挙げ、115.265 が測り直し、115.320 が二語を採った） ---
  // 115.248 は値の置換型として「変え」「置き換え」の二語だけを採り、「替え」「差し替え」
  // 「書き換え」「足す」「無効化」は**過検出の源**として退けた。タスク 115.265 が測り直すと、
  // そのうち「替え」「足す」で新たに露出する記述は過検出ではなく**引用を欠いた本物の
  // 反実仮想**であり、115.248 の判定の方が誤っていた（当該の二件は陽性側へ移した。
  // 経緯は上の「実際に使われる言い回しの変異の語」の節に書いた）。
  // **「書き換え」「無効化」も同じであった**——タスク 115.320 が両語を採り、露出した四件は
  // いずれも引用を欠いた反実仮想であって過検出ではなかった（四件とも変異を実行して引用を
  // 書き足した。実測は本体の「未宣言の動詞を採る範囲」の節にある）。115.248 が「過検出の
  // 源」と読んだ五語のうち、四語でその読みが誤っていたことになる。
  // 現在も採っていないのは「挿入」「除く」「逆に」である。115.248 が挙げた「入れ替え」
  // 「差し替え」は一覧から外した——語彙は語幹ではなく**字面**で引くため、採用済みの
  // 「替え」が両語を部分文字列として包含しており、どちらを `MUTATION_VOCABULARY` へ足しても
  // 母集団は一文も動かない（下の実測）。
  // 115.248 が 2026-09-03 に測った値と 115.265 / 115.266 の時点の値は、本体の「値の置換型を
  // 採る範囲」の節に経緯として残っている。**下は現況の実測であり、当時の値とは基準が違う。**
  // 採取は、`MUTATION_VOCABULARY` へ当該の一語だけを足し（`MUTATION_PARADIGMS` にも同じ語を
  // 宣言する。さもなければ自己検査が赤くなる）、`npm run check:cf-evidence` を走らせて
  // 母集団と引用を欠く検出を読む（2026-09-08 にリポジトリルートで実測。基準は現在の語彙に
  // よる母集団 242 文・引用を欠くもの 0 件。変異はいずれも退避した控えからの書き戻しで
  // 復元し、復元後に基準の値へ戻ることを確かめた）。
  //   - 「挿入」: 245 文（+3）、「除く」: 243 文（+1）、「逆に」: 242 文（+0）。
  //     いずれも引用を欠く検出は 0 件である。
  //   - 「入れ替え」「差し替え」: いずれも 242 文（+0）。上に書いた包含のためである。
  // --- 語彙を広げても残る取りこぼし（115.248 が開示する限界） ---
  // 変異を述べた文の**次の文**に判定だけが置かれる形は、置換型の語彙を足しても
  // 索引されない。下は `tap-target.constants.ts` の実物であり、同じ塊の前の文が
  // 変異を述べているため塊としては索引されるが、この文単独では三条件を満たさない。
  {
    name: '実物: 変異が前文にある帰結の節（`tap-target.constants.ts`。文単独では三条件を欠く）',
    source: lineComment(
      "残る 1 件は `'44px'` を直に書いた別の主張であり、取り込んだ名前を使う 10 件は",
      '20px を描いたまま緑になる。'
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
          seedContent(['// `foo` を外すと落ちる（1 件。実測）。', 'export {};', ''])
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
        seedContent(['// 反実仮想を含まない普通の注釈。', 'export {};', ''])
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
        seedContent(['// `cited` を外すと落ちる（1 件。実測）。', 'export {};', ''])
      );
    }
    const target = path.join(tempRoot, 'backend/src', 'uncited.ts');
    fs.writeFileSync(target, seedContent(['// `uncited` を外すと落ちる。', 'export {};', '']));

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
    const artifactNames = ['dist', 'generated'];
    // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (artifactNames.length === 0) {
      failures.push('素材 artifactNames が空です（この確認が空振りしています）');
    }
    for (const artifactName of artifactNames) {
      const artifactDir = path.join(tempRoot, 'frontend/src', artifactName);
      fs.mkdirSync(artifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(artifactDir, 'artifact.ts'),
        seedContent(['// `artifact` を外すと落ちる。', 'export {};', ''])
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
      seedContent(['// `uncited` を外すと落ちる（1 件。実測）。', 'export {};', ''])
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
 *
 * **着手前（HEAD、コミット `166753d8`）の版での実測（2026-09-07。タスク 115.319 が語彙を
 * 広げて当該の記述を露出させたため測った）**: `SCAN_DIRS` から `'e2e'` を落として
 * `npm run check:cf-evidence:selftest` を走らせても、落ちる確認は 0 件である
 * （`npm run check:cf-evidence` も EXIT=0。走査 1779 ファイル・反実仮想 187 件が
 * 1562 ファイル・173 件へ減るだけ）。`'scripts'` を落とした場合は 1729 ファイル・34 件へ
 * 減るが、これも落ちる確認は 0 件である。
 *
 * **提出時点の再実測（同じコミット `166753d8` の作業ツリーへタスク 115.319 の未コミットの
 * 変更を載せた版。2026-09-07 にリポジトリルートで測り直した）**: 同じ `'e2e'` 落としで
 * 落ちる確認はやはり 0 件であり、走査 1779 ファイル・反実仮想 210 件が 1562 ファイル・
 * 196 件へ減る。`'scripts'` 落としでは 1729 ファイル・36 件まで減るが、これも落ちる確認は
 * 0 件のままである。**export しただけでは根の脱落は赤くならない**——本検査は宣言された根が
 * 実在し空でないことしか見ないためである。**本タスクが新設した活用形の網羅確認の実効範囲も
 * 走査根の完全性に丸ごと依存する**——根が欠ければ未宣言形を測る母集団ごと縮むためである。
 * 根の集合そのものを固定するかは 115.227 の所管であり（本タスクでは新たな機構を作らない）、
 * ここでは測った事実だけを残す。変異は退避した控えからの書き戻しで復元した。
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
  const mustBeExcluded = ['node_modules', 'dist', 'coverage', 'storybook-static', 'generated'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustBeExcluded.length === 0) {
    failures.push('素材 mustBeExcluded が空です（この確認が空振りしています）');
  }
  for (const directory of mustBeExcluded) {
    if (!EXCLUDED_DIRECTORIES.has(directory)) {
      failures.push(`ビルド生成物 ${directory} が走査から外れていない`);
    }
  }
  // 逆に、本体のソース木を丸ごと外していないこと
  const mustNotBeExcluded = ['scripts', 'backend', 'frontend', 'e2e'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustNotBeExcluded.length === 0) {
    failures.push('素材 mustNotBeExcluded が空です（この確認が空振りしています）');
  }
  for (const directory of mustNotBeExcluded) {
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

// ============================================================================
// 活用形の網羅（タスク 115.319）
// ============================================================================

/**
 * 変異の語彙の活用の型。
 *
 * `MUTATION_VOCABULARY` は**語幹ではなく字面**で引くため、活用形を一つ落とすと黙って漏れる。
 * 型を宣言すると、未宣言の活用形を機械で導けるようになる。
 *
 * - `godan-su`: 五段活用のサ行（`外す` / `落とす` / `戻す` / `足す`）。未然・連用・終止・
 *   仮定・意志が「さ・し・す・せ・そ」の五形に分かれるため、**どれか一形だけを宣言すると
 *   残りは網から外れる**。
 * - `suru`: サ変（`空にする`）。「する・すれ・し・せ・さ・しろ」。
 * - `vowel-stem`: 母音幹（一段・使役の `させ`・`ている` の形）。末尾の `る` / `れ` を落とした
 *   語幹が全活用形の部分文字列になるため、**語幹さえ宣言すれば落ちは無い**。
 * - `stem-literal`: 語幹そのものを字面に採った語（`書き戻`）、サ変名詞の語幹（`無効化`。
 *   活用語尾「する・すれ・し・せ・さ・しろ」は後ろに付くため語幹だけで全形を覆う）、
 *   活用しない語（`逐語復元`）。
 *   **末尾が漢字であるため、以降の送り仮名を問わず全活用形を部分文字列として覆う**
 *   ——本一覧の中で唯一「語幹での照合」を実現している形である。**逃げ道にならないよう、
 *   活用しうる送り仮名で終わる語には宣言できない**（{@link conjugationFormsOf} が拒む）。
 *   さもなければ `落とす` をこの型と宣言するだけで網羅の確認を黙らせられる。
 */
type ConjugationParadigm = 'godan-su' | 'suru' | 'vowel-stem' | 'stem-literal';

/** 五段サ行の活用語尾（未然・連用・終止・仮定・意志） */
const GODAN_SU_ENDINGS: readonly string[] = ['さ', 'し', 'す', 'せ', 'そ'];

/** サ変の活用語尾 */
const SURU_ENDINGS: readonly string[] = ['する', 'すれ', 'し', 'せ', 'さ', 'しろ'];

/** 母音幹の語尾になりうる仮名（`る` / `れ` を落とした後の末尾） */
const VOWEL_STEM_TAILS = /[えけげせぜてでねへべめれい]$/;

/** 活用しうる送り仮名で終わるか（`stem-literal` の宣言を拒むための門） */
const INFLECTABLE_TAIL = /[さしすせそるれえけげてでめ]$/;

/**
 * 語ごとの活用の型の宣言。
 *
 * **`MUTATION_VOCABULARY` と双方向に突き合わせる**（{@link checkVocabularyDeclaresItsConjugation}）。
 * 語を足しても減らしてもここを直さない限り自己検査が赤くなるので、宣言と語彙が黙って
 * 食い違うことはない。
 */
const MUTATION_PARADIGMS: Readonly<Record<string, ConjugationParadigm>> = {
  外す: 'godan-su',
  外せ: 'godan-su',
  外し: 'godan-su',
  消す: 'godan-su',
  消せ: 'godan-su',
  落とす: 'godan-su',
  落とせ: 'godan-su',
  落とし: 'godan-su',
  戻す: 'godan-su',
  戻せ: 'godan-su',
  戻し: 'godan-su',
  書き戻: 'stem-literal',
  変え: 'vowel-stem',
  置き換え: 'vowel-stem',
  替え: 'vowel-stem',
  書き換え: 'vowel-stem',
  無効化: 'stem-literal',
  足す: 'godan-su',
  足し: 'godan-su',
  空にする: 'suru',
  空にすれ: 'suru',
  空にし: 'suru',
  反転させ: 'vowel-stem',
  変異させ: 'vowel-stem',
  変異を掛け: 'vowel-stem',
  変異を当て: 'vowel-stem',
  生きていれ: 'vowel-stem',
  残していれ: 'vowel-stem',
  逐語復元: 'stem-literal',
  狭める: 'vowel-stem',
  狭めれ: 'vowel-stem',
  広げる: 'vowel-stem',
  広げれ: 'vowel-stem',
};

/**
 * 宣言された活用の型から、その語が属する活用形の全体を導く。
 *
 * 型と語形が噛み合わないときは形を返さず**理由を返す**（型の宣言そのものの誤りを
 * 告発させるため）。とくに `stem-literal` は活用しうる送り仮名で終わる語には使えない
 * ——さもなければ、`落とす` を `stem-literal` と宣言するだけで網羅の確認を黙らせられる。
 */
function conjugationFormsOf(
  word: string,
  paradigm: ConjugationParadigm
): { forms: readonly string[] } | { error: string } {
  if (paradigm === 'godan-su') {
    const ending = GODAN_SU_ENDINGS.find((tail) => word.endsWith(tail));
    if (ending === undefined || word.length <= ending.length) {
      return { error: `五段サ行と宣言されているが「さ・し・す・せ・そ」で終わっていない` };
    }
    const base = word.slice(0, -ending.length);
    return { forms: GODAN_SU_ENDINGS.map((tail) => base + tail) };
  }
  if (paradigm === 'suru') {
    const ending = SURU_ENDINGS.find((tail) => word.endsWith(tail));
    if (ending === undefined || word.length <= ending.length) {
      return { error: `サ変と宣言されているが「する・すれ・し・せ・さ・しろ」で終わっていない` };
    }
    const base = word.slice(0, -ending.length);
    return { forms: SURU_ENDINGS.map((tail) => base + tail) };
  }
  if (paradigm === 'vowel-stem') {
    const stem = /[るれ]$/.test(word) ? word.slice(0, -1) : word;
    if (stem.length === 0 || !VOWEL_STEM_TAILS.test(stem)) {
      return { error: `母音幹と宣言されているが語幹「${stem}」が母音幹の形をしていない` };
    }
    return { forms: [stem] };
  }
  if (INFLECTABLE_TAIL.test(word)) {
    return {
      error: `語幹そのもの（活用しない語）と宣言されているが、活用しうる送り仮名で終わっている`,
    };
  }
  return { forms: [word] };
}

/**
 * 宣言した語彙のすべてが活用の型を持ち、宣言だけが残っていないこと（タスク 115.319）。
 *
 * これは {@link checkEveryVocabularyEntryIsFixed} の**逆向き**を成立させるための土台である。
 * 同関数は「宣言した語が実効を持つ」ことしか固定しない。実効を持つ語が宣言に揃っているかを
 * 見るには、まず語彙と活用の宣言が一対一であることが要る。
 *
 * **実測（2026-09-07。リポジトリルート）**: `MUTATION_VOCABULARY` へ `'書き換え'` を足して
 * ここを直さないと、落ちる確認は 2 件——本確認（「活用の型が宣言されていない」）と
 * {@link checkEveryVocabularyEntryIsFixed}（見本が無い）である。逆に `MUTATION_PARADIGMS` の
 * `落とす` を `'stem-literal'` へ書き換えると、{@link conjugationFormsOf} が「活用しうる
 * 送り仮名で終わっている」として拒み、落ちる確認は本確認 1 件だけになる。
 * **網羅の確認を黙らせる向きの書き換えが、ここで止まる。**
 * 変異はいずれも退避した控えからの書き戻しで復元し、復元後に緑へ戻ることを確かめた。
 */
function checkVocabularyDeclaresItsConjugation(): string[] {
  const failures: string[] = [];
  const declared = Object.keys(MUTATION_PARADIGMS);
  if (declared.length === 0) failures.push('活用の型の宣言が空である');
  for (const word of MUTATION_VOCABULARY) {
    const paradigm = MUTATION_PARADIGMS[word];
    if (paradigm === undefined) {
      failures.push(`変異の語「${word}」の活用の型が宣言されていない`);
      continue;
    }
    const derived = conjugationFormsOf(word, paradigm);
    if ('error' in derived) {
      failures.push(`変異の語「${word}」の活用の型の宣言が語形と合わない: ${derived.error}`);
      continue;
    }
    // 導いた活用形のいずれかが語自身の部分文字列であること。母音幹は語幹だけを形として
    // 持つため（`狭める` に対する `狭め`）、包含の向きは「語が形を含む」で見る。
    if (!derived.forms.some((form) => word.includes(form))) {
      failures.push(
        `変異の語「${word}」が自身の活用形のどれとも重ならない（型の宣言が誤っている）`
      );
    }
  }
  for (const word of declared) {
    if (!MUTATION_VOCABULARY.includes(word)) {
      failures.push(`活用の型だけが残っている（語彙に無い）: ${word}`);
    }
  }
  return failures;
}

/**
 * 実データで**実効を持つ活用形が、宣言に揃っている**こと（タスク 115.319）。
 *
 * 115.265 が開示した非対称——`checkEveryVocabularyEntryIsFixed` は「宣言した語が効く」ことは
 * 確かめるが「効いている語が宣言されている」ことは確かめない——を、ここで塞ぐ。
 * 宣言済みの語の活用の型から未宣言の活用形を導き、その形が**実データで新たに拾う文**
 * （名指しと判定の語を持ちながら、現況の語彙では変異の語を持たない文）を数える。
 * 一件でも拾うなら、その活用形は実効を持っているのに宣言されていない——赤くする。
 *
 * **件数の下限は貼らない。** 拾う文が 0 件であることが合格であり、下限を貼ると
 * 「網羅できている」という合格の意味が逆になる。台が空でないことは、走査した文の総数と
 * 未索引の文の総数の双方が 0 でないことで別に押さえる（第3原則）。
 *
 * **実測（2026-09-07。リポジトリルート）**: `MUTATION_VOCABULARY` と `MUTATION_PARADIGMS`
 * と見本から `落とし` を落とし、対照の下限二つを同じ差分だけ下げて走らせると、落ちる確認は
 * 本確認 1 件だけであり「未宣言の活用形が実効を持つ: 落とし（`落とす` の活用形。8 文）」を
 * 実在の箇所つきで名指しする。変異は退避した控えからの書き戻しで復元し、復元後は落ちる
 * 確認が 0 件に戻ることを確かめた。
 */
function checkNoUnadoptedConjugationFormIsEffective(): string[] {
  const failures: string[] = [];
  let scannedSentences = 0;
  const unindexed: Array<{ location: string; sentence: string }> = [];
  for (const scanDir of SCAN_DIRS) {
    for (const relativePath of collectSourceFiles(ROOT, scanDir)) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
      for (const block of extractCommentBlocks(source)) {
        for (const sentence of splitSentences(blockText(block))) {
          scannedSentences += 1;
          if (!hasBacktickedName(sentence)) continue;
          if (!hasVerdictWord(sentence)) continue;
          if (hasMutationWord(sentence)) continue;
          unindexed.push({ location: `${relativePath}:${block.line}`, sentence });
        }
      }
    }
  }
  // 前提が崩れたら赤くする（走査が空振りしていると、以下の 0 件が恒真になる）
  if (scannedSentences === 0) failures.push('実データから文を一つも取り出せていない');
  if (unindexed.length === 0) {
    failures.push('名指しと判定の語を持ちながら変異の語を欠く文が一つも無い（走査の空振り）');
  }
  for (const word of MUTATION_VOCABULARY) {
    const paradigm = MUTATION_PARADIGMS[word];
    if (paradigm === undefined) continue; // 宣言の欠落は上の確認が告発する
    const derived = conjugationFormsOf(word, paradigm);
    if ('error' in derived) continue; // 型の誤りも上の確認が告発する
    for (const form of derived.forms) {
      // 現況の語彙が既に拾える形は、宣言の落ちではない
      if (hasMutationWord(form)) continue;
      const hits = unindexed.filter((row) => row.sentence.includes(form));
      if (hits.length === 0) continue;
      const shown = hits.slice(0, 3).map((row) => row.location);
      failures.push(
        `未宣言の活用形が実効を持つ: ${form}（${word} の活用形。${hits.length} 文。` +
          `例 ${shown.join(' / ')}）——語彙へ足すか、足したうえで露出する引用欠を修復すること`
      );
    }
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
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (cases.length === 0) {
    failures.push('合成素材 cases が空です（この確認が空振りしています）');
  }
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
    { label: 'hasBacktickedName', declaration: 'export function hasBacktickedName(' },
    { label: 'hasMutationWord', declaration: 'export function hasMutationWord(' },
    { label: 'hasVerdictWord', declaration: 'export function hasVerdictWord(' },
    { label: 'isCounterfactualSentence', declaration: 'export function isCounterfactualSentence(' },
    { label: 'hasExecutionCitation', declaration: 'export function hasExecutionCitation(' },
    {
      label: 'collectNetSentencesInSource',
      declaration: 'export function collectNetSentencesInSource(',
    },
    { label: 'findingsFromNetSentences', declaration: 'function findingsFromNetSentences(' },
    { label: 'countCounterfactuals', declaration: 'export function countCounterfactuals(' },
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
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (bodies.length === 0) {
    failures.push('合成素材 bodies が空です（この確認が空振りしています）');
  }

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
 * 網の広さの三段階を数える出口（`surveyNet`）と全文の列挙（`listCounterfactualSentences`）が、
 * 本検査の走査と同じ台を数えていること。
 *
 * 記録に書いた三段階の件数は、この出口が無ければ後任が追試できない
 * （タスク 115.189 の教訓「追試の手段を成果物に残せない実測は記録に書かない」）。
 * 出口が本検査から離れて独自に数え始めると、記録だけが静かにずれる。
 *
 * **タスク 115.229 の一本化で、この確認が担う範囲は狭まった。** 三条件を当てるのは
 * `collectNetSentencesInSource` だけになり、母集団も列挙も最も狭い段も同じ印
 * （`NetSentence.counterfactual`）を数えるため、**三条件の側の食い違いは構造上起こらない**。
 * 実測: 一本化の前は判定へ第四の条件（`FIGURE` の同居）を足す変異で母集団 47 対 列挙 52 と
 * 乖離して本確認が落ちたが、一本化の後は同じ変異で母集団・列挙・最も狭い段がいずれも
 * 50 で揃い、落ちる 34 件（66 件中）に本確認は含まれない
 * （2026-09-01 に実測。変異は退避した控えからの書き戻しで復元した）。
 *
 * したがって本確認が現に守るのは、構造では担保されない側——走査ファイル数（`run` と
 * `surveyNet` が別々の繰り返しで数える）、段が空でないこと、`listCounterfactualSentences`
 * が独自の絞りを足していないこと、段の包含——である。実測: `surveyNet` の走査ファイル数を
 * 先頭の走査根だけへ狭める変異（`for (const scanDir of scanDirs)` を
 * `for (const scanDir of scanDirs.slice(0, 1))` へ替える）を当てると、66 件中この 1 件
 * だけが落ちる（2026-09-01 に実測。変異は退避した控えからの書き戻しで復元した）。
 *
 * **列挙との突き合わせは件数ではなく同一性で行う。** 件数だけを見る形では、同じ件数のまま
 * **別の集合**を返す列挙を通してしまう。実測: `listCounterfactualSentences` の返り値を
 * `[rows[0], ...rows.slice(0, -1)]` へ替える変異（先頭を重複させ末尾を落とす。返る行は
 * すべて三条件を満たしたままで件数も 55 のまま）を当てると、件数だけを比べていた従前の形は
 * 66/66 で緑のまま素通りし、同一性で突き合わせる現在の形は 66 件中この 1 件だけが落ちて
 * 「列挙が母集団と同じ集合でない（列挙 55 件 / 数え直し 55 件）」と告げる
 * （いずれも 2026-09-01 に実測。変異は退避した控えからの書き戻しで復元した）。
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
  // 型は `as const` で固めない。固めると要素数が型に焼き付き、直後の空の検査を
  // `tsc` が「起こりえない比較」と断じてしまう（第3原則の関門が型で消える）。
  const tiers: readonly (readonly [string, typeof survey.verdictOnly])[] = [
    ['判定の語だけ', survey.verdictOnly],
    ['変異＋判定', survey.mutationAndVerdict],
    ['名指し＋変異＋判定', survey.allThree],
  ];
  // **この素材が空になると「段が空でない」という非空振りの主張そのものが消える**
  // （第3原則。115.252）。素材が空なら以下の照合は一度も回らず、この確認は何も主張しない。
  if (tiers.length === 0) {
    failures.push('素材 tiers が空です（段の非空の確認が空振りしています）');
  }
  for (const [label, tier] of tiers) {
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
  const identity = (row: { file: string; line: number; sentence: string }): string =>
    `${row.file}:${row.line}:${row.sentence}`;
  const recounted = collectNetSentences().filter((row) => isCounterfactualSentence(row.sentence));
  if (listed.map(identity).join(' / ') !== recounted.map(identity).join(' / ')) {
    failures.push(
      `列挙が母集団と同じ集合でない（列挙 ${listed.length} 件 / 数え直し ${recounted.length} 件）`
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

/**
 * 見本が駆動する `scanSource` が、本検査 `run` の検出**そのもの**であること。
 *
 * 自己検査の大半は `scanSource` へ書き方を注入して検出規則を確かめている。その `scanSource`
 * が `run` の出す検出と別実装になれば、見本は**使われていない関数**を守ることになる
 * （タスク 115.227 の型: 確かめている対象が実際に使われているものであること）。
 * リポジトリ本体は検出 0 件で緑であり、0 対 0 の突き合わせは自明に通ってしまう
 * （タスク 115.222 の型）ため、該当の在る仮のリポジトリを作り、突き合わせた台が
 * 空でないことを併せて要求する。
 *
 * **開示済みの限界（タスク 115.222 の作法により、記録ではなく検査の在る場所へ書く）**:
 * 突き合わせるのは 4 文の仮の台の上の**結果**であり、`run` が検出を組み直しても
 * **その台の上で結果が変わらない再実装は捕まえられない**。実測: `run` の
 * `findings: findingsFromNetSentences(rows)` を
 * `rows.filter((row) => row.counterfactual && !row.cited).map(...)` という意味を保つ
 * 書き直しへ替えても、自己検査は 66/66 で緑のままである。同じ形へ
 * `&& row.sentence.length > 200` を足して仮の台の上で結果が分かれるようにすると、
 * 66 件中 2 件（本確認と「走査から報告までが実際に働く」）が落ちる
 * （いずれも 2026-09-01 に実測。変異は退避した控えからの書き戻しで復元した）。
 * すなわち本確認が拘束するのは「同じ関数を通ること」ではなく「同じ結果を出すこと」である。
 */
function checkSampleSubjectMatchesTheRun(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-evidence-subject-'));
  try {
    seedTemporaryRepository(tempRoot);
    for (const scanDir of SCAN_DIRS) {
      fs.writeFileSync(
        path.join(tempRoot, scanDir, 'uncited.ts'),
        seedContent(['// `uncited` を外すと落ちる。', 'export {};', ''])
      );
      fs.writeFileSync(
        path.join(tempRoot, scanDir, 'cited.ts'),
        seedContent(['// `cited` を外すと落ちる（1 件。実測）。', 'export {};', ''])
      );
    }

    const viaRun = run({ root: tempRoot }).findings.map(
      (finding) => `${finding.file}:${finding.line}:${finding.sentence}`
    );
    const viaSamples: string[] = [];
    for (const scanDir of SCAN_DIRS) {
      for (const relativePath of collectSourceFiles(tempRoot, scanDir)) {
        const source = fs.readFileSync(path.join(tempRoot, relativePath), 'utf-8');
        for (const finding of scanSource(relativePath, source)) {
          viaSamples.push(`${finding.file}:${finding.line}:${finding.sentence}`);
        }
      }
    }

    if (viaRun.length !== SCAN_DIRS.length || viaSamples.length !== SCAN_DIRS.length) {
      failures.push(
        `突き合わせる台が期待と違う（期待 ${SCAN_DIRS.length} / 本検査 ${viaRun.length} / ` +
          `見本の対象 ${viaSamples.length}）`
      );
    }
    if (viaRun.join(' / ') !== viaSamples.join(' / ')) {
      failures.push(
        `見本が駆動する scanSource と本検査の検出が食い違う` +
          `（本検査 ${viaRun.length} 件 / 見本の対象 ${viaSamples.length} 件）`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
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
    name: '宣言した語彙のすべてが活用の型を持ち、宣言だけが残っていない',
    expected: false,
    custom: checkVocabularyDeclaresItsConjugation,
  },
  {
    name: '実データで実効を持つ活用形が宣言に揃っている（字面照合の活用落ちを塞ぐ）',
    expected: false,
    custom: checkNoUnadoptedConjugationFormIsEffective,
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
    name: '見本が駆動する検出関数が本検査の検出そのものである（対象の同一性）',
    expected: false,
    custom: checkSampleSubjectMatchesTheRun,
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

/**
 * 仮設リポジトリへ書き込む種を組み立てる（AI運用7原則 第3原則。タスク 115.252 の是正。指摘 (2)）
 *
 * 種の中身は、そのあとに続く照合の**前提**である。素材を落として種を空文字にすると、
 * 「生成物に置いた該当は数えない」「引用を足せば合格する」「列挙と本検査の母集団が一致する」
 * といった主張は、比べる対象そのものが無くなって恒真になる。**実測（2026-09-03、リポジトリ
 * ルート）**: 生成物へ置く種の素材を空にして `npx tsx scripts/check-counterfactual-evidence.selftest.ts`
 * を走らせると **72/72 件の確認に成功しました・EXIT=0** であった。素材の外側に置いたこの
 * 組み立て器で空を拒み、種を書く全箇所へ一度に効かせる。
 */
function seedContent(lines: readonly string[]): string {
  if (lines.length === 0) {
    throw new Error('仮設リポジトリの種 seedContent の素材が空です（この確認が空振りしています）');
  }
  return lines.join('\n');
}

/**
 * 注入するコメント塊が空でないことの関門（AI運用7原則 第3原則。タスク 115.252 の是正。指摘 (2)）
 *
 * 本ファイルの見本は `lineComment(...)` / `blockComment(...)` / `[...].join('\n')` で塊を
 * 組み立てる。素材を落として `source` を空文字にした見本は `scanSource` が findings 0 件を
 * 返すため、`expected: false` の側の主張がそこで恒真になる。**実測（2026-09-03、リポジトリ
 * ルート）**: `MUST_NOT_DETECT` の先頭の見本の `source` を `''` にし、この関門を外した状態で
 * `npx tsx scripts/check-counterfactual-evidence.selftest.ts` を走らせると **72/72 件の確認に
 * 成功しました・EXIT=0**。同じ状態でこの関門を戻すと **EXIT=1**（当該見本 1 件が赤）。
 * 変異は退避した控えからの書き戻しで復元し、`sha256sum` で照合した。
 *
 * 個々の素材の直前ではなく、**素材の外側にある実行側**（115.247 の作法）へ一度だけ貼って、
 * `custom` を持たないすべての見本へ効かせる。`custom` を持つ見本は走査を行わないため
 * `source` を持たなくてよく、`runCase` の早期復帰で外れる。
 *
 * **形は真偽を返す述語にする。** 失敗の綴りを返す関数（`string[]` を返す形）にすると、
 * その `return [...]` の配列リテラルを `[]` へ空化するだけで関門の指摘ごと消える。
 * 述語＋呼び出し側の直 `failures.push(...)` なら、関門は配列リテラルを一切経由しない。
 */
function caseSourceIsEmpty(testCase: Case): boolean {
  return (testCase.source ?? '').trim() === '';
}

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  // **関門の結果を配列リテラルへ経由させない。** 是正の一次案は関門を `string[]` を返す関数に
  // していたが、その戻り値の配列リテラルを `[]` へ空化すると関門の指摘ごと落ちる
  //（115.252 の候補3 の自己隠蔽が是正そのものに現れる形）。真偽を返す述語にして直に押す。
  const failures: string[] = [];
  if (caseSourceIsEmpty(testCase)) {
    failures.push(
      `見本「${testCase.name}」の注入する塊 source が空です` +
        '（素材を空にする変異でこの見本は恒真になります）'
    );
  }
  const findings = scanSource('sample/example.ts', testCase.source ?? '');
  const detected = findings.length > 0;
  if (detected && !testCase.expected) {
    failures.push(
      `検出されてはならないが検出された: ${findings.map((f) => f.sentence).join(' / ')}`
    );
  }
  if (!detected && testCase.expected) {
    failures.push('検出されなければならないが検出されなかった');
  }
  return failures;
}

interface Group {
  readonly title: string;
  readonly cases: readonly Case[];
}

/**
 * 見本の極性（タスク 115.252）
 *
 * **名前の綴りからも変数名からも導かない**（115.247 の作法）。要素が持つ `expected` 属性——
 * 「検出されなければならない」か否か——がそのまま極性である。`custom` を持つ要素は機構の
 * 確認であって検出の対照ではないため、極性を持たない。
 */
function polarityOf(one: Case): 'positive' | 'negative' | undefined {
  if (one.custom !== undefined) return undefined;
  return one.expected ? 'positive' : 'negative';
}

/**
 * 陽性対照・陰性対照の件数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く。
 * **タスク 115.319 の提出時点の再実測は陽性 45 / 陰性 20 である**（2026-09-07 に同じ手順で
 * 取り直した）。陽性が 41 から 45 へ動いたのは、字面照合の活用落ちを塞ぐために採った三形
 * （`落とし` / `戻し` / `空にし`）の見本と、`戻し` の採用で重複しなくなった `書き戻` の
 * 単独の実効を固定する見本とを、いずれも陽性側へ新設したためである。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 *
 * **陰性の下限が 22 から 20 へ下がった経緯**（タスク 115.265。2026-09-03 の値は
 * 陽性 36 / 陰性 22 / 総数 72 であった）: 115.248 が過検出として陰性側へ据えていた二件
 * （「差し替え」「足す」）は、測り直すと**引用を欠いた本物の反実仮想**であった。二件は
 * 削ったのではなく陽性側へ移してある。同時に陽性側へ三件を新設したため、陽性は 36 から
 * 41 へ、総数は 72 から 75 へ動いた。**陰性側が痩せたのは判定の是正の結果であって、
 * 対照を捨てたからではない。**
 *
 * **陰性の下限が 20 から 19 へ下がった経緯**（タスク 115.320。2026-09-07 の値は
 * 陽性 45 / 陰性 20 / 総数 81 であった）: 同じ型の是正がもう一度起きた。115.265 が
 * 「現在の語彙の限界の開示」として陰性側へ据えていた一件（「無効化」）は、語を採ると
 * **引用を欠いた本物の反実仮想**であった。ここでも削らずに陽性側へ移してある。同時に
 * 陽性側へ「書き換え」の合成の見本を一件新設したため、陽性は 45 から 47 へ、総数は
 * 81 から 82 へ動いた。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_POSITIVE_CONTROLS = 47;
const MINIMUM_NEGATIVE_CONTROLS = 19;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-counterfactual-evidence.selftest.ts | tail -1` の出す値をそのまま置く。
 * **確認を減らす向きの書き換えは差分に現れる。**
 * **タスク 115.319 の提出時点の再実測は 81 である**（2026-09-07 に同じ手順で取り直した）。
 * 75 から動いた内訳は、陽性対照の新設 4 件と、活用の網羅を見る確認の新設 2 件
 * （`checkVocabularyDeclaresItsConjugation` と
 * `checkNoUnadoptedConjugationFormIsEffective`）である。
 * **タスク 115.320 の提出時点の再実測は 82 である**（2026-09-08 に同じ手順で取り直した）。
 * 81 から動いた内訳は、陽性対照の新設 1 件（「書き換え」の合成の見本）だけである
 * ——「無効化」の実物は陰性側から陽性側へ**移った**ので総数を動かさない。
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 導けないため件数で貼る。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_TOTAL_CASES = 82;

// ============================================================================
// 本自己検査群が閉じている範囲と、閉じていない範囲（タスク 115.252。**正典**）
// ============================================================================
//
// タスク 115.252 の候補5 は「配列リテラルを空にできる箇所が残っていないか」を問うた。
// この問いは**そのままでは閉じない**。本自己検査群は失敗の指摘を一律 `string[]` で表すため、
// 「配列リテラルを `[]` にする」変異には**主張そのものを削る変異**が含まれ、それは一般に
// 検出できないからである（主張が無ければ反証も無い）。そこで判定基準を
// **「空にすると実行側の報告件数が縮むのに EXIT=0 になるか」**——真空パスの有無——へ置いた。
//
// 以下は 2026-09-03 にリポジトリルートで**この実装者が取り直した**実測である。値はすべて
// 併記したコマンドが出したものをそのまま置いた。**限界の記録はここ一箇所に置く**
// （境界内の 13 ファイルへ散らさない）。各層の主張はコマンドを走らせれば反証できる。
//
// ## (A) 機械が保証する層
//
// 数値下限（陽性対照・陰性対照・確認の総数）、群ごとの非空、そして構造から導く極性の要求。
// 下限は現況ちょうど（余裕ゼロ）で貼るため、確認を一件でも削れば当該の自己検査が赤くなる。
//   for f in scripts/*.selftest.ts; do npx tsx "$f" > /dev/null || echo "赤: $f"; done
//   npx tsx scripts/list-control-polarity-floors.ts
// 実測（2026-09-03）: 自己検査 15 本はすべて EXIT=0。件数は順に
// 72 / 20 / 72 / 30 / 31 / 44 / 56 / 196 / 27 / 65 / 64 / 45 / 41 / 19 / 32。
// 下限を宣言する 13 本はいずれも余裕 0 であった。下限を宣言しないのは境界外の 2 本
// （`check-design-path-references.selftest.ts` と `check-requirement-exclusions.selftest.ts`）
// だけであり、一覧はその 2 本を「下限の宣言なし」として名指しで出す。
//
// **「余裕 0」は実効性を意味しない**（限界の開示）。`check-requirement-coverage.selftest.ts`
// の極性下限は `陽性対照 1/1 ・ 陰性対照 1/1 ・ 総数 65/65` である。総数 65 件の確認のうち
// **極性を持つ確認は 2 件しかなく**、極性が痩せる向きの変異をこの下限はほぼ捕まえられない。
// 総数の下限（余裕 0）と、当該ファイルの最上位対照配列 8 件が 8/8 赤であること（下の (B)）で
// 守られてはいるが、一覧に並ぶ「余裕 0」という体裁を実効性と読まないこと。極性を持つ確認が
// 2 件しかないのは、極性を宣言する 9 本のうちこの 1 本だけである（他は 9 件〜63 件）。
//
// ## (B) 人手で全数を走査した層
//
// 走査範囲は日本語ではなくコマンドで宣言する（115.274 / 115.275 の作法）。
//   npx tsx scripts/scan-control-array-mutations.ts --census
//   npx tsx scripts/scan-control-array-mutations.ts --mutate-top-level
// 実測（2026-09-03。対象は `scripts/*.selftest.ts` の 15 ファイル）:
//   - 非空の配列リテラル（AST の `ArrayLiteralExpression` で要素数 1 以上。深さは問わない）
//     … 1360 件
//   - うち全称量化の定義域にあたる**最上位の対照配列**（ソースファイル直下の変数宣言で
//     初期化子が非空の配列リテラルのもの）… 99 件
//   - その 99 件を一件ずつ `[]` へ空化した全数変異 … 赤 98 件 / 緑 1 件
//   - 緑の 1 件は `check-requirement-exclusions.selftest.ts` の `MECHANISM_CASES`（要素 20）で、
//     空にすると `✅ 自己検査に合格しました（44/44 件: 陽性対照 37 / 陰性対照 7 / 機構 0）` と
//     出して EXIT=0 になる（基線は 64/64）。**本タスクの境界外**であり、担当は 115.222 である。
//   - **本タスクの境界内 13 ファイルに属する 85 件は 85/85 が赤**であった。すなわち
//     この変異作用素で見えるかぎり、境界内に真空パスは残っていない。
//
// ## (C) 走査していない残余（この検査が閉じないと明言すること）
//
// **主張そのものを削る変異は本検査の対象外である。** `return [...]` が返す失敗の綴りや、
// 見本が持つ `expected:` の値を消す変異がこれに当たる。対象外にする理由は、**主張の削除が
// 一般に検出できない**ためであり、「空にできるか」という基準ではこの層を判別できないから
// である。**「あらゆる検査で緑を残す」とは書かない。それは恒真であり反証できないうえ、
// 下に置いた自分の実測と食い違う。**
//   npx tsx scripts/scan-control-array-mutations.ts --mutate-returns
// 実測（2026-09-03）: `return [...]`（非空の配列リテラルを返す return 文）は 15 ファイルに
// 132 件あり、一件ずつ `return []` へ空化すると 緑 130 件 / 赤 2 件であった。赤の 2 件は
// いずれも境界外の `check-requirement-exclusions.selftest.ts` にある、共有モジュールの
// **唯一担い手性**を見る検査である（`:909` と `:960` の `return`。要素はいずれも 2）。
// **本タスクの境界内 13 ファイルに属する 105 件は 105/105 が緑**である。
//
// この層は件数では閉じられない。閉じるには「失敗の綴りを返す関数が空配列を返さないこと」を
// 型ないし構造で要求する必要があり、本タスクではそこまで広げていない。もう一つの残余として、
// `main()` から関門の呼び出しそのものを落とす変異がある。呼び出しの直列性を構造で要求する形は
// `check-design-path-references.selftest.ts`（115.242）にはあるが、本ファイルを含む境界内の
// 13 ファイルへは展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `MUST_DETECT` / `MUST_NOT_DETECT` は既存の要素側の確認が捕まえたが、`STRUCTURAL` を空に
 * すると **58/58 緑・EXIT=0**（守り手自身が `STRUCTURAL` の中に居るため自分を守れない）。
 * `main()` の中の `groups` を空にすると **0/0 緑・EXIT=0**。
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形——本ファイルの
 * `STRUCTURAL` に載っていた `checkControlsArePresent()` がまさにそれ——は、**配列ごと空にすると関門も
 * 一緒に消える**（115.252 の候補3）。`main()` の中、確認の実行より前に、配列の外側から貼る。
 * 既存の要素側の確認は残してあるが、それは冗長な二重掛けであって関門ではない。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」と
 * 「要求した極性が 1 件以上残ること」までしか課せない（件数を導く語彙が本体に無い。
 * 115.222 が陰性対照について書き残した限界と同じ形）。
 *
 * **もう一つの限界**: `main()` からこの関門の呼び出し自体を落とせば、関門は走らなくなる。
 * 呼び出しの直列性を構造で要求する形——115.242 が `check-design-path-references.selftest.ts`
 * に置いた「深さ 0・文の先頭・呼び出し直後の `;`」の三点——は、本タスクでは各ファイルへ
 * 展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 */
function guardControlsArePresent(groups: readonly Group[]): void {
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
  const polarities = groups.flatMap((group) => group.cases.map((one) => polarityOf(one)));
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
  const groups: Group[] = [
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
  // 対照群の配列の外側に置く関門。実行より前に、群そのものが在ることを確かめる。
  guardControlsArePresent(groups);
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
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
