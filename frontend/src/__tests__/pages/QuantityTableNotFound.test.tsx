/**
 * @fileoverview 数量表の画面が 404 を受けたときの不在の表示のテスト
 *
 * Task 106.1: 数量表の一覧・新規作成・編集の画面と、作成・保存・名称の変更・コピー・削除の操作が
 * 404 を受けたときの表示（コピーのダイアログ単体の 404 は CopyQuantityTableDialog.test.tsx も持つ）
 *
 * Requirements (quantity-table-generation):
 * - 51.1: 画面の読み込みの 404 で見つからない旨とプロジェクトの一覧へのリンクを表示し、読み込み・取得の
 *   失敗の文言と再試行の釦を出さない
 * - 51.2: 作成・保存・名称の変更・コピー・削除の 404 で見つからない旨の日本語のメッセージを表示し、
 *   応答の英語の文言と操作の失敗の汎用の文言を出さない。409・404 以外の失敗・紐付けた写真の失敗の
 *   従来の文言は保つ
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApiError } from '../../api/client';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as projectsApi from '../../api/projects';
import type { QuantityTableDetail } from '../../types/quantity-table.types';

vi.mock('../../api/quantity-tables');
vi.mock('../../api/projects');
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

import QuantityTableListPage from '../../pages/QuantityTableListPage';
import QuantityTableCreatePage from '../../pages/QuantityTableCreatePage';
import QuantityTableEditPage from '../../pages/QuantityTableEditPage';

// ============================================================================
// テストデータ
// ============================================================================

const TABLE_GONE = '数量表が見つかりません。存在しないか、削除されています。';
const PROJECT_GONE = 'プロジェクトが見つかりません。存在しないか、削除されています。';
const TIMESTAMP = '2026-10-01T00:00:00.000Z';

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

/** 範囲内の利用者に届く、論理削除された数量表の 404（本文は数量表の ID を含む） */
function quantityTableNotFound(): ApiError {
  return new ApiError(404, '数量表が見つかりません: qt-1', {
    status: 404,
    detail: '数量表が見つかりません: qt-1',
    code: 'QUANTITY_TABLE_NOT_FOUND',
  });
}

const mockProject = {
  id: 'proj-1',
  name: 'テストプロジェクト',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: '担当者' },
  status: 'PREPARING' as const,
  statusLabel: '準備中',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

