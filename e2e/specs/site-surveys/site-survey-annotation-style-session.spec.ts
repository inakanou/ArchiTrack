/**
 * @fileoverview 注釈スタイルの編集セッション内引継ぎの E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 26.4: ユーザーが注釈ツールのスタイル（色・線幅・白縁取り有無等）を変更して注釈を描画したとき、
 *         当該編集セッション内の同ツール再利用時に直前のスタイル設定を引き継ぐ
 * - 26.6: 既存の注釈エディタ設定にユーザーが明示的に選択した色・線幅が存在するとき、
 *         当該セッション中はユーザー選択値を優先する
 *
 * Task 115.97:
 *   要件26.4 / 26.6 の受入基準カバレッジは、これまで単体検証
 *   （`frontend/src/__tests__/components/site-surveys/AnnotationEditor.style-session.test.tsx`）の
 *   `@requirement` タグだけで成立していた。単体検証は Fabric を差し替えた模擬環境で動くため、
 *   本番の画面（画像ビューア → 編集モード → 道具帯 → 実キャンバスへの描画）から
 *   セッション状態へ到達することを構造的に確かめられない。本 spec は実ブラウザで本番の経路を通し、
 *   ユーザー選択値が既定値へ巻き戻らないことを具体値との突合せで観測する。
 *
 * 構成:
 *   (a) 選んだ色・線幅がセッション中は既定値ではなくユーザー選択値のまま使われる（Req 26.6）
 *   (b) 別ツールを経由して同じツールへ戻しても直前の色・線幅を引き継ぐ（Req 26.4）
 *   (c) 白縁取り有無もツール別にセッション内で引き継がれる（Req 26.4）
 *
 * 主張はすべて具体値との一致で行う（「既定値と異なる」等の否定形・下限は用いない）。
 * 期待値は本番の算出を再実行せず直書きする（中央の定数を変えると両辺が同時に動き、
 * 検証が落ちなくなるため）。
 *
 * @requirement site-survey/REQ-26.4
 * @requirement site-survey/REQ-26.6
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 一元管理された既定値（`annotation-style-tokens.ts` の `ANNOTATION_DEFAULTS`）
 *
 * 本番から import せず具体値を直書きする。既定値を変更したときに本 spec が
 * 「変更に追随して常に通る」形へ退化しないため（期待値と実装が同じ定数を見ると、
 * 定数を壊す変更で両辺が同時に動き、検証が破れを検出できなくなる）。
 */
const DEFAULT_STROKE_COLOR = '#e53935';
const DEFAULT_STROKE_WIDTH = 3;

/** ユーザーが明示的に選ぶ値（既定値と重ならない具体値。線幅の入力範囲は 1〜20） */
const USER_STROKE_COLOR = '#0b57d0';
const USER_STROKE_WIDTH = 11;

/** 形状を描き分ける格子（キャンバス相対比率）。互いに重ならないよう割り当てる。 */
const CELLS: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }> = [
  { x0: 0.08, y0: 0.12, x1: 0.3, y1: 0.36 },
  { x0: 0.4, y0: 0.12, x1: 0.62, y1: 0.36 },
  { x0: 0.08, y0: 0.5, x1: 0.3, y1: 0.74 },
];

/** `window.__fabricCanvas` のうち本 spec が参照する範囲の最小型 */
interface ProbeCanvas {
  getObjects(): Array<ProbeObject>;
  getWidth(): number;
  getHeight(): number;
  backgroundImage?: unknown;
}

interface ProbeObject {
  type?: string;
  toObject(): {
    type?: string;
    stroke?: string;
    strokeWidth?: number;
    outline?: { enabled?: boolean };
  };
}

/** 描かれた注釈から読み出すスタイル状態 */
interface DrawnAnnotationState {
  type: string;
  stroke: string | null;
  strokeWidth: number | null;
  outlineEnabled: boolean | null;
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

test.describe('注釈スタイルのセッション引継ぎ', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  /**
   * 検証ごとに独立した画像を使う。
   *
   * 未保存の編集は localStorage の下書きとして残り、同じ画像を開き直すと復元確認が
   * 割り込む（Req 15.5）。検証ごとに新しいセッションであることを担保するため画像を分ける。
   */
  const imageIds: string[] = [];

  /**
   * upper-canvas の bounding box を、Fabric の実サイズ・背景画像の設定完了・
   * 位置の安定を満たすまで待って取得する（固定時間待機は用いず、条件の成立で待つ）。
   */
  async function getCanvasBox(): Promise<CanvasBox> {
    const upperCanvas = sharedPage.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(20000) });

