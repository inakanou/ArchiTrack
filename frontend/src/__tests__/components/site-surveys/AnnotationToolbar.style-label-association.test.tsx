/**
 * @fileoverview 属性パネルの見出しと操作要素の関連付け
 *
 * Task 115.202: 属性パネルの見出しの過半が押下しても何も起きない状態を解消する。
 *
 * Task 115.170 の時点では、見出し 9 つのうち `htmlFor` を持つのは 3 つ
 * （白縁取り／白アウトライン・背景・吹き出し）だけで、残る 6 つ（色・線幅・塗りつぶし・
 * 文字色・サイズ・背景色）は `htmlFor` も包含も持たない**不活性な文字**だった。
 * 読み上げは操作要素の `aria-label` で成立していたため支援技術上の欠落ではないが、
 * モバイル幅では見出しが操作要素と同じ 44px の行の中に横並びで置かれる
 * （`STYLES.styleItemMobile`）ため、**行の左半分（見出し）に触れた指は無反応**になっていた。
 *
 * 採った案は 3 案のうち (a)「`htmlFor` を与える」である。本パネルの見出しはいずれも
 * **単一の**操作要素に対応し（色の候補ボタン群のような複数要素の群はここには無い。
 * プリセットのボタン群を持つ `StylePanel.tsx` は本番の描画経路から参照されていない）、
 * 既存の 3 つが `htmlFor` を使っているため、同じ作法へ揃えるのが一つの経路で済む。
 *
 * ## 何を測るか（宣言だけで終わらせない）
 *
 * Task 115.201 の教訓「『押せること』は到達性を固定しない」に倣い、本検証は
 * `htmlFor` 属性の存在では終わらせず、次の 2 段で測る。
 *
 *   1. **DOM が解決する関連付け** — `HTMLLabelElement.control` が、宣言した
 *      `data-testid` を持つ**その**要素であること。属性の綴りだけを見る主張と違い、
 *      指す先の `id` が消えた・別要素へ移った場合に赤くなる
 *   2. **押下の転送** — 見出しを実際に押すと、対応する操作要素へ焦点が移ること
 *      （`user-event` の click は label の活性化挙動を経由する）
 *
 * 実ブラウザでの押下は E2E（`e2e/specs/site-surveys/site-survey-outline-toggle.spec.ts`
 * の (g)）が 375x667 のモバイル幅で測る。jsdom の label 活性化は `user-event` による
 * 模倣であり、実ブラウザの転送そのものではないため。
 *
 * ## 読み上げを壊していないこと
 *
 * アクセシブル名の算出では `aria-label` が `<label for>` に優先する（accname 仕様）。
 * したがって `htmlFor` を足しても読み上げ名は変わらず、見出しが二重に読まれることもない。
 * 主張は 2 段で置く。
 *
 *   - 全ての操作要素について `aria-label` が元の文字列のまま残っていること
 *   - ARIA ロールを持つ操作要素（切替 = `checkbox` / 線幅・サイズ = `spinbutton` /
 *     吹き出し = `combobox`）については、`getByRole` の name 照合が accname を実際に算出する
 *     ため、算出結果が `aria-label` と**完全一致**すること。見出しが読み上げ名へ混ざれば
 *     （例:「線幅 線の太さ」）この照合は成立しない
 *
 * 色の選択（`input[type=color]`）は ARIA にロールの対応付けが無く `getByRole` で引けないため、
 * 主張は `aria-label` 属性の同一性までとする。accname の優先順位は要素の種類に依らないため、
 * ロールを持つ側で優先順位が保たれていることが色の側の根拠にもなる。
 *
 * Requirements:
 * - 28.3: モバイル幅ツールバーの各項目のタップ領域を最小44x44論理ピクセル以上で提供する
 *   （見出しは項目の数に含めないが、`htmlFor` を持つ見出しは対応する操作要素の当たり判定を
 *   広げる側に働く。不活性な見出しは 44px の行の中に「押しても何も起きない領域」を作るため、
 *   条文が求めるタップ領域を実質的に削っていた）
 *
 * @requirement site-survey/REQ-28.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

// useMediaQuery をモック化して isMobile 判定をテストから制御する。
// Task 102.2 の記録: `matchMedia` を stub しない検証は `useMediaQuery` が false を返し、
// 実際にはデスクトップ（wrap）分岐を見てしまう。モバイルの主張には stub が要る。
vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../../hooks/useMediaQuery';

/**
 * 見出しと、その見出しが指すべき操作要素の対応（数える範囲の宣言）
 *
 * `AnnotationToolbar.tsx` の `StylePanel` の分岐から導出する。
 * - 選択: 属性パネル自体が描かれない → 見出し 0
 * - 線のみの道具（寸法線・矢印・折れ線・フリーハンド）: 白縁取り + 色 + 線幅 → 3
 * - 塗りを持つ形状（円・四角形・多角形）: 上記 + 塗りつぶし → 4
 * - テキスト: 白アウトライン + 文字色 + サイズ + 背景 + 背景色 + 吹き出し → 6
 *
 * `accessibleName` は当該操作要素の `aria-label`。`htmlFor` の付与で読み上げ名が
 * 変わっていないことを固定するため、期待値として明示する。
 */
