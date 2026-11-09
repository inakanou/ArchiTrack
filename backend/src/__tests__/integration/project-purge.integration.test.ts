/**
 * @fileoverview 論理削除したプロジェクトの完全削除の統合テスト
 *
 * タスク81.3: 実際の DB とローカルのストレージで、ProjectPurgeService の完全削除を確かめる。
 *
 * - Restrict を持つ全種類の関連データ（受領見積書の両方の文脈・実行予算の発注と出来高・内訳書を参照する見積依頼）と
 *   ファイルを持つプロジェクトを 91 日前に論理削除し、完全削除の後に行もファイルも残らず監査の記録が一件あること
 * - 89 日前に論理削除したもの・論理削除していないものが残ること、既にある監査ログが消えないこと
 * - ファイルの削除に失敗したら行が残り、次の実行で消えること
 *
 * 共有のテストの DB には他のテストの論理削除したプロジェクトがありうる。完全削除はそれらも古い順に選ぶため、
 * このテストの「現在」を過去（2001 年）に置き、このテストの対象だけが 90 日を過ぎる形にする。
 *
 * @requirement project-management/REQ-9.6 関連データを保持期間の後に共に削除する
 * @requirement project-management/REQ-46.1 論理削除の日時から 90 日間は保持する
 * @requirement project-management/REQ-46.6 完全削除を件数と日時で監査に記録する
 * @requirement project-management/REQ-46.7 失敗したプロジェクトは消さずに記録し、次の回でやり直す
 * @requirement project-management/REQ-46.8 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 * @requirement project-management/REQ-46.9 監査ログは消さない
 *
 * @module __tests__/integration/project-purge.integration.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import getPrismaClient from '../../db.js';
import { createTestUser } from './test-user-factory.js';
import { LocalStorageProvider } from '../../storage/local-storage.provider.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import { ProjectPurgeService } from '../../services/project-purge.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** このテストの「現在」（他のテストの論理削除したプロジェクトを対象にしないため過去に置く） */
const NOW = new Date('2001-01-01T00:00:00.000Z');
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

