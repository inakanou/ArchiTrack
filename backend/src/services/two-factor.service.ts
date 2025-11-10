/**
 * @fileoverview 二要素認証（2FA/TOTP）サービス
 *
 * Requirements:
 * - 27.1-27.8: 二要素認証設定機能
 * - 27C.1-27C.6: 二要素認証セキュリティ要件
 *
 * Design Patterns:
 * - RFC 6238準拠のTOTP実装
 * - AES-256-GCM暗号化による秘密鍵保護
 * - Google Authenticator互換性
 */

import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { ITwoFactorService } from '../types/two-factor.types';
import logger from '../utils/logger';

/**
 * 二要素認証サービスの実装
 */
export class TwoFactorService implements ITwoFactorService {
  /** 暗号化アルゴリズム */
  private readonly ALGORITHM = 'aes-256-gcm';
  /** 初期化ベクトルの長さ（12バイト） */
  private readonly IV_LENGTH = 12;
  /** バックアップコードの文字セット（英数字大文字） */
  private readonly BACKUP_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  constructor() {
    // otplibの設定（RFC 6238準拠、要件27C.1）
    authenticator.options = {
      window: 1, // ±1ステップ許容（合計90秒）
    };
  }

  /**
   * TOTP秘密鍵を生成
   *
   * RFC 6238準拠の32バイト暗号学的乱数を生成し、Base32エンコードして返す。
   * 要件27.2: 32バイト（256ビット）の暗号学的に安全な乱数を使用。
   *
   * @returns Base32エンコードされたTOTP秘密鍵
   */
  generateTOTPSecret(): string {
    // 32バイト（256ビット）の暗号学的乱数を生成
    const randomBytes32 = randomBytes(32);

    // Base32エンコード（RFC 4648）
    const secret = this.base32Encode(randomBytes32);

    logger.debug('TOTP秘密鍵を生成しました');
    return secret;
  }

  /**
   * バイト配列をBase32エンコード
   *
   * RFC 4648準拠のBase32エンコード（パディングあり）
   *
   * @param buffer - エンコードするバイト配列
   * @returns Base32エンコードされた文字列
   */
  private base32Encode(buffer: Buffer): string {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i]!;
      bits += 8;

      while (bits >= 5) {
        output += base32Chars[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += base32Chars[(value << (5 - bits)) & 31];
    }

    // パディング追加
    while (output.length % 8 !== 0) {
      output += '=';
    }

    return output;
  }

  /**
   * TOTP秘密鍵を暗号化
   *
   * AES-256-GCM暗号化を適用してデータベース保存用の暗号化済み文字列を返す。
   * 形式: iv:authTag:encryptedData（すべてBase64エンコード）
   *
   * @param secret - Base32エンコードされたTOTP秘密鍵
   * @returns 暗号化済み秘密鍵（Base64エンコード）
   */
  async encryptSecret(secret: string): Promise<string> {
    // 暗号化鍵の存在チェック（要件27C.5）
    if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY環境変数が設定されていません');
    }

    try {
      // 暗号化鍵の取得
      const encryptionKey = Buffer.from(process.env.TWO_FACTOR_ENCRYPTION_KEY, 'hex');

      // 初期化ベクトルの生成（12バイト）
      const iv = randomBytes(this.IV_LENGTH);

      // 暗号化
      const cipher = createCipheriv(this.ALGORITHM, encryptionKey, iv);
      let encrypted = cipher.update(secret, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // 認証タグの取得
      const authTag = cipher.getAuthTag();

      // iv:authTag:encryptedData形式で返却
      const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

      logger.debug('TOTP秘密鍵を暗号化しました');
      return result;
    } catch (error) {
      logger.error({ error }, 'TOTP秘密鍵の暗号化に失敗しました');
      throw new Error('秘密鍵の暗号化に失敗しました');
    }
  }

  /**
   * TOTP秘密鍵を復号化
   *
   * AES-256-GCM暗号化された秘密鍵を復号化してBase32エンコード文字列を返す。
   *
   * @param encryptedSecret - 暗号化済み秘密鍵（iv:authTag:encryptedData形式）
   * @returns Base32エンコードされたTOTP秘密鍵
   */
  async decryptSecret(encryptedSecret: string): Promise<string> {
    // 暗号化鍵の存在チェック（要件27C.5）
    if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
      throw new Error('TWO_FACTOR_ENCRYPTION_KEY環境変数が設定されていません');
    }

    try {
      // 暗号化鍵の取得
      const encryptionKey = Buffer.from(process.env.TWO_FACTOR_ENCRYPTION_KEY, 'hex');

      // iv:authTag:encryptedData形式から分離
      const [ivBase64, authTagBase64, encryptedData] = encryptedSecret.split(':');

      if (!ivBase64 || !authTagBase64 || !encryptedData) {
        throw new Error('不正な暗号化データ形式です');
      }

      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      // 復号化
      const decipher = createDecipheriv(this.ALGORITHM, encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      logger.debug('TOTP秘密鍵を復号化しました');
      return decrypted;
    } catch (error) {
      logger.error({ error }, 'TOTP秘密鍵の復号化に失敗しました');
      throw new Error('秘密鍵の復号化に失敗しました');
    }
  }

  /**
   * QRコードを生成
   *
   * Google Authenticator互換のotpauth URI形式でQRコードを生成する。
   * フォーマット: otpauth://totp/ArchiTrack:{email}?secret={secret}&issuer=ArchiTrack
   *
   * @param email - ユーザーのメールアドレス
   * @param secret - Base32エンコードされたTOTP秘密鍵
   * @returns QRコードのData URL（data:image/png;base64,...）
   */
  async generateQRCode(email: string, secret: string): Promise<string> {
    try {
      // otpauth URI生成（Google Authenticator互換）
      const otpauthUrl = authenticator.keyuri(email, 'ArchiTrack', secret);

      // QRコードをData URL形式で生成
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

      logger.debug({ email }, 'QRコードを生成しました');
      return qrCodeDataUrl;
    } catch (error) {
      logger.error({ error, email }, 'QRコード生成に失敗しました');
      throw new Error('QRコード生成に失敗しました');
    }
  }

  /**
   * バックアップコードを生成
   *
   * 10個の8文字英数字ランダムコードを生成する。
   * 暗号学的に安全な乱数を使用（crypto.randomBytes）。
   *
   * @returns 10個のバックアップコード配列
   */
  generateBackupCodes(): string[] {
    const codes: string[] = [];

    for (let i = 0; i < 10; i++) {
      let code = '';

      // 8文字のランダムコード生成
      for (let j = 0; j < 8; j++) {
        const randomIndex = randomBytes(1)[0]! % this.BACKUP_CODE_CHARSET.length;
        code += this.BACKUP_CODE_CHARSET[randomIndex];
      }

      codes.push(code);
    }

    logger.debug('バックアップコードを10個生成しました');
    return codes;
  }
}
