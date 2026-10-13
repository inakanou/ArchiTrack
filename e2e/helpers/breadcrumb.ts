/**
 * @fileoverview パンくずナビゲーションを「利用者が読むテキストの並び」として読み取る補助
 *
 * 受入基準がパンくずを規定するとき（quantity-table-generation の Requirement 12 など）、
 * 条文は「A > B > {動的な名前} > D」のように**階層と順序**まで書いている。
 * 部分一致（`toContainText(/プロジェクト/)`）はURLや本文に同じ語が在れば通ってしまい、
 * 項目の欠落も順序の入れ替えも検出しない。
 *
 * ここでは本番のマークアップの内部構造（`ol > li` の綴りや区切りの要素）を写さず、
 * パンくずの領域が表示している**テキストを区切り記号で割った並び**を取り出す。
 * これにより判定側は「並びがこの配列と完全に一致すること」を無条件に主張できる。
 *
 * @module e2e/helpers/breadcrumb
 */

import type { Locator, Page } from '@playwright/test';

/** パンくずの項目を隔てる記号（`Breadcrumb` は `>` を区切りとして描く） */
const BREADCRUMB_SEPARATOR = '>';

/**
 * 画面のパンくずナビゲーションの領域を指す。
 *
 * アクセシブルな名前で引く（利用者・支援技術が識別に用いる名前であり、
 * `ol`/`li`/`span` といった内部構造には依存しない）。
 *
 * @param page Playwright のページ
 * @returns パンくずナビゲーションのロケータ
 */
export function breadcrumbNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'パンくずナビゲーション' });
}

/**
 * パンくずナビゲーションの項目を、表示されている順序どおりの配列として読み取る。
 *
 * 区切り記号で割ったうえで前後の空白を落とす。**項目の綴りを空にする変異では
 * 配列の長さが縮むため、完全一致で照合すれば欠落として検出できる。**
 *
 * @param nav `breadcrumbNav` が返したロケータ（表示されていること）
 * @returns 項目のテキストの並び
 */
export async function readBreadcrumbTrail(nav: Locator): Promise<string[]> {
  const rendered = await nav.innerText();
  return rendered
    .split(BREADCRUMB_SEPARATOR)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0);
}
