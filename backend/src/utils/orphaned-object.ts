/**
 * @fileoverview 孤立ファイルの回収ユーティリティ
 *
 * どこからも参照されなくなったストレージ上の実体を、専用プレフィックス
 * （orphaned/）へ移して回収対象にします。orphaned/ 配下は Object Lifecycle Rule
 * により 7 日後に自動削除されます。
 *
 * 回収は「コピー」であり、元の実体を消しません。元の実体を消してよいかどうかは
 * 呼び出し元の文脈に依存するため、この関数は判断しません。
 *
 * Requirements:
 * - 4.8: 孤立ファイルとして専用プレフィックス（orphaned/）に移動し、
 *   Object Lifecycle Rule により 7 日後に自動削除する
 *
 * @module utils/orphaned-object
 */

import logger from './logger.js';

/** 孤立ファイルの回収先プレフィックス */
export const ORPHANED_PREFIX = 'orphaned';

/**
 * 回収に必要な最小限のストレージ能力
 *
 * copy を持たない構成（S3Client 直利用など）も呼び出せるよう任意にしています。
 */
export interface OrphanCapableStorage {
  copy?: (sourceKey: string, destinationKey: string) => Promise<void>;
}

/**
 * 孤立ファイルの回収先キーを求める
 *
 * @param originalPath - 元のファイルパス
 * @returns orphaned/ プレフィックスを付与したパス
 */
export function toOrphanedPath(originalPath: string): string {
  return `${ORPHANED_PREFIX}/${originalPath}`;
}

/**
 * 孤立ファイルを orphaned/ プレフィックスへ移動する
 *
 * コピーに成功した場合は警告レベル、失敗した場合はエラーレベル（Sentryアラート）で
 * 記録します。いずれの場合も例外はスローしません（回収は best-effort）。
 *
 * Requirements: 4.8
 *
 * @param storage - ストレージプロバイダー（copy 非対応・未設定の場合はログのみ）
 * @param originalPath - 回収対象のファイルパス
 * @param cause - 孤立の原因となったエラー
 * @param context - ログに併記する追加情報（imageId など）
 */
export async function moveToOrphaned(
  storage: OrphanCapableStorage | null | undefined,
  originalPath: string,
  cause: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const orphanedPath = toOrphanedPath(originalPath);
  const causeMessage = cause instanceof Error ? cause.message : 'Unknown error';

  try {
    if (storage && storage.copy) {
      await storage.copy(originalPath, orphanedPath);

      // コピー成功: 警告レベルでログ記録
      logger.warn(
        {
          ...context,
          originalPath,
          orphanedPath,
          path: orphanedPath,
          deleteError: causeMessage,
        },
        '孤立ファイル: orphaned/プレフィックスに移動しました。7日後に自動削除されます。'
      );
    } else {
      // copy を持たない構成では従来通りログのみ（手動対応が必要）
      logger.warn(
        {
          ...context,
          path: originalPath,
          error: causeMessage,
        },
        '孤立ファイル: ストレージからのファイル削除に失敗しました。手動での削除が必要です。'
      );
    }
  } catch (copyError) {
    // コピー失敗: エラーレベルでログ記録（Sentryアラート）
    logger.error(
      {
        ...context,
        originalPath,
        orphanedPath,
        error: copyError instanceof Error ? copyError.message : 'Unknown error',
        deleteError: causeMessage,
      },
      '孤立ファイルの移動に失敗しました。手動での確認が必要です。'
    );
  }
}
