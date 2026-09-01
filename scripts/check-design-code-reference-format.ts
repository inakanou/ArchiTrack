/**
 * @fileoverview 設計文書から本番コードを「行番号で指す参照」の検出スクリプト
 *
 * 本スクリプトはタスク 115.100 が置いた `check-design-reference-format.ts` の**対偶**である。
 * 115.100 は「本番コードの注釈が設計文書を行番号で指す」向きを禁じた。その理由
 * ——「参照先は複数回行数が変わっており、行番号の参照は原理的に維持できない」——は
 * **向きを入れ替えても同じく成立する**。本番コードの行数も改修のたびに変わり続けるため、
 * 設計文書が本番コードを `パス:行` で指していると、参照は静かにずれていく。
 *
 * site-survey の `design.md` は「実装へ行の増減を伴う変更を加えたタスクは、当該ファイルを
 * 指す本書の `パス:行` を全件測り直す責任を負う」と定めていたが、**規約は各タスクの境界内で
 * しか働かない**ため、境界外の失効は測り直されずに残り続けた。タスク 115.149 の実測では、
 * 実体表の `| \`Symbol\` | \`パス:行\` |` 形式 69 件のうち 16 件が、当該行が当該名の宣言では
 * なくなっていた（`AnnotationData` は記載 620 行に対し実測 461 行など）。
 * 人手の測り直しは次の実装変更で再び失効するため、115.149 は
 *   (a) 設計文書側の参照を「パス＋シンボル名／節の題」で指す形へ改め、
 *   (b) 行番号で指す形が再び混入したら失敗させる本検査を置く、
 * の両方を採った。本スクリプトが (b) にあたる。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-code-reference-format.ts [options]
 *   npm run check:design-code-refs
 *
 * 検出する形:
 *   frontend/src/foo.ts:123 / backend/src/bar.ts:100-120 / FooTool.ts:371
 *   frontend/src/foo.ts#L123 / `SurveyImageInfo`:54 / 同ファイル `:931`
 *   `frontend/src/foo.tsx` (362行目) / `backend/src/bar.ts`（300-324行目）
 *   同 246 行 / （99 行） / 334 / 471 / 519 行 / `foo.service.ts` / `278`
 *   Line 319-353 / line 520 付近 / （L602-616） / （行507-509） / 行 575-905 付近
 *   `foo.service.ts` の 226 / 263 / `| foo.tsx | 19、70、249 |`（区切りで連ねた数値列）
 *   表頭に `行` 列を持つ表の当該列（`| ファイル | 行 | 件数 |` の 2 列目）
 *   いずれも「本番コードの位置を行番号で指す」書き方であり、維持できない。
 *
 * 正しい形:
 *   パス（行番号なし）とシンボル名で指す。
 *   例: `frontend/src/types/site-survey.types.ts` の `AnnotationData`
 *
 * 走査対象（タスク 115.149 の境界「設計文書から本番コードへの参照形式」に対応）:
 *   `.kiro/specs/<feature>/design.md` の全件。
 *   参照先がテストコード（*.test.* / *.spec.* / __tests__ / __mocks__ / test-utils / e2e）や
 *   他の文書（*.md）である参照は、本検査の境界外のため検出しない。
 *
 * 検出しない形（限界。見逃し側へ倒してある）:
 *   - `パス` の言及が同じ行に無い行番号（`実測 386 行`、`記載 252 / 実測 273`）。何の行番号か
 *     判らないため検出しない。相対形は本番コードの言及がある行でのみ検出する。
 *   - **位置の標識を伴わない裸の数値**のうち、規則を足したあとも残るのは次の2形である
 *     （この一覧は本節の他の項目を打ち消さない。境界外の参照・拡張子・空白を挟む前置の
 *     「行」などは、標識の有無とは別の理由でここに並んでいる）。
 *     (1) **単独の裸数値**（`` `foo.ts` の 226 のみ ``、`記載 252`、`77→98`）。
 *         件数の記述（`226 件`）と機械的に区別できない。**真に判定不能な残余**であり、
 *         規則で捕まえる方法は無い。
 *     (2) **全要素が 2 桁の数値列**（`` `foo.ts` の 5、19 ``）。`delimited-line-list` は
 *         3 桁以上の要素を一つも含まない列を外すため検出しない。座標・添字・件数の
 *         併記（`[1,0,0,1,0,0]`、`座標 (0,0)`）と区別できないためである。
 *     **かつてここに挙げていた「区切りで連ねた数値列」と「表のセルに数値だけを置いた形」は、
 *     タスク 115.149 の第5回是正で検出するようになった**（`delimited-line-list` と
 *     `line-column-table`）。前者は同じ行の本番コードの言及を、後者は表頭の `行` 列を
 *     「何の数値か」の手掛かりに使う。**位置の標識は数値の隣にしか置けない、という前提は
 *     誤りである**——手掛かりは同じ行の他の語や表の構造にも置ける。
 *     過検出は「検査の主張を消す圧力」になるため、上の (1)(2) は取りこぼす側を選んだ。
 *   - 空白を挟む前置の「行」（`実体行 85`）。`3行1セット` と同型の件数の書き方であり、
 *     実測では位置の指定が一件も無かったため検出しない。
 *   - 1 桁の行番号（`同 5 行`）。`3 行を削除した` のような件数の記述と区別できないため
 *     検出しない。設計文書の実際の参照はすべて 2 桁以上であった（115.149 の実測）。
 *   - 「N 行のファイル」のような**分量**の記述（isFileLengthDescription を参照）。
 *   - `requirements.md` / `tasks.md` など `design.md` 以外の文書に置かれた同種の参照。
 *   - 本番コードでも `SOURCE_EXTENSION`（`.ts` / `.tsx` / `.js` 系）**以外の拡張子**を指す参照。
 *     スキーマ定義（`backend/prisma/schema.prisma`）や設定ファイルを `パス:行` で指す形は検出しない。
 *   - 参照先ファイルが実在するかどうか（本検査は**形式**のみを見る。実在しないファイルを
 *     指す参照——例: 既に削除された `ImageViewer.tsx`——は形式が正しければ通過する）。
 *
 * 検出しすぎる可能性（限界。過検出側。いずれも 115.149 の実測で確認した実例がある）:
 *   - 本番コードのパスを言及する行で、**表の行数**を「44行」のように書くと検出される
 *     （`下表は現在44行である`）。行番号との区別が付かないため、件数は「44件」と書くこと。
 *   - 同じ行で**ファイルの分量**を「303 行」と書くと検出される。`303 行のファイル` の形
 *     （isFileLengthDescription）だけは外すが、`303 行ある` などの言い回しは検出される。
 *   - 本番コードのパスを言及する行に現れる `` `キー`: 1234 `` 形（設定値の例示など）は
 *     相対行参照と区別できず検出される。実際の設計文書には現れていないが、
 *     将来そのような記法を書くと誤検出になる。
 *   - 空白を挟まない前置の「行」を件数の意味で書くと検出される（`1行30文字`）。
 *     件数は `1 行あたり 30 文字` のように空白を挟んで書くこと。
 *   - 英語の `line` に続く数値は、同じ行にパスが無くても検出される（`line 3 of the table`）。
 *   - 本番コードのパスを言及する行で、3 桁以上を含む数値を区切りで連ねて書くと検出される
 *     （`延べ 120 / 340 件`）。件数の併記は `120 件と 340 件` のように区切りを使わずに書くこと。
 *     千位区切り（`16,754`）と、要件・規約の番号を導く語の直後（`Req` / `Requirement` /
 *     `REQ-` / `要件` / `規約`。例: `要件 31, 32`）は外してある。
 *   - 表頭に `行` 列を持つ表は、当該列のセルに数値があり、かつ同じ行に本番コードの言及が
 *     あれば検出される。行番号以外の意味で `行` 列を設けたい場合は列名を改めること。
 *   過検出は検査そのものの主張を弱めるため、上の各件は**書き方の側を改める**ことで避ける。
 *
 * オプション:
 *   --verbose  検出行の全文を出力する
 *   --json     JSON 形式で出力する
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   走査対象の設計文書が一件も見つからない場合は「合格」ではなく失敗として扱う。
 *   許容リスト（baseline）は持たない。検出を許容へ逃がす経路そのものを置かない。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

export interface CodeRefFinding {
  /** リポジトリ相対の設計文書パス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 検出した参照そのもの（例: `frontend/src/foo.ts:123`） */
  reference: string;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** 走査対象の設計文書の置き場所（リポジトリ相対）。既定は SPEC_DIR */
  specDir?: string;
}

