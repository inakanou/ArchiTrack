/**
 * @fileoverview 設計文書が引く実測値の鮮度を機械で見る検査
 *
 * ## なぜ在るか（タスク 115.232）
 *
 * 設計文書が引く件数が現況と一致するかを見る関門は、本検査を置くまで**存在しなかった**。
 * 「無い」の走査範囲をコマンドで宣言する（日本語で範囲を宣言しない。開発規律の第2層の作法）。
 * `grep -ln 'design\.md\|design-document' scripts/check-*.ts | grep -v selftest` が挙げるのは
 * 9 件で、本検査を除くと 8 件である（2026-09-01 に実測）。その 8 件を一件ずつ走らせて要約行を
 * 読んだ結果、**文書側の数値と再現コマンドの出力を突き合わせるものは 0 件**であった（同日に実測）。
 * `check:design-refs` は参照の形式を、`check:design-code-refs` は本番コードへの参照の形式を、
 * `check:design-path-refs` はパスの実在を、`check:cf-evidence` はコード注釈の反実仮想を、
 * `check:trace-coverage` は追跡表と受入基準の対応を、`check:steering-refs` /
 * `check:steering-idents` / `check:steering-test-tree` は steering の側を見る。
 * どれも「本書が引く 216 件は今日も 216 件か」を問わない
 * （`216 件` は `design.md` が人手走査の母集団として引いている値で、同書に 1 箇所ある。同日に実測）。
 * 上の走査に掛からない関門（`design.md` を読まない検査）については保証しない。
 * `.kiro/specs/site-survey/design.md` 自身が第1層でこの不在を宣言している。
 *
 * 不在の代償は実測されている。タスク 115.212 は同型の掃き残しで**三度**、115.213 は**一度**
 * 差し戻された。とくに本書が自分自身を数える四値（強調記号を課す網・課さない網・再現コマンドを
 * 同じ行に持つ行・実測日を持たない残余）は、**それを述べる行自身が母集団に属する**ため、
 * 文書へ書き足すたびに動く。人手で一つずつ測って書き入れる手順は現に食い違っており、
 * 本検査を置いた 115.232 の提出時点では四値はいずれも文書側が古かった
 * （{@link DECLARED_STALE_DOCUMENT_FIGURES} が当時 4 件を要求していた）。
 * **タスク 115.270 がその四件を解消し、同定数は 0 件である**——文書側は現況を述べる字面を
 * 錨に採り、115.213 の提出時点の値は同じ行に歴史記録として残している
 * （下の「見ないこと」の「歴史記録と現況の区別は見ない」を見よ）。要約行は毎回この件数を印字する。
 *
 * ## 何を宣言し、何を突き合わせるか
 *
 * `scripts/design-measurements.json` の `entries` が一件ずつ次を宣言する。
 *
 *   - `id`: 宣言の識別子（重複は失敗）
 *   - `file`: 数値を載せている文書（リポジトリルート相対）
 *   - `anchor`: その数値を載せている**行**を一意に定める逐語の断片。
 *     0 行に当たるのも 2 行以上に当たるのも失敗にする
 *   - `command`: リポジトリルートで走らせると数値を再現するコマンド
 *   - `expected`: `command` の標準出力（前後の空白を除いたもの）と一致しなければならない値
 *   - `documentFigure`: 文書が載せている値。既定は `expected`
 *   - `documentRendering`: `anchor` の行に**ちょうど 1 箇所**現れていなければならない字面。
 *     既定は `documentFigure` そのもの。`documentFigure` を含んでいなければならない
 *   - `divergence`: `documentFigure` が `expected` と異なるときに必須。`kind` と `reason` を持つ
 *
 * **素の数字だけでは足りない。** 同じ行の別の数値に当たってしまう——`Component Summary` の
 * 節数を数える行は再現コマンドに `#{3,4}` を含むため、文書側の出力を `3` から `4` へ書き換えても
 * 素の `3` は残る。実際にこの変異を当てたところ、1 箇所であることを課す前の版は緑のまま
 * 素通りした（2026-09-01 に実測）。1 箇所を課したうえで当該の宣言を `` の出力が `3` `` へ
 * 改めると、同じ変異で「載せていません」として赤くなる（同日に実測）。
 * 現在の宣言 30 件のうち記法ごとの宣言を持つのは 23 件、素の字面のままは 7 件である（2026-09-02 に実測。
 * 本注釈を置いた 115.232 の提出時点は 29 件 / 22 件 / 7 件であり、タスク 115.233 が
 * `self-report-audit-implementation-files` を一件足した）。
 *
 * ## 一方向では足りない（タスク 115.227 の作法）
 *
 * `expected` と `command` の出力だけを突き合わせる形にすると、**宣言だけが新鮮で文書は古い**
 * 状態が緑で通る。宣言は文書の外に在るからである。そこで **`anchor` の行が `documentFigure` を
 * 現に載せていること**も課し、二方向で一致させる。
 *
 *   - 現況が動いた → `command` の出力が `expected` とずれて赤くなる
 *   - 文書の数値だけを書き換えた → `documentFigure` が行から消えて赤くなる
 *   - 宣言の `expected` だけを書き換えた → コマンドの出力とずれて赤くなる
 *   - 宣言の `documentFigure` だけを書き換えた → 行の字面とずれて赤くなる
 *
 * **「宣言をどう書き換えても赤くなる」ではない。** `command` を別の綴りへ差し替えて
 * 同じ出力を作れば緑のまま通る（下の「見ないこと」の空洞化の経路。実測済み）。
 *
 * ## 文書が古いことを宣言できる（タスク 115.228 の exact 判定）
 *
 * 文書側が現に古い値を載せている箇所は、`documentFigure` を `expected` と別に書き、
 * `divergence` へ理由を添えて**宣言**する。宣言は片道ではない。
 *
 *   - `documentFigure` が `expected` と等しいのに `divergence` があれば失敗（宣言が defect より長生きしている）
 *   - `documentFigure` が `expected` と異なるのに `divergence` が無ければ失敗
 *   - `kind: 'stale'` の件数は {@link DECLARED_STALE_DOCUMENT_FIGURES} と**完全に一致**しなければ失敗。
 *     新たな陳腐化も、解消済みの宣言の置き去りも、どちらも赤くなる
 *
 * **この宣言には穴がある。** 上限を先回りで緩める経路（`divergence` を足して定数を増やす）は
 * 塞げていない。タスク 115.228 が `FEATURE_POLICIES` について書き残したのと同じ限界であり、
 * ここでも解いていない。歯止めは件数が要約行へ毎回印字されることと、定数の変更が差分に現れることだけである。
 *
 * ## 母集団が空なら失敗する（AI運用7原則 第3原則）
 *
 * 宣言が 0 件のときは「合格」ではなく前提の崩壊として赤くする。加えて {@link MINIMUM_ENTRIES} を
 * 下回っても赤くする。**構造から導ける下限を本検査の設計では見つけられなかった**——タスク 115.222 が
 * 陽性対照へ課したような「本体の語彙を全て名指ししていること」に相当する構造が、文書中の数値の側に
 * 見当たらない（見つからなかったのであって、存在しないことを示したのではない）。
 * そこで件数の下限をコードへ書く。タスク 115.222 が名指した弱点（現況を貼ると正当な削減まで止まる）は
 * ここにも当てはまる。宣言を減らす変更は定数の書き換えを伴い、差分としてレビューに現れる。
 *
 * ## コマンドを走らせることについて
 *
 * 本検査は宣言に書かれたシェルのコマンドを `bash -c` で実行する。**これは新しい権限ではない。**
 * 宣言を書き換えられる者は `package.json` の `scripts` も検査本体も書き換えられる。
 * それでも、宣言が黙って実行系になることを避けるため、コマンドを次の形に縛る。
 *
 *   - {@link splitCommandSegments} が引用を見ながら区切り（`|` `&` `;` 改行 `(` `)` `$(` `<(` `` ` ``）で
 *     コマンドを割る
 *   - 各区切りの先頭語が {@link READ_ONLY_COMMANDS} に無ければ失敗
 *
 * **これは権限の境界ではない。** 7 形を {@link splitCommandSegments} と {@link leadingWord} へ
 * 直接かけて数えたところ、`find . -name x -exec rm {} ;`・`git rm --cached a.md`・
 * `git checkout .`・`npx tsx scripts/whatever.ts`・`node -e "...writeFileSync..."`・
 * `grep -c 'rm -rf /' a.md`（引用の内側は実行されないので副作用も無い）の 6 形が通り、
 * 二重引用の内側の置換 `grep -c "$(rm -f /tmp/x)" a.md` の 1 形だけが `rm` として落ちた
 * （2026-09-01 に実測）。**リダイレクトも止まらない**——`grep -c x a.md > /tmp/f` / `>>` / `2>`
 * はいずれも先頭語が `grep` であるため通る（三形とも同じ経路で確認した。同日に実測）。
 * 止まるのは「宣言した綴り以外の先頭語」だけであり、
 * 狙いは逸脱をレビューに見えるようにすることである。
 *
 * ## 宣言に入れなかった値（実測に基づく除外）
 *
 *   - **実ディスクを権威にした非実在パスの件数**: 値が作業ツリーの状態に依存する。
 *     `.kiro/specs/site-survey/design.md` 自身が変異の実測を載せている（`mkdir -p backend/coverage`
 *     を当てると出力が 16 から 15 へ落ち、`rmdir` で戻ると 16 へ復する）。この実測から、
 *     押下前の関門に載せれば被覆計測の直後に赤くなる形だと判断して宣言から外した
 *     （**関門へ載せて赤くなることを確かめてはいない**。同書の実測からの推論である）。
 *   - **`strokeWidth` の同形の残存確認**: 封じているのは「行に載る字面が数値でないこと」ではない。
 *     `countFigureOnLine` は数値でない字面も逐語で数えるため、`documentRendering` に
 *     `出力は**空**である` を採れば当該行にちょうど 1 箇所で束縛でき、錨と字面の判定は通る。
 *     実際に束縛して走らせたところ、残る失敗は (a)「expected が空です」、
 *     (b)「documentFigure `空` が expected `` と異なるのに divergence の宣言がありません」、
 *     (c)「コマンドが終了コード 1 で失敗しました」の 3 件であり、錨・字面についての失敗は
 *     0 件であった（2026-09-01 に実測）。封じ込め要因は
 *     {@link shapeFailures} の `isNonEmptyString(entry.expected)` である——この条件だけを
 *     外す変異を当てると (a) が消えて残りは 2 件になった（同日に実測）。
 *     `expected` を `空` に改め終了コードも 0 に均した版では
 *     「引く値が現況と食い違います: expected=\`空\` actual=\`\`」の 1 件になる（同日に実測）。
 *     つまり文書の「空」は出力そのものではなく出力の言い換えであり、
 *     `expected` に採れる値が無い。よって宣言から外した。
 *   - **`N ファイル` / `N 箇所` / `N 行` / `N%` の形**: `design.md` の第1層が自ら
 *     「網に掛からない」と宣言している綴りである。本検査もそこへは手を伸ばしていない。
 *     **ここに件数を書かない。** `check:cf-evidence` の走査母集団は `scripts/` を含むため、
 *     本検査のような `.ts` を足す変更のたびに動く。数字を書けばこの行自身が
 *     「引く件数が古くなる」側へ回る（本検査が塞ごうとしている形そのもの）。
 *     測り直す出口だけを置く: 文書側は
 *     `grep -n '走査は本番コード' .kiro/specs/site-survey/design.md`、
 *     検査側は `npm run check:cf-evidence` の要約行。両者は基準が異なる
 *     （前者は本番コード、後者は走査対象の全体）。
 *
 * ## 見ないこと（限界）
 *
 *   - **宣言に無い数値は見ない。** 本検査は網羅を主張しない。`design.md` の数値のうち
 *     どれを宣言するかは人の判断であり、宣言しなければ黙って外れる
 *   - **`anchor` の行に `documentRendering` がちょうど 1 箇所在ることしか見ない。** その 1 箇所が
 *     本当にその数値の記述であるかは見ない。多義であることは検出するが、意味は見ない
 *   - **`anchor` と `command` が関係していることは見ない（空洞化の経路）。** 錨の行と
 *     再現コマンドを結び付ける判定は無い。29 件すべてを「一意な錨の行 + `printf` の一桁」へ
 *     置き換えた仮マニフェストを `--manifest` で与えたところ、要約行は
 *     「宣言 29 件 / 文書側が古いと宣言した箇所 4 件」を出し、終了コード 0 で緑になった
 *     （2026-09-01 に実測）。{@link MINIMUM_ENTRIES} は件数しか見ず、
 *     {@link DECLARED_STALE_DOCUMENT_FIGURES} も `divergence` の有無しか見ないため、
 *     **件数を減らさずに中身を空にする改変はこの二つの歯止めをすり抜ける**。
 *     残る歯止めは宣言の差分がレビューに現れることだけである
 *   - **歴史記録と現況の区別は見ない。** 同じ行が当時の値と現況の値の両方を載せる形は、
 *     現況の側を `documentFigure` に採れば通る。当時の値が正しいかは見ない
 *   - **どのスペックの押下かは見ない。** 本検査は押下前の関門に載っており、宣言が指す文書は
 *     {@link GOVERNED_DOCUMENTS}（現在は現場調査スペックの設計文書）に限られる。
 *     別スペックだけを触っている者の押下も、現場調査の設計文書が引く値が現況とずれていれば
 *     止まる。押下者の変更範囲と関門の対象範囲は結び付いていない
 *   - **`git ls-files` を使う宣言は指標に依存する。** `nonexistent-paths-by-git-index` の
 *     再現コマンドは版管理の一覧を実在の権威に採るため、作業ツリーではなく**指標**を見る。
 *     実測: `scripts/__index-probe.tmp` を作ると `ls` は 1 件を返すのに
 *     `git ls-files | grep -c '__index-probe.tmp'` は 0 件のままで、`git status` は
 *     `?? scripts/__index-probe.tmp` と出た（2026-09-01 に実測。確認後に削除した）。
 *     すなわち作業ツリーに在っても指標に無いファイルは、この宣言にとって「実在しない」
 *
 * `MINIMUM_ENTRIES` / `DECLARED_STALE_DOCUMENT_FIGURES` を含め、上の限界はいずれも
 * 「本検査だけで宣言の質を保証しない」ことを述べている。質の担保は差分のレビューにある。
 *
 * ## 本注釈が引く数字について
 *
 * 変異と実測は 2026-09-01 に行い、**提出の直前（2026-09-02）に一件ずつ測り直した**
 * （タスク 115.189 の教訓「記録が引く件数は提出時に測り直す」）。宣言 29 件 / 記法ごと 22 件 /
 * 素の字面 7 件 / 文書側が古い 4 件 / `design.md` を読む検査 8 件 / 綴りの 9 形（通 4・落 5）と
 * 7 形（通 6・落 1）は、いずれも日をまたいでも同じ値であった（**この六つは 115.232 の提出時点の記録である**。
 * 宣言と記法ごとの件数は後続のタスク 115.233 が一件足して 30 件 / 23 件になった。2026-09-02 に実測）。
 * **`check:cf-evidence` の走査件数のように、本検査自身の追加で動く値はここに書かない**
 * （上の「宣言に入れなかった値」の三つ目を見よ）。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-measurement-freshness.ts [--verbose] [--json] [--manifest=<path>]
 *   npm run check:design-measurement-freshness
 *   npm run check:design-measurement-freshness:verbose   宣言ごとの実測値を印字する（測り直しの出口）
 *   npm run check:design-measurement-freshness:json
 *   npm run check:design-measurement-freshness:selftest
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** 宣言の既定の位置（リポジトリルート相対） */
export const DEFAULT_MANIFEST_PATH = 'scripts/design-measurements.json';

