/**
 * @fileoverview 設計文書が挙げるパス・ファイル名の**実在**検査
 *
 * タスク 115.149 が置いた `check-design-code-reference-format.ts` は、設計文書から本番コードへの
 * 参照の**形式**（行番号で指していないか）だけを見る。同スクリプトが限界として明記するとおり、
 * **実在しないファイルを指す参照は形式が正しければ通過する**。タスク 115.169 が置いた
 * `check-steering-file-references.ts` は実在を見るが、対象は `.kiro/steering/*.md` に限られる。
 * 本スクリプトはその二つの穴の交点——**設計文書（`.kiro/specs/<feature>/design.md`）が挙げる
 * パスの実在**——を所管する（タスク 115.173）。
 *
 * ## steering と設計文書の違い（なぜ 115.169 の判断をそのまま使えないか）
 *
 * 115.169 は「steering は現在の構成の記述であり歴史記録ではないので、挙げたファイルは全件が
 * 現存主張である」と判断できた。**設計文書ではこれが成立しない。** 設計文書は当時の判断を
 * 意図して保存する歴史記録であり、`site-survey/design.md` は撤去済みのファイルを
 * 「撤去した」という記録として名指しで残している（タスク 115.85 / 115.107 / 115.146 / 112.1）。
 * これらを告発する検査は、記録を消させる圧力になるため成立しない。
 *
 * したがって本検査は**現存主張と撤去の記録を区別する**。区別の手掛かりは発明ではなく、
 * 実データにあるものを使う: 設計文書は撤去したファイルについて、**そのファイルを名指しつつ
 * 不在を述べる行**を必ず一つ持っている（「撤去済み」「削除」「実在しない」など）。
 * 着手時の実測（13 文書・候補トークン 1251 件）では、実在しないパス参照は延べ 80 件あり、
 * うち 73 件が同じ文書内に不在の記録を持っていた（`site-survey/design.md` 71 件、
 * `estimate-creation/design.md` 1 件、`estimate-request/design.md` 1 件）。記録を持たない
 * 7 件は**すべて真の失効**であり、タスク 115.173 で是正した。免除した 73 件のうち 72 件は
 * 実際に撤去・削除の記録であり、残る 1 件だけが誤った免除である（下の限界の一つ目）。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-path-references.ts [--verbose] [--json]
 *   npm run check:design-path-refs
 *
 * ## 検出する形（いずれも「このパス／ファイルが在る」と述べている形）
 *
 *   (1) **ルート相対パス**: バッククォートで囲まれた文字列**全体**が
 *       `[A-Za-z0-9_.@-]+(/[A-Za-z0-9_.@-]+)+` に一致し、先頭セグメントがリポジトリ最上位の
 *       エントリ名（`EXCLUDED_DIRECTORIES` を除いた実ディスクの直下エントリ。**版管理下とは
 *       限らない**）と一致し、末尾セグメントが拡張子を持つもの。
 *       版管理下に無い最上位エントリも索引に入る（実測: `.env` 系・`.logs` 等 8 件）。
 *       未追跡ファイルによってのみ実在と判定される候補は実測 0 件だが、**未追跡の新規ファイル
 *       を指す参照は commit 前でも通る**——これは見逃し側の限界である。
 *       例: `` `frontend/src/pages/SiteSurveyDetailPage.tsx` ``
 *       **この形に拡張子の絞りは無い。** `.js` / `.jsx` / `.yml` / `.sql` / `.prisma` などを
 *       指す参照も同じく照合する（115.169 の拡張子の絞りが残した穴——後続 115.199——を
 *       本形式では持ち込まない）。先頭セグメントの条件がライブラリ名・MIME 型・要件タグを
 *       落とすため、絞りを入れなくても誤検出が出ないことを実測で確かめてある。
 *
 *   (2) **裸のファイル名**: バッククォートで囲まれた文字列全体が
 *       `[A-Za-z0-9_@-][A-Za-z0-9_@.-]*` かつ拡張子が `BARE_NAME_EXTENSIONS` のもの。
 *       例: `` `ImageViewer.tsx` ``。設計文書は「同ディレクトリの別部品」を裸の名前で書くため、
 *       この形を落とすと撤去済み部品への参照の大半を取り逃がす（着手時の実測で 28 件）。
 *       照合はリポジトリ内に**同じ basename のファイルが一つでも在るか**で行う。
 *
 * ## 免除する形（撤去の記録。実在の主張ではない）
 *
 *   参照 R が実在しないとき、**同じ設計文書の中に「R の不在を述べている行」が一つでもあれば**
 *   R への参照は検出しない。不在を述べている行とは、不在の語（`ABSENCE_MARKERS`）を含み、
 *   かつ R と同じファイルを名指している行である（ルート相対パスは完全一致、裸のファイル名は
 *   同じ basename を持つルート相対パスでも足りる）。
 *
 *   **文書全体を免除の範囲に採ったのは、設計文書が実際にその書き方をしているからである。**
 *   `site-survey/design.md` は撤去の事実を「実在照合の基準線」小節と当該部品の節で一度ずつ
 *   記録し、他の 20 箇所以上の言及は当時の判断のまま残している。行ごとに不在を書き足させる
 *   規則にすると、記録の本文を書き換えさせることになる（タスク 115.169・115.172 が確立した
 *   「歴史記録は書き換えない」基準に反する）。
 *
 *   **これは許容リストではない。** 名指しで逃がす経路は一切無く、免除されるかどうかは
 *   文書が不在を述べているかだけで決まる。免除を得る方法は「撤去を記録に書く」ことであり、
 *   それはタスク 115.169 が残した教訓「部品を消すときは、その部品を指す記述を同じ変更で
 *   数え上げること」を文書側で機械化したものである。
 *
 *   **免除の広さは実測して開示する。** 是正後の免除は 72 件であり、合格時にも必ず出力する。
 *   免除件数が不意に増えたときは、現存主張へ不在の語が紛れていないか確認すること。
 *
 * ## 検出しない形（限界。見逃し側。いずれも実測に基づく）
 *
 *   - **不在の語が何を指すかまでは見ない。** 着手時の実測で `estimate-request/design.md` の
 *     File Structure Plan の一行が該当した。当該行は区分が `Modified`（=現存主張）で
 *     ありながら、備考の「必須前提 422 ケースを削除」の `削除` が不在の語に当たるため、
 *     同じ行が名指すパスは「不在を述べた行」と誤って解釈され免除される。
 *     **語が何を指すかは機械では判らない**ため、この向きの誤りは残る（本タスクでは当該
 *     一件を人手で是正したうえで、変異を戻して検出されないことを実測した）。
 *   - **一度でも不在を記録すれば、その文書内の同じファイルへの参照はすべて免除される。**
 *     撤去を一箇所に記録し、他の言及を当時のまま残す書き方をそのまま許すということである。
 *     読み手が免除された箇所だけを読んだときに撤去を知る保証は無い。これは
 *     「歴史記録を書き換えない」基準と引き換えに受け入れた見逃しである。
 *   - **裸のファイル名は拡張子を `BARE_NAME_EXTENSIONS` に絞る。** 絞りの根拠は実測である:
 *     設計文書の裸トークンでこの絞りを外して `.js` / `.prisma` などまで広げると、
 *     真の失効は **1 件も増えず**、誤検出だけが 5 件（`this.prisma` 3 件、`decimal.js` /
 *     `Decimal.js` 2 件）増えた。設計文書は `Class.method` / `object.property` を裸トークンで
 *     多用するため、拡張子が広いほど属性アクセスを拾う。ルート相対パス（形(1)）には
 *     この絞りを適用しない。
 *   - **裸のファイル名は basename しか照合しない。** ディレクトリの移動は検出しない
 *     （115.169 と同じ判断。字下げや文脈からパスを組み立てると在るファイルを誤って告発する）。
 *   - **ディレクトリの参照（末尾が `/`、または末尾セグメントに拡張子が無いもの）は照合しない。**
 *     実測では該当 31 件のうち実在しないのは 1 件（`backend/coverage/`）で、それは
 *     `.gitignore` された生成物への正当な言及であった。生成物の有無で結果が変わる検査は
 *     再現しないため、ディレクトリは対象から外す。
 *   - **フェンスで囲まれたコードブロックの中は見ない。** 実測では該当トークンは 1 件のみで、
 *     しかも実在するため、着手時点の結果はこの除外に依存しない。
 *   - **`*` / `<` / `>` / `{` / `}` を含むトークンは対象外。** `site-survey/design.md` の
 *     呼称規約7 が定めるプレースホルダ表記であり、実体を指していない。
 *   - **`design.md` 以外の文書は見ない。** `requirements.md` / `tasks.md` は対象外である。
 *   - **シンボル名（型名・関数名）の実在は見ない。** 根拠は実測である:
 *     `site-survey/design.md` は「実装に実体を持たない契約名（設計上の抽象契約）」を
 *     **意図して**定義しており、その一覧は同書の「契約名の実在対照表」に置かれている。
 *     どの名前が意図的な不在かは名前の見た目から判別できない（同書自身が
 *     「`IAuditLogService` は実在し `ISurveyService` は実在しない。どちらも同じ `I*Service` 表記」
 *     と述べる）。機械で区別するには当該表を権威として読むほかなく、それは許容リストである。
 *     したがってシンボルは本検査の対象外とし、steering 側の同型の課題（後続 115.198）と
 *     揃えて所管を分ける。
 *
 * ## 検出しすぎる可能性（限界。過検出側）
 *
 *   - **これから作るファイルを現在形で挙げると検出される。** 設計文書は計画の文書であり、
 *     未作成のパスを挙げることがある。着手時の実測では、この形の該当 7 件はいずれも
 *     「計画のまま作られず、実装は別のパスへ行った」失効であって、**作成待ちの計画は
 *     一件も無かった**。作成待ちのパスを書くときは、その旨を同じ記述単位に書けば
 *     免除される（`ABSENCE_MARKERS` に `未作成` / `新設予定` を含めてある）。
 *   - **撤去の記録に不在の語を書き忘れると検出される。** これは意図した挙動である。
 *     記録の側へ一語足すことで、後任が存在しないパスへ導かれなくなる。
 *
 * 前提条件で検査を無効化しない（AI運用7原則 第3原則）:
 *   走査対象の設計文書が一件も見つからない場合は「合格」ではなく失敗として扱う。
 *   許容リスト（baseline）は持たない。検出を名指しで逃がす経路そのものを置かない。
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

// ============================================================================
// 型定義
// ============================================================================

/** 参照の書き方 */
export type ReferenceKind = 'qualified-path' | 'bare-filename';

