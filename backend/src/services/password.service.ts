/**
 * @fileoverview パスワード管理サービス
 *
 * Requirements:
 * - 2.6: パスワード複雑性要件（12文字以上、3種類以上の文字種）
 * - 2.7: 禁止パスワードリスト（HIBP Pwned Passwords、Bloom Filter実装、偽陽性率0.001）
 * - 2.8: パスワードにメールアドレス・表示名含有チェック
 * - 2.9: Argon2idハッシュ化（メモリコスト: 64MB、時間コスト: 3、並列度: 4）
 * - 7.6: 過去3回のパスワード履歴を保持
 * - 7.7: 過去3回のパスワードと一致する場合にエラー
 * - 7.8: 最新3件のみ保持、古いパスワード履歴を自動削除
 * - 10.2: Argon2idアルゴリズム使用
 */

import { hash, verify } from '@node-rs/argon2';
import type { PrismaClient, Prisma } from '@prisma/client';
import {
  PasswordViolation,
  type PasswordError,
  type Result,
  Ok,
  Err,
} from '../types/password.types.js';
import { EmailService } from './email.service.js';
import { randomBytes } from 'crypto';

/**
 * パスワード管理サービス
 *
 * セキュアなパスワードのハッシュ化、検証、強度チェック、履歴管理を提供します。
 */
export class PasswordService {
  /**
   * Argon2idハッシュ化パラメータ
   * - メモリコスト: 64MB (65536 KB)
   * - 時間コスト: 3
   * - 並列度: 4
   */
  private readonly ARGON2_MEMORY_COST = 65536; // 64MB in KB
  private readonly ARGON2_TIME_COST = 3;
  private readonly ARGON2_PARALLELISM = 4;

  /**
   * パスワード強度要件
   */
  private readonly MIN_PASSWORD_LENGTH = 12;
  private readonly MIN_CHAR_TYPES = 3; // 大文字、小文字、数字、特殊文字のうち3種類以上

  /**
   * パスワード履歴保持数
   */
  private readonly PASSWORD_HISTORY_LIMIT = 3;

  /**
   * リセットトークン有効期限（24時間）
   */
  private readonly RESET_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24時間（ミリ秒）

  private readonly emailService: EmailService;

  constructor(
    private readonly prisma: PrismaClient,
    emailService?: EmailService
  ) {
    this.emailService = emailService || new EmailService();
  }

  /**
   * パスワードをArgon2idアルゴリズムでハッシュ化する
   *
   * @param password - ハッシュ化するパスワード
   * @returns Argon2idハッシュ文字列
   */
  async hashPassword(password: string): Promise<string> {
    return await hash(password, {
      memoryCost: this.ARGON2_MEMORY_COST,
      timeCost: this.ARGON2_TIME_COST,
      parallelism: this.ARGON2_PARALLELISM,
      outputLen: 32, // 32バイト（256ビット）の出力
    });
  }

  /**
   * パスワードとハッシュを検証する
   *
   * @param password - 検証するパスワード
   * @param hash - 比較対象のArgon2idハッシュ
   * @returns 検証成功ならtrue、失敗ならfalse
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await verify(hash, password);
    } catch {
      // ハッシュ形式が不正な場合は検証失敗として扱う
      return false;
    }
  }

  /**
   * パスワード強度を検証する
   *
   * 以下のチェックを実行：
   * 1. 長さチェック（12文字以上）
   * 2. 複雑性チェック（大文字、小文字、数字、特殊文字のうち3種類以上）
   * 3. ユーザー情報含有チェック（メールアドレス、表示名を含まない）
   * 4. 漏洩パスワードチェック（Bloom Filter、簡易実装）
   *
   * @param password - 検証するパスワード
   * @param userInputs - ユーザー入力情報（メールアドレス、表示名など）
   * @returns パスワード強度検証結果
   */
  async validatePasswordStrength(
    password: string,
    userInputs: string[]
  ): Promise<Result<void, PasswordError>> {
    const violations: PasswordViolation[] = [];

    // 1. 長さチェック（12文字以上）
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      violations.push(PasswordViolation.TOO_SHORT);
    }

    // 2. 複雑性チェック（3種類以上の文字種）
    const charTypeCount = this.countCharacterTypes(password);

    // 3種類未満の場合のみ、どの文字種が足りないかをチェック
    if (charTypeCount < this.MIN_CHAR_TYPES) {
      // 各文字種の有無をチェック
      if (!/[A-Z]/.test(password)) {
        violations.push(PasswordViolation.NO_UPPERCASE);
      }
      if (!/[a-z]/.test(password)) {
        violations.push(PasswordViolation.NO_LOWERCASE);
      }
      if (!/[0-9]/.test(password)) {
        violations.push(PasswordViolation.NO_DIGIT);
      }
      if (!/[^a-zA-Z0-9]/.test(password)) {
        violations.push(PasswordViolation.NO_SPECIAL_CHAR);
      }
    }

