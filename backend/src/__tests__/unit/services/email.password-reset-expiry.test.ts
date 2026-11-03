/**
 * @fileoverview パスワードリセットメールに書く有効期限（タスク48.2）
 *
 * Requirements (user-authentication):
 * - 7.3: リセットトークンは 1 時間で無効
 *
 * 本物のテンプレートと Handlebars で描画し、本文の有効期限が判定と同じ 1 時間の定義から来ることを確かめる。
 */

import { describe, it, expect, vi } from 'vitest';
import type { Queue } from 'bull';
import type { Transporter } from 'nodemailer';
import { EmailService } from '../../../services/email.service.js';
import { SESSION_CONFIG } from '../../../config/security.constants.js';

type ResetJob = { data: { to: string; resetToken: string } };

/** 本物のテンプレートで描画したリセットメールの本文 */
async function renderResetEmailHtml(): Promise<string> {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'm-1' });
  let processReset: ((job: ResetJob) => Promise<void>) | undefined;
  const queue = {
    add: vi.fn(),
    on: vi.fn(),
    process: vi.fn((name: string, callback: (job: ResetJob) => Promise<void>) => {
      if (name === 'password-reset-email') {
        processReset = callback;
      }
    }),
  };
  new EmailService({ sendMail } as unknown as Transporter, queue as unknown as Queue);

  expect(processReset).toBeDefined();
  await processReset!({ data: { to: 'user@example.com', resetToken: 'reset-token-1' } });
  return (sendMail.mock.calls[0]![0] as { html: string }).html;
}

describe('パスワードリセットメールの有効期限の表記', () => {
  /**
   * @requirement user-authentication/REQ-7.3
   */
  it('本文は 1 時間有効と書き、24 時間とは書かない', async () => {
    const html = await renderResetEmailHtml();

    expect(SESSION_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY_MS).toBe(60 * 60 * 1000);
    expect(html).toContain('このリンクは1時間有効です。');
    expect(html).not.toContain('24時間');
  });
});
