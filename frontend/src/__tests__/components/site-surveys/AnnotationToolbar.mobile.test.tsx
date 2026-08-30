/**
 * @fileoverview AnnotationToolbar のツールバーレイアウト宣言（分岐を明示して測る）
 *
 * Task 70.1 で導入し、Task 115.203 で「掲げる番号」と「実際に測っているもの」を一致させた。
 *
 * 115.203 が実測した是正前の状態:
 *   本ファイルは `window.matchMedia` を一切用意していなかった。JSDOM は `matchMedia` を
 *   実装しておらず（実測: `typeof window.matchMedia === 'undefined'`）、`useMediaQuery` は
 *   その場合 false を返す。`window.innerWidth = 375` を代入しても `matchMedia` を経由しない
 *   ため判定は変わらない。したがって全ての検証が **デスクトップ分岐**（`flexWrap: 'wrap'`）で
 *   走っていた。「モバイル Viewport (375x667)」という表題は分岐を切り替えていなかった。
 *
 *   証拠（115.203 で測った）: 同じ本文へモバイル幅の `matchMedia` を入れて走らせると、
 *   `flex-wrap: wrap` を主張する 2 件だけが `nowrap` を受け取って赤くなり、
 *   残る 10 件は両分岐で緑だった。すなわち折返しの主張はデスクトップ分岐の観測であり、
 *   その他は分岐に依らない宣言の観測だった。
 *
 * 是正の方針（分岐を測る側で明示する）:
 *   1. 幅を評価する `matchMedia` の代替を入れ、**どの分岐を測っているかを表題と本文で宣言する**。
 *      分岐に依らない宣言は両分岐で走らせ、その対照が空振りしていないことを
 *      「分岐が実際に切り替わっている」検証で担保する。
 *   2. 掲げる番号を実測へ合わせる。取り下げたのは次の 2 つで、いずれも被覆源は他にある:
 *      - site-survey の受入基準28.1（モバイル幅で項目が画面幅に収まる）。JSDOM は実レイアウトを
 *        持たず `getBoundingClientRect` が常に 0 のため「収まる」を測れない。実測は
 *        `e2e/specs/site-surveys/site-survey-annotation-mobile.spec.ts` の (d) が 375x667 で行う
 *      - site-survey の受入基準28.3（モバイル幅ツールバーの各項目の 44x44）。本ファイルが測るのは
 *        道具のボタンの下限宣言だけであり「各項目」ではない。全域は
 *        `AnnotationToolbar.mobile-tap-target.test.tsx`（Task 115.170）と
 *        `AnnotationToolbar.style-label-association.test.tsx`、実ブラウザの実寸は
 *        `site-survey-outline-toggle.spec.ts` の (f) が担う
 *   3. 受入基準28.5 の主張を条文の形（「デスクトップ幅と同じ全操作がモバイル幅でもアクセス可能」）
 *      へ強める。到達可能な操作要素の集合を両分岐で採り、**一致すること**を測る。
 *      是正前は 9 個の道具ボタンが在ることを 1 分岐で確かめるだけだった。
 *
 * 兄弟ファイルとの重なりについて:
 *   モバイル分岐の静的な単段レイアウト（`flexWrap: nowrap` と `overflowX: auto` の併存）は
 *   `AnnotationToolbar.mobile-single-row.test.tsx`（Task 102.2）が要件36.5 の観点で固定している。
 *   本ファイルはその静的な主張を繰り返さない。本ファイルがモバイル分岐の `nowrap` に触れるのは
 *   (a) 分岐が切り替わっていることの対照と (b) 幅の変化でレイアウトが組み替わること（受入基準28.4）
 *   の 2 箇所であり、いずれも 102.2 とは別の観点である。
 *
 * 測るもの: インラインスタイルの宣言と、ツールバー内に描かれる操作要素の集合。
 *
 * @requirement site-survey/REQ-28.2
 * @requirement site-survey/REQ-28.4
 * @requirement site-survey/REQ-28.5
 * @requirement site-survey/REQ-28.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import AnnotationToolbar, {
  type ToolType,
} from '../../../components/site-surveys/AnnotationToolbar';
import { TOOL_ORDER } from '../../../components/site-surveys/annotation-toolbar.constants';
import { MEDIA_QUERIES } from '../../../utils/responsive';

const defaultProps = {
  activeTool: 'select' as ToolType,
  onToolChange: vi.fn(),
  disabled: false,
};

/**
 * インラインスタイル属性のパース補助:
 * JSDOM の style は 'flex-wrap' のようなケバブケースで参照する。
 */
const getStyleProperty = (el: Element, prop: string): string | null => {
  const style = (el as HTMLElement).style;
  return style.getPropertyValue(prop) || null;
};

