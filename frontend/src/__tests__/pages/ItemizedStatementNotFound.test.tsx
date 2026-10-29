/**
 * @fileoverview 内訳書の画面が 404 を受けたときの不在の表示のテスト
 *
 * Task 29.1: 内訳書の一覧・新規作成・詳細の画面と、作成・削除・並び順の保存の操作が 404 を受けたときの表示
 *
 * Requirements (itemized-statement-generation):
 * - 19.1: 画面の読み込みの 404 で見つからない旨とプロジェクトの一覧へのリンクを表示し、取得の失敗の文言・
 *   応答の英語の文言と再試行の釦を出さない
 * - 19.2: 作成・削除・並び順の保存の 404 で見つからない旨の日本語のメッセージを表示し、応答の英語の文言と
 *   操作の失敗の汎用の文言を出さない。409 と 404 以外の失敗の従来の文言は保つ
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ItemizedStatementListPage from '../../pages/ItemizedStatementListPage';
import ItemizedStatementCreatePage from '../../pages/ItemizedStatementCreatePage';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import { CreateItemizedStatementForm } from '../../components/itemized-statement/CreateItemizedStatementForm';
import { ApiError } from '../../api/client';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import * as quantityTablesApi from '../../api/quantity-tables';
import * as projectsApi from '../../api/projects';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';
import type { QuantityTableInfo } from '../../types/quantity-table.types';

vi.mock('../../api/itemized-statements');
vi.mock('../../api/quantity-tables');
vi.mock('../../api/projects');

// useBlocker をモック（データルーターなしで詳細画面を描くため）
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
  };
});

// ============================================================================
// テストデータ
// ============================================================================

const ITEMIZED_STATEMENT_GONE = '内訳書が見つかりません。存在しないか、削除されています。';
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

/** 範囲内の利用者に届く内訳書の不在（本文は内訳書の ID を含む） */
function statementNotFound(): ApiError {
  return new ApiError(404, '内訳書が見つかりません: statement-1', {
    status: 404,
    detail: '内訳書が見つかりません: statement-1',
    code: 'ITEMIZED_STATEMENT_NOT_FOUND',
  });
}

