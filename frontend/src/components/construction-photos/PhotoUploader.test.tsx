/**
 * @fileoverview 3系統アップローダのテスト
 *
 * Task 6.3: 3系統アップローダ（ローカル/カメラ/現調選択モーダル）
 *
 * - ローカル/カメラ選択で upload API が呼ばれ、追加された写真項目を通知する
 * - 現調選択モーダルで選択→ from-surveys API
 * - アップロードは最大5並列・部分失敗継続（uploadFilesInWaves）
 * - 失敗した画像の実体がアップロードUIの未送信一覧まで到達する（Task 108.3）
 * - 親への通知が例外を投げても、送信の失敗として扱わない（Task 14, 20.5, 20.14）
 * - 未送信画像の保持・再送・破棄・抑止が工事写真経路で成立する（Task 15.1）
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 11.5, 20.2, 20.3, 20.4, 20.5, 20.7, 20.8, 20.9,
 * 20.10, 20.14, 20.17, 20.18 / site-survey 37.1（工事写真 20.1）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { PhotoUploader, uploadFilesInWaves } from './PhotoUploader';
import * as imagesApi from '../../api/construction-photo-images';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import { compressImagesForUpload } from '../../utils/image-compression';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import type { PaginatedSiteSurveys, SiteSurveyDetail } from '../../types/site-survey.types';

vi.mock('../../api/construction-photo-images');
vi.mock('../../api/site-surveys');

// ============================================================================
// 画像圧縮のスパイ化
//
// 再送で送信前の圧縮が再実行されないこと（20.4）を観測するため、圧縮モジュールを
// スパイへ差し替える。既定の実装は入力をそのまま返す恒等関数とし、jsdom（
// createImageBitmap 非実装のため実装が元ファイルを返す）と同じ挙動を保つ。
// ============================================================================

vi.mock('../../utils/image-compression', () => ({
  compressImageForUpload: vi.fn(),
  compressImagesForUpload: vi.fn(),
}));

const compressImagesForUploadMock = vi.mocked(compressImagesForUpload);

// ============================================================================
// URL.createObjectURL / revokeObjectURL のスタブ
//
// jsdom は ObjectURL API を実装しないが、未送信画像のプレビューURL生成に必要と
// なる。テストを条件付きで無効化せずスタブへ差し替える（AI運用第3原則）。
// ============================================================================

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  // vi.clearAllMocks() は呼び出し履歴のみを消すが、実装の張り直しを各 describe に
  // 依存させないよう毎回ここで既定（恒等関数）へ戻す
  compressImagesForUploadMock.mockImplementation((files: File[]) => Promise.resolve(files));

  let issued = 0;
  URL.createObjectURL = vi.fn((): string => {
    issued += 1;
    return `blob:mock/${issued}`;
  });
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function makePhoto(id: string, fileName: string): ConstructionPhotoWithUrls {
  return {
    id,
    albumId: 'album-1',
    fileName,
    fileSize: 100,
    width: 800,
    height: 600,
    displayOrder: 1,
    comment: null,
    includeInReport: false,
    signboardId: null,
    signboardPlacement: null,
    thumbnailUrl: `https://example.com/${id}.jpg`,
    printImageUrl: `https://example.com/${id}/print`,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeFile(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' });
}

describe('uploadFilesInWaves (R11.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('同時実行数を最大5に制限する', async () => {
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    // 全リクエストを一旦このゲートで待たせ、同時実行数を観測してから解放する。
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async (_albumId, files) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      return { successful: [makePhoto('id', files[0]!.name)], failed: [] };
    });

    const files = Array.from({ length: 7 }, (_, i) => makeFile(`f${i}.jpg`));
    const promise = uploadFilesInWaves('album-1', files);

    // 最初のウェーブでは5件のみ同時に実行される（残り2件は次ウェーブ待ち）
    await waitFor(() => expect(active).toBe(5));
    expect(maxActive).toBe(5);

    // ゲートを解放して全ウェーブを完走させる
    release();
    await promise;

    expect(imagesApi.uploadConstructionPhotos).toHaveBeenCalledTimes(7);
    // 2ウェーブ目は残り2件のみのため、同時実行数は5を超えない
    expect(maxActive).toBe(5);
  });

  it('一部が失敗しても残りの処理を継続し成功分/失敗分を集約する (R12.5)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'bad.jpg') {
        return Promise.resolve({
          successful: [],
          failed: [{ fileName: name, error: 'サポートされていないファイル形式' }],
        });
      }
      return Promise.resolve({ successful: [makePhoto(name, name)], failed: [] });
    });

    const files = [makeFile('a.jpg'), makeFile('bad.jpg'), makeFile('c.jpg')];
    const result = await uploadFilesInWaves('album-1', files);

    expect(result.successful.map((p) => p.fileName)).toEqual(['a.jpg', 'c.jpg']);
    // 失敗は File 実体・失敗理由・再送可否として返る（37.1）
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.file).toBe(files[1]);
    expect(result.failed[0]!.error).toBe('サポートされていないファイル形式');
  });

  it('リクエストが例外を投げても失敗として集約し継続する', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'throw.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.resolve({ successful: [makePhoto(name, name)], failed: [] });
    });

    const okFile = makeFile('ok.jpg');
    const throwFile = makeFile('throw.jpg');
    const result = await uploadFilesInWaves('album-1', [okFile, throwFile]);
    expect(result.successful).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.file).toBe(throwFile);
  });

  // ==========================================================================
  // 失敗した画像の実体と再送可否の返却（Task 108.3, Requirement 37.1 / 20.1）
  // ==========================================================================

  it('送信例外で失敗した画像の File 実体と再送可否を返す (37.1, 37.16)', async () => {
    const timeoutFile = makeFile('timeout.jpg');
    const tooLargeFile = makeFile('too-large.jpg');

    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'timeout.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.reject(new ApiError(413, 'ファイルサイズが上限を超えています'));
    });

    const result = await uploadFilesInWaves('album-1', [timeoutFile, tooLargeFile]);

    expect(result.failed).toHaveLength(2);
    // 通信エラーは再送で解消しうるため retriable
    expect(result.failed[0]).toEqual({
      file: timeoutFile,
      error: 'ネットワークエラー',
      kind: 'retriable',
    });
    // 413（サイズ上限超過）は確定的な拒否のため permanent
    expect(result.failed[1]).toEqual({
      file: tooLargeFile,
      error: 'ファイルサイズが上限を超えています',
      kind: 'permanent',
    });
  });

  /**
   * @requirement construction-photo/REQ-20.21: ストレージ保存の失敗は再送可能な未送信画像として保持する
   */
  it('サーバーが 207 で per-file 失敗を返した場合も対応する File を返し文言で分類する (37.16, 37.21)', async () => {
    const formatFile = makeFile('format.jpg');
    const storageFile = makeFile('storage.jpg');

    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'format.jpg') {
        return Promise.resolve({
          successful: [],
          failed: [
            {
              fileName: name,
              error: 'サポートされていない画像形式です。JPEG、PNG、WebPのみ対応しています。',
            },
          ],
        });
      }
      return Promise.resolve({
        successful: [],
        failed: [{ fileName: name, error: '画像の保存に失敗しました' }],
      });
    });

    const result = await uploadFilesInWaves('album-1', [formatFile, storageFile]);

    expect(result.failed).toHaveLength(2);
    // 画像形式の非対応は再送しても解消しない
    expect(result.failed[0]!.file).toBe(formatFile);
    expect(result.failed[0]!.kind).toBe('permanent');
    // ストレージ保存失敗は再送で解消しうる（一律 permanent 化による画像喪失を避ける）
    expect(result.failed[1]!.file).toBe(storageFile);
    expect(result.failed[1]!.error).toBe('画像の保存に失敗しました');
    expect(result.failed[1]!.kind).toBe('retriable');
  });
});

