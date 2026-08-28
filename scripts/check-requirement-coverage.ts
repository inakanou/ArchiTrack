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
 *   5. 本番の入口から取り込みを辿り、番号を持つ検証が本番の経路を通るかを判定
 *   6. 除外一覧を監査する（除外は「被覆あり」ではない）
 *   7. 機能別および全体でカバレッジ率を計算
 *   8. 閾値未満、または到達しない被覆源しか持たない受入基準があれば exit 1
 *
 * オプション:
 *   --verbose      詳細出力
 *   --json         JSON形式で出力
 *   --threshold=N  カバレッジ閾値（デフォルト: 100%）
 *   --strict       除外リストにない未カバー要件、および掲げた代替検証が実在しない除外があれば失敗
 *   --feature=NAME 特定機能のみチェック
 *
 * 本番到達性:
 *   番号が付いているだけでは被覆と数えない。番号を持つ検証が参照する本番のシンボルが、
 *   本番の入口（frontend/src/main.tsx / backend/src/index.ts / backend/prisma/seed.ts）から
 *   取り込みを辿って到達する場合のみ被覆源とする。判定規則の固定資料は
 *   scripts/check-requirement-coverage.selftest.ts にある。
 *
 * タグ形式:
 *   - @requirement feature-name/REQ-4       要件4全体
 *   - @requirement feature-name/REQ-4.1     要件4の受入基準1
 *   - @requirement feature-name/REQ-27A     サブ要件
 *   - @requirement feature-name/REQ-27A.3   サブ要件の受入基準3
 *   - (feature-name/REQ-4.1)                括弧形式（テスト記述内）
 *   - Requirements (feature-name):          ヘッダー形式
 *
 * ヘッダー形式の及ぶ範囲:
 *   ヘッダー直下に `- REQ-N.M:` を並べる形（パターン5）は、次のヘッダー・囲む
 *   ブロックコメントの終端・次の空行・JSDoc 内の段落の切れ目（` *` だけの行）の
 *   うち最も手前までを一区間とする。
 *   区間の決め方は resolveHeaderSectionEnd にあり、
 *   scripts/check-requirement-coverage.selftest.ts が両方向（過大帰属・取りこぼし）を固定する。
 *
 * 除外リスト:
 *   e2e/requirement-exclusions.json に定義されたE2E対象外の受入基準は
 *   カバレッジ計算の分母から外れます。外れるだけであり、被覆済みではありません。
 *   二重登録・代替検証の記述欠落・要件定義書に存在しない項目は失敗、
 *   リポジトリ内の自動検証を掲げながらその検証が実在しない項目は --strict で失敗します。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

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
export function discoverFeatures(): string[] {
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

/** パターン5（ヘッダー直下の要件一覧）が拾った被覆印 */
export interface HeaderScopedCoverage {
  /** feature-name/REQ-N */
  requirements: string[];
  /** feature-name/REQ-N.M */
  acceptanceCriteria: string[];
}

/** パターン4のヘッダー（`Requirements (feature-name):`）の出現位置 */
interface CoverageHeader {
  index: number;
  featureName: string;
}

/** ヘッダー直下の一覧の各項目（`- REQ-N.M:` / `- REQ-N-REQ-M:`） */
const HEADER_LIST_ITEM_REGEX =
  /[-*]\s*REQ-(\d+[A-E]?)(?:\.(\d+))?(?:-REQ-(\d+[A-E]?)(?:\.(\d+))?)?/g;

/**
 * 区間の切れ目として数えるヘッダー
 *
 * **機能名を問わない。** 帰属の側は既知の機能名だけを見るが、区間の切れ目は
 * 「新しいヘッダーが始まった」という事実だけで決まる。既知の機能名だけを切れ目にすると、
 * `--feature=NAME` で走らせたときに他機能のヘッダーが切れ目でなくなり、
 * 過大帰属が絞り込みのときだけ復活する。
 */
const ANY_COVERAGE_HEADER_REGEX = /Requirements\s*(?:coverage\s*)?\([A-Za-z0-9_-]+\):/g;

/** パターン4のヘッダー（既知の機能名のみ）を組み立てる */
function buildHeaderRegex(featureNames: readonly string[]): RegExp {
  return new RegExp(`Requirements\\s*(?:coverage\\s*)?\\((${featureNames.join('|')})\\):`, 'g');
}

/**
 * ヘッダーが属する区間の終端を決める
 *
 * 次の四つの上限のうち**最も手前**を採る。
 *
 *   1. 次のヘッダーの開始位置 — 別機能のヘッダー配下の一覧を飲み込ませない
 *   2. ヘッダーを囲む JSDoc / ブロックコメントの終端 — 本体側の記述を飲み込ませない
 *   3. 次の空行 — 素の本文・行コメントでの段落の切れ目（従来からの上限）
 *   4. JSDoc 内の段落の切れ目（` *` だけの行） — 一覧の直後に続く散文を飲み込ませない
 *
 * 3 だけを見ていた頃は、JSDoc の中の段落の切れ目が空行ではなく ` *` の行であるために
 * **JSDoc 一枚に複数のヘッダーを並べたファイルで区間が一度も切れず**、
 * 二番目以降のヘッダー配下の一覧まで先頭の機能へ帰属していた（被覆の過大帰属）。
 *
 * 4 は 3 の JSDoc 版である。実データ（被覆ヘッダー 384 件）で 4 を加えて帰属が減るのは
 * 4 ヘッダーだけであり、**正当な被覆は一件も失われない**。内訳は次のとおり。
 *
 *   - `site-survey/REQ-16.7` / `quantity-table-generation/REQ-38.4` — 被覆の集計から落ちる。
 *     いずれも「E2Eテストで検証困難なため省略」「本スペックには含まない」と
 *     **検証していないことを明言した散文**であり、落ちるのが正しい
 *   - `quantity-table-generation/REQ-7.1` — 掲げていたファイル自身が
 *     「対応する主張は本ファイルに無い」と明記している。同じ番号を
 *     `autocomplete-optimization.spec.ts` が判定しているため集計は動かない
 *   - `quantity-table-generation/REQ-47`・`47.15`〜`47.17` — 同じ行が
 *     `@requirement` 形式（パターン1）でも書かれており、そちらが拾うため集計は動かない
 *
 * 実データの事例は自己検査が名指しで固定している。
 *
 * @param content ファイル全体の本文
 * @param headerIndex 当該ヘッダーの開始位置
 * @param nextHeaderIndex 次のヘッダーの開始位置（無ければ null）
 */
export function resolveHeaderSectionEnd(
  content: string,
  headerIndex: number,
  nextHeaderIndex: number | null
): number {
  let end = content.length;

  const blankLine = content.indexOf('\n\n', headerIndex + 1);
  if (blankLine > 0) end = Math.min(end, blankLine);

  if (nextHeaderIndex !== null && nextHeaderIndex > headerIndex) {
    end = Math.min(end, nextHeaderIndex);
  }

  const commentEnd = enclosingBlockCommentEnd(content, headerIndex);
  if (commentEnd !== null) end = Math.min(end, commentEnd);

  const paragraphBreak = jsDocParagraphBreak(content, headerIndex);
  if (paragraphBreak !== null) end = Math.min(end, paragraphBreak);

  return end;
}

/**
 * ヘッダーより後ろにある最初の「JSDoc 内の段落の切れ目」の位置を返す
 *
 * 段落の切れ目とは、行の中身が `*` だけ（前後の空白は許す）の行である。
 * JSDoc ではここが空行の役目を果たす。見つからなければ null を返す。
 */
function jsDocParagraphBreak(content: string, headerIndex: number): number | null {
  const offset = headerIndex + 1;
  const match = /\n[ \t]*\*[ \t]*(?=\n)/.exec(content.slice(offset));
  return match ? offset + (match.index as number) : null;
}

/**
 * ヘッダーを囲むブロックコメントの終端（`*` と `/` の並び）の位置を返す
 *
 * ヘッダーがブロックコメントの中に無ければ null を返す。
 * 直前のコメント開始（`/` と `*` の並び）を起点に対応する終端を探し、
 * それがヘッダーより後ろにある場合のみ「囲んでいる」と判定する。
 * 終端がヘッダーより手前にあるなら、そのコメントは既に閉じており、
 * ヘッダーはコメントの外にある。
 */
function enclosingBlockCommentEnd(content: string, headerIndex: number): number | null {
  const open = content.lastIndexOf('/*', headerIndex);
  if (open < 0) return null;
  const close = content.indexOf('*/', open + 2);
  if (close < 0 || close < headerIndex) return null;
  return close;
}

/**
 * パターン5: ヘッダー直下の要件一覧から被覆印を拾う
 */
export function extractHeaderScopedCoverage(
  content: string,
  featureNames: readonly string[]
): HeaderScopedCoverage {
  const requirements = new Set<string>();
  const acceptanceCriteria = new Set<string>();

  if (featureNames.length === 0) {
    return { requirements: [], acceptanceCriteria: [] };
  }

  const headers: CoverageHeader[] = [];
  for (const match of content.matchAll(buildHeaderRegex(featureNames))) {
    if (match.index !== undefined && match[1]) {
      headers.push({ index: match.index, featureName: match[1] });
    }
  }

  // 切れ目は機能名を問わず、あらゆるヘッダーの出現位置で決める
  const boundaries: number[] = [];
  for (const match of content.matchAll(ANY_COVERAGE_HEADER_REGEX)) {
    if (match.index !== undefined) boundaries.push(match.index);
  }

  for (const header of headers) {
    const next = boundaries.find((index) => index > header.index);
    const sectionEnd = resolveHeaderSectionEnd(content, header.index, next ?? null);
    const section = content.slice(header.index, sectionEnd);

    HEADER_LIST_ITEM_REGEX.lastIndex = 0;
    let listMatch: RegExpExecArray | null;
    while ((listMatch = HEADER_LIST_ITEM_REGEX.exec(section)) !== null) {
      if (!listMatch[1]) continue;
      requirements.add(`${header.featureName}/REQ-${listMatch[1]}`);
      if (listMatch[2]) {
        acceptanceCriteria.add(`${header.featureName}/REQ-${listMatch[1]}.${listMatch[2]}`);
      }
      // 範囲形式 (REQ-1-REQ-5) の処理
      if (listMatch[3]) {
        requirements.add(`${header.featureName}/REQ-${listMatch[3]}`);
      }
    }
  }

  return {
    requirements: Array.from(requirements).sort(),
    acceptanceCriteria: Array.from(acceptanceCriteria).sort(),
  };
}

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
      // 区間の決め方は extractHeaderScopedCoverage に切り出してある（自己検査が直接見る）。
      const headerScoped = extractHeaderScopedCoverage(content, featureNames);
      for (const reqId of headerScoped.requirements) {
        requirements.add(reqId);
      }
      for (const acId of headerScoped.acceptanceCriteria) {
        acceptanceCriteria.add(acId);
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
// 本番到達性（production reachability）
// ============================================================================
//
// 被覆の検査は長らく「要件の番号を持つ検証ファイルが存在するか」だけを見ていた。
// そのため次の三つの経路で「満点なのに実装が無い」が成立していた。
//
//   1. 未結線コード（本番の経路から一度も参照されない部品）に番号を付ける
//   2. 本番を通らない検証（恒真式・画面内で判定を自前に書き起こす形）に番号を付ける
//   3. 除外一覧へ載せる（除外は分母から外れるだけで、被覆ではない）
//
// ここでは 1 を機械的に塞ぐ。すなわち「番号を持つ検証が参照する本番のシンボルが、
// 本番の経路（index.html が読み込む入口 / サーバの起動入口 / 投入処理の入口）から
// 辿れるか」を判定する。2 は姉妹の検査（check:e2e-guards / check:e2e-selfjudge）が
// 扱うため、ここでは重複して実装しない。3 は auditExclusions が扱う。
//
// 判定はモジュール単位である。関数単位の到達性は静的に決められないが、
// 「モジュールごと死んでいる」形（本スペックが 115.130 / 115.146 で二度踏んだ形）は
// モジュール単位で確実に捕捉できる。

/** 走査対象とする本番ソースの根 */
export const PRODUCTION_ROOTS: readonly string[] = ['frontend/src', 'backend/src'];

/**
 * 本番の経路の起点
 *
 * - `frontend/src/main.tsx`: frontend/index.html が読み込む唯一の入口
 * - `backend/src/index.ts`: backend/package.json の `main` / `start` が起動する入口
 * - `backend/prisma/seed.ts`: 配備時に実行される投入処理の入口（`src` の外にある）
 */
export const PRODUCTION_ENTRY_POINTS: readonly string[] = [
  'frontend/src/main.tsx',
  'backend/src/index.ts',
  'backend/prisma/seed.ts',
];

/** 拡張子を省いた取り込みを解決する際に試す順序 */
const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx'];

/** frontend/vite.config.ts の `resolve.alias` に対応する */
const PATH_ALIASES: ReadonlyArray<{ prefix: string; target: string }> = [
  { prefix: '@/', target: 'frontend/src/' },
];

/** リポジトリ内の自動検証を代替検証として掲げているかの判定に使う語 */
const IN_REPO_VERIFICATION_TOOL =
  /(vitest|jest|playwright|supertest|react testing library|\brtl\b|storybook)/i;

export type CoverageSourceKind = 'e2e' | 'production' | 'verification' | 'unknown';

export type ReachabilityReason =
  /** E2E は本番のビルドを実ブラウザで駆動するため、本番の経路そのものである */
  | 'e2e-drives-production'
  /** 本番ファイルであり、入口から取り込みを辿って到達する */
  | 'production-reachable'
  /** 本番ファイルだが、入口からどう辿っても到達しない（死コード） */
  | 'production-unreachable'
  /** 検証ファイルであり、その検証対象が入口から到達する */
  | 'verification-subject-reachable'
  /** 検証ファイルだが、その検証対象が入口から到達しない（死コードの検証） */
  | 'verification-subject-unreachable'
  /** 検証ファイルだが、本番のシンボルを一つも参照していない */
  | 'verification-no-production-reference'
  /** 走査対象の外にあり、到達性を判定できない */
  | 'source-not-scanned';

export interface SourceReachability {
  /** 番号を持つファイル（リポジトリ相対・POSIX 表記） */
  file: string;
  kind: CoverageSourceKind;
  /** 被覆源として数えてよいか */
  reachable: boolean;
  reason: ReachabilityReason;
  /** 検証ファイルの場合、到達性の判定に用いた本番モジュール */
  subjects: string[];
}

export interface CriterionReachability {
  id: string;
  sources: SourceReachability[];
  /** 到達する被覆源が一つ以上あるか */
  reachable: boolean;
}

export interface ModuleGraph {
  /** 走査したモジュール（リポジトリ相対・POSIX 表記） */
  modules: Set<string>;
  /** モジュール → そのモジュールが取り込む第一者モジュール */
  imports: Map<string, Set<string>>;
  /** 実在した入口（解決できなかった入口はここに現れない） */
  entryPoints: string[];
}

/** OS 依存の区切りを POSIX 表記へ揃える */
export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/').replace(/^\.\//, '');
}

/** 型宣言のみのファイル（実行時の経路を持たない） */
export function isTypeDeclarationFile(filePath: string): boolean {
  return /\.d\.ts$/.test(toPosixPath(filePath));
}

/**
 * 検証・物語・補助のためのファイル（本番の経路には乗らない）
 *
 * ここに該当するファイルからの取り込みは、到達性の根拠として数えない。
 * 数えてしまうと「テストが取り込んでいるから生きている」という循環が成立し、
 * 死コードが永久に検出できなくなる。
 */
export function isVerificationFile(filePath: string): boolean {
  const file = toPosixPath(filePath);
  return (
    /(^|\/)__tests__(\/|$)/.test(file) ||
    /(^|\/)__mocks__(\/|$)/.test(file) ||
    /(^|\/)test-support(\/|$)/.test(file) ||
    /(^|\/)test-utils(\/|\.)/.test(file) ||
    /\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(file)
  );
}

/** 行・ブロックのコメントを空白へ潰す（コメント内の `from '...'` を辺にしないため） */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let k = i; k < stop; k++) out += source[k] === '\n' ? '\n' : ' ';
      i = stop;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/**
 * 取り込み指定子を抽出する
 *
 * 静的な取り込み・型のみの取り込み・名前空間・既定・再輸出・副作用のみ・動的取り込みを
 * すべて拾う。抽出漏れは「黙って死コード扱い」を生むため、自己検査で形ごとに固定する。
 */
