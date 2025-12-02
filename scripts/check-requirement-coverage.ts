/**
 * @fileoverview 要件カバレッジチェックスクリプト
 *
 * E2Eテストが要件定義書の要件をカバーしているかを検証します。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-coverage.ts [--threshold=80]
 *
 * 機能:
 *   1. 要件定義書から全要件IDを抽出
 *   2. E2Eテストファイルから @REQ-* タグを抽出
 *   3. カバレッジ率を計算
 *   4. 閾値未満の場合は exit 1（CI/CDで失敗させる）
 *
 * オプション:
 *   --threshold=N  カバレッジ閾値（デフォルト: 80）
 *   --verbose      詳細出力
 *   --json         JSON形式で出力
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 型定義
// ============================================================================

interface Requirement {
  id: string; // REQ-4, REQ-27A など
  title: string;
  line: number;
}

interface TestCoverage {
  file: string;
  requirements: string[];
}

interface CoverageResult {
  totalRequirements: number;
  coveredCount: number;
  uncoveredCount: number;
  coveragePercent: number;
  requirements: Requirement[];
  coveredRequirements: string[];
  uncoveredRequirements: Requirement[];
  testFiles: TestCoverage[];
}

interface Options {
  threshold: number;
  verbose: boolean;
  json: boolean;
}

// ============================================================================
// 定数
// ============================================================================

const DEFAULT_THRESHOLD = 100;
const REQUIREMENTS_PATH = '.kiro/specs/user-authentication/requirements.md';
const E2E_SPECS_DIR = 'e2e/specs';

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * コマンドライン引数をパース
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    threshold: DEFAULT_THRESHOLD,
    verbose: false,
    json: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--threshold=')) {
      const value = parseInt(arg.split('=')[1] || '', 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        options.threshold = value;
      }
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

/**
 * ディレクトリ内のファイルを再帰的に取得
 */
function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

// ============================================================================
// 要件抽出
// ============================================================================

/**
 * 要件定義書から要件IDを抽出
 *
 * パターン: ### 要件N: タイトル または ### 要件NA: タイトル
 * 例: ### 要件4: ログイン → REQ-4
 *     ### 要件27A: 二要素認証（2FA）ログイン機能 → REQ-27A
 */
