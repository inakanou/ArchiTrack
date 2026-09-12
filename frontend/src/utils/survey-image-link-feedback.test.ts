/**
 * @fileoverview 現調画像の紐付けの失敗を利用者へ伝える文言の組み立て（単体検証）
 *
 * Task 86.5: 現調画像の紐付けの失敗が利用者に伝わらない状態を解消する
 *
 * 本ファイルは受入基準番号を名乗らない。Task 86 が守るのはテナント境界とエラー応答の妥当性で
 * あり、本スペックの受入基準として条文化されていない（tasks.md の Task 86 節末尾に明記）。
 *
 * 期待値の文言は実装の定数を取り込まず逐語で書く。定数どうしを突き合わせると、文言が
 * 誤った向きへ変わっても両辺が同時に動いて落ちないためである。
 */

import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/client';
import {
  describeDroppedSurveyImageLinks,
  describeSurveyImageLinkSaveFailure,
} from './survey-image-link-feedback';

const groups = [
  { id: 'group-a', name: '外壁', surveyImageId: 'image-a' },
  { id: 'group-b', name: '屋根', surveyImageId: 'image-b' },
  { id: null, name: null, surveyImageId: 'image-b' },
];

describe('describeSurveyImageLinkSaveFailure', () => {
  describe('400（他プロジェクトの写真。Task 86.1 / 86.4）', () => {
    it('groups[i].surveyImageId の名指しから原因のグループを示し、再試行を促さない', () => {
      const error = new ApiError(400, '異なるプロジェクトの現場調査画像は紐付けできません', {
        status: 400,
        code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        detail: '異なるプロジェクトの現場調査画像は紐付けできません',
        'groups[1].surveyImageId': '異なるプロジェクトの現場調査画像は紐付けできません',
      });

      const message = describeSurveyImageLinkSaveFailure(error, groups);

      expect(message).toBe(
        '次のグループの写真はこの数量表のプロジェクトに属していないため保存できません: グループ「屋根」。写真を変更するか紐付けを解除してから保存してください。'
      );
      // 名指されていないグループは示さない（上の名指しが全グループの列挙でないこと）
      expect(message).not.toContain('外壁');
      expect(message).not.toContain('再度お試しください');
    });

    it('複数の名指しをすべて示し、名称の無いグループは位置で示す', () => {
      const error = new ApiError(400, 'x', {
        status: 400,
        code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        'groups[1].surveyImageId': 'x',
        'groups[2].surveyImageId': 'x',
      });

      expect(describeSurveyImageLinkSaveFailure(error, groups)).toBe(
        '次のグループの写真はこの数量表のプロジェクトに属していないため保存できません: グループ「屋根」、3番目のグループ。写真を変更するか紐付けを解除してから保存してください。'
      );
    });

    it('写真の名指しを持たない 400 は本関数の対象外である（一般の文言へ委ねる）', () => {
      const error = new ApiError(400, 'x', {
        status: 400,
        code: 'QUANTITY_TABLE_VALIDATION_ERROR',
        'groups[0].items[0].roundingUnit': '丸め設定が範囲外です',
      });

      expect(describeSurveyImageLinkSaveFailure(error, groups)).toBeNull();
    });
  });

  describe('404（写真の物理削除。Task 86.2）', () => {
    it('surveyImageId が指す写真を持つグループをすべて示し、再試行を促さない', () => {
      const error = new ApiError(404, '現場調査画像が見つかりません', {
        status: 404,
        code: 'SURVEY_IMAGE_NOT_FOUND',
        detail: '現場調査画像が見つかりません',
        surveyImageId: 'image-b',
      });

      const message = describeSurveyImageLinkSaveFailure(error, groups);

      expect(message).toBe(
        '次のグループの写真は削除されているため保存できません: グループ「屋根」、3番目のグループ。写真を変更するか紐付けを解除してから保存してください。'
      );
      expect(message).not.toContain('外壁');
      expect(message).not.toContain('再度お試しください');
    });

    it('画像を引き当てられないときはグループを名指さずに行動を示す', () => {
      const error = new ApiError(404, '現場調査画像が見つかりません', {
        status: 404,
        code: 'SURVEY_IMAGE_NOT_FOUND',
        surveyImageId: 'image-unknown',
      });

      expect(describeSurveyImageLinkSaveFailure(error, groups)).toBe(
        '紐付けた写真のうち削除されたものがあるため保存できません。該当するグループの写真を変更するか紐付けを解除してから保存してください。'
      );
    });

    it('数量表そのものの 404 は写真の失敗として扱わない（状態コードでなくコードで見分ける）', () => {
      const error = new ApiError(404, 'x', { status: 404, code: 'QUANTITY_TABLE_NOT_FOUND' });

      expect(describeSurveyImageLinkSaveFailure(error, groups)).toBeNull();
    });
  });

  describe('410（親の現場調査の論理削除。Task 81.1 / 名指しは Task 90.2）', () => {
    it('groups[i].surveyImageId の名指しから原因のグループを示し、再試行を促さない', () => {
      const error = new ApiError(410, 'x', {
        status: 410,
        code: 'SURVEY_DELETED',
        surveyId: 'survey-1',
        'groups[1].surveyImageId': '削除された現場調査の画像は紐付けできません',
      });

      const message = describeSurveyImageLinkSaveFailure(error, groups);

      expect(message).toBe(
        '次のグループの写真は現場調査ごと削除されているため保存できません: グループ「屋根」。写真を変更するか紐付けを解除してから保存してください。'
      );
      // 名指されていないグループは示さない（上の名指しが全グループの列挙でないこと）
      expect(message).not.toContain('外壁');
      expect(message).not.toContain('再度お試しください');
    });

    it('複数の名指しをすべて示し、名称の無いグループは位置で示す', () => {
      const error = new ApiError(410, 'x', {
        status: 410,
        code: 'SURVEY_DELETED',
        surveyId: 'survey-1',
        'groups[1].surveyImageId': '削除された現場調査の画像は紐付けできません',
        'groups[2].surveyImageId': '削除された現場調査の画像は紐付けできません',
      });

      expect(describeSurveyImageLinkSaveFailure(error, groups)).toBe(
        '次のグループの写真は現場調査ごと削除されているため保存できません: グループ「屋根」、3番目のグループ。写真を変更するか紐付けを解除してから保存してください。'
      );
    });

    it('名指しを持たない 410（名指しを足す前の版のバックエンド）はグループを名指さずに行動を示す', () => {
      const error = new ApiError(410, 'x', {
        status: 410,
        code: 'SURVEY_DELETED',
        surveyId: 'survey-1',
      });

      const message = describeSurveyImageLinkSaveFailure(error, groups);

      expect(message).toBe(
        '紐付けた写真の現場調査が削除されているため保存できません。該当するグループの写真を変更するか紐付けを解除してから保存してください。'
      );
      expect(message).not.toContain('再度お試しください');
    });
  });

  it('写真の紐付けに関わらない失敗（500・409・応答本文なし）は対象外である', () => {
    expect(
      describeSurveyImageLinkSaveFailure(new ApiError(500, 'x', { status: 500 }), groups)
    ).toBeNull();
    expect(
      describeSurveyImageLinkSaveFailure(new ApiError(409, 'x', { status: 409 }), groups)
    ).toBeNull();
    expect(describeSurveyImageLinkSaveFailure(new ApiError(404, 'x'), groups)).toBeNull();
    expect(describeSurveyImageLinkSaveFailure(new Error('x'), groups)).toBeNull();
  });
});

