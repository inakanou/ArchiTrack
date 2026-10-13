/**
 * @fileoverview 各自己検査の対照群の現況と宣言した下限を並べる一覧（タスク 115.252）
 *
 * ## なぜ置くか
 *
 * 自己検査群は「陽性対照 / 陰性対照 / 確認の総数」の下限を数で持つ（`MINIMUM_POSITIVE_CONTROLS`
 * ほか）。下限は**現況ちょうど（余裕ゼロ）**で貼るため、確認を増減させた後は貼り直しが要る。
 * その貼り直しの元になる現況値を、**人が数え直さずに機械から受け取る**ための一覧である。
 * 下限を記録へ書くときは、本一覧が出す値をそのまま置く（「件数を記録へ残すなら抽出コマンドを
 * 逐語で添え、そのコマンドが出す値をそのまま書く」作法）。
 *
 * ## 値の出どころは自己検査自身である
 *
 * 本一覧は極性を**数え直さない**。各自己検査の関門 `guardControlsArePresent` が、判定に使う
 * のと同じ変数から一行の現況を印字する。本一覧はその行を読むだけである。数え直す実装に
 * すると判定と一覧が別々の真実を持ち、食い違ったときにどちらが正かを人が決める羽目になる。
 *
 * ## 印字が失われたら「宣言なし」にせず落とす（交差照合）
 *
 * 判定に使う変数を印字してそれを読む形は二つの真実を作らない点で妥当だが、**印字の欠落が
 * 誤報に化ける**。是正前の実測（2026-09-03）: `check-requirement-coverage.selftest.ts` の
 * `📋 対照の現況:` の `console.log` を 1 文消すだけで、当該の自己検査は 65/65 緑・EXIT=0 の
 * まま、本一覧は当該ファイルを `下限の宣言なし` と分類し `下限の宣言が無いファイル:` に
 * 名を連ねた。当該ファイルは `MINIMUM_POSITIVE_CONTROLS` ほかを実際に宣言し関門も効いている
 * ので、その出力は端的に偽であった。
 *
 * そこで**ソースとの交差照合**を入れる。各自己検査のソースを読み、ソースファイル直下の
 * `const MINIMUM_...` の宣言が 1 件以上あるのに現況行が出力へ現れなかった場合は、
 * `下限の宣言なし` と分類せず「下限を宣言しているのに現況行が出ていない（印字が失われたか、
 * 下限割れで手前で停止した）」として報告し、**非零で終了する**。
 *
 * **上の実測を書いた 2026-09-03 の時点では、境界外の 2 本
 * （`check-requirement-exclusions.selftest.ts` と `check-design-path-references.selftest.ts`）が
 * `const MINIMUM_` を 0 件しか持たず、この照合でも `下限の宣言なし` 側に落ちていた。**
 * その後タスク 115.304 が前者へ件数の下限（`MINIMUM_POSITIVE_CONTROLS` ほか 4 件）と現況行の
 * 印字を入れたため、同ファイルは `下限の宣言なし` 側から外れた。**どのファイルが現況で
 * `下限の宣言なし` に落ちるかは、本一覧の出力の末尾がそのまま印字する**——ここに名を書き
 * 写すと、下限を足した時点でも自己検査が増えた時点でも註が偽になる。
 *
 * 是正後の同じ変異の実測（2026-09-03。当該の `console.log` を 1 文削除した状態で本一覧を実行）:
 *
 *   --- list-control-polarity-floors.ts EXIT=1
 *     check-requirement-coverage.selftest.ts           ⚠️ 下限を宣言しているのに現況行が出ていない（EXIT=0）
 *   合計: 15 ファイル中 12 ファイルが下限を宣言している（ほかに 1 ファイルは下限を宣言しているが現況行が出ていない）
 *   下限の宣言が無いファイル:
 *     - check-design-path-references.selftest.ts
 *     - check-requirement-exclusions.selftest.ts   （2026-09-03 当時。115.304 が下限を入れた）
 *   ❌ 1 件のファイルが、下限を宣言しているのに現況行を出していません（印字が失われたか、下限割れで手前で停止した）。一覧の分類が偽になるため合格にはしません。
 *     - check-requirement-coverage.selftest.ts（ソースに ^const MINIMUM_ の宣言があるのに 出力へ「📋 対照の現況:」の行が現れなかった。EXIT=0）
 *
 * **当該ファイルは `下限の宣言が無いファイル:` の一覧から消えている**——これが是正の要点である。
 *
 * ## 走査対象が 0 件のとき合格にしない（第3原則）
 *
 * `scripts/*.selftest.ts` が 0 件のときは、件数の印字で済ませず `process.exit(1)` する
 * （境界内 13 本の自己検査が検出器へ課している `走査対象が 0 件のとき合格にしない（第3原則）`
 * と同じ規則を、走査する側にも同じ形で課す）。
 *
 * 是正前の実測（2026-09-03。`SELFTEST_SUFFIX` を非一致値 `.no-such-suffix.ts` へ差し替える変異）:
 *
 *   --- list-control-polarity-floors.ts EXIT=0
 *   合計: 0 ファイル中 0 ファイルが下限を宣言している
 *
 * 是正後の同じ変異の実測（2026-09-03）:
 *
 *   --- list-control-polarity-floors.ts EXIT=1
 *   ❌ 走査対象が 0 件です（scripts/*.no-such-suffix.ts が一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。
 *
 * ## 走査範囲はコマンドで宣言する（115.274 / 115.275 の作法）
 *
 *   対象ファイル: `scripts/*.selftest.ts`（実行時に glob で解決する。件数は出力の先頭に出る）
 *
 * ## 使用方法
 *
 *   npx tsx scripts/list-control-polarity-floors.ts
 *
 * ## 読み方
 *
 * - `余裕 0` は下限が現況ちょうどであることを表す。確認を一件でも削れば当該の自己検査が赤くなる。
 * - `余裕 +n` は下限が現況より緩いことを表す。n 件までは削っても関門に掛からない。
 * - `下限の宣言なし` は、その自己検査が件数の下限を持たないことを表す。**この分類はソースに
 *   `const MINIMUM_` の宣言が無いことを確かめたうえで出す**（上の「交差照合」を見よ）。
 *   **どのファイルがこれに当たるかは本一覧の出力が印字する**——ここに名を書き写すと、下限を
 *   足した時点で註が偽になる（タスク 115.304 の着手時、`check-requirement-exclusions.selftest.ts`
 *   を名指ししていた 2 箇所が現にそうなっていた）。
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS_DIRECTORY = path.join(REPOSITORY_ROOT, 'scripts');
const SELFTEST_SUFFIX = '.selftest.ts';

/** 自己検査が印字する現況の行の目印 */
const CENSUS_MARKER = '📋 対照の現況:';

