/**
 * @fileoverview 注釈編集画面の未実装だった受入基準の E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 8.5: テキストのフォントサイズ・色・背景色をカスタマイズ可能にする（背景色）
 * - 8.6: ユーザーが吹き出し形式を選択したとき、テキストを吹き出し形式で表示する
 * - 9.3: 注釈を編集中に画面を離れようとしたとき、未保存の変更があれば確認ダイアログを表示する
 * - 9.5: 注釈データの保存に失敗したとき、エラーメッセージを表示してリトライを促す
 * - 9.6: 注釈データを JSON 形式でエクスポート可能にする
 * - 13.5: 注釈データを保存したとき、操作履歴をクリアする
 *
 * Task 115.102:
 *   上記六件は要件が定めながら実装が存在せず、`e2e/requirement-exclusions.json` で
 *   E2E から除外されていた（除外の根拠は「キャンバス上の操作は E2E 範囲外」「保存失敗の
 *   模擬は E2E 範囲外」等で、いずれも未充足そのものを理由にしていた）。本 spec は
 *   本番の画面（画像ビューア → 編集モード → 道具帯 → 実キャンバス／保存／書き出し）を
 *   通して各受入基準へ到達することを観測する。
 *
 * 観測の方針:
 *   - 主張は具体値との一致で行い、「既定と異なる」等の否定形は控えの主張としてのみ用いる
 *   - 期待値は本番の定数を import せず直書きする（両辺が同時に動いて破れを見逃さないため）
 *   - 描画の有無は「シリアライズ結果が設定を持つこと」だけでなく、実際に塗られた画素の
 *     個数で確かめる（設定が形だけ流れて描画へ届かない未結線を検出するため）
 *   - API の観測はオリジンではなくパスで判定する（CI とローカルでオリジンが食い違うため）
 *
 * @requirement site-survey/REQ-8.5
 * @requirement site-survey/REQ-8.6
 * @requirement site-survey/REQ-9.3
 * @requirement site-survey/REQ-9.5
 * @requirement site-survey/REQ-9.6
 * @requirement site-survey/REQ-13.5
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext, type Route } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 文字注釈の背景色として選ぶ具体値（要件8.5）。写真は灰色系の雑音のため純緑とは重ならない。 */
const TEXT_BACKGROUND_COLOR = '#00ff00';

/** 吹き出しの塗り色（`DEFAULT_BALLOON_OPTIONS.backgroundColor` の具体値。要件8.6） */
const BALLOON_FILL_COLOR = '#ffffff';

/**
 * 塗りの有無を判定する画素数のしきい値
 *
 * 既定フォントサイズ 16px の文字「テキスト」の外形はおよそ 64x18 論理ピクセルであり、
 * 背景・吹き出しのいずれも数百画素を占める。写真（雑音）が同一の純色を偶然この個数だけ
 * 並べることはない。
 */
const PAINTED_PIXEL_THRESHOLD = 100;

/** 形状を描き分ける格子（キャンバス相対比率）。互いに重ならないよう割り当てる。 */
const CELLS: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }> = [
  { x0: 0.1, y0: 0.15, x1: 0.32, y1: 0.38 },
  { x0: 0.55, y0: 0.62, x1: 0.78, y1: 0.85 },
];

/** `window.__fabricCanvas` のうち本 spec が参照する範囲の最小型 */
interface ProbeCanvas {
  getObjects(): Array<ProbeObject>;
  getWidth(): number;
  getHeight(): number;
  backgroundImage?: unknown;
  lowerCanvasEl?: HTMLCanvasElement;
}