export interface DesignPathFinding {
  /** リポジトリ相対の設計文書パス */
  file: string;
  /** 1 始まりの行番号 */
  line: number;
  /** 実在しないと判定した記載 */
  reference: string;
  /** 参照の書き方 */
  kind: ReferenceKind;
  /** 検出行の内容（前後の空白を除く） */
  snippet: string;
}

export interface RunOptions {
  /** 走査の起点（既定はリポジトリルート）。自己検査から一時ディレクトリを渡す */
  root?: string;
  /** 設計文書の置き場所（リポジトリ相対） */
  specDir?: string;
}

export interface RunResult {
  findings: DesignPathFinding[];
  /** 不在の明記により免除した参照の件数（免除が静かに広がっていないかを見るため） */
  exemptedCount: number;
  scannedFiles: string[];
  specDir: string;
}

/** リポジトリの実在ファイルの索引 */
export interface FileIndex {
  /** リポジトリ相対パスの集合 */
  paths: ReadonlySet<string>;
  /** basename の集合 */
  names: ReadonlySet<string>;
  /** 最上位エントリ名の集合（ディレクトリ・ファイルの双方） */
  topLevelEntries: ReadonlySet<string>;
}

// ============================================================================
// 走査対象の決定
// ============================================================================

/** 設計文書の置き場所 */
export const SPEC_DIR = '.kiro/specs';

