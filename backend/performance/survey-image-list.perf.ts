/**
 * @fileoverview 現場調査 画像一覧取得のパフォーマンステスト
 *
 * Task 113.1: 画像一覧取得の応答時間が写真枚数に比例しないことを確認する
 *
 * 目標（Requirements 38.4, 16.1）:
 * - 写真50枚の P97.5 が写真5枚の P97.5 の3倍以内であること（枚数比10倍に対して3倍以内）
 * - 写真50枚の P97.5 が 2000ms 未満であること（Requirement 16.1 の初期表示時間）
 *
 * 測定対象はサーバー処理時間（GET /api/site-surveys/:id/images）のみで、
 * ブラウザの描画時間は含めない。
 *
 * 前提条件:
 * - 管理者ユーザーがシードされていること
 * - バックエンドサーバーが起動していること（http://localhost:3000）
 * - ストレージが設定されていること（画像アップロードが成立すること）
 *
 * 計測用データはこのスクリプト内で作成する。外部の事前準備を必要としない。
 * 枚数は1現場調査あたりの上限（ImageUploadService.MAX_IMAGES_PER_SURVEY = 50）に収める。
 * 判定線「3倍以内」は枚数比10倍を前提としているため、5枚と50枚の比で維持する。
 *
 * 計測は P97.5 を用いる。autocannon の既定パーセンタイルに 95 が無いためで、
 * P97.5 は P95 以上の値となるため判定は要件より厳しくなる（緩和ではない）。
 */

import autocannon from 'autocannon';
import sharp from 'sharp';

// API base URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test credentials (from seed data)
const TEST_EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'AdminTest123!@#';

// Performance targets
const TARGETS = {
  /** Requirement 16.1: 画像一覧の初期表示を2秒以内に完了する */
  P97_5_ABSOLUTE_MS: 2000,
  /** 枚数比10倍（5枚→50枚）に対して許容する P97.5 の倍率 */
  P97_5_SCALING_FACTOR: 3,
};

/** 計測条件 */
const SMALL_IMAGE_COUNT = 5;
/** 1現場調査あたりの上限（MAX_IMAGES_PER_SURVEY）と同値 */
const LARGE_IMAGE_COUNT = 50;

/** 1リクエストあたりの最大アップロード件数（サーバー側の受入上限） */
const UPLOAD_CHUNK_SIZE = 10;

interface MeasurementResult {
  name: string;
  imageCount: number;
  latency: {
    mean: number;
    p97_5: number;
    p99: number;
  };
  throughput: number;
  errorRate: number;
  non2xx: number;
}

// ============================================================================
// セットアップ
// ============================================================================

async function getAccessToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { accessToken?: string };
  if (!data.accessToken) {
    throw new Error('Login response did not contain an access token');
  }
  return data.accessToken;
}

/**
 * 営業担当者に指定できるユーザーのIDを取得する
 *
 * 管理者ユーザーは担当者として指定できないため、管理者以外から選ぶ。
 */
