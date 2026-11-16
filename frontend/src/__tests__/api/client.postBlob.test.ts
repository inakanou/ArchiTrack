/**
 * @fileoverview ファイルを返す POST の口（postBlob）の単体テスト（unit-price-ledger タスク4.1）
 *
 * 台帳の書き出し（`POST /api/unit-price-ledger/exports`）は、絞り込みを本文で送り、成功の本文が
 * Excel のファイルそのものになる。成功の本文を Blob で返し、失敗の本文は JSON として ApiError に載せる。
 *
 * @requirement unit-price-ledger/REQ-10.1 台帳の書き出しの呼び出し
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiClient, getApiErrorCode } from '../../api/client';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), exception: vi.fn() },
}));

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('postBlob（ファイルを返す POST）', () => {
  afterEach(() => {
    apiClient.setAccessToken(null);
  });

  it('本文を JSON で送り、成功の本文を Blob で返す', async () => {
    const fileBlob = new Blob(['PK-xlsx'], { type: XLSX_TYPE });
    const text = vi.fn(async () => 'PK-xlsx');
    apiClient.setAccessToken('access-token');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': XLSX_TYPE }),
      blob: async () => fileBlob,
      text,
      json: vi.fn(),
    });

    const result = await apiClient.postBlob('/api/unit-price-ledger/exports', { keyword: 'a' });

    expect(result).toBe(fileBlob);
    expect(text).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/unit-price-ledger/exports',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ keyword: 'a' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer access-token',
        }),
      })
    );
  });

  it('失敗の応答は JSON の本文を持つ ApiError を投げる', async () => {
    const problem = { detail: '書き出す見積がありません', code: 'LEDGER_EXPORT_EMPTY' };
    const blob = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => problem,
      blob,
    });

    const error = await apiClient
      .postBlob('/api/unit-price-ledger/exports', {}, { disableRetry: true })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(400);
    expect(getApiErrorCode(error)).toBe('LEDGER_EXPORT_EMPTY');
    expect(blob).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
