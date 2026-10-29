/**
 * @fileoverview 工程表の画面が 404 を受けたときの不在の表示のテスト
 *
 * Task 24.1: 工程表の一覧・新規作成・詳細の画面と、作成・保存・削除の操作が 404 を受けたときの表示
 * （出力のダイアログの 404 は ExportDialog.test.tsx が持つ）
 *
 * Requirements (construction-schedule):
 * - 14.1: 画面の読み込みの 404 で見つからない旨とプロジェクトの一覧へのリンクを表示し、取得の失敗の文言・
 *   応答の英語の文言と再試行の釦を出さない
 * - 14.2: 作成・保存・削除の 404 で見つからない旨の日本語のメッセージを表示し、応答の英語の文言と
 *   操作の失敗の汎用の文言を出さない。409 と 404 以外の失敗の従来の文言は保つ
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ScheduleListPage from '../../pages/ScheduleListPage';
import ScheduleCreatePage from '../../pages/ScheduleCreatePage';
import ScheduleDetailPage from '../../pages/ScheduleDetailPage';
import { ApiError } from '../../api/client';
import * as schedulesApi from '../../api/schedules';
import * as quantityTablesApi from '../../api/quantity-tables';

vi.mock('../../api/schedules');
vi.mock('../../api/quantity-tables');

// ============================================================================
// テストデータ
// ============================================================================

const SCHEDULE_GONE = '工程表が見つかりません。存在しないか、削除されています。';
const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';

/** 閲覧範囲外と不在に共通の汎用の 404（本文は英語） */
function genericNotFound(): ApiError {
  return new ApiError(404, 'Not found', {
    type: 'https://architrack.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: 'Not found',
    code: 'NOT_FOUND',
  });
}

/** 範囲内の利用者に届く工程表の不在 */
function scheduleNotFound(): ApiError {
  return new ApiError(404, '工程表が見つかりません', {
    status: 404,
    detail: '工程表が見つかりません',
    code: 'SCHEDULE_NOT_FOUND',
  });
}

const mockScheduleList: schedulesApi.ScheduleListResponse = {
  schedules: [
    {
      id: 'schedule-1',
      name: '本体工事工程表',
      quantityTableName: '本体工事数量表',
      itemCount: 2,
      createdAt: '2026-03-14T00:00:00Z',
      updatedAt: '2026-03-14T00:00:00Z',
    },
  ],
  total: 1,
};

const mockScheduleDetail: schedulesApi.ScheduleDetail = {
  id: 'schedule-1',
  projectId: 'proj-001',
  name: '本体工事工程表',
  quantityTableId: null,
  quantityTableName: null,
  items: [
    {
      id: 'item-1',
      sourceType: 'MANUAL',
      sourceQuantityItemId: null,
      itemName: '仮設工事',
      labelText: '仮設',
      detailText: '',
      startDate: '2026-04-01',
      duration: 3,
      displayOrder: 0,
      isExportTarget: true,
      createdAt: '2026-03-14T00:00:00Z',
      updatedAt: '2026-03-14T00:00:00Z',
    },
  ],
  version: 0,
  createdAt: '2026-03-14T00:00:00Z',
  updatedAt: '2026-03-14T00:00:00Z',
};

