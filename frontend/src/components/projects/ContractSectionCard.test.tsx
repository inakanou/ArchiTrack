/**
 * @fileoverview ContractSectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 9.1: プロジェクト詳細画面から契約書一覧への導線を追加する
 *
 * Requirements (contract-management):
 * - REQ-1.4: ユーザーが新規作成ボタンを押した場合、契約書新規作成画面に遷移する
 * - REQ-1.5: ユーザーが一覧の契約書を選択した場合、選択した契約書の詳細画面に遷移する
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContractSectionCard } from './ContractSectionCard';
import type { ContractSectionCardProps } from './ContractSectionCard';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockContracts: ContractSectionCardProps['latestContracts'] = [
  {
    id: 'contract-1',
    contractType: 'NEW',
    contractDate: '2024-05-15',
    status: 'BEFORE_CONTRACT',
    contractAmount: 15000000,
    createdAt: '2024-05-15T10:00:00.000Z',
  },
  {
    id: 'contract-2',
    contractType: 'AMENDMENT',
    contractDate: '2024-06-01',
    status: 'CONTRACTED',
    contractAmount: 18000000,
    createdAt: '2024-06-01T09:00:00.000Z',
  },
];

describe('ContractSectionCard', () => {
  const projectId = 'project-123';

  describe('基本表示', () => {
    it('セクションタイトル「契約書」を表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText('契約書')).toBeInTheDocument();
    });

    it('総数を表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('直近の契約書カードを表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText('新規契約')).toBeInTheDocument();
      expect(screen.getByText('変更契約')).toBeInTheDocument();
    });

    it('契約書カードにステータスを表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText('契約前')).toBeInTheDocument();
      expect(screen.getByText('契約済')).toBeInTheDocument();
    });

    it('契約書カードに契約日を表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
      expect(screen.getByText(/2024年6月1日/)).toBeInTheDocument();
    });

    it('契約書カードに請負代金額を表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByText(/15,000,000円/)).toBeInTheDocument();
      expect(screen.getByText(/18,000,000円/)).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('契約書カードが詳細画面への遷移リンクを持つ（Requirements: 1.5）', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      const link = screen.getByTestId('contract-card-contract-1');
      expect(link).toHaveAttribute('href', `/projects/${projectId}/contracts/contract-1`);
    });

    it('「すべて見る」リンクが契約書一覧画面へ遷移する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/contracts`);
    });

    it('新規作成ボタンが契約書作成画面へ遷移する（Requirements: 1.4）', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      const button = screen.getByLabelText('契約書を新規作成');
      expect(button).toHaveAttribute('href', `/projects/${projectId}/contracts/new`);
    });
  });

  describe('空状態', () => {
    it('契約書が0件の場合はメッセージを表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={0}
          latestContracts={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/契約書はまだありません/)).toBeInTheDocument();
    });

    it('契約書が0件の場合、メッセージの下に新規作成リンクを表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={0}
          latestContracts={[]}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /新規作成/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/contracts/new`);
    });

    it('契約書が0件の場合、セクション右上の「すべて見る」リンクを非表示にする', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={0}
          latestContracts={[]}
          isLoading={false}
        />
      );

      expect(screen.queryByRole('link', { name: /すべて見る/ })).not.toBeInTheDocument();
    });

    it('契約書が0件の場合、セクション右上の「新規作成」ボタンを非表示にする', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={0}
          latestContracts={[]}
          isLoading={false}
        />
      );

      expect(screen.queryByLabelText('契約書を新規作成')).not.toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={0}
          latestContracts={[]}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('contract-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数を非表示にする', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={true}
        />
      );

      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('セクション要素を持つ', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('見出し要素を持つ', () => {
      renderWithRouter(
        <ContractSectionCard
          projectId={projectId}
          totalCount={5}
          latestContracts={mockContracts}
          isLoading={false}
        />
      );

      expect(screen.getByRole('heading', { name: '契約書' })).toBeInTheDocument();
    });
  });
});
