/**
 * @fileoverview 裁定記録 §4 の指し先の検査 判定器の自己検査（タスク 115.300）
 *
 * `scripts/check-adjudication-pointers.ts` の判定器が
 *   (1) **緩む向き**——実在しない指し先・記法から外れた綴り・行番号つきの旧記法・
 *       節ごとの消失・正典の空・登録件数のずれを**取り逃がさない**こと、
 *   (2) **狭まる向き**——宣言した記法に従う正しい指し先を**告発しない**こと、
 * の両方を、書き方そのものを注入して確かめる。
 *
 * `MUST_DETECT` の中核は**是正前に実在した形**である。
 * `e2e/specs/site-surveys/site-survey-export.spec.ts` を `site-survey-export.spec.ts` と
 * ディレクトリ接頭辞を落として書く形と、区間が下へ動いたあとも旧い行番号を指したままの形は、
 * いずれも 115.300 の着手時点で §4 に実在した（一意 150 件中 55 件。2026-09-06 に実測）。
 *
 * ## 対照群の母集団を空にする変異が赤くなること（AI運用7原則 第3原則）
 *
 * 母集団を走る対照は、母集団が空になると走査が空回りして緑で通る（真空パス）。
 * 何も主張していない状態であり、前提の崩壊として赤くする。**守り手を守られる側と同じ
 * レジストリへ置かない**ため（115.242 が確立）、前提の確認は配列への登録ではなく
 * {@link reportPreconditions} の直列の手続きとして書き、`main` の冒頭で対照より先に走らせる。
 * 呼び出しごと外す経路は {@link checkPreconditionsAreWired} が塞ぎ、その守り手は
 * `function check` 宣言なので {@link structuralWiringFailures} が `STRUCTURAL` への結線を強制する。
 *
 * ## 下限をどこに置くか（115.222 / 115.252 の判断を引き継ぐ）
 *
 *   - `STRUCTURAL`: 本ファイルが宣言する `function check*` を一つ残らず結線していること。
 *     検査を増減させれば下限も自動で追随する。**限界**: 語彙は行頭の `function check` という
 *     宣言の形から取るため、アロー式で書いた未結線の検査だけは素通りする。
 *     **本ファイルの検査関数は全て `function` 宣言で書くこと。**
 *   - `MUST_DETECT` / `MUST_NOT_DETECT`: 下限を導ける語彙が本体側に無いため「空でないこと」に
 *     留める。**限界**: 件数を 1 件へ削る破壊は止まらない。根拠の無い件数を貼らないという
 *     115.222 の判断をそのまま引き継ぐ。ただし**陽性・陰性のどちらかが消えたら赤くする**。
 *   - `KIND_COVERAGE`: 本体が出す失敗の種別（`Failure.kind`）を一つ残らず陽性対照が
 *     覆っていること。本体に種別を足して対照を足し忘れる経路を塞ぐ。**下限は本体側の語彙から
 *     導く**ので、件数を貼らずに済む。
 *   - `CANON_WITH_DUPLICATE_TITLES`: 同じ表題の区間を二つ持つ合成の正典。**実データは現況
 *     0 件であり、実データだけでは重複の側が一度も走らない。** 空にすると前提の崩壊として赤くする。
 *   - 印字の対照（{@link checkPrintedFiguresAreDerived}）: 要約の数値を定数へ畳む変異を
 *     **二方向で**塞ぐ。整形関数へ合成の値を与えて逐語を見る向きと、`main` が整形関数を
 *     経由していることを見る向きである。**重複の件数はとくに重要である**——その値の受け口は
 *     `scripts/design-measurements.json` の宣言だけであり、定数化を捕らえるものが他に無い。
 *   - `DISCLOSED_LIMITS`: 本体のヘッダが開示している限界を、**逐語の実在と挙動の再現の両方**で
 *     固定する（115.293 / 115.294 / 115.297 の教訓）。開示だけ消えても、塞いだのに開示が
 *     残っても赤くなる。逐語は本体（別ファイル）から探すため、照合が恒真へ退化しない。
 *     **限界**: 空でないことしか課さない。件数を 1 件へ削る破壊は止まらない。
 *
 * 使用方法:
 *   npx tsx scripts/check-adjudication-pointers.selftest.ts
 *   npm run check:adjudication-pointers:selftest
 *
 * 判定器が壊れたまま本検査が「合格」を出す状態を防ぐため、押下前の関門では本検査の前に走らせる。
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECLARED_POINTER_COUNT,
  MINIMUM_CANON_MARKS,
  ambiguousTargets,
  buildCanonIndex,
  countPointerTargets,
  existenceFailures,
  extractSection,
  formatCheckSummary,
  formatDuplicateSummary,
  legacyLineNumberFailures,
  parsePointers,
  preconditionFailures,
  runCheck,
} from './check-adjudication-pointers';

/**
 * 失敗既定（タスク 115.295）。入口が呼ばれないまま module の評価が終わっても非零で終わる。
 * 解除は {@link main} の成功経路の末尾にだけ置く。
 */