interface HeadingBinding {
  /** 見出しに表示されている文字 */
  readonly heading: string;
  /** 見出しが指すべき操作要素の `data-testid` */
  readonly controlTestId: string;
  /** 当該操作要素のアクセシブル名（`aria-label` と一致するはず） */
  readonly accessibleName: string;
  /**
   * 当該操作要素の ARIA ロール。`input[type=color]` は ARIA にロールの対応付けが無く
   * `getByRole` で引けないため `null` とする（読み上げ名の主張は `aria-label` 属性で行う）。
   */
  readonly role: 'checkbox' | 'spinbutton' | 'combobox' | null;
}

const LINE_BINDINGS: ReadonlyArray<HeadingBinding> = [
  {
    heading: '白縁取り',
    controlTestId: 'outline-toggle',
    accessibleName: '白縁取り',
    role: 'checkbox',
  },
  { heading: '色', controlTestId: 'color-picker', accessibleName: '線の色', role: null },
  {
    heading: '線幅',
    controlTestId: 'line-width',
    accessibleName: '線の太さ',
    role: 'spinbutton',
  },
];

const FILL_BINDING: HeadingBinding = {
  heading: '塗りつぶし',
  controlTestId: 'fill-color-picker',
  accessibleName: '塗りつぶしの色',
  role: null,
};

const TEXT_BINDINGS: ReadonlyArray<HeadingBinding> = [
  {
    heading: '白アウトライン',
    controlTestId: 'outline-toggle',
    accessibleName: '白アウトライン',
    role: 'checkbox',
  },
  { heading: '文字色', controlTestId: 'color-picker', accessibleName: '文字色', role: null },
  {
    heading: 'サイズ',
    controlTestId: 'font-size',
    accessibleName: 'フォントサイズ',
    role: 'spinbutton',
  },
  {
    heading: '背景',
    controlTestId: 'text-background-toggle',
    accessibleName: '文字の背景色を付ける',
    role: 'checkbox',
  },
  {
    heading: '背景色',
    controlTestId: 'text-background-color-picker',
    accessibleName: '文字の背景色',
    role: null,
  },
  {
    heading: '吹き出し',
    controlTestId: 'balloon-style',
    accessibleName: '吹き出し形式',
    role: 'combobox',
  },
];

const HEADING_BINDINGS: Readonly<Record<ToolType, ReadonlyArray<HeadingBinding>>> = {
  select: [],
  dimension: LINE_BINDINGS,
  arrow: LINE_BINDINGS,
  polyline: LINE_BINDINGS,
  freehand: LINE_BINDINGS,
  circle: [...LINE_BINDINGS, FILL_BINDING],
  rectangle: [...LINE_BINDINGS, FILL_BINDING],
  polygon: [...LINE_BINDINGS, FILL_BINDING],
  text: TEXT_BINDINGS,
};

/**
 * ツールごとの「ARIA ロールを持つ操作要素」の個数（数える範囲の宣言）
 *
 * 線の道具は白縁取り（checkbox）と線幅（spinbutton）の 2 個、塗りを持つ形状も同じ 2 個
 * （塗りつぶしは color でロールを持たない）、テキストは白アウトライン・背景（checkbox 2 個）と
 * サイズ（spinbutton）と吹き出し（combobox）で 4 個である。
 */
const ROLEFUL_CONTROL_COUNT: Readonly<Record<ToolType, number>> = {
  select: 0,
  dimension: 2,
  arrow: 2,
  polyline: 2,
  freehand: 2,
  circle: 2,
  rectangle: 2,
  polygon: 2,
  text: 4,
};

const ALL_TOOLS = Object.keys(HEADING_BINDINGS) as ToolType[];

/** 属性パネルが描かれるツール（選択ツールはパネル自体が無い） */
const PANEL_TOOLS = ALL_TOOLS.filter((tool) => HEADING_BINDINGS[tool].length > 0);

