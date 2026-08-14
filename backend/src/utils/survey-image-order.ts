/**
 * @fileoverview 現場調査画像の取得順序
 *
 * Task 115.20 / Requirements 4.10（画像一覧を固定の表示順序で表示する）
 *
 * displayOrderは同一現場調査内で一意である保証がない（実データでも重複が観測されている）。
 * データベースは並び替えの鍵で決まらない行の順序を保証しないため、displayOrderだけを
 * 鍵にすると同値の画像同士の並びが実行ごとに変わり得る。
 *
 * そこで作成日時と、必ず一意になる識別子を第二・第三の鍵として加え、
 * 重複が残っている既存データに対しても並びが一意に定まるようにする。
 * 画像の取得順序を決める全ての経路でこの定義を共有し、経路ごとの食い違いを防ぐ。
 *
 * @module utils/survey-image-order
 */

import type { Prisma } from '../generated/prisma/client.js';

/**
 * 現場調査画像の表示順序（昇順）
 *
 * 第一の鍵: displayOrder（利用者が決める表示順序）
 * 第二の鍵: createdAt（登録順。displayOrderが重複する場合の自然な並び）
 * 第三の鍵: id（一意。createdAtまで同値でも並びを確定させる）
 */
export const SURVEY_IMAGE_ORDER_BY: Prisma.SurveyImageOrderByWithRelationInput[] = [
  { displayOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];
