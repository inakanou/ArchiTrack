/**
 * @fileoverview 裁定記録 §4 の指し先が走査の正典に実在することを見る検査（タスク 115.300）
 *
 * ## なぜ在るか
 *
 * `scripts/coverage-mark-adjudication.md` の §4 は約 340 件の被覆印を「主題は同じで規範の
 * 一部が未観測（B）」として登録する。**この節の指し先が実在するかを見る関門は、本検査を
 * 置くまで存在しなかった。** 「無い」の範囲はコマンドで宣言する（日本語で範囲を宣言しない）。
 * 押下前の関門に載る検査は
 * `grep -oE 'npm run check:[a-z0-9-]+' .husky/scripts/pre-push.sh | sort -u` が列挙し、
 * 本検査を入れる前は 18 本であった（コミット `a639d314`、2026-09-06 に実測）。
 * その 18 本が緑のまま通る状態で、**§4 が引く一意 150 件の指し先のうち 55 件は走査の正典に
 * 無かった**（同日に実測。抽出は下の「再現」を見よ）。存在しないファイル
 * `does-not-exist/nope.spec.ts:9999` を指す項目を §4 へ 1 行足す変異を当てても、18 本と
 * `npm run format:check` は**すべて終了コード 0 のまま**であった（同日に実測。変異の復元は
 * 事前複製からの書き戻しで行い、`git diff HEAD --numstat` が空であることで確認した）。
 *
 * ## 何を見るか（§4 の指し先の実在だけ）
 *
 * 走査の正典は `scripts/scan-coverage-mark-correspondence.ts` の {@link scanCoverageMarks} が
 * 出す。同関数は `e2e/specs` の全被覆印について「区間の宣言行」と「その宣言行の最初の文字列
 * リテラル（＝表題）」を返す。本検査は §4 が引く指し先を同じ語彙で突き合わせる。
 *
 *   - 記法: `` `e2e/specs/<path>.spec.ts` の区間 `<表題の逐語>` `` （複数の区間は ` / ` で連ねる）
 *   - モジュール冒頭の註釈に置かれた被覆印: `` `e2e/specs/<path>.spec.ts` の冒頭註釈 ``
 *   - 両方を持つ項目: `` … の区間 `A` / `B` および冒頭註釈 ``
 *
 * **行番号は指し先に使わない。** 行番号は追記で動く。実例として 115.250 は 2026-09-03 に
 * `estimate-request-e2e.spec.ts` の三件が `:1550`・`:2978`・`:3611` にあると記録したが、
 * 2026-09-06 の再実測では `1621`・`3049`・`3682` である（記録 §4.4 の追加登録の項に両方を
 * 併記した）。**記録が現況として書いた行番号が三日で偽になった。** ゆえに §4 では
 * 行番号を禁じ、{@link legacyLineNumberFailures} が再混入を赤くする。
 *
 * ## 何を見ないか（115.301 との境界）
 *
 * **本検査は「指し先が実在するか」だけを見る。** 記録が引く**実測値の鮮度**（§1 と §5 の表、
 * §6 の件数）は一切読まない。裁定記録を
 * `scripts/check-design-measurement-freshness.ts` の `GOVERNED_DOCUMENTS` へ載せ、
 * `scripts/design-measurements.json` へ宣言を置くかの判断は**タスク 115.301 の所管**であり、
 * 本検査はその面に触れない。両者は次の意味で交わらない。
 *
 *   - 本検査: §4 の指し先（ファイルと区間の表題）が走査の正典に在るか。数値を読まない
 *   - 115.301: 記録が載せる数値が再現コマンドの出力と一致するか。指し先を読まない
 *
 * したがって §4 の指し先を全て正した状態でも 115.301 の問いは開いたままであり、
 * 115.301 がどちらへ決着しても本検査の判定は動かない。
 *
 * ## 見ないこと（限界。開示）
 *
 *   - **表題の逐語が「正しい区間」を指しているかは見ない。** 見るのは「そのファイルに同じ
 *     表題の区間が在るか」である。同じファイルの別の区間の表題へ書き換える変異は素通りする。
 *     現況では §4 の指し先に**同一ファイル内で重複する表題は 0 件**だが（下の「再現」の
 *     二つ目のコマンド）、それは実データの性質であって本検査が課している性質ではない。
 *   - **表題は {@link declarationTitle} の定義に従う**——宣言行の**最初の**文字列リテラルで
 *     ある。`test('パンくずにaria-label="パンくず"が設定されている', …)` のように表題の中に
 *     引用符があると、走査の正典が持つ表題はその手前で切れる。§4 はその切れた綴りを引く。
 *     読みにくいが、正典と同じ語彙でなければ機械で突き合わせられない。
 *   - **§3 と §6 は見ない。** 本検査の _Boundary_ は §4 である。§3 と §6 には
 *     `<path>:<行>` の形の指し先が残っており、その実在は保証しない（件数は
 *     `.kiro/specs/site-survey/design.md` の該当節が下界として開示する）。
 *   - **被覆印が名乗る受入基準（`ua/19.5` などの右辺）は見ない。** 指し先の実在だけを見る。
 *   - **行番号の再混入を全ての綴りについて禁じてはいない。** 見るのは
 *     `<path>.spec.ts:<行>` の綴り（{@link legacyLineNumberFailures}）と、**指し先の直後**に
 *     添えられた `（1550 行）` / `（:1550）` / `:1550` の形（{@link adjacentLineNumberFailures}。
 *     窓は {@link DISCLOSED_ADJACENCY_WINDOW} 文字）だけである。**指し先から離れた散文の中に
 *     行番号を書く形は素通りする**——§4.4 が「115.220 の追記で一律に 13 行ずれた」という実測を
 *     歴史記録として引いており、そこまで禁じると当の記録が書けなくなる。
 *   - **印字そのものが計算結果から導かれているかは、本体では見ない。** 要約行は
 *     {@link formatCheckSummary} と {@link formatDuplicateSummary} に切り出してあり、
 *     定数へ畳む変異は**自己検査**が塞ぐ（値の逐語と、`main` からの結線の二方向）。
 *
 * 使用方法:
 *   npx tsx scripts/check-adjudication-pointers.ts
 *   npx tsx scripts/check-adjudication-pointers.ts --verbose
 *   npm run check:adjudication-pointers
 *
 * 再現（本注釈が引く件数の取り直し）:
 *   npm run check:adjudication-pointers            # 合格時に指し先とファイルの件数を印字する
 *   npm run check:adjudication-pointers:duplicates # 同一ファイル内で表題が重複する指し先の件数
 *   git show a639d314:scripts/coverage-mark-adjudication.md | awk '/^## 4\./,/^## 5\./' \
 *     | grep -oE '[A-Za-z0-9_./-]+[.]spec[.]ts:[0-9]+(,[0-9]+)*' \
 *     | awk -F: '{n=split($2,a,","); for(i=1;i<=n;i++) print $1":"a[i]}' | sort -u | wc -l
 *     # 是正前の一意 150 件（版を固定しているので後任も同じ値を得る）
 */

