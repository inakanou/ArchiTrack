import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pino from 'pino';

describe('Logger Sensitive Data Masking', () => {
  let logOutput: string[];
  let logger: pino.Logger;

  beforeEach(() => {
    logOutput = [];

    // メモリ内に書き込むカスタムストリームを作成
    const stream = {
      write: (chunk: string) => {
        logOutput.push(chunk);
      },
    };

    // ログマスキング設定を持つロガーを作成
    logger = pino(
      {
        level: 'debug',
        // 機密情報をマスキングするためのredactオプション
        redact: {
          paths: [
            'password',
            'passwordHash',
            'token',
            'accessToken',
            'refreshToken',
            'invitationToken',
            'resetToken',
            'secret',
            'twoFactorSecret',
            'backupCodes',
            '*.password',
            '*.passwordHash',
            '*.token',
            '*.accessToken',
            '*.refreshToken',
            '*.invitationToken',
            '*.resetToken',
            '*.secret',
            '*.twoFactorSecret',
            '*.backupCodes',
            'req.headers.authorization',
            'req.headers["x-csrf-token"]',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
      stream
    );
  });

  afterEach(() => {
    logOutput = [];
  });

  it('should mask password in log output', () => {
    logger.info({ password: 'SuperSecret123!' }, 'User login attempt');

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.password).toBe('[REDACTED]');
    expect(logEntry.msg).toBe('User login attempt');
  });

  it('should mask passwordHash in log output', () => {
    logger.info({ passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$...' }, 'Password hash generated');

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.passwordHash).toBe('[REDACTED]');
  });

  it('should mask token fields in log output', () => {
    logger.info(
      {
        accessToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...',
      },
      'Tokens generated'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.accessToken).toBe('[REDACTED]');
    expect(logEntry.refreshToken).toBe('[REDACTED]');
  });

  it('should mask secret fields in log output', () => {
    logger.info({ twoFactorSecret: 'JBSWY3DPEHPK3PXP', secret: 'mysecret' }, '2FA setup');

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.twoFactorSecret).toBe('[REDACTED]');
    expect(logEntry.secret).toBe('[REDACTED]');
  });

  it('should mask nested password fields', () => {
    logger.info({ user: { email: 'test@example.com', password: 'secret123' } }, 'User data');

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.user.email).toBe('test@example.com');
    expect(logEntry.user.password).toBe('[REDACTED]');
  });

  it('should mask authorization header', () => {
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...',
            'content-type': 'application/json',
          },
        },
      },
      'HTTP request'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.req.headers.authorization).toBe('[REDACTED]');
    expect(logEntry.req.headers['content-type']).toBe('application/json');
  });

  it('should mask CSRF token header', () => {
    logger.info(
      {
        req: {
          headers: {
            'x-csrf-token': 'csrf-token-value',
            'user-agent': 'Mozilla/5.0',
          },
        },
      },
      'CSRF protected request'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.req.headers['x-csrf-token']).toBe('[REDACTED]');
    expect(logEntry.req.headers['user-agent']).toBe('Mozilla/5.0');
  });

  it('should mask set-cookie response header', () => {
    logger.info(
      {
        res: {
          headers: {
            'set-cookie': ['refreshToken=abc123; HttpOnly; Secure'],
            'content-type': 'application/json',
          },
        },
      },
      'HTTP response'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.res.headers['set-cookie']).toBe('[REDACTED]');
    expect(logEntry.res.headers['content-type']).toBe('application/json');
  });

  it('should mask backup codes array', () => {
    logger.info(
      { backupCodes: ['12345678', '87654321', 'abcdefgh'] },
      '2FA backup codes generated'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.backupCodes).toBe('[REDACTED]');
  });

  it('should not mask non-sensitive fields', () => {
    logger.info(
      {
        userId: 'user-123',
        email: 'test@example.com',
        roles: ['user', 'admin'],
        timestamp: new Date().toISOString(),
      },
      'User information'
    );

    expect(logOutput.length).toBeGreaterThan(0);
    const logEntry = JSON.parse(logOutput[0]!);
    expect(logEntry.userId).toBe('user-123');
    expect(logEntry.email).toBe('test@example.com');
    expect(logEntry.roles).toEqual(['user', 'admin']);
    expect(logEntry.timestamp).toBeDefined();
  });
});
