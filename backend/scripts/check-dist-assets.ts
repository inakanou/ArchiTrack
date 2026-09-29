#!/usr/bin/env tsx
// scripts/check-dist-assets.ts
// ビルドの出力（dist）が、本番で実行時に読むファイルを伴っているかを検査する。
//
// 本番のイメージ（backend/Dockerfile の最終段）は dist だけを運び、node dist/src/index.js で起動する。
// 単体テストは fs をモックし、開発・E2E は tsx でソースを直接実行するため、
// dist にメールのテンプレートが欠けていても本番以外では誰も気づかない。
// そこで `npm run build` の後の dist から EmailService を読み込み、キューの処理関数を本番と同じ経路で
// 呼んで 4 種のメールの本文を実際に描画する。Redis と SMTP の代わりに、投入口と送信口の偽物を注入する。
//
// 使い方: npm run build && npm run check:dist-assets（backend ディレクトリの npm script）

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Handlebars from 'handlebars';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateSourceDir = join(backendDir, 'src', 'templates');
const templateDistDir = join(backendDir, 'dist', 'src', 'templates');
const distEmailServicePath = join(backendDir, 'dist', 'src', 'services', 'email.service.js');

const FRONTEND_URL = 'https://architrack.example.test';

interface SentMail {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
}

type JobHandler = (job: { data: unknown }) => Promise<void>;

interface CheckCase {
  jobName: string;
  data: unknown;
  expectedRecipients: string[];
  expectedSubjectPrefix: string;
  /** 描画後の本文に含まれるべき断片（Handlebars のエスケープ後の形） */
  expectedFragments: string[];
}

const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
  console.error(`❌ ${message}`);
}

function escaped(value: string): string {
  return Handlebars.escapeExpression(value);
}

/**
 * src/templates の各 .hbs が dist/src/templates に同じ内容で在ることを確かめる
 */
function checkTemplateFilesCopied(): void {
  const sourceTemplates = readdirSync(templateSourceDir).filter((name) => name.endsWith('.hbs'));
  if (sourceTemplates.length === 0) {
    fail(`テンプレートが 1 件も見つかりません: ${templateSourceDir}`);
    return;
  }

  for (const name of sourceTemplates) {
    const distPath = join(templateDistDir, name);
    if (!existsSync(distPath)) {
      fail(`ビルドの出力にテンプレートがありません: ${distPath}`);
      continue;
    }
    const source = readFileSync(join(templateSourceDir, name), 'utf-8');
    const built = readFileSync(distPath, 'utf-8');
    if (source !== built) {
      fail(`ビルドの出力のテンプレートがソースと食い違います（再ビルドが必要）: ${distPath}`);
    }
  }
  console.log(
    `🔍 テンプレートのファイル: ソース ${sourceTemplates.length} 件を dist と照合しました`
  );
}

/**
 * dist の EmailService を読み込み、4 種のメールを処理関数の経路で描画する
 */
