/**
 * @fileoverview 数量グループのカードの 375 幅の配置の E2E テスト
 *
 * Task 103.1: 375 幅で、数量グループのカードの見出し（折りたたみの釦・グループ名・項目数・
 * 並び替えの釦・コピーの釦・削除の釦）と、紐付け写真の領域（写真・写真の変更と紐付け解除の釦・
 * 写真コメント）が、カードの内側の右端からはみ出さないことを確かめる。
 *
 * 数量グループのカードを描く画面は数量表の編集画面（`/quantity-tables/:id/edit`）だけである
 * （`frontend/src/pages/QuantityTableEditPage.tsx` が唯一の本番の呼び出し元）。この画面を、
 * 3 通りのグループ名（短い名前・空白を含む長い和文・区切りの無い長い一語）と、写真の有無の
 * 2 通りを掛けた 6 グループで一度に測る。写真コメントも 3 通り（短い・長い和文・区切りの無い
 * 長い一語）を与える。名前はいずれもグループ名の最大文字数（全角 25 文字 / 半角 50 文字、
 * REQ-22.4）の範囲に収める。
 *
 * 主張（375 幅）:
 *   (1) カードの各要素の矩形と、グループ名・写真コメントの文字列の範囲（Range）の右端と左端が、
 *       カードの内側（枠とスクロールバーを除く）に収まる
 *   (2) カードと見出しの行が自分の中で水平にあふれない（scrollWidth <= clientWidth）
 *   (3) ページに水平スクロールが出ない（文書の scrollWidth <= clientWidth）
 *   (4) 非空証明: 各要素が存在し幅を持つ。グループ名の領域が見出しの内側の幅の半分以上を占める
 *       （1 文字ずつ縦に折り返す潰れを捕まえる）。区切りの無い長い名前は、折り返さない幅が
 *       グループ名の領域より広い（長い一語の場合を実際に踏んでいる）
 * 退行の見張り:
 *   - 数量項目の表は自分の水平スクロールのラッパーの中であふれてよい（REQ-37 AC 6 / REQ-41）。
 *     ラッパーの箱はカードに収まり、その中身はラッパーの中で水平にあふれていること
 *   - 写真コメントは写真の右側に表示される（REQ-21.2）
 *   - デスクトップ幅（1280px）の配置は変えない。写真の枠は 640×480 のまま、見出しは折り返さず、
 *     削除の釦はグループ名と同じ行に並ぶ
 * 画面からは矩形と計算済みスタイルの生の値だけを受け取り、判定はすべてこの側で行う。
 * 寸法はフォントに依存しない形（矩形の包含・比率・計算済みスタイル）で主張する。
 *
 * Requirements coverage (quantity-table-generation):
 * 受け入れ条件に 375 幅のカードの配置を定める項は無いため、要件番号は名乗らない。
 * 写真コメントが写真の右側にあること・数量項目の表のラッパー内の水平スクロールは、
 * 既存の条文の退行の見張りとして置く（被覆は名乗らない）。
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';
import { seedSurveyPhotosWithComments } from '../../helpers/quantity-table-preconditions';
import { assertPrepared } from '../../helpers/preconditions';

// ============================================================================
// 資材
// ============================================================================

const RUN_ID = Date.now();
const PROJECT_NAME = `カード配置E2E_${RUN_ID}`;
const TABLE_NAME = `カード配置E2E数量表_${RUN_ID}`;

/** グループ名の 3 通り（短い・空白を含む長い和文・区切りの無い長い一語） */
const GROUP_NAMES = {
  short: '基礎工事',
  longJapanese: '東側外壁 改修工事 足場設置 養生シート張り 第三',
  longUnbroken: 'IMG_20261010_143052_EXTERIOR_NORTH_WALL_PANEL_0001',
} as const;

/** 写真コメントの 3 通り（写真の並び順に対応する） */
const PHOTO_COMMENTS = [
  '北面の状況',
  '東側外壁の北端から南端までの全景。足場の設置前の状態で、養生シートはまだ張られていない。',
  `https://example.com/surveys/${'0123456789abcdef'.repeat(6)}`,
] as const;

const NAME_VARIANTS = [
  GROUP_NAMES.short,
  GROUP_NAMES.longJapanese,
  GROUP_NAMES.longUnbroken,
] as const;

/** 写真ありのグループ 3 件・写真なしのグループ 3 件 */
const GROUP_COUNT = NAME_VARIANTS.length * 2;

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

