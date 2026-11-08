/**
 * @fileoverview 案件の受領見積書の一覧の画面の単体テスト（estimate-request のタスク118.1）
 *
 * 受入基準 43.1〜43.6・43.9・43.11・43.13・43.15・46.10 と 48.4 の知らせを観測する。
 * 受入基準の逐語は本番コードの文言の定数から読む（試験の名前や注記に逐語を書かない）。
 * フォームの中身（業者名・明細行・台帳の情報）は ReceivedQuotationForm の単体が確かめるため、
 * ここではフォームを最小の代役に置き換え、画面が渡す文脈と保存の配線を確かめる。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectReceivedQuotationListPage from '../../pages/ProjectReceivedQuotationListPage';
import {
  PROJECT_QUOTATION_LIST_TEXT,
  PROJECT_QUOTATION_FORBIDDEN_MESSAGES,
} from '../../pages/project-received-quotation-list-messages';
import * as receivedQuotationApi from '../../api/received-quotations';
import type {
  ReceivedQuotationInfo,
  ReceivedQuotationSaveResult,
} from '../../api/received-quotations';
import { getProject } from '../../api/projects';
import { ApiError } from '../../api/client';
import {
  LINE_ITEM_LEDGER_DEFAULTS,
  RECEIVED_QUOTATION_LEDGER_DEFAULTS,
} from '../../test-support/received-quotation-fixtures';
import { formatSharedOriginalNotice } from '../../components/estimate-requests/received-quotation-form-messages';
import { RECEIVED_QUOTATION_NOT_FOUND_MESSAGE } from '../../utils/estimateRequestNotFound';
import type { ReceivedQuotationFormProps } from '../../components/estimate-requests/ReceivedQuotationForm';

vi.mock('../../api/received-quotations');
vi.mock('../../api/projects', () => ({
  getProject: vi.fn(),
}));

/**
 * フォームの代役。画面が渡した文脈と編集の対象を出し、保存の釦で onSubmit を呼ぶ。
 * 投げ返された誤りの文言を出す（本物のフォームと同じく、保存の失敗はフォームが表示する）
 */
const formSubmitData = { name: '代役の受領見積書', submittedAt: new Date('2026-11-01') };
vi.mock('../../components/estimate-requests/ReceivedQuotationForm', async () => {
  const { useState } = await import('react');
  function FormStub(props: ReceivedQuotationFormProps) {
    const [error, setError] = useState<string | null>(null);
    return (
      <div data-testid="form-stub">
        <span data-testid="form-stub-mode">{props.mode}</span>
        <span data-testid="form-stub-context">{JSON.stringify(props.context)}</span>
        <span data-testid="form-stub-initial">{props.initialData?.id ?? ''}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await props.onSubmit(formSubmitData);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'error');
            }
          }}
        >
          代役で保存
        </button>
        <button type="button" onClick={props.onCancel}>
          代役で閉じる
        </button>
        {error && <p data-testid="form-stub-error">{error}</p>}
      </div>
    );
  }
  return { ReceivedQuotationForm: FormStub, default: FormStub };
});

// ============================================================================
// 固定の値
// ============================================================================

function quotation(overrides: Partial<ReceivedQuotationInfo> = {}): ReceivedQuotationInfo {
  return {
    id: 'rq-own',
    estimateRequestId: null,
    estimateRequestName: null,
    name: '自前の見積書',
    submittedAt: new Date('2026-10-05T00:00:00'),
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    lineItems: [],
    totalAmount: 120000,
    netAmount: 98000,
    createdAt: new Date('2026-10-06T09:30:00'),
    updatedAt: new Date('2026-10-06T09:30:00.000Z'),
    ...RECEIVED_QUOTATION_LEDGER_DEFAULTS,
    vendorName: '自前の協力業者',
    tradingPartnerName: '自前の協力業者',
    ...overrides,
  };
}

const ownQuotation = quotation();
const requestedQuotation = quotation({
  id: 'rq-req',
  estimateRequestId: 'er-1',
  estimateRequestName: '内装の見積依頼',
  name: '依頼からの見積書',
  vendorName: '宛先の協力業者',
  tradingPartnerName: '宛先の協力業者',
  netAmount: null,
  submittedAt: new Date('2026-09-15T00:00:00'),
  createdAt: new Date('2026-09-16T14:05:00'),
  readingStatus: 'CONFIRMED',
  lineItems: [
    {
      id: 'li-1',
      receivedQuotationId: 'rq-req',
      customCategory: null,
      workType: null,
      name: '下地',
      specification: null,
      quantity: 1,
      unit: '式',
      unitPrice: 1000,
      amount: 1000,
      remarks: null,
      sortOrder: 0,
      ...LINE_ITEM_LEDGER_DEFAULTS,
      isReference: true,
    } as ReceivedQuotationInfo['lineItems'][number],
  ],
});

