/**
 * @fileoverview 6 形状（四角形/円/多角形/折れ線/フリーハンド/寸法線）の
 *               白縁取り表現の保存・復元 E2E テスト
 *
 * Requirements coverage (site-survey):
 * - 32.1: 6 形状すべてに白色の縁取り線を付与して表示する
 * - 32.2: 白縁取り線幅を本体線幅の 1.5 倍以上の太さで付与する
 * - 32.6: 白縁取り属性を注釈データに含めて永続化する
 * - 32.7: 保存済みの対象注釈を再表示する際に白縁取り属性を復元する
 * - 32.8: 既存の復元経路（enlivenObjects）で白縁取り属性が復元される
 * - 32.12: 寸法線の寸法値ラベルにも白アウトライン表現を適用する
 * - 32.14: 保存時に白縁取りを含む最終状態のサムネイルを再生成する
 *
 * 対象は要件 32 の 6 形状（四角形・円・多角形・折れ線・フリーハンド・寸法線）である。
 * 矢印（要件 24.2）は既定値も丸め方も 6 形状とは独立して持たれているため本 spec の対象外。
 *
 * Task 115.48（AI運用7原則 第3原則）:
 *   本 spec は以前 `E2E_SURVEY_ID` / `E2E_IMAGE_ID` の有無で `test.skip` する構成であり、
 *   当該環境変数はリポジトリのどこにも設定されていないため全件が恒久的に飛ばされていた。
 *   前提となるプロジェクト・現場調査・画像は検証の中で用意する。用意できない場合は
 *   飛ばさずに失敗させる。
 *
 * Task 115.61（観測強度）:
 *   本 spec は以前、白縁取り幅について「0 より大きい」ことしか主張しておらず、
 *   要件 32.2 が定める本体線幅に対する比率を観測していなかった。比率で定められた要件は
 *   本体線幅が大きいほど破れやすいため、既定線幅だけでは判別できない。
 *   現在は全ての幅の主張を比率（片側幅 >= 本体線幅 * 0.75、実描画の縁取り線幅 >=
 *   本体線幅 * 1.5）へ改め、線幅入力の上限値 20 でも成立することを (d) で確認する。
 *
 * 構成:
 *   (a) 四角形・円・多角形・折れ線・寸法線の描画→保存→リロード→復元
 *   (b) 寸法線の寸法値ラベルの白アウトライン
 *   (c) フリーハンドの描画→保存→リロード→復元（他形状と挙動が異なるため独立）
 *   (d) 線幅入力の上限値での 6 形状の白縁取り比率（描画直後および保存・復元後）
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.2
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
import { selectFirstRealOption } from '../../helpers/form-preconditions';

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

/**
 * 線幅入力の上限値（AnnotationToolbar のスタイルパネル `line-width` の max）
 *
 * 要件 32.2 は比率を定めるため、既定線幅だけで確かめると本体線幅が大きい領域での
 * 破れを見逃す。入力できる最大の本体線幅で比率が成立することを確認する。
 */
const MAX_STROKE_WIDTH = 20;

/**
 * 白縁取りの片側幅が満たすべき本体線幅に対する比率（design.md の検証条件）
 *
 * 実描画の縁取り線幅は `本体線幅 + 片側幅 * 2` として描かれるため、
 * 片側幅が本体線幅の 0.75 倍以上であることが要件 32.2 の「1.5 倍以上」に対応する。
 */
const MIN_OUTLINE_WIDTH_RATIO = 0.75;

/** 実描画の縁取り線幅が本体線幅に対して満たすべき比率（要件 32.2） */
const MIN_RENDERED_OUTLINE_RATIO = 1.5;

/** 白色の表現ゆれ（`white` / `#fff` / `#ffffff` / `rgb(255,255,255)`）を受け入れる正規表現 */
const WHITE_PATTERN = /^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i;

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
    strokeWidth?: number;
    outline?: { enabled?: boolean; color?: string; width?: number };
    labelOutline?: { enabled?: boolean; widthRatio?: number };
  };
  _objects?: Array<{
    type?: string;
    text?: string;
    paintFirst?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  }>;
}

