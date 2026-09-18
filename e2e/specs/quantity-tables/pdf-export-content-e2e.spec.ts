/**
 * @fileoverview 数量表PDF出力の**生成物の中身**を主張する E2E テスト（REQ-26）
 *
 * ## 本ファイルが在る理由（タスク 100.5 (a)、利用者の裁定 2026-09-18）
 *
 * REQ-26.2 / 26.3 / 26.4 / 26.6 / 26.7 は「PDF生成は Canvas 描画と外部 PDF ライブラリに
 * 依存するため統合テストで検証」を理由に `e2e/requirement-exclusions.json` へ在籍していた。
 * この理由は**本機能の中に反例がある**——
 * `e2e/specs/quantity-tables/quantity-count-persistence-e2e.spec.ts` は REQ-47.17 のために、
 * PDF出力でダウンロードされた jsPDF の生成物を `pdfjs-dist` の `getTextContent()` で読み、
 * 計算方法欄の文字列を主張している。本ファイルは同じ流儀を 26.2 / 26.3 / 26.4 / 26.6 / 26.7
 * へ広げ、**条文を直接主張する判定を置いたうえで除外を取り下げる**（tasks.md 83.1 の作法）。
 *
 * ## 生成物の読み方
 *
 * jsPDF が埋め込む Noto Sans JP サブセットフォントは ToUnicode CMap を持つため、
 * `getTextContent()` で日本語テキストを復元できる。本ファイルは文字列だけでなく
 * **各テキストの座標（`transform[4]` / `[5]`）** と、**各ページの画像描画命令の件数および
 * その配置**（`getOperatorList()` の `paintImageXObject` 系と、その直前の `OPS.transform`）も
 * 読む。座標は「テーブル形式」（26.7）を、画像命令の件数は「写真の表示」（26.4）と
 * 「写真なし時の省略」（26.6）を、画像の配置は「写真を数量項目一覧の前に配置する」（26.5）を、
 * 文字列だけでは届かない粒度で主張するために要る。
 *
 * ## 判定が恒真にならないための作り
 *
 * - **26.6 は不在の主張である**。生成物が空・PDFが生成されていない・読み取り器が死んでいる
 *   場合にも成立してしまう。そこで**同じ生成物・同じ読み取り器の肯定側と対で**主張する——
 *   写真ありグループのページでは画像命令が1件以上あり写真コメントが在ること、写真なし
 *   グループのページでも**数量項目一覧は在る**こと（＝ページ自体が生成されている）を
 *   併せて主張する。読み取り器が死んでいれば肯定側が先に落ちる。
 * - **26.3（並び順）も両方の不在で成立しうる**。そこで2つのグループ名が**それぞれ
 *   ちょうど1ページに現れる**ことを先に固定してから、そのページ番号の順序を主張する。
 *   前提では「作成順と並び順が食い違う」状態（後から作ったグループを先頭へ）を作る。
 *   **ただし、本番では配列順が displayOrder と一致するため、「並べ替えを見ずに配列順のまま
 *   出す」変異ではこの判定は落ちない**（`pages/quantityTableEditReducer.ts` の
 *   `renumberGroups` が配列の添字で displayOrder を採番し直し、保存も配列順を正とする。
 *   タスク100.5 で実測）。この判定が捉えるのは、並び順に**従わない**順序で出す実装である
 *   （比較子を逆順にする変異で落ちることを実測した）。
 * - 座標の主張は**観測したヘッダーの位置を基準に**組み立てており、レイアウト定数
 *   （列幅・余白）をテスト側へ写していない。列幅を変えただけで落ちることはない。
 *
 * ## 兄弟の 26.5 / 26.8 / 26.12 を併せて置いた理由（タスク 100.5 の充足条件4）
 *
 * 26.5 / 26.8 / 26.12 は除外に在籍しておらず、**代替検証に挙がっているのと同一の Vitest
 * ファイル（`frontend/src/__tests__/services/export/QuantityTablePdfExportService.test.ts`）の
 * 被覆印だけで被覆済みと数えられていた**（2026-09-18、`scripts/check-requirement-coverage.ts` の
 * `extractFileCoverage` を `e2e` / `frontend/src` / `backend/src` へ当てて実測。逐語 grep では
 * 数えていない）。(a) の裁定が 26.2 / 26.3 / 26.4 / 26.6 / 26.7 について「PDF テキストを主張する
 * E2E を置いて取り下げる」と決まった以上、**同じ生成物の同じ側面を述べる兄弟を単体印だけで
 * 数え続けるのは、100.5 が解消しようとしている不整合そのものである**。3件はいずれも本ファイルが
 * すでに読んでいる生成物から主張できるため、ここへ判定を置いた（26.8 のためだけに写真ありグループの
 * 数量項目を12行へ増やし、テーブルがページをまたぐ前提を作っている）。
 *
 * ## 変異で落ちることの実測（タスク 100.5、2026-09-18）
 *
 * 除外の取り下げと被覆印の掲示の前に、本番へ変異を当てて各判定が落ちることを測った。
 * 測定のたびに `npm run test:docker:build -- --force-recreate` の終了コード・配信バンドルの
 * md5・配信物へ埋めたマーカーの3点を照合している（ミニファイでマーカーが畳まれる罠を避けるため、
 * マーカーは `window` への代入という副作用の形で置いた）。直列（serial）の describe では
 * 先に落ちた判定が後続を飛ばすため、**判定ごとに `-g "事前準備|REQ-26.N"` で絞って測った**。
 *
 * - 変異ビルドA: 表紙のタイトル文字列の差し替え → **26.2** が落ちる。`displayOrder` の
 *   比較子を逆順 → **26.3** が落ちる。写真が無いグループにも写真を描く（`?? ` で代替の
 *   データ URL を与える）→ **26.6** が落ちる。写真とコメントをページ下端へ動かす
 *   → **26.5** が落ちる。ページ番号の開始ページを表紙込みにする → **26.12** が落ちる。
 *   このビルドで **26.4 / 26.7 / 26.8 は緑のまま**であり、判定が互いに独立していることを示す。
 * - 変異ビルドB: 写真コメントの描画文字列を空にする → **26.4**（コメントの主張）と
 *   **26.6 の対照**（＝読み取り器が生きていることの主張）が落ちる。**26.6 が不在の主張だけで
 *   通ることがない**ことの実測である。行の値を列と対応させずに描く → **26.7** が落ちる。
 *   改ページ後の列見出しの再描画を除く → **26.8** が落ちる。
 *   このビルドで **26.2 / 26.3 / 26.12 は緑のまま**である。
 *
 * Requirements coverage (quantity-table-generation):
 * - REQ-26.2: PDFの表紙に「数量表」タイトル・数量表名・工事名・作成日を表示する
 * - REQ-26.3: 表紙以降のページに数量グループごとのセクションを並び順で表示する
 * - REQ-26.4: 数量グループのセクションに名前・注釈付き写真・写真コメント・数量項目一覧を表示する
 * - REQ-26.5: 写真が紐づいている場合に注釈付き写真と写真コメントを数量項目一覧の前に配置する
 * - REQ-26.6: 写真が紐づいていない場合に写真・コメントセクションを省略し数量項目一覧のみを表示する
 * - REQ-26.7: 数量項目一覧を11列のテーブル形式で出力する
 * - REQ-26.8: 数量項目一覧のテーブルがページをまたぐ場合に新しいページの先頭へ列名を繰り返す
 * - REQ-26.12: PDFの各ページにページ番号を表示する（表紙を除く）
 *
 * @module e2e/specs/quantity-tables/pdf-export-content-e2e.spec
 */