const mockTables = {
  data: [
    {
      id: 'qt-1',
      projectId: 'proj-1',
      name: '第1回見積数量表',
      groupCount: 1,
      itemCount: 1,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const mockDetail: QuantityTableDetail = {
  id: 'qt-1',
  projectId: 'proj-1',
  project: { id: 'proj-1', name: 'テストプロジェクト' },
  name: '第1回見積数量表',
  groupCount: 1,
  itemCount: 0,
  groups: [
    {
      id: 'group-1',
      quantityTableId: 'qt-1',
      name: '外壁',
      surveyImageId: null,
      surveyImage: null,
      displayOrder: 0,
      itemCount: 0,
      items: [],
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ],
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

// ============================================================================
// ヘルパー
// ============================================================================

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables']}>
      <Routes>
        <Route path="/projects/:projectId/quantity-tables" element={<QuantityTableListPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/new']}>
      <Routes>
        <Route
          path="/projects/:projectId/quantity-tables/new"
          element={<QuantityTableCreatePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/quantity-tables/qt-1/edit']}>
      <Routes>
        <Route path="/quantity-tables/:id/edit" element={<QuantityTableEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 共通部品 ResourceNotFound の不在の表示と、障害を告げる表示の不在を主張する */
async function expectNotFoundView(resourceType: '数量表' | 'プロジェクト') {
  const heading = await screen.findByRole('heading', { name: `${resourceType}が見つかりません` });
  expect(heading).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  expect(screen.queryByText(/取得に失敗しました/)).not.toBeInTheDocument();
  expect(screen.queryByText(/読み込みに失敗しました/)).not.toBeInTheDocument();
  expect(screen.queryByText('Not found')).not.toBeInTheDocument();
  // ResourceNotFound は main の内側に置く
  expect(screen.getByRole('main')).toContainElement(heading);
}

// ============================================================================
// テスト
// ============================================================================

describe('数量表の画面の不在の表示（Task 106.1）', () => {
  beforeEach(() => {
    vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
    vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockTables);
    vi.mocked(quantityTablesApi.getQuantityTableDetail).mockResolvedValue(mockDetail);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('一覧の画面', () => {
    it('数量表の一覧の読み込みの 404 でプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(genericNotFound());
      vi.mocked(projectsApi.getProject).mockRejectedValue(genericNotFound());

      renderList();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByText('数量表の取得に失敗しました')).not.toBeInTheDocument();
    });

    it('プロジェクトの読み込みだけが 404 でもプロジェクトが見つからない旨を表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(genericNotFound());

      renderList();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByText('第1回見積数量表')).not.toBeInTheDocument();
    });

    it('404 以外の読み込みの失敗は従来どおり取得の失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTables).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );

      renderList();

      expect(await screen.findByText('数量表の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /見つかりません/ })).not.toBeInTheDocument();
    });

    it('削除の 404 で一覧を保ったまま数量表が見つからない旨を表示し、削除の失敗の文言と再試行の釦を出さない', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.deleteQuantityTable).mockRejectedValue(quantityTableNotFound());

      renderList();

      await screen.findByText('第1回見積数量表');
      await user.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '削除' }));

      const alert = await screen.findByTestId('quantity-table-list-operation-error');
      expect(alert).toHaveTextContent(TABLE_GONE);
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).not.toHaveTextContent('qt-1');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('第1回見積数量表')).toBeInTheDocument();
      expect(screen.queryByText('削除に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
    });

    it('404 以外の削除の失敗は従来どおり削除の失敗の文言と再試行の釦で一覧を置き換える', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.deleteQuantityTable).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );

      renderList();

      await screen.findByText('第1回見積数量表');
      await user.click(screen.getByRole('button', { name: '削除' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '削除' }));

      expect(await screen.findByText('削除に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByText(TABLE_GONE)).not.toBeInTheDocument();
    });

    it('名称の変更の 404 で数量表が見つからない旨を表示し、名称の保存の失敗の文言を出さない', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockRejectedValue(genericNotFound());

      renderList();

      await screen.findByText('第1回見積数量表');
      await user.click(screen.getByRole('button', { name: '名前を編集' }));
      const input = screen.getByRole('textbox', { name: '数量表名を編集' });
      await user.clear(input);
      await user.type(input, '改名後{Enter}');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(TABLE_GONE);
      });
      expect(screen.queryByText('数量表名の保存に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '数量表名を編集' })).toHaveValue('改名後');
    });

    it('名称の変更の 409 は従来どおり競合の文言を表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.updateQuantityTable).mockRejectedValue(
        new ApiError(409, 'Conflict')
      );

      renderList();

      await screen.findByText('第1回見積数量表');
      await user.click(screen.getByRole('button', { name: '名前を編集' }));
      const input = screen.getByRole('textbox', { name: '数量表名を編集' });
      await user.clear(input);
      await user.type(input, '改名後{Enter}');

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('他のユーザーによって更新されました');
      });
      expect(screen.queryByText(TABLE_GONE)).not.toBeInTheDocument();
    });

    it('コピーの 404 でコピーのダイアログに数量表が見つからない旨を表示し、応答の英語の文言を出さない', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.copyQuantityTable).mockRejectedValue(genericNotFound());

      renderList();

      await screen.findByText('第1回見積数量表');
      await user.click(screen.getByRole('button', { name: 'コピー' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'コピーを作成' }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toHaveTextContent(TABLE_GONE);
      });
      expect(within(dialog).queryByText('Not found')).not.toBeInTheDocument();
    });
  });

  describe('新規作成の画面', () => {
    it('プロジェクトの読み込みの 404 でプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示し、入力欄を出さない', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(genericNotFound());

      renderCreate();

      await expectNotFoundView('プロジェクト');
      expect(screen.queryByText('プロジェクト情報の取得に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('数量表名')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
    });

    it('404 以外のプロジェクトの読み込みの失敗は従来どおりの文言を表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'Internal'));

      renderCreate();

      expect(await screen.findByText('プロジェクト情報の取得に失敗しました')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /見つかりません/ })).not.toBeInTheDocument();
    });

    it('作成の 404 でプロジェクトが見つからない旨を表示し、作成の失敗の文言を出さず、入力を保つ', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.createQuantityTable).mockRejectedValue(genericNotFound());

      renderCreate();

      const input = await screen.findByLabelText('数量表名');
      await user.clear(input);
      await user.type(input, '第2回見積数量表');
      await user.click(screen.getByRole('button', { name: '作成' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(PROJECT_GONE);
      });
      expect(screen.queryByText('数量表の作成に失敗しました')).not.toBeInTheDocument();
      expect(screen.getByLabelText('数量表名')).toHaveValue('第2回見積数量表');
    });

    it('404 以外の作成の失敗は従来どおり作成の失敗の文言を表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.createQuantityTable).mockRejectedValue(
        new ApiError(400, 'Validation error')
      );

      renderCreate();

      await screen.findByLabelText('数量表名');
      await user.click(screen.getByRole('button', { name: '作成' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('数量表の作成に失敗しました');
      });
      expect(screen.queryByText(PROJECT_GONE)).not.toBeInTheDocument();
    });
  });

  describe('編集の画面', () => {
    it('数量表の詳細の読み込みの 404 で数量表が見つからない旨とプロジェクトの一覧へのリンクを表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTableDetail).mockRejectedValue(genericNotFound());

      renderEdit();

      await expectNotFoundView('数量表');
      expect(screen.queryByText('読み込みに失敗しました')).not.toBeInTheDocument();
    });

    it('範囲内の利用者に届く数量表の不在の 404 も同じ表示にし、ID を含む本文を出さない', async () => {
      vi.mocked(quantityTablesApi.getQuantityTableDetail).mockRejectedValue(
        quantityTableNotFound()
      );

      renderEdit();

      await expectNotFoundView('数量表');
      expect(screen.queryByText(/qt-1/)).not.toBeInTheDocument();
    });

    it('404 以外の読み込みの失敗は従来どおり読み込みの失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(quantityTablesApi.getQuantityTableDetail).mockRejectedValue(
        new ApiError(500, 'Internal')
      );

      renderEdit();

      expect(await screen.findByText('読み込みに失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /見つかりません/ })).not.toBeInTheDocument();
    });

    it('保存の 404 で数量表が見つからない旨を表示し、保存の失敗の文言を出さず、未保存の変更を保つ', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.saveQuantityTableDraft).mockRejectedValue(
        quantityTableNotFound()
      );

      renderEdit();

      const nameInput = await screen.findByRole('textbox', { name: '数量表名' });
      await user.clear(nameInput);
      await user.type(nameInput, '取り除かれた後の変更');
      await user.tab();
      expect(await screen.findByTestId('unsaved-changes-badge')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(TABLE_GONE);
      });
      expect(screen.queryByText(/保存に失敗しました/)).not.toBeInTheDocument();
      expect(screen.queryByText(/qt-1/)).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '数量表名' })).toHaveValue('取り除かれた後の変更');
      expect(screen.getByTestId('unsaved-changes-badge')).toBeInTheDocument();
      // 再取得しない（ドラフトを保つ。Requirement 42.9）
      expect(quantityTablesApi.getQuantityTableDetail).toHaveBeenCalledTimes(1);
    });

    it('保存の紐付けた写真の不在の 404 は従来どおり写真の失敗の書き分けを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.saveQuantityTableDraft).mockRejectedValue(
        new ApiError(404, '現場調査画像が見つかりません', {
          status: 404,
          code: 'SURVEY_IMAGE_NOT_FOUND',
          detail: '現場調査画像が見つかりません',
          surveyImageId: 'image-x',
        })
      );

      renderEdit();

      await screen.findByRole('textbox', { name: '数量表名' });
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '紐付けた写真のうち削除されたものがあるため保存できません。'
        );
      });
      expect(screen.queryByText(TABLE_GONE)).not.toBeInTheDocument();
    });

    it('保存の 404 以外の失敗は従来どおり保存の失敗の文言を表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(quantityTablesApi.saveQuantityTableDraft).mockRejectedValue(
        new ApiError(500, 'Server error')
      );

      renderEdit();

      await screen.findByRole('textbox', { name: '数量表名' });
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '保存に失敗しました。再度お試しください。'
        );
      });
      expect(screen.queryByText(TABLE_GONE)).not.toBeInTheDocument();
    });
  });
});
