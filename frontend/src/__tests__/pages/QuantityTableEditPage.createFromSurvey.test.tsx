/**
 * @fileoverview 数量表編集画面の「現場調査から一括追加」配線テスト（クライアントサイドドラフト生成）
 *
 * Task 61.3: 現場調査からの数量グループ一括生成をクライアントサイドドラフト化する
 *
 * REQ-42 適用後の動作:
 * - 対象現場調査の写真一覧を参照系GET（getSiteSurvey）で取得する（REQ-42.10）
 * - 写真枚数分の数量グループをクライアントサイドのドラフトへ生成する
 *   （仮ID・連番命名「{現場調査名} {連番}」・写真順 surveyImageId 紐づけ・項目0件・末尾追加）
 * - サーバー側 createGroupsFromSurvey（POST /from-survey）および詳細再取得は本フローで呼ばない（REQ-42.4）
 *
 * Requirements:
 * - 42.4: 現場調査一括生成はクライアントサイドの編集状態にのみ反映し永続化APIを発行しない
 * - 40.1: 「現場調査から一括追加」操作で現場調査選択ダイアログを表示する
 * - 40.3: 写真枚数と同数の数量グループを生成する
 * - 40.4: 各グループに写真を写真順に1枚ずつ紐づける
 * - 40.5: グループ名は「{現場調査名} {連番}」（連番は1から）
 * - 40.7: 生成グループは既存グループの末尾に追加する
 * - 40.9: 生成された数量グループは数量項目を持たない初期状態とする
 * - 40.13: 完了時に生成グループ数を含む完了メッセージを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as siteSurveysApi from '../../api/site-surveys';
import type { QuantityTableDetail } from '../../types/quantity-table.types';
import type {
  PaginatedSiteSurveys,
  SiteSurveyDetail,
  SurveyImageInfo,
} from '../../types/site-survey.types';

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
const mockGetSiteSurvey = vi.mocked(siteSurveysApi.getSiteSurvey);

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

/** 現場調査画像（写真順は displayOrder 昇順で確定する） */
const buildSurveyImage = (
  overrides: Partial<SurveyImageInfo> & Pick<SurveyImageInfo, 'id' | 'displayOrder'>
): SurveyImageInfo => ({
  surveyId: 'survey-1',
  originalPath: `orig/${overrides.id}.jpg`,
  thumbnailPath: `thumb/${overrides.id}.jpg`,
  originalUrl: `http://example.com/orig-${overrides.id}.jpg`,
  thumbnailUrl: `http://example.com/thumb-${overrides.id}.jpg`,
  fileName: `${overrides.id}.jpg`,
  fileSize: 1000,
  width: 800,
  height: 600,
  createdAt: '2026-01-01T00:00:00Z',
  comment: null,
  ...overrides,
});

const buildSurveyDetailWithPhotos = (): SiteSurveyDetail => ({
  id: 'survey-1',
  projectId: 'proj-456',
  name: '現場調査1',
  surveyDate: '2026-01-01',
  memo: null,
  thumbnailUrl: null,
  imageCount: 2,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  // 意図的に displayOrder の昇順と配列順をずらし、写真順（displayOrder）で紐づくことを検証する
  images: [
    buildSurveyImage({ id: 'img-2', displayOrder: 1, comment: null }),
    buildSurveyImage({ id: 'img-1', displayOrder: 0, comment: 'コメント1' }),
  ],
});

const buildSurveyDetailNoPhotos = (): SiteSurveyDetail => ({
  id: 'survey-2',
  projectId: 'proj-456',
  name: '写真なし調査',
  surveyDate: '2026-01-02',
  memo: null,
  thumbnailUrl: null,
  imageCount: 0,
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  project: { id: 'proj-456', name: 'テストプロジェクト' },
  images: [],
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

describe('QuantityTableEditPage - 現場調査から一括追加配線 (Task 61.3 クライアントサイドドラフト)', () => {
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

  it('現場調査を選択して実行すると参照系GETで写真一覧を取得し、写真順に末尾へグループをドラフト生成する（サーバー生成APIは呼ばない）', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockGetSiteSurvey.mockResolvedValue(buildSurveyDetailWithPhotos());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');

    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    // 参照系GETで対象現場調査の写真一覧を取得する（REQ-42.10）
    await waitFor(() => {
      expect(mockGetSiteSurvey).toHaveBeenCalledWith('survey-1');
    });

    // 生成グループ（写真枚数分）が既存グループの末尾に表示される（REQ-40.3, 40.7）
    const groupSections = await screen.findAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(3);
    // 連番命名「{現場調査名} {連番}」（REQ-40.5）
    expect(screen.getByText('現場調査1 1')).toBeInTheDocument();
    expect(screen.getByText('現場調査1 2')).toBeInTheDocument();

    // 完了メッセージ（生成グループ数を含む）（REQ-40.13）
    expect(await screen.findByText('2件のグループを生成しました')).toBeInTheDocument();

    // サーバー側生成API・詳細再取得は本フローで呼ばれない（REQ-42.4）
    expect(mockCreateGroupsFromSurvey).not.toHaveBeenCalled();
    expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
  });

  it('紐づけ写真のコメントが既存表示経路で表示される（REQ-40.8 / 21/35）', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockGetSiteSurvey.mockResolvedValue(buildSurveyDetailWithPhotos());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    // img-1（displayOrder 0、写真順で先頭）のコメントが表示される
    expect(await screen.findByText('コメント1')).toBeInTheDocument();
  });

  it('写真0枚の場合は「写真が存在しません」を表示しグループを生成しない', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockGetSiteSurvey.mockResolvedValue(buildSurveyDetailNoPhotos());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-2'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('写真が存在しません');
    });
    // グループは生成されない（既存1件のまま）
    const groupSections = await screen.findAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(1);
    // サーバー生成APIは呼ばれない
    expect(mockCreateGroupsFromSurvey).not.toHaveBeenCalled();
  });

  it('生成された数量グループは数量項目を持たない初期状態である（REQ-40.9）', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockGetSiteSurvey.mockResolvedValue(buildSurveyDetailWithPhotos());
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await screen.findByText('現場調査1 1');
    // 既存グループA（項目0件）＋生成2グループ（いずれも項目0件）→ 数量項目行は0件
    expect(screen.queryAllByTestId('quantity-item-row')).toHaveLength(0);
  });

  it('写真一覧の取得（参照系GET）に失敗した場合は失敗メッセージを表示する', async () => {
    mockGetQuantityTableDetail.mockResolvedValueOnce(buildInitialDetail());
    mockGetSiteSurveys.mockResolvedValue(buildSurveyList());
    mockGetSiteSurvey.mockRejectedValue(new Error('network error'));
    renderWithRouter();
    await waitForLoaded();

    await user.click(screen.getByTestId('bulk-create-from-survey-button'));
    await screen.findByTestId('survey-select-dialog');
    await user.click(await screen.findByTestId('survey-select-option-survey-1'));
    await user.click(screen.getByTestId('survey-select-dialog-confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('現場調査からの一括生成に失敗しました');
    });
    // 不完全な生成データを残さない（既存1件のまま）（REQ-40.12）
    const groupSections = await screen.findAllByTestId('quantity-group');
    expect(groupSections).toHaveLength(1);
  });
});