describe('PhotoUploader コンポーネント', () => {
  const mockSurveys: PaginatedSiteSurveys = {
    data: [
      {
        id: 'survey-1',
        projectId: 'project-1',
        name: '一次調査',
        surveyDate: '2025-01-01T00:00:00.000Z',
        memo: null,
        thumbnailUrl: null,
        imageCount: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  };

  const mockSurveyDetail: SiteSurveyDetail = {
    id: 'survey-1',
    projectId: 'project-1',
    name: '一次調査',
    surveyDate: '2025-01-01T00:00:00.000Z',
    memo: null,
    thumbnailUrl: null,
    imageCount: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    project: { id: 'project-1', name: 'テストプロジェクト' },
    images: [
      {
        id: 'survey-image-1',
        surveyId: 'survey-1',
        originalPath: 'orig/1',
        thumbnailPath: 'thumb/1',
        thumbnailUrl: 'https://example.com/s1.jpg',
        fileName: 's1.jpg',
        fileSize: 100,
        width: 800,
        height: 600,
        displayOrder: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSurveys);
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  });

  it('ローカルファイル選択で upload API が呼ばれ、追加写真が通知される (R4.1, R4.2)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
      successful: [makePhoto('new-1', 'local.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(<PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />);

    const fileInput = screen.getByTestId('file-input');
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [makeFile('local.jpg')] } });
    });

    await waitFor(() => {
      expect(imagesApi.uploadConstructionPhotos).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'new-1' })]);
    });
  });

  it('カメラ入力で撮影した画像も upload API に流す (R5.1, R5.2)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
      successful: [makePhoto('cam-1', 'camera.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(<PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />);

    const cameraInput = screen.getByTestId('camera-input');
    await act(async () => {
      fireEvent.change(cameraInput, { target: { files: [makeFile('camera.jpg')] } });
    });

    await waitFor(() => {
      expect(imagesApi.uploadConstructionPhotos).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'cam-1' })]);
    });
  });

  // @requirement construction-photo/REQ-5.3
  it('カメラ手段はネイティブcapture属性への委譲で、非カメラ端末ではローカルアップロードに縮退する (R5.3)', async () => {
    // R5.3: 「デバイスがカメラをサポートしない場合、カメラ撮影手段を提供せずローカルアップロード
    // 手段のみを提示する」を、独自のライブカメラ実装（getUserMedia 等）を持たず、標準の
    // file input + capture="environment" にキャプチャ可否の判定をブラウザへ委譲する設計で満たす。
    // カメラ非対応端末では capture 属性が無視され同 input が通常のファイル選択（＝ローカル
    // アップロード）として振る舞うため、追加手段はローカルアップロードのみに縮退する。
    vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
      successful: [makePhoto('deg-1', 'picked.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(<PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />);

    // カメラ入力は標準の file input（type=file / accept=image/*）であり、キャプチャは
    // capture="environment" によりOSへ委譲される（独自のカメラUIを持たない）。
    const cameraInput = screen.getByTestId('camera-input') as HTMLInputElement;
    expect(cameraInput.tagName).toBe('INPUT');
    expect(cameraInput.getAttribute('type')).toBe('file');
    expect(cameraInput.getAttribute('capture')).toBe('environment');
    expect(cameraInput.getAttribute('accept')).toBe('image/*');

    // 非カメラ端末を想定し、capture が無視されて「ファイル選択（ローカルアップロード）」として
    // 使われても、ローカルアップロードと同一の経路（uploadConstructionPhotos）へ合流する
    // （＝カメラ専用の別経路が存在せず、追加手段がローカルアップロードのみに縮退する）。
    await act(async () => {
      fireEvent.change(cameraInput, { target: { files: [makeFile('picked.jpg')] } });
    });
    await waitFor(() => {
      expect(imagesApi.uploadConstructionPhotos).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'deg-1' })]);
    });
  });

  it('現調写真選択で from-surveys API が呼ばれる (R6.1)', async () => {
    vi.mocked(imagesApi.addConstructionPhotosFromSurveys).mockResolvedValue({
      successful: [makePhoto('copy-1', 's1.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(<PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />);

    fireEvent.click(screen.getByRole('button', { name: /現場調査写真から選択/ }));

    fireEvent.click(await screen.findByText('一次調査'));
    fireEvent.click(await screen.findByLabelText('s1.jpg を選択'));
    fireEvent.click(screen.getByRole('button', { name: /追加/ }));

    await waitFor(() => {
      expect(imagesApi.addConstructionPhotosFromSurveys).toHaveBeenCalledWith('album-1', [
        'survey-image-1',
      ]);
    });
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'copy-1' })]);
    });
  });

  // ==========================================================================
  // 失敗した画像の未送信一覧への反映（Task 108.3, Requirement 37.1 / 20.1）
  // ==========================================================================

  // @requirement site-survey/REQ-37.1
  it('一部が失敗した場合、失敗画像が未送信一覧に反映され成功分の登録と失敗通知は変わらない (37.1, R12.5)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'fail.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.resolve({ successful: [makePhoto('ok-1', name)], failed: [] });
    });

    const onPhotosAdded = vi.fn();
    const onNotify = vi.fn();
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={onPhotosAdded}
        onNotify={onNotify}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [makeFile('ok.jpg'), makeFile('fail.jpg')] },
      });
    });

    // 成功分は従来どおり親へ通知される（部分失敗継続）
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'ok-1' })]);
    });

    // 失敗した画像の実体がアップロードUIまで到達し未送信一覧に現れる（37.1）
    const items = await screen.findAllByTestId('pending-upload-item');
    expect(items).toHaveLength(1);
    expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
    expect(screen.getByTestId('pending-upload-filename')).toHaveTextContent('fail.jpg');
    expect(screen.getByTestId('pending-upload-reason')).toHaveTextContent('ネットワークエラー');
    // 通信エラーは再送で解消しうるため再送可能な状態で保持される
    expect(items[0]!).toHaveAttribute('data-kind', 'retriable');

    // 既存の失敗通知の文言は変更しない（回帰検出）
    expect(onNotify).toHaveBeenCalledWith('1件を追加しました。1件の追加に失敗しました。\nfail.jpg');
  });

  it('全件失敗しても全ての画像が未送信一覧に保持され失敗通知の文言は変わらない (37.1)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockRejectedValue(
      new ApiError(503, 'ストレージが利用できません')
    );

    const onPhotosAdded = vi.fn();
    const onNotify = vi.fn();
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={onPhotosAdded}
        onNotify={onNotify}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [makeFile('a.jpg'), makeFile('b.jpg')] },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);
    });
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
    expect(onPhotosAdded).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('全2件の追加に失敗しました。\na.jpg\nb.jpg');
  });

  // ==========================================================================
  // 通知の例外を送信の失敗として扱わない（Task 14, Requirement 20.5, 20.14）
  //
  // ImageUploader.submitFiles の catch は「試行対象の全ファイル」を保持へ回すため、
  // 通知の例外が handleUpload の外へ伝播すると、サーバー登録済みの画像まで未送信画像
  // として保持され、再送で同一画像が重複登録される（20.14）。
  // ==========================================================================

  // @requirement construction-photo/REQ-20.5
  // @requirement construction-photo/REQ-20.14
  it('成功分の通知（onPhotosAdded）が例外を投げても、失敗した画像だけが未送信一覧に残る (20.5, 20.14)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'fail.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.resolve({ successful: [makePhoto('ok-1', name)], failed: [] });
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onPhotosAdded = vi.fn(() => {
      throw new Error('親の状態更新で失敗');
    });
    const onNotify = vi.fn();
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={onPhotosAdded}
        onNotify={onNotify}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [makeFile('ok.jpg'), makeFile('fail.jpg')] },
      });
    });

    // 通知が例外を投げても、送信に失敗した画像のみが未送信一覧に残る（20.5）
    const items = await screen.findAllByTestId('pending-upload-item');
    expect(items).toHaveLength(1);
    const fileNames = screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent);
    expect(fileNames).toEqual(['fail.jpg']);
    // サーバー登録済みの画像は未送信一覧に現れない（再送による重複登録の回避, 20.14）
    expect(fileNames).not.toContain('ok.jpg');

    // 失敗通知の文言・表示条件は変更しない（挙動保存）
    expect(onNotify).toHaveBeenCalledWith('1件を追加しました。1件の追加に失敗しました。\nfail.jpg');
    // 通知の失敗を無言で握り潰さない
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // @requirement construction-photo/REQ-20.5
  // @requirement construction-photo/REQ-20.14
  it('失敗通知（onNotify）が例外を投げても、失敗した画像だけが未送信一覧に残る (20.5, 20.14)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'fail.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.resolve({ successful: [makePhoto('ok-1', name)], failed: [] });
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onPhotosAdded = vi.fn();
    const onNotify = vi.fn(() => {
      throw new Error('通知の表示で失敗');
    });
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={onPhotosAdded}
        onNotify={onNotify}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [makeFile('ok.jpg'), makeFile('fail.jpg')] },
      });
    });

    const items = await screen.findAllByTestId('pending-upload-item');
    expect(items).toHaveLength(1);
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'fail.jpg',
    ]);
    // 成功分の親への通知は従来どおり行われる（部分失敗継続）
    expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'ok-1' })]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  // @requirement construction-photo/REQ-20.14
  it('全件失敗時に失敗通知が例外を投げても未送信一覧は失敗した画像のみで構成される (20.14)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockRejectedValue(
      new ApiError(503, 'ストレージが利用できません')
    );

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onNotify = vi.fn(() => {
      throw new Error('通知の表示で失敗');
    });
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={vi.fn()}
        onNotify={onNotify}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('file-input'), {
        target: { files: [makeFile('a.jpg'), makeFile('b.jpg')] },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);
    });
    // 保持される失敗理由は送信の失敗であって、通知の失敗ではない
    expect(screen.getAllByTestId('pending-upload-reason').map((el) => el.textContent)).toEqual([
      'ストレージが利用できません',
      'ストレージが利用できません',
    ]);
    // 全件失敗の文言・表示条件は変更しない（挙動保存）
    expect(onNotify).toHaveBeenCalledWith('全2件の追加に失敗しました。\na.jpg\nb.jpg');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// ============================================================================
