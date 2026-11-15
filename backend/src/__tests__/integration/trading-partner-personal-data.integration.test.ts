/**
 * 取引先の監査ログの個人情報と、論理削除した取引先の個人情報の消去の統合検証（trading-partner-management タスク34）
 *
 * 実データベースと本物の AuditLogService を通す。
 *
 * Requirements (trading-partner-management):
 * - 7.7: 作成・更新・削除の監査ログに、代表者名・住所・電話番号・FAX番号・メールアドレス・備考の値を記録しない
 * - 5.6: 論理削除から 90 日を過ぎた取引先の個人情報の欄を空にする（行・取引先名・参照する見積依頼は残す）
 * - 5.7: 空にしたことを ID と日時だけで監査ログに記録する
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

validateEnv();

import getPrismaClient from '../../db.js';
import { AuditLogService } from '../../services/audit-log.service.js';
import { TradingPartnerService } from '../../services/trading-partner.service.js';
import { TradingPartnerPersonalDataEraseService } from '../../services/trading-partner-personal-data-erase.service.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-tp342-personal-data';
const DAY_MS = 24 * 60 * 60 * 1000;

/** 取引先の個人情報の値（監査ログに現れてはならない） */
const PERSONAL = {
  representativeName: `${MARK} 代表 花子`,
  address: `${MARK} 東京都港区1-2-3`,
  phoneNumber: '03-9999-0001',
  faxNumber: '03-9999-0002',
  email: `${MARK}-contact@example.com`,
  notes: `${MARK} 担当者の携帯 090-0000-0000`,
};

