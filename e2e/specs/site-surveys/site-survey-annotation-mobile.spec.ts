/**
 * @fileoverview モバイル Viewport での注釈機能 E2E テスト
 *
 * Task 73.1: Playwright のモバイル Viewport (375x667) で主要シナリオを検証
 *
 * Requirements:
 * - 24.1, 24.6, 24.7: 矢印の白縁取り表示と永続化
 * - 25.1, 25.7, 25.8: テキスト注釈の白アウトライン表示と永続化
 * - 27.1, 27.2, 27.3: ダブルタップで編集、長押しでコンテキストメニュー
 * - 28.1, 28.5: モバイルツールバーの全ツールへのタップ到達性
 * - 28.8: 選択中ツールの再タップによる詳細属性パネルの開閉
 * - 29.6: ツール項目の長押しによるツールヒント（名称・短い説明）表示
 *
 * 実行要件: `npm run test:docker` で architrack-test 環境を起動してから
 *   `npx playwright test site-survey-annotation-mobile --project=mobile`
 *
 * @requirement site-survey/REQ-24.1
 * @requirement site-survey/REQ-24.6
 * @requirement site-survey/REQ-24.7
 * @requirement site-survey/REQ-25.1
 * @requirement site-survey/REQ-25.7
 * @requirement site-survey/REQ-25.8
 * @requirement site-survey/REQ-27.1
 * @requirement site-survey/REQ-27.2
 * @requirement site-survey/REQ-27.3
 * @requirement site-survey/REQ-28.1
 * @requirement site-survey/REQ-28.5
 *
 * Task 115.104: 選択中ツールの再タップによる詳細属性パネルの開閉（28.8）と、
 *   ツール項目の長押しによるツールヒント表示（29.6）を実タッチで検証する。
 * @requirement site-survey/REQ-28.8
 * @requirement site-survey/REQ-29.6
 *
 * Task 98.1: 編集モードでのピンチズーム後の正確描画・2本指パン・等倍時パン抑止、
 *   描画中断・誤選択防止を実タッチ（CDP マルチタッチ）で検証する。
 * @requirement site-survey/REQ-33.1
 * @requirement site-survey/REQ-33.2
 * @requirement site-survey/REQ-33.3
 * @requirement site-survey/REQ-33.4
 * @requirement site-survey/REQ-33.5
 * @requirement site-survey/REQ-33.6
 * @requirement site-survey/REQ-33.13
 * @requirement site-survey/REQ-34.7
 *
 * Task 98.2: ダブルタップズーム調停・ズームUI・拡大中の選択移動・44px a11y を
 *   実タッチ（CDP）/ 実DOM計測 / axe で検証する。
 * @requirement site-survey/REQ-33.8
 * @requirement site-survey/REQ-33.11
 * @requirement site-survey/REQ-33.12
 * @requirement site-survey/REQ-34.1
 * @requirement site-survey/REQ-34.4
 * @requirement site-survey/REQ-34.5
 * @requirement site-survey/REQ-34.6
 * @requirement site-survey/REQ-29.4
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { test, expect, type Page, type BrowserContext, type CDPSession } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout, isVisibleWithin } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';
// ダブルタップ判定の閾値は本番の一元管理された定数を直接参照する。
// テスト側に数値を複製すると、閾値が変わったときに検証だけが古い前提で緑になる。
import {
  DOUBLE_TAP_MS,
  LONG_PRESS_MS,
} from '../../../frontend/src/components/site-surveys/gestures/gesture-thresholds';
// ツール名と短い説明は本番の定義をそのまま参照する（文言の複製を持たない）。
import { TOOL_DEFINITIONS } from '../../../frontend/src/components/site-surveys/annotation-toolbar.constants';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { assertPresent } from '../../helpers/preconditions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// モバイル Viewport 設定（iPhone SE 相当）
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// ============================================================================
// Task 73.1 / 115.48: モバイル Viewport の注釈機能（白縁取り・タッチ操作・ツールバー）
// ============================================================================
//
// Requirements coverage:
//   - 24.1 / 24.6 / 24.7: 矢印の白縁取り表示と属性の永続化・復元
//   - 25.1 / 25.7 / 25.8: テキストの白アウトライン表示と属性の永続化・復元
//   - 27.1: テキスト注釈のダブルタップで編集モードへ遷移
//   - 27.2 / 27.3 / 27.9 / 27.10: 長押しでのコンテキストメニュー表示と操作実行、
//     描画ツール選択中は表示しない
//   - 28.1 / 28.3 / 28.5: モバイル幅ツールバーの収まり・44px タップ領域・全ツール到達性
//
// Task 115.48（AI運用7原則 第3原則）:
//   本 describe は以前 `E2E_SURVEY_ID` / `E2E_IMAGE_ID` の有無で `test.skip` する構成であり、
//   当該環境変数はリポジトリのどこにも設定されていないため全件が恒久的に飛ばされていた。
//   前提となるプロジェクト・現場調査・画像は検証の中で用意する。用意できない場合は
//   飛ばさずに失敗させる。
//
// 長押し・ダブルタップは実タッチでしか成立しない（`touchGestureManager` は pointerdown を
// 見ており、`page.mouse` では発火しない）。Task 98.1 / 98.2 と同じく CDP
// `Input.dispatchTouchEvent` で実タッチを模擬する。

/** 長押しの保持時間。実装の閾値（LONG_PRESS_MS）を超える保持を与える。 */
const LONG_PRESS_HOLD_MS = 800;

/**
 * 「閾値に届く前は出ない」を観測するための保持時間（Req 29.6）。
 * 本番の閾値から一定の余裕を引いて求めるため、閾値の変更に自動で追随する。
 */
const BEFORE_LONG_PRESS_WAIT_MS = Math.max(0, LONG_PRESS_MS - 200);

/** 直前のタップをダブルタップ判定から失効させる待ち時間（本番の閾値を確実に超える）。 */
const DOUBLE_TAP_EXPIRY_MS = DOUBLE_TAP_MS + 200;

// ============================================================================
// ダブルタップの実タッチ発火（Task 115.69）
// ============================================================================
//
// touchGestureManager は「直前のタップの pointerup 時刻」から「次のタップの pointerdown
// 時刻」までの経過を DOUBLE_TAP_MS と比較する。したがって発火間隔として意味を持つのは
// 1 回目の指を離してから 2 回目を接地するまでの時間だけである。
//
// 旧実装は 1 回目の接地から 2 回目の接地まで公称 170ms（接地 40ms + 解放後 40ms +
// タップ間 90ms）を費やし、そこに CDP の往復が 3 回入っていた。閾値に対する余裕が
// 130ms しかなく、負荷のかかった実行環境では往復が伸びて 2 回のタップが別々の単発
// タップとして扱われ、間欠的に失敗していた。
//
// 対処は 2 つを併用する:
//   1. 待ちを詰める（公称の発火間隔 130ms → 60ms、余裕 170ms → 240ms）
//   2. 実測した発火間隔が閾値内であることを主張する（越えたらその場で明確に落ちる）
// 2 は本番の定数 DOUBLE_TAP_MS を参照するため、閾値の変更に自動で追随する。

/** 1 回のタップで指を接地している時間。 */
const TAP_HOLD_MS = 40;

/**
 * 1 回目の指を離してから 2 回目を接地するまでの公称待ち時間。
 * これがそのまま本番の判定対象（pointerup → pointerdown）になる。
 */
const DOUBLE_TAP_GAP_MS = 60;

/** ダブルタップ後、キャンバスの状態更新が落ち着くまでの待ち時間。 */
const DOUBLE_TAP_SETTLE_MS = 80;

/** CDP `Input.dispatchTouchEvent` の送出関数（各 describe がローカルに束縛する）。 */
type DispatchTouch = (
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: Array<{ x: number; y: number; id: number }>
) => Promise<void>;

/** ページ側で採取したタッチ由来ポインタイベントの発生時刻（ミリ秒） */
interface PointerTimeline {
  downs: number[];
  ups: number[];
}

/** ページ側に仕込む計測窓の格納先 */
interface PointerTimelineWindow {
  __e2ePointerTimeline?: PointerTimeline;
  __e2eStopPointerTimeline?: () => void;
}

/**
 * 実タッチでダブルタップを発火させ、本番が閾値と比較するのと同一の経過時間
 * （1 回目の pointerup → 2 回目の pointerdown）を実測して閾値内であることを主張する。
 *
 * 実測が閾値を越えた場合は「ダブルタップが成立しなかった」という分かりにくい失敗ではなく
 * 「発火間隔が閾値を越えた」という真因の見える失敗になる。リトライで覆い隠さない。
 *
 * @returns 実測した発火間隔（ミリ秒）
 */
async function doubleTapWithinThreshold(
  page: Page,
  dispatchTouch: DispatchTouch,
  x: number,
  y: number
): Promise<number> {
  await page.evaluate(() => {
    const target = window as unknown as PointerTimelineWindow;
    target.__e2eStopPointerTimeline?.();
    const timeline: PointerTimeline = { downs: [], ups: [] };
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') {
        timeline.downs.push(Date.now());
      }
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') {
        timeline.ups.push(Date.now());
      }
    };
    // 本番の判定は canvas 要素上のハンドラで行われる。捕捉フェーズの window リスナは
    // 同一ディスパッチ内で直前に走るため、本番が見る時刻と実質同一の値を採れる。
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    target.__e2ePointerTimeline = timeline;
    target.__e2eStopPointerTimeline = (): void => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      delete target.__e2eStopPointerTimeline;
    };
  });

  await dispatchTouch('touchStart', [{ x, y, id: 0 }]);
  await page.waitForTimeout(TAP_HOLD_MS);
  await dispatchTouch('touchEnd', []);
  await page.waitForTimeout(DOUBLE_TAP_GAP_MS);
  await dispatchTouch('touchStart', [{ x, y, id: 0 }]);
  await page.waitForTimeout(TAP_HOLD_MS);
  await dispatchTouch('touchEnd', []);

  const timeline = await page.evaluate((): PointerTimeline => {
    const target = window as unknown as PointerTimelineWindow;
    target.__e2eStopPointerTimeline?.();
    const collected = target.__e2ePointerTimeline ?? { downs: [], ups: [] };
    delete target.__e2ePointerTimeline;
    return collected;
  });

  const firstUp = timeline.ups[0];
  const secondDown = timeline.downs[1];
  if (firstUp === undefined || secondDown === undefined) {
    // 実タッチが届いていない＝ダブルタップ以前の問題。飛ばさず失敗させる。
    throw new Error(
      `ダブルタップの実タッチがページ側で観測できませんでした（pointerdown=${timeline.downs.length}回, pointerup=${timeline.ups.length}回）`
    );
  }

  const elapsedMs = secondDown - firstUp;
  expect(
    elapsedMs,
    `ダブルタップの発火間隔が閾値 ${DOUBLE_TAP_MS}ms を越えました（実測 ${elapsedMs}ms / 公称 ${DOUBLE_TAP_GAP_MS}ms）。` +
      '本番はこの 2 回のタップを別々の単発タップとして扱うため、ダブルタップは成立しません。'
  ).toBeLessThanOrEqual(DOUBLE_TAP_MS);

  // 閾値に対する余裕を実行ログへ残す。余裕が痩せていく変化を、失敗するより前に観測できる。
  console.log(
    `[double-tap] 発火間隔 実測 ${elapsedMs}ms / 公称 ${DOUBLE_TAP_GAP_MS}ms（閾値 ${DOUBLE_TAP_MS}ms に対する余裕 ${DOUBLE_TAP_MS - elapsedMs}ms）`
  );

  await page.waitForTimeout(DOUBLE_TAP_SETTLE_MS);
  return elapsedMs;
}

