/**
 * @fileoverview サムネイル再生成の実体を検証するE2Eテスト
 *
 * Task 115.10: サムネイル再生成のE2Eを表示元の実体で検証する
 *
 * Requirements coverage (site-survey):
 * - REQ-23.1: 注釈の追加・編集・削除を行い保存後、サムネイル画像を再生成する
 * - REQ-23.2: 画像を回転して保存後、回転後の画像状態を反映したサムネイルを再生成する
 * - REQ-23.3: 回転と注釈編集の両方を行い保存後、両方を反映した最終状態のサムネイルを再生成する
 * - REQ-23.5: サムネイル再生成完了後、詳細画面のサムネイル表示を最新結果に更新する
 * - REQ-23.7: 保存後に画像編集画面を再度開くと、サムネイルが保存時に再生成された最新画像と一致する
 *
 * ## 何を検証するか（Task 115.10 の主旨）
 *
 * 表示元のキーが変化したことは「再生成が起きた」ことしか示さない。注釈が写っていない
 * サムネイルや、回転が反映されていないサムネイルが生成されてもキーは変化するため、
 * キーの変化だけを見る判定には判別能力が無い。本テストは生成された合成済みサムネイルの
 * **画素**を取得し、注釈と回転が実際に反映されていることを判定する。
 *
 * ## 判定方法と、その方法を採る理由
 *
 * 合成済みサムネイルは常に 200x200 へ cover 縮小して保存される
 * （`ImageProcessorService.generateThumbnail`。既定は THUMBNAIL_WIDTH/HEIGHT = 200）。
 * したがって回転しても保存後の寸法は変わらず、**寸法の縦横入れ替わりでは回転を判別できない**。
 * 寸法ではなく画素の配置と色で判定する。
 *
 * - **回転**: 4つの象限に異なる色を敷いた画像を用い、保存後の象限の色の並びが
 *   90度回転（時計回り）の置換に一致することで判定する。回転が反映されなければ
 *   並びは元のままとなり失敗する
 * - **注釈**: 既定の注釈色（`annotation-style-tokens.ts` の `#e53935`）に相当する
 *   画素が存在することで判定する。素材の4色はいずれも赤成分を持たないため、
 *   注釈が焼き込まれない限りこの色は現れない
 *
 * この2つを組み合わせることで、「回転のみ」「注釈のみ」「両方」の3状態を相互に
 * 区別できる。注釈が写っていないサムネイルや回転が反映されていないサムネイルは
 * 必ず失敗する。
 *
 * ## 素材画像を生成する理由
 *
 * 既存の固定素材（`e2e/fixtures/test-image.png`）は 100x100 の正方形で、回転しても
 * 見分けがつかない。判定に必要な「向きと位置が識別できる模様」を持つ画像を
 * その場で生成して用いる。
 *
 * ## 取得経路
 *
 * 検証の基準は、詳細画面が実際に画像一覧を受け取る経路である
 * `GET /api/site-surveys/:id` の応答とする。画像一覧取得（`/images`）で確認すると
 * 詳細応答側の欠落を見落とす（Task 111.5 / 115.9 の経緯）。
 * 画素の検証対象は、その応答が示す合成済みサムネイル（`annotatedThumbnailUrl`）である。
 *
 * ## 条件分岐を置かない
 *
 * 応答に合成済みサムネイルが含まれるか否かで検証本体を包まない。含まれないことは
 * 要件違反であり、その場合は失敗させる（AI運用7原則 第3原則）。
 */

import zlib from 'zlib';
import { test, expect, type Page } from '@playwright/test';
import { loginAsUser } from '../helpers/auth-actions';
import { getTimeout } from '../helpers/wait-helpers';
import { waitForFabricCanvas } from '../helpers/fabric-canvas';
import { API_BASE_URL } from '../config';
import { selectFirstRealOption } from '../helpers/form-preconditions';
import { assertPrepared } from '../helpers/preconditions';

// ============================================================================
// 定数
// ============================================================================

/** 検証対象の状態（ファイル名で識別する） */
const IMAGE_FILE_NAMES = {
  /** 注釈のみ（回転なし） */
  annotationOnly: 'req23-annotation.png',
  /** 回転のみ（注釈なし） */
  rotationOnly: 'req23-rotation.png',
  /** 回転と注釈の両方 */
  rotationAndAnnotation: 'req23-rotation-annotation.png',
} as const;

/** 素材画像の一辺（px）。正方形にして cover 縮小での切り抜きを生じさせない */
const SOURCE_IMAGE_SIZE = 320;

/**
 * 象限に敷く色
 *
 * いずれも赤成分を持たない。注釈色（#e53935）の検出と混同しないための条件である。
 * 相互のユークリッド距離は最小でも 255 あり、JPEG 再圧縮後も取り違えない。
 */
