/**
 * @fileoverview 白縁取り（テキストは白アウトライン）の切替UIの E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 24.5: 矢印の描画設定を切り替えるとき、白縁取りの有効/無効をユーザーが任意に切替可能にする
 * - 25.2: テキストの白アウトラインの有効/無効をユーザーが任意に切替可能にする
 * - 32.5: 寸法線・円・四角形・多角形・折れ線・フリーハンドの描画設定を切り替えるとき、
 *         白縁取りの有効/無効をユーザーが任意に切替可能にする
 * - 24.10 / 25.11 / 32.10: 白縁取り（白アウトライン）の切替を Undo/Redo 履歴に記録する
 * - 15.2: タッチデバイスで操作するとき、タッチ操作に最適化された注釈ツールを提供する
 *
 * Task 115.96:
 *   切替UIは、本番の描画経路から一度も参照されていない `StylePanel.tsx` にしか存在せず
 *   （しかも矢印と文字だけで図形六種を持たない）、実際に描かれる道具帯のスタイルパネルには
 *   切替の操作要素が無かった。型（`StyleOptions`）にも白縁取りの項目が無く、切替は
 *   表現できなかった。本 spec は「部品はあるが結線が無い」形の欠陥を単体検証の緑で
 *   見逃さないため、本番の画面（画像ビューア → 編集モード → ツール選択）から切替へ到達し、
 *   切替の結果が実際に描かれる注釈へ反映されることを実ブラウザで観測する。
 *
 * 構成:
 *   (a) 全ての描画ツールで切替が現れ、既定は有効（Req 24.5, 25.2, 32.5 / 26.3, 32.11）
 *   (b) 切替を無効にして描いた注釈は白縁取り無しで作られる（矢印・図形六種）
 *   (c) 切替を無効にして置いたテキストは白アウトライン無しで作られる（Req 25.2）
 *   (d) 切替は Undo/Redo 履歴に記録される（Req 24.10, 25.11, 32.10）
 *   (e) 無効にして描いた注釈は保存・リロード後も無効のまま復元される（Req 24.7, 25.8, 32.7）
 *   (f) 属性パネルの各項目のタップ領域がモバイル幅で 44x44 論理ピクセル以上（Req 28.3, 15.2）
 *
 * Task 115.148:
 *   切替のタップ領域は 18x18 論理ピクセルで、隣接する色の選択（32x24）・線幅の入力
 *   （60x24）より小さかった。現場のスマートフォン操作では隣より小さい操作要素が押し間違いを
 *   招く。当時 (f) は相対関係（隣接要素より小さくない）だけを主張していた。要件28.3 の
 *   適用範囲が未決着で、絶対値を持ち込むと決着を先取りしてしまうためである。
 *
 * Task 115.170:
 *   要件28.3 の適用範囲を決着させ、条文どおり「モバイル幅ツールバーの各項目」へ 44x44 を
 *   適用した。決着に伴い (f) の主張を相対関係から絶対値（44x44 以上）へ置き換えた。
 *
 * @requirement site-survey/REQ-24.5
 * @requirement site-survey/REQ-25.2
 * @requirement site-survey/REQ-32.5
 * @requirement site-survey/REQ-24.10
 * @requirement site-survey/REQ-25.11
 * @requirement site-survey/REQ-32.10
 * @requirement site-survey/REQ-15.2
 * @requirement site-survey/REQ-28.3
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { getFabricObjectCount } from '../../helpers/fabric-canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 描画ツールの定義（道具帯のボタン aria-label と Fabric の登録 type） */
interface OutlineToolDefinition {
  /** 道具帯のツールボタン aria-label */
  readonly toolLabel: string;
  /** 切替の見出し（テキストだけ「白アウトライン」） */
  readonly toggleLabel: string;
  /** Fabric に登録された type 値（`registerCustomShapes` の登録 ID） */
  readonly objectType: string;
  /** 当該ツールの確定操作 */
  readonly gesture: 'drag' | 'polygon' | 'polyline' | 'freehand' | 'click';
  /**
   * 当該ツールの属性パネルに並ぶ「切替以外」の操作要素の個数（(f) の数える範囲の宣言）
   *
   * 対象は `data-testid="style-options"` 配下の `input` / `select` のうち
   * `type="checkbox"` でないもの。色・塗りつぶし・文字色・背景色（color）、線幅・
   * フォントサイズ（number）、吹き出し（select）が該当する。
   */
  readonly nonToggleControlCount: number;
  /**
   * 当該ツールの属性パネルに並ぶ切替（`type="checkbox"`）の個数（(f) の数える範囲の宣言）
   *
   * テキストだけは白アウトラインの切替に加えて文字の背景の切替を持つため 2 個になる。
   */
  readonly toggleControlCount: number;
}

