import type { TestRunnerConfig } from '@storybook/test-runner';
import type { AxeResults } from 'axe-core';
import type { Reporter } from 'axe-playwright';
import { injectAxe, checkA11y } from 'axe-playwright';
import type { Page, Route } from '@playwright/test';

/*
 * Storybook Test Runner configuration with Accessibility Testing
 *
 * This configuration integrates axe-core for automated accessibility testing
 * on all Storybook stories, ensuring WCAG 2.1 compliance.
 */

// ============================================================================
// 外部ネットワークリクエストのモック（テスト決定性の保証）
// ============================================================================
// 問題: ストーリーが外部URL（picsum.photos, example.com等）に依存している場合、
//       ネットワーク条件の違いにより、ローカルとCIでテスト結果が異なることがある。
//       例: ExistingPdfUrl ストーリーでCIのみa11y違反が検出される問題（CI#987）
//
// 解決: Playwrightのルートハンドラで外部リクエストをインターセプトし、
//       最小限の有効なモックレスポンスを返すことで、テストを100%決定的にする。
//
// 効果:
//   - ローカルとCIで同一の結果を保証（ネットワーク非決定性を排除）
//   - テスト実行速度の向上（外部リソースの待機不要）
//   - pre-pushフックでのStorybookテストが確実にCI失敗を検知
// ============================================================================

/** 1x1 透明PNG（Base64エンコード） - 画像リクエストのモック用 */
const TRANSPARENT_1X1_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==';

/**
 * 最小限の有効なPDF（Base64エンコード） - PDFリクエストのモック用
 * 1ページの空白PDF（PDF 1.4仕様準拠、xrefオフセット検証済み）
 */
const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw' +
  'IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
  'PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXT4+CmVuZG9iago' +
  'eHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAw' +
  'NTQgMDAwMDAgbiAKMDAwMDAwMDEwNSAwMDAwMCBuIAp0cmFpbGVyCjw8L1Jvb3QgMSAwIFIvU2l6' +
  'ZSA0Pj4Kc3RhcnR4cmVmCjE3MAolJUVPRgo=';

/** Route設定済みのページを追跡（重複設定防止） */
const routeConfiguredPages = new WeakSet<Page>();

/**
 * 外部ネットワークリクエストをモックするルートハンドラを設定
 *
 * localhost/127.0.0.1以外のHTTP/HTTPSリクエストをインターセプトし、
 * ファイルタイプに応じた最小限の有効なレスポンスを返す。
 */
async function setupExternalRequestMocking(page: Page): Promise<void> {
  if (routeConfiguredPages.has(page)) return;
  routeConfiguredPages.add(page);

  await page.route(
    (url: URL) =>
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== 'localhost' &&
      url.hostname !== '127.0.0.1',
    async (route: Route) => {
      const url = route.request().url();
      try {
        const parsedUrl = new URL(url);
        const path = parsedUrl.pathname.toLowerCase();

        if (path.endsWith('.pdf')) {
          // PDFリクエスト: 最小限の有効なPDFを返す
          await route.fulfill({
            status: 200,
            contentType: 'application/pdf',
            body: Buffer.from(MINIMAL_PDF_BASE64, 'base64'),
          });
        } else {
          // 画像・その他: 1x1透明PNGを返す
          // picsum.photos, via.placeholder.com等のプレースホルダーサービスに対応
          await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from(TRANSPARENT_1X1_PNG_BASE64, 'base64'),
          });
        }
      } catch {
        // URLパースに失敗した場合は空レスポンスを返す
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: '',
        });
      }
    }
  );
}

/**
 * Custom reporter that only logs when violations are detected.
 * Suppresses "No accessibility violations detected!" messages for cleaner output.
 */
const silentOnSuccessReporter: Reporter = (results: AxeResults): void => {
  if (results.violations.length > 0) {
    // Show summary table of violations
    const violationSummary = results.violations.map((v, i) => ({
      '#': i,
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    }));
    console.log('\n🔴 Accessibility violations detected:');
    console.table(violationSummary);

    // Show detailed node information
    results.violations.forEach((violation) => {
      console.log(`\n[${violation.id}] ${violation.help}`);
      console.log(`  Impact: ${violation.impact}`);
      console.log(`  Documentation: ${violation.helpUrl}`);
      violation.nodes.forEach((node, idx) => {
        console.log(`  Node ${idx + 1}: ${node.target.join(', ')}`);
        console.log(
          `    HTML: ${node.html.substring(0, 150)}${node.html.length > 150 ? '...' : ''}`
        );
      });
    });
  }
  // Success case: no output for cleaner logs
};

const config: TestRunnerConfig = {
  // Hook executed before each story visit
  async preVisit(page) {
    // 外部リクエストのモック設定（テスト決定性保証）
    await setupExternalRequestMocking(page);
    // Inject axe-core library into the page
    await injectAxe(page);
  },

  // Hook executed after each story render
  async postVisit(page) {
    // Run accessibility checks on the rendered story
    await checkA11y(page, '#storybook-root', {
      // Disable default reporter, use custom reporter only
      detailedReport: false,
      // Custom reporter: only log on violations
      reporter: silentOnSuccessReporter,
      // Axe configuration
      axeOptions: {
        runOnly: {
          type: 'tag',
          values: [
            'wcag2a', // WCAG 2.0 Level A
            'wcag2aa', // WCAG 2.0 Level AA
            'wcag21a', // WCAG 2.1 Level A
            'wcag21aa', // WCAG 2.1 Level AA
          ],
        },
        rules: {
          // Storybookでは個別コンポーネントをテストするため、
          // ページ全体のh1見出しは不要（親ページで提供される想定）
          'page-has-heading-one': { enabled: false },
        },
      },
    });
  },
};

export default config;
