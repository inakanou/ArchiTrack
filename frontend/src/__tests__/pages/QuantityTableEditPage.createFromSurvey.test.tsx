/**
 * @fileoverview 数量表編集画面の「現場調査から一括追加」配線テスト
 *
 * Task 57.3: 数量表編集画面に一括生成ボタンとハンドラを配線する
 *
 * Requirements:
 * - 40.1: 「現場調査から一括追加」操作で現場調査選択ダイアログを表示する
 * - 40.2: 当該プロジェクトの現場調査一覧（名前・写真件数）を選択肢として表示する
 * - 40.8: 紐づけた写真コメントは既存表示経路（REQ-21/35）に委譲する
 * - 40.11: 実行中インジケーター表示・重複実行防止
 * - 40.13: 完了時に生成グループ数を含む完了メッセージを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as siteSurveysApi from '../../api/site-surveys';
import { ApiError } from '../../api/client';
import type {
  QuantityTableDetail,
  CreateGroupsFromSurveyResult,
} from '../../types/quantity-table.types';
import type { PaginatedSiteSurveys } from '../../types/site-survey.types';

vi.mock('../../api/quantity-tables');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-annotations');
vi.mock('../../services/export/QuantityTablePdfExportService');
vi.mock('../../services/export/PdfExportService');

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
  })),
}));

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockCreateGroupsFromSurvey = vi.mocked(quantityTablesApi.createGroupsFromSurvey);
const mockGetSiteSurveys = vi.mocked(siteSurveysApi.getSiteSurveys);

// ============================================================================
// テストフィクスチャ
// ============================================================================

const buildInitialDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 1,
  itemCount: 0,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '既存グループA',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const buildSurveyList = (): PaginatedSiteSurveys => ({
  data: [
    {
      id: 'survey-1',
      projectId: 'proj-456',
      name: '現場調査1',
      surveyDate: '2026-01-01',
      memo: null,
      thumbnailUrl: null,
      imageCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'survey-2',
      projectId: 'proj-456',
      name: '写真なし調査',
      surveyDate: '2026-01-02',
      memo: null,
      thumbnailUrl: null,
      imageCount: 0,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
});

const buildCreateResult = (): CreateGroupsFromSurveyResult => ({
  created: 2,
  groups: [
    {
      id: 'group-s1-1',
      quantityTableId: 'qt-123',
      name: '現場調査1 1',
      surveyImageId: 'img-1',
      displayOrder: 1,
      itemCount: 0,
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
    {
      id: 'group-s1-2',
      quantityTableId: 'qt-123',
      name: '現場調査1 2',
      surveyImageId: 'img-2',
      displayOrder: 2,
      itemCount: 0,
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
  ],
});

const buildAfterCreateDetail = (): QuantityTableDetail => ({
  id: 'qt-123',
  projectId: 'proj-456',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  name: 'テスト数量表',
  groupCount: 3,
  itemCount: 0,
  groups: [
    {
      id: 'group-a',
      quantityTableId: 'qt-123',
      name: '既存グループA',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'group-s1-1',
      quantityTableId: 'qt-123',
      name: '現場調査1 1',
      surveyImageId: 'img-1',
      surveyImage: {
        id: 'img-1',
        thumbnailUrl: 'http://example.com/thumb1.jpg',
        originalUrl: 'http://example.com/orig1.jpg',
        fileName: 'photo1.jpg',
        hasAnnotations: false,
        comment: 'コメント1',
      },
      displayOrder: 1,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
    {
      id: 'group-s1-2',
      quantityTableId: 'qt-123',
      name: '現場調査1 2',
      surveyImageId: 'img-2',
      surveyImage: {
        id: 'img-2',
        thumbnailUrl: 'http://example.com/thumb2.jpg',
        originalUrl: 'http://example.com/orig2.jpg',
        fileName: 'photo2.jpg',
        hasAnnotations: false,
        comment: null,
      },
      displayOrder: 2,
      itemCount: 0,
      items: [],
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-03T00:00:00Z',
});

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-123/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
}

// ============================================================================
// テストケース
// ============================================================================

describe('QuantityTableEditPage - 現場調査から一括追加配線 (Task 57.3)', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ボタン押下で現場調査一覧を取得しダイアログを表示する（imageCount→写真件数表示）', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));

    await waitFor(() => {
      expect(mockGetSiteSurveys).toHaveBeenCalledWith('proj-456', { limit: 100 });
    });
    expect(await screen.findByTestId('survey-select-dialog')).toBeInTheDocument();
    expect(screen.getByText('現場調査1')).toBeInTheDocument();
    expect(screen.getByText('写真 2 件')).toBeInTheDocument();
    expect(screen.getByText('写真 0 件')).toBeInTheDocument();
  });

  it('現場調査を選択して実行すると生成APIが呼ばれ、生成グループが末尾に表示され完了メッセージが出る', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockCreateGroupsFromSurvey.mockResolvedValue(buildCreateResult());
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCreateDetail());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');

    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(mockCreateGroupsFromSurvey).toHaveBeenCalledWith('qt-123', 'survey-1');
    });

    // 再取得が走り、生成グループ（写真・コメント付き）が末尾に表示される（REQ-40.8 既存表示経路）
    await waitFor(() => {
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(2);
    });
    const groupSections = await screen.findAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(3);
    expect(screen.getByText('現場調査1 1')).toBeInTheDocument();
    expect(screen.getByText('現場調査1 2')).toBeInTheDocument();

    // 完了メッセージ（生成グループ数を含む）（REQ-40.13）
    expect(await screen.findByText('2件のグループを生成しました')).toBeInTheDocument();
  });

  it('写真0枚（created:0）の場合は「写真が存在しません」メッセージを表示する', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockCreateGroupsFromSurvey.mockResolvedValue({ created: 0, groups: [] });
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-2'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('写真が存在しません');
    });
    // グループは生成されない（再取得は走らない）
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });

  it('生成中はボタンが disabled になり、重複実行が防止される', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    let resolveCreate: ((value: CreateGroupsFromSurveyResult) => void) | null = null;
    mockCreateGroupsFromSurvey.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    // 生成中: 確定ボタンが disabled（インジケーター表示）
    await waitFor(() => {
      expect(screen.getByTestId('survey-select-dialog-confirm')).toBeDisabled();
    });

    // 重複実行を試みても API は1回のみ
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));
    expect(mockCreateGroupsFromSurvey).toHaveBeenCalledTimes(1);

    // Cleanup
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildAfterCreateDetail());
    resolveCreate!(buildCreateResult());
    await waitFor(() => {
      expect(screen.getByText('現場調査1 1')).toBeInTheDocument();
    });
  });

  it('409 レスポンス時に再試行案内メッセージを表示する', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockCreateGroupsFromSurvey.mockRejectedValue(new ApiError(409, 'Conflict'));
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '他のユーザーが操作中です。再試行してください'
      );
    });
  });

  it('一般エラー時に失敗メッセージを表示する', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockCreateGroupsFromSurvey.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('現場調査からの一括生成に失敗しました');
    });
  });
});