/** 矩形の比較の許容（サブピクセルの丸め） */
const EPSILON_PX = 0.5;

let projectId: string | undefined;
let tableId: string | undefined;

// ============================================================================
// 画面から受け取る生の値
// ============================================================================

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface CardLayout {
  /** カードの内側（枠とスクロールバーを除く）の矩形 */
  inner: Box;
  cardScrollWidth: number;
  cardClientWidth: number;
  headerScrollWidth: number;
  headerClientWidth: number;
  /** 見出しの内側（padding を除く）の幅 */
  headerContentWidth: number;
  /** 測る要素の名前と矩形（存在しないものは null） */
  parts: Record<string, Box | null>;
  /** グループ名・写真コメントの文字列の範囲の矩形 */
  textRanges: Record<string, Box | null>;
  /** グループ名を折り返さずに描いた幅 */
  groupNameNoWrapWidth: number;
  /** 数量項目の表のラッパーの scrollWidth / clientWidth */
  tableScrollWidth: number;
  tableClientWidth: number;
}

/** カード 1 枚の配置の生の値を読む */
async function readCardLayout(cardLocator: Locator): Promise<CardLayout> {
  return cardLocator.evaluate((cardEl) => {
    const toBox = (rect: DOMRect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const boxOf = (el: Element | null) => (el ? toBox(el.getBoundingClientRect()) : null);
    const rangeBoxOf = (el: Element | null) => {
      if (!el || !el.textContent) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      return toBox(range.getBoundingClientRect());
    };

    const cardRect = cardEl.getBoundingClientRect();
    const card = cardEl as HTMLElement;
    const innerLeft = cardRect.left + card.clientLeft;
    const innerTop = cardRect.top + card.clientTop;
    const inner = {
      left: innerLeft,
      top: innerTop,
      right: innerLeft + card.clientWidth,
      bottom: innerTop + card.clientHeight,
      width: card.clientWidth,
      height: card.clientHeight,
    };

    const header = cardEl.firstElementChild?.nextElementSibling as HTMLElement | null;
    const headerStyle = header ? getComputedStyle(header) : null;
    const headerContentWidth =
      header && headerStyle
        ? header.clientWidth -
          parseFloat(headerStyle.paddingLeft) -
          parseFloat(headerStyle.paddingRight)
        : 0;

    const groupName = cardEl.querySelector('h3');
    let groupNameNoWrapWidth = 0;
    if (groupName) {
      const probe = groupName.cloneNode(true) as HTMLElement;
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.whiteSpace = 'nowrap';
      probe.style.width = 'auto';
      document.body.appendChild(probe);
      groupNameNoWrapWidth = probe.getBoundingClientRect().width;
      probe.remove();
    }

    const tableWrapper = cardEl.querySelector<HTMLElement>('[data-testid^="item-table-scroll-"]');
    const comment = cardEl.querySelector('[data-testid="photo-comment-display"]');

    return {
      inner,
      cardScrollWidth: card.scrollWidth,
      cardClientWidth: card.clientWidth,
      headerScrollWidth: header?.scrollWidth ?? 0,
      headerClientWidth: header?.clientWidth ?? 0,
      headerContentWidth,
      parts: {
        header: boxOf(header),
        toggleButton: boxOf(cardEl.querySelector('button[aria-expanded]')),
        groupName: boxOf(groupName),
        groupMeta: boxOf(groupName?.nextElementSibling ?? null),
        moveUpButton: boxOf(cardEl.querySelector('button[aria-label="上へ移動"]')),
        moveDownButton: boxOf(cardEl.querySelector('button[aria-label="下へ移動"]')),
        copyButton: boxOf(cardEl.querySelector('button[aria-label="グループをコピー"]')),
        deleteButton: boxOf(cardEl.querySelector('button[aria-label="グループを削除"]')),
        photo: boxOf(cardEl.querySelector('[aria-label="紐付け画像を表示"]')),
        changePhotoButton: boxOf(cardEl.querySelector('button[aria-label="写真を変更"]')),
        unlinkPhotoButton: boxOf(cardEl.querySelector('button[aria-label="写真の紐付けを解除"]')),
        comment: boxOf(comment),
        photoPlaceholder: boxOf(cardEl.querySelector('[data-testid^="image-placeholder-"]')),
        itemTableWrapper: boxOf(tableWrapper),
      },
      textRanges: {
        groupName: rangeBoxOf(groupName),
        comment: rangeBoxOf(comment),
      },
      groupNameNoWrapWidth,
      tableScrollWidth: tableWrapper?.scrollWidth ?? 0,
      tableClientWidth: tableWrapper?.clientWidth ?? 0,
    };
  });
}

/** 文書の水平方向の scrollWidth / clientWidth を読む */
async function readDocumentWidths(
  page: Page
): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

/** 写真ありのグループのカードが持つ要素 */
const PARTS_WITH_PHOTO = [
  'header',
  'toggleButton',
  'groupName',
  'groupMeta',
  'moveUpButton',
  'moveDownButton',
  'copyButton',
  'deleteButton',
  'photo',
  'changePhotoButton',
  'unlinkPhotoButton',
  'comment',
  'itemTableWrapper',
] as const;

/** 写真なしのグループのカードが持つ要素 */
const PARTS_WITHOUT_PHOTO = [
  'header',
  'toggleButton',
  'groupName',
  'groupMeta',
  'moveUpButton',
  'moveDownButton',
  'copyButton',
  'deleteButton',
  'photoPlaceholder',
  'itemTableWrapper',
] as const;

/** 矩形がカードの内側に収まっていない辺を返す（収まっていれば空） */
function overflowEdges(label: string, box: Box, inner: Box): string[] {
  const violations: string[] = [];
  if (box.right > inner.right + EPSILON_PX) {
    violations.push(
      `${label} の右端 ${box.right.toFixed(1)} がカードの内側の右端 ${inner.right.toFixed(1)} を ${(box.right - inner.right).toFixed(1)}px 越える`
    );
  }
  if (box.left < inner.left - EPSILON_PX) {
    violations.push(
      `${label} の左端 ${box.left.toFixed(1)} がカードの内側の左端 ${inner.left.toFixed(1)} より ${(inner.left - box.left).toFixed(1)}px 外にある`
    );
  }
  return violations;
}

// ============================================================================
// 前提の生成と後始末
// ============================================================================

/** 測定用のプロジェクト・写真 3 枚の現場調査・6 グループの数量表を作る */
async function setupTestData(page: Page): Promise<void> {
  const prisma = getPrismaClient();
  const testUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  assertPrepared(testUser, 'テストユーザー（global-setup の admin）');

  projectId = (
    await prisma.project.create({
      data: {
        name: PROJECT_NAME,
        status: 'PREPARING',
        salesPersonId: testUser.id,
        createdById: testUser.id,
      },
    })
  ).id;

  // 写真は保存先の実体が要るため、アップロードの経路で作る
  const { imageIds } = await seedSurveyPhotosWithComments(
    page,
    projectId,
    'カード配置E2E',
    PHOTO_COMMENTS,
    'none'
  );
  expect(imageIds, '前提: 写真が 3 枚ある').toHaveLength(NAME_VARIANTS.length);

  const groups = [
    ...NAME_VARIANTS.map((name, index) => ({ name, surveyImageId: imageIds[index]! })),
    ...NAME_VARIANTS.map((name) => ({ name, surveyImageId: null })),
  ];

  tableId = (
    await prisma.quantityTable.create({
      data: {
        projectId,
        name: TABLE_NAME,
        groups: {
          create: groups.map((group, index) => ({
            name: group.name,
            surveyImageId: group.surveyImageId,
            displayOrder: index,
            items: {
              // ピッチは計算用の欄が最も多く、数量項目の表がラッパーの中で水平にあふれる
              create: [
                {
                  workType: 'カード配置工種',
                  name: `ピッチ項目${index + 1}`,
                  unit: 'm',
                  calculationMethod: 'PITCH',
                  calculationParams: {
                    rangeLength: 10,
                    endLength1: 1,
                    endLength2: 1,
                    pitchLength: 2,
                  },
                  quantity: 5,
                  displayOrder: 0,
                },
              ],
            },
          })),
        },
      },
    })
  ).id;
}

/** 測定用のプロジェクトとその下の数量表・現場調査を消す */
async function cleanupTestData(): Promise<void> {
  // 作成に至らなかった場合は undefined のため除く（空の in は何も消さない）
  const projectIds = [projectId].filter((id): id is string => !!id);
  const prisma = getPrismaClient();
  await prisma.quantityTable.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.siteSurvey.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

/** 編集画面を開き、全グループのカードの表示を待つ */
async function openEditPage(page: Page): Promise<Locator> {
  assertPrepared(tableId, '測定用の数量表のID');
  await page.goto(`/quantity-tables/${tableId}/edit`);
  const cards = page.getByTestId('quantity-group-card');
  await expect(cards, '前提: 6 グループのカードが表示される').toHaveCount(GROUP_COUNT, {
    timeout: getTimeout(15000),
  });
  // 写真ありのグループの写真の枠が出るまで待つ（配置の確定）
  await expect(page.locator('[aria-label="紐付け画像を表示"]')).toHaveCount(NAME_VARIANTS.length, {
    timeout: getTimeout(15000),
  });
  return cards;
}

// ============================================================================
// テスト
// ============================================================================

test.describe('数量グループのカードの 375 幅の配置', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      await setupTestData(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    await cleanupTestData();
    await disconnectDatabase();
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsUser(page, 'ADMIN_USER');
  });

  test('375 幅で、3 通りの名前と写真の有無の全カードの見出しと写真の領域がカードの内側に収まり、ページに水平スクロールが出ない', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    const cards = await openEditPage(page);

    // 配置の崩れは要素ごとに集め、最後にまとめて主張する（一つ目の崩れで止めず、全容を失敗の文言に出す）
    const violations: string[] = [];
    const layouts: CardLayout[] = [];
    for (let index = 0; index < GROUP_COUNT; index += 1) {
      const card = cards.nth(index);
      const hasPhoto = index < NAME_VARIANTS.length;
      const name = NAME_VARIANTS[index % NAME_VARIANTS.length]!;
      const label = `グループ${index + 1}（${hasPhoto ? '写真あり' : '写真なし'}・${name}）`;

      await expect(card.locator('h3'), `前提: ${label} のグループ名が表示される`).toHaveText(name);
      const layout = await readCardLayout(card);
      layouts.push(layout);

      // (4) 非空証明: 測る要素がすべて存在する
      const expectedParts = hasPhoto ? PARTS_WITH_PHOTO : PARTS_WITHOUT_PHOTO;
      for (const part of expectedParts) {
        expect(layout.parts[part], `${label} に ${part} がある`).not.toBeNull();
      }
      expect(
        layout.textRanges.groupName,
        `${label} のグループ名の文字列の範囲を測れる`
      ).not.toBeNull();
      // 写真コメントの文字列は写真ありのカードだけが持つ（写真なしのカードは範囲が無いこと自体を主張する）
      expect(
        layout.textRanges.comment === null,
        `${label} の写真コメントの文字列の範囲は${hasPhoto ? '測れる' : '無い'}`
      ).toBe(!hasPhoto);

      // (4) 非空証明: 測る要素が幅と高さを持つ
      for (const part of expectedParts) {
        const box = layout.parts[part]!;
        if (box.width <= 0 || box.height <= 0) {
          violations.push(
            `${label} の ${part} が潰れている（幅 ${box.width.toFixed(1)} / 高さ ${box.height.toFixed(1)}）`
          );
        }
      }

      // (4) グループ名の領域が潰れていない（1 文字ずつ縦に折り返す形を捕まえる）
      const nameWidth = layout.parts.groupName!.width;
      if (nameWidth < layout.headerContentWidth / 2) {
        violations.push(
          `${label} のグループ名の領域の幅 ${nameWidth.toFixed(1)} が見出しの内側の幅 ${layout.headerContentWidth.toFixed(1)} の半分に満たない`
        );
      }

      // (1) 要素の矩形と、文字列の範囲がカードの内側に収まる
      for (const part of expectedParts) {
        violations.push(...overflowEdges(`${label} の ${part}`, layout.parts[part]!, layout.inner));
      }
      violations.push(
        ...overflowEdges(
          `${label} のグループ名の文字列`,
          layout.textRanges.groupName!,
          layout.inner
        )
      );
      const commentRange = layout.textRanges.comment;
      violations.push(
        ...(commentRange
          ? overflowEdges(`${label} の写真コメントの文字列`, commentRange, layout.inner)
          : [])
      );

      // (2) カードと見出しの行が自分の中で水平にあふれない
      if (layout.cardScrollWidth > layout.cardClientWidth) {
        violations.push(
          `${label} のカードが水平にあふれる（scrollWidth ${layout.cardScrollWidth} / clientWidth ${layout.cardClientWidth}）`
        );
      }
      if (layout.headerScrollWidth > layout.headerClientWidth) {
        violations.push(
          `${label} の見出しが水平にあふれる（scrollWidth ${layout.headerScrollWidth} / clientWidth ${layout.headerClientWidth}）`
        );
      }
    }

    // (3) ページに水平スクロールが出ない
    const documentWidths = await readDocumentWidths(page);
    if (documentWidths.scrollWidth > documentWidths.clientWidth) {
      violations.push(
        `ページに水平スクロールが出る（scrollWidth ${documentWidths.scrollWidth} / clientWidth ${documentWidths.clientWidth}）`
      );
    }

    expect(
      violations,
      '375 幅でカードの内側からはみ出す・潰れる要素が無く、ページに水平スクロールが出ない'
    ).toEqual([]);
    expect(
      documentWidths.scrollWidth,
      `ページに水平スクロールが出ない（scrollWidth ${documentWidths.scrollWidth} / clientWidth ${documentWidths.clientWidth}）`
    ).toBeLessThanOrEqual(documentWidths.clientWidth);

    // (4) 区切りの無い長い名前は、折り返さない幅がグループ名の領域より広い（長い一語の場合を踏んでいる）
    const unbrokenIndex = NAME_VARIANTS.indexOf(GROUP_NAMES.longUnbroken);
    for (const index of [unbrokenIndex, unbrokenIndex + NAME_VARIANTS.length]) {
      const layout = layouts[index]!;
      expect(
        layout.groupNameNoWrapWidth,
        `前提: グループ${index + 1} の区切りの無い長い名前を折り返さない幅 ${layout.groupNameNoWrapWidth.toFixed(1)} がグループ名の領域の幅 ${layout.parts.groupName!.width.toFixed(1)} より広い`
      ).toBeGreaterThan(layout.parts.groupName!.width);
    }

    // 退行の見張り（REQ-21.2）: 写真ありのカードでは、写真コメントが写真の右側にある
    for (let index = 0; index < NAME_VARIANTS.length; index += 1) {
      const layout = layouts[index]!;
      expect(
        layout.parts.comment!.left,
        `グループ${index + 1} の写真コメント（左端 ${layout.parts.comment!.left.toFixed(1)}）が写真（右端 ${layout.parts.photo!.right.toFixed(1)}）の右側にある`
      ).toBeGreaterThanOrEqual(layout.parts.photo!.right - EPSILON_PX);
    }

    // 退行の見張り（REQ-37 AC 6 / REQ-41）: 数量項目の表は自分のラッパーの中で水平にあふれる
    for (const [index, layout] of layouts.entries()) {
      expect(
        layout.tableScrollWidth,
        `グループ${index + 1} の数量項目の表がラッパーの中で水平にあふれる（scrollWidth ${layout.tableScrollWidth} / clientWidth ${layout.tableClientWidth}）`
      ).toBeGreaterThan(layout.tableClientWidth);
    }
  });

  test('デスクトップ幅では写真の枠が 640×480 のまま、見出しは折り返さず削除の釦がグループ名と同じ行に並ぶ', async ({
    page,
  }) => {
    const cards = await openEditPage(page);

    for (let index = 0; index < NAME_VARIANTS.length; index += 1) {
      const card = cards.nth(index);
      const label = `グループ${index + 1}（写真あり・${NAME_VARIANTS[index]}）`;

      const photoSize = await card.locator('[aria-label="紐付け画像を表示"]').evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: style.width, height: style.height };
      });
      expect(photoSize, `${label} の写真の枠が 640×480 のまま`).toEqual({
        width: '640px',
        height: '480px',
      });

      const headerWrap = await card
        .locator('h3')
        .evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).flexWrap);
      expect(headerWrap, `${label} の見出しは折り返さない`).toBe('nowrap');

      const nameBox = await card.locator('h3').boundingBox();
      const deleteBox = await card.locator('button[aria-label="グループを削除"]').boundingBox();
      assertPrepared(nameBox, `${label} のグループ名の矩形`);
      assertPrepared(deleteBox, `${label} の削除の釦の矩形`);
      expect(
        deleteBox.y < nameBox.y + nameBox.height && deleteBox.y + deleteBox.height > nameBox.y,
        `${label} の削除の釦がグループ名と同じ行に並ぶ（名前 y=${nameBox.y.toFixed(1)}〜${(nameBox.y + nameBox.height).toFixed(1)} / 釦 y=${deleteBox.y.toFixed(1)}〜${(deleteBox.y + deleteBox.height).toFixed(1)}）`
      ).toBe(true);
      expect(deleteBox.x, `${label} の削除の釦がグループ名の右にある`).toBeGreaterThan(nameBox.x);
    }
  });
});
