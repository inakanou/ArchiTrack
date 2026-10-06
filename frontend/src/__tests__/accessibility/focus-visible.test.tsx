/**
 * @fileoverview フォーカス表示の単体テスト
 *
 * フォーカス表示は全画面共通の規則（`src/index.css` の `@layer base` の `:focus-visible`）で描く。
 * 部品の側は、その規則を打ち消す `outline: none` をインラインで持たないことで規則に乗る。
 * ここでは (1) 規則そのものが明確な表示（幅 2px 以上・背景とのコントラスト比 3:1 以上）であること、
 * (2) プロジェクトの作成・編集フォームの入力部品が規則を打ち消していないこと、を確かめる。
 * 実際のブラウザでフォーカス中に表示が出ることは e2e/specs/projects/project-accessibility.spec.ts
 * の「フォーカス状態の視覚的表示」で主張する（jsdom は :focus-visible の照合も CSS の適用もしない）。
 *
 * Requirements (project-management):
 * - REQ-20.4: フォーカス状態を視覚的に明確に表示する
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProjectForm from '../../components/projects/ProjectForm';

// AuthContext のモック
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'current-user-id', email: 'test@example.com', displayName: '現在のユーザー' },
    isAuthenticated: true,
    isInitialized: true,
  }),
}));

// 担当者候補 API のモック（UserSelect が使用）
vi.mock('../../api/projects', () => ({
  getAssignableUsers: vi
    .fn()
    .mockResolvedValue([{ id: 'current-user-id', displayName: '現在のユーザー' }]),
}));

// apiClient のモック
vi.mock('../../api/client', () => ({
  apiClient: {
    getAccessToken: vi.fn(() => 'mock-token'),
    setAccessToken: vi.fn(),
  },
}));

// 取引先 API のモック（TradingPartnerSelect が使用）
vi.mock('../../api/trading-partners', () => ({
  getTradingPartners: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  }),
}));

Element.prototype.scrollIntoView = vi.fn();

// 単体テストでは CSS が読み込まれない（vitest の css 無効）ため、本番が読み込む原本を直接読む
const globalCss = readFileSync(join(__dirname, '../../index.css'), 'utf-8');

/** #rrggbb を相対輝度へ */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `@layer base { ... }` の中身を取り出す（入れ子の波括弧を数えて閉じを探す） */
function extractLayerBase(css: string): string | null {
  const start = css.search(/@layer\s+base\s*\{/);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

describe('フォーカス表示の全画面共通の規則（index.css）', () => {
  /**
   * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する
   */
  it('@layer base に :focus-visible の outline が、幅 2px 以上・実線・背景とのコントラスト比 3:1 以上で定義されている', () => {
    const base = extractLayerBase(globalCss);
    // base 層に置くのは、Tailwind の focus:ring 系（utilities 層）で独自の輪を描く部品の表示を
    // 上書きしないためである（層の外に置くと詳細度に関わらず utilities に勝ってしまう）
    expect(base, 'index.css に @layer base が無い').not.toBeNull();

    const rule = /(^|[\s,}]):focus-visible\s*\{([^}]*)\}/.exec(base ?? '');
    expect(rule, '@layer base に :focus-visible の規則が無い').not.toBeNull();
    const declarations = rule?.[2] ?? '';

    const outline = /outline\s*:\s*(\d+(?:\.\d+)?)px\s+solid\s+(#[0-9a-fA-F]{6})\s*;/.exec(
      declarations
    );
    expect(outline, ':focus-visible に「幅px solid #rrggbb」の outline が無い').not.toBeNull();
    const width = parseFloat(outline?.[1] ?? '0');
    const color = outline?.[2] ?? '#ffffff';

    expect(width).toBeGreaterThanOrEqual(2);
    // 本文の背景（白のカード・ProtectedLayout の bg-gray-50・body の #f5f5f5）のいずれに対しても 3:1 以上
    for (const background of ['#ffffff', '#f9fafb', '#f5f5f5']) {
      expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('プロジェクトフォームの入力部品が共通のフォーカス表示を打ち消さない', () => {
  /**
   * インラインの `outline: none` は stylesheet のどの規則にも勝つため、
   * 一つでも残ると、その部品だけフォーカス表示が消える。
   *
   * @requirement project-management/REQ-20.4: フォーカス状態を視覚的に明確に表示する
   */
  it('プロジェクト名・顧客名・営業担当者・工事担当者・現場住所・概要がインラインで outline を消していない', async () => {
    render(
      <ProjectForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting={false} />
    );
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });

    const controls = [
      screen.getByRole('textbox', { name: 'プロジェクト名' }),
      screen.getByRole('combobox', { name: '顧客名' }),
      screen.getByRole('combobox', { name: '営業担当者' }),
      screen.getByRole('combobox', { name: '工事担当者' }),
      screen.getByRole('textbox', { name: '現場住所' }),
      screen.getByRole('textbox', { name: '概要' }),
    ];
    expect(controls).toHaveLength(6);

    const suppressed = controls
      .filter(
        (control) => control.style.outlineStyle === 'none' || control.style.outline === 'none'
      )
      .map((control) => control.getAttribute('aria-label'));
    expect(suppressed).toEqual([]);
  });
});
