/**
 * @fileoverview 受領見積書の OCR の、外部の AI へ送る前の確認を経る補助（estimate-request のタスク119.1）
 *
 * 受領見積書の OCR は、Claude Vision を試す前に状態（`GET /api/claude-vision/status`）を読み、
 * `available` のときだけ確認を出して「送って読み取る」が選ばれた後に抽出を呼ぶ
 * （estimate-request の design の「Requirements 43-50」の章の D7。24.2 の改訂）。
 *
 * E2E の環境の backend は ANTHROPIC_API_KEY を持たないため、状態は `not_configured` になり確認も抽出も出ない。
 * Claude Vision を試す経路を確かめる検証は、状態の応答だけを `available` に差し替え、確認で送ると選ぶ。
 * 抽出の要求は差し替えない限り本物の backend へ届く（鍵が無いため 503 で確定する）。
 *
 * @module e2e/helpers/claude-vision-consent
 */

import { expect, type Page } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/** 本番 `frontend/src/api/claude-vision.ts` が読む状態の API のパス */
export const CLAUDE_VISION_STATUS_PATH = '/api/claude-vision/status';

/** 本番の確認のダイアログの名前（frontend の vision-consent-messages.ts の TITLE） */
const CONSENT_DIALOG_NAME = '外部のAIでの読み取りの確認';

/** 本番の確認で送ると選ぶボタンの名前（frontend の vision-consent-messages.ts の SEND） */
const SEND_BUTTON_NAME = '送って読み取る';

/**
 * 状態の API の応答を `available` に差し替える。ページの遷移より前に呼ぶ。
 *
 * @param page Playwright のページ
 * @returns 差し替えた状態の要求の件数を返す関数（確認の前に状態を読んだことの観測に使う）
 */
export async function routeClaudeVisionStatusAvailable(page: Page): Promise<() => number> {
  let count = 0;
  await page.route(`**${CLAUDE_VISION_STATUS_PATH}`, async (route) => {
    count += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true, reason: null }),
    });
  });
  return () => count;
}

/**
 * 外部の AI へ送る前の確認が出るのを待ち、「送って読み取る」を選ぶ。
 *
 * 確認が出なければ待機が失敗する（沈黙して抜ける経路は無い）。選んだ後は確認が閉じることまで確かめる。
 *
 * @param page Playwright のページ
 */
export async function chooseSendToExternalAi(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: CONSENT_DIALOG_NAME });
  await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
  await dialog.getByRole('button', { name: SEND_BUTTON_NAME, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
