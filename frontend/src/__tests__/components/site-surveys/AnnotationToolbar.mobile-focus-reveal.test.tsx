/**
 * @fileoverview AnnotationToolbar モバイル幅のフォーカス時の寄せのテスト
 *
 * Task 118.1: 375 幅の単段のツールバー（横スクロールの箱）を Tab で末尾まで送ると、
 * 末尾の「エクスポート」の釦が箱の右端で欠けたまま止まっていた。Chromium のフォーカス時の
 * 寄せは、横方向に一定以上見えている項目を「見えている」と扱ってスクロールしないため、
 * 箱の余白（padding / scroll-padding / scroll-margin）では防げない（実ブラウザで実測）。
 * モバイル幅では、フォーカス表示（:focus-visible）を受けた項目の全体が箱の内側に入るよう、
 * ツールバー自身の scrollLeft だけを寄せる。デスクトップ幅は折り返して横スクロールしないため
 * 寄せない。
 *
 * 指のタップで受けたフォーカスが :focus-visible に当たるかはブラウザが要素の種類で決める。
 * 375x667・タッチの Chromium の実測（独立レビュー 1 巡目の後）で、数値の入力欄と select は
 * タップでも当たり（寄る）、釦・チェックボックス・色の入力は当たらない（寄らない）。
 * キーボードでの移動は種類を問わず当たる。JSDOM は :focus-visible をこの規則で判定しないため、
 * `matches(':focus-visible')` の返り値を上の実測の規則（`tapFocusVisible`）または
 * キーボードの規則（常に真）で差し替える。実ブラウザでの主張は
 * e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts の (k)・(l)・(m)。
 *
 * レイアウトを持たない JSDOM では矩形と箱の寸法を差し替えて、寄せる量の計算を確かめる。
 *
 * 要件28.2（項目が画面幅に収まらない場合、スクロール可能な領域として項目全てにアクセス可能にする）と
 * 要件36.5（モバイル幅でツールバーを単段の横スクロールに保つ）の下での見え方を扱う。
 *
 * @requirement site-survey/REQ-28.2
 * @requirement site-survey/REQ-36.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';

vi.mock('../../../hooks/useMediaQuery', () => ({
  default: vi.fn(() => false),
}));

import useMediaQuery from '../../../hooks/useMediaQuery';

const defaultProps = {
  activeTool: 'text' as ToolType,
  onToolChange: vi.fn(),
  onSave: vi.fn(),
  onExport: vi.fn(),
  disabled: false,
};

/** 箱（ツールバー）の寸法: 左端 40・枠線 0・表示幅 295（375x667 の実測に倣う） */
const BOX = { left: 40, clientLeft: 0, clientWidth: 295 };

/**
 * 指のタップで受けたフォーカスが :focus-visible に当たるか（375x667・タッチの Chromium の実測）。
 * 数値の入力欄・select は当たり、釦・チェックボックス・色の入力は当たらない。
 */
function tapFocusVisible(element: Element): boolean {
  if (element instanceof HTMLSelectElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'color', 'button', 'submit', 'reset'].includes(element.type);
  }
  return false;
}

/** :focus-visible の判定の差し替え方 */
type FocusVisibleRule = 'keyboard' | 'tap' | 'throws';

