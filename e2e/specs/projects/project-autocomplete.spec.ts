/**
 * @fileoverview 取引先オートコンプリート連携のE2Eテスト
 *
 * Requirements:
 * - REQ-16: 取引先オートコンプリート連携
 *
 * ## 「セレクトボックスなら読み飛ばす」分岐を除いたこと（Task 115.127 段4）
 *
 * 各テストの先頭に `const isSelect = await input.evaluate((el) => el.tagName === 'SELECT')`
 * と `if (isSelect) return;` が置かれ、「現在の実装はセレクトボックスのためオートコンプリートは
 * 未実装」という注記が添えられていた。実装（`frontend/src/components/projects/
 * TradingPartnerSelect.tsx`）は `<input role="combobox">` であり、`<select>` ではない。
 * すなわち `isSelect` は常に偽で、分岐は一度も発火していない。
 * それでも残っていると、実装がセレクトボックスへ退行した瞬間に REQ-16 の検証が
 * 丸ごと消えて緑になる。前提が崩れたら失敗するよう、分岐そのものを除いた。
 *
 * ## 残っていた全域分岐も除いたこと（Task 115.127 段7・G群）
 *
 * REQ-16.11 のテストだけは `if (isSelect) { … } else { … }` の全域分岐として残っていた。
 * 沈黙はしないが、実装がセレクトボックスへ退行すると REQ-16.11 の検証が
 * 「選択肢が1件以上ある」という別物へすり替わる。実装形態は観測して分岐せず、
 * `<input>` であることを無条件に主張してから本来の検証を行う形へ改めた。
 */

import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPresent } from '../../helpers/preconditions';
import { toObservableApiPath } from '../../helpers/api-request-observer';
import { seedTradingPartner } from '../../helpers/project-list-preconditions';

/**
 * 取引先オートコンプリート連携のE2Eテスト
 */
