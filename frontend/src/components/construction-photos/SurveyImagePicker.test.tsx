/**
 * @fileoverview 現調写真選択モーダルのテスト
 *
 * Task 6.3: 3系統アップローダ（現調選択モーダル）
 *
 * 同一プロジェクトの現場調査写真を選択候補として提示し、選択した画像IDを
 * onSelect で返すことを検証する。
 *
 * Requirements: 6.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SurveyImagePicker } from './SurveyImagePicker';
import * as siteSurveysApi from '../../api/site-surveys';
import type { PaginatedSiteSurveys, SiteSurveyDetail } from '../../types/site-survey.types';

vi.mock('../../api/site-surveys');

const mockSurveys: PaginatedSiteSurveys = {
  data: [
    {
      id: 'survey-1',
      projectId: 'project-1',
      name: '一次調査',
      surveyDate: '2025-01-01T00:00:00.000Z',
      memo: null,
      thumbnailUrl: null,
      imageCount: 2,
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
  imageCount: 2,
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
      // 合成済みサムネイルあり: 取り込み後もこの実体が複製されるため候補もこれを表示する
      annotatedThumbnailPath: 'annotated-thumbnails/1',
      annotatedThumbnailUrl: 'https://example.com/a1.jpg',
      fileName: 's1.jpg',
      fileSize: 100,
      width: 800,
      height: 600,
      displayOrder: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'survey-image-2',
      surveyId: 'survey-1',
      originalPath: 'orig/2',
      thumbnailPath: 'thumb/2',
      thumbnailUrl: 'https://example.com/s2.jpg',
      // 合成済みサムネイル未生成（詳細取得は項目を欠落させず null で返す）
      annotatedThumbnailPath: null,
      annotatedThumbnailUrl: null,
      fileName: 's2.jpg',
      fileSize: 100,
      width: 800,
      height: 600,
      displayOrder: 2,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'survey-image-3',
      surveyId: 'survey-1',
      originalPath: 'orig/3',
      thumbnailPath: 'thumb/3',
      thumbnailUrl: 'https://example.com/s3.jpg',
      // 項目自体が無い応答（旧経路互換）でも素のサムネイルへ落ちること
      fileName: 's3.jpg',
      fileSize: 100,
      width: 800,
      height: 600,
      displayOrder: 3,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ],
};

describe('SurveyImagePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(siteSurveysApi.getSiteSurveys).mockResolvedValue(mockSurveys);
    vi.mocked(siteSurveysApi.getSiteSurvey).mockResolvedValue(mockSurveyDetail);
  });

  it('同一プロジェクトの現場調査を候補として読み込む (R6.1, R6.4)', async () => {
    render(<SurveyImagePicker projectId="project-1" open onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => {
      expect(siteSurveysApi.getSiteSurveys).toHaveBeenCalledWith('project-1', expect.any(Object));
    });
    expect(await screen.findByText('一次調査')).toBeInTheDocument();
  });

  it('現場調査を選ぶと画像候補を読み込み、選択した画像IDを onSelect で返す (R6.1, R6.2)', async () => {
    const onSelect = vi.fn();
    render(<SurveyImagePicker projectId="project-1" open onClose={vi.fn()} onSelect={onSelect} />);

    fireEvent.click(await screen.findByText('一次調査'));

    await waitFor(() => {
      expect(siteSurveysApi.getSiteSurvey).toHaveBeenCalledWith('survey-1');
    });

    const image1 = await screen.findByLabelText('s1.jpg を選択');
    fireEvent.click(image1);

    fireEvent.click(screen.getByRole('button', { name: /追加/ }));

    expect(onSelect).toHaveBeenCalledWith(['survey-image-1']);
  });

  // Task 115.16: 候補の表示元を取り込み側（construction-photo-image.service の
  // annotatedThumbnailPath ?? thumbnailPath）と同じ規則へ揃える
  describe('候補の表示元 (Task 115.16)', () => {
    /** 現場調査を選び、画像候補が描画されるまで待つ */
    async function openSurveyImages() {
      render(<SurveyImagePicker projectId="project-1" open onClose={vi.fn()} onSelect={vi.fn()} />);
      fireEvent.click(await screen.findByText('一次調査'));
      await screen.findByAltText('s1.jpg');
    }

    it('合成済みサムネイルがある候補はそれを表示元に用いる', async () => {
      await openSurveyImages();

      expect(screen.getByAltText('s1.jpg')).toHaveAttribute('src', 'https://example.com/a1.jpg');
    });

    it('合成済みサムネイルが無い候補は素のサムネイルを表示元に用いる', async () => {
      await openSurveyImages();

      expect(screen.getByAltText('s2.jpg')).toHaveAttribute('src', 'https://example.com/s2.jpg');
      expect(screen.getByAltText('s3.jpg')).toHaveAttribute('src', 'https://example.com/s3.jpg');
    });
  });

  it('open=false のときは何も描画しない', () => {
    const { container } = render(
      <SurveyImagePicker projectId="project-1" open={false} onClose={vi.fn()} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
