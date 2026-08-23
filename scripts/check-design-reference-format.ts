/**
 * @fileoverview 本番コードから設計文書への「行番号で指す参照」の検出スクリプト
 *
 * 設計文書（`.kiro/specs/<feature>/design.md`）は仕様の追記・改訂で行数が絶えず変わる。
 * 本番コードの注釈が設計文書を行番号で指していると、参照先は静かにずれ、
 * やがて全く別の内容（閉じ括弧のみ、無関係な項目の宣言など）を指すようになる。
 * site-survey タスク 115.71 のレビューでこのずれが実際に起きていることが判明したため、
 * タスク 115.100 で参照を「節の題とシンボル名」で指す形へ改めた。
 *
 * 本スクリプトはその再発を機械的に検知する。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-reference-format.ts [options]
 *   npm run check:design-refs
 *
 * 検出する形:
 *   design.md:3504 / design.md :2337-2339 / design.md 4905-4911
 *   design.md L1519 / design.md L5281-5289 / design.md#L166 / design.md 5485 行
 *   design.md「節の題」(4375) / …（4313-4323） / design.md §4611
 *   括弧で括った 3 桁（`design.md「節の題」(803)`）も対象にする。1000 行未満の
 *   design.md が実在するためであり、唯一の紛れである HTTP ステータス（`検証（422）の後`）は
 *   有限集合として除外する（HTTP_STATUS_CODES を参照）。
 *   いずれも「設計文書の位置を行番号で指す」書き方であり、維持できない。
 *
 * 正しい形:
 *   節の題（`## 見出し`）とシンボル名（型・関数・定数の名前）で指す。
 *   例: `design.md の「注釈スタイルの既定値（タスク 115.71）」節 / DEFAULT_STYLE_OPTIONS`
 *
 * 走査対象（タスク 115.100 の境界「本番コードから設計文書への参照形式」に対応）:
 *   frontend/src, backend/src の .ts / .tsx のうち、テストコードを除いたもの。
 *   テストコード（*.test.*, *.spec.*, __tests__/, __mocks__/, test-utils/）と
 *   e2e/ 配下は本タスクの境界外のため走査しない。
 *
 * オプション:
 *   --verbose  検出行の全文を出力する
 *   --json     JSON 形式で出力する
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   走査対象が一件も見つからない場合は「合格」ではなく失敗として扱う。
 *   パスの変更や実行位置の誤りで検査が静かに素通りすることを防ぐ。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

export interface DesignRefFinding {
  /** リポジトリ相対のファイルパス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 検出した参照そのもの（例: `design.md L5281-5289`） */
  reference: string;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  verbose?: boolean;
  json?: boolean;
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** 走査対象のディレクトリ（リポジトリ相対）。既定は PRODUCTION_SOURCE_DIRS */
  sourceDirs?: string[];
}

export interface RunResult {
  findings: DesignRefFinding[];
  scannedFileCount: number;
  scannedDirs: string[];
}

// ============================================================================
// 走査対象の決定
// ============================================================================

/** 本番コードの置き場所。テストコードと e2e は本検査の境界外 */
export const PRODUCTION_SOURCE_DIRS = ['frontend/src', 'backend/src'];

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** 走査しないディレクトリ名 */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'test-utils',
  'testUtils',
]);

/** テストコードと判断するファイル名の形 */
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * テストコードかどうかを判定する。
 * 本検査の境界は「本番コードから設計文書への参照形式」であるため、
 * テストコードに同種の参照が残っていても本検査は関知しない。
 */
export function isTestFile(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  if (TEST_FILE_PATTERN.test(normalized)) return true;
  const segments = normalized.split('/');
  return segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment));
}

/** 指定ディレクトリ配下の本番コードを列挙する */
export function collectSourceFiles(root: string, sourceDirs: string[]): string[] {
  const files: string[] = [];

  const walk = (absoluteDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) continue;
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      if (isTestFile(relativePath)) continue;
      files.push(relativePath);
    }
  };

  for (const dir of sourceDirs) {
    walk(path.join(root, dir));
  }
  return files.sort();
}

