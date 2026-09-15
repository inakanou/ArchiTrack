/**
 * @fileoverview 数量グループ追加時の注釈付き現場調査写真の選択 E2Eテスト
 *
 * 数量グループを追加した直後、**追加したそのグループ**から写真選択を開けること、
 * 選択元が同一プロジェクトの注釈付き現場調査写真に限られること、選んだ写真が
 * 追加したグループへ紐づき保存後も維持されることを確かめる。
 *
 * ## 前提の置き方
 *
 * 前提（プロジェクト2件・数量表・現場調査写真）は `e2e/helpers/quantity-table-preconditions.ts`
 * で**自ら作り**、作れなければその場で失敗する。候補の絞り込みを空集合に対する恒真にしないため、
 * 次の3枚を置く。
 *
 * - 対象プロジェクトの注釈付き写真（候補に現れる）
 * - 対象プロジェクトの注釈なし写真（候補に現れない）
 * - 別プロジェクトの注釈付き写真（候補に現れない）
 *
 * 数量表は新規作成でグループを持たない。検証が操作するのは画面で追加したグループであり、
 * 既存グループの写真選択（受入基準 4.3 の範囲）を流用して通ることはない。
 *
 * 前提の生成は1テストあたりのタイムアウト（60秒）に収まるよう段階に分け、直列で実行する。
 * 前段が失敗すれば後段は実行されないため、前提が欠けたまま成功して見えることはない。
 *
 * Requirements coverage (quantity-table-generation):
 * - @requirement quantity-table-generation/REQ-4.2: 追加した数量グループから同一プロジェクトの注釈付き現場調査写真を選択できる
 *
 * @module e2e/specs/quantity-tables/group-add-photo-selection-e2e.spec
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { saveQuantityTableDraft } from '../../helpers/quantity-table-actions';
import { assertPrepared } from '../../helpers/preconditions';
import {
  addQuantityGroup,
  createTestProject,
  createTestQuantityTable,
  openQuantityTableEdit,
  seedSurveyPhotosWithComments,
} from '../../helpers/quantity-table-preconditions';

/** 実行ごとに一意な接頭辞（写真のファイル名が選択候補の識別子になるため） */
const RUN_ID = Date.now().toString(36);
/** 対象プロジェクトの写真の接頭辞（1枚目に注釈を保存し、2枚目は保存しない） */
const OWN_PHOTO_PREFIX = `REQ4_2_own_${RUN_ID}`;
/** 別プロジェクトの写真の接頭辞 */
const OTHER_PHOTO_PREFIX = `REQ4_2_other_${RUN_ID}`;

