/**
 * @fileoverview ReceivedQuotationSectionCard コンポーネントのテスト
 *
 * Task 77.3: 受領見積書セクションの部品
 *
 * Requirements (project-management): 42.3, 42.4, 42.5, 42.6, 42.7, 42.8, 42.9,
 * 42.10, 42.11, 42.12, 42.13, 42.14
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  ReceivedQuotationSectionCard,
  type ReceivedQuotationSectionItem,
} from '../../../components/projects/ReceivedQuotationSectionCard';

const PROJECT_ID = 'project-test-123';
const LIST_PATH = `/projects/${PROJECT_ID}/quotations`;

const mockReceivedQuotations: ReceivedQuotationSectionItem[] = [
  {
    id: 'rq-1',
    name: '電気設備工事 見積',
    vendorName: '株式会社電設',
    submittedAt: '2026-10-05T00:00:00.000Z',
    netAmount: 1234567,
    createdAt: '2026-10-06T09:00:00.000Z',
  },
  {
    id: 'rq-2',
    name: '空調工事 見積',
    vendorName: '空調サービス株式会社',
    submittedAt: '2026-09-20T00:00:00.000Z',
    netAmount: null,
    createdAt: '2026-09-21T09:00:00.000Z',
  },
];

/** 遷移先の画面で、パスと遷移の状態を書き出す */
function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <p data-testid="location-path">{location.pathname}</p>
      <p data-testid="location-state">{JSON.stringify(location.state ?? null)}</p>
    </div>
  );
}

