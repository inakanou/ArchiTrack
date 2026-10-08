/**
 * @fileoverview 見積依頼の作成・編集のフォームと受領見積書のフォームのフォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く
 * （steering `tech.md` の「フォーカス表示方針」）。部品の側は、その規則を打ち消す `outline: none` を
 * インラインで持たないことで規則に乗る（タスク 101.1）。
 * ここでは、見積依頼の作成のフォーム（EstimateRequestForm）・編集画面（EstimateRequestEditPage）・
 * 受領見積書のフォーム（ReceivedQuotationForm）・明細行のエディタ（LineItemEditor）の、
 * キーボードで止まる部品のどれもがインラインで outline を打ち消していないことを確かめる。
 * 詳細画面の状態遷移の釦（StatusTransitionButton）は共通の outline を `focus:outline-none` で消し、
 * 自前の輪（Tailwind の ring）で示すため、その輪が色を持つ（currentColor の白にならない）ことを確かめる。
 * 規則そのものの太さとコントラスト比は `focus-visible.test.tsx` が確かめ、実際のブラウザで
 * フォーカス中に表示が出ることは e2e/specs/estimate-requests/estimate-request-focus-visible.spec.ts
 * が主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (estimate-request):
 * 対象の部品の受け入れ条件にフォーカス表示の見え方を定める項は無いため、要件番号は名乗らない。
 * タスク 101.1 は、要件 3・9・11 の画面の上で steering の方針の下限へ揃える。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'tp-1',
        name: '協力業者A',
        nameKana: 'キョウリョクギョウシャA',
        types: ['SUBCONTRACTOR'],
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  }),
}));

vi.mock('../../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn().mockResolvedValue({
    data: [{ id: 'is-1', name: '内訳書1', itemCount: 10 }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  }),
}));

vi.mock('../../api/estimate-requests', () => ({
  getEstimateRequestDetail: vi.fn().mockResolvedValue({
    id: 'er-123',
    projectId: 'project-123',
    tradingPartnerId: 'tp-1',
    tradingPartnerName: '協力業者A',
    itemizedStatementId: 'is-1',
    itemizedStatementName: '内訳書1',
    name: 'テスト見積依頼',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }),
  updateEstimateRequest: vi.fn(),
}));

// ReceivedQuotationForm は useAuth() を直接購読するため、AuthProvider の無い単体の環境向けに最小限を返す
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ sessionExpiredDuringOperation: false, sessionExpired: false }),
}));

// ファイルを選ぶ前は描画されないプレビュー（pdf.js などの重い依存を読み込まない）
vi.mock('../../components/estimate-requests/FileInlinePreview', () => ({
  FileInlinePreview: () => null,
  default: () => null,
}));

import { EstimateRequestForm } from '../../components/estimate-request/EstimateRequestForm';
import EstimateRequestEditPage from '../../pages/EstimateRequestEditPage';
import { ReceivedQuotationForm } from '../../components/estimate-requests/ReceivedQuotationForm';
import { StatusTransitionButton } from '../../components/estimate-request/StatusTransitionButton';
import {
  LineItemEditor,
  createEmptyLineItem,
} from '../../components/estimate-requests/LineItemEditor';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

/** キーボードで止まる部品（無効化されていないもの） */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableControls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // display: none の隠しのファイル入力はキーボードで止まらない
    (control) => control.style.display !== 'none'
  );
}

/** 部品の名前（aria-label、無ければ結び付いた label の文言、無ければ文言） */
function controlName(control: HTMLElement): string {
  const labels =
    control instanceof HTMLInputElement || control instanceof HTMLSelectElement
      ? control.labels
      : null;
  const labelText = (labels?.[0]?.textContent ?? '').replace(/\*/g, '').trim();
  const text = (control.textContent ?? '').replace(/\s+/g, ' ').trim();
  return `${control.tagName.toLowerCase()} "${control.getAttribute('aria-label') ?? (labelText || text)}"`;
}

function isOutlineSuppressed(control: HTMLElement): boolean {
  return control.style.outlineStyle === 'none' || control.style.outline === 'none';
}