const mockQuantityTables = {
  data: [
    {
      id: 'qt-001',
      projectId: 'proj-001',
      name: '本体工事数量表',
      groupCount: 1,
      itemCount: 3,
      createdAt: '2026-03-14T00:00:00Z',
      updatedAt: '2026-03-14T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

// ============================================================================
// ヘルパー
// ============================================================================

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-001/schedules']}>
      <Routes>
        <Route path="/projects/:projectId/schedules" element={<ScheduleListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-001/schedules/new']}>
      <Routes>
        <Route path="/projects/:projectId/schedules/new" element={<ScheduleCreatePage />} />
        <Route path="/schedules/:id" element={<div>工程表詳細</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/schedules/schedule-1']}>
      <Routes>
        <Route path="/schedules/:id" element={<ScheduleDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 不在の表示（ResourceNotFound）。いずれの画面も戻り先はプロジェクトの一覧 */
async function expectNotFoundView(resourceType: '工程表' | 'プロジェクト') {
  expect(
    await screen.findByRole('heading', { name: `${resourceType}が見つかりません` })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  expect(screen.queryByText('Not found')).not.toBeInTheDocument();
}

// ============================================================================
// テスト
// ============================================================================

describe('工程表の画面の不在の表示（Task 24.1）', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(schedulesApi.getSchedules).mockResolvedValue(mockScheduleList);
    vi.mocked(schedulesApi.getScheduleDetail).mockResolvedValue(mockScheduleDetail);
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
  });

  // --------------------------------------------------------------------------
  // 一覧の画面
  // --------------------------------------------------------------------------

  describe('一覧の画面', () => {
    it('工程表の一覧の読み込みの 404 では、プロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示し、取得の失敗の文言と再試行の釦を出さない', async () => {
      vi.mocked(schedulesApi.getSchedules).mockRejectedValue(genericNotFound());
      renderList();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByText('工程表の取得に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '工程表一覧' })).not.toBeInTheDocument();
    });

    it('404 以外の読み込みの失敗は、従来どおり取得の失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(schedulesApi.getSchedules).mockRejectedValue(
        new ApiError(500, 'Internal server error')
      );
      renderList();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('工程表の取得に失敗しました');
      expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByText('プロジェクトが見つかりません')).not.toBeInTheDocument();
    });

    it('削除の 404 では、一覧を保ったまま工程表が見つからない旨を表示し、削除の失敗の文言と再試行の釦を出さない', async () => {
      vi.mocked(schedulesApi.deleteSchedule).mockRejectedValue(genericNotFound());
      const user = userEvent.setup();
      renderList();

      await user.click(await screen.findByRole('button', { name: '本体工事工程表を削除' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確認' }));

      const message = await screen.findByTestId('schedule-list-operation-error');
      expect(message).toHaveTextContent(SCHEDULE_GONE);
      expect(message).toHaveAttribute('role', 'alert');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByTestId('schedule-list-table')).toBeInTheDocument();
      expect(screen.queryByText('工程表の削除に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
    });

    it('404 以外の削除の失敗は、従来どおり削除の失敗の文言と再試行の釦で一覧を置き換える', async () => {
      vi.mocked(schedulesApi.deleteSchedule).mockRejectedValue(new ApiError(409, 'Conflict'));
      const user = userEvent.setup();
      renderList();

      await user.click(await screen.findByRole('button', { name: '本体工事工程表を削除' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '確認' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('工程表の削除に失敗しました');
      expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByText(SCHEDULE_GONE)).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 新規作成の画面
  // --------------------------------------------------------------------------

  describe('新規作成の画面', () => {
    it('数量表の選択肢の読み込みの 404 では、プロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示し、入力欄を出さない', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(genericNotFound());
      renderCreate();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByTestId('schedule-form')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
    });

    it('数量表の選択肢の 404 以外の失敗は、従来どおり無視して選択肢を空にし入力欄を出す', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(
        new ApiError(500, 'Internal server error')
      );
      renderCreate();

      await waitFor(() => {
        expect(quantityTablesApi.getQuantityTables).toHaveBeenCalled();
      });
      expect(screen.getByTestId('schedule-form')).toBeInTheDocument();
      const select = screen.getByLabelText('数量表');
      expect(within(select).getAllByRole('option')).toHaveLength(1);
      expect(screen.queryByText('プロジェクトが見つかりません')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('作成の 404 では、作成の画面のエラーの欄にプロジェクトが見つからない旨を表示し、作成の失敗の文言を出さず、入力を保つ', async () => {
      vi.mocked(schedulesApi.createSchedule).mockRejectedValue(genericNotFound());
      const user = userEvent.setup();
      renderCreate();

      const nameInput = await screen.findByLabelText('工程表名称');
      await user.type(nameInput, '新しい工程表');
      await user.click(screen.getByRole('button', { name: '作成' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(PROJECT_GONE);
      expect(screen.queryByText('工程表の作成に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(nameInput).toHaveValue('新しい工程表');
    });

    it('404 以外の作成の失敗は、従来どおり作成の失敗の文言を表示する', async () => {
      vi.mocked(schedulesApi.createSchedule).mockRejectedValue(
        new ApiError(500, 'Internal server error')
      );
      const user = userEvent.setup();
      renderCreate();

      await user.type(await screen.findByLabelText('工程表名称'), '新しい工程表');
      await user.click(screen.getByRole('button', { name: '作成' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('工程表の作成に失敗しました');
      expect(screen.queryByText(PROJECT_GONE)).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // 詳細の画面
  // --------------------------------------------------------------------------

  describe('詳細の画面', () => {
    it('工程表の読み込みの汎用の 404 では、工程表が見つからない旨とプロジェクトの一覧へのリンクを表示し、応答の英語の文言を出さない', async () => {
      vi.mocked(schedulesApi.getScheduleDetail).mockRejectedValue(genericNotFound());
      renderDetail();

      await expectNotFoundView('工程表');
      expect(screen.queryByText('工程表の読み込みに失敗しました')).not.toBeInTheDocument();
    });

    it('範囲内の利用者に届く工程表の不在の 404 も、汎用の 404 と同じ表示にする', async () => {
      vi.mocked(schedulesApi.getScheduleDetail).mockRejectedValue(genericNotFound());
      const { container, unmount } = renderDetail();
      await expectNotFoundView('工程表');
      const genericText = container.textContent;
      unmount();

      vi.mocked(schedulesApi.getScheduleDetail).mockRejectedValue(scheduleNotFound());
      const second = renderDetail();
      await expectNotFoundView('工程表');
      expect(second.container.textContent).toBe(genericText);
    });

    it('404 以外の読み込みの失敗は、従来どおり失敗の文言を表示する', async () => {
      vi.mocked(schedulesApi.getScheduleDetail).mockRejectedValue(
        new ApiError(500, '工程表の取得でエラーが発生しました')
      );
      renderDetail();

      expect(await screen.findByText('工程表の取得でエラーが発生しました')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'プロジェクト一覧に戻る' })
      ).not.toBeInTheDocument();
    });

    it('保存の 404 では、保存のエラーの欄に工程表が見つからない旨を表示し、応答の英語の文言を出さず、未保存の変更を保つ', async () => {
      vi.mocked(schedulesApi.bulkSaveScheduleItems).mockRejectedValue(genericNotFound());
      const user = userEvent.setup();
      renderDetail();

      const label = await screen.findByTestId('label-text-item-1');
      await user.clear(label);
      await user.type(label, '変更後');
      await user.click(screen.getByTestId('save-button'));

      expect(await screen.findByTestId('save-error')).toHaveTextContent(SCHEDULE_GONE);
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.getByText('未保存の変更があります')).toBeInTheDocument();
      expect(screen.getByTestId('label-text-item-1')).toHaveValue('変更後');
    });

    it('409 と 404 以外の保存の失敗は、従来どおり応答の文言を表示する', async () => {
      vi.mocked(schedulesApi.bulkSaveScheduleItems).mockRejectedValue(
        new ApiError(409, '他のユーザーによって更新されています')
      );
      const user = userEvent.setup();
      renderDetail();

      await user.click(await screen.findByTestId('save-button'));

      expect(await screen.findByTestId('save-error')).toHaveTextContent(
        '他のユーザーによって更新されています'
      );
      expect(screen.queryByText(SCHEDULE_GONE)).not.toBeInTheDocument();
    });
  });
});
