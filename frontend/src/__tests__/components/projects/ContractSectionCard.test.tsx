/**
 * @fileoverview ContractSectionCard コンポーネントのテスト
 *
 * Task 57.2: ContractSectionCardの単体テスト
 *
 * Requirements:
 * - 36.1: プロジェクト詳細画面の見積書セクションの下に契約書セクションを表示する
 * - 36.2: 契約書セクションにセクションタイトル「契約書」を表示する
 * - 36.3: 契約書セクションに契約書の総数を表示する（例：全5件）
 * - 36.4: 契約書セクションに直近の契約書をカード形式で表示する
 * - 36.5: 契約書カードに契約種類、契約日、ステータス、請負代金額を表示する
 * - 36.6: ユーザーが契約書カードをクリックした場合、契約書詳細画面へ遷移する
 * - 36.7: 契約書セクションに「すべて見る」リンクを提供する
 * - 36.8: 「すべて見る」リンクで契約書一覧画面へ遷移する
 * - 36.9: 契約書セクションに新規作成ボタンを提供する
 * - 36.10: 新規作成ボタンで契約書作成画面へ遷移する
 * - 36.11: 契約書が存在しない場合、「契約書はまだありません」メッセージと新規作成ボタンを表示する
 * - 36.12: 契約書データをロード中の場合、スケルトンローダーを表示する
 * - 36.13: 契約書セクションのUIを既存の見積書セクションと同様のスタイルで提供する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import {
  ContractSectionCard,
  type ContractSectionItem,
} from '../../../components/projects/ContractSectionCard';

// テストデータ
const PROJECT_ID = 'project-test-123';

const mockContracts: ContractSectionItem[] = [
  {
    id: 'contract-1',
    contractType: 'NEW',
    contractDate: '2025-06-01',
    status: 'CONTRACTED',
    contractAmount: 5000000,
    createdAt: '2025-06-01T00:00:00.000Z',
  },
  {
    id: 'contract-2',
    contractType: 'AMENDMENT',
    contractDate: '2025-07-15',
    status: 'BEFORE_CONTRACT',
    contractAmount: 6500000,
    createdAt: '2025-07-15T00:00:00.000Z',
  },
];

/**
 * テストヘルパー: BrowserRouter内でレンダリング
 */
function renderComponent(props: Partial<React.ComponentProps<typeof ContractSectionCard>> = {}) {
  const defaultProps = {
    projectId: PROJECT_ID,
    totalCount: 2,
    latestContracts: mockContracts,
    isLoading: false,
    ...props,
  };

  return render(
    <BrowserRouter>
      <ContractSectionCard {...defaultProps} />
    </BrowserRouter>
  );
}