/**
 * 切替UIを持つべき全ツール。
 *
 * 要件 24.5（矢印）・25.2（テキスト）・32.5（寸法線・円・四角形・多角形・折れ線・
 * フリーハンド）の対象を合わせると描画ツール全体になる。選択ツールは注釈を描かないため
 * 対象外であり、切替も出ない。
 */
const OUTLINE_TOOLS: ReadonlyArray<OutlineToolDefinition> = [
  {
    toolLabel: '矢印',
    toggleLabel: '白縁取り',
    objectType: 'arrow',
    gesture: 'drag',
    nonToggleControlCount: 2,
    toggleControlCount: 1,
  },
  {
    toolLabel: '寸法線',
    toggleLabel: '白縁取り',
    objectType: 'dimensionLine',
    gesture: 'drag',
    nonToggleControlCount: 2,
    toggleControlCount: 1,
  },
  {
    toolLabel: '円',
    toggleLabel: '白縁取り',
    objectType: 'circleShape',
    gesture: 'drag',
    nonToggleControlCount: 3,
    toggleControlCount: 1,
  },
  {
    toolLabel: '四角形',
    toggleLabel: '白縁取り',
    objectType: 'rectangleShape',
    gesture: 'drag',
    nonToggleControlCount: 3,
    toggleControlCount: 1,
  },
  {
    toolLabel: '多角形',
    toggleLabel: '白縁取り',
    objectType: 'polygonShape',
    gesture: 'polygon',
    nonToggleControlCount: 3,
    toggleControlCount: 1,
  },
  {
    toolLabel: '折れ線',
    toggleLabel: '白縁取り',
    objectType: 'polylineShape',
    gesture: 'polyline',
    nonToggleControlCount: 2,
    toggleControlCount: 1,
  },
  {
    toolLabel: 'フリーハンド',
    toggleLabel: '白縁取り',
    objectType: 'freehand',
    gesture: 'freehand',
    nonToggleControlCount: 2,
    toggleControlCount: 1,
  },
  {
    toolLabel: 'テキスト',
    toggleLabel: '白アウトライン',
    objectType: 'textAnnotation',
    gesture: 'click',
    nonToggleControlCount: 4,
    toggleControlCount: 2,
  },
] as const;

/**
 * (f) が用いるモバイル幅（iPhone SE 相当）。要件28.3 の対象は「モバイル幅ツールバー」であり、
 * デスクトップ幅のままでは条文の対象を測れない。
 */
const MOBILE_VIEWPORT = { width: 375, height: 667 };

/** 要件28.3 が定めるタップ領域の下限（論理ピクセル） */
const MIN_TAP_TARGET_PX = 44;

/** 形状を描き分ける格子（キャンバス相対比率）。互いに重ならないよう割り当てる。 */
const CELLS: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }> = [
  { x0: 0.06, y0: 0.1, x1: 0.22, y1: 0.32 },
  { x0: 0.28, y0: 0.1, x1: 0.44, y1: 0.32 },
  { x0: 0.5, y0: 0.1, x1: 0.66, y1: 0.32 },
  { x0: 0.72, y0: 0.1, x1: 0.88, y1: 0.32 },
  { x0: 0.06, y0: 0.42, x1: 0.22, y1: 0.64 },
  { x0: 0.28, y0: 0.42, x1: 0.44, y1: 0.64 },
  { x0: 0.5, y0: 0.42, x1: 0.66, y1: 0.64 },
  { x0: 0.72, y0: 0.42, x1: 0.88, y1: 0.64 },
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
    outline?: { enabled?: boolean };
    textOutline?: { enabled?: boolean };
  };
  _objects?: Array<{ opacity?: number }>;
  stroke?: string | null;
  paintFirst?: string;
}

