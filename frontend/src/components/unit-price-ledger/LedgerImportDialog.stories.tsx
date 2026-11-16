import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, spyOn, userEvent, within } from 'storybook/test';
import LedgerImportDialog from './LedgerImportDialog';
import { unitPriceLedgerApi, type LedgerImportResult } from '../../api/unit-price-ledger';
import { ApiError } from '../../api/client';

/**
 * LedgerImportDialog のストーリー
 *
 * 見積カードの zip・JSON の取り込みと結果の表示（unit-price-ledger 2.1・2.15）。
 * 取り込みの API は各ストーリーで差し替え、サーバーへは送らない。
 */

const RESULT: LedgerImportResult = {
  importedCount: 128,
  skipped: [{ cardId: '2024-0012_山田設備' }, { cardId: '2024-0031_佐藤電気' }],
  failed: [
    { fileName: 'broken.json', reason: 'JSON として読めません' },
    { fileName: 'cards.zip/2023-0099.json', reason: '必須の項目がありません：見積日' },
  ],
  truncated: [{ cardId: '2024-0040_田中工業', fields: ['見積全体の条件', '1 行目の備考'] }],
  referenceMarkedCount: 7,
};

const meta = {
  title: 'UnitPriceLedger/LedgerImportDialog',
  component: LedgerImportDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '見積カードの zip、または複数の JSON を選んで取り込み、登録・飛ばし・失敗・切り詰め・参考の印の件数と内訳を出すダイアログ。',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onClose: fn(),
    onImported: fn(),
  },
} satisfies Meta<typeof LedgerImportDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const selectAndImport = async (canvasElement: HTMLElement): Promise<void> => {
  const canvas = within(canvasElement);
  await userEvent.upload(canvas.getByLabelText('取り込むファイル'), [
    new File(['PK'], 'cards.zip', { type: 'application/zip' }),
  ]);
  await userEvent.click(canvas.getByRole('button', { name: '取り込む' }));
};

/** ファイルを選ぶ前 */
export const Default: Story = {};

/** 取り込みの結果（件数と内訳） */
export const WithResult: Story = {
  beforeEach: () => {
    spyOn(unitPriceLedgerApi, 'importCards').mockResolvedValue(RESULT);
  },
  play: async ({ canvasElement }) => {
    await selectAndImport(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('登録した件数：128 件')).toBeInTheDocument();
  },
};

/** サーバーが上限超過（413）を返したとき */
export const ServerLimitError: Story = {
  beforeEach: () => {
    spyOn(unitPriceLedgerApi, 'importCards').mockRejectedValue(
      new ApiError(413, 'zip の展開後の合計の大きさが上限（200MB）を超えています', {
        code: 'LEDGER_IMPORT_TOO_LARGE',
        details: { limit: 'TOTAL_UNCOMPRESSED_SIZE', max: 200 * 1024 * 1024 },
      })
    );
  },
  play: async ({ canvasElement }) => {
    await selectAndImport(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('上限（200MB）');
  },
};

/** 閉じているとき（何も出さない） */
export const Closed: Story = {
  args: { open: false },
};
