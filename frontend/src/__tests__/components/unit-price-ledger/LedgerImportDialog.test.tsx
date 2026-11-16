/**
 * @fileoverview 見積カードの取り込みの画面の単体テスト（unit-price-ledger タスク4.3）
 *
 * @requirement unit-price-ledger/REQ-2.1 zip または複数の JSON の見積カードを選んで取り込む
 * @requirement unit-price-ledger/REQ-2.15 登録・飛ばし（カードの ID）・失敗（理由）・参考の印の件数の表示
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LedgerImportDialog from '../../../components/unit-price-ledger/LedgerImportDialog';
import { unitPriceLedgerApi, type LedgerImportResult } from '../../../api/unit-price-ledger';
import { ApiError } from '../../../api/client';

const MB = 1024 * 1024;

const jsonFile = (name: string, size?: number): File => {
  const file = new File(['{}'], name, { type: 'application/json' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
};

const zipFile = (name: string, size?: number): File => {
  const file = new File(['PK'], name, { type: 'application/zip' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
};

const RESULT: LedgerImportResult = {
  importedCount: 3,
  skipped: [{ cardId: 'card-001' }, { cardId: 'card-002' }],
  failed: [{ fileName: 'broken.json', reason: 'JSON として読めません' }],
  truncated: [{ cardId: 'card-010', fields: ['見積全体の条件', '1 行目の名称'] }],
  referenceMarkedCount: 1,
};

const renderDialog = (props: Partial<Parameters<typeof LedgerImportDialog>[0]> = {}) => {
  const onClose = vi.fn();
  const onImported = vi.fn();
  render(<LedgerImportDialog open onClose={onClose} onImported={onImported} {...props} />);
  return { onClose, onImported };
};

describe('LedgerImportDialog', () => {
  let importCards: MockInstance<typeof unitPriceLedgerApi.importCards>;

  beforeEach(() => {
    importCards = vi.spyOn(unitPriceLedgerApi, 'importCards');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('閉じているときは何も出さない', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('見出しで名付けたダイアログに、zip と JSON を複数選べるファイルの欄を出す', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: '見積カードの取り込み' });
    const input = within(dialog).getByLabelText('取り込むファイル');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('multiple');
    expect(input.getAttribute('accept')).toContain('.zip');
    expect(input.getAttribute('accept')).toContain('.json');
    // ファイルを選ぶまで取り込めない
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
  });

  it('選んだ zip と JSON のファイルを、選んだ順に送る', async () => {
    const user = userEvent.setup();
    importCards.mockResolvedValue(RESULT);
    renderDialog();

    const files = [zipFile('cards.zip'), jsonFile('a.json'), jsonFile('b.json')];
    await user.upload(screen.getByLabelText('取り込むファイル'), files);

    expect(screen.getByText('3 個のファイルを選びました')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: '選んだファイル' });
    expect(within(list).getByText('cards.zip')).toBeInTheDocument();
    expect(within(list).getByText('a.json')).toBeInTheDocument();
    expect(within(list).getByText('b.json')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取り込む' }));

    expect(importCards).toHaveBeenCalledTimes(1);
    expect(importCards.mock.calls[0]?.[0].map((f) => f.name)).toEqual([
      'cards.zip',
      'a.json',
      'b.json',
    ]);
  });

  it('送っている間は「取り込み中」を出し、操作と Escape での閉じを止める', async () => {
    const user = userEvent.setup();
    let resolve: (value: LedgerImportResult) => void = () => undefined;
    importCards.mockReturnValue(
      new Promise<LedgerImportResult>((r) => {
        resolve = r;
      })
    );
    const { onClose } = renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));

    expect(screen.getByRole('status')).toHaveTextContent('取り込み中…');
    expect(screen.getByRole('button', { name: '取り込み中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(screen.getByLabelText('取り込むファイル')).toBeDisabled();

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    resolve(RESULT);
    expect(await screen.findByRole('heading', { name: '取り込みの結果' })).toBeInTheDocument();
  });

  it('取り込みの結果の件数と内訳を出し、結果を親へ渡す', async () => {
    const user = userEvent.setup();
    importCards.mockResolvedValue(RESULT);
    const { onImported } = renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [zipFile('cards.zip')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));

    const result = await screen.findByRole('region', { name: '取り込みの結果' });
    expect(within(result).getByText('登録した件数：3 件')).toBeInTheDocument();
    expect(within(result).getByText('飛ばした件数：2 件')).toBeInTheDocument();
    expect(within(result).getByText('登録できなかった件数：1 件')).toBeInTheDocument();
    expect(within(result).getByText('切り詰めた件数：1 件')).toBeInTheDocument();
    expect(within(result).getByText('参考の印を付けた件数：1 件')).toBeInTheDocument();

    // 飛ばしたカードの ID と、飛ばした訳
    const skipped = within(result).getByRole('list', { name: '飛ばしたカードの ID' });
    expect(
      within(skipped)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['card-001', 'card-002']);
    expect(
      within(result).getByText('既に取り込まれているカードの ID のため、登録せずに飛ばしました')
    ).toBeInTheDocument();

    // 登録できなかったファイルと理由
    const failed = within(result).getByRole('list', { name: '登録できなかったファイルと理由' });
    expect(within(failed).getByRole('listitem')).toHaveTextContent(
      'broken.json：JSON として読めません'
    );

    // 切り詰めたカードと欄
    const truncated = within(result).getByRole('list', { name: '切り詰めたカードと欄' });
    expect(within(truncated).getByRole('listitem')).toHaveTextContent(
      'card-010：見積全体の条件、1 行目の名称'
    );

    expect(onImported).toHaveBeenCalledWith(RESULT);
    // 結果を出した後は取り込みの操作を出さず、閉じるだけにする
    expect(screen.queryByRole('button', { name: '取り込む' })).not.toBeInTheDocument();
  });

  it('飛ばし・失敗・切り詰めが無いときは、内訳の並びを出さない', async () => {
    const user = userEvent.setup();
    importCards.mockResolvedValue({
      importedCount: 2,
      skipped: [],
      failed: [],
      truncated: [],
      referenceMarkedCount: 0,
    });
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));

    const result = await screen.findByRole('region', { name: '取り込みの結果' });
    expect(within(result).getByText('登録した件数：2 件')).toBeInTheDocument();
    expect(within(result).getByText('飛ばした件数：0 件')).toBeInTheDocument();
    expect(within(result).getByText('登録できなかった件数：0 件')).toBeInTheDocument();
    expect(within(result).getByText('参考の印を付けた件数：0 件')).toBeInTheDocument();
    expect(within(result).queryByRole('list')).not.toBeInTheDocument();
  });

  it('結果を出した後に「閉じる」で閉じる', async () => {
    const user = userEvent.setup();
    importCards.mockResolvedValue(RESULT);
    const { onClose } = renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    await screen.findByRole('region', { name: '取り込みの結果' });

    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('zip と JSON でないファイルを選ぶと誤りを出し、送らない', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [
      jsonFile('a.json'),
      new File(['x'], 'memo.txt', { type: 'text/plain' }),
    ]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'zip または JSON のファイルを選んでください（memo.txt）'
    );
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
    expect(importCards).not.toHaveBeenCalled();
  });

  it('50MB を超える zip を選ぶと上限超過の誤りを出し、送らない', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [zipFile('big.zip', 50 * MB + 1)]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'zip のファイルの大きさが上限（50MB）を超えています（big.zip）'
    );
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
  });

  it('ちょうど 50MB の zip は選べる', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [zipFile('ok.zip', 50 * MB)]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取り込む' })).toBeEnabled();
  });

  it('1MB を超える JSON を選ぶと上限超過の誤りを出し、送らない', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [
      jsonFile('big.json', 1 * MB + 1),
    ]);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'JSON のファイルの大きさが上限（1MB）を超えています（big.json）'
    );
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
  });

  it('2000 個を超えるファイルを選ぶと上限超過の誤りを出し、送らない', async () => {
    const user = userEvent.setup();
    renderDialog();

    const files = Array.from({ length: 2001 }, (_, i) => jsonFile(`card-${i}.json`));
    await user.upload(screen.getByLabelText('取り込むファイル'), files);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '取り込むファイルの数が上限（2000 個）を超えています'
    );
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
  });

  it('サーバーが上限超過（413）を返すと、その文言を出し、もう一度取り込める', async () => {
    const user = userEvent.setup();
    importCards.mockRejectedValueOnce(
      new ApiError(413, 'zip の展開後の合計の大きさが上限（200MB）を超えています', {
        code: 'LEDGER_IMPORT_TOO_LARGE',
        details: { limit: 'TOTAL_UNCOMPRESSED_SIZE', max: 200 * MB },
      })
    );
    importCards.mockResolvedValueOnce(RESULT);
    const { onImported } = renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [zipFile('cards.zip')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'zip の展開後の合計の大きさが上限（200MB）を超えています'
    );
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '取り込みの結果' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取り込む' }));
    expect(await screen.findByRole('region', { name: '取り込みの結果' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(importCards).toHaveBeenCalledTimes(2);
  });

  it('つながらないときは、決まった文言を出す', async () => {
    const user = userEvent.setup();
    importCards.mockRejectedValue(new ApiError(0, 'Network error'));
    renderDialog();

    await user.upload(screen.getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '取り込みに失敗しました。時間をおいてもう一度お試しください'
    );
  });

  it('送る前は「キャンセル」と Escape で閉じる', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('閉じて開き直すと、選んだファイルと結果を捨てる', async () => {
    const user = userEvent.setup();
    importCards.mockResolvedValue(RESULT);
    const onClose = vi.fn();
    const onImported = vi.fn();
    const { rerender } = render(
      <LedgerImportDialog open onClose={onClose} onImported={onImported} />
    );

    await user.upload(screen.getByLabelText('取り込むファイル'), [jsonFile('a.json')]);
    await user.click(screen.getByRole('button', { name: '取り込む' }));
    await screen.findByRole('region', { name: '取り込みの結果' });

    rerender(<LedgerImportDialog open={false} onClose={onClose} onImported={onImported} />);
    rerender(<LedgerImportDialog open onClose={onClose} onImported={onImported} />);

    expect(screen.queryByRole('region', { name: '取り込みの結果' })).not.toBeInTheDocument();
    expect(screen.queryByText(/個のファイルを選びました/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取り込む' })).toBeDisabled();
  });
});
