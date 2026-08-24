/**
 * @fileoverview オートコンプリート最適化のE2Eテスト
 *
 * Task 18.2: オートコンプリート最適化のE2Eテストを実装する
 *
 * 対象要件: Requirement 7「入力支援・オートコンプリート」
 * Requirements coverage (quantity-table-generation):
 * - REQ-7.1: 初回表示時に対象9フィールドの入力履歴を一括取得し候補値リストとして保持する
 * - REQ-7.2: 候補値の取得APIは初回表示時の1回のみで、テキスト入力中は発行しない
 * - REQ-7.3: 対象フィールドの焦点獲得時に候補をドロップダウン表示する
 *            （空欄なら全候補、値があれば前方一致でフィルタリング）
 * - REQ-7.3a: 焦点がある状態での入力に応じて前方一致の候補へリアルタイムに絞り込む
 * - REQ-7.4: 候補が選択されると該当フィールドへ自動入力する
 * - REQ-7.5: blur 時に入力値を確定値として候補値リストへ追加する（既存の値は重複追加しない）
 * - REQ-7.6: blur 時の候補値リスト更新をクライアントサイドのみで行いAPIリクエストを発行しない
 * - REQ-7.7: 同一フィールドで複数の候補があるとき50音順に表示する
 *
 * design.md `Error Handling` > `Error Categories and Responses` >「オートコンプリート関連エラー」:
 * - 初回候補取得失敗時は補完を無効化し手入力のみで運用する（graceful degradation）
 *
 * ## 本ファイルが判定していないもの（Task 115.134）
 *
 * - REQ-7.1 の「GROUP BY で重複排除して一括取得する」の**重複排除の手段**: 画面から
 *   観測できるのは応答が対象9フィールド分の候補配列を返すことまでで、それがSQLの
 *   GROUP BY で得られたかは判定できない。バックエンドの統合テストの領分である。
 * - 上下キーによる選択と Enter 確定という**操作そのもの**: requirements.md の
 *   Requirement 7 に対応する条項が無い。本ファイルはキーボードを REQ-7.4
 *   「オートコンプリート候補が選択される」経路の一つとして扱い、確定後に値が
 *   自動入力されることだけを要件として主張する。
 *
 * Task 115.127 段1: 前提の生成を共通の補助（`quantity-table-preconditions`）へ寄せ、
 * `test.skip(!testProjectId, …)` 12 件を `assertPrepared(createdQuantityTableId, …)` へ改めた。
 * 併せて「数量表IDがあれば編集画面、無ければプロジェクト詳細」の分岐を除いた（前提は必ず在る）。
 *
 * Task 115.134: 残っていた観測条件（`if (await x.isVisible())` 2箇所）と固定時間待機
 * （`waitForTimeout` 4箇所）を除き、要件番号・テスト名・主張の食い違いを解消した。
 * 併せて、呼ばれ得ない旧個別エンドポイントを数えていた恒真の主張を、実際に発行され得る
 * 補完リクエスト全体を数える主張へ改めた（backend の補完ルートは
 * `autocomplete-candidates` の一本しか無い）。
 *
 * Task 115.134（是正）: REQ-7.4 の2件（クリック経路・キーボード経路）が間欠的に落ちて
 * いた。原因は再試行単位（`toPass`）の内側に**期限の無い待ち**を置いていたことである。
 * 遅延クローズで一覧が消えた周回の `option.click()` / `selectedOption.textContent()` が
 * 既定の `actionTimeout`（＝再試行の予算と同じ長さ）まで待ち続け、一周で予算を使い切って
 * 二周目が始まらなかった（詳細は `BOUNDED_STEP_TIMEOUT_MS` の説明）。併せて、選ぶ対象が
 * 在ること自体を前提として主張する `assertCandidateOffered` を要件の主張の手前へ置き、
 * 候補登録の失敗が REQ-7.4 の名前で現れる構造を解消した。
 *
 * @module e2e/specs/quantity-tables/autocomplete-optimization.spec
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { assertPresent } from '../../helpers/preconditions';
import {
  createTestProject,
  createTestQuantityTable,
  openEditPageWithSingleItemRow,
  openQuantityTableEdit,
} from '../../helpers/quantity-table-preconditions';

/**
 * REQ-7.1 の対象フィールド（一括取得の応答が返す候補値マップのキー）。
 *
 * 要件が列挙する9フィールド（大項目・中項目・小項目・任意分類・工種・名称・規格・単位・備考）に
 * 対応する。過不足の判定に用いるため、要件の列挙と一対一で保つこと。
 */
const AUTOCOMPLETE_FIELD_KEYS = [
  'majorCategory',
  'middleCategory',
  'minorCategory',
  'customCategory',
  'workType',
  'name',
  'specification',
  'unit',
  'remarks',
] as const;

