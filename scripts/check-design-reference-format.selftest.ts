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
  collectSourceFiles,
  isTestFile,
  run,
  scanDesignDocumentLine,
  scanLine,
  scanSource,
} from './check-design-reference-format.js';
// 走査根は共有部品から直に取る。被検査モジュール（check-design-reference-format.ts）を
// 経由して取ると、本体が再輸出を続ける限り複製の有無を見分けられない（タスク 115.231。
// タスク 115.221 が scripts/check-requirement-exclusions.selftest.ts で採った作法と同じ）。
import { DESIGN_DOC_NAME, SPEC_DIR, collectDesignDocuments } from './design-document.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-reference-format.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * 本体が走査根を取り込んでいる共有部品。サブプロセスを起こす対照は同じ場所へ複製する。
 *
 * その `fs.copyFileSync` を外す変異を当てると自己検査 87 件中 1 件（「検出結果を絞り込む
 * 経路を持たない（構造 + 起動して件数を突き合わせる）」）が落ちる（2026-09-01 に総数 56 件で
 * 実測し、タスク 115.266 が対照群を足して総数が 87 件になった 2026-09-04 に再実測した。
 * 落ちる件数は 1 件のまま変わらない）。
 */
const SHARED_ROOT_MODULE_NAME = 'design-document.ts';

/**
 * 共有部品がさらに取り込むスペックの根の担い手（タスク 115.269）。
 *
 * `.kiro/specs` は要件定義書の根でもあるため、値は scripts/spec-directory.ts が唯一持つ。
 * サブプロセスを起こす対照は共有部品だけでなくこれも同じ場所へ複製しないと起動できない。
 */
