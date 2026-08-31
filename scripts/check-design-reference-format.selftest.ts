/**
 * @fileoverview 設計文書への行番号参照 検出規則の自己検査
 *
 * scripts/check-design-reference-format.ts の検出規則が、実際に混入していた書き方を
 * すべて捕捉し（漏れ）、節の題とシンボル名で指す正しい書き方や
 * 行番号ではない数値（HTTP ステータス・要件番号・タスク番号・比率・件数）を
 * 捕捉しない（過検出）ことを、書き方そのものを注入して確認する。
 *
 * 走査対象は二つある。いずれについても陽性対照と陰性対照の双方を置く。
 *   - 本番コードの一行（`scanLine`。タスク 115.100 の境界）
 *   - 設計文書の一行（`scanDesignDocumentLine`。タスク 115.211 の境界）
 *
 * 使用方法:
 *   npx tsx scripts/check-design-reference-format.selftest.ts
 *   npm run check:design-refs:selftest
 *
 * 検出器が壊れたまま本検査が「合格」を出す状態を防ぐため、CI では本検査の前に走らせる。
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  DESIGN_DOC_NAME,
  SPEC_DIR,
  collectDesignDocuments,
  collectSourceFiles,
  isTestFile,
  run,
  scanDesignDocumentLine,
  scanLine,
  scanSource,
} from './check-design-reference-format.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-reference-format.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/** 本体が走査根の定義を借りている相手。サブプロセスの起動には同じ場所へ要る */
const SIBLING_NAME = 'check-design-code-reference-format.ts';

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

interface Case {
  /** 何を確かめるか */
  name: string;
  /** 注入する一行 */
  line?: string;
  /** 検出されなければならないか */
  expected: boolean;
  /**
   * どちらの走査対象の判定に掛けるか。
   * `production` は本番コードの一行（`scanLine`）、`design` は設計文書の一行
   * （`scanDesignDocumentLine`）。既定は `production`。
   */
  scan?: 'production' | 'design';
  /** 行の注入では確かめられない規則の確認（自前で失敗の一覧を返す） */
  custom?: () => string[];
}

// ============================================================================
// 捕捉しなければならない書き方（115.100 で実際に本番コードに存在した形）
// ============================================================================

const MUST_DETECT: Case[] = [
  {
    name: 'コロン直付け（design.md:3504）',
    line: ' * 正の無限大方向へ丸める `Math.round` とは負数で異なる（design.md:3504）。',
    expected: true,
  },
  {
    name: 'コロンの前に空白（design.md :2337-2339）',
    line: ' * （30.3 / design.md :2337-2339「当該項目のparentIdに選択した既存項目IDを設定',
    expected: true,
  },
  {
    name: '空白区切りの範囲（design.md 4905-4911）',
    line: '  // 初期スナップショット（design.md 4905-4911: ダイアログ open 時に確定）',
    expected: true,
  },
  {
    name: 'L 前置（design.md L1519）',
    line: '  // （REQ-37.6 / design.md L1519）。',
    expected: true,
  },
  {
    name: 'L 前置の範囲（design.md L5281-5289）',
    line: ' * design.md L5281-5289 では Props を `{ open, mode, targetImageIds, surveyId,',
    expected: true,
  },
  {
    name: 'アンカー形式（design.md#L166）',
    line: '  // 確立済みパターンに準拠（design.md#L166）。',
    expected: true,
  },
  {
    name: '後置の「行」（design.md 5347 行）',
    line: "    // 開放形状のため fill は 'transparent'（design.md 5347 行）。",
    expected: true,
  },
  {
    name: '節の題の後ろに括弧で範囲（「LineItemEditor 改訂4」§Type Changes (4655-4669)）',
    line: ' * - design.md「LineItemEditor 改訂4」§Type Changes (4655-4669) に準拠する。',
    expected: true,
  },
  {
    name: '全角括弧で範囲（`SaveEstimateLine`（4313-4323））',
    line: ' * design.md `##### estimate-draft.service` の `SaveEstimateLine`（4313-4323）と同一。',
    expected: true,
  },
  {
    name: '括弧で単独の行番号（(4375)）',
    line: '// および design.md「Components and Interfaces - 改訂」(4375) に基づき、',
    expected: true,
  },
  {
    name: '括弧で単独の 3 桁行番号（(803)。1000 行未満の design.md が実在する）',
    line: ' * 参照: design.md「Architecture Pattern & Boundary Map」(803)',
    expected: true,
  },
  {
    name: '全角括弧で単独の 3 桁行番号（（803））',
    line: ' * 参照: design.md「Architecture Pattern & Boundary Map」（803）',
    expected: true,
  },
  {
    name: '括弧内に前置がある 3 桁（(:422) は HTTP ステータスではなく行番号指定）',
    line: ' * 参照: design.md「Error Handling」(:422)',
    expected: true,
  },
  {
    name: '節記号に行番号（§4611）',
    line: '      // Task 72.1 / design.md §4611: enablePointerEvents を有効化し、',
    expected: true,
  },
  {
    name: '@see の末尾に範囲（design.md bulkExportService (5135-5215)）',
    line: ' * @see .kiro/specs/site-survey/design.md bulkExportService (5135-5215)',
    expected: true,
  },
  {
    name: '全角括弧にコロン付きの範囲（（:4086-4120））',
    line: ' * Design: design.md `##### estimateKeymap`（:4086-4120）',
    expected: true,
  },
  {
    name: '一行に複数の行番号（L1062-1131 と L2150）',
    line: ' * Design: design.md L1062-1131（State Management）, L2150（File Structure Plan）',
    expected: true,
  },
];

