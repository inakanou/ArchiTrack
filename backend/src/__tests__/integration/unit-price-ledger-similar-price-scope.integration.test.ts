/**
 * @fileoverview 似た単価の候補の閲覧範囲による表示制御（SimilarPriceService）の統合試験（unit-price-ledger タスク2.9）
 *
 * テスト用の実データベースで、問い合わせた利用者の閲覧範囲（user-authentication 要件39）に応じて
 * 候補の案件の情報を出し分けることを確かめる。
 *
 * 確かめること:
 * - 9.1：閲覧範囲の内の案件の候補は、案件名・案件の ID・受領見積書の ID を返す
 * - 9.2：閲覧範囲の外の案件の候補は、案件名を「他案件」とし、案件の ID・受領見積書の ID・見積依頼・
 *   原本のファイル・明細行の参考の理由の文を返さない（応答のどこにも、それらの値が現れない）
 * - 9.3：案件の無い受領見積書の候補は、利用者を問わず台帳の案件名と原本のパスを返す
 * - 9.4：閲覧範囲の外の候補にも、業者名・見積日・明細行の内容（参考の印を含み、参考の理由の文を除く）・
 *   按分の内訳を返す
 *
 * 3 つの候補の行は、どれも参考の印と、案件を特定できる文を含む参考の理由を持つ（タスク6.2）。
 *
 * 利用者：案件 A の担当者（営業担当者）、どの案件にも関係しない利用者、全案件閲覧（project:read_all）の利用者。
 * 案件 B は別の利用者が作った案件で、受領見積書は見積依頼から作られたもの（案件は見積依頼の案件を写す）。
 *
 * 共有の試験 DB には他の試験の明細行も残りうるため、試験の行には試験ごとの単位を付け、単位で絞る。
 *
 * Design: Components > SimilarPriceService（表示制御）、Security Considerations、Testing Strategy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import {
  OTHER_PROJECT_NAME,
  SimilarPriceService,
  type SimilarPriceCandidate,
} from '../../services/unit-price-ledger/similar-price.service.js';
import { ProjectScopeService } from '../../services/project-scope.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { similarPriceQuerySchema } from '../../schemas/unit-price-ledger.schema.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { createTestUser } from './test-user-factory.js';

const MARK = 'test-upl29-scope';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `${MARK}-${RUN}`;
const UNIT = `m2-${RUN}`;
const ROLE_NAME = `${PREFIX}-read-all`;

describe('似た単価の候補の閲覧範囲による表示制御（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let service: SimilarPriceService;

  const users: Record<'member' | 'owner' | 'outsider' | 'readAll', string> = {
    member: '',
    owner: '',
    outsider: '',
    readAll: '',
  };
  let tradingPartnerId: string;
  let projectAId: string;
  let projectBId: string;
  let estimateRequestId: string;
  const projectAName = `${PREFIX}-担当の案件`;
  const projectBName = `${PREFIX}-担当外の案件`;
  const estimateRequestName = `${PREFIX}-見積依頼`;
  const ledgerProjectName = `${PREFIX}-台帳の案件`;
  const ledgerSourcePath = `${PREFIX}/02_見積/見積書.pdf`;
  /** 参考の理由の文（自由な文。案件の名前を含みうる） */
  const referenceReasons = {
    a: `${projectAName}の図面と照合が要る`,
    b: `${projectBName}の現場で数量を確かめる`,
    projectless: `${ledgerProjectName}の概算`,
  };

  const quotationIds: Record<'a' | 'b' | 'projectless', string> = {
    a: '',
    b: '',
    projectless: '',
  };
  const lineIds: Record<'a' | 'b' | 'projectless', string> = { a: '', b: '', projectless: '' };

  const search = (userId: string): Promise<SimilarPriceCandidate[]> =>
    service.search(similarPriceQuerySchema.parse({ name: '天井下地', unit: UNIT }), userId);

  const candidateOf = (
    candidates: SimilarPriceCandidate[],
    key: keyof typeof lineIds
  ): SimilarPriceCandidate => {
    const found = candidates.find((c) => c.lineItemId === lineIds[key]);
    if (!found) throw new Error(`候補 ${key} がありません`);
    return found;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    const rbac = getSharedRBACService();
    service = new SimilarPriceService({
      prisma,
      projectScopeService: new ProjectScopeService(prisma, rbac),
    });

    for (const key of Object.keys(users) as Array<keyof typeof users>) {
      const user = await createTestUser(prisma, {
        email: `${PREFIX}-${key}@example.com`,
        displayName: `${PREFIX}-${key}`,
        passwordHash: 'not-used',
      });
      users[key] = user.id;
    }

    await seedRoles(prisma);
    await seedPermissions(prisma);
    await seedRolePermissions(prisma);
    const role = await prisma.role.create({
      data: { name: ROLE_NAME, description: 'unit-price-ledger タスク2.9 の検証用' },
    });
    const readAll = await prisma.permission.findFirst({
      where: { resource: 'project', action: 'read_all' },
    });
    expect(readAll, '前提の欠落: 全案件閲覧の権限').not.toBeNull();
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: readAll!.id },
    });
    await prisma.userRole.create({ data: { userId: users.readAll, roleId: role.id } });
    for (const id of Object.values(users)) {
      await rbac.invalidateUserPermissionsCache(id);
    }

    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${PREFIX}-partner`,
        nameKana: 'ニタタンカハンイテスト',
        address: '東京都千代田区1-1-1',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
    });
    tradingPartnerId = partner.id;

    const projectA = await prisma.project.create({
      data: { name: projectAName, salesPersonId: users.member, createdById: users.owner },
      select: { id: true },
    });
    projectAId = projectA.id;
    const projectB = await prisma.project.create({
      data: { name: projectBName, salesPersonId: users.owner, createdById: users.owner },
      select: { id: true },
    });
    projectBId = projectB.id;
    const request = await prisma.estimateRequest.create({
      data: { projectId: projectBId, tradingPartnerId, name: estimateRequestName },
      select: { id: true },
    });
    estimateRequestId = request.id;

    // 案件 A（担当者の案件）の受領見積書（見積依頼なし）
    const a = await prisma.receivedQuotation.create({
      data: {
        projectId: projectAId,
        vendorName: `${PREFIX}-業者A`,
        name: `${PREFIX}-業者A_見積`,
        submittedAt: new Date('2026-05-01'),
        lineItems: {
          create: [
            {
              name: '天井下地',
              unit: UNIT,
              quantity: 1,
              unitPrice: 100,
              amount: 100,
              category: 'DIRECT',
              sortOrder: 0,
              isReference: true,
              referenceReason: referenceReasons.a,
            },
          ],
        },
      },
      select: { id: true, lineItems: { select: { id: true } } },
    });
    quotationIds.a = a.id;
    lineIds.a = a.lineItems[0]!.id;

    // 案件 B（担当外の案件）の、見積依頼から作られた受領見積書。按分の基準＝直接工事 1000、
    // 諸経費の率＝100÷1000＝0.1、値引きの率＝-50÷1000＝-0.05
    const b = await prisma.receivedQuotation.create({
      data: {
        estimateRequestId,
        projectId: projectBId,
        vendorName: `${PREFIX}-業者B`,
        name: `${PREFIX}-業者B_見積`,
        submittedAt: new Date('2026-04-01'),
        adoption: 'ADOPTED',
        lineItems: {
          create: [
            {
              name: '天井下地',
              specification: '@300',
              unit: UNIT,
              quantity: 10,
              unitPrice: 100,
              amount: 1000,
              category: 'DIRECT',
              sortOrder: 0,
              isReference: true,
              referenceReason: referenceReasons.b,
            },
            { name: '諸経費', amount: 100, category: 'OVERHEAD', sortOrder: 1 },
            { name: '値引き', amount: -50, category: 'DISCOUNT', sortOrder: 2 },
          ],
        },
      },
      select: { id: true, lineItems: { select: { id: true, sortOrder: true } } },
    });
    quotationIds.b = b.id;
    lineIds.b = b.lineItems.find((li) => li.sortOrder === 0)!.id;

    // 案件の無い受領見積書
    const projectless = await prisma.receivedQuotation.create({
      data: {
        vendorName: `${PREFIX}-業者C`,
        name: `${PREFIX}-業者C_見積`,
        submittedAt: new Date('2026-03-01'),
        ledgerCardId: `${PREFIX}-card`,
        ledgerProjectName,
        ledgerSourcePath,
        lineItems: {
          create: [
            {
              name: '天井下地',
              unit: UNIT,
              quantity: 2,
              unitPrice: 300,
              amount: 600,
              category: 'DIRECT',
              sortOrder: 0,
              isReference: true,
              referenceReason: referenceReasons.projectless,
            },
          ],
        },
      },
      select: { id: true, lineItems: { select: { id: true } } },
    });
    quotationIds.projectless = projectless.id;
    lineIds.projectless = projectless.lineItems[0]!.id;
  });

  afterAll(async () => {
    const rbac = getSharedRBACService();
    for (const id of Object.values(users)) {
      if (id) await rbac.invalidateUserPermissionsCache(id);
    }
    await prisma.receivedQuotation.deleteMany({ where: { vendorName: { startsWith: PREFIX } } });
    await prisma.estimateRequest.deleteMany({ where: { projectId: { in: [projectBId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.userRole.deleteMany({ where: { userId: { in: Object.values(users) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } });
    await prisma.rolePermission.deleteMany({ where: { role: { name: ROLE_NAME } } });
    await prisma.role.deleteMany({ where: { name: ROLE_NAME } });
  });

  /** 範囲外の候補の、応答のどこにも現れてはならない値 */
  const identifyingValuesOfB = (): string[] => [
    referenceReasons.b,
    projectBName,
    projectBId,
    quotationIds.b,
    estimateRequestId,
    estimateRequestName,
  ];

  /** 範囲外の案件 B の候補が、案件を特定できる情報を持たず、他の内容を持つことを確かめる */
  const expectMaskedB = (candidate: SimilarPriceCandidate): void => {
    expect(candidate).toMatchObject({
      projectName: OTHER_PROJECT_NAME,
      projectId: null,
      receivedQuotationId: null,
      ledgerSourcePath: null,
      // 9.2：参考の理由の文は返さない。9.4：参考の印は返す
      isReference: true,
      referenceReason: null,
    });
    const serialized = JSON.stringify(candidate);
    for (const value of identifyingValuesOfB()) {
      expect(serialized).not.toContain(value);
    }
    // 9.4：業者名・見積日・明細行の内容・按分の内訳（丸める前の値を含む。8.9）は返す
    expect(candidate).toMatchObject({
      vendorName: `${PREFIX}-業者B`,
      submittedAt: '2026-04-01',
      name: '天井下地',
      specification: '@300',
      unit: UNIT,
      quantity: '10',
      category: 'DIRECT',
      adoption: 'ADOPTED',
      allocation: {
        allocationStatus: 'ALLOCATED',
        unitPrice: '100',
        overheadAllocation: '10',
        discountAllocation: '-5',
        appliedUnitPrice: '105',
        allocatable: true,
        applicable: true,
        unrounded: {
          unitPrice: '100',
          overheadAllocation: '10',
          discountAllocation: '-5',
          appliedUnitPrice: '105',
        },
      },
    });
  };

  /** 案件の無い受領見積書の候補は、利用者を問わず台帳の案件名と原本のパスを返す（9.3） */
  const expectProjectless = (candidate: SimilarPriceCandidate): void => {
    expect(candidate).toMatchObject({
      projectName: ledgerProjectName,
      projectId: null,
      receivedQuotationId: quotationIds.projectless,
      ledgerSourcePath,
      vendorName: `${PREFIX}-業者C`,
      isReference: true,
      referenceReason: referenceReasons.projectless,
    });
  };

  it('前提：試験の 3 つの候補が、どの利用者にも返る', async () => {
    for (const userId of [users.member, users.outsider, users.readAll]) {
      const candidates = await search(userId);
      expect(candidates.map((c) => c.lineItemId).sort()).toEqual(
        [lineIds.a, lineIds.b, lineIds.projectless].sort()
      );
    }
  });

  describe('案件 A の担当者', () => {
    /**
     * @requirement unit-price-ledger/REQ-9.1
     */
    it('範囲内の案件の候補に、案件名・案件の ID・受領見積書の ID を返す', async () => {
      const candidates = await search(users.member);
      expect(candidateOf(candidates, 'a')).toMatchObject({
        projectName: projectAName,
        projectId: projectAId,
        receivedQuotationId: quotationIds.a,
        ledgerSourcePath: null,
        vendorName: `${PREFIX}-業者A`,
        isReference: true,
        referenceReason: referenceReasons.a,
      });
    });

    /**
     * @requirement unit-price-ledger/REQ-9.2
     * @requirement unit-price-ledger/REQ-9.4
     */
    it('範囲外の案件の候補は「他案件」とし、案件を特定できる情報を返さず、他の内容は返す', async () => {
      const candidates = await search(users.member);
      expectMaskedB(candidateOf(candidates, 'b'));
      const serialized = JSON.stringify(candidates);
      for (const value of identifyingValuesOfB()) {
        expect(serialized).not.toContain(value);
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-9.3
     */
    it('案件の無い受領見積書の候補に、台帳の案件名と原本のパスを返す', async () => {
      expectProjectless(candidateOf(await search(users.member), 'projectless'));
    });
  });

  describe('どの案件にも関係しない利用者', () => {
    /**
     * @requirement unit-price-ledger/REQ-9.2
     * @requirement unit-price-ledger/REQ-9.4
     */
    it('案件 A・B の候補をどちらも「他案件」とし、案件を特定できる情報を返さない', async () => {
      const candidates = await search(users.outsider);
      expectMaskedB(candidateOf(candidates, 'b'));
      expect(candidateOf(candidates, 'a')).toMatchObject({
        projectName: OTHER_PROJECT_NAME,
        projectId: null,
        receivedQuotationId: null,
        ledgerSourcePath: null,
        vendorName: `${PREFIX}-業者A`,
        isReference: true,
        referenceReason: null,
        allocation: { unitPrice: '100', appliedUnitPrice: '100' },
      });
      const serialized = JSON.stringify(candidates);
      for (const value of [
        ...identifyingValuesOfB(),
        referenceReasons.a,
        projectAName,
        projectAId,
        quotationIds.a,
      ]) {
        expect(serialized).not.toContain(value);
      }
    });

    /**
     * @requirement unit-price-ledger/REQ-9.3
     */
    it('案件の無い受領見積書の候補には、台帳の案件名と原本のパスを返す', async () => {
      expectProjectless(candidateOf(await search(users.outsider), 'projectless'));
    });
  });

  describe('全案件閲覧の利用者', () => {
    /**
     * @requirement unit-price-ledger/REQ-9.1
     * @requirement unit-price-ledger/REQ-9.3
     */
    it('担当でない案件の候補にも案件名と ID を返す', async () => {
      const candidates = await search(users.readAll);
      expect(candidateOf(candidates, 'a')).toMatchObject({
        projectName: projectAName,
        projectId: projectAId,
        receivedQuotationId: quotationIds.a,
        ledgerSourcePath: null,
      });
      expect(candidateOf(candidates, 'b')).toMatchObject({
        projectName: projectBName,
        projectId: projectBId,
        receivedQuotationId: quotationIds.b,
        ledgerSourcePath: null,
        isReference: true,
        referenceReason: referenceReasons.b,
        allocation: { appliedUnitPrice: '105' },
      });
      expectProjectless(candidateOf(candidates, 'projectless'));
    });
  });

  describe('担当の変更の反映', () => {
    /**
     * @requirement unit-price-ledger/REQ-9.1
     * @requirement unit-price-ledger/REQ-9.2
     */
    it('案件 B の工事担当者になった利用者には、次の問い合わせから案件 B の名前を返す', async () => {
      await prisma.project.update({
        where: { id: projectBId },
        data: { constructionPersonId: users.outsider },
      });
      try {
        const candidates = await search(users.outsider);
        expect(candidateOf(candidates, 'b')).toMatchObject({
          projectName: projectBName,
          projectId: projectBId,
          receivedQuotationId: quotationIds.b,
          referenceReason: referenceReasons.b,
        });
        expect(candidateOf(candidates, 'a')).toMatchObject({
          projectName: OTHER_PROJECT_NAME,
          isReference: true,
          referenceReason: null,
        });
      } finally {
        await prisma.project.update({
          where: { id: projectBId },
          data: { constructionPersonId: null },
        });
      }
    });
  });
});
