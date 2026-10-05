/**
 * @fileoverview 工事写真（construction-photo）追加機能フローのE2Eテスト
 *
 * Task 13.3: E2E テスト（追加機能, Playwright）
 *
 * 設計（design.md「Testing Strategy > E2E/UI Tests」の追加機能項目、System Flows
 * ビューア・ZIP、Traceability 14〜19）で定義された追加機能の主要ユーザーフローを、
 * 実際のUI・API・DB（テスト環境: frontend 5174 / backend 3100 / postgres 5433）を通じて
 * エンドツーエンドで検証する。基本フロー（アルバムCRUD・アップロード・並替・PDF・看板配置）は
 * 既存の `construction-photo-workflow.spec.ts`（Task 9.3）が担うため、本スペックは
 * 追加機能（要件14〜19）に対象を絞る。
 *
 * 検証する主要フロー（要件対応）:
 *  1. 画像ビューア: フルスクリーン表示・ズーム・90度回転・拡大時パン・閉じる
 *     （R14.1, R14.2, R14.3, R14.4, R14.5）＋原本を必要時にのみ取得（R14.6）
 *  2. 非合成原本エンドポイント: 看板配置済み写真でもビューアが原本（/original）を返す
 *     （合成印字画像 /print-image は使わない）（R14.6, 併せて R14.1）
 *  3. ZIP一括エクスポート（全件）: 形式(PNG)・解像度(高)・看板モード(plain)選択→開始→
 *     進捗ダイアログ→ZIPダウンロード（R15.1, R15.2, R15.3, R15.4, R15.5, R15.8）
 *  4. ZIP一括エクスポート（選択）: 未選択時は選択エクスポート無効化、選択後に有効化→
 *     ダウンロード（R15.6, R15.7）
 *  5. ZIP中断: エクスポート進行中に中断→中断通知・ダウンロードなし（R15.9）
 *  6. ZIP対象0件: 空アルバムで全件エクスポートは非実行で通知（R15.11）
 *  7. アルバム編集・削除導線: 詳細画面の編集導線→編集画面遷移、削除導線→確認→削除→一覧遷移
 *     （R16.1, R16.2, R16.3, R16.4, R16.5）＋一覧の行アクション導線（R16.6）
 *  8. 権限出し分け: user は削除導線（アルバム削除・写真項目削除）が非表示、編集導線は表示
 *     （R17.2、対比として R17.1 の編集系表示も確認）
 *  8b. 権限出し分け（編集権限なし）: construction_photo:update を持たないロールでは、写真項目の
 *     追加・コメント編集・並び替え・印刷対象変更・看板配置・保存・写真項目削除の操作手段が
 *     表示されず、閲覧の要素は表示される。対照として admin では同じ操作手段が表示される（R17.1）
 *  8c. 看板マスタの権限の出し分け: admin では「新規登録」と各行の「編集」「削除」が表示され、
 *     user（construction_signboard:delete を持たない）では削除だけが表示されず、看板の閲覧の
 *     権限だけのロールでは三つの操作のいずれも表示されない（R17.4, タスク 23.8）
 *  9. 未保存離脱警告（アプリ内遷移）: 未保存状態でのアプリ内遷移で確認ダイアログ→とどまる／
 *     保存後は警告なし（R18.2, R18.3）
 * 10. 未保存離脱警告（ブラウザ reload/タブ閉じ = beforeunload）: 未保存状態で beforeunload の
 *     既定動作が抑止（confirm 相当の離脱警告が発火）され、保存後は解除されることを、synthetic
 *     `beforeunload` イベント dispatch＋`event.defaultPrevented` で非フレークに検証する（R18.1）。
 *     ConstructionPhotoDetailPage は task 12.5 で `useUnsavedChanges`（dirty 時に
 *     `window.addEventListener('beforeunload', e => e.preventDefault())`）へ移行済みで、
 *     site-survey の site-survey-responsive.spec.ts の確立済みパターンを流用する。
 * 11. モバイル縦積み: 狭幅で横スクロールなし・写真項目が縦積み（R19.1, R19.2, R19.4）
 * 12. モバイル幅のブレッドクラム: 長いプロジェクト名・アルバム名でもブレッドクラムが水平に
 *     はみ出さない（折り返して収まる／折り返せない語は自身の領域内に収まる）（R19.4）
 * 13. モバイル幅の見出し: 区切りの無い英数字の長いアルバム名・メモでも、詳細画面の見出し領域が
 *     水平にはみ出さない（R19.1）
 * 14. モバイル幅のファイル名: 区切りの無い現実的な長さのファイル名でも、写真項目の見出しと削除確認
 *     ダイアログの本文が水平にはみ出さない（R19.1）
 * 15. モバイル幅の看板配置ダイアログ: 区切りの無い英数字の長い工事件名でも、操作列の「保存」が
 *     画面外へ押し出されず、案内文が潰れず、件名のバッジが画面内に収まる（R19.1）
 * 16. モバイル幅のアルバムを取り除く確認ダイアログ: 区切りの無い英数字の長いアルバム名でも、
 *     ダイアログとその中のパネルが水平にはみ出さず、名前の文字列が画面内に収まる（R19.1）
 * 17. モバイル幅の現場調査写真の選択ダイアログ: 区切りの無い英数字の長い調査名でも、候補一覧の
 *     本文が水平にはみ出さず、調査名の文字列と右の枚数表示が画面内に収まる（R19.1）
 * 18. モバイル幅の通知とエラー表示: 区切りの無い現実的な長さのファイル名・長い文言でも、アップ
 *     ロード失敗の通知、アップロードできないファイルの表示、アルバムを取得できないときのエラー
 *     表示が水平にはみ出さず、文字列が枠の内側に収まる（R19.1）
 * 19. モバイル幅の文書全体: admin と user のそれぞれで、375 幅と 320 幅の詳細画面が文書全体
 *     （documentElement）を水平にはみ出させない（R19.1）
 * 20. モバイル幅のブレッドクラム（一覧・作成・編集・詳細）: 375 幅と 320 幅で、普通の名前・区切りの
 *     無い英数字の長い一語・長い和文のプロジェクト名のいずれでも、ブレッドクラムと画面が水平に
 *     はみ出さず、固定の文言の短い項目が一行に収まる（要件の印は掲げない。タスク 20.2・20.6）
 * 21. モバイル幅の取得エラーの表示（一覧・作成・編集・看板マスタ・ビューア）と一覧の通知: 区切りの
 *     無い長い文言でも、表示が水平にはみ出さず、文字列が枠の内側に収まる（要件の印は掲げない。
 *     タスク 20.6）
 * 22. モバイル幅のタップ領域: 375 幅と 320 幅で、写真項目の看板の操作ボタンが「看板を配置」
 *     「看板を変更」のどちらの表示でも 44×44 以上で描かれ、同じ写真項目の他の操作コントロールも
 *     同じ下限を満たし、隣のボタンと重ならない（R19.3。タスク 21.2）
 * 23. 写真項目の削除の失敗と、やり直し: 写真項目の削除の応答を失敗へ差し替えると、確認ダイアログが
 *     閉じ、取り除こうとした写真項目の中（削除ボタンの下）に失敗（role=alert）が表示され、上部の
 *     通知の枠には出ず、画面は送られず（scrollY が変わらない）、写真項目は残る。差し替えを解いて
 *     やり直すと、写真項目と看板配置のデータが削除され、失敗の表示も写真項目ごと消える（R7.7。
 *     失敗時の表示は受入基準の外で、タスク 21.3 とそれを改めたタスク 23.9 の利用者の判断による）
 * 23b. 写真項目の削除の失敗の長い文言: 区切りの無い英数字の一語と長い和文の理由で、375・320・1280 幅の
 *     いずれでも失敗の表示が写真項目・<main>・文書全体からはみ出さず、モバイル幅で写真項目の操作部品が
 *     44×44 以上を保つ（要件の印は掲げない。タスク 23.9）
 * 23c. 画面の下端の近くでの写真項目の削除の失敗: 375・320 幅で最後の写真項目の削除ボタンが画面の下端の
 *     近くにあるとき、失敗の表示の分だけ画面が下へ動いて表示が画面内に入り、フォーカスは削除ボタンに
 *     ある（要件の印は掲げない。タスク 23.9 の是正 1 巡目、利用者の判断（2026-10-04））
 * 24. 担当でない一般ユーザー: admin が作り、営業担当も工事担当も別人のプロジェクトのアルバムを、
 *     user が一覧から開いて写真項目を見る・原本を開く・写真を追加する・コメントと並び替えを保存
 *     でき、削除の操作手段は表示されない（R1.2, R17.2。アクセスはロールの権限の表だけで判定する
 *     タスク 23.1 の利用者の判断）
 * 25. 写真項目の削除の成功の後の未保存の状態: コメントを編集した写真項目を取り除いたとき、他の
 *     写真項目の編集が残る間は未保存のままで保存はその編集だけを送り、保留が空になれば未保存の
 *     表示が消え「保存」は押せず、ブレッドクラムの遷移で離脱の確認が出ない（R18.3。タスク 23.6）
 * 26. ZIP の一括エクスポートの一部失敗時の継続の選択: 3 件中の写真項目の画像の取得を 404 へ差し替え、
 *     一部失敗では自動でダウンロードせず失敗した写真項目をファイル名と順番で示し、「成功した項目だけで
 *     ダウンロードする」で成功分だけの ZIP（エントリ名で確認）を 1 回ダウンロードし、「ダウンロードしない」
 *     ではダウンロードせずに閉じて次のエクスポートへ持ち越さない。全件成功は即座にダウンロードし、
 *     全件失敗はダウンロードせず失敗の一覧だけを示す。375・320 幅で長いファイル名の一覧と二つの操作が
 *     画面内に収まる（R15.10。タスク 23.4 の利用者の判断（2026-10-03））
 * 27. 通知の枠の通知と失敗の置き換え: 印刷対象 0 件の PDF 出力の通知の後に保存が失敗すると保存の
 *     失敗へ、保存の失敗の後に通知が出ると通知へ置き換わり、通知の枠は常に一つで、消えた後に置き換え
 *     られた古いものが再び現れない（要件の印は掲げない。タスク 22.1 の利用者の判断（2026-10-04））
 * 28. 保存の失敗の保存ボタンの近くの表示: 375・320・1280 幅で保存ボタンを押した直後の位置に、
 *     保存の失敗（role=alert）が画面内に見えて共通ヘッダに覆われず、長い文言でもはみ出さず、
 *     上部の通知の枠は同じ文言を残し、やり直しの成功で消える（要件の印は掲げない。タスク 22.2 の
 *     利用者の判断（2026-10-04））
 * 29. 取り除かれた看板を指定した保存の失敗の文言: 詳細画面を開いた後に API で看板を取り除き、
 *     画面上でその看板の配置を保存すると、保存は 404（SIGNBOARD_NOT_ALLOWED）で失敗し、保存ボタンの
 *     近くと上部の枠に、看板の名前と、取り除かれていること・選び直すか読み込み直すことを示す日本語の
 *     文言が出て、応答の英語の文言と看板の ID は出ない（要件の印は掲げない。タスク 24.2 の利用者の
 *     判断（2026-10-04））
 * 30. 看板の配置のエディタの画像の枠の幅の追従: 実寸の写真（1920×1440）で、375・320 幅では画像の枠が
 *     ダイアログの本体の内側の幅へ縮み、本体と文書全体に水平のはみ出しが無く、1280 幅では従来の幅
 *     600 のまま。320 幅で看板を選んで動かさずに保存した配置は、画像の座標で既定の比率になる
 *     （R19.1, R9.1, R9.3。タスク 25.1 の利用者の判断（2026-10-04））
 *
 * 縮退した要素（理由明記）:
 *  - パンの座標厳密検証: 拡大時に画像 transform の translate 成分が変化することまでを確認し、
 *    ピクセル単位の移動量は検証しない（ビューアの算術は site-survey 基盤の単体テスト責務）。
 *  - ZIP画像の画素検証: ダウンロード発火＋ .zip 非空までを確認し、ZIP内の画像バイト比較は
 *    行わない（再エンコード・重畳はサービス単体テストの責務）。
 *  - beforeunload（R18.1）: 未保存状態で beforeunload の既定動作が抑止されること自体は、synthetic
 *    `beforeunload` イベント dispatch＋`event.defaultPrevented` の検証で担保する（フック
 *    `useUnsavedChanges` が dirty 時に `event.preventDefault()` する挙動を非フレークに観測）。
 *    縮退させるのは「OS ネイティブの離脱確認ダイアログ（Chromium が描画するモーダル）そのものの
 *    表示・ボタン操作」の検証のみで、これは Playwright での自動化が不安定なため対象外とする。
 */

import { test, expect, type Request, type Route } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { loginAsUser, loginWithCredentials } from '../../helpers/auth-actions';
import { getTimeout } from '../../helpers/wait-helpers';
import { selectFirstRealOption } from '../../helpers/form-preconditions';
import { hashPassword, TEST_USERS } from '../../helpers/test-users';
import { getPrismaClient } from '../../fixtures/database';
import { API_BASE_URL } from '../../config';

// ESモジュールでの __dirname 代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_JPG = path.join(__dirname, '../../fixtures/test-image.jpg');
const FIXTURE_PNG = path.join(__dirname, '../../fixtures/test-image.png');

// ============================================================================
// 共通ヘルパー（site-survey / construction-photo-workflow 規約踏襲）
// ============================================================================

/** UIでテスト用プロジェクトを作成し projectId を返す。name を渡すとその名前で作成する。 */
async function createProject(
  page: import('@playwright/test').Page,
  label: string,
  name?: string
): Promise<string> {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /新規作成/i }).click();
  await expect(page).toHaveURL(/\/projects\/new/, { timeout: getTimeout(10000) });
  await expect(page.getByText(/読み込み中/i).first()).not.toBeVisible({
    timeout: getTimeout(15000),
  });

  const projectName = name ?? `工事写真追加E2E_${label}_${Date.now()}`;
  await page.getByRole('textbox', { name: /プロジェクト名/i }).fill(projectName);

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

  await page.waitForURL(/\/projects\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
  const match = page.url().match(/\/projects\/([0-9a-f-]+)$/);
  const projectId = match?.[1];
  expect(projectId).toBeTruthy();
  return projectId!;
}

/** アルバム作成画面から工事写真アルバムを作成し albumId を返す。 */
async function createAlbum(
  page: import('@playwright/test').Page,
  projectId: string,
  name: string
): Promise<string> {
  await page.goto(`/projects/${projectId}/construction-photos/new`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('アルバム名').fill(name);

  const createAlbumPromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/projects\/[0-9a-f-]+\/construction-photos$/.test(response.url()) &&
      (response.status() === 201 || response.status() === 200),
    { timeout: getTimeout(30000) }
  );
  await page.getByRole('button', { name: '作成' }).click();
  const resp = await createAlbumPromise;
  const body = (await resp.json()) as { id: string };
  expect(body.id).toBeTruthy();
  return body.id;
}

/** 詳細画面でローカル画像を1枚アップロードし、写真項目総数が expectedCount になるのを待つ。 */
async function uploadPhoto(
  page: import('@playwright/test').Page,
  file: string,
  expectedCount: number
): Promise<void> {
  const upload = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
    { timeout: getTimeout(30000) }
  );
  await page.getByTestId('file-input').setInputFiles(file);
  await upload;
  await expect(page.getByTestId('construction-photo-item')).toHaveCount(expectedCount, {
    timeout: getTimeout(20000),
  });
}

/** PNG のチャンクの CRC32（site-survey-image-rotation.spec.ts の生成と同じ規約） */
function pngCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc = (c ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * 実寸の大きい写真に当たる PNG を生成する（タスク 25.1）。
 *
 * 既存の `test-image-large.jpg`（1920×1080、約 2MB）は、アップロードの圧縮（300KB 超で品質を
 * 下げ、収まらなければ縮める。要件 4.6）で幅 960 へ縮められて保存されるため、実寸の大きい写真の
 * 前提を作れない。色の区画を並べた低エントロピーの画像にして、圧縮の閾値を下回る大きさで実寸の
 * まま保存させる（前提は写真一覧の API が返す幅で確かめる）。
 */
function buildLargePhotoPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: トゥルーカラー（RGB）
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // フィルタータイプ: None
    const band = Math.floor((y * 4) / height);
    for (let x = 0; x < width; x++) {
      const column = Math.floor((x * 6) / width);
      const pixel = rowStart + 1 + x * 3;
      raw[pixel] = 40 + column * 35;
      raw[pixel + 1] = 60 + band * 45;
      raw[pixel + 2] = 120;
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 四隅の印の色（タスク 26.1）。左上・右上・左下・右下の順 */
const CORNER_MARK_COLORS = {
  topLeft: [220, 40, 40],
  topRight: [40, 200, 60],
  bottomLeft: [40, 60, 220],
  bottomRight: [230, 210, 40],
} as const;
/** 四隅の印以外の地の色（タスク 26.1） */
const CORNER_MARK_BASE: readonly [number, number, number] = [128, 128, 128];
/** 四隅の印の一辺の、写真の幅・高さに対する比（タスク 26.1） */
const CORNER_MARK_RATIO = 0.08;

/**
 * 四隅に色の違う印を置いた PNG を生成する（タスク 26.1）。
 *
 * 印は写真の幅・高さの 8% の矩形で、地は灰色である。写真の全体を敷いた背景なら画像の枠の四隅に
 * 印の色が見える。サムネイル（200×200 の中央の切り抜き）を幅に合わせて敷くと、4:3 の写真では
 * 左右の 12.5% が切り落とされるため、四隅には地の灰色が見える。低エントロピーにして、アップロード
 * の圧縮（要件 4.6）の閾値を下回る大きさで実寸のまま保存させる。
 */
function buildCornerMarkedPhotoPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ: トゥルーカラー（RGB）
  const markWidth = Math.round(width * CORNER_MARK_RATIO);
  const markHeight = Math.round(height * CORNER_MARK_RATIO);
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // フィルタータイプ: None
    const top = y < markHeight;
    const bottom = y >= height - markHeight;
    for (let x = 0; x < width; x++) {
      const left = x < markWidth;
      const right = x >= width - markWidth;
      const color =
        top && left
          ? CORNER_MARK_COLORS.topLeft
          : top && right
            ? CORNER_MARK_COLORS.topRight
            : bottom && left
              ? CORNER_MARK_COLORS.bottomLeft
              : bottom && right
                ? CORNER_MARK_COLORS.bottomRight
                : CORNER_MARK_BASE;
      const pixel = rowStart + 1 + x * 3;
      raw[pixel] = color[0];
      raw[pixel + 1] = color[1];
      raw[pixel + 2] = color[2];
    }
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 工事写真の画像アップロードのエンドポイントの URL 判定。
 *
 * `page.route` / `page.unroute` は同一の参照でのみ対応付くため、判定と応答の差し替えを
 * モジュールスコープの定数として共有する。オリジンではなくパスで判定するのは、CI とローカルで
 * API のオリジンが異なるためである（construction-photo-upload-retry.spec.ts と同じ規約）。
 */
const UPLOAD_URL_MATCHER = (url: URL): boolean =>
  /\/api\/construction-photos\/[^/]+\/images$/.test(url.pathname);

/**
 * アップロードの POST を、サーバーの処理中の失敗（500）の応答へ差し替える。
 * POST 以外（同じパスの一覧取得）は素通しする。
 */
const failUploadPost = async (route: Route): Promise<void> => {
  if (route.request().method() !== 'POST') {
    await route.fallback();
    return;
  }
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'https://architrack.example.com/problems/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'サーバー内部エラーが発生しました',
      code: 'INTERNAL_SERVER_ERROR',
    }),
  });
};

// ============================================================================
// テスト本体
// ============================================================================

