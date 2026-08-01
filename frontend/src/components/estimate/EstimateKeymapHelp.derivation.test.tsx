/**
 * @fileoverview EstimateKeymapHelp が一覧を「定義から生成」していることの検証
 *
 * Task 54.7: キー割当一覧の表示
 *
 * `EstimateKeymapHelp.test.tsx` は本物の定義に対して一覧の内容を突き合わせるが、
 * それだけでは「今の定義と同じ内容を画面へ書き写した実装」も緑になる。
 * ここではキー割当の定義そのものを差し替え、一覧が**差し替えた定義のとおりに
 * 変わる**ことと、**書き写された内容が残らない**ことを確かめる。
 * これにより定義と表示の乖離（47.3）が構造的に起こり得ないことを固定する。
 *
 * Requirements (estimate-creation):
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする
 *
 * Design: design.md `##### estimateKeymap`（:4086-4120）
 * 「確定値は本設計の実装時に `entries` として固定し、`EstimateKeymapHelp` が
 * 同じ定義を表示する（47.3）」
 *
 * @module components/estimate/EstimateKeymapHelp.derivation.test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateKeymapHelp } from './EstimateKeymapHelp';

/**
 * 差し替え用の架空の割当（本物の定義には存在しない組み合わせ）
 *
 * `vi.mock` の factory はファイル先頭へ巻き上げられるため `vi.hoisted` で用意する。
 */
const FAKE_ENTRIES = vi.hoisted(
  () =>
    [
      {
        command: 'insertRow',
        key: 'F9',
        modifiers: ['ctrl', 'shift'],
        contexts: ['rowSelected'],
        label: 'Ctrl+Shift+F9: 架空の操作アルファ',
      },
      {
        command: 'clearSelection',
        key: 'q',
        modifiers: ['meta'],
        contexts: ['cellEditing', 'hierarchyPanel'],
        label: '⌘Q: 架空の操作ベータ',
      },
    ] as const
);

vi.mock('../../domain/estimate/estimateKeymap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/estimate/estimateKeymap')>();
  return {
    ...actual,
    ESTIMATE_KEYMAP: {
      entries: FAKE_ENTRIES,
      resolve: actual.ESTIMATE_KEYMAP.resolve,
    },
  };
});

const openHelp = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: 'キーボード操作の一覧' }));
  return screen.getByRole('dialog', { name: 'キーボード操作の割り当て一覧' });
};

describe('EstimateKeymapHelp は一覧をキー割当の定義から生成する (47.3)', () => {
  /** @requirement estimate-creation/REQ-47.3 */
  it('定義を差し替えると一覧の内容も差し替わり、元の割当は残らないこと', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);
    const rows = within(dialog)
      .getAllByRole('row')
      .filter((row) => within(row).queryAllByRole('cell').length > 0);

    // 差し替えた定義のとおりに並ぶ
    expect(rows).toHaveLength(FAKE_ENTRIES.length);
    expect(dialog).toHaveTextContent('Ctrl+Shift+F9');
    expect(dialog).toHaveTextContent('架空の操作アルファ');
    expect(dialog).toHaveTextContent('⌘+Q');
    expect(dialog).toHaveTextContent('架空の操作ベータ');

    // 本物の定義の内容を画面へ書き写していない
    expect(dialog).not.toHaveTextContent('Alt+Insert');
    expect(dialog).not.toHaveTextContent('選択行の直後に行を挿入');
    expect(dialog).not.toHaveTextContent('Alt+M');
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('使える場面も差し替えた定義の contexts から生成すること', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);
    const rows = within(dialog)
      .getAllByRole('row')
      .filter((row) => within(row).queryAllByRole('cell').length > 0);

    const [alpha, beta] = rows;
    expect(alpha).toHaveTextContent('行選択中');
    expect(alpha).not.toHaveTextContent('セル入力中');
    expect(beta).toHaveTextContent('セル入力中');
    expect(beta).toHaveTextContent('階層構造パネル');
    expect(beta).not.toHaveTextContent('行選択中');
  });
});
