/**
 * @fileoverview E2E の 2FA の TOTP コードの計算の補助
 *
 * backend は開発用の固定値のコードを受理せず、同じ時間ステップのコードの二度目を再利用として拒否する
 * （user-authentication 要件32.7）。E2E は 2FA 登録済みの試験用の利用者を既知の秘密鍵で seed し、
 * その秘密鍵から otplib で現在のコードを計算する。
 *
 * - 秘密鍵は backend と同じ形式（AES-256-GCM、`iv:authTag:暗号文` の Base64）で暗号化して保存する。
 *   暗号鍵は backend-test と同じ `TWO_FACTOR_ENCRYPTION_KEY` を使う。環境変数が無いとき（pre-push の
 *   `CI=true npx playwright test` は `.env` を読まない）は、リポジトリの `.env.test` の値を既定値とする。
 *   どちらにも無いときは失敗させる
 * - 同じ利用者が続けてログインするとき、コードを計算する前に DB の最後に使った時間ステップを戻す
 *   （次の時間ステップを待たない）
 */

import { createCipheriv, randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';
import { authenticator } from 'otplib';
import { getPrismaClient } from '../fixtures/database';

/**
 * E2E の 2FA 登録済みの利用者の既知の TOTP の秘密鍵（Base32）
 *
 * RFC 6238 の試験用の値（ASCII の "12345678901234567890"）。試験専用で秘密ではない。
 */
export const E2E_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** 環境変数が無いときに読む `.env.test`（リポジトリのルート） */
const ENV_TEST_PATH = fileURLToPath(new URL('../../.env.test', import.meta.url));

/** 256 ビットの鍵の 16 進表記 */
const ENCRYPTION_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

/**
 * backend-test と同じ `TWO_FACTOR_ENCRYPTION_KEY` を求める
 *
 * 環境変数を優先し、無ければ `.env.test` の値を使う。どちらにも無い・形式が違うときは例外にする。
 */
export function resolveTwoFactorEncryptionKey(): string {
  const fromEnv = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  const key = fromEnv !== undefined && fromEnv !== '' ? fromEnv : readKeyFromEnvTest();
  if (key === null) {
    throw new Error(
      'TWO_FACTOR_ENCRYPTION_KEY が環境変数にも .env.test にもありません。' +
        'backend-test と同じ鍵を渡してください（2FA の試験用の利用者の秘密鍵の暗号化に使う）'
    );
  }
  if (!ENCRYPTION_KEY_PATTERN.test(key)) {
    throw new Error('TWO_FACTOR_ENCRYPTION_KEY は 64 文字の 16 進数でなければなりません');
  }
  return key;
}

function readKeyFromEnvTest(): string | null {
  if (!existsSync(ENV_TEST_PATH)) {
    return null;
  }
  for (const line of readFileSync(ENV_TEST_PATH, 'utf-8').split(/\r?\n/)) {
    const match = /^\s*TWO_FACTOR_ENCRYPTION_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      const value = match[1]!.replace(/^(['"])(.*)\1$/, '$2');
      return value === '' ? null : value;
    }
  }
  return null;
}

/**
 * TOTP の秘密鍵を backend（TwoFactorService.encryptSecret）と同じ形式で暗号化する
 */
export function encryptTotpSecret(secret: string = E2E_TOTP_SECRET): string {
  const key = Buffer.from(resolveTwoFactorEncryptionKey(), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = cipher.update(secret, 'utf8', 'base64') + cipher.final('base64');
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted}`;
}

/**
 * 秘密鍵から現在の TOTP コードを計算する
 */
export function generateTotpCode(secret: string = E2E_TOTP_SECRET): string {
  return authenticator.generate(secret);
}

/**
 * 利用者の最後に使った時間ステップを戻してから、現在の TOTP コードを計算する
 *
 * 同じ利用者の続けてのログインが、同じ時間ステップの中で再利用として拒否されないようにする。
 *
 * @param email - 2FA 登録済みの利用者のメールアドレス
 * @param secret - その利用者の TOTP の秘密鍵（既定は E2E_TOTP_SECRET）
 */
export async function prepareTotpCode(
  email: string,
  secret: string = E2E_TOTP_SECRET
): Promise<string> {
  const updated = await getPrismaClient().user.updateMany({
    where: { email },
    data: { twoFactorLastUsedStep: null },
  });
  if (updated.count !== 1) {
    throw new Error(`2FA の利用者 ${email} が見つかりません（最後に使った時間ステップを戻せない）`);
  }
  return generateTotpCode(secret);
}

/**
 * 2FA の検証・設定の画面の 6 桁の入力欄へコードを入れる
 */
export async function fillTotpCode(page: Page, code: string): Promise<void> {
  const digits = code.split('');
  for (let i = 0; i < digits.length; i++) {
    await page.getByTestId(`totp-digit-${i}`).fill(digits[i]!);
  }
}