/**
 * 補完対象フィールドへ確定値を入力し、blur で候補値リストへ登録させる（REQ-7.5）。
 *
 * 「表示されていれば入力する」形では、フィールドが描画されない限り登録も後段の判定も
 * 揃って飛ぶ。入力が保持されたことと焦点が外れたことを主張し、前提が崩れた地点で失敗させる。
 *
 * @param field 対象フィールド（`role="combobox"`）
 * @param value 登録する確定値（欄ごとの入力上限に収まること）
 */
async function registerCandidate(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await expect(field, `補完対象フィールドへ「${value}」が入力される`).toHaveValue(value);
  await field.blur();
  await expect(field, 'blur で補完対象フィールドから焦点が外れる').not.toBeFocused();
}

/**
 * 再試行のたびに入力値の変化を確実に起こすための中継値。
 *
 * 半角1文字であり、対象9フィールドのうち最も狭い単位欄（全角3文字/半角6文字）の
 * 上限にも収まる。`reopenSuggestions` に渡すどの入力値とも一致しない値を選ぶこと
 * （一致すると値の変化が起きず一覧が開き直らないため、当の補助が失敗させる）。
 */
const REOPEN_SENTINEL = 'z';

/**
 * 再試行単位（`toPass`）の内側で候補一覧に触れる操作へ与える期限。
 *
 * ## なぜ明示的に区切るのか（一周が再試行の予算を丸ごと使い切る）
 *
 * `handleBlur` が仕掛ける 150ms の遅延クローズは、その後に開いた一覧を**開いた直後に**
 * 閉じ得る（`readSuggestions` の説明を参照）。一覧が消えた状態で `click()` や
 * `textContent()` を呼ぶと、Playwright は要素が現れるまで待つ。この待ちの既定値は
 * `playwright.config.ts` の `actionTimeout`（ローカル15秒 / CI30秒）であり、
 * 再試行の予算（`toPass` の 15秒 / CI30秒）と同じである。したがって一周が予算を
 * 丸ごと使い切り、**二周目が始まらない**。`toPass` は再試行の形をしているのに
 * 一度も開き直せないまま、要件の名前（例: 「REQ-7.4: 候補をクリックすると値が
 * 自動入力される」）で落ちる。前提の崩れが要件の失敗として現れる構造である。
 *
 * 実測（Task 115.134 の是正時、`--retries=0` で4回中1回再現）でこの形に落ちた。
 * トレース上、`expect(listbox).toBeVisible` と `expect(option).toBeVisible` は
 * それぞれ 11ms / 5ms で成立し、直後の `textContent()` が 15003ms 待って失敗している。
 *
 * 周回内の待ちを短く区切れば、遅延クローズに負けた周回は速やかに失敗し、次の周回で
 * 開き直せる。再試行単位の内側に blur を起こす操作は無いため、遅延クローズが新たに
 * 仕掛けられることはなく、二周目以降は待ちの対象が残り続ける。
 */
const BOUNDED_STEP_TIMEOUT_MS = getTimeout(2000);

/**
 * 中継値を経由して目的の値を入れ直し、候補一覧を必ず開き直させる。
 *
 * React の入力値追跡は DOM の値が実際に変わらない限り `onChange` を発火させないため、
 * 既に同じ値が入っている欄へ同じ値を `fill` しても `handleInputChange` は呼ばれず、
 * 一覧は閉じたまま固定される（詳細は `readSuggestions` の説明を参照）。
 *
 * @param field 対象フィールド（`role="combobox"`）
 * @param inputText 最終的に入力する文字列（空文字なら全候補が対象になる）
 */
async function reopenSuggestions(field: Locator, inputText: string): Promise<void> {
  expect(inputText, '中継値と同じ入力値では値の変化を起こせない').not.toBe(REOPEN_SENTINEL);
  await field.fill(REOPEN_SENTINEL);
  await field.fill(inputText);
}