/**
 * 宣言が必ず一件以上覆っていなければならない文書
 *
 * 文書がここに挙がっていて宣言が一件も無ければ失敗する。文書を増やすときはここへ足す。
 */
export const GOVERNED_DOCUMENTS: readonly string[] = ['.kiro/specs/site-survey/design.md'];

/**
 * 宣言の件数の下限
 *
 * 2026-09-01 の時点の宣言は 29 件である。**構造から導ける下限を見つけられなかったのでコードへ書く**
 * （冒頭の「母集団が空なら失敗する」を見よ。AI運用7原則 第3原則。
 * タスク 115.222 の作法と、そこで名指しされた弱点の両方が当てはまる）。
 */
export const MINIMUM_ENTRIES = 29;

/**
 * 文書側が現に古い値を載せていると宣言してよい件数（完全一致）
 *
 * 2026-09-01 の時点では 4 件であった——`design.md` が自分自身を数える四値である。
 * **タスク 115.270 がこの四件を解消したので 0 件へ締めた**（コミット `dc76e1d9` の版に対し
 * 2026-09-04 に実測。文書側の四値を現況の 92 / 267 / 98 / 199 へ改め、四件の `divergence` を外した）。
 * 増えても減っても失敗する（タスク 115.228 の exact 判定）。
 */
