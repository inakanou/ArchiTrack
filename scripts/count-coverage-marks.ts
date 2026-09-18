#!/usr/bin/env npx tsx
/**
 * @fileoverview 被覆印の計数（プロジェクト自身の読み手で数える。タスク 101.1）
 *
 * ## なぜ在るか
 *
 * 被覆印の件数は長らく**逐語 grep**（`grep -rn "<feature>/REQ-N.M"`）で数えられてきた。
 * その数え方は**構造的に読み落とす形**を持つ。ヘッダーが
 * `Requirements coverage (<feature-name>):` の形で機能名を持つとき、**その直下の一覧の
 * 素の `- REQ-N.M:` は被覆印として読まれる**（`extractHeaderScopedCoverage`）が、逐語 grep は
 * `<feature>/REQ-N.M` という綴りだけを探すためこの形に当たらない。
 *
 * 害は三つある。
 *
 *   (a) 「印は 0 件」という誤った結論から**空洞が残る**（タスク 99.2 で現に起きた）
 *   (b) タスク記録に残る計数の多くが逐語 grep で測られており、その多くが誤っている可能性がある
 *   (c) ヘッダーの名乗りは `npm run check:req-exclusions` の**不変条件5（除外と被覆印の同居の
 *       禁止）にも掛かる**ため、誤った計数は除外の処遇の判断も誤らせる（タスク 100.6）
 *
 * 利用者の裁定（2026-09-17）は「**計数の方式を統一する補助を用意する**」であった。本スクリプトが
 * その補助である。**誰が数えても同じ方式になる**ように、読み手は
 * `scripts/check-requirement-coverage.ts` の `extractFileCoverage` /
 * `extractHeaderScopedCoverage` を**そのまま呼ぶ**。走査対象の母集団も同ファイルの
 * `listCoverageScanFiles` から配られる。**本ファイルは被覆印の読み取り規則を一切持たない。**
 * 持てば、関門が読むものと本スクリプトが数えるものが黙って分かれる。
 * この「規則を複製しない」ことは自己検査 `count-coverage-marks.selftest.ts` の
 * `checkSourceDelegatesToCoverageReaders` が構造として守る。
 *
 * ## 何を出すか
 *
 *   - 機能ごと・ファイルごとの被覆印の件数（要件レベル `REQ-N` と受入基準レベル `REQ-N.M`）
 *   - そのうち**逐語 grep が読めない印**の件数（`literalGrepMisses`）。
 *     判定は「その印の綴り `<feature>/REQ-N.M` がファイル本文に現れるか」であり、
 *     `grep -rn "<feature>/REQ-N.M"` が当たるか否かと同じである。
 *   - ヘッダー直下の一覧に由来する印（`extractHeaderScopedCoverage` の返り）の内訳
 *
 * **差分は読み手の結果を歪めない。** 件数の本体はあくまで `extractFileCoverage` の返りであり、
 * 逐語 grep との差は同じ集合へ付けた注記として出す。
 *
 * ## 隠さない限界（読み手が実際に読んだものをそのまま出す）
 *
 *   - **範囲記法 `- REQ-22.1-22.3:` はヘッダーの識別子欄では先頭 1 件しか読まれない**
 *     （タスク 100.6 の実測）。読み手が `REQ-22.1` だけを返すなら、本スクリプトも
 *     `REQ-22.1` だけを数える。**補正しない。** 補正すれば関門が見ている世界と分かれる。
 *     この挙動は自己検査 `checkRangeNotationIsReportedAsRead` が逐語で固定する。
 *   - 逐語 grep との差は**部分文字列の一致**で測る。`<feature>/REQ-9.1` を含むファイルは
 *     要件レベルの `<feature>/REQ-9` の綴りも含むため、要件レベルの印は
 *     「読めない」に数えられない。これは `grep` の挙動そのものであり、意図した忠実さである。
 *
 * ## 使用方法
 *
 *   npx tsx scripts/count-coverage-marks.ts [--feature=NAME]... [--root=DIR]... [--verbose] [--json]
 *   npm run count:coverage-marks
 *   npm run count:coverage-marks -- --feature=quantity-table-generation --root=e2e
 *   npm run count:coverage-marks:selftest
 *
 * 本スクリプトは**検査（check）ではなく計数（count）である**。被覆率の合否は
 * `npm run check:req-coverage` が出す。ここが 0 以外で終わるのは、**数える母集団が空**で
 * あるとき——走査対象のファイルが 0 件、機能が 0 件、あるいは実在しない機能名を指定した
 * とき——だけである（AI運用7原則 第3原則: 母集団が空のまま「0 件」と報告しない）。
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CODE_DIRS,
  discoverFeatures,
  extractFileCoverage,
  extractHeaderScopedCoverage,
  listCoverageScanFiles,
  toPosixPath,
} from './check-requirement-coverage';

/** 走査根の既定（関門と同一の母集団。**ここで別の定数を作らない**） */
export const DEFAULT_SCAN_ROOTS: readonly string[] = CODE_DIRS;

