/**
 * @fileoverview 要件カバレッジチェックスクリプト（受入基準レベル対応版）
 *
 * E2Eテストが要件定義書の受入基準をカバーしているかを検証します。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-coverage.ts [options]
 *
 * 機能:
 *   1. 要件定義書から全要件IDと受入基準を抽出
 *   2. E2Eテストファイルから @REQ-* タグを抽出
 *   3. 除外リスト（E2E対象外要件）を読み込み
 *   4. 要件レベルおよび受入基準レベルでカバレッジ率を計算
 *   5. 閾値未満の場合は exit 1（CI/CDで失敗させる）
 *
 * オプション:
 *   --verbose      詳細出力
 *   --json         JSON形式で出力
 *   --threshold=N  カバレッジ閾値（デフォルト: 100%）
 *   --strict       除外リストにない未カバー要件があれば失敗
 *
 * タグ形式:
 *   - @REQ-4       要件4全体
 *   - @REQ-4.1     要件4の受入基準1
 *   - @REQ-27A     サブ要件
 *   - @REQ-27A.3   サブ要件の受入基準3
 *
 * 除外リスト:
 *   e2e/requirement-exclusions.json に定義されたE2E対象外の受入基準は
 *   カバレッジ計算から除外されます。
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 型定義
// ============================================================================

interface AcceptanceCriteria {
  id: string; // REQ-4.1, REQ-27A.3 など
  requirementId: string; // REQ-4, REQ-27A
  number: number; // 1, 2, 3...
  text: string;
  line: number;
}

interface Requirement {
  id: string; // REQ-4, REQ-27A など
  title: string;
  line: number;
  acceptanceCriteria: AcceptanceCriteria[];
}

interface TestCoverage {
  file: string;
  requirements: string[]; // REQ-4, REQ-27A
  acceptanceCriteria: string[]; // REQ-4.1, REQ-27A.3
}

interface ExclusionEntry {
  id: string;
  requirement: string;
  title: string;
  reason: string;
  category: string;
  alternativeVerification: {
    method: string;
    tool: string;
    description: string;
    threshold: string;
  };
}

interface ExclusionsFile {
  exclusions: ExclusionEntry[];
  categories: Record<string, { description: string; verificationPhase: string }>;
  summary: {
    totalExclusions: number;
    byCategory: Record<string, number>;
  };
}

interface CoverageResult {
  // 要件レベル
  totalRequirements: number;
  coveredRequirementCount: number;
  uncoveredRequirementCount: number;
  requirementCoveragePercent: number;
  requirements: Requirement[];
  coveredRequirements: string[];
  uncoveredRequirements: Requirement[];

  // 受入基準レベル（全体）
  totalAcceptanceCriteria: number;
  coveredAcceptanceCriteriaCount: number;
  uncoveredAcceptanceCriteriaCount: number;
  acceptanceCriteriaCoveragePercent: number;
  allAcceptanceCriteria: AcceptanceCriteria[];
  coveredAcceptanceCriteria: string[];
  uncoveredAcceptanceCriteria: AcceptanceCriteria[];

  // 受入基準レベル（E2E適用対象のみ）
  applicableAcceptanceCriteriaCount: number;
  excludedAcceptanceCriteriaCount: number;
  applicableCoveragePercent: number;
  excludedAcceptanceCriteria: ExclusionEntry[];

  testFiles: TestCoverage[];
}

interface Options {
  verbose: boolean;
  json: boolean;
  threshold: number;
  strict: boolean;
}

// ============================================================================
// 定数
// ============================================================================

const DEFAULT_THRESHOLD = 100;
const REQUIREMENTS_PATH = '.kiro/specs/user-authentication/requirements.md';
const E2E_SPECS_DIR = 'e2e/specs';
const EXCLUSIONS_PATH = 'e2e/requirement-exclusions.json';

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * コマンドライン引数をパース
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    verbose: false,
    json: false,
    threshold: DEFAULT_THRESHOLD,
    strict: false,
  };

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg.startsWith('--threshold=')) {
      const value = parseInt(arg.split('=')[1] || '', 10);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        options.threshold = value;
      }
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

/**
 * 除外リストを読み込む
 */
