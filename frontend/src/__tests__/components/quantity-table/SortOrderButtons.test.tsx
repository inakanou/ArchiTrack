/**
 * @fileoverview SortOrderButtonsコンポーネントの単体テスト
 *
 * Task 36.2: SortOrderButtonsコンポーネントの単体テストを実装する
 *
 * Requirements:
 * - 23.3, 23.4, 23.5, 23.6, 23.8: 数量グループの並び順制御
 * - 24.3, 24.4, 24.5, 24.6, 24.8: 数量項目の並び順制御
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SortOrderButtons from '../../../components/quantity-table/SortOrderButtons';

describe('SortOrderButtons', () => {
  it('上へ移動ボタンと下へ移動ボタンが表示される', () => {
    render(
      <SortOrderButtons currentIndex={1} totalCount={3} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeInTheDocument();
  });

  it('currentIndex=0の場合に上へ移動ボタンがdisabledである', () => {
    render(
      <SortOrderButtons currentIndex={0} totalCount={3} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).not.toBeDisabled();
  });

  it('currentIndex=totalCount-1の場合に下へ移動ボタンがdisabledである', () => {
    render(
      <SortOrderButtons currentIndex={2} totalCount={3} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });

  it('totalCount=1の場合に両ボタンがdisabledである', () => {
    render(
      <SortOrderButtons currentIndex={0} totalCount={1} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });

  it('totalCount=0の場合に両ボタンがdisabledである', () => {
    render(
      <SortOrderButtons currentIndex={0} totalCount={0} onMoveUp={vi.fn()} onMoveDown={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });

  it('上へ移動ボタンクリック時にonMoveUpコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    render(
      <SortOrderButtons currentIndex={1} totalCount={3} onMoveUp={onMoveUp} onMoveDown={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /上へ移動/i }));
    expect(onMoveUp).toHaveBeenCalledTimes(1);
  });

  it('下へ移動ボタンクリック時にonMoveDownコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const onMoveDown = vi.fn();
    render(
      <SortOrderButtons
        currentIndex={1}
        totalCount={3}
        onMoveUp={vi.fn()}
        onMoveDown={onMoveDown}
      />
    );

    await user.click(screen.getByRole('button', { name: /下へ移動/i }));
    expect(onMoveDown).toHaveBeenCalledTimes(1);
  });

  it('disabledなボタンクリック時にコールバックが呼ばれない', async () => {
    const user = userEvent.setup();
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    render(
      <SortOrderButtons
        currentIndex={0}
        totalCount={1}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    );

    await user.click(screen.getByRole('button', { name: /上へ移動/i }));
    await user.click(screen.getByRole('button', { name: /下へ移動/i }));
    expect(onMoveUp).not.toHaveBeenCalled();
    expect(onMoveDown).not.toHaveBeenCalled();
  });

  it('disabled propsで全体的に操作不可になる', () => {
    render(
      <SortOrderButtons
        currentIndex={1}
        totalCount={3}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        disabled={true}
      />
    );

    expect(screen.getByRole('button', { name: /上へ移動/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /下へ移動/i })).toBeDisabled();
  });
});