/** 注釈オブジェクトの白縁取り状態（page.evaluate の戻り値） */
interface AnnotationOutlineState {
  type: string;
  outlineEnabled: boolean;
  outlineColor: string | null;
  textOutlineEnabled: boolean;
  textOutlineWidthRatio: number;
}

test.describe('モバイル Viewport 注釈機能', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let cdp: CDPSession;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;

  async function dispatchTouch(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }>
  ): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  }

  /** 単一タップ（touchStart → touchEnd） */
  async function tapAt(x: number, y: number): Promise<void> {
    await dispatchTouch('touchStart', [{ x, y, id: 0 }]);
    await sharedPage.waitForTimeout(40);
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(40);
  }

  /**
   * ダブルタップ（同一点を 2 回タップ）。発火間隔が本番の閾値内であることを
   * 実測して主張する（Task 115.69）。
   */
  async function doubleTapAt(x: number, y: number): Promise<void> {
    await doubleTapWithinThreshold(sharedPage, dispatchTouch, x, y);
  }

  /** 1 本指ドラッグ（タッチ）。描画ツールでの描画に用いる。 */
  async function oneFingerDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 10
  ): Promise<void> {
    await dispatchTouch('touchStart', [{ x: from.x, y: from.y, id: 0 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await dispatchTouch('touchMove', [
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 0 },
      ]);
      await sharedPage.waitForTimeout(16);
    }
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(80);
  }

  /**
   * 指を接地したまま保持する（長押しの成立）。保持中に判定を行うため、
   * 接地と解放を別関数に分けている。
   */
  async function pressAndHold(x: number, y: number): Promise<void> {
    await dispatchTouch('touchStart', [{ x, y, id: 0 }]);
    await sharedPage.waitForTimeout(LONG_PRESS_HOLD_MS);
  }

  /** 接地中の指を解放する。 */
  async function releaseTouch(): Promise<void> {
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(80);
  }

  /** ページのスクロールを先頭へ戻し、キャンバス座標の基準を実レイアウトと一致させる。 */
  async function resetScroll(): Promise<void> {
    await sharedPage.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await sharedPage.waitForTimeout(120);
  }

  /** upper-canvas の bounding box を、Fabric の初期化完了まで待って取得する。 */
  async function getCanvasBox(): Promise<CanvasBox> {
    const upper = sharedPage.locator('.upper-canvas');
    for (let i = 0; i < 30; i++) {
      const box = await upper.boundingBox();
      const ready = await sharedPage.evaluate(() => !!globalThis.__fabricCanvas);
      if (box && box.width > 10 && box.height > 10 && ready) {
        return box;
      }
      await sharedPage.waitForTimeout(200);
    }
    throw new Error('upper-canvas が初期化されませんでした');
  }

  /** 画像ビューアを開き、編集モードへ入って注釈ツールバーの表示を待つ。 */
  async function enterEditMode(): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${createdImageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const editModeButton = sharedPage.getByRole('button', { name: '編集モード', exact: true });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.tap();

    await expect(sharedPage.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
    await getCanvasBox();
    await resetScroll();
  }

  /** 指定ツールを選択し、押下状態になったことを確認する。 */
  async function selectTool(label: string): Promise<void> {
    const tool = sharedPage.getByRole('button', { name: label, exact: true });
    await expect(tool).toBeVisible({ timeout: getTimeout(10000) });
    // Req 28.8: 選択中ツールを再び押すと詳細属性パネルの開閉になる。本ヘルパーの意図は
    // 「当該ツールを選択状態にする」ことなので、既に選択済みなら押さない。
    if ((await tool.getAttribute('aria-pressed')) !== 'true') {
      await tool.tap();
    }
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
  }

  /** Fabric キャンバス上のオブジェクト数を取得する。 */
  async function getObjectCount(): Promise<number> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return -1;
      return c.getObjects().length;
    });
  }

  /** 各オブジェクトの type と白縁取り／白アウトライン属性を読み出す。 */
  async function readOutlineStates(): Promise<AnnotationOutlineState[]> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return [];
      const objects = c.getObjects() as unknown as Array<{
        type?: string;
        toObject: () => {
          type?: string;
          outline?: { enabled?: boolean; color?: string };
          textOutline?: { enabled?: boolean; widthRatio?: number };
        };
      }>;
      return objects.map((obj) => {
        const serialized = obj.toObject();
        return {
          type: serialized.type ?? obj.type ?? 'unknown',
          outlineEnabled: serialized.outline?.enabled === true,
          outlineColor: serialized.outline?.color ?? null,
          textOutlineEnabled: serialized.textOutline?.enabled === true,
          textOutlineWidthRatio: serialized.textOutline?.widthRatio ?? 0,
        };
      });
    });
  }

  /** 現在の選択オブジェクトの type を読む（未選択は null）。 */
  async function readActiveType(): Promise<string | null> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const active = c.getActiveObject();
      return active ? (active.type ?? 'unknown') : null;
    });
  }

  /** textAnnotation の編集状態（isEditing）を読む。 */
  async function readTextEditing(): Promise<boolean | null> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const objs = c.getObjects() as unknown as Array<{ type?: string; isEditing?: boolean }>;
      const textObj = objs.find((o) => o.type === 'textAnnotation');
      return textObj ? textObj.isEditing === true : null;
    });
  }

  /**
   * 指定 type のオブジェクト中心の client 座標を、scene 座標と viewportTransform、
   * upper-canvas の boundingBox から算出する。
   */
  async function objectCenterClient(objectType: string): Promise<{ x: number; y: number }> {
    const box = await getCanvasBox();
    const info = await sharedPage.evaluate((targetType) => {
      const c = globalThis.__fabricCanvas as unknown as {
        getObjects: () => Array<{
          type?: string;
          getCenterPoint?: () => { x: number; y: number };
        }>;
        viewportTransform: number[];
      } | null;
      if (!c) return null;
      const obj = c.getObjects().find((o) => o.type === targetType);
      if (!obj || typeof obj.getCenterPoint !== 'function') return null;
      const center = obj.getCenterPoint();
      return { sx: center.x, sy: center.y, vpt: c.viewportTransform };
    }, objectType);

    if (!info) {
      throw new Error(`${objectType} のオブジェクトが見つかりませんでした`);
    }
    const point = {
      x: box.x + info.sx * (info.vpt[0] ?? 1) + (info.vpt[4] ?? 0),
      y: box.y + info.sy * (info.vpt[3] ?? 1) + (info.vpt[5] ?? 0),
    };
    // 可視ビューポート外の座標へタッチを送っても何も起きず、原因の分からない失敗になる。
    // 前提が崩れていることを明示するため、その場で失敗させる。
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > MOBILE_VIEWPORT.width ||
      point.y > MOBILE_VIEWPORT.height
    ) {
      throw new Error(
        `${objectType} の中心 (${Math.round(point.x)}, ${Math.round(point.y)}) が` +
          ` 可視ビューポート ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} の外にあります`
      );
    }
    return point;
  }

  /** 注釈を保存し、保存完了の表示を待つ。 */
  async function saveAnnotations(): Promise<void> {
    await sharedPage.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(sharedPage.getByRole('status', { name: '保存完了' })).toBeVisible({
      timeout: getTimeout(20000),
    });
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      hasTouch: true,
      isMobile: true,
    });
    sharedPage = await sharedContext.newPage();
    cdp = await sharedContext.newCDPSession(sharedPage);

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // --- プロジェクト作成 ---
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `モバイル注釈E2E用PJ_${Date.now()}`;
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

    const surveyName = `モバイル注釈E2E用調査_${Date.now()}`;
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

    // --- 画像を API で直接アップロード ---
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
   * (a) 白縁取り付き矢印を配置 → 保存 → リロード → 復元
   *     Requirement 24.1, 24.6, 24.7
   */
  test('(a) 白縁取り付き矢印を配置→保存→リロード→復元 (REQ-24.1/24.6/24.7)', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    await selectTool('矢印');
    await oneFingerDrag(
      { x: box.x + box.width * 0.12, y: box.y + box.height * 0.16 },
      { x: box.x + box.width * 0.44, y: box.y + box.height * 0.42 }
    );

    // Req 24.1: 矢印は白色の縁取りを付与された状態で作成される
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: '矢印注釈が作成されませんでした',
      })
      .toBe(1);

    const drawn = await readOutlineStates();
    expect(drawn[0]!.type).toBe('arrow');
    expect(drawn[0]!.outlineEnabled).toBe(true);
    expect(drawn[0]!.outlineColor).toMatch(/^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i);

    // Req 24.6: 白縁取り属性を含めて永続化する
    await saveAnnotations();

    // Req 24.7: 再表示時に保存された白縁取り属性を復元する
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存した矢印注釈が復元されませんでした',
      })
      .toBe(1);

    const restored = await readOutlineStates();
    expect(restored[0]!.type).toBe('arrow');
    expect(restored[0]!.outlineEnabled).toBe(true);
    expect(restored[0]!.outlineColor).toMatch(/^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i);
  });

  /**
   * (b) テキスト注釈に白アウトラインを付与 → 保存 → リロード → 復元
   *     Requirement 25.1, 25.7, 25.8
   */
  test('(b) テキスト注釈に白アウトラインを付与→保存→リロード→復元 (REQ-25.1/25.7/25.8)', async () => {
    await enterEditMode();
    const box = await getCanvasBox();

    await selectTool('テキスト');
    await tapAt(box.x + box.width * 0.62, box.y + box.height * 0.4);

    // テキストツールは配置と同時に編集状態へ入り、初期文字列が全選択される
    await expect
      .poll(() => readTextEditing(), {
        timeout: getTimeout(10000),
        message: 'テキスト注釈が編集状態になりませんでした',
      })
      .toBe(true);

    await sharedPage.keyboard.type('現場調査');
    await sharedPage.keyboard.press('Escape');
    await resetScroll();

    // Req 25.1: テキストは白アウトラインを付与された状態で配置される
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: 'テキスト注釈が作成されませんでした',
      })
      .toBe(2);

    const drawn = await readOutlineStates();
    const drawnText = drawn.find((state) => state.type === 'textAnnotation');
    expect(drawnText, 'テキスト注釈が作成されていない').toBeTruthy();
    expect(drawnText!.textOutlineEnabled).toBe(true);
    expect(drawnText!.textOutlineWidthRatio).toBeGreaterThan(0);

    // Req 25.7: 白アウトライン属性を含めて永続化する
    await saveAnnotations();

    // Req 25.8: 再表示時に保存された白アウトライン属性を復元する
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存したテキスト注釈が復元されませんでした',
      })
      .toBe(2);

    const restored = await readOutlineStates();
    const restoredText = restored.find((state) => state.type === 'textAnnotation');
    expect(restoredText, 'テキスト注釈が復元されていない').toBeTruthy();
    expect(restoredText!.textOutlineEnabled).toBe(true);
    expect(restoredText!.textOutlineWidthRatio).toBeGreaterThan(0);
  });

  /**
   * (c) 既存注釈の長押しでコンテキストメニューが開く（描画ツール中は開かない）
   *     Requirement 27.2, 27.9, 27.10
   *
   * Task 115.47 の是正（長押しの対象を座標の当たり判定で解決する）を実ブラウザで検出できる
   * 唯一の検証。通知に対象が含まれない実装でも、対象の上を長押しすればメニューが開くこと。
   */
  test('(c) 描画ツール中は開かず選択ツール中の長押しでコンテキストメニューが開く (REQ-27.2/27.9/27.10)', async () => {
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存済みの注釈が復元されませんでした',
      })
      .toBe(2);

    const menuPanel = sharedPage.getByTestId('annotation-context-menu-panel');
    const arrowCenter = await objectCenterClient('arrow');

    // Req 27.9: 描画ツール選択中は長押ししてもコンテキストメニューを表示しない
    await selectTool('矢印');
    await pressAndHold(arrowCenter.x, arrowCenter.y);
    await expect(menuPanel).toBeHidden();
    await releaseTouch();

    // Req 27.10 / 27.2: 選択ツール選択中に既存オブジェクトを長押しするとメニューが開く
    await selectTool('選択');
    await resetScroll();
    const arrowCenterForSelect = await objectCenterClient('arrow');
    await pressAndHold(arrowCenterForSelect.x, arrowCenterForSelect.y);
    await expect(menuPanel).toBeVisible({ timeout: getTimeout(5000) });
    await expect(sharedPage.getByTestId('annotation-editor-container')).toHaveAttribute(
      'data-context-menu-visible',
      'true'
    );

    // Req 27.2: 長押しした対象が選択状態になっている
    expect(await readActiveType()).toBe('arrow');

    await releaseTouch();
  });

  /**
   * (d) モバイルツールバーの全ツールが画面幅に収まりタップ可能
   *     Requirement 28.1, 28.3, 28.5
   */
  test('(d) モバイルツールバーの全ツールが画面幅に収まりタップできる (REQ-28.1/28.3/28.5)', async () => {
    await enterEditMode();

    const toolLabels = [
      '選択',
      '寸法線',
      '矢印',
      '円',
      '四角形',
      '多角形',
      '折れ線',
      'フリーハンド',
      'テキスト',
    ];

    for (const label of toolLabels) {
      const button = sharedPage.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();

      // Req 28.5: 全ツールがタップで選択できる
      await button.tap();
      await expect(button).toHaveAttribute('aria-pressed', 'true');

      const boundingBox = await button.boundingBox();
      expect(boundingBox, `${label} のタップ領域が取得できない`).not.toBeNull();
      // Req 28.3: タップ領域は 44x44 論理ピクセル以上
      expect(boundingBox!.width, `${label} の幅が 44px 未満`).toBeGreaterThanOrEqual(44);
      expect(boundingBox!.height, `${label} の高さが 44px 未満`).toBeGreaterThanOrEqual(44);
      // Req 28.1: 各項目が画面幅に収まる（横方向のはみ出しがない）
      expect(boundingBox!.x, `${label} が画面左端からはみ出している`).toBeGreaterThanOrEqual(0);
      expect(
        boundingBox!.x + boundingBox!.width,
        `${label} が画面右端からはみ出している`
      ).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    }

    // Req 28.1: ツールバー自体もモバイル幅に収まる
    const toolbarBox = await sharedPage.getByTestId('annotation-toolbar').boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBox!.x + toolbarBox!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
  });

  /**
   * (e) 既存テキストをダブルタップで編集モードへ遷移
   *     Requirement 27.1
   */
  test('(e) 既存テキストをダブルタップで編集モードへ遷移する (REQ-27.1)', async () => {
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存済みの注釈が復元されませんでした',
      })
      .toBe(2);

    await selectTool('選択');
    await resetScroll();
    expect(await readTextEditing()).toBe(false);

    const textCenter = await objectCenterClient('textAnnotation');

    // タップ座標が実際にテキスト注釈へ当たることを単タップの選択で先に確かめる。
    // これによりダブルタップが不発の場合に「座標が外れている」のか
    // 「ダブルタップの調停が働いていない」のかを切り分けられる。
    await tapAt(textCenter.x, textCenter.y);
    await expect
      .poll(() => readActiveType(), {
        timeout: getTimeout(10000),
        message: 'タップ座標がテキスト注釈に当たっていません',
      })
      .toBe('textAnnotation');

    // 直前の単タップがダブルタップとして誤検出されないよう lastTap を失効させる
    await sharedPage.waitForTimeout(DOUBLE_TAP_EXPIRY_MS);

    await doubleTapAt(textCenter.x, textCenter.y);

    // Req 27.1: ダブルタップで当該テキスト注釈が編集モードへ遷移する
    await expect
      .poll(() => readTextEditing(), {
        timeout: getTimeout(10000),
        message: 'ダブルタップでテキスト編集モードへ遷移しませんでした',
      })
      .toBe(true);
  });

  /**
   * (f) コンテキストメニューの項目タップで操作が実行される
   *     Requirement 27.3
   *
   * 項目をタップするには指を離す必要があるため、「指を離してもメニューが開いたままである」
   * ことが前提になる。メニューの表示自体（Req 27.2）は (c) で検証済みであり、本テストは
   * 表示後の操作実行のみを対象とする。
   */
  test('(f) コンテキストメニューの削除をタップすると注釈が削除される (REQ-27.3)', async () => {
    await enterEditMode();
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(20000),
        message: '保存済みの注釈が復元されませんでした',
      })
      .toBe(2);

    await selectTool('選択');
    await resetScroll();
    const countBeforeMenu = await getObjectCount();
    const arrowCenter = await objectCenterClient('arrow');

    const menuPanel = sharedPage.getByTestId('annotation-context-menu-panel');
    await pressAndHold(arrowCenter.x, arrowCenter.y);
    await expect(menuPanel).toBeVisible({ timeout: getTimeout(5000) });
    await releaseTouch();

    // 指を離してもメニューは開いたままで、項目をタップできる
    await expect(menuPanel, '指を離した時点でコンテキストメニューが閉じている').toBeVisible();

    // Req 27.3: 「削除」をタップすると当該オブジェクトが削除される
    await menuPanel.getByRole('button', { name: '削除', exact: true }).tap();
    await expect(menuPanel).toBeHidden({ timeout: getTimeout(5000) });
    await expect
      .poll(() => getObjectCount(), {
        timeout: getTimeout(10000),
        message: 'コンテキストメニューの削除で注釈が削除されませんでした',
      })
      .toBe(countBeforeMenu - 1);
  });

  /**
   * (g) 選択中ツールの再タップで詳細属性パネルを開閉する
   *     Requirement 28.8
   *
   * Task 115.104: 道具帯には再タップを通知する口（`onActiveToolReTap`）が以前から
   * あったが、編集画面がそれを渡していなかったため要件28.8 は成立していなかった。
   * 主張は「属性パネルが実際に画面から消える／戻る」で置く。
   */
  test('(g) 選択中ツールを再タップすると詳細属性パネルが開閉する (REQ-28.8)', async () => {
    await enterEditMode();

    const arrowTool = sharedPage.getByRole('button', { name: '矢印', exact: true });
    const stylePanel = sharedPage.getByTestId('style-options');

    // 前提: 描画ツールを選ぶと属性パネルが出ている（既定の状態）
    await selectTool('矢印');
    await expect(stylePanel, '矢印ツール選択直後に属性パネルが出ていない').toBeVisible({
      timeout: getTimeout(5000),
    });

    // 1 回目の再タップ: 閉じる（既定でない状態へ移す）
    await arrowTool.tap();
    await expect(stylePanel, '再タップで属性パネルが閉じない').toBeHidden({
      timeout: getTimeout(5000),
    });
    // 選択状態は維持される
    await expect(arrowTool, '再タップで選択状態が外れた').toHaveAttribute('aria-pressed', 'true');

    // 2 回目の再タップ: 開く
    await arrowTool.tap();
    await expect(stylePanel, '再々タップで属性パネルが戻らない').toBeVisible({
      timeout: getTimeout(5000),
    });

    // 戻ったパネルは操作できる（表示だけの張りぼてではない）
    await expect(
      stylePanel.getByTestId('line-width'),
      '戻った属性パネルに線の太さの入力が無い'
    ).toBeVisible();
  });

  /**
   * (h) ツール項目の長押しでツールヒント（名称・短い説明）を表示する
   *     Requirement 29.6
   *
   * Task 115.104: 従来は `title` 属性のみで、指操作では説明に到達できなかった。
   * 判定時間はテスト側に数値を複製せず本番の閾値（LONG_PRESS_MS）を参照し、
   * 「閾値前は出ない」「閾値を越えると出る」の両方を実測した経過時間つきで確かめる。
   */
  test('(h) ツール項目を長押しすると名称と短い説明のツールヒントが出る (REQ-29.6)', async () => {
    await enterEditMode();

    const dimensionTool = sharedPage.getByRole('button', { name: '寸法線', exact: true });
    await expect(dimensionTool).toBeVisible({ timeout: getTimeout(10000) });
    const buttonBox = await dimensionTool.boundingBox();
    expect(buttonBox, '寸法線ツールのタップ領域が取得できない').not.toBeNull();
    const pressPoint = {
      x: buttonBox!.x + buttonBox!.width / 2,
      y: buttonBox!.y + buttonBox!.height / 2,
    };

    const tooltip = sharedPage.getByTestId('tool-tooltip-dimension');

    // 押していない間は出ていない（表示の契機が長押しであることを示す）
    await expect(tooltip, '長押しの前からツールヒントが出ている').toHaveCount(0);

    await dispatchTouch('touchStart', [{ x: pressPoint.x, y: pressPoint.y, id: 0 }]);
    const pressedAt = Date.now();

    // 閾値に届く前は出ない
    await sharedPage.waitForTimeout(BEFORE_LONG_PRESS_WAIT_MS);
    await expect(tooltip, '閾値に届く前にツールヒントが出た').toHaveCount(0);
    const elapsedBefore = Date.now() - pressedAt;
    expect(
      elapsedBefore,
      `早期観測が長押し閾値(${LONG_PRESS_MS}ms)を越えており「閾値前は出ない」を確かめられていない`
    ).toBeLessThan(LONG_PRESS_MS);

    // 閾値を越えて保持すると出る
    await sharedPage.waitForTimeout(LONG_PRESS_HOLD_MS);
    const elapsedHold = Date.now() - pressedAt;
    expect(
      elapsedHold,
      `保持時間が長押し閾値(${LONG_PRESS_MS}ms)に届いていない`
    ).toBeGreaterThanOrEqual(LONG_PRESS_MS);

    await expect(tooltip, '長押ししてもツールヒントが出ない').toBeVisible({
      timeout: getTimeout(5000),
    });
    await expect(tooltip, 'ツールヒントに名称が無い').toContainText(
      TOOL_DEFINITIONS.dimension.label
    );
    await expect(tooltip, 'ツールヒントに短い説明が無い').toContainText(
      TOOL_DEFINITIONS.dimension.description
    );

    // 指を離すと消える
    await releaseTouch();
    await expect(tooltip, '指を離してもツールヒントが残っている').toHaveCount(0);
  });
});

