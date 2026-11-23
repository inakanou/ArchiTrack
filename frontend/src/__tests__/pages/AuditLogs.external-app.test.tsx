/**
 * 監査ログの画面に外部アプリの接続の種別の表示名が出ること（user-authentication タスク 71.3）
 */

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogViewer from '../../components/AuditLogViewer';
import { apiClient } from '../../api/client';
import { AuditLogs } from '../../pages/AuditLogs';
import type { AuditLog, AuditLogAction } from '../../types/audit-log.types';
import {
  EXTERNAL_APP_AUDIT_ACTIONS,
  EXTERNAL_APP_AUDIT_ACTION_LABELS,
} from '../../utils/audit-log-actions';

vi.mock('../../api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const expectedLabels = {
  CONSENT_GRANTED: '外部アプリの接続の同意',
  CONSENT_DENIED: '外部アプリの接続の拒否',
  CONNECTION_REPLACED: '外部アプリの接続の置き換え',
  CONNECTION_ENDED: '外部アプリの接続の終了（取り消し・失効）',
  TOKEN_REUSE_DETECTED: '外部アプリのトークン再利用検知',
  REFRESH_GRACE_APPLIED: '外部アプリのトークン更新の猶予の適用',
} as const satisfies Partial<Record<AuditLogAction, string>>;

const actions = Object.keys(expectedLabels) as (keyof typeof expectedLabels)[];

const logs: AuditLog[] = actions.map((action, index) => ({
  id: `log-${index}`,
  actorId: 'user-1',
  actorEmail: 'user@example.com',
  action,
  targetType: 'ExternalAppConnection',
  targetId: `connection-${index}`,
  ipAddress: '192.0.2.1',
  createdAt: '2026-11-23T00:00:00.000Z',
}));

describe('外部アプリの接続の監査の種別（要件51.7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * @requirement user-authentication/REQ-51.7
   */
  it('設計の 6 種別と表示名を過不足なく持つ', () => {
    expect([...EXTERNAL_APP_AUDIT_ACTIONS].sort()).toEqual([...actions].sort());
    expect(EXTERNAL_APP_AUDIT_ACTION_LABELS).toEqual(expectedLabels);
  });

  /**
   * @requirement user-authentication/REQ-51.7
   */
  it.each(actions)('監査ログの画面の一覧と絞り込みに %s の表示名が出る', async (action) => {
    vi.mocked(apiClient.get).mockResolvedValue(logs);

    render(<AuditLogs />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText(expectedLabels[action])).toBeInTheDocument();
    const option = screen.getByRole('option', { name: expectedLabels[action] });
    expect(option).toHaveValue(action);
  });

  /**
   * @requirement user-authentication/REQ-51.7
   */
  it.each(actions)('監査ログの閲覧の部品に %s の表示名が出る', (action) => {
    render(<AuditLogViewer logs={logs} loading={false} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText(expectedLabels[action])).toBeInTheDocument();
  });
});
