/**
 * @fileoverview 不整合な見積依頼を確かめる運用の手順の統合検証（estimate-request タスク121.2）
 *
 * 本物のスクリプトの部品（backend/src/scripts/find-cross-project-estimate-requests.ts）を、
 * テスト用の実データベースに対して実行する。
 *
 * 不整合な見積依頼は API が作らせない（42.10・51.1）ため、Prisma で直接作る。
 * - A: 案件 P1 の見積依頼が案件 P2 の内訳書を指す（項目は P1 の内訳書のもの）。見積依頼と内訳書は論理削除済み → (a) だけ
 * - B: 案件 P1 の見積依頼が P1 の内訳書を指し、項目の一つが P2 の内訳書の項目 → (b) だけ
 * - C: 案件 P2 の見積依頼が P1 の内訳書を指し、項目も P1 の内訳書のもの → (a) と (b) の両方
 * - D: 案件 P1 の見積依頼が P1 の内訳書と項目を指す（整合）
 * - E: 案件 P1 の見積依頼が内訳書を持たない（整合）
 *
 * 試験 DB には他の検証の行が残りうるため、作る前の結果との差分が A・B・C だけであることを主張する。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client.js';
import getPrismaClient from '../../db.js';
import { createTestUser } from './test-user-factory.js';
import {
  EXIT_CODE,
  findCrossProjectEstimateRequests,
  main,
  type CrossProjectFinding,
  type FindCrossProjectContext,
} from '../../scripts/find-cross-project-estimate-requests.js';

const MARK = 'test-er121-cross';

describe('不整合な見積依頼を確かめる運用の手順（統合・実 DB）', () => {
  let prisma: PrismaClient;
  let userId: string;
  let tradingPartnerId: string;
  let p1: string;
  let p2: string;
  let s1: string;
  let s2: string;
  let s1Items: string[];
  let s2Items: string[];
  let requestA: string;
  let requestB: string;
  let requestC: string;
  let requestD: string;
  let requestE: string;
  let baseline: CrossProjectFinding[];

  async function cleanup(): Promise<void> {
    const projects = await prisma.project.findMany({
      where: { name: { contains: MARK } },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    // 見積依頼の項目は内訳書の項目を Restrict で指し、別の案件をまたぐため、案件より先に見積依頼を消す
    await prisma.estimateRequest.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.itemizedStatement.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectStatusHistory.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.tradingPartner.deleteMany({ where: { name: { contains: MARK } } });
    await prisma.user.deleteMany({ where: { email: { contains: MARK } } });
  }

  async function createStatement(projectId: string, label: string): Promise<[string, string[]]> {
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId,
        name: `${MARK}-${label}-statement`,
        sourceQuantityTableId: `${MARK}-${label}-qt`,
        sourceQuantityTableName: `${MARK}-${label} の数量表`,
        items: {
          create: [
            {
              workType: '工種1',
              name: `${MARK}-名称1`,
              unit: '式',
              quantity: 123.45,
              displayOrder: 1,
            },
            {
              workType: '工種2',
              name: `${MARK}-名称2`,
              unit: 'm',
              quantity: 678.9,
              displayOrder: 2,
            },
          ],
        },
      },
      select: { id: true, items: { select: { id: true }, orderBy: { displayOrder: 'asc' } } },
    });
    return [statement.id, statement.items.map((i) => i.id)];
  }

  async function createRequest(
    projectId: string,
    itemizedStatementId: string | null,
    itemIds: string[],
    label: string,
    deletedAt: Date | null = null
  ): Promise<string> {
    const created = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        itemizedStatementId,
        name: `${MARK}-${label}-request`,
        deletedAt,
        selectedItems: {
          create: itemIds.map((id) => ({ itemizedStatementItemId: id, selected: true })),
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  /** 関わる表の行の写し（並びを固定する） */
  async function snapshot(): Promise<unknown> {
    const projectIds = [p1, p2];
    const requestIds = [requestA, requestB, requestC, requestD, requestE];
    return {
      counts: {
        estimateRequests: await prisma.estimateRequest.count(),
        estimateRequestItems: await prisma.estimateRequestItem.count(),
        itemizedStatements: await prisma.itemizedStatement.count(),
        itemizedStatementItems: await prisma.itemizedStatementItem.count(),
        projects: await prisma.project.count(),
      },
      projects: await prisma.project.findMany({
        where: { id: { in: projectIds } },
        orderBy: { id: 'asc' },
      }),
      estimateRequests: await prisma.estimateRequest.findMany({
        where: { id: { in: requestIds } },
        orderBy: { id: 'asc' },
      }),
      estimateRequestItems: await prisma.estimateRequestItem.findMany({
        where: { estimateRequestId: { in: requestIds } },
        orderBy: { id: 'asc' },
      }),
      itemizedStatements: await prisma.itemizedStatement.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { id: 'asc' },
      }),
      itemizedStatementItems: await prisma.itemizedStatementItem.findMany({
        where: { itemizedStatement: { projectId: { in: projectIds } } },
        orderBy: { id: 'asc' },
      }),
    };
  }

  function key(f: CrossProjectFinding): string {
    return `${f.estimateRequestId}|${f.projectId}|${f.referencedProjectId}|${f.kind}`;
  }

  /** 作る前の結果に無い行（このファイルが作った不整合） */
  function added(findings: CrossProjectFinding[]): CrossProjectFinding[] {
    const before = new Set(baseline.map(key));
    return findings.filter((f) => !before.has(key(f)));
  }

  function expectedFindings(): CrossProjectFinding[] {
    return [
      { estimateRequestId: requestA, projectId: p1, referencedProjectId: p2, kind: 'a' },
      { estimateRequestId: requestB, projectId: p1, referencedProjectId: p2, kind: 'b' },
      { estimateRequestId: requestC, projectId: p2, referencedProjectId: p1, kind: 'a' },
      { estimateRequestId: requestC, projectId: p2, referencedProjectId: p1, kind: 'b' },
    ].sort((x, y) =>
      key(x as CrossProjectFinding).localeCompare(key(y as CrossProjectFinding))
    ) as CrossProjectFinding[];
  }

  beforeAll(async () => {
    prisma = getPrismaClient();
    await cleanup();

    // 作る前の結果（試験 DB に残る他の行）
    baseline = await findCrossProjectEstimateRequests(prisma);

    const user = await createTestUser(prisma, {
      email: `${MARK}-user@example.com`,
      displayName: `${MARK}-user`,
      passwordHash: 'not-used',
    });
    userId = user.id;
    const partner = await prisma.tradingPartner.create({
      data: {
        name: `${MARK}-partner`,
        nameKana: 'テストキョウリョクギョウシャ',
        address: `${MARK}-東京都千代田区1-1-1`,
        email: 'er121-partner@example.com',
        types: { create: [{ type: 'SUBCONTRACTOR' }] },
      },
      select: { id: true },
    });
    tradingPartnerId = partner.id;

    p1 = (
      await prisma.project.create({
        data: { name: `${MARK}-p1`, salesPersonId: userId, createdById: userId },
        select: { id: true },
      })
    ).id;
    p2 = (
      await prisma.project.create({
        data: { name: `${MARK}-p2`, salesPersonId: userId, createdById: userId },
        select: { id: true },
      })
    ).id;
    [s1, s1Items] = await createStatement(p1, 's1');
    [s2, s2Items] = await createStatement(p2, 's2');

    const deletedAt = new Date('2026-10-01T00:00:00Z');
    requestA = await createRequest(p1, s2, s1Items, 'a', deletedAt);
    await prisma.itemizedStatement.update({ where: { id: s2 }, data: { deletedAt } });
    requestB = await createRequest(p1, s1, [s1Items[0]!, s2Items[0]!], 'b');
    requestC = await createRequest(p2, s1, s1Items, 'c');
    requestD = await createRequest(p1, s1, s1Items, 'd');
    requestE = await createRequest(p1, null, [], 'e');
  });

  afterAll(async () => {
    await cleanup();
  });

  /**
   * @requirement estimate-request/REQ-51.3
   */
  it('論理削除の有無を問わず、内訳書の食い違い (a) と内訳書の項目の食い違い (b) の見積依頼だけを見つける', async () => {
    const findings = await findCrossProjectEstimateRequests(prisma);

    expect(added(findings)).toEqual(expectedFindings());
    const foundIds = new Set(findings.map((f) => f.estimateRequestId));
    expect(foundIds.has(requestD)).toBe(false);
    expect(foundIds.has(requestE)).toBe(false);
  });

  /**
   * @requirement estimate-request/REQ-51.3
   */
  it('実行すると終了コード 0 で、件数（見積依頼の数）と ID・両方のプロジェクト ID・(a)(b) の別を出し、名前・宛先・金額を出さず、行を変えない', async () => {
    const before = await snapshot();
    const out: string[] = [];
    const err: string[] = [];
    let closed = false;
    const ctx: FindCrossProjectContext = {
      prisma,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      close: async () => {
        // 共有のクライアントは閉じない（他の検証が使う）
        closed = true;
      },
    };

    const code = await main(async () => ctx);

    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(closed).toBe(true);
    expect(err).toEqual([]);

    const findings = await findCrossProjectEstimateRequests(prisma);
    const distinctRequests = new Set(findings.map((f) => f.estimateRequestId)).size;
    const baselineRequests = new Set(baseline.map((f) => f.estimateRequestId)).size;
    // 件数は見積依頼の数（C は (a)(b) の両方に出るが 1 件と数える）
    expect(distinctRequests).toBe(baselineRequests + 3);
    expect(out[0]).toBe(
      `別のプロジェクトの内訳書を参照する見積依頼: ${distinctRequests} 件（行は ${findings.length} 行）`
    );

    for (const f of expectedFindings()) {
      expect(out).toContain(
        `見積依頼 ${f.estimateRequestId} 見積依頼のプロジェクト ${f.projectId} 参照先のプロジェクト ${f.referencedProjectId} 種別 (${f.kind})`
      );
    }
    const text = out.join('\n');
    expect(text).not.toContain(requestD);
    expect(text).not.toContain(requestE);
    // 名前（見積依頼・案件・内訳書・項目・取引先）・宛先・金額（数量）を出さない
    expect(text).not.toContain(MARK);
    expect(text).not.toContain('er121-partner@example.com');
    expect(text).not.toContain('123.45');
    expect(text).not.toContain('678.9');

    expect(await snapshot()).toEqual(before);
  });

  /**
   * @requirement estimate-request/REQ-51.3
   */
  it('データベースの失敗は終了コード 1 で、エラーの種類だけを出し文言を出さない', async () => {
    const out: string[] = [];
    const err: string[] = [];
    let closed = false;
    const failing = {
      $queryRaw: () => Promise.reject(new Error(`${MARK}-secret-message`)),
    } as unknown as FindCrossProjectContext['prisma'];

    const code = await main(async () => ({
      prisma: failing,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      close: async () => {
        closed = true;
      },
    }));

    expect(code).toBe(EXIT_CODE.FAILURE);
    expect(closed).toBe(true);
    expect(out).toEqual([]);
    expect(err).toEqual(['不整合な見積依頼を確かめられませんでした（実行の失敗）: Error']);
  });
});
