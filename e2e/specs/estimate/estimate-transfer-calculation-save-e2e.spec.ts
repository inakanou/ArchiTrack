/**
 * @fileoverview 転記・案分・利益率適用・諸経費追加・値引き追加のローカル完結と保存のE2Eテスト
 *
 * Task 55.9: 段階3（転記・計算のクライアント完結）の受入検証。
 *
 * 段階3で、受領見積書転記・NET金額案分・利益率適用・諸経費行追加・値引き行追加の5操作は
 * すべて「編集中のツリーに対する未保存の変更」になり、対応する5本の書き込みエンドポイントは
 * 撤去された（55.1〜55.7）。本 spec はその結果を**実ブラウザが送出したリクエスト**と
 * **画面に出た値**で確認する。
 *
 * 既存E2Eとの分担（本 spec を新設した理由）:
 * - `estimate-row-operation-overhead-e2e.spec.ts`（53.14）は行操作6種（挿入・削除・複写・
 *   並び替え・D&D・階層移動）のローカル完結で、転記・計算系の5操作には触れていない
 * - `estimate-hierarchy-keyboard-e2e.spec.ts`（54.11）は階層表示とキー操作が対象
 * - `estimate-reorder-overhead-e2e.spec.ts` は**諸経費追加のみ**を単独で扱う
 * - `net-allocation-dialog-e2e.spec.ts` は REQ-36（NET金額の自動設定）のみ、
 *   `transfer-quotation-dialog-e2e.spec.ts` は REQ-35（選択肢の表示形式）のみで、
 *   どちらも「適用してから保存する」ところまで通していない
 * - `profit-rate-dialog-e2e.spec.ts` はダイアログの入力要素のみを見る
 *
 * 本 spec が埋めるのは、既存のどれも通していない次の5点である。
 * 1. セル編集のあとに5操作を続けて行っても、**編集内容が消えない**こと（43.4, 49.2）
 * 2. 5操作のいずれの適用時にも**書き込みリクエストが0件**であること（49.1, 49.3）
 * 3. **未保存の新規行**が転記先・案分対象・利益率適用対象になること（5.9, 6.9, 49.7）。
 *    諸経費行追加・値引き行追加は行を「対象に取る」操作ではなく行を**生む**操作なので、
 *    生まれた行自身がサーバーIDを持たない未保存の新規行（`tmp-*`）であり、
 *    同じ1回の保存で確定することをもって 49.7 の対応とする
 * 4. 適用後の保存が**1リクエスト**で成功し、競合にならないこと（49.4, 49.5）
 * 5. ダイアログの**プレビューに出た値**が、適用後の画面値および**保存後に再読み込みした値**と
 *    一致すること（5.8, 6.8, 34.6）
 *
 * ## 「書き込み0件」の観測窓が空振りしないための作り
 *
 * 「0件であること」は、観測窓が早く閉じても・リスナーが外れていても真になってしまう。
 * そこで窓は**一連の操作の前に開き、最後の保存まで開けたまま**にして、最終的に
 * 記録された系列が `POST /:id/calculate-overhead`（書き込みを伴わない諸経費の算定）と
 * `PUT /:id/save` の**ちょうど2件**であることを確認する（53.14 で確立し 54.11 が
 * 補強した数え方）。リスナーが死んでいれば最後の1件も記録されず、この検証が落ちる。
 * 窓を閉じる契機は `estimate-unsaved-indicator` の消滅（`useEstimateEditor.save` が
 * `await onSave(...)` の解決後に `isDirty` を下げる）で、`networkidle` は
 * ナビゲーションが無い局面では即座に返るため使わない。
 *
 * ## 期待値の導き方（固定値の根拠）
 *
 * 案分後金額・案分率・利益率適用後の単価は、**実装とは独立に有理数（BigInt）で
 * 厳密計算**した値を固定値として持つ。次の3点が「たまたま一致した」ではないことの
 * 弁別子になっている。
 * - 案分後金額の合計がNET金額（400,000円）にちょうど一致する
 * - どの行も 数量 × 案分後単価 ≠ 案分後金額（223,143 / 109,914 / 66,944 になる）ため、
 *   金額が案分結果そのものであって単価からの再計算ではないことを弁別する
 * - 既存行の案分後単価は 66,943 ÷ 2 = 33,471.5 で、`ROUND_HALF_UP`（ゼロから離れる方向）
 *   でなければ 33,472 にならない
 *
 * さらに案分の入力となる業者金額行の単価は**画面で書き換えてから**案分するため、
 * 保存済みの値（40,000円）で計算する実装ではどの期待値にも一致しない（5.8）。
 *
 * ## 5.4 / 5.5 の帰属をここへ移した経緯（Task 57.4）
 *
 * 5.4（案分計算による単価）と 5.5（案分後金額の実行金額行への表示）は、かつて
 * `estimate-e2e.spec.ts` の「REQ-5.4-5.5：NET金額入力とプレビュー」が担っていた。
 * だがその test は業者選択肢の件数を `if (vendorOptions > 1)` で見てから中身を実行する
 * 作りで、当該 spec の serial 順では業者金額行がまだ存在せず条件が常に偽になり、
 * 案分に触れる行が**一度も実行されないまま緑**になっていた。前提が欠けたら失敗する形に
 * できない以上、その test は削除し、5.4 / 5.5 の検証は本 spec の
 * 「未保存の新規行の対象化とプレビューの一致」に一本化する。本 spec は業者金額行を
 * 準備5と `resetItemTree` で必ず作り、業者が選べなければ `#vendor-select` の
 * `selectOption` が落ちるため、前提の欠落が黙って素通りしない。
 *
 * Requirements coverage (estimate-creation):
 * - REQ-5.4: NET金額が入力された場合、各実行金額行の単価をNET金額に基づいて案分計算する
 * - REQ-5.5: 案分計算が実行された場合、案分後の金額を自動計算して実行金額行に表示する
 * - REQ-5.8: 案分計算を編集中の業者金額行の値に基づいて行い、プレビューの案分後金額と反映される金額を一致させる
 * - REQ-5.9: 未保存の新規行が案分対象に含まれる場合、その行も案分対象として扱う
 * - REQ-6.8: 利益率適用を編集中の実行金額行の値に基づいて行い、プレビューの新しい単価と反映される単価を一致させる
 * - REQ-6.9: 未保存の新規行が適用対象に含まれる場合、その行も適用対象として扱う
 * - REQ-34.6: 転記・案分・利益率適用・諸経費追加・値引き追加の後に保存した場合、再読み込み後も反映後の内容を表示する
 * - REQ-43.4: これらの操作を行った場合、それまでの未保存の編集内容を保持する
 * - REQ-49.1: これらの操作の結果を未保存の変更として編集中の明細に反映する
 * - REQ-49.2: これらの操作で明細の再取得を行わず、それまでの未保存の編集内容を保持する
 * - REQ-49.4: これらの操作の後の保存操作で反映結果を1回の保存操作で確定する
 * - REQ-49.5: これらの操作の後の保存操作で競合エラーを発生させない
 * - REQ-49.7: これらの操作の計算対象に未保存の新規項目を含める
 *
 * @module e2e/specs/estimate/estimate-transfer-calculation-save-e2e.spec
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import {
  buildNewEstimateItemNode,
  buildSaveLine,
  findEstimateItemByName,
  getEstimateItemTree,
  getEstimateUpdatedAt,
  saveEstimateDraft,
  type EstimateItemNode,
  type SaveLineType,
  type SaveNodePayload,
} from '../../helpers/estimate-draft';

// ============================================================================
// フィクスチャ定義
// ============================================================================

/** 明細フィクスチャと転記元の名称 */
const NAME = {
  /** 案分対象になる保存済みの見積項目（見積金額行の名称） */
  vendorItem: '案分対象の既存行',
  /** 上の項目の業者金額行の名称（利益率適用の「すべて上書き」で見積金額行へ複写される） */
  vendorLine: '案分対象の業者行',
  /** どの操作の対象にもならない行（未保存編集の保持を見るための行） */
  keepEdit: '編集保持確認行',
  /** 受領見積書の明細行（＝転記後の業者金額行の名称） */
  transferA: '転記明細A',
  transferB: '転記明細B',
} as const;

