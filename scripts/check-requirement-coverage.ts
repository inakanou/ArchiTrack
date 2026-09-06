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
 *   8. 撤廃済み（取り消し線）の受入基準を分母から外し、その番号を名乗る被覆印を挙げる
 *   9. 閾値未満、到達しない被覆源しか持たない受入基準、撤廃済みの番号を名乗る被覆印が
 *      あれば exit 1
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
 * 撤廃された受入基準（取り消し線）:
 *   要件定義書は、撤廃した受入基準や別の要件へ移した受入基準を、番号を保ったまま
 *   取り消し線（`~~`）で潰して残す。後続の番号をずらさないための表記であり、
 *   **潰された行はもう条文ではない**。抽出はこれを分母に入れない（isRetiredCriterionText）。
 *   受入基準がすべて潰された要件は、要件の側も分母から外す。
 *
 *   分母から外すだけでは足りない。番号だけが残った墓標を名乗る被覆印が残っていれば、
 *   読み手には「この検証は当該の条文を確かめている」と見える。
 *   findRetiredCriterionCoverageMarks がそれを挙げ、本スクリプトは失敗する。
 *   直し方は除外の追加ではなく、移管先の番号を名乗り直すことである。
 *
 *   落とした件数は必ず出力する。**黙って縮む分母は水増しと同じだけ危うい。**
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
import {
  SPEC_DIR,
  discoverFeatureNames,
  isRetiredCriterionText,
  requirementsDocumentPath,
  scanRequirementsDocument,
  type ScannedCriterion,
} from './requirement-document.js';

// ============================================================================
// 型定義
// ============================================================================

export interface AcceptanceCriteria {
  id: string; // user-authentication/REQ-4.1, project-management/REQ-27A.3 など
  featureName: string; // user-authentication, project-management
  requirementId: string; // REQ-4, REQ-27A
  fullRequirementId: string; // user-authentication/REQ-4
  number: number; // 1, 2, 3...
  text: string;
  line: number;
}

export interface Requirement {
  id: string; // REQ-4, REQ-27A など
  fullId: string; // user-authentication/REQ-4
  featureName: string;
  title: string;
  line: number;
  acceptanceCriteria: AcceptanceCriteria[];
  /**
   * 要件定義書上で取り消し線により無効化された受入基準
   *
   * 分母（`acceptanceCriteria`）には入れない。ここに残すのは、落とした件数を
   * 出力に出して**分母が黙って縮まないようにする**ためと、除外定義の検査が
   * 「その番号は撤廃済みである」と具体的に言えるようにするためである。
   */
  retiredAcceptanceCriteria: AcceptanceCriteria[];
  /**
   * `1a.` `4b.` のように英字の枝を持つ番号で書かれた受入基準の、基底となる番号
   *
   * 抽出は行頭の `N.` だけを受入基準として読むため、この形の行は**分母に入らない**。
   * それでも被覆印は `REQ-N.M` としてしか書けず、実データにはその形の印が現に付いている。
   * ここに基底番号を残すのは、「要件定義書に存在しない番号を名乗る被覆印」を挙げる検査が、
   * **書式のせいで分母に入っていないだけの番号を誤って挙げない**ようにするためである。
   *
   * **ここに実データの番号を実例として書かない。** 現況は `collectOutOfDenominatorMarks` の
   * `lettered` が一元に持ち、検査本体が「枝つき番号」の行として**件数と全件の列挙つきで**
   * 毎回印字する。散文へ写せば、同期する機構の無い二重帳簿になる（タスク 115.254。
   * ここが挙げていた実例は測り直した時点でもなお真であったが、真であるうちに落とすのが
   * 本作法である——タスク 115.223 が確立したとおり、いま真である実例も等しく時限装置である）。
   * 本記述が実データの名指しと計数を持たないことは、自己検査
   * `check-requirement-coverage.selftest.ts` の `checkExtractorLimitDocsCiteNoRealData` が守る。
   *
   * 分母へ入れる是正（抽出規則を枝つき番号まで広げる）は分母を動かすため、
   * 本スクリプトでは行わない。件数は報告に出す。
   */
  letteredCriterionNumbers: number[];
}

export interface Feature {
  name: string;
  path: string;
  /** 現役の要件（受入基準がすべて撤廃された要件は含まない） */
  requirements: Requirement[];
  totalAcceptanceCriteria: number;
  /** 取り消し線で無効化され、分母から外した受入基準の件数 */
  retiredAcceptanceCriteriaCount: number;
  /**
   * 受入基準がすべて撤廃され、現役の受入基準を一つも持たなくなった要件
   *
   * 要件の側も分母から外す。外さないと、受入基準を落とした分だけ
   * 「被覆印の無い要件」が増え、受入基準の水増しを要件の水増しへ移すだけになる。
   */
  retiredRequirements: Requirement[];
}

export interface TestCoverage {
  file: string;
  requirements: string[]; // user-authentication/REQ-4, project-management/REQ-27A
  acceptanceCriteria: string[]; // user-authentication/REQ-4.1, project-management/REQ-27A.3
}

export interface ExclusionEntry {
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

export interface ExclusionsFile {
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

export interface CoverageResult {
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

/**
 * 被覆印を探す走査根
 *
 * ここから一つ落ちると、その根の下にある被覆印が**丸ごと数えられなくなり**、被覆が静かに
 * 縮む。`findFiles` は存在しない根に対して黙って空を返すため、綴りを誤った根も同じく無言で
 * ある。自己検査（`checkEveryCodeScanRootContributes`）が「どの根も外すと被覆集合が真に
 * 縮む」ことと、根が実在することを課すため、**export を外すとその主張が届かなくなる**。
 *
 * `main()` は根を選ばない。走査根は `extractTestCoverage` の既定引数としてのみ与えられ、
 * その既定が本定数であることを自己検査が原文から照合する
 * （`checkScanRootsAreTheOnesMainUses`）。
 */
export const CODE_DIRS: readonly string[] = ['backend/src', 'frontend/src', 'e2e'];
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
 * 走査の途中で降りないディレクトリ名
 *
 * 走査根（`CODE_DIRS`）とは**向きが逆の選別**である。根は母集団を狭める側に効き、ここは
 * 広げる側に効く。この一覧の固定と、各名前が現に何を除いているかの実測は、自己検査
 * （`checkExcludedDirectoriesAreLedgered`）が本定数の外に置いた台帳
 * （`EXCLUDED_DIRECTORY_LEDGER`）の側で扱う。**export を外すとその主張が届かなくなる。**
 *
 * 現況を本定数の側の散文では述べない——述べると、リポジトリの木が変わった日に散文だけが
 * 偽になる。台帳は実データを毎回測り直す。
 */
export const SCAN_EXCLUDED_DIRECTORIES: readonly string[] = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'generated',
];

/**
 * ディレクトリ内のファイルを再帰的に取得
 *
 * 除外するディレクトリ名は既定で `SCAN_EXCLUDED_DIRECTORIES` である。引数で受けるのは
 * 「その名前を外した世界」を自己検査が実データ上で測るためであり
 * （`listCoverageScanFilesAdmittedBy`）、本番の呼び出しはいずれも既定に従う。
 */
function findFiles(
  dir: string,
  pattern: RegExp,
  excludedDirectories: readonly string[] = SCAN_EXCLUDED_DIRECTORIES
): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 降りない名前は SCAN_EXCLUDED_DIRECTORIES が持つ（台帳が現況を測り直す）
      if (!excludedDirectories.includes(entry.name)) {
        results.push(...findFiles(fullPath, pattern, excludedDirectories));
      }
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * 被覆印の走査対象となるファイル名の型
 *
 * `extractTestCoverage` と、その母集団を測り直す自己検査の**唯一の出所**である。
 * 型を両側に書くと、片方だけが動いたときに「同じ母集団を歩いている」という前提が
 * 黙って崩れる。
 *
 * 選択肢が一つ落ちると、その拡張子のファイルが丸ごと数えられなくなり、被覆が静かに縮む。
 * 是正前（タスク 115.260）はこれが無言であった。自己検査
 * （`checkEveryScannedExtensionContributes`）が、選択肢のそれぞれについて
 * 「その選択肢だけが拾うファイルが在る」ことと「落とすと被覆集合が真に縮む」ことを課す。
 *
 * **`spec\.ts` はここに置かない。** 従前は `/\.(ts|tsx|spec\.ts)$/` だったが、
 * `spec\.ts` は `ts` に包含される死んだ選言であった——正規の照合は末尾一致であり、
 * `foo.spec.ts` は `/\.ts$/` にも掛かる。落としても走査対象は 1729 件のまま動かず、
 * ゲートの出力も 38167 バイトのまま一字も動かなかった（コミット `d1bb8464`、
 * 2026-09-04 にリポジトリルートで実測）。**包含は正規表現の代数の帰結であり、
 * リポジトリの木がどう変わっても覆らない**ため、記録して残すのではなく撤去した。
 * 撤去後は、上記の自己検査が「単独では一件も拾わない選択肢」を赤くするため、
 * 同じ形の選言が戻ってきた時点で機械が落とす。
 */
export const COVERAGE_FILE_PATTERN = /\.(ts|tsx)$/;

/**
 * 被覆印の走査対象となるファイルの一覧（`extractTestCoverage` と同一の母集団）
 *
 * 自己検査が実データへ変異を当てて母集団を測り直すために要る。走査規則（除外する
 * ディレクトリ・ファイル名の型）を自己検査の側へ複製しないため、ここから配る。
 */
export function listCoverageScanFiles(dirs: readonly string[] = CODE_DIRS): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    files.push(...findFiles(dir, COVERAGE_FILE_PATTERN));
  }
  return files;
}

/**
 * ある除外ディレクトリ名を外したときに新たに走査対象へ入るファイル
 *
 * 除外の側は「外すと母集団が広がる」向きの選別であり、根や拡張子と違って
 * 「落とすと縮む」では測れない。自己検査が台帳の分類（現に効いているか否か）を
 * 実データで測り直すために要る。**走査規則を自己検査の側へ複製しないため、ここから配る。**
 */
export function listCoverageScanFilesAdmittedBy(
  excludedDirectory: string,
  dirs: readonly string[] = CODE_DIRS
): string[] {
  const baseline = new Set(listCoverageScanFiles(dirs));
  const relaxed = SCAN_EXCLUDED_DIRECTORIES.filter((name) => name !== excludedDirectory);
  const admitted: string[] = [];
  for (const dir of dirs) {
    for (const file of findFiles(dir, COVERAGE_FILE_PATTERN, relaxed)) {
      if (!baseline.has(file)) admitted.push(file);
    }
  }
  return admitted;
}