process.exitCode = 1;

const SELF = fileURLToPath(import.meta.url);
const BODY = path.join(path.dirname(SELF), 'check-adjudication-pointers.ts');

interface CanonRow {
  file: string;
  line: number;
  title: string;
}

/** 対照が使う合成の正典（実データに依存しない） */
const CANON: CanonRow[] = [
  {
    file: 'e2e/specs/admin/audit-log.spec.ts',
    line: 55,
    title: 'ロール作成時に監査ログが記録される',
  },
  { file: 'e2e/specs/admin/audit-log.spec.ts', line: 101, title: '監査ログは規定の構造を持つ' },
  {
    file: 'e2e/specs/site-surveys/site-survey-export.spec.ts',
    line: 411,
    title: '調査報告書出力ボタンが表示される',
  },
  { file: 'e2e/specs/estimate/estimate-navigation-e2e.spec.ts', line: 1, title: '' },
  {
    file: 'e2e/specs/estimate/estimate-navigation-e2e.spec.ts',
    line: 504,
    title: 'REQ-15.1：一覧のパンくず',
  },
];

/**
 * 同じ表題の区間を二つ持つファイルを含む合成の正典。
 *
 * **{@link ambiguousTargets} の陽性対照の材料である。** 実データは現況 0 件であり、
 * 実データだけでは重複の側が一度も走らない（真空パス）。
 */
const CANON_WITH_DUPLICATE_TITLES: CanonRow[] = [
  { file: 'e2e/specs/admin/audit-log.spec.ts', line: 55, title: '監査ログは規定の構造を持つ' },
  { file: 'e2e/specs/admin/audit-log.spec.ts', line: 400, title: '監査ログは規定の構造を持つ' },
  {
    file: 'e2e/specs/admin/audit-log.spec.ts',
    line: 55,
    title: '監査ログは規定の構造を持つ',
  },
];

/** 節の見出しで囲んだ最小の文書を作る */
function wrap(body: string): string {
  return ['# 見出し', '', '## 4. 引き継ぐ被覆印', '', body, '', '## 5. 実測', '', 'おわり'].join(
    '\n'
  );
}

interface Sample {
  readonly label: string;
  readonly body: string;
  /** その本文だけで期待する失敗の種別（`Failure.kind`） */
  readonly kinds: readonly string[];
}

/**
 * 取り逃がしてはならない形（陽性対照）。
 *
 * 件数の照合は「宣言 = 実際」を課すため、各対照は指し先の件数がずれることによる
 * 失敗も併せて出しうる。ここでは**期待する種別が失敗の中に在ること**だけを見る。
 */
