/**
 * @fileoverview 6 形状（四角形/円/多角形/折れ線/フリーハンド/寸法線）の
 *               白縁取り表現の保存・復元 E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 32.1: 6 形状すべてに白色の縁取り線を付与して表示する
 * - 32.6: 白縁取り属性を注釈データに含めて永続化する
 * - 32.7: 保存済みの対象注釈を再表示する際に白縁取り属性を復元する
 * - 32.8: 既存の復元経路（enlivenObjects）で白縁取り属性が復元される
 * - 32.12: 寸法線の寸法値ラベルにも白アウトライン表現を適用する
 * - 32.14: 保存時に白縁取りを含む最終状態のサムネイルを再生成する
 *
 * Task 115.48（AI運用7原則 第3原則）:
 *   本 spec は以前 `E2E_SURVEY_ID` / `E2E_IMAGE_ID` の有無で `test.skip` する構成であり、
 *   当該環境変数はリポジトリのどこにも設定されていないため全件が恒久的に飛ばされていた。
 *   前提となるプロジェクト・現場調査・画像は検証の中で用意する。用意できない場合は
 *   飛ばさずに失敗させる。
 *
 * 構成:
 *   (a) 四角形・円・多角形・折れ線・寸法線の描画→保存→リロード→復元
 *   (b) 寸法線の寸法値ラベルの白アウトライン
 *   (c) フリーハンドの描画→保存→リロード→復元（他形状と挙動が異なるため独立）
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.6
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.8
 * @requirement site-survey/REQ-32.12
 * @requirement site-survey/REQ-32.14
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 形状定義（ツール名・Fabric の登録 type・確定操作） */
interface ShapeDefinition {
  readonly toolLabel: string;
  readonly objectType: string;
  readonly gesture: 'drag' | 'polygon' | 'polyline';
}

/**
 * 保存・復元をまとめて検証する 5 形状の定義。
 *
 * `toolLabel` は AnnotationToolbar のボタン aria-label、
 * `objectType` は Fabric に登録された type 値（`registerCustomShapes` の登録 ID）。
 * `gesture` は当該ツールの確定操作（ドラッグ / 頂点クリック＋ダブルクリック）。
 *
 * フリーハンドは別テストへ分離している（末尾の (c) を参照）。
 */
const SHAPE_DEFINITIONS: ReadonlyArray<ShapeDefinition> = [
  { toolLabel: '四角形', objectType: 'rectangleShape', gesture: 'drag' },
  { toolLabel: '円', objectType: 'circleShape', gesture: 'drag' },
  { toolLabel: '多角形', objectType: 'polygonShape', gesture: 'polygon' },
  { toolLabel: '折れ線', objectType: 'polylineShape', gesture: 'polyline' },
  { toolLabel: '寸法線', objectType: 'dimensionLine', gesture: 'drag' },
] as const;

/**
 * フリーハンドの定義。要件 32 の対象 6 形状の一つだが、他形状と挙動が異なるため
 * 独立したテストで検証する（他形状の検証結果を巻き込まずに欠陥を示すため）。
 */
const FREEHAND_DEFINITION: ShapeDefinition = {
  toolLabel: 'フリーハンド',
  objectType: 'freehand',
  gesture: 'drag',
} as const;

/** 描画位置の割り当て（キャンバス相対比率）。形状同士が重ならないよう格子状に配置する。 */
const SHAPE_CELLS: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }> = [
  { x0: 0.08, y0: 0.12, x1: 0.26, y1: 0.38 },
  { x0: 0.36, y0: 0.12, x1: 0.54, y1: 0.38 },
  { x0: 0.64, y0: 0.12, x1: 0.82, y1: 0.38 },
  { x0: 0.08, y0: 0.52, x1: 0.26, y1: 0.78 },
  { x0: 0.36, y0: 0.52, x1: 0.54, y1: 0.78 },
];

/** フリーハンド専用の描画領域（既存 5 形状と重ならない右下） */
const FREEHAND_CELL = { x0: 0.64, y0: 0.52, x1: 0.82, y1: 0.78 } as const;