import * as fs from 'fs';
import * as path from 'path';

import { scanCoverageMarks } from './scan-coverage-mark-correspondence';

/** 裁定記録の所在（リポジトリルート相対） */
export const ADJUDICATION_DOCUMENT = 'scripts/coverage-mark-adjudication.md';

/** §4 の開始を定める行頭の逐語 */
export const SECTION_START_PREFIX = '## 4.';

/** §4 の終了を定める行頭の逐語 */
export const SECTION_END_PREFIX = '## 5.';

/**
 * §4 が引く指し先の件数（ファイルと区間の組。冒頭註釈は 1 件と数える）。
 *
 * **下限に遊びを持たせない**（115.262 / 115.271 が確立した作法）。下回っても上回っても
 * 赤くする。§4 の登録を増減させる変更は必ずこの定数の書き換えを伴い、差分に現れる。
 * 0 件のときは「合格」ではなく前提の崩壊として赤くする（AI運用7原則 第3原則）。
 */
export const DECLARED_POINTER_COUNT = 162;

/** 走査の正典が空なら前提の崩壊として赤くする下限（第3原則） */
export const MINIMUM_CANON_MARKS = 1;

export interface Failure {
  readonly kind: string;
  readonly detail: string;
}

/**
 * ファイルごとの正典。
 *
 * `titles` は**表題ごとの区間の数**を保つ（集合ではない）。同じ表題を持つ区間が二つ以上ある
 * ファイルでは、表題だけでは区間を一つに絞れない——その件数を {@link ambiguousTargets} が
 * 数える。**判定には使わない**（下の「見ないこと」を見よ）。
 */
