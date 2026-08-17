/**
 * @fileoverview `style-panel.constants.ts` の既定スタイル宣言が一元管理の資材から供給されることの検証
 *
 * Task 115.70 (Req 26.1, 26.5): `style-panel.constants.ts` の `DEFAULT_STYLE_OPTIONS` は
 * `annotation-toolbar.constants.ts` の同名宣言と同じ形の**二重の供給元**であり、本体色・線幅・
 * 塗りつぶし・文字色を独自の literal として持っていた（中央は本体色 `#e53935` / 線幅 3 だが、
 * 本宣言は `#000000` / 2）。115.60 が注釈編集画面から撤去したのとまったく同じ形である。
 *
 * 本テストは「食い違っている項目だけ」ではなく、`StyleOptions` の**全項目**を一元管理の資材
 * (`ANNOTATION_DEFAULTS`) の値と機械的に突き合わせる。`FIELD_SOURCES` はキー集合が
 * `DEFAULT_STYLE_OPTIONS` と完全一致することを自ら主張するため、後から項目が増えた場合にも
 * 突き合わせ漏れが失敗として現れる。
 *
 * Boundary: スタイルパネルの資材（`style-panel.constants.ts`）
 *
 * Requirements:
 * - 26.1: 初期線幅をモバイル画面でも明瞭に視認できる太さ（概ね3論理ピクセル以上）に設定する
 * - 26.5: 各ツールの既定色・既定線幅・既定白縁取り有無を設定資材として一元管理する
 *
 * @requirement site-survey/REQ-26.1
 * @requirement site-survey/REQ-26.5
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STYLE_OPTIONS,
  type StyleOptions,
} from '../../../components/site-surveys/style-panel.constants';
import { ANNOTATION_DEFAULTS } from '../../../components/site-surveys/annotation-style-tokens';

/**
 * `StyleOptions` の各項目について、一元管理の資材が定める期待値を対応づける。
 *
 * `fillColor` のみ値の表現が異なる: 中央は透明を空文字で表すが、スタイルパネルは
 * 透明を `'transparent'` 文字列で表現する（塗りつぶしなしボタンの選択状態判定と
 * 色入力の代替表示がこの表現に依存する）。中央の値が空でなくなれば期待値も追随する。
 */
const FIELD_SOURCES: Record<keyof StyleOptions, { expected: unknown; source: string }> = {
  strokeColor: { expected: ANNOTATION_DEFAULTS.stroke, source: 'ANNOTATION_DEFAULTS.stroke' },
  fillColor: {
    expected: ANNOTATION_DEFAULTS.fill === '' ? 'transparent' : ANNOTATION_DEFAULTS.fill,
    source: "ANNOTATION_DEFAULTS.fill（空文字は 'transparent' 表現へ橋渡し）",
  },
  strokeWidth: {
    expected: ANNOTATION_DEFAULTS.strokeWidth,
    source: 'ANNOTATION_DEFAULTS.strokeWidth',
  },
  fontSize: { expected: ANNOTATION_DEFAULTS.fontSize, source: 'ANNOTATION_DEFAULTS.fontSize' },
  fontColor: {
    expected: ANNOTATION_DEFAULTS.stroke,
    source:
      'ANNOTATION_DEFAULTS.stroke（テキストの本体色。DEFAULT_TEXT_OPTIONS.fill と同一の供給元）',
  },
  arrowOutlineEnabled: {
    expected: ANNOTATION_DEFAULTS.arrowOutline.enabled,
    source: 'ANNOTATION_DEFAULTS.arrowOutline.enabled',
  },
  textOutlineEnabled: {
    expected: ANNOTATION_DEFAULTS.textOutline.enabled,
    source: 'ANNOTATION_DEFAULTS.textOutline.enabled',
  },
};

describe('style-panel.constants は既定スタイルを一元管理の資材から供給する (Task 115.70)', () => {
  it('突き合わせ表は DEFAULT_STYLE_OPTIONS の全項目を網羅する (Req 26.5)', () => {
    expect(Object.keys(FIELD_SOURCES).sort()).toEqual(Object.keys(DEFAULT_STYLE_OPTIONS).sort());
  });

  it.each(
    (Object.keys(FIELD_SOURCES) as Array<keyof StyleOptions>).map((field) => ({
      field,
      ...FIELD_SOURCES[field],
    }))
  )('$field は $source が供給する値と一致する (Req 26.5)', ({ field, expected }) => {
    expect(DEFAULT_STYLE_OPTIONS[field]).toBe(expected);
  });

  it('既定線幅はモバイルでも視認できる太さ（3以上）である (Req 26.1)', () => {
    expect(DEFAULT_STYLE_OPTIONS.strokeWidth).toBeGreaterThanOrEqual(3);
  });
});
