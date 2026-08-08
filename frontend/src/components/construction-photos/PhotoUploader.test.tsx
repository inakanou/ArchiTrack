/**
 * @fileoverview 3系統アップローダのテスト
 *
 * Task 6.3: 3系統アップローダ（ローカル/カメラ/現調選択モーダル）
 *
 * - ローカル/カメラ選択で upload API が呼ばれ、追加された写真項目を通知する
 * - 現調選択モーダルで選択→ from-surveys API
 * - アップロードは最大5並列・部分失敗継続（uploadFilesInWaves）
 * - 失敗した画像の実体がアップロードUIの未送信一覧まで到達する（Task 108.3）
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 11.5 / site-survey 37.1（工事写真 20.1）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { PhotoUploader, uploadFilesInWaves } from './PhotoUploader';
import * as imagesApi from '../../api/construction-photo-images';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import type { PaginatedSiteSurveys, SiteSurveyDetail } from '../../types/site-survey.types';

vi.mock('../../api/construction-photo-images');
vi.mock('../../api/site-surveys');

// ============================================================================
// URL.createObjectURL / revokeObjectURL のスタブ
//
// jsdom は ObjectURL API を実装しないが、未送信画像のプレビューURL生成に必要と
// なる。テストを条件付きで無効化せずスタブへ差し替える（AI運用第3原則）。
// ============================================================================

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
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
});

/**
 * Requirements coverage (construction-photo) — requirement-coverage tags.
 * 各IDは本ファイル内の対応テストが検証する受入基準（監査でエビデンス確認済み）。
 * @requirement construction-photo/REQ-5.2
 * @requirement construction-photo/REQ-5.3
 * @requirement construction-photo/REQ-11.5
 * @requirement construction-photo/REQ-20.1
 */