// ============================================================================
// 検出規則
// ============================================================================

/** 設計文書への言及そのもの（この語を含む行だけを行番号参照の検査対象にする） */
const DESIGN_DOC_MENTION = /design\.md/i;

/**
 * 行番号らしい整数の形。
 *
 * 3〜4 桁の整数のみを行番号とみなす。前後に数字か小数点が続く形は除くため、
 * タスク番号（`115.100`）や要件番号（`32.11`）、比率（`0.75`）とは一致しない。
 * 設計文書は数千行あり、本番コードの注釈に現れる 3〜4 桁の裸の整数は
 * 行番号以外にほとんど出現しない。
 */
const LINE_NUMBER = String.raw`(?<![\d.])L?\d{3,4}(?![\d.])`;

/**
 * 括弧に括った 3 桁の数値のうち、HTTP ステータスコードであるものを行番号と数えないための集合。
 *
 * 本番コードの注釈には `design.md「保存フロー（42.1〜42.9）」の順序に従い、検証（422）の後・`
 * のように、設計文書に言及する行へ HTTP ステータスを括弧書きする形が実在する。
 * 3 桁の行番号（1000 行未満の design.md 向け）を捕捉しつつ、この紛れだけを外す。
 * `:` または `L` を前置した形（`(:422)` / `(L422)`）は明示的な行番号指定であるため除かない。
 */
const HTTP_STATUS_CODES: ReadonlySet<number> = new Set([
  100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300, 301, 302, 303, 304,
  305, 306, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
  415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504,
  505, 506, 507, 508, 510, 511,
]);

/** 括弧内が「前置のない 3 桁の HTTP ステータスコード」かどうか */
function isBareHttpStatusCode(matched: string): boolean {
  const inner = matched.replace(/^[(（]\s*/, '').replace(/\s*[)）]$/, '');
  if (/^[:L]/i.test(inner)) return false;
  if (!/^\d{3}$/.test(inner)) return false;
  return HTTP_STATUS_CODES.has(Number(inner));
}

interface Rule {
  /** 規則の名前（診断用） */
  name: string;
  /** 一致させる形 */
  pattern: RegExp;
  /** 一致のうち行番号ではないと判るものを外す述語 */
  reject?: (matched: string) => boolean;
}

/**
 * 設計文書を行番号で指す参照の形。
 *
 * 一つの形だけでは取りこぼす。実際の本番コードには次の書き方が混在していた。
 *   design.md:3504 / design.md :2337-2339 / design.md 4905-4911 / design.md L1519
 *   design.md#L166 / design.md 5485 行 / design.md「…」(4905-4911) / …（4313-4323）
 *   design.md `SaveEstimateItemNode`（4305-4311） / design.md §4611 / …(4375)
 * いずれも「設計文書の位置を行番号で指す」点で同じであり、同じく維持できない。
 */