/** 走査対象の文書名 */
export const DESIGN_DOC_NAME = 'design.md';

/**
 * リポジトリ走査から外すディレクトリ（すべてビルド生成物・取得物）。
 * ここに挙げたものは「在るファイル」として数えない（115.169 と同じ判断）。
 */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** `.kiro/specs/<feature>/design.md` を列挙する */
export function collectDesignDocuments(root: string, specDir: string = SPEC_DIR): string[] {
  const absoluteSpecDir = path.join(root, specDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteSpecDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const documents: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(absoluteSpecDir, entry.name, DESIGN_DOC_NAME);
    if (!fs.existsSync(candidate)) continue;
    documents.push(`${specDir}/${entry.name}/${DESIGN_DOC_NAME}`);
  }
  return documents.sort();
}

/** リポジトリの実在ファイルを索引する */
export function buildFileIndex(root: string): FileIndex {
  const paths = new Set<string>();
  const names = new Set<string>();
  const topLevelEntries = new Set<string>();

  let rootEntries: fs.Dirent[];
  try {
    rootEntries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const entry of rootEntries) {
    if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    topLevelEntries.add(entry.name);
  }

  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      paths.add(path.relative(root, absolute).split(path.sep).join('/'));
      names.add(entry.name);
    }
  }
  return { paths, names, topLevelEntries };
}