export function extractImportSpecifiers(source: string): string[] {
  const masked = stripComments(source);
  const specifiers: string[] = [];
  const regex = /(?:\bimport\b|\bexport\b)\s*\(?\s*(?:[^'"();]*?\bfrom\s*)?['"]([^'"\n]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(masked)) !== null) {
    if (match[1]) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * 取り込み指定子を走査済みモジュールへ解決する
 *
 * 相対指定と `@/` 別名のみを解決する。パッケージ名は第一者のモジュールではないため
 * 解決しない（`null` を返す）。
 */
export function resolveImport(
  specifier: string,
  fromFile: string,
  modules: ReadonlySet<string>
): string | null {
  let base: string | null = null;

  const alias = PATH_ALIASES.find((entry) => specifier.startsWith(entry.prefix));
  if (alias) {
    base = alias.target + specifier.slice(alias.prefix.length);
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(toPosixPath(fromFile)), specifier)
    );
  } else {
    return null;
  }

  if (modules.has(base)) return base;

  // ESM の `.js` 指定は TypeScript の原本を指す
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  if (stripped !== base && modules.has(stripped)) return stripped;

  for (const candidate of [stripped, base]) {
    for (const ext of MODULE_EXTENSIONS) {
      if (modules.has(candidate + ext)) return candidate + ext;
    }
    for (const ext of MODULE_EXTENSIONS) {
      if (modules.has(`${candidate}/index${ext}`)) return `${candidate}/index${ext}`;
    }
  }

  return null;
}

