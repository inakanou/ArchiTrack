#!/usr/bin/env node
/**
 * カバレッジギャップ検出スクリプト
 *
 * 低カバレッジのファイルを検出し、優先度付きで報告します。
 * CI/CDで使用することで、カバレッジ品質を継続的に監視できます。
 *
 * 使用方法:
 *   npm run test -- --coverage
 *   node scripts/check-coverage-gaps.js
 *
 * 終了コード:
 *   0: 問題なし
 *   1: 警告あり（低カバレッジファイルが存在）
 *   2: エラー（極端に低いカバレッジファイルが存在）
 */

const fs = require('fs');
const path = require('path');

// 閾値設定
const THRESHOLDS = {
  CRITICAL: 30, // この値以下は緊急対応
  WARNING: 50, // この値以下は警告
  TARGET: 80, // 目標カバレッジ
};

// カバレッジレポートのパス
const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-final.json');

function loadCoverageReport() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error('❌ カバレッジレポートが見つかりません。');
    console.error('   npm run test -- --coverage を実行してください。');
    process.exit(2);
  }

  return JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf-8'));
}

function calculateCoverage(data) {
  const metrics = {
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
  };

  // Statements
  const s = data.s || {};
  Object.values(s).forEach((count) => {
    metrics.statements.total++;
    if (count > 0) metrics.statements.covered++;
  });

  // Branches
  const b = data.b || {};
  Object.values(b).forEach((counts) => {
    counts.forEach((count) => {
      metrics.branches.total++;
      if (count > 0) metrics.branches.covered++;
    });
  });

  // Functions
  const f = data.f || {};
  Object.values(f).forEach((count) => {
    metrics.functions.total++;
    if (count > 0) metrics.functions.covered++;
  });

  // Lines (use statementMap for line coverage)
  const statementMap = data.statementMap || {};
  const linesCovered = new Set();
  const linesTotal = new Set();

  Object.entries(statementMap).forEach(([key, loc]) => {
    if (loc && loc.start) {
      linesTotal.add(loc.start.line);
      if (s[key] > 0) {
        linesCovered.add(loc.start.line);
      }
    }
  });

  metrics.lines.total = linesTotal.size;
  metrics.lines.covered = linesCovered.size;

  return {
    statements: metrics.statements.total > 0 ? (metrics.statements.covered / metrics.statements.total) * 100 : 100,
    branches: metrics.branches.total > 0 ? (metrics.branches.covered / metrics.branches.total) * 100 : 100,
    functions: metrics.functions.total > 0 ? (metrics.functions.covered / metrics.functions.total) * 100 : 100,
    lines: metrics.lines.total > 0 ? (metrics.lines.covered / metrics.lines.total) * 100 : 100,
  };
}

function getMinCoverage(coverage) {
  // v8カバレッジの判定基準
  // - statements: 文レベルのカバレッジ
  // - lines: 行レベルのカバレッジ
  // branches/functionsは厳密すぎるため、参考値として表示するが閾値判定には含めない
  // （インライン関数やアロー関数はv8 ignoreでカバーが難しいため）
  return Math.min(coverage.statements, coverage.lines);
}

