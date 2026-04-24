/**
 * @fileoverview StylePanel 白縁取り/白アウトライントグル と 開閉トグル のテスト
 *
 * Task 70.2: StylePanel 開閉トグルと白縁取り切替 UI の追加（TDD: RED フェーズ）
 *
 * Requirements:
 * - 24.5: 矢印の白縁取りの有効/無効をユーザーが任意に切替可能にする
 * - 25.2: テキストの白アウトラインの有効/無効をユーザーが任意に切替可能にする
 * - 26.3: 矢印・テキストツール初回選択時に白縁取り/白アウトラインが有効な初期状態で起動
 * - 26.4: セッション内の同ツール再利用時に直前のスタイル設定を引き継ぐ
 * - 26.6: セッション中はユーザー選択値を優先する
 * - 28.8: 選択中ツール再タップで詳細属性パネルをトグル表示
 * - 29.1: 選択中ツールを視覚的にハイライト
 *
 * テスト対象:
 * - StyleOptions に arrowOutlineEnabled / textOutlineEnabled フィールドが存在する
 * - DEFAULT_STYLE_OPTIONS に outline 既定値（true）が含まれる
 * - activeTool='arrow' の時「白縁取り」トグルが表示される
 * - activeTool='text' の時「白アウトライン」トグルが表示される
 * - トグル変更で onStyleChange に arrowOutlineEnabled / textOutlineEnabled が渡る
 * - matchMedia('(max-width: 768px)') を mock してモバイル幅で初期折りたたみ、
 *   デスクトップ幅で初期展開になる
 * - styleOptions の outline 値が round-trip で復元される（Req 26.4 観測代替）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import StylePanel, {
  type StyleOptions,
  DEFAULT_STYLE_OPTIONS,
} from '../../../components/site-surveys/StylePanel';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

// ============================================================================
// matchMedia モック
// ============================================================================

type MatchMediaImpl = (query: string) => MediaQueryList;
let originalMatchMedia: MatchMediaImpl | undefined;

/**
 * window.matchMedia を指定した条件で mock する
 * @param matchesForMobileQuery (max-width: 768px) に対する返却 matches 値
 */