export interface ModuleGraphOptions {
  baseDir?: string;
  roots?: readonly string[];
  entryPoints?: readonly string[];
}

/** 本番ソースの取り込み関係を組み立てる */
export function buildModuleGraph(options: ModuleGraphOptions = {}): ModuleGraph {
  const baseDir = options.baseDir ?? process.cwd();
  const roots = options.roots ?? PRODUCTION_ROOTS;
  const entryPoints = options.entryPoints ?? PRODUCTION_ENTRY_POINTS;

  const modules = new Set<string>();
  for (const root of roots) {
    for (const file of findFiles(path.join(baseDir, root), /\.(ts|tsx)$/)) {
      modules.add(toPosixPath(path.relative(baseDir, file)));
    }
  }
  for (const entry of entryPoints) {
    const absolute = path.join(baseDir, entry);
    if (fs.existsSync(absolute)) modules.add(toPosixPath(entry));
  }

  const imports = new Map<string, Set<string>>();
  for (const module of modules) {
    const deps = new Set<string>();
    const source = fs.readFileSync(path.join(baseDir, module), 'utf-8');
    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveImport(specifier, module, modules);
      if (resolved && resolved !== module) deps.add(resolved);
    }
    imports.set(module, deps);
  }

  return {
    modules,
    imports,
    entryPoints: entryPoints.map(toPosixPath).filter((entry) => modules.has(entry)),
  };
}