export interface CanonFile {
  readonly titles: Map<string, number>;
  readonly hasModuleBlock: boolean;
}

export type CanonIndex = Map<string, CanonFile>;

/** 指し先ひとつ（`file` は `e2e/specs/` から始まるリポジトリルート相対パス） */
export interface Pointer {
  readonly file: string;
  /** 区間の表題の逐語。冒頭註釈だけを指す項目では空配列 */
  readonly titles: readonly string[];
  /** 冒頭註釈の被覆印を併せて指しているか */
  readonly module: boolean;
}

/** 走査の正典を {@link CanonIndex} へ畳む */
export function buildCanonIndex(
  rows: ReadonlyArray<{ file: string; line: number; title: string }>
): CanonIndex {
  const index: CanonIndex = new Map();
  // 正典は被覆印ごとの行であり、同じ区間が複数の受入基準ぶん現れる。区間を数えるので
  // ファイルと宣言行の組で畳んでから数える（文字列の連結は使わない——連結すると
  // 区切り文字が要り、区切りに制御文字を使うとファイルがバイナリ判定になる。115.297 の教訓）
  const countedBlocks = new Map<string, Set<number>>();
  for (const row of rows) {
    const current = index.get(row.file) ?? {
      titles: new Map<string, number>(),
      hasModuleBlock: false,
    };
    if (row.title === '') {
      index.set(row.file, { titles: current.titles, hasModuleBlock: true });
      continue;
    }
    const perFile = countedBlocks.get(row.file) ?? new Set<number>();
    if (!perFile.has(row.line)) {
      perFile.add(row.line);
      countedBlocks.set(row.file, perFile);
      current.titles.set(row.title, (current.titles.get(row.title) ?? 0) + 1);
    }
    index.set(row.file, current);
  }
  return index;
}

/**
 * 文書から §4 の本文を切り出す。
 *
 * 開始・終了の逐語が見つからないときは `null` を返す。呼び出し側は前提の崩壊として
 * 赤くする——**節が消えたときに「指し先 0 件で合格」になってはならない。**
 */
export function extractSection(documentText: string): string | null {
  const lines = documentText.split('\n');
  const start = lines.findIndex((line) => line.startsWith(SECTION_START_PREFIX));
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith(SECTION_END_PREFIX));
  if (end < 0) return null;
  return lines.slice(start, end).join('\n');
}

