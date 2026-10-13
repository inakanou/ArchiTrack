#!/usr/bin/env tsx
// scripts/copy-email-templates.ts
// メールのテンプレート（src/templates/*.hbs）をビルドの出力へ複製する（npm run build の一段）。
//
// EmailService は実行時に join(__dirname, '../templates/<name>.hbs') を読む。
// tsx で実行する開発・E2E では src/services → src/templates、
// 本番（node dist/src/index.js）では dist/src/services → dist/src/templates に解決されるため、
// tsc が複製しない .hbs をここで dist/src/templates へ置く。
// 検証は scripts/check-dist-assets.ts（npm run check:dist-assets）が行う。

import { cpSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(backendDir, 'src', 'templates');
const destinationDir = join(backendDir, 'dist', 'src', 'templates');

// ソースから消したテンプレートが dist に残らないよう、作り直す
rmSync(destinationDir, { recursive: true, force: true });
cpSync(sourceDir, destinationDir, {
  recursive: true,
  // テンプレートは平らに置く。ディレクトリ自身と .hbs だけを運ぶ
  filter: (source) => source === sourceDir || source.endsWith('.hbs'),
});

console.log(`📄 メールのテンプレートを複製しました: ${sourceDir} → ${destinationDir}`);
