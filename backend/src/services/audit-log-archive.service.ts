/**
 * 監査ログのアーカイブ（user-authentication 要件41.1、41.2、41.4、41.6）
 *
 * design.md の AuditLogArchiveService の節に従う。
 * - 13 か月以上前の月（UTC）ごとに、行を JSON Lines にして gzip の後に AES-256-GCM で暗号化し、
 *   保存先（StorageProvider）の `audit-archives/YYYY/MM.jsonl.gz.enc` へ書く
 * - 件数・圧縮前の SHA-256・HMAC を持つ目録を `audit-archives/YYYY/MM.manifest.json` へ書く
 *   （本文の後に書き、目録の有無で済みを判定する）
 * - 読み戻して目録と照合し、一致したときだけ、アーカイブの許可の設定の下で同じ月の行を
 *   1 トランザクションで消す。成功の監査 AUDIT_ARCHIVE_CREATED も同じトランザクションに書く
 * - 失敗したときは行を残し、監査 AUDIT_ARCHIVE_FAILED と全システム管理者への通知を行う
 * - 8 年の判定は目録の period.to で行う（ファイルの作成日時を使わない）
 * - 鍵が無いときは乱数の鍵を作らず KEY_MISSING を返す（本番の起動時の停止は runtime-mode.ts）
 * - 復元（要件41.5）は指定期間に重なる月のアーカイブを復号・照合し、期間の行を返す。
 *   照合に失敗した月があれば行を返さず INTEGRITY_FAILED を返す。行を監査ログへ戻さない
 *
 * 暗号化の鍵と HMAC の鍵は ARCHIVE_ENCRYPTION_KEY から HKDF-SHA256 で別々に導出する。
 * 本文の形式は「版（1 バイト）・IV（12 バイト）・認証タグ（16 バイト）・暗号文」で、
 * 追加の認証データに対象の月を入れて、別の月の本文との差し替えを検知する。
 *
 * @module services/audit-log-archive
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import type { Prisma } from '../generated/prisma/client.js';
import { ARCHIVE_ENCRYPTION_KEY_PATTERN } from '../config/env.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';
import { Ok, Err, type Result } from '../types/result.js';
import type {
  ArchiveError,
  ArchiveManifest,
  AuditLogArchiveServiceDependencies,
  AuditLogRecord,
  FailedArchiveMonth,
  IAuditLogArchiveService,
  MonthlyArchiveRunResult,
  RestoredAuditLogs,
} from '../types/audit-log-archive.types.js';
import { withAuditArchivePermission } from '../utils/audit-log-archive-permission.js';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';

/** 保存先の接頭辞 */
export const AUDIT_ARCHIVE_PREFIX = 'audit-archives/';

/** アクティブな監査ログを保つ月数（これより前の月をアーカイブする） */
export const ACTIVE_RETENTION_MONTHS = 13;

/** アーカイブを保つ年数 */
export const ARCHIVE_RETENTION_YEARS = 8;

/**
 * 8 年の消去で目録を探す最も古い月の既定
 *
 * 保存先の抽象（StorageProvider）は一覧を持たないため、この月から消去の基準の月までの目録を
 * 月ごとに探す。監査ログは本システムの運用の開始（2025 年）より前に存在しない。
 */
export const ARCHIVE_EARLIEST_MONTH = '2025-01';

/**
 * 一度の復元で扱う月の数の上限
 *
 * アーカイブは作成から 13 か月で作られ、期間の終わりから 8 年で消えるため、保存されうる月は
 * 約 9 年分に収まる。その全体を一度に復元できる 10 年分を上限とする。
 */
export const RESTORE_MAX_MONTHS = 120;

/** 監査の対象の種別 */
export const ARCHIVE_TARGET_TYPE = 'AuditLogArchive';

/** 本文の形式の版 */
const ARCHIVE_FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * 想定の範囲の失敗（Result の Err へ写す）
 */