// ============================================================================
// 検出規則
// ============================================================================

/**
 * 裸のファイル名で照合する拡張子。
 * 絞りの根拠は冒頭の限界節に実測で記した（広げても真の失効は増えず誤検出だけが増える）。
 */
export const BARE_NAME_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.css'];

/**
 * 不在を明記する語。これがあると「撤去の記録」とみなして免除する。
 * 名前ではなく**述語**の一覧であり、特定のファイルを逃がすものではない。
 */
export const ABSENCE_MARKERS: readonly string[] = [
  '撤去',
  '削除',
  '廃止',
  '改名',
  '移設',
  '当時',
  'かつて',
  '実在しない',
  '存在しない',
  '非実在',
  '旧',
  '生成物',
  '未作成',
  '新設予定',
];

/** バッククォートで囲まれたトークンを取り出す */
const BACKTICKED_TOKEN = /`([^`]+)`/g;

/** ルート相対パスの形（セグメントが二つ以上） */
const QUALIFIED_SHAPE = /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+$/;

/** 裸のファイル名の形 */
const BARE_SHAPE = /^[A-Za-z0-9_@-][A-Za-z0-9_@.-]*$/;

/** 呼称規約7 のプレースホルダ表記（実体を指していない） */
const PLACEHOLDER_CHARACTERS = /[*<>{}]/;

/** 末尾セグメントが拡張子を持つか */
function hasExtension(token: string): boolean {
  const last = token.slice(token.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot > 0 && dot < last.length - 1;
}

/** 記述単位が不在を明記しているか */
export function statesAbsence(unitText: string): boolean {
  return ABSENCE_MARKERS.some((marker) => unitText.includes(marker));
}

/**
 * 一行から「このパス／ファイルが在る」という主張を取り出す。
 * 主張でないトークンは落とす。
 */
export function extractClaims(
  lineText: string,
  topLevelEntries: ReadonlySet<string>
): Array<{ reference: string; kind: ReferenceKind }> {
  const claims: Array<{ reference: string; kind: ReferenceKind }> = [];
  let matched: RegExpExecArray | null;
  BACKTICKED_TOKEN.lastIndex = 0;
  while ((matched = BACKTICKED_TOKEN.exec(lineText)) !== null) {
    const token = matched[1];
    if (token === undefined) continue;
    if (PLACEHOLDER_CHARACTERS.test(token)) continue;
    if (token.endsWith('/')) continue;

    if (QUALIFIED_SHAPE.test(token)) {
      const head = token.slice(0, token.indexOf('/'));
      if (!topLevelEntries.has(head)) continue;
      if (!hasExtension(token)) continue;
      claims.push({ reference: token, kind: 'qualified-path' });
      continue;
    }

    if (BARE_SHAPE.test(token)) {
      if (!BARE_NAME_EXTENSIONS.some((extension) => token.endsWith(extension))) continue;
      claims.push({ reference: token, kind: 'bare-filename' });
    }
  }
  return claims;
}

/**
 * 文書の中から「不在を述べている行」を集め、そこで名指されたファイルの索引を作る。
 *
 * 返す集合には、ルート相対パスそのものと、その basename の両方を入れる。
 * 裸のファイル名での参照は、ルート相対パスでの撤去の記録でも免除できるようにするためである。
 * 名指しの許容リストではない——集合の中身は**文書が実際に書いた内容だけ**で決まる。
 */
export function collectAbsenceDeclarations(
  lines: readonly string[],
  topLevelEntries: ReadonlySet<string>
): Set<string> {
  const declared = new Set<string>();
  let insideFence = false;
  for (const lineText of lines) {
    if (/^\s*(?:```|~~~)/.test(lineText)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    if (!statesAbsence(lineText)) continue;
    for (const claim of extractClaims(lineText, topLevelEntries)) {
      declared.add(claim.reference);
      declared.add(claim.reference.slice(claim.reference.lastIndexOf('/') + 1));
    }
  }
  return declared;
}