// ============================================================================
// Task 98.1: 編集モードのピンチズーム/2本指パン/描画中断/誤選択防止（実タッチ検証）
// ============================================================================
//
// 既存スケルトン（環境変数ゲート）とは独立した、実セットアップ・実アサーションの
// describe ブロック。site-survey-drawing-selection-prevention.spec.ts と同じく、
// プロジェクト・現場調査を作成し画像を API でアップロードしてから編集モードへ入る。
// 第3原則に従い、前提条件でテストを自動無効化しない（満たさない場合は失敗させる）。
//
// マルチタッチ（2本指ピンチ/パン）は page.touchscreen では模擬できないため、
// research.md RN4 に従い CDP `Input.dispatchTouchEvent`（複数 touchPoints）で模擬する。
// ビューポート状態は実装が公開する `window.__fabricCanvas`（viewportTransform / getZoom）で
// 検証する（[0]=zoom, [4]=panX, [5]=panY）。

const EDIT_MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * window.__fabricCanvas の最小型（テスト内 page.evaluate で参照する範囲のみ）。
 */
interface FabricCanvasProbe {
  getZoom(): number;
  viewportTransform: number[];
  getObjects(): Array<{ type?: string; left?: number; top?: number }>;
  getActiveObject(): { type?: string } | null;
  setViewportTransform(vpt: number[]): void;
  requestRenderAll(): void;
}

