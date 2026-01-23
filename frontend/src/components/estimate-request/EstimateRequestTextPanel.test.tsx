/**
 * @fileoverview EstimateRequestTextPanelコンポーネントのテスト
 *
 * TDD: RED phase - テストを先に書く
 *
 * Task 5.5: EstimateRequestTextPanelコンポーネントを実装する
 *
 * Requirements:
 * - 6.1: 見積依頼文を表示するパネルを提供する
 * - 6.2: 宛先（メールアドレスまたはFAX番号）を表示する
 * - 6.3: 表題を表示する
 * - 6.4: 本文を表示する
 * - 6.5: メールアドレス未登録時のエラー表示
 * - 6.6: FAX番号未登録時のエラー表示
 * - 6.7: 各項目にクリップボードコピーボタンを表示する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EstimateRequestTextPanel } from './EstimateRequestTextPanel';
import type { EstimateRequestText } from '../../types/estimate-request.types';

describe('EstimateRequestTextPanel', () => {
  const mockText: EstimateRequestText = {
    recipient: 'test@example.com',
    subject: '[プロジェクト名] 御見積依頼',
    body: `株式会社テスト 御中

いつもお世話になっております。
下記の件について、御見積をお願いいたします。

【現場名】テスト現場
【住所】東京都千代田区1-1-1

ご検討のほど、よろしくお願いいたします。`,
  };

  const mockTextWithError: EstimateRequestText = {
    recipient: '',
    subject: '[プロジェクト名] 御見積依頼',
    body: '本文',
    recipientError: 'メールアドレスが登録されていません',
  };

  const mockTextFaxError: EstimateRequestText = {
    recipient: '',
    subject: '[プロジェクト名] 御見積依頼',
    body: '本文',
    recipientError: 'FAX番号が登録されていません',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // クリップボードAPIをモック
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('基本レンダリング', () => {
    it('見積依頼文パネルを表示する（Requirements: 6.1）', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });

    it('宛先を表示する（Requirements: 6.2）', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('表題を表示する（Requirements: 6.3）', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText('[プロジェクト名] 御見積依頼')).toBeInTheDocument();
    });

    it('本文を表示する（Requirements: 6.4）', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText(/株式会社テスト 御中/)).toBeInTheDocument();
      expect(screen.getByText(/いつもお世話になっております/)).toBeInTheDocument();
    });
  });

  describe('エラー表示', () => {
    it('メールアドレス未登録時のエラーを表示する（Requirements: 6.5）', () => {
      render(<EstimateRequestTextPanel text={mockTextWithError} />);

      expect(screen.getByText(/メールアドレスが登録されていません/)).toBeInTheDocument();
    });

    it('FAX番号未登録時のエラーを表示する（Requirements: 6.6）', () => {
      render(<EstimateRequestTextPanel text={mockTextFaxError} />);

      expect(screen.getByText(/FAX番号が登録されていません/)).toBeInTheDocument();
    });

    it('エラー時は宛先フィールドにエラースタイルが適用される', () => {
      render(<EstimateRequestTextPanel text={mockTextWithError} />);

      const errorMessage = screen.getByText(/メールアドレスが登録されていません/);
      expect(errorMessage).toHaveStyle({ color: 'rgb(239, 68, 68)' }); // red-500
    });
  });

  describe('クリップボードコピー', () => {
    it('宛先のコピーボタンを表示する（Requirements: 6.7）', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(3); // 宛先、表題、本文
    });

    it('宛先のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      // 最初のコピーボタンをクリック（宛先）
      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[0]).toBeDefined();
      fireEvent.click(copyButtons[0]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('表題のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[1]).toBeDefined();
      fireEvent.click(copyButtons[1]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[プロジェクト名] 御見積依頼');
      });
    });

    it('本文のコピーボタンをクリックするとクリップボードにコピーされる', async () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons[2]).toBeDefined();
      fireEvent.click(copyButtons[2]!);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockText.body);
      });
    });
  });

  describe('セクション構成', () => {
    it('宛先セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText('宛先')).toBeInTheDocument();
    });

    it('表題セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText('表題')).toBeInTheDocument();
    });

    it('本文セクションにラベルを表示する', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      expect(screen.getByText('本文')).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('loading=trueの場合ローディングインジケーターを表示する', () => {
      render(<EstimateRequestTextPanel text={null} loading={true} />);

      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('textがnullでloadingがfalseの場合エラーメッセージを表示する', () => {
      render(<EstimateRequestTextPanel text={null} loading={false} />);

      expect(screen.getByText(/見積依頼文を取得できませんでした/)).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('パネルに適切なaria属性が設定されている', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      const panel = screen.getByRole('region');
      expect(panel).toHaveAttribute('aria-label');
    });

    it('本文がpre要素で整形表示される', () => {
      render(<EstimateRequestTextPanel text={mockText} />);

      const preElement = screen.getByText(/株式会社テスト 御中/).closest('pre');
      expect(preElement).toBeInTheDocument();
    });
  });
});