export const DECLARED_STALE_DOCUMENT_FIGURES = 0;

/**
 * コマンドの各区切りの先頭語として許す綴り
 *
 * 権限の境界ではない（冒頭の注釈を見よ）。逸脱をレビューに見えるようにするための宣言である。
 */
export const READ_ONLY_COMMANDS: readonly string[] = [
  'awk',
  'basename',
  'cat',
  'cut',
  'dirname',
  'find',
  'git',
  'grep',
  'head',
  'ls',
  'node',
  'npm',
  'npx',
  'printf',
  'sed',
  'sort',
  'tail',
  'test',
  'tr',
  'true',
  'uniq',
  'wc',
];

/** コマンド一本あたりの実行時間の上限 */
export const COMMAND_TIMEOUT_MS = 60_000;

/** 宣言された食い違いの種別 */
export type DivergenceKind = 'stale';

export interface Divergence {
  readonly kind: DivergenceKind;
  readonly reason: string;
}

/** 宣言の一件 */
export interface ManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly anchor: string;
  readonly command: string;
  readonly expected: string;
  readonly documentFigure?: string;
  readonly documentRendering?: string;
  readonly divergence?: Divergence;
  readonly note?: string;
}

/** 失敗の一件 */
export interface Finding {
  readonly id: string;
  readonly file: string;
  readonly anchor: string;
  readonly message: string;
}

