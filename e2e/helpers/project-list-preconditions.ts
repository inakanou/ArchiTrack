/**
 * @fileoverview プロジェクト／取引先の一覧が「空でないこと」を前提とする検証のための補助
 *
 * ## 背景（Task 115.127 段6・E群）
 *
 * プロジェクト一覧・取引先一覧の E2E には、
 * `const visible = await pagination.isVisible(); if (visible) { …主張… }` の形が広がっていた。
 * 一覧が空であれば主張は一つも実行されず、それでも緑になる。
 * AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に該当する債務である。
 *
 * production 側の描画条件は次のとおりで、**1件でも存在すれば必ず表示される**。
 *
 * - `frontend/src/pages/ProjectListPage.tsx`:
 *   `!loading && !error && projects.length > 0` かつ `pagination.totalPages > 0`
 * - `frontend/src/pages/TradingPartnerListPage.tsx`:
 *   `!loading && !networkError && tradingPartners.length > 0` かつ `pagination.totalPages > 0`
 *
 * したがって「空かもしれない」を関門にする必要は無く、
 * **一覧が空でないことをテスト自身が用意すれば主張を無条件にできる**。
 * 本補助はその前提を API で作る。作れなければその場で失敗する。
 *
 * @module e2e/helpers/project-list-preconditions
 */

import { expect, type Page } from '@playwright/test';
import { assertPrepared } from './preconditions';
import { API_BASE_URL } from '../config';

/**
 * 前提として作成したプロジェクト
 */
export interface SeededProject {
  /** 作成したプロジェクトのID */
  id: string;
  /** 作成したプロジェクトの名称 */
  name: string;
}

/**
 * 前提として作成した取引先
 */
export interface SeededTradingPartner {
  /** 作成した取引先のID */
  id: string;
  /** 作成した取引先の名称 */
  name: string;
  /** 作成した取引先の部課・支店・支社名（指定した場合） */
  branchName?: string;
  /** 作成した取引先の代表者名（指定した場合） */
  representativeName?: string;
}

/**
 * 取引先を作成するときに指定できる任意項目
 */
export interface SeedTradingPartnerOptions {
  /** 部課・支店・支社名 */
  branchName?: string;
  /** 代表者名 */
  representativeName?: string;
}

/**
 * ログイン済みのページから API 呼び出し用の認証ヘッダを得る。
 *
 * @param page Playwright のページ（`loginAsUser` 済みであること）
 * @returns Authorization ヘッダ
 * @throws 認証トークンが取得できない場合
 */
async function authHeaders(page: Page): Promise<{ Authorization: string }> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
  assertPrepared(accessToken, '認証トークン');
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * プロジェクト一覧が空でないことを前提とする検証のために、プロジェクトを1件作成する。
 *
 * 既存データの有無に依存しないため、一覧・ページネーション・カード切替の主張を
 * 無条件に置ける。作成に失敗した場合はその場で失敗する。
 *
 * @param page Playwright のページ（`loginAsUser` 済みであること）
 * @param label 作成するプロジェクト名に含める識別子（テストの出所が分かる文字列）
 * @returns 作成したプロジェクト
 * @throws 担当者候補が無い・作成APIが成功しない・IDが得られない場合
 */
export async function seedProject(page: Page, label: string): Promise<SeededProject> {
  const headers = await authHeaders(page);

  const assignableRes = await page.request.get(`${API_BASE_URL}/api/users/assignable`, { headers });
  expect(
    assignableRes.ok(),
    `前提: 担当者候補を取得できる (status=${assignableRes.status()})`
  ).toBeTruthy();
  const assignableUsers = (await assignableRes.json()) as Array<{ id: string }>;
  expect(assignableUsers.length, '前提: 担当者候補が1件以上存在する').toBeGreaterThan(0);
  const salesPersonId = assignableUsers[0]?.id;
  assertPrepared(salesPersonId, '担当者候補のID');

  const name = `${label}-${Date.now()}`;
  const projectRes = await page.request.post(`${API_BASE_URL}/api/projects`, {
    headers,
    data: { name, salesPersonId },
  });
  expect(
    projectRes.ok(),
    `前提: プロジェクトが作成される (status=${projectRes.status()})`
  ).toBeTruthy();
  const project = (await projectRes.json()) as { id: string };
  assertPrepared(project.id, '作成したプロジェクトのID');

  return { id: project.id, name };
}

/**
 * 取引先一覧が空でないことを前提とする検証のために、取引先を1件作成する。
 *
 * @param page Playwright のページ（`loginAsUser` 済みであること）
 * @param label 作成する取引先名に含める識別子（テストの出所が分かる文字列）
 * @returns 作成した取引先
 * @throws 作成APIが成功しない・IDが得られない場合
 */
export async function seedTradingPartner(
  page: Page,
  label: string,
  options: SeedTradingPartnerOptions = {}
): Promise<SeededTradingPartner> {
  const headers = await authHeaders(page);

  const optionalFields = {
    ...(options.branchName === undefined ? {} : { branchName: options.branchName }),
    ...(options.representativeName === undefined
      ? {}
      : { representativeName: options.representativeName }),
  };

  const stamp = Date.now();
  const name = `${label}-${stamp}`;
  const partnerRes = await page.request.post(`${API_BASE_URL}/api/trading-partners`, {
    headers,
    data: {
      name,
      nameKana: 'テストトリヒキサキ',
      // 種別に「顧客」を含める（プロジェクトの顧客名候補は CUSTOMER 種別のみ）
      types: ['CUSTOMER'],
      // 住所は必須項目（backend/src/schemas/trading-partner.schema.ts）
      address: '東京都渋谷区テスト1-2-3',
      ...optionalFields,
    },
  });
  expect(partnerRes.ok(), `前提: 取引先が作成される (status=${partnerRes.status()})`).toBeTruthy();
  const partner = (await partnerRes.json()) as { id: string };
  assertPrepared(partner.id, '作成した取引先のID');

  return { id: partner.id, name, ...optionalFields };
}
