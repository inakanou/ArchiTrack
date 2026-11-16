/**
 * @fileoverview 単価台帳の取り込みの E2E の材料（unit-price-ledger/cards.zip）の生成スクリプト
 *
 * ## なぜ必要か（unit-price-ledger タスク 5.1）
 *
 * 取り込みの受入基準 2.1 は「見積カードの zip ファイル、または複数の見積カードの JSON ファイル」を
 * 取り込むことを求める。zip の中のカードも 1 枚ずつ登録されることを確かめるため、
 * `unit-price-ledger/zip-cards/` の JSON を 1 つの zip にまとめる。
 *
 * ## 生成物の性質
 *
 * - 項目は `zip-cards/` の `.json` を名前の順に並べたもの（zip の中では階層を持たない名前にする）
 * - 圧縮は deflate。項目の日時は固定（1980-01-01）にし、同じ材料からは同じバイト列ができる
 * - zip は backend と同じ fflate で作る（ルートの依存には無いため、backend の依存から読む）
 *
 * ## 実行方法
 *
 *   node e2e/fixtures/generate-ledger-cards-zip.mjs
 *
 * 生成物 `unit-price-ledger/cards.zip` はリポジトリへコミットしている。`zip-cards/` の JSON を変えたら
 * 作り直し、`e2e/specs/unit-price-ledger/ledger-import.spec.ts` の期待値（`CARDS`）も同時に改めること。
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const { zipSync, strToU8 } = require('fflate');

const SOURCE_DIR = path.join(__dirname, 'unit-price-ledger', 'zip-cards');
const OUTPUT = path.join(__dirname, 'unit-price-ledger', 'cards.zip');

/** 項目の日時（固定。zip の日時の下限） */
const FIXED_MTIME = new Date('1980-01-01T00:00:00');

const names = fs
  .readdirSync(SOURCE_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (names.length === 0) {
  throw new Error(`見積カードの JSON がありません: ${SOURCE_DIR}`);
}

const entries = Object.fromEntries(
  names.map((name) => {
    const text = fs.readFileSync(path.join(SOURCE_DIR, name), 'utf8');
    // 壊れた JSON を zip に入れない（材料の誤りはここで止める）
    JSON.parse(text);
    return [name, [strToU8(text), { mtime: FIXED_MTIME }]];
  })
);

const zipped = zipSync(entries, { level: 6, mtime: FIXED_MTIME });
fs.writeFileSync(OUTPUT, zipped);

console.log(`Generated: ${OUTPUT} (${names.length} cards: ${names.join(', ')})`);