// ============================================================================
// 分岐を切り替える matchMedia の代替
// ============================================================================

type ChangeListener = (event: MediaQueryListEvent) => void;

interface StubbedMediaQueryList {
  media: string;
  matches: boolean;
  listeners: Set<ChangeListener>;
}

/** モバイル幅とみなす上限（`MEDIA_QUERIES.isMobile` と同じ条文から読む） */
const MOBILE_MAX_WIDTH_PX = (() => {
  const matched = MEDIA_QUERIES.isMobile.match(/max-width:\s*(\d+)px/);
  if (!matched) {
    // 本番のクエリ形が変わったら黙って通さない。
    throw new Error(`MEDIA_QUERIES.isMobile の形が想定外である: ${MEDIA_QUERIES.isMobile}`);
  }
  return Number(matched[1]);
})();

const DESKTOP_WIDTH_PX = 1024;
const MOBILE_WIDTH_PX = 375;

let installedLists: Set<StubbedMediaQueryList> | null = null;

/**
 * 幅を評価する `matchMedia` を window に入れる。
 *
 * JSDOM は `matchMedia` を実装しないため、これを入れない限り `useMediaQuery` は
 * 常に false（デスクトップ分岐）を返す。解釈できない条件は **黙って false にせず投げる**。
 * 前提を満たせないときに検証が静かに素通りするのを防ぐためである。
 */
const installMatchMedia = (width: number): void => {
  const lists = new Set<StubbedMediaQueryList>();
  installedLists = lists;

  const evaluate = (media: string, currentWidth: number): boolean => {
    const max = media.match(/max-width:\s*(\d+)px/);
    const min = media.match(/min-width:\s*(\d+)px/);
    if (!max && !min) {
      throw new Error(`この代替が解釈できないメディアクエリである: ${media}`);
    }
    const underMax = max ? currentWidth <= Number(max[1]) : true;
    const overMin = min ? currentWidth >= Number(min[1]) : true;
    return underMax && overMin;
  };

  const factory = (media: string): MediaQueryList => {
    const entry: StubbedMediaQueryList = {
      media,
      matches: evaluate(media, currentWidth),
      listeners: new Set<ChangeListener>(),
    };
    lists.add(entry);
    return {
      get matches() {
        return entry.matches;
      },
      media,
      onchange: null,
      addEventListener: (type: string, listener: ChangeListener) => {
        if (type === 'change') entry.listeners.add(listener);
      },
      removeEventListener: (type: string, listener: ChangeListener) => {
        if (type === 'change') entry.listeners.delete(listener);
      },
      addListener: (listener: ChangeListener) => entry.listeners.add(listener),
      removeListener: (listener: ChangeListener) => entry.listeners.delete(listener),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };

  let currentWidth = width;
  setWindowWidth(width);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: factory,
  });

  currentWidthSetter = (next: number): void => {
    currentWidth = next;
    setWindowWidth(next);
    lists.forEach((entry) => {
      const matches = evaluate(entry.media, next);
      if (matches === entry.matches) return;
      entry.matches = matches;
      entry.listeners.forEach((listener) => {
        listener({ matches, media: entry.media } as MediaQueryListEvent);
      });
    });
  };
};

let currentWidthSetter: ((width: number) => void) | null = null;

/** 画面幅を変え、購読中の `matchMedia` へ change を配る（端末回転・リサイズの模写） */
const changeWidth = (width: number): void => {
  if (!currentWidthSetter) {
    throw new Error('installMatchMedia を先に呼ぶこと');
  }
  currentWidthSetter(width);
  window.dispatchEvent(new Event('resize'));
};

const setWindowWidth = (width: number): void => {
  (window as unknown as { innerWidth: number }).innerWidth = width;
  (window as unknown as { innerHeight: number }).innerHeight = width < 768 ? 667 : 768;
};

const uninstallMatchMedia = (): void => {
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  installedLists = null;
  currentWidthSetter = null;
  setWindowWidth(DESKTOP_WIDTH_PX);
};