describe('取引先の個人情報（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let auditLogService: AuditLogService;
  let actorId: string;
  let projectId: string;
  const partnerIds: string[] = [];

  async function createSoftDeletedPartner(suffix: string, deletedDaysAgo: number): Promise<string> {
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${MARK}-${suffix}`,
        nameKana: 'テストトリヒキサキ',
        branchName: '本店',
        ...PERSONAL,
        billingClosingDay: 20,
        paymentMonthOffset: 1,
        paymentDay: 10,
        deletedAt: new Date(Date.now() - deletedDaysAgo * DAY_MS),
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    partnerIds.push(partner.id);
    return partner.id;
  }

  async function auditLogsOf(targetId: string) {
    return prisma.auditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    auditLogService = new AuditLogService({ prisma });
    const user = await createTestUser(prisma, {
      email: `${MARK}-actor@example.com`,
      displayName: MARK,
      passwordHash: 'not-used',
    });
    actorId = user.id;
    const project = await prisma.project.create({
      data: { name: `${MARK}-project`, salesPersonId: actorId, createdById: actorId },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [{ targetId: { in: partnerIds } }, { actorId }],
    });
    await prisma.estimateRequest.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.tradingPartnerTypeMapping.deleteMany({
      where: { tradingPartnerId: { in: partnerIds } },
    });
    await prisma.tradingPartner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  });

  /**
   * @requirement trading-partner-management/REQ-7.7
   */
  it('作成・更新・削除の監査ログに個人情報の欄の値が無く、更新では変わった欄の名前が残る', async () => {
    const service = new TradingPartnerService({ prisma, auditLogService });
    const created = await service.createPartner(
      {
        name: `${MARK}-crud`,
        nameKana: 'テストトリヒキサキ',
        types: ['SUBCONTRACTOR'],
        ...PERSONAL,
      },
      actorId
    );
    partnerIds.push(created.id);
    const updated = await service.updatePartner(
      created.id,
      { address: `${MARK} 大阪府大阪市北区4-5-6`, email: `${MARK}-changed@example.com` },
      actorId,
      new Date(created.updatedAt)
    );
    expect(updated.address).toBe(`${MARK} 大阪府大阪市北区4-5-6`);
    await service.deletePartner(created.id, actorId);

    const logs = await auditLogsOf(created.id);
    expect(logs.map((log) => log.action)).toEqual([
      'TRADING_PARTNER_CREATED',
      'TRADING_PARTNER_UPDATED',
      'TRADING_PARTNER_DELETED',
    ]);
    const serialized = JSON.stringify(logs);
    for (const value of [
      ...Object.values(PERSONAL),
      `${MARK} 大阪府大阪市北区4-5-6`,
      `${MARK}-changed@example.com`,
    ]) {
      expect(serialized).not.toContain(value);
    }
    expect(logs[0]?.after).toMatchObject({ name: `${MARK}-crud`, types: ['SUBCONTRACTOR'] });
    expect(logs[1]?.metadata).toEqual({ changedPersonalFields: ['address', 'email'] });
    expect(logs[2]?.before).toMatchObject({ name: `${MARK}-crud` });
  });

  /**
   * @requirement trading-partner-management/REQ-5.6
   * @requirement trading-partner-management/REQ-5.7
   */
  it('論理削除から 90 日を過ぎた取引先だけ個人情報が空になり、行・名前・参照する見積依頼が残り、ID と日時だけが記録される', async () => {
    const expiredId = await createSoftDeletedPartner('expired', 91);
    const recentId = await createSoftDeletedPartner('recent', 89);
    const active = await prisma.tradingPartner.create({
      data: {
        name: `${MARK}-active`,
        nameKana: 'テストトリヒキサキ',
        ...PERSONAL,
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    partnerIds.push(active.id);
    const estimateRequest = await prisma.estimateRequest.create({
      data: { projectId, tradingPartnerId: expiredId, name: `${MARK}-request` },
    });

    const now = new Date();
    const service = new TradingPartnerPersonalDataEraseService({ prisma, auditLogService });
    const result = await service.eraseExpired(now);
    expect(result.erasedCount).toBeGreaterThanOrEqual(1);
    expect(result.failedCount).toBe(0);

    const expired = await prisma.tradingPartner.findUniqueOrThrow({
      where: { id: expiredId },
      include: { types: true },
    });
    expect(expired).toMatchObject({
      name: `${MARK}-expired`,
      nameKana: 'テストトリヒキサキ',
      branchName: '本店',
      representativeName: null,
      address: '',
      phoneNumber: null,
      faxNumber: null,
      email: null,
      notes: null,
      billingClosingDay: 20,
      paymentMonthOffset: 1,
      paymentDay: 10,
    });
    expect(expired.deletedAt).not.toBeNull();
    expect(expired.types.map((t) => t.type)).toEqual(['SUBCONTRACTOR']);
    await expect(
      prisma.estimateRequest.findUnique({ where: { id: estimateRequest.id } })
    ).resolves.toMatchObject({ tradingPartnerId: expiredId });

    for (const keptId of [recentId, active.id]) {
      await expect(
        prisma.tradingPartner.findUniqueOrThrow({ where: { id: keptId } })
      ).resolves.toMatchObject(PERSONAL);
    }

    const logs = await auditLogsOf(expiredId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'TRADING_PARTNER_PERSONAL_DATA_ERASED',
      actorId: null,
      targetType: 'TradingPartner',
      metadata: { deletedAt: expired.deletedAt?.toISOString(), erasedAt: now.toISOString() },
    });
    const serialized = JSON.stringify(logs);
    for (const value of Object.values(PERSONAL)) {
      expect(serialized).not.toContain(value);
    }
    expect(await auditLogsOf(recentId)).toHaveLength(0);
    expect(await auditLogsOf(active.id)).toHaveLength(0);

    // 2 回目は空にした取引先を選ばない（更新も記録もしない）
    const updatedAtAfterFirst = expired.updatedAt;
    await service.eraseExpired(new Date());
    const again = await prisma.tradingPartner.findUniqueOrThrow({ where: { id: expiredId } });
    expect(again.updatedAt).toEqual(updatedAtAfterFirst);
    expect(await auditLogsOf(expiredId)).toHaveLength(1);
  });
});
