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
  collectDesignDocuments,
  DESIGN_DOC_NAME,
  isProductionReference,
  mentionsProductionSource,
  run,
  scanDocument,
  scanLine,
  SPEC_DIR,
} from './check-design-code-reference-format.js';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, '..');

/** 検査本体。挙動検査ではこれをサブプロセスとして起動する */
const ENTRY_NAME = 'check-design-code-reference-format.ts';
const ENTRY_PATH = path.join(SCRIPTS_DIR, ENTRY_NAME);

/**
 * `tsx` の起動口。見つからない場合は「確認できない」であって合格ではないため、
 * 呼び出し側で失敗として扱う（第3原則: 前提が満たせないときに検査を無効化しない）。
 */
const TSX_CLI = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

/** 注釈を取り除いた本体のソース（実行される部分だけを見るため） */
function readExecutableSource(): string {
  return fs
    .readFileSync(ENTRY_PATH, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
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
 * 抽出（`DECLARATION`）が本体から拾える関数宣言の一覧と、絞り込みの検査がそれを
 * どう見張るかの台帳（タスク 115.230）。拾う綴りと、拾えずに素通りする書き方は
 * 後述する。
 *
 * `checkNoFindingsNarrowing` の `bodies` は「見張る側」の宣言である。**見張る側だけを
 * 置くと、そこから 1 本抜けても何も起きない。** タスク 115.230 が是正したのがこれで、
 * 行単位の検出の中核である `scanLine` は `bodies` に無く、冒頭へ
 * `if (lineText.includes('画像削除')) return [];` を足しても自己検査は 71/71 緑のまま
 * 素通りした（2026-09-01 に実測）。
 *
 * そこで台帳を**二つ目の宣言**として置き、次の三者が双方向で一致することを要求する。
 *
 *   (a) 本体のソースに実在し、かつ抽出（`DECLARATION`）の綴りに合う関数宣言
 *   (b) 本台帳
 *   (c) `checkNoFindingsNarrowing` の `bodies` のラベルと見張り方
 *
 * これにより、`bodies` からの取り落としも、台帳に載る関数の改名・撤去も失敗になる。
 *
 * **新設**をどこまで失敗にできるかは、抽出（`DECLARATION`）が拾う綴りで決まる。拾うのは
 * 「注釈を取り除いた本体で、**行頭**から `export` / `default` / `async` を任意に前置した
 * `function` ＋名前＋`(` または `<`」という綴りだけである（差し戻し1回目で `export` /
 * `async` を、2回目で `default` と `<` を足した）。**この綴りに合う宣言の新設は失敗になる。**
 * 合わない書き方は**この抽出では**捕らえない（最上位の束縛の禁止形が別に捕らえる形は
 * 下に挙げる）。どちらも下に実測を挙げる。網羅の主張はしない——
 * 「関数を書けるすべての形」は数え上げられないため、測った形だけを名指しで書く。
 *
 * 是正の前後で、次の五形をそれぞれ本体の最上位（`const invokedPath =` の直前）へ足して
 * 実測した（2026-09-01。是正前は五形とも自己検査 71/71 緑・兄弟 56/56 緑で素通りしていた）。
 *
 *   - `export async function sneakA(lineText: string): Promise<string[]> { ... }` を足す →
 *     自己検査 71 件中 1 件が落ちる。「本体に台帳へ載っていない関数がある: sneakA」
 *     （兄弟でも 56 件中 1 件、同じ文言）
 *   - `const sneakB = function (lineText: string): string[] { ... };` を足す →
 *     自己検査 71 件中 1 件が落ちる。「最上位に関数を値として束ねる宣言がある
 *     （アロー関数・関数式）」（兄弟でも 56 件中 1 件、同じ文言）
 *   - `= (` の直後で改行する複数行のアロー（`const sneakC = (` / `  lineText: string` /
 *     `): string[] => { ... };`）を足す → 自己検査 71 件中 1 件が落ちる。文言は上と同じ
 *     （兄弟でも 56 件中 1 件）
 *   - `export default function sneakF(lineText: string): string[] { ... }` を足す →
 *     自己検査 71 件中 1 件が落ちる。「本体に台帳へ載っていない関数がある: sneakF」
 *     （兄弟でも 56 件中 1 件、同じ文言）。差し戻し2回目の指摘で `default ` を足すまでは
 *     `(?:export )?` に合わず 71/71 緑だった
 *   - `function sneakG<T>(value: T): T[] { ... }` を足す → 自己検査 71 件中 1 件が落ちる。
 *     「本体に台帳へ載っていない関数がある: sneakG」（兄弟でも 56 件中 1 件、同じ文言）。
 *     差し戻し2回目の指摘で `\s*\(` を `\s*[<(]` へ広げるまでは緑だった
 *
 * **捕らえない範囲**（上の綴りに合わない書き方。網羅ではなく、実際に測った形の列挙である）。
 * いずれも 2026-09-01 に本体の最上位へ足して実測し、自己検査 71/71 緑・兄弟 56/56 緑の
 * ままだった。
 *
 *   - モジュール最上位での**再代入**で既存の関数を包み直す形。宣言でも束縛でもない。
 *     実際に検出を落とすところまで測った値は `checkNoFindingsNarrowing` の注釈に記す
 *   - 最上位のクラスの静的メソッド
 *     `class SneakClass { static sneakD(lineText: string): string[] { ... } }`。
 *     行頭が `function` ではない
 *   - 分割代入の束縛 `const { sneakE } = { sneakE: function (...) { ... } };`。
 *     最上位の禁止形は `const` の次に識別子を要求するため、`{` で始まる形は外れる
 *   - 文としての名前付き即時実行 `(function sneakH(): void { ... })();`。行頭が `(` である
 *
 * これらは `_Boundary: 絞り込みの検査が監視する関数の範囲_` の外であり、本タスクでは塞がない。
 *
 * **取り違える範囲**（綴りだけを見ることの代償。いずれも 2026-09-01 に実測）。
 *
 *   - 捕らえた形（本体の `const invokedPath =` の直前へ足して 2026-09-01 に実測。いずれも
 *     自己検査 71 件中 1 件・兄弟 56 件中 1 件が落ち、文言はすべて「最上位に関数を値として
 *     束ねる宣言がある（アロー関数・関数式）。台帳へ載る function 宣言で書くこと」である）。
 *     `const sneakB = function (` の関数式、`const sneakC = (` で改行する複数行のアロー、
 *     `const sneakX = (a: string,` で改行する複数行のアロー、
 *     `const sneakY = (0, (l: string): string[] => [l]);` のカンマ演算子、
 *     `const sneakY2 = (0, function (l: string): string[] { return [l]; });`、
 *     `const sneakY3 = (0,` で改行するカンマ演算子、
 *     `const sneakYstr = ('x', (l: string): string[] => [l]);`、
 *     `const sneakZ = (0, scanLine);` の参照束縛、
 *     `const sneakW = ('' === '' ? (l: string): string[] => [l]` で始まる三項
 *     （第一項が `1 ?` の数値・`` `x` ? `` のテンプレートリテラルの形も同じ）
 *   - 残す偽陽性: `\(` の枝は `= (` を関数の始まりと見なすため、関数でない括弧も落とす。
 *     `const answerOffset = (1 + 2) * 3;`、`const joined = ('a' + 'b');`、
 *     ``const tagged = (`a` + `b`);``、`const defaults = ({ limit: 3, offset: 0 });` は
 *     同じ位置へ足すと自己検査 71 件中 1 件・兄弟 56 件中 1 件が落ちる（2026-09-01 に実測）。
 *     文言は上と同じで、これらの行についての診断としては事実に反する。**赤へ倒れる向き**
 *     であり、実在する関数束縛の取り落としを隠す向きには働かないため、塞がずここに記す。
 *     最上位の `const` は `= (` を避けて書けば足りる
 *   - 塞がない選択の根拠: `\(` の枝を ``\((?!\s*[\d'"`])`` へ絞ると
 *     `const answerOffset = (1 + 2) * 3;` は自己検査 71/71 緑・兄弟 56/56 緑になる。だが
 *     同じ絞りの下で、上の `sneakY` / `sneakY2` / `sneakY3` / `sneakYstr` / `sneakW` /
 *     第一項が数値の三項 / 第一項がテンプレートリテラルの三項 / `sneakZ` の八形すべてが
 *     自己検査 71/71 緑・兄弟 56/56 緑で素通りした（2026-09-01 に、絞った状態で八形を
 *     同じ位置へ足して実測）。**偽陽性は赤で気付けるが、素通りは黙って通る。**
 *     この検査は最上位に絞り込みを隠す場所を作らせないためにあるので、赤へ倒れる誤りを
 *     残し、緑へ倒れる誤りを増やす絞り込みは入れない
 *   - 幻の宣言: 抽出は構文ではなく行頭の綴りを見るため、テンプレートリテラルの中で列 0 に
 *     `function 名(` が現れると実在の宣言として読む。そのようなリテラルを足すと自己検査
 *     71 件中 1 件が落ち「本体に台帳へ載っていない関数がある: phantom」となる
 *     （兄弟でも 56 件中 1 件、同じ文言）。**赤へ倒れる向き**であり、実在する関数の
 *     取り落としを隠す方向には働かないため、塞がずここに記す
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
  const source = readExecutableSource();

  // 前提が満たせないときは合格ではなく失敗（第3原則）
  if (EXECUTABLE_FUNCTION_INVENTORY.length === 0) {
    failures.push('関数の台帳が空である。監視対象が無い状態を合格にしてはならない');
  }
  if (monitored.length === 0) {
    failures.push('絞り込みの検査が本体を一つも見張っていない');
  }

  const declared: string[] = [];
  const DECLARATION =
    /^(?:export )?(?:default )?(?:async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\s*[<(]/gm;
  let match: RegExpExecArray | null;
  while ((match = DECLARATION.exec(source)) !== null) {
    const name = match[1];
    if (name !== undefined) declared.push(name);
  }
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
  // ため、置くこと自体を禁じる。`= (` の直後で改行する複数行のアローも `\(` の枝で捕らえる。
  // この枝は `= (` を関数の始まりと見なすため、`const defaults = ({ limit: 3, offset: 0 });`
  // のような関数でない括弧も落とす（偽陽性。赤へ倒れる向きなので塞がない。実測は台帳に記す）。
  // 掛からない形として、最上位での再代入・クラスの静的メソッド・分割代入の束縛・文としての
  // 名前付き即時実行を実測した（網羅ではない）。いずれも本タスクの境界の外である。
  // 実測値と当てた変異は台帳 EXECUTABLE_FUNCTION_INVENTORY と
  // `checkNoFindingsNarrowing` の注釈に記す
  if (
    /^(?:export )?(?:const|let|var) [A-Za-z_$][A-Za-z0-9_$]*(?::[^=\n]*)? = (?:async )?(?:function\b|\(|[A-Za-z_$][A-Za-z0-9_$]*\s*(?::[^=\n]*)?=>)/m.test(
      source
    )
  ) {
    failures.push(
      '最上位に関数を値として束ねる宣言がある（アロー関数・関数式）。台帳へ載る function 宣言で書くこと'
    );
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
 * 本検査も緑で素通りした（2026-09-01 に実測）。同じ 1 行を現在の形に当てると
 * 自己検査は 71 件中 1 件が落ち、内訳は
 * 「scanLine が検出結果／走査対象へ想定外の操作をしている」の 1 件である
 * （2026-09-01 に実測）。表の `行` 列を拾う `scanTableLineColumns` も同型で、
 * 冒頭へ `if (lines.some((line) => line.includes('画像削除'))) return [];` を足すと、
 * 現在の形では同じく 71 件中 1 件が落ちる（2026-09-01 に実測）。
 *
 * **見張る範囲は、抽出（`DECLARATION`）が本体から拾える関数宣言——注釈を取り除いた本体の
 * 行頭から `export` / `default` / `async` を任意に前置した `function` ＋名前＋
 * `(` または `<` ——であり、台帳 `EXECUTABLE_FUNCTION_INVENTORY` と双方向で一致させる。**
 * その綴りの範囲で、取り落とし・改名・撤去・新設が失敗になる。当てた五形と、綴りに合わず
 * 緑のままだった形（最上位の再代入・クラスの静的メソッド・分割代入の束縛・文としての
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
 * - 絞り込みに使える操作（`filter` / `slice` / `splice` / `find` / `some` / `includes` /
 *   `Set` / `Map` / `continue` / `delete`）が `run` / `scanDocument` /
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
 *   対照の行は前後とも 1 件——にもかかわらず、自己検査は 71/71 緑のままである
 *   （2026-09-01 に実測）。`_Boundary: 絞り込みの検査が監視する関数の範囲_` の外であるため
 *   本タスクでは塞がず、後続として起票する。最上位で捕らえない形はこの再代入だけではない。
 *   クラスの静的メソッド・分割代入の束縛・文としての名前付き即時実行も 2026-09-01 に
 *   実測して自己検査 71/71 緑（兄弟 56/56 緑）であり、綴りと実測値は台帳
 *   `EXECUTABLE_FUNCTION_INVENTORY` の注釈に挙げる（網羅の主張ではない）
 */
function checkNoFindingsNarrowing(): string[] {
  const failures: string[] = [];
  const source = readExecutableSource();

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

  // 走査件数の下限。spec ディレクトリごと消して件数を減らす形を塞ぐ
  const MINIMUM_DESIGN_DOCUMENTS = 13;
  if (documents.length < MINIMUM_DESIGN_DOCUMENTS) {
    failures.push(
      `走査対象が ${MINIMUM_DESIGN_DOCUMENTS} 件を下回っている（${documents.length} 件）。` +
        'spec の追加で増えることはあっても減ることはない'
    );
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

function main(): void {
  const groups: Array<{ title: string; cases: Case[] }> = [
    { title: '捕捉しなければならない書き方（是正前の実物）', cases: MUST_DETECT },
    { title: '捕捉してはならない書き方（過検出）', cases: MUST_NOT_DETECT },
    { title: '走査対象と前提条件', cases: STRUCTURAL },
  ];

  console.log(
    '🔍 本番コードへの行番号参照 検出規則 自己検査 (scripts/check-design-code-reference-format.selftest.ts)'
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