/** `window.__fabricCanvas` のうち本 spec が参照する範囲の最小型 */
interface OutlineProbeCanvas {
  getObjects(): Array<OutlineProbeObject>;
  getWidth(): number;
  getHeight(): number;
  backgroundImage?: unknown;
}

interface OutlineProbeObject {
  type?: string;
  toObject(): {
    type?: string;
    outline?: { enabled?: boolean; color?: string; width?: number };
    labelOutline?: { enabled?: boolean; widthRatio?: number };
  };
  _objects?: Array<{
    type?: string;
    text?: string;
    paintFirst?: string;
    stroke?: string;
    strokeWidth?: number;
  }>;
}

/** 形状ごとの白縁取り状態（page.evaluate の戻り値） */
interface ShapeOutlineState {
  type: string;
  outlineEnabled: boolean;
  outlineColor: string | null;
  outlineWidth: number;
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

test.describe('6 形状の白縁取り保存・復元', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;

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
        const canvas = (window as unknown as { __fabricCanvas?: OutlineProbeCanvas | null })
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
  async function enterEditMode(): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${createdImageId}`);
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
    await tool.click();
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
  }

  /** Fabric キャンバス上のオブジェクト数を取得する。 */
  async function getObjectCount(): Promise<number> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: OutlineProbeCanvas | null })
        .__fabricCanvas;
      if (!canvas) return -1;
      return canvas.getObjects().length;
    });
  }

  /** 各オブジェクトの type と白縁取り属性（`toObject().outline`）を読み出す。 */
  async function readShapeOutlineStates(): Promise<ShapeOutlineState[]> {
    return await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: OutlineProbeCanvas | null })
        .__fabricCanvas;
      if (!canvas) return [];
      return canvas.getObjects().map((obj) => {
        const serialized = obj.toObject();
        return {
          type: serialized.type ?? obj.type ?? 'unknown',
          outlineEnabled: serialized.outline?.enabled === true,
          outlineColor: serialized.outline?.color ?? null,
          outlineWidth: serialized.outline?.width ?? 0,
        };
      });
    });
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

    const projectName = `白縁取りE2E用PJ_${Date.now()}`;
    await sharedPage.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);
    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    const salesPersonValue = await salesPersonSelect.inputValue();
    if (!salesPersonValue) {
      const options = await salesPersonSelect.locator('option').all();
      const firstUserOption = await options[1]?.getAttribute('value');
      if (firstUserOption) {
        await salesPersonSelect.selectOption(firstUserOption);
      }
    }

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

    const surveyName = `白縁取りE2E用調査_${Date.now()}`;
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

    // --- 画像を API で直接アップロード（6 形状を描き分ける広さを確保する） ---
    const testImagePath = path.join(__dirname, '../../fixtures/test-image-large.jpg');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    const uploadResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
          images: {
            name: 'test-image-large.jpg',
            mimeType: 'image/jpeg',
            buffer: fs.readFileSync(testImagePath),
          },
        },
      }
    );
    expect(uploadResponse.ok()).toBeTruthy();

    const uploadBody = (await uploadResponse.json()) as { successful?: Array<{ id?: string }> };
    createdImageId = uploadBody.successful?.[0]?.id ?? null;
    expect(createdImageId).toBeTruthy();
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
   * (a) 四角形・円・多角形・折れ線・寸法線を 1 つずつ描画 → 保存 → リロード →
   *     全形状で白縁取りが復元される
   *     Requirement 32.1, 32.6, 32.7, 32.8, 32.14
   */
  test('(a) 四角形・円・多角形・折れ線・寸法線が保存・リロード後に白縁取り付きで復元される', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    // --- 対象形状を順に描画する ---
    for (const [index, shape] of SHAPE_DEFINITIONS.entries()) {
      const cell = SHAPE_CELLS[index]!;
      const left = box.x + box.width * cell.x0;
      const top = box.y + box.height * cell.y0;
      const right = box.x + box.width * cell.x1;
      const bottom = box.y + box.height * cell.y1;

      const countBefore = await getObjectCount();
      await selectTool(shape.toolLabel);

      if (shape.gesture === 'drag') {
        await sharedPage.mouse.move(left, top);
        await sharedPage.mouse.down();
        await sharedPage.mouse.move(right, bottom, { steps: 12 });
        await sharedPage.mouse.up();
      } else if (shape.gesture === 'polygon') {
        // 頂点を 3 点クリックし、始点上のダブルクリックで閉じる
        await sharedPage.mouse.click(left, top);
        await sharedPage.mouse.click(right, top);
        await sharedPage.mouse.click(right, bottom);
        await sharedPage.mouse.dblclick(left, top);
      } else {
        // 折れ線: 3 点を打ち、終点のダブルクリックで確定する
        await sharedPage.mouse.click(left, bottom);
        await sharedPage.mouse.click((left + right) / 2, top);
        await sharedPage.mouse.dblclick(right, bottom);
      }

      await expect
        .poll(() => getObjectCount(), {
          timeout: getTimeout(10000),
          message: `${shape.toolLabel} の描画でオブジェクトが作成されませんでした`,
        })
        .toBe(countBefore + 1);
    }

    // --- 保存（Requirement 32.6） ---
    // 保存時に白縁取りを含む最終状態のサムネイルが再生成される（Requirement 32.14）
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

    // --- リロードして復元を確認（Requirement 32.7, 32.8） ---
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存した形状がリロード後に復元されませんでした',
      })
      .toBe(SHAPE_DEFINITIONS.length);

    const outlineStates = await readShapeOutlineStates();
    const restoredTypes = outlineStates.map((state) => state.type);
    expect(restoredTypes.sort()).toEqual(SHAPE_DEFINITIONS.map((shape) => shape.objectType).sort());

    // 各形状が白縁取り有効・白色・本体線幅に対する上乗せ幅を持って復元される
    // （Requirement 32.1 / 32.6 / 32.7 / 32.8）
    for (const shape of SHAPE_DEFINITIONS) {
      const restored = outlineStates.find((state) => state.type === shape.objectType);
      expect(restored, `${shape.toolLabel} が復元されていない`).toBeTruthy();
      expect(restored!.outlineEnabled, `${shape.toolLabel} の白縁取りが無効`).toBe(true);
      expect(restored!.outlineColor, `${shape.toolLabel} の縁取り色が白でない`).toMatch(
        /^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i
      );
      expect(restored!.outlineWidth, `${shape.toolLabel} の縁取り幅が 0`).toBeGreaterThan(0);
    }
  });

  /**
   * (b) 寸法線の寸法値ラベルにも白アウトラインが適用され、復元される
   *     Requirement 32.12
   */
  test('(b) 寸法線の寸法値ラベルに白アウトラインが適用される', async () => {
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存済みの注釈がリロード後に復元されませんでした',
      })
      .toBe(SHAPE_DEFINITIONS.length);

    const dimensionLabel = await sharedPage.evaluate(() => {
      const canvas = (window as unknown as { __fabricCanvas?: OutlineProbeCanvas | null })
        .__fabricCanvas;
      if (!canvas) return null;
      const dimension = canvas.getObjects().find((obj) => obj.toObject().type === 'dimensionLine');
      if (!dimension) return null;
      const serialized = dimension.toObject();
      // dimensionLine は [outlineLine, bodyLine, labelText] の Group。
      // 寸法値ラベルはテキストを持つ子オブジェクトとして識別する。
      const label = (dimension._objects ?? []).find((child) => typeof child.text === 'string');
      return {
        labelOutlineEnabled: serialized.labelOutline?.enabled === true,
        labelOutlineWidthRatio: serialized.labelOutline?.widthRatio ?? 0,
        labelText: label?.text ?? null,
        paintFirst: label?.paintFirst ?? null,
        stroke: label?.stroke ?? null,
        strokeWidth: label?.strokeWidth ?? 0,
      };
    });

    expect(dimensionLabel, '寸法線注釈が復元されていない').not.toBeNull();
    // 属性としての白アウトラインが永続化・復元されている
    expect(dimensionLabel!.labelOutlineEnabled).toBe(true);
    expect(dimensionLabel!.labelOutlineWidthRatio).toBeGreaterThan(0);
    // 実描画としてラベルに白アウトラインが乗っている（paintFirst=stroke / 白 / 幅 > 0）
    expect(dimensionLabel!.labelText).not.toBeNull();
    expect(dimensionLabel!.paintFirst).toBe('stroke');
    expect(dimensionLabel!.stroke).toMatch(/^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i);
    expect(dimensionLabel!.strokeWidth).toBeGreaterThan(0);
  });

  /**
   * (c) フリーハンド注釈を描画 → 保存 → リロード → 白縁取り付きで復元される
   *     Requirement 32.1, 32.6, 32.7, 32.8
   *
   * 要件 32 の対象 6 形状のうちフリーハンドのみを独立して検証する。
   * 他形状の検証結果に巻き込まれず、どの形状が要件を満たしていないかを明示するため。
   */
  test('(c) フリーハンドが保存・リロード後に白縁取り付きで復元される', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存済みの注釈がリロード後に復元されませんでした',
      })
      .toBe(SHAPE_DEFINITIONS.length);

    // --- フリーハンドで一筆描く ---
    await selectTool(FREEHAND_DEFINITION.toolLabel);
    const left = box.x + box.width * FREEHAND_CELL.x0;
    const top = box.y + box.height * FREEHAND_CELL.y0;
    const right = box.x + box.width * FREEHAND_CELL.x1;
    const bottom = box.y + box.height * FREEHAND_CELL.y1;
    await sharedPage.mouse.move(left, top);
    await sharedPage.mouse.down();
    await sharedPage.mouse.move((left + right) / 2, bottom, { steps: 10 });
    await sharedPage.mouse.move(right, top, { steps: 10 });
    await sharedPage.mouse.up();

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: 'フリーハンドの描画でオブジェクトが作成されませんでした',
      })
      .toBe(SHAPE_DEFINITIONS.length + 1);

    // Requirement 32.1: 描画直後の時点でフリーハンド注釈として白縁取りが付与される
    const drawnStates = await readShapeOutlineStates();
    const drawnFreehand = drawnStates.find(
      (state) => state.type === FREEHAND_DEFINITION.objectType
    );
    expect(
      drawnFreehand,
      `フリーハンドが ${FREEHAND_DEFINITION.objectType} として作成されていない（実際の type: ${drawnStates
        .map((state) => state.type)
        .join(', ')}）`
    ).toBeTruthy();
    expect(drawnFreehand!.outlineEnabled, 'フリーハンドの白縁取りが無効').toBe(true);

    // Requirement 32.6: 白縁取り属性を含めて永続化する
    const thumbnailResponsePromise = sharedPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/annotated-thumbnail') &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(60000) }
    );
    await sharedPage.getByRole('button', { name: '保存', exact: true }).click();
    await thumbnailResponsePromise;
    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // Requirement 32.7 / 32.8: リロード後も白縁取り付きで復元される
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存したフリーハンド注釈が復元されませんでした',
      })
      .toBe(SHAPE_DEFINITIONS.length + 1);

    const restoredStates = await readShapeOutlineStates();
    const restoredFreehand = restoredStates.find(
      (state) => state.type === FREEHAND_DEFINITION.objectType
    );
    expect(restoredFreehand, 'フリーハンドが復元されていない').toBeTruthy();
    expect(restoredFreehand!.outlineEnabled, 'フリーハンドの白縁取りが復元されていない').toBe(true);
    expect(restoredFreehand!.outlineColor).toMatch(/^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i);
    expect(restoredFreehand!.outlineWidth).toBeGreaterThan(0);
  });
});
