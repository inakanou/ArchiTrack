/**
 * 出力の記録の要求を自動再試行しないことのテスト（実際の apiClient と fetch の呼び出し回数で確かめる）
 *
 * user-authentication の design.md の「ExportAuditService と ExportAuditClient」の節（2026-10-29 の是正）。
 * 記録の要求（`POST /api/v1/audit-logs/exports`）は送るたびに記録が 1 件増える非冪等な要求なので、
 * 5xx・時間切れ・通信の失敗でも送り直さない。サーバーが書いた後に応答が失われた場合に
 * 送り直すと記録が重なり、出力 1 回につき記録 1 回（要件40.10）が崩れるため。
 * 401 のトークン更新の後の送り直しは、要求がサーバーで弾かれた（記録されていない）後なので残す。
 *
 * 隣の export-audit.test.ts は apiClient を差し替えるため、送信の回数はこのファイルで確かめる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXPORT_RECORD_FAILED_MESSAGE,
  recordExport,
  runRecordedExport,
  type ExportRecordInput,
} from '../../api/export-audit';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
  },
}));

const INPUT: ExportRecordInput = {
  kind: 'site_survey_report_pdf',
  projectId: 'project-1',
  targetIds: ['image-1'],
  itemCount: 1,
};

const RECORD_PATH = '/api/v1/audit-logs/exports';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 201 ? 'Created' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  };
}

/** fetch の呼び出しのうち、記録の要求だけを数える */
function countRecordRequests(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(RECORD_PATH)).length;
}

describe('出力の記録の要求は自動再試行しない', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    apiClient.setTokenRefreshCallback(null);
    apiClient.setAccessToken(null);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each([
    ['記録の失敗（500・EXPORT_RECORD_FAILED）', { status: 500, code: 'EXPORT_RECORD_FAILED' }],
    ['コードの無い 500（記録の後に応答が壊れた場合を含む）', { status: 500 }],
    ['別のコードの 500', { status: 500, code: 'INTERNAL_ERROR' }],
    ['上流の応答不能（503）', { status: 503 }],
  ])('%s では記録の要求を 1 回だけ送る', async (_label, body) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body.status, body));
    globalThis.fetch = fetchMock;

    await expect(recordExport(INPUT)).rejects.toThrow(ApiError);

    expect(countRecordRequests(fetchMock)).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('通信の失敗では記録の要求を 1 回だけ送る', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    globalThis.fetch = fetchMock;

    await expect(recordExport(INPUT)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      '記録の失敗（500）',
      () => vi.fn().mockResolvedValue(jsonResponse(500, { code: 'EXPORT_RECORD_FAILED' })),
    ],
    ['通信の失敗', () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))],
  ])(
    'runRecordedExport は %s で記録の要求を 1 回だけ送り、生成を呼ばずに RECORD_FAILED を返す',
    async (_label, makeFetch) => {
      const fetchMock = makeFetch();
      globalThis.fetch = fetchMock;
      const generate = vi.fn(async () => 'generated');

      const result = await runRecordedExport(INPUT, generate);

      expect(result).toEqual({
        ok: false,
        error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
      });
      expect(generate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('401 のトークン更新の後の送り直しは残る（弾かれた要求は記録されていない）', async () => {
    const refresh = vi.fn().mockResolvedValue('new-access-token');
    apiClient.setTokenRefreshCallback(refresh);
    apiClient.setAccessToken('old-access-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(201, { recordId: 'record-1' }));
    globalThis.fetch = fetchMock;
    const generate = vi.fn(async () => 'generated');

    const result = await runRecordedExport(INPUT, generate);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(countRecordRequests(fetchMock)).toBe(2);
    expect(result).toEqual({ ok: true, value: 'generated' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
