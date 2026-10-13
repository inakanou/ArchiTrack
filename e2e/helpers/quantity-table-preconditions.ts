/**
 * @fileoverview 数量表まわりの検証が必要とする前提を、崩れたら必ず失敗する形で用意する補助
 *
 * ## 背景（Task 115.126 / 115.127 段0）
 *
 * 数量表の E2E は「既にデータベースに存在する何か」を前提にしていた。
 *
 * 画面の遷移補助は前提が満たせないと黙って偽を返し（`isVisible()` の結果をそのまま
 * `return false` する）、呼び出し側はその偽を見て引数なしの `test.skip` を呼び、
 * 検証を丸ごと消していた。
 *
 * この形は AI運用7原則 第3原則（前提条件でテストを自動的に無効化してはならない）に
 * 直接抵触する。さらに「先頭のプロジェクトの先頭の数量表」を掴むため、たまたま開いた
 * 数量表にグループや項目が無ければ、後段の判定もすべて素通りする。
 *
 * 本補助は前提を**自分で作る**。作れなければその場で失敗する。
 * 115.126 が `field-specification.spec.ts` に置いた `openEditPageWithSingleItemRow` を
 * ここへ括り出し、同じ前提を要する各 spec から参照する（複製したまま個別に直すと再発する）。
 *
 * @module e2e/helpers/quantity-table-preconditions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, type Locator, type Page } from '@playwright/test';
import { getTimeout } from './wait-helpers';
import { selectFirstRealOption } from './form-preconditions';
import { assertPrepared } from './preconditions';
import { annotateSurveyImages, type AnnotationTargets } from './survey-image-annotations';
import { API_BASE_URL } from '../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * テスト用のプロジェクトを新規作成し、そのIDと**実際に付けた名称**を返す。
 *
 * 営業担当者の選択は `selectFirstRealOption`（Task 115.92）に委ね、候補が供給されない
 * 場合は補助の内側で失敗する。作成APIの 201 応答と詳細画面への遷移までを主張するため、
 * 「作成できていないのにIDだけ null で先へ進む」経路が無い。
 *
 * 名称は接頭辞に時刻を足して実行ごとに変わる。**パンくずが `{プロジェクト名}` を
 * 動的に描いているか（固定文字列で誤魔化していないか）を判定するには呼び出し側が
 * この名称を知っている必要がある**（quantity-table-generation の REQ-12.1〜12.3）。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param namePrefix プロジェクト名の接頭辞（テストの出所が分かる文字列）
 * @returns 作成したプロジェクトのIDと名称
 * @throws 作成画面が開けない・候補が無い・作成APIが成功しない・遷移先URLからIDが取れない場合
 */
