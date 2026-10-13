/**
 * @fileoverview BulkExportProgressDialog のテスト
 *
 * Task 11.4: エクスポート設定・進捗・中断UI
 *
 * Requirements:
 * - 15.8: 進捗状況（完了件数・総件数）の表示
 * - 15.9: 進行中エクスポート処理の中断
 * - 15.10: 部分失敗の表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { BulkExportProgressDialog } from './BulkExportProgressDialog';
import type { BulkExportOutcome } from './BulkExportProgressDialog';
import useMediaQuery from '../../hooks/useMediaQuery';

vi.mock('../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

describe('BulkExportProgressDialog', () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
  });

  it('open=false のとき何も描画しない', () => {
    render(
      <BulkExportProgressDialog
        open={false}
        progress={null}
        isRunning
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('progress=null のとき準備中メッセージを表示する', () => {
    render(
      <BulkExportProgressDialog
        open
        progress={null}
        isRunning
        onCancel={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('準備中…')).toBeInTheDocument();
  });

  describe('進捗表示 (Requirement 15.8)', () => {
    it('完了件数・総件数を表示する', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 3, total: 10, failed: 0 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('3 / 10 件')).toBeInTheDocument();
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '30');
    });
  });

  describe('部分失敗の表示 (Requirement 15.10)', () => {
    it('failed > 0 のとき失敗件数を表示する', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 5, total: 10, failed: 2 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText(/失敗 2 件/)).toBeInTheDocument();
    });

    it('failed = 0 のとき失敗件数を表示しない', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 5, total: 10, failed: 0 }}
          isRunning
          onCancel={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByText(/失敗/)).not.toBeInTheDocument();
    });
  });

  describe('中断操作 (Requirement 15.9)', () => {
    it('実行中は中断ボタンを表示し、押下で onCancel が呼ばれる', () => {
      const onCancel = vi.fn();
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 3, total: 10, failed: 0 }}
          isRunning
          onCancel={onCancel}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: '中断' }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('完了後(isRunning=false)は中断ボタンの代わりに閉じるボタンを表示し、押下で onClose が呼ばれる', () => {
      const onClose = vi.fn();
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 10, total: 10, failed: 0 }}
          isRunning={false}
          onCancel={vi.fn()}
          onClose={onClose}
        />
      );

      expect(screen.queryByRole('button', { name: '中断' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('中断の確定後（isRunning=false・結果なし）は継続と取りやめの選択を出さない', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 1, total: 3, failed: 0 }}
          isRunning={false}
          outcome={null}
          onCancel={vi.fn()}
          onClose={vi.fn()}
          onContinue={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog', { name: '一括エクスポート完了' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '成功した項目だけでダウンロードする' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ダウンロードしない' })).not.toBeInTheDocument();
    });
  });

  /**
   * タスク 23.4: 一部の写真項目が失敗したときに、失敗した項目を示し、成功した項目だけで
   * ダウンロードを続けるか、やめるかを利用者に選ばせる段。
   *
   * @requirement construction-photo/REQ-15.10
   */
  describe('一部失敗時の継続の選択 (Requirement 15.10)', () => {
    const longFileName = 'IMG_20261001_143052_foundation_rebar.jpg';
    const partialOutcome: BulkExportOutcome = {
      kind: 'partial',
      succeededCount: 2,
      failedItems: [{ id: 'photo-2', fileName: longFileName, position: 2 }],
    };
    const allFailedOutcome: BulkExportOutcome = {
      kind: 'allFailed',
      failedItems: [
        { id: 'photo-1', fileName: 'a.jpg', position: 1 },
        { id: 'photo-2', fileName: 'b.jpg', position: 2 },
      ],
    };

    const renderOutcome = (outcome: BulkExportOutcome) => {
      const onContinue = vi.fn();
      const onClose = vi.fn();
      const onCancel = vi.fn();
      const total =
        outcome.kind === 'partial'
          ? outcome.succeededCount + outcome.failedItems.length
          : outcome.failedItems.length;
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: total, total, failed: outcome.failedItems.length }}
          isRunning={false}
          outcome={outcome}
          onCancel={onCancel}
          onClose={onClose}
          onContinue={onContinue}
        />
      );
      return { onContinue, onClose, onCancel };
    };

    it('一部失敗では、失敗した写真項目のファイル名と順番・件数を示し、続ける・やめるの二つの操作を出す', () => {
      renderOutcome(partialOutcome);

      const dialog = screen.getByRole('dialog', {
        name: '一部の写真項目をエクスポートできませんでした',
      });
      expect(
        within(dialog).getByText('1件の写真項目の画像を取得または加工できませんでした。')
      ).toBeInTheDocument();
      const list = within(dialog).getByRole('list', { name: 'エクスポートに失敗した写真項目' });
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent(longFileName);
      expect(items[0]).toHaveTextContent('2番目');
      expect(
        within(dialog).getByText('成功した2件の写真項目だけでZIPをダウンロードしますか？')
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: '成功した項目だけでダウンロードする' })
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', { name: 'ダウンロードしない' })
      ).toBeInTheDocument();
      // 完了後の「閉じる」と実行中の「中断」は出さない
      expect(within(dialog).queryByRole('button', { name: '閉じる' })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: '中断' })).not.toBeInTheDocument();
    });

    it('「成功した項目だけでダウンロードする」で onContinue だけが呼ばれる', () => {
      const { onContinue, onClose, onCancel } = renderOutcome(partialOutcome);

      fireEvent.click(screen.getByRole('button', { name: '成功した項目だけでダウンロードする' }));

      expect(onContinue).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('「ダウンロードしない」で onClose だけが呼ばれる', () => {
      const { onContinue, onClose } = renderOutcome(partialOutcome);

      fireEvent.click(screen.getByRole('button', { name: 'ダウンロードしない' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onContinue).not.toHaveBeenCalled();
    });

    it('選択の段で Escape を押すと、やめる（onClose）として扱い、続けない', () => {
      const { onContinue, onClose } = renderOutcome(partialOutcome);

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onContinue).not.toHaveBeenCalled();
    });

    it('選択の段が出たら、フォーカスを段の見出しへ移す', () => {
      renderOutcome(partialOutcome);

      expect(
        screen.getByRole('heading', { name: '一部の写真項目をエクスポートできませんでした' })
      ).toHaveFocus();
    });

    it('Tab と Shift+Tab のフォーカスはダイアログの中で循環する', () => {
      renderOutcome(partialOutcome);
      const dialog = screen.getByRole('dialog');
      const failedList = within(dialog).getByRole('list', {
        name: 'エクスポートに失敗した写真項目',
      });
      const stop = within(dialog).getByRole('button', { name: 'ダウンロードしない' });
      const proceed = within(dialog).getByRole('button', {
        name: '成功した項目だけでダウンロードする',
      });

      // 最後の操作から Tab で先頭（スクロールできる失敗の一覧）へ戻る
      proceed.focus();
      fireEvent.keyDown(proceed, { key: 'Tab' });
      expect(failedList).toHaveFocus();

      // 先頭から Shift+Tab で最後へ回る
      fireEvent.keyDown(failedList, { key: 'Tab', shiftKey: true });
      expect(proceed).toHaveFocus();

      // 見出し（tabIndex=-1）から Shift+Tab でも最後へ回る
      const heading = within(dialog).getByRole('heading');
      heading.focus();
      fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true });
      expect(proceed).toHaveFocus();
      expect(stop).not.toHaveFocus();
    });

    it('全件失敗では、失敗した写真項目を示し、続ける操作を出さず「閉じる」だけを出す', () => {
      const { onClose, onContinue } = renderOutcome(allFailedOutcome);

      const dialog = screen.getByRole('dialog', {
        name: '写真項目をエクスポートできませんでした',
      });
      expect(
        within(dialog).getByText(
          'すべての写真項目（2件）の画像を取得または加工できませんでした。ZIPはダウンロードしていません。'
        )
      ).toBeInTheDocument();
      const items = within(
        within(dialog).getByRole('list', { name: 'エクスポートに失敗した写真項目' })
      ).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('a.jpg');
      expect(items[1]).toHaveTextContent('b.jpg');
      expect(
        within(dialog).queryByRole('button', { name: '成功した項目だけでダウンロードする' })
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'ダウンロードしない' })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: '写真項目をエクスポートできませんでした' })
      ).toHaveFocus();

      fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onContinue).not.toHaveBeenCalled();
    });

    it('全件成功（結果なし）では選択の段を出さない', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 2, total: 2, failed: 0 }}
          isRunning={false}
          outcome={null}
          onCancel={vi.fn()}
          onClose={vi.fn()}
          onContinue={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog', { name: '一括エクスポート完了' })).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
    });

    it('実行中は結果があっても選択の段を出さない（中断の操作を保つ）', () => {
      render(
        <BulkExportProgressDialog
          open
          progress={{ completed: 1, total: 3, failed: 1 }}
          isRunning
          outcome={partialOutcome}
          onCancel={vi.fn()}
          onClose={vi.fn()}
          onContinue={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: '中断' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ダウンロードしない' })).not.toBeInTheDocument();
    });

    it('失敗の一覧は長いファイル名を語の途中でも折り返し、一覧の中でスクロールする', () => {
      renderOutcome(partialOutcome);

      const failedList = screen.getByRole('list', { name: 'エクスポートに失敗した写真項目' });
      expect(failedList).toHaveAttribute('tabindex', '0');
      expect(failedList.style.overflowY).toBe('auto');
      expect(failedList.style.maxHeight).not.toBe('');
      const fileName = within(failedList).getByText(longFileName);
      expect(fileName.style.overflowWrap).toBe('anywhere');
    });

    it('モバイル幅では二つの操作ボタンが 44×44 以上のタップ領域を持ち、折り返せる', () => {
      vi.mocked(useMediaQuery).mockReturnValue(true);
      renderOutcome(partialOutcome);

      for (const name of ['ダウンロードしない', '成功した項目だけでダウンロードする']) {
        const button = screen.getByRole('button', { name });
        expect(button.style.minHeight).toBe('44px');
        expect(button.style.minWidth).toBe('44px');
        expect(button.style.overflowWrap).toBe('anywhere');
      }
      const footer = screen.getByRole('button', { name: 'ダウンロードしない' }).parentElement!;
      expect(footer.style.flexWrap).toBe('wrap');
    });
  });
});