// 未送信画像の保持・再送・破棄・抑止（Task 15.1）
//
// 工事写真のアップロードAPI（`uploadConstructionPhotos`）をモックし、
// `PhotoUploader` 経由で保持機構（`ImageUploader` / `usePendingUploads` /
// `PendingUploadPanel`）が成立していることを観測する。site-survey 側のテストの
// 移植ではなく、工事写真経路での結線を検証することが目的である。
//
// Requirements: 20.2, 20.3, 20.4, 20.5, 20.7, 20.8, 20.9, 20.10, 20.17, 20.18
// ============================================================================

/** 送信の完了タイミングをテストから制御するためのゲート */
function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('PhotoUploader 未送信画像の保持・再送・破棄・抑止 (R20)', () => {
  // 現調写真の選択モーダルは閉じている間フェッチしないため、ここでは
  // アップロードAPIのみを差し替える（未送信画像の保持は送信経路のみに依存する）
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** 指定ファイルを選択し、送信が落ち着くまで待つ */
  async function selectFiles(testId: string, files: File[]): Promise<void> {
    await act(async () => {
      fireEvent.change(screen.getByTestId(testId), { target: { files } });
    });
  }

  function renderUploader(overrides: {
    onPhotosAdded?: (photos: ConstructionPhotoWithUrls[]) => void;
    onNotify?: (message: string) => void;
  }): void {
    render(
      <PhotoUploader
        albumId="album-1"
        projectId="project-1"
        onPhotosAdded={overrides.onPhotosAdded ?? vi.fn()}
        onNotify={overrides.onNotify ?? vi.fn()}
      />
    );
  }

  // ==========================================================================
  // 20.4: 再送では送信前の圧縮が再実行されず、初回と同一の画像データを送る
  // ==========================================================================

  // @requirement construction-photo/REQ-20.4
  it('再送では圧縮が再実行されず、初回送信と同一の画像データが送られる (20.4)', async () => {
    // 圧縮の有無を File の同一性で観測できるよう、圧縮は毎回「別インスタンス」を返す。
    // 再送で圧縮が再実行されれば送信される File は初回と別インスタンスになる。
    let compressionCount = 0;
    compressImagesForUploadMock.mockImplementation((files: File[]) => {
      compressionCount += 1;
      return Promise.resolve(
        files.map(
          (file) =>
            new File([`compressed-${compressionCount}`], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            })
        )
      );
    });

    /** upload API へ実際に渡された File を送信順に記録する */
    const sentFiles: File[] = [];
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async (_albumId, files) => {
      const file = files[0]!;
      sentFiles.push(file);
      if (sentFiles.length === 1) {
        // 初回は失敗させ、未送信画像として保持させる
        throw new ApiError(503, 'ストレージが利用できません');
      }
      return { successful: [makePhoto('retried-1', file.name)], failed: [] };
    });

    const onPhotosAdded = vi.fn();
    renderUploader({ onPhotosAdded });

    await selectFiles('file-input', [makeFile('shot.jpg')]);
    await screen.findByTestId('pending-upload-panel');
    expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByTestId('pending-upload-retry-button'));
    });

    await waitFor(() => {
      expect(sentFiles).toHaveLength(2);
    });

    // 再送では圧縮を通らない（20.4）
    expect(compressImagesForUploadMock).toHaveBeenCalledTimes(1);
    // 送信されたのは初回送信と同一の File インスタンス（＝同一の画像データ）
    expect(sentFiles[1]).toBe(sentFiles[0]);
    // 保持されていた画像のみが送信対象（新規ファイルは混ざらない）
    expect(sentFiles[1]!.name).toBe('shot.jpg');
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'retried-1' })]);
    });
  });

  // ==========================================================================
  // 20.2, 20.3, 20.5: 再送で成功した画像のみ保持から取り除かれる
  // ==========================================================================

  // @requirement construction-photo/REQ-20.2
  // @requirement construction-photo/REQ-20.3
  it('再送で成功した画像のみ保持から取り除かれ、失敗した画像は保持され続ける (20.2, 20.3, 20.5)', async () => {
    const failingNames = new Set(['a.jpg', 'b.jpg']);
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async (_albumId, files) => {
      const name = files[0]!.name;
      if (failingNames.has(name)) {
        throw new ApiError(500, `${name} の保存に失敗しました`);
      }
      return { successful: [makePhoto(`ok-${name}`, name)], failed: [] };
    });

    const onPhotosAdded = vi.fn();
    renderUploader({ onPhotosAdded });

    await selectFiles('file-input', [makeFile('a.jpg'), makeFile('b.jpg')]);

    // 20.2: 件数・サムネイル・ファイル名・失敗理由が提示される
    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);
    });
    expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 2 件');
    expect(
      screen.getAllByTestId('pending-upload-thumbnail').map((el) => el.getAttribute('src'))
    ).toEqual(['blob:mock/1', 'blob:mock/2']);
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
    expect(screen.getAllByTestId('pending-upload-reason').map((el) => el.textContent)).toEqual([
      'a.jpg の保存に失敗しました',
      'b.jpg の保存に失敗しました',
    ]);

    // 再送では a.jpg だけが成功するようにする
    failingNames.delete('a.jpg');

    await act(async () => {
      fireEvent.click(screen.getByTestId('pending-upload-retry-button'));
    });

    // 20.5: 成功した a.jpg は保持から消え、失敗した b.jpg のみ残る
    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(1);
    });
    expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 1 件');
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'b.jpg',
    ]);
    expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'ok-a.jpg' })]);
  });

  // ==========================================================================
  // 20.7, 20.8: 破棄は確認の承諾時にのみ実行する
  // ==========================================================================

  // @requirement construction-photo/REQ-20.7
  // @requirement construction-photo/REQ-20.8
  it('破棄は確認の承諾時にのみ実行され、取消では保持が維持される (20.7, 20.8)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockRejectedValue(
      new ApiError(503, 'ストレージが利用できません')
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderUploader({});

    await selectFiles('file-input', [makeFile('a.jpg'), makeFile('b.jpg')]);
    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);
    });

    // 20.7: 破棄の操作手段が提供されている
    const discardButton = screen.getByTestId('pending-upload-discard-button');
    expect(discardButton).toBeEnabled();

    // 20.8: 確認を取り消した場合は保持が維持される
    await act(async () => {
      fireEvent.click(discardButton);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);

    // 20.8: 承諾した場合にのみ保持が解放される
    confirmSpy.mockReturnValue(true);
    await act(async () => {
      fireEvent.click(discardButton);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByTestId('pending-upload-panel')).not.toBeInTheDocument();
    });
    // 解放時にプレビューURLも破棄される（撮影画像の情報残留を作らない）
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);

    confirmSpy.mockRestore();
  });

  // ==========================================================================
  // 20.10: アップロード・再送の実行中は追加の再送・破棄を受け付けない
  // ==========================================================================

  // @requirement construction-photo/REQ-20.10
  it('アップロードの実行中は追加の再送・破棄の操作を受け付けない (20.10)', async () => {
    const gate = createGate();
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async (_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'held.jpg') {
        throw new ApiError(503, 'ストレージが利用できません');
      }
      await gate.promise;
      return { successful: [makePhoto('new-1', name)], failed: [] };
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderUploader({});

    // 先に1件失敗させて未送信画像を保持させる
    await selectFiles('file-input', [makeFile('held.jpg')]);
    await screen.findByTestId('pending-upload-panel');
    expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();

    // 新規のファイル選択を開始し、送信中の状態を作る
    await selectFiles('file-input', [makeFile('next.jpg')]);

    const retryButton = screen.getByTestId('pending-upload-retry-button');
    const discardButton = screen.getByTestId('pending-upload-discard-button');
    expect(retryButton).toBeDisabled();
    expect(discardButton).toBeDisabled();

    // 実行不可の状態では操作しても送信も破棄も起きない
    const callsBefore = vi.mocked(imagesApi.uploadConstructionPhotos).mock.calls.length;
    await act(async () => {
      fireEvent.click(retryButton);
      fireEvent.click(discardButton);
    });
    expect(vi.mocked(imagesApi.uploadConstructionPhotos).mock.calls.length).toBe(callsBefore);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(1);

    // 送信が完了すれば操作は再び受け付けられる
    await act(async () => {
      gate.release();
      await gate.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();
    });

    confirmSpy.mockRestore();
  });

  // @requirement construction-photo/REQ-20.10
  it('再送の実行中は追加の再送・破棄の操作を受け付けない (20.10)', async () => {
    const gate = createGate();
    let attempt = 0;
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new ApiError(503, 'ストレージが利用できません');
      }
      await gate.promise;
      throw new ApiError(503, 'ストレージが利用できません');
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderUploader({});

    await selectFiles('file-input', [makeFile('held.jpg')]);
    await screen.findByTestId('pending-upload-panel');

    // 再送を開始し、完了させずに実行中の状態を作る
    await act(async () => {
      fireEvent.click(screen.getByTestId('pending-upload-retry-button'));
    });

    const retryButton = screen.getByTestId('pending-upload-retry-button');
    const discardButton = screen.getByTestId('pending-upload-discard-button');
    expect(retryButton).toBeDisabled();
    expect(discardButton).toBeDisabled();

    // 再送中の追加操作は送信も破棄も引き起こさない
    expect(vi.mocked(imagesApi.uploadConstructionPhotos)).toHaveBeenCalledTimes(2);
    await act(async () => {
      fireEvent.click(retryButton);
      fireEvent.click(discardButton);
    });
    expect(vi.mocked(imagesApi.uploadConstructionPhotos)).toHaveBeenCalledTimes(2);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(1);

    await act(async () => {
      gate.release();
      await gate.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('pending-upload-retry-button')).toBeEnabled();
    });

    confirmSpy.mockRestore();
  });

  // ==========================================================================
  // 20.17, 20.18: 全件が再送不可なら再送手段を実行不可の状態で提示する
  // ==========================================================================

  // @requirement construction-photo/REQ-20.17
  // @requirement construction-photo/REQ-20.18
  it('保持中の画像が全て再送不可の場合、再送手段が実行不可の状態で提示される (20.17, 20.18)', async () => {
    // 413（サイズ上限超過）は確定的な拒否のため permanent に分類される
    vi.mocked(imagesApi.uploadConstructionPhotos).mockRejectedValue(
      new ApiError(413, 'ファイルサイズが上限を超えています')
    );

    renderUploader({});

    await selectFiles('file-input', [makeFile('big-1.jpg'), makeFile('big-2.jpg')]);

    const items = await screen.findAllByTestId('pending-upload-item');
    expect(items).toHaveLength(2);
    expect(items.map((el) => el.getAttribute('data-kind'))).toEqual(['permanent', 'permanent']);

    // 20.18: 再送手段は非表示にせず、実行不可の状態で提示する
    const retryButton = screen.getByTestId('pending-upload-retry-button');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).toBeDisabled();
    expect(screen.getByTestId('pending-upload-retry-unavailable')).toBeInTheDocument();

    // 20.17: 再送不可の理由が提示され、破棄の操作手段のみが有効
    expect(screen.getAllByTestId('pending-upload-permanent-note')).toHaveLength(2);
    expect(screen.getAllByTestId('pending-upload-permanent-note')[0]).toHaveTextContent(
      'ファイルサイズが上限を超えています'
    );
    expect(screen.getByTestId('pending-upload-discard-button')).toBeEnabled();

    // 実行不可の再送手段は操作しても送信を発生させない
    const callsBefore = vi.mocked(imagesApi.uploadConstructionPhotos).mock.calls.length;
    await act(async () => {
      fireEvent.click(retryButton);
    });
    expect(vi.mocked(imagesApi.uploadConstructionPhotos).mock.calls.length).toBe(callsBefore);
  });

  // ==========================================================================
  // 20.9: 新規のファイル選択を行っても既存の保持は消えない
  // ==========================================================================

  // @requirement construction-photo/REQ-20.9
  it('未送信画像を保持したまま新規のファイル選択を行っても既存の保持が消えない (20.9)', async () => {
    const failingNames = new Set(['held.jpg', 'also-fails.jpg']);
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation(async (_albumId, files) => {
      const name = files[0]!.name;
      if (failingNames.has(name)) {
        throw new ApiError(503, 'ストレージが利用できません');
      }
      return { successful: [makePhoto(`ok-${name}`, name)], failed: [] };
    });

    const onPhotosAdded = vi.fn();
    renderUploader({ onPhotosAdded });

    await selectFiles('file-input', [makeFile('held.jpg')]);
    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(1);
    });

    // 新規選択が成功しても、今回の試行に含まれない保持は温存される（20.9）
    await selectFiles('file-input', [makeFile('fresh.jpg')]);
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([expect.objectContaining({ id: 'ok-fresh.jpg' })]);
    });
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'held.jpg',
    ]);

    // 新規選択がカメラ撮影経由で失敗した場合は、既存の保持に積み増される（20.9）
    await selectFiles('camera-input', [makeFile('also-fails.jpg')]);
    await waitFor(() => {
      expect(screen.getAllByTestId('pending-upload-item')).toHaveLength(2);
    });
    expect(screen.getAllByTestId('pending-upload-filename').map((el) => el.textContent)).toEqual([
      'held.jpg',
      'also-fails.jpg',
    ]);
    expect(screen.getByTestId('pending-upload-count')).toHaveTextContent('未送信の画像 2 件');
  });
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-5.2
 * @requirement construction-photo/REQ-5.3
 * @requirement construction-photo/REQ-11.5
 * @requirement construction-photo/REQ-20.1
 * @requirement construction-photo/REQ-20.2
 * @requirement construction-photo/REQ-20.3
 * @requirement construction-photo/REQ-20.4
 * @requirement construction-photo/REQ-20.5
 * @requirement construction-photo/REQ-20.7
 * @requirement construction-photo/REQ-20.8
 * @requirement construction-photo/REQ-20.9
 * @requirement construction-photo/REQ-20.10
 * @requirement construction-photo/REQ-20.14
 * @requirement construction-photo/REQ-20.17
 * @requirement construction-photo/REQ-20.18
 */
