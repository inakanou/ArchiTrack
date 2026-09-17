/**
 * @fileoverview 画像のみのPDF fixture（test-scanned-pdf.pdf）の生成スクリプト
 *
 * ## なぜ必要か（site-survey タスク 115.157）
 *
 * `frontend/src/components/estimate-requests/pdf-text-extractor.ts` の
 * `extractPdfHybrid` は、pdfjs-dist で抽出した文字数（空白除く）が閾値 50 以上なら
 * テキストPDFと判定し、`extractPdfWithOcrFallback`（Canvas 描画スケール 4.0 →
 * 画像前処理パイプライン → Tesseract OCR）へ**一度も入らない**。
 *
 * 既存の fixture は 2 件ともテキスト入り PDF であり（実測: test-file.pdf は
 * 抽出文字数 97、test-text-pdf.pdf は 264）、この経路を通せなかった。
 * そこで、テキスト描画演算子を一切持たず画像 XObject だけで構成した PDF を用意する。
 *
 * ## 生成物の性質
 *
 * - `/Font` を持たず、`Tj` / `TJ` などのテキスト描画演算子を 1 つも含まない
 *   → pdfjs-dist の `getTextContent()` が返す文字数は 0 になり `isTextPdf=false` が確定する
 * - ページ全面に 1 枚の `/DeviceRGB` 画像（`/FlateDecode`）を配置する
 * - 画像には日本語と数字を大きめの字で描く
 * - さらに罫線を水平・垂直へ 1 本ずつ引く。画像前処理パイプラインの水平線除去・垂直線除去は
 *   幅/高さの 30% 以上の連続黒画素を消すため、その長さを超える罫線を置いておくと
 *   「除去が実際に働いたこと」を E2E から観測できる（前処理前は閾値超え、前処理後は消えている）。
 *   互いに交差させない理由は SVG 内のコメントに記した
 *
 * ## 実行方法
 *
 *   node e2e/fixtures/generate-image-only-pdf.mjs
 *   node e2e/fixtures/generate-image-only-pdf.mjs --pages 150 --out test-scanned-pdf-multipage.pdf
 *
 * 生成物は 3 件で、いずれもリポジトリへコミットしている。
 *
 * - `test-scanned-pdf.pdf`（1 ページ）: フォールバック経路そのものの検査に使う
 * - `test-scanned-pdf-2pages.pdf`（2 ページ）: 「**各ページ**を Canvas 経由で画像に変換する」
 *   （数量表インポートの受入基準 29.4）の量化子を n=1 で済ませないために使う。
 *   画素の読み出し・書き戻し・画像化の回数と、抽出テキストに現れる画像内の語の出現回数が
 *   いずれもページ数 2 と一致することを E2E から主張できる
 *   （`node e2e/fixtures/generate-image-only-pdf.mjs --pages 2 --out test-scanned-pdf-2pages.pdf`）
 * - `test-scanned-pdf-multipage.pdf`（150 ページ）: 30 秒では終わらない量の仕事を与えて
 *   `OcrDataExtractor.tsx` の 30 秒の打ち切りを検査するために使う。画像 XObject は
 *   1 個を全ページで共有するため、ページ数を増やしてもファイルは 64KB 程度にとどまる
 *
 * E2E の実行時に生成しないのは、(1) 生成に backend の sharp と日本語フォントが要り
 * E2E の前提が増えること、(2) OCR の読み取り結果に対する主張が生成環境のフォントで
 * 揺れてはならないこと、の 2 点による。内容を変えるときだけ本スクリプトを回し直す。
 * 同じ入力からは同じバイト列が出る（生成物の md5 が一致することを実測済み）。
 *
 * @module e2e/fixtures/generate-image-only-pdf
 */

