/**
 * @fileoverview アクセスログの要求識別子・伏せ字・利用者 ID の検証（user-authentication タスク55.2）
 *
 * Requirements (user-authentication):
 * - REQ-37.3: 招待・パスワードリセットのトークンの検証要求の記録にトークンの値を残さない
 * - REQ-42.3: アクセスログの URL のクエリに含まれるトークン・パスワード等の機密値をマスクする
 * - REQ-42.5: 要求識別子をサーバー側で生成し、利用者が指定した値を要求識別子として用いない
 * - REQ-42.6: 認証済みの要求のアクセスログに利用者の ID を記録する
 *
 * 実際の pino-http と pino を通し、書き出された 1 行の JSON を読んで確かめる
 * （設定の関数だけを呼ぶのでは、pino-http が customProps を呼ぶ時点などの結線を確かめられないため）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const captured = vi.hoisted(() => ({ lines: [] as string[] }));

// vitest.setup.ts の何もしない httpLogger の差し替えを外し、実物を使う
vi.unmock('../../../middleware/logger.middleware.js');

// 書き出しを捕まえる実物の pino
vi.mock('../../../utils/logger.js', async () => {
  const { default: pino } = await import('pino');
  return {
    default: pino(
      { level: 'info' },
      {
        write: (line: string) => {
          captured.lines.push(line);
        },
      }
    ),
  };
});

const { httpLogger, redactUrlQuery, RECEIVED_REQUEST_ID_MAX_LENGTH } =
  await import('../../../middleware/logger.middleware.js');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AccessLogLine {
  msg: string;
  userId?: string;
  req: {
    id: string;
    clientRequestId?: string;
    edgeRequestId?: string;
    url: string;
    headers: Record<string, unknown>;
  };
  res: { statusCode: number };
}

/**
 * httpLogger の後ろで authenticate の代わりに req.user を設定するアプリ
 * （実際の app.ts でも authenticate は httpLogger より後に動く）
 */
function createApp(): express.Express {
  const app = express();
  app.use(httpLogger);
  app.use((req, _res, next) => {
    const userId = req.get('x-test-user');
    if (userId) {
      req.user = { userId, email: 'user@example.com', roles: ['user'] };
    }
    next();
  });
  app.all('/{*path}', (req, res) => {
    res.json({ requestId: (req as express.Request & { id?: unknown }).id });
  });
  return app;
}

/** 要求を 1 件送り、書き出されたアクセスログの 1 行を返す */
async function send(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ response: request.Response; line: AccessLogLine; raw: string }> {
  const req = request(createApp()).get(path);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  const response = await req;
  await vi.waitFor(() => {
    expect(captured.lines.length).toBeGreaterThan(0);
  });
  expect(captured.lines).toHaveLength(1);
  const raw = captured.lines[0] as string;
  return { response, line: JSON.parse(raw) as AccessLogLine, raw };
}

beforeEach(() => {
  captured.lines.length = 0;
});

