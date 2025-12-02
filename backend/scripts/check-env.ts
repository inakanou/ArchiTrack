#!/usr/bin/env tsx
// scripts/check-env.ts
// 環境変数の設定状況をチェックするスクリプト
// src/config/env.ts の検証ロジックを使用

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// スクリプトのディレクトリを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// backend ディレクトリのパスを計算
const backendDir = path.resolve(__dirname, '..');
// backend/.env ファイルを明示的に読み込み
// override: true で既存の環境変数も上書き（check-env専用の動作）
const envPath = path.join(backendDir, '.env');

// .env ファイルの存在チェック
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found at:', envPath);
  console.log('💡 Copy .env.example to .env and configure the variables:');
  console.log('   cp .env.example .env');
  console.log('   or run: npm run setup:env');
  console.log('');
  process.exit(1);
}

dotenv.config({ path: envPath, override: true });

async function checkEnvironmentVariables(): Promise<void> {
  console.log('🔍 Environment Variables Check\n');
  console.log('Environment file:', envPath);
  console.log('Current NODE_ENV:', process.env.NODE_ENV || 'development');

  const isCI = process.env.CI === 'true' || process.env.CI === '1' || !!process.env.GITHUB_ACTIONS;

  if (isCI) {
    console.log('Running in CI environment');
  }
  console.log('');

  try {
    // src/config/env.ts の validateEnv() を使用
    const { validateEnv } = await import('../src/config/env.js');

    const validatedEnv = validateEnv();

    // 検証成功
    console.log('━'.repeat(60));
    console.log('\n✅ Environment Validation Successful!\n');
    console.log('━'.repeat(60));
    console.log('\n📊 Configured Variables:\n');

    // 設定された環境変数を表示（認証情報は隠す）
    const sensitiveKeys = [
      'JWT_PUBLIC_KEY',
      'JWT_PRIVATE_KEY',
      'JWT_PUBLIC_KEY_OLD',
      'TWO_FACTOR_ENCRYPTION_KEY',
      'SENTRY_DSN',
    ];

    Object.entries(validatedEnv).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return; // 未設定の値はスキップ
      }

      if (sensitiveKeys.includes(key)) {
        const strValue = String(value);
        const displayValue = `${strValue.substring(0, 10)}...${strValue.substring(
          strValue.length - 4
        )} (${strValue.length} chars)`;
        console.log(`  ✓ ${key}: ${displayValue}`);
      } else {
        console.log(`  ✓ ${key}: ${value}`);
      }
    });

    console.log('');
    console.log('━'.repeat(60));
    console.log('\n💡 Tips:\n');
    console.log('  - All required environment variables are properly configured');
    console.log('  - JWT keys are valid Base64-encoded Ed25519 JWK format');
    console.log('  - 2FA encryption key is valid 256-bit (64 hex characters)');
    console.log('');

    process.exit(0);
  } catch (error) {
    // 検証失敗
    console.log('━'.repeat(60));
    console.log('\n❌ Environment Validation Failed!\n');
    console.log('━'.repeat(60));
    console.log('');

    if (error instanceof Error) {
      console.log('Error:', error.message);
      console.log('');
    }

    console.log('💡 How to fix:\n');
    console.log('1. Generate missing keys:');
    console.log('   npm run generate-keys  # For JWT keys');
    console.log(
      "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"  # For 2FA key"
    );
    console.log('');
    console.log('2. Update .env file with the generated values');
    console.log('');
    console.log('3. Run this check again:');
    console.log('   npm run check:env');
    console.log('');
    console.log('📖 For more details, see:');
    console.log('   - .env.example');
    console.log('   - docs/deployment/environment-variables.md');
    console.log('');

    process.exit(1);
  }
}

checkEnvironmentVariables();
