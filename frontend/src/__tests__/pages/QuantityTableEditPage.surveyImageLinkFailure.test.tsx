/**
 * @fileoverview 数量表編集画面: 現調画像の紐付けの失敗の提示
 *
 * Task 86.5: 現調画像の紐付けの失敗が利用者に伝わらない状態を解消する
 *
 * 本ファイルは受入基準番号を名乗らない。Task 86 が守るのはテナント境界とエラー応答の妥当性で
 * あり、本スペックの受入基準として条文化されていない（tasks.md の Task 86 節末尾に明記）。
 *
 * 画面の結線を確かめる。文言の組み立ての分岐そのものは
 * `src/utils/survey-image-link-feedback.test.ts` が確かめる。ここで見るのは、
 * 保存ハンドラが失敗を畳まずに書き分けへ渡すこと、取得の応答が名指したグループを告げること、
 * 保存の成功で告知が消えることである。実ブラウザでの確認は
 * `e2e/specs/quantity-tables/survey-image-link-failure-e2e.spec.ts` が行う。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { QuantityGroupDetail, QuantityTableDetail } from '../../types/quantity-table.types';
import { ApiError } from '../../api/client';

vi.mock('../../api/quantity-tables');
vi.mock('../../api/site-surveys');
vi.mock('../../api/survey-annotations');
vi.mock('../../services/export/QuantityTablePdfExportService');
vi.mock('../../services/export/PdfExportService');

// useBlocker をモック（データルーターなしでテストするため。確立済みパターン）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
  };
});

vi.mock('../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: vi.fn(() => ({
    isLoading: false,
    error: null,
    getSuggestions: vi.fn().mockReturnValue([]),
    addCandidateOnBlur: vi.fn(),
  })),
}));

import QuantityTableEditPage from '../../pages/QuantityTableEditPage';
import * as quantityTablesApi from '../../api/quantity-tables';

const mockGetQuantityTableDetail = vi.mocked(quantityTablesApi.getQuantityTableDetail);
const mockSaveQuantityTableDraft = vi.mocked(quantityTablesApi.saveQuantityTableDraft);

const TIMESTAMP = '2025-01-01T00:00:00Z';

function buildGroup(
  id: string,
  name: string,
  surveyImageId: string | null,
  displayOrder: number
): QuantityGroupDetail {
  return {
    id,
    quantityTableId: 'qt-123',
    name,
    surveyImageId,
    surveyImage: surveyImageId
      ? {
          id: surveyImageId,
          thumbnailUrl: `/thumb/${surveyImageId}.jpg`,
          originalUrl: `/orig/${surveyImageId}.jpg`,
          fileName: `${surveyImageId}.jpg`,
          hasAnnotations: false,
          hasDrawnAnnotations: false,
          annotatedThumbnailUrl: null,
          comment: null,
          width: 800,
          height: 600,
        }
      : null,
    displayOrder,
    itemCount: 0,
    items: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function buildDetail(
  groups: QuantityGroupDetail[],
  droppedSurveyImageLinkGroupIds: string[]
): QuantityTableDetail {
  return {
    id: 'qt-123',
    projectId: 'proj-456',
    project: { id: 'proj-456', name: 'テストプロジェクト' },
    name: 'テスト数量表',
    groupCount: groups.length,
    itemCount: 0,
    groups,
    droppedSurveyImageLinkGroupIds,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

/** 2グループとも写真を持つ数量表（保存の失敗の検証に用いる） */
const linkedDetail = buildDetail(
  [buildGroup('group-a', '外壁', 'image-a', 0), buildGroup('group-b', '屋根', 'image-b', 1)],
  []
);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-123/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function clickSave(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
  });
  await user.click(screen.getByRole('button', { name: '保存' }));
}

