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
  extractImportSpecifiers,
  isVerificationFile,
  normalizeExclusionId,
  PRODUCTION_ENTRY_POINTS,
  PRODUCTION_ROOTS,
  resolveImport,
  selectExclusionsForFeatures,
  toPosixPath,
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
 * （115.146 の画像ビューア、115.130 の欄検証つき行）を死側に、
 * 実際に描画される注釈編集画面を生側に置く。
 */
function checkKnownDeadAndLiveModules(): string[] {
  const failures: string[] = [];
  const graph = buildModuleGraph();
  const reachable = computeReachableModules(graph);

  const mustBeDead = [
    'frontend/src/components/site-surveys/ImageViewer.tsx',
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