/** 白色の表現ゆれ（`white` / `#fff` / `#ffffff` / `rgb(255,255,255)`）を受け入れる正規表現 */
const WHITE_PATTERN = /^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i;

/**
 * 注釈ごとの白縁取り状態（page.evaluate の戻り値）
 *
 * 属性としての白縁取り（`toObject().outline` / `toObject().textOutline`）に加え、
 * 実際に描かれている縁取りの可視性も読み出す。属性だけを見ると、属性は正しいのに
 * 描画へ反映されない欠陥（およびその逆）を見逃すため。
 */
interface OutlineState {
  type: string;
  /** 白縁取り/白アウトラインが属性として有効か */
  enabled: boolean;
  /** 属性そのものが存在するか（後方互換の「属性なし」と区別する） */
  hasAttribute: boolean;
  /**
   * 実描画の縁取りの不透明度。
   * 6 形状と矢印は Group の第1子が縁取り Path であり、無効時は opacity=0 になる。
   * テキストは Group ではないため -1（本欄では判定しない）。
   */
  renderedOutlineOpacity: number;
  /**
   * テキストの実描画のアウトライン色。
   *
   * テキストの白アウトラインは `paintFirst: 'stroke'` + 白 `stroke` で描かれる。
   * 無効のまま生成された注釈は `stroke` を持たない（Fabric 既定の `strokeWidth` は
   * 残るが、`stroke` が無ければ線は描かれない）。したがって線幅ではなく色で判定する。
   */
  renderedTextStroke: string | null;
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

test.describe('白縁取り切替UI', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  /** (a)〜(d) 用の画像 */
  let toggleImageId: string | null = null;
  /** (e) 用の画像。保存・復元を他の検証と混ぜないために分ける。 */
  let persistImageId: string | null = null;

  /**
   * upper-canvas の bounding box を、Fabric の実サイズ・背景画像の設定完了・
   * 位置の安定を満たすまで待って取得する。
   */
  async function getCanvasBox(): Promise<CanvasBox> {
    const upperCanvas = sharedPage.locator('.upper-canvas');
    let lastBox: CanvasBox | null = null;
    let stableCount = 0;

    for (let i = 0; i < 30; i++) {
      const box = await upperCanvas.boundingBox();
      const fabricSize = await sharedPage.evaluate(() => {
        const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null })
          .__fabricCanvas;
        if (!canvas) return null;
        return {
          width: canvas.getWidth(),
          height: canvas.getHeight(),
          hasBackground: canvas.backgroundImage !== null && canvas.backgroundImage !== undefined,
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
        lastBox !== null &&
        Math.abs(box.x - lastBox.x) < 1 &&
        Math.abs(box.y - lastBox.y) < 1;

      if (sizeMatches && positionStable) {
        stableCount += 1;
        if (stableCount >= 2) {
          return box;
        }
      } else {
        stableCount = 0;
      }
      lastBox = box;
      await sharedPage.waitForTimeout(200);
    }

    throw new Error('注釈キャンバスが安定した状態になりませんでした');
  }

  /** 画像ビューアを開き、編集モードへ入って注釈ツールバーの表示を待つ。 */
  async function enterEditMode(imageId: string | null = toggleImageId): Promise<void> {
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

  /** 白縁取り切替のチェックボックス（描画ツール選択中のみ存在する） */
  function outlineToggle() {
    return sharedPage.getByTestId('outline-toggle');
  }

  /**
   * 白縁取り切替を指定の状態にする。
   *
   * 既に指定の状態なら操作しない、という分岐を持たせない（検証を分岐で包まないため、
   * また Undo 履歴へ積む回数を検証側で確定させるため）。呼び出し側は現在の状態を
   * 確かめてから、変えたいときだけ本関数を呼ぶ。
   */
  async function clickOutlineToggle(): Promise<void> {
    const toggle = outlineToggle();
    await expect(toggle, '白縁取りの切替が道具帯に無い').toBeVisible({
      timeout: getTimeout(10000),
    });
    await toggle.click();
  }

  /**
   * Fabric キャンバス上のオブジェクト数を取得する。
   *
   * Task 115.184: 描画面が取得できない場合は負の番兵値を返さず投げる
   * （`getFabricObjectCount` が担う）。番兵値は実際の件数と同じ `number` に同居し、
   * 増分の主張が「不在（-1）から零（0）へ」でも成立してしまうためである。
   */
  async function getObjectCount(): Promise<number> {
    return await getFabricObjectCount(sharedPage);
  }

  /** キャンバス上の全注釈について白縁取り状態を読み出す。 */
  async function readOutlineStates(): Promise<OutlineState[]> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: ProbeCanvas | null }).__fabricCanvas;
      if (!canvas) return [];
      return canvas.getObjects().map((obj) => {
        const serialized = obj.toObject();
        const shapeOutline = serialized.outline;
        const textOutline = serialized.textOutline;
        const children = obj._objects ?? [];
        const outlineChild = children[0];
        return {
          type: serialized.type ?? obj.type ?? 'unknown',
          enabled: (shapeOutline?.enabled ?? textOutline?.enabled) === true,
          hasAttribute: shapeOutline !== undefined || textOutline !== undefined,
          renderedOutlineOpacity: outlineChild?.opacity ?? -1,
          // テキストは IText 系。白アウトラインは paintFirst='stroke' + 白 stroke で描かれる。
          renderedTextStroke: obj.stroke ?? null,
        };
      });
    });
  }

  /** 指定ツールで 1 つ注釈を描き、オブジェクトが 1 つ増えたことを確認する。 */
  async function drawWithTool(
    tool: OutlineToolDefinition,
    cell: { x0: number; y0: number; x1: number; y1: number },
    box: CanvasBox
  ): Promise<void> {
    const left = box.x + box.width * cell.x0;
    const top = box.y + box.height * cell.y0;
    const right = box.x + box.width * cell.x1;
    const bottom = box.y + box.height * cell.y1;

    const countBefore = await getObjectCount();

    if (tool.gesture === 'drag') {
      await sharedPage.mouse.move(left, top);
      await sharedPage.mouse.down();
      await sharedPage.mouse.move(right, bottom, { steps: 12 });
      await sharedPage.mouse.up();
    } else if (tool.gesture === 'polygon') {
      await sharedPage.mouse.click(left, top);
      await sharedPage.mouse.click(right, top);
      await sharedPage.mouse.click(right, bottom);
      await sharedPage.mouse.dblclick(left, top);
    } else if (tool.gesture === 'polyline') {
      await sharedPage.mouse.click(left, bottom);
      await sharedPage.mouse.click((left + right) / 2, top);
      await sharedPage.mouse.dblclick(right, bottom);
    } else if (tool.gesture === 'freehand') {
      await sharedPage.mouse.move(left, top);
      await sharedPage.mouse.down();
      await sharedPage.mouse.move((left + right) / 2, bottom, { steps: 10 });
      await sharedPage.mouse.move(right, top, { steps: 10 });
      await sharedPage.mouse.up();
    } else {
      // テキスト: クリックで配置し、編集モードへ入る。Escape で確定して抜ける。
      await sharedPage.mouse.click(left, top);
      await sharedPage.keyboard.press('Escape');
    }

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: `${tool.toolLabel} の描画でオブジェクトが作成されませんでした`,
      })
      .toBe(countBefore + 1);
  }

  /** 直近に作られた注釈（末尾）の白縁取り状態を読む。 */
  async function readLastOutlineState(): Promise<OutlineState> {
    const states = await readOutlineStates();
    const last = states[states.length - 1];
    expect(last, '注釈が 1 つも作られていない').toBeTruthy();
    return last!;
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

    const projectName = `白縁取り切替E2E用PJ_${Date.now()}`;
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

    const surveyName = `白縁取り切替E2E用調査_${Date.now()}`;
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

    // --- 画像を API で直接アップロード（8 ツールを描き分ける広さを確保する） ---
    const testImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    const imageBuffer = fs.readFileSync(testImagePath);

    async function uploadImage(): Promise<string | null> {
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
      return uploadBody.successful?.[0]?.id ?? null;
    }

    toggleImageId = await uploadImage();
    expect(toggleImageId).toBeTruthy();

    persistImageId = await uploadImage();
    expect(persistImageId).toBeTruthy();
    expect(persistImageId).not.toBe(toggleImageId);
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
   * (a) 本番の画面で、全ての描画ツールに白縁取りの切替が現れる
   *     Requirement 24.5, 25.2, 32.5（および初期状態について 26.3, 32.11）
   */
  test('(a) 全ての描画ツールの描画設定に白縁取りの切替が現れ、初期状態は有効である', async () => {
    await enterEditMode();

    for (const tool of OUTLINE_TOOLS) {
      await selectTool(tool.toolLabel);

      const toggle = outlineToggle();
      await expect(toggle, `${tool.toolLabel}: 白縁取りの切替が道具帯に無い`).toBeVisible({
        timeout: getTimeout(10000),
      });
      // 見出しはテキストだけ「白アウトライン」（要件 25.2 の語）
      await expect(
        sharedPage.getByTestId('style-options').getByLabel(tool.toggleLabel),
        `${tool.toolLabel}: 切替の見出しが「${tool.toggleLabel}」でない`
      ).toBeVisible();
      // Req 26.3 / 32.11: 初回選択時は白縁取りが有効な初期状態で起動する
      await expect(toggle, `${tool.toolLabel}: 初期状態で白縁取りが無効`).toBeChecked();
    }

    // 選択ツールは注釈を描かないため切替を出さない
    await selectTool('選択');
    await expect(outlineToggle()).toHaveCount(0);
  });

  /**
   * (b) 切替を無効にして描いた矢印・図形六種は白縁取り無しで作られる
   *     Requirement 24.5, 32.5
   */
  test('(b) 切替を無効にして描いた矢印・図形六種は白縁取り無しで作られる', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    // テキストは (c) で扱う（属性の系統が textOutline で異なるため）
    const shapeTools = OUTLINE_TOOLS.filter((tool) => tool.gesture !== 'click');

    for (const [index, tool] of shapeTools.entries()) {
      await selectTool(tool.toolLabel);
      await expect(outlineToggle(), `${tool.toolLabel}: 初期状態で白縁取りが無効`).toBeChecked();

      // 切替を無効にしてから描く
      await clickOutlineToggle();
      await expect(outlineToggle(), `${tool.toolLabel}: 切替が無効にならない`).not.toBeChecked();

      await drawWithTool(tool, CELLS[index]!, box);

      const state = await readLastOutlineState();
      expect(state.type, `${tool.toolLabel}: 作られた注釈の種別が異なる`).toBe(tool.objectType);
      expect(state.hasAttribute, `${tool.toolLabel}: 白縁取り属性が注釈に無い`).toBe(true);
      expect(state.enabled, `${tool.toolLabel}: 切替を無効にしたのに白縁取りが有効`).toBe(false);
      expect(
        state.renderedOutlineOpacity,
        `${tool.toolLabel}: 白縁取りが無効なのに縁取り線が描かれている`
      ).toBe(0);
    }
  });

  /**
   * (c) 切替を無効にして置いたテキストは白アウトライン無しで作られる
   *     Requirement 25.2
   */
  test('(c) 切替を無効にして置いたテキストは白アウトライン無しで作られる', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    const textTool = OUTLINE_TOOLS.find((tool) => tool.toolLabel === 'テキスト')!;
    await selectTool(textTool.toolLabel);
    await expect(outlineToggle(), 'テキスト: 初期状態で白アウトラインが無効').toBeChecked();

    await clickOutlineToggle();
    await expect(outlineToggle(), 'テキスト: 切替が無効にならない').not.toBeChecked();

    await drawWithTool(textTool, CELLS[0]!, box);

    const state = await readLastOutlineState();
    expect(state.type, '作られた注釈がテキストでない').toBe(textTool.objectType);
    expect(state.hasAttribute, '白アウトライン属性がテキスト注釈に無い').toBe(true);
    expect(state.enabled, '切替を無効にしたのに白アウトラインが有効').toBe(false);
    expect(
      WHITE_PATTERN.test(state.renderedTextStroke ?? ''),
      `白アウトラインが無効なのに白い輪郭線が描かれている（stroke=${state.renderedTextStroke}）`
    ).toBe(false);
  });

  /**
   * (d) 切替は Undo/Redo 履歴に記録される
   *     Requirement 24.10, 25.11, 32.10
   *
   * 「履歴に記録される」は、切替の取り消しで切替前の状態へ戻り、やり直しで再び適用される
   * ことを指す。画面上の切替の状態と、その後に描かれる注釈の双方で確かめる。
   *
   * 取り消しとやり直しの間に描画を挟まない。`UndoManager` は新しい操作を積むと
   * やり直しの候補を捨てるため、間に描画を挟むと切替のやり直し自体が到達不能になり、
   * 描画のやり直しを見ているだけの検証にすり替わる。
   */
  test('(d) 白縁取りの切替が Undo/Redo 履歴に記録される', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    await selectTool('矢印');
    await expect(outlineToggle(), '矢印: 初期状態で白縁取りが無効').toBeChecked();

    // 切替を無効にする
    await clickOutlineToggle();
    await expect(outlineToggle(), '切替が無効にならない').not.toBeChecked();

    // Undo で切替前（有効）へ戻る
    await sharedPage.getByRole('button', { name: '元に戻す', exact: true }).click();
    await expect(
      outlineToggle(),
      'Undo しても切替が戻らない（履歴に記録されていない）'
    ).toBeChecked();

    // Redo で切替（無効）が再適用される
    await sharedPage.getByRole('button', { name: 'やり直し', exact: true }).click();
    await expect(
      outlineToggle(),
      'Redo しても切替が再適用されない（履歴に記録されていない）'
    ).not.toBeChecked();

    // やり直した状態が実際の描画にも効いている（画面表示だけが戻る片側復元ではない）
    const arrowTool = OUTLINE_TOOLS.find((tool) => tool.toolLabel === '矢印')!;
    await drawWithTool(arrowTool, CELLS[0]!, box);
    const afterRedo = await readLastOutlineState();
    expect(afterRedo.type, 'Redo 後に描いた注釈が矢印でない').toBe(arrowTool.objectType);
    expect(afterRedo.enabled, 'Redo で戻した切替が描画へ反映されていない').toBe(false);
  });

  /**
   * (e) 切替を無効にして描いた注釈は、保存・リロード後も無効のまま復元される
   *     Requirement 24.6, 24.7, 32.6, 32.7
   *
   * 切替が「その場の見た目だけ」で終わっていないこと（永続化と復元の経路まで通ること）を
   * 確かめる。
   */
  test('(e) 切替を無効にして描いた注釈は保存・リロード後も無効のまま復元される', async () => {
    await enterEditMode(persistImageId);
    const box = await getCanvasBox();

    const rectangleTool = OUTLINE_TOOLS.find((tool) => tool.toolLabel === '四角形')!;
    await selectTool(rectangleTool.toolLabel);
    await clickOutlineToggle();
    await expect(outlineToggle(), '切替が無効にならない').not.toBeChecked();
    await drawWithTool(rectangleTool, CELLS[0]!, box);

    const beforeSave = await readLastOutlineState();
    expect(beforeSave.enabled, '保存前の時点で白縁取りが無効になっていない').toBe(false);

    // --- 保存 ---
    const thumbnailResponsePromise = sharedPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/annotated-thumbnail') &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(60000) }
    );
    await sharedPage.getByRole('button', { name: '保存', exact: true }).click();
    const thumbnailResponse = await thumbnailResponsePromise;
    expect(thumbnailResponse.status()).toBe(200);
    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // --- リロードして復元を確認 ---
    await enterEditMode(persistImageId);
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存した注釈がリロード後に復元されませんでした',
      })
      .toBe(1);

    const restored = await readLastOutlineState();
    expect(restored.type, '復元された注釈の種別が異なる').toBe(rectangleTool.objectType);
    expect(restored.hasAttribute, '復元後に白縁取り属性が失われている').toBe(true);
    expect(restored.enabled, '無効にして保存した白縁取りが有効で復元されている').toBe(false);
    expect(restored.renderedOutlineOpacity, '復元後に縁取り線が描かれている').toBe(0);
  });

  /**
   * (f) 属性パネルの各項目のタップ領域が、モバイル幅で 44x44 論理ピクセル以上である
   *     Requirement 28.3（モバイル幅ツールバーの各項目のタップ領域）
   *     Requirement 15.2（タッチ操作に最適化された注釈ツールを提供する）
   *
   * Task 115.170 で要件28.3 の適用範囲を決着させた。条文の「各項目」は道具のボタンだけを
   * 指すのではなく、モバイル幅ツールバーに現れる操作要素の全てを指す。属性パネルの操作要素
   * （切替・色・線幅・文字サイズ・吹き出し）も対象であり、実装をそこへ追随させた。
   * これに伴い本検証は、Task 115.148 が置いた相対関係（隣接要素より小さくない）の主張を
   * 絶対値（44x44 以上）の主張へ置き換えた。
   *
   * 幅を切替える理由: 本 spec の共有ページはデスクトップ幅（Desktop Chrome の既定）で動く。
   * 要件28.3 が対象を「モバイル幅ツールバー」と限っているため、本検証だけは実際にモバイル幅
   * （375x667）へ切替えて測る。測り終えたら元の幅へ戻す。
   *
   * 数える範囲（先に宣言する）: `data-testid="style-options"` 配下の `input` と `select`
   * の全て。ツールごとの個数は `OutlineToolDefinition.nonToggleControlCount` /
   * `toggleControlCount` として上の表に宣言してあり、実測がそれと一致することを先に
   * 確かめる（要素を数え漏らしたまま主張が通ることを防ぐ）。
   *
   * 主張の対象は白縁取りの切替だけでなくパネル内の操作要素の全部である。片方だけを広げると、
   * 隣り合う操作要素どうしで同じ欠陥（隣より小さい操作要素）が再発するため。
   *
   * @requirement site-survey/REQ-28.3
   * @requirement site-survey/REQ-15.2
   *
   * タスク 115.188 の追記: 表題の `(site-survey/REQ-28.3/REQ-15.2)` という連結表記は、
   * 被覆印の読み取り規則が二つ目の番号を拾わないため REQ-15.2 の主張が読まれていなかった。
   */
  test('(f) 属性パネルの各項目がモバイル幅で 44x44 以上のタップ領域を持つ (site-survey/REQ-28.3/REQ-15.2)', async () => {
    await enterEditMode();

    const desktopViewport = sharedPage.viewportSize();
    expect(desktopViewport, '元のビューポート寸法が取得できない').not.toBeNull();

    try {
      await sharedPage.setViewportSize(MOBILE_VIEWPORT);

      for (const tool of OUTLINE_TOOLS) {
        await selectTool(tool.toolLabel);
        await expect(outlineToggle(), `${tool.toolLabel}: 切替が道具帯に無い`).toBeVisible({
          timeout: getTimeout(10000),
        });

        const controls = await sharedPage
          .getByTestId('style-options')
          .locator('input, select')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                testId: element.getAttribute('data-testid') ?? '',
                label: element.getAttribute('aria-label') ?? '',
                isToggle:
                  element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'checkbox',
                width: rect.width,
                height: rect.height,
              };
            })
          );

        const toggles = controls.filter((control) => control.isToggle);
        const others = controls.filter((control) => !control.isToggle);

        expect(
          toggles.map((control) => control.testId),
          `${tool.toolLabel}: 属性パネルの切替の個数が宣言と一致しない`
        ).toHaveLength(tool.toggleControlCount);
        expect(
          others.map((control) => control.testId),
          `${tool.toolLabel}: 属性パネルの切替以外の操作要素の個数が宣言と一致しない`
        ).toHaveLength(tool.nonToggleControlCount);
        expect(
          toggles.map((control) => control.testId),
          `${tool.toolLabel}: 白縁取りの切替が数える範囲に入っていない`
        ).toContain('outline-toggle');

        for (const control of controls) {
          const name = `${tool.toolLabel}: 項目「${control.label || control.testId}」`;
          expect(
            control.width,
            `${name}の幅 ${control.width} が ${MIN_TAP_TARGET_PX}px 未満`
          ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
          expect(
            control.height,
            `${name}の高さ ${control.height} が ${MIN_TAP_TARGET_PX}px 未満`
          ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
        }
      }
    } finally {
      if (desktopViewport) {
        await sharedPage.setViewportSize(desktopViewport);
      }
    }
  });
});
