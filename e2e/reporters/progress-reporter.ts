/**
 * Playwright Custom Progress Reporter
 *
 * ベストプラクティスに基づいた進捗表示:
 * - 正確なテスト数カウント（リトライを除外）
 * - 経過時間と推定残り時間
 * - 成功/失敗/リトライの統計
 * - 現在実行中のテスト名
 *
 * @see https://playwright.dev/docs/test-reporters#custom-reporters
 */
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

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

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
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
    if (this.stats.retried > 0) {
      console.log(`    Retries: ${this.stats.retried}`);
    }
    console.log('');

    if (this.stats.total > 0) {
      const avgTime = totalTime / this.stats.completed;
      console.log(`  Average time per test: ${this.formatDuration(avgTime)}`);
    }

    console.log('='.repeat(70));
    console.log('');
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