/** 実測の結果（--verbose / --json が読む） */
export interface Measurement {
  readonly id: string;
  readonly file: string;
  readonly expected: string;
  readonly actual: string;
  readonly documentFigure: string;
  readonly stale: boolean;
}

// ============================================================================
// コマンドの綴りを見る
// ============================================================================

/** 入れ子の置換を抜けたときに戻る場所 */
interface SegmentFrame {
  readonly text: string;
  readonly double: boolean;
  readonly closer: string;
}

/**
 * 引用を見ながらコマンドを区切りで割る
 *
 * 単引用の内側では何も区切りにしない。二重引用の内側でも `$(` と `` ` `` は
 * シェルが展開するため置換の開始として扱う。置換を閉じたら**外側の区切りへ戻る**——
 * `)` の枝から復帰の 2 行（`current = frame?.text`・`inDouble = frame?.double`）を外し、
 * 代わりに空の区切りを始める変異を当てて `nonexistent-paths-by-git-index` の
 * `command` を割ったところ、先頭語の並びは
 * `["printf","printf","grep","printf","tr","sed","sort","git","awk","wc"]`（許容外 0 件）から
 * `["printf","/[A-Za-z0-9_.@-]+","printf","printf","|"]` へ崩れ、許容外が 2 件
 * （`/[A-Za-z0-9_.@-]+` と `|`）になって実マニフェストが赤くなった（2026-09-01 に実測）。
 * 置換の外側に続く綴りが「先頭語」に見えてしまうためである。
 *
 * **この分割はシェルの構文解析ではない。** 変数展開・ヒアドキュメント・別名・
 * 予約語（`if` / `for`）・環境変数の前置・リダイレクトを**解釈しない**。
 * 「解釈しない」は「素通りさせる」ではない。解釈しない結果これらが先頭語の位置に来れば、
 * 許容集合に無い綴りとして {@link vocabularyFailures} が落とす。9 形を
 * 本関数と {@link leadingWord} へ直接かけて数えたところ、`$CMD a.md`（`$CMD`）・
 * ヒアドキュメント（本文行と終端子）・`alias`・`if ...; then ...; fi`（`if` / `then` / `fi`）・
 * `FOO=1 grep ...`（`FOO=1`）の 5 形が落ち、`grep -c x a.md > /tmp/f` と `>>` と `2>` の
 * 3 形、および引数の位置の展開 `grep -c "$PATTERN" a.md` の 1 形は通った
 * （2026-09-01 に実測）。**リダイレクトと引数中の展開は通る。**
 */