export interface RunResult {
  findings: CodeRefFinding[];
  scannedFiles: string[];
  specDir: string;
}

// ============================================================================
// 走査対象の決定
// ============================================================================
//
// 走査根（`SPEC_DIR` / `DESIGN_DOC_NAME` / `collectDesignDocuments`）は
// scripts/design-document.ts が唯一の担い手である（タスク 115.231）。本ファイルは使うだけで
// 持たない。かつては本ファイルが定義し scripts/check-design-path-references.ts が複製を
// 持っていた——一箇所へ寄せた理由と、複製間で実測した差は共有部品の冒頭に記す。

// ============================================================================
// 検出規則
// ============================================================================

/** 本番コードの拡張子 */
const SOURCE_EXTENSION = String.raw`(?:tsx?|jsx?|cjs|mjs)`;

/** ディレクトリを伴う本番コードのパス（`frontend/src/...`、`backend/scripts/...`） */
const QUALIFIED_PATH = String.raw`(?:frontend|backend)/[A-Za-z0-9_@./-]+\.${SOURCE_EXTENSION}`;

/** ディレクトリを伴わないファイル名（`FreehandTool.ts`、`client.ts`）。設計文書は「同ファイル」の意味でこの形を使う */
const BARE_FILENAME = String.raw`[A-Za-z0-9_@-][A-Za-z0-9_@.-]*\.${SOURCE_EXTENSION}`;

