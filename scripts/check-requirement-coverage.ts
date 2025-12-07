/**
 * @fileoverview 要件カバレッジチェックスクリプト（複数機能対応・自動検出版）
 *
 * .kiro/specs/配下の全機能を自動検出し、E2Eテストおよびコードが
 * 要件定義書の受入基準をカバーしているかを検証します。
 *
 * 使用方法:
 *   npx tsx scripts/check-requirement-coverage.ts [options]
 *
 * 機能:
 *   1. .kiro/specs/配下の機能を自動検出
 *   2. 各機能の要件定義書から全要件IDと受入基準を抽出
 *   3. コードおよびテストファイルから @requirement タグを抽出
 *   4. 除外リスト（E2E対象外要件）を読み込み
 *   5. 機能別および全体でカバレッジ率を計算
 *   6. 閾値未満の場合は exit 1（CI/CDで失敗させる）
 *
 * オプション:
 *   --verbose      詳細出力
 *   --json         JSON形式で出力
 *   --threshold=N  カバレッジ閾値（デフォルト: 100%）
 *   --strict       除外リストにない未カバー要件があれば失敗
 *   --feature=NAME 特定機能のみチェック
 *
 * タグ形式:
 *   - @requirement feature-name/REQ-4       要件4全体
 *   - @requirement feature-name/REQ-4.1     要件4の受入基準1
 *   - @requirement feature-name/REQ-27A     サブ要件
 *   - @requirement feature-name/REQ-27A.3   サブ要件の受入基準3
 *   - (feature-name/REQ-4.1)                括弧形式（テスト記述内）
 *   - Requirements (feature-name):          ヘッダー形式
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
  id: string; // user-authentication/REQ-4.1, project-management/REQ-27A.3 など
  featureName: string; // user-authentication, project-management
  requirementId: string; // REQ-4, REQ-27A
  fullRequirementId: string; // user-authentication/REQ-4
  number: number; // 1, 2, 3...
  text: string;
  line: number;
}

interface Requirement {
  id: string; // REQ-4, REQ-27A など
  fullId: string; // user-authentication/REQ-4
  featureName: string;
  title: string;
  line: number;
  acceptanceCriteria: AcceptanceCriteria[];
}

interface Feature {
  name: string;
  path: string;
  requirements: Requirement[];
  totalAcceptanceCriteria: number;
}

interface TestCoverage {
  file: string;
  requirements: string[]; // user-authentication/REQ-4, project-management/REQ-27A
  acceptanceCriteria: string[]; // user-authentication/REQ-4.1, project-management/REQ-27A.3
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

interface FeatureCoverageResult {
  featureName: string;
  totalRequirements: number;
  coveredRequirementCount: number;
  requirementCoveragePercent: number;
  totalAcceptanceCriteria: number;
  coveredAcceptanceCriteriaCount: number;
  acceptanceCriteriaCoveragePercent: number;
  applicableAcceptanceCriteriaCount: number;
  excludedAcceptanceCriteriaCount: number;
  applicableCoveragePercent: number;
  uncoveredRequirements: Requirement[];
  uncoveredAcceptanceCriteria: AcceptanceCriteria[];
}

interface CoverageResult {
  features: Feature[];
  featureCoverage: FeatureCoverageResult[];

  // 全体サマリー
  totalRequirements: number;
  coveredRequirementCount: number;
  uncoveredRequirementCount: number;
  requirementCoveragePercent: number;
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
  featureFilter: string | null;
}

// ============================================================================
// 定数
// ============================================================================

const DEFAULT_THRESHOLD = 100;
const SPECS_DIR = '.kiro/specs';
const CODE_DIRS = ['backend/src', 'frontend/src', 'e2e'];
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
    featureFilter: null,
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
    } else if (arg.startsWith('--feature=')) {
      options.featureFilter = arg.split('=')[1] || null;
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
      // node_modules, dist, .git などを除外
      if (!['node_modules', 'dist', '.git', 'coverage', 'generated'].includes(entry.name)) {
        results.push(...findFiles(fullPath, pattern));
      }
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * .kiro/specs/配下の機能を自動検出
 */
