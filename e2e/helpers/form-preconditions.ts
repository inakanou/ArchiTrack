/**
 * フォームの前提準備を、崩れたときに必ずその場で失敗する形で行う補助。
 *
 * ## 背景（Task 115.92）
 *
 * E2E 全体に、選択欄の候補が供給されない場合に**何もせず素通りする**前提準備が
 * 129 箇所複製されていた。典型は次の形である。
 *
 * ```ts
 * const value = await select.inputValue();
 * if (!value) {
 *   const options = await select.locator('option').all();
 *   if (options.length > 1 && options[1]) {
 *     const firstUserOption = await options[1].getAttribute('value');
 *     if (firstUserOption) {
 *       await select.selectOption(firstUserOption);
 *     }
 *   }
 * }
 * ```
 *
 * これは要件の検証ではないため AI運用7原則 第3原則（前提条件による検証の自動無効化の禁止）に
 * 直接抵触するものではない。しかし候補が供給されないまま後段へ進むため、**失敗が前提の
 * 崩れた地点ではなく後段の操作で現れる**。その結果、前提の崩れなのか検証対象の欠陥なのかを
 * 判別できなくなる。
 *
 * Task 115.68 が一箇所だけ是正した形（選択欄の表示・候補の供給・実在候補の値・選択の成立を
 * いずれも無条件に主張する）を、本補助として括り出して全体へ適用する。
 * 定型を複製したまま個別に直すと再発するため、呼び出し側は本補助を経由すること。
 */

import { expect, type Locator } from '@playwright/test';
import { getTimeout } from './wait-helpers';

/**
 * 選択欄から実在する先頭の候補を選び、選択が成立したことまで主張する。
 *
 * 先頭の `option` は未選択のプレースホルダ（`value=""`）である前提のため、実在の候補は
 * 2 件目以降に現れる。候補は非同期に読み込まれることがあるので、供給されるまで待ってから
 * 主張する。
 *
 * 既定値が解決済みであっても候補から選び直す。そうすることで「前提が成立した」ことが
 * 観測可能になり、既定値の解決が壊れた場合にも本補助の内側で失敗する。
 *
 * @param select 対象の `<select>` を指す Locator
 * @param label 失敗メッセージに用いる項目名（例: `'営業担当者'`）
 * @param options.timeout 表示と候補供給の待ち時間の基準値（既定 15000ms）
 * @returns 選択した候補の値
 * @throws 選択欄が表示されない・候補が供給されない・候補の値が空・選択が成立しない場合
 */
export async function selectFirstRealOption(
  select: Locator,
  label: string,
  options: { timeout?: number } = {}
): Promise<string> {
  const timeout = getTimeout(options.timeout ?? 15000);

  await expect(select, `${label}の選択欄が表示される`).toBeVisible({ timeout });

  await expect
    .poll(() => select.locator('option').count(), {
      timeout,
      message: `${label}の選択肢が供給されない`,
    })
    .toBeGreaterThan(1);

  const value = await select.locator('option').nth(1).getAttribute('value');
  expect(value, `${label}の選択肢が実在の値を指す`).toBeTruthy();

  await select.selectOption(value!);
  await expect(select, `${label}が選択されている`).toHaveValue(value!);

  return value!;
}
