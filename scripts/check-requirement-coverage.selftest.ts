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
 *   - `MIN_CRITERION_QUOTE_LENGTH` 12→4（逐語複製の目印を狙った形だけ取り出す）
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
  computeReachableModules,
  discoverFeatures,
  extractHeaderScopedCoverage,
  extractAllFeatures,
  extractImportSpecifiers,
  extractRequirements,
  calculateCoverage,
  checkSummaryIntegrity,
  collectOutOfDenominatorMarks,
  criterionQuote,
  E2E_SPECS_ROOT,
  findCriterionTextCopyMismatches,
  findRetiredCriterionCoverageMarks,
  findUnknownCriterionCoverageMarks,
  isRetiredCriterionText,
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

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 自前で失敗の一覧を返す */
  run: () => string[];
}

// ============================================================================
// 仮想リポジトリの構築
// ============================================================================

/** 仮想リポジトリの中身（相対パス → 本文） */
type Fixture = Record<string, string>;

function withFixture<T>(files: Fixture, body: (baseDir: string) => T): T {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-coverage-reach-'));
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
  for (const want of expected) {
    if (!specifiers.includes(want)) failures.push(`${want} を抽出できなかった`);
  }
  for (const forbidden of ['./zz', './yy', './xx']) {
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
  const mustNotBeVerification = [
    'frontend/src/components/X.tsx',
    'frontend/src/utils/testable.ts',
    'frontend/src/utils/latest.ts',
    'backend/src/services/x.service.ts',
    'backend/src/utils/protest.ts',
  ];
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
  const mustBeLive = [
    'frontend/src/components/site-surveys/AnnotationEditor.tsx',
    'frontend/src/pages/SiteSurveyImageViewerPage.tsx',
    'frontend/src/routes.tsx',
    'backend/src/app.ts',
  ];

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
 * 実データでここを切って帰属が減るのは、走査した全ファイルのうち 2 ファイルだけで、
 * **正当な被覆は一件も失われない**（タスク 115.192 で母集団を全件走査して再確定した）。
 * 落ちるのは `quantity-table-generation/REQ-7.1`（name-remarks-autocomplete.spec.ts）と
 * `quantity-table-generation/REQ-47.15`〜`47.17`（quantity-count-persistence-e2e.spec.ts）で、
 * いずれも他の被覆源が同じ番号を拾うため集計は動かない。
 *
 * タスク 115.197 が現在の HEAD で測り直した。規則4を撤去する変異で**この検査は単独で赤くなる**
 * （併せて赤くなるのは「区間の終端は四つの上限の最も手前を採る」と
 * 「実データの散文が被覆主張として拾われない」の二件だけである）。
 * 起票時点の懸念は、散文が印を持たない ` * Note: REQ-4.2 …` の形で書かれており
 * どの上限を外しても一致しなかったこと（＝空虚な主張）であったが、
 * 上記のとおり 115.194 の是正で既に解消している。
 *
 * かつては `quantity-table-generation/REQ-38.4`（quantity-group-copy.spec.ts）も母集団に居た。
 * 「Integration テストへ委譲する。本スペックには含まない」と述べた散文が一覧項目の形をしており、
 * 規則4だけがそれを被覆主張から除いていた。タスク 115.192 が当該受入基準を実在する E2E で
 * 被覆し、散文を一覧項目でない形へ書き改めたため、当該ファイルは母集団から外れた。
 * 後段の実データ対照は、この入れ替わりを取りこぼさないよう機構でも検査する。
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
    for (const name of [`const ${REAL_CLAIMS_AUTHORITY_NAME}`, `function ${DOC_GUARD_NAME}(`]) {
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
  for (const id of ['site-survey/REQ-8.2', 'site-survey/REQ-8.3']) {
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
  for (const id of ['site-survey/REQ-6.6', 'site-survey/REQ-11']) {
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
  for (const branch of ['14.1', '14.2', '14.3', '14.4', '14.5', '14.6', '14.7', '14.8']) {
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
  for (const branch of ['20.1', '20.2', '20.3', '20.4', '20.5']) {
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
  for (const branch of ['15.2', '15.3']) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `識別子の並びではない散文の箇条書きから site-survey/REQ-${branch} を拾った（過大帰属）`
      );
    }
  }
  for (const branch of ['15.4', '15.5']) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(`散文中の数値を受入基準番号と読んだ（site-survey/REQ-${branch}。過大帰属）`);
    }
  }
  for (const branch of ['15.6', '15.7']) {
    if (found.acceptanceCriteria.includes(`site-survey/REQ-${branch}`)) {
      failures.push(
        `印を持たない継続行から site-survey/REQ-${branch} を拾った（115.194 の是正が壊れている）`
      );
    }
  }
  for (const branch of ['15.8', '15.9']) {
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
  for (const branch of ['21.2', '21.3']) {
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

  for (const id of ['site-survey/REQ-17', 'site-survey/REQ-19', 'site-survey/REQ-22']) {
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
  for (const branch of ['22.2', '22.3', '22.4', '22.5', '22.6']) {
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
  for (const branch of ['22.2', '22.3', '22.4', '22.5', '22.6']) {
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

  for (const id of ['user-authentication/REQ-17', 'user-authentication/REQ-18']) {
    if (!found.requirements.includes(id)) {
      failures.push(
        `枝番を持たない識別子欄から要件番号 ${id} を取りこぼした（被覆の過小帰属。` +
          'ここを取りこぼすと以下の陰性主張が空振りする）'
      );
    }
  }
  for (const id of ['user-authentication/REQ-17.1', 'user-authentication/REQ-18.1']) {
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
  if (found.requirements.includes('user-authentication/REQ-27')) {
    failures.push(
      '枝つき要件番号を基底番号 user-authentication/REQ-27 へ丸めた（実在しない番号を名乗る）'
    );
  }
  for (const branch of ['27A.1', '27A.2']) {
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
 */
type NegativeControlSuppressor = 'boundary' | 'shape';

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
];

/**
 * 陽性側だけを述べる資料（陰性の主張を持たないため登録の対象外）
 *
 * 分類の走査はここに挙がっていない資料を未分類として失敗させる。
 * 「陰性の主張を持たない」は目視の判断であるため、**理由を併記して残す**。
 */
const POSITIVE_ONLY_FIXTURES: ReadonlyArray<{ name: string; reason: string }> = [
  { name: 'ID_LIST_FORMS', reason: '識別子欄の各書式を拾えることだけを言う（陽性のみ）' },
  {
    name: 'ASTERISK_BULLET_IS_STILL_A_LIST_MARKER',
    reason: '`*` の箇条書きを拾えることだけを言う（厳しすぎの側の陽性のみ）',
  },
  {
    name: 'LETTERED_REQUIREMENT_NUMBER',
    reason: '枝つき要件番号を基底番号へ丸めないことだけを言う（陽性のみ）',
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
 * 2026-09-01 に実測した。登録は 20 件（資料 12 件）である。
 * `HEADER_OF_UNLISTED_FEATURE` の一覧項目を ` * Note: REQ-7.7 は…` の散文へ書き換えると、
 * 対をなす `checkUnlistedFeatureHeaderStillEndsSection` は**緑のまま**で、
 * 自己検査 61 件のうち本検査 1 件だけが赤くなる（115.224 が述べた空振りそのものである）。
 * `suppressedBy` を取り違える変異も両向きで赤くなる——`site-survey/REQ-8.3` の件を
 * `boundary` へ、`site-survey/REQ-4.2` の件を `shape` へ変えると、いずれも 1 件が落ちる。
 * 本体から規則4（段落の切れ目）を外すと 61 件のうち 4 件が赤くなり、本検査もその一つである。
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

    const relocated = extractHeaderScopedCoverage(probe, control.features);
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
    }
    for (const id of requirements) {
      const appeared = relocated.requirements.includes(id);
      if (control.suppressedBy === 'boundary' && !appeared) {
        failures.push(`${at}: 位置の上限を取り払っても ${id} が現れない（対照が空振りしている）`);
      }
      if (control.suppressedBy === 'shape' && appeared) {
        failures.push(`${at}: 位置の上限を取り払うと ${id} が現れる（分類が誤っている）`);
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
 * 2026-09-01 の実測で 15 件すべてがこの形であり、限界に当たる資料は零件である。
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
 * 2026-09-01 に実測した。走査は資料 15 件を数え、うち 12 件が陰性側、3 件が陽性のみである。
 * `SELFTEST_FEATURES` のような資料でない定数は `].join('\n');` の形を持たないため拾わない。
 * `SYNTHETIC_NEGATIVE_CONTROLS` を空にすると未分類 12 件を挙げて赤くなり、走査の正規表現を
 * `= \[` から `= \{` へ変えると「一件も数えられない」で赤くなる（いずれも実測）。
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
  // 走査が拾えない名前が登録側に残っていれば、資料の改名か撤去に登録が追いついていない
  for (const name of [...registered, ...positiveOnly]) {
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

  const clean = findRetiredCriterionCoverageMarks(features, [
    { file: 'e2e/specs/probe.spec.ts', requirements: [], acceptanceCriteria: [liveId] },
  ]);
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
  const outsideRoot = findUnknownCriterionCoverageMarks(features, [
    { file: 'frontend/src/probe.tsx', requirements: [], acceptanceCriteria: [probe.unknown] },
  ]);
  if (outsideRoot.length !== 0) {
    failures.push(`走査対象の外の被覆印を挙げた: ${outsideRoot.map((mark) => mark.id).join(', ')}`);
  }

  // 機構対照: 墓標と「存在しない番号」を取り違えていない（直し方が違うので混ぜてはならない）
  const retiredByUnknown = findUnknownCriterionCoverageMarks(features, [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.retired],
    },
  ]);
  if (retiredByUnknown.length !== 0) {
    failures.push(`墓標を「存在しない番号」として挙げた: ${probe.retired}`);
  }
  const unknownByRetired = findRetiredCriterionCoverageMarks(features, [
    {
      file: `${E2E_SPECS_ROOT}/probe.spec.ts`,
      requirements: [],
      acceptanceCriteria: [probe.unknown],
    },
  ]);
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

/** 全体サマリーの整合検査を回すための、分母1件の探り用機能を作る */
function summaryIntegrityProbe(
  baseDir: string,
  acceptanceCriteria: string[],
  requirements: string[]
): { result: CoverageResult; testCoverage: TestCoverage[]; feature: Feature } | string {
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
  const ELEVEN_CHARACTERS = '明細行の合計を画面表示';
  const TWELVE_CHARACTERS = '合計金額を画面下部に表示';
  if (ELEVEN_CHARACTERS.length !== 11 || TWELVE_CHARACTERS.length !== 12) {
    // 見本の文字数が狂っていれば、以下の主張は境界を測っていない（対照が空振りしている）
    failures.push(
      `境界の見本の文字数が違う（11文字のはずが ${ELEVEN_CHARACTERS.length}、` +
        `12文字のはずが ${TWELVE_CHARACTERS.length}）`
    );
  }
  if (MIN_CRITERION_QUOTE_LENGTH !== 12) {
    failures.push(
      `逐語複製の目印の最小長が 12 でない（${MIN_CRITERION_QUOTE_LENGTH}）。` +
        '実測で 12 文字未満まで許すと偶然の一致が混じる。' +
        '値を動かすなら、下の境界の見本も同時に書き改めること'
    );
  }
  if (criterionQuote(`The システム shall ${ELEVEN_CHARACTERS}`) !== null) {
    failures.push('11 文字の語句を目印として採った（短すぎる語句は条文を名指さない）');
  }
  if (criterionQuote(`The システム shall ${TWELVE_CHARACTERS}`) !== TWELVE_CHARACTERS) {
    failures.push('12 文字ちょうどの語句を落とした');
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
    result = reportCriterionTextCopies(features, path.join(baseDir, 'specs'));
  });
  return result;
}

/** 探り用の資料で食い違いだけを取り出す（母数を見ない呼び出し向け） */
function runCopyMismatchProbe(spec: string): ReturnType<typeof findCriterionTextCopyMismatches> {
  return runCopyReportProbe(spec).mismatches;
}

/** 二つの機能を持つ探り用の資料で、逐語複製の報告を取る */
function runTwoFeatureCopyReportProbe(spec: string): ReturnType<typeof reportCriterionTextCopies> {
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

  let result: ReturnType<typeof reportCriterionTextCopies> = {
    blocks: 0,
    blocksWithCopy: 0,
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
      result = reportCriterionTextCopies(features, path.join(baseDir, 'specs'));
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

  // 実物の `e2e/specs` に、受入基準の原文を写した区間が現に存在すること。
  // 存在しなければ、食い違い 0 件は「何も守っていない」ことと区別できない。
  const report = reportCriterionTextCopies(features);
  if (report.blocks === 0) {
    failures.push(`${E2E_SPECS_ROOT} に被覆印を持つ区間が一件も無い（走査そのものが空振り）`);
  }
  if (report.blocksWithCopy === 0) {
    failures.push(
      `${E2E_SPECS_ROOT} に受入基準の原文を写した被覆印の区間が一件も無い（この検査は何も守っていない）`
    );
  }
  if (report.blocksWithCopy >= report.blocks) {
    failures.push(
      `${E2E_SPECS_ROOT} の被覆印を持つ区間 ${report.blocks} 件のうち ` +
        `${report.blocksWithCopy} 件が原文の写しを持つとされた。` +
        '写しを持たない区間が一件も無いのは実態と合わない（守備範囲が全区間へ水増しされている）'
    );
  }
  return failures;
}

// ============================================================================
// 実行
// ============================================================================

const GROUPS: Array<{ title: string; cases: Case[] }> = [
  {
    title: '被覆源として数えなければならない形（到達する）',
    cases: [{ name: '生きた本番モジュールと、その検証', run: checkReachableForms }],
  },
  {
    title: '被覆源として数えてはならない形（到達しない）',
    cases: [{ name: '死んだ本番モジュールと、その検証', run: checkUnreachableForms }],
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
      { name: '逐語複製との食い違いを両方向で固定する', run: checkCriterionTextCopyMismatch },
      {
        name: '出典明示の免除が条文の番号だけに反応する（緩みで陽性が消えない）',
        run: checkCriterionAttributionIsNumberExact,
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
    ],
  },
];

function main(): void {
  console.log(
    '🔍 要件被覆 本番到達性 判定の自己検査 (scripts/check-requirement-coverage.selftest.ts)'
  );
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
}

main();
