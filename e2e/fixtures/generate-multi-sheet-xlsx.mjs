/**
 * @fileoverview 複数シートの Excel fixture（import-items-multi-sheet.xlsx）の生成スクリプト
 *
 * ## なぜ必要か（quantity-table-generation タスク 100.9）
 *
 * 数量表インポートの受入基準 28.2 は「Excelファイルの**全シート**を解析対象とする」を求める。
 * 既存の Excel 資材は 2 件とも単一シート（`import-items.xlsx` / `import-items-all-fields.xlsx`、
 * どちらも SheetNames は `["Sheet1"]`）であり、**1 枚目だけを読む実装と全シートを読む実装を
 * 区別できない**。そこで、見出しを共有し本文が 1 行ずつ異なる 3 枚のシートを持つ資材を用意する。
 *
 * 3 枚にするのは、量化子を n=1 や n=2 で済ませないためである
 * （`generate-image-only-pdf.mjs --pages 2` が受入基準 29.4 の「各ページ」に対して置いたのと同じ理由）。
 * 「先頭シートだけ」「末尾シートだけ」「先頭 2 枚だけ」のいずれの実装も、
 * 抽出結果のプレビューテーブルに現れる行数と中身が資材と食い違うため落ちる。
 *
 * ## 生成物の性質
 *
 * - シートは 3 枚。順序は `SHEETS` の並びどおりで、SheetJS の `workbook.SheetNames` もこの順になる
 * - 3 枚とも見出しは同じ 5 列（工種・名称・規格・数量・単位）。
 *   `frontend/src/components/quantity-table-import/excel-parser.ts` の `readExcelFile` は
 *   シートをまたいで見出しを重複なしに統合するため、見出しを揃えると抽出結果の列は 5 列に定まり、
 *   判定の対象を「どのシートの本文が現れたか」だけに絞れる
 * - 本文は 1 枚につき 1 行。名称・規格・数量・単位はシートごとに異なる値にしてある
 *
 * ## 実行方法
 *
 *   node e2e/fixtures/generate-multi-sheet-xlsx.mjs
 *
 * 生成物 `import-items-multi-sheet.xlsx` はリポジトリへコミットしている。
 * 中身を変えると `e2e/specs/quantity-tables/import-e2e.spec.ts` の REQ-28.2 の判定が固定している
 * 期待値（`MULTI_SHEET_ROWS`）と食い違うため、両方を同時に改めること。
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADERS = ['工種', '名称', '規格', '数量', '単位'];

/** シート名 → 本文 1 行（見出しの並びと対） */
const SHEETS = [
  { name: '1枚目', row: ['仮設工', 'E2E1枚目項目', '標準仕様', 11, '式'] },
  { name: '2枚目', row: ['土工', 'E2E2枚目項目', '特記仕様', 22, 'm3'] },
  { name: '3枚目', row: ['電気工', 'E2E3枚目項目', '参考仕様', 33, '箇所'] },
];

const outPath = path.join(__dirname, 'import-items-multi-sheet.xlsx');

const workbook = new ExcelJS.Workbook();
for (const sheet of SHEETS) {
  const worksheet = workbook.addWorksheet(sheet.name);
  worksheet.addRow(HEADERS);
  worksheet.addRow(sheet.row);
}

await workbook.xlsx.writeFile(outPath);
console.log(`generated: ${outPath}`);