export async function createTestProjectWithName(
  page: Page,
  namePrefix: string
): Promise<{ id: string; name: string }> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const createButton = page.getByRole('button', { name: /新規作成/i });
  await expect(createButton, '前提: プロジェクトの新規作成ボタンが表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await createButton.click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });

  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  const name = `${namePrefix}_${Date.now()}`;
  const nameInput = page.getByRole('textbox', { name: /プロジェクト名/i });
  await expect(nameInput, '前提: プロジェクト名の入力欄が表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await nameInput.fill(name);

  await selectFirstRealOption(page.locator('select[aria-label="営業担当者"]'), '営業担当者');

  const createProjectPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/projects') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: /^作成$/i }).click();
  await createProjectPromise;

  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
  const projectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
  assertPrepared(projectId, '作成したプロジェクトのID');
  return { id: projectId, name };
}

/**
 * テスト用のプロジェクトを新規作成し、そのIDを返す。
 *
 * 名称を要しない呼び出し側のための薄い包み（`createTestProjectWithName` に委ねる）。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param namePrefix プロジェクト名の接頭辞（テストの出所が分かる文字列）
 * @returns 作成したプロジェクトのID
 * @throws 作成画面が開けない・候補が無い・作成APIが成功しない・遷移先URLからIDが取れない場合
 */
export async function createTestProject(page: Page, namePrefix: string): Promise<string> {
  const { id } = await createTestProjectWithName(page, namePrefix);
  return id;
}

/**
 * テスト用の数量表を新規作成し、そのIDを返す（作成後は編集画面に居る）。
 *
 * 数量表名は PDF のファイル名（REQ-26.11）など後段の判定でも用いるため、IDと併せて返す。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param projectId 数量表を作成する対象のプロジェクトID
 * @param namePrefix 数量表名の接頭辞
 * @returns 作成した数量表のIDと名称
 * @throws 作成画面が開けない・作成後に編集画面へ遷移しない場合
 */
export async function createTestQuantityTable(
  page: Page,
  projectId: string,
  namePrefix: string
): Promise<{ id: string; name: string }> {
  await page.goto(`/projects/${projectId}/quantity-tables/new`);
  await page.waitForLoadState('networkidle');

  const name = `${namePrefix}_${Date.now()}`;
  const tableNameInput = page.getByRole('textbox', { name: /数量表名|名称/i }).first();
  await expect(tableNameInput, '前提: 数量表名の入力欄が表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await tableNameInput.fill(name);

  const submitButton = page.getByRole('button', { name: /^作成$/i });
  await expect(submitButton, '前提: 数量表の作成ボタンが表示される').toBeVisible({
    timeout: getTimeout(10000),
  });
  await submitButton.click();

  await page.waitForURL(/\/quantity-tables\/[0-9a-f-]+\/edit$/, { timeout: getTimeout(30000) });
  const quantityTableId = page.url().match(/\/quantity-tables\/([0-9a-f-]+)\/edit$/)?.[1] ?? null;
  assertPrepared(quantityTableId, '作成した数量表のID');
  return { id: quantityTableId, name };
}

/**
 * 数量表の編集画面を開く。開けなければその場で失敗する。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param quantityTableId 事前準備で作成した数量表のID
 * @throws IDが未設定・編集画面が表示されない場合
 */
export async function openQuantityTableEdit(
  page: Page,
  quantityTableId: string | null
): Promise<void> {
  assertPrepared(quantityTableId, '事前準備で作成した数量表のID');

  await page.goto(`/quantity-tables/${quantityTableId}/edit`);
  await page.waitForLoadState('networkidle');
  await expect(
    page.locator('[data-testid="quantity-table-edit-area"]'),
    '前提: 数量表の編集画面が表示される'
  ).toBeVisible({ timeout: getTimeout(15000) });
}

/**
 * 編集画面に数量グループを1件追加し、そのカードを返す。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @returns 追加された数量グループのカード
 * @throws 追加ボタンが表示されない・グループが増えない場合
 */
export async function addQuantityGroup(page: Page): Promise<Locator> {
  const groupCards = page.locator('[data-testid="quantity-group-card"]');
  const before = await groupCards.count();

  const addGroupButton = page.getByRole('button', { name: /グループ追加|グループを追加/i }).first();
  await expect(addGroupButton, '前提: 数量グループの追加ボタンが表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await addGroupButton.click();

  await expect(groupCards, '前提: 数量グループが追加される').toHaveCount(before + 1, {
    timeout: getTimeout(10000),
  });
  return groupCards.nth(before);
}

/**
 * 数量グループへ数量項目の行を追加し、行数がその数になったことまで主張する。
 *
 * @param groupCard 対象の数量グループのカード
 * @param count 追加後に存在すべき行数
 * @returns 当該グループの数量項目行（複数一致の Locator）
 * @throws 追加ボタンが表示されない・行数が一致しない場合
 */
export async function addQuantityItemRows(groupCard: Locator, count: number): Promise<Locator> {
  const itemRows = groupCard.locator('[data-testid="quantity-item-row"]');
  const before = await itemRows.count();

  const addItemButton = groupCard.getByRole('button', { name: '項目を追加' });
  await expect(addItemButton, '前提: 数量項目の追加ボタンが表示される').toBeVisible({
    timeout: getTimeout(10000),
  });

  for (let i = before; i < count; i += 1) {
    await addItemButton.click();
    await expect(itemRows, '前提: 数量項目が追加される').toHaveCount(i + 1, {
      timeout: getTimeout(10000),
    });
  }

  await expect(itemRows, `前提: 数量項目が${count}行存在する`).toHaveCount(count, {
    timeout: getTimeout(10000),
  });
  return itemRows;
}

/**
 * 数量項目行の必須項目（工種・名称・単位）を入力し、入力が保持されたことまで主張する。
 *
 * 追加した直後の数量項目は全欄が空で、この状態では保存が拒否される
 * （`QuantityTableEditPage` の整合性チェックが「項目名が空の項目があります」で中断する。
 * REQ-11.2）。保存を挟んで前提を永続化する検証では、行の必須項目を埋める必要がある。
 *
 * いずれの欄も補完付きの入力欄であるため、入力後に Escape で候補一覧を閉じる。
 * 候補一覧は body 直下へ描画され、開いたままだと後続のクリックを覆う。
 *
 * @param row 対象の数量項目行
 * @param values 入力する値（名称は行を識別するため必須。工種・単位は既定値を用いる）
 * @throws いずれかの欄が表示されない・入力が保持されない場合
 */
export async function fillItemRequiredFields(
  row: Locator,
  values: { name: string; workType?: string; unit?: string }
): Promise<void> {
  const entries: Array<[string, string]> = [
    ['工種', values.workType ?? '共通工事'],
    ['名称', values.name],
    ['単位', values.unit ?? '式'],
  ];

  for (const [label, value] of entries) {
    const input = row.getByLabel(label, { exact: true });
    await expect(input, `前提: ${label}の入力欄が表示される`).toBeVisible({
      timeout: getTimeout(10000),
    });
    await input.fill(value);
    await input.press('Escape');
    await expect(input, `前提: ${label}の入力が保持される`).toHaveValue(value);
  }
}

/**
 * 欄指定の検証に必要な前提（数量表の編集画面・数量グループ1件・数量項目1行）を用意する。
 *
 * ## 背景（Task 115.126）
 *
 * 以前は次の形で前提を用意していた。
 *
 * ```ts
 * const calculationMethodSelect = page.getByLabel(/計算方法/i);
 * if (await calculationMethodSelect.isVisible()) {
 *   await calculationMethodSelect.selectOption('AREA_VOLUME');
 * }
 * ```
 *
 * 数量表を作成した直後の編集画面には数量グループも数量項目も無く、計算方法の選択欄は
 * そもそも描画されない。したがって前提の設定も後段の判定も両方飛び、**何も主張しないまま
 * 緑になる**。
 *
 * 本補助は前提を「表示されていれば」ではなく「作って、成立するまで待って主張する」形で
 * 用意する。行を返すため、後段の欄参照も行スコープになり、画面全体を指す
 * `page.getByLabel()` が複数行に一致して壊れることも起きない。
 *
 * 編集はクライアントドラフトのみを更新し保存しない（REQ-42）ため、テスト間で数量グループが
 * 残留することはない。呼び出し側は常に「グループ0件」の編集画面から始まる。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param quantityTableId 事前準備で作成した数量表のID
 * @returns 追加した数量項目の行
 * @throws 前提のいずれかが用意できない場合
 */
export async function openEditPageWithSingleItemRow(
  page: Page,
  quantityTableId: string | null
): Promise<Locator> {
  await openQuantityTableEdit(page, quantityTableId);

  const groupCard = await addQuantityGroup(page);
  const itemRows = await addQuantityItemRows(groupCard, 1);
  return itemRows.first();
}

/**
 * 現場調査を作成し、写真をアップロードして、指定のコメントを付け、指定の写真へ注釈を保存する。
 *
 * 写真コメントの検証（REQ-35）は「コメントの付いた写真」を前提とするが、画面から
 * コメントを付ける導線は現場調査側にあり、数量表の検証としては遠回りになる。
 * 前提の生成はAPIで行い、成立（枚数とコメント）を応答で主張する。
 *
 * ## 注釈の保存が前提に含まれる理由（Task 82.1）
 *
 * 写真選択・変更ダイアログの取得経路 `GET /api/projects/:projectId/survey-images`
 * （Task 75.1）は**注釈レコードが存在する写真のみ**を返す（Requirement 4.3 / 19.2）。
 * 注釈を保存しないままでは選択候補が0件になり、ダイアログを用いる検証は前提段階で
 * 成立しない。`annotate` を**必須の引数**としているのは、新たな呼び出し側が指定を
 * 忘れて「候補0件の前提」を再生産することを型で防ぐためである。
 *
 * 注釈の有無そのものを検証の関心に持つ呼び出し側（「注釈付きのみが現れる」を主張する
 * 検証）は、`'all'` ではなく位置指定を渡し、注釈なし写真を併せて残すこと。全件を
 * 注釈付きにすると「注釈なしは現れない」が空集合に対する恒真になる。
 *
 * @param page Playwright のページ（ログイン済みであること）
 * @param projectId 現場調査を作成する対象のプロジェクトID
 * @param namePrefix 現場調査名の接頭辞
 * @param comments 写真ごとのコメント（配列の長さがアップロードする枚数になる）
 * @param annotate 注釈を保存する対象（`'all'` / `'none'` / 表示順の位置。省略不可）
 * @returns 作成した現場調査のID・アップロードした画像のID一覧・注釈を付けた画像のID一覧
 * @throws 現場調査が作成できない・アップロードが失敗する・コメントが反映されない・
 *         注釈が保存できない場合
 */
export async function seedSurveyPhotosWithComments(
  page: Page,
  projectId: string,
  namePrefix: string,
  comments: readonly (string | null)[],
  annotate: AnnotationTargets
): Promise<{ surveyId: string; imageIds: string[]; annotatedImageIds: string[] }> {
  await page.goto(`/projects/${projectId}/site-surveys/new`);
  await page.waitForLoadState('networkidle');

  const nameField = page.getByLabel(/調査名/i);
  await expect(nameField, '前提: 現場調査名の入力欄が表示される').toBeVisible({
    timeout: getTimeout(15000),
  });
  await nameField.fill(`${namePrefix}_${Date.now()}`);

  const createSurveyPromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/') &&
      response.url().includes('site-surveys') &&
      response.request().method() === 'POST',
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: /^作成$/i }).click();
  await createSurveyPromise;

  await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
  const surveyId = page.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
  assertPrepared(surveyId, '作成した現場調査のID');

  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
  assertPrepared(accessToken, 'アクセストークン');

  const testImagePath = path.join(__dirname, '../fixtures/test-image.png');
  expect(fs.existsSync(testImagePath), '前提: テスト用画像が存在する').toBeTruthy();
  const imageBuffer = fs.readFileSync(testImagePath);

  const form = new FormData();
  comments.forEach((_, index) => {
    form.append(
      'images',
      new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }),
      `${namePrefix}-${index + 1}.png`
    );
  });

  const uploadResponse = await page.request.post(
    `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
    { headers: { Authorization: `Bearer ${accessToken}` }, multipart: form }
  );
  expect(
    uploadResponse.ok(),
    `前提: 写真のアップロードが成功する (status=${uploadResponse.status()})`
  ).toBeTruthy();

  const uploaded = (await uploadResponse.json()) as {
    successful?: Array<{ id: string }>;
    failed?: unknown[];
  };
  const imageIds = (uploaded.successful ?? []).map((image) => image.id);
  expect(imageIds.length, `前提: 写真が${comments.length}枚アップロードされる`).toBe(
    comments.length
  );

  for (const [index, comment] of comments.entries()) {
    if (comment === null) continue;
    const imageId = imageIds[index];
    assertPrepared(imageId, `${index + 1}枚目の画像ID`);
    const patchResponse = await page.request.patch(
      `${API_BASE_URL}/api/site-surveys/images/${imageId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { comment },
      }
    );
    expect(
      patchResponse.ok(),
      `前提: ${index + 1}枚目の写真コメントが設定される (status=${patchResponse.status()})`
    ).toBeTruthy();
    const patched = (await patchResponse.json()) as { comment?: string | null };
    expect(patched.comment, `前提: ${index + 1}枚目の写真コメントが保存される`).toBe(comment);
  }

  // 選択候補として現れるのは注釈レコードを持つ写真のみであるため、注釈の保存までを前提に含める
  const annotatedImages = await annotateSurveyImages(page, surveyId, annotate);
  const annotatedImageIds = annotatedImages.map((image) => image.id);

  return { surveyId, imageIds, annotatedImageIds };
}

