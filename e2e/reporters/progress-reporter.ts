/**
 * Playwright Custom Progress Reporter
 *
 * ベストプラクティスに基づいた進捗表示:
 * - 正確なテスト数カウント（リトライを除外）
 * - 経過時間と推定残り時間
 * - 成功/失敗/リトライの統計
 * - 現在実行中のテスト名
 * - 再試行で回復した検証（flaky）の明示（どのテストが何回目で回復したか）
 *
 * 再試行で回復した実行の扱い:
 * 「緑であること」と「一度で緑になること」は別の主張である。
 * 再試行のみで回復した実行は Playwright の総合判定でも失敗となる
 * （playwright.config.ts の `failOnFlakyTests: true`）。本レポータはその内訳
 * （テスト名・位置・試行ごとの結果・最初のエラー）を実行の末尾に出力し、
 * pre-push のログ（.logs/pre-push-latest.log）と GitHub Actions のログの双方で
 * 人の目に入る形にする。GitHub Actions ではワークフローコマンドで注釈も出す。
 *
 * 判定に `TestCase.outcome()` を用いる理由:
 * `test.fail()` のラチェット（期待された失敗）は outcome が `expected` であり
 * `flaky` には決してならない。試行単位の Passed/Failed 集計とは異なり、
 * 期待された失敗を間欠失敗と取り違えない。
 *
 * @see https://playwright.dev/docs/test-reporters#custom-reporters
 */
import * as path from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

/**
 * 再試行で回復した検証（flaky）の記録
 *
 * `TestCase.outcome() === 'flaky'`、すなわち「期待どおりでない試行と
 * 期待どおりの試行が混在し、最終的に期待どおりで終わった」テストを指す。
 */
interface FlakyRecord {
  /** スイート名を含むテストの完全な名前 */
  title: string;
  /** リポジトリ相対の位置（file:line） */
  location: string;
  /** 試行ごとの結果（実行順） */
  attemptStatuses: string[];
  /** 期待どおりでなかった試行の数 */
  unexpectedAttempts: number;
  /** 最初に観測されたエラーの1行目（無い場合は undefined） */
  firstError: string | undefined;
}

interface TestStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  retried: number;
  completed: number;
}

