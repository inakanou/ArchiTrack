/**
 * @fileoverview 項目コピー・移動ダイアログのテスト
 *
 * Task 5.4: 数量項目のコピー・移動UIを実装する（TDDテストファースト）
 *
 * Requirements:
 * - 6.1: 選択した数量項目をコピーする
 * - 6.2: 選択した数量項目を別のグループへ移動する
 * - 6.4: 複数項目の一括コピー/移動をサポートする
 *
 * 受入基準 6.3（同一数量グループ内の指定位置への移動）は本ファイルでは検証しない。
 * このダイアログは移動先のグループを選ぶ部品で、移動モードでは現在のグループを選べない。
 * 同一グループ内の位置の移動はアクションメニューの「上へ移動」「下へ移動」が担い、
 * e2e/specs/quantity-tables/quantity-item-action-menu.spec.ts が並びの入れ替わりを主張する。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemCopyMoveDialog from './ItemCopyMoveDialog';
import type { QuantityGroupDetail } from '../../types/quantity-table.types';

// テストデータ
const mockGroups: QuantityGroupDetail[] = [
  {
    id: 'group-1',
    quantityTableId: 'qt-123',
    name: 'グループ1',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 0,
    itemCount: 2,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'group-2',
    quantityTableId: 'qt-123',
    name: 'グループ2',
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 1,
    itemCount: 1,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'group-3',
    quantityTableId: 'qt-123',
    name: null, // 名前なし
    surveyImageId: null,
    surveyImage: null,
    displayOrder: 2,
    itemCount: 0,
    items: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

describe('ItemCopyMoveDialog', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ====================================================================
  // Task 5.4: 数量項目のコピー・移動UIを実装する
  // ====================================================================

  describe('Task 5.4: 項目コピー・移動ダイアログ', () => {
    describe('ダイアログ表示', () => {
      it('isOpen=trueでダイアログが表示される', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      it('isOpen=falseでダイアログが非表示', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={false}
            mode="copy"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('コピーモードのタイトルが表示される', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1', 'item-2']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByText(/2件の項目をコピー/)).toBeInTheDocument();
      });

      it('移動モードのタイトルが表示される', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="move"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByText(/1件の項目を移動/)).toBeInTheDocument();
      });
    });

    describe('移動先のグループ選択（移動モードは現在のグループを選べない）', () => {
      it('同一数量表内のグループが選択肢として表示される', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="move"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByText('グループ1')).toBeInTheDocument();
        expect(screen.getByText('グループ2')).toBeInTheDocument();
        expect(screen.getByText(/グループ 3/)).toBeInTheDocument(); // 名前なしはデフォルト表示
      });

      it('移動モードでは現在のグループは選択不可', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="move"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        const group1Option = screen.getByRole('radio', { name: /グループ1/ });
        expect(group1Option).toBeDisabled();
      });

      it('コピーモードでは全グループが選択可能', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        const group1Option = screen.getByRole('radio', { name: /グループ1/ });
        expect(group1Option).not.toBeDisabled();
      });
    });

    describe('REQ 6.1, 6.2: 確定と実行', () => {
      it('グループを選択して確定ボタンをクリックするとonConfirmが呼ばれる', async () => {
        const onConfirm = vi.fn();
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1', 'item-2']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={onConfirm}
            onClose={vi.fn()}
          />
        );

        // グループ2を選択
        await userEvent.click(screen.getByRole('radio', { name: /グループ2/ }));

        // 確定ボタンをクリック
        await userEvent.click(screen.getByRole('button', { name: /コピー|確定/ }));

        expect(onConfirm).toHaveBeenCalledWith('group-2', ['item-1', 'item-2']);
      });

      it('グループ未選択では確定ボタンが無効', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="move"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByRole('button', { name: /移動|確定/ })).toBeDisabled();
      });
    });

    describe('キャンセル', () => {
      it('キャンセルボタンをクリックするとonCloseが呼ばれる', async () => {
        const onClose = vi.fn();
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={onClose}
          />
        );

        await userEvent.click(screen.getByRole('button', { name: /キャンセル/ }));

        expect(onClose).toHaveBeenCalled();
      });
    });

    describe('REQ 6.4: 複数項目の一括操作', () => {
      it('選択された項目数が表示される', () => {
        render(
          <ItemCopyMoveDialog
            isOpen={true}
            mode="copy"
            selectedItemIds={['item-1', 'item-2', 'item-3']}
            groups={mockGroups}
            currentGroupId="group-1"
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />
        );

        expect(screen.getByText(/3件/)).toBeInTheDocument();
      });
    });
  });
});
