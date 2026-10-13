/**
 * @fileoverview 現調画像の紐付けの失敗を利用者へ伝える文言の組み立て
 *
 * Task 86.5: 現調画像の紐付けの失敗が利用者に伝わらない状態を解消する
 *
 * 数量表編集画面（`pages/QuantityTableEditPage.tsx`）が二つの場面で用いる。二つは別の設計である。
 *
 * 1. **保存の失敗の書き分け**（{@link describeSurveyImageLinkSaveFailure}）。
 *    保存（`PUT /api/quantity-tables/:id/save`）が現調画像の紐付けを拒む失敗は3種あり、
 *    いずれも恒久的で（再試行しても成功しない）、利用者が取るべき行動も違う。
 *    - 400 `QUANTITY_TABLE_VALIDATION_ERROR` + `groups[i].surveyImageId`: 他プロジェクトの写真
 *      （Task 86.1。原因のグループの名指しは Task 86.4）
 *    - 404 `SURVEY_IMAGE_NOT_FOUND` + `surveyImageId`: 写真が物理削除された（Task 86.2）
 *    - 410 `SURVEY_DELETED`: 写真の現場調査が論理削除された（Task 81.1）
 *    見分けは状態コードではなく応答の `code` で行う。同じ 404 でも `QUANTITY_TABLE_NOT_FOUND` は
 *    写真の失敗ではない。
 * 2. **取得時に落とした紐付けの告知**（{@link describeDroppedSurveyImageLinks}）。
 *    取得（`GET /api/quantity-tables/:id`）は他プロジェクトの写真を指す既存の紐付けを落とし
 *    （Task 86.3）、当該グループを `droppedSurveyImageLinkGroupIds` で名指す。
 *
 * 上の記述は Task 86.5 の時点のもので、Task 90.2 で現況ではなくなった。410 も 400 と同じ
 * `groups[i].surveyImageId` の名指しを持つようになったため、三つの失敗はいずれも原因のグループを
 * 示せる。ドラフトのグループが写真の現場調査を知らないことは変わらないが、引き当てるのは
 * 応答の `surveyId` ではなく payload 上の位置である。
 */

import { ApiError } from '../api/client';

/**
 * 文言の組み立てに用いるグループの最小の形
 *
 * 編集画面のドラフトのグループ（`DraftGroup`）が満たす。配列の位置は保存要求の
 * `groups[i]` の i と一致する（保存要求はドラフトのグループを並び順のまま写す）。
 */
export interface SurveyImageLinkFeedbackGroup {
  id: string | null;
  name: string | null;
  surveyImageId: string | null;
}

/** 保存経路の所属違反の 400 が原因のグループを名指すキー（Task 86.4） */
const GROUP_SURVEY_IMAGE_KEY_PATTERN = /^groups\[(\d+)\]\.surveyImageId$/;

/**
 * 恒久的な失敗に添える行動の案内
 *
 * Task 90.2 で数量グループカードへ紐付けの解除を置いたため、取れる行動は二つある。
 * 親の現場調査が論理削除された写真は選択候補に現れず「変更」では復旧できないため、
 * 解除を案内しなければ 410 の利用者には出口が無い。三つの失敗で同じ案内を用いる。
 */
const CHANGE_PHOTO_GUIDANCE = '写真を変更するか紐付けを解除してから保存してください。';