// ============================================================================
// 捕捉してはならない書き方（節の題とシンボル名で指す正しい形／行番号でない数値）
// ============================================================================

const MUST_NOT_DETECT: Case[] = [
  {
    name: '節の題で指す（是正後の形）',
    line: ' * design.md「Rectangle / Circle / Polygon / Polyline / Freehand（Group 化、共通仕様）」',
    expected: false,
  },
  {
    name: 'シンボル名で指す',
    line: ' * design.md `ShapeOutlineAttribute` に対応。',
    expected: false,
  },
  {
    name: '見出し記法で指す',
    line: ' * Design: design.md `##### useEstimateUndo`',
    expected: false,
  },
  {
    name: 'タスク番号（design.md と同じ行にある 115.100）',
    line: ' * Task 115.100: design.md への参照を節の題とシンボル名で指す形へ改める',
    expected: false,
  },
  {
    name: '要件番号（37.4-37.5 のような小数の範囲）',
    line: ' * design.md の部品表が与える Req Coverage 37.4-37.5, 37.9-37.11 と整合。',
    expected: false,
  },
  {
    name: 'HTTP ステータス（design.md と同じ行の（422））',
    line: '    // design.md「保存フロー（42.1〜42.9）」の順序に従い、検証（422）の後・',
    expected: false,
  },
  {
    name: 'HTTP ステータス（前置なしの 3 桁は行番号と数えない: （404）／(500)）',
    line: ' * design.md「Error Handling」に従い、見積書なし（404）とサーバー障害(500)を分ける',
    expected: false,
  },
  {
    name: '比率・寸法（0.75 や 44x44）',
    line: ' * Req 28.3 / design.md AnnotationToolbar (ext): 44x44 論理ピクセルに統一。本体 * 0.75',
    expected: false,
  },
  {
    name: '要件番号の範囲（Requirements 36-38）',
    line: ' * design.md「Components and Interfaces - 改訂（Requirements 36-38）」の部品表に基づく',
    expected: false,
  },
  {
    name: 'design.md への言及が無い行の行番号（別文書の行番号は本検査の対象外）',
    line: '  // requirements.md 4905-4911 を参照',
    expected: false,
  },
];

// ============================================================================
// 設計文書が自身を行番号で指す形（タスク 115.211）
//
// 陽性対照はすべて、タスク 115.172 が `.kiro/specs/site-survey/design.md` から
// 実際に撤去した記述である（コミット `c662783` の差分から採った）。
// 撤去時点で 12 件すべてが失効しており、ずれ幅は 27〜51 行であった。
// ============================================================================