const BACKTICKED_SPEC_PATH = /`([^`\n]*\.spec\.ts)`/g;
const LEADING_TITLE = /^`([^`\n]+)`/;
const SECTION_LEAD = ' の区間 ';
const MODULE_LEAD = ' の冒頭註釈';
const MODULE_TAIL = ' および冒頭註釈';
const TITLE_SEPARATOR = ' / ';

/**
 * 指し先の直後に添えられた行番号。
 *
 * `<path>.spec.ts:<行>` の綴りは {@link legacyLineNumberFailures} が見るが、**指し先を
 * 正しい記法で書いたうえで行番号を括弧で添える形**（`（1550 行）` / `（:1550）` / `:1550`）は
 * 綴りが違うため素通りする。指し先に隣接する位置だけを見て塞ぐ。
 *
 * **散文の中の行番号までは禁じない**——§4.4 は「115.220 の追記で一律に 13 行ずれた」という
 * 実測を歴史記録として引いており、その形は残す必要がある。{@link DISCLOSED_ADJACENCY_WINDOW}
 * が見るのは指し先の直後だけである（限界は本ファイルの「見ないこと」に開示した）。
 */
const ADJACENT_LINE_NUMBER = /^(?:\s*[（(]\s*:?\d+\s*行?\s*[）)]|:\d)/;

/** 行番号の隣接を見る窓（指し先の直後から数える文字数） */
export const DISCLOSED_ADJACENCY_WINDOW = 16;

/** 行番号つきの旧記法（`<path>.spec.ts:<行>`）の残存 */
export function legacyLineNumberFailures(sectionText: string): Failure[] {
  const failures: Failure[] = [];
  const pattern = /[^\s`]*\.spec\.ts:\d[\d,]*/g;
  for (const match of sectionText.matchAll(pattern)) {
    failures.push({
      kind: '行番号つきの旧記法が残っている',
      detail: `${match[0]} — §4 の指し先は行番号ではなく表題の逐語で持つこと（行番号は追記で動く）`,
    });
  }
  return failures;
}

/** 指し先の直後に行番号が添えられていないこと */
export function adjacentLineNumberFailures(
  sectionText: string,
  pointerEnd: number,
  file: string
): Failure[] {
  const window = sectionText.slice(pointerEnd, pointerEnd + DISCLOSED_ADJACENCY_WINDOW);
  const match = ADJACENT_LINE_NUMBER.exec(window);
  if (match === null) return [];
  return [
    {
      kind: '指し先の直後に行番号が添えられている',
      detail: `${file} — ${JSON.stringify(match[0])}。§4 の指し先は表題の逐語だけで持つこと（行番号は追記で動く）`,
    },
  ];
}

/**
 * §4 の本文から指し先を読み取る。
 *
 * 記法から外れた綴りは {@link Failure} として返す。**読み飛ばさない**——読み飛ばすと
 * 「記法を崩せば検査から消える」経路になる。
 */
export function parsePointers(sectionText: string): {
  pointers: Pointer[];
  failures: Failure[];
} {
  const pointers: Pointer[] = [];
  const failures: Failure[] = [];
  BACKTICKED_SPEC_PATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BACKTICKED_SPEC_PATH.exec(sectionText)) !== null) {
    const file = match[1] ?? '';
    const consumedEnd = match.index + match[0].length;
    if (!file.startsWith('e2e/specs/')) {
      failures.push({
        kind: '指し先のパスに走査根の接頭辞が無い',
        detail: `${file} — §4 のパスは \`e2e/specs/\` から始まる形へ揃えること`,
      });
      continue;
    }
    let rest = sectionText.slice(consumedEnd);
    if (rest.startsWith(MODULE_LEAD)) {
      const after = consumedEnd + MODULE_LEAD.length;
      failures.push(...adjacentLineNumberFailures(sectionText, after, file));
      pointers.push({ file, titles: [], module: true });
      BACKTICKED_SPEC_PATH.lastIndex = after;
      continue;
    }
    if (!rest.startsWith(SECTION_LEAD)) {
      failures.push({
        kind: '指し先が宣言した記法に従っていない',
        detail: `${file} — \`<path>\` の直後は "${SECTION_LEAD.trim()} \`表題\`" か "${MODULE_LEAD.trim()}" であること（実際: ${JSON.stringify(rest.slice(0, 24))}）`,
      });
      continue;
    }
    let cursor = consumedEnd + SECTION_LEAD.length;
    rest = sectionText.slice(cursor);
    const titles: string[] = [];
    for (;;) {
      const titleMatch = LEADING_TITLE.exec(rest);
      if (titleMatch === null) break;
      titles.push(titleMatch[1] ?? '');
      cursor += titleMatch[0].length;
      rest = sectionText.slice(cursor);
      if (rest.startsWith(TITLE_SEPARATOR)) {
        cursor += TITLE_SEPARATOR.length;
        rest = sectionText.slice(cursor);
        continue;
      }
      break;
    }
    if (titles.length === 0) {
      failures.push({
        kind: '指し先が宣言した記法に従っていない',
        detail: `${file} — "${SECTION_LEAD.trim()}" の後に表題の逐語が無い`,
      });
      BACKTICKED_SPEC_PATH.lastIndex = cursor;
      continue;
    }
    let module = false;
    if (rest.startsWith(MODULE_TAIL)) {
      module = true;
      cursor += MODULE_TAIL.length;
    }
    failures.push(...adjacentLineNumberFailures(sectionText, cursor, file));
    pointers.push({ file, titles, module });
    BACKTICKED_SPEC_PATH.lastIndex = cursor;
  }
  return { pointers, failures };
}