/** 一ファイル分の計数 */
export interface FileMarkCount {
  /** リポジトリルート相対（POSIX 区切り） */
  file: string;
  /** `<feature>/REQ-N` */
  requirements: string[];
  /** `<feature>/REQ-N.M` */
  acceptanceCriteria: string[];
  /** そのうちヘッダー直下の一覧（`extractHeaderScopedCoverage`）に由来するもの */
  headerScopedRequirements: string[];
  headerScopedAcceptanceCriteria: string[];
  /** そのうち逐語 grep（綴りの部分一致）では当たらないもの */
  literalGrepMissedRequirements: string[];
  literalGrepMissedAcceptanceCriteria: string[];
}

/** 計数の全体 */
export interface CoverageMarkCountResult {
  /** 帰属に用いた機能名（`--feature` の指定があればそれだけ） */
  featureNames: string[];
  /** 走査根 */
  roots: string[];
  /** 走査したファイル数（印の有無を問わない） */
  scannedFileCount: number;
  /** 印を一つ以上持つファイルだけ。件数の降順 → パスの昇順 */
  files: FileMarkCount[];
  /** 機能名 → 受入基準レベルの印の件数 */
  acceptanceCriteriaByFeature: Record<string, number>;
  /** 機能名 → 逐語 grep が読めない受入基準レベルの印の件数 */
  literalGrepMissedByFeature: Record<string, number>;
  totalRequirementMarks: number;
  totalAcceptanceCriteriaMarks: number;
  totalLiteralGrepMissedRequirements: number;
  totalLiteralGrepMissedAcceptanceCriteria: number;
}

/** 一ファイル分の中身に対する計数（読み手を呼ぶ唯一の場所） */
export function countMarksInContent(
  content: string,
  featureNames: readonly string[]
): Omit<FileMarkCount, 'file'> {
  // 件数の本体。読み取り規則は check-requirement-coverage.ts が唯一の担い手である。
  const coverage = extractFileCoverage(content, [...featureNames]);
  // 内訳（ヘッダー直下の一覧に由来する分）。逐語 grep が読み落とす形はここに集まる。
  const headerScoped = extractHeaderScopedCoverage(content, featureNames);

  const requirements = [...coverage.requirements].sort();
  const acceptanceCriteria = [...coverage.acceptanceCriteria].sort();
  const missedBySpelling = (id: string): boolean => !content.includes(id);

  return {
    requirements,
    acceptanceCriteria,
    headerScopedRequirements: [...headerScoped.requirements].sort(),
    headerScopedAcceptanceCriteria: [...headerScoped.acceptanceCriteria].sort(),
    literalGrepMissedRequirements: requirements.filter(missedBySpelling),
    literalGrepMissedAcceptanceCriteria: acceptanceCriteria.filter(missedBySpelling),
  };
}

export interface CountOptions {
  /** 帰属させる機能名。省略時は `discoverFeatures()` の全件 */
  featureNames?: readonly string[];
  /** 走査根。省略時は `DEFAULT_SCAN_ROOTS` */
  roots?: readonly string[];
}

