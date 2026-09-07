/**
 * @fileoverview 要件被覆の検査における「本番到達性」判定の自己検査
 *
 * scripts/check-requirement-coverage.ts が加えた到達性の判定について、
 *
 *   - 到達するので被覆源として数えなければならない形
 *   - 到達しないので被覆源として数えてはならない形
 *
 * の双方を注入して固定する。片側だけを固定すると、判定が「常に到達」へ倒れても
 * 「常に不到達」へ倒れても検出できず、検査自身が偽の緑を出す。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-coverage.selftest.ts
 *   npm run check:req-coverage:selftest
 *
 * 判定が壊れたまま本検査が「合格」を出す状態を防ぐため、本検査の前に走らせる。
 *
 * ---
 *
 * ## 変異走査の対応表（タスク 115.197 で実測。是正2巡目で測り直した）
 *
 * 自己検査それ自体が空振りしていないかは、**読み取り規則の側を壊して本検査が赤くなるか**で
 * しか分からない。以下は 115.197 で読み取り規則へ当てた 61 の変異と、赤くなった検査である。
 * 走査は使い捨てのハーネスで行い、変異後ソースを diff で目視し、
 * summary 行（`N/N 件の確認に…`）の有無で「異常終了」と「全件通過」を機構で区別した。
 * 置換は `String.replace` の特殊置換パターンを避けるため関数形式で当て、
 * 本番検査の出力は `process.exit` による切り詰めを避けるため子プロセス側でファイルへ落とした。
 * 表を残すのは、**再現の手間ではなく処遇の根拠を残すため**である
 * （どの主張がどの変異を担っているかが分かれば、見本を消す変更が何を失うかが分かる）。
 *
 * 対象は四領域と、既存の一覧項目の読み取り:
 *   逐語複製 (A) / 取り消し線 (B) / 除外分類 (C) / 到達性 (D) / 一覧項目の読み取り (R)
 *
 * ### 走査の結果（是正2巡目の実測）
 *
 * 57/61 が赤くなった。無言だった 4 件はいずれも**実データ上の挙動に差が無い変異**であり、
 * `check:req-coverage` の出力（37942 バイト）と `--json`（677017 バイト）が
 * HEAD とバイト単位で完全一致することを実測して確かめた:
 *
 *   1. `criterionQuote` の `lastIndexOf('shall ')` → `indexOf('shall ')`
 *      一つの条文が `shall ` を二度持つときだけ差が出る。実データは受入基準 2888 件・
 *      `shall ` を含むもの 2500 件・二重 `shall` は 0 件。どちらで切るのが正しいかは
 *      実データからは決まらないため、挙動ではなく**前提の側**を
 *      checkDoubleShallCriterionIsAbsent で固定した。前提が崩れた時点で赤くなる。
 *   2. `reportCriterionTextCopies` の `if (ids.length !== 1) continue;` の撤去
 *      同じ目印を持つ条文が複数あるとき、各条文の本文はその目印を必ず含むため、
 *      直後の「同一機能の他の条文の本文にも現れる語句は除く」で必ず除かれる。
 *      **後段に包含される等価変異**であり、後段の側は
 *      checkAmbiguousQuoteIsNotUsedAsMark が捕まえる。
 *   3. `parseHeaderListItemIds` の `idRegion.split(/[,、]/)` へスラッシュを足す変異
 *      分割の前に `ID_LIST_REGION_REGEX` が欄全体の文法を検査しており、
 *      通過した欄にスラッシュは存在しえない。**前段に包含される等価変異**であり、
 *      前段（文法側）へ同じ変異を当てると
 *      「識別子の並びでない箇条書きと印を持たない継続行は読まない」が赤くなる。
 *   4. `resolveHeaderSectionEnd` の `if (blankLine > 0)` → `if (blankLine >= 0)`
 *      `content.indexOf('\n\n', headerIndex + 1)` は `headerIndex + 1 >= 1` から探すため
 *      0 を返しえない。**到達不能な分岐の書き換え**であり、比較のどちらでも同じ値になる。
 *
 * ### 是正2巡目で新たに赤化させた空振り（6 種・変異としては 10 件）
 *
 * 独立レビューは別の四領域から自分で変異を考案し、**自己検査が緑のまま本番の出力が動く**
 * 形を三つ見つけた。走査を広げた結果、同じ類型がさらに三つ見つかった。
 * 括弧内が担い手となる検査である。各種について、緩める向きと締める向きの両方を当てている
 * （母数の水増しと数え落とし、既定値 `'1'` と `'2'`、`auditExclusions` と
 * `buildExcludedIdSet`、`.d.ts` と検証ファイル）。
 *
 *   - `if (hasCopy) blocksWithCopy += 1;` を無条件の加算へ（守備範囲の母数は写しを持つ区間だけ
 *     を数える）。守備範囲が 283件 → 1850件 へ水増しされる
 *   - `PRODUCTION_ENTRY_POINTS` から `backend/prisma/seed.ts` を落とす（本番の経路の起点が
 *     どれも遊んでいない）。到達被覆 98.1% → 97.8%、`backend/src/utils/seed-helpers.ts` が
 *     死コード扱いへ転落する
 *   - `parseHeaderListItemIds` の `criterion: head[2] ?? null` を `?? '1'` へ（枝番を持たない
 *     識別子欄から受入基準を名乗らない）。`--json` に約20件の存在しない被覆主張が湧く
 *   - `auditExclusions` / `buildExcludedIdSet` の `normalizeExclusionId` の結線を外す
 *     （除外の各形を正しく分類する）。旧形式の除外 25 件が分母へ戻り、適用対象が
 *     2683 → 2708 件、到達被覆率が 98.06% → 97.16% へ動く
 *   - `buildReachabilityReport` の本番モジュールから `.d.ts` / 検証ファイルの除外を落とす
 *     （型宣言は本番モジュールとして数えない）。本番モジュールが 590 → 593 件、
 *     到達しない本番モジュールが 54 → 57 件へ動く
 *   - `reportCriterionTextCopies` の候補を区間が名乗る機能から全機能へ広げる
 *     （目印の候補は区間が名乗っている機能の条文に限る）。ゲートの出力が
 *     37942 → 56816 バイトへ膨れる（＝大量の偽陽性）
 *
 * ### 受入条件の書き直し後に閉じた名指しの 3 項目（2026-08-30 に測り直した）
 *
 * 走査ではなく**数え上げ**で閉じた。実データを本番の規則へ通し、規則が入力を分割する同値類の
 * うち実データが実現している類を数え、見本と突き合わせた（変異を当てる前に特定できる）。
 *
 *   1. `auditExclusions` の到達性の引き当てが `undefined` になる形
 *      実測: `in-repo-unverified` は 148 件で、**全件が「写像に項目が無い」形**である
 *      （`reachable: false` を明示する形は 0 件）。既存の見本 `demo/REQ-1.5` は明示側だけを
 *      固定していたため、`reachable === true` → `!== false` の変異が無言だった。
 *      この変異は `--strict` の「リポジトリ内検証を掲げるが不在」を **148 件 → 0 件**にし、
 *      FAILED 行を一つ消す（＝偽の緑の供給源）。写像に入れない `demo/REQ-1.6` を足して赤化。
 *   2. `IN_REPO_VERIFICATION_TOOL` の 7 語のうち、実データで**単独一致となる 4 語**
 *      実測（語の判定へ到達する除外 202 件に対する 一致件数 / 単独一致件数）:
 *      vitest 98/71・jest 64/24・playwright 10/10・storybook 4/4。
 *      語の判定へ到達する既存の見本の代替検証はすべて `Vitest / React Testing Library` の形で、
 *      二語が同居していた（`Vitest` 単独の `demo/REQ-9.9` は stale で語の判定へ到達しない）。
 *      同居する形しか無いと、一語を落とす変異が残りの語に拾われて無言になる
 *      （vitest を落としても RTL が拾う）。`demo/REQ-1.6`（`Vitest`）、
 *      `demo/REQ-1.7`（`Playwright ...`）、`demo/REQ-1.8`（`Storybook ...`）、
 *      `demo/REQ-1.9`（`Jest / Prisma`）を足し、4 語すべてを単独で担わせて赤化。
 *      見本が単独一致であること自体は機構で押さえた（tool 文字列から当該の語を抜いた写しを
 *      同じ判定器へ通し、external へ移ることを主張する）。見本を同居する形へ書き戻すと赤くなる。
 *   3. `PROSE_BULLET_IS_NOT_AN_ID_LIST` 直前の docstring の記述と実測の食い違い
 *      「区切りを広げる変異を**どの見本も捕まえない**」と書いていたが、実測では
 *      文法側（`ID_LIST_REGION_REGEX` の `[,、]` → `[,、/]`）を当てるとこの検査が赤くなる。
 *      無言なのは分割側（`parseHeaderListItemIds` の `split`）であり、それは上の等価変異 3 番
 *      として既に記録済みである。docstring を実測に合わせ、この一行が**文法側**を担うと直した。
 *
 * ### 残る 3 語は実データ上の等価変異である（同 2026-08-30 の実測）
 *
 * `supertest` / `react testing library` / `\brtl\b` は**単独一致が 0 件**であり、実データでは
 * 常に他の語に同居する形でのみ現れる。したがって一語を落としても判定は動かない:
 *
 *   - `supertest`: 一致 19 件 / 単独一致 0 件
 *   - `react testing library`: 一致 34 件 / 単独一致 0 件
 *   - `\brtl\b`: 一致 2 件 / 単独一致 0 件
 *
 * それぞれを落とす変異について、`check:req-coverage`（37942 バイト）・`--strict`（38189 バイト）・
 * `--json`（677017 バイト）が HEAD と**バイト単位で一致**することを実測した。
 * 単独一致となる 4 語の側は、同じ測り方で 3 つの出力すべてが HEAD と食い違う。
 * この 3 語の見本を足しても実データ上の主張は増えないため、足していない
 * （実データが単独一致を持つようになった時点で、この記録の件数が実測と合わなくなる）。
 *
 * ### 是正2巡目で赤化させた 2 件（レビューが非阻害と判断したもの）
 *
 *   - `line: Math.max(1, block.declaration + 1)` の `Math.max` 撤去
 *     （ファイル前書きの区間でも行番号が 1 以上になる）。実データのゲートは動かないが、
 *     前書きの区間で食い違いが出た瞬間に 0 行目を指す指摘になる。限界ではなく欠陥として塞いだ
 *   - `classifyCoverageSource` の `!isTypeDeclarationFile(dep)` 撤去
 *     （死んだ本番モジュールと、その検証）。実データに `.d.ts` を直接取り込む検証は無いが、
 *     型しか見ていない検証が被覆源として数えられる形なので、仮想リポジトリの見本で塞いだ
 *
 * ### 是正1巡目で見本を足して初めて赤くなった 10 件
 *
 *   - `MIN_CRITERION_QUOTE_LENGTH` を 4 へ落とす（逐語複製の目印を狙った形だけ取り出す）
 *   - `criterionQuote` の `.trim()` 撤去（同上）
 *   - `proseAttributesCriterion` の `(?![0-9])` 撤去（出典明示の免除が条文の番号だけに反応する）
 *   - 同上の `(?<![0-9.])` 撤去（同じ検査）
 *   - 同上のドットの逃がし撤去（同じ検査）
 *   - 「他の条文の本文にも現れる語句は除く」の撤去（他の条文の本文にも現れる語句は目印にしない）
 *   - `block.claimed.has(criterionId)` の撤去（区間が名乗っている条文は食い違いにしない）
 *   - `isRetiredCriterionText` の `~~` を `~` へ緩める（取り消し線の判定が狙った形だけを拾う）
 *   - `classifyCoverageSource` の `subjects.some` を `every` へ（生きた本番モジュールと、その検証）
 *   - 検証ファイルを検証対象から除く絞り込みの撤去（死んだ本番モジュールと、その検証）
 *
 * 残る 35 件は既存の見本が捕まえていた（除外分類は「除外の各形を正しく分類する」が、
 * 到達性は「生きた／死んだ本番モジュールと、その検証」および
 * 「到達する被覆源が一つでもあれば到達とする」が担う）。
 *
 * ### この表の読み方（結語）
 *
 * **赤の比率は、走査が十分であったことの根拠にならない。** 是正1巡目はここに
 * 「41/44 が赤くなった（＝見本の不足ではない）」と書いていたが、その時点で
 * 上記の空振りが六種・十件残っていた。独立レビューが**別の切り口から自分で変異を考案**して
 * 初めて見つかったのであり、比率はそれを何一つ示唆していなかった。
 * 走査は自分の想像した変異の範囲しか測れないので、「全部赤かった」は
 * 「自分が思いついた変異の中に穴が無かった」以上のことを意味しない。
 *
 * この表が根拠として使えるのは次の一点に限る:
 * **どの主張がどの変異を担っているかの対応**である。見本を消す・緩める変更を出すときは、
 * ここで名指された変異をもう一度当てて、赤が失われないことを確かめること。
 * 逆に、ここに無い形の変異が無言で通ることは十分にありうる。
 * 無言の変異を見つけたら、本番の出力（`check:req-coverage` と `--json`）が
 * HEAD と**バイト単位で一致するか**を必ず測ること。動くなら空振りであり、
 * 一致するなら等価変異として上の一覧へ理由つきで記すこと。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  analyzeCriterionReachability,
  auditExclusions,
  buildExcludedIdSet,
  buildModuleGraph,
  buildReachabilityReport,
  classifyCoverageSource,
  CODE_DIRS,
  computeReachableModules,
  discoverFeatures,
  extractHeaderScopedCoverage,
  extractAllFeatures,
  extractImportSpecifiers,
  extractRequirements,
  ANY_COVERAGE_HEADER_REGEX,
  extractTestCoverage,
  calculateCoverage,
  checkSummaryIntegrity,
  collectOutOfDenominatorMarks,
  criterionQuote,
  E2E_SPECS_ROOT,
  findCriterionTextCopyMismatches,
  findRetiredCriterionCoverageMarks,
  findUnknownCriterionCoverageMarks,
  formatExclusionCategoryHeading,
  isDeclaredCoverageHeader,
  readFeaturelessHeadersInContent,
  findFeaturelessCoverageHeaders,
  MAX_FEATURELESS_COVERAGE_HEADERS,
  MAX_DORMANT_HEADER_NAMES,
  buildInlineTagPatterns,
  isRetiredCriterionText,
  extractFileCoverage,
  isCodeFenceDelimiterLine,
  listCoverageScanFiles,
  listCoverageScanFilesAdmittedBy,
  COVERAGE_FILE_PATTERN,
  SCAN_EXCLUDED_DIRECTORIES,
  MIN_CRITERION_QUOTE_LENGTH,
  reportCriterionTextCopies,
  isVerificationFile,
  normalizeExclusionId,
  PRODUCTION_ENTRY_POINTS,
  PRODUCTION_ROOTS,
  resolveHeaderSectionEnd,
  resolveImport,
  selectExclusionsForFeatures,
  toPosixPath,
  type Feature,
  type CoverageResult,
  type CriterionReachability,
  type ExclusionsFile,
  type ExclusionVerdict,
  type ModuleGraph,
  type OutOfDenominatorMarks,
  type ReachabilityReason,
  type TestCoverage,
} from './check-requirement-coverage.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

interface Case {
  /** 何を確かめるか */
  name: string;
  /**
   * 対照の極性（タスク 115.252）
   *
   * 陽性（被覆源として数えなければならない側）と陰性（数えてはならない側）の**両方**が残って
   * いることを `guardControlsArePresent()` が群ごとに確かめるための属性。**名前の綴りからも
   * 変数名からも導かない**（115.247 の作法）。極性を持たない機構の確認では省く。
   */
  polarity?: 'positive' | 'negative';
  /** 自前で失敗の一覧を返す */
  run: () => string[];
}

interface Group {
  readonly title: string;
  readonly cases: readonly Case[];
}

// ============================================================================
// 仮想リポジトリの構築
// ============================================================================

/** 仮想リポジトリの中身（相対パス → 本文） */
type Fixture = Record<string, string>;

/**
 * 仮想リポジトリを組み立てて本体へ通す。
 *
 * **中身の空いた資料を置かせない**（AI運用7原則 第3原則。タスク 115.252 の是正。指摘 (2)）。
 * 資料の中身は `[...].join('\n')` で組み立てているものがあり、その素材を空にすると資料は
 * 空ファイルになる。空ファイルは取り込みを一本も持たないため、「型宣言だけを取り込む検証は
 * 被覆源に数えない」といった主張が、素材が担う形とは無関係に成立してしまう。
 * 素材の外側に在るこの入口で空を拒み、仮想リポジトリを組み立てる全箇所へ一度に効かせる。
 */
function withFixture<T>(files: Fixture, body: (baseDir: string) => T): T {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-coverage-reach-'));
  for (const [relative, content] of Object.entries(files)) {
    if (content.trim() === '') {
      throw new Error(`仮想リポジトリの資料 ${relative} が空です（この確認が空振りしています）`);
    }
  }
  try {
    for (const [relative, content] of Object.entries(files)) {
      const absolute = path.join(baseDir, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content, 'utf8');
    }
    return body(baseDir);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

interface Analyzed {
  graph: ModuleGraph;
  reachable: Set<string>;
  reasonOf: (file: string) => ReachabilityReason;
  reachableOf: (file: string) => boolean;
}

function analyze(baseDir: string): Analyzed {
  const graph = buildModuleGraph({
    baseDir,
    roots: ['frontend/src', 'backend/src'],
    entryPoints: ['frontend/src/main.tsx', 'backend/src/index.ts', 'backend/prisma/seed.ts'],
  });
  const reachable = computeReachableModules(graph);
  return {
    graph,
    reachable,
    reasonOf: (file) => classifyCoverageSource(file, graph, reachable).reason,
    reachableOf: (file) => classifyCoverageSource(file, graph, reachable).reachable,
  };
}

/**
 * 仮想リポジトリの土台
 *
 * `main.tsx` が `App.tsx` を取り込み、`App.tsx` が生きた部品を取り込む。
 * 死んだ部品はどこからも取り込まれない（テストと物語からのみ取り込まれる）。
 */
const BASE_FIXTURE: Fixture = {
  'frontend/src/main.tsx': "import App from './App';\nexport default App;\n",
  'frontend/src/App.tsx': [
    "import LiveWidget from './components/LiveWidget';",
    "import { helper } from '@/utils/helper';",
    "const lazy = () => import('./components/LazyWidget');",
    'export default function App() {',
    '  return [LiveWidget, helper, lazy];',
    '}',
    '',
  ].join('\n'),
  'frontend/src/components/LiveWidget.tsx': [
    "import { shared } from '../utils/shared';",
    'export default function LiveWidget() {',
    '  return shared;',
    '}',
    '',
  ].join('\n'),
  'frontend/src/components/LazyWidget.tsx':
    'export default function LazyWidget() {\n  return 1;\n}\n',
  'frontend/src/components/DeadWidget.tsx':
    'export default function DeadWidget() {\n  return 1;\n}\n',
  'frontend/src/utils/helper.ts': "export const helper = 'helper';\n",
  'frontend/src/utils/shared.ts': "export const shared = 'shared';\n",
  'frontend/src/utils/dead-util.ts': "export const deadUtil = 'dead';\n",
  'backend/src/index.ts': "import './app.js';\n",
  'backend/src/app.ts':
    "import { liveService } from './services/live.service.js';\nexport const app = liveService;\n",
  'backend/src/services/live.service.ts': "export const liveService = 'live';\n",
  'backend/src/services/dead.service.ts': "export const deadService = 'dead';\n",
};

// ============================================================================
// 被覆源として数えなければならない形（到達する）
// ============================================================================

function checkReachableForms(): string[] {
  const failures: string[] = [];
  const fixture: Fixture = {
    ...BASE_FIXTURE,
    // 名前が一致する検証対象が生きている
    'frontend/src/__tests__/components/LiveWidget.test.tsx':
      "import LiveWidget from '../../components/LiveWidget';\nexport default LiveWidget;\n",
    // 名前が一致しないが、取り込む本番モジュールが生きている
    'frontend/src/__tests__/misc/rendering.test.tsx':
      "import { shared } from '../../utils/shared';\nexport default shared;\n",
    // 動的取り込みでのみ到達する部品の検証
    'frontend/src/__tests__/components/LazyWidget.test.tsx':
      "import LazyWidget from '../../components/LazyWidget';\nexport default LazyWidget;\n",
    // 名前の一致する検証対象を持たず、生きた部品と死んだ部品の**両方**を取り込む形。
    // 判定は「取り込む本番モジュールのいずれかが生きているか」（some）であり、
    // 「すべてが生きているか」（every）ではない。
    // この形の見本が無いと、some を every へ変える変異をどの見本も捕まえない（115.197 の走査）
    'frontend/src/__tests__/misc/mixed-subjects.test.tsx': [
      "import { shared } from '../../utils/shared';",
      "import { deadUtil } from '../../utils/dead-util';",
      'export default [shared, deadUtil];',
      '',
    ].join('\n'),
    // `.js` 指定を辿る backend の検証
    'backend/src/__tests__/unit/services/live.service.test.ts':
      "import { liveService } from '../../../services/live.service.js';\nexport default liveService;\n",
  };

  withFixture(fixture, (baseDir) => {
    const { reasonOf, reachableOf } = analyze(baseDir);
    const expectations: Array<[string, ReachabilityReason]> = [
      ['frontend/src/App.tsx', 'production-reachable'],
      ['frontend/src/components/LiveWidget.tsx', 'production-reachable'],
      ['frontend/src/components/LazyWidget.tsx', 'production-reachable'],
      ['frontend/src/utils/helper.ts', 'production-reachable'],
      ['backend/src/services/live.service.ts', 'production-reachable'],
      ['frontend/src/__tests__/components/LiveWidget.test.tsx', 'verification-subject-reachable'],
      ['frontend/src/__tests__/misc/rendering.test.tsx', 'verification-subject-reachable'],
      ['frontend/src/__tests__/misc/mixed-subjects.test.tsx', 'verification-subject-reachable'],
      ['frontend/src/__tests__/components/LazyWidget.test.tsx', 'verification-subject-reachable'],
      [
        'backend/src/__tests__/unit/services/live.service.test.ts',
        'verification-subject-reachable',
      ],
    ];
    // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (expectations.length === 0) {
      failures.push('合成素材 expectations が空です（この確認が空振りしています）');
    }
    for (const [file, reason] of expectations) {
      const actual = reasonOf(file);
      if (actual !== reason) failures.push(`${file}: 期待 ${reason} に対し 実際 ${actual}`);
      if (!reachableOf(file)) failures.push(`${file}: 被覆源として数えられなければならない`);
    }
    // E2E は本番のビルドを駆動するため常に到達とみなす
    const e2e = classifyCoverageSource(
      'e2e/specs/site-surveys/x.spec.ts',
      analyze(baseDir).graph,
      new Set()
    );
    if (!e2e.reachable || e2e.reason !== 'e2e-drives-production') {
      failures.push(`e2e の被覆源が到達扱いにならなかった（${e2e.reason}）`);
    }
  });

  return failures;
}

// ============================================================================
// 被覆源として数えてはならない形（到達しない）
// ============================================================================

function checkUnreachableForms(): string[] {
  const failures: string[] = [];
  const fixture: Fixture = {
    ...BASE_FIXTURE,
    // 死んだ部品そのものに番号を付けた形
    // 死んだ部品を検証する形（名前が一致する検証対象が死んでいる）
    'frontend/src/__tests__/components/DeadWidget.test.tsx':
      "import DeadWidget from '../../components/DeadWidget';\nexport default DeadWidget;\n",
    // 死んだ部品の物語（Storybook）だけが取り込んでいる形
    'frontend/src/components/DeadWidget.stories.tsx':
      "import DeadWidget from './DeadWidget';\nexport default DeadWidget;\n",
    // 死んだ部品を主題としつつ、生きたモジュールも取り込む形
    // （名前の一致する検証対象を優先しなければ、生きた取り込みに紛れて緑になる）
    'frontend/src/__tests__/components/DeadWidget.extra.test.tsx': [
      "import DeadWidget from '../../components/DeadWidget';",
      "import { shared } from '../../utils/shared';",
      'export default [DeadWidget, shared];',
      '',
    ].join('\n'),
    // 本番のシンボルを一つも参照しない検証（生成物や外部パッケージの型だけを見る形）
    'backend/src/__tests__/unit/models/project.model.test.ts':
      "import { describe } from 'vitest';\nexport default describe;\n",
    // 検証の補助（それ自身が検証ファイル）だけを取り込み、本番のシンボルを直接は参照しない形。
    // 補助の先に生きた本番モジュールがあっても、**到達を主張させない**（判定は直接の取り込みで見る）。
    // 検証ファイルを検証対象から除かないと、検証どうしの連鎖で到達が水増しされる。
    // この形の見本が無いと、その除外を落とす変異をどの見本も捕まえない（115.197 の走査）
    'frontend/src/__tests__/support/render-helpers.ts':
      "import { shared } from '../../utils/shared';\nexport const render = shared;\n",
    'frontend/src/__tests__/misc/helper-only.test.tsx':
      "import { render } from '../support/render-helpers';\nexport default render;\n",
    // 型宣言（`.d.ts`）だけを取り込む検証。**型宣言は本番のシンボルではない**
    // （実行時の経路を持たず、消えても本番の挙動は変わらない）。
    // 生きた本番モジュールが同じ型宣言を取り込んでいるため、型宣言そのものは到達側に居る。
    // 検証対象から型宣言を除かないと、この検証は「生きた対象を持つ」ことになり
    // **型しか見ていない検証が被覆源として数えられる**（115.197 の走査）
    'frontend/src/types/live-shape.d.ts': 'export type LiveShape = { value: string };\n',
    'frontend/src/utils/shared.ts': [
      "import type { LiveShape } from '../types/live-shape.d';",
      "export const shared: LiveShape = { value: 'shared' };",
      '',
    ].join('\n'),
    'frontend/src/__tests__/misc/type-only.test.tsx': [
      "import type { LiveShape } from '../../types/live-shape.d';",
      'export default null as unknown as LiveShape;',
      '',
    ].join('\n'),
    // 死んだ部品から先だけが取り込む形（連鎖の先も死んでいる）
    'frontend/src/components/DeadChild.tsx': "export const deadChild = 'x';\n",
  };
  fixture['frontend/src/components/DeadWidget.tsx'] =
    "import { deadChild } from './DeadChild';\nexport default function DeadWidget() {\n  return deadChild;\n}\n";

  withFixture(fixture, (baseDir) => {
    const { reasonOf, reachableOf } = analyze(baseDir);
    const expectations: Array<[string, ReachabilityReason]> = [
      ['frontend/src/components/DeadWidget.tsx', 'production-unreachable'],
      ['frontend/src/components/DeadChild.tsx', 'production-unreachable'],
      ['frontend/src/utils/dead-util.ts', 'production-unreachable'],
      ['backend/src/services/dead.service.ts', 'production-unreachable'],
      ['frontend/src/__tests__/components/DeadWidget.test.tsx', 'verification-subject-unreachable'],
      [
        'frontend/src/__tests__/components/DeadWidget.extra.test.tsx',
        'verification-subject-unreachable',
      ],
      [
        'backend/src/__tests__/unit/models/project.model.test.ts',
        'verification-no-production-reference',
      ],
      ['frontend/src/__tests__/misc/helper-only.test.tsx', 'verification-no-production-reference'],
      ['frontend/src/__tests__/misc/type-only.test.tsx', 'verification-no-production-reference'],
    ];
    // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (expectations.length === 0) {
      failures.push('合成素材 expectations が空です（この確認が空振りしています）');
    }
    for (const [file, reason] of expectations) {
      const actual = reasonOf(file);
      if (actual !== reason) failures.push(`${file}: 期待 ${reason} に対し 実際 ${actual}`);
      if (reachableOf(file)) failures.push(`${file}: 被覆源として数えてはならない`);
    }
    // 走査対象の外は「判定できない」であって「到達」ではない
    const outside = classifyCoverageSource('docs/whatever.ts', analyze(baseDir).graph, new Set());
    if (outside.reachable || outside.reason !== 'source-not-scanned') {
      failures.push(`走査対象外が到達扱いになった（${outside.reason}）`);
    }
  });

  return failures;
}

// ============================================================================
// 取り込みの形（抽出漏れは「黙って死コード扱い」になる）
// ============================================================================

function checkImportFormsAreExtracted(): string[] {
  const source = [
    "import Default from './a';",
    "import { named } from './b';",
    "import type { T } from './c';",
    "import * as ns from './d';",
    "export { re } from './e';",
    "export * from './f';",
    "import './g';",
    "const lazy = () => import('./h');",
    'import {',
    '  multi,',
    "} from './i';",
    "// import Commented from './zz';",
    "/* import Blocked from './yy'; */",
    "const notAnImport = 'from ./xx';",
    '',
  ].join('\n');

  const specifiers = extractImportSpecifiers(source);
  const expected = ['./a', './b', './c', './d', './e', './f', './g', './h', './i'];
  const failures: string[] = [];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (expected.length === 0) {
    failures.push('合成素材 expected が空です（この確認が空振りしています）');
  }
  for (const want of expected) {
    if (!specifiers.includes(want)) failures.push(`${want} を抽出できなかった`);
  }
  // 陰性の合成素材。**同じ関数の陽性側だけを塞いでも、こちらが空なら「取り込みでない綴りを
  // 拾わない」という主張は恒真のまま残る**（第3原則。115.252 の指摘 (1)）。
  const forbiddenSpecifiers = ['./zz', './yy', './xx'];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (forbiddenSpecifiers.length === 0) {
    failures.push('合成素材 forbiddenSpecifiers が空です（この確認が空振りしています）');
  }
  for (const forbidden of forbiddenSpecifiers) {
    if (specifiers.includes(forbidden)) failures.push(`${forbidden} を誤って抽出した`);
  }
  return failures;
}

function checkSpecifierResolution(): string[] {
  const modules = new Set([
    'frontend/src/utils/helper.ts',
    'frontend/src/components/Widget.tsx',
    'frontend/src/components/panel/index.ts',
    'backend/src/services/live.service.ts',
  ]);
  const cases: Array<[string, string, string | null]> = [
    ['@/utils/helper', 'frontend/src/App.tsx', 'frontend/src/utils/helper.ts'],
    ['./components/Widget', 'frontend/src/App.tsx', 'frontend/src/components/Widget.tsx'],
    ['./components/panel', 'frontend/src/App.tsx', 'frontend/src/components/panel/index.ts'],
    ['./services/live.service.js', 'backend/src/app.ts', 'backend/src/services/live.service.ts'],
    ['../utils/helper', 'frontend/src/components/Widget.tsx', 'frontend/src/utils/helper.ts'],
    ['react', 'frontend/src/App.tsx', null],
    ['./missing', 'frontend/src/App.tsx', null],
  ];
  const failures: string[] = [];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (cases.length === 0) {
    failures.push('合成素材 cases が空です（この確認が空振りしています）');
  }
  for (const [specifier, from, expected] of cases) {
    const actual = resolveImport(specifier, from, modules);
    if (actual !== expected) {
      failures.push(
        `${specifier} (from ${from}): 期待 ${expected ?? 'null'} に対し 実際 ${actual ?? 'null'}`
      );
    }
  }
  return failures;
}

function checkVerificationFileDetection(): string[] {
  const failures: string[] = [];
  const mustBeVerification = [
    'frontend/src/__tests__/components/X.test.tsx',
    'frontend/src/components/X.test.tsx',
    'frontend/src/components/X.stories.tsx',
    'frontend/src/__mocks__/x.ts',
    'frontend/src/test-support/intersection-observer.ts',
    'backend/src/__tests__/unit/x.spec.ts',
    'e2e/specs/site-surveys/x.spec.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustBeVerification.length === 0) {
    failures.push('合成素材 mustBeVerification が空です（この確認が空振りしています）');
  }
  const mustNotBeVerification = [
    'frontend/src/components/X.tsx',
    'frontend/src/utils/testable.ts',
    'frontend/src/utils/latest.ts',
    'backend/src/services/x.service.ts',
    'backend/src/utils/protest.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustNotBeVerification.length === 0) {
    failures.push('合成素材 mustNotBeVerification が空です（この確認が空振りしています）');
  }
  for (const file of mustBeVerification) {
    if (!isVerificationFile(file)) failures.push(`${file} を検証ファイルと判定できなかった`);
  }
  for (const file of mustNotBeVerification) {
    if (isVerificationFile(file)) failures.push(`${file} を誤って検証ファイルと判定した`);
  }
  return failures;
}

// ============================================================================
// 受入基準への集約
// ============================================================================

function checkCriterionAggregation(): string[] {
  const failures: string[] = [];
  const fixture: Fixture = {
    ...BASE_FIXTURE,
    'frontend/src/__tests__/components/DeadWidget.test.tsx':
      "import DeadWidget from '../../components/DeadWidget';\nexport default DeadWidget;\n",
    'frontend/src/__tests__/components/LiveWidget.test.tsx':
      "import LiveWidget from '../../components/LiveWidget';\nexport default LiveWidget;\n",
  };

  withFixture(fixture, (baseDir) => {
    const graph = buildModuleGraph({
      baseDir,
      roots: ['frontend/src', 'backend/src'],
      entryPoints: ['frontend/src/main.tsx', 'backend/src/index.ts'],
    });
    const reachable = computeReachableModules(graph);
    const byCriterion = analyzeCriterionReachability(
      [
        {
          file: 'frontend/src/__tests__/components/DeadWidget.test.tsx',
          requirements: ['demo/REQ-1'],
          acceptanceCriteria: ['demo/REQ-1.1', 'demo/REQ-1.2'],
        },
        {
          file: 'frontend/src/__tests__/components/LiveWidget.test.tsx',
          requirements: ['demo/REQ-1'],
          acceptanceCriteria: ['demo/REQ-1.2'],
        },
      ],
      graph,
      reachable
    );

    const dead = byCriterion.get('demo/REQ-1.1');
    const mixed = byCriterion.get('demo/REQ-1.2');
    if (!dead || dead.reachable) {
      failures.push('死んだ部品の検証のみが被覆源の受入基準が到達扱いになった');
    }
    if (!mixed || !mixed.reachable) {
      failures.push('到達する被覆源を一つ持つ受入基準が不到達扱いになった');
    }
    if (dead && dead.sources.length !== 1) {
      failures.push(`被覆源の記録件数が 1 ではなく ${dead.sources.length} だった`);
    }
  });

  return failures;
}

// ============================================================================
// 除外一覧の監査
// ============================================================================

function exclusionOf(
  id: string,
  method: string,
  tool: string,
  category = 'integration-test'
): Parameters<typeof auditExclusions>[0][number] {
  return {
    id,
    requirement: `${id} の要件`,
    title: 'タイトル',
    reason: '理由',
    category,
    alternativeVerification: { method, tool, description: '説明', threshold: '-' },
  };
}

/**
 * 代替検証の語を**単独で**担う見本の tool 文字列（いずれも実データにある形）
 *
 * `IN_REPO_VERIFICATION_TOOL` の 7 語のうち、実データで単独一致となるのは
 * vitest / jest / playwright / storybook の 4 語である（2026-08-30 の実測。件数は @fileoverview）。
 * 二語が同居する形（`Vitest / React Testing Library`）しか見本に無いと、
 * 一語を落とす変異が残りの語に拾われて無言になる。
 */
const SOLE_TOOL_VITEST = 'Vitest';
const SOLE_TOOL_PLAYWRIGHT = 'Playwright (test.fail() ラチェット)';
const SOLE_TOOL_STORYBOOK = 'Storybook + Chromatic 等';
const SOLE_TOOL_JEST = 'Jest / Prisma';

function checkExclusionAudit(): string[] {
  const failures: string[] = [];
  const known = new Set([
    'demo/REQ-1.1',
    'demo/REQ-1.2',
    'demo/REQ-1.3',
    'demo/REQ-1.4',
    'demo/REQ-1.5',
    // 到達性の写像に**項目が無い**形。実データの in-repo-unverified 148 件は全件この形である。
    // 代替検証の語も `Vitest` 単独で、vitest だけが担う形を兼ねる
    'demo/REQ-1.6',
    // 代替検証の語が vitest 以外で単独に一致する形（playwright / storybook / jest）
    'demo/REQ-1.7',
    'demo/REQ-1.8',
    'demo/REQ-1.9',
    // 旧形式（機能名を持たない `REQ-N.M`）が揃えられた先。実データに 205 件中 25 件ある
    'user-authentication/REQ-4.1',
  ]);
  // **`demo/REQ-1.6` を意図して入れていない。** 実データの in-repo-unverified 148 件は
  // 全件が「写像に項目が無い（`get` が `undefined`）」形であり、`reachable: false` を
  // 明示する形は 0 件である。`demo/REQ-1.5` は明示側の固定であって、この形を写していない
  const reachability = new Map<string, CriterionReachability>([
    ['demo/REQ-1.4', { id: 'demo/REQ-1.4', sources: [], reachable: true }],
    ['demo/REQ-1.5', { id: 'demo/REQ-1.5', sources: [], reachable: false }],
    ['demo/REQ-1.7', { id: 'demo/REQ-1.7', sources: [], reachable: true }],
    ['demo/REQ-1.8', { id: 'demo/REQ-1.8', sources: [], reachable: true }],
    ['demo/REQ-1.9', { id: 'demo/REQ-1.9', sources: [], reachable: true }],
    [
      'user-authentication/REQ-4.1',
      { id: 'user-authentication/REQ-4.1', sources: [], reachable: true },
    ],
  ]);

  const audit = auditExclusions(
    [
      exclusionOf('demo/REQ-1.1', 'load-test', 'k6 / Artillery'),
      exclusionOf('demo/REQ-1.2', 'none', '-', 'pending-implementation'),
      exclusionOf('demo/REQ-1.3', 'unit-test', ''),
      exclusionOf('demo/REQ-9.9', 'unit-test', 'Vitest'),
      exclusionOf('demo/REQ-1.4', 'unit-test', 'Vitest / React Testing Library'),
      exclusionOf('demo/REQ-1.5', 'unit-test', 'Vitest / React Testing Library'),
      // 旧形式の ID。**監査の入口で機能名付きへ揃わなければ**、要件定義書に無い番号として
      // stale に落ちる。normalizeExclusionId 単体の主張だけでは、それが監査へ
      // 結線されているかを何も言えない（115.197 の走査で、結線を外す変異が無言だった）
      exclusionOf('REQ-4.1', 'unit-test', 'Vitest / React Testing Library'),
      // 到達性の写像に項目が無い形。`reachable === true` を `!== false` へ緩める変異は、
      // 明示 `false` の demo/REQ-1.5 では無言のまま、この形だけを in-repo-verified へ倒す
      // （実データでは --strict の失敗 148 件が 0 件になる＝偽の緑の供給源）
      exclusionOf('demo/REQ-1.6', 'unit-test', SOLE_TOOL_VITEST),
      // 代替検証の語を**一語ずつ**単独で担わせる。同居する語（`Vitest / React Testing Library`）
      // しか無いと、一語を落とす変異が残りの語に拾われて無言になる
      exclusionOf('demo/REQ-1.7', 'unit-test', SOLE_TOOL_PLAYWRIGHT),
      exclusionOf('demo/REQ-1.8', 'visual-regression', SOLE_TOOL_STORYBOOK),
      exclusionOf('demo/REQ-1.9', 'integration-test', SOLE_TOOL_JEST),
      exclusionOf('demo/REQ-1.5', 'unit-test', 'Vitest / React Testing Library'),
    ],
    known,
    reachability
  );

  const expected: Array<[string, ExclusionVerdict]> = [
    ['demo/REQ-1.1', 'external'],
    ['demo/REQ-1.2', 'pending'],
    ['demo/REQ-1.3', 'malformed'],
    ['demo/REQ-9.9', 'stale'],
    ['demo/REQ-1.4', 'in-repo-verified'],
    ['demo/REQ-1.5', 'in-repo-unverified'],
    ['user-authentication/REQ-4.1', 'in-repo-verified'],
    ['demo/REQ-1.6', 'in-repo-unverified'],
    ['demo/REQ-1.7', 'in-repo-verified'],
    ['demo/REQ-1.8', 'in-repo-verified'],
    ['demo/REQ-1.9', 'in-repo-verified'],
  ];
  for (const [index, [id, verdict]] of expected.entries()) {
    const entry = audit.entries[index];
    if (!entry || entry.id !== id || entry.verdict !== verdict) {
      failures.push(`${id}: 期待 ${verdict} に対し 実際 ${entry?.verdict ?? '無し'}`);
    }
  }
  const last = audit.entries[expected.length];
  if (!last || last.verdict !== 'duplicate') {
    failures.push(`二重登録を duplicate と判定できなかった（実際: ${last?.verdict ?? '無し'}）`);
  }
  const selected = selectExclusionsForFeatures(
    [
      exclusionOf('demo/REQ-1.1', 'load-test', 'k6'),
      exclusionOf('other/REQ-2.1', 'load-test', 'k6'),
      exclusionOf('REQ-3.1', 'load-test', 'k6'),
    ],
    ['demo', 'user-authentication']
  ).map((entry) => entry.id);
  if (selected.join(',') !== 'demo/REQ-1.1,REQ-3.1') {
    failures.push(
      `走査した機能への絞り込みが demo/REQ-1.1,REQ-3.1 ではなく ${selected.join(',') || '無し'} だった`
    );
  }
  if (normalizeExclusionId('REQ-4.1') !== 'user-authentication/REQ-4.1') {
    failures.push('旧形式の除外 ID を機能名付きへ揃えられなかった');
  }
  if (audit.byVerdict['in-repo-unverified'] !== 2) {
    failures.push(
      `in-repo-unverified の集計が 2 ではなく ${audit.byVerdict['in-repo-unverified']} だった`
    );
  }
  if (audit.byVerdict['in-repo-verified'] !== 5) {
    failures.push(
      `in-repo-verified の集計が 5 ではなく ${audit.byVerdict['in-repo-verified']} だった`
    );
  }
  // 語を一つ落とす変異は、単独で担っている項目を in-repo-* から external へ移す。
  // 集計の側でも押さえておくと、どの語が落ちたかによらず必ず赤くなる
  if (audit.byVerdict['external'] !== 1) {
    failures.push(
      `external の集計が 1 ではなく ${audit.byVerdict['external']} だった` +
        '（リポジトリ内検証の語を落とすと、その語だけが担う除外が external へ移る）'
    );
  }

  // 機構: 写像に項目が無い形の見本が、**到達性の引き当てにだけ反応している**ことを確かめる。
  // 同じ除外を、到達する項目を持たせた写像で監査し直すと in-repo-verified へ移らねばならない。
  // 移らないなら、この見本は別の理由（語の不一致・要件定義書に無い番号など）で落ちており、
  // `reachable` の判定を何も主張していない
  const reachabilityWithEntry = new Map(reachability);
  reachabilityWithEntry.set('demo/REQ-1.6', {
    id: 'demo/REQ-1.6',
    sources: [],
    reachable: true,
  });
  const flipped = auditExclusions(
    [exclusionOf('demo/REQ-1.6', 'unit-test', SOLE_TOOL_VITEST)],
    known,
    reachabilityWithEntry
  );
  if (flipped.entries[0]?.verdict !== 'in-repo-verified') {
    failures.push(
      '写像に到達する項目を持たせても demo/REQ-1.6 が in-repo-verified にならない' +
        `（実際: ${flipped.entries[0]?.verdict ?? '無し'}）。到達性の引き当て以外の理由で落ちている`
    );
  }

  // 機構: 語ごとの見本が、**その語だけで**リポジトリ内検証と判定されていることを確かめる。
  // 語の一覧（`IN_REPO_VERIFICATION_TOOL`）を写さずに済ませるため、tool 文字列から当該の語を
  // 抜いた写しを同じ判定器へ通し、external へ移ることを主張する。移らないなら、その見本は
  // 別の語にも一致しており（例: `Vitest / React Testing Library` へ書き戻された形）、
  // 当該の語を落とす変異に対して無言である
  const soleWordSamples: ReadonlyArray<{ id: string; tool: string; word: string }> = [
    { id: 'demo/REQ-1.6', tool: SOLE_TOOL_VITEST, word: 'Vitest' },
    { id: 'demo/REQ-1.7', tool: SOLE_TOOL_PLAYWRIGHT, word: 'Playwright' },
    { id: 'demo/REQ-1.8', tool: SOLE_TOOL_STORYBOOK, word: 'Storybook' },
    { id: 'demo/REQ-1.9', tool: SOLE_TOOL_JEST, word: 'Jest' },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (soleWordSamples.length === 0) {
    failures.push('合成素材 soleWordSamples が空です（この確認が空振りしています）');
  }
  for (const sample of soleWordSamples) {
    if (!sample.tool.includes(sample.word)) {
      failures.push(`見本 ${sample.id} の代替検証に語 ${sample.word} が含まれていない`);
      continue;
    }
    const withoutWord = sample.tool.split(sample.word).join('—');
    const stripped = auditExclusions(
      [exclusionOf(sample.id, 'unit-test', withoutWord)],
      known,
      reachability
    );
    if (stripped.entries[0]?.verdict !== 'external') {
      failures.push(
        `見本 ${sample.id} から語 ${sample.word} を抜いても external にならない` +
          `（実際: ${stripped.entries[0]?.verdict ?? '無し'}）。` +
          'この見本は他の語にも一致しており、当該の語を落とす変異に対して無言である'
      );
    }
  }

  // 分母から外す ID 集合も、監査と**同じ規則で**機能名付きへ揃わねばならない。
  // 揃わないと旧形式の除外だけが分母へ残り、被覆率が静かに動く
  // （115.197 の実測: 揃えないと適用対象が 2683 → 2708 件、到達被覆率が 98.06% → 97.16%）
  const excludedIds = buildExcludedIdSet({
    exclusions: [
      exclusionOf('REQ-4.1', 'unit-test', 'Vitest'),
      exclusionOf('demo/REQ-1.1', 'unit-test', 'Vitest'),
    ],
    categories: {},
    summary: { totalExclusions: 2, byCategory: {} },
  } as ExclusionsFile);
  if (!excludedIds.has('user-authentication/REQ-4.1')) {
    failures.push(
      '分母から外す ID 集合で旧形式 REQ-4.1 が機能名付きへ揃わなかった（旧形式の除外だけが分母に残る）'
    );
  }
  if (excludedIds.has('REQ-4.1')) {
    failures.push(
      '分母から外す ID 集合に旧形式の生の ID REQ-4.1 が残った（受入基準の ID と噛み合わない）'
    );
  }
  if (!excludedIds.has('demo/REQ-1.1')) {
    failures.push('分母から外す ID 集合で機能名付きの ID demo/REQ-1.1 が失われた');
  }
  return failures;
}

/**
 * 型宣言（`.d.ts`）は本番モジュールとして数えない
 *
 * `.d.ts` は実行時の経路を持たない。数えると母数（本番モジュール数）が水増しされ、
 * どこからも取り込まれない型宣言が**死コードとして名指される**。
 * 115.197 の実測では、除外を落とすと本番モジュールが 590 → 593 件、
 * 到達しない本番モジュールが 54 → 57 件へ動いた（自己検査は無言だった）。
 *
 * 母数と死コードの一覧の**両方**を、仮想リポジトリの上で厳密な値として固定する。
 */
function checkTypeDeclarationsAreNotProductionModules(): string[] {
  const failures: string[] = [];
  const fixture: Fixture = {
    'frontend/src/main.tsx': "import App from './App';\nexport default App;\n",
    'frontend/src/App.tsx': 'export default function App() {\n  return 1;\n}\n',
    // どこからも取り込まれない型宣言。実行時の経路を持たないので死コードではない
    'frontend/src/types/orphan.d.ts': 'export type Orphan = { value: string };\n',
    // どこからも取り込まれない本番の部品。こちらは死コードである
    'frontend/src/components/DeadWidget.tsx':
      'export default function DeadWidget() {\n  return 1;\n}\n',
    // 検証ファイルも本番モジュールではない（既存の規則。ここでも数に入らないことを見る）
    'frontend/src/__tests__/components/DeadWidget.test.tsx':
      "import DeadWidget from '../../components/DeadWidget';\nexport default DeadWidget;\n",
  };

  withFixture(fixture, (baseDir) => {
    const graph = buildModuleGraph({
      baseDir,
      roots: ['frontend/src'],
      entryPoints: ['frontend/src/main.tsx'],
    });
    if (!graph.modules.has('frontend/src/types/orphan.d.ts')) {
      failures.push('型宣言が走査対象に含まれない（この対照が空振りしている）');
      return;
    }
    const reachable = computeReachableModules(graph);
    const report = buildReachabilityReport(
      [],
      new Set(),
      graph,
      reachable,
      new Map(),
      auditExclusions([], new Set(), new Map())
    );
    if (report.productionModuleCount !== 3) {
      failures.push(
        `本番モジュール数が 3（main / App / DeadWidget）ではなく ${report.productionModuleCount} だった。` +
          '型宣言か検証ファイルを本番モジュールとして数えている'
      );
    }
    const unreachable = report.unreachableProductionModules.join(', ');
    if (unreachable !== 'frontend/src/components/DeadWidget.tsx') {
      failures.push(`到達しない本番モジュールが DeadWidget.tsx だけではなかった: ${unreachable}`);
    }
  });
  return failures;
}

// ============================================================================
// 走査対象と前提条件（第3原則：空振りで合格にしない）
// ============================================================================

function checkEmptyGraphIsNotReachable(): string[] {
  const failures: string[] = [];
  withFixture({ 'frontend/src/placeholder.ts': 'export const x = 1;\n' }, (baseDir) => {
    const graph = buildModuleGraph({
      baseDir,
      roots: ['frontend/src'],
      entryPoints: ['frontend/src/main.tsx'],
    });
    if (graph.entryPoints.length !== 0) {
      failures.push('存在しない入口を入口として数えた');
    }
    const reachable = computeReachableModules(graph);
    if (reachable.size !== 0) {
      failures.push(`入口が無いのに ${reachable.size} 件を到達と数えた`);
    }
    if (classifyCoverageSource('frontend/src/placeholder.ts', graph, reachable).reachable) {
      failures.push('入口が無いのに本番ファイルを到達扱いにした');
    }
  });
  return failures;
}

function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const graph = buildModuleGraph();
  if (graph.modules.size === 0) {
    failures.push('リポジトリ本体のモジュールを 1 件も列挙できなかった');
    return failures;
  }
  if (graph.entryPoints.length !== PRODUCTION_ENTRY_POINTS.length) {
    failures.push(
      `入口 ${PRODUCTION_ENTRY_POINTS.length} 件のうち ${graph.entryPoints.length} 件しか実在しなかった: ` +
        PRODUCTION_ENTRY_POINTS.filter(
          (entry) => !graph.entryPoints.includes(toPosixPath(entry))
        ).join(', ')
    );
  }
  for (const root of PRODUCTION_ROOTS) {
    if (!Array.from(graph.modules).some((module) => module.startsWith(`${root}/`))) {
      failures.push(`${root} 配下を 1 件も走査できなかった`);
    }
  }
  const reachable = computeReachableModules(graph);
  if (reachable.size < 100) {
    failures.push(
      `リポジトリ本体の到達モジュールが ${reachable.size} 件しかない（走査が壊れている）`
    );
  }
  const unreachable = Array.from(graph.modules).filter(
    (module) => !isVerificationFile(module) && !module.endsWith('.d.ts') && !reachable.has(module)
  );
  if (unreachable.length === 0) {
    failures.push(
      'リポジトリ本体で到達しない本番ファイルが 1 件も無い（判定が常に到達へ倒れている）'
    );
  }
  return failures;
}

/**
 * 実在する死コードと生存コードで、両側を実データに対して固定する
 *
 * 仮想リポジトリだけでは、実際の取り込みの書き方（別名・遅延読み込み・再輸出）に
 * 追随できていない劣化を検出できない。ここでは本スペックが実際に踏んだ二例
 * （115.130 の欄検証つき行、フックを一段挟んで死んでいるキーボード操作の補助）を死側に、
 * 実際に描画される注釈編集画面を生側に置く。
 *
 * 当初の死側の一例は 115.146 の画像ビューア（`frontend/src/components/site-surveys/ImageViewer.tsx`）
 * だったが、**当該タスクがその死コード自体を撤去したため固定点として使えなくなった**。
 * 代わりに `frontend/src/utils/keyboard-navigation.ts` を置く。こちらは
 * `frontend/src/hooks/useKeyboardNavigation.ts` からのみ取り込まれ、そのフックがどこからも
 * 使われていない**二段の死**であり、直接の取り込み元の有無だけを見る実装では死と判定できない。
 */
function checkKnownDeadAndLiveModules(): string[] {
  const failures: string[] = [];
  const graph = buildModuleGraph();
  const reachable = computeReachableModules(graph);

  const mustBeDead = [
    'frontend/src/utils/keyboard-navigation.ts',
    'frontend/src/components/quantity-table/FieldValidatedItemRow.tsx',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustBeDead.length === 0) {
    failures.push('合成素材 mustBeDead が空です（この確認が空振りしています）');
  }
  const mustBeLive = [
    'frontend/src/components/site-surveys/AnnotationEditor.tsx',
    'frontend/src/pages/SiteSurveyImageViewerPage.tsx',
    'frontend/src/routes.tsx',
    'backend/src/app.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (mustBeLive.length === 0) {
    failures.push('合成素材 mustBeLive が空です（この確認が空振りしています）');
  }

  for (const module of mustBeDead) {
    if (!graph.modules.has(module)) {
      failures.push(`${module} が走査対象に含まれない（自己検査の前提が失われた）`);
      continue;
    }
    if (reachable.has(module)) failures.push(`${module} は本番未参照のはずが到達と判定された`);
  }
  for (const module of mustBeLive) {
    if (!graph.modules.has(module)) {
      failures.push(`${module} が走査対象に含まれない（自己検査の前提が失われた）`);
      continue;
    }
    if (!reachable.has(module)) failures.push(`${module} は本番の経路上のはずが不到達と判定された`);
  }
  return failures;
}

/**
 * 入口の一つを外した到達集合を求める（実物の入口一覧は書き換えない）
 *
 * `buildModuleGraph` はモジュールと取り込み関係の写像を持つだけで、
 * どこから辿り始めるかは `entryPoints` にしか現れない。写しの `entryPoints` を差し替えて
 * `computeReachableModules` を呼べば、**実物を一切壊さずに**入口の寄与を測れる。
 * 走査を繰り返さないため、実データに対しても十分に速い。
 */
function reachableWithoutEntryPoint(graph: ModuleGraph, dropped: string): Set<string> {
  return computeReachableModules({
    ...graph,
    entryPoints: graph.entryPoints.filter((entry) => entry !== toPosixPath(dropped)),
  });
}

/**
 * 本番の経路の起点が固定されている（どの入口も遊んでいない）
 *
 * 到達性の判定は `PRODUCTION_ENTRY_POINTS` から辿ることで成り立っている。入口が一つ落ちると
 * その先だけから使われるモジュールが**丸ごと死コード扱いへ転落し**、被覆が静かに縮む。
 * 115.197 のレビューが実測した: `backend/prisma/seed.ts` を入口から落とすと自己検査は
 * 52/52 緑のまま、本番ゲートは「本番モジュール 590（到達 536 / 未到達 54）」が
 * 「589（到達 534 / 未到達 55）」へ、到達被覆が 98.1% から 97.8% へ、
 * 「到達しない被覆源のみの受入基準」が 18件 から 26件 へ動いた。
 *
 * 二つの向きから挟む。
 *
 *   1. **その入口からしか到達しないモジュールを名指しで固定する。**
 *      `backend/src/utils/seed-helpers.ts` は投入処理の入口からのみ辿れる（実測）。
 *      入口が落ちればこの主張が赤くなる。
 *   2. **どの入口も遊んでいない。** 三つの入口それぞれについて、外すと到達集合が真に縮むこと。
 *      到達集合が縮まない入口は、他の入口から完全に辿れる冗長な起点であり、
 *      「外しても何も起きない＝外されても誰も気づかない」状態そのものである。
 *      名指しの固定点を持たない入口（将来増える入口も含む）を、機構の側で拾う。
 *
 * 三つの入口それぞれについて、**外した状態が現に赤くなる**ことを 115.197 で実測した。
 * `backend/prisma/seed.ts` は上の 1 が、`frontend/src/main.tsx` と `backend/src/index.ts` は
 * checkKnownDeadAndLiveModules の生側の固定点（`frontend/src/routes.tsx` /
 * `backend/src/app.ts`）が捕まえる。本検査 1 件で全部を担うのではなく、
 * **どの入口にも担い手が居る**ことが要件である。
 */
function checkEveryProductionEntryPointContributes(): string[] {
  const failures: string[] = [];
  const graph = buildModuleGraph();
  const reachable = computeReachableModules(graph);

  if (graph.entryPoints.length !== PRODUCTION_ENTRY_POINTS.length) {
    // 実在しない入口が混ざっていると、以下の「外すと縮む」は測る対象を失う
    return [
      `入口 ${PRODUCTION_ENTRY_POINTS.length} 件のうち ${graph.entryPoints.length} 件しか実在しない` +
        '（この対照が空振りしている。checkRealRepositoryIsScanned も参照）',
    ];
  }

  // 1. 投入処理の入口からしか到達しないモジュール
  const SEED_ENTRY_POINT = 'backend/prisma/seed.ts';
  const SEED_ONLY_MODULE = 'backend/src/utils/seed-helpers.ts';
  if (!graph.modules.has(SEED_ONLY_MODULE)) {
    failures.push(`${SEED_ONLY_MODULE} が走査対象に含まれない（自己検査の前提が失われた）`);
  } else if (!reachable.has(SEED_ONLY_MODULE)) {
    failures.push(
      `${SEED_ONLY_MODULE} が不到達と判定された。` +
        `本番の経路の起点から ${SEED_ENTRY_POINT} が落ちていないか確かめること`
    );
  } else if (reachableWithoutEntryPoint(graph, SEED_ENTRY_POINT).has(SEED_ONLY_MODULE)) {
    // 他の入口からも辿れるようになったなら、この固定点はもう入口の寄与を測っていない
    failures.push(
      `${SEED_ONLY_MODULE} が ${SEED_ENTRY_POINT} 以外からも到達するようになった。` +
        'この入口の寄与を測る固定点として使えないため、別の固定点へ差し替えること'
    );
  }

  // 2. どの入口も遊んでいない（外すと到達集合が真に縮む）
  for (const entry of PRODUCTION_ENTRY_POINTS) {
    const without = reachableWithoutEntryPoint(graph, entry);
    if (without.size >= reachable.size) {
      failures.push(
        `本番の経路の起点 ${entry} を外しても到達モジュールが減らない（${reachable.size} → ${without.size}）。` +
          '他の入口から完全に辿れる起点であり、入口一覧に置く意味が失われている'
      );
    }
  }
  return failures;
}

/**
 * 与えた走査根だけで被覆される受入基準の集合を求める（実物の走査根一覧は書き換えない）
 *
 * `extractTestCoverage` はファイル単位の被覆印を返すだけなので、根の寄与を測るには
 * 全ファイル分を畳んで集合にする必要がある。既定引数を明示的に上書きして呼ぶことで、
 * **実物の `CODE_DIRS` を一切壊さずに**「その根を外した世界」を測れる。
 */
function collectCriteriaForRoots(featureNames: string[], dirs: readonly string[]): Set<string> {
  const criteria = new Set<string>();
  for (const entry of extractTestCoverage(featureNames, dirs)) {
    for (const id of entry.acceptanceCriteria) criteria.add(id);
  }
  return criteria;
}

interface CodeScanRootWitness {
  /** `CODE_DIRS` に現れる走査根 */
  root: string;
  /** その根の下からしか被覆されない受入基準の番号（この根の寄与を名指しで固定する） */
  witness: string;
}

/**
 * 走査根ごとの固定点
 *
 * `CODE_DIRS` から根を落とす変異は、`CODE_DIRS` だけを見る検査では捕まらない
 * （残った根について「外すと縮む」を測り直すだけで緑になる）。本一覧は
 * **`CODE_DIRS` の外に置いた第二の宣言**であり、両者の一致を課すことで
 * 根の増減そのものを赤くする。
 *
 * `witness` は 2026-09-03 に実測して選び直した。いずれも当該の根の下の複数のファイルが
 * 名乗っており（backend/src 5 件・frontend/src 21 件・e2e 5 件）、一枚のファイルの
 * 移動では消えない。消えた場合は本検査が名指しで赤くなるため、別の固定点へ差し替えること。
 *
 * backend/src の固定点は従前 `estimate-creation/REQ-11.6` だった。タスク 115.256 で
 * `frontend/src/pages/EstimateDetailPage.tsx` の被覆印が（原文の逐語複製と食い違っていた
 * `REQ-11.7` から）`REQ-11.6` へ是正された結果、この番号は frontend/src からも被覆される
 * ようになり専属でなくなった。本検査がその場で名指しで赤くなったため差し替えた。
 */
const CODE_SCAN_ROOT_WITNESSES: readonly CodeScanRootWitness[] = [
  { root: 'backend/src', witness: 'estimate-creation/REQ-11.5' },
  { root: 'frontend/src', witness: 'site-survey/REQ-26.5' },
  { root: 'e2e', witness: 'user-authentication/REQ-28.37' },
];

/**
 * 被覆印の走査根がどれも遊んでいない（外すと被覆集合が真に縮む）
 *
 * 被覆率は `CODE_DIRS` の下だけを読む。根が一つ落ちると、その下の被覆印が丸ごと数えられ
 * なくなり、被覆が静かに縮む。`findFiles` は存在しない根に対して黙って空を返すため、
 * 綴りを誤った根・撤去されたディレクトリを指す根もまた無言である。
 *
 * `checkEveryProductionEntryPointContributes`（本番の経路の起点に対する同型の主張）と
 * 同じ作法で、二つの向きから挟む。
 *
 *   1. **根ごとの固定点を名指しで置く。** `CODE_SCAN_ROOT_WITNESSES` は `CODE_DIRS` の
 *      外に置いた第二の宣言であり、両者の一致を課す。これにより
 *      **根を落とす変異そのもの**が赤くなる（`CODE_DIRS` だけを見る主張では捕まらない）。
 *      各固定点は当該の根からしか被覆されないことを毎回測り直す。
 *   2. **どの根も外すと被覆集合が真に縮む。** 縮まない根は、他の根から完全に覆われる
 *      冗長な根であり、「外しても何も起きない＝外されても誰も気づかない」状態である。
 *      固定点を持たない根（将来増える根も含む）を、機構の側で拾う。
 *
 * 母集団が空の場合（固定点が零件・走査根が零件・機能が零件・被覆印が零件）は失格にする。
 * 空の繰り返しは「どの根も縮む」を恒真にするため、緑で通す抜け道になる（第3原則）。
 *
 * 2026-09-01 に実測した。`CODE_DIRS` から `backend/src` を落とすと自己検査 65 件のうち
 * 1 件（本検査）が「固定点が登録されている backend/src が走査根の一覧に無い」で落ちる。
 * `frontend/src` を落とす変異・`e2e` を落とす変異でも同じ 1 件が落ちる。
 * 是正前（65 件のうち本検査と次の検査を欠く 63 件）は同じ三つの変異のいずれでも
 * 自己検査は 63/63 緑のままで、本ゲートの出力だけが 38082 バイトから
 * それぞれ 52030 / 99947 / 316123 バイトへ動いた（construction-photo の受入基準は
 * 143/145 から 109/145・97/145・93/145 へ）。
 * `CODE_SCAN_ROOT_WITNESSES` を空にすると「対照群が空」で 1 件が、`CODE_DIRS` を空にすると
 * 「母集団が空」で 1 件が落ちる。`backend/src` の固定点を frontend/src 側の番号
 * （`site-survey/REQ-26.5`）へ差し替えると「backend/src 以外の根からも被覆されるように
 * なった」で 1 件が、実在しない番号（`user-authentication/REQ-99.99`）へ差し替えると
 * 「被覆印として一件も拾われない」で 1 件が落ちる。`backend/src` を `backend/srcs` と
 * 綴り誤ると 3 つの失敗（未登録・一覧に無い・実在しない）を挙げて 1 件が落ちる。
 */
function checkEveryCodeScanRootContributes(): string[] {
  const failures: string[] = [];

  // 第3原則: 対照群が空なら、以下の繰り返しは一度も回らずに緑になる
  if (CODE_SCAN_ROOT_WITNESSES.length === 0) {
    return ['走査根の固定点が一件も登録されていない（対照群が空。検査が空振りしている）'];
  }
  if (CODE_DIRS.length === 0) {
    return ['被覆印の走査根が一件も登録されていない（母集団が空。被覆はすべて 0 になる）'];
  }

  // 1a. 固定点の一覧と走査根の一覧が一致する（根の増減を赤くする）
  const registered = CODE_SCAN_ROOT_WITNESSES.map((entry) => entry.root);
  for (const root of CODE_DIRS) {
    if (!registered.includes(root)) {
      failures.push(
        `走査根 ${root} に固定点が登録されていない。` +
          '`CODE_SCAN_ROOT_WITNESSES` へ、その根からしか被覆されない受入基準を登録すること'
      );
    }
  }
  for (const root of registered) {
    if (!CODE_DIRS.includes(root)) {
      failures.push(
        `固定点が登録されている ${root} が走査根の一覧に無い。` +
          '走査根を落としたのなら、その下の被覆印は数えられなくなっている'
      );
    }
  }

  const featureNames = discoverFeatures();
  if (featureNames.length === 0) {
    return ['機能を一件も検出できない（自己検査の前提が失われた）'];
  }

  const full = collectCriteriaForRoots(featureNames, CODE_DIRS);
  if (full.size === 0) {
    return [
      '走査根をすべて与えても被覆印が一件も拾えない（走査が壊れている。以下の「外すと縮む」は' +
        '測る対象を失っている）',
    ];
  }

  const withoutRoot = new Map<string, Set<string>>();
  for (const root of CODE_DIRS) {
    if (!fs.existsSync(path.resolve(root))) {
      failures.push(
        `走査根 ${root} が実在しない（findFiles は黙って空を返すため、この根は何も読んでいない）`
      );
      continue;
    }
    withoutRoot.set(
      root,
      collectCriteriaForRoots(
        featureNames,
        CODE_DIRS.filter((dir) => dir !== root)
      )
    );
  }

  // 1b. 各固定点が、当該の根からしか被覆されていない
  for (const entry of CODE_SCAN_ROOT_WITNESSES) {
    const without = withoutRoot.get(entry.root);
    if (!without) continue; // 実在しない根は上で既に失格にしている
    if (!full.has(entry.witness)) {
      failures.push(
        `${entry.witness} が被覆印として一件も拾われない（${entry.root} の固定点が失効した）。` +
          '別の固定点へ差し替えること'
      );
      continue;
    }
    if (without.has(entry.witness)) {
      failures.push(
        `${entry.witness} が ${entry.root} 以外の根からも被覆されるようになった。` +
          'この根の寄与を測る固定点として使えないため、別の固定点へ差し替えること'
      );
    }
  }

  // 2. どの根も遊んでいない（外すと被覆集合が真に縮む）
  for (const [root, without] of withoutRoot) {
    if (without.size >= full.size) {
      failures.push(
        `走査根 ${root} を外しても被覆する受入基準が減らない` +
          `（${full.size} → ${without.size}）。` +
          '他の根から完全に覆われる根であり、走査根の一覧に置く意味が失われている'
      );
    }
  }
  return failures;
}

/** 逐語複製の検査の名前。原文の照合はこの名前で行う */
const COPY_REPORT_NAME = 'reportCriterionTextCopies';

/** 逐語複製の食い違いだけを取り出す関数の名前。原文の照合はこの名前で行う */
const COPY_MISMATCH_NAME = 'findCriterionTextCopyMismatches';

/**
 * 逐語複製の検査の走査根がどれも遊んでいない（外すと守備範囲が真に縮む）
 *
 * 逐語複製の検査は長らく `E2E_SPECS_ROOT`（`e2e/specs`）だけを読んでいた。そのため
 * **`backend/src` と `frontend/src` の被覆印は、原文を写していてもその写しが一度も
 * 照合されなかった**。「原文を並置すれば条文が繰り上がったときに字面の食い違いとして
 * 現れる」という単体検証の側の散文は、人が読めば真だが機械は確かめていなかった
 * （タスク 115.256）。根を `CODE_DIRS` へ広げた時点の実測では、`backend/src` に 5 件・
 * `frontend/src` に 3 件の食い違いが現れ、いずれも被覆印の番号が条文の繰り上がりに
 * 追随していない形だった（是正済み）。
 *
 * 根を広げただけでは同じ欠陥が場所を変えて残る。**宣言はされたが実際には何も読んでいない
 * 根**は、読まない検査と区別が付かない。`checkEveryCodeScanRootContributes` と同じ作法で
 * 両側から挟む。
 *
 *   1. 根を一つだけ与えたとき、被覆印を持つ区間と原文の写しを持つ区間が現に存在する
 *      （その根が単独で守備範囲を持つ）
 *   2. 根を一つ外すと、全根を与えたときより母集団が真に縮む（他の根に覆われていない）
 *   3. 根が実在する（`findFiles` は存在しない根に黙って空を返す）
 *   4. 本検査（`main()`）が読む根が `CODE_DIRS` である——既定引数を原文から照合し、
 *      呼び出しが根を明示していないことを確かめる。ここを見ないと、定数だけを広げて
 *      呼び出しは `e2e/specs` のままという食い違いが黙って通る
 *
 * 2026-09-03 に実測した。`reportCriterionTextCopies` の既定引数を `[E2E_SPECS_ROOT]` へ
 * 戻す変異では、`checkEveryCodeScanRootContributes` は緑のままで本検査だけが
 * 「backend/src を外しても母集団が縮まない」「frontend/src を外しても母集団が縮まない」
 * 「既定の走査根が CODE_DIRS でない」を挙げて落ちる。`main()` の呼び出しを
 * `reportCriterionTextCopies(features, ['e2e/specs'])` へ変える変異（既定引数は
 * `CODE_DIRS` のまま）でも、本検査だけが「走査根を明示している」を挙げて落ちる。
 */
function checkCriterionTextCopyRootsAreNotIdle(): string[] {
  const failures: string[] = [];

  // 第3原則: 根が空なら以下の繰り返しは一度も回らずに緑になる
  if (CODE_DIRS.length === 0) {
    return ['逐語複製の検査の走査根が一件も無い（母集団が空。検査は何も読んでいない）'];
  }
  const featureNames = discoverFeatures();
  if (featureNames.length === 0) {
    return ['機能を一件も検出できない（自己検査の前提が失われた）'];
  }
  const features = extractAllFeatures(featureNames);
  const full = reportCriterionTextCopies(features);
  if (full.blocks === 0) {
    return [
      '走査根をすべて与えても被覆印を持つ区間が一件も無い（走査が壊れている。' +
        '以下の「外すと縮む」は測る対象を失っている）',
    ];
  }

  for (const root of CODE_DIRS) {
    if (!fs.existsSync(path.resolve(root))) {
      failures.push(
        `逐語複製の走査根 ${root} が実在しない（findFiles は黙って空を返すため、この根は何も読んでいない）`
      );
      continue;
    }
    const only = reportCriterionTextCopies(features, [root]);
    if (only.blocks === 0) {
      failures.push(
        `逐語複製の走査根 ${root} からは被覆印を持つ区間が一件も拾えない` +
          '（宣言されているだけで、この根は検査に何も寄与していない）'
      );
    }
    if (only.blocksWithCopy === 0) {
      failures.push(
        `逐語複製の走査根 ${root} には受入基準の原文を写した区間が一件も無い` +
          '（この根では検査が何も守っていない）'
      );
    }
    const without = reportCriterionTextCopies(
      features,
      CODE_DIRS.filter((dir) => dir !== root)
    );
    if (without.blocks >= full.blocks) {
      failures.push(
        `逐語複製の走査根 ${root} を外しても母集団が縮まない（${full.blocks} → ${without.blocks}）。` +
          '他の根から完全に覆われる根であり、走査根の一覧に置く意味が失われている'
      );
    }
  }

  // 4. 本検査が読む根が CODE_DIRS であることを原文から照合する
  const absolute = path.resolve(EXTRACTOR_SOURCE_PATH);
  if (!fs.existsSync(absolute)) {
    return [`${EXTRACTOR_SOURCE_PATH} が存在しない（自己検査の前提が失われた）`];
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const name of [COPY_REPORT_NAME, COPY_MISMATCH_NAME]) {
    const signature = new RegExp(String.raw`export function ${name}\(([^)]*)\)`).exec(source);
    if (!signature) {
      failures.push(`${EXTRACTOR_SOURCE_PATH}: export された ${name} が無い`);
      continue;
    }
    const parameters = (signature[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!new RegExp(String.raw`=\s*${SCAN_ROOTS_NAME}\s*$`).test(parameters)) {
      failures.push(
        `${EXTRACTOR_SOURCE_PATH}: ${name} の既定の走査根が ${SCAN_ROOTS_NAME} でない（署名: ${parameters}）`
      );
    }
  }
  // 呼び出しは根を渡さないか、素通しの引数だけを渡す（別の根を通す経路を残さない）
  const calls = Array.from(
    source.matchAll(new RegExp(String.raw`(?<!function )${COPY_REPORT_NAME}\(([^)]*)\)`, 'g'))
  );
  if (calls.length === 0) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: ${COPY_REPORT_NAME} の呼び出しが一つも無い` +
        '（逐語複製の検査が本検査から切り離されている）'
    );
  }
  for (const call of calls) {
    const args = (call[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!args.includes(',')) continue;
    const second = args.slice(args.indexOf(',') + 1).trim();
    if (second !== 'scanRoots') {
      failures.push(
        `${EXTRACTOR_SOURCE_PATH}: ${COPY_REPORT_NAME}(${args}) が走査根を明示している。` +
          `既定引数（${SCAN_ROOTS_NAME}）以外の根を通す経路を残さないこと`
      );
    }
  }

  return failures;
}

/** 走査根の一覧を持つ定数の名前。原文の照合はこの名前で行う */
const SCAN_ROOTS_NAME = 'CODE_DIRS';

/** 走査根を受け取る抽出器の名前。原文の照合はこの名前で行う */
const COVERAGE_EXTRACTOR_NAME = 'extractTestCoverage';

/**
 * 自己検査が測っている走査根が、本検査が実際に読む走査根と同一である
 *
 * `checkEveryCodeScanRootContributes` は `CODE_DIRS` を測る。しかし本検査（`main()`）が
 * 別の一覧を使うようになれば、**測っている対象と読まれている対象が食い違ったまま**
 * 自己検査だけが緑になる。対照そのものの主題が失われる形であり、対照の登録が誤っている
 * のと同じ病である。
 *
 * 構造の側で塞ぐ: 走査根は `extractTestCoverage` の既定引数としてのみ与えられ、
 * 呼び出し側は根を渡さない。ここではその構造を原文から照合する。
 *
 *   1. 宣言が export された `CODE_DIRS` であり、字面の並びが読み込んだ値と一致する
 *   2. 抽出器の既定引数が `CODE_DIRS` である
 *   3. 抽出器の呼び出しが一つ以上あり、そのいずれも根の一覧を渡していない
 *
 * 2026-09-01 に実測した。`main()` の呼び出しを `extractTestCoverage(featureNames,
 * ['frontend/src', 'e2e'])` へ変える変異（`CODE_DIRS` は三件のまま）では、
 * `checkEveryCodeScanRootContributes` は**緑のまま**で、自己検査 65 件のうち本検査 1 件
 * だけが落ちる。既定引数を `CODE_DIRS` から字面のリテラルへ変える変異でも同じ 1 件が
 * 落ちる。`CODE_DIRS` の `export` を外すと、自己検査は取り込みに失敗して
 * 「does not provide an export named 'CODE_DIRS'」で終了する（終了コード 1・件数は出ない）。
 */
function checkScanRootsAreTheOnesMainUses(): string[] {
  const failures: string[] = [];

  const absolute = path.resolve(EXTRACTOR_SOURCE_PATH);
  if (!fs.existsSync(absolute)) {
    return [`${EXTRACTOR_SOURCE_PATH} が存在しない（自己検査の前提が失われた）`];
  }
  const source = fs.readFileSync(absolute, 'utf8');

  // 1. 宣言そのものを原文から読み、読み込んだ値と字面を突き合わせる
  const declaration = new RegExp(
    String.raw`export const ${SCAN_ROOTS_NAME}: readonly string\[\] = \[([^\]]*)\];`
  ).exec(source);
  if (!declaration) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: export された ${SCAN_ROOTS_NAME} の宣言が見つからない` +
        '（改名か非公開化により、自己検査が測る対象が失われている）'
    );
  } else {
    const declared = Array.from((declaration[1] ?? '').matchAll(/'([^']*)'/g), (m) => m[1] ?? '');
    if (declared.join('|') !== CODE_DIRS.join('|')) {
      failures.push(
        `${EXTRACTOR_SOURCE_PATH}: 宣言の字面 [${declared.join(', ')}] と読み込んだ値 ` +
          `[${CODE_DIRS.join(', ')}] が食い違う（別の値へ差し替えられている）`
      );
    }
  }

  // 2. 抽出器の既定引数が走査根の定数である
  const signature = new RegExp(
    String.raw`export function ${COVERAGE_EXTRACTOR_NAME}\(([^)]*)\)`
  ).exec(source);
  if (!signature) {
    failures.push(`${EXTRACTOR_SOURCE_PATH}: export された ${COVERAGE_EXTRACTOR_NAME} が無い`);
  } else if (
    !new RegExp(String.raw`=\s*${SCAN_ROOTS_NAME}\s*$`).test((signature[1] ?? '').trim())
  ) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: ${COVERAGE_EXTRACTOR_NAME} の既定の走査根が ` +
        `${SCAN_ROOTS_NAME} でない（署名: ${(signature[1] ?? '').replace(/\s+/g, ' ').trim()}）`
    );
  }

  // 3. 呼び出し側は根を渡さない（渡せる形が残ると、本番の根が定数と食い違いうる）
  const calls = Array.from(
    source.matchAll(
      new RegExp(String.raw`(?<!function )${COVERAGE_EXTRACTOR_NAME}\(([^)]*)\)`, 'g')
    )
  );
  if (calls.length === 0) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: ${COVERAGE_EXTRACTOR_NAME} の呼び出しが一つも無い` +
        '（被覆の走査が本検査から切り離されている）'
    );
  }
  for (const call of calls) {
    const args = (call[1] ?? '').replace(/\s+/g, ' ').trim();
    if (args.includes(',')) {
      failures.push(
        `${EXTRACTOR_SOURCE_PATH}: ${COVERAGE_EXTRACTOR_NAME}(${args}) が走査根を明示している。` +
          `既定引数（${SCAN_ROOTS_NAME}）以外の根を通す経路を残さないこと`
      );
    }
  }

  return failures;
}

/** 走査対象のファイル名の型を持つ定数の名前。原文の照合はこの名前で行う */
const COVERAGE_PATTERN_NAME = 'COVERAGE_FILE_PATTERN';

/** 除外するディレクトリ名の一覧を持つ定数の名前。原文の照合はこの名前で行う */
const SCAN_EXCLUSIONS_NAME = 'SCAN_EXCLUDED_DIRECTORIES';

/**
 * `COVERAGE_FILE_PATTERN` の選択肢を宣言そのものから取り出す
 *
 * 選択肢の一覧を自己検査の側へ書き写すと、本体の型を書き換えた日に**写しだけが古いまま**
 * 緑になる。宣言の原文（`\.(a|b)$` の形）から割って取る。**この形でなくなったら
 * 割れないことを失格として返す**——黙って「選択肢ゼロ件」にすると、以下の繰り返しが
 * 一度も回らずに緑になる（第3原則）。
 */
function parseCoverageExtensionAlternatives(): { alternatives: string[]; failure: string | null } {
  const source = COVERAGE_FILE_PATTERN.source;
  const matched = /^\\\.\(([^)]*)\)\$$/.exec(source);
  if (!matched || !matched[1]) {
    return {
      alternatives: [],
      failure:
        `${COVERAGE_PATTERN_NAME} の宣言が \`\\.(選択肢|…)$\` の形でない（原文: ${source}）。` +
        '選択肢へ割れないため、拡張子ごとの寄与を測れない。形を戻すか、本検査の割り方を改めること',
    };
  }
  const alternatives = matched[1].split('|').filter((piece) => piece.length > 0);
  if (alternatives.length === 0) {
    return {
      alternatives: [],
      failure: `${COVERAGE_PATTERN_NAME} に選択肢が一件も無い（母集団が空。走査対象は 0 件になる）`,
    };
  }
  return { alternatives, failure: null };
}

interface CoverageExtensionWitness {
  /** `COVERAGE_FILE_PATTERN` に現れる選択肢（正規表現の断片。原文のまま写す） */
  extension: string;
  /** その選択肢が拾うファイルからしか被覆されない受入基準の番号 */
  witness: string;
}

/**
 * 走査する拡張子ごとの固定点
 *
 * `COVERAGE_FILE_PATTERN` から選択肢を落とす変異は、同定数だけを見る主張では捕まらない
 * （残った選択肢について「落とすと縮む」を測り直すだけで緑になる）。本一覧は
 * **同定数の外に置いた第二の宣言**であり、両者の一致を課すことで選択肢の増減そのものを
 * 赤くする（`CODE_SCAN_ROOT_WITNESSES` と同じ作法）。
 *
 * `witness` は 2026-09-04 にコミット `d1bb8464` の作業ツリーで実測して選んだ。当該の拡張子の
 * 複数のファイルが名乗っており（`ts` 側の `site-survey/REQ-32.3` は 12 ファイル、`tsx` 側の
 * `estimate-creation/REQ-47.3` は 5 ファイル）、一枚の移動や改名では消えない。消えた場合は
 * 本検査が名指しで赤くなるため、別の固定点へ差し替えること。
 */
const COVERAGE_EXTENSION_WITNESSES: readonly CoverageExtensionWitness[] = [
  { extension: 'ts', witness: 'site-survey/REQ-32.3' },
  { extension: 'tsx', witness: 'estimate-creation/REQ-47.3' },
];

/**
 * 拡張子ごとに、その選択肢だけが拾うファイルを振り分ける
 *
 * 母集団は `listCoverageScanFiles`（抽出器と同一の出所）から受け取り、**走査規則を
 * 自己検査の側へ複製しない**。ここで行うのは、既に集まった一覧を「どの選択肢が拾ったか」で
 * 割ることだけである。ある選択肢を落とす変異は、その選択肢**だけ**が拾うファイルが
 * 母集団から消えることと同値であり、他の選択肢に包含される選言はここで空になる。
 */
function partitionScanFilesByExclusiveExtension(
  alternatives: readonly string[]
): Map<string, string[]> {
  const exclusive = new Map<string, string[]>();
  for (const alternative of alternatives) exclusive.set(alternative, []);

  for (const file of listCoverageScanFiles()) {
    const name = path.basename(file);
    const matching = alternatives.filter((alternative) =>
      new RegExp(String.raw`\.(${alternative})$`).test(name)
    );
    if (matching.length === 1 && matching[0]) {
      exclusive.get(matching[0])?.push(file);
    }
  }
  return exclusive;
}

/**
 * 走査する拡張子がどれも遊んでいない（落とすと被覆が真に縮む）
 *
 * 被覆率が読むのは `CODE_DIRS` の下の、`COVERAGE_FILE_PATTERN` に掛かる名前だけである。
 * 走査根と同じく、選択肢が一つ落ちるとその拡張子のファイルが丸ごと数えられなくなり、
 * 被覆が静かに縮む。**根の側（`checkEveryCodeScanRootContributes`）は固めたが、根の下の
 * どのファイルを読むかを決める選別は無言のままだった**（タスク 115.260）。
 *
 * 三つの向きから挟む。
 *
 *   1. **選択肢ごとの固定点を名指しで置く。** `COVERAGE_EXTENSION_WITNESSES` を宣言の外に
 *      置き、両者の一致を課す。選択肢を落とす変異・足す変異そのものが赤くなる。
 *   2. **どの選択肢も単独で拾うファイルを持つ。** 他の選択肢に包含される選言は
 *      「落としても何も起きない＝落とされても誰も気づかない」死んだ選言であり、
 *      固定できるふりだけの検査を生む。是正前の `spec\.ts` がこれであった
 *      （`ts` に包含され、落としても走査対象は 1729 件のまま動かなかった。2026-09-04 実測）。
 *   3. **どの選択肢も落とすと被覆集合が真に縮む。** 固定点を持たない選択肢（将来増える
 *      選択肢も含む）を、機構の側で拾う。
 *
 * 併せて、本番の走査が同定数を通っていることを原文から照合する。定数だけを直して
 * `listCoverageScanFiles` の中の型は元のまま、という食い違いは実データでは現れない。
 *
 * 母集団が空の場合（固定点が零件・選択肢が零件・機能が零件・被覆印が零件）は失格にする。
 * 空の繰り返しは「どの選択肢も縮む」を恒真にするため、緑で通す抜け道になる（第3原則）。
 *
 * 2026-09-04 にコミット `d1bb8464` の作業ツリーで実測した。`COVERAGE_FILE_PATTERN` から
 * `tsx` を落とすと本検査が「固定点が登録されている拡張子 tsx が COVERAGE_FILE_PATTERN に
 * 無い」を挙げて落ちる。`ts` を落とす変異でも同じ形で落ちる。`spec\.ts` を選言へ戻すと
 * 「選択肢 spec\.ts が単独で拾うファイルが一件も無い」で落ちる。`listCoverageScanFiles` の
 * `findFiles(dir, COVERAGE_FILE_PATTERN)` を型の直書き（`/\.(ts|tsx)$/`）へ戻すと
 * 「COVERAGE_FILE_PATTERN で走査していない」で落ちる。
 *
 * **対照自身が空振りしていないことも測った。** `ts` の固定点を tsx 側の番号
 * （`estimate-creation/REQ-47.3`）へ差し替えると「ts 以外のファイルからも被覆されるように
 * なった」で落ち、`COVERAGE_EXTENSION_WITNESSES` を空にすると「対照群が空」で落ちる。
 *
 * **是正前（本検査を欠く状態）は無言であった。** `tsx` を落としてもゲートの出力だけが
 * 38167 バイトから 70418 バイトへ動き（construction-photo の受入基準は 143/145 から
 * 113/145 へ）、自己検査の側で落ちたのは本欄の主題と無関係な「規則4が落とす被覆印の母集団が
 * 実測と過不足なく一致する」1 件だけであった——同検査の台帳がたまたま `.tsx` のファイルを
 * 1 件名指ししていた巻き添えであり、拡張子の選別を主題にした検査は一つも無かった。
 */
function checkEveryScannedExtensionContributes(): string[] {
  const failures: string[] = [];

  // 第3原則: 対照群・母集団が空なら、以下の繰り返しは一度も回らずに緑になる
  if (COVERAGE_EXTENSION_WITNESSES.length === 0) {
    return ['走査する拡張子の固定点が一件も登録されていない（対照群が空。検査が空振りしている）'];
  }
  const { alternatives, failure } = parseCoverageExtensionAlternatives();
  if (failure) return [failure];

  // 1. 固定点の一覧と選択肢の一覧が一致する（選択肢の増減を赤くする）
  const registered = COVERAGE_EXTENSION_WITNESSES.map((entry) => entry.extension);
  for (const alternative of alternatives) {
    if (!registered.includes(alternative)) {
      failures.push(
        `走査する拡張子 ${alternative} に固定点が登録されていない。` +
          `\`COVERAGE_EXTENSION_WITNESSES\` へ、その拡張子からしか被覆されない受入基準を登録すること`
      );
    }
  }
  for (const alternative of registered) {
    if (!alternatives.includes(alternative)) {
      failures.push(
        `固定点が登録されている拡張子 ${alternative} が ${COVERAGE_PATTERN_NAME} に無い。` +
          '選択肢を落としたのなら、その拡張子のファイルはもう読まれていない'
      );
    }
  }

  const scanned = listCoverageScanFiles();
  if (scanned.length === 0) {
    return [
      '走査対象のファイルが一件も無い（母集団が空。以下の「落とすと縮む」は測る対象を失っている）',
    ];
  }
  const exclusive = partitionScanFilesByExclusiveExtension(alternatives);

  // 割り方が宣言と一致していること（どの選択肢にも掛からない走査対象は在りえない）
  const unmatched = scanned.filter(
    (file) =>
      !alternatives.some((alternative) =>
        new RegExp(String.raw`\.(${alternative})$`).test(path.basename(file))
      )
  );
  if (unmatched.length > 0) {
    failures.push(
      `走査対象 ${unmatched.length} 件がどの選択肢にも掛からない（例: ${unmatched[0]}）。` +
        `${COVERAGE_PATTERN_NAME} の割り方と実際の照合が食い違っている`
    );
  }

  // 2. どの選択肢も単独で拾うファイルを持つ（死んだ選言を赤くする）
  for (const alternative of alternatives) {
    if ((exclusive.get(alternative) ?? []).length === 0) {
      failures.push(
        `選択肢 ${alternative} が単独で拾うファイルが一件も無い（他の選択肢に包含される死んだ選言）。` +
          '落としても母集団は動かないため、固定できるふりだけの選択肢になっている。撤去すること'
      );
    }
  }

  const featureNames = discoverFeatures();
  if (featureNames.length === 0) {
    return ['機能を一件も検出できない（自己検査の前提が失われた）'];
  }
  const criteriaOf = (files: readonly string[]): Set<string> => {
    const criteria = new Set<string>();
    for (const file of files) {
      const extracted = extractFileCoverage(fs.readFileSync(file, 'utf-8'), featureNames);
      for (const id of extracted.acceptanceCriteria) criteria.add(id);
    }
    return criteria;
  };
  const full = criteriaOf(scanned);
  if (full.size === 0) {
    return [
      '走査対象をすべて与えても被覆印が一件も拾えない（走査が壊れている。以下の「落とすと縮む」は' +
        '測る対象を失っている）',
    ];
  }

  for (const alternative of alternatives) {
    const dropped = new Set(exclusive.get(alternative) ?? []);
    const without = criteriaOf(scanned.filter((file) => !dropped.has(file)));

    // 3. 落とすと被覆集合が真に縮む
    if (without.size >= full.size) {
      failures.push(
        `走査する拡張子 ${alternative} を落としても被覆する受入基準が減らない` +
          `（${full.size} → ${without.size}）。` +
          `${COVERAGE_PATTERN_NAME} に置く意味が失われている`
      );
    }

    // 1b. 固定点が、当該の拡張子からしか被覆されていない
    const entry = COVERAGE_EXTENSION_WITNESSES.find((item) => item.extension === alternative);
    if (!entry) continue; // 未登録は上で既に失格にしている
    if (!full.has(entry.witness)) {
      failures.push(
        `${entry.witness} が被覆印として一件も拾われない（拡張子 ${alternative} の固定点が失効した）。` +
          '別の固定点へ差し替えること'
      );
      continue;
    }
    if (without.has(entry.witness)) {
      failures.push(
        `${entry.witness} が拡張子 ${alternative} 以外のファイルからも被覆されるようになった。` +
          'この拡張子の寄与を測る固定点として使えないため、別の固定点へ差し替えること'
      );
    }
  }

  // 本番の走査が同定数を通っていることを原文から照合する
  const absolute = path.resolve(EXTRACTOR_SOURCE_PATH);
  if (!fs.existsSync(absolute)) {
    return [`${EXTRACTOR_SOURCE_PATH} が存在しない（自己検査の前提が失われた）`];
  }
  const source = fs.readFileSync(absolute, 'utf8');
  if (!new RegExp(String.raw`findFiles\(dir, ${COVERAGE_PATTERN_NAME}\)`).test(source)) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: listCoverageScanFiles が ${COVERAGE_PATTERN_NAME} で走査していない。` +
        '型を直書きに戻すと、定数だけを直しても本番の母集団は動かない'
    );
  }

  return failures;
}

interface ExcludedDirectoryRecord {
  /** `SCAN_EXCLUDED_DIRECTORIES` に現れる除外名 */
  name: string;
  /**
   * 実データでの現況
   *
   * - `load-bearing`: 外すと走査対象が現に広がる。`witness` にその出所を書く
   * - `dormant`: 外しても走査対象が一件も増えない（走査根の下に同名のディレクトリが無い）
   */
  status: 'load-bearing' | 'dormant';
  /** `load-bearing` のときだけ書く。外したときに入ってくるファイルが在るディレクトリ */
  witness?: string;
  /** その分類を選んだ理由（実測の要約） */
  note: string;
}

/**
 * 除外するディレクトリの台帳
 *
 * **走査根・拡張子とは向きが逆である。** 根や拡張子は「落とすと母集団が縮む」向きに効くため
 * 「外すと縮む」で固定できるが、除外は「外すと母集団が広がる」。広がる側は被覆率を上げも
 * 下げもしうるが、いずれにせよ検査は緑のまま通り、出力だけが静かに動く。そこで
 * **一件ずつ現況を分類して宣言し、その分類が実データと合っていることを機械に測らせる。**
 *
 * 分類は 2026-09-04 にコミット `d1bb8464` の作業ツリーで、走査根
 * （`backend/src` / `frontend/src` / `e2e`）に対して実測した。既定の走査対象 1729 件に対し、
 * `generated` を外すと 1783 件へ 54 件増え、増えた分はすべて `backend/src/generated` の下で
 * あった。残る四件（`node_modules` / `dist` / `.git` / `coverage`）を外しても 1729 件のまま
 * 一件も増えない——走査根の下に同名のディレクトリが一つも無いためである
 * （`find backend/src frontend/src e2e -name <名前>` がいずれも空を返す）。
 *
 * **効いていない四件を「外すと広がる」で固定してはならない。** 実データが一件も admit しない
 * 名前にその主張を貼ると、**決して落ちない検査**になる——本タスクが取り除こうとしている
 * 空振りそのものである。よって `dormant` として記録し、**その分類の側に強制を与える**
 * （タスク 115.255 の作法。分類の札を増やすなら、その新値だけが負う強制を機械へ与えること）。
 * `dormant` と書いた名前が現に効き始めたら本検査は赤くなり、台帳の書き換えを要求する。
 *
 * **四件を撤去しない理由。** これらは実データの現況に依存する休眠であって、
 * `spec\.ts` のような**代数的に死んだ選言ではない**。`frontend/src` の配下に `coverage` ディレクトリが
 * 生まれた日に、この四件は効き始める。撤去すれば黙って走査対象へ入るため、記録して残す。
 */
const EXCLUDED_DIRECTORY_LEDGER: readonly ExcludedDirectoryRecord[] = [
  {
    name: 'node_modules',
    status: 'dormant',
    note: '走査根の下に同名のディレクトリが無く、外しても走査対象は 1729 件のまま（2026-09-04 実測）',
  },
  {
    name: 'dist',
    status: 'dormant',
    note: '走査根の下に同名のディレクトリが無く、外しても走査対象は 1729 件のまま（2026-09-04 実測）',
  },
  {
    name: '.git',
    status: 'dormant',
    note: '走査根の下に同名のディレクトリが無く、外しても走査対象は 1729 件のまま（2026-09-04 実測）',
  },
  {
    name: 'coverage',
    status: 'dormant',
    note: '走査根の下に同名のディレクトリが無く、外しても走査対象は 1729 件のまま（2026-09-04 実測）',
  },
  {
    name: 'generated',
    status: 'load-bearing',
    witness: 'backend/src/generated',
    note: '外すと Prisma の生成物 54 件が走査対象へ入り 1783 件になる（2026-09-04 実測）',
  },
];

/**
 * 除外するディレクトリが台帳と一致し、効いている名前が現に効いている
 *
 * 一件外すと走査対象が広がり、被覆の分子・分母がともに動く。是正前（タスク 115.260）は
 * それが無言であったため、`SCAN_EXCLUDED_DIRECTORIES` の外に置いた
 * `EXCLUDED_DIRECTORY_LEDGER` と一致を課す。
 * **外す変異は台帳との食い違いとして赤くなる**（走査根の固定点と同じ作法。ただし測る向きは
 * 逆で、「外すと広がる」側を測る）。
 *
 *   1. 台帳と `SCAN_EXCLUDED_DIRECTORIES` の名前が両方向で一致する
 *   2. `load-bearing` と記録した名前は、外すと現にファイルが入ってくる。入ってくる先は
 *      台帳が名指しした `witness` の下に限られる（別の出所が生えたら書き換えを要求する）
 *   3. `dormant` と記録した名前は、外しても一件も入ってこない。入ってきたら台帳が古い
 *   4. `load-bearing` が一件も無い状態を失格にする。全件休眠なら除外の一覧は飾りであり、
 *      「外すと広がる」を測る対象そのものが無い（第3原則）
 *   5. 本番の走査が同定数を通っていることを原文から照合する（既定引数の照合）
 *
 * 2026-09-04 にコミット `d1bb8464` の作業ツリーで実測した。`SCAN_EXCLUDED_DIRECTORIES` から
 * `generated` を外すと本検査が「台帳にある除外名 generated が SCAN_EXCLUDED_DIRECTORIES に
 * 無い」を挙げて落ちる。`node_modules` を外す変異でも同じ形で落ちる。`findFiles` の既定引数を
 * 直書きの配列へ戻すと「既定の除外一覧が SCAN_EXCLUDED_DIRECTORIES でない」で落ちる。
 *
 * **対照自身が空振りしていないことも測った。** 台帳の `generated` を dormant へ書き換えると
 * 「dormant と記録した generated が現に 54 件を除いている」で落ち、`node_modules` を
 * load-bearing へ書き換えると「load-bearing と記録した node_modules を外しても走査対象が
 * 一件も増えない」で落ちる。`EXCLUDED_DIRECTORY_LEDGER` を空にすると「対照群が空」で、
 * `SCAN_EXCLUDED_DIRECTORIES` を空にすると「母集団が空」で落ちる。
 *
 * **是正前（本検査を欠く状態）は無言であった。** `generated` を外しても自己検査は全件緑・
 * EXIT=0 のままで、ゲートの出力だけが 38167 バイトから 35532 バイトへ動いた——本番モジュールが
 * 590 件から 644 件へ、到達被覆が 2633/2684（98.1%）から 2646/2684（98.6%）へ、到達しない
 * 被覆源のみの受入基準が 17 件から 4 件へ、いずれも**生成物を数え入れた分だけ良く見える
 * 向きに**動いた。
 */
function checkExcludedDirectoriesAreLedgered(): string[] {
  const failures: string[] = [];

  // 第3原則: 台帳・除外の一覧が空なら、以下の繰り返しは一度も回らずに緑になる
  if (EXCLUDED_DIRECTORY_LEDGER.length === 0) {
    return ['除外するディレクトリの台帳が空（対照群が空。検査が空振りしている）'];
  }
  if (SCAN_EXCLUDED_DIRECTORIES.length === 0) {
    return [
      `${SCAN_EXCLUSIONS_NAME} が空（母集団が空。node_modules まで走査対象へ入る状態であり、` +
        '以下の「外すと広がる」は測る対象を失っている）',
    ];
  }

  // 1. 台帳と実物の一致
  const ledgered = EXCLUDED_DIRECTORY_LEDGER.map((entry) => entry.name);
  for (const name of SCAN_EXCLUDED_DIRECTORIES) {
    if (!ledgered.includes(name)) {
      failures.push(
        `除外名 ${name} が台帳に無い。\`EXCLUDED_DIRECTORY_LEDGER\` へ、` +
          '現に効いているか否かを実測して登録すること'
      );
    }
  }
  for (const name of ledgered) {
    if (!SCAN_EXCLUDED_DIRECTORIES.includes(name)) {
      failures.push(
        `台帳にある除外名 ${name} が ${SCAN_EXCLUSIONS_NAME} に無い。` +
          '除外を外したのなら、その下のファイルは走査対象へ入っている'
      );
    }
  }

  // 2/3. 分類が実データと合っている
  for (const entry of EXCLUDED_DIRECTORY_LEDGER) {
    if (!SCAN_EXCLUDED_DIRECTORIES.includes(entry.name)) continue; // 上で既に失格にしている
    const admitted = listCoverageScanFilesAdmittedBy(entry.name);

    if (entry.status === 'load-bearing') {
      if (admitted.length === 0) {
        failures.push(
          `load-bearing と記録した除外名 ${entry.name} を外しても走査対象が一件も増えない。` +
            '台帳を dormant へ改め、その根拠を実測で書き残すこと'
        );
        continue;
      }
      if (!entry.witness) {
        failures.push(
          `load-bearing と記録した除外名 ${entry.name} に witness が無い。` +
            '入ってくるファイルの出所を名指しすること'
        );
        continue;
      }
      const witness = toPosixPath(entry.witness);
      const outside = admitted
        .map((file) => toPosixPath(path.relative(process.cwd(), path.resolve(file))))
        .filter((file) => !file.startsWith(`${witness}/`));
      if (outside.length > 0) {
        failures.push(
          `除外名 ${entry.name} を外すと ${witness} の外からも ${outside.length} 件が入ってくる` +
            `（例: ${outside[0]}）。台帳の witness が現況を写していない`
        );
      }
    } else if (admitted.length > 0) {
      failures.push(
        `dormant と記録した除外名 ${entry.name} が現に ${admitted.length} 件を除いている` +
          `（例: ${toPosixPath(path.relative(process.cwd(), path.resolve(admitted[0] ?? '')))}）。` +
          '台帳を load-bearing へ改め、witness を名指しすること'
      );
    }
  }

  // 4. 全件休眠を失格にする（測る対象そのものが無い状態）
  if (!EXCLUDED_DIRECTORY_LEDGER.some((entry) => entry.status === 'load-bearing')) {
    failures.push(
      '効いている除外名（load-bearing）が一件も無い。除外の一覧が飾りになっており、' +
        '「外すと広がる」を測る対象そのものが無い'
    );
  }

  // 5. 本番の走査が同定数を通っていることを原文から照合する
  const absolute = path.resolve(EXTRACTOR_SOURCE_PATH);
  if (!fs.existsSync(absolute)) {
    return [`${EXTRACTOR_SOURCE_PATH} が存在しない（自己検査の前提が失われた）`];
  }
  const source = fs.readFileSync(absolute, 'utf8');
  if (
    !new RegExp(
      String.raw`excludedDirectories: readonly string\[\] = ${SCAN_EXCLUSIONS_NAME}`
    ).test(source)
  ) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: findFiles の既定の除外一覧が ${SCAN_EXCLUSIONS_NAME} でない。` +
        '直書きの配列へ戻すと、定数だけを直しても本番の走査は動かない'
    );
  }
  if (!new RegExp(String.raw`findFiles\(dir, ${COVERAGE_PATTERN_NAME}\)`).test(source)) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: listCoverageScanFiles の走査が ` +
        `findFiles(dir, ${COVERAGE_PATTERN_NAME}) の形でない。` +
        '除外の一覧を第三引数で明示する形になると、台帳が測っている既定の除外と' +
        '本番の走査が食い違う'
    );
  }

  return failures;
}

// ============================================================================
// パターン5（ヘッダー直下の要件一覧）の区間判定
// ============================================================================
//
// `Requirements (feature-name):` の直下に `- REQ-N.M:` を並べる形（パターン5）は、
// ヘッダーから「どこまで」を当該機能の一覧と見なすかを決めねばならない。
// 区間を長く取りすぎると **別機能のヘッダー配下の一覧まで先頭の機能へ帰属し、
// 被覆を過大に見せる**。短く取りすぎると同一機能の一覧を取りこぼし、被覆を過小に見せる。
// どちらへ倒れても検査が嘘をつくため、両方向を固定する。
//
// 是正前の実装は「ヘッダーから次の空行（`\n\n`）まで」だけを見ていた。
// JSDoc の中では段落の切れ目が ` *` の行であって空行ではないため、
// **JSDoc 一枚に複数のヘッダーを並べたファイルでは切れ目が一度も現れず**、
// 二番目以降のヘッダー配下の一覧まで先頭の機能へ帰属していた。
// 実データでは `backend/src/utils/seed-helpers.ts` などが該当していた。

/** 自己検査の中で使う、実在する機能名の一部 */
const SELFTEST_FEATURES = [
  'site-survey',
  'quantity-table-generation',
  'user-authentication',
] as const;

/**
 * 陽性対照: JSDoc 一枚に複数のヘッダーが並ぶ形
 *
 * 空行を一つも含まないため、是正前の「次の空行まで」では区間が切れず、
 * 二番目のヘッダー配下の一覧が先頭の機能にも帰属していた。
 */
const MULTI_HEADER_JSDOC = [
  '/**',
  ' * @fileoverview 陽性対照',
  ' *',
  ' * Requirements (site-survey):',
  ' * - REQ-1.1: 先頭の機能の受入基準',
  ' *',
  ' * Requirements coverage (quantity-table-generation):',
  ' * - REQ-2.2: 別機能の受入基準',
  ' */',
  '',
  'export const value = 1;',
  '',
].join('\n');

/**
 * 陽性対照: 段落の切れ目を挟まずにヘッダーが隣り合う形
 *
 * `MULTI_HEADER_JSDOC` は実データ（`backend/src/utils/seed-helpers.ts`）に倣って
 * 節の間に ` *` を置くため、段落の切れ目の上限だけでも区間が切れてしまう。
 * それでは「次のヘッダーで切る」上限が効いているかを測れない。
 * ここでは切れ目を挟まずヘッダーを隣接させ、**次のヘッダーの上限だけが働く**形を作る。
 */
const ADJACENT_HEADERS_JSDOC = [
  '/**',
  ' * Requirements (site-survey):',
  ' * - REQ-1.1: 先頭の機能の受入基準',
  ' * Requirements coverage (quantity-table-generation):',
  ' * - REQ-2.2: 別機能の受入基準',
  ' */',
  '',
].join('\n');

function checkHeaderSectionStopsAtNextHeader(): string[] {
  const failures: string[] = [];
  // 実データに倣った形（節の間に ` *` がある）と、次のヘッダーの上限だけが働く形の両方を見る。
  const fixtures: ReadonlyArray<{ label: string; source: string }> = [
    { label: '実データに倣った形', source: MULTI_HEADER_JSDOC },
    { label: 'ヘッダーが隣接する形', source: ADJACENT_HEADERS_JSDOC },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (fixtures.length === 0) {
    failures.push('合成素材 fixtures が空です（この確認が空振りしています）');
  }

  for (const fixture of fixtures) {
    const found = extractHeaderScopedCoverage(fixture.source, SELFTEST_FEATURES);
    const at = `[${fixture.label}] `;

    if (!found.acceptanceCriteria.includes('site-survey/REQ-1.1')) {
      failures.push(
        `${at}先頭のヘッダー配下の一覧 site-survey/REQ-1.1 を取りこぼした（区間が短すぎる）`
      );
    }
    if (!found.acceptanceCriteria.includes('quantity-table-generation/REQ-2.2')) {
      failures.push(
        `${at}二番目のヘッダー配下の一覧 quantity-table-generation/REQ-2.2 を取りこぼした（区間が短すぎる）`
      );
    }
    if (found.acceptanceCriteria.includes('site-survey/REQ-2.2')) {
      failures.push(
        `${at}別機能のヘッダー配下の一覧が先頭の機能へ帰属した（site-survey/REQ-2.2。被覆の過大帰属）`
      );
    }
    if (found.acceptanceCriteria.includes('quantity-table-generation/REQ-1.1')) {
      failures.push(
        `${at}先頭のヘッダー配下の一覧が後続の機能へ帰属した（quantity-table-generation/REQ-1.1）`
      );
    }
  }
  return failures;
}

/**
 * 陽性対照: ヘッダーが一つだけで、JSDoc の外に別機能の名前を含む記述が続く形
 *
 * 次のヘッダーが無いので「次のヘッダーまで」だけでは切れない。
 * JSDoc の終端（コメントの閉じ）で切ることでのみ、本体側の記述の混入を防げる。
 */
const SINGLE_HEADER_JSDOC_THEN_BODY = [
  '/**',
  ' * @fileoverview 陽性対照（JSDoc の終端）',
  ' *',
  ' * Requirements (site-survey):',
  ' * - REQ-3.1: 唯一のヘッダー配下の受入基準',
  ' */',
  'export const NOTES = [',
  "  '- REQ-9.9: これは被覆の主張ではなく本体側の文字列である',",
  '];',
  '',
].join('\n');

function checkHeaderSectionStopsAtJsDocEnd(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(SINGLE_HEADER_JSDOC_THEN_BODY, SELFTEST_FEATURES);

  if (!found.acceptanceCriteria.includes('site-survey/REQ-3.1')) {
    failures.push('JSDoc 内のヘッダー配下の一覧 site-survey/REQ-3.1 を取りこぼした');
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-9.9')) {
    failures.push(
      'JSDoc の終端を越えて本体側の記述まで帰属した（site-survey/REQ-9.9。被覆の過大帰属）'
    );
  }
  return failures;
}

/**
 * 陽性対照: ヘッダーより手前に**別のブロックコメントが閉じている**形
 *
 * 囲むコメントの終端は「ヘッダーの直前にある開始記号」から探さねばならない。
 * ファイル先頭の開始記号から探すと、その対応する終端はヘッダーより手前にあるため
 * 「囲んでいない」と判定され、**JSDoc の終端の上限が丸ごと効かなくなる**。
 * 実データのファイルは冒頭に別のコメントを持つことが珍しくないため、
 * この形を置かないと `lastIndexOf` を `indexOf` へ変える変異をどの見本も捕まえない。
 */
const PRECEDING_BLOCK_COMMENT_THEN_HEADER = [
  '/* 先行するブロックコメント（ヘッダーを含まない） */',
  '/**',
  ' * Requirements (site-survey):',
  ' * - REQ-23.1: 二つ目のブロックコメントの中のヘッダー配下',
  ' */',
  "export const NOTES = ['- REQ-23.9: これは被覆の主張ではなく本体側の文字列である'];",
  '',
].join('\n');

function checkHeaderSectionStopsAtEnclosingCommentEnd(): string[] {
  const failures: string[] = [];

  // 空振り防止: 先行するコメントがヘッダーより手前で閉じていなければ、この形は何も測らない
  const opener = PRECEDING_BLOCK_COMMENT_THEN_HEADER.indexOf('/*');
  const closer = PRECEDING_BLOCK_COMMENT_THEN_HEADER.indexOf('*/');
  const header = PRECEDING_BLOCK_COMMENT_THEN_HEADER.indexOf('Requirements (site-survey):');
  if (opener < 0 || closer < 0 || header < 0 || closer > header) {
    return ['見本の先行コメントがヘッダーより手前で閉じていない（対照が空振りしている）'];
  }

  const found = extractHeaderScopedCoverage(PRECEDING_BLOCK_COMMENT_THEN_HEADER, SELFTEST_FEATURES);
  if (!found.acceptanceCriteria.includes('site-survey/REQ-23.1')) {
    failures.push('ヘッダーを囲む JSDoc 内の一覧 site-survey/REQ-23.1 を取りこぼした');
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-23.9')) {
    failures.push(
      '先行するコメントの終端を囲むコメントの終端と取り違え、本体側の記述まで帰属した' +
        '（site-survey/REQ-23.9。被覆の過大帰属）'
    );
  }
  return failures;
}

/**
 * 陽性対照: 切れ目になるヘッダーの機能名が、帰属の対象に含まれていない形
 *
 * `--feature=NAME` は帰属の対象を一機能へ絞る。切れ目まで既知の機能名で決めていると、
 * 絞り込んだときだけ他機能のヘッダーが切れ目でなくなり、過大帰属が復活する。
 * 区間の切れ目は機能名を問わずヘッダーの出現だけで決まらねばならない。
 */
const HEADER_OF_UNLISTED_FEATURE = [
  '/**',
  ' * Requirements (site-survey):',
  ' * - REQ-6.1: 対象の機能の受入基準',
  // 段落の切れ目を挟まない。挟むとそちらの上限だけで切れてしまい、
  // 「ヘッダーが切れ目になるか」を測れなくなる。
  ' * Requirements (company-info):',
  ' * - REQ-7.7: 帰属の対象に含まれていない機能の受入基準',
  ' */',
  '',
].join('\n');

function checkUnlistedFeatureHeaderStillEndsSection(): string[] {
  const failures: string[] = [];
  // company-info を意図的に渡さない（`--feature=site-survey` に相当する）
  const found = extractHeaderScopedCoverage(HEADER_OF_UNLISTED_FEATURE, ['site-survey']);

  if (!found.acceptanceCriteria.includes('site-survey/REQ-6.1')) {
    failures.push('対象の機能の一覧 site-survey/REQ-6.1 を取りこぼした');
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-7.7')) {
    failures.push(
      '帰属の対象に含まれない機能のヘッダーが切れ目にならず、site-survey/REQ-7.7 へ帰属した'
    );
  }
  return failures;
}

/**
 * 陽性対照: JSDoc 内の段落の切れ目（` *` だけの行）の先に散文が続く形
 *
 * JSDoc では ` *` だけの行が空行の役目を果たす。ここで切らないと、
 * **一覧の直後に置かれた「この受入基準は検証していない」という散文まで被覆主張になる**。
 *
 * 散文の側は `-` の印を持つ形で書く。タスク 115.194 が行頭のコメント記号 `*` を
 * 一覧の印から外したため、` * REQ-4.2 …` と書くと**規則4の有無にかかわらず拾われず**、
 * この対照が空振りになる（実データの散文はいずれも `-` の印を持つ形であり、こちらが実像である）。
 * 空振りでないことは後段の機構対照が実際の変異で確かめる。
 *
 * **実データでここを切ると何が落ちるかを、この散文は持たない。** 起票時の散文は母集団の
 * 大きさと落ちる番号を書き並べていたが、実データが動いても誰も咎めず、**数も、列挙の
 * 性格づけも偽のまま残った**（タスク 115.253 が実測で検出した。散文が「検証していないと
 * 述べる散文」とした一群は、実際には見出し配下の正当な一覧項目であった）。
 * 母集団は `RULE4_DROPPED_MARK_POPULATION` が一元に持ち、
 * `checkRule4DroppedMarkPopulationIsExact` が毎回の実行で実データへ規則4の無効化変異を
 * 当て、**過不足なく**突き合わせる。「正当な被覆は一件も失われない」——巻き添えで落ちる
 * 一覧項目の番号を抽出器の集計が今も持つこと——も同検査が測る。
 * ここへ数や実データの番号を書き戻すと `checkParagraphBreakDocDelegatesPopulation` が赤くなる。
 *
 * **この検査が空振りでないことも、散文でなく機構が示す。** 規則4を撤去する変異では、
 * 本検査と、実データの側で母集団を測り直す `checkRule4DroppedMarkPopulationIsExact` が
 * 揃って赤くなる（2026-09-03 に実測。併せて赤くなる検査は他にもあるが、その一覧こそ
 * 陳腐化するのでここには書かない）。仮想の資料 `PARAGRAPH_BREAK_THEN_PROSE` の側が
 * **規則4だけで**抑えられていること——別の規則が先に抑えて対照が空振りへ変質して
 * いないこと——は `checkParagraphBreakFixtureActuallyReacts` が本文の側から変異を当てて
 * 確かめる（規則4を撤去してもそちらは緑のままである。見ているのが別の事柄だからである）。
 * 起票時点の懸念は、散文が印を持たない ` * Note: REQ-4.2 …` の形で書かれており
 * どの上限を外しても一致しなかったこと（＝空虚な主張）であったが、
 * タスク 115.194 の是正で既に解消している。
 *
 * 母集団の入れ替わりの経緯（どの実データがいつ出入りしたか）は台帳の側で追う。
 * 散文へ写すと同期する機構の無い二重帳簿になる（タスク 115.223 が抽出器の説明文について
 * 下した処遇と同じ）。
 */
const PARAGRAPH_BREAK_THEN_PROSE = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-4.1: 段落の前（正当な被覆主張）',
  ' *',
  ' * ## 本ファイルが判定していないもの',
  ' * - REQ-4.2 はE2Eテストで検証困難なため省略',
  ' */',
  '',
].join('\n');

function checkHeaderSectionStopsAtJsDocParagraphBreak(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(PARAGRAPH_BREAK_THEN_PROSE, SELFTEST_FEATURES);
  if (!found.acceptanceCriteria.includes('site-survey/REQ-4.1')) {
    failures.push('段落の切れ目より前の一覧 site-survey/REQ-4.1 を取りこぼした（狭めすぎ）');
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-4.2')) {
    failures.push(
      '段落の切れ目を越えて散文まで帰属した（site-survey/REQ-4.2。' +
        '「検証していない」と述べた文が被覆主張になっている）'
    );
  }
  return failures;
}

/**
 * 機構: 仮想の資料の陰性対照が規則4の除去に**実際に反応する**ことを確かめる
 *
 * `PARAGRAPH_BREAK_THEN_PROSE` の REQ-4.2 が拾われない理由は規則4でなければならない。
 * 散文の書き方によっては別の規則（タスク 115.194 の「行頭のコメント記号は印ではない」）が
 * 先に抑えてしまい、**規則4を外しても赤くならない空振りの対照**へ変質する。
 * 実データ側と同じ流儀で、本文の側から段落の切れ目を潰した写しを作り、
 * REQ-4.2 が現れることを主張する。
 */
function checkParagraphBreakFixtureActuallyReacts(): string[] {
  const failures: string[] = [];
  const neutralized = neutralizeJsDocParagraphBreaks(PARAGRAPH_BREAK_THEN_PROSE);
  if (neutralized === PARAGRAPH_BREAK_THEN_PROSE) {
    failures.push('見本に段落の切れ目が無く、変異が差分を作っていない');
    return failures;
  }
  const found = extractHeaderScopedCoverage(neutralized, SELFTEST_FEATURES);
  if (!found.acceptanceCriteria.includes('site-survey/REQ-4.2')) {
    failures.push(
      '規則4を外しても site-survey/REQ-4.2 が現れない（対照が空振りしている。' +
        '散文が一覧項目の形を失っていないか確かめること）'
    );
  }
  return failures;
}

/**
 * 実データの側から、段落の切れ目の先の偽の主張が消えていることを見る
 *
 * 仮想の資料だけでは実装が実データに効いているとは言えない。
 * 規則4が無ければ偽の被覆主張を生む実在のファイルを名指しで固定する。
 * 当該ファイルや前提の記述が失われたら「前提が失われた」として失敗させる。
 *
 * 一件目は当初 `site-survey-performance.spec.ts`（keep: REQ-16.1 / drop: REQ-16.7）であったが、
 * タスク 115.186 で同ファイルの一覧が掲げていた受入基準がすべて除外との同居として
 * 取り下げられ、一覧そのものが無くなったため、同じ形（一覧の直後に段落の切れ目を挟んで
 * 「本ファイルは判定していない」と述べる散文が続く）を持つ実データへ置き換えた。
 *
 * 二件目は当初 `quantity-group-copy.spec.ts`（keep: REQ-38.1 / drop: REQ-38.4）であったが、
 * タスク 115.192 が REQ-38.4 を実在する E2E で被覆し、委譲を騙る散文を一覧項目でない形へ
 * 書き改めたため、**規則4の有無にかかわらず REQ-38.4 は拾われなくなった**。
 * 対照としては空振りであり、点数が満点のままでは検出できなかった。
 * 母集団（規則4を外すと新たに拾われるファイル）を全件走査して確定した唯一の代替である
 * `quantity-count-persistence-e2e.spec.ts` へ差し替えた。
 * 同ファイルは段落の切れ目より前の一覧が `- @requirement …/REQ-47.15:` の形であり、
 * 一覧項目の印に一致しないため `keep` を持てない。よって `keep` は任意とし、
 * 「狭めすぎ」の側は `keep` を持つ他の対照と、後段の機構対照が担保する。
 */
const REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK: ReadonlyArray<{
  file: string;
  /**
   * 段落の切れ目より前の一覧にあり、拾われねばならない被覆印（受入基準・要件のどちらでもよい）。
   * 切れ目より前に一覧項目を持たないファイルもあるため任意とする。
   */
  keep?: string;
  /** 段落の切れ目より後の散文にあり、拾ってはならない被覆印（当該ファイルの全件） */
  drop: readonly string[];
}> = [
  {
    file: 'e2e/specs/quantity-tables/name-remarks-autocomplete.spec.ts',
    keep: 'quantity-table-generation/REQ-7.2',
    drop: ['quantity-table-generation/REQ-7.1'],
  },
  {
    file: 'e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec.ts',
    drop: [
      'quantity-table-generation/REQ-47.15',
      'quantity-table-generation/REQ-47.16',
      'quantity-table-generation/REQ-47.17',
    ],
  },
];

/** 被覆印を受入基準・要件のどちらの一覧からでも拾えたかを見る */
function claimsCoverageOf(found: HeaderScopedCoverageLike, id: string): boolean {
  return found.acceptanceCriteria.includes(id) || found.requirements.includes(id);
}

/** `extractHeaderScopedCoverage` の戻り値のうち、対照が見る部分 */
interface HeaderScopedCoverageLike {
  requirements: string[];
  acceptanceCriteria: string[];
}

/**
 * 規則4（JSDoc 段落の切れ目）を**本文の側から**無効化した写しを作る
 *
 * ` *` だけの行が JSDoc の段落の切れ目である。そこへ文字を足せば切れ目でなくなる。
 * 抽出器そのものは実物を使うため、区間判定の規則を対照側へ複製しない
 * （抽出規則の複製は一元化の方針に反する）。
 */
function neutralizeJsDocParagraphBreaks(content: string): string {
  return content.replace(/(\n[ \t]*\*)[ \t]*(?=\n)/g, '$1 .');
}

function checkRealProseIsNotClaimedAsCoverage(): string[] {
  const failures: string[] = [];
  for (const entry of REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK) {
    const absolute = path.resolve(entry.file);
    if (!fs.existsSync(absolute)) {
      failures.push(`${entry.file} が存在しない（自己検査の前提が失われた）`);
      continue;
    }
    const content = fs.readFileSync(absolute, 'utf8');
    const found = extractHeaderScopedCoverage(content, discoverFeatures());
    if (entry.keep !== undefined && !claimsCoverageOf(found, entry.keep)) {
      failures.push(
        `${entry.file}: ${entry.keep} を取りこぼした（自己検査の前提が変わった可能性）`
      );
    }
    for (const drop of entry.drop) {
      if (claimsCoverageOf(found, drop)) {
        failures.push(
          `${entry.file}: 段落の切れ目より後の散文から ${drop} が被覆主張として拾われた`
        );
      }
    }
  }
  return failures;
}

/**
 * 機構: 実データの陰性対照が規則4の除去に**実際に反応する**ことを確かめる
 *
 * タスク 115.192 で、実データ側の是正により対照の一件が「規則4が有っても無くても拾われない」
 * 状態（＝空振り）へ変質した。前段の検査は空振りでも緑になるため、点数では検出できない。
 * 実物へ変異（段落の切れ目の無効化）を当て、各 `drop` が本当に規則4だけで抑えられているかを見る。
 *
 * 対照の集合そのものが空になったら真空で緑にならないよう、母集団の非空も併せて検査する
 * （第3原則。対照を空にして緑にする抜け道と同じ穴を作らない）。
 */
function checkRealProseControlsActuallyReact(): string[] {
  const failures: string[] = [];

  if (REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK.length === 0) {
    failures.push('実データの陰性対照が一件も無い（対照を空にして緑にする抜け道）');
  }
  const totalDrops = REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK.reduce(
    (count, entry) => count + entry.drop.length,
    0
  );
  if (totalDrops === 0) {
    failures.push('拾ってはならない被覆印が一件も無い（drop を空にして緑にする抜け道）');
  }
  if (!REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK.some((entry) => entry.keep !== undefined)) {
    failures.push('keep を持つ対照が一件も無い（狭めすぎの側を誰も見ていない）');
  }

  const features = discoverFeatures();
  for (const entry of REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK) {
    const absolute = path.resolve(entry.file);
    if (!fs.existsSync(absolute)) {
      failures.push(`${entry.file} が存在しない（自己検査の前提が失われた）`);
      continue;
    }
    const content = fs.readFileSync(absolute, 'utf8');
    const neutralized = neutralizeJsDocParagraphBreaks(content);
    if (neutralized === content) {
      failures.push(`${entry.file}: 段落の切れ目が無く、変異が実物へ差分を作っていない`);
      continue;
    }
    const found = extractHeaderScopedCoverage(neutralized, features);
    for (const drop of entry.drop) {
      if (!claimsCoverageOf(found, drop)) {
        failures.push(
          `${entry.file}: 規則4を外しても ${drop} が現れない（対照が空振りしている。` +
            '散文が当該の被覆印を名乗らなくなった可能性がある。母集団を走査し直して差し替えること）'
        );
      }
    }
  }
  return failures;
}

// ============================================================================
// 説明文が挙げる実例の実在（タスク 115.223）
// ============================================================================

/** 被覆の抽出器の本体。説明文の検査対象 */
const EXTRACTOR_SOURCE_PATH = 'scripts/check-requirement-coverage.ts';

/** 本自己検査それ自体。実データの名指しを一元に持つ側 */
const SELFTEST_SOURCE_PATH = 'scripts/check-requirement-coverage.selftest.ts';

/** 実データの名指しを持つ定数の名前。抽出器の説明文はここを指す */
const REAL_CLAIMS_AUTHORITY_NAME = 'REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK';

/** 本検査それ自体の名前。抽出器の説明文が「守り手」として名乗る */
const DOC_GUARD_NAME = 'checkExtractorDocCitesNoPerishableExample';

/** 説明文を取り出す起点（この宣言の直前の JSDoc を見る） */
const EXTRACTOR_DOC_ANCHOR = 'export function resolveHeaderSectionEnd(';

/**
 * 説明文に置いてはならない「実データとともに陳腐化する形」
 *
 * `probe` は当該の形の**架空の見本**である。regexp が壊れて何にも一致しなくなると禁止が
 * 黙って効かなくなるため、見本に一致することを毎回確かめる（規則の空振りの検出）。
 * 見本に実在の番号・実測値を使わないのは、見本自体が「いまの実データはこうである」と
 * 読まれる余地を残さないためである（本検査が禁じているのと同じ陳腐化を持ち込まない）。
 */
const PERISHABLE_CITATION_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  probe: string;
}> = [
  {
    label: '要件・受入基準の番号',
    pattern: /REQ-\d+/,
    probe: '`feature-name/REQ-1.2` — 被覆の集計から落ちる',
  },
  {
    label: '実データの件数',
    pattern: /\d+\s*件/,
    probe: '実データ（被覆ヘッダー 999 件）で',
  },
];

/**
 * 宣言の直前に置かれた JSDoc を取り出す
 *
 * 見つからなければ null を返す。宣言と JSDoc の間に他の記述が挟まる場合も「直前の JSDoc
 * ではない」として null を返し、無関係なコメントを検査対象と取り違えないようにする。
 */
function extractJsDocAbove(source: string, anchor: string): string | null {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) return null;
  const close = source.lastIndexOf('*/', anchorIndex);
  if (close < 0) return null;
  const open = source.lastIndexOf('/**', close);
  if (open < 0) return null;
  if (source.slice(close + 2, anchorIndex).trim().length > 0) return null;
  return source.slice(open, close + 2);
}

/**
 * 抽出器の説明文が、実データとともに陳腐化する実例を挙げていないことを見る
 *
 * かつて `resolveHeaderSectionEnd` の JSDoc は、規則4が落とす被覆印を具体の番号で列挙して
 * いた。実データの側が動いた結果、挙げた番号は**どちらも列挙が述べる状態を失った**が、
 * 説明文は誰にも咎められないまま残った。説明文の実例は、実例であるがゆえに陳腐化する。
 *
 * 処遇は「実例を機械で確かめる」ではなく「実例を説明文から無くす」を採った。実データの
 * 名指しは `REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK` が既に一元に持ち、実在と非空振りの
 * 双方を機械で確かめている。同じ列挙を説明文へ写すと、同期する機構の無い二重帳簿になる。
 *
 * よってここでは三つを見る。
 *
 *   1. 説明文そのものが取り出せること（関数名が変わった・JSDoc が消えたら失格。
 *      対象が無いことを「合格」にしない——第3原則）
 *   2. 説明文が陳腐化する形（番号・件数）を一つも挙げていないこと
 *   3. 説明文が名乗る先——実データの名指しを持つ定数と、実例を禁じている本検査——が
 *      いずれも実在し、定数が空でないこと（`check-design-path-references.ts` が設計文書の
 *      パスに対して行っている「挙げた先の実在」の検査と同じ趣旨）
 *
 * **守れない範囲を明記する。** 見るのは `resolveHeaderSectionEnd` の JSDoc 一つだけであり、
 * 同ファイルの他の説明文（例えば走査対象の限界を述べる箇所）が挙げる実例は見ていない。
 * 陳腐化する形として挙げているのも番号と件数の二つだけで、ファイル名・割合・日付は
 * 素通りする。禁止を広げるときは `PERISHABLE_CITATION_PATTERNS` へ足す。
 */
function checkExtractorDocCitesNoPerishableExample(): string[] {
  const failures: string[] = [];

  if (PERISHABLE_CITATION_PATTERNS.length === 0) {
    failures.push('陳腐化する形が一件も登録されていない（規則を空にして緑にする抜け道）');
  }
  for (const { label, pattern, probe } of PERISHABLE_CITATION_PATTERNS) {
    if (!pattern.test(probe)) {
      failures.push(`${label}: 見本「${probe}」に一致しない（規則が空振りしている）`);
    }
  }

  const extractorPath = path.resolve(EXTRACTOR_SOURCE_PATH);
  if (!fs.existsSync(extractorPath)) {
    failures.push(`${EXTRACTOR_SOURCE_PATH} が存在しない（検査対象が失われた）`);
    return failures;
  }
  const doc = extractJsDocAbove(fs.readFileSync(extractorPath, 'utf8'), EXTRACTOR_DOC_ANCHOR);
  if (doc === null) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH}: \`${EXTRACTOR_DOC_ANCHOR}\` の直前の JSDoc を取り出せない` +
        '（宣言の綴りが変わったか説明文が失われた。前提が崩れたので合格にしない）'
    );
    return failures;
  }

  for (const { label, pattern } of PERISHABLE_CITATION_PATTERNS) {
    const hit = pattern.exec(doc);
    if (hit !== null) {
      failures.push(
        `${EXTRACTOR_SOURCE_PATH} の説明文が${label}「${hit[0]}」を挙げている。` +
          `実例は実データとともに陳腐化するため、${REAL_CLAIMS_AUTHORITY_NAME} へ移すこと`
      );
    }
  }

  if (!doc.includes(REAL_CLAIMS_AUTHORITY_NAME)) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH} の説明文が指し先 ${REAL_CLAIMS_AUTHORITY_NAME} を名乗っていない` +
        '（実データの名指しへの導線が失われている）'
    );
  }

  if (!doc.includes(DOC_GUARD_NAME)) {
    failures.push(
      `${EXTRACTOR_SOURCE_PATH} の説明文が守り手 ${DOC_GUARD_NAME} を名乗っていない` +
        '（実例を禁じているのが誰かを後任が辿れない）'
    );
  }

  const selftestPath = path.resolve(SELFTEST_SOURCE_PATH);
  if (!fs.existsSync(selftestPath)) {
    failures.push(`${SELFTEST_SOURCE_PATH} が存在しない（指し先の実在を確かめられない）`);
  } else {
    const selftestSource = fs.readFileSync(selftestPath, 'utf8');
    const requiredDeclarations = [
      `const ${REAL_CLAIMS_AUTHORITY_NAME}`,
      `function ${DOC_GUARD_NAME}(`,
    ];
    // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
    if (requiredDeclarations.length === 0) {
      failures.push('素材 requiredDeclarations が空です（この確認が空振りしています）');
    }
    for (const name of requiredDeclarations) {
      if (!selftestSource.includes(name)) {
        failures.push(
          `${SELFTEST_SOURCE_PATH} に \`${name}\` が無い（説明文が実在しない名前を指している）`
        );
      }
    }
  }

  if (REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK.length === 0) {
    failures.push(`${REAL_CLAIMS_AUTHORITY_NAME} が空である（指し先はあるが中身が無い）`);
  }

  return failures;
}

// ============================================================================
// 規則4が落とす被覆印の母集団（タスク 115.253）
// ============================================================================

/** 規則4を外すと新たに帰属する実データの一件 */
interface Rule4DroppedMarkEntry {
  /** リポジトリ根からの相対パス */
  file: string;
  /**
   * 落ちる被覆印の性格
   *
   * - `false-claim`: 被覆主張として拾ってはならない形。区間の外へ置くのが意図どおりであり、
   *   同じファイルは `REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK` にも陰性対照として載る
   * - `collateral`: それ自体は正当な一覧項目だが、区間の外にあるため巻き添えになる形。
   *   同じ番号を抽出器の集計が今も持つこと（集計が動かないこと）を本検査が測る
   */
  kind: 'false-claim' | 'collateral';
  /** 規則4を外すと新たに現れる被覆印の**全件**（過不足なく一致すること） */
  marks: readonly string[];
}

/**
 * 規則4が実データから落とす被覆印の母集団（唯一の出所）
 *
 * 散文はこの台帳を指すだけで件数も列挙も持たない。実データは動くため、散文へ書いた
 * 数と列挙は誰にも咎められないまま偽になる（タスク 115.253 が実測で検出した実害）。
 *
 * 本台帳は `checkRule4DroppedMarkPopulationIsExact` が実データへ規則4の無効化変異を
 * 当てて**過不足なく**突き合わせる。母集団が増えても減っても赤くなるため、
 * 台帳が黙って陳腐化することはない。
 */
const RULE4_DROPPED_MARK_POPULATION: readonly Rule4DroppedMarkEntry[] = [
  {
    // `Task 53.7 追加:` / `Task 53.9 追加:` の見出し配下に `- 27.4: …` の形で並ぶ**正当な
    // 一覧項目**である。散文ではない。段落の切れ目より後に置かれているため巻き添えで落ちる。
    file: 'frontend/src/pages/EstimateDetailPage.tsx',
    kind: 'collateral',
    marks: [
      'estimate-creation/REQ-27',
      'estimate-creation/REQ-27.4',
      'estimate-creation/REQ-27.5',
      'estimate-creation/REQ-27.6',
      'estimate-creation/REQ-27.7',
      'estimate-creation/REQ-42.9',
      'estimate-creation/REQ-43',
      'estimate-creation/REQ-43.4',
      'estimate-creation/REQ-49.5',
    ],
  },
  {
    // `## 本ファイルが判定していないもの` の配下の散文。拾えば過大帰属になる
    file: 'e2e/specs/quantity-tables/name-remarks-autocomplete.spec.ts',
    kind: 'false-claim',
    marks: ['quantity-table-generation/REQ-7.1'],
  },
  {
    // `検証方針:` の配下の記述。検証の方針を述べる文であって被覆の一覧ではない
    file: 'e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec.ts',
    kind: 'false-claim',
    marks: [
      'quantity-table-generation/REQ-47',
      'quantity-table-generation/REQ-47.15',
      'quantity-table-generation/REQ-47.16',
      'quantity-table-generation/REQ-47.17',
    ],
  },
];

/** 母集団の台帳の名前。散文はここを指す */
const RULE4_POPULATION_AUTHORITY_NAME = 'RULE4_DROPPED_MARK_POPULATION';

/** 母集団を実データと突き合わせる検査の名前。散文はここを指す */
const RULE4_POPULATION_GUARD_NAME = 'checkRule4DroppedMarkPopulationIsExact';

/**
 * 実データへ規則4の無効化変異を当て、新たに現れる被覆印をファイルごとに測る
 *
 * 走査するファイルの母集団は `listCoverageScanFiles`（抽出器と同一の出所）から受け取る。
 * 走査規則をここへ複製すると、抽出器が読む母集団と自己検査が測る母集団が黙ってずれる。
 */
function measureRule4DroppedMarks(): Map<string, string[]> {
  const features = discoverFeatures();
  const measured = new Map<string, string[]>();

  for (const file of listCoverageScanFiles()) {
    const content = fs.readFileSync(file, 'utf-8');
    const neutralized = neutralizeJsDocParagraphBreaks(content);
    if (neutralized === content) continue;

    const before = extractHeaderScopedCoverage(content, features);
    const after = extractHeaderScopedCoverage(neutralized, features);
    const already = new Set([...before.requirements, ...before.acceptanceCriteria]);
    const added = Array.from(new Set([...after.requirements, ...after.acceptanceCriteria]))
      .filter((id) => !already.has(id))
      .sort();
    if (added.length > 0) {
      measured.set(toPosixPath(path.relative(process.cwd(), file)), added);
    }
  }
  return measured;
}

/**
 * 規則4が落とす被覆印の母集団が、実データの実測と過不足なく一致する
 *
 * かつて「実データでここを切って帰属が減るのは 2 ファイルだけ」と散文が述べていたが、
 * 実測は三件目を含んでいた。散文は実データと同期する機構を持たないため、
 * **数と列挙を散文から台帳へ移し、台帳の側を実測と突き合わせる**。
 *
 * 見るのは四つである。
 *
 *   1. 台帳・各項目の `marks`・分類の両方の値が空でないこと（第3原則。空にして緑にする
 *      抜け道を作らない。分類が片側だけになると母集団の性格の劣化を誰も見なくなる）
 *   2. 実測した母集団と台帳が**両方向で**一致すること（登録漏れも、空振りした登録も赤くする）
 *   3. `collateral`（正当な一覧項目の巻き添え）の被覆印を、抽出器の集計が今も持つこと
 *      ——「正当な被覆は一件も失われない」を散文でなく機構で支える
 *   4. 分類が `REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK` と食い違わないこと
 *      （二つの台帳が別々に動くと、どちらが正かを誰も決められなくなる）
 *
 * **守れない範囲を明記する。** `kind` が実態に合っているか（当該の記述が本当に散文か、
 * 正当な一覧項目か）は人の判断であり、機械が見るのは陰性対照との整合だけである。
 * また 3 は「同じ番号を抽出器の集計が持つ」ことしか見ない。その被覆源が当該の受入基準を
 * 実際に検証しているかは、被覆の検査本体（到達性・逐語複製）の所管である。
 */
function checkRule4DroppedMarkPopulationIsExact(): string[] {
  const failures: string[] = [];

  // 第3原則: 台帳が空なら以下の照合は一度も回らず、この検査は何も主張しない
  if (RULE4_DROPPED_MARK_POPULATION.length === 0) {
    return [
      `${RULE4_POPULATION_AUTHORITY_NAME} が空である（母集団の台帳を空にして緑にする抜け道）`,
    ];
  }
  for (const kind of ['false-claim', 'collateral'] as const) {
    if (!RULE4_DROPPED_MARK_POPULATION.some((entry) => entry.kind === kind)) {
      failures.push(
        `性格 ${kind} の項目が台帳に一件も無い（片側だけの台帳では母集団の性格の劣化を` +
          '検出できない。実測して該当が本当に消えたのなら、この下限ごと設計し直すこと）'
      );
    }
  }
  for (const entry of RULE4_DROPPED_MARK_POPULATION) {
    if (entry.marks.length === 0) {
      failures.push(
        `${entry.file}: 落ちる被覆印が一件も登録されていない（marks を空にして緑にする抜け道）`
      );
    }
  }

  const measured = measureRule4DroppedMarks();
  if (measured.size === 0) {
    failures.push(
      '規則4の無効化変異が実データへ被覆印の差を一件も作らない' +
        '（変異が効いていないか走査が壊れている。母集団の照合は測る対象を失っている）'
    );
    return failures;
  }

  const registered = new Map(RULE4_DROPPED_MARK_POPULATION.map((entry) => [entry.file, entry]));
  for (const [file, marks] of measured) {
    const entry = registered.get(file);
    if (!entry) {
      failures.push(
        `${file} は規則4を外すと被覆印が新たに帰属する（${marks.join(', ')}）が、` +
          `${RULE4_POPULATION_AUTHORITY_NAME} に登録されていない。` +
          '性格（散文の偽の主張か、正当な一覧項目の巻き添えか）を判断して登録すること'
      );
      continue;
    }
    for (const id of marks) {
      if (!entry.marks.includes(id)) {
        failures.push(`${file}: 実測で新たに現れる ${id} が台帳の marks に無い（登録漏れ）`);
      }
    }
    for (const id of entry.marks) {
      if (!marks.includes(id)) {
        failures.push(
          `${file}: 台帳の ${id} は規則4を外しても現れない（登録が空振りしている。` +
            '実データが動いたので測り直して差し替えること）'
        );
      }
    }
  }
  for (const file of registered.keys()) {
    if (!measured.has(file)) {
      failures.push(
        `${file} は台帳に登録されているが、規則4を外しても被覆印が一件も増えない` +
          '（対照が空振りしている。母集団を測り直すこと）'
      );
    }
  }

  const aggregate = new Set<string>();
  for (const entry of extractTestCoverage(discoverFeatures())) {
    for (const id of entry.requirements) aggregate.add(id);
    for (const id of entry.acceptanceCriteria) aggregate.add(id);
  }
  if (aggregate.size === 0) {
    failures.push('抽出器の集計が空である（「集計は動かない」の照合が測る対象を失っている）');
  } else {
    for (const entry of RULE4_DROPPED_MARK_POPULATION) {
      if (entry.kind !== 'collateral') continue;
      for (const id of entry.marks) {
        if (!aggregate.has(id)) {
          failures.push(
            `${entry.file}: 規則4が落とす ${id} を抽出器の集計が持たない。` +
              '巻き添えで正当な被覆が失われている（当該ファイルの一覧を区間の内側へ移すか、' +
              '他の被覆源で名乗ること）'
          );
        }
      }
    }
  }

  const negativeControlFiles = new Set(
    REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK.map((entry) => entry.file)
  );
  for (const entry of RULE4_DROPPED_MARK_POPULATION) {
    const isNegativeControl = negativeControlFiles.has(entry.file);
    if (entry.kind === 'false-claim' && !isNegativeControl) {
      failures.push(
        `${entry.file}: 偽の被覆主張として分類されているが ${REAL_CLAIMS_AUTHORITY_NAME} に` +
          '陰性対照として載っていない（拾われないことを誰も測っていない）'
      );
    }
    if (entry.kind === 'collateral' && isNegativeControl) {
      failures.push(
        `${entry.file}: 巻き添えとして分類されているが ${REAL_CLAIMS_AUTHORITY_NAME} に` +
          '陰性対照として載っている（正当な一覧項目を「拾ってはならない」と主張している）'
      );
    }
  }
  for (const file of negativeControlFiles) {
    if (!registered.has(file)) {
      failures.push(
        `${REAL_CLAIMS_AUTHORITY_NAME} の ${file} が ${RULE4_POPULATION_AUTHORITY_NAME} に無い` +
          '（二つの台帳が食い違っている）'
      );
    }
  }

  return failures;
}

/** 散文を取り出す起点（この宣言の直前の JSDoc を見る） */
const PARAGRAPH_BREAK_DOC_ANCHOR = 'const PARAGRAPH_BREAK_THEN_PROSE = [';

/**
 * 当該の散文に置いてはならない「実データとともに陳腐化する形」
 *
 * 115.223 が抽出器の説明文へ課した全面禁止（`REQ-\d+` と `\d+ 件`）は**ここへは持ち込めない**。
 * この散文は仮想の資料 `PARAGRAPH_BREAK_THEN_PROSE` それ自体の番号（`REQ-4.1` / `REQ-4.2`）を
 * 説明する義務があり、全面禁止はその説明ごと禁じてしまう。よって**実データを指す形だけ**を
 * 禁じる。機能名を冠した被覆印（`feature-name/REQ-N`）は実データにしか現れず、
 * ファイル数・印の数も実データの計数にしか現れない。
 *
 * `probe` は禁止したい形の架空の見本、`counterProbe` は**禁じてはならない形**の見本である。
 * 前者だけを持つと規則が壊れて何にも一致しなくなったことに気付けず、後者だけを持つと
 * 規則が広がりすぎて正当な説明を禁じるようになったことに気付けない。幅を両側から固定する。
 */
const PROSE_REAL_DATA_CITATION_PATTERNS: ReadonlyArray<{
  label: string;
  pattern: RegExp;
  probe: string;
  counterProbe: string;
}> = [
  {
    label: '実データのファイル数',
    pattern: /\d+\s*ファイル/,
    probe: '走査した全ファイルのうち 9 ファイルだけ',
    counterProbe: 'ファイルの前書きに置かれた一覧',
  },
  {
    label: '実データの被覆印',
    pattern: /[a-z][a-z0-9-]*\/REQ-\d/,
    probe: '`feature-name/REQ-1.2` が落ちる',
    counterProbe: '仮想の資料の REQ-4.2 は拾われない',
  },
  {
    label: '実データの被覆印の件数',
    pattern: /\d+\s*印/,
    probe: '落ちるのは 99 印である',
    counterProbe: '段落の切れ目より後の散文は被覆の印ではない',
  },
];

/**
 * 段落の切れ目の陽性対照の散文が、実データの件数と列挙を持たず、台帳を指している
 *
 * 115.223 は抽出器の説明文について「実例を機械で確かめる」ではなく「実例を説明文から
 * 無くす」を採った。本検査は**同じ処遇をこの散文へ適用する**。ただし禁止の幅は狭い
 * （`PROSE_REAL_DATA_CITATION_PATTERNS` の理由を参照）。
 *
 * 見るのは三つである。
 *
 *   1. 散文そのものが取り出せること（見本の名が変わった・JSDoc が消えたら失格。
 *      対象が無いことを「合格」にしない——第3原則）
 *   2. 実データを指す形を一つも挙げていないこと
 *   3. 散文が名乗る先——母集団の台帳と、それを実測と突き合わせる検査——が実在すること
 *
 * **守れない範囲を明記する。** 見るのは `PARAGRAPH_BREAK_THEN_PROSE` の直前の JSDoc 一つ
 * だけであり、同ファイルの他の散文は見ていない。禁じる形も三つだけで、ファイル名・割合・
 * 日付は素通りする。広げるときは `PROSE_REAL_DATA_CITATION_PATTERNS` へ足す。
 */
function checkParagraphBreakDocDelegatesPopulation(): string[] {
  const failures: string[] = [];

  // 第3原則: 規則が空なら以下の照合は一度も回らない
  if (PROSE_REAL_DATA_CITATION_PATTERNS.length === 0) {
    return ['実データを指す形が一件も登録されていない（規則を空にして緑にする抜け道）'];
  }
  for (const { label, pattern, probe, counterProbe } of PROSE_REAL_DATA_CITATION_PATTERNS) {
    if (!pattern.test(probe)) {
      failures.push(`${label}: 禁じたい見本「${probe}」に一致しない（規則が空振りしている）`);
    }
    if (pattern.test(counterProbe)) {
      failures.push(
        `${label}: 禁じてはならない見本「${counterProbe}」にまで一致する（規則が広すぎる。` +
          '仮想の資料それ自体の説明まで禁じてしまう）'
      );
    }
  }

  const selftestPath = path.resolve(SELFTEST_SOURCE_PATH);
  if (!fs.existsSync(selftestPath)) {
    failures.push(`${SELFTEST_SOURCE_PATH} が存在しない（検査対象が失われた）`);
    return failures;
  }
  const selftestSource = fs.readFileSync(selftestPath, 'utf8');
  const doc = extractJsDocAbove(selftestSource, PARAGRAPH_BREAK_DOC_ANCHOR);
  if (doc === null) {
    failures.push(
      `${SELFTEST_SOURCE_PATH}: \`${PARAGRAPH_BREAK_DOC_ANCHOR}\` の直前の JSDoc を取り出せない` +
        '（宣言の綴りが変わったか散文が失われた。前提が崩れたので合格にしない）'
    );
    return failures;
  }

  for (const { label, pattern } of PROSE_REAL_DATA_CITATION_PATTERNS) {
    const hit = pattern.exec(doc);
    if (hit !== null) {
      failures.push(
        `${SELFTEST_SOURCE_PATH}: 段落の切れ目の散文が${label}「${hit[0]}」を挙げている。` +
          `実データとともに陳腐化するため、${RULE4_POPULATION_AUTHORITY_NAME} へ移すこと`
      );
    }
  }

  for (const name of [RULE4_POPULATION_AUTHORITY_NAME, RULE4_POPULATION_GUARD_NAME]) {
    if (!doc.includes(name)) {
      failures.push(
        `${SELFTEST_SOURCE_PATH}: 段落の切れ目の散文が指し先 ${name} を名乗っていない` +
          '（実データの母集団への導線が失われている）'
      );
    }
  }
  for (const declaration of [
    `const ${RULE4_POPULATION_AUTHORITY_NAME}`,
    `function ${RULE4_POPULATION_GUARD_NAME}(`,
  ]) {
    if (!selftestSource.includes(declaration)) {
      failures.push(
        `${SELFTEST_SOURCE_PATH} に \`${declaration}\` が無い（散文が実在しない名前を指している）`
      );
    }
  }

  return failures;
}

// ============================================================================
// 抽出器の限界の記述が挙げる実データの引用（タスク 115.254）
// ============================================================================

/**
 * 一本の禁止と、その禁止が捕まえるべき架空の見本
 *
 * 見本を規則と**一対一で持つ**。規則の束に対して見本を一つだけ置き「どれかが一致すれば
 * 良い」とすると、束の中の一本が壊れて何にも一致しなくなっても、他の一本が見本を拾って
 * 緑のままになる。本タスクが実測した: 束で一つの見本を持つ形のとき
 * `\d+\s*(?:件|箇所|印|ファイル)` を規則から外しても、同じ束の割合の規則が見本の `12.3%` を
 * 拾い、自己検査 69 件はすべて緑のままだった。一対一へ改めた後に同じ規則を壊す
 * （助数詞の `件` を別の字へ替える）と 69 件のうち 1 件が落ちる（2026-09-03 に
 * `npm run check:req-coverage:selftest` で実測）。
 */
interface RealDataCitationPattern {
  pattern: RegExp;
  /** この規則**だけ**が捕まえるべき架空の見本 */
  probe: string;
}

/**
 * 一種類の禁止（同じ趣旨の規則の束）
 *
 * `entries` の各 `probe` は禁じたい形の**架空の見本**、`counterProbes` は**禁じてはならない
 * 形**の見本である。前者だけを持つと規則が壊れて何にも一致しなくなったことに気付けず、
 * 後者だけを持つと規則が広がりすぎて正当な説明まで禁じるようになったことに気付けない
 * （115.253 が `PROSE_REAL_DATA_CITATION_PATTERNS` で据えた軸を踏襲する）。
 * `counterProbes` は束の**全ての**規則へ当てる——束の一本だけが広がる形を見逃さないため。
 */
interface RealDataCitationRule {
  label: string;
  /** 実データから作る規則は毎回組み立てる。静的な規則は固定の配列を返す */
  entries: (vocabulary: RealDataCitationVocabulary) => readonly RealDataCitationPattern[];
  counterProbes: readonly string[];
}

/**
 * 書式そのものの説明に使うため、禁止から外す架空の受入基準番号
 *
 * 限界の記述は被覆印の書式（`REQ-N.M`、`(feature/REQ-1.1, REQ-1.2)` の並び、
 * `(feature/REQ-1.1/REQ-2.2)` の連結）を説明する義務がある。ところが番号は要件定義書の
 * 番号付けの都合で若い番号ほど実在しやすく、書式の見本に使う番号もたいてい実在する。
 * よって**見本用に予約した番号だけを禁止から外す**。予約した番号は実在もするため、
 * その番号に限っては実データの引用も素通りする——本検査が意図して残す穴であり、
 * `checkExtractorLimitDocsCiteNoRealData` の限界の節に開示する。
 */
const RESERVED_ILLUSTRATION_CRITERION_NUMBERS: readonly string[] = ['1.1', '1.2', '2.2'];

/**
 * 書式そのものの説明に使うため、禁止から外す架空の要件レベルの番号
 *
 * 被覆印には受入基準を指す形（`N.M`）のほかに**要件全体を指す形**（`feature/REQ-N`）があり、
 * 限界の記述はその書式も説明できなければならない。予約した受入基準の番号
 * （{@link RESERVED_ILLUSTRATION_CRITERION_NUMBERS}）が属する要件をそのまま予約すれば、
 * 見本の並びが一つの要件の中で閉じる。予約した番号は実在もするため、その番号に限っては
 * 実データの引用も素通りする——{@link checkExtractorLimitDocsCiteNoRealData} の限界の節に
 * {@link DISCLOSED_CITATION_HOLES} として登録し、素通りし続けることを機械で確かめる。
 */
const RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS: readonly string[] = ['1'];

/** 実データから作る禁止の材料 */
interface RealDataCitationVocabulary {
  /** 要件定義書が実在する機能の名前 */
  featureNames: readonly string[];
  /** 被覆印を現に持つ実在のファイルの名前（ディレクトリを除いた部分） */
  markedFileNames: readonly string[];
  /** 要件定義書に実在する受入基準の局所番号（`N.M`）。見本用に予約した番号は除く */
  criterionNumbers: readonly string[];
  /** 要件定義書に実在する要件レベルの番号（`N`。枝つきの `NA` を含む）。見本用に予約した番号は除く */
  requirementNumbers: readonly string[];
}

/**
 * 実データから禁止の材料を集める
 *
 * 機能名・ファイル名・受入基準の番号を静的な正規表現で書くと、**架空の見本まで禁じてしまう**。
 * 限界の記述は書式そのものを説明する義務があり、架空の名前と番号は残せなければならない。
 * 実在する名前・番号だけを禁じ、見本用の番号を `RESERVED_ILLUSTRATION_CRITERION_NUMBERS` で
 * 予約すれば、その線が引ける。
 *
 * ファイル名は走査対象の全件（`listCoverageScanFiles`）ではなく**被覆印を現に持つ**ファイル
 * （`extractTestCoverage` が返す側）に絞る。陳腐化するのは「この番号がこのファイルに在る」
 * という引用であり、被覆印を一つも持たないファイルの名前はその引用になりえないためである。
 * 全件には入口名のような一般名が混じり、実データの引用でない散文まで禁じかねない。
 * **絞り込みが現に母集団を狭めていることは実例でなく機構で示す**——
 * `checkExtractorLimitDocsCiteNoRealData` が毎回、絞る前と後の両方を数えて
 * 「後が前の真部分集合であること」を確かめる。
 *
 * 本 JSDoc それ自体も `GUARDED_CITATION_DOCS` に載せて同じ禁止を掛けている。
 * 対策コードの説明文だけが実データの実例を持てる状態は、本タスクが根絶しようとしている
 * 欠陥そのものだからである（タスク 115.254 のレビューが差し戻した実例。ここに挙げていた
 * ファイル名は、絞り込みで除かれる例として**偽**であった——当該ファイルは被覆印を持つため
 * 絞り込み後にも残る）。
 */
function collectRealDataCitationVocabulary(): RealDataCitationVocabulary {
  const reserved = new Set(RESERVED_ILLUSTRATION_CRITERION_NUMBERS);
  const reservedRequirements = new Set(RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS);
  const criterionNumbers = new Set<string>();
  const requirementNumbers = new Set<string>();
  for (const feature of extractAllFeatures(discoverFeatures())) {
    for (const requirement of [...feature.requirements, ...feature.retiredRequirements]) {
      const requirementLocal = requirement.id.replace(/^REQ-/, '');
      if (!reservedRequirements.has(requirementLocal)) requirementNumbers.add(requirementLocal);
      for (const criterion of [
        ...requirement.acceptanceCriteria,
        ...requirement.retiredAcceptanceCriteria,
      ]) {
        const local = criterion.id.slice(criterion.id.lastIndexOf('/') + 1).replace(/^REQ-/, '');
        if (!reserved.has(local)) criterionNumbers.add(local);
      }
      for (const number of requirement.letteredCriterionNumbers) {
        const local = `${requirement.id.replace(/^REQ-/, '')}.${number}`;
        if (!reserved.has(local)) criterionNumbers.add(local);
      }
    }
  }
  return {
    featureNames: discoverFeatures(),
    markedFileNames: [
      ...new Set(extractTestCoverage(discoverFeatures()).map((entry) => path.basename(entry.file))),
    ].sort(),
    criterionNumbers: [...criterionNumbers].sort(),
    requirementNumbers: [...requirementNumbers].sort(),
  };
}

/**
 * 台帳の見本が使う先頭要素
 *
 * 空配列は別の失敗（材料が一件も集まらない）が先に報告するため、ここでは空文字へ倒す。
 */
function firstOf(values: readonly string[]): string {
  return values[0] ?? '';
}

/** 正規表現のメタ文字を素の字面として扱う */
function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 受入基準の番号を「点以外の一字」で区切って書いた形のうち、禁止に載せる区切り
 *
 * `24-1` の形（`.` を別の一字へ替えただけの書き直し）は 115.254 の禁止を素通りした
 * （同タスクのレビューが round 2 で実測）。区切りを何字まで禁じるかは**巻き込みの実測**で
 * 決めた。台帳が読む記述（現況 4 件）ではどの区切りも巻き込みが 0 箇所であり、そこだけを
 * 見ても差が付かない。そこで台帳の外——`npm run check:req-coverage:citesurvey` が宣言する
 * 母集団——へ同じ規則を当てて数えた。
 *
 * **載せた理由は「巻き込みが少ない」でも「巻き込みを書き直せる」でもない。** 載せた `-` は
 * 母集団の中で最も多く巻き込む字であり、その中身は範囲の書き方だけではない——同コマンドの
 * ファイル別の内訳と見本を読むと、自己検査の対照名（段番号を持つ識別子）・
 * `scripts/design-measurements.json` の宣言 ID・正規表現の文字クラス・本タスクの記録が
 * 並べた見本が混ざる。**このうち宣言 ID は書き直せない**——書き直すと
 * `npm run check:design-measurement-freshness` が錨を失う。
 *
 * **載せた本当の理由は二つである。** (1) `-` は起票が名指した素通りの形そのものであり、
 * 塞がなければ落とした引用をこの区切りで書き直すだけで同じ時限装置が同じ箇所へ戻る。
 * (2) 関門が実際に読むのは {@link GUARDED_CITATION_DOCS} が挙げる記述だけで、そこでの
 * 巻き込みは 0 箇所である——**今は無料である。** `_` と `．` も同じ理由で載せた。
 *
 * **無料でなくなるのは台帳を広げるときである。** そのとき書き直せない箇所（宣言 ID・
 * 文字クラス）に当たったら、その箇所を個別に免除するか、この区切りを
 * {@link EXCLUDED_CRITERION_NUMBER_SEPARATORS} へ移すかを、内訳を数え直してから決めること。
 * **数値をここへ写さないのは、写した瞬間に同期する機構の無い二重帳簿になるためである**
 * ——記録を書き足す行為そのものがこの数を動かす。
 */
const CITED_CRITERION_NUMBER_SEPARATORS: readonly string[] = ['-', '_', '．'];

/**
 * 同じ「点以外の区切り」のうち、禁止に載せなかった区切り
 *
 * **外して数えてから決めた**（除外の理由も反実仮想である、という開発規律に従う）。
 * `npm run check:req-coverage:citesurvey` が、載せた区切りと載せなかった区切りの両方に
 * ついて、母集団・巻き込み・ファイル別の内訳・見本を印字する。
 *
 * **載せなかった理由は「素通りの形として実証されていないこと」である。** 115.254 の
 * レビューが実際に挿入して素通りを実証したのは点と `-` の形だけで、ここに挙げた五字は
 * 本タスクが見本を作って素通りを確かめた形にとどまる。加えて巻き込みの中身が、この
 * 母集団が多用する記法である——`/` と `／` は比の書き方、`,` は正規表現リテラルの
 * 繰り返し指定、`・` と空白は数の並記である。**「書き直せないこと」は理由にしない**
 * ——書き直せない巻き込み（宣言 ID・正規表現の文字クラス）は載せた `-` の側にも在り、
 * その線引きは成立しないことを実測で確かめた。
 *
 * ここに挙げた区切りは塞がない。**塞がないことと書かないことは別である**（115.242）ため、
 * 素通りする見本を {@link DISCLOSED_CITATION_HOLES} へ登録し、素通りし続けることを
 * 機械で確かめる。塞ぐ判断へ変えるときは、まず同コマンドで巻き込みを測り直すこと。
 */
const EXCLUDED_CRITERION_NUMBER_SEPARATORS: readonly string[] = ['/', '／', '・', ',', ' '];

/**
 * 限界の記述に置いてはならない「実データとともに陳腐化する形」
 *
 * 115.223 が `resolveHeaderSectionEnd` の説明文へ課した全面禁止（`REQ-\d+` と `\d+ 件`）は
 * **ここへは持ち込めない**。限界の記述は被覆印の書式そのものを説明する義務があり、
 * 全面禁止はその説明ごと禁じる。よって**実データを指す形だけ**を禁じる。
 */
const REAL_DATA_CITATION_RULES: readonly RealDataCitationRule[] = [
  {
    label: '実在する機能名を冠した被覆印',
    entries: ({ featureNames }) =>
      featureNames.map((name) => ({
        pattern: new RegExp(`${escapeForRegExp(name)}/REQ-\\d`),
        probe: `${name}/REQ-1.2 が落ちる`,
      })),
    counterProbes: [
      '`(feature/REQ-1.1, REQ-1.2)` の二つ目以降',
      '`REQ-N.M` としてしか書けず',
      '被覆印は `REQ-1.1` の形で書く',
    ],
  },
  {
    label: '被覆印を持つ実在のファイルの名前',
    entries: ({ markedFileNames }) =>
      markedFileNames.map((name) => ({
        pattern: new RegExp(escapeForRegExp(name)),
        probe: `${name} の被覆印`,
      })),
    counterProbes: ['`some-feature.spec.ts` のような検証ファイル', 'requirements.md の受入基準'],
  },
  {
    label: '実データの計数',
    entries: () => [
      { pattern: /\d+\s*(?:件|箇所|印|ファイル)/, probe: '写しを持つ区間は 999 件であり' },
      { pattern: /\d+(?:\.\d+)?\s*%/, probe: '守備範囲は 12.3% にとどまる' },
    ],
    counterProbes: [
      '語句が 11 文字未満、または `1a.` `4b.` の形',
      'タスク 115.254 が一箇所ずつ決着させた',
      '件数と全件の列挙つきで毎回印字する',
    ],
  },
  {
    label: '実測値の引用',
    entries: () => [
      { pattern: /実測[^。]{0,60}?\d/, probe: '実測では本稿の時点で 3 つが残っている' },
    ],
    counterProbes: ['実測は検査の出力が毎回印字する', '測り直した時点でもなお真であった'],
  },
  {
    // 機能名の接頭辞を落とせば禁止を抜けられる形（`REQ-24.1 が残っている`）を塞ぐ。
    // 前後に数字が続く形（`115.254` の中の `5.254`）は別の数なので除く——
    // 抽出器の `proseAttributesCriterion` が番号の同定に使うのと同じ境界の取り方である。
    label: '実在する受入基準の番号',
    entries: ({ criterionNumbers }) =>
      criterionNumbers.map((number) => ({
        pattern: new RegExp(`(?<![0-9.])${escapeForRegExp(number)}(?![0-9])`),
        probe: `現況では REQ-${number} がこの外に残っている`,
      })),
    counterProbes: [
      '`(feature/REQ-1.1, REQ-1.2)` の二つ目以降',
      '`(feature/REQ-1.1/REQ-2.2)` のような連結',
      '被覆印は `REQ-N.M` としてしか書けず',
      '`1a.` `4b.` のように英字の枝を持つ番号',
      'タスク 115.254 のレビューが差し戻した',
    ],
  },
  {
    // 受入基準の局所番号（`N.M`）を禁じても、`.M` を落とした要件レベルの番号（`REQ-24` の形）
    // は素通りした（115.254 のレビューが round 2 で実測。115.306 が塞いだ）。
    // **接頭辞 `REQ-` を必ず要求する**——要件レベルの番号は裸では 1 桁から 2 桁の数でしかなく、
    // 裸で禁じると散文の数値がことごとく巻き込まれる。接頭辞を伴わない形は塞げないため
    // `DISCLOSED_CITATION_HOLES` へ登録して素通りし続けることを機械で固定する。
    // 後ろに数字と点を許さないのは `REQ-1.1`（書式の見本）と `REQ-16A` の基底を巻き込まないため。
    label: '実在する要件レベルの番号',
    entries: ({ requirementNumbers }) =>
      requirementNumbers.map((number) => ({
        pattern: new RegExp(`REQ-${escapeForRegExp(number)}(?![0-9.])`),
        probe: `現況では REQ-${number} の被覆印がこの外に残っている`,
      })),
    counterProbes: [
      '被覆印は `REQ-N.M` としてしか書けず',
      '`(feature/REQ-1.1, REQ-1.2)` の二つ目以降',
      '`(feature/REQ-1.1/REQ-2.2)` のような連結',
      '要件全体を指す被覆印は `feature/REQ-1` の形で書く',
    ],
  },
  {
    // 点以外の一字で区切った書き直し（`24-1` の形）も素通りした（同上）。
    // 区切りの集合は `CITED_CRITERION_NUMBER_SEPARATORS` が持ち、除いた区切りは
    // `DISCLOSED_CITATION_HOLES` が理由つきで登録する。
    label: '点以外の区切りで書いた受入基準の番号',
    entries: ({ criterionNumbers }) =>
      criterionNumbers.flatMap((number) => {
        const dot = number.indexOf('.');
        if (dot < 0) return [];
        const head = escapeForRegExp(number.slice(0, dot));
        const tail = escapeForRegExp(number.slice(dot + 1));
        return CITED_CRITERION_NUMBER_SEPARATORS.map((separator) => ({
          pattern: new RegExp(`(?<![0-9.])${head}${escapeForRegExp(separator)}${tail}(?![0-9])`),
          probe: `現況では ${number.slice(0, dot)}${separator}${number.slice(dot + 1)} の被覆印がこの外に残っている`,
        }));
      }),
    counterProbes: [
      '被覆印は `REQ-N.M` としてしか書けず',
      '`1a.` `4b.` のように英字の枝を持つ番号',
      '`(feature/REQ-1.1, REQ-1.2)` の二つ目以降',
      'タスク 115.254 のレビューが差し戻した',
    ],
  },
];

/**
 * 禁止が捕まえ続けなければならない形（能力の側の固定）
 *
 * 規則と見本を一対一で照合しても、**規則を丸ごと削る**変異は捕まらない——削ると見本も
 * 一緒に消えるからである。本台帳を置く前に実測した: 助数詞の規則とその見本を組ごと外すと
 * 自己検査 69 件はすべて緑のままだった。本台帳を置いた後に同じ変異を当てると 69 件のうち
 * 1 件が「この外に 3 件が残っている」を捕まえられないとして落ちる（2026-09-03 に
 * `npm run check:req-coverage:selftest` で実測）。ここは「どの形を捕まえられなければ
 * ならないか」を規則の実装から独立に固定する。
 *
 * 各項目は**その label の規則が**捕まえることを求める。他の規則が偶然拾っても合格にしない。
 * 実データの名前は毎回の実測から組み立てるため、名前が変わっても陳腐化しない。
 */
const MUST_DETECT_CITATIONS: ReadonlyArray<{
  /** 捕まえる責任を負う規則の label */
  label: string;
  text: (vocabulary: RealDataCitationVocabulary) => string;
}> = [
  {
    label: '実在する機能名を冠した被覆印',
    text: ({ featureNames }) => `実際に ${featureNames[0]}/REQ-1.1 のような番号を名乗っている`,
  },
  {
    label: '被覆印を持つ実在のファイルの名前',
    text: ({ markedFileNames }) => `${markedFileNames[0]} が名乗っている`,
  },
  { label: '実データの計数', text: () => 'この外に 3 件が残っている' },
  { label: '実データの計数', text: () => '守備範囲は 12.3% にとどまる' },
  { label: '実測値の引用', text: () => '実測でこの形は 2 つあった' },
  {
    // 機能名の接頭辞を落とした書き直し。レビューが「守られている記述へ挿入しても素通りする」
    // ことを実証した形そのものである（タスク 115.254 の差し戻し 1 回目）
    label: '実在する受入基準の番号',
    text: ({ criterionNumbers }) => `現況では REQ-${criterionNumbers[0]} がこの外に残っている`,
  },
  {
    // `.M` を落とした書き直し。115.254 のレビューが round 2 で「守られている記述へ挿入しても
    // 素通りする」ことを実証した形である（タスク 115.306 が塞いだ）
    label: '実在する要件レベルの番号',
    text: ({ requirementNumbers }) =>
      `現況では REQ-${requirementNumbers[0]} の被覆印がこの外に残っている`,
  },
  {
    // 区切りを点から別の一字へ替えた書き直し。上と同じ round で実証された（同上）
    label: '点以外の区切りで書いた受入基準の番号',
    text: ({ criterionNumbers }) =>
      `現況では ${firstOf(criterionNumbers).replace('.', firstOf(CITED_CRITERION_NUMBER_SEPARATORS))} の被覆印がこの外に残っている`,
  },
];

/** 塞がないと決めた素通りの形。開示の側を機械で固定する */
interface DisclosedCitationHole {
  /** 後任が起票と突き合わせるための名前 */
  label: string;
  /** 素通りすることを示す架空の見本。どの禁止にも一致してはならない */
  sample: (vocabulary: RealDataCitationVocabulary) => string;
  /**
   * 限界の記述が**逐語で**述べていなければならない綴り
   *
   * 台帳と散文を突き合わせる錨。台帳に登録した穴を散文が述べていなければ赤くなる
   */
  discloseAs: string;
  /** なぜ塞がないか（115.242「塞がないことと書かないことは別」） */
  rationale: string;
}

/**
 * 塞がないと決めた素通りの形の台帳（開示の側の対照群）
 *
 * `MUST_DETECT_CITATIONS` が「捕まえ続けなければならない形」を固定するのに対し、本台帳は
 * **「素通りし続けることを開示した形」**を固定する。二方向を揃える理由は二つある。
 *
 *   1. 穴を後から塞いだのに開示を直さない、という向きの漂流を止める。塞いだ瞬間に見本が
 *      禁止へ一致して赤くなり、開示の書き換えを強制する
 *   2. 開示の散文と台帳が別々の真実を持たないようにする。各項の `discloseAs` は
 *      {@link checkExtractorLimitDocsCiteNoRealData} の JSDoc に逐語で在らねばならない
 *
 * **本台帳は「穴の全部」ではない。** 綴りで判定する禁止に完全な一致は無く、ここに挙がるのは
 * タスク 115.306 が実際に見本を当てて素通りを確かめた形だけである。
 */
const DISCLOSED_CITATION_HOLES: readonly DisclosedCitationHole[] = [
  {
    label: '接頭辞 `REQ-` を伴わない要件レベルの番号',
    sample: ({ requirementNumbers }) =>
      `現況では要件 ${requirementNumbers[0]} がこの外に残っている`,
    discloseAs: '接頭辞 `REQ-` を伴わない要件レベルの番号',
    rationale:
      '塞げない。要件レベルの番号は裸では 1 桁から 2 桁の数でしかなく、裸で禁じると散文の' +
      '数値がことごとく巻き込まれる。受入基準の番号（`N.M`）が裸でも禁じられるのは、' +
      '点を挟む二つ組が散文の数値と紛れにくいためである',
  },
  {
    label: '禁止に載せなかった区切りで書いた受入基準の番号',
    sample: ({ criterionNumbers }) =>
      `現況では ${firstOf(criterionNumbers).replace('.', firstOf(EXCLUDED_CRITERION_NUMBER_SEPARATORS))} がこの外に残っている`,
    discloseAs: '禁止に載せなかった区切り',
    rationale:
      '塞がない。EXCLUDED_CRITERION_NUMBER_SEPARATORS の各字はいずれも巻き込みが 0 件では' +
      'なく、比の書き方・正規表現リテラル・数の並記を巻き込む。母集団と巻き込みは' +
      'npm run check:req-coverage:citesurvey が毎回印字する',
  },
  {
    label: '見本用に予約した番号',
    sample: () =>
      `現況では REQ-${RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS[0]} と REQ-${RESERVED_ILLUSTRATION_CRITERION_NUMBERS[0]} がこの外に残っている`,
    discloseAs: '見本用に予約した番号',
    rationale:
      '意図して残す穴である。書式そのものを説明する義務があり、見本に使う番号を禁じると' +
      '説明ごと禁じることになる。予約した番号は実在もするため、その番号に限っては' +
      '実データの引用も素通りする',
  },
  {
    label: '半角の算用数字で書かれていない番号',
    sample: () => '現況では ２４.１ と二四・一がこの外に残っている',
    discloseAs: '半角の算用数字で書かれていない番号',
    rationale:
      '塞がない。実データから組み立てる番号は半角の算用数字であり、全角や漢数字へ写した形は' +
      '綴りが一致しない。正規化してから照合する形は、正規化した文字列の位置が原文と' +
      '対応しなくなるため採らなかった。この形で被覆印を書く経路が実在しないことは' +
      '確かめていない',
  },
  {
    label: '点のあとに空白を挟む形',
    sample: ({ criterionNumbers }) =>
      `現況では ${firstOf(criterionNumbers).replace('.', '. ')} がこの外に残っている`,
    discloseAs: '点のあとに空白を挟む形',
    rationale:
      '塞がない。番号順の一覧（`24.` に続く本文が数字で始まる形）と字面が同じであり、' +
      '禁じると正当な一覧を巻き込む。区切りは一字に限るという線をここでも引く',
  },
  {
    label: 'ファイル名を略した書き方',
    sample: ({ markedFileNames }) =>
      `現況では ${firstOf(firstOf(markedFileNames).split('.'))} が名乗っている`,
    discloseAs: 'ファイル名を略した書き方',
    rationale:
      '塞がない。タスク 115.254 が置いた線をそのまま引き継ぐ。拡張子を落とした綴りは' +
      '一般名と区別できず、禁じると実データの引用でない散文まで巻き込む',
  },
  {
    label: '`件`・`箇所`・`印`・`ファイル` 以外の助数詞',
    sample: () => '現況では 3 つがこの外に残っている',
    discloseAs: '`件`・`箇所`・`印`・`ファイル` 以外の助数詞',
    rationale:
      '塞がない。助数詞は開いた集合であり、列挙で塞ぐ形には終わりが無い。' +
      'タスク 115.254 が四つを選んだ線をそのまま引き継ぐ',
  },
  {
    // 本タスクのレビューが 25 形の外側で見つけた四形（末尾の点・非実在の枝・大小文字・
    // 接頭辞のあとの空白）。いずれも要件レベルの規則の綴りの縁を外れる
    label: '要件レベルの番号の書き方の揺れ',
    sample: ({ requirementNumbers }) =>
      `現況では REQ-${firstOf(requirementNumbers)}. と REQ-${firstOf(requirementNumbers)}.999 と req-${firstOf(requirementNumbers)} と REQ ${firstOf(requirementNumbers)} がこの外に残っている`,
    discloseAs: '要件レベルの番号の書き方の揺れ',
    rationale:
      '塞がない。末尾の点は `(?![0-9.])` に掛かり、非実在の枝を足した形は実在の番号と' +
      '綴りが一致せず、小文字と接頭辞のあとの空白は綴りそのものが違う。いずれも' +
      '縁を緩めると書式の見本（`REQ-N.M` の説明）を巻き込むため、緩める前に' +
      'counterProbes の側で費用を測ること',
  },
];

/**
 * 塞がないと決めた形の件数の下限（遊びを持たせない。上回っても下回っても赤くする）
 *
 * 台帳を空にする抜け道は「一件も登録されていない」で塞いであるが、**7 項から 1 項へ縮める
 * 変異は完全に無言で通った**（本タスクのレビューが実測）。開示は縮めても関門が黙るため、
 * 件数を定数で固定する。115.298 が対照群の下限へ課したのと同じ「遊び 0」の形である。
 * **増やす向きも減らす向きも定数の書き換えを伴うため、件数は差分に必ず現れる。**
 */
const MINIMUM_DISCLOSED_CITATION_HOLES = 8;

/** 限界の記述の一つ。判断の根拠とともに台帳へ載せる */
interface GuardedCitationDoc {
  /** 後任が起票と突き合わせるための名前 */
  label: string;
  /** 記述が在るファイル（抽出器の側とは限らない。対策コード自身も対象になる） */
  sourcePath: string;
  /** JSDoc を取り出す起点（この宣言の直前の JSDoc を見る） */
  anchor: string;
  /** 散文が名乗らなければならない導線（実データの現況を毎回出す側の名前） */
  mustName: readonly string[];
  /**
   * 散文が名乗らなければならない導線のうち、**本自己検査の側に在る**もの
   *
   * `mustName` は `sourcePath` と同じファイルに実在することを課す。引用を機械へ移した箇所は
   * 導線が自己検査の関数になるため、その形では実在を確かめられない（タスク 115.307）。
   * 空でよい——空なら何も課さない。
   */
  mustNameInGuard?: readonly string[];
  /** なぜ引用を落としたか／どこへ移したか。一箇所ずつの判断を残す */
  rationale: string;
}

/**
 * 実データの引用を落とし、現況の出所への導線だけを残す限界の記述（唯一の出所）
 *
 * タスク 115.223 は区間判定の説明文だけを是正し、同じファイルに残る箇所は報告に留めた。
 * 本台帳はその残りを一件ずつ決着させた結果である（115.254 が四箇所、115.307 が
 * さらに五箇所）。判断は二択（機械で確かめる形へ移すか、引用を落とすか）で、
 * いずれを採ったかを `rationale` に書き残す。**件数は
 * {@link MINIMUM_GUARDED_CITATION_DOCS} が遊び 0 で固定するため、ここには書かない。**
 *
 * **対策コード自身の説明文も載せる。** 禁止を書く側の散文だけが実データの実例を持てる状態は、
 * 本タスクが根絶しようとしている欠陥そのものである（タスク 115.254 のレビューが差し戻した）。
 */
const GUARDED_CITATION_DOCS: readonly GuardedCitationDoc[] = [
  {
    label: '枝つき番号の基底（Requirement.letteredCriterionNumbers）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'letteredCriterionNumbers: number[];',
    mustName: ['collectOutOfDenominatorMarks'],
    rationale:
      '引用を落とした。挙げていた実例は、検査本体が毎回印字する「枝つき番号」の行' +
      '（collectOutOfDenominatorMarks の lettered）の写しであり、同期する機構の無い二重帳簿' +
      'だった。現況はその出力が列挙する',
  },
  {
    label: '要件定義書に存在しない番号（findUnknownCriterionCoverageMarks）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export function findUnknownCriterionCoverageMarks(',
    mustName: ['collectOutOfDenominatorMarks'],
    rationale:
      '引用を落とした。挙げていた三つの被覆印も走査根の外という区分も、検査本体が毎回' +
      '印字する「要件定義書に存在しない番号」の行と「うち走査根の配下」の行が列挙する。' +
      '散文はその写しにすぎなかった',
  },
  {
    label: '逐語複製の限界（CriterionTextCopyReport）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export interface CriterionTextCopyReport {',
    mustName: ['reportCriterionTextCopies', 'exemptedByProseAttribution'],
    rationale:
      '機械で確かめる形へ移した。散文帰属による免除の件数は検査自身が測れるため' +
      'exemptedByProseAttribution として報告へ足し、毎回印字する。読み取り規則に載らない' +
      '書き方の件数だけは既存の検出器では測れないため、その一件は引用を落とした',
  },
  {
    label: '禁止の材料の集め方（collectRealDataCitationVocabulary。本自己検査の側）',
    sourcePath: SELFTEST_SOURCE_PATH,
    anchor: 'function collectRealDataCitationVocabulary(): RealDataCitationVocabulary {',
    mustName: ['listCoverageScanFiles', 'extractTestCoverage'],
    rationale:
      '引用を落とし、主張を機構へ移した。絞り込みの理由を実在のファイル名で例示していたが、' +
      'その名前は被覆印を持つため絞り込み後にも残り、例として偽であった（レビューの実測）。' +
      '実例を落とし、絞る前と後の母集団を毎回数えて真部分集合であることを確かめる形にした',
  },
  {
    label: '撤廃済みでない番号違いの数（findRetiredCriterionCoverageMarks）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export function findRetiredCriterionCoverageMarks(',
    mustName: ['collectOutOfDenominatorMarks'],
    rationale:
      '引用を落とした（タスク 115.307）。挙げていた数は、検査本体が毎回印字する' +
      '「要件定義書に存在しない番号」の行の写しであり、同期する機構の無い二重帳簿だった。' +
      '測り直した時点で既に偽であった',
  },
  {
    label: '逐語複製の目印の最小長（MIN_CRITERION_QUOTE_LENGTH）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export const MIN_CRITERION_QUOTE_LENGTH = 11;',
    mustName: ['reportCriterionTextCopies'],
    mustNameInGuard: ['checkCriterionQuote'],
    rationale:
      '引用を落とした（タスク 115.307）。挙げていた「偶然の一致」の数は、閾値を下げれば ' +
      'reportCriterionTextCopies の mismatches として毎回印字される値そのものであり、' +
      '同期する機構の無い二重帳簿だった。閾値を下げる変異で測り直したところ、' +
      '散文が名乗る走査根での値とも、散文が名乗る閾値での値とも食い違っていた。' +
      '定数の値と境界の挙動は checkCriterionQuote が字面で固定しており、そちらは残す。' +
      'タスク 115.309 が閾値を一つ下げ、あわせて限界の量そのもの（効いている閾値と、' +
      '閾値に届かず目印にできない条文の数）を minQuoteLength / criteriaBelowMinLength として' +
      '報告へ足した。散文へ写さず出力で測る作法はここでも同じである',
  },
  {
    label: '行の途中で開くフェンスの取りこぼし（isCodeFenceDelimiterLine）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export function isCodeFenceDelimiterLine(line: string): boolean {',
    mustName: ['listCoverageScanFiles', 'ANY_COVERAGE_HEADER_REGEX'],
    mustNameInGuard: ['checkMidLineFenceFilesCarryNoCoverageHeader'],
    rationale:
      '機械で確かめる形へ移した（タスク 115.307）。挙げていた計数は測り直した時点でも真で' +
      'あったが、真であることを見る機構が無く、印字する導線も無かった——落とすだけでは' +
      '「この抜けが発火していない」という主張ごと失われる。走査を ' +
      'checkMidLineFenceFilesCarryNoCoverageHeader として自己検査へ移し、散文からは計数を落とした',
  },
  {
    label: '末尾の註釈を散文に含めない理由（splitCoverageBlocks）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export function splitCoverageBlocks(',
    mustName: ['reportCriterionTextCopies'],
    rationale:
      '引用を落とした（タスク 115.307）。挙げていた偽陽性の数は、末尾を切る一行を外す変異を' +
      '当てれば reportCriterionTextCopies の mismatches として毎回印字される値であり、' +
      '同期する機構の無い二重帳簿だった。その変異で測り直したところ桁で食い違っていた。' +
      '切ること自体は既存の対照が押さえている（同じ変異で自己検査が赤くなることを実測した）',
  },
  {
    label: '分子を分母との交わりで数える理由（calculateCoverage）',
    sourcePath: EXTRACTOR_SOURCE_PATH,
    anchor: 'export function calculateCoverage(',
    mustName: ['collectOutOfDenominatorMarks'],
    rationale:
      '引用を落とし、あわせて注記を本体の行コメントから JSDoc へ引き上げた（タスク 115.307）。' +
      '行コメントのままでは本台帳の関門が読めない——読めない場所に置かれた引用は、' +
      '禁止を掛けたつもりで素通りする。挙げていた三つの値は「数え方の整合」の行として' +
      '毎回印字される値の写しであり、是正前の形を再現して測り直したところ' +
      'いずれも食い違っていた（不等号の向きだけは今日も成り立つ）',
  },
];

/**
 * 守る限界の記述の件数の下限（遊びを持たせない。上回っても下回っても赤くする）
 *
 * 台帳を空にする抜け道は「一件も登録されていない」で、**禁止を書く側**が落ちる形は必須の
 * ファイルの照合で塞いであるが、**抽出器側の一件だけを黙って外す変異はどちらにも掛からない**
 * （タスク 115.307）。開示の側へ {@link MINIMUM_DISCLOSED_CITATION_HOLES} が置いたのと同じ
 * 「遊び 0」を、守る側へも置く。**増やす向きも減らす向きも定数の書き換えを伴うため、
 * 件数は差分に必ず現れる。**
 */
const MINIMUM_GUARDED_CITATION_DOCS = 9;

/** 本検査それ自体の名前。限界の記述が「守り手」として名乗る */
const LIMIT_DOC_GUARD_NAME = 'checkExtractorLimitDocsCiteNoRealData';

/** 守り手の側の本文（`mustNameInGuard` の実在を確かめるために読む。読めなければ null） */
function readGuardSource(): string | null {
  const absolute = path.resolve(SELFTEST_SOURCE_PATH);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
}

/**
 * 抽出器の限界の記述が、実データの名指しと計数を持たず、現況の出所を名乗っている
 *
 * 限界の記述（「この検査が捕まえないもの」）は、非空振りを示すために実データの実例を
 * 引きがちである。引いた実例は実データとともに陳腐化し、陳腐化しても機械は何も言わない。
 *
 * 見るのは九つである。
 *
 *   1. 台帳・禁止規則・実データから作る材料のいずれも空でないこと（第3原則。空にして
 *      緑にする抜け道を作らない）
 *   2. ファイル名の絞り込みが現に母集団を狭めていること——絞る前の名前の集合を数え、
 *      絞った後がその真部分集合であることを確かめる。絞る理由を散文の実例で述べると、
 *      挙げた名前が被覆印を得た瞬間に例として偽になる（タスク 115.254 のレビューが
 *      差し戻した実例）
 *   3. 各規則が**自分の**見本に一致し、禁じてはならない見本のいずれにも一致しないこと
 *      （幅を両側から固定する。片側だけでは空振りにも広がりすぎにも気付けない）
 *   4. `MUST_DETECT_CITATIONS` の各形を、責任を負う規則が捕まえること
 *      （規則を丸ごと削る変異は 3 では捕まらない。能力の側を独立に固定する）
 *   5. 各記述が取り出せること（宣言の綴りが変わった・JSDoc が消えたら失格）
 *   6. 各記述が実データを指す形を一つも挙げていないこと
 *   7. 各記述が名乗る導線が、その記述と同じファイルに実在すること
 *   8. `DISCLOSED_CITATION_HOLES` の各見本が**どの禁止にも一致しない**こと、および
 *      各項の綴りが本 JSDoc に逐語で在ること（開示の側の対照。塞いだのに開示を直さない
 *      向きの漂流と、台帳と散文が別々の真実を持つ向きの漂流の双方を止める）
 *   9. 台帳の件数が {@link MINIMUM_GUARDED_CITATION_DOCS} ちょうどであること（守る側の対照。
 *      1 と必須ファイルの照合は「両方のファイルが一件ずつ残っていれば緑」であり、
 *      **残りを黙って外す変異を止められなかった**。開示の側と同じ遊び 0 を守る側へも置く）
 *
 * **導線の実在も両側で見る。** `mustName` は記述と同じファイルに、`mustNameInGuard` は
 * 本自己検査の側に、それぞれ `function <名前>(` として在ることを課す。引用を機械へ移した
 * 箇所は導線が自己検査の関数になるため、片側だけでは名前の腐りを止められない
 * （タスク 115.307）。
 *
 * **守れない範囲を明記する。** 見るのは台帳が挙げる記述だけであり、他の JSDoc は見ていない
 * （そちらへ広げる判断は、`check:cf-evidence` が引用を要求する反実仮想と衝突しないかを
 * 一箇所ずつ測ってから行うこと。全面禁止は抽出器にも本自己検査にも当てられない）。
 * 禁じる形にも穴がある。**下の八つは {@link DISCLOSED_CITATION_HOLES} に見本つきで登録して
 * あり、後から塞いだのに開示が古いまま残ると赤くなる**（開示の側の対照。上の 8）。
 * 件数は {@link MINIMUM_DISCLOSED_CITATION_HOLES} が遊び 0 で固定する。
 * **これで穴を数え上げたとは言えない**——挙げてあるのは、タスク 115.306 が見本を実際に
 * 挿入して素通りを確かめた形だけである（同タスクの走査。捕まった形と素通りした形の内訳は
 * `.kiro/specs/site-survey/design.md` の当該節に置いた。**同タスクのレビューが、その走査の
 * 外側でさらに四形の素通りを見つけている**——下の最後の項がそれを引き取ったものである）。
 *
 *   - ファイル名を略した書き方（`some-feature.spec.ts` を `some-feature` と書く形）
 *   - 実データの日付、`件`・`箇所`・`印`・`ファイル` 以外の助数詞
 *   - 見本用に予約した番号（`RESERVED_ILLUSTRATION_CRITERION_NUMBERS` と
 *     `RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS`）。これらは実在もするため、その番号に
 *     限っては実データの引用も素通りする。書式の説明を残すための意図した穴である
 *   - 接頭辞 `REQ-` を伴わない要件レベルの番号（`要件 24` の形）。要件レベルの番号は裸では
 *     1 桁から 2 桁の数でしかなく、裸で禁じると散文の数値がことごとく巻き込まれる
 *   - 禁止に載せなかった区切りで書いた番号（`EXCLUDED_CRITERION_NUMBER_SEPARATORS`）。
 *     いずれも巻き込みが 0 箇所ではない——母集団と巻き込みは
 *     `npm run check:req-coverage:citesurvey` が毎回印字する
 *   - 半角の算用数字で書かれていない番号（全角・漢数字。正規化してから照合する形は採らない）
 *   - 点のあとに空白を挟む形（`24. 1`）。番号順の一覧と字面が同じになる
 *   - 要件レベルの番号の書き方の揺れ（末尾に点を置く形・実在の要件に非実在の枝を足した形・
 *     小文字で書く形・接頭辞のあとに空白を置く形）。縁を緩めると書式の見本を巻き込む
 *
 * **番号を書き替えて禁止を抜ける三つの形は塞いである。** いずれも「守られている記述へ
 * 挿入すると自己検査が緑のまま通る」ことをレビューが実測した形であり、順に潰した。
 *
 *   1. **機能名の接頭辞を落とす**（`REQ-24.1` の形。タスク 115.254）。差し戻しの前は
 *      この形が素通りし、`:1082-1083` から落とした引用を接頭辞なしで書き直すだけで同じ
 *      時限装置を同じ箇所へ戻せた。`実在する受入基準の番号` の規則を足した後に同じ挿入を
 *      当てると 69 件のうち 1 件が落ちる（2026-09-03 に
 *      `npm run check:req-coverage:selftest` で実測。当時の総数は 69 件であった）
 *   2. **`.M` を落として要件レベルにする**（`REQ-24` の形。タスク 115.306）。
 *      `実在する要件レベルの番号` の規則を足す前は、`collectRealDataCitationVocabulary` の
 *      JSDoc へ `現況では REQ-24 の被覆印がこの外に残っている` を挿入しても
 *      すべてが緑であった（当時の総数は 73 件）。足した後に同じ挿入を当てると
 *      74 件のうち 1 件が落ちる（2026-09-06 に同コマンドで実測。タスク 115.307 が
 *      確認を一件足したため、同日の再実測で総数は 73 件から 74 件へ動いている）
 *   3. **区切りを点から別の一字へ替える**（`24-1` の形。タスク 115.306）。
 *      `点以外の区切りで書いた受入基準の番号` の規則を足す前は、同じ JSDoc へ
 *      `現況では 24-1 の被覆印がこの外に残っている` を挿入してもすべてが緑であった
 *      （当時の総数は 73 件）。足した後に同じ挿入を当てると 74 件のうち 1 件が落ちる
 *      （同日・同コマンドで実測。総数の動きの理由は上に同じ）
 *
 * 広げるときは `REAL_DATA_CITATION_RULES` と `GUARDED_CITATION_DOCS` へ足し、塞いだ穴を
 * `DISCLOSED_CITATION_HOLES` から外す。
 */
function checkExtractorLimitDocsCiteNoRealData(): string[] {
  const failures: string[] = [];

  if (GUARDED_CITATION_DOCS.length === 0) {
    return ['守る限界の記述が一件も登録されていない（台帳を空にして緑にする抜け道）'];
  }
  // 台帳から一件だけ落とす変異は「空でない」では捕まらない。守るべき側の下限を固定する。
  // とりわけ**禁止を書く側**（本自己検査）の記述が落ちる形は、差し戻しの直接の原因だった
  for (const required of [EXTRACTOR_SOURCE_PATH, SELFTEST_SOURCE_PATH]) {
    if (!GUARDED_CITATION_DOCS.some((entry) => entry.sourcePath === required)) {
      failures.push(
        `${required} の記述が台帳に一件も無い（禁止を書く側だけが実データの実例を持てる状態を作らない）`
      );
    }
  }
  // 必須のファイルが一件ずつ残っていれば、残りは黙って外せた（タスク 115.307）。
  // 開示の側と同じ「遊び 0」を守る側にも課す
  if (GUARDED_CITATION_DOCS.length < MINIMUM_GUARDED_CITATION_DOCS) {
    failures.push(
      `守る限界の記述が ${GUARDED_CITATION_DOCS.length} 件しかない` +
        `（宣言の下限は ${MINIMUM_GUARDED_CITATION_DOCS} 件）。` +
        '記述ごと撤去したのなら、下限も同じ差分で下げること。'
    );
  }
  if (GUARDED_CITATION_DOCS.length > MINIMUM_GUARDED_CITATION_DOCS) {
    failures.push(
      `守る限界の記述が ${GUARDED_CITATION_DOCS.length} 件で、宣言した下限 ` +
        `${MINIMUM_GUARDED_CITATION_DOCS} 件を上回る（遊び ` +
        `${GUARDED_CITATION_DOCS.length - MINIMUM_GUARDED_CITATION_DOCS} 件）。` +
        '下限は現況ちょうどに保つこと——遊びを持つ下限は、その幅ぶんの無言の削除を吸収する。' +
        `MINIMUM_GUARDED_CITATION_DOCS を ${GUARDED_CITATION_DOCS.length} 件へ上げること。`
    );
  }
  if (REAL_DATA_CITATION_RULES.length === 0) {
    return ['実データを指す形が一件も登録されていない（規則を空にして緑にする抜け道）'];
  }

  const vocabulary = collectRealDataCitationVocabulary();
  if (vocabulary.featureNames.length === 0) {
    failures.push('実在する機能名が一件も集まらない（実データから作る禁止が空振りしている）');
  }
  if (vocabulary.markedFileNames.length === 0) {
    failures.push(
      '被覆印を持つ実在のファイル名が一件も集まらない（実データから作る禁止が空振りしている）'
    );
  }
  if (vocabulary.criterionNumbers.length === 0) {
    failures.push(
      '実在する受入基準の番号が一件も集まらない（実データから作る禁止が空振りしている）'
    );
  }
  if (RESERVED_ILLUSTRATION_CRITERION_NUMBERS.length === 0) {
    failures.push('書式の見本に使う番号が一件も予約されていない（書式の説明ごと禁じてしまう）');
  }
  for (const reserved of RESERVED_ILLUSTRATION_CRITERION_NUMBERS) {
    if (vocabulary.criterionNumbers.includes(reserved)) {
      failures.push(
        `見本用に予約した番号 ${reserved} が禁止の材料に残っている（書式の説明まで禁じてしまう）`
      );
    }
  }
  if (vocabulary.requirementNumbers.length === 0) {
    failures.push(
      '実在する要件レベルの番号が一件も集まらない（実データから作る禁止が空振りしている）'
    );
  }
  if (RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS.length === 0) {
    failures.push(
      '書式の見本に使う要件レベルの番号が一件も予約されていない（要件全体の被覆印の書式ごと禁じてしまう）'
    );
  }
  for (const reserved of RESERVED_ILLUSTRATION_REQUIREMENT_NUMBERS) {
    if (vocabulary.requirementNumbers.includes(reserved)) {
      failures.push(
        `見本用に予約した要件レベルの番号 ${reserved} が禁止の材料に残っている（書式の説明まで禁じてしまう）`
      );
    }
  }
  if (CITED_CRITERION_NUMBER_SEPARATORS.length === 0) {
    failures.push('点以外の区切りが一本も登録されていない（区切りを空にして緑にする抜け道）');
  }
  for (const separator of CITED_CRITERION_NUMBER_SEPARATORS) {
    if (separator === '.') {
      failures.push('点そのものが「点以外の区切り」に載っている（既存の禁止と重なる）');
    }
    if (EXCLUDED_CRITERION_NUMBER_SEPARATORS.includes(separator)) {
      failures.push(
        `区切り「${separator}」が載せる側と載せない側の両方に在る（どちらの宣言が効いているか読めない）`
      );
    }
  }

  // ファイル名の絞り込みが現に母集団を狭めていることを、実例でなく数で確かめる
  // （散文へ「こういう名前が除かれる」と書くと、その名前が被覆印を得た瞬間に偽になる）
  const scannedFileNames = new Set(listCoverageScanFiles().map((file) => path.basename(file)));
  if (scannedFileNames.size === 0) {
    failures.push('走査対象のファイル名が一件も集まらない（絞り込みの照合が対象を失っている）');
  } else {
    const outsideScan = vocabulary.markedFileNames.filter((name) => !scannedFileNames.has(name));
    if (outsideScan.length > 0) {
      failures.push(
        `被覆印を持つ名前 ${outsideScan.join(', ')} が走査対象の名前に含まれない` +
          '（二つの母集団が別の走査規則を歩いている）'
      );
    }
    if (vocabulary.markedFileNames.length >= scannedFileNames.size) {
      failures.push(
        `ファイル名の絞り込みが母集団を狭めていない（走査 ${scannedFileNames.size} 名に対し` +
          `被覆印を持つ ${vocabulary.markedFileNames.length} 名）。` +
          '絞る理由が失われているので、絞り込みごと見直すこと'
      );
    }
  }

  for (const rule of REAL_DATA_CITATION_RULES) {
    const entries = rule.entries(vocabulary);
    if (entries.length === 0) {
      failures.push(`${rule.label}: 規則が一本も組み立たない（禁止が空振りしている）`);
      continue;
    }
    if (rule.counterProbes.length === 0) {
      failures.push(`${rule.label}: 禁じてはならない見本が一件も無い（広がりすぎに気付けない）`);
    }
    // 見本は規則と一対一で照合する。束のどれかが拾えば良い形にすると、
    // 束の中の一本が壊れても他の一本が見本を拾って緑のままになる
    for (const { pattern, probe } of entries) {
      if (!pattern.test(probe)) {
        failures.push(
          `${rule.label}: 規則 ${pattern.source} が禁じたい見本「${probe}」に一致しない` +
            '（規則が空振りしている）'
        );
      }
      for (const counterProbe of rule.counterProbes) {
        if (pattern.test(counterProbe)) {
          failures.push(
            `${rule.label}: 禁じてはならない見本「${counterProbe}」に ${pattern.source} まで` +
              '一致する（規則が広すぎる。書式そのものの説明まで禁じてしまう）'
          );
        }
      }
    }
  }

  // 規則を丸ごと削る変異は見本の照合では捕まらないため、能力の側を独立に固定する
  if (MUST_DETECT_CITATIONS.length === 0) {
    failures.push('捕まえ続けるべき形が一件も登録されていない（能力の固定を空にする抜け道）');
  }
  for (const control of MUST_DETECT_CITATIONS) {
    const rule = REAL_DATA_CITATION_RULES.find((candidate) => candidate.label === control.label);
    if (!rule) {
      failures.push(`${control.label}: 責任を負う規則が存在しない（禁止が丸ごと失われている）`);
      continue;
    }
    const text = control.text(vocabulary);
    if (!rule.entries(vocabulary).some((entry) => entry.pattern.test(text))) {
      failures.push(`${control.label}: 「${text}」を捕まえられない（この形の禁止が失われている）`);
    }
  }

  // 開示の側にも対照を置く（タスク 115.306）。捕まえ続ける側だけを固定すると、
  // 「塞がないと開示した形を後から塞いだのに開示が古いまま」という向きの漂流が残る
  if (DISCLOSED_CITATION_HOLES.length === 0) {
    failures.push('塞がないと決めた形が一件も登録されていない（開示の対照を空にする抜け道）');
  }
  // 空でないことだけでは 8 項から 1 項へ縮む変異を止められない（本タスクのレビューが実測）
  if (DISCLOSED_CITATION_HOLES.length < MINIMUM_DISCLOSED_CITATION_HOLES) {
    failures.push(
      `塞がないと決めた形が ${DISCLOSED_CITATION_HOLES.length} 件しかない` +
        `（宣言の下限は ${MINIMUM_DISCLOSED_CITATION_HOLES} 件）。` +
        '穴を塞いで台帳から外したのなら、下限も同じ差分で下げること。'
    );
  }
  if (DISCLOSED_CITATION_HOLES.length > MINIMUM_DISCLOSED_CITATION_HOLES) {
    failures.push(
      `塞がないと決めた形が ${DISCLOSED_CITATION_HOLES.length} 件で、宣言した下限 ` +
        `${MINIMUM_DISCLOSED_CITATION_HOLES} 件を上回る（遊び ` +
        `${DISCLOSED_CITATION_HOLES.length - MINIMUM_DISCLOSED_CITATION_HOLES} 件）。` +
        '下限は現況ちょうどに保つこと——遊びを持つ下限は、その幅ぶんの無言の削除を吸収する。' +
        `MINIMUM_DISCLOSED_CITATION_HOLES を ${DISCLOSED_CITATION_HOLES.length} 件へ上げること。`
    );
  }
  const guardSourcePath = path.resolve(SELFTEST_SOURCE_PATH);
  const guardDoc = fs.existsSync(guardSourcePath)
    ? extractJsDocAbove(
        fs.readFileSync(guardSourcePath, 'utf8'),
        `function ${LIMIT_DOC_GUARD_NAME}(): string[] {`
      )
    : null;
  if (guardDoc === null) {
    failures.push(
      `${LIMIT_DOC_GUARD_NAME} の限界の記述を取り出せない` +
        '（開示の所在が失われた。前提が崩れたので合格にしない）'
    );
  }
  for (const hole of DISCLOSED_CITATION_HOLES) {
    if (hole.rationale.trim().length === 0) {
      failures.push(`${hole.label}: 塞がない理由が空である（塞がないことと書かないことは別）`);
    }
    const sample = hole.sample(vocabulary);
    for (const rule of REAL_DATA_CITATION_RULES) {
      for (const { pattern } of rule.entries(vocabulary)) {
        if (pattern.test(sample)) {
          failures.push(
            `${hole.label}: 素通りすると開示した見本「${sample}」へ${rule.label}の ` +
              `${pattern.source} が一致する。塞いだのなら開示を書き換えること`
          );
        }
      }
    }
    if (guardDoc !== null && !guardDoc.includes(hole.discloseAs)) {
      failures.push(
        `${hole.label}: 限界の記述が \`${hole.discloseAs}\` を逐語で述べていない` +
          '（台帳に在る穴が開示に無い）'
      );
    }
  }

  const sources = new Map<string, string>();
  for (const relativePath of new Set(GUARDED_CITATION_DOCS.map((entry) => entry.sourcePath))) {
    const absolute = path.resolve(relativePath);
    if (!fs.existsSync(absolute)) {
      failures.push(`${relativePath} が存在しない（検査対象が失われた）`);
      continue;
    }
    sources.set(relativePath, fs.readFileSync(absolute, 'utf8'));
  }

  for (const entry of GUARDED_CITATION_DOCS) {
    const source = sources.get(entry.sourcePath);
    if (source === undefined) continue;
    if (entry.rationale.trim().length === 0) {
      failures.push(`${entry.label}: 判断の根拠が空である（一箇所ずつの決着が残っていない）`);
    }
    if (entry.mustName.length === 0) {
      failures.push(`${entry.label}: 名乗るべき導線が一件も無い（現況の出所が辿れない）`);
    }
    const doc = extractJsDocAbove(source, entry.anchor);
    if (doc === null) {
      failures.push(
        `${entry.label}: \`${entry.anchor}\` の直前の JSDoc を取り出せない` +
          '（宣言の綴りが変わったか記述が失われた。前提が崩れたので合格にしない）'
      );
      continue;
    }
    for (const rule of REAL_DATA_CITATION_RULES) {
      for (const { pattern } of rule.entries(vocabulary)) {
        const hit = pattern.exec(doc);
        if (hit === null) continue;
        failures.push(
          `${entry.label}: 限界の記述が${rule.label}「${hit[0]}」を挙げている。` +
            `実データとともに陳腐化するため、${entry.mustName.join(' / ')} が出す現況へ` +
            `導線を置いて引用を落とすこと。この箇所の決着: ${entry.rationale}`
        );
      }
    }
    for (const name of entry.mustName) {
      if (!doc.includes(name)) {
        failures.push(
          `${entry.label}: 限界の記述が導線 ${name} を名乗っていない（現況の出所が辿れない）`
        );
      }
      if (!source.includes(name)) {
        failures.push(
          `${entry.label}: ${entry.sourcePath} に ${name} が無い（実在しない名前を指している）`
        );
      }
    }
    for (const name of entry.mustNameInGuard ?? []) {
      if (!doc.includes(name)) {
        failures.push(
          `${entry.label}: 限界の記述が導線 ${name} を名乗っていない（現況の出所が辿れない）`
        );
      }
      const guardSource = sources.get(SELFTEST_SOURCE_PATH) ?? readGuardSource();
      if (guardSource === null || !guardSource.includes(`function ${name}(`)) {
        failures.push(
          `${entry.label}: ${SELFTEST_SOURCE_PATH} に \`function ${name}(\` が無い` +
            '（実在しない守り手を指している）'
        );
      }
    }
    if (!doc.includes(LIMIT_DOC_GUARD_NAME)) {
      failures.push(
        `${entry.label}: 限界の記述が守り手 ${LIMIT_DOC_GUARD_NAME} を名乗っていない` +
          '（実データの引用を禁じているのが誰かを後任が辿れない）'
      );
    }
  }

  const selftestPath = path.resolve(SELFTEST_SOURCE_PATH);
  if (!fs.existsSync(selftestPath)) {
    failures.push(`${SELFTEST_SOURCE_PATH} が存在しない（守り手の実在を確かめられない）`);
  } else if (!fs.readFileSync(selftestPath, 'utf8').includes(`function ${LIMIT_DOC_GUARD_NAME}(`)) {
    failures.push(
      `${SELFTEST_SOURCE_PATH} に \`function ${LIMIT_DOC_GUARD_NAME}(\` が無い` +
        '（限界の記述が実在しない守り手を指している）'
    );
  }

  return failures;
}

/**
 * 巻き込みを測る母集団（タスク 115.306）
 *
 * **範囲を日本語で宣言しない。** 同じ記述から出発した二者の走査範囲が 2 倍ずれた実例が
 * あるため、範囲はコマンドと同型の列挙で持つ（`ls scripts/*.ts` と設計文書 1 件）。
 * 台帳が読む記述だけを見るとどの規則も巻き込み 0 箇所で並び、判断材料にならない。
 */
function listCitationSurveyFiles(): string[] {
  const scriptsDir = path.resolve('scripts');
  const files = fs
    .readdirSync(scriptsDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(scriptsDir, name))
    .sort();
  const design = path.resolve('.kiro/specs/site-survey/design.md');
  if (fs.existsSync(design)) files.push(design);
  return files;
}

/** 調査が印字する見本の上限。1 件だけ出すと巻き込みの中身を一般化して誤る */
const CITATION_SURVEY_EXAMPLE_LIMIT = 6;

/**
 * 一本の網について、母集団の中の巻き込みを数えて印字する
 *
 * **ファイル別の内訳と複数の見本を出す。** 先頭 1 例だけを出す形は、巻き込みの中身を
 * その 1 例で一般化する誤りを誘う（本タスクのレビューが実測した差し戻しの原因である。
 * 範囲の書き方 1 例から「巻き込みはいずれも範囲である」と一般化していたが、実際には
 * 対照名・宣言 ID・正規表現の文字クラスが含まれていた）。**内訳と見本を出す形にすれば、
 * 後任は中身についての主張を自分で導き直せる。**
 */
function reportCitationNetCollisions(
  label: string,
  listed: boolean,
  pattern: RegExp,
  accept: (match: RegExpExecArray) => boolean,
  texts: ReadonlyArray<{ file: string; text: string }>
): void {
  let hits = 0;
  const perFile = new Map<string, number>();
  const examples: string[] = [];
  for (const { file, text } of texts) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      if (accept(match)) {
        hits += 1;
        const name = path.basename(file);
        perFile.set(name, (perFile.get(name) ?? 0) + 1);
        if (examples.length < CITATION_SURVEY_EXAMPLE_LIMIT) {
          const line = text.slice(0, match.index).split('\n').length;
          examples.push(
            `${name}:${line} ${JSON.stringify(
              text.slice(Math.max(0, match.index - 30), match.index + 30)
            )}`
          );
        }
      }
      match = pattern.exec(text);
    }
  }
  console.log(
    `   ${listed ? '[載せた]  ' : '[載せない]'} ${label}: 巻き込み ${hits} 箇所 / ${perFile.size} ファイル`
  );
  for (const [name, count] of [...perFile].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )) {
    console.log(`      内訳 ${name}: ${count} 箇所`);
  }
  for (const example of examples) console.log(`      例 ${example}`);
  if (hits > examples.length) {
    console.log(`      （見本は先頭 ${examples.length} 件のみ。全件は上の内訳のファイルを読む）`);
  }
}

/**
 * 実データ引用の禁止をどこまで広げるかの判断材料を印字する（タスク 115.306）
 *
 * 載せた網（要件レベルの番号と {@link CITED_CRITERION_NUMBER_SEPARATORS}）と載せなかった網
 * （{@link EXCLUDED_CRITERION_NUMBER_SEPARATORS}）の**両方**について、母集団・巻き込み・
 * ファイル別の内訳・複数の見本を出す。片側だけを出すと「載せなかった理由」が測られていない
 * 断言になる。**数え方は出現箇所**である（同じファイルの同じ番号が複数回現れれば複数と数える）
 * ——単位を宣言しないと、同じ量について箇所・対・行の三つの値が並ぶ。
 * 数値をここへ写さないのは、写した瞬間に同期する機構の無い二重帳簿になるためである。
 */
function surveyCitationNets(): void {
  const vocabulary = collectRealDataCitationVocabulary();
  const files = listCitationSurveyFiles();
  const knownCriteria = new Set(vocabulary.criterionNumbers.filter((n) => n.includes('.')));
  const knownRequirements = new Set(vocabulary.requirementNumbers);
  const texts = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
  console.log('🔍 実データ引用の禁止の巻き込み調査 (タスク 115.306)');
  console.log('   母集団の宣言: ls scripts/*.ts .kiro/specs/site-survey/design.md');
  console.log(
    `   母集団: ${files.length} ファイル / 実在する受入基準の番号 ${knownCriteria.size} 件 / ` +
      `実在する要件レベルの番号 ${knownRequirements.size} 件（いずれも見本用の予約を除く）`
  );
  console.log('   数え方: 出現箇所（同じファイルの同じ番号が複数回現れれば複数と数える）');
  reportCitationNetCollisions(
    '要件レベルの番号 `REQ-N`',
    true,
    /REQ-(\d+[A-Z]?)(?![0-9.])/g,
    (match) => knownRequirements.has(match[1] ?? ''),
    texts
  );
  for (const separator of [
    ...CITED_CRITERION_NUMBER_SEPARATORS,
    ...EXCLUDED_CRITERION_NUMBER_SEPARATORS,
  ]) {
    reportCitationNetCollisions(
      `点以外の区切り「${separator}」`,
      CITED_CRITERION_NUMBER_SEPARATORS.includes(separator),
      new RegExp(`(?<![0-9.])(\\d+[A-Z]?)${escapeForRegExp(separator)}(\\d+)(?![0-9])`, 'g'),
      (match) => knownCriteria.has(`${match[1] ?? ''}.${match[2] ?? ''}`),
      texts
    );
  }
  console.log(
    '   載せた側の巻き込みは、GUARDED_CITATION_DOCS を広げるときに書き直しが要る箇所の下界である。' +
      '書き直せるかは中身による——内訳と見本を読んで分類し直すこと。'
  );
}

/**
 * 陰性対照: 行頭のコメント記号 `*` が一覧の印に見える形（タスク 115.194）
 *
 * 一覧の印は `[-*]` だが、JSDoc の行は例外なく行頭が `*` である。
 * そのため印を字面だけで判定すると、
 *
 *   - 印を持たない**一覧項目の継続行**（` *   REQ-8.2 を…`）
 *   - 行頭のコメント記号しか持たない**素の散文**（` * REQ-8.3 は…`）
 *
 * まで一覧項目として拾われ、被覆の過大帰属になる。
 *
 * **段落の切れ目（規則4）では届かない形である。** ここでは切れ目を一つも置かず、
 * 正当な一覧項目と同じ段落の中に継続行と散文を並べている。
 * 規則4を外しても外さなくても結果は変わらず、**この対照でしか捕まらない**。
 */
const JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-8.1: 正当な一覧項目（`-` の印を持つ）',
  ' *   REQ-8.2 を無条件に検証する（一覧項目の継続行。印を持たない）',
  ' * REQ-8.3 は本ファイルでは検証していない（行頭のコメント記号は印ではない）',
  ' * - REQ-8.4: 同じ段落の中の、後続の正当な一覧項目',
  ' */',
  '',
].join('\n');

/**
 * 陰性対照: ブロックコメントの開始記号 `/**` の `*` が印に見える形
 *
 * 開始記号の `*` は行頭の非空白文字そのものではなく、直前に `/` が付く。
 * 直前に連なる `*` と `/` を読み飛ばしてから行頭かを見なければ、ここが印として拾われる。
 */
const BLOCK_COMMENT_OPENER_IS_NOT_A_LIST_MARKER = [
  '// Requirements (user-authentication):',
  '// - REQ-11.1: 行コメントの正当な一覧項目',
  '/** REQ-11.2 はコメントの開始記号の後ろにあるだけで、印を持たない */',
  '',
].join('\n');

function checkJsDocLinePrefixIsNotAListMarker(): string[] {
  const failures: string[] = [];

  const found = extractHeaderScopedCoverage(
    JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER,
    SELFTEST_FEATURES
  );
  if (!found.acceptanceCriteria.includes('site-survey/REQ-8.1')) {
    failures.push('`-` の印を持つ正当な一覧項目 site-survey/REQ-8.1 を取りこぼした（厳しすぎ）');
  }
  if (!found.acceptanceCriteria.includes('site-survey/REQ-8.4')) {
    failures.push(
      '継続行・散文の後ろにある正当な一覧項目 site-survey/REQ-8.4 を取りこぼした（厳しすぎ）'
    );
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-8.2')) {
    failures.push(
      '印を持たない継続行を一覧項目として拾った（site-survey/REQ-8.2。被覆の過大帰属）'
    );
  }
  if (found.acceptanceCriteria.includes('site-survey/REQ-8.3')) {
    failures.push(
      '行頭のコメント記号を一覧の印と取り違えた（site-survey/REQ-8.3。' +
        '「検証していない」と述べた散文が被覆主張になっている）'
    );
  }

  const opener = extractHeaderScopedCoverage(
    BLOCK_COMMENT_OPENER_IS_NOT_A_LIST_MARKER,
    SELFTEST_FEATURES
  );
  if (!opener.acceptanceCriteria.includes('user-authentication/REQ-11.1')) {
    failures.push('行コメントの正当な一覧項目 user-authentication/REQ-11.1 を取りこぼした');
  }
  if (opener.acceptanceCriteria.includes('user-authentication/REQ-11.2')) {
    failures.push(
      'ブロックコメントの開始記号を一覧の印と取り違えた（user-authentication/REQ-11.2）'
    );
  }

  return failures;
}

/**
 * 行頭のコメント記号の直後へ `-` の印を差し込む（見本の側からの変異）
 *
 * 抽出規則を対照側へ複製しないため、変異は**本文の側**へ当てる。
 */
function insertListMarkerAfterJsDocPrefix(content: string): string {
  return content.replace(/(\n[ \t]*\*[ \t]*)(?=REQ-)/g, '$1- ');
}

/**
 * 機構: 継続行・散文の陰性対照が**印の有無にだけ反応する**ことを確かめる
 *
 * REQ-8.2 / REQ-8.3 が拾われない理由は「印を持たないこと」でなければならない。
 * 区間が短すぎる・機能名が合っていないなど別の理由で拾われていないなら、
 * この対照は行頭のコメント記号の規則を何も測っていない（空振り）。
 * 同じ位置へ `-` の印だけを差し込んだ写しを作り、両者が現れることを主張する。
 */
function checkListMarkerControlActuallyReacts(): string[] {
  const failures: string[] = [];
  const mutated = insertListMarkerAfterJsDocPrefix(JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER);
  if (mutated === JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER) {
    failures.push('見本へ印を差し込めておらず、変異が差分を作っていない');
    return failures;
  }
  const found = extractHeaderScopedCoverage(mutated, SELFTEST_FEATURES);
  const expectedIds = ['site-survey/REQ-8.2', 'site-survey/REQ-8.3'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (expectedIds.length === 0) {
    failures.push('素材 expectedIds が空です（この確認が空振りしています）');
  }
  for (const id of expectedIds) {
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(
        `印を差し込んでも ${id} が現れない（対照が空振りしている。` +
          '区間の切れ目など、印以外の理由で落ちている可能性がある）'
      );
    }
  }
  return failures;
}

/**
 * 陽性対照: 行頭より後ろに置かれた `*` は従来どおり一覧の印である（厳しすぎの側）
 *
 * `*` を一律にコメント記号とみなす（＝規則を厳しくしすぎる）変異は、
 * 前段の陰性対照では捕まらない。Markdown の箇条書きとして書かれた `*` を
 * 陽性側から固定し、緩めすぎ・厳しすぎの両側を挟む。
 */
const ASTERISK_BULLET_IS_STILL_A_LIST_MARKER = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * * REQ-9.1: 行頭のコメント記号より後ろに置いた箇条書き',
  ' */',
  '// Requirements (user-authentication):',
  '// * REQ-9.2: 行コメントの中の箇条書き',
  '',
].join('\n');

function checkAsteriskBulletIsStillAListMarker(): string[] {
  const failures: string[] = [];

  // 空振り防止: `-` の印が紛れていると、`*` が印として働いたことを示せない
  if (/-\s*REQ-/.test(ASTERISK_BULLET_IS_STILL_A_LIST_MARKER)) {
    failures.push('見本に `-` の印が混じっており、`*` が印として働いたことを示せない');
  }

  const found = extractHeaderScopedCoverage(
    ASTERISK_BULLET_IS_STILL_A_LIST_MARKER,
    SELFTEST_FEATURES
  );
  if (!found.acceptanceCriteria.includes('site-survey/REQ-9.1')) {
    failures.push(
      'JSDoc の中の `*` の箇条書きを取りこぼした（site-survey/REQ-9.1。規則が厳しすぎる）'
    );
  }
  if (!found.acceptanceCriteria.includes('user-authentication/REQ-9.2')) {
    failures.push(
      '行コメントの中の `*` の箇条書きを取りこぼした（user-authentication/REQ-9.2。規則が厳しすぎる）'
    );
  }
  return failures;
}

/**
 * 従来から効いていた「空行で切る」を残していることの固定
 *
 * JSDoc の外（通常のコメントや素の本文）では空行が段落の切れ目である。
 * 次のヘッダーも JSDoc の終端も無い場合、空行で切れなければ区間はファイル末尾まで延びる。
 */
const PLAIN_HEADER_THEN_BLANK_LINE = [
  '// Requirements (user-authentication):',
  '// - REQ-5.1: 空行の前',
  '',
  '// - REQ-5.2: 空行の後（別の話題）',
  '',
].join('\n');

function checkHeaderSectionStillStopsAtBlankLine(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(PLAIN_HEADER_THEN_BLANK_LINE, SELFTEST_FEATURES);
  if (!found.acceptanceCriteria.includes('user-authentication/REQ-5.1')) {
    failures.push('空行より前の一覧 user-authentication/REQ-5.1 を取りこぼした');
  }
  if (found.acceptanceCriteria.includes('user-authentication/REQ-5.2')) {
    failures.push('空行を越えて帰属した（user-authentication/REQ-5.2。被覆の過大帰属）');
  }
  return failures;
}

/**
 * 区間の終端そのものを直接見る
 *
 * 上の事例は抽出の結果を見るため、区間の決め方が変わっても結果が同じなら通ってしまう。
 * ここでは終端の位置そのものを主張し、「次のヘッダー」「JSDoc の終端」「空行」
 * 「JSDoc 内の段落の切れ目」の**最も手前**が採られることを固定する。
 * 四つの上限のどれか一つを外す変異が必ず落ちる。
 */
function checkSectionEndTakesEarliestBoundary(): string[] {
  const failures: string[] = [];

  const header = ADJACENT_HEADERS_JSDOC.indexOf('Requirements (site-survey):');
  const nextHeader = ADJACENT_HEADERS_JSDOC.indexOf(
    'Requirements coverage (quantity-table-generation):'
  );
  if (header < 0 || nextHeader < 0) {
    return ['自己検査の資料が壊れている（ヘッダーが見つからない）'];
  }
  const endWithNext = resolveHeaderSectionEnd(ADJACENT_HEADERS_JSDOC, header, nextHeader);
  if (endWithNext > nextHeader) {
    failures.push(
      `次のヘッダー(${nextHeader})を越えて区間が延びた(${endWithNext})。別機能の一覧を飲み込む`
    );
  }

  const single = SINGLE_HEADER_JSDOC_THEN_BODY.indexOf('Requirements (site-survey):');
  const jsDocEnd = SINGLE_HEADER_JSDOC_THEN_BODY.indexOf('*/');
  if (single < 0 || jsDocEnd < 0) {
    return ['自己検査の資料が壊れている（JSDoc の終端が見つからない）'];
  }
  const endWithJsDoc = resolveHeaderSectionEnd(SINGLE_HEADER_JSDOC_THEN_BODY, single, null);
  if (endWithJsDoc > jsDocEnd) {
    failures.push(
      `JSDoc の終端(${jsDocEnd})を越えて区間が延びた(${endWithJsDoc})。本体側の記述を飲み込む`
    );
  }

  const plain = PLAIN_HEADER_THEN_BLANK_LINE.indexOf('Requirements (user-authentication):');
  const blank = PLAIN_HEADER_THEN_BLANK_LINE.indexOf('\n\n');
  if (plain < 0 || blank < 0) {
    return ['自己検査の資料が壊れている（空行が見つからない）'];
  }
  const endWithBlank = resolveHeaderSectionEnd(PLAIN_HEADER_THEN_BLANK_LINE, plain, null);
  if (endWithBlank > blank) {
    failures.push(`空行(${blank})を越えて区間が延びた(${endWithBlank})`);
  }

  const prose = PARAGRAPH_BREAK_THEN_PROSE.indexOf('Requirements coverage (site-survey):');
  const paragraph = /\n[ \t]*\*[ \t]*(?=\n)/.exec(PARAGRAPH_BREAK_THEN_PROSE);
  if (prose < 0 || !paragraph) {
    return ['自己検査の資料が壊れている（段落の切れ目が見つからない）'];
  }
  const endWithParagraph = resolveHeaderSectionEnd(PARAGRAPH_BREAK_THEN_PROSE, prose, null);
  if (endWithParagraph > paragraph.index) {
    failures.push(
      `段落の切れ目(${paragraph.index})を越えて区間が延びた(${endWithParagraph})。直後の散文を飲み込む`
    );
  }

  return failures;
}

/**
 * 実データの側から、過大帰属が残っていないことを見る
 *
 * 仮想の資料だけでは「実装が実データに対して効いているか」は言えない。
 * 是正前に過大帰属していた実在のファイルを名指しで固定する。
 * 当該ファイルが失われたら前提が失われたとして失敗させる（黙って素通りさせない）。
 */
function checkRealFileIsNotOverAttributed(): string[] {
  const failures: string[] = [];
  const target = 'backend/src/utils/seed-helpers.ts';
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) {
    return [`${target} が存在しない（自己検査の前提が失われた）`];
  }
  const content = fs.readFileSync(absolute, 'utf8');
  const found = extractHeaderScopedCoverage(content, SELFTEST_FEATURES);

  // 当該ファイルの site-survey のヘッダー配下は `- REQ-12.1, 12.2, 12.3:` の一行である。
  // 読点で並べた 12.2 / 12.3 も識別子欄として読む（115.195 の是正。別の事例で固定する）。
  // ここで見るのは区間判定なので、先頭の 12.1 だけを前提にする。
  if (!found.acceptanceCriteria.includes('site-survey/REQ-12.1')) {
    failures.push(
      `${target}: site-survey/REQ-12.1 を取りこぼした（自己検査の前提が変わった可能性）`
    );
  }
  // 後続のヘッダー（company-info / estimate-creation …）配下の番号は帰属してはならない。
  const forbiddenIds = ['site-survey/REQ-6.6', 'site-survey/REQ-11'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (forbiddenIds.length === 0) {
    failures.push('素材 forbiddenIds が空です（この確認が空振りしています）');
  }
  for (const id of forbiddenIds) {
    if (found.requirements.includes(id) || found.acceptanceCriteria.includes(id)) {
      failures.push(`${target}: 後続のヘッダー配下の ${id} が site-survey へ帰属した`);
    }
  }
  // 先行のヘッダー配下の番号も帰属してはならない。
  if (found.acceptanceCriteria.includes('site-survey/REQ-3.1')) {
    failures.push(`${target}: 先行のヘッダー配下の site-survey/REQ-3.1 が site-survey へ帰属した`);
  }
  return failures;
}

// ============================================================================
// 一覧項目の識別子欄（過小帰属）
// ============================================================================
//
// 115.194 は「印でないものを印と読む」過大帰属を狭めた。ここで固定するのは**逆向き**、
// 印を持つ正当な一覧項目の**識別子欄を最後まで読まない**ことによる過小帰属である。
//
// 是正前の規則は一項目につき一致が一つで、しかも `REQ-` の接頭辞を必須にしていた。
// このため実データの `- REQ-12.1, 12.2, 12.3:` は 12.1 しか拾われず、
// `- 13.1, 13.2, 13.3, 13.4:`（接頭辞なし）は一件も拾われなかった。
//
// **緩めれば散文の数値を番号と読み違える。** 識別子欄は「印の直後から最初のコロンまでが
// 識別子の並びだけで出来ていること」を要求し、散文が一文字でも混じれば読まない。
// 過小（取りこぼし）と過大（散文の数値・印を持たない継続行）の両側を対照で挟む。

/** 陽性対照: 識別子欄の各書式 */
const ID_LIST_FORMS = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-14.1: 単独の項目（是正前から拾えていた形）',
  ' * - REQ-14.2, 14.3: 読点で並べた続き（接頭辞は先頭だけ）',
  ' * - 14.4, 14.5: 接頭辞を持たない並び',
  ' * - REQ-14.6, REQ-14.7: 各項目が接頭辞を持つ並び',
  ' * - 14.8: 接頭辞を持たない単独の項目',
  ' */',
  '',
  '// Requirements coverage (user-authentication):',
  '// - REQ-20.1: 行コメントの単独の項目',
  '// - 20.2, 20.3: 行コメントの接頭辞を持たない並び',
  '// * 20.4, 20.5: 行コメントの中の Markdown 箇条書き',
  '',
].join('\n');

function checkIdListEnumeratesEveryItem(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(ID_LIST_FORMS, SELFTEST_FEATURES);
  const jsdocBranches = ['14.1', '14.2', '14.3', '14.4', '14.5', '14.6', '14.7', '14.8'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (jsdocBranches.length === 0) {
    failures.push('素材 jsdocBranches が空です（この確認が空振りしています）');
  }
  for (const branch of jsdocBranches) {
    const id = `site-survey/REQ-${branch}`;
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(`識別子欄の項目 ${id} を取りこぼした（被覆の過小帰属）`);
    }
  }
  if (!found.requirements.includes('site-survey/REQ-14')) {
    failures.push('要件番号 site-survey/REQ-14 が記録されていない');
  }
  // 行コメント（`//`）の一覧項目でも同じ規則が成り立つこと。
  // 印を探す走査が `/` を行の最初の非空白文字として見ると、識別子欄が一切読まれない。
  const lineCommentBranches = ['20.1', '20.2', '20.3', '20.4', '20.5'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (lineCommentBranches.length === 0) {
    failures.push('素材 lineCommentBranches が空です（この確認が空振りしています）');
  }
  for (const branch of lineCommentBranches) {
    const id = `user-authentication/REQ-${branch}`;
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(`行コメントの識別子欄の項目 ${id} を取りこぼした（被覆の過小帰属）`);
    }
  }
  if (!found.requirements.includes('user-authentication/REQ-20')) {
    failures.push('要件番号 user-authentication/REQ-20 が記録されていない');
  }
  return failures;
}

/**
 * 陰性対照: 識別子の並びに見えない箇条書きと、印を持たない継続行
 *
 * 数値を含む散文まで識別子と読むと、被覆の過大帰属が別の形で復活する。
 * 継続行を読む規則は「印の無い行の番号も拾う」ことと同義であり、115.194 の是正を壊す。
 *
 * スラッシュ区切りの並び（`- 15.8 / 15.9:`）は**読み落としではなく据え置いた書式**である
 * （`parseHeaderListItemIds` の「据え置く書式」を参照）。区切り記号を増やすほど散文との
 * 境目が曖昧になるため読点に限る、という決めごとが本当に効いていることをここで固定する。
 *
 * **この一行が担うのは文法側の変異である。** 識別子欄の文法（`ID_LIST_REGION_REGEX`）の
 * 区切りを広げる変異（`[,、]` → `[,、/]`）を当てると、この検査が赤くなる（実測）。
 * 一方、分割側（`parseHeaderListItemIds` の `idRegion.split(/[,、]/)`）へ同じ変異を当てても
 * 無言のままである。前段の文法検査を通過した欄にスラッシュは存在しえないためで、
 * これは @fileoverview の等価変異 3 番として記録した**前段に包含される等価変異**にあたる。
 */
const PROSE_BULLET_IS_NOT_AN_ID_LIST = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-15.1: 正当な一覧項目',
  ' * - 15.2 または 15.3 を満たす: 識別子の並びではない散文の箇条書き',
  ' * - 文字数制限（名称15.4文字、規格15.5文字）: 数値を含む散文',
  ' *   15.6, 15.7: 印を持たない継続行',
  ' * - 15.8 / 15.9: スラッシュ区切りの並び（据え置く書式。識別子欄と認めない）',
  ' */',
  '',
  '// Requirements coverage (user-authentication):',
  '// - REQ-21.1: 行コメントの正当な一覧項目',
  '//   21.2, 21.3: 行コメントの印を持たない継続行',
  '',
].join('\n');

function checkProseBulletIsNotAnIdList(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(PROSE_BULLET_IS_NOT_AN_ID_LIST, SELFTEST_FEATURES);

  if (!found.acceptanceCriteria.includes('site-survey/REQ-15.1')) {
    failures.push('正当な一覧項目 site-survey/REQ-15.1 を取りこぼした（厳しすぎ）');
  }
  const proseBulletBranches = ['15.2', '15.3'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (proseBulletBranches.length === 0) {
    failures.push('素材 proseBulletBranches が空です（この確認が空振りしています）');
  }
  for (const branch of proseBulletBranches) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `識別子の並びではない散文の箇条書きから site-survey/REQ-${branch} を拾った（過大帰属）`
      );
    }
  }
  const proseNumberBranches = ['15.4', '15.5'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (proseNumberBranches.length === 0) {
    failures.push('素材 proseNumberBranches が空です（この確認が空振りしています）');
  }
  for (const branch of proseNumberBranches) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(`散文中の数値を受入基準番号と読んだ（site-survey/REQ-${branch}。過大帰属）`);
    }
  }
  const unmarkedContinuationBranches = ['15.6', '15.7'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (unmarkedContinuationBranches.length === 0) {
    failures.push('素材 unmarkedContinuationBranches が空です（この確認が空振りしています）');
  }
  for (const branch of unmarkedContinuationBranches) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `印を持たない継続行から site-survey/REQ-${branch} を拾った（115.194 の是正が壊れている）`
      );
    }
  }
  const slashSeparatedBranches = ['15.8', '15.9'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (slashSeparatedBranches.length === 0) {
    failures.push('素材 slashSeparatedBranches が空です（この確認が空振りしています）');
  }
  for (const branch of slashSeparatedBranches) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `スラッシュ区切りの並びから site-survey/REQ-${branch} を拾った（据え置く書式。過大帰属）`
      );
    }
  }
  if (!found.acceptanceCriteria.includes('user-authentication/REQ-21.1')) {
    failures.push(
      '行コメントの正当な一覧項目 user-authentication/REQ-21.1 を取りこぼした（厳しすぎ）'
    );
  }
  const lineCommentContinuationBranches = ['21.2', '21.3'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (lineCommentContinuationBranches.length === 0) {
    failures.push('素材 lineCommentContinuationBranches が空です（この確認が空振りしています）');
  }
  for (const branch of lineCommentContinuationBranches) {
    if (found.acceptanceCriteria.includes(`user-authentication/REQ-${branch}`)) {
      failures.push(
        `行コメントの印を持たない継続行から user-authentication/REQ-${branch} を拾った` +
          '（115.194 の是正が壊れている）'
      );
    }
  }
  return failures;
}

/** 陰性対照の各行を「印を持つ識別子の並び」の形へ書き換える（見本の側からの変異） */
function rewriteAsIdListRegion(content: string): string {
  return content
    .replace(' * - 15.2 または 15.3 を満たす: ', ' * - 15.2, 15.3: ')
    .replace(' * - 文字数制限（名称15.4文字、規格15.5文字）: ', ' * - 15.4, 15.5: ')
    .replace(' *   15.6, 15.7: ', ' * - 15.6, 15.7: ')
    .replace(' * - 15.8 / 15.9: ', ' * - 15.8, 15.9: ')
    .replace('//   21.2, 21.3: ', '// - 21.2, 21.3: ');
}

/**
 * 機構: 陰性対照が**識別子欄の文法と印の有無にだけ反応する**ことを確かめる
 *
 * 15.2〜15.7 と 21.2 / 21.3 が拾われない理由は「識別子の並びでない」「印を持たない」で
 * なければならない。
 * 区間が短すぎる・機能名が合っていないなど別の理由で落ちているなら、この対照は空振りである。
 * 同じ位置を識別子の並びへ書き換えた写しを作り、すべてが現れることを主張する。
 */
function checkProseBulletControlActuallyReacts(): string[] {
  const failures: string[] = [];
  const mutated = rewriteAsIdListRegion(PROSE_BULLET_IS_NOT_AN_ID_LIST);
  const expectedRewrites = 5;
  const rewritten = mutated
    .split('\n')
    .filter((line) => /^(?: \*|\/\/) - (?:15|21)\.\d, (?:15|21)\.\d: /.test(line));
  if (rewritten.length !== expectedRewrites) {
    failures.push(
      `見本を書き換えられていない（変異した行 ${rewritten.length}/${expectedRewrites}）。変異が差分を作っていない`
    );
    return failures;
  }
  const found = extractHeaderScopedCoverage(mutated, SELFTEST_FEATURES);
  const expectedIds = [
    'site-survey/REQ-15.2',
    'site-survey/REQ-15.3',
    'site-survey/REQ-15.4',
    'site-survey/REQ-15.5',
    'site-survey/REQ-15.6',
    'site-survey/REQ-15.7',
    'site-survey/REQ-15.8',
    'site-survey/REQ-15.9',
    'user-authentication/REQ-21.2',
    'user-authentication/REQ-21.3',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (expectedIds.length === 0) {
    failures.push('合成素材 expectedIds が空です（この確認が空振りしています）');
  }
  for (const id of expectedIds) {
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(
        `識別子の並びへ書き換えても ${id} が現れない（対照が空振りしている。` +
          '区間の切れ目など、識別子欄の文法以外の理由で落ちている可能性がある）'
      );
    }
  }
  return failures;
}

/**
 * 実データの側から、過小帰属が解消していることを見る
 *
 * 仮想の資料だけでは実装が実データに効いているかを言えない。
 * 是正前に取りこぼしていた実在の記述を名指しで固定し、
 * 当該の記述が失われたら前提が失われたとして失敗させる（黙って素通りさせない）。
 */
function checkRealUnderAttributionIsResolved(): string[] {
  const failures: string[] = [];
  const features = ['site-survey', 'contract-management', 'estimate-creation'] as const;
  const targets: ReadonlyArray<{ file: string; marker: string; expected: readonly string[] }> = [
    {
      file: 'backend/src/utils/seed-helpers.ts',
      marker: '- REQ-12.1, 12.2, 12.3:',
      expected: ['site-survey/REQ-12.1', 'site-survey/REQ-12.2', 'site-survey/REQ-12.3'],
    },
    {
      file: 'backend/src/__tests__/unit/utils/seed-helpers.test.ts',
      marker: '- 13.1, 13.2, 13.3, 13.4:',
      expected: [
        'contract-management/REQ-13.1',
        'contract-management/REQ-13.2',
        'contract-management/REQ-13.3',
        'contract-management/REQ-13.4',
      ],
    },
    {
      // 行コメント（`//`）で書かれたヘッダーと一覧。印を探す走査が `//` を読み飛ばさないと
      // 識別子欄が一切読まれず、接頭辞なしの並びが丸ごと落ちる。
      file: 'frontend/src/domain/estimate/estimateEditReducer.test.ts',
      marker: '- 49.1:',
      expected: [
        'estimate-creation/REQ-4.6',
        'estimate-creation/REQ-41.11',
        'estimate-creation/REQ-49.1',
        'estimate-creation/REQ-49.2',
        'estimate-creation/REQ-49.8',
      ],
    },
    {
      file: 'frontend/src/__tests__/hooks/useUndoKeyboardShortcuts.test.ts',
      marker: '- 47.5:',
      expected: ['estimate-creation/REQ-47.5'],
    },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (targets.length === 0) {
    failures.push('合成素材 targets が空です（この確認が空振りしています）');
  }

  for (const target of targets) {
    const absolute = path.resolve(target.file);
    if (!fs.existsSync(absolute)) {
      failures.push(`${target.file} が存在しない（自己検査の前提が失われた）`);
      continue;
    }
    const content = fs.readFileSync(absolute, 'utf8');
    if (!content.includes(target.marker)) {
      failures.push(
        `${target.file}: 前提としている記述「${target.marker}」が失われた（対照が空振りしている）`
      );
      continue;
    }
    const found = extractHeaderScopedCoverage(content, features);
    for (const id of target.expected) {
      if (!found.acceptanceCriteria.includes(id)) {
        failures.push(`${target.file}: ${id} を取りこぼした（被覆の過小帰属）`);
      }
    }
  }
  return failures;
}

// ============================================================================
// 一覧項目の番号の書式（範囲・枝つき要件番号）
// ============================================================================
//
// 一覧項目の番号には、単独の番号のほかに**範囲**（`REQ-17-REQ-19` / `REQ-22.1〜22.6`）と
// **枝つき要件番号**（`REQ-27A`）がある。どちらも読み取り規則が明示的に扱っているのに、
// 115.197 の走査時点ではこれらを通る見本が一つも無く、
//
//   - 範囲の後端を記録しない変異（`listMatch[3]` の記録を落とす）
//   - 枝つき要件番号を認めない変異（`[A-E]?` を落とす）
//
// のいずれも自己検査 43 件が全件通過していた（＝主張が空虚だった）。
// 是正後に同じ二つの変異を当て直すと、`listMatch[3]` の記録を落とす側では自己検査 58 件の
// うち 1 件（「範囲は両端だけを記録し、間を展開しない」）が、`[A-E]?` を落とす側では 2 件
// （「枝つき要件番号を基底番号へ丸めない（両経路）」「実データに枝つき要件番号の被覆印が
// 実在し拾われている」）が落ちる（2026-08-31 に実測。タスク 115.210）。
// 実データには `backend/src/routes/auth.routes.ts` の `- REQ-27A: 2FA検証` が実在する。

/**
 * 陽性・陰性対照: 範囲は**両端だけ**を読み、間を展開しない
 *
 * 範囲を展開すると、書かれていない被覆を主張することになる
 * （`parseHeaderListItemIds` の「据え置く書式」を参照）。
 * 逆に後端を落とすと、`REQ-N-REQ-M` の M が黙って被覆から消える。両側をここで挟む。
 */
const NUMBER_RANGE_IS_NOT_EXPANDED = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-17-REQ-19: 要件番号の範囲（両端を記録し、間は展開しない）',
  ' * - REQ-22.1〜22.6: 受入基準の範囲（先頭だけを読む）',
  ' */',
  '',
].join('\n');

/** 範囲を読点区切りの並びへ書き換える（見本の側からの変異） */
function rewriteRangesAsIdList(content: string): string {
  return content
    .replace(' * - REQ-17-REQ-19: ', ' * - REQ-17, REQ-18, REQ-19: ')
    .replace(' * - REQ-22.1〜22.6: ', ' * - REQ-22.1, 22.2, 22.3, 22.4, 22.5, 22.6: ');
}

function checkNumberRangeRecordsBothEndsOnly(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(NUMBER_RANGE_IS_NOT_EXPANDED, SELFTEST_FEATURES);

  const rangeEndIds = ['site-survey/REQ-17', 'site-survey/REQ-19', 'site-survey/REQ-22'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (rangeEndIds.length === 0) {
    failures.push('素材 rangeEndIds が空です（この確認が空振りしています）');
  }
  for (const id of rangeEndIds) {
    if (!found.requirements.includes(id)) {
      failures.push(`範囲の端の要件番号 ${id} を取りこぼした（被覆の過小帰属）`);
    }
  }
  if (!found.acceptanceCriteria.includes('site-survey/REQ-22.1')) {
    failures.push('範囲の先頭の受入基準 site-survey/REQ-22.1 を取りこぼした（被覆の過小帰属）');
  }
  if (found.requirements.includes('site-survey/REQ-18')) {
    failures.push('要件番号の範囲の内側 site-survey/REQ-18 を展開した（書かれていない被覆の主張）');
  }
  const rangeInnerBranches = ['22.2', '22.3', '22.4', '22.5', '22.6'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (rangeInnerBranches.length === 0) {
    failures.push('素材 rangeInnerBranches が空です（この確認が空振りしています）');
  }
  for (const branch of rangeInnerBranches) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `受入基準の範囲の内側 site-survey/REQ-${branch} を展開した（書かれていない被覆の主張）`
      );
    }
  }
  return failures;
}

/**
 * 機構: 範囲の陰性対照が**範囲を展開しないこと**にだけ反応することを確かめる
 *
 * REQ-18 と 22.2〜22.6 が現れない理由は「範囲を展開しない」でなければならない。
 * 区間が短すぎる・機能名が合っていないなど別の理由で落ちているなら、この対照は空振りである。
 * 同じ位置を読点区切りの並びへ書き換えた写しを作り、すべてが現れることを主張する。
 */
function checkNumberRangeControlActuallyReacts(): string[] {
  const failures: string[] = [];
  const mutated = rewriteRangesAsIdList(NUMBER_RANGE_IS_NOT_EXPANDED);
  if (mutated === NUMBER_RANGE_IS_NOT_EXPANDED) {
    failures.push('見本の範囲を書き換えられておらず、変異が差分を作っていない');
    return failures;
  }
  const found = extractHeaderScopedCoverage(mutated, SELFTEST_FEATURES);
  if (!found.requirements.includes('site-survey/REQ-18')) {
    failures.push('読点区切りへ書き換えても site-survey/REQ-18 が現れない（対照が空振りしている）');
  }
  const commaSeparatedBranches = ['22.2', '22.3', '22.4', '22.5', '22.6'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (commaSeparatedBranches.length === 0) {
    failures.push('素材 commaSeparatedBranches が空です（この確認が空振りしています）');
  }
  for (const branch of commaSeparatedBranches) {
    const id = `site-survey/REQ-${branch}`;
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(`読点区切りへ書き換えても ${id} が現れない（対照が空振りしている）`);
    }
  }
  return failures;
}

/**
 * 陰性対照: 枝番を持たない識別子欄から、受入基準の被覆を主張しない
 *
 * 識別子欄の一項目は「要件番号」と「枝番（省略可）」から成る。枝番が書かれていない項目は
 * **要件そのものの被覆**であって、受入基準の被覆ではない。欠けた枝番を既定値で埋めると、
 * 書かれていない受入基準（`REQ-17.1` など）を名乗ることになる。
 *
 * 115.197 のレビューが実測した: `parseHeaderListItemIds` の `criterion: head[2] ?? null` を
 * `?? '1'` へ変えると自己検査は 52/52 緑のまま、`--json` に
 * `user-authentication/REQ-17.1` `REQ-18.1` `REQ-27A.1` など約20件の
 * **存在しない被覆主張が出現した**（人向けゲートは他の被覆源が同じ番号を拾うため一致し、
 * 機械可読出力の側だけが誤る）。
 *
 * 一項目目は一覧項目の規則も読むが、二項目目（`REQ-18`）は読点の先にあるため
 * **識別子欄の規則だけ**が読む。両方の経路を一枚で通す。
 */
const IDS_WITHOUT_BRANCH_ARE_NOT_CRITERIA = [
  '/**',
  ' * Requirements coverage (user-authentication):',
  ' * - REQ-17, REQ-18: 枝番を持たない並び',
  ' */',
  '',
].join('\n');

function checkIdsWithoutBranchClaimNoCriterion(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(IDS_WITHOUT_BRANCH_ARE_NOT_CRITERIA, SELFTEST_FEATURES);

  const branchlessIds = ['user-authentication/REQ-17', 'user-authentication/REQ-18'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (branchlessIds.length === 0) {
    failures.push('素材 branchlessIds が空です（この確認が空振りしています）');
  }
  for (const id of branchlessIds) {
    if (!found.requirements.includes(id)) {
      failures.push(
        `枝番を持たない識別子欄から要件番号 ${id} を取りこぼした（被覆の過小帰属。` +
          'ここを取りこぼすと以下の陰性主張が空振りする）'
      );
    }
  }
  const forbiddenCriterionIds = ['user-authentication/REQ-17.1', 'user-authentication/REQ-18.1'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (forbiddenCriterionIds.length === 0) {
    failures.push('素材 forbiddenCriterionIds が空です（この確認が空振りしています）');
  }
  for (const id of forbiddenCriterionIds) {
    if (found.acceptanceCriteria.includes(id)) {
      failures.push(
        `枝番の書かれていない識別子欄から受入基準 ${id} を名乗った（書かれていない被覆の主張）`
      );
    }
  }
  // 既定値を `1` 以外（`2` など）にしただけの変異まで捕まえるため、**どの枝番も現れない**ことを言う。
  // 上の名指しだけでは既定値の値に主張が縛られ、値を変えた変異が素通りする（115.197 の実測）
  if (found.acceptanceCriteria.length !== 0) {
    failures.push(
      '枝番の書かれていない識別子欄から受入基準を名乗った: ' +
        `${found.acceptanceCriteria.join(', ')}（欠けた枝番を既定値で埋めてはならない）`
    );
  }
  return failures;
}

/**
 * 陽性対照: 枝つき要件番号（`REQ-27A`）を基底番号へ丸めない
 *
 * 要件定義書には `### 要件27A: 二要素認証（2FA）ログイン機能` のように
 * 英字の枝を持つ**要件番号**が実在する（受入基準の枝つき番号 `1a.` とは別物である）。
 * 一覧項目の規則と識別子欄の文法はどちらも `[A-E]` を認めており、
 * 落とすと `REQ-27A` は `REQ-27`（実在しない番号）へ化けて分子から静かに消える。
 *
 * 二つの経路を別々に通す。一行目は識別子欄が散文のため**一覧項目の規則だけ**が読み、
 * 二行目は接頭辞を持たない並びのため**識別子欄だけ**が読む。
 * 一方だけを置くともう一方の経路の変異を捕まえられない。
 *
 * **陰性側（`REQ-27` が現れないこと）はここでは述べない。** その主張は
 * `SYNTHETIC_NEGATIVE_CONTROLS` の `nonexistence` の一件が持つ。併置しておくと、
 * 非空振りの根拠が「同じ検査に陽性側があるから」という散文の理由付けに留まり、
 * 資料の札（陽性のみ／陰性側）と実際の主張が食い違う（タスク 115.255）。
 * この関数が述べるのは陽性側だけであり、名前のとおり陽性対照である。
 */
const LETTERED_REQUIREMENT_NUMBER = [
  '/**',
  ' * Requirements (user-authentication):',
  ' * - REQ-27A（二要素認証）: 識別子欄が散文のため、一覧項目の規則だけが読む',
  ' * - 27A.1, 27A.2: 接頭辞を持たない並びのため、識別子欄だけが読む',
  ' */',
  '',
].join('\n');

function checkLetteredRequirementNumberIsRecorded(): string[] {
  const failures: string[] = [];
  const found = extractHeaderScopedCoverage(LETTERED_REQUIREMENT_NUMBER, SELFTEST_FEATURES);

  if (!found.requirements.includes('user-authentication/REQ-27A')) {
    failures.push(
      '一覧項目の規則が枝つき要件番号 user-authentication/REQ-27A を取りこぼした（被覆の過小帰属）'
    );
  }
  const suffixedBranches = ['27A.1', '27A.2'];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (suffixedBranches.length === 0) {
    failures.push('素材 suffixedBranches が空です（この確認が空振りしています）');
  }
  for (const branch of suffixedBranches) {
    const id = `user-authentication/REQ-${branch}`;
    if (!found.acceptanceCriteria.includes(id)) {
      failures.push(`識別子欄が枝つき要件番号の並び ${id} を取りこぼした（被覆の過小帰属）`);
    }
  }
  return failures;
}

/**
 * 実データの側から、枝つき要件番号の被覆印が実在し、拾われていることを見る
 *
 * 仮想の資料だけでは「この規則が実データに効いている」とは言えない。
 * 当該の記述が失われたら前提が失われたとして失敗させる（黙って素通りさせない）。
 */
function checkRealLetteredRequirementMarkExists(): string[] {
  const failures: string[] = [];
  const target = 'backend/src/routes/auth.routes.ts';
  const marker = '- REQ-27A:';
  const expected = 'user-authentication/REQ-27A';

  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) {
    return [`${target} が存在しない（自己検査の前提が失われた）`];
  }
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.includes(marker)) {
    return [`${target}: 前提としている記述「${marker}」が失われた（対照が空振りしている）`];
  }
  const found = extractHeaderScopedCoverage(content, discoverFeatures());
  if (!found.requirements.includes(expected)) {
    failures.push(`${target}: 枝つき要件番号の被覆印 ${expected} を取りこぼした`);
  }
  if (found.requirements.includes('user-authentication/REQ-27')) {
    failures.push(
      `${target}: 枝つき要件番号を基底番号 user-authentication/REQ-27 へ丸めた（実在しない番号）`
    );
  }
  return failures;
}

/**
 * 引用されたヘッダーの字面は宣言ではない（タスク 115.226）
 *
 * 一枚の JSDoc に、**宣言として置かれたヘッダー一つ**と、**引用された字面三つ**を並べる。
 * 引用の形は互いに異なる三通りで、いずれも実データに現れうる形である。
 *
 *   1. 散文の途中にバッククォートで引く（実データが持っていた形）
 *   2. 行頭にバッククォートで引く
 *   3. コードフェンスで囲った見本の中に置く
 *
 * 三つとも配下に一覧項目を伴う。**引用が宣言と読まれれば、その一覧項目が被覆印になる**。
 * 是正前はまさにそう読まれていた。正当な宣言の側（`REQ-3.1`）は拾われねばならず、
 * 引用の側（`REQ-4.1` / `REQ-5.1` / `REQ-6.1`）は拾われてはならない——両側を一枚で固定する。
 *
 * **この資料の分離は区間の規則4（JSDoc 内の段落の切れ目）にも半分寄り掛かっている。**
 * 引用の三つは宣言のヘッダーより後ろに置かれているため、規則4 が無ければ宣言の区間が
 * 段落の切れ目を越えて伸び、引用の配下の一覧項目まで飲み込む。実際、
 * `resolveHeaderSectionEnd` から規則4（`jsDocParagraphBreak` の上限）を外すと
 * 自己検査 63 件のうち 5 件が赤くなり、対をなす `checkQuotedHeaderIsNotDetected` は
 * その一つとして `REQ-4.1` / `REQ-5.1` / `REQ-6.1` の三つすべてを挙げる
 * （2026-09-01 に `npm run check:req-coverage:selftest` で実測。タスク 115.226）。
 * 規則4 を触る者は、本資料が赤くなったとき**引用の判定が壊れたとは限らない**ことを知ること。
 */
const QUOTED_HEADER_IS_NOT_A_DECLARATION = [
  '/**',
  ' * Requirements (site-survey):',
  ' * - REQ-3.1: 宣言として置かれたヘッダーの配下（拾われねばならない）',
  ' *',
  ' * 従前はこの記述を `Requirements (site-survey):` の見出しの下に置いていた。',
  ' * - REQ-4.1: 散文の途中に引用された字面の配下（拾われてはならない）',
  ' *',
  ' * `Requirements coverage (site-survey):`',
  ' * - REQ-5.1: 行頭に引用された字面の配下（拾われてはならない）',
  ' *',
  ' * ```',
  ' * Requirements (site-survey):',
  ' * - REQ-6.1: コードフェンスで囲った見本の配下（拾われてはならない）',
  ' * ```',
  ' */',
  '',
].join('\n');

/** 引用の三形と、それぞれが運ぶ拾われてはならない受入基準 */
const QUOTED_HEADER_FORMS: ReadonlyArray<{ label: string; absent: string }> = [
  { label: '散文の途中のバッククォート', absent: 'site-survey/REQ-4.1' },
  { label: '行頭のバッククォート', absent: 'site-survey/REQ-5.1' },
  { label: 'コードフェンスの内側', absent: 'site-survey/REQ-6.1' },
];

/**
 * 機構: 引用された字面をヘッダーと読まず、宣言されたヘッダーは落とさない
 *
 * 両側を一つの資料で見る。片側だけを見る検査は、規則を厳しくしすぎた是正
 * （正当なヘッダーまで落とす形）を緑で通してしまう。
 *
 * さらに、資料の前へ**閉じ忘れのフェンスだけを持つ別のコメントの塊**を足した写しでも
 * 同じ四つの判定が保たれることを課す。フェンスの開閉をファイル全文の偶奇で数える実装は、
 * ここで塊を跨いで状態が漏れ、宣言の側（`site-survey/REQ-3.1`）を無言で落とす。
 * `isDeclaredCoverageHeader` の走査の起点を `enclosingCommentBlockStart(content, lineStart)`
 * から `0` へ戻すと、自己検査 63 件のうち本検査 1 件だけが赤くなり、
 * 「site-survey/REQ-3.1 を取りこぼした」と「site-survey/REQ-6.1 が拾われた」の
 * 両向きを同時に挙げる（2026-09-01 実測。タスク 115.226）。
 */
function checkQuotedHeaderIsNotDetected(): string[] {
  const failures: string[] = [];

  // 第3原則: 引用の形が一件も登録されていないなら、検査は何も述べていない
  if (QUOTED_HEADER_FORMS.length === 0) {
    return ['引用の形が一件も登録されていない（対照群が空。検査が空振りしている）'];
  }

  const found = extractHeaderScopedCoverage(QUOTED_HEADER_IS_NOT_A_DECLARATION, SELFTEST_FEATURES);

  if (!found.acceptanceCriteria.includes('site-survey/REQ-3.1')) {
    failures.push(
      '宣言として置かれたヘッダーの配下 site-survey/REQ-3.1 を取りこぼした' +
        '（引用を除く規則が正当なヘッダーまで落としている）'
    );
  }
  for (const { label, absent } of QUOTED_HEADER_FORMS) {
    if (found.acceptanceCriteria.includes(absent)) {
      failures.push(`${label}で引かれた字面をヘッダーと読んだ（${absent} が被覆印になっている）`);
    }
  }

  // 機構: フェンスの開閉はヘッダーが属するコメントの塊の中だけで数える
  // （`enclosingCommentBlockStart`）。塊の外の閉じ忘れに依らないなら、無関係な塊へ
  // 閉じ忘れのフェンスを足しても四つの判定は一つも動かない。全文の偶奇で数える実装へ
  // 戻すと、宣言の側（REQ-3.1）が無言で落ちる——帰属と切れ目の両方から消えるため、
  // 被覆の過小計上と、切れ目を失った区間の過大帰属が同時に起きる。
  const unclosedFenceInAnotherBlock = ['/**', ' * ```', ' * 閉じ忘れた見本', ' */', ''].join('\n');
  // 素材が閉じ忘れのフェンスを失うと、以下は「塊の外の閉じ忘れに依らない」ことを一切
  // 確かめなくなり、直前の確認の写しへ退化する（第3原則。115.252）
  if (!unclosedFenceInAnotherBlock.includes(' * ```')) {
    failures.push(
      '合成素材 unclosedFenceInAnotherBlock が閉じ忘れのフェンスを持ちません' +
        '（この確認が空振りしています）'
    );
  }
  const afterUnclosedFence = extractHeaderScopedCoverage(
    unclosedFenceInAnotherBlock + QUOTED_HEADER_IS_NOT_A_DECLARATION,
    SELFTEST_FEATURES
  );
  if (!afterUnclosedFence.acceptanceCriteria.includes('site-survey/REQ-3.1')) {
    failures.push(
      '閉じ忘れのフェンスを別の塊に持つ写しで site-survey/REQ-3.1 を取りこぼした' +
        '（フェンスの開閉を全文の偶奇で数えている。塊の外の閉じ忘れ一つが以降のヘッダーを' +
        'すべて落とす）'
    );
  }
  for (const { label, absent } of QUOTED_HEADER_FORMS) {
    if (afterUnclosedFence.acceptanceCriteria.includes(absent)) {
      failures.push(
        `${label}: 閉じ忘れのフェンスを別の塊に持つ写しで ${absent} が拾われた` +
          '（塊を跨いでフェンスの状態が漏れている）'
      );
    }
  }

  return failures;
}

/**
 * 陽性対照: 文字列リテラル中の**終端の無い** `/*` の後ろに置かれた行コメントのヘッダー
 *
 * `const OPENER = '/*';` は TypeScript としてはただの文字列であって、コメントの開きでは
 * ない（終端の無いブロックコメントは構文誤りであり、型検査を通ったファイルには現れない）。
 * 塊の始まりをこのリテラルの位置に取ると、コメントですらない行に置いたフェンスまで
 * 数えられ、正当なヘッダーが宣言でないと判定される。
 *
 * ヘッダーの直前は**素の空行**である。行コメントの連なりはそこで切れるため、
 * 塊の始まりを正しく取れば、フェンスの行は走査の範囲に一度も入らない。
 */
const UNTERMINATED_BLOCK_OPEN_BEFORE_HEADER = [
  "const OPENER = '/*';",
  '// ```',
  '// 見本の中身（塊の外にあり、ヘッダーの判定に入ってはならない）',
  '',
  '// Requirements (site-survey):',
  '// - REQ-13.2: 終端の無い開きに影響されず拾われねばならない',
  '',
].join('\n');

// ============================================================================
// 機能名を欠くヘッダー（読まれない被覆印）— タスク 115.308
// ============================================================================
//
// `Requirements:` とだけ書いたヘッダーの下の `- 1.3: …` は、人が読めば被覆を主張して
// いるのに機械が一件も拾わない。是正前は、その量がレポートのどこにも現れなかった。
// 以下の三つは順に「数え方が両向きに働くこと」「実データの量が上限を超えないこと」
// 「規則を緩めて機能名を推定する案が安全でないこと」を固定する。

/**
 * 機構: 機能名を欠くヘッダーの数え方が両向きに働く
 *
 * 陽性（数えなければならない側）と陰性（数えてはならない側）を組で置く。
 * 陰性を欠くと、機能名つきの正当なヘッダーまで「読まれていない」と報告して開示が嘘になる
 * （向きは過大報告）。
 *
 * **当てた変異と出力**（2026-09-06 にリポジトリルートで実測）:
 * `FEATURELESS_COVERAGE_HEADER_REGEX` を `/Requirements[^\n]*:/` へ広げると、
 * `npx tsx scripts/check-requirement-coverage.selftest.ts` は 2 件失敗・EXIT=1 となり、
 * 本検査が「`Requirements (site-survey):` を機能名を欠くヘッダーとして数えた（開示が過大に
 * なる）」を挙げる（もう 1 件はラチェットが上限超過を挙げる）。
 * `isDeclaredCoverageHeader` の判定を外す変異でも同じく 2 件失敗し、本検査が
 * 「散文の中で引用された `Requirements:` の字面を宣言として数えた」を挙げる。
 */
function checkFeaturelessHeaderCountingIsTwoSided(): string[] {
  const failures: string[] = [];

  const featureless = [
    '/**',
    ' * Requirements:',
    ' * - 1.3: 何かの条文',
    ' * - 11.2: 別の条文',
    ' */',
  ].join('\n');
  const named = [
    '/**',
    ' * Requirements (site-survey):',
    ' * - 1.3: 何かの条文',
    ' * - 11.2: 別の条文',
    ' */',
  ].join('\n');
  const quoted = [
    '/**',
    ' * 従前はこの記述を `Requirements:` の見出しの下に置いていた',
    ' * - 1.3: 何かの条文',
    ' */',
  ].join('\n');
  const coverageWord = ['//  Requirements coverage:', '//  - 4.1: 何かの条文'].join('\n');

  // 陽性: 機能名を欠くヘッダーは一件、配下の名乗りは二件
  const positive = readFeaturelessHeadersInContent(featureless);
  if (positive.length !== 1) {
    failures.push(
      `機能名を欠くヘッダーを ${positive.length} 件と数えた（1 件であるべき）。開示が黙る`
    );
  } else if (positive[0]?.dormantNameCount !== 2) {
    failures.push(
      `眠っている名乗りを ${positive[0]?.dormantNameCount} 件と数えた（2 件であるべき）`
    );
  }

  // 陽性: `coverage` を挟む形も同じく機能名を欠く
  if (readFeaturelessHeadersInContent(coverageWord).length !== 1) {
    failures.push('`Requirements coverage:` を機能名を欠くヘッダーとして数えていない');
  }

  // 陰性: 機能名つきのヘッダーは「読まれていない」側に数えてはならない
  if (readFeaturelessHeadersInContent(named).length !== 0) {
    failures.push(
      '`Requirements (site-survey):` を機能名を欠くヘッダーとして数えた（開示が過大になる）'
    );
  }

  // 陰性: 引用された字面は宣言ではない（本番のヘッダー収集と同じ判定を通っているか）
  if (readFeaturelessHeadersInContent(quoted).length !== 0) {
    failures.push('散文の中で引用された `Requirements:` の字面を宣言として数えた');
  }

  // 陽性側と陰性側で本当に**同じ名乗り**を見ているかを確かめる。
  // 機能名つきの側は本番の抽出が拾い、機能名を欠く側は一件も拾わない——これが起票の核心である
  const readByProduction = extractHeaderScopedCoverage(named, ['site-survey']);
  if (readByProduction.acceptanceCriteria.length !== 2) {
    failures.push(
      `機能名つきのヘッダー配下を本番の抽出が ${readByProduction.acceptanceCriteria.length} 件しか拾わない（2 件であるべき。対照の前提が崩れた）`
    );
  }
  const readWithoutFeature = extractHeaderScopedCoverage(featureless, ['site-survey']);
  if (readWithoutFeature.acceptanceCriteria.length !== 0) {
    failures.push(
      '機能名を欠くヘッダーの配下を本番の抽出が拾った（起票の前提が変わった。開示と上限を測り直すこと）'
    );
  }

  return failures;
}

/**
 * 実データ: 機能名を欠くヘッダーと眠る名乗りが上限を超えていない（ラチェット）
 *
 * 上限は「許した量」であって「正しい量」ではない。減らす方向は失敗しないため、
 * 是正が進んだら定数を下げること。
 *
 * **第3原則**: 走査根が一件もファイルを返さないなら、量が 0 になるのは是正の成果ではなく
 * 前提の崩壊である。その場合は緑にせず失格にする。
 */
function checkFeaturelessHeaderCountIsBounded(): string[] {
  const failures: string[] = [];

  const scanned = listCoverageScanFiles();
  if (scanned.length === 0) {
    return ['走査根がファイルを一件も返さない（量が 0 になる理由が是正でないので合格にしない）'];
  }

  const report = findFeaturelessCoverageHeaders();
  if (report.headerCount > MAX_FEATURELESS_COVERAGE_HEADERS) {
    failures.push(
      `機能名を欠くヘッダーが ${report.headerCount} 件で上限 ${MAX_FEATURELESS_COVERAGE_HEADERS} 件を超えた`
    );
  }
  if (report.dormantNameCount > MAX_DORMANT_HEADER_NAMES) {
    failures.push(
      `眠っている名乗りが ${report.dormantNameCount} 件で上限 ${MAX_DORMANT_HEADER_NAMES} 件を超えた`
    );
  }
  // 上限に遊びが出たまま放置させない。是正が進んだ分は定数へ反映させる
  if (report.headerCount < MAX_FEATURELESS_COVERAGE_HEADERS) {
    failures.push(
      `機能名を欠くヘッダーが ${report.headerCount} 件へ減った。MAX_FEATURELESS_COVERAGE_HEADERS を同数へ下げること（遊びを持つ上限は、その幅ぶんの無言の追加を吸収する）`
    );
  }
  if (report.dormantNameCount < MAX_DORMANT_HEADER_NAMES) {
    failures.push(
      `眠っている名乗りが ${report.dormantNameCount} 件へ減った。MAX_DORMANT_HEADER_NAMES を同数へ下げること`
    );
  }
  return failures;
}

/**
 * 前提: ファイルの所在から機能名を推定する規則は**安全ではない**（タスク 115.308 の判断根拠）
 *
 * 起票は「読み取り規則側で救えるかも判断すること（ファイルの所在から機能を推定する等）。
 * **規則を緩める場合は、誤った機能へ結び付ける危険を変異で測ること**」を求めた。
 * ここがその変異である。反実仮想を散文で書かず、実データで測る。
 *
 * 測り方（ホールドアウト）: 同一ファイルが他所で機能名を名乗っており**答えが判っている**
 * ファイルだけを取り、そのファイル自身の寄与を除いた同一ディレクトリの他ファイルから
 * 機能名を推定する。推定が一意に決まった中に、答えと食い違う形が現に在る。
 *
 * 誤って結び付いた被覆印は、**存在しない被覆を主張したまま緑になる**——読まれないより悪い。
 * だから規則は緩めず、ヘッダーの側を直す方針を採った。
 *
 * **件数はここに書かない。** 実データは動くため、写した時点から陳腐化する
 * （タスク 115.223 / 115.254 が確立した作法）。主張は「誤りが 0 件ではない」だけである。
 *
 * **第3原則**: 一意に決まる形が一件も無ければ、この検査は何も主張していない。空振りは失格にする。
 * 誤りが 0 件になった場合も失格にする——そのときは判断の前提が動いており、
 * `.kiro/specs/site-survey/design.md` の記録を測り直す必要がある。
 */
function checkDirectoryInferenceMisattributesFeatures(): string[] {
  const featureNames = discoverFeatures();
  if (featureNames.length === 0) {
    return ['機能を一件も検出できない（前提が崩れたので合格にしない）'];
  }
  const headerPattern = new RegExp(ANY_COVERAGE_HEADER_REGEX.source, 'g');
  const inlinePatterns = buildInlineTagPatterns(featureNames);

  // 各ファイルが自分で名乗っている機能名（＝そのファイルの答え）
  const own = new Map<string, Set<string>>();
  for (const file of listCoverageScanFiles()) {
    const content = fs.readFileSync(file, 'utf8');
    const named = new Set<string>();
    headerPattern.lastIndex = 0;
    for (const match of content.matchAll(headerPattern)) {
      if (match.index === undefined || !isDeclaredCoverageHeader(content, match.index)) continue;
      const feature = /\(([A-Za-z0-9_-]+)\)/.exec(match[0]);
      if (feature && feature[1] && featureNames.includes(feature[1])) named.add(feature[1]);
    }
    for (const pattern of inlinePatterns) {
      for (const match of content.matchAll(new RegExp(pattern.source, pattern.flags))) {
        if (match[1]) named.add(match[1]);
      }
    }
    own.set(file, named);
  }

  // ディレクトリごとの機能名（推定の材料）
  const byDirectory = new Map<string, Map<string, number>>();
  for (const [file, named] of own) {
    const directory = path.dirname(file);
    if (!byDirectory.has(directory)) byDirectory.set(directory, new Map());
    const tally = byDirectory.get(directory);
    if (!tally) continue;
    for (const name of named) tally.set(name, (tally.get(name) ?? 0) + 1);
  }

  let decided = 0;
  let misattributed = 0;
  for (const [file, named] of own) {
    if (named.size !== 1) continue;
    const truth = [...named][0];
    if (truth === undefined) continue;
    const tally = byDirectory.get(path.dirname(file));
    if (!tally) continue;
    // 自分自身の寄与を除く（除かないと答えを見ながら推定することになる）
    const others = new Set<string>();
    for (const [name, count] of tally) {
      if (name === truth ? count > 1 : count > 0) others.add(name);
    }
    if (others.size !== 1) continue;
    decided += 1;
    if ([...others][0] !== truth) misattributed += 1;
  }

  if (decided === 0) {
    return [
      'ディレクトリからの推定が一意に決まる形が一件も無い（この確認が空振りしている。第3原則）',
    ];
  }
  if (misattributed === 0) {
    return [
      'ディレクトリからの推定が一件も誤らなかった。タスク 115.308 が「規則を緩めない」と' +
        '判断した根拠（誤って別の機能へ結び付ける形が現に在る）が失われている。' +
        '.kiro/specs/site-survey/design.md の記録を測り直し、判断を見直すこと',
    ];
  }
  return [];
}

/**
 * 実データ: 行の途中で開くフェンスの取りこぼしが発火していない（タスク 115.307）
 *
 * `isCodeFenceDelimiterLine` は**行の中身の先頭でしか**フェンスを見ない。見本を行の途中で
 * 開く形（`例: ` に続けてバッククォート三つを置く形）は開きとしても閉じとしても数えないため、
 * その直後の行に行頭でヘッダーの字面が置かれると宣言と誤読される。**塞いでいない**——
 * 逆向きの取りこぼしを新たに作るためである（理由は当該関数の説明文にある）。
 *
 * 従前、この抜けが実データで発火していないことは**説明文の計数だけが述べていた**。
 * 計数は実データとともに陳腐化し、陳腐化しても誰も何も言わない。本検査はその主張を
 * 散文から機械へ移したものである。**走査根の中に「行の途中に開くフェンスを持つ行」と
 * 「ヘッダーの字面」を同じファイルで併せ持つものが在れば赤くする。**
 *
 * **第3原則。** 走査根がファイルを一件も返さない、あるいは行の途中のフェンスを見つける
 * 判定そのものが働かないときは、合格ではなく前提の崩壊として赤くする。判定が働くことは
 * 実データに拠らない合成の陽性対照で確かめる——実データ側の主張が 0 件であることと、
 * 判定が空振りしていることは、対照を置かなければ区別がつかない。
 */
function checkMidLineFenceFilesCarryNoCoverageHeader(): string[] {
  const failures: string[] = [];

  // 判定は**抽出器の本物**へ委ねる。写しを置くと、本体だけが変わったときに黙って追随しない
  /** フェンスの区切り行では**ない**のに ``` を含む（＝行の途中で開く形） */
  const opensFenceMidLine = (line: string): boolean =>
    !isCodeFenceDelimiterLine(line) && line.includes('```');

  // 陽性対照（合成）。実データが 0 件でも、判定が働いていることをここで独立に固定する
  if (!opensFenceMidLine(' * 例: ```ts の見本')) {
    return ['行の途中で開くフェンスを見つけられない（実データ側の主張が空振りする）'];
  }
  // 陰性対照（合成）。区切り行そのものを「途中で開く形」と数えてはならない
  if (opensFenceMidLine(' * ```ts')) {
    return ['行の中身の先頭にある区切り行を「行の途中で開く形」と数えた（判定が広すぎる）'];
  }

  const files = listCoverageScanFiles();
  if (files.length === 0) {
    return ['走査根がファイルを一件も返さない（前提が崩れたので合格にしない）'];
  }

  const headerPattern = new RegExp(ANY_COVERAGE_HEADER_REGEX.source);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.split('\n').some(opensFenceMidLine)) continue;
    if (!headerPattern.test(content)) continue;
    failures.push(
      `${path.relative(process.cwd(), file)} が「行の途中で開くフェンス」とヘッダーの字面を` +
        '併せ持つ。isCodeFenceDelimiterLine の抜けで宣言と誤読されうるため、' +
        '当該関数の説明文（この抜けは塞いでいないと述べる箇所）を書き改めるか、抜けを塞ぐこと'
    );
  }
  return failures;
}

/**
 * 機構: 文字列リテラル中の終端の無い `/*` が正当なヘッダーを飲み込まない（タスク 115.259）
 *
 * `enclosingCommentBlockStart` の判定 `if (blockClose >= lineStart)` を是正前の
 * `if (blockClose < 0 || blockClose >= lineStart)` へ戻すと、自己検査 71 件のうち本検査
 * 1 件だけが赤くなり、「終端の無い `/*` の後ろに置かれたヘッダーの配下
 * site-survey/REQ-13.2 を取りこぼした」と「リテラルの行の有無で被覆印の集合が変わる」の
 * 二つを挙げる（2026-09-03 に `npm run check:req-coverage:selftest` で実測）。
 *
 * **実データにこの形は無いからこそ、合成で固定する。** 走査根 `CODE_DIRS` のヘッダーの
 * 分岐の内訳は `enclosingCommentBlockStart` の説明文に実測を添えて書いた。実データが
 * 一度も通らない分岐は、壊しても本検査の外では誰も赤くならない。
 */
function checkUnterminatedBlockOpenDoesNotSwallowHeader(): string[] {
  const failures: string[] = [];
  const fixture = UNTERMINATED_BLOCK_OPEN_BEFORE_HEADER;
  const expected = 'site-survey/REQ-13.2';

  // 第3原則: 資料が前提の三つ（リテラルの行・終端の無い開き・塊の外のフェンス）の
  // いずれかを失えば、この検査はただのヘッダー抽出の写しへ退化する。空振りは失格にする
  const literalLine = fixture.split('\n').find((line) => line.includes('OPENER'));
  if (literalLine === undefined) {
    return ['資料が文字列リテラルの行を失った（この検査が空振りしている）'];
  }
  const blockOpen = fixture.indexOf('/*');
  if (blockOpen < 0) {
    return ['資料が `/*` を一つも持たない（この検査が空振りしている）'];
  }
  if (fixture.indexOf('*/', blockOpen + 2) >= 0) {
    return ['資料の `/*` が終端を持つ（終端の無い開きを含まない。この検査が空振りしている）'];
  }
  if (!fixture.split('\n').some((line) => /^\/\/ `{3,}/.test(line))) {
    return [
      '資料が塊の外のフェンスを失った（誤った起点でもヘッダーが落ちなくなり、空振りしている）',
    ];
  }

  const found = extractHeaderScopedCoverage(fixture, SELFTEST_FEATURES);
  if (!found.acceptanceCriteria.includes(expected)) {
    failures.push(
      `終端の無い \`/*\` の後ろに置かれたヘッダーの配下 ${expected} を取りこぼした` +
        '（文字列リテラル中の `/*` を塊の始まりと読み、塊の外のフェンスまで数えている）'
    );
  }

  // 対照: リテラルの行だけを除いた同一の写し。両者の判定が食い違うなら、
  // ヘッダーの読み取りがコメントですらない一行の有無に依存している
  const withoutLiteral = fixture
    .split('\n')
    .filter((line) => line !== literalLine)
    .join('\n');
  const control = extractHeaderScopedCoverage(withoutLiteral, SELFTEST_FEATURES);
  if (!control.acceptanceCriteria.includes(expected)) {
    failures.push(
      `対照（リテラルの行を除いた写し）で ${expected} を取りこぼした（資料そのものが壊れている）`
    );
  }
  const asText = (ids: readonly string[]): string => JSON.stringify([...ids].sort());
  if (asText(found.acceptanceCriteria) !== asText(control.acceptanceCriteria)) {
    failures.push(
      'リテラルの行の有無で被覆印の集合が変わる' +
        `（有: ${asText(found.acceptanceCriteria)} / 無: ${asText(control.acceptanceCriteria)}）`
    );
  }

  return failures;
}

/**
 * 機構: 引用の判定そのものが両向きに働くことを確かめる
 *
 * `checkQuotedHeaderIsNotDetected` は抽出の結果を見るため、一覧項目の側の規則
 * （印の判定・識別子欄の文法）が先に抑えていても緑になりうる。ここは
 * `isDeclaredCoverageHeader` を直接呼び、資料の中の四つの字面それぞれについて
 * 宣言か引用かの判定を突き合わせる。判定が一律 true / 一律 false へ退化すれば赤くなる。
 */
function checkDeclaredHeaderPredicateIsTwoSided(): string[] {
  const failures: string[] = [];
  const content = QUOTED_HEADER_IS_NOT_A_DECLARATION;
  const occurrences: number[] = [];
  const pattern = /Requirements\s*(?:coverage\s*)?\(site-survey\):/g;
  for (const match of content.matchAll(pattern)) {
    if (match.index !== undefined) occurrences.push(match.index);
  }

  // 資料は宣言 1 件と引用 3 件を持つ。数が合わなければ資料か規則が変質している
  if (occurrences.length !== 4) {
    return [`資料の中のヘッダーの字面が 4 件でなく ${occurrences.length} 件（資料が変質している）`];
  }

  const verdicts = occurrences.map((index) => isDeclaredCoverageHeader(content, index));
  const expected = [true, false, false, false];
  // 合成素材が資料と件数で揃わなければ以下の照合は回りきらず、この確認は何も主張しない
  // （第3原則。115.252）
  if (expected.length !== occurrences.length) {
    failures.push(
      `合成素材 expected が ${expected.length} 件で、資料の ${occurrences.length} 件と` +
        '揃っていません（この確認が空振りしています）'
    );
  }
  for (let index = 0; index < expected.length; index++) {
    if (verdicts[index] !== expected[index]) {
      const line = content.slice(0, occurrences[index]).split('\n').length;
      failures.push(
        `資料の ${line} 行目の字面の判定が ${verdicts[index]} である（期待は ${expected[index]}）`
      );
    }
  }
  return failures;
}

// ============================================================================
// 合成対照の陰性側が空振りしていないことの機構（タスク 115.224）
// ============================================================================
//
// 陰性対照は「この番号は拾われない」と述べる。**静かな空振りが成立するのは陰性側だけ**で
// あり（115.191）、拾われない理由が主張した規則と別のところにあっても点数は満点のまま通る。
// 115.192 は実データの側で、115.194 は合成の側で、同じ空振りを一件ずつ手で見つけて塞いだ。
//
// ここに置くのは一件ずつの是正ではなく**組で見る網**である。陰性側の資料をすべて登録し、
// 「何が抑えているか」の主張を機械で確かめる。資料を新しく足した者は分類を迫られる
// （`checkEverySyntheticFixtureIsClassified` が未分類を失敗にする）。

/**
 * 陰性対照が「何によって抑えられている」と述べているか
 *
 * - `boundary`: 区間の上限（`resolveHeaderSectionEnd` の四つの上限）が抑えている。
 *   番号を運ぶ行そのものは**拾われうる形**でなければならない。拾われえない形なら、
 *   上限を外しても番号は現れず、対照は何も測っていない（115.224 の起票理由）。
 * - `shape`: 一覧の印（`findListItemMarker`）か識別子欄の文法
 *   （`parseHeaderListItemIds`）が抑えている。位置を最も緩くしても拾われてはならない。
 *   拾われるなら、抑えていたのは位置であって主張が誤っている。
 * - `quotation`: ヘッダーの字面が引用であって宣言でない（`isDeclaredCoverageHeader`）ため、
 *   そもそも区間が始まらない。区間が無いので `boundary` の探索（位置を緩める写し）は
 *   意味を成さず、代わりに **引用を解いた写し**（`unquote`）で番号が現れることを課す。
 *   現れないなら、抑えていたのは引用ではなく別の規則であり主張が誤っている（タスク 115.226）。
 * - `nonexistence`: 番号が資料のどこにも書かれていない。位置にも形にも抑えられておらず、
 *   抽出器が**丸めや捏造で作り出したときだけ**現れる（枝つき要件番号 `REQ-27A` を基底の
 *   `REQ-27` へ丸める形が実例である）。`boundary` と `shape` はどちらも「資料に在る番号を
 *   何が抑えているか」を述べる語彙であり、この形を表現できない。空振りの危険はここでも
 *   同じで、当該行が走査の範囲に入っていなければ「現れない」は何も測らない。ヘッダーと
 *   当該行だけの写しから**番号が一つでも拾われること**を課し、当該行が現に読まれている
 *   ことを機械の側で示す（タスク 115.255）。
 */
type NegativeControlSuppressor = 'boundary' | 'shape' | 'quotation' | 'nonexistence';

/** 陰性対照の一件（資料 × 拾われてはならない番号を運ぶ一行） */
interface SyntheticNegativeControl {
  /** 資料の定数名。分類の走査（`checkEverySyntheticFixtureIsClassified`）と照合する */
  fixtureName: string;
  /** 資料そのもの */
  fixture: string;
  /** 抽出へ渡す機能名。`--feature` の絞り込みを再現する事例があるため事例ごとに持つ */
  features: readonly string[];
  /** 拾われてはならない番号を運ぶ行。資料に逐語で存在しなければならない */
  carrier: string;
  /** 探索の写しで起点にするヘッダー行。当該番号の機能を名乗るもの */
  header: string;
  /** 拾われてはならない受入基準 */
  absentCriteria?: readonly string[];
  /** 拾われてはならない要件番号 */
  absentRequirements?: readonly string[];
  /** 何が抑えていると述べるか */
  suppressedBy: NegativeControlSuppressor;
  /**
   * 引用を解く逐語の置換（`suppressedBy: 'quotation'` の件だけが持つ）
   *
   * `from` は資料に**ちょうど一度**現れねばならない。二度以上現れる置換は、どの引用を
   * 解いたのかが定まらず、対照の主張が曖昧になる。
   */
  unquote?: { from: string; to: string };
}

/**
 * 陰性側の合成対照の全件
 *
 * 一つの資料が複数の行で別々のことを述べている場合は、**行ごとに一件**とする。
 * 行を一つにまとめると、どれか一行が拾われうる形でありさえすれば通ってしまい、
 * 残りの行の空振りが隠れる。
 */
const SYNTHETIC_NEGATIVE_CONTROLS: readonly SyntheticNegativeControl[] = [
  {
    fixtureName: 'MULTI_HEADER_JSDOC',
    fixture: MULTI_HEADER_JSDOC,
    features: SELFTEST_FEATURES,
    header: ' * Requirements (site-survey):',
    carrier: ' * - REQ-2.2: 別機能の受入基準',
    absentCriteria: ['site-survey/REQ-2.2'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'MULTI_HEADER_JSDOC',
    fixture: MULTI_HEADER_JSDOC,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (quantity-table-generation):',
    carrier: ' * - REQ-1.1: 先頭の機能の受入基準',
    absentCriteria: ['quantity-table-generation/REQ-1.1'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'ADJACENT_HEADERS_JSDOC',
    fixture: ADJACENT_HEADERS_JSDOC,
    features: SELFTEST_FEATURES,
    header: ' * Requirements (site-survey):',
    carrier: ' * - REQ-2.2: 別機能の受入基準',
    absentCriteria: ['site-survey/REQ-2.2'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'ADJACENT_HEADERS_JSDOC',
    fixture: ADJACENT_HEADERS_JSDOC,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (quantity-table-generation):',
    carrier: ' * - REQ-1.1: 先頭の機能の受入基準',
    absentCriteria: ['quantity-table-generation/REQ-1.1'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'SINGLE_HEADER_JSDOC_THEN_BODY',
    fixture: SINGLE_HEADER_JSDOC_THEN_BODY,
    features: SELFTEST_FEATURES,
    header: ' * Requirements (site-survey):',
    carrier: "  '- REQ-9.9: これは被覆の主張ではなく本体側の文字列である',",
    absentCriteria: ['site-survey/REQ-9.9'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'PRECEDING_BLOCK_COMMENT_THEN_HEADER',
    fixture: PRECEDING_BLOCK_COMMENT_THEN_HEADER,
    features: SELFTEST_FEATURES,
    header: ' * Requirements (site-survey):',
    carrier: "export const NOTES = ['- REQ-23.9: これは被覆の主張ではなく本体側の文字列である'];",
    absentCriteria: ['site-survey/REQ-23.9'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'HEADER_OF_UNLISTED_FEATURE',
    fixture: HEADER_OF_UNLISTED_FEATURE,
    // `--feature=site-survey` に相当する。対照の側と同じ絞り込みで測る
    features: ['site-survey'],
    header: ' * Requirements (site-survey):',
    carrier: ' * - REQ-7.7: 帰属の対象に含まれていない機能の受入基準',
    absentCriteria: ['site-survey/REQ-7.7'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'PARAGRAPH_BREAK_THEN_PROSE',
    fixture: PARAGRAPH_BREAK_THEN_PROSE,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - REQ-4.2 はE2Eテストで検証困難なため省略',
    absentCriteria: ['site-survey/REQ-4.2'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'PLAIN_HEADER_THEN_BLANK_LINE',
    fixture: PLAIN_HEADER_THEN_BLANK_LINE,
    features: SELFTEST_FEATURES,
    header: '// Requirements (user-authentication):',
    carrier: '// - REQ-5.2: 空行の後（別の話題）',
    absentCriteria: ['user-authentication/REQ-5.2'],
    suppressedBy: 'boundary',
  },
  {
    fixtureName: 'JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER',
    fixture: JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' *   REQ-8.2 を無条件に検証する（一覧項目の継続行。印を持たない）',
    absentCriteria: ['site-survey/REQ-8.2'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER',
    fixture: JSDOC_LINE_PREFIX_IS_NOT_A_LIST_MARKER,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * REQ-8.3 は本ファイルでは検証していない（行頭のコメント記号は印ではない）',
    absentCriteria: ['site-survey/REQ-8.3'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'BLOCK_COMMENT_OPENER_IS_NOT_A_LIST_MARKER',
    fixture: BLOCK_COMMENT_OPENER_IS_NOT_A_LIST_MARKER,
    features: SELFTEST_FEATURES,
    header: '// Requirements (user-authentication):',
    carrier: '/** REQ-11.2 はコメントの開始記号の後ろにあるだけで、印を持たない */',
    absentCriteria: ['user-authentication/REQ-11.2'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'PROSE_BULLET_IS_NOT_AN_ID_LIST',
    fixture: PROSE_BULLET_IS_NOT_AN_ID_LIST,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - 15.2 または 15.3 を満たす: 識別子の並びではない散文の箇条書き',
    absentCriteria: ['site-survey/REQ-15.2', 'site-survey/REQ-15.3'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'PROSE_BULLET_IS_NOT_AN_ID_LIST',
    fixture: PROSE_BULLET_IS_NOT_AN_ID_LIST,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - 文字数制限（名称15.4文字、規格15.5文字）: 数値を含む散文',
    absentCriteria: ['site-survey/REQ-15.4', 'site-survey/REQ-15.5'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'PROSE_BULLET_IS_NOT_AN_ID_LIST',
    fixture: PROSE_BULLET_IS_NOT_AN_ID_LIST,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' *   15.6, 15.7: 印を持たない継続行',
    absentCriteria: ['site-survey/REQ-15.6', 'site-survey/REQ-15.7'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'PROSE_BULLET_IS_NOT_AN_ID_LIST',
    fixture: PROSE_BULLET_IS_NOT_AN_ID_LIST,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - 15.8 / 15.9: スラッシュ区切りの並び（据え置く書式。識別子欄と認めない）',
    absentCriteria: ['site-survey/REQ-15.8', 'site-survey/REQ-15.9'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'PROSE_BULLET_IS_NOT_AN_ID_LIST',
    fixture: PROSE_BULLET_IS_NOT_AN_ID_LIST,
    features: SELFTEST_FEATURES,
    header: '// Requirements coverage (user-authentication):',
    carrier: '//   21.2, 21.3: 行コメントの印を持たない継続行',
    absentCriteria: ['user-authentication/REQ-21.2', 'user-authentication/REQ-21.3'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'NUMBER_RANGE_IS_NOT_EXPANDED',
    fixture: NUMBER_RANGE_IS_NOT_EXPANDED,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - REQ-17-REQ-19: 要件番号の範囲（両端を記録し、間は展開しない）',
    absentRequirements: ['site-survey/REQ-18'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'NUMBER_RANGE_IS_NOT_EXPANDED',
    fixture: NUMBER_RANGE_IS_NOT_EXPANDED,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (site-survey):',
    carrier: ' * - REQ-22.1〜22.6: 受入基準の範囲（先頭だけを読む）',
    absentCriteria: [
      'site-survey/REQ-22.2',
      'site-survey/REQ-22.3',
      'site-survey/REQ-22.4',
      'site-survey/REQ-22.5',
      'site-survey/REQ-22.6',
    ],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'IDS_WITHOUT_BRANCH_ARE_NOT_CRITERIA',
    fixture: IDS_WITHOUT_BRANCH_ARE_NOT_CRITERIA,
    features: SELFTEST_FEATURES,
    header: ' * Requirements coverage (user-authentication):',
    carrier: ' * - REQ-17, REQ-18: 枝番を持たない並び',
    absentCriteria: ['user-authentication/REQ-17.1', 'user-authentication/REQ-18.1'],
    suppressedBy: 'shape',
  },
  {
    fixtureName: 'QUOTED_HEADER_IS_NOT_A_DECLARATION',
    fixture: QUOTED_HEADER_IS_NOT_A_DECLARATION,
    features: SELFTEST_FEATURES,
    header: ' * 従前はこの記述を `Requirements (site-survey):` の見出しの下に置いていた。',
    carrier: ' * - REQ-4.1: 散文の途中に引用された字面の配下（拾われてはならない）',
    absentCriteria: ['site-survey/REQ-4.1'],
    suppressedBy: 'quotation',
    unquote: {
      from: ' * 従前はこの記述を `Requirements (site-survey):` の見出しの下に置いていた。',
      to: ' * Requirements (site-survey):',
    },
  },
  {
    fixtureName: 'QUOTED_HEADER_IS_NOT_A_DECLARATION',
    fixture: QUOTED_HEADER_IS_NOT_A_DECLARATION,
    features: SELFTEST_FEATURES,
    header: ' * `Requirements coverage (site-survey):`',
    carrier: ' * - REQ-5.1: 行頭に引用された字面の配下（拾われてはならない）',
    absentCriteria: ['site-survey/REQ-5.1'],
    suppressedBy: 'quotation',
    unquote: {
      from: ' * `Requirements coverage (site-survey):`',
      to: ' * Requirements coverage (site-survey):',
    },
  },
  {
    fixtureName: 'QUOTED_HEADER_IS_NOT_A_DECLARATION',
    fixture: QUOTED_HEADER_IS_NOT_A_DECLARATION,
    features: SELFTEST_FEATURES,
    header: ' * ```\n * Requirements (site-survey):',
    carrier: ' * - REQ-6.1: コードフェンスで囲った見本の配下（拾われてはならない）',
    absentCriteria: ['site-survey/REQ-6.1'],
    suppressedBy: 'quotation',
    unquote: {
      from: ' * ```\n * Requirements (site-survey):',
      to: ' * Requirements (site-survey):',
    },
  },
  {
    // 陽性対照 `checkLetteredRequirementNumberIsRecorded` と同じ資料の陰性側である。
    // 従前はこの主張を当該の陽性対照へ併置し、資料には「陽性のみ」の札を貼っていた
    // （タスク 115.255 が是正）。非空振りの根拠が併置した陽性側の散文だったため、
    // 主張をここへ移し、当該行が走査の範囲に入っていることを機械の側で確かめる
    fixtureName: 'LETTERED_REQUIREMENT_NUMBER',
    fixture: LETTERED_REQUIREMENT_NUMBER,
    features: SELFTEST_FEATURES,
    header: ' * Requirements (user-authentication):',
    carrier: ' * - REQ-27A（二要素認証）: 識別子欄が散文のため、一覧項目の規則だけが読む',
    absentRequirements: ['user-authentication/REQ-27'],
    suppressedBy: 'nonexistence',
  },
];

/**
 * 陽性側だけを述べる資料（陰性の主張を持たないため登録の対象外）
 *
 * 分類の走査はここに挙がっていない資料を未分類として失敗させる。
 * 「陰性の主張を持たない」は目視の判断であるため、**理由を併記して残す**。
 *
 * **札の意味は「陰性の主張が一つも無い」である。** 一つでも「この番号は現れない」を
 * 述べるなら、その主張は `SYNTHETIC_NEGATIVE_CONTROLS` の側へ登録する。従前は
 * `LETTERED_REQUIREMENT_NUMBER` が陰性の主張を一つ持ちながらここに載っており、
 * 非空振りの根拠を「同じ検査に陽性側が併置されているから」という散文の理由付けへ
 * 預けていた（タスク 115.255 が是正。主張は台帳の `nonexistence` の一件が持つ）。
 * 両方へ載せる二重の分類は `checkEverySyntheticFixtureIsClassified` が失格にする。
 */
const POSITIVE_ONLY_FIXTURES: ReadonlyArray<{ name: string; reason: string }> = [
  { name: 'ID_LIST_FORMS', reason: '識別子欄の各書式を拾えることだけを言う（陽性のみ）' },
  {
    name: 'ASTERISK_BULLET_IS_STILL_A_LIST_MARKER',
    reason: '`*` の箇条書きを拾えることだけを言う（厳しすぎの側の陽性のみ）',
  },
  {
    name: 'UNTERMINATED_BLOCK_OPEN_BEFORE_HEADER',
    reason: '終端の無い `/*` の後ろでもヘッダーが拾えることだけを言う（取りこぼしの側の陽性のみ）',
  },
];

/**
 * 位置の抑えを取り払った写しを作る
 *
 * ヘッダー行と当該行だけを隣接させる。行の**バイトは資料のまま**なので形は保たれ、
 * 区間の上限（次のヘッダー・コメントの終端・空行・段落の切れ目）はどれも存在しなくなる。
 * 上限が本当に消えていることは `resolveHeaderSectionEnd` で確かめる（後段の検査）。
 */
function relocateCarrierUnderHeader(control: SyntheticNegativeControl): string {
  return [control.header, control.carrier].join('\n');
}

/**
 * 機構: 陰性側の合成対照が空振りしていないことを組で確かめる
 *
 * 各件について、位置の抑えを取り払った写しへ抽出を当てる。
 * `boundary` と述べた件は写しで番号が**現れねばならない**（現れないなら、抑えていたのは
 * 位置ではなく形であり、上限を外しても対照は赤くならない）。
 * `shape` と述べた件は写しでも**現れてはならない**（現れるなら、抑えていたのは位置である）。
 *
 * 2026-09-03 に実測した。登録は 24 件（資料 14 件）である。
 * `HEADER_OF_UNLISTED_FEATURE` の一覧項目を ` * Note: REQ-7.7 は…` の散文へ書き換えると、
 * 対をなす `checkUnlistedFeatureHeaderStillEndsSection` は**緑のまま**で、
 * 自己検査 63 件のうち本検査 1 件だけが赤くなる（115.224 が述べた空振りそのものである）。
 * `suppressedBy` を取り違える変異も三種のいずれの向きでも赤くなる——`site-survey/REQ-8.3` の件を
 * `boundary` へ、`site-survey/REQ-4.2` の件を `shape` へ、`site-survey/REQ-4.1` の件を
 * `shape` へ、`user-authentication/REQ-17.1` の件を `quotation` へ変えると、
 * いずれも 1 件が落ちる（末尾の二つは 2026-09-01 に実測。タスク 115.226）。
 * 本体から規則4（段落の切れ目）を外すと 63 件のうち 5 件が赤くなり、本検査もその一つである。
 *
 * `nonexistence` は他の三つより強い主張である。位置を緩めても現れないことに加えて、
 * ヘッダーと当該行だけの写しから**番号が一つでも拾われること**を課し、当該行が走査の
 * 範囲に入っていることを機械の側で示す（`shape` はこれを課さないため、当該行が一切
 * 読まれていなくても静かに通る）。2026-09-03 に実測した——`LETTERED_REQUIREMENT_NUMBER`
 * の件を `boundary` へ変えると 69 件のうち 1 件が、`quotation` へ変えても 1 件が赤くなり、
 * 拾われてはならない番号を資料に逐語で在る `user-authentication/REQ-27A` へ差し替えても
 * 1 件が赤くなる。読まれない当該行（`PROSE_BULLET_IS_NOT_AN_ID_LIST` の散文の箇条書き）を
 * `nonexistence` として登録する変異でも 1 件が赤くなる。
 *
 * **守れない範囲を明記する。** `nonexistence` を `shape` へ緩める取り違えは捕まらない
 * （同じ 2026-09-03 の実測で 69 件すべてが緑のままだった）。`shape` の主張は
 * `nonexistence` の主張の真部分であるため、緩める向きの変異は既存の照合を一つも破らない。
 * 逆向き——資料に逐語で在る番号を `nonexistence` と称する形——は上記のとおり捕まる。
 */
function checkSyntheticNegativeControlsAreNotVacuous(): string[] {
  const failures: string[] = [];

  // 第3原則: 対照群が空なら失格。空で緑になる抜け道を残さない
  if (SYNTHETIC_NEGATIVE_CONTROLS.length === 0) {
    return ['陰性側の合成対照が一件も登録されていない（対照群が空。検査が空振りしている）'];
  }

  for (const control of SYNTHETIC_NEGATIVE_CONTROLS) {
    const at = `${control.fixtureName} / ${control.carrier.trim()}`;
    const criteria = control.absentCriteria ?? [];
    const requirements = control.absentRequirements ?? [];

    if (criteria.length === 0 && requirements.length === 0) {
      failures.push(`${at}: 拾われてはならない番号が一件も登録されていない（事例が空振り）`);
      continue;
    }
    if (!control.fixture.includes(control.carrier)) {
      failures.push(`${at}: 当該行が資料に逐語で存在しない（登録が資料から遅れている）`);
      continue;
    }
    if (!control.fixture.includes(control.header)) {
      failures.push(`${at}: ヘッダー行が資料に逐語で存在しない（登録が資料から遅れている）`);
      continue;
    }

    // 資料そのものでは拾われないこと（対照の主張の写し。登録のずれを検出する）
    const asIs = extractHeaderScopedCoverage(control.fixture, control.features);
    for (const id of criteria) {
      if (asIs.acceptanceCriteria.includes(id)) {
        failures.push(`${at}: 資料から ${id} が拾われている（陰性の主張が既に崩れている）`);
      }
    }
    for (const id of requirements) {
      if (asIs.requirements.includes(id)) {
        failures.push(`${at}: 資料から ${id} が拾われている（陰性の主張が既に崩れている）`);
      }
    }

    // 引用が抑えている件は、区間が始まらないため位置を緩める写しが意味を成さない。
    // 引用を解いた写しで番号が現れることを課す（現れなければ抑えていたのは引用ではない）
    if (control.suppressedBy === 'quotation') {
      const unquote = control.unquote;
      if (!unquote) {
        failures.push(`${at}: 引用を解く置換が登録されていない（対照の主張を確かめられない）`);
        continue;
      }
      if (control.fixture.split(unquote.from).length !== 2) {
        failures.push(`${at}: 引用を解く置換の元が資料にちょうど一度現れない（登録が曖昧）`);
        continue;
      }
      const unquoted = extractHeaderScopedCoverage(
        control.fixture.replace(unquote.from, unquote.to),
        control.features
      );
      for (const id of criteria) {
        if (!unquoted.acceptanceCriteria.includes(id)) {
          failures.push(
            `${at}: 引用を解いても ${id} が現れない（対照が空振りしている。` +
              '抑えていたのは引用ではなく一覧項目の形か区間の上限である）'
          );
        }
      }
      for (const id of requirements) {
        if (!unquoted.requirements.includes(id)) {
          failures.push(`${at}: 引用を解いても ${id} が現れない（対照が空振りしている）`);
        }
      }
      continue;
    }

    const probe = relocateCarrierUnderHeader(control);
    const headerIndex = probe.indexOf('Requirements');
    if (headerIndex < 0) {
      failures.push(`${at}: 探索用の写しにヘッダーが無い`);
      continue;
    }
    // 写しに上限が残っていると「位置を最も緩くした」と言えない
    if (resolveHeaderSectionEnd(probe, headerIndex, null) !== probe.length) {
      failures.push(`${at}: 探索用の写しに区間の上限が残っている（位置を緩められていない）`);
      continue;
    }
    // ヘッダーが宣言と認められなければ区間が始まらず、写しは何も測らない。
    // `quotation` の件を `boundary` / `shape` と取り違えて登録すると必ずここで落ちる
    if (!isDeclaredCoverageHeader(probe, headerIndex)) {
      failures.push(
        `${at}: 探索用の写しのヘッダーが宣言と認められない（引用された字面である。` +
          '抑えているのは位置でも形でもないため `quotation` へ分類すること）'
      );
      continue;
    }

    const relocated = extractHeaderScopedCoverage(probe, control.features);

    if (control.suppressedBy === 'nonexistence') {
      // 「資料に無い番号」の主張は、当該行が走査の範囲に入っていなければ何も測らない。
      // ヘッダーと当該行だけの写しから番号が一つでも拾われることを課し、当該行が現に
      // 読まれていることを示す（併置した陽性側の散文へ非空振りの根拠を預けない）
      if (relocated.requirements.length === 0 && relocated.acceptanceCriteria.length === 0) {
        failures.push(
          `${at}: ヘッダーと当該行だけの写しから番号が一つも拾われない` +
            '（当該行が走査の範囲に入っておらず、実在しない番号の主張が空振りしている）'
        );
      }
      for (const id of [...criteria, ...requirements]) {
        const local = id.slice(id.lastIndexOf('/') + 1);
        // 枝つき番号の基底は枝つき番号の前方一致である（`REQ-27` は `REQ-27A` に含まれる）。
        // 番号の続きが無いことまで見なければ、逐語の存在を取り違える
        if (new RegExp(`${escapeForRegExp(local)}(?![0-9A-Za-z.])`).test(control.fixture)) {
          failures.push(
            `${at}: ${id} の番号が資料に逐語で存在する（抑えているのは非実在ではなく` +
              '位置か形である。`boundary` か `shape` へ分類し直すこと）'
          );
        }
      }
    }

    for (const id of criteria) {
      const appeared = relocated.acceptanceCriteria.includes(id);
      if (control.suppressedBy === 'boundary' && !appeared) {
        failures.push(
          `${at}: 位置の上限を取り払っても ${id} が現れない（対照が空振りしている。` +
            '当該行が一覧項目の形をしていない可能性がある）'
        );
      }
      if (control.suppressedBy === 'shape' && appeared) {
        failures.push(
          `${at}: 位置の上限を取り払うと ${id} が現れる（抑えていたのは形ではなく位置である。` +
            '分類が誤っている）'
        );
      }
      if (control.suppressedBy === 'nonexistence' && appeared) {
        failures.push(
          `${at}: 位置の上限を取り払うと ${id} が現れる（資料に無い番号を抽出器が作り出している）`
        );
      }
    }
    for (const id of requirements) {
      const appeared = relocated.requirements.includes(id);
      if (control.suppressedBy === 'boundary' && !appeared) {
        failures.push(`${at}: 位置の上限を取り払っても ${id} が現れない（対照が空振りしている）`);
      }
      if (control.suppressedBy === 'shape' && appeared) {
        failures.push(`${at}: 位置の上限を取り払うと ${id} が現れる（分類が誤っている）`);
      }
      if (control.suppressedBy === 'nonexistence' && appeared) {
        failures.push(
          `${at}: 位置の上限を取り払うと ${id} が現れる（資料に無い番号を抽出器が作り出している）`
        );
      }
    }
  }

  return failures;
}

/**
 * 資料の宣言を本自己検査の本文から数え上げる
 *
 * 拾うのは**ファイル直下に置かれた** `const NAME = [ … ].join('\n');` の形だけである。
 * 関数の中で組み立てる資料は拾えない——これは本検査の限界であり、報告ではなくここへ書き残す。
 * 区間判定と一覧項目の合成対照（`extractHeaderScopedCoverage` へ渡す資料）は
 * 2026-09-01 の実測で 16 件すべてがこの形であり、限界に当たる資料は零件であった。
 * タスク 115.259 が資料を一件足した後の再実測（2026-09-03、コミット `4c70e20c` の
 * 作業ツリー）でも 17 件すべてがこの形である。関数の中で作る**写し**——資料の行を
 * 入れ替え・削除した派生——は独立の資料と数えない。派生元がこの形で拾われる限り、
 * 分類を迫る網からは漏れないためである。
 */
function collectTopLevelFixtureNames(source: string): string[] {
  const names: string[] = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const declaration = /^const ([A-Z][A-Z0-9_]*) = \[$/.exec(lines[index] ?? '');
    if (!declaration || !declaration[1]) continue;
    for (let scan = index + 1; scan < lines.length; scan++) {
      const line = lines[scan] ?? '';
      if (!line.startsWith(']')) continue;
      if (line === "].join('\\n');") names.push(declaration[1]);
      break;
    }
  }
  return names;
}

/**
 * 機構: 資料を足した者に分類を迫る（未分類の資料を残させない）
 *
 * 陰性側の網は登録した件しか見ない。登録を任意にすると、次に足される資料が
 * 115.224 と同じ空振りのまま静かに増える。ここで本自己検査の本文を走査し、
 * `SYNTHETIC_NEGATIVE_CONTROLS` にも `POSITIVE_ONLY_FIXTURES` にも無い資料を失格にする。
 *
 * 2026-09-03 に実測した。走査は資料 17 件を数え、うち 14 件が陰性側、3 件が陽性のみである。
 * `SELFTEST_FEATURES` のような資料でない定数は `].join('\n');` の形を持たないため拾わない。
 * `SYNTHETIC_NEGATIVE_CONTROLS` を空にすると未分類 14 件を挙げて赤くなり、走査の正規表現を
 * `= \[` から `= \{` へ変えると「一件も数えられない」で赤くなる（いずれも実測）。
 *
 * **二重の分類も失格にする。** 陰性側に登録された資料が「陽性のみ」の札を同時に持つ状態は、
 * 札と実際の主張の食い違いである。`LETTERED_REQUIREMENT_NUMBER` を両方へ載せると
 * 69 件のうち本検査 1 件が赤くなる（2026-09-03 に実測。タスク 115.255）。
 *
 * **見ているのは資料の粒度であって行の粒度ではない。** 既に登録済みの資料へ陰性の主張を
 * 述べる行を**足しただけ**の場合、その行は登録を迫られない。ここが本検査の残りの限界で
 * あり、行の粒度まで導く語彙（どの行がどの番号を運ぶか）を抽出器が公開していないため
 * 現状では機械で導けない。塞ぐなら行ごとの探索を別途起こすこと。
 */
function checkEverySyntheticFixtureIsClassified(): string[] {
  const failures: string[] = [];

  const absolute = path.resolve(SELFTEST_SOURCE_PATH);
  if (!fs.existsSync(absolute)) {
    return [`${SELFTEST_SOURCE_PATH} が存在しない（自己検査の前提が失われた）`];
  }
  const names = collectTopLevelFixtureNames(fs.readFileSync(absolute, 'utf8'));

  // 第3原則: 走査が一件も拾えないなら、規則が壊れている。緑で通してはならない
  if (names.length === 0) {
    return [`${SELFTEST_SOURCE_PATH}: 資料の宣言を一件も数えられない（走査の規則が壊れている）`];
  }

  const registered = new Set(SYNTHETIC_NEGATIVE_CONTROLS.map((control) => control.fixtureName));
  const positiveOnly = new Set(POSITIVE_ONLY_FIXTURES.map((entry) => entry.name));

  for (const name of names) {
    if (!registered.has(name) && !positiveOnly.has(name)) {
      failures.push(
        `${name}: 分類されていない資料である。陰性の主張を持つなら ` +
          '`SYNTHETIC_NEGATIVE_CONTROLS` へ、陽性だけなら `POSITIVE_ONLY_FIXTURES` へ理由を' +
          '添えて登録すること'
      );
    }
  }
  // 二重の分類（陰性側の登録と「陽性のみ」の札を同時に持つ）は札と実態の食い違いである。
  // 115.255 が是正したのは、まさにこの食い違いが静かに成立していた一件である
  for (const name of positiveOnly) {
    if (registered.has(name)) {
      failures.push(
        `${name}: 陰性側の対照に登録されているのに「陽性のみ」の札も持つ（札と実態が食い違う）`
      );
    }
  }
  // 走査が拾えない名前が登録側に残っていれば、資料の改名か撤去に登録が追いついていない
  const allRegisteredNames = [...registered, ...positiveOnly];
  // 素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (allRegisteredNames.length === 0) {
    failures.push('素材 allRegisteredNames が空です（この確認が空振りしています）');
  }
  for (const name of allRegisteredNames) {
    if (!names.includes(name)) {
      failures.push(`${name}: 登録されているが資料の宣言が見つからない（改名か撤去に未追随）`);
    }
  }
  return failures;
}

// ============================================================================
// 撤廃された受入基準（取り消し線）の扱い
// ============================================================================
//
// 要件定義書は、撤廃・移管した受入基準を番号ごと残し、本文を取り消し線で潰す。
// 抽出がこの表記を読まないと、検証を要求されない条文が分母に居座り、
// その番号を名乗るだけの被覆印が分子にも入る（分子・分母の同時の水増し）。

/** 取り消し線の判定が、狙った形だけを拾う */
function checkRetiredCriterionPredicate(): string[] {
  const failures: string[] = [];
  const retired: Array<[string, string]> = [
    ['丸ごと潰した形', '~~→ project-management/Requirement 25 AC 3 に移動~~'],
    ['潰したうえで移管先を添える形', '~~If 旧条文~~ → Requirement 39 AC 5 で更新'],
    ['行頭に空白がある形', '  ~~撤廃~~'],
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (retired.length === 0) {
    failures.push('合成素材 retired が空です（この確認が空振りしています）');
  }
  for (const [label, text] of retired) {
    if (!isRetiredCriterionText(text)) failures.push(`撤廃と判定しなかった: ${label}`);
  }
  const live: Array<[string, string]> = [
    ['現役の条文', 'The システム shall 数量表を表示する'],
    ['本文の途中に ~~ を含む現役の条文', 'The システム shall ~~旧仕様~~ ではなく新仕様で表示する'],
    // 印は**二本**である。一本に緩めると「約」の意味で ~ を書いた条文まで墓標になり、
    // 分母が黙って縮む（115.197 の走査で、この形の見本が無いため
    // `startsWith('~~')` を `startsWith('~')` へ緩める変異が無言だった）
    ['行頭の印が一本だけの現役の条文', '~5秒以内に一覧を再表示する'],
    ['空文字', ''],
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (live.length === 0) {
    failures.push('合成素材 live が空です（この確認が空振りしています）');
  }
  for (const [label, text] of live) {
    if (isRetiredCriterionText(text)) failures.push(`誤って撤廃と判定した: ${label}`);
  }
  return failures;
}

/** 合成の要件定義書で、墓標が分母に入らず、現役の番号が落ちないこと */
function checkRetiredCriteriaAreNotExtracted(): string[] {
  const failures: string[] = [];
  const document = [
    '### Requirement 1: 全AC移管済みの要件',
    '',
    '#### Acceptance Criteria',
    '1. ~~→ project-management/Requirement 25 AC 1 に移動~~',
    '2. ~~→ project-management/Requirement 25 AC 2 に移動~~',
    '',
    '### Requirement 2: 一部だけ撤廃された要件',
    '',
    '#### Acceptance Criteria',
    '1. ~~→ project-management/Requirement 24 AC 1 に移動~~',
    '2. The システム shall 現役の振る舞いを行う',
    '',
  ].join('\n');

  withFixture({ 'requirements.md': document }, (baseDir) => {
    const requirements = extractRequirements('probe', path.join(baseDir, 'requirements.md'));
    const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));

    const first = byId.get('REQ-1');
    const second = byId.get('REQ-2');
    if (!first || !second) {
      failures.push('要件ヘッダーの抽出そのものが壊れている');
      return;
    }
    if (first.acceptanceCriteria.length !== 0) {
      failures.push(`全AC撤廃の要件から ${first.acceptanceCriteria.length} 件が分母に入った`);
    }
    if (first.retiredAcceptanceCriteria.length !== 2) {
      failures.push(`撤廃済みの記録が 2 件でない（${first.retiredAcceptanceCriteria.length} 件）`);
    }
    const liveIds = second.acceptanceCriteria.map((criterion) => criterion.id);
    if (liveIds.length !== 1 || liveIds[0] !== 'probe/REQ-2.2') {
      failures.push(`一部撤廃の要件の分母が現役1件でない（${liveIds.join(', ') || '空'}）`);
    }
    // **番号は位置ではなく行頭の数字で決まる。** 墓標を落としても現役の番号がずれない。
    if (second.retiredAcceptanceCriteria[0]?.id !== 'probe/REQ-2.1') {
      failures.push('撤廃済みの受入基準が元の番号で記録されていない');
    }
  });
  return failures;
}

/** 実データ: 墓標が一件も分母に残っていない（母集団の側から数える） */
function checkRealRetiredCriteriaAreOutOfDenominator(): string[] {
  const failures: string[] = [];
  const features = extractAllFeatures(discoverFeatures());
  let retired = 0;
  let retiredRequirements = 0;
  for (const feature of features) {
    retired += feature.retiredAcceptanceCriteriaCount;
    retiredRequirements += feature.retiredRequirements.length;
    for (const requirement of feature.requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        if (isRetiredCriterionText(criterion.text)) {
          failures.push(`分母に墓標が残っている: ${criterion.id}`);
        }
      }
    }
    for (const requirement of feature.retiredRequirements) {
      if (requirement.acceptanceCriteria.length > 0) {
        failures.push(`現役の受入基準を持つ要件を撤廃扱いにした: ${requirement.fullId}`);
      }
    }
  }
  // 実データに墓標が一つも無ければ、上の走査は何も確かめていない。前提の崩壊として落とす。
  if (retired === 0) {
    failures.push('要件定義書に取り消し線の受入基準が一件も無い（この検査が空振りしている）');
  }
  if (retiredRequirements === 0) {
    failures.push('受入基準がすべて撤廃された要件が一件も無い（この検査が空振りしている）');
  }
  return failures;
}

/** 実データの墓標を名乗る被覆印は挙げ、現役の番号を名乗る被覆印は挙げない */
function checkRetiredCriterionCoverageMarksAreDetected(): string[] {
  const failures: string[] = [];
  const features: Feature[] = extractAllFeatures(discoverFeatures());

  const retiredId = features
    .flatMap((feature) => feature.retiredRequirements.concat(feature.requirements))
    .flatMap((requirement) => requirement.retiredAcceptanceCriteria)
    .map((criterion) => criterion.id)
    .sort()[0];
  const liveId = features
    .flatMap((feature) => feature.requirements)
    .flatMap((requirement) => requirement.acceptanceCriteria)
    .map((criterion) => criterion.id)
    .sort()[0];
  if (retiredId === undefined || liveId === undefined) {
    return ['前提: 実データに墓標または現役の受入基準が無い'];
  }

  const detected = findRetiredCriterionCoverageMarks(features, [
    { file: 'e2e/specs/probe.spec.ts', requirements: [], acceptanceCriteria: [retiredId, liveId] },
  ]);
  if (detected.length !== 1 || detected[0]?.id !== retiredId) {
    failures.push(
      `墓標を名乗る被覆印を挙げられていない（挙げた: ${detected.map((m) => m.id).join(', ') || '無し'}）`
    );
  }
  if (detected[0]?.files.join(',') !== 'e2e/specs/probe.spec.ts') {
    failures.push('被覆印を掲げている場所を報告していない');
  }

  // 陰性側の素材。**空にすると `clean` は必ず 0 件になり、「現役の番号は挙げない」という
  // 主張が恒真になる**（第3原則。115.252）
  const liveMarks = [
    { file: 'e2e/specs/probe.spec.ts', requirements: [], acceptanceCriteria: [liveId] },
  ];
  if (liveMarks.length === 0) {
    failures.push('素材 liveMarks が空です（この確認が空振りしています）');
  }
  const clean = findRetiredCriterionCoverageMarks(features, liveMarks);
  if (clean.length !== 0) {
    failures.push(`現役の番号を名乗る被覆印を誤って挙げた: ${clean.map((m) => m.id).join(', ')}`);
  }
  return failures;
}

// ============================================================================
// 被覆印の指し先（存在しない番号 / 逐語複製との食い違い）
// ============================================================================
//
// 撤廃済みを名乗る形とは**直し方が違う**（撤廃は移管先へ名乗り直す、存在しない番号は
// 名乗り直すか取り下げる、逐語複製の食い違いは写した条文を名乗る）。
// 判別子を持たない本自己検査では、言い分けを機構対照として別に置く。

/** 合成の要件定義書で、枝つき番号（`1a.`）が分母に入らず基底番号だけが記録される */
function checkLetteredCriteriaAreRecorded(): string[] {
  const failures: string[] = [];
  const document = [
    '### Requirement 4: 枝つき番号を持つ要件',
    '',
    '#### Acceptance Criteria',
    '1a. When ユーザーがEnterキーを押す, the システム shall 検索を実行する',
    '1b. When ユーザーが検索ボタンを押す, the システム shall 検索を実行する',
    '2. The システム shall 検索結果を表示する',
    '',
  ].join('\n');
  withFixture({ 'requirements.md': document }, (baseDir) => {
    const requirements = extractRequirements('probe', path.join(baseDir, 'requirements.md'));
    const requirement = requirements.find((item) => item.id === 'REQ-4');
    if (!requirement) {
      failures.push('要件ヘッダーの抽出そのものが壊れている');
      return;
    }
    const ids = requirement.acceptanceCriteria.map((criterion) => criterion.id);
    if (ids.length !== 1 || ids[0] !== 'probe/REQ-4.2') {
      failures.push(`枝つき番号が分母に入った、または現役が落ちた（${ids.join(', ') || '空'}）`);
    }
    if (requirement.letteredCriterionNumbers.join(',') !== '1') {
      failures.push(
        `枝つき番号の基底が記録されていない（${requirement.letteredCriterionNumbers.join(', ') || '空'}）`
      );
    }
  });
  return failures;
}

/** 実データ: 枝つき番号が実在する（この免除が空振りしていない） */
function checkRealLetteredCriteriaExist(): string[] {
  const features = extractAllFeatures(discoverFeatures());
  const total = features
    .flatMap((feature) => feature.requirements)
    .reduce((sum, requirement) => sum + requirement.letteredCriterionNumbers.length, 0);
  return total > 0
    ? []
    : ['要件定義書に枝つき番号（`1a.` 形式）が一件も無い（枝つき番号の免除が空振りしている）'];
}

interface ProbeIds {
  live: string;
  retired: string;
  lettered: string;
  unknown: string;
}

/** 実データから、現役・墓標・枝つき番号・存在しない番号の代表をひとつずつ取る */
function probeCriterionIds(features: readonly Feature[]): ProbeIds | string {
  const live = features
    .flatMap((feature) => feature.requirements)
    .flatMap((requirement) => requirement.acceptanceCriteria)
    .map((criterion) => criterion.id)
    .sort()[0];
  const retired = features
    .flatMap((feature) => feature.retiredRequirements.concat(feature.requirements))
    .flatMap((requirement) => requirement.retiredAcceptanceCriteria)
    .map((criterion) => criterion.id)
    .sort()[0];
  const lettered = features
    .flatMap((feature) => feature.requirements)
    .flatMap((requirement) =>
      requirement.letteredCriterionNumbers.map((number) => `${requirement.fullId}.${number}`)
    )
    .sort()[0];
  if (live === undefined || retired === undefined || lettered === undefined) {
    return '前提: 実データに現役・墓標・枝つき番号のいずれかが無い';
  }
  return { live, retired, lettered, unknown: `${live.slice(0, live.lastIndexOf('.'))}.99999` };
}

/** 存在しない番号を名乗る被覆印を挙げ、現役・墓標・枝つき番号・走査対象外は挙げない */
function checkUnknownCriterionMarksAreDetected(): string[] {
  const failures: string[] = [];
  const features: Feature[] = extractAllFeatures(discoverFeatures());
  const probe = probeCriterionIds(features);
  if (typeof probe === 'string') return [probe];

  // 陽性: e2e/specs 配下で存在しない番号を名乗る（現役・墓標・枝つき番号は混ぜても挙がらない）
  const detected = findUnknownCriterionCoverageMarks(features, [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.unknown, probe.live, probe.retired, probe.lettered],
    },
  ]);
  if (detected.length !== 1 || detected[0]?.id !== probe.unknown) {
    failures.push(
      `存在しない番号を挙げられていない（挙げた: ${detected.map((mark) => mark.id).join(', ') || '無し'}）`
    );
  }
  if (detected[0]?.files.join(',') !== `${E2E_SPECS_ROOT}/probe.spec.ts`) {
    failures.push('被覆印を掲げている場所を報告していない');
  }

  // 陰性: 走査対象の外（本番ソース配下）は挙げない
  // 陰性の素材。**空にすると挙がるものが無くなり、この主張は恒真になる**（第3原則。115.252）
  const outsideRootMarks = [
    { file: 'frontend/src/probe.tsx', requirements: [], acceptanceCriteria: [probe.unknown] },
  ];
  if (outsideRootMarks.length === 0) {
    failures.push('素材 outsideRootMarks が空です（この確認が空振りしています）');
  }
  const outsideRoot = findUnknownCriterionCoverageMarks(features, outsideRootMarks);
  if (outsideRoot.length !== 0) {
    failures.push(`走査対象の外の被覆印を挙げた: ${outsideRoot.map((mark) => mark.id).join(', ')}`);
  }

  // 機構対照: 墓標と「存在しない番号」を取り違えていない（直し方が違うので混ぜてはならない）
  // 陰性の素材。**空にすると挙がるものが無くなり、この主張は恒真になる**（第3原則。115.252）
  const retiredMarks = [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.retired],
    },
  ];
  if (retiredMarks.length === 0) {
    failures.push('素材 retiredMarks が空です（この確認が空振りしています）');
  }
  const retiredByUnknown = findUnknownCriterionCoverageMarks(features, retiredMarks);
  if (retiredByUnknown.length !== 0) {
    failures.push(`墓標を「存在しない番号」として挙げた: ${probe.retired}`);
  }
  // 陰性の素材。**空にすると挙がるものが無くなり、この主張は恒真になる**（第3原則。115.252）
  const unknownMarks = [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.unknown],
    },
  ];
  if (unknownMarks.length === 0) {
    failures.push('素材 unknownMarks が空です（この確認が空振りしています）');
  }
  const unknownByRetired = findRetiredCriterionCoverageMarks(features, unknownMarks);
  if (unknownByRetired.length !== 0) {
    failures.push(`存在しない番号を「墓標」として挙げた: ${probe.unknown}`);
  }
  return failures;
}

/** 分母に無い番号を名乗る被覆印を、成り立ちの軸で取り違えずに数える */
function checkOutOfDenominatorBreakdown(): string[] {
  const failures: string[] = [];
  const features: Feature[] = extractAllFeatures(discoverFeatures());
  const probe = probeCriterionIds(features);
  if (typeof probe === 'string') return [probe];

  const marks = collectOutOfDenominatorMarks(features, [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.live, probe.retired, probe.lettered, probe.unknown],
    },
  ]);
  if (marks.retired.join(',') !== probe.retired) {
    failures.push(`撤廃済みの内訳が誤り: ${marks.retired.join(', ') || '空'}`);
  }
  if (marks.lettered.join(',') !== probe.lettered) {
    failures.push(`枝つき番号の内訳が誤り: ${marks.lettered.join(', ') || '空'}`);
  }
  if (marks.unknown.join(',') !== probe.unknown) {
    failures.push(`存在しない番号の内訳が誤り: ${marks.unknown.join(', ') || '空'}`);
  }
  return failures;
}

/**
 * 分子が分母との交わりで数えられている
 *
 * 分母に無い番号を名乗る被覆印を分子に入れると「被覆済み + 未被覆 > 総数」が成立し、
 * 被覆率が水増しされる（是正前の実測は 2695 + 205 > 2888）。
 */
function checkNumeratorIsIntersectedWithDenominator(): string[] {
  const failures: string[] = [];
  const features: Feature[] = extractAllFeatures(discoverFeatures());
  const probe = probeCriterionIds(features);
  if (typeof probe === 'string') return [probe];

  const result = calculateCoverage(
    features,
    [
      {
        file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
        // 実在する要件と、実在しない要件の双方を名乗らせる。
        // 実在しない側を入れないと、要件レベルの交わりを外す変異が検出できない。
        requirements: [
          probe.live.slice(0, probe.live.lastIndexOf('.')),
          `${probe.live.slice(0, probe.live.indexOf('/'))}/REQ-99999`,
        ],
        acceptanceCriteria: [probe.live, probe.retired, probe.lettered, probe.unknown],
      },
    ],
    null
  );
  if (result.coveredRequirementCount !== 1) {
    failures.push(
      `要件レベルの分子が分母の外の番号を数えている（1件のはずが ${result.coveredRequirementCount} 件）`
    );
  }
  if (result.coveredAcceptanceCriteriaCount !== 1) {
    failures.push(
      `分子が分母の外の番号を数えている（現役1件のはずが ${result.coveredAcceptanceCriteriaCount} 件）`
    );
  }
  if (
    result.coveredAcceptanceCriteriaCount + result.uncoveredAcceptanceCriteriaCount !==
    result.totalAcceptanceCriteria
  ) {
    failures.push(
      `被覆済み + 未被覆 が総数と一致しない（${result.coveredAcceptanceCriteriaCount} + ${result.uncoveredAcceptanceCriteriaCount} ≠ ${result.totalAcceptanceCriteria}）`
    );
  }
  if (
    result.coveredRequirementCount + result.uncoveredRequirementCount !==
    result.totalRequirements
  ) {
    failures.push(
      `要件レベルでも被覆済み + 未被覆 が総数と一致しない（${result.coveredRequirementCount} + ${result.uncoveredRequirementCount} ≠ ${result.totalRequirements}）`
    );
  }
  return failures;
}

/**
 * 分母の外へ落ちた被覆印は、必ずどこかの報告枠に現れる（黙って消えない）
 *
 * 分子は分母との積で数えるため、分母に無い番号を名乗る被覆印は集計から落ちる。
 * 落とすこと自体は正しいが、**落ちた印がどの報告にも出なければ、幻の番号は
 * 誰にも気づかれないまま残る**。落とす側（calculateCoverage）と見せる側
 * （collectOutOfDenominatorMarks）が分母の定義を別々に持つと、両者の差に落ちた印は
 * 集計にも報告にも現れない。
 *
 * ここでは分母の外にある受入基準（`retiredRequirements` に置かれた要件の条文）を
 * 名乗る被覆印を注入し、集計から外れることと、外れた事実が見えることの両方を固定する。
 */
function checkDroppedMarksNeverVanish(): string[] {
  const failures: string[] = [];
  const document = [
    '### Requirement 1: 分母に入る要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 分母に入る振る舞いを行う',
    '',
    '### Requirement 2: 分母から外した要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 分母から外した振る舞いを行う',
    '',
  ].join('\n');

  withFixture({ 'requirements.md': document }, (baseDir) => {
    const requirementsPath = path.join(baseDir, 'requirements.md');
    const requirements = extractRequirements('probe', requirementsPath);
    const live = requirements.find((requirement) => requirement.id === 'REQ-1');
    const outside = requirements.find((requirement) => requirement.id === 'REQ-2');
    if (!live || !outside) {
      failures.push('前提: 探り用の要件定義書から要件を二件取り出せない');
      return;
    }
    // 分母は `requirements` である。`retiredRequirements` に置いた要件の条文は分母に無い。
    const feature: Feature = {
      name: 'probe',
      path: requirementsPath,
      requirements: [live],
      totalAcceptanceCriteria: live.acceptanceCriteria.length,
      retiredAcceptanceCriteriaCount: 0,
      retiredRequirements: [outside],
    };
    const testCoverage = [
      {
        file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
        requirements: ['probe/REQ-1'],
        acceptanceCriteria: ['probe/REQ-1.1', 'probe/REQ-2.1'],
      },
    ];

    const result = calculateCoverage([feature], testCoverage, null);
    if (result.totalAcceptanceCriteria !== 1) {
      failures.push(`前提: 分母が1件でない（${result.totalAcceptanceCriteria}件）`);
      return;
    }
    if (result.coveredAcceptanceCriteriaCount !== 1) {
      failures.push(
        `分母の外の番号が分子に入っている（1件のはずが ${result.coveredAcceptanceCriteriaCount} 件）`
      );
    }

    const marks = collectOutOfDenominatorMarks([feature], testCoverage);
    const shown = [...marks.retired, ...marks.lettered, ...marks.unknown];
    if (!shown.includes('probe/REQ-2.1')) {
      failures.push(
        `分子から落とした probe/REQ-2.1 がどの報告枠にも出ていない（出ているのは ${shown.join(', ') || '空'}）`
      );
    }
    if (shown.includes('probe/REQ-1.1')) {
      failures.push('分母に入っている probe/REQ-1.1 を分母外として挙げた');
    }
  });
  return failures;
}

/**
 * 除外の区分の見出しが、台帳の定義文を逐語のとおり並べる（開示の対照。タスク 115.314）
 *
 * 区分名と件数だけを印字していた頃、`pending-implementation` の定義文は
 * 「機能実装済みだがE2Eテストが未作成」のまま実データから離れ続けた。定義文が
 * **どの出力にも現れない**ことが、乖離を長く見えなくしていた原因である。
 *
 * ここは整形関数を合成値で呼び、逐語を固定する。数値の軸（件数）だけを見る対照では、
 * 定義文を落とす変異が素通りする（タスク 115.300 の教訓）。**結線の側は
 * {@link checkExclusionCategoryHeadingIsWired} が別に見る。**
 */
function checkExclusionCategoryHeadingIsVerbatim(): string[] {
  const failures: string[] = [];

  const withDefinition = formatExclusionCategoryHeading('探り用の区分', 3, {
    description: '探り用の定義文',
    verificationPhase: '探り用のフェーズ',
  });
  const expected = '     [探り用の区分] (3件) 探り用の定義文（検証フェーズ: 探り用のフェーズ）';
  if (withDefinition !== expected) {
    failures.push(`区分の見出しが逐語と違う: 期待 ${expected} / 実際 ${withDefinition}`);
  }

  // 定義の無い区分を黙って区分名だけで出さない（開示は安全側に誤る）。
  const withoutDefinition = formatExclusionCategoryHeading('定義の無い区分', 1, undefined);
  if (!withoutDefinition.includes('台帳に定義文が無い区分')) {
    failures.push(`定義の無い区分がその旨を印字していない: ${withoutDefinition}`);
  }
  if (withoutDefinition === '     [定義の無い区分] (1件)') {
    failures.push('定義の無い区分が、定義を持つ区分と同じ見た目になっている');
  }

  return failures;
}

/**
 * 区分の定義文が台帳から集計結果まで運ばれている（結線の対照。タスク 115.314）
 *
 * 整形関数だけを固定しても、集計が台帳の `categories` を持ち回らなければ、印字される
 * 定義文は空になる。ここは合成の台帳を `calculateCoverage` へ渡し、返る
 * `exclusionCategories` が台帳の定義文をそのまま持つことを見る。
 *
 * **限界**: `printReport` が実際にこの値を整形関数へ渡していることは、本対照では
 * 見ていない（`printReport` は輸出されていない）。その一段は本検査を実際に走らせた
 * 出力でのみ確かめられる。
 */
function checkExclusionCategoryHeadingIsWired(): string[] {
  const failures: string[] = [];
  const document = [
    '### Requirement 1: 探り用の要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 探り用の振る舞いを行う',
    '',
  ].join('\n');

  withFixture({ 'requirements.md': document }, (baseDir) => {
    const requirementsPath = path.join(baseDir, 'requirements.md');
    const requirements = extractRequirements('probe', requirementsPath);
    const live = requirements.find((requirement) => requirement.id === 'REQ-1');
    if (!live) {
      failures.push('前提: 探り用の要件定義書から要件を取り出せない');
      return;
    }
    const feature: Feature = {
      name: 'probe',
      path: requirementsPath,
      requirements: [live],
      totalAcceptanceCriteria: live.acceptanceCriteria.length,
      retiredAcceptanceCriteriaCount: 0,
      retiredRequirements: [],
    };
    const ledger: ExclusionsFile = {
      exclusions: [
        {
          id: 'probe/REQ-1.1',
          requirement: 'REQ-1: 探り用の要件',
          title: '探り用の題',
          reason: '探り用の理由',
          category: '探り用の区分',
          alternativeVerification: {
            method: 'probe',
            tool: 'probe',
            description: '探り用の代替検証',
            threshold: '-',
          },
        },
      ],
      categories: {
        探り用の区分: {
          description: '探り用の定義文',
          verificationPhase: '探り用のフェーズ',
        },
      },
      summary: { totalExclusions: 1, byCategory: { 探り用の区分: 1 } },
    };

    const result = calculateCoverage([feature], [], ledger);
    if (result.excludedAcceptanceCriteria.length !== 1) {
      failures.push(
        `前提: 除外が集計に載っていない（${result.excludedAcceptanceCriteria.length}件）`
      );
      return;
    }
    const carried = result.exclusionCategories['探り用の区分'];
    if (!carried) {
      failures.push('台帳の区分の定義が集計結果まで運ばれていない（開示は定義文を出せない）');
      return;
    }
    if (carried.description !== '探り用の定義文') {
      failures.push(`運ばれた定義文が台帳と違う: ${carried.description}`);
    }
    const heading = formatExclusionCategoryHeading('探り用の区分', 1, carried);
    if (!heading.includes('探り用の定義文')) {
      failures.push(`結線した見出しに定義文が出ていない: ${heading}`);
    }
  });
  return failures;
}

/** 全体サマリーの整合検査を回すための、分母1件の探り用機能を作る */
function summaryIntegrityProbe(
  baseDir: string,
  acceptanceCriteria: string[],
  requirements: string[]
): { result: CoverageResult; testCoverage: TestCoverage[]; feature: Feature } | string {
  // 素材が空だと被覆印が一つも立たず、集計の整合を問う以下の照合は素材に依らず成立する
  //（第3原則。115.252）
  if (acceptanceCriteria.length === 0) {
    return '合成素材 acceptanceCriteria が空です（この確認が空振りしています）';
  }
  if (requirements.length === 0) {
    return '合成素材 requirements が空です（この確認が空振りしています）';
  }
  const document = [
    '### Requirement 1: 分母に入る要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 分母に入る振る舞いを行う',
    '',
  ].join('\n');
  const requirementsPath = path.join(baseDir, 'requirements.md');
  fs.writeFileSync(requirementsPath, document, 'utf8');
  const extracted = extractRequirements('probe', requirementsPath);
  const live = extracted.find((requirement) => requirement.id === 'REQ-1');
  if (!live) return '前提: 探り用の要件定義書から要件を取り出せない';
  const feature: Feature = {
    name: 'probe',
    path: requirementsPath,
    requirements: [live],
    totalAcceptanceCriteria: live.acceptanceCriteria.length,
    retiredAcceptanceCriteriaCount: 0,
    retiredRequirements: [],
  };
  const testCoverage: TestCoverage[] = [
    { file: `${E2E_SPECS_ROOT}/probe.spec.ts`, requirements, acceptanceCriteria },
  ];
  return { result: calculateCoverage([feature], testCoverage, null), testCoverage, feature };
}

/** 空の分母外内訳（見せる側が何も挙げていない状態） */
const NO_OUT_OF_DENOMINATOR: OutOfDenominatorMarks = { retired: [], lettered: [], unknown: [] };

/**
 * 全体サマリーの整合検査が、健全な数え方を赤くしない（常時赤の検査を作らない）
 *
 * 併せて、落とした番号を実際に挙げていることを確かめる。挙げていなければ
 * 「落とした印が無い」で緑になるだけの空振りである。
 */
function checkSummaryIntegrityAcceptsSoundCounts(): string[] {
  const failures: string[] = [];
  withFixture({}, (baseDir) => {
    const probe = summaryIntegrityProbe(
      baseDir,
      ['probe/REQ-1.1', 'probe/REQ-9.9'],
      ['probe/REQ-1']
    );
    if (typeof probe === 'string') {
      failures.push(probe);
      return;
    }
    const report = checkSummaryIntegrity(probe.result, probe.testCoverage, {
      retired: [],
      lettered: [],
      unknown: ['probe/REQ-9.9'],
    });
    if (report.reasons.length > 0) {
      failures.push(`健全な数え方を赤くした: ${report.reasons.join(' / ')}`);
    }
    if (report.droppedCriterionMarks.join(',') !== 'probe/REQ-9.9') {
      failures.push(
        `分子から落とした番号を挙げていない（${report.droppedCriterionMarks.join(', ') || '空'}）`
      );
    }
    if (report.invisibleMarks.length > 0) {
      failures.push(
        `内訳に出ている番号を「消えた」と誤判定した: ${report.invisibleMarks.join(', ')}`
      );
    }
  });
  return failures;
}

/**
 * 全体サマリーの整合検査が、壊れた数え方を四つの向きで捕まえる
 *
 * それぞれ、この検査でしか捕まらない変異である:
 *   (a) 分子を生のタグ集合で数える（被覆済み + 未被覆 > 総数）
 *   (b) 要件レベルでも同じ水増しが起きる
 *   (c) 分母外の内訳が、分子から落とした番号を挙げていない（黙って消える印）
 *   (d) 内訳が、分母に入っている番号を分母外として挙げている（逆向きの食い違い）
 */
function checkSummaryIntegrityRejectsUnsoundCounts(): string[] {
  const failures: string[] = [];
  withFixture({}, (baseDir) => {
    const probe = summaryIntegrityProbe(
      baseDir,
      ['probe/REQ-1.1', 'probe/REQ-9.9'],
      ['probe/REQ-1']
    );
    if (typeof probe === 'string') {
      failures.push(probe);
      return;
    }
    const sound = probe.result;

    // (a) 分子を生のタグ集合で数えた状態を注入する
    const inflatedCriteria: CoverageResult = {
      ...sound,
      coveredAcceptanceCriteriaCount: sound.coveredAcceptanceCriteriaCount + 1,
    };
    if (
      checkSummaryIntegrity(inflatedCriteria, probe.testCoverage, {
        retired: [],
        lettered: [],
        unknown: ['probe/REQ-9.9'],
      }).reasons.length === 0
    ) {
      failures.push('受入基準の 被覆済み + 未被覆 ≠ 総数 を見逃した');
    }

    // (b) 要件レベルの水増し
    const inflatedRequirements: CoverageResult = {
      ...sound,
      coveredRequirementCount: sound.coveredRequirementCount + 1,
    };
    if (
      checkSummaryIntegrity(inflatedRequirements, probe.testCoverage, {
        retired: [],
        lettered: [],
        unknown: ['probe/REQ-9.9'],
      }).reasons.length === 0
    ) {
      failures.push('要件の 被覆済み + 未被覆 ≠ 総数 を見逃した');
    }

    // (c) 落とした番号を内訳が挙げていない
    const vanished = checkSummaryIntegrity(sound, probe.testCoverage, NO_OUT_OF_DENOMINATOR);
    if (vanished.reasons.length === 0) {
      failures.push('分子から落とした番号がどの報告枠にも出ていない状態を見逃した');
    }
    if (!vanished.invisibleMarks.includes('probe/REQ-9.9')) {
      failures.push(
        `黙って消えた番号を名指せていない（${vanished.invisibleMarks.join(', ') || '空'}）`
      );
    }

    // (d) 分母に入っている番号を分母外として挙げている
    const contradicted = checkSummaryIntegrity(sound, probe.testCoverage, {
      retired: [],
      lettered: [],
      unknown: ['probe/REQ-9.9', 'probe/REQ-1.1'],
    });
    if (contradicted.reasons.length === 0) {
      failures.push('分母に入っている番号を分母外として挙げた状態を見逃した');
    }
  });
  return failures;
}

/**
 * 要件レベルで分母に無い番号を名乗る被覆印も、黙って消えない
 *
 * 分母外の内訳は受入基準の番号しか扱わない。要件だけを名乗る印が分母に無い場合、
 * 挙げる枠がそもそも無いため、整合検査自身が名指さなければ誰も気づかない。
 */
function checkDroppedRequirementMarksNeverVanish(): string[] {
  const failures: string[] = [];
  withFixture({}, (baseDir) => {
    const probe = summaryIntegrityProbe(
      baseDir,
      ['probe/REQ-1.1'],
      ['probe/REQ-1', 'probe/REQ-99']
    );
    if (typeof probe === 'string') {
      failures.push(probe);
      return;
    }
    if (probe.result.coveredRequirementCount !== 1) {
      failures.push(
        `分母の外の要件が分子に入っている（1件のはずが ${probe.result.coveredRequirementCount} 件）`
      );
    }
    const report = checkSummaryIntegrity(probe.result, probe.testCoverage, NO_OUT_OF_DENOMINATOR);
    if (report.droppedRequirementMarks.join(',') !== 'probe/REQ-99') {
      failures.push(
        `分子から落とした要件番号を挙げていない（${report.droppedRequirementMarks.join(', ') || '空'}）`
      );
    }
    if (!report.invisibleMarks.includes('probe/REQ-99')) {
      failures.push('分母に無い要件番号を名乗る被覆印が黙って消えた');
    }
    if (report.reasons.length === 0) {
      failures.push('分母に無い要件番号を名乗る被覆印を見逃した');
    }
  });
  return failures;
}

/**
 * 逐語複製の目印（`shall` 以降）の取り出しが、狙った形だけを拾う
 *
 * **境界の語句を定数から導いてはならない。** かつてここは
 * `'あ'.repeat(MIN_CRITERION_QUOTE_LENGTH - 1)` と `.repeat(MIN_CRITERION_QUOTE_LENGTH)` で
 * 境界を書いていた。定数が変われば主張も一緒に動くため、**この主張は決して落ちない**。
 * 115.197 のレビューが実測した: `MIN_CRITERION_QUOTE_LENGTH = 4` の変異で自己検査は
 * 48/48 緑のままだったが、本番ゲートは新たに「原文を逐語複製しながらその条文を
 * 名乗っていない被覆印が3件」で赤くなり、守備範囲も 283→296 と動いた
 * （＝実データに効く判断が、自己検査からは見えていなかった）。
 * よって境界は**リテラルで書き下し**、併せて定数の値そのものを主張する。
 */
function checkCriterionQuote(): string[] {
  const failures: string[] = [];
  const quote = criterionQuote('The システム shall 項目一覧の下にExcel出力ボタンを表示する');
  if (quote !== '項目一覧の下にExcel出力ボタンを表示する') {
    failures.push(`shall 以降を取り出せていない: ${quote ?? 'null'}`);
  }
  if (criterionQuote('WHEN ログインする THEN Serviceはトークンを発行しなければならない') !== null) {
    failures.push('shall を含まない条文から目印を取り出した');
  }

  // 目印の前後の空白は落とす。落とさないと、同じ語句の写しが空白の有無で一致しなくなる
  const padded = criterionQuote('The システム shall   項目一覧の下にExcel出力ボタンを表示する  ');
  if (padded !== '項目一覧の下にExcel出力ボタンを表示する') {
    failures.push(`目印の前後の空白を落としていない: 「${padded ?? 'null'}」`);
  }

  // 最小長の境界。**定数から導かず、文字数を書き下す。**
  const TEN_CHARACTERS = '合計金額を画面に表示';
  const ELEVEN_CHARACTERS = '明細行の合計を画面表示';
  if (TEN_CHARACTERS.length !== 10 || ELEVEN_CHARACTERS.length !== 11) {
    // 見本の文字数が狂っていれば、以下の主張は境界を測っていない（対照が空振りしている）
    failures.push(
      `境界の見本の文字数が違う（10文字のはずが ${TEN_CHARACTERS.length}、` +
        `11文字のはずが ${ELEVEN_CHARACTERS.length}）`
    );
  }
  if (MIN_CRITERION_QUOTE_LENGTH !== 11) {
    failures.push(
      `逐語複製の目印の最小長が 11 でない（${MIN_CRITERION_QUOTE_LENGTH}）。` +
        'この値より一つ下まで許すと偶然の一致が混じる（タスク 115.309 が段ごとに数え直した）。' +
        '値を動かすなら、下の境界の見本も同時に書き改めること'
    );
  }
  if (criterionQuote(`The システム shall ${TEN_CHARACTERS}`) !== null) {
    failures.push('10 文字の語句を目印として採った（短すぎる語句は条文を名指さない）');
  }
  if (criterionQuote(`The システム shall ${ELEVEN_CHARACTERS}`) !== ELEVEN_CHARACTERS) {
    failures.push('11 文字ちょうどの語句を落とした');
  }
  return failures;
}

/**
 * 効いている閾値と、閾値が塞いでいない側の量を、開示の二方向へ出す
 *
 * **限界は出さなければ無いのと同じである**（タスク 115.300 の教訓を閾値へ適用した形。
 * タスク 115.309）。従前この閾値は、人が読む報告にも JSON にも一度も現れていなかった。
 * 読み手は「本検査が短い条文を素通りさせる」ことも「どれだけ素通りさせるか」も、
 * ソースを読むまで知りようがなかった。
 *
 * 見るのは二方向である。
 *
 *   1. **機械が読む JSON**: `reportCriterionTextCopies` の返す値に `minQuoteLength` と
 *      `criteriaBelowMinLength` が載る（`printJsonReport` は報告をそのまま出す）。
 *   2. **人が読む報告**: `printReport` の印字がその二つを内挿する。ここはソースの字面で見る
 *      ——`printReport` は輸出されておらず、呼べば標準出力を占有するためである。
 *
 * **前提が崩れたときは自動的に無効化せず失格させる**（AI 運用第 3 原則）。印字の塊そのものを
 * 見つけられなければ、内挿の有無を判定していないので失格とする。
 */
function checkQuoteLengthLimitIsDisclosed(): string[] {
  const failures: string[] = [];

  // (1) 機械が読む側。実データを読むが、見るのは限界の量であって被覆の値ではない。
  const features = extractAllFeatures(discoverFeatures());
  const report = reportCriterionTextCopies(features);
  if (report.minQuoteLength !== MIN_CRITERION_QUOTE_LENGTH) {
    failures.push(
      `報告が名乗る最小長が定数と違う（報告 ${report.minQuoteLength} / 定数 ${MIN_CRITERION_QUOTE_LENGTH}）`
    );
  }
  // 数え方そのものを別経路で数え直す。**非零の確認だけでは足りない**——数える対象を
  // 「shall を持たない条文」へすり替える変異は、値が非零のまま通ってしまう（実測した）。
  let expectedBelow = 0;
  for (const feature of features) {
    for (const requirement of feature.requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        const at = criterion.text.lastIndexOf('shall ');
        if (at < 0) continue;
        if (criterion.text.slice(at + 'shall '.length).trim().length < MIN_CRITERION_QUOTE_LENGTH) {
          expectedBelow += 1;
        }
      }
    }
  }
  if (report.criteriaBelowMinLength !== expectedBelow) {
    failures.push(
      `閾値に届かない条文の数え方が違う（報告 ${report.criteriaBelowMinLength} / 別経路 ${expectedBelow}）。` +
        '数える対象は「shall 以降を取り出せるのに短すぎる条文」であり、shall を持たない条文ではない'
    );
  }
  // 空振りの検出。実データに短い条文が一つも無ければ、この開示は何も測っていない。
  // その状態は「閾値を撤去してよい」という別の判断を要求するので、黙って緑にしない。
  if (expectedBelow === 0) {
    failures.push(
      '閾値に届かない受入基準が実データに一件も無い（開示が空振りしている）。' +
        '閾値そのものが不要になった可能性があるため、撤去の可否を判断すること'
    );
  }

  // (2) 人が読む側。印字の塊を字面で捉える。
  const source = fs.readFileSync(EXTRACTOR_SOURCE_PATH, 'utf-8');
  const marker = '目印として採る原文の最小長';
  const at = source.indexOf(marker);
  if (at < 0) {
    failures.push(
      `人が読む報告に最小長の開示が無い（${EXTRACTOR_SOURCE_PATH} に「${marker}」の印字が見つからない）`
    );
    return failures;
  }
  const printed = source.slice(at, at + 400);
  for (const field of ['minQuoteLength', 'criteriaBelowMinLength']) {
    if (!printed.includes(`copyReport.${field}`)) {
      failures.push(`人が読む報告が ${field} を内挿していない（開示が片方向に寄っている）`);
    }
  }

  return failures;
}

/**
 * 限界の前提を機械で固定する: 実データに二重 `shall` の受入基準は無い
 *
 * `criterionQuote` は `lastIndexOf('shall ')` で切る。一つの条文が `shall ` を二度持つとき、
 * 最初と最後のどちらで切るべきかは**実データからは決まらない**。
 * 115.197 の走査で `lastIndexOf` を `indexOf` へ変える変異を当てたところ自己検査は 48/48 緑で、
 * 本検査群はこの選択を固定していない。仮の見本で片方を「正しい」と決めると、
 * 根拠の無い決めごとを検査の形で固定してしまう。
 *
 * そこで**挙動ではなく前提の方を固定する。** 実測（115.197 時点）は
 * 受入基準 2888 件・`shall ` を含むもの 2500 件・二重 `shall` は 0 件である。
 * 二重 `shall` の条文が現れた時点でこの検査が赤くなり、
 * どちらで切るかを決めて見本で固定する作業を要求する。
 * 母集団が空でないことも併せて主張し、この対照が空振りしないようにする。
 */
function checkDoubleShallCriterionIsAbsent(): string[] {
  const failures: string[] = [];
  const features = extractAllFeatures(discoverFeatures());
  let withShall = 0;
  const doubled: string[] = [];
  for (const feature of features) {
    for (const requirement of feature.requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        const occurrences = criterion.text.split('shall ').length - 1;
        if (occurrences >= 1) withShall += 1;
        if (occurrences >= 2) doubled.push(criterion.id);
      }
    }
  }
  if (withShall === 0) {
    failures.push('`shall ` を含む受入基準が一件も無い（この対照が空振りしている）');
  }
  if (doubled.length > 0) {
    failures.push(
      `二重の \`shall\` を持つ受入基準が現れた（${doubled.slice(0, 5).join(', ')} ほか計 ${doubled.length} 件）。` +
        '目印を最初と最後のどちらの `shall` で切るかが実データに効くようになった。' +
        'どちらを採るかを決め、見本で固定すること（`criterionQuote` の `lastIndexOf`）'
    );
  }
  return failures;
}

/**
 * 探り用の要件定義書（受入基準12件）で逐語複製の検査を回す
 *
 * **枝番は二桁まで置く。** かつてここは受入基準3件しか持たず、`N.1` と `N.10` が
 * 共存する形を写していなかった。そのため `proseAttributesCriterion` の
 * `(?![0-9])` 先読みを撤去する変異を**どの見本も捕まえなかった**（115.197 のレビューが実測）。
 * 実データには `site-survey/REQ-11.13`・`REQ-11.14`・`REQ-12.14`・
 * `quantity-table-generation/REQ-47.15`〜`47.18` のように二桁の枝番が実在する。
 *
 * 12 件目は 10 件目の目印を本文に含む。**同一機能の他の条文の本文にも現れる語句は
 * その条文を名指さない**という除外規則を通す見本であり、実データでも
 * 「別画面でも同じ規則を適用する」型の条文が互いの文言を含む形で現れる。
 *
 * 食い違いだけでなく**母集団つきの報告**を返す。母数（`blocks` / `blocksWithCopy`）は
 * 「食い違い 0 件」と「何も守っていない」を区別する指標であり、
 * 仮想の資料の側でも数え方を固定しておかないと、母数の水増しが誰にも見えなくなる。
 */
function runCopyReportProbe(spec: string): ReturnType<typeof reportCriterionTextCopies> {
  // 探りの検証資料が空だと塊が一つも立たず、「食い違いを挙げない」側の主張は恒真になる
  //（第3原則。115.252）
  if (spec.trim() === '') {
    throw new Error('探り用の検証資料 spec が空です（この確認が空振りしています）');
  }
  const requirements = [
    '### Requirement 1: 探り用の要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 一覧の下にExcel出力ボタンを表示する',
    '2. The システム shall 一覧の下に印刷ボタンを表示する',
    '3. The システム shall 一覧の見出しを固定表示する',
    '4. The システム shall 明細行の合計を画面下部に表示する',
    '5. The システム shall 検索条件を保存して次回の起動時に復元する',
    '6. The システム shall 添付ファイルの拡張子を検証して受け付けない形式を弾く',
    '7. The システム shall 権限の無い利用者に編集の操作を許さない',
    '8. The システム shall 変更の内容を監査ログへ記録する',
    '9. The システム shall 通信が途切れたとき再送を促す案内を表示する',
    '10. The システム shall 一覧の並び順を利用者ごとに記憶する',
    '11. The システム shall 帳票の余白をA4の既定値に揃える',
    '12. The システム shall 一覧の並び順を利用者ごとに記憶する規則を印刷の画面にも及ぼす',
    '',
  ].join('\n');
  let result: ReturnType<typeof reportCriterionTextCopies> = {
    blocks: 0,
    blocksWithCopy: 0,
    exemptedByProseAttribution: 0,
    minQuoteLength: MIN_CRITERION_QUOTE_LENGTH,
    criteriaBelowMinLength: 0,
    mismatches: [],
  };
  withFixture({ 'requirements.md': requirements, 'specs/probe.spec.ts': spec }, (baseDir) => {
    const extracted = extractRequirements('probe', path.join(baseDir, 'requirements.md'));
    const features: Feature[] = [
      {
        name: 'probe',
        path: baseDir,
        requirements: extracted,
        totalAcceptanceCriteria: extracted.reduce(
          (sum, requirement) => sum + requirement.acceptanceCriteria.length,
          0
        ),
        retiredAcceptanceCriteriaCount: 0,
        retiredRequirements: [],
      },
    ];
    result = reportCriterionTextCopies(features, [path.join(baseDir, 'specs')]);
  });
  return result;
}

/** 探り用の資料で食い違いだけを取り出す（母数を見ない呼び出し向け） */
function runCopyMismatchProbe(spec: string): ReturnType<typeof findCriterionTextCopyMismatches> {
  return runCopyReportProbe(spec).mismatches;
}

/** 二つの機能を持つ探り用の資料で、逐語複製の報告を取る */
function runTwoFeatureCopyReportProbe(spec: string): ReturnType<typeof reportCriterionTextCopies> {
  // 探りの検証資料が空だと塊が一つも立たず、以下の主張は恒真になる（第3原則。115.252）
  if (spec.trim() === '') {
    throw new Error('探り用の検証資料 spec が空です（この確認が空振りしています）');
  }
  const probeRequirements = [
    '### Requirement 1: 探り用の要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 一覧の下にExcel出力ボタンを表示する',
    '',
  ].join('\n');
  const neighborRequirements = [
    '### Requirement 2: 隣の機能の要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 隣の機能の一覧を五十音順に並べ替える',
    '2. The システム shall 隣の機能の一覧に絞り込みの入力欄を置く',
    '',
  ].join('\n');

  // 探りの資料が受入基準を失うと、呼び出し側の「挙げない」側の主張が恒真になる
  // （第3原則。115.252 の候補5。実測 2026-09-03: `probeRequirements` の中身を空にすると
  // 65/65 緑・EXIT=0）。前提の崩壊は黙って通さず、ここで止める。
  //
  // **関門は自分の素材の配列を持ってはならない**（115.247 の作法。115.252 の候補3 の自己隠蔽
  // そのもの）。当初この関門を `for (const [label, document] of [['probeRequirements', ...],
  // ...] as const)` と書いていたが、**その直書き配列を空にするだけで関門ごと黙って消えた**
  // （実測 2026-09-03: 当該配列を `[] as const` に空化して 65/65 緑・EXIT=0）。素材ごとに直に書く。
  if (!probeRequirements.includes('#### Acceptance Criteria')) {
    throw new Error(
      '探り用の資料 probeRequirements が受入基準を持たない（この対照が空振りしています）'
    );
  }
  if (!neighborRequirements.includes('#### Acceptance Criteria')) {
    throw new Error(
      '探り用の資料 neighborRequirements が受入基準を持たない（この対照が空振りしています）'
    );
  }

  let result: ReturnType<typeof reportCriterionTextCopies> = {
    blocks: 0,
    blocksWithCopy: 0,
    exemptedByProseAttribution: 0,
    minQuoteLength: MIN_CRITERION_QUOTE_LENGTH,
    criteriaBelowMinLength: 0,
    mismatches: [],
  };
  withFixture(
    {
      'probe/requirements.md': probeRequirements,
      'neighbor/requirements.md': neighborRequirements,
      'specs/probe.spec.ts': spec,
    },
    (baseDir) => {
      const features: Feature[] = ['probe', 'neighbor'].map((name) => {
        const extracted = extractRequirements(name, path.join(baseDir, name, 'requirements.md'));
        return {
          name,
          path: path.join(baseDir, name),
          requirements: extracted,
          totalAcceptanceCriteria: extracted.reduce(
            (sum, requirement) => sum + requirement.acceptanceCriteria.length,
            0
          ),
          retiredAcceptanceCriteriaCount: 0,
          retiredRequirements: [],
        };
      });
      result = reportCriterionTextCopies(features, [path.join(baseDir, 'specs')]);
    }
  );
  return result;
}

/**
 * 目印の候補は、その区間が**名乗っている機能**の条文に限る
 *
 * 機能をまたぐ語句の一致は偽陽性が多いため、候補はその区間が既に名乗っている機能へ絞る
 * （`reportCriterionTextCopies` の限界の記述を参照）。この絞り込みは実データに強く効く。
 * 115.197 の走査で候補を全機能へ広げたところ、自己検査は 57/57 緑のまま、
 * 本番ゲートの出力は 37942 → 56816 バイトへ膨れた（＝大量の偽陽性が湧いた）。
 *
 * 陰性: 隣の機能の条文を写していても、その機能を名乗っていなければ挙げない・写しにも数えない。
 * 陽性: 同じ語句でも、隣の機能を名乗っている区間なら挙げる（絞り込みが厳しすぎないこと）。
 * 陽性側を置かないと「常に挙げない」実装でも陰性側が成立し、この対照が空振りする。
 */
function checkCopyCandidatesAreLimitedToClaimedFeatures(): string[] {
  const failures: string[] = [];
  const quote = ' * 隣の機能の一覧を五十音順に並べ替える';

  const foreign = runTwoFeatureCopyReportProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      quote,
      ' */',
      "test('一覧が並べ替えられる', async () => {});",
      '',
    ].join('\n')
  );
  if (foreign.mismatches.length !== 0) {
    failures.push(
      '名乗っていない機能の条文との食い違いを挙げた: ' +
        `${foreign.mismatches.map((m) => m.criterionId).join(', ')}`
    );
  }
  if (foreign.blocksWithCopy !== 0) {
    failures.push(
      `名乗っていない機能の条文の写しを守備範囲へ数えた（${foreign.blocksWithCopy} 件）`
    );
  }

  const own = runTwoFeatureCopyReportProbe(
    [
      '/**',
      ' * @requirement neighbor/REQ-2.2',
      quote,
      ' */',
      "test('一覧が並べ替えられる', async () => {});",
      '',
    ].join('\n')
  );
  const ownIds = own.mismatches.map((m) => m.criterionId);
  if (ownIds.length !== 1 || ownIds[0] !== 'neighbor/REQ-2.1') {
    failures.push(
      '名乗っている機能の条文との食い違いを挙げていない（対照が空振りしている。挙げた: ' +
        `${ownIds.join(', ') || '無し'}）`
    );
  }
  if (own.blocksWithCopy !== 1) {
    failures.push(
      `名乗っている機能の条文の写しを守備範囲へ数えていない（${own.blocksWithCopy} 件）`
    );
  }
  return failures;
}

/**
 * 逐語複製の食い違いを、両方向で固定する
 *
 * 陽性: 原文を写しながら別の条文を名乗る区間を挙げる
 * 陰性: 写した条文を名乗っている区間・番号を添えて引用している区間・隣の区間の前書きは挙げない
 */
function checkCriterionTextCopyMismatch(): string[] {
  const failures: string[] = [];

  const positive = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' * 一覧の下に印刷ボタンを表示する',
      ' */',
      "test('印刷ボタンが表示される', async () => {});",
      '',
    ].join('\n')
  );
  if (positive.length !== 1 || positive[0]?.criterionId !== 'probe/REQ-1.2') {
    failures.push(
      `写した条文との食い違いを挙げられていない（挙げた: ${positive.map((m) => m.criterionId).join(', ') || '無し'}）`
    );
  }

  const consistent = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.2',
      ' * 一覧の下に印刷ボタンを表示する',
      ' */',
      "test('印刷ボタンが表示される', async () => {});",
      '',
    ].join('\n')
  );
  if (consistent.length !== 0) {
    failures.push(`一致している区間を挙げた: ${consistent.map((m) => m.criterionId).join(', ')}`);
  }

  const attributed = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' * 受入基準1.2「一覧の下に印刷ボタンを表示する」は本検証の対象外である。',
      ' */',
      "test('Excel出力ボタンが表示される', async () => {});",
      '',
    ].join('\n')
  );
  if (attributed.length !== 0) {
    failures.push(`番号を添えた引用を挙げた: ${attributed.map((m) => m.criterionId).join(', ')}`);
  }

  // 隣の宣言の前書きは自分の区間ではない。
  // 前書き側に番号を書かないのは、出典明示の免除に隠れて対照が空振りするのを防ぐため
  // （番号を書くと、区間を広げる変異を入れても免除が働いて挙がらなくなる）。
  const neighbour = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' */',
      "test('Excel出力ボタンが表示される', async () => {});",
      '',
      '// 一覧の下に印刷ボタンを表示する',
      "test('印刷ボタンが表示される', async () => {});",
      '',
    ].join('\n')
  );
  if (neighbour.length !== 0) {
    failures.push(
      `隣の区間の前書きを読み込んだ: ${neighbour.map((m) => m.criterionId).join(', ')}`
    );
  }

  return failures;
}

/**
 * 出典明示の免除が、**その条文の番号だけ**に反応する
 *
 * 免除は「写した条文の番号が同じ区間の散文に書かれている」ときに働く
 * （`proseAttributesCriterion`）。番号の照合が緩むと、番号を書いていない区間まで
 * 免除に入り、**食い違いが黙って挙がらなくなる**。緩む向きは三つある。
 *
 *   - 後ろに数字が続く形（`1.10` の中の `1.1`）… `(?![0-9])` が防ぐ
 *   - 前に数字や点が続く形（`11.1` の中の `1.1`）… `(?<![0-9.])` が防ぐ
 *   - 点を任意の一字と読む形（`1-1` を `1.1` と読む）… 点の逃がしが防ぐ
 *
 * いずれも 115.197 の走査時点ではどの見本も捕まえていなかった。
 * 三つとも「免除が効きすぎて陽性が消える」向きなので、
 * **食い違いが1件挙がること**を主張すれば緩みが赤くなる。
 */
function checkCriterionAttributionIsNumberExact(): string[] {
  const failures: string[] = [];

  const cases: Array<[string, string]> = [
    ['後ろに数字が続く番号（1.10）を 1.1 と読まない', ' * 受入基準1.10 は別の検証で扱う。'],
    ['前に数字が続く番号（11.1）を 1.1 と読まない', ' * 関連する画面番号は 11.1 である。'],
    ['点を任意の一字と読まない（1-1 を 1.1 と読まない）', ' * 画面ID 1-1 の一覧を対象とする。'],
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (cases.length === 0) {
    failures.push('合成素材 cases が空です（この確認が空振りしています）');
  }
  for (const [label, proseLine] of cases) {
    const found = runCopyMismatchProbe(
      [
        '/**',
        ' * @requirement probe/REQ-1.2',
        proseLine,
        ' * 一覧の下にExcel出力ボタンを表示する',
        ' */',
        "test('Excel出力ボタンが表示される', async () => {});",
        '',
      ].join('\n')
    );
    const ids = found.map((m) => m.criterionId);
    if (ids.length !== 1 || ids[0] !== 'probe/REQ-1.1') {
      failures.push(
        `${label}: 写した条文 probe/REQ-1.1 との食い違いを挙げていない（挙げた: ${ids.join(', ') || '無し'}）`
      );
    }
  }

  return failures;
}

/**
 * 出典明示で免除した組の数を、免除が働いたときだけ数える（タスク 115.254）
 *
 * `exemptedByProseAttribution` は「番号を添えて引用すれば検査は黙る」という免除の口の
 * 広さを、散文の記述ではなく**検査自身の出力**として出すために置いた。従前は限界の記述が
 * この件数と実例を散文で挙げており、実データが動いたまま偽になっていた。
 *
 * 出力である以上、二つの向きを固定しないと数字が意味を失う。
 *
 *   - 免除が働く区間で数えること（無条件に数えない形へ退化すると陽性側が 0 になる）
 *   - 免除が働かない区間では数えないこと（無条件の加算へ退化すると陰性側が 1 になる）
 *
 * どちらの見本も、写す条文（`probe/REQ-1.1` の本文）と名乗る条文（`probe/REQ-1.2`）が
 * 食い違う形である。違いは**散文が写した条文の番号を挙げているかどうか**だけであり、
 * 免除の成否がそのまま件数と食い違いの有無に出る。
 */
function checkProseAttributionExemptionIsCounted(): string[] {
  const failures: string[] = [];

  const cases: Array<{
    label: string;
    proseLine: string;
    expectedExempted: number;
    expectedMismatches: number;
  }> = [
    {
      label: '散文が写した条文の番号を挙げている（免除が働く）',
      proseLine: ' * 受入基準 1.1 は除外である。ゆえに被覆印は掲げない。',
      expectedExempted: 1,
      expectedMismatches: 0,
    },
    {
      label: '散文が写した条文の番号を挙げていない（免除は働かない）',
      proseLine: ' * 出力の導線をここで確かめる。',
      expectedExempted: 0,
      expectedMismatches: 1,
    },
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (cases.length === 0) {
    failures.push('合成素材 cases が空です（この確認が空振りしています）');
  }
  for (const { label, proseLine, expectedExempted, expectedMismatches } of cases) {
    const report = runCopyReportProbe(
      [
        '/**',
        ' * @requirement probe/REQ-1.2',
        proseLine,
        ' * 一覧の下にExcel出力ボタンを表示する',
        ' */',
        "test('Excel出力ボタンが表示される', async () => {});",
        '',
      ].join('\n')
    );
    if (report.blocksWithCopy !== 1) {
      failures.push(
        `${label}: 写しを持つ区間が 1 でない（${report.blocksWithCopy}）。` +
          '見本が写しとして読まれておらず、この対照は空振りしている'
      );
      continue;
    }
    if (report.exemptedByProseAttribution !== expectedExempted) {
      failures.push(
        `${label}: 出典明示で免除した組の数が ${expectedExempted} でない` +
          `（${report.exemptedByProseAttribution}）`
      );
    }
    if (report.mismatches.length !== expectedMismatches) {
      failures.push(
        `${label}: 食い違いの数が ${expectedMismatches} でない` +
          `（${report.mismatches.map((m) => m.criterionId).join(', ') || '無し'}）`
      );
    }
  }

  return failures;
}

/**
 * ファイル前書きの区間でも、報告する行番号が 1 以上になる
 *
 * 区間の宣言行はテスト・群の宣言（0 始まり）で、**ファイル前書きだけは -1** である。
 * 報告は 1 始まりなので、素直に `declaration + 1` とすると前書きの区間だけ行番号 0 になる。
 * 0 行目を指す指摘は編集器から辿れず、読み手には「行が分からない」としか見えない。
 *
 * 115.197 のレビューが `Math.max(1, …)` の撤去を無言だと実測した。
 * 実データでは前書きの区間に食い違いが無いためゲートの出力は動かないが、
 * **前書きの区間で食い違いが出た瞬間に**意味が壊れる形なので、ここで固定する。
 *
 * 見本は被覆印の後ろに宣言でない行（`import`）を置く。こうすると被覆印は
 * 「次の宣言の前書き」に見えず、ファイル前書きの区間（宣言行 -1）に落ちる。
 */
function checkFilePreambleMismatchReportsLineOne(): string[] {
  const failures: string[] = [];
  const found = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' * 一覧の下に印刷ボタンを表示する',
      ' */',
      "import { test } from '@playwright/test';",
      '',
      "test('印刷ボタンが表示される', async () => {});",
      '',
    ].join('\n')
  );
  if (found.length !== 1 || found[0]?.criterionId !== 'probe/REQ-1.2') {
    return [
      'ファイル前書きの区間で食い違いを挙げられていない（対照が空振りしている。挙げた: ' +
        `${found.map((m) => m.criterionId).join(', ') || '無し'}）`,
    ];
  }
  if (found[0]?.line !== 1) {
    failures.push(
      `ファイル前書きの区間の行番号が 1 でない（${found[0]?.line}）。` +
        '報告は 1 始まりであり、0 行目を指す指摘は辿れない'
    );
  }
  return failures;
}

/**
 * 目印にならない語句（同一機能の他の条文の本文にも現れる語句）は食い違いに使わない
 *
 * 受入基準 1.10 の目印は受入基準 1.12 の本文にも現れる。どちらの条文を写したのか
 * 語句からは決められないため、この語句は**どの条文も名指さない**。
 * 除外を落とすと、写し手が意図していない条文との食い違いを挙げてしまう。
 */
function checkAmbiguousQuoteIsNotUsedAsMark(): string[] {
  const found = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.2',
      ' * 一覧の並び順を利用者ごとに記憶する',
      ' */',
      "test('並び順が記憶される', async () => {});",
      '',
    ].join('\n')
  );
  if (found.length !== 0) {
    return [
      `他の条文の本文にも現れる語句を目印として使った: ${found.map((m) => m.criterionId).join(', ')}`,
    ];
  }
  return [];
}

/**
 * 区間が名乗っている条文は、散文に番号が現れていなくても食い違いにしない
 *
 * 被覆印はふつう区間の散文そのものに書かれているため、出典明示の免除と重なって見える。
 * だが**ファイル末尾に続く註釈**は、次の宣言が無いので直前の区間の被覆印として数えられる
 * 一方、区間の散文からは外れる（`splitCoverageBlocks` は末尾の註釈を散文に含めない）。
 * この形では二つの規則がずれ、`block.claimed` を見る側だけが効く。
 * 115.197 の走査は、この形の見本が無いために
 * `if (block.claimed.has(criterionId)) continue;` の撤去が無言になることを実測した。
 */
function checkClaimedCriterionIsNeverAMismatch(): string[] {
  const found = runCopyMismatchProbe(
    [
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' * 一覧の下に印刷ボタンを表示する',
      ' */',
      "test('印刷ボタンが表示される', async () => {});",
      '',
      '// @requirement probe/REQ-1.2',
      '',
    ].join('\n')
  );
  if (found.length !== 0) {
    return [
      `区間が名乗っている条文を食い違いとして挙げた: ${found.map((m) => m.criterionId).join(', ')}`,
    ];
  }
  return [];
}

/**
 * 母数は「写しを持つ区間だけ」を数える（守備範囲の水増しを許さない）
 *
 * `blocksWithCopy` は「食い違い 0 件」と「何も守っていない」を区別するために置いた指標である。
 * 数え方が全区間へ水増しされると、指標は常に母集団と等しくなり**何も区別しなくなる**。
 * 115.197 のレビューが実測した: `if (hasCopy) blocksWithCopy += 1;` を無条件の加算へ変えると
 * 自己検査は 52/52 緑のまま、本番ゲートの「原文の写しを持つ 283件」は 1850件 へ跳ね上がった。
 *
 * 実データ側の主張は片側（0 でないこと）しか置けないため、ここで**両側を挟む**。
 * 写しを持つ区間と持たない区間をちょうど一件ずつ置き、
 * `blocks === 2` かつ `blocksWithCopy === 1` を主張する。
 * 上側（水増し）でも下側（数え落とし）でも赤くなる。
 */
function checkCopyPopulationCountsOnlyBlocksWithCopy(): string[] {
  const failures: string[] = [];

  const report = runCopyReportProbe(
    [
      // 写しを持つ区間: 名乗った条文の原文をそのまま引いている（食い違いではない）
      '/**',
      ' * @requirement probe/REQ-1.1',
      ' * 一覧の下にExcel出力ボタンを表示する',
      ' */',
      "test('Excel出力ボタンが表示される', async () => {});",
      '',
      // 写しを持たない区間: どの条文の目印も本文に現れない
      '/**',
      ' * @requirement probe/REQ-1.3',
      ' * 見出しの固定を目視で確かめる',
      ' */',
      "test('見出しが固定される', async () => {});",
      '',
    ].join('\n')
  );

  if (report.blocks !== 2) {
    failures.push(
      `被覆印を持つ区間の母数が 2 でない（${report.blocks}）。見本が二区間に割れていない（対照が空振りしている）`
    );
  }
  if (report.blocksWithCopy !== 1) {
    failures.push(
      `原文の写しを持つ区間の数が 1 でない（${report.blocksWithCopy}）。` +
        '母数を写しの有無に関わらず数えると、この指標は「何も守っていない」状態と区別できなくなる'
    );
  }
  if (report.mismatches.length !== 0) {
    failures.push(
      `写した条文を名乗っている区間を食い違いに挙げた: ${report.mismatches.map((m) => m.criterionId).join(', ')}`
    );
  }
  return failures;
}

/**
 * 実データ: 逐語複製の担い手が実在する（この検査が空振りしていない）
 *
 * 食い違いが 0 件であることは、**複製を持つ区間が 0 件でも成立してしまう。**
 * 母集団の側から数え、目印を取り出せる条文と、実際に写しを持つ区間の双方が
 * 実在することを確かめる。
 *
 * 守備範囲は**両側で挟む**。下側だけでは「守備範囲が全区間へ水増しされた」形を通してしまう
 * （115.197 のレビューが実測。283件 → 1850件 になっても片側の主張は成立していた）。
 * 上側は「写しを持たない区間が現に存在する」ことと同義であり、
 * 本検査が網羅ではなく担い手の移った箇所だけを守る形であることの機械的な表明でもある。
 */
function checkRealCriterionTextCopiesExist(): string[] {
  const failures: string[] = [];
  const features = extractAllFeatures(discoverFeatures());
  let quotable = 0;
  for (const feature of features) {
    for (const requirement of feature.requirements) {
      for (const criterion of requirement.acceptanceCriteria) {
        if (criterionQuote(criterion.text) !== null) quotable += 1;
      }
    }
  }
  if (quotable === 0) {
    failures.push('目印を取り出せる受入基準が一件も無い（逐語複製の検査が空振りしている）');
  }

  // 実物の走査根（`CODE_DIRS`）に、受入基準の原文を写した区間が現に存在すること。
  // 存在しなければ、食い違い 0 件は「何も守っていない」ことと区別できない。
  const roots = CODE_DIRS.join(' / ');
  const report = reportCriterionTextCopies(features);
  if (report.blocks === 0) {
    failures.push(`${roots} に被覆印を持つ区間が一件も無い（走査そのものが空振り）`);
  }
  if (report.blocksWithCopy === 0) {
    failures.push(
      `${roots} に受入基準の原文を写した被覆印の区間が一件も無い（この検査は何も守っていない）`
    );
  }
  if (report.blocksWithCopy >= report.blocks) {
    failures.push(
      `${roots} の被覆印を持つ区間 ${report.blocks} 件のうち ` +
        `${report.blocksWithCopy} 件が原文の写しを持つとされた。` +
        '写しを持たない区間が一件も無いのは実態と合わない（守備範囲が全区間へ水増しされている）'
    );
  }
  return failures;
}

// ============================================================================
// 実行
// ============================================================================

const GROUPS: Group[] = [
  {
    title: '被覆源として数えなければならない形（到達する）',
    cases: [
      { name: '生きた本番モジュールと、その検証', polarity: 'positive', run: checkReachableForms },
    ],
  },
  {
    title: '被覆源として数えてはならない形（到達しない）',
    cases: [
      {
        name: '死んだ本番モジュールと、その検証',
        polarity: 'negative',
        run: checkUnreachableForms,
      },
    ],
  },
  {
    title: '取り込みの解析',
    cases: [
      { name: '取り込みの各形を抽出し、コメント内は抽出しない', run: checkImportFormsAreExtracted },
      { name: '別名・拡張子省略・index・ESM の .js 指定を解決する', run: checkSpecifierResolution },
      { name: '検証ファイルの判定が過不足なく行われる', run: checkVerificationFileDetection },
    ],
  },
  {
    title: '受入基準への集約',
    cases: [{ name: '到達する被覆源が一つでもあれば到達とする', run: checkCriterionAggregation }],
  },
  {
    title: 'ヘッダー直下の要件一覧の区間判定',
    cases: [
      {
        name: '次のヘッダーで区間を切る（過大帰属を防ぐ）',
        run: checkHeaderSectionStopsAtNextHeader,
      },
      {
        name: 'JSDoc の終端で区間を切る（本体側の記述を飲み込まない）',
        run: checkHeaderSectionStopsAtJsDocEnd,
      },
      {
        name: 'ヘッダーを囲むコメントの終端で切る（先行するコメントと取り違えない）',
        run: checkHeaderSectionStopsAtEnclosingCommentEnd,
      },
      {
        name: 'JSDoc 内の段落の切れ目で区間を切る（直後の散文を被覆主張にしない）',
        run: checkHeaderSectionStopsAtJsDocParagraphBreak,
      },
      {
        name: '段落の切れ目の陰性対照が規則4の除去に実際に反応する（空振りの検出）',
        run: checkParagraphBreakFixtureActuallyReacts,
      },
      {
        name: '行頭のコメント記号を一覧の印と取り違えない（継続行・散文・開始記号）',
        run: checkJsDocLinePrefixIsNotAListMarker,
      },
      {
        name: '継続行・散文の陰性対照が印の有無にだけ反応する（空振りの検出）',
        run: checkListMarkerControlActuallyReacts,
      },
      {
        name: '行頭より後ろの `*` は従来どおり一覧の印である（厳しすぎの側）',
        run: checkAsteriskBulletIsStillAListMarker,
      },
      { name: '空行では従来どおり切る', run: checkHeaderSectionStillStopsAtBlankLine },
      {
        name: '帰属の対象外の機能のヘッダーでも区間を切る（--feature 絞り込み時の復活を防ぐ）',
        run: checkUnlistedFeatureHeaderStillEndsSection,
      },
      { name: '区間の終端は四つの上限の最も手前を採る', run: checkSectionEndTakesEarliestBoundary },
      { name: '実データの過大帰属が解消している', run: checkRealFileIsNotOverAttributed },
      {
        name: '実データの散文が被覆主張として拾われない',
        run: checkRealProseIsNotClaimedAsCoverage,
      },
      {
        name: '実データの陰性対照が規則4の除去に実際に反応する（空振りの検出）',
        run: checkRealProseControlsActuallyReact,
      },
      {
        name: '抽出器の説明文が陳腐化する実例を挙げず、指し先が実在する',
        run: checkExtractorDocCitesNoPerishableExample,
      },
      {
        name: '規則4が落とす被覆印の母集団が実測と過不足なく一致する',
        run: checkRule4DroppedMarkPopulationIsExact,
      },
      {
        name: '段落の切れ目の散文が実データの件数と列挙を持たず台帳を指す',
        run: checkParagraphBreakDocDelegatesPopulation,
      },
      {
        name: '抽出器の限界の記述が実データの名指しと計数を持たず現況の出所を指す',
        run: checkExtractorLimitDocsCiteNoRealData,
      },
    ],
  },
  {
    title: '一覧項目の識別子欄（過小帰属）',
    cases: [
      {
        name: '読点で並べた続きと接頭辞なしの並びを最後まで読む',
        run: checkIdListEnumeratesEveryItem,
      },
      {
        name: '識別子の並びでない箇条書きと印を持たない継続行は読まない（過大帰属の側）',
        run: checkProseBulletIsNotAnIdList,
      },
      {
        name: '陰性対照が識別子欄の文法と印の有無にだけ反応する（空振りの検出）',
        run: checkProseBulletControlActuallyReacts,
      },
      { name: '実データの過小帰属が解消している', run: checkRealUnderAttributionIsResolved },
    ],
  },
  {
    title: '一覧項目の番号の書式（範囲・枝つき要件番号）',
    cases: [
      {
        name: '範囲は両端だけを記録し、間を展開しない',
        run: checkNumberRangeRecordsBothEndsOnly,
      },
      {
        name: '範囲の陰性対照が展開の有無にだけ反応する（空振りの検出）',
        run: checkNumberRangeControlActuallyReacts,
      },
      {
        name: '枝番を持たない識別子欄から受入基準を名乗らない',
        run: checkIdsWithoutBranchClaimNoCriterion,
      },
      {
        name: '枝つき要件番号を基底番号へ丸めない（両経路）',
        run: checkLetteredRequirementNumberIsRecorded,
      },
      {
        name: '実データに枝つき要件番号の被覆印が実在し拾われている',
        run: checkRealLetteredRequirementMarkExists,
      },
      {
        name: '引用された字面をヘッダーと読まず、宣言されたヘッダーは落とさない',
        run: checkQuotedHeaderIsNotDetected,
      },
      {
        name: '宣言か引用かの判定が両向きに働く（一律の退化を検出）',
        run: checkDeclaredHeaderPredicateIsTwoSided,
      },
      {
        name: '文字列リテラル中の終端の無い `/*` が正当なヘッダーを飲み込まない',
        run: checkUnterminatedBlockOpenDoesNotSwallowHeader,
      },
      {
        name: '行の途中で開くフェンスとヘッダーの字面が実データで同居しない',
        run: checkMidLineFenceFilesCarryNoCoverageHeader,
      },
      {
        name: '機能名を欠くヘッダーの数え方が両向きに働く（読まれない被覆印の開示）',
        run: checkFeaturelessHeaderCountingIsTwoSided,
      },
      {
        name: '機能名を欠くヘッダーと眠る名乗りが上限ちょうどである（ラチェット）',
        run: checkFeaturelessHeaderCountIsBounded,
      },
      {
        name: 'ファイルの所在から機能名を推定する規則は誤って結び付ける（規則を緩めない根拠）',
        run: checkDirectoryInferenceMisattributesFeatures,
      },
    ],
  },
  {
    title: '合成対照の陰性側の非空振り（組で見る網）',
    cases: [
      {
        name: '陰性側の合成対照が主張どおりの機構で抑えられている（空振りの検出）',
        run: checkSyntheticNegativeControlsAreNotVacuous,
      },
      {
        name: '資料がすべて陰性側か陽性のみへ分類されている（未分類を残さない）',
        run: checkEverySyntheticFixtureIsClassified,
      },
    ],
  },
  {
    title: '撤廃された受入基準（取り消し線）の扱い',
    cases: [
      { name: '取り消し線の判定が狙った形だけを拾う', run: checkRetiredCriterionPredicate },
      {
        name: '墓標を分母に入れず、現役の番号をずらさない',
        run: checkRetiredCriteriaAreNotExtracted,
      },
      {
        name: '実データの墓標が一件も分母に残っていない',
        run: checkRealRetiredCriteriaAreOutOfDenominator,
      },
      {
        name: '墓標を名乗る被覆印を挙げ、現役の番号は挙げない',
        run: checkRetiredCriterionCoverageMarksAreDetected,
      },
    ],
  },
  {
    title: '被覆印の指し先（存在しない番号・逐語複製との食い違い）',
    cases: [
      {
        name: '枝つき番号は分母に入らず基底番号だけが記録される',
        run: checkLetteredCriteriaAreRecorded,
      },
      {
        name: '実データに枝つき番号が実在する（免除が空振りしていない）',
        run: checkRealLetteredCriteriaExist,
      },
      {
        name: '存在しない番号を挙げ、現役・墓標・枝つき番号・走査対象外は挙げない',
        run: checkUnknownCriterionMarksAreDetected,
      },
      {
        name: '分母に無い番号を成り立ちの軸で取り違えずに数える',
        run: checkOutOfDenominatorBreakdown,
      },
      {
        name: '分子から落とした被覆印が報告枠から消えない（黙って消える印を作らない）',
        run: checkDroppedMarksNeverVanish,
      },
      {
        name: '全体サマリーの整合検査が健全な数え方を赤くしない（空振りの検出）',
        run: checkSummaryIntegrityAcceptsSoundCounts,
      },
      {
        name: '全体サマリーの整合検査が壊れた数え方を四つの向きで捕まえる',
        run: checkSummaryIntegrityRejectsUnsoundCounts,
      },
      {
        name: '分母に無い要件番号を名乗る被覆印も黙って消えない',
        run: checkDroppedRequirementMarksNeverVanish,
      },
      {
        name: '分子を分母との交わりで数える（名乗るだけの番号を分子に入れない）',
        run: checkNumeratorIsIntersectedWithDenominator,
      },
      { name: '逐語複製の目印を狙った形だけ取り出す', run: checkCriterionQuote },
      {
        name: '目印の最小長と、それに届かない条文の量を開示の二方向へ出す',
        run: checkQuoteLengthLimitIsDisclosed,
      },
      { name: '逐語複製との食い違いを両方向で固定する', run: checkCriterionTextCopyMismatch },
      {
        name: '出典明示の免除が条文の番号だけに反応する（緩みで陽性が消えない）',
        run: checkCriterionAttributionIsNumberExact,
      },
      {
        name: '出典明示で免除した組の数を免除が働いたときだけ数える',
        run: checkProseAttributionExemptionIsCounted,
      },
      {
        name: '他の条文の本文にも現れる語句は目印にしない',
        run: checkAmbiguousQuoteIsNotUsedAsMark,
      },
      {
        name: '区間が名乗っている条文は食い違いにしない（末尾の註釈で名乗る形）',
        run: checkClaimedCriterionIsNeverAMismatch,
      },
      {
        name: 'ファイル前書きの区間でも行番号が 1 以上になる',
        run: checkFilePreambleMismatchReportsLineOne,
      },
      {
        name: '二重 shall の受入基準が実データに無い（目印の切り出しの限界の前提）',
        run: checkDoubleShallCriterionIsAbsent,
      },
      {
        name: '守備範囲の母数は写しを持つ区間だけを数える',
        run: checkCopyPopulationCountsOnlyBlocksWithCopy,
      },
      {
        name: '目印の候補は区間が名乗っている機能の条文に限る',
        run: checkCopyCandidatesAreLimitedToClaimedFeatures,
      },
      {
        name: '実データに逐語複製の担い手が存在する（空振りしていない）',
        run: checkRealCriterionTextCopiesExist,
      },
    ],
  },
  {
    title: '除外一覧の監査',
    cases: [
      { name: '除外の各形を正しく分類する', run: checkExclusionAudit },
      {
        name: '区分の見出しが台帳の定義文を逐語のとおり並べる（開示の対照）',
        run: checkExclusionCategoryHeadingIsVerbatim,
      },
      {
        name: '区分の定義文が台帳から集計結果まで運ばれている（結線の対照）',
        run: checkExclusionCategoryHeadingIsWired,
      },
      {
        name: '型宣言は本番モジュールとして数えない（母数と死コード一覧の両方）',
        run: checkTypeDeclarationsAreNotProductionModules,
      },
    ],
  },
  {
    title: '走査対象と前提条件',
    cases: [
      { name: '入口が無いとき何も到達扱いにしない（第3原則）', run: checkEmptyGraphIsNotReachable },
      { name: 'リポジトリ本体を実際に走査できる', run: checkRealRepositoryIsScanned },
      { name: '実在する死コードと生存コードで両側を固定する', run: checkKnownDeadAndLiveModules },
      {
        name: '本番の経路の起点がどれも遊んでいない（外すと到達が真に縮む）',
        run: checkEveryProductionEntryPointContributes,
      },
      {
        name: '被覆印の走査根がどれも遊んでいない（外すと被覆が真に縮む）',
        run: checkEveryCodeScanRootContributes,
      },
      {
        name: '自己検査が測る走査根が本検査の読む走査根と同一である',
        run: checkScanRootsAreTheOnesMainUses,
      },
      {
        name: '逐語複製の検査の走査根がどれも遊んでいない（外すと守備範囲が真に縮む）',
        run: checkCriterionTextCopyRootsAreNotIdle,
      },
      {
        name: '走査する拡張子がどれも遊んでいない（落とすと被覆が真に縮む）',
        run: checkEveryScannedExtensionContributes,
      },
      {
        name: '除外するディレクトリが台帳と一致し、効いている名前が現に効いている',
        run: checkExcludedDirectoriesAreLedgered,
      },
    ],
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
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_POSITIVE_CONTROLS = 1;
const MINIMUM_NEGATIVE_CONTROLS = 1;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-05 にリポジトリルートで実測した現況ちょうど（余裕ゼロ）。抽出は
 * `npx tsx scripts/check-requirement-coverage.selftest.ts | tail -1` の出す値をそのまま置く。
 * **確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 本体 `check-requirement-coverage.ts` の被覆源の分類（`verification-*`）は確認の一部にしか
 * 対応しない。導けないため件数で貼る。
 *
 * **是正前の値 65 は「現況ちょうど（余裕ゼロ）」と称していたが偽であった**（タスク 115.298 の
 * 同型の走査が実測）。コミット `9a387d34` の作業ツリーで本自己検査を走らせると要約は
 * `📋 対照の現況: 陽性対照 1/1 ・ 陰性対照 1/1 ・ 総数 73/65（現況/宣言の下限）` を出し、
 * **遊びが 8 件あった**——すなわち対照を 8 件まで無言で削れた。同じ走査で `MINIMUM_TOTAL_CASES` /
 * `MINIMUM_POSITIVE_CONTROLS` / `MINIMUM_NEGATIVE_CONTROLS` を持つ自己検査は 13 本あり、
 * 遊びが在ったのは本ファイルの総数だけである（残る宣言はいずれも遊び 0 の潜在的な穴であった）。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_TOTAL_CASES = 80;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `GROUPS` を丸ごと空にすると既存の `total === 0` の関門が働いて
 * EXIT=1 になるが、**群ごとの `cases` を個別に空にすると素通りした**——case 数 3 件以上の
 * 先頭 4 群（#3 取り込みの解析・#5 ヘッダー直下の要件一覧の区間判定・#6 一覧項目の識別子欄・
 * #7 一覧項目の番号の書式）を順に空にして 62/62・50/50・61/61・58/58 いずれも緑・EXIT=0
 * （115.252 の候補4）。
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
  // 判断材料を出すだけの経路（関門ではない）。タスク 115.306 が置いた
  if (process.argv.includes('--survey-citation-nets')) {
    surveyCitationNets();
    // 判断材料を出すだけの経路であり関門ではない。失敗既定（module の頂）をここで解除する。
    // `process.exitCode = 0` を二つ目に置かないのは、`main` の中の解除がちょうど一つで
    // あることを設計文書の宣言が数えているためである（タスク 115.295 の形）
    process.exit(0);
  }
  console.log(
    '🔍 要件被覆 本番到達性 判定の自己検査 (scripts/check-requirement-coverage.selftest.ts)'
  );
  // 対照群の配列の外側に置く関門。実行より前に、群そのものが在ることを確かめる。
  guardControlsArePresent(GROUPS);
  let failed = 0;
  for (const group of GROUPS) {
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

  const total = GROUPS.reduce((sum, group) => sum + group.cases.length, 0);
  if (total === 0) {
    console.log('\n❌ 確認項目が 0 件です。自己検査が空振りしています。');
    process.exit(1);
  }
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