/**
 * .kiro/specs/配下の機能を自動検出
 *
 * **探索の規則そのものは持たない。** scripts/requirement-document.ts の
 * discoverFeatureNames が唯一の担い手であり、ここは根の与え方（cwd 相対）と、
 * スペックディレクトリが無いときに検査を止める方針だけを持つ。除外定義の検査
 * （scripts/check-requirement-exclusions.ts の discoverFeatureNames）も同じ担い手を使う。
 * 両者が別々に規則を持つと、被覆率が分母に載せる機能と除外が指す機能がずれる。
 *
 * 不在時に空配列で続行しない（AI運用7原則 第3原則）。機能が一件も無い状態で被覆率を
 * 算出すると、分母 0 の 100% が緑として出てしまう。
 */
export function discoverFeatures(): string[] {
  if (!fs.existsSync(SPEC_DIR)) {
    console.error(`エラー: スペックディレクトリが見つかりません: ${SPEC_DIR}`);
    process.exit(1);
  }

  return discoverFeatureNames('.');
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
 * 受入基準が要件定義書上で無効化（撤廃・移管）されているか
 *
 * 判定の実体は scripts/requirement-document.ts にある。ここでは既存の呼び手のために
 * 再輸出するだけである（規則の複製を作らない）。
 */
export { isRetiredCriterionText };

/**
 * 要件定義書から要件IDと受入基準を抽出
 *
 * パターン:
 *   - ### 要件N: タイトル → REQ-N
 *   - ### 要件NA: タイトル → REQ-NA
 *   - ### Requirement N: タイトル → REQ-N (英語形式)
 *   - 番号付きリスト（1. 2. 3. ...）→ 受入基準
 *
 * **切り出しの規則そのものは持たない。** scripts/requirement-document.ts の
 * scanRequirementsDocument が唯一の担い手であり、ここは読み取った結果を
 * 本スクリプトの型（Requirement / AcceptanceCriteria）へ移し替えるだけである。
 * 除外定義の検査（scripts/check-requirement-exclusions.ts の loadRequirementCatalogue）も
 * 同じ担い手を使う。両者が別々に規則を持つと、被覆率が数える単位と除外が指す単位がずれる。
 */
export function extractRequirements(featureName: string, filePath: string): Requirement[] {
  if (!fs.existsSync(filePath)) {
    console.error(`エラー: 要件定義書が見つかりません: ${filePath}`);
    return [];
  }

  const scanned = scanRequirementsDocument(fs.readFileSync(filePath, 'utf-8'), filePath);

  return scanned.map((requirement) => {
    const toCriterion = (criterion: ScannedCriterion): AcceptanceCriteria => ({
      id: `${featureName}/${requirement.id}.${criterion.number}`,
      featureName,
      requirementId: requirement.id,
      fullRequirementId: `${featureName}/${requirement.id}`,
      number: criterion.number,
      text: criterion.text,
      line: criterion.line,
    });
    return {
      id: requirement.id,
      fullId: `${featureName}/${requirement.id}`,
      featureName,
      title: requirement.title,
      line: requirement.line,
      acceptanceCriteria: requirement.criteria.map(toCriterion),
      retiredAcceptanceCriteria: requirement.retiredCriteria.map(toCriterion),
      letteredCriterionNumbers: requirement.letteredCriterionNumbers,
    };
  });
}

/**
 * 全機能の要件を抽出
 */
export function extractAllFeatures(featureNames: string[]): Feature[] {
  const features: Feature[] = [];

  for (const featureName of featureNames) {
    const requirementsPath = requirementsDocumentPath('.', featureName);
    const requirements = extractRequirements(featureName, requirementsPath);

    // 受入基準がすべて撤廃された要件（現役 0 件かつ撤廃 1 件以上）は要件ごと分母から外す。
    // 「受入基準を一つも持たない」だけでは外さない。撤廃された事実が要件定義書に
    // 書かれていることを条件にし、書式の崩れで要件が黙って消えることを防ぐ。
    const liveRequirements: Requirement[] = [];
    const retiredRequirements: Requirement[] = [];
    for (const req of requirements) {
      if (req.acceptanceCriteria.length === 0 && req.retiredAcceptanceCriteria.length > 0) {
        retiredRequirements.push(req);
      } else {
        liveRequirements.push(req);
      }
    }

    let totalAc = 0;
    let retiredAc = 0;
    for (const req of requirements) {
      totalAc += req.acceptanceCriteria.length;
      retiredAc += req.retiredAcceptanceCriteria.length;
    }

    features.push({
      name: featureName,
      path: requirementsPath,
      requirements: liveRequirements,
      totalAcceptanceCriteria: totalAc,
      retiredAcceptanceCriteriaCount: retiredAc,
      retiredRequirements,
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

/**
 * ヘッダー直下の一覧の各項目（`- REQ-N.M:` / `- REQ-N-REQ-M:`）
 *
 * 印は `-` か `*` である。`*` を印に含めるのは Markdown の箇条書きに倣うためだが、
 * **JSDoc の行頭 `*` と字面が同じである**ため、一致だけでは区別が付かない。
 * 区別は `isCommentSyntaxAsterisk` が担う（後段で一致ごとに除く）。
 */
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
export const ANY_COVERAGE_HEADER_REGEX = /Requirements\s*(?:coverage\s*)?\([A-Za-z0-9_-]+\):/g;

/** パターン4のヘッダー（既知の機能名のみ）を組み立てる */
function buildHeaderRegex(featureNames: readonly string[]): RegExp {
  return new RegExp(`Requirements\\s*(?:coverage\\s*)?\\((${featureNames.join('|')})\\):`, 'g');
}

/**
 * 行頭のコメント記号と空白（`/**` / `/*` / `*` / `//`）
 *
 * 読み飛ばす対象は `findListItemMarker` が一覧の印について読み飛ばすものと同じである。
 * コメント記号は文章の一部ではなく、行の中身が始まる前の飾りだからである。
 */
const LINE_LEADING_COMMENT_SYNTAX_REGEX = /^[ \t]*(?:\/\*+|\*|\/\/)?[ \t]*/;

/** ヘッダーが宣言として置かれた位置にあるか（行の中身の先頭であるか） */
const DECLARATION_PREFIX_REGEX = /^[ \t]*(?:\/\*+|\*|\/\/)?[ \t]*$/;

/**
 * コードフェンスの区切り行か（コメント記号を読み飛ばした先が ``` で始まるか）
 *
 * **行の中身の先頭でしか見ない。** 見本を行の途中で開く形（` * 例: ```ts `）は開きとしても
 * 閉じとしても数えない。この形の直後の行に行頭でヘッダーの字面が置かれると、
 * `isDeclaredCoverageHeader` の二条件のどちらにも掛からず宣言と読まれる（引用の取りこぼし。
 * 向きは過大帰属）。塞いでいないのは、行の途中のバッククォートを見本の開きと読む規則が
 * 逆向きの取りこぼし——正当なヘッダーを引用と誤読して落とす過小帰属——を新たに作るためである。
 *
 * **この抜けが実データで発火していないことは、散文でなく機械が毎回測る。** 走査根
 * （`listCoverageScanFiles` が既定で読む `CODE_DIRS`）の中に「行の途中に ``` を持つ行」と
 * 「`ANY_COVERAGE_HEADER_REGEX` が拾う字面」を**同じファイルで**併せ持つものが在れば、
 * 自己検査 `check-requirement-coverage.selftest.ts` の
 * `checkMidLineFenceFilesCarryNoCoverageHeader` が赤くなる。**ここに出現の数を書かない**
 * ——散文へ写せばその走査の二重帳簿になり、写した時点から陳腐化する（タスク 115.254 が
 * 同じファイルの他の三箇所で確立した作法。ここが挙げていた数は、タスク 115.307 が
 * 測り直した時点ではなお真であったが、いま真である計数も等しく時限装置である）。
 * 本記述が実データの名指しと計数を持たないことは、同ファイルの
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 *
 * @param line 当該行の本文（改行を含まない）
 */
export function isCodeFenceDelimiterLine(line: string): boolean {
  return /^`{3,}/.test(line.replace(LINE_LEADING_COMMENT_SYNTAX_REGEX, ''));
}

/**
 * ヘッダーが属するコメントの塊の先頭位置を返す（フェンスの開閉を数える範囲）
 *
 * 塊は次のいずれかである。
 *
 *   1. ヘッダーを囲むブロックコメント（直前の `/*` から。終端がヘッダーより後ろにある場合のみ）
 *   2. ヘッダーの直前に連なる行コメント（`//` の連なりの先頭から）
 *
 * どちらでもないならヘッダーの行の先頭を返す（塊の外にフェンスは無いものとして扱う）。
 *
 * **終端の無い `/*` は塊の開きと読まない（タスク 115.259）。** 直前の `/*` に対応する
 * 終端（`*` と `/` の並び）が本文のどこにも無いなら、その `/*` は文字列リテラルや
 * 正規表現リテラルの中にある——終端の無いブロックコメントは TypeScript の構文誤りであり、
 * 走査対象は型検査を通ったファイルだからである。これを塊の始まりと読むと、コメントですら
 * ない行のフェンスまで数えられ、**正当なヘッダーが沈黙のうちに落ちる**
 * （`const OPENER = '/*';` の後ろに行コメントでフェンス・空行・ヘッダー・一覧項目を
 * 置いた形が、まさにそう読まれていた）。対応する終端を持たないときは行コメントの連なりの
 * 走査へ落とす。同じ曖昧さに対して null（安全側）を返す兄弟の `enclosingBlockCommentEnd`
 * と、これで向きが揃う。
 *
 * この形は実データに無い。是正の時点——コミット `4c70e20c`、2026-09-03 に実測——で
 * 走査根 `CODE_DIRS` のヘッダー 390 件の内訳は「塊の中 379 / 行コメントの連なり 11 /
 * 裸 0 / 終端の無い開き 0」であり、是正の前後で `npm run check:req-coverage` の出力は
 * 一字も動かなかった。**是正が実データを動かさないことは、この一点の観測にしか拠って
 * いない。** 形そのものを機械で固定するのは自己検査の
 * `checkUnterminatedBlockOpenDoesNotSwallowHeader` である。
 *
 * **なぜ全文で数えないか。** フェンスの開閉を全文の偶奇で数えると、塊の外にある閉じ忘れの
 * フェンス一つが、それ以降の**すべての**ヘッダーを宣言でないと判定させる。落ちる先は
 * 帰属の側と切れ目の側の両方であり、被覆の無言の過小計上と、切れ目を失った区間の
 * 過大帰属を同時に生む。数える範囲を塊へ閉じ込めれば、この依存は規則としてでなく
 * **構造として**消える（塊の外のフェンスは読まれない）。
 */
function enclosingCommentBlockStart(content: string, lineStart: number): number {
  const blockOpen = content.lastIndexOf('/*', lineStart);
  if (blockOpen >= 0) {
    const blockClose = content.indexOf('*/', blockOpen + 2);
    if (blockClose >= lineStart) return blockOpen;
  }

  let start = lineStart;
  while (start > 0) {
    const previousStart = content.lastIndexOf('\n', start - 2) + 1;
    if (!/^[ \t]*\/\//.test(content.slice(previousStart, start - 1))) break;
    start = previousStart;
  }
  return start;
}

/**
 * ヘッダーの字面が**宣言**であって**引用**ではないことを判定する（タスク 115.226）
 *
 * ヘッダーの字面は散文の中で引用されうる。「従前はこの記述を
 * `Requirements (feature-name):` の見出しの下に置いていた」のように、
 * **過去の書き方を説明するため**に字面を引く記述が実データに在る。これを宣言と読むと、
 * 幻のヘッダーが母集団に混ざり、その配下の散文が被覆印として拾われうる。
 * 115.194 が一覧項目の側で塞いだ「字面と意味の取り違え」の、ヘッダー側の同型である。
 *
 * 宣言と認める条件は次の二つを**両方**満たすことである。
 *
 * 1. **行の中身の先頭にある。** 行頭からヘッダーまでが空白とコメント記号だけで出来ている。
 *    散文の途中に現れる字面（`従前はこの記述を \`Requirements …\` の…`）は宣言ではない。
 *    バッククォートはコメント記号ではないため、行頭に置かれた引用（`` * `Requirements …` ``）も
 *    この条件で落ちる。
 * 2. **コードフェンスの内側にない。** フェンスで囲った見本の中の字面は、行の中身の先頭に
 *    あっても引用である。条件 1 だけでは覆えないため独立に見る。
 *
 * 二つは互いを覆わない。`isCodeFenceDelimiterLine` の走査だけを外すと自己検査の確認が
 * 3 件落ち、`DECLARATION_PREFIX_REGEX` の判定だけを外しても同じく 3 件落ちる
 * （落ちる中身は前者がフェンスの内側の一件、後者がバッククォートの二件で別物である）。
 * いずれも 2026-09-06 に `npm run check:req-coverage:selftest` で測り直した。
 * **確認の総数は書かない**——総数は確認を足すたびに動くのに対し、ここで意味を持つのは
 * 落ちる件数の側だからである（タスク 115.307 が測り直した時点で、従前に書かれていた
 * 総数は既に古かった）。
 *
 * 二つの条件が**引用のすべてを覆うわけではない**。見本を行の途中で開く形は
 * どちらにも掛からない（抜けの中身と、実データで発火していないことを誰が測るかは
 * `isCodeFenceDelimiterLine` に書いた）。
 *
 * **フェンスの開閉はヘッダーが属するコメントの塊の中だけで数える**
 * （`enclosingCommentBlockStart`）。全文で数えると、無関係な塊にある閉じ忘れのフェンス一つが
 * それ以降のヘッダーをすべて落とし、帰属（`extractHeaderScopedCoverage` のヘッダー収集）と
 * 切れ目（同じく境界収集）の両方から無言で消す。範囲を塊へ閉じ込めることでこの依存は
 * 構造として消える。走査の起点を `enclosingCommentBlockStart(content, lineStart)` から `0`
 * （全文）へ戻すと、`checkQuotedHeaderIsNotDetected` と
 * `checkUnterminatedBlockOpenDoesNotSwallowHeader` の 2 件が赤くなる（前者は
 * 「閉じ忘れのフェンスを別の塊に持つ写しで site-survey/REQ-3.1 を取りこぼした」を挙げる。
 * 2026-09-06 に `npm run check:req-coverage:selftest` で測り直した。従前は落ちるのが
 * 1 件だと書かれていたが、タスク 115.307 の再実測では 2 件であった）。
 *
 * @param content ファイル全体の本文
 * @param headerIndex 当該ヘッダーの開始位置
 */
export function isDeclaredCoverageHeader(content: string, headerIndex: number): boolean {
  const lineStart = content.lastIndexOf('\n', headerIndex - 1) + 1;
  if (!DECLARATION_PREFIX_REGEX.test(content.slice(lineStart, headerIndex))) return false;

  let insideFence = false;
  const blockStart = enclosingCommentBlockStart(content, lineStart);
  for (const line of content.slice(blockStart, lineStart).split('\n')) {
    if (isCodeFenceDelimiterLine(line)) insideFence = !insideFence;
  }
  return !insideFence;
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
 * 4 は 3 の JSDoc 版である。4 が実データで帰属を減らすのは、**一覧の直後に置かれた散文**
 * ——「この受入基準は検証していない」「他の手段へ委譲する」と述べる文——に現れる番号と、
 * 同じ番号を別の被覆源（`@requirement` 形式など）が拾うため集計を動かさない番号である。
 *
 * **ここに具体の番号・件数を実例として書かない。** 実データは動くため、説明文へ写した実例は
 * 写した時点から陳腐化し始め、陳腐化しても機械は何も言わない（タスク 115.223 の起票理由。
 * かつてここが挙げていた二つの番号は、いずれも挙げた当時の状態を失っていた）。
 * 実データの名指しは自己検査 `check-requirement-coverage.selftest.ts` の
 * `REAL_FALSE_CLAIMS_AFTER_PARAGRAPH_BREAK` が一元に持ち、実在と非空振りの双方を機械で
 * 確かめている。増減はそちらへ反映すること。本 JSDoc が実例を持たないことは、同自己検査の
 * `checkExtractorDocCitesNoPerishableExample` が守る。
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
 * 一致した印の `*` が「行頭のコメント記号」かどうかを判定する
 *
 * 一覧の印は `[-*]` だが、JSDoc / ブロックコメントの行は例外なく行頭が `*` である。
 * そのため ` * REQ-16.7 は検証していない` のような**散文**や、
 * ` *   REQ-19.1〜19.4 を無条件に検証する。` のような**一覧項目の継続行**まで
 * 「`*` で始まる一覧項目」と読めてしまい、被覆印として拾われていた（過大帰属）。
 *
 * 判定は「その `*` が行の最初の非空白文字か」だけで決まる。
 * `/*` や `/**` の一部である `*` も同じくコメント記号なので、
 * 直前に連なる `*` と `/` を読み飛ばしてから行頭かどうかを見る。
 *
 * **一覧の印としての `*` は失われない。** 行頭のコメント記号より後ろに置かれた
 * ` * * REQ-1.1:`（JSDoc の中の Markdown 箇条書き）や `// * REQ-1.1:` の `*` は
 * 行の最初の非空白文字ではないため、これまでどおり印として拾われる。
 *
 * **継続行は印として拾わない。** 継続行には印が無く、継続行を拾う規則は
 * 「印の無い行の REQ- も拾う」ことと同義であって、散文と一覧項目を再び混同させる。
 * 一項目につき一つの印を必須とすることで、一覧の書式を一意に保つ。
 *
 * 一項目が**複数の番号を並べる**こと自体は妨げない。並びは印ではなく識別子欄の側で読む
 * （`parseHeaderListItemIds`）。印の要求はここで変えない。
 *
 * @param content ファイル全体の本文
 * @param markerIndex 印の文字の位置（`content` 上の絶対位置）
 */
export function isCommentSyntaxAsterisk(content: string, markerIndex: number): boolean {
  if (content[markerIndex] !== '*') return false;

  let index = markerIndex - 1;
  while (index >= 0 && content[index] === '*') index--;
  if (index >= 0 && content[index] === '/') index--;
  while (index >= 0 && (content[index] === ' ' || content[index] === '\t')) index--;

  return index < 0 || content[index] === '\n';
}

/**
 * 一覧項目の識別子欄の文法
 *
 * 識別子欄とは、一覧の印の直後から**その行の最初のコロンまで**（コロンが無ければ行末まで）を指す。
 * ここが識別子の並びだけで出来ている場合に限り、並びの全項目を被覆印として読む。
 *
 * 是正前の規則は一項目につき一致が一つで、しかも `REQ-` の接頭辞を必須にしていたため、
 * 実データの `- REQ-12.1, 12.2, 12.3:` は **12.1 しか拾われず**、
 * `- 13.1, 13.2, 13.3, 13.4:`（接頭辞なし）は**一件も拾われなかった**（被覆の過小帰属）。
 *
 * **散文まで読まないための歯止めが「並びだけで出来ている」の要求である。**
 * `- 文字数制限（名称200文字、規格500文字）:` のように数値を含む散文は、
 * 識別子以外の文字が混じるため識別子欄と認めない。したがって 200 / 500 を番号と読み違えない。
 *
 * **据え置く書式**（本規則は意図して拾わない。読み落としではない）:
 *
 * - 範囲（`REQ-1.1〜1.6` / `REQ-1-REQ-5`）は**並びではない**ため、先頭の識別子だけを読む。
 *   区間内の番号を勝手に展開すると、書かれていない被覆を主張することになる。
 *   従来どおり `HEADER_LIST_ITEM_REGEX` が要件番号の範囲（`REQ-N-REQ-M`）の両端を記録する。
 * - スラッシュ区切りの並び（`- 7.7 / 8.7 / 9.7:`）は識別子欄と認めない。
 *   区切り記号を増やすほど散文との境目が曖昧になるため、読点（`,` / `、`）に限る。
 *   拾いたい記述は読点区切りへ書き換えれば読まれる。
 */
const ID_LIST_ID_SOURCE = String.raw`(?:REQ-)?\d+[A-E]?(?:\.\d+)?`;
const ID_LIST_ITEM_SOURCE = String.raw`${ID_LIST_ID_SOURCE}(?:[ \t]*[-–—〜～][ \t]*${ID_LIST_ID_SOURCE})?`;
const ID_LIST_REGION_REGEX = new RegExp(
  String.raw`^[ \t]*${ID_LIST_ITEM_SOURCE}(?:[ \t]*[,、][ \t]*${ID_LIST_ITEM_SOURCE})*[ \t]*$`
);
const ID_LIST_HEAD_REGEX = new RegExp(String.raw`^[ \t]*(?:REQ-)?(\d+[A-E]?)(?:\.(\d+))?`);

/** 識別子欄から読み取った一項目 */
export interface HeaderListItemId {
  /** 要件番号（`12` / `12A`） */
  requirement: string;
  /** 受入基準の枝番（無ければ null） */
  criterion: string | null;
}

/**
 * 一覧項目の識別子欄を読み、並びの全項目を返す
 *
 * 識別子の並びだけで出来ていない欄（散文が混じる欄）では**空を返す**。
 * その場合は従来どおり `HEADER_LIST_ITEM_REGEX` の一致だけが被覆印になる。
 *
 * @param idRegion 印の直後から最初のコロンまで（コロンが無ければ行末まで）
 */
export function parseHeaderListItemIds(idRegion: string): HeaderListItemId[] {
  if (!ID_LIST_REGION_REGEX.test(idRegion)) return [];

  const ids: HeaderListItemId[] = [];
  for (const part of idRegion.split(/[,、]/)) {
    const head = ID_LIST_HEAD_REGEX.exec(part);
    if (!head || !head[1]) continue;
    ids.push({ requirement: head[1], criterion: head[2] ?? null });
  }
  return ids;
}

/**
 * 行の中の一覧の印の位置を返す（印が無ければ null）
 *
 * 印は行の**最初の非空白文字**でなければならない。ただしコメント記号は印ではないため
 * 読み飛ばす。読み飛ばすのは次の二つだけである。
 *
 * - JSDoc / ブロックコメントの行頭 `*`（判定は `isCommentSyntaxAsterisk`）
 * - 行コメントの開始記号 `//`
 *
 * `//` を読み飛ばさないと、行の最初の非空白文字が `/` であるという理由だけで
 * `// - 49.1: …` のような**正当な一覧項目の識別子欄が一切読まれない**。
 * 実データでは `frontend/src/domain/estimate/estimateEditReducer.test.ts` の
 * `// Requirements (estimate-creation):` 配下がそれに当たり、過小帰属が残っていた。
 *
 * 読み飛ばすのは `//` の二文字だけで、`/**` は二文字目が `*` なので対象外である
 * （ブロックコメントの開始記号は従来どおり印にならない）。
 * `// * REQ-9.2:` の `*` は直前に `/` があるため `isCommentSyntaxAsterisk` が false を返し、
 * これまでどおり印として残る。
 *
 * **印を持たない行は一覧項目ではない。** 継続行（` *   REQ-19.1〜19.4 を…` /
 * `//   19.2, 19.3: …`）や散文（` * REQ-16.7 は検証していない`）を識別子欄として
 * 読まないための境界であり、115.194 が狭めた過大帰属をここでも壊さない。
 * `//` を読み飛ばした先の最初の非空白文字が `-` / `*` でなければ、従来どおり印なしである。
 *
 * @param content ファイル全体の本文
 * @param lineStart 当該行の先頭の絶対位置
 * @param line 当該行の本文（改行を含まない）
 */
export function findListItemMarker(
  content: string,
  lineStart: number,
  line: string
): number | null {
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === ' ' || char === '\t') continue;
    // 行コメントの開始記号は印ではない。二文字まとめて読み飛ばす（`/**` は対象外）
    if (char === '/' && line[index + 1] === '/') {
      index += 1;
      continue;
    }
    if (char === '*' && isCommentSyntaxAsterisk(content, lineStart + index)) continue;
    if (char === '-' || char === '*') return index;
    return null;
  }
  return null;
}

/**
 * ヘッダー区間の各行から、識別子欄の並びを読み取る
 *
 * `HEADER_LIST_ITEM_REGEX` の一致に**加える**だけで、取り除くことはしない。
 * 過大帰属の側の規則（行頭のコメント記号・継続行・区間の上限）は一切緩めない。
 *
 * @param content ファイル全体の本文
 * @param sectionStart 区間の先頭の絶対位置（ヘッダーの開始位置）
 * @param section 区間の本文
 */
function collectListItemIds(
  content: string,
  sectionStart: number,
  section: string
): HeaderListItemId[] {
  const ids: HeaderListItemId[] = [];
  let lineStart = sectionStart;

  for (const line of section.split('\n')) {
    const markerIndex = findListItemMarker(content, lineStart, line);
    lineStart += line.length + 1;
    if (markerIndex === null) continue;

    const afterMarker = line.slice(markerIndex + 1);
    const colonIndex = afterMarker.search(/[:：]/);
    const idRegion = colonIndex >= 0 ? afterMarker.slice(0, colonIndex) : afterMarker;
    ids.push(...parseHeaderListItemIds(idRegion));
  }

  return ids;
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

  // 引用された字面は宣言ではない（isDeclaredCoverageHeader）。帰属の側と切れ目の側の
  // 両方で除く。片方だけで除くと、幻のヘッダーが切れ目としてだけ生き残り、
  // 正当なヘッダーの区間を途中で断ち切る（過小帰属）。
  const headers: CoverageHeader[] = [];
  for (const match of content.matchAll(buildHeaderRegex(featureNames))) {
    if (match.index !== undefined && match[1] && isDeclaredCoverageHeader(content, match.index)) {
      headers.push({ index: match.index, featureName: match[1] });
    }
  }

  // 切れ目は機能名を問わず、あらゆるヘッダーの出現位置で決める
  const boundaries: number[] = [];
  for (const match of content.matchAll(ANY_COVERAGE_HEADER_REGEX)) {
    if (match.index !== undefined && isDeclaredCoverageHeader(content, match.index)) {
      boundaries.push(match.index);
    }
  }

  for (const header of headers) {
    const next = boundaries.find((index) => index > header.index);
    const sectionEnd = resolveHeaderSectionEnd(content, header.index, next ?? null);
    const section = content.slice(header.index, sectionEnd);

    HEADER_LIST_ITEM_REGEX.lastIndex = 0;
    let listMatch: RegExpExecArray | null;
    while ((listMatch = HEADER_LIST_ITEM_REGEX.exec(section)) !== null) {
      if (!listMatch[1]) continue;
      // 行頭のコメント記号を一覧の印と取り違えない（散文・継続行の過大帰属を防ぐ）
      if (isCommentSyntaxAsterisk(content, header.index + listMatch.index)) continue;
      requirements.add(`${header.featureName}/REQ-${listMatch[1]}`);
      if (listMatch[2]) {
        acceptanceCriteria.add(`${header.featureName}/REQ-${listMatch[1]}.${listMatch[2]}`);
      }
      // 範囲形式 (REQ-1-REQ-5) の処理
      if (listMatch[3]) {
        requirements.add(`${header.featureName}/REQ-${listMatch[3]}`);
      }
    }

    // 識別子欄を最後まで読む（読点で並べた続き・接頭辞を持たない並び。過小帰属の是正）
    for (const id of collectListItemIds(content, header.index, section)) {
      requirements.add(`${header.featureName}/REQ-${id.requirement}`);
      if (id.criterion) {
        acceptanceCriteria.add(`${header.featureName}/REQ-${id.requirement}.${id.criterion}`);
      }
    }
  }

  return {
    requirements: Array.from(requirements).sort(),
    acceptanceCriteria: Array.from(acceptanceCriteria).sort(),
  };
}

/**
 * 行内に直接書かれた被覆印（パターン1〜3）の正規表現を組み立てる
 *
 * 返す三つは順に「@requirement 形式」「括弧形式」「単独形式」で、
 * 捕捉群はいずれも 1=機能名 / 2=要件番号 / 3=受入基準の枝番（省略可）である。
 *
 * **被覆印の読み手が本ファイルだけではなくなったため、規則をここへ一本化する。**
 * 除外定義の検査（scripts/check-requirement-exclusions.ts）が「除外と被覆印の同居」を
 * 見るのに同じ規則を要する。両者が別々に正規表現を持つと、片方だけが読み落とす形が
 * 生まれ、同居の検査が静かに空振りする。
 */
export function buildInlineTagPatterns(featureNames: readonly string[]): [RegExp, RegExp, RegExp] {
  const featurePattern = featureNames.join('|');
  return [
    // パターン1: @requirement feature-name/REQ-N または @requirement feature-name/REQ-N.M
    new RegExp(`@requirement\\s+(${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?`, 'g'),
    // パターン2: (feature-name/REQ-N.M) - 括弧形式
    new RegExp(`\\((${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?\\)`, 'g'),
    // パターン3: feature-name/REQ-N - 単独形式
    new RegExp(`(?:^|[^/\\w])(${featurePattern})/REQ-(\\d+[A-E]?)(?:\\.(\\d+))?`, 'gm'),
  ];
}

/**
 * 一ファイルの本文から @requirement タグを抽出（走査規則の唯一の担い手）
 *
 * パターン:
 *   - @requirement feature-name/REQ-N
 *   - @requirement feature-name/REQ-N.M
 *   - feature-name/REQ-N
 *   - feature-name/REQ-N.M
 *   - (feature-name/REQ-N.M)
 *   - Requirements (feature-name):
 *   - Requirements coverage (feature-name):
 *
 * `extractTestCoverage` から切り出してある。**走査対象の選別（拡張子・除外ディレクトリ）を
 * 変えた世界を自己検査が測るには、ファイル一覧を自分で分けたうえで、抽出だけを本体と
 * 同じ規則で行う必要がある。**規則を自己検査の側へ複製すると、片方だけが動いたときに
 * 「同じ規則で読んでいる」という前提が黙って崩れる（`extractHeaderScopedCoverage` を
 * 切り出したのと同じ理由）。
 */
export function extractFileCoverage(
  content: string,
  featureNames: string[]
): { requirements: Set<string>; acceptanceCriteria: Set<string> } {
  const requirements = new Set<string>();
  const acceptanceCriteria = new Set<string>();

  const [regexAtReq, regexParen, regexStandalone] = buildInlineTagPatterns(featureNames);

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

  return { requirements, acceptanceCriteria };
}

/**
 * コードおよびテストファイルから @requirement タグを抽出
 *
 * 一ファイル分の抽出規則は `extractFileCoverage` が唯一の担い手であり、ここは母集団の
 * 与え方（走査根 → ファイル一覧）と、空でないものだけを積む形だけを持つ。
 *
 * 走査根 `dirs` は既定で `CODE_DIRS` である。`main()` は根を渡さない——渡せるようにすると、
 * 本番の走査根が定数と食い違ったまま自己検査だけが定数を見て緑になりうる。
 */
export function extractTestCoverage(
  featureNames: string[],
  dirs: readonly string[] = CODE_DIRS
): TestCoverage[] {
  const coverage: TestCoverage[] = [];

  for (const dir of dirs) {
    const testFiles = listCoverageScanFiles([dir]);

    for (const file of testFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const { requirements, acceptanceCriteria } = extractFileCoverage(content, featureNames);

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

/** 撤廃済みの受入基準を名乗っている被覆印 */
export interface RetiredCriterionMark {
  /** feature-name/REQ-N.M */
  id: string;
  /** 要件定義書での本文（取り消し線つきの墓標） */
  text: string;
  /** その番号を名乗っているファイル（リポジトリ相対、重複なし） */
  files: string[];
}

/**
 * 撤廃済みの受入基準を名乗っている被覆印を探す
 *
 * 抽出の側で取り消し線を落としただけでは、分子・分母の水増しは止まるが、
 * **番号だけが残った墓標を名乗り続ける被覆印**はリポジトリに残る。読み手には
 * 「この検証は当該の条文を確かめている」と見えるのに、その条文はもう無い。
 * 撤廃の多くは別要件への移管であり、移管先の番号こそが名乗るべき番号である。
 *
 * この検査が捕まえないもの（限界を両方向で述べる）:
 *   - 要件定義書に**存在しない**番号（撤廃ですらない番号違い）は挙げない。
 *     本検査の対象は「取り消し線で無効化された受入基準」に限る。そのような番号は別に在るが、
 *     成り立ちが異なるため別途扱う。
 *   - 移管先の番号を名乗り直したとき、その検証が移管先の条文を実際に
 *     確かめているかは見ない。名乗りの一致までである。
 *
 * **ここに「別に在る番号」の数を書かない。** 現況は collectOutOfDenominatorMarks の `unknown` が
 * 一元に持ち、検査本体が「要件定義書に存在しない番号」の行として全件の列挙つきで毎回印字する。
 * 散文へ写せばその出力の二重帳簿になり、写した時点から陳腐化する（タスク 115.254 が
 * 同じファイルの他の三箇所で確立した作法。ここが挙げていた数は、タスク 115.307 が
 * 測り直した時点で既に実データと食い違っていた）。本記述が実データの名指しと計数を
 * 持たないことは、自己検査 `check-requirement-coverage.selftest.ts` の
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export function findRetiredCriterionCoverageMarks(
  features: readonly Feature[],
  testCoverage: readonly TestCoverage[]
): RetiredCriterionMark[] {
  const retired = new Map<string, string>();
  for (const feature of features) {
    for (const requirement of [...feature.requirements, ...feature.retiredRequirements]) {
      for (const criterion of requirement.retiredAcceptanceCriteria) {
        retired.set(criterion.id, criterion.text);
      }
    }
  }
  if (retired.size === 0) return [];

  const files = new Map<string, Set<string>>();
  for (const coverage of testCoverage) {
    for (const id of coverage.acceptanceCriteria) {
      if (!retired.has(id)) continue;
      let holders = files.get(id);
      if (!holders) {
        holders = new Set<string>();
        files.set(id, holders);
      }
      holders.add(coverage.file);
    }
  }

  return [...files.entries()]
    .map(([id, holders]) => ({
      id,
      text: retired.get(id) ?? '',
      files: [...holders].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ============================================================================
// 被覆印の指し先（名乗る受入基準が実在し、内容が対応するか）
// ============================================================================
//
// 撤廃済みの番号を名乗る被覆印は findRetiredCriterionCoverageMarks が挙げる。
// ここで扱うのは、それとは**成り立ちの違う**二つの形である。
//
//   (i)  指し先が存在しない: 要件定義書のどこにも無い番号を名乗る
//   (ii) 指し先は存在するが内容が対応しない: 番号は実在するが、その検証が述べる内容が
//        原文と食い違う
//
// (i) は機械で判定できる。(ii) は散文どうしの照合であり一般には機械化できないが、
// **対応の担い手を散文から原文の逐語複製へ移せている箇所に限れば**判定できる。
// リポジトリの被覆印の多くは、印のすぐ隣に受入基準の原文を写した一行を持つ。
// 写しがあるなら、写した条文こそがその区間の名乗るべき条文である。

/**
 * 存在しない番号を名乗る被覆印について、本スクリプトが失敗させる範囲
 *
 * **逐語複製の検査はこの根を使わない。**そちらは `CODE_DIRS`（`backend/src` /
 * `frontend/src` / `e2e`）の全体を読む（タスク 115.256）。両者を同じ根で括ると、
 * 片方を広げたときにもう片方が黙って一緒に動く。
 */
export const E2E_SPECS_ROOT = 'e2e/specs';

/** 被覆印が名乗る受入基準が、要件定義書のどこにも無い */
export interface UnknownCriterionMark {
  /** feature-name/REQ-N.M */
  id: string;
  /** その番号を名乗っているファイル（リポジトリ相対、重複なし） */
  files: string[];
  /** その要件そのものが要件定義書に無いか（要件はあるが受入基準の番号が無い場合は false） */
  requirementMissing: boolean;
}

/** 分母に無い番号を名乗る被覆印の内訳（成り立ちの軸で分ける） */
export interface OutOfDenominatorMarks {
  /** 取り消し線で撤廃された受入基準を名乗る（findRetiredCriterionCoverageMarks と同じ母集団） */
  retired: string[];
  /** `1a.` `4b.` 形式で書かれ、抽出規則が分母に入れていない受入基準を名乗る */
  lettered: string[];
  /** 要件定義書のどこにも無い番号を名乗る */
  unknown: string[];
}

interface CriterionIndex {
  /**
   * 分母に入っている受入基準
   *
   * **分子を数えるときの分母（calculateCoverage の `allAcceptanceCriteria`）と同一でなければならない。**
   * 分子は分母との積で数えるため、ここが分母より広いと、その差に落ちた被覆印は
   * 集計から外れながらどの報告枠にも出ず、幻の番号が黙って消える。
   * 分母は `Feature.requirements` の受入基準であり、`retiredRequirements` は含まない。
   */
  live: Set<string>;
  /** 取り消し線で撤廃された受入基準 */
  retired: Set<string>;
  /** `1a.` 形式のため分母に入っていないが、要件定義書に本文がある受入基準 */
  lettered: Set<string>;
  /** 現役・撤廃を問わず実在する要件 */
  requirements: Set<string>;
}

function buildCriterionIndex(features: readonly Feature[]): CriterionIndex {
  const live = new Set<string>();
  const retired = new Set<string>();
  const lettered = new Set<string>();
  const requirements = new Set<string>();
  for (const feature of features) {
    // 分母は現役の要件の受入基準に限る。分子を数えるときの母集団と同じ経路から作る。
    for (const requirement of feature.requirements) {
      for (const criterion of requirement.acceptanceCriteria) live.add(criterion.id);
    }
    // 「実在するが分母に入っていない」ことを言うための索引は、撤廃済みの要件も見る。
    for (const requirement of [...feature.requirements, ...feature.retiredRequirements]) {
      requirements.add(requirement.fullId);
      for (const criterion of requirement.retiredAcceptanceCriteria) retired.add(criterion.id);
      for (const number of requirement.letteredCriterionNumbers) {
        lettered.add(`${requirement.fullId}.${number}`);
      }
    }
  }
  return { live, retired, lettered, requirements };
}

/**
 * 分母に無い受入基準番号を名乗る被覆印を、成り立ちごとに数える
 *
 * 走査対象は被覆率が読む全ての根（backend/src・frontend/src・e2e）である。
 * **件数は 0 件でも無条件に出力する。**黙って合う分子は、水増しと同じだけ危うい。
 */
export function collectOutOfDenominatorMarks(
  features: readonly Feature[],
  testCoverage: readonly TestCoverage[]
): OutOfDenominatorMarks {
  const index = buildCriterionIndex(features);
  const retired = new Set<string>();
  const lettered = new Set<string>();
  const unknown = new Set<string>();
  for (const coverage of testCoverage) {
    for (const id of coverage.acceptanceCriteria) {
      if (index.live.has(id)) continue;
      if (index.retired.has(id)) retired.add(id);
      else if (index.lettered.has(id)) lettered.add(id);
      else unknown.add(id);
    }
  }
  return {
    retired: [...retired].sort(),
    lettered: [...lettered].sort(),
    unknown: [...unknown].sort(),
  };
}

/**
 * 要件定義書に存在しない受入基準番号を名乗る被覆印を挙げる
 *
 * 直し方は「番号を名乗り直す」か「被覆印を取り下げる」であり、除外の追加ではない。
 * 除外は「E2Eでは確かめないが代わりにこう確かめる」という約束であって、
 * 指し先の無い番号には約束の相手がいない（115.187 が撤廃済みについて確立した判断と同じ）。
 *
 * この検査が捕まえないもの（限界を両方向で述べる）:
 *   - 走査対象は `e2e/specs` に限る。`frontend/src` / `backend/src` の被覆印は挙げない。
 *     分子への混入は collectOutOfDenominatorMarks が数え、被覆率の計算からは除いてあるため
 *     指標は水増しされないが、印そのものは残る。
 *   - 取り消し線で撤廃された番号は挙げない（findRetiredCriterionCoverageMarks の担当）。
 *     直し方が「移管先の番号を名乗り直す」に定まる点で成り立ちが違うため、混ぜない。
 *   - `1a.` `4b.` 形式で書かれた受入基準の基底番号は挙げない。要件定義書に本文があり、
 *     抽出規則が分母へ入れていないだけだからである。
 *   - 番号が実在することだけを見る。その検証が当該の条文を確かめているかは見ない
 *     （そちらは findCriterionTextCopyMismatches が、逐語複製がある区間に限って見る）。
 *
 * **ここに走査根の外に残る番号を実例として書かない。** 現況は collectOutOfDenominatorMarks の
 * `unknown` が一元に持ち、検査本体が「要件定義書に存在しない番号」の行として件数と全件の
 * 列挙つきで、続けて「うち走査根の配下にあり本スクリプトが失敗させるもの」の件数とともに
 * 毎回印字する。散文へ写せばその出力の二重帳簿になり、写した時点から陳腐化する
 * （タスク 115.254。ここが挙げていた列挙は測り直した時点でもなお真であったが、
 * いま真である実例も等しく時限装置である）。本記述が実データの名指しと計数を持たないことは、
 * 自己検査 `check-requirement-coverage.selftest.ts` の
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export function findUnknownCriterionCoverageMarks(
  features: readonly Feature[],
  testCoverage: readonly TestCoverage[],
  scanRoot: string = E2E_SPECS_ROOT
): UnknownCriterionMark[] {
  const index = buildCriterionIndex(features);
  const files = new Map<string, Set<string>>();
  for (const coverage of testCoverage) {
    if (!toPosixPath(coverage.file).startsWith(`${scanRoot}/`)) continue;
    for (const id of coverage.acceptanceCriteria) {
      if (index.live.has(id) || index.retired.has(id) || index.lettered.has(id)) continue;
      let holders = files.get(id);
      if (!holders) {
        holders = new Set<string>();
        files.set(id, holders);
      }
      holders.add(toPosixPath(coverage.file));
    }
  }
  return [...files.entries()]
    .map(([id, holders]) => ({
      id,
      files: [...holders].sort(),
      requirementMissing: !index.requirements.has(id.slice(0, id.lastIndexOf('.'))),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 逐語複製として使える語句の最小長
 *
 * 短い語句（「バリデーションエラーを表示する」など）は複数の条文に等しく当てはまり、
 * 逐語複製の証拠にならない。この値を下回る長さまで許すと、条文を名指さない偶然の一致が
 * 食い違いとして混じる。12 文字以上かつ「同一機能の他の条文の本文に現れない」語句だけを、
 * 当該条文を名指す複製として扱う。
 *
 * **ここに「混じる偶然の一致」の数を書かない。** その数は reportCriterionTextCopies が返す
 * `mismatches` そのものであり、検査本体が「原文を逐語複製しながらその条文を名乗っていない
 * 被覆印」の行として毎回印字する。**値を下げれば同じ行が動く**——散文へ写せばその出力の
 * 二重帳簿になり、写した時点から陳腐化する（タスク 115.254 が同じファイルの他の三箇所で
 * 確立した作法。ここが挙げていた数は、タスク 115.307 が閾値を下げる変異で測り直した時点で
 * 既に実データと食い違っていた）。値そのものと境界の挙動は自己検査
 * `check-requirement-coverage.selftest.ts` の `checkCriterionQuote` が字面で固定し、
 * 本記述が実データの名指しと計数を持たないことは同ファイルの
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export const MIN_CRITERION_QUOTE_LENGTH = 12;

/** 受入基準の原文のうち、逐語複製の目印として使う部分（`shall` 以降） */
export function criterionQuote(text: string): string | null {
  const index = text.lastIndexOf('shall ');
  if (index < 0) return null;
  const quote = text.slice(index + 'shall '.length).trim();
  return quote.length >= MIN_CRITERION_QUOTE_LENGTH ? quote : null;
}

/** 逐語複製した条文と、その区間が名乗っている条文が食い違う */
export interface CriterionTextCopyMismatch {
  /** 逐語複製されている受入基準 */
  criterionId: string;
  /** 複製されている語句 */
  quote: string;
  /** 区間のあるファイル（リポジトリ相対・POSIX 表記） */
  file: string;
  /** 区間の始まり（1 始まり。テスト・群の宣言行、ファイル前書きなら 1） */
  line: number;
  /** その区間が名乗っている受入基準 */
  claimed: string[];
}

/**
 * 区間の散文が、当該の受入基準の番号を明示しているか
 *
 * `REQ-14.4` でも素の `14.4` でも認める。前後に数字が続く形（`14.40`）は別番号なので除く。
 */
function proseAttributesCriterion(prose: string, criterionId: string): boolean {
  const local = criterionId.slice(criterionId.lastIndexOf('/') + 1).replace(/^REQ-/, '');
  const pattern = new RegExp(`(?<![0-9.])${local.replace('.', '\\.')}(?![0-9])`);
  return pattern.test(prose);
}

/** テスト・群の宣言（区間の切れ目） */
const TEST_DECLARATION_REGEX =
  /^[ \t]*(?:test|it)(?:\.(?:skip|only|fixme|fail|slow))*\s*\(\s*['"`]/;
const GROUP_DECLARATION_REGEX = /^[ \t]*(?:test\.)?describe(?:\.[A-Za-z]+)*\s*\(\s*['"`]/;
/** 註釈と空行だけの行（前書きの範囲を決めるのに使う） */
const COMMENT_OR_BLANK_LINE_REGEX = /^[ \t]*(?:\/\/|\/\*|\*|$)/;

export interface CoverageBlock {
  /** 宣言行（0 始まり）。ファイル前書きは -1 */
  declaration: number;
  claimed: Set<string>;
}

/**
 * ファイルを「宣言ごとの区間」に割り、各区間の被覆印と本文を返す
 *
 * 区間は「直前に続く註釈の塊（前書き）＋宣言から次の宣言の手前まで」である。
 * 末尾に続く註釈の塊は**次の宣言の前書き**なので含めない。含めると、隣のテストの
 * 前書きに書かれた原文の写しを自分のものとして読んでしまう。
 *
 * **ここに「含めたときに出る偽陽性」の数を書かない。** その数は reportCriterionTextCopies が
 * 返す `mismatches` そのものであり、検査本体が「原文を逐語複製しながらその条文を名乗って
 * いない被覆印」の行として毎回印字する。末尾を切る一行を外す変異を当てれば同じ行が動く。
 * 散文へ写せばその出力の二重帳簿になり、写した時点から陳腐化する（タスク 115.254 が
 * 同じファイルの他の三箇所で確立した作法。ここが挙げていた数は、タスク 115.307 が
 * その変異で測り直した時点で既に実データと桁で食い違っていた）。**切ること自体**は自己検査
 * `check-requirement-coverage.selftest.ts` の「逐語複製との食い違いを両方向で固定する」群が
 * 押さえており、本記述が実データの名指しと計数を持たないことは同ファイルの
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export function splitCoverageBlocks(
  content: string,
  featureNames: readonly string[]
): Array<{ block: CoverageBlock; prose: string }> {
  const lines = content.split('\n');
  const declarations: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (TEST_DECLARATION_REGEX.test(line) || GROUP_DECLARATION_REGEX.test(line)) {
      declarations.push(i);
    }
  }

  const lineStarts: number[] = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') lineStarts.push(i + 1);
  }
  const lineOf = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if ((lineStarts[mid] as number) <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  const blocks = new Map<number, CoverageBlock>();
  const record = (id: string, offset: number): void => {
    const lineIndex = lineOf(offset);
    let owner = -1;
    const next = declarations.find((declaration) => declaration > lineIndex);
    if (next !== undefined) {
      let onlyComments = true;
      for (let i = lineIndex + 1; i < next; i += 1) {
        if (!COMMENT_OR_BLANK_LINE_REGEX.test(lines[i] ?? '')) {
          onlyComments = false;
          break;
        }
      }
      if (onlyComments) owner = next;
    }
    if (owner === -1) {
      let previous = -1;
      for (const declaration of declarations) {
        if (declaration <= lineIndex) previous = declaration;
        else break;
      }
      owner = previous;
    }
    const block = blocks.get(owner) ?? { declaration: owner, claimed: new Set<string>() };
    block.claimed.add(id);
    blocks.set(owner, block);
  };

  for (const pattern of buildInlineTagPatterns(featureNames)) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[2] && match[3]) {
        record(`${match[1]}/REQ-${match[2]}.${match[3]}`, match.index);
      }
    }
  }
  for (const id of extractHeaderScopedCoverage(content, featureNames).acceptanceCriteria) {
    const local = id.slice(id.indexOf('/') + 1);
    const itemRegex = new RegExp(`[-*]\\s*${local.replace('.', '\\.')}(?![0-9])`, 'g');
    const found = itemRegex.exec(content);
    record(id, found ? found.index : 0);
  }

  return [...blocks.values()].map((block) => {
    let start = block.declaration >= 0 ? block.declaration : 0;
    if (block.declaration >= 0) {
      while (start > 0 && COMMENT_OR_BLANK_LINE_REGEX.test(lines[start - 1] ?? '')) start -= 1;
    }
    let end: number;
    if (block.declaration >= 0) {
      const next = declarations.find((declaration) => declaration > block.declaration);
      end = next ?? lines.length;
    } else {
      end = declarations[0] ?? lines.length;
    }
    while (end - 1 > start && COMMENT_OR_BLANK_LINE_REGEX.test(lines[end - 1] ?? '')) end -= 1;
    return { block, prose: lines.slice(start, end).join('\n') };
  });
}

/**
 * 受入基準の原文を逐語で複製しているのに、その条文を名乗っていない被覆印を挙げる
 *
 * 散文どうしの照合は機械化できない。タスク 115.167 が語の重なりで照合する案を実データへ当て、
 * 誤検出が多すぎるとして退けている（当時の計数は同タスクの記録に残る）。解は照合の精度を
 * 上げることではなく、**対応の担い手を散文から原文の逐語複製へ移す**ことである。
 * 除外定義では各項目に受入基準の本文を持たせる形（criterionText）で実現した。
 * 被覆印に同じ義務を課すのは規模が違うため課さない。代わりに、**既に写しがある区間に限って**
 * その写しを担い手として扱う。
 *
 * 走査根は `CODE_DIRS` である。**本番実装と単体検証の被覆印もこの検査を受ける**
 * （タスク 115.256。従前は `e2e/specs` だけを読んでおり、それ以外の根の被覆印は
 * 逐語複製の検査を一度も受けていなかった）。どの根も遊んでいないこと——外せば守備範囲が
 * 真に縮むこと——は自己検査 `checkCriterionTextCopyRootsAreNotIdle` が毎回測る。
 * 現況の守備範囲は本検査が `blocks` / `blocksWithCopy` として毎回印字する。
 *
 * この検査が捕まえないもの（限界を両方向で述べる）:
 *   - 写しの無い区間は何も確かめない。**本検査は網羅ではなく、担い手が移っている箇所だけを
 *     機械が守る形である。** 守備範囲の広さは `blocks` と `blocksWithCopy` が測り、
 *     reportCriterionTextCopies を呼ぶ検査本体が毎回印字する。
 *   - `shall` を含まない受入基準（`THEN …しなければならない` 形）は目印を取り出せないため
 *     対象外である（criterionQuote が null を返す）。
 *   - 語句が MIN_CRITERION_QUOTE_LENGTH 文字未満、または同一機能の他の条文の本文にも
 *     現れる場合は、その条文を名指す証拠にならないため対象外である。
 *   - 候補はその区間が既に名乗っている機能の条文に限る。別機能の条文を写している場合は
 *     挙げない（機能をまたぐ語句の一致は偽陽性が多い）。
 *   - **写した条文の番号が同じ区間の散文に書かれている場合は挙げない。** 書き手はどの条文の
 *     文言かを分かって引いており、指し先が誤っているのではない。**代償として、番号を添えて
 *     引用すれば検査は黙る。** 番号の付け替えを伴わない誤りはこの検査では捕まらない。
 *     この免除の口の広さは `exemptedByProseAttribution` が測り、毎回印字する。
 *   - 被覆印そのものが読み取り規則に載らない書き方（`(feature/REQ-1.1, REQ-1.2)` の
 *     二つ目以降、`(feature/REQ-1.1/REQ-2.2)` のような連結）で書かれている場合、
 *     番号は散文に現れているため上の免除に入り、挙げない。読み取り規則の側の穴であり、
 *     本検査の担当ではない。**この形だけは機械で測る出口が無い**——読み取り規則が読まない
 *     書き方は、定義上どの母集団にも現れない。件数を知るには検出器を新設する必要がある。
 *   - 写した条文を名乗っていても、検証が実際にその条文を確かめているかは見ない。
 *     115.167 が除外定義について記した抜け道と同じで、**写す元を間違えれば一致してしまう。**
 *
 * **ここに実データの実例・計数を書かない。** 上の限界のうち計数を持つものは、いずれも
 * reportCriterionTextCopies が返す値（`blocks` / `blocksWithCopy` /
 * `exemptedByProseAttribution`）として毎回測り直され、検査本体が印字する。散文へ写せば
 * 同期する機構の無い二重帳簿になり、写した時点から陳腐化する（タスク 115.254 の起票理由。
 * ここが挙げていた免除の件数と名指しは、測り直した時点で既に実データと食い違っていた）。
 * 本記述が実データの名指しと計数を持たないことは、自己検査
 * `check-requirement-coverage.selftest.ts` の `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export interface CriterionTextCopyReport {
  /** 被覆印を持つ区間の総数（母集団） */
  blocks: number;
  /** そのうち受入基準の原文を写している区間の数（本検査が実際に守っている範囲） */
  blocksWithCopy: number;
  /**
   * 写した条文を名乗っていないが、その番号が同じ区間の散文にあるため免除した組の数
   *
   * 免除の口の広さそのものである。散文へ数を書くと実データとともに陳腐化するため、
   * **検査自身の出力として毎回測る**（タスク 115.254）。0 でも印字する——免除が
   * 空振りしているのか、口が広いのかを黙って見分けられなくしないためである。
   *
   * 単位は `blocks` / `blocksWithCopy`（区間）と違い、**区間と条文の組**である。
   * 一つの区間が複数の条文を写していれば、その分だけ数える。
   */
  exemptedByProseAttribution: number;
  /** 写した条文を名乗っていない区間 */
  mismatches: CriterionTextCopyMismatch[];
}

/** 逐語複製の食い違い（母集団つき） */
export function reportCriterionTextCopies(
  features: readonly Feature[],
  scanRoots: readonly string[] = CODE_DIRS
): CriterionTextCopyReport {
  const featureNames = features.map((feature) => feature.name);
  /** 機能名 → 語句 → その語句を持つ受入基準 */
  const quotes = new Map<string, Map<string, string>>();
  for (const feature of features) {
    const all: AcceptanceCriteria[] = feature.requirements.flatMap(
      (requirement) => requirement.acceptanceCriteria
    );
    const byQuote = new Map<string, string[]>();
    for (const criterion of all) {
      const quote = criterionQuote(criterion.text);
      if (quote === null) continue;
      byQuote.set(quote, [...(byQuote.get(quote) ?? []), criterion.id]);
    }
    const usable = new Map<string, string>();
    for (const [quote, ids] of byQuote) {
      if (ids.length !== 1) continue;
      // 同じ機能の他の条文の本文に現れる語句は、当該条文を名指さない
      if (all.some((criterion) => criterion.id !== ids[0] && criterion.text.includes(quote))) {
        continue;
      }
      usable.set(quote, ids[0] as string);
    }
    quotes.set(feature.name, usable);
  }

  const mismatches: CriterionTextCopyMismatch[] = [];
  let blocks = 0;
  let blocksWithCopy = 0;
  let exemptedByProseAttribution = 0;
  const seen = new Set<string>();
  const files: string[] = [];
  for (const root of scanRoots) {
    for (const file of findFiles(root, /\.(ts|tsx)$/)) {
      // 根が入れ子（`e2e` と `e2e/specs`）でも同じファイルを二度数えない。
      // 二度数えると母数 `blocks` だけが膨らみ、守備範囲の指標が水増しされる。
      const absolute = path.resolve(file);
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      files.push(file);
    }
  }
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relative = toPosixPath(path.relative(process.cwd(), file));
    for (const { block, prose } of splitCoverageBlocks(content, featureNames)) {
      blocks += 1;
      let hasCopy = false;
      const claimedFeatures = new Set([...block.claimed].map((id) => id.slice(0, id.indexOf('/'))));
      for (const featureName of claimedFeatures) {
        for (const [quote, criterionId] of quotes.get(featureName) ?? []) {
          if (!prose.includes(quote)) continue;
          hasCopy = true;
          if (block.claimed.has(criterionId)) continue;
          // 写した条文の番号が同じ区間の散文にあるなら、書き手は出典を分かって引いている
          if (proseAttributesCriterion(prose, criterionId)) {
            exemptedByProseAttribution += 1;
            continue;
          }
          mismatches.push({
            criterionId,
            quote,
            file: relative,
            line: Math.max(1, block.declaration + 1),
            claimed: [...block.claimed].sort(),
          });
        }
      }
      if (hasCopy) blocksWithCopy += 1;
    }
  }
  mismatches.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.criterionId.localeCompare(b.criterionId)
  );
  return { blocks, blocksWithCopy, exemptedByProseAttribution, mismatches };
}

/** 逐語複製の食い違いだけを取り出す（母集団が要らない呼び出し向け） */
export function findCriterionTextCopyMismatches(
  features: readonly Feature[],
  scanRoots: readonly string[] = CODE_DIRS
): CriterionTextCopyMismatch[] {
  return reportCriterionTextCopies(features, scanRoots).mismatches;
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
 *
 * **分子は分母との交わりで数える。被覆印が名乗るだけの番号を分子に入れてはならない。**
 * 従前は coveredReqSet / coveredAcSet の大きさをそのまま分子にしていたため、
 * 要件定義書に無い番号・撤廃済みの番号を名乗る印が分子だけを膨らませ、
 * 「被覆済み + 未被覆 > 総数」が成立していた。
 *
 * **ここに当時の被覆数・未被覆数・総数を書かない。** 三つの値は検査本体が「数え方の整合」の
 * 行として毎回印字し、分子から外した印の内訳は collectOutOfDenominatorMarks が一元に持つ。
 * 散文へ写せばその出力の二重帳簿になり、写した時点から陳腐化する（タスク 115.254 が
 * 同じファイルの他の三箇所で確立した作法。ここが挙げていた三つの値は、タスク 115.307 が
 * 是正前の形を再現して測り直した時点で、いずれも実データと食い違っていた——
 * **不等号の向きだけは今日も成り立つ**）。本記述が実データの名指しと計数を持たないことは、
 * 自己検査 `check-requirement-coverage.selftest.ts` の
 * `checkExtractorLimitDocsCiteNoRealData` が守る。
 */
export function calculateCoverage(
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
  // 分子は分母との交わりで数える。理由と、写してはならない計数の在り処は本関数の JSDoc にある。
  const allRequirementIds = new Set(allRequirements.map((requirement) => requirement.fullId));
  const allCriterionIds = new Set(allAcceptanceCriteria.map((criterion) => criterion.id));
  const coveredRequirements = Array.from(coveredReqSet)
    .filter((id) => allRequirementIds.has(id))
    .sort();
  const uncoveredRequirements = allRequirements.filter((r) => !coveredReqSet.has(r.fullId));

  const requirementCoveragePercent =
    allRequirements.length > 0 ? (coveredRequirements.length / allRequirements.length) * 100 : 0;

  const coveredAcceptanceCriteria = Array.from(coveredAcSet)
    .filter((id) => allCriterionIds.has(id))
    .sort();
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
// 全体サマリーの数え方の整合
// ============================================================================

/** 全体サマリーの数え方が壊れていないかの判定 */
export interface SummaryIntegrityReport {
  /** 被覆印が名乗ったが分母に無いため分子から外した受入基準番号 */
  droppedCriterionMarks: string[];
  /** 被覆印が名乗ったが分母に無いため分子から外した要件番号 */
  droppedRequirementMarks: string[];
  /** 分子から外したのに、どの報告枠にも現れない番号 */
  invisibleMarks: string[];
  /** 破れている整合。空でなければ検査は落ちる */
  reasons: string[];
}

/**
 * 全体サマリーの数え方の整合を実データに対して確かめる
 *
 * 分子は分母との積で数えるため、分母に無い番号を名乗る被覆印は集計から落ちる。
 * その落とし方が正しいことは、次の二つが同時に成り立つことでしか言えない。
 *
 *   1. **恒等式**: 被覆済み + 未被覆 = 総数（要件・受入基準の両方）。
 *      分子を生のタグ集合で数えると和が総数を超え、表示上の被覆率が実態と食い違う。
 *   2. **可視性**: 分子から落とした番号は、必ずどこかの報告枠に現れる。
 *      落とすだけで見せなければ、幻の番号は誰にも気づかれないまま残る。
 *      落とす側の分母と、見せる側の分母が別々に定義されると、その差に落ちた印は
 *      集計にも報告にも出ない。逆向き（分母に入っている番号を分母外として挙げる）も
 *      同じ食い違いの表れなので、両方向を見る。
 *
 * **合致していても件数を無条件に出力する。**黙って合う分子は、水増しと同じだけ危うい。
 */
export function checkSummaryIntegrity(
  result: CoverageResult,
  testCoverage: readonly TestCoverage[],
  outOfDenominator: OutOfDenominatorMarks
): SummaryIntegrityReport {
  const criterionDenominator = new Set(result.allAcceptanceCriteria.map((ac) => ac.id));
  const requirementDenominator = new Set<string>();
  for (const feature of result.features) {
    for (const requirement of feature.requirements) requirementDenominator.add(requirement.fullId);
  }

  const claimedCriteria = new Set<string>();
  const claimedRequirements = new Set<string>();
  for (const coverage of testCoverage) {
    for (const id of coverage.acceptanceCriteria) claimedCriteria.add(id);
    for (const id of coverage.requirements) claimedRequirements.add(id);
  }

  const droppedCriterionMarks = [...claimedCriteria]
    .filter((id) => !criterionDenominator.has(id))
    .sort();
  const droppedRequirementMarks = [...claimedRequirements]
    .filter((id) => !requirementDenominator.has(id))
    .sort();

  const shown = new Set<string>([
    ...outOfDenominator.retired,
    ...outOfDenominator.lettered,
    ...outOfDenominator.unknown,
  ]);
  // 受入基準は分母外の内訳が受け皿になる。要件だけを名乗る印には受け皿が無いため、
  // ここで名指さなければ挙げる場所がどこにも無い。
  const invisibleMarks = [
    ...droppedCriterionMarks.filter((id) => !shown.has(id)),
    ...droppedRequirementMarks,
  ].sort();
  const contradicted = [...shown].filter((id) => criterionDenominator.has(id)).sort();

  const reasons: string[] = [];
  if (
    result.coveredAcceptanceCriteriaCount + result.uncoveredAcceptanceCriteriaCount !==
    result.totalAcceptanceCriteria
  ) {
    reasons.push(
      `受入基準の 被覆済み + 未被覆 が総数と一致しません（${result.coveredAcceptanceCriteriaCount} + ${result.uncoveredAcceptanceCriteriaCount} ≠ ${result.totalAcceptanceCriteria}）`
    );
  }
  if (
    result.coveredRequirementCount + result.uncoveredRequirementCount !==
    result.totalRequirements
  ) {
    reasons.push(
      `要件の 被覆済み + 未被覆 が総数と一致しません（${result.coveredRequirementCount} + ${result.uncoveredRequirementCount} ≠ ${result.totalRequirements}）`
    );
  }
  if (invisibleMarks.length > 0) {
    reasons.push(
      `分子から外したのにどの報告枠にも出ていない被覆印が${invisibleMarks.length}件あります: ${invisibleMarks.join(', ')}`
    );
  }
  if (contradicted.length > 0) {
    reasons.push(
      `分母に入っている番号を分母外として挙げています（内訳と分母が食い違っています）: ${contradicted.join(', ')}`
    );
  }

  return { droppedCriterionMarks, droppedRequirementMarks, invisibleMarks, reasons };
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
  reachability: ReachabilityReport,
  retiredMarks: readonly RetiredCriterionMark[],
  outOfDenominator: OutOfDenominatorMarks,
  unknownMarks: readonly UnknownCriterionMark[],
  copyReport: CriterionTextCopyReport,
  integrity: SummaryIntegrityReport
): void {
  const { verbose, threshold } = options;
  const copyMismatches = copyReport.mismatches;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  要件カバレッジレポート（複数機能対応・受入基準レベル）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 検出された機能
  console.log('  📦 検出された機能:');
  let retiredTotal = 0;
  for (const feature of result.features) {
    retiredTotal += feature.retiredAcceptanceCriteriaCount;
    const retiredRequirementNote =
      feature.retiredRequirements.length > 0
        ? `・要件 ${feature.retiredRequirements.length}件`
        : '';
    const retired =
      feature.retiredAcceptanceCriteriaCount > 0
        ? `（撤廃 ${feature.retiredAcceptanceCriteriaCount}件${retiredRequirementNote}は分母外）`
        : '';
    console.log(
      `     - ${feature.name}: ${feature.requirements.length}要件, ${feature.totalAcceptanceCriteria}受入基準${retired}`
    );
  }
  console.log('');

  // 分母から外した件数は必ず出す。黙って縮む分母は水増しと同じだけ危うい。
  console.log(
    `  🪦 要件定義書上で撤廃済み（取り消し線）のため分母から外した受入基準: ${retiredTotal}件`
  );
  console.log(
    `     うち被覆印が名乗っているもの: ${retiredMarks.length}件${retiredMarks.length > 0 ? '（要是正）' : ''}`
  );
  console.log('');

  // 分子の側も同じ理由で必ず出す。分母に無い番号を名乗る被覆印は分子だけを膨らませる
  // （従前は「被覆済み + 未被覆 > 総受入基準数」が成立していた）。
  const outOfDenominatorTotal =
    outOfDenominator.retired.length +
    outOfDenominator.lettered.length +
    outOfDenominator.unknown.length;
  console.log(
    `  🏷️ 分母に無い受入基準番号を名乗る被覆印: ${outOfDenominatorTotal}件（分子には数えない）`
  );
  console.log(`     - 撤廃済み（取り消し線）の番号: ${outOfDenominator.retired.length}件`);
  console.log(
    `     - 枝つき番号（'1a.' 形式で抽出規則が分母に入れていない）: ${outOfDenominator.lettered.length}件${
      outOfDenominator.lettered.length > 0 ? `（${outOfDenominator.lettered.join(', ')}）` : ''
    }`
  );
  console.log(
    `     - 要件定義書に存在しない番号: ${outOfDenominator.unknown.length}件${
      outOfDenominator.unknown.length > 0 ? `（${outOfDenominator.unknown.join(', ')}）` : ''
    }`
  );
  console.log(
    `       うち ${E2E_SPECS_ROOT} 配下にあり本スクリプトが失敗させるもの: ${unknownMarks.length}件`
  );
  console.log('');

  // 逐語複製と名乗りの対応も 0 件のときに出す。空振りを黙って見逃さないため。
  console.log(
    `  📄 受入基準の原文を逐語複製しながら、その条文を名乗っていない被覆印: ${copyMismatches.length}件`
  );
  console.log(
    `     （検査が守っている範囲: ${CODE_DIRS.join(' / ')} の被覆印の区間 ${copyReport.blocks}件のうち、` +
      `原文の写しを持つ ${copyReport.blocksWithCopy}件。残りは散文の対応のままで機械は見ていない）`
  );
  // 免除の口の広さも 0 のときに出す。散文へ書けば陳腐化するため出力で測る（タスク 115.254）。
  // 単位は上の行と違う（上は区間、ここは「区間と条文」の組）ので「うち」とは書かない。
  console.log(
    `     （別勘定: 写した条文の番号を同じ区間の散文が挙げているため免除した「区間と条文」の組: ` +
      `${copyReport.exemptedByProseAttribution}組。番号を添えて引用すれば検査は黙る）`
  );
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
  // 数え方の整合は、合致していても無条件に出す。黙って合う分子は水増しと同じだけ危うい。
  const identityMark =
    result.coveredAcceptanceCriteriaCount + result.uncoveredAcceptanceCriteriaCount ===
    result.totalAcceptanceCriteria
      ? '一致'
      : '不一致';
  console.log('  🧮 数え方の整合（分子は分母との積で数える）:');
  console.log(
    `     被覆 ${result.coveredAcceptanceCriteriaCount} + 未被覆 ${result.uncoveredAcceptanceCriteriaCount} = 総数 ${result.totalAcceptanceCriteria} … ${identityMark}`
  );
  console.log(
    `     分子から外した被覆印: 受入基準 ${integrity.droppedCriterionMarks.length}件・要件 ${integrity.droppedRequirementMarks.length}件（うち報告枠に出ていないもの ${integrity.invisibleMarks.length}件）`
  );
  for (const reason of integrity.reasons) {
    console.log(`     ⚠️ ${reason}`);
  }
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
  reachability: ReachabilityReport,
  retiredMarks: readonly RetiredCriterionMark[],
  outOfDenominator: OutOfDenominatorMarks,
  unknownMarks: readonly UnknownCriterionMark[],
  copyReport: CriterionTextCopyReport,
  integrity: SummaryIntegrityReport
): void {
  const output = {
    features: result.features.map((f) => ({
      name: f.name,
      requirementCount: f.requirements.length,
      acceptanceCriteriaCount: f.totalAcceptanceCriteria,
      retiredAcceptanceCriteriaCount: f.retiredAcceptanceCriteriaCount,
    })),
    retiredCriterionCoverageMarks: retiredMarks,
    outOfDenominatorCoverageMarks: outOfDenominator,
    unknownCriterionCoverageMarks: unknownMarks,
    summaryIntegrity: integrity,
    criterionTextCopy: copyReport,
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
  const testCoverage = extractTestCoverage(featureNames);

  // 5. カバレッジを計算
  const result = calculateCoverage(features, testCoverage, exclusions);

  // 5b. 撤廃済み（取り消し線）の受入基準を名乗る被覆印を洗い出す
  const retiredMarks = findRetiredCriterionCoverageMarks(features, testCoverage);

  // 5c. 指し先そのものが誤っている被覆印を洗い出す
  //     (i) 要件定義書に存在しない番号を名乗る
  //     (ii) 原文を逐語複製しながら別の条文を名乗る
  const outOfDenominator = collectOutOfDenominatorMarks(features, testCoverage);
  const unknownMarks = findUnknownCriterionCoverageMarks(features, testCoverage);
  const copyReport = reportCriterionTextCopies(features);
  const copyMismatches = copyReport.mismatches;

  // 5d. 全体サマリーの数え方の整合（恒等式と、分子から外した番号の可視性）
  const integrity = checkSummaryIntegrity(result, testCoverage, outOfDenominator);

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
    printJsonReport(
      result,
      options,
      reachability,
      retiredMarks,
      outOfDenominator,
      unknownMarks,
      copyReport,
      integrity
    );
  } else {
    printReport(
      result,
      options,
      reachability,
      retiredMarks,
      outOfDenominator,
      unknownMarks,
      copyReport,
      integrity
    );
  }

  // 8. 閾値チェック
  const passed =
    result.applicableCoveragePercent >= options.threshold &&
    reachabilityVerdict.ok &&
    retiredMarks.length === 0 &&
    unknownMarks.length === 0 &&
    copyMismatches.length === 0 &&
    integrity.reasons.length === 0;

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
      for (const reason of integrity.reasons) {
        console.log(`❌ FAILED: 全体サマリーの数え方が整合していません — ${reason}`);
      }
      if (unknownMarks.length > 0) {
        console.log(
          `❌ FAILED: 要件定義書に存在しない受入基準番号を名乗る被覆印が${unknownMarks.length}件あります`
        );
        for (const mark of unknownMarks) {
          const cause = mark.requirementMissing
            ? '要件そのものが無い'
            : '当該要件に該当番号の受入基準が無い';
          console.log(`     - ${mark.id}（${cause}）: ${mark.files.join(', ')}`);
        }
      }
      if (copyMismatches.length > 0) {
        console.log(
          `❌ FAILED: 受入基準の原文を逐語複製しながら、その条文を名乗っていない被覆印が${copyMismatches.length}件あります`
        );
        for (const mismatch of copyMismatches) {
          console.log(
            `     - ${mismatch.file}:${mismatch.line} 複製=${mismatch.criterionId} 名乗り=${mismatch.claimed.join(', ')}`
          );
          console.log(`       「${mismatch.quote}」`);
        }
      }
      if (retiredMarks.length > 0) {
        console.log(
          `❌ FAILED: 要件定義書上で撤廃済み（取り消し線）の受入基準を名乗る被覆印が${retiredMarks.length}件あります`
        );
        for (const mark of retiredMarks) {
          console.log(`     - ${mark.id}: ${mark.files.join(', ')}`);
        }
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
        '     （撤廃済み・移管済みの受入基準は分母に載りません。除外ではなく、移管先の番号を名乗り直してください）'
      );
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