    let previous: CanvasBox | null = null;
    await expect
      .poll(
        async () => {
          const box = await upperCanvas.boundingBox();
          const fabricSize = await sharedPage.evaluate(() => {
            const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null })
              .__fabricCanvas;
            if (!canvas) return null;
            return {
              width: canvas.getWidth(),
              height: canvas.getHeight(),
              hasBackground:
                canvas.backgroundImage !== null && canvas.backgroundImage !== undefined,
            };
          });

          const sizeMatches =
            box !== null &&
            box.width > 10 &&
            box.height > 10 &&
            fabricSize !== null &&
            fabricSize.hasBackground &&
            Math.abs(fabricSize.width - box.width) < 1 &&
            Math.abs(fabricSize.height - box.height) < 1;
          const positionStable =
            box !== null &&
            previous !== null &&
            Math.abs(box.x - previous.x) < 1 &&
            Math.abs(box.y - previous.y) < 1 &&
            Math.abs(box.width - previous.width) < 1;

          previous = box;
          return sizeMatches && positionStable ? 'stable' : 'unstable';
        },
        {
          timeout: getTimeout(30000),
          message: '注釈キャンバスが安定した状態になりませんでした',
        }
      )
      .toBe('stable');

    const box = await upperCanvas.boundingBox();
    expect(box, '注釈キャンバスの位置が取得できませんでした').not.toBeNull();
    return box!;
  }

  /** 画像ビューアを開き、編集モードへ入って注釈ツールバーの表示を待つ。 */
  async function enterEditMode(imageId: string): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${imageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const editModeButton = sharedPage.getByRole('button', { name: '編集モード', exact: true });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();

    await expect(sharedPage.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await getCanvasBox();
  }

  /** 指定ツールを選択し、押下状態になったことを確認する。 */
  async function selectTool(label: string): Promise<void> {
    const tool = sharedPage.getByRole('button', { name: label, exact: true });
    await expect(tool).toBeVisible({ timeout: getTimeout(10000) });
    // Req 28.8: 選択中ツールを再び押すと詳細属性パネルの開閉になる。本ヘルパーの意図は
    // 「当該ツールを選択状態にする」ことなので、既に選択済みなら押さない。
    if ((await tool.getAttribute('aria-pressed')) !== 'true') {
      await tool.click();
    }
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
  }

  /** 道具帯のスタイルパネルの各入力 */
  function colorPicker() {
    return sharedPage.getByTestId('style-options').getByTestId('color-picker');
  }

  function lineWidthInput() {
    return sharedPage.getByTestId('style-options').getByTestId('line-width');
  }

  function outlineToggle() {
    return sharedPage.getByTestId('style-options').getByTestId('outline-toggle');
  }

  /** Fabric キャンバス上のオブジェクト数を取得する。 */
  async function getObjectCount(): Promise<number> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null }).__fabricCanvas;
      if (!canvas) return -1;
      return canvas.getObjects().length;
    });
  }

  /** キャンバス上の全注釈からスタイル状態を読み出す。 */
  async function readAnnotationStates(): Promise<DrawnAnnotationState[]> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null }).__fabricCanvas;
      if (!canvas) return [];
      return canvas.getObjects().map((obj) => {
        const serialized = obj.toObject();
        return {
          type: serialized.type ?? obj.type ?? 'unknown',
          stroke: serialized.stroke ?? null,
          strokeWidth: serialized.strokeWidth ?? null,
          outlineEnabled: serialized.outline?.enabled ?? null,
        };
      });
    });
  }

  /**
   * 矢印を 1 本描き、新しく作られた注釈の位置（添字）を返す。
   *
   * オブジェクトがちょうど 1 つ増えるまで待つ。増えなければ待機が満了して失敗する。
   */
  async function drawArrow(cell: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }): Promise<number> {
    const box = await getCanvasBox();
    const left = box.x + box.width * cell.x0;
    const top = box.y + box.height * cell.y0;
    const right = box.x + box.width * cell.x1;
    const bottom = box.y + box.height * cell.y1;

    const countBefore = await getObjectCount();

    await sharedPage.mouse.move(left, top);
    await sharedPage.mouse.down();
    await sharedPage.mouse.move(right, bottom, { steps: 12 });
    await sharedPage.mouse.up();

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: '矢印の描画でオブジェクトが作成されませんでした',
      })
      .toBe(countBefore + 1);

    return countBefore;
  }

  /** 指定位置の注釈のスタイル状態を読む（総数が期待どおりであることも確かめる）。 */
  async function readAnnotationAt(index: number): Promise<DrawnAnnotationState> {
    const states = await readAnnotationStates();
    expect(states.length, '注釈の総数が期待と異なる').toBe(index + 1);
    return states[index]!;
  }

  /** スタイルパネルの色・線幅をユーザー選択値へ変更する。 */
  async function selectUserStyle(): Promise<void> {
    await colorPicker().fill(USER_STROKE_COLOR);
    await expect(colorPicker()).toHaveValue(USER_STROKE_COLOR);
    await lineWidthInput().fill(String(USER_STROKE_WIDTH));
    await expect(lineWidthInput()).toHaveValue(String(USER_STROKE_WIDTH));
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    await loginAsUser(sharedPage, 'REGULAR_USER');

    // --- プロジェクト作成 ---
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `スタイル引継ぎE2E用PJ_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);
    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    await selectFirstRealOption(salesPersonSelect, '営業担当者');

    const createProjectPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createProjectPromise;

    await sharedPage.waitForURL(/\/projects\/[0-9a-f-]+$/);
    createdProjectId = sharedPage.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
    expect(createdProjectId).toBeTruthy();

    // --- 現場調査作成 ---
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `スタイル引継ぎE2E用調査_${Date.now()}`;
    await sharedPage.getByLabel(/調査名/i).fill(surveyName);
    await sharedPage.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);

    const createSurveyPromise = sharedPage.waitForResponse(
      (response) =>
        response.url().includes('/api/') &&
        response.url().includes('site-surveys') &&
        response.request().method() === 'POST',
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: /^作成$/i }).click();
    await createSurveyPromise;

    await sharedPage.waitForURL(/\/site-surveys\/[0-9a-f-]+$/);
    createdSurveyId = sharedPage.url().match(/\/site-surveys\/([0-9a-f-]+)$/)?.[1] ?? null;
    expect(createdSurveyId).toBeTruthy();

    // --- 画像を API で直接アップロード（検証ごとに 1 枚ずつ使う） ---
    const testImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    const imageBuffer = fs.readFileSync(testImagePath);

    for (let i = 0; i < 3; i++) {
      const uploadResponse = await sharedPage.request.post(
        `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          multipart: {
            images: {
              name: 'test-image-large.jpg',
              mimeType: 'image/jpeg',
              buffer: imageBuffer,
            },
          },
        }
      );
      expect(uploadResponse.ok()).toBeTruthy();
      const uploadBody = (await uploadResponse.json()) as { successful?: Array<{ id?: string }> };
      const uploadedId = uploadBody.successful?.[0]?.id ?? null;
      expect(uploadedId, `${i + 1} 枚目の画像アップロードに失敗しました`).toBeTruthy();
      imageIds.push(uploadedId!);
    }

    expect(new Set(imageIds).size, '検証用の画像が重複しています').toBe(3);
  });

  test.afterAll(async ({ browser }) => {
    // 後始末: 作成したデータを ADMIN 権限の API 呼び出しで削除する。
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');
      const adminToken = await cleanupPage.evaluate(() => localStorage.getItem('accessToken'));
      const headers = { Authorization: `Bearer ${adminToken}` };
      if (createdSurveyId) {
        await cleanupPage.request.delete(`${API_BASE_URL}/api/site-surveys/${createdSurveyId}`, {
          headers,
        });
      }
      if (createdProjectId) {
        await cleanupPage.request.delete(`${API_BASE_URL}/api/projects/${createdProjectId}`, {
          headers,
        });
      }
    } catch {
      // 後始末の失敗は検証結果に影響させない
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  /**
   * (a) 明示的に選んだ色・線幅がセッション中は既定値より優先される
   *     Requirement 26.6
   *
   * 「優先する」は、選択後の道具帯の表示と、実際に描かれた注釈の双方がユーザー選択値
   * そのものであることを指す。既定値との突合せも具体値で行い、変更前後の両方を固定する。
   */
  test('(a) 明示的に選んだ色・線幅はセッション中の描画にそのまま使われる', async () => {
    await enterEditMode(imageIds[0]!);
    await selectTool('矢印');

    // 変更前は一元管理の既定値が供給されている（前提の固定）
    await expect(colorPicker(), '矢印ツールの初期色が既定値でない').toHaveValue(
      DEFAULT_STROKE_COLOR
    );
    await expect(lineWidthInput(), '矢印ツールの初期線幅が既定値でない').toHaveValue(
      String(DEFAULT_STROKE_WIDTH)
    );

    await selectUserStyle();

    const index = await drawArrow(CELLS[0]!);
    const drawn = await readAnnotationAt(index);

    expect(drawn.type, '描かれた注釈が矢印でない').toBe('arrow');
    expect(drawn.stroke, '描かれた矢印の色がユーザー選択値でない').toBe(USER_STROKE_COLOR);
    expect(drawn.strokeWidth, '描かれた矢印の線幅がユーザー選択値でない').toBe(USER_STROKE_WIDTH);
  });

  /**
   * (b) 別ツールを経由して同じツールへ戻しても直前の色・線幅を引き継ぐ
   *     Requirement 26.4（引き継いだ値が既定へ巻き戻らない点で 26.6 も併せて確かめる）
   *
   * 選択ツールを挟んでスタイルパネル自体を画面から消してから戻す。表示が残っているだけの
   * 「見た目の据え置き」ではなく、セッション状態から再供給されていることを確かめるため。
   */
  test('(b) 別ツールを経由して矢印へ戻しても直前の色・線幅を引き継ぐ', async () => {
    await enterEditMode(imageIds[1]!);
    await selectTool('矢印');
    await selectUserStyle();

    // 要件の前提「スタイルを変更して注釈を描画する」を満たす
    const firstIndex = await drawArrow(CELLS[0]!);
    const first = await readAnnotationAt(firstIndex);
    expect(first.stroke, '1 本目の矢印の色がユーザー選択値でない').toBe(USER_STROKE_COLOR);
    expect(first.strokeWidth, '1 本目の矢印の線幅がユーザー選択値でない').toBe(USER_STROKE_WIDTH);

    // 別の描画ツール（四角形）へ切替える
    await selectTool('四角形');
    await expect(colorPicker(), '四角形へ切替えた時点で色が既定へ戻っている').toHaveValue(
      USER_STROKE_COLOR
    );
    await expect(lineWidthInput(), '四角形へ切替えた時点で線幅が既定へ戻っている').toHaveValue(
      String(USER_STROKE_WIDTH)
    );

    // 選択ツールを挟んでスタイルパネル自体を画面から消す
    await selectTool('選択');
    await expect(
      sharedPage.getByTestId('style-options'),
      '選択ツールでスタイルパネルが消えていない'
    ).toHaveCount(0);

    // 同じツール（矢印）へ戻す
    await selectTool('矢印');
    await expect(colorPicker(), '矢印へ戻した際に色が引き継がれていない').toHaveValue(
      USER_STROKE_COLOR
    );
    await expect(lineWidthInput(), '矢印へ戻した際に線幅が引き継がれていない').toHaveValue(
      String(USER_STROKE_WIDTH)
    );

    // 引き継いだ設定が実際の描画にも効いている（表示だけが据え置かれる片側復元ではない）
    const secondIndex = await drawArrow(CELLS[1]!);
    const second = await readAnnotationAt(secondIndex);
    expect(second.type, '再利用時に描かれた注釈が矢印でない').toBe('arrow');
    expect(second.stroke, '再利用時に描いた矢印の色が引き継がれていない').toBe(USER_STROKE_COLOR);
    expect(second.strokeWidth, '再利用時に描いた矢印の線幅が引き継がれていない').toBe(
      USER_STROKE_WIDTH
    );
  });

  /**
   * (c) 白縁取り有無もツール別にセッション内で引き継がれる
   *     Requirement 26.4（「色・線幅・白縁取り有無等」）
   *
   * `StyleOptions.outlineEnabled` はツール別の値を持つ。したがって
   * 「矢印で無効にした設定は矢印にのみ引き継がれ、四角形は既定（有効）のまま」が
   * 正しい振る舞いである。両方を具体値で確かめる。
   */
  test('(c) 白縁取りの有無もツール別にセッション内で引き継がれる', async () => {
    await enterEditMode(imageIds[2]!);
    await selectTool('矢印');

    // 既定は有効（Req 26.3 の初期状態。ここでは変更前の前提として固定する）
    await expect(outlineToggle(), '矢印の白縁取りが初期状態で無効').toBeChecked();

    await outlineToggle().click();
    await expect(outlineToggle(), '矢印の白縁取りが無効にならない').not.toBeChecked();

    const firstIndex = await drawArrow(CELLS[0]!);
    const first = await readAnnotationAt(firstIndex);
    expect(first.type, '描かれた注釈が矢印でない').toBe('arrow');
    expect(first.outlineEnabled, '無効にした白縁取りが描画へ反映されていない').toBe(false);

    // 四角形はツール別の既定値（有効）のまま
    await selectTool('四角形');
    await expect(
      outlineToggle(),
      '矢印での無効化が四角形にまで及んでいる（ツール別でない）'
    ).toBeChecked();

    // 選択ツールを挟んでスタイルパネル自体を画面から消す
    await selectTool('選択');
    await expect(
      sharedPage.getByTestId('style-options'),
      '選択ツールでスタイルパネルが消えていない'
    ).toHaveCount(0);

    // 矢印へ戻すと直前の設定（無効）が引き継がれる
    await selectTool('矢印');
    await expect(
      outlineToggle(),
      '矢印へ戻した際に白縁取りの設定が引き継がれていない'
    ).not.toBeChecked();

    const secondIndex = await drawArrow(CELLS[1]!);
    const second = await readAnnotationAt(secondIndex);
    expect(second.type, '再利用時に描かれた注釈が矢印でない').toBe('arrow');
    expect(second.outlineEnabled, '再利用時の描画に白縁取りの設定が引き継がれていない').toBe(false);
  });
});
