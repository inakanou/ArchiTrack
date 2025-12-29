import type { TestRunnerConfig } from '@storybook/test-runner';
import type { AxeResults } from 'axe-core';
import type { Reporter } from 'axe-playwright';
import { injectAxe, checkA11y } from 'axe-playwright';

/*
 * Storybook Test Runner configuration with Accessibility Testing
 *
 * This configuration integrates axe-core for automated accessibility testing
 * on all Storybook stories, ensuring WCAG 2.1 compliance.
 */

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
