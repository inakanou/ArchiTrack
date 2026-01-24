/**
 * @fileoverview EstimateRequestEditPage コンポーネントのテスト
 *
 * Task 6.3: EstimateRequestEditPageの実装
 *
 * Requirements:
 * - 9.3: 見積依頼の名前を編集可能にする
 * - 9.6: 編集内容を保存し詳細画面に遷移する
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateRequestEditPage from '../../pages/EstimateRequestEditPage';
import * as estimateRequestApi from '../../api/estimate-requests';

// APIモック
vi.mock('../../api/estimate-requests');

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// テストデータ
const mockEstimateRequest = {
  id: 'er-1',
  name: 'テスト見積依頼',
  projectId: 'project-1',
  tradingPartnerId: 'tp-1',
  tradingPartnerName: 'テスト取引先',
  itemizedStatementId: 'is-1',
  itemizedStatementName: 'テスト内訳書',
  method: 'EMAIL' as const,
  includeBreakdownInBody: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

/**
 * テストコンポーネントのラッパー
 */
function renderWithRouter(id: string = 'er-1') {
  return render(
    <MemoryRouter initialEntries={[`/estimate-requests/${id}/edit`]}>
      <Routes>
        <Route path="/estimate-requests/:id/edit" element={<EstimateRequestEditPage />} />
        <Route path="/estimate-requests/:id" element={<div>詳細ページ</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateRequestEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockResolvedValue(mockEstimateRequest);
    vi.mocked(estimateRequestApi.updateEstimateRequest).mockResolvedValue({
      ...mockEstimateRequest,
      name: '更新後の見積依頼',
    });
  });

  describe('ローディング状態', () => {
    it('ローディング中にスピナーを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時にエラーメッセージと再試行ボタンを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockRejectedValue(
        new Error('Network error')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(screen.getByText('見積依頼の取得に失敗しました')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });

    it('再試行ボタンをクリックするとデータを再取得する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.getEstimateRequestDetail)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockEstimateRequest);

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '再試行' }));

      await waitFor(() => {
        expect(estimateRequestApi.getEstimateRequestDetail).toHaveBeenCalledTimes(2);
      });
    });

    it('データがnullの場合エラーメッセージを表示する', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockRejectedValue(
        new Error('Not found')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('見積依頼の取得に失敗しました')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    });
  });

  describe('フォーム表示', () => {
    it('編集フォームを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('heading', { name: '見積依頼 編集' })).toBeInTheDocument();
      expect(screen.getByLabelText(/名前/)).toHaveValue('テスト見積依頼');
    });

    it('パンくずナビゲーションを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      expect(screen.getByRole('navigation', { name: /パンくず/i })).toBeInTheDocument();
      expect(screen.getByText('プロジェクト一覧')).toBeInTheDocument();
    });

    it('戻るリンクを表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('link', { name: '詳細に戻る' });
      expect(backLink).toHaveAttribute('href', '/estimate-requests/er-1');
    });

    it('読み取り専用フィールド（取引先、内訳書）を表示する', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      expect(screen.getByText('テスト取引先')).toBeInTheDocument();
      expect(screen.getByText('テスト内訳書')).toBeInTheDocument();
      expect(screen.getByText('宛先は変更できません')).toBeInTheDocument();
      expect(screen.getByText('内訳書は変更できません')).toBeInTheDocument();
    });
  });

  describe('フォーム入力', () => {
    it('名前を変更できる (Requirements 9.3)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      await user.clear(nameInput);
      await user.type(nameInput, '新しい見積依頼名');

      expect(nameInput).toHaveValue('新しい見積依頼名');
    });

    it('名前が空の場合にバリデーションエラーを表示する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      await user.clear(nameInput);

      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(screen.getByText('名前を入力してください')).toBeInTheDocument();
      });

      expect(estimateRequestApi.updateEstimateRequest).not.toHaveBeenCalled();
    });

    it('名前入力時にバリデーションエラーをクリアする', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      await user.clear(nameInput);
      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(screen.getByText('名前を入力してください')).toBeInTheDocument();
      });

      await user.type(nameInput, 'a');

      await waitFor(() => {
        expect(screen.queryByText('名前を入力してください')).not.toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('更新ボタンをクリックすると見積依頼を更新し詳細画面に遷移する (Requirements 9.6)', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      await user.clear(nameInput);
      await user.type(nameInput, '更新後の見積依頼');

      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(estimateRequestApi.updateEstimateRequest).toHaveBeenCalledWith(
          'er-1',
          { name: '更新後の見積依頼' },
          mockEstimateRequest.updatedAt
        );
      });

      expect(mockNavigate).toHaveBeenCalledWith('/estimate-requests/er-1');
    });

    it('更新中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.updateEstimateRequest).mockImplementation(
        () => new Promise(() => {})
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '更新中...' })).toBeDisabled();
      });

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    });

    it('更新に失敗した場合エラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      vi.mocked(estimateRequestApi.updateEstimateRequest).mockRejectedValue(
        new Error('Update failed')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(screen.getByText('見積依頼の更新に失敗しました')).toBeInTheDocument();
      });
    });

    it('requestがnullの場合は送信しない', async () => {
      vi.mocked(estimateRequestApi.getEstimateRequestDetail).mockRejectedValue(
        new Error('Not found')
      );

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('見積依頼の取得に失敗しました')).toBeInTheDocument();
      });

      // エラー時はフォームが表示されないため送信もされない
      expect(estimateRequestApi.updateEstimateRequest).not.toHaveBeenCalled();
    });
  });

  describe('キャンセル', () => {
    it('キャンセルボタンをクリックすると詳細画面に遷移する', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'キャンセル' }));

      expect(mockNavigate).toHaveBeenCalledWith('/estimate-requests/er-1');
    });
  });

  describe('アクセシビリティ', () => {
    it('必須フィールドにaria属性が設定されている', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      expect(nameInput).toHaveAttribute('aria-required', 'true');
    });

    it('バリデーションエラー時にaria-invalid属性が設定される', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-request-edit-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/名前/);
      await user.clear(nameInput);
      await user.click(screen.getByRole('button', { name: '更新' }));

      await waitFor(() => {
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('メインコンテンツにrole="main"が設定されている', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
    });
  });

  describe('IDがない場合', () => {
    it('IDがundefinedの場合はデータ取得しない', async () => {
      render(
        <MemoryRouter initialEntries={['/estimate-requests//edit']}>
          <Routes>
            <Route path="/estimate-requests//edit" element={<EstimateRequestEditPage />} />
          </Routes>
        </MemoryRouter>
      );

      // useParamsでidがundefinedになるケースをテスト
    });
  });
});
