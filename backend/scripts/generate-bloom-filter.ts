/**
 * Bloom Filter生成スクリプト
 *
 * 関連要件:
 * - REQ2.7: 脆弱なパスワードのHIBP Pwned PasswordsのBloom Filterによる検証（誤検出率0.001）
 *
 * 使用方法:
 *   npx tsx scripts/generate-bloom-filter.ts
 *
 * 出力:
 *   data/bloom-filter.json - Bloom Filterの永続化データ
 *
 * @module scripts/generate-bloom-filter
 */

import { BloomFilter } from 'bloom-filters';
import * as fs from 'fs';
import * as path from 'path';

async function generateBloomFilter() {
  console.log('=== Generating Bloom Filter for common passwords...\n');

  try {
    // 脆弱なパスワードリストを読み込み
    const passwordListPath = path.join(process.cwd(), 'data', 'common-passwords.txt');

    if (!fs.existsSync(passwordListPath)) {
      console.error('❌ Error: common-passwords.txt not found in data/ directory');
      console.log('   Please create data/common-passwords.txt with one password per line\n');
      process.exit(1);
    }

    const passwordsData = fs.readFileSync(passwordListPath, 'utf-8');
    const passwords = passwordsData
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    console.log('📋 Loaded ' + passwords.length + ' passwords from list\n');

    // Bloom Filter作成
    // 設定例: 本番環境ではHIBP: 10,000,000エントリ、誤検出率0.001
    const bloomFilter = BloomFilter.create(
      Math.max(passwords.length, 10000), // 最小 10,000エントリ
      0.001 // 誤検出率0.1%
    );

    // パスワードを小文字化してBloom Filterに追加
    for (const password of passwords) {
      bloomFilter.add(password.toLowerCase());
    }

    // Bloom Filterをシリアライズ
    const serialized = bloomFilter.saveAsJSON();

    // JSONファイルに保存
    const outputPath = path.join(process.cwd(), 'data', 'bloom-filter.json');
    fs.writeFileSync(outputPath, JSON.stringify(serialized, null, 2));

    console.log('✅ Bloom Filter generated successfully!\n');
    console.log('📁 Saved to: data/bloom-filter.json');
    console.log('📊 Filter size: ' + (JSON.stringify(serialized).length / 1024).toFixed(2) + ' KB');
    console.log('📈 Elements added: ' + passwords.length);
    console.log('📉 False positive rate: 0.001 (0.1%)\n');

    // サンプルテスト
    console.log('🧪 Running sample tests...\n');
    const testPasswords = ['password', 'securePassword123', 'admin', 'uniqueP@ssw0rd!'];

    for (const pwd of testPasswords) {
      const exists = bloomFilter.has(pwd.toLowerCase());
      console.log('  ' + pwd.padEnd(20) + ' -> ' + (exists ? '❌ Forbidden' : '✅ Allowed'));
    }

    console.log('\n' + '='.repeat(70));
    console.log('⚠️  IMPORTANT NOTES');
    console.log('='.repeat(70));
    console.log('\n1. This is a SAMPLE Bloom Filter with limited passwords');
    console.log('2. For production, integrate HIBP Pwned Passwords (700M+ entries)');
    console.log('3. Download HIBP data: https://haveibeenpwned.com/Passwords');
    console.log('4. For better security, update the filter regularly\n');
  } catch (error) {
    console.error('❌ Error generating Bloom Filter:', error);
    process.exit(1);
  }
}

// スクリプト実行
generateBloomFilter().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