/** 走査根の下の全ファイルを数える */
export function countCoverageMarks(options: CountOptions = {}): CoverageMarkCountResult {
  const featureNames = [...(options.featureNames ?? discoverFeatures())];
  const roots = [...(options.roots ?? DEFAULT_SCAN_ROOTS)];
  const scanned = listCoverageScanFiles(roots);

  const files: FileMarkCount[] = [];
  const acceptanceCriteriaByFeature: Record<string, number> = {};
  const literalGrepMissedByFeature: Record<string, number> = {};
  let totalRequirementMarks = 0;
  let totalAcceptanceCriteriaMarks = 0;
  let totalLiteralGrepMissedRequirements = 0;
  let totalLiteralGrepMissedAcceptanceCriteria = 0;

  for (const file of scanned) {
    const content = fs.readFileSync(file, 'utf-8');
    const counted = countMarksInContent(content, featureNames);
    if (counted.requirements.length === 0 && counted.acceptanceCriteria.length === 0) continue;

    files.push({ file: toPosixPath(path.relative(process.cwd(), file)), ...counted });
    totalRequirementMarks += counted.requirements.length;
    totalAcceptanceCriteriaMarks += counted.acceptanceCriteria.length;
    totalLiteralGrepMissedRequirements += counted.literalGrepMissedRequirements.length;
    totalLiteralGrepMissedAcceptanceCriteria += counted.literalGrepMissedAcceptanceCriteria.length;

    for (const id of counted.acceptanceCriteria) {
      const feature = featureOf(id);
      acceptanceCriteriaByFeature[feature] = (acceptanceCriteriaByFeature[feature] ?? 0) + 1;
    }
    for (const id of counted.literalGrepMissedAcceptanceCriteria) {
      const feature = featureOf(id);
      literalGrepMissedByFeature[feature] = (literalGrepMissedByFeature[feature] ?? 0) + 1;
    }
  }

  files.sort(
    (a, b) =>
      b.acceptanceCriteria.length - a.acceptanceCriteria.length || a.file.localeCompare(b.file)
  );

  return {
    featureNames,
    roots,
    scannedFileCount: scanned.length,
    files,
    acceptanceCriteriaByFeature,
    literalGrepMissedByFeature,
    totalRequirementMarks,
    totalAcceptanceCriteriaMarks,
    totalLiteralGrepMissedRequirements,
    totalLiteralGrepMissedAcceptanceCriteria,
  };
}

/** `<feature>/REQ-N.M` の機能名の部分 */
export function featureOf(markId: string): string {
  const slash = markId.indexOf('/');
  return slash < 0 ? markId : markId.slice(0, slash);
}

export interface CliOptions {
  requestedFeatures: string[];
  roots: string[];
  verbose: boolean;
  json: boolean;
  unknownFlags: string[];
}

/** 引数の解釈（`--feature` と `--root` は繰り返し指定できる。`=` 区切りと空白区切りの両方） */
export function parseArgs(argv: readonly string[]): CliOptions {
  const requestedFeatures: string[] = [];
  const roots: string[] = [];
  const unknownFlags: string[] = [];
  let verbose = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const take = (name: string): string | null => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      if (arg === name) {
        index += 1;
        return argv[index] ?? '';
      }
      return null;
    };
    const feature = take('--feature');
    if (feature !== null) {
      if (feature !== '') requestedFeatures.push(feature);
      continue;
    }
    const root = take('--root');
    if (root !== null) {
      if (root !== '') roots.push(root);
      continue;
    }
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg.startsWith('--')) unknownFlags.push(arg);
  }

  return { requestedFeatures, roots, verbose, json, unknownFlags };
}

/** 母集団が空のまま「0 件」と報告しないための判定（AI運用7原則 第3原則） */
export function decideExit(
  result: CoverageMarkCountResult,
  requestedFeatures: readonly string[],
  knownFeatures: readonly string[]
): { code: number; failures: string[] } {
  const failures: string[] = [];
  for (const requested of requestedFeatures) {
    if (!knownFeatures.includes(requested)) {
      failures.push(
        `指定された機能名が .kiro/specs/ に実在しません: ${requested}` +
          `（実在するのは ${knownFeatures.join(' / ')}）`
      );
    }
  }
  if (result.featureNames.length === 0) {
    failures.push('帰属させる機能名が 0 件です（母集団が空のため計数は何も意味しません）');
  }
  if (result.scannedFileCount === 0) {
    failures.push(
      `走査対象のファイルが 0 件です（走査根: ${result.roots.join(' / ') || '(無し)'}）`
    );
  }
  return { code: failures.length === 0 ? 0 : 1, failures };
}

