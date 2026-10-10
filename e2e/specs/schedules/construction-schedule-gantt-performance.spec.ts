/**
 * @fileoverview 工程表のガントチャートの描画性能の E2E 計測（Task 20.4）
 *
 * 200 項目（着工日を 1.5 日ずつずらした各 60 日、日付列は約 1 年分）の工程表をテスト用の DB へ
 * 直接作り、詳細画面で項目の日数を打ち変えて、実ブラウザ（Chromium）の中で測る。時刻はいずれも
 * `performance.now()` と同じ単調時計（Event Timing / Long Animation Frames の startTime と duration）で
 * 取り、WSL2 で遅れる壁時計（Date.now()）は使わない。
 *
 * 打ち変える項目は 2 つ。
 *   - 中ほどの項目（100 番目）: 表示期間を変えない入力
 *   - 最後の項目（200 番目）: 表示期間の末尾を決める項目で、入力ごとに表示期間が変わる
 * どちらも日数 60 を全選択し「4」「5」「Backspace」「7」「Backspace」「2」と 6 回打ち、
 * 4 → 45 → 4 → 47 → 4 → 42 と打鍵ごとにバーの幅が変わることを確かめながら進める。
 * その後、入力欄にフォーカスを保ったまま 3 秒の静止を観測する。
 *
 * 判定（利用者の判断 2026-10-10、tasks.md の 20.4）:
 *   - 要件 6.7: 打鍵ごとに、入力から描画までが 200ms 以内であることを厳密に主張する。
 *     打鍵ごとの値は 2 つの観測で測り、どちらも 200ms 以内であることを求める。
 *       (a) Event Timing の duration（入力の発生から、ハンドラーの処理を経て次の描画が終わるまで）。
 *           打鍵の keydown から次の打鍵の keydown までに始まった event の入力の最大を、その打鍵の値とする。
 *           16ms 未満の event はブラウザが報告しないため、報告が無い打鍵は 16ms 未満である
 *       (b) 入力イベントの timeStamp から、ガントチャートの DOM の変化の後の次のフレームまで
 *           （MutationObserver → requestAnimationFrame → setTimeout）。全打鍵で 1 件ずつ得る
 *   - 要件 12.2: 編集中（最初の打鍵から静止の観測の開始まで）と、フォーカスを保った静止中の
 *     いずれにも、100ms を超えるフレーム（Long Animation Frame の duration）が 0 件であることを主張する。
 *     50ms を超えるフレームの件数は記録（annotation と標準出力）だけにする。
 *     WSL2 の headless と CI の揺れを考え、修正前の 81〜412ms の長いフレームが確実に赤になる閾値として選んだ
 *
 * 観測が生きていること（緑が「測れていない」ことによらないこと）は、各項目の計測の後に、
 * テストが入れる 250ms の busy loop の keydown の打鍵（ArrowRight。数値の入力欄の値は変わらない）を
 * 1 回だけ置き、それが Event Timing には 200ms を超える値として、Long Animation Frame には 100ms を超える
 * 値として現れること（判定の閾値を超える長さを双方の観測が捉えられること）で確かめる。
 * この打鍵は判定の窓（編集中・静止中）の外にある。
 * Event Timing / Long Animation Frame に対応しないブラウザでは、飛ばさずに失敗させる。
 *
 * Playwright のトレース（操作ごとの DOM のスナップショット）と録画は計測するページのメインスレッドで
 * 動き、帰属の無い長いフレームを作るため、このファイルではトレースと録画を止める（Task 21.1 の申し送り）。
 *
 * Requirements coverage (construction-schedule):
 * - REQ-6.7: ガントチャートの入力変更から表示更新までを200ミリ秒以内に完了する
 * - REQ-12.2: 200項目の工程表に対してガントチャートをスムーズに描画する（フレーム落ちなく表示更新）
 *
 * @module e2e/specs/schedules/construction-schedule-gantt-performance
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { getPrismaClient, disconnectDatabase } from '../../fixtures/database';

// Playwright のトレースと録画は計測するページのメインスレッドで動くため、このファイルでは止める
test.use({ trace: 'off', video: 'off' });

/** 工程表の項目数（要件 12.2 の 200 項目） */
const ITEM_COUNT = 200;
/** 日付の列の幅（GanttChartPanel の DAY_CELL_WIDTH）。バーの幅は 日数 × 32px − 2px */
const DAY_CELL_WIDTH = 32;
/** 要件 6.7 の上限（ms） */
const INPUT_TO_PAINT_LIMIT_MS = 200;
/** 要件 12.2 のフレーム落ちとみなすフレームの長さ（ms。利用者の判断 2026-10-10） */
const DROPPED_FRAME_LIMIT_MS = 100;
/** 記録だけにする長いフレームの長さ（ms。Long Animation Frame の定義と同じ 50ms） */
const RECORDED_FRAME_MS = 50;
/** フォーカスを保った静止の観測の長さ（ms） */
const IDLE_OBSERVATION_MS = 3000;
/** 観測が生きていることを確かめる打鍵の busy loop の長さ（ms） */
const CONTROL_BUSY_MS = 250;