/**
 * 下限の宣言の目印
 *
 * ソースファイル直下の `const MINIMUM_...`（`MINIMUM_POSITIVE_CONTROLS` ほか）に当たる。
 * 行頭に錨を打つのは、JSDoc の中の言及や関数内の局所変数を数に入れないためである。
 */
const FLOOR_DECLARATION_PATTERN = /^const MINIMUM_/m;

interface Reading {
  readonly actual: number;
  readonly floor: number;
}

interface Row {
  readonly file: string;
  readonly exitCode: number;
  /** ソースに `const MINIMUM_` の宣言が 1 件以上あるか */
  readonly declaresFloor: boolean;
  /** 実行の出力に現況行が現れたか */
  readonly censusPrinted: boolean;
  readonly positive?: Reading;
  readonly negative?: Reading;
  readonly total?: Reading;
}

function listSelftestFiles(): string[] {
  return readdirSync(SCRIPTS_DIRECTORY)
    .filter((one) => one.endsWith(SELFTEST_SUFFIX))
    .sort();
}

function runSelftest(file: string): { readonly code: number; readonly output: string } {
  try {
    const stdout = execFileSync('npx', ['tsx', path.join(SCRIPTS_DIRECTORY, file)], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? 1, output: failure.stdout ?? '' };
  }
}

function declaresFloor(file: string): boolean {
  return FLOOR_DECLARATION_PATTERN.test(readFileSync(path.join(SCRIPTS_DIRECTORY, file), 'utf8'));
}

function readingOf(censusLine: string, label: string): Reading | undefined {
  const matched = new RegExp(`${label} (\\d+)/(\\d+)`).exec(censusLine);
  if (matched === null) return undefined;
  return { actual: Number(matched[1]), floor: Number(matched[2]) };
}