/**
 * 補完対象フィールドへ入力し、表示された候補の文字列を取り出す。
 *
 * 候補一覧は `document.body` 直下へ Portal で描画されるため、行ではなくページ配下で参照する。
 *
 * ## なぜ Locator ではなく文字列を返すのか（遅延クローズが後から着弾する）
 *
 * `AutocompleteInput` が一覧を開く経路は二つしかない。焦点獲得（`handleFocus`。ただし
 * その時点の値に対する候補が1件以上ある場合のみ）と、入力の変化（`handleInputChange`）である。
 * 一方 `handleBlur` は 150ms 後に一覧を閉じる遅延処理を**無条件に**仕掛け、その後の
 * 再フォーカスや再入力でも取り消さない。したがって `registerCandidate` が仕掛けた遅延は、
 * その後に開いた一覧を**開いた直後に**閉じ得る。
 *
 * 開いた一覧の Locator を呼び出し側へ返すと、返した後に遅延クローズが着弾した時点で
 * 後段の主張が壊れる。実測（Task 115.127 段6 の実ブラウザ実行）でこの形に落ちた。
 * 一覧の可視は満たしたのに、直後の `getByRole('option')` が 5 秒間 0 件のままとなり、
 * 失敗時の画面は「欄は focused・listbox は DOM に不在」だった。
 *
 * そこで**一覧に依存する読み取りまでを一つの再試行単位に閉じ込め**、呼び出し側へは
 * 素の文字列を渡す。閉じられても次の周回で開き直せるため、後段の主張は時間に左右されない。
 *
 * ## 中継値を挟む理由（同じ値を入れ直しても一覧は開かない）
 *
 * React の入力値追跡は DOM の値が実際に変わらない限り `onChange` を発火させない。
 * 既に同じ値が入っている欄へ同じ値を `fill` しても `handleInputChange` は呼ばれず、
 * 欄は焦点を持ったままなので `handleFocus` も再発火せず、一覧は閉じたまま固定される。
 * 中継値を経由して目的の値へ入れ直し、再試行のたびに**必ず値の変化を起こす**。
 *
 * ## 取り出した結果そのものを再試行単位の中で主張する
 *
 * 遅延クローズは「一覧が出ている」ことを確かめた**直後**にも着弾し得る。
 * 件数の主張と `allTextContents()` の間に着弾すると、取り出しは空配列を返すが
 * 再試行単位は例外を出さずに完了してしまい、**空のまま呼び出し側へ渡る**。
 * 実測（Task 115.127 段6 の実ブラウザ実行）でこの形に落ちた。受領値は `Array []` で、
 * 中継値の混入ではなく取り出しが空だったことがログから確かめられる。
 * そこで取り出した結果が空でないことと、取り出し後も一覧の件数が一致していることを
 * **再試行単位の中で**主張する。破れていれば次の周回で開き直す。
 *
 * 本補助は「候補が1件以上あるはず」の場面専用である。呼び出し側はいずれも直前に
 * `registerCandidate` で候補を登録しており、候補0件を期待する呼び出しは無い。
 *
 * 期限内に一覧が開かなければ失敗させる（沈黙して抜ける経路を持たせない）。
 *
 * @param page Playwright のページ
 * @param field 対象フィールド（`role="combobox"`）
 * @param inputText 入力する文字列（空文字なら全候補が対象になる）
 * @returns 表示された候補の文字列（表示順）
 */
async function readSuggestions(page: Page, field: Locator, inputText: string): Promise<string[]> {
  const listbox = page.getByRole('listbox');
  let suggestions: string[] = [];
  await expect(async () => {
    await reopenSuggestions(field, inputText);
    await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

    const options = listbox.getByRole('option');
    await expect(options).not.toHaveCount(0, { timeout: getTimeout(1000) });

    const captured = await options.allTextContents();
    // 取り出しの最中に遅延クローズが着弾すると空になる。空を返すと呼び出し側の
    // 集合比較が「候補が無い」ことを見逃すため、取り出した結果そのものを主張する。
    expect(captured, '候補一覧から候補を取り出せる').not.toHaveLength(0);
    // 取り出した後も一覧が保たれていること（途中で閉じていない）を確かめる。
    await expect(options, '取り出した件数と一覧の件数が一致する').toHaveCount(captured.length, {
      timeout: getTimeout(1000),
    });

    suggestions = captured;
  }, 'REQ-7.3a: 入力に対応する候補一覧が表示される').toPass({ timeout: getTimeout(15000) });
  return suggestions;
}

/**
 * **前提**として、直前に登録した確定値が候補として提示されることを確かめる（REQ-7.5 の成立）。
 *
 * REQ-7.4（候補の選択で値が自動入力される）を判定する前に、選ぶ対象そのものが在ることを
 * 要件の主張とは別に確かめる。`registerCandidate` は「入力が保持された」「焦点が外れた」
 * ことしか主張しておらず、候補値リストへの登録が成立したかは見ていない。登録が失敗して
 * いれば後段の再試行を何周重ねても候補は現れず、REQ-7.4 の名前で落ちて原因を取り違える。
 *
 * 前提が崩れた場合は前提の名前で落ちる。
 *
 * @param field 対象フィールド（`role="combobox"`）
 * @param listbox 候補一覧（`document.body` 直下の Portal）
 * @param option 提示されているはずの候補
 * @param inputText 候補を絞り込むために入力する文字列
 */
async function assertCandidateOffered(
  field: Locator,
  listbox: Locator,
  option: Locator,
  inputText: string
): Promise<void> {
  await expect(async () => {
    await reopenSuggestions(field, inputText);
    await expect(listbox, '前提: 候補一覧が開く').toBeVisible({
      timeout: BOUNDED_STEP_TIMEOUT_MS,
    });
    await expect(option, '前提: 登録した確定値が候補として現れる').toBeVisible({
      timeout: BOUNDED_STEP_TIMEOUT_MS,
    });
  }, '前提: REQ-7.5 の blur で登録した確定値が候補値リストへ入っている').toPass({
    timeout: getTimeout(15000),
  });
}

