/**
 * @fileoverview 単価台帳の見積の詳細の画面の単体テスト（unit-price-ledger タスク4.4）
 *
 * 詳細（見積の情報・カードの ID・原本のパス・明細行）の表示、案件の無い受領見積書の修正の保存・
 * 削除の確認・排他の不一致の文言、見積が無いときの表示、権限の無い利用者への非表示を確かめる。
 * 案件の受領見積書は、このタスクでは詳細を読むだけにする（印の編集は 4.5）。
 * API は `unitPriceLedgerApi` を差し替える。
 *
 * @requirement unit-price-ledger/REQ-4.6 見積の情報・カードの ID・原本のパスと、すべての明細行を表示する
 * @requirement unit-price-ledger/REQ-5.1 案件の無い受領見積書の業者名・見積日・見積の情報・案件名・原本のパス・明細行の修正
 * @requirement unit-price-ledger/REQ-5.3 明細行の分類キーを入力して保存する
 * @requirement unit-price-ledger/REQ-5.4 読取の確認を確認済みにして保存すると、確認者と日時を表示する
 * @requirement unit-price-ledger/REQ-5.5 確認の後に削除する
 * @requirement unit-price-ledger/REQ-5.6 排他の不一致の文言
 * @requirement unit-price-ledger/REQ-10.1 台帳の管理の権限を持つ利用者だけに許す
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContext';
import { ApiError } from '../../api/client';
import type {
  LedgerQuotationDetail,
  LedgerQuotationUpdateInput,
} from '../../api/unit-price-ledger';
import type { LineItemInfo } from '../../api/received-quotations';
import LedgerQuotationDetailPage from '../../pages/LedgerQuotationDetailPage';

const mocks = vi.hoisted(() => ({
  getQuotation: vi.fn(),
  updateQuotation: vi.fn(),
  deleteQuotation: vi.fn(),
  updateMarks: vi.fn(),
}));

vi.mock('../../api/unit-price-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/unit-price-ledger')>();
  return {
    ...actual,
    unitPriceLedgerApi: {
      ...actual.unitPriceLedgerApi,
      getQuotation: mocks.getQuotation,
      updateQuotation: mocks.updateQuotation,
      deleteQuotation: mocks.deleteQuotation,
      updateMarks: mocks.updateMarks,
    },
  };
});

const MANAGE = 'unit_price_ledger:manage';
const NO_PERMISSION_MESSAGE = '単価台帳を表示する権限がありません';
const CONFLICT_MESSAGE = 'ほかの利用者が更新しました。最新の内容を読み込み直してください';
const QUOTATION_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = new Date('2026-04-02T03:04:05.000Z');

function authValue(permissions: string[]): AuthContextValue {
  return {
    isAuthenticated: true,
    user: {
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
      roles: ['user'],
      permissions,
    },
    isLoading: false,
    isInitialized: true,
    sessionExpired: false,
    twoFactorState: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    sessionExpiredDuringOperation: false,
    clearSessionExpired: vi.fn(),
    handleReauthSuccess: vi.fn(),
    navigateToLogin: vi.fn(),
    verify2FA: vi.fn(),
    verifyBackupCode: vi.fn(),
    cancel2FA: vi.fn(),
    establishSession: vi.fn(),
    updateUser: vi.fn(),
  };
}

function lineItem(overrides: Partial<LineItemInfo> = {}): LineItemInfo {
  return {
    id: 'li-1',
    receivedQuotationId: QUOTATION_ID,
    sortOrder: 0,
    customCategory: null,
    workType: '設備',
    name: '配管工事',
    specification: '20A',
    unit: 'm',
    quantity: 10,
    unitPrice: 1200,
    amount: 12000,
    remarks: null,
    category: 'DIRECT',
    condition: '夜間作業',
    conversion: { quantity: 2, unit: '式', unitPrice: 6000, basis: '一式にまとめた' },
    classificationKey: 'P-01',
    quantityRowKey: 'qrk-001',
    isReference: true,
    referenceReason: '合計が合わない',
    ...overrides,
  };
}

function detail(overrides: Partial<LedgerQuotationDetail> = {}): LedgerQuotationDetail {
  return {
    id: QUOTATION_ID,
    estimateRequestId: null,
    projectId: null,
    projectName: null,
    name: '山田設備_2026-04-01',
    vendorName: '山田設備',
    tradingPartnerId: null,
    submittedAt: new Date('2026-04-01T00:00:00.000Z'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    quoteNumber: 'Q-123',
    overallConditions: '諸経費込み',
    siteLocation: '横浜市',
    constructionKind: 'RENOVATION',
    useType: '庁舎',
    constructionPrice: 5000000,
    workConditions: '夜間',
    distanceKm: 12.5,
    adoption: 'ADOPTED',
    confirmedAmount: 11000,
    readingStatus: 'UNCONFIRMED',
    readingConfirmedAt: null,
    readingConfirmedBy: null,
    quoteDiscriminator: '',
    ledgerCardId: 'card-0001',
    ledgerSourcePath: '2026/旧庁舎/見積.pdf',
    ledgerProjectName: '旧庁舎改修',
    lineItems: [lineItem()],
    totalAmount: 12000,
    hasReferenceLines: true,
    createdAt: new Date('2026-04-01T09:00:00.000Z'),
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function renderPage(permissions: string[] = [MANAGE]): void {
  render(
    <AuthContext.Provider value={authValue(permissions)}>
      <MemoryRouter initialEntries={[`/unit-price-ledger/quotations/${QUOTATION_ID}`]}>
        <Routes>
          <Route path="/unit-price-ledger" element={<p>台帳の一覧の画面</p>} />
          <Route path="/unit-price-ledger/quotations/:id" element={<LedgerQuotationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

/** 詳細の読み込みを待ち、明細行の表を返す */
async function waitForLineItemTable(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: '明細行' });
}