async function checkTemplatesRenderFromDist(): Promise<void> {
  if (!existsSync(distEmailServicePath)) {
    fail(`ビルドの出力に EmailService がありません（先に npm run build）: ${distEmailServicePath}`);
    return;
  }

  process.env.FRONTEND_URL = FRONTEND_URL;
  process.env.LOG_LEVEL ??= 'silent';

  const module = (await import(pathToFileURL(distEmailServicePath).href)) as {
    EmailService: new (transporter: unknown, queue: unknown) => unknown;
  };

  const handlers = new Map<string, JobHandler>();
  const fakeQueue = {
    process(name: string, handler: JobHandler): void {
      handlers.set(name, handler);
    },
    async add(): Promise<void> {},
  };
  const sent: SentMail[] = [];
  const fakeTransporter = {
    async sendMail(mail: SentMail): Promise<void> {
      sent.push(mail);
    },
  };

  new module.EmailService(fakeTransporter, fakeQueue);

  const invitationToken = 'invitation-token-abc';
  const resetToken = 'reset-token-xyz';
  const cases: CheckCase[] = [
    {
      jobName: 'invitation-email',
      data: { to: 'invitee@example.test', invitationToken },
      expectedRecipients: ['invitee@example.test'],
      expectedSubjectPrefix: 'ArchiTrackへの招待',
      expectedFragments: [`href="${escaped(`${FRONTEND_URL}/register?token=${invitationToken}`)}"`],
    },
    {
      jobName: 'password-reset-email',
      data: { to: 'reset@example.test', resetToken },
      expectedRecipients: ['reset@example.test'],
      expectedSubjectPrefix: 'パスワードリセットのご案内',
      expectedFragments: [
        `href="${escaped(`${FRONTEND_URL}/password-reset?token=${resetToken}`)}"`,
      ],
    },
    {
      jobName: '2fa-enabled-email',
      data: { to: 'twofactor@example.test' },
      expectedRecipients: ['twofactor@example.test'],
      expectedSubjectPrefix: '二要素認証が有効化されました',
      expectedFragments: [`href="${escaped(`${FRONTEND_URL}/profile`)}"`],
    },
    {
      jobName: 'admin-role-changed-alert',
      data: {
        adminEmails: ['admin1@example.test', 'admin2@example.test'],
        targetUser: { email: 'target@example.test', displayName: '対象 太郎' },
        action: 'assigned',
        roleName: 'system_admin',
        performedBy: { email: 'actor@example.test', displayName: '実行 花子' },
      },
      expectedRecipients: ['admin1@example.test', 'admin2@example.test'],
      expectedSubjectPrefix: '【重要】システム管理者ロール変更通知',
      expectedFragments: [
        '対象 太郎 (target@example.test)',
        '実行 花子 (actor@example.test)',
        'system_admin',
        '付与',
        `href="${escaped(`${FRONTEND_URL}/admin/audit-logs`)}"`,
      ],
    },
  ];

  for (const testCase of cases) {
    const handler = handlers.get(testCase.jobName);
    if (!handler) {
      fail(`${testCase.jobName}: キューの処理関数が登録されていません`);
      continue;
    }

    sent.length = 0;
    try {
      await handler({ data: testCase.data });
    } catch (error) {
      fail(
        `${testCase.jobName}: dist からの描画に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    const recipients = sent.map((mail) => mail.to ?? '');
    if (JSON.stringify(recipients) !== JSON.stringify(testCase.expectedRecipients)) {
      fail(
        `${testCase.jobName}: 送信先が食い違います expected=${JSON.stringify(testCase.expectedRecipients)} actual=${JSON.stringify(recipients)}`
      );
      continue;
    }

    for (const mail of sent) {
      const html = mail.html ?? '';
      if (!(mail.subject ?? '').startsWith(testCase.expectedSubjectPrefix)) {
        fail(`${testCase.jobName}: 件名が食い違います actual=${JSON.stringify(mail.subject)}`);
      }
      if (!html.includes('<html')) {
        fail(`${testCase.jobName}: 本文が HTML として描画されていません`);
      }
      if (html.includes('{{') || html.includes('}}')) {
        fail(`${testCase.jobName}: 本文に描画されていない式が残っています`);
      }
      for (const fragment of testCase.expectedFragments) {
        if (!html.includes(fragment)) {
          fail(`${testCase.jobName}: 本文に ${JSON.stringify(fragment)} が含まれていません`);
        }
      }
    }
    console.log(`🔍 ${testCase.jobName}: dist から描画し ${sent.length} 通を組み立てました`);
  }
}

async function main(): Promise<void> {
  console.log('🔍 ビルドの出力（dist）のメールのテンプレートを検査します');
  checkTemplateFilesCopied();
  await checkTemplatesRenderFromDist();

  if (failures.length > 0) {
    console.error(`❌ ビルドの出力の検査に失敗しました（${failures.length} 件）`);
    process.exit(1);
  }
  console.log('✅ ビルドの出力からメールのテンプレート 4 種を描画できました');
}

main().catch((error: unknown) => {
  console.error('❌ ビルドの出力の検査が異常終了しました:', error);
  process.exit(1);
});