function rect(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 44,
    height: 44,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * ツールバーの寸法と scrollLeft を差し替える。scrollLeft は代入を記録する。
 * 項目の矩形は scrollLeft の変化に追従させる（実ブラウザと同じく、寄せた分だけ左へ動く）。
 */
function layoutToolbar(toolbar: HTMLElement, initialScrollLeft: number) {
  let scrollLeft = initialScrollLeft;
  Object.defineProperty(toolbar, 'clientLeft', { configurable: true, value: BOX.clientLeft });
  Object.defineProperty(toolbar, 'clientWidth', { configurable: true, value: BOX.clientWidth });
  Object.defineProperty(toolbar, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(rect(BOX.left, BOX.clientWidth));
  return {
    get scrollLeft() {
      return scrollLeft;
    },
    /** 内容の座標（scrollLeft 0 のときの左端）で項目を置き、:focus-visible の判定の規則を決める */
    place(item: HTMLElement, contentLeft: number, width: number, rule: FocusVisibleRule) {
      vi.spyOn(item, 'getBoundingClientRect').mockImplementation(() =>
        rect(contentLeft - scrollLeft, width)
      );
      const originalMatches = item.matches.bind(item);
      vi.spyOn(item, 'matches').mockImplementation((selector: string) => {
        if (selector !== ':focus-visible') {
          return originalMatches(selector);
        }
        if (rule === 'throws') {
          throw new SyntaxError(`'${selector}' is not a valid selector`);
        }
        return rule === 'keyboard' ? true : tapFocusVisible(item);
      });
    },
  };
}

describe('AnnotationToolbar - モバイル幅のフォーカス時の寄せ (Task 118.1, Req 28.2/36.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('キーボードでの移動（:focus-visible に当たる）', () => {
    it('右端で欠けた項目へフォーカスが移ると、全体が箱の内側に入るまで右へ寄せる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const exportButton = screen.getByRole('button', { name: 'エクスポート' });
      // 着手時の実測の再現: scrollLeft 1330 で釦は 230..348、箱の内側は 40..335（13px 欠け）
      const layout = layoutToolbar(toolbar, 1330);
      layout.place(exportButton, 230 + 1330, 118, 'keyboard');

      exportButton.focus();

      expect(layout.scrollLeft).toBe(1343);
      const after = exportButton.getBoundingClientRect();
      expect(after.right).toBeLessThanOrEqual(BOX.left + BOX.clientLeft + BOX.clientWidth);
      expect(after.left).toBeGreaterThanOrEqual(BOX.left + BOX.clientLeft);
    });

    it('左端で欠けた項目へフォーカスが移ると、全体が箱の内側に入るまで左へ寄せる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const selectButton = screen.getByRole('button', { name: '選択' });
      // 釦が 20..64 にあり、箱の内側の左端 40 より 20px 外にある
      const layout = layoutToolbar(toolbar, 300);
      layout.place(selectButton, 20 + 300, 44, 'keyboard');

      selectButton.focus();

      expect(layout.scrollLeft).toBe(280);
      expect(selectButton.getBoundingClientRect().left).toBe(BOX.left + BOX.clientLeft);
    });

    it('全体が箱の内側に見えている項目では寄せない', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const saveButton = screen.getByRole('button', { name: '保存' });
      const layout = layoutToolbar(toolbar, 1330);
      layout.place(saveButton, 152 + 1330, 70, 'keyboard');

      saveButton.focus();

      expect(layout.scrollLeft).toBe(1330);
    });
  });

  describe('指のタップ（:focus-visible の当否は要素の種類で決まる）', () => {
    it('欠けた釦をタップしても寄せない（釦はタップでは :focus-visible に当たらない）', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const exportButton = screen.getByRole('button', { name: 'エクスポート' });
      const layout = layoutToolbar(toolbar, 1330);
      layout.place(exportButton, 230 + 1330, 118, 'tap');

      exportButton.focus();

      expect(exportButton.matches(':focus-visible')).toBe(false);
      expect(layout.scrollLeft).toBe(1330);
    });

    it('欠けたチェックボックスをタップしても寄せない', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const checkbox = screen.getByRole('checkbox', { name: '文字の背景色を付ける' });
      const layout = layoutToolbar(toolbar, 563);
      layout.place(checkbox, 315 + 563, 44, 'tap');

      checkbox.focus();

      expect(checkbox.matches(':focus-visible')).toBe(false);
      expect(layout.scrollLeft).toBe(563);
    });

    it('右端で 20px 欠けた数値の入力欄をタップすると、欠けた分だけ寄せる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const fontSize = screen.getByRole('spinbutton', { name: 'フォントサイズ' });
      // 実ブラウザの実測（scrollLeft 481→501）に倣う: 欄は 295..355、箱の内側の右端 335
      const layout = layoutToolbar(toolbar, 481);
      layout.place(fontSize, 295 + 481, 60, 'tap');

      fontSize.focus();

      expect(fontSize.matches(':focus-visible')).toBe(true);
      expect(layout.scrollLeft).toBe(501);
      expect(fontSize.getBoundingClientRect().right).toBe(
        BOX.left + BOX.clientLeft + BOX.clientWidth
      );
    });

    it('右端で 20px 欠けた select をタップすると、欠けた分だけ寄せる', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      const bubble = screen.getByRole('combobox', { name: '吹き出し形式' });
      const layout = layoutToolbar(toolbar, 767);
      layout.place(bubble, 301 + 767, 54, 'tap');

      bubble.focus();

      expect(bubble.matches(':focus-visible')).toBe(true);
      expect(layout.scrollLeft).toBe(787);
    });
  });

  it(':focus-visible を解さないブラウザ（matches が例外を投げる）では寄せず、例外を外へ出さない', () => {
    render(<AnnotationToolbar {...defaultProps} />);
    const toolbar = screen.getByTestId('annotation-toolbar');
    const exportButton = screen.getByRole('button', { name: 'エクスポート' });
    const layout = layoutToolbar(toolbar, 1330);
    layout.place(exportButton, 230 + 1330, 118, 'throws');

    // 事件の処理中の例外は focus() の呼び出し元へは伝わらず、window の error として報告される
    const reported: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      reported.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      exportButton.focus();
    } finally {
      window.removeEventListener('error', onError);
    }

    expect(reported).toEqual([]);
    expect(document.activeElement).toBe(exportButton);
    expect(layout.scrollLeft).toBe(1330);
  });

  it('デスクトップ幅では寄せない（折り返して横スクロールしないため）', () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    render(<AnnotationToolbar {...defaultProps} />);
    const toolbar = screen.getByTestId('annotation-toolbar');
    const exportButton = screen.getByRole('button', { name: 'エクスポート' });
    const layout = layoutToolbar(toolbar, 1330);
    layout.place(exportButton, 230 + 1330, 118, 'keyboard');

    exportButton.focus();

    expect(layout.scrollLeft).toBe(1330);
  });
});
