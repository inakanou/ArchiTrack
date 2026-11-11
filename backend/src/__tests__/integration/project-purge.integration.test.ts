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
 * タスク83.7: 失敗の扱い（後ろへ回す・5 回で対象から外す・結果の記録・対象に戻す）を実際の DB で確かめる。
 *
 * - 別のプロジェクトの見積依頼が対象の内訳書を参照して DB の段で毎回失敗するプロジェクト 20 件と、失敗しないもの
 *   を作り、失敗しないものが消えること、試みていないもの（記録の無いもの）が先に選ばれること
 * - 5 回続けて失敗したものが対象から外れ、記録・監査・通知が残ること、その内訳書の詳細の取得が 404 のままであること
 * - 回ごとの件数が監査に残ること、`requeue` の後の回で再び試み、参照を消せば記録ごと完全に削除されること
 *
 * 共有のテストの DB には他のテストの論理削除したプロジェクトがありうる。完全削除はそれらも古い順に選ぶため、
 * このテストの「現在」を過去（2001 年・2000 年）に置き、このテストの対象だけが 90 日を過ぎる形にする。
 * 作った監査の記録（定期処理の回の記録を含む）は後片付けで消し、他の試験の監査の件数を揺らさない。
 *
 * @requirement project-management/REQ-9.6 関連データを保持期間の後に共に削除する
 * @requirement project-management/REQ-46.1 論理削除の日時から 90 日間は保持する
 * @requirement project-management/REQ-46.6 完全削除を件数と日時で監査に記録する
 * @requirement project-management/REQ-46.7 失敗したプロジェクトは消さずに記録し、次の回でやり直す
 * @requirement project-management/REQ-46.8 導入の前に論理削除されたプロジェクトにも同じ保持期間を当てる
 * @requirement project-management/REQ-46.9 監査ログは消さない
 * @requirement project-management/REQ-46.10 失敗したものを試みていないものの後へ回す
 * @requirement project-management/REQ-46.11 5 回続けて失敗したものを対象から外し、記録して知らせる
 * @requirement project-management/REQ-46.13 対象から外した間も表示・提供しない
 * @requirement project-management/REQ-46.14 対象に戻したものを次の回で試みる
 * @requirement project-management/REQ-46.15 1 回ごとの件数を監査に記録する
 *
 * @module __tests__/integration/project-purge.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateEnv } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

// 環境変数を初期化（モジュールインポート前に実行）
validateEnv();