/** インラインで outline を打ち消している部品の名前の一覧（空なら満たす） */
function suppressedControls(controls: HTMLElement[]): string[] {
  return controls.filter(isOutlineSuppressed).map(controlName);
}

describe('見積依頼の部品・ページが共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけキーボード操作でフォーカスが見えなくなる。
   */
  it('作成のフォームの見積依頼名・内訳書の欄と釦がインラインで outline を消していない', async () => {
    const { container } = render(
      <EstimateRequestForm projectId="project-1" onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /内訳書1/ })).toBeInTheDocument();
    });

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByRole('textbox', { name: /見積依頼名/ }),
        screen.getByRole('combobox', { name: '内訳書' }),
        screen.getByRole('button', { name: 'キャンセル' }),
        screen.getByRole('button', { name: '作成' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('編集画面の名前の欄と釦がインラインで outline を消していない', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/estimate-requests/er-123/edit']}>
        <Routes>
          <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /名前/ })).toHaveValue('テスト見積依頼');
    });

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByRole('textbox', { name: /名前/ }),
        screen.getByRole('button', { name: 'キャンセル' }),
        screen.getByRole('button', { name: '更新' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('受領見積書のフォームの全部品（明細行のエディタを含む）がインラインで outline を消していない', () => {
    const { container } = render(
      <ReceivedQuotationForm
        mode="create"
        estimateRequestId="er-123"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        selectedItems={[]}
      />
    );

    const controls = getFocusableControls(container);
    expect(controls).toEqual(
      expect.arrayContaining([
        screen.getByRole('textbox', { name: /受領見積書名/ }),
        screen.getByLabelText(/提出日/),
        screen.getByRole('textbox', { name: '行1 任意分類' }),
        screen.getByRole('textbox', { name: '行1 備考' }),
        screen.getByRole('textbox', { name: 'NET金額' }),
      ])
    );
    expect(suppressedControls(controls)).toEqual([]);
  });

  it('明細行のエディタの全行の8つの入力欄がインラインで outline を消していない', () => {
    const { container } = render(
      <LineItemEditor
        lineItems={[createEmptyLineItem(0), createEmptyLineItem(1)]}
        onLineItemsChange={vi.fn()}
      />
    );

    const inputs = getFocusableControls(container).filter((control) => control.matches('input'));
    expect(inputs).toHaveLength(16);
    expect(suppressedControls(inputs)).toEqual([]);
  });
});

describe('見積依頼の詳細画面の状態遷移の釦のフォーカスの輪', () => {
  /**
   * 状態遷移の釦は共通の outline を `focus:outline-none` で消し、自前の輪（Tailwind の ring）で示す。
   * 輪の色を指定しないと Tailwind v4 では currentColor（釦の文字の白）で描かれ、白のカードの上では
   * 見えない（コントラスト比 1:1）。steering の下限（2px 以上・隣接色に対して 3:1 以上）を満たすよう、
   * 前例（project-management 72.3・trading-partner-management 33.4）と同じ blue-500 で描く。
   * 実際の太さとコントラスト比は e2e/specs/estimate-requests/estimate-request-focus-visible.spec.ts が確かめる。
   */
  it.each([
    ['BEFORE_REQUEST', 'ステータスを依頼済に変更する'],
    ['REQUESTED', 'ステータスを見積受領済に変更する'],
    ['QUOTATION_RECEIVED', 'ステータスを依頼済に戻す'],
  ] as const)('%s の釦が outline を消すなら 2px の blue-500 の輪で示す', (status, name) => {
    render(
      <StatusTransitionButton
        status={status}
        onTransition={vi.fn().mockResolvedValue(undefined)}
        onSuccess={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name });
    const classes = button.className.split(/\s+/);

    expect({
      outlineNone: classes.includes('focus:outline-none'),
      ringWidth: classes.includes('focus:ring-2'),
      ringBlue500: classes.includes('focus:ring-blue-500'),
    }).toEqual({ outlineNone: true, ringWidth: true, ringBlue500: true });
  });
});