/** 参照先がテストコードであることを示す形（本検査の境界外） */
const TEST_REFERENCE =
  /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|__mocks__|__fixtures__|test-utils|e2e)\//;

/**
 * 参照先が本番コードかどうか。
 * テストコード・E2E を指す参照は 115.149 の境界外であり検出しない。
 */
export function isProductionReference(referencePath: string): boolean {
  return !TEST_REFERENCE.test(referencePath);
}

/**
 * 行が本番コードのファイルに言及しているか。
 * 相対形（`同ファイル `:931``、`（99行）`）は、それ単体では何の行番号か判らないため、
 * 同じ行に本番コードの言及があることを条件にする。
 */
export function mentionsProductionSource(lineText: string): boolean {
  const pattern = new RegExp(String.raw`(?:${QUALIFIED_PATH}|${BARE_FILENAME})`, 'g');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(lineText)) !== null) {
    if (isProductionReference(match[0])) return true;
  }
  return false;
}

/**
 * 「N 行のファイル」——ファイルの分量の記述であって位置の指定ではない形かどうか。
 *
 * `未使用の \`LazyImage.tsx\`（当時 303 行のファイル）を削除する` のように、
 * 行数を**分量**として書く形は実在する。位置を指す `同 303 行` とは意味が異なり、
 * 行数が変わっても記述は陳腐化するだけで**参照先を取り違えさせない**ため、本検査は関知しない。
 * 判別は「直後に『のファイル』が続くか」だけで行う。個別の箇所を許すのではなく、
 * 分量を表す**書き方**を外す（許容リストではない）。
 */
function isFileLengthDescription(matched: string, lineText: string, index: number): boolean {
  return lineText.slice(index + matched.length).startsWith('のファイル');
}

/** 千位区切りの数（`16,754`、`1,737`）かどうか。`,` の前後に空白が無く、後続がちょうど 3 桁の形 */
function isThousandsSeparated(matched: string): boolean {
  return /^\d{1,3}(?:,\d{3})+$/.test(matched);
}

/** 直前に置かれると数値が要件・規約の番号であることを示す語 */
const REQUIREMENT_NUMBER_PREFIX = /(?:Req(?:uirement)?s?|REQ-|要件|規約)\s*$/;

/**
 * 区切りで連ねた数値列のうち、**行番号ではないと判る**ものを外す述語。
 *
 * 外すのは次の三つで、いずれも個別の箇所ではなく**書き方**を外す（許容リストではない）。
 *   (a) 3 桁以上の要素を一つも含まないもの（`5、19`、`[1,0,0,1,0,0]`、`座標 (0,0)`）。
 *       2 桁だけの数値列は件数・添字・座標の書き方と機械的に区別できない。
 *       **その結果、全要素が 2 桁の行番号列は検出できない**（限界。@fileoverview に明記）。
 *   (b) 千位区切り（`16,754`、`1,737`）。件数の書き方である。
 *   (c) 直前が `Req` / `Requirement` / `REQ-` / `要件` / `規約` のもの（`Req 5, 6, 22`、
 *       `要件 31, 32, 33, 34`）。要件番号の併記である。
 */