function discoverFeatures(): string[] {
  const features: string[] = [];

  if (!fs.existsSync(SPECS_DIR)) {
    console.error(`エラー: スペックディレクトリが見つかりません: ${SPECS_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(SPECS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const requirementsPath = path.join(SPECS_DIR, entry.name, 'requirements.md');
      if (fs.existsSync(requirementsPath)) {
        features.push(entry.name);
      }
    }
  }

  return features.sort();
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
  } catch {
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
 *   - ### Requirement N: タイトル → REQ-N (英語形式)
 *   - 番号付きリスト（1. 2. 3. ...）→ 受入基準
 */
function extractRequirements(featureName: string, filePath: string): Requirement[] {
  const requirements: Requirement[] = [];

  if (!fs.existsSync(filePath)) {
    console.error(`エラー: 要件定義書が見つかりません: ${filePath}`);
    return requirements;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 要件ヘッダーパターン: ### 要件N: または ### 要件NA: または ### Requirement N:
  const requirementRegexJa = /^###\s*要件(\d+[A-E]?):\s*(.*)$/;
  const requirementRegexEn = /^###\s*Requirement\s+(\d+[A-E]?):\s*(.*)$/;

  // 受入基準パターン: 数字. で始まる行
  const acceptanceCriteriaRegex = /^(\d+)\.\s+(.+)$/;

  let currentRequirement: Requirement | null = null;
  let inAcceptanceCriteriaSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // 要件ヘッダーの検出
    const reqMatchJa = requirementRegexJa.exec(line);
    const reqMatchEn = requirementRegexEn.exec(line);
    const reqMatch = reqMatchJa || reqMatchEn;

    if (reqMatch && reqMatch[1] && reqMatch[2]) {
      // 前の要件を保存
      if (currentRequirement) {
        requirements.push(currentRequirement);
      }

      const reqId = `REQ-${reqMatch[1]}`;
      currentRequirement = {
        id: reqId,
        fullId: `${featureName}/${reqId}`,
        featureName,
        title: reqMatch[2].trim(),
        line: i + 1,
        acceptanceCriteria: [],
      };
      inAcceptanceCriteriaSection = false;
      continue;
    }

    // 受入基準セクションの検出
    if (
      line.includes('#### 受入基準') ||
      line.includes('##### 受入基準') ||
      line.includes('#### Acceptance Criteria')
    ) {
      inAcceptanceCriteriaSection = true;
      continue;
    }

    // 新しいセクション（###）に入ったら受入基準セクション終了
    if (line.startsWith('###') && !line.startsWith('#####') && !line.includes('受入基準')) {
      if (line.startsWith('### 要件') || line.startsWith('### Requirement')) {
        // 次のループで処理
      } else if (line.startsWith('####') && !line.startsWith('#####')) {
        inAcceptanceCriteriaSection = false;
        continue;
      }
    }

    // 受入基準の抽出
    if (currentRequirement && inAcceptanceCriteriaSection) {
      const acMatch = acceptanceCriteriaRegex.exec(line);
      if (acMatch && acMatch[1] && acMatch[2]) {
        const number = parseInt(acMatch[1], 10);
        currentRequirement.acceptanceCriteria.push({
          id: `${featureName}/${currentRequirement.id}.${number}`,
          featureName,
          requirementId: currentRequirement.id,
          fullRequirementId: `${featureName}/${currentRequirement.id}`,
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

/**
 * 全機能の要件を抽出
 */
function extractAllFeatures(featureNames: string[]): Feature[] {
  const features: Feature[] = [];

  for (const featureName of featureNames) {
    const requirementsPath = path.join(SPECS_DIR, featureName, 'requirements.md');
    const requirements = extractRequirements(featureName, requirementsPath);

    let totalAc = 0;
    for (const req of requirements) {
      totalAc += req.acceptanceCriteria.length;
    }

    features.push({
      name: featureName,
      path: requirementsPath,
      requirements,
      totalAcceptanceCriteria: totalAc,
    });
  }

  return features;
}

// ============================================================================
// テストカバレッジ抽出
// ============================================================================

/**
 * コードおよびテストファイルから @requirement タグを抽出
 *
 * パターン:
 *   - @requirement feature-name/REQ-N
 *   - @requirement feature-name/REQ-N.M
 *   - feature-name/REQ-N
 *   - feature-name/REQ-N.M
 *   - (feature-name/REQ-N.M)
 *   - Requirements (feature-name):
 *   - Requirements coverage (feature-name):
 */
function extractTestCoverage(dirs: string[], featureNames: string[]): TestCoverage[] {
  const coverage: TestCoverage[] = [];

  // 機能名のパターンを構築
  const featurePattern = featureNames.join('|');

  for (const dir of dirs) {
    const testFiles = findFiles(dir, /\.(ts|tsx|spec\.ts)$/);

    for (const file of testFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const requirements = new Set<string>();
      const acceptanceCriteria = new Set<string>();

      // パターン1: @requirement feature-name/REQ-N または @requirement feature-name/REQ-N.M
      const regexAtReq = new RegExp(
        `@requirement\\s+(${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?`,
        'g'
      );

      // パターン2: (feature-name/REQ-N.M) - 括弧形式
      const regexParen = new RegExp(
        `\\((${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?\\)`,
        'g'
      );

      // パターン3: feature-name/REQ-N - 単独形式
      const regexStandalone = new RegExp(
        `(?:^|[^/\\w])(${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?`,
        'gm'
      );

      // パターン4: Requirements (feature-name): または Requirements coverage (feature-name):
      const regexHeader = new RegExp(
        `Requirements\\s*(?:coverage\\s*)?\\((${featurePattern})\\):`,
        'g'
      );

      // パターン5: - REQ-N.M: (ヘッダー内の要件リスト形式)
      // この場合、直前のRequirements (feature-name):から機能名を取得する必要がある

      // ヘッダーから機能名を取得
      const headerMatches = Array.from(content.matchAll(regexHeader));
      const headerFeatures = new Map<number, string>();
      for (const match of headerMatches) {
        if (match.index !== undefined && match[1]) {
          headerFeatures.set(match.index, match[1]);
        }
      }

      // パターン1-3の処理
      const processMatch = (
        match: RegExpMatchArray,
        featureIdx: number,
        reqIdx: number,
        acIdx: number
      ) => {
        const featureName = match[featureIdx];
        const reqNum = match[reqIdx];
        const acNum = match[acIdx];

        if (featureName && reqNum) {
          const reqId = `${featureName}/REQ-${reqNum}`;
          requirements.add(reqId);

          if (acNum) {
            const acId = `${featureName}/REQ-${reqNum}.${acNum}`;
            acceptanceCriteria.add(acId);
          }
        }
      };

      let match;
      while ((match = regexAtReq.exec(content)) !== null) {
        processMatch(match, 1, 2, 3);
      }
      while ((match = regexParen.exec(content)) !== null) {
        processMatch(match, 1, 2, 3);
      }
      while ((match = regexStandalone.exec(content)) !== null) {
        processMatch(match, 1, 2, 3);
      }

      // パターン5: ヘッダー内の要件リスト形式 (- REQ-N.M:)
      // 各ヘッダーの後のセクションで - REQ-X.Y パターンを検索
      for (const [headerIndex, featureName] of headerFeatures) {
        // ヘッダーから次の空行または別のセクションまでを検索
        const sectionStart = headerIndex;
        const sectionEnd = content.indexOf('\n\n', sectionStart + 1);
        const section =
          sectionEnd > 0 ? content.slice(sectionStart, sectionEnd) : content.slice(sectionStart);

        const reqListRegex = /[-*]\s*REQ-(\d+[A-E]?)(?:\.(\d+))?(?:-REQ-(\d+[A-E]?)(?:\.(\d+))?)?/g;
        let listMatch;
        while ((listMatch = reqListRegex.exec(section)) !== null) {
          if (listMatch[1]) {
            const reqId = `${featureName}/REQ-${listMatch[1]}`;
            requirements.add(reqId);

            if (listMatch[2]) {
              const acId = `${featureName}/REQ-${listMatch[1]}.${listMatch[2]}`;
              acceptanceCriteria.add(acId);
            }

            // 範囲形式 (REQ-1-REQ-5) の処理
            if (listMatch[3]) {
              const endReq = `${featureName}/REQ-${listMatch[3]}`;
              requirements.add(endReq);
            }
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
  features: Feature[],
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

  // 全要件と受入基準を収集
  const allRequirements: Requirement[] = [];
  const allAcceptanceCriteria: AcceptanceCriteria[] = [];

  for (const feature of features) {
    allRequirements.push(...feature.requirements);
    for (const req of feature.requirements) {
      allAcceptanceCriteria.push(...req.acceptanceCriteria);
    }
  }

  // 除外リストを処理（機能名付きIDに変換）
  const excludedIds = new Set<string>();
  const excludedEntries: ExclusionEntry[] = [];

  if (exclusions) {
    for (const excl of exclusions.exclusions) {
      // 除外リストのIDが旧形式（REQ-N.M）の場合、全機能に適用
      // 新形式（feature-name/REQ-N.M）の場合はそのまま使用
      if (excl.id.includes('/')) {
        excludedIds.add(excl.id);
      } else {
        // 旧形式の場合、user-authentication機能にマッピング（後方互換性）
        excludedIds.add(`user-authentication/${excl.id}`);
      }
      excludedEntries.push(excl);
    }
  }

  // 機能別カバレッジ計算
  const featureCoverage: FeatureCoverageResult[] = [];

  for (const feature of features) {
    const featureReqs = feature.requirements;
    const featureAcs: AcceptanceCriteria[] = [];
    for (const req of featureReqs) {
      featureAcs.push(...req.acceptanceCriteria);
    }

    const coveredReqs = featureReqs.filter((r) => coveredReqSet.has(r.fullId));
    const coveredAcs = featureAcs.filter((ac) => coveredAcSet.has(ac.id));
    const uncoveredReqs = featureReqs.filter((r) => !coveredReqSet.has(r.fullId));
    const uncoveredAcs = featureAcs.filter((ac) => !coveredAcSet.has(ac.id));

    const applicableAcs = featureAcs.filter((ac) => !excludedIds.has(ac.id));
    const excludedAcs = featureAcs.filter((ac) => excludedIds.has(ac.id));
    const applicableCoveredCount = applicableAcs.filter((ac) => coveredAcSet.has(ac.id)).length;

    featureCoverage.push({
      featureName: feature.name,
      totalRequirements: featureReqs.length,
      coveredRequirementCount: coveredReqs.length,
      requirementCoveragePercent:
        featureReqs.length > 0 ? (coveredReqs.length / featureReqs.length) * 100 : 0,
      totalAcceptanceCriteria: featureAcs.length,
      coveredAcceptanceCriteriaCount: coveredAcs.length,
      acceptanceCriteriaCoveragePercent:
        featureAcs.length > 0 ? (coveredAcs.length / featureAcs.length) * 100 : 0,
      applicableAcceptanceCriteriaCount: applicableAcs.length,
      excludedAcceptanceCriteriaCount: excludedAcs.length,
      applicableCoveragePercent:
        applicableAcs.length > 0 ? (applicableCoveredCount / applicableAcs.length) * 100 : 0,
      uncoveredRequirements: uncoveredReqs,
      uncoveredAcceptanceCriteria: uncoveredAcs,
    });
  }

  // 全体カバレッジ計算
  const coveredRequirements = Array.from(coveredReqSet).sort();
  const uncoveredRequirements = allRequirements.filter((r) => !coveredReqSet.has(r.fullId));

  const requirementCoveragePercent =
    allRequirements.length > 0 ? (coveredRequirements.length / allRequirements.length) * 100 : 0;

  const coveredAcceptanceCriteria = Array.from(coveredAcSet).sort();
  const uncoveredAcceptanceCriteria = allAcceptanceCriteria.filter(
    (ac) => !coveredAcSet.has(ac.id)
  );

  const acceptanceCriteriaCoveragePercent =
    allAcceptanceCriteria.length > 0
      ? (coveredAcceptanceCriteria.length / allAcceptanceCriteria.length) * 100
      : 0;

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
    features,
    featureCoverage,

    totalRequirements: allRequirements.length,
    coveredRequirementCount: coveredRequirements.length,
    uncoveredRequirementCount: uncoveredRequirements.length,
    requirementCoveragePercent,
    coveredRequirements,
    uncoveredRequirements,

    totalAcceptanceCriteria: allAcceptanceCriteria.length,
    coveredAcceptanceCriteriaCount: coveredAcceptanceCriteria.length,
    uncoveredAcceptanceCriteriaCount: uncoveredAcceptanceCriteria.length,
    acceptanceCriteriaCoveragePercent,
    allAcceptanceCriteria,
    coveredAcceptanceCriteria,
    uncoveredAcceptanceCriteria,

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
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  要件カバレッジレポート（複数機能対応・受入基準レベル）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 検出された機能
  console.log('  📦 検出された機能:');
  for (const feature of result.features) {
    console.log(
      `     - ${feature.name}: ${feature.requirements.length}要件, ${feature.totalAcceptanceCriteria}受入基準`
    );
  }
  console.log('');

  // 機能別カバレッジ
  console.log('  【機能別カバレッジ】');
  for (const fc of result.featureCoverage) {
    const barWidth = 20;
    const filledWidth = Math.round((fc.applicableCoveragePercent / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

    console.log(`\n     ${fc.featureName}:`);
    console.log(
      `       要件: ${fc.coveredRequirementCount}/${fc.totalRequirements} (${fc.requirementCoveragePercent.toFixed(1)}%)`
    );
    console.log(
      `       受入基準: ${fc.coveredAcceptanceCriteriaCount}/${fc.totalAcceptanceCriteria} (${fc.acceptanceCriteriaCoveragePercent.toFixed(1)}%)`
    );
    console.log(`       E2E適用対象: [${bar}] ${fc.applicableCoveragePercent.toFixed(1)}%`);
  }
  console.log('');

  // 全体サマリー
  console.log('  【全体サマリー】');
  console.log(`    総要件数:     ${result.totalRequirements}`);
  console.log(`    カバー済み:   ${result.coveredRequirementCount}`);
  console.log(`    未カバー:     ${result.uncoveredRequirementCount}`);
  console.log(`    カバレッジ:   ${result.requirementCoveragePercent.toFixed(1)}%`);
  console.log('');

  console.log('  【受入基準レベル（全体）】');
  console.log(`    総受入基準数: ${result.totalAcceptanceCriteria}`);
  console.log(`    カバー済み:   ${result.coveredAcceptanceCriteriaCount}`);
  console.log(`    未カバー:     ${result.uncoveredAcceptanceCriteriaCount}`);
  console.log(`    カバレッジ:   ${result.acceptanceCriteriaCoveragePercent.toFixed(1)}%`);
  console.log('');

  console.log('  【受入基準レベル（E2E適用対象）】');
  console.log(`    適用対象数:   ${result.applicableAcceptanceCriteriaCount}`);
  console.log(`    除外数:       ${result.excludedAcceptanceCriteriaCount}`);
  console.log(`    カバレッジ:   ${result.applicableCoveragePercent.toFixed(1)}%`);
  console.log(`    閾値:         ${threshold}%`);
  console.log('');

  // プログレスバー
  const barWidth = 40;
  const filledWidth = Math.round((result.applicableCoveragePercent / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
  console.log(`  [${bar}] ${result.applicableCoveragePercent.toFixed(1)}%`);
  console.log('');

  // 除外された受入基準
  if (result.excludedAcceptanceCriteria.length > 0) {
    console.log('  📋 E2E対象外受入基準（代替検証方法あり）:');

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
        if (verbose) {
          console.log(`         代替検証: ${entry.alternativeVerification.method}`);
        }
      }
    }
    console.log('');
  }

  // 未カバー受入基準
  const uncoveredNotExcluded = result.uncoveredAcceptanceCriteria.filter(
    (ac) =>
      !result.excludedAcceptanceCriteria.some((excl) => {
        const exclId = excl.id.includes('/') ? excl.id : `user-authentication/${excl.id}`;
        return exclId === ac.id;
      })
  );

  if (uncoveredNotExcluded.length > 0) {
    console.log('  ❌ 未カバー受入基準（テスト必要）:');

    // 機能・要件ごとにグループ化
    const grouped = new Map<string, AcceptanceCriteria[]>();
    for (const ac of uncoveredNotExcluded) {
      const reqAcs = grouped.get(ac.fullRequirementId) || [];
      reqAcs.push(ac);
      grouped.set(ac.fullRequirementId, reqAcs);
    }

    for (const [fullReqId, acs] of grouped) {
      const req =
        result.uncoveredRequirements.find((r) => r.fullId === fullReqId) ||
        result.features.flatMap((f) => f.requirements).find((r) => r.fullId === fullReqId);

      console.log(`\n     ${fullReqId}: ${req?.title || '(不明)'}`);
      for (const ac of acs) {
        const truncatedText = ac.text.length > 50 ? ac.text.substring(0, 50) + '...' : ac.text;
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

    console.log('  📁 ファイル別カバレッジ:');
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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * JSON形式でレポートを出力
 */
function printJsonReport(result: CoverageResult, options: Options): void {
  const output = {
    features: result.features.map((f) => ({
      name: f.name,
      requirementCount: f.requirements.length,
      acceptanceCriteriaCount: f.totalAcceptanceCriteria,
    })),
    featureCoverage: result.featureCoverage.map((fc) => ({
      featureName: fc.featureName,
      requirements: {
        total: fc.totalRequirements,
        covered: fc.coveredRequirementCount,
        coveragePercent: parseFloat(fc.requirementCoveragePercent.toFixed(2)),
      },
      acceptanceCriteria: {
        total: fc.totalAcceptanceCriteria,
        covered: fc.coveredAcceptanceCriteriaCount,
        coveragePercent: parseFloat(fc.acceptanceCriteriaCoveragePercent.toFixed(2)),
      },
      applicableAcceptanceCriteria: {
        total: fc.applicableAcceptanceCriteriaCount,
        excluded: fc.excludedAcceptanceCriteriaCount,
        coveragePercent: parseFloat(fc.applicableCoveragePercent.toFixed(2)),
      },
    })),
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
      id: r.fullId,
      title: r.title,
    })),
    coveredAcceptanceCriteria: result.coveredAcceptanceCriteria,
    uncoveredAcceptanceCriteria: result.uncoveredAcceptanceCriteria.map((ac) => ({
      id: ac.id,
      requirementId: ac.fullRequirementId,
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

  // 1. 機能を自動検出
  let featureNames = discoverFeatures();

  if (featureNames.length === 0) {
    console.error('エラー: 機能が見つかりませんでした');
    process.exit(1);
  }

  // 機能フィルタ適用
  if (options.featureFilter) {
    featureNames = featureNames.filter((f) => f === options.featureFilter);
    if (featureNames.length === 0) {
      console.error(`エラー: 指定された機能が見つかりません: ${options.featureFilter}`);
      process.exit(1);
    }
  }

  // 2. 全機能の要件を抽出
  const features = extractAllFeatures(featureNames);

  // 3. 除外リストを読み込む
  const exclusions = loadExclusions();

  // 4. コードおよびテストからカバレッジを抽出
  const testCoverage = extractTestCoverage(CODE_DIRS, featureNames);

  // 5. カバレッジを計算
  const result = calculateCoverage(features, testCoverage, exclusions);

  // 6. レポート出力
  if (options.json) {
    printJsonReport(result, options);
  } else {
    printReport(result, options);
  }

  // 7. 閾値チェック
  const passed = result.applicableCoveragePercent >= options.threshold;

  const uncoveredNotExcluded = result.uncoveredAcceptanceCriteria.filter(
    (ac) =>
      !result.excludedAcceptanceCriteria.some((excl) => {
        const exclId = excl.id.includes('/') ? excl.id : `user-authentication/${excl.id}`;
        return exclId === ac.id;
      })
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
      console.log('  1. 未カバー受入基準に対応するテストを作成してください');
      console.log(
        '  2. コードまたはテストに @requirement feature-name/REQ-N.M タグを追加してください'
      );
      console.log('  3. E2E対象外の場合は e2e/requirement-exclusions.json に追加してください');
      console.log('');
      console.log('例:');
      console.log('  /**');
      console.log('   * @requirement user-authentication/REQ-4.1: ログイン成功時トークン発行');
      console.log('   */');
      console.log(
        "  test('ログイン成功 (user-authentication/REQ-4.1)', async ({ page }) => { ... });"
      );
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