declare global {
  var __fabricCanvas: FabricCanvasProbe | null | undefined;
}

interface ViewportProbe {
  zoom: number;
  panX: number;
  panY: number;
  objectCount: number;
  activeType: string | null;
}

interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

test.describe('編集モードのピンチズーム/2本指パン/描画中断/誤選択防止（Task 98.1）', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedContext: BrowserContext;
  let sharedPage: Page;
  let cdp: CDPSession;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;

  /**
   * CDP でマルチタッチイベントを送出する。
   * type: 'touchStart' | 'touchMove' は touchPoints が 1 点以上必須。
   * type: 'touchEnd'   は全点解放のため touchPoints を空配列にする。
   */
  async function dispatchTouch(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }>
  ): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  }

  /**
   * 2本指ジェスチャーを送出する。
   * start から end へ各指を steps 段階で移動させ、最後に全点解放する。
   */
  async function twoFingerGesture(
    start: Array<{ x: number; y: number }>,
    end: Array<{ x: number; y: number }>,
    steps = 8
  ): Promise<void> {
    const f0 = { ...start[0]!, id: 0 };
    const f1 = { ...start[1]!, id: 1 };
    await dispatchTouch('touchStart', [f0, f1]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await dispatchTouch('touchMove', [
        {
          x: start[0]!.x + (end[0]!.x - start[0]!.x) * t,
          y: start[0]!.y + (end[0]!.y - start[0]!.y) * t,
          id: 0,
        },
        {
          x: start[1]!.x + (end[1]!.x - start[1]!.x) * t,
          y: start[1]!.y + (end[1]!.y - start[1]!.y) * t,
          id: 1,
        },
      ]);
      await sharedPage.waitForTimeout(16);
    }
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(50);
  }

  /**
   * 1本指ドラッグ（タッチ）を送出する。描画ツールでの描画に用いる。
   */
  async function oneFingerDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 8
  ): Promise<void> {
    await dispatchTouch('touchStart', [{ x: from.x, y: from.y, id: 0 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await dispatchTouch('touchMove', [
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 0 },
      ]);
      await sharedPage.waitForTimeout(16);
    }
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(50);
  }

  /**
   * window.__fabricCanvas からビューポート/オブジェクト状態を読み出す。
   */
  async function readProbe(): Promise<ViewportProbe> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) {
        return { zoom: -1, panX: 0, panY: 0, objectCount: -1, activeType: null };
      }
      const vpt = c.viewportTransform;
      const active = c.getActiveObject();
      return {
        zoom: c.getZoom(),
        panX: vpt[4] ?? 0,
        panY: vpt[5] ?? 0,
        objectCount: c.getObjects().length,
        activeType: active ? (active.type ?? 'unknown') : null,
      };
    });
  }

  /**
   * 直近に追加されたオブジェクトの保存座標（scene 座標 left/top）を読む。
   */
  async function readLastObject(): Promise<{ left: number; top: number } | null> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const objs = c.getObjects();
      const last = objs[objs.length - 1];
      if (!last) return null;
      return { left: last.left ?? 0, top: last.top ?? 0 };
    });
  }

  /**
   * 編集モードのビューポートを fit（zoom=1, pan=0）にリセットする。
   * 各シナリオを独立させるためのテストセットアップ（アサーション対象外）。
   */
  async function resetViewport(): Promise<void> {
    await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (c) {
        c.setViewportTransform([1, 0, 0, 1, 0, 0]);
        c.requestRenderAll();
      }
    });
    await sharedPage.waitForTimeout(50);
  }

  /**
   * upper-canvas の bounding box を取得する（タッチ座標の基準）。
   */
  async function getCanvasBox(): Promise<CanvasBox> {
    const upper = sharedPage.locator('.upper-canvas');
    for (let i = 0; i < 20; i++) {
      const box = await upper.boundingBox();
      const ready = await sharedPage.evaluate(() => {
        const c = globalThis.__fabricCanvas;
        return !!c;
      });
      if (box && box.width > 10 && box.height > 10 && ready) {
        return box;
      }
      await sharedPage.waitForTimeout(200);
    }
    throw new Error('upper-canvas が初期化されませんでした');
  }

  /**
   * 詳細画面 → 画像ビューア → 編集モードへ遷移し、注釈ツールバーの表示を待つ。
   */
  async function enterEditMode(): Promise<void> {
    // 詳細画面のサムネイルはモバイルではアップロードドロップゾーンに覆われタップが
    // 阻害されるため、アップロード応答で得た画像 ID で画像ビューアへ直接遷移する。
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${createdImageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const editModeButton = sharedPage.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
    await editModeButton.tap();

    await sharedPage
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(10000) });
    await getCanvasBox();
  }

  /**
   * 指定ツールを選択し aria-pressed=true を確認する。
   */
  async function selectTool(name: RegExp): Promise<void> {
    const tool = sharedPage.getByRole('button', { name });
    await expect(tool).toBeVisible({ timeout: getTimeout(5000) });
    // Req 28.8: 選択中ツールを再び押すと詳細属性パネルの開閉になる。本ヘルパーの意図は
    // 「当該ツールを選択状態にする」ことなので、既に選択済みなら押さない。
    if ((await tool.getAttribute('aria-pressed')) !== 'true') {
      await tool.tap();
    }
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({
      viewport: EDIT_MOBILE_VIEWPORT,
      hasTouch: true,
      isMobile: true,
    });
    sharedPage = await sharedContext.newPage();
    cdp = await sharedContext.newCDPSession(sharedPage);

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `ピンチズームE2E用PJ_${Date.now()}`;
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

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `ピンチズームE2E用調査_${Date.now()}`;
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

    // 画像を API で直接アップロード（拡大の余地を確保するため大きめ画像を使用）
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

    // アップロード応答（{ successful: [{ id, ... }] }）から画像 ID を取得する。
    const uploadBody = (await uploadResponse.json()) as {
      successful?: Array<{ id?: string }>;
    };
    createdImageId = uploadBody.successful?.[0]?.id ?? null;
    expect(createdImageId).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    // クリーンアップ（ADMIN で削除）
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');
      if (createdSurveyId) {
        await cleanupPage.goto(`/site-surveys/${createdSurveyId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .or(cleanupPage.getByRole('dialog'))
            .getByRole('button', { name: /^削除する$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
        }
      }
      if (createdProjectId) {
        await cleanupPage.goto(`/projects/${createdProjectId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  /**
   * (1) 2本指ピンチで拡大し、1本指描画が「拡大後の正しい位置」に落ちる
   *     Requirement 33.2 / 33.6
   */
  test('(1) ピンチ拡大後の1本指描画が拡大後座標系の正しい位置に反映される (REQ-33.2/33.6)', async () => {
    await enterEditMode();
    await resetViewport();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await readProbe();
    expect(before.zoom).toBeGreaterThan(0);

    // 中点を中心に2本指を水平に広げて拡大（distance 40 -> 140, 中点固定）
    await twoFingerGesture(
      [
        { x: cx - 20, y: cy },
        { x: cx + 20, y: cy },
      ],
      [
        { x: cx - 70, y: cy },
        { x: cx + 70, y: cy },
      ]
    );

    const afterZoom = await readProbe();
    // Req 33.2: ピンチで倍率が有意に増加する
    expect(afterZoom.zoom).toBeGreaterThan(before.zoom * 1.2);

    // 拡大状態で四角形を1本指ドラッグ描画
    await selectTool(/四角形/i);
    const dragFrom = { x: cx - 30, y: cy - 20 };
    const dragTo = { x: cx + 30, y: cy + 20 };
    const countBefore = (await readProbe()).objectCount;
    await oneFingerDrag(dragFrom, dragTo);

    const probeAfterDraw = await readProbe();
    // 新規オブジェクトが1つ作成される
    expect(probeAfterDraw.objectCount).toBe(countBefore + 1);

    // Req 33.6: 作成オブジェクトの scene 座標が viewportTransform を考慮した
    // 期待値（screen→scene 逆変換）と一致する
    const vpt = await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      return c ? c.viewportTransform : null;
    });
    assertPresent(vpt, '編集キャンバスの viewportTransform');
    const zoom = vpt[0] ?? 1;
    const tx = vpt[4] ?? 0;
    const ty = vpt[5] ?? 0;
    // screen → canvas相対 → scene
    const relStartX = dragFrom.x - box.x;
    const relStartY = dragFrom.y - box.y;
    const relEndX = dragTo.x - box.x;
    const relEndY = dragTo.y - box.y;
    const expectedLeft = (Math.min(relStartX, relEndX) - tx) / zoom;
    const expectedTop = (Math.min(relStartY, relEndY) - ty) / zoom;

    const last = await readLastObject();
    assertPresent(last, '直近に追加された注釈オブジェクトの保存座標');
    // タッチ模擬の丸めとブラシ閾値を考慮した許容差
    expect(Math.abs(last.left - expectedLeft)).toBeLessThan(20);
    expect(Math.abs(last.top - expectedTop)).toBeLessThan(20);
  });

  /**
   * (2) 2本指ドラッグでパンし、等倍（fit）時はパンしない
   *     Requirement 33.4 / 34.7
   */
  test('(2) 等倍時はパン抑止・拡大時のみ2本指パンが有効 (REQ-33.4/34.7)', async () => {
    await enterEditMode();
    await resetViewport();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 等倍（zoom=1.0）状態を確認
    const atFit = await readProbe();
    expect(atFit.zoom).toBeCloseTo(1, 1);

    // Req 34.7: 等倍では2本指ドラッグしてもパンしない（panX/panY 不変）
    await twoFingerGesture(
      [
        { x: cx - 30, y: cy },
        { x: cx + 30, y: cy },
      ],
      [
        { x: cx - 30 - 60, y: cy - 40 },
        { x: cx + 30 - 60, y: cy - 40 },
      ]
    );
    const afterFitPan = await readProbe();
    expect(afterFitPan.zoom).toBeCloseTo(1, 1);
    expect(Math.abs(afterFitPan.panX - atFit.panX)).toBeLessThan(1);
    expect(Math.abs(afterFitPan.panY - atFit.panY)).toBeLessThan(1);

    // 拡大してからパン → panX/panY が変化する（Req 33.4）
    // 指間距離を 40px → 140px（比 3.5）へ広げる。等倍からのピンチなので
    // 到達すべき倍率は 3.5（ZOOM_CONSTANTS.MAX_ZOOM=10 未満なのでクランプされない）。
    await twoFingerGesture(
      [
        { x: cx - 20, y: cy },
        { x: cx + 20, y: cy },
      ],
      [
        { x: cx - 70, y: cy },
        { x: cx + 70, y: cy },
      ]
    );
    const zoomed = await readProbe();
    // Req 33.2/33.4: 指を広げ切った最終的な指間距離の比まで拡大していること。
    //
    // Task 115.94: ここは以前 `toBeGreaterThan(1.01)` だった。この下限は緩すぎて、
    // ピンチが最初の 1 ステップ（比 1.313）だけ効いて以降のイベントが捨てられていても
    // 緑になっていた。実際、touchGestureManager の cooldown タイマが進行中のジェスチャーを
    // idle へ踏み潰す欠陥により、本検証は常に「1 ステップだけ効いた状態」で通過しており、
    // 踏み潰しが最初のステップより早く起きた回だけ zoom=1 のまま失敗していた。
    // 指示した比そのものと突き合わせることで、途中で止まる退行をその場で落とす。
    expect(zoomed.zoom).toBeCloseTo(3.5, 1);

    // 左上方向へ2本指ドラッグ（距離一定）→ panX/panY が負方向へ移動
    await twoFingerGesture(
      [
        { x: cx - 30, y: cy + 20 },
        { x: cx + 30, y: cy + 20 },
      ],
      [
        { x: cx - 30 - 50, y: cy + 20 - 50 },
        { x: cx + 30 - 50, y: cy + 20 - 50 },
      ]
    );
    const panned = await readProbe();
    const movedX = Math.abs(panned.panX - zoomed.panX);
    const movedY = Math.abs(panned.panY - zoomed.panY);
    // Req 33.4: 2本指中点の移動量（水平 -50px / 垂直 -50px）にパンが最後まで追従すること。
    // 1 ステップぶん（6.25px）だけ動いて止まる退行を落とすため、「5px より大きい」ではなく
    // 指示した移動量そのものと突き合わせる（旧来の `movedX + movedY > 5` は本主張に含意される）。
    //
    // Task 115.129: 縦方向は以前「clampPan の下限に達しているため 0 になり得る」として
    // 主張を置けなかった。真因は拡大の中心へ画面座標をそのまま渡していたことで、canvas 要素の
    // 上端オフセットぶん中心が下へずれ、ピンチ直後に既にパン下限へ張り付いていたためである。
    // 中心を描画面基準へ揃えた今は、縦方向も指示量どおり追従する。
    expect(Math.abs(movedX - 50)).toBeLessThan(2);
    expect(Math.abs(movedY - 50)).toBeLessThan(2);
  });

  /**
   * (3) 描画途中に2本目の指を置くと描画が中断しゴミ線が残らない
   *     Requirement 33.5
   */
  test('(3) 描画中に2本目の指で描画が中断しゴミ線が残らない (REQ-33.5)', async () => {
    await enterEditMode();
    await resetViewport();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await selectTool(/フリーハンド/i);
    const countBefore = (await readProbe()).objectCount;

    // 1本指で描画を開始（ドラッグ進行中）
    await dispatchTouch('touchStart', [{ x: cx - 40, y: cy, id: 0 }]);
    await dispatchTouch('touchMove', [{ x: cx - 20, y: cy, id: 0 }]);
    await sharedPage.waitForTimeout(20);
    await dispatchTouch('touchMove', [{ x: cx, y: cy, id: 0 }]);
    await sharedPage.waitForTimeout(20);

    // 描画途中で2本目の指を追加 → 描画中断（ピンチ/パンへ遷移）
    await dispatchTouch('touchStart', [
      { x: cx, y: cy, id: 0 },
      { x: cx + 60, y: cy, id: 1 },
    ]);
    await sharedPage.waitForTimeout(20);
    // 全指解放
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(100);

    // Req 33.5: 進行中の描画は確定されず、ゴミ線（パス）が残らない
    const after = await readProbe();
    expect(after.objectCount).toBe(countBefore);
  });

  /**
   * (4) 描画ツール選択中の1本指ドラッグが既存注釈を誤選択/移動しない
   *     Requirement 33.1 / 33.13
   */
  test('(4) 描画ツールの1本指ドラッグが既存注釈を誤選択・移動しない (REQ-33.1/33.13)', async () => {
    await enterEditMode();
    await resetViewport();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 既存注釈（四角形）を1つ配置
    await selectTool(/四角形/i);
    const countStart = (await readProbe()).objectCount;
    await oneFingerDrag({ x: cx - 40, y: cy - 30 }, { x: cx + 10, y: cy + 10 });
    const afterFirst = await readProbe();
    expect(afterFirst.objectCount).toBe(countStart + 1);

    const firstObj = await readLastObject();
    assertPresent(firstObj, '先に配置した四角形注釈の保存座標');

    // 別の描画ツール（円）に切替え、既存注釈の上から1本指ドラッグ
    await selectTool(/円/i);
    await oneFingerDrag({ x: cx - 10, y: cy - 10 }, { x: cx + 40, y: cy + 30 });

    const afterSecond = await readProbe();
    // Req 33.1/33.13: 既存注釈は選択されない（描画ツール中は selection 無効）
    expect(afterSecond.activeType).toBeNull();
    // 新規オブジェクトが作成される（描画として扱われる）
    expect(afterSecond.objectCount).toBe(afterFirst.objectCount + 1);

    // 既存注釈は移動していない（最初のオブジェクトの座標が不変）
    const firstObjAfter = await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const first = c.getObjects()[0];
      return first ? { left: first.left ?? 0, top: first.top ?? 0 } : null;
    });
    assertPresent(firstObjAfter, '2本目の描画後の既存注釈の保存座標');
    expect(Math.abs(firstObjAfter.left - firstObj.left)).toBeLessThan(1);
    expect(Math.abs(firstObjAfter.top - firstObj.top)).toBeLessThan(1);
  });

  /**
   * (12) ピンチ拡大の中心が2本指中点に固定される（縦方向を含む）
   *      Requirement 33.3
   *
   * Task 115.129: 編集キャンバスは画面上端からヘッダ/パンくず/ツールバーぶん下にある。
   * 拡大の中心へ画面基準の座標をそのまま渡すと、その要素オフセットぶん中心が下へずれる。
   * 「中点を基準に拡大する」が成立していれば、**中点に見えている画像上の位置（scene 座標）は
   * ピンチ前後で変わらない**。この不変量を実ブラウザの実タッチで検証する。
   */
  test('(12) ピンチ拡大の中心が2本指中点に固定される（縦方向を含む） (REQ-33.3)', async () => {
    await enterEditMode();
    await resetViewport();

    const box = await getCanvasBox();
    // 中点はキャンバス中央ではなく上寄り（縦オフセットの誤りが顕在化する位置）に置く。
    const relMidX = box.width / 2;
    const relMidY = box.height * 0.35;
    const midX = box.x + relMidX;
    const midY = box.y + relMidY;

    const before = await readProbe();
    expect(before.zoom).toBeCloseTo(1, 1);
    // 中点（描画面座標）に見えている scene 座標。
    const sceneBeforeX = (relMidX - before.panX) / before.zoom;
    const sceneBeforeY = (relMidY - before.panY) / before.zoom;

    // 中点を動かさず指間距離を 40px → 140px（比 3.5）へ広げる。
    await twoFingerGesture(
      [
        { x: midX - 20, y: midY },
        { x: midX + 20, y: midY },
      ],
      [
        { x: midX - 70, y: midY },
        { x: midX + 70, y: midY },
      ]
    );

    const after = await readProbe();
    // Req 33.2: 指示した指間距離の比そのものまで拡大していること（途中で止まる退行を落とす）。
    expect(after.zoom).toBeCloseTo(3.5, 1);

    const sceneAfterX = (relMidX - after.panX) / after.zoom;
    const sceneAfterY = (relMidY - after.panY) / after.zoom;
    // Req 33.3: 中点に見えている画像上の位置が拡大前後で保たれる＝中点が拡大の中心である。
    // 画面座標のまま渡す実装へ戻すと、キャンバス上端オフセット由来で縦に約 42.5（scene 座標）
    // ずれることを実測済み（Task 115.129 の変異検証）。
    expect(Math.abs(sceneAfterX - sceneBeforeX)).toBeLessThan(5);
    expect(Math.abs(sceneAfterY - sceneBeforeY)).toBeLessThan(5);
  });
});