/**
 * 入口から取り込みを辿って到達するモジュールを求める
 *
 * 検証ファイルは経路に含めない。含めると「テストが取り込んでいるから生きている」
 * という循環が成立し、死コードが検出できなくなる。
 */
export function computeReachableModules(graph: ModuleGraph): Set<string> {
  const reachable = new Set<string>();
  const stack = graph.entryPoints.filter((entry) => !isVerificationFile(entry));

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || reachable.has(current)) continue;
    if (!graph.modules.has(current)) continue;
    reachable.add(current);
    for (const dep of graph.imports.get(current) ?? []) {
      if (!isVerificationFile(dep)) stack.push(dep);
    }
  }

  return reachable;
}

/** `AnnotationEditor.viewport.test.tsx` → `AnnotationEditor` */
function subjectToken(filePath: string): string {
  const base = path.posix.basename(toPosixPath(filePath)).replace(/\.[cm]?[jt]sx?$/, '');
  return base.split('.')[0] ?? base;
}

/**
 * 被覆源のファイル一つを、本番の経路から到達するかで分類する
 *
 * - `e2e/` 配下: 本番のビルドを実ブラウザで駆動するため到達とみなす
 * - 本番ファイル: 入口から辿れるか
 * - 検証ファイル: その検証対象（同名の本番モジュール。無ければ取り込む本番モジュール全体）が
 *   入口から辿れるか
 */