/** 応答本文（RFC 7807 の Problem Details）をオブジェクトとして取り出す */
function readProblemBody(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const body = error.response;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

/** グループを利用者が見分けられる名で示す。名称が無ければ並び順の位置で示す */
function labelGroup(group: SurveyImageLinkFeedbackGroup | undefined, index: number): string {
  const name = group?.name?.trim();
  return name ? `グループ「${name}」` : `${index + 1}番目のグループ`;
}

/**
 * 応答本文の `groups[i].surveyImageId` の名指しを、payload 上の位置の昇順で取り出す
 *
 * 所属違反の 400（Task 86.4）と親の論理削除の 410（Task 90.2）が同じ形の名指しを持つ。
 */
function readNamedGroupIndexes(body: Record<string, unknown>): number[] {
  return Object.keys(body)
    .map((key) => GROUP_SURVEY_IMAGE_KEY_PATTERN.exec(key))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

/**
 * 保存の失敗のうち、現調画像の紐付けに起因するものを利用者向けの文言へ書き分ける
 *
 * @param error - 保存（`saveQuantityTableDraft`）が投げた例外
 * @param groups - 保存要求の構築元であるドラフトのグループ（並び順のまま）
 * @returns 書き分けた文言。現調画像の紐付けに起因しない失敗なら null（呼び出し側の一般の文言へ委ねる）
 */
export function describeSurveyImageLinkSaveFailure(
  error: unknown,
  groups: readonly SurveyImageLinkFeedbackGroup[]
): string | null {
  const body = readProblemBody(error);
  if (body === null) {
    return null;
  }
  const status = (error as ApiError).statusCode;
  const code = body.code;

  if (status === 400 && code === 'QUANTITY_TABLE_VALIDATION_ERROR') {
    const indexes = readNamedGroupIndexes(body);
    if (indexes.length === 0) {
      // 写真の名指しを持たない 400（項目の範囲・計算の整合など）は本関数の対象外
      return null;
    }
    const labels = indexes.map((index) => labelGroup(groups[index], index));
    return `次のグループの写真はこの数量表のプロジェクトに属していないため保存できません: ${labels.join('、')}。${CHANGE_PHOTO_GUIDANCE}`;
  }

  if (status === 404 && code === 'SURVEY_IMAGE_NOT_FOUND') {
    const surveyImageId = typeof body.surveyImageId === 'string' ? body.surveyImageId : null;
    const labels =
      surveyImageId === null
        ? []
        : groups.flatMap((group, index) =>
            group.surveyImageId === surveyImageId ? [labelGroup(group, index)] : []
          );
    if (labels.length === 0) {
      return `紐付けた写真のうち削除されたものがあるため保存できません。該当するグループの${CHANGE_PHOTO_GUIDANCE}`;
    }
    return `次のグループの写真は削除されているため保存できません: ${labels.join('、')}。${CHANGE_PHOTO_GUIDANCE}`;
  }

  if (status === 410 && code === 'SURVEY_DELETED') {
    // Task 90.2: 応答が原因のグループを名指すようになった。名指しを持たない応答
    // （名指しを足す前の版のバックエンド）では、従来どおり行動だけを示す
    const indexes = readNamedGroupIndexes(body);
    if (indexes.length === 0) {
      return `紐付けた写真の現場調査が削除されているため保存できません。該当するグループの${CHANGE_PHOTO_GUIDANCE}`;
    }
    const labels = indexes.map((index) => labelGroup(groups[index], index));
    return `次のグループの写真は現場調査ごと削除されているため保存できません: ${labels.join('、')}。${CHANGE_PHOTO_GUIDANCE}`;
  }

  return null;
}

/**
 * 取得時に落とした紐付けを利用者へ告げる文言を組み立てる
 *
 * 名指されたグループのうち、ドラフトに残っていて写真を持たないものだけを告げる。
 * 編集で写真を選び直したグループや削除したグループを告げると、告知が偽になるためである。
 *
 * 文言は「他のプロジェクト」と言わない。他プロジェクトの画像が紐付いていた事実を告げると、
 * 利用者の権限の外にある資源の存在を示唆する（Task 86.3 の記録）。取るべき行動
 * （写真を選び直す、またはそのまま保存して解除する）は理由を知らなくても変わらない。
 *
 * @param droppedGroupIds - 取得の応答の `droppedSurveyImageLinkGroupIds`（持たない応答では undefined）
 * @param groups - 現在のドラフトのグループ（並び順のまま）
 * @returns 告知の文言。告げるグループが無ければ null
 */
export function describeDroppedSurveyImageLinks(
  droppedGroupIds: readonly string[] | undefined,
  groups: readonly SurveyImageLinkFeedbackGroup[]
): string | null {
  if (droppedGroupIds === undefined || droppedGroupIds.length === 0) {
    return null;
  }
  const dropped = new Set(droppedGroupIds);
  const labels = groups.flatMap((group, index) =>
    group.id !== null && dropped.has(group.id) && group.surveyImageId === null
      ? [labelGroup(group, index)]
      : []
  );
  if (labels.length === 0) {
    return null;
  }
  return `参照できない写真の紐付けがあったため、次のグループの写真を表示していません: ${labels.join('、')}。保存するとこの紐付けは解除されます。`;
}