/** 全選択した日数 60 へ打つ鍵と、打った後の日数 */
const KEYSTROKES: ReadonlyArray<{ key: string; duration: number }> = [
  { key: '4', duration: 4 },
  { key: '5', duration: 45 },
  { key: 'Backspace', duration: 4 },
  { key: '7', duration: 47 },
  { key: 'Backspace', duration: 4 },
  { key: '2', duration: 42 },
];

let projectId: string;
let scheduleId: string;
let middleItemId: string;
let lastItemId: string;

/** 画面から受け取る生の観測値（判定はすべてテストの側で行う） */
interface RawSession {
  keydownTimes: number[];
  inputToFrameMs: number[];
  events: { name: string; startTime: number; duration: number }[];
  frames: { startTime: number; duration: number }[];
  idleStart: number;
  idleEnd: number;
  controlStart: number;
}

/** 1 項目の計測の結果 */
interface Measurement {
  label: string;
  /** 打鍵ごとの Event Timing の duration の最大（報告が無い打鍵は null = 16ms 未満） */
  eventDurationPerKeystroke: (number | null)[];
  /** 打鍵ごとの、入力からガントチャートの変化の後の次のフレームまで */
  inputToFrameMs: number[];
  /** 編集中のフレーム（Long Animation Frame）の長さ */
  editingFrameMs: number[];
  /** フォーカスを保った静止中のフレームの長さ */
  idleFrameMs: number[];
  /** 判定の窓の外に置いた確認の打鍵の Event Timing の duration の最大 */
  controlEventMs: number;
  /** 判定の窓の外に置いた確認の打鍵のフレームの長さの最大 */
  controlFrameMs: number;
}

/**
 * Event Timing と Long Animation Frame の観測を画面へ入れる。
 * 観測値は window.__ganttPerf へ溜め、打鍵の観測は項目ごとに attach で付け替える。
 */
async function installObservers(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Store = {
      events: { name: string; startTime: number; duration: number }[];
      frames: { startTime: number; duration: number }[];
      keydownTimes: number[];
      inputToFrameMs: number[];
      detach: (() => void) | null;
    };
    const store: Store = {
      events: [],
      frames: [],
      keydownTimes: [],
      inputToFrameMs: [],
      detach: null,
    };
    (window as unknown as { __ganttPerf: Store }).__ganttPerf = store;
    const types = PerformanceObserver.supportedEntryTypes;
    if (types.includes('event')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          store.events.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
    }
    if (types.includes('long-animation-frame')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          store.frames.push({ startTime: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'long-animation-frame' } as PerformanceObserverInit);
    }
  });
}

/** 打ち変える入力欄へ、打鍵の時刻と入力からの次のフレームまでの観測を付ける */
async function attachKeystrokeProbe(page: Page, itemId: string): Promise<void> {
  await page.evaluate((id) => {
    const store = (
      window as unknown as {
        __ganttPerf: {
          events: unknown[];
          frames: unknown[];
          keydownTimes: number[];
          inputToFrameMs: number[];
          detach: (() => void) | null;
        };
      }
    ).__ganttPerf;
    store.detach?.();
    store.events.length = 0;
    store.frames.length = 0;
    store.keydownTimes.length = 0;
    store.inputToFrameMs.length = 0;
    const input = document.querySelector(`[data-testid="duration-${id}"]`) as HTMLInputElement;
    const panel = document.querySelector('[data-testid="gantt-chart-panel"]') as HTMLElement;
    const onKeydown = (event: KeyboardEvent) => {
      store.keydownTimes.push(event.timeStamp);
    };
    const onInput = (event: Event) => {
      const inputAt = event.timeStamp;
      const observer = new MutationObserver(() => {
        observer.disconnect();
        requestAnimationFrame(() =>
          setTimeout(() => store.inputToFrameMs.push(performance.now() - inputAt), 0)
        );
      });
      observer.observe(panel, { attributes: true, childList: true, subtree: true });
    };
    input.addEventListener('keydown', onKeydown, true);
    input.addEventListener('input', onInput, true);
    store.detach = () => {
      input.removeEventListener('keydown', onKeydown, true);
      input.removeEventListener('input', onInput, true);
    };
  }, itemId);
}