const MUST_DETECT_IN_DESIGN: Case[] = [
  {
    name: 'コロン直付け（design.md:661。115.172 が撤去した実物）',
    line: '`### Architecture Pattern & Boundary Map` の Mermaid 図の辺 `SurveyImageService --> R2`（`design.md:661`）',
    scan: 'design',
    expected: true,
  },
  {
    name: '一行に複数のコロン直付け（design.md:558 / design.md:3609。115.172 が撤去した実物）',
    line: '残る6箇所（`design.md:558` / `design.md:560` / `design.md:627` / `design.md:3609`）は注入関係の記録である',
    scan: 'design',
    expected: true,
  },
  {
    name: '後置の「行目」（`design.md` の 1342 行目。115.172 が撤去した実物）',
    line: '本小節（`#### SurveyImageService` から `##### Cloudflare R2 設定詳細` の直前まで、`design.md` の 1342 行目から 1479 行目）を除いて **10箇所**ある',
    scan: 'design',
    expected: true,
  },
  {
    name: '自称（本書）＋範囲（本書 4905-4911）',
    line: '- 当該の契約は本書 4905-4911 で定義している',
    scan: 'design',
    expected: true,
  },
  {
    name: '自称（本書）＋後置の「行」（本書の 5347 行）',
    line: '- 詳細は本書の 5347 行を参照すること',
    scan: 'design',
    expected: true,
  },
  {
    name: '自称（本文書）＋L 前置（本文書 L1519）',
    line: '- 保存フローの記述は本文書 L1519 にある',
    scan: 'design',
    expected: true,
  },
  {
    name: '自称（同文書）＋括弧の行番号（同文書（4375））',
    line: '- 同じ判断を同文書（4375）でも述べている',
    scan: 'design',
    expected: true,
  },
  {
    name: '自称（本設計書）＋コロン直付け（本設計書:661）',
    line: '- 責務分離の記述は本設計書:661 にある',
    scan: 'design',
    expected: true,
  },
  {
    name: 'アンカー形式（design.md#L166）',
    line: '- 確立済みの形に準拠する（design.md#L166）',
    scan: 'design',
    expected: true,
  },
  {
    name: '節記号に行番号（design.md §4611）',
    line: '- 図形の初期化は design.md §4611 の手順に従う',
    scan: 'design',
    expected: true,
  },
  {
    name: '他スペックの設計文書を行番号で指す（estimate-creation/design.md:3171）',
    line: '- 丸め規則は `.kiro/specs/estimate-creation/design.md:3171` に準拠する',
    scan: 'design',
    expected: true,
  },
];

const MUST_NOT_DETECT_IN_DESIGN: Case[] = [
  {
    name: '節の題で指す（是正後の形。行番号を持たない）',
    line: '- 節の範囲は見出しから導く（`#### SurveyImageService` から `##### Cloudflare R2 設定詳細` の直前まで）。本書の行番号では固定しない',
    scan: 'design',
    expected: false,
  },
  {
    name: 'シンボル名で指す（是正後の形）',
    line: '- 本書の `AnnotationData` の契約に従う',
    scan: 'design',
    expected: false,
  },
  {
    name: 'タスク番号（本書と同じ行にある 115.172）',
    line: '- タスク 115.172 で本書から行番号参照を撤去した',
    scan: 'design',
    expected: false,
  },
  {
    name: 'HTTP ステータス（design.md と同じ行の（422）／(500)）',
    line: '- design.md「Error Handling」に従い、検証（422）とサーバー障害(500)を分ける',
    scan: 'design',
    expected: false,
  },
  {
    name: '件数（本書と同じ行の「合計 166 件」）',
    line: '- 本書の追跡表の本文行を数える（合計 166 件）',
    scan: 'design',
    expected: false,
  },
  {
    name: '本番コードを行番号で指す形（check:design-code-refs の所管であり本検査は関知しない）',
    line: '- 実体は `frontend/src/types/site-survey.types.ts:620` の `AnnotationData` である',
    scan: 'design',
    expected: false,
  },
  {
    name: '設計文書への言及が無い行の行番号（`requirements.md` の行番号は本検査の対象外）',
    line: '- 受入基準は requirements.md 4905-4911 に置いた',
    scan: 'design',
    expected: false,
  },
  {
    name: '要件番号の範囲（Requirements 36-38）',
    line: '- 本書「Components and Interfaces - 改訂（Requirements 36-38）」の部品表に基づく',
    scan: 'design',
    expected: false,
  },
  {
    // 出所: `.kiro/specs/site-survey/design.md` の「同型の取りこぼし」の段落の一行。
    // **実データからの抜粋**である（原文は「（合計**166 行**。是正の直前に計数）へ
    // 機械的に適用した結果である」と続く。対照として成立する長さへ詰めてある）。
    // 「本節」だけを門の語彙へ足す変異を当てると、この件が赤くなる
    // （自己検査 56 件のうち 1 件が落ちる。2026-08-31 に実測）。
    name: '「本節」は門の語彙に入れない（節の規模を数える「166 行」を拾わないため）',
    line: '本節は 115.77 と同じ手順を、文書内の追跡表**7つ全件**（合計**166 行**）へ適用する',
    scan: 'design',
    expected: false,
  },
  {
    // 出所: `.kiro/specs/site-survey/design.md` の Simplification の項の一行。
    // **実データの改変版**である——原文の自称は「本節」であり、`本表` は実データに
    // 現れない。門の語彙は語ごとに独立しているため、`本節` の対照だけでは
    // `本表` を足す変異を捕まえられない。そこで原文の `本節` を `本表` へ差し替えた
    // 一行を置く。`本表` だけを門の語彙へ足す変異を当てると、この件が赤くなる
    // （自己検査 56 件のうち 1 件が落ちる。同じ変異でも本検査は緑のままである。
    // いずれも 2026-08-31 に実測）。
    name: '「本表」は門の語彙に入れない（ファイルの分量の「303 行」を拾わないため）',
    line: '- **Simplification**: 未使用の `LazyImage.tsx`（当時 303 行のファイル）を削除する。**本表を書いた時点**では参照が残っていた',
    scan: 'design',
    expected: false,
  },
];

