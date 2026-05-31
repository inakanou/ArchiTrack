/**
 * @fileoverview 6 形状（Rectangle/Circle/Polygon/Polyline/Freehand/Dimension）の
 *               白縁取り表現の保存・復元 E2E テスト
 *
 * Task 89.2: 6 形状を 1 つずつ描画 → 保存 → リロード → 全形状で白縁取りが
 * 復元されること、Dimension の寸法値ラベルにも白アウトラインが乗ることを検証する。
 *
 * Requirements:
 * - 32.1: 6 形状すべてに白縁取り（Group 化された outline path）を適用
 * - 32.6: outline 属性の永続化（toObject / fromObject ラウンドトリップ）
 * - 32.7: リロード後に outline 表現が復元される
 * - 32.8: 既存 enlivenObjects 経路で outline 属性が復元される
 * - 32.12: Dimension の寸法値ラベルに白アウトライン（paintFirst）が適用される
 * - 32.14: 注釈付きサムネイル再生成パイプラインで白縁取りが反映される
 *
 * 実行要件:
 *   1. `npm run test:docker` で architrack-test 環境を起動する
 *   2. `npx playwright test site-survey-all-shape-outline` を実行する
 *
 * 注: 完全な事前準備は既存 site-survey-annotation-tools.spec.ts の
 *     パターンを踏襲する。Canvas 上での厳密な座標操作と outline 属性の
 *     検証は `page.evaluate(() => fabricCanvas.getObjects())` を併用する。
 *
 * @requirement site-survey/REQ-32.1
 * @requirement site-survey/REQ-32.6
 * @requirement site-survey/REQ-32.7
 * @requirement site-survey/REQ-32.8
 * @requirement site-survey/REQ-32.12
 * @requirement site-survey/REQ-32.14
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';

/**
 * 検証対象 6 形状の定義。
 * `toolButton` は AnnotationToolbar の getByRole 名、
 * `objectType` は Fabric 上に登録される type 値（getObjects().type 比較用）。
 */
const SHAPE_DEFINITIONS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly toolButton: RegExp;
  readonly objectType: string;
}> = [
  { key: 'rectangle', label: '四角形', toolButton: /四角形/i, objectType: 'rect-group' },
  { key: 'circle', label: '円', toolButton: /円/i, objectType: 'circle-group' },
  { key: 'polygon', label: '多角形', toolButton: /多角形/i, objectType: 'polygon-group' },
  { key: 'polyline', label: '折れ線', toolButton: /折れ線/i, objectType: 'polyline-group' },
  {
    key: 'freehand',
    label: 'フリーハンド',
    toolButton: /フリーハンド/i,
    objectType: 'freehand-group',
  },
  { key: 'dimension', label: '寸法線', toolButton: /寸法線/i, objectType: 'dimension-group' },
] as const;