/**
 * 1 項目の日数を打ち変え、静止を観測し、観測が生きていることの確認の打鍵を置いて、生の値を受け取る
 */
async function measureEditing(page: Page, itemId: string, label: string): Promise<Measurement> {
  const input = page.getByTestId(`duration-${itemId}`);
  const bar = page.getByTestId(`gantt-bar-${itemId}`);
  await input.click();
  await page.keyboard.press('Control+a');
  await attachKeystrokeProbe(page, itemId);

  for (const [index, stroke] of KEYSTROKES.entries()) {
    await page.keyboard.press(stroke.key);
    await expect(input, `${label}: ${index + 1} 打鍵目の後の日数`).toHaveValue(
      String(stroke.duration)
    );
    await expect(bar, `${label}: ${index + 1} 打鍵目の後のバーの幅`).toHaveCSS(
      'width',
      `${stroke.duration * DAY_CELL_WIDTH - 2}px`
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __ganttPerf: { inputToFrameMs: number[] } }).__ganttPerf
                .inputToFrameMs.length
          ),
        { message: `${label}: ${index + 1} 打鍵目の入力から次のフレームまでを測れた` }
      )
      .toBe(index + 1);
  }

  // フォーカスを保ったまま静止を観測する（観測の窓の長さは画面の単調時計で測る）
  const idleStart = await page.evaluate(() => performance.now());
  await page.evaluate(
    (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    IDLE_OBSERVATION_MS
  );
  const idleEnd = await page.evaluate(() => performance.now());
  await expect(input, `${label}: 静止中も入力欄にフォーカスがある`).toBeFocused();

  // 観測が生きていることの確認: 判定の窓の外で、busy loop の keydown を 1 回だけ置く
  const controlStart = await page.evaluate((busyMs) => {
    const onKeydown = () => {
      const until = performance.now() + busyMs;
      while (performance.now() < until) {
        // busy loop（観測の確認のための意図的な長いフレーム）
      }
    };
    document.addEventListener('keydown', onKeydown, { capture: true, once: true });
    return performance.now();
  }, CONTROL_BUSY_MS);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(
      () =>
        page.evaluate((since) => {
          const store = (
            window as unknown as {
              __ganttPerf: {
                events: { startTime: number }[];
                frames: { startTime: number; duration: number }[];
              };
            }
          ).__ganttPerf;
          return Math.min(
            store.events.filter((e) => e.startTime >= since).length,
            store.frames.filter((f) => f.startTime + f.duration > since).length
          );
        }, controlStart),
      {
        message: `${label}: 確認の打鍵が Event Timing と Long Animation Frame の双方に届いた`,
        timeout: getTimeout(10000),
      }
    )
    .toBeGreaterThan(0);

  const raw: RawSession = await page.evaluate(
    ([start, end, control]) => {
      const store = (
        window as unknown as {
          __ganttPerf: {
            events: { name: string; startTime: number; duration: number }[];
            frames: { startTime: number; duration: number }[];
            keydownTimes: number[];
            inputToFrameMs: number[];
          };
        }
      ).__ganttPerf;
      return {
        keydownTimes: [...store.keydownTimes],
        inputToFrameMs: [...store.inputToFrameMs],
        events: store.events.map((e) => ({ ...e })),
        frames: store.frames.map((f) => ({ ...f })),
        idleStart: start,
        idleEnd: end,
        controlStart: control,
      };
    },
    [idleStart, idleEnd, controlStart] as const
  );

  return summarize(label, raw);
}