function loadExclusions(): ExclusionsFile | null {
  if (!fs.existsSync(EXCLUSIONS_PATH)) {
    return null;
  }

  try {
    const content = fs.readFileSync(EXCLUSIONS_PATH, 'utf-8');
    return JSON.parse(content) as ExclusionsFile;
  } catch (_error) {
    console.warn(`警告: 除外リストの読み込みに失敗しました: ${EXCLUSIONS_PATH}`);
    return null;
  }
}

// ============================================================================
// 要件・受入基準抽出
// ============================================================================

/**
 * 要件定義書から要件IDと受入基準を抽出
 *
 * パターン:
 *   - ### 要件N: タイトル → REQ-N
 *   - ### 要件NA: タイトル → REQ-NA
 *   - 番号付きリスト（1. 2. 3. ...）→ 受入基準
 */
function extractRequirements(filePath: string): Requirement[] {
  const requirements: Requirement[] = [];

  if (!fs.existsSync(filePath)) {
    console.error(`エラー: 要件定義書が見つかりません: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 要件ヘッダーパターン: ### 要件N: または ### 要件NA:
  const requirementRegex = /^###\s*要件(\d+[A-E]?):\s*(.*)$/;

  // 受入基準パターン: 数字. で始まる行
  const acceptanceCriteriaRegex = /^(\d+)\.\s+(.+)$/;

  let currentRequirement: Requirement | null = null;
  let inAcceptanceCriteriaSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // 要件ヘッダーの検出
    const reqMatch = requirementRegex.exec(line);
    if (reqMatch && reqMatch[1] && reqMatch[2]) {
      // 前の要件を保存
      if (currentRequirement) {
        requirements.push(currentRequirement);
      }

      currentRequirement = {
        id: `REQ-${reqMatch[1]}`,
        title: reqMatch[2].trim(),
        line: i + 1,
        acceptanceCriteria: [],
      };
      inAcceptanceCriteriaSection = false;
      continue;
    }

    // 受入基準セクションの検出
    if (line.includes('#### 受入基準') || line.includes('##### 受入基準')) {
      inAcceptanceCriteriaSection = true;
      continue;
    }

    // 新しいセクション（###）に入ったら受入基準セクション終了
    // ただし##### はサブセクションとして許可（REQ-28のような構造に対応）
    if (line.startsWith('###') && !line.startsWith('#####') && !line.includes('受入基準')) {
      // ### 要件N: で始まる新しい要件、または #### で始まる非受入基準セクション
      if (line.startsWith('### 要件') || (line.startsWith('####') && !line.startsWith('#####'))) {
        inAcceptanceCriteriaSection = false;
        // 注: ### 要件N: の場合は次のループで処理されるのでcontinueしない
        if (!line.startsWith('### 要件')) {
          continue;
        }
      }
    }

    // 受入基準の抽出
    if (currentRequirement && inAcceptanceCriteriaSection) {
      const acMatch = acceptanceCriteriaRegex.exec(line);
      if (acMatch && acMatch[1] && acMatch[2]) {
        const number = parseInt(acMatch[1], 10);
        currentRequirement.acceptanceCriteria.push({
          id: `${currentRequirement.id}.${number}`,
          requirementId: currentRequirement.id,
          number,
          text: acMatch[2].trim(),
          line: i + 1,
        });
      }
    }
  }

  // 最後の要件を保存
  if (currentRequirement) {
    requirements.push(currentRequirement);
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
 *   - @REQ-4       要件4全体
 *   - @REQ-4.1     要件4の受入基準1
 *   - @REQ-27A     サブ要件
 *   - @REQ-27A.3   サブ要件の受入基準3
 */
function extractTestCoverage(dir: string): TestCoverage[] {
  const testFiles = findFiles(dir, /\.spec\.ts$/);
  const coverage: TestCoverage[] = [];

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const requirements = new Set<string>();
    const acceptanceCriteria = new Set<string>();

    // @REQ-N または @REQ-NA または @REQ-N.M または @REQ-NA.M
    const regex = /@REQ-(\d+[A-E]?)(?:\.(\d+))?/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        const reqId = `REQ-${match[1]}`;
        requirements.add(reqId);

        if (match[2]) {
          // 受入基準レベルのタグ
          const acId = `${reqId}.${match[2]}`;
          acceptanceCriteria.add(acId);
        }
      }
    }

    if (requirements.size > 0 || acceptanceCriteria.size > 0) {
      coverage.push({
        file: path.relative(process.cwd(), file),
        requirements: Array.from(requirements).sort(),
        acceptanceCriteria: Array.from(acceptanceCriteria).sort(),
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
  testCoverage: TestCoverage[],
  exclusions: ExclusionsFile | null
): CoverageResult {
  // テストでカバーされている要件を集約
  const coveredReqSet = new Set<string>();
  const coveredAcSet = new Set<string>();

  for (const tc of testCoverage) {
    for (const req of tc.requirements) {
      coveredReqSet.add(req);
    }
    for (const ac of tc.acceptanceCriteria) {
      coveredAcSet.add(ac);
    }
  }

  // 全受入基準を収集
  const allAcceptanceCriteria: AcceptanceCriteria[] = [];
  for (const req of requirements) {
    allAcceptanceCriteria.push(...req.acceptanceCriteria);
  }

  // 除外リストを処理
  const excludedIds = new Set<string>();
  const excludedEntries: ExclusionEntry[] = [];

  if (exclusions) {
    for (const excl of exclusions.exclusions) {
      excludedIds.add(excl.id);
      excludedEntries.push(excl);
    }
  }

  // 要件レベルのカバレッジ
  const coveredRequirements = Array.from(coveredReqSet).sort();
  const uncoveredRequirements = requirements.filter((r) => !coveredReqSet.has(r.id));

  const requirementCoveragePercent =
    requirements.length > 0 ? (coveredRequirements.length / requirements.length) * 100 : 0;

  // 受入基準レベルのカバレッジ（全体）
  const coveredAcceptanceCriteria = Array.from(coveredAcSet).sort();
  const uncoveredAcceptanceCriteria = allAcceptanceCriteria.filter(
    (ac) => !coveredAcSet.has(ac.id)
  );

  const acceptanceCriteriaCoveragePercent =
    allAcceptanceCriteria.length > 0
      ? (coveredAcceptanceCriteria.length / allAcceptanceCriteria.length) * 100
      : 0;

  // 受入基準レベルのカバレッジ（E2E適用対象のみ）
  const applicableAcceptanceCriteria = allAcceptanceCriteria.filter(
    (ac) => !excludedIds.has(ac.id)
  );
  const applicableCoveredCount = applicableAcceptanceCriteria.filter((ac) =>
    coveredAcSet.has(ac.id)
  ).length;

  const applicableCoveragePercent =
    applicableAcceptanceCriteria.length > 0
      ? (applicableCoveredCount / applicableAcceptanceCriteria.length) * 100
      : 0;

  return {
    // 要件レベル
    totalRequirements: requirements.length,
    coveredRequirementCount: coveredRequirements.length,
    uncoveredRequirementCount: uncoveredRequirements.length,
    requirementCoveragePercent,
    requirements,
    coveredRequirements,
    uncoveredRequirements,

    // 受入基準レベル（全体）
    totalAcceptanceCriteria: allAcceptanceCriteria.length,
    coveredAcceptanceCriteriaCount: coveredAcceptanceCriteria.length,
    uncoveredAcceptanceCriteriaCount: uncoveredAcceptanceCriteria.length,
    acceptanceCriteriaCoveragePercent,
    allAcceptanceCriteria,
    coveredAcceptanceCriteria,
    uncoveredAcceptanceCriteria,

    // 受入基準レベル（E2E適用対象のみ）
    applicableAcceptanceCriteriaCount: applicableAcceptanceCriteria.length,
    excludedAcceptanceCriteriaCount: excludedIds.size,
    applicableCoveragePercent,
    excludedAcceptanceCriteria: excludedEntries,

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
  const { verbose, threshold } = options;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  要件カバレッジレポート（受入基準レベル）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 要件レベルサマリー
  console.log('  【要件レベル】');
  console.log(`    総要件数:     ${result.totalRequirements}`);
  console.log(`    カバー済み:   ${result.coveredRequirementCount}`);
  console.log(`    未カバー:     ${result.uncoveredRequirementCount}`);
  console.log(`    カバレッジ:   ${result.requirementCoveragePercent.toFixed(1)}%`);
  console.log('');

  // 受入基準レベルサマリー（全体）
  console.log('  【受入基準レベル（全体）】');
  console.log(`    総受入基準数: ${result.totalAcceptanceCriteria}`);
  console.log(`    カバー済み:   ${result.coveredAcceptanceCriteriaCount}`);
  console.log(`    未カバー:     ${result.uncoveredAcceptanceCriteriaCount}`);
  console.log(`    カバレッジ:   ${result.acceptanceCriteriaCoveragePercent.toFixed(1)}%`);
  console.log('');

  // 受入基準レベルサマリー（E2E適用対象）
  console.log('  【受入基準レベル（E2E適用対象）】');
  console.log(`    適用対象数:   ${result.applicableAcceptanceCriteriaCount}`);
  console.log(`    除外数:       ${result.excludedAcceptanceCriteriaCount}`);
  console.log(`    カバレッジ:   ${result.applicableCoveragePercent.toFixed(1)}%`);
  console.log(`    閾値:         ${threshold}%`);
  console.log('');

  // プログレスバー（E2E適用対象のカバレッジ）
  const barWidth = 40;
  const filledWidth = Math.round((result.applicableCoveragePercent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  console.log(`  [${bar}] ${result.applicableCoveragePercent.toFixed(1)}%`);
  console.log('');

  // 除外された受入基準（カテゴリごとにグループ化）
  if (result.excludedAcceptanceCriteria.length > 0) {
    console.log('  📋 E2E対象外受入基準（代替検証方法あり）:');

    // カテゴリごとにグループ化
    const byCategory = new Map<string, ExclusionEntry[]>();
    for (const excl of result.excludedAcceptanceCriteria) {
      const entries = byCategory.get(excl.category) || [];
      entries.push(excl);
      byCategory.set(excl.category, entries);
    }

    for (const [category, entries] of byCategory) {
      console.log(`\n     [${category}] (${entries.length}件)`);
      for (const entry of entries) {
        console.log(`       - ${entry.id}: ${entry.title}`);
        console.log(`         代替検証: ${entry.alternativeVerification.method}`);
      }
    }
    console.log('');
  }

  // 未カバー受入基準（除外リスト外）
  const uncoveredNotExcluded = result.uncoveredAcceptanceCriteria.filter(
    (ac) => !result.excludedAcceptanceCriteria.some((excl) => excl.id === ac.id)
  );

  if (uncoveredNotExcluded.length > 0) {
    console.log('  ❌ 未カバー受入基準（E2Eテスト必要）:');

    // 要件ごとにグループ化
    const grouped = new Map<string, AcceptanceCriteria[]>();
    for (const ac of uncoveredNotExcluded) {
      const reqAcs = grouped.get(ac.requirementId) || [];
      reqAcs.push(ac);
      grouped.set(ac.requirementId, reqAcs);
    }

    for (const [reqId, acs] of grouped) {
      const req = result.requirements.find((r) => r.id === reqId);
      console.log(`\n     ${reqId}: ${req?.title || '(不明)'}`);
      for (const ac of acs) {
        const truncatedText = ac.text.length > 60 ? ac.text.substring(0, 60) + '...' : ac.text;
        console.log(`       - ${ac.id}: ${truncatedText}`);
      }
    }
    console.log('');
  }

  // 詳細出力
  if (verbose) {
    console.log('  ✅ カバー済み受入基準:');
    for (const acId of result.coveredAcceptanceCriteria) {
      const ac = result.allAcceptanceCriteria.find((a) => a.id === acId);
      const truncatedText = ac?.text
        ? ac.text.length > 50
          ? ac.text.substring(0, 50) + '...'
          : ac.text
        : '(不明)';
      console.log(`     - ${acId}: ${truncatedText}`);
    }
    console.log('');

    console.log('  📁 テストファイル別カバレッジ:');
    for (const tc of result.testFiles) {
      console.log(`     ${tc.file}`);
      if (tc.requirements.length > 0) {
        console.log(`       要件: ${tc.requirements.join(', ')}`);
      }
      if (tc.acceptanceCriteria.length > 0) {
        console.log(`       受入基準: ${tc.acceptanceCriteria.join(', ')}`);
      }
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
      requirement: {
        total: result.totalRequirements,
        covered: result.coveredRequirementCount,
        uncovered: result.uncoveredRequirementCount,
        coveragePercent: parseFloat(result.requirementCoveragePercent.toFixed(2)),
      },
      acceptanceCriteria: {
        total: result.totalAcceptanceCriteria,
        covered: result.coveredAcceptanceCriteriaCount,
        uncovered: result.uncoveredAcceptanceCriteriaCount,
        coveragePercent: parseFloat(result.acceptanceCriteriaCoveragePercent.toFixed(2)),
      },
      applicableAcceptanceCriteria: {
        total: result.applicableAcceptanceCriteriaCount,
        excluded: result.excludedAcceptanceCriteriaCount,
        coveragePercent: parseFloat(result.applicableCoveragePercent.toFixed(2)),
        threshold: options.threshold,
        passed: result.applicableCoveragePercent >= options.threshold,
      },
    },
    coveredRequirements: result.coveredRequirements,
    uncoveredRequirements: result.uncoveredRequirements.map((r) => ({
      id: r.id,
      title: r.title,
    })),
    coveredAcceptanceCriteria: result.coveredAcceptanceCriteria,
    uncoveredAcceptanceCriteria: result.uncoveredAcceptanceCriteria.map((ac) => ({
      id: ac.id,
      requirementId: ac.requirementId,
      text: ac.text,
    })),
    excludedAcceptanceCriteria: result.excludedAcceptanceCriteria.map((excl) => ({
      id: excl.id,
      category: excl.category,
      reason: excl.reason,
      alternativeVerification: excl.alternativeVerification,
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

  // 1. 要件定義書から要件と受入基準を抽出
  const requirements = extractRequirements(REQUIREMENTS_PATH);

  if (requirements.length === 0) {
    console.error('エラー: 要件が見つかりませんでした');
    process.exit(1);
  }

  // 2. 除外リストを読み込む
  const exclusions = loadExclusions();

  // 3. E2Eテストからカバレッジを抽出
  const testCoverage = extractTestCoverage(E2E_SPECS_DIR);

  // 4. カバレッジを計算
  const result = calculateCoverage(requirements, testCoverage, exclusions);

  // 5. レポート出力
  if (options.json) {
    printJsonReport(result, options);
  } else {
    printReport(result, options);
  }

  // 6. 閾値チェック（E2E適用対象のカバレッジで判定）
  const passed = result.applicableCoveragePercent >= options.threshold;

  // strict モード: 除外リストにない未カバー要件があれば失敗
  const uncoveredNotExcluded = result.uncoveredAcceptanceCriteria.filter(
    (ac) => !result.excludedAcceptanceCriteria.some((excl) => excl.id === ac.id)
  );
  const strictPassed = !options.strict || uncoveredNotExcluded.length === 0;

  if (!passed || !strictPassed) {
    if (!options.json) {
      console.log('');
      if (!passed) {
        console.log(`❌ FAILED: E2E適用対象のカバレッジが閾値(${options.threshold}%)未満です`);
      }
      if (!strictPassed) {
        console.log(
          `❌ FAILED: 除外リストにない未カバー要件が${uncoveredNotExcluded.length}件あります`
        );
      }
      console.log('');
      console.log('対応方法:');
      console.log('  1. 未カバー受入基準に対応するE2Eテストを作成してください');
      console.log('  2. テスト関数名またはコメントに @REQ-N.M タグを追加してください');
      console.log('  3. E2E対象外の場合は e2e/requirement-exclusions.json に追加してください');
      console.log('');
      console.log('例:');
      console.log("  test('共通ヘッダーが表示される @REQ-28.21', async ({ page }) => { ... });");
      console.log('  // @REQ-28.21 @REQ-28.22');
      console.log('');
    }
    process.exit(1);
  } else {
    if (!options.json) {
      console.log('');
      console.log('✅ PASSED: E2E適用対象のカバレッジが閾値を満たしています');
      if (result.excludedAcceptanceCriteriaCount > 0) {
        console.log(
          `   (${result.excludedAcceptanceCriteriaCount}件の除外要件は代替検証方法で対応)`
        );
      }
      console.log('');
    }
    process.exit(0);
  }
}

main();