// ============================================================================
// Task 98.2: ダブルタップズーム調停 / ズームUI / 拡大中の選択移動 / 44px a11y
// ============================================================================
//
// Requirements coverage（design.md「Requirements 29.4, 33-34」/ E2E 必須カバレッジ）:
//   - 33.8 / 27.1: 空き領域ダブルタップで拡大⇄全体トグル、テキスト注釈上ダブルタップは
//     編集に入りズームしない（findTarget 用途調停の実機検証）
//   - 34.1 / 34.4: ZoomControls のズームイン/アウト/フィットで倍率が変化し、フィットで
//     等倍復帰。倍率バッジ表示が更新される
//   - 33.11 / 33.12: 拡大状態で既存注釈をタップ選択→1本指ドラッグで移動し、座標が指に追従
//     （選択ツール時、ズーム倍率を考慮した追従）
//   - 29.4 / 34.5: ズームUIボタンの実寸 44px 以上、選択ハンドル touchCornerSize 44px、
//     ズームUI 領域の axe a11y 検証
//
// Task 98.1 と同様、CDP `Input.dispatchTouchEvent` で実タッチを模擬し、実装が公開する
// `window.__fabricCanvas`（getZoom / viewportTransform / getObjects / getActiveObject）で
// 状態を検証する。前提条件でのサイレントskipは行わない（満たさなければ失敗させる＝第3原則）。