test.describe('工事写真 追加機能フロー', () => {
  // DB状態を跨いで共有するためシリアル実行（global-setup で一度だけ初期化）
  test.describe.configure({ mode: 'serial' });

  // ADMIN が所有する共有プロジェクト/アルバム（ビューア・ZIP・未保存・モバイルで再利用）
  let adminProjectId: string | null = null;
  let adminAlbumId: string | null = null;
  const adminAlbumName = `追加機能_共有_${Date.now()}`;

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /**
   * 事前準備: ADMIN で共有プロジェクト＋アルバムを作成し、写真項目を2枚アップロードする。
   */
  test('事前準備: 共有プロジェクト/アルバムを作成し写真を2枚追加する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');

    adminProjectId = await createProject(page, 'admin');
    adminAlbumId = await createAlbum(page, adminProjectId, adminAlbumName);

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: adminAlbumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await uploadPhoto(page, FIXTURE_JPG, 1);
    await uploadPhoto(page, FIXTURE_PNG, 2);
  });

  /**
   * R14.1/R14.2/R14.3/R14.4/R14.5/R14.6:
   * 詳細画面のサムネクリックでフルスクリーンビューアを開き（原本を必要時に取得）、
   * ズームイン・90度回転・拡大時パン・閉じる操作を検証する。
   *
   * @requirement construction-photo/REQ-14.1
   * @requirement construction-photo/REQ-14.2
   * @requirement construction-photo/REQ-14.3
   * @requirement construction-photo/REQ-14.4
   * @requirement construction-photo/REQ-14.5
   * @requirement construction-photo/REQ-14.6
   */
  test('ビューアでズームイン・回転・パン・クローズできる（原本は必要時に取得）', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // R14.6: サムネクリックでビューアへ遷移した「後」にのみ原本（/original）が取得される
    const originalResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/construction-photos\/images\/[0-9a-f-]+\/original$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await items.nth(0).getByTestId('construction-photo-image-button').click();

    // R14.1: フルスクリーンビューア（オーバーレイ）が表示される
    const overlay = page.getByTestId('construction-photo-viewer-overlay');
    await expect(overlay).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page).toHaveURL(/\/construction-photos\/[0-9a-f-]+\/photos\/[0-9a-f-]+$/);

    const resp = await originalResp;
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] ?? '').toMatch(/^image\//);

    // 画像が表示される
    const image = overlay.locator('img').first();
    await expect(image).toBeVisible({ timeout: getTimeout(15000) });

    // R14.2: ズームイン → 倍率バッジが 100% から増加する
    const zoomBadge = page.getByTestId('zoom-badge');
    await expect(zoomBadge).toHaveText('100%');
    await page.getByRole('button', { name: 'ズームイン' }).click();
    await page.getByRole('button', { name: 'ズームイン' }).click();
    await expect(zoomBadge).not.toHaveText('100%', { timeout: getTimeout(10000) });

    // R14.4: 拡大状態でステージをドラッグ → 画像 transform の translate 成分が変化する（パン）
    const stage = page.getByTestId('construction-photo-viewer-stage');
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    const transformBefore = await image.evaluate((el) => (el as HTMLElement).style.transform);
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy - 60, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => image.evaluate((el) => (el as HTMLElement).style.transform), {
        timeout: getTimeout(10000),
      })
      .not.toBe(transformBefore);

    // R14.3: 右回転 → 回転表示が 0° から 90° になる
    const rotation = page.getByTestId('rotation-display');
    await expect(rotation).toHaveText('0°');
    await page.getByRole('button', { name: '右に回転' }).click();
    await expect(rotation).toHaveText('90°', { timeout: getTimeout(10000) });

    // R14.5: 閉じる → ビューア終了・詳細画面へ戻る
    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(overlay).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${adminAlbumId}$`), {
      timeout: getTimeout(10000),
    });
  });

  /**
   * R14.6（＋R14.1）非合成原本エンドポイントの確認:
   * 写真項目に工事看板を配置・保存した「後」でも、ビューアが取得する原本エンドポイント
   * （/original）が 200 で画像を返し、合成印字画像（/print-image）は要求しないことを検証する。
   * （ビューアは常に非合成原本を表示するため、看板配置の有無で取得元は変わらない）
   */
  test('看板配置済みの写真項目でもビューアは原本(/original)を返す（/print-image は使わない）', async ({
    page,
  }) => {
    expect(adminProjectId).toBeTruthy();
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    // 1) 配置用の工事看板を登録
    const signboardName = `追加E2E看板_${Date.now()}`;
    await page.goto(`/projects/${adminProjectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('追加E2E看板現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 2) 詳細画面で先頭写真項目に看板を配置して保存
    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    await items
      .nth(0)
      .getByRole('button', { name: /看板を(配置|変更)/ })
      .click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: signboardName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });

    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 3) 看板割当が保持され、ビューアを開くと /original が返り /print-image は要求されない
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items.nth(0).getByTestId('signboard-indicator')).toContainText('看板あり', {
      timeout: getTimeout(15000),
    });

    let printImageRequested = false;
    const onReq = (req: Request) => {
      if (/\/api\/construction-photos\/images\/[0-9a-f-]+\/print-image$/.test(req.url())) {
        printImageRequested = true;
      }
    };
    page.on('request', onReq);

    const originalResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/construction-photos\/images\/[0-9a-f-]+\/original$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await items.nth(0).getByTestId('construction-photo-image-button').click();
    const overlay = page.getByTestId('construction-photo-viewer-overlay');
    await expect(overlay).toBeVisible({ timeout: getTimeout(15000) });

    const resp = await originalResp;
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type'] ?? '').toMatch(/^image\//);
    await expect(overlay.locator('img').first()).toBeVisible({ timeout: getTimeout(15000) });

    // 非合成原本の確認: ビューアは合成印字画像を取得しない
    expect(printImageRequested).toBe(false);
    page.off('request', onReq);
  });

  /**
   * R15.1/R15.2/R15.3/R15.4/R15.5/R15.8:
   * 全件エクスポートで形式(PNG)・解像度(高)・看板モード(plain)を選択→開始→進捗ダイアログ→
   * ZIPダウンロードを検証する。
   *
   * @requirement construction-photo/REQ-15.1
   * @requirement construction-photo/REQ-15.2
   * @requirement construction-photo/REQ-15.3
   * @requirement construction-photo/REQ-15.4
   * @requirement construction-photo/REQ-15.5
   * @requirement construction-photo/REQ-15.8
   */
  test('ZIP全件エクスポート: 形式/解像度/看板モードを選択して進捗表示のうえダウンロードされる', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    // R15.2/R15.3/R15.4: 形式・解像度・看板モードを選択
    await dialog.getByRole('radio', { name: 'PNG' }).check();
    await dialog.getByRole('radio', { name: '高' }).check();
    await dialog.getByRole('radio', { name: '看板を重畳しない加工画像' }).check();
    await expect(dialog.getByRole('radio', { name: 'PNG' })).toBeChecked();

    // R15.1/R15.5/R15.8: 開始→進捗ダイアログ→ZIPダウンロード
    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await dialog.getByRole('button', { name: '開始' }).click();

    const progress = page.getByRole('dialog', { name: /一括エクスポート/ });
    await expect(progress).toBeVisible({ timeout: getTimeout(10000) });
    await expect(page.getByRole('progressbar', { name: '一括エクスポート進捗' })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    expect(fs.statSync(savedPath).size).toBeGreaterThan(0);
  });

  /**
   * R15.6/R15.7:
   * 選択エクスポートは未選択時に無効化され、写真項目を選択すると有効化されてダウンロードできる。
   *
   * @requirement construction-photo/REQ-15.6
   * @requirement construction-photo/REQ-15.7
   */
  test('ZIP選択エクスポート: 未選択で無効、選択後に有効化されてダウンロードされる', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // R15.7: 未選択時は選択エクスポートが無効
    const selectedExportButton = page.getByRole('button', { name: /選択エクスポート/ });
    await expect(selectedExportButton).toBeDisabled();

    // 1件選択 → 有効化（R15.6）
    await items.nth(0).getByLabel('エクスポート対象に含める').check();
    await expect(selectedExportButton).toBeEnabled({ timeout: getTimeout(10000) });

    await selectedExportButton.click();
    const dialog = page.getByRole('dialog', { name: /選択画像エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await dialog.getByRole('button', { name: '開始' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  /**
   * R15.9:
   * エクスポート進行中に中断すると、処理が中断され中断通知が表示されダウンロードは発生しない。
   * 原本取得（/original）をネットワーク遅延させ、中断操作の時間窓を決定的に確保する。
   *
   * @requirement construction-photo/REQ-15.9
   */
  test('ZIPエクスポートを中断すると中断通知が表示されダウンロードされない', async ({ page }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(2, {
      timeout: getTimeout(20000),
    });

    // 原本取得を遅延させ、中断ボタン押下の時間窓を確保する（plain モードは /original を取得）
    await page.route('**/api/construction-photos/images/*/original', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });

    let downloadHappened = false;
    page.on('download', () => {
      downloadHappened = true;
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await dialog.getByRole('radio', { name: '看板を重畳しない加工画像' }).check();
    await dialog.getByRole('button', { name: '開始' }).click();

    // 進行中に中断
    const cancelButton = page.getByRole('button', { name: '中断' });
    await expect(cancelButton).toBeVisible({ timeout: getTimeout(10000) });
    await cancelButton.click();

    // 中断通知（ダウンロードは発生しない）
    await expect(
      page.getByRole('alert').filter({ hasText: 'エクスポートを中断しました' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    expect(downloadHappened).toBe(false);

    await page.unroute('**/api/construction-photos/images/*/original');
  });

  /**
   * R15.11:
   * 写真項目が0件のアルバムで全件エクスポートを実行すると、非実行で対象が無い旨を通知する。
   *
   * @requirement construction-photo/REQ-15.11
   */
  test('ZIP対象0件のアルバムではエクスポートが非実行で通知される', async ({ page }) => {
    expect(adminProjectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    const emptyAlbumId = await createAlbum(page, adminProjectId!, `追加機能_空_${Date.now()}`);
    await page.goto(`/construction-photos/${emptyAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('写真項目がありません')).toBeVisible({
      timeout: getTimeout(15000),
    });

    let downloadHappened = false;
    page.on('download', () => {
      downloadHappened = true;
    });

    await page.getByRole('button', { name: '全件エクスポート' }).click();

    // 対象0件の通知（親のnotice）と、ダイアログの開始ボタン非活性
    await expect(
      page.getByRole('alert').filter({ hasText: 'エクスポート対象の写真項目がありません' })
    ).toBeVisible({ timeout: getTimeout(15000) });
    const dialog = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(dialog.getByRole('button', { name: '開始' })).toBeDisabled();
    expect(downloadHappened).toBe(false);
  });

  /**
   * R16.1/R16.2/R16.3/R16.4/R16.5（＋R16.6）:
   * 詳細画面のアルバム編集導線→編集画面遷移、削除導線→確認→削除→一覧遷移を検証する。
   * 一覧の行アクション（編集/削除導線）の存在も併せて確認する。
   *
   * @requirement construction-photo/REQ-16.1
   * @requirement construction-photo/REQ-16.2
   * @requirement construction-photo/REQ-16.3
   * @requirement construction-photo/REQ-16.4
   * @requirement construction-photo/REQ-16.5
   * @requirement construction-photo/REQ-16.6
   */
  test('アルバム編集・削除導線: 編集画面遷移／削除確認→削除→一覧遷移、一覧に行アクション導線', async ({
    page,
  }) => {
    expect(adminProjectId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    const disposableName = `追加機能_削除対象_${Date.now()}`;
    const disposableAlbumId = await createAlbum(page, adminProjectId!, disposableName);

    await page.goto(`/construction-photos/${disposableAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: disposableName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // R16.1/R16.2: 編集導線→編集画面へ遷移
    await page.getByRole('button', { name: '編集' }).click();
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${disposableAlbumId}/edit$`), {
      timeout: getTimeout(10000),
    });

    // 詳細へ戻る
    await page.goto(`/construction-photos/${disposableAlbumId}`);
    await page.waitForLoadState('networkidle');

    // R16.3/R16.4: 削除導線→確認ダイアログ
    await page.getByRole('button', { name: '削除' }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(deleteDialog.getByText('アルバムの削除')).toBeVisible();

    // R16.5: 承認→削除→一覧へ遷移
    const deleteResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        /\/api\/construction-photos\/[0-9a-f-]+$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
    await deleteResp;
    await expect(page).toHaveURL(new RegExp(`/projects/${adminProjectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByText(disposableName)).toHaveCount(0, { timeout: getTimeout(15000) });

    // R16.6: 一覧の行アクション導線（共有アルバムの行に編集/削除ボタンが存在する）
    const sharedRow = page.getByRole('row').filter({ hasText: adminAlbumName });
    await expect(sharedRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(sharedRow.getByRole('button', { name: `${adminAlbumName}を編集` })).toBeVisible();
    await expect(sharedRow.getByRole('button', { name: `${adminAlbumName}を削除` })).toBeVisible();
  });

  /**
   * R17.2 権限出し分け:
   * user は削除導線（アルバム削除・写真項目削除）が非表示、編集導線（アルバム編集・アップローダ）は表示。
   * user 自身が所有するプロジェクト/アルバムで検証する（担当でないプロジェクトでの同じ出し分けは、
   * 「担当でない一般ユーザー」のテストが確かめる）。
   *
   * @requirement construction-photo/REQ-17.2
   *
   * タスク 115.188 の是正: construction-photo の受入基準17.1 を名乗る被覆印を取り下げた。
   * 原文17.1 は「ユーザーが**編集権限を持たない**間、編集の操作手段を**表示しない**」だが、
   * 本検証は編集権限を持つ `REGULAR_USER` でログインし、編集導線が**表示される**ことを
   * 主張している。原文の前件（編集権限を持たない）に一度も入らず、結論も逆である。
   * 要件17 に「編集権限を持つとき編集導線を表示する」を述べる条文は無いため付け替え先も無い。
   * 17.1 は本区間が唯一の被覆源だったため、未被覆として露出する。
   */
  test('権限出し分け: user は削除導線が非表示・編集導線は表示される', async ({ page }) => {
    await loginAsUser(page, 'REGULAR_USER');

    const userProjectId = await createProject(page, 'user');
    const userAlbumName = `追加機能_user_${Date.now()}`;
    const userAlbumId = await createAlbum(page, userProjectId, userAlbumName);

    // 写真項目を1枚追加（写真項目削除導線の非表示を確認するため）
    await page.goto(`/construction-photos/${userAlbumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: userAlbumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await uploadPhoto(page, FIXTURE_JPG, 1);

    // R17.1: 編集導線（アルバム編集ボタン・アップローダ）は表示される
    await expect(page.getByRole('button', { name: '編集' })).toBeVisible();
    await expect(page.getByTestId('photo-uploader')).toBeVisible();

    // R17.2: 削除導線（アルバム削除ボタン・写真項目削除ボタン）は非表示
    await expect(page.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /写真項目を削除/ })).toHaveCount(0);

    // R17.2（一覧側）: 行の削除導線は非表示、編集導線は表示
    await page.goto(`/projects/${userProjectId}/construction-photos`);
    await page.waitForLoadState('networkidle');
    const userRow = page.getByRole('row').filter({ hasText: userAlbumName });
    await expect(userRow).toBeVisible({ timeout: getTimeout(15000) });
    await expect(userRow.getByRole('button', { name: `${userAlbumName}を編集` })).toBeVisible();
    await expect(userRow.getByRole('button', { name: `${userAlbumName}を削除` })).toHaveCount(0);
  });

  /**
   * R17.1 権限出し分け（編集権限なし）:
   * `construction_photo:update` を持たないロールで工事写真の詳細画面を開くと、要件17.1 が列挙する
   * 操作手段（写真項目の追加・コメント編集・並び替え・印刷対象変更・看板配置・保存・写真項目削除）が
   * 表示されない。閲覧の要素（アルバム名・写真項目・ファイル名・拡大表示の入口）は表示される。
   *
   * @requirement construction-photo/REQ-17.1
   *
   * 前件「編集権限を持たない」に入るロールは既存のシードに無い（admin は `*:*`、user は
   * `construction_photo:update` を持つ）。そこで本テスト専用の非システムロールを作り、閲覧に
   * 要る権限に `construction_photo:delete` を加え、`construction_photo:update` だけを与えない。
   * 削除権限を与えるのは、写真項目削除の不在を R17.2（削除権限なしで削除ハンドラを渡さない）では
   * なく R17.1（編集権限なしの読み取り専用）に帰属させるためである。削除権限を欠くロールでは
   * 削除ハンドラが渡らないため、読み取り専用の抑止が壊れても削除ボタンは出ず、主張が検出力を
   * 持たない。削除権限で現れるアルバム削除の導線は 17.1 の列挙に無いため主張しない。
   * 閲覧専用の利用者はプロジェクトの担当者（作成者・営業担当・工事担当）に据えない。アクセスは
   * ロールの権限の表だけで判定し、担当者での絞り込みは無い（タスク 23.1 の利用者の判断）。
   * user ロールの権限を書き換えないのは、永続テストDBに権限が固着した
   * 前例（seedRolePermissions の notIn による是正で解消）を再び作らないためである。非システム
   * ロールは cleanDatabase が消すうえ、本テストの finally でも消す。
   * 前件が実際の権限で成り立つことは、詳細画面の読み込みで画面自身が受け取った
   * GET /api/v1/auth/me の permissions を集合として照合して主張する。
   *
   * 偽の緑（画面が描かれていないだけ）を排すため、同じアルバムを admin で開いた対照で、同じ
   * 操作手段がすべて表示される（または操作可能である）ことを先に主張する。
   * コメント欄と印刷対象のチェックは、設計（R17.3 の読み取り専用表示）に従い欄そのものは
   * 表示したまま操作を抑止する実装のため、「操作手段が無い」を編集不能・無効として主張する。
   *
   * 検出力の実測（2026-10-01、タスク 19.1）: `ConstructionPhotoDetailPage.tsx` の `canEdit` を
   * true 固定に変異させた本番ビルドで本テストを実行すると、`photo-uploader` の toHaveCount(0) で
   * 落ちた（Expected 0 / Received 1、1 failed）。変異を戻して作り直すと 1 passed に戻った。
   * この実測は閲覧ロールへ `construction_photo:delete` を加える前の版で行った。
   * 追記（2026-10-01、タスク 19.1 のレビュー差し戻し）: 削除権限を欠く版では、`PhotoItemPanel.tsx` で
   * readOnly でも削除ハンドラがあれば削除の行を出す変異（看板配置は readOnly で隠したまま）を当てた
   * 本番ビルドでも本テストは 1 passed で生き残った（レビュアーの実測）。閲覧ロールへ削除権限を加えた
   * 現行の版で同じ変異を当てて実行すると、`写真項目を削除:` の toHaveCount(0) で落ちた
   * （Expected 0 / Received 1、1 failed）。変異を戻して作り直すと 1 passed に戻った。
   */
  test('権限出し分け: 編集権限の無いロールでは編集系の操作手段が表示されない', async ({ page }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `追加機能_閲覧のみ_${stamp}`;
    const viewerEmail = `cp-viewer-${stamp}@example.com`;
    const viewerPassword = 'ViewerPass123!';
    const viewerRoleName = `e2e_construction_photo_viewer_${stamp}`;
    const viewerPermissionKeys = [
      'construction_photo:read',
      'construction_photo:delete',
      'construction_signboard:read',
      'project:read',
    ];

    /** 詳細画面の読み込みで画面が受け取る /api/v1/auth/me の permissions を得る。 */
    const openDetailAndReadPermissions = async (albumId: string): Promise<string[]> => {
      const meResponse = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname === '/api/v1/auth/me' &&
          r.status() === 200,
        { timeout: getTimeout(30000) }
      );
      await page.goto(`/construction-photos/${albumId}`);
      const body = (await (await meResponse).json()) as { permissions?: string[] };
      await page.waitForLoadState('networkidle');
      expect(Array.isArray(body.permissions)).toBe(true);
      return body.permissions ?? [];
    };

    // 17.1 が列挙する操作手段（詳細画面）
    const photoItems = page.getByTestId('construction-photo-item');
    const uploader = page.getByTestId('photo-uploader');
    const fileInput = page.getByTestId('file-input');
    const commentBox = photoItems.first().getByRole('textbox', { name: 'コメント' });
    const dragHandle = page.getByTestId('construction-photo-drag-handle');
    const orderButtons = page.getByTestId('order-buttons');
    const includeInReport = photoItems.first().getByRole('checkbox', { name: '印刷対象に含める' });
    const assignSignboard = page.getByRole('button', { name: /^看板を(配置|変更): / });
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const deletePhotoItem = page.getByRole('button', { name: /^写真項目を削除: / });

    const cleanupErrors: string[] = [];
    const runCleanup = async (step: () => Promise<unknown>): Promise<void> => {
      try {
        await step();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    };

    let viewerUserId: string | null = null;
    let viewerRoleId: string | null = null;
    try {
      // 準備: admin でプロジェクト・アルバムを作り、写真項目を1枚追加する
      await loginAsUser(page, 'ADMIN_USER');
      const projectId = await createProject(page, 'viewer');
      const albumId = await createAlbum(page, projectId, albumName);

      // 対照: admin（編集権限あり）では同じ操作手段が表示される
      const adminPermissions = await openDetailAndReadPermissions(albumId);
      expect(adminPermissions).toContain('*:*');
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await uploadPhoto(page, FIXTURE_JPG, 1);
      await expect(uploader).toBeVisible();
      await expect(fileInput.first()).toBeAttached();
      await expect(commentBox).toBeEditable();
      await expect(dragHandle).toBeVisible();
      await expect(orderButtons).toBeVisible();
      await expect(includeInReport).toBeEnabled();
      await expect(assignSignboard).toBeVisible();
      await expect(saveButton).toBeVisible();
      await expect(deletePhotoItem).toBeVisible();

      // 編集権限を持たない閲覧専用ロールと利用者を用意する。プロジェクトの担当者には据えない
      // （アクセスはロールの権限の表だけで判定する。タスク 23.1 の利用者の判断）
      const permissions = await prisma.permission.findMany({
        where: {
          OR: viewerPermissionKeys.map((key) => {
            const [resource, action] = key.split(':');
            return { resource, action };
          }),
        },
      });
      expect(permissions.map((p) => `${p.resource}:${p.action}`).sort()).toEqual(
        [...viewerPermissionKeys].sort()
      );
      const viewerRole = await prisma.role.create({
        data: {
          name: viewerRoleName,
          description: 'E2E: 工事写真の閲覧と削除、編集なし（construction-photo/REQ-17.1）',
          isSystem: false,
        },
      });
      viewerRoleId = viewerRole.id;
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: viewerRole.id, permissionId: p.id })),
      });
      const viewer = await prisma.user.create({
        data: {
          email: viewerEmail,
          displayName: 'E2E 閲覧専用',
          passwordHash: await hashPassword(viewerPassword),
        },
      });
      viewerUserId = viewer.id;
      await prisma.userRole.create({ data: { userId: viewer.id, roleId: viewerRole.id } });

      // 閲覧専用の利用者へ切り替える
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await loginWithCredentials(page, viewerEmail, viewerPassword);

      // 前件: 画面が受け取った権限は閲覧に要る権限そのもので、編集権限を含まない
      const viewerPermissions = await openDetailAndReadPermissions(albumId);
      expect([...viewerPermissions].sort()).toEqual([...viewerPermissionKeys].sort());

      // 閲覧の要素は表示される（画面が描かれていることの確認）
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(photoItems).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(
        photoItems.first().getByRole('button', { name: /^画像を拡大表示: / })
      ).toBeVisible();
      await expect(photoItems.first().getByRole('heading', { level: 3 })).toBeVisible();
      await expect(commentBox).toBeVisible();

      // R17.1: 操作手段は表示されない（欄を残す2つは操作できない）
      await expect(uploader).toHaveCount(0);
      await expect(fileInput).toHaveCount(0);
      await expect(commentBox).not.toBeEditable();
      await expect(dragHandle).toHaveCount(0);
      await expect(orderButtons).toHaveCount(0);
      await expect(includeInReport).toBeDisabled();
      await expect(assignSignboard).toHaveCount(0);
      await expect(saveButton).toHaveCount(0);
      await expect(deletePhotoItem).toHaveCount(0);
    } finally {
      // 後始末の失敗が本体の失敗を上書きしないよう、各段を個別に捕まえて記録する
      if (viewerUserId) {
        const id = viewerUserId;
        await runCleanup(() => prisma.user.delete({ where: { id } }));
      }
      if (viewerRoleId) {
        const roleId = viewerRoleId;
        await runCleanup(() => prisma.rolePermission.deleteMany({ where: { roleId } }));
        await runCleanup(() => prisma.role.delete({ where: { id: roleId } }));
      }
    }
    // 本体が成功したときだけ到達する。後始末の失敗はここで失敗として表に出す
    expect(cleanupErrors).toEqual([]);
  });

  /**
   * 看板マスタの権限の出し分け（タスク 23.8）:
   * 看板マスタの画面は、権限の無い操作（新規登録・編集・削除）を表示しない。判定は
   * `useConstructionPhotoPermission`（`usePermission` 経由）の `construction_signboard:*` で行い、
   * 権威はバックエンドの RBAC のままである。
   *
   * @requirement construction-photo/REQ-17.4
   *
   * シードの実際の権限に沿って主張する（前提は画面が受け取った GET /api/v1/auth/me の
   * permissions で確かめ、満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - admin は `*:*` を持ち、三つの操作がすべて表示される（不在の主張が、画面が描かれていない
   *    だけで成り立たないための対照を兼ねる）
   *  - user は `construction_signboard:{create,read,update}` を持ち `construction_signboard:delete` を
   *    持たない。「新規登録」と「編集」は表示され、「削除」だけが表示されない
   *  - 看板の閲覧の権限だけのロール（既存のシードに無いため本テスト専用の非システムロールを作る。
   *    user ロールの権限は書き換えない）では、三つの操作のいずれも表示されず、操作の列も出ない。
   *    一覧そのもの（工事件名）は表示される
   */
  test('権限出し分け: 看板マスタは admin では新規登録・編集・削除を表示し、user では削除を表示せず、閲覧だけのロールではいずれも表示しない', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const signboardName = `看板権限E2E_${stamp}`;
    const viewerEmail = `cs-viewer-${stamp}@example.com`;
    const viewerPassword = 'ViewerPass123!';
    const viewerRoleName = `e2e_construction_signboard_viewer_${stamp}`;
    const viewerPermissionKeys = ['construction_signboard:read', 'project:read'];

    /** 看板マスタを開き、画面の読み込みで画面が受け取る /api/v1/auth/me の permissions を得る。 */
    const openMasterAndReadPermissions = async (projectId: string): Promise<string[]> => {
      const meResponse = page.waitForResponse(
        (r) =>
          r.request().method() === 'GET' &&
          new URL(r.url()).pathname === '/api/v1/auth/me' &&
          r.status() === 200,
        { timeout: getTimeout(30000) }
      );
      await page.goto(`/projects/${projectId}/construction-signboards`);
      const body = (await (await meResponse).json()) as { permissions?: string[] };
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
        timeout: getTimeout(15000),
      });
      expect(Array.isArray(body.permissions)).toBe(true);
      return body.permissions ?? [];
    };

    const switchUser = async (): Promise<void> => {
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
    };

    const newButton = page.getByRole('button', { name: '新規登録' });
    const row = page.getByRole('row').filter({ hasText: signboardName });
    const editButton = row.getByRole('button', { name: '編集', exact: true });
    const deleteButton = row.getByRole('button', { name: '削除', exact: true });
    const actionsHeader = page.getByRole('columnheader', { name: '操作' });

    const cleanupErrors: string[] = [];
    const runCleanup = async (step: () => Promise<unknown>): Promise<void> => {
      try {
        await step();
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    };

    let viewerUserId: string | null = null;
    let viewerRoleId: string | null = null;
    try {
      // admin: 前件（*:*）を確かめ、看板を1件登録し、三つの操作がすべて表示されることを主張する
      await loginAsUser(page, 'ADMIN_USER');
      const projectId = await createProject(page, 'signboard-permission');
      const adminPermissions = await openMasterAndReadPermissions(projectId);
      expect(adminPermissions).toContain('*:*');

      await expect(newButton).toBeVisible();
      await newButton.click();
      await page.getByLabel('工事件名').fill(signboardName);
      await page.getByLabel('工事場所').fill('看板権限E2E現場');
      const createSignboardResp = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          /\/api\/projects\/[0-9a-f-]+\/construction-signboards$/.test(new URL(r.url()).pathname),
        { timeout: getTimeout(30000) }
      );
      await page.getByRole('button', { name: '登録' }).click();
      expect((await createSignboardResp).status()).toBe(201);
      await expect(row).toBeVisible({ timeout: getTimeout(15000) });
      await expect(newButton).toBeVisible();
      await expect(actionsHeader).toBeVisible();
      await expect(editButton).toBeVisible();
      await expect(deleteButton).toBeVisible();

      // user: 前件（看板の作成・閲覧・編集を持ち、削除を持たない）を確かめ、削除だけが表示されない
      await switchUser();
      await loginAsUser(page, 'REGULAR_USER');
      const userPermissions = await openMasterAndReadPermissions(projectId);
      expect(userPermissions).toEqual(
        expect.arrayContaining([
          'construction_signboard:create',
          'construction_signboard:read',
          'construction_signboard:update',
        ])
      );
      expect(userPermissions).not.toContain('construction_signboard:delete');
      expect(userPermissions).not.toContain('*:*');

      await expect(row).toBeVisible({ timeout: getTimeout(15000) });
      await expect(newButton).toBeVisible();
      await expect(actionsHeader).toBeVisible();
      await expect(editButton).toBeVisible();
      await expect(deleteButton).toHaveCount(0);

      // 看板の閲覧の権限だけのロールと利用者を用意する
      const permissions = await prisma.permission.findMany({
        where: {
          OR: viewerPermissionKeys.map((key) => {
            const [resource, action] = key.split(':');
            return { resource, action };
          }),
        },
      });
      expect(permissions.map((p) => `${p.resource}:${p.action}`).sort()).toEqual(
        [...viewerPermissionKeys].sort()
      );
      const viewerRole = await prisma.role.create({
        data: {
          name: viewerRoleName,
          description: 'E2E: 工事看板の閲覧のみ（construction-photo/REQ-17.4, タスク 23.8）',
          isSystem: false,
        },
      });
      viewerRoleId = viewerRole.id;
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: viewerRole.id, permissionId: p.id })),
      });
      const viewer = await prisma.user.create({
        data: {
          email: viewerEmail,
          displayName: 'E2E 看板閲覧専用',
          passwordHash: await hashPassword(viewerPassword),
        },
      });
      viewerUserId = viewer.id;
      await prisma.userRole.create({ data: { userId: viewer.id, roleId: viewerRole.id } });

      // 閲覧だけのロール: 前件（画面が受け取った権限が閲覧の権限そのもの）を確かめ、いずれも表示しない
      await switchUser();
      await loginWithCredentials(page, viewerEmail, viewerPassword);
      const viewerPermissions = await openMasterAndReadPermissions(projectId);
      expect([...viewerPermissions].sort()).toEqual([...viewerPermissionKeys].sort());

      await expect(row).toBeVisible({ timeout: getTimeout(15000) });
      await expect(newButton).toHaveCount(0);
      await expect(actionsHeader).toHaveCount(0);
      await expect(page.getByRole('button', { name: '編集', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);
    } finally {
      // 後始末の失敗が本体の失敗を上書きしないよう、各段を個別に捕まえて記録する
      if (viewerUserId) {
        const id = viewerUserId;
        await runCleanup(() => prisma.user.delete({ where: { id } }));
      }
      if (viewerRoleId) {
        const roleId = viewerRoleId;
        await runCleanup(() => prisma.rolePermission.deleteMany({ where: { roleId } }));
        await runCleanup(() => prisma.role.delete({ where: { id: roleId } }));
      }
    }
    // 本体が成功したときだけ到達する。後始末の失敗はここで失敗として表に出す
    expect(cleanupErrors).toEqual([]);
  });

  /**
   * 担当でない一般ユーザー（タスク 23.1）:
   * admin が作り、営業担当も工事担当も admin のプロジェクトのアルバムを、user（担当者のいずれでもない
   * 一般ユーザー）がアルバムの一覧から開く。詳細画面にアルバムの基本情報と写真項目が表示され（R1.2）、
   * 権限の表が user に許す操作——原本の表示・写真の追加・コメントと並び替えの保存——ができ、許さない
   * 操作（削除）の操作手段は表示されない（R17.2）。
   *
   * @requirement construction-photo/REQ-1.2
   * @requirement construction-photo/REQ-17.2
   *
   * 経緯: タスク 23.1 の前は、写真一覧・メタの一括更新・並び替え・写真項目の削除・印字画像・原本だけが
   * プロジェクトの担当者（作成者・営業担当・工事担当）と admin に限られていた。担当でない user には
   * アルバムの一覧と取得・アップロードは通る一方で、写真一覧が 404 になり、詳細画面は英語の
   * not found の文言を出して写真項目 0 件になっていた。利用者の判断で、アクセスはロールの権限の表
   * （RBAC）だけで判定する。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - プロジェクトの作成者・営業担当・工事担当のいずれも user ではない（DB で確かめる。
   *    `createProject` は営業担当に先頭の利用者を選ぶため、admin を営業担当に据え直す）
   *  - 画面が受け取った user の権限は閲覧・作成・編集を含み、削除を含まない（権限の表の user の行）
   *  - 削除の操作手段の不在を主張する前に、同じ画面を admin で開くと写真項目の削除の操作手段が
   *    表示されることを確かめる（不在の主張が、画面が描かれていないだけで成り立たないように）
   */
  test('担当でない一般ユーザーが他の利用者のプロジェクトのアルバムを一覧から開き、写真項目の閲覧・追加・コメントと並び替えの保存ができ、削除の操作手段は表示されない', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `追加機能_担当外_${stamp}`;
    const comment = `担当でない利用者のコメント_${stamp}`;

    const photoItems = page.getByTestId('construction-photo-item');
    const deletePhotoItem = page.getByRole('button', { name: /^写真項目を削除: / });
    const commentBox = photoItems.first().getByRole('textbox', { name: 'コメント' });
    const saveButton = page.getByRole('button', { name: '保存', exact: true });

    // 準備: admin がプロジェクト・アルバムを作り、写真項目を1枚追加する
    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'outsider');
    const albumId = await createAlbum(page, projectId, albumName);
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await uploadPhoto(page, FIXTURE_JPG, 1);
    // 対照: 削除の権限を持つ admin には写真項目の削除の操作手段が表示される
    await expect(deletePhotoItem).toHaveCount(1);
    const firstPhotoId = await photoItems.first().getAttribute('data-photo-id');
    expect(firstPhotoId).toBeTruthy();

    // 前提: user はプロジェクトの担当者のいずれでもない
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.ADMIN_USER.email },
    });
    const regularUser = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.REGULAR_USER.email },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { salesPersonId: adminUser.id, constructionPersonId: null },
    });
    const assignees = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { createdById: true, salesPersonId: true, constructionPersonId: true },
    });
    expect(assignees).toEqual({
      createdById: adminUser.id,
      salesPersonId: adminUser.id,
      constructionPersonId: null,
    });
    expect(regularUser.id).not.toBe(adminUser.id);

    // user へ切り替え、アルバムの一覧を開く
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, 'REGULAR_USER');
    const meResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === '/api/v1/auth/me' &&
        r.status() === 200,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/projects/${projectId}/construction-photos`);
    const me = (await (await meResponse).json()) as { permissions?: string[] };
    await page.waitForLoadState('networkidle');

    // 前提: 画面が受け取った権限は、閲覧・作成・編集を含み、削除を含まない
    expect(Array.isArray(me.permissions)).toBe(true);
    expect(me.permissions).toEqual(
      expect.arrayContaining([
        'construction_photo:read',
        'construction_photo:create',
        'construction_photo:update',
      ])
    );
    expect(me.permissions).not.toContain('construction_photo:delete');
    expect(me.permissions).not.toContain('*:*');

    // 一覧の行から詳細画面を開く。写真一覧の取得は 200 である
    const listResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/construction-photos/${albumId}/images`,
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId(`album-row-${albumId}`).click();
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${albumId}$`), {
      timeout: getTimeout(15000),
    });
    expect((await listResponse).status()).toBe(200);

    // R1.2: アルバムの基本情報と写真項目の一覧が表示される
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(photoItems).toHaveCount(1, { timeout: getTimeout(20000) });
    await expect(photoItems.first()).toHaveAttribute('data-photo-id', firstPhotoId!);
    await expect(photoItems.first().getByRole('heading', { level: 3 })).toBeVisible();

    // R17.2: 削除の権限を持たないため、写真項目の削除とアルバムの削除の操作手段は表示されない
    await expect(deletePhotoItem).toHaveCount(0);
    await expect(page.getByRole('button', { name: '削除', exact: true })).toHaveCount(0);

    // 原本の表示: ビューアが取得する原本は 200 で画像を返す
    const originalResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/construction-photos/images/${firstPhotoId}/original`,
      { timeout: getTimeout(30000) }
    );
    await photoItems.first().getByTestId('construction-photo-image-button').click();
    await expect(page.getByTestId('construction-photo-viewer-overlay')).toBeVisible({
      timeout: getTimeout(15000),
    });
    const original = await originalResponse;
    expect(original.status()).toBe(200);
    expect(original.headers()['content-type'] ?? '').toMatch(/^image\//);
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(photoItems).toHaveCount(1, { timeout: getTimeout(20000) });

    // 写真の追加: アップロードは 201 で、写真項目が 2 件になる
    const uploadResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/construction-photos/${albumId}/images`,
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles(FIXTURE_PNG);
    expect((await uploadResponse).status()).toBe(201);
    await expect(photoItems).toHaveCount(2, { timeout: getTimeout(20000) });
    const secondPhotoId = await photoItems.nth(1).getAttribute('data-photo-id');
    expect(secondPhotoId).toBeTruthy();

    // コメントの編集と並び替え（2 件目を先頭へ）を、1 回の保存で確定する
    await commentBox.fill(comment);
    await photoItems.nth(1).getByRole('button', { name: '上へ移動' }).click();
    await expect(photoItems.first()).toHaveAttribute('data-photo-id', secondPhotoId!);
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    const batchResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === '/api/construction-photos/images/batch',
      { timeout: getTimeout(30000) }
    );
    const orderResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === `/api/construction-photos/${albumId}/images/order`,
      { timeout: getTimeout(30000) }
    );
    await saveButton.click();
    const [batch, order] = await Promise.all([batchResponse, orderResponse]);
    expect(batch.status()).toBe(200);
    expect(order.status()).toBe(204);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 永続化: 読み込み直しても並び順とコメントが保たれている
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(photoItems).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(photoItems.nth(0)).toHaveAttribute('data-photo-id', secondPhotoId!);
    await expect(photoItems.nth(1)).toHaveAttribute('data-photo-id', firstPhotoId!);
    await expect(photoItems.nth(1).getByRole('textbox', { name: 'コメント' })).toHaveValue(comment);
    // 写真項目が増えても、削除の操作手段は表示されないまま
    await expect(deletePhotoItem).toHaveCount(0);
  });

  /**
   * R18.2/R18.3 未保存離脱警告:
   * 未保存状態でアプリ内遷移を試みると確認ダイアログが表示され「とどまる」で残留する。
   * 保存後は未保存状態が解消され、以降の遷移では警告が出ない。
   * （R18.1 のブラウザreload/close は beforeunload 実装済みだが Playwright での検証はフレークのため
   *  同一の未保存状態を in-app 遷移ガードで観測する）
   *
   * @requirement construction-photo/REQ-18.2
   * @requirement construction-photo/REQ-18.3
   */
  test('未保存離脱警告: 変更ありのアプリ内遷移で確認→とどまる、保存後は警告なし', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 未保存の変更を発生させる（印刷対象チェック）
    await items.nth(1).getByLabel('印刷対象に含める').check();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // R18.2: ブレッドクラムの一覧リンクでアプリ内遷移 → 確認ダイアログ（遷移はブロックされる）
    await page.getByRole('link', { name: '工事写真一覧' }).click();
    const unsavedDialog = page.getByRole('dialog');
    await expect(unsavedDialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(
      unsavedDialog.getByText('変更が保存されていません。ページを離れますか？')
    ).toBeVisible();

    // とどまる → 詳細画面に残留
    await unsavedDialog.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(unsavedDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${adminAlbumId}$`));

    // R18.3: 保存で未保存状態を解消
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 保存後は警告なしでアプリ内遷移できる
    await page.getByRole('link', { name: '工事写真一覧' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${adminProjectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });
  });

  /**
   * R18.1 未保存離脱警告（ブラウザ reload/タブ閉じ = beforeunload）:
   * 未保存状態のときに beforeunload の既定動作が抑止（＝離脱警告が発火）され、保存で解除される
   * ことを検証する。ConstructionPhotoDetailPage は task 12.5 で `useUnsavedChanges` に移行済みで、
   * 同フックは dirty のとき `window` の `beforeunload` で `event.preventDefault()` を呼ぶ。
   * ネイティブ離脱ダイアログの自動化はフレークのため、site-survey-responsive.spec.ts の確立済み
   * パターンに倣い、synthetic な `beforeunload` イベントを dispatch して `event.defaultPrevented`
   * を観測する（非フレーク）。OS ネイティブモーダルの描画・操作自体は対象外（縮退の趣旨を限定）。
   *
   * R7.1: コメント入力→blurで当該写真項目のコメントが未保存状態として保持される（dirty表示）。
   *
   * @requirement construction-photo/REQ-18.1
   * @requirement construction-photo/REQ-7.1
   */
  test('未保存離脱警告(beforeunload): 変更ありで離脱警告が発火し、保存後は解除される', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });

    // 編集前（未保存変更なし）: beforeunload の既定動作は抑止されない（離脱警告なし）
    const warnBeforeEdit = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnBeforeEdit).toBe(false);

    // 未保存変更を発生させる（コメント入力＋blurで即時に未保存状態を確定）。
    // 直前のシリアルテストの状態に依存しないよう一意のコメントで確実に変更を生じさせる。
    const uniqueComment = `beforeunload検証_${Date.now()}`;
    const textarea = items.nth(0).getByPlaceholder('コメントを入力...');
    await textarea.click();
    await textarea.fill(uniqueComment);
    await textarea.blur();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // R18.1: 未保存変更がある間は beforeunload の既定動作が抑止される（＝離脱警告が発火）
    const warnWhileDirty = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnWhileDirty).toBe(true);

    // 一括保存（PATCH /api/construction-photos/images/batch）で未保存状態を解消
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // R18.1: 保存後は beforeunload の既定動作抑止が解除される（離脱警告なし）
    const warnAfterSave = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnAfterSave).toBe(false);
  });

  /**
   * タスク 24.5 保存の実行中の編集:
   * 保存の要求（PATCH /api/construction-photos/images/batch）の応答を遅らせ、その間に同じ写真項目の
   * コメントを編集する。保存の成功の後も、実行中の編集は未保存として残り（表示・離脱の警告・
   * アプリ内遷移の確認）、次の保存でその編集が送られ、読み込み直しても反映されている。
   * 変更前は成功の後に保留をすべて消したため、表示は編集されたままなのに未保存が解消していた。
   *
   * @requirement construction-photo/REQ-18.1
   * @requirement construction-photo/REQ-18.3
   */
  test('保存の実行中にコメントを編集すると、保存の成功の後も未保存のまま残り、再保存で反映される', async ({
    page,
  }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    const textarea = items.nth(0).getByPlaceholder('コメントを入力...');
    const stamp = Date.now();
    const sentComment = `送った編集_${stamp}`;
    const inflightComment = `実行中の編集_${stamp}`;

    await textarea.click();
    await textarea.fill(sentComment);
    await textarea.blur();
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // 保存の要求を手元で止める（パス基準で判定する）
    let releaseBatch: () => void = () => {};
    const batchGate = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    const isBatchPath = (url: string): boolean =>
      new URL(url).pathname === '/api/construction-photos/images/batch';
    // unroute は参照の等価で照合するため、route と同じ述語を渡す
    const batchRouteMatcher = (url: URL): boolean => isBatchPath(url.toString());
    await page.route(batchRouteMatcher, async (route) => {
      if (route.request().method() === 'PATCH') {
        await batchGate;
      }
      await route.continue();
    });

    const firstRequest = page.waitForRequest(
      (r) => r.method() === 'PATCH' && isBatchPath(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const firstBody = (await firstRequest).postDataJSON() as {
      items: Array<{ id: string; comment?: string | null }>;
    };
    expect(firstBody.items.map((item) => item.comment)).toContain(sentComment);
    await expect(page.getByRole('button', { name: '保存中...' })).toBeVisible();

    // 保存の要求の実行中に同じ写真項目のコメントを編集する
    await textarea.click();
    await textarea.fill(inflightComment);
    await textarea.blur();

    const firstResponse = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && isBatchPath(r.url()),
      { timeout: getTimeout(30000) }
    );
    releaseBatch();
    expect((await firstResponse).ok()).toBe(true);
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 成功の後も実行中の編集は未保存のまま残る（表示・離脱の警告・アプリ内遷移の確認）
    await expect(textarea).toHaveValue(inflightComment);
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    const warnAfterFirstSave = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warnAfterFirstSave).toBe(true);
    await page.getByRole('link', { name: '工事写真一覧' }).click();
    const unsavedDialog = page.getByRole('dialog');
    await expect(unsavedDialog).toBeVisible({ timeout: getTimeout(10000) });
    await unsavedDialog.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(unsavedDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${adminAlbumId}$`));

    // 再保存で実行中の編集が送られ、未保存が解消する
    await page.unroute(batchRouteMatcher);
    const secondRequest = page.waitForRequest(
      (r) => r.method() === 'PATCH' && isBatchPath(r.url()),
      { timeout: getTimeout(30000) }
    );
    const secondResponse = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && isBatchPath(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const secondBody = (await secondRequest).postDataJSON() as {
      items: Array<{ id: string; comment?: string | null }>;
    };
    expect(secondBody.items.map((item) => item.comment)).toEqual([inflightComment]);
    expect((await secondResponse).ok()).toBe(true);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    // 読み込み直しても実行中の編集が保存されている
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    await expect(items.nth(0).getByPlaceholder('コメントを入力...')).toHaveValue(inflightComment);
  });

  /**
   * R19.1/R19.2（＋R19.4）モバイル縦積み:
   * 狭幅（375px）で詳細画面を表示し、横スクロールが発生せず、写真項目が縦積み（column）で
   * 配置されることを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   * @requirement construction-photo/REQ-19.2
   * @requirement construction-photo/REQ-19.1
   *
   * タスク 115.188 の是正: 従前は REQ-19.4 を名乗っていたが、受入基準19.4 の原文は「The 工事写真機能
   * shall ブレッドクラムをモバイルで水平オーバーフローさせず表示する」である。本区間の表題・本文が述べる内容に対応するのは受入基準19.1（「While
   * 画面幅がモバイル相当である, the 工事写真機能 shall 工事写真詳細画面を横スクロールが発生しないレイアウトで表示する」
   * ）である。
   */
  test('モバイル狭幅で横スクロールなし・写真項目が縦積みで表示される', async ({ page }) => {
    expect(adminAlbumId).toBeTruthy();
    await loginAsUser(page, 'ADMIN_USER');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${adminAlbumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    await expect(items.first()).toBeVisible({ timeout: getTimeout(20000) });

    // 測定ゲート（フレーク是正）: `useMediaQuery` は初期レンダリングで isMobile=false（デスクトップ、
    // 写真列 320px 固定）になり得て、effect 後に true（モバイル、縦積み・可変幅）へ確定する。
    // `networkidle` 到達時に稀にこの一過性デスクトップフラッシュを測ると overflow≈25px（デスクトップ
    // 幅相当の一過性はみ出し）を拾ってフレークする。そのため overflow を測る「前」に、写真項目が
    // 縦積み（flex-direction: column = isMobile 分岐＝containerMobile/imageSectionMobile を含む
    // モバイルスタイル一式が適用済み）に確定するまで決定的に待機し、レイアウト確定後の steady-state を
    // 測定する（順序: 「column適用待ち」→「overflow測定」）。閾値（≤1）は据え置き。
    await expect
      .poll(
        async () =>
          items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
        { timeout: getTimeout(15000) }
      )
      .toBe('column');

    // R19.1/R19.4: 工事写真詳細画面のレイアウトで横スクロールが発生しない（許容誤差1px）。
    // 判定対象は工事写真機能が描画する詳細コンテナ（写真項目を含む <main>）に限定する。
    // 本テストを書いた時点では、ページ全体（document）がアプリ共通ヘッダ（app-header-nav 等の
    // 全画面共通クロム。工事写真機能=Req14〜19 の範囲外）によって狭幅で水平にはみ出していたため、
    // 当該機能のコンテナ基準で検証した。共通ヘッダは user-authentication の Task 39.1 で是正済みで
    // あり、文書全体（documentElement）の主張は末尾の「文書全体を水平にはみ出させない」のテストが
    // 担う（タスク 21.1）。
    const detailOverflow = await page.evaluate(() => {
      const item = document.querySelector('[data-testid="construction-photo-item"]');
      const main = item ? item.closest('main') : document.querySelector('main');
      return main ? main.scrollWidth - main.clientWidth : -1;
    });
    expect(detailOverflow).toBeGreaterThanOrEqual(0);
    expect(detailOverflow).toBeLessThanOrEqual(1);

    // R19.2: 写真項目が縦積み（flex-direction: column）— 上の測定ゲートで確定済みを明示的に再確認
    const flexDirection = await items
      .first()
      .evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection);
    expect(flexDirection).toBe('column');
  });

  /**
   * R19.3 モバイル幅の写真項目の操作コントロールのタップ領域:
   * 375 幅と 320 幅で工事写真の詳細画面を開き、写真項目の看板の操作ボタンが、表示の文言の二つの
   * 状態（看板を指定していない写真項目の「看板を配置」と、指定済みの写真項目の「看板を変更」）の
   * どちらでも、44×44 論理ピクセル以上のタップ領域で描かれることを実ブラウザの外接矩形で検証する。
   * 同じ写真項目の他の操作コントロール（ドラッグハンドル・上へ移動・下へ移動・二つのチェック
   * ボックス・写真項目を取り除くボタン）にも同じ下限を課す。
   *
   * @requirement construction-photo/REQ-19.3
   *
   * 経緯（2026-10-02、タスク 21.2）: 看板の操作ボタン（`PhotoItemPanel.tsx` の
   * `styles.assignSignboardButton`）だけがモバイル用の上書きを持たず、375 幅で 78×28 だった。
   * 利用者の判断（2026-10-02）で受入基準 19.3 の対象に含め、他の操作コントロールと同じ上書き
   * （`utils/tap-target` の下限を min-width / min-height に課す形）を足した。単体テストは
   * インラインスタイルの値しか見られない（jsdom はレイアウトを持たない）ため、実寸はここで測る。
   *
   * 44 は本テストが自前で綴る。受入基準 19.3 は寸法を課さず、44 の根拠は `.kiro/steering/tech.md` の
   * 「モバイルの下限値」（WCAG 2.2 SC 2.5.5）という外部の下限である。実装の定数を取り込むと、主張が
   * 「実装は実装に等しい」へ弱まる（`frontend/src/utils/tap-target.ts` の冒頭の切り分け）。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が設定した幅に一致し、写真項目が縦積みのモバイル分岐に確定している。
   *  - 写真項目が 2 件あり、看板の操作ボタンがどちらにも表示されている。看板を指定して保存した
   *    写真項目は「看板あり」の表示を持ち、ボタンの文言が「看板を変更」である。もう一方は「看板あり」の
   *    表示を持たず、文言が「看板を配置」である。
   *  - 他の操作コントロールが写真項目ごとに 6 個そろっている（測り漏らしを緑に数えない）。
   *
   * 併せて、上書きが写真項目の配置を崩さないことを主張する。看板の操作ボタンと隣の取り除くボタンの
   * 外接矩形が重ならないこと、どちらも写真項目の箱の左右の内側にあること、写真項目と <main> に
   * 水平のはみ出しが無いこと（許容誤差 1px）である。看板を指定する側の写真項目には、区切りの無い
   * 現実的な長さのファイル名を与える（タスク 20.3 が是正した見出しと同じ条件）。
   *
   * 二つの幅・二つの状態をすべて測ってから主張する。赤になるときに、どの状態が何 px だったかを
   * 一度の失敗で読めるようにするためである。
   *
   * 是正の経緯（2026-10-02、タスク 21.2）: 上書きを足す前の本番ビルドでは赤だった。看板の操作
   * ボタンは 375 幅・320 幅とも、二つの文言のどちらでも幅 78・高さ 28 で、高さが下限に届かない。
   * 他の操作コントロールは是正前から 44×44 である。
   */
  test('モバイル幅（375・320）で写真項目の看板の操作ボタンが「看板を配置」「看板を変更」のどちらの表示でも 44×44 以上のタップ領域を持つ', async ({
    page,
  }) => {
    // 検証の側の下限。実装の定数は取り込まない（上の注記）
    const TAP_TARGET_MIN_PX = 44;
    const HORIZONTAL_TOLERANCE_PX = 1;
    const stamp = Date.now();
    const signboardName = `タップ領域E2E看板_${stamp}`;
    const assignedFileName = `IMG_20261002_101500_signboard_assigned_${stamp}.jpg`;
    const unassignedFileName = `unassigned_${stamp}.jpg`;

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'tap-target');
    const albumId = await createAlbum(page, projectId, `タップ領域_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('タップ領域E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    // 写真項目を 2 件追加し、片方にだけ看板を指定して保存する（デスクトップ幅で行う）
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    for (const [index, name] of [assignedFileName, unassignedFileName].entries()) {
      const upload = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await upload;
      await expect(items).toHaveCount(index + 1, { timeout: getTimeout(20000) });
    }
    const assignedItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: assignedFileName }),
    });
    const unassignedItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: unassignedFileName }),
    });
    await expect(assignedItem).toHaveCount(1);
    await expect(unassignedItem).toHaveCount(1);
    // 看板の操作ボタンのアクセシブルネームは、文言の状態によらず「看板を配置: <ファイル名>」である
    const assignedButton = assignedItem.getByRole('button', {
      name: `看板を配置: ${assignedFileName}`,
    });
    const unassignedButton = unassignedItem.getByRole('button', {
      name: `看板を配置: ${unassignedFileName}`,
    });

    await assignedButton.click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: signboardName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    const batchResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await batchResp;
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    interface Rect {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }
    interface ItemMeasurement {
      label: string;
      viewportWidth: number;
      item: Rect & { scrollWidth: number; clientWidth: number };
      main: { scrollWidth: number; clientWidth: number } | null;
      signboardButton: Rect | null;
      removeButton: Rect | null;
      others: Array<{ name: string; rect: Rect }>;
    }
    const measurements: ItemMeasurement[] = [];

    /** 写真項目の操作コントロールの外接矩形を測る。 */
    const measureItem = async (
      item: import('@playwright/test').Locator,
      label: string
    ): Promise<void> => {
      const m = await item.evaluate((el) => {
        const rect = (target: Element) => {
          const r = target.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const optionalRect = (target: Element | null) => (target ? rect(target) : null);
        const main = el.closest('main');
        const others = [
          ...Array.from(el.querySelectorAll('[data-testid="construction-photo-drag-handle"]')),
          ...Array.from(el.querySelectorAll('[data-testid="order-buttons"] button')),
          ...Array.from(el.querySelectorAll('input[type="checkbox"]')),
          ...Array.from(el.querySelectorAll('button[aria-label^="写真項目を削除: "]')),
        ];
        return {
          viewportWidth: window.innerWidth,
          item: { ...rect(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
          main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
          signboardButton: optionalRect(el.querySelector('button[aria-label^="看板を配置: "]')),
          removeButton: optionalRect(el.querySelector('button[aria-label^="写真項目を削除: "]')),
          others: others.map((control) => ({
            name: control.getAttribute('aria-label') ?? control.tagName,
            rect: rect(control),
          })),
        };
      });
      measurements.push({ label, ...m });
    };

    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(items, `${width} 幅`).toHaveCount(2, { timeout: getTimeout(20000) });
      // 前提: 写真項目が縦積みのモバイル分岐に確定している（`useMediaQuery` は初期描画で
      // デスクトップ側になり得る）
      for (const item of [assignedItem, unassignedItem]) {
        await expect
          .poll(
            async () => item.evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
            {
              message: `${width} 幅`,
              timeout: getTimeout(15000),
            }
          )
          .toBe('column');
      }
      // 前提: 看板の操作ボタンが二つの文言の状態をそれぞれ表示している
      await expect(assignedItem.getByTestId('signboard-indicator'), `${width} 幅`).toContainText(
        '看板あり'
      );
      await expect(unassignedItem.getByTestId('signboard-indicator'), `${width} 幅`).toHaveCount(0);
      await expect(assignedButton, `${width} 幅`).toBeVisible();
      await expect(assignedButton, `${width} 幅`).toHaveText('看板を変更');
      await expect(unassignedButton, `${width} 幅`).toBeVisible();
      await expect(unassignedButton, `${width} 幅`).toHaveText('看板を配置');

      await measureItem(assignedItem, `${width} 幅・「看板を変更」`);
      await measureItem(unassignedItem, `${width} 幅・「看板を配置」`);
    }
    await page.setViewportSize(desktopViewport!);

    // 二つの幅・二つの状態をすべて測れている（測り漏らした状態を緑に数えない）
    expect(measurements.map((m) => m.label)).toEqual([
      '375 幅・「看板を変更」',
      '375 幅・「看板を配置」',
      '320 幅・「看板を変更」',
      '320 幅・「看板を配置」',
    ]);

    const size = (r: Rect): string => `${r.width}×${r.height}`;
    const report = measurements
      .map(
        (m) =>
          `${m.label}: 看板の操作ボタン ${m.signboardButton ? size(m.signboardButton) : 'なし'}` +
          `（左 ${m.signboardButton?.left}・右 ${m.signboardButton?.right}）、` +
          `取り除くボタン ${m.removeButton ? size(m.removeButton) : 'なし'}` +
          `（左 ${m.removeButton?.left}・右 ${m.removeButton?.right}）、` +
          `写真項目 左 ${m.item.left}・右 ${m.item.right}・${m.item.scrollWidth}/${m.item.clientWidth}、` +
          `<main> ${m.main?.scrollWidth}/${m.main?.clientWidth}、` +
          `他の操作コントロール ${m.others.map((o) => `${o.name} ${size(o.rect)}`).join('・')}`
      )
      .join(' ｜ ');
    const tooSmall = (r: Rect): boolean =>
      r.width < TAP_TARGET_MIN_PX || r.height < TAP_TARGET_MIN_PX;

    // 前提: 画面幅が設定した幅であり、測る対象がすべて在る
    expect(
      measurements.map((m) => m.viewportWidth),
      report
    ).toEqual([375, 375, 320, 320]);
    for (const m of measurements) {
      expect(m.signboardButton, `${m.label} ｜ ${report}`).not.toBeNull();
      expect(m.removeButton, `${m.label} ｜ ${report}`).not.toBeNull();
      expect(m.main, `${m.label} ｜ ${report}`).not.toBeNull();
      expect(m.main!.clientWidth, `${m.label} ｜ ${report}`).toBeGreaterThan(0);
      // ドラッグハンドル 1・並び替え 2・チェックボックス 2・取り除くボタン 1
      expect(m.others, `${m.label} ｜ ${report}`).toHaveLength(6);
    }

    // R19.3: 看板の操作ボタンのタップ領域が、二つの文言のどちらでも 44×44 以上である
    expect(
      measurements
        .filter((m) => tooSmall(m.signboardButton!))
        .map((m) => `${m.label}: ${size(m.signboardButton!)}`),
      report
    ).toEqual([]);
    // R19.3: 同じ写真項目の他の操作コントロールのタップ領域も 44×44 以上である
    expect(
      measurements.flatMap((m) =>
        m.others.filter((o) => tooSmall(o.rect)).map((o) => `${m.label}: ${o.name} ${size(o.rect)}`)
      ),
      report
    ).toEqual([]);

    // 上書きが配置を崩さない: 看板の操作ボタンと隣の取り除くボタンが重ならない
    expect(
      measurements
        .filter((m) => {
          const a = m.signboardButton!;
          const b = m.removeButton!;
          return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        })
        .map((m) => m.label),
      report
    ).toEqual([]);
    // 上書きが配置を崩さない: 二つのボタンが写真項目の箱の左右の内側にある
    expect(
      measurements
        .filter((m) =>
          [m.signboardButton!, m.removeButton!].some(
            (r) =>
              r.left < m.item.left - HORIZONTAL_TOLERANCE_PX ||
              r.right > m.item.right + HORIZONTAL_TOLERANCE_PX
          )
        )
        .map((m) => m.label),
      report
    ).toEqual([]);
    // 上書きが配置を崩さない: 写真項目と <main> に水平のはみ出しが無い（許容誤差1px）
    expect(
      measurements
        .filter(
          (m) =>
            m.item.scrollWidth - m.item.clientWidth > HORIZONTAL_TOLERANCE_PX ||
            m.main!.scrollWidth - m.main!.clientWidth > HORIZONTAL_TOLERANCE_PX
        )
        .map((m) => m.label),
      report
    ).toEqual([]);
  });

  /**
   * R19.3 モバイル幅の看板の配置のダイアログの操作ボタンのタップ領域:
   * 375 幅と 320 幅で工事写真の詳細画面から看板の配置のダイアログを開き、ダイアログの操作ボタン
   * （ダイアログの末尾の「キャンセル」と、配置エディタの操作列の「保存」）が、44×44 論理ピクセル
   * 以上のタップ領域で描かれることを実ブラウザの外接矩形で検証する。看板が「未指定」の状態（開いた
   * 直後）と、看板を選んだ状態（操作列に看板のバッジと案内文が並ぶ）の両方で測る。
   *
   * @requirement construction-photo/REQ-19.3
   *
   * 経緯（2026-10-04、タスク 24.3）: ダイアログの「キャンセル」（`SignboardAssignDialog.tsx` の
   * `styles.cancelButton`）と「保存」（`SignboardPlacementEditor.tsx` の `styles.saveButton`）は
   * モバイル用の上書きを持たず、下限に届かなかった。利用者の判断（2026-10-04）で受入基準 19.3 の
   * 対象に含め、写真項目の操作ボタン（タスク 21.2）と同じ上書き（`utils/tap-target` の下限を
   * min-width / min-height に課す形）をモバイル幅でのみ合成した。ダイアログの末尾の行の操作ボタンは
   * 「キャンセル」だけであり、「保存」は配置エディタの操作列にある（ダイアログのもう一つの操作
   * ボタンとして含めた）。看板マスタへのリンクはタスク 23.2 で既に下限を持つ。
   *
   * 44 は本テストが自前で綴る（上の写真項目の操作のテストの注記と同じ理由）。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が設定した幅に一致し、写真項目が縦積みのモバイル分岐に確定
   *    している（デスクトップ幅では縦積みでない）。
   *  - 二つの状態の測定がすべての幅で揃い、測る対象の要素がすべて在る。
   *
   * 併せて、上書きが配置を崩さないことを主張する。二つのボタンが、ダイアログの他の要素（看板の
   * 選択・看板マスタへのリンク・配置エディタの画像の枠・操作列の他の要素）および互いと重ならない
   * こと、ダイアログの本体の左右の内側にあること、ダイアログの本体と文書全体に水平のはみ出しが
   * 無いこと（許容誤差 1px）である。
   *
   * デスクトップ幅（768・1280）では寸法を変えない。二つのボタンの計算済みの min-width /
   * min-height が上書きの無い既定値（auto）のままであり、高さが 44 未満である（モバイル用の上書きが
   * 当たっていない）ことを主張する。外接矩形の寸法の固定値は主張しない（寸法は描画のフォントに
   * 依存し、ローカルと CI の E2E でフォントが異なるため）。
   *
   * 二つの状態・四つの幅をすべて測ってから主張する。赤になるときに、どの状態が何 px だったかを
   * 一度の失敗で読めるようにするためである。
   *
   * 写真は 100×100 の PNG を使う。タスク 24.3 の時点では、配置エディタの画像の枠は写真の幅（上限
   * 600）で描かれ、実寸の大きい写真ではモバイル幅で枠がダイアログの本体より広くなった（1920×1080 の
   * 写真で枠 602、本体の scrollWidth 626 / clientWidth 343）。タスク 25.1 で枠を本体の内側の幅へ
   * 縮めた（実寸の写真での主張は下のタスク 25.1 のテストが担う）。
   *
   * 是正の経緯（2026-10-04、タスク 24.3）: 上書きを足す前の本番ビルドでは赤だった。375・320 幅の
   * 二つの状態のすべてで「キャンセル」104×39・「保存」60×33 であり、高さが下限に届かない。是正後は
   * 「キャンセル」104×44・「保存」60×44 で（幅は文言の内容で 44 を超えており、動いたのは高さだけ
   * である）、768・1280 幅は 104×39・60×33 のまま変わらない（いずれもローカルの test 環境のフォント
   * での実測の記録であり、主張には用いない）。
   */
  test('モバイル幅（375・320）で看板の配置のダイアログの操作ボタン（キャンセル・保存）が 44×44 以上のタップ領域を持ち、デスクトップ幅では寸法が変わらない', async ({
    page,
  }) => {
    // 検証の側の下限。実装の定数は取り込まない
    const TAP_TARGET_MIN_PX = 44;
    const HORIZONTAL_TOLERANCE_PX = 1;
    const MOBILE_WIDTHS = [375, 320];
    const DESKTOP_WIDTHS = [768, 1280];
    const stamp = Date.now();
    const signboardName = `ダイアログ操作E2E看板_${stamp}`;
    // 配置エディタの画像の枠が隣の要素として意味のある大きさを持つよう、100×100 の写真を使う
    // （1×1 の JPEG では枠が 3×3 になる）
    const fileName = `dialog_tap_${stamp}.png`;

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'dialog-tap-target');
    const albumId = await createAlbum(page, projectId, `ダイアログ操作_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('ダイアログ操作E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: fs.readFileSync(FIXTURE_PNG),
    });
    await upload;
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    interface Rect {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }
    interface ButtonMeasurement {
      rect: Rect;
      minWidth: string;
      minHeight: string;
    }
    interface DialogMeasurement {
      label: string;
      width: number;
      viewportWidth: number;
      documentOverflow: number;
      content: Rect & { scrollWidth: number; clientWidth: number };
      cancel: ButtonMeasurement | null;
      save: ButtonMeasurement | null;
      neighbours: Array<{ name: string; rect: Rect }>;
    }
    const measurements: DialogMeasurement[] = [];

    const measureDialog = async (
      dialog: import('@playwright/test').Locator,
      width: number,
      label: string
    ): Promise<void> => {
      const m = await dialog.evaluate((root) => {
        const rect = (target: Element): Rect => {
          const r = target.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const button = (target: Element | undefined) => {
          if (!target) return null;
          const style = getComputedStyle(target);
          return { rect: rect(target), minWidth: style.minWidth, minHeight: style.minHeight };
        };
        const content = root.querySelector('[data-testid="signboard-assign-content"]') as Element;
        const editorEl = root.querySelector('[data-testid="signboard-placement-editor"]');
        const buttons = Array.from(root.querySelectorAll('button'));
        const cancelEl = buttons.find((el) => (el.textContent ?? '').trim() === 'キャンセル');
        const saveEl = buttons.find((el) => (el.textContent ?? '').trim() === '保存');
        const toolbar = saveEl?.parentElement ?? null;
        const neighbours: Array<{ name: string; rect: Rect }> = [];
        const select = root.querySelector('#signboard-assign-select');
        if (select) neighbours.push({ name: '看板の選択', rect: rect(select) });
        const masterLink = root.querySelector('[data-testid="signboard-master-link"]');
        if (masterLink) neighbours.push({ name: '看板マスタへのリンク', rect: rect(masterLink) });
        // 配置エディタの最初の子が画像の枠（canvas を包む）である
        const canvasFrame = editorEl?.firstElementChild ?? null;
        if (canvasFrame?.querySelector('canvas')) {
          neighbours.push({ name: '画像の枠', rect: rect(canvasFrame) });
        }
        if (toolbar) {
          Array.from(toolbar.children)
            .filter((el) => el !== saveEl)
            .forEach((el) =>
              neighbours.push({ name: `操作列の ${(el.textContent ?? '').trim()}`, rect: rect(el) })
            );
        }
        return {
          viewportWidth: window.innerWidth,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          content: {
            ...rect(content),
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
          },
          cancel: button(cancelEl),
          save: button(saveEl),
          neighbours,
        };
      });
      measurements.push({ label, width, ...m });
    };

    for (const width of [...MOBILE_WIDTHS, ...DESKTOP_WIDTHS]) {
      const isMobileWidth = MOBILE_WIDTHS.includes(width);
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(items, `${width} 幅`).toHaveCount(1, { timeout: getTimeout(20000) });
      // 前提: 画面がその幅の分岐に確定している（`useMediaQuery` は初期描画でデスクトップ側に
      // なり得るため、モバイル幅では写真項目の縦積みを待つ）
      await expect
        .poll(
          async () =>
            items
              .first()
              .evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection === 'column'),
          { message: `${width} 幅`, timeout: getTimeout(15000) }
        )
        .toBe(isMobileWidth);

      await items
        .first()
        .getByRole('button', { name: `看板を配置: ${fileName}` })
        .click();
      const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
      await expect(assignDialog, `${width} 幅`).toBeVisible({ timeout: getTimeout(10000) });
      const editor = assignDialog.getByTestId('signboard-placement-editor');
      await expect(editor, `${width} 幅`).toBeVisible({ timeout: getTimeout(10000) });
      // 前提: 配置エディタの画像の枠が写真の大きさで描かれている（枠が潰れていると、隣の要素の
      // 重なりの主張が空振りする）
      const frameHeight = async (): Promise<number> =>
        editor.evaluate((el) => el.firstElementChild?.getBoundingClientRect().height ?? 0);
      await expect(editor.getByText('看板は未指定です'), `${width} 幅`).toBeVisible();
      await expect
        .poll(frameHeight, { message: `${width} 幅`, timeout: getTimeout(15000) })
        .toBeGreaterThan(TAP_TARGET_MIN_PX);
      await measureDialog(assignDialog, width, `${width} 幅・看板が未指定`);

      await assignDialog.locator('#signboard-assign-select').selectOption({ label: signboardName });
      await expect(editor.getByTestId('signboard-indicator'), `${width} 幅`).toContainText(
        signboardName
      );
      await expect
        .poll(frameHeight, { message: `${width} 幅`, timeout: getTimeout(15000) })
        .toBeGreaterThan(TAP_TARGET_MIN_PX);
      await measureDialog(assignDialog, width, `${width} 幅・看板を選択`);

      // 「キャンセル」で閉じる（保存しない）
      await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(assignDialog, `${width} 幅`).toBeHidden({ timeout: getTimeout(10000) });
    }
    await page.setViewportSize(desktopViewport!);

    // 二つの状態・四つの幅をすべて測れている（測り漏らした状態を緑に数えない）
    expect(measurements.map((m) => m.label)).toEqual(
      [...MOBILE_WIDTHS, ...DESKTOP_WIDTHS].flatMap((w) => [
        `${w} 幅・看板が未指定`,
        `${w} 幅・看板を選択`,
      ])
    );

    const size = (r: Rect): string => `${r.width}×${r.height}`;
    const report = measurements
      .map(
        (m) =>
          `${m.label}: キャンセル ${m.cancel ? size(m.cancel.rect) : 'なし'}` +
          `（min ${m.cancel?.minWidth}/${m.cancel?.minHeight}・左 ${m.cancel?.rect.left}・右 ${m.cancel?.rect.right}）、` +
          `保存 ${m.save ? size(m.save.rect) : 'なし'}` +
          `（min ${m.save?.minWidth}/${m.save?.minHeight}・左 ${m.save?.rect.left}・右 ${m.save?.rect.right}）、` +
          `本体 左 ${m.content.left}・右 ${m.content.right}・${m.content.scrollWidth}/${m.content.clientWidth}、` +
          `文書のはみ出し ${m.documentOverflow}、` +
          `隣 ${m.neighbours.map((n) => `${n.name} ${size(n.rect)}@${n.rect.top}`).join('・')}`
      )
      .join(' ｜ ');

    // 前提: 画面幅が設定した幅であり、測る対象がすべて在る
    expect(
      measurements.map((m) => m.viewportWidth),
      report
    ).toEqual(measurements.map((m) => m.width));
    for (const m of measurements) {
      expect(m.cancel, `${m.label} ｜ ${report}`).not.toBeNull();
      expect(m.save, `${m.label} ｜ ${report}`).not.toBeNull();
      // 看板の選択・看板マスタへのリンク・画像の枠と、操作列の他の要素（1〜2 個）
      expect(m.neighbours.length, `${m.label} ｜ ${report}`).toBeGreaterThanOrEqual(4);
    }

    const mobile = measurements.filter((m) => MOBILE_WIDTHS.includes(m.width));
    const desktop = measurements.filter((m) => DESKTOP_WIDTHS.includes(m.width));
    const tooSmall = (r: Rect): boolean =>
      r.width < TAP_TARGET_MIN_PX || r.height < TAP_TARGET_MIN_PX;
    const overlaps = (a: Rect, b: Rect): boolean =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    // R19.3: モバイル幅でダイアログの操作ボタンのタップ領域が 44×44 以上である
    expect(
      mobile.flatMap((m) =>
        (
          [
            ['キャンセル', m.cancel!],
            ['保存', m.save!],
          ] as const
        )
          .filter(([, b]) => tooSmall(b.rect))
          .map(([name, b]) => `${m.label}: ${name} ${size(b.rect)}`)
      ),
      report
    ).toEqual([]);

    // 上書きが配置を崩さない: 二つのボタンが互いと、ダイアログの他の要素と重ならない
    expect(
      measurements.flatMap((m) => [
        ...(overlaps(m.cancel!.rect, m.save!.rect) ? [`${m.label}: キャンセル×保存`] : []),
        ...m.neighbours.flatMap((n) =>
          (
            [
              ['キャンセル', m.cancel!],
              ['保存', m.save!],
            ] as const
          )
            .filter(([, b]) => overlaps(b.rect, n.rect))
            .map(([name]) => `${m.label}: ${name}×${n.name}`)
        ),
      ]),
      report
    ).toEqual([]);
    // 上書きが配置を崩さない: 二つのボタンがダイアログの本体の左右の内側にある
    expect(
      measurements
        .filter((m) =>
          [m.cancel!.rect, m.save!.rect].some(
            (r) =>
              r.left < m.content.left - HORIZONTAL_TOLERANCE_PX ||
              r.right > m.content.right + HORIZONTAL_TOLERANCE_PX
          )
        )
        .map((m) => m.label),
      report
    ).toEqual([]);
    // 上書きが配置を崩さない: ダイアログの本体と文書全体に水平のはみ出しが無い（許容誤差1px）
    expect(
      measurements
        .filter(
          (m) =>
            m.content.scrollWidth - m.content.clientWidth > HORIZONTAL_TOLERANCE_PX ||
            m.documentOverflow > HORIZONTAL_TOLERANCE_PX
        )
        .map((m) => m.label),
      report
    ).toEqual([]);

    // デスクトップ幅では上書きが当たらない（計算済みの min-width / min-height が既定値のまま）
    expect(
      desktop.flatMap((m) =>
        (
          [
            ['キャンセル', m.cancel!],
            ['保存', m.save!],
          ] as const
        )
          .filter(([, b]) => b.minWidth !== 'auto' || b.minHeight !== 'auto')
          .map(([name, b]) => `${m.label}: ${name} min ${b.minWidth}/${b.minHeight}`)
      ),
      report
    ).toEqual([]);
    // デスクトップ幅では上書きが当たらない: 二つのボタンの高さが 44 未満のまま（フォントに依存する
    // 固定値は主張しない）
    expect(
      desktop.flatMap((m) =>
        (
          [
            ['キャンセル', m.cancel!],
            ['保存', m.save!],
          ] as const
        )
          .filter(([, b]) => b.rect.height >= TAP_TARGET_MIN_PX)
          .map(([name, b]) => `${m.label}: ${name} ${size(b.rect)}`)
      ),
      report
    ).toEqual([]);
  });

  /**
   * R19.1 / R9.1 / R9.3 看板の配置のエディタの画像の枠の幅の追従（タスク 25.1）:
   * 実寸の写真（テストの中で生成する 1920×1440 の PNG。スマートフォンで撮った写真の寸法に当たる）を
   * 1 枚追加し、375・320・1280 幅で看板の配置のダイアログを開いて看板を選び、画像の枠の寸法と
   * ダイアログの本体・文書全体の水平のはみ出しを実ブラウザで測る。
   *
   * @requirement construction-photo/REQ-19.1
   * @requirement construction-photo/REQ-9.1
   * @requirement construction-photo/REQ-9.3
   *
   * 経緯（2026-10-04、タスク 25.1）: 配置のエディタの画像の枠は最大表示幅 600 を上限に写真の幅で
   * 描かれ、画面の幅に追従しなかった。実寸の写真では 375・320 幅でダイアログの本体に横スクロールが
   * 出た（scrollWidth 626 に対して clientWidth 343 / 288。タスク 24.3 の実測）。利用者の判断
   * （2026-10-04）で、画像の枠をエディタの置かれた場所の幅（ダイアログの本体の内側）へ縮める。
   * 表示の縮尺が変わるだけで、保存される配置は画像の座標のままである。
   *
   * 主張:
   *  - 375・320 幅: ダイアログの本体と文書全体に水平のはみ出しが無い（許容誤差 1px）。画像の枠が
   *    本体の内側（padding の内側）の左右に収まる。画像の枠の中の画像は本体の内側の幅を埋める
   *    （写真の幅が本体より広いため、縮めた枠は内側の幅から枠線の分を除いた幅になる。潰れていない
   *    ことの確認）。画像の縦横の比は写真の比のまま。
   *  - 1280 幅: 画像の幅は最大表示幅 600 のまま、高さは 600 × 1440 / 1920 のまま（デスクトップ幅の
   *    表示を変えない）。600 は描画のフォントに依存しない、エディタの既定の最大表示幅である。
   *  - 320 幅（最も縮尺の小さい幅）で看板を選んで動かさずに保存すると、送られた配置は写真一覧の
   *    API が返す実寸 W×H に対して left=0.3W, top=0.375H, width=0.4W, height=0.25H（整数へ丸め、
   *    換算の浮動小数の誤差に 1px を許す）になり、読み込み直しても残る（タスク 24.4 の既定の配置が
   *    新しい縮尺でも同じであること）。
   *
   * 寸法の主張にフォントに依存する固定値は使わない。三つの幅をすべて測ってから主張する。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 写真一覧の API が返す写真の寸法が 1920×1440 である（写真が縮められて保存されていない）。
   *  - 画面幅（window.innerWidth）が設定した幅に一致し、写真項目の並びがその幅の分岐に確定している。
   *  - 画像の枠の中に canvas があり、高さが 0 でない。
   */
  test('実寸の写真でもモバイル幅（375・320）で看板の配置のエディタの画像の枠がダイアログの本体に収まり、1280 幅では幅が変わらず、動かさずに保存した配置は画像の座標で既定の比率になる', async ({
    page,
  }) => {
    const HORIZONTAL_TOLERANCE_PX = 1;
    const MOBILE_WIDTHS = [375, 320];
    const DESKTOP_WIDTH = 1280;
    // エディタの既定の最大表示幅（フォントに依存しない、検証の側で綴る値）
    const DEFAULT_MAX_DISPLAY_WIDTH = 600;
    const stamp = Date.now();
    const signboardName = `画像の枠E2E看板_${stamp}`;
    const fileName = `large_frame_${stamp}.png`;
    // スマートフォンの写真に多い 4:3 の 1920×1440
    const PHOTO_WIDTH = 1920;
    const PHOTO_HEIGHT = 1440;

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'placement-frame-width');
    const albumId = await createAlbum(page, projectId, `画像の枠_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('画像の枠E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    interface ListedPhoto {
      id: string;
      width: number;
      height: number;
      signboardId: string | null;
      signboardPlacement: { left: number; top: number; width: number; height: number } | null;
    }
    const photoListPath = `/api/construction-photos/${albumId}/images`;
    const isPhotoListResponse = (r: import('@playwright/test').Response): boolean =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === photoListPath;

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: buildLargePhotoPng(PHOTO_WIDTH, PHOTO_HEIGHT),
    });
    expect((await upload).status()).toBeLessThan(300);
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    interface Rect {
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    }
    interface FrameMeasurement {
      width: number;
      viewportWidth: number;
      documentOverflow: number;
      content: Rect & {
        scrollWidth: number;
        clientWidth: number;
        innerLeft: number;
        innerRight: number;
      };
      frame: Rect | null;
      canvas: Rect | null;
    }
    const measurements: FrameMeasurement[] = [];
    let photo: ListedPhoto | undefined;

    const measureFrame = (dialog: import('@playwright/test').Locator) =>
      dialog.evaluate((root) => {
        const rect = (target: Element): Rect => {
          const r = target.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const content = root.querySelector('[data-testid="signboard-assign-content"]') as Element;
        const style = getComputedStyle(content);
        const contentRect = rect(content);
        const editorEl = root.querySelector('[data-testid="signboard-placement-editor"]');
        // 配置エディタの最初の子が画像の枠（canvas を包む）である
        const frameEl = editorEl?.firstElementChild ?? null;
        const canvasEl = frameEl?.querySelector('canvas') ?? null;
        return {
          viewportWidth: window.innerWidth,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          content: {
            ...contentRect,
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
            innerLeft: contentRect.left + parseFloat(style.paddingLeft),
            innerRight: contentRect.right - parseFloat(style.paddingRight),
          },
          frame: frameEl ? rect(frameEl) : null,
          canvas: canvasEl ? rect(canvasEl) : null,
        };
      });

    const openDialogWithSignboard = async (width: number) => {
      const isMobileWidth = MOBILE_WIDTHS.includes(width);
      await page.setViewportSize({ width, height: 812 });
      const listPromise = page.waitForResponse(isPhotoListResponse, {
        timeout: getTimeout(30000),
      });
      await page.goto(`/construction-photos/${albumId}`);
      const listed = (await (await listPromise).json()) as ListedPhoto[];
      await page.waitForLoadState('networkidle');
      await expect(items, `${width} 幅`).toHaveCount(1, { timeout: getTimeout(20000) });
      // アルバムの写真項目は追加した 1 件だけである
      expect(listed, `${width} 幅`).toHaveLength(1);
      photo = listed[0];
      // 前提: 画面がその幅の分岐に確定している
      await expect
        .poll(
          async () =>
            items
              .first()
              .evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection === 'column'),
          { message: `${width} 幅`, timeout: getTimeout(15000) }
        )
        .toBe(isMobileWidth);

      await items
        .first()
        .getByRole('button', { name: `看板を配置: ${fileName}` })
        .click();
      const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
      await expect(assignDialog, `${width} 幅`).toBeVisible({ timeout: getTimeout(10000) });
      const select = assignDialog.locator('#signboard-assign-select');
      await expect(select, `${width} 幅`).toBeEnabled({ timeout: getTimeout(15000) });
      await select.selectOption({ label: signboardName });
      const editor = assignDialog.getByTestId('signboard-placement-editor');
      await expect(editor.getByTestId('signboard-indicator'), `${width} 幅`).toContainText(
        signboardName,
        { timeout: getTimeout(10000) }
      );
      // 前提: 画像の枠に高さのある canvas が描かれている
      await expect
        .poll(async () => (await measureFrame(assignDialog)).canvas?.height ?? 0, {
          message: `${width} 幅`,
          timeout: getTimeout(15000),
        })
        .toBeGreaterThan(0);
      return assignDialog;
    };

    for (const width of [...MOBILE_WIDTHS, DESKTOP_WIDTH]) {
      const assignDialog = await openDialogWithSignboard(width);
      // 幅の追従（置かれた場所の幅の計測の後の描き直し）が落ち着くまで待つ。どの幅でも本体の
      // 水平のはみ出しが消えるまで待つ（デスクトップ幅の寸法は下でまとめて主張する）
      await expect
        .poll(
          async () => {
            const m = await measureFrame(assignDialog);
            return m.content.scrollWidth - m.content.clientWidth;
          },
          { message: `${width} 幅の本体の水平のはみ出し`, timeout: getTimeout(10000) }
        )
        .toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
      measurements.push({ width, ...(await measureFrame(assignDialog)) });

      await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(assignDialog, `${width} 幅`).toBeHidden({ timeout: getTimeout(10000) });
    }

    const report = measurements
      .map(
        (m) =>
          `${m.width} 幅: 本体 ${m.content.scrollWidth}/${m.content.clientWidth}` +
          `（内側 ${m.content.innerLeft}〜${m.content.innerRight}）、文書のはみ出し ${m.documentOverflow}、` +
          `枠 ${m.frame?.left}〜${m.frame?.right}、画像 ${m.canvas?.width}×${m.canvas?.height}`
      )
      .join(' ｜ ');

    // 前提: 写真は実寸のまま保存され、画面幅が設定した幅であり、測る対象がすべて在る
    expect(photo, report).toBeDefined();
    expect(photo!.width, report).toBe(PHOTO_WIDTH);
    expect(photo!.height, report).toBe(PHOTO_HEIGHT);
    expect(
      measurements.map((m) => m.viewportWidth),
      report
    ).toEqual([...MOBILE_WIDTHS, DESKTOP_WIDTH]);
    for (const m of measurements) {
      expect(m.frame, `${m.width} 幅 ｜ ${report}`).not.toBeNull();
      expect(m.canvas, `${m.width} 幅 ｜ ${report}`).not.toBeNull();
      expect(m.canvas!.height, `${m.width} 幅 ｜ ${report}`).toBeGreaterThan(0);
      // 画像の縦横の比は写真の比のまま（縮尺は幅と高さで同じ）
      expect(
        Math.abs(m.canvas!.height - (m.canvas!.width * photo!.height) / photo!.width),
        `${m.width} 幅 ｜ ${report}`
      ).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
    }

    const mobile = measurements.filter((m) => MOBILE_WIDTHS.includes(m.width));
    // R19.1: モバイル幅でダイアログの本体と文書全体に水平のはみ出しが無い（許容誤差1px）
    expect(
      mobile
        .filter(
          (m) =>
            m.content.scrollWidth - m.content.clientWidth > HORIZONTAL_TOLERANCE_PX ||
            m.documentOverflow > HORIZONTAL_TOLERANCE_PX
        )
        .map((m) => `${m.width} 幅`),
      report
    ).toEqual([]);
    // R19.1: 画像の枠が本体の内側の左右に収まる
    expect(
      mobile
        .filter(
          (m) =>
            m.frame!.left < m.content.innerLeft - HORIZONTAL_TOLERANCE_PX ||
            m.frame!.right > m.content.innerRight + HORIZONTAL_TOLERANCE_PX
        )
        .map((m) => `${m.width} 幅`),
      report
    ).toEqual([]);
    // 画像の枠は本体の内側の幅を埋める（潰れていない）。写真は本体より広いため、縮めた枠は
    // 内側の幅いっぱいになる（枠線と整数への切り捨ての分として 3px を許す）
    expect(
      mobile
        .filter((m) => m.frame!.width < m.content.innerRight - m.content.innerLeft - 3)
        .map((m) => `${m.width} 幅`),
      report
    ).toEqual([]);

    // デスクトップ幅の表示は変えない: 画像は最大表示幅 600 のまま
    const desktop = measurements.find((m) => m.width === DESKTOP_WIDTH)!;
    expect(desktop.canvas!.width, report).toBe(DEFAULT_MAX_DISPLAY_WIDTH);
    expect(
      Math.abs(desktop.canvas!.height - (DEFAULT_MAX_DISPLAY_WIDTH * photo!.height) / photo!.width),
      report
    ).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);

    // R9.1 / R9.3: 最も縮尺の小さい 320 幅で看板を選び、動かさずに保存した配置は画像の座標で
    // 既定の比率になる
    const batchBodies: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/construction-photos/images/batch'
      ) {
        batchBodies.push(request.postData() ?? '');
      }
    });
    const narrowest = Math.min(...MOBILE_WIDTHS);
    const saveDialog = await openDialogWithSignboard(narrowest);
    await expect
      .poll(
        async () => {
          const m = await measureFrame(saveDialog);
          return m.content.scrollWidth - m.content.clientWidth;
        },
        { message: `${narrowest} 幅の本体の水平のはみ出し`, timeout: getTimeout(10000) }
      )
      .toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
    const signboardId = await saveDialog.locator('#signboard-assign-select').inputValue();
    expect(signboardId).toBeTruthy();
    await saveDialog
      .getByTestId('signboard-placement-editor')
      .getByRole('button', { name: '保存' })
      .click();
    await expect(saveDialog).toBeHidden({ timeout: getTimeout(10000) });

    const batchResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === '/api/construction-photos/images/batch',
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    expect((await batchResponsePromise).status()).toBe(200);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });

    expect(batchBodies).toHaveLength(1);
    const sent = (
      JSON.parse(batchBodies[0]!) as {
        items: Array<{
          id: string;
          signboardId?: string | null;
          signboardPlacement?: ListedPhoto['signboardPlacement'];
        }>;
      }
    ).items.find((item) => item.id === photo!.id);
    expect(sent).toBeDefined();
    expect(sent!.signboardId).toBe(signboardId);
    const placement = sent!.signboardPlacement;
    expect(placement).toBeDefined();
    expect(placement).not.toBeNull();
    const W = photo!.width;
    const H = photo!.height;
    const expectedPlacement = {
      left: Math.round(W * 0.3),
      top: Math.round(H * 0.375),
      width: Math.round(W * 0.4),
      height: Math.round(H * 0.25),
    };
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(
        Math.abs(placement![key] - expectedPlacement[key]),
        `${key}: ${JSON.stringify(placement)} / ${JSON.stringify(expectedPlacement)}`
      ).toBeLessThanOrEqual(1);
    }

    // 読み込み直した後も、看板の指定と送った配置が保たれている
    const reloadListPromise = page.waitForResponse(isPhotoListResponse, {
      timeout: getTimeout(30000),
    });
    await page.reload();
    const reloaded = ((await (await reloadListPromise).json()) as ListedPhoto[]).find(
      (p) => p.id === photo!.id
    );
    expect(reloaded).toBeDefined();
    expect(reloaded!.signboardId).toBe(signboardId);
    expect(reloaded!.signboardPlacement).toEqual(placement);

    await page.setViewportSize(desktopViewport!);
  });

  /**
   * タスク 26.1: 看板の配置のエディタの背景は写真の全体である（利用者の判断（2026-10-05））。
   * 変更前は背景にサムネイル（アップロードのときに作る 200×200 の中央の切り抜き）を幅に合わせて
   * 敷いたため、4:3 の写真では見えている背景が写真の全体と一致せず、置いた位置と印字画像・PDF で
   * 看板が重なる位置が食い違った（機能全体の検証 2026-10-05 で判明）。
   *
   * 四隅に色の違う印（写真の幅・高さの 8%）を置いた 1920×1440 の写真を追加し、看板の配置の
   * ダイアログを 1280 幅と 375 幅で開く。主張は次のとおり。
   *  - エディタを開くと原本の取得口（/original、パスで判定）が 200 で応答する。
   *  - 画像の枠の canvas の四隅（各辺から 3% の内側）の画素が、写真の四隅の印の色である
   *    （各色成分の差 48 以内）。サムネイルを幅に合わせて敷くと左右の 12.5% が切り落とされ、
   *    四隅は地の灰色になる。
   *  - canvas の縦横の比が写真の比のまま（画像の枠の全体を写真の全体が埋めている前提）。
   *  - 看板を選んで動かさないとき、緑ボードは保存される既定の配置（枠の 30%〜70%×37.5%〜62.5%）に
   *    描かれる。その内側で中心から外れた点（60%, 56%）が緑ボードの色（地の灰色に濃緑 55% を重ねた
   *    色）で、緑ボードを中心の基準点で描いたときにだけ覆われる点（20%, 31%）が地の灰色である。
   *    Fabric v7 は基準点の既定を中央に変えたため、変更前は緑ボードが保存される配置より大きさの
   *    半分だけ左上へずれて描かれ、背景も画像の中心が枠の左上に来ていた。
   * 画素は canvas の描画の画素（devicePixelRatio を含む）の比で読むため、フォントに依存しない。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 写真一覧の API が返す写真の寸法が 1920×1440 である（写真が縮められて保存されていない）。
   *  - 画像の枠の中に canvas があり、高さが 0 でない。
   *
   * @requirement construction-photo/REQ-9.3
   */
  test('看板の配置のエディタの背景は写真の全体で、4:3 の写真でも画像の枠の四隅に写真の四隅が見える（1280・375 幅）', async ({
    page,
  }) => {
    const PHOTO_WIDTH = 1920;
    const PHOTO_HEIGHT = 1440;
    const COLOR_TOLERANCE = 48;
    const SAMPLE_INSET = 0.03;
    const stamp = Date.now();
    const fileName = `corner_marked_${stamp}.png`;
    const signboardName = `背景の原本E2E看板_${stamp}`;
    // 地の灰色に緑ボードの塗り（rgba(0, 77, 38, 0.55)）を重ねた色。検証の側で綴る
    const BOARD_ALPHA = 0.55;
    const BOARD_OVER_BASE = [0, 77, 38].map(
      (c, i) => c * BOARD_ALPHA + CORNER_MARK_BASE[i]! * (1 - BOARD_ALPHA)
    );

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'placement-background');
    const albumId = await createAlbum(page, projectId, `背景の原本_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('背景の原本E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: signboardName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    interface ListedPhoto {
      id: string;
      width: number;
      height: number;
    }
    const photoListPath = `/api/construction-photos/${albumId}/images`;
    const isPhotoListResponse = (r: import('@playwright/test').Response): boolean =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === photoListPath;

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/png',
      buffer: buildCornerMarkedPhotoPng(PHOTO_WIDTH, PHOTO_HEIGHT),
    });
    expect((await upload).status()).toBeLessThan(300);
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    type Rgb = [number, number, number];
    interface CornerSample {
      canvasWidth: number;
      canvasHeight: number;
      topLeft: Rgb;
      topRight: Rgb;
      bottomLeft: Rgb;
      bottomRight: Rgb;
      boardInside: Rgb;
      shiftedOnly: Rgb;
    }
    const sampleCorners = (dialog: import('@playwright/test').Locator) =>
      dialog.evaluate((root, inset): CornerSample | null => {
        const editorEl = root.querySelector('[data-testid="signboard-placement-editor"]');
        // 配置エディタの最初の子が画像の枠で、その最初の canvas が fabric の描画の canvas である
        const canvas = editorEl?.firstElementChild?.querySelector('canvas') ?? null;
        if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
        const context = canvas.getContext('2d');
        if (!context) return null;
        const at = (fx: number, fy: number): [number, number, number] => {
          const x = Math.min(canvas.width - 1, Math.floor(canvas.width * fx));
          const y = Math.min(canvas.height - 1, Math.floor(canvas.height * fy));
          const d = context.getImageData(x, y, 1, 1).data;
          return [d[0]!, d[1]!, d[2]!];
        };
        return {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          topLeft: at(inset, inset),
          topRight: at(1 - inset, inset),
          bottomLeft: at(inset, 1 - inset),
          bottomRight: at(1 - inset, 1 - inset),
          // 既定の配置（30%〜70%×37.5%〜62.5%）の内側で、中心の基準点で描くと外れる点
          boardInside: at(0.6, 0.56),
          // 中心の基準点で描いたとき（10%〜50%×25%〜50%）にだけ覆われる点
          shiftedOnly: at(0.2, 0.31),
        };
      }, SAMPLE_INSET);
    const colorDistance = (a: readonly number[], b: readonly number[]): number =>
      Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

    const results: string[] = [];
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const listPromise = page.waitForResponse(isPhotoListResponse, {
        timeout: getTimeout(30000),
      });
      await page.goto(`/construction-photos/${albumId}`);
      const listed = (await (await listPromise).json()) as ListedPhoto[];
      await page.waitForLoadState('networkidle');
      // 前提: 写真が実寸のまま保存されている
      expect(listed, `${width} 幅`).toHaveLength(1);
      expect({ width: listed[0]!.width, height: listed[0]!.height }, `${width} 幅`).toEqual({
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
      });
      const originalPath = `/api/construction-photos/images/${listed[0]!.id}/original`;

      const originalResponse = page.waitForResponse(
        (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === originalPath,
        { timeout: getTimeout(30000) }
      );
      await items
        .first()
        .getByRole('button', { name: `看板を配置: ${fileName}` })
        .click();
      const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
      await expect(assignDialog, `${width} 幅`).toBeVisible({ timeout: getTimeout(10000) });
      expect((await originalResponse).status(), `${width} 幅`).toBe(200);
      const select = assignDialog.locator('#signboard-assign-select');
      await expect(select, `${width} 幅`).toBeEnabled({ timeout: getTimeout(15000) });
      await select.selectOption({ label: signboardName });
      await expect(
        assignDialog.getByTestId('signboard-placement-editor').getByTestId('signboard-indicator'),
        `${width} 幅`
      ).toContainText(signboardName, { timeout: getTimeout(10000) });

      // 前提: 画像の枠に高さのある canvas が描かれ、背景が敷かれている（左上が透明でない）
      let sample: CornerSample | null = null;
      await expect
        .poll(
          async () => {
            sample = await sampleCorners(assignDialog);
            return sample !== null && colorDistance(sample.topLeft, [0, 0, 0]) > 0;
          },
          { message: `${width} 幅: 背景が敷かれる`, timeout: getTimeout(15000) }
        )
        .toBe(true);
      // 背景の読み込みの後の描画を待ってから最終の値を読む
      await expect
        .poll(
          async () => {
            sample = await sampleCorners(assignDialog);
            return sample ? colorDistance(sample.topLeft, CORNER_MARK_COLORS.topLeft) : 255;
          },
          { message: `${width} 幅: 左上`, timeout: getTimeout(10000) }
        )
        .toBeLessThanOrEqual(COLOR_TOLERANCE);
      const measured = sample as CornerSample | null;
      expect(measured, `${width} 幅`).not.toBeNull();
      const m = measured!;
      // canvas の縦横の比は写真の比のまま
      expect(m.canvasHeight / m.canvasWidth, `${width} 幅`).toBeCloseTo(
        PHOTO_HEIGHT / PHOTO_WIDTH,
        2
      );
      for (const corner of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const) {
        results.push(
          `${width} 幅 ${corner}: ${m[corner].join(',')} → 差 ${colorDistance(m[corner], CORNER_MARK_COLORS[corner])}`
        );
      }
      results.push(
        `${width} 幅 boardInside: ${m.boardInside.join(',')} → 差 ${colorDistance(m.boardInside, BOARD_OVER_BASE)}`,
        `${width} 幅 shiftedOnly: ${m.shiftedOnly.join(',')} → 差 ${colorDistance(m.shiftedOnly, CORNER_MARK_BASE)}`
      );
      await assignDialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    }

    // 四隅のすべてが写真の四隅の印の色で、緑ボードが既定の配置に描かれている（二つの幅をすべて
    // 測ってから主張する）
    const failures = results.filter((line) => Number(line.split('差 ')[1]) > COLOR_TOLERANCE);
    expect(failures, results.join('\n')).toEqual([]);
  });

  /**
   * タスク 26.2: 未保存の変更があるときは PDF・ZIP の出力を始めず、保存してから出力する旨を示す
   * （利用者の判断（2026-10-05））。変更前は、並べ替えて保存していない画面の表示順序のまま PDF を
   * 出力し、保存済みの表示順序で出力する受入基準 10.12 に反した（機能全体の検証 2026-10-05 で判明）。
   *
   * 写真項目 2 件を印刷対象にして保存した後、先頭を「下へ移動」して未保存にする。主張は次のとおり。
   *  - 「PDF出力」を押すと「未保存の変更があります。保存してからPDF出力してください。」が出て、
   *    印字画像（/print-image、パスで判定）を一件も要求せず、ダウンロードも起きない。
   *  - 「全件エクスポート」を押すと、エクスポートの設定のダイアログは開かず、
   *    「未保存の変更があります。保存してからエクスポートしてください。」が出る。
   *  - 保存すると、写真一覧の API が返す表示順序が並べ替えた順になり、「PDF出力」で PDF が
   *    ダウンロードされ、保存を促す通知は出ない。
   *
   * @requirement construction-photo/REQ-10.12
   */
  test('並べ替えて保存していない間は PDF と ZIP の出力を始めずに保存を促し、保存の後は PDF を出力する', async ({
    page,
  }) => {
    const stamp = Date.now();
    const unsavedPdf = '未保存の変更があります。保存してからPDF出力してください。';
    const unsavedZip = '未保存の変更があります。保存してからエクスポートしてください。';

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'unsaved-export');
    const albumId = await createAlbum(page, projectId, `未保存の出力_${stamp}`);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('construction-photo-item');
    const names = [`unsaved-export-1-${stamp}.jpg`, `unsaved-export-2-${stamp}.jpg`];
    for (const [index, name] of names.entries()) {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      expect((await upload).status()).toBe(201);
      await expect(items).toHaveCount(index + 1, { timeout: getTimeout(20000) });
    }

    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const dirtyIndicator = page.getByTestId('dirty-indicator');
    const isBatchPath = (url: string): boolean =>
      new URL(url).pathname === '/api/construction-photos/images/batch';
    // 前提: 2 件を印刷対象にして保存し、未保存の変更が無い
    for (let i = 0; i < 2; i++) {
      await items.nth(i).getByLabel('印刷対象に含める').check();
    }
    const batchSaved = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && isBatchPath(r.url()),
      { timeout: getTimeout(30000) }
    );
    await saveButton.click();
    expect((await batchSaved).status()).toBe(200);
    await expect(dirtyIndicator).toBeHidden({ timeout: getTimeout(15000) });

    const printImageRequests: string[] = [];
    page.on('request', (req) => {
      if (
        /\/api\/construction-photos\/images\/[0-9a-f-]+\/print-image$/.test(
          new URL(req.url()).pathname
        )
      ) {
        printImageRequests.push(req.url());
      }
    });
    let downloads = 0;
    page.on('download', () => {
      downloads += 1;
    });

    // 先頭を下へ移動して未保存にする
    await items.nth(0).getByRole('button', { name: '下へ移動' }).click();
    await expect(dirtyIndicator).toBeVisible({ timeout: getTimeout(10000) });
    await expect(items.nth(1)).toContainText(names[0]!);

    const alerts = page.getByRole('main').getByRole('alert');
    await page.getByRole('button', { name: 'PDF出力' }).click();
    await expect(alerts.filter({ hasText: unsavedPdf })).toBeVisible({
      timeout: getTimeout(10000),
    });
    expect(printImageRequests).toEqual([]);

    await page.getByRole('button', { name: '全件エクスポート' }).click();
    await expect(alerts.filter({ hasText: unsavedZip })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(page.getByRole('dialog', { name: /全件一括エクスポート/ })).toHaveCount(0);
    expect(printImageRequests).toEqual([]);
    expect(downloads).toBe(0);

    // 保存すると並べ替えた順が保存され、PDF を出力できる
    const orderSaved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname === `/api/construction-photos/${albumId}/images/order`,
      { timeout: getTimeout(30000) }
    );
    await saveButton.click();
    expect((await orderSaved).status()).toBeLessThan(300);
    await expect(dirtyIndicator).toBeHidden({ timeout: getTimeout(15000) });

    const listResponse = await page.request.get(
      `${API_BASE_URL}/api/construction-photos/${albumId}/images`,
      {
        headers: {
          Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('accessToken'))}`,
        },
      }
    );
    expect(listResponse.status()).toBe(200);
    const listed = (await listResponse.json()) as { fileName: string; displayOrder: number }[];
    expect(
      [...listed].sort((a, b) => a.displayOrder - b.displayOrder).map((p) => p.fileName)
    ).toEqual([names[1], names[0]]);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(45000) });
    await page.getByRole('button', { name: 'PDF出力' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(printImageRequests).toHaveLength(2);
    await expect(alerts.filter({ hasText: unsavedPdf })).toHaveCount(0);
  });

  /**
   * R19.4 モバイル幅のブレッドクラム:
   * 375 幅で工事写真の詳細画面を開き、長いプロジェクト名・アルバム名を載せたブレッドクラムが
   * 水平にはみ出さないことを検証する。対象画面は Requirement 19（工事写真詳細画面の
   * レスポンシブ対応）の所管である詳細画面とする。
   *
   * @requirement construction-photo/REQ-19.4
   *
   * はみ出しうる条件を二つ測り、どちらでも同じ主張を課す。主張は、ブレッドクラム（nav）・
   * そのリスト（ol）・詳細画面がブレッドクラムを包む領域のいずれも scrollWidth が clientWidth を
   * 超えないこと（許容誤差1px）、ブレッドクラムが画面幅の内側にあること、詳細画面のコンテナ
   * （<main>）に水平のはみ出しが生じないことである。
   *  (1) 日本語の長い名前（区切りの無い数字の語を末尾に含む）: 前提として、最長の項目名の一行の
   *      自然幅がブレッドクラムの幅を超えること（折り返しが要る長さであること）と、ブレッドクラムが
   *      実際に複数行へ折り返されていることを主張する。
   *  (2) 区切りの無い英数字の長い一語のプロジェクト名（プロジェクト名は詳細画面ではブレッドクラムに
   *      しか現れないため、見出し等の他要素のはみ出しが混ざらない）: 前提として、その語の一行の
   *      自然幅がブレッドクラムの領域の幅を超えることを主張する。
   * 自然幅は画面の計算済みフォントで canvas の measureText により測る（折り返しの有無に依らない）。
   *
   * 是正の経緯（2026-10-01、タスク 19.2）: 本テストを書いた時点の実装（ブレッドクラムを包む領域に
   * overflow-x:auto だけを与える形）では (1) が赤だった。共通 Breadcrumb の項目は折り返さない flex
   * 行に並び、各項目の最小幅は区切りの無い語（末尾の「_」＋13桁の数字）の幅になる。その和が
   * 狭幅を超え、ブレッドクラム自身が水平にはみ出していた（nav の scrollWidth 389 / clientWidth 319）。
   * はみ出しは包む領域の水平スクロールへ収まり <main> へは及ばないが、ブレッドクラム自体は
   * 水平にはみ出していた。是正は `ConstructionPhotoDetailPage.tsx` の `breadcrumbWrapper` に
   * overflowWrap:anywhere を足し、項目へ継承させて語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない。本テストを書いた時点では、
   * アプリ共通ヘッダ（全画面共通のクロムで工事写真機能の範囲外）が 375 幅で水平にはみ出し、
   * 本機能の判定に使えなかった（2026-10-01 の実測で documentElement は scrollWidth 400 /
   * clientWidth 375）。共通ヘッダは user-authentication の Task 39.1 で是正済みであり
   * （2026-10-02 の実測で 375 / 375）、文書全体の主張は末尾の「文書全体を水平にはみ出させない」の
   * テストが担う（タスク 21.1）。
   *
   * 測定の前に、詳細画面のモバイル分岐（`containerMobile` の maxWidth:100%）が適用されるまで
   * 待つ。`useMediaQuery` は初期描画でデスクトップ側になり得るためである。
   */
  test('モバイル幅で長いプロジェクト名・アルバム名のブレッドクラムが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const japaneseProjectName = `東京都千代田区丸の内二丁目再開発計画に伴う超高層複合ビル新築工事および周辺道路整備工事_${stamp}`;
    const albumName = `外構工事における基礎配筋検査および型枠設置状況の記録写真アルバム第三工区_${stamp}`;
    const unbreakableProjectName = `MarunouchiRedevelopmentSkyscraperConstructionProject${stamp}`;
    const prisma = getPrismaClient();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'breadcrumb', japaneseProjectName);
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    const breadcrumb = page.getByRole('navigation', { name: 'パンくずナビゲーション' });

    /** 詳細画面を開き、モバイル分岐の適用を待ってからブレッドクラムを測る。 */
    const openAndMeasure = async (projectName: string) => {
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await expect(breadcrumb).toBeVisible();
      await expect(breadcrumb).toContainText(projectName);
      await expect(breadcrumb).toContainText(albumName);
      await expect
        .poll(
          async () =>
            breadcrumb.evaluate((nav) => {
              const main = nav.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');

      return breadcrumb.evaluate((nav) => {
        const area = nav.parentElement as HTMLElement;
        const list = nav.querySelector('ol') as HTMLElement;
        const main = nav.closest('main') as HTMLElement;
        const context = document.createElement('canvas').getContext('2d');
        const labels = Array.from(nav.querySelectorAll('li > a, li > span:not([aria-hidden])'));
        const naturalWidths = labels.map((label) => {
          const style = getComputedStyle(label);
          if (!context) return -1;
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          return context.measureText(label.textContent ?? '').width;
        });
        const navRect = nav.getBoundingClientRect();
        const areaRect = area.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          labels: labels.map((label) => label.textContent ?? ''),
          naturalWidths,
          lineHeight: parseFloat(getComputedStyle(list).lineHeight),
          nav: {
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            height: navRect.height,
            left: navRect.left,
            right: navRect.right,
          },
          list: { scrollWidth: list.scrollWidth, clientWidth: list.clientWidth },
          area: {
            scrollWidth: area.scrollWidth,
            clientWidth: area.clientWidth,
            left: areaRect.left,
            right: areaRect.right,
          },
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        };
      });
    };

    /** R19.4 の主張: ブレッドクラムとその周囲に水平のはみ出しが無い（許容誤差1px）。 */
    const expectNoHorizontalOverflow = (
      m: Awaited<ReturnType<typeof openAndMeasure>>,
      report: string
    ): void => {
      expect(m.nav.clientWidth).toBeGreaterThan(0);
      expect(m.nav.scrollWidth - m.nav.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.list.scrollWidth - m.list.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.area.scrollWidth - m.area.clientWidth, report).toBeLessThanOrEqual(1);
      expect(m.nav.left, report).toBeGreaterThanOrEqual(0);
      expect(m.nav.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
      expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    };

    // (1) 日本語の長い名前
    const wrapped = await openAndMeasure(japaneseProjectName);
    const wrappedReport = JSON.stringify(wrapped);
    expect(wrapped.viewportWidth).toBe(375);
    expect(wrapped.labels).toEqual([
      'ダッシュボード',
      'プロジェクト一覧',
      japaneseProjectName,
      '工事写真一覧',
      albumName,
    ]);
    // 前提: 名前は一行に収まらない長さであり、ブレッドクラムは実際に複数行へ折り返されている
    expect(Math.min(...wrapped.naturalWidths)).toBeGreaterThan(0);
    expect(Math.max(...wrapped.naturalWidths), wrappedReport).toBeGreaterThan(
      wrapped.nav.clientWidth
    );
    expect(wrapped.lineHeight).toBeGreaterThan(0);
    expect(wrapped.nav.height, wrappedReport).toBeGreaterThanOrEqual(wrapped.lineHeight * 2);
    expectNoHorizontalOverflow(wrapped, wrappedReport);

    // (2) 区切りの無い英数字の長い一語のプロジェクト名
    await prisma.project.update({
      where: { id: projectId },
      data: { name: unbreakableProjectName },
    });
    const unbreakable = await openAndMeasure(unbreakableProjectName);
    const unbreakableReport = JSON.stringify(unbreakable);
    expect(unbreakable.labels[2]).toBe(unbreakableProjectName);
    // 前提: プロジェクト名の一語の自然幅がブレッドクラムの領域の幅を超える
    expect(unbreakable.area.clientWidth).toBeGreaterThan(0);
    expect(unbreakable.naturalWidths[2], unbreakableReport).toBeGreaterThan(
      unbreakable.area.clientWidth
    );
    expectNoHorizontalOverflow(unbreakable, unbreakableReport);
  });

  /**
   * R19.1 モバイル幅の見出し領域:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い英数字の長い一語のアルバム名とメモを載せた
   * 見出し領域（h1 のアルバム名・p のメモ）が、詳細画面に横スクロールを生じさせないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、アルバム名とメモの一行の自然幅がいずれも詳細画面のコンテナ（<main>）の幅を
   * 超えること（折り返さなければはみ出す長さであること）を主張する。自然幅は画面の計算済み
   * フォントで canvas の measureText により測る（折り返しの有無に依らない。タスク 19.2 と同じ手法）。
   * そのうえで、<main> に水平のはみ出しが無いこと（許容誤差1px）、メモの段落の scrollWidth が
   * clientWidth を超えないこと、h1 とメモの右端が画面幅の内側にあることを主張する。
   *
   * 是正の経緯（2026-10-01、タスク 20.1）: 本テストを書いた時点の実装（`styles.title` /
   * `styles.memo` に折り返しの指定が無い形）では赤だった。アルバム名は最大 200 文字まで入力でき、
   * 区切りの無い一語は折り返されず、見出しが <main> を押し広げていた。是正は
   * `ConstructionPhotoDetailPage.tsx` の `styles.title` と `styles.memo` に overflowWrap:anywhere を
   * 足し、語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダの是正後の文書全体の主張は、末尾の「文書全体を水平にはみ出させない」の
   * テストが、区切りの無い長いアルバム名の状態を含めて担う）。測定の前に、詳細画面のモバイル分岐
   * （`containerMobile` の maxWidth:100%）が適用されるまで待つ。
   */
  test('モバイル幅で区切りの無い長いアルバム名・メモの見出しが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZone${stamp}`;
    const memo = `ExteriorWorksFoundationRebarInspectionMemorandumConcerningFormworkInstallationAndConcretePlacementSchedule${stamp}`;
    const prisma = getPrismaClient();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'heading');
    const albumId = await createAlbum(page, projectId, albumName);
    await prisma.constructionPhotoAlbum.update({ where: { id: albumId }, data: { memo } });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { level: 1, name: albumName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
    await expect(page.getByText(memo, { exact: true })).toBeVisible();
    await expect
      .poll(
        async () =>
          heading.evaluate((h1) => {
            const main = h1.closest('main');
            return main ? getComputedStyle(main).maxWidth : null;
          }),
        { timeout: getTimeout(15000) }
      )
      .toBe('100%');

    const m = await heading.evaluate((h1, memoText) => {
      const main = h1.closest('main') as HTMLElement;
      const memoEl = Array.from(main.querySelectorAll('p')).find(
        (p) => p.textContent === memoText
      ) as HTMLElement | undefined;
      const context = document.createElement('canvas').getContext('2d');
      const naturalWidth = (el: Element | undefined): number => {
        if (!el || !context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const box = (el: HTMLElement | undefined) =>
        el
          ? {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              right: el.getBoundingClientRect().right,
            }
          : null;
      return {
        viewportWidth: window.innerWidth,
        titleNaturalWidth: naturalWidth(h1),
        memoNaturalWidth: naturalWidth(memoEl),
        title: box(h1 as HTMLElement),
        memo: box(memoEl),
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      };
    }, memo);
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.title, report).not.toBeNull();
    expect(m.memo, report).not.toBeNull();
    expect(m.main.clientWidth, report).toBeGreaterThan(0);
    // 前提: アルバム名とメモの一語の自然幅が、いずれも詳細画面のコンテナの幅を超える
    expect(m.titleNaturalWidth, report).toBeGreaterThan(m.main.clientWidth);
    expect(m.memoNaturalWidth, report).toBeGreaterThan(m.main.clientWidth);

    // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
    expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    // 見出し・メモ自身も画面幅の内側に収まる。h1 は flex item として箱ごと広がる
    // （是正前も scrollWidth=clientWidth=1083 だった）ため、h1 のはみ出しは右端と <main> の主張で
    // 捉える。h1 の scrollWidth の主張に検出力は無い（タスク 20.1 のレビューで実測）
    expect(m.title!.clientWidth, report).toBeGreaterThan(0);
    expect(m.title!.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    expect(m.memo!.clientWidth, report).toBeGreaterThan(0);
    expect(m.memo!.scrollWidth, report).toBeLessThanOrEqual(m.memo!.clientWidth);
    expect(m.memo!.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
  });

  /**
   * R19.1 モバイル幅の写真項目のファイル名:
   * 375 幅で工事写真の詳細画面を開き、カメラ由来の現実的な長さの区切りの無いファイル名の画像を
   * 写真項目として追加したとき、写真項目のファイル名の見出し（h3）と、削除確認ダイアログの本文が
   * 詳細画面に横スクロールを生じさせないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * アンダースコアは折り返し位置にならないため、`IMG_20261001_143052_..._<stamp>.jpg` は一語として
   * 扱われる。前提として、ファイル名の一行の自然幅が見出しの幅（clientWidth）を超えること（折り返さ
   * なければはみ出す長さであること）を主張する。自然幅は画面の計算済みフォントで canvas の
   * measureText により測る（タスク 19.2・20.1 と同じ手法）。そのうえで、<main> に水平のはみ出しが
   * 無いこと（許容誤差1px）、見出しの scrollWidth が clientWidth を超えないこと、見出しの文字列の
   * 右端が画面幅の内側にあることを主張する。削除確認ダイアログでは、本文の段落の scrollWidth が
   * clientWidth を超えないことと、本文の文字列の右端が画面幅の内側にあることを主張する。見出しも
   * 段落も箱は親の幅に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく文字列（Range の
   * 外接矩形）で測る（20.1 の h1 は flex item として箱ごと広がったが、ここでは逆に箱が広がらない）。
   *
   * 是正の経緯（2026-10-01、タスク 20.3）: 本テストを書いた時点の実装（`PhotoItemPanel.tsx` の
   * `styles.fileName` と `styles.deleteDialogMessage` に折り返しの指定が無い形）では赤だった。
   * 実測は、<main> の scrollWidth 473 / clientWidth 343、見出しの scrollWidth 403 / clientWidth 203・
   * 文字列の右端 488.6（箱の右端は 289）、ダイアログ本文の scrollWidth 427 / clientWidth 290・
   * 文字列の右端 470.1（箱の右端は 332.3）である。是正は両者に overflowWrap:anywhere を足し、
   * 語の中にも折り返し位置を与えたことである。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。測定の前に、
   * 写真項目が縦積みのモバイル分岐に確定するまで待つ。
   */
  test('モバイル幅で区切りの無い長いファイル名の写真項目が水平にはみ出さない', async ({ page }) => {
    const stamp = Date.now();
    const fileName = `IMG_20261001_143052_foundation_rebar_${stamp}.jpg`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'filename');
    const albumId = await createAlbum(page, projectId, `ファイル名_${stamp}`);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    await upload;
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
    const heading = items.getByRole('heading', { level: 3, name: fileName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
    await expect
      .poll(
        async () =>
          items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
        { timeout: getTimeout(15000) }
      )
      .toBe('column');

    const m = await heading.evaluate((h3) => {
      const main = h3.closest('main') as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(h3);
      let naturalWidth = -1;
      if (context) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        naturalWidth = context.measureText(h3.textContent ?? '').width;
      }
      const range = document.createRange();
      range.selectNodeContents(h3);
      return {
        viewportWidth: window.innerWidth,
        naturalWidth,
        title: {
          scrollWidth: h3.scrollWidth,
          clientWidth: h3.clientWidth,
          boxRight: h3.getBoundingClientRect().right,
          textRight: range.getBoundingClientRect().right,
        },
        main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.title.clientWidth, report).toBeGreaterThan(0);
    expect(m.main.clientWidth, report).toBeGreaterThan(0);
    // 前提: ファイル名の一語の自然幅が見出しの幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.title.clientWidth);
    // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
    expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
    // 見出しのファイル名が見出しの箱からはみ出さず、その右端が画面幅の内側にある。見出しの箱は
    // 縦積みの写真項目の幅に固定され（是正前も clientWidth 203・箱の右端 289 で画面の内側）、
    // はみ出すのは中の文字列であるため、箱の右端ではなく文字列の右端（Range の外接矩形）を測る。
    // 箱の右端の主張に検出力は無い（タスク 20.3 で実測）
    expect(m.title.scrollWidth, report).toBeLessThanOrEqual(m.title.clientWidth);
    expect(m.title.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);

    // 削除確認ダイアログの本文もファイル名を載せる
    await items.getByRole('button', { name: `写真項目を削除: ${fileName}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const message = dialog.locator('p').filter({ hasText: fileName });
    await expect(message).toHaveCount(1);
    const d = await message.evaluate((p) => {
      const range = document.createRange();
      range.selectNodeContents(p);
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: p.scrollWidth,
        clientWidth: p.clientWidth,
        boxRight: p.getBoundingClientRect().right,
        textRight: range.getBoundingClientRect().right,
      };
    });
    const dialogReport = JSON.stringify(d);
    expect(d.clientWidth, dialogReport).toBeGreaterThan(0);
    expect(d.scrollWidth, dialogReport).toBeLessThanOrEqual(d.clientWidth);
    expect(d.textRight, dialogReport).toBeLessThanOrEqual(d.viewportWidth + 1);

    // 後始末: 削除せずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    await expect(items).toHaveCount(1);
  });

  /**
   * R19.1 モバイル幅の看板配置ダイアログの操作列:
   * 375 幅で工事写真の詳細画面から看板配置ダイアログを開き、区切りの無い英数字の長い工事件名の
   * 看板を選んだとき、配置エディタの操作列（看板バッジ・案内文・「保存」）が画面幅に収まることを
   * 検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、バッジの文字列の一行の自然幅が操作列の幅（clientWidth）を超えること（折り返さ
   * なければ操作列に収まらない長さであること）を主張する。自然幅は画面の計算済みフォントで canvas
   * の measureText により測る（タスク 19.2・20.1・20.3 と同じ手法）。そのうえで次を主張する。
   *  - 「保存」ボタンの箱の右端が画面幅の内側にある（許容誤差1px）。
   *  - 案内文の幅が、案内文の一行の自然幅と操作列の幅の小さい方を下回らない（許容誤差1px）。
   *    案内文は和文で文字ごとに折り返せるため、押し縮められても箱の外へははみ出さず、右端の主張
   *    では潰れを検出できない。操作列が折り返せるなら、案内文は一行に収まる幅か、収まらなければ
   *    操作列の全幅を得られる。これを下回るのは、同じ行の他の要素に幅を奪われて縦長に潰れている
   *    ことを意味する。
   *  - バッジの文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *
   * 是正の経緯（2026-10-01、タスク 20.4）: 本テストを書いた時点の実装（`SignboardPlacementEditor.tsx`
   * の `styles.toolbar` に flexWrap が無く、`styles.badge` に折り返しの指定が無い形）では赤だった。
   * 実測は、操作列の scrollWidth 572 / clientWidth 295、バッジの幅 477.5・文字列の右端 509.5、
   * 案内文の幅 24（自然幅 276）・高さ 216、「保存」の右端 611.5 である。是正は操作列に
   * flexWrap:wrap、バッジに overflowWrap:anywhere を足したことである。是正後は、バッジ・案内文・
   * 「保存」が別の行に並び、それぞれ幅 295・276・60 になる。
   * 検出力（変異で実測）: 操作列の flexWrap だけを外すと、案内文が幅 75.2 に潰れて案内文の主張が
   * 赤になる（バッジは自身の箱の中で折り返し、「保存」は右端 335 で画面内に残る）。バッジの
   * overflowWrap だけを外すと、バッジの文字列の右端が 509.5 になってバッジの主張が赤になる（操作列が
   * 折り返すため「保存」と案内文は次の行で画面内に収まる）。「保存」の主張は両方を欠く是正前の形で
   * 赤になる。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。
   */
  test('モバイル幅で区切りの無い長い工事件名でも看板配置ダイアログの操作列が画面内に収まる', async ({
    page,
  }) => {
    const stamp = Date.now();
    const workName = `SignboardWorkName${stamp}WithoutAnyBreakOpportunityForMobileToolbar`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'signboard-toolbar');
    const albumId = await createAlbum(page, projectId, `看板操作列_${stamp}`);

    // 配置用の工事看板を登録する（上の看板配置のテストと同じ手順）
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(workName);
    await page.getByLabel('工事場所').fill('看板操作列E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/construction-signboards/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    await createSignboardResp;
    await expect(page.getByRole('row').filter({ hasText: workName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await uploadPhoto(page, FIXTURE_JPG, 1);

    await page
      .getByTestId('construction-photo-item')
      .first()
      .getByRole('button', { name: /看板を(配置|変更)/ })
      .click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: workName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    const badge = editor.getByTestId('signboard-indicator');
    await expect(badge).toContainText(workName);
    const saveButton = editor.getByRole('button', { name: '保存' });
    await expect(saveButton).toBeVisible();
    const hint = editor.getByText('ドラッグで移動、ハンドルで大きさを調整できます');
    await expect(hint).toBeVisible();

    const m = await editor.evaluate((root) => {
      const badgeEl = root.querySelector('[data-testid="signboard-indicator"]') as HTMLElement;
      const toolbar = badgeEl.parentElement as HTMLElement;
      const hintEl = Array.from(toolbar.querySelectorAll('span')).find((el) =>
        (el.textContent ?? '').startsWith('ドラッグで移動')
      ) as HTMLElement;
      const button = Array.from(toolbar.querySelectorAll('button')).find(
        (el) => (el.textContent ?? '').trim() === '保存'
      ) as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const natural = (el: HTMLElement): number => {
        if (!context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const range = document.createRange();
      range.selectNodeContents(badgeEl);
      const rect = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return {
        viewportWidth: window.innerWidth,
        toolbar: { clientWidth: toolbar.clientWidth, scrollWidth: toolbar.scrollWidth },
        badge: {
          natural: natural(badgeEl),
          box: rect(badgeEl),
          textRight: range.getBoundingClientRect().right,
        },
        hint: { natural: natural(hintEl), box: rect(hintEl) },
        button: rect(button),
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.toolbar.clientWidth, report).toBeGreaterThan(0);
    // 前提: 件名の一語の自然幅が操作列の幅を超える（折り返さなければ操作列に収まらない長さ）
    expect(m.badge.natural, report).toBeGreaterThan(m.toolbar.clientWidth);
    // R19.1: 「保存」が画面外へ押し出されない
    expect(m.button.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 案内文が縦長に潰れない（一行の自然幅か操作列の全幅の小さい方を確保する）
    expect(m.hint.natural, report).toBeGreaterThan(0);
    expect(m.hint.box.width, report).toBeGreaterThanOrEqual(
      Math.min(m.hint.natural, m.toolbar.clientWidth) - 1
    );
    // 件名のバッジの文字列が画面幅の内側に収まる
    expect(m.badge.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);
  });

  /**
   * R19.1 モバイル幅のアルバムを取り除く確認ダイアログ:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い英数字の長い一語（100 文字超）のアルバム名で
   * アルバムを取り除く確認ダイアログを開いたとき、ダイアログが水平にはみ出さないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 前提として、アルバム名の一行の自然幅がダイアログの幅（clientWidth）を超えること（折り返さ
   * なければダイアログに収まらない長さであること）を主張する。自然幅は画面の計算済みフォントで
   * canvas の measureText により測る（タスク 19.2・20.1・20.3・20.4 と同じ手法）。そのうえで次を
   * 主張する。
   *  - ダイアログ（role=dialog）の scrollWidth が clientWidth を超えない。
   *  - ダイアログの中のパネル（ダイアログ直下の内容の箱）の scrollWidth が clientWidth を超えない。
   *  - アルバム名の文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *    ダイアログの箱は画面幅の 90% に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく
   *    文字列で測る（タスク 20.3 と同じ理由）。
   *
   * 是正の経緯（2026-10-01、タスク 20.5）: 本テストを書いた時点の実装（`AlbumDeleteDialog.tsx` の
   * `styles.albumName` に折り返しの指定が無い形）では赤だった。是正は `styles.albumName` に
   * overflowWrap:anywhere を足し、語の中にも折り返し位置を与えたことである。
   * 是正前の実測は、名前の自然幅 821.8、ダイアログの scrollWidth 866 / clientWidth 338、パネルの
   * scrollWidth 846 / clientWidth 298、文字列の右端 884.5（ダイアログの箱の右端は 356.3）である。
   * 是正後は、ダイアログ 338 / 338、パネル 298 / 298、文字列の右端 309.6 になる。
   * 検出力（変異で実測）: 是正の指定だけを外し、三つの主張を一時的に soft にして流すと、三つとも
   * それぞれ赤になる（ダイアログ 866 > 338、パネル 846 > 298、右端 884.5 > 376）。
   *
   * ダイアログは「キャンセル」で閉じ、アルバムは取り除かない。文書全体（documentElement）の
   * scrollWidth は本テストでは測らない（上のブレッドクラムのテストの注記と同じ経緯。共通ヘッダは
   * 是正済みで、文書全体の主張は末尾のテストが担う）。
   */
  test('モバイル幅で区切りの無い長いアルバム名でもアルバムを取り除く確認ダイアログが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZoneConcretePlacementSchedule${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'album-dialog');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    const heading = page.getByRole('heading', { level: 1, name: albumName });
    await expect(heading).toBeVisible({ timeout: getTimeout(15000) });

    await page.getByRole('button', { name: '削除', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'アルバムの削除' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const nameEl = dialog.locator('span').filter({ hasText: albumName });
    await expect(nameEl).toHaveCount(1);

    const m = await nameEl.evaluate((span) => {
      const dialogEl = span.closest('[role="dialog"]') as HTMLElement;
      const panel = dialogEl.firstElementChild as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const style = getComputedStyle(span);
      let naturalWidth = -1;
      if (context) {
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        naturalWidth = context.measureText(span.textContent ?? '').width;
      }
      const range = document.createRange();
      range.selectNodeContents(span);
      const box = (el: HTMLElement) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        right: el.getBoundingClientRect().right,
      });
      return {
        viewportWidth: window.innerWidth,
        naturalWidth,
        dialog: box(dialogEl),
        panel: box(panel),
        textRight: range.getBoundingClientRect().right,
      };
    });
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.dialog.clientWidth, report).toBeGreaterThan(0);
    expect(m.panel.clientWidth, report).toBeGreaterThan(0);
    // 前提: アルバム名の一語の自然幅がダイアログの幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.dialog.clientWidth);
    // R19.1: ダイアログとその中のパネルに水平のはみ出しが無い
    expect(m.dialog.scrollWidth, report).toBeLessThanOrEqual(m.dialog.clientWidth);
    expect(m.panel.scrollWidth, report).toBeLessThanOrEqual(m.panel.clientWidth);
    // アルバム名の文字列が画面幅の内側に収まる
    expect(m.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);

    // 後始末: 取り除かずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    await expect(heading).toBeVisible();
  });

  /**
   * R19.1 モバイル幅の現場調査写真の選択ダイアログ:
   * 375 幅で工事写真の詳細画面から「現場調査写真から選択」のダイアログを開き、区切りの無い英数字の
   * 長い一語（100 文字超）の調査名を持つ現場調査が候補に出たとき、候補一覧が水平にはみ出さず、
   * 調査名の右の枚数表示が見えない位置へ押し出されないことを検証する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 現場調査は同じプロジェクトに UI で作成し、画像を1枚アップロードする（site-survey の
   * site-survey-responsive.spec.ts と同じ手順）。調査名は 200 文字まで入力できる。
   *
   * 前提として、調査名の一行の自然幅がダイアログの本文（候補一覧を包む縦スクロールの箱）の
   * clientWidth を超えること（折り返さなければ本文に収まらない長さであること）を主張する。
   * 自然幅は画面の計算済みフォントで canvas の measureText により測る（タスク 20.5 と同じ手法）。
   * そのうえで次を主張する。
   *  - 本文の scrollWidth が clientWidth を超えない（ダイアログ内に横スクロールが出ない）。
   *  - 調査名の文字列の右端（Range の外接矩形）が画面幅の内側にある（許容誤差1px）。
   *  - 枚数表示の右端が画面幅の内側にある（許容誤差1px。押し出されていない）。
   *  - 枚数表示の文字列の幅が一行の自然幅を下回らない（許容誤差1px。縮められて「1」と「枚」が
   *    縦に割れていない）。
   * ダイアログの箱は画面幅の 90% に固定され、広がるのは中の本文であるため、ダイアログの箱ではなく
   * 本文と文字列で測る。
   *
   * 是正の経緯（2026-10-02、タスク 20.7）: 本テストを書いた時点の実装（`SurveyImagePicker.tsx` の
   * 調査名の span に折り返しの指定が無い形）では赤だった。是正は二つである。調査名に
   * overflowWrap:anywhere を足して語の中にも折り返し位置を与えたことと、枚数表示に flexShrink:0 を
   * 足して長い調査名と同じ行で縮められないようにしたことである。調査名の側に minWidth:0 は要らない
   * （overflowWrap:anywhere で最小内容幅そのものが小さくなるため、本文は 290 / 290 に収まる）。
   * 是正前の実測は、名前の自然幅 769.3、本文の scrollWidth 800 / clientWidth 290、調査名の右端
   * 829.1、枚数表示の右端 843.1（幅 14・高さ 37 の二行に割れていた）である。是正後は、本文
   * 290 / 290、調査名の右端 289.0、枚数表示の右端 315.3（幅 25.1 で自然幅 25.1 と一致）になる。
   * 検出力（変異で実測）: 主張を一時的に soft にして流すと、overflowWrap だけを外した変異では
   * 本文（811 > 290）・調査名の右端（829.1 > 376）・枚数表示の右端（854.2 > 376）の三つが赤になり、
   * flexShrink だけを外した変異では枚数表示の幅（14 < 24.1）が赤になる。
   *
   * ダイアログは「キャンセル」で閉じ、写真は追加しない。文書全体（documentElement）の scrollWidth は
   * 本テストでは測らない（上のブレッドクラムのテストの注記と同じ経緯）。
   */
  test('モバイル幅で区切りの無い長い調査名でも現場調査写真の選択ダイアログが水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const surveyName = `FoundationRebarInspectionAndFormworkInstallationSiteSurveyForThirdZoneConcretePlacementSchedule${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'survey-picker');

    // 同じプロジェクトに長い調査名の現場調査を作り、画像を1枚登録する
    await page.goto(`/projects/${projectId}/site-surveys/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByLabel(/調査名/i)).toBeVisible({ timeout: getTimeout(10000) });
    await page.getByLabel(/調査名/i).fill(surveyName);
    await page.getByLabel(/調査日/i).fill(new Date().toISOString().split('T')[0]!);
    const createSurvey = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        /\/api\/projects\/[0-9a-f-]+\/site-surveys$/.test(r.url()),
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: /^作成$/i }).click();
    expect((await createSurvey).ok()).toBe(true);
    await page.waitForURL(/\/site-surveys\/[0-9a-f-]+$/, { timeout: getTimeout(15000) });
    await page.waitForLoadState('networkidle');
    const surveyUpload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/site-surveys\/.+\/images$/.test(r.url()),
      { timeout: getTimeout(60000) }
    );
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_JPG);
    expect((await surveyUpload).ok()).toBe(true);

    const albumId = await createAlbum(page, projectId, `調査選択_${stamp}`);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: `調査選択_${stamp}` })).toBeVisible({
      timeout: getTimeout(15000),
    });

    await page.getByRole('button', { name: /現場調査写真から選択/ }).click();
    const dialog = page.getByRole('dialog', { name: '現場調査写真から選択' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const candidate = dialog.getByRole('button', { name: new RegExp(surveyName) });
    await expect(candidate).toBeVisible({ timeout: getTimeout(15000) });
    await expect(candidate).toContainText('1 枚');

    const m = await candidate.evaluate((button, name) => {
      const spans = Array.from(button.querySelectorAll(':scope > span')) as HTMLElement[];
      const nameEl = spans.find((el) => el.textContent === name) as HTMLElement;
      const countEl = spans.find((el) => /枚$/.test(el.textContent ?? '')) as HTMLElement;
      const body = button.parentElement!.parentElement as HTMLElement;
      const context = document.createElement('canvas').getContext('2d');
      const measure = (el: HTMLElement) => {
        if (!context) return -1;
        const style = getComputedStyle(el);
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(el.textContent ?? '').width;
      };
      const textRect = (el: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const r = range.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return {
        viewportWidth: window.innerWidth,
        naturalWidth: measure(nameEl),
        countNaturalWidth: measure(countEl),
        body: { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth },
        name: textRect(nameEl),
        count: textRect(countEl),
      };
    }, surveyName);
    const report = JSON.stringify(m);

    expect(m.viewportWidth).toBe(375);
    expect(m.body.clientWidth, report).toBeGreaterThan(0);
    // 前提: 調査名の一語の自然幅が本文の幅を超える（折り返さなければはみ出す長さ）
    expect(m.naturalWidth, report).toBeGreaterThan(m.body.clientWidth);
    // R19.1: 本文に水平のはみ出しが無い（ダイアログ内に横スクロールが出ない）
    expect(m.body.scrollWidth, report).toBeLessThanOrEqual(m.body.clientWidth);
    // 調査名の文字列が画面幅の内側に収まる
    expect(m.name.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 枚数表示が見えない位置へ押し出されず、画面幅の内側に収まる
    expect(m.count.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    // 枚数表示が縮められず、一行の自然幅を保つ（「1」と「枚」が縦に割れない）
    expect(m.countNaturalWidth, report).toBeGreaterThan(0);
    expect(m.count.width, report).toBeGreaterThanOrEqual(m.countNaturalWidth - 1);

    // 後始末: 写真を追加せずにダイアログを閉じる
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
  });

  /**
   * R19.1 モバイル幅の通知とエラー表示:
   * 375 幅で工事写真の詳細画面を開き、区切りの無い長い文字列を載せた通知とエラー表示が、詳細画面に
   * 横スクロールを生じさせず、文字列が枠の外へ描かれないことを検証する。対象は次の三つである。
   *  (1) アップロード失敗の通知（role=alert）: カメラ由来の現実的な長さの区切りの無いファイル名の
   *      画像のアップロードを失敗させる。通知の本文は「全1件の追加に失敗しました。」の次の行に
   *      ファイル名を置く（`PhotoUploader.tsx` の `buildNotice`）。
   *  (2) アップロードできないファイルの表示（共有のアップロード部品が出す role=alert）: 同じ形の
   *      ファイル名で、サイズ上限（50MB）を超えるファイルを選ぶ。表示は「<ファイル名>: ファイル
   *      サイズが50MBを超えています。」となる。
   *  (3) アルバムを取得できないときのエラー表示（role=alert）: アルバムの取得を、区切りの無い長い
   *      一語を理由に持つ応答へ差し替える。画面は応答の理由をそのまま表示する。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * アンダースコアは折り返し位置にならないため、ファイル名は一語として扱われる。(1) のアップロードの
   * POST は `page.route` で 500 の応答へ差し替える。サーバーの処理中の失敗は自動再試行の対象外で
   * あるため、差し替えた1回の応答で失敗が確定し、通知と未送信画像の表示が出る。(2) は送信前の検査で
   * 拒まれるため、POST は発生しない。ファイルは中身の無い 50MB+1 バイトの疎なファイルをテストの
   * 出力先に作り、終わりに消す。
   *
   * 三つとも同じ主張を課す。前提として、文字列の一行の自然幅が、それを載せる箱の幅（clientWidth）を
   * 超えること（折り返さなければ箱に収まらない長さであること）を主張する。自然幅は画面の計算済み
   * フォントで canvas の measureText により測る（タスク 20.3・20.5・20.7 と同じ手法）。そのうえで
   * 次を主張する。
   *  - <main> に水平のはみ出しが無い（許容誤差1px）。
   *  - 文字列を載せる箱と、それを包む枠（role=alert）の scrollWidth が clientWidth を超えない。
   *  - 文字列の右端（Range の外接矩形）が、箱の右端と画面幅の内側にある（許容誤差1px）。箱は
   *    写真項目の区画の幅に固定され、はみ出すのは中の文字列であるため、右端は箱ではなく文字列で
   *    測る（タスク 20.3 と同じ理由）。
   *
   * 是正の経緯（2026-10-02、タスク 20.8）: 本テストを書いた時点の実装（`ConstructionPhotoDetailPage.tsx`
   * の `styles.notice`・`styles.errorText` に折り返しの指定が無く、アップロード部品を包む
   * `styles.uploaderWrapper` にも無い形）では、三つとも赤だった。是正は三つのスタイルに
   * overflowWrap:anywhere を足したことである。(2) の表示は共有の部品が描くため、包む側に指定して
   * 継承させた（タスク 19.2 のブレッドクラムと同じ手法）。
   * 是正前の実測（主張を一時的に soft にして流し、三つの表示のすべての主張が赤になることを確認）:
   *  (1) 自然幅 399.4、<main> 453 / 343、通知 415 / 267、文字列の右端 469.4（箱の右端 322）。
   *  (2) 自然幅 425.1、<main> 498 / 343、項目 428 / 223、枠 460 / 267、文字列の右端 511.1（箱の右端 309）。
   *  (3) 自然幅 636.0、<main> 673 / 343、段落 636 / 269、枠 660 / 317、文字列の右端 689.0（箱の右端 322）。
   * 是正後は、<main> がいずれも 343 / 343、箱と枠の scrollWidth が clientWidth に一致し、文字列の
   * 右端は (1) 303.0、(2) 307.3、(3) 321.9 になる。
   *
   * 文書全体（documentElement）の scrollWidth は本テストでは測らない（上のブレッドクラムのテストの
   * 注記と同じ経緯。共通ヘッダは是正済みで、文書全体の主張は末尾のテストが担う）。測定の前に、
   * 詳細画面のモバイル分岐（`containerMobile` の maxWidth:100%）が適用されるまで待つ。
   */
  test('モバイル幅で区切りの無い長いファイル名・文言でも通知とエラー表示が水平にはみ出さない', async ({
    page,
  }, testInfo) => {
    const stamp = Date.now();
    const fileName = `IMG_20261001_143052_foundation_rebar_${stamp}.jpg`;
    const oversizeFileName = `IMG_20261001_143052_foundation_rebar_oversize_${stamp}.jpg`;
    const albumName = `失敗通知_${stamp}`;
    const fetchErrorDetail = `AlbumFetchFailureReasonWithoutAnyBreakOpportunityForMobileWidthErrorDisplay${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'upload-notice');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });

    /** 詳細画面を開き、モバイル分岐の適用を待つ。 */
    const openDetail = async (): Promise<void> => {
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      const heading = page.getByRole('heading', { level: 1, name: albumName });
      await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
      await expect
        .poll(
          async () =>
            heading.evaluate((h1) => {
              const main = h1.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');
    };

    /**
     * 文字列 text を直に載せる箱 box について、文字列の自然幅・右端と、箱・枠（role=alert）・
     * <main> の幅を測る。
     */
    const measureText = (box: import('@playwright/test').Locator, text: string) =>
      box.evaluate((el, target) => {
        const main = el.closest('main') as HTMLElement;
        const frame = el.closest('[role="alert"]') as HTMLElement;
        const context = document.createElement('canvas').getContext('2d');
        const style = getComputedStyle(el);
        let naturalWidth = -1;
        if (context) {
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          naturalWidth = context.measureText(target).width;
        }
        // 箱の本文のうち、対象の文字列の部分だけを Range で囲む
        let textRight = -1;
        const textNode = Array.from(el.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(target)
        );
        if (textNode) {
          const start = (textNode.textContent ?? '').indexOf(target);
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + target.length);
          textRight = range.getBoundingClientRect().right;
        }
        return {
          viewportWidth: window.innerWidth,
          naturalWidth,
          box: {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            right: el.getBoundingClientRect().right,
          },
          frame: { scrollWidth: frame.scrollWidth, clientWidth: frame.clientWidth },
          textRight,
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
        };
      }, text);

    /** 前提と R19.1 の主張（三つの表示に共通）。 */
    const expectTextFits = (m: Awaited<ReturnType<typeof measureText>>, label: string): void => {
      const report = `${label} ${JSON.stringify(m)}`;
      expect(m.viewportWidth, report).toBe(375);
      expect(m.box.clientWidth, report).toBeGreaterThan(0);
      expect(m.frame.clientWidth, report).toBeGreaterThan(0);
      expect(m.main.clientWidth, report).toBeGreaterThan(0);
      // 前提: 文字列の一語の自然幅が箱の幅を超える（折り返さなければはみ出す長さ）
      expect(m.naturalWidth, report).toBeGreaterThan(m.box.clientWidth);
      // 前提: 文字列を箱の本文の中に見つけ、その位置を測れている
      expect(m.textRight, report).toBeGreaterThan(0);
      // R19.1: 詳細画面のコンテナに水平のはみ出しが無い（許容誤差1px）
      expect(m.main.scrollWidth - m.main.clientWidth, report).toBeLessThanOrEqual(1);
      // 箱と枠に水平のはみ出しが無い
      expect(m.box.scrollWidth, report).toBeLessThanOrEqual(m.box.clientWidth);
      expect(m.frame.scrollWidth, report).toBeLessThanOrEqual(m.frame.clientWidth);
      // 文字列が箱と画面幅の内側に収まる
      expect(m.textRight, report).toBeLessThanOrEqual(m.box.right + 1);
      expect(m.textRight, report).toBeLessThanOrEqual(m.viewportWidth + 1);
    };

    // (1) アップロード失敗の通知。アップロードの POST だけを失敗させる（同じパスの GET は素通しする）
    await openDetail();
    await page.route(UPLOAD_URL_MATCHER, failUploadPost);
    try {
      const failed = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          UPLOAD_URL_MATCHER(new URL(r.url())) &&
          r.status() === 500,
        { timeout: getTimeout(60000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name: fileName,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await failed;

      const notice = page.getByRole('alert').filter({ hasText: '全1件の追加に失敗しました。' });
      await expect(notice).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(notice).toContainText(fileName);
      // 未送信画像の表示が出そろってから測る（通知の下の配置が確定した状態で測る）
      await expect(page.getByTestId('pending-upload-panel')).toBeVisible({
        timeout: getTimeout(20000),
      });
      await expect(page.getByTestId('construction-photo-item')).toHaveCount(0);

      expectTextFits(await measureText(notice, fileName), '(1) アップロード失敗の通知');
    } finally {
      await page.unroute(UPLOAD_URL_MATCHER, failUploadPost);
    }

    // (2) アップロードできないファイルの表示。サイズ上限（50MB）を1バイト超える疎なファイルを選ぶ
    await openDetail();
    const oversizePath = testInfo.outputPath(oversizeFileName);
    fs.mkdirSync(path.dirname(oversizePath), { recursive: true });
    fs.writeFileSync(oversizePath, '');
    fs.truncateSync(oversizePath, 50 * 1024 * 1024 + 1);
    try {
      await page.getByTestId('file-input').setInputFiles(oversizePath);
      const validation = page.getByTestId('validation-errors');
      await expect(validation).toBeVisible({ timeout: getTimeout(20000) });
      const rejected = validation.getByRole('listitem').filter({ hasText: oversizeFileName });
      await expect(rejected).toHaveCount(1);
      await expect(rejected).toContainText('ファイルサイズが50MBを超えています');

      expectTextFits(
        await measureText(rejected, oversizeFileName),
        '(2) アップロードできないファイルの表示'
      );
    } finally {
      fs.rmSync(oversizePath, { force: true });
    }

    // (3) アルバムを取得できないときのエラー表示。アルバムの取得だけを失敗させる
    const albumUrlMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/${albumId}`);
    const failAlbumFetch = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: fetchErrorDetail,
          code: 'NOT_FOUND',
        }),
      });
    };
    await page.route(albumUrlMatcher, failAlbumFetch);
    try {
      await page.goto(`/construction-photos/${albumId}`);
      const errorDisplay = page.getByRole('alert').filter({ hasText: fetchErrorDetail });
      await expect(errorDisplay).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(errorDisplay.getByRole('button', { name: '再試行' })).toBeVisible();
      await expect
        .poll(
          async () =>
            errorDisplay.evaluate((el) => {
              const main = el.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');
      const errorText = errorDisplay.locator('p').filter({ hasText: fetchErrorDetail });
      await expect(errorText).toHaveCount(1);

      expectTextFits(
        await measureText(errorText, fetchErrorDetail),
        '(3) アルバムを取得できないときのエラー表示'
      );
    } finally {
      await page.unroute(albumUrlMatcher, failAlbumFetch);
    }
  });

  /**
   * R19.1 モバイル幅の文書全体:
   * admin と user（一般の利用者ロール）のそれぞれで、375 幅と 320 幅の工事写真の詳細画面を開き、
   * 文書全体（`document.documentElement`）に水平のはみ出しが無いこと（scrollWidth と clientWidth の
   * 差が許容誤差 1px 以内）を検証する。詳細画面のコンテナ（<main>）についても同じ主張を課す。
   *
   * @requirement construction-photo/REQ-19.1
   *
   * 経緯（2026-10-02、タスク 21.1）: 受入基準 19.1 は「工事写真詳細画面を横スクロールが発生しない
   * レイアウトで表示する」であり、利用者が実際に横へ動かせるのは文書全体である。上の 19.1 の
   * テストはいずれも <main> で測っており、文書全体は主張の外にあった。アプリ共通ヘッダ
   * （`frontend/src/components/Navigation/AppHeader.css`。所有は user-authentication）がモバイル幅で
   * 文書全体を押し広げていたためである。共通ヘッダは user-authentication の Task 39.1（コミット
   * `d7701b08`）で是正されたので、本テストが文書全体の主張を足す。
   *
   * 測る状態は五つである。名前は、四つが普通の長さ、一つが区切りの無い英数字の長い一語である。
   *  - admin・375 幅、admin・320 幅（管理メニューを持ち、ヘッダの項目が最も多い）
   *  - user・375 幅、user・320 幅（user 自身が所有するプロジェクトのアルバム。R17.2 のテストと
   *    同じく user 自身に作らせる）
   *  - admin・375 幅・区切りの無い長いアルバム名（<main> の水準では上の見出しのテストが扱う。
   *    ここでは、ヘッダの是正後に文書全体を押し広げるものが他に無いことを主張する）
   * どのアルバムにも写真項目を 1 枚置き、写真項目が描かれた状態で測る。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が設定した幅に一致する。
   *  - 共通ヘッダ（header[role="banner"]）が表示されている。admin では管理メニューのトリガーが在り、
   *    user では無い（ログインした利用者のロールがヘッダへ届いていることの確認）。
   *  - 詳細画面の見出し（h1 のアルバム名）と写真項目が表示されている。
   *  - 見出しを含む <main> が在り、モバイル分岐（`containerMobile` の maxWidth:100%）が適用済みで、
   *    写真項目が縦積みに確定している（`useMediaQuery` は初期描画でデスクトップ側になり得る）。
   *  - 長い名前の状態では、名前の一行の自然幅が <main> の幅を超える（canvas の measureText）。
   *
   * 五つの状態をすべて測ってから主張する。赤になるときに、どの状態が何 px だったかを一度の
   * 失敗で読めるようにするためである。
   *
   * 検出力の実測（2026-10-02、タスク 21.1）: `AppHeader.css` だけを Task 39.1 の是正前
   * （コミット `116b4ddb` 時点）の内容へ戻した本番ビルドで本テストを実行すると、文書全体の主張が
   * 赤になった。documentElement の scrollWidth / clientWidth は、admin・375 幅が 400 / 375、
   * admin・320 幅が 400 / 320、user・320 幅が 350 / 320、admin・375 幅・長い名前が 400 / 375 である。
   * user・375 幅は是正前も 375 / 375 で赤にならない（是正前から収まっていた状態であり、本テストの
   * この状態の主張は是正への依存を示さない。退行の検出のために残す）。<main> は五つとも是正前から
   * scrollWidth と clientWidth が一致していた（375 幅は 343 / 343、320 幅は 288 / 288）。
   * ファイルを戻して作り直すと、五つとも文書全体の scrollWidth と clientWidth が一致し、緑に戻った。
   */
  test('モバイル幅（375・320）で admin と user のどちらでも詳細画面が文書全体を水平にはみ出させない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const adminAlbum = `文書全体_admin_${stamp}`;
    const userAlbum = `文書全体_user_${stamp}`;
    const longAlbum = `FoundationRebarInspectionAndFormworkInstallationRecordAlbumForThirdZone${stamp}`;
    const HORIZONTAL_TOLERANCE_PX = 1;

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    interface Box {
      scrollWidth: number;
      clientWidth: number;
    }
    const measurements: Array<{ label: string; document: Box; main: Box }> = [];

    /** アルバムを作り、詳細画面で写真項目を 1 枚追加する。 */
    const createAlbumWithPhoto = async (projectId: string, albumName: string): Promise<string> => {
      const albumId = await createAlbum(page, projectId, albumName);
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
        timeout: getTimeout(15000),
      });
      await uploadPhoto(page, FIXTURE_JPG, 1);
      return albumId;
    };

    /** 指定の幅で詳細画面を開き、前提を確かめてから文書全体と <main> の幅を測って記録する。 */
    const measure = async (
      role: 'admin' | 'user',
      width: number,
      albumId: string,
      albumName: string,
      nameKind: '普通の名前' | '区切りの無い長い名前'
    ): Promise<void> => {
      const label = `${role}・${width} 幅・${nameKind}`;
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');

      // 前提: 共通ヘッダと詳細画面の見出し・写真項目が表示されている
      const header = page.locator('header[role="banner"]');
      await expect(header, label).toBeVisible();
      const heading = page.getByRole('heading', { level: 1, name: albumName });
      await expect(heading, label).toBeVisible({ timeout: getTimeout(15000) });
      const items = page.getByTestId('construction-photo-item');
      await expect(items, label).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(items.first(), label).toBeVisible();
      // 前提: ログインした利用者のロールがヘッダへ届いている（管理メニューは admin だけが持つ）
      await expect(header.locator('.app-header-admin-trigger'), label).toHaveCount(
        role === 'admin' ? 1 : 0
      );

      // 前提: 見出しを含む <main> が在り、モバイル分岐が適用済みで、写真項目が縦積みに確定している
      await expect
        .poll(
          async () =>
            heading.evaluate((h1) => {
              const main = h1.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { message: label, timeout: getTimeout(15000) }
        )
        .toBe('100%');
      await expect
        .poll(
          async () =>
            items.first().evaluate((el) => getComputedStyle(el as HTMLElement).flexDirection),
          { message: label, timeout: getTimeout(15000) }
        )
        .toBe('column');

      const m = await heading.evaluate((h1) => {
        const main = h1.closest('main');
        const root = document.documentElement;
        const context = document.createElement('canvas').getContext('2d');
        let titleNaturalWidth = -1;
        if (context) {
          const style = getComputedStyle(h1);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          titleNaturalWidth = context.measureText(h1.textContent ?? '').width;
        }
        return {
          viewportWidth: window.innerWidth,
          titleNaturalWidth,
          document: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
          main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
        };
      });
      const report = `${label} ${JSON.stringify(m)}`;

      // 前提: 画面幅が設定した幅であり、文書全体と <main> を測れている
      expect(m.viewportWidth, report).toBe(width);
      expect(m.document.clientWidth, report).toBeGreaterThan(0);
      expect(m.document.clientWidth, report).toBeLessThanOrEqual(width);
      expect(m.main, report).not.toBeNull();
      expect(m.main!.clientWidth, report).toBeGreaterThan(0);
      // 前提: 名前の自然幅を測れている（測れなければ -1）。区切りの無い長い名前では、その一語の自然幅が
      // <main> の幅を超える（折り返さなければはみ出す長さ）。名前の種類で主張を分岐させず、下回っては
      // ならない幅を種類ごとに決めて無条件に主張する（普通の名前は 0、長い名前は <main> の幅）
      const titleNaturalWidthFloor = nameKind === '区切りの無い長い名前' ? m.main!.clientWidth : 0;
      expect(m.titleNaturalWidth, report).toBeGreaterThan(titleNaturalWidthFloor);

      measurements.push({ label, document: m.document, main: m.main! });
    };

    // admin: 自身のプロジェクトに、普通の名前と区切りの無い長い名前のアルバムを作る
    await loginAsUser(page, 'ADMIN_USER');
    const adminProject = await createProject(page, 'document-admin');
    const adminAlbumIdForDocument = await createAlbumWithPhoto(adminProject, adminAlbum);
    const longAlbumId = await createAlbumWithPhoto(adminProject, longAlbum);

    await measure('admin', 375, adminAlbumIdForDocument, adminAlbum, '普通の名前');
    await measure('admin', 320, adminAlbumIdForDocument, adminAlbum, '普通の名前');
    await measure('admin', 375, longAlbumId, longAlbum, '区切りの無い長い名前');

    // user へ切り替える（プロジェクトの作成はデスクトップ幅で行う）
    await page.setViewportSize(desktopViewport!);
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginAsUser(page, 'REGULAR_USER');
    const userProject = await createProject(page, 'document-user');
    const userAlbumId = await createAlbumWithPhoto(userProject, userAlbum);

    await measure('user', 375, userAlbumId, userAlbum, '普通の名前');
    await measure('user', 320, userAlbumId, userAlbum, '普通の名前');

    // 五つの状態をすべて測れている（測り漏らした状態を緑に数えない）
    expect(measurements.map((m) => m.label)).toEqual([
      'admin・375 幅・普通の名前',
      'admin・320 幅・普通の名前',
      'admin・375 幅・区切りの無い長い名前',
      'user・375 幅・普通の名前',
      'user・320 幅・普通の名前',
    ]);

    const report = measurements
      .map(
        (m) =>
          `${m.label}: documentElement ${m.document.scrollWidth}/${m.document.clientWidth}、` +
          `<main> ${m.main.scrollWidth}/${m.main.clientWidth}`
      )
      .join(' ｜ ');
    const overflowing = (pick: (m: (typeof measurements)[number]) => Box): string[] =>
      measurements
        .filter((m) => pick(m).scrollWidth - pick(m).clientWidth > HORIZONTAL_TOLERANCE_PX)
        .map((m) => `${m.label}: ${pick(m).scrollWidth}/${pick(m).clientWidth}`);

    // R19.1: 詳細画面のコンテナ（<main>）に水平のはみ出しが無い（許容誤差1px）
    expect(
      overflowing((m) => m.main),
      report
    ).toEqual([]);
    // R19.1: 文書全体（documentElement）に水平のはみ出しが無い（許容誤差1px）
    expect(
      overflowing((m) => m.document),
      report
    ).toEqual([]);
  });

  /**
   * モバイル幅のブレッドクラム（一覧・作成・編集・詳細）:
   * 375 幅と 320 幅で、工事写真の一覧・アルバム作成・アルバム編集・詳細の各画面を開き、共通の
   * ブレッドクラムが水平にはみ出さず、固定の文言の短い項目（「ダッシュボード」「プロジェクト一覧」
   * 「工事写真一覧」「新規アルバム」「アルバムを編集」）が一行に収まることを検証する。
   *
   * 要件の印は掲げない。一覧（Requirement 3）のモバイルの受入基準はカード形式（3.2）だけで、作成・
   * 編集（Requirement 1・2）はモバイルの受入基準を持たない。Requirement 19 の対象は詳細画面で、
   * その受入基準 4（ブレッドクラムが水平にはみ出さない）は上の「長いプロジェクト名・アルバム名の
   * ブレッドクラム」のテストが担う。短い項目が縦長にならないことは、どの受入基準にも当たらない
   * （タスク 20.2・20.6 の利用者の判断: 被覆印は受入基準を持つ画面に限って掲げる）。
   *
   * プロジェクト名は三通りを測る。普通の名前、区切りの無い英数字の長い一語（200 文字）、長い和文で
   * ある。名前はデータベースで差し替える（タスク 19.2 のテストと同じ手法）。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が設定した幅に一致する。
   *  - ブレッドクラムの項目が、その画面の階層どおりの文言で並んでいる。
   *  - 見出しを含む <main> の maxWidth が、その画面のモバイル幅での値に確定している（一覧は 1200px、
   *    作成・編集は 768px、詳細はモバイル分岐の適用後の 100%）。
   *  - 長い名前の二通りでは、プロジェクト名の一行の自然幅がブレッドクラムの幅を超える（折り返さ
   *    なければはみ出す長さである）。自然幅は画面の計算済みフォントで canvas の measureText により測る。
   *  - 各項目の文字列と、その先頭の一文字を Range で測れている。
   *
   * 主張（24 の状態をすべて測ってから主張する。赤になるときに、どの状態が何 px だったかを一度の
   * 失敗で読めるようにするためである）:
   *  - ブレッドクラム（nav）・画面のコンテナ（<main>）・文書全体（documentElement）の scrollWidth が
   *    clientWidth を超えない（許容誤差 1px）。
   *  - どの項目の文字列（Range の外接矩形）も、ブレッドクラムと画面幅の内側にある（許容誤差 1px）。
   *    項目は flex の子で中身に合わせて広がるため、位置は項目の箱ではなく文字列で測る。
   *  - 固定の文言の項目は、文字列全体の高さが一行の高さを超えない（許容誤差 1px）。一行の高さは、
   *    同じ項目の先頭の一文字を Range で囲んで実測する（決め打ちの数値を使わない）。
   *  - 長い名前の二通りでは、名前が項目の中で複数行へ折り返されている（文字列全体の高さが一行の
   *    高さの 2 倍以上）。
   *
   * 経緯（2026-10-02、タスク 20.2・20.6）: 共通の Breadcrumb は ol に flex-wrap が無く、各項目が一行の
   * 中で縮められていた。375 幅では普通の名前でも「ダッシュボード」が幅 32px・高さ 80px の縦長になり、
   * 区切りの無い長いプロジェクト名では一覧の <main> が 913 / 375、作成・編集が 959 / 375 になっていた。
   * 是正は共通部品の側で行われた（trading-partner-management の Task 30.1、コミット `6533ce34`。ol に
   * flex-wrap、各項目の文字列に overflow-wrap:anywhere）。本テストは、その是正が本スペックの画面で
   * 効いていることを固定する。本スペックの画面の側に足した是正は無い。
   */
  test('モバイル幅（375・320）で一覧・作成・編集・詳細のブレッドクラムが水平にはみ出さず、短い項目が一行に収まる', async ({
    page,
  }) => {
    const stamp = Date.now();
    const HORIZONTAL_TOLERANCE_PX = 1;
    const albumName = `ブレッドクラム測定_${stamp}`;
    const projectNames = {
      普通の名前: `丸の内ビル新築工事_${stamp}`,
      区切りの無い長い名前:
        `P${stamp}${'MarunouchiRedevelopmentSkyscraperConstructionProject'.repeat(4)}`.slice(
          0,
          200
        ),
      長い和文の名前: `${'東京都千代田区丸の内二丁目再開発計画に伴う超高層複合ビル新築工事および周辺道路整備工事'.repeat(3)}_${stamp}`,
    } as const;
    type NameKind = keyof typeof projectNames;
    const nameKinds = Object.keys(projectNames) as NameKind[];
    const prisma = getPrismaClient();

    const desktopViewport = page.viewportSize();
    expect(desktopViewport).not.toBeNull();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'breadcrumb-sweep', projectNames['普通の名前']);
    const albumId = await createAlbum(page, projectId, albumName);

    // mobileMainMaxWidth は、見出しを含む <main> の maxWidth の、モバイル幅での計算済みの値である。
    // 一覧・作成・編集のコンテナは幅に依らず固定の上限を持ち、詳細だけがモバイル分岐で 100% に変わる
    const screens = [
      {
        screen: '一覧',
        path: `/projects/${projectId}/construction-photos`,
        heading: '工事写真一覧',
        tail: ['工事写真一覧'],
        mobileMainMaxWidth: '1200px',
      },
      {
        screen: '作成',
        path: `/projects/${projectId}/construction-photos/new`,
        heading: '新規アルバム',
        tail: ['工事写真一覧', '新規アルバム'],
        mobileMainMaxWidth: '768px',
      },
      {
        screen: '編集',
        path: `/construction-photos/${albumId}/edit`,
        heading: 'アルバムを編集',
        tail: ['工事写真一覧', 'アルバムを編集'],
        mobileMainMaxWidth: '768px',
      },
      {
        screen: '詳細',
        path: `/construction-photos/${albumId}`,
        heading: albumName,
        tail: ['工事写真一覧', albumName],
        mobileMainMaxWidth: '100%',
      },
    ];

    const breadcrumb = page.getByRole('navigation', { name: 'パンくずナビゲーション' });

    /** ブレッドクラムと、その各項目の文字列（Range）を測る。 */
    const measureBreadcrumb = () =>
      breadcrumb.evaluate((nav) => {
        const main = nav.closest('main') as HTMLElement | null;
        const root = document.documentElement;
        const context = document.createElement('canvas').getContext('2d');
        const navRect = nav.getBoundingClientRect();
        const items = Array.from(nav.querySelectorAll('li > a, li > span:not([aria-hidden])')).map(
          (label) => {
            const text = label.textContent ?? '';
            let naturalWidth = -1;
            if (context) {
              const style = getComputedStyle(label);
              context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              naturalWidth = context.measureText(text).width;
            }
            // 文字列全体と、その先頭の一文字（一行ぶんの高さの実測）を Range で囲む
            const node = label.firstChild;
            let rect: { left: number; right: number; height: number } | null = null;
            let singleLineHeight = -1;
            if (node && node.nodeType === Node.TEXT_NODE && text.length > 0) {
              const whole = document.createRange();
              whole.selectNodeContents(node);
              const wholeRect = whole.getBoundingClientRect();
              rect = { left: wholeRect.left, right: wholeRect.right, height: wholeRect.height };
              const first = document.createRange();
              first.setStart(node, 0);
              first.setEnd(node, 1);
              singleLineHeight = first.getBoundingClientRect().height;
            }
            return { text, naturalWidth, rect, singleLineHeight };
          }
        );
        return {
          viewportWidth: window.innerWidth,
          nav: {
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            left: navRect.left,
            right: navRect.right,
          },
          main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
          document: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
          items,
        };
      });

    const measured: string[] = [];
    const reports: string[] = [];
    const failures: string[] = [];

    for (const kind of nameKinds) {
      const projectName = projectNames[kind];
      await prisma.project.update({ where: { id: projectId }, data: { name: projectName } });

      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 812 });

        for (const s of screens) {
          const label = `${s.screen}・${width} 幅・${kind}`;
          await page.goto(s.path);
          await page.waitForLoadState('networkidle');
          const heading = page.getByRole('heading', { level: 1, name: s.heading });
          await expect(heading, label).toBeVisible({ timeout: getTimeout(15000) });
          await expect(breadcrumb, label).toBeVisible();
          await expect(breadcrumb, label).toContainText(projectName);
          // 前提: 見出しを含む <main> の maxWidth が、その画面のモバイル幅での値に確定している。
          // 詳細画面はモバイル分岐（`containerMobile` の maxWidth:100%）の適用を待ってから測る。
          // 画面で主張を分岐させず、画面ごとの期待値（上の表の mobileMainMaxWidth）で無条件に主張する
          await expect
            .poll(
              async () =>
                heading.evaluate((h1) => {
                  const main = h1.closest('main');
                  return main ? getComputedStyle(main).maxWidth : null;
                }),
              { message: label, timeout: getTimeout(15000) }
            )
            .toBe(s.mobileMainMaxWidth);

          const m = await measureBreadcrumb();
          const report = `${label} ${JSON.stringify(m)}`;

          // 前提: 画面幅が設定した幅であり、項目がその画面の階層どおりに並んでいる
          expect(m.viewportWidth, report).toBe(width);
          expect(
            m.items.map((item) => item.text),
            report
          ).toEqual(['ダッシュボード', 'プロジェクト一覧', projectName, ...s.tail]);
          expect(m.nav.clientWidth, report).toBeGreaterThan(0);
          expect(m.main, report).not.toBeNull();
          expect(m.main!.clientWidth, report).toBeGreaterThan(0);
          // 前提: 各項目の文字列と、その先頭の一文字を測れている
          for (const item of m.items) {
            expect(item.rect, report).not.toBeNull();
            expect(item.singleLineHeight, report).toBeGreaterThan(0);
            expect(item.naturalWidth, report).toBeGreaterThan(0);
          }
          const nameItem = m.items[2]!;
          // 前提: 長い名前の二通りでは、名前の一行の自然幅がブレッドクラムの幅を超える（折り返さなければ
          // はみ出す長さ）。名前の種類で主張を分岐させず、下回ってはならない幅を種類ごとに決めて無条件に
          // 主張する（普通の名前は 0 で、上の「測れている」の前提と同じ。長い名前はブレッドクラムの幅）
          const nameNaturalWidthFloor = kind !== '普通の名前' ? m.nav.clientWidth : 0;
          expect(nameItem.naturalWidth, report).toBeGreaterThan(nameNaturalWidthFloor);

          // 固定の文言の項目（プロジェクト名と、詳細画面の末尾のアルバム名を除く）
          const fixedItems = m.items.filter(
            (item) => item.text !== projectName && item.text !== albumName
          );
          expect(fixedItems.length, report).toBeGreaterThanOrEqual(3);

          measured.push(label);
          reports.push(
            `${label}: nav ${m.nav.scrollWidth}/${m.nav.clientWidth}、<main> ` +
              `${m.main!.scrollWidth}/${m.main!.clientWidth}、documentElement ` +
              `${m.document.scrollWidth}/${m.document.clientWidth}、項目（文字列の高さ/一行の高さ/右端） ` +
              m.items
                .map(
                  (item) =>
                    `${item.text.slice(0, 8)}=${item.rect!.height.toFixed(1)}/` +
                    `${item.singleLineHeight.toFixed(1)}/${item.rect!.right.toFixed(1)}`
                )
                .join(' ')
          );

          const boxes: Array<[string, { scrollWidth: number; clientWidth: number }]> = [
            ['nav', m.nav],
            ['<main>', m.main!],
            ['documentElement', m.document],
          ];
          for (const [name, box] of boxes) {
            if (box.scrollWidth - box.clientWidth > HORIZONTAL_TOLERANCE_PX) {
              failures.push(
                `${label}: ${name} が水平にはみ出す ${box.scrollWidth}/${box.clientWidth}`
              );
            }
          }
          if (kind !== '普通の名前' && nameItem.rect!.height < nameItem.singleLineHeight * 2) {
            failures.push(
              `${label}: 長い名前が項目の中で折り返されていない 高さ ` +
                `${nameItem.rect!.height.toFixed(1)} / 一行 ${nameItem.singleLineHeight.toFixed(1)}`
            );
          }
          const rightLimit = Math.min(m.nav.right, m.viewportWidth) + HORIZONTAL_TOLERANCE_PX;
          for (const item of m.items) {
            if (
              item.rect!.left < m.nav.left - HORIZONTAL_TOLERANCE_PX ||
              item.rect!.right > rightLimit
            ) {
              failures.push(
                `${label}: 「${item.text.slice(0, 8)}」の文字列が枠の外へ出る ` +
                  `${item.rect!.left.toFixed(1)}..${item.rect!.right.toFixed(1)}`
              );
            }
          }
          for (const item of fixedItems) {
            if (item.rect!.height > item.singleLineHeight + HORIZONTAL_TOLERANCE_PX) {
              failures.push(
                `${label}: 「${item.text}」が一行に収まらない 高さ ${item.rect!.height.toFixed(1)} / ` +
                  `一行 ${item.singleLineHeight.toFixed(1)}`
              );
            }
          }
        }
      }
      await page.setViewportSize(desktopViewport!);
    }

    // 24 の状態（名前 3 通り × 幅 2 通り × 画面 4 つ）をすべて測れている（測り漏らしを緑に数えない）
    expect(measured).toEqual(
      nameKinds.flatMap((kind) =>
        [375, 320].flatMap((width) => screens.map((s) => `${s.screen}・${width} 幅・${kind}`))
      )
    );

    // ブレッドクラムと画面が水平にはみ出さず、固定の文言の短い項目が一行に収まる
    expect(failures, reports.join(' ｜ ')).toEqual([]);
  });

  /**
   * モバイル幅の取得エラーの表示（一覧・作成・編集・看板マスタ・ビューア）と一覧の通知:
   * 375 幅で、区切りの無い英数字の長い一語を理由に持つ応答を返させ、それをそのまま表示する六つの
   * 表示が水平にはみ出さず、文字列が枠の内側に収まることを検証する。
   *  (1) 一覧の取得エラー（アルバム一覧の取得の失敗）
   *  (2) 一覧の通知（アルバムを取り除く操作の失敗）
   *  (3) 作成画面の取得エラー（プロジェクトの取得の失敗）
   *  (4) 編集画面の取得エラー（アルバムの取得の失敗）
   *  (5) 看板マスタの取得エラー（看板一覧の取得の失敗）
   *  (6) ビューアの取得エラー（原本画像の取得の失敗）
   *
   * 要件の印は掲げない。一覧（Requirement 3）のモバイルの受入基準はカード形式（3.2）だけで、作成・
   * 編集（Requirement 1・2）、看板マスタ（Requirement 8）、ビューア（Requirement 14）はモバイルの
   * 受入基準を持たない。Requirement 19 の対象は詳細画面である（タスク 20.6 の利用者の判断: 被覆印は
   * 受入基準を持つ画面に限って掲げる）。詳細画面の同じ型の表示は、上の「通知とエラー表示」のテストが
   * 要件 19.1 の印のもとで扱う。
   *
   * 応答は `page.route` で差し替える。判定と応答の差し替えは同じ参照を `page.unroute` へ渡す。取得
   * （GET）は 500 の応答にする（クライアントは再試行の後に失敗を確定させる）。取り除く操作（DELETE）は
   * 再試行の対象外の 409 の応答にする。
   *
   * 前提（満たされなければ失敗させる。条件付きで飛ばさない）:
   *  - 画面幅（window.innerWidth）が 375 である。
   *  - 文字列の一行の自然幅が、コンテナの幅（clientWidth）を超える（折り返さなければコンテナに
   *    収まらない長さである）。自然幅は画面の計算済みフォントで canvas の measureText により測る。
   *    箱の幅ではなくコンテナの幅と比べるのは、ビューアの箱が中身に合わせて広がるためである
   *    （折り返しの指定が無いと、箱そのものが自然幅より広くなる）。
   *  - 文字列を箱の本文の中に見つけ、その位置を Range で測れている。
   *  - (2) では、一覧がカード形式（モバイルの表示）に確定している。
   *
   * 主張（六つをすべて測ってから主張する。赤になるときに、どの表示が何 px だったかを一度の失敗で
   * 読めるようにするためである）:
   *  - 画面のコンテナ（<main>。ビューアでは画像の表示領域）と文書全体（documentElement）に水平の
   *    はみ出しが無い（許容誤差 1px）。
   *  - 文字列を載せる箱と、それを包む枠（role=alert）の scrollWidth が clientWidth を超えない。
   *  - 枠がコンテナの左右の内側にある（許容誤差 1px）。ビューアの表示領域は overflow:hidden で、枠が
   *    広がると両端が切れて見えなくなるため、枠の位置も測る。
   *  - 文字列の左端・右端（Range の外接矩形）が、箱と画面幅の内側にある（許容誤差 1px）。箱は flex の
   *    子や中央寄せで中身に合わせて広がりうるため、位置は箱ではなく文字列で測る。
   *
   * 是正の経緯（2026-10-02、タスク 20.6）: 本テストを書いた時点の実装（下の六つのスタイルに折り返しの
   * 指定が無い形）では、六つとも赤だった。是正は六つのスタイルに overflowWrap:anywhere を足したこと
   * である（`ConstructionPhotoListPage.tsx` の `STYLES.errorText`・`STYLES.notice`、
   * `ConstructionPhotoCreatePage.tsx`・`ConstructionPhotoEditPage.tsx`・
   * `ConstructionSignboardListPage.tsx` の `styles.errorText`、`ConstructionPhotoImageViewer.tsx` の
   * `STYLES.errorContainer`）。
   * 是正前の実測（自然幅は (1)〜(5) が 779.3、(6) が 890.6）:
   *  (1) <main> 820 / 343、文書全体 836 / 375、段落 779 / 261、枠 803 / 309、文字列 57.0〜836.3。
   *  (2) <main> 812 / 343、文書全体 828 / 375、通知 795 / 309、文字列 49.0〜828.3。
   *  (3)(4)(5) <main> 812 / 343、文書全体 828 / 375、段落 779 / 277、枠 795 / 309、文字列 49.0〜828.3。
   *  (6) 表示領域 658 / 375、枠 -282.8〜657.8（幅 939）、文字列 -257.8〜632.8。文書全体は 375 / 375
   *      （表示領域の overflow:hidden が両端を切るため、はみ出しではなく読めない状態になる）。
   * 是正後は、<main> がいずれも 343 / 343、文書全体が 375 / 375、箱と枠の scrollWidth が clientWidth に
   * 一致し、文字列は (1) 60.0〜315.0、(2)(3)(5) 49.0〜324.5、(4) 49.7〜325.3 に収まる。(6) は表示領域が
   * 375 / 375、枠が 0.0〜375.0、文字列が 25.4〜349.6 になる。
   */
  test('モバイル幅で区切りの無い長い文言でも一覧・作成・編集・看板マスタ・ビューアの取得エラーの表示と一覧の通知が水平にはみ出さない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const HORIZONTAL_TOLERANCE_PX = 1;
    const albumName = `取得エラー表示_${stamp}`;
    const detail = `FetchFailureReasonWithoutAnyBreakOpportunityForMobileWidthErrorDisplayOfConstructionPhotoScreens${stamp}`;
    const prisma = getPrismaClient();

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'fetch-error');
    const albumId = await createAlbum(page, projectId, albumName);
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await uploadPhoto(page, FIXTURE_JPG, 1);
    const photo = await prisma.constructionPhoto.findFirst({ where: { albumId } });
    expect(photo).not.toBeNull();
    const photoId = photo!.id;

    await page.setViewportSize({ width: 375, height: 812 });

    /** 指定のメソッドの要求だけを、detail を理由に持つ失敗の応答へ差し替える。ほかは素通しする。 */
    const failWith =
      (method: string, status: number) =>
      async (route: Route): Promise<void> => {
        if (route.request().method() !== method) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'https://architrack.example.com/problems/request-failed',
            title: 'Request Failed',
            status,
            detail,
            code: 'REQUEST_FAILED',
          }),
        });
      };
    const failGet = failWith('GET', 500);
    const failDelete = failWith('DELETE', 409);

    /** 文字列 text を直に載せる箱 box について、文字列の自然幅・両端と、箱・枠・コンテナ・文書全体を測る。 */
    const measureText = (box: import('@playwright/test').Locator, text: string) =>
      box.evaluate((el, target) => {
        const sizeOf = (e: Element) => {
          const rect = e.getBoundingClientRect();
          return {
            scrollWidth: e.scrollWidth,
            clientWidth: e.clientWidth,
            left: rect.left,
            right: rect.right,
          };
        };
        const container =
          el.closest('[data-testid="construction-photo-viewer-stage"]') ?? el.closest('main');
        const frame = el.closest('[role="alert"]');
        const root = document.documentElement;
        const context = document.createElement('canvas').getContext('2d');
        let naturalWidth = -1;
        if (context) {
          const style = getComputedStyle(el);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          naturalWidth = context.measureText(target).width;
        }
        // 箱の本文のうち、対象の文字列の部分だけを Range で囲む
        let textEdges: { left: number; right: number } | null = null;
        const textNode = Array.from(el.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').includes(target)
        );
        if (textNode) {
          const start = (textNode.textContent ?? '').indexOf(target);
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, start + target.length);
          const rect = range.getBoundingClientRect();
          textEdges = { left: rect.left, right: rect.right };
        }
        return {
          viewportWidth: window.innerWidth,
          naturalWidth,
          text: textEdges,
          box: sizeOf(el),
          frame: frame ? sizeOf(frame) : null,
          container: container ? sizeOf(container) : null,
          document: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
        };
      }, text);

    const measured: string[] = [];
    const reports: string[] = [];
    const failures: string[] = [];

    /** 前提を確かめ、主張に反する点を集める。 */
    const collect = (label: string, m: Awaited<ReturnType<typeof measureText>>): void => {
      const report = `${label} ${JSON.stringify(m)}`;
      // 前提: 画面幅が 375 であり、箱・枠・コンテナ・文字列を測れている
      expect(m.viewportWidth, report).toBe(375);
      expect(m.box.clientWidth, report).toBeGreaterThan(0);
      expect(m.frame, report).not.toBeNull();
      expect(m.container, report).not.toBeNull();
      expect(m.container!.clientWidth, report).toBeGreaterThan(0);
      expect(m.text, report).not.toBeNull();
      // 前提: 文字列の一語の自然幅がコンテナの幅を超える（折り返さなければ収まらない長さ）
      expect(m.naturalWidth, report).toBeGreaterThan(m.container!.clientWidth);

      const frame = m.frame!;
      const container = m.container!;
      const text = m.text!;
      measured.push(label);
      reports.push(
        `${label}: 自然幅 ${m.naturalWidth.toFixed(1)}、コンテナ ${container.scrollWidth}/` +
          `${container.clientWidth}、documentElement ${m.document.scrollWidth}/` +
          `${m.document.clientWidth}、箱 ${m.box.scrollWidth}/${m.box.clientWidth}、枠 ` +
          `${frame.scrollWidth}/${frame.clientWidth}（${frame.left.toFixed(1)}..` +
          `${frame.right.toFixed(1)}）、文字列 ${text.left.toFixed(1)}..${text.right.toFixed(1)}`
      );

      if (container.scrollWidth - container.clientWidth > HORIZONTAL_TOLERANCE_PX) {
        failures.push(
          `${label}: コンテナが水平にはみ出す ${container.scrollWidth}/${container.clientWidth}`
        );
      }
      if (m.document.scrollWidth - m.document.clientWidth > HORIZONTAL_TOLERANCE_PX) {
        failures.push(
          `${label}: 文書全体が水平にはみ出す ${m.document.scrollWidth}/${m.document.clientWidth}`
        );
      }
      if (m.box.scrollWidth > m.box.clientWidth) {
        failures.push(`${label}: 箱が水平にはみ出す ${m.box.scrollWidth}/${m.box.clientWidth}`);
      }
      if (frame.scrollWidth > frame.clientWidth) {
        failures.push(`${label}: 枠が水平にはみ出す ${frame.scrollWidth}/${frame.clientWidth}`);
      }
      if (
        frame.left < container.left - HORIZONTAL_TOLERANCE_PX ||
        frame.right > container.right + HORIZONTAL_TOLERANCE_PX
      ) {
        failures.push(
          `${label}: 枠がコンテナの外へ出る ${frame.left.toFixed(1)}..${frame.right.toFixed(1)}` +
            `（コンテナ ${container.left.toFixed(1)}..${container.right.toFixed(1)}）`
        );
      }
      if (
        text.left < Math.max(m.box.left, 0) - HORIZONTAL_TOLERANCE_PX ||
        text.right > Math.min(m.box.right, m.viewportWidth) + HORIZONTAL_TOLERANCE_PX
      ) {
        failures.push(
          `${label}: 文字列が箱か画面幅の外へ出る ${text.left.toFixed(1)}..${text.right.toFixed(1)}` +
            `（箱 ${m.box.left.toFixed(1)}..${m.box.right.toFixed(1)}）`
        );
      }
    };

    /** 取得を失敗させて画面を開き、エラー表示（role=alert の中の段落）を測る。 */
    const measureFetchError = async (
      label: string,
      screenPath: string,
      matcher: (url: URL) => boolean
    ): Promise<void> => {
      await page.route(matcher, failGet);
      try {
        await page.goto(screenPath);
        const errorDisplay = page.getByRole('alert').filter({ hasText: detail });
        await expect(errorDisplay, label).toHaveCount(1, { timeout: getTimeout(30000) });
        const errorText = errorDisplay.locator('p').filter({ hasText: detail });
        await expect(errorText, label).toHaveCount(1);
        collect(label, await measureText(errorText, detail));
      } finally {
        await page.unroute(matcher, failGet);
      }
    };

    // (1) 一覧の取得エラー
    const albumListMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/projects/${projectId}/construction-photos`);
    await measureFetchError(
      '(1) 一覧の取得エラー',
      `/projects/${projectId}/construction-photos`,
      albumListMatcher
    );

    // (2) 一覧の通知。アルバムを取り除く操作だけを失敗させる
    const albumMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/${albumId}`);
    await page.goto(`/projects/${projectId}/construction-photos`);
    await page.waitForLoadState('networkidle');
    // 前提: 一覧がカード形式（モバイルの表示）に確定している
    await expect(page.getByTestId(`album-card-${albumId}`)).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.route(albumMatcher, failDelete);
    try {
      await page.getByRole('button', { name: `${albumName}を削除` }).click();
      const deleteDialog = page.getByRole('dialog');
      await expect(deleteDialog).toBeVisible({ timeout: getTimeout(10000) });
      const rejected = page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' && albumMatcher(new URL(r.url())) && r.status() === 409,
        { timeout: getTimeout(30000) }
      );
      await deleteDialog.getByRole('button', { name: '削除', exact: true }).click();
      await rejected;
      await expect(deleteDialog).toBeHidden({ timeout: getTimeout(10000) });
      const notice = page.getByRole('alert').filter({ hasText: detail });
      await expect(notice).toHaveCount(1, { timeout: getTimeout(20000) });
      // 前提: 通知の下の一覧がカード形式のまま表示されている（アルバムは取り除かれていない）
      await expect(page.getByTestId(`album-card-${albumId}`)).toBeVisible();
      collect('(2) 一覧の通知', await measureText(notice, detail));
    } finally {
      await page.unroute(albumMatcher, failDelete);
    }

    // (3) 作成画面の取得エラー
    const projectMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/projects/${projectId}`);
    await measureFetchError(
      '(3) 作成画面の取得エラー',
      `/projects/${projectId}/construction-photos/new`,
      projectMatcher
    );

    // (4) 編集画面の取得エラー
    await measureFetchError(
      '(4) 編集画面の取得エラー',
      `/construction-photos/${albumId}/edit`,
      albumMatcher
    );

    // (5) 看板マスタの取得エラー
    const signboardListMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/projects/${projectId}/construction-signboards`);
    await measureFetchError(
      '(5) 看板マスタの取得エラー',
      `/projects/${projectId}/construction-signboards`,
      signboardListMatcher
    );

    // (6) ビューアの取得エラー。原本画像の取得だけを失敗させる
    const originalMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/images/${photoId}/original`);
    await page.route(originalMatcher, failGet);
    try {
      await page.goto(`/construction-photos/${albumId}/photos/${photoId}`);
      const stage = page.getByTestId('construction-photo-viewer-stage');
      await expect(stage).toBeVisible({ timeout: getTimeout(15000) });
      const viewerError = stage.getByRole('alert').filter({ hasText: detail });
      await expect(viewerError).toHaveCount(1, { timeout: getTimeout(30000) });
      collect('(6) ビューアの取得エラー', await measureText(viewerError, detail));
    } finally {
      await page.unroute(originalMatcher, failGet);
    }

    // 六つの表示をすべて測れている（測り漏らした表示を緑に数えない）
    expect(measured).toEqual([
      '(1) 一覧の取得エラー',
      '(2) 一覧の通知',
      '(3) 作成画面の取得エラー',
      '(4) 編集画面の取得エラー',
      '(5) 看板マスタの取得エラー',
      '(6) ビューアの取得エラー',
    ]);

    // 六つの表示が水平にはみ出さず、文字列が枠の内側に収まる
    expect(failures, reports.join(' ｜ ')).toEqual([]);
  });

  /**
   * R7.7 写真項目の削除と、削除が失敗したときの表示（タスク 21.3、23.9）:
   * 375 幅の詳細画面で、看板配置のデータを持つ写真項目の削除を実行する。1 回目は削除の応答を
   * 失敗（500）へ差し替え、2 回目は差し替えを解いて実際に削除する。
   *
   * @requirement construction-photo/REQ-7.7
   *
   * 受入基準 7.7（写真項目と関連する看板配置データを削除する）は 2 回目で主張する。削除の後に
   * 写真項目が一覧から消え、DB から当該の行（看板の指定と配置の座標を持つ行）が無くなり、読み込み
   * 直しても戻らないことを確かめる。看板マスタの行と、もう一方の写真項目は残る。
   *
   * 1 回目の失敗時の表示は受入基準 7.7 の外にある。タスク 23.9 の利用者の判断（2026-10-03）により、
   * 失敗は取り除こうとした写真項目の中（その写真項目の操作の近く）に role=alert で出し、上部の
   * 通知の枠には出さず、画面も送らない（21.3 の「通知の枠へ出して画面をそこへ送る」形を改めた）。
   * 主張は次のとおり。
   *  - 確認ダイアログが閉じる（モーダルの背後に表示を隠さない。21.3 から変わらない）。
   *  - 失敗の表示は対象の写真項目の中の 1 件だけで、応答の理由（`detail`）を表示する。`<main>` の
   *    中の role=alert はこの 1 件だけである（上部の通知の枠にも、もう一方の写真項目にも出ない）。
   *  - 画面は送られない。「削除する」を押す直前と失敗の表示の後で `window.scrollY` が等しく、
   *    その間に scroll イベントが 0 回である。前提として、削除を実行する時点で上部の通知の枠の
   *    位置（見出し「写真項目」）が画面の外にあることを主張する（21.3 の形なら送られていた状況）。
   *  - 失敗の表示が送らずに画面内にあり、中心と四隅の内側の点のいずれでも他の要素に覆われていない。
   *    表示は削除ボタンより下にあり、写真項目の矩形の内側に収まる。削除ボタンも画面内にあり覆われて
   *    いない（その場でやり直せる）。
   *  - 写真項目は 2 件とも残り、DB の行も看板配置のデータごと残る。
   *  - <main> と文書全体に水平のはみ出しが無い（許容誤差1px）。長い文言での測定は次のテストが担う。
   *
   * 削除の DELETE だけを差し替える。判定はオリジンではなくパスで行い、DELETE 以外は素通しする。
   * 500 は API クライアントの自動再試行の対象であるため、差し替えた応答は複数回返る（回数は主張
   * しない。1 回以上であることだけを前提として主張する）。解除は登録時と同じ参照で行う。
   *
   * 是正の経緯: 21.3 の時点の実装（`PhotoItemPanel` が失敗を握りつぶし、
   * `ConstructionPhotoDetailPage.handleDelete` が捕捉も表示もしない形）では、確認ダイアログが開いた
   * まま表示が 0 件で赤だった。21.3 は通知の枠へ出して画面の中央へ送る形で緑にした。23.9 の本テストは
   * 21.3 の形のビルドに対して、写真項目の中の表示が 0 件であることで赤になる（その時点で画面は
   * 通知の枠へ送られていた）。
   */
  test('写真項目の削除が失敗すると、その写真項目の中に失敗が表示されて画面は送られず、やり直すと写真項目と看板配置のデータが削除される', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `削除失敗_${stamp}`;
    const keepFileName = `delete-keep-${stamp}.jpg`;
    const targetFileName = `delete-target-${stamp}.jpg`;
    const failureDetail = 'サーバー内部エラーが発生しました';
    const placement = { left: 10, top: 20, width: 120, height: 80 };

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'delete-fail');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });

    /** 詳細画面を開き、モバイル分岐の適用を待つ。 */
    const openDetail = async (): Promise<void> => {
      await page.goto(`/construction-photos/${albumId}`);
      await page.waitForLoadState('networkidle');
      const heading = page.getByRole('heading', { level: 1, name: albumName });
      await expect(heading).toBeVisible({ timeout: getTimeout(15000) });
      await expect
        .poll(
          async () =>
            heading.evaluate((h1) => {
              const main = h1.closest('main');
              return main ? getComputedStyle(main).maxWidth : null;
            }),
          { timeout: getTimeout(15000) }
        )
        .toBe('100%');
    };

    /** 指定の名前でローカル画像を 1 枚追加し、写真項目の総数が expectedCount になるのを待つ。 */
    const uploadNamed = async (name: string, expectedCount: number): Promise<void> => {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await upload;
      await expect(page.getByTestId('construction-photo-item')).toHaveCount(expectedCount, {
        timeout: getTimeout(20000),
      });
    };

    // 前準備: 写真項目を 2 件追加し、後ろの 1 件（削除の対象）に看板の指定と配置の座標を持たせる
    await openDetail();
    await uploadNamed(keepFileName, 1);
    await uploadNamed(targetFileName, 2);

    const uploaded = await prisma.constructionPhoto.findMany({
      where: { albumId },
      select: { id: true, fileName: true },
    });
    const targetId = uploaded.find((photo) => photo.fileName === targetFileName)?.id;
    const keepId = uploaded.find((photo) => photo.fileName === keepFileName)?.id;
    expect(targetId, JSON.stringify(uploaded)).toBeTruthy();
    expect(keepId, JSON.stringify(uploaded)).toBeTruthy();

    const signboard = await prisma.constructionSignboard.create({
      data: { projectId, workName: `削除失敗_看板_${stamp}`, workLocation: '東京都千代田区' },
      select: { id: true },
    });
    await prisma.constructionPhoto.update({
      where: { id: targetId! },
      data: { signboardId: signboard.id, signboardPlacement: placement },
    });

    await openDetail();
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(2, { timeout: getTimeout(20000) });
    const targetHeading = items.getByRole('heading', { level: 3, name: targetFileName });
    const keepHeading = items.getByRole('heading', { level: 3, name: keepFileName });
    await expect(targetHeading).toBeVisible({ timeout: getTimeout(15000) });
    await expect(keepHeading).toBeVisible();
    // filter の has は絞り込む要素からの相対で解決されるため、page 起点の見出しで指す
    const targetItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: targetFileName }),
    });
    const keepItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: keepFileName }),
    });
    await expect(targetItem).toHaveCount(1);
    await expect(keepItem).toHaveCount(1);
    const deleteTarget = targetItem.getByRole('button', {
      name: `写真項目を削除: ${targetFileName}`,
    });
    const dialog = page.getByRole('dialog');
    const mainAlerts = page.getByRole('main').getByRole('alert');
    const targetAlerts = targetItem.getByRole('alert');
    const keepAlerts = keepItem.getByRole('alert');
    // 確認ダイアログの見出し「写真項目を削除」と区別するため、完全一致で指す
    const sectionHeading = page.getByRole('heading', {
      level: 2,
      name: '写真項目',
      exact: true,
    });
    // 前提: 失敗の前に、失敗の表示は出ていない
    await expect(sectionHeading).toBeVisible();
    await expect(mainAlerts).toHaveCount(0);

    // --- 1 回目: 削除の DELETE だけを失敗させる ---
    const deleteMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/images/${targetId}`);
    let failedDeleteCount = 0;
    const failDelete = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      failedDeleteCount += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: failureDetail,
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    };

    await page.route(deleteMatcher, failDelete);
    try {
      await deleteTarget.click();
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dialog).toContainText(targetFileName);
      // 前提: 削除を実行する時点で、上部の通知の枠の位置（見出し「写真項目」の直下）は画面の外にある
      await expect(sectionHeading).not.toBeInViewport();

      // 「削除する」を押す直前のスクロール位置を記録し、以後の scroll イベントを数える
      const scrollBefore = await page.evaluate(() => {
        const w = window as unknown as { __deleteFailureScrollEvents: number };
        w.__deleteFailureScrollEvents = 0;
        window.addEventListener('scroll', () => {
          w.__deleteFailureScrollEvents += 1;
        });
        return window.scrollY;
      });

      await dialog.getByRole('button', { name: '削除する' }).click();

      // 確認ダイアログが閉じ、対象の写真項目の中に失敗の理由が表示される
      // （自動再試行の待ち時間は合わせて 7 秒ほどである）
      await expect(dialog).toBeHidden({ timeout: getTimeout(30000) });
      await expect(targetAlerts).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(targetAlerts).toHaveText(failureDetail);
      // <main> の中の role=alert はこの 1 件だけ（上部の通知の枠にも、もう一方の写真項目にも出ない）
      await expect(mainAlerts).toHaveCount(1);
      await expect(keepAlerts).toHaveCount(0);
      // 前提: 失敗は差し替えた応答によるもので、削除はサーバーへ届いていない
      expect(failedDeleteCount).toBeGreaterThanOrEqual(1);

      const scrollAfter = await page.evaluate(() => ({
        scrollY: window.scrollY,
        events: (window as unknown as { __deleteFailureScrollEvents: number })
          .__deleteFailureScrollEvents,
      }));
      const scrollReport = JSON.stringify({ scrollBefore, scrollAfter });
      // 画面は送られない
      expect(scrollAfter.scrollY, scrollReport).toBe(scrollBefore);
      expect(scrollAfter.events, scrollReport).toBe(0);

      const shown = await targetAlerts.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const item = el.closest('[data-testid="construction-photo-item"]') as HTMLElement;
        const itemRect = item.getBoundingClientRect();
        const button = item.querySelector(
          'button[aria-label^="写真項目を削除: "]'
        ) as HTMLButtonElement;
        const buttonRect = button.getBoundingClientRect();
        const inset = 2;
        const probe = (x: number, y: number, target: Element): string => {
          const hit = document.elementFromPoint(x, y);
          return hit === null ? 'null' : target.contains(hit) ? 'self' : hit.tagName;
        };
        const main = el.closest('main') as HTMLElement;
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          alert: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
          item: {
            top: itemRect.top,
            bottom: itemRect.bottom,
            left: itemRect.left,
            right: itemRect.right,
          },
          button: { top: buttonRect.top, bottom: buttonRect.bottom },
          alertHits: [
            probe(rect.left + rect.width / 2, rect.top + rect.height / 2, el),
            probe(rect.left + inset, rect.top + inset, el),
            probe(rect.right - inset, rect.top + inset, el),
            probe(rect.left + inset, rect.bottom - inset, el),
            probe(rect.right - inset, rect.bottom - inset, el),
          ],
          buttonHit: probe(
            buttonRect.left + buttonRect.width / 2,
            buttonRect.top + buttonRect.height / 2,
            button
          ),
          main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
          doc: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
        };
      });
      const shownReport = JSON.stringify(shown);
      expect(shown.viewportWidth, shownReport).toBe(375);
      expect(shown.main.clientWidth, shownReport).toBeGreaterThan(0);
      // 送らずに画面内にあり、他の要素に覆われていない
      expect(shown.alert.top, shownReport).toBeGreaterThanOrEqual(0);
      expect(shown.alert.bottom, shownReport).toBeLessThanOrEqual(shown.viewportHeight);
      expect(shown.alertHits, shownReport).toEqual(['self', 'self', 'self', 'self', 'self']);
      // 削除ボタンより下にあり、写真項目の矩形の内側に収まる
      expect(shown.alert.top, shownReport).toBeGreaterThanOrEqual(shown.button.bottom);
      expect(shown.alert.left, shownReport).toBeGreaterThanOrEqual(shown.item.left);
      expect(shown.alert.right, shownReport).toBeLessThanOrEqual(shown.item.right);
      expect(shown.alert.bottom, shownReport).toBeLessThanOrEqual(shown.item.bottom);
      // 削除ボタンも画面内にあり覆われていない（その場でやり直せる）
      expect(shown.button.top, shownReport).toBeGreaterThanOrEqual(0);
      expect(shown.button.bottom, shownReport).toBeLessThanOrEqual(shown.viewportHeight);
      expect(shown.buttonHit, shownReport).toBe('self');
      // <main> と文書全体に水平のはみ出しが無い（許容誤差1px）
      expect(shown.main.scrollWidth - shown.main.clientWidth, shownReport).toBeLessThanOrEqual(1);
      expect(shown.doc.scrollWidth - shown.doc.clientWidth, shownReport).toBeLessThanOrEqual(1);

      // 写真項目は 2 件とも残り、DB の行も看板配置のデータごと残る
      await expect(items).toHaveCount(2);
      await expect(targetHeading).toBeVisible();
      await expect(keepHeading).toBeVisible();
      const remaining = await prisma.constructionPhoto.findUnique({
        where: { id: targetId! },
        select: { signboardId: true, signboardPlacement: true },
      });
      expect(remaining).toEqual({ signboardId: signboard.id, signboardPlacement: placement });
    } finally {
      await page.unroute(deleteMatcher, failDelete);
    }

    // --- 2 回目: 差し替えを解いてやり直す（R7.7） ---
    const failedBeforeRetry = failedDeleteCount;
    await deleteTarget.click();
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    const deleted = page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && deleteMatcher(new URL(r.url())),
      { timeout: getTimeout(30000) }
    );
    await dialog.getByRole('button', { name: '削除する' }).click();
    const deleteResponse = await deleted;
    expect(deleteResponse.status()).toBe(204);
    // 前提: やり直しの応答は差し替えたものではない
    expect(failedDeleteCount).toBe(failedBeforeRetry);

    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
    await expect(targetHeading).toHaveCount(0);
    await expect(keepHeading).toBeVisible();
    // 古い失敗の表示は写真項目ごと消え、<main> に role=alert は残らない
    await expect(mainAlerts).toHaveCount(0);

    // R7.7: 写真項目の行が、看板配置のデータごと DB から無くなる。看板マスタともう一方の行は残る
    expect(await prisma.constructionPhoto.findUnique({ where: { id: targetId! } })).toBeNull();
    expect(
      await prisma.constructionPhoto.findMany({ where: { albumId }, select: { id: true } })
    ).toEqual([{ id: keepId }]);
    expect(
      await prisma.constructionSignboard.findUnique({
        where: { id: signboard.id },
        select: { id: true, deletedAt: true },
      })
    ).toEqual({ id: signboard.id, deletedAt: null });

    // 読み込み直しても、削除した写真項目は戻らない
    await openDetail();
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
    await expect(keepHeading).toBeVisible({ timeout: getTimeout(15000) });
    await expect(targetHeading).toHaveCount(0);
  });

  /**
   * 写真項目の削除の実行中の確認ダイアログ（タスク 22.3）:
   * 利用者の判断（2026-10-04）により、削除の実行中は確認ダイアログを閉じられない（オーバーレイの
   * クリック・Esc・キャンセルを受け付けない）。375 幅の詳細画面で写真項目を 2 件置き、削除の DELETE
   * を `page.route` で止めた間に閉じる操作をすべて行い、ダイアログが残ることを主張する。止めを解くと
   * 完了の後に閉じる。失敗（500）と成功の両方で確かめる（失敗時にも起きた点が 21.3 で新しかった）。
   *
   * 要件の印は掲げない（確認ダイアログの実行中の扱いは受入基準 7.7 の文言の外で、利用者の判断に
   * よる。削除そのもの（7.7）は 23.9 の上のテストが主張する）。主張は次のとおり。
   *  - 実行中は「削除中...」が無効のまま表示され、オーバーレイの隅のクリック（その点の受け手が
   *    オーバーレイであることは Playwright の実行可能性の検査が確かめる）、Esc、キャンセル
   *    （実行中は無効）のどれでも閉じず、確認の対象の名前も変わらない。
   *  - 実行中に、背後のもう一方の写真項目の削除ボタンへキーボードで到達して Enter を押しても、確認の
   *    対象は変わらない（先行する削除の完了が別の写真項目の確認を閉じる経路が無い）。
   *  - 失敗のときは、完了の後に閉じ、その写真項目の中に失敗の表示が 1 件出て、フォーカスがその削除
   *    ボタンへ戻る（23.9 のまま）。成功のときは、完了の後に閉じて写真項目が 1 件になる。
   *  - 実行中でなければ、オーバーレイのクリックで閉じる（従前のまま）。
   *
   * 是正の経緯: 22.3 より前の版では、実行中のオーバーレイのクリックでダイアログが閉じ、もう一方の
   * 写真項目の削除ボタンの Enter で確認の対象が入れ替わった。
   */
  test('写真項目の削除の実行中は、オーバーレイのクリック・Esc・キャンセルで確認ダイアログが閉じず、失敗でも成功でも完了の後に閉じる', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `削除中_${stamp}`;
    const keepFileName = `deleting-keep-${stamp}.jpg`;
    const targetFileName = `deleting-target-${stamp}.jpg`;
    const failureDetail = 'サーバー内部エラーが発生しました';

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'deleting-lock');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const items = page.getByTestId('construction-photo-item');
    for (const [index, name] of [keepFileName, targetFileName].entries()) {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await upload;
      await expect(items).toHaveCount(index + 1, { timeout: getTimeout(20000) });
    }
    const uploaded = await prisma.constructionPhoto.findMany({
      where: { albumId },
      select: { id: true, fileName: true },
    });
    const targetId = uploaded.find((photo) => photo.fileName === targetFileName)?.id;
    expect(targetId, JSON.stringify(uploaded)).toBeTruthy();

    const targetItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: targetFileName }),
    });
    const keepItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: keepFileName }),
    });
    await expect(targetItem).toHaveCount(1, { timeout: getTimeout(15000) });
    await expect(keepItem).toHaveCount(1);
    const deleteTarget = targetItem.getByRole('button', {
      name: `写真項目を削除: ${targetFileName}`,
    });
    const deleteKeep = keepItem.getByRole('button', { name: `写真項目を削除: ${keepFileName}` });
    const dialog = page.getByRole('dialog');
    const overlay = page.getByTestId('cp-delete-dialog-overlay');

    /** 確認ダイアログの開いている状態（対象の名前と、実行中なら「削除中...」）を主張する */
    const expectDialogOpenFor = async (fileName: string, otherName: string): Promise<void> => {
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(fileName);
      await expect(dialog).not.toContainText(otherName);
    };

    /** オーバーレイの左下の隅をクリックする（中央はダイアログの本体が覆う） */
    const clickOverlayCorner = async (): Promise<void> => {
      const box = await overlay.boundingBox();
      expect(box, 'オーバーレイの矩形').not.toBeNull();
      await overlay.click({ position: { x: 5, y: box!.height - 5 } });
    };

    /** 実行中に、閉じる操作と、もう一方の写真項目の確認を開く操作をすべて行う */
    const tryToCloseOrRetarget = async (): Promise<void> => {
      const running = dialog.getByRole('button', { name: '削除中...' });
      await expect(running).toBeVisible();
      await expect(running).toBeDisabled();

      await clickOverlayCorner();
      await expectDialogOpenFor(targetFileName, keepFileName);

      await page.keyboard.press('Escape');
      await expectDialogOpenFor(targetFileName, keepFileName);

      const cancel = dialog.getByRole('button', { name: 'キャンセル' });
      await expect(cancel).toBeDisabled();
      await cancel.click({ force: true });
      await expectDialogOpenFor(targetFileName, keepFileName);

      // 背後の写真項目の削除ボタンへキーボードで到達して押す
      await deleteKeep.focus();
      await page.keyboard.press('Enter');
      await expectDialogOpenFor(targetFileName, keepFileName);
      await expect(running).toBeVisible();
    };

    /**
     * 対象の DELETE の最初の 1 回を止める route を作る。止めを解くと `onRelease` で応答を決める。
     * 判定はパスで行い、DELETE 以外は素通しする。解除は登録時と同じ参照で行う。
     */
    const deleteMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/images/${targetId}`);
    const holdFirstDelete = (onRelease: (route: Route) => Promise<void>) => {
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let arrived: () => void = () => undefined;
      const arrivedPromise = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      let calls = 0;
      const handler = async (route: Route): Promise<void> => {
        if (route.request().method() !== 'DELETE') {
          await route.fallback();
          return;
        }
        calls += 1;
        if (calls === 1) {
          arrived();
          await released;
        }
        await onRelease(route);
      };
      return { handler, release: () => release(), arrived: arrivedPromise, calls: () => calls };
    };

    // --- 1 回目: 失敗（500）。止めた間に閉じる操作をしても残り、完了の後に閉じる ---
    const failing = holdFirstDelete(async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: failureDetail,
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    });
    await page.route(deleteMatcher, failing.handler);
    try {
      await deleteTarget.click();
      await expectDialogOpenFor(targetFileName, keepFileName);
      await dialog.getByRole('button', { name: '削除する' }).click();
      await failing.arrived;

      await tryToCloseOrRetarget();

      failing.release();
      // 自動再試行の待ち時間は合わせて 7 秒ほどである
      await expect(dialog).toBeHidden({ timeout: getTimeout(30000) });
      await expect(targetItem.getByRole('alert')).toHaveText(failureDetail, {
        timeout: getTimeout(20000),
      });
      await expect(keepItem.getByRole('alert')).toHaveCount(0);
      await expect(deleteTarget).toBeFocused();
      await expect(items).toHaveCount(2);
      // 前提: 失敗は差し替えた応答によるもので、削除はサーバーへ届いていない
      expect(failing.calls()).toBeGreaterThanOrEqual(1);
      expect(await prisma.constructionPhoto.count({ where: { albumId } })).toBe(2);
    } finally {
      await page.unroute(deleteMatcher, failing.handler);
    }

    // --- 2 回目: 成功。止めた間に閉じる操作をしても残り、完了の後に閉じる ---
    const succeeding = holdFirstDelete(async (route) => {
      await route.fallback();
    });
    await page.route(deleteMatcher, succeeding.handler);
    try {
      await deleteTarget.click();
      await expectDialogOpenFor(targetFileName, keepFileName);
      const deleted = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && deleteMatcher(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await dialog.getByRole('button', { name: '削除する' }).click();
      await succeeding.arrived;

      await tryToCloseOrRetarget();

      succeeding.release();
      expect((await deleted).status()).toBe(204);
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
      await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
      await expect(keepItem).toHaveCount(1);
      expect(succeeding.calls()).toBe(1);
    } finally {
      await page.unroute(deleteMatcher, succeeding.handler);
    }

    // 実行中でなければ、オーバーレイのクリックで閉じる（従前のまま）
    await deleteKeep.click();
    await expectDialogOpenFor(keepFileName, targetFileName);
    await expect(dialog.getByRole('button', { name: '削除する' })).toBeEnabled();
    await clickOverlayCorner();
    await expect(dialog).toBeHidden();
    await expect(items).toHaveCount(1);
  });

  /**
   * 写真項目の削除の失敗の表示の、長い文言での収まりとタップ領域（タスク 23.9）:
   * 写真項目 1 件の詳細画面で、削除の応答を失敗（500）へ差し替え、理由（`detail`）を
   * 区切りの無い英数字の一語 200 文字と、長い和文 200 文字の 2 通りにする。それぞれの失敗を 375 幅で
   * 起こし、同じ表示のまま 320 幅と 1280 幅へ幅を変えて測る（幅の変更は写真項目への操作ではない
   * ため、表示はそのまま残る）。
   *
   * 要件の印は掲げない（失敗の表示は受入基準 7.7 の外で、タスク 23.9 の利用者の判断による。
   * モバイル幅の収まりとタップ領域の下限は要件 19 の基準を同じ表示へ当てたもの）。主張は次のとおり。
   *  - 3 幅のいずれでも、表示の矩形が写真項目の矩形の内側に収まり、文字列（DOM Range）の左右端が
   *    表示の内容の箱の内側に収まり、写真項目・<main>・文書全体に水平のはみ出しが無い（許容誤差1px）。
   *  - 375 幅と 320 幅で、同じ写真項目の操作部品 7 つ（ドラッグハンドル・上下の移動・二つの
   *    チェックボックス・看板の操作・削除）が 44×44 以上で描かれる（下限は TAP_TARGET_MIN_PX）。
   *    1280 幅は下限の対象外である（モバイル用の上書きはモバイル幅だけに当たる）。
   */
  test('モバイル幅（375・320）と 1280 幅で、写真項目の削除の失敗の長い文言が写真項目からはみ出さず、操作のタップ領域が下限を保つ', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `削除失敗_長い文言_${stamp}`;
    const fileName = `delete-long-${stamp}.jpg`;
    const reasons = [
      {
        kind: '区切りの無い英数字の一語',
        detail: `PhotoItemDeleteFailureReason${stamp}`.padEnd(200, 'X'),
      },
      {
        kind: '長い和文',
        detail: '写真項目の削除の処理で想定していない状態が見つかったため削除できませんでした'
          .repeat(6)
          .slice(0, 200),
      },
    ];
    expect(reasons.map((r) => r.detail.length)).toEqual([200, 200]);

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'delete-fail-long');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    await upload;
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });
    const photo = await prisma.constructionPhoto.findFirst({
      where: { albumId, fileName },
      select: { id: true },
    });
    expect(photo, fileName).not.toBeNull();

    const item = items.first();
    const itemAlerts = item.getByRole('alert');
    const deleteButton = item.getByRole('button', { name: `写真項目を削除: ${fileName}` });
    const dialog = page.getByRole('dialog');

    /** 幅を変え、写真項目の配置（モバイルは縦積み、1280 は横並び）の確定を待つ。 */
    const resizeTo = async (width: number): Promise<void> => {
      await page.setViewportSize({ width, height: 812 });
      const expected = width <= 767 ? 'column' : 'row';
      await expect
        .poll(async () => item.evaluate((el) => getComputedStyle(el).flexDirection), {
          timeout: getTimeout(15000),
        })
        .toBe(expected);
    };

    let currentDetail = '';
    const deleteMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/images/${photo!.id}`);
    const failDelete = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: currentDetail,
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    };

    type Measure = {
      alertInItem: { leftGap: number; rightGap: number };
      textInAlert: { leftGap: number; rightGap: number };
      itemOverflow: number;
      mainOverflow: number;
      docOverflow: number;
      controls: Array<{ label: string; width: number; height: number }>;
    };
    const measures = new Map<string, Measure>();
    const measureAt = async (key: string): Promise<void> => {
      const m = await itemAlerts.evaluate((el): Measure => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const itemEl = el.closest('[data-testid="construction-photo-item"]') as HTMLElement;
        const itemRect = itemEl.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const textRect = range.getBoundingClientRect();
        const contentLeft =
          rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const contentRight =
          rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        const main = el.closest('main') as HTMLElement;
        const controlSelectors: Array<[string, string]> = [
          ['ドラッグハンドル', '[data-testid="construction-photo-drag-handle"]'],
          ['上へ移動', 'button[aria-label="上へ移動"]'],
          ['下へ移動', 'button[aria-label="下へ移動"]'],
          ['エクスポート対象', 'input[aria-label="エクスポート対象に含める"]'],
          ['印刷対象', 'input[aria-label="印刷対象に含める"]'],
          ['看板の操作', 'button[aria-label^="看板を配置: "]'],
          ['削除', 'button[aria-label^="写真項目を削除: "]'],
        ];
        return {
          alertInItem: {
            leftGap: rect.left - itemRect.left,
            rightGap: itemRect.right - rect.right,
          },
          textInAlert: {
            leftGap: textRect.left - contentLeft,
            rightGap: contentRight - textRect.right,
          },
          itemOverflow: itemEl.scrollWidth - itemEl.clientWidth,
          mainOverflow: main.scrollWidth - main.clientWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          controls: controlSelectors.map(([label, selector]) => {
            const control = itemEl.querySelector(selector) as HTMLElement | null;
            const r = control?.getBoundingClientRect();
            return { label, width: r?.width ?? 0, height: r?.height ?? 0 };
          }),
        };
      });
      measures.set(key, m);
    };

    await page.route(deleteMatcher, failDelete);
    try {
      for (const reason of reasons) {
        await resizeTo(375);
        currentDetail = reason.detail;
        await deleteButton.click();
        await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
        await dialog.getByRole('button', { name: '削除する' }).click();
        await expect(dialog).toBeHidden({ timeout: getTimeout(30000) });
        await expect(itemAlerts).toHaveCount(1, { timeout: getTimeout(20000) });
        await expect(itemAlerts).toHaveText(reason.detail);

        for (const width of [375, 320, 1280]) {
          await resizeTo(width);
          // 幅の変更は写真項目への操作ではないため、表示はそのまま残る
          await expect(itemAlerts).toHaveText(reason.detail);
          await measureAt(`${reason.kind} / ${width}`);
        }
      }
    } finally {
      await page.unroute(deleteMatcher, failDelete);
    }

    const allKeys = reasons.flatMap((r) => [375, 320, 1280].map((w) => `${r.kind} / ${w}`));
    const mobileKeys = reasons.flatMap((r) => [375, 320].map((w) => `${r.kind} / ${w}`));
    // 6 状態をすべて測れている（測り漏らした状態を緑に数えない）
    expect([...measures.keys()]).toEqual(allKeys);
    expect(mobileKeys).toHaveLength(4);

    for (const key of allKeys) {
      const m = measures.get(key)!;
      const report = `${key}: ${JSON.stringify(m)}`;
      expect(m.alertInItem.leftGap, report).toBeGreaterThanOrEqual(0);
      expect(m.alertInItem.rightGap, report).toBeGreaterThanOrEqual(0);
      expect(m.textInAlert.leftGap, report).toBeGreaterThanOrEqual(-1);
      expect(m.textInAlert.rightGap, report).toBeGreaterThanOrEqual(-1);
      expect(m.itemOverflow, report).toBeLessThanOrEqual(1);
      expect(m.mainOverflow, report).toBeLessThanOrEqual(1);
      expect(m.docOverflow, report).toBeLessThanOrEqual(1);
    }
    for (const key of mobileKeys) {
      const m = measures.get(key)!;
      const report = `${key}: ${JSON.stringify(m.controls)}`;
      expect(m.controls, report).toHaveLength(7);
      for (const control of m.controls) {
        expect(control.width, `${report} ${control.label}`).toBeGreaterThanOrEqual(44);
        expect(control.height, `${report} ${control.label}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  /**
   * 画面の下端の近くで写真項目の削除が失敗したとき（タスク 23.9 の是正 1 巡目）:
   * 利用者の判断（2026-10-04）「文言の分だけ動かす」により、写真項目の中の失敗の表示が画面の外へ
   * 出るときだけ、表示を最小の移動（`scrollIntoView({ block: 'nearest' })`）で画面内へ入れる。
   * 通常の位置（表示が画面内に収まる）では画面が動かないことは、上の REQ-7.7 のテストが主張する。
   *
   * 要件の印は掲げない（失敗の表示は受入基準 7.7 の外で、利用者の判断による）。375 幅と 320 幅で、
   * 最後の写真項目の削除ボタンの下端が画面の下端から 51px 以内（20px 上）に来るよう画面を送って
   * から、削除の応答を失敗（500）へ差し替えて実行する。主張は次のとおり。
   *  - 前提: 削除ボタンの下端が画面の下端から 51px 以内にある。測った表示の高さと、操作の行と表示の
   *    間隔（操作の行の下端から表示の上端まで）から求めた「動かさなかった場合の表示の下端」が画面の
   *    下端を超える（動かさなければ表示が画面の外へ出る状況である）。
   *  - 表示が画面の内側に収まり、中心が他の要素に覆われていない。
   *  - 画面は下へだけ動き、動いた量は 0 より大きく、表示の高さに 16px の余裕を足した値以下である
   *    （上部の通知の枠や画面の上端へは送らない）。
   *  - フォーカスは失敗した写真項目の削除ボタンにある（フォーカスの復帰が移動を打ち消さない）。
   */
  test('モバイル幅（375・320）で画面の下端の近くの写真項目の削除が失敗すると、失敗の表示の分だけ画面が動いて表示が画面内に入る', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `削除失敗_下端_${stamp}`;
    const fileNames = [`delete-bottom-a-${stamp}.jpg`, `delete-bottom-b-${stamp}.jpg`];
    const failureDetail = 'サーバー内部エラーが発生しました';
    const bottomGap = 20;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'delete-fail-bottom');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });
    const items = page.getByTestId('construction-photo-item');
    for (const [index, name] of fileNames.entries()) {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await upload;
      await expect(items).toHaveCount(index + 1, { timeout: getTimeout(20000) });
    }
    const lastFileName = fileNames[1]!;
    const lastPhoto = await prisma.constructionPhoto.findFirst({
      where: { albumId, fileName: lastFileName },
      select: { id: true },
    });
    expect(lastPhoto, lastFileName).not.toBeNull();

    const lastItem = items.filter({
      has: page.getByRole('heading', { level: 3, name: lastFileName }),
    });
    await expect(lastItem).toHaveCount(1);
    const lastAlerts = lastItem.getByRole('alert');
    const deleteButton = lastItem.getByRole('button', { name: `写真項目を削除: ${lastFileName}` });
    const dialog = page.getByRole('dialog');

    const deleteMatcher = (url: URL): boolean =>
      url.pathname.endsWith(`/api/construction-photos/images/${lastPhoto!.id}`);
    const failDelete = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/internal-server-error',
          title: 'Internal Server Error',
          status: 500,
          detail: failureDetail,
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    };

    type BottomCase = {
      width: number;
      viewportHeight: number;
      buttonBottomBefore: number;
      rowBottomBefore: number;
      scrollBefore: number;
      scrollAfter: number;
      gapRowToAlert: number;
      alert: { top: number; bottom: number; height: number };
      hit: string;
      focusedIsDeleteButton: boolean;
    };
    const cases: BottomCase[] = [];

    await page.route(deleteMatcher, failDelete);
    try {
      for (const width of [375, 320]) {
        await page.setViewportSize({ width, height: 812 });
        await expect
          .poll(async () => lastItem.evaluate((el) => getComputedStyle(el).flexDirection), {
            timeout: getTimeout(15000),
          })
          .toBe('column');
        await expect(deleteButton).toBeVisible();

        // 削除ボタンの下端が画面の下端から bottomGap 上に来るよう、画面を送る
        await deleteButton.evaluate((button, gap) => {
          const rect = button.getBoundingClientRect();
          window.scrollBy(0, rect.bottom - (window.innerHeight - gap));
        }, bottomGap);
        // 削除ボタンを押す（画面内にあるため、押す操作で画面は動かない）
        await deleteButton.click();
        await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
        const before = await deleteButton.evaluate((button) => ({
          scrollY: window.scrollY,
          buttonBottom: button.getBoundingClientRect().bottom,
          rowBottom: (button.parentElement as HTMLElement).getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
        }));

        await dialog.getByRole('button', { name: '削除する' }).click();
        await expect(dialog).toBeHidden({ timeout: getTimeout(30000) });
        await expect(lastAlerts).toHaveCount(1, { timeout: getTimeout(20000) });
        await expect(lastAlerts).toHaveText(failureDetail);
        await expect(lastAlerts).toBeInViewport({ ratio: 1, timeout: getTimeout(10000) });

        const after = await lastAlerts.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const row = el.previousElementSibling as HTMLElement;
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          const button = row.querySelector('button[aria-label^="写真項目を削除: "]');
          return {
            scrollY: window.scrollY,
            gapRowToAlert: rect.top - row.getBoundingClientRect().bottom,
            alert: { top: rect.top, bottom: rect.bottom, height: rect.height },
            hit: hit === null ? 'null' : el.contains(hit) ? 'self' : hit.tagName,
            focusedIsDeleteButton: button !== null && document.activeElement === button,
          };
        });
        cases.push({
          width,
          viewportHeight: before.viewportHeight,
          buttonBottomBefore: before.buttonBottom,
          rowBottomBefore: before.rowBottom,
          scrollBefore: before.scrollY,
          scrollAfter: after.scrollY,
          gapRowToAlert: after.gapRowToAlert,
          alert: after.alert,
          hit: after.hit,
          focusedIsDeleteButton: after.focusedIsDeleteButton,
        });
      }
    } finally {
      await page.unroute(deleteMatcher, failDelete);
    }

    // 2 幅とも測れている
    expect(cases.map((c) => c.width)).toEqual([375, 320]);
    for (const c of cases) {
      const report = JSON.stringify(c);
      const delta = c.scrollAfter - c.scrollBefore;
      // 前提: 削除ボタンの下端が画面の下端から 51px 以内にあり、動かさなければ表示の下端（動かす前の
      // 操作の行の下端＋行と表示の間隔＋表示の高さ）が画面の下端を超えていた
      expect(c.viewportHeight - c.buttonBottomBefore, report).toBeGreaterThanOrEqual(0);
      expect(c.viewportHeight - c.buttonBottomBefore, report).toBeLessThanOrEqual(51);
      expect(c.rowBottomBefore + c.gapRowToAlert + c.alert.height, report).toBeGreaterThan(
        c.viewportHeight
      );
      // 表示が画面の内側に収まり、覆われていない
      expect(c.alert.top, report).toBeGreaterThanOrEqual(0);
      expect(c.alert.bottom, report).toBeLessThanOrEqual(c.viewportHeight);
      expect(c.hit, report).toBe('self');
      // 下へだけ、表示の分だけ動く
      expect(delta, report).toBeGreaterThan(0);
      expect(delta, report).toBeLessThanOrEqual(c.alert.height + 16);
      // フォーカスは削除ボタンにある
      expect(c.focusedIsDeleteButton, report).toBe(true);
    }
  });

  /**
   * 写真項目の削除の成功の後の未保存の状態（タスク 23.6）:
   * 1280 幅の詳細画面で、コメントを編集した写真項目を取り除く。
   *
   * @requirement construction-photo/REQ-18.3
   *
   * 未保存の状態は、保留中の変更が一つでも残っているときに限る。主張は 2 段である。
   *  - 段 1（他の保留が残る）: 写真項目 X と K のコメントを編集し、X を取り除く。K の編集が残るため
   *    未保存の表示は残り、ブレッドクラムの遷移で離脱の確認が出る（とどまる）。保存は K の編集だけを
   *    送り（取り除いた X を送らない）、保存で未保存の状態が解消する（受入基準 18.3 の文言は
   *    この保存で主張する）。
   *  - 段 2（保留が空になる）: 写真項目 Y のコメントを編集し、Y を取り除く。保留が空になるため、
   *    未保存の表示が消え、「保存」は押せず、ブレッドクラムの遷移で離脱の確認が出ずに一覧へ移る。
   *    この間にメタの一括更新は送られない。
   *
   * 是正の経緯（2026-10-03、タスク 23.6）: 是正前の実装（`handleDelete` が保留を消しても未保存の
   * フラグを戻さない形）では、段 2 で取り除いた後も未保存の表示が残り、「未保存の表示が消える」の
   * 主張で赤だった（機能レベル検証の実測と同じ。「保存」は押せるが送信は 0 件で、ブレッドクラムで
   * 離脱の確認が出続ける）。
   */
  test('コメントを編集した写真項目を取り除くと、他の保留が残る間は未保存のままで、保留が空になれば未保存の状態が解消して離脱の確認が出ない', async ({
    page,
  }) => {
    const prisma = getPrismaClient();
    const stamp = Date.now();
    const albumName = `削除と未保存_${stamp}`;
    const keepFileName = `unsaved-keep-${stamp}.jpg`;
    const firstTargetFileName = `unsaved-target1-${stamp}.jpg`;
    const secondTargetFileName = `unsaved-target2-${stamp}.jpg`;
    const keepComment = `残る写真の編集_${stamp}`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'delete-unsaved');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    /** 指定の名前でローカル画像を 1 枚追加し、写真項目の総数が expectedCount になるのを待つ。 */
    const uploadNamed = async (name: string, expectedCount: number): Promise<void> => {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      await upload;
      await expect(page.getByTestId('construction-photo-item')).toHaveCount(expectedCount, {
        timeout: getTimeout(20000),
      });
    };

    await uploadNamed(keepFileName, 1);
    await uploadNamed(firstTargetFileName, 2);
    await uploadNamed(secondTargetFileName, 3);

    const uploaded = await prisma.constructionPhoto.findMany({
      where: { albumId },
      select: { id: true, fileName: true },
    });
    const keepId = uploaded.find((photo) => photo.fileName === keepFileName)?.id;
    expect(keepId, JSON.stringify(uploaded)).toBeTruthy();

    const items = page.getByTestId('construction-photo-item');
    const itemOf = (fileName: string) =>
      items.filter({ has: page.getByRole('heading', { level: 3, name: fileName }) });
    const dirtyIndicator = page.getByTestId('dirty-indicator');
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const breadcrumbToList = page.getByRole('link', { name: '工事写真一覧' });
    const dialog = page.getByRole('dialog');

    /** 指定の写真項目のコメントを編集する（入力の後に確定する）。 */
    const editComment = async (fileName: string, comment: string): Promise<void> => {
      const item = itemOf(fileName);
      await expect(item).toHaveCount(1);
      const textarea = item.getByPlaceholder('コメントを入力...');
      await textarea.click();
      await textarea.fill(comment);
      await textarea.blur();
    };

    /** 指定の写真項目を取り除き、一覧の件数が expectedCount になるのを待つ。 */
    const deletePhoto = async (fileName: string, expectedCount: number): Promise<void> => {
      await page.getByRole('button', { name: `写真項目を削除: ${fileName}` }).click();
      await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
      await expect(dialog).toContainText(fileName);
      const deleted = page.waitForResponse(
        (r) =>
          r.request().method() === 'DELETE' &&
          /\/api\/construction-photos\/images\/[0-9a-f-]+$/.test(new URL(r.url()).pathname),
        { timeout: getTimeout(30000) }
      );
      await dialog.getByRole('button', { name: '削除する' }).click();
      expect((await deleted).status()).toBe(204);
      await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
      await expect(items).toHaveCount(expectedCount, { timeout: getTimeout(20000) });
      await expect(itemOf(fileName)).toHaveCount(0);
    };

    // メタの一括更新の送信を数える（判定はオリジンではなくパスで行う）
    const batchRequests: Request[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname.endsWith('/api/construction-photos/images/batch')
      ) {
        batchRequests.push(request);
      }
    });

    // 前提: 編集の前は未保存ではなく、「保存」は押せない
    await expect(items).toHaveCount(3);
    await expect(dirtyIndicator).toBeHidden();
    await expect(saveButton).toBeDisabled();

    // --- 段 1: 他の写真項目の編集が残る ---
    await editComment(firstTargetFileName, `取り除く写真の編集_${stamp}`);
    await editComment(keepFileName, keepComment);
    await expect(dirtyIndicator).toBeVisible({ timeout: getTimeout(10000) });

    await deletePhoto(firstTargetFileName, 2);

    // K の編集が残るため、未保存のままで、ブレッドクラムの遷移で離脱の確認が出る
    await expect(dirtyIndicator).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await breadcrumbToList.click();
    await expect(dialog).toBeVisible({ timeout: getTimeout(10000) });
    await expect(dialog.getByText('変更が保存されていません。ページを離れますか？')).toBeVisible();
    await dialog.getByRole('button', { name: 'このページにとどまる' }).click();
    await expect(dialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page).toHaveURL(new RegExp(`/construction-photos/${albumId}$`));

    // R18.3: 保存は残った K の編集だけを送り、未保存の状態を解消する
    const batchResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname.endsWith('/api/construction-photos/images/batch'),
      { timeout: getTimeout(30000) }
    );
    await saveButton.click();
    expect((await batchResponse).status()).toBe(200);
    await expect(dirtyIndicator).toBeHidden({ timeout: getTimeout(15000) });
    expect(batchRequests).toHaveLength(1);
    expect(batchRequests[0]!.postDataJSON()).toEqual({
      items: [{ id: keepId, comment: keepComment }],
    });
    expect(
      await prisma.constructionPhoto.findUnique({
        where: { id: keepId! },
        select: { comment: true },
      })
    ).toEqual({ comment: keepComment });

    // --- 段 2: 取り除いた後に保留が空になる ---
    await editComment(secondTargetFileName, `取り除く写真の編集_2_${stamp}`);
    await expect(dirtyIndicator).toBeVisible({ timeout: getTimeout(10000) });

    await deletePhoto(secondTargetFileName, 1);

    // 未保存の表示が消え、「保存」は押せない
    await expect(dirtyIndicator).toBeHidden({ timeout: getTimeout(10000) });
    await expect(saveButton).toBeDisabled();

    // ブレッドクラムの遷移で離脱の確認が出ずに一覧へ移る
    await breadcrumbToList.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/construction-photos$`), {
      timeout: getTimeout(15000),
    });
    await expect(page.getByRole('heading', { name: '工事写真一覧' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await expect(dialog).toHaveCount(0);
    // 段 2 の間にメタの一括更新は送られていない（段 1 の保存の 1 件だけ）
    expect(batchRequests).toHaveLength(1);
    expect(
      await prisma.constructionPhoto.findMany({ where: { albumId }, select: { id: true } })
    ).toEqual([{ id: keepId }]);
  });

  /**
   * タスク 22.1: 詳細画面の通知の枠は、通知（PDF・ZIP・アップロードの結果）と失敗（保存など）を
   * 一つの表示で示し、後から出たものが前のものを置き換え、消えた後に古いものが再び現れない
   * （利用者の判断（2026-10-04））。変更前は `notice ?? error` を描いたため、通知が出ている間は
   * 保存の失敗が隠れ、通知が消えると古い保存の失敗が再び現れた。
   *
   * 通知は印刷対象 0 件の PDF 出力（R10.13）で、失敗はメタの一括更新の応答を 400 へ差し替えた保存で
   * 作る（判定はオリジンではなくパスで行う）。保存の失敗の後は未保存のままのため、経路 2 の PDF 出力は
   * 出力を止めて保存を促す通知を出す（タスク 26.2）。どちらも通知の枠の「通知」である。
   * 要件の印は掲げない（受入基準は通知の枠の置き換えを定めておらず、タスク 22.1 の利用者の判断による）。
   */
  test('通知の後に保存が失敗すると保存の失敗へ、失敗の後に通知が出ると通知へ置き換わり、消えた後に古いものが現れない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `通知と失敗_${stamp}`;
    const saveFailure = `保存の失敗の理由_${stamp}`;
    const noPrintable = '印刷対象の写真がありません。印刷対象を選択してからPDF出力してください。';

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'notice-error');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const items = page.getByTestId('construction-photo-item');
    /** 指定の名前でローカル画像を 1 枚追加し、写真項目の総数が expectedCount になるのを待つ。 */
    const uploadNamed = async (name: string, expectedCount: number): Promise<void> => {
      const upload = page.waitForResponse(
        (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      expect((await upload).status()).toBe(201);
      await expect(items).toHaveCount(expectedCount, { timeout: getTimeout(20000) });
    };
    await uploadNamed(`notice-error-1-${stamp}.jpg`, 1);

    const alerts = page.getByRole('main').getByRole('alert');
    const noticeAlert = alerts.filter({ hasText: noPrintable });
    const unsavedNoticeAlert = alerts.filter({
      hasText: '未保存の変更があります。保存してからPDF出力してください。',
    });
    const saveFailureAlert = alerts.filter({ hasText: saveFailure });
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const pdfButton = page.getByRole('button', { name: 'PDF出力' });
    const textarea = items.nth(0).getByPlaceholder('コメントを入力...');
    const isBatchPath = (url: string): boolean =>
      new URL(url).pathname === '/api/construction-photos/images/batch';
    // unroute は参照の等価で照合するため、route と同じ述語を渡す
    const batchRouteMatcher = (url: URL): boolean => isBatchPath(url.toString());
    const failBatch = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: saveFailure }),
      });
    };

    /** コメントを編集して未保存にする。 */
    const editComment = async (comment: string): Promise<void> => {
      await textarea.click();
      await textarea.fill(comment);
      await textarea.blur();
      await expect(page.getByTestId('dirty-indicator')).toBeVisible({
        timeout: getTimeout(10000),
      });
    };
    /** 保存を押し、メタの一括更新の応答が expectedStatus であることを確かめる。 */
    const save = async (expectedStatus: number): Promise<void> => {
      const response = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && isBatchPath(r.url()),
        { timeout: getTimeout(30000) }
      );
      await saveButton.click();
      expect((await response).status()).toBe(expectedStatus);
    };

    // 前提: 通知の枠には何も出ていない
    await expect(alerts).toHaveCount(0);

    // --- 経路 1: 通知の後に保存の失敗 ---
    await pdfButton.click();
    await expect(noticeAlert).toBeVisible({ timeout: getTimeout(15000) });
    await expect(alerts).toHaveCount(1);

    await editComment(`編集_1_${stamp}`);
    await page.route(batchRouteMatcher, failBatch);
    await save(400);
    // 後から出た保存の失敗が見え、通知は置き換えられている
    await expect(saveFailureAlert).toBeVisible({ timeout: getTimeout(10000) });
    await expect(noticeAlert).toHaveCount(0);
    await expect(alerts).toHaveCount(1);

    // 保存をやり直して成功すると失敗は消え、置き換えられた通知は再び現れない
    await page.unroute(batchRouteMatcher, failBatch);
    await save(200);
    await expect(page.getByTestId('dirty-indicator')).toBeHidden({ timeout: getTimeout(15000) });
    await expect(saveFailureAlert).toHaveCount(0);
    await expect(noticeAlert).toHaveCount(0);
    await expect(alerts).toHaveCount(0);

    // --- 経路 2: 保存の失敗の後に通知 ---
    await editComment(`編集_2_${stamp}`);
    await page.route(batchRouteMatcher, failBatch);
    await save(400);
    await expect(saveFailureAlert).toBeVisible({ timeout: getTimeout(10000) });
    await expect(alerts).toHaveCount(1);
    await page.unroute(batchRouteMatcher, failBatch);

    await pdfButton.click();
    // 後から出た通知（未保存のため保存を促す通知, タスク 26.2）が見え、保存の失敗は置き換えられている
    await expect(unsavedNoticeAlert).toBeVisible({ timeout: getTimeout(15000) });
    await expect(saveFailureAlert).toHaveCount(0);
    await expect(alerts).toHaveCount(1);

    // 写真項目の追加は通知を消す。置き換えられた保存の失敗は再び現れない
    await uploadNamed(`notice-error-2-${stamp}.jpg`, 2);
    await expect(unsavedNoticeAlert).toHaveCount(0);
    await expect(noticeAlert).toHaveCount(0);
    await expect(saveFailureAlert).toHaveCount(0);
    await expect(alerts).toHaveCount(0);
  });

  /**
   * タスク 22.2: 保存の失敗を保存ボタンの近くにも表示する（利用者の判断（2026-10-04）。23.9 と同じ
   * 考え方）。上部の通知の枠は、押した直後の位置で 375 幅では共通ヘッダの下、1280 幅では共通ヘッダに
   * 覆われ、320 幅では画面の外になる（レビューの実測）。上部の枠の表示は 22.1 の形のまま残し、読み上げ
   * を二重にしないため、保存の失敗の間は保存ボタンの近くの表示だけが role=alert である。
   *
   * 写真項目 1 件の詳細画面で、メタの一括更新の応答を 400 へ差し替えて保存を失敗させる（判定は
   * オリジンではなくパスで行う）。理由は区切りの無い英数字の一語 200 文字と長い和文 200 文字の
   * 2 通りで、それぞれを 375・320・1280 幅で起こす。主張は次のとおり（寸法はフォントに依存する
   * 固定値を使わず、ビューポート・要素の矩形と当たり判定で測る）。
   *  - 保存ボタンを押した直後の位置（応答を待つ以外に画面を動かさない）で、表示の矩形が
   *    ビューポートの内側にあり、表示の上の 5 点（中心と内側の四隅）の `elementFromPoint` が
   *    表示（またはその子孫）を返す（共通ヘッダなどに覆われていない）。
   *  - 表示は保存ボタンの下にあり、role=alert は表示の一つだけで、上部の枠は同じ文言を残す。
   *  - 表示の矩形が写真項目管理パネルの内側に収まり、文字列（DOM Range）の左右端が表示の内容の箱の
   *    内側に収まり、<main> と文書全体に水平のはみ出しが無い（許容誤差 1px）。
   *  - 差し替えを解いて保存をやり直すと成功し、表示も上部の枠も消える。
   * 要件の印は掲げない（受入基準 18 は保存の失敗の表示の位置を定めておらず、タスク 22.2 の利用者の
   * 判断による）。
   */
  test('保存が失敗すると、375・320・1280 幅で保存ボタンを押した直後の位置に失敗が見え、長い文言でもはみ出さず、やり直しの成功で消える', async ({
    page,
  }) => {
    const stamp = Date.now();
    const albumName = `保存の失敗の近く_${stamp}`;
    const reasons = [
      {
        kind: '区切りの無い英数字の一語',
        detail: `SaveFailureReason${stamp}`.padEnd(200, 'X'),
      },
      {
        kind: '長い和文',
        detail:
          '写真項目のメタデータの保存の処理で想定していない状態が見つかったため保存できませんでした'
            .repeat(5)
            .slice(0, 200),
      },
    ];
    expect(reasons.map((r) => r.detail.length)).toEqual([200, 200]);

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'save-failure-near');
    const albumId = await createAlbum(page, projectId, albumName);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: albumName })).toBeVisible({
      timeout: getTimeout(15000),
    });

    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: `save-failure-near-${stamp}.jpg`,
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    expect((await upload).status()).toBe(201);
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    const main = page.getByRole('main');
    const panel = page.getByRole('region', { name: '写真項目管理パネル' });
    const panelAlerts = panel.getByRole('alert');
    const mainAlerts = main.getByRole('alert');
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    const textarea = items.first().getByPlaceholder('コメントを入力...');
    const isBatchPath = (url: string): boolean =>
      new URL(url).pathname === '/api/construction-photos/images/batch';
    // unroute は参照の等価で照合するため、route と同じ述語を渡す
    const batchRouteMatcher = (url: URL): boolean => isBatchPath(url.toString());
    let currentDetail = '';
    const failBatch = async (route: Route): Promise<void> => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: currentDetail }),
      });
    };
    /** 保存を押し、メタの一括更新の応答が expectedStatus であることを確かめる。 */
    const save = async (expectedStatus: number): Promise<void> => {
      const response = page.waitForResponse(
        (r) => r.request().method() === 'PATCH' && isBatchPath(r.url()),
        { timeout: getTimeout(30000) }
      );
      await saveButton.click();
      expect((await response).status()).toBe(expectedStatus);
    };

    type Measure = {
      viewport: { width: number; height: number };
      alertRect: { top: number; bottom: number; left: number; right: number };
      saveButtonBottom: number;
      hits: boolean[];
      alertInPanel: { leftGap: number; rightGap: number };
      textInAlert: { leftGap: number; rightGap: number };
      mainOverflow: number;
      docOverflow: number;
    };
    const measures = new Map<string, Measure>();

    let round = 0;
    for (const reason of reasons) {
      for (const width of [375, 320, 1280]) {
        round += 1;
        const key = `${reason.kind} / ${width}`;
        await page.setViewportSize({ width, height: width <= 767 ? 812 : 800 });
        currentDetail = reason.detail;

        // コメントを編集して未保存にする
        await textarea.click();
        await textarea.fill(`編集_${round}_${stamp}`);
        await textarea.blur();
        await expect(page.getByTestId('dirty-indicator')).toBeVisible({
          timeout: getTimeout(10000),
        });

        await page.route(batchRouteMatcher, failBatch);
        try {
          await save(400);
          await expect(panelAlerts).toHaveCount(1, { timeout: getTimeout(10000) });
        } finally {
          await page.unroute(batchRouteMatcher, failBatch);
        }
        await expect(panelAlerts).toHaveText(reason.detail);
        // role=alert は保存ボタンの近くの一つだけで、上部の枠は同じ文言を残す（22.1 の形）
        await expect(mainAlerts).toHaveCount(1);
        await expect(main.getByText(reason.detail, { exact: true })).toHaveCount(2);
        await expect(saveButton).toHaveAttribute(
          'aria-describedby',
          (await panelAlerts.getAttribute('id'))!
        );

        // 押した直後の位置のまま測る（画面は動かさない）
        const m = await panelAlerts.evaluate((el): Measure => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const panelEl = el.closest('[aria-label="写真項目管理パネル"]') as HTMLElement;
          const panelRect = panelEl.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const textRect = range.getBoundingClientRect();
          const contentLeft =
            rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
          const contentRight =
            rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
          const button = document.querySelector(
            `[aria-describedby="${el.id}"]`
          ) as HTMLElement | null;
          // 中心と、内側へ 4px 寄せた四隅で当たり判定をする
          const inset = 4;
          const points: Array<[number, number]> = [
            [rect.left + rect.width / 2, rect.top + rect.height / 2],
            [rect.left + inset, rect.top + inset],
            [rect.right - inset, rect.top + inset],
            [rect.left + inset, rect.bottom - inset],
            [rect.right - inset, rect.bottom - inset],
          ];
          const mainEl = el.closest('main') as HTMLElement;
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            alertRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            saveButtonBottom: button?.getBoundingClientRect().bottom ?? Number.NaN,
            hits: points.map(([x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return hit !== null && (hit === el || el.contains(hit));
            }),
            alertInPanel: {
              leftGap: rect.left - panelRect.left,
              rightGap: panelRect.right - rect.right,
            },
            textInAlert: {
              leftGap: textRect.left - contentLeft,
              rightGap: contentRight - textRect.right,
            },
            mainOverflow: mainEl.scrollWidth - mainEl.clientWidth,
            docOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        measures.set(key, m);

        // やり直しの保存が成功すると、保存ボタンの近くの表示も上部の枠も消える
        await save(200);
        await expect(page.getByTestId('dirty-indicator')).toBeHidden({
          timeout: getTimeout(15000),
        });
        await expect(panelAlerts).toHaveCount(0);
        await expect(mainAlerts).toHaveCount(0);
        await expect(main.getByText(reason.detail, { exact: true })).toHaveCount(0);
        await expect(saveButton).not.toHaveAttribute('aria-describedby');
      }
    }

    const allKeys = reasons.flatMap((r) => [375, 320, 1280].map((w) => `${r.kind} / ${w}`));
    // 6 状態をすべて測れている（測り漏らした状態を緑に数えない）
    expect([...measures.keys()]).toEqual(allKeys);
    for (const key of allKeys) {
      const m = measures.get(key)!;
      const report = `${key}: ${JSON.stringify(m)}`;
      // ビューポートの内側にあり、共通ヘッダなどに覆われていない
      expect(m.alertRect.top, report).toBeGreaterThanOrEqual(0);
      expect(m.alertRect.bottom, report).toBeLessThanOrEqual(m.viewport.height);
      expect(m.alertRect.left, report).toBeGreaterThanOrEqual(0);
      expect(m.alertRect.right, report).toBeLessThanOrEqual(m.viewport.width);
      expect(m.hits, report).toEqual([true, true, true, true, true]);
      // 保存ボタンの下にある
      expect(m.alertRect.top, report).toBeGreaterThanOrEqual(m.saveButtonBottom);
      // はみ出さず、長い文言でも破れない
      expect(m.alertInPanel.leftGap, report).toBeGreaterThanOrEqual(0);
      expect(m.alertInPanel.rightGap, report).toBeGreaterThanOrEqual(0);
      expect(m.textInAlert.leftGap, report).toBeGreaterThanOrEqual(-1);
      expect(m.textInAlert.rightGap, report).toBeGreaterThanOrEqual(-1);
      expect(m.mainOverflow, report).toBeLessThanOrEqual(1);
      expect(m.docOverflow, report).toBeLessThanOrEqual(1);
    }
  });

  /**
   * タスク 24.2: 取り除かれた看板を指定した保存の失敗の文言（利用者の判断（2026-10-04）: 文言だけを
   * 日本語にし、看板なしへ戻す導線は足さない）。
   *
   * 看板の取り除きより前から開いていた詳細画面を、詳細画面を開いた後に API で看板を取り除くことで
   * 作る（他の利用者の操作の代わり）。画面の看板の一覧は開いた時点のものであるため、取り除かれた看板を
   * 選んで配置を保存できる。保存のメタの一括更新は 404（`SIGNBOARD_NOT_ALLOWED`）で失敗し、22.1/22.2
   * の経路のまま、保存ボタンの近く（role=alert）と上部の枠に日本語の文言が出る。応答の英語の文言と
   * 看板の ID は画面に出ない。応答はパスで観測する（オリジンに依存しない）。
   * 要件の印は掲げない（受入基準 9.5 は保存の失敗の文言を定めておらず、タスク 24.2 の利用者の判断に
   * よる）。
   */
  test('詳細画面を開いた後に看板が取り除かれると、その看板の配置の保存の失敗に日本語の文言が出て、英語の文言と ID は出ない', async ({
    page,
  }) => {
    const stamp = Date.now();
    const signboardName = `取り除かれる看板_${stamp}`;
    const fileName = `removed-signboard-${stamp}.jpg`;

    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'removed-signboard');
    const albumId = await createAlbum(page, projectId, `取り除かれた看板_${stamp}`);

    // 工事看板を登録する
    await page.goto(`/projects/${projectId}/construction-signboards`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: '工事看板マスタ' })).toBeVisible({
      timeout: getTimeout(15000),
    });
    await page.getByRole('button', { name: '新規登録' }).click();
    await page.getByLabel('工事件名').fill(signboardName);
    await page.getByLabel('工事場所').fill('取り除かれた看板E2E現場');
    const createSignboardResp = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === `/api/projects/${projectId}/construction-signboards`,
      { timeout: getTimeout(30000) }
    );
    await page.getByRole('button', { name: '登録' }).click();
    const createdSignboard = (await (await createSignboardResp).json()) as { id: string };
    const signboardId = createdSignboard.id;
    expect(signboardId).toBeTruthy();

    // 詳細画面を開き、写真項目を 1 件追加する（看板の一覧はこの時点で読み込まれる）
    const signboardListPath = `/api/projects/${projectId}/construction-signboards`;
    const signboardList = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === signboardListPath,
      { timeout: getTimeout(30000) }
    );
    await page.goto(`/construction-photos/${albumId}`);
    expect((await signboardList).status()).toBe(200);
    await page.waitForLoadState('networkidle');
    const upload = page.waitForResponse(
      (r) => r.request().method() === 'POST' && UPLOAD_URL_MATCHER(new URL(r.url())),
      { timeout: getTimeout(30000) }
    );
    await page.getByTestId('file-input').setInputFiles({
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: fs.readFileSync(FIXTURE_JPG),
    });
    expect((await upload).status()).toBe(201);
    const items = page.getByTestId('construction-photo-item');
    await expect(items).toHaveCount(1, { timeout: getTimeout(20000) });

    // 他の利用者の操作の代わりに、API で看板を取り除く（画面は読み込み直さない）
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(accessToken).toBeTruthy();
    const removal = await page.request.delete(
      `${API_BASE_URL}/api/construction-signboards/${signboardId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    expect(removal.status()).toBe(200);

    // 画面の看板の一覧は開いた時点のもので、取り除かれた看板を選んで配置を保存できる
    await items
      .first()
      .getByRole('button', { name: `看板を配置: ${fileName}` })
      .click();
    const assignDialog = page.getByRole('dialog', { name: '看板を配置' });
    await expect(assignDialog).toBeVisible({ timeout: getTimeout(10000) });
    await assignDialog.locator('#signboard-assign-select').selectOption({ label: signboardName });
    const editor = assignDialog.getByTestId('signboard-placement-editor');
    await expect(editor).toBeVisible({ timeout: getTimeout(10000) });
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(assignDialog).toBeHidden({ timeout: getTimeout(10000) });
    await expect(page.getByTestId('dirty-indicator')).toBeVisible({ timeout: getTimeout(10000) });

    // 保存は 404（SIGNBOARD_NOT_ALLOWED）で失敗する
    const batchResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname === '/api/construction-photos/images/batch',
      { timeout: getTimeout(30000) }
    );
    const saveButton = page.getByRole('button', { name: '保存', exact: true });
    await saveButton.click();
    const response = await batchResponse;
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('SIGNBOARD_NOT_ALLOWED');

    // 保存ボタンの近く（role=alert）と上部の枠に、日本語の文言が出る
    const expected = `工事看板「${signboardName}」は取り除かれています。看板を選び直すか、画面を読み込み直してください。`;
    const main = page.getByRole('main');
    const panel = page.getByRole('region', { name: '写真項目管理パネル' });
    const nearAlert = panel.getByRole('alert');
    await expect(nearAlert).toHaveCount(1, { timeout: getTimeout(15000) });
    await expect(nearAlert).toHaveText(expected);
    await expect(main.getByText(expected, { exact: true })).toHaveCount(2);
    // 応答の英語の文言と看板の ID は出ない
    await expect(main.getByText(/Signboard not found/)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(signboardId);
    // 失敗のときは未保存の変更が残る（R18）
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();
  });
});