/**
 * 形状ごとの白縁取り状態（page.evaluate の戻り値）
 *
 * 属性としての白縁取り（`toObject().outline`）に加え、Group の子として実際に描かれている
 * 縁取り/本体の線幅も読み出す。属性だけを見ると、属性は正しいのに描画へ反映されない欠陥や、
 * その逆を見逃すため。
 */
interface ShapeOutlineState {
  type: string;
  /**
   * 本体線幅（Group にミラーされたシリアライズ値）
   *
   * 復元時にキャンバスサイズが変わると表示倍率が掛けられるため、片側幅（属性値）や
   * Group の子の線幅とは座標系が揃わない。比率の判定には使わない。
   */
  bodyStrokeWidth: number;
  outlineEnabled: boolean;
  outlineColor: string | null;
  /** 白縁取りの片側幅（属性値） */
  outlineWidth: number;
  /** 実描画の縁取り線（Group の第1子）の色 */
  renderedOutlineStroke: string | null;
  /** 実描画の縁取り線幅（= 本体線幅 + 片側幅 * 2） */
  renderedOutlineStrokeWidth: number;
  /** 実描画の縁取り線の不透明度（無効時は 0） */
  renderedOutlineOpacity: number;
  /** 実描画の本体線（Group の第2子）の線幅 */
  renderedBodyStrokeWidth: number;
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 白縁取りが要件 32.2 の比率を満たすことを主張する（Task 115.61）
 *
 * 「幅が 0 より大きい」ではなく本体線幅に対する比率で主張する。属性上の片側幅と、
 * 実際に描かれている縁取り線幅の双方を観測する。
 *
 * 比較の基準には Group の子として実際に描かれている本体線幅を使う。Group 自体へ
 * ミラーされた `strokeWidth` は、保存時と復元時でキャンバスサイズが異なる場合に
 * 復元処理が表示倍率を掛けるため、片側幅（倍率が掛からない属性値）や子の線幅とは
 * 座標系が揃わない。同一座標系の値どうしで比率を見る。
 *
 * @param state 対象形状の白縁取り状態
 * @param label 失敗時に形状を識別するためのラベル
 * @param expectedBodyStrokeWidth 期待する本体線幅（描画時に指定した線幅）
 */
function expectOutlineRatio(
  state: ShapeOutlineState,
  label: string,
  expectedBodyStrokeWidth: number
): void {
  expect(state.renderedBodyStrokeWidth, `${label}: 本体線幅が描画時の指定と一致しない`).toBe(
    expectedBodyStrokeWidth
  );
  expect(state.bodyStrokeWidth, `${label}: 本体線幅が注釈データに保持されていない`).toBeGreaterThan(
    0
  );
  expect(state.outlineEnabled, `${label}: 白縁取りが無効`).toBe(true);
  expect(state.outlineColor, `${label}: 縁取り色が白でない`).toMatch(WHITE_PATTERN);

  // 要件 32.2: 片側幅は本体線幅の 0.75 倍以上（design.md の検証条件）
  expect(
    state.outlineWidth,
    `${label}: 片側幅 ${state.outlineWidth} が本体線幅 ${state.renderedBodyStrokeWidth} の ` +
      `${MIN_OUTLINE_WIDTH_RATIO} 倍（${state.renderedBodyStrokeWidth * MIN_OUTLINE_WIDTH_RATIO}）未満`
  ).toBeGreaterThanOrEqual(state.renderedBodyStrokeWidth * MIN_OUTLINE_WIDTH_RATIO);

  // 実描画側: 縁取りの線が白で可視、かつ本体線幅の 1.5 倍以上の太さで描かれている
  expect(state.renderedOutlineStroke, `${label}: 実描画の縁取り線が白でない`).toMatch(
    WHITE_PATTERN
  );
  expect(state.renderedOutlineOpacity, `${label}: 実描画の縁取り線が不可視`).toBeGreaterThan(0);
  expect(
    state.renderedOutlineStrokeWidth,
    `${label}: 実描画の縁取り線幅 ${state.renderedOutlineStrokeWidth} が本体線幅 ` +
      `${state.renderedBodyStrokeWidth} の ${MIN_RENDERED_OUTLINE_RATIO} 倍未満`
  ).toBeGreaterThanOrEqual(state.renderedBodyStrokeWidth * MIN_RENDERED_OUTLINE_RATIO);
}

test.describe('6 形状の白縁取り保存・復元', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;
  /** (d) 専用の画像。既定線幅で描いた注釈と混ざらない白紙のキャンバスを得るために分ける。 */
  let maxWidthImageId: string | null = null;

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
  async function enterEditMode(imageId: string | null = createdImageId): Promise<void> {
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

  /**
   * スタイルパネルの線幅入力へ本体線幅を入力する（描画ツール選択後に呼ぶこと）。
   *
   * 入力欄は描画ツール選択中のみ表示される。以降に作成される注釈へ適用される。
   */
  async function setStrokeWidth(width: number): Promise<void> {
    const input = sharedPage.getByTestId('line-width');
    await expect(input).toBeVisible({ timeout: getTimeout(10000) });
    await input.fill(String(width));
    await expect(input).toHaveValue(String(width));
  }

  /**
   * スタイルパネルが現在示している本体線幅を読み出す（描画ツール選択後に呼ぶこと）。
   *
   * 既定線幅は一元管理の資材（Requirement 26.5）が供給する値であり、E2E 側で数値を
   * 固定すると供給元の変更で無関係に落ちる。画面が示す値をそのまま観測する。
   */
  async function readStrokeWidthValue(): Promise<number> {
    const input = sharedPage.getByTestId('line-width');
    await expect(input).toBeVisible({ timeout: getTimeout(10000) });
    const value = Number(await input.inputValue());
    expect(value, 'スタイルパネルの線幅が数値として読み出せない').toBeGreaterThan(0);
    return value;
  }

  /**
   * 指定形状を指定セルへ描画し、オブジェクトが 1 つ増えたことを確認する。
   *
   * @param shape 対象形状
   * @param cell 描画領域（キャンバス相対比率）
   * @param box キャンバスの bounding box
   * @param strokeWidth 本体線幅（スタイルパネルへ入力する値）
   */
  async function drawShape(
    shape: ShapeDefinition,
    cell: { x0: number; y0: number; x1: number; y1: number },
    box: CanvasBox,
    strokeWidth: number
  ): Promise<void> {
    const left = box.x + box.width * cell.x0;
    const top = box.y + box.height * cell.y0;
    const right = box.x + box.width * cell.x1;
    const bottom = box.y + box.height * cell.y1;

    const countBefore = await getObjectCount();
    await selectTool(shape.toolLabel);
    await setStrokeWidth(strokeWidth);

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

  /**
   * フリーハンドで一筆描き、オブジェクトが 1 つ増えたことを確認する。
   *
   * @param box キャンバスの bounding box
   * @param strokeWidth 本体線幅（スタイルパネルへ入力する値）
   */
  async function drawFreehand(box: CanvasBox, strokeWidth: number): Promise<void> {
    const countBefore = await getObjectCount();
    await selectTool(FREEHAND_DEFINITION.toolLabel);
    await setStrokeWidth(strokeWidth);

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
      .toBe(countBefore + 1);
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
        // 6 形状はいずれも [縁取り, 本体, ...] の順で子を持つ Group（design.md）。
        const children = obj._objects ?? [];
        const outlineChild = children[0];
        const bodyChild = children[1];
        return {
          type: serialized.type ?? obj.type ?? 'unknown',
          bodyStrokeWidth: serialized.strokeWidth ?? 0,
          outlineEnabled: serialized.outline?.enabled === true,
          outlineColor: serialized.outline?.color ?? null,
          outlineWidth: serialized.outline?.width ?? 0,
          renderedOutlineStroke: outlineChild?.stroke ?? null,
          renderedOutlineStrokeWidth: outlineChild?.strokeWidth ?? 0,
          renderedOutlineOpacity: outlineChild?.opacity ?? 0,
          renderedBodyStrokeWidth: bodyChild?.strokeWidth ?? 0,
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
    // 2 枚用意する。1 枚目は (a)〜(c)（既定線幅）、2 枚目は (d)（線幅入力の上限値）で使う。
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

    createdImageId = await uploadImage();
    expect(createdImageId).toBeTruthy();

    maxWidthImageId = await uploadImage();
    expect(maxWidthImageId).toBeTruthy();
    expect(maxWidthImageId).not.toBe(createdImageId);
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

    // 既定線幅（一元管理の資材が供給する値）を画面から読み取る
    await selectTool(SHAPE_DEFINITIONS[0]!.toolLabel);
    const defaultStrokeWidth = await readStrokeWidthValue();

    // --- 対象形状を順に描画する ---
    for (const [index, shape] of SHAPE_DEFINITIONS.entries()) {
      await drawShape(shape, SHAPE_CELLS[index]!, box, defaultStrokeWidth);
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

    // 各形状が白縁取り有効・白色・本体線幅に対する比率を満たす幅で復元される
    // （Requirement 32.1 / 32.2 / 32.6 / 32.7 / 32.8）
    for (const shape of SHAPE_DEFINITIONS) {
      const restored = outlineStates.find((state) => state.type === shape.objectType);
      expect(restored, `${shape.toolLabel} が復元されていない`).toBeTruthy();
      expectOutlineRatio(restored!, `${shape.toolLabel}（既定線幅）`, defaultStrokeWidth);
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
    const defaultStrokeWidth = await readStrokeWidthValue();
    await drawFreehand(box, defaultStrokeWidth);

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
    // Requirement 32.2: 描画直後から比率を満たす幅で縁取りが付与される
    expectOutlineRatio(drawnFreehand!, 'フリーハンド（既定線幅・描画直後）', defaultStrokeWidth);

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
    expectOutlineRatio(restoredFreehand!, 'フリーハンド（既定線幅・復元後）', defaultStrokeWidth);
  });

  /**
   * (d) 線幅入力の上限値で 6 形状を描画し、白縁取りが本体線幅に対する比率を満たす
   *     Requirement 32.2
   *
   * Task 115.61: 要件 32.2 は比率で定められているため、既定線幅だけを見ると
   * 「本体線幅への固定値の加算」で実装された欠陥（Task 115.53 が是正）を検出できない。
   * 固定値加算は本体線幅が大きいほど比率が下がるため、入力できる上限の本体線幅で
   * 成立することを確認する。描画直後と保存・復元後の双方で観測する。
   *
   * 対象は要件 32 の 6 形状。既定線幅で描いた注釈と混ざらないよう別画像を使う。
   */
  test('(d) 線幅入力の上限値でも 6 形状の白縁取りが本体線幅に対する比率を満たす', async () => {
    await enterEditMode(maxWidthImageId);
    const box = await getCanvasBox();

    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '(d) 用の画像に既存の注釈が残っています',
      })
      .toBe(0);

    // --- 上限線幅で 5 形状 + フリーハンドを描画する ---
    for (const [index, shape] of SHAPE_DEFINITIONS.entries()) {
      await drawShape(shape, SHAPE_CELLS[index]!, box, MAX_STROKE_WIDTH);
    }
    await drawFreehand(box, MAX_STROKE_WIDTH);

    const allShapes = [...SHAPE_DEFINITIONS, FREEHAND_DEFINITION];

    // Requirement 32.2: 描画直後の 6 形状すべてで比率が成立する
    const drawnStates = await readShapeOutlineStates();
    expect(drawnStates.map((state) => state.type).sort()).toEqual(
      allShapes.map((shape) => shape.objectType).sort()
    );
    for (const shape of allShapes) {
      const drawn = drawnStates.find((state) => state.type === shape.objectType);
      expect(drawn, `${shape.toolLabel} が上限線幅で作成されていない`).toBeTruthy();
      expectOutlineRatio(drawn!, `${shape.toolLabel}（上限線幅・描画直後）`, MAX_STROKE_WIDTH);
    }

    // --- 保存して復元後も比率が維持される（Requirement 32.2 / 32.7） ---
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

    await enterEditMode(maxWidthImageId);
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '上限線幅で保存した注釈が復元されませんでした',
      })
      .toBe(allShapes.length);

    const restoredStates = await readShapeOutlineStates();
    for (const shape of allShapes) {
      const restored = restoredStates.find((state) => state.type === shape.objectType);
      expect(restored, `${shape.toolLabel} が復元されていない`).toBeTruthy();
      expectOutlineRatio(restored!, `${shape.toolLabel}（上限線幅・復元後）`, MAX_STROKE_WIDTH);
    }
  });
});
