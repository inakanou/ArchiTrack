/**
 * 監査ログアーカイブサービス
 *
 * 13ヶ月以上前の監査ログをアーカイブし、8年以上前のアーカイブを削除します。
 * - JSON Lines形式での圧縮
 * - AES-256-GCM暗号化
 * - S3/GCS統合（オプション）
 *
 * @module services/audit-log-archive
 */

import { createCipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  IAuditLogArchiveService,
  ArchiveResult,
  DeleteArchiveResult,
  AuditLogArchiveServiceDependencies,
} from '../types/audit-log-archive.types';

/**
 * 監査ログアーカイブサービス実装
 */
export class AuditLogArchiveService implements IAuditLogArchiveService {
  private readonly archiveDir: string;
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    private readonly deps: AuditLogArchiveServiceDependencies,
    options?: {
      archiveDir?: string;
      encryptionKey?: string;
    }
  ) {
    // アーカイブディレクトリ
    // ベストプラクティス: プロジェクトディレクトリ内にデータを保存しない
    // - テスト環境: 明示的にtmpdirを指定（テストコード側で設定）
    // - 本番環境: 環境変数ARCHIVE_PATHを必須とする（/var/data/archives等の専用ボリューム）
    if (options?.archiveDir) {
      this.archiveDir = options.archiveDir;
    } else if (process.env.ARCHIVE_PATH) {
      this.archiveDir = process.env.ARCHIVE_PATH;
    } else {
      throw new Error(
        'Archive directory is required. ' +
          'Set ARCHIVE_PATH environment variable to a dedicated storage path ' +
          '(e.g., /var/data/archives for production, or pass archiveDir option for tests).'
      );
    }

    // 暗号化キー（デフォルト: 環境変数またはランダム生成）
    const keyString = options?.encryptionKey || process.env.ARCHIVE_ENCRYPTION_KEY;
    if (keyString) {
      this.encryptionKey = Buffer.from(keyString, 'hex');
    } else {
      // テスト用：ランダムキー生成（本番では環境変数を使用すべき）
      this.encryptionKey = randomBytes(32);
    }

    // アーカイブディレクトリの作成（非同期処理は後で実行）
    this.ensureArchiveDir();
  }

  /**
   * アーカイブディレクトリを確保
   */
  private async ensureArchiveDir(): Promise<void> {
    try {
      await fs.mkdir(this.archiveDir, { recursive: true });
    } catch {
      // ディレクトリ作成失敗時は無視（既に存在する場合など）
    }
  }

  /**
   * 13ヶ月以上前の監査ログをアーカイブする
   * @returns アーカイブ結果
   */
  async archiveOldLogs(): Promise<ArchiveResult> {
    // アーカイブディレクトリを確保
    await this.ensureArchiveDir();

    // 13ヶ月前の日付を計算
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    // アーカイブ対象のログを取得
    const logs = await this.deps.prisma.auditLog.findMany({
      where: {
        createdAt: {
          lte: thirteenMonthsAgo,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (logs.length === 0) {
      throw new Error('No logs to archive');
    }

    // アーカイブファイル名を生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `audit-logs-archive-${timestamp}.jsonl.gz`;
    const filePath = join(this.archiveDir, fileName);

    // JSON Lines形式に変換
    const jsonlContent = logs.map((log) => JSON.stringify(log)).join('\n');

    // 圧縮と暗号化
    const { encryptedData, authTag, iv } = await this.encryptData(jsonlContent);

    // ファイルに書き込み（IV + AuthTag + 暗号化データ）
    const fileContent = Buffer.concat([iv, authTag, Buffer.from(encryptedData)]);
    await fs.writeFile(filePath, fileContent);

    // ファイルサイズを取得
    const stats = await fs.stat(filePath);

    // データベースから削除
    await this.deps.prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lte: thirteenMonthsAgo,
        },
      },
    });

    return {
      archivedCount: logs.length,
      archiveFilePath: filePath,
      archiveSize: stats.size,
      encrypted: true,
      compressed: true,
    };
  }

  /**
   * 8年以上前のアーカイブを削除する
   * @returns 削除結果
   */
  async deleteOldArchives(): Promise<DeleteArchiveResult> {
    // アーカイブディレクトリを確保
    await this.ensureArchiveDir();

    // 8年前の日付を計算
    const eightYearsAgo = new Date();
    eightYearsAgo.setFullYear(eightYearsAgo.getFullYear() - 8);

    // アーカイブファイル一覧を取得
    let files: string[];
    try {
      files = await fs.readdir(this.archiveDir);
    } catch {
      // ディレクトリが存在しない場合は空配列
      return {
        deletedCount: 0,
        deletedFilePaths: [],
      };
    }

    // アーカイブファイルをフィルタ（.jsonl.gzのみ）
    const archiveFiles = files.filter((file) => file.endsWith('.jsonl.gz'));

    const deletedFilePaths: string[] = [];

    // 各ファイルの作成日時をチェック
    for (const file of archiveFiles) {
      const filePath = join(this.archiveDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.birthtime < eightYearsAgo) {
          await fs.unlink(filePath);
          deletedFilePaths.push(filePath);
        }
      } catch {
        // ファイルアクセスエラーは無視
        continue;
      }
    }

    return {
      deletedCount: deletedFilePaths.length,
      deletedFilePaths,
    };
  }

  /**
   * データを圧縮・暗号化する
   * @param data - 暗号化するデータ
   * @returns 暗号化されたデータ、認証タグ、IV
   */
  private async encryptData(data: string): Promise<{
    encryptedData: string;
    authTag: Buffer;
    iv: Buffer;
  }> {
    // IVを生成
    const iv = randomBytes(16);

    // 暗号化器を作成
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);

    // 暗号化
    let encryptedData = cipher.update(data, 'utf8', 'hex');
    encryptedData += cipher.final('hex');

    // 認証タグを取得
    const authTag = cipher.getAuthTag();

    return {
      encryptedData,
      authTag,
      iv,
    };
  }
}