const QUADRANT_PALETTE = [
  { name: 'blue', r: 0, g: 0, b: 255 },
  { name: 'green', r: 0, g: 255, b: 0 },
  { name: 'cyan', r: 0, g: 255, b: 255 },
  { name: 'black', r: 0, g: 0, b: 0 },
] as const;

type QuadrantColorName = (typeof QUADRANT_PALETTE)[number]['name'] | 'unknown';

/** 素材画像の象限配置（回転前） */
const SOURCE_QUADRANTS = {
  topLeft: 'blue',
  topRight: 'green',
  bottomRight: 'cyan',
  bottomLeft: 'black',
} as const satisfies Record<string, QuadrantColorName>;

type QuadrantMap = Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', QuadrantColorName>;

/**
 * 象限の並びを時計回りに90度回転させる
 *
 * 画像編集画面の回転は Fabric.js の `angle` へそのまま渡される（`applyImageRotation`）。
 * Fabric.js の角度は時計回り正であるため、左上の内容は右上へ移動する。
 * 期待値を手で書き写さずここから導出することで、回転前後の対応の取り違えを防ぐ。
 */
const rotateQuadrantsClockwise = (quadrants: QuadrantMap): QuadrantMap => ({
  topRight: quadrants.topLeft,
  bottomRight: quadrants.topRight,
  bottomLeft: quadrants.bottomRight,
  topLeft: quadrants.bottomLeft,
});

/** 象限の色を判定する際に許容する色距離。パレット間の最小距離 255 に対して十分小さい */
const QUADRANT_COLOR_TOLERANCE = 100;

/** 象限の色を採取する位置（画像の幅・高さに対する比） */
const QUADRANT_SAMPLE_RATIO = 0.25;

/** 採取する正方形パッチの半径（画像の幅・高さに対する比） */
const QUADRANT_PATCH_RATIO = 0.05;

/**
 * 注釈画素の判定条件
 *
 * 既定の注釈色 `#e53935`（229, 57, 53）を、JPEG 再圧縮による劣化を見込んで
 * 「赤が十分に強く、緑・青より明確に大きい」という条件で数える。
 * 素材の4色は赤成分を持たないため、この条件に該当する画素は注釈由来に限られる。
 */
const ANNOTATION_PIXEL_RULE = { minRed: 110, minRedOverGreen: 60, minRedOverBlue: 60 } as const;