/**
 * 数量グループへ写真を紐づけ、サムネイルの表示まで主張する。
 *
 * 紐づけはクライアントドラフトの更新に留まる（REQ-42.3）。永続化が必要かどうかは
 * 呼び出し側の前提によって異なるため、保存（`saveQuantityTableDraft`）は呼び出し側が行う。
 *
 * @param page Playwright のページ（数量表の編集画面に居ること）
 * @param groupCard 対象の数量グループのカード
 * @param photoIndex 写真選択ダイアログで選ぶ写真の位置（0起点）
 * @returns 紐づけた写真のファイル名
 * @throws ダイアログが開かない・候補が無い・サムネイルが出ない場合
 */
export async function attachPhotoToGroup(
  page: Page,
  groupCard: Locator,
  photoIndex: number
): Promise<string> {
  const placeholder = groupCard.locator('[data-testid^="image-placeholder-"]').first();
  await expect(placeholder, '前提: 写真未紐付けのプレースホルダーが表示される').toBeVisible({
    timeout: getTimeout(10000),
  });
  await placeholder.click();

  const dialog = page.getByRole('dialog', { name: '写真を選択' });
  await expect(dialog, '前提: 写真選択ダイアログが開く').toBeVisible({
    timeout: getTimeout(10000),
  });

  const photoItem = dialog.locator('[data-testid^="photo-item-"]').nth(photoIndex);
  await expect(photoItem, `前提: ${photoIndex + 1}番目の選択候補の写真が表示される`).toBeVisible({
    timeout: getTimeout(20000),
  });
  const fileName = await photoItem.getAttribute('alt');
  assertPrepared(fileName, '選択した写真のファイル名');

  await photoItem.click();
  await expect(dialog, '前提: 写真の選択でダイアログが閉じる').not.toBeVisible({
    timeout: getTimeout(10000),
  });

  await expect(
    groupCard.locator(`img[alt="${fileName}"]`).first(),
    '前提: 紐づけた写真がグループに表示される'
  ).toBeVisible({ timeout: getTimeout(10000) });

  return fileName;
}
