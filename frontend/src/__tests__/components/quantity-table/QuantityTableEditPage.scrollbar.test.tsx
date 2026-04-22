/**
 * @fileoverview 数量表編集画面のスクロールバー表示テスト
 *
 * Task 39.2: スクロールバー表示の単体テストを実装する
 *
 * Requirements:
 * - 25.1/25.2: インラインスクロールバーではなく画面直下でスクロールする
 *   （アクションメニュードロップダウンの表示が切れないようにするため）
 * - 25.3: ビューポート内収まり時のスクロールバー非表示
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// APIモック
vi.mock('../../../api/quantity-tables', () => ({
  getQuantityTableDetail: vi.fn().mockResolvedValue({
    id: 'qt-1',
    projectId: 'proj-1',
    project: { id: 'proj-1', name: 'テストプロジェクト' },
    name: 'テスト数量表',
    groupCount: 1,
    itemCount: 1,
    groups: [
      {
        id: 'g-1',
        quantityTableId: 'qt-1',
        name: 'グループ1',
        surveyImageId: null,
        surveyImage: null,
        displayOrder: 0,
        itemCount: 1,
        items: [
          {
            id: 'item-1',
            quantityGroupId: 'g-1',
            majorCategory: '建築',
            middleCategory: null,
            minorCategory: null,
            customCategory: null,
            workType: '仮設',
            name: 'テスト',
            specification: null,
            unit: '式',
            calculationMethod: 'STANDARD',
            calculationParams: null,
            adjustmentFactor: 1.0,
            roundingUnit: 0.01,
            quantity: 1.0,
            remarks: null,
            displayOrder: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }),
  createQuantityGroup: vi.fn(),
  deleteQuantityGroup: vi.fn(),
  updateQuantityGroup: vi.fn(),
  createQuantityItem: vi.fn(),
  deleteQuantityItem: vi.fn(),
  copyQuantityItem: vi.fn(),
  updateQuantityTable: vi.fn(),
  bulkSaveQuantityTable: vi.fn(),
  updateGroupDisplayOrder: vi.fn(),
  updateItemDisplayOrder: vi.fn(),
}));

vi.mock('../../../api/site-surveys', () => ({
  getSiteSurveys: vi.fn().mockResolvedValue({ data: [] }),
  getSiteSurvey: vi.fn(),
}));

vi.mock('../../../hooks/useAutocompleteCandidateStore', () => ({
  useAutocompleteCandidateStore: () => ({
    isLoading: false,
    error: null,
    getSuggestions: () => [],
    addCandidateOnBlur: () => {},
  }),
}));

// AnnotatedImageThumbnailをモック
vi.mock('../../../components/site-surveys/AnnotatedImageThumbnail', () => ({
  AnnotatedImageThumbnail: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
  default: () => <img data-testid="annotated-image-thumbnail" alt="mock" />,
}));

// QuantityTableEditPageをインポート
import QuantityTableEditPage from '../../../pages/QuantityTableEditPage';

describe('数量表編集画面 スクロールバー', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('数量グループセクションにインラインのoverflow:autoを設定しない（アクションメニュー切れ防止）', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/qt-1']}>
        <Routes>
          <Route
            path="/projects/:projectId/quantity-tables/:id"
            element={<QuantityTableEditPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    // データ読み込み完了を待つ
    const groupSection = await screen.findByTestId('quantity-group-section', {}, { timeout: 5000 });

    // インラインスクロールバーを生じさせない（auto/scroll 以外）
    expect(['auto', 'scroll']).not.toContain(groupSection.style.overflow);
    expect(['auto', 'scroll']).not.toContain(groupSection.style.overflowY);
  });

  it('数量グループセクションにmaxHeightを設定しない（ページ直下スクロールに委ねる）', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/qt-1']}>
        <Routes>
          <Route
            path="/projects/:projectId/quantity-tables/:id"
            element={<QuantityTableEditPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    const groupSection = await screen.findByTestId('quantity-group-section', {}, { timeout: 5000 });

    // maxHeight は設定しない
    expect(groupSection.style.maxHeight).toBe('');
  });
});
