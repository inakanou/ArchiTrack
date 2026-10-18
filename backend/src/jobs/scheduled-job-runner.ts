/**
 * 定期処理の実行基盤（user-authentication 要件36.8、37.4、37.8、41.1、41.2、45.3）
 *
 * キャッシュ基盤と同じ REDIS_URL で接続するキュー `scheduled-jobs` に、Bull の繰り返しジョブ
 * （`repeat`、cron は Asia/Tokyo）として定期処理を登録し、同じキューで実行する。
 *
 * - 起動のたびに同じ識別子（jobId = ジョブ名）で登録し直す。周期を変えたときなどに残る古い
 *   定義は消し、定義を重複させない
 * - 試験の実行環境（NODE_ENV=test）では登録しない。E2E の実行中に、期限切れ・使用済みの表示を
 *   確かめるための前提データを消さないため。統合テストはジョブの処理の関数を直接呼ぶ
 * - 失敗は Bull の再試行（3 回）の後、エラーログと Sentry へ送る
 *
 * ジョブを足すときは createScheduledJobDefinitions に定義を加える。
 */

import Bull, { type Queue, type Job, type JobOptions, type QueueOptions } from 'bull';
import type { PrismaClient } from '../generated/prisma/client.js';
import logger from '../utils/logger.js';
import { captureException } from '../utils/sentry.js';
import { runtimeMode as defaultRuntimeMode, type RuntimeMode } from '../config/runtime-mode.js';
import {
  EXPIRED_TOKEN_CLEANUP_CRON,
  EXPIRED_TOKEN_CLEANUP_JOB_NAME,
  cleanupExpiredTokens,
} from './expired-token-cleanup.job.js';
import {
  FAILED_EMAIL_JOB_CLEANUP_CRON,
  FAILED_EMAIL_JOB_CLEANUP_JOB_NAME,
  cleanupFailedEmailJobs,
} from './failed-email-job-cleanup.job.js';

/** 定期処理のキューの名前（Redis のキーは `bull:scheduled-jobs:*`） */
export const SCHEDULED_JOBS_QUEUE_NAME = 'scheduled-jobs';

/** 繰り返しジョブの cron の時間帯 */
export const SCHEDULED_JOBS_TIMEZONE = 'Asia/Tokyo';

/** 定期処理の再試行の回数（初回を含めない） */
export const SCHEDULED_JOB_RETRIES = 3;

/** 再試行の間隔の基準（指数で 1 分、2 分、4 分） */
const SCHEDULED_JOB_BACKOFF_DELAY_MS = 60 * 1000;

/** 失敗の集合に残すジョブの件数の上限（定期処理のジョブは秘密を含まない） */
const SCHEDULED_JOB_FAILED_RETENTION = 100;

/**
 * 定期処理の定義
 */
export interface ScheduledJobDefinition {
  /** ジョブ名（繰り返しジョブの識別子 jobId を兼ねる） */
  name: string;
  /** 周期（cron、SCHEDULED_JOBS_TIMEZONE） */
  cron: string;
  /** 処理（結果は完了のログに残す） */
  run: () => Promise<unknown>;
}

/**
 * 本番の定期処理の定義
 *
 * @param prisma - データベースのクライアント
 */
export function createScheduledJobDefinitions(prisma: PrismaClient): ScheduledJobDefinition[] {
  return [
    {
      name: EXPIRED_TOKEN_CLEANUP_JOB_NAME,
      cron: EXPIRED_TOKEN_CLEANUP_CRON,
      run: () => cleanupExpiredTokens(prisma),
    },
    {
      name: FAILED_EMAIL_JOB_CLEANUP_JOB_NAME,
      cron: FAILED_EMAIL_JOB_CLEANUP_CRON,
      run: () => cleanupFailedEmailJobs(),
    },
  ];
}

/**
 * 定期処理のキューを作る
 *
 * キャッシュ基盤（redis.ts）とメールキューと同じ REDIS_URL で接続する。
 *
 * @param redisUrl - 接続先（既定は REDIS_URL。本番では起動前の検査で必須）
 */
export function createScheduledJobsQueue(
  redisUrl: string | undefined = process.env.REDIS_URL
): Queue {
  const options: QueueOptions = {};

  if (!redisUrl) {
    logger.warn(
      'REDIS_URL not configured, scheduled jobs queue will connect to the default local Redis'
    );
    return new Bull(SCHEDULED_JOBS_QUEUE_NAME, options);
  }

  // Bull は URL のスキームを読まないため、TLS の接続先（rediss）は明示する
  if (redisUrl.startsWith('rediss://')) {
    options.redis = { tls: {} };
  }
  return new Bull(SCHEDULED_JOBS_QUEUE_NAME, redisUrl, options);
}