/**
 * 注釈が反映されたとみなす最小画素数
 *
 * 素材 320px 幅の矢印は 200px サムネイルへ縮小されるため線が細る。1本の矢印で
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

/** 合成済みサムネイルの画素解析結果 */
interface ThumbnailAnalysis {
  width: number;
  height: number;
  quadrants: QuadrantMap;
  /** 採取したパッチの平均色（診断用） */
  quadrantSamples: Record<keyof QuadrantMap, { r: number; g: number; b: number }>;
  /** 注釈色に該当した画素数 */
  annotationPixels: number;
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
 * 4象限に色を敷いた PNG を生成する
 *
 * 向きが識別できる素材を用意するために生成する。画像処理系の依存を追加せずに済ませるため、
 * Node 標準の zlib のみで PNG（8bit truecolor・フィルタなし）を組み立てる。
 *
 * @param size - 一辺の長さ（px）
 * @returns PNG のバイト列
 */
function createQuadrantPng(size: number): Buffer {
  const colorOf = (x: number, y: number): (typeof QUADRANT_PALETTE)[number] => {
    const half = size / 2;
    const name =
      y < half
        ? x < half
          ? SOURCE_QUADRANTS.topLeft
          : SOURCE_QUADRANTS.topRight
        : x < half
          ? SOURCE_QUADRANTS.bottomLeft
          : SOURCE_QUADRANTS.bottomRight;
    const color = QUADRANT_PALETTE.find((candidate) => candidate.name === name);
    if (!color) {
      throw new Error(`象限の色が定義されていません: ${name}`);
    }
    return color;
  };

  // 各走査線は先頭にフィルタ種別（0 = None）を持つ
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const color = colorOf(x, y);
      raw[offset++] = color.r;
      raw[offset++] = color.g;
      raw[offset++] = color.b;
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
 * 合成済みサムネイルの画素を解析する
 *
 * 取得したバイト列をデータURLとしてブラウザへ渡し、canvas で復号する。
 * データURLはキャンバスを汚染しないため画素の読み出しが行える。画像復号の依存を
 * 追加せずに、実際にブラウザが解釈するのと同じ復号結果に対して判定できる。
 *
 * @param page - 復号に用いるページ
 * @param bytes - 合成済みサムネイルのバイト列
 */
async function analyzeThumbnail(page: Page, bytes: Buffer): Promise<ThumbnailAnalysis> {
  const dataUrl = `data:image/jpeg;base64,${bytes.toString('base64')}`;

  return page.evaluate(
    async ({ dataUrl: url, palette, tolerance, sampleRatio, patchRatio, annotationRule }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = (): void => resolve();
        image.onerror = (): void => reject(new Error('合成済みサムネイルを復号できません'));
        image.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('2D描画コンテキストを取得できません');
      }
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

      const pixelAt = (x: number, y: number): { r: number; g: number; b: number } => {
        const index = (y * canvas.width + x) * 4;
        return { r: data[index] ?? 0, g: data[index + 1] ?? 0, b: data[index + 2] ?? 0 };
      };

      const averageAt = (
        centerRatioX: number,
        centerRatioY: number
      ): { r: number; g: number; b: number } => {
        const centerX = Math.round(canvas.width * centerRatioX);
        const centerY = Math.round(canvas.height * centerRatioY);
        const radiusX = Math.max(1, Math.round(canvas.width * patchRatio));
        const radiusY = Math.max(1, Math.round(canvas.height * patchRatio));
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;
        for (let y = centerY - radiusY; y <= centerY + radiusY; y++) {
          for (let x = centerX - radiusX; x <= centerX + radiusX; x++) {
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
            const pixel = pixelAt(x, y);
            sumR += pixel.r;
            sumG += pixel.g;
            sumB += pixel.b;
            count++;
          }
        }
        return { r: sumR / count, g: sumG / count, b: sumB / count };
      };

      const classify = (sample: { r: number; g: number; b: number }): string => {
        let bestName = 'unknown';
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const entry of palette) {
          const distance = Math.sqrt(
            (sample.r - entry.r) ** 2 + (sample.g - entry.g) ** 2 + (sample.b - entry.b) ** 2
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            bestName = entry.name;
          }
        }
        return bestDistance <= tolerance ? bestName : 'unknown';
      };

      const positions = {
        topLeft: [sampleRatio, sampleRatio],
        topRight: [1 - sampleRatio, sampleRatio],
        bottomRight: [1 - sampleRatio, 1 - sampleRatio],
        bottomLeft: [sampleRatio, 1 - sampleRatio],
      } as const;

      const quadrantSamples = {
        topLeft: averageAt(positions.topLeft[0], positions.topLeft[1]),
        topRight: averageAt(positions.topRight[0], positions.topRight[1]),
        bottomRight: averageAt(positions.bottomRight[0], positions.bottomRight[1]),
        bottomLeft: averageAt(positions.bottomLeft[0], positions.bottomLeft[1]),
      };

      let annotationPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        if (
          r >= annotationRule.minRed &&
          r - g >= annotationRule.minRedOverGreen &&
          r - b >= annotationRule.minRedOverBlue
        ) {
          annotationPixels++;
        }
      }

      return {
        width: canvas.width,
        height: canvas.height,
        quadrants: {
          topLeft: classify(quadrantSamples.topLeft),
          topRight: classify(quadrantSamples.topRight),
          bottomRight: classify(quadrantSamples.bottomRight),
          bottomLeft: classify(quadrantSamples.bottomLeft),
        },
        quadrantSamples,
        annotationPixels,
      };
    },
    {
      dataUrl,
      palette: QUADRANT_PALETTE.map((entry) => ({ ...entry })),
      tolerance: QUADRANT_COLOR_TOLERANCE,
      sampleRatio: QUADRANT_SAMPLE_RATIO,
      patchRatio: QUADRANT_PATCH_RATIO,
      annotationRule: { ...ANNOTATION_PIXEL_RULE },
    }
  ) as Promise<ThumbnailAnalysis>;
}

// ============================================================================
// テスト
// ============================================================================

/**
 * @requirement site-survey/REQ-23.1
 * @requirement site-survey/REQ-23.2
 * @requirement site-survey/REQ-23.3
 * @requirement site-survey/REQ-23.5
 * @requirement site-survey/REQ-23.7
 */
