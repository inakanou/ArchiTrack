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
 * 走査対象は二つある。**禁止の理由は参照先（設計文書）の性質であり、参照がどこに書かれて
 * いるかに依らない**ため、同じ規則を二つの母集団へ当てる。
 *
 *   (1) 本番コード（タスク 115.100 の境界「本番コードから設計文書への参照形式」）
 *       frontend/src, backend/src の .ts / .tsx のうち、テストコードを除いたもの。
 *       テストコード（*.test.*, *.spec.*, __tests__/, __mocks__/, test-utils/）と
 *       e2e/ 配下は本タスクの境界外のため走査しない。
 *
 *   (2) 設計文書自身（タスク 115.211 の境界「設計文書が自身を行番号で指す参照」）
 *       `.kiro/specs/<feature>/design.md` の全件。
 *       タスク 115.172 は site-survey の `design.md` から**自身を行番号で指す参照 12 件**を
 *       撤去した。撤去の時点で 12 件すべてが失効しており、ずれ幅は 27〜51 行であった。
 *       同文書は 8061 行から 8065 行へ育っており、**文書が育つ限り行番号は失効し続ける**。
 *       撤去したのに再混入を捕まえる仕組みが無かったため、ここへ足した。
 *       **是正前の実物を捕捉することを先に確かめた**——タスク 115.172 の直前の版
 *       （コミット `8bfd1d5`。8061 行）の `.kiro/specs/site-survey/design.md` を
 *       `scanSource(..., 'design')` に掛けると、**3 行から 14 件**を検出する
 *       （L1128 が 1 件、L1131 が 1 件、L1496 が 12 件。2026-08-31 に実測）。内訳は
 *       コロン直付け（`design.md:NNNN`）11 件、後置の「行」（`1342 行` / `1479 行`）2 件、
 *       件数の過検出（`166行`）1 件である。**コロン直付けの素の実占有は 12 件**で
 *       （`grep -o 'design\.md:[0-9]\+' | wc -l` の出力が 12）、`design.md:661` が
 *       L1496 に 2 回現れるため、`collectReferences` の重複除去で出力は 11 件になる。
 *       タスク 115.172 の是正後の版は同じ過検出 1 件のみを検出し、本タスクでその
 *       書き方を改めて 0 件にした。
 *       既存の二つの検査はいずれもこの形を覆わない——本検査 (1) は**本番コードから設計文書へ**
 *       の向きを、`check:design-code-refs` は**設計文書から本番コードへ**の向きを見ており、
 *       設計文書が自分自身を指す形はどちらの網にも掛からない。
 *       `check:design-path-refs`（タスク 115.173）の境界はパス・シンボルの**実在**であり、
 *       行番号の失効は覆わない。
 *
 * 設計文書の側だけ、言及の判定を広げる（DESIGN_SELF_MENTION を参照）:
 *   設計文書は自分自身を `design.md` と綴らずに「本書」「本文書」「同文書」と呼ぶ。
 *   本番コードにこれらの語は現れないため、広げるのは設計文書の走査だけである。
 *
 * オプション:
 *   --verbose  検出行の全文を出力する
 *   --json     JSON 形式で出力する
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   走査対象が一件も見つからない場合は「合格」ではなく失敗として扱う。
 *   **二つの母集団それぞれに独立した出口がある**——片方が空でももう片方の件数で
 *   覆い隠されないようにするためである。
 *   パスの変更や実行位置の誤りで検査が静かに素通りすることを防ぐ。
 *
 * 許容リストは持たない。検出を名指しで許容へ逃がす経路そのものを置かない。
 * 担保は自己検査の二つが負う。`checkNoFindingsNarrowing` は、走査対象の決定
 * （`collectSourceFiles`）・検出（`scanSource`）・集計（`run`）・報告と終了コード（`main`）の
 * 4 段について、走査対象一覧と検出結果に触れる文を積み上げ・返却・判定だけに限定し、
 * 集計と検出には絞り込みの操作（`filter` / `slice` / `splice` / `find` / `some` / `includes` /
 * `Set` / `Map` / `continue` / `delete`）と JSON 読み出しを禁じる。
 * `checkReportedCountsAreExact` は本体をサブプロセスとして起動し、報告される件数と
 * 終了コードを期待値と突き合わせる（仮のリポジトリには実在するスペックと同じ名前を使う）。
 * **名前の一致で見る形は担保にならない。** `run` の設計文書ループへ
 * `if (relativePath.includes('site-survey')) continue;` を 1 行足す変異を当てると、
 * 名前と文字列リテラルだけを見ていた旧い形の自己検査は 55 件すべて緑で素通りし、
 * 強化後の形では 56 件中 1 件が落ちる（2026-08-31 に実測。経緯は
 * `.kiro/specs/site-survey/design.md` の「本スペック発の共有部品と関門」の節に記録した）。
 *
 * 開示済みの限界（設計文書の走査について）:
 *   - **数値の側に位置の標識が無い形は捕まえられない。** タスク 115.172 が撤去した記述には
 *     `awk -F: '$1+0 > 1479 || 1342 > $1+0'` という、監査コマンドの引数として行番号を
 *     固定した形が含まれていた。本検査の規則はいずれもこれに当たらない（実測で確認した）。
 *     コマンドの引数と件数の記述を機械的に区別できないためであり、見逃す側へ倒してある。
 *   - **参照先の実在は見ない。** 見るのは形式だけである。行番号を持たない参照が
 *     実在する節を指しているかは `npm run check:design-path-refs` と読み手の所管である。
 *   - `requirements.md` / `tasks.md` を指す行番号参照は走査しない（別の文書であり、
 *     本検査の境界は「設計文書の位置を行番号で指す参照」である）。
 *   - 設計文書への言及と同じ行に現れる**件数**は行番号と区別できず検出される
 *     （`本書の本文行は合計 166 行` など）。件数は「166 件」と書くこと。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// 設計文書の母集団は対偶の検査（`check:design-code-refs`）および実在の検査
