#!/usr/bin/env node
/**
 * Storybook網羅性チェックスクリプト
 *
 * コンポーネントに対応するStoriesファイルが存在するかを検証し、
 * 網羅性レポートを生成します。
 *
 * 使用方法:
 *   node scripts/check-storybook-coverage.cjs
 *
 * 終了コード:
 *   0: 問題なし（目標達成）
 *   1: 目標未達（Storiesが不足）
 */

const fs = require('fs');
const path = require('path');

// 設定
const CONFIG = {
  // コンポーネントディレクトリ
  componentDir: path.join(__dirname, '../src/components'),

  // 目標カバレッジ（%）
  targetCoverage: 80,

  // 除外パターン（Storiesが不要なファイル）
  excludePatterns: [
    // テストファイル
    /\.test\.tsx$/,
    /\.spec\.tsx$/,
    // Storiesファイル自体
    /\.stories\.tsx$/,
    // index.tsxはエクスポート用
    /index\.tsx$/,
    // Providerコンポーネント（ラッパーのみ）
    /Provider\.tsx$/,
    // Layoutコンポーネント（ページ構造のみ）
    /Layout\.tsx$/,
    // Routeコンポーネント（ルーティングのみ）
    /Route\.tsx$/,
    // 複雑なCanvas/Fabric.js連携コンポーネント（E2Eテストでカバー）
    /AnnotationEditor\.tsx$/,
  ],

  // 除外ディレクトリ
  excludeDirs: [
    'node_modules',
    '__tests__',
    '__mocks__',
  ],

  // 優先度の高いディレクトリ（これらは特に重要）
  priorityDirs: [
    'common',
    '', // ルートコンポーネント
  ],
};

/**
 * 指定ディレクトリ内のすべてのコンポーネントファイルを取得
 */
function findComponentFiles(dir, baseDir = dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 除外ディレクトリはスキップ
      if (CONFIG.excludeDirs.includes(entry.name)) {
        continue;
      }
      files.push(...findComponentFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      // 除外パターンに該当するファイルはスキップ
      const shouldExclude = CONFIG.excludePatterns.some((pattern) => pattern.test(entry.name));

      if (!shouldExclude) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({
          fullPath,
          relativePath,
          name: entry.name,
          dir: path.dirname(relativePath),
        });
      }
    }
  }

  return files;
}

/**
 * 対応するStoriesファイルが存在するかチェック
 */
function checkStoriesExist(componentFile) {
  const storiesPath = componentFile.fullPath.replace(/\.tsx$/, '.stories.tsx');
  return fs.existsSync(storiesPath);
}

/**
 * コンポーネントをカテゴリ別に分類
 */
function categorizeComponents(components) {
  const withStories = [];
  const withoutStories = [];

  for (const component of components) {
    if (checkStoriesExist(component)) {
      withStories.push(component);
    } else {
      withoutStories.push(component);
    }
  }

  // ディレクトリでグループ化
  const groupByDir = (list) => {
    const groups = {};
    for (const item of list) {
      const dir = item.dir || '(root)';
      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(item);
    }
    return groups;
  };

  return {
    withStories,
    withoutStories,
    withoutStoriesByDir: groupByDir(withoutStories),
    withStoriesByDir: groupByDir(withStories),
  };
}

/**
 * レポートを出力
 */
function printReport(categories, totalCount) {
  const coverage = totalCount > 0 ? (categories.withStories.length / totalCount) * 100 : 100;

  console.log('\n📚 Storybook網羅性レポート\n');
  console.log('='.repeat(80));

  // サマリー
  console.log('\n📋 サマリー:\n');
  console.log(`   コンポーネント総数:  ${totalCount}`);
  console.log(`   ✅ Storiesあり:     ${categories.withStories.length}`);
  console.log(`   ❌ Storiesなし:     ${categories.withoutStories.length}`);
  console.log(`   📊 網羅率:          ${coverage.toFixed(1)}%`);
  console.log(`   🎯 目標:            ${CONFIG.targetCoverage}%`);

  // Storiesなしのコンポーネント（ディレクトリ別）
  if (categories.withoutStories.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('\n❌ Storiesが不足しているコンポーネント:\n');

    const dirs = Object.keys(categories.withoutStoriesByDir).sort((a, b) => {
      // 優先度の高いディレクトリを先に
      const normalizeDir = (d) => (d === '.' ? '' : d);
      const aPriority = CONFIG.priorityDirs.includes(normalizeDir(a)) ? 0 : 1;
      const bPriority = CONFIG.priorityDirs.includes(normalizeDir(b)) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.localeCompare(b);
    });

    for (const dir of dirs) {
      const files = categories.withoutStoriesByDir[dir];
      const normalizedDir = dir === '.' ? '' : dir;
      const dirLabel = normalizedDir === '' ? 'components/' : `components/${normalizedDir}/`;
      const isPriority = CONFIG.priorityDirs.includes(normalizedDir);
      const priorityMarker = isPriority ? ' ⚠️  [優先]' : '';

      console.log(`   📁 ${dirLabel}${priorityMarker}`);
      for (const file of files) {
        console.log(`      - ${file.name}`);
      }
      console.log('');
    }
  }

  // プログレスバー
  console.log('='.repeat(80));
  const barWidth = 50;
  const filledWidth = Math.round((coverage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = '[' + '█'.repeat(filledWidth) + '░'.repeat(emptyWidth) + ']';
  console.log(`\n   ${progressBar} ${coverage.toFixed(1)}%\n`);

  return coverage;
}

/**
 * メイン処理
 */
function main() {
  // コンポーネントファイルを検索
  const components = findComponentFiles(CONFIG.componentDir);

  if (components.length === 0) {
    console.log('⚠️  コンポーネントが見つかりませんでした。');
    process.exit(0);
  }

  // カテゴリ分類
  const categories = categorizeComponents(components);

  // レポート出力
  const coverage = printReport(categories, components.length);

  // 終了コードの決定
  if (coverage >= CONFIG.targetCoverage) {
    console.log('✅ Storybook網羅性チェック完了。目標達成。\n');
    process.exit(0);
  } else {
    console.log(`❌ Storybook網羅率が目標（${CONFIG.targetCoverage}%）未満です。\n`);
    console.log('対応方法:');
    console.log('  1. 上記コンポーネントに対応する *.stories.tsx を作成してください');
    console.log('  2. UIテストが不要な場合は除外パターンに追加を検討してください\n');
    process.exit(1);
  }
}

main();
