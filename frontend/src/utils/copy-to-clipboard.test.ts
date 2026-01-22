/**
 * @fileoverview クリップボードコピーユーティリティ 単体テスト
 *
 * Task 15.1, 16.2: クリップボードコピー機能のテスト
 *
 * Requirements:
 * - 14.2: タブ区切り形式でコピー
 * - 14.3: ヘッダー行を含む
 * - 14.4: 各行はタブ文字で区切り、行末は改行文字
 * - 14.7: コピー失敗時はエラーを返却
 * - 14.8: 数量は小数点以下2桁の文字列
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ItemizedStatementItemInfo } from '../types/itemized-statement.types';

// テストデータ
const mockItems: ItemizedStatementItemInfo[] = [
  {
    id: '1',
    customCategory: 'カテゴリA',
    workType: '工種1',
    name: '品目1',
    specification: '規格A',
    unit: 'm',
    quantity: 123.45,
  },
  {
    id: '2',
    customCategory: null,
    workType: '工種2',
    name: '品目2',
    specification: null,
    unit: 'm2',
    quantity: 0.5,
  },
  {
    id: '3',
    customCategory: 'カテゴリB',
    workType: null,
    name: null,
    specification: '規格B',
    unit: null,
    quantity: 1000,
  },
];

// テストスイート
describe('copy-to-clipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clipboard APIのモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatItemsForClipboard', () => {
    it('項目をタブ区切りテキストに変換する (Req 14.2)', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const text = formatItemsForClipboard(mockItems);

      // タブで区切られていることを確認
      const lines = text.split('\n');
      expect(lines.length).toBeGreaterThan(0);
      // 各行がタブを含むことを確認
      lines.forEach((line) => {
        if (line.trim() !== '') {
          expect(line).toContain('\t');
        }
      });
    });

    it('ヘッダー行を含む (Req 14.3)', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const text = formatItemsForClipboard(mockItems);
      const lines = text.split('\n');

      expect(lines[0]).toBe('任意分類\t工種\t名称\t規格\t数量\t単位');
    });

    it('各行はタブ文字で区切り、行末は改行文字で終端する (Req 14.4)', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const text = formatItemsForClipboard(mockItems);
      const lines = text.split('\n');

      // ヘッダー行
      expect(lines[0]).toBe('任意分類\t工種\t名称\t規格\t数量\t単位');

      // データ行（1行目）
      expect(lines[1]).toBe('カテゴリA\t工種1\t品目1\t規格A\t123.45\tm');

      // 最終行の後に改行がある（行末が改行で終端）
      expect(text.endsWith('\n')).toBe(true);
    });

    it('null値を空文字に変換する', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const text = formatItemsForClipboard(mockItems);
      const lines = text.split('\n');

      // 2番目のデータ（null値を含む）
      expect(lines[2]).toBe('\t工種2\t品目2\t\t0.50\tm2');

      // 3番目のデータ（複数のnull値）
      expect(lines[3]).toBe('カテゴリB\t\t\t規格B\t1000.00\t');
    });

    it('数量を小数点以下2桁の文字列として出力する (Req 14.8)', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const itemsWithPrecision: ItemizedStatementItemInfo[] = [
        {
          id: '1',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: 0.01,
        },
        {
          id: '2',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: 999999.99,
        },
        {
          id: '3',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: -123.45,
        },
        {
          id: '4',
          customCategory: null,
          workType: null,
          name: null,
          specification: null,
          unit: null,
          quantity: 5, // 整数の場合
        },
      ];

      const text = formatItemsForClipboard(itemsWithPrecision);
      const lines = text.split('\n');

      // 各行の数量が小数点以下2桁の文字列であることを確認
      expect(lines[1]).toContain('0.01');
      expect(lines[2]).toContain('999999.99');
      expect(lines[3]).toContain('-123.45');
      expect(lines[4]).toContain('5.00'); // 整数も2桁で埋められる
    });

    it('空配列を処理できる', async () => {
      const { formatItemsForClipboard } = await import('./copy-to-clipboard');

      const text = formatItemsForClipboard([]);

      // ヘッダー行のみ
      expect(text).toBe('任意分類\t工種\t名称\t規格\t数量\t単位\n');
    });
  });

  describe('copyToClipboard', () => {
    it('クリップボードにコピー成功時はsuccessを返す', async () => {
      const { copyToClipboard } = await import('./copy-to-clipboard');

      const result = await copyToClipboard({ items: mockItems });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    it('正しいテキストがクリップボードにコピーされる', async () => {
      const { copyToClipboard, formatItemsForClipboard } = await import('./copy-to-clipboard');

      await copyToClipboard({ items: mockItems });

      const expectedText = formatItemsForClipboard(mockItems);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedText);
    });

    it('空配列でも正常に動作する', async () => {
      const { copyToClipboard } = await import('./copy-to-clipboard');

      const result = await copyToClipboard({ items: [] });

      expect(result.success).toBe(true);
    });

    it('Clipboard APIでエラーが発生した場合はエラーを返す (Req 14.7)', async () => {
      const { copyToClipboard } = await import('./copy-to-clipboard');

      // writeTextでエラーをスロー
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const result = await copyToClipboard({ items: mockItems });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('未知のエラーも適切にハンドリングする', async () => {
      const { copyToClipboard } = await import('./copy-to-clipboard');

      // 非Errorオブジェクトをスロー
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce('unknown error');

      const result = await copyToClipboard({ items: mockItems });

      expect(result.success).toBe(false);
      expect(result.error).toBe('クリップボードへのコピーに失敗しました');
    });

    it('Clipboard APIが利用不可の場合はエラーを返す', async () => {
      const { copyToClipboard } = await import('./copy-to-clipboard');

      // navigator.clipboardをundefinedに設定
      Object.assign(navigator, {
        clipboard: undefined,
      });

      const result = await copyToClipboard({ items: mockItems });

      expect(result.success).toBe(false);
      expect(result.error).toBe('クリップボードAPIが利用できません');
    });
  });
});