describe('ContractSectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // セクションタイトルと総数表示 (36.2, 36.3)
  // ==========================================================================
  describe('セクションタイトルと総数表示 (36.2, 36.3)', () => {
    it('セクションタイトル「契約書」が表示される (36.2)', () => {
      renderComponent();
      expect(screen.getByText('契約書')).toBeInTheDocument();
    });

    it('契約書の総数が「全N件」形式で表示される (36.3)', () => {
      renderComponent({ totalCount: 5 });
      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('総数が0件の場合「全0件」と表示される', () => {
      renderComponent({ totalCount: 0, latestContracts: [] });
      expect(screen.getByText('全0件')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 契約書カード表示 (36.4, 36.5)
  // ==========================================================================
  describe('契約書カード表示 (36.4, 36.5)', () => {
    it('直近の契約書がカード形式で表示される (36.4)', () => {
      renderComponent();
      expect(screen.getByTestId('contract-card-contract-1')).toBeInTheDocument();
      expect(screen.getByTestId('contract-card-contract-2')).toBeInTheDocument();
    });

    it('契約種類が表示される（新規契約） (36.5)', () => {
      renderComponent();
      expect(screen.getByText('新規契約')).toBeInTheDocument();
    });

    it('契約種類が表示される（変更契約） (36.5)', () => {
      renderComponent();
      expect(screen.getByText('変更契約')).toBeInTheDocument();
    });

    it('ステータスが表示される（契約済） (36.5)', () => {
      renderComponent();
      expect(screen.getByText('契約済')).toBeInTheDocument();
    });

    it('ステータスが表示される（契約前） (36.5)', () => {
      renderComponent();
      expect(screen.getByText('契約前')).toBeInTheDocument();
    });

    it('請負代金額がフォーマットされて表示される (36.5)', () => {
      renderComponent();
      // 5,000,000円
      expect(screen.getByText(/5,000,000円/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // リンク遷移先テスト (36.6, 36.7, 36.8, 36.9, 36.10)
  // ==========================================================================
  describe('リンク遷移先 (36.6, 36.7, 36.8, 36.9, 36.10)', () => {
    it('契約書カードクリックで詳細画面へ遷移するリンクが設定される (36.6)', () => {
      renderComponent();
      const card = screen.getByTestId('contract-card-contract-1');
      expect(card).toHaveAttribute('href', `/projects/${PROJECT_ID}/contracts/contract-1`);
    });

    it('「すべて見る」リンクで一覧画面へ遷移する (36.7, 36.8)', () => {
      renderComponent();
      const viewAllLink = screen.getByText('すべて見る');
      expect(viewAllLink).toHaveAttribute('href', `/projects/${PROJECT_ID}/contracts`);
    });

    it('新規作成ボタンで作成画面へ遷移する (36.9, 36.10)', () => {
      renderComponent();
      // ヘッダー内の新規作成ボタン（契約書がある場合）
      const headerActions = screen.getByLabelText('契約書を新規作成');
      expect(headerActions).toHaveAttribute('href', `/projects/${PROJECT_ID}/contracts/new`);
    });

    it('契約書が0件の場合、ヘッダーに「すべて見る」「新規作成」ボタンが表示されない', () => {
      renderComponent({ totalCount: 0, latestContracts: [] });
      expect(screen.queryByText('すべて見る')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('契約書を新規作成')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 空状態表示 (36.11)
  // ==========================================================================
  describe('空状態 (36.11)', () => {
    it('契約書が存在しない場合「契約書はまだありません」メッセージが表示される (36.11)', () => {
      renderComponent({ totalCount: 0, latestContracts: [] });
      expect(screen.getByText('契約書はまだありません')).toBeInTheDocument();
    });

    it('空状態で新規作成ボタン（リンク）が表示される (36.11)', () => {
      renderComponent({ totalCount: 0, latestContracts: [] });
      const createLink = screen.getByText('新規作成');
      expect(createLink).toHaveAttribute('href', `/projects/${PROJECT_ID}/contracts/new`);
    });
  });

  // ==========================================================================
  // スケルトンローダー (36.12)
  // ==========================================================================
  describe('スケルトンローダー (36.12)', () => {
    it('ローディング中にスケルトンが表示される (36.12)', () => {
      renderComponent({ isLoading: true });
      expect(screen.getByTestId('contract-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数が表示されない', () => {
      renderComponent({ isLoading: true, totalCount: 5 });
      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });

    it('ローディング中はカードが表示されない', () => {
      renderComponent({ isLoading: true });
      expect(screen.queryByTestId('contract-card-contract-1')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // アクセシビリティ
  // ==========================================================================
  describe('アクセシビリティ', () => {
    it('section要素にrole="region"が設定される', () => {
      renderComponent();
      const section = screen.getByTestId('contract-section');
      expect(section).toHaveAttribute('role', 'region');
    });

    it('section要素にaria-labelledbyが設定される', () => {
      renderComponent();
      const section = screen.getByTestId('contract-section');
      expect(section).toHaveAttribute('aria-labelledby', 'contract-section-title');
    });
  });
});