/**
 * 補完対象フィールドを空にする（焦点獲得時の「空欄なら全候補」を判定する前処理）。
 *
 * 空のまま blur しても `handleBlur` は空文字を候補へ登録しないため、候補値リストは変わらない。
 *
 * @param field 対象フィールド（`role="combobox"`）
 */
async function clearField(field: Locator): Promise<void> {
  await field.fill('');
  await expect(field, '補完対象フィールドが空になる').toHaveValue('');
}

/**
 * **入力を伴わない焦点獲得だけ**で開いた候補一覧の文字列を取り出す（REQ-7.3）。
 *
 * `readSuggestions` は値を入れ直して `handleInputChange` の経路で一覧を開くため、
 * 「フォーカスが当たる → 候補をドロップダウン表示する」という REQ-7.3 の規範そのものは
 * 判定できない。本補助は `handleFocus` の経路だけを通す。
 *
 * `handleBlur` は 150ms 後に一覧を閉じる遅延処理を無条件に仕掛け、再フォーカスでも
 * 取り消さない。着弾前に焦点を戻すと、焦点獲得で開いた一覧が直後に閉じられる。
 * そこで一度焦点を外し、一覧が **DOM から消えた**（＝遅延クローズが着弾しきった）ことを
 * 確かめてから焦点を当て直す。一覧は閉じると unmount されるため件数0で判定できる。
 *
 * 本補助は「候補が1件以上あるはず」の場面専用である。期限内に一覧が開かなければ失敗させる。
 *
 * @param page Playwright のページ
 * @param field 対象フィールド（`role="combobox"`）
 * @returns 焦点獲得で表示された候補の文字列（表示順）
 */
async function readSuggestionsOnFocus(page: Page, field: Locator): Promise<string[]> {
  const listbox = page.getByRole('listbox');
  let suggestions: string[] = [];
  await expect(async () => {
    await field.blur();
    await expect(listbox, '再度の焦点獲得の前に候補一覧が閉じている').toHaveCount(0, {
      timeout: getTimeout(2000),
    });

    await field.click();
    await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

    const options = listbox.getByRole('option');
    const captured = await options.allTextContents();
    // 取り出しの最中に遅延クローズが着弾すると空になる（`readSuggestions` と同じ理由）。
    expect(captured, '候補一覧から候補を取り出せる').not.toHaveLength(0);
    await expect(options, '取り出した件数と一覧の件数が一致する').toHaveCount(captured.length, {
      timeout: getTimeout(1000),
    });

    suggestions = captured;
  }, 'REQ-7.3: 焦点獲得で候補一覧が表示される').toPass({ timeout: getTimeout(15000) });
  return suggestions;
}

/**
 * オートコンプリート最適化E2Eテスト
 */