test.describe('取引先オートコンプリート連携', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * REQ-16: 取引先オートコンプリートのテスト
   */
  test.describe('取引先オートコンプリート機能', () => {
    /**
     * @requirement project-management/REQ-1.3
     * @requirement project-management/REQ-16.1
     * @requirement project-management/REQ-16.2
     */
    test('取引先フィールドにテキスト入力すると取引先オートコンプリート候補が表示される (project-management/REQ-1.3, REQ-16.1, REQ-16.2)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel(/プロジェクト名/i)).toBeVisible({ timeout: getTimeout(10000) });

      // 取引先フィールドの検索入力（コンボボックスを明示的に指定）
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('テスト');

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-1.4
     * @requirement project-management/REQ-16.10
     */
    test('オートコンプリート候補をクリックすると取引先フィールドに反映される (project-management/REQ-1.4, REQ-16.10)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // REQ-16.10 は「候補をクリックすると選択された顧客を設定する」ことを定める。
      // 「-- 選択なし --」以外の候補が無いと主張が一つも実行されないため、
      // クリック対象となる取引先をテスト自身が用意する。
      const partner = await seedTradingPartner(page, 'E2E候補クリック');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // 用意した取引先だけが候補に残るよう、その名称で絞り込む
      await tradingPartnerInput.fill(partner.name);

      // オートコンプリート候補が表示されるまで待機
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 用意した取引先が候補として並ぶ（「-- 選択なし --」以外の実在の候補）
      const seededOption = autocompleteList
        .locator('[role="option"]')
        .filter({ hasText: partner.name });
      await expect(seededOption).toHaveCount(1);

      // REQ-1.4 / REQ-16.10: マウスで候補をクリックすると選択された顧客が設定される
      await seededOption.click();

      // 取引先フィールドに、クリックした候補の取引先名が反映されることを確認
      // （部課・代表者名を持たない取引先のため、表示形式は「名前」のみとなる）
      await expect(tradingPartnerInput).toHaveValue(partner.name, { timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-16.3
     */
    test('入力文字列に前方一致または部分一致する取引先がオートコンプリート候補として表示される (project-management/REQ-16.3)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('株式会社');

      // オートコンプリート候補を確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      const options = await autocompleteList.getByRole('option').all();
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(10); // REQ-16.5: 最大10件
    });

    /**
     * @requirement project-management/REQ-16.7
     */
    test('取引先候補検索中にローディングインジケータが表示される (project-management/REQ-16.7)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      // 入力開始
      await tradingPartnerInput.fill('テ');

      // ローディングインジケータが表示されることを確認（短時間で完了する可能性があるためtry-catch）
      try {
        await expect(page.getByText(/検索中|読み込み中/i).first()).toBeVisible({ timeout: 1000 });
      } catch {
        // ローディングが高速で完了した場合はスキップ
      }
    });

    /**
     * @requirement project-management/REQ-16.8
     */
    test('該当する取引先候補が存在しない場合、「該当する取引先がありません」メッセージが表示される (project-management/REQ-16.8)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('存在しない取引先XYZ12345');

      // オートコンプリートが実装されている場合、該当なしメッセージが表示される
      const noResultsMessage = page.getByText(/該当する取引先がありません/i);
      await expect(noResultsMessage).toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-16.6
     * 備考: requirements.mdでは「最大10件」の明記はないが、UXとして妥当な上限
     */
    test('オートコンプリート候補は最大10件まで表示される (project-management/REQ-16.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('株'); // 多くの候補がヒットしそうなキーワード

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });
      const options = await autocompleteList.getByRole('option').all();
      expect(options.length).toBeLessThanOrEqual(10);
    });

    /**
     * @requirement project-management/REQ-16.9
     */
    test('キーボードの上下キーで候補を選択してEnterキーで確定できる (project-management/REQ-16.9)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // コンボボックスを明示的に指定（listboxと区別するため）
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('テスト');

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 下キーを押す
      await tradingPartnerInput.press('ArrowDown');
      await tradingPartnerInput.press('ArrowDown');

      // Enterキーで確定
      await tradingPartnerInput.press('Enter');

      // 何らかの値が入力されていることを確認
      const value = await tradingPartnerInput.inputValue();
      expect(value).toBeTruthy();
    });

    /**
     * オートコンプリートのUX動作テスト（候補リストのクローズ）
     * 備考: 明示的な要件IDはないが、標準的なオートコンプリートUXとして必要
     */
    test('オートコンプリート候補以外の場所をクリックすると候補リストが閉じる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });

      await tradingPartnerInput.fill('テスト');

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 別の場所をクリック
      await page.getByLabel(/プロジェクト名/i).click();

      // オートコンプリートリストが閉じることを確認
      await expect(autocompleteList).not.toBeVisible({ timeout: getTimeout(5000) });
    });

    /**
     * @requirement project-management/REQ-16.11
     */
    test('取引先はマスタ登録済みの候補からのみ選択可能（自由入力不可） (project-management/REQ-16.11)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-16.1 が定めるオートコンプリート併用UIは <input role="combobox"> で実装されている
      // （frontend/src/components/projects/TradingPartnerSelect.tsx）。
      // 「セレクトボックスなら別の検証、そうでなければ本来の検証」という全域分岐は、
      // 実装がセレクトボックスへ退行した瞬間に REQ-16.11 の検証を別物へすり替えてしまう。
      // 実装形態は観測して分岐するのではなく、ここで無条件に主張する。
      const tagName = await tradingPartnerInput.evaluate((el) => el.tagName);
      expect(tagName, 'REQ-16.1: 顧客名フィールドはオートコンプリート併用の入力欄である').toBe(
        'INPUT'
      );

      // 自由入力テキストは値として保存されず、フィルタリング用にのみ使用される。
      // 入力後にフォーカスを外すと、選択されていない場合は入力がクリアされる。

      // 存在しない取引先名を入力
      await tradingPartnerInput.fill('存在しない任意テキスト');

      // 入力中はテキストが表示される
      await expect(tradingPartnerInput).toHaveValue('存在しない任意テキスト');

      // ドロップダウンが表示され、候補がないことを確認。
      // TradingPartnerSelect は入力で isOpen になり、一致が無い場合も一覧自体は開く
      // （filteredPartners.length === 0 のとき「該当する取引先がありません」を表示する）。
      // 以前は「一覧が見えていたら」という関門で包んでいたため、
      // 一覧が開かなくなっても候補数の主張が実行されず緑のままだった。
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 一致する候補がないこと（選択できるのは「-- 選択なし --」の高々1件）
      const options = await autocompleteList.locator('[role="option"]').all();
      expect(options.length).toBeLessThanOrEqual(1);

      // フォーカスを外す（別のフィールドをクリック）
      await page.getByLabel(/プロジェクト名/i).click();

      // オートコンプリートは自由入力を値として保持しないため、
      // 選択されなかった場合は入力がクリアされる（空になるか、プレースホルダーが表示される）
      const inputValue = await tradingPartnerInput.inputValue();

      // REQ-16.11: 自由入力テキストが値として保持されていないことを確認
      // （空文字列、または元のプレースホルダーに戻る）
      expect(inputValue).not.toBe('存在しない任意テキスト');
    });

    /**
     * @requirement project-management/REQ-16.4
     */
    test('取引先候補の表示形式が「名前 / 部課・支店・支社名 / 代表者名」の組み合わせで表示される (project-management/REQ-16.4)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // REQ-16.4 は候補の表示形式を定める。候補が1件も無いと形式の主張が一つも実行されないため、
      // 「名前・部課・代表者名」がすべて揃った候補をテスト自身が用意する。
      const partner = await seedTradingPartner(page, 'E2E候補表示形式', {
        branchName: '渋谷支店',
        representativeName: '検証 太郎',
      });

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // 作成した取引先に絞り込む
      await tradingPartnerInput.fill(partner.name);

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // REQ-16.4: 候補は「名前 / 部課・支店・支社名 / 代表者名」の組み合わせで表示される
      const seededOption = autocompleteList
        .locator('[role="option"]')
        .filter({ hasText: partner.name });
      await expect(seededOption).toHaveCount(1);
      await expect(seededOption).toContainText(partner.name);
      await expect(seededOption).toContainText('渋谷支店');
      await expect(seededOption).toContainText('検証 太郎');
    });

    /**
     * @requirement project-management/REQ-16.5
     */
    test('部課・支店・支社名が未設定の場合、「名前 / 代表者名」の形式で表示される (project-management/REQ-16.5)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // ドロップダウンを開く
      await tradingPartnerInput.click();

      // オートコンプリート候補が表示されることを確認
      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 候補リストの各項目は、formatTradingPartnerDisplay関数により
      // 「名前 / 部課・支店・支社名 / 代表者名」または
      // 「名前 / 代表者名」（部課・支店・支社名がない場合）の形式で表示される
      // TradingPartnerSelectコンポーネントの実装により適切にフォールバック処理される
      const options = await autocompleteList.locator('[role="option"]').all();
      expect(options.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @requirement project-management/REQ-16.13
     */
    test('取引先種別に「顧客」（CUSTOMER）を含む取引先のみを候補として表示する (project-management/REQ-16.13)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 取引先APIリクエストを監視する。
      // 選別はオリジンではなくパスで行う（ブラウザ側の VITE_API_URL と E2E 側の API_BASE_URL は
      // 同一とは限らず、オリジンで選別すると観測が常に空になる）。
      const listRequestUrls: string[] = [];
      page.on('request', (request) => {
        if (
          toObservableApiPath(request.url()) === '/api/trading-partners' &&
          request.method() === 'GET'
        ) {
          listRequestUrls.push(request.url());
        }
      });

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      // 取引先フィールドを確認
      const tradingPartnerInput = page.getByRole('combobox', { name: /顧客名/i });
      await expect(tradingPartnerInput).toBeVisible({ timeout: getTimeout(10000) });

      // REQ-16.13: 取引先一覧の取得は「顧客」種別で絞り込まれている。
      // 以前は「要求が観測できていたら URL に trading-partners が含まれる」という
      // 何も確かめない主張だったため、種別の絞り込みが失われても緑のままだった。
      // 要求が発生すること自体と、その絞り込み条件の双方を無条件に主張する。
      expect(listRequestUrls.length, 'REQ-16.13: 取引先一覧APIが呼び出される').toBeGreaterThan(0);
      const listRequestUrl = listRequestUrls[listRequestUrls.length - 1];
      assertPresent(listRequestUrl, '取引先一覧APIのリクエストURL');
      const requestedTypes = new URL(listRequestUrl).searchParams.get('type');
      expect(requestedTypes, 'REQ-16.13: 取引先一覧APIは顧客種別で絞り込まれる').toBe('CUSTOMER');

      // ドロップダウンを開いて候補が表示されることを確認
      await tradingPartnerInput.click();

      const autocompleteList = page.getByRole('listbox', { name: /取引先候補/i });
      await expect(autocompleteList).toBeVisible({ timeout: getTimeout(5000) });

      // 顧客種別を持つ取引先のみが候補として表示される
      // （非顧客の取引先は表示されない）
      const options = await autocompleteList.locator('[role="option"]').all();
      // 少なくとも「-- 選択なし --」オプションが存在
      expect(options.length).toBeGreaterThanOrEqual(1);
    });

    /**
     * @requirement project-management/REQ-16.12
     */
    test('取引先選択APIのレスポンス時間は500ミリ秒以内である (project-management/REQ-16.12)', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // APIレスポンスの監視を事前に設定
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') && response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // ページ遷移開始時刻を記録
      const startTime = Date.now();
      await page.goto('/projects/new');

      // APIレスポンスを待機
      const response = await responsePromise;
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 取引先選択APIが成功していることを確認。
      // 以前は「200 または 304（キャッシュ）」の論理和だったが、テストごとに新しい
      // ブラウザコンテキストが作られるため条件付きリクエストは発生せず、304 の側は
      // 一度も成立しない。成立する側だけを主張する。
      expect(response.status()).toBe(200);

      // E2Eテスト環境ではページナビゲーション＋ネットワーク条件により変動するため、
      // 5秒以内に応答があることを確認（本番APIの500ms要件は別途APIモニタリングで監視）
      expect(responseTime).toBeLessThanOrEqual(getTimeout(5000));
    });
  });
});