describe('アクセスログのクエリの伏せ字', () => {
  /**
   * @requirement user-authentication/REQ-37.3
   * @requirement user-authentication/REQ-42.3
   */
  it('?token= の値が記録のどこにも出ない（URL もメッセージも伏せ字）', async () => {
    const { line, raw } = await send('/api/v1/invitations/verify?token=s3cr3t-invite-token&page=2');

    expect(raw).not.toContain('s3cr3t-invite-token');
    expect(line.req.url).toBe('/api/v1/invitations/verify?token=[REDACTED]&page=2');
    expect(line.msg).toBe('GET /api/v1/invitations/verify?token=[REDACTED]&page=2');
  });

  /**
   * @requirement user-authentication/REQ-42.3
   */
  it('design の対象のキーをすべて大文字小文字を問わず伏せ、機密でないキーは残す', async () => {
    const secrets = {
      TOKEN: 'v-token',
      Password: 'v-password',
      code: 'v-code',
      backupcode: 'v-backup',
      refreshToken: 'v-refresh',
      secret: 'v-secret',
      KEY: 'v-key',
      signature: 'v-signature',
      'x-amz-signature': 'v-amz-signature',
      'X-Amz-Credential': 'v-amz-credential',
    };
    const query = Object.entries(secrets)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const { line, raw } = await send(`/api/files?${query}&q=keep-me`);

    for (const value of Object.values(secrets)) {
      expect(raw).not.toContain(value);
    }
    expect(line.req.url).toContain('q=keep-me');
    expect(line.req.url).toContain('TOKEN=[REDACTED]');
    expect(line.req.url).toContain('X-Amz-Credential=[REDACTED]');
  });

  /**
   * @requirement user-authentication/REQ-42.3
   */
  it('%エンコードしたキー・配列の添字付きのキーも伏せる', () => {
    expect(redactUrlQuery('/a?%74oken=abc')).toBe('/a?%74oken=[REDACTED]');
    expect(redactUrlQuery('/a?token[]=abc&token[0]=def')).toBe(
      '/a?token[]=[REDACTED]&token[0]=[REDACTED]'
    );
    expect(redactUrlQuery('/a?tokens=keep')).toBe('/a?tokens=keep');
    expect(redactUrlQuery('/a')).toBe('/a');
  });
});

describe('要求識別子', () => {
  /**
   * @requirement user-authentication/REQ-42.5
   */
  it('受信した X-Request-Id は要求識別子にならず、別の項目 clientRequestId に記録される', async () => {
    const { response, line } = await send('/api/ping', { 'X-Request-Id': 'attacker-chosen-id' });

    const returned = response.headers['x-request-id'];
    expect(returned).toMatch(UUID_PATTERN);
    expect(returned).not.toBe('attacker-chosen-id');
    expect(line.req.id).toBe(returned);
    expect(line.req.clientRequestId).toBe('attacker-chosen-id');
    // 経路の処理（監査の metadata.requestId が読む req.id）も同じサーバー生成の値を見る
    expect(response.body.requestId).toBe(returned);
  });

  /**
   * @requirement user-authentication/REQ-42.5
   */
  it('X-Railway-Request-Id も要求識別子にならず edgeRequestId に記録される', async () => {
    const { response, line } = await send('/api/ping', { 'X-Railway-Request-Id': 'edge-123' });

    expect(line.req.id).toMatch(UUID_PATTERN);
    expect(line.req.id).toBe(response.headers['x-request-id']);
    expect(line.req.edgeRequestId).toBe('edge-123');
    expect(line.req.headers).not.toHaveProperty('x-railway-request-id');
  });

  /**
   * @requirement user-authentication/REQ-42.5
   */
  it('受信した識別子は 128 文字に切り詰めて記録する', async () => {
    const long = 'x'.repeat(500);
    const { line } = await send('/api/ping', {
      'X-Request-Id': long,
      'X-Railway-Request-Id': long,
    });

    expect(line.req.clientRequestId).toBe('x'.repeat(RECEIVED_REQUEST_ID_MAX_LENGTH));
    expect(line.req.edgeRequestId).toBe('x'.repeat(RECEIVED_REQUEST_ID_MAX_LENGTH));
    expect(RECEIVED_REQUEST_ID_MAX_LENGTH).toBe(128);
  });

  /**
   * @requirement user-authentication/REQ-42.5
   */
  it('識別子は要求ごとに異なる', async () => {
    const first = await send('/api/ping');
    captured.lines.length = 0;
    const second = await send('/api/ping');

    expect(first.line.req.id).not.toBe(second.line.req.id);
  });
});

describe('利用者 ID', () => {
  /**
   * @requirement user-authentication/REQ-42.6
   */
  it('httpLogger の後で認証された要求の記録に userId が付く', async () => {
    const { line } = await send('/api/projects', { 'x-test-user': 'user-55-2' });

    expect(line.userId).toBe('user-55-2');
  });

  /**
   * @requirement user-authentication/REQ-42.6
   */
  it('未認証の要求の記録には userId が無い', async () => {
    const { line } = await send('/api/projects');

    expect(line).not.toHaveProperty('userId');
  });
});