test.describe('オートコンプリート最適化', () => {
  // 並列実行を無効化（データベースの競合を防ぐ）
  test.describe.configure({ mode: 'serial' });

  // テストで作成したリソースのIDを保存
  let createdQuantityTableId: string | null = null;

  test.beforeEach(async ({ context }) => {
    // テスト間の状態をクリア
    await context.clearCookies();
  });

  /**
   * 事前準備: テスト用プロジェクトと数量表を作成
   *
   * Task 115.127 段1: 前提の生成は共通の補助（`quantity-table-preconditions`）へ寄せる。
   * 作れなければ補助の内側で失敗するため、前提が崩れたまま後段へ進む経路が無い。
   */
  test.describe('事前準備', () => {
    test('テスト用プロジェクトと数量表を作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const projectId = await createTestProject(page, 'AC最適化テスト');
      const quantityTable = await createTestQuantityTable(page, projectId, 'AC最適化テスト数量表');
      createdQuantityTableId = quantityTable.id;
    });
  });

  // ==========================================================================
  // REQ-7.1 / REQ-7.2: 初回表示時に対象9フィールドの候補が一括取得されること
  // ==========================================================================

  test.describe('REQ-7.1/7.2: 候補の一括取得', () => {
    test('初回表示で対象9フィールドの候補が一括取得され取得APIは1回だけ呼ばれる', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 監視は遷移の前に始める（初回表示の取得そのものを数えるため）
      const candidateRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/autocomplete-candidates')) {
          candidateRequests.push(request.url());
        }
      });

      const candidatesPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/autocomplete-candidates') &&
          response.request().method() === 'GET',
        { timeout: getTimeout(30000) }
      );

      // 数量表編集画面に遷移（編集領域の表示までを補助が主張する）
      await openQuantityTableEdit(page, createdQuantityTableId);

      const candidatesResponse = await candidatesPromise;
      expect(candidatesResponse.status(), 'REQ-7.1: 候補の一括取得が成功する').toBe(200);

      // REQ-7.1: 対象9フィールドそれぞれの候補値リストが返る。
      // 以前は 4 フィールドだけを確かめており、小項目・任意分類・名称・規格・備考が
      // 欠けても緑のままだった（要件が列挙する対象は9フィールドである）。
      const body = (await candidatesResponse.json()) as { candidates?: Record<string, unknown> };
      expect(body, 'REQ-7.1: 応答に候補値リストが含まれる').toHaveProperty('candidates');
      const candidates = body.candidates ?? {};
      expect(
        Object.keys(candidates).sort(),
        'REQ-7.1: 候補値リストは対象9フィールドで過不足がない'
      ).toEqual([...AUTOCOMPLETE_FIELD_KEYS].sort());
      for (const field of AUTOCOMPLETE_FIELD_KEYS) {
        expect(
          Array.isArray(candidates[field]),
          `REQ-7.1: ${field} の候補値リストが配列として返る`
        ).toBe(true);
      }

      // REQ-7.2: 候補値の取得APIは初回表示時の1回のみである
      expect(candidateRequests, 'REQ-7.2: 候補取得APIは初回表示時の1回だけ呼ばれる').toHaveLength(
        1
      );
    });
  });

  // ==========================================================================
  // REQ-7.2: テキスト入力中に候補取得のAPIリクエストが発生しないこと
  // ==========================================================================

  test.describe('REQ-7.2: クライアントサイドフィルタリング', () => {
    test('テキスト入力中に候補取得のAPIリクエストを発行しない', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「項目追加ボタンが見えたら押す」「入力欄が見えたら入力する」の二重の観測で
      // 包まれており、欄が描画されなければ一度も入力しないまま「リクエスト0件」が成立した。
      // さらに数えていたのは `/api/autocomplete/major-categories` などの旧個別エンドポイントで、
      // backend の補完ルートは `autocomplete-candidates` の一本しか無い（frontend にも
      // 呼び出す経路が無い）。呼ばれ得ない先を数えるのは恒真である。
      // 前提を無条件に作り、絞り込みが実際に起きたことを主張したうえで、補完に関わる
      // あらゆるリクエストが0件であることを主張する。
      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 監視は入力の前に始める（初回表示の一括取得は既に完了している）
      const autocompleteApiRequests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/autocomplete')) {
          autocompleteApiRequests.push(url);
        }
      });

      // REQ-7.5: blur で確定値を候補値リストへ追加する
      await registerCandidate(majorCategoryInput, '建築工事');

      // REQ-7.3a: 入力に前方一致する候補へ絞り込まれる（＝絞り込みが実際に起きている）
      const suggestions = await readSuggestions(page, majorCategoryInput, '建');
      expect(suggestions, 'REQ-7.3a: 入力に前方一致する候補が表示される').toEqual(['建築工事']);

      // REQ-7.2: テキスト入力中に候補取得のAPIリクエストを発行しない
      expect(
        autocompleteApiRequests,
        'REQ-7.2: 入力中に補完のAPIリクエストが発行された'
      ).toHaveLength(0);
    });
  });

  // ==========================================================================
  // REQ-7.4: 候補選択時にフィールドに値が自動入力されること
  // ==========================================================================

  test.describe('REQ-7.4: 候補選択時の自動入力', () => {
    test('候補をクリックするとフィールドに値が自動入力される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // 以前は「項目追加ボタンが見えたら押す」「入力欄が見えたら入力する」「一覧が出たら
      // 候補を探す」「候補が見えたら押す」の四重の観測で包まれており、どこか一つでも
      // 満たされなければ REQ-7.4 の判定は一つも実行されずに緑になった。
      // 前提（グループ1件・項目1行）は補助で作り、判定は同ファイルの REQ-7.5 と同じく
      // 一連の操作を一つの再試行単位へ閉じ込める（遅延クローズ対策。readSuggestions 参照）。
      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.5: blur で確定値を候補値リストへ追加する
      await registerCandidate(majorCategoryInput, '建築工事');

      const listbox = page.getByRole('listbox');
      const option = listbox.getByRole('option', { name: '建築工事', exact: true });

      // 前提: 選ぶ対象そのものが在ること（候補値リストへの登録が成立していること）を
      // 要件の主張とは別に確かめる。登録が失敗・遅延していれば後段の再試行を何周
      // 重ねても候補は現れず、REQ-7.4 の名前で落ちて原因を取り違える。
      await assertCandidateOffered(majorCategoryInput, listbox, option, '建');

      await expect(async () => {
        // REQ-7.3a: 前方一致する候補がドロップダウン表示される
        await reopenSuggestions(majorCategoryInput, '建');
        await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

        await expect(option, '前方一致する候補が一覧に現れる').toBeVisible({
          timeout: getTimeout(1000),
        });

        // REQ-7.4: 候補を選択すると値がフィールドへ自動入力される。
        // 一覧に触れる操作には周回内の期限を与える（既定の actionTimeout は15秒で
        // 再試行の予算と同じであり、一周が予算を使い切ってしまう。BOUNDED_STEP_TIMEOUT_MS 参照）。
        await option.click({ timeout: BOUNDED_STEP_TIMEOUT_MS });
        await expect(majorCategoryInput, 'REQ-7.4: 選択した候補が入力される').toHaveValue(
          '建築工事',
          { timeout: getTimeout(1000) }
        );
      }, 'REQ-7.4: 候補をクリックすると値が自動入力される').toPass({
        timeout: getTimeout(15000),
      });
    });
  });

  // ==========================================================================
  // REQ-7.4: キーボードで候補を選択して確定できること
  //
  // 上下キー・Enter という操作そのものは requirements.md の Requirement 7 に条項が無い。
  // ここではキーボードを「オートコンプリート候補が選択される」経路の一つとして扱い、
  // 選択した候補がフィールドへ自動入力されること（REQ-7.4）を要件として主張する。
  // ==========================================================================

  test.describe('REQ-7.4: キーボードによる候補選択', () => {
    test('上下キーで候補を選択しEnterで確定できる', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // REQ-7.5: blur で確定値を候補値リストへ追加する
      await registerCandidate(majorCategoryInput, '建築工事');

      // 一覧を開いてから確定するまでを一つの再試行単位に閉じ込める。
      // `handleBlur` の遅延クローズは再フォーカスでも取り消されないため、途中で一覧が
      // 閉じるとキー操作が届かなくなる（Enter は一覧が閉じていると確定を行わない）。
      // 期限内に一連の操作が成立しなければ失敗する（沈黙して抜ける経路は無い）。
      const listbox = page.getByRole('listbox');

      // 前提: 選ぶ対象そのものが在ること（候補値リストへの登録が成立していること）を
      // 要件の主張とは別に確かめる（クリック経路の判定と同じ理由）。
      await assertCandidateOffered(
        majorCategoryInput,
        listbox,
        listbox.getByRole('option', { name: '建築工事', exact: true }),
        '建'
      );

      await expect(async () => {
        // REQ-7.3a: 前方一致する候補がドロップダウン表示される
        await reopenSuggestions(majorCategoryInput, '建');
        await expect(listbox).toBeVisible({ timeout: getTimeout(1000) });

        // 下矢印キーで候補が選択状態になる（REQ-7.4 の選択経路）
        await majorCategoryInput.press('ArrowDown');
        const selectedOption = listbox.getByRole('option', { selected: true });
        await expect(selectedOption, '上下キーで候補が選択状態になる').toBeVisible({
          timeout: getTimeout(1000),
        });
        // 一覧に触れる読み取りには周回内の期限を与える（BOUNDED_STEP_TIMEOUT_MS 参照）。
        // 既定の actionTimeout（15秒）のままでは、遅延クローズで消えた候補を待ち続けて
        // 一周が再試行の予算を使い切り、要件の名前で落ちて原因を取り違える。
        const selectedText = await selectedOption.textContent({
          timeout: BOUNDED_STEP_TIMEOUT_MS,
        });
        assertPresent(selectedText, '選択状態になった補完候補の文字列');

        // REQ-7.4: Enter で確定すると選択した候補がフィールドへ自動入力される
        await majorCategoryInput.press('Enter');
        await expect(majorCategoryInput, 'REQ-7.4: 選択した候補が入力される').toHaveValue(
          selectedText,
          { timeout: getTimeout(1000) }
        );
      }, 'REQ-7.4: 上下キーで選んだ候補を Enter で確定すると自動入力される').toPass({
        timeout: getTimeout(15000),
      });

      // 確定した値は候補として登録した値そのものである
      await expect(majorCategoryInput, 'REQ-7.4: 確定後の値が候補と一致する').toHaveValue(
        '建築工事'
      );
    });
  });

  // ==========================================================================
  // REQ-7.5 / REQ-7.6: blur時に入力値がクライアントサイドの候補リストに追加されること
  // ==========================================================================

  test.describe('REQ-7.5/7.6: blur時の候補追加', () => {
    test('blur時に入力値が候補へ重複なく追加され再入力時に候補として表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // blur時のAPIリクエストを監視（初回表示の一括取得は既に完了している）。
      // REQ-7.6 が禁じるのはメソッドを問わない「APIリクエストの発行」なので、
      // POST に限らず補完に関わるリクエストをすべて数える。
      const blurApiRequests: string[] = [];
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/autocomplete')) {
          blurApiRequests.push(url);
        }
      });

      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const uniqueValue = `テスト大項目_${Date.now()}`;
      await registerCandidate(majorCategoryInput, uniqueValue);

      // REQ-7.5 は「既に存在する値の場合は重複追加しない」ことも定めている。
      // 一度空にしてから同じ値を入れ直し、二度目の blur を確実に起こす
      // （同じ値をそのまま `fill` しても React の入力値追跡は変化を検知しない）。
      await clearField(majorCategoryInput);
      await registerCandidate(majorCategoryInput, uniqueValue);

      // REQ-7.6: blur時の候補値リスト更新はクライアントサイドのみで行う
      expect(blurApiRequests, 'REQ-7.6: blur時にAPIリクエストを発行した').toHaveLength(0);

      // REQ-7.5: blur で追加した値が再入力時に候補として現れ、二度 blur しても重複しない
      const suggestions = await readSuggestions(
        page,
        majorCategoryInput,
        uniqueValue.substring(0, 5)
      );
      expect(suggestions, 'REQ-7.5: blurで追加した値が重複なく候補に現れる').toEqual([uniqueValue]);
    });
  });

  // ==========================================================================
  // REQ-7.7: 候補が50音順で表示されること
  // ==========================================================================

  test.describe('REQ-7.7: 50音順表示', () => {
    test('候補が50音順でソートされて表示される', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 50音順の判定に意味を持たせるため、意図的に逆順で候補を登録する（REQ-7.5）
      const registeredValues = ['ウ工事', 'イ工事', 'ア工事'];
      for (const value of registeredValues) {
        await registerCandidate(majorCategoryInput, value);
      }

      // REQ-7.3: 空欄へ戻すと全候補が表示される
      const optionTexts = await readSuggestions(page, majorCategoryInput, '');

      // 登録した候補がすべて、それだけが並ぶ。
      // 母集団は二つの供給しか持たない。(1) サーバーの入力履歴
      // （`backend/src/routes/autocomplete.routes.ts:157-181` の groupBy。**永続化された**
      // 数量項目をプロジェクト単位で集計する）と、(2) blur 時のクライアント追加
      // （`useAutocompleteCandidateStore.ts:214-226`）である。本ファイルは数量表を
      // 保存しないため (1) は空、(2) はページ読み込みごとに初期化される。
      // したがって集合はこのテストが登録した3件に一意に定まる。
      expect(
        [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja')),
        'REQ-7.7 の並びを判定するため登録した候補が揃っている'
      ).toEqual([...registeredValues].sort((a, b) => a.localeCompare(b, 'ja')));

      // REQ-7.7: 候補は50音順に並ぶ
      expect(optionTexts, 'REQ-7.7: 候補が50音順に並ぶ').toEqual(
        [...optionTexts].sort((a, b) => a.localeCompare(b, 'ja'))
      );
    });
  });

  // ==========================================================================
  // 候補取得エラー時のgraceful degradation
  // ==========================================================================

  // requirements.md の Requirement 7 に候補取得失敗時の条項は無い。判定の根拠は
  // design.md `Error Handling` >「オートコンプリート関連エラー」の
  // 「初回候補取得失敗: オートコンプリート機能を無効化し手入力のみで運用」である。
  test.describe('候補取得エラー時のgraceful degradation', () => {
    test('候補取得エラー時に数量表編集機能自体は正常に動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      // autocomplete-candidatesリクエストをインターセプトしてエラーを返す
      await page.route('**/autocomplete-candidates', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // 以前は「項目追加ボタンが見えたら押す」「入力欄が見えたら入力する」の二重の観測で
      // 包まれていた。候補取得が 500 を返す状況で編集機能が壊れる（＝ボタンや入力欄が
      // 出ない）と、まさに検証したい退行の場合に何も主張せず緑になる。
      // グループ追加・項目追加・欄の表示までを補助で無条件に主張する。
      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(
        majorCategoryInput,
        'design.md「オートコンプリート関連エラー」: 候補取得が失敗しても入力欄は表示される'
      ).toBeVisible({ timeout: getTimeout(10000) });

      // テキスト入力が可能であることを確認
      await majorCategoryInput.fill('手入力テスト');
      await expect(
        majorCategoryInput,
        'design.md「オートコンプリート関連エラー」: 候補取得が失敗しても手入力は行える'
      ).toHaveValue('手入力テスト');

      // 補完は無効化される（候補値リストが空なので一覧は開かない）
      await expect(
        page.getByRole('listbox'),
        'design.md「オートコンプリート関連エラー」: 候補取得が失敗したら候補一覧は出ない'
      ).toHaveCount(0);

      // ルートインターセプトを解除
      await page.unroute('**/autocomplete-candidates');
    });
  });

  // ==========================================================================
  // REQ-7.3 / REQ-7.3a: 焦点獲得時の候補表示と入力中の絞り込み（Task 25.4）
  //
  // Task 115.134: 以前はここの2件が「フォーカスした際に」と名乗りながら、実際には
  // `readSuggestions`（値を入れ直して `handleInputChange` の経路で開く）でしか判定して
  // いなかった。REQ-7.3 が定めるのは焦点獲得そのもので候補が出ることなので、
  // 入力を伴わない `readSuggestionsOnFocus` で判定する。
  // ==========================================================================

  test.describe('REQ-7.3/7.3a: 焦点獲得時の候補表示', () => {
    test('空の対象フィールドにフォーカスした際に全候補がドロップダウン表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      await registerCandidate(majorCategoryInput, 'フォーカステスト大項目');
      await clearField(majorCategoryInput);

      // REQ-7.3: 空欄へ焦点が当たると全候補がドロップダウン表示される
      const suggestions = await readSuggestionsOnFocus(page, majorCategoryInput);
      expect(suggestions, 'REQ-7.3: 空欄への焦点獲得で全候補が表示される').toEqual([
        'フォーカステスト大項目',
      ]);
    });

    test('値ありの対象フィールドにフォーカスした際にフィルタリング済み候補が表示される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      // 前方一致する2件を登録する。最後の登録によりフィールドには「フィルタ」が残るため、
      // 続く焦点獲得は「値が入力されている場合」の経路になる。
      await registerCandidate(majorCategoryInput, 'フィルタテスト値A');
      await registerCandidate(majorCategoryInput, 'フィルタ');
      await expect(majorCategoryInput, '前提: フィールドに値が入っている').toHaveValue('フィルタ');

      // REQ-7.3: 値がある場合は前方一致する候補だけが表示される
      const suggestions = await readSuggestionsOnFocus(page, majorCategoryInput);
      expect(suggestions, 'REQ-7.3: 値ありの焦点獲得で前方一致する候補が表示される').toEqual([
        'フィルタテスト値A',
      ]);
    });

    test('フォーカス後にテキスト入力するとリアルタイムで候補がフィルタリング更新される', async ({
      page,
    }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);
      const majorCategoryInput = row.getByRole('combobox', { name: '大項目', exact: true });
      await expect(majorCategoryInput, '前提: 大項目の入力欄が表示される').toBeVisible({
        timeout: getTimeout(10000),
      });

      const registeredValues = ['リアルタイムA', 'リアルタイムB', '別の値'];
      for (const value of registeredValues) {
        await registerCandidate(majorCategoryInput, value);
      }

      // REQ-7.3a: 入力を空へ戻すと登録した全候補が表示される
      const allSuggestions = await readSuggestions(page, majorCategoryInput, '');
      expect(
        [...allSuggestions].sort((a, b) => a.localeCompare(b, 'ja')),
        '空欄では登録した全候補が表示される'
      ).toEqual([...registeredValues].sort((a, b) => a.localeCompare(b, 'ja')));

      // REQ-7.3a: 入力に応じて前方一致する候補へリアルタイムに絞り込まれる
      const filteredSuggestions = await readSuggestions(page, majorCategoryInput, 'リアルタイム');
      expect(filteredSuggestions, 'REQ-7.3a: 残るのは前方一致する候補だけである').toEqual([
        'リアルタイムA',
        'リアルタイムB',
      ]);
    });

    test('対象9フィールドすべてで焦点獲得時の候補表示が動作する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      const row = await openEditPageWithSingleItemRow(page, createdQuantityTableId);

      // 対象9フィールドと、各欄の入力上限（FIELD_CONSTRAINTS）に収まる登録値。
      // 単位は全角3文字/半角6文字が上限であり、他の欄と同じ長さの値は入力そのものが
      // 弾かれて候補が登録されない（REQ-13.3）。欄ごとに上限内の値を用いる。
      const targetFields: Array<{ label: string; value: string }> = [
        { label: '大項目', value: 'テスト大項目' },
        { label: '中項目', value: 'テスト中項目' },
        { label: '小項目', value: 'テスト小項目' },
        { label: '任意分類', value: 'テスト任意分類' },
        { label: '工種', value: 'テスト工種' },
        { label: '名称', value: 'テスト名称' },
        { label: '規格', value: 'テスト規格' },
        { label: '単位', value: '式' },
        { label: '備考', value: 'テスト備考' },
      ];

      for (const { label, value } of targetFields) {
        const input = row.getByRole('combobox', { name: label, exact: true });
        await expect(input, `前提: ${label}の入力欄が表示される`).toBeVisible({
          timeout: getTimeout(10000),
        });

        await registerCandidate(input, value);
        await clearField(input);

        // REQ-7.3: 空欄へ焦点が当たると当該フィールドの候補がドロップダウン表示される
        const suggestions = await readSuggestionsOnFocus(page, input);
        expect(suggestions, `REQ-7.3: ${label}の候補が表示される`).toEqual([value]);

        // 次のフィールドへ移る前に一覧を閉じる
        await input.blur();
      }
    });
  });
});