export class ArchiveFailure extends Error {
  constructor(readonly archiveError: ArchiveError) {
    super(archiveError.type);
  }
}

interface ArchiveKeys {
  encryptionKey: Buffer;
  hmacKey: Buffer;
  keyId: string;
}

interface MonthRange {
  from: Date;
  /** 月末（その月の最後のミリ秒） */
  to: Date;
}

/**
 * YYYY-MM を UTC の月の範囲にする
 */
export function monthRange(month: string): MonthRange {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new RangeError(`Invalid archive month: ${month}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1) - 1);
  return { from, to };
}

function formatMonth(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

/**
 * 期間（両端を含む）に重なる UTC の月（YYYY-MM）を古い順に返す
 *
 * from が to より後、日時が不正、または月の数が RESTORE_MAX_MONTHS を超えるときは RangeError。
 */
export function restoreMonthsOf(from: Date, to: Date): string[] {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new RangeError('Invalid restore period');
  }
  if (from > to) {
    throw new RangeError('Restore period starts after it ends');
  }
  const count =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth()) +
    1;
  if (count > RESTORE_MAX_MONTHS) {
    throw new RangeError(`Restore period exceeds ${RESTORE_MAX_MONTHS} months`);
  }
  const months: string[] = [];
  for (let index = 0; index < count; index += 1) {
    months.push(
      formatMonth(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + index, 1)))
    );
  }
  return months;
}

/**
 * 本文と目録の保存先のキー
 */
export function archiveKeysOf(month: string): { archiveKey: string; manifestKey: string } {
  monthRange(month);
  const [year, mm] = month.split('-');
  return {
    archiveKey: `${AUDIT_ARCHIVE_PREFIX}${year}/${mm}.jsonl.gz.enc`,
    manifestKey: `${AUDIT_ARCHIVE_PREFIX}${year}/${mm}.manifest.json`,
  };
}

/**
 * 境界を決める暦の時間帯（定期処理の cron と同じ。scheduled-job-runner.ts の SCHEDULED_JOBS_TIMEZONE）
 */
export const ARCHIVE_SCHEDULE_TIMEZONE = 'Asia/Tokyo';

const scheduleMonthFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ARCHIVE_SCHEDULE_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
});

/**
 * アーカイブしてよい月の境界: この時刻より前に作られた行の月（UTC の月）をアーカイブする
 *
 * 境界の月は、定期処理の cron（毎月 1 日 04:00 Asia/Tokyo）と同じ暦である Asia/Tokyo の現在の
 * 年月から 13 か月前の月とし、その月の UTC の月初を返す。cron の起動は UTC では前月の末日 19:00 に
 * あたるため、UTC の暦で現在の月を読むと 1 か月遅れて境界を置いてしまう。
 * 行の月の区切り（目録の period）は design のとおり UTC の月のままとする。そのため、UTC の月の
 * 最後の 9 時間に作られた行は、起動の時点で 13 か月にわずかに（最大 9 時間程度）届かずにアーカイブされうる。
 * 例: 2026-10-01 04:00 JST（2026-09-30T19:00Z）の実行の境界は 2025-09-01T00:00Z で、2025-08 までを扱う。
 */
export function activeRetentionBoundary(now: Date): Date {
  const parts = scheduleMonthFormat.formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return new Date(Date.UTC(year, month - 1 - ACTIVE_RETENTION_MONTHS, 1));
}

/**
 * 暦の年数を戻した時刻（2 月 29 日は 2 月 28 日に寄せる）
 */
function subtractYears(now: Date, years: number): Date {
  const year = now.getUTCFullYear() - years;
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    )
  );
}

/**
 * 鍵から暗号化・HMAC の鍵と識別子を導出する（鍵が無いか形式違いなら null）
 */
function deriveKeys(masterHex: string | undefined): ArchiveKeys | null {
  if (masterHex === undefined || !ARCHIVE_ENCRYPTION_KEY_PATTERN.test(masterHex)) {
    return null;
  }
  const master = Buffer.from(masterHex, 'hex');
  const derive = (info: string, length: number): Buffer =>
    Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, length));
  return {
    encryptionKey: derive('architrack-audit-archive-encryption', 32),
    hmacKey: derive('architrack-audit-archive-manifest-hmac', 32),
    keyId: derive('architrack-audit-archive-key-id', 8).toString('hex'),
  };
}

type ManifestBody = Omit<ArchiveManifest, 'hmacSha256'>;

/**
 * HMAC の対象（項目の順を固定する）
 */
function canonicalManifestBody(manifest: ManifestBody): string {
  return JSON.stringify({
    period: { from: manifest.period.from, to: manifest.period.to },
    recordCount: manifest.recordCount,
    plaintextSha256: manifest.plaintextSha256,
    createdAt: manifest.createdAt,
    keyId: manifest.keyId,
  });
}

function manifestHmac(body: ManifestBody, hmacKey: Buffer): string {
  return createHmac('sha256', hmacKey).update(canonicalManifestBody(body)).digest('hex');
}

function hexEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

type AuditLogRow = Prisma.AuditLogGetPayload<object>;

/**
 * 行を JSON Lines にする（項目の順を固定し、各行の末尾に改行を置く）
 */
function serializeRows(rows: AuditLogRow[]): Buffer {
  const lines = rows.map((row) =>
    JSON.stringify({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      actorDisplayName: row.actorDisplayName,
      targetType: row.targetType,
      targetId: row.targetId,
      before: row.before,
      after: row.after,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })
  );
  return Buffer.from(lines.map((line) => `${line}\n`).join(''), 'utf8');
}

function countLines(plaintext: Buffer): number {
  let count = 0;
  for (const byte of plaintext) {
    if (byte === 0x0a) {
      count += 1;
    }
  }
  return count;
}

/**
 * 照合を済ませた本文から期間（両端を含む）の行を取り出す
 *
 * 行の形が崩れているか、行の作成日時が対象の月の外にあるときは INTEGRITY_FAILED。
 */
function recordsInPeriod(plaintext: Buffer, month: string, from: Date, to: Date): AuditLogRecord[] {
  const range = monthRange(month);
  const records: AuditLogRecord[] = [];
  const lines = plaintext.toString('utf8').split('\n');
  // 各行は改行で終わるため、最後の要素は空になる
  lines.pop();
  for (const line of lines) {
    let record: AuditLogRecord;
    try {
      record = JSON.parse(line) as AuditLogRecord;
    } catch {
      throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
    }
    const createdAt = new Date(record?.createdAt);
    if (
      typeof record?.id !== 'string' ||
      Number.isNaN(createdAt.getTime()) ||
      createdAt < range.from ||
      createdAt > range.to
    ) {
      throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
    }
    if (createdAt >= from && createdAt <= to) {
      records.push(record);
    }
  }
  return records;
}

function encrypt(plaintext: Buffer, month: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH });
  cipher.setAAD(Buffer.from(month, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(gzipSync(plaintext)), cipher.final()]);
  return Buffer.concat([
    Buffer.from([ARCHIVE_FORMAT_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

/**
 * 本文を復号・展開する（認証タグ・形式の不一致は null）
 */
function decrypt(archive: Buffer, month: string, key: Buffer): Buffer | null {
  const headerLength = 1 + IV_LENGTH + AUTH_TAG_LENGTH;
  if (archive.length < headerLength || archive[0] !== ARCHIVE_FORMAT_VERSION) {
    return null;
  }
  try {
    const iv = archive.subarray(1, 1 + IV_LENGTH);
    const tag = archive.subarray(1 + IV_LENGTH, headerLength);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(Buffer.from(month, 'utf8'));
    decipher.setAuthTag(tag);
    const compressed = Buffer.concat([
      decipher.update(archive.subarray(headerLength)),
      decipher.final(),
    ]);
    return gunzipSync(compressed);
  } catch {
    return null;
  }
}

function parseManifest(data: Buffer): ArchiveManifest | null {
  try {
    const value = JSON.parse(data.toString('utf8')) as Partial<ArchiveManifest>;
    if (
      typeof value?.period?.from !== 'string' ||
      typeof value.period.to !== 'string' ||
      typeof value.recordCount !== 'number' ||
      typeof value.plaintextSha256 !== 'string' ||
      typeof value.hmacSha256 !== 'string' ||
      typeof value.createdAt !== 'string' ||
      typeof value.keyId !== 'string'
    ) {
      return null;
    }
    return value as ArchiveManifest;
  } catch {
    return null;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function causeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 監査ログのアーカイブの実装
 */
export class AuditLogArchiveService implements IAuditLogArchiveService {
  private readonly clock: () => Date;
  private readonly earliestArchiveMonth: string;

  constructor(private readonly deps: AuditLogArchiveServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date());
    this.earliestArchiveMonth = deps.earliestArchiveMonth ?? ARCHIVE_EARLIEST_MONTH;
    monthRange(this.earliestArchiveMonth);
  }

  /**
   * 月次の処理: 13 か月以上前の月をアーカイブし、8 年を過ぎたアーカイブを消す
   *
   * 対象の月は activeRetentionBoundary(now) より前に作られた行を持つ UTC の月で、境界は
   * cron と同じ Asia/Tokyo の暦の現在の月から 13 か月前の月初とする（2026-10-01 04:00 JST の実行は
   * 2025-08 までを扱う）。
   *
   * 鍵が無いときは月ごとに処理せず、対象の月をまとめて 1 回だけ監査し通知する。
   * 月ごとの失敗は監査と通知の後に結果へ残して次の月へ進む。対象の月の読み出しの失敗は、
   * 監査と通知の後に投げ直す（定期処理の基盤が再試行し、最終の失敗を記録する）。
   */
  async runMonthly(now: Date): Promise<MonthlyArchiveRunResult> {
    let months: string[];
    try {
      months = await this.findArchivableMonths(now);
    } catch (error) {
      await this.reportFailure('monthly-run', { type: 'UNEXPECTED', cause: causeOf(error) });
      throw error;
    }

    if (months.length > 0 && !deriveKeys(this.deps.encryptionKey)) {
      await this.reportFailure('monthly-run', { type: 'KEY_MISSING' }, months);
      return {
        archivedMonths: [],
        failedMonths: months.map((month) => ({ month, error: { type: 'KEY_MISSING' } })),
        deletedArchives: [],
      };
    }

    const archivedMonths: string[] = [];
    const failedMonths: FailedArchiveMonth[] = [];
    for (const month of months) {
      try {
        const result = await this.archiveMonth(month);
        if (result.ok) {
          archivedMonths.push(month);
        } else {
          failedMonths.push({ month, error: result.error });
        }
      } catch (error) {
        // archiveMonth が監査と通知を済ませている
        failedMonths.push({ month, error: { type: 'UNEXPECTED', cause: causeOf(error) } });
      }
    }

    let deletedArchives: string[] = [];
    try {
      deletedArchives = (await this.deleteArchivesOlderThan(ARCHIVE_RETENTION_YEARS, now)).deleted;
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete expired audit log archives');
      captureException(toError(error), {
        job: 'audit-log-archive',
        step: 'delete-expired-archives',
      });
    }

    return { archivedMonths, failedMonths, deletedArchives };
  }

  /**
   * 指定の月の監査ログをアーカイブし、照合の後に行を消す
   */
  async archiveMonth(month: string): Promise<Result<ArchiveManifest, ArchiveError>> {
    const range = monthRange(month);
    if (range.from >= activeRetentionBoundary(this.clock())) {
      throw new RangeError(`Archive month is within the active retention: ${month}`);
    }

    try {
      const manifest = await this.archiveAndDelete(month, range);
      logger.info({ month, recordCount: manifest.recordCount }, 'Archived audit logs of the month');
      return Ok(manifest);
    } catch (error) {
      if (error instanceof ArchiveFailure) {
        await this.reportFailure(month, error.archiveError);
        return Err(error.archiveError);
      }
      await this.reportFailure(month, { type: 'UNEXPECTED', cause: causeOf(error) });
      throw error;
    }
  }

  /**
   * 目録の期間の終わりから years 年を過ぎたアーカイブを消す
   *
   * 目録の HMAC が合わないアーカイブは消さずに残す（改ざんされた期間で消さない）。
   */
  async deleteArchivesOlderThan(years: number, now: Date): Promise<{ deleted: string[] }> {
    const keys = deriveKeys(this.deps.encryptionKey);
    const storage = this.deps.storage;
    if (!keys || !storage) {
      logger.warn('Audit log archive deletion skipped: key or storage is not configured');
      return { deleted: [] };
    }

    const cutoff = subtractYears(now, years);
    const deleted: string[] = [];
    const start = monthRange(this.earliestArchiveMonth).from;
    for (
      let cursor = start;
      monthRange(formatMonth(cursor)).to < cutoff;
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    ) {
      const month = formatMonth(cursor);
      const { archiveKey, manifestKey } = archiveKeysOf(month);
      const data = await storage.get(manifestKey);
      if (!data) {
        continue;
      }
      const manifest = parseManifest(data);
      if (!manifest || !hexEquals(manifest.hmacSha256, manifestHmac(manifest, keys.hmacKey))) {
        logger.warn({ month }, 'Audit log archive manifest failed verification; not deleted');
        continue;
      }
      if (!(new Date(manifest.period.to) < cutoff)) {
        continue;
      }
      // 本文を先に消し、目録は最後に消す（途中の失敗で次回に探し直せる）
      await storage.delete(archiveKey);
      await storage.delete(manifestKey);
      deleted.push(month);
      logger.info({ month, periodTo: manifest.period.to }, 'Deleted expired audit log archive');
    }
    return { deleted };
  }

  /**
   * 指定期間（両端を含む）の監査ログをアーカイブから復元する（要件41.5）
   *
   * 期間に重なる月のうち目録のある月を、目録の HMAC・復号・SHA-256・件数・期間で照合する。
   * 本文も目録も無い月はアーカイブが無いものとして飛ばし、本文があって目録の無い月は
   * 目録が消された改ざんとして INTEGRITY_FAILED にする。照合に失敗した月があれば行を返さず
   * INTEGRITY_FAILED を返す。すべての月の照合を済ませてから結果を返すため、応答を始めた後に
   * 照合の失敗が分かることは無い（返した結果を繰り返すときも月ごとに読み直して照合し直し、
   * 先の照合と本文が違えば ArchiveFailure を投げる）。
   * 行は読み取り用に返すだけで、アクティブな監査ログへ戻さない。
   *
   * 期間が不正（from が to より後、上限の月数を超える）なときは RangeError を投げる。
   */
  async restore(from: Date, to: Date): Promise<Result<RestoredAuditLogs, ArchiveError>> {
    const months = restoreMonthsOf(from, to);
    const keys = deriveKeys(this.deps.encryptionKey);
    if (!keys) {
      return Err({ type: 'KEY_MISSING' });
    }
    const storage = this.deps.storage;
    if (!storage) {
      return Err({ type: 'STORAGE_FAILED', cause: 'storage is not configured' });
    }

    const verified: { month: string; plaintextSha256: string }[] = [];
    let recordCount = 0;
    try {
      for (const month of months) {
        const { archiveKey, manifestKey } = archiveKeysOf(month);
        if (!(await this.storageCall(() => storage.exists(manifestKey)))) {
          // 本文だけが残る月は目録が消された（改ざん）とみなす。どちらも無い月はアーカイブが無い
          if (await this.storageCall(() => storage.exists(archiveKey))) {
            throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
          }
          continue;
        }
        const { manifest, plaintext } = await this.readAndVerify(storage, month, keys);
        recordCount += recordsInPeriod(plaintext, month, from, to).length;
        verified.push({ month, plaintextSha256: manifest.plaintextSha256 });
      }
    } catch (error) {
      if (error instanceof ArchiveFailure) {
        logger.warn({ from, to, error: error.archiveError }, 'Audit log archive restore failed');
        return Err(error.archiveError);
      }
      throw error;
    }

    const readAndVerify = this.readAndVerify.bind(this);
    return Ok({
      months: verified.map((entry) => entry.month),
      recordCount,
      async *[Symbol.asyncIterator](): AsyncGenerator<AuditLogRecord> {
        for (const { month, plaintextSha256 } of verified) {
          const { manifest, plaintext } = await readAndVerify(storage, month, keys);
          if (manifest.plaintextSha256 !== plaintextSha256) {
            throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
          }
          yield* recordsInPeriod(plaintext, month, from, to);
        }
      },
    });
  }

  /**
   * 13 か月以上前の行を持つ月（UTC）
   */
  private async findArchivableMonths(now: Date): Promise<string[]> {
    const boundary = activeRetentionBoundary(now);
    const rows = await this.deps.prisma.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month
      FROM audit_logs
      WHERE "createdAt" < ${boundary}
      ORDER BY month`;
    return rows.map((row) => row.month);
  }

  private async archiveAndDelete(month: string, range: MonthRange): Promise<ArchiveManifest> {
    const keys = deriveKeys(this.deps.encryptionKey);
    if (!keys) {
      throw new ArchiveFailure({ type: 'KEY_MISSING' });
    }
    const storage = this.deps.storage;
    if (!storage) {
      throw new ArchiveFailure({ type: 'STORAGE_FAILED', cause: 'storage is not configured' });
    }
    const { archiveKey, manifestKey } = archiveKeysOf(month);

    const rows = await this.deps.prisma.auditLog.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const plaintext = serializeRows(rows);
    const plaintextSha256 = sha256Hex(plaintext);

    let manifest: ArchiveManifest;
    const existing = await this.storageCall(() => storage.get(manifestKey));
    if (existing) {
      // 目録があれば書き済み: 書き直さず、保存済みの本文と今の行を照合する
      manifest = (await this.readAndVerify(storage, month, keys)).manifest;
      if (rows.length === 0) {
        return manifest;
      }
      if (manifest.recordCount !== rows.length || manifest.plaintextSha256 !== plaintextSha256) {
        throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
      }
    } else {
      const body: ManifestBody = {
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
        recordCount: rows.length,
        plaintextSha256,
        createdAt: this.clock().toISOString(),
        keyId: keys.keyId,
      };
      manifest = { ...body, hmacSha256: manifestHmac(body, keys.hmacKey) };
      await this.storageCall(() =>
        storage.upload(archiveKey, encrypt(plaintext, month, keys.encryptionKey), {
          contentType: 'application/octet-stream',
        })
      );
      // 目録を最後に書く（目録の有無で済みを判定する）
      await this.storageCall(() =>
        storage.upload(manifestKey, Buffer.from(JSON.stringify(manifest), 'utf8'), {
          contentType: 'application/json',
        })
      );
      try {
        const stored = await this.readAndVerify(storage, month, keys);
        if (
          canonicalManifestBody(stored.manifest) !== canonicalManifestBody(manifest) ||
          stored.manifest.hmacSha256 !== manifest.hmacSha256
        ) {
          throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
        }
      } catch (error) {
        // 照合できなかった書き込みは目録を消し、次回に書き直せるようにする
        await storage.delete(manifestKey).catch((deleteError: unknown) => {
          logger.warn({ month, err: deleteError }, 'Failed to remove an unverified manifest');
        });
        throw error;
      }
    }

    await withAuditArchivePermission(this.deps.prisma, async (tx) => {
      const { count } = await tx.auditLog.deleteMany({
        where: { createdAt: { gte: range.from, lte: range.to } },
      });
      if (count !== manifest.recordCount) {
        // 照合の後に行が変わった: 取引ごと取り消して行を残す
        throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
      }
      await this.deps.auditLogService.createLog(
        {
          action: 'AUDIT_ARCHIVE_CREATED',
          actorId: null,
          targetType: ARCHIVE_TARGET_TYPE,
          targetId: month,
          after: {
            period: manifest.period,
            recordCount: manifest.recordCount,
            plaintextSha256: manifest.plaintextSha256,
            keyId: manifest.keyId,
            archiveKey,
            manifestKey,
          },
        },
        tx
      );
    });
    return manifest;
  }

  /**
   * 保存済みの目録と本文を読み、HMAC・復号・ハッシュ・件数を照合する
   */
  private async readAndVerify(
    storage: StorageProvider,
    month: string,
    keys: ArchiveKeys
  ): Promise<{ manifest: ArchiveManifest; plaintext: Buffer }> {
    const { archiveKey, manifestKey } = archiveKeysOf(month);
    const manifestData = await this.storageCall(() => storage.get(manifestKey));
    const archiveData = await this.storageCall(() => storage.get(archiveKey));
    if (!manifestData || !archiveData) {
      throw new ArchiveFailure({
        type: 'STORAGE_FAILED',
        cause: 'archive or manifest could not be read back',
      });
    }
    const manifest = parseManifest(manifestData);
    if (!manifest || !hexEquals(manifest.hmacSha256, manifestHmac(manifest, keys.hmacKey))) {
      throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
    }
    const range = monthRange(month);
    const plaintext = decrypt(archiveData, month, keys.encryptionKey);
    if (
      !plaintext ||
      manifest.period.from !== range.from.toISOString() ||
      manifest.period.to !== range.to.toISOString() ||
      sha256Hex(plaintext) !== manifest.plaintextSha256 ||
      countLines(plaintext) !== manifest.recordCount
    ) {
      throw new ArchiveFailure({ type: 'INTEGRITY_FAILED', month });
    }
    return { manifest, plaintext };
  }

  /**
   * 保存先の例外を STORAGE_FAILED にする
   */
  private async storageCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw new ArchiveFailure({ type: 'STORAGE_FAILED', cause: causeOf(error) });
    }
  }

  /**
   * 失敗の監査と全システム管理者への通知（どちらの失敗も呼び出し元へ伝えない）
   *
   * pendingMonths はまとめて失敗にした月（鍵の欠落）で、監査と通知の本文に含める。
   */
  private async reportFailure(
    month: string,
    error: ArchiveError | { type: 'UNEXPECTED'; cause: string },
    pendingMonths: string[] = []
  ): Promise<void> {
    logger.error({ month, error }, 'Audit log archive failed; active audit logs were kept');
    try {
      await this.deps.auditLogService.createLog({
        action: 'AUDIT_ARCHIVE_FAILED',
        actorId: null,
        targetType: ARCHIVE_TARGET_TYPE,
        targetId: month,
        metadata: {
          month,
          error,
          ...(pendingMonths.length > 0 ? { pendingMonths } : {}),
        },
      });
    } catch (auditError) {
      logger.error({ month, err: auditError }, 'Failed to record the audit log archive failure');
      captureException(toError(auditError), { job: 'audit-log-archive', month });
    }
    await this.deps.adminNotificationService.notifyAllAdmins({
      kind: 'AUDIT_ARCHIVE_FAILED',
      subject: `【重要】監査ログのアーカイブの失敗: ${month}`,
      lines: [
        `対象の月: ${month}`,
        ...(pendingMonths.length > 0 ? [`処理できなかった月: ${pendingMonths.join(', ')}`] : []),
        `失敗の種別: ${error.type}`,
        ...('cause' in error ? [`原因: ${error.cause}`] : []),
        'アクティブな監査ログは削除していません。原因を取り除くと、次回の月次の実行で再び処理します。',
      ],
    });
  }
}