const SPEC_ROOT_MODULE_NAME = 'spec-directory.ts';

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
    // （自己検査 87 件のうち 1 件が落ちる。2026-08-31 に総数 56 件で実測し、
    // 総数が 87 件になった 2026-09-04 に再実測した）。
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
    // （自己検査 87 件のうち 1 件が落ちる。同じ変異でも本検査は緑のままである
    // ——`npx tsx scripts/check-design-reference-format.ts` は EXIT=0 で
    // 「設計文書への行番号参照はありません」を出す。2026-08-31 に総数 56 件で実測し、
    // 総数が 87 件になった 2026-09-04 に再実測した）。
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
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (excluded.length === 0) {
    failures.push('合成素材 excluded が空です（この確認が空振りしています）');
  }
  for (const relativePath of excluded) {
    if (!isTestFile(relativePath)) {
      failures.push(`テストコードとして除外されていない: ${relativePath}`);
    }
  }
  const included = ['frontend/src/components/Foo.tsx', 'backend/src/schemas/estimate.schema.ts'];
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (included.length === 0) {
    failures.push('合成素材 included が空です（この確認が空振りしています）');
  }
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
 *     主張していた枝を落とす）→ 自己検査は 56/56 緑のままだった
 *   - 最上位の束縛の綴りから `\(` の枝を落とす（散文がカンマ演算子・複数行のアロー・三項を
 *     捕らえると主張していた枝を落とす）→ 自己検査は 56/56 緑のままだった
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
 * 書き戻しで復元し、復元後は 87/87 で緑に戻ることを確かめた）。**移す前は同じ三つの変異が
 * いずれも緑のまま素通りしていた**——上の注釈に当時の実出力を引いた。
 *
 *   - 抽出の綴りの `[<(]` を `\(` へ狭める → 自己検査 87 件中 1 件が落ちる。落ちるのは
 *     「関数の書き方: 型引数を取る関数宣言（sneakG）」である
 *   - 最上位の束縛の綴りから `\(` の枝を落とす → 自己検査 87 件中 16 件が落ちる。落ちるのは
 *     括弧で始まる束縛の見本（アロー・複数行のアロー・カンマ演算子・三項・`sneakZ`）と
 *     偽陽性の四形である
 *   - 最上位の束縛の綴りの `\(` を ``\((?!\s*[\d'"\x60])`` へ絞る（偽陽性を消す向きの絞り込み）
 *     → 自己検査 87 件中 11 件が落ちる。**内訳が要点である**——消えるはずの偽陽性は 3 件
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
 * 復元後は 87/87 で緑に戻ることを確かめた）。
 *   - `FUNCTION_FORM_SPECIMENS` を空にする → 確認の実行より前に群の関門が
 *     「対照群『関数の書き方の対照群（抽出と最上位の束縛の実測）』が空です」と
 *     「確認の総数が 57 件しかありません（宣言の下限は 87 件）」を挙げて `EXIT=1` になる
 *   - 取りこぼしの見本（`verdict: 'residual'`）を 6 件すべて消す → 総数が 81 件へ落ち、
 *     下限 87 を割って `EXIT=1` になる。**下限も 81 へ下げて関門を通した場合でも**、
 *     本確認が 81 件中 1 件として落ちる（「取りこぼしの見本が 0 件」および
 *     `sneakT` / `plainRef` が対照群から消えている旨）
 *   - `sneakT` の `bindsFunctionValue` と `verdict` を `true` / `'watched'` へ書き換える
 *     （捕らえているふりをする）→ 自己検査 87 件中 2 件が落ちる。見本一件の確認が
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
 * （2026-09-01 に実測。当時の総数は 56 件で、56/56 緑のままだった。是正後の同じ変異の
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
  { name: 'isTestFile', watch: 'whole-body' },
  { name: 'collectSourceFiles', watch: 'whole-body' },
  { name: 'isBareHttpStatusCode', watch: 'whole-body' },
  { name: 'collectReferences', watch: 'whole-body' },
  { name: 'scanLine', watch: 'whole-body' },
  { name: 'scanDesignDocumentLine', watch: 'whole-body' },
  { name: 'scanSource', watch: 'whole-body' },
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
  const source = readExecutableSource();

  // 前提が満たせないときは合格ではなく失敗（第3原則）
  if (EXECUTABLE_FUNCTION_INVENTORY.length === 0) {
    failures.push('関数の台帳が空である。監視対象が無い状態を合格にしてはならない');
  }
  if (monitored.length === 0) {
    failures.push('絞り込みの検査が本体を一つも見張っていない');
  }

  // 抽出は `declaredFunctionNames` に一本化してある。**同じ述語を対照群
  // `FUNCTION_FORM_SPECIMENS` も通る**ので、綴りを変えれば見本の側が赤くなる（対象の同一性。
  // タスク 115.266）。実測: 抽出の `[<(]` を `\(` へ狭めると自己検査 87 件中 1 件
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
 * 注釈の列挙から、逆引用符で囲まれた操作名を順に取り出す。
 *
 * **走査するのは注釈の行だけ**（`*` で始まる行）。目印そのものを保持する定数の宣言は
 * コードの行であって散文ではないため、ここで数に入れると目印が常に二箇所になる。
 * 目印がちょうど一箇所でなければ `null` を返し、呼び出し元が失格にする。
 */
function narrowingOperationsFromProse(selfSource: string): string[] | null {
  const prose = selfSource
    .split('\n')
    .filter((line) => line.trim().startsWith('*'))
    .join('\n');
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
 * 上の注釈が挙げる「絞り込みに使える操作」の列挙が、禁止の判定が実際に使う `NARROWING` と
 * 一致すること（タスク 115.267）。
 *
 * **正規表現という開いた構文空間の性質を散文で主張すると、列挙されていない一例を持って
 * くるだけで反証できる**（タスク 115.266）。本件はその系である——起票時の列挙は
 * `NARROWING` に在る `.every(` を落としていた。向きは安全側で、**実装のほうが散文より
 * 厳しかったため逃がしは生まれていない**。それは実測で確かめた——本体 `scanSource` の
 * `if (references.length === 0) return;` の直前へ `.every(` を用いた逃がしを一行
 * （`if (references.every((one) => one.includes('画像削除'))) return;`）差し込むと、
 * 自己検査 87 件中 1 件が「scanSource の本体に絞り込みに使える操作がある: .every(」と
 * 「scanSource が検出結果／走査対象へ想定外の操作をしている」を挙げて落ちる
 * （2026-09-04 に総数 87 件で実測。退避した控えからの書き戻しで復元し、
 * 87/87 緑に戻ることを確かめた）。
 * だが逆向き——列挙のほうが広い——へずれれば、読み手は禁じられていない操作を禁じられて
 * いると誤読する。**どちらの向きも赤へ倒すには、散文を検査の入力にするしかない。**
 *
 * 見本ではなく全単射で持てるのは、`NARROWING` の枝が**閉じた有限集合**だからである
 * （115.266 が見本を要したのは、関数の書き方という開いた構文空間が相手だったため）。
 * 材料は二つとも本物である——実装の側は禁止の判定が実際に使う `NARROWING` の `source`
 * から導き（写しを置かない）、散文の側は自ファイルのソースから読み直す。
 *
 * 実測（いずれも 2026-09-04 にリポジトリルートで実測。変異は退避した控えからの書き戻しで
 * 復元し、復元後は 87/87 で緑に戻ることを確かめた。兄弟の `check-design-code-reference-format.selftest.ts` でも同じ
 * 四つを当て、総数 103 件でそれぞれ 1 件が同じ文面で落ちた）。
 *   - 注釈の列挙から `every` を外す（起票時の食い違いの再現）→ 87 件中 1 件が
 *     「NARROWING が禁じている操作が注釈の列挙に無い: every」で落ちる
 *   - 注釈の列挙へ `NARROWING` が禁じていない `reduce` を足す（危険な向き）→ 87 件中
 *     1 件が「注釈の列挙にあるが NARROWING が禁じていない操作がある: reduce」で落ちる
 *   - `NARROWING` へ枝 `\.at\(` を一本足す（実装が動いたとき散文が追随するか）→
 *     87 件中 1 件が「NARROWING が禁じている操作が注釈の列挙に無い: at」で落ちる。
 *     **写しを持たない設計がここで効く**
 *   - 散文の側の目印を複製して二箇所にする → 87 件中 1 件が「列挙を自ファイルから
 *     取り出せない」で落ちる（曖昧なまま突き合わせた気になるのを禁じる。第3原則）
 *
 * **塞いでいないこと**: 一致は集合として見るため、**列挙の順序**は固定していない。また
 * 本確認は {@link checkNoFindingsNarrowing} の中の一節であって確認の要素ではないため、
 * **呼び出しの一行を落とせば下限の関門には当たらない**——実測すると、呼び出しを落として
 * 列挙から `every` を外した状態で自己検査は 87/87 緑・`EXIT=0` であった
 * （2026-09-04 に実測。`MINIMUM_TOTAL_CASES` が見るのは確認の要素の数であり、
 * 節の有無は数に現れない）。削除は差分に現れる。**塞がないことと、書かないことは別で
 * ある**（115.242 の教訓）。
 */
function checkNarrowingEnumerationMatchesRegex(narrowing: RegExp): string[] {
  const failures: string[] = [];
  const fromRegex = narrowingOperationsFromRegex(narrowing);
  const fromProse = narrowingOperationsFromProse(
    fs.readFileSync(fileURLToPath(import.meta.url), 'utf-8')
  );

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
  return failures;
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
 * 強化後の現在の形では、同じ 1 行の変異で自己検査は 87 件中 1 件が落ち、
 * その内訳は (a) `run` の本体に想定外の文がある、(b) `run` の本体に `.includes(` がある、
 * (c) 起動した本体の報告が
 * 「合計 8 件 / 8 ファイル（走査 本番コード 2 ファイル、設計文書 6 ファイル）」の期待に対し
 * 「合計 7 件 / 7 ファイル（走査 本番コード 2 ファイル、設計文書 5 ファイル）」である、
 * (d) 報告に `site-survey` の該当が現れない、(e) 該当が無い材料で設計文書の走査件数 6 を
 * 告げていない、の 5 件である（タスク 115.230 で `run` を全行の突き合わせへ変えたため
 * (a) が増え、当初の 4 件から 5 件になった。2026-09-01 に総数 56 件で測り直し、
 * タスク 115.266 が総数を 87 件へ動かした 2026-09-04 に再実測した——落ちる確認は 1 件、
 * その内訳は 5 件のままである）。
 *
 * 兄弟の `check-design-code-reference-format.selftest.ts` の `checkNoFindingsNarrowing`
 * が確立した作法へ揃える。見るのは名前ではなく、**走査対象と `findings` に対して
 * 何をしているか**である。間引きは検出のどこでもできるため、対象を
 * 「走査対象の決定」「検出」「集計」「報告と終了コード」の全段へ広げる。
 *
 * **見張る範囲を広げたのがタスク 115.230 である。** 当初は
 * `collectSourceFiles` / `run` / `scanSource` / `main` の 4 本だけを見ており、
 * **行単位の検出の中核である `collectReferences` が入っていなかった。** その冒頭へ
 * `if (lineText.includes('画像削除')) return [];` を足すと、自己検査は 56/56 緑・
 * 本検査も緑で素通りした（2026-09-01 に、当時の総数 56 件で実測）。同じ 1 行を現在の形に
 * 当てると自己検査は 87 件中 1 件が落ち、内訳は
 * 「collectReferences が検出結果／走査対象へ想定外の操作をしている」の 1 件である
 * （2026-09-01 に総数 56 件で実測し、総数が 87 件になった 2026-09-04 に再実測した）。
 *
 * **見張る範囲は、抽出 `declaredFunctionNames` が本体から拾える関数宣言であり、台帳
 * `EXECUTABLE_FUNCTION_INVENTORY` と双方向で一致させる。** その範囲で、取り落とし・改名・
 * 撤去・新設が失敗になる。**どの書き方が範囲に入り、どれが外れるかは散文では持たない**
 * ——`FUNCTION_FORM_SPECIMENS` が実体で持ち、同じ述語を通る（タスク 115.266）。
 * 関数の外——モジュール最上位——は範囲に含まない。下の「捕らえない範囲」を見よ。
 *
 * - `main` を除く全関数を `watched: 'whole-body'` で見る。**本体の空でない全行**を
 *   許可形と突き合わせるため、逃がしを差し込める行が残らない
 * - `main` だけは `result` に触れる文に限って見る。報告の日本語の長文を全行固定すると
 *   文言の改訂で毎回落ちるためで、`main` の早期終了・件数の詐称は
 *   `checkReportedCountsAreExact` が終了コードと報告件数で捕らえる
 * - 絞り込みに使える操作（`filter` / `slice` / `splice` / `find` / `some` / `every` /
 *   `includes` / `Set` / `Map` / `continue` / `delete`）が `run` / `scanSource` /
 *   `scanLine` / `scanDesignDocumentLine` の本体に現れないこと
 *   （`collectSourceFiles` / `collectReferences` / `main` は正当な `continue` / `filter` /
 *   `Set` を持つため、一律禁止ではなく上の全行の突き合わせで見る）
 * - 許容リストの読み込み口になる JSON 読み出しが本体に無いこと
 * - 走査から返却までを実際に通し、`run` の件数が `scanSource` の総和と一致すること
 * - **本体をサブプロセスとして起動し、報告される件数が期待値と一致すること**
 *   （checkReportedCountsAreExact）。書き方に依存しない挙動の検査である。
 * - 見張る本体が 0 件なら失敗にする（空の母集団を合格にしない。第3原則）
 * - **捕らえない範囲（本タスクの境界の外）**: 見張るのは関数の中であって、モジュール
 *   最上位での**再代入**は見ていない。`const invokedPath =` の直前へ
 *   `const __origScanSource = scanSource;` と、`__origScanSource` の結果から
 *   `画像削除` を含む検出だけを `filter` で落として返す `scanSource = function (...) {...};`
 *   を足すと、`scanSource` は実際に検出を落とす——同じ一行に対し包む前は 1 件、
 *   包んだ後は 0 件、対照の行は前後とも 1 件——にもかかわらず、自己検査は 87/87 緑の
 *   ままである（2026-09-01 に総数 56 件で実測し、総数が 87 件になった 2026-09-04 に
 *   再実測した。いずれも緑）。`_Boundary: 絞り込みの検査が監視する関数の範囲_`
 *   の外であるため本タスクでは塞がず、後続として起票する。最上位で捕らえない形はこの
 *   再代入だけではない。クラスの静的メソッド・分割代入の束縛・文としての名前付き即時実行も
 *   同じ位置へ足して自己検査 87/87 緑（兄弟 103/103 緑）であった（2026-09-01 に総数 56 件
 *   ／兄弟 71 件で実測し、2026-09-04 に再実測）。**これらの形は
 *   `FUNCTION_FORM_SPECIMENS` が `verdict: 'residual'` として実体で持つ**ため、散文の
 *   数え上げではなく述語で固定されている（網羅の主張ではない）
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

  const NARROWING =
    /\.filter\(|\.slice\(|\.splice\(|\.find\(|\.some\(|\.every\(|\.includes\(|new Set|new Map|\bcontinue\b|\bdelete\b/;

  failures.push(...checkNarrowingEnumerationMatchesRegex(NARROWING));

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
      label: 'isTestFile',
      declaration: 'export function isTestFile(',
      watched: 'whole-body',
      allowed: [
        /^const normalized = relativePath\.split\(path\.sep\)\.join\('\/'\);$/,
        /^if \(TEST_FILE_PATTERN\.test\(normalized\)\) return true;$/,
        /^const segments = normalized\.split\('\/'\);$/,
        /^return segments\.some\(\(segment\) => EXCLUDED_DIR_NAMES\.has\(segment\)\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'collectSourceFiles',
      declaration: 'export function collectSourceFiles(',
      watched: 'whole-body',
      allowed: [
        /^const files: string\[\] = \[\];$/,
        /^const walk = \(absoluteDir: string\): void => \{$/,
        /^let entries: fs\.Dirent\[\];$/,
        /^try \{$/,
        /^entries = fs\.readdirSync\(absoluteDir, \{ withFileTypes: true \}\);$/,
        /^\} catch \{$/,
        /^return;$/,
        /^\}$/,
        /^for \(const entry of entries\) \{$/,
        /^const absolutePath = path\.join\(absoluteDir, entry\.name\);$/,
        /^if \(entry\.isDirectory\(\)\) \{$/,
        /^if \(EXCLUDED_DIR_NAMES\.has\(entry\.name\)\) continue;$/,
        /^walk\(absolutePath\);$/,
        /^continue;$/,
        /^if \(!entry\.isFile\(\)\) continue;$/,
        /^if \(!SOURCE_EXTENSIONS\.includes\(path\.extname\(entry\.name\)\)\) continue;$/,
        /^const relativePath = path\.relative\(root, absolutePath\)\.split\(path\.sep\)\.join\('\/'\);$/,
        /^if \(isTestFile\(relativePath\)\) continue;$/,
        /^files\.push\(relativePath\);$/,
        /^\};$/,
        /^for \(const dir of sourceDirs\) \{$/,
        /^walk\(path\.join\(root, dir\)\);$/,
        /^return files\.sort\(\);$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'isBareHttpStatusCode',
      declaration: 'function isBareHttpStatusCode(',
      watched: 'whole-body',
      allowed: [
        /^const inner = matched\.replace\(\/\^\[\(（\]\\s\*\/, ''\)\.replace\(\/\\s\*\[\)）\]\$\/, ''\);$/,
        /^if \(\/\^\[:L\]\/i\.test\(inner\)\) return false;$/,
        /^if \(!\/\^\\d\{3\}\$\/\.test\(inner\)\) return false;$/,
        /^return HTTP_STATUS_CODES\.has\(Number\(inner\)\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      // 行単位の検出の中核（タスク 115.230 で見張りへ加えた）
      label: 'collectReferences',
      declaration: 'function collectReferences(',
      watched: 'whole-body',
      allowed: [
        /^lineText: string,$/,
        /^mention: RegExp,$/,
        /^extraRules: ReadonlyArray<Rule> = \[\]$/,
        /^\): string\[\] \{$/,
        /^if \(!mention\.test\(lineText\)\) return \[\];$/,
        /^const spans: Span\[\] = \[\];$/,
        /^for \(const \{ pattern, reject \} of \[\.\.\.LINE_REFERENCE_PATTERNS, \.\.\.extraRules\]\) \{$/,
        /^pattern\.lastIndex = 0;$/,
        /^let match: RegExpExecArray \| null;$/,
        /^while \(\(match = pattern\.exec\(lineText\)\) !== null\) \{$/,
        /^const start = match\.index;$/,
        /^const end = start \+ match\[0\]\.length;$/,
        /^if \(end === start\) break;$/,
        /^if \(reject\?\.\(match\[0\]\)\) continue;$/,
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
        /^if \(seen\.has\(span\.text\)\) continue;$/,
        /^seen\.add\(span\.text\);$/,
        /^references\.push\(span\.text\);$/,
        /^return references;$/,
      ],
      forbidAllNarrowing: false,
    },
    {
      label: 'scanLine',
      declaration: 'export function scanLine(',
      watched: 'whole-body',
      allowed: [/^return collectReferences\(lineText, DESIGN_DOC_MENTION\);$/, /^\}$/],
      forbidAllNarrowing: true,
    },
    {
      label: 'scanDesignDocumentLine',
      declaration: 'export function scanDesignDocumentLine(',
      watched: 'whole-body',
      allowed: [
        /^return collectReferences\(lineText, DESIGN_SELF_MENTION, DESIGN_SELF_REFERENCE_PATTERNS\);$/,
        /^\}$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'scanSource',
      declaration: 'export function scanSource(',
      watched: 'whole-body',
      allowed: [
        /^relativePath: string,$/,
        /^source: string,$/,
        /^kind: FindingKind = 'production'$/,
        /^\): DesignRefFinding\[\] \{$/,
        /^const scan = kind === 'design' \? scanDesignDocumentLine : scanLine;$/,
        /^const findings: DesignRefFinding\[\] = \[\];$/,
        /^const lines = source\.split\(\/\\r\?\\n\/\);$/,
        /^lines\.forEach\(\(lineText, index\) => \{$/,
        /^const references = scan\(lineText\);$/,
        /^if \(references\.length === 0\) return;$/,
        /^findings\.push\(\{$/,
        /^kind,$/,
        /^file: relativePath,$/,
        /^line: index \+ 1,$/,
        /^reference: references\.join\(' \/ '\),$/,
        /^snippet: lineText\.trim\(\),$/,
        /^\}\);$/,
        /^return findings;$/,
        /^\}$/,
      ],
      forbidAllNarrowing: true,
    },
    {
      label: 'run',
      declaration: 'export function run(',
      watched: 'whole-body',
      allowed: [
        /^const root = options\.root \?\? ROOT;$/,
        /^const sourceDirs = options\.sourceDirs \?\? PRODUCTION_SOURCE_DIRS;$/,
        /^const specDir = options\.specDir \?\? SPEC_DIR;$/,
        /^const findings: DesignRefFinding\[\] = \[\];$/,
        /^const scannedFiles: string\[\] = \[\];$/,
        /^const scannedDesignDocuments: string\[\] = \[\];$/,
        /^for \(const relativePath of collectSourceFiles\(root, sourceDirs\)\) \{$/,
        /^const source = fs\.readFileSync\(path\.join\(root, relativePath\), 'utf-8'\);$/,
        /^scannedFiles\.push\(relativePath\);$/,
        /^findings\.push\(\.\.\.scanSource\(relativePath, source, 'production'\)\);$/,
        /^\}$/,
        /^for \(const relativePath of collectDesignDocuments\(root, specDir\)\) \{$/,
        /^scannedDesignDocuments\.push\(relativePath\);$/,
        /^findings\.push\(\.\.\.scanSource\(relativePath, source, 'design'\)\);$/,
        /^return \{$/,
        /^findings,$/,
        /^scannedFileCount: scannedFiles\.length,$/,
        /^scannedDirs: sourceDirs,$/,
        /^scannedDesignDocuments,$/,
        /^specDir,$/,
        /^\};$/,
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
 * 自己検査 87 件のうち 1 件が落ちる（2026-08-31 に総数 56 件で実測し、
 * 総数が 87 件になった 2026-09-04 に再実測した）。
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
    fs.copyFileSync(
      path.join(SCRIPTS_DIR, SHARED_ROOT_MODULE_NAME),
      path.join(tempScripts, SHARED_ROOT_MODULE_NAME)
    );
    // 共有部品はさらにスペックの根を担い手から取り込む（タスク 115.269）
    fs.copyFileSync(
      path.join(SCRIPTS_DIR, SPEC_ROOT_MODULE_NAME),
      path.join(tempScripts, SPEC_ROOT_MODULE_NAME)
    );

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
  // 合成素材が空なら以下の照合は一度も回らず、この確認は何も主張しない（第3原則。115.252）
  if (groups.length === 0) {
    failures.push('合成素材 groups が空です（この確認が空振りしています）');
  }
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
 */
const MINIMUM_POSITIVE_CONTROLS = 28;
const MINIMUM_NEGATIVE_CONTROLS = 20;

/**
 * 確認の総数の下限（タスク 115.252）
 *
 * 2026-09-04 にリポジトリルートで実測した現況ちょうど（余裕ゼロ。タスク 115.266 が
 * 関数の書き方の対照群を足した分だけ上げた。**下げてはならない**）。抽出は
 * `npx tsx scripts/check-design-reference-format.selftest.ts | tail -1` の出す値をそのまま置く。
 * **確認を減らす向きの書き換えは差分に現れる。**
 *
 * **下限を構造から導く語彙がこの検査には無い**（115.222 は本体の検査種別の直和型から導けた）。
 * 導けないため件数で貼る。
 */
const MINIMUM_TOTAL_CASES = 87;

/**
 * 対照群そのものが在ることの関門（AI運用7原則 第3原則。タスク 115.252）
 *
 * 是正前の実測（2026-09-03）: 四つの検出の対照群は既存の要素側の確認が捕まえたが、`STRUCTURAL` を空にすると
 * **48/48 緑・EXIT=0**（守り手自身が `STRUCTURAL` の中に居るため自分を守れない）。
 * `main()` の中の `groups` を空にすると **0/0 緑・EXIT=0**。
 *
 * **この関門は対照群の配列の要素として書かない。** 要素として持つ形——本ファイルの
 * `STRUCTURAL` に載っていた `checkControlGroupsAreNotEmpty()` がまさにそれ——は、**配列ごと空にすると関門も
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
  if (negatives < MINIMUM_NEGATIVE_CONTROLS) {
    problems.push(
      `陰性対照が ${negatives} 件しかありません（宣言の下限は ${MINIMUM_NEGATIVE_CONTROLS} 件）。` +
        '陰性対照を削ったのなら下限も同じ差分で下げること。'
    );
  }

  const total = groups.reduce((sum, group) => sum + group.cases.length, 0);
  if (total < MINIMUM_TOTAL_CASES) {
    problems.push(
      `確認の総数が ${total} 件しかありません（宣言の下限は ${MINIMUM_TOTAL_CASES} 件）。` +
        '確認を削ったのなら下限も同じ差分で下げること。'
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
      title: '本番コード: 捕捉しなければならない書き方',
      cases: MUST_DETECT,
    },
    {
      title: '本番コード: 捕捉してはならない書き方（過検出）',
      cases: MUST_NOT_DETECT,
    },
    {
      title: '設計文書: 捕捉しなければならない書き方',
      cases: MUST_DETECT_IN_DESIGN,
    },
    {
      title: '設計文書: 捕捉してはならない書き方（過検出）',
      cases: MUST_NOT_DETECT_IN_DESIGN,
    },
    {
      title: '関数の書き方の対照群（抽出と最上位の束縛の実測）',
      cases: FUNCTION_FORM_CONTROLS,
    },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 設計文書への行番号参照 検出規則 自己検査 (scripts/check-design-reference-format.selftest.ts)'
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
}

main();
