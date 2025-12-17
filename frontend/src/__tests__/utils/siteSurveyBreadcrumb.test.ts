/**
 * @fileoverview 現場調査ブレッドクラムユーティリティテスト
 *
 * Task 10.2: ブレッドクラムナビゲーションを実装する
 *
 * Requirements:
 * - 2.5: 全ての現場調査関連画面にブレッドクラムナビゲーションを表示する
 * - 2.6: ブレッドクラムで「プロジェクト名 > 現場調査一覧 > 現場調査名」の階層を表示する
 * - 2.7: ユーザーがブレッドクラムの各項目をクリックすると対応する画面に遷移する
 */

import { describe, it, expect } from 'vitest';
import {
  buildSiteSurveyListBreadcrumb,
  buildSiteSurveyDetailBreadcrumb,
  buildSiteSurveyCreateBreadcrumb,
  buildSiteSurveyEditBreadcrumb,
} from '../../utils/siteSurveyBreadcrumb';

describe('siteSurveyBreadcrumb', () => {
  describe('buildSiteSurveyListBreadcrumb', () => {
    it('現場調査一覧用のパンくずを生成すること', () => {
      const result = buildSiteSurveyListBreadcrumb('project-123', 'テストプロジェクト');

      expect(result).toEqual([
        { label: 'ダッシュボード', path: '/' },
        { label: 'プロジェクト', path: '/projects' },
        { label: 'テストプロジェクト', path: '/projects/project-123' },
        { label: '現場調査' },
      ]);
    });

    it('プロジェクト名に特殊文字が含まれていても正しく処理すること', () => {
      const result = buildSiteSurveyListBreadcrumb('project-456', '株式会社テスト & パートナーズ');

      expect(result[2]?.label).toBe('株式会社テスト & パートナーズ');
      expect(result[2]?.path).toBe('/projects/project-456');
    });

    it('プロジェクトIDが空の場合でもパスを生成すること', () => {
      const result = buildSiteSurveyListBreadcrumb('', '名前のないプロジェクト');

      expect(result[2]?.path).toBe('/projects/');
    });
  });

  describe('buildSiteSurveyDetailBreadcrumb', () => {
    it('現場調査詳細用のパンくずを生成すること（Requirements 2.5, 2.6）', () => {
      const result = buildSiteSurveyDetailBreadcrumb(
        'project-123',
        'テストプロジェクト',
        'survey-456',
        '第1回現場調査'
      );

      expect(result).toEqual([
        { label: 'ダッシュボード', path: '/' },
        { label: 'プロジェクト', path: '/projects' },
        { label: 'テストプロジェクト', path: '/projects/project-123' },
        { label: '現場調査', path: '/projects/project-123/site-surveys' },
        { label: '第1回現場調査' },
      ]);
    });

    it('各項目にクリック可能なパスが設定されていること（Requirements 2.7）', () => {
      const result = buildSiteSurveyDetailBreadcrumb(
        'proj-1',
        'プロジェクトA',
        'survey-1',
        '調査A'
      );

      // ダッシュボードへのパス
      expect(result[0]?.path).toBe('/');
      // プロジェクト一覧へのパス
      expect(result[1]?.path).toBe('/projects');
      // プロジェクト詳細へのパス
      expect(result[2]?.path).toBe('/projects/proj-1');
      // 現場調査一覧へのパス
      expect(result[3]?.path).toBe('/projects/proj-1/site-surveys');
      // 最後の項目はリンクなし（現在のページ）
      expect(result[4]?.path).toBeUndefined();
    });

    it('長いプロジェクト名・調査名を正しく表示すること', () => {
      const longProjectName = 'これは非常に長いプロジェクト名でテストするためのものです';
      const longSurveyName = '第100回定期現場調査（詳細確認含む）';

      const result = buildSiteSurveyDetailBreadcrumb(
        'long-project',
        longProjectName,
        'long-survey',
        longSurveyName
      );

      expect(result[2]?.label).toBe(longProjectName);
      expect(result[4]?.label).toBe(longSurveyName);
    });
  });

  describe('buildSiteSurveyCreateBreadcrumb', () => {
    it('現場調査新規作成用のパンくずを生成すること', () => {
      const result = buildSiteSurveyCreateBreadcrumb('project-789', '新規プロジェクト');

      expect(result).toEqual([
        { label: 'ダッシュボード', path: '/' },
        { label: 'プロジェクト', path: '/projects' },
        { label: '新規プロジェクト', path: '/projects/project-789' },
        { label: '現場調査', path: '/projects/project-789/site-surveys' },
        { label: '新規作成' },
      ]);
    });

    it('最後の項目「新規作成」はリンクなしであること', () => {
      const result = buildSiteSurveyCreateBreadcrumb('proj', 'プロジェクト');

      const lastItem = result[result.length - 1];
      expect(lastItem?.label).toBe('新規作成');
      expect(lastItem?.path).toBeUndefined();
    });
  });

  describe('buildSiteSurveyEditBreadcrumb', () => {
    it('現場調査編集用のパンくずを生成すること', () => {
      const result = buildSiteSurveyEditBreadcrumb(
        'project-abc',
        '編集テストプロジェクト',
        'survey-xyz',
        '編集対象調査'
      );

      expect(result).toEqual([
        { label: 'ダッシュボード', path: '/' },
        { label: 'プロジェクト', path: '/projects' },
        { label: '編集テストプロジェクト', path: '/projects/project-abc' },
        { label: '現場調査', path: '/projects/project-abc/site-surveys' },
        { label: '編集対象調査', path: '/site-surveys/survey-xyz' },
        { label: '編集' },
      ]);
    });

    it('調査名から詳細ページへ遷移できるようパスが設定されていること', () => {
      const result = buildSiteSurveyEditBreadcrumb('p1', 'P1', 's1', 'S1');

      // 調査名にパスが設定されている（詳細ページへのリンク）
      expect(result[4]?.path).toBe('/site-surveys/s1');
      // 最後の「編集」はリンクなし
      expect(result[5]?.path).toBeUndefined();
    });
  });

  describe('共通仕様', () => {
    it('全てのビルダーがダッシュボードをルートに持つこと', () => {
      const listBreadcrumb = buildSiteSurveyListBreadcrumb('p', 'P');
      const detailBreadcrumb = buildSiteSurveyDetailBreadcrumb('p', 'P', 's', 'S');
      const createBreadcrumb = buildSiteSurveyCreateBreadcrumb('p', 'P');
      const editBreadcrumb = buildSiteSurveyEditBreadcrumb('p', 'P', 's', 'S');

      [listBreadcrumb, detailBreadcrumb, createBreadcrumb, editBreadcrumb].forEach((breadcrumb) => {
        expect(breadcrumb[0]).toEqual({ label: 'ダッシュボード', path: '/' });
      });
    });

    it('全てのビルダーがプロジェクト一覧を2番目に持つこと', () => {
      const listBreadcrumb = buildSiteSurveyListBreadcrumb('p', 'P');
      const detailBreadcrumb = buildSiteSurveyDetailBreadcrumb('p', 'P', 's', 'S');
      const createBreadcrumb = buildSiteSurveyCreateBreadcrumb('p', 'P');
      const editBreadcrumb = buildSiteSurveyEditBreadcrumb('p', 'P', 's', 'S');

      [listBreadcrumb, detailBreadcrumb, createBreadcrumb, editBreadcrumb].forEach((breadcrumb) => {
        expect(breadcrumb[1]).toEqual({ label: 'プロジェクト', path: '/projects' });
      });
    });
  });
});