function saveResult(sharedOriginalCount = 0): ReceivedQuotationSaveResult {
  return { ...ownQuotation, sharedOriginalCount };
}

function renderPage(projectId = 'project-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/quotations`]}>
      <Routes>
        <Route
          path="/projects/:projectId/quotations"
          element={<ProjectReceivedQuotationListPage />}
        />
        <Route path="/estimate-requests/:id" element={<div data-testid="request-detail-page" />} />
        <Route path="/projects" element={<div data-testid="project-list-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

async function findRow(name: string): Promise<HTMLElement> {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr');
  if (!row) throw new Error(`行が見つかりません: ${name}`);
  return row as HTMLElement;
}

describe('ProjectReceivedQuotationListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProject).mockResolvedValue({ id: 'project-1', name: '本社改修工事' } as never);
    vi.mocked(receivedQuotationApi.getReceivedQuotationsByProject).mockResolvedValue([
      ownQuotation,
      requestedQuotation,
    ]);
    vi.mocked(receivedQuotationApi.createProjectReceivedQuotation).mockResolvedValue(saveResult());
    vi.mocked(receivedQuotationApi.updateReceivedQuotation).mockResolvedValue(saveResult());
    vi.mocked(receivedQuotationApi.deleteReceivedQuotation).mockResolvedValue(undefined);
    vi.mocked(receivedQuotationApi.getPreviewUrl).mockResolvedValue('https://example.com/p');
  });

  describe('一覧', () => {
    it('案件の受領見積書を見積依頼の有無にかかわらず全件の指定で取得して表示する（43.1）', async () => {
      renderPage();

      expect(await screen.findByText('自前の見積書')).toBeInTheDocument();
      expect(screen.getByText('依頼からの見積書')).toBeInTheDocument();
      expect(receivedQuotationApi.getReceivedQuotationsByProject).toHaveBeenCalledWith(
        'project-1',
        { include: 'all' }
      );
    });

    it('名前・業者名・提出日・見積依頼名・NET金額・登録日時の列を出し、見積依頼の無いものは依頼の無い旨を出す（43.2）', async () => {
      renderPage();

      const headers = (await screen.findAllByRole('columnheader')).map((h) => h.textContent);
      expect(headers.slice(0, 6)).toEqual([
        '受領見積書名',
        '業者名',
        '提出日',
        '見積依頼名',
        'NET金額',
        '登録日時',
      ]);

      const own = within(await findRow('自前の見積書'));
      expect(own.getByText('自前の協力業者')).toBeInTheDocument();
      expect(own.getByText('2026/10/05')).toBeInTheDocument();
      expect(own.getByText(PROJECT_QUOTATION_LIST_TEXT.NO_ESTIMATE_REQUEST)).toBeInTheDocument();
      expect(own.getByText('98,000円')).toBeInTheDocument();
      expect(own.getByText('2026/10/06 09:30')).toBeInTheDocument();

      const req = within(await findRow('依頼からの見積書'));
      expect(req.getByText('宛先の協力業者')).toBeInTheDocument();
      expect(req.getByText('2026/09/15')).toBeInTheDocument();
      expect(req.getByText('内装の見積依頼')).toBeInTheDocument();
      expect(req.queryByText(PROJECT_QUOTATION_LIST_TEXT.NO_ESTIMATE_REQUEST)).toBeNull();
      expect(req.getByText('2026/09/16 14:05')).toBeInTheDocument();
    });

    it('参考の印と読取の確認の状態を行ごとに出す（46.10）', async () => {
      renderPage();

      const own = within(await findRow('自前の見積書'));
      expect(own.queryByTestId('received-quotation-reference-indicator')).toBeNull();
      expect(own.getByTestId('received-quotation-reading-status')).toHaveTextContent('未確認');

      const req = within(await findRow('依頼からの見積書'));
      expect(req.getByTestId('received-quotation-reference-indicator')).toBeInTheDocument();
      expect(req.getByTestId('received-quotation-reading-status')).toHaveTextContent('確認済み');
    });

    it('受領見積書が無いときは空の旨を出す（43.3）', async () => {
      vi.mocked(receivedQuotationApi.getReceivedQuotationsByProject).mockResolvedValue([]);
      renderPage();

      expect(await screen.findByText(PROJECT_QUOTATION_LIST_TEXT.EMPTY)).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
      // 空でも登録の釦は出す（43.5）
      expect(
        screen.getByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      ).toBeInTheDocument();
    });

    it('見積依頼名を選ぶとその見積依頼の詳細へ遷移する（43.4）', async () => {
      const user = userEvent.setup();
      renderPage();

      const link = await screen.findByRole('link', { name: '内装の見積依頼' });
      expect(link).toHaveAttribute('href', '/estimate-requests/er-1');
      await user.click(link);
      expect(await screen.findByTestId('request-detail-page')).toBeInTheDocument();
    });

    it('パンくずに ダッシュボード・プロジェクト一覧・プロジェクト名・受領見積書 を順に出す（43.15）', async () => {
      renderPage();

      const nav = await screen.findByRole('navigation', { name: 'パンくずナビゲーション' });
      await waitFor(() => expect(within(nav).getByText('本社改修工事')).toBeInTheDocument());
      const items = within(nav).getAllByRole('listitem');
      expect(items.map((i) => i.textContent?.replace(/[>/]/g, '').trim())).toEqual([
        'ダッシュボード',
        'プロジェクト一覧',
        '本社改修工事',
        PROJECT_QUOTATION_LIST_TEXT.TITLE,
      ]);
      expect(within(nav).getByRole('link', { name: 'ダッシュボード' })).toHaveAttribute(
        'href',
        '/'
      );
      expect(within(nav).getByRole('link', { name: 'プロジェクト一覧' })).toHaveAttribute(
        'href',
        '/projects'
      );
      expect(within(nav).getByRole('link', { name: '本社改修工事' })).toHaveAttribute(
        'href',
        '/projects/project-1'
      );
      expect(
        within(nav).queryByRole('link', { name: PROJECT_QUOTATION_LIST_TEXT.TITLE })
      ).toBeNull();
    });
  });

  describe('登録', () => {
    it('登録の釦で案件の文脈のフォームを開き、保存で案件の配下に登録して一覧を取り直す（43.5・43.6）', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      );
      expect(screen.getByTestId('form-stub-mode')).toHaveTextContent('create');
      expect(JSON.parse(screen.getByTestId('form-stub-context').textContent ?? '')).toEqual({
        kind: 'project',
        projectId: 'project-1',
      });

      await user.click(screen.getByRole('button', { name: '代役で保存' }));

      await waitFor(() => expect(screen.queryByTestId('form-stub')).toBeNull());
      expect(receivedQuotationApi.createProjectReceivedQuotation).toHaveBeenCalledWith(
        'project-1',
        formSubmitData
      );
      expect(receivedQuotationApi.getReceivedQuotationsByProject).toHaveBeenCalledTimes(2);
      // 同じ原本が他に無ければ知らせを出さない
      expect(screen.queryByTestId('shared-original-notice')).toBeNull();
    });

    it('同じ原本の他の受領見積書があれば、フォームを閉じた後に件数を role=status で知らせる（48.4）', async () => {
      vi.mocked(receivedQuotationApi.createProjectReceivedQuotation).mockResolvedValue(
        saveResult(2)
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      );
      await user.click(screen.getByRole('button', { name: '代役で保存' }));

      const notice = await screen.findByTestId('shared-original-notice');
      expect(notice).toHaveAttribute('role', 'status');
      expect(notice).toHaveTextContent(formatSharedOriginalNotice(2) ?? 'never');
    });

    it('保存の失敗はフォームへ投げ返し、フォームを閉じない', async () => {
      vi.mocked(receivedQuotationApi.createProjectReceivedQuotation).mockRejectedValue(
        new ApiError(400, '業者名の誤り')
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      );
      await user.click(screen.getByRole('button', { name: '代役で保存' }));

      expect(await screen.findByTestId('form-stub-error')).toHaveTextContent('業者名の誤り');
      expect(screen.getByTestId('form-stub')).toBeInTheDocument();
    });

    it('登録の権限が無い（403）ときは操作の拒否をフォームに出す（43.11）', async () => {
      vi.mocked(receivedQuotationApi.createProjectReceivedQuotation).mockRejectedValue(
        new ApiError(403, 'Insufficient permissions')
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      );
      await user.click(screen.getByRole('button', { name: '代役で保存' }));

      expect(await screen.findByTestId('form-stub-error')).toHaveTextContent(
        PROJECT_QUOTATION_FORBIDDEN_MESSAGES.OPERATION
      );
      expect(screen.queryByText('Insufficient permissions')).toBeNull();
    });
  });

  describe('編集と削除', () => {
    it('見積依頼の無い行だけに編集と削除の釦を出す（43.9）', async () => {
      renderPage();

      const own = within(await findRow('自前の見積書'));
      expect(own.getByRole('button', { name: /編集/ })).toBeInTheDocument();
      expect(own.getByRole('button', { name: /削除/ })).toBeInTheDocument();

      const req = within(await findRow('依頼からの見積書'));
      expect(req.queryByRole('button', { name: /編集/ })).toBeNull();
      expect(req.queryByRole('button', { name: /削除/ })).toBeNull();
    });

    it('編集の釦でその受領見積書のフォームを開き、保存で基準時刻つきで更新する（43.9）', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(within(await findRow('自前の見積書')).getByRole('button', { name: /編集/ }));
      expect(screen.getByTestId('form-stub-mode')).toHaveTextContent('edit');
      expect(screen.getByTestId('form-stub-initial')).toHaveTextContent('rq-own');
      expect(JSON.parse(screen.getByTestId('form-stub-context').textContent ?? '')).toEqual({
        kind: 'project',
        projectId: 'project-1',
      });

      await user.click(screen.getByRole('button', { name: '代役で保存' }));

      await waitFor(() => expect(screen.queryByTestId('form-stub')).toBeNull());
      expect(receivedQuotationApi.updateReceivedQuotation).toHaveBeenCalledWith(
        'rq-own',
        formSubmitData,
        '2026-10-06T09:30:00.000Z'
      );
      expect(receivedQuotationApi.createProjectReceivedQuotation).not.toHaveBeenCalled();
    });

    it('削除は確認のダイアログを経てから論理削除し、取り消せば削除しない（43.9）', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(within(await findRow('自前の見積書')).getByRole('button', { name: /削除/ }));
      let dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('自前の見積書');
      await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(receivedQuotationApi.deleteReceivedQuotation).not.toHaveBeenCalled();

      vi.mocked(receivedQuotationApi.getReceivedQuotationsByProject).mockResolvedValue([
        requestedQuotation,
      ]);
      await user.click(within(await findRow('自前の見積書')).getByRole('button', { name: /削除/ }));
      dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: '削除する' }));

      expect(receivedQuotationApi.deleteReceivedQuotation).toHaveBeenCalledWith(
        'rq-own',
        '2026-10-06T09:30:00.000Z'
      );
      await waitFor(() => expect(screen.queryByText('自前の見積書')).toBeNull());
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('削除の権限が無い（403）ときは操作の拒否を出す（43.11）', async () => {
      vi.mocked(receivedQuotationApi.deleteReceivedQuotation).mockRejectedValue(
        new ApiError(403, 'Insufficient permissions')
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(within(await findRow('自前の見積書')).getByRole('button', { name: /削除/ }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        PROJECT_QUOTATION_FORBIDDEN_MESSAGES.OPERATION
      );
      expect(screen.getByText('自前の見積書')).toBeInTheDocument();
    });

    it('削除が 404 を受けたときは受領見積書が見つからない旨を出す', async () => {
      vi.mocked(receivedQuotationApi.deleteReceivedQuotation).mockRejectedValue(
        new ApiError(404, 'Not Found', { code: 'NOT_FOUND' })
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(within(await findRow('自前の見積書')).getByRole('button', { name: /削除/ }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: '削除する' })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        RECEIVED_QUOTATION_NOT_FOUND_MESSAGE
      );
    });
  });

  describe('読み込みの失敗', () => {
    it('プロジェクトの読み込みが 404 のときは見つからない旨とプロジェクト一覧へのリンクを出し、再試行を出さない（43.13）', async () => {
      vi.mocked(getProject).mockRejectedValue(new ApiError(404, 'Not Found'));
      renderPage();

      expect(await screen.findByText(/プロジェクトが見つかりません/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /プロジェクト一覧に戻る/ })).toHaveAttribute(
        'href',
        '/projects'
      );
      expect(screen.queryByRole('button', { name: '再試行' })).toBeNull();
      expect(screen.queryByText(PROJECT_QUOTATION_LIST_TEXT.FETCH_FAILED)).toBeNull();
    });

    it('一覧の閲覧の権限が無い（403）ときはアクセスの拒否を出し、再試行と一覧を出さない（43.11）', async () => {
      vi.mocked(receivedQuotationApi.getReceivedQuotationsByProject).mockRejectedValue(
        new ApiError(403, 'Insufficient permissions')
      );
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        PROJECT_QUOTATION_FORBIDDEN_MESSAGES.VIEW
      );
      expect(screen.queryByRole('button', { name: '再試行' })).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(
        screen.queryByRole('button', { name: PROJECT_QUOTATION_LIST_TEXT.REGISTER_BUTTON })
      ).toBeNull();
    });

    it('それ以外の失敗は取得の失敗と再試行を出し、再試行で取り直す', async () => {
      vi.mocked(receivedQuotationApi.getReceivedQuotationsByProject)
        .mockRejectedValueOnce(new ApiError(500, 'boom'))
        .mockResolvedValueOnce([ownQuotation]);
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByText(PROJECT_QUOTATION_LIST_TEXT.FETCH_FAILED)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(await screen.findByText('自前の見積書')).toBeInTheDocument();
    });
  });
});