// ============================================================================
// ZIP の一括エクスポートの一部失敗時の継続の選択（タスク 23.4）
// ============================================================================

/**
 * ZIP ファイルの中央ディレクトリからエントリ名を読み出す。
 *
 * 実装（JSZip）と別の読み方で中身を確かめるため、ZIP の書式（終端レコード 0x06054b50 と
 * 中央ディレクトリのヘッダ 0x02014b50）を直接読む。名前は UTF-8 として読む（JSZip は日本語の
 * 名前に UTF-8 のフラグを立てて書く）。
 */
function readZipEntryNames(buffer: Buffer): string[] {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd, 'ZIP の終端レコードが見つからない').toBeGreaterThanOrEqual(0);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < entryCount; n += 1) {
    expect(buffer.readUInt32LE(offset), '中央ディレクトリのヘッダの署名').toBe(0x02014b50);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/**
 * タスク 23.4: ZIP の一括エクスポートで一部の写真項目の画像の取得が失敗したとき、自動では
 * ダウンロードせず、失敗した写真項目をファイル名で示して、成功した項目だけでダウンロードを
 * 続けるか、やめるかを利用者に選ばせる（利用者の判断（2026-10-03））。
 *
 * 3 件の写真項目のうち指定した写真項目の画像（看板重畳モードの既定 composited が取得する
 * print-image と、plain/original が取得する original の双方）を 404 へ差し替えて失敗させる。
 * 差し替えの判定と応答は `page.unroute` で外せるよう、各テストの中で同じ参照を共有する。
 * 判定はオリジンではなくパスで行う（CI とローカルで API のオリジンが異なるため）。
 */
test.describe('工事写真 ZIP一括エクスポートの一部失敗時の継続の選択', () => {
  test.describe.configure({ mode: 'serial' });

  const stamp = Date.now();
  // カメラ由来の現実的な長さの区切りの無いファイル名と、区切りの無い英数字の長い一語のファイル名
  const realisticBase = `IMG_20261001_143052_foundation_rebar_${stamp}`;
  const alnumBase = `Zx9Qw7Er5Ty3Ui1Op8As6Df4Gh2Jk0LmNbVcXz${stamp}`;
  const plainBase = `foundation_overview_${stamp}`;
  const fileNames = [`${realisticBase}.jpg`, `${alnumBase}.jpg`, `${plainBase}.jpg`];
  // 既定の形式（JPEG）での ZIP のエントリ名（エクスポート対象の中での 0 始まりの順番 3 桁＋ベース名）
  const entryNames = [`000_${realisticBase}.jpg`, `001_${alnumBase}.jpg`, `002_${plainBase}.jpg`];

  let albumId: string | null = null;
  let photoIds: string[] = [];

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  /** 指定した写真項目の画像の取得を 404 へ差し替える判定と応答を作る（unroute 用に同じ参照を返す） */
  const makeImageFailure = (failingIds: string[]) => {
    const hits: string[] = [];
    const matcher = (url: URL): boolean => {
      const m = url.pathname.match(
        /\/api\/construction-photos\/images\/([0-9a-f-]+)\/(print-image|original)$/
      );
      return m !== null && failingIds.includes(m[1]!);
    };
    const handler = async (route: Route): Promise<void> => {
      hits.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'https://architrack.example.com/problems/not-found',
          title: 'Not Found',
          status: 404,
          detail: '写真が見つかりません',
          code: 'NOT_FOUND',
        }),
      });
    };
    return { matcher, handler, hits };
  };

  /** 詳細画面を開き、写真項目が 3 件そろうのを待つ */
  const openAlbum = async (page: import('@playwright/test').Page): Promise<void> => {
    expect(albumId).toBeTruthy();
    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('construction-photo-item')).toHaveCount(3, {
      timeout: getTimeout(20000),
    });
  };

  /** 全件エクスポートを既定の設定で開始する */
  const startExportAll = async (page: import('@playwright/test').Page): Promise<void> => {
    await page.getByRole('button', { name: '全件エクスポート' }).click();
    const settings = page.getByRole('dialog', { name: /全件一括エクスポート/ });
    await expect(settings).toBeVisible({ timeout: getTimeout(10000) });
    await settings.getByRole('button', { name: '開始' }).click();
  };

  test('事前準備: アルバムを作成し、名前の異なる写真を3枚追加する', async ({ page }) => {
    await loginAsUser(page, 'ADMIN_USER');
    const projectId = await createProject(page, 'zip-partial');
    albumId = await createAlbum(page, projectId, `ZIP一部失敗_${stamp}`);

    await page.goto(`/construction-photos/${albumId}`);
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < fileNames.length; i += 1) {
      const upload = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && /\/construction-photos\/.+\/images$/.test(r.url()),
        { timeout: getTimeout(30000) }
      );
      await page.getByTestId('file-input').setInputFiles({
        name: fileNames[i]!,
        mimeType: 'image/jpeg',
        buffer: fs.readFileSync(FIXTURE_JPG),
      });
      expect((await upload).status()).toBeLessThan(300);
      await expect(page.getByTestId('construction-photo-item')).toHaveCount(i + 1, {
        timeout: getTimeout(20000),
      });
    }

    const prisma = getPrismaClient();
    const photos = await prisma.constructionPhoto.findMany({
      where: { albumId: albumId! },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, fileName: true },
    });
    expect(
      photos.map((p) => p.fileName),
      JSON.stringify(photos)
    ).toEqual(fileNames);
    photoIds = photos.map((p) => p.id);
  });

  /**
   * 続ける: 1 件の失敗では自動でダウンロードせず、失敗した写真項目をファイル名で示し、
   * 「成功した項目だけでダウンロードする」で成功した 2 件だけの ZIP がちょうど 1 回ダウンロードされる。
   *
   * @requirement construction-photo/REQ-15.10
   */
  test('一部失敗: 失敗した写真項目を示し、「成功した項目だけでダウンロードする」で成功分だけのZIPを1回ダウンロードする', async ({
    page,
  }) => {
    expect(photoIds).toHaveLength(3);
    await loginAsUser(page, 'ADMIN_USER');
    await openAlbum(page);

    const failure = makeImageFailure([photoIds[0]!]);
    await page.route(failure.matcher, failure.handler);
    const downloads: import('@playwright/test').Download[] = [];
    page.on('download', (d) => downloads.push(d));

    await startExportAll(page);

    const dialog = page.getByRole('dialog', {
      name: '一部の写真項目をエクスポートできませんでした',
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    expect(failure.hits).toHaveLength(1);
    const failedItems = dialog
      .getByRole('list', { name: 'エクスポートに失敗した写真項目' })
      .getByRole('listitem');
    await expect(failedItems).toHaveCount(1);
    await expect(failedItems.first()).toHaveText(`${fileNames[0]}（1番目）`);
    await expect(
      dialog.getByText('1件の写真項目の画像を取得または加工できませんでした。')
    ).toBeVisible();
    await expect(
      dialog.getByText('成功した2件の写真項目だけでZIPをダウンロードしますか？')
    ).toBeVisible();
    // 段が出た時点ではダウンロードしていない
    expect(downloads).toHaveLength(0);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(30000) });
    await dialog.getByRole('button', { name: '成功した項目だけでダウンロードする' }).click();
    const download = await downloadPromise;

    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({
        hasText:
          '一部の写真項目（1件）のエクスポートに失敗しました。成功した項目のみでZIPをダウンロードしました。',
      })
    ).toBeVisible({ timeout: getTimeout(10000) });
    expect(downloads).toHaveLength(1);
    expect(download.suggestedFilename()).toMatch(/^ZIP一部失敗_\d+_\d{8}_\d{6}\.zip$/);
    const zipPath = await download.path();
    expect(readZipEntryNames(fs.readFileSync(zipPath))).toEqual([entryNames[1], entryNames[2]]);

    await page.unroute(failure.matcher, failure.handler);
  });

  /**
   * やめる: 「ダウンロードしない」でダウンロードせずに閉じる。続けて差し替えを外して全件エクスポート
   * すると、選択の段を経ずに即座にダウンロードされ、そのダウンロードが最初で唯一のもの（3 件すべてを
   * 含む ZIP）であることから、取りやめた ZIP がダウンロードされていないことを確かめる。
   *
   * @requirement construction-photo/REQ-15.10
   */
  test('一部失敗: 「ダウンロードしない」でダウンロードせずに閉じ、次のエクスポートは前の結果を持ち越さない', async ({
    page,
  }) => {
    expect(photoIds).toHaveLength(3);
    await loginAsUser(page, 'ADMIN_USER');
    await openAlbum(page);

    const failure = makeImageFailure([photoIds[0]!]);
    await page.route(failure.matcher, failure.handler);
    const downloads: import('@playwright/test').Download[] = [];
    page.on('download', (d) => downloads.push(d));

    await startExportAll(page);
    const dialog = page.getByRole('dialog', {
      name: '一部の写真項目をエクスポートできませんでした',
    });
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    expect(failure.hits).toHaveLength(1);
    await dialog.getByRole('button', { name: 'ダウンロードしない' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({ hasText: 'ZIPをダウンロードしました' })
    ).toHaveCount(0);

    // 差し替えを外して新しいエクスポートを始める（全件成功）
    await page.unroute(failure.matcher, failure.handler);
    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await startExportAll(page);
    await downloadPromise;

    // 最初で唯一のダウンロードが、3 件すべてを含む新しいエクスポートの ZIP である
    expect(downloads).toHaveLength(1);
    expect(readZipEntryNames(fs.readFileSync(await downloads[0]!.path()))).toEqual(entryNames);
    await expect(
      page.getByRole('dialog', { name: '一部の写真項目をエクスポートできませんでした' })
    ).toHaveCount(0);
  });

  /**
   * 全件成功: 選択の段を経ずに即座にダウンロードされ、ZIP は 3 件すべてを含む。
   *
   * @requirement construction-photo/REQ-15.10
   */
  test('全件成功: 選択の段を経ずに即座に全件のZIPをダウンロードする', async ({ page }) => {
    expect(photoIds).toHaveLength(3);
    await loginAsUser(page, 'ADMIN_USER');
    await openAlbum(page);

    const downloadPromise = page.waitForEvent('download', { timeout: getTimeout(60000) });
    await startExportAll(page);
    const download = await downloadPromise;

    expect(readZipEntryNames(fs.readFileSync(await download.path()))).toEqual(entryNames);
    await expect(page.getByRole('dialog', { name: '一括エクスポート完了' })).toBeVisible({
      timeout: getTimeout(10000),
    });
    await expect(
      page.getByRole('button', { name: '成功した項目だけでダウンロードする' })
    ).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'エクスポートに失敗した写真項目' })).toHaveCount(0);
  });

  /**
   * 全件失敗: ダウンロードせず、失敗した写真項目をすべて示し、続ける操作を出さない。
   *
   * @requirement construction-photo/REQ-15.10
   */
  test('全件失敗: ダウンロードせず、失敗した写真項目をすべて示し、続ける操作を出さない', async ({
    page,
  }) => {
    expect(photoIds).toHaveLength(3);
    await loginAsUser(page, 'ADMIN_USER');
    await openAlbum(page);

    const failure = makeImageFailure(photoIds);
    await page.route(failure.matcher, failure.handler);
    const downloads: import('@playwright/test').Download[] = [];
    page.on('download', (d) => downloads.push(d));

    await startExportAll(page);
    const dialog = page.getByRole('dialog', { name: '写真項目をエクスポートできませんでした' });
    await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
    expect(failure.hits).toHaveLength(3);
    const failedItems = dialog
      .getByRole('list', { name: 'エクスポートに失敗した写真項目' })
      .getByRole('listitem');
    await expect(failedItems).toHaveCount(3);
    await expect(failedItems).toHaveText([
      `${fileNames[0]}（1番目）`,
      `${fileNames[1]}（2番目）`,
      `${fileNames[2]}（3番目）`,
    ]);
    await expect(
      dialog.getByText(
        'すべての写真項目（3件）の画像を取得または加工できませんでした。ZIPはダウンロードしていません。'
      )
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: '成功した項目だけでダウンロードする' })
    ).toHaveCount(0);

    await dialog.getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({
        hasText:
          'すべての写真項目（3件）のエクスポートに失敗しました。ZIPはダウンロードしていません。',
      })
    ).toBeVisible();
    expect(downloads).toHaveLength(0);

    await page.unroute(failure.matcher, failure.handler);
  });

  /**
   * モバイル幅（375・320）: 区切りの無い長いファイル名（カメラ由来の現実的な名前と英数字の長い一語）の
   * 2 件を失敗させたとき、選択の段が文書全体・ダイアログを水平にはみ出させず、ファイル名の文字列が
   * 一覧の内側に収まり、二つの操作が 44×44 以上で画面内に描かれる（R19 の詳細画面の扱い）。
   *
   * 前提として、各ファイル名の一行の自然幅が一覧の幅を超える（折り返さなければはみ出す長さである）
   * ことを canvas の measureText で主張する。文字列の右端は箱ではなく Range の外接矩形で測る。
   *
   * @requirement construction-photo/REQ-15.10
   */
  test('モバイル幅（375・320）で長いファイル名の失敗の一覧と二つの操作が画面内に収まる', async ({
    page,
  }) => {
    expect(photoIds).toHaveLength(3);
    await loginAsUser(page, 'ADMIN_USER');

    const failure = makeImageFailure([photoIds[0]!, photoIds[1]!]);
    await page.route(failure.matcher, failure.handler);

    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 640 });
      await openAlbum(page);
      await startExportAll(page);

      const dialog = page.getByRole('dialog', {
        name: '一部の写真項目をエクスポートできませんでした',
      });
      await expect(dialog).toBeVisible({ timeout: getTimeout(30000) });
      const list = dialog.getByRole('list', { name: 'エクスポートに失敗した写真項目' });
      await expect(list.getByRole('listitem')).toHaveCount(2);

      const m = await list.evaluate((ul) => {
        const context = document.createElement('canvas').getContext('2d');
        const listRect = ul.getBoundingClientRect();
        const names = Array.from(ul.querySelectorAll('li > span:first-child')).map((span) => {
          const style = getComputedStyle(span);
          let naturalWidth = -1;
          if (context) {
            context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            naturalWidth = context.measureText(span.textContent ?? '').width;
          }
          const range = document.createRange();
          range.selectNodeContents(span);
          const r = range.getBoundingClientRect();
          return { text: span.textContent, naturalWidth, textLeft: r.left, textRight: r.right };
        });
        const dialogEl = ul.closest('[role="dialog"]') as HTMLElement;
        const content = dialogEl.firstElementChild as HTMLElement;
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          doc: {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
          content: {
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
            right: content.getBoundingClientRect().right,
          },
          list: {
            scrollWidth: ul.scrollWidth,
            clientWidth: ul.clientWidth,
            left: listRect.left,
            right: listRect.right,
            overflowY: getComputedStyle(ul).overflowY,
          },
          names,
        };
      });
      const report = JSON.stringify(m);

      expect(m.viewportWidth, report).toBe(width);
      expect(m.names, report).toHaveLength(2);
      expect(
        m.names.map((n) => n.text),
        report
      ).toEqual([fileNames[0], fileNames[1]]);
      expect(m.list.clientWidth, report).toBeGreaterThan(0);
      for (const n of m.names) {
        // 前提: 一語の自然幅が一覧の幅を超える（折り返さなければはみ出す長さ）
        expect(n.naturalWidth, report).toBeGreaterThan(m.list.clientWidth);
        // ファイル名の文字列が一覧の内側に収まる
        expect(n.textLeft, report).toBeGreaterThanOrEqual(m.list.left - 1);
        expect(n.textRight, report).toBeLessThanOrEqual(m.list.right + 1);
      }
      expect(m.list.scrollWidth, report).toBeLessThanOrEqual(m.list.clientWidth);
      expect(m.list.overflowY, report).toBe('auto');
      expect(m.content.scrollWidth, report).toBeLessThanOrEqual(m.content.clientWidth);
      expect(m.content.right, report).toBeLessThanOrEqual(m.viewportWidth + 1);
      expect(m.doc.scrollWidth - m.doc.clientWidth, report).toBeLessThanOrEqual(1);

      // 二つの操作が 44×44 以上で、画面内（水平・垂直）に描かれる
      for (const name of ['ダウンロードしない', '成功した項目だけでダウンロードする']) {
        const box = await dialog.getByRole('button', { name }).boundingBox();
        expect(box, `${name} @${width}`).not.toBeNull();
        expect(box!.width, `${name} @${width}`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${name} @${width}`).toBeGreaterThanOrEqual(44);
        expect(box!.x, `${name} @${width}`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${name} @${width}`).toBeLessThanOrEqual(width + 1);
        expect(box!.y + box!.height, `${name} @${width}`).toBeLessThanOrEqual(m.viewportHeight + 1);
      }

      // 後始末: ダウンロードせずに閉じる
      await dialog.getByRole('button', { name: 'ダウンロードしない' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    expect(failure.hits).toHaveLength(4);
    await page.unroute(failure.matcher, failure.handler);
  });
});
