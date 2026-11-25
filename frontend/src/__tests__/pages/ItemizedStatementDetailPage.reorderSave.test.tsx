/**
 * @fileoverview 内訳書詳細ページ - 並び順の保存の失敗・保存中・未保存の離脱のテスト
 *
 * 既存の `ItemizedStatementDetailPage.reorder.test.tsx` は `useBlocker` をモックしており、
 * 未保存の並び順を抱えたまま画面を離れる操作の確認（17.12）を通らない。本ファイルは
 * `useBlocker` をモックせず、データルーター（`createMemoryRouter`）の上で実際のリンクの
 * 遷移を起こして確かめる。保存の失敗（17.10）と保存中の表示（17.11）も、409 ではない
 * 失敗と、応答を待たせた保存で確かめる。
 *
 * @module __tests__/pages/ItemizedStatementDetailPage.reorderSave.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ItemizedStatementDetailPage from '../../pages/ItemizedStatementDetailPage';
import * as itemizedStatementsApi from '../../api/itemized-statements';
import type { ItemizedStatementDetail } from '../../types/itemized-statement.types';

vi.mock('../../api/itemized-statements');

const statementDetail: ItemizedStatementDetail = {
  id: 'statement-1',
  projectId: 'project-1',
  project: { id: 'project-1', name: 'テストプロジェクト' },
  name: 'テスト内訳書',
  sourceQuantityTableId: 'qt-1',
  sourceQuantityTableName: 'テスト数量表',
  itemCount: 3,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  items: ['A', 'B', 'C'].map((suffix, index) => ({
    id: `item-${index + 1}`,
    customCategory: `分類${suffix}`,
    workType: `工種${index + 1}`,
    name: `名称${index + 1}`,
    specification: `規格${index + 1}`,
    unit: '本',
    quantity: 10,
    displayOrder: index,
  })),
};

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/itemized-statements/:id', element: <ItemizedStatementDetailPage /> },
      { path: '/projects/:projectId', element: <div>プロジェクト詳細の画面</div> },
    ],
    { initialEntries: ['/itemized-statements/statement-1'] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** 表の行の任意分類の列（並び替えの釦の列の次）を上から順に返す */
function categoryOrder(): string[] {
  const tbody = screen.getByRole('table').querySelector('tbody');
  if (!tbody) return [];
  return within(tbody)
    .getAllByRole('row')
    .map((row) => {
      const cells = within(row).getAllByRole('cell');
      const offset = cells.length === 7 ? 1 : 0;
      return cells[offset]?.textContent ?? '';
    });
}

/** 先頭の項目を一つ下へ動かして未保存の並び順を作る（A,B,C → B,A,C） */
async function reorderFirstDown(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('table');
  expect(categoryOrder()).toEqual(['分類A', '分類B', '分類C']);
  await user.click(screen.getAllByRole('button', { name: '下へ移動' })[0]!);
  expect(categoryOrder()).toEqual(['分類B', '分類A', '分類C']);
}