function isNotDelimitedLineList(matched: string, lineText: string, index: number): boolean {
  const elements = matched.split(/\s*[、,/／]\s*/);
  if (!elements.some((element) => element.trim().length >= 3)) return true;
  if (isThousandsSeparated(matched)) return true;
  if (REQUIREMENT_NUMBER_PREFIX.test(lineText.slice(0, index))) return true;
  return false;
}

interface Rule {
  /** 規則の名前（診断用） */
  name: string;
  /** 一致させる形 */
  pattern: RegExp;
  /** 同じ行に本番コードの言及があることを条件にするか */
  requiresSourceMention: boolean;
  /** 一致のうち本番コードへの参照ではないと判るものを外す述語 */
  reject?: (matched: string, lineText: string, index: number) => boolean;
}

/** `パス:行` の一致から参照先パスを取り出し、テストコード参照なら捨てる */
function rejectsTestReference(matched: string): boolean {
  const withoutLine = matched.replace(/\s*[:#].*$/, '').replace(/\s*[/／]\s*`?\d.*$/, '');
  return !isProductionReference(withoutLine);
}

/**
 * 本番コードを行番号で指す参照の形。
 *
 * 実際の設計文書には次の書き方が混在していた（115.149 の実測）。
 *   frontend/src/types/site-survey.types.ts:620 / FreehandTool.ts:371
 *   backend/src/services/image-upload.service.ts:185-187 / `client.ts:303-352`
 *   `SurveyImageInfo`:54 / 同ファイル `:931` / （`:4086-4120`）
 *   `TradingPartnerSelect.tsx` (362行目) / `project.service.ts`（300-324行目） / （99行）
 * いずれも「本番コードの位置を行番号で指す」点で同じであり、同じく維持できない。
 */
export const LINE_REFERENCE_RULES: ReadonlyArray<Rule> = [
  {
    // パスに行番号を直付けする形（`foo.ts:123`、`foo.ts:100-120`、`foo.ts#L123`）
    name: 'path-line',
    pattern: new RegExp(
      String.raw`(?:${QUALIFIED_PATH}|${BARE_FILENAME})\s*(?::\s*L?|#L)\s*\d+(?:\s*[-–~]\s*\d+)?`,
      'g'
    ),
    requiresSourceMention: false,
    reject: rejectsTestReference,
  },
  {
    // パスの後ろにスラッシュで連ねる行番号（`` `batch-upload.service.ts` / `278` ``、
    // `AnnotationEditor.tsx:810/887/1054`）。パスに直付けした形の変種である。
    name: 'slash-separated-line',
    pattern: new RegExp(
      String.raw`(?:${QUALIFIED_PATH}|${BARE_FILENAME})\`?(?:\s*[/／]\s*\`?\d{2,4}(?:\s*[-–~]\s*\d{2,4})?\`?)+`,
      'g'
    ),
    requiresSourceMention: false,
    reject: rejectsTestReference,
  },
  {
    // 区切り（`、` / `,` / `/` / `／`）で連ねた数値列（`` `survey-image.service.ts` の 226 / 263 ``、
    // `| foo.tsx | 19、70、249、283 |`）。**数値の側に位置の標識が無い**形であり、115.149 の
    // 第4回の是正まで死角として明示的に除外していた。標識が無い以上「何の数値か」は
    // 同じ行の文脈からしか判らないため、**同じ行に本番コードの言及があること**を門番にし、
    // そのうえで行番号ではないと判る書き方（isNotDelimitedLineList）を外す。
    name: 'delimited-line-list',
    pattern: /(?<![\d.\w])\d{1,4}(?:\s*[、,/／]\s*\d{1,4})+(?![\d.\w])/g,
    requiresSourceMention: true,
    reject: isNotDelimitedLineList,
  },
  {
    // バッククォートの直後に来る相対的な行番号（`` `SurveyImageInfo`:54 ``、`` 同ファイル `:931` ``）。
    // 単体では何の行番号か判らないため、同じ行に本番コードの言及があることを条件にする。
    name: 'relative-colon',
    pattern: /`\s*:\s*\d{2,4}(?:\s*[-–~]\s*\d{2,4})?/g,
    requiresSourceMention: true,
  },
  {
    // 後置の「行」「行目」（`362行目`、`300-324行目`、`同 246 行`、`（99 行）`、
    // `334 / 471 / 519 行`）。範囲と併記の区切り（`-` / `/` / `,` / `、`）を伴う形も一件として捉える。
    // 単体では何の行番号か判らないため、同じ行に本番コードの言及があることを条件にする。
    name: 'suffixed-line',
    pattern: /\d{2,4}(?:\s*[-–~/／,、]\s*\d{2,4})*\s*行目?/g,
    requiresSourceMention: true,
    reject: isFileLengthDescription,
  },
  {
    // 英語の行指示（`Line 319-353`、`line 520`、`Lines 80`）。**語そのものが位置の標識**で
    // あり、同じ行にパスが無くても「何の数値か」は一意に定まるため、門番を課さない。
    // `inline` / `newline` / `Guidelines` の末尾に埋もれた `line` を拾わないよう、
    // 直前が英字でないことを後読みで条件にする（記号は一致に含めない）。
    name: 'line-word',
    pattern: /(?<![A-Za-z])[Ll]ines?\s+#?\s*\d{1,4}(?:\s*[-–~/／,、]\s*\d{1,4})*/g,
    requiresSourceMention: false,
  },
  {
    // `L` 接頭の行指示（`L602-616`、`L127-700`、`L85-95`）。GitHub のアンカー記法
    // （`#L166`）と同じ標識を括弧内で使う形である。単体では何の行番号か判らないため、
    // 同じ行に本番コードの言及があることを条件にする。
    name: 'l-prefixed-line',
    pattern: /(?<![A-Za-z0-9_])L\s*\d{2,4}(?:\s*[-–~/／,、]\s*\d{2,4})*/g,
    requiresSourceMention: true,
  },
  {
    // 前置の「行」（`行507-509`、`行671-689`、`コード行377`）。後置の「N 行」と対をなす、
    // 標識を数値の**手前**に置く形である。`3行1セット`・`明細行0件` のような件数の記述と
    // 区別するため、**空白を挟まない 2 桁以上**に限る（`実体行 85` のように空白を挟む形は
    // 件数の書き方であり、実測でも位置の指定は一件も無かった）。
    name: 'prefixed-line',
    pattern: /行\d{2,4}(?:\s*[-–~/／,、]\s*\d{2,4})*/g,
    requiresSourceMention: false,
  },
  {
    // 「N 付近」（`行 575-905 付近`、`520 付近`）。範囲をぼかしても位置の指定であることは
    // 変わらない。単体では何の行番号か判らないため、同じ行に本番コードの言及があることを
    // 条件にする（`line 520 付近` は上の line-word が門番なしで捉える）。
    name: 'approximate-line',
    pattern: /\d{2,4}(?:\s*[-–~/／,、]\s*\d{2,4})*\s*付近/g,
    requiresSourceMention: true,
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
 * 複数の規則が同じ箇所に重なって一致しうるため、他の一致に包含される一致は捨てる。
 * 一行に複数の独立した参照があれば、その数だけ返す。
 */
export function scanLine(lineText: string): string[] {
  const hasSourceMention = mentionsProductionSource(lineText);
  const spans: Span[] = [];
  for (const rule of LINE_REFERENCE_RULES) {
    if (rule.requiresSourceMention && !hasSourceMention) continue;
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end === start) break;
      if (rule.reject?.(match[0], lineText, start)) continue;
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
    const key = `${span.start}:${span.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(span.text);
  }
  return references;
}

/** Markdown 表の一行をセルへ分解する。表の行でなければ空配列を返す */
export function splitTableRow(lineText: string): string[] {
  const trimmed = lineText.trim();
  if (!trimmed.startsWith('|')) return [];
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** 表の区切り行（`|---|---|`）かどうか */
function isTableSeparatorRow(lineText: string): boolean {
  const cells = splitTableRow(lineText);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * 表頭に「行」列があればその位置を返す（無ければ -1）。
 * 装飾（バッククォート・強調）を落としたうえで完全一致で判定する。
 * 「実行」「行数」「改行」のような別語の部分一致を拾わないためである。
 */
export function findLineColumnIndex(headerCells: string[]): number {
  return headerCells.findIndex((cell) => {
    const normalized = cell.replace(/[`*]/g, '').trim();
    return normalized === '行' || normalized === '行番号';
  });
}