function formatReport(result: CoverageMarkCountResult, verbose: boolean): string[] {
  const lines: string[] = [];
  lines.push('被覆印の計数（読み手: scripts/check-requirement-coverage.ts）');
  lines.push(`  走査根        : ${result.roots.join(' / ')}`);
  lines.push(`  走査ファイル  : ${result.scannedFileCount} 件`);
  lines.push(`  帰属する機能  : ${result.featureNames.length} 件`);
  lines.push(`  印を持つファイル: ${result.files.length} 件`);
  lines.push(
    `  受入基準レベルの印: ${result.totalAcceptanceCriteriaMarks} 件` +
      `（うち逐語 grep が読めない印 ${result.totalLiteralGrepMissedAcceptanceCriteria} 件）`
  );
  lines.push(
    `  要件レベルの印    : ${result.totalRequirementMarks} 件` +
      `（うち逐語 grep が読めない印 ${result.totalLiteralGrepMissedRequirements} 件）`
  );
  lines.push('');

  const features = Object.keys(result.acceptanceCriteriaByFeature).sort(
    (a, b) =>
      (result.acceptanceCriteriaByFeature[b] ?? 0) - (result.acceptanceCriteriaByFeature[a] ?? 0) ||
      a.localeCompare(b)
  );
  lines.push('機能別（受入基準レベル）:');
  if (features.length === 0) {
    lines.push('  (印なし)');
  }
  for (const feature of features) {
    lines.push(
      `  ${feature}: ${result.acceptanceCriteriaByFeature[feature] ?? 0} 件` +
        `（逐語 grep が読めない印 ${result.literalGrepMissedByFeature[feature] ?? 0} 件）`
    );
  }
  lines.push('');

  lines.push('ファイル別（受入基準レベルの件数の降順）:');
  if (result.files.length === 0) {
    lines.push('  (印なし)');
  }
  for (const file of result.files) {
    lines.push(
      `  ${file.file}: ${file.acceptanceCriteria.length} 件` +
        `（逐語 grep が読めない印 ${file.literalGrepMissedAcceptanceCriteria.length} 件 /` +
        ` ヘッダー直下の一覧に由来 ${file.headerScopedAcceptanceCriteria.length} 件）`
    );
    if (!verbose) continue;
    const missed = new Set(file.literalGrepMissedAcceptanceCriteria);
    for (const id of file.acceptanceCriteria) {
      lines.push(`      ${missed.has(id) ? '!' : ' '} ${id}`);
    }
  }

  if (verbose) {
    lines.push('');
    lines.push('`!` は逐語 grep（`grep -rn "<feature>/REQ-N.M"`）では当たらない印である。');
  }

  return lines;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const options = parseArgs(argv);
  if (options.unknownFlags.length > 0) {
    console.error(`未知のオプション: ${options.unknownFlags.join(' ')}`);
    console.error(
      '使用方法: npx tsx scripts/count-coverage-marks.ts ' +
        '[--feature=NAME]... [--root=DIR]... [--verbose] [--json]'
    );
    return 1;
  }

  const knownFeatures = discoverFeatures();
  const featureNames =
    options.requestedFeatures.length > 0 ? options.requestedFeatures : knownFeatures;
  const roots = options.roots.length > 0 ? options.roots : [...DEFAULT_SCAN_ROOTS];
  const result = countCoverageMarks({ featureNames, roots });
  const { code, failures } = decideExit(result, options.requestedFeatures, knownFeatures);

  if (options.json) {
    console.log(JSON.stringify({ ...result, failures }, null, 2));
  } else {
    for (const line of formatReport(result, options.verbose)) console.log(line);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('❌ 数える母集団が空です');
    for (const failure of failures) console.error(`   ${failure}`);
  }
  return code;
}

const invokedDirectly =
  process.argv[1] !== undefined && toPosixPath(process.argv[1]).endsWith('count-coverage-marks.ts');
if (invokedDirectly) {
  process.exit(main());
}
