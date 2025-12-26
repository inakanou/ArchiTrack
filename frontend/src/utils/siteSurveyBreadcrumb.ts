/**
 * @fileoverview 現場調査ブレッドクラムユーティリティ
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 *
 * 現場調査関連画面用のパンくずナビゲーション項目を生成するユーティリティ関数を提供します。
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 */

import type { BreadcrumbItem } from '../components/common';

/**
 * 現場調査一覧画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト > [プロジェクト名] > 現場調査
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @returns パンくず項目の配列
 */
export function buildSiteSurveyListBreadcrumb(
  projectId: string,
  projectName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査' },
  ];
}

/**
 * 現場調査詳細画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト > [プロジェクト名] > 現場調査 > [調査名]
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @param surveyId - 現場調査ID (未使用だが将来の拡張のために受け取る)
 * @param surveyName - 現場調査名
 * @returns パンくず項目の配列
 */
export function buildSiteSurveyDetailBreadcrumb(
  projectId: string,
  projectName: string,
  _surveyId: string,
  surveyName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName },
  ];
}

/**
 * 現場調査新規作成画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト > [プロジェクト名] > 現場調査 > 新規作成
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @returns パンくず項目の配列
 */
export function buildSiteSurveyCreateBreadcrumb(
  projectId: string,
  projectName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査', path: `/projects/${projectId}/site-surveys` },
    { label: '新規作成' },
  ];
}

/**
 * 現場調査編集画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト > [プロジェクト名] > 現場調査 > [調査名] > 編集
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @param surveyId - 現場調査ID
 * @param surveyName - 現場調査名
 * @returns パンくず項目の配列
 */
export function buildSiteSurveyEditBreadcrumb(
  projectId: string,
  projectName: string,
  surveyId: string,
  surveyName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName, path: `/site-surveys/${surveyId}` },
    { label: '編集' },
  ];
}