/** 指し先が走査の正典に実在するかを見る */
export function existenceFailures(pointers: readonly Pointer[], canon: CanonIndex): Failure[] {
  const failures: Failure[] = [];
  for (const pointer of pointers) {
    const entry = canon.get(pointer.file);
    if (entry === undefined) {
      failures.push({
        kind: '指し先のファイルが走査の正典に無い',
        detail: `${pointer.file}`,
      });
      continue;
    }
    for (const title of pointer.titles) {
      if (!entry.titles.has(title)) {
        failures.push({
          kind: '指し先の区間が走査の正典に無い',
          detail: `${pointer.file} — 表題 \`${title}\``,
        });
      }
    }
    if (pointer.module && !entry.hasModuleBlock) {
      failures.push({
        kind: '冒頭註釈の被覆印が走査の正典に無い',
        detail: `${pointer.file}`,
      });
    }
  }
  return failures;
}

/** 指し先の件数（ファイルと区間の組。冒頭註釈は 1 件） */
export function countPointerTargets(pointers: readonly Pointer[]): number {
  let total = 0;
  for (const pointer of pointers) total += pointer.titles.length + (pointer.module ? 1 : 0);
  return total;
}

/**
 * 母集団と下限の前提を見る（第3原則）。
 *
 * 節が消えた・正典が空・指し先が宣言の件数とずれた、のいずれも「合格」にしない。
 */
export function preconditionFailures(
  sectionText: string | null,
  canonMarkCount: number,
  pointerCount: number
): Failure[] {
  const failures: Failure[] = [];
  if (sectionText === null) {
    failures.push({
      kind: '§4 を切り出せない',
      detail: `${ADJUDICATION_DOCUMENT} に "${SECTION_START_PREFIX}" と "${SECTION_END_PREFIX}" の行頭が要る（節ごと消えた状態を合格にしない）`,
    });
  }
  if (canonMarkCount < MINIMUM_CANON_MARKS) {
    failures.push({
      kind: '走査の正典が空',
      detail: `被覆印 ${canonMarkCount} 件（下限 ${MINIMUM_CANON_MARKS} 件）。突き合わせる相手が無い状態を合格にしない`,
    });
  }
  if (pointerCount < DECLARED_POINTER_COUNT) {
    failures.push({
      kind: '§4 の指し先が宣言より少ない',
      detail: `${pointerCount} 件（宣言 ${DECLARED_POINTER_COUNT} 件）。登録を減らすなら DECLARED_POINTER_COUNT も同じ差分で下げること`,
    });
  }
  if (pointerCount > DECLARED_POINTER_COUNT) {
    failures.push({
      kind: '§4 の指し先が宣言より多い',
      detail: `${pointerCount} 件（宣言 ${DECLARED_POINTER_COUNT} 件）。遊びを持つ下限は、その幅ぶんの無言の削除を吸収する。DECLARED_POINTER_COUNT を ${pointerCount} 件へ上げること`,
    });
  }
  return failures;
}

/**
 * 同一ファイル内で表題が重複する指し先（限界の開示のために数える。**判定には使わない**）。
 *
 * 表題だけでは区間を一つに絞れない指し先である。件数が 0 でなくなったら、本検査が
 * 「そのファイルに同じ表題の区間が在る」しか見ていないことの実害が現れる。
 */
