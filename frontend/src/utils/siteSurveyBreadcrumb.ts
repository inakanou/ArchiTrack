/**
 * @fileoverview 現場調査ブレッドクラムユーティリティ
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 * Task 50.1: 既存ブレッドクラム生成関数のラベルを更新する
 * Task 50.2: 画像プレビュー画面用ブレッドクラム生成関数を新設する
 *
 * 現場調査関連画面用のパンくずナビゲーション項目を生成するユーティリティ関数を提供します。
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: 一覧画面ブレッドクラム: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧
 * - 2.7: 詳細画面ブレッドクラム: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査
 * - 2.8: 画像プレビュー画面（閲覧モード）ブレッドクラム: ... > 現場調査 > 画像
 * - 2.9: 画像プレビュー画面（編集モード）ブレッドクラム: ... > 現場調査 > 画像
 * - 2.10: ブレッドクラム各項目クリックで対応画面へ遷移
 */

import type { BreadcrumbItem } from '../components/common';

/**
 * 現場調査一覧画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧
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
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査一覧' },
  ];
}

/**
 * 現場調査詳細画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @param _surveyId - 現場調査ID (未使用だが将来の拡張のために受け取る)
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
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査一覧', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName },
  ];
}

/**
 * 現場調査新規作成画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 新規作成
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
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査一覧', path: `/projects/${projectId}/site-surveys` },
    { label: '新規作成' },
  ];
}

/**
 * 現場調査編集画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 編集
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
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査一覧', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName, path: `/site-surveys/${surveyId}` },
    { label: '編集' },
  ];
}

/**
 * 画像プレビュー画面用のパンくずを生成
 *
 * 階層: ダッシュボード > プロジェクト一覧 > プロジェクト > 現場調査一覧 > 現場調査 > 画像
 * 閲覧モード・編集モード共通（2.8, 2.9）
 *
 * @param projectId - プロジェクトID
 * @param projectName - プロジェクト名
 * @param surveyId - 現場調査ID
 * @param surveyName - 現場調査名
 * @param imageName - 画像ファイル名
 * @returns パンくず項目の配列
 */
export function buildSiteSurveyImageBreadcrumb(
  projectId: string,
  projectName: string,
  surveyId: string,
  surveyName: string,
  imageName: string
): BreadcrumbItem[] {
  return [
    { label: 'ダッシュボード', path: '/' },
    { label: 'プロジェクト一覧', path: '/projects' },
    { label: projectName, path: `/projects/${projectId}` },
    { label: '現場調査一覧', path: `/projects/${projectId}/site-surveys` },
    { label: surveyName, path: `/site-surveys/${surveyId}` },
    { label: imageName },
  ];
}
