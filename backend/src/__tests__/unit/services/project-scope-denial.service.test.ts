/**
 * @fileoverview 範囲外のアクセスの記録の部品の単体テスト（quantity-table-generation タスク104.1）
 *
 * 記録の形そのもの（PROJECT_SCOPE_DENIED の metadata）は判定部品の単体テスト
 * （project-scope.middleware.test.ts）と統合テストが確かめる。本テストは、サービスの中の判定で集めた
 * 範囲外の案件を処理の後に記録する包み（withSurveyScopeDenialRecording）の振る舞いを確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const observe = vi.hoisted(() => vi.fn());
vi.mock('../../../services/security-anomaly-monitor.service.js', () => ({
  observeSecurityAnomaly: observe,
}));

import {
  recordProjectScopeDenied,
  withSurveyScopeDenialRecording,
} from '../../../services/project-scope-denial.service.js';

const context = {
  requestId: 'req-1',
  method: 'PUT',
  path: '/api/quantity-tables/qt/save',
  ipAddress: '203.0.113.9',
  userAgent: 'agent',
};

describe('withSurveyScopeDenialRecording', () => {
  const audit = { createLog: vi.fn().mockResolvedValue({}) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('処理が失敗しても、その後に範囲外の案件を案件ごとに 1 回だけ記録し、元の失敗を投げ直す', async () => {
    const failure = new Error('rolled back');
    const order: string[] = [];
    audit.createLog.mockImplementation(async () => {
      order.push('record');
    });

    await expect(
      withSurveyScopeDenialRecording('user-1', context, audit, async (denied) => {
        denied.add('project-a');
        denied.add('project-a');
        denied.add('project-b');
        order.push('run');
        throw failure;
      })
    ).rejects.toBe(failure);

    expect(order).toEqual(['run', 'record', 'record']);
    expect(audit.createLog.mock.calls.map(([entry]) => entry.targetId)).toEqual([
      'project-a',
      'project-b',
    ]);
    expect(audit.createLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'PROJECT_SCOPE_DENIED',
      actorId: 'user-1',
      targetType: 'Project',
      metadata: context,
    });
    expect(observe).toHaveBeenCalledWith({
      signal: 'scope_denied',
      sourceIp: '203.0.113.9',
      userId: 'user-1',
    });
  });

  it('範囲外が無ければ記録せずに処理の結果を返し、識別が無ければ既定の識別で記録する', async () => {
    await expect(
      withSurveyScopeDenialRecording('user-1', context, audit, async () => 'ok')
    ).resolves.toBe('ok');
    expect(audit.createLog).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();

    await withSurveyScopeDenialRecording('user-1', undefined, audit, async (denied) => {
      denied.add('project-a');
    });
    expect(audit.createLog.mock.calls[0]?.[0].metadata).toEqual({
      requestId: null,
      method: 'UNKNOWN',
      path: '',
      ipAddress: 'unknown',
      userAgent: 'unknown',
    });
  });

  it('記録の失敗は例外を投げず、処理の結果を変えない', async () => {
    audit.createLog.mockRejectedValueOnce(new Error('db down'));
    await expect(
      recordProjectScopeDenied(context, 'user-1', 'project-a', audit)
    ).resolves.toBeUndefined();
    audit.createLog.mockRejectedValueOnce(new Error('db down'));
    await expect(
      withSurveyScopeDenialRecording('user-1', context, audit, async (denied) => {
        denied.add('project-a');
        return 'result';
      })
    ).resolves.toBe('result');
  });
});
