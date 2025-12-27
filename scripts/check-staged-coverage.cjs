#!/usr/bin/env node
/**
 * ステージされたファイルのカバレッジチェックスクリプト
 *
 * pre-commit フックで使用し、変更ファイルのカバレッジが目標（80%）を満たしているか確認します。
 * このスクリプトは、事前にテストが実行されてカバレッジレポートが生成されていることを前提とします。
 *
 * 使用方法:
 *   # テストを先に実行
 *   npm --prefix backend run test:unit:coverage
 *   # カバレッジをチェック
 *   node scripts/check-staged-coverage.cjs --project=backend
 *
 * 動作:
 *   1. git diff --cached でステージされたファイルを取得
 *   2. 指定プロジェクトのソースファイルのみをフィルター
 *   3. カバレッジレポート（coverage-final.json）から変更ファイルのカバレッジを取得
 *   4. 80%未満のファイルがあれば失敗
 *
 * 終了コード:
 *   0: すべてのファイルが目標達成
 *   1: 目標未達のファイルが存在
 *   2: エラー（設定ミスなど）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 閾値設定
const THRESHOLD = 80;

// コマンドライン引数のパース
const args = process.argv.slice(2);
const projectArg = args.find((arg) => arg.startsWith('--project='));
if (!projectArg) {
  console.error('❌ --project=backend または --project=frontend を指定してください');
  process.exit(2);
}
const project = projectArg.split('=')[1];
if (!['backend', 'frontend'].includes(project)) {
  console.error('❌ プロジェクトは backend または frontend を指定してください');
  process.exit(2);
}

// プロジェクト設定
const CONFIG = {
  backend: {
    root: path.join(__dirname, '..', 'backend'),
    srcPattern: /^backend\/src\/.*\.ts$/,
    testPattern: /\.(test|spec)\.ts$/,
    coverageFile: 'coverage/coverage-final.json',
    testCommand: 'npm run test:unit:coverage',
    // vitest.config.ts の除外パターンと同期
    excludePatterns: [
      /\.d\.ts$/,
      /\/types\//,
      /\/routes\//,
      /\/storage\//,
      /\/generated\//,
      /\/app\.ts$/,
      /\/index\.ts$/,
      /\/db\.ts$/,
      /\/redis\.ts$/,
      /\/generate-swagger\.ts$/,
      /seed-helpers/,
    ],
  },
  frontend: {
    root: path.join(__dirname, '..', 'frontend'),
    srcPattern: /^frontend\/src\/.*\.(ts|tsx)$/,
    testPattern: /\.(test|spec)\.(ts|tsx)$/,
    coverageFile: 'coverage/coverage-final.json',
    testCommand: 'npm run test:coverage',
    // vitest.config.ts の除外パターンと同期
    excludePatterns: [
      /\.d\.ts$/,
      /\.css$/,
      /index\.ts$/,
      /AnnotationEditor\.tsx$/,
    ],
  },
};

const config = CONFIG[project];

/**
 * ステージされたファイルを取得
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean);
  } catch {
    console.error('❌ git diff の実行に失敗しました');
    process.exit(2);
  }
}

/**
 * テストファイルかどうかを判定
 */
function isTestFile(filePath) {
  return config.testPattern.test(filePath);
}

/**
 * 除外パターンにマッチするかを判定
 */
function isExcluded(filePath) {
  return config.excludePatterns.some((pattern) => pattern.test(filePath));
}

/**
 * カバレッジレポートを読み込み
 */
function loadCoverageReport() {
  const coveragePath = path.join(config.root, config.coverageFile);
  if (!fs.existsSync(coveragePath)) {
    console.error('❌ カバレッジレポートが見つかりません');
    console.error(`   ${coveragePath}`);
    return null;
  }

  return JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
}

/**
 * ファイルのカバレッジを計算
 */
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

  // Lines
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
    statements:
      metrics.statements.total > 0
        ? (metrics.statements.covered / metrics.statements.total) * 100
        : 100,
    branches:
      metrics.branches.total > 0
        ? (metrics.branches.covered / metrics.branches.total) * 100
        : 100,
    functions:
      metrics.functions.total > 0
        ? (metrics.functions.covered / metrics.functions.total) * 100
        : 100,
    lines:
      metrics.lines.total > 0 ? (metrics.lines.covered / metrics.lines.total) * 100 : 100,
  };
}

