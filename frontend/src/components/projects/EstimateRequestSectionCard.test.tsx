/**
 * @fileoverview EstimateRequestSectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.1: EstimateRequestSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 1.1: プロジェクト詳細画面に見積依頼セクションを表示する
 * - 1.2: 見積依頼の総数とヘッダーを表示する
 * - 1.3: 直近の見積依頼カードを一覧表示する
 * - 1.4: 見積依頼一覧画面への遷移リンク
 * - 1.5: 見積依頼詳細画面への遷移リンク
 * - 2.1: 空状態表示（見積依頼がない場合）
 * - 2.2: 新規作成ボタン
 * - 2.4: 一覧に見積依頼の名前、宛先、見積依頼方法、参照内訳書名、作成日時を表示
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstimateRequestSectionCard } from './EstimateRequestSectionCard';
import type { EstimateRequestInfo } from '../../types/estimate-request.types';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockEstimateRequests: EstimateRequestInfo[] = [
  {
    id: 'request-1',
    projectId: 'project-123',
    tradingPartnerId: 'partner-1',
    tradingPartnerName: '株式会社ABC工業',
    itemizedStatementId: 'statement-1',
    itemizedStatementName: '第1回見積内訳書',
    name: '見積依頼#1',
    method: 'EMAIL',
    includeBreakdownInBody: false,
    createdAt: '2024-05-15T00:00:00.000Z',
    updatedAt: '2024-05-15T00:00:00.000Z',
  },
  {
    id: 'request-2',
    projectId: 'project-123',
    tradingPartnerId: 'partner-2',
    tradingPartnerName: '有限会社XYZ建設',
    itemizedStatementId: 'statement-1',
    itemizedStatementName: '第1回見積内訳書',
    name: '見積依頼#2',
    method: 'FAX',
    includeBreakdownInBody: true,
    createdAt: '2024-05-14T00:00:00.000Z',
    updatedAt: '2024-05-14T00:00:00.000Z',
  },
];

describe('EstimateRequestSectionCard', () => {
  const projectId = 'project-123';

  describe('基本表示', () => {
    it('セクションタイトル「見積依頼」を表示する（Requirements: 1.1）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByText('見積依頼')).toBeInTheDocument();
    });

    it('総数を表示する（Requirements: 1.2）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('直近の見積依頼カードを表示する（Requirements: 1.3）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByText('見積依頼#1')).toBeInTheDocument();
      expect(screen.getByText('見積依頼#2')).toBeInTheDocument();
    });

    it('取引先名を表示する（Requirements: 2.4）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByText(/株式会社ABC工業/)).toBeInTheDocument();
      expect(screen.getByText(/有限会社XYZ建設/)).toBeInTheDocument();
    });

    it('見積依頼方法を表示する（Requirements: 2.4）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByText(/メール/)).toBeInTheDocument();
      expect(screen.getByText(/FAX/)).toBeInTheDocument();
    });

    it('作成日を表示する（Requirements: 2.4）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      // 日付フォーマット: 2024年5月15日
      expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
      expect(screen.getByText(/2024年5月14日/)).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('「すべて見る」リンクが見積依頼一覧に遷移する（Requirements: 1.4）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/estimate-requests`);
    });

    it('見積依頼カードが詳細画面への遷移リンクを持つ（Requirements: 1.5）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      // 見積依頼カードへのリンクを取得
      const link = screen.getByLabelText('見積依頼#1の見積依頼詳細を見る');
      expect(link).toHaveAttribute('href', `/estimate-requests/request-1`);
    });
  });

  describe('空状態', () => {
    it('見積依頼が0件の場合はメッセージを表示する（Requirements: 2.1）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={0}
          latestRequests={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/見積依頼はまだありません/)).toBeInTheDocument();
    });

    it('見積依頼が0件でも新規作成リンクを表示する（Requirements: 2.2）', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={0}
          latestRequests={[]}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /新規作成/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/estimate-requests/new`);
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={0}
          latestRequests={[]}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('estimate-request-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数を非表示にする', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={true}
        />
      );

      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });
  });

  describe('アイコン表示', () => {
    it('見積依頼アイコンを表示する', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      // 各見積依頼カードにアイコンが表示されていることを確認（複数存在）
      const icons = screen.getAllByTestId('estimate-request-icon');
      expect(icons.length).toBe(2); // mockEstimateRequestsは2件
    });
  });

  describe('アクセシビリティ', () => {
    it('セクション要素を持つ', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('見出し要素を持つ', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      expect(screen.getByRole('heading', { name: '見積依頼' })).toBeInTheDocument();
    });

    it('リンクに適切なaria-labelを持つ', () => {
      renderWithRouter(
        <EstimateRequestSectionCard
          projectId={projectId}
          totalCount={5}
          latestRequests={mockEstimateRequests}
          isLoading={false}
        />
      );

      const link = screen.getByLabelText('見積依頼#1の見積依頼詳細を見る');
      expect(link).toBeInTheDocument();
    });
  });
});
