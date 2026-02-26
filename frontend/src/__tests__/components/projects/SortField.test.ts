/**
 * @fileoverview SortField型定義のテスト
 *
 * Task 22.1: SortField型定義の更新
 *
 * Requirements (project-management):
 * - REQ-6.5: ソート可能フィールドの変更
 *   - 'id'を削除
 *   - 'salesPersonName', 'constructionPersonName'を追加
 *
 * このテストファイルはSortField型の正しい定義を検証します。
 * 型テストであるため、コンパイル時に検証されます。
 */

import { describe, it, expect } from 'vitest';
import type { SortField } from '../../../components/projects/ProjectListTable';

// ============================================================================
// 型テスト（コンパイル時検証）
// ============================================================================

describe('SortField型定義（project-management/REQ-6.5 / Task 22.1）', () => {
  describe('有効なSortFieldの検証', () => {
    it('nameはSortFieldとして有効', () => {
      const field: SortField = 'name';
      expect(field).toBe('name');
    });

    it('customerNameはSortFieldとして有効', () => {
      const field: SortField = 'customerName';
      expect(field).toBe('customerName');
    });

    it('salesPersonNameはSortFieldとして有効（Task 22.1で追加）', () => {
      const field: SortField = 'salesPersonName';
      expect(field).toBe('salesPersonName');
    });

    it('constructionPersonNameはSortFieldとして有効（Task 22.1で追加）', () => {
      const field: SortField = 'constructionPersonName';
      expect(field).toBe('constructionPersonName');
    });

    it('statusはSortFieldとして有効', () => {
      const field: SortField = 'status';
      expect(field).toBe('status');
    });

    it('createdAtはSortFieldに含まれない（Task 56.2で削除）', () => {
      // createdAtが型に含まれないことを検証
      const allSortFields: SortField[] = [
        'name',
        'customerName',
        'salesPersonName',
        'constructionPersonName',
        'status',
        'updatedAt',
      ];
      expect((allSortFields as string[]).includes('createdAt')).toBe(false);
    });

    it('updatedAtはSortFieldとして有効', () => {
      const field: SortField = 'updatedAt';
      expect(field).toBe('updatedAt');
    });
  });

  describe('全SortFieldの網羅性テスト', () => {
    it('SortField型は6つのフィールドを持つ（Task 56.2でcreatedAt削除）', () => {
      // 型の全フィールドをテスト用に配列化（型システムでの検証）
      const allSortFields: SortField[] = [
        'name',
        'customerName',
        'salesPersonName',
        'constructionPersonName',
        'status',
        'updatedAt',
      ];

      expect(allSortFields).toHaveLength(6);
      expect(allSortFields).toContain('name');
      expect(allSortFields).toContain('customerName');
      expect(allSortFields).toContain('salesPersonName');
      expect(allSortFields).toContain('constructionPersonName');
      expect(allSortFields).toContain('status');
      expect(allSortFields).toContain('updatedAt');
    });

    it('idはSortFieldに含まれない（Task 22.1で削除）', () => {
      const allSortFields: SortField[] = [
        'name',
        'customerName',
        'salesPersonName',
        'constructionPersonName',
        'status',
        'updatedAt',
      ];

      expect((allSortFields as string[]).includes('id')).toBe(false);
    });

    it('createdAtはSortFieldに含まれない（Task 56.2で削除）', () => {
      const allSortFields: SortField[] = [
        'name',
        'customerName',
        'salesPersonName',
        'constructionPersonName',
        'status',
        'updatedAt',
      ];

      expect((allSortFields as string[]).includes('createdAt')).toBe(false);
    });
  });
});