export function classifyCoverageSource(
  file: string,
  graph: ModuleGraph,
  reachable: ReadonlySet<string>
): SourceReachability {
  const target = toPosixPath(file);

  if (target.startsWith('e2e/')) {
    return {
      file: target,
      kind: 'e2e',
      reachable: true,
      reason: 'e2e-drives-production',
      subjects: [],
    };
  }

  if (!graph.modules.has(target)) {
    return {
      file: target,
      kind: 'unknown',
      reachable: false,
      reason: 'source-not-scanned',
      subjects: [],
    };
  }

  if (!isVerificationFile(target)) {
    const isReachable = reachable.has(target);
    return {
      file: target,
      kind: 'production',
      reachable: isReachable,
      reason: isReachable ? 'production-reachable' : 'production-unreachable',
      subjects: [],
    };
  }

  const deps = Array.from(graph.imports.get(target) ?? []).filter(
    (dep) => !isVerificationFile(dep) && !isTypeDeclarationFile(dep)
  );
  const token = subjectToken(target);
  const named = deps.filter((dep) => subjectToken(dep) === token);
  const subjects = named.length > 0 ? named : deps;

  if (subjects.length === 0) {
    return {
      file: target,
      kind: 'verification',
      reachable: false,
      reason: 'verification-no-production-reference',
      subjects: [],
    };
  }

  const isReachable = subjects.some((subject) => reachable.has(subject));
  return {
    file: target,
    kind: 'verification',
    reachable: isReachable,
    reason: isReachable ? 'verification-subject-reachable' : 'verification-subject-unreachable',
    subjects: subjects.sort(),
  };
}

/** 受入基準ごとに、被覆源が本番の経路から到達するかを集約する */
export function analyzeCriterionReachability(
  testCoverage: TestCoverage[],
  graph: ModuleGraph,
  reachable: ReadonlySet<string>
): Map<string, CriterionReachability> {
  const cache = new Map<string, SourceReachability>();
  const classify = (file: string): SourceReachability => {
    const cached = cache.get(file);
    if (cached) return cached;
    const verdict = classifyCoverageSource(file, graph, reachable);
    cache.set(file, verdict);
    return verdict;
  };

  const byCriterion = new Map<string, CriterionReachability>();
  for (const tc of testCoverage) {
    const verdict = classify(tc.file);
    for (const acId of tc.acceptanceCriteria) {
      const entry = byCriterion.get(acId) ?? { id: acId, sources: [], reachable: false };
      entry.sources.push(verdict);
      entry.reachable = entry.reachable || verdict.reachable;
      byCriterion.set(acId, entry);
    }
  }

  return byCriterion;
}

// ============================================================================
// 除外一覧の監査
// ============================================================================
//
// 除外は「被覆あり」ではない。分母から外れるだけであり、要件が満たされている根拠には
// ならない。従前の検査は除外を無条件に受け入れ、合格の文言で「代替検証方法で対応」と
// 述べていたため、除外一覧そのものが偽の緑の供給源になっていた。

export type ExclusionVerdict =
  /** 同じ受入基準が二重に登録されている */
  | 'duplicate'
  /** 代替検証の記述が欠けている */
  | 'malformed'
  /** 要件定義書に存在しない受入基準を指している */
  | 'stale'
  /** 実装が無いことを明示している（method: none）。被覆ではなく未達の明示 */
  | 'pending'
  /** 代替検証がリポジトリの外にある（負荷試験・監視・手作業など） */
  | 'external'
  /** リポジトリ内の自動検証を掲げており、到達する検証が実在する */
  | 'in-repo-verified'
  /** リポジトリ内の自動検証を掲げているが、到達する検証が存在しない */
  | 'in-repo-unverified';

export interface ExclusionAuditEntry {
  id: string;
  category: string;
  verdict: ExclusionVerdict;
  tool: string;
}

export interface ExclusionAudit {
  entries: ExclusionAuditEntry[];
  byVerdict: Record<ExclusionVerdict, number>;
}