export function ambiguousTargets(pointers: readonly Pointer[], canon: CanonIndex): string[] {
  const rows: string[] = [];
  for (const pointer of pointers) {
    const entry = canon.get(pointer.file);
    if (entry === undefined) continue;
    for (const title of pointer.titles) {
      const blocks = entry.titles.get(title) ?? 0;
      if (blocks > 1) rows.push(`${pointer.file} — ${title}（${blocks} 区間）`);
    }
  }
  return rows;
}

export interface CheckResult {
  readonly failures: Failure[];
  readonly pointerCount: number;
  readonly canonMarkCount: number;
  readonly fileCount: number;
}

/**
 * 合格時の要約行。**印字は計算結果から導く**（定数へ畳むと `scripts/design-measurements.json`
 * の宣言が読む値が現況から切り離される）。自己検査が合成の結果を与えて逐語を確かめる。
 */
export function formatCheckSummary(result: CheckResult): string {
  return `裁定記録 §4 の指し先: ${result.pointerCount} 件 / ${result.fileCount} ファイルがすべて走査の正典に実在します（正典の被覆印 ${result.canonMarkCount} 件）`;
}

/**
 * `--duplicate-titles` の要約行。**この値の受け口は鮮度の宣言だけである**ため、印字を定数へ
 * 畳む変異を自己検査が塞ぐ（本関数へ合成の件数を与えて逐語を確かめ、`main` が本関数を
 * 呼んでいることを結線として確かめる）。
 */
export function formatDuplicateSummary(count: number): string {
  return `同一ファイル内で表題が重複する指し先: ${count} 件`;
}

export function runCheck(
  documentText: string,
  canonRows: ReadonlyArray<{ file: string; line: number; title: string }>
): CheckResult {
  const section = extractSection(documentText);
  const canon = buildCanonIndex(canonRows);
  const parsed =
    section === null
      ? { pointers: [] as Pointer[], failures: [] as Failure[] }
      : parsePointers(section);
  const pointerCount = countPointerTargets(parsed.pointers);
  const failures: Failure[] = [
    ...preconditionFailures(section, canonRows.length, pointerCount),
    ...(section === null ? [] : legacyLineNumberFailures(section)),
    ...parsed.failures,
    ...existenceFailures(parsed.pointers, canon),
  ];
  return {
    failures,
    pointerCount,
    canonMarkCount: canonRows.length,
    fileCount: new Set(parsed.pointers.map((pointer) => pointer.file)).size,
  };
}

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const duplicates = process.argv.includes('--duplicate-titles');
  const documentPath = path.resolve(process.cwd(), ADJUDICATION_DOCUMENT);
  if (!fs.existsSync(documentPath)) {
    console.error(`裁定記録が見つかりません: ${ADJUDICATION_DOCUMENT}`);
    process.exit(1);
  }
  const documentText = fs.readFileSync(documentPath, 'utf-8');
  const canonRows = scanCoverageMarks().map((row) => ({
    file: row.file,
    line: row.line,
    title: row.title,
  }));

  if (duplicates) {
    const section = extractSection(documentText);
    const parsed =
      section === null
        ? { pointers: [] as Pointer[], failures: [] as Failure[] }
        : parsePointers(section);
    const rows = ambiguousTargets(parsed.pointers, buildCanonIndex(canonRows));
    for (const row of rows) console.log(`重複: ${row}`);
    console.log(formatDuplicateSummary(rows.length));
    return;
  }

  const result = runCheck(documentText, canonRows);
  if (verbose) {
    for (const failure of result.failures) {
      console.log(`  [${failure.kind}] ${failure.detail}`);
    }
  }
  if (result.failures.length > 0) {
    console.error(`裁定記録 §4 の指し先: ${result.failures.length} 件の失敗`);
    for (const failure of result.failures.slice(0, 40)) {
      console.error(`  [${failure.kind}] ${failure.detail}`);
    }
    if (result.failures.length > 40) {
      console.error(`  … 他 ${result.failures.length - 40} 件（--verbose で全件）`);
    }
    process.exit(1);
  }
  console.log(formatCheckSummary(result));
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1].replace(/\\/g, '/').endsWith('check-adjudication-pointers.ts');
if (invokedDirectly) main();