describe('QuantityTableEditPage - 現調画像の紐付けの失敗の提示（Task 86.5）', () => {
  beforeEach(() => {
    mockGetQuantityTableDetail.mockResolvedValue(linkedDetail);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('保存の失敗の書き分け', () => {
    it('400（他プロジェクトの写真）は名指されたグループを示し、再試行を促さず、ドラフトを保持する', async () => {
      const user = userEvent.setup();
      mockSaveQuantityTableDraft.mockRejectedValue(
        new ApiError(400, '異なるプロジェクトの現場調査画像は紐付けできません', {
          status: 400,
          code: 'QUANTITY_TABLE_VALIDATION_ERROR',
          detail: '異なるプロジェクトの現場調査画像は紐付けできません',
          'groups[1].surveyImageId': '異なるプロジェクトの現場調査画像は紐付けできません',
        })
      );
      renderPage();

      await clickSave(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        '次のグループの写真はこの数量表のプロジェクトに属していないため保存できません: グループ「屋根」。写真を変更するか紐付けを解除してから保存してください。'
      );
      expect(alert).not.toHaveTextContent('外壁');
      expect(alert).not.toHaveTextContent('再度お試しください');
      // 失敗後もドラフトを保持し、再取得しない（REQ-42.9 の既存の挙動を崩さない）
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
    });

    it('404（写真の物理削除）は応答の surveyImageId が指す写真を持つグループを示し、再試行を促さない', async () => {
      const user = userEvent.setup();
      mockSaveQuantityTableDraft.mockRejectedValue(
        new ApiError(404, '現場調査画像が見つかりません', {
          status: 404,
          code: 'SURVEY_IMAGE_NOT_FOUND',
          detail: '現場調査画像が見つかりません',
          surveyImageId: 'image-b',
        })
      );
      renderPage();

      await clickSave(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        '次のグループの写真は削除されているため保存できません: グループ「屋根」。写真を変更するか紐付けを解除してから保存してください。'
      );
      expect(alert).not.toHaveTextContent('外壁');
      expect(alert).not.toHaveTextContent('再度お試しください');
    });

    it('410（親の現場調査の論理削除）は名指されたグループを示し、再試行を促さない（Task 90.2）', async () => {
      const user = userEvent.setup();
      mockSaveQuantityTableDraft.mockRejectedValue(
        new ApiError(410, '削除された現場調査の画像は紐付けできません: survey-1', {
          status: 410,
          code: 'SURVEY_DELETED',
          surveyId: 'survey-1',
          'groups[1].surveyImageId': '削除された現場調査の画像は紐付けできません',
        })
      );
      renderPage();

      await clickSave(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        '次のグループの写真は現場調査ごと削除されているため保存できません: グループ「屋根」。写真を変更するか紐付けを解除してから保存してください。'
      );
      expect(alert).not.toHaveTextContent('外壁');
      expect(alert).not.toHaveTextContent('再度お試しください');
    });

    it('写真の紐付けに関わらない失敗は従来どおり一般の文言になる（数量表の 404 は状態コードでなくコードで見分ける）', async () => {
      const user = userEvent.setup();
      mockSaveQuantityTableDraft.mockRejectedValue(
        new ApiError(404, 'Quantity table not found', {
          status: 404,
          code: 'QUANTITY_TABLE_NOT_FOUND',
        })
      );
      renderPage();

      await clickSave(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('保存に失敗しました。再度お試しください。');
    });
  });

  describe('取得時に落とした紐付けの告知', () => {
    it('取得の応答が名指したグループを告げ、保存が成功すると告知は消える', async () => {
      const user = userEvent.setup();
      const droppedDetail = buildDetail(
        [buildGroup('group-a', '外壁', 'image-a', 0), buildGroup('group-b', '屋根', null, 1)],
        ['group-b']
      );
      mockGetQuantityTableDetail.mockResolvedValue(droppedDetail);
      // 保存後の応答は、解除された紐付けを名指さない
      mockSaveQuantityTableDraft.mockResolvedValue({
        ...droppedDetail,
        droppedSurveyImageLinkGroupIds: [],
      });
      renderPage();

      const notice = await screen.findByTestId('survey-image-link-dropped-notice');
      expect(notice).toHaveAttribute('role', 'status');
      expect(notice).toHaveTextContent(
        '参照できない写真の紐付けがあったため、次のグループの写真を表示していません: グループ「屋根」。保存するとこの紐付けは解除されます。'
      );
      expect(notice).not.toHaveTextContent('外壁');

      await clickSave(user);

      await waitFor(() => {
        expect(screen.getByText('保存しました')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('survey-image-link-dropped-notice')).not.toBeInTheDocument();
    });
  });

  describe('写真の紐付けの解除（Task 90.2）', () => {
    it('解除はドラフトにのみ反映し、永続化のAPIを呼ばない（REQ-42.3）', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      // 2グループとも写真を持つ（解除の対象が2件ある）
      const unlinkButtons = screen.getAllByRole('button', { name: '写真の紐付けを解除' });
      expect(unlinkButtons).toHaveLength(2);

      await user.click(unlinkButtons[1]!);

      // 解除したグループだけが写真を失う
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: '写真の紐付けを解除' })).toHaveLength(1);
      });
      // 永続化APIは呼ばない（REQ-42.3: クライアント編集状態にのみ反映）
      expect(mockSaveQuantityTableDraft).not.toHaveBeenCalled();
      // 再取得もしない
      expect(mockGetQuantityTableDetail).toHaveBeenCalledTimes(1);
    });

    it('解除した状態で保存すると、そのグループの surveyImageId を null として送る', async () => {
      const user = userEvent.setup();
      mockSaveQuantityTableDraft.mockResolvedValue(linkedDetail);
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText('数量表名')).toBeInTheDocument();
      });

      await user.click(screen.getAllByRole('button', { name: '写真の紐付けを解除' })[1]!);
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(mockSaveQuantityTableDraft).toHaveBeenCalledTimes(1);
      });
      const [, input] = mockSaveQuantityTableDraft.mock.calls[0]!;
      expect(input.groups.map((group) => group.surveyImageId)).toEqual(['image-a', null]);
    });
  });
});