/** 除外一覧の各項目を監査する */
export function auditExclusions(
  exclusions: ExclusionEntry[],
  knownAcceptanceCriteriaIds: ReadonlySet<string>,
  reachabilityByCriterion: ReadonlyMap<string, CriterionReachability>
): ExclusionAudit {
  const entries: ExclusionAuditEntry[] = [];
  const seen = new Set<string>();

  for (const exclusion of exclusions) {
    const id = normalizeExclusionId(exclusion.id);
    const alternative = exclusion.alternativeVerification;
    const tool = alternative?.tool ?? '';
    const method = alternative?.method ?? '';

    let verdict: ExclusionVerdict;
    if (seen.has(id)) {
      verdict = 'duplicate';
    } else if (!alternative || method.trim() === '' || tool.trim() === '') {
      verdict = 'malformed';
    } else if (!knownAcceptanceCriteriaIds.has(id)) {
      verdict = 'stale';
    } else if (method === 'none') {
      verdict = 'pending';
    } else if (!IN_REPO_VERIFICATION_TOOL.test(tool)) {
      verdict = 'external';
    } else if (reachabilityByCriterion.get(id)?.reachable === true) {
      verdict = 'in-repo-verified';
    } else {
      verdict = 'in-repo-unverified';
    }

    seen.add(id);
    entries.push({ id, category: exclusion.category, verdict, tool });
  }

  const byVerdict: Record<ExclusionVerdict, number> = {
    duplicate: 0,
    malformed: 0,
    stale: 0,
    pending: 0,
    external: 0,
    'in-repo-verified': 0,
    'in-repo-unverified': 0,
  };
  for (const entry of entries) byVerdict[entry.verdict] += 1;

  return { entries, byVerdict };
}

/**
 * 監査対象の除外を、実際に走査した機能へ絞る
 *
 * `--feature` で機能を絞った場合、対象外の機能の除外まで「要件定義書に存在しない」と
 * 誤断してしまう。走査していない機能の除外は監査の対象にしない。
 */
export function selectExclusionsForFeatures(
  exclusions: ExclusionEntry[],
  featureNames: readonly string[]
): ExclusionEntry[] {
  const analyzed = new Set(featureNames);
  return exclusions.filter((exclusion) => {
    const featureName = normalizeExclusionId(exclusion.id).split('/')[0];
    return featureName !== undefined && analyzed.has(featureName);
  });
}

/** 旧形式（`REQ-N.M`）の除外 ID を機能名付きへ揃える */
export function normalizeExclusionId(id: string): string {
  return id.includes('/') ? id : `user-authentication/${id}`;
}

// ============================================================================
// 到達性を加味した被覆の集計
// ============================================================================

export interface ReachabilityReport {
  /** 入口から到達したモジュール数 */
  reachableModuleCount: number;
  /** 走査した本番モジュール数（型宣言と検証ファイルを除く） */
  productionModuleCount: number;
  /** 本番の経路から到達しない本番モジュール */
  unreachableProductionModules: string[];
  /** 適用対象のうち、番号は付いているが到達する被覆源が無い受入基準 */
  unreachableCoveredCriteria: CriterionReachability[];
  /** 適用対象のうち、到達する被覆源を持つ受入基準の数 */
  applicableReachableCoveredCount: number;
  /** 適用対象数（除外を分母から外した数。従前と同じ） */
  applicableCount: number;
  /** 到達性を加味した被覆率（適用対象に対して） */
  applicableReachableCoveragePercent: number;
  /** 除外を分母へ戻した被覆率（除外は被覆ではない、を数字で示す） */
  totalReachableCoveragePercent: number;
  exclusionAudit: ExclusionAudit;
}

/** 除外一覧の ID 集合を機能名付きへ揃えて返す */
export function buildExcludedIdSet(exclusions: ExclusionsFile | null): Set<string> {
  const ids = new Set<string>();
  if (!exclusions) return ids;
  for (const exclusion of exclusions.exclusions) {
    ids.add(normalizeExclusionId(exclusion.id));
  }
  return ids;
}

/** 到達性を加味した集計を作る */
export function buildReachabilityReport(
  allAcceptanceCriteria: AcceptanceCriteria[],
  excludedIds: ReadonlySet<string>,
  graph: ModuleGraph,
  reachableModules: ReadonlySet<string>,
  byCriterion: ReadonlyMap<string, CriterionReachability>,
  exclusionAudit: ExclusionAudit
): ReachabilityReport {
  const productionModules = Array.from(graph.modules).filter(
    (module) => !isVerificationFile(module) && !isTypeDeclarationFile(module)
  );
  const unreachableProductionModules = productionModules
    .filter((module) => !reachableModules.has(module))
    .sort();

  const applicable = allAcceptanceCriteria.filter((ac) => !excludedIds.has(ac.id));
  const unreachableCoveredCriteria: CriterionReachability[] = [];
  let applicableReachableCoveredCount = 0;

  for (const ac of applicable) {
    const entry = byCriterion.get(ac.id);
    if (!entry) continue; // 番号が一つも付いていない＝従前の未被覆として別に報告される
    if (entry.reachable) {
      applicableReachableCoveredCount += 1;
    } else {
      unreachableCoveredCriteria.push(entry);
    }
  }

  let totalReachableCovered = 0;
  for (const ac of allAcceptanceCriteria) {
    if (byCriterion.get(ac.id)?.reachable === true) totalReachableCovered += 1;
  }

  return {
    reachableModuleCount: reachableModules.size,
    productionModuleCount: productionModules.length,
    unreachableProductionModules,
    unreachableCoveredCriteria: unreachableCoveredCriteria.sort((a, b) => a.id.localeCompare(b.id)),
    applicableReachableCoveredCount,
    applicableCount: applicable.length,
    applicableReachableCoveragePercent:
      applicable.length > 0 ? (applicableReachableCoveredCount / applicable.length) * 100 : 0,
    totalReachableCoveragePercent:
      allAcceptanceCriteria.length > 0
        ? (totalReachableCovered / allAcceptanceCriteria.length) * 100
        : 0,
    exclusionAudit,
  };
}