import { test, expect, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  addQuantityItemRows,
  attachPhotoToGroup,
  createTestProjectWithName,
  createTestQuantityTable,
  fillItemRequiredFields,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

// ============================================================================
// 前提に使う値（いずれも実行ごとに一意、かつ列見出しの語を部分文字列として含まない）
// ============================================================================

/** 写真を紐づけるグループの名前（作成順は1件目、並び順は2番目へ動かす） */
const PHOTO_GROUP_NAME = 'PDF検証グループ甲';
/** 写真を紐づけないグループの名前（作成順は2件目、並び順は1番目になる） */
const NO_PHOTO_GROUP_NAME = 'PDF検証グループ乙';
/** 写真に付けるコメント（REQ-26.4 の「写真コメント」／REQ-26.6 の対照） */
const PHOTO_COMMENT = 'PDF検証用の写真コメント';
/** 写真なしグループの数量項目の名称（当該ページに数量項目一覧が在ることの目印） */
const NO_PHOTO_ITEM_NAME = 'ジュリエット値';

/**
 * 写真ありグループへ足す詰め物の数量項目の名称（REQ-26.8 の前提）。
 *
 * 写真ありグループのセクションは写真の高さの分だけテーブルの開始位置が下がるため、
 * 1行だけではページをまたがない。**テーブルがページをまたぐという前件を作るためだけに**
 * 行を足す。何行目でまたぐかはレイアウト次第であるため、判定側は「何行目か」を
 * 固定せず「**両方のページに分かれて出ており、取りこぼしが無い**」ことで主張する。
 *
 * 名称は互いの部分文字列にならないよう2桁でそろえてある。
 */
const PAGE_BREAK_ITEM_NAMES: readonly string[] = Array.from(
  { length: 11 },
  (_unused, index) => `PDF改ページ項目${String(index + 1).padStart(2, '0')}`
);

/**
 * 11列すべてを埋める数量項目の値。
 *
 * 添字は `TABLE_COLUMNS`（`QuantityTablePdfExportService.ts`）の列順に対応する。
 * 「計算方法」は既定値「標準」（REQ-8.1）、「数量」は入力した数値がそのまま出る。
 * 列見出しの語（大項目・中項目…）を部分文字列として含まない値にしてあるのは、
 * 見出しと値を文字列だけで取り違えないためである。
 */
const FULL_ITEM = {
  majorCategory: 'アルファ値',
  middleCategory: 'ブラボー値',
  minorCategory: 'チャーリー値',
  customCategory: 'デルタ値',
  workType: 'エコー値',
  name: 'フォクストロット値',
  specification: 'ゴルフ値',
  // 単位は全角3文字までしか受け付けない（REQ-13.3 / field-validation.ts の FIELD_LIMITS）
  unit: 'ホテル',
  remarks: 'インディア値',
  quantityInput: '12',
} as const;

/** 数量項目一覧の列見出し（条文が列挙する11列。この順序そのものが REQ-26.7 の主張である） */
const TABLE_COLUMN_LABELS = [
  '大項目',
  '中項目',
  '小項目',
  '任意分類',
  '工種',
  '名称',
  '規格',
  '計算方法',
  '数量',
  '単位',
  '備考',
] as const;

/** 列見出しに対応する、数量項目の行に現れる値（「数量」だけは数値の字面なので正規表現で照合する） */
const TABLE_COLUMN_VALUES: readonly (string | RegExp)[] = [
  FULL_ITEM.majorCategory,
  FULL_ITEM.middleCategory,
  FULL_ITEM.minorCategory,
  FULL_ITEM.customCategory,
  FULL_ITEM.workType,
  FULL_ITEM.name,
  FULL_ITEM.specification,
  '標準',
  /^12(\.0+)?$/,
  FULL_ITEM.unit,
  FULL_ITEM.remarks,
];

// ============================================================================
// 生成物（PDF）の読み取り
// ============================================================================

/** PDF 内の1つのテキスト片と、その描画位置（PDF ユーザー空間。y は下端からの高さ） */
interface PdfTextPiece {
  str: string;
  x: number;
  y: number;
}

/**
 * ページ内に描かれた画像の配置（PDF ユーザー空間。x / y は画像の左下）。
 *
 * jsPDF は画像を `q … cm … Do … Q` の形で描くため、画像描画命令の直前の
 * 座標変換命令（`OPS.transform`）の平行移動成分が画像の左下になる。
 * 直前の変換が見つからない場合は `NaN` を置く——**黙って読み飛ばすと
 * 「画像は在るが位置は測っていない」状態が判定側から見えなくなる**。
 * `NaN` はいずれの大小比較も満たさないため、判定は必ず落ちる。
 */
interface PdfImagePlacement {
  x: number;
  y: number;
}

/** PDF の1ページ分の読み取り結果 */
interface PdfPageContent {
  pageNumber: number;
  /** ページ内のテキスト片（描画順） */
  pieces: PdfTextPiece[];
  /** ページ内のテキストを連結したもの（文字列の在・不在の判定に使う） */
  text: string;
  /** ページ内の画像描画命令の件数（写真が描かれたかどうかの観測点） */
  imagePaintCount: number;
  /** ページ内の画像の配置（件数は `imagePaintCount` と一致する） */
  imagePlacements: PdfImagePlacement[];
}

/**
 * 画像を描く描画命令のコード。
 *
 * pdfjs-dist の版によって在る命令が異なるため、存在するものだけを集める。
 * 集まらなければ観測点が無いということなので、判定側で失敗させる
 * （件数0を「写真が無い」と読み違えないため）。
 */
const IMAGE_PAINT_OPS: number[] = [
  'paintImageXObject',
  'paintJpegXObject',
  'paintInlineImageXObject',
  'paintImageXObjectRepeat',
]
  .map((name) => (pdfjs.OPS as unknown as Record<string, number | undefined>)[name])
  .filter((code): code is number => typeof code === 'number');

/**
 * ダウンロード済み PDF を1ページずつ読み、テキスト片・座標・画像描画命令の件数を返す。
 */
async function readPdf(pdfFilePath: string): Promise<PdfPageContent[]> {
  const bytes = new Uint8Array(fs.readFileSync(pdfFilePath));
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;

  const pages: PdfPageContent[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const content = await page.getTextContent();
    const pieces: PdfTextPiece[] = [];
    for (const item of content.items) {
      // getTextContent() は TextItem（str と transform を持つ）と TextMarkedContent を混在して返す
      if (!('str' in item) || !('transform' in item)) continue;
      pieces.push({
        str: item.str,
        x: item.transform[4] as number,
        y: item.transform[5] as number,
      });
    }

    const operatorList = await page.getOperatorList();
    const imagePaintCount = operatorList.fnArray.filter((fn: number) =>
      IMAGE_PAINT_OPS.includes(fn)
    ).length;

    // 画像描画命令ごとに、直前の座標変換の平行移動成分を配置として記録する
    const imagePlacements: PdfImagePlacement[] = [];
    let latestTransform: number[] | null = null;
    for (let opIndex = 0; opIndex < operatorList.fnArray.length; opIndex++) {
      const fn = operatorList.fnArray[opIndex] as number;
      if (fn === pdfjs.OPS.transform) {
        latestTransform = operatorList.argsArray[opIndex] as number[];
      }
      if (IMAGE_PAINT_OPS.includes(fn)) {
        imagePlacements.push({
          x: latestTransform?.[4] ?? Number.NaN,
          y: latestTransform?.[5] ?? Number.NaN,
        });
      }
    }

    pages.push({
      pageNumber,
      pieces,
      text: pieces.map((piece) => piece.str).join(''),
      imagePaintCount,
      imagePlacements,
    });
  }
  return pages;
}

/** 与えた文字列を含むページの番号をすべて返す */
function pageNumbersContaining(pages: PdfPageContent[], needle: string): number[] {
  return pages.filter((page) => page.text.includes(needle)).map((page) => page.pageNumber);
}

/** ページ番号でページを取り出す（無ければその場で失敗する） */
function pageAt(pages: PdfPageContent[], pageNumber: number): PdfPageContent {
  const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
  assertPrepared(page, `PDF の ${pageNumber} ページ目`);
  return page;
}

/**
 * 列見出しがそろった行をページから取り出す（11の見出しが同じ高さに並ぶ行）。
 *
 * 「同じ高さ」は y の一致で判定する。jsPDF は同一行の各セルを同じ y で描くため、
 * 丸め誤差の範囲（0.5pt）で一致する。
 *
 * **見つからなければ早抜けする形（`if (!hit) break`）は採らない。** 観測した結果を
 * 条件にして黙って抜ける構造は、検証の放棄をヘルパーの中へ隠す
 * （`scripts/check-e2e-assertion-guards.ts` の T5）。そろわなかった見出しは
 * 配列に現れないだけであり、**そろっているかどうかは呼び出し側が主張する**。
 */
function completeTableHeaderRows(page: PdfPageContent): PdfTextPiece[][] {
  const firstLabel = TABLE_COLUMN_LABELS[0];
  return page.pieces
    .filter((piece) => piece.str === firstLabel)
    .map((anchor) =>
      TABLE_COLUMN_LABELS.map((label) =>
        page.pieces.find((piece) => piece.str === label && Math.abs(piece.y - anchor.y) < 0.5)
      ).filter((piece): piece is PdfTextPiece => piece !== undefined)
    )
    .filter((row) => row.length === TABLE_COLUMN_LABELS.length);
}

// ============================================================================
// 前提の組み立て
// ============================================================================

/** 数量グループの名前を書き換え、画面へ反映されたことまで主張する */
async function renameGroup(groupCard: Locator, from: string, to: string): Promise<void> {
  const nameHeading = groupCard.getByRole('button', { name: from });
  await expect(nameHeading, `前提: グループ名「${from}」が表示される`).toBeVisible({
    timeout: getTimeout(10000),
  });
  await nameHeading.click();

  const nameInput = groupCard.getByLabel('グループ名を編集');
  await expect(nameInput, '前提: グループ名が編集可能になる').toBeVisible({
    timeout: getTimeout(10000),
  });
  await nameInput.fill(to);
  await nameInput.press('Enter');

  await expect(
    groupCard.getByRole('button', { name: to }),
    `前提: 変更後のグループ名「${to}」が画面へ反映される`
  ).toBeVisible({ timeout: getTimeout(10000) });
}

/** 補完付き入力欄へ値を入れ、保持されたことまで主張する（候補一覧は Escape で閉じる） */
async function fillAutocomplete(row: Locator, label: string, value: string): Promise<void> {
  const input = row.getByLabel(label, { exact: true });
  await expect(input, `前提: ${label}の入力欄が表示される`).toBeVisible({
    timeout: getTimeout(10000),
  });
  await input.fill(value);
  await input.press('Escape');
  await expect(input, `前提: ${label}の入力が保持される`).toHaveValue(value);
}

/** 数量項目行の11列すべてを埋める（計算方法は既定の「標準」のまま） */
async function fillItemAllColumns(row: Locator): Promise<void> {
  await fillAutocomplete(row, '大項目', FULL_ITEM.majorCategory);
  await fillAutocomplete(row, '中項目', FULL_ITEM.middleCategory);
  await fillAutocomplete(row, '小項目', FULL_ITEM.minorCategory);
  await fillAutocomplete(row, '任意分類', FULL_ITEM.customCategory);
  await fillAutocomplete(row, '工種', FULL_ITEM.workType);
  await fillAutocomplete(row, '名称', FULL_ITEM.name);
  await fillAutocomplete(row, '規格', FULL_ITEM.specification);
  await fillAutocomplete(row, '単位', FULL_ITEM.unit);
  await fillAutocomplete(row, '備考', FULL_ITEM.remarks);

  const quantityInput = row.getByLabel(/数量/);
  await expect(quantityInput, '前提: 数量の入力欄が表示される').toBeVisible({
    timeout: getTimeout(10000),
  });
  await quantityInput.fill(FULL_ITEM.quantityInput);
  await expect(quantityInput, '前提: 数量の入力が保持される').toHaveValue(FULL_ITEM.quantityInput);
}

/** 本番と同じ規則で作成日の字面を作る（`QuantityTableEditPage` の handlePdfExport と同一） */
function formatCreatedDate(now: Date): string {
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

// ============================================================================
// 検証
// ============================================================================

test.describe('REQ-26: 数量表PDF出力の生成物の内容', () => {
  test.describe.configure({ mode: 'serial' });

  let testProjectName: string | null = null;
  let testTableId: string | null = null;
  let testTableName: string | null = null;
  /** 事前準備で読み取った PDF。判定はこれを読む */
  let pdfPages: PdfPageContent[] = [];
  /** PDF を生成した時刻（作成日の字面の照合に使う） */
  let pdfGeneratedAt: Date | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test.describe('事前準備', () => {
    test('プロジェクト・注釈付き写真・数量表を作成する', async ({ page }) => {
      const project = await createTestProjectWithName(page, 'PDF内容検証PJ');
      testProjectName = project.name;

      // 写真選択ダイアログの候補は注釈レコードを持つ写真のみであるため、注釈まで保存する
      const seeded = await seedSurveyPhotosWithComments(
        page,
        project.id,
        'PDF内容検証調査',
        [PHOTO_COMMENT],
        'all'
      );
      expect(seeded.annotatedImageIds.length, '前提: 注釈付きの写真が1枚用意される').toBe(1);

      // 数量表名は「数量表」を部分文字列として含まない接頭辞にする。含めてしまうと、
      // 表紙のタイトル「数量表」の主張が数量表名の一致だけで成立し、タイトルを
      // 描かなくなっても緑のままになる（恒真化する）。
      const table = await createTestQuantityTable(page, project.id, 'PDF内容検証ダイチョウ');
      testTableId = table.id;
      testTableName = table.name;
    });

    test('写真ありグループと写真なしグループを作り、作成順と並び順を食い違わせて保存する', async ({
      page,
    }) => {
      await openQuantityTableEdit(page, testTableId);

      // 1件目: 写真あり。先頭行は11列すべてを埋め、以降は REQ-26.8 のための詰め物
      const photoGroup = await addQuantityGroup(page);
      const photoGroupRows = await addQuantityItemRows(
        photoGroup,
        1 + PAGE_BREAK_ITEM_NAMES.length
      );
      await fillItemAllColumns(photoGroupRows.first());
      for (let index = 0; index < PAGE_BREAK_ITEM_NAMES.length; index++) {
        await fillItemRequiredFields(photoGroupRows.nth(index + 1), {
          name: PAGE_BREAK_ITEM_NAMES[index]!,
        });
      }
      await renameGroup(photoGroup, 'グループ 1', PHOTO_GROUP_NAME);
      await attachPhotoToGroup(page, photoGroup, 0);

      // 2件目: 写真なし・数量項目1行
      const noPhotoGroup = await addQuantityGroup(page);
      const noPhotoRows = await addQuantityItemRows(noPhotoGroup, 1);
      await fillItemRequiredFields(noPhotoRows.first(), { name: NO_PHOTO_ITEM_NAME });
      await renameGroup(noPhotoGroup, 'グループ 2', NO_PHOTO_GROUP_NAME);

      // 並び順を入れ替える。以降、作成順は［甲, 乙］だが並び順は［乙, 甲］である。
      // 配列の並びをそのまま出す実装では REQ-26.3 の判定が通らない。
      const groupCards = page.locator('[data-testid="quantity-group-card"]');
      await groupCards.first().getByRole('button', { name: '下へ移動' }).click();
      await expect(
        groupCards.first().getByRole('button', { name: NO_PHOTO_GROUP_NAME }),
        `前提: 並び替えで「${NO_PHOTO_GROUP_NAME}」が先頭になる`
      ).toBeVisible({ timeout: getTimeout(10000) });
      await expect(
        groupCards.last().getByRole('button', { name: PHOTO_GROUP_NAME }),
        `前提: 並び替えで「${PHOTO_GROUP_NAME}」が末尾になる`
      ).toBeVisible({ timeout: getTimeout(10000) });

      await saveQuantityTableDraft(page);
    });

    test('数量表をPDF出力し、生成物を読み取る', async ({ page }) => {
      expect(
        IMAGE_PAINT_OPS.length,
        '前提: 画像描画命令を読み取る観測点が pdfjs-dist に存在する'
      ).toBeGreaterThan(0);

      await openQuantityTableEdit(page, testTableId);

      const pdfButton = page.getByRole('button', { name: /PDF出力/ });
      await expect(pdfButton, '前提: PDF出力ボタンが表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
      pdfGeneratedAt = new Date();
      await pdfButton.click();
      const download = await downloadPromise;

      const downloadPath = await download.path();
      assertPrepared(downloadPath, 'ダウンロードされた PDF のパス');

      pdfPages = await readPdf(downloadPath);
      // 表紙1 + 写真なしグループ1 + 写真ありグループ2（12行がページをまたぐ。REQ-26.8 の前件）
      expect(pdfPages.length, '前提: 4ページの PDF が生成される').toBe(4);
    });
  });

  /**
   * @requirement quantity-table-generation/REQ-26.2
   *
   * 表紙（1ページ目）に4要素がそろうことを主張する。数量表名・工事名は実行ごとに
   * 一意であるため、固定文字列を焼き込んだ表紙では通らない。作成日は本番と同じ規則で
   * テスト側が独立に組み立てる。
   */
  test('表紙に「数量表」タイトル・数量表名・工事名・作成日が出力される (REQ-26.2)', async () => {
    assertPrepared(testTableName, '事前準備で作成した数量表の名称');
    assertPrepared(testProjectName, '事前準備で作成したプロジェクトの名称');
    assertPrepared(pdfGeneratedAt, 'PDF を生成した時刻');

    const cover = pageAt(pdfPages, 1);

    expect(cover.text.includes('数量表'), 'REQ-26.2: 表紙に「数量表」タイトルが出力される').toBe(
      true
    );
    expect(
      cover.text.includes(testTableName),
      `REQ-26.2: 表紙に数量表名「${testTableName}」が出力される`
    ).toBe(true);
    expect(
      cover.text.includes(testProjectName),
      `REQ-26.2: 表紙に工事名（プロジェクト名）「${testProjectName}」が出力される`
    ).toBe(true);
    expect(
      cover.text.includes(formatCreatedDate(pdfGeneratedAt)),
      `REQ-26.2: 表紙に作成日「${formatCreatedDate(pdfGeneratedAt)}」が出力される`
    ).toBe(true);
  });

  /**
   * @requirement quantity-table-generation/REQ-26.3
   *
   * 「並び順で表示する」は、両方のグループが出ていない状態でも順序の主張だけなら
   * 成立しうる。そこで**それぞれがちょうど1ページに現れる**ことを先に固定し、
   * そのうえでページ番号の前後を主張する。事前準備で作成順と並び順を食い違わせてあるため、
   * 並び順に従わない順序で出す実装（比較子を逆順にする等）では通らない。
   * なお本番では配列順が displayOrder と一致するので、「並べ替えを外して配列順のまま出す」
   * 変異は振る舞いを変えず、この判定も落ちない（ファイル先頭の注記を参照）。
   */
  test('表紙以降に数量グループのセクションが並び順で出力される (REQ-26.3)', async () => {
    const noPhotoPages = pageNumbersContaining(pdfPages, NO_PHOTO_GROUP_NAME);
    const photoPages = pageNumbersContaining(pdfPages, PHOTO_GROUP_NAME);

    expect(
      noPhotoPages,
      `REQ-26.3: 「${NO_PHOTO_GROUP_NAME}」のセクションがちょうど1ページに出力される`
    ).toHaveLength(1);
    expect(
      photoPages,
      `REQ-26.3: 「${PHOTO_GROUP_NAME}」のセクションがちょうど1ページに出力される`
    ).toHaveLength(1);

    // 表紙（1ページ目）以降であること
    expect(
      Math.min(noPhotoPages[0]!, photoPages[0]!),
      'REQ-26.3: グループのセクションは表紙の次のページ以降に出力される'
    ).toBeGreaterThan(1);

    // 画面上の並び順は［乙, 甲］（作成順は［甲, 乙］）
    expect(
      noPhotoPages[0]!,
      `REQ-26.3: 並び順が先の「${NO_PHOTO_GROUP_NAME}」が「${PHOTO_GROUP_NAME}」より前のページに出力される`
    ).toBeLessThan(photoPages[0]!);
  });

  /**
   * @requirement quantity-table-generation/REQ-26.4
   *
   * 条文が挙げる4要素を、同じページの中で一つずつ主張する。
   * 「注釈付き写真」は、注釈レコードを持つ写真だけが選択候補に現れる経路（REQ-4.3 / 19.2）で
   * 紐づけたうえで、当該ページに画像が描かれていることを描画命令の件数で主張する。
   *
   * **当該セクションのページはグループ名ではなく数量項目の名称で特定する。** グループ名で
   * 特定すると、グループ名が描かれなくなる変異のときに「ページが特定できない」という
   * 前提の失敗になり、条文が挙げる「数量グループ名」の要素を独立に観測できない
   * （実測で確認した）。`FULL_ITEM.name` の値は写真ありグループの項目にのみ与えてある。
   *
   * **ページを `FULL_ITEM.name` で特定している以上、「そのページが `FULL_ITEM.name` を
   * 含む」という主張は構造上つねに真であり、条文の主張として置いてはならない**
   * （独立レビューが恒真として差し戻した）。「数量項目一覧」の要素は、見出しがそろった
   * 行が1つ在ることと、**当該の項目が一覧の「名称」列の位置に現れる**ことで主張する。
   * 列の範囲は観測した見出しの位置から組み立てており、レイアウト定数は写していない。
   */
  test('数量グループのセクションにグループ名・写真・写真コメント・数量項目一覧が出力される (REQ-26.4)', async () => {
    const itemPages = pageNumbersContaining(pdfPages, FULL_ITEM.name);
    expect(
      itemPages,
      `前提: 数量項目「${FULL_ITEM.name}」を含むページが1つ特定できる`
    ).toHaveLength(1);
    const section = pageAt(pdfPages, itemPages[0]!);

    expect(
      section.text.includes(PHOTO_GROUP_NAME),
      `REQ-26.4: セクションに数量グループ名「${PHOTO_GROUP_NAME}」が出力される`
    ).toBe(true);
    expect(
      section.imagePaintCount,
      'REQ-26.4: セクションに紐づけられた注釈付き写真が出力される'
    ).toBeGreaterThan(0);
    expect(
      section.text.includes(PHOTO_COMMENT),
      `REQ-26.4: セクションに写真コメント「${PHOTO_COMMENT}」が出力される`
    ).toBe(true);
    const headerRows = completeTableHeaderRows(section);
    expect(
      headerRows.length,
      'REQ-26.4: セクションに数量項目一覧（11列の見出しがそろった行）が1つ出力される'
    ).toBe(1);

    // 「数量項目一覧に当該グループの数量項目が在る」を、一覧の「名称」列の位置で主張する。
    // ページに文字列が在るだけでは、ページ特定の前提と同じことを言い直すだけで恒真になる。
    const headerRow = headerRows[0]!;
    const nameIndex = TABLE_COLUMN_LABELS.indexOf('名称');
    const nameColumnLeft = headerRow[nameIndex]!.x - 0.5;
    const nameColumnRight = headerRow[nameIndex + 1]!.x - 0.5;
    const inNameColumn = section.pieces.filter(
      (piece) =>
        piece.y < headerRow[0]!.y &&
        piece.str === FULL_ITEM.name &&
        piece.x >= nameColumnLeft &&
        piece.x < nameColumnRight
    );
    expect(
      inNameColumn.length,
      `REQ-26.4: 数量項目一覧の「名称」列に当該グループの数量項目「${FULL_ITEM.name}」が出力される`
    ).toBe(1);
  });

  /**
   * @requirement quantity-table-generation/REQ-26.5
   *
   * 「注釈付き写真と写真コメントを**数量項目一覧の前に**配置する」を、同じページの中の
   * 縦位置で主張する。PDF ユーザー空間では y が大きいほどページの上端に近いため、
   * 「前」は「列見出しの行より y が大きい」として観測できる。
   *
   * 写真の位置は画像描画命令の直前の座標変換から読む。読めなかった場合は `NaN` が入り、
   * 大小比較はいずれも偽になるため判定は落ちる（黙って通ることはない）。
   * **件数が `imagePaintCount` と一致することを先に主張する**のは、位置の読み取りが
   * 命令の一部を取りこぼしたまま残りだけで通ることを防ぐためである。
   */
  test('写真が紐づいているグループでは写真とコメントを数量項目一覧の前に配置する (REQ-26.5)', async () => {
    const photoPages = pageNumbersContaining(pdfPages, PHOTO_GROUP_NAME);
    expect(photoPages, `前提: 「${PHOTO_GROUP_NAME}」のページが1つ特定できる`).toHaveLength(1);
    const section = pageAt(pdfPages, photoPages[0]!);

    const headerRows = completeTableHeaderRows(section);
    expect(headerRows.length, '前提: 当該ページに数量項目一覧の見出し行が1つ在る').toBe(1);
    const tableTopY = headerRows[0]![0]!.y;

    expect(
      section.imagePlacements.length,
      '前提: 画像描画命令の件数と位置を読み取れた件数が一致する'
    ).toBe(section.imagePaintCount);
    expect(
      section.imagePlacements.length,
      'REQ-26.5: 写真が紐づいているグループのページには注釈付き写真が出力される'
    ).toBeGreaterThan(0);

    for (const placement of section.imagePlacements) {
      expect(
        placement.y,
        'REQ-26.5: 注釈付き写真は数量項目一覧より前（上）に配置される'
      ).toBeGreaterThan(tableTopY);
    }

    const commentPieces = section.pieces.filter((piece) => piece.str === PHOTO_COMMENT);
    expect(commentPieces.length, `REQ-26.5: 写真コメント「${PHOTO_COMMENT}」が出力される`).toBe(1);
    expect(
      commentPieces[0]!.y,
      'REQ-26.5: 写真コメントは数量項目一覧より前（上）に配置される'
    ).toBeGreaterThan(tableTopY);
  });

  /**
   * @requirement quantity-table-generation/REQ-26.6
   *
   * **不在の主張であるため、同じ生成物・同じ読み取り器の肯定側と対で主張する。**
   * 肯定側（写真ありのページで画像1件以上・コメントが在る）が成り立たなければ、
   * 読み取り器が死んでいることになり判定は落ちる。
   * 「数量項目一覧のみを表示する」の肯定は、写真なしのページ自身にテーブルが在ること、
   * および写真・コメントの領域が無い分だけテーブルが上へ詰まっていることで主張する。
   */
  test('写真が紐づいていないグループでは写真・コメントを省略し数量項目一覧のみを出力する (REQ-26.6)', async () => {
    const noPhotoPages = pageNumbersContaining(pdfPages, NO_PHOTO_GROUP_NAME);
    const photoPages = pageNumbersContaining(pdfPages, PHOTO_GROUP_NAME);
    expect(noPhotoPages, `前提: 「${NO_PHOTO_GROUP_NAME}」のページが1つ特定できる`).toHaveLength(1);
    expect(photoPages, `前提: 「${PHOTO_GROUP_NAME}」のページが1つ特定できる`).toHaveLength(1);

    const withPhoto = pageAt(pdfPages, photoPages[0]!);
    const withoutPhoto = pageAt(pdfPages, noPhotoPages[0]!);

    // 対照（肯定側）: 同じ読み取り器で、写真ありのページには写真とコメントが在る
    expect(
      withPhoto.imagePaintCount,
      '対照: 写真を紐づけたグループのページには写真が出力されている（読み取り器が生きている）'
    ).toBeGreaterThan(0);
    expect(
      withPhoto.text.includes(PHOTO_COMMENT),
      '対照: 写真を紐づけたグループのページには写真コメントが出力されている'
    ).toBe(true);

    // 主張（省略）: 写真なしのページには写真もコメントも無い
    expect(
      withoutPhoto.imagePaintCount,
      'REQ-26.6: 写真が紐づいていないグループのページには写真が出力されない'
    ).toBe(0);
    expect(
      withoutPhoto.text.includes(PHOTO_COMMENT),
      'REQ-26.6: 写真が紐づいていないグループのページには写真コメントが出力されない'
    ).toBe(false);

    // 主張（数量項目一覧のみ）: ページ自体は生成され、数量項目一覧が在る
    const withoutPhotoHeaders = completeTableHeaderRows(withoutPhoto);
    const withPhotoHeaders = completeTableHeaderRows(withPhoto);
    expect(
      withoutPhotoHeaders.length,
      'REQ-26.6: 写真が紐づいていないグループのページにも数量項目一覧が出力される'
    ).toBe(1);
    expect(
      withoutPhoto.text.includes(NO_PHOTO_ITEM_NAME),
      `REQ-26.6: 写真が紐づいていないグループの数量項目「${NO_PHOTO_ITEM_NAME}」が出力される`
    ).toBe(true);
    expect(withPhotoHeaders.length, '対照: 写真ありのページにも数量項目一覧が出力される').toBe(1);

    // 写真・コメントの領域が省かれた分、数量項目一覧はページの上へ詰まる
    // （PDF ユーザー空間では y が大きいほどページの上端に近い）
    expect(
      withoutPhotoHeaders[0]![0]!.y,
      'REQ-26.6: 写真・コメントを省いた分だけ数量項目一覧が上へ詰まる'
    ).toBeGreaterThan(withPhotoHeaders[0]![0]!.y);
  });

  /**
   * @requirement quantity-table-generation/REQ-26.7
   *
   * 「テーブル形式（11列）」を、(1) 11の列見出しが同じ高さに条文の順序で左から並ぶこと、
   * (2) 数量項目の値がその下の行に、**それぞれ対応する列の範囲内に**現れること、で主張する。
   * 列の範囲は観測した見出しの位置から組み立てており、レイアウト定数は写していない。
   */
  test('数量項目一覧が11列のテーブル形式で出力される (REQ-26.7)', async () => {
    const photoPages = pageNumbersContaining(pdfPages, PHOTO_GROUP_NAME);
    expect(photoPages, `前提: 「${PHOTO_GROUP_NAME}」のページが1つ特定できる`).toHaveLength(1);
    const section = pageAt(pdfPages, photoPages[0]!);

    const headerRows = completeTableHeaderRows(section);
    expect(
      headerRows.length,
      `REQ-26.7: 11列の見出し（${TABLE_COLUMN_LABELS.join('・')}）が同じ行にそろって出力される`
    ).toBe(1);
    const headerRow = headerRows[0]!;

    // 見出しは条文の順序どおり左から右へ並ぶ
    for (let i = 1; i < headerRow.length; i++) {
      expect(
        headerRow[i]!.x,
        `REQ-26.7: 列見出し「${TABLE_COLUMN_LABELS[i]}」は「${TABLE_COLUMN_LABELS[i - 1]}」の右に出力される`
      ).toBeGreaterThan(headerRow[i - 1]!.x);
    }

    // 見出しの行より下（y が小さい）に、11の値が同じ行として並ぶ
    const headerY = headerRow[0]!.y;
    const valueRowCandidates = section.pieces.filter(
      (piece) => piece.y < headerY && piece.str === FULL_ITEM.majorCategory
    );
    expect(
      valueRowCandidates.length,
      `REQ-26.7: 数量項目の行が見出しの下に出力される（先頭列の値「${FULL_ITEM.majorCategory}」）`
    ).toBe(1);
    const valueY = valueRowCandidates[0]!.y;
    const valueRow = section.pieces.filter((piece) => Math.abs(piece.y - valueY) < 0.5);

    for (let i = 0; i < TABLE_COLUMN_LABELS.length; i++) {
      const expected = TABLE_COLUMN_VALUES[i]!;
      const leftEdge = headerRow[i]!.x - 0.5;
      const rightEdge =
        i + 1 < headerRow.length ? headerRow[i + 1]!.x - 0.5 : Number.POSITIVE_INFINITY;

      const inColumn = valueRow.filter((piece) => piece.x >= leftEdge && piece.x < rightEdge);
      const matched = inColumn.filter((piece) =>
        typeof expected === 'string' ? piece.str === expected : expected.test(piece.str)
      );

      expect(
        matched.length,
        `REQ-26.7: 「${TABLE_COLUMN_LABELS[i]}」列の位置に値 ${expected} がちょうど1つ出力される（同じ位置に出たのは ${JSON.stringify(
          inColumn.map((piece) => piece.str)
        )}）`
      ).toBe(1);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-26.8
   *
   * 前件は「数量項目一覧のテーブルがページをまたぐ場合」である。事前準備で写真ありグループへ
   * 12行を入れ、写真の高さの分だけ下がったテーブルがページをまたぐ状態を作っている。
   *
   * **前件が成立していることを、詰め物の項目が2ページへ分かれて出ていることで先に主張する。**
   * 何行目でまたぐかはレイアウト次第なので固定しない。両ページに1件以上在り、かつ
   * 取りこぼし（どちらにも出ない項目）が無いことを主張する——片側が空なら、
   * 「またいでいないのに見出しだけ見て緑」にならずに落ちる。
   *
   * 主張は、改ページ後のページの**先頭に**列見出しがそろって繰り返されることである。
   * 「先頭」は当該ページの数量項目の値より上（y が大きい）であることで観測する。
   */
  test('数量項目一覧がページをまたぐとき新しいページの先頭に列見出しを繰り返す (REQ-26.8)', async () => {
    const photoPages = pageNumbersContaining(pdfPages, PHOTO_GROUP_NAME);
    expect(photoPages, `前提: 「${PHOTO_GROUP_NAME}」のページが1つ特定できる`).toHaveLength(1);
    const sectionFirstPage = pageAt(pdfPages, photoPages[0]!);
    const continuationPage = pageAt(pdfPages, photoPages[0]! + 1);

    // 前件: 詰め物の項目が2ページへ分かれて出ている（＝テーブルがページをまたいだ）
    const onFirstPage = PAGE_BREAK_ITEM_NAMES.filter((name) =>
      sectionFirstPage.text.includes(name)
    );
    const onContinuationPage = PAGE_BREAK_ITEM_NAMES.filter((name) =>
      continuationPage.text.includes(name)
    );
    expect(
      onFirstPage.length,
      '前提: セクションの先頭ページに数量項目が出力されている'
    ).toBeGreaterThan(0);
    expect(
      onContinuationPage.length,
      '前提: 改ページ後のページにも数量項目が出力されている（テーブルがページをまたいだ）'
    ).toBeGreaterThan(0);
    expect(
      onFirstPage.length + onContinuationPage.length,
      '前提: 詰め物の数量項目が取りこぼしなく2ページへ分かれている'
    ).toBe(PAGE_BREAK_ITEM_NAMES.length);
    expect(
      continuationPage.text.includes(PHOTO_GROUP_NAME),
      '前提: 改ページ後のページは同一セクションの続きである（新しいセクションの見出しを持たない）'
    ).toBe(false);

    // 主張: 改ページ後の先頭に列見出しが繰り返される
    const continuationHeaderRows = completeTableHeaderRows(continuationPage);
    expect(
      continuationHeaderRows.length,
      `REQ-26.8: 改ページ後のページに11列の見出し（${TABLE_COLUMN_LABELS.join('・')}）がそろって繰り返される`
    ).toBe(1);

    const continuationHeaderY = continuationHeaderRows[0]![0]!.y;
    const continuationValuePieces = continuationPage.pieces.filter((piece) =>
      onContinuationPage.includes(piece.str)
    );
    expect(
      continuationValuePieces.length,
      '前提: 改ページ後のページの数量項目の位置を読み取れる'
    ).toBe(onContinuationPage.length);
    for (const piece of continuationValuePieces) {
      expect(
        continuationHeaderY,
        `REQ-26.8: 繰り返された列見出しは数量項目「${piece.str}」より先頭側に出力される`
      ).toBeGreaterThan(piece.y);
    }
  });

  /**
   * @requirement quantity-table-generation/REQ-26.12
   *
   * 「各ページにページ番号を表示する（表紙を除く）」を、肯定側（表紙以降の全ページに
   * ページ番号が1つずつ在り、通し番号と総数が合っている）と否定側（表紙には無い）の
   * 対で主張する。否定側だけでは、ページ番号を一切描かない実装でも成立してしまう。
   *
   * ページ番号の字面は本番の `N / M` 形式（`QuantityTablePdfExportService.ts` の
   * `renderPageNumbers`）を正規表現で受け、番号と総数の**値**を主張する。
   */
  test('表紙を除く各ページにページ番号が出力される (REQ-26.12)', async () => {
    const pageNumberPattern = /^(\d+)\s*\/\s*(\d+)$/;
    const contentPageCount = pdfPages.length - 1;
    expect(contentPageCount, '前提: 表紙以降のページが2ページ以上ある').toBeGreaterThan(1);

    // 否定側: 表紙にはページ番号が無い
    const cover = pageAt(pdfPages, 1);
    const coverPageNumbers = cover.pieces.filter((piece) =>
      pageNumberPattern.test(piece.str.trim())
    );
    expect(
      coverPageNumbers.map((piece) => piece.str.trim()),
      'REQ-26.12: 表紙にはページ番号が出力されない'
    ).toEqual([]);

    // 肯定側: 表紙以降の各ページにページ番号が1つずつ在り、通し番号と総数が合っている
    for (let pageNumber = 2; pageNumber <= pdfPages.length; pageNumber++) {
      const contentPage = pageAt(pdfPages, pageNumber);
      const matches = contentPage.pieces
        .map((piece) => pageNumberPattern.exec(piece.str.trim()))
        .filter((match): match is RegExpExecArray => match !== null);

      expect(matches.length, `REQ-26.12: ${pageNumber}ページ目にページ番号が1つ出力される`).toBe(1);
      expect(
        Number(matches[0]![1]),
        `REQ-26.12: ${pageNumber}ページ目のページ番号は表紙を除いた通し番号である`
      ).toBe(pageNumber - 1);
      expect(
        Number(matches[0]![2]),
        `REQ-26.12: ${pageNumber}ページ目の総ページ数は表紙を除いた枚数である`
      ).toBe(contentPageCount);
    }
  });
});
