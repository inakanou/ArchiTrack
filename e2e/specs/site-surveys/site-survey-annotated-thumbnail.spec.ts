/**
 * @fileoverview 注釈付きサムネイル・プレビュー表示のE2Eテスト
 *
 * Task 55.3: E2Eテストで注釈付き表示の動作を検証する
 * Task 115.58: 前提条件による自動無効化と、条件で包まれた判定を撤去する
 *
 * Requirements:
 * - 20.1: 画像プレビュー画面（閲覧モード）で保存済みの注釈をレンダリングした状態で画像を表示する
 * - 20.2: 現場調査詳細画面で各画像のサムネイルに保存済みの注釈をレンダリングした状態で表示する
 * - 20.3: 現場調査一覧画面で代表画像のサムネイルに保存済みの注釈をレンダリングした状態で表示する
 * - 20.4: 注釈が編集モードで保存されると、注釈をレンダリングしたサムネイル画像を生成・更新する
 *
 * ## Task 115.58（AI運用7原則 第3原則）
 *
 * 本ファイルは以前、現場調査の識別子（`createdSurveyId`）の有無で `test.skip` する構成
 * だった。当該の識別子は `const` の空値として宣言され一度も代入されないため、条件付きの
 * 体裁を取りながら実態は無条件の永久スキップだった。さらに本体の判定は
 * `if (await x.isVisible())` で包まれており、仮に実行されても要素が無ければ素通りで
 * 合格した（参照していた `annotation-editor` / `tool-rect` は本番に存在しない）。
 *
 * 前提となるプロジェクト・現場調査・画像は検証の中で用意する。用意できない場合は
 * 飛ばさずに失敗させる。判定は条件で包まず無条件に主張する。
 *
 * ## 何をもって「注釈がレンダリングされている」と判定するか
 *
 * - **プレビュー画面（20.1）**: 閲覧モードの注釈エディタが公開する `window.__fabricCanvas`
 *   のオブジェクト集合を読む。保存前は0件、保存後は1件（type=arrow）であることを、
 *   同一の観測手段で前後に主張する。前提が壊れれば0件のまま失敗する。
 * - **サムネイル（20.2 / 20.3 / 20.4）**: 表示元の**画素**に既定の注釈色
 *   （`annotation-style-tokens.ts` の `#e53935`）が現れることで判定する。素材は赤成分を
 *   持たない単色画像を生成して用いるため、注釈が焼き込まれない限りこの色は現れない。
 *   表示元がサーバー生成の合成済みサムネイルであってもクライアント合成であっても、
 *   同じ判定が成立する（どちらの経路でも要件は「注釈が見えること」を要求する）。
 *
 * 素材を正方形にするのは、サムネイル生成が cover 縮小（中央切り抜き）であるため。
 * 縦横比が異なると注釈の位置が切り抜きで失われ、判定が素材の縦横比に依存してしまう。
 *
 * ## Task 115.68（空振りの判定の実効化と、沈黙する前提準備の解消）
 *
 * - 「保存前に合成済みサムネイル（`data-testid="annotated-thumbnail"`）が現れない」ことの
 *   判定は、115.67 以前は**供給側が表示元URLをそもそも返さないため恒久的に成立**していた。
 *   条件で包まれてもおらず恒真式でもないのに、外部の欠落によって壊しても落ちない判定
 *   だった。115.67 で供給が入ったため、本タスクで変異により実効性を実測した。
 *   一覧取得の応答が合成済みサムネイルの保存位置を持たないときに通常サムネイルの
 *   表示元URLで代替する変異（画像は正しく表示され、表示元の由来を比べる判定も
 *   通り続ける）を入れると、当該の判定だけが `Expected: 0 / Received: 1` で落ちた。
 * - 前提準備のうち営業担当者の選択は、選択肢が無い場合に何もせず素通りしていた。
 *   選択肢の供給と選択の成立を明示的に主張する形へ改めた。
 */

import zlib from 'zlib';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { loginAsUser } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { API_BASE_URL } from '../../config';

// ============================================================================
// 定数
// ============================================================================

/** 素材画像の一辺（px）。正方形にして cover 縮小での切り抜きを生じさせない */
const SOURCE_IMAGE_SIZE = 400;