/**
 * 定期処理の実行基盤
 */
export class ScheduledJobRunner {
  private queue: Queue | null = null;

  /**
   * @param createQueue - キューを作る（試験の実行環境では呼ばない）
   * @param definitions - 登録する定期処理
   * @param runtimeMode - 実行環境の判定
   */
  constructor(
    private readonly createQueue: () => Queue,
    private readonly definitions: readonly ScheduledJobDefinition[],
    private readonly runtimeMode: RuntimeMode = defaultRuntimeMode
  ) {}

  /**
   * 定期処理を登録し、実行を始める
   *
   * @returns 登録したとき true、試験の実行環境で登録しなかったとき false
   */
  async start(): Promise<boolean> {
    if (this.runtimeMode.kind() === 'test') {
      logger.info('Scheduled jobs are not registered in the test runtime');
      return false;
    }

    const queue = this.createQueue();
    this.queue = queue;
    queue.on('failed', (job: Job | null, error: Error | undefined) => {
      void this.handleFailedJob(job, error);
    });
    queue.on('error', (error: Error) => {
      logger.error({ err: error }, 'Scheduled jobs queue error');
    });

    // 登録を処理の開始より先に行う。処理の開始の後に遅延のジョブを足すと、Bull はその通知で
    // 遅延の集合を読み直し、直後の停止と競合して接続の切断の拒否を漏らすため
    await this.removeStaleRepeatableJobs(queue);
    for (const definition of this.definitions) {
      await queue.add(definition.name, {}, this.jobOptionsOf(definition));
    }

    for (const definition of this.definitions) {
      // process の約束は処理の繰り返しが終わるまで決まらず、停止の際の接続の切断で拒否されうる。
      // 拒否を未処理のまま漏らさない
      queue
        .process(definition.name, async () => {
          const result = await definition.run();
          logger.info({ jobName: definition.name, result }, 'Scheduled job completed');
          return result;
        })
        .catch((error: unknown) => {
          logger.warn({ jobName: definition.name, err: error }, 'Scheduled job processing stopped');
        });
    }

    logger.info(
      { jobs: this.definitions.map((definition) => definition.name) },
      'Scheduled jobs registered'
    );
    return true;
  }

  /**
   * 実行を止め、キューの接続を閉じる（登録した繰り返しの定義は Redis に残す）
   */
  async stop(): Promise<void> {
    const queue = this.queue;
    this.queue = null;
    if (queue) {
      await queue.close();
    }
  }

  private jobOptionsOf(definition: ScheduledJobDefinition): JobOptions {
    return {
      jobId: definition.name,
      repeat: { cron: definition.cron, tz: SCHEDULED_JOBS_TIMEZONE },
      attempts: 1 + SCHEDULED_JOB_RETRIES,
      backoff: { type: 'exponential', delay: SCHEDULED_JOB_BACKOFF_DELAY_MS },
      removeOnComplete: true,
      removeOnFail: SCHEDULED_JOB_FAILED_RETENTION,
    };
  }

  /**
   * 今の定義と一致しない繰り返しの定義（周期を変えた、定義から外した等）を消す
   */
  private async removeStaleRepeatableJobs(queue: Queue): Promise<void> {
    const registered = await queue.getRepeatableJobs();
    for (const repeatable of registered) {
      const current = this.definitions.some(
        (definition) =>
          repeatable.name === definition.name &&
          repeatable.id === definition.name &&
          repeatable.cron === definition.cron &&
          repeatable.tz === SCHEDULED_JOBS_TIMEZONE
      );
      if (!current) {
        await queue.removeRepeatableByKey(repeatable.key);
        logger.info(
          { jobName: repeatable.name, cron: repeatable.cron },
          'Removed a stale scheduled job definition'
        );
      }
    }
  }

  /**
   * 失敗の処理: 再試行の後の最終の失敗（失敗の集合にある）だけを、エラーログと Sentry へ送る
   */
  private async handleFailedJob(job: Job | null, error: Error | undefined): Promise<void> {
    if (!job) {
      return;
    }
    try {
      if (!(await job.isFailed())) {
        return;
      }
      const record = {
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        reason: error?.message ?? 'Unknown reason',
      };
      logger.error(record, 'Scheduled job failed after the final attempt');
      captureException(error ?? new Error('Scheduled job failed after the final attempt'), record);
    } catch (handlingError) {
      logger.error(
        { jobName: job.name, err: handlingError },
        'Failed to handle the failed scheduled job'
      );
    }
  }
}
