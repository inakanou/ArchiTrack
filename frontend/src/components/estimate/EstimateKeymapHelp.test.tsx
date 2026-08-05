/**
 * @fileoverview EstimateKeymapHelp のテスト（キー割当一覧の表示）
 *
 * Task 54.7: キー割当一覧の表示
 *
 * 一覧の期待値は**すべて `ESTIMATE_KEYMAP.entries`（単一定義）から組み立てる**。
 * 期待値をこのファイルへ書き写すと、定義が変わったときに一覧の表示が古いままでも
 * テストが緑のままになり、47.3 の「割り当て一覧を参照可能」が実態と乖離する。
 * キーの表記も定義の `key` / `modifiers` からテスト側で独立に組み立て、
 * コンポーネントの整形関数には依存しない。
 *
 * Requirements (estimate-creation):
 * - 47.3: キーボード操作の割り当て一覧を画面上で参照可能とする
 *
 * Design: design.md `EstimateKeymapHelp.tsx  # 新規: キー割当一覧`（:3727）、
 * `##### estimateKeymap`（:4086-4120）
 * 「確定値は本設計の実装時に `entries` として固定し、`EstimateKeymapHelp` が
 * 同じ定義を表示する（47.3）」
 *
 * @module components/estimate/EstimateKeymapHelp.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EstimateKeymapHelp } from './EstimateKeymapHelp';
import { ESTIMATE_KEYMAP } from '../../domain/estimate/estimateKeymap';
import type { KeymapEntry, KeymapModifier } from '../../domain/estimate/estimateKeymap';

// ============================================================================
// 期待値の組み立て（定義からテスト側で独立に導出する）
// ============================================================================

const MODIFIER_TEXT: Record<KeymapModifier, string> = {
  ctrl: 'Ctrl',
  meta: '⌘',
  alt: 'Alt',
  shift: 'Shift',
};

/** 表記の並び順（押す順に近い並び） */
const MODIFIER_SEQUENCE: readonly KeymapModifier[] = ['ctrl', 'meta', 'alt', 'shift'];

const KEY_TEXT: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
};

/** 割当1件のキー表記（例: `Alt+Shift+→`） */
const expectedKeyText = (entry: KeymapEntry): string => {
  const modifiers = MODIFIER_SEQUENCE.filter((modifier) => entry.modifiers.includes(modifier)).map(
    (modifier) => MODIFIER_TEXT[modifier]
  );
  const key = KEY_TEXT[entry.key] ?? (entry.key.length === 1 ? entry.key.toUpperCase() : entry.key);
  return [...modifiers, key].join('+');
};

// ============================================================================
// 補助
// ============================================================================

const HELP_BUTTON_NAME = 'キーボード操作の一覧';
const HELP_DIALOG_NAME = 'キーボード操作の割り当て一覧';