// ============================================================================
// 走査対象と前提条件（第3原則: 前提が満たせない場合は失敗させる）
// ============================================================================

function checkEmptyScanFails(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ref-selftest-'));
  try {
    const result = run({ root: tempRoot, sourceDirs: ['frontend/src', 'backend/src'] });
    if (result.scannedFileCount !== 0) {
      failures.push('空のディレクトリで走査件数が 0 にならなかった');
    }
    // 本体は scannedFileCount === 0 を「合格」ではなく失敗として扱う。
    // run() 自体は件数を返すだけなので、ここでは「0 件が観測できる」ことを固定し、
    // 0 件を失敗にする判断が main() に存在することを次の検査で確かめる。
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-design-reference-format.ts'),
      'utf-8'
    );
    if (!/result\.scannedFileCount === 0[\s\S]{0,400}process\.exit\(1\)/.test(source)) {
      failures.push('走査対象が 0 件のときに exit 1 する経路が本体に見当たらない');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

function checkTestFilesExcluded(): string[] {
  const failures: string[] = [];
  const excluded = [
    'frontend/src/components/Foo.test.tsx',
    'frontend/src/components/Foo.spec.ts',
    'frontend/src/__tests__/foo.ts',
    'backend/src/services/__mocks__/foo.ts',
  ];
  for (const relativePath of excluded) {
    if (!isTestFile(relativePath)) {
      failures.push(`テストコードとして除外されていない: ${relativePath}`);
    }
  }
  const included = ['frontend/src/components/Foo.tsx', 'backend/src/schemas/estimate.schema.ts'];
  for (const relativePath of included) {
    if (isTestFile(relativePath)) {
      failures.push(`本番コードが誤って除外された: ${relativePath}`);
    }
  }
  return failures;
}

function checkRealRepositoryIsScanned(): string[] {
  const failures: string[] = [];
  const files = collectSourceFiles(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    ['frontend/src', 'backend/src']
  );
  if (files.length === 0) {
    failures.push('リポジトリ本体の本番コードが一件も列挙できていない');
  }
  if (files.some((file) => isTestFile(file))) {
    failures.push('列挙結果にテストコードが混入している');
  }
  return failures;
}

/**
 * 設計文書の走査対象が空のとき、合格ではなく失敗になることを固定する（タスク 115.211）。
 *
 * 本番コードの走査対象が空のときと**別の出口**であることを確かめる。
 * 二つの母集団を一つの検査が持つため、片方だけが空になっても沈黙してはならない。
 */
function checkEmptyDesignScanFails(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-self-ref-selftest-'));
  try {
    // 本番コードだけが実在し、設計文書が一件も無い状態を作る
    const sourceDir = path.join(tempRoot, 'frontend', 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Foo.tsx'), '// 何も参照しない\n', 'utf-8');
    const result = run({ root: tempRoot });
    if (result.scannedFileCount === 0) {
      failures.push('本番コードを 1 件置いたのに走査件数が 0 のままだった');
    }
    if (result.scannedDesignDocuments.length !== 0) {
      failures.push('設計文書が無いのに走査対象が 0 件にならなかった');
    }
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-design-reference-format.ts'),
      'utf-8'
    );
    if (
      !/result\.scannedDesignDocuments\.length === 0[\s\S]{0,400}process\.exit\(1\)/.test(source)
    ) {
      failures.push('設計文書が 0 件のときに exit 1 する経路が本体に見当たらない');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/** リポジトリ本体の設計文書を実際に列挙できること（走査根が空でないこと） */
function checkRealDesignDocumentsAreScanned(): string[] {
  const failures: string[] = [];
  const documents = collectDesignDocuments(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  );
  if (documents.length === 0) {
    failures.push('リポジトリ本体の設計文書が一件も列挙できていない');
  }
  if (!documents.every((document) => document.endsWith('/design.md'))) {
    failures.push('列挙結果に design.md 以外が混入している');
  }
  if (!documents.includes('.kiro/specs/site-survey/design.md')) {
    failures.push('タスク 115.172 が是正した site-survey の設計文書が走査対象に入っていない');
  }
  return failures;
}

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return fs
    .readFileSync(ENTRY_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
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
 * 検出結果を返す前に**絞り込む経路が無い**こと（タスク 115.211。差し戻し1回目の是正）。
 *
 * 当初はこの検査を「`.kiro/specs/` を含む文字列リテラルが無いこと」と
 * 「`allowlist` / `baseline` の語が無いこと」——すなわち**名前**——だけで書いていた。
 * レビューがその形では担保にならないことを指摘したため、**弱い形を一時的に復元して
 * 自分で測り直した**（2026-08-31）。`run` の設計文書ループの先頭へ
 * `if (relativePath.includes('site-survey')) continue;` を 1 行足したうえで、
 * 本自己検査を名前とリテラルだけを見る旧版へ戻すと、**自己検査は 55 件すべて緑**で
 * 素通りした。名前を持たない間引きは名前では捕まらない。
 * 強化後の現在の形では、同じ 1 行の変異で自己検査は 56 件中 1 件が落ち、
 * その内訳は (a) `run` の本体に `.includes(` がある、(b) 起動した本体の報告が
 * 「合計 8 件 / 8 ファイル（走査 本番コード 2 ファイル、設計文書 6 ファイル）」の期待に対し
 * 「合計 7 件 / 7 ファイル（走査 本番コード 2 ファイル、設計文書 5 ファイル）」である、
 * (c) 報告に `site-survey` の該当が現れない、(d) 該当が無い材料で設計文書の走査件数 6 を
 * 告げていない、の 4 件である（2026-08-31 に実測）。
 *
 * 兄弟の `check-design-code-reference-format.selftest.ts` の `checkNoFindingsNarrowing`
 * が確立した作法へ揃える。見るのは名前ではなく、**走査対象と `findings` に対して
 * 何をしているか**である。間引きは検出のどこでもできるため、対象を
 * 「走査対象の決定」「検出」「集計」「報告と終了コード」の全段へ広げる。
 *
 * - `collectSourceFiles` の本体で走査対象一覧に触れる文を、列挙と返却だけに限定する
 * - `run` の本体で `findings` / 走査済み一覧に触れる文を、積み上げと返却だけに限定する
 * - `scanSource` の本体も同様に、積み上げと返却だけに限定する
 * - `main` の本体で `result` に触れる文を、判定と出力だけに限定する
 * - 絞り込みに使える操作（`filter` / `slice` / `splice` / `find` / `some` / `includes` /
 *   `Set` / `Map` / `continue` / `delete`）が `run` / `scanSource` の本体に現れないこと
 *   （`collectSourceFiles` と `main` は正当な `continue` / `Map` を持つため、
 *   一律禁止ではなく上の限定で見る）
 * - 許容リストの読み込み口になる JSON 読み出しが本体に無いこと
 * - 走査から返却までを実際に通し、`run` の件数が `scanSource` の総和と一致すること
 * - **本体をサブプロセスとして起動し、報告される件数が期待値と一致すること**
 *   （checkReportedCountsAreExact）。書き方に依存しない挙動の検査である。
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  const NARROWING =
    /\.filter\(|\.slice\(|\.splice\(|\.find\(|\.some\(|\.every\(|\.includes\(|new Set|new Map|\bcontinue\b|\bdelete\b/;

  interface BodyRule {
    /** 関数名（診断用） */
    label: string;
    /** 本体を取り出す宣言 */
    declaration: string;
    /** どの識別子に触れる文を見るか */
    watched: RegExp;
    /** 許す文の形 */
    allowed: RegExp[];
    /** 本体全体に対する一律禁止（正当な `continue` を持つ関数には課さない） */
    forbidAllNarrowing: boolean;
  }

  const bodies: BodyRule[] = [
    {
      label: 'collectSourceFiles',
      declaration: 'export function collectSourceFiles(',
      watched: /\bfiles\b|\bentries\b|\bentry\b|\brelativePath\b|\babsolutePath\b/,
      allowed: [
        /^const files: string\[\] = \[\];$/,
        /^let entries: fs\.Dirent\[\];$/,
        /^entries = fs\.readdirSync\(absoluteDir, \{ withFileTypes: true \}\);$/,
        /^for \(const entry of entries\) \{$/,
        /^const absolutePath = path\.join\(absoluteDir, entry\.name\);$/,
        /^if \(entry\.isDirectory\(\)\) \{$/,
        /^if \(EXCLUDED_DIR_NAMES\.has\(entry\.name\)\) continue;$/,
        /^walk\(absolutePath\);$/,
        /^if \(!entry\.isFile\(\)\) continue;$/,
        /^if \(!SOURCE_EXTENSIONS\.includes\(path\.extname\(entry\.name\)\)\) continue;$/,
        /^const relativePath = path\.relative\(root, absolutePath\)\.split\(path\.sep\)\.join\('\/'\);$/,
        /^if \(isTestFile\(relativePath\)\) continue;$/,
        /^files\.push\(relativePath\);$/,
        /^return files\.sort\(\);$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'run',
      declaration: 'export function run(',
      watched: /\bfindings\b|\bscannedFiles\b|\bscannedDesignDocuments\b/,
      allowed: [
        /^const findings: DesignRefFinding\[\] = \[\];$/,
        /^const scannedFiles: string\[\] = \[\];$/,
        /^const scannedDesignDocuments: string\[\] = \[\];$/,
        /^scannedFiles\.push\(relativePath\);$/,
        /^scannedDesignDocuments\.push\(relativePath\);$/,
        /^findings\.push\(\.\.\.scanSource\(relativePath, source, '(production|design)'\)\);$/,
        /^findings,$/,
        /^scannedFileCount: scannedFiles\.length,$/,
        /^scannedDesignDocuments,$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'scanSource',
      declaration: 'export function scanSource(',
      watched: /\bfindings\b/,
      allowed: [
        /^const findings: DesignRefFinding\[\] = \[\];$/,
        /^findings\.push\(\{$/,
        /^return findings;$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'main',
      declaration: 'function main(): void {',
      watched: /\bresult\b|\bfindings\b|\bscannedFileCount\b|\bscannedDesignDocuments\b/,
      // 許すのは「判定」と「出力」だけ。`result.findings` への破壊的操作・再代入・
      // 絞り込みはここで落ちる。書式の一部は注釈除去の副作用で崩れるため、
      // 参照している識別子が読み取れる形で完全一致させる。
      allowed: [
        /^const result = run\(\{ verbose, json \}\);$/,
        /^console\.log\(JSON\.stringify\(result, null, 2\)\);$/,
        /^if \(result\.scannedFileCount === 0\) \{$/,
        /^if \(result\.scannedDesignDocuments\.length === 0\) \{$/,
        /^if \(result\.findings\.length > 0\) \{$/,
        /^for \(const finding of result\.findings\) \{$/,
        /^console\.error\(`[^`]*\$\{result\.scannedDirs\.join\(', '\)\}`\);$/,
        /^console\.error\(`[^`]*\$\{result\.specDir\}[^`]*\$\{DESIGN_DOC_NAME\}`\);$/,
        /^`[^`]*\$\{result\.findings\.length\}[^`]*\$\{byFile\.size\}[^`]*` \+$/,
        /^`[^`]*\$\{result\.scannedFileCount\}[^`]*\$\{result\.scannedDesignDocuments\.length\}[^`]*`$/,
        /^`[^`]*\$\{result\.scannedFileCount\}[^`]*` \+$/,
        /^`\$\{result\.scannedDirs\.join\(', '\)\}[^`]*\$\{result\.scannedDesignDocuments\.length\}[^`]*` \+$/,
        /^`\$\{result\.specDir\}[^`]*\$\{DESIGN_DOC_NAME\}[^`]*`$/,
      ],
      forbidAllNarrowing: false,
    },
  ];

  for (const { label, declaration, watched, allowed, forbidAllNarrowing } of bodies) {
    const body = extractFunctionBody(source, declaration);
    if (body === null) {
      failures.push(`${label} の本体を取り出せなかった（宣言が変わった可能性がある）`);
      continue;
    }
    for (const rawLine of body.split('\n').slice(1)) {
      const line = rawLine.trim();
      if (!watched.test(line)) continue;
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

  failures.push(...checkReportedCountsAreExact());
  return failures;
}

/**
 * 本体を**サブプロセスとして起動**し、報告される件数と終了コードが期待値どおりであること。
 *
 * 構造の検査は「書き方」を見るため、想定していない書き方の間引きを見逃しうる。ここでは
 * 書き方に依らない**挙動**を見る。仮のリポジトリに、実在する spec と同じ名前の
 * ディレクトリと本番コードの置き場所を作り、各々に既知の件数の該当を置く。
 * 名指しの除外・`findings` の間引き・終了コードの詐称のいずれも、報告される
 * 「合計 N 件 / M ファイル（走査 本番コード K ファイル、設計文書 F ファイル）」の
 * ずれ、または終了コードのずれとして現れる。
 *
 * **`site-survey` を先頭に置くのは意図的である。** タスク 115.172 が是正した当の文書を
 * 名指しで外す間引き（`if (relativePath.includes('site-survey')) continue;`）が、
 * ここで件数のずれとして赤くなる——実際に 1 行を注入して測ると、報告は
 * 「合計 8 件 / 8 ファイル（走査 本番コード 2 ファイル、設計文書 6 ファイル）」から
 * 「合計 7 件 / 7 ファイル（走査 本番コード 2 ファイル、設計文書 5 ファイル）」へずれ、
 * 自己検査 56 件のうち 1 件が落ちる（2026-08-31 に実測）。
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
  const DESIGN_HIT_LINES = [
    '`### Architecture Pattern & Boundary Map` の辺（`design.md:661`）',
    '- 当該の契約は本書 4905-4911 で定義している',
    '- 保存フローの記述は本文書 L1519 にある',
    '- 同じ判断を同文書（4375）でも述べている',
    '- 図形の初期化は design.md §4611 の手順に従う',
    '- 責務分離の記述は本設計書:661 にある',
  ];
  const DESIGN_CLEAN_LINE = '- 本書の `AnnotationData` の契約に従う';

  // 本番コード側の母集団にも該当を置く。片方の母集団だけを数える退行を塞ぐ
  const SOURCE_FILES = ['frontend/src/Alpha.tsx', 'backend/src/beta.ts'];
  const SOURCE_HIT_LINES = [
    ' * 正の無限大方向へ丸める（design.md:3504）。',
    ' * design.md L5281-5289 では Props を定義している。',
  ];
  const SOURCE_CLEAN_LINE = ' * design.md `ShapeOutlineAttribute` に対応。';

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ref-report-'));
  try {
    const tempScripts = path.join(tempRoot, 'scripts');
    fs.mkdirSync(tempScripts, { recursive: true });
    fs.copyFileSync(ENTRY_PATH, path.join(tempScripts, ENTRY_NAME));
    fs.copyFileSync(path.join(SCRIPTS_DIR, SIBLING_NAME), path.join(tempScripts, SIBLING_NAME));

    let expectedFindings = 0;
    FEATURES.forEach((feature, index) => {
      const featureDir = path.join(tempRoot, SPEC_DIR, feature);
      fs.mkdirSync(featureDir, { recursive: true });
      const body = ['# Design', DESIGN_CLEAN_LINE, DESIGN_HIT_LINES[index], DESIGN_CLEAN_LINE].join(
        '\n'
      );
      fs.writeFileSync(path.join(featureDir, DESIGN_DOC_NAME), `${body}\n`);
      expectedFindings += scanSource(`${feature}/${DESIGN_DOC_NAME}`, body, 'design').length;
    });
    SOURCE_FILES.forEach((relativePath, index) => {
      const absolutePath = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      const body = [SOURCE_CLEAN_LINE, SOURCE_HIT_LINES[index], SOURCE_CLEAN_LINE].join('\n');
      fs.writeFileSync(absolutePath, `${body}\n`);
      expectedFindings += scanSource(relativePath, body, 'production').length;
    });

    const expectedFiles = FEATURES.length + SOURCE_FILES.length;
    if (expectedFindings !== expectedFiles) {
      failures.push(
        `材料の作りが崩れている（1 ファイル 1 件のはずが 合計 ${expectedFindings} 件 / ${expectedFiles} ファイル）`
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
          `標準出力: ${(executed.stdout ?? '').trim()}／標準エラー: ${(executed.stderr ?? '').trim()}`
      );
    }
    const stderr = executed.stderr ?? '';
    const expectedSummary =
      `合計 ${expectedFindings} 件 / ${expectedFiles} ファイル` +
      `（走査 本番コード ${SOURCE_FILES.length} ファイル、設計文書 ${FEATURES.length} ファイル）`;
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
    for (const relativePath of SOURCE_FILES) {
      if (!stderr.includes(relativePath)) {
        failures.push(`報告に ${relativePath} の該当が現れない（名指しで除外されている疑い）`);
      }
    }

    // 該当が無い材料では合格し、走査件数を正しく告げること（常時失敗の裏返しを塞ぐ）
    for (const feature of FEATURES) {
      fs.writeFileSync(
        path.join(tempRoot, SPEC_DIR, feature, DESIGN_DOC_NAME),
        `# Design\n${DESIGN_CLEAN_LINE}\n`
      );
    }
    for (const relativePath of SOURCE_FILES) {
      fs.writeFileSync(path.join(tempRoot, relativePath), `${SOURCE_CLEAN_LINE}\n`);
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
    const stdout = clean.stdout ?? '';
    if (!stdout.includes(`本番コード ${SOURCE_FILES.length} ファイル`)) {
      failures.push(`該当が無い材料で本番コードの走査件数 ${SOURCE_FILES.length} を告げていない`);
    }
    if (!stdout.includes(`設計文書 ${FEATURES.length} ファイル`)) {
      failures.push(`該当が無い材料で設計文書の走査件数 ${FEATURES.length} を告げていない`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 走査から返却までを実際に通し、`run` の件数が `scanSource` の総和と一致すること。
 * 集計の途中で落とす間引きは、ここで総和とのずれとして現れる。
 */
function checkRunMatchesScanSourceTotals(): string[] {
  const failures: string[] = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ref-totals-'));
  try {
    const corpus = MUST_DETECT_IN_DESIGN.map((testCase) => testCase.line ?? '');
    let expected = 0;
    corpus.forEach((line, index) => {
      const featureDir = path.join(tempRoot, SPEC_DIR, `feature-${index}`);
      fs.mkdirSync(featureDir, { recursive: true });
      const body = `# Design\n${line}\n`;
      fs.writeFileSync(path.join(featureDir, DESIGN_DOC_NAME), body);
      expected += scanSource(`feature-${index}/${DESIGN_DOC_NAME}`, body, 'design').length;
    });
    const sourceDir = path.join(tempRoot, 'frontend', 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    MUST_DETECT.forEach((testCase, index) => {
      const body = `${testCase.line ?? ''}\n`;
      fs.writeFileSync(path.join(sourceDir, `Sample${index}.tsx`), body);
      expected += scanSource(`frontend/src/Sample${index}.tsx`, body, 'production').length;
    });
    if (expected === 0) {
      failures.push('差分照合の材料が 0 件になった（対照群が空か検出器が壊れている）');
    }
    const result = run({ root: tempRoot });
    if (result.scannedDesignDocuments.length !== corpus.length) {
      failures.push(
        `設計文書の走査対象が間引かれた（${result.scannedDesignDocuments.length} / ${corpus.length} ファイル）`
      );
    }
    if (result.scannedFileCount !== MUST_DETECT.length) {
      failures.push(
        `本番コードの走査対象が間引かれた（${result.scannedFileCount} / ${MUST_DETECT.length} ファイル）`
      );
    }
    if (result.findings.length !== expected) {
      failures.push(
        `run の件数が scanSource の総和と一致しない（run ${result.findings.length} 件 / 総和 ${expected} 件）`
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  return failures;
}

/**
 * 二群の陽性・陰性対照がいずれも空でないことを固定する。
 * 群が空になれば「全件合格」が無条件に成立し、検査は沈黙する。
 */
function checkControlGroupsAreNotEmpty(): string[] {
  const failures: string[] = [];
  const groups: Array<[string, Case[]]> = [
    ['本番コードの陽性対照', MUST_DETECT],
    ['本番コードの陰性対照', MUST_NOT_DETECT],
    ['設計文書の陽性対照', MUST_DETECT_IN_DESIGN],
    ['設計文書の陰性対照', MUST_NOT_DETECT_IN_DESIGN],
  ];
  for (const [name, cases] of groups) {
    if (cases.length === 0) failures.push(`対照群が空である: ${name}`);
  }
  return failures;
}

const STRUCTURAL: Case[] = [
  {
    name: '走査対象が 0 件のとき合格にしない（第3原則）',
    expected: false,
    custom: checkEmptyScanFails,
  },
  {
    name: '設計文書の走査対象が 0 件のとき合格にしない（第3原則。本番コードとは別の出口）',
    expected: false,
    custom: checkEmptyDesignScanFails,
  },
  {
    name: 'テストコードは走査対象から外れる（本タスクの境界）',
    expected: false,
    custom: checkTestFilesExcluded,
  },
  {
    name: 'リポジトリ本体の本番コードを実際に列挙できる',
    expected: false,
    custom: checkRealRepositoryIsScanned,
  },
  {
    name: 'リポジトリ本体の設計文書を実際に列挙できる',
    expected: false,
    custom: checkRealDesignDocumentsAreScanned,
  },
  {
    name: '検出結果を絞り込む経路を持たない（構造 + 起動して件数を突き合わせる）',
    expected: false,
    custom: checkNoFindingsNarrowing,
  },
  {
    name: 'run の件数が scanSource の総和と一致する（集計での間引きが無い）',
    expected: false,
    custom: checkRunMatchesScanSourceTotals,
  },
  {
    name: '陽性対照・陰性対照のいずれの群も空でない',
    expected: false,
    custom: checkControlGroupsAreNotEmpty,
  },
];

// ============================================================================
// 実行
// ============================================================================

function runCase(testCase: Case): string[] {
  if (testCase.custom) return testCase.custom();
  const scan = testCase.scan === 'design' ? scanDesignDocumentLine : scanLine;
  const references = scan(testCase.line ?? '');
  const detected = references.length > 0;
  if (detected && !testCase.expected) {
    return [`検出されてはならないが検出された: ${references.join(' / ')}`];
  }
  if (!detected && testCase.expected) {
    return ['検出されなければならないが検出されなかった'];
  }
  return [];
}

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '本番コード: 捕捉しなければならない書き方', cases: MUST_DETECT },
    { title: '本番コード: 捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '設計文書: 捕捉しなければならない書き方', cases: MUST_DETECT_IN_DESIGN },
    { title: '設計文書: 捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT_IN_DESIGN },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 設計文書への行番号参照 検出規則 自己検査 (scripts/check-design-reference-format.selftest.ts)'
  );
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
}

main();
