#!/usr/bin/env node

/**
 * Bundle Size Checker
 *
 * フロントエンドのビルド成果物（dist/）のサイズをチェックし、
 * 閾値を超えた場合に警告を出力します。
 */

/* eslint-env node */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 閾値設定（バイト単位）
const THRESHOLDS = {
  // 総ビルドサイズ（圧縮前）: 500KB
  totalSize: 500 * 1024,
  // JSファイル合計サイズ: 400KB
  jsSize: 400 * 1024,
  // CSSファイル合計サイズ: 100KB
  cssSize: 100 * 1024,
};

/**
 * ディレクトリ内のファイルサイズを再帰的に計算
 */
function getDirectorySize(dirPath, extension = null) {
  let totalSize = 0;

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      totalSize += getDirectorySize(filePath, extension);
    } else if (stats.isFile()) {
      if (!extension || path.extname(file) === extension) {
        totalSize += stats.size;
      }
    }
  }

  return totalSize;
}

/**
 * バイトサイズを人間が読みやすい形式に変換
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Bundle Sizeをチェック
 */
function checkBundleSize() {
  const distPath = path.resolve(__dirname, '../dist');

  if (!fs.existsSync(distPath)) {
    console.error('❌ Error: dist/ directory not found. Please run "npm run build" first.');
    process.exit(1);
  }

  console.log('📊 Bundle Size Report\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 総サイズ
  const totalSize = getDirectorySize(distPath);
  const totalSizeFormatted = formatBytes(totalSize);
  const totalThresholdFormatted = formatBytes(THRESHOLDS.totalSize);
  const totalPercentage = ((totalSize / THRESHOLDS.totalSize) * 100).toFixed(1);
  const totalExceeded = totalSize > THRESHOLDS.totalSize;

  console.log(`📦 Total Bundle Size: ${totalSizeFormatted}`);
  console.log(`   Threshold: ${totalThresholdFormatted} (${totalPercentage}%)`);
  console.log(`   Status: ${totalExceeded ? '⚠️  EXCEEDED' : '✅ OK'}\n`);

  // JSファイル合計サイズ
  const jsSize = getDirectorySize(distPath, '.js');
  const jsSizeFormatted = formatBytes(jsSize);
  const jsThresholdFormatted = formatBytes(THRESHOLDS.jsSize);
  const jsPercentage = ((jsSize / THRESHOLDS.jsSize) * 100).toFixed(1);
  const jsExceeded = jsSize > THRESHOLDS.jsSize;

  console.log(`📜 JavaScript Size: ${jsSizeFormatted}`);
  console.log(`   Threshold: ${jsThresholdFormatted} (${jsPercentage}%)`);
  console.log(`   Status: ${jsExceeded ? '⚠️  EXCEEDED' : '✅ OK'}\n`);

  // CSSファイル合計サイズ
  const cssSize = getDirectorySize(distPath, '.css');
  const cssSizeFormatted = formatBytes(cssSize);
  const cssThresholdFormatted = formatBytes(THRESHOLDS.cssSize);
  const cssPercentage = ((cssSize / THRESHOLDS.cssSize) * 100).toFixed(1);
  const cssExceeded = cssSize > THRESHOLDS.cssSize;

  console.log(`🎨 CSS Size: ${cssSizeFormatted}`);
  console.log(`   Threshold: ${cssThresholdFormatted} (${cssPercentage}%)`);
  console.log(`   Status: ${cssExceeded ? '⚠️  EXCEEDED' : '✅ OK'}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 結果サマリー
  if (totalExceeded || jsExceeded || cssExceeded) {
    console.log('⚠️  WARNING: Bundle size threshold exceeded!');
    console.log('   Consider the following optimizations:');
    console.log('   - Code splitting with dynamic imports');
    console.log('   - Tree shaking unused dependencies');
    console.log('   - Analyzing bundle with "npm run build:analyze"');
    console.log('   - Using lighter alternatives for large libraries\n');
    process.exit(1);
  } else {
    console.log('✅ All bundle size checks passed!\n');
    process.exit(0);
  }
}

checkBundleSize();
