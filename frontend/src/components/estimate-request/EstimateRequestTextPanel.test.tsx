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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      expect(errorMessage).toHaveStyle({ color: 'rgb(220, 38, 38)' }); // red-600
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

  // ==========================================================================
  // Task 84.3: showIncludeBreakdownToggle prop（Requirements: 39.8）
  // ==========================================================================
  describe('showIncludeBreakdownToggle prop（Task 84.3, Requirements: 39.8）', () => {
    it('showIncludeBreakdownToggle prop を受け取れる（型契約）（Requirements: 39.8）', () => {
      // showIncludeBreakdownToggle prop を渡してもエラーにならないこと（後方互換）
      render(<EstimateRequestTextPanel text={mockText} showIncludeBreakdownToggle={true} />);
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });

    it('showIncludeBreakdownToggle=false でも正常にレンダリングされる（Requirements: 39.8）', () => {
      render(<EstimateRequestTextPanel text={mockText} showIncludeBreakdownToggle={false} />);
      // 既存の見積依頼文の表示は維持される
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('showIncludeBreakdownToggle のデフォルトは true（後方互換）（Requirements: 39.8）', () => {
      // prop 未指定でも従来通り表示されることを確認（後方互換）
      render(<EstimateRequestTextPanel text={mockText} />);
      expect(screen.getByText(/見積依頼文/)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Task 90.2: メーラー起動ボタン（method props / mailto / Gmail）
  // Requirements: 41.1, 41.2, 41.3, 41.8, 41.9, 41.10, 41.11
  // ==========================================================================
  describe('メーラー起動ボタン（Task 90.2, Requirements: 41）', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('メール方法かつアドレスありで両ボタンが活性、「メールで開く」が mailto アンカーになる（Requirements: 41.1, 41.2, 41.8）', () => {
      render(<EstimateRequestTextPanel text={mockText} method="EMAIL" />);

      // 「メールで開く」は活性時アンカー（<a href="mailto:...">）として描画される
      const mailLink = screen.getByRole('link', { name: 'メールで開く' });
      expect(mailLink).toBeInTheDocument();
      const href = mailLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href!.startsWith('mailto:')).toBe(true);
      // 宛先メールアドレスが mailto URL に含まれること（転記対象, Req 41.4）
      expect(href).toContain(encodeURIComponent('test@example.com'));

      // 「Gmailで開く」は活性（disabled でない button）であること
      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).not.toBeDisabled();

      // disabled な「メールで開く」button は存在しない（アンカー描画のため）
      expect(screen.queryByRole('button', { name: 'メールで開く' })).not.toBeInTheDocument();
    });

    it('メールアドレス未登録（recipientError あり）で両ボタンが無効化され理由を表示する（Requirements: 41.9）', () => {
      render(<EstimateRequestTextPanel text={mockTextWithError} method="EMAIL" />);

      // 無効化時は「メールで開く」も button（disabled）として描画される
      const mailButton = screen.getByRole('button', { name: 'メールで開く' });
      expect(mailButton).toBeDisabled();

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).toBeDisabled();

      // 活性アンカーは存在しない
      expect(screen.queryByRole('link', { name: 'メールで開く' })).not.toBeInTheDocument();

      // 理由表示（アクション行の理由文言）
      // recipientError と同一文言のため複数一致する。理由要素が少なくとも 1 つ存在することを確認。
      expect(
        screen.getAllByText('メールアドレスが登録されていません').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('FAX 方法で両ボタンが無効化され対象外である理由を表示する（Requirements: 41.10）', () => {
      render(<EstimateRequestTextPanel text={mockText} method="FAX" />);

      const mailButton = screen.getByRole('button', { name: 'メールで開く' });
      expect(mailButton).toBeDisabled();

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      expect(gmailButton).toBeDisabled();

      expect(screen.queryByRole('link', { name: 'メールで開く' })).not.toBeInTheDocument();

      expect(screen.getByText('FAX依頼のためメール起動の対象外です')).toBeInTheDocument();
    });

    it('「Gmailで開く」クリックで window.open が Gmail compose URL と noopener,noreferrer で呼ばれる（Requirements: 41.3）', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<EstimateRequestTextPanel text={mockText} method="EMAIL" />);

      const gmailButton = screen.getByRole('button', { name: 'Gmailで開く' });
      fireEvent.click(gmailButton);

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, target, features] = openSpy.mock.calls[0]!;
      expect(typeof url === 'string' ? url : String(url)).toContain('mail.google.com');
      expect(target).toBe('_blank');
      expect(features).toBe('noopener,noreferrer');
    });

    it('既存の宛先・表題・本文コピーボタンは従来通り存在・動作する（非影響）（Requirements: 41.11）', async () => {
      render(<EstimateRequestTextPanel text={mockText} method="EMAIL" />);

      // メーラー起動ボタン追加後も InlineCopyButton（コピー）が 3 つ存在する
      const copyButtons = screen.getAllByRole('button', { name: /コピー/ });
      expect(copyButtons.length).toBeGreaterThanOrEqual(3);

      // 宛先コピーが従来通り動作する
      fireEvent.click(copyButtons[0]!);
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test@example.com');
      });
    });
  });
});
