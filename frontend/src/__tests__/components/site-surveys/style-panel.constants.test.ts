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
 * Task 115.72 (Req 26.5): `fillColor` の期待値が本番と同一の橋渡し式を複製していたため、
 * 中央の塗りが変わっても両辺が同時に動き何も主張していなかった。橋渡しの入力と出力を
 * 別々の主張へ分離した（詳細は `FIELD_SOURCES.fillColor` と末尾の describe を参照）。
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
 * 色入力の代替表示がこの表現に依存する）。
 *
 * Task 115.72 (Req 26.5): 従来この期待値は本番と同一の橋渡し式
 * （`ANNOTATION_DEFAULTS.fill === '' ? 'transparent' : ANNOTATION_DEFAULTS.fill`）を
 * 複製していた。中央の値が変わると期待値も同時に動くため、橋渡しが吸収する範囲では
 * 何も主張していない（中央の塗りを空でない色へ変える変異を当てても本項目だけ緑のまま
 * だった）。橋渡しの**入力**（中央が空であること）と**出力**（`'transparent'`）を
 * 別々の主張として固定し、期待値からは代替の式を撤去する。
 */
const FIELD_SOURCES: Record<keyof StyleOptions, { expected: unknown; source: string }> = {
  strokeColor: { expected: ANNOTATION_DEFAULTS.stroke, source: 'ANNOTATION_DEFAULTS.stroke' },
  fillColor: {
    // 橋渡しの出力そのものを固定する。中央の塗りが空でなくなれば本項目は落ちる。
    expected: 'transparent',
    source: "ANNOTATION_DEFAULTS.fill が空であることの橋渡し結果 'transparent'",
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

  /**
   * Task 115.72 (Req 26.5): 塗りの表現の橋渡しを、入力と出力の二つの主張に分けて固定する。
   *
   * 本番 `style-panel.constants.ts` は中央の空文字を `'transparent'` へ橋渡ししている。
   * この橋渡し式を期待値へ複製すると、中央の値が変わっても両辺が同時に動くため落ちない。
   * 入力（中央が空であること）を直接主張しておけば、中央の塗りが空でない色へ変わった時点で
   * 本 describe が失敗し、上の `fillColor` の突き合わせと合わせて二重に検出できる。
   */
  describe('塗りの表現の橋渡し (Task 115.72)', () => {
    it('橋渡しの入力: 一元管理の既定塗りは空文字（＝塗りつぶし無し）である (Req 26.5)', () => {
      expect(ANNOTATION_DEFAULTS.fill).toBe('');
    });

    it("橋渡しの出力: スタイルパネルの既定塗りは 'transparent' 表現である (Req 26.5)", () => {
      expect(DEFAULT_STYLE_OPTIONS.fillColor).toBe('transparent');
    });
  });
});