/** 素材の色。赤成分を持たないため、注釈色の検出と混同しない */
const SOURCE_COLOR = { r: 0, g: 0, b: 255 } as const;

/** 登録する画像のファイル名（表示元の特定に用いる） */
const IMAGE_FILE_NAME = 'req20-annotated-thumbnail.png';

/**
 * 注釈画素の判定条件
 *
 * 既定の注釈色 `#e53935`（229, 57, 53）を、JPEG 再圧縮による劣化を見込んで
 * 「赤が十分に強く、緑・青より明確に大きい」という条件で数える。
 * 素材は青一色で赤成分を持たないため、該当する画素は注釈由来に限られる。
 */
const ANNOTATION_PIXEL_RULE = { minRed: 110, minRedOverGreen: 60, minRedOverBlue: 60 } as const;

/**
 * 注釈が反映されたとみなす最小画素数
 *
 * 素材 400px 幅の矢印は 200px サムネイルへ縮小されるため線が細る。1本の矢印で
 * 数十画素規模になることを見込み、偶発的な単発画素では成立しない下限を置く。
 */
const MIN_ANNOTATION_PIXELS = 10;

/** 合成済みサムネイルが置かれる区画（Task 115.1） */
const ANNOTATED_THUMBNAIL_PREFIX = 'annotated-thumbnails/';

/** 詳細画面が画像一覧を受け取る唯一の経路 */
const surveyDetailPath = (surveyId: string): string => `/api/site-surveys/${surveyId}`;

// ============================================================================
// 型
// ============================================================================

/** `GET /api/site-surveys/:id` が返す画像要素のうち本テストが用いる項目 */
interface DetailImage {
  id: string;
  fileName: string;
  width: number;
  height: number;
  thumbnailPath: string;
  thumbnailUrl: string | null;
  annotatedThumbnailPath: string | null;
  annotatedThumbnailUrl: string | null;
}

/** 閲覧モード／編集モードの注釈エディタの状態 */
interface EditorCanvasState {
  hasCanvas: boolean;
  /** 注釈オブジェクトの type 一覧（背景画像は含まれない） */
  objectTypes: string[];
  /** 背景画像の回転角度。未読込は null */
  backgroundAngle: number | null;
}

// ============================================================================
// 素材画像の生成
// ============================================================================

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
};

/**
 * 単色の正方形 PNG を生成する
 *
 * 判定に必要な「赤成分を持たない素材」を用意するために生成する。画像処理系の依存を
 * 追加せずに済ませるため、Node 標準の zlib のみで PNG（8bit truecolor・フィルタなし）を
 * 組み立てる。
 *
 * @param size - 一辺の長さ（px）
 * @returns PNG のバイト列
 */
function createSolidPng(size: number): Buffer {
  // 各走査線は先頭にフィルタ種別（0 = None）を持つ
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      raw[offset++] = SOURCE_COLOR.r;
      raw[offset++] = SOURCE_COLOR.g;
      raw[offset++] = SOURCE_COLOR.b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============================================================================
// 画素解析
// ============================================================================

/**
 * 表示元の画素のうち注釈色に該当する数を数える
 *
 * `src` はストレージの署名付きURL（サーバー生成の合成済みサムネイル・通常サムネイル）と
 * データURL（クライアント合成の結果）の双方を取り得る。どちらであっても同じ判定へ
 * 収束させるため、種別で分岐せずブラウザの `fetch` で実体を取り出す（`fetch` は
 * `data:` と `http:` を同じ手順で扱える）。取り出したバイト列から作った
 * `ImageBitmap` はキャンバスを汚染しないため画素を読み出せる。
 *
 * 取得に失敗した場合は例外となり、その場で失敗する（無言で0件を返さない）。
 *
 * @param page - 復号に用いるページ
 * @param src - 表示元のURL
 */
async function countAnnotationPixels(page: Page, src: string): Promise<number> {
  return page.evaluate(
    async ({ url, rule }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`表示元の実体を取得できません: ${response.status} ${url}`);
      }
      const bitmap = await createImageBitmap(await response.blob());

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('2D描画コンテキストを取得できません');
      }
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

      let annotationPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        if (r >= rule.minRed && r - g >= rule.minRedOverGreen && r - b >= rule.minRedOverBlue) {
          annotationPixels++;
        }
      }
      return annotationPixels;
    },
    { url: src, rule: { ...ANNOTATION_PIXEL_RULE } }
  );
}