class ProgressReporter implements Reporter {
  private stats: TestStats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
    completed: 0,
  };
  private startTime: number = 0;
  private testTimes: number[] = [];
  private currentTest: string = '';
  private isCI: boolean = !!process.env.CI;
  private rootSuite: Suite | undefined;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.rootSuite = suite;
    this.stats.total = this.countTests(suite);

    console.log('');
    console.log('='.repeat(70));
    console.log('  E2E Test Progress Reporter');
    console.log('='.repeat(70));
    console.log(`  Total tests: ${this.stats.total}`);
    console.log(`  Started at: ${new Date().toLocaleTimeString()}`);
    console.log('='.repeat(70));
    console.log('');
  }

  onTestBegin(test: TestCase): void {
    this.currentTest = `${test.parent.title} > ${test.title}`;

    // CI環境では各テスト開始を表示（ログが流れるため）
    if (this.isCI) {
      console.log(
        `[${this.stats.completed + 1}/${this.stats.total}] Starting: ${this.currentTest}`
      );
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const duration = result.duration;
    this.testTimes.push(duration);

    // リトライの場合
    if (result.retry > 0) {
      this.stats.retried++;
      this.printProgress(test, result, 'RETRY');
      return;
    }

    this.stats.completed++;

    switch (result.status) {
      case 'passed':
        this.stats.passed++;
        this.printProgress(test, result, 'PASS');
        break;
      case 'failed':
        this.stats.failed++;
        this.printProgress(test, result, 'FAIL');
        break;
      case 'skipped':
        this.stats.skipped++;
        this.printProgress(test, result, 'SKIP');
        break;
      case 'timedOut':
        this.stats.failed++;
        this.printProgress(test, result, 'TIMEOUT');
        break;
      case 'interrupted':
        this.stats.failed++;
        this.printProgress(test, result, 'INTERRUPTED');
        break;
    }
  }

  onEnd(result: FullResult): void {
    const totalTime = Date.now() - this.startTime;
    const flaky = this.collectFlakyTests();

    console.log('');
    console.log('='.repeat(70));
    console.log('  E2E Test Summary');
    console.log('='.repeat(70));
    console.log(`  Status: ${result.status.toUpperCase()}`);
    console.log(`  Total time: ${this.formatDuration(totalTime)}`);
    console.log('');
    console.log('  Results:');
    console.log(`    Passed:  ${this.stats.passed}/${this.stats.total}`);
    console.log(`    Failed:  ${this.stats.failed}`);
    console.log(`    Skipped: ${this.stats.skipped}`);
    // 再試行で回復した検証は 0 件でも必ず表示する。
    // 「一度で緑になった」は主張であり、黙って省略してよいものではない。
    console.log(`    Flaky:   ${flaky.length}  (retry-recovered / 再試行で回復した検証)`);
    if (this.stats.retried > 0) {
      console.log(`    Retries: ${this.stats.retried}`);
    }
    console.log('');
    console.log('  注: Passed/Failed は試行単位の集計であり、Failed には `test.fail()` の');
    console.log('      期待された失敗も含まれる。合否は Status（Playwright の総合判定＝');
    console.log('      終了コード）を正とすること。Flaky は outcome 判定のため期待された');
    console.log('      失敗を含まない。');
    console.log('');

    if (this.stats.total > 0) {
      const avgTime = totalTime / this.stats.completed;
      console.log(`  Average time per test: ${this.formatDuration(avgTime)}`);
    }

    console.log('='.repeat(70));
    console.log('');

    this.printFlakyReport(flaky);
  }

  /**
   * 再試行で回復した検証を集計する
   *
   * `TestCase.outcome()` は Playwright 自身の判定であり、`test.fail()` の
   * 期待された失敗（`expected`）と間欠失敗（`flaky`）を取り違えない。
   */
  private collectFlakyTests(): FlakyRecord[] {
    const suite = this.rootSuite;
    if (!suite) {
      return [];
    }

    return suite
      .allTests()
      .filter((test) => test.outcome() === 'flaky')
      .map((test) => this.toFlakyRecord(test));
  }

  private toFlakyRecord(test: TestCase): FlakyRecord {
    const attempts = [...test.results].sort((a, b) => a.retry - b.retry);
    const firstErrorMessage = attempts.find((attempt) => attempt.error?.message)?.error?.message;

    return {
      title: test.titlePath().filter(Boolean).join(' > '),
      location: `${path.relative(process.cwd(), test.location.file)}:${test.location.line}`,
      attemptStatuses: attempts.map((attempt) => attempt.status),
      // 期待どおりでなかった試行の数。`test.fail()` のテストでは「成功した試行」がこれに当たる
      unexpectedAttempts: attempts.filter((attempt) => attempt.status !== test.expectedStatus)
        .length,
      firstError: firstErrorMessage?.split('\n')[0]?.substring(0, 160),
    };
  }

  /**
   * 再試行で回復した検証を実行の末尾に列挙する
   *
   * 実行の最後に出力するため、pre-push のログでも GitHub Actions のログでも
   * 末尾（＝人が最初に見る位置）に残る。
   */
  private printFlakyReport(flaky: FlakyRecord[]): void {
    if (flaky.length === 0) {
      return;
    }

    console.log('='.repeat(70));
    console.log('  RETRY-RECOVERED FAILURES (FLAKY) - 一度で緑になっていない');
    console.log('='.repeat(70));
    console.log(`  再試行のみで回復した検証が ${flaky.length} 件ある。これは「緑」ではない。`);
    console.log('  playwright.config.ts の failOnFlakyTests により総合判定は FAILED となる。');
    console.log('');

    flaky.forEach((record, index) => {
      console.log(`  ${index + 1}) ${record.title}`);
      console.log(`     location: ${record.location}`);
      console.log(
        `     attempts: ${record.attemptStatuses.join(' -> ')}` +
          ` (期待どおりでない試行 ${record.unexpectedAttempts}/${record.attemptStatuses.length})`
      );
      if (record.firstError) {
        console.log(`     first error: ${record.firstError}`);
      }
      console.log('');
    });

    console.log('  対処: 再試行で回復したという事実は間欠的な欠陥の徴候である。');
    console.log('        trace / video（test-results 配下）から最初の試行の失敗を追うこと。');
    console.log('='.repeat(70));
    console.log('');

    this.printGitHubAnnotations(flaky);
  }

  /**
   * GitHub Actions のログ注釈として出力する
   *
   * ステップの終了コードだけでなく、PR の注釈としても表示させるため。
   * pre-push（CI=true だが GITHUB_ACTIONS は未設定）では出力しない。
   */
  private printGitHubAnnotations(flaky: FlakyRecord[]): void {
    if (!process.env.GITHUB_ACTIONS) {
      return;
    }

    for (const record of flaky) {
      const [file, line] = record.location.split(':');
      const detail = record.firstError ? ` first error: ${record.firstError}` : '';
      console.log(
        `::error file=${file},line=${line},title=Flaky (retry-recovered)::` +
          `${record.title} は再試行で回復した（${record.attemptStatuses.join(' -> ')}）。${detail}`
      );
    }
  }

  private printProgress(test: TestCase, result: TestResult, status: string): void {
    const elapsed = Date.now() - this.startTime;
    const remaining = this.estimateRemainingTime();
    const percent = Math.round((this.stats.completed / this.stats.total) * 100);

    // プログレスバー
    const barWidth = 30;
    const filledWidth = Math.round((percent / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = '[' + '#'.repeat(filledWidth) + '-'.repeat(emptyWidth) + ']';

    // ステータスアイコン
    const statusIcon = this.getStatusIcon(status);
    const statusColor = this.getStatusColor(status);

    // テスト名（長すぎる場合は省略）
    const testName = `${test.parent.title} > ${test.title}`;
    const maxNameLength = 50;
    const displayName =
      testName.length > maxNameLength ? testName.substring(0, maxNameLength - 3) + '...' : testName;

    // 進捗表示
    const progress = `[${this.stats.completed}/${this.stats.total}]`;
    const timeInfo = `Elapsed: ${this.formatDuration(elapsed)} | Remaining: ${remaining}`;

    console.log('');
    console.log(`${progressBar} ${percent}% ${progress}`);
    console.log(
      `${statusColor}${statusIcon} ${status}${this.resetColor()} ${displayName} (${this.formatDuration(result.duration)})`
    );

    if (result.retry > 0) {
      console.log(`  Retry attempt: ${result.retry}`);
    }

    console.log(`  ${timeInfo}`);

    // 失敗時はエラーメッセージを表示
    if (status === 'FAIL' || status === 'TIMEOUT') {
      const error = result.error?.message;
      if (error) {
        const shortError = error.split('\n')[0]?.substring(0, 100);
        console.log(`  Error: ${shortError}`);
      }
    }
  }

  private countTests(suite: Suite): number {
    // 各テストは1回だけカウント（リトライは除外）
    return suite.allTests().length;
  }

  private estimateRemainingTime(): string {
    if (this.stats.completed === 0 || this.testTimes.length === 0) {
      return 'Calculating...';
    }

    const avgTime = this.testTimes.reduce((a, b) => a + b, 0) / this.testTimes.length;
    const remainingTests = this.stats.total - this.stats.completed;
    const estimatedMs = avgTime * remainingTests;

    return this.formatDuration(estimatedMs);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'PASS':
        return '\u2714'; // ✔
      case 'FAIL':
      case 'TIMEOUT':
      case 'INTERRUPTED':
        return '\u2718'; // ✘
      case 'SKIP':
        return '\u25CB'; // ○
      case 'RETRY':
        return '\u21BB'; // ↻
      default:
        return '\u25CF'; // ●
    }
  }

  private getStatusColor(status: string): string {
    // CI環境ではANSIカラーを使用
    if (!process.stdout.isTTY && !this.isCI) {
      return '';
    }

    switch (status) {
      case 'PASS':
        return '\x1b[32m'; // Green
      case 'FAIL':
      case 'TIMEOUT':
      case 'INTERRUPTED':
        return '\x1b[31m'; // Red
      case 'SKIP':
        return '\x1b[33m'; // Yellow
      case 'RETRY':
        return '\x1b[36m'; // Cyan
      default:
        return '';
    }
  }

  private resetColor(): string {
    if (!process.stdout.isTTY && !this.isCI) {
      return '';
    }
    return '\x1b[0m';
  }
}

export default ProgressReporter;