/** 1 回目だけ指定のキーの削除で例外を投げるストレージの包み */
function failOnceOnDelete(inner: StorageProvider, failingKey: string): StorageProvider {
  let failed = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'delete') {
        return async (key: string) => {
          if (key === failingKey && !failed) {
            failed = true;
            throw new Error('ストレージの削除に失敗した（テストの包み）');
          }
          return target.delete(key);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** プロジェクトの木で作った行の ID（表ごと） */
interface ProjectTree {
  projectId: string;
  ids: {
    siteSurvey: string[];
    surveyImage: string[];
    constructionPhotoAlbum: string[];
    constructionPhoto: string[];
    quantityTable: string[];
    itemizedStatement: string[];
    itemizedStatementItem: string[];
    estimateRequest: string[];
    estimateRequestItem: string[];
    receivedQuotation: string[];
    contract: string[];
    executionBudget: string[];
    executionBudgetItem: string[];
    order: string[];
    orderItem: string[];
    progressRecord: string[];
    progressRecordItem: string[];
  };
  fileKeys: string[];
}

describe('論理削除したプロジェクトの完全削除（タスク81.3）', () => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let prisma: PrismaClient;
  let storageRoot: string;
  let storage: LocalStorageProvider;
  let userId: string;
  let tradingPartnerId: string;
  /** このテストで作ったプロジェクト（後片付けに使う） */
  const createdProjectIds: string[] = [];

  /** 実体のあるファイルをストレージに置く */
  const putFile = async (key: string) => {
    await storage.upload(key, Buffer.from(`file ${key}`), { contentType: 'image/jpeg' });
    return key;
  };

  const createProject = async (label: string, deletedAt: Date | null) => {
    const project = await prisma.project.create({
      data: {
        name: `完全削除_${label}_${suffix}`,
        status: 'PREPARING',
        salesPersonId: userId,
        createdById: userId,
        deletedAt,
      },
    });
    createdProjectIds.push(project.id);
    return project.id;
  };

  /** ファイルを 1 件持つ受領見積書だけのプロジェクト */
  const createProjectWithFile = async (label: string, deletedAt: Date | null) => {
    const projectId = await createProject(label, deletedAt);
    const key = await putFile(`quotations/projects/${projectId}/${label}-${suffix}.pdf`);
    const quotation = await prisma.receivedQuotation.create({
      data: {
        projectId,
        vendorName: `業者_${suffix}`,
        name: `受領見積書_${label}_${suffix}`,
        submittedAt: new Date('2000-09-01T00:00:00.000Z'),
        filePath: key,
        fileName: `${label}.pdf`,
        fileMimeType: 'application/pdf',
        fileSize: 10,
      },
    });
    return { projectId, key, quotationId: quotation.id };
  };

  /** Restrict を持つ全種類の関連データとファイルを持つプロジェクトの木を作る */
  const createFullTree = async (label: string, deletedAt: Date): Promise<ProjectTree> => {
    const projectId = await createProject(label, deletedAt);
    const p = `${label}-${suffix}`;

    // 現場調査と画像（原本・サムネイル・注釈付きサムネイル）。現場調査は個別に論理削除したものも含める
    const survey = await prisma.siteSurvey.create({
      data: { projectId, name: `現調_${p}`, surveyDate: new Date('2000-08-01') },
    });
    const deletedSurvey = await prisma.siteSurvey.create({
      data: {
        projectId,
        name: `削除済みの現調_${p}`,
        surveyDate: new Date('2000-08-02'),
        deletedAt: daysBefore(100),
      },
    });
    const image = await prisma.surveyImage.create({
      data: {
        surveyId: survey.id,
        originalPath: await putFile(`site-surveys/${survey.id}/original-${p}.jpg`),
        thumbnailPath: await putFile(`site-surveys/${survey.id}/thumb-${p}.jpg`),
        annotatedThumbnailPath: await putFile(`site-surveys/${survey.id}/annotated-${p}.jpg`),
        fileName: 'a.jpg',
        fileSize: 10,
        width: 10,
        height: 10,
        displayOrder: 0,
      },
    });
    const imageOfDeletedSurvey = await prisma.surveyImage.create({
      data: {
        surveyId: deletedSurvey.id,
        originalPath: await putFile(`site-surveys/${deletedSurvey.id}/original-${p}.jpg`),
        thumbnailPath: await putFile(`site-surveys/${deletedSurvey.id}/thumb-${p}.jpg`),
        fileName: 'b.jpg',
        fileSize: 10,
        width: 10,
        height: 10,
        displayOrder: 0,
      },
    });

    // 工事写真（原本・サムネイル）
    const album = await prisma.constructionPhotoAlbum.create({
      data: { projectId, name: `アルバム_${p}` },
    });
    const photo = await prisma.constructionPhoto.create({
      data: {
        albumId: album.id,
        originalPath: await putFile(`construction-photos/${album.id}/original-${p}.jpg`),
        thumbnailPath: await putFile(`construction-photos/${album.id}/thumb-${p}.jpg`),
        fileName: 'c.jpg',
        fileSize: 10,
        width: 10,
        height: 10,
        displayOrder: 0,
      },
    });

    // 数量表・内訳書と項目
    const quantityTable = await prisma.quantityTable.create({
      data: { projectId, name: `数量表_${p}` },
    });
    const statement = await prisma.itemizedStatement.create({
      data: {
        projectId,
        name: `内訳書_${p}`,
        sourceQuantityTableId: quantityTable.id,
        sourceQuantityTableName: quantityTable.name,
      },
    });
    const statementItem = await prisma.itemizedStatementItem.create({
      data: { itemizedStatementId: statement.id, quantity: 1, displayOrder: 0, name: '項目' },
    });

    // 内訳書を参照する見積依頼と項目（Restrict）
    const request = await prisma.estimateRequest.create({
      data: {
        projectId,
        tradingPartnerId,
        itemizedStatementId: statement.id,
        name: `見積依頼_${p}`,
      },
    });
    const requestItem = await prisma.estimateRequestItem.create({
      data: {
        estimateRequestId: request.id,
        itemizedStatementItemId: statementItem.id,
        selected: true,
      },
    });

    // 受領見積書の両方の文脈（案件に直接・見積依頼を通して）。直接のものは個別に論理削除したものも含める
    const directQuotation = await prisma.receivedQuotation.create({
      data: {
        projectId,
        vendorName: `業者_${p}`,
        name: `直接の受領見積書_${p}`,
        submittedAt: new Date('2000-09-01'),
        filePath: await putFile(`quotations/projects/${projectId}/direct-${p}.pdf`),
        fileName: 'direct.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10,
      },
    });
    const deletedDirectQuotation = await prisma.receivedQuotation.create({
      data: {
        projectId,
        vendorName: `業者_${p}`,
        name: `削除済みの受領見積書_${p}`,
        submittedAt: new Date('2000-09-02'),
        deletedAt: daysBefore(95),
      },
    });
    const requestQuotation = await prisma.receivedQuotation.create({
      data: {
        estimateRequestId: request.id,
        projectId,
        vendorName: `業者_${p}`,
        name: `見積依頼の受領見積書_${p}`,
        submittedAt: new Date('2000-09-03'),
        filePath: await putFile(`quotations/${request.id}/request-${p}.pdf`),
        fileName: 'request.pdf',
        fileMimeType: 'application/pdf',
        fileSize: 10,
      },
    });

    // 契約書と実行予算（発注・出来高が実行予算の項目を Restrict で参照する）
    const contract = await prisma.contract.create({
      data: {
        projectId,
        contractType: 'NEW',
        contractDate: new Date('2000-07-01'),
        constructionStartDate: new Date('2000-07-10'),
        constructionEndDate: new Date('2000-08-10'),
        deliveryDate: new Date('2000-08-20'),
      },
    });
    const budget = await prisma.executionBudget.create({
      data: { projectId, contractId: contract.id },
    });
    const budgetItem = await prisma.executionBudgetItem.create({
      data: { executionBudgetId: budget.id, displayOrder: 0, name: `予算項目_${p}` },
    });
    const order = await prisma.order.create({
      data: { executionBudgetId: budget.id, tradingPartnerId },
    });
    const orderItem = await prisma.orderItem.create({
      data: { orderId: order.id, executionBudgetItemId: budgetItem.id, checked: true },
    });
    const progressRecord = await prisma.progressRecord.create({
      data: { executionBudgetId: budget.id, constructionDate: new Date('2000-08-01') },
    });
    const progressRecordItem = await prisma.progressRecordItem.create({
      data: {
        progressRecordId: progressRecord.id,
        executionBudgetItemId: budgetItem.id,
        amount: 1000,
      },
    });

    return {
      projectId,
      ids: {
        siteSurvey: [survey.id, deletedSurvey.id],
        surveyImage: [image.id, imageOfDeletedSurvey.id],
        constructionPhotoAlbum: [album.id],
        constructionPhoto: [photo.id],
        quantityTable: [quantityTable.id],
        itemizedStatement: [statement.id],
        itemizedStatementItem: [statementItem.id],
        estimateRequest: [request.id],
        estimateRequestItem: [requestItem.id],
        receivedQuotation: [directQuotation.id, deletedDirectQuotation.id, requestQuotation.id],
        contract: [contract.id],
        executionBudget: [budget.id],
        executionBudgetItem: [budgetItem.id],
        order: [order.id],
        orderItem: [orderItem.id],
        progressRecord: [progressRecord.id],
        progressRecordItem: [progressRecordItem.id],
      },
      fileKeys: [
        image.originalPath,
        image.thumbnailPath,
        image.annotatedThumbnailPath!,
        imageOfDeletedSurvey.originalPath,
        imageOfDeletedSurvey.thumbnailPath,
        photo.originalPath,
        photo.thumbnailPath,
        directQuotation.filePath!,
        requestQuotation.filePath!,
      ],
    };
  };

  /** 木の各表に残っている行の件数（表ごと） */
  const countRows = async (tree: ProjectTree) => {
    const { ids } = tree;
    const inIds = (list: string[]) => ({ where: { id: { in: list } } });
    return {
      project: await prisma.project.count(inIds([tree.projectId])),
      siteSurvey: await prisma.siteSurvey.count(inIds(ids.siteSurvey)),
      surveyImage: await prisma.surveyImage.count(inIds(ids.surveyImage)),
      constructionPhotoAlbum: await prisma.constructionPhotoAlbum.count(
        inIds(ids.constructionPhotoAlbum)
      ),
      constructionPhoto: await prisma.constructionPhoto.count(inIds(ids.constructionPhoto)),
      quantityTable: await prisma.quantityTable.count(inIds(ids.quantityTable)),
      itemizedStatement: await prisma.itemizedStatement.count(inIds(ids.itemizedStatement)),
      itemizedStatementItem: await prisma.itemizedStatementItem.count(
        inIds(ids.itemizedStatementItem)
      ),
      estimateRequest: await prisma.estimateRequest.count(inIds(ids.estimateRequest)),
      estimateRequestItem: await prisma.estimateRequestItem.count(inIds(ids.estimateRequestItem)),
      receivedQuotation: await prisma.receivedQuotation.count(inIds(ids.receivedQuotation)),
      contract: await prisma.contract.count(inIds(ids.contract)),
      executionBudget: await prisma.executionBudget.count(inIds(ids.executionBudget)),
      executionBudgetItem: await prisma.executionBudgetItem.count(inIds(ids.executionBudgetItem)),
      order: await prisma.order.count(inIds(ids.order)),
      orderItem: await prisma.orderItem.count(inIds(ids.orderItem)),
      progressRecord: await prisma.progressRecord.count(inIds(ids.progressRecord)),
      progressRecordItem: await prisma.progressRecordItem.count(inIds(ids.progressRecordItem)),
    };
  };

  /** 作った件数（表ごと） */
  const createdCounts = (tree: ProjectTree) => ({
    project: 1,
    ...Object.fromEntries(Object.entries(tree.ids).map(([table, list]) => [table, list.length])),
  });

  const zeroCounts = (tree: ProjectTree) =>
    Object.fromEntries(Object.keys(createdCounts(tree)).map((table) => [table, 0]));

  const existingFiles = async (keys: string[]) => {
    const found: string[] = [];
    for (const key of keys) {
      if (await storage.exists(key)) found.push(key);
    }
    return found;
  };

  const purgeLogsOf = (projectId: string) =>
    prisma.auditLog.findMany({ where: { action: 'PROJECT_PURGED', targetId: projectId } });

  /** プロジェクトに関する既存の監査ログを作る（完全削除で消えないことの確認に使う） */
  const createExistingAuditLog = async (projectId: string) =>
    (
      await prisma.auditLog.create({
        data: {
          action: 'PROJECT_DELETED',
          actorId: userId,
          targetType: 'Project',
          targetId: projectId,
          metadata: { note: `完全削除の統合テスト_${suffix}` },
        },
      })
    ).id;

  /** 失敗の途中で残った行を消す（Restrict の行を葉から消してからプロジェクトを消す） */
  const removeProjects = async (projectIds: string[]) => {
    const byBudget = { executionBudget: { projectId: { in: projectIds } } };
    const byRequest = { estimateRequest: { projectId: { in: projectIds } } };
    await prisma.progressRecordItem.deleteMany({ where: { progressRecord: byBudget } });
    await prisma.orderItem.deleteMany({ where: { order: byBudget } });
    await prisma.order.deleteMany({ where: byBudget });
    await prisma.executionBudget.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.receivedQuotation.deleteMany({
      where: { OR: [{ projectId: { in: projectIds } }, byRequest] },
    });
    await prisma.estimateRequest.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    storageRoot = await mkdtemp(join(tmpdir(), 'project-purge-'));
    storage = new LocalStorageProvider({ basePath: storageRoot });
    await storage.initialize();

    const user = await createTestUser(prisma, {
      email: `project-purge-${suffix}@example.com`,
      displayName: '完全削除の利用者',
      passwordHash: 'unused-password-hash',
    });
    userId = user.id;
    const partner = await prisma.tradingPartner.create({
      data: { name: `完全削除の取引先_${suffix}`, nameKana: 'カンゼンサクジョ', address: '東京都' },
    });
    tradingPartnerId = partner.id;
  });

  afterAll(async () => {
    // 監査ログは消せない（トリガーが拒否する）ため残す
    await removeProjects(createdProjectIds);
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('91 日前に論理削除したプロジェクトの行とファイルを残さず消し、監査に一件記録する。89 日前のもの・論理削除していないもの・既存の監査ログは残る', async () => {
    const tree = await createFullTree('91日前', daysBefore(91));
    const recent = await createProjectWithFile('89日前', daysBefore(89));
    const active = await createProjectWithFile('論理削除なし', null);
    const existingLogId = await createExistingAuditLog(tree.projectId);

    // 前提: 作った行とファイルがすべてある
    expect(await countRows(tree)).toEqual(createdCounts(tree));
    expect(await existingFiles(tree.fileKeys)).toEqual(tree.fileKeys);

    const service = new ProjectPurgeService({ prisma, storageProvider: storage });
    const result = await service.purgeExpired(NOW);

    expect(result.purgedProjectIds).toEqual([tree.projectId]);
    expect(result.failedProjectIds).toEqual([]);
    expect(result.remainingCandidates).toBe(0);

    // 行もファイルも残らない（個別に論理削除した子も含む）
    expect(await countRows(tree)).toEqual(zeroCounts(tree));
    expect(await existingFiles(tree.fileKeys)).toEqual([]);

    // 完全削除の監査の記録が一件だけあり、件数と日時を持つ（名前とキーは持たない）
    const logs = await purgeLogsOf(tree.projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId: null, targetType: 'Project' });
    expect(logs[0]!.metadata).toEqual({
      deletedAt: daysBefore(91).toISOString(),
      purgedAt: NOW.toISOString(),
      counts: {
        siteSurveys: 2,
        surveyImages: 2,
        quantityTables: 1,
        itemizedStatements: 1,
        estimateRequests: 1,
        receivedQuotations: 3,
        estimates: 0,
        contracts: 1,
        schedules: 0,
        executionBudgets: 1,
        constructionPhotoAlbums: 1,
        constructionPhotos: 1,
        files: tree.fileKeys.length,
      },
    });
    const serialized = JSON.stringify(logs[0]);
    expect(serialized).not.toContain(suffix);
    for (const key of tree.fileKeys) expect(serialized).not.toContain(key);

    // 既存の監査ログは消えない
    expect(await prisma.auditLog.count({ where: { id: existingLogId } })).toBe(1);

    // 89 日前のもの・論理削除していないものは行もファイルも残る
    for (const kept of [recent, active]) {
      expect(await prisma.project.count({ where: { id: kept.projectId } })).toBe(1);
      expect(await prisma.receivedQuotation.count({ where: { id: kept.quotationId } })).toBe(1);
      expect(await storage.exists(kept.key)).toBe(true);
      expect(await purgeLogsOf(kept.projectId)).toEqual([]);
    }
  });

  it('ファイルの削除に失敗したら行を残し、次の実行で消す', async () => {
    const tree = await createFullTree('失敗', daysBefore(91));
    // 途中のキー（工事写真の原本）で失敗させ、前後のファイルの扱いに依らず行が残ることを見る
    const failingKey = tree.fileKeys[5]!;
    const service = new ProjectPurgeService({
      prisma,
      storageProvider: failOnceOnDelete(storage, failingKey),
    });

    const first = await service.purgeExpired(NOW);

    expect(first.purgedProjectIds).toEqual([]);
    expect(first.failedProjectIds).toEqual([tree.projectId]);
    // 行はすべて残り、監査には記録しない
    expect(await countRows(tree)).toEqual(createdCounts(tree));
    expect(await purgeLogsOf(tree.projectId)).toEqual([]);
    // 失敗したキーのファイルは残る
    expect(await storage.exists(failingKey)).toBe(true);

    // 包みを外した次の実行で消える
    const retry = new ProjectPurgeService({ prisma, storageProvider: storage });
    const second = await retry.purgeExpired(NOW);

    expect(second.purgedProjectIds).toEqual([tree.projectId]);
    expect(second.failedProjectIds).toEqual([]);
    expect(await countRows(tree)).toEqual(zeroCounts(tree));
    expect(await existingFiles(tree.fileKeys)).toEqual([]);
    expect(await purgeLogsOf(tree.projectId)).toHaveLength(1);
  });
});
