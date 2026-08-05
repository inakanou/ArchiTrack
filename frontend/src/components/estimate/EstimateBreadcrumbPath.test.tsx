/**
 * @fileoverview EstimateBreadcrumbPath の単体テスト（Task 54.3）
 *
 * ドリルダウン表示の現在階層をルートからの経路として表示し、経路上の各階層へ
 * 戻る操作を提供することを検証します（45.7）。
 *
 * Requirements (estimate-creation):
 * - 45.7: 現在の階層の位置をルートからの経路として表示し、経路上の各階層へ戻る操作を提供する
 *
 * Design: design.md `EstimateBreadcrumbPath.tsx  # 新規: ドリルダウン時の現在階層経路`
 *
 * @module components/estimate/EstimateBreadcrumbPath.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateBreadcrumbPath, ESTIMATE_ROOT_LEVEL_LABEL } from './EstimateBreadcrumbPath';
import type { EstimateBreadcrumbSegment } from './EstimateBreadcrumbPath';

const segments = (): EstimateBreadcrumbSegment[] => [
  { key: null, label: ESTIMATE_ROOT_LEVEL_LABEL },
  { key: 'root-1', label: '建築工事' },
  { key: 'child-1', label: '直接仮設工事' },
];

const nav = (): HTMLElement => screen.getByRole('navigation', { name: '明細の階層経路' });

describe('estimate-creation/REQ-45.7: EstimateBreadcrumbPath', () => {
  it('経路をルートから現在階層の順に一覧として描画すること', () => {
    render(<EstimateBreadcrumbPath segments={segments()} onNavigate={vi.fn()} />);

    expect(
      within(nav())
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['全体', '建築工事', '直接仮設工事']);
  });

  it('末尾（現在階層）以外を戻る操作として描画すること', () => {
    render(<EstimateBreadcrumbPath segments={segments()} onNavigate={vi.fn()} />);

    expect(
      within(nav())
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['全体', '建築工事']);
  });

  it('現在階層に aria-current を付与すること', () => {
    render(<EstimateBreadcrumbPath segments={segments()} onNavigate={vi.fn()} />);

    expect(within(nav()).getByText('直接仮設工事')).toHaveAttribute('aria-current', 'true');
  });

  it('戻る操作のクリックで対象階層のキーを通知すること', async () => {
    const onNavigate = vi.fn();
    render(<EstimateBreadcrumbPath segments={segments()} onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: '建築工事' }));
    expect(onNavigate).toHaveBeenCalledWith('root-1');

    await userEvent.click(screen.getByRole('button', { name: '全体' }));
    expect(onNavigate).toHaveBeenLastCalledWith(null);
  });

  it('経路が1段（ルート階層のみ）の場合は戻る操作を持たないこと', () => {
    render(
      <EstimateBreadcrumbPath
        segments={[{ key: null, label: ESTIMATE_ROOT_LEVEL_LABEL }]}
        onNavigate={vi.fn()}
      />
    );

    expect(within(nav()).queryAllByRole('button')).toHaveLength(0);
    expect(within(nav()).getByText('全体')).toHaveAttribute('aria-current', 'true');
  });

  it('経路が空の場合は何も描画しないこと', () => {
    const { container } = render(<EstimateBreadcrumbPath segments={[]} onNavigate={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