/** 見積の情報の欄の値（`<dt>` の名前の次の `<dd>`） */
function infoValue(term: string): string | null {
  const list = screen.getByRole('region', { name: '見積の情報' });
  const dt = within(list).getByText(term, { selector: 'dt' });
  return dt.nextElementSibling?.textContent ?? null;
}

/** 最後の修正の入力 */
function lastUpdateInput(): LedgerQuotationUpdateInput {
  const calls = mocks.updateQuotation.mock.calls;
  return calls[calls.length - 1]?.[1] as LedgerQuotationUpdateInput;
}

describe('LedgerQuotationDetailPage（unit-price-ledger タスク4.4）', () => {
  beforeEach(() => {
    mocks.getQuotation.mockReset();
    mocks.updateQuotation.mockReset();
    mocks.deleteQuotation.mockReset();
    mocks.updateMarks.mockReset();
    mocks.getQuotation.mockResolvedValue(detail());
  });

  describe('権限（10.1）', () => {
    it('台帳の管理の権限が無い利用者には内容を出さず、詳細も問い合わせない', () => {
      renderPage(['estimate:update']);

      expect(screen.getByRole('alert')).toHaveTextContent(NO_PERMISSION_MESSAGE);
      expect(screen.queryByRole('heading', { name: '見積の詳細' })).not.toBeInTheDocument();
      expect(mocks.getQuotation).not.toHaveBeenCalled();
    });
  });

  describe('詳細の表示（4.6）', () => {
    it('見積の情報・カードの ID・原本のパスを出す', async () => {
      renderPage();
      await waitForLineItemTable();

      expect(mocks.getQuotation).toHaveBeenCalledWith(QUOTATION_ID);
      expect(screen.getByRole('heading', { level: 1, name: '見積の詳細' })).toBeInTheDocument();
      expect(infoValue('業者名')).toBe('山田設備');
      expect(infoValue('見積日')).toBe('2026-04-01');
      expect(infoValue('案件名')).toBe('旧庁舎改修');
      expect(infoValue('見積番号')).toBe('Q-123');
      expect(infoValue('見積全体の条件')).toBe('諸経費込み');
      expect(infoValue('場所')).toBe('横浜市');
      expect(infoValue('改修／新営')).toBe('改修');
      expect(infoValue('用途')).toBe('庁舎');
      expect(infoValue('工事価格')).toBe('5,000,000円');
      expect(infoValue('作業条件')).toBe('夜間');
      expect(infoValue('距離')).toBe('12.5km');
      expect(infoValue('採否')).toBe('採用');
      expect(infoValue('確定金額')).toBe('11,000円');
      expect(infoValue('読取の確認')).toBe('未確認');
      expect(infoValue('合計（別途を除く）')).toBe('12,000円');
      expect(infoValue('カードの ID')).toBe('card-0001');
      expect(infoValue('原本のパス')).toBe('2026/旧庁舎/見積.pdf');
    });

    it('明細行を、区分・条件・換算・参考の印と理由・分類キー・数量表の行のキーとともに出す', async () => {
      mocks.getQuotation.mockResolvedValue(
        detail({
          lineItems: [
            lineItem(),
            lineItem({
              id: 'li-2',
              sortOrder: 1,
              name: '産廃処分',
              category: 'WASTE',
              condition: null,
              conversion: null,
              classificationKey: null,
              quantityRowKey: null,
              isReference: false,
              referenceReason: null,
            }),
          ],
        })
      );
      renderPage();
      const table = await waitForLineItemTable();

      const headers = within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent);
      expect(headers).toEqual([
        '区分',
        '任意分類',
        '工種',
        '名称',
        '規格',
        '数量',
        '単位',
        '単価',
        '金額',
        '条件',
        '換算',
        '参考の印',
        '参考の理由',
        '分類キー',
        '数量表の行のキー',
        '備考',
      ]);

      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows).toHaveLength(2);
      expect(
        within(rows[0]!)
          .getAllByRole('cell')
          .map((td) => td.textContent)
      ).toEqual([
        '直接工事',
        '-',
        '設備',
        '配管工事',
        '20A',
        '10',
        'm',
        '1,200円',
        '12,000円',
        '夜間作業',
        '2 式 × 6,000円（一式にまとめた）',
        'あり',
        '合計が合わない',
        'P-01',
        'qrk-001',
        '-',
      ]);
      expect(
        within(rows[1]!)
          .getAllByRole('cell')
          .map((td) => td.textContent)
      ).toEqual([
        '産廃',
        '-',
        '設備',
        '産廃処分',
        '20A',
        '10',
        'm',
        '1,200円',
        '12,000円',
        '-',
        '-',
        'なし',
        '-',
        '-',
        '-',
        '-',
      ]);
    });

    it('案件の受領見積書は案件の名前を出し、全体の修正と削除の操作を出さない', async () => {
      mocks.getQuotation.mockResolvedValue(
        detail({
          projectId: 'p-1',
          estimateRequestId: 'er-1',
          projectName: '庁舎改修工事',
          ledgerProjectName: null,
          ledgerCardId: null,
          ledgerSourcePath: null,
        })
      );
      renderPage();
      await waitForLineItemTable();

      expect(infoValue('案件名')).toBe('庁舎改修工事');
      expect(infoValue('カードの ID')).toBe('-');
      expect(infoValue('原本のパス')).toBe('-');
      expect(screen.queryByRole('button', { name: '修正' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    });

    it('見積が無いときは、見つからない旨と一覧へ戻る導線を出す', async () => {
      mocks.getQuotation.mockRejectedValue(new ApiError(404, 'Not Found', { code: 'NOT_FOUND' }));
      renderPage();

      expect(
        await screen.findByRole('heading', { name: '見積が見つかりません' })
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '台帳の一覧に戻る' })).toHaveAttribute(
        'href',
        '/unit-price-ledger'
      );
    });

    it('読み込みに失敗したときは、失敗の旨を出す', async () => {
      mocks.getQuotation.mockRejectedValue(new ApiError(500, 'Internal Server Error'));
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '見積を読み込めませんでした。時間をおいて、もう一度お試しください'
      );
    });
  });

  describe('修正の保存（5.1・5.3・5.4）', () => {
    it('業者名・見積日・案件名・原本のパス・明細行・分類キーを直して保存し、保存の後の内容を出す', async () => {
      const user = userEvent.setup();
      mocks.updateQuotation.mockResolvedValue(
        detail({
          vendorName: '山田設備工業',
          submittedAt: new Date('2026-04-03T00:00:00.000Z'),
          ledgerProjectName: '新庁舎改修',
          ledgerSourcePath: '2026/新庁舎/見積.pdf',
          lineItems: [lineItem({ name: '配管工事（改）', classificationKey: 'P-02' })],
          updatedAt: new Date('2026-04-05T00:00:00.000Z'),
        })
      );
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      const form = screen.getByRole('form', { name: '見積の修正' });

      const vendor = within(form).getByLabelText('業者名');
      await user.clear(vendor);
      await user.type(vendor, '山田設備工業');
      const submittedAt = within(form).getByLabelText('見積日');
      await user.clear(submittedAt);
      await user.type(submittedAt, '2026-04-03');
      const projectName = within(form).getByLabelText('案件名');
      await user.clear(projectName);
      await user.type(projectName, '新庁舎改修');
      const sourcePath = within(form).getByLabelText('原本のパス');
      await user.clear(sourcePath);
      await user.type(sourcePath, '2026/新庁舎/見積.pdf');
      const name = within(form).getByLabelText('行1 名称');
      await user.clear(name);
      await user.type(name, '配管工事（改）');
      const classificationKey = within(form).getByLabelText('行1 分類キー');
      await user.clear(classificationKey);
      await user.type(classificationKey, 'P-02');

      await user.click(within(form).getByRole('button', { name: '保存' }));

      await waitFor(() => expect(mocks.updateQuotation).toHaveBeenCalledTimes(1));
      expect(mocks.updateQuotation.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
      const input = lastUpdateInput();
      expect(input).toMatchObject({
        vendorName: '山田設備工業',
        submittedAt: '2026-04-03T00:00:00.000Z',
        ledgerProjectName: '新庁舎改修',
        ledgerSourcePath: '2026/新庁舎/見積.pdf',
        quoteNumber: 'Q-123',
        overallConditions: '諸経費込み',
        siteLocation: '横浜市',
        constructionKind: 'RENOVATION',
        useType: '庁舎',
        constructionPrice: 5000000,
        workConditions: '夜間',
        distanceKm: 12.5,
        adoption: 'ADOPTED',
        confirmedAmount: 11000,
        readingStatus: 'UNCONFIRMED',
        quoteDiscriminator: '',
        expectedUpdatedAt: UPDATED_AT.toISOString(),
      });
      expect(input.lineItems).toEqual([
        {
          name: '配管工事（改）',
          customCategory: undefined,
          workType: '設備',
          specification: '20A',
          unit: 'm',
          quantity: 10,
          unitPrice: 1200,
          amount: 12000,
          remarks: undefined,
          sortOrder: 0,
          category: 'DIRECT',
          condition: '夜間作業',
          conversion: { quantity: 2, unit: '式', unitPrice: 6000, basis: '一式にまとめた' },
          classificationKey: 'P-02',
          quantityRowKey: 'qrk-001',
          isReference: true,
          referenceReason: '合計が合わない',
        },
      ]);
      expect('tradingPartnerId' in input).toBe(false);

      expect(await screen.findByRole('status')).toHaveTextContent('保存しました');
      expect(screen.queryByRole('form', { name: '見積の修正' })).not.toBeInTheDocument();
      expect(infoValue('業者名')).toBe('山田設備工業');
      expect(infoValue('見積日')).toBe('2026-04-03');
      expect(infoValue('案件名')).toBe('新庁舎改修');
      expect(infoValue('原本のパス')).toBe('2026/新庁舎/見積.pdf');
      const table = await waitForLineItemTable();
      expect(within(table).getByText('配管工事（改）')).toBeInTheDocument();
      expect(within(table).getByText('P-02')).toBeInTheDocument();
    });

    it('見積日を変えないときは、読み込んだ見積日をそのまま送る', async () => {
      const user = userEvent.setup();
      const submittedAt = new Date('2026-03-31T15:00:00.000Z');
      mocks.getQuotation.mockResolvedValue(detail({ submittedAt }));
      mocks.updateQuotation.mockResolvedValue(detail({ submittedAt }));
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => expect(mocks.updateQuotation).toHaveBeenCalledTimes(1));
      expect(lastUpdateInput().submittedAt).toBe(submittedAt.toISOString());
    });

    it('行を足して保存すると、2 行を並びの順で送る', async () => {
      const user = userEvent.setup();
      mocks.updateQuotation.mockResolvedValue(detail());
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.click(screen.getByRole('button', { name: '行を追加' }));
      await user.type(screen.getByLabelText('行2 名称'), '足場');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => expect(mocks.updateQuotation).toHaveBeenCalledTimes(1));
      const items = lastUpdateInput().lineItems;
      expect(items.map((item) => [item.name, item.sortOrder])).toEqual([
        ['配管工事', 0],
        ['足場', 1],
      ]);
    });

    it('読取の確認を確認済みにして保存すると、記録された確認者と日時を出す（5.4）', async () => {
      const user = userEvent.setup();
      const confirmedAt = new Date('2026-04-05T01:02:00.000Z');
      mocks.updateQuotation.mockResolvedValue(
        detail({
          readingStatus: 'CONFIRMED',
          readingConfirmedAt: confirmedAt,
          readingConfirmedBy: { id: 'user-1', displayName: '管理 太郎' },
          updatedAt: new Date('2026-04-05T01:02:00.000Z'),
        })
      );
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.click(screen.getByRole('button', { name: '台帳の情報' }));
      await user.selectOptions(screen.getByLabelText('読取の確認'), 'CONFIRMED');
      await user.click(screen.getByRole('button', { name: '保存' }));

      await waitFor(() => expect(mocks.updateQuotation).toHaveBeenCalledTimes(1));
      expect(lastUpdateInput().readingStatus).toBe('CONFIRMED');
      await screen.findByRole('status');
      expect(infoValue('読取の確認')).toBe('確認済み');
      expect(infoValue('確認者')).toBe('管理 太郎');
      expect(infoValue('確認日時')).toBe(
        confirmedAt.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    });

    it('業者名が空のときは保存せず、誤りを出す', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.clear(screen.getByLabelText('業者名'));
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByText('業者名を入力してください')).toBeInTheDocument();
      expect(screen.getByLabelText('業者名')).toHaveAttribute('aria-invalid', 'true');
      expect(mocks.updateQuotation).not.toHaveBeenCalled();
    });

    it('名称のある明細行が無いときは保存せず、1 行以上を求める', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.clear(screen.getByLabelText('行1 名称'));
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByText('明細行を1行以上入力してください')).toBeInTheDocument();
      expect(mocks.updateQuotation).not.toHaveBeenCalled();
    });

    it('参考の印の無い行に参考の理由があるときは保存せず、行の下に誤りを出す', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.click(screen.getByLabelText('行1 参考'));
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(
        await screen.findByText('参考の理由は参考の印を付けた行にだけ入力できます')
      ).toBeInTheDocument();
      expect(mocks.updateQuotation).not.toHaveBeenCalled();
    });

    it('取り消すと修正の欄を閉じ、保存しない', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.clear(screen.getByLabelText('業者名'));
      await user.type(screen.getByLabelText('業者名'), '別の業者');
      await user.click(screen.getByRole('button', { name: '取り消す' }));

      expect(screen.queryByRole('form', { name: '見積の修正' })).not.toBeInTheDocument();
      expect(infoValue('業者名')).toBe('山田設備');
      expect(mocks.updateQuotation).not.toHaveBeenCalled();
    });

    it('サーバーが案件の受領見積書として拒んだときは、その文言を出す', async () => {
      const user = userEvent.setup();
      const message =
        '案件の受領見積書は台帳の画面で修正できません。受領見積書の画面で修正してください';
      mocks.updateQuotation.mockRejectedValue(
        new ApiError(409, message, { code: 'LEDGER_PROJECT_QUOTATION_READ_ONLY' })
      );
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.click(screen.getByRole('button', { name: '保存' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });
  });

  describe('排他の不一致（5.6）', () => {
    it('保存が排他の不一致のときは決まった文言を出し、読み込み直すと最新の内容を出す', async () => {
      const user = userEvent.setup();
      mocks.updateQuotation.mockRejectedValue(
        new ApiError(409, 'Conflict', { code: 'LEDGER_CONFLICT' })
      );
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '修正' }));
      await user.clear(screen.getByLabelText('業者名'));
      await user.type(screen.getByLabelText('業者名'), '自分の変更');
      await user.click(screen.getByRole('button', { name: '保存' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(CONFLICT_MESSAGE);
      expect(alert).not.toHaveTextContent('Conflict');

      mocks.getQuotation.mockResolvedValue(
        detail({ vendorName: 'ほかの利用者の変更', updatedAt: new Date('2026-04-06') })
      );
      await user.click(within(alert).getByRole('button', { name: '最新の内容を読み込み直す' }));

      await waitFor(() => expect(mocks.getQuotation).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(infoValue('業者名')).toBe('ほかの利用者の変更'));
      expect(screen.queryByRole('form', { name: '見積の修正' })).not.toBeInTheDocument();
      expect(screen.queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument();
    });

    it('削除が排他の不一致のときは決まった文言を出し、画面に留まる', async () => {
      const user = userEvent.setup();
      mocks.deleteQuotation.mockRejectedValue(
        new ApiError(409, 'Conflict', { code: 'LEDGER_CONFLICT' })
      );
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '削除' }));
      const dialog = screen.getByRole('dialog', { name: '見積の削除' });
      await user.click(within(dialog).getByRole('button', { name: '削除する' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(CONFLICT_MESSAGE);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('台帳の一覧の画面')).not.toBeInTheDocument();
    });
  });

  describe('削除（5.5）', () => {
    it('確認を取り消すと削除しない', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '削除' }));
      const dialog = screen.getByRole('dialog', { name: '見積の削除' });
      expect(dialog).toHaveTextContent(
        '「山田設備_2026-04-01」を削除しますか？この操作は取り消せません。'
      );
      await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mocks.deleteQuotation).not.toHaveBeenCalled();
    });

    it('確認の後に、開いたときの更新の日時を付けて削除し、一覧へ戻る', async () => {
      const user = userEvent.setup();
      mocks.deleteQuotation.mockResolvedValue(undefined);
      renderPage();
      await waitForLineItemTable();

      await user.click(screen.getByRole('button', { name: '削除' }));
      const dialog = screen.getByRole('dialog', { name: '見積の削除' });
      await user.click(within(dialog).getByRole('button', { name: '削除する' }));

      await waitFor(() => expect(mocks.deleteQuotation).toHaveBeenCalledTimes(1));
      expect(mocks.deleteQuotation).toHaveBeenCalledWith(QUOTATION_ID, UPDATED_AT);
      expect(await screen.findByText('台帳の一覧の画面')).toBeInTheDocument();
    });
  });
});
