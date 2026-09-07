/**
 * @fileoverview 本番コードへの行番号参照 検出規則の自己検査
 *
 * scripts/check-design-code-reference-format.ts の検出規則が、**タスク 115.149 の是正前に
 * 実際に設計文書へ存在していた書き方**をすべて捕捉し（漏れ）、パスとシンボル名で指す
 * 正しい書き方や、行番号ではない数値（要件番号・タスク番号・比率・HTTP ステータス・
 * オブジェクトリテラルの値）を捕捉しない（過検出）ことを、書き方そのものを注入して確認する。
 *
 * MUST_DETECT の各例は**是正前の設計文書から採った実物**である。検出器が壊れていれば
 * 本検査（0 件）は自明に通ってしまうため、既知の該当を捕まえられることを先に固定する。
 *
 * 使用方法:
 *   npx tsx scripts/check-design-code-reference-format.selftest.ts
 *   npm run check:design-code-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  isProductionReference,
  mentionsProductionSource,
  run,
  scanDocument,
  scanLine,
} from './check-design-code-reference-format.js';
// 走査根は共有部品から直に取る。被検査モジュール（check-design-code-reference-format.ts）を
// 経由して取ると、本体が再輸出を続ける限り複製の有無を見分けられない（タスク 115.231。
// タスク 115.221 が scripts/check-requirement-exclusions.selftest.ts で採った作法と同じ）。
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

// 失敗既定（タスク 115.295 が全 18 件で実測）。入口 `main();` が呼ばれないまま module が
// 走り終えると EXIT=1 で終わる。解除は main の成功経路に置く `process.exitCode = 0;` だけ。
process.exitCode = 1;

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-code-reference-format.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * 走査根（`SPEC_DIR` / `DESIGN_DOC_NAME` / `collectDesignDocuments`）の唯一の担い手
 * （タスク 115.231）。
 *
 * 本体がこれを取り込むため、サブプロセスを起こす対照は同じ場所へ本モジュールを複製する。
 * その 2 箇所の `fs.copyFileSync` を外す変異を当てると、合成した scripts に本モジュールが
 * 無いまま起動して `node:internal/modules/cjs/loader` が解決に失敗し、自己検査 103 件中 2 件
 * （「走査対象が 0 件のとき合格にしない」と「検出結果を返す前に絞り込む経路が無い」）が
 * 落ちた（2026-09-01 に総数 72 件で実測し、タスク 115.266 が対照群を足して総数が 103 件に
 * なった 2026-09-04 に再実測した。落ちる件数は 2 件のまま変わらない）。
 *
 * また `collectDesignDocuments` の本体はここに在るため、**見張りの対象は本体のソースだけ
 * では足りない**——{@link readWatchedSources} が本体と本モジュールの双方を見る。足りない
 * 中身（何が空振りに退化するか。素通りではない）は同関数の注釈に実測とともに記す。
 */
const SHARED_ROOT_MODULE_NAME = 'design-document.ts';
const SHARED_ROOT_MODULE_PATH = path.join(SCRIPTS_DIR, SHARED_ROOT_MODULE_NAME);

/** 走査根を「使う」だけであって「持って」はならないスクリプト（タスク 115.231） */
const SCAN_ROOT_CONSUMERS: readonly string[] = [
  'check-design-code-reference-format.ts',
  'check-design-reference-format.ts',
  'check-design-path-references.ts',
];

/**
 * 走査根そのものを表す断片
 *
 * これらが消費側のソースに現れたら、規則の複製が戻っている。散文の中の `.kiro/specs` や
 * design.md には当たらないよう、引用符ごと・宣言ごとの形で持つ。
 *
 * **照合は注釈を取り除いたソースに対して行う。** 引用符ごとの形にしても注釈は逃れられない:
 * 共有部品の冒頭注釈は複製間の差を説明するために `'.kiro/specs'` を逐語で引いており、
 * 生のソースで照合すると「断片が共有部品に実在する」という空振り検知が**注釈だけで満たされる**。
 * 実際、担い手の宣言を `['.kiro', 'specs'].join('/')` へ書き換える変異を当てたところ、
 * 生のソースで照合する版はこの対照が緑のまま素通りし（自己検査 103/103 緑）、
 * 注釈を取り除く版では「共有部品 design-document.ts に走査根が見当たらない（対照が
 * 空振りしている）: '.kiro/specs'」として 103 件中 1 件が落ちた（2026-09-01 に総数 72 件で
 * 実測し、総数が 103 件になった 2026-09-04 に再実測した）。**タスク 115.268 の提出時点で
 * 同じ変異を当て直したところ、同じ一行で 104 件中 1 件が落ちた**——コミット `c6ef2779` に
 * 当時の未コミット差分を当てた作業ツリーで、2026-09-04 にリポジトリルートで実測。
 *
 * **タスク 115.269 で担い手が移ったため、同じ変異を当て直した。** 根の宣言は
 * scripts/spec-directory.ts にあり、そこの `export const SPEC_DIR = '.kiro/specs';` を
 * `export const SPEC_DIR = ['.kiro', 'specs'].join('/');` へ書き換えると、
 * 本自己検査は 104 件中 1 件が落ちる。挙がるのは
 * `spec-directory.ts にスペックの根が見当たらない（対照が空振りしている）: '.kiro/specs'` と
 * `走査根が担い手に見当たらない（対照が空振りしている）: '.kiro/specs'（担い手 spec-directory.ts）`
 * の二行である。同じ変異で兄弟の `npm run check:req-exclusions:selftest` も 64 件中 1 件
 * （`探索規則が担い手に見当たらない（対照が空振りしている）: '.kiro/specs'（担い手 spec-directory.ts）`）
 * が落ちる——コミット `97302295` にタスク 115.269 の未コミット差分を当てた作業ツリーで、
 * 2026-09-04 にリポジトリルートで実測。
 * 変異はいずれも退避した控えからの書き戻しで復元した。
 *
 * **注釈除去がリテラルを跨ぐ穴は塞いだ（タスク 115.268）。** かつてここには「`stripComments`
 * の `//.*$` は文字列・正規表現リテラルの中の `//` も注釈の始まりと見なすため、同じ行の手前に
 * `//` を含む文字列を置けば裸の断片でも逃れられる」という天井が挙がっていた。
 * {@link stripComments} を一文字ずつ読む走査へ改め、この経路を閉じた。実測（いずれも
 * 2026-09-04 にリポジトリルートで実測。**版はコミット `c6ef2779`**——本タスクの差分は
 * 未コミットであり、「改める前」は同コミットそのものの作業ツリー（総数 103 件）、
 * 「改めた後」は同コミットへ本タスクの差分を当てた作業ツリー（総数 104 件）を指す。
 * 変異は退避した控えからの書き戻しで復元した）:
 *
 *   - scripts/check-design-path-references.ts の取り込みの直後へ
 *     `const SCHEME = 'https://example.invalid'; const LOCAL_SPEC_DIR = '.kiro/specs';
 *     const LOCAL_DOC = 'design.md';` の一行を足す変異を当てると、改める前は自己検査
 *     103/103 緑（終了コード 0）であったが、改めた後は `check-design-path-references.ts に
 *     走査根の複製が戻っている: '.kiro/specs' / 'design.md'` として 104 件中 1 件が落ちる
 *   - 同じ位置へ `const OPENER = '/*'; const LOCAL_SPEC_DIR = '.kiro/specs'; const CLOSER = '*' + '/';`
 *     の一行を足す変異（塊注釈の記号を文字列で挟む形）でも、改めた後は 104 件中 1 件が落ちる
 *
 * **残る天井は二つあり、どちらも断片方式そのものの限界である**（タスク 115.221 から
 * 引き継いだもので、注釈除去の穴とは別の経路。本タスクでも解いていない）。
 *
 * 一つ目。消費側が共有部品から取り込んだ `SPEC_DIR` / `DESIGN_DOC_NAME` を使って列挙を
 * 書き直すと、ソースに裸の文字列リテラルも `export function collectDesignDocuments(` も
 * 現れないため、この対照は素通りする。scripts/check-design-path-references.ts の取り込みの
 * 直後へ `const dupDocs = (root: string) => fs.readdirSync(path.join(root, SPEC_DIR)).map((n) =>
 * path.join(SPEC_DIR, n, DESIGN_DOC_NAME));` の一行を足す変異を当てても、自己検査は
 * 104/104 緑（終了コード 0）のままであった（コミット `c6ef2779` に本タスクの未コミット差分を
 * 当てた作業ツリーで、2026-09-04 にリポジトリルートで実測）。
 *
 * 二つ目。断片を**逐語で持たずに組み立てる**複製も素通りする。同じ位置へ
 * `const D_SPEC = '.kiro' + '/specs'; const D_DOC = 'design' + '.md';` の一行を足す変異を
 * 当てても、自己検査は 104/104 緑（終了コード 0）のままであった（コミット `c6ef2779` に
 * 本タスクの未コミット差分を当てた作業ツリーで、2026-09-04 にリポジトリルートで実測）。
 * これは注釈除去の穴とは別の経路であり、**リテラルを跨がない走査に改めても閉じない**。
 *
 * この二つは散文だけでなく {@link SCAN_ROOT_MATCHER_SPECIMENS} が `verdict: 'ceiling'` の
 * 素材として実体で持つ。塞げたときは対照の側が赤くなり、列挙の更新が強制される。
 * **同群の `verdict: 'correct-miss'` は天井ではない**——本物の注釈の中の断片を拾わないという
 * 正しい不検出であり、塞ぐ対象ではない（理由と実測は同群の注釈に置く）。
 */
const SCAN_ROOT_FRAGMENTS: readonly string[] = [
  "'.kiro/specs'",
  "'design.md'",
  'export function collectDesignDocuments(',
  'const absoluteSpecDir = path.join(root, specDir);',
];

/**
 * スペックの根（`.kiro/specs`）の唯一の担い手（タスク 115.269）。
 *
 * 一つの機能のスペックは `requirements.md` と `design.md` を**同じディレクトリ**に置く。
 * したがって「要件定義書の根」と「設計文書の走査根」は二つの概念ではなく、同じ一つの値の
 * 別名であった——タスク 115.231 の直後は scripts/requirement-document.ts の `SPECS_DIR` と
 * scripts/design-document.ts の `SPEC_DIR` が同値で並び、さらに
 * scripts/check-traceability-coverage.ts が三つ目の裸のリテラルを持っていた。
 *
 * **別名のままだと、片方が動いてももう片方は静かに残る。** 実測（コミット `97302295` の
 * 作業ツリー、2026-09-04 にリポジトリルートで実測。変異は退避した控えからの書き戻しで復元した）:
 * scripts/design-document.ts の `SPEC_DIR` だけを `'.kiro/specs-moved'` へ変える変異を当てると、
 * `npm run check:design-code-refs` は「走査対象の設計文書が一件も見つかりませんでした」で
 * 終了コード 1 になり `npm run check:design-component-reqs` も 1 になる一方、
 * **同じ機能の `requirements.md` と `design.md` を突き合わせる `npm run check:trace-coverage` は
 * 終了コード 0 のまま**（機能 13 件 / 追跡表の本文行 860 行）であった。自前のリテラルで
 * 旧い根を読み続けたためである。
 */
const SPEC_ROOT_MODULE_NAME = 'spec-directory.ts';
const SPEC_ROOT_MODULE_PATH = path.join(SCRIPTS_DIR, SPEC_ROOT_MODULE_NAME);

/** スペックの根そのものを表す断片（引用符ごとの形。散文の `.kiro/specs` には当たらない） */
const SPEC_ROOT_FRAGMENT = "'.kiro/specs'";

/** 根を自前で持たず共有部品から取らなければならない文書モジュール（タスク 115.269） */
const SPEC_ROOT_DOCUMENT_MODULES: readonly string[] = [
  'requirement-document.ts',
  'design-document.ts',
];

/**
 * 断片ごとの担い手（タスク 115.269 でスペックの根だけを別の共有部品へ移した）。
 *
 * 挙げられていない断片の担い手は {@link SHARED_ROOT_MODULE_NAME} である。
 */
const SCAN_ROOT_FRAGMENT_OWNERS: Readonly<Record<string, string>> = {
  [SPEC_ROOT_FRAGMENT]: SPEC_ROOT_MODULE_NAME,
};

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return stripComments(fs.readFileSync(ENTRY_PATH, 'utf-8'));
}

/**
 * 正規表現リテラルが始まり得る位置か（除算の `/` と見分けるため）。
 *
 * 直前の意味のあるトークンで判じる。識別子で終わるなら `return` などの語のときだけ許し、
 * それ以外（数値・`)`・`]`・`}`・`.`・引用符）は除算と読む。
 */
const REGEX_ALLOWING_KEYWORDS: ReadonlySet<string> = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'delete',
  'void',
  'new',
  'throw',
]);

function regexLiteralCanStart(emitted: string): boolean {
  const before = emitted.replace(/\s+$/, '');
  if (before.length === 0) return true;
  const identifier = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(before);
  if (identifier !== null) return REGEX_ALLOWING_KEYWORDS.has(identifier[0]);
  return !/[0-9)\]}.`\'"]$/.test(before);
}

/** `stripComments` の走査の状態（テンプレートの `${}` は再びコードとして読むため入れ子になる） */
type StripFrame = { kind: 'code'; braces: number } | { kind: 'template' };

/**
 * 注釈を取り除く（**文字列・テンプレート・正規表現のリテラルを跨がない**）。
 *
 * 素朴な `source.replace(/\/\*[\s\S]*?\*\//g, \'\').replace(/\/\/.*$/gm, \'\')` は
 * リテラルの中の `//` や `/*` も注釈の始まりと見なすため、**同じ行の手前に `//` を含む
 * 文字列を置くだけで後続が照合の対象から消える**。タスク 115.268 でこの形を実測し、
 * 一文字ずつ読む走査へ改めた（実測は {@link SCAN_ROOT_FRAGMENTS} の注釈に記す）。
 *
 * 走査は行を跨いで壊れない: 閉じない引用符・閉じない正規表現は改行で打ち切る。
 */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  const stack: StripFrame[] = [{ kind: 'code', braces: 0 }];

  while (index < source.length) {
    const frame = stack[stack.length - 1];
    // 底は常にコード文脈のため空にならない。空なら走査の不具合であり、黙って合格にしない
    if (frame === undefined) throw new Error('stripComments: 走査の状態が空になりました');
    const character = source[index];

    if (frame.kind === 'template') {
      if (character === '\\') {
        out += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (character === '`') {
        out += character;
        index += 1;
        stack.pop();
        continue;
      }
      if (character === '$' && source[index + 1] === '{') {
        out += '${';
        index += 2;
        stack.push({ kind: 'code', braces: 0 });
        continue;
      }
      out += character;
      index += 1;
      continue;
    }

    // 行注釈: 改行は残す（行の対応を崩さないため）
    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    // 塊注釈: 中の改行だけ残す
    if (character === '/' && source[index + 1] === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') out += '\n';
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }
    if (character === '"' || character === "'") {
      out += character;
      index += 1;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') {
          out += source.slice(index, index + 2);
          index += 2;
          continue;
        }
        out += inner;
        index += 1;
        if (inner === character || inner === '\n') break;
      }
      continue;
    }
    if (character === '`') {
      out += character;
      index += 1;
      stack.push({ kind: 'template' });
      continue;
    }
    if (character === '/' && regexLiteralCanStart(out)) {
      out += character;
      index += 1;
      let inCharacterClass = false;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') {
          out += source.slice(index, index + 2);
          index += 2;
          continue;
        }
        out += inner;
        index += 1;
        if (inner === '\n') break;
        if (inner === '[') inCharacterClass = true;
        else if (inner === ']') inCharacterClass = false;
        else if (inner === '/' && !inCharacterClass) break;
      }
      continue;
    }
    const codeFrame = frame;
    if (character === '{') {
      codeFrame.braces += 1;
    } else if (character === '}') {
      if (codeFrame.braces === 0 && stack.length > 1) {
        out += character;
        index += 1;
        stack.pop();
        continue;
      }
      if (codeFrame.braces > 0) codeFrame.braces -= 1;
    }
    out += character;
    index += 1;
  }

  return out;
}

/**
 * 見張りの対象となるソース（本体 ＋ 走査根の共有部品）。
 *
 * タスク 115.231 で `collectDesignDocuments` の本体を scripts/design-document.ts へ移した。
 *
 * (a) 見張りを本体のソースだけへ戻す変異——本関数の中身を `return readExecutableSource();` に
 * 置き換える——を当てると、走査根には何も手を加えていない時点で既に自己検査 103 件中 1 件が
 * 落ちる。落ちるのは「検出結果を返す前に絞り込む経路が無い」で、
 * `collectDesignDocuments の本体を取り出せなかった（宣言が変わった可能性がある）` と
 * `台帳が挙げる関数が本体に無い: collectDesignDocuments（改名・撤去で見張りが空振りしている）`
 * の二行を告げる。(b) その状態へさらに走査根の骨抜き（scripts/design-document.ts の走査の輪へ
 * `if (entry.name === 'site-survey') continue;` を一行）を重ねると 103 件中 2 件へ増える
 * （いずれも 2026-09-01 に総数 72 件で実測し、総数が 103 件になった 2026-09-04 に
 * 再実測した。落ちる件数は 1 件・2 件のまま変わらない）。**測ったこの二つの状態はどちらも赤であり、骨抜きが
 * 黙って通る形ではない。**
 *
 * したがって本関数が在る理由は「無ければ骨抜きが素通りする」ではない。無ければ台帳
 * {@link EXECUTABLE_FUNCTION_INVENTORY} との双方向の一致と {@link checkNoFindingsNarrowing}
 * の全行の突き合わせが `collectDesignDocuments` の本体を掴めなくなり、**赤の中身が骨抜きの
 * 名指しから「見張りが空振りしている」へ入れ替わる**。上の (b) の実測でも失敗行は
 * 「本体を取り出せなかった」「台帳が挙げる関数が本体に無い」から始まっていた（骨抜きそのもの
 * は同じ実行で {@link checkRealRepositoryIsScanned} が
 * `走査対象から落ちている design.md がある: .kiro/specs/site-survey/design.md` として
 * 名指ししていた。2026-09-01 に実測）。本関数はこの二つの見張りを実際の本体へ当て続ける
 * ために在る。台帳との双方向の一致もこの結合ソースに対して要求するため、共有部品へ
 * 見張られない関数を足すこともできない。
 */