const openHelp = async (user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> => {
  await user.click(screen.getByRole('button', { name: HELP_BUTTON_NAME }));
  return screen.getByRole('dialog', { name: HELP_DIALOG_NAME });
};

/** 一覧の各行を「キー表記 → 行の全文」の対応にする（見出し行は除く） */
const readRows = (dialog: HTMLElement): Map<string, string> => {
  const rows = within(dialog)
    .getAllByRole('row')
    .filter((row) => within(row).queryAllByRole('cell').length > 0);
  const result = new Map<string, string>();
  for (const row of rows) {
    const cells = within(row).getAllByRole('cell');
    const keyText = (cells[0]?.textContent ?? '').trim();
    result.set(keyText, (row.textContent ?? '').trim());
  }
  return result;
};

/** 指定のキー表記の行（無ければ失敗する） */
const rowOf = (dialog: HTMLElement, keyText: string): HTMLElement => {
  const row = within(dialog)
    .getAllByRole('row')
    .find((candidate) => {
      const cells = within(candidate).queryAllByRole('cell');
      return (cells[0]?.textContent ?? '').trim() === keyText;
    });
  expect(row, `キー表記「${keyText}」の行が見つからない`).toBeDefined();
  return row as HTMLElement;
};

// ============================================================================
// テスト
// ============================================================================

describe('EstimateKeymapHelp キー割当一覧の表示 (47.3)', () => {
  /** @requirement estimate-creation/REQ-47.3 */
  it('画面には入口だけが出ており、一覧は開くまで表示されないこと', () => {
    render(<EstimateKeymapHelp />);

    expect(screen.getByRole('button', { name: HELP_BUTTON_NAME })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: HELP_DIALOG_NAME })).not.toBeInTheDocument();
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('入口から一覧を開くと、定義されたすべての割当が過不足なく並ぶこと', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);
    const rows = readRows(dialog);

    // 定義の件数と表示の件数が一致する（表示漏れも余分な行も許さない）
    expect(rows.size).toBe(ESTIMATE_KEYMAP.entries.length);

    for (const entry of ESTIMATE_KEYMAP.entries) {
      const keyText = expectedKeyText(entry);
      const rowText = rows.get(keyText);
      expect(rowText, `割当 ${entry.command} (${keyText}) が一覧に無い`).toBeDefined();

      // 説明は定義の `label` から取る（行の説明が label に含まれない＝別出典）
      const description = (rowText ?? '').replace(keyText, '').trim();
      expect(description.length).toBeGreaterThan(0);
      const labelBody = entry.label.includes(': ')
        ? entry.label.slice(entry.label.indexOf(': ') + 2)
        : entry.label;
      expect(
        description.includes(labelBody),
        `割当 ${entry.command} の説明「${description}」が定義の label「${entry.label}」に由来しない`
      ).toBe(true);
    }
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('行操作・階層操作・表示切替の代表的な割当が読める形で並ぶこと', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);

    expect(rowOf(dialog, 'Alt+Insert')).toHaveTextContent('選択行の直後に行を挿入');
    expect(rowOf(dialog, 'Alt+Delete')).toHaveTextContent('削除');
    expect(rowOf(dialog, 'Alt+C')).toHaveTextContent('複写');
    expect(rowOf(dialog, 'Shift+↓')).toHaveTextContent('範囲選択');
    expect(rowOf(dialog, 'Esc')).toHaveTextContent('解除');
    expect(rowOf(dialog, 'Alt+Shift+→')).toHaveTextContent('階層を1段下げる');
    expect(rowOf(dialog, 'Alt+↑')).toHaveTextContent('一つ上の階層へ戻る');
    expect(rowOf(dialog, 'Alt+M')).toHaveTextContent('切り替え');
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('割当が使える場面を定義の contexts どおりに示すこと', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);

    // 行挿入は行選択中・範囲選択中のみ（セル入力中は文字編集を優先する / 47.5）
    const insertRow = rowOf(dialog, 'Alt+Insert');
    expect(insertRow).toHaveTextContent('行選択中');
    expect(insertRow).toHaveTextContent('範囲選択中');
    expect(insertRow).not.toHaveTextContent('セル入力中');

    // 選択解除はセル入力中でも使える
    expect(rowOf(dialog, 'Esc')).toHaveTextContent('セル入力中');
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('閉じる操作で一覧を閉じ、もう一度開き直せること', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    const dialog = await openHelp(user);
    await user.click(within(dialog).getByRole('button', { name: '閉じる' }));

    expect(screen.queryByRole('dialog', { name: HELP_DIALOG_NAME })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: HELP_BUTTON_NAME })).toBeInTheDocument();

    const reopened = await openHelp(user);
    expect(readRows(reopened).size).toBe(ESTIMATE_KEYMAP.entries.length);
  });

  /** @requirement estimate-creation/REQ-47.3 */
  it('Esc キーで一覧を閉じられること', async () => {
    const user = userEvent.setup();
    render(<EstimateKeymapHelp />);

    await openHelp(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: HELP_DIALOG_NAME })).not.toBeInTheDocument();
  });
});