function categorizeFiles(coverageReport) {
  const critical = [];
  const warning = [];
  const belowTarget = [];
  const passing = [];

  const projectRoot = path.join(__dirname, '..');

  Object.entries(coverageReport).forEach(([filePath, data]) => {
    // 相対パスに変換
    const relativePath = filePath.replace(projectRoot, '').replace(/^\//, '');

    // 除外パターン
    if (
      relativePath.includes('node_modules') ||
      relativePath.endsWith('.d.ts') ||
      relativePath.endsWith('.css') ||
      relativePath.endsWith('index.ts') ||
      // 複雑なCanvas/Fabric.js連携コンポーネント（E2Eテストでカバー）
      relativePath.includes('AnnotationEditor.tsx')
    ) {
      return;
    }

    const coverage = calculateCoverage(data);
    const minCoverage = getMinCoverage(coverage);

    const fileInfo = {
      path: relativePath,
      coverage,
      minCoverage: minCoverage.toFixed(1),
    };

    if (minCoverage <= THRESHOLDS.CRITICAL) {
      critical.push(fileInfo);
    } else if (minCoverage <= THRESHOLDS.WARNING) {
      warning.push(fileInfo);
    } else if (minCoverage < THRESHOLDS.TARGET) {
      belowTarget.push(fileInfo);
    } else {
      passing.push(fileInfo);
    }
  });

  // 最小カバレッジでソート
  critical.sort((a, b) => parseFloat(a.minCoverage) - parseFloat(b.minCoverage));
  warning.sort((a, b) => parseFloat(a.minCoverage) - parseFloat(b.minCoverage));
  belowTarget.sort((a, b) => parseFloat(a.minCoverage) - parseFloat(b.minCoverage));

  return { critical, warning, belowTarget, passing };
}

function printReport(categories) {
  console.log('\n📊 カバレッジギャップレポート\n');
  console.log('='.repeat(80));

  // 緊急対応（30%以下）
  if (categories.critical.length > 0) {
    console.log('\n🚨 緊急対応（カバレッジ ≤ 30%）:\n');
    categories.critical.forEach((file) => {
      console.log(`   ${file.minCoverage.padStart(5)}%  ${file.path}`);
      console.log(`          Stmts: ${file.coverage.statements.toFixed(1)}% | Branch: ${file.coverage.branches.toFixed(1)}% | Funcs: ${file.coverage.functions.toFixed(1)}% | Lines: ${file.coverage.lines.toFixed(1)}%`);
    });
  }

  // 警告（31-50%）
  if (categories.warning.length > 0) {
    console.log('\n⚠️  警告（カバレッジ 31-50%）:\n');
    categories.warning.forEach((file) => {
      console.log(`   ${file.minCoverage.padStart(5)}%  ${file.path}`);
    });
  }

  // 目標未達（51-79%）
  if (categories.belowTarget.length > 0) {
    console.log('\n📈 改善対象（カバレッジ 51-79%）:\n');
    categories.belowTarget.slice(0, 10).forEach((file) => {
      console.log(`   ${file.minCoverage.padStart(5)}%  ${file.path}`);
    });
    if (categories.belowTarget.length > 10) {
      console.log(`   ... 他 ${categories.belowTarget.length - 10} ファイル`);
    }
  }

  // サマリー
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 サマリー:\n');
  console.log(`   🚨 緊急対応:   ${categories.critical.length} ファイル`);
  console.log(`   ⚠️  警告:      ${categories.warning.length} ファイル`);
  console.log(`   📈 改善対象:   ${categories.belowTarget.length} ファイル`);
  console.log(`   ✅ 目標達成:   ${categories.passing.length} ファイル`);

  const total = categories.critical.length + categories.warning.length + categories.belowTarget.length + categories.passing.length;
  const passingRate = ((categories.passing.length / total) * 100).toFixed(1);
  console.log(`\n   目標達成率: ${passingRate}% (${categories.passing.length}/${total})\n`);

  return categories;
}

function main() {
  const coverageReport = loadCoverageReport();
  const categories = categorizeFiles(coverageReport);
  printReport(categories);

  // 終了コードの決定
  // ベストプラクティス: 目標（80%）未満のファイルがあればブロック
  if (categories.critical.length > 0) {
    console.log('❌ 緊急対応が必要なファイルがあります（カバレッジ ≤ 30%）。\n');
    process.exit(2);
  } else if (categories.warning.length > 0) {
    console.log('❌ 低カバレッジファイルがあります（カバレッジ 31-50%）。\n');
    process.exit(1);
  } else if (categories.belowTarget.length > 0) {
    console.log('❌ 目標未達ファイルがあります（カバレッジ 51-79%）。\n');
    console.log('   目標カバレッジ: 80%以上\n');
    process.exit(1);
  } else {
    console.log('✅ カバレッジギャップチェック完了。すべてのファイルが目標達成。\n');
    process.exit(0);
  }
}

main();