function mockMatchMedia(matchesForMobileQuery: boolean): void {
  const impl: MatchMediaImpl = (query: string) => {
    const matches = query.includes('max-width: 768px') ? matchesForMobileQuery : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
  (window as unknown as { matchMedia: MatchMediaImpl }).matchMedia = impl;
}

// ============================================================================
// テストスイート
// ============================================================================

describe('StylePanel - 白縁取り/白アウトライン トグル (Task 70.2, Req 24.5 / 25.2 / 26.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalMatchMedia = (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
    // デフォルトはデスクトップ幅相当（折りたたまれない）
    mockMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    if (originalMatchMedia) {
      (window as unknown as { matchMedia: MatchMediaImpl }).matchMedia = originalMatchMedia;
    } else {
      delete (window as unknown as { matchMedia?: MatchMediaImpl }).matchMedia;
    }
  });

  // ==========================================================================
  // StyleOptions 型 / DEFAULT_STYLE_OPTIONS 拡張テスト (Req 26.3, 26.5 bridge)
  // ==========================================================================
  describe('StyleOptions と DEFAULT_STYLE_OPTIONS の拡張', () => {
    it('DEFAULT_STYLE_OPTIONS.arrowOutlineEnabled が ANNOTATION_DEFAULTS.arrowOutline.enabled と一致する (Req 26.3)', () => {
      expect(DEFAULT_STYLE_OPTIONS.arrowOutlineEnabled).toBe(
        ANNOTATION_DEFAULTS.arrowOutline.enabled
      );
    });

    it('DEFAULT_STYLE_OPTIONS.textOutlineEnabled が ANNOTATION_DEFAULTS.textOutline.enabled と一致する (Req 26.3)', () => {
      expect(DEFAULT_STYLE_OPTIONS.textOutlineEnabled).toBe(
        ANNOTATION_DEFAULTS.textOutline.enabled
      );
    });

    it('arrowOutlineEnabled / textOutlineEnabled はオプショナル拡張で型安全に省略可能', () => {
      // 既存 consumer との後方互換: 旧シェイプのオブジェクトも StyleOptions として受け付ける
      const legacy: StyleOptions = {
        strokeColor: '#000000',
        fillColor: 'transparent',
        strokeWidth: 2,
        fontSize: 16,
        fontColor: '#000000',
      };
      expect(legacy.arrowOutlineEnabled).toBeUndefined();
      expect(legacy.textOutlineEnabled).toBeUndefined();
    });
  });

  // ==========================================================================
  // activeTool=arrow トグル表示 (Req 24.5)
  // ==========================================================================
  describe('矢印ツール選択時の白縁取りトグル (Req 24.5)', () => {
    it('activeTool="arrow" の時、"白縁取り" トグルが表示される', () => {
      render(
        <StylePanel
          styleOptions={DEFAULT_STYLE_OPTIONS}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      const toggle = screen.getByRole('checkbox', { name: /白縁取り/i });
      expect(toggle).toBeInTheDocument();
    });

    it('activeTool="text" の時、"白縁取り" トグルは表示されない', () => {
      render(
        <StylePanel
          styleOptions={DEFAULT_STYLE_OPTIONS}
          onStyleChange={vi.fn()}
          activeTool="text"
        />
      );

      const toggle = screen.queryByRole('checkbox', { name: /白縁取り/i });
      expect(toggle).not.toBeInTheDocument();
    });

    it('styleOptions.arrowOutlineEnabled=true の時、白縁取りトグルは checked', () => {
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: true }}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /白縁取り/i,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it('styleOptions.arrowOutlineEnabled=false の時、白縁取りトグルは unchecked (Req 26.4 round-trip 復元)', () => {
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: false }}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /白縁取り/i,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it('白縁取りトグルを ON から OFF に切替えると onStyleChange({ arrowOutlineEnabled: false }) が呼ばれる', () => {
      const onStyleChange = vi.fn();
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: true }}
          onStyleChange={onStyleChange}
          activeTool="arrow"
        />
      );

      const toggle = screen.getByRole('checkbox', { name: /白縁取り/i });
      fireEvent.click(toggle);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          arrowOutlineEnabled: false,
        })
      );
    });

    it('白縁取りトグルを OFF から ON に切替えると onStyleChange({ arrowOutlineEnabled: true }) が呼ばれる', () => {
      const onStyleChange = vi.fn();
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: false }}
          onStyleChange={onStyleChange}
          activeTool="arrow"
        />
      );

      const toggle = screen.getByRole('checkbox', { name: /白縁取り/i });
      fireEvent.click(toggle);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          arrowOutlineEnabled: true,
        })
      );
    });
  });

  // ==========================================================================
  // activeTool=text トグル表示 (Req 25.2)
  // ==========================================================================
  describe('テキストツール選択時の白アウトライントグル (Req 25.2)', () => {
    it('activeTool="text" の時、"白アウトライン" トグルが表示される', () => {
      render(
        <StylePanel
          styleOptions={DEFAULT_STYLE_OPTIONS}
          onStyleChange={vi.fn()}
          activeTool="text"
        />
      );

      const toggle = screen.getByRole('checkbox', { name: /白アウトライン/i });
      expect(toggle).toBeInTheDocument();
    });

    it('activeTool="arrow" の時、"白アウトライン" トグルは表示されない', () => {
      render(
        <StylePanel
          styleOptions={DEFAULT_STYLE_OPTIONS}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      const toggle = screen.queryByRole('checkbox', { name: /白アウトライン/i });
      expect(toggle).not.toBeInTheDocument();
    });

    it('styleOptions.textOutlineEnabled=true の時、白アウトライントグルは checked', () => {
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, textOutlineEnabled: true }}
          onStyleChange={vi.fn()}
          activeTool="text"
        />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /白アウトライン/i,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it('styleOptions.textOutlineEnabled=false の時、白アウトライントグルは unchecked', () => {
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, textOutlineEnabled: false }}
          onStyleChange={vi.fn()}
          activeTool="text"
        />
      );

      const toggle = screen.getByRole('checkbox', {
        name: /白アウトライン/i,
      }) as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it('白アウトライントグルを切替えると onStyleChange({ textOutlineEnabled }) が呼ばれる', () => {
      const onStyleChange = vi.fn();
      render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, textOutlineEnabled: true }}
          onStyleChange={onStyleChange}
          activeTool="text"
        />
      );

      const toggle = screen.getByRole('checkbox', { name: /白アウトライン/i });
      fireEvent.click(toggle);

      expect(onStyleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          textOutlineEnabled: false,
        })
      );
    });
  });

  // ==========================================================================
  // 開閉状態の初期値 matchMedia 連動 (Req 28.8)
  // ==========================================================================
  describe('StylePanel 開閉の初期値（matchMedia 連動）', () => {
    it('モバイル幅 (matchMedia matches=true) では初期折りたたみ（本文非表示） (Req 28.8)', () => {
      mockMatchMedia(true);

      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);

      // 折りたたみ状態では色設定セクションが DOM 上に存在しない（もしくは aria-hidden=true）
      // 実装では「折りたたみ時は詳細セクションを非描画」とする（簡潔）
      const colorSection = screen.queryByTestId('color-settings-section');
      expect(colorSection).not.toBeInTheDocument();
    });

    it('デスクトップ幅 (matchMedia matches=false) では初期展開（本文表示） (Req 28.8)', () => {
      mockMatchMedia(false);

      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);

      const colorSection = screen.getByTestId('color-settings-section');
      expect(colorSection).toBeInTheDocument();
    });

    it('折りたたみ/展開トグルボタンが用意されており、クリックで開閉が切替わる (Req 28.8)', () => {
      mockMatchMedia(false); // 初期: 展開

      render(<StylePanel styleOptions={DEFAULT_STYLE_OPTIONS} onStyleChange={vi.fn()} />);

      const toggleButton = screen.getByRole('button', {
        name: /スタイルパネルを折りたたむ|スタイルパネルを展開/i,
      });
      expect(toggleButton).toBeInTheDocument();

      // 初期展開状態なのでセクションが見える
      expect(screen.getByTestId('color-settings-section')).toBeInTheDocument();

      // 1回目クリック: 折りたたみ
      fireEvent.click(toggleButton);
      expect(screen.queryByTestId('color-settings-section')).not.toBeInTheDocument();

      // 2回目クリック: 展開
      const toggleButtonAfter = screen.getByRole('button', {
        name: /スタイルパネルを折りたたむ|スタイルパネルを展開/i,
      });
      fireEvent.click(toggleButtonAfter);
      expect(screen.getByTestId('color-settings-section')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Round-trip (Req 26.4 の観測代替)
  // ==========================================================================
  describe('styleOptions の outline 値 round-trip (Req 26.4 観測代替)', () => {
    it('arrowOutlineEnabled=false で描画 → activeTool 変更 (text) → 再び arrow に戻した際、前回 OFF 状態が復元される', () => {
      // 1) 矢印 + OFF で描画
      const { rerender } = render(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: false }}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      let arrowToggle = screen.getByRole('checkbox', {
        name: /白縁取り/i,
      }) as HTMLInputElement;
      expect(arrowToggle.checked).toBe(false);

      // 2) 別ツール（text）へ
      rerender(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: false }}
          onStyleChange={vi.fn()}
          activeTool="text"
        />
      );

      // 3) 再度 arrow に戻す（親側で styleOptions.arrowOutlineEnabled=false を維持している前提）
      rerender(
        <StylePanel
          styleOptions={{ ...DEFAULT_STYLE_OPTIONS, arrowOutlineEnabled: false }}
          onStyleChange={vi.fn()}
          activeTool="arrow"
        />
      );

      arrowToggle = screen.getByRole('checkbox', { name: /白縁取り/i }) as HTMLInputElement;
      expect(arrowToggle.checked).toBe(false);
    });
  });
});
