// scripts/generate-eddsa-keys.ts
import * as jose from 'jose';
import * as fs from 'fs';

async function generateEdDSAKeys() {
  const envFormat = process.argv.includes('--env-format');

  if (!envFormat) {
    console.error('Generating EdDSA (Ed25519) key pair...');
  }

  // EdDSA鍵ペア生成（jose v6ではextractable: trueが必要）
  const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', { extractable: true });

  // JWK形式でエクスポート
  const publicJWK = await jose.exportJWK(publicKey);
  const privateJWK = await jose.exportJWK(privateKey);

  // Key ID (kid) 生成（タイムスタンプベース）
  const kid = `eddsa-${Date.now()}`;
  publicJWK.kid = kid;
  privateJWK.kid = kid;

  // Base64エンコード（環境変数用）
  const publicKeyBase64 = Buffer.from(JSON.stringify(publicJWK)).toString('base64');
  const privateKeyBase64 = Buffer.from(JSON.stringify(privateJWK)).toString('base64');

  if (envFormat) {
    // --env-format: 環境変数形式で標準出力に出力（docker-entrypoint.sh用）
    console.log(`JWT_PUBLIC_KEY=${publicKeyBase64}`);
    console.log(`JWT_PRIVATE_KEY=${privateKeyBase64}`);
  } else {
    // デフォルト: .envファイルに書き込み
    const envContent = `
# EdDSA (Ed25519) Key Pair
# Generated: ${new Date().toISOString()}
# Key ID: ${kid}
JWT_PUBLIC_KEY=${publicKeyBase64}
JWT_PRIVATE_KEY=${privateKeyBase64}
`;

    fs.writeFileSync('.env.keys', envContent);

    console.error('✅ EdDSA key pair generated successfully!');
    console.error('📝 Keys saved to .env.keys');
    console.error('🔑 Key ID:', kid);
    console.error(
      '\n⚠️  IMPORTANT: Add these to your environment variables and keep JWT_PRIVATE_KEY secure!'
    );
    console.error('\nFor Railway deployment:');
    console.error('1. Go to Railway dashboard > Variables');
    console.error('2. Add JWT_PUBLIC_KEY and JWT_PRIVATE_KEY');
    console.error('3. Redeploy the service\n');
  }
}

generateEdDSAKeys().catch(console.error);
