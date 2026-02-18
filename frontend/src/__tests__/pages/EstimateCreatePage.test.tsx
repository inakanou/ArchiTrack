/**
 * @fileoverview 見積書作成画面のテスト
 *
 * Task 37.1: 見積書作成画面デフォルト値のテスト
 *
 * Requirements:
 * - REQ-25.1: 見積書作成画面の見積書名の初期値を「見積書」にする
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EstimateCreatePage from '../../pages/EstimateCreatePage';

// APIモック
vi.mock('../../api/estimates', () => ({
  createEstimate: vi.fn(),
}));

vi.mock('../../api/itemized-statements', () => ({
  getItemizedStatements: vi.fn().mockResolvedValue({ data: [], total: 0 }),
}));

// useNavigateモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { createEstimate } from '../../api/estimates';

function renderWithRouter(projectId: string = 'proj-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/estimates/new`]}>
      <Routes>
        <Route
          path="/projects/:projectId/estimates/new"
          element={<EstimateCreatePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('EstimateCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // REQ-25.1: デフォルト値
  // ==========================================================================
  describe('デフォルト値 (REQ-25.1)', () => {
    it('見積書名の初期値が「見積書」であること', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/見積書名/) as HTMLInputElement;
      expect(nameInput.value).toBe('見積書');
    });

    it('ユーザーがデフォルト値を自由に変更できること', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/見積書名/) as HTMLInputElement;
      await user.clear(nameInput);
      await user.type(nameInput, '新しい見積書名');

      expect(nameInput.value).toBe('新しい見積書名');
    });

    it('見積書名に最大200文字の制限があること', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/見積書名/) as HTMLInputElement;
      expect(nameInput.maxLength).toBe(200);
    });
  });

  // ==========================================================================
  // フォーム送信
  // ==========================================================================
  describe('フォーム送信', () => {
    it('作成ボタンクリックでcreateEstimateが呼ばれること', async () => {
      const user = userEvent.setup();
      vi.mocked(createEstimate).mockResolvedValueOnce({
        id: 'new-est-1',
        projectId: 'proj-1',
        name: '見積書',
        sourceItemizedStatementId: null,
        sourceItemizedStatementName: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: '作成' });
      await user.click(submitButton);

      await waitFor(() => {
        expect(createEstimate).toHaveBeenCalledWith('proj-1', {
          name: '見積書',
        });
      });
    });

    it('見積書名が空の場合は作成ボタンが無効であること', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/見積書名/) as HTMLInputElement;
      await user.clear(nameInput);

      const submitButton = screen.getByRole('button', { name: '作成' });
      expect(submitButton).toBeDisabled();
    });

    it('キャンセルボタンクリックで見積書一覧に戻ること', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('estimate-create-page')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: 'キャンセル' });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1/estimates');
    });
  });
});
