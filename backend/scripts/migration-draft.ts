#!/usr/bin/env tsx
// scripts/migration-draft.ts
// Draft マイグレーション管理スクリプト

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');
const migrationsDir = path.join(backendDir, 'prisma', 'migrations');
const draftDir = path.join(migrationsDir, 'draft');

// コマンドライン引数を取得
const command = process.argv[2];
const args = process.argv.slice(3);

/**
 * Draftマイグレーションディレクトリが存在することを確認
 */
function ensureDraftDir(): void {
  if (!fs.existsSync(draftDir)) {
    fs.mkdirSync(draftDir, { recursive: true });
  }
}

/**
 * Draft一覧を取得
 */
function listDrafts(): string[] {
  ensureDraftDir();
  const entries = fs.readdirSync(draftDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * 最新のDraftを取得
 */
function getLatestDraft(): string | undefined {
  const drafts = listDrafts();
  return drafts.length > 0 ? drafts[drafts.length - 1] : undefined;
}

/**
 * Draft作成
 */
function createDraft(name: string): void {
  if (!name) {
    console.error('❌ エラー: マイグレーション名を指定してください');
    console.log('使用例: npm run db:draft:create draft_user_auth');
    process.exit(1);
  }

  ensureDraftDir();

  console.log('📝 Draftマイグレーションを作成中...\n');

  try {
    // Prisma migrate dev --create-only でマイグレーションを作成
    // 出力先を通常のmigrationsディレクトリにする
    execSync(`npx prisma migrate dev --create-only --name ${name}`, {
      cwd: backendDir,
      stdio: 'inherit',
    });

    // 最新のマイグレーションを取得
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const latestMigration = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'draft')
      .map((entry) => entry.name)
      .sort()
      .pop();

    if (!latestMigration) {
      console.error('❌ エラー: マイグレーションが見つかりません');
      process.exit(1);
    }

    // Draftディレクトリに移動
    const sourcePath = path.join(migrationsDir, latestMigration);
    const targetPath = path.join(draftDir, latestMigration);

    fs.renameSync(sourcePath, targetPath);

    console.log('\n✅ Draftマイグレーション作成完了');
    console.log(`📁 場所: prisma/migrations/draft/${latestMigration}/`);
    console.log('\n次のステップ:');
    console.log(
      '  1. SQLファイルを確認: cat prisma/migrations/draft/' + latestMigration + '/migration.sql'
    );
    console.log('  2. 適用: npm run db:draft:apply');
    console.log('  3. 確定: npm run db:draft:finalize');
  } catch (error) {
    console.error('❌ エラー: Draftマイグレーション作成に失敗しました');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Draft適用
 */
function applyDraft(draftName?: string): void {
  const targetDraft = draftName || getLatestDraft();

  if (!targetDraft) {
    console.error('❌ エラー: Draftマイグレーションが見つかりません');
    console.log('先に npm run db:draft:create <name> を実行してください');
    process.exit(1);
  }

  const draftPath = path.join(draftDir, targetDraft);
  const migrationPath = path.join(migrationsDir, targetDraft);

  console.log(`📝 Draftマイグレーションを適用中: ${targetDraft}\n`);

  try {
    // 一時的にmigrationsディレクトリに移動
    fs.renameSync(draftPath, migrationPath);

    // マイグレーション適用
    execSync('npx prisma migrate dev', {
      cwd: backendDir,
      stdio: 'inherit',
    });

    // draftディレクトリに戻す
    fs.renameSync(migrationPath, draftPath);

    console.log('\n✅ Draftマイグレーション適用完了');
    console.log('\n次のステップ:');
    console.log(
      '  - さらに修正する場合: スキーマ編集後、npm run db:draft:create で新しいDraft作成'
    );
    console.log('  - 確定する場合: npm run db:draft:finalize');
  } catch (error) {
    // エラー時も元に戻す
    if (fs.existsSync(migrationPath)) {
      fs.renameSync(migrationPath, draftPath);
    }
    console.error('❌ エラー: Draftマイグレーション適用に失敗しました');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Draft確定（確定版に移行）
 */
function finalizeDraft(draftName?: string): void {
  const targetDraft = draftName || getLatestDraft();

  if (!targetDraft) {
    console.error('❌ エラー: Draftマイグレーションが見つかりません');
    process.exit(1);
  }

  const draftPath = path.join(draftDir, targetDraft);
  const migrationPath = path.join(migrationsDir, targetDraft);

  console.log(`📝 Draftマイグレーションを確定中: ${targetDraft}\n`);

  // 確認プロンプト
  console.log('⚠️  この操作は以下を実行します:');
  console.log(`  1. ${targetDraft} を確定版に移行`);
  console.log('  2. Git追跡対象になります');
  console.log('  3. データベースに適用されます（未適用の場合）');
  console.log('');

  try {
    // migrationsディレクトリに移動（確定版として）
    fs.renameSync(draftPath, migrationPath);

    // マイグレーション適用（未適用の場合）
    execSync('npx prisma migrate deploy', {
      cwd: backendDir,
      stdio: 'inherit',
    });

    console.log('\n✅ Draftマイグレーション確定完了');
    console.log(`📁 場所: prisma/migrations/${targetDraft}/`);
    console.log('\n次のステップ:');
    console.log('  1. 変更を確認: git status');
    console.log('  2. コミット: git add prisma/migrations/' + targetDraft);
    console.log('  3. コミット: git commit -m "feat(db): <説明>"');
  } catch (error) {
    // エラー時は元に戻す
    if (fs.existsSync(migrationPath)) {
      fs.renameSync(migrationPath, draftPath);
    }
    console.error('❌ エラー: Draftマイグレーション確定に失敗しました');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Draft削除
 */
function cleanDraft(draftName?: string): void {
  if (draftName) {
    // 特定のDraftを削除
    const draftPath = path.join(draftDir, draftName);
    if (!fs.existsSync(draftPath)) {
      console.error(`❌ エラー: Draft "${draftName}" が見つかりません`);
      process.exit(1);
    }

    fs.rmSync(draftPath, { recursive: true, force: true });
    console.log(`✅ Draft削除完了: ${draftName}`);
  } else {
    // 全てのDraftを削除
    const drafts = listDrafts();
    if (drafts.length === 0) {
      console.log('ℹ️  削除するDraftマイグレーションがありません');
      return;
    }

    console.log(`⚠️  ${drafts.length}個のDraftマイグレーションを削除します:`);
    drafts.forEach((draft) => console.log(`  - ${draft}`));
    console.log('');

    drafts.forEach((draft) => {
      const draftPath = path.join(draftDir, draft);
      fs.rmSync(draftPath, { recursive: true, force: true });
    });

    console.log(`✅ ${drafts.length}個のDraft削除完了`);
  }
}

/**
 * Draft一覧表示
 */
function showDrafts(): void {
  const drafts = listDrafts();

  if (drafts.length === 0) {
    console.log('ℹ️  Draftマイグレーションはありません');
    console.log('\n作成方法: npm run db:draft:create <name>');
    return;
  }

  console.log(`📋 Draftマイグレーション一覧 (${drafts.length}個):\n`);

  drafts.forEach((draft, index) => {
    const draftPath = path.join(draftDir, draft);
    const sqlPath = path.join(draftPath, 'migration.sql');

    console.log(`${index + 1}. ${draft}`);

    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
      const lines = sqlContent.trim().split('\n').slice(0, 3);
      console.log(`   ${lines.join('\n   ')}`);
      if (sqlContent.split('\n').length > 3) {
        console.log('   ...');
      }
    }
    console.log('');
  });

  console.log('使用方法:');
  console.log('  - 適用: npm run db:draft:apply [draft名]');
  console.log('  - 確定: npm run db:draft:finalize [draft名]');
  console.log('  - 削除: npm run db:draft:clean [draft名]');
}

/**
 * ヘルプ表示
 */
function showHelp(): void {
  console.log('📚 Draft Migration 管理スクリプト\n');
  console.log('使用方法:');
  console.log('  npm run db:draft:create <name>    - Draftマイグレーション作成');
  console.log('  npm run db:draft:apply [name]     - Draftマイグレーション適用');
  console.log('  npm run db:draft:finalize [name]  - Draftを確定版に移行');
  console.log('  npm run db:draft:clean [name]     - Draft削除');
  console.log('  npm run db:draft:list             - Draft一覧表示');
  console.log('');
  console.log('ワークフロー:');
  console.log('  1. schema.prismaを編集');
  console.log('  2. npm run db:draft:create draft_feature_name');
  console.log('  3. SQLを確認・修正');
  console.log('  4. npm run db:draft:apply');
  console.log('  5. 動作確認');
  console.log('  6. 問題なければ npm run db:draft:finalize');
  console.log('  7. git add & git commit');
  console.log('');
  console.log('詳細: backend/docs/DATABASE_MIGRATION_WORKFLOW.md');
}

// メインロジック
switch (command) {
  case 'create':
    createDraft(args[0] || '');
    break;
  case 'apply':
    applyDraft(args[0]);
    break;
  case 'finalize':
    finalizeDraft(args[0]);
    break;
  case 'clean':
    cleanDraft(args[0]);
    break;
  case 'list':
    showDrafts();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    console.error('❌ エラー: 不明なコマンド:', command);
    console.log('');
    showHelp();
    process.exit(1);
}