function renderComponent(
  props: Partial<React.ComponentProps<typeof ReceivedQuotationSectionCard>> = {}
) {
  const defaultProps = {
    projectId: PROJECT_ID,
    totalCount: 5,
    latestReceivedQuotations: mockReceivedQuotations,
    isLoading: false,
    canRegister: true,
    ...props,
  };

  return render(
    <MemoryRouter initialEntries={[`/projects/${PROJECT_ID}`]}>
      <Routes>
        <Route
          path="/projects/:projectId"
          element={<ReceivedQuotationSectionCard {...defaultProps} />}
        />
        <Route path="/projects/:projectId/quotations" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

/** 表示の日付（提出日）を一覧画面と同じ YYYY/MM/DD で作る */
function expectedDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

describe('ReceivedQuotationSectionCard', () => {
  describe('見出しと総数 (42.3, 42.4)', () => {
    it('見出し「受領見積書」を出す (42.3)', () => {
      renderComponent();
      expect(screen.getByRole('heading', { name: '受領見積書' })).toBeInTheDocument();
    });

    it('総数を「全N件」で出す (42.4)', () => {
      renderComponent({ totalCount: 5 });
      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('0件のときは「全0件」を出す (42.4)', () => {
      renderComponent({ totalCount: 0, latestReceivedQuotations: [] });
      expect(screen.getByText('全0件')).toBeInTheDocument();
    });
  });

  describe('カードの表示 (42.5, 42.6)', () => {
    it('直近の受領見積書を渡された順にカードで出す (42.5)', () => {
      renderComponent();
      const cards = screen.getAllByTestId(/^received-quotation-card-/);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveAttribute('data-testid', 'received-quotation-card-rq-1');
      expect(cards[1]).toHaveAttribute('data-testid', 'received-quotation-card-rq-2');
    });

    it('カードに受領見積書名・業者名・提出日・NET金額を出す (42.6)', () => {
      renderComponent();
      const card = within(screen.getByTestId('received-quotation-card-rq-1'));
      expect(card.getByText('電気設備工事 見積')).toBeInTheDocument();
      expect(card.getByText('株式会社電設')).toBeInTheDocument();
      expect(
        card.getByText(`提出日 ${expectedDate('2026-10-05T00:00:00.000Z')}`)
      ).toBeInTheDocument();
      expect(card.getByText('NET 1,234,567円')).toBeInTheDocument();
    });

    it('NET金額が空のカードは「-」を出す (42.6)', () => {
      renderComponent();
      const card = within(screen.getByTestId('received-quotation-card-rq-2'));
      expect(card.getByText('NET -')).toBeInTheDocument();
    });
  });

  describe('遷移 (42.7, 42.8, 42.9, 42.10, 42.11)', () => {
    it('カードを押すと案件の受領見積書の一覧へ移る (42.7)', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByTestId('received-quotation-card-rq-1'));
      expect(screen.getByTestId('location-path')).toHaveTextContent(LIST_PATH);
      expect(screen.getByTestId('location-state')).toHaveTextContent('null');
    });

    it('受領見積書があるとき「すべて見る」で一覧へ移る (42.8, 42.9)', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('link', { name: 'すべて見る' }));
      expect(screen.getByTestId('location-path')).toHaveTextContent(LIST_PATH);
      expect(screen.getByTestId('location-state')).toHaveTextContent('null');
    });

    it('「新規登録」で一覧へ移り、登録フォームを開く遷移の状態を付ける (42.10, 42.11)', async () => {
      const user = userEvent.setup();
      renderComponent();
      await user.click(screen.getByRole('link', { name: '受領見積書を新規登録' }));
      expect(screen.getByTestId('location-path')).toHaveTextContent(LIST_PATH);
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        openRegisterForm: true,
      });
    });

    it('登録の権限が無いときは「新規登録」を出さない (42.10)', () => {
      renderComponent({ canRegister: false });
      expect(screen.queryByRole('link', { name: '受領見積書を新規登録' })).not.toBeInTheDocument();
      expect(screen.queryByText('新規登録')).not.toBeInTheDocument();
      // すべて見るは権限に関わらず出す
      expect(screen.getByRole('link', { name: 'すべて見る' })).toBeInTheDocument();
    });
  });

  describe('空の表示 (42.12)', () => {
    it('受領見積書が無いとき「受領見積書はまだありません」を出し、すべて見るを出さない (42.8, 42.12)', () => {
      renderComponent({ totalCount: 0, latestReceivedQuotations: [] });
      expect(screen.getByText('受領見積書はまだありません')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'すべて見る' })).not.toBeInTheDocument();
      expect(screen.queryAllByTestId(/^received-quotation-card-/)).toHaveLength(0);
    });

    it('空のとき、登録の権限があれば「新規登録」を一つだけ出し、状態を付けて一覧へ移る (42.11, 42.12)', async () => {
      const user = userEvent.setup();
      renderComponent({ totalCount: 0, latestReceivedQuotations: [] });
      const links = screen.getAllByRole('link', { name: '受領見積書を新規登録' });
      expect(links).toHaveLength(1);
      await user.click(links[0]!);
      expect(screen.getByTestId('location-path')).toHaveTextContent(LIST_PATH);
      expect(JSON.parse(screen.getByTestId('location-state').textContent ?? 'null')).toEqual({
        openRegisterForm: true,
      });
    });

    it('空のとき、登録の権限が無ければ「新規登録」を出さない (42.12)', () => {
      renderComponent({ totalCount: 0, latestReceivedQuotations: [], canRegister: false });
      expect(screen.getByText('受領見積書はまだありません')).toBeInTheDocument();
      expect(screen.queryByText('新規登録')).not.toBeInTheDocument();
    });
  });

  describe('骨組み (42.13)', () => {
    it('ロード中は骨組みを出し、総数・カード・空の表示・操作を出さない (42.13)', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByTestId('received-quotation-section-skeleton')).toBeInTheDocument();
      expect(screen.queryByText(/^全\d+件$/)).not.toBeInTheDocument();
      expect(screen.queryAllByTestId(/^received-quotation-card-/)).toHaveLength(0);
      expect(screen.queryByText('受領見積書はまだありません')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'すべて見る' })).not.toBeInTheDocument();
      expect(screen.queryByText('新規登録')).not.toBeInTheDocument();
    });

    it('ロード中は区画に aria-busy を付ける (42.13)', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByRole('region', { name: '受領見積書' })).toHaveAttribute(
        'aria-busy',
        'true'
      );
    });
  });

  describe('工程表セクションと同じ形 (42.14)', () => {
    it('見出しで名付けた region として出す (42.14)', () => {
      renderComponent();
      const region = screen.getByRole('region', { name: '受領見積書' });
      expect(region).toHaveAttribute('aria-labelledby', 'received-quotation-section-title');
      expect(region).toHaveAttribute('aria-busy', 'false');
    });
  });
});