function extractRequirements(filePath: string): Requirement[] {
  const requirements: Requirement[] = [];

  if (!fs.existsSync(filePath)) {
    console.error(`エラー: 要件定義書が見つかりません: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // パターン: ### 要件N: または ### 要件NA:
  const regex = /^###\s*要件(\d+[A-E]?):\s*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const match = regex.exec(line);
    if (match && match[1] && match[2]) {
      requirements.push({
        id: `REQ-${match[1]}`,
        title: match[2].trim(),
        line: i + 1,
      });
    }
  }

  return requirements;
}

// ============================================================================
// テストカバレッジ抽出
// ============================================================================

/**
 * E2Eテストファイルから @REQ-* タグを抽出
 *
 * パターン:
 *   - @REQ-4 （要件4全体）
 *   - @REQ-4.1 （要件4の受入基準1）
 *   - @REQ-27A （サブ要件）
 *
 * タグの配置場所:
 *   - テスト関数名: test('ログインできる @REQ-4', ...)
 *   - コメント: // @REQ-4 @REQ-4.1
 *   - JSDoc: * @REQ-4
 */
function extractTestCoverage(dir: string): TestCoverage[] {
  const testFiles = findFiles(dir, /\.spec\.ts$/);
  const coverage: TestCoverage[] = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const requirements = new Set<string>();

    // @REQ-N または @REQ-NA（サブ番号は親要件に集約）
    const regex = /@REQ-(\d+[A-E]?)(?:\.\d+)?/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        requirements.add(`REQ-${match[1]}`);
      }
    }

    if (requirements.size > 0) {
      coverage.push({
        file: path.relative(process.cwd(), file),
        requirements: Array.from(requirements).sort(),
      });
    }
  }

  return coverage;
}

// ============================================================================
// カバレッジ計算
// ============================================================================

/**
 * カバレッジを計算
 */
function calculateCoverage(
  requirements: Requirement[],
  testCoverage: TestCoverage[]
): CoverageResult {
  // テストでカバーされている要件を集約
  const coveredSet = new Set<string>();
  for (const tc of testCoverage) {
    for (const req of tc.requirements) {
      coveredSet.add(req);
    }
  }

  const coveredRequirements = Array.from(coveredSet).sort();
  const uncoveredRequirements = requirements.filter((r) => !coveredSet.has(r.id));

  const coveragePercent =
    requirements.length > 0 ? (coveredRequirements.length / requirements.length) * 100 : 0;

  return {
    totalRequirements: requirements.length,
    coveredCount: coveredRequirements.length,
    uncoveredCount: uncoveredRequirements.length,
    coveragePercent,
    requirements,
    coveredRequirements,
    uncoveredRequirements,
    testFiles: testCoverage,
  };
}

// ============================================================================
// レポート出力
// ============================================================================

/**
 * コンソールにレポートを出力
 */
function printReport(result: CoverageResult, options: Options): void {
  const { threshold, verbose } = options;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  要件カバレッジレポート');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`  総要件数:     ${result.totalRequirements}`);
  console.log(`  カバー済み:   ${result.coveredCount}`);
  console.log(`  未カバー:     ${result.uncoveredCount}`);
  console.log(`  カバレッジ:   ${result.coveragePercent.toFixed(1)}%`);
  console.log(`  閾値:         ${threshold}%`);
  console.log('');

  // プログレスバー
  const barWidth = 40;
  const filledWidth = Math.round((result.coveragePercent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  console.log(`  [${bar}] ${result.coveragePercent.toFixed(1)}%`);
  console.log('');

  // 未カバー要件
  if (result.uncoveredRequirements.length > 0) {
    console.log('  ❌ 未カバー要件:');
    for (const req of result.uncoveredRequirements) {
      console.log(`     - ${req.id}: ${req.title}`);
    }
    console.log('');
  }

  // 詳細出力
  if (verbose) {
    console.log('  ✅ カバー済み要件:');
    for (const reqId of result.coveredRequirements) {
      const req = result.requirements.find((r) => r.id === reqId);
      console.log(`     - ${reqId}: ${req?.title || '(不明)'}`);
    }
    console.log('');

    console.log('  📁 テストファイル別カバレッジ:');
    for (const tc of result.testFiles) {
      console.log(`     ${tc.file}`);
      console.log(`       → ${tc.requirements.join(', ')}`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * JSON形式でレポートを出力
 */
function printJsonReport(result: CoverageResult, options: Options): void {
  const output = {
    summary: {
      totalRequirements: result.totalRequirements,
      coveredCount: result.coveredCount,
      uncoveredCount: result.uncoveredCount,
      coveragePercent: parseFloat(result.coveragePercent.toFixed(2)),
      threshold: options.threshold,
      passed: result.coveragePercent >= options.threshold,
    },
    coveredRequirements: result.coveredRequirements,
    uncoveredRequirements: result.uncoveredRequirements.map((r) => ({
      id: r.id,
      title: r.title,
    })),
    testFiles: result.testFiles,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ============================================================================
// メイン処理
// ============================================================================

function main(): void {
  const options = parseArgs();

  // 1. 要件定義書から要件を抽出
  const requirements = extractRequirements(REQUIREMENTS_PATH);

  if (requirements.length === 0) {
    console.error('エラー: 要件が見つかりませんでした');
    process.exit(1);
  }

  // 2. E2Eテストからカバレッジを抽出
  const testCoverage = extractTestCoverage(E2E_SPECS_DIR);

  // 3. カバレッジを計算
  const result = calculateCoverage(requirements, testCoverage);

  // 4. レポート出力
  if (options.json) {
    printJsonReport(result, options);
  } else {
    printReport(result, options);
  }

  // 5. 閾値チェック
  if (result.coveragePercent < options.threshold) {
    if (!options.json) {
      console.log('');
      console.log(`❌ FAILED: 要件カバレッジが閾値(${options.threshold}%)未満です`);
      console.log('');
      console.log('対応方法:');
      console.log('  1. 未カバー要件に対応するE2Eテストを作成してください');
      console.log('  2. テスト関数名またはコメントに @REQ-N タグを追加してください');
      console.log('');
      console.log('例:');
      console.log("  test('ログインできる @REQ-4', async ({ page }) => { ... });");
      console.log('  // @REQ-4 @REQ-4.1');
      console.log('');
    }
    process.exit(1);
  } else {
    if (!options.json) {
      console.log('');
      console.log('✅ PASSED: 要件カバレッジが閾値を満たしています');
      console.log('');
    }
    process.exit(0);
  }
}

main();
