/**
 * @fileoverview 猶予の適用の監査への写像の単体検証（user-authentication タスク 73.2、design 7178）
 *
 * @requirement user-authentication/REQ-48.11
 * @requirement user-authentication/REQ-51.7
 */

import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { ExternalAppConnectionService } from '../../../services/external-app-connection.service.js';

function build(row: Record<string, unknown> | null) {
  const findUnique = vi.fn(async () => row);
  const createLog = vi.fn(async () => undefined);
  const service = new ExternalAppConnectionService({
    prisma: { externalAppConnection: { findUnique } } as unknown as PrismaClient,
    auditLogService: { createLog } as never,
    clientRegistry: { loadAllowedClients: () => [] },
  });
  return { service, findUnique, createLog };
}

describe('recordRefreshGrace', () => {
  it('接続の値で REFRESH_GRACE_APPLIED を記録する', async () => {
    const { service, findUnique, createLog } = build({
      userId: 'user-1',
      clientId: 'client-1',
      scopes: ['read', 'write'],
    });

    await service.recordRefreshGrace({
      grantId: 'grant-1',
      ipAddress: '192.0.2.1',
      userAgent: 'agent',
    });

    expect(findUnique).toHaveBeenCalledWith({ where: { grantId: 'grant-1' } });
    expect(createLog).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REFRESH_GRACE_APPLIED',
        actorId: 'user-1',
        targetId: 'user-1',
        metadata: expect.objectContaining({
          clientId: 'client-1',
          scopes: ['read', 'write'],
          reason: null,
          ipAddress: '192.0.2.1',
          userAgent: 'agent',
        }),
      }),
      undefined
    );
  });

  it('接続が無ければ記録しない', async () => {
    const { service, createLog } = build(null);
    await service.recordRefreshGrace({ grantId: 'gone', ipAddress: null, userAgent: null });
    expect(createLog).not.toHaveBeenCalled();
  });
});