describe('describeDroppedSurveyImageLinks（取得時に落とした紐付け。Task 86.3）', () => {
  const draftGroups = [
    { id: 'group-a', name: '外壁', surveyImageId: 'image-a' },
    { id: 'group-b', name: '屋根', surveyImageId: null },
    { id: 'group-c', name: null, surveyImageId: null },
  ];

  it('落とした紐付けを持つグループを示し、保存で解除されることを告げる', () => {
    const message = describeDroppedSurveyImageLinks(['group-b', 'group-c'], draftGroups);

    expect(message).toBe(
      '参照できない写真の紐付けがあったため、次のグループの写真を表示していません: グループ「屋根」、3番目のグループ。保存するとこの紐付けは解除されます。'
    );
    expect(message).not.toContain('外壁');
  });

  it('落とした紐付けが無ければ告げない', () => {
    expect(describeDroppedSurveyImageLinks([], draftGroups)).toBeNull();
    expect(describeDroppedSurveyImageLinks(undefined, draftGroups)).toBeNull();
  });

  it('編集で写真を選び直した・グループを削除したものは告げない（告知が偽にならないように）', () => {
    // group-a は写真を持つ（選び直した）、group-z はドラフトに無い（削除した）
    expect(describeDroppedSurveyImageLinks(['group-a', 'group-z'], draftGroups)).toBeNull();
    // 同じ入力に告げるべきグループを1件足すと告げる（上の null が恒真でないこと）
    expect(describeDroppedSurveyImageLinks(['group-a', 'group-z', 'group-b'], draftGroups)).toBe(
      '参照できない写真の紐付けがあったため、次のグループの写真を表示していません: グループ「屋根」。保存するとこの紐付けは解除されます。'
    );
  });
});