export function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  const frames: SegmentFrame[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let index = 0;
  while (index < command.length) {
    const character = command[index] ?? '';
    const next = command[index + 1] ?? '';
    if (inSingle) {
      if (character === "'") inSingle = false;
      else current += character;
      index += 1;
      continue;
    }
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '"') {
      inDouble = !inDouble;
      index += 1;
      continue;
    }
    if (character === "'" && !inDouble) {
      inSingle = true;
      index += 1;
      continue;
    }
    const opensSubstitution =
      (character === '$' && next === '(') ||
      (!inDouble && (character === '<' || character === '>') && next === '(') ||
      (!inDouble && character === '(');
    if (opensSubstitution) {
      frames.push({ text: current, double: inDouble, closer: ')' });
      current = '';
      inDouble = false;
      index += character === '(' ? 1 : 2;
      continue;
    }
    if (character === '`') {
      if (frames.length > 0 && (frames[frames.length - 1]?.closer ?? '') === '`') {
        segments.push(current);
        const frame = frames.pop();
        current = frame?.text ?? '';
        inDouble = frame?.double ?? false;
      } else {
        frames.push({ text: current, double: inDouble, closer: '`' });
        current = '';
        inDouble = false;
      }
      index += 1;
      continue;
    }
    if (
      character === ')' &&
      frames.length > 0 &&
      (frames[frames.length - 1]?.closer ?? '') === ')'
    ) {
      segments.push(current);
      const frame = frames.pop();
      current = frame?.text ?? '';
      inDouble = frame?.double ?? false;
      index += 1;
      continue;
    }
    if (!inDouble && '|&;\n'.includes(character)) {
      segments.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }
  segments.push(current);
  return segments;
}