function readWatchedSources(): string {
  return `${readExecutableSource()}\n${stripComments(fs.readFileSync(SHARED_ROOT_MODULE_PATH, 'utf-8'))}`;
}

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方
// （すべて 115.149 の是正前に .kiro/specs/*/design.md に実在した実物）
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: 'フルパスに行番号を直付け（site-survey/design.md 実体表）',
    line: '| `AnnotationData` | `frontend/src/types/site-survey.types.ts:620` |',
    expected: true,
  },
  {
    name: 'フルパスに行番号の範囲（backend の service）',
    line: ' - `backend/src/services/image-upload.service.ts:185-187` と同一の命名規則',
    expected: true,
  },
  {
    name: '裸のファイル名に行番号（同ファイルの意味で使う形）',
    line: '`setOutline` の `FreehandTool.ts:371` と `getOutline` の同ファイル `398`',
    expected: true,
  },
  {
    name: '裸のファイル名に行番号の範囲（`client.ts:303-352`）',
    line: '- **Adopt**: 401リフレッシュ再送（`client.ts:303-352`）は既存資産をそのまま採用する',
    expected: true,
  },
  {
    name: 'バッククォート直後の相対行番号（`` `SurveyImageInfo`:54 ``）',
    line: '**動かなかった参照**は、site-survey.types.ts の `SurveyImageInfo`:54 / `ImageOrderItem`:392',
    expected: true,
  },
  {
    name: 'バッククォートで括った相対行番号（`` 同ファイル `:931` ``）',
    line: '`BatchAnnotationRequest` の `frontend/src/types/site-survey.types.ts` 同ファイル `:931`（実測 658）',
    expected: true,
  },
  {
    name: '相対行番号の範囲（`` （`:801-805`） ``）',
    line: '- `frontend/src/pages/EstimateDetailPage.tsx` — 保存後の `fetchData()` を撤去（`:801-805`）',
    expected: true,
  },
  {
    name: '後置の「行目」（project-management/design.md）',
    line: '1. `frontend/src/components/projects/TradingPartnerSelect.tsx` (362行目): `<label>顧客名</label>`',
    expected: true,
  },
  {
    name: '後置の「行目」の範囲（`（300-324行目）`）',
    line: '- `backend/src/services/project.service.ts`（300-324行目）',
    expected: true,
  },
  {
    name: '全角空白ありの「行目」（`の 66 行目で import され`）',
    line: '`DimensionValueInput` は `frontend/src/components/site-surveys/AnnotationEditor.tsx` の 66 行目で import される',
    expected: true,
  },
  {
    name: '括弧で括った後置の「行」（`` `POST /`（119 行） ``）',
    line: '実体は `backend/src/routes/site-surveys.routes.ts` の `POST /`（119 行）/ `GET /:id`（534 行）',
    expected: true,
  },
  {
    name: '半角括弧で括った後置の「行」（`` `createSiteSurvey`(206 行) ``）',
    line: 'CRUD は `backend/src/services/site-survey.service.ts` の `createSiteSurvey`(206 行) / `findById`(389 行)',
    expected: true,
  },
  {
    name: '「同 N 行」の相対参照（site-survey/design.md 決着表）',
    line: '実体は `frontend/src/services/export/PdfReportService.ts` の `PDF_REPORT_LAYOUT`、同 61 行の `PDF_REPORT_LAYOUT_V2`',
    expected: true,
  },
  {
    name: 'スラッシュで併記した行番号（`334 / 471 / 519 行`）',
    line: '`backend/src/services/annotation.service.ts` の 334 / 471 / 519 行の `image.survey.deletedAt !== null`',
    expected: true,
  },
  {
    name: '読点で併記した行番号（`（31, 47行）`）',
    line: '| `frontend/src/components/site-surveys/index.ts` | 再エクスポート（31, 47行）を除去する |',
    expected: true,
  },
  {
    name: 'パスの後ろにスラッシュで連ねる行番号（`` `batch-upload.service.ts` / `278` ``）',
    line: '呼び出しは `batch-upload.service.ts` / `278`、`image-upload.service.ts` / `179` の計2箇所',
    expected: true,
  },
  {
    name: 'アンカー形式（`frontend/src/foo.ts#L166`）',
    line: '  確立済みパターンに準拠（`frontend/src/services/UndoManager.ts#L166`）。',
    expected: true,
  },
  {
    name: '一行に複数の参照（独立した件数として数える）',
    line: '`backend/src/routes/annotation.routes.ts:99` と `backend/src/routes/annotation.routes.ts:208`',
    expected: true,
  },
  // --------------------------------------------------------------------------
  // 第3回是正で追加した死角（`L###` / `Line N` / 前置の「行」 / 「付近」）。
  // すべて 115.149 の第3回是正の直前に .kiro/specs/*/design.md に実在した実物である。
  // --------------------------------------------------------------------------
  {
    name: '`L` 接頭の行範囲（quantity-table-generation/design.md 修正対象表）',
    line: '| `frontend/src/components/quantity-table/EditableQuantityItemRow.tsx` | `calculationFieldsRow` 別行 div（L602-616）を削除し、メイン行（L396-600）の操作セルの直右側に配置 |',
    expected: true,
  },
  {
    name: '`L` 接頭の行範囲（`既存ファイル L127-700 に追記`）',
    line: '| `backend/src/routes/quantity-groups.routes.ts` | `POST /:id/copy` ルートを追加（既存ファイル L127-700 に追記） |',
    expected: true,
  },
  {
    name: '`L` 接頭の行範囲（`（L85-95）`）',
    line: '| `frontend/src/components/quantity-table/CalculationFields.tsx` | `container` / `fieldsGrid`（L85-95）を水平 flex に変更 |',
    expected: true,
  },
  {
    name: '英語の `Line N-N`（パスが同じ行にある形）',
    line: '- NetAllocationDialog（`frontend/src/components/estimate/NetAllocationDialog.tsx`）は案分対象行を表示（Line 319-353）',
    expected: true,
  },
  {
    name: '英語の `Line N-N`（パスが同じ行に無い形。語そのものが標識）',
    line: '- NetAllocationDialog（Line 356-419）は受領見積書の合計金額とNET金額を横並びで表示',
    expected: true,
  },
  {
    name: '英語の `Line N:`（`（Line 240: ...）`）',
    line: '- 明細行のチェックボックスはデフォルトで未選択状態（Line 240: `useState<string[]>([])`）',
    expected: true,
  },
  {
    name: '英語の `Line N`（1〜2 桁。`` `received-quotations.ts` Line 80 ``）',
    line: '- `ReceivedQuotationInfo`には`netAmount`フィールドが存在する（`received-quotations.ts` Line 80）',
    expected: true,
  },
  {
    name: '英語の小文字 `line N 付近`（コードブロック内の注釈。パスが同じ行に無い）',
    line: '// 1. 必須マーカーを削除（line 520 付近）',
    expected: true,
  },
  {
    name: '英語の小文字 `line N-N 付近`',
    line: "- 「参照内訳書」表示行: `{request.itemizedStatementName ?? '-'}`（line 1071-1072 付近）",
    expected: true,
  },
  {
    name: '前置の「行」＋「付近」（`（行 575-905 付近）`）',
    line: '- 配置: `ReceivedQuotationForm.tsx` の他のローカル state（行 575-905 付近）と同じスコープ',
    expected: true,
  },
  {
    name: '前置の「行」（`（行325-415）`。パスが同じ行にある形）',
    line: '`frontend/src/pages/ProjectDetailPage.tsx`（行325-415）の`fetchProject`関数における呼び出し構成:',
    expected: true,
  },
  {
    name: '前置の「行」（`// 削除対象（行507-509）:`。パスが同じ行に無い形）',
    line: '// 削除対象（行507-509）:',
    expected: true,
  },
  {
    name: '前置の「行」（`スタイル定義（行136-144）`）',
    line: 'また、不要になった `styles.backLink` のスタイル定義（行136-144）も削除する。',
    expected: true,
  },
  {
    name: '前置の「行」（`**`mouse:down`ハンドラ（行671-689）**`）',
    line: '1. **`mouse:down`ハンドラ（行671-689）**: 描画ツール使用中の`containsPoint()`ループを削除。',
    expected: true,
  },
  {
    name: '前置の「行」＋読点併記（`（コード行377, 399-417に確認済み）`）',
    line: '- 既存のNetAllocationDialogは受領見積書の合計金額とNET金額の表示を実装済み（コード行377, 399-417に確認済み）',
    expected: true,
  },
  // --------------------------------------------------------------------------
  // 第5回是正で追加した規則（`delimited-line-list` / `line-column-table`）。
  // どちらも 115.149 の第5回是正の直前に .kiro/specs/site-survey/design.md に実在した実物である。
  // 第4回までは「位置の標識をまったく伴わない裸の数値」として**死角に置いていた**形にあたる。
  // --------------------------------------------------------------------------
  {
    name: '区切りで連ねた数値列（`` `survey-image.service.ts` の 226 / 263 ``。#### SurveyImageService 節の実物）',
    line: '- **不変条件の欄**: 「元画像とサムネイルは同一トランザクションで管理」は成立しない（`this.prisma` の出現は `backend/src/services/survey-image.service.ts` の 226 / 263 の2箇所のみで、いずれも `getPrismaClient` まわりである）。',
    expected: true,
  },
  {
    name: '読点で連ねた数値列（`` | foo.tsx | 19、70、249、283 | ``。#### ImageViewer 節の記録表の実物）',
    line: '| `frontend/src/components/construction-photos/ConstructionPhotoImageViewer.tsx` | 19、70、249、283 | 4 |',
    expected: true,
  },
  {
    name: '読点で連ねた数値列（3 桁の要素を1つ含む形。`` | canvasViewportController.ts | 5、130 | ``）',
    line: '| `frontend/src/components/site-surveys/gestures/canvasViewportController.ts` | 5、130 | 2 |',
    expected: true,
  },
  {
    name: '表頭に `行` 列を持つ表の当該列（行単位では原理的に捉えられない形）',
    expected: true,
    custom: checkLineColumnTableIsDetected,
  },
];