/** 一つの設計文書から、実在しないパスの記載を検出する */
export function scanDocument(
  relativePath: string,
  source: string,
  index: FileIndex
): { findings: DesignPathFinding[]; exemptedCount: number } {
  const findings: DesignPathFinding[] = [];
  let exemptedCount = 0;
  const lines = source.split(/\r?\n/);
  const declaredAbsent = collectAbsenceDeclarations(lines, index.topLevelEntries);
  let insideFence = false;

  lines.forEach((lineText, offset) => {
    if (/^\s*(?:```|~~~)/.test(lineText)) {
      insideFence = !insideFence;
      return;
    }
    if (insideFence) return;

    for (const claim of extractClaims(lineText, index.topLevelEntries)) {
      const exists =
        claim.kind === 'qualified-path'
          ? index.paths.has(claim.reference)
          : index.names.has(claim.reference);
      if (exists) continue;
      if (declaredAbsent.has(claim.reference)) {
        exemptedCount += 1;
        continue;
      }
      findings.push({
        file: relativePath,
        line: offset + 1,
        reference: claim.reference,
        kind: claim.kind,
        snippet: lineText.trim(),
      });
    }
  });

  return { findings, exemptedCount };
}

// ============================================================================
// 実行
// ============================================================================

export function run(options: RunOptions = {}): RunResult {
  const root = options.root ?? ROOT;
  const specDir = options.specDir ?? SPEC_DIR;
  const documents = collectDesignDocuments(root, specDir);
  const index = buildFileIndex(root);

  const findings: DesignPathFinding[] = [];
  let exemptedCount = 0;
  for (const relativePath of documents) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf-8');
    const scanned = scanDocument(relativePath, source, index);
    findings.push(...scanned.findings);
    exemptedCount += scanned.exemptedCount;
  }

  return { findings, exemptedCount, scannedFiles: documents, specDir };
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
      console.error('❌ 設計文書が挙げるパスに、実在しないものがあります');
      console.error('');
      console.error('   設計文書は歴史記録を保存してよい文書ですが、記録であることが');
      console.error('   読み取れない参照は、後任を存在しないパスへ導きます（タスク 115.173）。');
      console.error('   次のいずれかで解消してください。');
      console.error('     (a) いま在るものを指している記述 → 実在するパスへ指し直す');
      console.error('     (b) 当時こうしたという記録 → 当該ファイルを名指したうえで');
      console.error('         不在を述べる行を文書内に一つ置く（「撤去済み」「削除」など）');
      console.error('');
      const byFile = new Map<string, DesignPathFinding[]>();
      for (const finding of result.findings) {
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, list] of byFile) {
        console.error(`   ${file} (${list.length}件)`);
        for (const finding of list) {
          console.error(`     L${finding.line}: ${finding.reference} [${finding.kind}]`);
          if (verbose) console.error(`        ${finding.snippet}`);
        }
      }
      console.error('');
      console.error(
        `   合計 ${result.findings.length} 件 / ${byFile.size} ファイル` +
          `（走査 ${result.scannedFiles.length} ファイル、不在の明記により免除 ${result.exemptedCount} 件）`
      );
    }
    process.exit(1);
  }

  if (!json) {
    console.log(
      `✅ 設計文書が挙げるパスはすべて実在します` +
        `（走査 ${result.scannedFiles.length} ファイル: ${result.specDir}/*/${DESIGN_DOC_NAME}、` +
        `不在の明記により免除 ${result.exemptedCount} 件）`
    );
    if (verbose) {
      console.log(
        '   免除は「撤去済み」等の不在の明記がある記述単位に限られます。' +
          '件数が不意に増えたときは、現存主張へ不在の語が紛れていないか確認してください。'
      );
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
