/**
 * EdDSA鍵ペア生成スクリプトのテスト
 *
 * Requirements coverage:
 * - 要件5: トークン管理
 * - 要件10: セキュリティとエラーハンドリング
 *
 * @module generate-eddsa-keys.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('generate-eddsa-keys script', () => {
  const backendDir = path.resolve(__dirname, '../../../../');
  const scriptPath = path.join(backendDir, 'scripts/generate-eddsa-keys.ts');
  const envKeysPath = path.join(backendDir, '.env.keys');

  beforeEach(() => {
    // テスト前に.env.keysファイルを削除（存在する場合）
    if (fs.existsSync(envKeysPath)) {
      fs.unlinkSync(envKeysPath);
    }
  });

  afterEach(() => {
    // テスト後に.env.keysファイルを削除（存在する場合）
    if (fs.existsSync(envKeysPath)) {
      fs.unlinkSync(envKeysPath);
    }
  });

  describe('スクリプトの存在確認', () => {
    it('generate-eddsa-keys.tsスクリプトが存在すること', () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('jose v5を使用していること（package.jsonで確認）', () => {
      const packageJsonPath = path.join(backendDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // jose依存関係を確認
      expect(packageJson.dependencies.jose).toBeDefined();
      // バージョンは^5.x.xであること
      expect(packageJson.dependencies.jose).toMatch(/^\^?5\./);
    });
  });

  describe('--env-formatオプション', () => {
    it('--env-formatオプションでJWT_PUBLIC_KEYとJWT_PRIVATE_KEYを標準出力に出力すること', () => {
      // スクリプトを--env-formatオプション付きで実行
      const result = spawnSync('npx', ['tsx', scriptPath, '--env-format'], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      // 終了コード0で成功
      expect(result.status).toBe(0);

      // 標準出力に環境変数形式で出力されていること
      const stdout = result.stdout;
      expect(stdout).toContain('JWT_PUBLIC_KEY=');
      expect(stdout).toContain('JWT_PRIVATE_KEY=');

      // 各行を解析
      const lines = stdout.trim().split('\n');
      const publicKeyLine = lines.find((line) => line.startsWith('JWT_PUBLIC_KEY='));
      const privateKeyLine = lines.find((line) => line.startsWith('JWT_PRIVATE_KEY='));

      expect(publicKeyLine).toBeDefined();
      expect(privateKeyLine).toBeDefined();
    });

    it('--env-formatオプションで生成される鍵がEdDSA (Ed25519)形式であること', () => {
      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath, '--env-format'], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // 出力を解析
      const lines = result.stdout.trim().split('\n');
      const publicKeyLine = lines.find((line) => line.startsWith('JWT_PUBLIC_KEY='));
      const privateKeyLine = lines.find((line) => line.startsWith('JWT_PRIVATE_KEY='));

      // Base64デコードしてJWK形式であることを確認
      const publicKeyBase64 = publicKeyLine!.split('=')[1]!;
      const privateKeyBase64 = privateKeyLine!.split('=')[1]!;

      const publicJWK = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString('utf-8'));
      const privateJWK = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString('utf-8'));

      // EdDSA (Ed25519) であることを確認
      expect(publicJWK.kty).toBe('OKP');
      expect(publicJWK.crv).toBe('Ed25519');
      expect(publicJWK.x).toBeDefined(); // 公開鍵のx値

      expect(privateJWK.kty).toBe('OKP');
      expect(privateJWK.crv).toBe('Ed25519');
      expect(privateJWK.x).toBeDefined(); // 公開鍵のx値
      expect(privateJWK.d).toBeDefined(); // 秘密鍵のd値
    });

    it('--env-formatオプションで生成される鍵にタイムスタンプベースのkidが含まれること', () => {
      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath, '--env-format'], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // 出力を解析
      const lines = result.stdout.trim().split('\n');
      const publicKeyLine = lines.find((line) => line.startsWith('JWT_PUBLIC_KEY='));
      const privateKeyLine = lines.find((line) => line.startsWith('JWT_PRIVATE_KEY='));

      const publicKeyBase64 = publicKeyLine!.split('=')[1]!;
      const privateKeyBase64 = privateKeyLine!.split('=')[1]!;

      const publicJWK = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString('utf-8'));
      const privateJWK = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString('utf-8'));

      // kidがタイムスタンプベースであること
      expect(publicJWK.kid).toMatch(/^eddsa-\d+$/);
      expect(privateJWK.kid).toMatch(/^eddsa-\d+$/);
      // 公開鍵と秘密鍵で同じkidであること
      expect(publicJWK.kid).toBe(privateJWK.kid);
    });

    it('--env-formatオプションで.env.keysファイルが作成されないこと', () => {
      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath, '--env-format'], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // .env.keysファイルが作成されていないこと
      expect(fs.existsSync(envKeysPath)).toBe(false);
    });
  });

  describe('デフォルトモード（ファイル出力）', () => {
    it('.env.keysファイルに鍵を書き込むこと', () => {
      // スクリプトをデフォルトモードで実行
      const result = spawnSync('npx', ['tsx', scriptPath], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // .env.keysファイルが作成されていること
      expect(fs.existsSync(envKeysPath)).toBe(true);

      // ファイル内容を確認
      const content = fs.readFileSync(envKeysPath, 'utf-8');
      expect(content).toContain('# EdDSA (Ed25519) Key Pair');
      expect(content).toContain('# Generated:');
      expect(content).toContain('# Key ID: eddsa-');
      expect(content).toContain('JWT_PUBLIC_KEY=');
      expect(content).toContain('JWT_PRIVATE_KEY=');
    });

    it('成功メッセージを標準エラー出力に出力すること', () => {
      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // 標準エラー出力に成功メッセージが含まれていること
      const stderr = result.stderr;
      expect(stderr).toContain('Generating EdDSA (Ed25519) key pair...');
      expect(stderr).toContain('EdDSA key pair generated successfully!');
      expect(stderr).toContain('Keys saved to .env.keys');
      expect(stderr).toContain('Key ID:');
    });

    it('Railway設定のガイダンスを出力すること', () => {
      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // Railway設定ガイダンスが含まれていること
      const stderr = result.stderr;
      expect(stderr).toContain('For Railway deployment:');
      expect(stderr).toContain('Go to Railway dashboard > Variables');
      expect(stderr).toContain('Add JWT_PUBLIC_KEY and JWT_PRIVATE_KEY');
      expect(stderr).toContain('Redeploy the service');
    });
  });

  describe('鍵の互換性検証', () => {
    it('生成された鍵ペアでJWT署名・検証ができること', async () => {
      // jose をインポート
      const jose = await import('jose');

      // スクリプトを実行
      const result = spawnSync('npx', ['tsx', scriptPath, '--env-format'], {
        cwd: backendDir,
        encoding: 'utf-8',
        timeout: 30000,
      });

      expect(result.status).toBe(0);

      // 出力を解析
      const lines = result.stdout.trim().split('\n');
      const publicKeyLine = lines.find((line) => line.startsWith('JWT_PUBLIC_KEY='));
      const privateKeyLine = lines.find((line) => line.startsWith('JWT_PRIVATE_KEY='));

      const publicKeyBase64 = publicKeyLine!.split('=')[1]!;
      const privateKeyBase64 = privateKeyLine!.split('=')[1]!;

      const publicJWK = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString('utf-8'));
      const privateJWK = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString('utf-8'));

      // JWKからキーオブジェクトをインポート
      const privateKey = await jose.importJWK(privateJWK, 'EdDSA');
      const publicKey = await jose.importJWK(publicJWK, 'EdDSA');

      // JWTを署名
      const jwt = await new jose.SignJWT({ sub: 'test-user', role: 'admin' })
        .setProtectedHeader({ alg: 'EdDSA', kid: publicJWK.kid })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      // JWTを検証
      const { payload } = await jose.jwtVerify(jwt, publicKey);

      expect(payload.sub).toBe('test-user');
      expect(payload.role).toBe('admin');
    });
  });
});

describe('.env.example JWT環境変数', () => {
  const backendDir = path.resolve(__dirname, '../../../../');
  const envExamplePath = path.join(backendDir, '.env.example');

  it('.env.exampleにJWT_PUBLIC_KEYの説明が含まれていること', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('JWT_PUBLIC_KEY');
  });

  it('.env.exampleにJWT_PRIVATE_KEYの説明が含まれていること', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('JWT_PRIVATE_KEY');
  });

  it('.env.exampleにJWT_PUBLIC_KEY_OLDの説明が含まれていること', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('JWT_PUBLIC_KEY_OLD');
  });

  it('.env.exampleに鍵生成スクリプトの実行方法が記載されていること', () => {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    expect(content).toContain('generate-eddsa-keys');
  });
});

describe('開発環境セットアップ手順書（docs/deployment/secrets-management.md）', () => {
  const docsPath = path.resolve(__dirname, '../../../../../docs/deployment/secrets-management.md');

  it('secrets-management.mdが存在すること', () => {
    expect(fs.existsSync(docsPath)).toBe(true);
  });

  it('JWT鍵生成セクションが含まれていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    expect(content).toContain('JWT');
    expect(content).toContain('鍵');
  });

  it('鍵生成コマンドが記載されていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    // generate:jwt-keys または generate-eddsa-keys のいずれかが含まれていること
    expect(content.includes('generate') && content.includes('jwt')).toBe(true);
  });

  it('Railway環境変数設定手順が記載されていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    expect(content).toContain('Railway');
    expect(content).toContain('Variables');
  });

  it('鍵ローテーション手順が記載されていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    expect(content.toLowerCase()).toContain('rotation');
  });
});

describe('本番環境セットアップ手順書（docs/deployment/railway-setup.md）', () => {
  const docsPath = path.resolve(__dirname, '../../../../../docs/deployment/railway-setup.md');

  it('railway-setup.mdが存在すること', () => {
    expect(fs.existsSync(docsPath)).toBe(true);
  });

  it('JWT環境変数の設定手順が含まれていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    expect(content).toContain('JWT_PUBLIC_KEY');
    expect(content).toContain('JWT_PRIVATE_KEY');
  });

  it('Backend Serviceの環境変数セクションが含まれていること', () => {
    const content = fs.readFileSync(docsPath, 'utf-8');
    expect(content).toContain('Backend Service');
    expect(content).toContain('環境変数');
  });
});

describe('npmスクリプト', () => {
  const backendDir = path.resolve(__dirname, '../../../../');
  const packageJsonPath = path.join(backendDir, 'package.json');

  it('package.jsonにgenerate:jwt-keysスクリプトが定義されていること', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    expect(packageJson.scripts['generate:jwt-keys']).toBeDefined();
    expect(packageJson.scripts['generate:jwt-keys']).toContain('generate-eddsa-keys');
  });
});