describe('ItemizedStatementDetailPage - 並び順の保存の失敗・保存中・未保存の離脱', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(itemizedStatementsApi.getItemizedStatementDetail).mockResolvedValue(statementDetail);
  });

  /**
   * 409 ではない保存の失敗で、エラーメッセージを表示し、利用者が並べた順（未保存の並び順）を
   * 失わずに保ち、保存をやり直せること。並び順は再取得で上書きされない。
   * @requirement itemized-statement-generation/REQ-17.10
   */
  it('並び順の保存の失敗でエラーメッセージを表示し並び順を保持する', async () => {
    const user = userEvent.setup();
    vi.mocked(itemizedStatementsApi.updateItemOrder).mockRejectedValue(
      new Error('サーバーで並び順の保存に失敗しました')
    );
    renderPage();
    await reorderFirstDown(user);

    await user.click(screen.getByRole('button', { name: '並び順を保存' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('サーバーで並び順の保存に失敗しました');
    expect(itemizedStatementsApi.updateItemOrder).toHaveBeenCalledTimes(1);

    // 並び順は保存前の操作の結果のまま。取り直しもしない
    expect(categoryOrder()).toEqual(['分類B', '分類A', '分類C']);
    expect(itemizedStatementsApi.getItemizedStatementDetail).toHaveBeenCalledTimes(1);
    // 未保存のままなので保存の釦が残り、成功の通知は出ない
    expect(screen.getByRole('button', { name: '並び順を保存' })).toBeEnabled();
    expect(screen.queryByText('並び順を保存しました')).not.toBeInTheDocument();
  });

  /**
   * 保存の応答を待つ間、保存の釦が「保存中...」の表示に変わって無効になり、上下の移動の釦も
   * すべて無効になること。応答が届くと戻ること。
   * @requirement itemized-statement-generation/REQ-17.11
   */
  it('並び順の保存処理中はローディングを表示し操作ボタンを無効化する', async () => {
    const user = userEvent.setup();
    let resolveSave: (detail: ItemizedStatementDetail) => void = () => {};
    vi.mocked(itemizedStatementsApi.updateItemOrder).mockImplementation(
      () =>
        new Promise<ItemizedStatementDetail>((resolve) => {
          resolveSave = resolve;
        })
    );
    renderPage();
    await reorderFirstDown(user);

    // 保存の前は移動の釦が押せる（先頭の上・末尾の下を除く）
    expect(screen.getAllByRole('button', { name: '下へ移動' })[0]).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '並び順を保存' }));

    // 釦の名前は aria-label で「並び順を保存」に固定され、表示の文字が処理中を示す
    const savingButton = screen.getByRole('button', { name: '並び順を保存' });
    await waitFor(() => {
      expect(savingButton).toHaveTextContent('保存中...');
    });
    expect(savingButton).toBeDisabled();
    for (const button of [
      ...screen.getAllByRole('button', { name: '上へ移動' }),
      ...screen.getAllByRole('button', { name: '下へ移動' }),
    ]) {
      expect(button).toBeDisabled();
    }

    resolveSave({
      ...statementDetail,
      updatedAt: '2026-01-15T11:00:00.000Z',
      items: [
        { ...statementDetail.items[1]!, displayOrder: 0 },
        { ...statementDetail.items[0]!, displayOrder: 1 },
        { ...statementDetail.items[2]!, displayOrder: 2 },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText('保存中...')).not.toBeInTheDocument();
    });
    expect(screen.getByText('並び順を保存しました')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '下へ移動' })[0]).toBeEnabled();
  });

  /**
   * 並び替えて未保存のまま画面内のリンクで離れようとすると確認のダイアログが出て、
   * 「このページにとどまる」で遷移が取り消され、「ページを離れる」で遷移が続くこと。
   * 未保存の並び順が無ければ確認なしで遷移すること（対照）。
   * @requirement itemized-statement-generation/REQ-17.12
   */
  it('並び替えの未保存の状態でページを離脱しようとすると確認ダイアログを表示する', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    await reorderFirstDown(user);

    await user.click(screen.getByRole('link', { name: '← プロジェクトに戻る' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('変更が保存されていません。ページを離れますか？');
    expect(router.state.location.pathname).toBe('/itemized-statements/statement-1');

    // とどまると遷移は取り消され、未保存の並び順も残る
    await user.click(within(dialog).getByRole('button', { name: 'このページにとどまる' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/itemized-statements/statement-1');
    expect(categoryOrder()).toEqual(['分類B', '分類A', '分類C']);

    // もう一度離れようとして「ページを離れる」を選ぶと遷移が続く
    await user.click(screen.getByRole('link', { name: '← プロジェクトに戻る' }));
    const again = await screen.findByRole('dialog');
    await user.click(within(again).getByRole('button', { name: 'ページを離れる' }));
    expect(await screen.findByText('プロジェクト詳細の画面')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/project-1');
  });

  it('並び替えていなければ確認ダイアログなしで離脱できる（対照）', async () => {
    const user = userEvent.setup();
    const router = renderPage();
    await screen.findByRole('table');

    await user.click(screen.getByRole('link', { name: '← プロジェクトに戻る' }));

    expect(await screen.findByText('プロジェクト詳細の画面')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/projects/project-1');
  });
});
