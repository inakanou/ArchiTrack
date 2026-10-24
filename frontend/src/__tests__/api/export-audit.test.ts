/**
 * ブラウザで生成する出力の事前記録の包み（ExportAuditClient）のテスト
 *
 * user-authentication タスク53.4。design.md の「ExportAuditService と ExportAuditClient」の節。
 * 記録の要求（`POST /api/v1/audit-logs/exports`）が成功したときだけ生成を呼び、
 * 失敗したときは生成を始めずにエラーメッセージを返すことを確かめる。
 *
 * Requirements (user-authentication):
 * - REQ-40.10: 出力の開始時に記録を要求し、記録の成功を待ってから生成を始める
 * - REQ-40.11: 記録の要求が失敗したときは生成を始めず、エラーメッセージを返す
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EXPORT_RECORD_FAILED_MESSAGE,
  recordExport,
  runRecordedExport,
  type ExportRecordInput,
} from '../../api/export-audit';
import { ApiError, apiClient } from '../../api/client';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiClient: {
      post: vi.fn(),
    },
  };
});

const INPUT: ExportRecordInput = {
  kind: 'site_survey_report_pdf',
  projectId: 'project-1',
  targetIds: ['image-1', 'image-2'],
  itemCount: 2,
};

describe('export-audit API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordExport', () => {
    /**
     * @requirement user-authentication/REQ-40.10
     */
    it('POST /api/v1/audit-logs/exports へ記録の入力をそのまま送り、記録の ID を返す', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });

      const result = await recordExport(INPUT);

      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/audit-logs/exports', INPUT);
      expect(result).toEqual({ recordId: 'record-1' });
    });
  });

  describe('runRecordedExport', () => {
    /**
     * @requirement user-authentication/REQ-40.10
     */
    it('記録の要求が成功してから生成を呼び、生成の結果を返す', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });
      const generate = vi.fn(async () => 'generated-pdf');

      const result = await runRecordedExport(INPUT, generate);

      expect(result).toEqual({ ok: true, value: 'generated-pdf' });
      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/audit-logs/exports', INPUT);
      expect(generate).toHaveBeenCalledTimes(1);
      const postOrder = vi.mocked(apiClient.post).mock.invocationCallOrder[0] as number;
      const generateOrder = generate.mock.invocationCallOrder[0] as number;
      expect(postOrder).toBeLessThan(generateOrder);
    });

    /**
     * @requirement user-authentication/REQ-40.10
     */
    it('記録の応答が返るまで生成を始めない', async () => {
      let resolveRecord: (value: { recordId: string }) => void = () => {};
      vi.mocked(apiClient.post).mockReturnValue(
        new Promise((resolve) => {
          resolveRecord = resolve;
        })
      );
      const generate = vi.fn(async () => 'generated-pdf');

      const pending = runRecordedExport(INPUT, generate);
      // 記録の要求は送られているが、応答が無い間は生成が呼ばれない
      await Promise.resolve();
      await Promise.resolve();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(generate).not.toHaveBeenCalled();

      resolveRecord({ recordId: 'record-1' });
      await expect(pending).resolves.toEqual({ ok: true, value: 'generated-pdf' });
      expect(generate).toHaveBeenCalledTimes(1);
    });

    /**
     * @requirement user-authentication/REQ-40.11
     */
    it.each([
      ['記録の失敗（500）', new ApiError(500, 'Export record failed')],
      ['範囲外の案件（404）', new ApiError(404, 'Not Found')],
      ['入力の不備（400）', new ApiError(400, 'Validation failed')],
      ['通信の失敗', new TypeError('Failed to fetch')],
    ])('%s のとき生成を呼ばず、記録の失敗とエラーメッセージを返す', async (_label, error) => {
      vi.mocked(apiClient.post).mockRejectedValue(error);
      const generate = vi.fn(async () => 'generated-pdf');

      const result = await runRecordedExport(INPUT, generate);

      expect(generate).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
      });
      expect(EXPORT_RECORD_FAILED_MESSAGE).toBe('出力を記録できなかったため中止しました');
    });

    /**
     * @requirement user-authentication/REQ-40.11
     */
    it('記録の応答に記録の ID が無いときは記録の失敗として生成を呼ばない', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({});
      const generate = vi.fn(async () => 'generated-pdf');

      const result = await runRecordedExport(INPUT, generate);

      expect(generate).not.toHaveBeenCalled();
      expect(result).toEqual({
        ok: false,
        error: { type: 'RECORD_FAILED', message: EXPORT_RECORD_FAILED_MESSAGE },
      });
    });

    it('記録の後に生成が失敗したときは生成の失敗として原因を返し、記録を再送しない', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ recordId: 'record-1' });
      const cause = new Error('PDF generation failed');
      const generate = vi.fn(async () => {
        throw cause;
      });

      const result = await runRecordedExport(INPUT, generate);

      expect(generate).toHaveBeenCalledTimes(1);
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: false, error: { type: 'GENERATION_FAILED', cause } });
    });
  });
});
