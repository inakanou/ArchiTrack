/**
 * @fileoverview 数量表リダイレクトページのテスト
 *
 * REQ-1.5: 数量表カードクリックで編集画面遷移
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import QuantityTableRedirectPage from './QuantityTableRedirectPage';

describe('QuantityTableRedirectPage', () => {
  describe('REQ-1.5: 数量表カードクリックで編集画面遷移', () => {
    it('idがある場合、編集画面にリダイレクトする', () => {
      let currentPath = '';

      render(
        <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/qt-123']}>
          <Routes>
            <Route
              path="/projects/:projectId/quantity-tables/:id"
              element={<QuantityTableRedirectPage />}
            />
            <Route
              path="/quantity-tables/:id/edit"
              element={
                <div>
                  {(() => {
                    currentPath = '/quantity-tables/qt-123/edit';
                    return 'Edit Page';
                  })()}
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(currentPath).toBe('/quantity-tables/qt-123/edit');
    });

    it('idがない場合、プロジェクト一覧にリダイレクトする', () => {
      let currentPath = '';

      render(
        <MemoryRouter initialEntries={['/projects/proj-1/quantity-tables/']}>
          <Routes>
            <Route
              path="/projects/:projectId/quantity-tables/"
              element={<QuantityTableRedirectPage />}
            />
            <Route
              path="/projects"
              element={
                <div>
                  {(() => {
                    currentPath = '/projects';
                    return 'Projects Page';
                  })()}
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(currentPath).toBe('/projects');
    });
  });
});