const mockProject = {
  id: 'project-123',
  name: 'テストプロジェクト',
  description: '',
  status: 'SURVEYING' as const,
  statusLabel: '調査中',
  siteAddress: '',
  tradingPartnerId: null,
  tradingPartner: null,
  salesPerson: { id: 'user-1', displayName: 'テスト担当者' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockQuantityTableList: QuantityTableInfo[] = [
  {
    id: 'qt-1',
    name: 'テスト数量表',
    projectId: 'project-123',
    itemCount: 10,
    groupCount: 2,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
  },
];

const mockQuantityTables = {
  data: mockQuantityTableList,
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

const mockStatements = {
  data: [
    {
      id: 'statement-1',
      name: 'テスト内訳書1',
      projectId: 'project-123',
      sourceQuantityTableId: 'qt-1',
      sourceQuantityTableName: 'テスト数量表',
      itemCount: 10,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const mockStatementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-123',
  project: { id: 'project-123', name: 'テストプロジェクト' },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 2,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  items: [
    {
      id: 'item-1',
      customCategory: '分類A',
      workType: '工種1',
      name: '名称1',
      specification: '規格1',
      unit: '本',
      quantity: 10.5,
      displayOrder: 0,
    },
    {
      id: 'item-2',
      customCategory: '分類B',
      workType: '工種2',
      name: '名称2',
      specification: '規格2',
      unit: 'm',
      quantity: 20,
      displayOrder: 1,
    },
  ],
};

// ============================================================================
// ヘルパー
// ============================================================================

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/projects/:projectId/itemized-statements"
          element={<ItemizedStatementListPage />}
        />
        <Route
          path="/projects/:projectId/itemized-statements/new"
          element={<ItemizedStatementCreatePage />}
        />
        <Route path="/itemized-statements/:id" element={<ItemizedStatementDetailPage />} />
        <Route path="/projects" element={<div>プロジェクト一覧の画面</div>} />
        <Route path="/projects/:projectId" element={<div>プロジェクト詳細の画面</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** 不在の表示（ResourceNotFound）と、出してはならない障害の表示が無いことを主張する */
async function expectNotFoundView(resourceType: '内訳書' | 'プロジェクト') {
  expect(
    await screen.findByRole('heading', { name: `${resourceType}が見つかりません` })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'プロジェクト一覧に戻る' })).toHaveAttribute(
    'href',
    '/projects'
  );
  expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  for (const text of [
    '内訳書の取得に失敗しました',
    'プロジェクトの取得に失敗しました',
    'Not found',
  ]) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectsApi.getProject).mockResolvedValue(mockProject);
  vi.mocked(quantityTablesApi.getQuantityTables).mockResolvedValue(mockQuantityTables);
  vi.mocked(itemizedStatementsApi.getItemizedStatements).mockResolvedValue(mockStatements);
  vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(
    mockStatementDetail
  );
});

// ============================================================================
// 読み込みの 404（19.1）
// ============================================================================

describe('Req 19.1: 画面の読み込みの 404', () => {
  describe('一覧の画面', () => {
    it.each([
      ['内訳書の一覧', () => itemizedStatementsApi.getItemizedStatements],
      ['数量表の一覧', () => quantityTablesApi.getQuantityTables],
      ['プロジェクト', () => projectsApi.getProject],
    ] as const)(
      '%sの取得が 404 を受けるとプロジェクトが見つからない旨とプロジェクトの一覧へのリンクを表示する',
      async (_label, fn) => {
        vi.mocked(fn()).mockRejectedValue(genericNotFound());
        renderAt('/projects/project-123/itemized-statements');
        await expectNotFoundView('プロジェクト');
        expect(screen.queryByText('テスト内訳書1')).not.toBeInTheDocument();
      }
    );

    it('404 以外の失敗は従来どおり取得の失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatements).mockRejectedValue(
        new ApiError(500, 'Internal Server Error')
      );
      renderAt('/projects/project-123/itemized-statements');
      expect(await screen.findByText('内訳書の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeNull();
    });
  });

  describe('新規作成の画面', () => {
    it.each([
      ['プロジェクト', () => projectsApi.getProject],
      ['数量表の一覧', () => quantityTablesApi.getQuantityTables],
    ] as const)(
      '%sの取得が 404 を受けるとプロジェクトが見つからない旨を表示し、フォームを出さない',
      async (_label, fn) => {
        vi.mocked(fn()).mockRejectedValue(genericNotFound());
        renderAt('/projects/project-123/itemized-statements/new');
        await expectNotFoundView('プロジェクト');
        expect(screen.queryByRole('button', { name: /作成/ })).not.toBeInTheDocument();
      }
    );

    it('404 以外の失敗は従来どおりプロジェクトの取得の失敗の文言を表示する', async () => {
      vi.mocked(projectsApi.getProject).mockRejectedValue(new ApiError(500, 'Internal'));
      renderAt('/projects/project-123/itemized-statements/new');
      expect(await screen.findByText('プロジェクトの取得に失敗しました')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeNull();
    });
  });

  describe('詳細の画面', () => {
    it.each([
      ['汎用の 404（範囲外と不在）', genericNotFound],
      ['内訳書の不在の 404', statementNotFound],
    ] as const)(
      '%sで内訳書が見つからない旨とプロジェクトの一覧へのリンクを表示し、応答の文言を出さない',
      async (_label, make) => {
        vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockRejectedValue(make());
        renderAt('/itemized-statements/statement-1');
        await expectNotFoundView('内訳書');
        expect(screen.queryByText('内訳書が見つかりません: statement-1')).not.toBeInTheDocument();
      }
    );

    it('404 以外の失敗は従来どおり失敗の文言と再試行の釦を表示する', async () => {
      vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockRejectedValue(
        new ApiError(500, 'サーバーエラー')
      );
      renderAt('/itemized-statements/statement-1');
      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText('サーバーエラー')).toBeInTheDocument();
      expect(within(alert).getByRole('button', { name: '再試行' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '内訳書が見つかりません' })).toBeNull();
    });
  });
});

// ============================================================================
// 操作の 404（19.2）
// ============================================================================

describe('Req 19.2: 操作の 404', () => {
  describe('詳細の画面の削除', () => {
    async function confirmDelete() {
      const user = userEvent.setup();
      renderAt('/itemized-statements/statement-1');
      await screen.findByRole('heading', { level: 1, name: 'テスト内訳書' });
      await user.click(screen.getByRole('button', { name: /削除/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^削除$/ }));
    }

    it.each([
      ['汎用の 404', genericNotFound],
      ['内訳書の不在の 404', statementNotFound],
    ] as const)('%sで内訳書が見つからない旨を表示し、応答の文言を出さない', async (_l, make) => {
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(make());
      await confirmDelete();
      const alert = await screen.findByText(ITEMIZED_STATEMENT_GONE);
      expect(alert.closest('[role="alert"]')).not.toBeNull();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.queryByText('内訳書が見つかりません: statement-1')).not.toBeInTheDocument();
      expect(screen.queryByText('削除に失敗しました')).not.toBeInTheDocument();
      // 画面は内訳書を表示したまま（遷移しない）
      expect(screen.getByRole('heading', { level: 1, name: 'テスト内訳書' })).toBeInTheDocument();
    });

    it('404 以外の失敗は従来どおり応答の文言を表示する', async () => {
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(
        new ApiError(500, '削除の処理で障害が起きました')
      );
      await confirmDelete();
      expect(await screen.findByText('削除の処理で障害が起きました')).toBeInTheDocument();
      expect(screen.queryByText(ITEMIZED_STATEMENT_GONE)).not.toBeInTheDocument();
    });
  });

  describe('詳細の画面の並び順の保存', () => {
    async function reorderAndSave() {
      const user = userEvent.setup();
      renderAt('/itemized-statements/statement-1');
      await screen.findByRole('table');
      await user.click(screen.getAllByRole('button', { name: '下へ移動' })[0]!);
      await user.click(screen.getByRole('button', { name: /並び順を保存/ }));
    }

    it('404 で内訳書が見つからない旨を表示し、応答の英語の文言を出さず、未保存の並び順を保つ', async () => {
      vi.mocked(itemizedStatementsApi.updateItemOrder).mockRejectedValue(genericNotFound());
      await reorderAndSave();
      const message = await screen.findByText(ITEMIZED_STATEMENT_GONE);
      expect(message.closest('[role="alert"]')).not.toBeNull();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.queryByText('並び順の保存に失敗しました')).not.toBeInTheDocument();
      // 未保存の変更は保たれ、保存の釦が残る
      expect(screen.getByRole('button', { name: /並び順を保存/ })).toBeInTheDocument();
    });

    it('404 以外の失敗は従来どおり応答の文言を表示する', async () => {
      vi.mocked(itemizedStatementsApi.updateItemOrder).mockRejectedValue(
        new ApiError(400, '内訳項目が一致しません')
      );
      await reorderAndSave();
      expect(await screen.findByText('内訳項目が一致しません')).toBeInTheDocument();
      expect(screen.queryByText(ITEMIZED_STATEMENT_GONE)).not.toBeInTheDocument();
    });
  });

  describe('一覧の画面の削除', () => {
    async function confirmDelete() {
      const user = userEvent.setup();
      renderAt('/projects/project-123/itemized-statements');
      await screen.findByTestId('statement-card-statement-1');
      await user.click(screen.getAllByRole('button', { name: '削除' })[0]!);
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '削除' }));
    }

    it('404 で一覧を保ったまま内訳書が見つからない旨を表示し、削除の失敗の文言で置き換えない', async () => {
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(genericNotFound());
      await confirmDelete();
      const message = await screen.findByTestId('itemized-statement-list-operation-error');
      expect(message).toHaveTextContent(ITEMIZED_STATEMENT_GONE);
      expect(message).toHaveAttribute('role', 'alert');
      expect(screen.queryByText('削除に失敗しました')).not.toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // 一覧は保たれる（取り直さない）
      expect(screen.getByTestId('statement-card-statement-1')).toBeInTheDocument();
      expect(itemizedStatementsApi.getItemizedStatements).toHaveBeenCalledTimes(1);
    });

    it('404 以外の失敗は従来どおり削除の失敗の文言で一覧を置き換える', async () => {
      vi.mocked(itemizedStatementsApi.deleteItemizedStatement).mockRejectedValue(
        new ApiError(500, 'Internal')
      );
      await confirmDelete();
      expect(await screen.findByText('削除に失敗しました')).toBeInTheDocument();
      expect(screen.queryByTestId('itemized-statement-list-operation-error')).toBeNull();
    });
  });

  describe('作成のフォーム', () => {
    async function submitWith(error: unknown) {
      const onSubmit = vi.fn().mockRejectedValue(error);
      const user = userEvent.setup();
      render(
        <CreateItemizedStatementForm
          projectId="project-123"
          quantityTables={mockQuantityTableList}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
          onSubmit={onSubmit}
          defaultName="内訳書"
        />
      );
      await user.selectOptions(screen.getByLabelText(/数量表/), 'qt-1');
      await user.click(screen.getByRole('button', { name: /作成/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    }

    it('汎用の 404 でプロジェクトが見つからない旨を表示し、応答の英語の文言を出さない', async () => {
      await submitWith(genericNotFound());
      expect(await screen.findByText(PROJECT_GONE)).toBeInTheDocument();
      expect(screen.queryByText('Not found')).not.toBeInTheDocument();
      expect(screen.queryByText('内訳書の作成中にエラーが発生しました')).not.toBeInTheDocument();
    });

    it('数量表の不在の 404 は日本語の本文を表示する', async () => {
      await submitWith(
        new ApiError(404, '数量表が見つかりません: qt-1', {
          status: 404,
          detail: '数量表が見つかりません: qt-1',
          code: 'QUANTITY_TABLE_NOT_FOUND',
        })
      );
      expect(await screen.findByText('数量表が見つかりません: qt-1')).toBeInTheDocument();
      expect(screen.queryByText(PROJECT_GONE)).not.toBeInTheDocument();
    });

    it('404 以外の失敗は従来の文言を保つ', async () => {
      await submitWith(
        new ApiError(409, 'Duplicate', {
          status: 409,
          code: 'DUPLICATE_ITEMIZED_STATEMENT_NAME',
        })
      );
      expect(await screen.findByText('同名の内訳書が既に存在します')).toBeInTheDocument();
      expect(screen.queryByText(PROJECT_GONE)).not.toBeInTheDocument();
    });
  });
});