const renderToolbar = (activeTool: ToolType): void => {
  render(
    <AnnotationToolbar
      activeTool={activeTool}
      onToolChange={vi.fn()}
      onStyleChange={vi.fn()}
      onRotate={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onSave={vi.fn()}
      onExport={vi.fn()}
      disabled={false}
    />
  );
};

/** 属性パネル配下の見出し（`label`）を全て集める */
const collectHeadings = (): HTMLLabelElement[] => {
  const panel = screen.getByTestId('style-options');
  return Array.from(panel.querySelectorAll<HTMLLabelElement>('label'));
};

describe('AnnotationToolbar - 属性パネルの見出しと操作要素の関連付け (Task 115.202, Req 28.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('数える範囲が実測と一致する（数え漏らしたまま緑になることを防ぐ）', () => {
    it.each(PANEL_TOOLS)('%s ツール選択時の見出しの個数と文字が宣言と一致する', (tool) => {
      renderToolbar(tool);

      expect(
        collectHeadings().map((label) => label.textContent),
        `${tool}: 属性パネルの見出しが宣言と一致しない`
      ).toEqual(HEADING_BINDINGS[tool].map((binding) => binding.heading));
    });

    it('選択ツールでは属性パネル自体が描かれない（見出しも存在しない）', () => {
      renderToolbar('select');

      expect(screen.queryByTestId('style-options')).toBeNull();
    });
  });

  describe('全ての見出しが対応する操作要素へ解決する（不活性な見出しを残さない）', () => {
    it.each(PANEL_TOOLS)('%s ツール選択時に不活性な見出しが 1 つも無い', (tool) => {
      renderToolbar(tool);

      const inert = collectHeadings()
        .filter((label) => label.control === null)
        .map((label) => label.textContent);

      expect(inert, `${tool}: 押下しても何も起きない見出しが残っている`).toEqual([]);
    });

    it.each(PANEL_TOOLS)('%s ツール選択時の見出しが宣言どおりの操作要素を指す', (tool) => {
      renderToolbar(tool);

      const panel = screen.getByTestId('style-options');
      const headings = collectHeadings();

      for (const [index, binding] of HEADING_BINDINGS[tool].entries()) {
        const label = headings[index]!;
        expect(label.textContent, `${tool}: ${index} 番目の見出しの文字が違う`).toBe(
          binding.heading
        );
        expect(label.control, `${tool}: 見出し「${binding.heading}」が操作要素へ解決しない`).toBe(
          within(panel).getByTestId(binding.controlTestId)
        );
      }
    });
  });

  describe('見出しの押下が操作要素へ転送される（宣言ではなく挙動で測る）', () => {
    it.each(PANEL_TOOLS)(
      '%s ツール選択時に見出しを押すと対応する操作要素へ焦点が移る',
      async (tool) => {
        const user = userEvent.setup();
        renderToolbar(tool);

        const panel = screen.getByTestId('style-options');
        const headings = collectHeadings();

        for (const [index, binding] of HEADING_BINDINGS[tool].entries()) {
          // 前の見出しの結果が残ったまま緑にならないよう、毎回焦点を外してから押す
          (document.activeElement as HTMLElement | null)?.blur();
          expect(document.activeElement).toBe(document.body);

          await user.click(headings[index]!);

          expect(
            document.activeElement,
            `${tool}: 見出し「${binding.heading}」を押しても焦点が移らない`
          ).toBe(within(panel).getByTestId(binding.controlTestId));
        }
      }
    );
  });

  describe('読み上げ名が変わっていない（見出しが二重に読まれない）', () => {
    it.each(PANEL_TOOLS)(
      '%s ツール選択時の操作要素のアクセシブル名が aria-label のまま',
      (tool) => {
        renderToolbar(tool);

        const panel = screen.getByTestId('style-options');

        for (const binding of HEADING_BINDINGS[tool]) {
          const control = within(panel).getByTestId(binding.controlTestId);
          expect(
            control.getAttribute('aria-label'),
            `${tool}: 「${binding.heading}」の操作要素から aria-label が失われた`
          ).toBe(binding.accessibleName);
        }
      }
    );

    it.each(PANEL_TOOLS)(
      '%s ツール選択時、role を持つ操作要素は算出された読み上げ名で引ける',
      (tool) => {
        renderToolbar(tool);

        const panel = screen.getByTestId('style-options');

        // 分岐で主張を包むと空振りが静かに通るため、対象は宣言の filter で先に確定させる
        const withRole = HEADING_BINDINGS[tool].filter((binding) => binding.role !== null);
        expect(
          withRole.map((binding) => binding.controlTestId),
          `${tool}: role を持つ操作要素の宣言数が実測と一致しない`
        ).toHaveLength(ROLEFUL_CONTROL_COUNT[tool]);

        for (const binding of withRole) {
          // `getByRole` の name 照合は accname を実際に算出する。見出しが読み上げ名へ
          // 混ざれば（例: 「線幅 線の太さ」）この完全一致は成立しない。
          expect(
            within(panel).getByRole(binding.role!, { name: binding.accessibleName }),
            `${tool}: 「${binding.heading}」の読み上げ名が見出しの分だけ変質した`
          ).toBe(within(panel).getByTestId(binding.controlTestId));
        }
      }
    );
  });
});