import { createRequire } from 'module';
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const require = createRequire(import.meta.url);
// sharp は backend の依存。ルート／frontend には無いため明示的に解決する。
const sharp = require('../../backend/node_modules/sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 画像の画素サイズ */
const IMAGE_WIDTH = 1400;
const IMAGE_HEIGHT = 700;

/** PDF ページのサイズ（pt）。画像はページ全面に配置する。 */
const PAGE_WIDTH = 350;
const PAGE_HEIGHT = 175;

/** 水平線除去の対象となる長さの罫線（画像幅の 30% 以上） */
const HORIZONTAL_RULE_LENGTH = 1140;

/** 垂直線除去の対象となる長さの罫線（画像高さの 30% 以上） */
const VERTICAL_RULE_LENGTH = 600;

/**
 * OCR に読ませる内容。
 * 明細行への変換（convertOcrTextToLineItems）に頼らず、
 * OCR が文字を読み取れたこと自体を検査できるよう素直な語を並べる。
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <g font-family="IPAGothic, IPAPGothic, sans-serif" fill="#000000">
    <text x="80" y="170" font-size="96">外壁塗装工事</text>
    <text x="80" y="330" font-size="96">数量 100 平米</text>
    <text x="80" y="490" font-size="96">単価 5000 円</text>
    <text x="80" y="640" font-size="96">金額 500000 円</text>
  </g>
  <!--
    罫線を 2 本だけ引く。画像前処理パイプラインの水平線除去（幅の 30% 以上の連続黒画素）と
    垂直線除去（高さの 30% 以上の連続黒画素）が実際に働いたことを E2E から観測するための
    素材である。互いに交差させないのは、交差させると水平線除去が先に走った結果
    垂直方向の連続が分断され、分断後の各区間が閾値を下回って残る経路が生じうるためで、
    観測したい対象（各除去が働いたか）を曖昧にしないための配置である。
    - 水平: 幅 ${HORIZONTAL_RULE_LENGTH}px（画像幅の ${Math.round((HORIZONTAL_RULE_LENGTH / IMAGE_WIDTH) * 100)}%）
    - 垂直: 高さ ${VERTICAL_RULE_LENGTH}px（画像高さの ${Math.round((VERTICAL_RULE_LENGTH / IMAGE_HEIGHT) * 100)}%）
  -->
  <rect x="60" y="215" width="${HORIZONTAL_RULE_LENGTH}" height="5" fill="#000000"/>
  <rect x="1300" y="55" width="5" height="${VERTICAL_RULE_LENGTH}" fill="#000000"/>
</svg>`;


const { data, info } = await sharp(Buffer.from(SVG))
  .flatten({ background: '#ffffff' })
  .removeAlpha()
  .toColorspace('srgb')
  .raw()
  .toBuffer({ resolveWithObject: true });

if (info.channels !== 3) {
  throw new Error(`想定外のチャネル数です: ${info.channels}`);
}

const imageStream = deflateSync(data, { level: 9 });

/** ページ全面へ画像を 1 枚だけ配置する内容ストリーム（テキスト描画演算子を含まない） */
const contentStream = Buffer.from(`q ${PAGE_WIDTH} 0 0 ${PAGE_HEIGHT} 0 0 cm /Im0 Do Q\n`, 'latin1');

/**
 * 画像 XObject を 1 個だけ持ち、それを pageCount 枚のページから参照する PDF を組み立てる。
 * ページ数を増やしても画像の実体は増えないため、ファイルサイズはほぼ変わらない。
 *
 * @param {number} pageCount ページ数
 * @returns {Buffer} PDF の中身
 */
function buildPdf(pageCount) {
  // 1: Catalog, 2: Pages, 3: Image XObject, 4: Contents, 5..: 各 Page
  const firstPageObjNumber = 5;
  const pageObjNumbers = Array.from({ length: pageCount }, (_, i) => firstPageObjNumber + i);

  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from(
      `<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(' ')}] ` +
        `/Count ${pageCount} >>`,
      'latin1'
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
          `/Length ${imageStream.length} >>\nstream\n`,
        'latin1'
      ),
      imageStream,
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.concat([
      Buffer.from(`<< /Length ${contentStream.length} >>\nstream\n`, 'latin1'),
      contentStream,
      Buffer.from('endstream', 'latin1'),
    ]),
    ...pageObjNumbers.map(() =>
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /XObject << /Im0 3 0 R >> >> /Contents 4 0 R >>`,
        'latin1'
      )
    ),
  ];

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let offset = chunks[0].length;

  objects.forEach((body, index) => {
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    offsets.push(offset);
    offset += chunk.length;
    chunks.push(chunk);
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const objOffset of offsets) {
    xref += `${String(objOffset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

const pagesArgIndex = process.argv.indexOf('--pages');
const pageCount = pagesArgIndex === -1 ? 1 : Number(process.argv[pagesArgIndex + 1]);
if (!Number.isInteger(pageCount) || pageCount < 1) {
  throw new Error(`--pages には 1 以上の整数を渡すこと（受け取った値: ${process.argv[pagesArgIndex + 1]}）`);
}
const outArgIndex = process.argv.indexOf('--out');
const outName = outArgIndex === -1 ? 'test-scanned-pdf.pdf' : process.argv[outArgIndex + 1];

const outPath = path.resolve(__dirname, outName);
const pdf = buildPdf(pageCount);
writeFileSync(outPath, pdf);

console.log(`生成: ${outPath}`);
console.log(`  ページ数 ${pageCount} / 画像 ${info.width}x${info.height} / 圧縮後 ${imageStream.length} bytes`);
console.log(`  PDF 全体 ${pdf.length} bytes`);