/** 区切りの先頭語。空白で切った最初の語を返す（無ければ空文字列） */
export function leadingWord(segment: string): string {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

/** コマンドの各区切りの先頭語が宣言した綴りに収まっていること */
function vocabularyFailures(command: string): string[] {
  const failures: string[] = [];
  for (const segment of splitCommandSegments(command)) {
    const word = leadingWord(segment);
    if (word === '') continue;
    if (READ_ONLY_COMMANDS.includes(word)) continue;
    failures.push(
      `コマンドの区切り「${segment.trim()}」の先頭語 \`${word}\` が READ_ONLY_COMMANDS にありません`
    );
  }
  return failures;
}

// ============================================================================
// 宣言の読み込み
// ============================================================================

export interface LoadedManifest {
  readonly entries: ManifestEntry[];
  readonly errors: string[];
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 宣言を読み込む
 *
 * 読めない・形が違うときは**空の宣言を返して合格させない**。errors が一件でもあれば
 * 呼び出し側は終了コード 1 を返す。
 */
export function loadManifest(manifestPath: string): LoadedManifest {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    errors.push(`宣言 ${manifestPath} を読めません`);
    return { entries, errors };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push(`宣言 ${manifestPath} が JSON として読めません: ${String(error)}`);
    return { entries, errors };
  }
  const container = parsed as { entries?: unknown };
  if (!Array.isArray(container.entries)) {
    errors.push(`宣言 ${manifestPath} が entries の配列を持ちません`);
    return { entries, errors };
  }
  for (const candidate of container.entries) {
    entries.push(candidate as ManifestEntry);
  }
  return { entries, errors };
}

// ============================================================================
// 一件ごとの判定
// ============================================================================

/** 宣言の形（欄が揃っているか、宣言どうしが矛盾していないか） */
function shapeFailures(entry: ManifestEntry): string[] {
  const failures: string[] = [];
  if (!isNonEmptyString(entry.id)) failures.push('id が空です');
  if (!isNonEmptyString(entry.file)) failures.push('file が空です');
  if (!isNonEmptyString(entry.anchor)) failures.push('anchor が空です');
  if (!isNonEmptyString(entry.command)) failures.push('command が空です');
  if (!isNonEmptyString(entry.expected)) failures.push('expected が空です');
  const figure = documentFigureOf(entry);
  if (entry.documentFigure !== undefined && !isNonEmptyString(entry.documentFigure)) {
    failures.push('documentFigure が空です');
  }
  if (figure !== entry.expected && entry.divergence === undefined) {
    failures.push(
      `documentFigure \`${figure}\` が expected \`${entry.expected}\` と異なるのに divergence の宣言がありません`
    );
  }
  if (figure === entry.expected && entry.divergence !== undefined) {
    failures.push(
      'divergence を宣言していますが documentFigure と expected が一致しています（宣言が対象より長生きしています。divergence を外してください）'
    );
  }
  if (entry.divergence !== undefined && !isNonEmptyString(entry.divergence.reason)) {
    failures.push('divergence の reason が空です');
  }
  const rendering = documentRenderingOf(entry);
  if (!rendering.includes(figure)) {
    failures.push(
      `documentRendering \`${rendering}\` が documentFigure \`${figure}\` を含みません（記法と値が切り離されています）`
    );
  }
  if (entry.documentRendering !== undefined && entry.documentRendering === figure) {
    failures.push(
      'documentRendering が documentFigure と同じです（既定と同じ宣言は外してください）'
    );
  }
  if (entry.divergence !== undefined && entry.divergence.kind !== 'stale') {
    failures.push(`divergence の kind \`${String(entry.divergence.kind)}\` は宣言されていません`);
  }
  return failures;
}

/** `anchor` が一行に当たること、その行が `documentFigure` を載せていること */
function anchorFailures(root: string, entry: ManifestEntry): string[] {
  const failures: string[] = [];
  const absolute = path.resolve(root, entry.file);
  let content: string;
  try {
    content = fs.readFileSync(absolute, 'utf8');
  } catch {
    failures.push(`file ${entry.file} を読めません`);
    return failures;
  }
  const matched = anchoredLines(content, entry.anchor);
  if (matched.length === 0) {
    failures.push(`anchor が ${entry.file} に見つかりません: ${entry.anchor}`);
    return failures;
  }
  if (matched.length > 1) {
    failures.push(
      `anchor が ${entry.file} の ${matched.length} 行に当たります（一意に定まる断片にしてください）: ${entry.anchor}`
    );
    return failures;
  }
  const figure = documentRenderingOf(entry);
  const occurrences = countFigureOnLine(matched[0] ?? '', figure);
  if (occurrences === 0) {
    failures.push(
      `anchor の行が documentFigure \`${figure}\` を載せていません（文書側が書き換わった疑いがあります）: ${entry.anchor}`
    );
  }
  if (occurrences > 1) {
    failures.push(
      `anchor の行に documentFigure \`${figure}\` が ${occurrences} 箇所あり、どれを指すか定まりません（記法ごと宣言してください。例: \`3\` ではなく \`\\\`3\\\`\`）: ${entry.anchor}`
    );
  }
  return failures;
}

/** コマンドを走らせて `expected` と突き合わせる */
function measurementFailures(root: string, entry: ManifestEntry): string[] {
  const failures: string[] = [];
  const outcome = runMeasurement(root, entry.command);
  if (outcome.failure !== '') {
    failures.push(outcome.failure);
    return failures;
  }
  if (outcome.output !== entry.expected) {
    failures.push(
      `${entry.file} の「${entry.anchor}」が引く値が現況と食い違います: expected=\`${entry.expected}\` actual=\`${outcome.output}\``
    );
  }
  return failures;
}

/**
 * 一件ぶんの失敗を積む
 *
 * 綴りの検査で落ちたコマンドは**この経路では走らせない**。走らせてから綴りを咎めるのでは、
 * 宣言に紛れ込んだ想定外のコマンドが一度は実行されてしまう。
 *
 * **判定の経路を塞ぐだけでは足りない。** 実行の入口は本関数と {@link measureAll} の
 * 二つあり、後者は判定に関わらない報告用でありながら `bash -c` を呼ぶ。以前の版は
 * 後者が綴りを参照しておらず、`--verbose` で痕跡ファイルが 1 個できた（2026-09-01 に実測）。
 * 両方を塞いだ現在は既定・`--verbose`・`--json --verbose` のいずれでも痕跡は 0 個である（同日に実測）。
 */
function pushEntryFindings(root: string, entry: ManifestEntry, findings: Finding[]): void {
  for (const message of shapeFailures(entry)) {
    findings.push(makeFinding(entry, message));
  }
  const vocabulary = vocabularyFailures(String(entry.command ?? ''));
  for (const message of vocabulary) {
    findings.push(makeFinding(entry, message));
  }
  for (const message of anchorFailures(root, entry)) {
    findings.push(makeFinding(entry, message));
  }
  if (vocabulary.length > 0) return;
  for (const message of measurementFailures(root, entry)) {
    findings.push(makeFinding(entry, message));
  }
}

// ============================================================================
// 集計（絞り込みの操作を置かない。タスク 115.230 の作法）
// ============================================================================

/** 宣言の全体に掛かる前提を見る */
function pushPopulationFindings(entries: readonly ManifestEntry[], findings: Finding[]): void {
  if (entries.length === 0) {
    findings.push(makeGlobalFinding('宣言が 0 件です（この状態を合格にしてはなりません）'));
  }
  if (entries.length < MINIMUM_ENTRIES) {
    findings.push(
      makeGlobalFinding(
        `宣言が ${entries.length} 件で下限 ${MINIMUM_ENTRIES} 件を下回ります（MINIMUM_ENTRIES を見よ）`
      )
    );
  }
  for (const duplicated of duplicatedIds(entries)) {
    findings.push(makeGlobalFinding(`id \`${duplicated}\` が重複しています`));
  }
  for (const document of GOVERNED_DOCUMENTS) {
    if (countEntriesForFile(entries, document) === 0) {
      findings.push(makeGlobalFinding(`${document} を指す宣言が一件もありません`));
    }
  }
}

/** 宣言された文書側の陳腐が宣言どおりの件数であること */
function pushDivergenceRatchetFindings(
  entries: readonly ManifestEntry[],
  findings: Finding[]
): void {
  const stale = countStaleDivergences(entries);
  if (stale > DECLARED_STALE_DOCUMENT_FIGURES) {
    findings.push(
      makeGlobalFinding(
        `文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を超えています`
      )
    );
  }
  if (stale < DECLARED_STALE_DOCUMENT_FIGURES) {
    findings.push(
      makeGlobalFinding(
        `文書側が古いと宣言した箇所が ${stale} 件で、宣言 ${DECLARED_STALE_DOCUMENT_FIGURES} 件を下回ります（解消したなら DECLARED_STALE_DOCUMENT_FIGURES を締めてください）`
      )
    );
  }
}

/** 全件を判定する */
export function judge(root: string, entries: readonly ManifestEntry[]): Finding[] {
  const findings: Finding[] = [];
  pushPopulationFindings(entries, findings);
  for (const entry of entries) {
    pushEntryFindings(root, entry, findings);
  }
  pushDivergenceRatchetFindings(entries, findings);
  return findings;
}

// ============================================================================
// 小道具
// ============================================================================

/** `documentFigure` の既定は `expected` */
export function documentFigureOf(entry: ManifestEntry): string {
  return entry.documentFigure ?? entry.expected;
}

/**
 * 文書の行に現れていなければならない字面
 *
 * 素の数字は同じ行の別の数値にも当たるため、記法ごと（`` `3` `` や `**8件**`）宣言できる。
 * 既定は `documentFigure` そのもので、記法は `documentFigure` を含んでいなければならない
 * （{@link shapeFailures} が課す。含まなくてよいと、値と記法が黙って切り離される）。
 */
export function documentRenderingOf(entry: ManifestEntry): string {
  return entry.documentRendering ?? documentFigureOf(entry);
}

/** `anchor` を逐語で含む行を集める */
export function anchoredLines(content: string, anchor: string): string[] {
  const matched: string[] = [];
  for (const line of content.split('\n')) {
    if (line.includes(anchor)) matched.push(line);
  }
  return matched;
}

/**
 * 行が字面を何箇所に載せているか
 *
 * 数字だけの字面は前後を数字で挟まれていないことまで求める（`81` が `1815` に当たらないように）。
 * 数字以外を含む字面（`64 0` や `` `3` `` など）は逐語の部分一致で数える。
 *
 * **1 箇所であることまで求める理由**（呼び出し側 {@link anchorFailures} が判定する）。
 * 素の数字は同じ行の別の数値にも当たる。実例として、`Component Summary` の節数を数える行は
 * 再現コマンドの中に `#{3,4}` を含むため、文書側の出力を `3` から `4` へ書き換えても
 * 素の `3` は `#{3,4}` の側に残る。`countFigureOnLine` が真偽だけを返していた版に
 * この変異を当てると検査は緑のまま素通りし、失敗は 0 件であった
 * （2026-09-01 に実測）。1 箇所であることを課したうえで当該の宣言を `` `3` `` の記法ごとの
 * 字面へ改めると、同じ変異で「載せていません」として赤くなる（同日に実測）。
 */
export function countFigureOnLine(line: string, figure: string): number {
  const pattern = /^\d+$/.test(figure)
    ? new RegExp(`(?<![0-9])${figure}(?![0-9])`, 'g')
    : new RegExp(figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    count += 1;
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return count;
}

/** 重複した id */
export function duplicatedIds(entries: readonly ManifestEntry[]): string[] {
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const entry of entries) {
    const id = String(entry.id ?? '');
    if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);
    seen.add(id);
  }
  return duplicated;
}