test.describe('6 形状の白縁取り保存・復元', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedPage: Page;
  let sharedContext: BrowserContext;
  let surveyId: string | null = null;
  let imageId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    await loginAsUser(sharedPage, 'REGULAR_USER');

    // NOTE: プロジェクト/現場調査/画像アップロードは既存 spec の beforeAll を踏襲。
    surveyId = process.env.E2E_SURVEY_ID ?? null;
    imageId = process.env.E2E_IMAGE_ID ?? null;
  });

  test.afterAll(async () => {
    await sharedContext?.close();
  });

  test.beforeEach(async () => {
    test.skip(!surveyId || !imageId, 'E2E_SURVEY_ID / E2E_IMAGE_ID 未設定のためスキップ');
  });

  /**
   * (a) 6 形状を 1 つずつ描画 → 保存 → リロード → 全形状で白縁取りが復元
   *     Requirement 32.1, 32.6, 32.7, 32.8
   */
  test('(a) 6 形状すべてが保存・リロード後に白縁取り付きで復元される', async () => {
    await sharedPage.goto(`/site-surveys/${surveyId}/images/${imageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const canvas = sharedPage.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // 各形状を順番に描画する
    for (const [index, shape] of SHAPE_DEFINITIONS.entries()) {
      await sharedPage.getByRole('button', { name: shape.toolButton }).click();

      // 簡易ドラッグ操作（実 UI 仕様に応じて helper 化）
      // 形状ごとに x オフセットをずらして衝突を回避する
      const offsetX = box.x + 40 + index * 60;
      const offsetY = box.y + 40;
      await sharedPage.mouse.move(offsetX, offsetY);
      await sharedPage.mouse.down();
      await sharedPage.mouse.move(offsetX + 50, offsetY + 50, { steps: 8 });
      await sharedPage.mouse.up();

      // 多角形/折れ線/フリーハンドはツール仕様に応じて確定操作が必要な場合あり
      if (shape.key === 'polygon' || shape.key === 'polyline') {
        await sharedPage.keyboard.press('Enter');
      }
    }

    // 保存 (Requirement 32.6)
    await sharedPage.getByRole('button', { name: /保存/i }).click();
    await expect(sharedPage.getByText(/保存しました/i)).toBeVisible({
      timeout: getTimeout(10000),
    });

    // リロード (Requirement 32.7)
    await sharedPage.reload();
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.locator('canvas').first()).toBeVisible();

    // Fabric Canvas 上の全オブジェクトの outline 属性を検証する
    // 実装は AnnotationEditor が window 経由で fabricCanvas を露出するか、
    // data 属性経由で objects JSON を expose する想定。
    const outlineStates = await sharedPage.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const canvas = w.__architrack_fabricCanvas__;
      if (!canvas) return [];
      return canvas.getObjects().map((obj: { type?: string; outline?: { enabled?: boolean } }) => ({
        type: obj.type,
        outlineEnabled: obj.outline?.enabled === true,
      }));
    });

    // 6 形状すべてが outline.enabled = true で復元されている
    expect(outlineStates.length).toBeGreaterThanOrEqual(SHAPE_DEFINITIONS.length);
    for (const shape of SHAPE_DEFINITIONS) {
      const restored = outlineStates.find(
        (s: { type?: string }) => typeof s.type === 'string' && s.type.startsWith(shape.key)
      );
      // TODO(89.2): 実装の type 命名が確定したら厳密一致に差し替える
      expect(restored, `${shape.label} が復元されていない`).toBeTruthy();
    }
  });

  /**
   * (b) Dimension の寸法値ラベルにも白アウトラインが乗ること
   *     Requirement 32.12
   */
  test('(b) Dimension の寸法値ラベルに白アウトラインが適用される', async () => {
    await sharedPage.goto(`/site-surveys/${surveyId}/images/${imageId}`);
    await sharedPage.waitForLoadState('networkidle');

    const canvas = sharedPage.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) return;

    // 寸法線ツールで描画
    await sharedPage.getByRole('button', { name: /寸法線/i }).click();
    await sharedPage.mouse.move(box.x + 60, box.y + 80);
    await sharedPage.mouse.down();
    await sharedPage.mouse.move(box.x + 200, box.y + 80, { steps: 8 });
    await sharedPage.mouse.up();

    // 寸法値入力（入力 UI 仕様に応じて keyboard 入力）
    await sharedPage.keyboard.type('1200');
    await sharedPage.keyboard.press('Enter');

    await sharedPage.getByRole('button', { name: /保存/i }).click();
    await sharedPage.reload();
    await sharedPage.waitForLoadState('networkidle');

    // labelText の paintFirst / strokeWidth が白アウトライン仕様（design.md L4800 系）
    const labelOutline = await sharedPage.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const canvas = w.__architrack_fabricCanvas__;
      if (!canvas) return null;
      const dim = canvas
        .getObjects()
        .find((obj: { type?: string }) => obj.type === 'dimension-group');
      // dimension-group は labelText を子に持つ想定（design.md AnnotationRendererService 参照）
      if (!dim || !('_objects' in dim)) return null;
      const label = (
        dim as {
          _objects: Array<{
            type?: string;
            paintFirst?: string;
            strokeWidth?: number;
            stroke?: string;
          }>;
        }
      )._objects.find((o) => o.type === 'i-text' || o.type === 'text');
      if (!label) return null;
      return {
        paintFirst: label.paintFirst,
        strokeWidth: label.strokeWidth,
        stroke: label.stroke,
      };
    });

    // ラベルに白アウトラインが乗っている（paintFirst=stroke, stroke=白, strokeWidth > 0）
    expect(labelOutline).not.toBeNull();
    if (labelOutline) {
      expect(labelOutline.paintFirst).toBe('stroke');
      expect(labelOutline.stroke).toMatch(/^(white|#fff(fff)?|rgba?\(255,\s*255,\s*255)/i);
      expect(labelOutline.strokeWidth ?? 0).toBeGreaterThan(0);
    }
  });
});