async function getSalesPersonId(accessToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/users?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list users: ${response.status} ${await response.text()}`);
  }

  const users = (await response.json()) as Array<{
    id: string;
    roles?: Array<{ name: string }>;
  }>;

  const candidate = users.find((user) => !(user.roles ?? []).some((role) => role.name === 'admin'));
  if (!candidate) {
    throw new Error('担当者として指定できる管理者以外のユーザーが見つかりませんでした');
  }
  return candidate.id;
}

async function postJson<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/**
 * 計測用のJPEG画像を生成する
 *
 * 画像ごとに色を変えることで、ストレージ側の重複排除に影響されないようにする。
 */
async function createJpeg(seed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: seed % 256, g: (seed * 7) % 256, b: (seed * 13) % 256 },
    },
  })
    .jpeg({ quality: 70 })
    .toBuffer();
}

/**
 * 指定枚数の画像を現場調査へアップロードする
 */
async function uploadImages(surveyId: string, accessToken: string, count: number): Promise<void> {
  for (let offset = 0; offset < count; offset += UPLOAD_CHUNK_SIZE) {
    const chunkSize = Math.min(UPLOAD_CHUNK_SIZE, count - offset);
    const form = new FormData();

    for (let i = 0; i < chunkSize; i += 1) {
      const buffer = await createJpeg(offset + i);
      form.append(
        'images',
        new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }),
        `perf-${offset + i}.jpg`
      );
    }

    const response = await fetch(`${API_BASE_URL}/api/site-surveys/${surveyId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Image upload failed: ${response.status} ${await response.text()}`);
    }

    const result = (await response.json()) as { failed?: Array<{ error: string }> };
    if (result.failed && result.failed.length > 0) {
      throw new Error(`Image upload reported failures: ${JSON.stringify(result.failed)}`);
    }

    process.stdout.write(`  uploaded ${offset + chunkSize}/${count}\r`);
  }
  process.stdout.write('\n');
}

/**
 * 計測対象の現場調査を用意する
 */
async function prepareSurvey(
  accessToken: string,
  projectId: string,
  label: string,
  imageCount: number
): Promise<string> {
  console.log(`\n--- Preparing survey: ${label} (${imageCount} images) ---`);

  const survey = await postJson<{ id: string }>(
    `/api/projects/${projectId}/site-surveys`,
    accessToken,
    {
      name: `perf-${label}-${Date.now()}`,
      surveyDate: new Date().toISOString().slice(0, 10),
    }
  );

  await uploadImages(survey.id, accessToken, imageCount);
  return survey.id;
}

// ============================================================================
// 計測
// ============================================================================

async function measureImageList(
  name: string,
  surveyId: string,
  imageCount: number,
  accessToken: string
): Promise<MeasurementResult> {
  console.log(`\n--- Measuring: ${name} ---`);

  const result = await autocannon({
    url: `${API_BASE_URL}/api/site-surveys/${surveyId}/images`,
    method: 'GET',
    connections: 10,
    pipelining: 1,
    duration: 10,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const errorRate = result.requests.total > 0 ? result.errors / result.requests.total : 1;

  console.log(`  Requests: ${result.requests.total}`);
  console.log(`  Throughput: ${result.requests.average} req/sec`);
  console.log(`  Latency (avg): ${result.latency.mean}ms`);
  console.log(`  Latency (P97.5): ${result.latency.p97_5}ms`);
  console.log(`  Latency (P99): ${result.latency.p99}ms`);
  console.log(`  Errors: ${result.errors}, Non-2xx: ${result.non2xx}`);

  return {
    name,
    imageCount,
    latency: {
      mean: result.latency.mean,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
    },
    throughput: result.requests.average,
    errorRate,
    non2xx: result.non2xx,
  };
}

// ============================================================================
// 実行
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('='.repeat(70));
  console.log('現場調査 画像一覧取得 パフォーマンステスト');
  console.log(`対象: ${API_BASE_URL}`);
  console.log(
    `判定: ${LARGE_IMAGE_COUNT}枚のP97.5が${SMALL_IMAGE_COUNT}枚のP97.5の${TARGETS.P97_5_SCALING_FACTOR}倍以内、かつ ${TARGETS.P97_5_ABSOLUTE_MS}ms 未満`
  );
  console.log('='.repeat(70));

  const accessToken = await getAccessToken();
  const salesPersonId = await getSalesPersonId(accessToken);

  const project = await postJson<{ id: string }>('/api/projects', accessToken, {
    name: `perf-survey-image-list-${Date.now()}`,
    salesPersonId,
  });

  const smallSurveyId = await prepareSurvey(accessToken, project.id, 'small', SMALL_IMAGE_COUNT);
  const largeSurveyId = await prepareSurvey(accessToken, project.id, 'large', LARGE_IMAGE_COUNT);

  const small = await measureImageList(
    `画像一覧取得（${SMALL_IMAGE_COUNT}枚）`,
    smallSurveyId,
    SMALL_IMAGE_COUNT,
    accessToken
  );
  const large = await measureImageList(
    `画像一覧取得（${LARGE_IMAGE_COUNT}枚）`,
    largeSurveyId,
    LARGE_IMAGE_COUNT,
    accessToken
  );

  // 判定
  const allowedP97_5 = small.latency.p97_5 * TARGETS.P97_5_SCALING_FACTOR;
  const scalingPass = large.latency.p97_5 <= allowedP97_5;
  const absolutePass = large.latency.p97_5 < TARGETS.P97_5_ABSOLUTE_MS;
  const errorPass = large.non2xx === 0 && small.non2xx === 0;
  const passed = scalingPass && absolutePass && errorPass;

  console.log(`\n${'='.repeat(70)}`);
  console.log('判定結果');
  console.log('='.repeat(70));
  console.log(`  ${SMALL_IMAGE_COUNT}枚  P97.5: ${small.latency.p97_5}ms`);
  console.log(`  ${LARGE_IMAGE_COUNT}枚 P97.5: ${large.latency.p97_5}ms`);
  console.log(
    `  スケーリング: ${large.latency.p97_5}ms <= ${allowedP97_5}ms → ${scalingPass ? '✅ PASSED' : '❌ FAILED'}`
  );
  console.log(
    `  絶対値: ${large.latency.p97_5}ms < ${TARGETS.P97_5_ABSOLUTE_MS}ms → ${absolutePass ? '✅ PASSED' : '❌ FAILED'}`
  );
  console.log(`  エラー応答なし: ${errorPass ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`\n  総合: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(70));

  if (!passed) {
    process.exit(1);
  }
  process.exit(0);
}

runAllTests().catch((error: unknown) => {
  console.error('\n❌ パフォーマンステストの実行に失敗しました');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