const LINE_REFERENCE_PATTERNS: ReadonlyArray<Rule> = [
  {
    // design.md の直後に行番号が続く形（区切りは `:` / `#` / 空白、`L` 前置を許容）
    name: 'adjacent',
    pattern: /design\.md\s*[:#]?\s*L?\s*\d+(?![\d.])/gi,
  },
  {
    // 行番号の範囲（`4905-4911`、`:4086-4120`、`L5281-5289`）
    name: 'range',
    pattern: new RegExp(String.raw`${LINE_NUMBER}\s*[-–~]\s*${LINE_NUMBER}`, 'g'),
  },
  {
    // 括弧で括った単独の行番号（`(4375)`、`（4722）`、`（803）`、`(:4086)`、`(L166)`）。
    // 3 桁も対象にする。1000 行未満の design.md は実在する（company-info 803 行、
    // construction-photo 839 行、construction-schedule 859 行、contract-management 988 行、
    // execution-budget-management 814 行）ため、括弧に括った 3 桁の行番号は現実に起こり得る。
    // 唯一の紛れは括弧に入れた HTTP ステータス（`検証（422）の後`）であり、
    // これは有限集合であるため reject で除く（`:` / `L` の前置があれば行番号として扱う）。
    name: 'parenthesized',
    pattern: new RegExp(String.raw`[(（]\s*:?\s*(?<![\d.])L?\d{3,4}(?![\d.])\s*[)）]`, 'g'),
    reject: isBareHttpStatusCode,
  },
  {
    // 節記号に続く行番号（`§4611`）
    name: 'section-sign',
    pattern: new RegExp(String.raw`§\s*:?\s*${LINE_NUMBER}`, 'g'),
  },
  {
    // 後置の「行」（`5485 行`）
    name: 'suffixed',
    pattern: new RegExp(String.raw`${LINE_NUMBER}\s*行`, 'g'),
  },
  {
    // `L` を前置した単独の行番号（`L1519`、`L5155`）
    name: 'l-prefixed',
    pattern: new RegExp(String.raw`(?<![\w.])L\d{3,4}(?![\d.])`, 'g'),
  },
];

interface Span {
  start: number;
  end: number;
  text: string;
}

/**
 * 一行に対して行番号参照を検出する。
 *
 * 複数の形が同じ箇所に重なって一致するため（`design.md L5281-5289` は
 * adjacent / range / l-prefixed の三つに一致する）、他の一致に包含される一致は捨て、
 * 一行につき一件の検出として数える。「何箇所あるか」は「何行あるか」と一致させる。
 */
export function scanLine(lineText: string): string[] {
  if (!DESIGN_DOC_MENTION.test(lineText)) return [];
  const spans: Span[] = [];
  for (const { pattern, reject } of LINE_REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end === start) break;
      if (reject?.(match[0])) continue;
      spans.push({ start, end, text: match[0].trim() });
    }
  }
  const outermost = spans.filter(
    (span) =>
      !spans.some(
        (other) =>
          other !== span &&
          other.start <= span.start &&
          other.end >= span.end &&
          other.end - other.start > span.end - span.start
      )
  );
  const seen = new Set<string>();
  const references: string[] = [];
  for (const span of outermost.sort((a, b) => a.start - b.start)) {
    if (seen.has(span.text)) continue;
    seen.add(span.text);
    references.push(span.text);
  }
  return references;
}

/** 一つのソースから行番号参照を検出する（一行につき一件） */
export function scanSource(relativePath: string, source: string): DesignRefFinding[] {
  const findings: DesignRefFinding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const references = scanLine(lineText);
    if (references.length === 0) return;
    findings.push({
      file: relativePath,
      line: index + 1,
      reference: references.join(' / '),
      snippet: lineText.trim(),
    });
  });
  return findings;
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const sourceDirs = options.sourceDirs ?? PRODUCTION_SOURCE_DIRS;
  const files = collectSourceFiles(root, sourceDirs);

  const findings: DesignRefFinding[] = [];
  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    findings.push(...scanSource(relativePath, source));
  }

  return { findings, scannedFileCount: files.length, scannedDirs: sourceDirs };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run({ verbose, json });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFileCount === 0) {
    if (!json) {
      console.error('❌ 走査対象の本番コードが一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.scannedDirs.join(', ')}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ 本番コードから設計文書を行番号で指す参照が見つかりました');
      console.error('');
      console.error(
        '   設計文書は追記・改訂で行数が変わるため、行番号の参照は原理的に維持できません。'
      );
      console.error('   節の題とシンボル名で指す形へ改めてください。');
      console.error('');
      const byFile = new Map<string, DesignRefFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          console.error(`     L${finding.line}: ${finding.reference}`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル（走査 ${result.scannedFileCount} ファイル）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ 設計文書への行番号参照はありません（走査 ${result.scannedFileCount} ファイル: ${result.scannedDirs.join(', ')}）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
