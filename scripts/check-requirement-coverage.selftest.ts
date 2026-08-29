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
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  analyzeCriterionReachability,
  auditExclusions,
  buildModuleGraph,
  classifyCoverageSource,
  computeReachableModules,
  discoverFeatures,
  extractHeaderScopedCoverage,
  extractAllFeatures,
  extractImportSpecifiers,
  extractRequirements,
  calculateCoverage,
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
  type CriterionReachability,
  type ExclusionVerdict,
  type ModuleGraph,
  type ReachabilityReason,
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

function checkExclusionAudit(): string[] {
  const failures: string[] = [];
  const known = new Set([
    'demo/REQ-1.1',
    'demo/REQ-1.2',
    'demo/REQ-1.3',
    'demo/REQ-1.4',
    'demo/REQ-1.5',
  ]);
  const reachability = new Map<string, CriterionReachability>([
    ['demo/REQ-1.4', { id: 'demo/REQ-1.4', sources: [], reachable: true }],
    ['demo/REQ-1.5', { id: 'demo/REQ-1.5', sources: [], reachable: false }],
  ]);

  const audit = auditExclusions(
    [
      exclusionOf('demo/REQ-1.1', 'load-test', 'k6 / Artillery'),
      exclusionOf('demo/REQ-1.2', 'none', '-', 'pending-implementation'),
      exclusionOf('demo/REQ-1.3', 'unit-test', ''),
      exclusionOf('demo/REQ-9.9', 'unit-test', 'Vitest'),
      exclusionOf('demo/REQ-1.4', 'unit-test', 'Vitest / React Testing Library'),
      exclusionOf('demo/REQ-1.5', 'unit-test', 'Vitest / React Testing Library'),
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
  ];
  for (const [index, [id, verdict]] of expected.entries()) {
    const entry = audit.entries[index];
    if (!entry || entry.id !== id || entry.verdict !== verdict) {
      failures.push(`${id}: 期待 ${verdict} に対し 実際 ${entry?.verdict ?? '無し'}`);
    }
  }
  const last = audit.entries[6];
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
  if (audit.byVerdict['in-repo-unverified'] !== 1) {
    failures.push(
      `in-repo-unverified の集計が 1 ではなく ${audit.byVerdict['in-repo-unverified']} だった`
    );
  }
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
 * 行頭のコメント記号 `*` が一覧の印と区別されないため、素の散文でも項目として拾われる。
 *
 * 実データ（被覆ヘッダー 384 件）でここを切って帰属が減るのは 4 ヘッダーだけで、
 * **正当な被覆は一件も失われない**。被覆の集計から落ちるのは
 * `site-survey/REQ-16.7` と `quantity-table-generation/REQ-38.4` の 2 件で、
 * いずれも「検証困難なため省略」「本スペックには含まない」と明言した散文である。
 * 残る 2 ヘッダー（`quantity-table-generation/REQ-7.1` と `REQ-47.15`〜`47.17`）は
 * 他の被覆源やパターン1が同じ番号を拾うため集計は動かない。
 * 集計が動く 2 件は後段の検査が実データ上で名指しで固定する。
 */
const PARAGRAPH_BREAK_THEN_PROSE = [
  '/**',
  ' * Requirements coverage (site-survey):',
  ' * - REQ-4.1: 段落の前（正当な被覆主張）',
  ' *',
  ' * Note: REQ-4.2 はE2Eテストで検証困難なため省略',
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
 * 実データの側から、段落の切れ目の先の偽の主張が消えていることを見る
 *
 * 仮想の資料だけでは実装が実データに効いているとは言えない。
 * 是正前に偽の被覆主張を生んでいた実在の2件を名指しで固定する。
 * 当該ファイルや前提の記述が失われたら「前提が失われた」として失敗させる。
 *
 * 一件目は当初 `site-survey-performance.spec.ts`（keep: REQ-16.1 / drop: REQ-16.7）であったが、
 * タスク 115.186 で同ファイルの一覧が掲げていた受入基準がすべて除外との同居として
 * 取り下げられ、一覧そのものが無くなったため、同じ形（一覧の直後に段落の切れ目を挟んで
 * 「本ファイルは判定していない」と述べる散文が続く）を持つ実データへ置き換えた。
 */
const REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK: ReadonlyArray<{
  file: string;
  /** 段落の切れ目より前にあり、拾われねばならない受入基準 */
  keep: string;
  /** 段落の切れ目より後の散文にあり、拾ってはならない受入基準 */
  drop: string;
}> = [
  {
    file: 'e2e/specs/quantity-tables/name-remarks-autocomplete.spec.ts',
    keep: 'quantity-table-generation/REQ-7.2',
    drop: 'quantity-table-generation/REQ-7.1',
  },
  {
    file: 'e2e/specs/quantity-tables/quantity-group-copy.spec.ts',
    keep: 'quantity-table-generation/REQ-38.1',
    drop: 'quantity-table-generation/REQ-38.4',
  },
];

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
    if (!found.acceptanceCriteria.includes(entry.keep)) {
      failures.push(
        `${entry.file}: ${entry.keep} を取りこぼした（自己検査の前提が変わった可能性）`
      );
    }
    if (found.acceptanceCriteria.includes(entry.drop)) {
      failures.push(
        `${entry.file}: 段落の切れ目より後の散文から ${entry.drop} が被覆主張として拾われた`
      );
    }
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
  // 一覧の項目を拾う規則は行頭の `-` / `*` に続く番号しか見ないため、
  // 読点で並べた 12.2 / 12.3 は元から拾われない（区間判定とは別の限界）。
  // ここでは区間判定を見るので、拾われる 12.1 だけを前提にする。
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

/** 逐語複製の目印（`shall` 以降）の取り出しが、狙った形だけを拾う */
function checkCriterionQuote(): string[] {
  const failures: string[] = [];
  const quote = criterionQuote('The システム shall 項目一覧の下にExcel出力ボタンを表示する');
  if (quote !== '項目一覧の下にExcel出力ボタンを表示する') {
    failures.push(`shall 以降を取り出せていない: ${quote ?? 'null'}`);
  }
  if (criterionQuote('WHEN ログインする THEN Serviceはトークンを発行しなければならない') !== null) {
    failures.push('shall を含まない条文から目印を取り出した');
  }
  const short = 'あ'.repeat(MIN_CRITERION_QUOTE_LENGTH - 1);
  if (criterionQuote(`The システム shall ${short}`) !== null) {
    failures.push('短すぎる語句を目印として採った');
  }
  const long = 'あ'.repeat(MIN_CRITERION_QUOTE_LENGTH);
  if (criterionQuote(`The システム shall ${long}`) !== long) {
    failures.push('最小長ちょうどの語句を落とした');
  }
  return failures;
}

/** 探り用の要件定義書（受入基準3件）で逐語複製の検査を回す */
function runCopyMismatchProbe(spec: string): ReturnType<typeof findCriterionTextCopyMismatches> {
  const requirements = [
    '### Requirement 1: 探り用の要件',
    '',
    '#### Acceptance Criteria',
    '1. The システム shall 一覧の下にExcel出力ボタンを表示する',
    '2. The システム shall 一覧の下に印刷ボタンを表示する',
    '3. The システム shall 一覧の見出しを固定表示する',
    '',
  ].join('\n');
  let result: ReturnType<typeof findCriterionTextCopyMismatches> = [];
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
    result = findCriterionTextCopyMismatches(features, path.join(baseDir, 'specs'));
  });
  return result;
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
 * 実データ: 逐語複製の担い手が実在する（この検査が空振りしていない）
 *
 * 食い違いが 0 件であることは、**複製を持つ区間が 0 件でも成立してしまう。**
 * 母集団の側から数え、目印を取り出せる条文と、実際に写しを持つ区間の双方が
 * 実在することを確かめる。
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
        name: 'JSDoc 内の段落の切れ目で区間を切る（直後の散文を被覆主張にしない）',
        run: checkHeaderSectionStopsAtJsDocParagraphBreak,
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
        name: '分子を分母との交わりで数える（名乗るだけの番号を分子に入れない）',
        run: checkNumeratorIsIntersectedWithDenominator,
      },
      { name: '逐語複製の目印を狙った形だけ取り出す', run: checkCriterionQuote },
      { name: '逐語複製との食い違いを両方向で固定する', run: checkCriterionTextCopyMismatch },
      {
        name: '実データに逐語複製の担い手が存在する（空振りしていない）',
        run: checkRealCriterionTextCopiesExist,
      },
    ],
  },
  {
    title: '除外一覧の監査',
    cases: [{ name: '除外の各形を正しく分類する', run: checkExclusionAudit }],
  },
  {
    title: '走査対象と前提条件',
    cases: [
      { name: '入口が無いとき何も到達扱いにしない（第3原則）', run: checkEmptyGraphIsNotReachable },
      { name: 'リポジトリ本体を実際に走査できる', run: checkRealRepositoryIsScanned },
      { name: '実在する死コードと生存コードで両側を固定する', run: checkKnownDeadAndLiveModules },
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