// ============================================================================
// テスト
// ============================================================================

/**
 * @requirement site-survey/REQ-20.1
 * @requirement site-survey/REQ-20.2
 * @requirement site-survey/REQ-20.3
 * @requirement site-survey/REQ-20.4
 */
test.describe('注釈付きサムネイル・プレビュー表示', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedContext: BrowserContext;
  let sharedPage: Page;
  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  let surveyName = '';
  /** 事前準備の直後に詳細取得経路から読んだ画像（注釈保存前の起点） */
  let baselineImage: DetailImage | null = null;
  /** 注釈保存で生成された合成済みサムネイルのキー */
  let savedAnnotatedThumbnailPath: string | null = null;

  /** ログイン済みページの認証ヘッダを組み立てる */
  async function getAuthHeaders(page: Page): Promise<Record<string, string>> {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken, 'アクセストークンが取得できる').toBeTruthy();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /** 詳細画面が実際に用いる取得経路から対象画像を読む */
  async function fetchDetailImage(): Promise<DetailImage> {
    const response = await sharedPage.request.get(
      `${API_BASE_URL}${surveyDetailPath(createdSurveyId!)}`,
      { headers: await getAuthHeaders(sharedPage) }
    );
    expect(response.ok(), '現場調査詳細の取得が成功する').toBeTruthy();
    const images = ((await response.json()) as { images: DetailImage[] }).images;
    const image = images.find((candidate) => candidate.fileName === IMAGE_FILE_NAME);
    if (!image) {
      throw new Error(`前提状態の画像が見つかりません: ${IMAGE_FILE_NAME}`);
    }
    return image;
  }

  /**
   * 注釈エディタの状態を読む
   *
   * 画像編集画面・プレビュー画面はキャンバスを `window.__fabricCanvas` として公開する
   * （閲覧モードでも公開される）。背景画像は `backgroundImage` に置かれ `getObjects()` には
   * 現れないため、注釈の集合と背景画像の読込状態を分けて読む。
   */
  function getEditorCanvasState(page: Page): Promise<EditorCanvasState> {
    return page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects: () => Array<{ type?: string }>;
            backgroundImage?: { angle?: number } | null;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        return { hasCanvas: false, objectTypes: [], backgroundAngle: null };
      }
      const background = canvas.backgroundImage;
      return {
        hasCanvas: true,
        objectTypes: canvas.getObjects().map((object) => object.type ?? 'unknown'),
        backgroundAngle: background ? Number(background.angle ?? 0) : null,
      };
    });
  }

  /**
   * プレビュー画面（閲覧モード）を開き、背景画像の読込まで待つ
   *
   * 画像ビューアは既定で閲覧モード（`readOnly`）であり、そこに表示される注釈が
   * Requirement 20.1 の対象である。
   */
  async function openPreview(): Promise<void> {
    await sharedPage.goto(`/site-surveys/${createdSurveyId}/images/${baselineImage!.id}`);
    await sharedPage.waitForLoadState('networkidle');

    // 閲覧モードであること（編集モードへ入っていないこと）
    const editModeButton = sharedPage.getByRole('button', { name: '編集モード', exact: true });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await expect(editModeButton).toHaveAttribute('aria-pressed', 'false');

    await expect(sharedPage.getByTestId('annotation-editor-container')).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 背景画像の読込前に判定すると、注釈の復元も未了のまま「0件」を読みうる
    await expect
      .poll(async () => (await getEditorCanvasState(sharedPage)).backgroundAngle !== null, {
        timeout: getTimeout(20000),
        message: 'プレビュー画面のキャンバスに背景画像が読み込まれていない',
      })
      .toBe(true);
  }

  /** プレビュー画面から編集モードへ入り、注釈ツールバーの表示を待つ */
  async function enterEditMode(): Promise<void> {
    await openPreview();
    await sharedPage.getByRole('button', { name: '編集モード', exact: true }).click();
    await expect(sharedPage.getByTestId('annotation-toolbar')).toBeVisible({
      timeout: getTimeout(15000),
    });
  }

  /** 編集キャンバスの中心座標を取得する */
  async function getCanvasCenter(): Promise<{ x: number; y: number }> {
    const upperCanvas = sharedPage.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(15000) });

    await expect
      .poll(
        async () => {
          const box = await upperCanvas.boundingBox();
          return box !== null && box.width > 10 && box.height > 10;
        },
        { timeout: getTimeout(15000), message: '編集キャンバスの領域が確保されていない' }
      )
      .toBe(true);

    const box = await upperCanvas.boundingBox();
    if (!box) {
      throw new Error('編集キャンバスの領域が取得できません');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** 矢印注釈を1本描く */
  async function drawArrow(): Promise<void> {
    const arrowTool = sharedPage.getByRole('button', { name: '矢印', exact: true });
    await expect(arrowTool).toBeVisible({ timeout: getTimeout(10000) });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    const center = await getCanvasCenter();
    const before = await getEditorCanvasState(sharedPage);
    expect(before.hasCanvas, '編集キャンバスが公開されている').toBe(true);
    expect(before.backgroundAngle, '編集キャンバスに背景画像が読み込まれている').not.toBeNull();

    await sharedPage.mouse.move(center.x - 100, center.y);
    await sharedPage.mouse.down();
    await sharedPage.mouse.move(center.x + 100, center.y, { steps: 10 });
    await sharedPage.mouse.up();

    // 描画が実際に注釈を生成したことを確認してから保存する。生成されていない状態で
    // 保存すると「注釈なし」として扱われ、検証対象の前提が崩れる（Task 115.3）
    await expect
      .poll(async () => (await getEditorCanvasState(sharedPage)).objectTypes.length, {
        timeout: getTimeout(10000),
        message: '矢印の描画で注釈オブジェクトが生成されていない',
      })
      .toBe(before.objectTypes.length + 1);
  }

  /**
   * 画像編集画面で保存し、合成済みサムネイルの更新完了まで確認する
   *
   * 保存は注釈の保存（PUT）と合成済みサムネイルの更新（PATCH）の2段で構成される。
   * Requirement 20.4 が求める「注釈をレンダリングしたサムネイル画像の生成・更新」は
   * 後者にあたるため、双方の応答を確認する。
   *
   * @returns 更新後の合成済みサムネイルのキー
   */
  async function saveInEditor(imageId: string): Promise<string> {
    const annotationSaved = sharedPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/site-surveys/images/${imageId}/annotations` &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const thumbnailUpdated = sharedPage.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/site-surveys/images/${imageId}/annotated-thumbnail` &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );

    await sharedPage.getByRole('button', { name: '保存', exact: true }).click();

    const annotationResponse = await annotationSaved;
    expect(annotationResponse.ok(), '注釈の保存が成功する').toBeTruthy();

    const thumbnailResponse = await thumbnailUpdated;
    expect(
      thumbnailResponse.ok(),
      '注釈をレンダリングしたサムネイルの生成・更新が成功する（REQ-20.4）'
    ).toBeTruthy();

    await expect(sharedPage.getByText(/保存しました/i)).toBeVisible({ timeout: getTimeout(15000) });

    const body = (await thumbnailResponse.json()) as { annotatedThumbnailPath: string };
    return body.annotatedThumbnailPath;
  }

  /**
   * 現場調査一覧画面を開き、対象の代表画像サムネイルの表示元URLを返す
   *
   * 一覧画面は代表画像に対しサーバー生成の合成済みサムネイル（`annotated-thumbnail`）と
   * クライアント合成のいずれかを用いる。どちらであっても表示元URLを同じ手順で取り出し、
   * 画素で判定する。
   */
  async function readListThumbnailSrc(): Promise<string> {
    const thumbnail = sharedPage.locator('img[alt^="' + surveyName + 'のサムネイル"]').first();
    await expect(thumbnail).toBeVisible({ timeout: getTimeout(20000) });
    await thumbnail.scrollIntoViewIfNeeded();

    await expect
      .poll(async () => (await thumbnail.getAttribute('src')) ?? '', {
        timeout: getTimeout(20000),
        message: '一覧画面の代表画像サムネイルに表示元URLが設定されない',
      })
      .not.toBe('');

    return (await thumbnail.getAttribute('src')) ?? '';
  }

  /** 現場調査一覧画面へ遷移し、対象の現場調査が表示されるまで待つ */
  async function openSurveyList(): Promise<void> {
    await sharedPage.goto(`/projects/${createdProjectId}/site-surveys`);
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByText(surveyName).first()).toBeVisible({
      timeout: getTimeout(20000),
    });
  }

  /**
   * 事前準備: プロジェクト・現場調査・画像を作成する
   *
   * 前提が整わない場合はここで失敗させる。飛ばして「合格」にしない（第3原則）。
   */
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    await loginAsUser(sharedPage, 'REGULAR_USER');

    // --- プロジェクト作成（営業担当者の既定値は画面が解決するため画面から作る） ---
    await sharedPage.goto('/projects');
    await sharedPage.waitForLoadState('networkidle');

    await sharedPage.getByRole('button', { name: /新規作成/i }).click();
    await expect(sharedPage).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
    await expect(sharedPage.getByText(/読み込み中/i).first()).not.toBeVisible({
      timeout: getTimeout(15000),
    });

    await sharedPage
      .getByRole('textbox', { name: /プロジェクト名/i })
      .fill(`注釈サムネイルテスト_${Date.now()}`);

    // 営業担当者は必須項目である。選択肢が供給されない場合はここで失敗させる（Task 115.68）。
    // 以前は「選択肢が無ければ何もしない」構成で、前提が崩れると作成ボタンの押下が
    // 通らない形で後段が失敗し、前提の崩れか対象の欠陥かを判別できなかった。
    const salesPersonSelect = sharedPage.locator('select[aria-label="営業担当者"]');
    await expect(salesPersonSelect, '営業担当者の選択欄が表示される').toBeVisible({
      timeout: getTimeout(15000),
    });

    // 先頭は未選択のプレースホルダ（value=""）であり、実在の担当者は2件目以降に現れる。
    // 候補は非同期に読み込まれるため、供給されるまで待って明示的に主張する
    await expect
      .poll(() => salesPersonSelect.locator('option').count(), {
        timeout: getTimeout(15000),
        message: '営業担当者の選択肢が供給されない',
      })
      .toBeGreaterThan(1);

    const salesPersonValue = await salesPersonSelect.locator('option').nth(1).getAttribute('value');
    expect(salesPersonValue, '営業担当者の選択肢が実在の担当者を指す').toBeTruthy();

    // 既定値が解決済みであっても選択肢から選び直し、前提の成立を観測可能にする
    await salesPersonSelect.selectOption(salesPersonValue!);
    await expect(salesPersonSelect, '営業担当者が選択されている').toHaveValue(salesPersonValue!);

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
    expect(createdProjectId, 'プロジェクトが作成されている').toBeTruthy();

    const authHeaders = await getAuthHeaders(sharedPage);

    // --- 現場調査作成 ---
    surveyName = `注釈サムネイル検証用現場調査_${Date.now()}`;
    const surveyResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/projects/${createdProjectId}/site-surveys`,
      {
        headers: authHeaders,
        data: { name: surveyName, surveyDate: new Date().toISOString().split('T')[0]! },
      }
    );
    expect(surveyResponse.ok(), '現場調査の作成が成功する').toBeTruthy();
    createdSurveyId = ((await surveyResponse.json()) as { id: string }).id;
    expect(createdSurveyId, '現場調査が作成されている').toBeTruthy();

    // --- 画像を1枚登録する（一覧画面の代表画像を一意にするため1枚に限る） ---
    const uploadResponse = await sharedPage.request.post(
      `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
      {
        headers: authHeaders,
        multipart: {
          images: {
            name: IMAGE_FILE_NAME,
            mimeType: 'image/png',
            buffer: createSolidPng(SOURCE_IMAGE_SIZE),
          },
        },
      }
    );
    expect(uploadResponse.ok(), '画像の登録が成功する').toBeTruthy();

    baselineImage = await fetchDetailImage();
    expect(baselineImage.width).toBeGreaterThan(0);
    expect(baselineImage.height).toBeGreaterThan(0);
    expect(baselineImage.thumbnailPath, '通常サムネイルが生成されている').toBeTruthy();
    expect(
      baselineImage.annotatedThumbnailPath,
      '保存前は合成済みサムネイルを持たない（変化の起点）'
    ).toBeNull();

    // 素材に注釈色が含まれていないこと。これが成立して初めて
    // 「注釈色の画素が現れた＝注釈が焼き込まれた」と言える
    expect(baselineImage.thumbnailUrl, '通常サムネイルの表示元URLが供給される').toBeTruthy();
    const baselinePixels = await countAnnotationPixels(sharedPage, baselineImage.thumbnailUrl!);
    console.log(`[REQ-20] 素材の通常サムネイルの注釈色画素数=${baselinePixels}`);
    expect(baselinePixels, '素材には注釈色の画素が無い').toBe(0);
  });

  test.afterAll(async ({ browser }) => {
    // 後始末: 作成したデータを ADMIN 権限の API 呼び出しで削除する
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
    } finally {
      await cleanupPage.close();
      await cleanupContext.close();
      await sharedContext?.close();
    }
  });

  /**
   * (a) 注釈が無い画像は素のサムネイルが表示される
   *
   * Requirement 20.3 / 20.4 の起点。以降の判定（注釈色の画素が現れる）が
   * 初期状態から成立していたのではないことを、同じ観測手段で先に示す。
   *
   * @requirement site-survey/REQ-20.3
   * @requirement site-survey/REQ-20.4
   */
  test('注釈が存在しない画像は素のサムネイルが表示されること (site-survey/REQ-20.3, site-survey/REQ-20.4)', async () => {
    await openSurveyList();

    // 合成済みサムネイル（サーバー生成）はまだ存在しない
    await expect(sharedPage.locator('[data-testid="annotated-thumbnail"]')).toHaveCount(0);

    const src = await readListThumbnailSrc();
    console.log(`[REQ-20] 注釈保存前の一覧サムネイルの表示元: ${src.slice(0, 120)}`);

    // 表示元は通常サムネイルそのもの（合成結果ではない）
    expect(src.startsWith('data:'), '注釈が無い画像で合成結果が表示されている').toBe(false);
    expect(new URL(src).pathname).toContain(baselineImage!.thumbnailPath);

    // 素のサムネイルであること（注釈色の画素が無い）
    expect(await countAnnotationPixels(sharedPage, src)).toBe(0);
  });

  /**
   * (b) 注釈が無い時点のプレビュー画面
   *
   * Requirement 20.1 の起点。プレビュー画面（閲覧モード）が注釈エディタを表示し、
   * かつこの時点では注釈を1件も描いていないことを、(c) と同じ観測手段で示す。
   *
   * @requirement site-survey/REQ-20.1
   */
  test('プレビュー画面（閲覧モード）が注釈エディタを表示し、注釈保存前は注釈を描かないこと (site-survey/REQ-20.1)', async () => {
    await openPreview();

    const state = await getEditorCanvasState(sharedPage);
    expect(state.hasCanvas, 'プレビュー画面のキャンバスが公開されている').toBe(true);
    expect(state.objectTypes, '注釈保存前のプレビューには注釈が存在しない').toEqual([]);
  });

  /**
   * (c) 編集モードで注釈を保存すると、注釈をレンダリングしたサムネイルが生成される
   *
   * @requirement site-survey/REQ-20.4
   */
  test('編集モードで注釈を保存すると注釈をレンダリングしたサムネイルが生成されること (site-survey/REQ-20.4)', async () => {
    await enterEditMode();
    await drawArrow();
    savedAnnotatedThumbnailPath = await saveInEditor(baselineImage!.id);

    // 生成された合成済みサムネイルが、詳細取得の応答に現れる
    const image = await fetchDetailImage();
    expect(image.annotatedThumbnailPath, '合成済みサムネイルの保存先が応答に現れる').toBe(
      savedAnnotatedThumbnailPath
    );
    expect(image.annotatedThumbnailPath!.startsWith(ANNOTATED_THUMBNAIL_PREFIX)).toBe(true);
    expect(image.annotatedThumbnailUrl, '合成済みサムネイルの表示元URLが現れる').toBeTruthy();

    // 通常サムネイルは保存操作で書き換わらない（Task 115.1）
    expect(image.thumbnailPath).toBe(baselineImage!.thumbnailPath);

    // 生成物に注釈が実際に焼き込まれている（キーの変化だけでは判別能力が無い）
    const annotationPixels = await countAnnotationPixels(sharedPage, image.annotatedThumbnailUrl!);
    console.log(
      `[REQ-20] 合成済みサムネイル: key=${image.annotatedThumbnailPath} 注釈色画素数=${annotationPixels}`
    );
    expect(annotationPixels, '合成済みサムネイルに注釈色の画素が現れる').toBeGreaterThanOrEqual(
      MIN_ANNOTATION_PIXELS
    );
  });

  /**
   * (d) 保存した注釈がプレビュー画面（閲覧モード）に表示される
   *
   * @requirement site-survey/REQ-20.1
   */
  test('注釈保存後にプレビュー画面で注釈が表示されること (site-survey/REQ-20.1)', async () => {
    await openPreview();

    // (b) と同一の観測手段。保存前は0件、保存後は矢印1件になる
    await expect
      .poll(async () => (await getEditorCanvasState(sharedPage)).objectTypes, {
        timeout: getTimeout(20000),
        message: 'プレビュー画面（閲覧モード）に保存済みの注釈が復元されていない',
      })
      .toEqual(['arrow']);

    // 閲覧モードのまま表示されていること（編集モードへ入って初めて見える、ではない）
    await expect(
      sharedPage.getByRole('button', { name: '編集モード', exact: true })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  /**
   * (e) 保存した注釈が詳細画面・一覧画面のサムネイルに反映される
   *
   * @requirement site-survey/REQ-20.2
   * @requirement site-survey/REQ-20.3
   */
  test('注釈保存後に詳細画面と一覧画面のサムネイルへ注釈が反映されること (site-survey/REQ-20.2, site-survey/REQ-20.3)', async () => {
    // --- 詳細画面（REQ-20.2） ---
    await sharedPage.goto(`/site-surveys/${createdSurveyId}`);
    await sharedPage.waitForLoadState('networkidle');

    const detailThumbnail = sharedPage.getByAltText(IMAGE_FILE_NAME);
    await expect(detailThumbnail).toBeVisible({ timeout: getTimeout(20000) });
    // 詳細画面の写真は表示領域へ入るまで表示元URLを設定しない（REQ-38.8 の遅延読み込み）
    await detailThumbnail.scrollIntoViewIfNeeded();

    await expect
      .poll(async () => (await detailThumbnail.getAttribute('src')) ?? '', {
        timeout: getTimeout(20000),
        message: '詳細画面のサムネイルに表示元URLが設定されない',
      })
      .not.toBe('');

    const detailSrc = (await detailThumbnail.getAttribute('src')) ?? '';
    const detailPixels = await countAnnotationPixels(sharedPage, detailSrc);
    console.log(
      `[REQ-20] 詳細画面のサムネイル: 表示元=${detailSrc.slice(0, 120)} 注釈色画素数=${detailPixels}`
    );
    expect(detailPixels, '詳細画面のサムネイルに注釈が反映されている').toBeGreaterThanOrEqual(
      MIN_ANNOTATION_PIXELS
    );

    // --- 一覧画面（REQ-20.3） ---
    await openSurveyList();

    await expect
      .poll(async () => countAnnotationPixels(sharedPage, await readListThumbnailSrc()), {
        timeout: getTimeout(30000),
        message: '一覧画面の代表画像サムネイルに注釈が反映されていない',
      })
      .toBeGreaterThanOrEqual(MIN_ANNOTATION_PIXELS);

    // 一覧の代表画像は、サーバー生成の合成済みサムネイルを表示元に用いる（Task 115.67）。
    // 注釈が見えることだけでは、クライアント側の合成へ落ちていても成立してしまうため、
    // 表示元が保存済みの合成結果そのものであることを併せて主張する（REQ-38.2, REQ-38.7）
    const listSrc = await readListThumbnailSrc();
    console.log(`[REQ-38] 一覧の代表画像の表示元: ${listSrc.slice(0, 120)}`);
    expect(
      listSrc.startsWith('data:'),
      '一覧の代表画像がクライアント側の合成へ落ちている（合成済みサムネイルの表示元URLが供給されていない）'
    ).toBe(false);
    expect(new URL(listSrc).pathname).toContain(savedAnnotatedThumbnailPath!);
    await expect(sharedPage.locator('[data-testid="annotated-thumbnail"]')).toHaveCount(1);
  });
});