/**
 * 最小カバレッジを取得
 */
function getMinCoverage(coverage) {
  return Math.min(
    coverage.statements,
    coverage.branches,
    coverage.functions,
    coverage.lines
  );
}

/**
 * ステージされたファイルのカバレッジをチェック
 */
function checkStagedFilesCoverage(stagedSourceFiles, coverageReport) {
  console.log(`\n🔍 ${project} のステージされたファイルのカバレッジをチェック中...`);

  const failing = [];
  const passing = [];
  const notFound = [];

  stagedSourceFiles.forEach((stagedFile) => {
    // ステージされたファイルのフルパスを構築
    const fullPath = path.resolve(__dirname, '..', stagedFile);

    // カバレッジレポートからマッチするエントリを探す
    let coverageData = null;
    for (const [filePath, data] of Object.entries(coverageReport)) {
      if (filePath === fullPath || filePath.endsWith(stagedFile)) {
        coverageData = data;
        break;
      }
    }

    if (!coverageData) {
      notFound.push(stagedFile);
      return;
    }

    const coverage = calculateCoverage(coverageData);
    const minCoverage = getMinCoverage(coverage);

    const fileInfo = {
      path: stagedFile,
      coverage,
      minCoverage: minCoverage.toFixed(1),
    };

    if (minCoverage < THRESHOLD) {
      failing.push(fileInfo);
    } else {
      passing.push(fileInfo);
    }
  });

  return { failing, passing, notFound };
}

/**
 * 結果を出力
 */
function printResult(result) {
  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 ${project} カバレッジチェック結果\n`);

  if (result.notFound.length > 0) {
    console.log('⚠️  カバレッジデータが見つからないファイル:');
    result.notFound.forEach((f) => console.log(`     - ${f}`));
    console.log('');
  }

  if (result.failing.length > 0) {
    console.log('❌ 目標未達（カバレッジ < 80%）:');
    result.failing.forEach((file) => {
      console.log(`   ${file.minCoverage.padStart(5)}%  ${file.path}`);
      console.log(
        `          Stmts: ${file.coverage.statements.toFixed(1)}% | Branch: ${file.coverage.branches.toFixed(1)}% | Funcs: ${file.coverage.functions.toFixed(1)}% | Lines: ${file.coverage.lines.toFixed(1)}%`
      );
    });
    console.log('');
  }

  if (result.passing.length > 0) {
    console.log('✅ 目標達成（カバレッジ >= 80%）:');
    result.passing.forEach((file) => {
      console.log(`   ${file.minCoverage.padStart(5)}%  ${file.path}`);
    });
    console.log('');
  }

  console.log('='.repeat(80));

  return result.failing.length === 0;
}

/**
 * メイン処理
 */
function main() {
  console.log(`\n🔍 ${project} のステージされたファイルのカバレッジをチェック中...`);

  // 1. ステージされたファイルを取得
  const stagedFiles = getStagedFiles();

  // 2. プロジェクトのソースファイルをフィルター（テストファイルと除外パターンを除く）
  const stagedSourceFiles = stagedFiles.filter((file) => {
    if (!config.srcPattern.test(file)) return false;
    if (isTestFile(file)) return false;
    if (isExcluded(file)) return false;
    return true;
  });

  if (stagedSourceFiles.length === 0) {
    console.log(`   ${project} のソースファイルに変更はありません。スキップします。`);
    process.exit(0);
  }

  console.log(`   対象ファイル: ${stagedSourceFiles.length} 件`);
  stagedSourceFiles.forEach((f) => console.log(`     - ${f}`));

  // 3. カバレッジレポートを読み込み（事前にテストが実行されている前提）
  const coverageReport = loadCoverageReport();
  if (!coverageReport) {
    process.exit(2);
  }

  // 4. ステージされたファイルのカバレッジをチェック
  const result = checkStagedFilesCoverage(stagedSourceFiles, coverageReport);

  // 5. 結果を出力
  const success = printResult(result);

  if (!success) {
    console.log('\n❌ カバレッジチェックに失敗しました。');
    console.log('   変更したファイルのカバレッジが80%未満です。');
    console.log('   テストを追加してカバレッジを改善してください。');
    process.exit(1);
  }

  console.log('\n✅ カバレッジチェック完了。すべてのファイルが目標達成。');
  process.exit(0);
}

main();