/**
 * 表頭に `行` 列を持つ表の、当該列のセルに置かれた行番号を検出する。
 *
 * 行単位の `scanLine` では**表の構造が見えない**ため、`| foo.ts | 20 | 1 |` のように
 * 列の見出しだけが「これは行番号である」と告げている形は、行だけを見ても
 * 件数と区別できない。位置の標識は数値の隣ではなく**表頭**にあるため、
 * 文書単位の走査で表を辿ってから当該列を読む。
 *
 * 同じ行に本番コードの言及があることを門番にするのは `scanLine` の相対形と同じ理由で、
 * どのファイルの行番号かが判らない表は参照として成立していないためである。
 */
export function scanTableLineColumns(
  relativePath: string,
  lines: string[],
  alreadyFound: ReadonlyArray<CodeRefFinding> = []
): CodeRefFinding[] {
  const seen = new Set(alreadyFound.map((finding) => `${finding.line}:${finding.reference}`));
  const findings: CodeRefFinding[] = [];
  for (let index = 0; index + 1 < lines.length; index++) {
    const headerLine = lines[index];
    const separatorLine = lines[index + 1];
    if (headerLine === undefined || separatorLine === undefined) continue;
    const headerCells = splitTableRow(headerLine);
    if (headerCells.length < 2) continue;
    if (!isTableSeparatorRow(separatorLine)) continue;
    const columnIndex = findLineColumnIndex(headerCells);
    if (columnIndex < 0) continue;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
      const rowLine = lines[rowIndex];
      if (rowLine === undefined) break;
      const cells = splitTableRow(rowLine);
      if (cells.length === 0) break;
      const cell = cells[columnIndex];
      if (cell === undefined || !/\d/.test(cell)) continue;
      if (!mentionsProductionSource(rowLine)) continue;
      // 同じ箇所を `scanLine` の規則が既に捉えていることがある（`| foo.ts | 19、70、249 |` は
      // `delimited-line-list` にも当たる）。**間引きではなく重複の排除**であり、
      // 落とすのは行番号と参照文字列の両方が一致する重複だけである。
      const key = `${rowIndex + 1}:${cell}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        file: relativePath,
        line: rowIndex + 1,
        reference: cell,
        snippet: rowLine.trim(),
      });
    }
  }
  return findings;
}

/** 一つの設計文書から行番号参照を検出する */
export function scanDocument(relativePath: string, source: string): CodeRefFinding[] {
  const findings: CodeRefFinding[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const reference of scanLine(lineText)) {
      findings.push({
        file: relativePath,
        line: index + 1,
        reference,
        snippet: lineText.trim(),
      });
    }
  });
  // 表の `行` 列は行単位の走査では見えないため、文書単位で足す
  findings.push(...scanTableLineColumns(relativePath, lines, findings));
  return findings;
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const specDir = options.specDir ?? SPEC_DIR;
  const documents = collectDesignDocuments(root, specDir);

  const findings: CodeRefFinding[] = [];
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    findings.push(...scanDocument(relativePath, source));
  }

  return { findings, scannedFiles: documents, specDir };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');

  const result = run();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  // 前提条件で検査を無効化しない: 走査対象が空なら合格ではなく失敗
  if (result.scannedFiles.length === 0) {
    if (!json) {
      console.error('❌ 走査対象の設計文書が一件も見つかりませんでした');
      console.error(`   走査したディレクトリ: ${result.specDir}`);
      console.error(
        '   リポジトリルートで実行しているか、対象パスが変わっていないか確認してください'
      );
    }
    process.exit(1);
  }

  if (result.findings.length > 0) {
    if (!json) {
      console.error('❌ 設計文書から本番コードを行番号で指す参照が見つかりました');
      console.error('');
      console.error(
        '   本番コードは改修で行数が変わるため、行番号の参照は原理的に維持できません。'
      );
      console.error('   パス（行番号なし）とシンボル名で指す形へ改めてください。');
      console.error('   例: `frontend/src/types/site-survey.types.ts` の `AnnotationData`');
      console.error('');
      const byFile = new Map<string, CodeRefFinding[]>();
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
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル（走査 ${result.scannedFiles.length} ファイル）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ 本番コードへの行番号参照はありません（走査 ${result.scannedFiles.length} ファイル: ${result.specDir}/*/${DESIGN_DOC_NAME}）`
    );
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
