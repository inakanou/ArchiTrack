/**
 * @fileoverview 一覧が「2ページ目を持つこと」を前提とする検証のための補助
 *
 * ## 背景（Task 115.127 段7・F/G 群）
 *
 * プロジェクト一覧・取引先一覧のページ遷移の E2E には、
 * `if (totalPages > 1) { …ページ2へ遷移して主張… }` の形が広がっていた。
 * 既存データが 1 ページに収まっていれば主張は一つも実行されず、それでも緑になる。
 * AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に該当する債務である。
 *
 * 2ページ目の有無は「既存データがいくつあるか」ではなく
 * **テスト自身が用意できる前提**である。1ページあたりの表示件数は URL の `limit` で指定でき
 * （`frontend/src/pages/ProjectListPage.tsx` / `TradingPartnerListPage.tsx` の `parseParams`）、
 * backend も `limit` を 1〜100 で受け付ける
 * （`backend/src/schemas/project.schema.ts` / `trading-partner.schema.ts` の `paginationSchema`）。
 * したがって `limit={@link PAGINATED_LIMIT}` で開き、
 * `{@link SECOND_PAGE_SEED_COUNT}` 件を用意すれば **2ページ目は必ず存在する**。
 *
 * 表示件数の選択肢は 10/20/50(/100) であり
 * （`frontend/src/components/projects/PaginationUI.tsx` /
 * `frontend/src/components/trading-partners/TradingPartnerPaginationUI.tsx` の `LIMIT_OPTIONS`）、
 * 選択肢に無い値を `limit` に与えると表示件数セレクトの選択状態が定まらない。
 * そのため最小の選択肢である 10 件を用いる。
 *
 * @module e2e/helpers/list-pagination-preconditions
 */

import { expect, type Page } from '@playwright/test';
import {
  seedProject,
  seedTradingPartner,
  type SeededProject,
  type SeededTradingPartner,
} from './project-list-preconditions';

/**
 * 2ページ目を持たせるために用いる1ページあたりの表示件数
 *
 * 一覧の表示件数セレクトが持つ最小の選択肢と同じ値である。
 */
export const PAGINATED_LIMIT = 10;

/**
 * 2ページ目が必ず存在する件数（1ページあたりの表示件数 + 1）
 */
export const SECOND_PAGE_SEED_COUNT = PAGINATED_LIMIT + 1;

/**
 * 取引先一覧が `limit={@link PAGINATED_LIMIT}` で2ページ以上になる件数を用意する。
 *
 * 既存データの件数に依存させないため、常に {@link SECOND_PAGE_SEED_COUNT} 件を作成する。
 * 作成に失敗した場合はその場で失敗する。
 *
 * @param page Playwright のページ（`loginAsUser` 済みであること）
 * @param label 作成する取引先名に含める識別子（テストの出所が分かる文字列）
 * @returns 作成した取引先の一覧
 */
export async function seedTradingPartnersForSecondPage(
  page: Page,
  label: string
): Promise<SeededTradingPartner[]> {
  const seeded: SeededTradingPartner[] = [];
  for (let index = 1; index <= SECOND_PAGE_SEED_COUNT; index += 1) {
    seeded.push(await seedTradingPartner(page, `${label}${index}`));
  }
  return seeded;
}

/**
 * プロジェクト一覧が `limit={@link PAGINATED_LIMIT}` で2ページ以上になる件数を用意する。
 *
 * @param page Playwright のページ（`loginAsUser` 済みであること）
 * @param label 作成するプロジェクト名に含める識別子（テストの出所が分かる文字列）
 * @returns 作成したプロジェクトの一覧
 */
export async function seedProjectsForSecondPage(
  page: Page,
  label: string
): Promise<SeededProject[]> {
  const seeded: SeededProject[] = [];
  for (let index = 1; index <= SECOND_PAGE_SEED_COUNT; index += 1) {
    seeded.push(await seedProject(page, `${label}${index}`));
  }
  return seeded;
}

/**
 * 一覧が2ページ以上であることを主張し、総ページ数を返す。
 *
 * 前提を用意したうえで呼ぶこと。1ページに収まっている場合はその場で失敗する
 * （2ページ目の検証を黙って飛ばさないため）。
 *
 * @param page Playwright のページ（一覧を表示済みであること）
 * @returns 一覧の総ページ数
 */
export async function assertMultiplePages(page: Page): Promise<number> {
  const totalPagesText = await page.getByTestId('total-pages').textContent();
  const totalPages = Number.parseInt(totalPagesText ?? '', 10);
  expect(totalPages, '前提: 一覧が2ページ以上である').toBeGreaterThan(1);
  return totalPages;
}