/** ある文書を指す宣言の数 */
export function countEntriesForFile(entries: readonly ManifestEntry[], file: string): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.file === file) count += 1;
  }
  return count;
}

/** `kind: 'stale'` を宣言した件数 */
export function countStaleDivergences(entries: readonly ManifestEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.divergence !== undefined && entry.divergence.kind === 'stale') count += 1;
  }
  return count;
}

function makeFinding(entry: ManifestEntry, message: string): Finding {
  return {
    id: String(entry.id ?? '(id なし)'),
    file: String(entry.file ?? '(file なし)'),
    anchor: String(entry.anchor ?? '(anchor なし)'),
    message,
  };
}

function makeGlobalFinding(message: string): Finding {
  return { id: '(宣言全体)', file: '(宣言全体)', anchor: '(宣言全体)', message };
}

export interface MeasurementOutcome {
  readonly output: string;
  readonly failure: string;
}

/**
 * コマンドをリポジトリルートで走らせる
 *
 * 走らせられない・終了コードが 0 でない・時間切れは、いずれも**読み飛ばさず失敗にする**
 * （AI運用7原則 第3原則）。
 */
export function runMeasurement(root: string, command: string): MeasurementOutcome {
  const result = spawnSync('bash', ['-c', command], {
    cwd: root,
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error !== undefined) {
    return { output: '', failure: `コマンドを起動できません: ${String(result.error)}` };
  }
  if (result.status === null) {
    return { output: '', failure: `コマンドが時間切れまたは信号で終了しました: ${command}` };
  }
  if (result.status !== 0) {
    return {
      output: '',
      failure: `コマンドが終了コード ${result.status} で失敗しました: ${command}${
        result.stderr.trim().length > 0 ? ` / ${result.stderr.trim()}` : ''
      }`,
    };
  }
  return { output: result.stdout.trim(), failure: '' };
}

/**
 * 宣言ごとの実測（報告用。判定は {@link judge} が持つ）
 *
 * **綴りで落ちたコマンドはここでも走らせない。** 以前の版は
 * {@link vocabularyFailures} を参照せず {@link runMeasurement} を直に呼んでいたため、
 * 判定の経路では実行されないコマンドが `--verbose` / `--json --verbose` では実行された。
 * `command` に `sh -c "touch <marker>"` を置いた仮マニフェストを与えて実測したところ、
 * 既定の経路では痕跡ファイルが 0 個であるのに `--verbose` では 1 個できた（2026-09-01 に実測）。
 * `pre-push.sh` の案内も本体の対応方法も、落ちた直後に `:verbose` を勧める。
 * すなわち**推奨した回復手順そのものが実行経路だった**。
 * 現在は綴りで落ちた宣言を「実行しません」と報告し、痕跡は `--verbose` でも 0 個である
 * （同日に実測。自己検査の「`--verbose` でも実行されない」が固定する）。
 */
export function measureAll(root: string, entries: readonly ManifestEntry[]): Measurement[] {
  const measurements: Measurement[] = [];
  for (const entry of entries) {
    const command = String(entry.command ?? '');
    const rejected = vocabularyFailures(command);
    const outcome: MeasurementOutcome =
      rejected.length > 0
        ? { output: '', failure: `綴りが許容外のため実行しません: ${rejected.join(' / ')}` }
        : runMeasurement(root, command);
    measurements.push({
      id: String(entry.id ?? ''),
      file: String(entry.file ?? ''),
      expected: String(entry.expected ?? ''),
      actual: outcome.failure === '' ? outcome.output : `(失敗) ${outcome.failure}`,
      documentFigure: documentFigureOf(entry),
      stale: entry.divergence !== undefined,
    });
  }
  return measurements;
}

// ============================================================================
// 入口
// ============================================================================

function manifestPathFrom(argv: readonly string[], root: string): string {
  for (const argument of argv) {
    if (argument.startsWith('--manifest=')) {
      const given = argument.slice('--manifest='.length);
      return path.isAbsolute(given) ? given : path.join(root, given);
    }
  }
  return path.join(root, DEFAULT_MANIFEST_PATH);
}

export function execute(argv: readonly string[], root = process.cwd()): number {
  const verbose = argv.includes('--verbose');
  const json = argv.includes('--json');
  const manifestPath = manifestPathFrom(argv, root);
  const { entries, errors } = loadManifest(manifestPath);
  const findings = judge(root, entries);
  const stale = countStaleDivergences(entries);

  if (json) {
    console.log(
      JSON.stringify(
        {
          manifest: path.relative(root, manifestPath),
          declared: entries.length,
          stale,
          errors,
          findings,
          measurements: verbose ? measureAll(root, entries) : [],
        },
        null,
        2
      )
    );
    return errors.length + findings.length > 0 ? 1 : 0;
  }

  console.log(
    '🔍 設計文書の実測値の鮮度を検査しています (scripts/check-design-measurement-freshness.ts)'
  );
  console.log(
    `   宣言 ${entries.length} 件 / 対象文書 ${GOVERNED_DOCUMENTS.length} 件 / ` +
      `文書側が古いと宣言した箇所 ${stale} 件`
  );

  if (verbose) {
    console.log('');
    for (const measurement of measureAll(root, entries)) {
      console.log(
        `   ${measurement.id}: expected=${measurement.expected} actual=${measurement.actual} ` +
          `documentFigure=${measurement.documentFigure}${measurement.stale ? ' (stale 宣言あり)' : ''}`
      );
    }
  }

  if (errors.length + findings.length > 0) {
    console.error('');
    console.error('❌ 設計文書の実測値の鮮度に問題があります:');
    for (const error of errors) console.error(`   - ${error}`);
    for (const finding of findings) console.error(`   - [${finding.id}] ${finding.message}`);
    console.error('');
    console.error('対応方法:');
    console.error('  1. 現況が動いたなら、文書の数値と宣言の expected を同時に測り直す');
    console.error('  2. 文書側だけが古いなら documentFigure と divergence を宣言する');
    console.error('     （DECLARED_STALE_DOCUMENT_FIGURES も同時に動かすこと）');
    console.error('  3. 実測値の一覧: npm run check:design-measurement-freshness:verbose');
    return 1;
  }

  console.log('✅ 宣言した実測値はいずれも現況および文書の字面と一致します');
  return 0;
}

function main(): void {
  const exitCode = execute(process.argv.slice(2));
  if (exitCode !== 0) process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
