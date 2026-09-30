/**
 * @fileoverview 外部AIの応答形式に対する契約検証（estimate-request タスク 91.1）の入力画像の生成スクリプト
 *
 * ## 何を作るか
 *
 * 建設見積書の内訳明細を模した表の画像を 2 枚（2 ページ分）作る。本番の経路では
 * フロントエンドが PDF の各ページを Canvas で PNG へ描画し、Base64 でバックエンドへ送る。
 * 契約検証はその「ページ画像」を入力とするため、PNG を直接用意する。
 *
 * - `estimate-sheet-page-1.png`: 表の見出し行・明細 3 行・小計行
 * - `estimate-sheet-page-2.png`: 明細 2 行・合計行
 *
 * 金額はカンマ区切りで描く（Requirement 26.8 の「カンマ区切り数値」の経路を通しうる入力にするため）。
 * 見出し行と集計行（小計・合計）も描く。除外されたかどうかは**主張しない**（内容の主張は
 * 契約検証の対象外。タスク 91.1）。
 *
 * ## 公開リポジトリであること
 *
 * 描く内容はすべて架空である。実在の個人・取引先・工事名・住所・電話番号を含めないこと。
 *
 * ## 実行方法（内容を変えるときだけ回し直してコミットする）
 *
 *   backend/node_modules/.bin/tsx backend/src/__tests__/contract/fixtures/generate-estimate-sheet-fixtures.ts
 *
 * 日本語の字形には IPAGothic を使う（無ければ sans-serif へ落ちる）。契約検証の実行時には
 * 生成しない。実行環境のフォントで入力が揺れないよう、生成物をコミットして固定する。
 *
 * @module __tests__/contract/fixtures/generate-estimate-sheet-fixtures
 */
import sharp from 'sharp';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_WIDTH = 1200;
const ROW_HEIGHT = 56;
const TABLE_TOP = 150;
const TABLE_LEFT = 40;

/** 列の見出しと幅（px） */
const COLUMNS: ReadonlyArray<{ header: string; width: number; align: 'start' | 'end' }> = [
  { header: '工種', width: 120, align: 'start' },
  { header: '名称', width: 180, align: 'start' },
  { header: '規格', width: 170, align: 'start' },
  { header: '単位', width: 80, align: 'start' },
  { header: '数量', width: 100, align: 'end' },
  { header: '単価', width: 130, align: 'end' },
  { header: '金額', width: 160, align: 'end' },
  { header: '備考', width: 180, align: 'start' },
];

type Row = readonly [string, string, string, string, string, string, string, string];

interface Page {
  fileName: string;
  title: string;
  rows: readonly Row[];
}

/** すべて架空の内容 */
const PAGES: readonly Page[] = [
  {
    fileName: 'estimate-sheet-page-1.png',
    title: '内訳明細書（契約検証用の架空データ）　1/2',
    rows: [
      ['仮設工', '足場設置', '枠組足場', 'm2', '120', '1,500', '180,000', ''],
      ['土工', '掘削', 'BH0.45m3', 'm3', '45', '2,800', '126,000', ''],
      ['土工', '埋戻し', '', 'm3', '30', '1,900', '57,000', '発生土使用'],
      ['', '小計', '', '', '', '', '363,000', ''],
    ],
  },
  {
    fileName: 'estimate-sheet-page-2.png',
    title: '内訳明細書（契約検証用の架空データ）　2/2',
    rows: [
      ['塗装工', '外壁塗装', 'シリコン系', 'm2', '210', '2,400', '504,000', ''],
      ['塗装工', '鉄部塗装', '', '式', '1', '85,000', '85,000', '手摺含む'],
      ['', '合計', '', '', '', '', '952,000', ''],
    ],
  },
];

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSvg(page: Page): string {
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);
  const allRows: readonly Row[] = [COLUMNS.map((c) => c.header) as unknown as Row, ...page.rows];
  const tableHeight = allRows.length * ROW_HEIGHT;
  const imageHeight = TABLE_TOP + tableHeight + 60;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${imageHeight}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<g font-family="IPAGothic, IPAPGothic, sans-serif" fill="#000000">',
    `<text x="${TABLE_LEFT}" y="80" font-size="34">${escapeXml(page.title)}</text>`,
  ];

  allRows.forEach((row, rowIndex) => {
    const baseline = TABLE_TOP + rowIndex * ROW_HEIGHT + 38;
    let x = TABLE_LEFT;
    row.forEach((cell, columnIndex) => {
      const column = COLUMNS[columnIndex];
      if (!column) return;
      if (cell) {
        const textX = column.align === 'end' ? x + column.width - 10 : x + 10;
        parts.push(
          `<text x="${textX}" y="${baseline}" font-size="26" text-anchor="${column.align}">${escapeXml(cell)}</text>`
        );
      }
      x += column.width;
    });
  });
  parts.push('</g>');

  // 罫線（外枠・行・列）
  parts.push('<g stroke="#000000" stroke-width="2" fill="none">');
  parts.push(
    `<rect x="${TABLE_LEFT}" y="${TABLE_TOP}" width="${tableWidth}" height="${tableHeight}"/>`
  );
  for (let rowIndex = 1; rowIndex < allRows.length; rowIndex++) {
    const y = TABLE_TOP + rowIndex * ROW_HEIGHT;
    parts.push(`<line x1="${TABLE_LEFT}" y1="${y}" x2="${TABLE_LEFT + tableWidth}" y2="${y}"/>`);
  }
  let x = TABLE_LEFT;
  for (const column of COLUMNS.slice(0, -1)) {
    x += column.width;
    parts.push(`<line x1="${x}" y1="${TABLE_TOP}" x2="${x}" y2="${TABLE_TOP + tableHeight}"/>`);
  }
  parts.push('</g>', '</svg>');

  return parts.join('\n');
}

for (const page of PAGES) {
  const outPath = path.join(FIXTURE_DIR, page.fileName);
  const info = await sharp(Buffer.from(buildSvg(page)))
    .flatten({ background: '#ffffff' })
    .grayscale()
    .png({ compressionLevel: 9, palette: true, colours: 16 })
    .toFile(outPath);
  console.log(`生成: ${outPath}（${info.width}x${info.height}、${info.size} bytes）`);
}
