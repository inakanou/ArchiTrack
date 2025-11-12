#!/usr/bin/env tsx
// scripts/check-env.ts
// 環境変数の設定状況をチェックするスクリプト

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
dotenv.config({ path: envPath, override: true });

interface EnvCheck {
  name: string;
  required: boolean;
  forProduction: boolean;
  description: string;
  validationFn?: (value: string) => boolean;
}

interface EnvCheckMode {
  skipIfCI?: boolean; // CI環境でスキップ（vitestで動的生成されるため）
}

const ENV_CHECKS: (EnvCheck & EnvCheckMode)[] = [
  {
    name: 'NODE_ENV',
    required: false,
    forProduction: true,
    description: 'Node environment (development | production | test)',
  },
  {
    name: 'PORT',
    required: false,
    forProduction: false,
    description: 'Server port number',
  },
  {
    name: 'DATABASE_URL',
    required: false,
    forProduction: true,
    description: 'PostgreSQL connection string',
    validationFn: (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
  },
  {
    name: 'REDIS_URL',
    required: false,
    forProduction: false,
    description: 'Redis connection string',
    validationFn: (val) => val.startsWith('redis://') || val.startsWith('rediss://'),
  },
  {
    name: 'FRONTEND_URL',
    required: false,
    forProduction: true,
    description: 'Frontend URL for CORS',
    validationFn: (val) => val.startsWith('http://') || val.startsWith('https://'),
  },
  {
    name: 'JWT_PUBLIC_KEY',
    required: true,
    forProduction: true,
    skipIfCI: true, // CI環境ではvitest.setup.tsで動的生成
    description: 'EdDSA public key for JWT verification (Base64-encoded JWK)',
    validationFn: (val) => {
      try {
        const jwk = JSON.parse(Buffer.from(val, 'base64').toString());
        return jwk.kty === 'OKP' && jwk.crv === 'Ed25519';
      } catch {
        return false;
      }
    },
  },
  {
    name: 'JWT_PRIVATE_KEY',
    required: true,
    forProduction: true,
    skipIfCI: true, // CI環境ではvitest.setup.tsで動的生成
    description: 'EdDSA private key for JWT signing (Base64-encoded JWK)',
    validationFn: (val) => {
      try {
        const jwk = JSON.parse(Buffer.from(val, 'base64').toString());
        return jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && 'd' in jwk;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'TWO_FACTOR_ENCRYPTION_KEY',
    required: true,
    forProduction: true,
    skipIfCI: true, // CI環境ではテストで動的生成される場合がある
    description: 'AES-256-GCM encryption key for 2FA secrets (64 hex characters)',
    validationFn: (val) => /^[0-9a-f]{64}$/i.test(val),
  },
  {
    name: 'SENTRY_DSN',
    required: false,
    forProduction: true,
    description: 'Sentry DSN for error tracking (highly recommended for production)',
  },
];

function checkEnvironmentVariables(): void {
  console.log('🔍 Environment Variables Check\n');
  console.log('Current environment:', process.env.NODE_ENV || 'development');

  const isCI = process.env.CI === 'true' || process.env.CI === '1' || !!process.env.GITHUB_ACTIONS;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isCI) {
    console.log('Running in CI environment');
  }
  console.log('');

  let hasErrors = false;
  let hasWarnings = false;

  const results = {
    configured: [] as string[],
    missing: [] as string[],
    invalid: [] as string[],
    recommended: [] as string[],
    skipped: [] as string[],
  };

  ENV_CHECKS.forEach((check) => {
    const value = process.env[check.name];
    const isSet = value !== undefined && value !== '';

    // CI環境でskipIfCIフラグが設定されている場合はスキップ
    if (isCI && check.skipIfCI) {
      results.skipped.push(check.name);
      console.log(`⏭️  ${check.name}: SKIPPED (dynamically generated in CI)`);
      console.log('');
      return;
    }

    // Required check
    if (check.required && !isSet) {
      results.missing.push(check.name);
      console.log(`❌ ${check.name}: MISSING (REQUIRED)`);
      console.log(`   ${check.description}`);
      console.log('');
      hasErrors = true;
      return;
    }

    // Production recommendation
    if (!check.required && check.forProduction && isProduction && !isSet) {
      results.recommended.push(check.name);
      console.log(`⚠️  ${check.name}: NOT SET (Recommended for production)`);
      console.log(`   ${check.description}`);
      console.log('');
      hasWarnings = true;
      return;
    }

    // Validation check
    if (isSet && check.validationFn && !check.validationFn(value)) {
      results.invalid.push(check.name);
      console.log(`❌ ${check.name}: INVALID FORMAT`);
      console.log(`   ${check.description}`);
      console.log(`   Current value length: ${value.length} characters`);
      console.log('');
      hasErrors = true;
      return;
    }

    // Success
    if (isSet) {
      results.configured.push(check.name);
      const displayValue =
        check.name.includes('KEY') || check.name.includes('SECRET')
          ? `${value.substring(0, 10)}...${value.substring(value.length - 4)} (${value.length} chars)`
          : value;
      console.log(`✅ ${check.name}: ${displayValue}`);
      console.log('');
    }
  });

  // Summary
  console.log('━'.repeat(60));
  console.log('\n📊 Summary:\n');
  console.log(`✅ Configured: ${results.configured.length}`);
  console.log(`❌ Missing (Required): ${results.missing.length}`);
  console.log(`❌ Invalid Format: ${results.invalid.length}`);
  console.log(`⚠️  Recommended (Production): ${results.recommended.length}`);
  if (results.skipped.length > 0) {
    console.log(`⏭️  Skipped (CI): ${results.skipped.length}`);
  }
  console.log('');

  if (hasErrors) {
    console.log('❌ Environment check FAILED');
    console.log('\nTo fix:');
    if (results.missing.length > 0) {
      console.log('1. Generate missing keys:');
      console.log('   npm run generate-keys  # For JWT keys');
      console.log(
        "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"  # For 2FA key"
      );
    }
    if (results.invalid.length > 0) {
      console.log('2. Fix invalid environment variables');
      console.log('   Check .env.example for correct formats');
    }
    console.log('3. Update .env file with the generated values');
    console.log('');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  Environment check PASSED with warnings');
    console.log('\nRecommendation: Set the recommended variables for production deployment');
    console.log('');
    process.exit(0);
  } else {
    console.log('✅ All environment variables are correctly configured!');
    console.log('');
    process.exit(0);
  }
}

// Check if .env file exists
if (!fs.existsSync(envPath)) {
  console.log('⚠️  .env file not found');
  console.log('💡 Copy .env.example to .env and configure the variables:');
  console.log('   cp .env.example .env');
  console.log('');
}

checkEnvironmentVariables();
