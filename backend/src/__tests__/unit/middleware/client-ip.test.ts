/**
 * @fileoverview 送信元 IP の識別（ClientIpResolver）の単体テスト（user-authentication タスク44.5）
 *
 * 確かめること:
 * - `getClientIp` は Express の `req.ip`（信頼する中継の段数で決まる値）だけを返し、
 *   利用者が指定できる `X-Forwarded-For`・`X-Real-IP` を直接読まない（要件35.1、35.2）
 * - `configureTrustProxy` は `trust proxy` を段数の数値にし、未設定なら 0（中継を信頼しない）にする
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request } from 'express';
import { configureTrustProxy, getClientIp } from '../../../middleware/client-ip.js';

/** 段数を設定したアプリで、受け取った要求の送信元の識別を返す */
function createEchoApp(hops: number | undefined): express.Express {
  const app = express();
  configureTrustProxy(app, hops);
  app.get('/ip', (req, res) => {
    res.json({ ip: getClientIp(req) });
  });
  return app;
}

describe('getClientIp', () => {
  it('X-Forwarded-For・X-Real-IP を読まず req.ip を返す', () => {
    const req = {
      ip: '192.0.2.10',
      headers: {
        'x-forwarded-for': '198.51.100.1, 10.0.0.1',
        'x-real-ip': '198.51.100.2',
      },
    } as unknown as Request;

    expect(getClientIp(req)).toBe('192.0.2.10');
  });

  it('req.ip が無いときは unknown を返す（ヘッダーへ退避しない）', () => {
    const req = {
      ip: undefined,
      headers: { 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2' },
    } as unknown as Request;

    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('configureTrustProxy', () => {
  it('段数の数値を trust proxy に設定する（全面的な信頼 true にしない）', () => {
    const app = express();
    configureTrustProxy(app, 2);
    expect(app.get('trust proxy')).toBe(2);
  });

  it('段数が未設定なら 0（中継を信頼しない）にする', () => {
    const app = express();
    configureTrustProxy(app, undefined);
    expect(app.get('trust proxy')).toBe(0);
  });

  it('段数 1 では X-Forwarded-For の末尾（信頼する中継が付けた値）を送信元とし、先頭の偽装に左右されない', async () => {
    const app = createEchoApp(1);

    const first = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.1, 203.0.113.5')
      .expect(200);
    const second = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.5')
      .set('X-Real-IP', '198.51.100.100')
      .expect(200);

    expect(first.body.ip).toBe('203.0.113.5');
    expect(second.body.ip).toBe('203.0.113.5');
  });

  it('段数 0 では X-Forwarded-For・X-Real-IP を無視し、接続元のアドレスを送信元とする', async () => {
    const app = createEchoApp(0);

    const plain = await request(app).get('/ip').expect(200);
    const spoofed = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.1')
      .set('X-Real-IP', '198.51.100.2')
      .expect(200);

    expect(spoofed.body.ip).toBe(plain.body.ip);
    expect(spoofed.body.ip).not.toBe('198.51.100.1');
    expect(spoofed.body.ip).not.toBe('198.51.100.2');
  });
});