/** 生の観測値を打鍵ごと・窓ごとへ振り分ける（判定はしない） */
function summarize(label: string, raw: RawSession): Measurement {
  const strokes = raw.keydownTimes.slice(0, KEYSTROKES.length);
  const eventDurationPerKeystroke = strokes.map((start, index) => {
    const end = strokes[index + 1] ?? raw.idleStart;
    const durations = raw.events
      .filter((e) => e.startTime >= start && e.startTime < end)
      .map((e) => e.duration);
    return durations.length > 0 ? Math.max(...durations) : null;
  });
  const editingStart = strokes[0] ?? raw.idleStart;
  const frameEnd = (f: { startTime: number; duration: number }) => f.startTime + f.duration;
  const editingFrameMs = raw.frames
    .filter((f) => frameEnd(f) > editingStart && f.startTime < raw.idleStart)
    .map((f) => f.duration);
  const idleFrameMs = raw.frames
    .filter((f) => frameEnd(f) > raw.idleStart && f.startTime < raw.idleEnd)
    .map((f) => f.duration);
  const controlEvents = raw.events.filter((e) => e.startTime >= raw.controlStart);
  const controlFrames = raw.frames.filter((f) => frameEnd(f) > raw.controlStart);
  return {
    label,
    eventDurationPerKeystroke,
    inputToFrameMs: raw.inputToFrameMs.map((ms) => Math.round(ms)),
    editingFrameMs: editingFrameMs.map((ms) => Math.round(ms)),
    idleFrameMs: idleFrameMs.map((ms) => Math.round(ms)),
    controlEventMs: Math.max(0, ...controlEvents.map((e) => e.duration)),
    controlFrameMs: Math.round(Math.max(0, ...controlFrames.map((f) => f.duration))),
  };
}

