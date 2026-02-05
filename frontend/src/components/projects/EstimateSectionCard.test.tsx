/**
 * @fileoverview EstimateSectionCardコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 19.1: EstimateSectionCardコンポーネントを実装する
 *
 * Requirements:
 * - 16.1: プロジェクト詳細画面の見積依頼セクションの下に見積書セクションを表示する
 * - 16.2: 見積書セクションにセクションタイトル「見積書」を表示する
 * - 16.3: 見積書セクションに見積書の総数を表示する（例：全5件）
 * - 16.4: 見積書セクションに直近の見積書をカード形式で表示する
 * - 16.5: 見積書カードに見積書名、作成日時、合計金額を表示する
 * - 16.6: 見積書カードをクリックすると見積書画面へ遷移する
 * - 16.7: 見積書セクションに「すべて見る」リンクを表示する
 * - 16.8: 「すべて見る」リンクをクリックすると見積書一覧画面へ遷移する
 * - 16.9: 見積書セクションに新規作成ボタンを表示する
 * - 16.10: 新規作成ボタンをクリックすると見積書作成画面へ遷移する
 * - 16.11: 見積書が存在しない場合、空状態を表示する（メッセージと新規作成ボタン）
 * - 16.12: 見積書セクションのローディング中にスケルトンローダーを表示する
 * - 16.13: 見積書セクションは既存の見積依頼セクションと同様のスタイルを使用する
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstimateSectionCard } from './EstimateSectionCard';
import type { EstimateInfo } from '../../api/estimates';

// ルーター付きレンダリングヘルパー
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

// テスト用モックデータ
const mockEstimates: EstimateInfo[] = [
  {
    id: 'estimate-1',
    projectId: 'project-123',
    name: '建築工事見積書#1',
    sourceItemizedStatementId: 'statement-1',
    sourceItemizedStatementName: '第1回見積内訳書',
    createdAt: '2024-05-15T10:00:00.000Z',
    updatedAt: '2024-05-15T10:00:00.000Z',
    totalAmount: '1500000',
  },
  {
    id: 'estimate-2',
    projectId: 'project-123',
    name: '電気設備見積書#2',
    sourceItemizedStatementId: null,
    sourceItemizedStatementName: null,
    createdAt: '2024-05-14T09:00:00.000Z',
    updatedAt: '2024-05-14T09:00:00.000Z',
    totalAmount: '750000',
  },
];

describe('EstimateSectionCard', () => {
  const projectId = 'project-123';

  describe('基本表示', () => {
    it('セクションタイトル「見積書」を表示する（Requirements: 16.2）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByText('見積書')).toBeInTheDocument();
    });

    it('総数を表示する（Requirements: 16.3）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByText('全5件')).toBeInTheDocument();
    });

    it('直近の見積書カードを表示する（Requirements: 16.4）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByText('建築工事見積書#1')).toBeInTheDocument();
      expect(screen.getByText('電気設備見積書#2')).toBeInTheDocument();
    });

    it('見積書カードに作成日時を表示する（Requirements: 16.5）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      // 日付フォーマット: 2024年5月15日
      expect(screen.getByText(/2024年5月15日/)).toBeInTheDocument();
      expect(screen.getByText(/2024年5月14日/)).toBeInTheDocument();
    });

    it('見積書カードに合計金額を表示する（Requirements: 16.5）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByText(/1,500,000円/)).toBeInTheDocument();
      expect(screen.getByText(/750,000円/)).toBeInTheDocument();
    });
  });

  describe('ナビゲーション', () => {
    it('見積書カードが詳細画面への遷移リンクを持つ（Requirements: 16.6）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const link = screen.getByLabelText('建築工事見積書#1の見積書詳細を見る');
      expect(link).toHaveAttribute('href', '/estimates/estimate-1');
    });

    it('「すべて見る」リンクが見積書一覧画面へ遷移する（Requirements: 16.7, 16.8）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/estimates`);
    });

    it('新規作成ボタンが見積書作成画面へ遷移する（Requirements: 16.9, 16.10）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const button = screen.getByLabelText('見積書を新規作成');
      expect(button).toHaveAttribute('href', `/projects/${projectId}/estimates/new`);
    });
  });

  describe('空状態', () => {
    it('見積書が0件の場合はメッセージを表示する（Requirements: 16.11）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={0}
          latestEstimates={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/見積書はまだありません/)).toBeInTheDocument();
    });

    it('見積書が0件の場合、メッセージの下に新規作成リンクを表示する（Requirements: 16.11）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={0}
          latestEstimates={[]}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /新規作成/ });
      expect(link).toHaveAttribute('href', `/projects/${projectId}/estimates/new`);
    });

    it('見積書が0件の場合、セクション右上の「すべて見る」リンクを非表示にする', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={0}
          latestEstimates={[]}
          isLoading={false}
        />
      );

      expect(screen.queryByRole('link', { name: /すべて見る/ })).not.toBeInTheDocument();
    });

    it('見積書が0件の場合、セクション右上の「新規作成」ボタン（aria-label付き）を非表示にする', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={0}
          latestEstimates={[]}
          isLoading={false}
        />
      );

      expect(screen.queryByLabelText('見積書を新規作成')).not.toBeInTheDocument();
    });
  });

  describe('データが存在する場合', () => {
    it('見積書が存在する場合、セクション右上に「新規作成」ボタンを表示する', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const button = screen.getByLabelText('見積書を新規作成');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('href', `/projects/${projectId}/estimates/new`);
    });

    it('見積書が存在する場合、セクション右上に「すべて見る」リンクを表示する', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const link = screen.getByRole('link', { name: /すべて見る/ });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', `/projects/${projectId}/estimates`);
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中はスケルトンを表示する（Requirements: 16.12）', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={0}
          latestEstimates={[]}
          isLoading={true}
        />
      );

      expect(screen.getByTestId('estimate-section-skeleton')).toBeInTheDocument();
    });

    it('ローディング中は総数を非表示にする', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={true}
        />
      );

      expect(screen.queryByText('全5件')).not.toBeInTheDocument();
    });
  });

  describe('アイコン表示', () => {
    it('見積書アイコン（ドキュメントアイコン）を表示する', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      // 各見積書カードにアイコンが表示されていることを確認（複数存在）
      const icons = screen.getAllByTestId('estimate-icon');
      expect(icons.length).toBe(2); // mockEstimatesは2件
    });
  });

  describe('アクセシビリティ', () => {
    it('セクション要素を持つ', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('見出し要素を持つ', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      expect(screen.getByRole('heading', { name: '見積書' })).toBeInTheDocument();
    });

    it('リンクに適切なaria-labelを持つ', () => {
      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={5}
          latestEstimates={mockEstimates}
          isLoading={false}
        />
      );

      const link = screen.getByLabelText('建築工事見積書#1の見積書詳細を見る');
      expect(link).toBeInTheDocument();
    });
  });

  describe('金額表示', () => {
    it('合計金額がnullの場合は金額を表示しない', () => {
      const estimatesWithNullAmount: EstimateInfo[] = [
        {
          id: 'estimate-3',
          projectId: 'project-123',
          name: '見積書#3',
          sourceItemizedStatementId: null,
          sourceItemizedStatementName: null,
          createdAt: '2024-05-16T10:00:00.000Z',
          updatedAt: '2024-05-16T10:00:00.000Z',
          totalAmount: null,
        },
      ];

      renderWithRouter(
        <EstimateSectionCard
          projectId={projectId}
          totalCount={1}
          latestEstimates={estimatesWithNullAmount}
          isLoading={false}
        />
      );

      // 見積書名は表示されるが、金額は表示されない
      expect(screen.getByText('見積書#3')).toBeInTheDocument();
      expect(screen.queryByText(/円/)).not.toBeInTheDocument();
    });
  });
});