function rowOf(file: string): Row {
  const { code, output } = runSelftest(file);
  const censusLine = output.split('\n').find((one) => one.includes(CENSUS_MARKER));
  if (censusLine === undefined) {
    return { file, exitCode: code, declaresFloor: declaresFloor(file), censusPrinted: false };
  }
  return {
    file,
    exitCode: code,
    declaresFloor: declaresFloor(file),
    censusPrinted: true,
    positive: readingOf(censusLine, '陽性対照'),
    negative: readingOf(censusLine, '陰性対照'),
    total: readingOf(censusLine, '総数'),
  };
}

function render(reading: Reading | undefined): string {
  if (reading === undefined) return '        -';
  const margin = reading.actual - reading.floor;
  const marginText = margin === 0 ? '余裕 0' : `余裕 +${margin}`;
  return `${String(reading.actual).padStart(3)}/${String(reading.floor).padEnd(3)} ${marginText}`;
}

function main(): void {
  const files = listSelftestFiles();

  // 走査が空振りしたまま合格にしない（AI運用7原則 第3原則）。
  // 件数を先頭に印字するだけでは緩和にすぎず、EXIT=0 で終われば合格として読まれる。
  if (files.length === 0) {
    console.error(
      `❌ 走査対象が 0 件です（${path.relative(REPOSITORY_ROOT, SCRIPTS_DIRECTORY)}/*${SELFTEST_SUFFIX} が` +
        '一件も見つかりませんでした）。走査が空振りしたまま合格にはしません（AI運用7原則 第3原則）。'
    );
    process.exit(1);
  }

  console.log(`走査対象: scripts/*.selftest.ts（${files.length} ファイル）\n`);
  console.log('ファイル / 陽性対照 現況・下限 / 陰性対照 現況・下限 / 総数 現況・下限');

  const rows = files.map(rowOf);
  const undeclared: string[] = [];
  const contradictions: Row[] = [];
  for (const row of rows) {
    // 交差照合: ソースは下限を宣言しているのに現況行が出ていない。
    // ここを `下限の宣言なし` へ落とすと、一覧の出力が端的に偽になる。
    if (row.declaresFloor && !row.censusPrinted) {
      contradictions.push(row);
      console.log(
        `  ${row.file.padEnd(48)} ⚠️ 下限を宣言しているのに現況行が出ていない（EXIT=${row.exitCode}）`
      );
      continue;
    }
    if (row.positive === undefined && row.negative === undefined && row.total === undefined) {
      undeclared.push(row.file);
      console.log(`  ${row.file.padEnd(48)} 下限の宣言なし（EXIT=${row.exitCode}）`);
      continue;
    }
    console.log(
      `  ${row.file.padEnd(48)} ${render(row.positive)} | ${render(row.negative)} | ${render(row.total)}`
    );
  }

  // 矛盾のある行は下限を読み取れていないため `declared` に数えない。ただしその状態で
  // 「N ファイルが下限を宣言している」とだけ出すと、その一文自体が偽になる（矛盾の側も
  // 宣言はしている）。矛盾があるときは同じ行に内訳を添える。
  const declared = rows.length - undeclared.length - contradictions.length;
  const breakdown =
    contradictions.length === 0
      ? ''
      : `（ほかに ${contradictions.length} ファイルは下限を宣言しているが現況行が出ていない）`;
  console.log(
    `\n合計: ${rows.length} ファイル中 ${declared} ファイルが下限を宣言している${breakdown}`
  );
  if (undeclared.length > 0) {
    console.log('下限の宣言が無いファイル:');
    for (const one of undeclared) console.log(`  - ${one}`);
  }

  if (contradictions.length > 0) {
    console.error(
      `\n❌ ${contradictions.length} 件のファイルが、下限を宣言しているのに現況行を出していません` +
        '（印字が失われたか、下限割れで手前で停止した）。一覧の分類が偽になるため合格にはしません。'
    );
    for (const row of contradictions) {
      console.error(
        `  - ${row.file}（ソースに ${FLOOR_DECLARATION_PATTERN.source} の宣言があるのに ` +
          `出力へ「${CENSUS_MARKER}」の行が現れなかった。EXIT=${row.exitCode}）`
      );
    }
    process.exit(1);
  }
}

main();