describe('AnnotationToolbar - ツールバーのレイアウト宣言 (Task 70.1 / 115.203)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    uninstallMatchMedia();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 分岐に依らないツールバーの宣言（両分岐で走らせる）
  // ==========================================================================
  describe.each([
    ['デスクトップ幅', DESKTOP_WIDTH_PX, 'wrap'],
    ['モバイル幅', MOBILE_WIDTH_PX, 'nowrap'],
  ])('%s で走らせるツールバーの宣言', (_label, width, expectedFlexWrap) => {
    beforeEach(() => {
      installMatchMedia(width as number);
    });

    /**
     * 対照: この分岐が実際に切り替わっていることを先に確かめる。
     *
     * これが無いと、上の `describe.each` は同じ分岐を 2 回走らせても緑になり、
     * 115.203 が是正した「モバイルと名乗ってデスクトップを測る」状態へ戻る。
     * あわせて、要件28.2 が求める到達手段が分岐ごとに成立していることを測る:
     * デスクトップ幅は折返し（wrap）、モバイル幅は単段（nowrap）+ 横スクロール。
     */
    it('分岐が幅どおりに切り替わり、到達手段（折返し／単段）が成立している (site-survey/REQ-28.2)', () => {
      expect(installedLists).not.toBeNull();
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(window.matchMedia(MEDIA_QUERIES.isMobile).matches).toBe(
        (width as number) <= MOBILE_MAX_WIDTH_PX
      );
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe(expectedFlexWrap);
    });

    it('ツールバーコンテナに overflowX: auto が保持されている (site-survey/REQ-28.2)', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'overflow-x')).toBe('auto');
    });

    it('ツールバーコンテナに pointerEvents: auto が設定され、描画抑止境界を確立している (site-survey/REQ-28.6)', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'pointer-events')).toBe('auto');
    });

    it('ツールバーは display: flex / flex-direction: row を保持している（既存レイアウトを壊さない）', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'display')).toBe('flex');
      expect(getStyleProperty(toolbar, 'flex-direction')).toBe('row');
    });
  });

  // ==========================================================================
  // 道具のボタンの下限寸法
  //
  // ここで測るのは `STYLES.button.base` の下限宣言であり、分岐に依らない
  // （モバイル幅でも同じ値になる）。番号は掲げない。
  // site-survey の受入基準28.3 が言う「ツールバーの各項目」は道具のボタンより広く、
  // 属性パネルの操作要素とアクションボタンを含む。その全域の被覆は
  // `AnnotationToolbar.mobile-tap-target.test.tsx`（Task 115.170）が担う。
  // ==========================================================================
  describe('道具のボタンの下限寸法（分岐に依らない base 宣言の非回帰）', () => {
    beforeEach(() => {
      installMatchMedia(DESKTOP_WIDTH_PX);
    });

    it.each([['選択'], ['寸法線'], ['矢印'], ['テキスト']])(
      '%s ツールボタンの minWidth / minHeight が 44px である',
      (label) => {
        render(<AnnotationToolbar {...defaultProps} />);
        const button = screen.getByRole('button', { name: new RegExp(label, 'i') });
        expect(getStyleProperty(button, 'min-width')).toBe('44px');
        expect(getStyleProperty(button, 'min-height')).toBe('44px');
      }
    );

    it('48px が button.base のいずれの次元にも残っていない（設計値への完全移行）', () => {
      render(<AnnotationToolbar {...defaultProps} />);
      const selectButton = screen.getByRole('button', { name: /選択/i });
      expect(getStyleProperty(selectButton, 'min-width')).not.toBe('48px');
      expect(getStyleProperty(selectButton, 'min-height')).not.toBe('48px');
    });
  });

  // ==========================================================================
  // 画面幅の変化に伴うレイアウト再構成
  // ==========================================================================
  describe('画面幅の変化に伴うレイアウト再構成 (site-survey/REQ-28.4)', () => {
    it('デスクトップ幅からモバイル幅へ変わるとツールバーが折返しから単段へ組み替わる (site-survey/REQ-28.4)', () => {
      installMatchMedia(DESKTOP_WIDTH_PX);
      render(<AnnotationToolbar {...defaultProps} />);

      let toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');

      // 端末回転／ウィンドウ縮小の模写: 幅を変え、matchMedia の change と resize を配る
      act(() => {
        changeWidth(MOBILE_WIDTH_PX);
      });

      toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('nowrap');
      // 組み替えても到達手段（横スクロール）と描画抑止境界は保たれる
      expect(getStyleProperty(toolbar, 'overflow-x')).toBe('auto');
      expect(getStyleProperty(toolbar, 'pointer-events')).toBe('auto');
    });

    it('モバイル幅からデスクトップ幅へ戻すと折返しへ組み替わる（片道でないこと） (site-survey/REQ-28.4)', () => {
      installMatchMedia(MOBILE_WIDTH_PX);
      render(<AnnotationToolbar {...defaultProps} />);

      let toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('nowrap');

      act(() => {
        changeWidth(DESKTOP_WIDTH_PX);
      });

      toolbar = screen.getByTestId('annotation-toolbar');
      expect(getStyleProperty(toolbar, 'flex-wrap')).toBe('wrap');
    });

    it('resize イベントリスナーのマウント/アンマウントが安全に行われる（メモリリークしない） (site-survey/REQ-28.4)', () => {
      installMatchMedia(DESKTOP_WIDTH_PX);
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<AnnotationToolbar {...defaultProps} />);

      const resizeListenersAddedCount = addSpy.mock.calls.filter(
        (call) => call[0] === 'resize'
      ).length;
      expect(resizeListenersAddedCount).toBeGreaterThanOrEqual(1);

      unmount();

      const resizeListenersRemovedCount = removeSpy.mock.calls.filter(
        (call) => call[0] === 'resize'
      ).length;
      // 登録した数と同じ数だけクリーンアップされる
      expect(resizeListenersRemovedCount).toBeGreaterThanOrEqual(resizeListenersAddedCount);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  // ==========================================================================
  // モバイル幅でもデスクトップ幅と同じ操作へ到達できる
  // ==========================================================================
  describe('モバイル幅でもデスクトップ幅と同じ操作へ到達できる (site-survey/REQ-28.5)', () => {
    /** ツールバー内で「操作の対象」として直接選べる要素 */
    const OPERABLE_SELECTOR = 'button, input, select';

    /**
     * 要件28.5 が名指しする操作（条文から採る。実装の分岐表からは採らない）。
     *
     * 集合の一致だけを測ると、両分岐がともに空でも緑になる。条文が挙げる操作が
     * 実際に採れていることを先に確かめてから一致を主張する。
     */
    const REQUIRED_OPERATION_NAMES: readonly string[] = [
      '選択',
      '寸法線',
      '矢印',
      '円',
      '四角形',
      '多角形',
      '折れ線',
      'フリーハンド',
      'テキスト',
      '線の色',
      '線の太さ',
      '白縁取り',
      '元に戻す',
      'やり直し',
    ];

    const operationName = (el: Element): string =>
      el.getAttribute('aria-label') ?? el.getAttribute('id') ?? (el.textContent ?? '').trim();

    /** 操作要素の識別子（種類・入力型・名称）。位置ではなく中身で比べる */
    const describeOperation = (el: Element): string =>
      `${el.tagName.toLowerCase()}[${el.getAttribute('type') ?? ''}]:${operationName(el)}`;

    const collectOperations = (tool: ToolType, width: number): string[] => {
      installMatchMedia(width);
      render(
        <AnnotationToolbar
          {...defaultProps}
          activeTool={tool}
          onStyleChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onSave={vi.fn()}
          onExport={vi.fn()}
          onRotate={vi.fn()}
        />
      );
      const toolbar = screen.getByTestId('annotation-toolbar');
      const operations = Array.from(toolbar.querySelectorAll(OPERABLE_SELECTOR)).map(
        describeOperation
      );
      cleanup();
      uninstallMatchMedia();
      return operations;
    };

    it('全ての道具について、モバイル分岐で到達できる操作の集合がデスクトップ分岐と一致する (site-survey/REQ-28.5)', () => {
      const desktopUnion = new Set<string>();

      for (const tool of TOOL_ORDER) {
        const desktop = collectOperations(tool, DESKTOP_WIDTH_PX);
        const mobile = collectOperations(tool, MOBILE_WIDTH_PX);

        // 空振り防止: どの道具でも道具ボタン 9 個とアクションボタン群は必ず採れる
        expect(desktop.length).toBeGreaterThanOrEqual(TOOL_ORDER.length);
        expect(mobile).toEqual(desktop);

        desktop.forEach((op) => desktopUnion.add(op.slice(op.indexOf(':') + 1)));
      }

      // 条文が名指しする操作が本当に採れていたことを示す（一致の主張が空でない根拠）
      const missing = REQUIRED_OPERATION_NAMES.filter((name) => !desktopUnion.has(name));
      expect(missing).toEqual([]);
    });

    it('分岐の切り替えが実際に描画へ届いていることの対照（一致が同一分岐の比較でない） (site-survey/REQ-28.5)', () => {
      installMatchMedia(DESKTOP_WIDTH_PX);
      render(<AnnotationToolbar {...defaultProps} activeTool={'arrow' as ToolType} />);
      const desktopFlexWrap = getStyleProperty(
        screen.getByTestId('annotation-toolbar'),
        'flex-wrap'
      );
      cleanup();
      uninstallMatchMedia();

      installMatchMedia(MOBILE_WIDTH_PX);
      render(<AnnotationToolbar {...defaultProps} activeTool={'arrow' as ToolType} />);
      const mobileFlexWrap = getStyleProperty(
        screen.getByTestId('annotation-toolbar'),
        'flex-wrap'
      );

      // 操作の集合は等しいが、レイアウトの分岐は確かに異なっている
      expect(desktopFlexWrap).toBe('wrap');
      expect(mobileFlexWrap).toBe('nowrap');
    });
  });
});