import app from '../../app.js';
import getPrismaClient from '../../db.js';
import tokenService from '../../services/token.service.js';
import { getSharedRBACService } from '../../services/rbac.service.js';
import { seedPermissions, seedRolePermissions, seedRoles } from '../../utils/seed-helpers.js';
import { deleteAuditLogsWithArchivePermission } from '../../utils/audit-log-archive-permission.js';
import { createTestUser } from './test-user-factory.js';
import { LocalStorageProvider } from '../../storage/local-storage.provider.js';
import type { StorageProvider } from '../../storage/storage-provider.interface.js';
import type { IAdminNotificationService } from '../../services/admin-notification.service.js';
import {
  ProjectPurgeService,
  PROJECT_PURGE_MAX_FAILURES,
  PROJECT_PURGE_RUN_AUDIT_TARGET_TYPE,
} from '../../services/project-purge.service.js';

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
  /** このテストで流した回の開始の日時（回の監査の記録の対象の ID。後片付けに使う） */
  const purgeRunIds: string[] = [NOW.toISOString()];

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
    // 作った監査の記録は、アーカイブの許可の設定の下で消す（他の試験の監査の件数を揺らさない）
    await deleteAuditLogsWithArchivePermission(prisma, {
      OR: [
        { targetId: { in: createdProjectIds } },
        { actorId: userId },
        { targetType: PROJECT_PURGE_RUN_AUDIT_TARGET_TYPE, targetId: { in: purgeRunIds } },
      ],
    });
    // 失敗の記録の行はプロジェクトの削除に連なって消える
    await removeProjects(createdProjectIds);
    await prisma.tradingPartner.deleteMany({ where: { id: tradingPartnerId } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await getSharedRBACService().invalidateUserPermissionsCache(userId);
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

  describe('失敗が続くプロジェクトの扱い（タスク83.7）', () => {
    /**
     * この場面の「現在」の起点。上の試験の行（2000 年 9〜10 月の論理削除）が 90 日を過ぎないよう、さらに過去に置く。
     * n 回目の回は起点の n - 1 日後に流す
     */
    const BASE = new Date('2000-06-01T00:00:00.000Z');
    const MINUTE_MS = 60 * 1000;
    const FAILING_COUNT = 20;
    const runAt = (n: number) => new Date(BASE.getTime() + (n - 1) * DAY_MS);
    /** 起点の 91 日前からさらに minutes 分だけ前（大きいほど古い） */
    const deletedMinutesBefore = (minutes: number) =>
      new Date(BASE.getTime() - 91 * DAY_MS - minutes * MINUTE_MS);

    /** 全システム管理者への通知の偽物（呼ばれ方だけを見る） */
    const notifyAllAdmins = vi.fn<IAdminNotificationService['notifyAllAdmins']>(async () => {});
    let service: ProjectPurgeService;
    let token: string;
    /** 対象の内訳書を参照する見積依頼を持つ、論理削除していないプロジェクト */
    let liveStatementId: string;
    /** 失敗しないもの（1 件目は最も古く、2 件目は最も新しい） */
    let oldestGoodId: string;
    let newestGoodId: string;
    /** DB の段で毎回失敗するもの（論理削除の古い順） */
    const failing: Array<{ projectId: string; statementId: string; blockingRequestId: string }> =
      [];
    const failingIds = (from: number, to: number) =>
      failing.slice(from - 1, to).map((project) => project.projectId);

    const runPurge = (n: number) => {
      const now = runAt(n);
      purgeRunIds.push(now.toISOString());
      return service.purgeExpired(now);
    };

    const createStatement = async (projectId: string, label: string) =>
      (
        await prisma.itemizedStatement.create({
          data: {
            projectId,
            name: `内訳書_${label}_${suffix}`,
            sourceQuantityTableId: randomUUID(),
            sourceQuantityTableName: `数量表_${label}_${suffix}`,
          },
        })
      ).id;

    /** 失敗の記録をプロジェクトごとに引く */
    const statesOf = async (projectIds: string[]) => {
      const rows = await prisma.projectPurgeState.findMany({
        where: { projectId: { in: projectIds } },
      });
      return new Map(rows.map((row) => [row.projectId, row]));
    };

    beforeAll(async () => {
      // 内訳書の詳細の取得に使う利用者（全プロジェクトの関係者）にシステム管理者のロールを与える
      await seedRoles(prisma);
      await seedPermissions(prisma);
      await seedRolePermissions(prisma);
      const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
      await prisma.userRole.create({ data: { userId, roleId: adminRole.id } });
      await getSharedRBACService().invalidateUserPermissionsCache(userId);
      token = await tokenService.generateAccessToken({
        accessTokenGeneration: 0,
        userId,
        email: `project-purge-${suffix}@example.com`,
        roles: ['admin'],
      });

      oldestGoodId = await createProject('失敗しない_古い', deletedMinutesBefore(30));
      await createStatement(oldestGoodId, '失敗しない_古い');
      const liveProjectId = await createProject('参照する側', null);
      liveStatementId = await createStatement(liveProjectId, '参照する側');
      for (let i = 1; i <= FAILING_COUNT; i++) {
        const projectId = await createProject(`毎回失敗_${i}`, deletedMinutesBefore(21 - i));
        const statementId = await createStatement(projectId, `毎回失敗_${i}`);
        // 経路は別のプロジェクトの内訳書の参照を拒むため、DB へ直接作る
        const blocking = await prisma.estimateRequest.create({
          data: {
            projectId: liveProjectId,
            tradingPartnerId,
            itemizedStatementId: statementId,
            name: `別のプロジェクトの見積依頼_${i}_${suffix}`,
          },
        });
        failing.push({ projectId, statementId, blockingRequestId: blocking.id });
      }
      newestGoodId = await createProject('失敗しない_新しい', deletedMinutesBefore(0));
      await createStatement(newestGoodId, '失敗しない_新しい');

      service = new ProjectPurgeService({
        prisma,
        storageProvider: storage,
        adminNotificationService: { notifyAllAdmins },
      });
    });

    /**
     * @requirement project-management/REQ-46.10
     */
    it('1 回目で失敗しないものを消し、失敗したものに回数と最後に試みた日時を記録する', async () => {
      const result = await runPurge(1);

      // 対象 22 件のうち論理削除の古い 20 件（失敗しない古いもの・毎回失敗する 1〜19 件目）を試みる
      expect(result).toEqual({
        purgedProjectIds: [oldestGoodId],
        failedProjectIds: failingIds(1, 19),
        excludedProjectIds: [],
        remainingCandidates: 2,
      });
      expect(await prisma.project.count({ where: { id: oldestGoodId } })).toBe(0);

      const states = await statesOf(failingIds(1, FAILING_COUNT));
      expect(states.size).toBe(19);
      for (const projectId of failingIds(1, 19)) {
        expect(states.get(projectId)).toMatchObject({
          failureCount: 1,
          lastAttemptAt: runAt(1),
          excludedAt: null,
        });
      }
      // 失敗したものは論理削除のまま残る
      expect(
        await prisma.project.count({
          where: { id: { in: failingIds(1, FAILING_COUNT) }, deletedAt: { not: null } },
        })
      ).toBe(FAILING_COUNT);
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    /**
     * @requirement project-management/REQ-46.10
     */
    it('2 回目は記録の無いものを先に選び、毎回失敗する 20 件より新しいものも消す', async () => {
      const result = await runPurge(2);

      // 論理削除の古い順だけなら毎回失敗する 20 件で枠が埋まり、新しいものは選ばれない。
      // 記録の無いもの（20 件目・新しいもの）が 1 対 1 の関係の外部結合で空として先に並び、
      // その後に試みた日時の同じもの（1〜18 件目）が論理削除の古い順に並ぶ
      expect(result).toEqual({
        purgedProjectIds: [newestGoodId],
        failedProjectIds: [...failingIds(20, 20), ...failingIds(1, 18)],
        excludedProjectIds: [],
        remainingCandidates: 1,
      });
      expect(await prisma.project.count({ where: { id: newestGoodId } })).toBe(0);

      const states = await statesOf(failingIds(1, FAILING_COUNT));
      expect(states.get(failing[19]!.projectId)).toMatchObject({
        failureCount: 1,
        lastAttemptAt: runAt(2),
      });
      expect(states.get(failing[18]!.projectId)).toMatchObject({
        failureCount: 1,
        lastAttemptAt: runAt(1),
      });
      expect(states.get(failing[0]!.projectId)).toMatchObject({
        failureCount: 2,
        lastAttemptAt: runAt(2),
      });
      expect(notifyAllAdmins).not.toHaveBeenCalled();
    });

    /**
     * @requirement project-management/REQ-46.11
     */
    it('5 回続けて失敗したものを対象から外し、記録と監査を残して回ごとに 1 通知らせる', async () => {
      // 3 回目: 試みた日時の古い 19 件目が先に並ぶ
      expect(await runPurge(3)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: [...failingIds(19, 19), ...failingIds(1, 18), ...failingIds(20, 20)],
        excludedProjectIds: [],
        remainingCandidates: 0,
      });
      // 4 回目: 試みた日時がすべて同じため論理削除の古い順
      expect(await runPurge(4)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: failingIds(1, FAILING_COUNT),
        excludedProjectIds: [],
        remainingCandidates: 0,
      });
      expect(notifyAllAdmins).not.toHaveBeenCalled();
      const beforeFifth = await statesOf(failingIds(1, FAILING_COUNT));
      for (const state of beforeFifth.values()) {
        expect(state.failureCount).toBeLessThan(PROJECT_PURGE_MAX_FAILURES);
        expect(state.excludedAt).toBeNull();
      }

      // 5 回目: 1〜18 件目は 5 回目の失敗で外れ、19・20 件目は 4 回目の失敗のため外れない
      expect(await runPurge(5)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: failingIds(1, FAILING_COUNT),
        excludedProjectIds: failingIds(1, 18),
        remainingCandidates: 0,
      });
      const afterFifth = await statesOf(failingIds(1, FAILING_COUNT));
      for (const projectId of failingIds(1, 18)) {
        expect(afterFifth.get(projectId)).toMatchObject({ failureCount: 5, excludedAt: runAt(5) });
      }
      for (const projectId of failingIds(19, 20)) {
        expect(afterFifth.get(projectId)).toMatchObject({ failureCount: 4, excludedAt: null });
      }

      // 6 回目: 外したものは選ばず、残りの 2 件が 5 回目の失敗で外れる
      expect(await runPurge(6)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: failingIds(19, 20),
        excludedProjectIds: failingIds(19, 20),
        remainingCandidates: 0,
      });
      // 7 回目: 対象が無い
      expect(await runPurge(7)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: [],
        excludedProjectIds: [],
        remainingCandidates: 0,
      });

      const states = await statesOf(failingIds(1, FAILING_COUNT));
      for (const [index, { projectId }] of failing.entries()) {
        expect(states.get(projectId)).toMatchObject({
          failureCount: PROJECT_PURGE_MAX_FAILURES,
          excludedAt: index < 18 ? runAt(5) : runAt(6),
        });
      }
      // 外したものも論理削除のまま残り、完全削除の記録は無い
      expect(
        await prisma.project.count({
          where: { id: { in: failingIds(1, FAILING_COUNT) }, deletedAt: { not: null } },
        })
      ).toBe(FAILING_COUNT);
      expect(
        await prisma.auditLog.count({
          where: { action: 'PROJECT_PURGED', targetId: { in: failingIds(1, FAILING_COUNT) } },
        })
      ).toBe(0);

      // 対象から外した監査の記録が 1 件ずつあり、回数・日時・段階だけを持つ
      const exclusionLogs = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_PURGE_EXCLUDED', targetId: { in: failingIds(1, FAILING_COUNT) } },
      });
      expect(exclusionLogs).toHaveLength(FAILING_COUNT);
      for (const [index, project] of failing.entries()) {
        const logs = exclusionLogs.filter((log) => log.targetId === project.projectId);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ actorId: null, targetType: 'Project' });
        expect(logs[0]!.metadata).toEqual({
          failureCount: PROJECT_PURGE_MAX_FAILURES,
          deletedAt: deletedMinutesBefore(21 - (index + 1)).toISOString(),
          excludedAt: (index < 18 ? runAt(5) : runAt(6)).toISOString(),
          lastFailureStage: 'database',
        });
      }
      expect(JSON.stringify(exclusionLogs)).not.toContain(suffix);

      // 外したものがあった回（5・6 回目）に 1 通ずつ。ID と回数を載せ、名前を載せない
      expect(notifyAllAdmins).toHaveBeenCalledTimes(2);
      const [fifth, sixth] = notifyAllAdmins.mock.calls.map(([notification]) => notification);
      for (const [notification, ids] of [
        [fifth!, failingIds(1, 18)],
        [sixth!, failingIds(19, 20)],
      ] as const) {
        expect(notification.kind).toBe('PROJECT_PURGE_EXCLUDED');
        for (const projectId of ids) {
          expect(notification.lines).toContain(
            `プロジェクト ID: ${projectId}（失敗の回数: ${PROJECT_PURGE_MAX_FAILURES} 回）`
          );
        }
        expect(
          notification.lines.filter((line) => line.startsWith('プロジェクト ID:'))
        ).toHaveLength(ids.length);
        expect(JSON.stringify(notification)).not.toContain(suffix);
      }
    }, 60_000);

    /**
     * @requirement project-management/REQ-46.13
     */
    it('対象から外したものの内訳書の詳細の取得は 404 のまま（論理削除していないものは 200）', async () => {
      const excluded = failing[1]!;
      expect((await statesOf([excluded.projectId])).get(excluded.projectId)?.excludedAt).toEqual(
        runAt(5)
      );

      const hidden = await request(app)
        .get(`/api/itemized-statements/${excluded.statementId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(hidden.status).toBe(404);
      expect(JSON.stringify(hidden.body)).not.toContain(suffix);

      // 同じ利用者で、論理削除していないプロジェクトの内訳書は取得できる（404 は論理削除による）
      const visible = await request(app)
        .get(`/api/itemized-statements/${liveStatementId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(visible.status).toBe(200);
      expect(visible.body.id).toBe(liveStatementId);
    });

    /**
     * @requirement project-management/REQ-46.15
     */
    it('回ごとに完全に削除した・失敗した・対象から外した・残りの件数を監査に 1 件ずつ記録する', async () => {
      const expected = [
        { purged: 1, failed: 19, excluded: 0, remainingCandidates: 2 },
        { purged: 1, failed: 19, excluded: 0, remainingCandidates: 1 },
        { purged: 0, failed: 20, excluded: 0, remainingCandidates: 0 },
        { purged: 0, failed: 20, excluded: 0, remainingCandidates: 0 },
        { purged: 0, failed: 20, excluded: 18, remainingCandidates: 0 },
        { purged: 0, failed: 2, excluded: 2, remainingCandidates: 0 },
        { purged: 0, failed: 0, excluded: 0, remainingCandidates: 0 },
      ];
      for (const [index, metadata] of expected.entries()) {
        const runId = runAt(index + 1).toISOString();
        const logs = await prisma.auditLog.findMany({
          where: {
            action: 'PROJECT_PURGE_RUN_COMPLETED',
            targetType: PROJECT_PURGE_RUN_AUDIT_TARGET_TYPE,
            targetId: runId,
          },
        });
        expect(logs, `${index + 1} 回目の回の記録`).toHaveLength(1);
        expect(logs[0]).toMatchObject({ actorId: null });
        expect(logs[0]!.metadata).toEqual(metadata);
      }
    });

    /**
     * @requirement project-management/REQ-46.14
     */
    it('対象に戻したものを次の回で試み、参照を消せば完全に削除して記録も消える', async () => {
      const requeued = failing[0]!;
      const others = failingIds(2, FAILING_COUNT);

      expect(await service.requeue(requeued.projectId, runAt(8))).toBe('requeued');
      const requeueLogs = await prisma.auditLog.findMany({
        where: { action: 'PROJECT_PURGE_REQUEUED', targetId: requeued.projectId },
      });
      expect(requeueLogs).toHaveLength(1);
      expect(requeueLogs[0]!.metadata).toEqual({
        trigger: 'operator_script',
        previousFailureCount: PROJECT_PURGE_MAX_FAILURES,
        previousExcludedAt: runAt(5).toISOString(),
        requeuedAt: runAt(8).toISOString(),
      });

      // 原因を直さずに戻したものは、次の回で再び試みて失敗し、回数が 1 から数え直される
      expect(await runPurge(8)).toEqual({
        purgedProjectIds: [],
        failedProjectIds: [requeued.projectId],
        excludedProjectIds: [],
        remainingCandidates: 0,
      });
      expect((await statesOf([requeued.projectId])).get(requeued.projectId)).toMatchObject({
        failureCount: 1,
        lastAttemptAt: runAt(8),
        excludedAt: null,
      });

      // 参照している別のプロジェクトの見積依頼を消すと、次の回で完全に削除し、記録も連なって消える
      await prisma.estimateRequest.delete({ where: { id: requeued.blockingRequestId } });
      expect(await runPurge(9)).toEqual({
        purgedProjectIds: [requeued.projectId],
        failedProjectIds: [],
        excludedProjectIds: [],
        remainingCandidates: 0,
      });
      expect(await prisma.project.count({ where: { id: requeued.projectId } })).toBe(0);
      expect(
        await prisma.projectPurgeState.count({ where: { projectId: requeued.projectId } })
      ).toBe(0);
      expect(await purgeLogsOf(requeued.projectId)).toHaveLength(1);

      // 戻していないものは対象から外れたまま
      const states = await statesOf(others);
      expect(states.size).toBe(others.length);
      for (const state of states.values()) expect(state.excludedAt).not.toBeNull();
      expect(notifyAllAdmins).toHaveBeenCalledTimes(2);
    });
  });
});