test.describe('数量グループ追加時の写真選択 (quantity-table-generation/REQ-4.2)', () => {
  test.describe.configure({ mode: 'serial' });

  let quantityTableId: string | null = null;
  let ownAnnotatedFileName: string | null = null;
  let ownUnannotatedFileName: string | null = null;
  let otherProjectAnnotatedFileName: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');
  });

  test.describe('事前準備', () => {
    test('対象プロジェクトに注釈付き写真と注釈なし写真を用意し、数量表を作成する', async ({
      page,
    }) => {
      const projectId = await createTestProject(page, 'REQ4_2_PJ');
      // seedSurveyPhotosWithComments は `${接頭辞}-${位置+1}.png` の名前でアップロードする
      await seedSurveyPhotosWithComments(page, projectId, OWN_PHOTO_PREFIX, [null, null], [0]);
      ownAnnotatedFileName = `${OWN_PHOTO_PREFIX}-1.png`;
      ownUnannotatedFileName = `${OWN_PHOTO_PREFIX}-2.png`;

      quantityTableId = (await createTestQuantityTable(page, projectId, 'REQ4_2_数量表')).id;
    });

    test('別プロジェクトに注釈付き写真を用意する', async ({ page }) => {
      const otherProjectId = await createTestProject(page, 'REQ4_2_OTHER_PJ');
      await seedSurveyPhotosWithComments(page, otherProjectId, OTHER_PHOTO_PREFIX, [null], 'all');
      otherProjectAnnotatedFileName = `${OTHER_PHOTO_PREFIX}-1.png`;
    });
  });

  test('追加した数量グループから同一プロジェクトの注釈付き写真を選択でき、保存後も紐づきが維持される', async ({
    page,
  }) => {
    assertPrepared(quantityTableId, '事前準備で作成した数量表のID');
    assertPrepared(ownAnnotatedFileName, '対象プロジェクトの注釈付き写真のファイル名');
    assertPrepared(ownUnannotatedFileName, '対象プロジェクトの注釈なし写真のファイル名');
    assertPrepared(otherProjectAnnotatedFileName, '別プロジェクトの注釈付き写真のファイル名');

    await openQuantityTableEdit(page, quantityTableId);
    await expect(
      page.locator('[data-testid="quantity-group-card"]'),
      '前提: 新規作成した数量表はグループを持たない'
    ).toHaveCount(0);

    // 数量グループを追加する（受入基準 4.1 の操作。以降はこのカードだけを操作する）
    const addedGroup = await addQuantityGroup(page);

    // REQ-4.2: 追加したグループに写真を選択する機能が提供される
    const photoSelect = addedGroup.getByRole('button', { name: '写真を選択' });
    await expect(photoSelect, 'REQ-4.2: 追加した数量グループに写真選択の操作が無い').toBeVisible({
      timeout: getTimeout(10000),
    });
    await photoSelect.click();

    const dialog = page.getByRole('dialog', { name: '写真を選択' });
    await expect(dialog, 'REQ-4.2: 追加した数量グループから写真選択が開かない').toBeVisible({
      timeout: getTimeout(10000),
    });
    const photoList = dialog.getByTestId('photo-list');
    await expect(photoList, 'REQ-4.2: 選択元の写真一覧が表示されない').toBeVisible({
      timeout: getTimeout(20000),
    });

    // REQ-4.2: 選択元は同一プロジェクトの注釈付き現場調査写真に限られる
    const ownAnnotated = photoList.getByAltText(ownAnnotatedFileName, { exact: true });
    await expect(
      ownAnnotated,
      'REQ-4.2: 同一プロジェクトの注釈付き写真が選択候補に現れない'
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      dialog.getByAltText(ownUnannotatedFileName, { exact: true }),
      'REQ-4.2: 注釈エディタで編集していない写真が選択候補に現れる'
    ).toHaveCount(0);
    await expect(
      dialog.getByAltText(otherProjectAnnotatedFileName, { exact: true }),
      'REQ-4.2: 別プロジェクトの注釈付き写真が選択候補に現れる'
    ).toHaveCount(0);

    // REQ-4.2: 選んだ写真が追加したグループへ紐づく
    await ownAnnotated.click();
    await expect(dialog, '写真を選ぶとダイアログが閉じる').not.toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      addedGroup.locator(`img[alt="${ownAnnotatedFileName}"]`).first(),
      'REQ-4.2: 選択した写真が追加した数量グループに表示されない'
    ).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      addedGroup.getByRole('button', { name: '写真を選択' }),
      'REQ-4.2: 写真を選んだ後も未紐づけの表示が残る'
    ).toHaveCount(0);

    // 紐づけはドラフトの更新に留まる（REQ-42.3）。保存して再読み込み後も維持されることを確かめる
    await saveQuantityTableDraft(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const groupCards = page.locator('[data-testid="quantity-group-card"]');
    await expect(groupCards, '保存した数量グループが1件だけ存在する').toHaveCount(1, {
      timeout: getTimeout(15000),
    });
    await expect(
      groupCards.first().locator(`img[alt="${ownAnnotatedFileName}"]`).first(),
      'REQ-4.2: 追加した数量グループへの写真の紐づけが保存後に維持されない'
    ).toBeVisible({ timeout: getTimeout(15000) });
  });
});