/** 到達性と除外の監査から、検査全体の合否を決める */
export interface ReachabilityVerdict {
  ok: boolean;
  strictOk: boolean;
  reasons: string[];
  strictReasons: string[];
}

export function evaluateReachability(
  report: ReachabilityReport,
  threshold: number
): ReachabilityVerdict {
  const reasons: string[] = [];
  const strictReasons: string[] = [];

  if (report.reachableModuleCount === 0) {
    reasons.push('本番の経路から到達するモジュールが 0 件です（走査が壊れています）');
  }
  if (report.unreachableCoveredCriteria.length > 0) {
    reasons.push(
      `番号は付いているが本番の経路から到達しない受入基準が${report.unreachableCoveredCriteria.length}件あります`
    );
  }
  if (report.applicableReachableCoveragePercent < threshold) {
    reasons.push(
      `本番到達を加味した適用対象の被覆率が閾値(${threshold}%)未満です（${report.applicableReachableCoveragePercent.toFixed(1)}%）`
    );
  }

  const audit = report.exclusionAudit.byVerdict;
  if (audit.duplicate > 0) reasons.push(`除外一覧に二重登録が${audit.duplicate}件あります`);
  if (audit.malformed > 0) reasons.push(`代替検証の記述を欠く除外が${audit.malformed}件あります`);
  if (audit.stale > 0) {
    reasons.push(`要件定義書に存在しない受入基準を指す除外が${audit.stale}件あります`);
  }
  if (audit['in-repo-unverified'] > 0) {
    strictReasons.push(
      `リポジトリ内の自動検証を代替検証として掲げているが、本番の経路へ到達する検証が存在しない除外が${audit['in-repo-unverified']}件あります`
    );
  }

  return { ok: reasons.length === 0, strictOk: strictReasons.length === 0, reasons, strictReasons };
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
    for (const id of buildExcludedIdSet(exclusions)) {
      excludedIds.add(id);
    }
    excludedEntries.push(...exclusions.exclusions);
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
function printReport(
  result: CoverageResult,
  options: Options,
  reachability: ReachabilityReport
): void {
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

  console.log('  【本番到達性（番号を持つ検証が本番の経路を通るか）】');
  console.log(
    `    本番モジュール: ${reachability.productionModuleCount}（到達 ${reachability.reachableModuleCount} / 未到達 ${reachability.unreachableProductionModules.length}）`
  );
  console.log(
    `    到達被覆:     ${reachability.applicableReachableCoveredCount}/${reachability.applicableCount} (${reachability.applicableReachableCoveragePercent.toFixed(1)}%)`
  );
  console.log(
    `    到達しない被覆源のみの受入基準: ${reachability.unreachableCoveredCriteria.length}件`
  );
  console.log(
    `    除外を分母へ戻した到達被覆率: ${reachability.totalReachableCoveragePercent.toFixed(1)}%（除外は被覆ではない）`
  );
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
    console.log('  📋 E2E対象外として除外した受入基準（被覆ではない。分母から外しているだけ）:');

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

  const audit = reachability.exclusionAudit;
  console.log('  🧾 除外一覧の監査:');
  console.log(`     二重登録:                 ${audit.byVerdict.duplicate}件`);
  console.log(`     代替検証の記述欠落:       ${audit.byVerdict.malformed}件`);
  console.log(`     要件に存在しない受入基準: ${audit.byVerdict.stale}件`);
  console.log(`     未実装の明示(method:none): ${audit.byVerdict.pending}件`);
  console.log(`     リポジトリ外の代替検証:   ${audit.byVerdict.external}件`);
  console.log(`     リポジトリ内検証あり:     ${audit.byVerdict['in-repo-verified']}件`);
  console.log(
    `     リポジトリ内検証を掲げるが不在: ${audit.byVerdict['in-repo-unverified']}件（--strict で失敗）`
  );
  if (verbose) {
    for (const entry of audit.entries.filter((e) => e.verdict === 'in-repo-unverified')) {
      console.log(`       - ${entry.id}: ${entry.tool}`);
    }
  }
  console.log('');

  // 番号は付いているが本番の経路から到達しない受入基準
  if (reachability.unreachableCoveredCriteria.length > 0) {
    console.log('  ⛔ 番号は付いているが本番の経路から到達しない受入基準（被覆と数えない）:');
    const groupedByFeature = new Map<string, CriterionReachability[]>();
    for (const entry of reachability.unreachableCoveredCriteria) {
      const featureName = entry.id.split('/')[0] ?? '(不明)';
      const list = groupedByFeature.get(featureName) ?? [];
      list.push(entry);
      groupedByFeature.set(featureName, list);
    }
    for (const [featureName, entries] of groupedByFeature) {
      console.log(`\n     [${featureName}] (${entries.length}件)`);
      for (const entry of entries) {
        console.log(`       - ${entry.id}`);
        for (const source of entry.sources) {
          console.log(`           ${source.file} → ${source.reason}`);
          if (verbose && source.subjects.length > 0) {
            console.log(`             参照した本番モジュール: ${source.subjects.join(', ')}`);
          }
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
function printJsonReport(
  result: CoverageResult,
  options: Options,
  reachability: ReachabilityReport
): void {
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
    productionReachability: {
      productionModules: reachability.productionModuleCount,
      reachableModules: reachability.reachableModuleCount,
      unreachableProductionModules: reachability.unreachableProductionModules,
      applicableReachableCovered: reachability.applicableReachableCoveredCount,
      applicableTotal: reachability.applicableCount,
      applicableReachableCoveragePercent: parseFloat(
        reachability.applicableReachableCoveragePercent.toFixed(2)
      ),
      totalReachableCoveragePercent: parseFloat(
        reachability.totalReachableCoveragePercent.toFixed(2)
      ),
      unreachableCoveredAcceptanceCriteria: reachability.unreachableCoveredCriteria.map(
        (entry) => ({
          id: entry.id,
          sources: entry.sources.map((source) => ({
            file: source.file,
            kind: source.kind,
            reason: source.reason,
            subjects: source.subjects,
          })),
        })
      ),
    },
    exclusionAudit: {
      byVerdict: reachability.exclusionAudit.byVerdict,
      entries: reachability.exclusionAudit.entries,
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

  // 6. 本番到達性を判定（番号を持つ検証が本番の経路を通るか）
  const graph = buildModuleGraph();
  const reachableModules = computeReachableModules(graph);
  const byCriterion = analyzeCriterionReachability(testCoverage, graph, reachableModules);
  const excludedIds = buildExcludedIdSet(exclusions);
  const exclusionAudit = auditExclusions(
    selectExclusionsForFeatures(exclusions ? exclusions.exclusions : [], featureNames),
    new Set(result.allAcceptanceCriteria.map((ac) => ac.id)),
    byCriterion
  );
  const reachability = buildReachabilityReport(
    result.allAcceptanceCriteria,
    excludedIds,
    graph,
    reachableModules,
    byCriterion,
    exclusionAudit
  );
  const reachabilityVerdict = evaluateReachability(reachability, options.threshold);

  // 7. レポート出力
  if (options.json) {
    printJsonReport(result, options, reachability);
  } else {
    printReport(result, options, reachability);
  }

  // 8. 閾値チェック
  const passed = result.applicableCoveragePercent >= options.threshold && reachabilityVerdict.ok;

  const uncoveredNotExcluded = result.uncoveredAcceptanceCriteria.filter(
    (ac) =>
      !result.excludedAcceptanceCriteria.some((excl) => {
        const exclId = excl.id.includes('/') ? excl.id : `user-authentication/${excl.id}`;
        return exclId === ac.id;
      })
  );
  const strictPassed =
    !options.strict || (uncoveredNotExcluded.length === 0 && reachabilityVerdict.strictOk);

  if (!passed || !strictPassed) {
    if (!options.json) {
      console.log('');
      if (result.applicableCoveragePercent < options.threshold) {
        console.log(`❌ FAILED: E2E適用対象のカバレッジが閾値(${options.threshold}%)未満です`);
      }
      for (const reason of reachabilityVerdict.reasons) {
        console.log(`❌ FAILED: ${reason}`);
      }
      if (options.strict && uncoveredNotExcluded.length > 0) {
        console.log(
          `❌ FAILED: 除外リストにない未カバー要件が${uncoveredNotExcluded.length}件あります`
        );
      }
      if (options.strict) {
        for (const reason of reachabilityVerdict.strictReasons) {
          console.log(`❌ FAILED: ${reason}`);
        }
      }
      console.log('');
      console.log('対応方法:');
      console.log('  1. 未カバー受入基準に対応するテストを作成してください');
      console.log(
        '  2. コードまたはテストに @requirement feature-name/REQ-N.M タグを追加してください'
      );
      console.log('  3. E2E対象外の場合は e2e/requirement-exclusions.json に追加してください');
      console.log(
        '  4. 番号を付けた検証が本番未参照の部品だけを見ている場合は、本番へ結線するか、死コードを撤去してください'
      );
      console.log(
        '     （当該の受入基準は未実装であることが露見した状態です。採点を緑へ戻すためだけの番号を付け直さないこと）'
      );
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
      console.log('✅ PASSED: E2E適用対象の受入基準は、本番の経路を通る検証で閾値を満たしています');
      if (result.excludedAcceptanceCriteriaCount > 0) {
        console.log(
          `   (除外 ${result.excludedAcceptanceCriteriaCount}件は被覆ではなく分母外です。うち ${exclusionAudit.byVerdict['in-repo-unverified']}件は掲げた代替検証が実在しません)`
        );
      }
      console.log('');
    }
    process.exit(0);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
