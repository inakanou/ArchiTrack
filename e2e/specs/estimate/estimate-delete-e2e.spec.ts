/**
 * @fileoverview 見積書詳細画面からの見積書の削除の E2E テスト
 *
 * Requirements coverage (estimate-creation):
 * - 11.4: 見積書の削除は確認のダイアログを表示した後に実行する（各テストの `@requirement` の印が名乗る）
 *
 * 2026-10-30 の是正（design.md の「見積書の削除の基準時刻をクエリで受け取る是正」）。画面の削除の要求は
 * 楽観的排他制御の基準時刻をクエリで送るが、サーバーは本文で検証していたため、画面からの削除は常に 400 になり
 * 「見積書の削除に失敗しました」を表示していた。画面から削除して成功を主張する E2E が無かったため見つからなかった。
 * 本ファイルは画面の削除の操作から、削除の要求の成功・一覧への遷移・一覧からの消失・論理削除を主張する。
 *
 * 検証に使う案件と見積書はテストの中で DB に作り（名前の接頭辞 `NAME_PREFIX`）、利用者はテストの中で作る
 * 一意のメールアドレスの利用者とする。後始末で案件を先に消してから利用者を消す。
 */

import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { getPrismaClient } from '../../fixtures/database';
import { createSessionUser, deleteSessionUsers } from '../../fixtures/auth.fixtures';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/** テストの中で作る案件の名前の接頭辞（後始末で消す） */
const NAME_PREFIX = 'e2e-ec-delete-';

test.describe('見積書詳細画面からの見積書の削除', () => {
  test.afterEach(async () => {
    // 見積書は案件の削除に連なって消える
    await getPrismaClient().project.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
    await deleteSessionUsers();
  });

  /**
   * @requirement estimate-creation/REQ-11.4
   */
  test('見積書詳細画面で削除を確認すると、削除の要求が成功し、見積書の一覧へ戻って削除した見積書だけが一覧から消える', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const owner = await createSessionUser('REGULAR_USER');
    const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const project = await prisma.project.create({
      data: {
        name: `${NAME_PREFIX}${suffix}`,
        salesPersonId: owner.id,
        createdById: owner.id,
      },
      select: { id: true },
    });
    const targetName = `削除する見積書 ${suffix}`;
    const keptName = `残す見積書 ${suffix}`;
    const target = await prisma.estimate.create({
      data: { projectId: project.id, name: targetName },
      select: { id: true },
    });
    await prisma.estimate.create({ data: { projectId: project.id, name: keptName } });

    await loginAsUser(page, owner);

    const loaded = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/estimates/${target.id}`,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/estimates/${target.id}`);
    expect((await loaded).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: targetName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 見出しの横の見積書の削除の釦（明細のツールバーの行の削除の釦より文書の順で前にある）
    await page
      .getByTestId('estimate-detail-page')
      .getByRole('button', { name: '削除', exact: true })
      .first()
      .click();
    // 確認のダイアログを表示してから削除する（11.4）。確認の前には削除の要求を送らない
    const deleteDialog = page.getByRole('dialog', { name: '見積書の削除' });
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      deleteDialog.getByText('この見積書を削除してよろしいですか？この操作は取り消せません。', {
        exact: true,
      })
    ).toBeVisible();
    expect(
      (
        await prisma.estimate.findUniqueOrThrow({
          where: { id: target.id },
          select: { deletedAt: true },
        })
      ).deletedAt,
      '確認の前は削除しない'
    ).toBeNull();

    // オリジンは問わずパスで照合する
    const deleted = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        new URL(r.url()).pathname === `/api/estimates/${target.id}`,
      { timeout: getTimeout(30000) }
    );
    const listLoaded = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/projects/${project.id}/estimates`,
      { timeout: getTimeout(30000) }
    );
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await deleted).status(), '削除の要求は成功する').toBe(204);

    // 見積書の一覧へ戻り、残した見積書は表示し、削除した見積書は表示しない
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/estimates$`), {
      timeout: getTimeout(15000),
    });
    expect((await listLoaded).status()).toBe(200);
    const list = page.getByTestId('estimate-list');
    await expect(list.getByText(keptName, { exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(list.getByText(targetName, { exact: true })).toHaveCount(0);
    await expect(page.getByText('見積書の削除に失敗しました', { exact: true })).toHaveCount(0);

    // 見積書は論理削除される
    const row = await prisma.estimate.findUniqueOrThrow({
      where: { id: target.id },
      select: { deletedAt: true },
    });
    expect(row.deletedAt, '見積書は論理削除される').not.toBeNull();
  });
});