/** 受領見積書の明細行（転記の入力） */
const QUOTATION_LINES = [
  { name: NAME.transferA, specification: '規格A', unit: '式', quantity: 3, unitPrice: 111111 },
  { name: NAME.transferB, specification: '規格B', unit: '式', quantity: 7, unitPrice: 23456 },
] as const;

/** 保存済みの業者金額行の単価（画面で書き換える前の値） */
const SAVED_VENDOR_UNIT_PRICE = 40000;

/** 画面で書き換えたあとの業者金額行の単価（案分はこちらに基づく / 5.8） */
const EDITED_VENDOR_UNIT_PRICE = 50000;

/** 案分するNET金額。受領見積書にも同じ値を入れて自動設定（36.1）と一致させる */
const NET_AMOUNT = 400000;

/** 利益率ダイアログの既定値（37.1） */
const PROFIT_RATE = '12.27';

/**
 * 案分・利益率適用の期待値
 *
 * 実装に依存せず有理数（BigInt）で厳密計算した固定値。
 * - 業者金額: A = 3 × 111,111 = 333,333 / B = 7 × 23,456 = 164,192 /
 *   C = 2 × 50,000 = 100,000（画面で書き換えた単価に基づく）→ 合計 597,525
 * - 案分後金額 = round(400,000 × 各金額 ÷ 597,525)、案分後単価 = round(案分後金額 ÷ 数量)
 * - 案分率(%) = round(各金額 ÷ 597,525 × 100, 小数2桁)
 * - 利益率適用後の単価 = round(案分後単価 × 1.1227)、金額 = round(実行金額行の数量 × 新単価)
 */
const EXPECTED = {
  A: {
    vendorAmount: 333333,
    ratio: '55.79%',
    allocatedAmount: 223142,
    allocatedUnitPrice: 74381,
    profitUnitPrice: 83508,
    profitAmount: 250524,
  },
  B: {
    vendorAmount: 164192,
    ratio: '27.48%',
    allocatedAmount: 109915,
    allocatedUnitPrice: 15702,
    profitUnitPrice: 17629,
    profitAmount: 123403,
  },
  C: {
    vendorAmount: 100000,
    ratio: '16.74%',
    allocatedAmount: 66943,
    allocatedUnitPrice: 33472,
    profitUnitPrice: 37579,
    profitAmount: 75158,
  },
} as const;

/** 値引き行に入力する単価（41.5: 負数を許容する） */
const DISCOUNT_UNIT_PRICE = -50000;

/**
 * 見積項目テーブル内の項目ラッパーを指すセレクタ
 *
 * 3行1セットの内側要素は `data-testid="estimate-item-row"` を持つため、前方一致だけでは
 * 項目ラッパー（`estimate-item-<key>`）と混ざる。明示的に除外する。
 */
const ROW_SELECTOR =
  '[aria-label="見積項目テーブル"] [data-testid^="estimate-item-"]:not([data-testid="estimate-item-row"])';