test.describe('サムネイル再生成の実体（注釈と回転の反映）', () => {
  test.describe.configure({ mode: 'serial' });

  let createdProjectId: string | null = null;
  let createdSurveyId: string | null = null;
  /** 事前準備の直後に詳細取得経路から読んだ画像一覧（表示順） */
  let baselineImages: DetailImage[] = [];
  /** REQ-23.7 の比較に用いる、保存時点の合成済みサムネイル */
  let savedRotatedAnnotatedPath: string | null = null;
  let savedRotatedAnnotatedBytes: Buffer | null = null;

  const imageOf = (images: DetailImage[], fileName: string): DetailImage => {
    const image = images.find((candidate) => candidate.fileName === fileName);
    if (!image) {
      throw new Error(`前提状態の画像が見つかりません: ${fileName}`);
    }
    return image;
  };

  /** ログイン済みページの認証ヘッダを組み立てる */
  async function getAuthHeaders(page: Page): Promise<Record<string, string>> {
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken, 'アクセストークンが取得できる').toBeTruthy();
    return { Authorization: `Bearer ${accessToken}` };
  }

  /** 詳細画面が実際に用いる取得経路から画像一覧を読む */
  async function fetchDetailImages(page: Page): Promise<DetailImage[]> {
    const response = await page.request.get(
      `${API_BASE_URL}${surveyDetailPath(createdSurveyId!)}`,
      { headers: await getAuthHeaders(page) }
    );
    expect(response.ok(), '現場調査詳細の取得が成功する').toBeTruthy();
    return ((await response.json()) as { images: DetailImage[] }).images;
  }

  /** 画像編集画面を開き、編集モードへ入る */
  async function openEditor(page: Page, imageId: string): Promise<void> {
    await page.goto(`/site-surveys/${createdSurveyId}/images/${imageId}`);
    await page.waitForLoadState('networkidle');

    const editModeButton = page.getByRole('button', { name: /編集モード/i });
    await expect(editModeButton).toBeVisible({ timeout: getTimeout(15000) });
    await editModeButton.click();

    await page
      .locator('[data-testid="annotation-toolbar"]')
      .waitFor({ state: 'visible', timeout: getTimeout(15000) });

    // Task 115.184: 描画面の観測（getEditorCanvasState）は不在なら投げる。`expect.poll`
    // は poller の例外を再試行しないため、poll の手前で観測できる状態を確立しておく。
    // 本番は useEffect で `window.__fabricCanvas` を載せるので、容器や道具帯の可視は
    // 描画面が載ったことを意味しない。背景画像の読込待ちは別条件なのでそのまま残す。
    await waitForFabricCanvas(page);
  }

  /** 編集キャンバスの中心座標を取得する */
  async function getCanvasCenter(page: Page): Promise<{ x: number; y: number }> {
    const upperCanvas = page.locator('.upper-canvas');
    await expect(upperCanvas).toBeVisible({ timeout: getTimeout(15000) });

    let box = await upperCanvas.boundingBox();
    for (
      let attempt = 0;
      attempt < 20 && (!box || box.width <= 10 || box.height <= 10);
      attempt++
    ) {
      await page.waitForTimeout(300);
      box = await upperCanvas.boundingBox();
    }
    if (!box || box.width <= 10 || box.height <= 10) {
      throw new Error('編集キャンバスの領域が確保されていません');
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /**
   * 編集キャンバスの状態を取得する
   *
   * 画像編集画面はキャンバスを `window.__fabricCanvas` として公開している。
   * 背景画像は `canvas.backgroundImage` に置かれ `getObjects()` には現れないため、
   * 注釈の件数（`getObjects()`）と背景画像の回転角度を分けて読む。
   * 描画・回転が実際に反映されたかを保存前に確認するために用いる。
   *
   * Task 115.184: キャンバス未公開は番兵値で返さず投げる。以前は
   * `{ hasCanvas: false, annotationCount: 0 }` を返していたため、**注釈の件数が
   * 「観測できなかった」と「零件だった」で同じ 0 になり**、増分や不在の主張が
   * キャンバス不在のままでも成立しえた。`hasCanvas` の番人を呼び出しごとに
   * 書き忘れる余地も消す。
   *
   * @returns 背景画像未読込時は `backgroundAngle: null`
   */
  function getEditorCanvasState(
    page: Page
  ): Promise<{ annotationCount: number; backgroundAngle: number | null }> {
    return page.evaluate(() => {
      const canvas = (
        window as unknown as {
          __fabricCanvas?: {
            getObjects: () => unknown[];
            backgroundImage?: { angle?: number } | null;
          } | null;
        }
      ).__fabricCanvas;
      if (!canvas) {
        throw new Error(
          'Fabric.js キャンバス（window.__fabricCanvas）が取得できない。' +
            '注釈の件数を観測できないため、ここで失敗させる'
        );
      }
      const background = canvas.backgroundImage;
      return {
        annotationCount: canvas.getObjects().length,
        backgroundAngle: background ? Number(background.angle ?? 0) : null,
      };
    });
  }

  /**
   * 矢印注釈を1本描く
   *
   * 象限の採取位置（縦横それぞれ 25% / 75%）を避けるため、キャンバスの水平中央線上に
   * 引く。採取パッチと重ならないため、注釈の有無と象限の色を独立に判定できる。
   */
  async function drawArrow(page: Page): Promise<void> {
    const arrowTool = page.getByRole('button', { name: /矢印/i });
    await expect(arrowTool).toBeVisible({ timeout: getTimeout(10000) });
    await arrowTool.click();
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true');

    const center = await getCanvasCenter(page);

    // 背景画像の読み込み前に描くと、合成結果に素材が写らない状態で保存されうる
    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle !== null, {
        timeout: getTimeout(15000),
        message: '編集キャンバスに背景画像が読み込まれていない',
      })
      .toBe(true);

    // Task 115.184: 「編集キャンバスが公開されている」ことは観測そのものが投げて
    // 保証するため、番兵値を弾くための主張は不要になった。
    const before = await getEditorCanvasState(page);

    await page.mouse.move(center.x - 100, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y, { steps: 10 });
    await page.mouse.up();

    // 描画が実際に注釈を生成したことを確認してから保存する。生成されていない状態で
    // 保存すると「注釈なし」として扱われ、検証対象の前提が崩れる（Task 115.3）
    await expect
      .poll(async () => (await getEditorCanvasState(page)).annotationCount, {
        timeout: getTimeout(10000),
        message: '矢印の描画で注釈オブジェクトが生成されていない',
      })
      .toBe(before.annotationCount + 1);

    await page.getByRole('button', { name: /選択/i }).click();
  }

  /** 画像を90度回転する */
  async function rotate90(page: Page): Promise<void> {
    const rotateButton = page.getByRole('button', { name: /画像を90度回転/i });
    await expect(rotateButton).toBeVisible({ timeout: getTimeout(10000) });

    // 背景画像の読み込み前に押しても回転は適用されない。読み込み完了を待ってから押す
    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle, {
        timeout: getTimeout(15000),
        message: '編集キャンバスに背景画像が読み込まれていない',
      })
      .toBe(0);

    await rotateButton.click();

    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle, {
        timeout: getTimeout(10000),
        message: '回転操作が背景画像へ適用されていない',
      })
      .toBe(90);
  }

  /**
   * 画像編集画面で保存し、合成済みサムネイルの更新完了まで確認する
   *
   * 保存は注釈の保存（PUT）と合成済みサムネイルの更新（PATCH）の2段で構成される。
   * Task 115.2 により後者の完了が保存完了の条件であるため、双方の応答を確認する。
   *
   * @returns 更新後の合成済みサムネイルのキー
   */
  async function saveInEditor(page: Page, imageId: string): Promise<string> {
    const annotationSaved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/site-surveys/images/${imageId}/annotations` &&
        response.request().method() === 'PUT',
      { timeout: getTimeout(30000) }
    );
    const thumbnailUpdated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/site-surveys/images/${imageId}/annotated-thumbnail` &&
        response.request().method() === 'PATCH',
      { timeout: getTimeout(30000) }
    );

    await page.getByRole('button', { name: /^保存$/i }).click();

    const annotationResponse = await annotationSaved;
    expect(annotationResponse.ok(), '注釈の保存が成功する').toBeTruthy();

    const thumbnailResponse = await thumbnailUpdated;
    expect(
      thumbnailResponse.ok(),
      '合成済みサムネイルの更新が成功する（REQ-23.4 / Task 115.2）'
    ).toBeTruthy();

    await expect(page.getByText(/保存しました/i)).toBeVisible({ timeout: getTimeout(15000) });

    const body = (await thumbnailResponse.json()) as { annotatedThumbnailPath: string };
    return body.annotatedThumbnailPath;
  }

  /** ストレージ上の実体を取得する */
  async function fetchBytes(page: Page, url: string): Promise<Buffer> {
    const response = await page.request.get(url);
    expect(response.ok(), `表示元の実体が取得できる: ${url}`).toBeTruthy();
    return Buffer.from(await response.body());
  }

  /**
   * 保存後の合成済みサムネイルを、詳細画面が用いる取得経路の応答から取り出して解析する
   *
   * 応答に含まれるか否かで分岐しない。含まれない場合は要件違反であり失敗させる。
   */
  async function analyzeSavedThumbnail(
    page: Page,
    fileName: string,
    expectedPath: string
  ): Promise<{ analysis: ThumbnailAnalysis; bytes: Buffer; image: DetailImage }> {
    const images = await fetchDetailImages(page);
    const image = imageOf(images, fileName);
    const baseline = imageOf(baselineImages, fileName);

    // 合成済みサムネイルが、保存時に更新されたキーとして詳細取得の応答に現れる
    expect(image.annotatedThumbnailPath, '詳細取得の応答に合成済みサムネイルの保存先が現れる').toBe(
      expectedPath
    );
    expect(image.annotatedThumbnailPath!.startsWith(ANNOTATED_THUMBNAIL_PREFIX)).toBe(true);
    expect(
      image.annotatedThumbnailUrl,
      '詳細取得の応答に合成済みサムネイルの表示元URLが現れる'
    ).toBeTruthy();

    // 検証対象は合成済みサムネイルである。通常サムネイルは保存で書き換わらない（Task 115.1）
    expect(image.thumbnailPath, '通常サムネイルは保存操作で書き換わらない').toBe(
      baseline.thumbnailPath
    );

    const bytes = await fetchBytes(page, image.annotatedThumbnailUrl!);
    const analysis = await analyzeThumbnail(page, bytes);

    console.log(
      `[REQ-23] ${fileName}: key=${image.annotatedThumbnailPath} ` +
        `size=${analysis.width}x${analysis.height} ` +
        `quadrants=${JSON.stringify(analysis.quadrants)} ` +
        `samples=${JSON.stringify(analysis.quadrantSamples)} ` +
        `annotationPixels=${analysis.annotationPixels}`
    );

    return { analysis, bytes, image };
  }

  /**
   * 詳細画面の縮小表示が、保存で再生成された合成済みサムネイルを指していることを確認する
   *
   * REQ-23.5 は「詳細画面のサムネイル表示を最新の再生成結果に更新する」ことを求める。
   * 応答の値だけでなく、画面が実際にその実体を表示元に用いていることまで確認する。
   */
  async function expectDetailThumbnailUses(
    page: Page,
    fileName: string,
    annotatedThumbnailPath: string
  ): Promise<void> {
    await page.goto(`/site-surveys/${createdSurveyId}`);
    await page.waitForLoadState('networkidle');

    const thumbnail = page.getByAltText(fileName);
    await expect(thumbnail).toBeVisible({ timeout: getTimeout(15000) });
    // 詳細画面の写真は表示領域へ入るまで表示元URLを設定しない（REQ-38.8 の遅延読み込み）
    await thumbnail.scrollIntoViewIfNeeded();

    await expect
      .poll(async () => (await thumbnail.getAttribute('src')) ?? '', {
        timeout: getTimeout(15000),
        message: `${fileName} の縮小表示が合成済みサムネイル（${annotatedThumbnailPath}）を用いていない`,
      })
      .toContain(annotatedThumbnailPath);
  }

  /**
   * 事前準備
   *
   * 向きが識別できる素材を3枚登録する。合成済みサムネイルは各テストが画像編集画面を
   * 操作して生成させる（データの直接書き換えでは生成経路の欠落を見落とすため）。
   */
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await loginAsUser(page, 'REGULAR_USER');

      // --- プロジェクト作成（営業担当者の既定値は画面が解決するため画面から作る） ---
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: /新規作成/i }).click();
      await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
      await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
        timeout: getTimeout(15000),
      });

      await page
        .getByRole('textbox', { name: /プロジェクト名/i })
        .fill(`サムネイル再生成の実体検証_${Date.now()}`);

      const salesPersonSelect = page.locator('select[aria-label="営業担当者"]');
      await selectFirstRealOption(salesPersonSelect, '営業担当者');

      const createProjectPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/projects') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: /^作成$/i }).click();
      await createProjectPromise;

      await page.waitForURL(/\/projects\/[0-9a-f-]+$/);
      createdProjectId = page.url().match(/\/projects\/([0-9a-f-]+)$/)?.[1] ?? null;
      expect(createdProjectId).toBeTruthy();

      const authHeaders = await getAuthHeaders(page);

      // --- 現場調査作成 ---
      const surveyDate = new Date().toISOString().split('T')[0]!;
      const surveyResponse = await page.request.post(
        `${API_BASE_URL}/api/projects/${createdProjectId}/site-surveys`,
        {
          headers: authHeaders,
          data: { name: `サムネイル再生成の実体検証用現場調査_${Date.now()}`, surveyDate },
        }
      );
      expect(surveyResponse.ok(), '現場調査の作成が成功する').toBeTruthy();
      createdSurveyId = ((await surveyResponse.json()) as { id: string }).id;
      expect(createdSurveyId).toBeTruthy();

      // --- 素材を登録 ---
      const sourcePng = createQuadrantPng(SOURCE_IMAGE_SIZE);
      for (const fileName of Object.values(IMAGE_FILE_NAMES)) {
        const uploadResponse = await page.request.post(
          `${API_BASE_URL}/api/site-surveys/${createdSurveyId}/images`,
          {
            headers: authHeaders,
            multipart: {
              images: { name: fileName, mimeType: 'image/png', buffer: sourcePng },
            },
          }
        );
        expect(uploadResponse.ok(), `画像の登録が成功する: ${fileName}`).toBeTruthy();
      }

      baselineImages = await fetchDetailImages(page);
      expect(baselineImages).toHaveLength(Object.keys(IMAGE_FILE_NAMES).length);

      for (const fileName of Object.values(IMAGE_FILE_NAMES)) {
        const image = imageOf(baselineImages, fileName);
        expect(image.width).toBeGreaterThan(0);
        expect(image.height).toBeGreaterThan(0);
        expect(image.thumbnailPath, '通常サムネイルが生成されている').toBeTruthy();
        expect(
          image.annotatedThumbnailPath,
          '保存前は合成済みサムネイルを持たない（変化の起点）'
        ).toBeNull();
      }

      // 素材が意図どおりの向きで登録されていることを、通常サムネイルの実体で確認する。
      // これが成立して初めて「回転後の並びが変わったこと」に意味が生まれる
      const baselineSource = imageOf(baselineImages, IMAGE_FILE_NAMES.rotationOnly);
      expect(baselineSource.thumbnailUrl, '通常サムネイルの表示元URLが供給される').toBeTruthy();
      const baselineThumbnail = await fetchBytes(page, baselineSource.thumbnailUrl!);
      const baselineAnalysis = await analyzeThumbnail(page, baselineThumbnail);
      console.log(
        `[REQ-23] 素材の象限（回転前）: ${JSON.stringify(baselineAnalysis.quadrants)} ` +
          `samples=${JSON.stringify(baselineAnalysis.quadrantSamples)} ` +
          `annotationPixels=${baselineAnalysis.annotationPixels}`
      );
      expect(baselineAnalysis.quadrants).toEqual(SOURCE_QUADRANTS);
      expect(baselineAnalysis.annotationPixels, '素材には注釈色の画素が無い').toBe(0);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * @requirement site-survey/REQ-23.1
   * @requirement site-survey/REQ-23.5
   */
  test('注釈のみを保存すると合成済みサムネイルに注釈が焼き込まれ詳細画面がそれを表示すること (site-survey/REQ-23.1, site-survey/REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const target = imageOf(baselineImages, IMAGE_FILE_NAMES.annotationOnly);
    await openEditor(page, target.id);
    await drawArrow(page);
    const savedPath = await saveInEditor(page, target.id);

    const { analysis } = await analyzeSavedThumbnail(
      page,
      IMAGE_FILE_NAMES.annotationOnly,
      savedPath
    );

    // REQ-23.1: 注釈が実際に焼き込まれている
    expect(
      analysis.annotationPixels,
      '合成済みサムネイルに注釈色の画素が現れる（注釈が写っていないサムネイルでは失敗する）'
    ).toBeGreaterThanOrEqual(MIN_ANNOTATION_PIXELS);

    // 回転していないため象限の並びは素材のまま。回転を伴わない保存で向きが変わらないこと
    expect(analysis.quadrants).toEqual(SOURCE_QUADRANTS);

    // REQ-23.5: 詳細画面の縮小表示が再生成結果を用いる
    await expectDetailThumbnailUses(page, IMAGE_FILE_NAMES.annotationOnly, savedPath);
  });

  /**
   * @requirement site-survey/REQ-23.2
   * @requirement site-survey/REQ-23.5
   */
  test('回転のみを保存すると合成済みサムネイルに回転が反映され詳細画面がそれを表示すること (site-survey/REQ-23.2, site-survey/REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const target = imageOf(baselineImages, IMAGE_FILE_NAMES.rotationOnly);
    await openEditor(page, target.id);
    await rotate90(page);
    const savedPath = await saveInEditor(page, target.id);

    const { analysis } = await analyzeSavedThumbnail(
      page,
      IMAGE_FILE_NAMES.rotationOnly,
      savedPath
    );

    // REQ-23.2: 回転が実際に反映されている（並びが素材のままなら失敗する）
    expect(analysis.quadrants).toEqual(rotateQuadrantsClockwise(SOURCE_QUADRANTS));

    // 注釈は描いていないため注釈色は現れない。回転の検証が注釈由来の画素で
    // 成立しているのではないことを併せて示す
    expect(analysis.annotationPixels, '注釈を描いていないため注釈色の画素は現れない').toBe(0);

    // REQ-23.5
    await expectDetailThumbnailUses(page, IMAGE_FILE_NAMES.rotationOnly, savedPath);
  });

  /**
   * @requirement site-survey/REQ-23.3
   * @requirement site-survey/REQ-23.5
   */
  test('回転と注釈の両方を保存すると合成済みサムネイルに双方が反映されること (site-survey/REQ-23.3, site-survey/REQ-23.5)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const target = imageOf(baselineImages, IMAGE_FILE_NAMES.rotationAndAnnotation);
    await openEditor(page, target.id);
    await rotate90(page);
    await drawArrow(page);
    const savedPath = await saveInEditor(page, target.id);

    const { analysis, bytes } = await analyzeSavedThumbnail(
      page,
      IMAGE_FILE_NAMES.rotationAndAnnotation,
      savedPath
    );

    // REQ-23.3: 回転と注釈の双方が最終状態として反映されている
    expect(analysis.quadrants).toEqual(rotateQuadrantsClockwise(SOURCE_QUADRANTS));
    expect(
      analysis.annotationPixels,
      '合成済みサムネイルに注釈色の画素が現れる'
    ).toBeGreaterThanOrEqual(MIN_ANNOTATION_PIXELS);

    // REQ-23.5
    await expectDetailThumbnailUses(page, IMAGE_FILE_NAMES.rotationAndAnnotation, savedPath);

    // REQ-23.7 の比較対象として、保存時点の実体を控える
    savedRotatedAnnotatedPath = savedPath;
    savedRotatedAnnotatedBytes = bytes;
  });

  /**
   * @requirement site-survey/REQ-23.7
   *
   * 保存後に画像編集画面を再度開いたとき、編集画面が復元する状態と、保存時に再生成された
   * 合成済みサムネイルが一致していることを確認する。表示元のキーが変わらないことに加え、
   * 実体（バイト列）が同一であること、および編集画面が回転と注釈を復元していることを見る。
   */
  test('保存後に画像編集画面を再度開いても保存時の合成済みサムネイルと一致すること (site-survey/REQ-23.7)', async ({
    page,
  }) => {
    await loginAsUser(page, 'REGULAR_USER');

    expect(
      savedRotatedAnnotatedPath,
      '直前のテストで合成済みサムネイルが保存されている'
    ).toBeTruthy();
    expect(savedRotatedAnnotatedBytes, '保存時点の実体が控えられている').toBeTruthy();

    const target = imageOf(baselineImages, IMAGE_FILE_NAMES.rotationAndAnnotation);

    // 画像編集画面を再度開く
    await openEditor(page, target.id);

    // 保存済みの状態（回転90度・注釈1件）が復元されるまで待って読む。
    // 復元は背景画像の読み込み後に非同期で行われる
    await expect
      .poll(async () => (await getEditorCanvasState(page)).backgroundAngle, {
        timeout: getTimeout(15000),
        message: '再度開いた編集画面に保存時の回転が復元されていない',
      })
      .toBe(90);
    await expect
      .poll(async () => (await getEditorCanvasState(page)).annotationCount, {
        timeout: getTimeout(15000),
        message: '再度開いた編集画面に保存時の注釈が復元されていない',
      })
      .toBe(1);

    // 詳細画面が用いる取得経路で、表示元が保存時のまま保たれていることを確認する
    const images = await fetchDetailImages(page);
    const image = imageOf(images, IMAGE_FILE_NAMES.rotationAndAnnotation);
    expect(image.annotatedThumbnailPath, '表示元が保存時のキーのまま保たれる').toBe(
      savedRotatedAnnotatedPath
    );
    expect(image.annotatedThumbnailUrl).toBeTruthy();

    // 実体が同一であること。キーが同じでも中身が入れ替わっていないことを示す
    const bytes = await fetchBytes(page, image.annotatedThumbnailUrl!);
    expect(bytes.equals(savedRotatedAnnotatedBytes!), '実体が保存時と同一である').toBe(true);

    // 復元された状態（回転90度・注釈1件）と、保持されている実体の内容が一致する
    const analysis = await analyzeThumbnail(page, bytes);
    console.log(
      `[REQ-23.7] 再度開いた後の実体: quadrants=${JSON.stringify(analysis.quadrants)} ` +
        `annotationPixels=${analysis.annotationPixels}`
    );
    expect(analysis.quadrants).toEqual(rotateQuadrantsClockwise(SOURCE_QUADRANTS));
    expect(analysis.annotationPixels).toBeGreaterThanOrEqual(MIN_ANNOTATION_PIXELS);
  });

  /**
   * クリーンアップ: テスト用プロジェクトを削除
   */
  test.afterAll(async ({ browser }) => {
    // 前提が用意されていなければ削除すべき対象も無い。黙って戻ると「後片付けした」ことになり、
    // 前提の生成が壊れたことが記録に残らない。前提が崩れた地点で失敗させる。
    assertPrepared(createdProjectId, '事前準備で作成したプロジェクトのID');

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsUser(page, 'ADMIN_USER');
      const deleteResponse = await page.request.delete(
        `${API_BASE_URL}/api/projects/${createdProjectId}`,
        { headers: await getAuthHeaders(page) }
      );
      expect([200, 204, 404]).toContain(deleteResponse.status());
    } finally {
      await context.close();
    }
  });
});