interface ProbeObject {
  type?: string;
  toObject(): Record<string, unknown>;
  getBoundingRect(): { left: number; top: number; width: number; height: number };
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 画像 1 枚あたりに用意するテスト用画像の枚数（検証ごとに 1 枚使う） */
const IMAGE_COUNT = 6;

test.describe('注釈編集画面の受入基準（背景色・吹き出し・離脱確認・再試行・書き出し・履歴破棄）', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let surveyName = '';

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

  /** 道具帯のスタイルパネルの入力 */
  function styleInput(testId: string) {
    return sharedPage.getByTestId('style-options').getByTestId(testId);
  }

  /** Fabric キャンバス上のオブジェクト数を取得する。 */
  async function getObjectCount(): Promise<number> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null }).__fabricCanvas;
      if (!canvas) return -1;
      return canvas.getObjects().length;
    });
  }

  /** 指定位置の注釈のシリアライズ結果を読む（総数が期待どおりであることも確かめる）。 */
  async function readSerializedAt(index: number, total: number): Promise<Record<string, unknown>> {
    const states = await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null }).__fabricCanvas;
      if (!canvas) return [];
      return canvas.getObjects().map((obj) => obj.toObject());
    });
    expect(states.length, '注釈の総数が期待と異なる').toBe(total);
    return states[index]!;
  }

  /**
   * 指定の注釈が占める領域のうち、与えた色でちょうど塗られている画素の個数を数える。
   *
   * 実際に描画キャンバスへ塗られた結果を数えるため、設定がシリアライズにだけ現れて
   * 描画へ届かない状態（未結線）を検出できる。
   *
   * @param index 対象注釈の位置
   * @param hex 数える色（`#rrggbb`）
   * @param margin 注釈の外形から外側へ広げる論理ピクセル数（吹き出しは外形の外へ描かれる）
   */
  async function countPaintedPixels(index: number, hex: string, margin = 0): Promise<number> {
    return await sharedPage.evaluate(
      ({ index, hex, margin }) => {
        const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null })
          .__fabricCanvas;
        if (!canvas) return -1;
        const obj = canvas.getObjects()[index];
        if (!obj) return -2;
        const el = canvas.lowerCanvasEl;
        if (!el) return -3;
        const ctx = el.getContext('2d');
        if (!ctx) return -4;

        // 描画キャンバスは端末画素比で拡大されていることがあるため、論理座標との比を取る
        const scaleX = el.width / canvas.getWidth();
        const scaleY = el.height / canvas.getHeight();

        const rect = obj.getBoundingRect();
        const left = Math.max(0, Math.floor((rect.left - margin) * scaleX));
        const top = Math.max(0, Math.floor((rect.top - margin) * scaleY));
        const right = Math.min(el.width, Math.ceil((rect.left + rect.width + margin) * scaleX));
        const bottom = Math.min(el.height, Math.ceil((rect.top + rect.height + margin) * scaleY));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) return -5;

        const target = {
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
        };

        const data = ctx.getImageData(left, top, width, height).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === target.r && data[i + 1] === target.g && data[i + 2] === target.b) {
            count += 1;
          }
        }
        return count;
      },
      { index, hex, margin }
    );
  }

  /**
   * テキストツールでキャンバス上へ文字注釈を 1 つ置き、編集モードを抜ける。
   *
   * 文字は既定の「テキスト」のまま用いる（要件8.7 のマルチバイト表示にも該当する内容）。
   */
  async function placeText(cell: (typeof CELLS)[number]): Promise<number> {
    // 直前に置いた文字注釈の編集状態を確実に終える。編集中は次のクリックが
    // 「編集の終了」に費やされ、新しい文字注釈が作られない（本番の仕様）。
    // ツールを一度離れて戻すと編集中の目印が落ちるため、その経路で状態を揃える。
    await selectTool('選択');
    await selectTool('テキスト');

    const box = await getCanvasBox();
    const countBefore = await getObjectCount();

    await sharedPage.mouse.click(box.x + box.width * cell.x0, box.y + box.height * cell.y0);

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: '文字注釈が作成されませんでした',
      })
      .toBe(countBefore + 1);

    // 文字入力の確定（Fabric の IText は Escape で編集を抜ける）
    await sharedPage.keyboard.press('Escape');
    return countBefore;
  }

  /** 矢印を 1 本描き、新しく作られた注釈の位置（添字）を返す。 */
  async function drawArrow(cell: (typeof CELLS)[number]): Promise<number> {
    const box = await getCanvasBox();
    const countBefore = await getObjectCount();

    await sharedPage.mouse.move(box.x + box.width * cell.x0, box.y + box.height * cell.y0);
    await sharedPage.mouse.down();
    await sharedPage.mouse.move(box.x + box.width * cell.x1, box.y + box.height * cell.y1, {
      steps: 12,
    });
    await sharedPage.mouse.up();

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: '矢印の描画でオブジェクトが作成されませんでした',
      })
      .toBe(countBefore + 1);

    return countBefore;
  }

  /** 保存ボタンを押し、注釈保存の応答（パス基準で判定）を待つ。 */
  async function saveAndWaitResponse(): Promise<{ status: number; requestBody: string }> {
    const responsePromise = sharedPage.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          /^\/api\/site-surveys\/images\/[0-9a-f-]+\/annotations$/.test(url.pathname) &&
          response.request().method() === 'PUT'
        );
      },
      { timeout: getTimeout(30000) }
    );
    await sharedPage.getByRole('button', { name: '保存', exact: true }).click();
    const response = await responsePromise;
    return {
      status: response.status(),
      requestBody: response.request().postData() ?? '',
    };
  }

  /** サーバーに保存されている注釈データを API から読む（パス基準の観測）。 */
  async function fetchStoredAnnotation(imageId: string): Promise<{
    status: number;
    objects: unknown[];
  }> {
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    const response = await sharedPage.request.get(
      `${API_BASE_URL}/api/site-surveys/images/${imageId}/annotations`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const body = (await response.json()) as { data?: { objects?: unknown[] } | null };
    return { status: response.status(), objects: body.data?.objects ?? [] };
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({ acceptDownloads: true });
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

    const projectName = `注釈受入E2E用PJ_${Date.now()}`;
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

    surveyName = `注釈受入E2E用調査_${Date.now()}`;
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

    for (let i = 0; i < IMAGE_COUNT; i++) {
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

    expect(new Set(imageIds).size, '検証用の画像が重複しています').toBe(IMAGE_COUNT);
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
   * (a) 文字注釈の背景色を選べる — Requirement 8.5
   *
   * 「選べる」は、道具帯に背景色の入力があり、選んだ色が実際に描かれる文字注釈へ
   * 届くことを指す。シリアライズ結果と、描画キャンバスへ塗られた画素の双方を見る。
   */
  test('(a) 文字注釈の背景色を道具帯で選ぶと、その色が実際に塗られる', async () => {
    await enterEditMode(imageIds[0]!);
    await selectTool('テキスト');

    // 既定は背景なし（透明）。前提を具体値で固定する。
    await expect(
      styleInput('text-background-toggle'),
      '文字背景の既定が「あり」になっている'
    ).not.toBeChecked();

    await styleInput('text-background-color-picker').fill(TEXT_BACKGROUND_COLOR);
    await expect(styleInput('text-background-color-picker')).toHaveValue(TEXT_BACKGROUND_COLOR);
    // 色を選ぶ操作は背景を付ける意図であるため、有無の切替も「あり」になる
    await expect(styleInput('text-background-toggle')).toBeChecked();

    const index = await placeText(CELLS[0]!);
    const serialized = await readSerializedAt(index, index + 1);

    expect(serialized.type, '置かれた注釈が文字注釈でない').toBe('textAnnotation');
    expect(serialized.backgroundColor, '文字注釈の背景色が選んだ色でない').toBe(
      TEXT_BACKGROUND_COLOR
    );

    const paintedWithBackground = await countPaintedPixels(index, TEXT_BACKGROUND_COLOR);
    expect(
      paintedWithBackground,
      '選んだ背景色が描画キャンバスへ塗られていない'
    ).toBeGreaterThanOrEqual(PAINTED_PIXEL_THRESHOLD);

    // 対照: 背景を「なし」に戻して置いた文字注釈には、当該の色が一切現れない
    await styleInput('text-background-toggle').uncheck();
    await expect(styleInput('text-background-toggle')).not.toBeChecked();

    const secondIndex = await placeText(CELLS[1]!);
    const secondSerialized = await readSerializedAt(secondIndex, secondIndex + 1);
    expect(secondSerialized.backgroundColor, '背景なしの文字注釈が背景色を持っている').toBe(
      'transparent'
    );

    const paintedWithoutBackground = await countPaintedPixels(secondIndex, TEXT_BACKGROUND_COLOR);
    expect(paintedWithoutBackground, '背景なしの文字注釈に背景色が塗られている').toBe(0);
  });

  /**
   * (b) 吹き出し形式を選ぶとテキストが吹き出し形式で表示される — Requirement 8.6
   *
   * 白アウトライン（要件25）は文字の周囲を白で描くため、吹き出しの塗り（白）と
   * 混ざらないよう切っておく。これにより「白い画素がある＝吹き出しが描かれた」となる。
   */
  test('(b) 吹き出し形式を選ぶと、その形の吹き出しが文字注釈へ描かれる', async () => {
    await enterEditMode(imageIds[1]!);
    await selectTool('テキスト');

    // 文字の白アウトラインを切る（吹き出しの塗りと同色のため観測が混ざる）
    await styleInput('outline-toggle').uncheck();
    await expect(styleInput('outline-toggle')).not.toBeChecked();

    // 既定は吹き出しなし。前提を具体値で固定する。
    await expect(styleInput('balloon-style'), '吹き出し形式の既定が「なし」でない').toHaveValue(
      'none'
    );

    await styleInput('balloon-style').selectOption('rounded');
    await expect(styleInput('balloon-style')).toHaveValue('rounded');

    const index = await placeText(CELLS[0]!);
    const serialized = await readSerializedAt(index, index + 1);

    expect(serialized.balloonStyle, '文字注釈が選んだ吹き出し形式を持っていない').toBe('rounded');

    // 吹き出しは文字の外形より外へ描かれるため、余白ぶん広げて数える
    const paintedWithBalloon = await countPaintedPixels(index, BALLOON_FILL_COLOR, 8);
    expect(paintedWithBalloon, '吹き出しが描画キャンバスへ描かれていない').toBeGreaterThanOrEqual(
      PAINTED_PIXEL_THRESHOLD
    );

    // 対照: 「なし」に戻して置いた文字注釈の周囲には吹き出しの塗りが現れない
    await styleInput('balloon-style').selectOption('none');
    await expect(styleInput('balloon-style')).toHaveValue('none');

    const secondIndex = await placeText(CELLS[1]!);
    const secondSerialized = await readSerializedAt(secondIndex, secondIndex + 1);
    expect(secondSerialized.balloonStyle, '吹き出しなしの文字注釈が形式を持っている').toBe('none');

    const paintedWithoutBalloon = await countPaintedPixels(secondIndex, BALLOON_FILL_COLOR, 8);
    expect(paintedWithoutBalloon, '吹き出しなしの文字注釈に吹き出しが描かれている').toBe(0);
  });

  /**
   * (c) 未保存のまま画面を離れようとすると確認が出る — Requirement 9.3
   */
  test('(c) 未保存の注釈がある状態で画面を離れようとすると確認ダイアログが出る', async () => {
    await enterEditMode(imageIds[2]!);
    await selectTool('矢印');
    await drawArrow(CELLS[0]!);

    const imageUrl = sharedPage.url();
    const surveyLink = sharedPage.getByRole('link', { name: surveyName, exact: true });
    await expect(surveyLink).toBeVisible({ timeout: getTimeout(10000) });

    // --- 未保存のまま離脱しようとすると確認が出て、とどまれば画面は変わらない ---
    await surveyLink.click();
    const dialogHeading = sharedPage.getByRole('heading', { name: '変更が保存されていません' });
    await expect(dialogHeading, '未保存のまま離脱しても確認が出なかった').toBeVisible({
      timeout: getTimeout(10000),
    });

    await sharedPage.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(dialogHeading).not.toBeVisible({ timeout: getTimeout(10000) });
    expect(sharedPage.url(), 'とどまる選択で画面が遷移してしまった').toBe(imageUrl);

    // --- 保存すると未保存ではなくなり、確認なしで離脱できる ---
    const saved = await saveAndWaitResponse();
    expect(saved.status, '注釈の保存が成功しなかった').toBe(200);
    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await sharedPage.getByRole('link', { name: surveyName, exact: true }).click();
    await expect(sharedPage, '保存後も離脱できなかった').toHaveURL(
      new RegExp(`/site-surveys/${createdSurveyId}$`),
      { timeout: getTimeout(15000) }
    );
    await expect(dialogHeading, '保存後にも確認ダイアログが出た').not.toBeVisible();
  });

  /**
   * (d) 保存に失敗したとき、エラー表示とともに再試行の導線が出る — Requirement 9.5
   */
  test('(d) 保存に失敗すると誤りの表示と再試行の導線が出て、再試行で保存できる', async () => {
    await enterEditMode(imageIds[3]!);
    await selectTool('矢印');
    await drawArrow(CELLS[0]!);

    // 注釈保存（PUT）だけを失敗させる。他のメソッド・経路は素通しする。
    const failSave = async (route: Route): Promise<void> => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Internal Server Error',
            status: 500,
            detail: '注釈の保存に失敗しました',
          }),
        });
        return;
      }
      await route.fallback();
    };
    await sharedPage.route('**/api/site-surveys/images/*/annotations', failSave);

    await sharedPage.getByRole('button', { name: '保存', exact: true }).click();

    await expect(sharedPage.getByRole('alert'), '保存失敗の誤りが表示されなかった').toBeVisible({
      timeout: getTimeout(20000),
    });
    const retryButton = sharedPage.getByTestId('save-retry-button');
    await expect(retryButton, '保存失敗時に再試行の導線が現れなかった').toBeVisible({
      timeout: getTimeout(10000),
    });

    // 失敗の要因を取り除いてから、再試行の導線で同じ保存をやり直す
    await sharedPage.unroute('**/api/site-surveys/images/*/annotations', failSave);

    const retryResponsePromise = sharedPage.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          /^\/api\/site-surveys\/images\/[0-9a-f-]+\/annotations$/.test(url.pathname) &&
          response.request().method() === 'PUT'
        );
      },
      { timeout: getTimeout(30000) }
    );
    await retryButton.click();
    const retryResponse = await retryResponsePromise;
    expect(retryResponse.status(), '再試行での保存が成功しなかった').toBe(200);

    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const stored = await fetchStoredAnnotation(imageIds[3]!);
    expect(stored.status, '再試行後の注釈取得が成功しなかった').toBe(200);
    expect(stored.objects.length, '再試行で保存された注釈の件数が期待と異なる').toBe(1);
  });

  /**
   * (e) 注釈データを JSON 形式で書き出せる — Requirement 9.6
   */
  test('(e) 注釈データを JSON 形式でエクスポートできる', async () => {
    await enterEditMode(imageIds[4]!);
    await selectTool('矢印');
    await drawArrow(CELLS[0]!);

    const saved = await saveAndWaitResponse();
    expect(saved.status, '注釈の保存が成功しなかった').toBe(200);

    await sharedPage.getByRole('button', { name: 'エクスポート', exact: true }).click();
    const exportJsonButton = sharedPage.getByTestId('export-annotation-json-button');
    await expect(exportJsonButton, '注釈データの書き出し導線が無い').toBeVisible({
      timeout: getTimeout(10000),
    });

    const downloadPromise = sharedPage.waitForEvent('download', { timeout: getTimeout(30000) });
    await exportJsonButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename(), '書き出されたファイル名が JSON でない').toMatch(/\.json$/);

    const downloadPath = await download.path();
    expect(downloadPath, '書き出されたファイルを取得できなかった').toBeTruthy();
    const content = fs.readFileSync(downloadPath!, 'utf-8');
    const parsed = JSON.parse(content) as { objects?: Array<{ type?: string }> };

    expect(parsed.objects?.length, '書き出された JSON の注釈件数が期待と異なる').toBe(1);
    expect(parsed.objects?.[0]?.type, '書き出された JSON の注釈種別が期待と異なる').toBe('arrow');
  });

  /**
   * (f) 保存で操作履歴を捨てる — Requirement 13.5
   *
   * 事故の筋書き（保存成功 → 古い履歴を復元 → 次の保存で行が消える）が再現しないことを
   * 固定する。保存後に「元に戻す」が使えないこと、取り消し操作を試みても注釈が減らないこと、
   * その状態での再保存でサーバー上の注釈が減らないことを順に確かめる。
   */
  test('(f) 保存すると操作履歴が捨てられ、取り消しで保存済みの注釈が消えない', async () => {
    await enterEditMode(imageIds[5]!);
    await selectTool('矢印');
    await drawArrow(CELLS[0]!);
    await drawArrow(CELLS[1]!);

    const undoButton = sharedPage.getByRole('button', { name: '元に戻す', exact: true });
    await expect(undoButton, '描画後に「元に戻す」が使えない').toBeEnabled();

    const firstSave = await saveAndWaitResponse();
    expect(firstSave.status, '注釈の保存が成功しなかった').toBe(200);
    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 保存で履歴が捨てられている（＝取り消せる操作が残っていない）
    await expect(undoButton, '保存後も「元に戻す」が使える（履歴が残っている）').toBeDisabled();

    // 取り消しの近道キーでも保存済みの注釈は減らない
    await sharedPage.getByTestId('annotation-editor-container').focus();
    await sharedPage.keyboard.press('Control+z');
    await sharedPage.keyboard.press('Control+z');

    const secondSave = await saveAndWaitResponse();
    expect(secondSave.status, '再保存が成功しなかった').toBe(200);

    const savedPayload = JSON.parse(secondSave.requestBody) as {
      data?: { objects?: unknown[] };
    };
    expect(
      savedPayload.data?.objects?.length,
      '取り消し操作の後の保存で送られた注釈の件数が減っている'
    ).toBe(2);

    expect(await getObjectCount(), '取り消し操作でキャンバス上の注釈が減っている').toBe(2);

    const stored = await fetchStoredAnnotation(imageIds[5]!);
    expect(stored.status, '保存済み注釈の取得が成功しなかった').toBe(200);
    expect(stored.objects.length, 'サーバー上の注釈が取り消し操作で消えている').toBe(2);
  });
});