    // 3. ユーザー情報含有チェック
    if (userInputs.length > 0) {
      const lowerPassword = password.toLowerCase();
      const containsUserInfo = userInputs.some((input) => {
        const lowerInput = input.toLowerCase().replace(/\s+/g, ''); // スペース削除
        return lowerPassword.includes(lowerInput);
      });

      if (containsUserInfo) {
        violations.push(PasswordViolation.CONTAINS_USER_INFO);
      }
    }

    // 4. 漏洩パスワードチェック（Bloom Filter）
    // TODO: タスク1.4でBloom Filterデータを準備した後に本格実装
    // 現在は簡易的な一般的パスワードチェックのみ
    if (this.isCommonPassword(password)) {
      violations.push(PasswordViolation.COMMON_PASSWORD);
    }

    if (violations.length > 0) {
      return Err({ type: 'WEAK_PASSWORD', violations });
    }

    return Ok(undefined);
  }

  /**
   * パスワードの文字種の数をカウントする
   *
   * @param password - パスワード
   * @returns 文字種の数（0-4）
   */
  private countCharacterTypes(password: string): number {
    let count = 0;

    // 小文字
    if (/[a-z]/.test(password)) count++;
    // 大文字
    if (/[A-Z]/.test(password)) count++;
    // 数字
    if (/[0-9]/.test(password)) count++;
    // 特殊文字
    if (/[^a-zA-Z0-9]/.test(password)) count++;

    return count;
  }

  /**
   * 一般的な漏洩パスワードかどうかをチェックする（簡易実装）
   *
   * TODO: タスク1.4でBloom Filterを統合して本格実装
   *
   * @param password - パスワード
   * @returns 一般的な漏洩パスワードならtrue
   */
  private isCommonPassword(password: string): boolean {
    // 簡易的な一般的パスワードリスト
    const commonPasswords = [
      'password',
      'password123',
      '12345678',
      'qwerty',
      'abc123',
      'monkey',
      '1234567',
      'letmein',
      'trustno1',
      'dragon',
      'baseball',
      'iloveyou',
      'master',
      'sunshine',
      'ashley',
      'bailey',
      'passw0rd',
      'shadow',
      '123123',
      '654321',
      'superman',
      'qazwsx',
      'michael',
      'football',
    ];

    const lowerPassword = password.toLowerCase();
    return commonPasswords.some((common) => lowerPassword.includes(common));
  }

  /**
   * パスワードが過去3回のパスワード履歴と一致しないかチェックする
   *
   * @param userId - ユーザーID
   * @param newPassword - 新しいパスワード
   * @returns パスワードが履歴と一致しない場合はtrue、一致する場合はfalse
   */
  async checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
    // 最新3件のパスワード履歴を取得
    const passwordHistory = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: this.PASSWORD_HISTORY_LIMIT,
    });

    // パスワード履歴が空の場合は常にユニーク
    if (passwordHistory.length === 0) {
      return true;
    }

    // 各履歴パスワードと比較
    for (const history of passwordHistory) {
      const isMatch = await this.verifyPassword(newPassword, history.passwordHash);
      if (isMatch) {
        return false; // パスワードが再利用されている
      }
    }

    return true; // パスワードは履歴と一致しない
  }

  /**
   * パスワードリセット要求
   *
   * 処理フロー:
   * 1. メールアドレスでユーザーを検索
   * 2. ユーザーが存在する場合:
   *    - 暗号学的に安全なリセットトークンを生成（32バイト）
   *    - PasswordResetTokenテーブルに保存（24時間有効期限）
   *    - EmailService経由でパスワードリセットメールを送信
   * 3. セキュリティのため、ユーザー不在でも常に成功レスポンスを返す
   *
   * @param email - メールアドレス
   * @returns 常に成功レスポンス（セキュリティのため）
   */
  async requestPasswordReset(email: string): Promise<Result<void, PasswordError>> {
    try {
      // 1. ユーザー検索
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      // 2. ユーザーが存在しない場合でも成功を返す（セキュリティのため）
      if (!user) {
        return Ok(undefined);
      }

      // 3. 暗号学的に安全なリセットトークンを生成（32バイト = 256ビット）
      const resetToken = randomBytes(32).toString('hex');

      // 4. リセットトークンをデータベースに保存（24時間有効期限）
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt: new Date(Date.now() + this.RESET_TOKEN_EXPIRY),
        },
      });

      // 5. パスワードリセットメール送信
      await this.emailService.sendPasswordResetEmail(email, resetToken);

      return Ok(undefined);
    } catch {
      // データベースエラーなどの場合
      return Err({ type: 'RESET_TOKEN_INVALID' });
    }
  }

  /**
   * パスワード更新の共通処理（トランザクション内）
   *
   * 以下を実行:
   * 1. パスワード更新
   * 2. PasswordHistory追加（最新3件のみ保持、古い履歴を削除）
   * 3. 全RefreshToken無効化
   *
   * @param tx - Prismaトランザクション
   * @param userId - ユーザーID
   * @param passwordHash - 新しいパスワードハッシュ
   */
  private async updatePasswordInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    passwordHash: string
  ): Promise<void> {
    // パスワード更新
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // パスワード履歴追加
    await tx.passwordHistory.create({
      data: {
        userId,
        passwordHash,
      },
    });

    // 古いパスワード履歴を削除（最新3件のみ保持）
    const allHistories = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (allHistories.length > this.PASSWORD_HISTORY_LIMIT) {
      const historiesToDelete = allHistories.slice(this.PASSWORD_HISTORY_LIMIT);
      await tx.passwordHistory.deleteMany({
        where: {
          id: {
            in: historiesToDelete.map((h) => h.id),
          },
        },
      });
    }

    // 全リフレッシュトークンを無効化（セキュリティのため）
    await tx.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * パスワードリセット実行
   *
   * 処理フロー:
   * 1. リセットトークン検証（存在、有効期限、未使用）
   * 2. パスワード強度検証
   * 3. パスワード履歴チェック（過去3回と一致しない）
   * 4. トランザクション内で:
   *    - パスワード更新
   *    - PasswordHistory追加（最新3件のみ保持、古い履歴を削除）
   *    - 全RefreshToken無効化
   *    - PasswordResetToken使用済みマーク
   *
   * @param resetToken - リセットトークン
   * @param newPassword - 新しいパスワード
   * @returns 成功またはエラー
   */
  async resetPassword(
    resetToken: string,
    newPassword: string
  ): Promise<Result<void, PasswordError>> {
    try {
      // 1. リセットトークン検証
      const passwordResetToken = await this.prisma.passwordResetToken.findUnique({
        where: { token: resetToken },
      });

      // トークンが存在しない
      if (!passwordResetToken) {
        return Err({ type: 'RESET_TOKEN_INVALID' });
      }

      // トークンが既に使用済み
      if (passwordResetToken.usedAt) {
        return Err({ type: 'RESET_TOKEN_INVALID' });
      }

      // トークンの有効期限切れ
      if (passwordResetToken.expiresAt < new Date()) {
        return Err({ type: 'RESET_TOKEN_EXPIRED' });
      }

      // 2. パスワード強度検証
      const passwordValidationResult = await this.validatePasswordStrength(newPassword, []);
      if (!passwordValidationResult.ok) {
        return passwordValidationResult;
      }

      // 3. パスワード履歴チェック
      const isPasswordUnique = await this.checkPasswordHistory(
        passwordResetToken.userId,
        newPassword
      );
      if (!isPasswordUnique) {
        return Err({ type: 'PASSWORD_REUSED' });
      }

      // 4. パスワードハッシュ化
      const passwordHash = await this.hashPassword(newPassword);

      // 5. トランザクション内でパスワード更新、履歴追加、トークン無効化、セッション削除
      await this.prisma.$transaction(async (tx) => {
        // 共通のパスワード更新処理
        await this.updatePasswordInTransaction(tx, passwordResetToken.userId, passwordHash);

        // リセットトークンを使用済みにマーク
        await tx.passwordResetToken.update({
          where: { id: passwordResetToken.id },
          data: {
            usedAt: new Date(),
          },
        });
      });

      return Ok(undefined);
    } catch {
      return Err({ type: 'RESET_TOKEN_INVALID' });
    }
  }

  /**
   * パスワード変更
   *
   * 処理フロー:
   * 1. ユーザー検索
   * 2. 現在のパスワード検証
   * 3. パスワード強度検証
   * 4. パスワード履歴チェック（過去3回と一致しない）
   * 5. トランザクション内で:
   *    - パスワード更新
   *    - PasswordHistory追加（最新3件のみ保持、古い履歴を削除）
   *    - 全RefreshToken無効化
   *
   * @param userId - ユーザーID
   * @param currentPassword - 現在のパスワード
   * @param newPassword - 新しいパスワード
   * @returns 成功またはエラー
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<Result<void, PasswordError>> {
    try {
      // 1. ユーザー検索
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return Err({ type: 'RESET_TOKEN_INVALID' }); // USER_NOT_FOUND相当
      }

      // 2. 現在のパスワード検証
      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return Err({ type: 'RESET_TOKEN_INVALID' }); // INVALID_PASSWORD相当
      }

      // 3. パスワード強度検証
      const passwordValidationResult = await this.validatePasswordStrength(newPassword, []);
      if (!passwordValidationResult.ok) {
        return passwordValidationResult;
      }

      // 4. パスワード履歴チェック
      const isPasswordUnique = await this.checkPasswordHistory(userId, newPassword);
      if (!isPasswordUnique) {
        return Err({ type: 'PASSWORD_REUSED' });
      }

      // 5. パスワードハッシュ化
      const passwordHash = await this.hashPassword(newPassword);

      // 6. トランザクション内でパスワード更新、履歴追加、セッション削除
      await this.prisma.$transaction(async (tx) => {
        // 共通のパスワード更新処理
        await this.updatePasswordInTransaction(tx, userId, passwordHash);
      });

      return Ok(undefined);
    } catch {
      return Err({ type: 'RESET_TOKEN_INVALID' });
    }
  }
}