test.describe('転記・案分・利益率適用・諸経費追加・値引き追加のローカル完結と保存', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdTradingPartnerId: string | null = null;
  let createdItemizedStatementId: string | null = null;
  let createdEstimateRequestId: string | null = null;
  let createdReceivedQuotationId: string | null = null;
  let createdEstimateId: string | null = null;
  let tradingPartnerName: string = '';
  let accessToken: string = '';

  // ==========================================================================
  // 共通ヘルパー
  // ==========================================================================

  /**
   * 明細ツリーをフィクスチャの初期状態へ戻す
   *
   * - `vendorItem`: 業者金額行に協力業者名を持つ保存済みの行（案分対象になる）
   * - `keepEdit`: 実行金額行に単価を持たないため、案分にも利益率適用にも巻き込まれない行
   *   （未保存の編集がそのまま残ることを見るために使う）
   */
  const resetItemTree = async (page: Page): Promise<void> => {
    const vendorItem: SaveNodePayload = {
      id: null,
      tempId: 'e2e-vendor-item',
      itemType: 'STANDARD',
      lines: [
        buildSaveLine('ESTIMATE', { name: NAME.vendorItem, unit: '式', quantity: '2' }),
        buildSaveLine('EXECUTION', { name: NAME.vendorItem, unit: '式', quantity: '2' }),
        buildSaveLine('VENDOR', {
          name: NAME.vendorLine,
          specification: '規格C',
          unit: '式',
          quantity: '2',
          unitPrice: String(SAVED_VENDOR_UNIT_PRICE),
          amount: String(2 * SAVED_VENDOR_UNIT_PRICE),
          sourceVendorName: tradingPartnerName,
        }),
      ],
      children: [],
    };

    await saveEstimateDraft(page.request, accessToken, createdEstimateId!, [
      vendorItem,
      buildNewEstimateItemNode({
        name: NAME.keepEdit,
        unit: '式',
        quantity: 1,
        estimateUnitPrice: 1000,
      }),
    ]);
  };

  const fetchTree = async (page: Page): Promise<EstimateItemNode[]> =>
    await getEstimateItemTree(page.request, accessToken, createdEstimateId!);

  /** 明細ツリーから見積金額行の名称で項目を引く（見つからなければ失敗させる） */
  const requireItem = (tree: readonly EstimateItemNode[], name: string): EstimateItemNode => {
    const found = findEstimateItemByName(tree, name);
    expect(found, `明細ツリーに ${name} が見つからない`).toBeTruthy();
    return found!;
  };

  /** 項目の指定行タイプの明細行を取る */
  const lineOf = (item: EstimateItemNode, lineType: SaveLineType) => {
    const line = item.lines.find((candidate) => candidate.lineType === lineType);
    expect(line, `${lineType} 行が存在しない`).toBeTruthy();
    return line!;
  };

  /** 明細テーブルが描画されるまで待つ（全階層が一覧されるツリー表示を前提にする） */
  const waitForItemTable = async (page: Page): Promise<void> => {
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('estimate-detail-page')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.locator('[aria-label="見積項目テーブル"]')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(page.getByTestId('view-mode-tree')).toHaveAttribute('aria-checked', 'true', {
      timeout: getTimeout(10000),
    });
  };

  /** 見積書画面を開いて明細が描画されるまで待つ */
  const openEstimatePage = async (page: Page): Promise<void> => {
    await page.goto(`/estimates/${createdEstimateId}`);
    await waitForItemTable(page);
  };

  /**
   * 行キーで明細行のラッパーを取る
   *
   * 未保存の新規行はサーバーIDを持たず一時識別子（`tmp-*`）が行キーになる（43.1）。
   */
  const rowByKey = (page: Page, key: string): Locator =>
    page.locator(`[aria-label="見積項目テーブル"] [data-estimate-row-key="${key}"]`);

  /** 行の中の指定行タイプ（見積/実行/業者）の領域 */
  const lineArea = (row: Locator, lineType: SaveLineType): Locator =>
    row.getByTestId(`line-type-${lineType}`);

  /** 行の中の入力欄（名称・規格・単位・数量・単価・備考） */
  const cellInput = (row: Locator, lineType: SaveLineType, label: string): Locator =>
    lineArea(row, lineType).locator(`input[aria-label="${label}"]`);

  /** 行の中の金額欄（自動計算のため入力欄ではない） */
  const amountCell = (row: Locator, lineType: SaveLineType): Locator =>
    lineArea(row, lineType).getByTestId('amount-field');

  /**
   * 画面表示の金額文字列を数値へ直す（`1,234円` / `1,234` → 1234）
   *
   * 桁区切りと単位だけを外す。丸めは行わない（アサーション側のフォーマッタが
   * 丸めを肩代わりすると丸めの検証が無効化されるため / 55.1 の教訓）。
   */
  const toMoney = (text: string | null | undefined): number => {
    const cleaned = (text ?? '').replace(/[,\s円]/g, '');
    const value = Number(cleaned);
    expect(Number.isFinite(value), `数値として読めない表示値: ${JSON.stringify(text)}`).toBe(true);
    return value;
  };

  /**
   * 指定行タイプの名称が一致する行の行キーを引く
   *
   * 未保存の新規行の名称は `<input>` の**値**なので、Playwright の `hasText` では
   * 一致しない。DOM から入力値を読んで突き合わせる。
   */
  const rowKeyByLineName = async (
    page: Page,
    lineType: SaveLineType,
    name: string
  ): Promise<string> => {
    const keys = await page.locator(ROW_SELECTOR).evaluateAll(
      (elements, criteria) =>
        elements
          .filter((element) => {
            const area = element.querySelector(`[data-testid="line-type-${criteria.lineType}"]`);
            const input = area?.querySelector('input[aria-label="名称"]');
            return input instanceof HTMLInputElement && input.value === criteria.name;
          })
          .map((element) => element.getAttribute('data-estimate-row-key')),
      { lineType, name }
    );
    expect(keys, `${lineType} 行の名称が「${name}」の行がちょうど1件見つからない`).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
    return keys[0]!;
  };

  /**
   * ブラウザが送出したリクエストを種類別に収集する
   *
   * 明細の読み込みは GET のみなので、GET / OPTIONS 以外をすべて書き込み候補として数え、
   * 明細操作と無関係に起こりうる認証系（`/api/auth/*`）だけを除外する。
   * 明細の再取得（49.2）は GET のうち `/:id/items` を別に数える。
   */
  const observeRequests = (
    page: Page
  ): { writes: string[]; itemFetches: string[]; stop: () => void } => {
    const writes: string[] = [];
    const itemFetches: string[] = [];
    const record = (request: Request): void => {
      const url = request.url();
      const method = request.method();
      if (!url.startsWith(API_BASE_URL) || url.includes('/api/auth/')) {
        return;
      }
      if (method === 'GET') {
        if (url.includes(`/api/estimates/${createdEstimateId}/items`)) {
          itemFetches.push(`${method} ${url}`);
        }
        return;
      }
      if (method === 'OPTIONS') {
        return;
      }
      writes.push(`${method} ${url}`);
    };
    page.on('request', record);
    return { writes, itemFetches, stop: () => page.off('request', record) };
  };

  /**
   * 保存ボタンを押し、保存ハンドラが完全に解決するまで待つ
   *
   * 観測窓を閉じる契機は「未保存インジケーターの消滅」。`isDirty` は
   * `await onSave(payload)` の解決後にしか下がらないため、ハンドラ内で出た
   * 書き込みは必ず観測済みになる（失敗経路では状態が変わらずタイムアウトで FAIL）。
   */
  const saveAndWaitForSettled = async (page: Page): Promise<void> => {
    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/estimates/${createdEstimateId}/save`) &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const saveButton = page.getByRole('button', { name: /^保存$/i });
    await expect(saveButton).toBeEnabled({ timeout: getTimeout(10000) });
    await saveButton.click();

    const saveResponse = await savePromise;
    // 409（競合）ではなく 200 で確定する（49.5）
    expect(saveResponse.status()).toBe(200);

    await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0, {
      timeout: getTimeout(10000),
    });
    await expect(page.getByTestId('estimate-save-error')).toHaveCount(0);
  };

  /** ログインしてアクセストークンを取得する */
  const loginAndCaptureToken = async (page: Page): Promise<void> => {
    await loginAsUser(page, 'REGULAR_USER');
    accessToken = await page.evaluate(() => localStorage.getItem('accessToken') ?? '');
    expect(accessToken).toBeTruthy();
  };

  // --------------------------------------------------------------------------
  // 5操作の実行手順
  // --------------------------------------------------------------------------

  /**
   * 受領見積書転記を実行する（4.1〜4.4, 30.1〜30.4, 35.3）
   *
   * @param targetKey 転記先の項目キー。`null` は「新規項目として作成」
   */
  const applyQuotationTransfer = async (page: Page, targetKey: string | null): Promise<void> => {
    await page.getByRole('button', { name: '受領見積書を業者金額に転記' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const quotationSelect = page.locator('#quotation-select');
    await expect(quotationSelect).toBeVisible({ timeout: getTimeout(10000) });
    await quotationSelect.selectOption({ value: createdReceivedQuotationId! });

    // 明細行は既定で全選択される（35.3）
    const lineCheckboxes = page.locator('input[data-testid^="line-checkbox-"]');
    await expect(lineCheckboxes).toHaveCount(QUOTATION_LINES.length);
    for (let index = 0; index < QUOTATION_LINES.length; index += 1) {
      await expect(lineCheckboxes.nth(index)).toBeChecked();
    }

    if (targetKey !== null) {
      // 未保存の新規行が転記先の選択肢に並ぶこと自体を先に固定する（30.4, 49.7）。
      // 選択が失敗すると `selectOption` のタイムアウトになり、何が欠けたのか読めない
      await expect(
        page.locator(`#target-select option[value="${targetKey}"]`),
        `転記先の選択肢に ${targetKey} が無い（30.4, 49.7）`
      ).toHaveCount(1);
    }
    await page.locator('#target-select').selectOption({ value: targetKey ?? '' });
    await dialog.getByRole('button', { name: '転記', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
  };

  /** NET金額案分ダイアログを開き、対象業者とNET金額を確定した状態にする */
  const openNetAllocationDialog = async (page: Page): Promise<Locator> => {
    await page.getByRole('button', { name: '業者金額を実行金額に転記' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const vendorSelect = page.locator('#vendor-select');
    await expect(vendorSelect).toBeVisible({ timeout: getTimeout(10000) });
    await vendorSelect.selectOption({ value: tradingPartnerName });

    const netAmountInput = page.locator('#net-amount');
    await expect(netAmountInput).toBeVisible({ timeout: getTimeout(10000) });
    await netAmountInput.fill(String(NET_AMOUNT));

    return dialog;
  };

  /** 利益率適用ダイアログを開く（既定の利益率と「すべて上書き」を用いる） */
  const openProfitRateDialog = async (page: Page): Promise<Locator> => {
    await page.getByRole('button', { name: '実行金額を見積金額に転記' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.locator('#profit-rate')).toHaveValue(PROFIT_RATE);
    return dialog;
  };

  /** 案分プレビューの表示値を行キー別に読む */
  const readAllocationPreview = async (
    page: Page
  ): Promise<Map<string, { ratio: string; allocatedAmount: number }>> => {
    const rows = page.locator('[data-testid="allocation-preview-row"]');
    const count = await rows.count();
    const preview = new Map<string, { ratio: string; allocatedAmount: number }>();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const key = await row.getAttribute('data-allocation-key');
      expect(key).toBeTruthy();
      preview.set(key!, {
        ratio: ((await row.getByTestId('preview-ratio').textContent()) ?? '').trim(),
        allocatedAmount: toMoney(await row.getByTestId('preview-allocated').textContent()),
      });
    }
    return preview;
  };

  /** 利益率プレビューの表示値を行キー別に読む */
  const readProfitPreview = async (
    page: Page
  ): Promise<Map<string, { unitPrice: number; amount: number; applied: string }>> => {
    const rows = page.locator('[data-testid="profit-preview-row"]');
    const count = await rows.count();
    const preview = new Map<string, { unitPrice: number; amount: number; applied: string }>();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const key = await row.getAttribute('data-profit-key');
      expect(key).toBeTruthy();
      const applied = ((await row.getByTestId('preview-applied').textContent()) ?? '').trim();
      const unitPriceText = await row.getByTestId('preview-new-unit-price').textContent();
      const amountText = await row.getByTestId('preview-new-amount').textContent();
      preview.set(key!, {
        // 反映されない行は単価・金額が `-` で描かれるため数値化しない
        unitPrice: applied === '反映する' ? toMoney(unitPriceText) : Number.NaN,
        amount: applied === '反映する' ? toMoney(amountText) : Number.NaN,
        applied,
      });
    }
    return preview;
  };

  /** 諸経費（共通仮設費）を自動計算して追加し、単価に用いられた計算金額を返す */
  const addOverheadItem = async (page: Page): Promise<number> => {
    await page.getByRole('button', { name: '諸経費を計算して追加' }).click();
    const dialog = page.getByTestId('overhead-cost-dialog');
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    await dialog.getByLabel('諸経費種別').selectOption('COMMON_TEMPORARY');
    await dialog.getByLabel('直接工事費').fill('100000');
    await dialog.getByLabel('工期').fill('12');

    // 算定は書き込みを伴わない読み取り専用の経路（`POST /:id/calculate-overhead`）で残っている
    const calcPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/calculate-overhead') && response.request().method() === 'POST',
      { timeout: getTimeout(15000) }
    );
    await dialog.getByRole('button', { name: '計算' }).click();
    expect((await calcPromise).status()).toBe(200);

    const calculatedAmount = toMoney(await dialog.locator('#calculated-amount-input').inputValue());
    expect(calculatedAmount).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: '項目追加' }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });

    return calculatedAmount;
  };

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ==========================================================================
  // テストデータのセットアップ
  // ==========================================================================

  test.describe('テストデータのセットアップ', () => {
    test('準備1: テスト用プロジェクトを作成する', async ({ page }) => {
      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/projects/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      const projectName = `E2E転記計算保存テスト_${Date.now()}`;
      await page.getByLabel(/プロジェクト名/i).fill(projectName);
      await page.getByLabel(/現場住所/i).fill('東京都千代田区テスト3-3-3');

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      const salesPersonValue = await salesPersonSelect.inputValue();
      if (!salesPersonValue) {
        const options = await salesPersonSelect.locator('option').all();
        if (options.length > 1 && options[1]) {
          const firstUserOption = await options[1].getAttribute('value');
          if (firstUserOption) {
            await salesPersonSelect.selectOption(firstUserOption);
          }
        }
      }

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') && response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /^作成$/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
      createdProjectId = match?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();
    });

    test('準備2: テスト用協力業者を作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();

      await loginAsUser(page, 'REGULAR_USER');

      await page.goto('/trading-partners/new');
      await page.waitForLoadState('networkidle');

      await expect(page.getByLabel('取引先名')).toBeVisible({ timeout: getTimeout(10000) });

      tradingPartnerName = `E2E転記計算業者_${Date.now()}`;
      await page.getByLabel('取引先名').fill(tradingPartnerName);
      await page.getByLabel('フリガナ', { exact: true }).fill('テンキケイサンテストギョウシャ');
      await page.getByLabel('住所').fill('東京都新宿区テスト町3-3-3');

      const subcontractorCheckbox = page.getByRole('checkbox', { name: /協力業者/i });
      await subcontractorCheckbox.check();
      await expect(subcontractorCheckbox).toBeChecked();

      await page.getByLabel('メールアドレス').fill('test-transfer-calculation@example.com');

      const createPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/trading-partners') &&
          response.request().method() === 'POST',
        { timeout: getTimeout(30000) }
      );

      await page.getByRole('button', { name: /作成/i }).click();
      const response = await createPromise;
      expect(response.status()).toBe(201);

      createdTradingPartnerId = (await response.json()).id;
      expect(createdTradingPartnerId).toBeTruthy();
    });

    test('準備3: APIトークン取得・数量表・内訳書を作成する', async ({ request }) => {
      expect(createdProjectId).toBeTruthy();

      const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
        data: { email: 'user@example.com', password: 'Password123!' },
      });
      accessToken = (await loginResponse.json()).accessToken;
      expect(accessToken).toBeTruthy();

      const quantityTableResponse = await request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/quantity-tables`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `転記計算用数量表_${Date.now()}` },
        }
      );
      expect(quantityTableResponse.status()).toBe(201);
      const quantityTableId = (await quantityTableResponse.json()).id;

      const groupResponse = await request.post(
        `${API_BASE_URL}/api/quantity-tables/${quantityTableId}/groups`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: 'テストグループ', displayOrder: 0 },
        }
      );
      expect(groupResponse.status()).toBe(201);
      const groupId = (await groupResponse.json()).id;

      for (let index = 0; index < 2; index += 1) {
        await request.post(`${API_BASE_URL}/api/quantity-groups/${groupId}/items`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `テスト項目${index + 1}`,
            workType: '工種A',
            specification: '規格A',
            unit: '式',
            quantity: 10.0,
            displayOrder: index,
          },
        });
      }

      const itemizedStatementResponse = await request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/itemized-statements`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: `転記計算用内訳書_${Date.now()}`, quantityTableId },
        }
      );
      expect(itemizedStatementResponse.status()).toBe(201);
      createdItemizedStatementId = (await itemizedStatementResponse.json()).id;
      expect(createdItemizedStatementId).toBeTruthy();
    });

    test('準備4: 見積依頼と受領見積書（NET金額付き）を作成する', async ({ request }) => {
      expect(createdTradingPartnerId).toBeTruthy();
      expect(createdItemizedStatementId).toBeTruthy();
      expect(accessToken).toBeTruthy();

      const estimateRequestResponse = await request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimate-requests`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: {
            name: `転記計算用見積依頼_${Date.now()}`,
            tradingPartnerId: createdTradingPartnerId,
            itemizedStatementId: createdItemizedStatementId,
          },
        }
      );
      expect(estimateRequestResponse.status()).toBe(201);
      createdEstimateRequestId = (await estimateRequestResponse.json()).id;
      expect(createdEstimateRequestId).toBeTruthy();

      const lineItems = JSON.stringify(
        QUOTATION_LINES.map((line, index) => ({
          name: line.name,
          sortOrder: index,
          specification: line.specification,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.quantity * line.unitPrice,
        }))
      );

      const receivedQuotationResponse = await request.post(
        `${API_BASE_URL}/api/estimate-requests/${createdEstimateRequestId}/quotations`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            name: `受領見積書_転記計算_${Date.now()}`,
            submittedAt: new Date().toISOString(),
            lineItems,
            netAmount: String(NET_AMOUNT),
          },
        }
      );
      expect(receivedQuotationResponse.status()).toBe(201);
      createdReceivedQuotationId = (await receivedQuotationResponse.json()).id;
      expect(createdReceivedQuotationId).toBeTruthy();
    });

    test('準備5: 見積書と明細フィクスチャを作成する', async ({ page }) => {
      expect(createdProjectId).toBeTruthy();
      expect(tradingPartnerName).toBeTruthy();

      await loginAndCaptureToken(page);

      const estimateResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/estimates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { name: '転記・案分・利益率テスト用見積書' },
        }
      );
      expect(estimateResponse.status()).toBe(201);
      createdEstimateId = (await estimateResponse.json()).id;
      expect(createdEstimateId).toBeTruthy();

      await resetItemTree(page);

      // 業者金額行が協力業者名を持って保存されている（案分対象の引き当て鍵）
      const tree = await fetchTree(page);
      const vendorLine = lineOf(requireItem(tree, NAME.vendorItem), 'VENDOR');
      expect(vendorLine.sourceVendorName).toBe(tradingPartnerName);
      expect(Number(vendorLine.unitPrice)).toBe(SAVED_VENDOR_UNIT_PRICE);
    });
  });

  // ==========================================================================
  // 5操作のローカル完結と未保存編集の保持（43.4, 49.1〜49.5, 34.6）
  // ==========================================================================

  test.describe('5操作のローカル完結と保存', () => {
    /**
     * 観測窓は5操作の前に開き、**最後の保存まで開けたまま**にする。
     * 「0件」は窓が早く閉じても真になるため、窓の終端で
     * `POST /:id/calculate-overhead`（読み取り専用）と `PUT /:id/save` の
     * ちょうど2件が記録されていることをもってリスナーが生きていたことを示す。
     *
     * @requirement estimate-creation/REQ-43.4
     * @requirement estimate-creation/REQ-49.1
     * @requirement estimate-creation/REQ-49.2
     * @requirement estimate-creation/REQ-49.3
     * @requirement estimate-creation/REQ-49.4
     * @requirement estimate-creation/REQ-49.5
     * @requirement estimate-creation/REQ-34.6
     */
    test('セル編集の後に転記・案分・利益率適用・諸経費追加・値引き追加を行っても編集内容が残り、書き込みは保存の1件だけ発生する (estimate-creation/REQ-43.4, estimate-creation/REQ-49.3, estimate-creation/REQ-49.4, estimate-creation/REQ-49.5, estimate-creation/REQ-34.6)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);

      const initialTree = await fetchTree(page);
      const vendorItemId = requireItem(initialTree, NAME.vendorItem).id;
      const keepEditItemId = requireItem(initialTree, NAME.keepEdit).id;
      const updatedAtBefore = await getEstimateUpdatedAt(
        page.request,
        accessToken,
        createdEstimateId!
      );

      await openEstimatePage(page);
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(2);

      // 画面表示後のリクエストだけを数える
      const { writes, itemFetches, stop } = observeRequests(page);

      // --- 1. セル編集（この内容が5操作を越えて残ることを見る / 43.4）---
      const keepEditRow = rowByKey(page, keepEditItemId);
      const editedName = '編集保持_名称';
      const editedRemarks = '編集保持_備考';
      await cellInput(keepEditRow, 'ESTIMATE', '名称').fill(editedName);
      await cellInput(keepEditRow, 'ESTIMATE', '備考').fill(editedRemarks);

      // 案分の入力になる業者金額行も書き換える（案分は編集中の値に基づく / 5.8）
      const vendorRow = rowByKey(page, vendorItemId);
      const vendorRemarks = '編集保持_業者備考';
      await cellInput(vendorRow, 'VENDOR', '単価').fill(String(EDITED_VENDOR_UNIT_PRICE));
      await cellInput(vendorRow, 'VENDOR', '備考').fill(vendorRemarks);
      await expect(amountCell(vendorRow, 'VENDOR')).toHaveText(
        EXPECTED.C.vendorAmount.toLocaleString('ja-JP')
      );
      await expect(page.getByTestId('estimate-unsaved-indicator')).toBeVisible();

      /** 5操作それぞれの直後に、編集内容がそのまま残っていることを確かめる（43.4, 49.2） */
      const expectEditsPreserved = async (operation: string): Promise<void> => {
        await expect(
          cellInput(keepEditRow, 'ESTIMATE', '名称'),
          `${operation}の後に未保存の編集（名称）が失われている（43.4）`
        ).toHaveValue(editedName);
        await expect(
          cellInput(keepEditRow, 'ESTIMATE', '備考'),
          `${operation}の後に未保存の編集（備考）が失われている（43.4）`
        ).toHaveValue(editedRemarks);
        await expect(
          cellInput(vendorRow, 'VENDOR', '単価'),
          `${operation}の後に未保存の編集（業者単価）が失われている（43.4）`
        ).toHaveValue(String(EDITED_VENDOR_UNIT_PRICE));
        await expect(
          cellInput(vendorRow, 'VENDOR', '備考'),
          `${operation}の後に未保存の編集（業者備考）が失われている（43.4）`
        ).toHaveValue(vendorRemarks);
      };

      // --- 2. 受領見積書転記（新規項目として作成）---
      await applyQuotationTransfer(page, null);
      const transferKeyA = await rowKeyByLineName(page, 'VENDOR', NAME.transferA);
      const transferKeyB = await rowKeyByLineName(page, 'VENDOR', NAME.transferB);
      // 転記で作られた行は未保存の新規行（サーバーIDを持たない / 43.1, 49.1）
      expect(transferKeyA.startsWith('tmp-')).toBe(true);
      expect(transferKeyB.startsWith('tmp-')).toBe(true);
      await expect(amountCell(rowByKey(page, transferKeyA), 'VENDOR')).toHaveText(
        EXPECTED.A.vendorAmount.toLocaleString('ja-JP')
      );
      expect(writes, '転記の適用でサーバーへの書き込みが発生している（49.3）').toEqual([]);
      await expectEditsPreserved('転記');

      // --- 3. NET金額案分 ---
      const netDialog = await openNetAllocationDialog(page);
      await netDialog.getByRole('button', { name: '案分実行' }).click();
      await expect(netDialog).toBeHidden({ timeout: getTimeout(10000) });
      await expect(cellInput(rowByKey(page, transferKeyA), 'EXECUTION', '単価')).toHaveValue(
        String(EXPECTED.A.allocatedUnitPrice)
      );
      expect(writes, '案分の適用でサーバーへの書き込みが発生している（49.3）').toEqual([]);
      await expectEditsPreserved('案分');

      // --- 4. 利益率適用 ---
      const profitDialog = await openProfitRateDialog(page);
      await profitDialog.getByRole('button', { name: '適用', exact: true }).click();
      await expect(profitDialog).toBeHidden({ timeout: getTimeout(10000) });
      await expect(cellInput(rowByKey(page, transferKeyA), 'ESTIMATE', '単価')).toHaveValue(
        String(EXPECTED.A.profitUnitPrice)
      );
      expect(writes, '利益率適用でサーバーへの書き込みが発生している（49.3）').toEqual([]);
      await expectEditsPreserved('利益率適用');

      // --- 5. 諸経費行追加 ---
      const overheadUnitPrice = await addOverheadItem(page);
      const overheadKey = await rowKeyByLineName(page, 'ESTIMATE', '共通仮設費');
      expect(overheadKey.startsWith('tmp-')).toBe(true);
      const overheadRow = rowByKey(page, overheadKey);
      await expect(cellInput(overheadRow, 'ESTIMATE', '単位')).toHaveValue('式');
      await expect(cellInput(overheadRow, 'ESTIMATE', '数量')).toHaveValue('1');
      await expect(cellInput(overheadRow, 'ESTIMATE', '単価')).toHaveValue(
        String(overheadUnitPrice)
      );
      expect(
        writes,
        '諸経費追加で、読み取り専用の算定以外のリクエストが発生している（49.3）'
      ).toEqual([`POST ${API_BASE_URL}/api/estimates/${createdEstimateId}/calculate-overhead`]);
      await expectEditsPreserved('諸経費追加');

      // --- 6. 値引き行追加 ---
      await page.getByTestId('add-discount-button').click();
      const discountRow = page.locator(`${ROW_SELECTOR}:has([data-item-type="DISCOUNT"])`);
      await expect(discountRow).toHaveCount(1);
      await expect(cellInput(discountRow, 'ESTIMATE', '名称')).toHaveValue('値引き');
      await cellInput(discountRow, 'ESTIMATE', '単価').fill(String(DISCOUNT_UNIT_PRICE));
      expect(writes, '値引き行追加でサーバーへの書き込みが発生している（49.3）').toEqual([
        `POST ${API_BASE_URL}/api/estimates/${createdEstimateId}/calculate-overhead`,
      ]);
      await expectEditsPreserved('値引き行追加');

      // --- 5操作を通して明細の再取得も起きていない（49.2）---
      expect(itemFetches, '5操作の途中で明細の再取得が発生している（49.2）').toEqual([]);

      // --- サーバー側は操作前のまま（未保存の変更である / 49.1）---
      expect(await getEstimateUpdatedAt(page.request, accessToken, createdEstimateId!)).toBe(
        updatedAtBefore
      );
      const untouched = await fetchTree(page);
      expect(untouched).toHaveLength(2);
      expect(Number(lineOf(requireItem(untouched, NAME.vendorItem), 'VENDOR').unitPrice)).toBe(
        SAVED_VENDOR_UNIT_PRICE
      );

      // --- 保存で確定する。基準時刻が進んでいないので競合しない（49.4, 49.5）---
      await saveAndWaitForSettled(page);
      stop();

      expect(writes, '保存が1リクエストで確定していない、または観測窓が閉じていた（49.4）').toEqual(
        [
          `POST ${API_BASE_URL}/api/estimates/${createdEstimateId}/calculate-overhead`,
          `PUT ${API_BASE_URL}/api/estimates/${createdEstimateId}/save`,
        ]
      );

      // --- 画面を開き直しても反映後の内容が残る（34.6）---
      await openEstimatePage(page);
      const savedTree = await fetchTree(page);
      expect(savedTree).toHaveLength(6);

      // セル編集（34.3）
      const savedKeepEdit = requireItem(savedTree, editedName);
      expect(lineOf(savedKeepEdit, 'ESTIMATE').remarks).toBe(editedRemarks);
      // 業者金額行の編集と案分結果
      const savedVendorItem = requireItem(savedTree, NAME.vendorLine);
      expect(Number(lineOf(savedVendorItem, 'VENDOR').unitPrice)).toBe(EDITED_VENDOR_UNIT_PRICE);
      expect(lineOf(savedVendorItem, 'VENDOR').remarks).toBe(vendorRemarks);
      expect(Number(lineOf(savedVendorItem, 'EXECUTION').unitPrice)).toBe(
        EXPECTED.C.allocatedUnitPrice
      );
      expect(Number(lineOf(savedVendorItem, 'ESTIMATE').unitPrice)).toBe(
        EXPECTED.C.profitUnitPrice
      );
      // 転記・案分・利益率適用の結果
      for (const [name, expected] of [
        [NAME.transferA, EXPECTED.A],
        [NAME.transferB, EXPECTED.B],
      ] as const) {
        const savedItem = requireItem(savedTree, name);
        expect(Number(lineOf(savedItem, 'VENDOR').amount)).toBe(expected.vendorAmount);
        expect(Number(lineOf(savedItem, 'EXECUTION').unitPrice)).toBe(expected.allocatedUnitPrice);
        expect(Number(lineOf(savedItem, 'EXECUTION').amount)).toBe(expected.allocatedAmount);
        expect(Number(lineOf(savedItem, 'ESTIMATE').unitPrice)).toBe(expected.profitUnitPrice);
        expect(Number(lineOf(savedItem, 'ESTIMATE').amount)).toBe(expected.profitAmount);
      }
      // 諸経費行・値引き行
      const savedOverhead = requireItem(savedTree, '共通仮設費');
      expect(Number(lineOf(savedOverhead, 'ESTIMATE').unitPrice)).toBe(overheadUnitPrice);
      const savedDiscount = requireItem(savedTree, '値引き');
      expect(savedDiscount.itemType).toBe('DISCOUNT');
      expect(Number(lineOf(savedDiscount, 'ESTIMATE').unitPrice)).toBe(DISCOUNT_UNIT_PRICE);

      // 画面にも反映後の内容が出ている
      await expect(page.locator(ROW_SELECTOR)).toHaveCount(6);
      await expect(cellInput(rowByKey(page, savedKeepEdit.id), 'ESTIMATE', '名称')).toHaveValue(
        editedName
      );
      await expect(
        cellInput(rowByKey(page, requireItem(savedTree, NAME.transferA).id), 'ESTIMATE', '単価')
      ).toHaveValue(String(EXPECTED.A.profitUnitPrice));
      await expect(page.getByTestId('estimate-unsaved-indicator')).toHaveCount(0);
    });
  });

  // ==========================================================================
  // 未保存の新規行の対象化とプレビューの一致（5.8, 5.9, 6.8, 6.9, 49.7, 34.6）
  // ==========================================================================

  test.describe('未保存の新規行の対象化とプレビューの一致', () => {
    /**
     * 転記先に**未保存の新規行**を選び、その子として作られた（これも未保存の）行を
     * 案分・利益率適用の対象に通す。プレビューの表示値を先に採取し、
     * 「プレビュー → 適用後の画面 → 保存して再読み込みした画面」の3点が一致することを見る。
     *
     * アサーションの順序は、プレビューと適用結果の突き合わせを行数の一致より**前**に置く。
     * 先に件数を見ると、対象の選定が壊れた変異が「行数が違う」という二次的な形で落ち、
     * 5.8 / 6.8 の違反そのものが失敗として報告されない（55.3 / 55.4 の教訓）。
     *
     * 案分の検証は 5.8（編集中の値に基づくこと）だけでなく 5.4 / 5.5 そのものを含む。
     * 案分後**単価**が期待値と一致することが 5.4、案分後**金額**が実行金額行の金額欄に
     * 出ることが 5.5 にあたる。どちらも業者金額行が無ければ `#vendor-select` の
     * 業者選択で落ちるため、前提が欠けたときに黙って素通りすることはない。
     *
     * @requirement estimate-creation/REQ-5.4
     * @requirement estimate-creation/REQ-5.5
     * @requirement estimate-creation/REQ-5.8
     * @requirement estimate-creation/REQ-5.9
     * @requirement estimate-creation/REQ-6.8
     * @requirement estimate-creation/REQ-6.9
     * @requirement estimate-creation/REQ-49.7
     * @requirement estimate-creation/REQ-34.6
     */
    test('未保存の新規行が転記先・案分対象・利益率適用対象になり、プレビューの表示値が保存後の再読み込み後の値と一致する (estimate-creation/REQ-5.4, estimate-creation/REQ-5.5, estimate-creation/REQ-5.8, estimate-creation/REQ-5.9, estimate-creation/REQ-6.8, estimate-creation/REQ-6.9, estimate-creation/REQ-49.7)', async ({
      page,
    }) => {
      expect(createdEstimateId).toBeTruthy();

      await loginAndCaptureToken(page);
      await resetItemTree(page);

      const initialTree = await fetchTree(page);
      const vendorItemId = requireItem(initialTree, NAME.vendorItem).id;

      await openEstimatePage(page);

      // --- 業者金額行を画面で書き換える（案分は編集中の値に基づく / 5.8）---
      const vendorRow = rowByKey(page, vendorItemId);
      await cellInput(vendorRow, 'VENDOR', '単価').fill(String(EDITED_VENDOR_UNIT_PRICE));
      await expect(amountCell(vendorRow, 'VENDOR')).toHaveText(
        EXPECTED.C.vendorAmount.toLocaleString('ja-JP')
      );

      // --- 未保存の新規行を作り、転記先に指定する（30.4, 49.7）---
      const parentName = '未保存の転記先';
      await page
        .getByTestId('estimate-item-toolbar')
        .getByRole('button', { name: '+ 項目追加' })
        .click();
      const parentKey = (await page
        .locator(`${ROW_SELECTOR}[data-estimate-row-key^="tmp-"]`)
        .getAttribute('data-estimate-row-key'))!;
      expect(parentKey).toBeTruthy();
      await cellInput(rowByKey(page, parentKey), 'ESTIMATE', '名称').fill(parentName);

      await applyQuotationTransfer(page, parentKey);

      const transferKeyA = await rowKeyByLineName(page, 'VENDOR', NAME.transferA);
      const transferKeyB = await rowKeyByLineName(page, 'VENDOR', NAME.transferB);
      // 未保存の新規行の子として作られている（サーバーIDを持たない行が転記先になった / 49.7）
      expect(transferKeyA.startsWith('tmp-')).toBe(true);
      expect(transferKeyB.startsWith('tmp-')).toBe(true);
      expect(parentKey.startsWith('tmp-')).toBe(true);
      // 親の業者金額は子の合計に集計される（＝本当に子として入っている）
      await expect(amountCell(rowByKey(page, parentKey), 'VENDOR')).toHaveText(
        (EXPECTED.A.vendorAmount + EXPECTED.B.vendorAmount).toLocaleString('ja-JP')
      );

      // --- 案分: 未保存の新規行が対象一覧に並ぶ（5.9, 18.10, 49.7）---
      const netDialog = await openNetAllocationDialog(page);
      for (const key of [transferKeyA, transferKeyB, vendorItemId]) {
        await expect(
          page.locator(`[data-testid="allocation-target"][data-allocation-key="${key}"]`),
          `案分対象の一覧に ${key} が含まれていない（5.9, 49.7）`
        ).toHaveCount(1);
      }

      const allocationPreview = await readAllocationPreview(page);
      // プレビューの固定値（実装と独立に導いた期待値）
      for (const [key, expected] of [
        [transferKeyA, EXPECTED.A],
        [transferKeyB, EXPECTED.B],
        [vendorItemId, EXPECTED.C],
      ] as const) {
        expect(allocationPreview.get(key)?.ratio, `案分率が期待値と異なる: ${key}`).toBe(
          expected.ratio
        );
        expect(
          allocationPreview.get(key)?.allocatedAmount,
          `案分後金額が期待値と異なる: ${key}`
        ).toBe(expected.allocatedAmount);
      }
      // 案分後金額の合計はNET金額に一致する（案分の不変条件）
      expect(
        [...allocationPreview.values()].reduce((sum, row) => sum + row.allocatedAmount, 0)
      ).toBe(NET_AMOUNT);
      expect(allocationPreview.size).toBe(3);

      await netDialog.getByRole('button', { name: '案分実行' }).click();
      await expect(netDialog).toBeHidden({ timeout: getTimeout(10000) });

      // --- プレビューに出た案分後金額が実行金額行へそのまま着地する（5.8）---
      for (const [key, expected] of [
        [transferKeyA, EXPECTED.A],
        [transferKeyB, EXPECTED.B],
        [vendorItemId, EXPECTED.C],
      ] as const) {
        const row = rowByKey(page, key);
        await expect(
          amountCell(row, 'EXECUTION'),
          `プレビューの案分後金額が実行金額行に反映されていない（5.8）: ${key}`
        ).toHaveText(allocationPreview.get(key)!.allocatedAmount.toLocaleString('ja-JP'));
        await expect(cellInput(row, 'EXECUTION', '単価')).toHaveValue(
          String(expected.allocatedUnitPrice)
        );
      }

      // --- 利益率適用: 未保存の新規行が適用対象に並ぶ（6.9, 19.8, 49.7）---
      const profitDialog = await openProfitRateDialog(page);
      for (const key of [transferKeyA, transferKeyB, vendorItemId]) {
        await expect(
          page.locator(`[data-testid="profit-preview-row"][data-profit-key="${key}"]`),
          `利益率の適用対象に ${key} が含まれていない（6.9, 49.7）`
        ).toHaveCount(1);
      }

      const profitPreview = await readProfitPreview(page);
      for (const [key, expected] of [
        [transferKeyA, EXPECTED.A],
        [transferKeyB, EXPECTED.B],
        [vendorItemId, EXPECTED.C],
      ] as const) {
        expect(profitPreview.get(key)?.applied, `反映の有無が異なる: ${key}`).toBe('反映する');
        expect(profitPreview.get(key)?.unitPrice, `新しい単価が期待値と異なる: ${key}`).toBe(
          expected.profitUnitPrice
        );
        expect(profitPreview.get(key)?.amount, `新しい金額が期待値と異なる: ${key}`).toBe(
          expected.profitAmount
        );
      }
      // 実行金額行に単価が無い行は「反映しない」と示される（6.8 の一致性の裏側）
      const keepEditKey = requireItem(initialTree, NAME.keepEdit).id;
      expect(profitPreview.get(keepEditKey)?.applied).toBe('反映しない');

      await profitDialog.getByRole('button', { name: '適用', exact: true }).click();
      await expect(profitDialog).toBeHidden({ timeout: getTimeout(10000) });

      // --- プレビューに出た新しい単価・金額が見積金額行へそのまま着地する（6.8）---
      for (const key of [transferKeyA, transferKeyB, vendorItemId]) {
        const row = rowByKey(page, key);
        await expect(
          cellInput(row, 'ESTIMATE', '単価'),
          `プレビューの新しい単価が見積金額行に反映されていない（6.8）: ${key}`
        ).toHaveValue(String(profitPreview.get(key)!.unitPrice));
        await expect(amountCell(row, 'ESTIMATE')).toHaveText(
          profitPreview.get(key)!.amount.toLocaleString('ja-JP')
        );
      }

      // --- 保存して開き直しても、プレビューに出た値のままである（34.6）---
      await saveAndWaitForSettled(page);
      await openEstimatePage(page);

      const savedTree = await fetchTree(page);
      const savedParent = requireItem(savedTree, parentName);
      expect(savedParent.children).toHaveLength(2);

      for (const [name, key] of [
        [NAME.transferA, transferKeyA],
        [NAME.transferB, transferKeyB],
        [NAME.vendorLine, vendorItemId],
      ] as const) {
        const savedItem = requireItem(savedTree, name);
        const savedRow = rowByKey(page, savedItem.id);
        await expect(
          amountCell(savedRow, 'EXECUTION'),
          `再読み込み後の実行金額がプレビューと一致しない（5.8, 34.6）: ${name}`
        ).toHaveText(allocationPreview.get(key)!.allocatedAmount.toLocaleString('ja-JP'));
        await expect(
          cellInput(savedRow, 'ESTIMATE', '単価'),
          `再読み込み後の見積単価がプレビューと一致しない（6.8, 34.6）: ${name}`
        ).toHaveValue(String(profitPreview.get(key)!.unitPrice));
        expect(Number(lineOf(savedItem, 'EXECUTION').amount)).toBe(
          allocationPreview.get(key)!.allocatedAmount
        );
        expect(Number(lineOf(savedItem, 'ESTIMATE').unitPrice)).toBe(
          profitPreview.get(key)!.unitPrice
        );
        expect(Number(lineOf(savedItem, 'ESTIMATE').amount)).toBe(profitPreview.get(key)!.amount);
      }
    });
  });

  // ==========================================================================
  // クリーンアップ
  // ==========================================================================

  test.describe('クリーンアップ', () => {
    test('テストデータの削除', async ({ request }) => {
      if (!accessToken) {
        const loginResponse = await request.post(`${API_BASE_URL}/api/v1/auth/login`, {
          data: { email: 'user@example.com', password: 'Password123!' },
        });
        accessToken = (await loginResponse.json()).accessToken;
      }

      if (createdEstimateId) {
        await request.delete(`${API_BASE_URL}/api/estimates/${createdEstimateId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdProjectId) {
        await request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (createdTradingPartnerId) {
        await request.delete(`${API_BASE_URL}/api/trading-partners/${createdTradingPartnerId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }

      createdProjectId = null;
      createdTradingPartnerId = null;
      createdItemizedStatementId = null;
      createdEstimateRequestId = null;
      createdReceivedQuotationId = null;
      createdEstimateId = null;
    });
  });
});