// （`check:design-path-refs`）と同一である。走査根は scripts/design-document.ts が
// 唯一の担い手であり、本ファイルは使うだけで持たない（タスク 115.231）。
// かつては scripts/check-design-code-reference-format.ts から借りて再輸出していたが、
// 借用の連鎖は「誰が定義しているか」を読み手から隠すため、三者とも共有部品を直に取り込む。

// ============================================================================
// 型定義
// ============================================================================

/** 検出元の母集団。`production` は本番コード、`design` は設計文書自身 */
export type FindingKind = 'production' | 'design';

export interface DesignRefFinding {
  /** どちらの母集団で見つかったか */
  kind: FindingKind;
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
  /** 設計文書の置き場所（リポジトリ相対）。既定は SPEC_DIR */
  specDir?: string;
}

export interface RunResult {
  findings: DesignRefFinding[];
  scannedFileCount: number;
  scannedDirs: string[];
  /** 走査した設計文書（リポジトリ相対）。タスク 115.211 で足した母集団 */
  scannedDesignDocuments: string[];
  specDir: string;
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
 * 設計文書が自分自身を呼ぶときの名（タスク 115.211）。
 *
 * 設計文書は自分自身を `design.md` と綴るとは限らず、これらの語で呼ぶ。
 * 語は一箇所で宣言し、門（DESIGN_SELF_MENTION）と規則（self-name-colon）の双方が借りる。
 * 二箇所に書くと、語を足したときに門だけ／規則だけが広がる。
 *
 * 「本節」「本表」は**含めない**。含めると、節や表の規模・ファイルの分量を「N 行」と
 * 数える記述（設計文書に多い）が行番号参照と区別できなくなる。**一語ずつ実行して
 * 確かめてある**（いずれも 2026-08-31 に実測）。
 *   - `'本節'` だけを足すと、`npm run check:design-refs` は
 *     `.kiro/specs/site-survey/design.md` の 2 件（`本節は …（合計 166 行）` と
 *     `` `LazyImage.tsx`（当時 303 行のファイル）… **本節を書いた時点** ``）を検出する。
 *     いずれも位置の指定ではなく、真の検出は 0 件である。
 *     `npm run check:design-refs:selftest` は 56 件中 1 件が落ちる。
 *   - `'本表'` だけを足すと、現況の設計文書 13 件からの検出は 0 件のままで、
 *     **本検査は緑になる**。実データに `本表` と行番号らしい数値が同居する行が無いためで、
 *     実物だけでは線を固定できない。そこで自己検査に**原文の `本節` を `本表` へ
 *     差し替えた一行**を陰性対照として置いてある。この変異で自己検査は 56 件中
 *     1 件が落ちる。
 *   - 2 語とも足すと自己検査は 56 件中 2 件が落ちる。
 */
const DESIGN_SELF_NAMES = ['本書', '本文書', '同文書', '本設計書'] as const;

/**
 * 設計文書の中で「設計文書を指している」と読める言及（タスク 115.211）。
 * 自称の語は本番コードの注釈には現れないため、広げるのは設計文書の側だけである。
 */
const DESIGN_SELF_MENTION = new RegExp(`design\\.md|${DESIGN_SELF_NAMES.join('|')}`, 'i');

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

/**
 * 設計文書の走査にだけ足す規則（タスク 115.211）。
 *
 * 自称（`本書` など）に行番号を直付けする形は、本番コードの注釈には現れない。
 * 共有の規則のうち、`design.md` の綴りを要求しない形（範囲・括弧・`L` 前置・後置の「行」・
 * 節記号）は自称でもそのまま当たるが、**コロン直付けだけは綴りに縛られている**ため
 * ここで補う。`scanDesignDocumentLine` から本規則群を外す変異を当てると、
 * `npm run check:design-refs:selftest` は 56 件中 2 件が落ちる——陽性対照
 * `本設計書:661` と、同じ一行を材料に使う `checkNoFindingsNarrowing` の件数の突き合わせ
 * （2026-08-31 に実測）。共有の adjacent 規則は `design.md` の綴りを要求するためである。
 *
 * 位置の標識としてコロンを要求する。空白区切りの裸の数値（`本書 166 件`）まで拾うと
 * 件数の記述と区別できないためである。
 */
const DESIGN_SELF_REFERENCE_PATTERNS: ReadonlyArray<Rule> = [
  {
    name: 'self-name-colon',
    pattern: new RegExp(
      String.raw`(?:${DESIGN_SELF_NAMES.join('|')})\s*[:：]\s*L?\s*\d{2,4}(?![\d.])`,
      'g'
    ),
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
function collectReferences(
  lineText: string,
  mention: RegExp,
  extraRules: ReadonlyArray<Rule> = []
): string[] {
  if (!mention.test(lineText)) return [];
  const spans: Span[] = [];
  for (const { pattern, reject } of [...LINE_REFERENCE_PATTERNS, ...extraRules]) {
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

/** 本番コードの一行に対して、設計文書を行番号で指す参照を検出する */
export function scanLine(lineText: string): string[] {
  return collectReferences(lineText, DESIGN_DOC_MENTION);
}

/**
 * 設計文書の一行に対して、設計文書を行番号で指す参照を検出する（タスク 115.211）。
 *
 * 規則は本番コードと同一で、門だけが広い（DESIGN_SELF_MENTION）。
 * 規則を共有するのは、禁じている理由が**参照先である設計文書の行数が変わり続けること**
 * であり、参照がどこに書かれているかに依らないためである。
 */
export function scanDesignDocumentLine(lineText: string): string[] {
  return collectReferences(lineText, DESIGN_SELF_MENTION, DESIGN_SELF_REFERENCE_PATTERNS);
}

/** 一つのソースから行番号参照を検出する（一行につき一件） */
export function scanSource(
  relativePath: string,
  source: string,
  kind: FindingKind = 'production'
): DesignRefFinding[] {
  const scan = kind === 'design' ? scanDesignDocumentLine : scanLine;
  const findings: DesignRefFinding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    const references = scan(lineText);
    if (references.length === 0) return;
    findings.push({
      kind,
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
  const specDir = options.specDir ?? SPEC_DIR;

  // 走査した件数は**実際に読んだ分**を積み上げて数える。列挙結果をそのまま返すと、
  // 読む側で 1 件でも間引いたときに件数だけが元のまま残り、報告が実態とずれる。
  const findings: DesignRefFinding[] = [];
  const scannedFiles: string[] = [];
  const scannedDesignDocuments: string[] = [];

  for (const relativePath of collectSourceFiles(root, sourceDirs)) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    scannedFiles.push(relativePath);
    findings.push(...scanSource(relativePath, source, 'production'));
  }
  for (const relativePath of collectDesignDocuments(root, specDir)) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    scannedDesignDocuments.push(relativePath);
    findings.push(...scanSource(relativePath, source, 'design'));
  }

  return {
    findings,
    scannedFileCount: scannedFiles.length,
    scannedDirs: sourceDirs,
    scannedDesignDocuments,
    specDir,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run({ verbose, json });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗。
  // 二つの母集団それぞれに独立した出口を置く（片方が空でも沈黙させない）。
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

  if (result.scannedDesignDocuments.length === 0) {
    if (!json) {
      console.error('❌ 走査対象の設計文書が一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.specDir} 配下の ${DESIGN_DOC_NAME}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ 設計文書を行番号で指す参照が見つかりました');
      console.error('');
      console.error(
        '   設計文書は追記・改訂で行数が変わるため、行番号の参照は原理的に維持できません。'
      );
      console.error('   節の題とシンボル名で指す形へ改めてください。');
      console.error('   設計文書自身が書いている場合も同じです（タスク 115.211）。');
      console.error('');
      const byFile = new Map<string, DesignRefFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        const kind = list[0]?.kind === 'design' ? '設計文書' : '本番コード';
        console.error(`   ${file} [${kind}] (${list.length}件)`);
        for (const finding of list) {
          console.error(`     L${finding.line}: ${finding.reference}`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル` +
          `（走査 本番コード ${result.scannedFileCount} ファイル、設計文書 ${result.scannedDesignDocuments.length} ファイル）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ 設計文書への行番号参照はありません（走査 本番コード ${result.scannedFileCount} ファイル: ` +
        `${result.scannedDirs.join(', ')}、設計文書 ${result.scannedDesignDocuments.length} ファイル: ` +
        `${result.specDir} 配下の ${DESIGN_DOC_NAME}）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
