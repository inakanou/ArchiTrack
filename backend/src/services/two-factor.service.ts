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
import { hash, verify } from '@node-rs/argon2';
import type {
  ITwoFactorService,
  TwoFactorError,
  Result,
  TwoFactorEnabledData,
  TwoFactorReenrollmentStartData,
  TwoFactorRequestContext,
  TwoFactorResetError,
  TwoFactorSetupData,
} from '../types/two-factor.types.js';
import { Ok, Err } from '../types/two-factor.types.js';
import getPrismaClient from '../db.js';
import logger from '../utils/logger.js';
import { rethrowIfDatabaseConnectionTimeout } from '../utils/db-connection-timeout.js';
import { connectBudgetTransactionOptions } from '../utils/db-connect-budget.js';
import { snapshotAuditActor } from './audit-log.service.js';
import { revokeAllRefreshTokensForUser } from '../utils/refresh-token-lock.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthenticatedUserStateService } from './authenticated-user-state.service.js';

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
  /** Prisma Client instance */
  private readonly prisma: PrismaClient;

  /**
   * @param userStateService - 状態を変える処理（管理者による再設定）の後に、対象者の状態のキャッシュを
   *   無効化する部品（タスク47.5）。省略時は無効化しない
   */
  constructor(
    private readonly userStateService?: Pick<AuthenticatedUserStateService, 'invalidate'>
  ) {
    // otplibの設定（RFC 6238準拠）
    // @requirement user-authentication/REQ-27C.1
    authenticator.options = {
      window: 1, // ±1ステップ許容（合計90秒）
    };
    this.prisma = getPrismaClient();
  }

  /**
   * 2FA設定開始
   *
   * TOTP秘密鍵を生成し、QRコードとバックアップコードを返す。
   * データベースに秘密鍵とバックアップコードを保存する。
   * @requirement user-authentication/REQ-27.1-27.8: 二要素認証設定機能
   *
   * @param userId - ユーザーID
   * @returns 2FA設定データ（QRコード、秘密鍵、バックアップコード）
   */
  async setupTwoFactor(userId: string): Promise<Result<TwoFactorSetupData, TwoFactorError>> {
    try {
      // 1. ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      // 2. 既に2FAが有効かチェック
      if (user.twoFactorEnabled) {
        return Err({ type: 'TWO_FACTOR_ALREADY_ENABLED' });
      }

      // 3. TOTP秘密鍵を生成（平文）
      const plainTextSecret = this.generateTOTPSecret();

      // 4. 秘密鍵を暗号化
      const encryptedSecret = await this.encryptSecret(plainTextSecret);

      // 5. QRコードを生成
      const qrCodeDataUrl = await this.generateQRCode(user.email, plainTextSecret);

      // 6. バックアップコードを生成（平文）
      const plainTextBackupCodes = this.generateBackupCodes();

      // 7. トランザクション内でデータベースに保存
      await this.prisma.$transaction(async (tx) => {
        // ユーザーの秘密鍵を更新
        await tx.user.update({
          where: { id: userId },
          data: {
            twoFactorSecret: encryptedSecret,
          },
        });

        // バックアップコードをハッシュ化して保存
        for (const code of plainTextBackupCodes) {
          const codeHash = await hash(code);
          await tx.twoFactorBackupCode.create({
            data: {
              userId,
              codeHash,
            },
          });
        }

        // 監査ログを記録
        await tx.auditLog.create({
          data: {
            action: 'TWO_FACTOR_SETUP_STARTED',
            actorId: userId,
            ...(await snapshotAuditActor(tx, userId)),
            targetType: 'User',
            targetId: userId,
            metadata: {},
          },
        });
      }, connectBudgetTransactionOptions());

      logger.info({ userId }, '2FA設定を開始しました');

      // 8. 平文の秘密鍵、QRコード、バックアップコードを返す
      return Ok({
        secret: plainTextSecret,
        qrCodeDataUrl,
        backupCodes: plainTextBackupCodes,
      });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, userId }, '2FA設定開始中にエラーが発生しました');
      return Err({ type: 'USER_NOT_FOUND' });
    }
  }

  /**
   * TOTP秘密鍵を生成
   *
   * RFC 6238準拠の32バイト暗号学的乱数を生成し、Base32エンコードして返す。
   * @requirement user-authentication/REQ-27.2: 32バイト（256ビット）の暗号学的に安全な乱数を使用。
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
    // 暗号化鍵の存在チェック
    // @requirement user-authentication/REQ-27C.5
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
      logger.error({ err: error }, 'TOTP秘密鍵の暗号化に失敗しました');
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
    // 暗号化鍵の存在チェック
    // @requirement user-authentication/REQ-27C.5
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
      logger.error({ err: error }, 'TOTP秘密鍵の復号化に失敗しました');
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
      logger.error({ err: error, email }, 'QRコード生成に失敗しました');
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

  /**
   * TOTP検証
   *
   * 30秒ウィンドウ、±1ステップ許容（合計90秒）で検証する。
   * 一致した時間ステップを `users.two_factor_last_used_step` に条件付きの更新で記録し、
   * 記録以下のステップのコード（同じコードの二度目を含む）は CODE_ALREADY_USED で拒否する（要件32.7）。
   * 条件付きの更新は、同時の二つの検証の一方だけを成功させる。
   * @requirement user-authentication/REQ-27A.3: TOTP検証の実装
   *
   * @param userId - ユーザーID
   * @param totpCode - 6桁のTOTPコード
   * @returns 検証成功ならtrue、コードの不一致ならfalse、再利用ならCODE_ALREADY_USED
   */
  async verifyTOTP(userId: string, totpCode: string): Promise<Result<boolean, TwoFactorError>> {
    try {
      // ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
          twoFactorSecret: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
      }

      // 秘密鍵を復号化
      let decryptedSecret: string;
      try {
        decryptedSecret = await this.decryptSecret(user.twoFactorSecret);
      } catch {
        return Err({ type: 'DECRYPTION_FAILED', message: '秘密鍵の復号化に失敗しました' });
      }

      // TOTP検証（一致した時間ステップを求める）
      const matchedStep = this.matchTOTPStep(totpCode, decryptedSecret);
      if (matchedStep === null) {
        logger.debug({ userId, isValid: false }, 'TOTP検証を実行しました');
        return Ok(false);
      }

      // 一致したステップが記録より新しいときだけ記録する（再利用の拒否、要件32.7）
      const recorded = await this.prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: matchedStep } }],
        },
        data: { twoFactorLastUsedStep: matchedStep },
      });
      if (recorded.count === 0) {
        logger.info({ userId, matchedStep }, 'TOTPコードの再利用を拒否しました');
        return Err({ type: 'CODE_ALREADY_USED' });
      }

      logger.debug({ userId, isValid: true }, 'TOTP検証を実行しました');
      return Ok(true);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, userId }, 'TOTP検証中にエラーが発生しました');
      return Err({ type: 'INVALID_TOTP_CODE' });
    }
  }

  /**
   * TOTPコードが一致した時間ステップを求める
   *
   * otplib の checkDelta で許容の窓（±1ステップ）の中のずれを求め、現在の時間ステップに足す。
   * 現在の時刻は一度だけ読み、照合と時間ステップの計算で同じ時刻を使う（ステップの境界でずれないように）。
   *
   * @param totpCode - 6桁のTOTPコード
   * @param secret - 復号済みのBase32秘密鍵
   * @returns 一致した時間ステップ。一致しなければnull
   */
  private matchTOTPStep(totpCode: string, secret: string): number | null {
    const epoch = Date.now();
    const delta = authenticator.clone({ epoch }).checkDelta(totpCode, secret);
    if (delta === null) {
      return null;
    }
    const stepSeconds = authenticator.allOptions().step;
    return Math.floor(epoch / 1000 / stepSeconds) + delta;
  }

  /**
   * バックアップコード検証
   *
   * 未使用のバックアップコードを検証し、使用済みとしてマークする。
   * @requirement user-authentication/REQ-27A.6-27A.7: バックアップコード検証の実装
   *
   * @param userId - ユーザーID
   * @param backupCode - 8文字のバックアップコード
   * @returns 検証成功ならtrue、失敗ならfalse
   */
  async verifyBackupCode(
    userId: string,
    backupCode: string
  ): Promise<Result<boolean, TwoFactorError>> {
    try {
      // ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      if (!user.twoFactorEnabled) {
        return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
      }

      // 表示形式（XXXX-XXXX）と小文字の入力を、保存時の形式（8文字の大文字英数字）へ揃える
      const normalizedCode = backupCode.replace(/-/g, '').toUpperCase();

      // 未使用のバックアップコードを取得
      const backupCodes = await this.prisma.twoFactorBackupCode.findMany({
        where: {
          userId,
          usedAt: null,
        },
      });

      // 各バックアップコードのハッシュと比較
      for (const storedCode of backupCodes) {
        const isValid = await verify(storedCode.codeHash, normalizedCode);

        if (isValid) {
          // 使用済みとしてマーク、監査ログ記録（実行者の写しは記録の前に読む。要件40.7）
          const actorSnapshot = await snapshotAuditActor(this.prisma, userId);
          // 未使用の行だけを条件にした一度の更新で使用済みにする（要件27A.6, 27A.7）。
          // 読んでから書く間に並行の検証が同じコードを使った場合は 0 行の更新になり、無効として扱う
          const consumed = await this.prisma.$transaction(async (tx) => {
            const { count } = await tx.twoFactorBackupCode.updateMany({
              where: { id: storedCode.id, usedAt: null },
              data: { usedAt: new Date() },
            });
            if (count !== 1) {
              return false;
            }
            await tx.auditLog.create({
              data: {
                action: 'TWO_FACTOR_BACKUP_CODE_USED',
                actorId: userId,
                ...actorSnapshot,
                targetType: 'User',
                targetId: userId,
                metadata: {},
              },
            });
            return true;
          });

          if (consumed !== true) {
            logger.debug({ userId }, 'バックアップコードは並行の検証で使用済みになりました');
            return Ok(false);
          }

          logger.debug({ userId }, 'バックアップコードで認証成功しました');
          return Ok(true);
        }
      }

      // すべてのコードと一致しなかった
      logger.debug({ userId }, 'バックアップコードが無効です');
      return Ok(false);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, userId }, 'バックアップコード検証中にエラーが発生しました');
      return Err({ type: 'INVALID_BACKUP_CODE' });
    }
  }

  /**
   * 2FA有効化
   *
   * TOTP検証後にtwoFactorEnabledをtrueに設定する。
   * @requirement user-authentication/REQ-27.5: 2FA有効化の実装
   *
   * @param userId - ユーザーID
   * @param totpCode - 6桁のTOTPコード
   * @returns 2FA有効化データ（バックアップコード）
   */
  async enableTwoFactor(
    userId: string,
    totpCode: string
  ): Promise<Result<TwoFactorEnabledData, TwoFactorError>> {
    try {
      // ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
          twoFactorSecret: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      if (user.twoFactorEnabled) {
        return Err({ type: 'TWO_FACTOR_ALREADY_ENABLED' });
      }

      if (!user.twoFactorSecret) {
        return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
      }

      // TOTP検証（enableTwoFactor専用）
      // 注: verifyTOTPはtwoFactorEnabled=trueを要求するため、
      // セットアップ中（まだenabled=false）は直接検証する
      let decryptedSecret: string;
      try {
        decryptedSecret = await this.decryptSecret(user.twoFactorSecret);
      } catch {
        return Err({ type: 'DECRYPTION_FAILED', message: '秘密鍵の復号化に失敗しました' });
      }

      // 一致した時間ステップを求め、有効化と同時に記録する（有効化に使ったコードのログインでの再利用を拒否、要件32.7）
      const matchedStep = this.matchTOTPStep(totpCode, decryptedSecret);

      if (matchedStep === null) {
        return Err({ type: 'INVALID_TOTP_CODE' });
      }

      // バックアップコードを再生成（TOTP検証成功後に新しいコードを生成）
      const plainTextBackupCodes = this.generateBackupCodes();

      // トランザクション内で2FAを有効化、既存バックアップコード削除、新規コード保存、監査ログ記録
      await this.prisma.$transaction(async (tx) => {
        // 2FAを有効化し、有効化に使ったコードの時間ステップを記録する
        await tx.user.update({
          where: { id: userId },
          data: { twoFactorEnabled: true, twoFactorLastUsedStep: matchedStep },
        });

        // 既存のバックアップコードを削除（setupTwoFactor時に生成されたもの）
        await tx.twoFactorBackupCode.deleteMany({
          where: { userId },
        });

        // 新しいバックアップコードをハッシュ化して保存
        for (const code of plainTextBackupCodes) {
          const codeHash = await hash(code);
          await tx.twoFactorBackupCode.create({
            data: {
              userId,
              codeHash,
            },
          });
        }

        // 監査ログを記録
        await tx.auditLog.create({
          data: {
            action: 'TWO_FACTOR_ENABLED',
            actorId: userId,
            ...(await snapshotAuditActor(tx, userId)),
            targetType: 'User',
            targetId: userId,
            metadata: {},
          },
        });
      }, connectBudgetTransactionOptions());

      // バックアップコードをXXXX-XXXX形式にフォーマット
      const formattedBackupCodes = plainTextBackupCodes.map(
        (code) => `${code.slice(0, 4)}-${code.slice(4, 8)}`
      );

      logger.info({ userId }, '2FAを有効化しました');
      return Ok({ backupCodes: formattedBackupCodes });
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, userId }, '2FA有効化中にエラーが発生しました');
      return Err({ type: 'INVALID_TOTP_CODE' });
    }
  }

  /**
   * バックアップコードステータス一覧取得
   *
   * 現在のバックアップコードの使用状況を取得する。
   * コードはハッシュ化されているため、マスク表示用のプレースホルダーを返す。
   * @requirement user-authentication/REQ-27B.1: プロフィール画面でバックアップコードを表示（使用済みコードをグレーアウト・取り消し線）
   *
   * @param userId - ユーザーID
   * @returns バックアップコードステータス配列
   */
  async getBackupCodesStatus(
    userId: string
  ): Promise<
    Result<Array<{ code: string; isUsed: boolean; usedAt: string | null }>, TwoFactorError>
  > {
    try {
      // ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      if (!user.twoFactorEnabled) {
        return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
      }

      // バックアップコードを取得
      const backupCodes = await this.prisma.twoFactorBackupCode.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          usedAt: true,
          createdAt: true,
        },
      });

      // コードはハッシュ化されているため、マスク表示用のプレースホルダーを生成
      const result = backupCodes.map((code, index) => ({
        code: `****-${String(index + 1).padStart(4, '0')}`, // ****-0001, ****-0002, ...
        isUsed: code.usedAt !== null,
        usedAt: code.usedAt ? code.usedAt.toISOString() : null,
      }));

      logger.debug({ userId, count: result.length }, 'バックアップコードステータスを取得しました');
      return Ok(result);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error(
        { err: error, userId },
        'バックアップコードステータス取得中にエラーが発生しました'
      );
      return Err({ type: 'USER_NOT_FOUND' });
    }
  }

  /**
   * バックアップコード再生成
   *
   * 既存のバックアップコードを全て削除し、新しく10個のバックアップコードを生成する。
   * @requirement user-authentication/REQ-27B.1-27B.3: バックアップコード管理機能の実装
   *
   * @param userId - ユーザーID
   * @returns 10個の平文バックアップコード配列（最後の表示機会）
   */
  async regenerateBackupCodes(userId: string): Promise<Result<string[], TwoFactorError>> {
    try {
      // ユーザー取得
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
        },
      });

      if (!user) {
        return Err({ type: 'USER_NOT_FOUND' });
      }

      if (!user.twoFactorEnabled) {
        return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
      }

      // 新しいバックアップコードを生成（平文）
      const plainTextCodes = this.generateBackupCodes();

      // トランザクション内で既存コード削除 + 新規コード追加
      await this.prisma.$transaction(async (tx) => {
        // 既存のバックアップコードを全て削除
        await tx.twoFactorBackupCode.deleteMany({
          where: { userId },
        });

        // 新しいバックアップコードをハッシュ化して保存
        for (const code of plainTextCodes) {
          const codeHash = await hash(code);
          await tx.twoFactorBackupCode.create({
            data: {
              userId,
              codeHash,
            },
          });
        }
      }, connectBudgetTransactionOptions());

      logger.info({ userId }, 'バックアップコードを再生成しました');
      return Ok(plainTextCodes);
    } catch (error) {
      // 接続のタイムアウトは飲み込まず、エラーハンドラーの 503 へ届ける（要件24.1）
      rethrowIfDatabaseConnectionTimeout(error);
      logger.error({ err: error, userId }, 'バックアップコード再生成中にエラーが発生しました');
      return Err({ type: 'USER_NOT_FOUND' });
    }
  }
  /**
   * 管理者による他の利用者の 2FA の再設定
   *
   * 1 トランザクションで秘密鍵・再登録中の秘密鍵・バックアップコードを消して未登録にし、全リフレッシュ
   * トークンを失効させ、アクセストークンの世代を 1 つ進め（再設定より前のアクセストークンを認証ミドルウェアが
   * 拒否する）、監査 `TWO_FACTOR_RESET_BY_ADMIN`（実行者・対象）を記録する。コミットの後に
   * 対象者の状態のキャッシュを無効化し、次の要求から TTL を待たずに 2FA 未登録として扱わせる。
   * @requirement user-authentication/REQ-34.7
   * @requirement user-authentication/REQ-34.9
   * @requirement user-authentication/REQ-34.10
   *
   * @param actorId - 実行者（管理者）の ID
   * @param targetUserId - 対象者の ID
   * @param ctx - 監査に記録する送信元の情報
   */
  async resetByAdmin(
    actorId: string,
    targetUserId: string,
    ctx: TwoFactorRequestContext = {}
  ): Promise<Result<void, TwoFactorResetError>> {
    // 自分自身の再設定は拒否する（要件34.9）
    if (actorId === targetUserId) {
      return Err({ type: 'SELF_RESET_FORBIDDEN' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true },
      });
      if (!target) {
        return Err({ type: 'USER_NOT_FOUND' as const });
      }

      // ローテーションと直列化して全リフレッシュトークンを失効させる（要件34.7）
      const revokedRefreshTokens = await revokeAllRefreshTokensForUser(tx, targetUserId);
      await tx.twoFactorBackupCode.deleteMany({ where: { userId: targetUserId } });
      // 再設定より前に発行されたアクセストークンを拒否するため、アクセストークンの世代を進める（要件34.7。
      // 認証ミドルウェアが発行時の世代 gen と比べる。時刻でなく番号で比べ、同じ秒の再ログインを拒否しない）
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          accessTokenGeneration: { increment: 1 },
        },
      });

      // 実行者と対象者を記録する（要件34.10）
      await tx.auditLog.create({
        data: {
          action: 'TWO_FACTOR_RESET_BY_ADMIN',
          actorId,
          ...(await snapshotAuditActor(tx, actorId)),
          targetType: 'User',
          targetId: targetUserId,
          metadata: {
            targetEmail: target.email,
            revokedRefreshTokens,
            ...(ctx.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
            ...(ctx.userAgent !== undefined && { userAgent: ctx.userAgent }),
          },
        },
      });
      return Ok(undefined);
    }, connectBudgetTransactionOptions());

    // コミットの後に対象者の状態のキャッシュを無効化する（タスク47.5）。再設定はコミット済みのため、
    // 無効化の失敗は結果を変えず警告ログに留める
    if (result.ok && this.userStateService) {
      try {
        await this.userStateService.invalidate(targetUserId);
      } catch (error) {
        logger.warn(
          { err: error, userId: targetUserId },
          'Failed to invalidate user state after 2FA reset'
        );
      }
    }

    if (result.ok) {
      logger.info({ actorId, targetUserId }, '管理者が2FAを再設定しました');
    }
    return result;
  }

  /**
   * 再登録の開始
   *
   * 現在の秘密鍵の TOTP を検証（時間ステップを記録し再利用を拒否）した後、新しい秘密鍵を
   * 再登録中の秘密鍵（`two_factor_pending_secret`）に置く。確認までは既存の秘密鍵が有効である。
   * @requirement user-authentication/REQ-34.11
   *
   * @param userId - 利用者 ID
   * @param currentCode - 現在の秘密鍵の TOTP コード
   * @returns 新しい秘密鍵の QR コードと手入力用の秘密鍵
   */
  async startReenrollment(
    userId: string,
    currentCode: string
  ): Promise<Result<TwoFactorReenrollmentStartData, TwoFactorError>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) {
      return Err({ type: 'USER_NOT_FOUND' });
    }
    if (!user.twoFactorEnabled) {
      return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
    }

    // 現在の秘密鍵の TOTP を確かめる（再利用は CODE_ALREADY_USED）
    const verified = await this.verifyTOTP(userId, currentCode);
    if (!verified.ok) {
      return verified;
    }
    if (!verified.value) {
      return Err({ type: 'INVALID_TOTP_CODE' });
    }

    const plainTextSecret = this.generateTOTPSecret();
    const encryptedSecret = await this.encryptSecret(plainTextSecret);
    const qrCodeDataUrl = await this.generateQRCode(user.email, plainTextSecret);

    // 再登録中の秘密鍵として置く（既存の秘密鍵は確認まで変えない。開始のやり直しは上書きする）
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecret: encryptedSecret },
    });

    logger.info({ userId }, '2FAの再登録を開始しました');
    return Ok({ qrCodeDataUrl, secretForManualEntry: plainTextSecret });
  }

  /**
   * 再登録の確認
   *
   * 再登録中の秘密鍵の TOTP を確かめ、1 トランザクションで本採用（既存の秘密鍵を置き換え）し、
   * バックアップコードを作り直し、監査 `TWO_FACTOR_REENROLLED` を記録する。
   * @requirement user-authentication/REQ-34.11
   *
   * @param userId - 利用者 ID
   * @param newCode - 新しい秘密鍵の TOTP コード
   * @param ctx - 監査に記録する送信元の情報
   * @returns 新しいバックアップコード（XXXX-XXXX 形式、最後の表示機会）
   */
  async confirmReenrollment(
    userId: string,
    newCode: string,
    ctx: TwoFactorRequestContext = {}
  ): Promise<Result<TwoFactorEnabledData, TwoFactorError>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorPendingSecret: true },
    });
    if (!user) {
      return Err({ type: 'USER_NOT_FOUND' });
    }
    if (!user.twoFactorEnabled) {
      return Err({ type: 'TWO_FACTOR_NOT_ENABLED' });
    }
    const pendingSecret = user.twoFactorPendingSecret;
    if (!pendingSecret) {
      return Err({ type: 'REENROLLMENT_NOT_STARTED' });
    }

    let decryptedSecret: string;
    try {
      decryptedSecret = await this.decryptSecret(pendingSecret);
    } catch {
      return Err({ type: 'DECRYPTION_FAILED', message: '秘密鍵の復号化に失敗しました' });
    }
    const matchedStep = this.matchTOTPStep(newCode, decryptedSecret);
    if (matchedStep === null) {
      return Err({ type: 'INVALID_TOTP_CODE' });
    }

    const plainTextBackupCodes = this.generateBackupCodes();
    const replaced = await this.prisma.$transaction(async (tx) => {
      // 確かめた再登録中の秘密鍵のままのときだけ置き換える（並行する開始のやり直しで別の鍵を採用しない）
      const { count } = await tx.user.updateMany({
        where: { id: userId, twoFactorEnabled: true, twoFactorPendingSecret: pendingSecret },
        data: {
          twoFactorSecret: pendingSecret,
          twoFactorPendingSecret: null,
          twoFactorLastUsedStep: matchedStep,
        },
      });
      if (count === 0) {
        return false;
      }

      await tx.twoFactorBackupCode.deleteMany({ where: { userId } });
      for (const code of plainTextBackupCodes) {
        await tx.twoFactorBackupCode.create({ data: { userId, codeHash: await hash(code) } });
      }

      await tx.auditLog.create({
        data: {
          action: 'TWO_FACTOR_REENROLLED',
          actorId: userId,
          ...(await snapshotAuditActor(tx, userId)),
          targetType: 'User',
          targetId: userId,
          metadata: {
            ...(ctx.ipAddress !== undefined && { ipAddress: ctx.ipAddress }),
            ...(ctx.userAgent !== undefined && { userAgent: ctx.userAgent }),
          },
        },
      });
      return true;
    }, connectBudgetTransactionOptions());

    if (!replaced) {
      return Err({ type: 'REENROLLMENT_NOT_STARTED' });
    }

    logger.info({ userId }, '2FAを再登録しました');
    return Ok({
      backupCodes: plainTextBackupCodes.map((code) => `${code.slice(0, 4)}-${code.slice(4, 8)}`),
    });
  }
}