const MUST_DETECT: readonly Sample[] = [
  {
    label: 'ディレクトリ接頭辞を落としたパス（是正前に §4 へ実在した形）',
    body: '- `site-survey-export.spec.ts` の区間 `調査報告書出力ボタンが表示される` — ss/11.1',
    kinds: ['指し先のパスに走査根の接頭辞が無い'],
  },
  {
    label: '行番号つきの旧記法（是正前に §4 へ実在した形）',
    body: '- `e2e/specs/admin/audit-log.spec.ts:44,85` — ua/22.6',
    kinds: ['行番号つきの旧記法が残っている'],
  },
  {
    label: '走査の正典に無いファイルを指す',
    body: '- `e2e/specs/does-not-exist/nope.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ss/1.1',
    kinds: ['指し先のファイルが走査の正典に無い'],
  },
  {
    label: '在るファイルの、在らぬ区間を指す（区間が消えた・改名された形）',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `もう存在しない表題` — ua/22.6',
    kinds: ['指し先の区間が走査の正典に無い'],
  },
  {
    label: 'パスの直後が宣言した連結語でない',
    body: '- `e2e/specs/admin/audit-log.spec.ts` を見よ — ua/22.6',
    kinds: ['指し先が宣言した記法に従っていない'],
  },
  {
    label: '連結語の後に表題の逐語が無い',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 監査ログのどれか — ua/22.6',
    kinds: ['指し先が宣言した記法に従っていない'],
  },
  {
    label: '冒頭註釈の被覆印が無いファイルを冒頭註釈で指す',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の冒頭註釈 — ua/22.6',
    kinds: ['冒頭註釈の被覆印が走査の正典に無い'],
  },
  {
    label: '正しい記法の指し先の直後へ行番号を括弧で添える（別の綴りでの再混入）',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`（1550 行） — ua/22.6',
    kinds: ['指し先の直後に行番号が添えられている'],
  },
  {
    label: '冒頭註釈の指し先の直後へ行番号を添える',
    body: '- `e2e/specs/estimate/estimate-navigation-e2e.spec.ts` の冒頭註釈:1550 — ec/15.2',
    kinds: ['指し先の直後に行番号が添えられている'],
  },
  {
    label: '登録が宣言より少ない（無言の削除）',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ua/22.6',
    kinds: ['§4 の指し先が宣言より少ない'],
  },
];

/** 告発してはならない形（陰性対照）。宣言した記法に従う正しい指し先 */
const MUST_NOT_DETECT: readonly Sample[] = [
  {
    label: '単一の区間',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ua/22.6',
    kinds: [],
  },
  {
    label: '同一ファイルの複数の区間',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` / `監査ログは規定の構造を持つ` — ua/22.6',
    kinds: [],
  },
  {
    label: '冒頭註釈だけを指す',
    body: '- `e2e/specs/estimate/estimate-navigation-e2e.spec.ts` の冒頭註釈 — ec/15.2',
    kinds: [],
  },
  {
    label: '区間と冒頭註釈の両方を指す',
    body: '- `e2e/specs/estimate/estimate-navigation-e2e.spec.ts` の区間 `REQ-15.1：一覧のパンくず` および冒頭註釈 — ec/15.2',
    kinds: [],
  },
  {
    label: '一行に二つのファイルを並べる',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`、`e2e/specs/site-surveys/site-survey-export.spec.ts` の区間 `調査報告書出力ボタンが表示される` — ua/22.6・ss/11.1',
    kinds: [],
  },
  {
    label: '§4 の外に在る行番号つきの記法は見ない（§3 / §6 は _Boundary_ 外）',
    body: '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ua/22.6',
    kinds: [],
  },
];

const failures: string[] = [];
let assertions = 0;

function record(ok: boolean, message: string): void {
  assertions += 1;
  if (!ok) failures.push(message);
}

/** 陽性対照: 期待する種別が失敗に現れること */
function checkMustDetect(): void {
  for (const sample of MUST_DETECT) {
    const result = runCheck(wrap(sample.body), CANON);
    const kinds = new Set(result.failures.map((failure) => failure.kind));
    for (const expected of sample.kinds) {
      record(
        kinds.has(expected),
        `陽性 [${sample.label}]: 種別 "${expected}" が出ていない（出た種別: ${[...kinds].join(' / ') || 'なし'}）`
      );
    }
  }
}

/** 陰性対照: 指し先そのものについての失敗が出ないこと（件数の宣言ずれは除く） */
function checkMustNotDetect(): void {
  const countKinds = new Set(['§4 の指し先が宣言より少ない', '§4 の指し先が宣言より多い']);
  for (const sample of MUST_NOT_DETECT) {
    const result = runCheck(wrap(sample.body), CANON);
    const offending = result.failures.filter((failure) => !countKinds.has(failure.kind));
    record(
      offending.length === 0,
      `陰性 [${sample.label}]: 指し先の失敗が ${offending.length} 件出た（${offending
        .map((failure) => `${failure.kind}: ${failure.detail}`)
        .join(' / ')}）`
    );
  }
}

/** 節ごと消えた文書を「合格」にしないこと */
function checkSectionRemoval(): void {
  const withoutSection = ['# 見出し', '', '## 3. 是正した被覆印', '', 'なにか', ''].join('\n');
  record(extractSection(withoutSection) === null, '節の切り出し: §4 が無い文書で null にならない');
  const result = runCheck(withoutSection, CANON);
  const kinds = new Set(result.failures.map((failure) => failure.kind));
  record(kinds.has('§4 を切り出せない'), '節ごとの削除: 「§4 を切り出せない」が出ていない');
  record(result.pointerCount === 0, '節ごとの削除: 指し先が 0 件として数えられていない');

  const withoutEnd = ['## 4. 引き継ぐ被覆印', '', 'なにか'].join('\n');
  record(
    extractSection(withoutEnd) === null,
    '節の切り出し: §5 の見出しが無い文書で null にならない'
  );
}

/** 走査の正典が空なら前提の崩壊として赤くすること */
function checkEmptyCanon(): void {
  const body =
    '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ua/22.6';
  const result = runCheck(wrap(body), []);
  const kinds = new Set(result.failures.map((failure) => failure.kind));
  record(kinds.has('走査の正典が空'), '空の正典: 「走査の正典が空」が出ていない');
  record(MINIMUM_CANON_MARKS >= 1, '空の正典: 下限が 1 未満に緩んでいる');
}

/** 件数の照合が両側から効くこと（遊びを持たせない） */
function checkCountHasNoSlack(): void {
  const one =
    '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される` — ua/22.6';
  const under = preconditionFailures(wrap(one), CANON.length, DECLARED_POINTER_COUNT - 1);
  record(
    under.some((failure) => failure.kind === '§4 の指し先が宣言より少ない'),
    '件数の照合: 宣言より 1 件少ないときに赤くならない'
  );
  const over = preconditionFailures(wrap(one), CANON.length, DECLARED_POINTER_COUNT + 1);
  record(
    over.some((failure) => failure.kind === '§4 の指し先が宣言より多い'),
    '件数の照合: 宣言より 1 件多いときに赤くならない'
  );
  const exact = preconditionFailures(wrap(one), CANON.length, DECLARED_POINTER_COUNT);
  record(exact.length === 0, '件数の照合: ちょうど一致で赤くなる');
  record(DECLARED_POINTER_COUNT > 0, '件数の照合: 宣言が 0 件（母集団の崩壊）');
}

/** 読み取りが「記法を崩せば消える」形になっていないこと */
function checkParserDoesNotSilentlySkip(): void {
  const parsed = parsePointers('- `e2e/specs/admin/audit-log.spec.ts` — ua/22.6');
  record(parsed.pointers.length === 0, '読み取り: 記法から外れた綴りを指し先として数えている');
  record(parsed.failures.length === 1, '読み取り: 記法から外れた綴りを黙って読み飛ばしている');
  const legacy = legacyLineNumberFailures('- `e2e/specs/admin/audit-log.spec.ts:44` — ua/22.6');
  record(legacy.length === 1, '読み取り: 行番号つきの旧記法を取り逃がしている');
  const clean = legacyLineNumberFailures('- `e2e/specs/admin/audit-log.spec.ts` の区間 `A`');
  record(clean.length === 0, '読み取り: 行番号を持たない綴りを旧記法と誤っている');
}

/** 件数の数え方（冒頭註釈も 1 件） */
function checkPointerCounting(): void {
  const parsed = parsePointers(
    '`e2e/specs/estimate/estimate-navigation-e2e.spec.ts` の区間 `REQ-15.1：一覧のパンくず` および冒頭註釈'
  );
  record(parsed.failures.length === 0, '件数: 区間＋冒頭註釈の綴りを読めていない');
  record(
    countPointerTargets(parsed.pointers) === 2,
    '件数: 区間＋冒頭註釈が 2 件として数えられていない'
  );
  const canon = buildCanonIndex(CANON);
  record(
    existenceFailures(parsed.pointers, canon).length === 0,
    '件数: 実在する区間＋冒頭註釈を告発している'
  );
}

/**
 * 前提の崩壊を表す種別は `MUST_DETECT` の本文だけでは作れない（文書の本文ではなく、
 * 節の消失・正典の空・件数のずれという文書の外の条件で出る）。専用の検査が覆っている
 * ことを名指しで宣言し、その検査が消えたら {@link checkKindCoverage} が赤くする。
 */
const KINDS_COVERED_BY_DEDICATED_CHECKS: ReadonlyArray<{ kind: string; by: string }> = [
  { kind: '§4 を切り出せない', by: 'checkSectionRemoval' },
  { kind: '走査の正典が空', by: 'checkEmptyCanon' },
  { kind: '§4 の指し先が宣言より多い', by: 'checkCountHasNoSlack' },
];

/** 本体が出す失敗の種別を、対照が一つ残らず覆っていること */
function checkKindCoverage(): void {
  const body = readFileSync(BODY, 'utf-8');
  const declared = new Set<string>();
  for (const match of body.matchAll(/kind: '([^']+)'/g)) declared.add(match[1] ?? '');
  record(declared.size > 0, '種別の網羅: 本体から失敗の種別を一つも取り出せない');
  const covered = new Set<string>();
  for (const sample of MUST_DETECT) for (const kind of sample.kinds) covered.add(kind);
  const self = readFileSync(SELF, 'utf-8');
  for (const entry of KINDS_COVERED_BY_DEDICATED_CHECKS) {
    record(
      self.includes(`function ${entry.by}(`),
      `種別の網羅: 種別 "${entry.kind}" を覆うと宣言した ${entry.by} が消えている`
    );
    covered.add(entry.kind);
  }
  for (const kind of declared) {
    record(covered.has(kind), `種別の網羅: 対照が種別 "${kind}" を覆っていない`);
  }
}

/**
 * 同一ファイル内で表題が重複する指し先を、実際に数えられること。
 *
 * **実データは現況 0 件であるため、実データだけでは陽性側が一度も走らない。** 重複を持つ
 * 合成の正典を与えて陽性を取り、実データ相当の合成で陰性を取る。
 */
function checkAmbiguousTargets(): void {
  const pointer = parsePointers(
    '`e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`'
  );
  record(pointer.failures.length === 0, '重複の計数: 対照の指し先を読めていない');
  const duplicated = ambiguousTargets(
    pointer.pointers,
    buildCanonIndex(CANON_WITH_DUPLICATE_TITLES)
  );
  record(duplicated.length === 1, `重複の計数: 陽性が ${duplicated.length} 件（期待は 1 件）`);
  record(
    duplicated[0]?.includes('2 区間') === true,
    `重複の計数: 区間の数が出ていない（${duplicated[0] ?? 'なし'}）`
  );
  const unique = ambiguousTargets(pointer.pointers, buildCanonIndex(CANON));
  record(unique.length === 0, `重複の計数: 陰性が ${unique.length} 件（期待は 0 件）`);
}

/**
 * 印字が計算結果から導かれていること（定数へ畳む変異を塞ぐ）。
 *
 * **二方向で施錠する**——(1) 整形関数へ合成の値を与えて逐語に現れることを見る、
 * (2) `main` が整形関数を経由して印字していることを見る。片方だけでは、整形関数を残したまま
 * `main` が定数を印字する形（あるいは整形関数を定数へ畳む形）が素通りする。
 * **重複の件数はとくに重要である**——記録自身が「受け口は鮮度の宣言だけ」と述べており、
 * 定数化を捕らえるものが他に無い。
 */
function checkPrintedFiguresAreDerived(): void {
  const summary = formatCheckSummary({
    failures: [],
    pointerCount: 7,
    canonMarkCount: 11,
    fileCount: 3,
  });
  record(summary.includes('7 件'), `印字: 指し先の件数が導かれていない（${summary}）`);
  record(summary.includes('3 ファイル'), `印字: ファイルの件数が導かれていない（${summary}）`);
  record(summary.includes('11 件'), `印字: 正典の件数が導かれていない（${summary}）`);
  record(
    !summary.includes(String(DECLARED_POINTER_COUNT)),
    `印字: 宣言の定数が要約へ焼き込まれている（${summary}）`
  );
  record(
    formatDuplicateSummary(3).includes('3 件'),
    '印字: 重複の件数が導かれていない（定数へ畳まれた疑い）'
  );
  record(formatDuplicateSummary(0).includes('0 件'), '印字: 重複 0 件の要約が出ていない');
  const body = readFileSync(BODY, 'utf-8');
  const entry = body.slice(body.lastIndexOf('function main('));
  record(
    entry.includes('formatCheckSummary(result)'),
    '結線: main が formatCheckSummary を経由して印字していない（定数の直接印字を疑う）'
  );
  record(
    entry.includes('formatDuplicateSummary(rows.length)'),
    '結線: main が formatDuplicateSummary を経由して印字していない（定数の直接印字を疑う）'
  );
}

/** 指し先そのものについての失敗だけを取り出す（件数の宣言ずれは判定に使わない） */
function pointerFailureKinds(documentText: string): string[] {
  const countKinds = new Set(['§4 の指し先が宣言より少ない', '§4 の指し先が宣言より多い']);
  return runCheck(documentText, CANON)
    .failures.map((failure) => failure.kind)
    .filter((kind) => !countKinds.has(kind));
}

/**
 * 本体のヘッダが開示している限界。
 *
 * **開示は挙動と結びつけて固定する**（115.293 / 115.294 / 115.297 の教訓）。`phrase` は本体の
 * ソースから逐語で探し、`holds` は開示された挙動を実際に再現する。**塞いだのに開示が残る／
 * 開示だけ消えて挙動が残る、のどちらも赤くなる。** `phrase` の逐語は本体（別ファイル）に在り、
 * 本ファイルの文字列リテラルとは別の場所を読むため、照合が恒真へ退化しない。
 */
const DISCLOSED_LIMITS: ReadonlyArray<{ label: string; phrase: string; holds: () => boolean }> = [
  {
    label: '同一ファイル内の別の区間へ指し先が滑っても素通りする',
    phrase: '同じファイルの別の区間の表題へ書き換える変異は素通りする',
    holds: () => {
      const before = '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`';
      const after =
        '- `e2e/specs/admin/audit-log.spec.ts` の区間 `ロール作成時に監査ログが記録される`';
      return (
        pointerFailureKinds(wrap(before)).length === 0 &&
        pointerFailureKinds(wrap(after)).length === 0
      );
    },
  },
  {
    label: '指し先から離れた散文の中の行番号は禁じていない',
    phrase: '行番号を書く形は素通りする',
    holds: () => {
      const far =
        '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ` — ua/22.6: ' +
        '115.220 が同ファイルへ観測を足した分だけ一律に 13 行ずれた（歴史記録として引く形）。';
      const near =
        '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`（13 行） — ua/22.6';
      // 離れた散文は通り、直後に添えた形だけが落ちる（片側だけでは開示の言い分が立たない）
      return (
        pointerFailureKinds(wrap(far)).length === 0 &&
        pointerFailureKinds(wrap(near)).includes('指し先の直後に行番号が添えられている')
      );
    },
  },
  {
    label: '§3 と §6 に残る行番号つきの指し先は面の外である',
    phrase: '§3 と §6 は見ない',
    holds: () => {
      const document = [
        '## 3. 是正した被覆印',
        '',
        '- `e2e/specs/admin/audit-log.spec.ts:44,85` — 旧記法（§4 の外）',
        '',
        '## 4. 引き継ぐ被覆印',
        '',
        '- `e2e/specs/admin/audit-log.spec.ts` の区間 `監査ログは規定の構造を持つ`',
        '',
        '## 5. 実測',
        '',
        '- `e2e/specs/admin/audit-log.spec.ts:99` — 旧記法（§4 の外）',
      ].join('\n');
      return pointerFailureKinds(document).length === 0;
    },
  },
];

/** 開示の逐語が本体に在り、開示した挙動が実測と一致すること */
function checkDisclosedLimits(): void {
  const body = readFileSync(BODY, 'utf-8');
  for (const limit of DISCLOSED_LIMITS) {
    record(
      body.includes(limit.phrase),
      `開示: 逐語「${limit.phrase}」が本体から消えている（塞いだのなら開示も同じ変更で消すこと）`
    );
    record(
      limit.holds(),
      `開示: 開示している挙動が実測と食い違う [${limit.label}]（塞いだのなら開示も同じ変更で消すこと）`
    );
  }
}

/** 前提の確認が `main` から実際に呼ばれていること */
function checkPreconditionsAreWired(): void {
  const source = readFileSync(SELF, 'utf-8');
  const entryBody = source.slice(source.lastIndexOf('function main('));
  record(
    entryBody.includes('reportPreconditions()'),
    '結線: main が reportPreconditions() を呼んでいない（対照より先に走らせること）'
  );
}

/** 本ファイルが宣言する `function check*` が一つ残らず結線されていること */
function structuralWiringFailures(): string[] {
  const source = readFileSync(SELF, 'utf-8');
  const declared = [...source.matchAll(/^function (check[A-Za-z0-9_]*)\(/gm)].map((m) => m[1]);
  const wiredBlock = source.slice(
    source.indexOf('\nconst STRUCTURAL: ReadonlyArray'),
    source.lastIndexOf('function main(')
  );
  const missing = declared.filter((name) => !wiredBlock.includes(`${name},`));
  return missing.map((name) => `結線: ${name} が STRUCTURAL に登録されていない`);
}

const STRUCTURAL: ReadonlyArray<() => void> = [
  checkMustDetect,
  checkMustNotDetect,
  checkSectionRemoval,
  checkEmptyCanon,
  checkCountHasNoSlack,
  checkParserDoesNotSilentlySkip,
  checkPointerCounting,
  checkKindCoverage,
  checkAmbiguousTargets,
  checkPrintedFiguresAreDerived,
  checkDisclosedLimits,
  checkPreconditionsAreWired,
];

/**
 * 対照より先に走らせる前提の確認。
 *
 * ここで赤くするのは「対照が空」「結線が抜けた」という**走査が空回りする状態**である。
 * 配列へ登録せず直列に書くのは、守り手を守られる側と同じレジストリへ置かないためである。
 */
function reportPreconditions(): void {
  record(MUST_DETECT.length > 0, '前提: MUST_DETECT が空（陽性対照が無い）');
  record(MUST_NOT_DETECT.length > 0, '前提: MUST_NOT_DETECT が空（陰性対照が無い）');
  record(STRUCTURAL.length > 0, '前提: STRUCTURAL が空（検査が一つも結線されていない）');
  record(CANON.length > 0, '前提: 合成の正典が空（突き合わせる相手が無い）');
  record(
    KINDS_COVERED_BY_DEDICATED_CHECKS.length > 0,
    '前提: 専用の検査が覆う種別の宣言が空（種別の網羅が空回りする）'
  );
  record(DISCLOSED_LIMITS.length > 0, '前提: DISCLOSED_LIMITS が空（開示の対照が無い）');
  record(
    CANON_WITH_DUPLICATE_TITLES.length > 0,
    '前提: 重複を持つ合成の正典が空（重複の陽性対照が空回りする）'
  );
  record(
    CANON.some((row) => row.title === ''),
    '前提: 合成の正典に冒頭註釈の被覆印が無い（その形の対照が空回りする）'
  );
  record(
    CANON.some((row) => row.title !== ''),
    '前提: 合成の正典に表題つきの区間が無い（その形の対照が空回りする）'
  );
  for (const message of structuralWiringFailures()) record(false, message);
}

function main(): void {
  reportPreconditions();
  for (const check of STRUCTURAL) check();
  if (failures.length > 0) {
    console.error(`裁定記録 §4 指し先検査の自己検査: ${failures.length} 件失敗 / ${assertions} 件`);
    for (const message of failures) console.error(`  - ${message}`);
    return;
  }
  console.log(`裁定記録 §4 指し先検査の自己検査: ${assertions}/${assertions} 件成功`);
  process.exitCode = 0;
}

main();
