import type { TestRunnerConfig } from '@storybook/test-runner';
import { injectAxe, checkA11y } from 'axe-playwright';

/*
 * Storybook Test Runner configuration with Accessibility Testing
 *
 * This configuration integrates axe-core for automated accessibility testing
 * on all Storybook stories, ensuring WCAG 2.1 compliance.
 */

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
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
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
      },
    });
  },
};

export default config;
