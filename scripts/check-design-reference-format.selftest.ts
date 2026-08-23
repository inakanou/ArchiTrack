/**
 * @fileoverview 設計文書への行番号参照 検出規則の自己検査
 *
 * scripts/check-design-reference-format.ts の検出規則が、実際に本番コードへ
 * 混入していた書き方をすべて捕捉し（漏れ）、節の題とシンボル名で指す正しい書き方や
 * 行番号ではない数値（HTTP ステータス・要件番号・タスク番号・比率）を
 * 捕捉しない（過検出）ことを、書き方そのものを注入して確認する。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-reference-format.selftest.ts
 *   npm run check:design-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { collectSourceFiles, isTestFile, run, scanLine } from './check-design-reference-format.js';

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（115.100 で実際に本番コードに存在した形）
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: 'コロン直付け（design.md:3504）',
    line: ' * 正の無限大方向へ丸める `Math.round` とは負数で異なる（design.md:3504）。',
    expected: true,
  },
  {
    name: 'コロンの前に空白（design.md :2337-2339）',
    line: ' * （30.3 / design.md :2337-2339「当該項目のparentIdに選択した既存項目IDを設定',
    expected: true,
  },
  {
    name: '空白区切りの範囲（design.md 4905-4911）',
    line: '  // 初期スナップショット（design.md 4905-4911: ダイアログ open 時に確定）',
    expected: true,
  },
  {
    name: 'L 前置（design.md L1519）',
    line: '  // （REQ-37.6 / design.md L1519）。',
    expected: true,
  },
  {
    name: 'L 前置の範囲（design.md L5281-5289）',
    line: ' * design.md L5281-5289 では Props を `{ open, mode, targetImageIds, surveyId,',
    expected: true,
  },
  {
    name: 'アンカー形式（design.md#L166）',
    line: '  // 確立済みパターンに準拠（design.md#L166）。',
    expected: true,
  },
  {
    name: '後置の「行」（design.md 5347 行）',
    line: "    // 開放形状のため fill は 'transparent'（design.md 5347 行）。",
    expected: true,
  },
  {
    name: '節の題の後ろに括弧で範囲（「LineItemEditor 改訂4」§Type Changes (4655-4669)）',
    line: ' * - design.md「LineItemEditor 改訂4」§Type Changes (4655-4669) に準拠する。',
    expected: true,
  },
  {
    name: '全角括弧で範囲（`SaveEstimateLine`（4313-4323））',
    line: ' * design.md `##### estimate-draft.service` の `SaveEstimateLine`（4313-4323）と同一。',
    expected: true,
  },
  {
    name: '括弧で単独の行番号（(4375)）',
    line: '// および design.md「Components and Interfaces - 改訂」(4375) に基づき、',
    expected: true,
  },
  {
    name: '括弧で単独の 3 桁行番号（(803)。1000 行未満の design.md が実在する）',
    line: ' * 参照: design.md「Architecture Pattern & Boundary Map」(803)',
    expected: true,
  },
  {
    name: '全角括弧で単独の 3 桁行番号（（803））',
    line: ' * 参照: design.md「Architecture Pattern & Boundary Map」（803）',
    expected: true,
  },
  {
    name: '括弧内に前置がある 3 桁（(:422) は HTTP ステータスではなく行番号指定）',
    line: ' * 参照: design.md「Error Handling」(:422)',
    expected: true,
  },
  {
    name: '節記号に行番号（§4611）',
    line: '      // Task 72.1 / design.md §4611: enablePointerEvents を有効化し、',
    expected: true,
  },
  {
    name: '@see の末尾に範囲（design.md bulkExportService (5135-5215)）',
    line: ' * @see .kiro/specs/site-survey/design.md bulkExportService (5135-5215)',
    expected: true,
  },
  {
    name: '全角括弧にコロン付きの範囲（（:4086-4120））',
    line: ' * Design: design.md `##### estimateKeymap`（:4086-4120）',
    expected: true,
  },
  {
    name: '一行に複数の行番号（L1062-1131 と L2150）',
    line: ' * Design: design.md L1062-1131（State Management）, L2150（File Structure Plan）',
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（節の題とシンボル名で指す正しい形／行番号でない数値）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '節の題で指す（是正後の形）',
    line: ' * design.md「Rectangle / Circle / Polygon / Polyline / Freehand（Group 化、共通仕様）」',
    expected: false,
  },
  {
    name: 'シンボル名で指す',
    line: ' * design.md `ShapeOutlineAttribute` に対応。',
    expected: false,
  },
  {
    name: '見出し記法で指す',
    line: ' * Design: design.md `##### useEstimateUndo`',
    expected: false,
  },
  {
    name: 'タスク番号（design.md と同じ行にある 115.100）',
    line: ' * Task 115.100: design.md への参照を節の題とシンボル名で指す形へ改める',
    expected: false,
  },
  {
    name: '要件番号（37.4-37.5 のような小数の範囲）',
    line: ' * design.md の部品表が与える Req Coverage 37.4-37.5, 37.9-37.11 と整合。',
    expected: false,
  },
  {
    name: 'HTTP ステータス（design.md と同じ行の（422））',
    line: '    // design.md「保存フロー（42.1〜42.9）」の順序に従い、検証（422）の後・',
    expected: false,
  },
  {
    name: 'HTTP ステータス（前置なしの 3 桁は行番号と数えない: （404）／(500)）',
    line: ' * design.md「Error Handling」に従い、見積書なし（404）とサーバー障害(500)を分ける',
    expected: false,
  },
  {
    name: '比率・寸法（0.75 や 44x44）',
    line: ' * Req 28.3 / design.md AnnotationToolbar (ext): 44x44 論理ピクセルに統一。本体 * 0.75',
    expected: false,
  },
  {
    name: '要件番号の範囲（Requirements 36-38）',
    line: ' * design.md「Components and Interfaces - 改訂（Requirements 36-38）」の部品表に基づく',
    expected: false,
  },
  {
    name: 'design.md への言及が無い行の行番号（別文書の行番号は本検査の対象外）',
    line: '  // requirements.md 4905-4911 を参照',
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（第3原則: 前提が満たせない場合は失敗させる）
// ============================================================================

function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ref-selftest-'));
  try {
    const result = run({ root: tempRoot, sourceDirs: ['frontend/src', 'backend/src'] });
    if (result.scannedFileCount !== 0) {
      failures.push('空のディレクトリで走査件数が 0 にならなかった');
    }
    // 本体は scannedFileCount === 0 を「合格」ではなく失敗として扱う。
    // run() 自体は件数を返すだけなので、ここでは「0 件が観測できる」ことを固定し、
    // 0 件を失敗にする判断が main() に存在することを次の検査で確かめる。
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-design-reference-format.ts'),
      'utf-8'
    );
    if (!/result\.scannedFileCount === 0[\s\S]{0,400}process\.exit\(1\)/.test(source)) {
      failures.push('走査対象が 0 件のときに exit 1 する経路が本体に見当たらない');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

function checkTestFilesExcluded(): string[] {
  const failures: string[] = [];
  const excluded = [
    'frontend/src/components/Foo.test.tsx',
    'frontend/src/components/Foo.spec.ts',
    'frontend/src/__tests__/foo.ts',
    'backend/src/services/__mocks__/foo.ts',
  ];
  for (const relativePath of excluded) {
    if (!isTestFile(relativePath)) {
      failures.push(`テストコードとして除外されていない: ${relativePath}`);
    }
  }
  const included = ['frontend/src/components/Foo.tsx', 'backend/src/schemas/estimate.schema.ts'];
  for (const relativePath of included) {
    if (isTestFile(relativePath)) {
      failures.push(`本番コードが誤って除外された: ${relativePath}`);
    }
  }
  return failures;
}

function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const files = collectSourceFiles(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    ['frontend/src', 'backend/src']
  );
  if (files.length === 0) {
    failures.push('リポジトリ本体の本番コードが一件も列挙できていない');
  }
  if (files.some((file) => isTestFile(file))) {
    failures.push('列挙結果にテストコードが混入している');
  }
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: 'テストコードは走査対象から外れる（本タスクの境界）',
    expected: false,
    custom: checkTestFilesExcluded,
  },
  {
    name: 'リポジトリ本体の本番コードを実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const references = scanLine(testCase.line ?? '');
  const detected = references.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${references.join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '捕捉しなければならない書き方', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 設計文書への行番号参照 検出規則 自己検査 (scripts/check-design-reference-format.selftest.ts)'
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