const EDIT_MOBILE_VIEWPORT_2 = { width: 390, height: 844 };

test.describe('ダブルタップズーム調停/ズームUI/拡大中の選択移動/44px a11y（Task 98.2）', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedContext: BrowserContext;
  let sharedPage: Page;
  let cdp: CDPSession;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;

  async function dispatchTouch(
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<{ x: number; y: number; id: number }>
  ): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  }

  /** 単一タップ（touchStart → touchEnd）。座標は client 座標。 */
  async function tapAt(x: number, y: number): Promise<void> {
    await dispatchTouch('touchStart', [{ x, y, id: 0 }]);
    await sharedPage.waitForTimeout(40);
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(40);
  }

  /**
   * ダブルタップ（同一点を2回タップ）。touchGestureManager は2回目の pointerdown で
   * `custom:dbltap` を発火する。発火間隔が本番の閾値内であることを実測して主張する
   * （Task 115.69）。
   */
  async function doubleTapAt(x: number, y: number): Promise<void> {
    await doubleTapWithinThreshold(sharedPage, dispatchTouch, x, y);
  }

  /** 1本指ドラッグ（タッチ）。選択ツールでの注釈移動・描画に用いる。 */
  async function oneFingerDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 8
  ): Promise<void> {
    await dispatchTouch('touchStart', [{ x: from.x, y: from.y, id: 0 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await dispatchTouch('touchMove', [
        { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 0 },
      ]);
      await sharedPage.waitForTimeout(16);
    }
    await dispatchTouch('touchEnd', []);
    await sharedPage.waitForTimeout(50);
  }

  async function readProbe(): Promise<ViewportProbe> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) {
        return { zoom: -1, panX: 0, panY: 0, objectCount: -1, activeType: null };
      }
      const vpt = c.viewportTransform;
      const active = c.getActiveObject();
      return {
        zoom: c.getZoom(),
        panX: vpt[4] ?? 0,
        panY: vpt[5] ?? 0,
        objectCount: c.getObjects().length,
        activeType: active ? (active.type ?? 'unknown') : null,
      };
    });
  }

  /** index 番目のオブジェクトの保存座標（scene 座標 left/top）を読む。 */
  async function readObjectLeftTop(index: number): Promise<{ left: number; top: number } | null> {
    return await sharedPage.evaluate((i) => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const obj = c.getObjects()[i];
      if (!obj) return null;
      return { left: obj.left ?? 0, top: obj.top ?? 0 };
    }, index);
  }

  /** textAnnotation オブジェクトの編集状態（isEditing）を読む。 */
  async function readTextEditing(): Promise<boolean | null> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const objs = c.getObjects() as unknown as Array<{ type?: string; isEditing?: boolean }>;
      const textObj = objs.find((o) => o.type === 'textAnnotation');
      return textObj ? textObj.isEditing === true : null;
    });
  }

  /** アクティブオブジェクトの touchCornerSize（選択ハンドルのタッチターゲット）を読む。 */
  async function readActiveTouchCornerSize(): Promise<number | null> {
    return await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (!c) return null;
      const active = c.getActiveObject() as unknown as { touchCornerSize?: number } | null;
      return active && typeof active.touchCornerSize === 'number' ? active.touchCornerSize : null;
    });
  }

  /** ビューポートを等倍（zoom=1, pan=0）にリセットする（テストセットアップ）。 */
  async function resetViewport(): Promise<void> {
    await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas;
      if (c) {
        c.setViewportTransform([1, 0, 0, 1, 0, 0]);
        c.requestRenderAll();
      }
    });
    await sharedPage.waitForTimeout(50);
  }

  /**
   * ズーム操作ボタンを通常の actionability（可視・安定・イベント到達可能）でタップする。
   * Task 98.2 是正: 以前は ZoomControls が画面外（ページ水平 overflow による
   * レイアウトビューポート拡張で position:fixed が拡張ビューポート下端へアンカー）に出ており
   * force:true で覆い隠していた。ホスト画面側の overflow 抑止により ZoomControls は
   * 可視画面下部の片手到達領域に配置されるため、force を使わず実到達性で操作する（Req 34.6）。
   */
  async function tapZoomButton(name: string): Promise<void> {
    const button = sharedPage.getByTestId('zoom-controls').getByRole('button', { name });
    // Req 34.6: ボタンが可視ビューポート高さ内（片手到達領域）に収まることを観測可能に検証する。
    const bb = await button.boundingBox();
    expect(bb).not.toBeNull();
    expect(bb!.y + bb!.height).toBeLessThanOrEqual(EDIT_MOBILE_VIEWPORT_2.height);
    await button.tap();
  }

  /**
   * ページスクロールを先頭へ戻す（テスト座標の決定性確保）。
   * Task 98.2 是正: 以前はここで Fabric の `calcOffset()` を直接呼んで `_offset` 陳腐化を
   * 回避していた（実経路を迂回する偽の安定化）。実アプリ側で scroll / visualViewport の
   * resize・scroll・編集突入時に `calcOffset()` を呼ぶよう修正したため、ここでは
   * scrollTo のみ行い、アプリ側のスクロールハンドラ経由でオフセットが再計算される
   * 実経路を検証する（Fabric 内部 API への直接介入はしない）。
   */
  async function recalcOffset(): Promise<void> {
    await sharedPage.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await sharedPage.waitForTimeout(120);
  }

  /**
   * index 番目のオブジェクト中心の client 座標を、scene 座標と viewportTransform、
   * upper-canvas の boundingBox から算出する（ズーム/パン/配置に依存しない確実な指当て）。
   * `recalcOffset()` 後に呼ぶこと（box と Fabric `_offset` を一致させるため）。
   */
  async function objectCenterClient(index: number): Promise<{ x: number; y: number }> {
    const box = await getCanvasBox();
    const info = await sharedPage.evaluate((i) => {
      const c = globalThis.__fabricCanvas as unknown as {
        getObjects: () => Array<{ getCenterPoint?: () => { x: number; y: number } }>;
        viewportTransform: number[];
      } | null;
      if (!c) return null;
      const obj = c.getObjects()[i];
      if (!obj || typeof obj.getCenterPoint !== 'function') return null;
      const ctr = obj.getCenterPoint();
      return { sx: ctr.x, sy: ctr.y, vpt: c.viewportTransform };
    }, index);
    // 取れなかったまま null を返すと、呼び出し側は指を当てる先が無いことを黙って
    // 受け入れるほかない（同ファイルの type 指定版は同じ場面で throw している）。
    assertPresent(info, `${index} 番目の注釈オブジェクトの中心座標`);
    return {
      x: box.x + info.sx * (info.vpt[0] ?? 1) + (info.vpt[4] ?? 0),
      y: box.y + info.sy * (info.vpt[3] ?? 1) + (info.vpt[5] ?? 0),
    };
  }

  async function getCanvasBox(): Promise<CanvasBox> {
    const upper = sharedPage.locator('.upper-canvas');
    for (let i = 0; i < 20; i++) {
      const box = await upper.boundingBox();
      const ready = await sharedPage.evaluate(() => !!globalThis.__fabricCanvas);
      if (box && box.width > 10 && box.height > 10 && ready) {
        return box;
      }
      await sharedPage.waitForTimeout(200);
    }
    throw new Error('upper-canvas が初期化されませんでした');
  }

  async function enterEditMode(): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${createdImageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const editModeButton = sharedPage.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
    await editModeButton.tap();

    await sharedPage
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(10000) });
    await getCanvasBox();
  }

  async function selectTool(name: RegExp): Promise<void> {
    const tool = sharedPage.getByRole('button', { name });
    await expect(tool).toBeVisible({ timeout: getTimeout(5000) });
    // Req 28.8: 選択中ツールを再び押すと詳細属性パネルの開閉になる。本ヘルパーの意図は
    // 「当該ツールを選択状態にする」ことなので、既に選択済みなら押さない。
    if ((await tool.getAttribute('aria-pressed')) !== 'true') {
      await tool.tap();
    }
    await expect(tool).toHaveAttribute('aria-pressed', 'true');
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({
      viewport: EDIT_MOBILE_VIEWPORT_2,
      hasTouch: true,
      isMobile: true,
    });
    sharedPage = await sharedContext.newPage();
    cdp = await sharedContext.newCDPSession(sharedPage);

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `ズームUI_E2E用PJ_${Date.now()}`;
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

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `ズームUI_E2E用調査_${Date.now()}`;
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

    // 画像を API で直接アップロード（拡大の余地を確保するため大きめ画像を使用）
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

    const uploadBody = (await uploadResponse.json()) as {
      successful?: Array<{ id?: string }>;
    };
    createdImageId = uploadBody.successful?.[0]?.id ?? null;
    expect(createdImageId).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');
      if (createdSurveyId) {
        await cleanupPage.goto(`/site-surveys/${createdSurveyId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .or(cleanupPage.getByRole('dialog'))
            .getByRole('button', { name: /^削除する$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
        }
      }
      if (createdProjectId) {
        await cleanupPage.goto(`/projects/${createdProjectId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  /**
   * (5) 空き領域ダブルタップで拡大⇄全体表示がトグルする（Req 33.8 / 27.1 調停）
   */
  test('(5) 空き領域ダブルタップで拡大/全体表示をトグルする (REQ-33.8)', async () => {
    await enterEditMode();
    await recalcOffset();
    // ダブルタップ調停は対象有無で分岐するため、選択ツールで空き領域を確実化する
    await selectTool(/選択/i);

    // 等倍（zoom=1, pan=0）を確定させる（自動フィットの揺らぎを排除）
    await resetViewport();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const atFit = await readProbe();
    expect(atFit.zoom).toBeCloseTo(1, 1);
    expect(atFit.objectCount).toBe(0); // 空き領域（注釈なし）

    // 1回目: 等倍 → 拡大
    await doubleTapAt(cx, cy);
    const zoomedIn = await readProbe();
    expect(zoomedIn.zoom).toBeGreaterThan(1.5);
    // ダブルタップズームは新規注釈を作らない（描画誤発火しない）
    expect(zoomedIn.objectCount).toBe(0);

    // 2回目: 拡大中 → 全体表示（fit）へ戻る
    await doubleTapAt(cx, cy);
    const backToFit = await readProbe();
    expect(backToFit.zoom).toBeLessThan(zoomedIn.zoom);
    expect(backToFit.zoom).toBeCloseTo(1, 1);
  });

  /**
   * (6) テキスト注釈上のダブルタップは編集に入りズームしない（Req 27.1 と 33.8 の調停）
   */
  test('(6) テキスト注釈上のダブルタップは編集に入りズームしない (REQ-27.1/33.8)', async () => {
    await enterEditMode();
    await recalcOffset();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // テキスト注釈を中央付近に作成（テキストツールで1タップ＝配置＋編集突入）
    await selectTool(/テキスト/i);
    await tapAt(cx, cy);
    await sharedPage.waitForTimeout(200);
    expect((await readProbe()).objectCount).toBe(1);

    // 選択ツールへ切替え、空き隅をタップして編集を抜け選択も解除する。
    // テキスト編集突入時の隠し textarea フォーカスでページがスクロールするため
    // （キャンバスが可視下部にあり、ブラウザが入力欄を表示領域へスクロールする）、
    // recalcOffset() でスクロールを先頭へ戻し、キャッシュ済み box 座標と実レイアウトを
    // 一致させてから空き隅をタップする。アプリは scroll/touchstart で calcOffset を
    // 呼び直すため、ヒットテスト基準も同期される（実経路の検証）。
    await selectTool(/選択/i);
    await recalcOffset();
    await tapAt(box.x + 20, box.y + 20);
    await sharedPage.waitForTimeout(150);
    expect(await readTextEditing()).toBe(false);

    // テキスト編集の隠し textarea フォーカスで Fabric の内部オフセットが陳腐化し、
    // findTarget が誤判定するため再計算してからテキストの実位置を指す。
    await recalcOffset();
    const textClient = await objectCenterClient(0);

    const zoomBefore = (await readProbe()).zoom;

    // テキスト注釈本体をダブルタップ
    await doubleTapAt(textClient.x, textClient.y);
    await sharedPage.waitForTimeout(200);

    // Req 27.1: 編集モードへ入る
    expect(await readTextEditing()).toBe(true);
    // Req 33.8 調停: テキスト上ではズームトグルしない（倍率不変）
    const zoomAfter = (await readProbe()).zoom;
    expect(Math.abs(zoomAfter - zoomBefore)).toBeLessThan(0.05);
  });

  /**
   * (7) ZoomControls のズームイン/アウト/フィットで倍率が変化し、倍率バッジが更新される
   *     Req 34.1 / 34.4
   */
  test('(7) ズームUIで倍率が変化しフィットで等倍復帰・倍率バッジ更新 (REQ-34.1/34.4)', async () => {
    await enterEditMode();

    const zoomControls = sharedPage.getByTestId('zoom-controls');
    await expect(zoomControls).toBeVisible({ timeout: getTimeout(10000) });
    const badge = sharedPage.getByTestId('zoom-badge');

    // 既知状態（等倍）へ: フィットボタンで zoom=1, バッジ=100%
    await tapZoomButton('全体表示');
    await sharedPage.waitForTimeout(100);
    expect((await readProbe()).zoom).toBeCloseTo(1, 1);
    expect((await badge.textContent())?.trim()).toBe('100%');

    // ズームイン3回 → 倍率増加・バッジ更新（Req 34.1/34.3）
    await tapZoomButton('ズームイン');
    await tapZoomButton('ズームイン');
    await tapZoomButton('ズームイン');
    await sharedPage.waitForTimeout(100);
    const zoomedIn = (await readProbe()).zoom;
    expect(zoomedIn).toBeGreaterThan(1.0);
    const badgeIn = (await badge.textContent())?.trim();
    expect(badgeIn).not.toBe('100%');
    expect(badgeIn).toBe(`${Math.round(zoomedIn * 100)}%`);

    // ズームアウト1回 → 倍率減少（Req 34.1）
    await tapZoomButton('ズームアウト');
    await sharedPage.waitForTimeout(100);
    const zoomedOut = (await readProbe()).zoom;
    expect(zoomedOut).toBeLessThan(zoomedIn);

    // フィット → 等倍復帰・バッジ100%（Req 34.4）
    await tapZoomButton('全体表示');
    await sharedPage.waitForTimeout(100);
    expect((await readProbe()).zoom).toBeCloseTo(1, 1);
    expect((await badge.textContent())?.trim()).toBe('100%');
  });

  /**
   * (8) 拡大状態で既存注釈をタップ選択→1本指ドラッグで移動し、座標が指に追従する
   *     Req 33.11 / 33.12（選択ツール、ズーム倍率を考慮した追従）
   */
  test('(8) 拡大中に既存注釈をタップ選択しドラッグ移動・指に追従する (REQ-33.11/33.12)', async () => {
    await enterEditMode();
    await recalcOffset();

    const box = await getCanvasBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 中央付近に四角形を1つ配置（描画ツールで1本指ドラッグ）
    await selectTool(/四角形/i);
    await oneFingerDrag({ x: cx - 30, y: cy - 25 }, { x: cx + 30, y: cy + 25 });
    expect((await readProbe()).objectCount).toBe(1);
    const before = await readObjectLeftTop(0);
    assertPresent(before, '移動前の四角形注釈の保存座標');

    // 選択ツールへ切替え、ズームUIで拡大する（Req 33.12: 拡大状態での選択/移動）
    await selectTool(/選択/i);
    for (let i = 0; i < 6; i++) {
      await tapZoomButton('ズームイン');
    }
    await sharedPage.waitForTimeout(100);
    const zoom = (await readProbe()).zoom;
    expect(zoom).toBeGreaterThan(1.2);

    // 拡大後の四角形の実画面位置を算出してタップ選択する（Req 33.11）
    await recalcOffset();
    const rectClient = await objectCenterClient(0);

    await tapAt(rectClient.x, rectClient.y);
    await sharedPage.waitForTimeout(100);
    expect((await readProbe()).activeType).not.toBeNull();

    // 選択ハンドルのタッチターゲットが 44px（Req 29.4）
    const cornerSize = await readActiveTouchCornerSize();
    expect(cornerSize).not.toBeNull();
    expect(cornerSize ?? 0).toBeGreaterThanOrEqual(44);

    // ダブルタップ誤検出を避けるため lastTap を失効させてから移動ドラッグを行う
    await sharedPage.waitForTimeout(400);

    // 1本指ドラッグで移動（Req 33.12: 拡大中も指に追従）
    const screenDx = 40;
    const screenDy = 30;
    await oneFingerDrag(
      { x: rectClient.x, y: rectClient.y },
      { x: rectClient.x + screenDx, y: rectClient.y + screenDy }
    );
    await sharedPage.waitForTimeout(100);

    const after = await readObjectLeftTop(0);
    assertPresent(after, '移動後の四角形注釈の保存座標');

    // 画面移動量(px) は scene 移動量 × zoom。指の移動に追従し、かつ倍率を考慮した
    // 移動量になる（拡大中は scene 上の移動量が screen/zoom に縮む）。
    const expectedSceneDx = screenDx / zoom;
    const expectedSceneDy = screenDy / zoom;
    const actualDx = after.left - before.left;
    const actualDy = after.top - before.top;
    // 実際に移動している（誤発火・未移動ではない）
    expect(Math.abs(actualDx) + Math.abs(actualDy)).toBeGreaterThan(5);
    // 倍率を考慮した追従（タッチ模擬の丸め・ヒット余白を許容）
    expect(Math.abs(actualDx - expectedSceneDx)).toBeLessThan(15);
    expect(Math.abs(actualDy - expectedSceneDy)).toBeLessThan(15);
  });

  /**
   * (9) ズームUIボタンの実寸 44px 以上 + 片手到達領域配置 + ズームUI 領域の axe a11y 検証
   *     Req 34.5 / 34.6 / 29.4
   */
  test('(9) ズームUIボタンが44px以上で片手到達領域に収まりa11y違反がない (REQ-34.5/34.6/29.4)', async () => {
    await enterEditMode();

    const zoomControls = sharedPage.getByTestId('zoom-controls');
    await expect(zoomControls).toBeVisible({ timeout: getTimeout(10000) });

    // Req 34.6: ズームUI 全体が可視ビューポート高さ内（画面下端の片手到達領域）に収まる。
    // ページ水平 overflow によるレイアウトビューポート拡張で画面外へ出る回帰を検出する。
    const groupBox = await zoomControls.boundingBox();
    expect(groupBox).not.toBeNull();
    expect(groupBox!.y).toBeGreaterThanOrEqual(0);
    expect(groupBox!.y + groupBox!.height).toBeLessThanOrEqual(EDIT_MOBILE_VIEWPORT_2.height);

    // Req 34.5 / 34.6: 各ズーム操作ボタンが 44x44 以上、かつ可視ビューポート高さ内に収まる
    for (const name of ['ズームアウト', 'ズームイン', '全体表示']) {
      const btn = zoomControls.getByRole('button', { name });
      await expect(btn).toBeVisible();
      const bb = await btn.boundingBox();
      expect(bb).not.toBeNull();
      expect(bb?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(bb?.height ?? 0).toBeGreaterThanOrEqual(44);
      // Req 34.6: ボタン下端が可視ビューポート内（force:true で覆い隠さず実到達性を検証）
      expect((bb?.y ?? 0) + (bb?.height ?? 0)).toBeLessThanOrEqual(EDIT_MOBILE_VIEWPORT_2.height);
    }

    // Req 29.4 / 34.5: ズームUI 領域に WCAG a11y 違反がないこと（axe-core）
    const results = await new AxeBuilder({ page: sharedPage })
      .include('[data-testid="zoom-controls"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

// ============================================================================
// Task 103.2: 画像編集のスマホ作業領域・回帰 E2E（Requirement 36）
// ============================================================================
//
// Requirements coverage（design.md「Requirements 35-36」Testing Strategy → E2E Tests）:
//   - 36.1 / 36.2: モバイル幅の画像編集で背景画像が利用可能領域にフィットし、原寸より
//     小さい画像はフィット倍率まで拡大される（原寸頭打ちにしない・過小表示にしない）。
//     背景画像スケール（`window.__fabricCanvas.backgroundImage.scaleX`）と、レンダリング
//     された canvas 実寸が作業領域を十分に満たすことで検証する。
//   - 36.3: ツールバー等を除いた画像作業領域（`annotation-editor-container`）の短辺が
//     画面短辺の概ね 50% 以上。
//   - 36.3 / 36.5（Issue-3 補強）: ツールバー除外後の作業領域の縦高が編集ビュー高の一定割合
//     以上（短辺基準だけでは縦圧迫を見逃すため縦方向の可視作業高も測定する）。かつ
//     ツールバーが単段（多段化＝縦占有していない）。
//   - 36.6: 編集ページで水平はみ出しが無い（`scrollWidth <= innerWidth`）。
//   - 36.7: sticky なアプリヘッダー・パンくずが作業領域や操作要素（ZoomControls）と重ならない。
//   - 36.8: 上記の表示領域最適化が Req 33-34 の挙動を維持する（本ファイルの Task 98.1/98.2 の
//     ピンチズーム/パン・ダブルタップ等の編集 E2E が引き続き green であることで回帰確認する）。
//
// 前提条件でのサイレント skip は行わない（満たさなければ失敗させる＝第3原則）。
// design.md の注記どおり Playwright に mobile プロジェクトは未定義のため、
// `browser.newContext({ viewport })` でモバイル幅（375x667）を再現する。
// 小画像でフィット拡大（Req 36.2）を検証するため、原寸 100x100 の PNG を使用する。
//
// @requirement site-survey/REQ-36.1
// @requirement site-survey/REQ-36.2
// @requirement site-survey/REQ-36.3
// @requirement site-survey/REQ-36.5
// @requirement site-survey/REQ-36.6
// @requirement site-survey/REQ-36.7
// @requirement site-survey/REQ-36.8

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 2つの矩形が重なる（交差する）かどうかを判定する。境界の接触は重なりとみなさない。 */
function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.describe('画像編集モバイル表示領域の最適化・回帰（Task 103.2, Req 36）', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedContext: BrowserContext;
  let sharedPage: Page;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let createdImageId: string | null = null;

  /**
   * 詳細画面 → 画像ビューア → 編集モードへ遷移し、注釈ツールバーと canvas の
   * 初期化（背景画像フィット完了）を待つ。
   */
  async function enterEditMode(): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${createdImageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const editModeButton = sharedPage.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(10000) });
    await editModeButton.click();

    await sharedPage
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(10000) });

    // 背景画像のフィット（scaleX 設定・setDimensions）完了まで待つ。
    await sharedPage.waitForFunction(
      () => {
        const c = globalThis.__fabricCanvas as unknown as {
          backgroundImage?: { scaleX?: number } | null;
        } | null;
        return !!c && !!c.backgroundImage && typeof c.backgroundImage.scaleX === 'number';
      },
      undefined,
      { timeout: getTimeout(10000) }
    );
    // upper-canvas がレイアウトされる（実寸 > 0）まで待つ。
    await expect(sharedPage.locator('.upper-canvas')).toBeVisible({ timeout: getTimeout(10000) });
  }

  /** 必須の矩形を返す（null の場合は失敗させる＝サイレント skip しない）。 */
  async function requireBox(selector: string): Promise<Rect> {
    const box = await sharedPage.locator(selector).first().boundingBox();
    expect(box, `${selector} の boundingBox が取得できませんでした`).not.toBeNull();
    return box as Rect;
  }

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    sharedPage = await sharedContext.newPage();

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // プロジェクト作成
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    const projectName = `画像編集領域E2E用PJ_${Date.now()}`;
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

    // 現場調査作成
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys/new`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });

    const surveyName = `画像編集領域E2E用調査_${Date.now()}`;
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

    // 小画像（原寸 100x100 PNG）を API で直接アップロードする。
    // Req 36.2（原寸が表示領域より小さい場合はフィット倍率まで拡大）を検証するため、
    // モバイル幅の作業領域より小さい原寸の画像を用いる。
    const testImagePath = path.join(__dirname, '../../fixtures/test-image.png');
    expect(fs.existsSync(testImagePath)).toBeTruthy();
    const accessToken = await sharedPage.evaluate(() => localStorage.getItem('accessToken'));
    const uploadResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        multipart: {
          images: {
            name: 'test-image.png',
            mimeType: 'image/png',
            buffer: fs.readFileSync(testImagePath),
          },
        },
      }
    );
    expect(uploadResponse.ok()).toBeTruthy();

    const uploadBody = (await uploadResponse.json()) as {
      successful?: Array<{ id?: string }>;
    };
    createdImageId = uploadBody.successful?.[0]?.id ?? null;
    expect(createdImageId).toBeTruthy();
  });

  test.afterAll(async ({ browser }) => {
    const cleanupContext = await browser.newContext();
    const cleanupPage = await cleanupContext.newPage();
    try {
      await loginAsUser(cleanupPage, 'ADMIN_USER');
      if (createdSurveyId) {
        await cleanupPage.goto(`/site-surveys/${createdSurveyId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .or(cleanupPage.getByRole('dialog'))
            .getByRole('button', { name: /^削除する$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/site-surveys$/, { timeout: getTimeout(15000) });
        }
      }
      if (createdProjectId) {
        await cleanupPage.goto(`/projects/${createdProjectId}`);
        await cleanupPage.waitForLoadState('networkidle');
        const deleteButton = cleanupPage.getByRole('button', { name: /削除/i }).first();
        if (await isVisibleWithin(deleteButton, getTimeout(5000))) {
          await deleteButton.click();
          const confirmButton = cleanupPage
            .getByTestId('focus-manager-overlay')
            .getByRole('button', { name: /^削除$/i });
          await confirmButton.click();
          await cleanupPage.waitForURL(/\/projects$/, { timeout: getTimeout(15000) });
        }
      }
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  /**
   * (10) モバイル幅の画像編集で作業領域の短辺が画面短辺の 50% 以上・ツールバー除外後の
   *      縦高が編集ビュー高の一定割合以上・ツールバーが単段、かつ初期フィットが過小でない。
   *      Req 36.1 / 36.2 / 36.3 / 36.5
   */
  test('(10) 画像作業領域の短辺≥画面短辺50%・縦高確保・単段ツールバー・過小でないフィット (site-survey/REQ-36.1/36.2/36.3/36.5)', async () => {
    await enterEditMode();

    const viewport = sharedPage.viewportSize();
    assertPresent(viewport, 'モバイル幅の検証で用いるビューポートの寸法');
    const screenShort = Math.min(viewport.width, viewport.height);

    const workArea = await requireBox('[data-testid="annotation-editor-container"]');
    const editorBox = await requireBox('.survey-image-viewer__editor');
    const toolbar = await requireBox('[data-testid="annotation-toolbar"]');

    // Req 36.3: 画像作業領域（ツールバー等を除く）の短辺が画面短辺の概ね 50% 以上。
    const workAreaShort = Math.min(workArea.width, workArea.height);
    expect(workAreaShort).toBeGreaterThanOrEqual(0.5 * screenShort);

    // Req 36.5（Issue-3 補強）: ツールバー除外後の作業領域の縦高が、編集ビュー高の
    // 一定割合以上であること。短辺（横幅律速）だけでは縦圧迫を見逃すため縦方向を測定する。
    expect(workArea.height).toBeGreaterThanOrEqual(0.55 * editorBox.height);

    // Req 36.5: ツールバーが単段（多段化して縦方向を過度に占有していない）。
    // ボタンの実寸は 44px（Req 28.3）。単段なら概ね 1 行分（44px + 上下 padding）に収まる。
    // 2 段以上に折り返すとこの上限（88px = 2 行分未満）を超える。
    expect(toolbar.height).toBeGreaterThanOrEqual(44);
    expect(toolbar.height).toBeLessThan(88);

    // Req 36.2: 原寸 100x100 の小画像がフィット倍率まで拡大されている（原寸頭打ちにしない）。
    const bgScale = await sharedPage.evaluate(() => {
      const c = globalThis.__fabricCanvas as unknown as {
        backgroundImage?: { scaleX?: number } | null;
      } | null;
      return c?.backgroundImage?.scaleX ?? null;
    });
    expect(bgScale).not.toBeNull();
    expect(bgScale as number).toBeGreaterThan(1);

    // Req 36.1: レンダリングされた canvas が利用可能領域（作業領域からフィット余白 48px を
    // 差し引いた領域）を幅または高さいっぱいに満たす（初期表示が過小でない）。
    const canvasBox = await requireBox('.upper-canvas');
    const padding = 48;
    const availWidth = workArea.width - padding;
    const availHeight = workArea.height - padding;
    expect(availWidth).toBeGreaterThan(0);
    expect(availHeight).toBeGreaterThan(0);
    const fillRatio = Math.max(canvasBox.width / availWidth, canvasBox.height / availHeight);
    expect(fillRatio).toBeGreaterThanOrEqual(0.85);
  });

  /**
   * (11) モバイル幅の画像編集ページで水平はみ出しが無く、sticky ヘッダー/パンくずが
   *      作業領域・操作要素（ZoomControls）と重ならない。
   *      Req 36.6 / 36.7
   */
  test('(11) 編集ページの水平はみ出し無し・ヘッダー/パンくずが作業領域と非重畳 (site-survey/REQ-36.6/36.7)', async () => {
    await enterEditMode();

    // Req 36.6: ページ全体で水平スクロール（コンテンツ幅がビューポート幅を超える状態）が無い。
    const overflow = await sharedPage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    // Req 36.7: 固定/重畳する要素（sticky アプリヘッダー・パンくず）が、画像作業領域および
    // 操作要素（ZoomControls）と初期（未スクロール）状態で視覚的に重ならない。
    const header = await requireBox('.app-header');
    const breadcrumb = await requireBox('nav.breadcrumb');
    const workArea = await requireBox('[data-testid="annotation-editor-container"]');
    const zoomControls = await requireBox('[data-testid="zoom-controls"]');

    expect(
      rectsIntersect(header, workArea),
      'sticky アプリヘッダーが画像作業領域と重なっています'
    ).toBe(false);
    expect(
      rectsIntersect(header, zoomControls),
      'sticky アプリヘッダーが ZoomControls と重なっています'
    ).toBe(false);
    expect(rectsIntersect(breadcrumb, workArea), 'パンくずが画像作業領域と重なっています').toBe(
      false
    );
  });
});