// ============================================================================
// 捕捉してはならない書き方（是正後の正しい形／行番号でない数値／境界外）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: 'パスとシンボル名で指す（是正後の形）',
    line: '| `AnnotationData` | `frontend/src/types/site-survey.types.ts` |',
    expected: false,
  },
  {
    name: 'パスのみ（行番号なし）',
    line: '- Inbound: `backend/src/routes/survey-images.routes.ts` と `backend/src/routes/projects.routes.ts`',
    expected: false,
  },
  {
    name: 'ルート定義（`GET /:id` のコロンはパラメータであり行番号ではない）',
    line: '実体は `backend/src/routes/site-surveys.routes.ts` の `GET /:id` / `PUT /:id` / `DELETE /:id`',
    expected: false,
  },
  {
    name: 'オブジェクトリテラルの値（`` `touchCornerSize: 44` ``）',
    line: '要件29.4 は `frontend/src/components/site-surveys/annotation-visual-feedback.ts` の `touchCornerSize: 44` / `cornerSize: 20` で満たされる',
    expected: false,
  },
  {
    name: '要件番号・タスク番号（本番コードのパスと同じ行にある 115.100 / 37.4-37.5）',
    line: 'タスク 115.100 は `frontend/src/services/UndoManager.ts` を要件 37.4-37.5 に合わせた',
    expected: false,
  },
  {
    name: 'HTTP ステータス（`` `POST /` は 422 を返す ``）',
    line: '`backend/src/routes/annotation.routes.ts` の `POST /annotations/batch` は検証失敗で 422 を返す',
    expected: false,
  },
  {
    name: '件数の記述（`10箇所` / `2件`）',
    line: '`backend/src/services/survey-image.service.ts` を挙げる行は表を除いて 10箇所ある（うち 2件 は注記）',
    expected: false,
  },
  {
    name: 'テストコードへの参照（本タスクの境界外: e2e の spec ファイル）',
    line: '受入レベルの検証は `e2e/specs/site-surveys/site-survey-responsive.spec.ts:635` である',
    expected: false,
  },
  {
    name: 'テストコードへの参照（境界外: 単体テストの .test.tsx）',
    line: '結線の検証は `frontend/src/__tests__/components/site-surveys/AnnotationEditor.autosave-wiring.test.tsx:429` にある',
    expected: false,
  },
  {
    name: '他の文書への参照（境界外: design.md / tech.md の行番号）',
    line: '（`design.md:1101` が指す `design.md:5795` も同種の失効であり、`tech.md:516` も同様）',
    expected: false,
  },
  {
    name: '本番コードの言及が無い行の相対行番号（何の行番号か判らないため対象外）',
    line: '- 除外一覧の該当箇所（`:120-124`）を撤去する',
    expected: false,
  },
  {
    name: 'ファイルの分量の記述（`N 行のファイル` は位置ではなく大きさ）',
    line: '- 未使用の `frontend/src/components/site-surveys/LazyImage.tsx`（当時 303 行のファイル）を削除する',
    expected: false,
  },
  {
    name: '1 桁の件数（`3 行を削除した` は行番号ではない）',
    line: 'タスク 115.88 は `frontend/src/types/site-survey.types.ts` から 2 行を削除し 3 行を書き換えた',
    expected: false,
  },
  {
    name: 'コマンド出力の件数（`` 出力が `8` `` はバッククォート付きでも行番号ではない）',
    line: '`grep -rln PutObjectCommand backend/src --include=*.ts | wc -l` の出力が `8` である',
    expected: false,
  },
  // --------------------------------------------------------------------------
  // 第3回是正で追加した規則が、隣接語彙の実測で「位置ではない」と判った書き方を
  // 巻き込まないことの確認（過検出が増えていないこと）。
  // --------------------------------------------------------------------------
  {
    name: '空白を挟む前置の「行」は件数（`実体行 85` / `データ行 43`。実測の実物）',
    line: '`frontend/src/foo.ts` を挙げる件数は **128 件**（ツリーの実体行 85 + 表のデータ行 43）である',
    expected: false,
  },
  {
    name: '「並行」の直後の数値（`並行 401` は同時実行の HTTP ステータス。実測の実物）',
    line: '- `apiClient`（並行 401）: 5件を同時に送信し `backend/src/routes/foo.routes.ts` を叩く',
    expected: false,
  },
  {
    name: '「N行Mセット」の件数（`3行1セット`。実測の実物）',
    line: '見積項目は3行1セット（見積金額行・実行金額行）で `frontend/src/foo.tsx` が描画する',
    expected: false,
  },
  {
    name: '`line` が語末に埋もれた英単語（`inline` / `newline`）',
    line: '`frontend/src/App.tsx` は Tailwind の inline 4 クラスと newline 2 個を持つ',
    expected: false,
  },
  {
    name: '`lines` が語末に埋もれた英単語（`Guidelines` / `headlines`）',
    line: '`frontend/src/foo.ts` の Guidelines 3 と headlines 12 に従う',
    expected: false,
  },
  {
    name: '英字に続く `L`＋数値（`TTL 900` / `Level 2.1` / `SP 800-63`）',
    line: '`frontend/src/foo.ts` は TTL 900 秒・Level 2.1・SP 800-63 に準拠する',
    expected: false,
  },
  {
    name: '前置の「行」＋1桁（`明細行 0 件` / `退行 0 件`）',
    line: '`backend/src/foo.ts` の明細行 0 件のまま、退行 0 件で解消 87 件',
    expected: false,
  },
  // --------------------------------------------------------------------------
  // 第5回是正で追加した `delimited-line-list` が、行番号でない数値の併記を
  // 巻き込まないことの確認（過検出が増えていないこと）。
  // --------------------------------------------------------------------------
  {
    name: '要件番号の併記（`Req 5, 6, 22`。本番コードのパスと同じ行にある）',
    line: '- **Adopt**: `frontend/src/api/client.ts` の 401 再送経路（Req 5, 6, 22）をそのまま採用する',
    expected: false,
  },
  {
    name: '要件番号の併記（`要件 31, 32, 33, 34`）',
    line: '`backend/src/services/annotation.service.ts` は要件 31, 32, 33, 34 を担う',
    expected: false,
  },
  {
    name: '千位区切りの件数（`16,754` / `1,737`。実測の実物）',
    line: '`frontend/src/foo.ts` を含む 13 件の design.md の数値トークンは 16,754 件、うち 1,737 件が同じ行にパスを持つ',
    expected: false,
  },
  {
    name: '配列リテラルの要素（`[1,0,0,1,0,0]`。Fabric の変換行列）',
    line: '`frontend/src/components/site-surveys/AnnotationEditor.tsx` の初期変換行列は `[1,0,0,1,0,0]` である',
    expected: false,
  },
  {
    name: '座標の併記（`座標 (0,0)`）',
    line: '`frontend/src/utils/imageFitScale.ts` は座標 (0,0) を原点にフィット倍率を算出する',
    expected: false,
  },
  {
    name: '全要素が 2 桁の数値列（限界。件数・添字と区別できないため検出しない）',
    line: '`frontend/src/foo.ts` の 5、19 を参照する',
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（第3原則: 前提が満たせない場合は失敗させる）
// ============================================================================

/**
 * 走査対象が 0 件のとき「合格」ではなく失敗になること（第3原則）。
 *
 * 本体のソースを正規表現で見るだけでは `if (false && result.scannedFiles.length === 0)`
 * のような短絡化を素通りさせる（式は残るが実行されない）。ここでは**挙動**を見る:
 * 走査対象が一件も無い場所へ本体を置いて起動し、終了コードが 1 であることを確かめる。
 * 本体は自身の置き場所の親をリポジトリルートとみなすため、一時ディレクトリへ
 * `scripts/` ごと複製して起動すれば、走査対象が空の状態を作れる。
 */
function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-code-ref-selftest-'));
  try {
    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== 0) {
      failures.push('空のディレクトリで走査件数が 0 にならなかった');
    }

    if (!fs.existsSync(TSX_CLI)) {
      // 起動口が無いことは「確認できない」であって合格ではない
      failures.push(
        `本体を起動できない（${path.relative(ROOT, TSX_CLI)} が無い）ため挙動を確認できない`
      );
      return failures;
    }

    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    // 本体は走査根を共有部品から取り込むため、同じ場所へ複製しないと起動できない
    fs.copyFileSync(SHARED_ROOT_MODULE_PATH, path.join(tempScripts, SHARED_ROOT_MODULE_NAME));
    // 共有部品はさらにスペックの根を担い手から取り込む（タスク 115.269）
    fs.copyFileSync(SPEC_ROOT_MODULE_PATH, path.join(tempScripts, SPEC_ROOT_MODULE_NAME));
    // 走査対象の置き場所は存在するが中身が無い状態にする
    fs.mkdirSync(path.join(tempRoot, SPEC_DIR), { recursive: true });

    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.error) {
      failures.push(`本体の起動に失敗した: ${executed.error.message}`);
      return failures;
    }
    if (executed.status !== 1) {
      failures.push(
        `走査対象が 0 件でも終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    if (!/走査対象の設計文書が一件も見つかりません/.test(executed.stderr ?? '')) {
      failures.push('走査対象が 0 件であることを告げる出力が無い');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/** 注釈を取り除いた本体から、名前付きの関数の本体を取り出す（末尾は列 0 の閉じ括弧） */
function extractFunctionBody(source: string, declaration: string): string | null {
  const start = source.indexOf(declaration);
  if (start === -1) return null;
  const end = source.indexOf('\n}', start);
  if (end === -1) return null;
  return source.slice(start, end + 2);
}

/**
 * 関数の書き方を判定する綴りの**唯一の出所**（タスク 115.230 が定め、タスク 115.266 が
 * 散文の台帳から対照群へ移した）。
 *
 * この二つの綴りから `declaredFunctionNames` と `bindsFunctionValueAtTopLevel` を組む。
 * **本体を見張る `checkMonitoredFunctionInventory` も、見本を通す `FUNCTION_FORM_SPECIMENS`
 * も同じ述語を呼ぶ**（対象の同一性）。作法は
 * `scripts/check-requirement-exclusions.selftest.ts` の `MUST_ACCEPT` / `MUST_REJECT` が
 * 実体を本物の検査へ通す形に揃えた（115.222 が非空の関門を、115.242 が同じ作法を課している）。
 *
 * **なぜ散文から移したか。** タスク 115.230 は同じ欠陥で四度差し戻された。原因は個々の記述
 * ミスではなく構造にある——正規表現という開いた構文空間の性質を散文で数え上げていながら、
 * **散文と正規表現を突き合わせる機構が無かった**。散文はまだ挙げていない書き方を一つ
 * 持ってくるだけで反証できる。
 *
 * 移す前の状態で当てた変異と実出力（2026-09-04、リポジトリルート、コミット `272e3bde` の
 * 作業ツリーで実測。変異は退避した控えからの書き戻しで復元した）。
 *   - 抽出の綴りの `[<(]` を `\(` へ狭める（散文が「`function sneakG<T>(...)` を捕らえる」と
 *     主張していた枝を落とす）→ 自己検査は 72/72 緑のままだった
 *   - 最上位の束縛の綴りから `\(` の枝を落とす（散文がカンマ演算子・複数行のアロー・三項を
 *     捕らえると主張していた枝を落とす）→ 自己検査は 72/72 緑のままだった
 *
 * **散文はどちらの主張も機械へ預けていなかった。** 移した後の同じ二つの変異の実出力は
 * `FUNCTION_FORM_SPECIMENS` の注釈に記す。
 */
const FUNCTION_DECLARATION_PATTERN = String.raw`^(?:export )?(?:default )?(?:async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\s*[<(]`;

/**
 * 最上位で関数を値として束ねる形（アロー関数・関数式）の綴り。上と同じく唯一の出所である。
 *
 * 抽出は `function` で始まる宣言しか拾わないため、値として束ねる形は**置くこと自体を禁じる**。
 * 掛かる形・掛からない形・関数でないのに掛かる形は、すべて `FUNCTION_FORM_SPECIMENS` が
 * 実体で持つ。
 */
const TOP_LEVEL_FUNCTION_VALUE_BINDING_PATTERN = String.raw`^(?:export )?(?:const|let|var) [A-Za-z_$][A-Za-z0-9_$]*(?::[^=\n]*)? = (?:async )?(?:function\b|\(|[A-Za-z_$][A-Za-z0-9_$]*\s*(?::[^=\n]*)?=>)`;

/** 抽出が拾う関数名を取り出す。本体の見張りと見本の対照群が共有する唯一の実装 */
function declaredFunctionNames(source: string): string[] {
  const declaration = new RegExp(FUNCTION_DECLARATION_PATTERN, 'gm');
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** 最上位で関数を値として束ねる形に当たるかを判定する。上と同じく共有の唯一の実装 */
function bindsFunctionValueAtTopLevel(source: string): boolean {
  return new RegExp(TOP_LEVEL_FUNCTION_VALUE_BINDING_PATTERN, 'm').test(source);
}

/** 関数の書き方の見本一件（タスク 115.266） */
interface FunctionFormSpecimen {
  /** 形の名前。後任が同じ形を再現できる粒度で書く */
  readonly name: string;
  /** 本体の最上位へ置いたときの綴りそのもの。二つの述語へこのまま通す */
  readonly code: string;
  /** 抽出が拾う関数名。拾わないなら `null` */
  readonly declares: string | null;
  /** 最上位で関数を値として束ねる形の判定に当たるか */
  readonly bindsFunctionValue: boolean;
  /**
   * この形をどう扱っているか。`declares` / `bindsFunctionValue` の実測と突き合わせる
   * （`checkFunctionFormSpecimenComposition`）。
   *
   * - `'watched'`: 関数を置く形であり、いずれかの述語が捕らえる
   * - `'false-positive'`: 関数ではないのに束縛の判定が捕らえる（赤へ倒れる誤り。塞がない）
   * - `'residual'`: 関数を置けるのにどちらの述語も捕らえない。**取りこぼし**であり
   *   `residual` に理由を開示する
   * - `'out-of-scope'`: 関数ではなく、どちらの述語も捕らえない（正しい不検出）
   */
  readonly verdict: 'watched' | 'false-positive' | 'residual' | 'out-of-scope';
  /** `verdict` が `'residual'` のときに必須。塞がずに残す理由を書く */
  readonly residual?: string;
}

/**
 * **いかなる先読みでも塞げないと実測された形**（タスク 115.266 が対照群へ必ず載せると定めた）。
 *
 * 先読みは述語が掛かる位置を**狭める**働きしか持たず、掛からない形を掛けることはできない。
 * したがって下の三形のうち `residual` の二形は綴りの範囲では原理的に届かない。
 * `checkFunctionFormSpecimenComposition` が、この三形が対照群から消えないことを固定する
 * （**心地よい部分集合へ痩せるのを防ぐ**）。
 */
const UNBLOCKABLE_FORM_NAMES: readonly string[] = [
  'カンマ演算子で既存の関数を参照だけする束縛（sneakZ）',
  '関数型の注釈を伴う束縛（sneakT）',
  '関数を参照するだけの束縛（plainRef）',
];

/**
 * 関数の書き方の対照群（タスク 115.266。散文の台帳の置き換え）。
 *
 * 各見本は本物の述語 `declaredFunctionNames` / `bindsFunctionValueAtTopLevel` を通り、
 * `declares` / `bindsFunctionValue` の宣言と突き合わされる。**主張が検査そのものになる。**
 * 網羅の主張はしない——「関数を書けるすべての形」は数え上げられない。ここに在るのは
 * **測った形だけ**であり、新しい形が見つかったら見本を足すこと。
 *
 * 移した後に当てた変異と実出力（2026-09-04、リポジトリルートで実測。変異は退避した控えからの
 * 書き戻しで復元し、復元後は 103/103 で緑に戻ることを確かめた）。**移す前は同じ三つの変異が
 * いずれも緑のまま素通りしていた**——上の注釈に当時の実出力を引いた。
 *
 *   - 抽出の綴りの `[<(]` を `\(` へ狭める → 自己検査 103 件中 1 件が落ちる。落ちるのは
 *     「関数の書き方: 型引数を取る関数宣言（sneakG）」である
 *   - 最上位の束縛の綴りから `\(` の枝を落とす → 自己検査 103 件中 16 件が落ちる。落ちるのは
 *     括弧で始まる束縛の見本（アロー・複数行のアロー・カンマ演算子・三項・`sneakZ`）と
 *     偽陽性の四形である
 *   - 最上位の束縛の綴りの `\(` を ``\((?!\s*[\d'"\x60])`` へ絞る（偽陽性を消す向きの絞り込み）
 *     → 自己検査 103 件中 11 件が落ちる。**内訳が要点である**——消えるはずの偽陽性は 3 件
 *     だけで、残る 8 件は `sneakY` / `sneakY2` / `sneakY3` / `sneakYstr` / `sneakW` /
 *     `sneakWn` / `sneakWt` / `sneakZ`、すなわち**本物の関数の束縛が素通りへ倒れた分**である。
 *     **偽陽性は赤で気付けるが、素通りは黙って通る。** この検査は最上位に絞り込みを隠す
 *     場所を作らせないためにあるので、赤へ倒れる誤りを残し、緑へ倒れる誤りを増やす
 *     絞り込みは入れない
 *
 * 群そのものが痩せる向きの変異と実出力は
 * `checkFunctionFormSpecimenComposition` の注釈に置く。
 */
const FUNCTION_FORM_SPECIMENS: readonly FunctionFormSpecimen[] = [
  // --- 抽出が拾う形（台帳への登録が要る） ---
  {
    name: '素の関数宣言（sneakI）',
    code: 'function sneakI(lineText: string): string[] {\n  return [lineText];\n}',
    declares: 'sneakI',
    bindsFunctionValue: false,
    verdict: 'watched',
  },
  {
    name: 'export と async を前置した関数宣言（sneakA）',
    code: 'export async function sneakA(lineText: string): Promise<string[]> {\n  return [lineText];\n}',
    declares: 'sneakA',
    bindsFunctionValue: false,
    verdict: 'watched',
  },
  {
    name: 'export default を前置した関数宣言（sneakF）',
    code: 'export default function sneakF(lineText: string): string[] {\n  return [lineText];\n}',
    declares: 'sneakF',
    bindsFunctionValue: false,
    verdict: 'watched',
  },
  {
    name: '型引数を取る関数宣言（sneakG）',
    code: 'function sneakG<T>(value: T): T[] {\n  return [value];\n}',
    declares: 'sneakG',
    bindsFunctionValue: false,
    verdict: 'watched',
  },

  // --- 最上位の束縛の判定が捕らえる形（置くこと自体を禁じる） ---
  {
    name: '関数式の束縛（sneakB）',
    code: 'const sneakB = function (lineText: string): string[] {\n  return [lineText];\n};',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '一行のアロー関数の束縛（sneakArrow）',
    code: 'const sneakArrow = (lineText: string): string[] => [lineText];',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: 'export を前置したアロー関数の束縛（sneakExp）',
    code: 'export const sneakExp = (lineText: string): string[] => [lineText];',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '引数の括弧を省いたアロー関数の束縛（sneakP）',
    code: 'const sneakP = lineText => [lineText];',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '「= (」の直後で改行する複数行のアロー（sneakC）',
    code: 'const sneakC = (\n  lineText: string\n): string[] => {\n  return [lineText];\n};',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '第一引数の後ろで改行する複数行のアロー（sneakX）',
    code: 'const sneakX = (a: string,\n  b: string): string[] => [a, b];',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: 'カンマ演算子で包んだアロー関数（sneakY）',
    code: 'const sneakY = (0, (l: string): string[] => [l]);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: 'カンマ演算子で包んだ関数式（sneakY2）',
    code: 'const sneakY2 = (0, function (l: string): string[] { return [l]; });',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: 'カンマ演算子の直後で改行する形（sneakY3）',
    code: 'const sneakY3 = (0,\n  (l: string): string[] => [l]);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: 'カンマ演算子の第一項が文字列の形（sneakYstr）',
    code: "const sneakYstr = ('x', (l: string): string[] => [l]);",
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    // 参照を束ねるだけで新しい関数を書かない形。**捕らえているのは広い `\(` の枝であって、
    // 綴りが関数だと見分けたからではない。** 偽陽性を消す向きの絞り込みを入れると、この形は
    // 素通りへ倒れる（実測は上の注釈に記す）
    name: UNBLOCKABLE_FORM_NAMES[0] ?? '',
    code: 'const sneakZ = (0, scanLine);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '三項の第一項が比較の形（sneakW）',
    code: "const sneakW = ('' === '' ? (l: string): string[] => [l] : (l: string): string[] => []);",
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '三項の第一項が数値の形（sneakWn）',
    code: 'const sneakWn = (1 ? (l: string): string[] => [l] : (l: string): string[] => []);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },
  {
    name: '三項の第一項がテンプレートリテラルの形（sneakWt）',
    code: 'const sneakWt = (`x` ? (l: string): string[] => [l] : (l: string): string[] => []);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'watched',
  },

  // --- 関数ではないのに束縛の判定が捕らえる形（偽陽性。赤へ倒れる向きなので塞がない） ---
  {
    name: '偽陽性: 算術の括弧',
    code: 'const answerOffset = (1 + 2) * 3;',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'false-positive',
  },
  {
    name: '偽陽性: 文字列の連結の括弧',
    code: "const joined = ('a' + 'b');",
    declares: null,
    bindsFunctionValue: true,
    verdict: 'false-positive',
  },
  {
    name: '偽陽性: テンプレートリテラルの連結の括弧',
    code: 'const tagged = (`a` + `b`);',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'false-positive',
  },
  {
    name: '偽陽性: オブジェクトを包む括弧',
    code: 'const defaults = ({ limit: 3, offset: 0 });',
    declares: null,
    bindsFunctionValue: true,
    verdict: 'false-positive',
  },

  // --- どちらの述語も捕らえない形（取りこぼし。塞がずに開示する） ---
  {
    name: 'クラスの静的メソッド（sneakD）',
    code: 'class SneakClass {\n  static sneakD(lineText: string): string[] {\n    return [lineText];\n  }\n}',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual:
      '抽出は行頭の `function` の綴りを見るため、クラスの本体に入った定義には届かない。' +
      '塞ぐには綴りではなく構文解析が要る',
  },
  {
    name: '分割代入の束縛（sneakE）',
    code: 'const { sneakE } = { sneakE: function (l: string): string[] { return [l]; } };',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual: '束縛の判定は `const` の次に識別子を要求するため、`{` で始まる形は外れる',
  },
  {
    name: '文としての名前付き即時実行（sneakH）',
    code: '(function sneakH(): void {\n  return;\n})();',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual: '行頭が `(` であり、宣言でも束縛でもない',
  },
  {
    name: '最上位での再代入（既存の関数を包み直す）',
    code: 'scanLine = wrapForTest(scanLine);',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual:
      '宣言でも束縛でもない。実際に検出を落とすところまで測った値は ' +
      '`checkNoFindingsNarrowing` の注釈に記す',
  },
  {
    name: UNBLOCKABLE_FORM_NAMES[1] ?? '',
    code: 'const sneakT: (a: string) => string[] = (a) => [a];',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual:
      '注釈の部分 `(?::[^=\\n]*)?` は注釈に `=` を許さないため、`=>` を含む関数型の注釈を' +
      '伴う束縛は外れる。注釈に `=` を許すと代入の `= ` の位置が定まらず判定そのものが崩れる。' +
      '先読みは掛かる位置を狭める働きしか持たないため、この形へは原理的に届かない',
  },
  {
    name: UNBLOCKABLE_FORM_NAMES[2] ?? '',
    code: 'const plainRef = scanLine;',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'residual',
    residual:
      '右辺が識別子だけで `function` も `(` も `=>` も現れない。綴りの上で ' +
      '`const limit = maxCount;` と区別できないため、先読みでは届かない',
  },

  // --- 関数ではなく、どちらの述語も捕らえない形（正しい不検出。過検出の陰性対照） ---
  {
    name: '正しい不検出: 型注釈つきの空配列の束縛',
    code: 'const collected: string[] = [];',
    declares: null,
    bindsFunctionValue: false,
    verdict: 'out-of-scope',
  },
  {
    name: '正しい不検出: 文字列の束縛',
    code: "const specLabel = 'design.md';",
    declares: null,
    bindsFunctionValue: false,
    verdict: 'out-of-scope',
  },
];

/** 見本一件を本物の述語へ通し、宣言した分類と突き合わせる（タスク 115.266） */
function checkFunctionFormSpecimen(specimen: FunctionFormSpecimen): string[] {
  const failures: string[] = [];
  const names = declaredFunctionNames(specimen.code);
  const bound = bindsFunctionValueAtTopLevel(specimen.code);

  if (specimen.declares === null) {
    if (names.length > 0) {
      failures.push(`抽出が拾わないはずの形から関数名を拾った: ${names.join(', ')}`);
    }
  } else if (!names.includes(specimen.declares)) {
    failures.push(
      `抽出が ${specimen.declares} を拾わなかった（実際に拾った名前: ${names.join(', ') || 'なし'}）`
    );
  }

  if (bound !== specimen.bindsFunctionValue) {
    failures.push(
      `最上位の束縛の判定が宣言と食い違う（宣言 ${String(specimen.bindsFunctionValue)} / 実際 ${String(bound)}）`
    );
  }

  return failures;
}

/**
 * 対照群そのものの構成（タスク 115.266）。
 *
 * **見本を一件ずつ通すだけでは、群が痩せる向きの変更が黙って通る。** 取りこぼしの見本を
 * 全部消せば「全部捕らえている」に見える群が残り、散文の台帳と同じ欠陥へ戻る。そこで
 * 群の構成そのものへ下限を置く。件数ではなく**分類の在り方**で置くのは、同じ形を狙う
 * 重複した見本を減らす正当な変更まで止めないためである（115.222 の作法）。
 *
 * 実測（2026-09-04、リポジトリルートで実測。変異は退避した控えからの書き戻しで復元し、
 * 復元後は 103/103 で緑に戻ることを確かめた）。
 *   - `FUNCTION_FORM_SPECIMENS` を空にする → 確認の実行より前に群の関門が
 *     「対照群『関数の書き方の対照群（抽出と最上位の束縛の実測）』が空です」と
 *     「確認の総数が 73 件しかありません（宣言の下限は 103 件）」を挙げて `EXIT=1` になる
 *   - 取りこぼしの見本（`verdict: 'residual'`）を 6 件すべて消す → 総数が 97 件へ落ち、
 *     下限 103 を割って `EXIT=1` になる。**下限も 97 へ下げて関門を通した場合でも**、
 *     本確認が 97 件中 1 件として落ちる（「取りこぼしの見本が 0 件」および
 *     `sneakT` / `plainRef` が対照群から消えている旨）
 *   - `sneakT` の `bindsFunctionValue` と `verdict` を `true` / `'watched'` へ書き換える
 *     （捕らえているふりをする）→ 自己検査 103 件中 2 件が落ちる。見本一件の確認が
 *     「最上位の束縛の判定が宣言と食い違う（宣言 true / 実際 false）」で、本確認が
 *     「取りこぼしではない見本が残余の理由を持っている」で落ちる
 */
function checkFunctionFormSpecimenComposition(): string[] {
  const failures: string[] = [];

  // 前提が満たせないときは合格ではなく失敗（AI運用7原則 第3原則）
  if (FUNCTION_FORM_SPECIMENS.length === 0) {
    failures.push('関数の書き方の対照群が空である。何も確かめていない状態を合格にしてはならない');
    return failures;
  }
  if (UNBLOCKABLE_FORM_NAMES.length === 0) {
    failures.push('先読みで塞げない形の一覧が空である（対照群が痩せても気付けない）');
  }

  const countOf = (verdict: FunctionFormSpecimen['verdict']): number =>
    FUNCTION_FORM_SPECIMENS.filter((one) => one.verdict === verdict).length;

  if (countOf('watched') === 0) {
    failures.push('捕らえる形の見本が 0 件（述語が何も捕らえなくても緑になる）');
  }
  if (countOf('residual') === 0) {
    failures.push(
      '取りこぼしの見本が 0 件（すべて捕らえているように見える群になっている。' +
        '限界は隠さず実測付きで残すこと）'
    );
  }
  if (countOf('false-positive') === 0) {
    failures.push('偽陽性の見本が 0 件（赤へ倒れる誤りの開示が消えている）');
  }
  if (countOf('out-of-scope') === 0) {
    failures.push('正しい不検出の見本が 0 件（束縛の判定が何にでも反応しても緑になる）');
  }

  // 抽出の側と束縛の側の双方に、実際に掛かる見本が残っていること
  if (!FUNCTION_FORM_SPECIMENS.some((one) => one.declares !== null)) {
    failures.push('抽出が拾う見本が 0 件（抽出の枝を落としても赤くならない）');
  }
  if (!FUNCTION_FORM_SPECIMENS.some((one) => one.bindsFunctionValue)) {
    failures.push('最上位の束縛の判定に掛かる見本が 0 件（束縛の枝を落としても赤くならない）');
  }

  // 分類は実測の宣言と整合していなければならない（「捕らえたふり」を構造で禁じる）
  for (const one of FUNCTION_FORM_SPECIMENS) {
    const caught = one.declares !== null || one.bindsFunctionValue;
    if (one.name.trim() === '') {
      failures.push('名前の無い見本がある（後任が再現できない）');
    }
    if (one.verdict === 'watched' && !caught) {
      failures.push(`捕らえていない形を watched と宣言している: ${one.name}`);
    }
    if (one.verdict === 'false-positive' && !one.bindsFunctionValue) {
      failures.push(`束縛の判定に掛からない形を偽陽性と宣言している: ${one.name}`);
    }
    if ((one.verdict === 'residual' || one.verdict === 'out-of-scope') && caught) {
      failures.push(`捕らえている形を取りこぼし・対象外と宣言している: ${one.name}`);
    }
    if (one.verdict === 'residual' && (one.residual ?? '').trim() === '') {
      failures.push(`取りこぼしの理由を開示していない見本がある: ${one.name}`);
    }
    if (one.verdict !== 'residual' && one.residual !== undefined) {
      failures.push(`取りこぼしではない見本が残余の理由を持っている: ${one.name}`);
    }
  }

  // 先読みで塞げないと実測した三形は、対照群から消えてはならない
  for (const name of UNBLOCKABLE_FORM_NAMES) {
    if (!FUNCTION_FORM_SPECIMENS.some((one) => one.name === name)) {
      failures.push(`先読みで塞げないと実測した形が対照群から消えている: ${name}`);
    }
  }

  return failures;
}

/** 見本ごとに一件の確認を作る（対照群が痩せれば確認の総数が減り、下限の関門に当たる） */
const FUNCTION_FORM_CONTROLS: Case[] = FUNCTION_FORM_SPECIMENS.map((specimen) => ({
  name: `関数の書き方: ${specimen.name}`,
  expected: false,
  custom: () => checkFunctionFormSpecimen(specimen),
}));

/**
 * 抽出が本体から拾える関数宣言の一覧と、絞り込みの検査がそれをどう見張るかの台帳
 * （タスク 115.230）。**拾う綴りと、拾えずに素通りする書き方を散文では持たない**——
 * `FUNCTION_FORM_SPECIMENS` が実体で持ち、本物の述語 `declaredFunctionNames` /
 * `bindsFunctionValueAtTopLevel` を通る（タスク 115.266 が散文から対照群へ移した）。
 *
 * `checkNoFindingsNarrowing` の `bodies` は「見張る側」の宣言である。**見張る側だけを
 * 置くと、そこから 1 本抜けても何も起きない。** タスク 115.230 が是正したのがこれで、
 * 行単位の検出の中核である `collectReferences` は `bodies` に無く、冒頭へ
 * `if (lineText.includes('画像削除')) return [];` を足しても自己検査は素通りした
 * （2026-09-01 に実測。当時の総数は 71 件で、71/71 緑のままだった。是正後の同じ変異の
 * 実出力は `checkNoFindingsNarrowing` の注釈に記す）。
 *
 * そこで台帳を**二つ目の宣言**として置き、次の三者が双方向で一致することを要求する。
 *
 *   (a) 本体のソースに実在し、かつ抽出が拾う関数宣言
 *   (b) 本台帳
 *   (c) `checkNoFindingsNarrowing` の `bodies` のラベルと見張り方
 *
 * これにより、`bodies` からの取り落としも、台帳に載る関数の改名・撤去も失敗になる。
 *
 * **新設をどこまで失敗にできるかは、抽出が拾う綴りで決まる。** その範囲は散文ではなく
 * `FUNCTION_FORM_SPECIMENS` に実体で在り、取りこぼし（`verdict: 'residual'`）も
 * 偽陽性（`'false-positive'`）も同じ表へ並べてある。**網羅の主張はしない**——
 * 「関数を書けるすべての形」は数え上げられないため、測った形だけを載せる。取りこぼしは
 * いずれも `_Boundary: 絞り込みの検査が監視する関数の範囲_` の外であり、本タスクでは塞がない。
 *
 * `watch` は見張りの強さである。
 *   - `'whole-body'`: 本体の空でない全行を許可形と突き合わせる。逃がしを差し込む余地が無い
 *   - `'identifiers'`: 特定の識別子に触れる文だけを見る。`main` のみに許す。理由は
 *     報告の文面（日本語の長文）を全行固定すると文言の改訂で毎回落ちるためで、
 *     `main` の早期終了・件数の詐称は `checkReportedCountsAreExact` が
 *     サブプロセスの終了コードと報告件数で捕らえる
 */
const EXECUTABLE_FUNCTION_INVENTORY: ReadonlyArray<{
  name: string;
  watch: 'whole-body' | 'identifiers';
}> = [
  // 走査根の列挙。本体ではなく共有部品 scripts/design-document.ts に在るため、
  // 台帳の突き合わせも本体の抽出も readWatchedSources() の結合ソースに対して行う
  // （タスク 115.231）
  { name: 'collectDesignDocuments', watch: 'whole-body' },
  { name: 'isProductionReference', watch: 'whole-body' },
  { name: 'mentionsProductionSource', watch: 'whole-body' },
  { name: 'isFileLengthDescription', watch: 'whole-body' },
  { name: 'isThousandsSeparated', watch: 'whole-body' },
  { name: 'isNotDelimitedLineList', watch: 'whole-body' },
  { name: 'rejectsTestReference', watch: 'whole-body' },
  { name: 'scanLine', watch: 'whole-body' },
  { name: 'splitTableRow', watch: 'whole-body' },
  { name: 'isTableSeparatorRow', watch: 'whole-body' },
  { name: 'findLineColumnIndex', watch: 'whole-body' },
  { name: 'scanTableLineColumns', watch: 'whole-body' },
  { name: 'scanDocument', watch: 'whole-body' },
  { name: 'run', watch: 'whole-body' },
  { name: 'main', watch: 'identifiers' },
];

/**
 * 台帳・本体・`bodies` の三者が双方向で一致すること（タスク 115.230）。
 *
 * 片方向（`bodies` が挙げる関数が本体に在る）だけでは、本体に新しい関数を足して
 * そこへ逃がしを置く手が残る。両方向を要求する。
 */
function checkMonitoredFunctionInventory(
  monitored: ReadonlyArray<{ label: string; watch: 'whole-body' | 'identifiers' }>
): string[] {
  const failures: string[] = [];
  const source = readWatchedSources();

  // 前提が満たせないときは合格ではなく失敗（第3原則）
  if (EXECUTABLE_FUNCTION_INVENTORY.length === 0) {
    failures.push('関数の台帳が空である。監視対象が無い状態を合格にしてはならない');
  }
  if (monitored.length === 0) {
    failures.push('絞り込みの検査が本体を一つも見張っていない');
  }

  // 抽出は `declaredFunctionNames` に一本化してある。**同じ述語を対照群
  // `FUNCTION_FORM_SPECIMENS` も通る**ので、綴りを変えれば見本の側が赤くなる（対象の同一性。
  // タスク 115.266）。実測: 抽出の `[<(]` を `\(` へ狭めると自己検査 103 件中 1 件
  // （「関数の書き方: 型引数を取る関数宣言（sneakG）」）が落ちる（2026-09-04 に
  // リポジトリルートで実測。変異は退避した控えからの書き戻しで復元した）
  const declared = declaredFunctionNames(source);
  let match: RegExpExecArray | null;
  if (declared.length === 0) {
    failures.push('本体から関数宣言を一件も取り出せなかった（抽出が壊れている）');
  }

  for (const name of declared) {
    if (!EXECUTABLE_FUNCTION_INVENTORY.some((entry) => entry.name === name)) {
      failures.push(`本体に台帳へ載っていない関数がある: ${name}（見張るか台帳を更新すること）`);
    }
  }
  for (const entry of EXECUTABLE_FUNCTION_INVENTORY) {
    if (!declared.includes(entry.name)) {
      failures.push(
        `台帳が挙げる関数が本体に無い: ${entry.name}（改名・撤去で見張りが空振りしている）`
      );
    }
    const rule = monitored.find((item) => item.label === entry.name);
    if (rule === undefined) {
      failures.push(`台帳の関数が絞り込みの検査で見張られていない: ${entry.name}`);
      continue;
    }
    if (rule.watch !== entry.watch) {
      failures.push(
        `見張りの強さが台帳と食い違う: ${entry.name}（台帳 ${entry.watch} / 実際 ${rule.watch}）`
      );
    }
  }
  for (const rule of monitored) {
    if (!EXECUTABLE_FUNCTION_INVENTORY.some((entry) => entry.name === rule.label)) {
      failures.push(`見張っている本体が台帳に無い: ${rule.label}`);
    }
  }

  // 規則表の `reject` は台帳に載る名前付き関数でなければならない。
  // 無名関数を直に書けるようにすると、台帳にも `bodies` にも載らない場所が生まれる
  const REJECT = /\breject:\s*([^,\n]+)/g;
  while ((match = REJECT.exec(source)) !== null) {
    const value = match[1]?.trim() ?? '';
    if (!EXECUTABLE_FUNCTION_INVENTORY.some((entry) => entry.name === value)) {
      failures.push(`規則表の reject が台帳の名前付き関数でない: ${value}`);
    }
  }

  // 最上位で関数を値として束ねる形（アロー関数・関数式）は上の関数宣言の抽出に掛からない
  // ため、置くこと自体を禁じる。掛かる形・掛からない形・関数でないのに掛かる形は、すべて
  // `FUNCTION_FORM_SPECIMENS` が実体で持ち、ここと同じ述語 `bindsFunctionValueAtTopLevel`
  // を通る（タスク 115.266。散文で数え上げると、まだ挙げていない形を一つ持ってくるだけで
  // 反証できてしまう）。取りこぼしはいずれも本タスクの境界の外である
  if (bindsFunctionValueAtTopLevel(source)) {
    failures.push(
      '最上位に関数を値として束ねる宣言がある（アロー関数・関数式）。台帳へ載る function 宣言で書くこと'
    );
  }

  return failures;
}

/** 注釈の列挙を取り出す目印（この綴りは自ファイル内でただ一箇所に在ること） */
const NARROWING_ENUMERATION_ANCHOR = '絞り込みに使える操作（';

/** 適用先の列挙の終端の目印（自ファイルの注釈の行でただ一箇所に在ること。タスク 115.321） */
const NARROWING_APPLICATION_ANCHOR = 'の本体に現れないこと';

/**
 * `NARROWING` の枝ごとの**意味**の見本（タスク 115.321）。拾うべき字面と拾っては
 * ならない字面を、**その枝そのもの**へ通す。
 *
 * 名前の全単射（{@link checkNarrowingEnumerationMatchesRegex} が 115.267 で機構化した
 * もの）が突き合わせるのは、正規化した操作名であって枝の意味ではない。正規化は `\b` と
 * `\(` と `\.` と先頭の `new ` を落とすため、**同じ名前へ潰れる別の意味の枝が枝ごとに
 * 複数ある**。名前が変わらない緩和は、名前の突き合わせでは黙って通る。
 *
 * 見本を置く前の実測（2026-09-07。コミット `6ce61827` のツリー。当時の枝は 11 本）。
 * いずれも変異は退避した控えからの書き戻しで復元し、`md5sum` で一致を確かめた。
 *   - 起票が挙げた変異——`\bdelete\b` を `\.delete\(` へ置き換える（裸の
 *     `delete obj.x` を禁止対象から外す実質的な緩和）——を当てても**落ちた確認は
 *     0 件**であった。2026-09-04 の起票時の観測が、そのまま現況でも再現した
 *   - **同型は一例では終わらない。** 11 本の枝を一本ずつ「`new ` と操作名」
 *     （`\.filter\(` を `new filter` へ 等。`new Set` と `new Map` の二本は
 *     `\.Set\(` と `\.Map\(` へ）で置き換えると、禁止は事実上死ぬのに正規化後の
 *     名前は変わらない。**11 本とも落ちた確認は 0 件**であった
 *   - 兄弟の `check-design-reference-format.selftest.ts` でも同じ 11 本を当て、
 *     **11 本とも落ちた確認は 0 件**であった
 *
 * 見本を置いた後は、同じ変異のいずれもがその枝の見本を外して落ちる。再現は
 * `npm run check:design-code-refs:selftest`（兄弟は `npm run check:design-refs:selftest`）。
 *
 * 見本は**規則の側**へ置く（タスク 115.316 の作法）。禁止を狭めれば `mustMatch` が
 * 外れ、広げれば `mustNotMatch` が当たる。どちらの向きも赤へ倒れる。
 */
const NARROWING_BRANCH_SPECIMENS: ReadonlyArray<{
  /** 正規化後の操作名（`NARROWING` の枝と一対一に対応させる） */
  operation: string;
  /** その枝が拾わなければならない字面（禁止が緩む向きを赤へ倒す） */
  mustMatch: readonly string[];
  /** その枝が拾ってはならない字面（禁止が広がりすぎる向きを赤へ倒す） */
  mustNotMatch: readonly string[];
}> = [
  {
    operation: 'filter',
    mustMatch: [
      'const kept = references.filter((one) => one.ok);',
      'const kept = references.filter(isReal);',
      '  .filter(isReal)',
    ],
    mustNotMatch: [
      'const filter = buildPredicate();',
      'const kept = references.filterOut(one);',
      'const kept = filter(references);',
    ],
  },
  {
    operation: 'slice',
    mustMatch: [
      'const head = references.slice(0, 3);',
      'const tail = references.slice(-1);',
      '  .slice(0, 3)',
    ],
    mustNotMatch: [
      'const slice = 0;',
      'const head = references.sliceTail(3);',
      'const head = slice(references, 3);',
    ],
  },
  {
    operation: 'splice',
    mustMatch: ['references.splice(0, 1);', 'references.splice(-1, 1);', '  .splice(0, 1)'],
    mustNotMatch: ['const splice = 0;', 'references.spliceOut(0);', 'splice(references, 0);'],
  },
  {
    operation: 'find',
    mustMatch: [
      'const one = references.find((item) => item.ok);',
      'const hit = references.find(isBad);',
      '  .find(isBad)',
    ],
    mustNotMatch: [
      'const find = 0;',
      'const at = references.findIndex((item) => item.ok);',
      'const one = find(references);',
    ],
  },
  {
    operation: 'some',
    mustMatch: [
      'if (references.some((item) => item.ok)) return;',
      'if (references.some(isBad)) return;',
      '  .some(isBad)',
    ],
    mustNotMatch: [
      'const some = 0;',
      'if (references.someOf(item)) return;',
      'if (some(references)) return;',
    ],
  },
  {
    operation: 'every',
    mustMatch: [
      'if (references.every((item) => item.ok)) return;',
      'if (references.every(ok)) return;',
      '  .every(ok)',
    ],
    mustNotMatch: [
      'const every = 0;',
      'if (references.everyOne(item)) return;',
      'if (every(references)) return;',
    ],
  },
  {
    operation: 'includes',
    mustMatch: ["if (lineText.includes('画像削除')) return [];", "  .includes('画像削除')"],
    mustNotMatch: [
      'const includes = 0;',
      "if (lineText.includesAll('画像削除')) return [];",
      'if (includes(lineText)) return [];',
    ],
  },
  {
    operation: 'Set',
    mustMatch: ['const seen = new Set<string>();'],
    mustNotMatch: ['const settings = readSettings();', 'const seen = Set();'],
  },
  {
    operation: 'Map',
    mustMatch: ['const seen = new Map<string, number>();'],
    mustNotMatch: ['const mapped = Mapping.of(one);', 'const seen = Map();'],
  },
  {
    operation: 'continue',
    mustMatch: ['if (skipped) continue;', 'continue;'],
    mustNotMatch: ['const continued = true;', 'const discontinue = 0;'],
  },
  {
    operation: 'delete',
    mustMatch: ['delete target.cache;', 'known.delete(key);'],
    mustNotMatch: ['const deleted = true;', 'const predelete = 0;'],
  },
];

/** `NARROWING` の枝を操作名へ正規化する（`\.filter\(` → `filter`、`new Set` → `Set`） */
function narrowingOperationsFromRegex(narrowing: RegExp): string[] {
  return narrowing.source
    .split('|')
    .map((alternative) =>
      alternative
        .replace(/\\b/g, '')
        .replace(/\\\(/g, '')
        .replace(/\\\./g, '')
        .replace(/^new /, '')
        .trim()
    );
}

/**
 * 注釈の行だけを連ねた散文を返す。
 *
 * **走査するのは注釈の行だけ**（`*` で始まる行）。目印そのものを保持する定数の宣言は
 * コードの行であって散文ではないため、ここで数に入れると目印が常に二箇所になる。
 * 行頭の `*` と字下げを落として**改行を挟まずに**連ねるのは、適用先の列挙が行をまたいで
 * 折り返されるためである（タスク 115.321。折り返し方は二つの自己検査で異なる）。
 */
function narrowingProse(selfSource: string): string {
  return selfSource
    .split('\n')
    .filter((line) => line.trim().startsWith('*'))
    .map((line) => line.trim().slice(1).trim())
    .join('');
}

/**
 * 注釈の列挙から、逆引用符で囲まれた操作名を順に取り出す。
 *
 * 目印がちょうど一箇所でなければ `null` を返し、呼び出し元が失格にする。
 */
function narrowingOperationsFromProse(selfSource: string): string[] | null {
  const prose = narrowingProse(selfSource);
  if (prose.split(NARROWING_ENUMERATION_ANCHOR).length - 1 !== 1) return null;
  const start = prose.indexOf(NARROWING_ENUMERATION_ANCHOR) + NARROWING_ENUMERATION_ANCHOR.length;
  const end = prose.indexOf('）', start);
  if (end === -1) return null;
  const operations: string[] = [];
  for (const match of prose.slice(start, end).matchAll(/`([^`]+)`/g)) {
    const operation = match[1];
    if (operation !== undefined) operations.push(operation);
  }
  return operations;
}

/**
 * 注釈が挙げる**適用先の関数名**の列挙を順に取り出す（タスク 115.321）。
 *
 * 取り出す窓は、操作の列挙を閉じる `）` から {@link NARROWING_APPLICATION_ANCHOR} まで
 * である。窓の外の括弧書き（一律禁止を課さない関数の理由）は数に入らない。
 * どちらの目印もちょうど一箇所でなければ `null` を返し、呼び出し元が失格にする。
 */
function narrowingApplicationTargetsFromProse(selfSource: string): string[] | null {
  const prose = narrowingProse(selfSource);
  if (prose.split(NARROWING_ENUMERATION_ANCHOR).length - 1 !== 1) return null;
  if (prose.split(NARROWING_APPLICATION_ANCHOR).length - 1 !== 1) return null;
  const enumerationEnd = prose.indexOf('）', prose.indexOf(NARROWING_ENUMERATION_ANCHOR));
  const applicationEnd = prose.indexOf(NARROWING_APPLICATION_ANCHOR);
  if (enumerationEnd === -1) return null;
  if (applicationEnd <= enumerationEnd) return null;
  const targets: string[] = [];
  for (const match of prose.slice(enumerationEnd, applicationEnd).matchAll(/`([^`]+)`/g)) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }
  return targets;
}

/**
 * `NARROWING` の枝ごとに、意味の見本 {@link NARROWING_BRANCH_SPECIMENS} を**その枝
 * そのもの**へ通す（タスク 115.321）。名前の全単射が見ない「名前は変わらないが意味が
 * 変わる」書き換えを、ここで赤へ倒す。
 *
 * 見本と枝は**双方向で一対一**に要求する。見本の無い枝を足せば「意味の見本が無い」で
 * 落ち、枝の消えた見本が残れば「枝が無い」で落ちる。片側だけの見本（拾う字面だけ、
 * あるいは拾わない字面だけ）も失格にする——片側だけでは、緩める向きか広げる向きの
 * どちらかが素通りするためである（AI運用7原則 第3原則）。
 */
function checkNarrowingBranchSpecimens(narrowing: RegExp): string[] {
  const failures: string[] = [];
  const alternatives = narrowing.source.split('|');
  const names = narrowingOperationsFromRegex(narrowing);
  if (NARROWING_BRANCH_SPECIMENS.length === 0) {
    failures.push('枝の意味の見本が 0 件（見本の無い突き合わせはどんな枝とも矛盾しない）');
  }
  for (let index = 0; index < alternatives.length; index += 1) {
    const alternative = alternatives[index];
    const name = names[index];
    if (alternative === undefined || name === undefined) continue;
    const specimen = NARROWING_BRANCH_SPECIMENS.find((one) => one.operation === name);
    if (specimen === undefined) {
      failures.push(
        `NARROWING の枝に意味の見本が無い: ${alternative}（NARROWING_BRANCH_SPECIMENS へ` +
          '拾うべき字面と拾ってはならない字面を置くこと。名前だけの突き合わせは意味の変化を見ない）'
      );
      continue;
    }
    if (specimen.mustMatch.length === 0 || specimen.mustNotMatch.length === 0) {
      failures.push(
        `枝 ${alternative} の意味の見本が片側だけである（拾うべき字面と拾ってはならない字面の両方を置くこと）`
      );
    }
    let branch: RegExp;
    try {
      branch = new RegExp(alternative);
    } catch {
      failures.push(`NARROWING の枝を単独の正規表現として組めない: ${alternative}`);
      continue;
    }
    for (const code of specimen.mustMatch) {
      if (!branch.test(code)) {
        failures.push(`枝 ${alternative} が拾うべき字面を拾わない: ${code}（禁止が緩んでいる）`);
      }
    }
    for (const code of specimen.mustNotMatch) {
      if (branch.test(code)) {
        failures.push(
          `枝 ${alternative} が拾ってはならない字面を拾う: ${code}（禁止が広がりすぎている）`
        );
      }
    }
  }
  for (const specimen of NARROWING_BRANCH_SPECIMENS) {
    if (!names.includes(specimen.operation)) {
      failures.push(`意味の見本があるが NARROWING に対応する枝が無い: ${specimen.operation}`);
    }
  }
  return failures;
}

/**
 * 上の注釈が挙げる「絞り込みに使える操作」の列挙が、禁止の判定が実際に使う `NARROWING` と
 * 一致すること（タスク 115.267）。
 *
 * **正規表現という開いた構文空間の性質を散文で主張すると、列挙されていない一例を持って
 * くるだけで反証できる**（タスク 115.266）。本件はその系である——起票時の列挙は
 * `NARROWING` に在る `.every(` を落としていた。向きは安全側で、**実装のほうが散文より
 * 厳しかったため逃がしは生まれていない**。それは実測で確かめた——本体 `scanDocument` の
 * `for (const reference of scanLine(lineText)) {` の直前へ `.every(` を用いた逃がしを一行
 * （`if (scanLine(lineText).every((one) => one.includes('画像削除'))) return;`）差し込むと、
 * 自己検査 103 件中 1 件が「scanDocument の本体に絞り込みに使える操作がある: .every(」と
 * 「scanDocument が検出結果／走査対象へ想定外の操作をしている」を挙げて落ちる
 * （2026-09-04 に総数 103 件で実測。退避した控えからの書き戻しで復元し、
 * 103/103 緑に戻ることを確かめた）。
 * だが逆向き——列挙のほうが広い——へずれれば、読み手は禁じられていない操作を禁じられて
 * いると誤読する。**どちらの向きも赤へ倒すには、散文を検査の入力にするしかない。**
 *
 * 見本ではなく全単射で持てるのは、`NARROWING` の枝が**閉じた有限集合**だからである
 * （115.266 が見本を要したのは、関数の書き方という開いた構文空間が相手だったため）。
 * 材料は二つとも本物である——実装の側は禁止の判定が実際に使う `NARROWING` の `source`
 * から導き（写しを置かない）、散文の側は自ファイルのソースから読み直す。
 *
 * 実測（いずれも 2026-09-04 にリポジトリルートで実測。変異は退避した控えからの書き戻しで
 * 復元し、復元後は 103/103 で緑に戻ることを確かめた。兄弟の `check-design-reference-format.selftest.ts` でも同じ
 * 四つを当て、総数 87 件でそれぞれ 1 件が同じ文面で落ちた）。
 *   - 注釈の列挙から `every` を外す（起票時の食い違いの再現）→ 103 件中 1 件が
 *     「NARROWING が禁じている操作が注釈の列挙に無い: every」で落ちる
 *   - 注釈の列挙へ `NARROWING` が禁じていない `reduce` を足す（危険な向き）→ 103 件中
 *     1 件が「注釈の列挙にあるが NARROWING が禁じていない操作がある: reduce」で落ちる
 *   - `NARROWING` へ枝 `\.at\(` を一本足す（実装が動いたとき散文が追随するか）→
 *     103 件中 1 件が「NARROWING が禁じている操作が注釈の列挙に無い: at」で落ちる。
 *     **写しを持たない設計がここで効く**
 *   - 散文の側の目印を複製して二箇所にする → 103 件中 1 件が「列挙を自ファイルから
 *     取り出せない」で落ちる（曖昧なまま突き合わせた気になるのを禁じる。第3原則）
 *
 * **塞いでいないこと**: 一致は集合として見るため、**列挙の順序**は固定していない。また
 * 本確認は {@link checkNoFindingsNarrowing} の中の一節であって確認の要素ではないため、
 * **呼び出しの一行を落とせば下限の関門には当たらない**——実測すると、呼び出しを落として
 * 列挙から `every` を外した状態で自己検査は 103/103 緑・`EXIT=0` であった
 * （2026-09-04 に実測。`MINIMUM_TOTAL_CASES` が見るのは確認の要素の数であり、
 * 節の有無は数に現れない）。削除は差分に現れる。**塞がないことと、書かないことは別で
 * ある**（115.242 の教訓）。
 *
 * **名前の水準にとどまっていた限界は塞いだ**（タスク 115.321）。枝ごとの意味の見本
 * {@link NARROWING_BRANCH_SPECIMENS} を枝そのものへ通し、同じ散文が挙げる**適用先の
 * 関数名の列挙**も `forbidAllNarrowing` を課している本体と双方向で突き合わせる。実測は
 * いずれも 2026-09-07（コミット `6ce61827` のツリー）で、変異は退避した控えからの
 * 書き戻しで復元し `md5sum` で一致を確かめた。落ちた確認はいずれも 1 件である。
 *   - 起票が挙げた変異——`\bdelete\b` を `\.delete\(` へ置き換える——を当てると
 *     「枝 `\.delete\(` が拾うべき字面を拾わない: delete target.cache;（禁止が緩んで
 *     いる）」で落ちる。**見本を置く前は緑のまま通っていた**
 *   - 適用先の列挙から `scanDocument` を落とす → 「一律禁止を課している本体が注釈の
 *     適用先の列挙に無い: scanDocument」で落ちる
 *   - 適用先の列挙の `scanDocument` を `collectDesignDocuments` へ書き換える → 上に加えて
 *     「注釈の適用先の列挙にあるが一律禁止を課していない本体がある: collectDesignDocuments」も挙がる
 *   - 実装の側で `scanDocument` の `forbidAllNarrowing` を `false` へ倒す（散文は
 *     そのまま）→ 「注釈の適用先の列挙にあるが一律禁止を課していない本体がある:
 *     scanDocument」で落ちる。**散文と実装のどちらが動いても赤くなる**
 *
 * **見本を置いてなお塞いでいないこと**（`development-discipline.md` の三層——機械保証／
 * 人手走査／未走査の残余——に分けて書く）。
 *
 * **機械が保証するのは**、`NARROWING` の各枝が {@link NARROWING_BRANCH_SPECIMENS} の
 * `mustMatch`（26 件）を全て拾い `mustNotMatch`（29 件）を一つも拾わないことだけである。
 * 見本が触れない意味の変化は素通りする。
 *
 * **人手走査の範囲をコマンドで宣言する。** 走査も向きの判定も
 * `npx tsx scripts/survey-narrowing-branch-variants.ts [--list] [--dump] [--outside]` が行い、
 * 材料（`NARROWING` の枝と {@link NARROWING_BRANCH_SPECIMENS}）は走査対象のソースから
 * 読み直す（写しを置かない）。
 * 土台の字面・挿入する語・重複の扱い・向きの判定に用いるコーパスはいずれも同スクリプトの
 * 定数が持つ。以下はその出力であり、**第三者は同じコマンドで同じ数に着地する**
 * （2026-09-08 にリポジトリルートで実測。範囲を日本語で宣言してはならないという
 * `.kiro/steering/development-discipline.md` の要求に従い、散文での宣言から改めた——
 * 同じ記述から出発した二者が別の数に着地する事故が現に起きたためである）。
 *   - 走査 A（接辞のみ）: 枝 11 本で候補 4840 通り、通り抜け 71 本
 *     （緩む 14・広がる 28・同値 29）
 *   - 走査 B（任意の位置・高々二個）: 候補 17115 通り・うち名前が変わらない別形 10699 本、
 *     通り抜け 37 本（緩む 18・広がる 9・同値 10）。**接辞の族が届かない語中への挿入**を含む
 *   - 二つを合併すると通り抜けは 89 本（緩む 22・広がる 30・同値 37）。その 89 本すべてを
 *     実際に枝へ差し替えて自己検査を走らせ、**両ファイルとも緑**であること、および
 *     見本による予測と実走の食い違いが 0 件であることを確かめた（実走は 2026-09-07。
 *     89 本の一覧は `--dump` が印字する）
 *   - 走査 B を高々三個まで広げると候補 336404 通り・別形 148571 本・通り抜け 115 本
 *     （緩む 52・広がる 27・同値 36）。緩む向きは二個までと同じく `new Set` と `new Map`
 *     の二枝だけに留まった
 *
 * **「挿入で尽くされる」という一つ前の版の導出は誤りであった（撤回する）。** 正規化が落とすのは
 * `\b` と `\(` と `\.` と先頭の `new `、および `trim` が落とす前後の空白だけだが、削除は
 * **逐次適用**であるため、削除の結果として新たな削除対象が合成される。反例は `\\b.filter\(`
 * である——妥当な正規表現であり、`\b` の削除が `\.` を生んで最終的に `filter` へ正規化される
 * が、この字面は上の語を「操作名」や「`new ` を冠した操作名」へ挿入しては作れない。
 * **ゆえに挿入の族は名前を保存する字面の部分集合にすぎず、上の数値は名前保存の別形を
 * 尽くしていない。** 挿入の個数に上限は無いので名前を変えない別形は枝ごとに**無限にあり**、
 * 上に挙げたのは有限な切片である。
 *   - 族の外も同じコマンドで測った（`--outside`）。語ではなく**文字**（`\` `b` `(` `.` 半角空白
 *     `n` `e` `w` の 8 文字）を高々三個挿入して得た字面のうち、名前が変わらず、走査 A と
 *     走査 B（高々三個）のどちらの候補にも現れないものは**両ファイルとも 1380 本**あり、
 *     そのうち**見本を通り抜けたものは 0 本**である（2026-09-08 に実測）
 *   - 実走でも当てた——`NARROWING` の `\.filter\(` を `\\b.filter\(` へ置き換えると
 *     「枝 `\\b.filter\(` が拾うべき字面を拾わない」で落ち、`\.find\(` を `\\b.find\(` へ
 *     置き換えても同じ文面で落ちる。落ちた確認はいずれも 1 件で、**両ファイルで赤**である
 *     （2026-09-08 に実測。変異は退避した控えからの書き戻しで復元し `md5sum` で一致を
 *     確かめた）
 *
 * **結論はその範囲でしか言えない。** 上の範囲で**禁止が緩む向きの通り抜けは 22 本**で
 * あり、**範囲外（語の挿入が四個以上、文字の挿入が四個以上、上に挙げていない文字の挿入、
 * 半角空白以外の空白文字など）は保証しない**。22 本はすべて `new Set` と `new Map` の枝で、
 * `new Set` の前後いずれかへ `\b` を足す形（`\bnew Set` / `new Set\b` / `new \bSet\b` など）
 * である。取り落とすのは `new Settings` や `anew Set` のように**語構成文字と隣り合う字面**
 * だけで、実在の `new Set(...)` は取り落とさない。**この 22 本は見本では塞げない**——塞ぐには
 * `new Settings` を「拾うべき字面」として見本へ書かねばならず、それは現に在る偽陽性を要求として固定してしまう。
 * 網を狭めて 0 本に見せかけるより、残すほうを採った。
 *
 * **一つ前の版が「緩む向きは 0 本」と書いていたのは誤りであった。** その版が数えた別形は
 * 「接頭辞 4 種 × 接尾辞 3 種」という狭い族で、`\(` の重複挿入（`\.filter\(` を
 * `\.filter\(\(` へ）を構造的に排除していた。その形は `mustMatch` が矢印関数の字面だけ
 * だったため通り抜け、`xs.filter(isReal)` を取り落としていた。本版は単一引数呼び出しと
 * 連鎖の継続行（`  .filter(isReal)`）を見本へ足して塞いだ——実測すると `\.filter\(\(` /
 * `\.find\(\(` / `\.some\(\(` / `\.every\(\(` はいずれも**両ファイルで赤**になり、
 * 「枝 … が拾うべき字面を拾わない」を挙げる。同じく新たに塞いだ `\b\.filter\(`（連鎖の
 * 継続行を取り落とす）・`\.slice\(\b`・` continue\b` も両ファイルで赤である
 * （いずれも 2026-09-07 に実測）。
 *
 * **挿入以外の書き換えは 115.267 の全単射が拾う。** 文字クラス（`[.]filter\(`）・量指定子
 * （`\.filter\(?`）・先読み（`\.filter(?=\()`）・後読み（`(?<=\.)filter\(`）はいずれも
 * 正規化後の名前が `filter` から変わるため、見本へ届く前に名前の突き合わせで落ちる
 * （前三者を 2026-09-07 に両ファイルで実測。「NARROWING が禁じている操作が注釈の列挙に
 * 無い」と「注釈の列挙にあるが NARROWING が禁じていない操作がある」を挙げて落ちた）。
 *
 * **見本そのものを薄める変更も、機構では止まらない。** `delete` の `mustMatch` から裸の
 * `delete target.cache;` を落とすと落ちた確認は 0 件になり、その状態で起票の変異
 * （`\bdelete\b` を `\.delete\(` へ）を重ねても落ちた確認は 0 件のままである
 * （2026-09-07 に実測。兄弟でも同じ二つを当て、いずれも落ちた確認は 0 件）。見本の削除は
 * 差分に現れる。一方、見本を**空にする**変異と、見本を**片側だけ**にする変異
 * （`mustNotMatch` を空にする）は、いずれも落ちた確認 1 件で赤くなる（同日に両ファイルで
 * 実測）。対照群を空にしても緑で通る状態にはしていない（AI運用7原則 第3原則）。
 */
function checkNarrowingEnumerationMatchesRegex(
  narrowing: RegExp,
  forbidAllNarrowingLabels: readonly string[]
): string[] {
  const failures: string[] = [];
  const selfSource = fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8');
  const fromRegex = narrowingOperationsFromRegex(narrowing);
  const fromProse = narrowingOperationsFromProse(selfSource);

  // 突き合わせの材料が揃わないときは合格ではなく失敗（AI運用7原則 第3原則）
  if (fromProse === null) {
    return [
      `注釈の「${NARROWING_ENUMERATION_ANCHOR}…）」の列挙を自ファイルから取り出せない` +
        '（目印が消えたか二箇所になった。散文と実装を突き合わせられない状態を合格にしない）',
    ];
  }
  if (fromRegex.length === 0) {
    failures.push('NARROWING の枝が 0 件（何も禁じていない正規表現と空の列挙は必ず一致する）');
  }
  if (fromProse.length === 0) {
    failures.push('注釈の列挙が 0 件（空の列挙はどんな正規表現とも矛盾しない）');
  }

  for (const operation of fromRegex) {
    if (operation.includes('\\')) {
      failures.push(
        `NARROWING の枝を操作名へ正規化できない: ${operation}（正規化の規則を足すこと。` +
          '正規化できない枝を黙って通すと、突き合わせが空振りする）'
      );
    }
    if (!fromProse.includes(operation)) {
      failures.push(`NARROWING が禁じている操作が注釈の列挙に無い: ${operation}`);
    }
  }
  for (const operation of fromProse) {
    if (!fromRegex.includes(operation)) {
      failures.push(`注釈の列挙にあるが NARROWING が禁じていない操作がある: ${operation}`);
    }
  }

  // 名前が一致しても枝の意味は変わりうる。枝ごとの見本で意味を固定する（タスク 115.321）
  failures.push(...checkNarrowingBranchSpecimens(narrowing));

  // 同じ散文が挙げる「適用先の関数名」も、実装の一律禁止と双方向で突き合わせる（同上）
  const targetsFromProse = narrowingApplicationTargetsFromProse(selfSource);
  if (targetsFromProse === null) {
    failures.push(
      `注釈の「…）が … ${NARROWING_APPLICATION_ANCHOR}」の適用先の列挙を自ファイルから` +
        '取り出せない（目印が消えたか二箇所になった。適用先の散文と実装を突き合わせられない' +
        '状態を合格にしない）'
    );
    return failures;
  }
  if (targetsFromProse.length === 0) {
    failures.push('注釈の適用先の列挙が 0 件（空の列挙はどんな適用先の集合とも矛盾しない）');
  }
  if (forbidAllNarrowingLabels.length === 0) {
    failures.push('一律禁止を課している本体が 0 件（空の母集団を合格にしない。第3原則）');
  }
  for (const label of forbidAllNarrowingLabels) {
    if (!targetsFromProse.includes(label)) {
      failures.push(`一律禁止を課している本体が注釈の適用先の列挙に無い: ${label}`);
    }
  }
  for (const target of targetsFromProse) {
    if (!forbidAllNarrowingLabels.includes(target)) {
      failures.push(`注釈の適用先の列挙にあるが一律禁止を課していない本体がある: ${target}`);
    }
  }
  return failures;
}

/**
 * 検出結果を返す前に**絞り込む経路が無い**こと。
 *
 * 語名（`baseline` / `allowlist` / `許容` …）の一致で見ると、`KNOWN_EXCEPTIONS` のように
 * 名前を変えた絞り込みを差し込むだけで擦り抜ける。ここでは名前ではなく
 * **`findings` と走査対象一覧に対して何をしているか**を見る。
 *
 * 第2回のレビューは、この検査が **`run` と `scanDocument` しか見ていない**ため、
 * (a) 走査対象を決める `collectDesignDocuments` に `if (entry.name === '<spec>') continue;`
 * を1行足す、(b) 終了コードを決める `main()` で `result.findings` を `splice` / `filter` する、
 * の2種で骨抜きにできることを実証した。**間引きは検出のどこでもできる**ため、
 * 対象を「走査対象の決定」「検出」「集計」「報告と終了コード」の全段へ広げる。
 *
 * **第3回（タスク 115.230）は、見張る範囲そのものが足りていないことを実測した。**
 * それまで見ていたのは `collectDesignDocuments` / `run` / `scanDocument` / `main` の
 * 4 本で、**行単位の検出の中核である `scanLine` が入っていなかった。** その冒頭へ
 * `if (lineText.includes('画像削除')) return [];` を足すと、自己検査は 71/71 緑・
 * 本検査も緑で素通りした（2026-09-01 に、当時の総数 71 件で実測）。同じ 1 行を現在の形に
 * 当てると自己検査は 103 件中 1 件が落ち、内訳は
 * 「scanLine が検出結果／走査対象へ想定外の操作をしている」の 1 件である
 * （2026-09-01 に総数 71 件で実測し、総数が 103 件になった 2026-09-04 に再実測した）。
 * 表の `行` 列を拾う `scanTableLineColumns` も同型で、
 * 冒頭へ `if (lines.some((line) => line.includes('画像削除'))) return [];` を足すと、
 * 現在の形では同じく 103 件中 1 件が落ちる（同じ二時点で実測）。
 *
 * **見張る範囲は、抽出 `declaredFunctionNames` が本体から拾える関数宣言であり、台帳
 * `EXECUTABLE_FUNCTION_INVENTORY` と双方向で一致させる。** その範囲で、取り落とし・改名・
 * 撤去・新設が失敗になる。**どの書き方が範囲に入り、どれが外れるかは散文では持たない**
 * ——`FUNCTION_FORM_SPECIMENS` が実体で持ち、同じ述語を通る（タスク 115.266）。
 * 綴りに合わず緑のままだった形（最上位の再代入・クラスの静的メソッド・分割代入の束縛・文としての
 * 名前付き即時実行）の実測は台帳の注釈に挙げる。関数の外——モジュール最上位——は
 * 範囲に含まない。下の「捕らえない範囲」を見よ。
 *
 * - `main` を除く全関数を `watched: 'whole-body'` で見る。**本体の空でない全行**を
 *   許可形と突き合わせるため、逃がしを差し込める行が残らない
 *   （spec 名を文字列リテラルで比較する行も、その時点で想定外の操作として落ちる）
 * - `main` だけは `result` に触れる文に限って見る。報告の日本語の長文を全行固定すると
 *   文言の改訂で毎回落ちるためで、`main` の早期終了・件数の詐称は
 *   `checkReportedCountsAreExact` が終了コードと報告件数で捕らえる
 *   （`result.findings` への破壊的操作・再代入もここで落ちる）
 * - 絞り込みに使える操作（`filter` / `slice` / `splice` / `find` / `some` / `every` /
 *   `includes` / `Set` / `Map` / `continue` / `delete`）が `run` / `scanDocument` /
 *   `isProductionReference` / `isThousandsSeparated` / `rejectsTestReference` の
 *   本体に現れないこと（他は正当な `continue` / `filter` / `Set` を持つため、
 *   この一律禁止ではなく上の全行の突き合わせで見る）
 * - 見張る本体が 0 件なら失敗にする（空の母集団を合格にしない。第3原則）
 * - 許容リストの読み込み口になる JSON 読み出しが本体に無いこと
 * - 走査から返却までを実際に通し、`run` の件数が `scanDocument` の総和と一致すること
 * - **本体をサブプロセスとして起動し、報告される「合計 N 件 / M ファイル（走査 K ファイル）」が
 *   期待値と一致すること**。書き方に依存しない挙動の検査であり、走査対象の間引き・
 *   `findings` の間引き・終了コードの詐称のいずれも件数のずれとして現れる。
 *   仮の spec ディレクトリには**実在する spec と同じ名前**（`site-survey` /
 *   `quantity-table-generation` など）を使い、名指しの除外がここで赤くなるようにする。
 * - **捕らえない範囲（本タスクの境界の外）**: 見張るのは関数の中であって、モジュール
 *   最上位での**再代入**は見ていない。`const invokedPath =` の直前へ
 *   `const __origScanLine = scanLine;` と、`画像削除` を含む行だけ空配列を返してから
 *   `__origScanLine` へ委ねる `scanLine = function (lineText) {...};` を足すと、
 *   `scanLine` は実際に検出を落とす——同じ一行に対し包む前は 1 件、包んだ後は 0 件、
 *   対照の行は前後とも 1 件——にもかかわらず、自己検査は 103/103 緑のままである
 *   （2026-09-01 に総数 71 件で実測し、総数が 103 件になった 2026-09-04 に再実測した。
 *   いずれも緑）。`_Boundary: 絞り込みの検査が監視する関数の範囲_` の外であるため
 *   本タスクでは塞がず、後続として起票する。最上位で捕らえない形はこの再代入だけではない。
 *   クラスの静的メソッド・分割代入の束縛・文としての名前付き即時実行も同じ位置へ足して
 *   自己検査 103/103 緑（兄弟 87/87 緑）であった（2026-09-01 に総数 71 件／兄弟 56 件で
 *   実測し、2026-09-04 に再実測）。**これらの形は `FUNCTION_FORM_SPECIMENS` が
 *   `verdict: 'residual'` として実体で持つ**ため、散文の数え上げではなく述語で固定されている
 *   （網羅の主張ではない）
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readWatchedSources();

  const NARROWING =
    /\.filter\(|\.slice\(|\.splice\(|\.find\(|\.some\(|\.every\(|\.includes\(|new Set|new Map|\bcontinue\b|\bdelete\b/;

  interface BodyRule {
    /** 関数名（台帳 EXECUTABLE_FUNCTION_INVENTORY と同じ綴りにすること） */
    label: string;
    /** 本体を取り出す宣言 */
    declaration: string;
    /**
     * 本体のどの文を見るか。
     * - `'whole-body'`: 空でない全行を `allowed` と突き合わせる（逃がしの差し込み口を残さない）
     * - 正規表現: その識別子に触れる文だけを見る。`main` にだけ許す（理由は台帳に書いた）
     */
    watched: 'whole-body' | RegExp;
    /** 許す文の形 */
    allowed: RegExp[];
    /** 本体全体に対する一律禁止（正当な `continue` / `filter` を持つ関数には課さない） */
    forbidAllNarrowing: boolean;
  }

  const bodies: BodyRule[] = [
    {
      label: 'collectDesignDocuments',
      declaration: 'export function collectDesignDocuments(',
      watched: 'whole-body',
      allowed: [
        /^const absoluteSpecDir = path\.join\(root, specDir\);$/,
        /^let entries: fs\.Dirent\[\];$/,
        /^try \{$/,
        /^entries = fs\.readdirSync\(absoluteSpecDir, \{ withFileTypes: true \}\);$/,
        /^\} catch \{$/,
        /^return \[\];$/,
        /^\}$/,
        /^const documents: string\[\] = \[\];$/,
        /^for \(const entry of entries\) \{$/,
        /^if \(!entry\.isDirectory\(\)\) continue;$/,
        /^const candidate = path\.join\(absoluteSpecDir, entry\.name, DESIGN_DOC_NAME\);$/,
        /^if \(!fs\.existsSync\(candidate\)\) continue;$/,
        /^documents\.push\(path\.relative\(root, candidate\)\.split\(path\.sep\)\.join\('\/'\)\);$/,
        /^return documents\.sort\(\);$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'isProductionReference',
      declaration: 'export function isProductionReference(',
      watched: 'whole-body',
      allowed: [/^return !TEST_REFERENCE\.test\(referencePath\);$/, /^\}$/],
      forbidAllNarrowing: true,
    },
    {
      label: 'mentionsProductionSource',
      declaration: 'export function mentionsProductionSource(',
      watched: 'whole-body',
      allowed: [
        /^const pattern = new RegExp\(String\.raw`\(\?:\$\{QUALIFIED_PATH\}\|\$\{BARE_FILENAME\}\)`, 'g'\);$/,
        /^let match: RegExpExecArray \| null;$/,
        /^while \(\(match = pattern\.exec\(lineText\)\) !== null\) \{$/,
        /^if \(isProductionReference\(match\[0\]\)\) return true;$/,
        /^\}$/,
        /^return false;$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'isFileLengthDescription',
      declaration: 'function isFileLengthDescription(',
      watched: 'whole-body',
      allowed: [
        /^return lineText\.slice\(index \+ matched\.length\)\.startsWith\('のファイル'\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'isThousandsSeparated',
      declaration: 'function isThousandsSeparated(',
      watched: 'whole-body',
      allowed: [/^return \/\^\\d\{1,3\}\(\?:,\\d\{3\}\)\+\$\/\.test\(matched\);$/, /^\}$/],
      forbidAllNarrowing: true,
    },
    {
      label: 'isNotDelimitedLineList',
      declaration: 'function isNotDelimitedLineList(',
      watched: 'whole-body',
      allowed: [
        /^const elements = matched\.split\(\/\\s\*\[、,\/／\]\\s\*\/\);$/,
        /^if \(!elements\.some\(\(element\) => element\.trim\(\)\.length >= 3\)\) return true;$/,
        /^if \(isThousandsSeparated\(matched\)\) return true;$/,
        /^if \(REQUIREMENT_NUMBER_PREFIX\.test\(lineText\.slice\(0, index\)\)\) return true;$/,
        /^return false;$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'rejectsTestReference',
      declaration: 'function rejectsTestReference(',
      watched: 'whole-body',
      allowed: [
        /^const withoutLine = matched\.replace\(\/\\s\*\[:#\]\.\*\$\/, ''\)\.replace\(\/\\s\*\[\/／\]\\s\*`\?\\d\.\*\$\/, ''\);$/,
        /^return !isProductionReference\(withoutLine\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      // 行単位の検出の中核（タスク 115.230 で見張りへ加えた）
      label: 'scanLine',
      declaration: 'export function scanLine(',
      watched: 'whole-body',
      allowed: [
        /^const hasSourceMention = mentionsProductionSource\(lineText\);$/,
        /^const spans: Span\[\] = \[\];$/,
        /^for \(const rule of LINE_REFERENCE_RULES\) \{$/,
        /^if \(rule\.requiresSourceMention && !hasSourceMention\) continue;$/,
        /^rule\.pattern\.lastIndex = 0;$/,
        /^let match: RegExpExecArray \| null;$/,
        /^while \(\(match = rule\.pattern\.exec\(lineText\)\) !== null\) \{$/,
        /^const start = match\.index;$/,
        /^const end = start \+ match\[0\]\.length;$/,
        /^if \(end === start\) break;$/,
        /^if \(rule\.reject\?\.\(match\[0\], lineText, start\)\) continue;$/,
        /^spans\.push\(\{ start, end, text: match\[0\]\.trim\(\) \}\);$/,
        /^\}$/,
        /^const outermost = spans\.filter\($/,
        /^\(span\) =>$/,
        /^!spans\.some\($/,
        /^\(other\) =>$/,
        /^other !== span &&$/,
        /^other\.start <= span\.start &&$/,
        /^other\.end >= span\.end &&$/,
        /^other\.end - other\.start > span\.end - span\.start$/,
        /^\)$/,
        /^\);$/,
        /^const seen = new Set<string>\(\);$/,
        /^const references: string\[\] = \[\];$/,
        /^for \(const span of outermost\.sort\(\(a, b\) => a\.start - b\.start\)\) \{$/,
        /^const key = `\$\{span\.start\}:\$\{span\.text\}`;$/,
        /^if \(seen\.has\(key\)\) continue;$/,
        /^seen\.add\(key\);$/,
        /^references\.push\(span\.text\);$/,
        /^return references;$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'splitTableRow',
      declaration: 'export function splitTableRow(',
      watched: 'whole-body',
      allowed: [
        /^const trimmed = lineText\.trim\(\);$/,
        /^if \(!trimmed\.startsWith\('\|'\)\) return \[\];$/,
        /^return trimmed$/,
        /^\.replace\(\/\^\\\|\/, ''\)$/,
        /^\.replace\(\/\\\|\$\/, ''\)$/,
        /^\.split\('\|'\)$/,
        /^\.map\(\(cell\) => cell\.trim\(\)\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'isTableSeparatorRow',
      declaration: 'function isTableSeparatorRow(',
      watched: 'whole-body',
      allowed: [
        /^const cells = splitTableRow\(lineText\);$/,
        /^return cells\.length > 0 && cells\.every\(\(cell\) => \/\^:\?-\{2,\}:\?\$\/\.test\(cell\)\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'findLineColumnIndex',
      declaration: 'export function findLineColumnIndex(',
      watched: 'whole-body',
      allowed: [
        /^return headerCells\.findIndex\(\(cell\) => \{$/,
        /^const normalized = cell\.replace\(\/\[`\*\]\/g, ''\)\.trim\(\);$/,
        /^return normalized === '行' \|\| normalized === '行番号';$/,
        /^\}\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      // 表の `行` 列を拾う側の検出の中核（タスク 115.230 で見張りへ加えた）
      label: 'scanTableLineColumns',
      declaration: 'export function scanTableLineColumns(',
      watched: 'whole-body',
      allowed: [
        /^relativePath: string,$/,
        /^lines: string\[\],$/,
        /^alreadyFound: ReadonlyArray<CodeRefFinding> = \[\]$/,
        /^\): CodeRefFinding\[\] \{$/,
        /^const seen = new Set\(alreadyFound\.map\(\(finding\) => `\$\{finding\.line\}:\$\{finding\.reference\}`\)\);$/,
        /^const findings: CodeRefFinding\[\] = \[\];$/,
        /^for \(let index = 0; index \+ 1 < lines\.length; index\+\+\) \{$/,
        /^const headerLine = lines\[index\];$/,
        /^const separatorLine = lines\[index \+ 1\];$/,
        /^if \(headerLine === undefined \|\| separatorLine === undefined\) continue;$/,
        /^const headerCells = splitTableRow\(headerLine\);$/,
        /^if \(headerCells\.length < 2\) continue;$/,
        /^if \(!isTableSeparatorRow\(separatorLine\)\) continue;$/,
        /^const columnIndex = findLineColumnIndex\(headerCells\);$/,
        /^if \(columnIndex < 0\) continue;$/,
        /^for \(let rowIndex = index \+ 2; rowIndex < lines\.length; rowIndex\+\+\) \{$/,
        /^const rowLine = lines\[rowIndex\];$/,
        /^if \(rowLine === undefined\) break;$/,
        /^const cells = splitTableRow\(rowLine\);$/,
        /^if \(cells\.length === 0\) break;$/,
        /^const cell = cells\[columnIndex\];$/,
        /^if \(cell === undefined \|\| !\/\\d\/\.test\(cell\)\) continue;$/,
        /^if \(!mentionsProductionSource\(rowLine\)\) continue;$/,
        /^const key = `\$\{rowIndex \+ 1\}:\$\{cell\}`;$/,
        /^if \(seen\.has\(key\)\) continue;$/,
        /^seen\.add\(key\);$/,
        /^findings\.push\(\{$/,
        /^file: relativePath,$/,
        /^line: rowIndex \+ 1,$/,
        /^reference: cell,$/,
        /^snippet: rowLine\.trim\(\),$/,
        /^\}\);$/,
        /^\}$/,
        /^return findings;$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'scanDocument',
      declaration: 'export function scanDocument(',
      watched: 'whole-body',
      allowed: [
        /^const findings: CodeRefFinding\[\] = \[\];$/,
        /^const lines = source\.split\(\/\\r\?\\n\/\);$/,
        /^lines\.forEach\(\(lineText, index\) => \{$/,
        /^for \(const reference of scanLine\(lineText\)\) \{$/,
        /^findings\.push\(\{$/,
        /^file: relativePath,$/,
        /^line: index \+ 1,$/,
        /^reference,$/,
        /^snippet: lineText\.trim\(\),$/,
        /^\}\);$/,
        /^\}$/,
        /^findings\.push\(\.\.\.scanTableLineColumns\(relativePath, lines, findings\)\);$/,
        /^return findings;$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'run',
      declaration: 'export function run(',
      watched: 'whole-body',
      allowed: [
        /^const root = options\.root \?\? ROOT;$/,
        /^const specDir = options\.specDir \?\? SPEC_DIR;$/,
        /^const documents = collectDesignDocuments\(root, specDir\);$/,
        /^const findings: CodeRefFinding\[\] = \[\];$/,
        /^for \(const relativePath of documents\) \{$/,
        /^const source = fs\.readFileSync\(path\.join\(root, relativePath\), 'utf-8'\);$/,
        /^findings\.push\(\.\.\.scanDocument\(relativePath, source\)\);$/,
        /^\}$/,
        /^return \{ findings, scannedFiles: documents, specDir \};$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'main',
      declaration: 'function main(): void {',
      watched: /\bresult\b|\bfindings\b|\bscannedFiles\b/,
      allowed: [
        /^const result = run\(\);$/,
        /^console\.log\(JSON\.stringify\(result, null, 2\)\);$/,
        /^if \(result\.scannedFiles\.length === 0\) \{$/,
        /^console\.error\(`[^`]*\$\{result\.specDir\}`\);$/,
        /^if \(result\.findings\.length > 0\) \{$/,
        /^for \(const finding of result\.findings\) \{$/,
        /^`[^`]*\$\{result\.findings\.length\}[^`]*\$\{result\.scannedFiles\.length\}[^`]*`$/,
        /^`[^`]*\$\{result\.scannedFiles\.length\}[^`]*\$\{result\.specDir\}[^`]*`$/,
      ],
      forbidAllNarrowing: false,
    },
  ];

  // 適用先の列挙を実装から導くため、`bodies` を組んだあとに呼ぶ（タスク 115.321）
  failures.push(
    ...checkNarrowingEnumerationMatchesRegex(
      NARROWING,
      bodies.filter((body) => body.forbidAllNarrowing).map((body) => body.label)
    )
  );

  for (const { label, declaration, watched, allowed, forbidAllNarrowing } of bodies) {
    const body = extractFunctionBody(source, declaration);
    if (body === null) {
      failures.push(`${label} の本体を取り出せなかった（宣言が変わった可能性がある）`);
      continue;
    }
    for (const rawLine of body.split('\n').slice(1)) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      if (watched !== 'whole-body' && !watched.test(line)) continue;
      if (allowed.some((pattern) => pattern.test(line))) continue;
      failures.push(`${label} が検出結果／走査対象へ想定外の操作をしている: ${line}`);
    }
    if (forbidAllNarrowing && NARROWING.test(body)) {
      const hit = NARROWING.exec(body)?.[0];
      failures.push(`${label} の本体に絞り込みに使える操作がある: ${hit}`);
    }
  }

  if (/\.json['"`]/.test(source)) {
    failures.push('本体が JSON を読んでいる。許容リストの読み込み経路になりうる');
  }

  // 走査から返却までを実際に通し、間引きが無いことを件数で確かめる
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-code-ref-narrowing-'));
  try {
    const corpus = MUST_DETECT.map((testCase) => testCase.line ?? '');
    let expected = 0;
    corpus.forEach((line, index) => {
      const featureDir = path.join(tempRoot, SPEC_DIR, `feature-${index}`);
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(path.join(featureDir, 'design.md'), `# Design\n${line}\n`);
      expected += scanDocument(`feature-${index}/design.md`, `# Design\n${line}\n`).length;
    });
    if (expected === 0) {
      failures.push('差分照合の材料が 0 件になった（MUST_DETECT が空か検出器が壊れている）');
    }
    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== corpus.length) {
      failures.push(
        `走査対象が間引かれた（${result.scannedFiles.length} / ${corpus.length} ファイル）`
      );
    }
    if (result.findings.length !== expected) {
      failures.push(
        `run の件数が scanDocument の総和と一致しない（run ${result.findings.length} 件 / 総和 ${expected} 件）`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (bodies.length === 0) {
    failures.push('見張る本体が一つも宣言されていない（空の母集団を合格にしてはならない）');
  }
  failures.push(
    ...checkMonitoredFunctionInventory(
      bodies.map(({ label, watched }) => ({
        label,
        watch: watched === 'whole-body' ? ('whole-body' as const) : ('identifiers' as const),
      }))
    )
  );
  failures.push(...checkReportedCountsAreExact());
  return failures;
}

/**
 * 本体を**サブプロセスとして起動**し、報告される件数と終了コードが期待値どおりであること。
 *
 * 構造の検査は「書き方」を見るため、想定していない書き方の間引きを見逃しうる。ここでは
 * 書き方に依らない**挙動**を見る。仮のリポジトリに、実在する spec と同じ名前の
 * ディレクトリを作り、各々に既知の件数の該当を置く。名指しの除外・`findings` の間引き・
 * 終了コードの詐称のいずれも、報告される「合計 N 件 / M ファイル（走査 K ファイル）」の
 * ずれ、または終了コードのずれとして現れる。
 */
function checkReportedCountsAreExact(): string[] {
  const failures: string[] = [];
  if (!fs.existsSync(TSX_CLI)) {
    failures.push(
      `本体を起動できない（${path.relative(ROOT, TSX_CLI)} が無い）ため報告件数を確認できない`
    );
    return failures;
  }

  // 実在する spec と同じ名前を使う。名指しの除外はここで赤くなる
  const FEATURES = [
    'site-survey',
    'quantity-table-generation',
    'estimate-creation',
    'estimate-request',
    'project-management',
    'user-authentication',
  ];
  const HIT_LINES = [
    '| `AnnotationData` | `frontend/src/types/site-survey.types.ts:620` |',
    '| `frontend/src/components/quantity-table/CalculationFields.tsx` | `fieldsGrid`（L85-95） |',
    '- NetAllocationDialog（Line 356-419）は合計金額を表示',
    '// 1. 必須マーカーを削除（line 520 付近）',
    '// 削除対象（行507-509）:',
    '- `backend/src/services/project.service.ts`（300-324行目）',
  ];
  const CLEAN_LINE = '- `frontend/src/types/site-survey.types.ts` の `AnnotationData`';

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-code-ref-report-'));
  try {
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    // 本体は走査根を共有部品から取り込むため、同じ場所へ複製しないと起動できない
    fs.copyFileSync(SHARED_ROOT_MODULE_PATH, path.join(tempScripts, SHARED_ROOT_MODULE_NAME));
    // 共有部品はさらにスペックの根を担い手から取り込む（タスク 115.269）
    fs.copyFileSync(SPEC_ROOT_MODULE_PATH, path.join(tempScripts, SPEC_ROOT_MODULE_NAME));

    let expectedFindings = 0;
    FEATURES.forEach((feature, index) => {
      const featureDir = path.join(tempRoot, SPEC_DIR, feature);
      fs.mkdirSync(featureDir, { recursive: true });
      const body = ['# Design', CLEAN_LINE, HIT_LINES[index], CLEAN_LINE].join('\n');
      fs.writeFileSync(path.join(featureDir, DESIGN_DOC_NAME), `${body}\n`);
      expectedFindings += scanDocument(`${feature}/${DESIGN_DOC_NAME}`, body).length;
    });
    if (expectedFindings !== FEATURES.length) {
      failures.push(
        `材料の作りが崩れている（1 ファイル 1 件のはずが 合計 ${expectedFindings} 件 / ${FEATURES.length} ファイル）`
      );
      return failures;
    }

    const executed = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (executed.error) {
      failures.push(`本体の起動に失敗した: ${executed.error.message}`);
      return failures;
    }
    if (executed.status !== 1) {
      failures.push(
        `該当がある状態で終了コードが 1 にならなかった（status=${executed.status}）。` +
          `標準出力: ${(executed.stdout ?? '').trim()}`
      );
    }
    const stderr = executed.stderr ?? '';
    const expectedSummary = `合計 ${expectedFindings} 件 / ${FEATURES.length} ファイル（走査 ${FEATURES.length} ファイル）`;
    if (!stderr.includes(expectedSummary)) {
      const actual = /合計 .*ファイル）/.exec(stderr)?.[0] ?? '（要約行が無い）';
      failures.push(
        `報告される件数が期待と違う。期待「${expectedSummary}」／実際「${actual}」。` +
          '走査対象の間引き・findings の間引き・報告の詐称のいずれかが入っている'
      );
    }
    for (const feature of FEATURES) {
      if (!stderr.includes(`${SPEC_DIR}/${feature}/${DESIGN_DOC_NAME}`)) {
        failures.push(`報告に ${feature} の該当が現れない（名指しで除外されている疑い）`);
      }
    }

    // 該当が無い材料では合格し、走査件数を正しく告げること（常時失敗の裏返しを塞ぐ）
    for (const feature of FEATURES) {
      fs.writeFileSync(
        path.join(tempRoot, SPEC_DIR, feature, DESIGN_DOC_NAME),
        `# Design\n${CLEAN_LINE}\n`
      );
    }
    const clean = spawnSync(process.execPath, [TSX_CLI, path.join(tempScripts, ENTRY_NAME)], {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    if (clean.status !== 0) {
      failures.push(
        `該当が無い材料で終了コードが 0 にならなかった（status=${clean.status}）。` +
          `標準エラー: ${(clean.stderr ?? '').trim()}`
      );
    }
    if (!(clean.stdout ?? '').includes(`走査 ${FEATURES.length} ファイル`)) {
      failures.push(`該当が無い材料で走査件数 ${FEATURES.length} を告げていない`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 走査から報告までの一連が実際に働くこと。
 * scanLine 単体が正しくても、列挙・読み込み・集計のどこかが壊れていれば
 * 本検査は「0 件」で自明に合格してしまう。仮の spec ディレクトリを作り、
 * 既知の該当を置いたときに findings が立つことを固定する。
 */
function checkEndToEndDetection(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-code-ref-e2e-'));
  try {
    const featureDir = path.join(tempRoot, SPEC_DIR, 'sample-feature');
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(featureDir, 'design.md'),
      [
        '# Design',
        '| `AnnotationData` | `frontend/src/types/site-survey.types.ts:620` |',
        '正しい形: `frontend/src/types/site-survey.types.ts` の `AnnotationData`',
        '境界外: `e2e/specs/foo.spec.ts:635`',
      ].join('\n')
    );
    const result = run({ root: tempRoot });
    if (result.scannedFiles.length !== 1) {
      failures.push(`仮の design.md を1件列挙できていない（${result.scannedFiles.length} 件）`);
    }
    if (result.findings.length !== 1) {
      failures.push(
        `既知の該当1件を検出できていない（検出 ${result.findings.length} 件: ${result.findings
          .map((finding) => finding.reference)
          .join(' / ')}）`
      );
    }
    if (result.findings[0]?.line !== 2) {
      failures.push(`検出行が該当行（2 行目）と一致しない: ${result.findings[0]?.line}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * リポジトリ本体の設計文書を**一件も落とさずに**列挙できること。
 *
 * 「一件でも列挙できていれば良い」では、`collectDesignDocuments` に spec 名の除外を
 * 差し込む間引きを見逃す。ここでは本検査の側で `.kiro/specs` を**独立に走査**し、
 * `design.md` を持つディレクトリの集合が `collectDesignDocuments` の戻りと
 * **完全一致**することを求める。あわせて、spec ディレクトリごと消して件数を減らす形を
 * 塞ぐため、現に存在する 13 件を下限として固定する。
 */
function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];

  /** 本検査が自前で数える走査対象。実装の列挙とは別経路で作る */
  const expected = fs
    .readdirSync(path.join(ROOT, SPEC_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${SPEC_DIR}/${entry.name}/${DESIGN_DOC_NAME}`)
    .filter((relative) => fs.existsSync(path.join(ROOT, relative)))
    .sort();

  const documents = collectDesignDocuments(ROOT, SPEC_DIR);
  if (documents.length === 0) {
    failures.push('リポジトリ本体の design.md が一件も列挙できていない');
  }
  if (!documents.includes('.kiro/specs/site-survey/design.md')) {
    failures.push('走査対象に .kiro/specs/site-survey/design.md が含まれていない');
  }
  for (const document of documents) {
    if (!document.endsWith(`/${DESIGN_DOC_NAME}`)) {
      failures.push(`design.md 以外が列挙されている: ${document}`);
    }
  }

  // 独立に数えた集合との完全一致（名指しの除外・件数の切り詰めはここで落ちる）
  for (const document of expected) {
    if (!documents.includes(document)) {
      failures.push(`走査対象から落ちている design.md がある: ${document}`);
    }
  }
  for (const document of documents) {
    if (!expected.includes(document)) {
      failures.push(`実在しない走査対象が混ざっている: ${document}`);
    }
  }

  // 走査件数の下限。spec ディレクトリごと消して件数を減らす形を塞ぐ。
  // **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。是正前は
  // 「spec の追加で増えることはあっても減ることはない」という一方向の宣言だったが、
  // その形は宣言が実測を下回った幅ぶんの無言の目減りを吸収する。spec が増えたときは
  // 本定数を同じ差分で上げること（同じ値を `scripts/design-measurements.json` の
  // `design-documents-scanned` も宣言しており、そちらも同時に赤くなる）。
  const MINIMUM_DESIGN_DOCUMENTS = 13;
  if (documents.length < MINIMUM_DESIGN_DOCUMENTS) {
    failures.push(
      `走査対象が ${MINIMUM_DESIGN_DOCUMENTS} 件を下回っている（${documents.length} 件）。` +
        'spec を消したのなら MINIMUM_DESIGN_DOCUMENTS も同じ差分で下げること'
    );
  }
  if (documents.length > MINIMUM_DESIGN_DOCUMENTS) {
    failures.push(
      `走査対象が ${documents.length} 件で、宣言の下限 ${MINIMUM_DESIGN_DOCUMENTS} 件を上回っている` +
        `（遊び ${documents.length - MINIMUM_DESIGN_DOCUMENTS} 件）。下限は現況ちょうどに保ってください——` +
        `遊びを持つ下限は、その幅ぶんの無言の目減りを吸収します。` +
        `MINIMUM_DESIGN_DOCUMENTS を ${documents.length} 件へ上げてください。`
    );
  }
  return failures;
}

/**
 * 走査根の複製が戻っていないこと（共有部品が唯一の担い手であること。タスク 115.231）。
 *
 * 三つの検査——本検査の本体・scripts/check-design-reference-format.ts・
 * scripts/check-design-path-references.ts——は同じ設計文書の集合を母集団に取る。
 * コミット `d1b51c6` では `SPEC_DIR` / `DESIGN_DOC_NAME` / `collectDesignDocuments` が
 * 本体と scripts/check-design-path-references.ts の二箇所に定義され、
 * scripts/check-design-reference-format.ts がそのうち一方を借りていた。
 *
 * 借用は取り込みの解決に依存するため、相手の移動・改名は型検査に現れる——共有部品
 * scripts/design-document.ts を design-document.moved.ts へ改名する変異を当てると
 * `npm run type-check` が 6 ファイルで `error TS2307: Cannot find module
 * './design-document.js'` を出した（2026-09-01 に実測）。**複製にはこの当たりが無い。**
 * `d1b51c6` の二つの複製は列挙が返す文字列の作り方 1 行で食い違っていたが、その状態で
 * `check:design-code-refs` / `check:design-refs` / `check:design-path-refs` の三つとも
 * 終了コード 0 であった（`d1b51c6` を取り出した作業ツリーで 2026-09-01 に実測。差の中身と
 * 到達不能性は共有部品 scripts/design-document.ts の冒頭に記す）。
 *
 * ここでは (a) 断片が共有部品の**実行される部分**に実在すること（対照が空振りしていないこと）、
 * (b) 三つの消費側が共有部品を静的に取り込んでいること、(c) 消費側のソースに断片が
 * 現れないこと、の三つを見る。母集団（断片・消費側）が空なら失敗にする（第3原則）。
 *
 * この対照が捕らえるのは**`stripComments` を通した後のソースに断片がそのまま現れる複製**
 * である。{@link stripComments} は文字列・テンプレート・正規表現のリテラルを跨がないため、
 * リテラルの中へ `//` や `/*` を置いて後続を照合から隠す形は捕らえる（タスク 115.268）。
 * 残る天井は断片方式そのものの限界——取り込んだ定数で列挙を書き直す形と、断片を逐語で
 * 持たずに組み立てる形——の二つであり、{@link SCAN_ROOT_FRAGMENTS} の注釈に実測とともに
 * 記す。照合器の当たりと天井は {@link SCAN_ROOT_MATCHER_SPECIMENS} が合成素材で固定する。
 *
 * **「本体の走査対象と共有部品の列挙が一致すること」はここに置かない。** 一元化した後の
 * `run` は `collectDesignDocuments` の戻りを逐語で `scannedFiles` へ載せるため、その突き合わせは
 * 両辺が同じ値になり**原理的に落ちない**。実際、共有部品へ `if (entry.name === 'site-survey')
 * continue;` を差し込む変異を当てても、その節を持つ版のこの対照は緑のままであった
 * （同じ変異で自己検査は 103 件中 2 件が落ちる。落としたのは {@link checkNoFindingsNarrowing} の
 * 全行の突き合わせと {@link checkRealRepositoryIsScanned} の独立列挙との完全一致である。
 * 2026-09-01 に総数 72 件で実測し、総数が 103 件になった 2026-09-04 に再実測した）。走査対象が実データで正しいことは、`.kiro/specs` を自前で
 * 読み直す {@link checkRealRepositoryIsScanned} が所管する（タスク 115.229 の教訓:
 * 一元化のあと、一致を見張っていた対照が恒真になっていないか確かめること）。
 */
/**
 * スペックの根（`.kiro/specs`）の同値リテラルが `scripts/` に一つしか無いこと（タスク 115.269）。
 *
 * **判断の結論を機械で支える確認である。** 要件定義書の根と設計文書の走査根は、一つの機能の
 * スペックが両文書を同じディレクトリに置く以上、同じ一つの値である。二つの検査が
 * その前提で両文書を突き合わせている——scripts/check-traceability-coverage.ts と
 * scripts/check-design-component-requirements.ts は、いずれも
 * `discoverFeatureNames`（要件定義書の実在で機能を数える）が返した機能名を、そのまま
 * 設計文書側の根の下のパス片として使う。**両者が別名で並んでいる限り、片方だけが動いても
 * もう片方は静かに残る**（実測は {@link SPEC_ROOT_MODULE_NAME} の注釈に記す）。
 *
 * ここでは (a) 担い手 {@link SPEC_ROOT_MODULE_NAME} が根の断片を**実行される部分**に持つこと、
 * (b) `scripts/` 直下の自己検査でない `.ts` のうち、担い手以外は根の断片を持たないこと、
 * (c) 二つの文書モジュールが担い手から根を取り込んでいること、の三つを見る。
 * 走査母集団が空なら失敗にする（AI運用7原則 第3原則）。
 *
 * **走査の範囲を宣言する。** (b) が読むのは `ls scripts/*.ts | grep -v '\.selftest\.ts$'` の
 * 全件であり、`.cjs` / `.mjs` / `.sh` と自己検査（`*.selftest.ts`）は範囲外である。自己検査は
 * 照合の素材や合成の木の組み立てとして同じ綴りを正当に持つため、ここで禁じると
 * 対照そのものが書けなくなる。**この除外は保証の穴であり、隠さずここに置く。**
 * 併せて {@link SCAN_ROOT_FRAGMENTS} の注釈が挙げる二つの天井——取り込んだ定数で書き直す形と
 * 逐語で持たずに組み立てる形——は本確認にもそのまま掛かる（照合は同じ断片方式である）。
 * 後者を実測した: scripts/check-requirement-coverage.ts の `if (!fs.existsSync(SPEC_DIR)) {` の
 * 直前へ `const D_SPEC = '.kiro' + '/specs';` の一行を足す変異を当てても、本自己検査は
 * 104/104 緑（終了コード 0）のままであった。対して同じ位置へ裸の
 * `const LOCAL_SPECS_DIR = '.kiro/specs';` を足す変異では 104 件中 1 件が落ち、
 * `スペックの根の同値リテラル '.kiro/specs' を spec-directory.ts 以外が持っている:
 * check-requirement-coverage.ts` と名指しされる（いずれもコミット `97302295` に
 * タスク 115.269 の未コミット差分を当てた作業ツリーで、2026-09-04 にリポジトリルートで実測。
 * 変異は退避した控えからの書き戻しで復元し、復元後は 104/104 緑に戻ることを確かめた）。
 */
function checkSpecRootHasSingleOwner(): string[] {
  const failures: string[] = [];

  if (!fs.existsSync(SPEC_ROOT_MODULE_PATH)) {
    return [`スペックの根の担い手 ${SPEC_ROOT_MODULE_NAME} が無い（根の唯一の定義が失われている）`];
  }

  const swept = fs
    .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.selftest.ts'))
    .sort();

  // 母集団が空なら以下の走査は空回りで緑になる（第3原則）
  if (swept.length === 0) {
    failures.push('scripts/ に走査対象の .ts が 0 件（この確認は何も主張していません）');
  }
  if (SPEC_ROOT_DOCUMENT_MODULES.length === 0) {
    failures.push('根を担い手から取るべき文書モジュールが 0 件（対照の母集団が空）');
  }
  if (failures.length > 0) return failures;

  const owner = stripComments(fs.readFileSync(SPEC_ROOT_MODULE_PATH, 'utf-8'));
  if (!owner.includes(SPEC_ROOT_FRAGMENT)) {
    failures.push(
      `${SPEC_ROOT_MODULE_NAME} にスペックの根が見当たらない（対照が空振りしている）: ${SPEC_ROOT_FRAGMENT}`
    );
  }

  const holders = swept.filter((name) => {
    if (name === SPEC_ROOT_MODULE_NAME) return false;
    const source = stripComments(fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8'));
    return source.includes(SPEC_ROOT_FRAGMENT);
  });
  if (holders.length > 0) {
    failures.push(
      `スペックの根の同値リテラル ${SPEC_ROOT_FRAGMENT} を ${SPEC_ROOT_MODULE_NAME} 以外が持っている: ` +
        `${holders.join(' / ')}（根は一箇所にだけ置き、他は取り込むこと）`
    );
  }

  const importsOwner = /from '\.\/spec-directory(?:\.js)?'/;
  for (const basename of SPEC_ROOT_DOCUMENT_MODULES) {
    const modulePath = path.join(SCRIPTS_DIR, basename);
    if (!fs.existsSync(modulePath)) {
      failures.push(`${basename} が無い（改名・撤去で対照が空振りしている）`);
      continue;
    }
    const source = stripComments(fs.readFileSync(modulePath, 'utf-8'));
    if (!importsOwner.test(source)) {
      failures.push(`${basename} が ${SPEC_ROOT_MODULE_NAME} から根を取り込んでいない`);
    }
  }

  return failures;
}

/**
 * スペックの根と設計文書の走査根の双方について、担い手が唯一であることを見る。
 *
 * 前者は {@link checkSpecRootHasSingleOwner}（タスク 115.269）、
 * 後者は {@link checkScanRootIsNotDuplicated}（タスク 115.231）が所管する。
 */
function checkScanRootOwnership(): string[] {
  return [...checkSpecRootHasSingleOwner(), ...checkScanRootIsNotDuplicated()];
}

function checkScanRootIsNotDuplicated(): string[] {
  const failures: string[] = [];

  // 母集団が空なら以下の走査は空回りで緑になる（第3原則）
  if (SCAN_ROOT_FRAGMENTS.length === 0) {
    failures.push('走査根の断片が 0 件（対照の母集団が空）');
  }
  if (SCAN_ROOT_CONSUMERS.length === 0) {
    failures.push('走査根の消費側が 0 件（対照の母集団が空）');
  }
  if (failures.length > 0) return failures;

  if (!fs.existsSync(SHARED_ROOT_MODULE_PATH)) {
    return [`共有部品 ${SHARED_ROOT_MODULE_NAME} が無い（走査根の担い手が失われている）`];
  }
  // 断片が担い手から消えていれば、以下の「消費側に無い」は自明に成り立ってしまう。
  // 担い手は断片ごとに引く（スペックの根だけは spec-directory.ts が持つ。タスク 115.269）
  const sourceOfOwner = new Map<string, string>();
  const missing: string[] = [];
  for (const fragment of SCAN_ROOT_FRAGMENTS) {
    const ownerName = SCAN_ROOT_FRAGMENT_OWNERS[fragment] ?? SHARED_ROOT_MODULE_NAME;
    let ownerSource = sourceOfOwner.get(ownerName);
    if (ownerSource === undefined) {
      const ownerPath = path.join(SCRIPTS_DIR, ownerName);
      if (!fs.existsSync(ownerPath)) {
        return [`担い手 ${ownerName} が無い（走査根の担い手が失われている）`];
      }
      ownerSource = stripComments(fs.readFileSync(ownerPath, 'utf-8'));
      sourceOfOwner.set(ownerName, ownerSource);
    }
    if (!ownerSource.includes(fragment)) {
      missing.push(`${fragment}（担い手 ${ownerName}）`);
    }
  }
  if (missing.length > 0) {
    return [`走査根が担い手に見当たらない（対照が空振りしている）: ${missing.join(' / ')}`];
  }

  const importSpecifier = `from './${SHARED_ROOT_MODULE_NAME.replace(/\.ts$/, '.js')}'`;
  for (const basename of SCAN_ROOT_CONSUMERS) {
    const consumerPath = path.join(SCRIPTS_DIR, basename);
    if (!fs.existsSync(consumerPath)) {
      failures.push(`消費側 ${basename} が無い（改名・撤去で対照が空振りしている）`);
      continue;
    }
    const source = stripComments(fs.readFileSync(consumerPath, 'utf-8'));
    if (!source.includes(importSpecifier)) {
      failures.push(`${basename} が ${SHARED_ROOT_MODULE_NAME} を取り込んでいない`);
    }
    const copied = findCopiedScanRootFragments(fs.readFileSync(consumerPath, 'utf-8'));
    if (copied.length > 0) {
      failures.push(`${basename} に走査根の複製が戻っている: ${copied.join(' / ')}`);
    }
  }

  return failures;
}

/**
 * 消費側のソースに現れる走査根の断片（複製検知の照合器の本体）。
 *
 * 実ファイルも合成素材も**この同じ述語**を通す。対照群 {@link SCAN_ROOT_MATCHER_SPECIMENS}
 * が合成素材の側から照合器の当たりと天井を固定する（対象の同一性。タスク 115.266 の作法）。
 */
function findCopiedScanRootFragments(source: string): string[] {
  const stripped = stripComments(source);
  return SCAN_ROOT_FRAGMENTS.filter((fragment) => stripped.includes(fragment));
}

/**
 * 複製検知の照合器の対照群の一件（タスク 115.268）。
 *
 * `verdict` の語彙は兄弟の {@link FUNCTION_FORM_SPECIMENS} に揃える。**取りこぼし（天井）と
 * 正しい不検出を一つの真偽値へ潰さない。** 潰すと「拾わない要素はすべて塞げていない形の
 * 記録である」という誤った全称が生まれ、後任が正しい不検出まで「塞ぐべき天井」と読む。
 */
interface ScanRootMatcherSpecimen {
  /** 何を確かめる素材か。後任が同じ形を再現できる粒度で書く */
  readonly label: string;
  /** 消費側のソースに見立てた合成素材 */
  readonly source: string;
  /**
   * 照合器がこの素材をどう扱わなければならないか。
   *
   * - `'must-catch'`: 断片を取り出せなければならない
   * - `'correct-miss'`: 取り出してはならない（**正しい不検出**。恒久的にこの分類であり、
   *   塞ぐ対象ではない。理由は下の対照群の注釈に実測付きで置く）
   * - `'ceiling'`: 断片方式そのものの限界で取り出せない（**取りこぼし**。塞げたときは
   *   赤くなり、{@link SCAN_ROOT_FRAGMENTS} の列挙の更新が強制される）
   */
  readonly verdict: 'must-catch' | 'correct-miss' | 'ceiling';
  /** 注釈の開始記号を文字列・テンプレート・正規表現のリテラルの中に含む素材か */
  readonly crossesLiteral: boolean;
}

/**
 * **リテラルを跨がない走査でなければ当たらないと実測された素材**（対照群が痩せるのを防ぐ）。
 *
 * この確認は「照合器が文字列・正規表現リテラルを跨がない」ことを名乗る。名乗りを裏づける
 * のはここに挙げた形だけであり、これらが群から消えると**主張を証明する素材を失ったまま
 * 緑になる**。{@link checkScanRootMatcherLiteralAwareness} がラベルの実在と分類を固定する
 * （兄弟の {@link UNBLOCKABLE_FORM_NAMES} と同じ作法）。
 */
const LITERAL_CROSSING_SPECIMEN_LABELS: readonly string[] = [
  '同じ行の手前に `//` を含む文字列リテラルが在る',
  '同じ行に `/*` と `*/` を含む文字列リテラルが在る',
  '同じ行の手前のテンプレートリテラルが `//` を含む',
  '同じ行の手前の正規表現リテラルが `//` を含む',
];

/**
 * 複製検知の照合器の対照群（タスク 115.268）。実ファイルと同じ述語
 * {@link findCopiedScanRootFragments} を通す。
 *
 * **`correct-miss` の二件は恒久的な正しい不検出であり、塞いではならない。** 本物の注釈の中の
 * 断片まで拾う向きへ改めると、{@link SCAN_ROOT_FRAGMENTS} の冒頭が記す前提——共有部品の冒頭
 * 注釈が `'.kiro/specs'` を逐語で引いているため、注釈を残したまま照合すると空振り検知が
 * 注釈だけで満たされる——が壊れる。実測（2026-09-04、コミット `c6ef2779` の作業ツリー。
 * 変異は退避した控えからの書き戻しで復元し、復元後は緑に戻ることを確かめた）:
 *
 *   - {@link findCopiedScanRootFragments} の `const stripped = stripComments(source);` を
 *     `const stripped = source;` へ変える変異（＝この二件を「塞ぐ」向きの改変）を当てると、
 *     自己検査 104 件中 1 件が落ちる。落ちるのは本確認であり、
 *     `照合器が拾ってはならない素材を拾った: 本物の行注釈の中の断片は拾わない（'.kiro/specs'）`
 *     と `照合器が拾ってはならない素材を拾った: 本物の塊注釈の中の断片は拾わない
 *     （'.kiro/specs' / 'design.md'）` の二行である
 *
 * すなわちこの二件は**赤へ倒す現役の支え**であって、塞げていない形の記録ではない。
 * 塞げていない形は `verdict: 'ceiling'` の二件だけである。
 */
const SCAN_ROOT_MATCHER_SPECIMENS: readonly ScanRootMatcherSpecimen[] = [
  {
    label: '裸の断片（当たりの基準）',
    source: "const LOCAL_SPEC_DIR = '.kiro/specs';\nconst LOCAL_DOC = 'design.md';\n",
    verdict: 'must-catch',
    crossesLiteral: false,
  },
  {
    label: '同じ行の手前に `//` を含む文字列リテラルが在る',
    source:
      "const SCHEME = 'https://example.invalid'; const LOCAL_SPEC_DIR = '.kiro/specs'; const LOCAL_DOC = 'design.md';\n",
    verdict: 'must-catch',
    crossesLiteral: true,
  },
  {
    label: '同じ行に `/*` と `*/` を含む文字列リテラルが在る',
    source: "const OPENER = '/*'; const LOCAL_SPEC_DIR = '.kiro/specs'; const CLOSER = '*/';\n",
    verdict: 'must-catch',
    crossesLiteral: true,
  },
  {
    label: '同じ行の手前のテンプレートリテラルが `//` を含む',
    source: "const URL = `https://example.invalid`; const LOCAL_SPEC_DIR = '.kiro/specs';\n",
    verdict: 'must-catch',
    crossesLiteral: true,
  },
  {
    label: '同じ行の手前の正規表現リテラルが `//` を含む',
    source: "const RE = /[a//b]/; const LOCAL_SPEC_DIR = '.kiro/specs';\n",
    verdict: 'must-catch',
    crossesLiteral: true,
  },
  {
    label: '本物の行注釈の中の断片は拾わない',
    source: "// const LOCAL_SPEC_DIR = '.kiro/specs';\nconst other = 1;\n",
    verdict: 'correct-miss',
    crossesLiteral: false,
  },
  {
    label: '本物の塊注釈の中の断片は拾わない',
    source: "/* '.kiro/specs' と 'design.md' の説明 */\nconst other = 1;\n",
    verdict: 'correct-miss',
    crossesLiteral: false,
  },
  {
    label: '天井: 文字列連結で組み立てる複製は拾えない',
    source: "const D_SPEC = '.kiro' + '/specs';\nconst D_DOC = 'design' + '.md';\n",
    verdict: 'ceiling',
    crossesLiteral: false,
  },
  {
    label: '天井: 取り込んだ定数で列挙を書き直す複製は拾えない',
    source:
      'const dupDocs = (root: string) =>\n' +
      '  fs.readdirSync(path.join(root, SPEC_DIR)).map((n) => path.join(SPEC_DIR, n, DESIGN_DOC_NAME));\n',
    verdict: 'ceiling',
    crossesLiteral: false,
  },
];

/**
 * 複製検知の照合器が文字列・正規表現リテラルを跨がないこと、および天井の在り処
 * （タスク 115.268）。
 *
 * {@link SCAN_ROOT_FRAGMENTS} の注釈が挙げる天井の列挙を、散文ではなく実体で持つ。
 * 素材が空・分類のいずれかが欠けるときは合格にしない（AI運用7原則 第3原則）。
 *
 * **この確認は自らの名前を支える母集団を要求する。** 分類ごとの件数 0 を個別に失敗させるのは
 * 兄弟の {@link checkFunctionFormSpecimenComposition} と同じ作法である。件数の下限
 * {@link MINIMUM_TOTAL_CASES} は確認の数しか見ないため、素材だけを削る痩せ方は差分にしか
 * 現れず、下限では止まらない。
 *
 * 実測（2026-09-04、コミット `c6ef2779` の作業ツリー。変異はいずれも退避した控えからの
 * 書き戻しで復元し、復元後は緑に戻ることを確かめた）:
 *
 *   - {@link SCAN_ROOT_MATCHER_SPECIMENS} からリテラル跨ぎの 4 件と `correct-miss` の 2 件と
 *     `ceiling` の 1 件を削り、`裸の断片` と `天井: 文字列連結` の 2 件だけへ痩せさせる変異を
 *     当てると、本確認は 104 件中 1 件として落ちる。挙がるのは
 *     `照合器の合成素材に「正しい不検出」の形がありません`、
 *     `リテラルを跨ぐ「拾わなければならない」素材が 0 件です` と、消えた 4 件それぞれの
 *     `リテラル跨ぎと実測した素材が対照群から消えている: ...` である
 *   - `verdict: 'ceiling'` の 2 件だけを削る変異を当てると、本確認は 104 件中 1 件として
 *     落ちる（`照合器の合成素材に「天井」の形がありません…`）
 *   - `verdict: 'correct-miss'` の 2 件だけを削る変異を当てると、本確認は 104 件中 1 件として
 *     落ちる（`照合器の合成素材に「正しい不検出」の形がありません…`）。三つの分類の 0 件は
 *     それぞれ独立に赤くなる
 *   - **是正前の同じ痩せさせ方は緑のまま素通りしていた**——`verdict` を導入する前の版
 *     （`caught: boolean` と、空・両極性しか見ない構成関門）へ同じ 2 件への削減を当てると
 *     自己検査は 104/104 緑であり、**さらに {@link stripComments} を素朴な
 *     `source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')` へ差し戻しても
 *     104/104 緑**であった。すなわち名前が主張する穴が復活しても気付けなかった
 */
function checkScanRootMatcherLiteralAwareness(): string[] {
  const failures: string[] = [];

  // 母集団が空なら以下の走査は空回りで緑になる（第3原則）
  if (SCAN_ROOT_MATCHER_SPECIMENS.length === 0) {
    failures.push('照合器の合成素材が 0 件（この確認は何も主張していません）');
    return failures;
  }
  if (LITERAL_CROSSING_SPECIMEN_LABELS.length === 0) {
    failures.push('リテラル跨ぎと実測した素材の一覧が空です（対照群が痩せても気付けません）');
  }

  const countOf = (verdict: ScanRootMatcherSpecimen['verdict']): number =>
    SCAN_ROOT_MATCHER_SPECIMENS.filter((one) => one.verdict === verdict).length;

  // 分類ごとの 0 件をそれぞれ独立に失敗させる（心地よい部分集合へ痩せるのを防ぐ）
  if (countOf('must-catch') === 0) {
    failures.push('照合器の合成素材に「拾わなければならない」形がありません');
  }
  if (countOf('correct-miss') === 0) {
    failures.push(
      '照合器の合成素材に「正しい不検出」の形がありません' +
        '（注釈の中の断片まで拾う向きへ壊しても赤くなりません）'
    );
  }
  if (countOf('ceiling') === 0) {
    failures.push(
      '照合器の合成素材に「天井」の形がありません' +
        '（すべて捕らえているように見える群になっています。限界は隠さず実測付きで残すこと）'
    );
  }

  // 名前が主張する「リテラルを跨がない」を裏づける素材そのものの下限
  const literalCrossingMustCatch = SCAN_ROOT_MATCHER_SPECIMENS.filter(
    (one) => one.crossesLiteral && one.verdict === 'must-catch'
  );
  if (literalCrossingMustCatch.length === 0) {
    failures.push(
      'リテラルを跨ぐ「拾わなければならない」素材が 0 件です' +
        '（この確認は自らの名前を証明する素材を失っており、素朴な注釈除去へ戻しても緑になります）'
    );
  }

  // 実測でリテラル跨ぎと確かめた形は、群から消えても分類を書き換えられてもならない
  for (const label of LITERAL_CROSSING_SPECIMEN_LABELS) {
    const found = SCAN_ROOT_MATCHER_SPECIMENS.find((one) => one.label === label);
    if (found === undefined) {
      failures.push(`リテラル跨ぎと実測した素材が対照群から消えている: ${label}`);
      continue;
    }
    if (!found.crossesLiteral || found.verdict !== 'must-catch') {
      failures.push(`リテラル跨ぎと実測した素材の分類が書き換えられている: ${label}`);
    }
  }

  for (const specimen of SCAN_ROOT_MATCHER_SPECIMENS) {
    if (specimen.label.trim() === '') {
      failures.push('名前の無い素材がある（後任が再現できない）');
    }
    if (specimen.crossesLiteral && specimen.verdict !== 'must-catch') {
      failures.push(`リテラルを跨ぐ素材を「拾わなくてよい」と宣言している: ${specimen.label}`);
    }

    const copied = findCopiedScanRootFragments(specimen.source);
    if (specimen.verdict === 'must-catch' && copied.length === 0) {
      failures.push(`照合器が素材を素通りさせた: ${specimen.label}`);
    }
    if (specimen.verdict === 'correct-miss' && copied.length > 0) {
      failures.push(
        `照合器が拾ってはならない素材を拾った: ${specimen.label}（${copied.join(' / ')}）`
      );
    }
    if (specimen.verdict === 'ceiling' && copied.length > 0) {
      failures.push(
        `天井として記録した素材を拾えるようになっている（列挙を更新すること）: ` +
          `${specimen.label}（${copied.join(' / ')}）`
      );
    }
  }

  return failures;
}

/** 参照先の本番／テストの判別 */
function checkProductionReferenceClassification(): string[] {
  const failures: string[] = [];
  const production = [
    'frontend/src/types/site-survey.types.ts',
    'backend/src/services/annotation.service.ts',
    'backend/scripts/restore-plain-thumbnails.ts',
    'FreehandTool.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (production.length === 0) {
    failures.push('合成素材 production が空です（この確認が空振りしています）');
  }
  for (const reference of production) {
    if (!isProductionReference(reference)) {
      failures.push(`本番コードが誤って境界外にされた: ${reference}`);
    }
  }
  const outside = [
    'e2e/specs/site-surveys/site-survey-responsive.spec.ts',
    'frontend/src/__tests__/components/Foo.test.tsx',
    'backend/src/services/__mocks__/foo.ts',
    'frontend/src/components/Foo.spec.ts',
  ];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (outside.length === 0) {
    failures.push('合成素材 outside が空です（この確認が空振りしています）');
  }
  for (const reference of outside) {
    if (isProductionReference(reference)) {
      failures.push(`境界外の参照が本番コード扱いになった: ${reference}`);
    }
  }
  return failures;
}

/** 相対行参照の門番（本番コードの言及があるかどうか）が働いていること */
function checkSourceMentionGate(): string[] {
  const failures: string[] = [];
  if (!mentionsProductionSource('`frontend/src/api/client.ts` の再送経路')) {
    failures.push('フルパスの言及を検出できていない');
  }
  if (!mentionsProductionSource('`FreehandTool.ts` の `setOutline`')) {
    failures.push('裸のファイル名の言及を検出できていない');
  }
  if (mentionsProductionSource('`e2e/specs/foo.spec.ts` の検証')) {
    failures.push('テストコードの言及で門番が開いてしまう');
  }
  if (mentionsProductionSource('要件 37.4 の受入基準を参照する')) {
    failures.push('本番コードの言及が無い行で門番が開いてしまう');
  }
  return failures;
}

/**
 * 表頭に `行` 列を持つ表の当該列を、**文書単位の走査**が捉えること。
 *
 * この形は行だけを見ても件数と区別できない（`| foo.ts | 20 | 1 |` の `20` は単独の裸数値で
 * ある）。位置の標識が数値の隣ではなく**表頭**にあるため、行単位の `scanLine` では原理的に
 * 捉えられない。ここでは 115.149 の第5回是正の直前に本書の `#### ImageViewer` 節にあった
 * 記録表そのものを注入し、(a) 行単位では捉えられないこと、(b) 文書単位では捉えること、
 * (c) `行` 列を撤去した是正後の表は捉えないこと、(d) 本番コードの言及が無い表では
 * 門番が閉じていること、の四つを確かめる。
 */
function checkLineColumnTableIsDetected(): string[] {
  const failures: string[] = [];
  const bareCellRow =
    '| `frontend/src/components/site-surveys/gestures/touchGestureManager.ts` | 20 | 1 |';

  // (a) 行単位では捉えられない（この前提が崩れたら本検査の存在理由が消える）
  if (scanLine(bareCellRow).length !== 0) {
    failures.push('前提が崩れている: 単独の裸数値は行単位では検出しないはずである');
  }

  // (b) 文書単位では捉える
  const recorded = [
    '| ファイル | 行 | 件数 |',
    '|---|---|---|',
    bareCellRow,
    '| `frontend/src/components/site-surveys/AnnotationEditor.tsx` | 2721 | 1 |',
  ].join('\n');
  const detected = scanDocument('sample/design.md', recorded)
    .map((finding) => `${finding.line}:${finding.reference}`)
    .sort();
  const expected = ['3:20', '4:2721'];
  if (detected.join(' / ') !== expected.join(' / ')) {
    failures.push(
      `表の \`行\` 列の検出が期待と違う。期待「${expected.join(' / ')}」／` +
        `実際「${detected.join(' / ') || '（無し）'}」`
    );
  }

  // (c) `行` 列を撤去した是正後の表は捉えない
  const corrected = [
    '| ファイル | 件数 |',
    '|---|---|',
    '| `frontend/src/components/site-surveys/gestures/touchGestureManager.ts` | 1 |',
  ].join('\n');
  // 素材が空（または本番コードの言及を失った）なら、以下の「検出しない」は恒真になる
  // （第3原則。115.252 の候補5。実測 2026-09-03: 本関門を置く前は `corrected` の中身を
  // 空にすると 72/72 緑・EXIT=0 であった。関門を置いた現在の形で同じ変異を当てると
  // 103 件中 1 件が落ちる——2026-09-04 に総数 103 件で再実測）
  if (!corrected.includes('touchGestureManager.ts')) {
    failures.push('是正後の表の見本が本番コードの言及を持たない（この確認が空振りしています）');
  }
  const correctedFindings = scanDocument('sample/design.md', corrected);
  if (correctedFindings.length !== 0) {
    failures.push(
      `\`行\` 列を撤去した是正後の表を検出してしまう: ${correctedFindings
        .map((finding) => finding.reference)
        .join(' / ')}`
    );
  }

  // (d) 本番コードの言及が無い行は、`行` 列があっても拾わない
  const withoutSource = ['| 章 | 行 | 件数 |', '|---|---|---|', '| 前書き | 20 | 1 |'].join('\n');
  // 素材が空（または `行` 列を失った）なら、以下の「検出しない」は恒真になる
  // （第3原則。115.252 の候補5。実測 2026-09-03: 本関門を置く前は `withoutSource` の中身を
  // 空にすると 72/72 緑・EXIT=0 であった。関門を置いた現在の形で同じ変異を当てると
  // 103 件中 1 件が落ちる——2026-09-04 に総数 103 件で再実測）
  if (!withoutSource.includes('| 章 | 行 | 件数 |')) {
    failures.push(
      '本番コードの言及が無い表の見本が `行` 列を持たない（この確認が空振りしています）'
    );
  }
  if (scanDocument('sample/design.md', withoutSource).length !== 0) {
    failures.push('本番コードの言及が無い表の `行` 列で門番が開いてしまう');
  }
  return failures;
}

/** 陽性対照そのものが空でないこと（0 件の自明な合格を塞ぐ） */
function checkPositiveControlsArePresent(): string[] {
  const failures: string[] = [];
  if (MUST_DETECT.length === 0) failures.push('MUST_DETECT が空である');
  if (MUST_NOT_DETECT.length === 0) failures.push('MUST_NOT_DETECT が空である');
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '検出結果を返す前に絞り込む経路が無い（許容リストの名前ではなく機構を見る）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: '走査から報告までが実際に働く（既知の該当を仮の spec で捕まえる）',
    expected: false,
    custom: checkEndToEndDetection,
  },
  {
    name: 'リポジトリ本体の design.md を実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: 'スペックの根と走査根の複製が戻っていない（共有部品が唯一の担い手である）',
    expected: false,
    custom: checkScanRootOwnership,
  },
  {
    name: '複製検知の照合器が文字列・正規表現リテラルを跨がない（天井を実体で固定する）',
    expected: false,
    custom: checkScanRootMatcherLiteralAwareness,
  },
  {
    name: '参照先の本番／テストの判別（本タスクの境界）',
    expected: false,
    custom: checkProductionReferenceClassification,
  },
  {
    name: '相対行参照の門番が働く',
    expected: false,
    custom: checkSourceMentionGate,
  },
  {
    name: '陽性対照が空でない',
    expected: false,
    custom: checkPositiveControlsArePresent,
  },
  {
    name: '関数の書き方の対照群の構成（捕らえる形・取りこぼし・偽陽性・正しい不検出が揃う）',
    expected: false,
    custom: checkFunctionFormSpecimenComposition,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const references = scanLine(testCase.line ?? '');
  const detected = references.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${references.join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

interface Group {
  readonly title: string;
  readonly cases: readonly Case[];
}

/**
 * 見本の極性（タスク 115.252）
 *
 * **名前の綴りからも変数名からも導かない**（115.247 の作法）。要素が持つ `expected` 属性——
 * 「検出されなければならない」か否か——がそのまま極性である。`custom` を持つ要素は機構の
 * 確認であって検出の対照ではないため、極性を持たない。
 */
function polarityOf(one: Case): 'positive' | 'negative' | undefined {
  if (one.custom !== undefined) return undefined;
  return one.expected ? 'positive' : 'negative';
}

/**
 * 陽性対照・陰性対照の件数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ。タスク 115.266 が
 * 関数の書き方の対照群を足した分だけ上げた。**下げてはならない**）。抽出は
 * `npx tsx scripts/list-control-polarity-floors.ts` が出す値をそのまま置く。
 *
 * **総数の下限だけでは片側の消失を捕まえられない。** 陽性対照を削って同じ数だけ陰性対照を
 * 足せば総数は動かないため、極性ごとに別の下限を貼る。極性は要素の宣言（`expected` ないし
 * `polarity`）から導き、**名前の綴りからは導かない**（115.247 の作法）。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_POSITIVE_CONTROLS = 36;
const MINIMUM_NEGATIVE_CONTROLS = 27;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ。タスク 115.266 が
 * 関数の書き方の対照群を足し、タスク 115.268 が複製検知の照合器の対照を 1 件足した分だけ
 * 上げた。**下げてはならない**）。**版はコミット `c6ef2779` に本タスクの未コミット差分を
 * 当てた作業ツリー**である——同コミットそのものでは 103 件であり、同じ 2026-09-04 に
 * 二つのタスクが着地して同じ値が動いたため、日付だけでは版を一つに絞れない
 * （`.kiro/steering/development-discipline.md` の「現況を名乗る値にはコミットのハッシュを
 * 添える」に従う）。抽出は
 * `npx tsx scripts/check-design-code-reference-format.selftest.ts | tail -1` の出す値をそのまま置く。
 * **確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 導けないため件数で貼る。
 *
 * **遊びを持たせない**（タスク 115.298 が 115.262 / 115.271 の作法へ揃えた）。下限を
 * **上回っても**赤くする——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収する。
 * 二方向を合わせると、対照を増やす向きも減らす向きも定数の書き換えを伴う。
 */
const MINIMUM_TOTAL_CASES = 104;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: `MUST_DETECT` / `MUST_NOT_DETECT` は既存の要素側の確認が捕まえたが、`STRUCTURAL` を空に
 * すると **64/64 緑・EXIT=0**（守り手自身が `STRUCTURAL` の中に居るため自分を守れない）。
 * `main()` の中の `groups` を空にすると **0/0 緑・EXIT=0**。
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形——本ファイルの
 * `STRUCTURAL` に載っていた `checkPositiveControlsArePresent()` がまさにそれ——は、**配列ごと空にすると関門も
 * 一緒に消える**（115.252 の候補3）。`main()` の中、確認の実行より前に、配列の外側から貼る。
 * 既存の要素側の確認は残してあるが、それは冗長な二重掛けであって関門ではない。
 *
 * **限界（塞いでいないこと）**: 総数の下限は現況ちょうどのため 1 件でも削れば赤くなるが、
 * **削った分だけ別の群へ確認を足せば総数は動かない**。群ごとの下限は「空でないこと」と
 * 「要求した極性が 1 件以上残ること」までしか課せない（件数を導く語彙が本体に無い。
 * 115.222 が陰性対照について書き残した限界と同じ形）。
 *
 * **もう一つの限界**: `main()` からこの関門の呼び出し自体を落とせば、関門は走らなくなる。
 * 呼び出しの直列性を構造で要求する形——115.242 が `check-design-path-references.selftest.ts`
 * に置いた「深さ 0・文の先頭・呼び出し直後の `;`」の三点——は、本タスクでは各ファイルへ
 * 展開していない。**塞がないことと、書かないことは別である**（115.242 の教訓）。
 */
function guardControlsArePresent(groups: readonly Group[]): void {
  const problems: string[] = [];

  if (groups.length === 0) {
    problems.push('対照群が一つも登録されていません（この自己検査は何も確かめていません）');
  }
  for (const group of groups) {
    if (group.cases.length === 0) {
      problems.push(`対照群「${group.title}」が空です（この群は何も確かめていません）`);
    }
  }

  // **極性の要求は宣言せず、無条件の規則と数で持つ（タスク 115.252。Critical #2 の一般形）。**
  // 群ごとに「必要な極性」を配列の属性で設定する形は、関門を配列リテラルで設定する形であり、
  // その配列を `[]` へ空化すれば要求ごと消える（115.252 の候補3 の自己隠蔽の変種）。
  //
  // **無条件の規則の定義域は群ではなく自己検査の全体に取る。** 実測（2026-09-03、リポジトリ
  // ルート）: 定義域を群に取って「極性を持つ要素がある群は陽性と陰性を各 1 件以上持つ」と
  // すると、`captured`/`not-captured` に分けた群は構成上どちらか一方の極性しか持たないため
  // 満たしようがなく、この形を当てた 9 ファイルのうち 7 ファイルが赤くなった。群の極性が
  // 均質であることは設計であって欠陥ではない。定義域を全体に上げれば規則は無条件のまま立つ。
  //
  // **片側が痩せる向きの変異は数で押さえる。** 数は空にできないため、配列リテラルを空化する
  // 変異作用素に対して構造的に免疫である（下限は現況ちょうど。余裕ゼロ）。
  const polarities = groups.flatMap((group) => group.cases.map((one) => polarityOf(one)));
  if (polarities.some((one) => one !== undefined)) {
    if (!polarities.includes('positive')) {
      problems.push('陽性対照が 1 件もありません（検出器が何も検出しなくても緑になります）');
    }
    if (!polarities.includes('negative')) {
      problems.push('陰性対照が 1 件もありません（検出器が何にでも反応しても緑になります）');
    }
  }
  const positives = polarities.filter((one) => one === 'positive').length;
  const negatives = polarities.filter((one) => one === 'negative').length;
  if (positives < MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件しかありません（宣言の下限は ${MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '陽性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (positives > MINIMUM_POSITIVE_CONTROLS) {
    problems.push(
      `陽性対照が ${positives} 件で、宣言した下限 ${MINIMUM_POSITIVE_CONTROLS} 件を上回ります（遊び ${positives - MINIMUM_POSITIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_POSITIVE_CONTROLS を ${positives} 件へ上げてください。`
    );
  }
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (negatives > MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件で、宣言した下限 ${MINIMUM_NEGATIVE_CONTROLS} 件を上回ります（遊び ${negatives - MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_NEGATIVE_CONTROLS を ${negatives} 件へ上げてください。`
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
    );
  }
  // 下限に遊びを持たせない（タスク 115.298）
  if (total > MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件で、宣言した下限 ${MINIMUM_TOTAL_CASES} 件を上回ります（遊び ${total - MINIMUM_TOTAL_CASES} 件）。` +
        '下限は現況ちょうどに保ってください——遊びを持つ下限は、その幅ぶんの対照の無言の削除を吸収します。' +
        `MINIMUM_TOTAL_CASES を ${total} 件へ上げてください。`
    );
  }

  // 対照の現況を一行で印字する（タスク 115.252）。関門の判定に使うのと同じ変数から出す。
  // `npx tsx scripts/list-control-polarity-floors.ts` はこの行を読み、下限を貼り直すときの
  // 元の値にする。一覧の側で数え直さないのは、判定と一覧が別々の真実を持たないためである。
  // 本自己検査群が閉じている範囲と閉じていない範囲（三層の記録）は
  // `scripts/check-counterfactual-evidence.selftest.ts` の
  // 「本自己検査群が閉じている範囲と、閉じていない範囲」の節に正典を置く（タスク 115.252）。
  console.log(
    `📋 対照の現況: 陽性対照 ${positives}/${MINIMUM_POSITIVE_CONTROLS} ・ ` +
      `陰性対照 ${negatives}/${MINIMUM_NEGATIVE_CONTROLS} ・ ` +
      `総数 ${total}/${MINIMUM_TOTAL_CASES}（現況/宣言の下限）`
  );

  if (problems.length > 0) {
    console.log(
      '\n❌ 自己検査の対照群そのものが欠けています（この状態で出る「合格」は意味を持ちません）'
    );
    for (const problem of problems) console.log(`   - ${problem}`);
    process.exit(1);
  }
}

function main(): void {
  const groups: Group[] = [
    {
      title: '捕捉しなければならない書き方（是正前の実物）',
      cases: MUST_DETECT,
    },
    {
      title: '捕捉してはならない書き方（過検出）',
      cases: MUST_NOT_DETECT,
    },
    {
      title: '関数の書き方の対照群（抽出と最上位の束縛の実測）',
      cases: FUNCTION_FORM_CONTROLS,
    },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 本番コードへの行番号参照 検出規則 自己検査 (scripts/check-design-code-reference-format.selftest.ts)'
  );
  // 対照群の配列の外側に置く関門。実行より前に、群そのものが在ることを確かめる。
  guardControlsArePresent(groups);
  let failed = 0;
  for (const group of groups) {
    console.log(`\n[${group.title}]`);
    for (const testCase of group.cases) {
      const failures = runCase(testCase);
      if (failures.length === 0) {
        console.log(`  ✅ ${testCase.name}`);
      } else {
        failed += 1;
        console.log(`  ❌ ${testCase.name}`);
        for (const failure of failures) console.log(`     - ${failure}`);
      }
    }
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (failed > 0) {
    console.log(`\n❌ ${failed}/${total} 件の確認に失敗しました`);
    process.exit(1);
  }
  console.log(`\n✅ ${total}/${total} 件の確認に成功しました`);
  // 失敗既定（module の頂）をここで解除する
  process.exitCode = 0;
}

main();