/** 詳細画面を開き、200 項目のバーが揃うまで待ってから、中ほどと最後の項目を順に測る */
async function measureBothItems(page: Page): Promise<Measurement[]> {
  await loginAsUser(page, 'REGULAR_USER');
  await page.goto(`/schedules/${scheduleId}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId(/^gantt-bar-/)).toHaveCount(ITEM_COUNT, {
    timeout: getTimeout(30000),
  });
  const supported = await page.evaluate(() => [...window.PerformanceObserver.supportedEntryTypes]);
  // 対応しないブラウザでは飛ばさずに失敗させる（計測できないまま緑にしない）
  expect(
    supported,
    'このブラウザは Event Timing（event）と Long Animation Frame（long-animation-frame）の観測に対応していなければならない（Chromium で実行すること）'
  ).toEqual(expect.arrayContaining(['event', 'long-animation-frame']));
  await installObservers(page);

  const results: Measurement[] = [];
  results.push(await measureEditing(page, middleItemId, '中ほどの項目（100 番目）'));
  results.push(await measureEditing(page, lastItemId, '最後の項目（200 番目、表示期間が変わる）'));
  for (const result of results) {
    console.log(`[gantt-performance] ${JSON.stringify(result)}`);
  }
  return results;
}

/**
 * 観測が生きていたことを主張する。確認の打鍵（250ms の busy loop）が、それぞれの判定の閾値を
 * 超える値として両方の観測に現れれば、判定の窓の中の違反も同じ観測で捉えられる。
 * （Event Timing の duration は 8ms 単位に丸められるため、busy loop の長さそのものとは比べない）
 */
function expectObserversAlive(result: Measurement): void {
  expect(
    result.controlEventMs,
    `${result.label}: 確認の打鍵（${CONTROL_BUSY_MS}ms の busy loop）を Event Timing が ${INPUT_TO_PAINT_LIMIT_MS}ms を超える値として捉えている`
  ).toBeGreaterThan(INPUT_TO_PAINT_LIMIT_MS);
  expect(
    result.controlFrameMs,
    `${result.label}: 確認の打鍵（${CONTROL_BUSY_MS}ms の busy loop）を Long Animation Frame が ${DROPPED_FRAME_LIMIT_MS}ms を超える値として捉えている`
  ).toBeGreaterThan(DROPPED_FRAME_LIMIT_MS);
}

test.describe('工程表のガントチャートの描画性能（200 項目）', () => {
  test.beforeAll(async () => {
    const prisma = getPrismaClient();

    // userロールに schedule の権限を割り当てる（construction-schedule-e2e.spec.ts と同じ形）
    await prisma.permission.createMany({
      data: ['create', 'read', 'update', 'delete'].map((action) => ({
        resource: 'schedule',
        action,
        description: `工程表の${action}`,
      })),
      skipDuplicates: true,
    });
    const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
    const testUser = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
    if (!userRole || !testUser) {
      throw new Error(
        'userロールまたはテストユーザーが見つかりません。global-setupを確認してください。'
      );
    }
    const permissions = await prisma.permission.findMany({
      where: { resource: 'schedule', action: { in: ['create', 'read', 'update', 'delete'] } },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: userRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    const project = await prisma.project.create({
      data: {
        name: 'ガントチャート性能E2Eテスト用プロジェクト',
        status: 'PREPARING',
        salesPersonId: testUser.id,
        createdById: testUser.id,
      },
    });
    projectId = project.id;
    const schedule = await prisma.constructionSchedule.create({
      data: { projectId, name: '200項目の描画性能', version: 0 },
    });
    scheduleId = schedule.id;

    // Task 18.3 と同じ形: 着工日を 1.5 日ずつずらした各 60 日（200 項目で日付列は約 1 年分）
    const base = Date.UTC(2026, 3, 1);
    await prisma.scheduleItem.createMany({
      data: Array.from({ length: ITEM_COUNT }, (_, index) => ({
        scheduleId,
        sourceType: 'MANUAL',
        itemName: `性能項目${String(index + 1).padStart(3, '0')}`,
        startDate: new Date(base + Math.floor(index * 1.5) * 86400000),
        duration: 60,
        displayOrder: index,
      })),
    });
    const items = await prisma.scheduleItem.findMany({
      where: { scheduleId },
      orderBy: { displayOrder: 'asc' },
    });
    const middleItem = items[ITEM_COUNT / 2 - 1];
    const lastItem = items[ITEM_COUNT - 1];
    if (items.length !== ITEM_COUNT || !middleItem || !lastItem) {
      throw new Error(`前提: 200 項目の工程表ができていない（${items.length} 件）`);
    }
    middleItemId = middleItem.id;
    lastItemId = lastItem.id;
  });

  test.afterAll(async () => {
    const prisma = getPrismaClient();
    if (projectId) {
      await prisma.constructionSchedule.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    await disconnectDatabase();
  });

  /**
   * @requirement construction-schedule/REQ-6.7
   */
  test('200項目の工程表で日数を打ち変えると、打鍵ごとに入力から描画までが200ms以内である (construction-schedule/REQ-6.7)', async ({
    page,
  }) => {
    const results = await measureBothItems(page);

    for (const result of results) {
      expectObserversAlive(result);
      expect(
        result.eventDurationPerKeystroke,
        `${result.label}: 打鍵の数だけ Event Timing の窓がある`
      ).toHaveLength(KEYSTROKES.length);
      expect(
        result.inputToFrameMs,
        `${result.label}: 打鍵の数だけ入力から次のフレームまでを測った`
      ).toHaveLength(KEYSTROKES.length);
      for (const [index, duration] of result.eventDurationPerKeystroke.entries()) {
        // null はブラウザが 16ms 未満として報告しなかった打鍵
        expect(
          duration ?? 0,
          `REQ-6.7: ${result.label} の ${index + 1} 打鍵目の入力から描画まで（Event Timing）が ${INPUT_TO_PAINT_LIMIT_MS}ms 以内`
        ).toBeLessThanOrEqual(INPUT_TO_PAINT_LIMIT_MS);
      }
      for (const [index, ms] of result.inputToFrameMs.entries()) {
        expect(
          ms,
          `REQ-6.7: ${result.label} の ${index + 1} 打鍵目の入力からガントチャートの変化の後の次のフレームまでが ${INPUT_TO_PAINT_LIMIT_MS}ms 以内`
        ).toBeLessThanOrEqual(INPUT_TO_PAINT_LIMIT_MS);
      }
    }
  });

  /**
   * @requirement construction-schedule/REQ-12.2
   */
  test('200項目の工程表の編集中とフォーカスを保った静止中に、100msを超えるフレームが無い (construction-schedule/REQ-12.2)', async ({
    page,
  }) => {
    const results = await measureBothItems(page);

    for (const result of results) {
      expectObserversAlive(result);
      // 50ms を超えるフレームの件数は記録だけにする（利用者の判断 2026-10-10）
      const over50Editing = result.editingFrameMs.filter((ms) => ms > RECORDED_FRAME_MS);
      const over50Idle = result.idleFrameMs.filter((ms) => ms > RECORDED_FRAME_MS);
      test.info().annotations.push({
        type: 'frames-over-50ms',
        description: `${result.label}: 編集中 ${over50Editing.length} 件 [${over50Editing.join(', ')}] / 静止中 ${over50Idle.length} 件 [${over50Idle.join(', ')}]`,
      });
      expect(
        result.editingFrameMs.filter((ms) => ms > DROPPED_FRAME_LIMIT_MS),
        `REQ-12.2: ${result.label} の編集中に ${DROPPED_FRAME_LIMIT_MS}ms を超えるフレームが無い`
      ).toEqual([]);
      expect(
        result.idleFrameMs.filter((ms) => ms > DROPPED_FRAME_LIMIT_MS),
        `REQ-12.2: ${result.label} のフォーカスを保った静止中に ${DROPPED_FRAME_LIMIT_MS}ms を超えるフレームが無い`
      ).toEqual([]);
    }
  });
});
