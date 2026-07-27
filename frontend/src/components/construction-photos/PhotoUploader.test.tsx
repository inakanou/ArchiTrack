/**
 * @fileoverview 3系統アップローダのテスト
 *
 * Task 6.3: 3系統アップローダ（ローカル/カメラ/現調選択モーダル）
 *
 * - ローカル/カメラ選択で upload API が呼ばれ、追加された写真項目を通知する
 * - 現調選択モーダルで選択→ from-surveys API
 * - アップロードは最大5並列・部分失敗継続（uploadFilesInWaves）
 *
 * Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 11.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { PhotoUploader, uploadFilesInWaves } from './PhotoUploader';
import * as imagesApi from '../../api/construction-photo-images';
import * as siteSurveysApi from '../../api/site-surveys';
import type { ConstructionPhotoWithUrls } from '../../types/construction-photo.types';
import type { PaginatedSiteSurveys, SiteSurveyDetail } from '../../types/site-survey.types';

vi.mock('../../api/construction-photo-images');
vi.mock('../../api/site-surveys');

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
    expect(result.failed).toEqual([
      { fileName: 'bad.jpg', error: 'サポートされていないファイル形式' },
    ]);
  });

  it('リクエストが例外を投げても失敗として集約し継続する', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockImplementation((_albumId, files) => {
      const name = files[0]!.name;
      if (name === 'throw.jpg') {
        return Promise.reject(new Error('ネットワークエラー'));
      }
      return Promise.resolve({ successful: [makePhoto(name, name)], failed: [] });
    });

    const result = await uploadFilesInWaves('album-1', [makeFile('ok.jpg'), makeFile('throw.jpg')]);
    expect(result.successful).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.fileName).toBe('throw.jpg');
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
    render(
      <PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />
    );

    const fileInput = screen.getByTestId('file-input');
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [makeFile('local.jpg')] } });
    });

    await waitFor(() => {
      expect(imagesApi.uploadConstructionPhotos).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onPhotosAdded).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'new-1' }),
      ]);
    });
  });

  it('カメラ入力で撮影した画像も upload API に流す (R5.1, R5.2)', async () => {
    vi.mocked(imagesApi.uploadConstructionPhotos).mockResolvedValue({
      successful: [makePhoto('cam-1', 'camera.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(
      <PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />
    );

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

  it('現調写真選択で from-surveys API が呼ばれる (R6.1)', async () => {
    vi.mocked(imagesApi.addConstructionPhotosFromSurveys).mockResolvedValue({
      successful: [makePhoto('copy-1', 's1.jpg')],
      failed: [],
    });
    const onPhotosAdded = vi.fn();
    render(
      <PhotoUploader albumId="album-1" projectId="project-1" onPhotosAdded={onPhotosAdded} />
    );

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
});
